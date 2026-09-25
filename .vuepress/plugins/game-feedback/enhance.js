;(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  var gameNames = {
    '/blogs/other/mahjong_game.html': '四川麻将',
    '/blogs/other/gomoku.html': '五子棋',
    '/blogs/other/cardforge.html': '小丑牌'
  }
  var gameRoots = {
    '/blogs/other/mahjong_game.html': '#scmjGame',
    '/blogs/other/gomoku.html': '#gomokuGame',
    '/blogs/other/cardforge.html': '#balatro-game'
  }
  var currentPath = ''
  var currentGame = ''
  var valine = null
  var feedbackModal = null
  var bodyOverflow = ''
  var priorFocus = null
  var prefillObserver = null

  var css = document.createElement('style')
  css.id = 'game-feedback-style'
  css.textContent = [
    '#game-feedback-modal[hidden]{display:none!important}',
    '#game-feedback-modal{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:calc(16px + env(safe-area-inset-top,0px)) calc(16px + env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) calc(16px + env(safe-area-inset-left,0px));box-sizing:border-box;background:rgba(9,19,30,.62);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);overscroll-behavior:contain}',
    '#game-feedback-modal .gf-dialog{width:min(560px,100%);max-height:min(820px,88vh);max-height:min(820px,88dvh);overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;border:1px solid rgba(255,255,255,.72);border-radius:20px;background:#fff;color:#253142;box-shadow:0 24px 80px rgba(0,0,0,.34);padding:22px 24px 20px;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}',
    '#game-feedback-modal .gf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:8px}',
    '#game-feedback-modal .gf-eyebrow{margin:0 0 4px;color:#398c74;font-size:12px;font-weight:700;letter-spacing:.08em}',
    '#game-feedback-modal .gf-title{margin:0;font-size:22px;line-height:1.3;color:#1d2b38}',
    '#game-feedback-modal .gf-close{width:38px;height:38px;border:0;border-radius:12px;background:#f1f4f6;color:#344250;font-size:24px;line-height:1;cursor:pointer}',
    '#game-feedback-modal .gf-copy{margin:0 0 8px;color:#5d6a77;font-size:14px;line-height:1.65}',
    '#game-feedback-modal .gf-archive{margin:0 0 16px;padding:9px 11px;border-radius:10px;background:#eff8f4;color:#32745f;font-size:12px;line-height:1.55}',
    '#game-feedback-modal .gf-error{min-height:1.4em;margin:6px 0 0;color:#b42318;font-size:13px;line-height:1.4}',
    '#game-feedback-modal .gf-error:empty{display:none}',
    '#game-feedback-modal .gf-valine{min-height:190px}',
    '#game-feedback-modal .vheader,#game-feedback-modal .vinfo,#game-feedback-modal .vcards,#game-feedback-modal .vpage,#game-feedback-modal .vcount{display:none!important}',
    '#game-feedback-modal .vwrap{border:1px solid #dce3e8!important;border-radius:12px!important;background:#fff!important}',
    '#game-feedback-modal .veditor{min-height:150px;max-height:36vh;padding:14px!important;font:14px/1.7 system-ui,-apple-system,"Segoe UI",sans-serif!important;color:#253142!important}',
    '#game-feedback-modal .vrow{padding:4px 10px 10px}',
    '#game-feedback-modal .vsubmit{min-width:88px;border:0!important;border-radius:9px!important;background:#176b59!important;color:#fff!important;font-size:14px!important}',
    '#game-feedback-modal .status-bar{font-size:12px;color:#39725f}',
    // 移动端（竖屏 + 横屏手机）改为全屏，参考 AI 聊天模块：不再用居中卡片/底部抽屉，
    // 避免弹窗四周露出游戏背景、双指操作时里外两层一起动的丑态。从底部滑入。
    '@media(max-width:640px),(max-height:500px){#game-feedback-modal{padding:0;align-items:stretch;justify-content:stretch}#game-feedback-modal .gf-dialog{width:100%;max-width:none;height:100%;max-height:none;border:0;border-radius:0;padding:calc(14px + env(safe-area-inset-top,0px)) calc(16px + env(safe-area-inset-right,0px)) calc(14px + env(safe-area-inset-bottom,0px)) calc(16px + env(safe-area-inset-left,0px));display:flex;flex-direction:column;overflow:hidden;animation:gf-rise .32s cubic-bezier(.22,1,.36,1)}#game-feedback-modal .gf-head{flex:none;margin-bottom:6px}#game-feedback-modal .gf-eyebrow{font-size:11px}#game-feedback-modal .gf-title{font-size:19px}#game-feedback-modal .gf-close{flex:none;width:44px;height:44px;border-radius:13px;font-size:26px}#game-feedback-modal .gf-copy{flex:none;margin-bottom:6px;font-size:13px}#game-feedback-modal .gf-archive{flex:none;margin-bottom:10px;font-size:11.5px}#game-feedback-modal .gf-valine{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}#game-feedback-modal input,#game-feedback-modal textarea{font-size:16px!important}#game-feedback-modal .veditor{min-height:116px;max-height:none;padding:12px!important;font-size:16px!important;line-height:1.6!important}#game-feedback-modal .vrow{padding:6px 0 8px}#game-feedback-modal .vsubmit{min-width:112px;min-height:44px;border-radius:11px!important;font-size:15px!important}#game-feedback-modal .gf-error{flex:none;margin-top:4px;font-size:12.5px}}',
    '@keyframes gf-rise{from{transform:translateY(100%)}to{transform:translateY(0)}}',
    // 横屏矮屏下隐藏两段说明文字与 Valine 署名，把空间留给输入区（软键盘弹出后可视区域更小）。
    '@media(max-height:500px){#game-feedback-modal .gf-copy,#game-feedback-modal .gf-archive,#game-feedback-modal .vpower{display:none!important}#game-feedback-modal .gf-head{margin-bottom:4px}}',
    // 键盘紧凑模式：虚拟键盘弹出时由 syncViewport 加 gf-kb 类并设置 padding-bottom，
    // 把内容区压回可视高度；压缩标题栏/编辑器/按钮，保证标题 + 输入框 + 提交按钮完整塞进可视区。
    '#game-feedback-modal.gf-kb .gf-dialog{padding-top:calc(6px + env(safe-area-inset-top,0px))}',
    // 移动端全屏下弹窗白底延伸满屏（高度不被压缩），内容区由 padding-bottom 限高贴键盘上方；
    // dialog 改为 flex 列，Valine 链可拉伸填满内容区。桌面卡片模式不套这些规则。
    '@media(max-width:640px),(max-height:500px){#game-feedback-modal.gf-kb .gf-dialog{display:flex;flex-direction:column;height:100%;overflow:hidden}}',
    '#game-feedback-modal.gf-kb .gf-head{position:relative;margin-bottom:4px;min-height:18px;flex:none}',
    '#game-feedback-modal.gf-kb .gf-eyebrow{display:none}',
    '#game-feedback-modal.gf-kb .gf-title{font-size:14px}',
    // 关闭按钮改为浮动，不再撑高标题栏（否则 30px 的按钮会把整行撑到 30px）。
    '#game-feedback-modal.gf-kb .gf-close{position:absolute;top:0;right:0;width:28px;height:28px;border-radius:9px;font-size:18px}',
    '#game-feedback-modal.gf-kb .gf-copy,#game-feedback-modal.gf-kb .gf-archive,#game-feedback-modal.gf-kb .vpower{display:none!important}',
    // Valine 内置 autosize 会给 veditor 写内联 height（按预填内容算出 ~116px），
    // 内联样式会压过 min-height，必须用 !important 才能接管高度。
    // 紧凑模式下整条 Valine 容器链改为 flex，编辑器拉伸填满键盘上方的全部剩余空间；
    // Valine 1.4.14 的工具栏 .vrow 是 .vedit 的子项；提交行是 .vedit 的兄弟项，不能选中它。
    '#game-feedback-modal.gf-kb .gf-valine{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}',
    '#game-feedback-modal.gf-kb .gf-valine > .vpanel{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}',
    '#game-feedback-modal.gf-kb .vwrap{padding:6px!important;margin-bottom:0!important;flex:1 1 auto;display:flex;flex-direction:column;min-height:0}',
    '#game-feedback-modal.gf-kb .vedit{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}',
    '#game-feedback-modal.gf-kb .vedit > .vrow{display:none}',
    '#game-feedback-modal.gf-kb .vrow > .vcol-30{display:none}',
    '#game-feedback-modal.gf-kb .veditor{flex:1 1 auto;min-height:60px;height:auto!important;padding:8px 10px!important;resize:none!important}',
    '#game-feedback-modal.gf-kb .vrow{padding:2px 0;flex:none}',
    '#game-feedback-modal.gf-kb .vsubmit{min-height:38px}'
  ].join('')

  function normalizedPath () {
    try { return decodeURI(window.location.pathname).replace(/\/$/, '') || '/' } catch (_) { return window.location.pathname.replace(/\/$/, '') || '/' }
  }

  function displayRoot () {
    return document.fullscreenElement || document.webkitFullscreenElement || document.body
  }

  function moveToDisplayRoot () {
    var root = displayRoot()
    if (feedbackModal && currentGame) {
      var modalRoot = feedbackModal.hidden ? document.body : root
      if (feedbackModal.parentNode !== modalRoot) modalRoot.appendChild(feedbackModal)
    }
  }

  // iOS 弹出软键盘时只改变 visualViewport，position:fixed 的参考框（layout viewport）不变，
  // 且键盘上方还可能留出一截既不算可视区、又透出页面的缝（Safari 底部工具栏区域）。
  // 因此遮罩层始终保持 inset:0 满屏，弹窗白底也延伸满屏，只用 padding-bottom 把
  // 内容区压回 visualViewport 高度：内容完整贴键盘上方，缝隙处是弹窗白底而非游戏画面。
  function syncViewport () {
    var overlay = modal()
    if (!overlay) return
    var dialog = overlay.querySelector('.gf-dialog')
    // 清掉旧版本可能残留在遮罩上的内联尺寸（旧实现会把遮罩缩到可视区，露出下半屏）。
    overlay.style.top = ''
    overlay.style.bottom = ''
    overlay.style.height = ''
    var viewport = window.visualViewport
    if (!viewport || overlay.hidden || !dialog) {
      if (dialog) dialog.style.paddingBottom = ''
      overlay.classList.remove('gf-kb')
      return
    }
    // 虚拟键盘弹出即进入紧凑模式（可视高度明显小于布局高度，或极端 <=220px），
    // 否则标题 + 说明文字 + 编辑器最小高度就超出可视区，下半部分被键盘裁掉。
    var compact = viewport.height <= 220 || viewport.height < window.innerHeight * 0.62
    overlay.classList.toggle('gf-kb', compact)
    // 底部避让依据真实 visualViewport 空隙计算，与是否进入紧凑样式无关；桌面卡片模式不干预。
    var fullscreen = window.matchMedia && window.matchMedia('(max-width: 640px), (max-height: 500px)').matches
    // 被键盘等占掉的底部高度；内容区贴合 visualViewport，剩余区域由弹窗白底填满。
    var gap = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
    dialog.style.paddingBottom = fullscreen && gap > 0 ? gap + 'px' : ''
  }

  // 键盘动画期间 iOS 的 visualViewport 会多次变化，且 focus 早于 resize 事件；
  // 延时补几次同步，保证弹窗最终锁到键盘上方。
  function syncViewportSoon () {
    window.setTimeout(syncViewport, 60)
    window.setTimeout(syncViewport, 320)
    window.setTimeout(syncViewport, 700)
  }

  function revealEditor (field) {
    if (!field) return
    window.setTimeout(function () {
      if (!modal() || modal().hidden || document.activeElement !== field) return
      var viewport = window.visualViewport
      if (!viewport || viewport.height >= window.innerHeight - 80) return
      // 紧凑模式下整个弹窗就是可视区，scrollIntoView 反而会把提交按钮滚出去。
      if (modal() && modal().classList.contains('gf-kb')) return
      // 非紧凑键盘高度也可能已通过 dialog 底部留白完成避让，不再额外滚动表单。
      if (modal() && parseFloat(modal().querySelector('.gf-dialog').style.paddingBottom) > 0) return
      try { field.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch (_) { field.scrollIntoView() }
    }, 320)
  }

  function modal () { return feedbackModal }
  function editor () { var el = modal(); return el && el.querySelector('.veditor') }

  function feedbackTitle () { return '【' + currentGame + '游戏反馈】' }
  function feedbackPrefix () { return feedbackTitle() + '\n\n' }

  function stopPrefillObserver () {
    if (prefillObserver) prefillObserver.disconnect()
    prefillObserver = null
  }

  function watchForEditor (host) {
    if (!host || prefillObserver || typeof MutationObserver === 'undefined') return
    prefillObserver = new MutationObserver(function () {
      if (setPrefill()) {
        stopPrefillObserver()
        if (modal() && !modal().hidden) {
          var field = editor()
          if (field) field.focus()
        }
      }
    })
    prefillObserver.observe(host, { childList: true, subtree: true })
  }

  function setPrefill () {
    var field = editor()
    if (!field || !currentGame) return false

    var prefix = feedbackPrefix()
    var previousPrefix = field.dataset && field.dataset.gfPrefill
    var existing = field.value || ''

    // Delayed initialization and route changes must never overwrite user input.
    if (existing && existing !== previousPrefix) return true

    if (existing !== prefix) {
      field.value = prefix
      if (field.dataset) field.dataset.gfPrefill = prefix
      field.dispatchEvent(new Event('input', { bubbles: true }))
      if (typeof field.setSelectionRange === 'function') {
        field.setSelectionRange(field.value.length, field.value.length)
      }
    } else if (field.dataset) {
      field.dataset.gfPrefill = prefix
    }
    return true
  }

  function indentEditor (field) {
    if (!field) return
    var start = typeof field.selectionStart === 'number' ? field.selectionStart : (field.value || '').length
    var end = typeof field.selectionEnd === 'number' ? field.selectionEnd : start
    if (typeof field.setRangeText === 'function') {
      field.setRangeText('    ', start, end, 'end')
    } else {
      var value = field.value || ''
      field.value = value.slice(0, start) + '    ' + value.slice(end)
      if (typeof field.setSelectionRange === 'function') field.setSelectionRange(start + 4, start + 4)
    }
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function tabbableElements (dialog) {
    var selector = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
    var candidates = dialog.querySelectorAll(selector)
    return Array.prototype.filter.call(candidates, function (element) {
      return !element.disabled && !element.hidden && (!element.getClientRects || element.getClientRects().length > 0)
    })
  }

  function keepTabInside (dialog, event) {
    var candidates = tabbableElements(dialog)
    if (!candidates.length) {
      event.preventDefault()
      var container = dialog.querySelector('.gf-dialog')
      if (container) container.focus()
      return
    }

    var active = document.activeElement
    var index = Array.prototype.indexOf.call(candidates, active)
    if (index < 0) {
      event.preventDefault()
      candidates[event.shiftKey ? candidates.length - 1 : 0].focus()
    } else if (event.shiftKey && index === 0) {
      event.preventDefault()
      candidates[candidates.length - 1].focus()
    } else if (!event.shiftKey && index === candidates.length - 1) {
      event.preventDefault()
      candidates[0].focus()
    }
  }

  function ensureValine () {
    var host = document.getElementById('game-feedback-valine')
    watchForEditor(host)
    if (valine) {
      if (setPrefill()) stopPrefillObserver()
      return
    }
    try {
      var Valine = require('valine')
      var config = require('../../valine-config')
      valine = new Valine({
        el: host,
        appId: config.appId,
        appKey: config.appKey,
        path: '/docs/about.html',
        lang: 'zh-CN',
        meta: ['nick'],
        requiredFields: [],
        placeholder: '请描述你的建议，或写下 Bug 的复现步骤和预期结果…',
        pageSize: 10,
        visitor: false,
        recordIP: false,
        notify: false,
        verify: false,
        avatar: 'mp'
      })
      if (setPrefill()) stopPrefillObserver()
    } catch (error) {
      stopPrefillObserver()
      var status = document.querySelector('#game-feedback-modal .gf-error')
      if (status) status.textContent = '反馈表单暂时无法加载，请刷新页面后重试。'
      console.error('[游戏反馈] Valine 初始化失败', error)
    }
  }

  function closeModal () {
    var dialog = modal()
    if (!dialog || dialog.hidden) return
    dialog.hidden = true
    document.body.style.overflow = bodyOverflow
    moveToDisplayRoot()
    syncViewport()
    var field = editor()
    if (field) {
      field.value = ''
      if (field.dataset) delete field.dataset.gfPrefill
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (priorFocus && priorFocus.isConnected) priorFocus.focus()
  }

  function openModal () {
    var dialog = modal()
    if (!dialog) return
    priorFocus = document.activeElement
    bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.hidden = false
    moveToDisplayRoot()
    syncViewport()
    ensureValine()
    var initialFocus = editor() || dialog.querySelector('.gf-close') || dialog.querySelector('.gf-dialog')
    if (initialFocus) initialFocus.focus()
    window.setTimeout(function () {
      if (!modal() || modal().hidden) return
      setPrefill()
      var field = editor()
      if (field && !modal().hidden) field.focus()
    }, 50)
  }

  function ensureUi () {
    if (!document.getElementById('game-feedback-style')) document.head.appendChild(css)
    if (!feedbackModal) {
      var dialog = document.createElement('div')
      dialog.id = 'game-feedback-modal'
      dialog.hidden = true
      dialog.innerHTML = '<div class="gf-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="game-feedback-title"><div class="gf-head"><div><p class="gf-eyebrow">GAME FEEDBACK</p><h2 class="gf-title" id="game-feedback-title">游戏意见反馈</h2></div><button class="gf-close" type="button" data-gf-close aria-label="关闭反馈窗口">×</button></div><p class="gf-copy">告诉我们你的建议，或描述遇到的问题。标题已根据当前游戏自动填写。</p><p class="gf-archive">提交后会统一同步到「联系我们 → 留言」，方便集中查看。</p><div class="gf-valine" id="game-feedback-valine"></div><p class="gf-error" role="status" aria-live="polite"></p></div>'
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog || event.target.closest('[data-gf-close]')) closeModal()
      })
      dialog.addEventListener('click', function (event) {
        var submit = event.target.closest('.vsubmit')
        if (!submit) return

        var field = editor()
        var value = field ? String(field.value || '') : ''
        var title = feedbackTitle()
        var existingTitle = value.match(/^【[^】]+游戏反馈】/)
        var message = existingTitle ? value.slice(existingTitle[0].length) : value
        var error = dialog.querySelector('.gf-error')
        if (!message.trim()) {
          event.preventDefault()
          event.stopImmediatePropagation()
          if (error) error.textContent = '请先填写反馈内容，再提交。'
          if (field) field.focus()
          return
        }
        if (field && value.indexOf(title) !== 0) {
          field.value = feedbackPrefix() + message
          if (field.dataset) field.dataset.gfPrefill = feedbackPrefix()
          field.dispatchEvent(new Event('input', { bubbles: true }))
        }
        if (error) error.textContent = ''
      }, true)
      dialog.addEventListener('focusin', function (event) {
        if (event.target.matches && event.target.matches('.veditor')) {
          syncViewportSoon()
          revealEditor(event.target)
        }
      })
      dialog.addEventListener('input', function (event) {
        if (event.target.matches('.veditor')) {
          var error = dialog.querySelector('.gf-error')
          if (error) error.textContent = ''
        }
      })
      ;['keydown', 'keyup', 'keypress'].forEach(function (type) {
        dialog.addEventListener(type, function (event) {
          if (type === 'keydown' && event.key === 'Escape') {
            event.preventDefault()
            closeModal()
          } else if (type === 'keydown' && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.matches('.veditor')) {
            event.preventDefault()
            var submit = dialog.querySelector('.vsubmit')
            if (submit) submit.click()
          } else if (type === 'keydown' && event.key === 'Tab' && event.target.matches('.veditor')) {
            if (event.shiftKey) keepTabInside(dialog, event)
            else {
              event.preventDefault()
              indentEditor(event.target)
            }
          } else if (type === 'keydown' && event.key === 'Tab') {
            keepTabInside(dialog, event)
          }
          // Keep normal textarea editing/defaults but do not let game-level handlers see keys.
          event.stopPropagation()
        })
      })
      feedbackModal = dialog
    }
    var heading = feedbackModal.querySelector('#game-feedback-title')
    if (heading) heading.textContent = currentGame + ' · 意见反馈'
    moveToDisplayRoot()
  }

  function syncRoute () {
    var path = normalizedPath()
    var game = gameNames[path]
    var dialogPresent = feedbackModal && feedbackModal.isConnected
    if (path === currentPath && (game ? dialogPresent : !dialogPresent)) {
      moveToDisplayRoot()
      return
    }
    currentPath = path
    if (!game) {
      if (feedbackModal && !feedbackModal.hidden) closeModal()
      currentGame = ''
      if (feedbackModal && feedbackModal.isConnected) feedbackModal.remove()
      return
    }
    currentGame = game
    ensureUi()
    if (feedbackModal && !feedbackModal.hidden) setPrefill()
  }

  function isolateExternalKeyboard (event) {
    var dialog = modal()
    if (!dialog || dialog.hidden || dialog.contains(event.target)) return
    if (event.type === 'keydown' && event.key === 'Escape') closeModal()
    else if (event.type === 'keydown') {
      event.preventDefault()
      var focusTarget = editor() || dialog.querySelector('.gf-close') || dialog.querySelector('.gf-dialog')
      if (focusTarget) focusTarget.focus()
    } else event.preventDefault()
    event.stopImmediatePropagation()
  }
  ;['keydown', 'keyup', 'keypress'].forEach(function (type) {
    window.addEventListener(type, isolateExternalKeyboard, true)
  })
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-game-feedback]')
    if (!trigger) return
    syncRoute()
    if (!currentGame) return
    var gameRoot = document.querySelector(gameRoots[currentPath])
    if (!gameRoot || !gameRoot.contains(trigger)) return
    event.preventDefault()
    event.stopPropagation()
    openModal()
  }, true)
  document.addEventListener('fullscreenchange', moveToDisplayRoot)
  document.addEventListener('webkitfullscreenchange', moveToDisplayRoot)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      syncViewport()
      var field = editor()
      if (field && document.activeElement === field) revealEditor(field)
    })
    window.visualViewport.addEventListener('scroll', syncViewport)
  }
  window.addEventListener('popstate', syncRoute)

  function start () {
    syncRoute()
    if (document.body && typeof MutationObserver !== 'undefined') {
      new MutationObserver(syncRoute).observe(document.body, { childList: true, subtree: true })
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
