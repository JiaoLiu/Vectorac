// Isolated preview-only acceptance page. Never included in the normal build.
import './app.js'
import {createGame,dispatch,playerView,catalog} from './engine.mjs'
import {makeDeck} from '../../.vuepress/components/sanguo/catalog.mjs'
import {chooseAI} from '../../.vuepress/components/sanguo/ai.mjs'
import {createSetup} from './setup.mjs'
import {advanceUnavailable,DecisionClock} from './flow.mjs'
const ui=window.__fengshenUI,normalSchedule=ui.schedule.bind(ui)
const audioProof=document.createElement('output');audioProof.hidden=true;audioProof.dataset.qaAudio='[]';document.body.append(audioProof)
const normalIdle=ui.voice.onIdle;ui.voice.onIdle=()=>{audioProof.dataset.qaAudio=JSON.stringify(ui.voice.history);normalIdle()}
const mediaProof=document.createElement('output');mediaProof.hidden=true;document.body.append(mediaProof)
setInterval(()=>{mediaProof.dataset.qaMedia=JSON.stringify({music:ui.music.enabled,paused:ui.music.audio?.paused,time:ui.music.audio?.currentTime,src:ui.music.audio?.getAttribute('src'),fullscreen:!!document.fullscreenElement})},200)
let humanTimer=null
function fixture(heroId='yangjian',role='lord',current=0){
  const s=createGame({heroId,role,seed:17});s.deck=makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.logs=[];s.lastPlayed=null;s.lastEvent=null
  for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}
  return s
}
function card(s,seat,type){const i=s.deck.findIndex(c=>c.type===type);if(i<0)throw Error('Missing fixture '+type);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
function equip(s,seat,type,slot){const c=card(s,seat,type);s.players[seat].hand.pop();s.players[seat].equip[slot]=c;return c}
function step(s,a){const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});if(!r.ok)throw Error(r.error);return r.state}
function scenario(name){
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
  if(['hand6','hand12','hand30'].includes(name)){const s=fixture();s.players[0].hand.push(...s.deck.splice(0,Number(name.slice(4))));return s}
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
tools.innerHTML='<select aria-label="验收场景" style="color:#14242a;background:#eef0db;max-width:180px">'+Object.entries({table:'普通牌桌',death:'他人阵亡', 'own-death':'自己阵亡',snatch:'顺手选牌',dismantle:'过河选牌',counter:'无懈响应',draw:'集智与女声','draw-self':'自己无中生有摸两张','draw-other':'他人无中生有待无懈',hand:'18张手牌',hand6:'6张手牌',hand12:'12张手牌',hand30:'30张手牌','slash-self':'他人杀你：闪或受伤','slash-other':'你杀他人','slash-empty':'实际出杀：目标无闪','duel-empty':'实际决斗：目标无杀','borrow-self':'借刀指定自己','judge-lightning':'闪电命中翻牌','judge-miss':'闪电未命中翻牌','judge-prison':'画地为牢翻牌',delays:'自己挂雷与画地为牢',equipped:'他人四件装备与全体牌',harvest:'五谷中央选牌','no-shan':'没有闪自动伤害','no-sha':'没有杀决斗伤害','clock-short':'2秒加速超时托管',ai:'完整UI定时器对局','draft-lord':'随机身份：你为主公','draft-other':'随机身份：AI为主公'}).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')+'</select><button style="border:1px solid #d3c09b;padding:5px" data-qa-load>载入验收场景</button>'
const stateProof=document.createElement('output');stateProof.hidden=true;document.body.append(stateProof)
const mobileOption=document.createElement('option');mobileOption.value='mobile-demo';mobileOption.textContent='手机综合：12张手牌与攻击黄线';tools.querySelector('select').append(mobileOption)
const normalRender=ui.render.bind(ui);ui.render=()=>{normalRender();const v=ui.state&&playerView(ui.state,0);stateProof.dataset.qaState=JSON.stringify(v?{pending:v.pending,revision:v.revision,hp:v.players.map(p=>p.hp),hand:v.players[0].hand.map(c=>c.id),handCounts:v.players.map(p=>p.handCount),draws:ui.draws,selected:ui.selected,targets:ui.targets,damage:v.logs.filter(l=>l.cue?.kind==='damage').map(l=>l.cue),auto:ui.auto,clockDuration:ui.clock.duration}:{})}
tools.querySelector('[data-qa-load]').onclick=()=>{
  clearInterval(humanTimer);clearTimeout(ui.timer);ui.clearEffects();ui.voice.stop();ui.voice.history=[];ui.music.pause();ui.modal=null;ui.lobby=false;ui.paused=false;ui.auto=false;ui.reset();const name=tools.querySelector('select').value,sample=scenario(name);ui.clock=new DecisionClock({duration:name==='clock-short'?2000:60000});ui.setup=sample.setup||null;ui.state=sample.setup?null:sample;ui.draftHero=null;ui.schedule=sample.setup||['borrow-self','clock-short'].includes(name)?normalSchedule:name.startsWith('judge-')?()=>{if(ui.state.pending?.kind==='reveal')normalSchedule()}:()=>{};ui.pace=sample.setup?120:650;ui.save();ui.render();tools.hidden=true;tools.style.display='none';ui.voice.unlock();ui.music.unlock()
  if(name==='ai'){
    ui.voice.setEnabled(false);ui.pace=1;ui.schedule=normalSchedule;ui.render()
    humanTimer=setInterval(()=>{if(ui.destroyed||ui.state.winner){clearInterval(humanTimer);return}if((ui.state.pending?.actor??ui.state.current)===0){const action=chooseAI(playerView(ui.state,0));if(action&&!ui.act(action)){clearInterval(humanTimer);throw Error('Human AI fixture failed')}}},5)
  }
}
document.body.append(tools)
document.addEventListener('click',event=>{if(event.target.closest('[data-action="resume"],[data-action="start"]')){tools.hidden=true;tools.style.display='none'}})
