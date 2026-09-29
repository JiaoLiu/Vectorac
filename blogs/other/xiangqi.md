---
title: 中国象棋 · 楚河汉界
pageClass: xiangqi-page
meta:
  - name: viewport
    content: width=device-width, initial-scale=1, viewport-fit=cover
  - name: description
    content: 中国象棋网页版，红黑对弈、本地 AI 三档难度、悔棋和着法提示，支持手机与沉浸模式。
  - name: apple-mobile-web-app-capable
    content: 'yes'
  - name: mobile-web-app-capable
    content: 'yes'
  - name: apple-mobile-web-app-status-bar-style
    content: black-translucent
  - name: apple-mobile-web-app-title
    content: 中国象棋
---

<div id="xiangqiGame" class="xq-root">
  <div class="xq-topbar">
    <div class="xq-brand">
      <div class="xq-brand-mark" aria-hidden="true"><span>帅</span><i>将</i></div>
      <div><div class="xq-kicker">棋逢对手 · 方寸之间</div><h1>中国象棋</h1></div>
    </div>
    <div class="xq-top-actions">
      <span class="xq-move-count" data-xq-move-count>0 手</span>
      <button type="button" class="xq-btn xq-btn-quiet" data-xq-fullscreen>沉浸对弈</button>
      <button type="button" class="xq-btn xq-btn-quiet xq-feedback-entry" data-game-feedback aria-label="反馈中国象棋问题">反馈</button>
    </div>
  </div>

  <div class="xq-layout">
    <section class="xq-board-card" aria-label="象棋对局">
      <div class="xq-board-frame"><div class="xq-board" data-xq-board></div>
        <div class="xq-result" data-xq-result hidden>
          <div class="xq-result-card"><div class="xq-result-stamp">对局结束</div><h2 data-xq-result-title>本局结束</h2><p data-xq-result-text></p>
            <div class="xq-result-actions"><button type="button" class="xq-btn xq-btn-primary" data-xq-again>再来一局</button><button type="button" class="xq-btn xq-btn-quiet" data-xq-result-close>看看棋盘</button></div>
          </div>
        </div>
      </div>
    </section>
    <div class="xq-side">
      <section class="xq-match-card">
        <div class="xq-match-title"><span>本局对弈</span><span class="xq-match-live"><i></i> 单机</span></div>
        <div class="xq-players">
          <div class="xq-player black-player"><div class="xq-player-token">将</div><div><b data-xq-ai-label>黑方 · 电脑</b><small>沉着应战</small></div><span class="xq-player-crown">AI</span></div>
          <div class="xq-vs">VS</div>
          <div class="xq-player red-player"><div class="xq-player-token">帅</div><div><b data-xq-player-label>红方 · 你</b><small>运筹帷幄</small></div><span class="xq-player-crown">YOU</span></div>
        </div>
        <div class="xq-status" data-xq-status role="status" aria-live="polite">轮到红方行棋</div>
        <div class="xq-audio-controls" aria-label="音频设置">
          <button type="button" class="xq-audio-toggle" data-xq-music aria-pressed="false">♫ 背景音乐：关</button>
          <button type="button" class="xq-audio-toggle is-on" data-xq-sound aria-pressed="true">♩ 落子音效：开</button>
        </div>
        <div class="xq-audio-credit"><a href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2100001" target="_blank" rel="noopener">《Guzheng City》 · Kevin MacLeod · CC BY 4.0</a></div>
        <div class="xq-setting-block">
          <div class="xq-setting-label">选择执棋方</div>
          <div class="xq-segment" role="group" aria-label="选择执棋方"><button type="button" data-xq-side="red">执红先行</button><button type="button" data-xq-side="black">执黑后手</button></div>
        </div>
        <div class="xq-setting-block">
          <div class="xq-setting-label">电脑难度</div>
          <div class="xq-segment xq-levels" role="group" aria-label="电脑难度"><button type="button" data-xq-level="easy">轻松</button><button type="button" class="is-active" data-xq-level="medium">标准</button><button type="button" data-xq-level="hard">挑战</button></div>
        </div>
        <div class="xq-actions">
          <button type="button" class="xq-btn xq-btn-primary" data-xq-new>新开一局</button>
          <button type="button" class="xq-btn" data-xq-hint>✦ 着法提示</button>
          <button type="button" class="xq-btn" data-xq-undo disabled>↶ 悔棋</button>
        </div>
      </section>
      <section class="xq-history-card">
        <div class="xq-section-heading"><span>最近着法</span><span class="xq-section-note">MOVE HISTORY</span></div>
        <div class="xq-history" data-xq-history><div class="xq-history-empty">棋盘已摆好，轮到红方先行。</div></div>
      </section>
      <details class="xq-rules-card">
        <summary><span>新手速览</span><span>＋</span></summary>
        <div class="xq-rules-copy">
          <p><b>车</b>走直线；<b>马</b>走日字，蹩马腿不能走；<b>炮</b>平时走直线，吃子要隔一个棋子。</p>
          <p><b>相 / 象</b>走田字且不能过河；<b>仕 / 士</b>斜走一格并守在九宫；<b>兵 / 卒</b>过河后可横走。</p>
          <p>将帅不能照面。被将军时必须应将；无棋可走的一方判负。</p>
        </div>
      </details>
    </div>
  </div>
  <div class="xq-footer"><span>用心落子，静候佳音</span><span>本地对局 · 不上传棋谱</span></div>
