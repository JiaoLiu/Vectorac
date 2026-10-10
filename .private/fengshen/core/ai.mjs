import * as defaultCatalog from './catalog.mjs'
export function createAI(catalog=defaultCatalog){
const {CARDS,HERO_BY_ID,isRed}=catalog

// This module receives playerView only: no deck, concealed identities, opponent
// hands or engine reference. Decisions use visible actions and public suspicion.
function hostility(view, target) {
  const self=view.players[view.seat],p=view.players[target]
  if(target===view.seat)return -5
  // 对抗局：敌友公开，按阵营直接判定，不做身份推断。
  if(view.teamMode){
    const mine=view.sides[view.seat],theirs=view.sides[target]
    return mine===theirs?-4:4
  }
  const role=self.role,known=p.role,remaining=view.players.filter(p=>p.alive).length
  const rebelTotal=view.publicRoleCounts?.rebel||(view.players.length===8?4:view.players.length===5?2:null)
  const rebelsGone=rebelTotal!=null&&view.players.filter(p=>!p.alive&&p.role==='rebel').length===rebelTotal
  if(role==='lord'||role==='loyal') {
    if(known==='lord'||known==='loyal')return -4
    if(known==='rebel'||known==='renegade')return 4
    // Public death identities suffice: with both rebels gone, a loyalist knows
    // the sole other non-lord survivor is the renegade. A lord only infers the
    // least trusted survivor; never read concealed roles to choose correctly.
    if(rebelsGone&&role==='loyal')return 4
    if(rebelsGone){const suspect=view.players.filter(x=>x.alive&&x.seat!==view.seat&&x.role!=='lord').sort((a,b)=>(view.suspicion[b.seat]||0)-(view.suspicion[a.seat]||0)||a.seat-b.seat)[0];return target===suspect?.seat?3:-.5}
    return .65+(view.suspicion[target]||0)
  }
  if(role==='rebel') {
    if(known==='lord')return 5
    if(known==='loyal')return 3
    if(known==='rebel')return -4
    return -.25-(view.suspicion[target]||0)
  }
  if(remaining===2)return 5
  if(known==='lord')return p.hp<=2?-4:-.7
  const nonlord=view.players.filter(p=>p.alive&&p.seat!==view.seat&&p.role!=='lord')
  const leaning=nonlord.reduce((n,p)=>n+(view.suspicion[p.seat]||0),0)
  return 1.2+Math.sign(leaning||1)*(view.suspicion[target]||0)*.7
}
function cardValue(card,view) {
  const p=view.players[view.seat]
  if(card.type==='tao')return p.hp<p.maxHp?9:6
  if(card.type==='shan')return p.hand.filter(c=>c.type==='shan').length>2?2:5
  if(card.type==='sha')return p.hand.filter(c=>c.type==='sha').length>3?1.5:3
  if(card.type==='nullify')return 4.5
  if(card.type==='draw')return 8
  if(card.type==='wine')return p.hp<=1?9:4
  if(CARDS[card.type]?.attackNature)return p.hand.filter(c=>c.type==='sha'||CARDS[c.type]?.attackNature).length>3?2:4
  if(CARDS[card.type].category==='equip')return p.equip[CARDS[card.type].slot]?1.2:4
  if(card.type==='lightning')return 1
  return 3.5
}
const ownCards = view => {const p=view.players[view.seat];return p.hand.concat(Object.values(p.equip).filter(Boolean))}
const cost = (view,ids=[]) => ids.reduce((n,id)=>n+cardValue(ownCards(view).find(c=>c.id===id),view),0)
const orderByValue = view => view.players[view.seat].hand.slice().sort((a,b)=>cardValue(a,view)-cardValue(b,view))
function slashResources(view,HERO_BY_ID,isRed) {
  const p=view.players[view.seat],skills=HERO_BY_ID[p.heroId].skills
  const cards=ownCards(view),singles=cards.filter(c=>p.hand.some(h=>h.id===c.id)&&(c.type==='sha'||CARDS[c.type]?.attackNature)||skills.includes('wusheng')&&isRed(c)||skills.includes('longdan')&&p.hand.some(h=>h.id===c.id)&&c.type==='shan')
  return singles.length+(p.equip.weapon?.type==='spear'?Math.floor(p.hand.filter(c=>!singles.some(s=>s.id===c.id)).length/2):0)
}
function response(view,HERO_BY_ID,isRed) {
  const pending=view.pending,opts=view.legal,pass=opts.find(o=>o.type==='pass')
  if(pending.kind==='reveal')return opts.find(o=>o.type==='ack')
  const answers=opts.filter(o=>o.type==='respond').sort((a,b)=>cost(view,a.ids)-cost(view,b.ids))
  if(pending.kind==='discard')return {type:'discard',ids:orderByValue(view).slice(0,pending.count).map(c=>c.id)}
  if(pending.kind==='guess')return opts[(view.revision*7+view.seat)%opts.length]
  if(pending.kind==='tuxi')return opts.slice().sort((a,b)=>(b.targets||[]).reduce((n,t)=>n+hostility(view,t),0)-(a.targets||[]).reduce((n,t)=>n+hostility(view,t),0))[0]
  if(pending.kind==='guanxing'){
    const cards=opts.find(a=>a.type==='arrange').pool.slice(),top=[],own=view.players[view.seat]
    for(const delayed of own.judgment.slice().reverse()){
      const i=cards.findIndex(c=>delayed.type==='indulgence'?c.suit==='heart':!(c.suit==='spade'&&c.rank>=2&&c.rank<=9));if(i>=0)top.push(cards.splice(i,1)[0].id)
    }
    cards.sort((a,b)=>cardValue(b,view)-cardValue(a,view));top.push(...cards.slice(0,2).map(c=>c.id))
    return {type:'arrange',top,bottom:cards.slice(2).map(c=>c.id)}
  }
  if(pending.kind==='liuli'){
    const candidates=opts.filter(a=>a.type==='redirect'&&hostility(view,a.target)>0).sort((a,b)=>hostility(view,b.target)-hostility(view,a.target)||cost(view,a.ids)-cost(view,b.ids))
    return candidates[0]||opts.find(a=>a.type==='pass')
  }
  if(pending.kind==='judge-replace'){
    const card=view.judgmentCard,relation=hostility(view,pending.target),pool=view.players[view.seat].hand
    // Only the public judgment and our own hand inform replacement decisions.
    const good=c=>view.judgmentKind==='indulgence'?c.suit==='heart':view.judgmentKind==='lightning'?!(c.suit==='spade'&&c.rank>=2&&c.rank<=9):view.judgmentKind==='luoshen'?!isRed(c):view.judgmentKind==='ganglie'?c.suit!=='heart':isRed(c)
    const replacement=opts.filter(a=>a.type==='respond').sort((a,b)=>cost(view,a.ids)-cost(view,b.ids)).find(a=>{const c=pool.find(c=>c.id===a.ids[0]);return relation<0&&good(c)&&!good(card)||relation>0&&!good(c)&&good(card)})
    return replacement||opts.find(a=>a.type==='pass')
  }
  if(pending.kind==='yiji'){
    const ally=view.players.filter(p=>p.alive&&p.seat!==view.seat&&hostility(view,p.seat)<0).sort((a,b)=>a.hp-b.hp)[0]
    if(ally){const gift=opts.filter(a=>a.type==='give'&&a.target===ally.seat).sort((a,b)=>b.ids.length-a.ids.length)[0];if(gift)return gift}
    return opts.find(a=>a.type==='choose')
  }
  if(pending.kind==='pick')return opts.slice().sort((a,b)=>cardValue(b.card,view)-cardValue(a.card,view))[0]
  if(pending.kind==='take') {
    const enemy=hostility(view,pending.target)>0
    const score=o=>!o.card?2:o.card.type==='indulgence'||o.card.type==='lightning'?(enemy?-8:10):CARDS[o.card.type].slot==='armor'?7:CARDS[o.card.type].slot==='weapon'?6:4
    return opts.slice().sort((a,b)=>score(b)-score(a))[0]
  }
  if(pending.kind==='choice') {
    let choice='yes'
    if(pending.skill==='luoyi')choice=view.players[view.seat].hand.some(c=>c.type==='sha'||c.type==='duel')?'yes':'no'
    if(pending.skill==='fan')choice=view.players[pending.target]?.equip.armor?.type==='vine'?'yes':'no'
    if(['ganglie','fankui'].includes(pending.skill))choice=hostility(view,pending.source)>0?'yes':'no'
    if(pending.skill==='dualTarget')choice=orderByValue(view).length&&cardValue(orderByValue(view)[0],view)<5?'discard':'draw'
    if(pending.skill==='ice')choice=view.players[pending.target]?.hp>1&&view.players[pending.target]?.handCount>1?'yes':'no'
    if(pending.skill==='bow')choice=opts.find(o=>o.value!=='no'&&o.type==='choose')?.value||'no'
    return opts.find(o=>o.type==='choose'&&o.value===choice)||opts.find(o=>o.type==='choose')
  }
  if(pending.kind==='counter') {
    const harmful=['duel','snatch','dismantle','savage','arrows','collateral','indulgence','lightning'].includes(pending.cardType)
    const relation=hostility(view,pending.target)
    const shouldCancel=harmful?relation<-.5:relation>1
    return shouldCancel!==pending.negated&&answers.length?answers[0]:pass
  }
  if(pending.kind==='rescue')return hostility(view,pending.target)<0&&answers.length?answers[0]:pass
  if(pending.kind==='support')return hostility(view,pending.requester)<0&&answers.length?answers[0]:pass
  if(pending.kind==='axe')return hostility(view,pending.target)>0&&answers.length&&cost(view,answers[0].ids)<11?answers[0]:pass
  if(pending.kind==='blade')return hostility(view,pending.target)>0&&answers.length?answers[0]:pass
  const armor=opts.find(o=>o.type==='bagua');if(armor)return armor
  if(pending.as==='sha'&&pending.remaining>slashResources(view,HERO_BY_ID,isRed))return opts.find(o=>o.type==='support')||pass
  if(answers.length)return answers[0]
  return opts.find(o=>o.type==='support')||pass
}
const chooseAI=function chooseAI(view) {
  if(!view.legal.length)return null
  let chosen
  if(view.pending)chosen=response(view,HERO_BY_ID,isRed)
  else {
    const self=view.players[view.seat],h=HERO_BY_ID[self.heroId]
    const scored=[]
    for(const action of view.legal) {
      let score=0, candidate=action
      if(action.type==='play') {
        const target=action.targets[0],rel=target==null?0:hostility(view,target)
        if(action.as==='tao')score=18
        else if(action.as==='wine')score=self.marks.wine||!view.legal.some(a=>a.type==='play'&&a.as==='sha'&&a.targets.some(t=>hostility(view,t)>0))?-3:12
        else if(action.as==='draw')score=self.hand.length>self.hp+3?4:15
        else if(CARDS[action.as].category==='equip') {
          const slot=CARDS[action.as].slot,old=self.equip[slot]
          score=!old?9:slot==='weapon'&&(CARDS[action.as].range>CARDS[old.type].range||action.as==='crossbow'&&self.hand.filter(c=>c.type==='sha').length>1)?7:-4
        } else if(['sha','duel','snatch','dismantle','indulgence'].includes(action.as)) {
          const relations=action.targets.reduce((n,t)=>n+hostility(view,t),0)
          score=relations*3+(rel>0?(view.players[target].hp<=2?3:0):0)-(action.as==='duel'&&!self.hand.some(c=>c.type==='sha')?1:0)
          if(action.as==='sha'&&view.players[target].equip.armor?.type==='vine'&&self.equip.weapon?.type!=='qinggang'&&self.equip.weapon?.type!=='fan'&&!action.ids.some(id=>CARDS[ownCards(view).find(c=>c.id===id)?.type]?.attackNature))score=-4
          if(action.as==='snatch'||action.as==='dismantle') {
            const ally=view.players[target]
            if(rel<0&&ally.judgment.some(c=>c.type==='indulgence'))score=13
          }
          score-=Math.max(0,cost(view,action.ids)-5)*.4
          if(action.as==='duel'&&view.players[target].handCount>0&&slashResources(view,HERO_BY_ID,isRed)===0)score-=self.hp<=1?30:5
        } else if(action.as==='savage'||action.as==='arrows')score=view.players.filter(p=>p.alive&&p.seat!==view.seat).reduce((n,p)=>n+hostility(view,p.seat)*(p.hp<=2?1.7:1),0)
        else if(action.as==='garden')score=view.players.filter(p=>p.alive&&p.hp<p.maxHp).reduce((n,p)=>n-hostility(view,p.seat),0)+1
        else if(action.as==='harvest')score=5
        else if(action.as==='collateral')score=hostility(view,action.targets[1])*2+Math.max(0,rel)+1
        else if(action.as==='lightning')score=-2
      } else if(action.type==='skill') {
        if(action.skill==='zhiheng') {
          const cards=ownCards(view).filter(c=>cardValue(c,view)<3.5||CARDS[c.type].category==='equip'&&self.equip[CARDS[c.type].slot]?.id===c.id&&CARDS[c.type].slot==='weapon'&&self.hand.some(h=>CARDS[h.type].slot==='weapon'&&CARDS[h.type].range>CARDS[c.type].range))
          candidate={...action,ids:cards.map(c=>c.id)};score=cards.length?10:-3
        } else if(action.skill==='kurou')score=self.hp>2&&self.hand.length<5?5:-2
        else if(action.skill==='rende') {
          const ally=view.players.filter(p=>p.alive&&p.seat!==view.seat&&hostility(view,p.seat)<-.5).sort((a,b)=>a.hp-b.hp)[0]
          const cards=orderByValue(view).slice(0,self.hp<self.maxHp?2:Math.max(0,self.hand.length-self.hp))
          candidate={...action,target:ally?.seat,ids:cards.map(c=>c.id)};score=ally&&cards.length&&self.marks.rende<2&&self.role!=='renegade'?self.hp<self.maxHp?11:4:-3
        } else if(action.skill==='fanjian') {
          const enemy=view.players.filter(p=>p.alive&&p.seat!==view.seat).sort((a,b)=>hostility(view,b.seat)-hostility(view,a.seat))[0]
          candidate={...action,target:enemy.seat};score=hostility(view,enemy.seat)>0&&self.hand.length?6:-3
        } else if(action.skill==='jieyin'){
          const target=view.players.filter(p=>p.alive&&p.seat!==view.seat&&HERO_BY_ID[p.heroId].sex==='male'&&p.hp<p.maxHp&&hostility(view,p.seat)<0).sort((a,b)=>a.hp-b.hp)[0]
          const cards=orderByValue(view).slice(0,2);candidate={...action,target:target?.seat,ids:cards.map(c=>c.id)}
          score=target&&cards.length===2&&self.role!=='renegade'?(self.hp<self.maxHp?14:7)-cost(view,candidate.ids)*.3:-3
        } else if(action.skill==='lijian'){
          const males=view.players.filter(p=>p.alive&&p.seat!==view.seat&&HERO_BY_ID[p.heroId].sex==='male'),pairs=[]
          for(const source of males)for(const victim of males)if(source.seat!==victim.seat&&!(HERO_BY_ID[victim.heroId].skills.includes('kongcheng')&&!victim.handCount))pairs.push({source:source.seat,target:victim.seat,score:hostility(view,source.seat)+hostility(view,victim.seat)*2})
          const pair=pairs.sort((a,b)=>b.score-a.score)[0],cheap=ownCards(view).slice().sort((a,b)=>cardValue(a,view)-cardValue(b,view))[0];candidate={...action,ids:cheap?[cheap.id]:[],targets:pair?[pair.source,pair.target]:[]};score=pair&&cheap?pair.score*2-cost(view,candidate.ids)*.3:-3
        } else if(action.skill==='qingnang'){
          const target=view.players.filter(p=>p.alive&&p.hp<p.maxHp&&hostility(view,p.seat)<0).sort((a,b)=>a.hp-b.hp)[0],cards=orderByValue(view).slice(0,1)
          candidate={...action,target:target?.seat,ids:cards.map(c=>c.id)};score=target&&cards.length?target.seat===view.seat?14:8:-3
        } else if(action.skill==='jijiang')score=self.marks.jijiangTried?-3:hostility(view,action.target)*2+1
      }
      // Stable tie variation depends only on the public revision and our seat.
      score+=action.type==='end'?0:((view.revision+view.seat*3+(action.targets?.[0]||0))%7)*.015
      scored.push({score,action:candidate})
    }
    chosen=scored.sort((a,b)=>b.score-a.score)[0]?.action
  }
  if(!chosen)return null
  return {...chosen,seat:view.seat,revision:view.revision,...(view.pending?{promptId:view.pending.id}:{})}
}
return Object.assign(chooseAI,{hostility,cardValue})
}
export const chooseAI=createAI()
export const hostility=(view,target)=>chooseAI.hostility(view,target)
export const cardValue=(card,view)=>chooseAI.cardValue(card,view)
