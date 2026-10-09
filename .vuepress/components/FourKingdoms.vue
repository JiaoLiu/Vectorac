<template>
  <section class="jq-game" :class="{'jq-fullscreen': fullscreen}" ref="root" @pointerdown="unlockAudio" @keydown="unlockAudio">
    <header class="jq-top">
      <div class="jq-brand"><span class="jq-emblem">棋</span><div><small>{{ online ? '联机 · 房间 ' + online.roomCode() : 'FOUR KINGDOMS' }}</small><strong>四国军棋</strong></div></div>
      <div class="jq-top-actions">
        <button @click="rules = true">规则</button>
        <template v-if="online">
          <button @click="online.copyInvite()">邀请</button>
          <button @click="online.leave()">退出房间</button>
        </template>
        <template v-else>
          <button @click="toggleFullscreen">{{ fullscreen ? '退出全屏' : '全屏' }}</button>
          <a href="/blogs/other/gamehall.html?game=junqi">🌐 联机</a>
          <a href="/blogs/other/games.html">大厅 ↗</a>
        </template>
      </div>
    </header>
    <div v-if="g" class="jq-layout">
      <main class="jq-arena">
        <div class="jq-command"><span class="jq-live" :class="{'is-waiting': g.phase==='setup'}"></span><strong>{{ headline }}</strong><span>{{ commandRight }}</span></div>
        <div class="jq-board-window" ref="boardWindow" :class="{'is-zoomed': zoom > 1}">
          <svg class="jq-board" :style="{width: (zoom*100)+'%'}" viewBox="24 24 852 852" aria-label="四国军棋棋盘：你在下方，对家是队友" role="group">
            <defs>
              <pattern id="jq-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern>
              <linearGradient id="jq-surface" x2="0" y2="1"><stop stop-color="#203c38"/><stop offset="1" stop-color="#112a29"/></linearGradient>
              <linearGradient id="jq-piece" x2="0" y2="1"><stop stop-color="#fff8df"/><stop offset="1" stop-color="#d5c596"/></linearGradient>
              <filter id="jq-shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="1" flood-opacity=".35"/></filter>
            </defs>
            <!-- 视口紧贴棋子范围，不再留出金色描边那一圈空白，棋子因此可以画得更大。 -->
            <rect x="24" y="24" width="852" height="852" fill="url(#jq-surface)"/>
            <rect x="24" y="24" width="852" height="852" fill="url(#jq-grid)"/>
            <g :transform="boardTurn">
            <g class="jq-arm-tints"><rect v-for="seat in [0,1,2,3]" :key="seat" x="340" y="584" width="220" height="272" rx="14" :transform="'rotate('+seat*90+' 450 450)'" :fill="colors[seat]" opacity=".1"/></g>
            <g class="jq-roads"><path v-for="(edge,i) in board.edges" :key="i" :d="edgePath(edge)" fill="none" :stroke="edge.rail ? '#8eaa97' : '#648279'" :stroke-width="edge.rail ? 6 : 1.5" :opacity="edge.rail ? .78 : .6"/></g>
            <g class="jq-rail-sleepers"><path v-for="(edge,i) in railEdges" :key="i" :d="edgePath(edge)" fill="none" stroke="#152e2a" stroke-width="2" stroke-dasharray="3 5"/></g>
            <g v-if="g.lastMove" pointer-events="none"><path :d="lastPath" fill="none" stroke="#ffdc83" stroke-width="4" opacity=".6" stroke-dasharray="6 6"/><circle :cx="px(board.byId[g.lastMove.to].x)" :cy="px(board.byId[g.lastMove.to].y)" r="24" fill="none" stroke="#ffdc83" stroke-width="2"/></g>
            <g v-for="node in board.nodes" :key="node.id" :data-node="node.id" :transform="'translate('+px(node.x)+' '+px(node.y)+')'+nodeTurn(node.seat)" class="jq-site" :class="{'is-target': destinations.includes(node.id)}" role="button" :tabindex="node.seat === mySeat || destinations.includes(node.id) ? 0 : -1" :aria-label="nodeLabel(node)" @click="clickNode(node)" @keydown.enter.prevent="clickNode(node)" @keydown.space.prevent="clickNode(node)">
              <rect x="-24" y="-23" width="48" height="46" fill="transparent"/>
              <circle v-if="node.kind === 'camp'" r="16" fill="#243f35" stroke="#94af82" stroke-width="2"/>
              <rect v-else-if="node.kind === 'hq'" x="-21" y="-15" width="42" height="30" rx="3" fill="#3b4935" stroke="#c0a86e" stroke-width="2"/>
              <circle v-else :r="node.kind === 'junction' ? 7 : 4" fill="#243c35" stroke="#a4aa87" stroke-width="1.5"/>
              <text v-if="!pieceAt(node.id) && (node.kind==='camp'||node.kind==='hq')" class="jq-site-label" text-anchor="middle" y="4">{{ node.kind==='camp' ? '营' : '本营' }}</text>
              <circle v-if="destinations.includes(node.id)" r="22" fill="#f6db79" opacity=".25"/><circle v-if="destinations.includes(node.id)" r="7" fill="#ffe8a0"/>
              <g v-if="pieceAt(node.id)" :class="['jq-piece', {'is-selected': selected === pieceAt(node.id).id}]" filter="url(#jq-shadow)">
                <rect x="-23" y="-20" width="46" height="40" rx="6" :fill="pieceType(pieceAt(node.id)) ? 'url(#jq-piece)' : colors[pieceAt(node.id).seat]" :stroke="selected === pieceAt(node.id).id ? '#fff0a0' : colors[pieceAt(node.id).seat]" :stroke-width="selected === pieceAt(node.id).id ? 4 : 2"/>
                <rect x="-19" y="-16" width="38" height="32" rx="3" fill="none" :stroke="pieceType(pieceAt(node.id)) ? colors[pieceAt(node.id).seat] : '#ffffff55'" stroke-width=".7"/>
                <text v-if="pieceType(pieceAt(node.id))" class="jq-piece-label" text-anchor="middle" y="6" :fill="colors[pieceAt(node.id).seat]">{{ pieceName(pieceAt(node.id)) }}</text>
                <!-- 情报角标：吃过我方明棋的敌暗子按交战结果标注推断（司 / 大…） -->
                <g v-if="pieceBadge(pieceAt(node.id))" class="jq-intel-badge">
                  <circle cx="14" cy="-11" r="8.5" fill="#d8a521" stroke="#3c2a05" stroke-width="1"/>
                  <text x="14" y="-7.5" text-anchor="middle">{{ pieceBadge(pieceAt(node.id)) }}</text>
                </g>
              </g>
            </g>
            </g>
            <g v-for="seat in [0,1,2,3]" :key="'badge'+seat" :data-seat="seat" :transform="badgeTransform(seat)">
              <rect :x="online ? -86 : -78" y="-15" :width="online ? 172 : 156" height="30" rx="15" :fill="g.turn===seat&&g.phase==='play' ? colors[seat] : '#0b2321'" :stroke="g.turn===seat&&g.phase==='play' ? '#ffdda1' : '#48635b'"/>
              <text text-anchor="middle" y="5" fill="#f8efd5" font-size="13">{{ badgeText(seat) }}</text>
            </g>
          </svg>
        </div>
        <div class="jq-board-footer"><span>{{zoom>1?'滑动查看战场 · 下方是你':'你与对家同盟 · 2 VS 2'}}</span><div><button @click="toggleZoom">{{zoom === 1 ? '放大棋盘' : '全局总览'}}</button><button v-if="zoom>1" @click="focusOwn">回到己方</button></div></div>
      </main>
      <aside class="jq-panel">
        <div class="jq-panel-title"><span>战局指挥台</span><small>对家同盟 · 智谋对决</small></div>
        <div class="jq-button-pair jq-audio"><button @click="toggleSound">音效 {{soundOn?'开':'关'}}</button><button @click="toggleMusic">音乐 {{musicOn?'开':'关'}}</button></div>
        <div class="jq-team-card"><div><span class="jq-team-name">{{ teamName(myTeam) }}</span><small>{{ online ? '同盟 · 你与队友' : '同盟 · 你与 AI 队友' }}</small></div><b>{{ teamCount(myTeam) }}<em> / 2</em></b></div>
        <div class="jq-team-card enemy"><div><span class="jq-team-name">{{ teamName(1 - myTeam) }}</span><small>{{ online ? '对手阵营' : '对手 · 两名 AI' }}</small></div><b>{{ teamCount(1 - myTeam) }}<em> / 2</em></b></div>
        <div class="jq-select-label" v-if="!online">棋子可见模式<button class="jq-mode-trigger" :disabled="g.phase !== 'setup'" aria-haspopup="dialog" :aria-expanded="modePicker?'true':'false'" @click="modePicker=true">{{modeLabel}}<span aria-hidden="true">⌄</span></button></div>
        <div class="jq-select-label" v-else>棋子可见模式<button class="jq-mode-trigger" disabled>四暗 · 只看见己方<span aria-hidden="true">🔒</span></button></div>
        <div class="jq-intel"><small>{{ g.phase === 'setup' ? '布阵提示' : '当前情报' }}</small><strong>{{ selectedTitle }}</strong><p>{{ selectedHelp }}</p></div>
        <template v-if="g.phase === 'setup'">
          <button class="jq-primary" :disabled="!!online && g.myConfirmed" @click="begin">{{ online && g.myConfirmed ? '已出征 · 等待其他玩家' : '完成调度 · 出征' }} <span>→</span></button>
          <div class="jq-button-pair"><button :disabled="!!online && g.myConfirmed" @click="shuffle">换一套阵型</button><button v-if="!online" @click="saveFormation">保存阵型</button></div>
          <div v-if="online" class="jq-conf-note">{{ confirmNote }}</div>
          <template v-if="!online">
            <button v-if="savedFormation" class="jq-wide" @click="loadFormation">使用我的阵型</button>
            <button v-if="savedGame" class="jq-wide" @click="resume">继续上次对局</button>
          </template>
        </template>
        <template v-else>
          <button v-if="!online && g.phase==='finished'" class="jq-primary" @click="newGame">再来一局 →</button>
          <div class="jq-button-pair"><button v-if="!online" @click="newGame">重新布阵</button><button :disabled="g.phase!=='play'||!g.alive[mySeat]" @click="giveUp">我方投降</button></div>
        </template>
        <div class="jq-journal"><div class="jq-journal-title">战场记录 <span>{{g.quiet}} / 70 无碰撞</span></div><ol><li v-for="(line,i) in g.logs.slice(0,7)" :key="i">{{line}}</li><li v-if="!g.logs.length">点击两枚己方棋子交换位置，完成布阵后出征。</li></ol></div>
        <div class="jq-mini-rule">铁路长行 · 工兵转弯 · 行营免战<br>夺取两家军旗，赢得同盟胜利</div>
      </aside>
    </div>
    <div v-else class="jq-loading">正在展开棋盘…</div>
    <div v-if="dice" class="jq-dice" :class="{'is-settled':dice.settled}" role="status" aria-live="polite">
      <div class="jq-dice-card">
        <div class="jq-dice-title">掷骰定先手</div>
        <div v-for="(rows,i) in dice.rounds" :key="i" class="jq-dice-round">
          <div v-if="dice.rounds.length>1" class="jq-dice-round-tag">{{ i ? '并列最高点 · 重掷第 ' + i + ' 轮' : '第一轮' }}</div>
          <ul class="jq-dice-rows">
            <li v-for="row in rows" :key="row.seat" :class="{'is-first':dice.settled&&i===dice.rounds.length-1&&row.seat===dice.first, 'is-past':i<dice.rounds.length-1}">
              <i class="jq-dice-seat" :style="{background:colors[row.seat]}"></i>
              <span class="jq-dice-army">{{ armies[row.seat] }}</span>
              <span class="jq-dice-hand">
                <b v-for="(value,k) in dieFaces(i,row)" :key="k" class="jq-die" :class="{'is-rolling':!dice.settled&&i===dice.rounds.length-1}" :aria-label="'骰子 ' + value"><i v-for="n in 9" :key="n" :class="{'is-on':diePips(value).includes(n-1)}"></i></b>
              </span>
              <strong>{{ dieFaces(i,row).reduce((a,b)=>a+b,0) }}</strong>
            </li>
          </ul>
        </div>
        <div class="jq-dice-msg">{{ dice.msg }}</div>
      </div>
    </div>
    <div v-if="notice" class="jq-toast" role="status">{{notice}}</div>
    <div v-if="modePicker" class="jq-modal jq-mode-modal" @click.self="modePicker=false">
      <div ref="modeDialog" role="dialog" aria-modal="true" aria-labelledby="jq-mode-title" @keydown.tab="trapDialogFocus">
        <header><h3 id="jq-mode-title">棋子可见模式</h3><button aria-label="关闭模式选择" @click="modePicker=false">✕</button></header>
        <p>开局后不能更改，选择后立即生效。</p>
        <button v-for="option in modeOptions" :key="option.id" class="jq-mode-option" :class="{'is-active':g.mode===option.id}" :aria-pressed="g.mode===option.id?'true':'false'" @click="selectMode(option.id)"><strong>{{option.title}}<span v-if="g.mode===option.id">✓ 当前</span></strong><small>{{option.help}}</small></button>
      </div>
    </div>
    <div v-if="confirmBox" class="jq-modal jq-mode-modal" @click.self="confirmBox=null"><div role="dialog" aria-modal="true" aria-labelledby="jq-confirm-title" @keydown.tab="trapDialogFocus"><header><h3 id="jq-confirm-title">{{confirmBox.title}}</h3><button aria-label="关闭确认" @click="confirmBox=null">✕</button></header><p>{{confirmBox.text}}</p><div class="jq-button-pair"><button @click="confirmBox=null">取消</button><button class="jq-primary" @click="acceptConfirm">确认</button></div></div></div>
    <div v-if="rules" class="jq-modal" @click.self="rules=false"><div role="dialog" aria-modal="true" aria-label="四国军棋规则" @keydown.tab="trapDialogFocus"><header><h3>四国军棋 · 作战手册</h3><button @click="rules=false" aria-label="关闭规则">✕</button></header><p>对家结盟，青龙与玄武一队，赤虎与朱雀一队。轮流行棋；一家出局后，队友仍可独立取胜。</p><h4>01 布阵</h4><p>每方 25 子。军旗必须在两个大本营之一；地雷只在最后两排；炸弹不能放第一排；五个行营留空。点击两枚己方棋子交换。</p><h4>02 行棋</h4><p>四方各掷两颗骰子，点数最大者先行，并列最高点重掷；骰子只决定先手。之后固定按棋盘座次顺时针轮行：下方 → 左方 → 上方 → 右方；一家出局或无合法步时才跳过。公路走相邻一站，行营有斜线连接。铁路没有棋子阻挡时可长行；普通棋子直行或沿弧线通行，只有工兵能在铁路直角处转弯。不能越过友军或敌军，不能攻击行营里的棋子。任何棋子进入大本营后都不能移动。</p><h4>03 战斗</h4><p>司令 ＞ 军长 ＞ 师长 ＞ 旅长 ＞ 团长 ＞ 营长 ＞ 连长 ＞ 排长 ＞ 工兵。同级同归于尽；炸弹与任何棋子同归于尽；工兵排雷，其他普通棋子触雷阵亡。司令阵亡，本方军旗公开。</p><h4>04 胜负与暗棋</h4><p>军旗被夺、无合法行棋或投降，该方出局，剩余棋子撤离。全队两家出局才判负。连续 70 手无碰撞判和。双明只显示本队身份；四暗只显示自己；全明为练习模式。AI 同样按可见信息选步。</p></div></div>
  </section>
