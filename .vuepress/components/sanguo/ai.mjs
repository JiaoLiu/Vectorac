import { CARDS, HERO_BY_ID, isRed } from './catalog.mjs'

// This module receives playerView only: no deck, concealed identities, opponent
// hands or engine reference. Decisions use visible actions and public suspicion.
export function hostility(view, target) {
  const self=view.players[view.seat],p=view.players[target]
  if(target===view.seat)return -5
  const role=self.role,known=p.role,remaining=view.players.filter(p=>p.alive).length
  if(role==='lord'||role==='loyal') {
    if(known==='lord'||known==='loyal')return -4
    if(known==='rebel'||known==='renegade')return 4
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
export function cardValue(card,view) {
  const p=view.players[view.seat]
  if(card.type==='tao')return p.hp<p.maxHp?9:6
  if(card.type==='shan')return p.hand.filter(c=>c.type==='shan').length>2?2:5
  if(card.type==='sha')return p.hand.filter(c=>c.type==='sha').length>3?1.5:3
  if(card.type==='nullify')return 4.5
  if(card.type==='draw')return 8
  if(CARDS[card.type].category==='equip')return p.equip[CARDS[card.type].slot]?1.2:4
  if(card.type==='lightning')return 1
  return 3.5
}
const ownCards = view => {const p=view.players[view.seat];return p.hand.concat(Object.values(p.equip).filter(Boolean))}
const cost = (view,ids=[]) => ids.reduce((n,id)=>n+cardValue(ownCards(view).find(c=>c.id===id),view),0)
const orderByValue = view => view.players[view.seat].hand.slice().sort((a,b)=>cardValue(a,view)-cardValue(b,view))
function slashResources(view) {
  const p=view.players[view.seat],skills=HERO_BY_ID[p.heroId].skills
  const cards=ownCards(view),singles=cards.filter(c=>p.hand.some(h=>h.id===c.id)&&c.type==='sha'||skills.includes('wusheng')&&isRed(c)||skills.includes('longdan')&&p.hand.some(h=>h.id===c.id)&&c.type==='shan')
  return singles.length+(p.equip.weapon?.type==='spear'?Math.floor(p.hand.filter(c=>!singles.some(s=>s.id===c.id)).length/2):0)
}
function response(view) {
  const pending=view.pending,opts=view.legal,pass=opts.find(o=>o.type==='pass')
  if(pending.kind==='reveal')return opts.find(o=>o.type==='ack')
  const answers=opts.filter(o=>o.type==='respond').sort((a,b)=>cost(view,a.ids)-cost(view,b.ids))
  if(pending.kind==='discard')return {type:'discard',ids:orderByValue(view).slice(0,pending.count).map(c=>c.id)}
  if(pending.kind==='guess')return opts[(view.revision*7+view.seat)%opts.length]
  if(pending.kind==='pick')return opts.slice().sort((a,b)=>cardValue(b.card,view)-cardValue(a.card,view))[0]
  if(pending.kind==='take') {
    const enemy=hostility(view,pending.target)>0
    const score=o=>!o.card?2:o.card.type==='indulgence'||o.card.type==='lightning'?(enemy?-8:10):CARDS[o.card.type].slot==='armor'?7:CARDS[o.card.type].slot==='weapon'?6:4
    return opts.slice().sort((a,b)=>score(b)-score(a))[0]
  }
  if(pending.kind==='choice') {
    let choice='yes'
    if(pending.skill==='luoyi')choice=view.players[view.seat].hand.some(c=>c.type==='sha'||c.type==='duel')?'yes':'no'
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
  if(pending.as==='sha'&&pending.remaining>slashResources(view))return opts.find(o=>o.type==='support')||pass
  if(answers.length)return answers[0]
  return opts.find(o=>o.type==='support')||pass
}
export function chooseAI(view) {
  if(!view.legal.length)return null
  let chosen
  if(view.pending)chosen=response(view)
  else {
    const self=view.players[view.seat],h=HERO_BY_ID[self.heroId]
    const scored=[]
    for(const action of view.legal) {
      let score=0, candidate=action
      if(action.type==='play') {
        const target=action.targets[0],rel=target==null?0:hostility(view,target)
        if(action.as==='tao')score=18
        else if(action.as==='draw')score=15
        else if(CARDS[action.as].category==='equip') {
          const slot=CARDS[action.as].slot,old=self.equip[slot]
          score=!old?9:slot==='weapon'&&(CARDS[action.as].range>CARDS[old.type].range||action.as==='crossbow'&&self.hand.filter(c=>c.type==='sha').length>1)?7:-4
        } else if(['sha','duel','snatch','dismantle','indulgence'].includes(action.as)) {
          const relations=action.targets.reduce((n,t)=>n+hostility(view,t),0)
          score=relations*3+(rel>0?(view.players[target].hp<=2?3:0):0)-(action.as==='duel'&&!self.hand.some(c=>c.type==='sha')?1:0)
          if(action.as==='snatch'||action.as==='dismantle') {
            const ally=view.players[target]
            if(rel<0&&ally.judgment.some(c=>c.type==='indulgence'))score=13
          }
          score-=Math.max(0,cost(view,action.ids)-5)*.4
          if(action.as==='duel'&&view.players[target].handCount>0&&slashResources(view)===0)score-=self.hp<=1?30:5
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
          candidate={...action,target:ally?.seat,ids:cards.map(c=>c.id)};score=ally&&cards.length&&self.marks.rende<2?self.hp<self.maxHp?11:4:-3
        } else if(action.skill==='fanjian') {
          const enemy=view.players.filter(p=>p.alive&&p.seat!==view.seat).sort((a,b)=>hostility(view,b.seat)-hostility(view,a.seat))[0]
          candidate={...action,target:enemy.seat};score=hostility(view,enemy.seat)>0&&self.hand.length?6:-3
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
