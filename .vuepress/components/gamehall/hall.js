// ============================================================
// 联机大厅（gamehall/hall.js）
// ------------------------------------------------------------
// 所有游戏共用一个大厅（服务端全局限 20 房）：
//   · 房间列表（gameType 徽章 + 人数 + 状态），5s 自动刷新；
//   · 建房：四种游戏都在大厅内完成（选边 / 思考时长 / 麻将房规），
//     麻将建好后整页跳麻将页直接进入等待室（凭据同房自动回原座位）；
//   · 坐下：五子棋 / 象棋房就地进入联机房间（gomoku|xiangqi/remote.js），
//     麻将房整页跳转到麻将页（普通 a 跳转，viewport-fit=cover 依赖）；
//   · ?room=CODE 分享链接：按游戏类型分发到对应房间；
//   · 刷新 / 断线凭 resumeToken 回到原座位（net-client 自动重连）。
// ============================================================

import {
  NetClient,
  loadDisplayName,
  saveDisplayName,
  loadCredential,
  saveCredential,
  clearCredential,
  errorText
} from '../mahjong/multiplayer/net-client.js'
import { enterGomokuRoom } from '../gomoku/remote.js'
import { enterXiangqiRoom } from '../xiangqi/remote.js'
import { enterJunqiRoom } from '../junqi/remote.js'
import {
  TIMEOUT_VALUES,
  fmtTimeout,
  segHtml,
  stepperHtml,
  ctlValue,
  handleCtlClick
} from './controls.js'

const GAMES = {
  mahjong: { name: '四川麻将', icon: '🀄', seats: 4 },
  gomoku: { name: '五子棋', icon: '⚫', seats: 2 },
  xiangqi: { name: '中国象棋', icon: '<span class="gh-ico-xq">♞</span>', seats: 2 },
  junqi: { name: '四国军棋', icon: '🎖', seats: 4 }
}
// 就地进房（不跳页）的游戏 → 房间入口
const ENTER = { gomoku: enterGomokuRoom, xiangqi: enterXiangqiRoom, junqi: enterJunqiRoom }
const MAHJONG_PAGE = '/blogs/other/mahjong_game.html'
// 开关 chips（麻将房规）；封顶番数档位（与麻将页建房表单一致）
const ON_OFF = [{ value: 'on', label: '开' }, { value: 'off', label: '关' }]
const CAP_VALUES = [2, 3, 4, 5, 6]
const fmtCap = v => v + ' 番'

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]))
}

// 随机昵称：霸气池（单名 + 前缀×主体组合，共 160+ 种），告别「棋友9049」的路人感。
// 撞名无碍——服务端按 playerId 区分座位，昵称只是展示。
const EPIC_SOLO = [
  '独孤求败', '东方不败', '常胜将军', '国士无双', '神机妙算', '运筹帷幄',
  '决胜千里', '横扫千军', '一夫当关', '万夫莫开', '棋圣再世', '落子无悔',
  '鬼手佛心', '屠龙圣手', '残局宗师', '布阵鬼才', '军神降临', '弈林盟主',
  '天元一击', '逆转之王', '翻盘魔王', '百胜刀客', '智珠在握', '算无遗策'
]
const EPIC_PREFIX = ['狂', '傲', '冷面', '无敌', '绝世', '铁血', '雷霆', '疾风', '神算', '暗夜', '锦衣', '逍遥']
const EPIC_BODY = ['棋圣', '将军', '国手', '棋魔', '杀神', '谋士', '统帅', '棋宗', '弈仙', '军神', '棋狂', '圣手']
function randomName() {
  const pick = arr => arr[(Math.random() * arr.length) | 0]
  return Math.random() < 0.5 ? pick(EPIC_SOLO) : pick(EPIC_PREFIX) + pick(EPIC_BODY)
}

export default class GameHall {
  constructor(root) {
    this.root = root
    this.http = new NetClient({}) // 仅用其 HTTP 能力（大厅列表 / 建房 / 加入）
    this.rooms = []
    this.session = null // { net, remote } 当前所在的五子棋房间
    this._refreshTimer = null
    this._createOpen = false
  }

  mount() {
    this._renderShell()
    this._applyGameParam()
    this._bindStatic()
    this.refreshRooms()
    this._refreshTimer = setInterval(() => {
      if (!this.session) this.refreshRooms(true)
    }, 5000)
    this._handleShareLink()
    return this
  }

