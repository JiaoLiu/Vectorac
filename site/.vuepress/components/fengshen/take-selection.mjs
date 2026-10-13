// A selected back belongs to one prompt/revision, never to the next victim.
export function takeSelection({pending,revision,legal,selection,index,promptId,eventRevision}){
  const option=legal[index]
  if(pending?.kind!=='take'||pending.actor!==0||String(pending.id)!==String(promptId)||String(revision)!==String(eventRevision)||!Number.isInteger(index)||option?.type!=='choose')return {kind:'ignore'}
  const next={promptId:pending.id,revision,index,value:option.value}
  const same=selection?.promptId===pending.id&&selection.revision===revision&&selection.index===index&&selection.value===option.value
  return same?{kind:'commit',action:option}:{kind:'select',selection:next}
}
