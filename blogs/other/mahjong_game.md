---
meta:
  # viewport 必须由本页在 head 里排第一，viewport-fit=cover 才会生效，
  # env(safe-area-inset-left/right) 才能在刘海机型上把牌桌避开横屏左侧刘海。
  # 不再写 maximum-scale=1 / user-scalable=no：那是为禁缩放而设，但现在要保留
  # 双指捏合放大（Android Chrome 认这两个属性，写了就真的不能捏合），
  # 双击放大改由 CSS touch-action: manipulation 单独禁掉。
  - name: viewport
    content: width=device-width, initial-scale=1, viewport-fit=cover
  # iOS Safari 无法隐藏自己的地址栏/工具栏，只有「添加到主屏幕」后以独立窗口
  # 打开才是真全屏；以下三条让该页被添加时按独立应用启动（横屏也不带 Safari 外壳）。
  - name: apple-mobile-web-app-capable
    content: 'yes'
  - name: mobile-web-app-capable
    content: 'yes'
  - name: apple-mobile-web-app-status-bar-style
    content: black-translucent
  - name: apple-mobile-web-app-title
    content: 四川麻将
---

::: warning 四川麻将 · 血战到底（人机 / 联机好友房）
四人血战到底：换三张、定缺、碰杠胡，三家 AI 陪打；胡了不算完，血战到最后三人胡牌或流局为止！
想和朋友打？点「联机对战 · 好友房」创建房间（房号发给好友即可）或坐下空位，空位可由房主补 AI。
:::

<div id="scmjGame" class="scmj-root">
<div class="scmj-entry" data-scmj-entry>
<div class="scmj-entry-card">
<div class="scmj-entry-title">🀄 四川麻将 · 血战到底</div>
<div class="scmj-entry-sub">换三张 · 定缺 · 碰杠胡 · 血战到底 · 困难 AI 陪打 · 支持联机好友房</div>
<div class="scmj-entry-opts">
<label class="scmj-entry-opt">
<input type="checkbox" data-scmj-entry-swap checked /> 换三张
</label>
<label class="scmj-entry-opt">
<input type="checkbox" data-scmj-entry-yaoji /> 幺鸡赖子
</label>
<label class="scmj-entry-opt" title="关闭后不显示听牌提示与出牌建议，方便练习自己看牌">
<input type="checkbox" data-scmj-entry-assist checked /> AI 辅助
</label>
<div class="scmj-entry-opt">
<span class="scmj-entry-label">封顶番数</span>
<div class="scmj-stepper">
<button type="button" class="scmj-step" data-scmj-capfan-dec aria-label="封顶番数减一">−</button>
<span class="scmj-step-val" data-scmj-entry-capfan-val>3 番</span>
<button type="button" class="scmj-step" data-scmj-capfan-inc aria-label="封顶番数加一">＋</button>
</div>
</div>
</div>
<div class="scmj-entry-btns">
<button type="button" class="scmj-btn scmj-btn-primary" data-scmj-start>开始游戏</button>
<button type="button" class="scmj-btn scmj-btn-online" data-scmj-online>🌐 联机对战 · 好友房</button>
<button type="button" class="scmj-btn" data-scmj-continue disabled>继续上局</button>
<button type="button" class="scmj-btn" data-scmj-rules>规则说明</button>
</div>
<div class="scmj-entry-tip">每人 100 分起算，跨局累计；首局掷骰定庄，之后先胡者坐庄（一炮多响时点炮者坐庄），连庄 3 轮挂 🔥。</div>
</div>
</div>
<div class="scmj-lobby" data-scmj-lobby hidden>
<div class="scmj-lobby-shell" data-scmj-lobby-shell></div>
</div>
<div class="scmj-table" data-scmj-table hidden>
<div class="scmj-topbar">
<span class="scmj-topbar-title">🀄 四川麻将 · 血战到底</span>
<span class="scmj-round-chip" data-scmj-round></span>
<span class="scmj-countdown" data-scmj-countdown hidden></span>
<div class="scmj-topbar-btns">
<button type="button" class="scmj-btn scmj-btn-ghost" data-scmj-btn-rules>规则</button>
<button type="button" class="scmj-btn scmj-btn-ghost" data-scmj-btn-settings>设置</button>
<button type="button" class="scmj-btn scmj-btn-ghost" data-scmj-btn-exit>退出</button>
</div>
</div>
<div class="scmj-portrait-tip">📱 当前为竖屏，建议横屏获得完整牌桌体验</div>
<div class="scmj-board">
<div class="scmj-handbacks scmj-handbacks-2" data-scmj-backs2 aria-label="对家手牌背面"></div>
<div class="scmj-handbacks scmj-handbacks-3" data-scmj-backs3 aria-label="左家手牌顶部"></div>
<div class="scmj-handbacks scmj-handbacks-1" data-scmj-backs1 aria-label="右家手牌顶部"></div>
<div class="scmj-side scmj-side-2">
<div class="scmj-seatwrap">
<div class="scmj-seatpend" data-scmj-seat2pend hidden>定缺中…</div>
<div class="scmj-seat" data-scmj-seat2></div>
<div class="scmj-seatmelds" data-scmj-seat2melds></div>
</div>
</div>
<div class="scmj-side scmj-side-3">
<div class="scmj-seatwrap">
<div class="scmj-seatpend" data-scmj-seat3pend hidden>定缺中…</div>
<div class="scmj-seat" data-scmj-seat3></div>
<div class="scmj-seatmelds" data-scmj-seat3melds></div>
</div>
</div>
<div class="scmj-center" data-scmj-center>
<div class="scmj-center-info"><span data-scmj-turn>—</span></div>
<div class="scmj-centerslot" data-scmj-centerslot>
<div class="scmj-centerbox" data-scmj-centerbox>
<div class="scmj-wallbox" data-scmj-wallbox>
<div class="scmj-wallring" data-scmj-wallring>
<div class="scmj-wallring-top" data-scmj-wallring-top></div>
<div class="scmj-wallring-right" data-scmj-wallring-right></div>
<div class="scmj-wallring-bottom" data-scmj-wallring-bottom></div>
<div class="scmj-wallring-left" data-scmj-wallring-left></div>
</div>
<div class="scmj-winds" data-scmj-winds></div>
<div class="scmj-felt" data-scmj-felt>
<div class="scmj-disc-tiles scmj-felt-disc-2" data-scmj-disc2tiles></div>
<div class="scmj-disc-tiles scmj-felt-disc-3" data-scmj-disc3tiles></div>
<div class="scmj-disc-tiles scmj-felt-disc-1" data-scmj-disc1tiles></div>
<div class="scmj-disc-tiles scmj-felt-disc-0" data-scmj-disc0tiles></div>
</div>
<div class="scmj-compass" data-scmj-compass></div>
</div>
</div>
</div>
<div class="scmj-center-latest" data-scmj-latest></div>
</div>
<div class="scmj-side scmj-side-1">
<div class="scmj-seatwrap">
<div class="scmj-seatpend" data-scmj-seat1pend hidden>定缺中…</div>
<div class="scmj-seat" data-scmj-seat1></div>
<div class="scmj-seatmelds" data-scmj-seat1melds></div>
</div>
</div>
</div>
<div class="scmj-player">
<div class="scmj-actionbar" data-scmj-actions></div>
<div class="scmj-hintrow">
<div class="scmj-ting" data-scmj-ting></div>
<div class="scmj-suggest" data-scmj-suggest></div>
</div>
<div class="scmj-mymelds" data-scmj-mymelds></div>
<div class="scmj-hand" data-scmj-hand></div>
</div>
</div>
<div class="scmj-modal" data-scmj-modal-rules hidden>
<div class="scmj-modal-mask" data-scmj-close-rules></div>
<div class="scmj-modal-body">
<div class="scmj-modal-title">规则说明</div>
<div class="scmj-modal-content" data-scmj-rules-content></div>
<button type="button" class="scmj-btn scmj-btn-primary" data-scmj-close-rules>知道了</button>
</div>
</div>
<div class="scmj-modal" data-scmj-modal-settings hidden>
<div class="scmj-modal-mask" data-scmj-close-settings></div>
<div class="scmj-modal-body">
<div class="scmj-modal-title">设置</div>
<div class="scmj-modal-content scmj-settings-body">
<label><input type="checkbox" data-scmj-set-sound checked /> 音效（碰/杠/胡带语音播报）</label>
<label><input type="checkbox" data-scmj-set-music checked /> 背景音乐</label>
<label><input type="checkbox" data-scmj-set-anim checked /> 动画</label>
<label><input type="checkbox" data-scmj-set-passhu checked /> 过胡时二次确认</label>
<button type="button" class="scmj-btn scmj-btn-ghost scmj-feedback-entry" data-game-feedback>反馈麻将问题</button>
</div>
<button type="button" class="scmj-btn scmj-btn-primary" data-scmj-close-settings>完成</button>
</div>
</div>
<div class="scmj-modal" data-scmj-modal-confirm hidden>
<div class="scmj-modal-mask"></div>
<div class="scmj-modal-body scmj-confirm">
<div class="scmj-confirm-text"></div>
<div class="scmj-confirm-btns">
<button type="button" class="scmj-btn scmj-btn-primary" data-scmj-confirm-ok>确定</button>
<button type="button" class="scmj-btn" data-scmj-confirm-cancel>取消</button>
</div>
</div>
</div>
<div class="scmj-pop" data-scmj-pop hidden>
<div class="scmj-modal-mask" data-scmj-close-pop></div>
<div class="scmj-pop-card">
<div class="scmj-pop-title" data-scmj-pop-title></div>
<div class="scmj-pop-rows" data-scmj-pop-body></div>
<button type="button" class="scmj-btn scmj-btn-primary" data-scmj-close-pop>关闭</button>
</div>
</div>
<div class="scmj-settle" data-scmj-settle hidden></div>
<div class="scmj-chat" data-scmj-chat hidden>
<div class="scmj-chat-rectip" data-scmj-chat-rectip hidden>🎙 正在录音…松开发送</div>
<div class="scmj-chat-panel" data-scmj-chat-panel hidden>
<button type="button" class="scmj-chat-micbtn" data-scmj-chat-mic title="按住说话">🎤 按住说话</button>
</div>
<button type="button" class="scmj-chat-btn" data-scmj-chat-toggle title="语音 / 短语" aria-label="打开或收起语音与短语" aria-expanded="false">🎙<span>语音</span></button>
</div>
<div class="scmj-dice" data-scmj-dice hidden>
<div class="scmj-dice-card">
<div class="scmj-dice-title" data-scmj-dice-title>掷骰定庄</div>
<div class="scmj-dice-pair" data-scmj-dice-pair></div>
<div class="scmj-dice-msg" data-scmj-dice-msg></div>
</div>
</div>
<div class="scmj-fx" data-scmj-fx></div>
<div class="scmj-float" data-scmj-float></div>
<div class="scmj-toast" data-scmj-toast></div>
</div>

<div class="scmj-intro">
<h3>游戏介绍</h3>
<p>四川麻将（血战到底）人机版：四人对局，你坐下方，三家 AI 分别在右、上、左。换三张、定缺后开始摸打，碰、杠、胡全凭手气与取舍；有人胡牌后离场观战，牌桌继续，直到三人胡牌或流局结算（含查花猪 / 查大叫 / 退杠）；结算详情里会把四家终局牌面（手牌 + 副露 + 胡牌那张）整组摆出来，番型（七对 / 清一色等）、杠了几组、谁听牌一眼可核对。</p>
<p>联机好友房：点入口的「联机对战 · 好友房」进入房间列表，没有房间就「创建房间」，有房间直接「坐下」；把房号或邀请链接发给朋友即可同房对局。房间最多 4 座，空位由房主添加 AI 补齐后开始。规则完全由服务端裁决，掉线自动重连并临时由 AI 托管，只有点「退出」才会真正离开座位。每位玩家只能看到自己的手牌，看不到别人的牌。</p>
<p>进游戏每人 100 积分，本局输赢在结算时一次性累计到总积分；首局掷骰定庄（庄家起手 14 张先打），之后每局掷骰决定摸排起点，并由上局最先胡牌者坐庄（一炮多响时点炮者坐庄）；同一玩家连庄 2 轮起显示「连庄 xN」，满 3 轮挂 🔥。封顶番数在进游戏前用 − / ＋ 调整（2~6 番）。番型：平胡 0 番（1 倍）、对对胡 1 番、七对 2 番、龙七对 3 番、金钩钓 3 番（四副露碰 / 杠到底、手里单吊将，比对对胡高一档）；清一色固定 +2 番。自摸、海底（捞月 / 炮）、杠上花（杠后补牌自摸）与杠上炮（杠后补牌打出的牌被胡）都会额外加番，补杠被抢（抢杠胡）也加 1 番——被抢则杠不成立、杠钱一分不收，被抢的那张牌算你点炮，用幺鸡补的那张留在副露里顶替被抢走的真牌（只能等摸到真牌再杠了；这只幺鸡结算喜钱时仍算你的）；另外每有一组 4 张相同的牌（明杠 / 暗杠 / 补杠，或碰后手里留一张、手里 4 张没杠）再加 1 番，叫做「根」——不杠就拿不到杠钱，但根番照算。杠钱是预收：流局时没听牌的人不仅赔叫，还要把本局收到的杠钱全部退回去，只有胡走了（三人胡满结束）才真收得进。牌桌中央的四方牌背就是剩余牌墙，每摸一张就少一张。</p>
<h3>操作方式</h3>
<ul>
<li>点击手牌选中（高亮），再点一次或点「出牌」确认，减少误触；不可打的牌会弱化显示并说明原因</li>
<li>换三张阶段选 3 张同花色后确认；定缺阶段直接点击花色按钮</li>
<li>能碰 / 杠 / 胡时，手牌上方会出现对应操作条；「胡」按钮金色突出，多种杠会逐项列出。这些动作都只是可选项：不想碰 / 不想杠就直接点手牌出牌（例如碰了 7 条、手里还有 7/8/9 条要留顺子时，不补杠一样能打），操作条会提示「杠可选」</li>
<li>手牌打缺后显示听牌提示；AI 建议栏只做参考，不代打</li>
<li>对手头像右下角的数字是他的手牌张数（越少越接近听牌）；他的碰、杠按整组牌面 + 标签显示，牌型一眼可辨</li>
<li>点击任意对手头像，可查看其积分、手牌数、缺门、副露与本局得失</li>
<li>电脑端鼠标点击，移动端触控操作，所有按钮均已做触控友好处理</li>
<li>联机对局：房主（头像旁 👑）可改规则、加 / 移除 AI、开始游戏；轮到你的操作会在顶栏显示剩余秒数，超时由 AI 代打一手，不会卡住牌局</li>
<li>联机对局：点右侧 💬 打开交流面板，🎤 按住说话发语音、或点快捷短语，同桌即时收到（服务器只转发不存储），气泡点 🔊 可重播</li>
</ul>
<p><small>背景音乐：Ishikari Lore · Kevin MacLeod（incompetech.com），CC-BY 4.0 授权；报牌与碰 / 杠 / 胡播报为 AI 合成语音。</small></p>
</div>

