// Chat Widget — injected into every page
;(function () {
  if (typeof document === 'undefined') return
  if (document.getElementById('cw-fab')) return

  // ── CSS ──────────────────────────────────────────────────
  var s = document.createElement('style')
  s.id = 'cw-style'
  s.textContent = [
    '#cw-fab{position:fixed;bottom:6rem;left:2rem;z-index:9999;width:52px;height:52px;border-radius:50%;background:#3eaf7c;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(62,175,124,.4);transition:transform .2s,box-shadow .2s;outline:none;-webkit-tap-highlight-color:transparent}',
    '#cw-fab:hover{transform:scale(1.1);box-shadow:0 4px 20px rgba(62,175,124,.55)}',
    '#cw-fab:active{transform:scale(.95)}',
    '#cw-fab .pulse{position:absolute;inset:0;border-radius:50%;background:#3eaf7c;animation:cw-pulse 2s ease-out infinite;pointer-events:none}',
    '#cw-fab svg{width:26px;height:26px;color:#fff;position:relative;z-index:2}',
    '#cw-panel{position:fixed;bottom:6rem;left:1rem;z-index:9999;width:380px;height:560px;border-radius:16px;background:#fff;box-shadow:0 12px 48px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);display:flex;flex-direction:column;overflow:hidden;animation:cw-in .28s cubic-bezier(.34,1.3,.64,1)}',
    '#cw-panel.cw-hiding{animation:cw-out .18s ease forwards}',
    '@keyframes cw-pulse{0%{transform:scale(1);opacity:.5}70%{transform:scale(1.7);opacity:0}100%{transform:scale(1.7);opacity:0}}',
    '@keyframes cw-in{from{opacity:0;transform:scale(.85) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}',
    '@keyframes cw-out{to{opacity:0;transform:scale(.85) translateY(20px)}}',
    '@keyframes cw-slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}',
    '@keyframes cw-slide-down{to{transform:translateY(100%)}}',
    '#cw-header{flex-shrink:0;height:48px;padding:0 12px 0 16px;background:#3eaf7c;display:flex;align-items:center;justify-content:space-between}',
    '#cw-info{display:flex;align-items:center;gap:8px}',
    '#cw-dot{width:8px;height:8px;border-radius:50%;background:#a8f0c8}',
    '#cw-title{color:#fff;font-size:13px;font-weight:600}',
    '#cw-actions{display:flex;gap:4px}',
    '.cw-btn{width:30px;height:30px;border-radius:8px;border:none;background:rgba(255,255,255,.2);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;transition:background .15s;outline:none}',
    '.cw-btn:hover{background:rgba(255,255,255,.3)}',
    '.cw-btn svg{width:14px;height:14px}',
    '#cw-close:hover{background:rgba(239,68,68,.5)}',
    '#cw-body{flex:1;overflow:hidden;background:#f8f9fa}',
    '#cw-iframe{width:100%;height:100%;border:none;display:block}',
    '@media(max-width:480px){',
    '#cw-fab{bottom:5rem;left:1.5rem}',
    '#cw-panel{top:0;left:0;bottom:0;width:100%;height:100%;border-radius:0;animation:cw-slide-up .35s cubic-bezier(.22,1,.36,1)}',
    '#cw-panel.cw-hiding{animation:cw-slide-down .2s ease forwards}',
    '}'
  ].join('')
  document.head.appendChild(s)

  // ── FAB button ───────────────────────────────────────────
  var fab = document.createElement('button')
  fab.id = 'cw-fab'
  fab.setAttribute('aria-label', '打开智能客服')
  fab.innerHTML = '<span class="pulse"></span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>'
  document.body.appendChild(fab)

  // ── Panel ────────────────────────────────────────────────
  var wrap = document.createElement('div')
  wrap.innerHTML = '<div id="cw-panel" style="display:none;" role="dialog" aria-label="智能客服">' +
    '<div id="cw-header">' +
      '<div id="cw-info"><span id="cw-dot"></span><span id="cw-title">AI 客服</span></div>' +
      '<div id="cw-actions">' +
        '<button id="cw-close" class="cw-btn" title="关闭" aria-label="关闭"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
      '</div>' +
    '</div>' +
    '<div id="cw-body"><iframe id="cw-iframe" frameborder="0" allow="microphone;camera" title="智慧问答"></iframe></div>' +
  '</div>'
  document.body.appendChild(wrap)

  // ── Events ───────────────────────────────────────────────
  var panel    = document.getElementById('cw-panel')
  var closeBtn = document.getElementById('cw-close')
  var iframe   = document.getElementById('cw-iframe')
  var loaded   = false

  fab.addEventListener('click', function () {
    if (!loaded) {
      iframe.src = 'https://chat.vectorac.com/'
      loaded = true
    }
    panel.style.display = 'flex'
    panel.classList.remove('cw-hiding')
    document.body.style.overflow = 'hidden'
  })

  closeBtn.addEventListener('click', function () {
    panel.classList.add('cw-hiding')
    setTimeout(function () {
      panel.style.display = 'none'
      panel.classList.remove('cw-hiding')
      document.body.style.overflow = ''
    }, 200)
  })

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.style.display === 'flex') {
      closeBtn.click()
    }
  })
})()