</template>

<script>
import { BOARD, TYPES, ARMIES, createGame, at, legalMoves, visibleType, randomizeFormation, swapFormation, startGame, rollOpening, move, chooseAI, surrender, restoreGame, canDeploy, badgeOf } from './junqi/engine.mjs'
import { createJunqiAudio } from './junqi/audio'
import { boardViewAngle, nodeLocalAngle } from './junqi/presentation.mjs'
import { isCommActive, registerBgm, unregisterBgm } from './gamehall/chatkit.js'
const SAVE = 'vectorac.junqi.game.v1', FORM = 'vectorac.junqi.formation.v1'
// 骰子点位：3×3 九宫格下标，1~6 点各对应哪些格子。
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
const die = () => 1 + Math.floor(Math.random() * 6)
const TEAM_NAMES = ['青龙 × 玄武', '赤虎 × 朱雀']
// 四家徽标锚点（玩家视角的下 / 左 / 上 / 右），换座只更换所属阵营。
const BADGE_ANCHORS = [[680, 792], [173, 235], [221, 106], [727, 663]]
export default {
  name: 'FourKingdoms',
  props: {
    // 联机适配器（可选）。传入后棋盘改由服务端视图驱动，本地只发意图：
    // { getView(), trySwap(a,b), tryRandomize(), tryConfirm(), tryMove(pieceId,to),
    //   trySurrender(), seatLabel(seat), copyInvite(), leave(), roomCode() }
    online: { type: Object, default: null }
  },
  data() {
    return { game: null, mapped: null, countdown: '', board: BOARD, armies: ARMIES, colors: ['#176b5a','#9d4139','#355f92','#936028'], selected: null, rules: false, modePicker:false, confirmBox:null, pageHidden:false, modeOptions:[{id:'dark',title:'四暗',help:'只看见自己的棋子；司令阵亡后亮出该方军旗。'},{id:'dual',title:'双明',help:'看见自己与对家棋子的身份，方便配合。'},{id:'open',title:'全明',help:'看见所有棋子的身份，适合练习走法。'}], notice: '', fullscreen: false, zoom: 1, soundOn:true, musicOn: true, dice: null, savedGame: null, savedFormation: null }
  },
  computed: {
    // 统一视图出口：联机读服务端映射（mapped），单机读本地引擎状态（game）
    g() { return this.online ? this.mapped : this.game },
    mySeat() { const g = this.g; return this.online && g ? g.mySeat : 0 },
    myTeam() { return this.mySeat % 2 },
    // 联机视角旋转：自己永远在下方（SVG rotate 顺时针为正）
    viewAngle() { return boardViewAngle(this.mySeat) },
    boardTurn() { return this.viewAngle ? 'rotate(' + this.viewAngle + ' 450 450)' : '' },
    commandRight() { const s = this.g; return (s.phase === 'setup' ? '布阵阶段' : '第 ' + s.turns + ' 手') + (this.countdown ? ' · ' + this.countdown : '') },
    confirmNote() { const c = (this.g && this.g.confirmed) || []; const names = c.map((ok, i) => ok ? ARMIES[i] : null).filter(Boolean); return names.length ? '已出征：' + names.join('、') : '四家都在布阵中' },
    modalOpen(){return !!(this.rules||this.modePicker||this.confirmBox)},
    modeLabel(){return this.g?{dark:'四暗 · 只看见己方',dual:'双明 · 看见己方与对家',open:'全明 · 练习走法'}[this.g.mode]:''},
    railEdges() { return BOARD.edges.filter(e => e.rail) },
    chosen() { return this.g && this.g.pieces.find(p => p.id === this.selected) },
    destinations() { const c = this.chosen; return c && this.g.phase === 'play' && this.g.turn === this.mySeat && c.seat === this.mySeat && !this.modalOpen ? this.movesFor(c.id) : [] },
    headline() { const s = this.g; if (s.phase === 'setup') return this.online && s.myConfirmed ? '已确认出征 · 等待其他玩家' : '排兵布阵，守住你的军旗'; if (s.phase === 'finished') return s.winner === 'draw' ? '势均力敌 · 本局和棋' : s.winner === this.myTeam ? '同盟胜利 · ' + TEAM_NAMES[s.winner] : '本局失利 · ' + TEAM_NAMES[1 - this.myTeam] + '胜'; return s.turn === this.mySeat ? '轮到你行棋' : ARMIES[s.turn] + '正在行棋…' },
    selectedTitle() { const p = this.chosen; if (!p) return this.g.phase === 'setup' ? '你的阵地在下方' : this.g.alive[this.mySeat] ? '点击棋子，查看可行路线' : '你已出局，队友仍在战斗'; if (this.g.phase === 'setup') return ARMIES[p.seat] + ' · ' + this.pieceName(p); const b = this.pieceBadge(p); return ARMIES[p.seat] + ' · ' + this.pieceName(p) + (b ? '（标：' + b + '）' : '') },
    selectedHelp() { if (!this.chosen) return this.g.phase === 'setup' ? '选两枚棋子交换位置。金框是大本营，圆圈是行营。' : '金色落点是合法位置。对手身份隐藏时，碰撞只报告胜负，不泄露未公开的军衔。'; if (this.g.phase === 'setup') return '军旗入本营，地雷在后两排，炸弹不在第一排。大本营里的棋子出征后无法移动。'; const hint = this.badgeHint(this.chosen); if (hint) return hint; const type = this.pieceType(this.chosen); return !type ? '身份未公开。可观察对手走法和交战结果进行判断；吃过我方明子的敌子会自动标注「大」或军衔。' : type === 'engineer' ? '工兵：可以在铁路转弯，唯一能直接排雷的普通棋子。' : type === 'bomb' ? '炸弹：与任何敌子同归于尽。谨慎选择攻击目标。' : type === 'mine' || type === 'flag' ? '固定棋子，不可移动。' : '沿公路一步，沿铁路直行或走弧线；不能转铁路直角弯。' },
    lastPath() { const m = this.g.lastMove, a = BOARD.byId[m.from], b = BOARD.byId[m.to]; return `M${this.px(a.x)} ${this.px(a.y)}L${this.px(b.x)} ${this.px(b.y)}` }
  },
  watch: { modalOpen(open){this.schedule();if(open){this._modalFocus=document.activeElement;this._modalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';this.$nextTick(()=>{const el=this.$el.querySelector('.jq-modal');if(el)(el.querySelector('.is-active')||el.querySelector('button')).focus()})}else{document.body.style.overflow=this._modalOverflow||'';if(this._modalFocus&&this._modalFocus.isConnected)this._modalFocus.focus()}} },
  mounted() {
    this._pageContent = this.$el.closest('.theme-reco-content')
    if (this._pageContent) this._pageContent.classList.add('jq-page-content')
    this._audio=createJunqiAudio({ isCommActive, registerBgm, unregisterBgm })
    if (this.online) {
      // 联机：默认开 BGM（与单机一致，首次点击后才出声）；即进即全屏；视图由 remote 推送
      this._audio.music(true)
      this._oldOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      this.fullscreen = true
      this.syncFromOnline()
    } else {
      try { this.savedGame = restoreGame(localStorage.getItem(SAVE)); this.savedFormation = JSON.parse(localStorage.getItem(FORM)) } catch (e) {}
      this.game = createGame()
    }
    // 默认全局总览（zoom=1）：窄屏不再自动放大——进局先看整盘阵型，
    // 需要细看时用户自己点「放大棋盘」
    // SVG sizing may settle after Vue's first tick in WebKit. Recenter on the
    // actual viewport layout (also after rotation), not an early zero-size box.
    this.$nextTick(()=>{if(window.ResizeObserver&&this.$refs.boardWindow){this._boardResize=new ResizeObserver(()=>{if(this.zoom>1)this.focusOwn()});this._boardResize.observe(this.$refs.boardWindow)}})
    this._visibility = () => { this.pageHidden=document.hidden;this._audio.pause(this.pageHidden);this.schedule() }
    this._key = e => { if (e.key === 'Escape') { if(this.modalOpen){this.modePicker=false;this.rules=false;this.confirmBox=null;return}if (this.fullscreen && !this.online) this.toggleFullscreen() } }
    document.addEventListener('visibilitychange', this._visibility); document.addEventListener('keydown', this._key)
  },
  beforeDestroy() { if(this._boardResize)this._boardResize.disconnect();if(this.modalOpen)document.body.style.overflow=this._modalOverflow||'';if(this._audio)this._audio.destroy();clearTimeout(this._timer); clearInterval(this._diceRoll); clearTimeout(this._diceSettle); clearTimeout(this._diceStart); clearTimeout(this._noticeTimer); document.removeEventListener('visibilitychange', this._visibility); document.removeEventListener('keydown', this._key); if (this._pageContent) this._pageContent.classList.remove('jq-page-content'); if (this.fullscreen) document.body.style.overflow = this._oldOverflow || '' },
  methods: {
    // ---------- 联机：视图同步（remote 在每次 GAME_STATE_CHANGED 后调用） ----------
    syncFromOnline() {
      if (!this.online) return
      const v = this.online.getView()
      if (!v) { this.mapped = null; return }
      const prev = this.mapped
      const lm = v.lastMove || null
      this.mapped = {
        phase: v.phase, mode: v.mode, turn: v.turn, turns: v.turns, quiet: v.quiet,
        mySeat: v.mySeat, pieces: v.pieces || [], alive: v.alive || [true, true, true, true],
        logs: v.logs || [], lastMove: lm, confirmed: v.confirmed || [false, false, false, false],
        myConfirmed: !!v.myConfirmed, legal: v.legal || [],
        winner: v.phase === 'finished' && v.results ? (v.results.draw ? 'draw' : v.results.winner) : null
      }
      // 新一手播调动/碰撞音；刚终局播收尾旋律（首次同步不补播历史）
      if (prev && v.phase === 'play' && v.turns !== prev.turns && lm) this._audio.play(lm.outcome || 'move')
      if (prev && prev.phase !== 'finished' && v.phase === 'finished') this._audio.play('finish')
      if (!prev || prev.phase !== v.phase || (this.selected && !(v.pieces || []).some(p => p.id === this.selected))) this.selected = null
    },
    /** 联机：服务端已定先手，仅复用掷骰动画（不改对局状态） */
    showOnlineDice(opening) { this._playDice(opening) },
    selectMode(mode){if(this.online||this.game.phase!=='setup')return;this.game.mode=mode;this.persist();this.modePicker=false},
    trapDialogFocus(e){const buttons=Array.from(e.currentTarget.querySelectorAll('button'));const i=buttons.indexOf(document.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus()},
    askConfirm(title,text,action){this.confirmBox={title,text,action}},
    acceptConfirm(){const action=this.confirmBox&&this.confirmBox.action;this.confirmBox=null;if(action)action()},
    unlockAudio(){if(this._audio)this._audio.unlock()},
    toggleSound(){this.soundOn=!this.soundOn;this._audio.effects(this.soundOn)},
    toggleMusic(){this.musicOn=!this.musicOn;this._audio.music(this.musicOn)},
    /* 横屏全屏时棋盘靠左贴边，不再左右居中：屏幕底部中间是系统横条，
       靠左布局能让己方后排棋子避开它。放大态横向滚到最右，等于把棋盘尽量往左挪。 */
    isLeftAligned(){return this.fullscreen&&window.matchMedia('(max-height:550px) and (orientation:landscape)').matches},
    focusOwn(){this.$nextTick(()=>{const el=this.$refs.boardWindow;if(el){const max=el.scrollWidth-el.clientWidth;el.scrollLeft=this.isLeftAligned()?max:max/2;el.scrollTop=el.scrollHeight-el.clientHeight}})},
    toggleZoom(){this.zoom=this.zoom===1?1.8:1;this.focusOwn()},
    playMove(){this._audio.play(this.game.phase==='finished'?'finish':this.game.lastMove.outcome)},
    px(n) { return 50 + n * 50 },
    edgePath(e) { const a = BOARD.byId[e.a], b = BOARD.byId[e.b]; if (!e.curve) return `M${this.px(a.x)} ${this.px(a.y)}L${this.px(b.x)} ${this.px(b.y)}`; const turn = BOARD.adjacency[e.a].find(x => x.to === e.b); return `M${this.px(a.x)} ${this.px(a.y)}Q${this.px(a.x + turn.start[0])} ${this.px(a.y + turn.start[1])} ${this.px(b.x)} ${this.px(b.y)}` },
    badgeTransform(s) { const a = BADGE_ANCHORS[(s - this.mySeat + 4) % 4]; return 'translate(' + a[0] + ' ' + a[1] + ')' },
    badgeText(seat) { const s = this.g; if (!s.alive[seat]) return ARMIES[seat] + ' · 已出局'; if (this.online) return ARMIES[seat] + ' · ' + this.online.seatLabel(seat); return ARMIES[seat] + ' · ' + (seat === 0 ? '你' : seat === 2 ? 'AI 队友' : 'AI 对手') },
    teamName(t) { return TEAM_NAMES[t] },
    pieceAt(pos) { return at(this.g, pos) },
    pieceType(p) { return this.online ? p.type : visibleType(this.g, p, this.mySeat) },
    pieceName(p) { const t = this.pieceType(p); return t ? TYPES[t].name : '军棋' },
    /** 情报角标：只有吃过「我方明棋」的敌方暗子才有假设池（s.intel 只在
        我方亲自参战时记录）；四暗下队友被吃不产生我的情报，双明下队友
        参战同样能推断，由引擎下发（联机 p.intel / 单机 g.intel）。 */
    pieceBadge(p) {
      if (!p || this.pieceType(p)) return null
      if (p.seat % 2 === this.myTeam) return null // 己方与队友不标
      const pool = this.online ? p.intel : (this.g.intel && this.g.intel[this.mySeat + ':' + p.id])
      return badgeOf(pool)
    },
    badgeHint(p) {
      const b = this.pieceBadge(p)
      if (!b) return null
      return b === '大'
        ? '该子吃掉过我方明子后存活，至少是师长级的大子。'
        : '该子与我方明子交过手，身份基本锁定为「' + ({ 司: '司令', 军: '军长', 师: '师长', 旅: '旅长', 团: '团长', 营: '营长', 连: '连长', 排: '排长', 兵: '工兵', 炸: '炸弹', 雷: '地雷', 旗: '军旗' })[b] + '」。'
    },
    nodeLabel(n) { const p = this.pieceAt(n.id); return p ? ARMIES[p.seat] + this.pieceName(p) : n.kind === 'camp' ? '行营' : n.kind === 'hq' ? '大本营' : '空兵站' },
    // 合法落点：单机问本地引擎，联机取服务端视图附带的合法表
    movesFor(pieceId) { if (!this.online) return legalMoves(this.g, pieceId); const opt = (this.g.legal || []).find(o => o.type === 'move'); return opt ? opt.moves.filter(m => m.pieceId === pieceId).map(m => m.to) : [] },
    teamCount(t) { return this.g.alive.filter((a,i) => a && i%2===t).length },
    toast(text) { this.notice = text; clearTimeout(this._noticeTimer); this._noticeTimer = setTimeout(() => { this.notice = '' }, 3000) },
    refresh() { if (this.online) return; this.game = Object.assign({}, this.game, { pieces: this.game.pieces.slice(), alive: this.game.alive.slice() }); this.persist(); this.schedule() },
    persist() { if (this.online) return; try { localStorage.setItem(SAVE, JSON.stringify(this.game)) } catch (e) {} },
    clickNode(n) {
      const p = this.pieceAt(n.id), s = this.g
      if (s.phase === 'setup') {
        if (this.online && s.myConfirmed) return this.toast('已确认出征，等待其他玩家')
        if (!p || p.seat !== this.mySeat) return this.toast('请在下方自己的阵地交换棋子')
        if (this.selected && this.selected !== p.id) {
          if (this.online) { this.online.trySwap(this.selected, p.id); this.selected = null }
          else { if (!swapFormation(s, this.selected, p.id)) this.toast('位置不合法：检查军旗、地雷和炸弹的布阵限制'); this.selected = null; this.refresh() }
        } else this.selected = this.selected === p.id ? null : p.id
        return
      }
      if (this.destinations.includes(n.id)) { if (this.online) { this.online.tryMove(this.selected, n.id); this.selected = null } else if (move(s, this.selected, n.id)) { this.playMove();this.selected = null; this.refresh() } return }
      this.selected = p ? p.id : null
      if (p && p.seat === this.mySeat && s.phase === 'play' && s.turn === this.mySeat && !this.movesFor(p.id).length) this.toast('这枚棋子不能移动，或通路已被挡住')
    },
    begin() { const locked = this.g.pieces.find(p => p.seat === this.mySeat && p.type && BOARD.byId[p.pos].kind === 'hq' && TYPES[p.type].rank >= 5); if(locked)return this.askConfirm('确认出征','大本营中的'+TYPES[locked.type].name+'整局不能移动，仍要出征吗？',()=>this.confirmBegin());this.confirmBegin() },
    confirmBegin() { if (this.online) this.online.tryConfirm(); else this.rollDice() },
    // Compensate the outer board rotation, then rotate the whole tile (including
    // its printed rank and badge) for its current region in the player's view.
    nodeTurn(seat) { const angle = nodeLocalAngle(seat, this.mySeat); return angle ? ' rotate(' + angle + ')' : '' },
    diePips(value) { return PIPS[value] || [] },
    // 决胜轮还在跳动时显示随机点数，之前的轮次已经作数，直接展示真实点数。
    dieFaces(index, row) { return this.dice.settled || index < this.dice.rounds.length - 1 ? row.dice : this.dice.faces[row.seat] },
    _playDice(opening, done) {
      const rounds = opening.rounds, decisive = rounds[rounds.length - 1]
      const faces = {}
      for (const row of decisive) faces[row.seat] = [die(), die()]
      this.dice = { opening, rounds, faces, first: opening.first, settled: false, msg: '' }
      this._audio.play('dice')
      clearInterval(this._diceRoll); clearTimeout(this._diceSettle); clearTimeout(this._diceStart)
      this._diceRoll = setInterval(() => { for (const seat of Object.keys(this.dice.faces)) this.dice.faces[seat] = [die(), die()] }, 90)
      this._diceSettle = setTimeout(() => {
        clearInterval(this._diceRoll); this._diceRoll = null
        const best = Math.max(...decisive.map(r => r.dice[0] + r.dice[1]))
        this.dice.settled = true; this.dice.faces = {}
        this.dice.msg = `${ARMIES[opening.first]}掷出 ${best} 点取得先手` + (rounds.length > 1 ? `（并列最高点重掷 ${rounds.length - 1} 次）` : '')
        this._diceStart = setTimeout(() => { this.dice = null; if (done) done(opening) }, 1300)
      }, 1200)
    },
    rollDice() { this._playDice(rollOpening(this.game), opening => this.startBattle(opening)) },
    startBattle(opening){startGame(this.game, opening);this.selected=null;this.savedGame=null;this.refresh();if(!this.fullscreen)this.toggleFullscreen()},
    shuffle() { if (this.online) { this.online.tryRandomize(); return } randomizeFormation(this.game); this.selected = null; this.refresh() },
    saveFormation() { this.savedFormation = this.game.pieces.filter(p=>p.seat===0).map(p=>({id:p.id,pos:p.pos})); try { localStorage.setItem(FORM,JSON.stringify(this.savedFormation)); this.toast('阵型已保存到此浏览器') } catch(e) { this.toast('当前浏览器无法保存阵型') } },
    loadFormation() { const saved = this.savedFormation; if (!Array.isArray(saved) || saved.length!==25 || new Set(saved.map(p=>p.pos)).size!==25) return this.toast('保存的阵型无效'); const own = this.game.pieces.filter(p=>p.seat===0); if (!own.every(p=>{const q=saved.find(q=>q.id===p.id);return q&&canDeploy(p.type,BOARD.byId[q.pos],0)})) return this.toast('保存的阵型不符合规则'); own.forEach(p=>{p.pos=saved.find(q=>q.id===p.id).pos}); this.selected=null;this.refresh() },
    resume() { this.game=this.savedGame;this.savedGame=null;this.selected=null;this.refresh() },
    resetGame(){clearTimeout(this._timer);this.dice=null;clearInterval(this._diceRoll);clearTimeout(this._diceSettle);clearTimeout(this._diceStart);this.game=createGame({mode:this.game.mode});this.selected=null;this.refresh();this.focusOwn()},
    newGame() { if(this.game.phase==='play')return this.askConfirm('重新布阵','结束当前对局并重新布阵？本局进度将被替换。',()=>this.resetGame());this.resetGame() },
    giveUp() { this.askConfirm('确认投降', this.online ? '你将退出本局，但队友会继续作战。确认投降？' : '你将退出本局，但 AI 队友会继续作战。确认投降？',()=>{ if (this.online) { this.online.trySurrender(); this.selected = null } else { surrender(this.game,0);this.selected=null;this.refresh() } }) },
    schedule() { clearTimeout(this._timer);if(this.online||!this.game||this.game.phase!=='play'||this.pageHidden||this.modalOpen||this.game.turn===0&&this.game.alive[0])return;this._timer=setTimeout(()=>{const action=chooseAI(this.game);if(action&&move(this.game,action.pieceId,action.to))this.playMove();this.selected=null;this.refresh()},650) },
    toggleFullscreen() { if(!this.fullscreen){this._oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}else document.body.style.overflow=this._oldOverflow||'';this.fullscreen=!this.fullscreen;this.$nextTick(()=>{if(this.fullscreen)this.$refs.root.scrollTop=0}) }
  }
}
</script>

<style>
.theme-reco-content.jq-page-content{max-width:1320px!important;transform:none!important}
.jq-game{--jq-gold:#e5c785;--jq-ink:#f3eddd;color:var(--jq-ink);background:#102724;border:1px solid #496151;border-radius:22px;overflow:hidden;margin:22px auto;font-family:system-ui,-apple-system,'PingFang SC',sans-serif;box-shadow:0 22px 60px #10282030;max-width:1320px;-webkit-tap-highlight-color:transparent}.jq-game *{box-sizing:border-box}.jq-game button,.jq-game select,.jq-game a{font:inherit}.jq-game button{border:1px solid #607163;color:#e9e8d4;background:#253e35;border-radius:8px;padding:10px 13px;cursor:pointer;line-height:1.2;min-height:40px}.jq-game button:hover{background:#365346;border-color:#d1bb7c}.jq-game button:focus-visible,.jq-site:focus-visible{outline:3px solid #fff0a5;outline-offset:3px}.jq-game button:disabled{opacity:.4;cursor:default}.jq-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:20px 24px;background:#132c27;border-bottom:1px solid #51664d}.jq-brand{display:flex;gap:12px;align-items:center}.jq-brand strong{display:block;font-size:25px;letter-spacing:4px;line-height:1.4}.jq-brand small{font-size:9px;letter-spacing:2.5px;color:#c6bb90}.jq-emblem{display:grid;place-items:center;width:43px;height:43px;border:1px solid #c2a56b;border-radius:10px;transform:rotate(-6deg);color:#e8d39c;font-family:serif;font-size:27px}.jq-top-actions{display:flex;align-items:center;gap:8px}.jq-top-actions a{color:#e5c785;text-decoration:none;padding:9px}.jq-layout{display:grid;grid-template-columns:minmax(0,1fr) 274px}.jq-arena{min-width:0;background:radial-gradient(ellipse at center,#294a3e,#112925);padding:16px}.jq-command{display:flex;align-items:center;gap:8px;padding:0 8px 10px;font-size:14px}.jq-command>span:last-child{margin-left:auto;color:#b2bda7;font-size:11px}.jq-live{width:7px;height:7px;background:#cce5a3;box-shadow:0 0 10px #a9d99e;border-radius:50%}.jq-live.is-waiting{background:#ecd398}.jq-board-window{overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#80917a #1b352e}.jq-board{display:block;max-width:none;min-width:100%;height:auto;user-select:none;touch-action:manipulation}.jq-site{cursor:pointer}.jq-site-label{fill:#abb68d;font-size:12px}.jq-piece text{font-size:17px;font-weight:800;font-family:'Songti SC','SimSun',serif;pointer-events:none}
/* 情报角标：金字圆徽，钉在敌暗子右上角；字号/字体与棋子文字区分 */
.jq-intel-badge text{font-size:10.5px;font-weight:800;font-family:system-ui,-apple-system,'PingFang SC',sans-serif;fill:#221403;pointer-events:none}
.jq-intel-badge circle{pointer-events:none}.jq-piece.is-selected{transform:translateY(-3px)}.jq-site:hover .jq-piece{filter:brightness(1.1)}.jq-board-footer{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;color:#d0d5bc;padding:9px 6px 0}.jq-board-footer b{margin-left:9px;color:#e3ca8b;letter-spacing:2px;font-size:10px}.jq-board-footer button{font-size:11px;padding:6px 10px;min-height:32px}.jq-team-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#80c7a7;margin-right:5px}.jq-panel{background:#122722;padding:23px 18px;border-left:1px solid #496151}.jq-panel-title{display:flex;flex-direction:column;gap:5px;letter-spacing:1px;margin-bottom:18px}.jq-panel-title>span{font-size:16px;font-weight:700}.jq-panel-title small{font-size:9px;color:#8eaa9b;letter-spacing:2px}.jq-team-card{display:flex;align-items:center;justify-content:space-between;padding:13px 11px;background:#26443a;border:1px solid #4c6a54;border-radius:10px;margin:9px 0}.jq-team-card.enemy{background:#3e3028;border-color:#62483d}.jq-team-card small{display:block;font-size:10px;color:#bcc6ad;margin-top:6px}.jq-team-name{font-size:13px;letter-spacing:1px}.jq-team-card b{font-size:24px;font-family:Georgia,serif;color:#e5d09c}.jq-team-card em{font-size:12px;font-weight:400;font-style:normal;color:#9da890}.jq-select-label{display:block;margin-top:20px;font-size:11px;color:#b5c5af}.jq-select-label select{display:block;width:100%;margin-top:7px;border:1px solid #5b6a53;background:#213a30;color:#f1ecd4;border-radius:7px;padding:10px 7px;font-size:12px}.jq-select-label select:disabled{opacity:.65}.jq-intel{min-height:140px;border-left:2px solid #c6ad70;padding:8px 12px;margin:18px 0}.jq-intel small{display:block;color:#c0b382;font-size:10px;letter-spacing:2px}.jq-intel strong{display:block;font-size:14px;margin:8px 0}.jq-intel p{font-size:12px;line-height:1.8;color:#afc0ac;margin:0}.jq-game .jq-primary{display:block;width:100%;background:linear-gradient(120deg,#dfc589,#b69c5e);border-color:#f2d799;color:#233528;font-weight:800;min-height:47px}.jq-primary span{float:right}.jq-button-pair{display:flex;gap:8px;margin-top:9px}.jq-button-pair button{flex:1;font-size:12px}.jq-game .jq-wide{width:100%;margin-top:8px;font-size:12px}.jq-journal{margin-top:24px;border-top:1px solid #3c5243;padding-top:13px}.jq-journal-title{font-size:12px;display:flex;justify-content:space-between}.jq-journal-title span{color:#91a68f;font-size:10px}.jq-journal ol{padding:0;list-style:none;max-height:180px;overflow:auto;font-size:11px;line-height:1.8;color:#bac7b2}.jq-journal li{margin:9px 0;border-left:2px solid #4f6c53;padding-left:9px}.jq-journal li:first-child{color:#e7d8ad}.jq-mini-rule{border-top:1px solid #3c5243;padding-top:14px;font-size:10px;line-height:1.9;color:#839b88;letter-spacing:1px}.jq-fullscreen{position:fixed;inset:0;z-index:15000;max-width:none;margin:0;border:0;border-radius:0;overflow:auto;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}.jq-fullscreen .jq-layout{max-width:1320px;margin:auto}.jq-toast{position:fixed;bottom:max(30px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);max-width:90vw;width:max-content;z-index:15003;background:#091a16ee;border:1px solid #c6ac70;border-radius:10px;padding:12px 18px;color:#fff1c7;font-size:13px;pointer-events:none}.jq-modal{position:fixed;inset:0;z-index:15004;background:#061714cc;display:grid;place-items:center;padding:20px}.jq-modal>div{background:#f6f0dd;color:#253e33;max-width:560px;max-height:85vh;overflow:auto;padding:25px;border-radius:18px;box-shadow:0 15px 70px #0008}.jq-modal header{display:flex;justify-content:space-between;align-items:center;gap:12px}.jq-modal h3{margin:0;font-size:21px}.jq-modal h4{margin:22px 0 8px;color:#426747;font-size:14px}.jq-modal p{font-size:13px;line-height:1.9}.jq-modal .jq-fine{font-size:11px;color:#74806c}.jq-loading{padding:90px;text-align:center}
@media(min-width:1100px){.jq-fullscreen .jq-board-window{max-width:calc(100vh - 164px);margin:auto}.jq-fullscreen .jq-board-window.is-zoomed{max-height:calc(100vh - 164px)}}
@media(max-width:780px){.jq-game{border-radius:13px}.jq-top{padding:13px 12px}.jq-brand strong{font-size:19px;letter-spacing:2px}.jq-brand small{font-size:8px;letter-spacing:1px}.jq-emblem{width:34px;height:34px;font-size:22px}.jq-top-actions{gap:4px;font-size:11px}.jq-top-actions button{padding:8px;min-height:34px}.jq-top-actions a{padding:5px}.jq-layout{grid-template-columns:1fr}.jq-arena{padding:8px 3px 12px}.jq-command{font-size:12px;padding:6px 10px 10px}.jq-command>span:last-child{font-size:9px}.jq-panel{border-left:0;border-top:1px solid #496151;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:15px}.jq-panel-title,.jq-select-label,.jq-intel,.jq-journal,.jq-mini-rule,.jq-primary,.jq-button-pair,.jq-wide{grid-column:1/-1}.jq-panel-title{margin:0;flex-direction:row;justify-content:space-between;align-items:center}.jq-team-card{margin:0}.jq-select-label{margin-top:3px}.jq-intel{min-height:0;margin:3px 0;padding:5px 10px}.jq-intel p{font-size:12px}.jq-journal{margin-top:6px}.jq-mini-rule{display:none}.jq-board-window.is-zoomed{max-height:75vh}.jq-board-footer{padding:8px 12px 0}}
@media(max-height:550px) and (orientation:landscape){.jq-fullscreen .jq-top{padding:6px 12px}.jq-fullscreen .jq-layout{grid-template-columns:minmax(0,1fr) 230px}.jq-fullscreen .jq-panel{display:block;padding:10px;max-height:calc(100vh - 57px);overflow:auto;border-left:1px solid #496151}.jq-fullscreen .jq-board-window{width:calc(100vh - 118px);max-width:100%;margin:auto}.jq-fullscreen .jq-board-window.is-zoomed{height:calc(100vh - 118px)}.jq-fullscreen .jq-arena{padding:5px}.jq-fullscreen .jq-team-card{margin:6px 0}.jq-fullscreen .jq-command{padding:2px 6px 5px}.jq-fullscreen .jq-intel{margin:12px 0}.jq-fullscreen .jq-board-footer{padding-top:3px}}
/* On phones the default close view is pannable, rather than shrinking 17 files
   to unreadable labels. Overview remains one tap away. */
.jq-audio{margin:0 0 12px}.jq-board-window{border-radius:12px}.jq-board-footer>div{display:flex;gap:5px}
.jq-conf-note{margin-top:8px;font-size:11px;color:#c9b98a;letter-spacing:1px;text-align:center}
@media(max-width:900px){
 .jq-game{margin-left:-12px;margin-right:-12px;border-radius:8px}.jq-fullscreen{margin:0}
 .jq-board-window.is-zoomed{height:min(62vh,540px);max-height:none}
 .jq-board-window.is-zoomed .jq-board{width:max(100%,720px)!important}
 .jq-fullscreen .jq-board-window.is-zoomed{height:calc(100dvh - 158px)}
 .jq-board-footer{padding-left:3px;padding-right:3px}.jq-brand small{display:none}
 /* 战场记录隐藏后，小规则说明的上边框会直接贴在按钮下，一并隐藏。 */
 .jq-panel{padding:10px}.jq-team-card{padding:8px}.jq-journal,.jq-mini-rule{display:none}
}
/* 横屏全屏照五子棋的做法：导航、状态、指挥台、页脚全部移进右侧一列，
   棋盘独占左列并吃满整个高度，不再有横向导航条压掉棋盘的高度。
   棋盘是正方形、只能被高度撑满，所以宽度要留给右列用：右列给足 ~300px，
   按钮才不会被挤成一团、指挥台也不必在小窗口里反复滚动。 */
@media(max-height:550px) and (orientation:landscape){
 .jq-fullscreen{display:grid;grid-template-columns:minmax(0,1fr) clamp(268px,36%,312px);grid-template-rows:auto auto minmax(0,1fr) auto;column-gap:10px;padding-bottom:0;background:radial-gradient(ellipse at center,#294a3e,#112925)}
 .jq-fullscreen .jq-layout,.jq-fullscreen .jq-arena{display:contents}
 .jq-fullscreen .jq-top{grid-column:2;grid-row:1;flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 10px;height:auto;padding:0 0 6px;background:none;border:0}
 .jq-fullscreen .jq-emblem,.jq-fullscreen .jq-brand small{display:none}
 .jq-fullscreen .jq-brand strong{font-size:16px;letter-spacing:2px}
 .jq-fullscreen .jq-top-actions{gap:8px;flex-wrap:wrap;justify-content:flex-end}
 .jq-fullscreen .jq-top-actions button,.jq-fullscreen .jq-top-actions a{padding:7px 10px;min-height:40px;font-size:12px;white-space:nowrap}
 .jq-fullscreen .jq-top-actions a{display:inline-flex;align-items:center;justify-content:center}
 .jq-fullscreen .jq-command{grid-column:2;grid-row:2;padding:0 0 5px;font-size:11px}
 .jq-fullscreen .jq-panel{grid-column:2;grid-row:3;min-height:0;max-height:none;padding:0 0 0 9px;overflow:auto;border-left:1px solid #496151}
 .jq-fullscreen .jq-board-footer{grid-column:2;grid-row:4;padding:5px 0 0;flex-wrap:wrap;row-gap:4px}
 .jq-fullscreen .jq-board-window{grid-column:1;grid-row:1/-1;justify-self:start;align-self:center;height:100%;width:auto;max-width:100%;margin:0}
 .jq-fullscreen .jq-board{min-width:0;width:auto!important;height:100%!important;max-width:100%}
 .jq-fullscreen .jq-board-window.is-zoomed{width:100%;height:100%;max-width:none;max-height:none}
 .jq-fullscreen .jq-board-window.is-zoomed .jq-board{width:auto!important;height:180%!important;max-width:none}
 .jq-fullscreen .jq-team-card{margin:6px 0;padding:8px 11px}
 .jq-fullscreen .jq-team-card small{display:none}
 .jq-fullscreen .jq-button-pair{gap:10px}
 .jq-fullscreen .jq-button-pair button{min-height:40px}
 .jq-fullscreen .jq-journal,.jq-fullscreen .jq-mini-rule,.jq-fullscreen .jq-intel,.jq-fullscreen .jq-panel-title small{display:none}
 /* intel 隐藏后，模式下拉框与出征按钮之间需要补回间距，否则两个大色块贴在一起。 */
 .jq-fullscreen .jq-primary{margin-top:10px}
 .jq-fullscreen .jq-select-label{margin-top:8px}.jq-fullscreen .jq-panel-title{margin-bottom:8px}
}
.jq-game .jq-mode-trigger{display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:7px;text-align:left;font-size:16px;min-height:48px}
.jq-mode-modal>div{width:min(440px,100%);max-height:calc(100dvh - 32px);overscroll-behavior:contain;padding:22px}
.jq-mode-modal header button{min-width:44px;min-height:44px;flex-shrink:0}
.jq-game .jq-mode-option{display:block;width:100%;text-align:left;padding:16px;margin-top:12px;background:#e9e4d5;color:#253e33;border-color:#b9bfae;min-height:80px}
.jq-mode-option strong{display:flex;justify-content:space-between;font-size:18px;line-height:1.4}.jq-mode-option strong span{font-size:13px}
.jq-mode-option small{display:block;font-size:14px;line-height:1.6;margin-top:5px}
.jq-game .jq-mode-option.is-active{border:2px solid #34745a;background:#dcecdf}
@media(max-width:600px){.jq-mode-modal{padding:16px}.jq-mode-modal>div{padding:18px;width:100%}}
/* 掷骰定先手：与麻将开局一致的一次性覆盖层，落定后自动收起并开始对局。 */
.jq-dice{position:fixed;inset:0;z-index:15004;display:grid;place-items:center;padding:20px;background:#061714cc}
.jq-dice-card{display:flex;flex-direction:column;align-items:center;gap:16px;padding:26px 34px;border:1px solid #c6ac70;border-radius:20px;background:#122a25;box-shadow:0 18px 60px #0009}
.jq-dice-title{color:#e5c785;font-size:16px;font-weight:800;letter-spacing:4px}
.jq-dice-round{display:flex;flex-direction:column;gap:6px}
.jq-dice-round-tag{font-size:11px;letter-spacing:2px;color:#9fb2a3}
.jq-dice-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;min-width:min(340px,82vw)}
.jq-dice-rows li{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #3f5951;border-radius:12px;background:#1b352e}
.jq-dice-rows li.is-past{opacity:.55}
.jq-dice-rows li.is-first{border-color:#ffdda1;background:#2b4839;opacity:1}
.jq-dice-seat{flex:0 0 auto;width:9px;height:9px;border-radius:50%}
.jq-dice-army{min-width:46px;font-size:14px;letter-spacing:2px}
.jq-dice-hand{display:flex;gap:8px;margin-left:auto}
.jq-die{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:2px;width:34px;height:34px;padding:5px;border-radius:8px;background:linear-gradient(#fffdf2,#e3d9bd);box-shadow:inset 0 -2px 0 #bfb392,0 3px 8px #0007}
.jq-die i{border-radius:50%;background:transparent}
.jq-die i.is-on{background:#26382f}
.jq-die.is-rolling{animation:jqDieShake .18s linear infinite}
@keyframes jqDieShake{0%{transform:translate(0,0) rotate(0)}25%{transform:translate(-2px,2px) rotate(-9deg)}50%{transform:translate(2px,-2px) rotate(7deg)}75%{transform:translate(-2px,-1px) rotate(-4deg)}100%{transform:translate(0,0) rotate(0)}}
.jq-dice-rows strong{min-width:30px;font-family:Georgia,serif;font-size:20px;color:#e5d09c;text-align:right}
.jq-dice-msg{min-height:20px;font-size:13px;letter-spacing:1px;color:#e9e2c9;text-align:center}
@media(max-width:600px){.jq-dice{padding:14px}.jq-dice-card{gap:12px;padding:20px 16px}.jq-dice-title{font-size:14px;letter-spacing:2px}.jq-die{width:28px;height:28px;padding:4px}.jq-dice-round{width:100%}.jq-dice-rows{gap:8px;min-width:0}.jq-dice-msg{font-size:12px}}

/* Touch browsers may keep :hover latched after a tap. Reserve hover feedback
   for mouse-like pointers; touch controls use a brief :active state instead. */
.jq-game button,.jq-game a{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.jq-game button{-webkit-user-select:none;user-select:none}
@media (hover:none),(pointer:coarse){
 .jq-game button:hover:not(.jq-primary):not(.jq-mode-option){background:#253e35;border-color:#607163}
 .jq-game button.jq-primary:hover{background:linear-gradient(120deg,#dfc589,#b69c5e);border-color:#f2d799}
 .jq-game .jq-mode-option:hover{background:#e9e4d5;border-color:#b9bfae}
 .jq-game .jq-mode-option.is-active:hover{border:2px solid #34745a;background:#dcecdf}
 .jq-game button:active:not(:disabled){filter:brightness(.92)}
}
</style>