<style>
/* ============ 基础 ============ */
#scmjGame {
  position: relative;
  max-width: 1080px;
  margin: 18px auto;
  padding: 16px;
  border-radius: 18px;
  color: #f3ead8;
  font-size: 15px;
  box-sizing: border-box;
  background: radial-gradient(ellipse at center, #1c6b3c 0%, #14532d 55%, #0d3b20 100%);
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.35), 0 10px 30px rgba(0, 0, 0, 0.25);
  -webkit-tap-highlight-color: transparent;
  /* ============ 移动端手势（Android / iPhone 一致） ============
     1. touch-action: manipulation —— 允许单指滚动与双指捏合缩放（pinch-zoom
        保留，用户仍可自己放大看牌），但禁掉 double-tap-zoom（双击放大）：
        打牌要双击出牌，双击放大最容易误触把牌桌推歪。iOS Safari 从 iOS 10 起
        忽略 viewport 的 user-scalable=no / maximum-scale（无障碍原因），
        只能靠 touch-action 兜住，所以 Android 与 iPhone 都靠这一条生效。
     2. 按钮与牌面另加 manipulation，保证双击出牌时点击即时响应、不触发双击放大。
     3. -webkit-touch-callout + user-select：长按不再弹 iOS 的「拷贝 / 查询」
        菜单、也不会把牌面文字选蓝。 */
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  overscroll-behavior: contain;
}
#scmjGame [hidden] { display: none !important; }
#scmjGame button { font: inherit; cursor: pointer; }
/* 按钮与牌面：双击不缩放（manipulation 不含 double-tap-zoom），点击即时响应 */
#scmjGame button,
#scmjGame .scmj-tile,
#scmjGame .scmj-seat { touch-action: manipulation; }
#scmjGame button:disabled { opacity: 0.45; cursor: default; }
/* 动画总开关（设置里可关） */
#scmjGame.scmj-no-anim *,
#scmjGame.scmj-no-anim *::before,
#scmjGame.scmj-no-anim *::after {
  animation: none !important;
  transition: none !important;
}

/* ============ 通用按钮（触控友好，min-height 44px，不依赖 hover） ============ */
#scmjGame .scmj-btn {
  min-height: 44px;
  padding: 8px 18px;
  border-radius: 12px;
  border: 1px solid #3f7a54;
  background: rgba(247, 241, 227, 0.92);
  color: #14532d;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 1px;
}
#scmjGame .scmj-btn:active { transform: translateY(1px); }
#scmjGame .scmj-btn-primary {
  background: linear-gradient(180deg, #e8c96a 0%, #d4af37 100%);
  border-color: #b8942a;
  color: #3d2f1f;
}
#scmjGame .scmj-btn-ghost {
  background: rgba(13, 59, 32, 0.5);
  border-color: #3f7a54;
  color: #f3ead8;
}
#scmjGame .scmj-btn-hu {
  background: linear-gradient(180deg, #ffe08a 0%, #d4af37 100%);
  border-color: #ffe08a;
  color: #4a3305;
  font-size: 18px;
  box-shadow: 0 0 14px rgba(212, 175, 55, 0.75);
  animation: scmjBreath 1.6s ease-in-out infinite;
}
#scmjGame .scmj-btn-peng,
#scmjGame .scmj-btn-gang { background: #f7f1e3; color: #7c2d12; border-color: #c9b98a; }
#scmjGame .scmj-btn-pass { background: rgba(247, 241, 227, 0.75); color: #5b6b5e; }
#scmjGame .scmj-btn-void { background: #f7f1e3; color: #14532d; }

/* ============ 入口屏 ============ */
#scmjGame .scmj-entry {
  display: flex;
  justify-content: center;
  padding: 10px 8px;
}
#scmjGame .scmj-entry-card {
  width: min(460px, 100%);
  background: rgba(9, 40, 21, 0.55);
  border: 1px solid rgba(212, 175, 55, 0.4);
  border-radius: 16px;
  padding: 18px 20px;
  text-align: center;
}
#scmjGame .scmj-entry-title { font-size: 22px; font-weight: 800; color: #ffd968; }
#scmjGame .scmj-entry-sub { margin: 5px 0 14px; color: #cfe3d2; font-size: 13px; }
#scmjGame .scmj-entry-label { color: #cfe3d2; flex: none; }
/* 入口选项行：换三张开关 + 封顶番数步进器同一行，窄屏自动换行也不溢出 */
#scmjGame .scmj-entry-opts {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-bottom: 12px;
  color: #cfe3d2;
}
#scmjGame .scmj-entry-opt { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; }
/* 封顶番数：点 − / ＋ 加减数字（2~6 番），比滑杆省地方且竖屏不会溢出 */
#scmjGame .scmj-stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(212, 175, 55, 0.45);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(9, 40, 21, 0.6);
}
#scmjGame .scmj-step {
  appearance: none;
  -webkit-appearance: none;
  width: 34px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: #ffd968;
  font-family: inherit;
  font-size: 17px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
#scmjGame .scmj-step:active { background: rgba(212, 175, 55, 0.18); }
#scmjGame .scmj-step:disabled { color: rgba(255, 217, 104, 0.3); cursor: default; }
#scmjGame .scmj-step:disabled:active { background: transparent; }
#scmjGame .scmj-step-val {
  min-width: 50px;
  padding: 0 6px;
  line-height: 30px;
  text-align: center;
  color: #ffd968;
  font-size: 14px;
  font-weight: 700;
  border-left: 1px solid rgba(212, 175, 55, 0.3);
  border-right: 1px solid rgba(212, 175, 55, 0.3);
}
#scmjGame .scmj-entry-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#scmjGame .scmj-entry-btns .scmj-btn { width: 100%; }
#scmjGame .scmj-entry-btns .scmj-btn:first-child { grid-column: 1 / -1; }
/* 联机入口：与单机「开始游戏」同为整行主按钮，但用描金深底区分两种玩法 */
#scmjGame .scmj-entry-btns .scmj-btn-online {
  grid-column: 1 / -1;
  background: rgba(13, 59, 32, 0.65);
  border-color: #d4af37;
  color: #ffd968;
}
#scmjGame .scmj-entry-tip { margin-top: 10px; font-size: 11.5px; color: #9fbfa8; }

/* ============ 联机倒计时（服务端权威 deadline） ============ */
#scmjGame .scmj-countdown {
  flex: 0 1 auto;
  font-size: 12.5px;
  font-weight: 800;
  color: #ffd968;
  background: rgba(212, 175, 55, 0.16);
  border: 1px solid rgba(212, 175, 55, 0.45);
  border-radius: 10px;
  padding: 3px 10px;
  white-space: nowrap;
}
#scmjGame .scmj-countdown-urgent {
  color: #ffb4a2;
  border-color: #e07a5f;
  background: rgba(224, 122, 95, 0.22);
}

/* ============ 联机大厅 / 等待室 ============ */
#scmjGame .scmj-lobby { padding: 4px 0; }
#scmjGame .scmj-lobby-shell { width: min(760px, 100%); margin: 0 auto; }
#scmjGame .scmj-lb {
  background: rgba(9, 40, 21, 0.55);
  border: 1px solid rgba(212, 175, 55, 0.4);
  border-radius: 16px;
  padding: 14px 16px;
  color: #f3ead8;
}
#scmjGame .scmj-lb-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; flex-wrap: wrap; margin-bottom: 12px;
}
#scmjGame .scmj-lb-title { font-size: 18px; font-weight: 800; color: #ffd968; }
#scmjGame .scmj-lb-code { color: #ffd968; letter-spacing: 2px; }
#scmjGame .scmj-lb-banner {
  margin-bottom: 10px; padding: 7px 10px; border-radius: 10px; font-size: 13px;
  background: rgba(212, 175, 55, 0.16); border: 1px solid rgba(212, 175, 55, 0.5); color: #ffd968;
}
#scmjGame .scmj-lb-banner-bad {
  background: rgba(224, 122, 95, 0.18); border-color: #e07a5f; color: #ffb4a2;
}
#scmjGame .scmj-lb-resume {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  flex-wrap: wrap; margin-bottom: 10px; padding: 8px 10px; border-radius: 10px; font-size: 13px;
  background: rgba(13, 59, 32, 0.7); border: 1px dashed #3f7a54;
}
#scmjGame .scmj-lb-name,
#scmjGame .scmj-lb-join { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
#scmjGame .scmj-lb-name > span { flex: none; font-size: 13px; color: #cfe3d2; }
/* 输入框：桌面/移动端都能选中文字（容器整体 user-select: none，这里必须放开） */
#scmjGame .scmj-lb input {
  flex: 1 1 auto; min-width: 0; min-height: 44px; box-sizing: border-box;
  padding: 8px 12px; border-radius: 12px; font: inherit; font-size: 15px;
  color: #f3ead8; background: rgba(9, 40, 21, 0.7); border: 1px solid #3f7a54;
  -webkit-user-select: text; user-select: text;
}
#scmjGame .scmj-lb input::placeholder { color: #7f9c88; }
#scmjGame .scmj-lb-join input { flex: 0 1 200px; text-transform: uppercase; letter-spacing: 3px; }
#scmjGame .scmj-lb-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
#scmjGame .scmj-lb-meta { font-size: 12px; color: #9fbfa8; margin-bottom: 8px; }
#scmjGame .scmj-lb-warn { color: #ffb4a2; }
#scmjGame .scmj-lb-rooms {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;
}
#scmjGame .scmj-lb-empty { padding: 18px; text-align: center; color: #9fbfa8; font-size: 13px; }
#scmjGame .scmj-lb-room {
  background: rgba(13, 59, 32, 0.6); border: 1px solid #3f7a54; border-radius: 12px; padding: 10px;
}
#scmjGame .scmj-lb-room-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
#scmjGame .scmj-lb-status { font-size: 11.5px; padding: 2px 8px; border-radius: 8px; border: 1px solid; }
#scmjGame .scmj-lb-status-WAITING { color: #9ee6b4; border-color: #3f7a54; background: rgba(63, 122, 84, 0.25); }
#scmjGame .scmj-lb-status-PLAYING { color: #ffd968; border-color: #b8942a; background: rgba(212, 175, 55, 0.16); }
#scmjGame .scmj-lb-status-FINISHED { color: #c9b98a; border-color: #7a6f52; background: rgba(201, 185, 138, 0.12); }
#scmjGame .scmj-lb-count { font-size: 11.5px; color: #9fbfa8; margin-left: auto; }
#scmjGame .scmj-lb-seats,
#scmjGame .scmj-lb-waitseats { display: flex; flex-wrap: wrap; gap: 6px; }
#scmjGame .scmj-lb-waitseats { margin-bottom: 12px; }
#scmjGame .scmj-lb-seat {
  display: flex; align-items: center; gap: 6px; flex: 1 1 calc(50% - 6px); min-width: 130px;
  padding: 6px 8px; border-radius: 10px; font-size: 13px;
  border: 1px solid #3f7a54; background: rgba(9, 40, 21, 0.5);
}
#scmjGame .scmj-lb-seat-empty { color: #7f9c88; border-style: dashed; }
#scmjGame .scmj-lb-seat-ai { color: #cfe3d2; border-color: #4d7c8a; }
#scmjGame .scmj-lb-seat-offline { color: #ffb4a2; border-color: #e07a5f; }
#scmjGame .scmj-lb-seat-human { color: #f3ead8; }
#scmjGame .scmj-lb-seatname { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#scmjGame .scmj-lb-seatpos { font-size: 11px; color: #9fbfa8; }
#scmjGame .scmj-lb-crown { font-style: normal; }
#scmjGame .scmj-lb-me { font-size: 11px; color: #14532d; background: #ffd968; border-radius: 6px; padding: 0 5px; }
#scmjGame .scmj-lb-ready {
  font-size: 11px; border-radius: 6px; padding: 0 6px;
  color: #cfe3d2; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.18);
}
#scmjGame .scmj-lb-ready.ok { color: #14532d; background: #ffd968; border-color: #ffd968; font-weight: 700; }
#scmjGame .scmj-lb-seatbtn,
#scmjGame .scmj-lb-step {
  appearance: none; -webkit-appearance: none; font: inherit; cursor: pointer;
  min-height: 28px; padding: 2px 8px; border-radius: 8px; font-size: 12px;
  color: #14532d; background: rgba(247, 241, 227, 0.92); border: 1px solid #c9b98a;
}
#scmjGame .scmj-lb-step { min-width: 30px; padding: 0 6px; font-weight: 800; }
#scmjGame .scmj-lb-seatbtn:disabled,
#scmjGame .scmj-lb-step:disabled { opacity: 0.45; cursor: default; }
#scmjGame .scmj-lb-room-btns { margin-top: 8px; }
#scmjGame .scmj-lb-room-btns .scmj-btn { width: 100%; min-height: 38px; }
#scmjGame .scmj-lb-invite {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 10px; font-size: 13px; color: #cfe3d2;
}
#scmjGame .scmj-lb-rules {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  margin-bottom: 12px; font-size: 13px; color: #cfe3d2;
}
#scmjGame .scmj-lb-rule { display: inline-flex; align-items: center; gap: 6px; }
#scmjGame .scmj-lb-rules-ro { opacity: 0.75; }
#scmjGame .scmj-lb-foot { display: flex; justify-content: center; }
#scmjGame .scmj-lb-foot .scmj-btn { width: 100%; }
#scmjGame .scmj-lb-tip { text-align: center; color: #9fbfa8; font-size: 13px; padding: 10px; }