  /** ?game=xxx：从某个游戏页进来时预选该游戏，并直接展开建房面板（进来就是要建房的） */
  _applyGameParam() {
    let game = null
    try {
      game = new URL(location.href).searchParams.get('game')
    } catch (e) {
      /* 忽略异常 URL 环境 */
    }
    if (!game || !GAMES[game]) return
    this._syncCreateGame(game)
    this.$create.hidden = false
    this.root.querySelector('[data-gh="create-open"]').hidden = true
  }

  destroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer)
    if (this.session) {
      try {
        this.session.remote.destroy()
        this.session.net.close()
      } catch (e) {
        /* 忽略 */
      }
      this.session = null
    }
    this.root.innerHTML = ''
  }

  // ---------- 骨架 ----------

  _renderShell() {
    const name = esc(loadDisplayName() || '')
    this.root.innerHTML =
      '<div class="gh-lobby" data-gh-lobby>' +
      '  <div class="gh-topbar">' +
      '    <div class="gh-title">🌐 联机大厅</div>' +
      '    <div class="gh-name-row">' +
      '      <input class="gh-name" data-gh-name maxlength="12" placeholder="你的昵称" value="' + name + '"' +
      '        enterkeyhint="done" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '      <button type="button" class="gh-btn" data-gh="refresh">刷新</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="gh-resume" data-gh-resume hidden></div>' +
      '  <div class="gh-actions">' +
      '    <button type="button" class="gh-btn gh-btn-primary" data-gh="create-open">＋ 创建房间</button>' +
      '    <div class="gh-join">' +
      '      <input class="gh-code" data-gh-code maxlength="6" placeholder="输入房号"' +
      '        enterkeyhint="go" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false">' +
      '      <button type="button" class="gh-btn" data-gh="join">坐下</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="gh-create" data-gh-create hidden>' +
      '    <div class="gh-create-game">' +
      '      <button type="button" data-cgame="gomoku" class="active">⚫ 五子棋</button>' +
      '      <button type="button" data-cgame="xiangqi"><span class="gh-ico-xq">♞</span> 中国象棋</button>' +
      '      <button type="button" data-cgame="junqi">🎖 四国军棋</button>' +
      '      <button type="button" data-cgame="mahjong">🀄 四川麻将</button>' +
      '    </div>' +
      '    <div class="gh-create-opts" data-gh-opts-gomoku>' +
      '      <span class="gh-field">选边 ' +
      segHtml('hostSide', [{ value: 'black', label: '执黑（先手）' }, { value: 'white', label: '执白（后手）' }], 'black') +
      '</span>' +
      '      <span class="gh-field">思考时长 ' + stepperHtml('turnTimeoutSeconds', TIMEOUT_VALUES, 20, fmtTimeout) + '</span>' +
      '    </div>' +
      '    <div class="gh-create-opts" data-gh-opts-xiangqi hidden>' +
      '      <span class="gh-field">选边 ' +
      segHtml('hostSide', [{ value: 'red', label: '执红（先手）' }, { value: 'black', label: '执黑（后手）' }], 'red') +
      '</span>' +
      '      <span class="gh-field">思考时长 ' + stepperHtml('turnTimeoutSeconds', TIMEOUT_VALUES, 20, fmtTimeout) + '</span>' +
      '    </div>' +
      '    <div class="gh-create-opts" data-gh-opts-junqi hidden>' +
      '      <span class="gh-field">思考时长 ' + stepperHtml('turnTimeoutSeconds', TIMEOUT_VALUES, 20, fmtTimeout) + '</span>' +
      '      <div class="gh-hint">4 人 2v2，对家为队友；只能看到自己的棋子，布阵完成后掷骰定先手</div>' +
      '    </div>' +
      '    <div class="gh-create-opts" data-gh-opts-mahjong hidden>' +
      '      <span class="gh-field">换三张 ' + segHtml('swapThree', ON_OFF, 'on') + '</span>' +
      '      <span class="gh-field">幺鸡赖子 ' + segHtml('yaojiEnabled', ON_OFF, 'off') + '</span>' +
      '      <span class="gh-field">AI 提示 ' + segHtml('assist', ON_OFF, 'on') + '</span>' +
      '      <span class="gh-field">封顶 ' + stepperHtml('capFan', CAP_VALUES, 3, fmtCap) + '</span>' +
      '    </div>' +
      '    <div class="gh-create-btns">' +
      '      <button type="button" class="gh-btn gh-btn-primary" data-gh="create-go">创建</button>' +
      '      <button type="button" class="gh-btn" data-gh="create-cancel">取消</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="gh-list-meta" data-gh-meta></div>' +
      '  <div class="gh-list" data-gh-list></div>' +
      '</div>' +
      '<div class="gh-room" data-gh-room hidden></div>' +
      '<div class="gh-toast" data-gh-toast hidden></div>'

    this.$lobby = this.root.querySelector('[data-gh-lobby]')
    this.$room = this.root.querySelector('[data-gh-room]')
    this.$list = this.root.querySelector('[data-gh-list]')
    this.$meta = this.root.querySelector('[data-gh-meta]')
    this.$toast = this.root.querySelector('[data-gh-toast]')
    this.$resume = this.root.querySelector('[data-gh-resume]')
    this.$create = this.root.querySelector('[data-gh-create]')
    this.createGame = 'gomoku'
  }

  _bindStatic() {
    this.root.addEventListener('click', ev => {
      // 分段 chips / 步进器（建房面板；值在创建时读取，无需 onChange）
      if (handleCtlClick(ev, null)) return
      const t = ev.target.closest('[data-gh]')
      if (!t) return
      const act = t.getAttribute('data-gh')
      switch (act) {
        case 'refresh':
          this.refreshRooms()
          break
        case 'create-open':
          this.$create.hidden = false
          t.hidden = true
          break
        case 'create-cancel':
          this.$create.hidden = true
          this.root.querySelector('[data-gh="create-open"]').hidden = false
          break
        case 'create-go':
          this._createRoom()
          break
        case 'join':
          this._joinByCode(t)
          break
        case 'sit':
          this._sit(t.getAttribute('data-code'), t.getAttribute('data-game'), t)
          break
        case 'resume':
          this._resume()
          break
        case 'resume-dismiss':
          clearCredential()
          this.$resume.hidden = true
          break
      }
    })
    // 建房游戏切换（房间列表不做筛选：全服最多 20 房，卡片自带游戏徽章，一屏看完）
    this.root.querySelector('.gh-create-game').addEventListener('click', ev => {
      const t = ev.target.closest('[data-cgame]')
      if (!t) return
      this._syncCreateGame(t.getAttribute('data-cgame'))
    })
    // 昵称持久化；回车 = 完成输入（收起手机键盘，顺带触发 change 保存）
    const nameInput = this.root.querySelector('[data-gh-name]')
    nameInput.addEventListener('change', () => saveDisplayName(nameInput.value.trim()))
    nameInput.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') nameInput.blur()
    })
    // 房号输入大写
    const codeInput = this.root.querySelector('[data-gh-code]')
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    })
    codeInput.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') this._joinByCode(codeInput)
    })

    this._renderResumeBanner()
  }

  _displayName() {
    const input = this.root.querySelector('[data-gh-name]')
    let name = (input.value || '').trim()
    if (!name) {
      name = randomName()
      input.value = name
    }
    saveDisplayName(name)
    return name
  }

  /** 同步建房面板的游戏选中态 + 规则面板显隐（筛选 tab 与建房 chips 共用） */
  _syncCreateGame(game) {
    this.createGame = game
    for (const b of this.root.querySelectorAll('[data-cgame]')) {
      b.classList.toggle('active', b.getAttribute('data-cgame') === game)
    }
    for (const g of Object.keys(GAMES)) {
      const panel = this.root.querySelector('[data-gh-opts-' + g + ']')
      if (panel) panel.hidden = game !== g
    }
  }

  // ---------- 房间列表 ----------

  async refreshRooms(quiet) {
    try {
      const data = await this.http.listRooms()
      this.rooms = data.rooms || []
      this.$meta.textContent = '全服房间 ' + (data.activeRooms || 0) + ' / ' + (data.maxRooms || 20)
      this._renderList()
    } catch (e) {
      if (!quiet) this._toast(errorText(e.errorCode))
    }
  }

  /**
   * 只重绘房间列表容器，骨架（昵称 / 房号输入框）不动；内容没变时连 DOM 都不碰。
   * 大厅每 5 秒轮询一次——若整块重建，输入框会被销毁，手机键盘跟着收起、
   * 已输入内容被清空（麻将大厅踩过的坑，见 mahjong/multiplayer/lobby.js 同名注释）。
   */
  _renderList() {
    const rooms = this.rooms
    if (!rooms.length) {
      if (this._listHtml !== '<empty>') {
        this.$list.innerHTML = '<div class="gh-empty">暂时没有房间，点上方「创建房间」开一局吧</div>'
        this._listHtml = '<empty>'
      }
      return
    }
    const statusText = { WAITING: '等待中', PLAYING: '对局中', FINISHED: '已结束' }
    const html = rooms
      .map(r => {
        const g = GAMES[r.gameType] || { name: r.gameType, icon: '🎮', seats: r.seatsPerRoom }
        const canSit = r.status === 'WAITING' && r.humanCount < r.seatsPerRoom
        return (
          '<div class="gh-card">' +
          '  <div class="gh-card-game">' + g.icon + '</div>' +
          '  <div class="gh-card-body">' +
          '    <div class="gh-card-title">' + g.name + ' <b class="gh-card-code">' + esc(r.roomCode) + '</b></div>' +
          '    <div class="gh-card-sub">' +
          '      <span class="gh-pill">' + r.humanCount + '/' + r.seatsPerRoom + ' 人</span>' +
          (r.aiCount ? '<span class="gh-pill">AI × ' + r.aiCount + '</span>' : '') +
          '<span class="gh-pill gh-st-' + r.status + '">' + (statusText[r.status] || r.status) + '</span>' +
          (r.round > 1 ? '<span class="gh-pill">第 ' + r.round + ' 局</span>' : '') +
          '    </div>' +
          '  </div>' +
          (canSit
            ? '<button type="button" class="gh-btn gh-btn-primary gh-card-sit" data-gh="sit" data-code="' +
              esc(r.roomCode) + '" data-game="' + esc(r.gameType) + '">坐下</button>'
            : '<span class="gh-card-full">' + (r.status === 'WAITING' ? '已满' : statusText[r.status] || '') + '</span>') +
          '</div>'
        )
      })
      .join('')
    if (html !== this._listHtml) {
      this.$list.innerHTML = html
      this._listHtml = html
    }
  }

  // ---------- 建房 / 加入 ----------

  async _createRoom() {
    if (this.createGame === 'mahjong') return this._createMahjongRoom()
    const gameType = this.createGame
    if (!ENTER[gameType]) return this._toast('该游戏暂未开放在线房间')
    const btn = this.root.querySelector('[data-gh="create-go"]')
    btn.disabled = true
    try {
      const optsRoot = this.root.querySelector('[data-gh-opts-' + gameType + ']')
      // 联机以人对人为主：AI 难度固定 medium（补位 / 托管同档），军棋固定四暗，
      // 均走服务端默认值，建房只带选边与思考时长
      const val = name => ctlValue(optsRoot, name)
      const payload = {
        displayName: this._displayName(),
        gameType,
        turnTimeoutSeconds: Number(val('turnTimeoutSeconds'))
      }
      if (val('hostSide')) payload.hostSide = val('hostSide')
      const data = await this.http.createRoom(payload)
      await this._enterOnline(data, gameType)
    } catch (e) {
      this._toast(errorText(e.errorCode, e.message))
    } finally {
      btn.disabled = false
    }
  }

  /**
   * 麻将房：规则项与麻将页建房表单一致（换三张 / 幺鸡赖子 / AI 提示 / 封顶番数），
   * 在大厅直接创建；建好后存凭据并整页跳麻将页 ?room=CODE ——
   * 麻将页 lobby 发现凭据同房会直接 _resume() 进等待室，无需再点任何按钮。
   */
  async _createMahjongRoom() {
    const btn = this.root.querySelector('[data-gh="create-go"]')
    btn.disabled = true
    try {
      const optsRoot = this.root.querySelector('[data-gh-opts-mahjong]')
      const on = name => ctlValue(optsRoot, name) === 'on'
      const data = await this.http.createRoom({
        displayName: this._displayName(),
        gameType: 'mahjong',
        rules: {
          swapThree: on('swapThree'),
          yaojiEnabled: on('yaojiEnabled'),
          assist: on('assist'),
          capFan: Number(ctlValue(optsRoot, 'capFan')) || 3
        }
      })
      const p = data.player
      saveCredential({
        roomId: p.roomId,
        roomCode: p.roomCode,
        playerId: p.playerId,
        resumeToken: p.resumeToken,
        seatIndex: p.seatIndex,
        displayName: p.displayName,
        gameType: 'mahjong'
      })
      // 整页跳转（麻将页 viewport-fit=cover 依赖 HTML 解析阶段生效）
      location.href = MAHJONG_PAGE + '?room=' + encodeURIComponent(p.roomCode)
    } catch (e) {
      this._toast(errorText(e.errorCode, e.message))
      btn.disabled = false
    }
  }

  async _joinByCode(el) {
    const code = String(this.root.querySelector('[data-gh-code]').value || '').trim().toUpperCase()
    if (!code) return this._toast('请输入房号')
    let room
    try {
      const data = await this.http.getRoom(code)
      room = data.room
    } catch (e) {
      return this._toast(errorText(e.errorCode))
    }
    this._sit(room.roomCode, room.gameType, el)
  }

  async _sit(code, gameType, el) {
    if (gameType === 'mahjong') {
      location.href = MAHJONG_PAGE + '?room=' + encodeURIComponent(code)
      return
    }
    if (!ENTER[gameType]) return this._toast('该游戏暂未开放在线房间')
    if (el) el.disabled = true
    try {
      const data = await this.http.joinRoom({ roomCode: code, displayName: this._displayName() })
      await this._enterOnline(data, gameType)
    } catch (e) {
      this._toast(errorText(e.errorCode, e.message))
      if (el) el.disabled = false
    }
  }

  // ---------- 进入联机房间（五子棋 / 象棋就地挂载，共用一个套间容器） ----------

  async _enterOnline(data, gameType) {
    const { room, player } = data
    const cred = {
      roomId: player.roomId,
      roomCode: player.roomCode,
      playerId: player.playerId,
      resumeToken: player.resumeToken,
      seatIndex: player.seatIndex,
      displayName: player.displayName,
      gameType
    }
    this.$lobby.hidden = true
    this.$room.hidden = false
    this.$room.innerHTML = ''
    try {
      this.session = await ENTER[gameType](this.$room, {
        room,
        player,
        cred,
        onExit: () => this._leaveRoom()
      })
    } catch (e) {
      this.$room.hidden = true
      this.$lobby.hidden = false
      this._toast(errorText(e.errorCode, '连接失败，请重试'))
      throw e
    }
  }

  _leaveRoom() {
    if (this.session) {
      try {
        this.session.net.close()
      } catch (e) {
        /* 忽略 */
      }
      this.session = null
    }
    this.$room.hidden = true
    this.$room.innerHTML = ''
    this.$lobby.hidden = false
    this.$create.hidden = true
    this.root.querySelector('[data-gh="create-open"]').hidden = false
    // 清掉地址栏房号，避免刷新又自动进房
    try {
      const u = new URL(location.href)
      u.searchParams.delete('room')
      history.replaceState(null, '', u.toString())
    } catch (e) {
      /* 忽略 */
    }
    this._renderResumeBanner()
    this.refreshRooms()
  }

  // ---------- 分享链接 / 断线恢复 ----------

  async _handleShareLink() {
    let code = ''
    try {
      code = (new URLSearchParams(location.search).get('room') || '').trim().toUpperCase()
    } catch (e) {
      return
    }
    if (!code) return
    // 有凭据且同房 → 直接续上
    const cred = loadCredential()
    if (cred && cred.roomCode === code && ENTER[cred.gameType]) return this._resume()
    let room
    try {
      const data = await this.http.getRoom(code)
      room = data.room
    } catch (e) {
      return this._toast('房间不存在或已解散')
    }
    if (room.gameType === 'mahjong') {
      location.href = MAHJONG_PAGE + '?room=' + encodeURIComponent(code)
      return
    }
    this._sit(code, room.gameType, null)
  }

  _renderResumeBanner() {
    const cred = loadCredential()
    if (!cred || !cred.roomCode) {
      this.$resume.hidden = true
      return
    }
    const g = GAMES[cred.gameType]
    this.$resume.hidden = false
    this.$resume.innerHTML =
      '<span>检测到未退出的' + (g ? g.name : '') + '房间 <b>' +
      esc(cred.roomCode) + '</b></span>' +
      '<button type="button" class="gh-btn gh-btn-primary" data-gh="resume">回到房间</button>' +
      '<button type="button" class="gh-btn" data-gh="resume-dismiss">忽略</button>'
  }

  async _resume() {
    const cred = loadCredential()
    if (!cred) return
    if (!ENTER[cred.gameType]) {
      location.href = MAHJONG_PAGE + '?room=' + encodeURIComponent(cred.roomCode || '')
      return
    }
    this.$lobby.hidden = true
    this.$room.hidden = false
    this.$room.innerHTML = ''
    try {
      this.session = await ENTER[cred.gameType](this.$room, {
        room: { roomCode: cred.roomCode },
        player: { playerId: cred.playerId, roomCode: cred.roomCode, seatIndex: cred.seatIndex },
        cred,
        onExit: () => this._leaveRoom()
      })
    } catch (e) {
      this.$room.hidden = true
      this.$lobby.hidden = false
      clearCredential()
      this._renderResumeBanner()
      this._toast('回房间失败：' + errorText(e.errorCode, '凭据已失效'))
    }
  }

  _toast(text) {
    this.$toast.textContent = text
    this.$toast.hidden = false
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => {
      this.$toast.hidden = true
    }, 2400)
  }
}

