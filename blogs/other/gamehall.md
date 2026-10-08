---
meta:
  # viewport 必须排在 head 最前并带 viewport-fit=cover（与麻将/五子棋页同款，
  # iOS 刘海机型才会注入 env(safe-area-inset-*)）。
  - name: viewport
    content: width=device-width, initial-scale=1, viewport-fit=cover
  - name: apple-mobile-web-app-capable
    content: 'yes'
  - name: mobile-web-app-capable
    content: 'yes'
  - name: apple-mobile-web-app-status-bar-style
    content: black-translucent
  - name: apple-mobile-web-app-title
    content: 联机大厅
---

::: warning 联机大厅 · 好友同房对战
所有游戏共用一个大厅（全服最多 20 个房间）：创建房间拿到房号发给好友，或点分享链接直接坐下。空位可由房主补 AI；掉线自动重连并临时托管，只有点「退出房间」才真正离开。当前开放五子棋、中国象棋、四国军棋、斗地主、四川麻将联机（五子棋黑先白后、象棋红先黑后，均为每局换先；军棋 4 人 2v2，对家为队友，只能看到自己的棋子，布阵后掷骰定先手；斗地主 3 人对局，叫分定地主 → 抢地主 → 加倍 → 出牌，超时自动托管；棋类均为胜 +10 / 负 -10，斗地主地主 ±20 / 农民 ±10，任一家 ≤0 破产终局）。麻将房在大厅直接创建（换三张 / 幺鸡赖子 / 封顶番数），创建后自动跳到麻将牌桌。
:::

<div id="gameHall" class="gh-root"></div>