/* ============ 牌桌顶栏 ============ */
#scmjGame .scmj-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
#scmjGame .scmj-topbar-title { font-weight: 800; color: #ffd968; font-size: 17px; }
#scmjGame .scmj-round-chip {
  /* 只裹住文字本身，不再拉伸成长条：横屏窄高时给两侧留出空间 */
  flex: 0 1 auto;
  text-align: center;
  font-size: 12.5px;
  color: #ffd968;
  background: rgba(212, 175, 55, 0.16);
  border: 1px solid rgba(212, 175, 55, 0.45);
  border-radius: 10px;
  padding: 3px 10px;
  max-width: 100%;
  white-space: nowrap;
}
#scmjGame .scmj-topbar-btns { display: flex; gap: 8px; }
#scmjGame .scmj-topbar-btns .scmj-btn { min-height: 40px; padding: 6px 14px; font-size: 14px; }

/* 竖屏提示（桌面/横屏隐藏） */
#scmjGame .scmj-portrait-tip { display: none; margin-bottom: 8px; padding: 8px 12px; border-radius: 10px; background: rgba(212, 175, 55, 0.15); border: 1px dashed rgba(212, 175, 55, 0.6); color: #ffd968; font-size: 13px; text-align: center; }

/* ============ 牌桌布局（四方向：上=对家 右=下家 左=上家 下=自己） ============ */
#scmjGame .scmj-board {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr) 168px;
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    "side2 side2  side2"
    "side3 center side1";
  gap: 8px;
  min-height: 400px;
}
#scmjGame .scmj-side-2 { grid-area: side2; }
#scmjGame .scmj-side-3 { grid-area: side3; }
#scmjGame .scmj-side-1 { grid-area: side1; }
#scmjGame .scmj-center { grid-area: center; }
#scmjGame .scmj-side {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  align-self: start;
}
/* 左右两侧：面板铺满本列 */
#scmjGame .scmj-side-3 > *,
#scmjGame .scmj-side-1 > * { width: 100%; box-sizing: border-box; }
/* 座位区 = 状态浮字 + 精简面板 + 副露牌排（上下结构） */
#scmjGame .scmj-seatwrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
}
#scmjGame .scmj-side-3 .scmj-seatwrap,
#scmjGame .scmj-side-1 .scmj-seatwrap { width: 100%; }
/* 顶部对家一栏：对家面板居中（弃牌已收进中央桌布，见 .scmj-felt）。
   必须写在本文件 .scmj-side（列方向）之后，否则同权重会被覆盖成上下堆叠。 */
#scmjGame .scmj-side-2 {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
#scmjGame .scmj-side-2 .scmj-seatwrap { width: min(300px, 60%); box-sizing: border-box; }

/* 方位标注：东/南/西/北 */
#scmjGame .scmj-windtag {
  flex: none;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: rgba(212, 175, 55, 0.18);
  border: 1px solid rgba(212, 175, 55, 0.55);
  color: #ffd968;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
}
#scmjGame .scmj-windtag-dealer { background: #d4af37; color: #3d2f1f; border-color: #ffe08a; }
#scmjGame .scmj-windtag-pos { font-size: 9px; font-weight: 700; opacity: 0.85; }
/* 定缺角标：定缺后座位上显示该家缺门，替代「风位 + 方位」标注（缺门为公开信息） */
#scmjGame .scmj-voidtag {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.5px;
  color: #fff;
  background: rgba(20, 83, 45, 0.8);
  border: 1px solid rgba(212, 175, 55, 0.55);
}
#scmjGame .scmj-voidtag-wan { background: rgba(190, 60, 50, 0.9); border-color: #e88b7a; }
#scmjGame .scmj-voidtag-tong { background: rgba(45, 90, 175, 0.9); border-color: #86a8e8; }
#scmjGame .scmj-voidtag-tiao { background: rgba(40, 130, 70, 0.9); border-color: #7fd0a0; }

/* ---- AI 面板（精简：头像 + 名字 + 积分一行，点击弹详情） ---- */
#scmjGame .scmj-seat {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 6px 8px;
  border-radius: 14px;
  background: rgba(9, 40, 21, 0.55);
  border: 1px solid #2c5c3c;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
#scmjGame .scmj-seat:active { transform: translateY(1px); }
#scmjGame .scmj-seat-active { border-color: #d4af37; animation: scmjBreath 1.8s ease-in-out infinite; }
#scmjGame .scmj-seat-hu { background: rgba(212, 175, 55, 0.14); }
#scmjGame .scmj-avatar {
  position: relative;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: radial-gradient(circle at 35% 30%, #f0e6c8, #cbb98a);
  border: 2px solid #d4af37;
}
/* 对手手牌数角标：常驻贴在头像右下角（不占布局高度，也不会被裁切） */
#scmjGame .scmj-seat-hand {
  position: absolute;
  right: -7px;
  bottom: -5px;
  z-index: 3;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  color: #ffd968;
  background: rgba(9, 40, 21, 0.95);
  border: 1px solid rgba(212, 175, 55, 0.75);
  pointer-events: none;
}
#scmjGame .scmj-seat-meta { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
#scmjGame .scmj-seat-name { font-weight: 700; color: #f3ead8; font-size: 12.5px; line-height: 1.2; }
#scmjGame .scmj-seat-score { font-size: 11.5px; color: #ffd968; font-weight: 700; line-height: 1.2; white-space: nowrap; }
/* 连庄标：>=2 轮显示「连庄 xN」，>=3 轮带 🔥 与辉光 */
#scmjGame .scmj-streak {
  position: absolute;
  right: -6px;
  top: -8px;
  z-index: 2;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  background: rgba(212, 175, 55, 0.92);
  color: #3d2f1f;
  border: 1px solid #ffe08a;
}
#scmjGame .scmj-streak-hot {
  background: linear-gradient(180deg, #ff9a3c, #e0532d);
  color: #fff7e8;
  border-color: #ffc46b;
  box-shadow: 0 0 8px rgba(255, 122, 40, 0.85);
}
/* 已胡 / 行动中 小角标（不占一整排空间） */
#scmjGame .scmj-seat-flag {
  position: absolute;
  left: -6px;
  bottom: -6px;
  z-index: 2;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  background: rgba(247, 241, 227, 0.9);
  color: #14532d;
  border: 1px solid #c9b98a;
}
#scmjGame .scmj-seat-flag-hu { background: #ffd968; color: #4a3305; border-color: #ffe08a; }
/* 定缺阶段浮字（座位上方，参考主流界面） */
#scmjGame .scmj-seatpend {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 1px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  color: #ffd968;
  background: rgba(9, 40, 21, 0.72);
  border: 1px dashed rgba(212, 175, 55, 0.55);
  pointer-events: none;
}
/* 副露牌排（面板正下方，牌面小图） */
#scmjGame .scmj-seatmelds {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px 1px;
  min-height: 0;
}
#scmjGame .scmj-seatmelds:empty { display: none; }
#scmjGame .scmj-seatmelds .scmj-tile-disc { width: 18px; height: 25px; }
/* 详情弹层用 */
#scmjGame .scmj-delta-pos { color: #7ee2a0; }
#scmjGame .scmj-delta-neg { color: #ff9d9d; }
#scmjGame .scmj-delta-zero { color: #cfe3d2; }

/* ---- 对手详情弹层（点击座位面板弹出） ---- */
#scmjGame .scmj-pop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
}
#scmjGame .scmj-pop-card {
  position: relative;
  z-index: 1;
  width: min(300px, 86vw);
  padding: 16px 16px 14px;
  border-radius: 14px;
  background: rgba(9, 40, 21, 0.96);
  border: 1px solid rgba(212, 175, 55, 0.55);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45);
  text-align: center;
}
#scmjGame .scmj-pop-title { font-size: 15px; font-weight: 800; color: #ffd968; margin-bottom: 10px; }
#scmjGame .scmj-pop-rows { margin-bottom: 12px; }
#scmjGame .scmj-pop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 2px;
  font-size: 13px;
  color: #cfe3d2;
  border-bottom: 1px dashed rgba(247, 241, 227, 0.12);
}
#scmjGame .scmj-pop-row:last-child { border-bottom: none; }
#scmjGame .scmj-pop-row b { color: #f3ead8; font-weight: 700; text-align: right; }
#scmjGame .scmj-pop-card .scmj-btn { width: 100%; min-height: 40px; }

/* ---- 中央信息区 ---- */
/* 中央区：三行 —— 信息条 / 正方形牌墙面板 / 最新动态。
   文字各行独占整行宽度（中央区横屏很宽，不会换行挤压牌墙）；
   中间行只负责定位，真正的正方形面板是里面的 .scmj-centerbox，
   边长由 ui.js fitCenterBox 取该行可用宽高的较小值写入，
   因此无论横竖屏，牌桌中间部分恒为正方形，不会在横屏被拉成长方形。 */
#scmjGame .scmj-center {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  justify-items: center;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 0;
}
/* 正方形定位槽：撑满中间行，供 ui.js 量取可用宽高（自身不参与视觉） */
#scmjGame .scmj-centerslot {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
/* 正方形面板：背景/边框都画在这一层，尺寸＝正方形边长（ui.js 写入内联宽高） */
#scmjGame .scmj-centerbox {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  background:
    radial-gradient(ellipse at center, rgba(9, 40, 21, 0.35) 0%, rgba(9, 40, 21, 0.62) 100%);
  border: 1px solid #2c5c3c;
}
#scmjGame .scmj-centerbox > * { position: relative; z-index: 1; }

/* 牌墙盒：撑满正方形面板，牌墙正方形由 ui.js fitWallRing 按本盒宽高较小值计算。 */
#scmjGame .scmj-wallbox {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ---- 中央牌墙：四方围一圈牌背（传统双层叠砌，摸一张少一张） ---- */
/* 牌墙恒为正方形（边长 = 牌墙盒宽高较小值，由 ui.js fitWallRing 写入内联
   尺寸与 --scmj-wall-* 变量），横屏不会被拉长成长方形。
   真实牌墙每边 2 张一叠，同一长度下可见数量只有一半，占地更小：
   - 上下为横向墙：长度沿 X 铺开（grid-auto-flow: column），
     2 行 = 前后两层；
   - 左右为纵向墙：长度沿 Y 铺开（grid-auto-flow: row），
     2 列 = 前后两层。
   已摸走的牌从本局摸牌起点方位（骰子定的墙头）开始逐张吃掉，
   缺口从那方起转圈扩大，直观反映剩余量。 */
#scmjGame .scmj-wallring {
  position: absolute;
  inset: 2px;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
#scmjGame .scmj-wallring > div { position: absolute; display: grid; gap: 1px; }
/* 上下墙（横向墙）：牌横躺，长边顺着墙走。横过来后单张正好占满「一张牌高」的
   格宽，7 摞之间只剩 1px 缝，整条边看起来是连续的一条，和左右墙一致；
   2 行 = 两层牌深（径向各占一张牌宽），故行高按牌宽写死。 */
#scmjGame .scmj-wallring-top,
#scmjGame .scmj-wallring-bottom {
  left: var(--scmj-wall-inset, 20px);
  right: var(--scmj-wall-inset, 20px);
  grid-template-rows: repeat(2, var(--scmj-wall-tile-w, 17px));
  grid-template-columns: repeat(7, var(--scmj-wall-tile-h, 22px));
  grid-auto-flow: column;
  justify-content: center;
  justify-items: center;
  align-items: center;
}
#scmjGame .scmj-wallring-top .scmj-wallback,
#scmjGame .scmj-wallring-bottom .scmj-wallback {
  /* 贴图整体转 90°（不是拉伸变形）：转完的视觉尺寸正好等于横躺的格子 */
  transform: rotate(90deg);
}
#scmjGame .scmj-wallring-top { top: 0; }
#scmjGame .scmj-wallring-bottom { bottom: 0; }
/* 左右墙（纵向墙）：牌竖放，2 列 = 两层牌深，沿 Y 排 7 行紧铺 */
#scmjGame .scmj-wallring-left,
#scmjGame .scmj-wallring-right {
  top: var(--scmj-wall-inset, 20px);
  bottom: var(--scmj-wall-inset, 20px);
  grid-template-columns: repeat(2, var(--scmj-wall-tile-w, 17px));
  grid-template-rows: repeat(7, var(--scmj-wall-tile-h, 22px));
  grid-auto-flow: row;
  align-content: center;
  justify-items: center;
  align-items: center;
}
#scmjGame .scmj-wallring-left { left: 0; }
#scmjGame .scmj-wallring-right { right: 0; }
/* 牌背：真实牌张贴图（/mahjong/tiles/back.png，158×200 竖版，带透明通道），
   长边一律顺着墙走——左右墙竖放（上墙/下墙的横躺由上面 rotate(90deg) 处理），
   尺寸按真实比例由 ui.js fitWallRing 写入；上下墙 2 行为两层牌深，
   左右墙 2 列为两层牌深，与真实牌墙的叠砌一致。 */
