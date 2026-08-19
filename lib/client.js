/* dsh-billing-balance client half: settings page + composer dock + floating refresh.
 * Loaded through the client module loader (CJS wrapper). The loader id MUST
 * equal the package name: client-modules verifies the boot graph row id
 * (the package name) against the id registered via __ModuleLoader__.load. */
window.__ModuleLoader__.load({
  id: 'dsh-billing-balance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')

    function apiGet(url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
    }

    function apiPost(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: body === null || body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === null || body === undefined ? undefined : JSON.stringify(body),
      }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
    }

    var API = {
      getStatus: function () { return apiGet('/api/billing-balance/status') },
      refresh: function () { return apiPost('/api/billing-balance/refresh', null) },
      setVolcKeys: function (ak, sk) { return apiPost('/api/billing-balance/volc-keys', { ak: ak, sk: sk }) },
    }

    var css = [
      '.dshbal-card { border: 1px solid rgba(127,127,127,.28); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; font-size: 13px; }',
      '.dshbal-title { font-weight: 600; font-size: 14px; margin-bottom: 6px; }',
      '.dshbal-subtitle { font-weight: 600; font-size: 13px; }',
      '.dshbal-row { display: flex; justify-content: space-between; padding: 3px 0; }',
      '.dshbal-bar { height: 6px; background: rgba(127,127,127,.18); border-radius: 3px; overflow: hidden; }',
      '.dshbal-bar-fill { height: 100%; background: #4d7cfe; border-radius: 3px; }',
      '.dshbal-err { color: #e5484d; }',
      '.dshbal-muted { opacity: .65; font-size: 12px; }',
      '.dshbal-btn { border: 1px solid rgba(127,127,127,.4); background: transparent; color: inherit; border-radius: 6px; padding: 3px 10px; cursor: pointer; font-size: 12px; }',
      '.dshbal-btn:disabled { opacity: .5; cursor: default; }',
      '.dshbal-input { width: 100%; box-sizing: border-box; background: rgba(127,127,127,.08); border: 1px solid rgba(127,127,127,.3); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: inherit; margin-top: 6px; }',
      '.dshbal-dock { font-size: 11px; opacity: .72; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.dshbal-float { position: fixed; z-index: 60; width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(127,127,127,.45); background: rgba(24,24,28,.8); color: #e8e8e8; display: flex; align-items: center; justify-content: center; cursor: grab; font-size: 15px; line-height: 1; box-shadow: 0 2px 10px rgba(0,0,0,.28); pointer-events: auto; user-select: none; touch-action: none; }',
      '.dshbal-float:hover { background: rgba(42,42,50,.88); }',
      '.dshbal-float:active { cursor: grabbing; }',
    ].join('\n')

    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin="dsh-billing-balance"]') === null) {
      var styleTag = document.createElement('style')
      styleTag.dataset.plugin = 'dsh-billing-balance'
      styleTag.textContent = css
      document.head.appendChild(styleTag)
    }

    var labelMap = { 'session': '5小时/会话', 'daily': '每日', '5h': '5小时', 'five_hour': '5小时', 'weekly': '每周', 'week': '每周', 'monthly': '每月', 'month': '每月' }
    var dockLabelMap = { 'session': '5h', 'daily': '日', '5h': '5h', 'five_hour': '5h', 'weekly': '周', 'week': '周', 'monthly': '月', 'month': '月' }

    var store = { status: null, listeners: [] }
    function setStore(s) {
      store.status = s
      for (var i = 0; i < store.listeners.length; i++) {
        try { store.listeners[i](s) } catch (e) { /* contained */ }
      }
    }
    function subscribe(fn) {
      store.listeners.push(fn)
      return function () {
        var i = store.listeners.indexOf(fn)
        if (i >= 0) store.listeners.splice(i, 1)
      }
    }
    function loadCached() {
      API.getStatus().then(setStore).catch(function (e) { setStore({ error: String(e && e.message) }) })
    }
    function forceRefresh() {
      return API.refresh().then(setStore).catch(function (e) { setStore({ error: String(e && e.message) }) })
    }

    function fmtCountdown(ms) {
      if (ms === null || ms === undefined) return '—'
      if (ms <= 0) return '即将重置'
      var s = Math.floor(ms / 1000)
      var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
      if (d > 0) return d + ' 天 ' + h + ' 小时'
      if (h > 0) return h + ' 小时 ' + m + ' 分'
      if (m > 0) return m + ' 分 ' + sec + ' 秒'
      return sec + ' 秒'
    }

    function useStatus() {
      var statusHook = React.useState(store.status)
      var status = statusHook[0], setStatus = statusHook[1]
      var nowHook = React.useState(Date.now())
      var now = nowHook[0], setNow = nowHook[1]
      React.useEffect(function () {
        var alive = true
        var unsub = subscribe(function (s) { if (alive) setStatus(s) })
        var tick = setInterval(function () { if (alive) setNow(Date.now()) }, 1000)
        var poll = setInterval(function () { if (alive) loadCached() }, 30000)
        forceRefresh()
        return function () {
          alive = false
          unsub()
          clearInterval(tick)
          clearInterval(poll)
        }
      }, [])
      return { status: status, now: now }
    }

    function DeepSeekCard(props) {
      var ds = props.ds
      if (ds === null || ds === undefined) {
        return React.createElement('div', { className: 'dshbal-card' },
          React.createElement('div', { className: 'dshbal-title' }, 'DeepSeek 官方 API'), '加载中…')
      }
      if (!ds.ok) {
        return React.createElement('div', { className: 'dshbal-card' },
          React.createElement('div', { className: 'dshbal-title' }, 'DeepSeek 官方 API'),
          React.createElement('div', { className: 'dshbal-err' }, ds.error))
      }
      var rows = (ds.balances || []).map(function (b, i) {
        return React.createElement('div', { key: i },
          React.createElement('div', { className: 'dshbal-row' },
            React.createElement('span', null, '总余额 (' + b.currency + ')'),
            React.createElement('span', { style: { fontWeight: 600 } }, '¥ ' + b.total)),
          React.createElement('div', { className: 'dshbal-row' },
            React.createElement('span', { className: 'dshbal-muted' }, '充值余额'),
            React.createElement('span', { className: 'dshbal-muted' }, '¥ ' + b.toppedUp)),
          React.createElement('div', { className: 'dshbal-row' },
            React.createElement('span', { className: 'dshbal-muted' }, '赠送余额'),
            React.createElement('span', { className: 'dshbal-muted' }, '¥ ' + b.granted)))
      })
      return React.createElement('div', { className: 'dshbal-card' },
        React.createElement('div', { className: 'dshbal-title' }, 'DeepSeek 官方 API'),
        rows.length ? rows : React.createElement('div', { className: 'dshbal-muted' }, '无余额数据'),
        React.createElement('div', { className: 'dshbal-muted', style: { marginTop: 6 } },
          ds.isAvailable ? '✓ 账户可用' : '账户不可用'))
    }

    function VolcCard(props) {
      var volc = props.volc, now = props.now, keys = props.keys
      var akHook = React.useState('')
      var ak = akHook[0], setAk = akHook[1]
      var skHook = React.useState('')
      var sk = skHook[0], setSk = skHook[1]
      var busyHook = React.useState(false)
      var busy = busyHook[0], setBusy = busyHook[1]
      var msgHook = React.useState('')
      var msg = msgHook[0], setMsg = msgHook[1]
      if (volc === null || volc === undefined) {
        return React.createElement('div', { className: 'dshbal-card' },
          React.createElement('div', { className: 'dshbal-title' }, '火山方舟 Coding Plan'), '加载中…')
      }
      var head = React.createElement('div', { className: 'dshbal-title' }, '火山方舟 Coding Plan')
      var configured = (keys && keys.volc) || (volc && volc.keysPresent)
      var sections = []
      if (volc.error) {
        sections.push(React.createElement('div', { key: 'err', className: 'dshbal-err', style: { marginTop: 4 } }, volc.error))
      }
      for (var pi = 0; pi < (volc.plans || []).length; pi++) {
        var plan = volc.plans[pi]
        if (plan.error) {
          sections.push(React.createElement('div', { key: plan.product, className: 'dshbal-err', style: { marginTop: 8 } },
            plan.product + '：' + plan.error))
          continue
        }
        if (!plan.periods || !plan.periods.length) continue
        var rows = plan.periods.map(function (p, i) {
          var name = labelMap[p.level] || p.level
          var remaining = p.resetMs ? p.resetMs - now : null
          var usedTotal = (p.used !== null && p.total !== null) ? '（已用 ' + p.used + ' / 总额 ' + p.total + '）' : ''
          return React.createElement('div', { key: i, style: { marginTop: 10 } },
            React.createElement('div', { className: 'dshbal-row' },
              React.createElement('span', null, name + usedTotal),
              React.createElement('span', null, p.percent + '% 已用')),
            React.createElement('div', { className: 'dshbal-bar' },
              React.createElement('div', { className: 'dshbal-bar-fill', style: { width: Math.max(0, Math.min(100, p.percent)) + '%' } })),
            React.createElement('div', { className: 'dshbal-row' },
              React.createElement('span', { className: 'dshbal-muted' }, p.resetMs ? '额度重置倒计时' : ''),
              React.createElement('span', { className: 'dshbal-muted' }, remaining !== null ? fmtCountdown(remaining) : '—')))
        })
        sections.push(React.createElement('div', { key: plan.product, style: { marginTop: 12 } },
          React.createElement('div', { className: 'dshbal-subtitle' },
            plan.product === 'coding-plan' ? 'Coding Plan 额度（session/周/月）' : 'Agent Plan 额度（5小时/周/月）'),
          rows))
      }
      var save = function () {
        if (busy) return
        setBusy(true)
        setMsg('')
        API.setVolcKeys(ak, sk).then(function (s) {
          setStore(s)
          var err = s && s.error
          if (err) setMsg(err)
          else { setMsg(ak ? '已保存并刷新 ✓' : '已清除并刷新 ✓'); setAk(''); setSk('') }
        }).catch(function (e) { setMsg(String(e && e.message)) }).finally(function () { setBusy(false) })
      }
      var clear = function () {
        if (busy) return
        setAk('')
        setSk('')
        setBusy(true)
        setMsg('')
        API.setVolcKeys('', '').then(function (s) {
          setStore(s)
          setMsg(s && s.error ? s.error : '已清除并刷新 ✓')
        }).catch(function (e) { setMsg(String(e && e.message)) }).finally(function () { setBusy(false) })
      }
      var cfg = React.createElement('div', { style: { marginTop: 14, borderTop: '1px dashed rgba(127,127,127,.3)', paddingTop: 10 } },
        React.createElement('div', { className: 'dshbal-subtitle' }, '访问密钥配置'),
        React.createElement('div', { className: 'dshbal-muted', style: { marginTop: 4 } },
          '状态：' + (configured ? '已配置（存于 ~/.dsh/.credentials.yaml）' : '未配置')),
        React.createElement('input', { className: 'dshbal-input', type: 'password', placeholder: 'VOLC_ACCESS_KEY（AK），例如 AKLT…', value: ak, onChange: function (e) { setAk(e.target.value) }, autoComplete: 'off', spellCheck: false }),
        React.createElement('input', { className: 'dshbal-input', type: 'password', placeholder: 'VOLC_SECRET_KEY（SK）', value: sk, onChange: function (e) { setSk(e.target.value) }, autoComplete: 'off', spellCheck: false }),
        React.createElement('div', { style: { marginTop: 8 } },
          React.createElement('button', { className: 'dshbal-btn', onClick: save, disabled: busy }, busy ? '保存中…' : '保存并刷新'),
          React.createElement('button', { className: 'dshbal-btn', style: { marginLeft: 8 }, onClick: clear, disabled: busy }, '清除'),
          msg ? React.createElement('span', { className: 'dshbal-muted', style: { marginLeft: 8 } }, msg) : null),
        React.createElement('div', { className: 'dshbal-muted', style: { marginTop: 6 } },
          '获取路径：火山引擎控制台 → 右上角账号头像 → API 访问密钥（cn-beijing，需 Ark 权限）。密钥只写入本机，不会显示回页面。'))
      return React.createElement('div', { className: 'dshbal-card' }, head, sections, cfg)
    }

    function BillingPage() {
      var used = useStatus()
      var status = used.status, now = used.now
      var busyHook = React.useState(false)
      var busy = busyHook[0], setBusy = busyHook[1]
      var upd = status && status.at ? '更新于 ' + new Date(status.at).toLocaleTimeString() : ''
      var click = function () {
        if (busy) return
        setBusy(true)
        forceRefresh().finally(function () { setBusy(false) })
      }
      return React.createElement('div', { style: { padding: '4px 0' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
          React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, '模型余额'),
          React.createElement('div', null,
            React.createElement('button', { className: 'dshbal-btn', onClick: click, disabled: busy }, busy ? '刷新中…' : '刷新'),
            React.createElement('span', { className: 'dshbal-muted', style: { marginLeft: 8 } }, upd))),
        status && status.error ? React.createElement('div', { className: 'dshbal-err' }, status.error) : null,
        React.createElement(DeepSeekCard, { ds: status ? status.deepseek : null }),
        React.createElement(VolcCard, { volc: status ? status.volc : null, now: now, keys: status ? status.keys : null }))
    }

    function DockReadout() {
      var used = useStatus()
      var status = used.status, now = used.now
      if (!status || status.error) return React.createElement('span', { className: 'dshbal-dock' }, '')
      var parts = []
      var ds = status.deepseek
      if (ds && ds.ok && ds.balances && ds.balances.length) parts.push('DeepSeek ¥' + ds.balances[0].total)
      var volc = status.volc
      if (volc && volc.keysPresent) {
        for (var pi = 0; pi < (volc.plans || []).length; pi++) {
          var plan = volc.plans[pi]
          if (!plan.periods || !plan.periods.length) continue
          var seg = plan.periods.map(function (p) { return (dockLabelMap[p.level] || p.level) + ' ' + p.percent + '%' }).join(' · ')
          parts.push((plan.product === 'coding-plan' ? '火山Coding' : '火山Agent') + ' ' + seg)
          var nearest = null
          for (var i = 0; i < plan.periods.length; i++) {
            var p = plan.periods[i]
            if (p.resetMs > 0 && (nearest === null || p.resetMs < nearest)) nearest = p.resetMs
          }
          if (nearest !== null) parts.push('重置 ' + fmtCountdown(nearest - now))
        }
      } else if (volc) {
        parts.push('火山：未配 AK/SK')
      }
      if (!parts.length) return React.createElement('span', { className: 'dshbal-dock' }, '')
      return React.createElement('span', { className: 'dshbal-dock', title: '模型余额' }, parts.join(' · '))
    }

    function FloatRefresh() {
      var posHook = React.useState({ right: 18, bottom: 18 })
      var pos = posHook[0], setPos = posHook[1]
      var busyHook = React.useState(false)
      var busy = busyHook[0], setBusy = busyHook[1]
      var doneHook = React.useState(false)
      var done = doneHook[0], setDone = doneHook[1]
      var dragRef = React.useRef(null)
      var used = useStatus()
      var status = used.status
      var ds = status && status.deepseek
      var title = (ds && ds.ok && ds.balances && ds.balances.length)
        ? ('DeepSeek ¥' + ds.balances[0].total + ' — 点击刷新，可拖动')
        : '刷新模型余额（可拖动）'
      var onPointerDown = function (e) {
        if (busy) return
        dragRef.current = { startX: e.clientX, startY: e.clientY, base: { right: pos.right, bottom: pos.bottom }, moved: false }
        if (e.currentTarget && e.currentTarget.setPointerCapture) {
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
        }
      }
      var onPointerMove = function (e) {
        var d = dragRef.current
        if (!d) return
        var dx = e.clientX - d.startX
        var dy = e.clientY - d.startY
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true
        if (d.moved) {
          var w = window.innerWidth, h = window.innerHeight
          var nextRight = Math.max(0, Math.min(w - 44, d.base.right - dx))
          var nextBottom = Math.max(0, Math.min(h - 44, d.base.bottom - dy))
          setPos({ right: nextRight, bottom: nextBottom })
        }
      }
      var onPointerUp = function () {
        var d = dragRef.current
        dragRef.current = null
        if (d && d.moved) return
        if (busy) return
        setBusy(true)
        setDone(false)
        forceRefresh().finally(function () {
          setBusy(false)
          setDone(true)
          setTimeout(function () { setDone(false) }, 2000)
        })
      }
      return React.createElement('button', {
        className: 'dshbal-float',
        title: title,
        style: { right: pos.right, bottom: pos.bottom },
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
      }, busy ? '…' : (done ? '✓' : '↻'))
    }

    var inject = ['slots']

    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'billing-balance', order: 25, label: '模型余额' },
        BillingPage,
      ))
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
        { name: 'conversation.composer.dock', id: 'billing-balance-dock', order: 20, label: '模型余额' },
        DockReadout,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'billing-balance-float', order: 30, label: '模型余额悬浮刷新' },
        FloatRefresh,
      ))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
