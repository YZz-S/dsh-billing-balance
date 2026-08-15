/**
 * dsh-billing-balance — Host 半边（DeepSeek Harness 动态 Cordis 插件）
 *
 * 职责：读取 DSH 凭据 → 抓取 DeepSeek 余额与火山方舟 Coding/Agent Plan 额度窗口
 * → 通过 Package 私有 RPC 提供给 Client 半边。
 * RPC 方法：get-status（读缓存）/ refresh（强制重拉）/ set-volc-keys（保存或清除火山 AK/SK 后重拉）
 *
 * 用法：将本文件内容作为 cordis_define 的 code.host 传入。
 */
return {
  inject: ['timer'],
  apply(ctx) {
    const fsSvc = ctx.get('fs')
    const settingsSvc = ctx.get('settings')
    const subprocessSvc = ctx.get('subprocess')
    const credSvc = ctx.get('credentials')
    const sandboxPolicySvc = ctx.get('sandboxPolicy')

    const cwdHint = sandboxPolicySvc !== undefined ? sandboxPolicySvc.workspaceRoot : 'C:\\'
    const state = { deepseek: null, volc: null, at: 0, keys: null }
    let inFlight = null
    let nodeExe = ''

    async function readCredentials() {
      const out = { deepseekKey: '', volcAk: '', volcSk: '', region: 'cn-beijing', error: '' }
      if (settingsSvc === undefined || fsSvc === undefined) { out.error = 'settings/fs 服务不可用'; return out }
      try {
        const doc = await settingsSvc.prepareDocument()
        if (doc === undefined) { out.error = '找不到 settings 文档'; return out }
        const base = doc.replace(/[\\/][^\\/]+$/, '')
        const credTarget = await fsSvc.resolve(base + '/.credentials.yaml')
        if (credTarget !== undefined) {
          const text = await fsSvc.readText(credTarget)
          const grab = function (name) {
            const m = text.match(new RegExp('^\\s*' + name + '\\s*:\\s*(\\S+)', 'm'))
            return m ? m[1] : ''
          }
          out.deepseekKey = grab('DEEPSEEK_API_KEY')
          out.volcAk = grab('VOLC_ACCESS_KEY') || grab('VOLCENGINE_ACCESS_KEY')
          out.volcSk = grab('VOLC_SECRET_KEY') || grab('VOLCENGINE_SECRET_KEY')
        }
        const setTarget = await fsSvc.resolve(doc)
        if (setTarget !== undefined) {
          const text = await fsSvc.readText(setTarget)
          const m = text.match(/baseURL:\s*https:\/\/ark\.([a-z0-9-]+)\.volces\.com/)
          if (m) out.region = m[1]
        }
      } catch (e) {
        out.error = '读取配置失败: ' + String(e && e.message)
      }
      return out
    }

    async function resolveNode() {
      if (nodeExe) return nodeExe
      if (subprocessSvc === undefined) return ''
      for (const cand of ['node', 'node.exe']) {
        try {
          const exe = await subprocessSvc.resolveExecutable(cand)
          if (exe) { nodeExe = exe; return exe }
        } catch (e) { }
      }
      return ''
    }

    async function runNode(script, args, timeoutMs) {
      if (subprocessSvc === undefined) return { exitCode: -1, text: '', errText: '无 subprocess 服务' }
      const exe = await resolveNode()
      if (!exe) return { exitCode: -1, text: '', errText: '找不到 node 可执行文件' }
      try {
        const handle = subprocessSvc.spawn({
          argv: [exe, '-e', script].concat(args),
          cwd: cwdHint,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 262144 }, stderr: { maxBytes: 65536 } },
          graceMs: timeoutMs || 45000,
        })
        const outcome = await handle.done
        const out = handle.collected.stdout
        const err = handle.collected.stderr
        return { exitCode: outcome.exitCode, text: out ? out.readFrom(0).text : '', errText: err ? err.readFrom(0).text : '' }
      } catch (e) {
        return { exitCode: -2, text: '', errText: 'spawn 失败: ' + String(e && e.message) }
      }
    }

    async function fetchDeepSeek(creds) {
      if (!creds.deepseekKey) return { ok: false, at: 0, balances: [], error: '未配置 DEEPSEEK_API_KEY（~/.dsh/.credentials.yaml）' }
      const script = [
        'async function main() {',
        '  try {',
        '    const r = await fetch(process.argv[1], { headers: { Authorization: "Bearer " + process.argv[2] } })',
        '    const t = await r.text()',
        '    console.log(JSON.stringify({ status: r.status, at: Date.now(), text: t }))',
        '  } catch (e) {',
        '    console.log(JSON.stringify({ status: -1, at: Date.now(), text: "ERR " + (e && e.message) }))',
        '  }',
        '}',
        'main()',
      ].join('\n')
      const res = await runNode(script, ['https://api.deepseek.com/user/balance', creds.deepseekKey], 30000)
      if (res.exitCode !== 0) return { ok: false, at: 0, balances: [], error: String(res.errText || res.text || 'node 退出码 ' + res.exitCode).slice(0, 300) }
      try {
        const parsed = JSON.parse(res.text.trim())
        if (parsed.status !== 200) {
          let msg = 'HTTP ' + parsed.status
          try {
            const b = JSON.parse(parsed.text)
            if (b && b.error && b.error.message) msg += ': ' + b.error.message
          } catch (e) { msg += ': ' + String(parsed.text).slice(0, 200) }
          return { ok: false, at: parsed.at || 0, balances: [], error: msg }
        }
        const body = JSON.parse(parsed.text)
        const balances = []
        if (Array.isArray(body.balance_infos)) {
          for (const b of body.balance_infos) {
            balances.push({
              currency: String(b.currency || ''),
              total: String(b.total_balance == null ? '' : b.total_balance),
              granted: String(b.granted_balance == null ? '' : b.granted_balance),
              toppedUp: String(b.topped_up_balance == null ? '' : b.topped_up_balance),
            })
          }
        }
        return { ok: true, at: parsed.at || 0, isAvailable: body.is_available === true, balances: balances, error: '' }
      } catch (e) {
        return { ok: false, at: 0, balances: [], error: '响应解析失败: ' + String(e && e.message) }
      }
    }

    async function fetchVolc(creds) {
      if (!creds.volcAk || !creds.volcSk) {
        return { ok: false, at: 0, keysPresent: false, plans: [], error: '未配置火山访问密钥（AK/SK），可在下方输入保存' }
      }
      const script = [
        'const crypto = require("crypto")',
        'function sha256hex(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex") }',
        'function hmac(key, data) { return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex") }',
        'function hmacBuf(keyHex, data) { return crypto.createHmac("sha256", Buffer.from(keyHex, "hex")).update(data, "utf8").digest("hex") }',
        'function uriEncode(s) { return encodeURIComponent(s).replace(/[!\'()*]/g, function (c) { return "%" + c.charCodeAt(0).toString(16).toUpperCase() }) }',
        'async function call(region, ak, sk, action) {',
        '  const pairs = [["Action", action], ["Region", region], ["Version", "2024-01-01"]]',
        '  pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0 })',
        '  const canonicalQuery = pairs.map(function (p) { return uriEncode(p[0]) + "=" + uriEncode(p[1]) }).join("&")',
        '  const xdate = new Date().toISOString().replace(/[-:]/g, "").replace(/\\.\\d{3}Z$/, "Z")',
        '  const shortDate = xdate.slice(0, 8)',
        '  const body = ""',
        '  const xContent = sha256hex(body)',
        '  const host = "open.volcengineapi.com"',
        '  const signedHeaders = "host;x-date;x-content-sha256;content-type"',
        '  const contentType = "application/json; charset=utf-8"',
        '  const canonicalHeaders = "host:" + host + "\\n" + "x-date:" + xdate + "\\n" + "x-content-sha256:" + xContent + "\\n" + "content-type:" + contentType + "\\n"',
        '  const canonicalRequest = "POST\\n/\\n" + canonicalQuery + "\\n" + canonicalHeaders + "\\n" + signedHeaders + "\\n" + xContent',
        '  const scope = shortDate + "/" + region + "/ark/request"',
        '  const stringToSign = "HMAC-SHA256\\n" + xdate + "\\n" + scope + "\\n" + sha256hex(canonicalRequest)',
        '  const kDate = hmac(sk, shortDate)',
        '  const kRegion = hmacBuf(kDate, region)',
        '  const kService = hmacBuf(kRegion, "ark")',
        '  const kSigning = hmacBuf(kService, "request")',
        '  const signature = hmacBuf(kSigning, stringToSign)',
        '  const authorization = "HMAC-SHA256 Credential=" + ak + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature',
        '  const ctl = new AbortController()',
        '  const to = setTimeout(function () { ctl.abort() }, 25000)',
        '  try {',
        '    const r = await fetch("https://" + host + "/?" + canonicalQuery, {',
        '      method: "POST",',
        '      headers: { "X-Date": xdate, "X-Content-Sha256": xContent, "Content-Type": contentType, "Authorization": authorization },',
        '      body: body,',
        '      signal: ctl.signal,',
        '    })',
        '    const t = await r.text()',
        '    return { status: r.status, text: t }',
        '  } finally { clearTimeout(to) }',
        '}',
        'function parsePlan(product, resp) {',
        '  let body = null',
        '  try { body = JSON.parse(resp.text) } catch (e) { return { product: product, periods: [], error: "响应解析失败" } }',
        '  if (body && body.ResponseMetadata && body.ResponseMetadata.Error) {',
        '    const e = body.ResponseMetadata.Error',
        '    return { product: product, periods: [], error: String(e.Code || "") + ": " + String(e.Message || "") }',
        '  }',
        '  const result = (body && body.Result) || body || {}',
        '  const arr = Array.isArray(result.QuotaUsage) ? result.QuotaUsage : (Array.isArray(result.Usages) ? result.Usages : (Array.isArray(result.Details) ? result.Details : []))',
        '  const periods = []',
        '  for (let i = 0; i < arr.length; i++) {',
        '    const item = arr[i]',
        '    const level = String(item.Level || item.Type || item.Period || item.Label || item.Window || "")',
        '    if (!level) continue',
        '    let pct = item.Percent',
        '    if (pct == null) pct = item.UsedPercent',
        '    if (pct == null) pct = item.UsagePercent',
        '    if (typeof pct !== "number") pct = parseFloat(pct)',
        '    if (typeof pct !== "number" || !isFinite(pct)) pct = 0',
        '    let resetMs = 0',
        '    const rt = item.ResetTime != null ? item.ResetTime : item.ResetTimestamp',
        '    if (rt != null) {',
        '      if (typeof rt === "string") { const d = Date.parse(rt); if (isFinite(d)) resetMs = d }',
        '      else if (typeof rt === "number" && rt > 0) { resetMs = rt < 1000000000000 ? rt * 1000 : rt }',
        '    }',
        '    let used = null, total = null',
        '    if (typeof item.Used === "number" && isFinite(item.Used)) used = item.Used',
        '    if (typeof item.Total === "number" && isFinite(item.Total)) total = item.Total',
        '    periods.push({ level: level, percent: Math.round(pct * 10) / 10, used: used, total: total, resetMs: resetMs })',
        '  }',
        '  return { product: product, periods: periods, error: "" }',
        '}',
        'async function main() {',
        '  const region = process.argv[1], ak = process.argv[2], sk = process.argv[3]',
        '  try {',
        '    const coding = await call(region, ak, sk, "GetCodingPlanUsage")',
        '    const codingPlan = parsePlan("coding-plan", coding)',
        '    if (coding.status !== 200 && !codingPlan.error) codingPlan.error = "HTTP " + coding.status',
        '    const afp = await call(region, ak, sk, "GetAFPUsage")',
        '    const afpPlan = parsePlan("agent-plan", afp)',
        '    if (afp.status !== 200 && !afpPlan.error) afpPlan.error = "HTTP " + afp.status',
        '    console.log(JSON.stringify({ status: 200, at: Date.now(), plans: [codingPlan, afpPlan] }))',
        '  } catch (e) {',
        '    console.log(JSON.stringify({ status: -1, at: Date.now(), text: "ERR " + (e && e.message) }))',
        '  }',
        '}',
        'main()',
      ].join('\n')
      const res = await runNode(script, [creds.region, creds.volcAk, creds.volcSk], 60000)
      if (res.exitCode !== 0) return { ok: false, at: 0, keysPresent: true, plans: [], error: String(res.errText || res.text || 'node 退出码 ' + res.exitCode).slice(0, 300) }
      try {
        const parsed = JSON.parse(res.text.trim())
        if (parsed.status !== 200) return { ok: false, at: parsed.at || 0, keysPresent: true, plans: [], error: 'HTTP ' + parsed.status + ' ' + String(parsed.text || '').slice(0, 300) }
        return { ok: true, at: parsed.at || 0, keysPresent: true, plans: parsed.plans || [], error: '' }
      } catch (e) {
        return { ok: false, at: 0, keysPresent: true, plans: [], error: '响应解析失败: ' + String(e && e.message) }
      }
    }

    async function refresh() {
      if (inFlight !== null) return inFlight
      inFlight = (async () => {
        const creds = await readCredentials()
        state.keys = { deepseek: !!creds.deepseekKey, volc: !!(creds.volcAk && creds.volcSk) }
        const results = await Promise.all([fetchDeepSeek(creds), fetchVolc(creds)])
        state.deepseek = results[0]
        state.volc = results[1]
        state.at = Math.max(results[0].at || 0, results[1].at || 0, 0)
        return snapshot()
      })().catch((e) => {
        return { error: '刷新失败: ' + String(e && e.message) }
      })
      try { return await inFlight } finally { inFlight = null }
    }

    function snapshot() {
      return { deepseek: state.deepseek, volc: state.volc, at: state.at, keys: state.keys, region: 'cn-beijing' }
    }

    harness.handle('get-status', async () => snapshot())
    harness.handle('refresh', async () => { await refresh(); return snapshot() })
    harness.handle('set-volc-keys', async (args) => {
      if (credSvc === undefined) return { ok: false, error: 'credentials 服务不可用，请手动编辑 ~/.dsh/.credentials.yaml' }
      const ak = args && typeof args.ak === 'string' ? args.ak.trim() : ''
      const sk = args && typeof args.sk === 'string' ? args.sk.trim() : ''
      if ((ak && !sk) || (!ak && sk)) return { ok: false, error: 'AK 与 SK 需要同时填写或同时留空' }
      try {
        if (ak && sk) {
          await credSvc.set('VOLC_ACCESS_KEY', ak)
          await credSvc.set('VOLC_SECRET_KEY', sk)
        } else {
          await credSvc.unset('VOLC_ACCESS_KEY')
          await credSvc.unset('VOLC_SECRET_KEY')
        }
      } catch (e) {
        return { ok: false, error: '保存失败: ' + String(e && e.message) }
      }
      await refresh()
      return snapshot()
    })

    ctx.interval(() => { refresh().catch(() => {}) }, 60000)
    refresh().catch(() => {})
  },
}