#scmjGame .scmj-wallback {
  box-sizing: border-box;
  width: var(--scmj-wall-tile-w, 17px);
  height: var(--scmj-wall-tile-h, 22px);
  background-image: url('/mahjong/tiles/back.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
}
/* 被摸走的牌位：留空位但占位不位移，缺口即开牌/消耗轨迹 */
#scmjGame .scmj-wallback-gap {
  visibility: hidden;
}
#scmjGame .scmj-center-info {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 100%;
  font-size: 14px;
  color: #ffd968;
  text-align: center;
  flex-wrap: wrap;
  justify-content: center;
}
#scmjGame .scmj-center-info b { font-size: 20px; }
#scmjGame .scmj-center-latest { max-width: 100%; font-size: 13px; color: #f3ead8; min-height: 20px; text-align: center; }

/* ---- 方位罗盘：上=对家 右=下家 下=自己 左=上家 ----
   居中叠在正方形牌墙内圈里（纯装饰，不参与点击）。
   尺寸由 ui.js fitWallRing 按牌墙边长写入 --scmj-compass-size，
   牌墙小时罗盘同比缩小，永远待在牌墙内圈，不会溢出去压住上下两行文字。 */
#scmjGame .scmj-compass {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 4; /* 圆盘+剩余数压过桌布弃牌（最高 z-index 3）：弃牌多了伸到罗盘底下被盖，如真实牌桌 */
  pointer-events: none;
  width: var(--scmj-compass-size, 104px);
  height: var(--scmj-compass-size, 104px);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 45%, rgba(212, 175, 55, 0.16) 0%, rgba(9, 40, 21, 0.5) 70%);
  border: 1px dashed rgba(212, 175, 55, 0.45);
}
/* 风位圆牌独立层：与罗盘同位同尺寸，但 z-index 0 沉在弃牌（z1-3）之下——
   东南西北只是牌桌嵌入的方位指示，弃牌多了应自然压住它，而非被它挡住 */
#scmjGame .scmj-winds {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: var(--scmj-compass-size, 104px);
  height: var(--scmj-compass-size, 104px);
  z-index: 0;
  pointer-events: none;
}
#scmjGame .scmj-compass-core {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.05;
  white-space: nowrap;
}
/* 罗盘核心 = 剩余牌墙张数（旧「方位」二字无信息量，剩余数原来独占顶部一行，收进罗盘省空间） */
#scmjGame .scmj-compass-core b {
  font-size: calc(var(--scmj-compass-size, 104px) * 0.24);
  color: #ffd968;
  font-weight: 800;
}
#scmjGame .scmj-compass-core i {
  font-style: normal;
  font-size: calc(var(--scmj-compass-size, 104px) * 0.1);
  color: #9fbfa8;
  letter-spacing: 1px;
}
/* 风位圆牌随罗盘同比缩放（含探出罗盘的偏移量），整体占位 ≈ 罗盘直径 ×1.12 */
#scmjGame .scmj-wind {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: calc(var(--scmj-compass-size, 104px) * 0.29);
  height: calc(var(--scmj-compass-size, 104px) * 0.29);
  border-radius: 50%;
  background: rgba(247, 241, 227, 0.9);
  color: #14532d;
  font-size: calc(var(--scmj-compass-size, 104px) * 0.135);
  font-weight: 800;
  line-height: 1;
  border: 1px solid #c9b98a;
}
#scmjGame .scmj-wind-seat { font-size: calc(var(--scmj-compass-size, 104px) * 0.077); font-weight: 600; color: #5b6b5e; margin-top: 1px; }
#scmjGame .scmj-wind-top { left: 50%; top: calc(var(--scmj-compass-size, 104px) * -0.058); transform: translateX(-50%); }
#scmjGame .scmj-wind-bottom { left: 50%; bottom: calc(var(--scmj-compass-size, 104px) * -0.058); transform: translateX(-50%); }
#scmjGame .scmj-wind-left { left: calc(var(--scmj-compass-size, 104px) * -0.058); top: 50%; transform: translateY(-50%); }
#scmjGame .scmj-wind-right { right: calc(var(--scmj-compass-size, 104px) * -0.058); top: 50%; transform: translateY(-50%); }
#scmjGame .scmj-wind-turn {
  background: linear-gradient(180deg, #ffe08a, #d4af37);
  border-color: #ffe08a;
  box-shadow: 0 0 10px rgba(212, 175, 55, 0.85);
  color: #4a3305;
}
#scmjGame .scmj-wind-me { background: #f7f1e3; border-color: #ffe08a; }
#scmjGame .scmj-wind-dealer::after {
  content: '庄';
  position: absolute;
  right: -4px;
  top: -4px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #7c2d12;
  color: #ffe4d0;
  font-size: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- 中央桌布弃牌（传统摆法：四家各一小堆摆在牌墙内圈，近大远小） ----
   felt 铺满牌墙内圈（inset = 牌墙厚度 + 2px，由 ui.js fitWallRing 写入），
   四堆各居一方、从自家边缘向桌心生长；牌多了自然伸到罗盘底下被压住——
   与真实麻将桌「转盘压着弃牌」一致。自己最近最大（z-index 3），对家最远最小。 */
#scmjGame .scmj-felt {
  position: absolute;
  inset: var(--scmj-felt-inset, 24px);
  z-index: 1;
  pointer-events: none;
}
#scmjGame .scmj-felt .scmj-disc-tiles {
  position: absolute;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 1px;
  margin: 0;
  max-width: none;
}
/* 上 = 对家（最小，向桌心生长）；牌头朝自家 = 旋转 180°（转圈摆法）。
   四堆都设硬边界（对家 30% 高、左右 27% 宽、自己 44% 高）：物理分区互不穿插，
   尾期牌多只在角区以 z 序叠压（近大远小），不再整牌互穿 */
#scmjGame .scmj-felt-disc-2 {
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  max-width: 88%;
  max-height: 30%;
  justify-content: center;
  align-content: flex-start;
  z-index: 1;
  --scmj-disc-rot: 180deg;
}
/* 下 = 自己（近大，压过别家弃牌） */
#scmjGame .scmj-felt-disc-0 {
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  max-width: 94%;
  max-height: 44%;
  justify-content: center;
  align-content: flex-end;
  z-index: 3;
}
/* 左 = 上家 / 右 = 下家：竖排紧贴自家边，排满换列向桌心生长；
   牌头朝自家：左家 -90°、右家 +90°（真实牌桌转圈摆法，旋转不改变布局占位） */
#scmjGame .scmj-felt-disc-3 {
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  max-height: 88%;
  max-width: 27%;
  flex-direction: column;
  justify-content: center;
  align-content: flex-start;
  column-gap: 4px; /* 旋转后视觉牌宽=牌高，横向间隙加大防视觉互叠 */
  z-index: 2;
  --scmj-disc-rot: -90deg;
}
#scmjGame .scmj-felt-disc-1 {
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  max-height: 88%;
  max-width: 27%;
  flex-direction: column;
  justify-content: center;
  align-content: flex-end;
  column-gap: 4px;
  z-index: 2;
  --scmj-disc-rot: 90deg;
}
/* 桌布弃牌尺寸随牌墙内圈缩放（变量由 fitWallRing 写入），近大远小；
   各家按方位旋转（--scmj-disc-rot），牌头一律朝自家方向 */
#scmjGame .scmj-felt .scmj-tile-disc {
  width: var(--scmj-felt-tile-w, 18px);
  height: var(--scmj-felt-tile-h, 24px);
  transform: rotate(var(--scmj-disc-rot, 0deg));
}
#scmjGame .scmj-felt-disc-0 .scmj-tile-disc {
  width: var(--scmj-felt-tile0-w, 24px);
  height: var(--scmj-felt-tile0-h, 32px);
}

/* ============ 麻将牌（贴图：/mahjong/tiles/*.png，透明背景） ============ */
#scmjGame .scmj-tile {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  padding: 0;
  background: transparent;
  line-height: 0;
  -webkit-user-select: none;
  user-select: none;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.35));
}
#scmjGame .scmj-tile-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
}
/* 手牌：占最大交互面积，触控友好。尺寸由 ui.js fitHand 按可用空间自适应写入
   --scmj-hand-tile-*（牌面按真实牌张比例铺满），下面的兜底值只在 JS 未跑到时生效。 */
#scmjGame .scmj-tile-hand {
  width: var(--scmj-hand-tile-w, clamp(42px, 4.6vw, 54px));
  height: var(--scmj-hand-tile-h, clamp(56px, 6.4vw, 71px));
  flex: none;
  transition: transform 0.12s ease;
}
/* 新摸的牌与原手牌留正间距（与 fitHand 里的排布算法用同一个值，
   保证「按该宽度算出来正好一行放得下」成立） */
#scmjGame .scmj-hand .scmj-tile.scmj-tile-drawn { margin-left: var(--scmj-hand-gap, 12px); }
#scmjGame .scmj-tile-hand:active { transform: translateY(2px); }
/* 选中：上移 + 金色底光（z-index 保证盖住紧贴的邻牌） */
#scmjGame .scmj-tile-selected {
  transform: translateY(-12px);
  filter: drop-shadow(0 0 6px rgba(212, 175, 55, 0.95)) drop-shadow(0 3px 3px rgba(0, 0, 0, 0.4));
  z-index: 3;
}
/* 不可打的牌：弱化显示 */
#scmjGame .scmj-tile-disabled { opacity: 0.42; filter: grayscale(0.6) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3)); }
/* 缺门牌角标（需盖住右侧紧贴的邻牌） */
#scmjGame .scmj-tile-voidsuit { z-index: 2; }
#scmjGame .scmj-tile-voidmark {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #b91c1c;
  color: #ffe4d0;
  font-size: 10px;
  font-weight: 800;
  line-height: 16px;
  text-align: center;
}
/* 幺鸡赖子角标：金色「赖」，位置与缺门红角标一致（幺鸡局才有） */
#scmjGame .scmj-tile-wildsuit { z-index: 2; }
#scmjGame .scmj-tile-wildmark {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #b8860b;
  color: #fff8e1;
  font-size: 10px;
  font-weight: 800;
  line-height: 16px;
  text-align: center;
}
/* 副露小牌（disc）尺寸更小，角标按比例缩小并保证盖住邻牌 */
#scmjGame .scmj-tile-disc .scmj-tile-wildmark {
  top: -1px;
  right: -1px;
  width: 12px;
  height: 12px;
  font-size: 8px;
  line-height: 12px;
}
/* 小牌（弃牌 / 副露）：flex: none 固定尺寸——弃牌区用 nowrap + 滚动时
   不允许牌被压扁（否则牌越多牌越小，而不是超出滚动） */
#scmjGame .scmj-tile-disc {
  flex: none;
  width: clamp(26px, 2.8vw, 32px);
  height: clamp(35px, 3.8vw, 43px);
}
/* 出牌滑入弃牌区（只表现结果，可在设置中关闭）；
   全程保持 --scmj-disc-rot 方位旋转，避免 felt 里的转圈牌滑入时闪回竖立 */
@keyframes scmjSlideIn {
  from { transform: rotate(var(--scmj-disc-rot, 0deg)) translateY(-14px) scale(0.8); opacity: 0; }
  to { transform: rotate(var(--scmj-disc-rot, 0deg)); opacity: 1; }
}
#scmjGame .scmj-tile-new { animation: scmjSlideIn 0.28s ease-out; }
@keyframes scmjBreath {
  0%, 100% { box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.6); }
  50% { box-shadow: 0 0 12px 2px rgba(212, 175, 55, 0.7); }
}
/* 最新打出的那张：常驻金色亮圈（取代「最新出牌」文本提醒）；
   class 常驻不受动画开关影响——开关关时静止亮圈（基础 box-shadow），开时叠加亮金脉冲。
   独立 keyframes 不复用 scmjBreath：呼吸帧的深金 #d4af37 会盖掉这里的亮金 #ffd968 */
@keyframes scmjLatestPulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(255, 217, 104, 0.85), 0 0 6px 2px rgba(255, 217, 104, 0.45); }
  50% { box-shadow: 0 0 0 2px rgba(255, 217, 104, 1), 0 0 14px 4px rgba(255, 217, 104, 0.8); }
}
#scmjGame .scmj-tile-latest {
  border-radius: 5px;
  box-shadow: 0 0 0 2px rgba(255, 217, 104, 0.95), 0 0 10px 3px rgba(255, 217, 104, 0.6);
  animation: scmjLatestPulse 1.6s ease-in-out infinite;
}
/* 刚打出未落定的瞬间：滑入 + 脉冲双动画并行（latest 的 animation 简写在后会盖掉
   new 的 scmjSlideIn，组合选择器显式合并，两个动画各管各的属性互不干扰） */
#scmjGame .scmj-tile-latest.scmj-tile-new {
  animation: scmjSlideIn 0.28s ease-out, scmjLatestPulse 1.6s ease-in-out 0.28s infinite;
}

