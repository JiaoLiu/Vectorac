import * as E from './engine.mjs'
import { HANDS, JOKERS, TAROTS, SPECTRALS, VOUCHERS, BOSSES, DECKS, STAKES, SUITS, SUIT_NAMES, ENHANCEMENTS, EDITIONS, byId } from './catalog.mjs'
import { playingCard, jokerArt, consumableArt, packArt } from './art.mjs'

const SAVE='vectorac.balatro.run.v3', SETTINGS='vectorac.balatro.settings.v3'
const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const num=value=>!Number.isFinite(value)?'0':Math.abs(value)>=1e9?value.toExponential(2):new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value)
const button=(action,label,cls='',disabled=false,extra='')=>`<button type="button" data-action="${action}" class="bp-btn ${cls}" ${disabled?'disabled':''} ${extra}>${label}</button>`
const packNames={joker:'小丑包',planet:'天体包',tarot:'秘术包',standard:'标准包',spectral:'幻灵包'}
const tagNames={money:'经济标签 · 获得 $15',rare:'稀有标签 · 下个商店免费稀有小丑',hands:'便利标签 · 下轮出牌 +3',discards:'垃圾标签 · 下轮弃牌 +3',free:'优惠标签 · 下个商店卡牌免费',double:'双倍标签'}
const rankName=c=>({11:'J',12:'Q',13:'K',14:'A'}[c.rank]||c.rank)
const cardName=c=>`${SUIT_NAMES[c.suit]} ${rankName(c)}`
const safeRead=key=>{try{return localStorage.getItem(key)}catch(_){return null}}

class Sound {
  constructor(settings){this.settings=settings;this.ctx=null;this.timer=null;this.step=0;this.nodes=new Set()}
  unlock(){
    try{if(!this.ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;this.ctx=new Audio();this.master=this.ctx.createGain();this.master.gain.value=.22;this.master.connect(this.ctx.destination)}if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{})}catch(_){}
  }
  note(freq,length=.1,volume=.18,type='triangle',delay=0){
    if(!this.ctx||this.ctx.state!=='running')return
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime+delay
    o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+length)
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+length+.02);this.nodes.add(o)
    o.onended=()=>{o.disconnect();g.disconnect();this.nodes.delete(o)}
  }
  fx(kind,index=0){if(!this.settings.sound)return;this.unlock();if(kind==='coin'){[523,659,784].forEach((f,i)=>this.note(f,.19,.12,'triangle',i*.065))}else if(kind==='score')this.note(260*Math.pow(1.05946,index%18),.11,.16);else if(kind==='deal')this.note(100,.055,.1,'sawtooth');else this.note(390,.055,.10)}
  music(active){
    clearInterval(this.timer);this.timer=null
    if(!active||!this.settings.music||document.hidden)return
    this.unlock()
    const tick=()=>{const chords=[[146.83,174.61,220,293.66],[130.81,164.81,196,261.63],[116.54,146.83,174.61,233.08],[130.81,164.81,220,261.63]],ch=chords[Math.floor(this.step/16)%4];this.note(ch[this.step%4]*(this.step%8===7?2:1),.45,.055,'triangle');if(this.step%4===0)this.note(ch[0]/2,.65,.13,'sine');this.step++}
    tick();this.timer=setInterval(tick,230)
  }
  destroy(){clearInterval(this.timer);this.nodes.forEach(o=>{try{o.stop()}catch(_){}});if(this.ctx)this.ctx.close().catch(()=>{});this.ctx=null}
}

