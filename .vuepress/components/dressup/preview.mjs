import {PARTS} from './parts.mjs'

// A fitting-room draft is independent per slot. Trying an accessory must never
// discard an unpurchased blouse/skirt; none of these drafts grants ownership.
export function selectPreview(draft,id,owned){
  const p=PARTS.find(p=>p.id===id)
  if(!p)return {...draft}
  const next={...draft}
  if(owned.includes(id))delete next[p.category]
  else next[p.category]=id
  return next
}
export const displayParts=(parts,draft)=>({...parts,...draft})
export const previewItems=draft=>Object.values(draft).map(id=>PARTS.find(p=>p.id===id)).filter(Boolean)
export function purchasedPreview(draft,id){
  const p=PARTS.find(p=>p.id===id),next={...draft}
  if(p)delete next[p.category]
  return next
}