/* ============ 玩家区（下方） ============ */
#scmjGame .scmj-player { margin-top: 10px; }
#scmjGame .scmj-actionbar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 52px;
  padding: 6px 8px;
  border-radius: 12px;
  background: rgba(9, 40, 21, 0.45);
  border: 1px solid rgba(44, 92, 60, 0.8);
}
#scmjGame .scmj-action-info { color: #cfe3d2; font-size: 14px; }
/* 无操作时整条隐藏——常驻空横条纯属占位碍眼；有碰/杠/胡/换三张内容时照常显示 */
#scmjGame .scmj-actionbar:empty { display: none; }
#scmjGame .scmj-hintrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin: 8px 2px;
  min-height: 22px;
}
#scmjGame .scmj-ting { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
#scmjGame .scmj-ting-label {
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 12px;
  /* 固定行高：胶囊高度可控，矮屏横屏下的固定高度提示条不会把上下裁掉 */
  line-height: 14px;
  font-weight: 700;
  background: #7c2d12;
  color: #ffe4d0;
}
#scmjGame .scmj-ting-label.scmj-ting-hu { background: #d4af37; color: #3d2f1f; }
#scmjGame .scmj-ting-chip {
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 14px;
  background: rgba(247, 241, 227, 0.92);
  color: #14532d;
  font-weight: 700;
}
#scmjGame .scmj-ting-text { color: #ffd968; font-size: 13px; line-height: 16px; }
/* 当前番数标签（听牌 / 杠后显示） */
#scmjGame .scmj-ting-fan {
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 14px;
  font-weight: 700;
  background: rgba(212, 175, 55, 0.22);
  border: 1px solid rgba(212, 175, 55, 0.65);
  color: #ffd968;
}
#scmjGame .scmj-suggest { color: #cfe3d2; font-size: 12.5px; text-align: right; max-width: 55%; }
/* 副露：单独一排 */
#scmjGame .scmj-mymelds {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 0;
  margin-bottom: 8px;
}
#scmjGame .scmj-meld { display: inline-flex; align-items: center; gap: 0; }
/* 幺鸡赖子补位的那张：金色描边，与同组真牌区分（幺鸡局才有） */
#scmjGame .scmj-tile-wild {
  box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.85);
  border-radius: 6px;
}
#scmjGame .scmj-meld-tag {
  margin-left: 4px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(212, 175, 55, 0.25);
  color: #ffd968;
}
/* 胡牌那张：捡到胡牌者自己一侧，金框高亮标出是哪一张 */
#scmjGame .scmj-meld-win {
  border: 1px solid rgba(212, 175, 55, 0.9);
  border-radius: 8px;
  background: rgba(212, 175, 55, 0.18);
  padding: 1px 3px;
  box-shadow: 0 0 8px rgba(212, 175, 55, 0.5);
}
/* 手牌：最大交互面积，牌与牌横向紧贴成排（行间留空隙） */
#scmjGame .scmj-hand {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 6px 0;
  min-height: 84px;
  padding: 12px 6px 8px;
}

/* ============ 弹层 ============ */
/* z-index 95：确认/规则/设置弹层必须比结算覆盖层（60）、特效（60）、
   浮字（70）、toast（80）更高，否则结算页里点「退出房间」的确认弹窗会被盖住点不到 */
#scmjGame .scmj-modal { position: absolute; inset: 0; z-index: 95; display: flex; align-items: center; justify-content: center; }
#scmjGame .scmj-modal-mask { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55); }
#scmjGame .scmj-modal-body {
  position: relative;
  width: min(560px, 92%);
  max-height: 82%;
  overflow-y: auto;
  background: #102e1d;
  border: 1px solid rgba(212, 175, 55, 0.5);
  border-radius: 16px;
  padding: 20px;
  box-sizing: border-box;
}
#scmjGame .scmj-modal-title { font-size: 18px; font-weight: 800; color: #ffd968; margin-bottom: 12px; text-align: center; }
#scmjGame .scmj-modal-content { margin-bottom: 16px; }
#scmjGame .scmj-modal-body > .scmj-btn { display: block; margin: 0 auto; min-width: 140px; }
#scmjGame .scmj-rules-list { margin: 0; padding-left: 18px; line-height: 1.9; color: #e9f0e6; font-size: 14px; }
#scmjGame .scmj-rules-note { margin-top: 10px; color: #9fbfa8; font-size: 12.5px; }
#scmjGame .scmj-settings-body { display: flex; flex-direction: column; gap: 12px; }
#scmjGame .scmj-settings-body label { display: flex; align-items: center; gap: 8px; font-size: 15px; color: #e9f0e6; min-height: 36px; }
#scmjGame .scmj-settings-body .scmj-feedback-entry { align-self: flex-start; min-height: 36px; }
#scmjGame .scmj-confirm { width: min(420px, 90%); text-align: center; }
#scmjGame .scmj-confirm-text { color: #f3ead8; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
#scmjGame .scmj-confirm-btns { display: flex; gap: 12px; justify-content: center; }

/* ============ 结算覆盖层 ============ */
#scmjGame .scmj-settle {
  position: absolute;
  inset: 0;
  z-index: 60;
  overflow-y: auto;
  background: rgba(6, 26, 14, 0.9);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 20px 10px;
  border-radius: 18px;
}
#scmjGame .scmj-settle-card {
  width: min(640px, 100%);
  background: #102e1d;
  border: 1px solid rgba(212, 175, 55, 0.55);
  border-radius: 16px;
  padding: 22px 20px;
  box-sizing: border-box;
}
/* 详情展开/收起：默认只显示标题+积分排名+按钮，横屏一屏看完 */
#scmjGame .scmj-settle-toggle {
  display: block;
  margin: 0 auto 4px;
  min-height: 36px;
  padding: 4px 16px;
  font-size: 13px;
}
#scmjGame .scmj-settle-detail { margin-top: 10px; }
#scmjGame .scmj-settle-title { font-size: 22px; font-weight: 800; color: #ffd968; text-align: center; margin-bottom: 14px; }
/* 破产提示：任一家累计积分 ≤ 0，本局打完牌局即终止 */
#scmjGame .scmj-settle-bankrupt {
  background: rgba(255, 92, 92, 0.14);
  border: 1px solid rgba(255, 122, 122, 0.55);
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 14px;
  text-align: center;
}
#scmjGame .scmj-settle-bankrupt-title { font-size: 20px; font-weight: 800; color: #ff9d9d; letter-spacing: 2px; }
#scmjGame .scmj-settle-bankrupt-desc { margin-top: 4px; font-size: 13px; color: #f3d7d7; line-height: 1.6; }
#scmjGame .scmj-bankrupt-tag {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  color: #ff9d9d;
  border: 1px solid rgba(255, 122, 122, 0.6);
  border-radius: 6px;
  padding: 1px 6px;
  margin-left: 6px;
}
#scmjGame .scmj-settle-section { margin-bottom: 14px; }
#scmjGame .scmj-settle-section-title {
  font-size: 14px;
  font-weight: 700;
  color: #9fbfa8;
  border-bottom: 1px solid rgba(159, 191, 168, 0.3);
  padding-bottom: 4px;
  margin-bottom: 8px;
}
#scmjGame .scmj-settle-rank {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  font-size: 15px;
}
#scmjGame .scmj-rank-no {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(212, 175, 55, 0.25);
  color: #ffd968;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
#scmjGame .scmj-rank-name { flex: 1; }
#scmjGame .scmj-rank-delta { font-weight: 800; font-size: 17px; }
#scmjGame .scmj-rank-total {
  flex: none;
  font-size: 12.5px;
  color: #c7f3d6;
  background: rgba(126, 226, 160, 0.16);
  border: 1px solid rgba(126, 226, 160, 0.35);
  border-radius: 8px;
  padding: 2px 8px;
}
#scmjGame .scmj-rank-delta.pos, #scmjGame .scmj-settle .pos { color: #7ee2a0; }
#scmjGame .scmj-rank-delta.neg, #scmjGame .scmj-settle .neg { color: #ff9d9d; }
#scmjGame .scmj-settle-row { padding: 5px 4px; font-size: 13.5px; color: #e9f0e6; line-height: 1.6; }
#scmjGame .scmj-settle-row.scmj-muted { color: #9fbfa8; }
#scmjGame .scmj-ledger-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#scmjGame .scmj-ledger-who { font-weight: 700; color: #ffd968; }
#scmjGame .scmj-ledger-reason { flex: 1; }
#scmjGame .scmj-ledger-amt { color: #e9f0e6; }
#scmjGame .scmj-settle-btns { display: flex; gap: 12px; justify-content: center; margin-top: 6px; flex-wrap: wrap; }
/* 局间等待提示（联机点「准备下一局」后停在结算页）：占满一行放在按钮下方 */
#scmjGame .scmj-settle-wait {
  width: 100%;
  margin-top: 2px;
  text-align: center;
  font-size: 12.5px;
  color: #9fbfa8;
  line-height: 1.5;
}
/* ---- 结算：终局牌面（各家手牌 + 副露，供核对番型 / 杠数 / 听牌） ---- */
#scmjGame .scmj-final-row {
  padding: 6px 4px;
  border-top: 1px solid rgba(159, 191, 168, 0.18);
}
#scmjGame .scmj-final-row:first-child { border-top: none; }
#scmjGame .scmj-final-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13.5px;
  color: #e9f0e6;
}
#scmjGame .scmj-final-name { font-weight: 700; color: #ffd968; }
#scmjGame .scmj-final-status { color: #c7f3d6; }
#scmjGame .scmj-final-tags { font-size: 12.5px; color: #9fbfa8; }
#scmjGame .scmj-final-tiles {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  row-gap: 6px;
  margin-top: 4px;
}
/* 副露整组（碰 / 杠）与手牌留出间距，一眼分得清哪几张是副露 */
#scmjGame .scmj-final-tiles .scmj-meld { margin-left: 8px; }

/* ============ 浮层提示 / toast ============ */
#scmjGame .scmj-float {
  position: absolute;
  left: 50%;
  top: 42%;
  transform: translate(-50%, -50%) scale(0.6);
  z-index: 70;
  font-size: clamp(30px, 6vw, 48px);
  font-weight: 800;
  color: #ffd968;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.65);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
  white-space: nowrap;
}
#scmjGame .scmj-float-show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#scmjGame .scmj-toast {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translate(-50%, 8px);
  z-index: 80;
  max-width: 86%;
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(9, 40, 21, 0.95);
  border: 1px solid rgba(212, 175, 55, 0.6);
  color: #f3ead8;
  font-size: 13.5px;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
}
#scmjGame .scmj-toast-show { opacity: 1; transform: translate(-50%, 0); }

/* ============ 对手手牌牌背堆叠（假 3D：与牌墙同张贴图，直观看到各家剩余牌数） ============ */
/* 对家：横排在座位面板正上方（side-2 顶部 padding 腾位，不占交互区） */
#scmjGame .scmj-side-2 { position: relative; padding-top: 22px; box-sizing: border-box; }
#scmjGame .scmj-handbacks { display: flex; pointer-events: none; z-index: 3; }
#scmjGame .scmj-handbacks-2 {
  position: absolute;
  top: 1px;
  left: 50%;
  transform: translateX(-50%);
  justify-content: center;
}
/* 左右两家：竖排在座位面板靠中央一侧的边缘（立牌感，呼应实体牌桌） */
#scmjGame .scmj-handbacks-3,
#scmjGame .scmj-handbacks-1 {
  position: absolute;
  top: 4px;
  flex-direction: column;
  align-items: center;
}
#scmjGame .scmj-handbacks-3 { left: calc(100% + 4px); }
#scmjGame .scmj-handbacks-1 { right: calc(100% + 4px); }
#scmjGame .scmj-handback {
  display: block;
  width: 17px;
  height: 22px; /* 与 back.png 158×200 同比例 */
  background: url(/mahjong/tiles/back.png) center / cover no-repeat;
  border-radius: 2px;
  filter: drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.45));
}
/* 平铺不重叠（用户明确要求手牌不能重叠）：各断点已按正间距核算过空间 */
#scmjGame .scmj-handbacks-2 .scmj-handback + .scmj-handback { margin-left: 1px; }
#scmjGame .scmj-handbacks-3 .scmj-handback + .scmj-handback,
#scmjGame .scmj-handbacks-1 .scmj-handback + .scmj-handback { margin-top: 2px; }

/* ============ 联机交流：右下浮动入口 + 座位气泡 ============ */
/* 入口由 fitChat 固定在牌桌右下缘；展开面板不改变按钮位置。
   z-index 65：高于结算覆盖层（60），局间等待时也能收发；低于 toast(80)/弹窗(95)。 */
#scmjGame .scmj-chat {
  position: absolute;
  right: 8px;
  top: 56%; /* 首次布局前的回退值，运行时按牌桌底边定位 */
  z-index: 65;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
