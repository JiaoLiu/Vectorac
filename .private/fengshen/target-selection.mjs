// An unconfirmed single target is replaceable. Only ordered Collateral uses
// the first target to narrow the second target's candidates.
export function cardTargetCandidates(actions,as,targets=[]){
 const options=actions.filter(a=>a.as===as)
 if(as==='collateral')return [...new Set(options.filter(a=>!targets.length||a.targets[0]===targets[0]).map(a=>a.targets[targets.length?1:0]))]
 return [...new Set(options.flatMap(a=>a.targets))]
}
export function selectingTargets(ui,view){
 if(view.pending)return view.pending.actor===0&&(['liuli','yiji','tuxi'].includes(view.pending.kind)||ui.selected.length>0)
 return view.current===0&&view.phase==='play'&&(ui.selected.length>0||!!ui.skill)
}
export function replaceTarget(targets,seat){return targets.includes(seat)?[]:[seat]}
export function boundedTargets(targets,seat,limit){return targets.includes(seat)?targets.filter(t=>t!==seat):targets.length>=limit?targets.slice(1).concat(seat):targets.concat(seat)}
