// Public recovery events, not net HP deltas: damage and recovery can coexist
// inside one dispatch. Repainting/restoring an unchanged state never replays.
export const RECOVERY_DURATION=1500
export function recoveryCues(before,after){return after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='recover'&&l.cue.amount>0).slice().reverse().map(l=>({...l.cue,id:l.id}))}
export function paintRecovery(root,effects,{now=Date.now()}={}){
  root.querySelectorAll('.fs-heal-number,.fs-heal-aura').forEach(e=>e.remove())
  const groups=new Map()
  for(const effect of effects){if(effect.until<=now)continue;const group=groups.get(effect.target);if(group){group.amount+=effect.amount;group.started=Math.max(group.started,effect.started)}else groups.set(effect.target,{amount:effect.amount,started:effect.started})}
  for(const [seat,effect]of groups){
    const anchor=root.querySelector(seat===0?'.fs-own-hero>button':`[data-player="${seat}"] .fs-player-main`);if(!anchor)continue
    const elapsed=Math.max(0,now-effect.started),doc=root.ownerDocument,aura=doc.createElement('span'),number=doc.createElement('span')
    aura.className='fs-heal-aura';aura.setAttribute('aria-hidden','true');number.className='fs-heal-number';number.textContent='+'+effect.amount;number.setAttribute('role','status');number.setAttribute('aria-label','回复 '+effect.amount+' 点体力');number.dataset.healTarget=seat
    for(const node of [aura,number]){node.style.animationDelay=-elapsed+'ms';anchor.append(node)}
  }
}