#scmjGame .scmj-chat-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1.5px solid rgba(212, 175, 55, 0.65);
  background: rgba(9, 40, 21, 0.92);
  color: #f3ead8;
  font-size: 19px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
  touch-action: none; /* 按住录音不被滚动/捏合手势打断 */
}
#scmjGame .scmj-chat-btn span { font-size: 9px; line-height: 11px; }
#scmjGame .scmj-chat-btn:active { transform: scale(0.94); }
#scmjGame .scmj-chat-mic-on {
  background: rgba(140, 24, 24, 0.95);
  border-color: #ff8a7a;
  animation: scmjMicPulse 1s ease-in-out infinite;
}
@keyframes scmjMicPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 90, 70, 0.55); }
  50% { box-shadow: 0 0 0 9px rgba(255, 90, 70, 0); }
}
#scmjGame .scmj-chat-rectip {
  position: absolute;
  right: 52px;
  bottom: 0;
  z-index: 1;
  pointer-events: none;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(140, 24, 24, 0.95);
  border: 1px solid rgba(255, 138, 122, 0.7);
  color: #ffe9e6;
  font-size: 12.5px;
  white-space: nowrap;
}
#scmjGame .scmj-chat-panel {
  position: absolute;
  right: 0;
  bottom: 52px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(9, 40, 21, 0.96);
  border: 1px solid rgba(212, 175, 55, 0.55);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5);
  width: 228px;
  max-width: calc(100vw - 24px);
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* 面板顶部全宽「按住说话」：最常用的语音入口放第一位，短语退居其次 */
#scmjGame .scmj-chat-micbtn {
  grid-column: 1 / -1;
  padding: 12px 10px;
  border-radius: 10px;
  border: 1.5px solid rgba(212, 175, 55, 0.65);
  background: rgba(23, 77, 46, 0.9);
  color: #ffd968;
  font-size: 14px;
  white-space: nowrap;
  touch-action: none; /* 按住录音不被滚动/捏合手势打断 */
}
#scmjGame .scmj-chat-micbtn:active { background: rgba(212, 175, 55, 0.3); }
#scmjGame .scmj-chat-phrase {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(212, 175, 55, 0.4);
  background: rgba(23, 77, 46, 0.85);
  color: #f3ead8;
  font-size: 13px;
  white-space: nowrap;
}
#scmjGame .scmj-chat-phrase:active { background: rgba(212, 175, 55, 0.3); }
/* 座位气泡：挂在座位面板（seatwrap，position:relative）或自己区域（.scmj-player）上 */
#scmjGame .scmj-player { position: relative; }
#scmjGame .scmj-bubble {
  position: absolute;
  z-index: 65;
  max-width: 180px;
  padding: 7px 12px;
  border-radius: 12px;
  background: rgba(9, 40, 21, 0.96);
  border: 1px solid rgba(212, 175, 55, 0.6);
  color: #f3ead8;
  font-size: 13px;
  line-height: 1.35;
  word-break: break-word;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  animation: scmjBubbleIn 0.18s ease-out;
}
@keyframes scmjBubbleIn {
  from { opacity: 0; transform: translateY(4px) scale(0.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
#scmjGame .scmj-bubble-out { opacity: 0; transition: opacity 0.22s ease; }
#scmjGame .scmj-bubble-voice { cursor: pointer; color: #ffd968; font-weight: 700; }
/* 对家（顶）：气泡落在面板下方 */
#scmjGame .scmj-bubble-2 { top: calc(100% + 4px); left: 0; }
/* 上家（左）：气泡在面板右侧 */
#scmjGame .scmj-bubble-3 { left: calc(100% + 6px); top: 0; }
/* 下家（右）：气泡在面板左侧 */
#scmjGame .scmj-bubble-1 { right: calc(100% + 6px); top: 0; }
/* 自己：气泡在自己区域左上方（压在弃牌展示上，不挡交互） */
#scmjGame .scmj-bubble-0 { left: 4px; bottom: 100%; }

/* ============ 杠特效：刮风（明杠）/ 下雨（暗杠 · 补杠），约 1s ============ */
#scmjGame .scmj-fx {
  position: absolute;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
}
#scmjGame .scmj-fx-show { opacity: 1; }
#scmjGame .scmj-fx .scmj-fx-wind,
#scmjGame .scmj-fx .scmj-fx-drop { position: absolute; }
/* 刮风：横向风条由左向右扫过 */
#scmjGame .scmj-fx .scmj-fx-wind {
  left: -40%;
  width: 40%;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0));
  animation: scmjWindSweep 0.7s linear forwards;
}
@keyframes scmjWindSweep {
  from { left: -40%; opacity: 0; }
  20% { opacity: 1; }
  to { left: 100%; opacity: 0; }
}
/* 下雨：竖直雨滴由上落下 */
#scmjGame .scmj-fx .scmj-fx-drop {
  top: -20%;
  width: 2px;
  border-radius: 1px;
  background: linear-gradient(180deg, rgba(190, 225, 255, 0), rgba(170, 215, 255, 0.9));
  animation: scmjRainFall 0.7s linear forwards;
}
@keyframes scmjRainFall {
  from { top: -20%; opacity: 0; }
  20% { opacity: 1; }
  to { top: 100%; opacity: 0; }
}

/* ============ 页面介绍区 ============ */
.scmj-intro {
  max-width: 1080px;
  margin: 18px auto;
  padding: 20px;
  background: #fff;
  border-radius: 15px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
}
.scmj-intro h3 {
  font-size: 18px;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 2px solid #14532d;
}
.scmj-intro p, .scmj-intro li { font-size: 14px; color: #555; line-height: 1.7; }
.scmj-intro ul { margin-left: 20px; }
.scmj-intro li { margin-bottom: 6px; }

/* ============ 响应式 ============ */
@media (max-width: 920px) {
  #scmjGame .scmj-board { grid-template-columns: 150px minmax(0, 1fr) 150px; min-height: 340px; }
  #scmjGame .scmj-avatar { width: 34px; height: 34px; font-size: 19px; }
}
/* 竖屏手机：显示“建议横屏”提示 + 紧凑布局。
   竖屏屏幕窄且矮，这里做两件事：
   1) 省略纯提示元素（轮到谁 / 最新动态 / 出牌建议）——轮到谁看座位高亮即可；
   2) 把三行高度钉住、各区在自己区域内滚动，牌墙尺寸不再一会儿大一会儿小。 */
@media (max-width: 760px) and (orientation: portrait) {
  #scmjGame .scmj-portrait-tip { display: block; }
  #scmjGame { padding: 10px; }
  #scmjGame .scmj-center-info [data-scmj-turn],
  #scmjGame .scmj-center-latest,
  #scmjGame .scmj-suggest { display: none; }
  /* 操作条左侧的纯指引文案（如「定缺：选择一门花色…」）竖屏省略，把宽度让给按钮；
     状态类文案（等待其他玩家 / 已胡牌）不在此列，照常显示。横屏保留完整指引。 */
  #scmjGame .scmj-action-explain { display: none; }
  #scmjGame .scmj-board {
    grid-template-columns: 76px minmax(0, 1fr) 76px;
    /* 两行：对家行 + 中央行（弃牌已收进中央桌布，不再有自己的弃牌行） */
    grid-template-rows: 86px minmax(0, 1fr);
    gap: 5px;
    min-height: 0;
  }
  /* 竖屏左右两家牌背：贴在座位面板正下方竖排叠放（列内，不越界），
     与桌面/横屏的竖排观感一致；弃牌收进中央后列里没有别的元素，不会遮挡 */
  #scmjGame .scmj-handbacks-3,
  #scmjGame .scmj-handbacks-1 {
    left: 50%;
    right: auto;
    top: calc(100% + 4px);
    transform: translateX(-50%);
    flex-direction: column;
  }
  #scmjGame .scmj-handbacks-3 .scmj-handback,
  #scmjGame .scmj-handbacks-1 .scmj-handback { width: 15px; height: 20px; }
  /* 平铺不重叠：15×20 + 2px 间隙，庄家 14 张占 308px，竖屏列高足够 */
  #scmjGame .scmj-handbacks-3 .scmj-handback + .scmj-handback,
  #scmjGame .scmj-handbacks-1 .scmj-handback + .scmj-handback { margin-top: 2px; }
  /* 对家：面板居中单行，整行高度固定不变 */
  #scmjGame .scmj-side-2 {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 0;
    overflow: hidden;
  }
  #scmjGame .scmj-side-2 .scmj-seatwrap { width: auto; flex: none; }
  #scmjGame .scmj-side-2 .scmj-seat { flex-direction: row; padding: 4px 7px; gap: 5px; }
  #scmjGame .scmj-side-2 .scmj-seat-meta { align-items: flex-start; }
  /* 左右两列：座位固定在列首（兼修座位上方浮标被裁） */
  #scmjGame .scmj-side-3,
  #scmjGame .scmj-side-1 { align-self: stretch; height: 100%; min-height: 0; overflow: hidden; }
  #scmjGame .scmj-side-3 > .scmj-seatwrap,
  #scmjGame .scmj-side-1 > .scmj-seatwrap { flex: none; padding-top: 10px; }
  /* 竖屏两侧列窄，副露整组 3~4 张会把标签挤到看不见：整组只留 1 张牌面
     + 标签（碰 / 明杠 / 暗杠 / 补杠 / 带赖），既省地方又保留「有没有碰杠」
     的信息；横屏空间足够，仍展示整组。 */
  #scmjGame .scmj-side-3 .scmj-seatmelds,
  #scmjGame .scmj-side-1 .scmj-seatmelds { gap: 2px; }
  #scmjGame .scmj-side-3 .scmj-seatmelds .scmj-meld .scmj-tile ~ .scmj-tile,
  #scmjGame .scmj-side-1 .scmj-seatmelds .scmj-meld .scmj-tile ~ .scmj-tile { display: none; }
  #scmjGame .scmj-side-3 .scmj-seatmelds .scmj-tile-disc,
  #scmjGame .scmj-side-1 .scmj-seatmelds .scmj-tile-disc { width: 15px; height: 21px; }
  #scmjGame .scmj-side-3 .scmj-seatmelds .scmj-meld-tag,
  #scmjGame .scmj-side-1 .scmj-seatmelds .scmj-meld-tag { font-size: 9px; padding: 0 4px; margin-left: 2px; }
  #scmjGame .scmj-side-3 .scmj-streak,
  #scmjGame .scmj-side-1 .scmj-streak { right: 0; }
  #scmjGame .scmj-side-3 .scmj-seatpend,
  #scmjGame .scmj-side-1 .scmj-seatpend { top: 0; }
  #scmjGame .scmj-seat { flex-direction: column; text-align: center; padding: 6px 5px; gap: 4px; }
  #scmjGame .scmj-seat-meta { align-items: center; }
  #scmjGame .scmj-seat-name { font-size: 11.5px; }
  #scmjGame .scmj-seat-score { font-size: 10.5px; }
  #scmjGame .scmj-avatar { width: 26px; height: 26px; font-size: 14px; }
  #scmjGame .scmj-wind-seat { display: none; }
  #scmjGame .scmj-tile-hand { width: var(--scmj-hand-tile-w, 34px); height: var(--scmj-hand-tile-h, 46px); }
  #scmjGame .scmj-tile-disc { width: 22px; height: 28px; }
  /* 副露排固定单行（多时横向滚动）：碰 / 杠出现副露时不再顶高手牌区 */
  #scmjGame .scmj-mymelds {
    min-height: 30px;
    margin-bottom: 4px;
    flex-wrap: nowrap;
    overflow-x: auto;
    justify-content: flex-start;
    -webkit-overflow-scrolling: touch;
  }
  /* 竖屏两行手牌：高度由 ui.js fitHand 按「满手 14 张两行」写入 min-height，
     13 / 14 张切换、碰杠后手牌变少都不改变高度（牌的大小也不变） */
  #scmjGame .scmj-hand { align-content: flex-start; gap: 4px 0; padding: 6px 4px; overflow-y: auto; }
  /* 操作栏固定单行高度（按钮多时横向滚动），不再因按钮换行改变高度。
     必须左对齐：按钮溢出时 justify-content:center 会向两侧溢出，
     左侧那截无法通过横向滚动看到（滚动只能向右），最左边的按钮会被永久截断；
     未溢出时由 margin:0 auto 居中，视觉不变。 */
  #scmjGame .scmj-actionbar {
    height: 46px;
    min-height: 46px;
    padding: 2px 6px;
    gap: 6px;
    width: fit-content;
    max-width: 100%;
    margin: 0 auto;
    justify-content: flex-start;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  #scmjGame .scmj-hintrow { margin: 4px 2px; min-height: 20px; }
  #scmjGame .scmj-btn { padding: 8px 12px; font-size: 14px; }
  #scmjGame .scmj-actionbar .scmj-btn { min-height: 40px; padding: 6px 10px; font-size: 13px; flex: none; }
  #scmjGame .scmj-action { min-height: 40px; }
}

/* ============ 全屏沉浸模式（开始游戏后占满整个屏幕） ============ */
#scmjGame.scmj-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 200;
  max-width: none;
  margin: 0;
  border-radius: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
}
#scmjGame.scmj-fullscreen .scmj-settle { border-radius: 0; }
/* 全屏时把牌桌约束在一屏内：牌桌区自适应收缩、手牌区固定不被挤出屏幕，
   横屏/矮屏无需滚动即可看到自己的手牌。 */
#scmjGame.scmj-fullscreen .scmj-table {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
#scmjGame.scmj-fullscreen .scmj-board {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
#scmjGame.scmj-fullscreen .scmj-player { flex: 0 0 auto; }
body.scmj-lock { overflow: hidden; }
/* 游戏全屏期间隐藏全局 AI 客服悬浮按钮与面板（退出游戏自动恢复） */
body.scmj-lock #cw-fab,
body.scmj-lock #cw-panel { display: none !important; }

