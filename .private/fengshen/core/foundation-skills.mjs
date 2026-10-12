import {FOUNDATION_SKILLS} from '../foundation-roster.mjs'
export const FOUNDATION_OPS=new Set(['foundation-prepare','foundation-ask','foundation-discard','foundation-tuntian','foundation-phase','foundation-extra'])
const skills=new Set(Object.keys(FOUNDATION_SKILLS))
export function createFoundationSkills(api,base){
 const {catalog,CARDS,clone,player,hero,hasSkill,aliveSeats,name,enqueue,note,makePending,draw,heal,spend,ownedCards,distance,attackRange,beginJudgment,unequip,playCard,die}=api
 const ev=(op,v={})=>({type:'ext',op,...v}),emit=(s,seat,skill)=>note(s,`${name(s,seat)}发动${catalog.skillName?.(player(s,seat),skill)||skill}`,{kind:'skill',seat,skill})
 const require=(ok,msg='请选择合法的技能牌与目标')=>{if(!ok)throw Error(msg)}
 const ask=(s,skill,actor,stage,extra={})=>makePending(s,{kind:'ext',skill,actor,stage,...extra,...(extra.options&&!extra.required?{options:extra.options.concat({type:'pass'})}:{})})
 const spec=(s,skill,actor,stage,d,extra={})=>ask(s,skill,actor,stage,{spec:d,...extra})
 const own=(s,seat,ids)=>Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(id=>player(s,seat).hand.some(c=>c.id===id))
 const gain=(s,p,ids)=>{p.gainedSkills=[...new Set([...(p.gainedSkills||[]),...ids])]} 
 function maxHp(s,seat,delta,reason){const p=player(s,seat);p.maxHp+=delta;p.hp=Math.min(p.hp,p.maxHp);note(s,`${name(s,seat)}体力上限${delta>0?'增加':'减少'}一点`);if(p.maxHp<=0)die(s,seat,null);else enqueue(s,...base.hpEvents(s,seat))}
 function prepare(s,seat){return [ev('foundation-prepare',{seat})]}
 function finish(s,seat){const p=player(s,seat),out=[];if(hasSkill(p,'benghuai')&&s.players.some(t=>t.alive&&t.seat!==seat&&t.hp<p.hp))out.push(ev('foundation-ask',{seat,skill:'benghuai'}));return out}
 function endTurn(s,seat){const p=player(s,seat);return p.alive&&p.marks.fangquan&&p.hand.length?[ev('foundation-ask',{seat,skill:'fangquan',stage:'grant'})]:[]}
 function phase(s,seat,kind,event){const p=player(s,seat);if(event.foundationChecked)return false;const continuation={...event,foundationChecked:true}
  if(hasSkill(p,'qiaobian')&&p.hand.length){spec(s,'qiaobian',seat,'discard',{min:1,max:1,handOnly:true},{phase:kind,continuation,instruction:`弃一张手牌跳过${{judge:'判定',draw:'摸牌',play:'出牌',discard:'弃牌'}[kind]}阶段；也可不发动`});return true}
  if(kind==='play'&&hasSkill(p,'fangquan')&&!p.marks.skipPlay){ask(s,'fangquan',seat,'yes',{continuation,instruction:'是否跳过出牌阶段，回合结束后可弃手牌授予额外回合？'});return true}
  return false
 }
 function cardsLost(s,seat){const p=player(s,seat);if(p.alive&&s.current!==seat&&hasSkill(p,'tuntian')&&!s.queue.some(e=>e.op==='foundation-tuntian'&&e.seat===seat))enqueue(s,ev('foundation-tuntian',{seat}))}
 function discardStart(s,seat){s.foundationDiscard={seat,own:[],all:[]}}
 function discarded(s,seat,cards,reason='discard'){const d=s.foundationDiscard;if(!d||reason!=='discard')return;d.all.push(...cards.map(c=>c.id));if(seat===d.seat)d.own.push(...cards.map(c=>c.id))}
 function discardEnd(s,seat){const d=s.foundationDiscard;delete s.foundationDiscard;if(!d||d.seat!==seat||!player(s,seat).alive)return;const ownIds=d.own.filter(id=>s.discard.some(c=>c.id===id));if(!ownIds.length)return;enqueue(s,...s.players.filter(p=>p.alive&&p.seat!==seat&&hasSkill(p,'guzhen')).map(p=>ev('foundation-discard',{seat:p.seat,target:seat,ids:ownIds,all:[...new Set(d.all)]}))) }
 function afterDamage(s,e){const source=player(s,e.source);if(!source?.alive||(e.sourceFaction||hero(source).faction)!=='qun'||s.teamMode)return [];return s.players.filter(p=>p.alive&&p.seat!==source.seat&&p.role==='lord'&&hasSkill(p,'baonue')).map(p=>ev('foundation-ask',{seat:source.seat,target:p.seat,skill:'baonue'}))}
 function judgment(s,ctx,judge){if(ctx.kind==='baonue'&&base.suit(player(s,ctx.owner),judge)==='spade'&&player(s,ctx.target)?.alive)heal(s,ctx.target,1);return []}
 function onJudgeCard(s,ctx,judge){if(ctx.kind!=='tuntian')return false;const p=player(s,ctx.owner);if(p.alive&&base.suit(p,judge)!=='heart'){(p.fieldPile||=[]).push(judge);note(s,`${name(s,p.seat)}获得一张仙田`,{kind:'judgment-keep',target:p.seat,card:clone(judge)})}else{s.discard.push(judge);base.discarded(s,p.seat,[judge],'judge')}return true}
 function jiangUse(s,source,as,color){const p=player(s,source);if(p?.alive&&hasSkill(p,'jiang')&&(as==='duel'||color==='red'&&['sha','firesha','thundersha'].includes(as))){emit(s,source,'jiang');draw(s,source,1,'skill-draw')}}
 function jiangTarget(s,target,as,color){jiangUse(s,target,as,color)}
 function attack(s,e){const source=player(s,e.source),target=player(s,e.target);if(!e.sourceJiangDone){e.sourceJiangDone=true;jiangUse(s,e.source,'sha',e.color)}if(!e.targetJiangDone){e.targetJiangDone=true;jiangTarget(s,e.target,'sha',e.color)}
  if(!e.xiangleChecked&&hasSkill(target,'xiangle')){e.xiangleChecked=true;const costs=source.hand.filter(c=>CARDS[c.type].category==='basic');emit(s,target.seat,'xiangle');if(!costs.length){note(s,'没有额外基本牌，杀被抵消',{kind:'blocked',source:e.source,target:e.target});return true}spec(s,'xiangle',e.source,'discard',{min:1,max:1,handOnly:true,category:'basic'},{ctx:e,target:e.target,instruction:'额外弃一张基本手牌继续杀，否则此杀被抵消'});return true}return false
 }
 function legalSkills(s,seat){const p=player(s,seat),out=[]
  if(hasSkill(p,'tiaoxin')&&!p.marks.tiaoxin)for(const t of s.players)if(t.alive&&t.seat!==seat&&distance(s,t.seat,seat)<=attackRange(s,t.seat))out.push({type:'skill',skill:'tiaoxin',target:t.seat})
  if(hasSkill(p,'zhijian'))for(const c of p.hand.filter(c=>CARDS[c.type].category==='equip'))for(const t of s.players)if(t.alive&&t.seat!==seat&&!t.equip[CARDS[c.type].slot])out.push({type:'skill',skill:'zhijian',ids:[c.id],target:t.seat})
  if(hasSkill(p,'jixi')&&(p.fieldPile||[]).some(c=>api.targetsFor(s,seat,'snatch',[c.id]).length))out.push({type:'skill',skill:'jixi'})
  if(!s.teamMode&&hero(p).faction==='wu'&&!p.marks.zhiba&&p.hand.length)for(const lord of s.players)if(lord.alive&&lord.seat!==seat&&lord.role==='lord'&&hasSkill(lord,'zhiba')&&lord.hand.length)out.push({type:'skill',skill:'zhiba',target:lord.seat})
  return out
 }
 function activate(s,a){const p=player(s,a.seat),skill=a.skill;require(legalSkills(s,a.seat).some(o=>o.skill===skill&&(!o.ids||o.ids[0]===a.ids?.[0])&&(o.target==null||o.target===a.target)));emit(s,a.seat,skill)
  if(skill==='tiaoxin'){p.marks.tiaoxin=true;api.remember(s,[],catalog.skillName?.(p,skill),a.seat,[a.target],'tiaoxin');enqueue(s,{type:'provocation',source:a.seat,target:a.target,victim:a.seat});return true}
  if(skill==='zhijian'){require(a.ids?.length===1&&own(s,a.seat,a.ids));const c=p.hand.find(c=>c.id===a.ids[0]),slot=CARDS[c.type].slot;require(slot&&player(s,a.target)?.alive&&a.target!==a.seat&&!player(s,a.target).equip[slot]);const [card]=spend(s,a.seat,a.ids,true);s.processing=s.processing.filter(c=>c.id!==card.id);player(s,a.target).equip[slot]=card;note(s,'直接装上法宝',{kind:'public-transfer',source:a.seat,target:a.target,card:clone(card)});draw(s,a.seat,1,'skill-draw');return true}
  if(skill==='jixi'){const cards=p.fieldPile.filter(c=>api.targetsFor(s,a.seat,'snatch',[c.id]).length);ask(s,skill,a.seat,'board-pick',{cards:clone(cards),options:cards.map(c=>({type:'invoke',value:c.id,label:'选仙田'})),instruction:'选择一张仙田作为摄宝使用'});return true}
  if(skill==='zhiba'){p.marks.zhiba=true;if(player(s,a.target).persistent?.hunzi)ask(s,skill,a.target,'yes',{source:a.seat,target:a.target,instruction:'你已觉醒，可以接受或拒绝此次拼点'});else base.startPindian(s,a.seat,a.target,'zhiba');return true}return false
 }
 function boardCards(s){return s.players.filter(p=>p.alive).flatMap(p=>Object.values(p.equip).filter(Boolean).concat(p.judgment).map(c=>({card:c,owner:p.seat,type:p.virtualJudgments?.[c.id]||c.type})))}
 function boardTargets(s,ctx){const c=ctx.card,slot=CARDS[c.type].slot;return s.players.filter(p=>p.alive&&p.seat!==ctx.owner&&(slot?!p.equip[slot]:!p.judgment.some(d=>(p.virtualJudgments?.[d.id]||d.type)===ctx.type)&&!(hasSkill(p,'qianxun')&&ctx.type==='indulgence')&&!(hasSkill(p,'weimu')&&!base.red(p,c)))).map(p=>p.seat)}
 function answer(s,p,a){const actor=player(s,p.actor),ids=a.ids||[],target=a.target
  if(a.type==='pass'){require(!p.required);if(p.skill==='xiangle')note(s,'放弃额外成本，杀被抵消',{kind:'blocked',source:p.actor,target:p.ctx.target});else if(p.skill==='zhiba'&&p.stage==='yes'&&p.source!=null)return;else if(p.continuation)enqueue(s,p.continuation);return}
  require(a.type==='invoke');if(p.options)require(p.options.some(o=>o.value===a.value));if(p.spec){const d=p.spec;require(ids.length>=d.min&&ids.length<=d.max&&own(s,p.actor,ids));if(d.category)require(ids.every(id=>CARDS[actor.hand.find(c=>c.id===id).type].category===d.category));if(d.targets){const ts=d.multiTargets?a.targets||[]:[target];require(new Set(ts).size===ts.length&&ts.length>=(d.minTargets??1)&&ts.length<=(d.maxTargets??1)&&ts.every(t=>d.targets.includes(t)))}}
  if(p.stage==='reveal'){if(p.continuation)enqueue(s,p.continuation);return}
  if(p.skill==='xiangle'){spend(s,p.actor,ids);enqueue(s,p.ctx);return}
  if(p.skill==='baonue'){emit(s,p.actor,p.skill);beginJudgment(s,{owner:p.actor,target:p.target,kind:'baonue'});return}
  if(p.skill==='tuntian'){emit(s,p.actor,p.skill);beginJudgment(s,{owner:p.actor,kind:'tuntian'});return}
  if(p.skill==='benghuai'){emit(s,p.actor,p.skill);if(a.value==='hp')base.loseHp(s,p.actor,1);else{actor.maxHpLoss=(actor.maxHpLoss||0)+1;maxHp(s,p.actor,-1,'benghuai')}return}
  if(p.skill==='fangquan'){emit(s,p.actor,p.skill);if(p.stage==='yes'){actor.marks.fangquan=true;actor.marks.skipPlay=true;enqueue(s,p.continuation)}else{spend(s,p.actor,ids);actor.marks.extraGrant=target}return}
  if(p.skill==='zhiji'){if(a.value==='recover')heal(s,p.actor,1);else draw(s,p.actor,2,'skill-draw');return}
  if(p.skill==='zhiba'){if(p.stage==='yes'&&p.source!=null)base.startPindian(s,p.source,p.actor,'zhiba');else if(p.stage==='yes'){const cards=[];for(const id of p.ids){const i=s.discard.findIndex(c=>c.id===id);if(i>=0)cards.push(...s.discard.splice(i,1))}actor.hand.push(...cards);note(s,'获得拼点牌',{kind:'card-transfer',from:p.target,to:p.actor,count:cards.length,cards:clone(cards),origin:'table'})}return}
  if(p.skill==='guzhen'){const i=s.discard.findIndex(c=>c.id===a.value);require(i>=0&&p.ids.includes(a.value)&&player(s,p.target)?.alive);const [returned]=s.discard.splice(i,1);player(s,p.target).hand.push(returned);const taken=[];for(const id of p.all){const j=s.discard.findIndex(c=>c.id===id);if(j>=0)taken.push(...s.discard.splice(j,1))}actor.hand.push(...taken);emit(s,p.actor,p.skill);note(s,'返还弃牌',{kind:'public-transfer',source:p.actor,target:p.target,card:clone(returned)});if(taken.length)note(s,'收回其余弃牌',{kind:'card-transfer',from:p.target,to:p.actor,count:taken.length,cards:clone(taken),origin:'table'});return}
  if(p.skill==='jixi'){if(p.stage==='board-pick'){const card=actor.fieldPile.find(c=>c.id===a.value);require(card);spec(s,p.skill,p.actor,'target',{min:0,max:0,targets:api.targetsFor(s,p.actor,'snatch',[card.id])},{card:clone(card),instruction:'选择摄宝目标'});}else playCard(s,{type:'play',seat:p.actor,ids:[p.card.id],as:'snatch',targets:[target]});return}
  if(p.skill==='qiaobian'){
   if(p.stage==='discard'){spend(s,p.actor,ids);emit(s,p.actor,p.skill);actor.marks[{judge:'skipJudge',draw:'skipDraw',play:'skipPlay',discard:'skipDiscard'}[p.phase]]=true;enqueue(s,p.continuation)
    if(p.phase==='draw'){const targets=s.players.filter(t=>t.alive&&t.seat!==p.actor&&t.hand.length).map(t=>t.seat);if(targets.length)spec(s,p.skill,p.actor,'target',{min:0,max:0,targets,multiTargets:true,minTargets:1,maxTargets:2},{instruction:'可选至多两名角色，各获得一张手牌'})}
    if(p.phase==='play'){const cards=boardCards(s).filter(c=>boardTargets(s,c).length);if(cards.length)ask(s,p.skill,p.actor,'board-pick',{cards:cards.map(c=>clone(c.card)),options:cards.map(c=>({type:'invoke',value:c.card.id,label:name(s,c.owner)+'的区域牌'})),instruction:'选择场上一张装备或阵法移动'})}return
   }
   if(p.stage==='board-pick'){const ctx=boardCards(s).find(c=>c.card.id===a.value);require(ctx);spec(s,p.skill,p.actor,'board-target',{min:0,max:0,targets:boardTargets(s,ctx)},{board:clone(ctx),required:true,instruction:'选择对应装备槽／判定区为空的接收者'});return}
   if(p.stage==='board-target'){const ctx=boardCards(s).find(c=>c.card.id===p.board.card.id&&c.owner===p.board.owner);require(ctx&&boardTargets(s,ctx).includes(target));const from=player(s,ctx.owner),to=player(s,target),slot=CARDS[ctx.card.type].slot;let card;if(slot){card=unequip(s,from,slot);cardsLost(s,from.seat);to.equip[slot]=card}else{card=from.judgment.splice(from.judgment.findIndex(c=>c.id===ctx.card.id),1)[0];if(from.virtualJudgments)delete from.virtualJudgments[card.id];to.judgment.push(card);if(card.type!==ctx.type)(to.virtualJudgments||={})[card.id]=ctx.type}note(s,'移动场上的牌',{kind:'public-transfer',source:from.seat,target:to.seat,card:clone(card)});return}
   require((a.targets||[]).length>0);enqueue(s,...a.targets.map(target=>({type:'take',actor:p.actor,source:p.actor,target,mode:'snatch',handOnly:true})));return
  }
  throw Error('未识别的基础技能响应')
 }
 function handle(s,e){const p=player(s,e.seat)
  if(e.op==='pindian-result'&&e.skill==='zhiba'){s.processing=s.processing.filter(c=>!e.cards.some(x=>x.id===c.id));s.discard.push(...e.cards);if(!e.win&&player(s,e.target)?.alive)ask(s,'zhiba',e.target,'yes',{target:e.source,ids:e.cards.map(c=>c.id),instruction:'获得双方拼点牌？'});return}
  if(!p?.alive)return
  if(e.op==='foundation-prepare'){
   for(const [skill,on,delta,newSkills]of [['ruoyu',!s.teamMode&&p.role==='lord'&&s.players.filter(t=>t.alive).every(t=>p.hp<=t.hp),1,['jijiang']],['zhiji',!p.hand.length,-1,['guanxing']],['zaoxian',(p.fieldPile||[]).length>=3,-1,['jixi']],['hunzi',p.hp===1,-1,['yingzi','yinghun']]])if(hasSkill(p,skill)&&!p.persistent?.[skill]&&on){p.persistent={...p.persistent,[skill]:true};emit(s,e.seat,skill);maxHp(s,e.seat,delta,skill);if(!p.alive)return;gain(s,p,newSkills);if(skill==='ruoyu')heal(s,e.seat,1);if(skill==='zhiji')ask(s,skill,e.seat,'yes',{required:true,options:[...(p.hp<p.maxHp?[{type:'invoke',value:'recover',label:'回复一点体力'}]:[]),{type:'invoke',value:'draw',label:'摸两张牌'}],instruction:'觉醒后选回血或摸两张'})}return
  }
  if(e.op==='foundation-tuntian'){if(hasSkill(p,'tuntian')&&s.current!==e.seat)ask(s,'tuntian',e.seat,'yes',{instruction:'回合外失牌：是否判定获得仙田？'});return}
  if(e.op==='foundation-discard'){const cards=e.ids.map(id=>s.discard.find(c=>c.id===id)).filter(Boolean);if(cards.length&&player(s,e.target)?.alive)ask(s,'guzhen',e.seat,'board-pick',{...e,cards:clone(cards),options:cards.map(c=>({type:'invoke',value:c.id,label:'返还这张，获得其余'})),instruction:'选一张弃置手牌返还，其余弃牌收入手中'});return}
  if(e.op==='foundation-ask'){
   if(e.skill==='benghuai')ask(s,e.skill,e.seat,'yes',{required:true,options:[{type:'invoke',value:'hp',label:'失去一点体力'},{type:'invoke',value:'maxhp',label:'失去一点体力上限'}],instruction:'必须选择减少体力或上限'})
   else if(e.skill==='fangquan')spec(s,e.skill,e.seat,'gift',{min:1,max:1,handOnly:true,targets:aliveSeats(s).filter(t=>t!==e.seat)},{instruction:'弃一张手牌，给另一人一个额外回合'})
   else ask(s,e.skill,e.seat,'yes',{target:e.target,instruction:'是否帮助主公进行回血判定？'})
  }
 }
 function validState(s){return (s.extraTurnReturn==null||Number.isInteger(s.extraTurnReturn)&&s.extraTurnReturn>=0&&s.extraTurnReturn<s.players.length)&&s.players.every(p=>p.fieldPile==null||Array.isArray(p.fieldPile)&&p.fieldPile.length<=160)&&s.players.every(p=>p.maxHpLoss==null||Number.isInteger(p.maxHpLoss)&&p.maxHpLoss>=0&&p.maxHpLoss<=160)&&(s.turnIsExtra==null||typeof s.turnIsExtra==='boolean')&&(!s.foundationDiscard||Number.isInteger(s.foundationDiscard.seat)&&Array.isArray(s.foundationDiscard.own)&&Array.isArray(s.foundationDiscard.all))}
 return {skills,prepare,finish,endTurn,phase,cardsLost,discardStart,discarded,discardEnd,afterDamage,judgment,onJudgeCard,jiangUse,jiangTarget,attack,legalSkills,activate,answer,handle,validState}
}
