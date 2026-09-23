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
    '#game-feedback-modal .gf-valine{min-height:190px}',
    '#game-feedback-modal .vheader,#game-feedback-modal .vinfo,#game-feedback-modal .vcards,#game-feedback-modal .vpage{display:none!important}',
    '#game-feedback-modal .vwrap{border:1px solid #dce3e8!important;border-radius:12px!important;background:#fff!important}',
    '#game-feedback-modal .veditor{min-height:150px;max-height:36vh;padding:14px!important;font:14px/1.7 system-ui,-apple-system,"Segoe UI",sans-serif!important;color:#253142!important}',
    '#game-feedback-modal .vrow{padding:4px 10px 10px}',
    '#game-feedback-modal .vsubmit{min-width:88px;border:0!important;border-radius:9px!important;background:#176b59!important;color:#fff!important;font-size:14px!important}',
    '#game-feedback-modal .status-bar{font-size:12px;color:#39725f}',
    // 移动端改为底部抽屉：头部固定，Valine 区域独立滚动，保证提交按钮不会被软键盘顶出屏幕。
    '@media(max-width:640px){#game-feedback-modal{padding:0;align-items:flex-end}#game-feedback-modal .gf-dialog{width:100%;max-width:none;max-height:100%;border:0;border-radius:18px 18px 0 0;padding:16px 16px calc(14px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;overflow:hidden}#game-feedback-modal .gf-head{flex:none;margin-bottom:6px}#game-feedback-modal .gf-eyebrow{font-size:11px}#game-feedback-modal .gf-title{font-size:19px}#game-feedback-modal .gf-close{flex:none;width:44px;height:44px;border-radius:13px;font-size:26px}#game-feedback-modal .gf-copy{flex:none;margin-bottom:6px;font-size:13px}#game-feedback-modal .gf-archive{flex:none;margin-bottom:10px;font-size:11.5px}#game-feedback-modal .gf-valine{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}#game-feedback-modal input,#game-feedback-modal textarea{font-size:16px!important}#game-feedback-modal .veditor{min-height:116px;max-height:42vh;padding:12px!important;font-size:16px!important;line-height:1.6!important}#game-feedback-modal .vrow{padding:6px 0 8px}#game-feedback-modal .vsubmit{min-width:112px;min-height:44px;border-radius:11px!important;font-size:15px!important}#game-feedback-modal .gf-error{flex:none;margin-top:4px;font-size:12.5px}}'
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

  // iOS 弹出软键盘时只改变 visualViewport，position:fixed 的参考框不变，
  // 因此把遮罩层锁到可视区域，弹窗与提交按钮才会留在键盘之上。
  function syncViewport () {
    var dialog = modal()
    if (!dialog) return
    var viewport = window.visualViewport
    if (!viewport || dialog.hidden) {
      dialog.style.top = ''
      dialog.style.bottom = ''
      dialog.style.height = ''
      return
    }
    dialog.style.top = viewport.offsetTop + 'px'
    dialog.style.height = viewport.height + 'px'
    dialog.style.bottom = 'auto'
  }

  function revealEditor (field) {
    if (!field) return
    window.setTimeout(function () {
      if (!modal() || modal().hidden || document.activeElement !== field) return
      var viewport = window.visualViewport
      if (!viewport || viewport.height >= window.innerHeight - 80) return
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
        if (event.target.matches && event.target.matches('.veditor')) revealEditor(event.target)
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