<style>
/* ============ 容器（深色面板，与五子棋页同款） ============ */
.gh-root {
  max-width: 720px;
  margin: 18px auto;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.gh-root [hidden] { display: none !important; }
.gh-root button { font: inherit; }
.gh-lobby, .gh-room {
  background: linear-gradient(160deg, #242a3c 0%, #171b27 55%, #10131c 100%);
  border-radius: 20px;
  padding: 18px 18px 16px;
  box-shadow: 0 18px 44px rgba(10, 12, 20, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  color: #e8eaf2;
  position: relative;
}

/* ============ 顶栏 ============ */
.gh-topbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.gh-title {
  font-size: 22px; font-weight: 800; letter-spacing: 2px; margin-right: auto;
  background: linear-gradient(135deg, #ffd9a0, #ff9d5c);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.gh-name-row { display: flex; gap: 8px; align-items: center; }
.gh-name, .gh-code {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e8eaf2;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 14px;
  outline: none;
  min-height: 38px;
  box-sizing: border-box;
}
.gh-name { width: 130px; }
.gh-code { width: 96px; letter-spacing: 2px; text-transform: uppercase; }
.gh-name:focus, .gh-code:focus { border-color: rgba(255, 178, 107, 0.6); }

/* ============ 按钮 ============ */
.gh-btn {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: #dfe4f0;
  font-size: 13.5px;
  padding: 9px 16px;
  border-radius: 12px;
  cursor: pointer;
  min-height: 38px;
  transition: background 0.2s ease, filter 0.2s ease;
}
/* hover 仅对真指针设备生效（移动端 tap 后 :hover 会粘住） */
@media (hover: hover) and (pointer: fine) {
  .gh-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
}
.gh-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.gh-btn-primary {
  background: linear-gradient(135deg, #ffb26b, #ff7e3d);
  border: none; color: #2a1500; font-weight: 700;
  box-shadow: 0 4px 14px rgba(255, 126, 61, 0.35);
}
@media (hover: hover) and (pointer: fine) {
  .gh-btn-primary:hover:not(:disabled) { background: linear-gradient(135deg, #ffb26b, #ff7e3d); filter: brightness(1.07); }
}

/* ============ 恢复横幅 ============ */
.gh-resume {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: rgba(255, 178, 107, 0.1);
  border: 1px solid rgba(255, 178, 107, 0.35);
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 13.5px;
}
.gh-resume .gh-btn { min-height: 32px; padding: 5px 12px; font-size: 12.5px; }

/* ============ 操作行 / 建房面板 ============ */
.gh-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
.gh-join { display: flex; gap: 8px; margin-left: auto; }
.gh-create {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
}
.gh-create-game { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.gh-create-game button {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent; color: #aeb6c9;
  padding: 7px 16px; border-radius: 999px; cursor: pointer; font-size: 13.5px;
  white-space: nowrap;
}
.gh-create-game button.active {
  background: rgba(255, 178, 107, 0.92); border-color: transparent;
  color: #231300; font-weight: 700;
}
/* ♞ 是文本符号（非 emoji），比 ⚫🎖🀄 小一圈，放大对齐视觉尺寸 */
.gh-ico-xq { font-size: 1.35em; line-height: 1; }
.gh-create-opts { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
.gh-create-opts .gh-field, .gkr-rules-row .gh-field { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #aeb6c9; }
/* 分段 chips（替代系统 select，与筛选 tab 同款） */
.gh-seg { display: inline-flex; gap: 4px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 10px; padding: 3px; }
.gh-seg button {
  appearance: none; -webkit-appearance: none; border: none; background: transparent;
  color: #c7cddb; border-radius: 8px; padding: 5px 12px; font-size: 12.5px; font-family: inherit;
  cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; white-space: nowrap;
}
.gh-seg button.active { background: linear-gradient(135deg, #f6c66d, #eda93f); color: #241708; font-weight: 600; }
.gh-seg.is-disabled button { cursor: default; opacity: 0.65; }
.gh-seg.is-disabled button.active { opacity: 1; }
/* 步进器（与麻将大厅同款交互） */
.gh-stepper { display: inline-flex; align-items: center; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 10px; overflow: hidden; background: rgba(255, 255, 255, 0.05); }
.gh-stepper button {
  appearance: none; -webkit-appearance: none; width: 32px; height: 30px; padding: 0; border: none;
  background: transparent; color: #f6c66d; font-family: inherit; font-size: 16px; font-weight: 800;
  line-height: 1; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.gh-stepper button:active { background: rgba(246, 198, 109, 0.15); }
.gh-stepper button:disabled { color: rgba(246, 198, 109, 0.28); cursor: default; }
.gh-stepper button:disabled:active { background: transparent; }
.gh-stepper-val { min-width: 52px; text-align: center; font-size: 12.5px; color: #e8eaf2; }
.gh-stepper.is-disabled button { color: rgba(246, 198, 109, 0.35); cursor: default; }
.gh-stepper.is-disabled button:active { background: transparent; }
/* 固定规则说明（不可改；虚线框与可操作控件区分，高度与步进器对齐） */
.gh-field.gkr-fixed-rule {
  border: 1px dashed rgba(255, 255, 255, 0.16); border-radius: 10px;
  padding: 0 12px; min-height: 32px; box-sizing: border-box;
  color: #8b93a7; font-size: 12.5px; white-space: nowrap;
}
.gh-create-btns { display: flex; gap: 10px; }
.gh-hint { font-size: 12.5px; color: #8b93a8; }
.gh-list-meta { font-size: 12px; color: #6d7488; margin-bottom: 8px; }

/* ============ 房间卡片 ============ */
.gh-list { display: flex; flex-direction: column; gap: 10px; }
.gh-card {
  display: flex; align-items: center; gap: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px; padding: 12px 14px;
}
.gh-card-game { font-size: 26px; flex: none; }
.gh-card-body { flex: 1; min-width: 0; }
.gh-card-title { font-size: 15px; font-weight: 700; }
.gh-card-code { color: #ffb26b; letter-spacing: 1.5px; margin-left: 6px; }
.gh-card-sub { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.gh-pill {
  font-size: 11.5px; color: #aeb6c9;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 999px; padding: 2px 9px;
}
.gh-st-WAITING { color: #7be495; }
.gh-st-PLAYING { color: #ffd9a0; }
.gh-st-FINISHED { color: #8b93a8; }
.gh-card-sit { flex: none; }
.gh-card-full { flex: none; font-size: 12.5px; color: #6d7488; }
.gh-empty { text-align: center; color: #8b93a8; font-size: 13.5px; padding: 34px 0; }
/* 首屏加载占位：呼吸感提示，避免冷启动空白被当成「卡死」 */
.gh-loading { animation: ghLoadingPulse 1.1s ease-in-out infinite; }
@keyframes ghLoadingPulse { 50% { opacity: 0.45; } }

/* ============ 五子棋房间 ============ */
.gkr-room-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.gkr-room-title { font-size: 18px; font-weight: 800; margin-right: auto; }
.gkr-code { color: #ffb26b; letter-spacing: 2px; }
.gkr-head-btns { display: flex; gap: 8px; }
.gkr-btn {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: #dfe4f0; font-size: 13px; padding: 8px 14px;
  border-radius: 12px; cursor: pointer; min-height: 36px;
  transition: background 0.2s ease, filter 0.2s ease;
}
@media (hover: hover) and (pointer: fine) {
  .gkr-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
}
.gkr-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.gkr-btn-primary {
  background: linear-gradient(135deg, #ffb26b, #ff7e3d);
  border: none; color: #2a1500; font-weight: 700;
  box-shadow: 0 4px 14px rgba(255, 126, 61, 0.35);
}
.gkr-btn-danger { color: #ff9d92; }
.gkr-btn-mini { min-height: 30px; padding: 4px 10px; font-size: 12px; border-radius: 9px; }
.gkr-status-pill {
  display: flex; justify-content: center; align-items: center;
  margin: 0 auto 10px; width: fit-content;
  padding: 7px 18px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 13.5px; color: #cdd3e3;
}
.gkr-status-pill.is-thinking { color: #ffd9a0; }

/* 等待室 */
.gkr-seats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.gkr-seat {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px; padding: 14px;
  display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
}
.gkr-seat.is-me { border-color: rgba(255, 178, 107, 0.5); }
.gkr-seat-name { font-size: 15px; font-weight: 700; }
.gkr-seat-name.gkr-empty { color: #6d7488; }
.gkr-seat-sub { font-size: 12.5px; color: #8b93a8; }
.gkr-rules-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 14px; }
.gkr-waiting-actions { display: flex; flex-direction: column; gap: 8px; align-items: center; margin-bottom: 12px; }
.gkr-waiting-actions .gkr-btn-primary { min-width: 180px; }
.gkr-share-hint, .gkr-hint { text-align: center; font-size: 12.5px; color: #8b93a8; }
.gkr-share-hint b { color: #ffb26b; letter-spacing: 1.5px; }

/* 对局 */
.gkr-players { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.gkr-pl {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px; padding: 5px 12px; font-size: 12.5px;
}
.gkr-pl.is-me { border-color: rgba(255, 178, 107, 0.5); }
.gkr-pl.is-turn { box-shadow: 0 0 0 2px rgba(123, 228, 149, 0.35); }
.gkr-pl-name { font-weight: 700; }
.gkr-pl-score { color: #ffd9a0; }
.gkr-pl-state { color: #8b93a8; font-size: 11.5px; }
.gkr-round { margin-left: auto; font-size: 12px; color: #8b93a8; }
.gkr-board-wrap { display: flex; justify-content: center; }
.gkr-board-wrap canvas { border-radius: 12px; cursor: pointer; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45); max-width: 100%; }
.gkr-game-foot { text-align: center; margin-top: 10px; min-height: 18px; }

/* 结算 */
.gkr-settle {
  position: absolute; inset: 0; z-index: 5;
  display: flex; align-items: center; justify-content: center;
  background: rgba(10, 12, 18, 0.55); border-radius: 20px;
}
.gkr-settle-card {
  background: rgba(24, 28, 40, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px; padding: 24px 30px; text-align: center;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  max-width: 86%;
}
.gkr-settle-title { font-size: 24px; font-weight: 800; margin-bottom: 6px; }
.gkr-settle-title.is-win { color: #7be495; }
.gkr-settle-title.is-loss { color: #ff8a80; }
.gkr-settle-title.is-draw { color: #f5c542; }
.gkr-settle-sub { font-size: 12.5px; color: #9aa3b8; margin-bottom: 12px; }
.gkr-settle-scores { display: flex; flex-direction: column; gap: 5px; font-size: 14.5px; font-weight: 600; color: #e8ecf5; margin-bottom: 16px; }
.gkr-settle-score.is-bust { color: #ff8a80; }
.gkr-settle-btns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.gkr-settle-final { font-size: 13px; color: #ff8a80; margin-bottom: 4px; width: 100%; }

/* 语音 / 聊天 dock：复刻麻将联机 scmj-chat 绿金样式（结构见 gamehall/chatkit.js） */
.gkr-voice-dock {
  position: fixed; right: max(14px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom));
  z-index: 30; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
}
.gkr-chat-btn {
  width: 44px; height: 44px; border-radius: 50%;
  border: 1.5px solid rgba(212, 175, 55, 0.65);
  background: rgba(9, 40, 21, 0.92); color: #f3ead8; font-size: 19px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4); cursor: pointer;
  touch-action: none; -webkit-user-select: none; user-select: none;
}
.gkr-chat-btn span { font-size: 9px; line-height: 11px; }
.gkr-chat-btn:active { transform: scale(0.94); }
/* 拖动挂边（bindChatDock）：固定吸附右缘（不再支持左吸附，避免面板重叠），
   面板/录音提示统一在按钮左侧展开，纵向位置可调、横向由视口实时计算 */
/* hidden 兜底：dock 会被 portal 到 body（斗地主游戏中，见 _floatVoiceDock），
   脱离 .gh-root 后 `.gh-root [hidden]` 够不着——而 .gkr-chat-panel 的
   display:grid / .gkr-chat-btn 的 display:flex 会压过浏览器默认的
   [hidden]，导致面板一进游戏就常开。这条不依赖任何祖先，dock 内一律生效 */
.gkr-voice-dock [hidden] { display: none !important; }
/* portal 到 body 的悬浮态（斗地主游戏中：脱离牌桌与房间壳的层叠/坐标系，
   横屏下 fixed 定位回归视口；z-index 压过牌桌 1000 与房间壳 10000） */
.gkr-voice-dock.is-floating { z-index: 15020 !important; }
.gkr-chat-rectip {
  position: absolute; right: 52px; bottom: 0; z-index: 1; pointer-events: none;
  padding: 6px 12px; border-radius: 999px;
  background: rgba(140, 24, 24, 0.95); border: 1px solid rgba(255, 138, 122, 0.7);
  color: #ffe9e6; font-size: 12.5px; white-space: nowrap;
}
.gkr-chat-panel {
  position: absolute; right: 0; bottom: 52px;
  /* 棋类短语较长（10 字 vs 麻将 3~4 字），两列一行放不下（挤压出横向溢出，
     要左右滑动才能看完）——单列多行，短语整行显示 */
  display: grid; grid-template-columns: 1fr; gap: 6px;
  padding: 10px; border-radius: 14px;
  background: rgba(9, 40, 21, 0.96); border: 1px solid rgba(212, 175, 55, 0.55);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5);
  width: 228px; max-width: calc(100vw - 24px); box-sizing: border-box;
}
/* 展开方向自适应（bindChatDock.updatePanelDir）：dock 被拖到接近顶部时，
   默认向上弹的面板会顶出屏幕上方，改加 .is-down 以 dock 底为基准向下展开；
   限高可滚动，避免矮屏横屏时反向溢出底部。横屏面板本就向左展开
   （见下方 media query），此规则只改纵向锚点，横向仍是左展开 */
.gkr-voice-dock.is-down .gkr-chat-panel {
  top: calc(100% + 8px); bottom: auto;
  max-height: calc(100dvh - 112px); overflow-y: auto;
}
/* 面板顶部全宽「按住说话」：最常用的语音入口放第一位，短语退居其次 */
.gkr-chat-micbtn {
  grid-column: 1 / -1; padding: 12px 10px; border-radius: 10px;
  border: 1.5px solid rgba(212, 175, 55, 0.65);
  background: rgba(23, 77, 46, 0.9); color: #ffd968; font-size: 14px;
  white-space: nowrap; cursor: pointer;
  touch-action: none; -webkit-user-select: none; user-select: none;
}
.gkr-chat-micbtn:active { background: rgba(212, 175, 55, 0.3); }
/* 麦克风被拒常驻红条：iOS 拒绝过就静默秒拒、永不重弹，用户只会觉得
   「按住说话没反应」，必须在面板里把去路写明白 */
.gkr-chat-micdeny {
  border: 1px solid rgba(255, 138, 122, 0.7); border-radius: 10px;
  background: rgba(140, 24, 24, 0.9); color: #ffe9e6;
  padding: 8px 10px; font-size: 12px; line-height: 1.5;
}
.gkr-chat-phrase {
  padding: 8px 10px; border-radius: 10px;
  border: 1px solid rgba(212, 175, 55, 0.4);
  background: rgba(23, 77, 46, 0.85); color: #f3ead8; font-size: 13px;
  /* 棋类短语比麻将长（10 字 vs 麻将 3~4 字），nowrap 会横向溢出格子，
     必须允许换行并左对齐（「快捷语弹出来都是溢出的」的根因） */
  white-space: normal; text-align: left; line-height: 1.35;
  word-break: break-all; cursor: pointer;
}
.gkr-chat-phrase:active { background: rgba(212, 175, 55, 0.3); }
/* 录音态（toggle 圆钮与按住说话按钮共用，须放在各按钮底色规则之后才能盖过） */
.gkr-chat-mic-on {
  background: rgba(140, 24, 24, 0.95);
  border-color: #ff8a7a;
  animation: gkrMicPulse 1s ease-in-out infinite;
}
@keyframes gkrMicPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 90, 70, 0.55); }
  50% { box-shadow: 0 0 0 9px rgba(255, 90, 70, 0); }
}
.gkr-bubbles {
  position: fixed; left: max(14px, env(safe-area-inset-left)); bottom: max(18px, env(safe-area-inset-bottom));
  z-index: 30; display: flex; flex-direction: column; gap: 6px;
}
.gkr-bubble {
  border: 1px solid rgba(212, 175, 55, 0.6);
  background: rgba(9, 40, 21, 0.96); color: #f3ead8;
  border-radius: 999px; padding: 6px 14px; font-size: 12.5px; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  transition: opacity 0.24s ease, transform 0.24s ease;
}
.gkr-bubble.is-mine { border-color: rgba(255, 217, 104, 0.9); color: #ffd968; }
.gkr-bubble.is-out { opacity: 0; transform: translateY(-6px); pointer-events: none; }
.gkr-bubble.is-chat { cursor: default; }

/* 横屏（矮屏）：dock 缩小，面板改为向左展开——向上弹会盖住横屏右栏的
   玩家卡 / 控制区（「快捷语音 UI 溢出遮人」的修复）；面板限高可滚动 */
@media (max-height: 560px) and (orientation: landscape) {
  .gkr-chat-btn { width: 38px; height: 38px; font-size: 16px; }
  .gkr-chat-btn span { font-size: 8px; line-height: 10px; }
  .gkr-chat-panel {
    right: 46px; bottom: 0; width: 216px;
    max-height: calc(100dvh - 20px); overflow-y: auto;
  }
  .gkr-chat-rectip { right: 44px; padding: 5px 10px; font-size: 11.5px; }
  /* 底部 76px padding 是竖屏给 dock 让位的；横屏棋盘受高度约束后
     垂直居中在上半区，底下空一截（「象棋横屏联机底部留白」）。
     收窄 padding 并让房间容器垂直居中：auto margin 方案在内容超高时
     自动退化为普通滚动，不会像 flex align-items:center 那样裁掉顶部 */
  body.gkr-full .gh-root { display: flex; flex-direction: column; padding-bottom: max(6px, env(safe-area-inset-bottom)); }
  body.gkr-full .gh-root > .gh-room { margin-top: auto; margin-bottom: auto; }
}

/* ============ 房间全屏接管（盖过主题导航与左下聊天浮标 cw-fab:9999） ============ */
/* class 挂在 body 上（Vue patch 会重置 #gameHall 自身的 class），选择器从 body 出发 */
body.gkr-full .gh-root {
  position: fixed; inset: 0; z-index: 10000;
  max-width: none; margin: 0; border-radius: 0;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
  background: linear-gradient(160deg, #242a3c 0%, #171b27 55%, #10131c 100%);
  padding: calc(10px + env(safe-area-inset-top)) 12px calc(76px + env(safe-area-inset-bottom));
}
body.gkr-lock { overflow: hidden !important; }
body.gkr-lock #cw-fab, body.gkr-lock #cw-panel, body.gkr-lock .back-to-ceiling { display: none !important; }
/* reco 主题页面容器带 transform，会把 fixed 后代的 z-index 困在局部 stacking
   context（导航栏 z-20 反而压在房间 z-10000 上）；全屏时拆掉，并直接隐藏导航栏 */
body.gkr-full .theme-reco-content, body.gkr-full .page { transform: none !important; }
body.gkr-full #navbar, body.gkr-full .navbar { display: none !important; }
/* 全屏后垂直空间全部释放：棋盘按视口放大（受底部语音 dock 与状态条约束） */
body.gkr-full .gkr-stage { max-width: 760px; margin: 0 auto; width: 100%; }
body.gkr-full .gkr-board-wrap,
body.gkr-full .gk-board-wrap { max-width: min(96vw, calc(100dvh - 240px)) !important; margin-left: auto; margin-right: auto; }
/* 斗地主联机不走 gkr-full 壳：牌桌 setImmersive(true) 直接 portal 到 body
   （.ddz-full z-index:1000），游戏期间壳已退出全屏。body.ddz-ingame 与
   gkr-full 同款拆 transform 陷阱 + 抬高语音/气泡/提示层——否则 fixed 的
   语音 dock 既被困在主题 transform 层叠上下文里、z-index:30 又低于牌桌，
   表现为「开始游戏后语音按钮看不见」 */
body.ddz-ingame .theme-reco-content, body.ddz-ingame .page { transform: none !important; }
body.ddz-ingame .gkr-voice-dock, body.ddz-ingame .gkr-bubbles { z-index: 15020; }
body.ddz-ingame .gkr-toast { z-index: 15030; }

/* 提示 */
.gh-toast, .gkr-toast {
  position: fixed; left: 50%; bottom: 90px; transform: translateX(-50%);
  background: rgba(20, 24, 36, 0.95); color: #e8eaf2;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px; padding: 9px 20px; font-size: 13px; z-index: 60;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  max-width: 86vw; text-align: center;
}

/* ============ 军棋房间（对局棋盘复用单机组件 FourKingdoms.vue） ============ */
.jqr-army-tag {
  display: inline-block; border-radius: 6px; padding: 1px 7px; margin-right: 7px;
  font-size: 11px; color: #f8efd5; letter-spacing: 1px;
}
.jqr-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
/* 单机组件全屏层 .jq-fullscreen 为 z-15000：语音条 / 气泡 / 提示 / 结算浮层需压在其上 */
body.gkr-full .gkr-voice-dock, body.gkr-full .gkr-bubbles { z-index: 15020; }
body.gkr-full .gkr-toast { z-index: 15030; }
.gkr-settle.gkr-settle-fixed { position: fixed; z-index: 15010; border-radius: 0; }

/* ============ 移动端 ============ */
@media (max-width: 640px) {
  .gh-lobby, .gh-room { padding: 14px 12px 12px; border-radius: 16px; }
  .gh-title { font-size: 19px; }
  .gh-join { margin-left: 0; width: 100%; }
  .gh-join .gh-code { flex: 1; }
  .gh-actions .gh-btn-primary { width: 100%; }
  .gkr-room-head .gkr-head-btns { width: 100%; }
  .gkr-room-head .gkr-head-btns .gkr-btn { flex: 1; }
  .gkr-settle-card { padding: 18px 20px; }
}
</style>

<script>
export default {
  mounted() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    this.$nextTick(async () => {
      const root = this.$el && this.$el.querySelector ? this.$el.querySelector('#gameHall') : null
      if (!root) return
      if (window.__gameHall) {
        try { window.__gameHall.destroy() } catch (e) { /* 忽略 */ }
        window.__gameHall = null
      }
      try {
        const { default: GameHall } = await import('../../.vuepress/components/gamehall/hall.js')
        if (this._isDestroyed || !root.isConnected) return
        this._hall = new GameHall(root)
        this._hall.mount()
        window.__gameHall = this._hall
      } catch (err) {
        console.error('[联机大厅] 初始化失败：', err)
      }
    })
  },
  beforeDestroy() {
    if (this._hall) {
      try { this._hall.destroy() } catch (e) { /* 忽略 */ }
      this._hall = null
    }
    if (typeof window !== 'undefined' && window.__gameHall) window.__gameHall = null
  }
}
</script>