/* ============ 横屏手机：高度紧凑布局（兼容小高度横屏） ============ */
@media (max-height: 540px) and (orientation: landscape) {
  #scmjGame { padding: 6px 12px; }
  #scmjGame.scmj-fullscreen {
    padding: max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
  }
  #scmjGame .scmj-topbar { margin-bottom: 1px; }
  #scmjGame .scmj-topbar-title { font-size: 11.5px; }
  #scmjGame .scmj-topbar-btns .scmj-btn { min-height: 26px; padding: 2px 8px; font-size: 11.5px; }
  #scmjGame .scmj-portrait-tip { display: none !important; }
  /* 横屏矮屏布局大改（2026-09-25）：对家面板行与操作栏都改为浮层，
     中央区只留一行且吃满全部剩余高度——牌墙边长 110→200+，
     桌心弃牌区（felt）随之翻倍，四家弃牌才摆得开、不互叠。 */
  #scmjGame .scmj-board {
    position: relative; /* 对家浮层的定位基准 */
    grid-template-columns: 116px minmax(0, 1fr) 116px;
    grid-template-rows: minmax(110px, 1fr);
    grid-template-areas: "side3 center side1";
    min-height: 0;
    gap: 4px;
  }
  /* 对家面板+副露+牌背：浮在中央区顶缘（真实牌桌对家坐在牌墙后的视角），
     牌墙顶部让位由 fitCenterBox 留 48px（size=h-56 + centerbox margin-top:40） */
  #scmjGame .scmj-side-2 {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: min(320px, 62%);
    z-index: 4;
    padding-top: 12px;
    box-sizing: border-box;
  }
  #scmjGame .scmj-seat { padding: 3px 6px; gap: 5px; border-radius: 10px; }
  #scmjGame .scmj-avatar { width: 24px; height: 24px; font-size: 13px; border-width: 1px; }
  #scmjGame .scmj-seat-name { font-size: 11px; }
  #scmjGame .scmj-seat-score { font-size: 10px; }
  /* 左右侧栏为防弃牌顶出加了 overflow: hidden，座位上方的浮标（连庄标 / 定缺浮字）
     会被裁掉：座位区预留上方空间让连庄标完整显示，并把标对齐到面板内侧避免横向切边。 */
  #scmjGame .scmj-side-3 > .scmj-seatwrap,
  #scmjGame .scmj-side-1 > .scmj-seatwrap { padding-top: 10px; }
  #scmjGame .scmj-streak { font-size: 9px; padding: 0 4px; top: -9px; }
  #scmjGame .scmj-side-3 .scmj-streak,
  #scmjGame .scmj-side-1 .scmj-streak { right: 0; }
  #scmjGame .scmj-seatpend { top: -16px; font-size: 10px; padding: 0 7px; }
  #scmjGame .scmj-side-3 .scmj-seatpend,
  #scmjGame .scmj-side-1 .scmj-seatpend { top: 0; }
  #scmjGame .scmj-seatmelds .scmj-tile-disc { width: 15px; height: 21px; }
  #scmjGame .scmj-seatmelds .scmj-meld { gap: 0; }
  #scmjGame .scmj-seatmelds .scmj-meld-tag { font-size: 9px; padding: 0 4px; margin-left: 2px; }
  /* 顶部对家：副露固定单行（横向滚动），避免牌一多把顶栏撑高压掉牌墙 */
  #scmjGame .scmj-side-2 .scmj-seatmelds {
    flex-wrap: nowrap;
    overflow-x: auto;
    justify-content: flex-start;
    max-width: 100%;
    -webkit-overflow-scrolling: touch;
  }
  #scmjGame .scmj-seat-hand { right: -6px; bottom: -4px; height: 14px; min-width: 14px; font-size: 9px; padding: 0 3px; }
  #scmjGame .scmj-windtag { width: 20px; height: 20px; font-size: 12px; border-radius: 6px; }
  /* 牌墙向下偏：顶留 48（对家浮层）底留 8（操作栏浮层），与 fitCenterBox h-56 配套 */
  #scmjGame .scmj-centerbox { border-radius: 10px; margin-top: 40px; }
  /* 对家浮层内的面板宽度拉满（基础样式 min(300px,60%) 是为 grid 行内布局定的） */
  #scmjGame .scmj-side-2 .scmj-seatwrap { width: 100%; }
  /* 横屏矮屏：中央区文字改为左右两侧浮层，整块中央区让给正方形牌墙。
     竖屏/桌面仍走上面的三行结构（文字上下、牌墙居中），互不影响。
     横屏下中央区很宽，牌墙边长受屏幕高度限制，文字若仍占上下两行，
     牌墙只能分到几十像素（实测手机横屏实战中只剩 74px，几乎看不见）。 */
  #scmjGame .scmj-center { position: relative; display: block; }
  #scmjGame .scmj-centerslot { position: absolute; inset: 0; }
  /* 横屏文字提醒整条删除（与竖屏一致）：轮到谁看座位呼吸高亮，
     摸牌/出牌有语音播报，最新出牌看桌心金色亮圈，不再摆文字浮层 */
  #scmjGame .scmj-center-info,
  #scmjGame .scmj-center-latest { display: none; }
  #scmjGame .scmj-wind-seat { display: none; }
  /* 横屏矮屏：左右两侧座位固定在列首；牌背越界到中央区一侧竖排，
     侧栏不再裁切（弃牌早已收进中央 felt，侧栏里没有会被顶出的内容） */
  #scmjGame .scmj-side-3,
  #scmjGame .scmj-side-1 {
    align-self: stretch;
    height: 100%;
    min-height: 0;
    overflow: visible;
  }
  #scmjGame .scmj-side-3 > .scmj-seatwrap,
  #scmjGame .scmj-side-1 > .scmj-seatwrap { flex: none; }
  /* 对家牌背改小（浮层内顶部摆放） */
  #scmjGame .scmj-handbacks-2 { top: 0; }
  #scmjGame .scmj-handbacks-2 .scmj-handback { width: 13px; height: 17px; }
  /* 横屏：左右牌背恢复竖排在座位面板靠中央一侧（越界 4px 到中央区边缘），
     布局次序 = 头像面板 → 竖排手牌 → 牌墙与弃牌（用户指定的左到右次序）；
     牌横躺 90° 只露牌背长条 = 真实牌桌看左右家手牌的顶视图，平铺不重叠，
     占位 12×16（旋转后视觉 16×12 扁条），步进 18px：庄家 14 张占 250px，
     列高约 270+ 放得下；中央区两侧各有 ~190px 空隙，不碰牌墙 */
  #scmjGame .scmj-handbacks-3,
  #scmjGame .scmj-handbacks-1 {
    top: 4px;
    flex-direction: column;
    align-items: center;
    transform: none;
  }
  #scmjGame .scmj-handbacks-3 { left: calc(100% + 4px); right: auto; }
  #scmjGame .scmj-handbacks-1 { right: calc(100% + 4px); left: auto; }
  #scmjGame .scmj-handbacks-3 .scmj-handback,
  #scmjGame .scmj-handbacks-1 .scmj-handback { width: 12px; height: 16px; flex: none; transform: rotate(90deg); }
  #scmjGame .scmj-handbacks-3 .scmj-handback + .scmj-handback,
  #scmjGame .scmj-handbacks-1 .scmj-handback + .scmj-handback { margin-top: 2px; margin-left: 0; }
  #scmjGame .scmj-tile-disc { width: 20px; height: 22px; }
  #scmjGame .scmj-player { margin-top: 2px; position: relative; }
  /* 操作栏浮层化：absolute 浮在 player 区顶缘（向中央区探出），平时不占布局高度，
     中央行因此多出 ~36px 给牌墙。盖到牌墙下边缘少量牌背，仅视觉无交互影响。
     固定单行不换行（按钮过多时横向滚动），左对齐防 center 溢出截断。 */
  #scmjGame .scmj-actionbar {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(100% - 0px);
    z-index: 5;
    min-height: 28px;
    padding: 2px 8px;
    gap: 6px;
    /* 不能 width:fit-content：left:50% 时 shrink-to-fit 的可用宽度只剩右半屏，
       内容稍宽就被压窄触发 overflow 裁切（定缺按钮中心点被裁无法点击）；
       max-content 显式按内容定宽，超出时再由 max-width+overflow-x 兜底 */
    width: max-content;
    max-width: 100%;
    justify-content: flex-start;
    flex-wrap: nowrap;
    overflow-x: auto;
    box-sizing: border-box;
  }
  #scmjGame .scmj-actionbar .scmj-btn { min-height: 32px; padding: 4px 10px; font-size: 12px; flex: none; }
  #scmjGame .scmj-action-info { font-size: 11.5px; white-space: nowrap; }
  /* 横屏矮屏：只省右侧出牌建议（纯提示元素）；听牌提示保留——
     玩家开 AI 辅助就指望「可胡哪几张多少番」。行高压到 0：
     未听牌时 ting 为空、整条不占高度，听牌/已胡时才顶出胶囊 */
  #scmjGame .scmj-hintrow { min-height: 0; margin: 0 2px; }
  #scmjGame .scmj-suggest { display: none; }
  /* 副露排压缩：碰牌后出现副露也不多吃中央高度 */
  #scmjGame .scmj-mymelds { min-height: 20px; margin-bottom: 1px; gap: 6px; }
  #scmjGame .scmj-mymelds .scmj-tile-disc { width: 15px; height: 18px; }
  #scmjGame .scmj-hand { min-height: 42px; padding: 4px 4px 2px; gap: 4px 0; }
  #scmjGame .scmj-tile-hand { width: var(--scmj-hand-tile-w, 33px); height: var(--scmj-hand-tile-h, 45px); }
  #scmjGame .scmj-ting { flex: none; flex-wrap: nowrap; }
  #scmjGame .scmj-ting-label,
  #scmjGame .scmj-ting-chip,
  #scmjGame .scmj-ting-fan { font-size: 10px; line-height: 12px; padding: 1px 5px; }
  #scmjGame .scmj-ting-text { font-size: 10.5px; line-height: 12px; white-space: nowrap; }
  #scmjGame .scmj-suggest { font-size: 10px; white-space: nowrap; max-width: none; }
}

/* ============ 极矮横屏（≤400px，如 568×320）：再压一档固定高度 ============ */
@media (max-height: 400px) and (orientation: landscape) {
  /* 极矮横屏只压外边距，安全区必须保留：iPhone 横屏刘海在左（或右）边，
     直接写死 8px 会把左侧牌桌塞到刘海底下（「左边被挡住」就是这么来的）。
     用 calc + env(x, 0px) 而不是 max()：calc 与 env 从 iOS 11.2 就有，
     max() 要 iOS 13.4+，旧机型上整条 padding 会失效退回过小的值。 */
  #scmjGame.scmj-fullscreen {
    padding: calc(2px + env(safe-area-inset-top, 0px)) calc(8px + env(safe-area-inset-right, 0px)) calc(2px + env(safe-area-inset-bottom, 0px)) calc(8px + env(safe-area-inset-left, 0px));
  }
  #scmjGame .scmj-topbar { margin-bottom: 0; }
  /* 与主横屏断点同步：中央区一行（对家面板已是浮层），听牌提示保留、出牌建议省略 */
  #scmjGame .scmj-board { grid-template-rows: minmax(92px, 1fr); gap: 4px; }
  #scmjGame .scmj-actionbar { min-height: 28px; padding: 1px 5px; }
  #scmjGame .scmj-actionbar .scmj-btn { min-height: 28px; padding: 3px 9px; font-size: 11.5px; }
  #scmjGame .scmj-hintrow { min-height: 0; margin: 0 2px; }
  #scmjGame .scmj-suggest { display: none; }
  #scmjGame .scmj-mymelds { min-height: 20px; margin-bottom: 1px; }
  #scmjGame .scmj-mymelds .scmj-tile-disc { width: 15px; height: 18px; }
  #scmjGame .scmj-hand { min-height: 38px; padding: 2px 4px 0; }
  #scmjGame .scmj-tile-hand { width: var(--scmj-hand-tile-w, 28px); height: var(--scmj-hand-tile-h, 38px); }
  #scmjGame .scmj-tile-disc { width: 18px; height: 20px; }
}

/* ============ 开局掷骰仪式 ============ */
#scmjGame .scmj-dice {
  position: absolute;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 18, 10, 0.72);
  backdrop-filter: blur(2px);
  opacity: 0;
  transition: opacity 0.22s ease;
}
#scmjGame .scmj-dice-show { opacity: 1; }
#scmjGame .scmj-dice-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 22px 30px;
  border-radius: 18px;
  background: rgba(9, 40, 21, 0.92);
  border: 1px solid rgba(212, 175, 55, 0.6);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
#scmjGame .scmj-dice-title { color: #ffd968; font-size: 16px; font-weight: 800; letter-spacing: 3px; }
#scmjGame .scmj-dice-pair { display: flex; gap: 18px; }
#scmjGame .scmj-dice-msg { color: #f3ead8; font-size: 14px; min-height: 20px; }
#scmjGame .scmj-die {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 3px;
  width: 58px;
  height: 58px;
  padding: 7px;
  box-sizing: border-box;
  border-radius: 12px;
  background: linear-gradient(160deg, #fffdf6 0%, #ece2c8 100%);
  border: 1px solid #c9b98a;
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.9);
}
#scmjGame .scmj-die-rolling { animation: scmjDiceShake 0.24s linear infinite; }
@keyframes scmjDiceShake {
  0% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(-2px, 2px) rotate(-9deg); }
  50% { transform: translate(2px, -2px) rotate(7deg); }
  75% { transform: translate(-2px, -1px) rotate(-4deg); }
  100% { transform: translate(0, 0) rotate(0deg); }
}
#scmjGame .scmj-pip { border-radius: 50%; background: transparent; }
#scmjGame .scmj-pip-on { background: radial-gradient(circle at 35% 30%, #4b4232, #1c1810); }
#scmjGame .scmj-pip-on.scmj-pip-red { background: radial-gradient(circle at 35% 30%, #e0453a, #a01b12); }

