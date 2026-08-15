/**
 * dsh-billing-balance — Host 半边（可安装的 dsh.bundle 插件）
 *
 * 职责：读取 DSH 凭据服务 → 抓取 DeepSeek 余额与火山方舟 Coding/Agent Plan 额度窗口
 * → 通过 /api/billing-balance/* 路由提供给浏览器 Client 半边。
 *
 * 安装版（dsh plugin add github:YZz-S/dsh-billing-balance）由 cordis.patch.yml
 * 插入本插件行；安装版宿主进程自带 fetch，因此不再需要动态插件的子进程 node -e 方案。
 */
import { createHash, createHmac } from 'node:crypto'

export const name = 'billing-balance'
export const inject = ['webServer']

function sha256hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex')
}

function hmacBuf(keyHex, data) {
  return createHmac('sha256', Buffer.from(keyHex, 'hex')).update(data, 'utf8').digest('hex')
}

function uriEncode(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req, cap) {
  cap = cap || 4096
  return new Promise((resolve) => {
    let size = 0
    const parts = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= cap) parts.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

export function apply(ctx) {
  const credSvc = ctx.get('credentials')
  const settingsSvc = ctx.get('settings')
  const fsSvc = ctx.get('fs')

  const state = { deepseek: null, volc: null, at: 0, keys: null, region: 'cn-beijing' }
  let inFlight = null

  async function readCredentials() {
    const out = { deepseekKey: '', volcAk: '', volcSk: '', region: 'cn-beijing', error: '' }
    if (credSvc === undefined) { out.error = 'credentials 服务不可用'; return out }
    try {
      const ds = await credSvc.resolve('DEEPSEEK_API_KEY')
      if (ds !== undefined && typeof ds.value === 'string') out.deepseekKey = ds.value
      let ak = await credSvc.resolve('VOLC_ACCESS_KEY')
      if (ak === undefined) ak = await credSvc.resolve('VOLCENGINE_ACCESS_KEY')
      let sk = await credSvc.resolve('VOLC_SECRET_KEY')
      if (sk === undefined) sk = await credSvc.resolve('VOLCENGINE_SECRET_KEY')
      if (ak !== undefined && typeof ak.value === 'string') out.volcAk = ak.value
      if (sk !== undefined && typeof sk.value === 'string') out.volcSk = sk.value
      if (settingsSvc !== undefined && fsSvc !== undefined) {
        const doc = await settingsSvc.prepareDocument()
        if (doc !== undefined) {
          const setTarget = await fsSvc.resolve(doc)
          if (setTarget !== undefined) {
            const text = await fsSvc.readText(setTarget)
            const m = text.match(/baseURL:\s*https:\/\/ark\.([a-z0-9-]+)\.volces\.com/)
            if (m) out.region = m[1]
          }
        }
      }
    } catch (e) {
      out.error = '读取配置失败: ' + String(e && e.message)
    }
    return out
  }

  async function fetchDeepSeek(creds) {
    if (!creds.deepseekKey) {
      return { ok: false, at: 0, balances: [], error: '未配置 DEEPSEEK_API_KEY（~/.dsh/.credentials.yaml）' }
    }
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 30000)
    try {
      const r = await fetch('https://api.deepseek.com/user/balance', {
        headers: { authorization: 'Bearer ' + creds.deepseekKey },
        signal: ctl.signal,
      })
      const text = await r.text()
      if (r.status !== 200) {
        let msg = 'HTTP ' + r.status
        try {
          const b = JSON.parse(text)
          if (b && b.error && b.error.message) msg += ': ' + b.error.message
        } catch (e) { msg += ': ' + String(text).slice(0, 200) }
        return { ok: false, at: Date.now(), balances: [], error: msg }
      }
      const body = JSON.parse(text)
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
      return { ok: true, at: Date.now(), isAvailable: body.is_available === true, balances: balances, error: '' }
    } catch (e) {
      return { ok: false, at: 0, balances: [], error: String(e && e.message).slice(0, 300) }
    } finally {
      clearTimeout(to)
    }
  }

  // 火山 OpenAPI V4 签名（HMAC-SHA256，credential scope {date}/{region}/ark/request）
  async function volcCall(region, ak, sk, action) {
    const pairs = [['Action', action], ['Region', region], ['Version', '2024-01-01']]
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    const canonicalQuery = pairs.map((p) => uriEncode(p[0]) + '=' + uriEncode(p[1])).join('&')
    const xdate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const shortDate = xdate.slice(0, 8)
    const body = ''
    const xContent = sha256hex(body)
    const host = 'open.volcengineapi.com'
    const signedHeaders = 'host;x-date;x-content-sha256;content-type'
    const contentType = 'application/json; charset=utf-8'
    const canonicalHeaders = 'host:' + host + '\n' + 'x-date:' + xdate + '\n' + 'x-content-sha256:' + xContent + '\n' + 'content-type:' + contentType + '\n'
    const canonicalRequest = 'POST\n/\n' + canonicalQuery + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + xContent
    const scope = shortDate + '/' + region + '/ark/request'
    const stringToSign = 'HMAC-SHA256\n' + xdate + '\n' + scope + '\n' + sha256hex(canonicalRequest)
    const kDate = hmac(sk, shortDate)
    const kRegion = hmacBuf(kDate, region)
    const kService = hmacBuf(kRegion, 'ark')
    const kSigning = hmacBuf(kService, 'request')
    const signature = hmacBuf(kSigning, stringToSign)
    const authorization = 'HMAC-SHA256 Credential=' + ak + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 25000)
    try {
      const r = await fetch('https://' + host + '/?' + canonicalQuery, {
        method: 'POST',
        headers: {
          'X-Date': xdate,
          'X-Content-Sha256': xContent,
          'Content-Type': contentType,
          'Authorization': authorization,
        },
        body: body,
        signal: ctl.signal,
      })
      const text = await r.text()
      return { status: r.status, text: text }
    } finally {
      clearTimeout(to)
    }
  }

  function parsePlan(product, resp) {
    let body = null
    try { body = JSON.parse(resp.text) } catch (e) { return { product: product, periods: [], error: '响应解析失败' } }
    if (body && body.ResponseMetadata && body.ResponseMetadata.Error) {
      const e = body.ResponseMetadata.Error
      return { product: product, periods: [], error: String(e.Code || '') + ': ' + String(e.Message || '') }
    }
    const result = (body && body.Result) || body || {}
    const arr = Array.isArray(result.QuotaUsage) ? result.QuotaUsage : (Array.isArray(result.Usages) ? result.Usages : (Array.isArray(result.Details) ? result.Details : []))
    const periods = []
    for (const item of arr) {
      const level = String(item.Level || item.Type || item.Period || item.Label || item.Window || '')
      if (!level) continue
      let pct = item.Percent
      if (pct == null) pct = item.UsedPercent
      if (pct == null) pct = item.UsagePercent
      if (typeof pct !== 'number') pct = parseFloat(pct)
      if (typeof pct !== 'number' || !isFinite(pct)) pct = 0
      let resetMs = 0
      const rt = item.ResetTime != null ? item.ResetTime : item.ResetTimestamp
      if (rt != null) {
        if (typeof rt === 'string') { const d = Date.parse(rt); if (isFinite(d)) resetMs = d }
        else if (typeof rt === 'number' && rt > 0) { resetMs = rt < 1000000000000 ? rt * 1000 : rt }
      }
      let used = null
      let total = null
      if (typeof item.Used === 'number' && isFinite(item.Used)) used = item.Used
      if (typeof item.Total === 'number' && isFinite(item.Total)) total = item.Total
      periods.push({ level: level, percent: Math.round(pct * 10) / 10, used: used, total: total, resetMs: resetMs })
    }
    return { product: product, periods: periods, error: '' }
  }

  async function fetchVolc(creds) {
    if (!creds.volcAk || !creds.volcSk) {
      return { ok: false, at: 0, keysPresent: false, plans: [], error: '未配置火山访问密钥（AK/SK），可在下方输入保存' }
    }
    try {
      const coding = await volcCall(creds.region, creds.volcAk, creds.volcSk, 'GetCodingPlanUsage')
      const codingPlan = parsePlan('coding-plan', coding)
      if (coding.status !== 200 && !codingPlan.error) codingPlan.error = 'HTTP ' + coding.status
      const afp = await volcCall(creds.region, creds.volcAk, creds.volcSk, 'GetAFPUsage')
      const afpPlan = parsePlan('agent-plan', afp)
      if (afp.status !== 200 && !afpPlan.error) afpPlan.error = 'HTTP ' + afp.status
      return { ok: true, at: Date.now(), keysPresent: true, plans: [codingPlan, afpPlan], error: '' }
    } catch (e) {
      return { ok: false, at: 0, keysPresent: true, plans: [], error: String(e && e.message).slice(0, 300) }
    }
  }

  async function refresh() {
    if (inFlight !== null) return inFlight
    inFlight = (async () => {
      const creds = await readCredentials()
      state.region = creds.region || 'cn-beijing'
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
    return {
      deepseek: state.deepseek,
      volc: state.volc,
      at: state.at,
      keys: state.keys,
      region: state.region,
    }
  }

  ctx.effect(() => {
    const disposeStatus = ctx.webServer.register({
      kind: 'exact',
      path: '/api/billing-balance/status',
      handler: (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        return json(res, 200, snapshot())
      },
    })
    const disposeRefresh = ctx.webServer.register({
      kind: 'exact',
      path: '/api/billing-balance/refresh',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        await refresh()
        return json(res, 200, snapshot())
      },
    })
    const disposeKeys = ctx.webServer.register({
      kind: 'exact',
      path: '/api/billing-balance/volc-keys',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        const body = await readBody(req)
        const ak = body && typeof body.ak === 'string' ? body.ak.trim() : ''
        const sk = body && typeof body.sk === 'string' ? body.sk.trim() : ''
        if ((ak && !sk) || (!ak && sk)) {
          return json(res, 400, { ok: false, error: 'AK 与 SK 需要同时填写或同时留空' })
        }
        if (credSvc === undefined) {
          return json(res, 500, { ok: false, error: 'credentials 服务不可用，请手动编辑 ~/.dsh/.credentials.yaml' })
        }
        try {
          if (ak && sk) {
            await credSvc.set('VOLC_ACCESS_KEY', ak)
            await credSvc.set('VOLC_SECRET_KEY', sk)
          } else {
            await credSvc.unset('VOLC_ACCESS_KEY')
            await credSvc.unset('VOLC_SECRET_KEY')
          }
        } catch (e) {
          return json(res, 500, { ok: false, error: '保存失败: ' + String(e && e.message) })
        }
        await refresh()
        return json(res, 200, snapshot())
      },
    })

    const timer = setInterval(() => { refresh().catch(() => {}) }, 60000)
    if (typeof timer.unref === 'function') timer.unref()
    refresh().catch(() => {})

    return () => {
      disposeStatus()
      disposeRefresh()
      disposeKeys()
      clearInterval(timer)
    }
  }, 'dsh-billing-balance: routes')
}
