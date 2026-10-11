import {createSetup,dispatchSetup,setupView,chooseSetupAI,MODES,dispatch,playerView,chooseAI,advanceUnavailable,rotateView,seatMap,THEME_VERSION} from '../../engine/fengshen/engine.js'
import {ERR,fail} from '../../errors.js'
import {WINDOW_TYPE} from '../action-window.js'
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>x===b[i])
function rules(input){const mode=input?.mode??'identity8';if(!Object.hasOwn(MODES,mode))fail(ERR.INVALID_RULES,'众神斗法模式无效');return {mode}}
function eligible(state){return state.setup?(state.setup.stage==='lord'&&!state.setup.sides?[state.setup.lord]:state.setup.picks.flatMap((p,i)=>p?[]:[i])):state.s.winner?[]:[state.s.pending?.actor??state.s.current]}
function legal(state,seat){if(!eligible(state).includes(seat))return [];return state.setup?setupView(state.setup,seat).candidates.map(heroId=>({type:'pick',heroId})):playerView(state.s,seat).legal}
function matches(options,a){return !!a&&typeof a.type==='string'&&options.some(o=>o.type===a.type&&(!o.skill||o.skill===a.skill)&&(!o.as||o.as===a.as)&&(!o.heroId||o.heroId===a.heroId)&&(o.value==null||o.value===a.value)&&(!o.ids||same(o.ids,a.ids))&&(!o.targets||same(o.targets,a.targets))&&(o.target==null||o.target===a.target))}
function createState(_init,{rules:r,seed}){let setup=createSetup({seed,mode:r.mode});setup=dispatchSetup(setup,{type:'reveal',seat:0}).setup;return {version:0,setup,s:null,actionIds:new Set()}}
function apply(state,a){
 if(!a||['ids','top','bottom'].some(k=>a[k]!=null&&(!Array.isArray(a[k])||a[k].length>121||a[k].some(x=>typeof x!=='string'||x.length>96)))||a.targets!=null&&(!Array.isArray(a.targets)||a.targets.length>8||a.targets.some(t=>!Number.isInteger(t)||t<0||t>=((state.s?.players||state.setup.roles).length)))||['type','skill','as','heroId'].some(k=>a[k]!=null&&(typeof a[k]!=='string'||a[k].length>64)))return {ok:false,error:'illegal'}
 if(a.stateVersion!=null&&a.stateVersion!==state.version)return {ok:false,error:'stale'}
 if(a.actionId&&state.actionIds.has(a.actionId))return {ok:false,error:'duplicate'}
 if(!matches(legal(state,a.seat),a))return {ok:false,error:'illegal'}
 const next={...state,actionIds:new Set(state.actionIds)}
 if(state.setup){const r=dispatchSetup(state.setup,{type:'pick',seat:a.seat,heroId:a.heroId,revision:state.setup.revision});if(!r.ok)return {ok:false,error:'illegal'};next.setup=r.setup;if(next.setup.stage==='ready'){const started=dispatchSetup(next.setup,{type:'begin',seat:0});next.setup=null;next.s=advanceUnavailable(started.game,dispatch,playerView)}}
 else{const r=dispatch(state.s,{...a,revision:a.revision??state.s.revision});if(!r.ok)return {ok:false,error:'illegal'};next.s=advanceUnavailable(r.state,dispatch,playerView)}
 next.action={type:a.type,seat:a.seat,as:a.as,skill:a.skill};next.version++;if(a.actionId)next.actionIds.add(a.actionId);if(next.actionIds.size>512)next.actionIds.delete(next.actionIds.values().next().value);return {ok:true,state:next}
}
function view(state,seat){return state.setup?{setup:setupView(state.setup,seat),legal:legal(state,seat)}:playerView(state.s,seat)}
const automatic=state=>!!state.s&&(state.s.pending?.kind==='reveal'||state.s.pending?.kind==='ext'&&state.s.pending.stage==='reveal')
function decide(v){return v.setup?chooseSetupAI(v.setup):chooseAI(v)}
function results(state){const s=state.s;return {winner:s.winner,perSeat:s.players.map(p=>({seat:p.seat,delta:(s.teamMode?String(s.sides[p.seat])===s.winner:s.winner==='lord'?['lord','loyal'].includes(p.role):p.role===s.winner)?10:-10})),heroes:s.players.map(p=>({seat:p.seat,heroId:p.heroId,role:p.role}))}}
function serialize(state,seat,meta){
 const v=state.setup?{setup:rotateView(setupView(state.setup,seat),seat)}:{game:rotateView({...playerView(state.s,seat),eventId:state.s.eventId,theme:THEME_VERSION},seat)}
 return {...v,action:state.action?{...state.action,seat:seatMap(state.action.seat,seat,(state.s?.players||state.setup.roles).length)}:null,meta:{...meta,seats:meta.seats.map(s=>({...s,playerId:undefined})),mySeat:seat,gameType:'fengshen'},version:state.version}
}
export function adapterFor(input){const r=rules(input),mode=r.mode;return {
 gameId:'fengshen',seatsPerRoom:MODES[mode].players,privateActions:true,defaultRules:r,
 sanitizeRules(input){const out=rules(input);if(out.mode!==mode)fail(ERR.INVALID_RULES,'模式人数不能在房内改变，请重新建房');return out},
 openingFor:()=>({engineInit:{},ceremony:{},firstMoverSeat:null}),createState,dispatch:apply,legalActions:legal,playerView:view,serializeView:serialize,
 matchesLegalOption:matches,isFinished:state=>!!state.s?.winner,settlementOf:results,
 eligibleSeatsOf:eligible,windowIdentityOf:state=>state.setup?'draft:'+state.setup.stage:state.s.winner?null:state.s.pending?'prompt:'+state.s.pending.id:'turn:'+state.s.turns+':'+state.s.current,
 windowTypeOf:state=>state.setup?WINDOW_TYPE.EXCHANGE_SELECTION:state.s.pending?WINDOW_TYPE.DISCARD_RESPONSE:WINDOW_TYPE.SELF_TURN,
 windowTimeoutMs:(state,room)=>automatic(state)?1800:(room.turnTimeoutSeconds||60)*1000,isAutomaticWindow:automatic,
 aiPaceMs:state=>automatic(state)?1800:650,aiDecide:decide,aiFallback:decide,aiLastResort:l=>l.find(a=>a.type==='pass')||l.find(a=>a.type==='end')||l[0]||null,
 aiLevelOf:()=>null,nextRoundCtx:()=>({})
}}
export const adapter=adapterFor()
