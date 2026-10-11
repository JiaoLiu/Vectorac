// Complete original expansion event handlers. All mutation stays behind dispatch.
// Choices never contain concealed opponent cards; shown cards are explicitly public.
export const EXT_OPS=new Set(['prepare','finish','draw','ask','pindian','pindian-result','lose-hp','post-damage','after-transfer','recover-pile','rescue','death','death-finish','give','discard','zaiqi-finish','miji-finish','shuangxiong-finish','beige-finish','songwei','luanwu','fireattack','chain','shangshi','luoying','guhuo','guhuo-result','guhuo-finish','qiuyuan-follow','anxu-follow','jiushi-back','wuji'])
export function createCompleteSkills(api){
 const {catalog,CARDS,clone,player,hero,hasSkill,aliveSeats,orderFrom,nextAlive,name,enqueue,note,makePending,topCard,draw,heal,spend,ownedCards,distance,attackRange,selectedCards,conversions,beginJudgment}=api
 const lost=p=>Math.max(0,p.maxHp-p.hp),equipCount=p=>Object.values(p.equip).filter(Boolean).length
 const suit=(p,c)=>hasSkill(p,'hongyan')&&c.suit==='spade'?'heart':c.suit,red=(p,c)=>['heart','diamond'].includes(suit(p,c))
 const event=(op,value={})=>({type:'ext',op,...value}),emit=(s,seat,skill)=>note(s,`${name(s,seat)}发动${catalog.skillName?.(player(s,seat),skill)||catalog.SKILLS[skill]?.[0]||skill}`,{kind:'skill',seat,skill})
 const ask=(s,skill,actor,stage,extra={})=>makePending(s,{kind:'ext',skill,actor,stage,...extra})
 const own=(s,seat,ids,handOnly=false)=>Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(id=>(handOnly?player(s,seat).hand:ownedCards(player(s,seat))).some(c=>c.id===id))
 const require=(ok,text='请选择有效的技能成本与目标')=>{if(!ok)throw new Error(text)}
 function forcedAttack(s,actor,target,cards){const p=player(s,actor),wine=p.marks.wine||0;p.marks.wine=0;api.remember(s,cards,'杀',actor,[target],'sha');note(s,`${name(s,actor)}应令使用杀`,{kind:'card-response',seat:actor,as:'sha'});enqueue(s,{type:'attack',source:actor,target,cardIds:cards.map(c=>c.id),color:cards.every(c=>red(p,c))?'red':cards.every(c=>!red(p,c))?'black':'none',nature:cards.length===1?CARDS[cards[0].type]?.attackNature||'normal':'normal',wine,ignoreArmor:p.equip.weapon?.type==='qinggang'},{type:'finishCard',ids:cards.map(c=>c.id)})}
 function move(s,from,to,ids){const cards=spend(s,from,ids,true);s.processing=s.processing.filter(c=>!ids.includes(c.id));player(s,to).hand.push(...cards);note(s,`${name(s,from)}交给${name(s,to)} ${cards.length} 张牌`,{kind:'card-transfer',from,to,count:cards.length});handChanged(s,player(s,to));return cards}
 function reveal(s,skill,actor,cards,continuation,extra={}){s.extId=(s.extId||0)+1;s.publicReveal={id:s.extId,turn:s.turns,owner:actor,skill,cards:clone(cards),...extra};ask(s,skill,actor,'reveal',{cards:clone(cards),continuation,required:true,...extra})}
 function prepare(s,seat){const p=player(s,seat),events=[]
  for(const other of s.players)if(other.alive&&other.seat!==seat&&hasSkill(other,'zhuikong')&&lost(other)>0&&other.hand.length&&p.hand.length)events.push(event('ask',{seat:other.seat,skill:'zhuikong',target:seat}))
  if(hasSkill(p,'miji')&&lost(p))events.push(event('ask',{seat,skill:'miji'}))
  if(hasSkill(p,'yinghun')&&lost(p))events.push(event('ask',{seat,skill:'yinghun'}))
  return events
 }
 function finish(s,seat){const p=player(s,seat),events=[]
  if(hasSkill(p,'wuji')&&!p.persistent?.wuji&&p.marks.damageDealt>=3)events.push(event('wuji',{seat}))
  if(hasSkill(p,'miji')&&lost(p))events.push(event('ask',{seat,skill:'miji'}))
  return events
 }
 function promptOptions(s,p){
  if(p.stage==='reveal')return [{type:'invoke',value:'ack'}]
  if(p.options)return clone(p.options)
  if(p.spec)return [{type:'invoke',value:'confirm',spec:clone(p.spec)},...(p.required?[]:[{type:'pass'}])]
  return [{type:'invoke',value:'yes'},{type:'pass'}]
 }
 function spec(s,skill,actor,stage,options={},extra={}){ask(s,skill,actor,stage,{spec:options,...extra})}
 function startPindian(s,source,target,skill,ctx={}){
  if(!player(s,source)?.alive||!player(s,target)?.alive||!player(s,source).hand.length||!player(s,target).hand.length)return
  spec(s,skill,source,'pindian',{min:1,max:1,handOnly:true},{source,target,ctx,required:true})
 }
 const guhuoTypes=()=>Object.keys(CARDS).filter(type=>['basic','trick'].includes(CARDS[type].category))
 function needsGuhuo(p,cards,as,s){return hasSkill(p,'guhuo')&&cards.length===1&&p.hand.some(c=>c.id===cards[0].id)&&guhuoTypes().includes(as)&&!api.canConvert(p,cards,as,s,false)}
 function startGuhuo(s,a,original=null,route=null){const p=player(s,a.seat),as=a.as||original?.as,cards=selectedCards(s,a.seat,a.ids)
  if(!hasSkill(p,'guhuo')||cards.length!==1||!p.hand.some(c=>c.id===cards[0].id)||!guhuoTypes().includes(as)||!(a.guhuo||needsGuhuo(p,cards,as,s)))return false
  require(as!=='ironchain'||(a.targets?.length||original),'扣置声明不能重铸');const [card]=spend(s,a.seat,a.ids,true),ctx={actor:a.seat,as,card,action:clone(a),original:original?clone(original):null,route,questions:[],order:orderFrom(s,s.current).filter(t=>t!==a.seat&&player(s,t).hp>0),cursor:0}
  emit(s,a.seat,'guhuo');note(s,`${name(s,a.seat)}声明${CARDS[as].name}`,{kind:'guhuo-claim',seat:a.seat,as,turn:s.turns,response:!!original});if(!original){s.lastPlayed={id:s.eventId+1,source:a.seat,targets:a.targets||[],as,cards:[],virtualType:as,turn:s.turns,guhuo:true};s.exchange=[]}
  enqueue(s,event('guhuo',{ctx}));return true
 }
 function publicFields(s,p,viewer){return {stage:p.stage,spec:p.spec?clone(p.spec):null,required:!!p.required,cards:p.stage==='zhenlie'?clone(s.processing.filter(c=>c.id===p.ctx.ctx.judgeId)):p.privateCards&&viewer!==p.actor?[]:clone(p.cards||[]),judgmentKind:p.stage==='zhenlie'?p.ctx.ctx.kind:null,privateCards:!!p.privateCards,targets:p.targets,labels:clone(p.labels||null),declared:p.declared,choices:p.options?.map(o=>({value:o.value,label:o.label})),instruction:p.instruction||'',target:p.target,source:p.source}}
 function legalSkills(s,seat){const p=player(s,seat),actions=[]
  for(const skill of ['quhu','tianyi'])if(hasSkill(p,skill)&&!p.marks[skill]&&p.hand.length&&s.players.some(t=>t.alive&&t.seat!==seat&&t.hand.length&&(skill!=='quhu'||t.hp>p.hp)))actions.push({type:'skill',skill})
  for(const skill of ['ganlu','dimeng','anxu'])if(hasSkill(p,skill)&&!p.marks[skill])actions.push({type:'skill',skill})
  if(hasSkill(p,'xueji')&&!p.marks.xueji&&lost(p)&&ownedCards(p).some(c=>red(p,c)))actions.push({type:'skill',skill:'xueji'})
  if(hasSkill(p,'luanwu')&&!p.persistent?.luanwu)actions.push({type:'skill',skill:'luanwu'})
  if(hasSkill(p,'jiushi')&&!p.faceDown&&!p.marks.wineUsed)actions.push({type:'skill',skill:'jiushi'})
  if(hasSkill(p,'lianhuan'))for(const c of p.hand.filter(c=>suit(p,c)==='club'))actions.push({type:'skill',skill:'lianhuan',ids:[c.id],recast:true})
  return actions
 }
 function activate(s,a){const p=player(s,a.seat),ids=a.ids||[],targets=a.targets||[],target=a.target,skill=a.skill
  if(!legalSkills(s,a.seat).some(o=>o.skill===skill))return false
  p.marks[skill]=true;emit(s,a.seat,skill)
  if(skill==='quhu'||skill==='tianyi'){require(player(s,target)?.alive&&target!==a.seat&&p.hand.length&&player(s,target).hand.length&&(skill!=='quhu'||player(s,target).hp>p.hp));startPindian(s,a.seat,target,skill);return true}
  if(skill==='ganlu'){require(targets.length===2&&new Set(targets).size===2&&targets.every(t=>player(s,t)?.alive)&&Math.abs(equipCount(player(s,targets[0]))-equipCount(player(s,targets[1])))<=lost(p));const [a,b]=targets.map(t=>player(s,t)),first={...a.equip},second={...b.equip};for(const [owner,newEquip]of [[a,second],[b,first]])for(const slot of Object.keys(owner.equip))if(owner.equip[slot])api.unequip(s,owner,slot);a.equip=second;b.equip=first;return true}
  if(skill==='dimeng'){require(targets.length===2&&new Set(targets).size===2&&targets.every(t=>t!==a.seat&&player(s,t)?.alive)&&own(s,a.seat,ids)&&ids.length===Math.abs(player(s,targets[0]).hand.length-player(s,targets[1]).hand.length));spend(s,a.seat,ids);const [first,second]=targets.map(t=>player(s,t)),na=first.hand.length,nb=second.hand.length;[first.hand,second.hand]=[second.hand,first.hand];note(s,'双方交换手牌',{kind:'card-transfer',from:first.seat,to:second.seat,count:na});note(s,'双方交换手牌',{kind:'card-transfer',from:second.seat,to:first.seat,count:nb});handChanged(s,first);handChanged(s,second);return true}
  if(skill==='anxu'){require(targets.length===2&&new Set(targets).size===2&&targets.every(t=>t!==a.seat&&player(s,t)?.alive)&&player(s,targets[0]).hand.length!==player(s,targets[1]).hand.length);const [to,from]=targets.slice().sort((a,b)=>player(s,a).hand.length-player(s,b).hand.length);enqueue(s,{type:'take',actor:to,source:to,target:from,handOnly:true,mode:'snatch',publicTaken:true,continuation:event('anxu-follow',{seat:a.seat})});return true}
  if(skill==='xueji'){require(ids.length===1&&own(s,a.seat,ids)&&red(p,selectedCards(s,a.seat,ids)[0])&&targets.length>=1&&targets.length<=lost(p)&&new Set(targets).size===targets.length&&targets.every(t=>t!==a.seat&&player(s,t)?.alive&&distance(s,a.seat,t,ids)<=attackRange(s,a.seat,ids)));spend(s,a.seat,ids);enqueue(s,...targets.map(target=>({type:'damage',source:a.seat,target,amount:1,cardIds:[]})),...targets.map(target=>({type:'draw',target,count:1,cause:'skill-draw'})));return true}
  if(skill==='luanwu'){p.persistent={...p.persistent,luanwu:true};enqueue(s,...orderFrom(s,nextAlive(s,a.seat)).filter(t=>t!==a.seat).map(seat=>event('luanwu',{seat,source:a.seat})));return true}
  if(skill==='jiushi'){p.faceDown=true;p.marks.wine=1;p.marks.wineUsed=true;return true}
  if(skill==='lianhuan'){require(ids.length===1&&own(s,a.seat,ids,true)&&suit(p,p.hand.find(c=>c.id===ids[0]))==='club');spend(s,a.seat,ids);draw(s,a.seat,1,'skill-draw');return true}
  return false
 }
 function handChanged(s,p){if(p.alive&&hasSkill(p,'shangshi')&&p.hand.length<lost(p)&&!s.queue.some(e=>e.type==='ext'&&e.op==='shangshi'&&e.seat===p.seat))enqueue(s,event('shangshi',{seat:p.seat}))}
 function hpEvents(s,seat){const p=player(s,seat);return p.alive&&hasSkill(p,'shangshi')?[event('shangshi',{seat})]:[]}
 function loseHp(s,target,amount,source=null){const p=player(s,target);if(!p.alive)return;p.hp-=amount;note(s,`${name(s,target)}失去 ${amount} 点体力`,{kind:'hp-loss',target,source,amount});enqueue(s,...hpEvents(s,target),{type:'rescue',target,source:null})}
 function beforeDamage(s,e){const p=player(s,e.target),source=player(s,e.source)
  if(!p?.alive)return true
  if(source&&hasSkill(source,'jueqing')){emit(s,e.source,'jueqing');loseHp(s,e.target,e.amount,e.source);return true}
  if(!e.tianxiangChecked&&hasSkill(p,'tianxiang')&&p.hand.some(c=>suit(p,c)==='heart')){spec(s,'tianxiang',p.seat,'transfer',{min:1,max:1,handOnly:true,suit:'heart',targets:aliveSeats(s).filter(t=>t!==p.seat)},{ctx:e});return true}
  e.backBeforeDamage=!!p.faceDown;e.tianxiangChecked=true
  if(p.chained&&(e.nature==='fire'||e.nature==='thunder')&&!e.chain){e.chainTargets=aliveSeats(s).filter(t=>t!==p.seat&&player(s,t).chained);p.chained=false}
  return false
 }
 function afterDamage(s,e){const p=player(s,e.target),events=[]
  if(player(s,e.source)?.alive)player(s,e.source).marks.damageDealt=(player(s,e.source).marks.damageDealt||0)+e.amount
  if(p.alive&&hasSkill(p,'fangzhu'))events.push(event('ask',{seat:p.seat,skill:'fangzhu'}))
  if(p.alive&&hasSkill(p,'jieming'))for(let i=0;i<e.amount;i++)events.push(event('ask',{seat:p.seat,skill:'jieming'}))
  if(p.alive&&hasSkill(p,'jiushi')&&e.backBeforeDamage)events.push(event('ask',{seat:p.seat,skill:'jiushi-back'}))
  const slash=e.cardIds?.some(id=>['sha','firesha','thundersha'].includes(CARDS[(s.processing.concat(s.discard).find(c=>c.id===id)||{}).type]))||e.slash
  if(slash&&p.alive&&player(s,e.source)?.alive&&hasSkill(player(s,e.source),'lieren')&&player(s,e.source).hand.length&&p.hand.length)events.push(event('ask',{seat:e.source,skill:'lieren',target:e.target}))
  if(slash&&p.alive)for(const other of s.players)if(other.alive&&hasSkill(other,'beige')&&ownedCards(other).length)events.push(event('ask',{seat:other.seat,skill:'beige',target:e.target,source:e.source}))
  if(e.tianxiangDraw&&p.alive)events.push({type:'draw',target:e.target,count:lost(p),cause:'skill-draw'})
  if(e.chainTargets?.length)for(const target of e.chainTargets)if(player(s,target).alive){player(s,target).chained=false;events.push({type:'damage',source:e.source,target,amount:e.chainAmount??e.amount,nature:e.nature,cardIds:e.cardIds,chain:true})}
  return events
 }
 function death(s,seat,source){const p=player(s,seat);if(p.extDeath)return false;p.extDeath=true;p.alive=false
  if(hasSkill(p,'duanchang')&&player(s,source)){const killer=player(s,source);killer.skillsSealed=true;if(killer.buquPile?.length){s.discard.push(...killer.buquPile.splice(0));killer.buquSafe=false;if(killer.hp<=0)enqueue(s,{type:'rescue',target:source,source:null})}note(s,`${name(s,source)}失去全部人物技能`)}
  const events=[];for(const other of s.players)if(other.alive&&other.seat!==seat&&hasSkill(other,'xingshang')&&ownedCards(p).length)events.push(event('ask',{seat:other.seat,skill:'xingshang',target:seat}))
  if(hasSkill(p,'zhuiyi')&&aliveSeats(s).some(t=>t!==source))events.push(event('ask',{seat,skill:'zhuiyi',source,deadActor:true}))
  events.push(event('death-finish',{seat,source}));enqueue(s,...events);return true
 }
 function rescue(s,ctx){const p=player(s,ctx.target);if(!p.alive||p.hp>0)return false
  if(!ctx.extChecked){const events=[]
   if(hasSkill(p,'niepan')&&!p.persistent?.niepan)events.push(event('rescue',{seat:p.seat,skill:'niepan',ctx}))
   if(hasSkill(p,'buqu'))events.push(event('rescue',{seat:p.seat,skill:'buqu',ctx}))
   if(hasSkill(p,'jiushi')&&!p.faceDown)events.push(event('rescue',{seat:p.seat,skill:'jiushi',ctx}))
   for(const other of s.players)if(other.alive&&hasSkill(other,'buyi')&&p.hand.length)events.push(event('rescue',{seat:other.seat,skill:'buyi',ctx}))
   if(events.length){enqueue(s,...events,{type:'rescue',...ctx,extChecked:true});return true}
  }
  if(hasSkill(p,'buqu')&&p.buquPile?.length===1-p.hp&&new Set(p.buquPile.map(c=>c.rank)).size===p.buquPile.length){p.buquSafe=true;return true}
  return false
 }
 function judgment(s,ctx,judge){const p=player(s,ctx.owner),effective={...judge,suit:suit(p,judge)},events=[]
  if(ctx.kind==='shuangxiong'){p.marks.shuangxiongColor=red(p,judge)?'red':'black'}
  if(ctx.kind==='miji'&&!red(p,judge)){const cards=[];for(let i=0;i<lost(p);i++){const c=topCard(s);if(c)cards.push(c)}s.processing.push(...cards);if(cards.length)spec(s,'miji',p.seat,'gift',{min:0,max:0,targets:aliveSeats(s)},{cards,privateCards:true,required:true})}
  if(ctx.kind==='beige'){if(effective.suit==='heart'&&p.alive)heal(s,p.seat,1);if(effective.suit==='diamond')draw(s,p.seat,2,'skill-draw');if(player(s,ctx.source)?.alive){if(effective.suit==='spade')player(s,ctx.source).faceDown=!player(s,ctx.source).faceDown;if(effective.suit==='club')events.push(event('discard',{seat:ctx.source,count:2,skill:'beige'}))}}
  if(!red(p,judge)&&hero(p).faction==='wei'&&!s.teamMode)for(const lord of s.players)if(lord.alive&&lord.role==='lord'&&lord.seat!==p.seat&&hasSkill(lord,'songwei'))events.push(event('ask',{seat:p.seat,skill:'songwei',target:lord.seat}))
  return events
 }
 function discarded(s,owner,cards,reason='discard'){if(reason!=='discard'&&reason!=='judge')return;for(const p of s.players)if(p.alive&&p.seat!==owner&&hasSkill(p,'luoying')){const ids=cards.filter(c=>suit(p,c)==='club').map(c=>c.id);if(ids.length)enqueue(s,event('luoying',{seat:p.seat,ids}))}}
 function answer(s,p,a){const actor=player(s,p.actor),ids=a.ids||[],target=a.target
  if(p.stage==='reveal'){require(a.type==='invoke'&&a.value==='ack');if(p.continuation)enqueue(s,p.continuation);return}
  if(a.type==='pass'){require(!p.required);if(p.continuation)enqueue(s,p.continuation);if(p.ctx&&p.stage==='transfer')enqueue(s,{...p.ctx,tianxiangChecked:true});if(p.ctx&&p.stage==='helper')enqueue(s,{...p.ctx,qiuyuanChecked:true});if(p.ctx&&p.stage==='zhenlie')enqueue(s,p.ctx);return}
  require(a.type==='invoke')
  if(p.options)require(p.options.some(o=>o.value===a.value))
  if(p.stage==='question'){if(a.value==='question')p.ctx.questions.push(p.actor);p.ctx.cursor++;enqueue(s,event('guhuo',{ctx:p.ctx}));return}
  if(p.spec&&!(p.stage==='luanwu'&&a.value==='lose')){const d=p.spec;require(ids.length>=(d.min||0)&&ids.length<=(d.max??d.min??0)&&own(s,p.actor,ids,d.handOnly));if(d.suit)require(ids.every(id=>suit(actor,selectedCards(s,p.actor,[id])[0])===d.suit));if(d.targets)require(d.targets.includes(target))}
  if(['yes','target','helper','transfer','beige-cost','zhenlie','buyi'].includes(p.stage))emit(s,p.actor,p.skill.replace('-back',''))
  if(p.stage==='pindian'){const [c]=spend(s,p.actor,ids,true);if(!p.first){spec(s,p.skill,p.target,'pindian',{min:1,max:1,handOnly:true},{source:p.source,target:p.target,ctx:p.ctx,first:c,required:true})}else{const win=p.first.rank>c.rank;reveal(s,p.skill,p.source,[p.first,c],event('pindian-result',{source:p.source,target:p.target,skill:p.skill,win,cards:[p.first,c],ctx:p.ctx}),{hit:win})}return}
  if(p.stage==='transfer'){spend(s,p.actor,ids);enqueue(s,{...p.ctx,target,tianxiangChecked:false},event('after-transfer',{seat:target}));return}
  if(p.stage==='gift'){if(p.skill==='miji'){const list=p.cards.map(c=>c.id);s.processing=s.processing.filter(c=>!list.includes(c.id));player(s,target).hand.push(...p.cards);note(s,'神谋交出私有牌',{kind:'card-transfer',from:p.actor,to:target,count:p.cards.length,origin:'table'});handChanged(s,player(s,target))}else move(s,p.actor,target,ids);return}
  if(p.stage==='discard'){spend(s,p.actor,ids);if(p.continuation)enqueue(s,p.continuation);return}
  if(p.stage==='quhu-target'){enqueue(s,{type:'damage',source:p.source,target,amount:1,cardIds:[]});return}
  if(p.stage==='qiuyuan-give'){const [c]=move(s,p.actor,p.target,ids);note(s,`${name(s,p.actor)}公开交出${CARDS[c.type].name}`,{kind:'public-transfer',source:p.actor,target:p.target,card:clone(c)});if(c.type!=='shan')enqueue(s,{...p.ctx,type:'attack',target:p.actor,qiuyuanChecked:true});enqueue(s,{...p.ctx,qiuyuanChecked:true});return}
  if(p.stage==='fire-show'){const c=actor.hand.find(c=>c.id===ids[0]);reveal(s,'huoji',p.actor,[c],event('fireattack',{seat:p.source,target:p.actor,shown:clone(c),stage:'discard',cardIds:p.cardIds}));return}
  if(p.stage==='fire-discard'){spend(s,p.actor,ids);enqueue(s,{type:'damage',source:p.actor,target:p.target,amount:1,nature:'fire',cardIds:p.cardIds});return}
  if(p.stage==='beige-cost'){spend(s,p.actor,ids);beginJudgment(s,{owner:p.target,kind:'beige',source:p.source});return}
  if(p.stage==='buqu-remove'){require(p.cards.some(c=>c.id===a.value));const index=actor.buquPile.findIndex(c=>c.id===a.value);s.discard.push(...actor.buquPile.splice(index,1));enqueue(s,event('recover-pile',{seat:p.actor}));return}
  if(p.stage==='luanwu'){if(a.value==='lose'){loseHp(s,p.actor,1,null);return}require(p.targets.includes(target)&&api.canConvert(actor,selectedCards(s,p.actor,ids),'sha',s)&&distance(s,p.actor,target,ids)<=attackRange(s,p.actor,ids));if(startGuhuo(s,{type:'play',seat:p.actor,as:'sha',ids,targets:[target],guhuo:a.guhuo},null,{kind:'luanwu',target}))return;forcedAttack(s,p.actor,target,spend(s,p.actor,ids,true));return}
  if(p.stage==='buyi'){const victim=player(s,p.target),index=p.actor===p.target?victim.hand.findIndex(c=>c.id===ids[0]):Number(a.value);require(index>=0&&index<victim.hand.length);const c=victim.hand[index];reveal(s,'buyi',p.target,[c],event('rescue',{seat:p.actor,skill:'buyi-result',ctx:p.ctx,card:clone(c)}));return}
  if(p.stage==='zhenlie'){const c=topCard(s);if(c){const old=s.processing.findIndex(c=>c.id===p.ctx.ctx.judgeId);if(old>=0){const discardedCard=s.processing.splice(old,1)[0];s.discard.push(discardedCard);discarded(s,p.actor,[discardedCard],'judge')}s.processing.push(c);p.ctx.ctx.judgeId=c.id}enqueue(s,p.ctx);return}
  if(p.skill==='niepan'){actor.persistent={...actor.persistent,niepan:true};const cards=ownedCards(actor).concat(actor.judgment);for(const c of ownedCards(actor))spend(s,p.actor,[c.id]);s.discard.push(...actor.judgment.splice(0));actor.virtualJudgments={};actor.chained=false;actor.faceDown=false;draw(s,p.actor,3,'skill-draw');actor.hp=Math.min(3,actor.maxHp);return}
  if(p.skill==='buqu'){actor.buquPile||=[];while(actor.buquPile.length<Math.max(0,1-actor.hp)){const c=topCard(s);if(!c)break;actor.buquPile.push(c)}actor.buquSafe=actor.buquPile.length===1-actor.hp&&new Set(actor.buquPile.map(c=>c.rank)).size===actor.buquPile.length;reveal(s,'buqu',p.actor,actor.buquPile,null,{hit:actor.buquSafe});return}
  if(p.skill==='jiushi'){actor.faceDown=true;heal(s,p.actor,1);return}
  if(p.skill==='jiushi-back'){actor.faceDown=false;return}
  if(p.skill==='xingshang'){const victim=player(s,p.target),cards=ownedCards(victim);victim.hand=[];victim.equip=Object.fromEntries(Object.keys(victim.equip).map(k=>[k,null]));actor.hand.push(...cards);note(s,'继承手牌与装备',{kind:'card-transfer',from:p.target,to:p.actor,count:cards.length});handChanged(s,actor);return}
  if(p.skill==='zhuiyi'){draw(s,target,3,'skill-draw');heal(s,target,1);return}
  if(p.skill==='fangzhu'){draw(s,target,lost(actor),'skill-draw');player(s,target).faceDown=!player(s,target).faceDown;return}
  if(p.skill==='jieming'){draw(s,target,Math.max(0,Math.min(5,player(s,target).maxHp)-player(s,target).hand.length),'skill-draw');return}
  if(p.skill==='songwei'){draw(s,p.target,1,'skill-draw');return}
  if(p.skill==='yinghun'){const x=lost(actor),drawCount=a.value==='draw-many'?x:1;draw(s,target,drawCount,'skill-draw');enqueue(s,event('discard',{seat:target,count:a.value==='draw-many'?1:x,skill:'yinghun'}));return}
  if(p.skill==='zhuikong'||p.skill==='lieren'){startPindian(s,p.actor,p.target,p.skill,p.ctx||{});return}
  if(p.skill==='haoshi'){draw(s,p.actor,4,'skill-draw');if(actor.hand.length>4){const others=s.players.filter(p=>p.alive&&p.seat!==actor.seat),min=Math.min(...others.map(p=>p.hand.length));spec(s,'haoshi',p.actor,'gift',{min:Math.floor(actor.hand.length/2),max:Math.floor(actor.hand.length/2),handOnly:true,targets:others.filter(p=>p.hand.length===min).map(p=>p.seat)},{required:true})}return}
  if(p.skill==='zaiqi'){const cards=[];for(let i=0;i<lost(actor);i++){const c=topCard(s);if(c)cards.push(c)}s.processing.push(...cards);reveal(s,'zaiqi',p.actor,cards,event('zaiqi-finish',{seat:p.actor,cards}));return}
  if(p.skill==='shuangxiong'||p.skill==='miji'){beginJudgment(s,{owner:p.actor,kind:p.skill});return}
  if(p.skill==='qiuyuan'){const helper=target;spec(s,'qiuyuan',helper,'qiuyuan-give',{min:1,max:1,handOnly:true},{target:p.actor,ctx:p.ctx,required:true});return}
  throw new Error('未识别的原版技能响应')
 }
 function handle(s,e){const p=player(s,e.seat)
  switch(e.op){
   case 'ask':{if(!p||!p.alive&&!e.deadActor)break;const skill=e.skill
    if(['fangzhu','jieming','zhuiyi'].includes(skill))spec(s,skill,e.seat,'target',{min:0,max:0,targets:aliveSeats(s).filter(t=>skill==='jieming'||t!==e.seat&&t!==e.source)},{...e})
    else if(skill==='yinghun')spec(s,skill,e.seat,'target',{min:0,max:0,targets:aliveSeats(s).filter(t=>t!==e.seat)},{options:[{type:'invoke',value:'draw-many',label:'多摸一张弃一张'},{type:'invoke',value:'discard-many',label:'摸一张，多弃牌'},{type:'pass'}]})
    else if(skill==='beige')spec(s,skill,e.seat,'beige-cost',{min:1,max:1},{target:e.target,source:e.source})
    else ask(s,skill,e.seat,'yes',{...e});break}
   case 'shangshi':if(p?.alive&&hasSkill(p,'shangshi')&&p.hand.length<lost(p)){emit(s,e.seat,'shangshi');draw(s,e.seat,Math.max(0,lost(p)-p.hand.length),'skill-draw')}break
   case 'post-damage':enqueue(s,...afterDamage(s,e.ctx));break
   case 'after-transfer':if(p?.alive)draw(s,e.seat,lost(p),'skill-draw');break
   case 'luoying':{const cards=[];for(const id of e.ids){const i=s.discard.findIndex(c=>c.id===id);if(i>=0)cards.push(...s.discard.splice(i,1))}if(p?.alive&&cards.length){emit(s,e.seat,'luoying');p.hand.push(...cards)}else s.discard.push(...cards);break}
   case 'discard':{if(!p?.alive)break;const n=Math.min(e.count,ownedCards(p).length);if(n)spec(s,e.skill,e.seat,'discard',{min:n,max:n},{required:true,continuation:e.continuation});else if(e.continuation)enqueue(s,e.continuation);break}
   case 'recover-pile':if(p?.buquPile?.length>Math.max(0,1-p.hp))ask(s,'buqu',e.seat,'buqu-remove',{cards:clone(p.buquPile),required:true,options:p.buquPile.map(c=>({type:'invoke',value:c.id,label:'移走护道牌'}))});break
   case 'rescue':{const victim=player(s,e.ctx.target);if(!victim?.alive||victim.hp>0)break;if(e.skill==='buyi-result'){if(CARDS[e.card.type].category!=='basic'&&victim.hand.some(c=>c.id===e.card.id)){spend(s,victim.seat,[e.card.id]);heal(s,victim.seat,1)}}else if(e.skill==='buyi'){if(!victim.hand.length)break;if(e.seat===victim.seat)spec(s,'buyi',e.seat,'buyi',{min:1,max:1,handOnly:true},{target:victim.seat,ctx:e.ctx});else ask(s,'buyi',e.seat,'buyi',{target:victim.seat,ctx:e.ctx,options:victim.hand.map((_,i)=>({type:'invoke',value:String(i),label:'暗手牌 '+(i+1)})).concat({type:'pass'})})}else ask(s,e.skill,e.seat,'yes',{ctx:e.ctx});break}
   case 'death-finish':api.finalDeath(s,e.seat,e.source);break
   case 'wuji':if(p?.alive&&!p.persistent?.wuji){p.persistent={...p.persistent,wuji:true};p.maxHp++;p.hp=Math.min(p.maxHp,p.hp+1);p.disabledSkills=[...new Set([...(p.disabledSkills||[]),'huxiao'])];emit(s,e.seat,'wuji')}break
   case 'pindian-result':{s.discard.push(...e.cards.filter(c=>s.processing.some(x=>x.id===c.id)));s.processing=s.processing.filter(c=>!e.cards.some(x=>x.id===c.id));const source=player(s,e.source)
    if(e.skill==='tianyi'){source.marks.tianyiWin=e.win;source.marks.tianyiLose=!e.win}
    if(e.skill==='quhu'){if(e.win){const targets=aliveSeats(s).filter(t=>t!==e.target&&distance(s,e.target,t)<=attackRange(s,e.target));if(targets.length)spec(s,'quhu',e.source,'quhu-target',{min:0,max:0,targets},{source:e.target,required:true})}else enqueue(s,{type:'damage',source:e.target,target:e.source,amount:1,cardIds:[]})}
    if(e.skill==='zhuikong'){if(e.win)player(s,e.target).marks.skipPlay=true;else (player(s,e.target).marks.ignoreDistance||=[]).push(e.source)}
    if(e.skill==='lieren'&&e.win&&player(s,e.target)?.alive&&ownedCards(player(s,e.target)).length)enqueue(s,{type:'take',actor:e.source,source:e.source,target:e.target,mode:'snatch',equipmentOnly:true});break}
   case 'zaiqi-finish':{const taken=[];for(const c of e.cards){s.processing=s.processing.filter(x=>x.id!==c.id);if(suit(p,c)==='heart'){s.discard.push(c);if(p.alive)heal(s,p.seat,1)}else if(p.alive){p.hand.push(c);taken.push(clone(c))}else s.discard.push(c)}if(taken.length)note(s,'获得公开牌',{kind:'card-transfer',from:p.seat,to:p.seat,count:taken.length,cards:taken,origin:'table'});break}
   case 'luanwu':{if(!p?.alive)break;const other=aliveSeats(s).filter(t=>t!==p.seat),min=Math.min(...other.map(t=>distance(s,p.seat,t))),costs=conversions(p,'sha',s),targets=other.filter(t=>distance(s,p.seat,t)===min&&!(hasSkill(player(s,t),'kongcheng')&&!player(s,t).hand.length)&&costs.some(c=>distance(s,p.seat,t,c.ids)<=attackRange(s,p.seat,c.ids)));if(!targets.length)loseHp(s,p.seat,1);else spec(s,'luanwu',p.seat,'luanwu',{min:1,max:2,targets,as:'sha'},{targets,required:true,options:[{type:'invoke',value:'attack',label:'出杀'},{type:'invoke',value:'lose',label:'失体力'}]});break}
   case 'fireattack':if(!player(s,e.target)?.alive||!p?.alive)break;else if(e.stage==='discard')spec(s,'huoji',e.seat,'fire-discard',{min:1,max:1,handOnly:true,suit:suit(player(s,e.target),e.shown)},{target:e.target,cardIds:e.cardIds});else if(player(s,e.target).hand.length)spec(s,'huoji',e.target,'fire-show',{min:1,max:1,handOnly:true},{source:e.seat,cardIds:e.cardIds,required:true});break
   case 'chain':if(p?.alive){p.chained=!p.chained;note(s,`${name(s,p.seat)}${p.chained?'进入':'解除'}连环`)}break
   case 'anxu-follow':if(e.card&&suit(player(s,e.recipient),e.card)!=='spade'&&p?.alive)draw(s,p.seat,1,'skill-draw');break
   case 'guhuo':{const c=e.ctx;if(c.cursor<c.order.length){const actor=c.order[c.cursor];ask(s,'guhuo',actor,'question',{source:c.actor,target:c.original?.target??c.action.targets?.[0],declared:c.as,ctx:c,required:true,options:[{type:'invoke',value:'believe',label:'不质疑'},{type:'invoke',value:'question',label:'质疑'}]})}else{const real=c.card.type===c.as||c.as==='sha'&&!!CARDS[c.card.type]?.attackNature,hit=!c.questions.length||real&&suit(player(s,c.actor),c.card)==='heart';reveal(s,'guhuo',c.actor,[c.card],event('guhuo-result',{ctx:{...c,real,hit}}),{hit,declared:c.as})}break}
   case 'guhuo-result':{const c=e.ctx;note(s,`${name(s,c.actor)}的扣置牌已经公开`,{kind:'guhuo-reveal',seat:c.actor,as:c.as,real:c.real,success:c.hit,turn:s.turns});enqueue(s,...c.questions.map(seat=>c.real?event('lose-hp',{seat,source:c.actor,amount:1}):{type:'draw',target:seat,count:1,cause:'skill-draw'}),event('guhuo-finish',{ctx:c}));break}
   case 'lose-hp':loseHp(s,e.seat,e.amount,e.source);break
   case 'guhuo-finish':{const c=e.ctx;if(!c.hit||!player(s,c.actor).alive){const i=s.processing.findIndex(card=>card.id===c.card.id);if(i>=0)s.discard.push(...s.processing.splice(i,1));if(c.original)api.failedResponse(s,c.original);if(c.route&&player(s,c.actor).alive)loseHp(s,c.actor,1)}else if(c.route)forcedAttack(s,c.actor,c.route.target,[c.card]);else if(c.original)api.answer(s,c.action,c.card,c.original);else api.playCard(s,c.action,c.card);break}
  }
 }
 return {suit,red,lost,event,prepare,finish,promptOptions,publicFields,legalSkills,activate,answer,handle,handChanged,hpEvents,loseHp,beforeDamage,afterDamage,death,rescue,judgment,discarded,reveal,ask,spec,startPindian,own,move,guhuoTypes,needsGuhuo,startGuhuo}
}