@media (max-height: 540px) and (orientation: landscape) {
  #scmjGame .scmj-dice-card { gap: 8px; padding: 12px 22px; }
  #scmjGame .scmj-dice-title { font-size: 13px; }
  #scmjGame .scmj-die { width: 42px; height: 42px; padding: 5px; border-radius: 9px; }
  #scmjGame .scmj-dice-msg { font-size: 12px; }
  /* 横屏矮屏：结算收起态（标题+积分排名+按钮）一屏放完，不用再滚 */
  /* 注意：容器保持 align-items: flex-start，靠卡片的上下 auto 外边距做垂直居中。
     若容器用 align-items: center，内容高出屏幕时会被上下同时裁掉，
     顶部溢出部分落在滚动起点之上，永远滚不到（“滚动不上去”）。 */
  #scmjGame .scmj-settle { padding: 8px; align-items: flex-start; }
  #scmjGame .scmj-settle-card { padding: 12px 16px; margin-top: auto; margin-bottom: auto; }
  #scmjGame .scmj-settle-title { font-size: 17px; margin-bottom: 8px; }
  #scmjGame .scmj-settle-bankrupt { padding: 7px 10px; margin-bottom: 8px; }
  #scmjGame .scmj-settle-bankrupt-title { font-size: 16px; }
  #scmjGame .scmj-settle-bankrupt-desc { font-size: 11.5px; }
  #scmjGame .scmj-settle-section { margin-bottom: 8px; }
  #scmjGame .scmj-settle-section-title { font-size: 12.5px; margin-bottom: 4px; padding-bottom: 2px; }
  #scmjGame .scmj-settle-rank { padding: 3px 4px; font-size: 13.5px; }
  #scmjGame .scmj-rank-no { width: 20px; height: 20px; font-size: 12px; }
  #scmjGame .scmj-rank-delta { font-size: 14px; }
  #scmjGame .scmj-rank-total { font-size: 11px; padding: 1px 6px; }
  #scmjGame .scmj-settle-toggle { min-height: 30px; font-size: 12px; }
  #scmjGame .scmj-settle-btns .scmj-btn { min-height: 38px; }
}
/* Perspective table: rectilinear hit boxes; depth is drawn inside each tile. */
#scmjGame {
  background: radial-gradient(ellipse at center,#1c6b3c 0%,#14532d 55%,#0d3b20 100%);
  box-shadow: inset 0 0 0 2px #a99b5d66,inset 0 0 60px #001e1799,0 10px 30px #001d2933;
}
#scmjGame .scmj-board::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .12; background: repeating-linear-gradient(0deg,transparent 0 2px,#d2e3b31f 2px 3px),repeating-linear-gradient(90deg,transparent 0 3px,#001d291f 3px 4px); }
#scmjGame .scmj-board { position: relative; display: block; min-height: 380px; }
#scmjGame.scmj-fullscreen .scmj-board { min-height: 0; overflow: hidden; }
#scmjGame .scmj-center { position: absolute; inset: 50px 112px 12px; display: block; }
#scmjGame .scmj-centerslot { position: absolute; inset: 0; width: auto; height: auto; display: block; }
#scmjGame .scmj-centerbox { margin: 0; border: 0; border-radius: 0; background: transparent; }
#scmjGame .scmj-center-info, #scmjGame .scmj-center-latest { display: none; }
#scmjGame .scmj-side { position: absolute; width: 64px; height: auto; min-height: 0; padding: 0; overflow: visible; z-index: 5; }
#scmjGame .scmj-side-2 { top: 0; left: 8px; transform: none; }
#scmjGame .scmj-side-3 { left: 0; top: 35%; }
#scmjGame .scmj-side-1 { right: 0; top: 35%; }
#scmjGame .scmj-side .scmj-seatwrap { width: 100%; padding: 0; }
#scmjGame .scmj-seat { flex-direction: column; gap: 2px; padding: 5px 2px; border: 0; background: #123d3466; border-radius: 8px; }
#scmjGame .scmj-seat-meta { align-items: center; }
#scmjGame .scmj-avatar { width: 30px; height: 30px; font-size: 18px; }
#scmjGame .scmj-seat-name { font-size: 10px; }
#scmjGame .scmj-seat-score { font-size: 10px; }
#scmjGame .scmj-side .scmj-windtag { display: none; }
#scmjGame .scmj-side-2 .scmj-seat { flex-direction: row; width: 110px; padding: 3px; }
#scmjGame .scmj-side-2 .scmj-seatwrap { align-items: flex-start; }
#scmjGame .scmj-side .scmj-voidtag { white-space: nowrap; padding: 0 4px; font-size: 10px; }
#scmjGame .scmj-side-2 .scmj-seatmelds { position: absolute; top: 34px; left: 0; max-width: 120px; }
#scmjGame .scmj-handbacks { gap: 0; margin: 0; padding: 0; position: absolute; pointer-events: none; }
#scmjGame .scmj-handbacks-2 { top: 5px; left: 50%; transform: translateX(-50%); flex-direction: row; }
#scmjGame .scmj-handbacks-1, #scmjGame .scmj-handbacks-3 { top: 52px; bottom: auto; transform: none; flex-direction: column; align-items: stretch; }
#scmjGame .scmj-handbacks-3 { left: 70px; right: auto; }
#scmjGame .scmj-handbacks-1 { right: 70px; left: auto; }
#scmjGame .scmj-handbacks .scmj-handback { flex: none; margin: 0; transform: none; box-sizing: border-box; border-radius: 1px; filter: none; }
#scmjGame .scmj-handbacks .scmj-handback + .scmj-handback { margin: 0; }
/* Opposite seat: upright green backs with a slim ivory top edge. */
#scmjGame .scmj-handbacks-2 .scmj-handback {
  width: var(--scmj-back-width,20px); height: calc(var(--scmj-back-width,20px)*1.25);
  background: url('/mahjong/tiles/back.png') center / 100% 100% no-repeat;
  border: 0; box-shadow: 0 3px 2px #002c3144;
}
/* 左右两家：绿色牌背朝外（朝桌心），白色牌面一侧朝向自己头像（靠头像侧描象牙细边示意）；
   一张贴一张：背景放大 20% 居中，裁掉牌背图自带的象牙上下边框——
   相邻牌绿贴绿无缝隙，只留 1px 深色发丝线分出单张（真实牌码放效果）。
   横竖屏统一 8px 宽 × ≤16px 高（接近真实牌 22×38 比例），不随旋转变化 */
#scmjGame .scmj-handbacks-1 .scmj-handback, #scmjGame .scmj-handbacks-3 .scmj-handback {
  width: 8px; height: min(var(--scmj-back-step,18px), 16px);
  background: url('/mahjong/tiles/back.png') center / 100% 120% no-repeat;
  border: 0; border-bottom: 1px solid rgba(0,38,22,.6);
  box-shadow: 2px 1px 1px #002c3144;
}
#scmjGame .scmj-handbacks-3 .scmj-handback { border-left: 2px solid #e9e2c8; }
#scmjGame .scmj-handbacks-1 .scmj-handback { border-right: 2px solid #e9e2c8; }
#scmjGame .scmj-wallring > div { gap: 0; }
#scmjGame .scmj-wallback { background-image: url('/mahjong/tiles/back.png'); border: 0; border-radius: 1px; filter: none; box-shadow: 1px 1px 1px #0b291966; }
#scmjGame .scmj-felt .scmj-disc-tiles { inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; transform: none; display: block; }
#scmjGame .scmj-felt .scmj-tile-disc { position: absolute; margin: 0; padding: 0; transform: none; border-radius: 2px; filter: drop-shadow(0 1px .5px #002b37a6); }
#scmjGame .scmj-felt .scmj-tile-img { position: absolute; width: var(--scmj-face-w); height: var(--scmj-face-h); max-width: none; left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(var(--scmj-disc-rot,0deg)); }
@keyframes scmjRiverSlideIn { from { transform: translateY(-10px) scale(.8); opacity: 0; } to { transform: none; opacity: 1; } }
#scmjGame .scmj-felt .scmj-tile-new { animation: scmjRiverSlideIn .28s ease-out; }
#scmjGame .scmj-felt .scmj-tile-latest.scmj-tile-new { animation: scmjRiverSlideIn .28s ease-out, scmjLatestPulse 1.6s ease-in-out .28s infinite; }
#scmjGame .scmj-felt .scmj-river-latest { z-index: 5; }
#scmjGame .scmj-felt .scmj-tile-latest { z-index: 6; outline: 2px solid #ffe790; outline-offset: 1px; }
#scmjGame .scmj-compass-core { box-shadow: 0 2px 3px #061d2255; }
#scmjGame .scmj-wind-seat { display: none; }
#scmjGame .scmj-hand { flex-wrap: nowrap; column-gap: 0; overflow: visible; }
/* 手牌只留柔和落影：象牙+绿色两层实色阴影会与牌 PNG 自带的厚度叠加，
   在手牌下方形成一条贯穿性「白绿条」（用户反馈），实色层全部去掉 */
#scmjGame .scmj-tile-hand { border-radius: 3px; box-shadow: 0 3px 3px #002c3144; filter: none; }
#scmjGame .scmj-tile-hand.scmj-tile-disabled { filter: grayscale(.6); }
#scmjGame .scmj-mymelds:empty { display: none; }
/* 副露紧接手牌：完整展示碰3/杠4张，不再用一张牌代替整组。 */
#scmjGame .scmj-handbacks .scmj-seatmelds { position: static; display: flex; flex-wrap: nowrap; max-width: none; gap: 4px; margin: 0 0 0 4px; align-items: flex-start; }
#scmjGame .scmj-handbacks .scmj-seatmelds:empty { display: none; }
#scmjGame .scmj-handbacks .scmj-meld { position: relative; flex: none; gap: 0; }
#scmjGame .scmj-handbacks .scmj-meld .scmj-tile { display: block; flex: none; width: var(--scmj-back-width); height: calc(var(--scmj-back-width)*1.4); filter: drop-shadow(0 2px 0 #3b7955); }
#scmjGame .scmj-handbacks .scmj-meld-tag { position: absolute; left: 0; top: 100%; margin: 2px 0 0; padding: 0 2px; font-size: 8px; line-height: 10px; white-space: nowrap; }
#scmjGame .scmj-handbacks-1 .scmj-seatmelds, #scmjGame .scmj-handbacks-3 .scmj-seatmelds { flex-direction: column; margin: 4px 0 0; }
#scmjGame .scmj-handbacks-1 .scmj-meld, #scmjGame .scmj-handbacks-3 .scmj-meld { flex-direction: column; }
#scmjGame .scmj-handbacks-1 .scmj-meld .scmj-tile, #scmjGame .scmj-handbacks-3 .scmj-meld .scmj-tile { position: relative; width: var(--scmj-side-meld-w); height: calc(var(--scmj-side-meld-w)/1.4); }
#scmjGame .scmj-handbacks-1 .scmj-meld .scmj-tile-img, #scmjGame .scmj-handbacks-3 .scmj-meld .scmj-tile-img { position: absolute; max-width: none; width: calc(var(--scmj-side-meld-w)/1.4); height: var(--scmj-side-meld-w); left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(-90deg); }
#scmjGame .scmj-handbacks-3 .scmj-meld .scmj-tile-img { transform: translate(-50%,-50%) rotate(90deg); }
#scmjGame .scmj-handbacks-1 .scmj-meld-tag, #scmjGame .scmj-handbacks-3 .scmj-meld-tag { top: 0; left: auto; right: 100%; margin: 0 2px; writing-mode: vertical-rl; }
#scmjGame .scmj-handbacks-3 .scmj-meld-tag { left: 100%; right: auto; }
#scmjGame .scmj-mymelds { flex-wrap: nowrap; gap: 5px; }
#scmjGame .scmj-mymelds .scmj-tile { width: clamp(12px,3.8vw,22px); height: auto; aspect-ratio: 5/7; }
#scmjGame .scmj-mymelds .scmj-meld { position: relative; padding-top: 11px; }
#scmjGame .scmj-mymelds .scmj-meld-tag { position: absolute; top: 0; left: 0; margin: 0; padding: 0 2px; font-size: 9px; line-height: 10px; }
@media (max-width: 760px) and (orientation: portrait) {
  #scmjGame .scmj-topbar { flex-wrap: nowrap; gap: 4px; margin-bottom: 4px; }
  #scmjGame .scmj-topbar-title, #scmjGame .scmj-portrait-tip { display: none; }
  #scmjGame .scmj-topbar-btns { gap: 4px; }
  #scmjGame .scmj-topbar-btns .scmj-btn { min-height: 32px; padding: 4px 7px; font-size: 12px; }
  #scmjGame .scmj-center { inset: 64px 72px 8px; }
  #scmjGame .scmj-side { width: 40px; }
  #scmjGame .scmj-avatar { width: 25px; height: 25px; font-size: 15px; }
  #scmjGame .scmj-seat-score { font-size: 9px; }
  #scmjGame .scmj-handbacks-3 { left: 41px; }
  #scmjGame .scmj-handbacks-1 { right: 41px; }
  /* 竖屏：手牌列垂直居中——固定 top:52 会让列顶紧贴对家手牌行（且水平方向
     与对家行有数像素重叠），看起来压住对家的牌；居中后整列落在对家与自家
     之间的空档正中，不再遮挡 */
  #scmjGame .scmj-handbacks-1, #scmjGame .scmj-handbacks-3 { top: 50%; transform: translateY(-50%); }
  #scmjGame .scmj-handbacks-2 { top: 30px; left: 58%; }
  #scmjGame .scmj-side-2 { left: 4px; }
  #scmjGame .scmj-side-2 .scmj-seat { width: 105px; }
  #scmjGame .scmj-hand { min-height: 0; padding: 8px 1px; }
  #scmjGame .scmj-actionbar { background: transparent; border-color: transparent; }
}
@media (max-height: 540px) and (orientation: landscape) {
  #scmjGame .scmj-center { inset: 38px 112px 16px; }
  #scmjGame .scmj-side-2 { top: 0; left: 4px; width: 64px; }
  #scmjGame .scmj-side-3, #scmjGame .scmj-side-1 { height: auto; top: 30%; }
  #scmjGame .scmj-side .scmj-seatwrap { padding-top: 0; }
  #scmjGame .scmj-handbacks-1, #scmjGame .scmj-handbacks-3 { top: 40px; }
}
</style>

<script>
export default {
  mounted() {
    // SSR 保护：所有 DOM 逻辑仅在浏览器端执行（动态 import 模式）
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    this.$nextTick(async () => {
      const root = this.$el && this.$el.querySelector ? this.$el.querySelector('#scmjGame') : null
      if (!root) return
      // 防重复初始化：若上一实例仍挂载（路由复用场景），先销毁
      if (window.__scmjUI) {
        try { window.__scmjUI.destroy() } catch (e) { /* 忽略 */ }
        window.__scmjUI = null
      }
      try {
        // 动态 import：UI 模块与真实规则引擎适配器，避免 SSR 执行 DOM 代码
        // createOnlineGame 一并注入，但联机大厅/网络客户端仍在点击「联机对战」
        // 时才由 ui.js 懒加载（单机玩家不多付解析成本）
        const [{ default: ScmjUI }, { createLocalGame }, { createOnlineGame }] = await Promise.all([
          import('../../.vuepress/components/mahjong/ui'),
          import('../../.vuepress/components/mahjong/adapter'),
          import('../../.vuepress/components/mahjong/multiplayer/remote-game')
        ])
        if (this._isDestroyed || !root.isConnected) return
        this._scmj = new ScmjUI(root, { createLocalGame, createOnlineGame, router: this.$router })
        this._scmj.mount()
        window.__scmjUI = this._scmj
      } catch (err) {
        console.error('[四川麻将] 初始化失败：', err)
      }
    })
  },
  beforeDestroy() {
    if (this._scmj) {
      try { this._scmj.destroy() } catch (e) { /* 忽略 */ }
      this._scmj = null
    }
    if (typeof window !== 'undefined' && window.__scmjUI) window.__scmjUI = null
  }
}
</script>
