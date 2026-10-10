// Isolated preview-only acceptance page. Never included in the normal build.
import './app.js'
import {createGame,createAssignedGame,dispatch,playerView,catalog} from './engine.mjs'
import {makeDeck} from './core/catalog.mjs'
import {chooseAI} from './engine.mjs'
import {createSetup} from './setup.mjs'
import {advanceUnavailable,DecisionClock} from './flow.mjs'
const ui=window.__fengshenUI,normalSchedule=ui.schedule.bind(ui)
const audioProof=document.createElement('output');audioProof.hidden=true;audioProof.dataset.qaAudio='[]';document.body.append(audioProof)
const normalIdle=ui.voice.onIdle;ui.voice.onIdle=()=>{audioProof.dataset.qaAudio=JSON.stringify(ui.voice.history);normalIdle()}
const mediaProof=document.createElement('output');mediaProof.hidden=true;document.body.append(mediaProof)
setInterval(()=>{mediaProof.dataset.qaMedia=JSON.stringify({music:ui.music.enabled,paused:ui.music.audio?.paused,time:ui.music.audio?.currentTime,src:ui.music.audio?.getAttribute('src'),fullscreen:!!document.fullscreenElement})},200)
let humanTimer=null
function fixture(heroId='yangjian',role='lord',current=0){
  const s=createGame({heroId,role,seed:17});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.logs=[];s.lastPlayed=null;s.lastEvent=null
  for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}
  return s
}
function card(s,seat,type){const i=s.deck.findIndex(c=>c.type===type);if(i<0)throw Error('Missing fixture '+type);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
function equip(s,seat,type,slot){const c=card(s,seat,type);s.players[seat].hand.pop();s.players[seat].equip[slot]=c;return c}
function step(s,a){const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});if(!r.ok)throw Error(r.error);return r.state}
function scenario(name){
  if(name==='kurou-many'){
    const s=fixture('chenqi');s.players[0].hand.push(...s.deck.splice(0,30));return s
  }
  if(name==='layout-eight'){
    const s=createAssignedGame({roles:['lord','loyal','loyal','rebel','rebel','rebel','rebel','renegade'],heroIds:['yangjian','jifa','nezha','wenzhong','jinling','yuding','yunxiao','shiji'],seed:29})
    s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[]
    for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp}
    for(const [seat,types]of [[0,['qinggang','bagua','chitu','jueying']],[1,['blade','bagua','dayuan','dilu']],[6,['halberd','renwang','zixing','zhuahuang']]])for(const type of types)equip(s,seat,type,catalog.CARDS[type].slot)
    s.players[0].hand.push(...s.deck.splice(0,12));return s
  }
  if(['classic-stars','classic-liuli','classic-yiji','classic-lijian'].includes(name)){
    const ids=name==='classic-stars'?['jiangziya','jifa','nezha','yangjian','jinling']:name==='classic-liuli'?['yunxiao','jifa','nezha','yangjian','jinling']:name==='classic-yiji'?['yuding','jifa','nezha','yangjian','jinling']:['daji','jifa','nezha','yangjian','jinling']
    const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:ids,seed:19})
    if(name==='classic-stars')return s
    s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=name==='classic-lijian'?0:1;s.logs=[]
    for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp}
    if(name==='classic-lijian'){card(s,0,'sha');card(s,0,'shan');card(s,2,'sha');return s}
    card(s,0,'shan');card(s,0,'tao');const attack=card(s,1,'sha');return step(s,{type:'play',as:'sha',ids:[attack.id],targets:[0]})
  }
  if(name==='classic-isis'){
    const s=fixture('isis');s.players[0].hp--;s.players[1].hp--;for(const type of ['sha','shan','draw','bagua','renwang'])card(s,0,type);equip(s,0,'qinggang','weapon');return s
  }
  if(name==='expansion-qixi'){
    const s=fixture('kongxuan');for(const type of ['qinggang','shan','firesha','thundersha','wine','snatch','draw'])card(s,0,type)
    for(const type of ['shan','tao','sha'])card(s,1,type);equip(s,1,'silverlion','armor');return s
  }
  if(name==='expansion-fan'){
    const s=fixture('jinzha');for(const type of ['sha','firesha','thundersha','wine','shan'])card(s,0,type);equip(s,0,'fan','weapon');equip(s,1,'vine','armor');return s
  }
  if(name==='expansion-keji'){
    const s=fixture('duobao');for(let i=0;i<8;i++)card(s,0,'shan');return s
  }
  if(['gods','gods-female','gods-male'].includes(name)){
    const s=fixture(name==='gods'?'artemis':name==='gods-female'?'isis':'apollo')
    for(const [i,id]of ['zeus','sunwukong','athena','odin'].entries()){const p=s.players[i+1];p.heroId=id;p.hp=p.maxHp=catalog.HERO_BY_ID[id].hp+(p.role==='lord'?1:0)}
    for(const type of ['draw','shan','sha','tao','nullify','snatch','dismantle','collateral','halberd','bagua','indulgence','lightning'])card(s,0,type)
    return s
  }
  if(name==='mobile-demo'){
    let s=fixture('yangjian','lord',1);for(const type of ['shan','sha','tao','nullify','draw','snatch','dismantle','collateral','halberd','bagua','indulgence','lightning'])card(s,0,type)
    const attack=card(s,1,'sha');return step(s,{type:'play',ids:[attack.id],as:'sha',targets:[0]})
  }
  if(name==='draw-self'){const s=fixture();card(s,0,'draw');return s}
  if(name==='draw-other'){let s=fixture('yangjian','lord',2);const c=card(s,2,'draw');card(s,0,'nullify');return step(s,{type:'play',as:'draw',ids:[c.id],targets:[]})}
  if(name==='slash-empty'||name==='duel-empty'){const s=fixture();card(s,0,name==='slash-empty'?'sha':'duel');return s}
  if(name==='clock-short'){const s=fixture();card(s,0,'sha');return s}
  if(['judge-lightning','judge-miss','judge-prison'].includes(name)){
    let s=fixture('yangjian','lord',4),type=name==='judge-prison'?'indulgence':'lightning',delay=card(s,0,type);s.players[0].hand.pop();s.players[0].judgment.push(delay)
    const suit=name==='judge-miss'?'heart':'spade',i=s.deck.findIndex(c=>c.suit===suit&&c.rank===5),judge=s.deck.splice(i,1)[0];s.deck.unshift(judge);return step(s,{type:'end'})
  }
  if(name==='delays'){const s=fixture();for(const type of ['lightning','indulgence']){const c=card(s,0,type);s.players[0].hand.pop();s.players[0].judgment.push(c)}card(s,0,'sha');return s}
  if(name==='equipped'){const s=fixture();for(const [type,slot]of [['qinggang','weapon'],['bagua','armor'],['chitu','offenseHorse'],['jueying','defenseHorse']])equip(s,1,type,slot);card(s,0,'savage');card(s,0,'arrows');card(s,0,'harvest');return s}
  if(name==='harvest'){let s=fixture();const c=card(s,0,'harvest');return step(s,{type:'play',as:'harvest',ids:[c.id],targets:[]})}
  if(name==='no-shan'||name==='no-sha'){let s=fixture('yangjian','lord',1),type=name==='no-shan'?'sha':'duel',c=card(s,1,type);return advanceUnavailable(step(s,{type:'play',as:type,ids:[c.id],targets:[0]}),dispatch,playerView)}
  if(name==='draft-lord'||name==='draft-other'){
    for(let seed=1;seed<100;seed++){const setup=createSetup({seed});if((setup.lord===0)===(name==='draft-lord'))return {setup}}
  }
  if(name==='ai')return createGame({heroId:'jinling',role:'lord',seed:270})
  if(name==='slash-self'||name==='slash-other'){
    let s=fixture('yangjian','lord',name==='slash-self'?1:0)
    // Avoid automatic Tieji/weapon triggers: these cases isolate Sha/Shan.
    if(s.players[1].heroId==='machao'){const other=s.players.slice(2).find(p=>p.heroId!=='machao');[s.players[1].heroId,other.heroId]=[other.heroId,s.players[1].heroId]}
    const source=name==='slash-self'?1:0,target=name==='slash-self'?0:1,c=card(s,source,'sha');card(s,target,'shan')
    return name==='slash-self'?step(s,{type:'play',ids:[c.id],as:'sha',targets:[target]}):s
  }
  if(name==='borrow-self'){
    const s=fixture();card(s,0,'collateral');card(s,0,'shan');equip(s,1,'qinggang','weapon');card(s,1,'sha')
    if(s.players[1].heroId==='machao'){const other=s.players.slice(2).find(p=>p.heroId!=='machao');[s.players[1].heroId,other.heroId]=[other.heroId,s.players[1].heroId]}
    return s
  }
  if(['hand6','hand12','hand30','hand60'].includes(name)){const s=fixture();s.players[0].hand.push(...s.deck.splice(0,Number(name.slice(4))));return s}
  if(name==='counter'){
    let s=fixture('jinling','loyal',1);const c=card(s,1,'dismantle');card(s,0,'nullify');card(s,0,'shan');return step(s,{type:'play',ids:[c.id],as:'dismantle',targets:[0]})
  }
  if(name==='draw'){
    const s=fixture('jinling');card(s,0,'draw');card(s,0,'sha');return s
  }
  if(name==='death'||name==='own-death'){
    const s=fixture('yangjian','loyal');const victim=name==='own-death'?s.players[0]:s.players.slice(1).find(p=>p.role!=='lord');victim.alive=false;victim.hp=0;s.current=s.players.find(p=>p.alive).seat;card(s,s.current,'sha');return s
  }
  if(name==='hand'){
    const s=fixture();for(let i=0;i<15;i++)card(s,0,'shan');for(let i=0;i<3;i++)card(s,0,'tao');return s
  }
  if(name==='snatch'||name==='dismantle'){
    let s=fixture();const c=card(s,0,name);card(s,1,'shan');card(s,1,'tao');card(s,1,'sha');equip(s,1,'qinggang','weapon');const delay=card(s,1,'indulgence');s.players[1].hand.pop();s.players[1].judgment.push(delay)
    return step(s,{type:'play',ids:[c.id],as:name,targets:[1]})
  }
  return fixture()
}
const tools=document.createElement('section');tools.className='qa-tools';tools.style='position:fixed;top:0;left:0;right:0;z-index:999;background:#293d46;padding:6px;display:flex;gap:6px;align-items:center;font:11px sans-serif'
// Filled below, then add a realistic mixed-hand mobile showcase option.
tools.innerHTML='<select aria-label="验收场景" style="color:#14242a;background:#eef0db;max-width:180px">'+Object.entries({gods:'众神长名称手机牌桌','gods-female':'伊西斯女声与秘法','gods-male':'阿波罗男声与神谕',table:'普通牌桌',death:'他人阵亡', 'own-death':'自己阵亡',snatch:'顺手选牌',dismantle:'过河选牌',counter:'无懈响应',draw:'集智与女声','draw-self':'自己无中生有摸两张','draw-other':'他人无中生有待无懈',hand:'18张手牌',hand6:'6张手牌',hand12:'12张手牌',hand30:'30张手牌','slash-self':'他人杀你：闪或受伤','slash-other':'你杀他人','slash-empty':'实际出杀：目标无闪','duel-empty':'实际决斗：目标无杀','borrow-self':'借刀指定自己','judge-lightning':'闪电命中翻牌','judge-miss':'闪电未命中翻牌','judge-prison':'画地为牢翻牌',delays:'自己挂雷与画地为牢',equipped:'他人四件装备与全体牌',harvest:'五谷中央选牌','no-shan':'没有闪自动伤害','no-sha':'没有杀决斗伤害','clock-short':'2秒加速超时托管',ai:'完整UI定时器对局','draft-lord':'随机身份：你为主公','draft-other':'随机身份：AI为主公'}).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')+'</select><button style="border:1px solid #d3c09b;padding:5px" data-qa-load>载入验收场景</button>'
const stateProof=document.createElement('output');stateProof.hidden=true;document.body.append(stateProof)
const mobileOption=document.createElement('option');mobileOption.value='mobile-demo';mobileOption.textContent='手机综合：12张手牌与攻击黄线';tools.querySelector('select').append(mobileOption)
for(const [value,label]of [['classic-isis','伊西斯：标准孙尚香完整技能'],['classic-stars','姜子牙：私有推演牌序'],['classic-liuli','云霄：转移攻击'],['classic-yiji','玉鼎：受伤分牌'],['classic-lijian','妲己：两名男性决斗'],['expansion-keji','多宝：标准吕蒙完整蓄牌']]){const option=document.createElement('option');option.value=value;option.textContent=label;tools.querySelector('select').append(option)}
// Retired mixed God/expansion scenarios cannot exercise the original Standard rules.
for(const o of [...tools.querySelector('select').options])if(['gods','gods-female','gods-male','expansion-qixi','expansion-fan'].includes(o.value))o.remove()
const normalRender=ui.render.bind(ui);ui.render=()=>{normalRender();const v=ui.state&&playerView(ui.state,0);stateProof.dataset.qaState=JSON.stringify(v?{pending:v.pending,revision:v.revision,hp:v.players.map(p=>p.hp),hand:v.players[0].hand.map(c=>c.id),handCounts:v.players.map(p=>p.handCount),draws:ui.draws,selected:ui.selected,targets:ui.targets,damage:v.logs.filter(l=>l.cue?.kind==='damage').map(l=>l.cue),auto:ui.auto,clockDuration:ui.clock.duration}:{})}
tools.querySelector('[data-qa-load]').onclick=()=>{
  clearInterval(humanTimer);clearTimeout(ui.timer);ui.clearEffects();ui.voice.stop();ui.voice.history=[];ui.music.pause();ui.modal=null;ui.lobby=false;ui.paused=false;ui.auto=false;ui.reset();const name=tools.querySelector('select').value,sample=scenario(name);ui.clock=new DecisionClock({duration:name==='clock-short'?2000:name==='layout-eight'||name==='classic-stars'?600000:60000});ui.setup=sample.setup||null;ui.state=sample.setup?null:sample;ui.draftHero=null;ui.schedule=sample.setup||['borrow-self','clock-short'].includes(name)?normalSchedule:name.startsWith('judge-')?()=>{if(ui.state.pending?.kind==='reveal')normalSchedule()}:()=>{};ui.pace=sample.setup?120:650;ui.save();ui.render();tools.hidden=true;tools.style.display='none';ui.voice.unlock();ui.music.unlock()
  if(name==='ai'){
    ui.voice.setEnabled(false);ui.pace=1;ui.schedule=normalSchedule;ui.render()
    humanTimer=setInterval(()=>{if(ui.destroyed||ui.state.winner){clearInterval(humanTimer);return}if((ui.state.pending?.actor??ui.state.current)===0){const action=chooseAI(playerView(ui.state,0));if(action&&!ui.act(action)){clearInterval(humanTimer);throw Error('Human AI fixture failed')}}},5)
  }
}
document.body.append(tools)
const safeStyle=document.createElement('style');safeStyle.textContent='@media(orientation:landscape){#app.fs-qa-safe{--fs-safe-left:59px;--fs-safe-right:59px;--fs-safe-bottom:21px}}@media(orientation:portrait){#app.fs-qa-safe{--fs-safe-top:47px;--fs-safe-bottom:34px}}';document.head.append(safeStyle)
const safe=document.createElement('input');safe.type='checkbox';safe.setAttribute('aria-label','模拟iPhone安全区');safe.onchange=()=>{ui.root.classList.toggle('fs-qa-safe',safe.checked);ui.onViewport()};tools.append(safe)
const eight=document.createElement('option');eight.value='layout-eight';eight.textContent='八人布局：三人四件装备与12手牌';tools.querySelector('select').append(eight)
for(const [value,label]of [['hand60','60张手牌与选中抬升'],['kurou-many','陈奇：30手牌连续苦肉摸牌']]){const o=document.createElement('option');o.value=value;o.textContent=label;tools.querySelector('select').append(o)}
document.addEventListener('click',event=>{if(event.target.closest('[data-action="resume"],[data-action="start"]')){tools.hidden=true;tools.style.display='none'}})