</div>

<style>
.xq-root{--xq-ink:#26352e;--xq-muted:#77877a;--xq-green:#174e42;--xq-jade:#287c66;--xq-red:#c84436;--xq-gold:#daa94f;max-width:1160px;margin:18px auto 28px;color:var(--xq-ink);font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.xq-root *{box-sizing:border-box}.xq-root button{font:inherit}.xq-root [hidden]{display:none!important}
.xq-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;padding:13px 18px;border-radius:17px;background:linear-gradient(115deg,#123c35,#206553 68%,#1e4a3e);color:#fff6dd;box-shadow:0 10px 25px #174e421f}
.xq-brand{display:flex;align-items:center;gap:12px}.xq-brand-mark{width:45px;height:45px;display:grid;place-items:center;position:relative;border:1px solid #f1cd80;border-radius:50%;background:linear-gradient(145deg,#f5dfaa,#d9aa55);color:#b53e30;font-size:24px;font-weight:900;box-shadow:inset 0 0 0 4px #fff1d0}.xq-brand-mark i{position:absolute;right:-8px;bottom:-5px;display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:#202b27;color:#f1cd80;border:2px solid #eed28f;font-size:12px;font-style:normal}.xq-kicker{font-size:10px;letter-spacing:2px;color:#d8c18d}.xq-brand h1{margin:1px 0 0;color:#fff7e3;font-size:22px;letter-spacing:2px;line-height:1.2}.xq-top-actions{display:flex;align-items:center;gap:8px}.xq-move-count{color:#ddc891;font-size:12px;letter-spacing:1px;margin-right:4px}
.xq-btn{border:1px solid #d9d4c3;background:#fffdf5;color:#45564c;border-radius:12px;padding:10px 14px;min-height:42px;font-size:13px;font-weight:750;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,background .16s ease;box-shadow:0 3px 0 #c9c2ad}.xq-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 5px 0 #c9c2ad}.xq-btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #c9c2ad}.xq-btn:disabled{opacity:.42;cursor:not-allowed}.xq-btn-quiet{background:#ffffff14;border-color:#ffffff30;color:#fff4db;box-shadow:none}.xq-btn-quiet:hover:not(:disabled){background:#ffffff23;box-shadow:none}.xq-btn-primary{background:linear-gradient(135deg,#e9bc62,#d79a3f);border-color:#cb913c;color:#422e12;box-shadow:0 3px 0 #a86e2d}
.xq-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;align-items:start;gap:16px}.xq-board-card,.xq-match-card,.xq-history-card,.xq-rules-card{border:1px solid #e9dfc7;border-radius:20px;background:linear-gradient(145deg,#fffdf7,#f7f0df);box-shadow:0 14px 34px #563c2010}.xq-board-card{padding:14px 16px 12px;overflow:hidden}.xq-board-caption,.xq-board-foot{display:flex;justify-content:space-between;align-items:center;color:#938365;font-size:11px;letter-spacing:.5px}.xq-board-caption{padding:0 2px 11px}.xq-board-live,.xq-match-live{display:inline-flex;align-items:center;gap:6px;color:#4d8065;font-weight:800;letter-spacing:1px}.xq-board-live i,.xq-match-live i{width:7px;height:7px;border-radius:50%;background:#4ca576;box-shadow:0 0 0 3px #4ca57622}.xq-board-frame{position:relative;margin:auto;width:min(100%,540px);aspect-ratio:540/620;padding:0}.xq-board{width:100%;height:100%}.xq-board-svg{display:block;width:100%;height:100%;overflow:visible;touch-action:manipulation}.xq-board-svg.is-flipped{transform:rotate(180deg)}.xq-board-frame:after{content:"";position:absolute;inset:2.2%;border:1px solid #8f592229;border-radius:20px;pointer-events:none}.xq-board-frame{isolation:isolate}.xq-board-surface{fill:url(#xq-board-wood);stroke:#925b2c;stroke-width:2}.xq-board-frame{fill:#6f472e}.xq-board-inset{fill:none;stroke:#fff0c4;stroke-width:2;opacity:.85}.xq-river{fill:#f4d79a;opacity:.52}.xq-grid-lines line,.xq-grid-lines path{fill:none;stroke:#65452f;stroke-width:2.15;stroke-linecap:round;stroke-linejoin:round}.xq-grid-lines path{stroke-width:1.9}.xq-star path{fill:none;stroke:#775435;stroke-width:1.65;stroke-linecap:round}.xq-river-labels{font-family:serif;font-weight:800;font-size:17px;letter-spacing:3px;fill:#976c3e;text-anchor:middle;opacity:.88}.xq-board-marks{pointer-events:none}.xq-last-square{fill:#4dba9040;stroke:#21805e;stroke-width:1.4}.xq-move-target{fill:#398661e8;stroke:#eff9df;stroke-width:2.4;filter:drop-shadow(0 1px 2px #183c2780)}.xq-capture-target{fill:#d84f3b23;stroke:#c74835;stroke-width:3}.xq-hint-line{stroke:#f5ce68;stroke-width:7;stroke-linecap:round;opacity:.7;filter:drop-shadow(0 1px 3px #7b5525)}.xq-check-ring{fill:#e23e3430;stroke:#d53b30;stroke-width:3;stroke-dasharray:6 4;animation:xq-pulse 1.2s ease-in-out infinite}.xq-piece{cursor:pointer;outline:none}.xq-piece-shadow{fill:#5b3b20;opacity:.34;transform:translate(0 3px)}.xq-piece-face{fill:url(#xq-red-piece);stroke:#a56f3c;stroke-width:1.5}.xq-piece.black .xq-piece-face{fill:url(#xq-black-piece);stroke:#60584c}.xq-piece-rim{fill:none;stroke:#c59042;stroke-width:1.6}.xq-piece.black .xq-piece-rim{stroke:#655e53}.xq-piece-label{fill:#bd3a31;font-family:"STKaiti","KaiTi",serif;font-size:24px;font-weight:900;pointer-events:none}.xq-piece.black .xq-piece-label{fill:#262d29}.xq-piece-hit,.xq-square-hit{fill:transparent;stroke:transparent;cursor:pointer}.xq-piece-hit{pointer-events:all}.xq-square-hit{pointer-events:all}.xq-piece.is-selected .xq-piece-face{stroke:#e2a63c;stroke-width:4;filter:drop-shadow(0 0 5px #f7c85d)}.xq-piece.is-selected .xq-piece-rim{stroke:#fff2bf;stroke-width:2}.xq-corner-flourish{fill:none;stroke:#fff0c6;stroke-width:2;opacity:.7;pointer-events:none}.xq-board-foot{padding:7px 2px 0;border-top:1px solid #ad86502a;font-size:10px}
.xq-side{display:grid;gap:12px}.xq-match-card{padding:16px}.xq-match-title,.xq-section-heading{display:flex;align-items:center;justify-content:space-between;font-weight:850;color:#35483d;font-size:15px}.xq-match-live{font-size:9px;letter-spacing:.7px}.xq-players{display:grid;grid-template-columns:1fr 28px 1fr;align-items:center;margin:14px 0 12px}.xq-player{min-width:0;display:flex;align-items:center;gap:8px;padding:9px 8px;border:1px solid #e7dfcf;border-radius:14px;background:#fffaf0}.xq-player.black-player{background:#eff1e9}.xq-player-token{display:grid;place-items:center;flex:0 0 36px;height:36px;border:2px solid #c98d48;border-radius:50%;background:linear-gradient(145deg,#fff5dd,#e9c68d);color:#c43e32;font-family:serif;font-size:21px;font-weight:900;box-shadow:inset 0 0 0 3px #fff9e9}.black-player .xq-player-token{border-color:#696355;color:#262d29;background:linear-gradient(145deg,#f6edd8,#d5c5a4)}.xq-player b,.xq-player small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.xq-player b{font-size:11px;color:#34473d}.xq-player small{margin-top:3px;color:#98a091;font-size:9px}.xq-player-crown{margin-left:auto;color:#ad9a6e;font-size:8px;font-weight:900;letter-spacing:.5px}.xq-vs{text-align:center;color:#bf9d5c;font-size:10px;font-weight:900}.xq-status{min-height:40px;display:flex;align-items:center;justify-content:center;padding:7px 10px;border-radius:11px;background:#eaf1e8;color:#38694f;font-size:12px;font-weight:800;text-align:center}.xq-status.is-thinking{background:#fff4d6;color:#9e7028}.xq-status.is-check{background:#fff0e9;color:#c24434}.xq-setting-block{margin-top:13px}.xq-setting-label{margin-bottom:7px;color:#7d8577;font-size:10px;font-weight:800;letter-spacing:1px}.xq-segment{display:flex;gap:4px;padding:3px;border-radius:11px;background:#ece8dc}.xq-segment button{flex:1;min-height:34px;border:0;border-radius:8px;background:transparent;color:#7c8176;font-size:11px;font-weight:750;cursor:pointer}.xq-segment button.is-active{background:#fffdf6;color:#355b49;box-shadow:0 2px 5px #543d2017}.xq-levels button.is-active{background:#d9eee0;color:#286647}.xq-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:15px}.xq-actions .xq-btn{padding:8px 5px;min-height:39px;font-size:10px;white-space:nowrap}.xq-actions .xq-btn-primary{grid-column:1/-1;font-size:12px}.xq-history-card{padding:14px 16px}.xq-section-note{font-size:8px;letter-spacing:1px;color:#b8ae94}.xq-history{display:grid;gap:5px;margin-top:10px;max-height:190px;overflow:auto}.xq-history-row{display:grid;grid-template-columns:22px 38px 1fr;align-items:center;gap:6px;color:#69766d;font-size:10px;padding:5px 7px;border-radius:8px;background:#ffffffa8}.xq-history-row>span:first-child{color:#b5a98a;font-variant-numeric:tabular-nums}.xq-history-row b{font-size:9px}.xq-history-row b.red{color:#bd4639}.xq-history-row b.black{color:#303a33}.xq-history-empty{padding:12px 5px;color:#a39c89;font-size:11px;text-align:center}.xq-rules-card{padding:0 15px}.xq-rules-card summary{display:flex;justify-content:space-between;padding:13px 0;color:#586a5d;font-size:12px;font-weight:800;cursor:pointer;list-style:none}.xq-rules-card summary::-webkit-details-marker{display:none}.xq-rules-copy{padding:0 0 10px;color:#7b8376;font-size:10px;line-height:1.75}.xq-rules-copy p{margin:5px 0}.xq-rules-copy b{color:#405b49}.xq-footer{display:flex;justify-content:space-between;margin:12px 4px;color:#a69c83;font-size:10px;letter-spacing:.5px}
.xq-result{position:absolute;z-index:4;inset:0;display:grid;place-items:center;padding:16px;border-radius:20px;background:#132d26b8;backdrop-filter:blur(4px)}.xq-result-card{width:min(100%,340px);padding:24px 20px;text-align:center;border:1px solid #eed38e;border-radius:22px;background:linear-gradient(155deg,#fff8e4,#e9d19c);box-shadow:0 18px 45px #18251d55;animation:xq-pop .24s ease-out}.xq-result-stamp{display:inline-block;padding:5px 11px;border:1px solid #c9a75e;border-radius:999px;color:#97713a;font-size:9px;letter-spacing:2px}.xq-result-card h2{margin:13px 0 5px;color:#344e40;font-size:24px}.xq-result-card p{margin:0 0 17px;color:#788171;font-size:12px}.xq-result-actions{display:flex;justify-content:center;gap:8px}.xq-result-actions .xq-btn{font-size:11px}.xq-root.xq-expanded{position:fixed;z-index:9999;inset:0;max-width:none;width:100%;height:100vh;height:100dvh;height:100svh;overflow:auto;margin:0;padding:max(8px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));background:radial-gradient(ellipse at 50% 5%,#f9efda,#e5d3ad 72%);}.xq-expanded .xq-topbar{max-width:1180px;margin:0 auto 8px}.xq-expanded .xq-layout{max-width:1180px;margin:auto;align-items:center}.xq-expanded .xq-board-card{padding:9px 12px}.xq-expanded .xq-board-frame{width:min(100%,calc((100svh - 116px)*.87),580px)}.xq-expanded .xq-side{width:100%;max-width:310px}.xq-expanded .xq-footer{max-width:1180px;margin:8px auto 0}body.xq-lock{overflow:hidden!important}body.xq-lock #cw-fab,body.xq-lock #cw-panel{display:none!important}
@keyframes xq-pulse{50%{opacity:.42;stroke-width:5}}@keyframes xq-pop{from{opacity:0;transform:translateY(9px) scale(.96)}to{opacity:1;transform:none}}
@media(max-width:860px){.xq-root{margin:12px auto}.xq-layout{grid-template-columns:minmax(0,1fr) 280px;gap:10px}.xq-board-card{padding:10px}.xq-match-card{padding:13px}.xq-player{gap:5px;padding:7px 5px}.xq-player-token{flex-basis:31px;height:31px;font-size:18px}.xq-player b{font-size:10px}}
@media(max-width:640px){.xq-root{margin:10px auto 20px}.xq-topbar{padding:10px 12px;border-radius:14px}.xq-brand-mark{width:39px;height:39px;font-size:21px}.xq-brand h1{font-size:19px}.xq-kicker{font-size:8px}.xq-top-actions{gap:5px}.xq-top-actions .xq-btn{padding:7px 9px;min-height:36px;font-size:10px}.xq-move-count{font-size:10px}.xq-layout{grid-template-columns:1fr;gap:10px}.xq-board-card{padding:9px 8px 7px;border-radius:16px}.xq-board-frame{width:min(100%,540px)}.xq-board-caption{font-size:9px;padding:0 3px 7px}.xq-board-foot{font-size:9px}.xq-side{grid-template-columns:1fr;gap:9px}.xq-match-card{padding:12px}.xq-players{margin:10px 0}.xq-actions{margin-top:11px}.xq-history-card{padding:11px 13px}.xq-history{max-height:130px}.xq-footer{font-size:9px}.xq-expanded{display:flex;flex-direction:column}.xq-expanded .xq-topbar{width:100%;flex:none;padding:8px 10px}.xq-expanded .xq-layout{display:flex;flex-direction:column;flex:1 0 auto;width:100%;gap:8px}.xq-expanded .xq-board-card{width:100%;flex:none;padding:6px}.xq-expanded .xq-board-frame{width:min(100%,calc((100svh - 305px)*.87),500px)}.xq-expanded .xq-board-caption,.xq-expanded .xq-board-foot{font-size:8px}.xq-expanded .xq-side{display:grid;grid-template-columns:1fr 1fr;width:100%;max-width:none;gap:7px}.xq-expanded .xq-match-card{grid-column:1/-1;padding:8px 10px}.xq-expanded .xq-players{grid-template-columns:1fr 23px 1fr;margin:6px 0}.xq-expanded .xq-player{padding:5px 7px}.xq-expanded .xq-player-token{width:28px;height:28px;flex-basis:28px;font-size:16px}.xq-expanded .xq-player small{display:none}.xq-expanded .xq-status{min-height:30px}.xq-expanded .xq-setting-block{display:inline-block;width:calc(50% - 4px);vertical-align:top;margin:7px 6px 0 0}.xq-expanded .xq-setting-block:nth-of-type(2){margin-right:0}.xq-expanded .xq-segment button{min-height:30px}.xq-expanded .xq-actions{display:flex;gap:5px;margin-top:7px}.xq-expanded .xq-actions .xq-btn,.xq-expanded .xq-actions .xq-btn-primary{flex:1;grid-column:auto;min-height:34px;padding:6px 4px;font-size:10px}.xq-expanded .xq-history-card,.xq-expanded .xq-rules-card{padding:8px 10px}.xq-expanded .xq-history-card{max-height:84px;overflow:auto}.xq-expanded .xq-history{max-height:48px;margin-top:4px}.xq-expanded .xq-history-row{padding:3px 5px}.xq-expanded .xq-rules-copy{font-size:9px;line-height:1.5}.xq-expanded .xq-footer{display:none}}
@media(max-height:560px) and (orientation:landscape){.xq-root.xq-expanded{overflow:hidden}.xq-expanded .xq-topbar{padding:5px 10px;margin-bottom:5px}.xq-expanded .xq-brand-mark{width:30px;height:30px;font-size:16px}.xq-expanded .xq-brand-mark i{width:18px;height:18px;font-size:9px}.xq-expanded .xq-brand h1{font-size:15px}.xq-expanded .xq-kicker,.xq-expanded .xq-move-count{display:none}.xq-expanded .xq-top-actions .xq-btn{min-height:29px;padding:4px 8px}.xq-expanded .xq-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,29%);align-items:stretch;gap:8px;min-height:0;height:calc(100% - 44px)}.xq-expanded .xq-board-card{display:flex;flex-direction:column;min-height:0;padding:5px}.xq-expanded .xq-board-caption{padding:0 3px 3px;font-size:8px}.xq-expanded .xq-board-frame{width:min(100%,calc((100svh - 55px)*.87));height:auto;max-height:calc(100% - 24px);aspect-ratio:540/620}.xq-expanded .xq-side{grid-template-columns:1fr;align-content:start;overflow:auto;max-width:none;gap:6px}.xq-expanded .xq-match-card{padding:7px}.xq-expanded .xq-match-title{font-size:12px}.xq-expanded .xq-players{margin:6px 0}.xq-expanded .xq-player{padding:4px}.xq-expanded .xq-player-token{width:27px;height:27px;flex-basis:27px;font-size:15px}.xq-expanded .xq-status{min-height:28px;padding:4px;font-size:10px}.xq-expanded .xq-setting-block{margin-top:6px}.xq-expanded .xq-setting-label{margin-bottom:3px;font-size:8px}.xq-expanded .xq-segment button{min-height:27px;font-size:9px}.xq-expanded .xq-actions{margin-top:6px}.xq-expanded .xq-actions .xq-btn,.xq-expanded .xq-actions .xq-btn-primary{min-height:29px;font-size:9px}.xq-expanded .xq-history-card,.xq-expanded .xq-rules-card{padding:6px 8px}.xq-expanded .xq-history{max-height:78px}.xq-expanded .xq-footer{display:none}}
@media(prefers-reduced-motion:reduce){.xq-root *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
</style>
<style>.xq-board-wood{fill:#6f472e}</style>

<style>
/* Treat Xiangqi as a full game surface instead of a narrow article inside the theme. */
.theme-container.xiangqi-page .content__default:not(.custom){max-width:none;padding:12px clamp(8px,2vw,28px) 22px}
.xq-root{max-width:1160px;margin:0 auto 18px}
.xq-layout{grid-template-columns:minmax(0,1fr) 320px;gap:14px}
.xq-board-card{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;overflow:visible}
.xq-board-frame{width:min(100%,540px);aspect-ratio:540/620;filter:drop-shadow(0 14px 11px #4b2d1e35);transform:perspective(1200px) rotateX(1.2deg);transform-origin:center bottom}
.xq-board-frame:after{content:none}
.xq-board-svg{overflow:visible}
.xq-board-wood{fill:#6c4025;stroke:#4c2e1d;stroke-width:2}
.xq-board-side{fill:url(#xq-board-side);stroke:#4c2e1d;stroke-width:2}
.xq-board-surface{fill:url(#xq-board-wood);stroke:#89522e;stroke-width:2.4}
.xq-board-inset{stroke:#fff0c4;stroke-width:2.2;opacity:.8}
.xq-grid-lines line,.xq-grid-lines path{stroke:#69452d;stroke-width:2.05}
.xq-river{fill:#f3d596;opacity:.62}
.xq-piece-shadow{fill:#3e2719;opacity:.42;transform:translate(0 5px)}
.xq-piece-body{transform-box:fill-box;transform-origin:center}
.xq-piece-side{fill:#a8753c;stroke:#694324;stroke-width:1}
.xq-piece-face{fill:url(#xq-red-piece);stroke:#a56f3c;stroke-width:1.7}
.xq-piece.black .xq-piece-face{fill:url(#xq-black-piece);stroke:#625849}
.xq-piece-rim{fill:none;stroke:#c08c43;stroke-width:1.7}
.xq-piece.black .xq-piece-rim{stroke:#6f6657}
.xq-piece-gloss{fill:#fffaf0;opacity:.38;pointer-events:none}
.xq-piece.is-selected .xq-piece-face{stroke:#e2a63c;stroke-width:4;filter:drop-shadow(0 0 5px #f7c85d)}
.xq-piece-arrival .xq-piece-body{animation:xq-piece-land .36s cubic-bezier(.18,.78,.25,1.12) both}
.xq-capture-burst{fill:none;stroke:#c64837;stroke-width:4;opacity:0;transform-box:fill-box;transform-origin:center;animation:xq-capture .42s ease-out both}
.xq-audio-controls{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px}
.xq-audio-toggle{min-height:34px;padding:6px 7px;border:1px solid #ded4bf;border-radius:10px;background:#f2ecde;color:#77786e;font:inherit;font-size:10px;font-weight:800;cursor:pointer}
.xq-audio-toggle.is-on{border-color:#91b39a;background:#e4f0e5;color:#2e7651}
.xq-audio-credit{margin-top:6px;color:#a59b84;text-align:center;font-size:8px;line-height:1.4}
.xq-audio-credit a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.xq-expanded .xq-board-frame{width:min(100%,calc((100svh - 160px)*.87),850px)}
.xq-expanded .xq-match-card{max-width:340px}
.xq-expanded .xq-audio-controls{margin-top:6px}
.xq-expanded .xq-audio-toggle{min-height:30px}
.xq-expanded .xq-audio-credit{margin-top:3px;font-size:7px}
@keyframes xq-piece-land{0%{opacity:.82;transform:translate(var(--xq-dx,0px),var(--xq-dy,-10px)) scale(.91)}76%{opacity:1;transform:translate(-1px,2px) scale(1.04)}100%{transform:translate(0,0) scale(1)}}
@keyframes xq-capture{0%{opacity:.8;transform:scale(.62)}100%{opacity:0;transform:scale(1.45)}}
@media(min-width:861px){.xq-board-frame{width:min(100%,900px,calc((100svh - 330px)*.87))}}
@media(max-width:860px){.xq-layout{grid-template-columns:minmax(0,1fr) 300px}.xq-board-frame{width:100%}}
@media(max-width:640px){
  .theme-container.xiangqi-page .content__default:not(.custom){padding:4px 3px max(12px,env(safe-area-inset-bottom))}
  .xq-root{max-width:none;width:100%;margin:0}
  .xq-topbar{margin-bottom:7px}
  .xq-layout{grid-template-columns:1fr;gap:8px}
  .xq-board-card{padding:2px;border-radius:13px}
  .xq-board-frame{width:100%;max-width:none;transform:perspective(1400px) rotateX(.8deg)}
  .xq-side{gap:7px}
  .xq-match-card{padding:10px}
  .xq-audio-controls{margin-top:7px}
  .xq-audio-toggle{min-height:38px;font-size:11px}
  .xq-audio-credit{font-size:8px}
  .xq-expanded .xq-board-frame{width:min(100%,calc((100svh - 294px)*.87),540px);max-width:540px}
  .xq-expanded .xq-side{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .xq-expanded .xq-match-card{grid-column:1/-1;max-width:none;padding:7px 9px}
  .xq-expanded .xq-audio-controls{margin-top:5px}
  .xq-expanded .xq-audio-toggle{min-height:28px;padding:4px;font-size:9px}
  .xq-expanded .xq-audio-credit{font-size:7px}
  body.xq-page-active #cw-fab,body.xq-page-active #cw-panel{display:none!important}
}
@media(max-width:370px){.xq-top-actions .xq-move-count{display:none}.xq-top-actions .xq-btn{padding:6px 7px;font-size:9px}}
@media(max-height:560px) and (orientation:landscape){
  body.xq-page-active #cw-fab,body.xq-page-active #cw-panel{display:none!important}
  .xq-root:not(.xq-expanded){max-width:none;margin:4px auto 8px}
  .xq-root:not(.xq-expanded) .xq-topbar{padding:5px 10px;margin-bottom:5px}
  .xq-root:not(.xq-expanded) .xq-brand-mark{width:30px;height:30px;font-size:16px}
  .xq-root:not(.xq-expanded) .xq-brand-mark i{width:18px;height:18px;font-size:9px}
  .xq-root:not(.xq-expanded) .xq-brand h1{font-size:15px}
  .xq-root:not(.xq-expanded) .xq-kicker,.xq-root:not(.xq-expanded) .xq-move-count{display:none}
  .xq-root:not(.xq-expanded) .xq-layout{grid-template-columns:minmax(0,1fr) minmax(240px,30%);gap:8px}
  .xq-root:not(.xq-expanded) .xq-board-card{padding:3px}
  .xq-root:not(.xq-expanded) .xq-board-frame{width:min(100%,calc((100svh - 125px)*.87))}
  .xq-root:not(.xq-expanded) .xq-side{max-height:calc(100svh - 90px);overflow:auto;gap:6px}
  .xq-root:not(.xq-expanded) .xq-match-card{padding:7px}
  .xq-root:not(.xq-expanded) .xq-players{margin:6px 0}
  .xq-root:not(.xq-expanded) .xq-player{padding:4px}
  .xq-root:not(.xq-expanded) .xq-player-token{width:27px;height:27px;flex-basis:27px;font-size:15px}
  .xq-root:not(.xq-expanded) .xq-status{min-height:28px;padding:4px;font-size:10px}
  .xq-root:not(.xq-expanded) .xq-setting-block{margin-top:6px}
  .xq-root:not(.xq-expanded) .xq-setting-label{margin-bottom:3px;font-size:8px}
  .xq-root:not(.xq-expanded) .xq-segment button{min-height:27px;font-size:9px}
  .xq-root:not(.xq-expanded) .xq-actions{margin-top:6px}
  .xq-root:not(.xq-expanded) .xq-actions .xq-btn,.xq-root:not(.xq-expanded) .xq-actions .xq-btn-primary{min-height:29px;font-size:9px}
  .xq-root:not(.xq-expanded) .xq-history-card,.xq-root:not(.xq-expanded) .xq-rules-card{padding:6px 8px}
  .xq-root:not(.xq-expanded) .xq-history{max-height:78px}
  .xq-root:not(.xq-expanded) .xq-footer{display:none}
}
@media(max-height:560px) and (orientation:landscape){.xq-expanded .xq-board-frame{width:min(100%,calc((100svh - 46px)*.87));max-height:calc(100% - 12px)}}
@media(prefers-reduced-motion:reduce){.xq-piece-arrival .xq-piece-body,.xq-capture-burst{animation-duration:.01ms!important}}

/* Give the board a carved, layered wood finish rather than a flat card-like plane. */
.xq-board-wood{fill:#65412a;stroke:#4c2e1d;stroke-width:2.5}
.xq-board-side{fill:url(#xq-board-side);stroke:#4c2e1d;stroke-width:2}
.xq-board-bevel{fill:#d49a52;stroke:#f7d89c;stroke-width:1.5}
.xq-board-surface{fill:url(#xq-board-wood);stroke:#87532f;stroke-width:2.8}
.xq-board-grain{fill:url(#xq-wood-grain);opacity:.56;pointer-events:none}
.xq-board-inset{stroke:#fff0c4;stroke-width:2.1;opacity:.76}
.xq-grid-underlay line,.xq-grid-underlay path{fill:none;stroke:#fff0bd;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;opacity:.3}
.xq-grid-lines line,.xq-grid-lines path{stroke:#563a27;stroke-width:2.2}
.xq-river{fill:#f5dcaa;opacity:.72}
.xq-piece-shadow{fill:#302014;opacity:.5;transform:translate(0 6px)}
.xq-piece-side{fill:#966332;stroke:#5b3a22;stroke-width:1.2}
.xq-piece-bevel{fill:url(#xq-piece-bevel);stroke:#85572e;stroke-width:.85}
.xq-piece-face{stroke:#a56f3c;stroke-width:1.65}
.xq-piece.black .xq-piece-face{stroke:#625849}
.xq-piece-rim{stroke:#bd873d;stroke-width:1.7}
.xq-piece.black .xq-piece-rim{stroke:#776b58}
.xq-piece-inner-rim{fill:none;stroke:#fff5d8;stroke-width:.75;opacity:.78;pointer-events:none}
.xq-piece-label-shadow{fill:#633520;opacity:.35;font-family:"STKaiti","KaiTi",serif;font-size:24px;font-weight:900;pointer-events:none}
.xq-piece.red .xq-piece-label{fill:#b8322c}
.xq-piece.black .xq-piece-label{fill:#262d29}
.xq-expanded{box-sizing:border-box}
@media(max-height:560px) and (orientation:landscape){
  .xq-board-frame{aspect-ratio:620/540;transform:perspective(1500px) rotateX(1.8deg)}
  .xq-root:not(.xq-expanded){max-width:none;width:100%;margin:0 auto;padding:3px clamp(5px,1vw,12px)}
  .xq-root:not(.xq-expanded) .xq-topbar{padding:4px 9px;margin:0 0 4px;border-radius:10px}
  .xq-root:not(.xq-expanded) .xq-brand-mark{width:29px;height:29px;font-size:15px}
  .xq-root:not(.xq-expanded) .xq-brand-mark i{width:17px;height:17px;font-size:9px}
  .xq-root:not(.xq-expanded) .xq-brand h1{font-size:14px}
  .xq-root:not(.xq-expanded) .xq-kicker,.xq-root:not(.xq-expanded) .xq-move-count{display:none}
  .xq-root:not(.xq-expanded) .xq-top-actions{gap:5px}
  .xq-root:not(.xq-expanded) .xq-top-actions .xq-btn{min-height:29px;padding:4px 8px;font-size:9px}
  .xq-root:not(.xq-expanded) .xq-layout{grid-template-columns:minmax(0,1fr) minmax(218px,27%);align-items:center;gap:6px}
  .xq-root:not(.xq-expanded) .xq-board-card{display:grid;place-items:center;padding:0;min-height:0}
  .xq-root:not(.xq-expanded) .xq-board-frame{width:min(100%,calc((100svh - 108px)*1.148));max-width:none;max-height:calc(100svh - 108px);aspect-ratio:620/540}
  .xq-root:not(.xq-expanded) .xq-side{max-height:calc(100svh - 54px);overflow:auto;align-content:center;gap:5px}
  .xq-root:not(.xq-expanded) .xq-match-card{padding:6px}
  .xq-root:not(.xq-expanded) .xq-match-title{font-size:11px}
  .xq-root:not(.xq-expanded) .xq-players{margin:5px 0}
  .xq-root:not(.xq-expanded) .xq-player{padding:3px;gap:4px}
  .xq-root:not(.xq-expanded) .xq-player-token{width:27px;height:27px;flex-basis:27px;font-size:15px}
  .xq-root:not(.xq-expanded) .xq-player small,.xq-root:not(.xq-expanded) .xq-player-crown{display:none}
  .xq-root:not(.xq-expanded) .xq-status{min-height:30px;padding:4px;font-size:10px}
  .xq-root:not(.xq-expanded) .xq-audio-controls{gap:4px;margin-top:5px}
  .xq-root:not(.xq-expanded) .xq-audio-toggle{min-height:32px;padding:4px;font-size:9px}
  .xq-root:not(.xq-expanded) .xq-audio-credit{display:none}
  .xq-root:not(.xq-expanded) .xq-setting-block{margin-top:5px}
  .xq-root:not(.xq-expanded) .xq-setting-label{margin-bottom:3px;font-size:9px}
  .xq-root:not(.xq-expanded) .xq-segment button{min-height:32px;font-size:9px}
  .xq-root:not(.xq-expanded) .xq-actions{gap:4px;margin-top:5px}
  .xq-root:not(.xq-expanded) .xq-actions .xq-btn,.xq-root:not(.xq-expanded) .xq-actions .xq-btn-primary{min-height:32px;padding:4px;font-size:9px}
  .xq-root:not(.xq-expanded) .xq-history-card,.xq-root:not(.xq-expanded) .xq-rules-card,.xq-root:not(.xq-expanded) .xq-footer{display:none}

  .xq-root.xq-expanded{height:100svh;overflow:hidden;padding:max(4px,env(safe-area-inset-top)) max(7px,env(safe-area-inset-right)) max(4px,env(safe-area-inset-bottom)) max(7px,env(safe-area-inset-left));display:grid;grid-template-rows:auto minmax(0,1fr)}
  .xq-expanded .xq-topbar{width:100%;max-width:none;padding:4px 9px;margin:0 auto 4px;border-radius:10px}
  .xq-expanded .xq-brand-mark{width:29px;height:29px;font-size:15px}
  .xq-expanded .xq-brand-mark i{width:17px;height:17px;font-size:9px}
  .xq-expanded .xq-brand h1{font-size:14px}
  .xq-expanded .xq-kicker,.xq-expanded .xq-move-count{display:none}
  .xq-expanded .xq-top-actions{gap:5px}
  .xq-expanded .xq-top-actions .xq-btn{min-height:29px;padding:4px 8px;font-size:9px}
  .xq-expanded .xq-layout{width:100%;max-width:none;height:auto;min-height:0;grid-template-columns:minmax(0,1fr) minmax(218px,26%);align-items:center;gap:6px}
  .xq-expanded .xq-board-card{display:grid;place-items:center;min-height:0;padding:0}
  .xq-expanded .xq-board-frame{width:min(100%,calc((100svh - 58px)*1.148));max-width:none;max-height:100%;aspect-ratio:620/540}
  .xq-expanded .xq-side{max-width:none;max-height:100%;overflow:auto;align-content:center;gap:5px}
  .xq-expanded .xq-match-card{max-width:none;padding:6px}
  .xq-expanded .xq-match-title{font-size:11px}
  .xq-expanded .xq-players{margin:5px 0}
  .xq-expanded .xq-player{padding:3px;gap:4px}
  .xq-expanded .xq-player-token{width:27px;height:27px;flex-basis:27px;font-size:15px}
  .xq-expanded .xq-player small,.xq-expanded .xq-player-crown,.xq-expanded .xq-audio-credit{display:none}
  .xq-expanded .xq-status{min-height:30px;padding:4px;font-size:10px}
  .xq-expanded .xq-audio-controls{gap:4px;margin-top:5px}
  .xq-expanded .xq-audio-toggle{min-height:32px;padding:4px;font-size:9px}
  .xq-expanded .xq-setting-block{margin-top:5px}
  .xq-expanded .xq-setting-label{margin-bottom:3px;font-size:9px}
  .xq-expanded .xq-segment button{min-height:32px;font-size:9px}
  .xq-expanded .xq-actions{gap:4px;margin-top:5px}
  .xq-expanded .xq-actions .xq-btn,.xq-expanded .xq-actions .xq-btn-primary{min-height:32px;padding:4px;font-size:9px}
  .xq-expanded .xq-history-card,.xq-expanded .xq-rules-card,.xq-expanded .xq-footer{display:none}
}
</style>

<script>
export default {
  mounted() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    this.$nextTick(async () => {
      const root = this.$el && this.$el.querySelector ? this.$el.querySelector('#xiangqiGame') : null
      if (!root) return
      if (window.__xiangqiUI) {
        try { window.__xiangqiUI.destroy() } catch (e) { /* ignore stale instance */ }
        window.__xiangqiUI = null
      }
      try {
        const { default: XiangqiUI } = await import('../../.vuepress/components/xiangqi/ui.js')
        if (this._isDestroyed || !root.isConnected) return
        this._xq = new XiangqiUI(root)
        window.__xiangqiUI = this._xq
      } catch (error) {
        console.error('[中国象棋] 初始化失败：', error)
      }
    })
  },
  beforeDestroy() {
    if (this._xq) {
      try { this._xq.destroy() } catch (e) { /* ignore */ }
      this._xq = null
    }
    if (typeof window !== 'undefined' && window.__xiangqiUI) window.__xiangqiUI = null
  }
}
</script>
