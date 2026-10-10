// Doudizhu's virtual-landscape fallback, scoped to this standalone game's CSS.
export function mediaMatches(text,width,height){
 let unknown=false
 for(const group of text.split(',')){
  let hit=true,known=true;const conditions=[...group.matchAll(/\(([^)]+)\)/g)].map(m=>m[1])
  if(!conditions.length){if(/^\s*(all|screen)?\s*$/.test(group))return true;unknown=true;continue}
  for(const condition of conditions){
   const size=condition.match(/^\s*(min|max)-(width|height)\s*:\s*([\d.]+)px\s*$/),orientation=condition.match(/^\s*orientation\s*:\s*(landscape|portrait)\s*$/)
   if(size){const value=size[2]==='width'?width:height;hit&&=size[1]==='max'?value<=Number(size[3]):value>=Number(size[3])}
   else if(orientation)hit&&=orientation[1]==='landscape'?width>height:height>=width
   else known=false
  }
  if(known&&hit)return true;if(!known)unknown=true
 }
 return unknown?null:false
}
export function bindVirtualMedia(doc){
 const saved=new Map()
 const collect=rules=>{for(const rule of rules){if(rule.media&&!saved.has(rule))saved.set(rule,rule.media.mediaText);if(rule.cssRules)collect(rule.cssRules)}}
 return {apply(force,width,height){for(const sheet of doc.styleSheets||[]){try{collect(sheet.cssRules||[])}catch{}}for(const [rule,original]of saved){const match=force?mediaMatches(original,width,height):null;rule.media.mediaText=match==null?original:match?'all':'not all'}},restore(){for(const [rule,original]of saved)rule.media.mediaText=original;saved.clear()}}
}
export function logicalScreen({width,height,immersive,mobile,rotated}){const force=!!immersive&&!!mobile&&!rotated&&height>width;return {width:force?height:width,height:force?width:height,force}}
// Beams, animations and drag coordinates must use the inverse of rotation.
export function localPoint(root,x,y){
 const r=root.getBoundingClientRect(),rotated=root.classList.contains('fs-force-landscape'),scale=(rotated?r.height:r.width)/root.clientWidth||1
 return rotated?{x:(y-r.top)/scale,y:root.clientHeight-(x-r.left)/scale}:{x:(x-r.left)/scale,y:(y-r.top)/scale}
}
