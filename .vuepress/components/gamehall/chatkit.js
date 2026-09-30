// ============================================================
// 联机房间共用套件（gamehall/chatkit.js）
// ------------------------------------------------------------
// 供 gomoku / xiangqi / junqi 的 remote.js 复用的两块能力：
//
// 1) 全屏接管（enterFullscreen / exitFullscreen）
//    进入房间即整屏覆盖文章页：盖过主题导航与左下聊天浮标
//    （chat-widget z-index 9999），body 锁滚动。单机版游戏
//    （五子棋 .gk-fullscreen / 军棋 .jq-fullscreen）同款做法。
//
// 2) 聊天面板（chatDockHtml / bindChatDock / speakPhrase）
//    复刻麻将联机的语音体验：🎤 按钮点开面板 → 4 条快捷语
//    + 「按住说话」长按录音。与麻将的差异只在播报音色：
//    麻将快捷语播四川话预录音频，棋类用普通话 TTS
//    （speechSynthesis），文案也是棋类语境的普通话。
//    通道复用服务端 gameType 无关的 CHAT_MSG / VOICE_MSG relay：
//    快捷语只发序号（0-7，服务端白名单上限 8 条），文案由
//    收发两端本地查表。
// ============================================================

/** 棋类快捷语（普通话，≤8 条；面板展示前 4 条，对齐麻将 CHAT_PANEL_COUNT） */
export const CHAT_PHRASES = [
  '快点儿吧，我等不及了',
  '别急，让我想想',
  '好棋！',
  '这步走得漂亮！',
  '哎呀，大意了',
  '稳住，这局能赢',
  '承让承让',
  '痛快，再来一局！'
]
const PANEL_COUNT = 4

/**
 * 全屏接管：进入房间即整屏（等待室 + 对局 + 结算全程）。
 * 注意：class 只加在 <body> 上——#gameHall 是 Vue 管理的 vnode，
 * 父组件 re-render 打补丁时会把元素 class 重置回 "gh-root"（实测），
 * 而 body 在 Vue 应用外不受影响；CSS 选择器一律从 body.gkr-full 出发。
 */
export function enterFullscreen() {
  document.body.classList.add('gkr-lock')
  document.body.classList.add('gkr-full')
}

export function exitFullscreen() {
  document.body.classList.remove('gkr-lock')
  document.body.classList.remove('gkr-full')
}

/** 普通话 TTS 播报快捷语（连发时截断上一条） */
export function speakPhrase(text) {
  try {
    if (!window.speechSynthesis || !text) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    u.rate = 1.05
    window.speechSynthesis.speak(u)
  } catch (e) {
    /* 无 TTS 环境忽略 */
  }
}

/**
 * 聊天 dock 的 DOM：右下角 🎤 按钮 + 弹出面板（快捷语 + 按住说话）。
 * 录音状态由调用方通过返回的 setRecUI() 反馈到面板按钮上。
 */
export function chatDockHtml() {
  let phrases = ''
  for (let i = 0; i < PANEL_COUNT; i++) {
    phrases += '<button type="button" class="gkr-phrase" data-chat="phrase" data-idx="' + i + '">' + CHAT_PHRASES[i] + '</button>'
  }
  return (
    '<div class="gkr-voice-dock" data-gkr-voice-dock>' +
    '  <div class="gkr-chat-panel" data-chat-panel hidden>' +
    '    <div class="gkr-chat-phrases">' + phrases + '</div>' +
    '    <button type="button" class="gkr-chat-mic" data-chat="mic">🎤 按住说话</button>' +
    '    <div class="gkr-chat-tip" data-chat-tip>长按录音，松开发送</div>' +
    '  </div>' +
    '  <button type="button" class="gkr-mic" data-chat="toggle" aria-label="聊天与语音">🎤</button>' +
    '</div>'
  )
}

/**
 * 绑定 dock 交互。
 * @param {HTMLElement} dock chatDockHtml() 渲染出的根节点
 * @param {Object} handlers
 *   - onStartRec()        面板大按钮按下（开始录音）
 *   - onStopRec(cancel)   松开/滑出/取消（cancel=true 丢弃录音）
 *   - onPhrase(idx)       点了第 idx 条快捷语
 * @returns {{ setRecUI(on:boolean), closePanel(), destroy() }}
 */
export function bindChatDock(dock, { onStartRec, onStopRec, onPhrase } = {}) {
  const toggle = dock.querySelector('[data-chat="toggle"]')
  const panel = dock.querySelector('[data-chat-panel]')
  const micBtn = dock.querySelector('[data-chat="mic"]')
  const tip = dock.querySelector('[data-chat-tip]')

  const onToggle = ev => {
    ev.stopPropagation()
    panel.hidden = !panel.hidden
  }
  toggle.addEventListener('click', onToggle)

  const onPhraseClick = ev => {
    const btn = ev.target.closest('[data-chat="phrase"]')
    if (!btn) return
    panel.hidden = true
    if (onPhrase) onPhrase(Number(btn.getAttribute('data-idx')) || 0)
  }
  panel.addEventListener('click', onPhraseClick)

  // 长按录音（触屏 + 鼠标通用；拦 contextmenu 防 iOS 长按弹菜单）
  micBtn.addEventListener('pointerdown', ev => {
    ev.preventDefault()
    if (onStartRec) onStartRec()
  })
  micBtn.addEventListener('pointerup', () => onStopRec && onStopRec(false))
  micBtn.addEventListener('pointercancel', () => onStopRec && onStopRec(true))
  micBtn.addEventListener('pointerleave', () => onStopRec && onStopRec(false))
  micBtn.addEventListener('contextmenu', ev => ev.preventDefault())

  // 点面板外区域收起
  const onDocClick = ev => {
    if (!dock.contains(ev.target)) panel.hidden = true
  }
  document.addEventListener('click', onDocClick)

  return {
    setRecUI(on) {
      micBtn.classList.toggle('is-rec', !!on)
      tip.textContent = on ? '🎙 正在录音…松开发送' : '长按录音，松开发送'
    },
    closePanel() {
      panel.hidden = true
    },
    destroy() {
      document.removeEventListener('click', onDocClick)
    }
  }
}