export default class PokerTable {
  constructor(root){
    this.root=root;this.state=null;this.saved=E.restore(safeRead(SAVE));this.settings={sound:true,music:false,fast:false}
    try{Object.assign(this.settings,JSON.parse(safeRead(SETTINGS)||'{}'))}catch(_){}
    this.audio=new Sound(this.settings);this.modal=null;this.busy=false;this.immersive=false;this.destroyed=false;this.timers=new Set();this.seed='';this.deckType='red';this.sort='rank';this.toast='';this.anim=null
    this.stake=0;this.marker=document.createComment('balatro-position');root.parentNode.insertBefore(this.marker,root)
    this.onClick=this.click.bind(this);this.onKey=this.key.bind(this);this.onDouble=e=>e.preventDefault()
    this.onVisibility=()=>this.audio.music(!!this.state&&!document.hidden)
    this.onFull=()=>{if(this.immersive&&!document.fullscreenElement&&!document.webkitFullscreenElement&&this.nativeFullscreen)this.exitFullscreen(false)}
    root.addEventListener('click',this.onClick);root.addEventListener('dblclick',this.onDouble);document.addEventListener('keydown',this.onKey);document.addEventListener('visibilitychange',this.onVisibility);document.addEventListener('fullscreenchange',this.onFull);document.addEventListener('webkitfullscreenchange',this.onFull)
    this.render()
  }
  later(fn,ms){const t=setTimeout(()=>{this.timers.delete(t);if(!this.destroyed)fn()},ms);this.timers.add(t);return t}
  persist(){
    try{if(this.state)localStorage.setItem(SAVE,JSON.stringify(this.state));localStorage.setItem(SETTINGS,JSON.stringify(this.settings));this.saved=this.state?E.clone(this.state):this.saved}
    catch(_){this.toast='浏览器未允许保存进度，请不要关闭本页'}
  }
  transact(fn){const draft=E.clone(this.state);draft.hand.sort(this.sort==='rank'?(a,b)=>b.rank-a.rank||a.suit-b.suit:(a,b)=>a.suit-b.suit||b.rank-a.rank);const result=fn(draft);this.state=draft;this.persist();return result}
  fullscreen(){
    if(this.immersive)return
    this.oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.appendChild(this.root);this.immersive=true;this.root.classList.add('bp-fullscreen')
    const request=this.root.requestFullscreen||this.root.webkitRequestFullscreen
    if(request)try{const result=request.call(this.root);if(result&&result.then)result.then(()=>{this.nativeFullscreen=true}).catch(()=>{this.nativeFullscreen=false});else this.nativeFullscreen=true}catch(_){this.nativeFullscreen=false}
  }
  exitFullscreen(native=true){
    this.immersive=false;this.nativeFullscreen=false;this.root.classList.remove('bp-fullscreen');document.body.style.overflow=this.oldOverflow||''
    if(this.marker.parentNode)this.marker.parentNode.insertBefore(this.root,this.marker.nextSibling)
    if(native&&(document.fullscreenElement===this.root||document.webkitFullscreenElement===this.root))try{const p=(document.exitFullscreen||document.webkitExitFullscreen).call(document);if(p&&p.catch)p.catch(()=>{})}catch(_){}
    this.render()
  }
  start(resume=false){
    this.audio.unlock();this.state=resume&&this.saved?E.clone(this.saved):E.newRun(this.seed||Math.random().toString(36).slice(2,10).toUpperCase(),this.deckType,this.stake)
    this.modal=null;this.busy=false;this.anim=null;this.fullscreen();this.persist();this.render();this.audio.music(true)
  }
  notify(message){this.toast=message;this.render();this.later(()=>{if(this.toast===message){this.toast='';const t=this.root.querySelector('.bp-toast');if(t)t.remove()}},3500)}
  key(e){
    if(!this.state||!this.immersive&&!this.root.contains(document.activeElement)||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return
    if(e.key==='Escape'){if(this.modal){e.preventDefault();this.modal=null;this.render()}return}
    if(this.busy||this.modal)return
    if(/^[1-9]$/.test(e.key)&&this.state.phase==='play'){const c=this.orderedHand()[Number(e.key)-1];if(c){e.preventDefault();this.perform('select',c.uid)}}
    if(e.key==='Enter'&&this.state.phase==='play'){e.preventDefault();this.perform('play')}
    if(e.key.toLowerCase()==='d'&&this.state.phase==='play'){e.preventDefault();this.perform('discard')}
  }
  click(e){
    const b=e.target.closest('[data-action]');if(!b||!this.root.contains(b)||b.disabled)return
    const action=b.dataset.action,uid=Number(b.dataset.uid),id=b.dataset.id
    if(action==='deck-choice'){this.deckType=id;this.seed=(this.root.querySelector('[data-seed]')||{}).value||this.seed;this.render();return}
    if(action==='stake'){this.stake=(this.stake+1)%8;this.seed=(this.root.querySelector('[data-seed]')||{}).value||this.seed;this.render();return}
    if(action==='start'){this.seed=(this.root.querySelector('[data-seed]')||{}).value||this.seed;this.start(false);return}
    if(action==='resume'){this.start(true);return}
    if(action==='fullscreen'){if(this.immersive)this.exitFullscreen();else{this.fullscreen();this.render()}return}
    if(action==='sound'||action==='music'||action==='fast'){this.settings[action]=!this.settings[action];this.audio.unlock();this.audio.music(!!this.state);this.persist();this.render();return}
    if(action==='help'||action==='hands'||action==='deck'||action==='collection'||action==='menu'){this.modal={type:action};this.render();return}
    if(action==='close'){this.modal=null;this.render();return}
    if(action==='info'){this.modal={type:'info',uid};this.render();return}
    if(action==='restart'){this.modal={type:'confirm'};this.render();return}
    if(action==='new-confirm'){this.modal=null;this.state=null;this.saved=null;try{localStorage.removeItem(SAVE)}catch(_){};this.audio.music(false);this.render();return}
    if(this.busy)return
    this.perform(action,uid,id)
  }
  perform(action,uid,id){
    try{
      this.toast=''
      if(action==='select'){E.selectCard(this.state,uid);this.audio.fx('tap');this.render();return}
      if(action==='sort-rank'||action==='sort-suit'){this.sort=action==='sort-rank'?'rank':'suit';this.render();return}
      if(action==='play'){this.animatePlay();return}
      const ops={blind:E.startBlind,skip:E.skipBlind,discard:E.discard,cash:E.cashOut,next:E.nextBlind,reroll:E.rerollShop,boss:E.rerollBoss,endless:E.continueEndless,'pack-skip':E.closePack,buy:s=>E.buy(s,uid),'pack-choose':s=>E.choosePack(s,uid),use:s=>E.use(s,uid),sell:s=>E.sell(s,uid),left:s=>E.reorder(s,uid,-1),right:s=>E.reorder(s,uid,1)}
      if(!ops[action])return
      this.transact(ops[action]);this.modal=null;this.audio.fx(['buy','cash','sell','use'].includes(action)?'coin':'deal')
      if(this.state.notice){this.toast=this.state.notice;delete this.state.notice}
      this.render()
    }catch(error){this.busy=false;this.notify(error.message||'操作失败，请重试')}
  }
  animatePlay(){
    if(this.busy)return
    const before=E.clone(this.state),result=this.transact(E.play)
    this.busy=true;this.anim={before,result,event:result.events[0],index:0};this.render()
    const events=result.events.length>22?result.events.filter((_,i)=>i===0||i===result.events.length-1||i%Math.ceil(result.events.length/20)===0):result.events
    let index=0
    const tick=()=>{
      if(index<events.length){this.anim.event=events[index];this.anim.index=index;this.updateScore(events[index]);this.audio.fx('score',index++);this.later(tick,this.settings.fast?32:95)}
      else {this.updateScore({chips:result.chips,mult:result.mult,source:`+${num(result.total)}`});this.audio.fx('coin');this.later(()=>{this.busy=false;this.anim=null;this.render()},this.settings.fast?80:450)}
    }
    this.later(tick,150)
  }
  updateScore(event){
    const chips=this.root.querySelector('[data-chips]'),mult=this.root.querySelector('[data-mult]'),label=this.root.querySelector('[data-score-event]')
    if(chips)chips.textContent=num(event.chips);if(mult)mult.textContent=num(event.mult);if(label)label.textContent=event.source
    this.root.querySelectorAll('.bp-trigger').forEach(el=>el.classList.remove('bp-trigger'))
    if(event.uid){const el=this.root.querySelector(`[data-visual="${event.uid}"]`);if(el){void el.offsetWidth;el.classList.add('bp-trigger')}}
  }
  orderedHand(){return this.state.hand.slice().sort(this.sort==='rank'?(a,b)=>b.rank-a.rank||a.suit-b.suit:(a,b)=>a.suit-b.suit||b.rank-a.rank)}
  cardButton(c,{selected=false,disabled=false,hidden=false,scoring=false}={}){
    const detail=[c.enh?ENHANCEMENTS[c.enh]:'',c.edition?EDITIONS[c.edition]:'',c.seal?`${{red:'红',blue:'蓝',gold:'金',purple:'紫'}[c.seal]}色蜡封`:''].filter(Boolean).join(' · ')
    return `<button type="button" class="bp-playing ${selected?'bp-selected':''} ${c.edition?'bp-ed-'+c.edition:''} ${!hidden&&this.state&&E.debuffed(this.state,c)?'bp-debuff':''}" data-action="select" data-uid="${c.uid}" data-visual="${c.uid}" ${disabled?'disabled':''} aria-pressed="${selected}" aria-label="${esc(hidden?'背面朝上的牌':cardName(c)+(detail?'，'+detail:''))}" title="${esc(hidden?'背面朝上':cardName(c)+(detail?' · '+detail:''))}">${playingCard(c,hidden)}${!hidden&&detail?`<span class="bp-card-mod">${esc(c.enh?ENHANCEMENTS[c.enh].split(' ')[0]:c.edition?EDITIONS[c.edition].split(' ')[0]:'蜡封')}</span>`:''}${this.state&&this.state.forced===c.uid?'<span class="bp-forced">必须选择</span>':''}</button>`
  }
  itemName(card){return card.kind==='joker'?byId(JOKERS,card.id).name:card.kind==='planet'?byId(HANDS,card.id).planet:card.kind==='voucher'?byId(VOUCHERS,card.id).name:card.kind==='pack'?packNames[card.id]:card.kind==='card'?cardName(card):byId(card.kind==='spectral'?SPECTRALS:TAROTS,card.id).name}
  itemDesc(card){
    if(card.kind==='joker')return byId(JOKERS,card.id).desc
    if(card.kind==='planet'){const h=byId(HANDS,card.id);return `${h.name}升 1 级：+${h.dc} 筹码，+${h.dm} 倍率`}
    if(card.kind==='voucher')return byId(VOUCHERS,card.id).desc
    if(card.kind==='pack')return `${card.id==='joker'?'2':'3'} 张选 1 张${['tarot','planet','spectral'].includes(card.id)?'，立即使用':''}`
    if(card.kind==='card')return [card.enh?ENHANCEMENTS[card.enh]:'标准扑克牌',card.edition?EDITIONS[card.edition]:'',card.seal?'附带蜡封':''].filter(Boolean).join(' · ')
    return byId(card.kind==='spectral'?SPECTRALS:TAROTS,card.id).desc
  }
  art(card,hidden=false){return card.kind==='joker'?jokerArt(card,hidden):card.kind==='pack'?packArt(card.id):card.kind==='card'?playingCard(card):consumableArt(card)}
  itemTile(card,mode='owned'){
    const s=this.state,hidden=mode==='owned'&&s&&s.phase==='play'&&s.blind===2&&s.boss==='acorn'&&card.kind==='joker',name=hidden?'翻面的小丑':this.itemName(card),description=hidden?'琥珀橡果：本轮小丑翻面并打乱':this.itemDesc(card)
    const cost=s?E.itemCost(s,card):0
    return `<div class="bp-item ${card.edition?'bp-ed-'+card.edition:''} ${card.disabled||card.perished?'bp-disabled-joker':''}" data-visual="${card.uid}">
      <button class="bp-item-art" data-action="info" data-uid="${card.uid}" title="${esc(description)}" aria-label="${esc(name+'：'+description)}">${card.kind==='voucher'?`<div class="bp-voucher-art"><span>VOUCHER</span><b>10</b><small>永久升级</small></div>`:this.art(card,hidden)}</button>
      <span class="bp-item-name">${esc(name)}</span>
      ${mode!=='owned'?`<p class="bp-item-desc">${esc(description)}</p>${button(mode==='shop'?'buy':'pack-choose',mode==='shop'?`购买 <b>$${cost}</b>`:card.kind==='joker'||card.kind==='card'?'选择':'使用','bp-gold',this.busy||mode==='shop'&&!E.canPay(s,cost),`data-uid="${card.uid}"`)}`:''}
    </div>`
  }
  entry(){
    const deck=byId(DECKS,this.deckType)
    return `<div class="bp-entry"><div class="bp-entry-top"><span>POKER ROGUELIKE</span>${button('help','玩法说明','bp-quiet')}</div><div class="bp-title-art"><div class="bp-title-card bp-title-left">${playingCard({rank:14,suit:0})}</div><div class="bp-title-card bp-title-right">${playingCard({rank:13,suit:1})}</div><div class="bp-title-joker">${jokerArt({id:'joker'})}</div><div class="bp-title-word"><span>BALATRO</span><h1>小丑牌</h1><p>一手好牌。一个小丑。无限可能。</p></div></div><div class="bp-start-panel"><div class="bp-deck-preview" style="--deck-color:${deck.color}">${playingCard({},true)}<b>${deck.name}</b><span>${deck.desc}</span></div><div class="bp-start-options"><div class="bp-start-stake"><label class="bp-eyebrow">选择起始牌组</label>${button('stake',STAKES[this.stake],'bp-quiet')}</div><div class="bp-deck-choices">${DECKS.map(d=>`<button data-action="deck-choice" data-id="${d.id}" class="${d.id===deck.id?'active':''}" style="--deck-color:${d.color}" title="${esc(d.name+'：'+d.desc)}" aria-label="${d.name}" aria-pressed="${d.id===deck.id}"><i></i></button>`).join('')}</div><label class="bp-seed-label">种子 <input data-seed maxlength="32" placeholder="随机开局（可选）" value="${esc(this.seed)}" /></label><div class="bp-start-buttons">${this.saved?button('resume',`继续游戏 <small>底注 ${this.saved.ante} · $${this.saved.money}</small>`,'bp-blue'):''}${button('start',this.saved?'新一局':'开始游戏','bp-red')}</div><small class="bp-entry-note">开始即全屏 · 随时退出 · 自动保存进度</small></div></div><div class="bp-entry-bottom"><span>♠ ♥ ♣ ♦</span><span>盲注 · 小丑组合 · 商店 · 塔罗 · 星球</span>${button('collection','查看卡牌','bp-quiet')}</div></div>`
  }
  sidebar(s){
    const boss=byId(BOSSES,s.boss),blindName=s.blind===2?boss.name:['小盲注','大盲注'][s.blind]
    const p=this.anim?Object.assign({},this.anim.result,{name:this.anim.result.name}):s.selected.length&&s.phase==='play'?E.preview(s):null
    const chips=this.anim?this.anim.event.chips:p?p.chips:0,mult=this.anim?this.anim.event.mult:p?p.mult:0
    return `<aside class="bp-sidebar"><div class="bp-brand"><b>小丑牌</b><span>BALATRO</span></div><section class="bp-blind-panel"><div class="bp-blind-label"><span class="bp-chip-icon">${s.blind===2?'✦':'$'}</span><b>${blindName}</b></div><small>至少获得</small><strong class="bp-target">${num(E.target(s))}</strong><small>分数 · 奖励 ${'$'.repeat([3,4,5][s.blind])}</small>${s.blind===2?`<p class="bp-boss-rule">${esc(boss.desc)}</p>`:''}</section><div class="bp-round-score"><span>本轮得分</span><b>${num(this.anim?this.anim.before.score:s.score)}</b></div><div class="bp-calculator"><div class="bp-hand-name">${p?p.name:'选择牌型'} ${p?`<small>Lv.${s.levels[p.id]}</small>`:''}</div><div class="bp-equation"><strong data-chips>${num(chips)}</strong><span>×</span><strong data-mult>${num(mult)}</strong></div><small>${this.anim?'正在结算…':'基础筹码 × 基础倍率'}</small></div><div class="bp-counters"><div><span>出牌</span><b class="bp-blue-text">${s.hands}</b></div><div><span>弃牌</span><b class="bp-red-text">${s.discards}</b></div></div><div class="bp-money">$${num(s.money)}</div><div class="bp-progress"><div><span>底注</span><b>${s.ante}<small>/8</small></b></div><div><span>回合</span><b>${s.round}</b></div></div><div class="bp-side-actions">${button('hands','牌型','bp-blue')}${button('menu','选项','bp-red')}</div></aside>`
  }
  inventory(s){
    return `<div class="bp-inventory"><section class="bp-joker-rack"><div class="bp-rack-label"><span>小丑牌 <b>${s.jokers.length}/${E.slots(s)}</b></span><small>从左至右触发 · 点击查看 / 调序</small></div><div class="bp-rack-cards">${s.jokers.map(j=>this.itemTile(j)).join('')}${Array.from({length:Math.max(0,E.slots(s)-s.jokers.length)},()=>'<div class="bp-empty-slot"><span>J</span></div>').join('')}</div></section><section class="bp-consumable-rack"><div class="bp-rack-label"><span>消耗牌 <b>${s.consumables.length}/${E.consumableSlots(s)}</b></span></div><div class="bp-rack-cards">${s.consumables.map(c=>this.itemTile(c)).join('')}${Array.from({length:Math.max(0,E.consumableSlots(s)-s.consumables.length)},()=>'<div class="bp-empty-slot bp-consume-empty"><span>✧</span></div>').join('')}</div></section></div>`
  }
  blindSelection(s){
    return `<div class="bp-select-stage"><div class="bp-stage-heading"><span>底注 ${s.ante}</span><h2>选择你的盲注</h2><p>击败盲注后进入商店；跳过盲注获得标签。</p></div><div class="bp-blind-choices">${[0,1,2].map(i=>{
      const boss=byId(BOSSES,s.boss),active=i===s.blind,done=i<s.blind
      return `<section class="bp-blind-choice ${active?'active':''} ${done?'complete':''} bp-blind-${i}"><div class="bp-blind-choice-head">${i===2?boss.name:['小盲注','大盲注'][i]}</div><div class="bp-blind-token">${done?'✓':i===2?'✦':i===1?'$$':'$'}</div><small>至少获得</small><strong>${num(E.target(s,i))}</strong><span>奖励 ${'$'.repeat([3,4,5][i])}</span><p>${i===2?boss.desc:active?tagNames[E.skipReward(s)]:'击败后进入商店'}</p>${button('blind',done?'已完成':active?'选择盲注':'未解锁',active?'bp-red':'',!active)}${i<2&&active?button('skip','跳过盲注 →','bp-quiet'):''}</section>`
    }).join('')}</div>${s.tags.length?`<div class="bp-tags">${s.tags.map(t=>`<span>${tagNames[t]}</span>`).join('')}</div>`:''}${s.vouchers.includes('director')?button('boss','更换 Boss · $10','bp-quiet',!E.canPay(s,10)):''}</div>`
  }
  hand(s){
    const list=this.orderedHand(),cards=this.anim?this.anim.before.hand.filter(c=>!this.anim.result.cards.some(p=>p.uid===c.uid)):list
    return `<div class="bp-hand-area"><div class="bp-hand-caption"><span>${this.busy?'结算中':s.pack?'选择手牌作为消耗牌目标':`手牌 ${s.hand.length}/${E.handSize(s)} · 已选 ${s.selected.length}/5`}</span><div>${button('sort-rank','点数',this.sort==='rank'?'bp-sort-active':'',this.busy)}${button('sort-suit','花色',this.sort==='suit'?'bp-sort-active':'',this.busy)}</div></div><div class="bp-hand ${cards.length>12?'bp-overfull':''}" style="--hand-count:${Math.max(1,cards.length)}">${cards.map(c=>this.cardButton(c,{selected:s.selected.includes(c.uid),disabled:this.busy||s.phase!=='play'&&!s.pack,hidden:c.hidden})).join('')}</div><div class="bp-play-controls">${button('play','出牌','bp-blue',this.busy||s.phase!=='play'||!s.selected.length||!!s.pack)}<span>${this.busy?'正在计分':s.pack?'先选目标，再点击包中的「使用」':'最多选择 5 张牌'}</span>${button('discard','弃牌','bp-red',this.busy||s.phase!=='play'||!s.selected.length||s.discards<=0||!!s.pack)}</div></div>`
  }
  playStage(s){
    if(this.anim)return `<div class="bp-play-stage"><div class="bp-score-label" data-score-event>${this.anim.result.name}</div><div class="bp-scoring-cards">${this.anim.result.cards.map(c=>this.cardButton(c,{disabled:true})).join('')}</div><span class="bp-stage-hint">扑克牌 → 留手效果 → 小丑牌</span></div>`
    return `<div class="bp-play-stage"><div class="bp-table-emblem">♠<span>PLAY YOUR HAND</span></div>${s.lastResult?`<div class="bp-last-hand"><span>上一手 · ${s.lastResult.name}</span><b>+${num(s.lastResult.total)}</b></div>`:`<p class="bp-stage-hint">选择手牌，组合牌型<br>小丑牌让每一手牌都不一样。</p>`}${s.blind===2?`<div class="bp-live-boss">✦ ${esc(byId(BOSSES,s.boss).desc)}</div>`:''}</div>`
  }
  reward(s){const r=s.roundReward;return `<div class="bp-result"><span class="bp-eyebrow">BLIND DEFEATED</span><h2>盲注击破</h2><div class="bp-result-score">${num(s.score)} <small>分</small></div><div class="bp-receipt"><div><span>盲注奖励</span><b>$${r.reward}</b></div><div><span>剩余出牌</span><b>$${r.hands}</b></div><div><span>利息</span><b>$${r.interest}</b></div>${r.extra?`<div><span>卡牌与牌组奖励</span><b>$${r.extra}</b></div>`:''}<div class="bp-receipt-total"><span>本轮收入</span><b>$${r.total}</b></div></div>${button('cash','领取奖励 →','bp-gold')}<small>奖励已入账，结算不会重复领取。</small></div>`}
  shop(s){
    if(s.pack)return `<div class="bp-shop-stage bp-pack-stage"><div class="bp-stage-heading"><span>BOOSTER PACK</span><h2>${packNames[s.pack.kind]}</h2><p>选择 1 张${['tarot','planet','spectral'].includes(s.pack.kind)?'立即使用':''} · 改牌类需先选择下方目标手牌</p></div><div class="bp-shop-cards">${s.pack.cards.map(c=>this.itemTile(c,'pack')).join('')}</div>${button('pack-skip','跳过补充包','bp-quiet')}</div>`
    return `<div class="bp-shop-stage"><div class="bp-shop-heading"><div><span>SHOP</span><h2>商店</h2></div>${button('next','下一轮 →','bp-red')}${button('reroll',`重掷 <b>$${E.rerollCost(s)}</b>`,'bp-green',!E.canPay(s,E.rerollCost(s)))}</div><div class="bp-shop-shelves"><section><label>卡牌</label><div class="bp-shop-cards">${s.shop.cards.length?s.shop.cards.map(c=>this.itemTile(c,'shop')).join(''):'<p class="bp-sold-out">本批商品已售完</p>'}</div></section><section class="bp-shop-extras"><label>补充包与优惠券</label><div class="bp-shop-cards">${s.shop.packs.map(c=>this.itemTile(c,'shop')).join('')}${s.shop.voucher?this.itemTile(s.shop.voucher,'shop'):''}</div></section></div><div class="bp-shop-tip">小丑槽位 ${s.jokers.length}/${E.slots(s)} · 点击拥有的卡牌可出售 · 每 $5 存款产生 $1 利息</div></div>`
  }
  end(s){const win=s.phase==='won';return `<div class="bp-result"><span class="bp-eyebrow">${win?'YOU WIN!':'GAME OVER'}</span><h2>${win?'底注 8 · 通关！':'本局结束'}</h2><div class="bp-result-score">${num(s.best)}<small>最高单手</small></div><p>${win?'继续挑战无尽模式，看看这副牌的极限。':`本轮得到 ${num(s.score)} 分，还差 ${num(E.target(s)-s.score)} 分。`}</p><div class="bp-receipt"><div><span>底注 / 回合</span><b>${s.ante} / ${s.round}</b></div><div><span>累计出牌</span><b>${s.totalHands}</b></div><div><span>种子</span><b>${esc(s.seed)}</b></div></div>${win?button('endless','继续无尽模式','bp-blue'):''}${button('restart','再来一局','bp-red')}</div>`}
  game(){
    const s=this.state,withHand=(s.phase==='play'||s.pack&&['tarot','spectral'].includes(s.pack.kind)||this.busy)
    const stage=this.busy?this.playStage(s):s.phase==='select'?this.blindSelection(s):s.phase==='play'?this.playStage(s):s.phase==='reward'?this.reward(s):s.phase==='shop'?this.shop(s):this.end(s)
    return `<div class="bp-game"><div class="bp-topbar"><span>♠ <b>小丑牌</b> <small>${esc(byId(DECKS,s.deckType).name)}</small></span><div>${button('menu','≡','bp-icon',false,'aria-label="游戏选项"')}${button('help','?','bp-icon',false,'aria-label="玩法帮助"')}${button('sound',this.settings.sound?'音效 开':'音效 关','bp-quiet')}${button('music',this.settings.music?'♫ 开':'♫ 关','bp-quiet',false,'aria-label="切换音乐"')}${button('fullscreen',this.immersive?'退出全屏':'进入全屏','bp-quiet')}</div></div><div class="bp-table">${this.sidebar(s)}<main class="bp-main">${this.inventory(s)}<div class="bp-stage ${withHand?'bp-has-hand':''}">${stage}</div>${withHand?this.hand(s):''}<footer class="bp-table-footer"><span>${s.phase==='play'?`牌库 ${s.draw.length} · 已出 ${s.spent.length}`:`种子 ${esc(s.seed)}`}<small> · 自动保存</small></span>${button('deck',`查看牌组 ${s.deck.length} 张`,'bp-quiet')}</footer></main></div></div>`
  }
  findItem(uid){const s=this.state;if(!s)return null;return s.jokers.concat(s.consumables,s.shop?s.shop.cards.concat(s.shop.packs,s.shop.voucher?[s.shop.voucher]:[]):[],s.pack?s.pack.cards:[]).find(c=>c.uid===uid)}
  dialog(){
    const m=this.modal;if(!m)return ''
    let title='',body='',cls=''
    const s=this.state
    if(m.type==='help'){
      title='怎么玩'
      body=`<div class="bp-help-grid"><section><b>01 · 打出牌型</b><p>从手牌选 1～5 张。对子、同花、顺子等决定基础筹码和倍率。只有参与牌型的牌计分；A 为 11 筹码，人头牌为 10。</p></section><section><b>02 · 筹码 × 倍率</b><p>先结算打出的牌，再结算留手效果，最后从左到右触发小丑。把加倍率的小丑放在乘倍率的小丑前面，得分会不同。</p></section><section><b>03 · 构筑你的牌组</b><p>击败盲注获得金钱，商店购买小丑、补充包和永久优惠券。星球提升牌型等级；塔罗和幻灵改变扑克牌。点击卡牌查看说明、使用或出售。</p></section><section><b>04 · 连过 8 个底注</b><p>每个底注有小盲注、大盲注、Boss 盲注。前两个可跳过领取标签，Boss 不能跳过。出牌耗尽且分数不够则本局结束。</p></section></div><div class="bp-help-note"><b>操作</b><p>单击选牌；再次单击取消。手机无需双击。键盘 1～8 选牌，Enter 出牌，D 弃牌。点击小丑可左右移动，调整结算顺序。改牌类消耗牌须先选择手牌目标。</p><p>开始自动请求全屏；不支持系统全屏的设备使用网页全屏。关闭页面后可从首页继续。</p></div>`
    }
    if(m.type==='hands'){
      title='牌型与等级';body=`<div class="bp-hands-table">${HANDS.slice().reverse().map(h=>{const b=s?E.handBase(s,h.id):h;return `<div><b>${h.name}</b><span>Lv.${s?s.levels[h.id]:1}</span><strong class="bp-blue-text">${num(b.chips)}</strong><span>×</span><strong class="bp-red-text">${num(b.mult)}</strong><small>${h.planet}</small></div>`}).join('')}</div><p class="bp-help-note">显示基础分数。计分牌的筹码、增强牌与小丑效果会依次加入。高牌只计算最高点数牌，对子只计算对子牌；石头牌额外计分。</p>`
    }
    if(m.type==='menu'){
      title='游戏选项';body=`<div class="bp-menu-buttons">${button('sound',`音效：${this.settings.sound?'开':'关'}`,'bp-blue')}${button('music',`背景音乐：${this.settings.music?'开':'关'}`,'bp-blue')}${button('fast',`快速结算：${this.settings.fast?'开':'关'}`,'bp-blue')}${button('hands','查看牌型','bp-green')}${button('collection','卡牌图鉴','bp-green')}${button('restart','重新开始','bp-red',this.busy)}</div><p>当前牌组：${byId(DECKS,s.deckType).name}<br>种子：${esc(s.seed)}<br>进度会自动保存在当前浏览器。</p>`
    }
    if(m.type==='confirm'){title='开始新一局？';body=`<p>这会替换当前存档。当前游戏不会继续。</p><div class="bp-menu-buttons">${button('new-confirm','确认重新开始','bp-red',this.busy)}${button('close','返回游戏','bp-blue')}</div>`}
    if(m.type==='deck'){
      title=`完整牌组 · ${s.deck.length} 张`;cls='bp-wide-dialog';body=`<div class="bp-deck-summary">${SUITS.map((suit,i)=>`<span>${suit} ${s.deck.filter(c=>c.suit===i&&c.enh!=='stone').length}</span>`).join('')}<span>石头 ${s.deck.filter(c=>c.enh==='stone').length}</span></div><div class="bp-deck-grid">${s.deck.slice().sort((a,b)=>a.suit-b.suit||b.rank-a.rank).map(c=>`<div class="bp-deck-card" title="${esc(cardName(c))}">${playingCard(c)}</div>`).join('')}</div>`
    }
    if(m.type==='collection'){
      title=`卡牌图鉴 · ${JOKERS.length} 张小丑`;cls='bp-wide-dialog';body=`<p>另含 ${TAROTS.length} 张塔罗、${HANDS.length} 张星球、${SPECTRALS.length} 张幻灵，${VOUCHERS.length} 种优惠券。此处展示当前已实现效果。</p><div class="bp-collection">${JOKERS.map(j=>`<div><div>${jokerArt(j)}</div><b>${j.name}</b><p>${j.desc}</p></div>`).join('')}</div>`
    }
    if(m.type==='info'){
      const card=this.findItem(m.uid);if(!card)return ''
      const ownedJ=s.jokers.some(j=>j.uid===card.uid),ownedC=s.consumables.some(c=>c.uid===card.uid),hidden=ownedJ&&s.phase==='play'&&s.blind===2&&s.boss==='acorn'
      title=hidden?'翻面的小丑':this.itemName(card)
      body=`<div class="bp-info"><div class="bp-info-art">${card.kind==='voucher'?`<div class="bp-voucher-art"><b>$10</b></div>`:this.art(card,hidden)}</div><div><p>${hidden?'琥珀橡果：本轮无法查看小丑正面。':esc(this.itemDesc(card))}</p>${(card.eternal||card.perishable||card.rental)&&!hidden?`<p>${card.eternal?'永恒 · 不可出售 / 摧毁 ':''}${card.perishable?'易腐 · 剩余 '+card.perishable+' 轮 ':''}${card.rental?'租赁 · 每轮 $3':''}</p>`:''}${card.edition&&!hidden?`<p class="bp-edition-label">${EDITIONS[card.edition]}</p>`:''}${card.kind==='joker'&&!hidden?`<small>${['','普通','罕见','稀有','传奇'][byId(JOKERS,card.id).rarity]}小丑</small>${card.value?`<p>当前累计效果数值：<b>${num(card.value)}</b></p>`:''}${['ancient','castle'].includes(card.id)?`<p>本轮花色：${SUITS[card.suit]}</p>`:''}${['idol','mail'].includes(card.id)?`<p>本轮目标：${card.id==='idol'?SUITS[card.suit]:''}${rankName(card)}</p>`:''}${card.id==='toDo'?`<p>本轮目标：${byId(HANDS,card.hand).name}</p>`:''}`:''}${ownedC?button('use','使用','bp-blue',this.busy,`data-uid="${card.uid}"`):''}${ownedJ?`<div class="bp-reorder">${button('left','← 左移','bp-blue',this.busy||s.jokers[0].uid===card.uid,`data-uid="${card.uid}"`)}${button('right','右移 →','bp-blue',this.busy||s.jokers[s.jokers.length-1].uid===card.uid,`data-uid="${card.uid}"`)}</div>`:''}${ownedJ||ownedC?button('sell',`出售 · $${E.sellValue(card)}`,'bp-red',this.busy||!!card.eternal,`data-uid="${card.uid}"`):''}</div></div>`
    }
    return `<div class="bp-modal-backdrop"><section class="bp-dialog ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="bp-dialog-header"><h2>${title}</h2>${button('close','✕','bp-icon',false,'aria-label="关闭"')}</div><div class="bp-dialog-content">${body}</div></section></div>`
  }
  render(){
    if(this.destroyed)return
    this.root.innerHTML=(this.state?this.game():this.entry())+this.dialog()+(this.toast?`<div class="bp-toast" role="status">${esc(this.toast)}</div>`:'')
    this.root.classList.toggle('bp-is-playing',!!this.state);this.root.classList.toggle('bp-is-busy',this.busy)
  }
  destroy(){
    this.destroyed=true;this.persist();this.timers.forEach(t=>clearTimeout(t));this.timers.clear();this.audio.destroy()
    this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('dblclick',this.onDouble);document.removeEventListener('keydown',this.onKey);document.removeEventListener('visibilitychange',this.onVisibility);document.removeEventListener('fullscreenchange',this.onFull);document.removeEventListener('webkitfullscreenchange',this.onFull)
    if(this.immersive)this.exitFullscreen();if(this.marker.parentNode)this.marker.remove()
  }
}
