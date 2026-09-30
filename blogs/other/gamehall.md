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
所有游戏共用一个大厅（全服最多 20 个房间）：创建房间拿到房号发给好友，或点分享链接直接坐下。空位可由房主补 AI；掉线自动重连并临时托管，只有点「退出房间」才真正离开。当前开放五子棋、中国象棋、四国军棋、四川麻将联机（五子棋黑先白后、象棋红先黑后，均为每局换先；军棋 4 人 2v2，对家为队友，只能看到自己的棋子，布阵后掷骰定先手；棋类均为胜 +10 / 负 -10，任一家 ≤0 破产终局）。麻将房在大厅直接创建（换三张 / 幺鸡赖子 / 封顶番数），创建后自动跳到麻将牌桌。
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
.gkr-settle-scores { display: flex; flex-direction: column; gap: 4px; font-size: 14px; margin-bottom: 16px; }
.gkr-settle-score.is-bust { color: #ff8a80; }
.gkr-settle-btns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.gkr-settle-final { font-size: 13px; color: #ff8a80; margin-bottom: 4px; width: 100%; }

/* 语音 */
.gkr-voice-dock {
  position: fixed; right: max(14px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom));
  z-index: 30; display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.gkr-mic {
  width: 52px; height: 52px; border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(30, 35, 52, 0.92); color: #fff; font-size: 21px;
  cursor: pointer; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  touch-action: none; -webkit-user-select: none; user-select: none;
}
.gkr-mic.is-rec { background: #d24a35; transform: scale(1.1); }
.gkr-voice-tip { font-size: 10.5px; color: #8b93a8; }
.gkr-bubbles {
  position: fixed; left: max(14px, env(safe-area-inset-left)); bottom: max(18px, env(safe-area-inset-bottom));
  z-index: 30; display: flex; flex-direction: column; gap: 6px;
}
.gkr-bubble {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(30, 35, 52, 0.92); color: #dfe4f0;
  border-radius: 999px; padding: 6px 14px; font-size: 12.5px; cursor: pointer;
}
.gkr-bubble.is-mine { border-color: rgba(255, 178, 107, 0.5); }
.gkr-bubble.is-old { opacity: 0.55; }

/* 提示 */
.gh-toast, .gkr-toast {
  position: fixed; left: 50%; bottom: 90px; transform: translateX(-50%);
  background: rgba(20, 24, 36, 0.95); color: #e8eaf2;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px; padding: 9px 20px; font-size: 13px; z-index: 60;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  max-width: 86vw; text-align: center;
}

/* ============ 军棋房间棋盘 ============ */
.jqr-board-wrap { display: flex; justify-content: center; }
.jqr-board {
  width: min(100%, 620px); height: auto; display: block;
  border-radius: 12px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  touch-action: manipulation; user-select: none; -webkit-user-select: none;
}
.jqr-node { cursor: pointer; }
.jqr-piece-t { font-size: 17px; font-weight: 800; font-family: 'Songti SC', 'SimSun', serif; pointer-events: none; }
.jqr-site-label { fill: #abb68d; font-size: 12px; pointer-events: none; }
.jqr-army-tag {
  display: inline-block; border-radius: 6px; padding: 1px 7px; margin-right: 7px;
  font-size: 11px; color: #f8efd5; letter-spacing: 1px;
}
.jqr-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.jqr-actions { display: flex; gap: 8px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 10px; }
.jqr-actions-note { width: 100%; text-align: center; font-size: 12px; color: #8b93a8; }
.jqr-log {
  margin-top: 10px; background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;
  padding: 8px 12px; max-height: 118px; overflow: auto;
  font-size: 12px; line-height: 1.7; color: #b9c2d4;
}
.jqr-log ol { margin: 0; padding: 0; list-style: none; }
.jqr-log li:first-child { color: #ffd9a0; }

/* 军棋掷骰定先手 */
.jqr-dice { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 20px; background: rgba(6, 15, 12, 0.8); }
.jqr-dice-card {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  padding: 24px 30px; border: 1px solid #c6ac70; border-radius: 20px;
  background: #122a25; box-shadow: 0 18px 60px rgba(0, 0, 0, 0.6);
  max-width: 92vw; max-height: 86vh; overflow: auto;
}
.jqr-dice-title { color: #e5c785; font-size: 16px; font-weight: 800; letter-spacing: 4px; }
.jqr-dice-round-tag { font-size: 11px; letter-spacing: 2px; color: #9fb2a3; }
.jqr-dice-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: min(320px, 80vw); }
.jqr-dice-rows li { display: flex; align-items: center; gap: 10px; padding: 7px 12px; border: 1px solid #3f5951; border-radius: 12px; background: #1b352e; }
.jqr-dice-rows li.is-past { opacity: 0.55; }
.jqr-dice-rows li.is-first { border-color: #ffdda1; background: #2b4839; }
.jqr-dice-seat { flex: 0 0 auto; width: 9px; height: 9px; border-radius: 50%; }
.jqr-dice-army { min-width: 46px; font-size: 14px; letter-spacing: 2px; color: #f3eddd; }
.jqr-dice-hand { display: flex; gap: 8px; margin-left: auto; }
.jqr-die {
  display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
  gap: 2px; width: 32px; height: 32px; padding: 5px; border-radius: 8px;
  background: linear-gradient(#fffdf2, #e3d9bd);
  box-shadow: inset 0 -2px 0 #bfb392, 0 3px 8px rgba(0, 0, 0, 0.5);
}
.jqr-die i { border-radius: 50%; }
.jqr-die i.is-on { background: #26382f; }
.jqr-dice-rows strong { min-width: 28px; font-family: Georgia, serif; font-size: 19px; color: #e5d09c; text-align: right; }
.jqr-dice-msg { min-height: 18px; font-size: 13px; color: #e9e2c9; text-align: center; }

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
  .jqr-dice-card { padding: 18px 16px; gap: 10px; }
  .jqr-die { width: 27px; height: 27px; padding: 4px; }
  .jqr-log { max-height: 90px; }
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
