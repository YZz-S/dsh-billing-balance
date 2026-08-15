/**
 * dsh-billing-balance — Client 半边（DeepSeek Harness 动态 Cordis 插件）
 *
 * 职责：三处 UI 注册 + 包内共享状态 store + 与 Host 的私有 JSON RPC 交互：
 *  - settings.section「模型余额」：完整面板 + 刷新 + 火山 AK/SK 配置
 *  - conversation.composer.dock：输入框下方常驻读数条
 *  - shell.overlay：右下角可拖动悬浮刷新圆钮
 *
 * 用法：将本文件内容作为 cordis_define 的 code.client 传入。
 */
return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert([
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
    ].join('\n'))

    const labelMap = { 'session': '5小时/会话', '5h': '5小时', 'five_hour': '5小时', 'weekly': '每周', 'week': '每周', 'monthly': '每月', 'month': '每月' }
    const dockLabelMap = { 'session': '5h', '5h': '5h', 'five_hour': '5h', 'weekly': '周', 'week': '周', 'monthly': '月', 'month': '月' }

    const store = { status: null, listeners: [] }
    function setStore(s) {
      store.status = s
      for (const fn of store.listeners) { try { fn(s) } catch (e) { } }
    }
    function subscribe(fn) {
      store.listeners.push(fn)
      return () => { const i = store.listeners.indexOf(fn); if (i >= 0) store.listeners.splice(i, 1) }
    }
    function loadCached() {
      host.call('get-status', {}).then(setStore).catch((e) => setStore({ error: String(e && e.message) }))
    }
    function forceRefresh() {
      return host.call('refresh', {}).then(setStore).catch((e) => setStore({ error: String(e && e.message) }))
    }

    function fmtCountdown(ms) {
      if (ms === null || ms === undefined) return '—'
      if (ms <= 0) return '即将重置'
      const s = Math.floor(ms / 1000)
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
      if (d > 0) return d + ' 天 ' + h + ' 小时'
      if (h > 0) return h + ' 小时 ' + m + ' 分'
      if (m > 0) return m + ' 分 ' + sec + ' 秒'
      return sec + ' 秒'
    }

    function useStatus() {
      const [status, setStatus] = React.useState(store.status)
      const [now, setNow] = React.useState(Date.now())
      React.useEffect(() => {
        let alive = true
        const unsub = subscribe((s) => { if (alive) setStatus(s) })
        const tick = ctx.interval(() => { if (alive) setNow(Date.now()) }, 1000)
        const poll = ctx.interval(() => { if (alive) loadCached() }, 30000)
        forceRefresh()
        return () => { alive = false; unsub(); tick(); poll() }
      }, [])
      return { status, now }
    }

    function DeepSeekCard(props) {
      const ds = props.ds
      if (ds === null || ds === undefined) return React.createElement('div', { className: 'dshbal-card' }, React.createElement('div', { className: 'dshbal-title' }, 'DeepSeek 官方 API'), '加载中…')
      if (!ds.ok) {
        return React.createElement('div', { className: 'dshbal-card' },
          React.createElement('div', { className: 'dshbal-title' }, 'DeepSeek 官方 API'),
          React.createElement('div', { className: 'dshbal-err' }, ds.error),
        )
      }
      const rows = (ds.balances || []).map((b, i) => React.createElement('div', { key: i },
        React.createElement('div', { className: 'dshbal-row' }, React.createElement('span', null, '总余额 (' + b.currency + ')'), React.createElement('span', { style: { fontWeight: 600 } }, '¥ ' + b.total)),
        React.createElement('div', { className: 'dshbal-row' }, React.createElement('span', { className: 'dshbal-muted' }, '充值余额'), React.createElement('span', { className: 'dshbal-muted' }, '¥ ' + b.toppedUp)),
        React.createElement('div', { className: 'dshbal-row' }, React.createElement('span', { className: 'dshbal-muted' }, '赠送余额'), React.createElement('span', { className: 'dshbal-muted' }, '¥ ' + b.granted)),
      ))
      return React.createElement('div', { className: 'dshbal-card' },
        React.createElement('div', { className: 'dshbal-title' }, 'DeepSeek 官方 API'),
        rows.length ? rows : React.createElement('div', { className: 'dshbal-muted' }, '无余额数据'),
        React.createElement('div', { className: 'dshbal-muted', style: { marginTop: 6 } }, ds.isAvailable ? '✓ 账户可用' : '账户不可用'),
      )
    }

    function VolcCard(props) {
      const volc = props.volc, now = props.now, keys = props.keys
      const [ak, setAk] = React.useState('')
      const [sk, setSk] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [msg, setMsg] = React.useState('')
      if (volc === null || volc === undefined) return React.createElement('div', { className: 'dshbal-card' }, React.createElement('div', { className: 'dshbal-title' }, '火山方舟 Coding Plan'), '加载中…')
      const head = React.createElement('div', { className: 'dshbal-title' }, '火山方舟 Coding Plan')
      const configured = (keys && keys.volc) || (volc && volc.keysPresent)
      const sections = []
      if (volc.error) sections.push(React.createElement('div', { key: 'err', className: 'dshbal-err', style: { marginTop: 4 } }, volc.error))
      for (const plan of volc.plans || []) {
        if (plan.error) { sections.push(React.createElement('div', { key: plan.product, className: 'dshbal-err', style: { marginTop: 8 } }, plan.product + '：' + plan.error)); continue }
        if (!plan.periods || !plan.periods.length) continue
        const rows = plan.periods.map((p, i) => {
          const name = labelMap[p.level] || p.level
          const remaining = p.resetMs ? p.resetMs - now : null
          const usedTotal = (p.used !== null && p.total !== null) ? '（已用 ' + p.used + ' / 总额 ' + p.total + '）' : ''
          return React.createElement('div', { key: i, style: { marginTop: 10 } },
            React.createElement('div', { className: 'dshbal-row' }, React.createElement('span', null, name + usedTotal), React.createElement('span', null, p.percent + '% 已用')),
            React.createElement('div', { className: 'dshbal-bar' }, React.createElement('div', { className: 'dshbal-bar-fill', style: { width: Math.max(0, Math.min(100, p.percent)) + '%' } })),
            React.createElement('div', { className: 'dshbal-row' },
              React.createElement('span', { className: 'dshbal-muted' }, p.resetMs ? '额度重置倒计时' : ''),
              React.createElement('span', { className: 'dshbal-muted' }, remaining !== null ? fmtCountdown(remaining) : '—'),
            ),
          )
        })
        sections.push(React.createElement('div', { key: plan.product, style: { marginTop: 12 } },
          React.createElement('div', { className: 'dshbal-subtitle' }, plan.product === 'coding-plan' ? 'Coding Plan 额度（session/周/月）' : 'Agent Plan 额度（5小时/周/月）'),
          rows,
        ))
      }
      const save = () => {
        if (busy) return
        setBusy(true)
        setMsg('')
        host.call('set-volc-keys', { ak: ak, sk: sk }).then((s) => {
          setStore(s)
          const err = s && s.error
          if (err) setMsg(err)
          else { setMsg(ak ? '已保存并刷新 ✓' : '已清除并刷新 ✓'); setAk(''); setSk('') }
        }).catch((e) => setMsg(String(e && e.message))).finally(() => setBusy(false))
      }
      const clear = () => {
        if (busy) return
        setAk('')
        setSk('')
        setBusy(true)
        setMsg('')
        host.call('set-volc-keys', { ak: '', sk: '' }).then((s) => {
          setStore(s)
          setMsg(s && s.error ? s.error : '已清除并刷新 ✓')
        }).catch((e) => setMsg(String(e && e.message))).finally(() => setBusy(false))
      }
      const cfg = React.createElement('div', { style: { marginTop: 14, borderTop: '1px dashed rgba(127,127,127,.3)', paddingTop: 10 } },
        React.createElement('div', { className: 'dshbal-subtitle' }, '访问密钥配置'),
        React.createElement('div', { className: 'dshbal-muted', style: { marginTop: 4 } }, '状态：' + (configured ? '已配置（存于 ~/.dsh/.credentials.yaml）' : '未配置')),
        React.createElement('input', { className: 'dshbal-input', type: 'password', placeholder: 'VOLC_ACCESS_KEY（AK），例如 AKLT…', value: ak, onChange: (e) => setAk(e.target.value), autoComplete: 'off', spellCheck: false }),
        React.createElement('input', { className: 'dshbal-input', type: 'password', placeholder: 'VOLC_SECRET_KEY（SK）', value: sk, onChange: (e) => setSk(e.target.value), autoComplete: 'off', spellCheck: false }),
        React.createElement('div', { style: { marginTop: 8 } },
          React.createElement('button', { className: 'dshbal-btn', onClick: save, disabled: busy }, busy ? '保存中…' : '保存并刷新'),
          React.createElement('button', { className: 'dshbal-btn', style: { marginLeft: 8 }, onClick: clear, disabled: busy }, '清除'),
          msg ? React.createElement('span', { className: 'dshbal-muted', style: { marginLeft: 8 } }, msg) : null,
        ),
        React.createElement('div', { className: 'dshbal-muted', style: { marginTop: 6 } }, '获取路径：火山引擎控制台 → 右上角账号头像 → API 访问密钥（cn-beijing，需 Ark 权限）。密钥只写入本机，不会显示回页面。'),
      )
      return React.createElement('div', { className: 'dshbal-card' }, head, sections, cfg)
    }

    function BillingPage() {
      const { status, now } = useStatus()
      const [busy, setBusy] = React.useState(false)
      const upd = status && status.at ? '更新于 ' + new Date(status.at).toLocaleTimeString() : ''
      const click = () => {
        if (busy) return
        setBusy(true)
        forceRefresh().finally(() => setBusy(false))
      }
      return React.createElement('div', { style: { padding: '4px 0' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
          React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, '模型余额'),
          React.createElement('div', null,
            React.createElement('button', { className: 'dshbal-btn', onClick: click, disabled: busy }, busy ? '刷新中…' : '刷新'),
            React.createElement('span', { className: 'dshbal-muted', style: { marginLeft: 8 } }, upd),
          ),
        ),
        status && status.error ? React.createElement('div', { className: 'dshbal-err' }, status.error) : null,
        React.createElement(DeepSeekCard, { ds: status ? status.deepseek : null }),
        React.createElement(VolcCard, { volc: status ? status.volc : null, now: now, keys: status ? status.keys : null }),
      )
    }

    function DockReadout() {
      const { status, now } = useStatus()
      if (!status || status.error) return React.createElement('span', { className: 'dshbal-dock' }, '')
      const parts = []
      const ds = status.deepseek
      if (ds && ds.ok && ds.balances && ds.balances.length) parts.push('DeepSeek ¥' + ds.balances[0].total)
      const volc = status.volc
      if (volc && volc.keysPresent) {
        for (const plan of volc.plans || []) {
          if (!plan.periods || !plan.periods.length) continue
          const seg = plan.periods.map((p) => (dockLabelMap[p.level] || p.level) + ' ' + p.percent + '%').join(' · ')
          parts.push((plan.product === 'coding-plan' ? '火山Coding' : '火山Agent') + ' ' + seg)
          let nearest = null
          for (const p of plan.periods) { if (p.resetMs > 0 && (nearest === null || p.resetMs < nearest)) nearest = p.resetMs }
          if (nearest !== null) parts.push('重置 ' + fmtCountdown(nearest - now))
        }
      } else if (volc) {
        parts.push('火山：未配 AK/SK')
      }
      if (!parts.length) return React.createElement('span', { className: 'dshbal-dock' }, '')
      return React.createElement('span', { className: 'dshbal-dock', title: '模型余额' }, parts.join(' · '))
    }

    function FloatRefresh() {
      const [pos, setPos] = React.useState({ right: 18, bottom: 18 })
      const [busy, setBusy] = React.useState(false)
      const [done, setDone] = React.useState(false)
      const dragRef = React.useRef(null)
      const { status } = useStatus()
      const ds = status && status.deepseek
      const title = (ds && ds.ok && ds.balances && ds.balances.length) ? ('DeepSeek ¥' + ds.balances[0].total + ' — 点击刷新，可拖动') : '刷新模型余额（可拖动）'
      const onPointerDown = (e) => {
        if (busy) return
        dragRef.current = { startX: e.clientX, startY: e.clientY, base: { right: pos.right, bottom: pos.bottom }, moved: false }
        if (e.currentTarget && e.currentTarget.setPointerCapture) {
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { }
        }
      }
      const onPointerMove = (e) => {
        const d = dragRef.current
        if (!d) return
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true
        if (d.moved) {
          const w = window.innerWidth, h = window.innerHeight
          const nextRight = Math.max(0, Math.min(w - 44, d.base.right - dx))
          const nextBottom = Math.max(0, Math.min(h - 44, d.base.bottom - dy))
          setPos({ right: nextRight, bottom: nextBottom })
        }
      }
      const onPointerUp = () => {
        const d = dragRef.current
        dragRef.current = null
        if (d && d.moved) return
        if (busy) return
        setBusy(true)
        setDone(false)
        forceRefresh().finally(() => {
          setBusy(false)
          setDone(true)
          ctx.timeout(() => setDone(false), 2000)
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

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'billing-balance', order: 25, label: '模型余额' },
      () => React.createElement(BillingPage),
    ))

    slots.inject('conversation.composer.dock', () => slots.register(
      { name: 'conversation.composer.dock', id: 'billing-balance-dock', order: 20, label: '模型余额' },
      () => React.createElement(DockReadout),
    ))

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'billing-balance-float', order: 30, label: '模型余额悬浮刷新' },
      () => React.createElement(FloatRefresh),
    ))
  },
}
