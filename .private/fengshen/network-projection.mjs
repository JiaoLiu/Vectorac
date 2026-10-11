// Public views only. Never rotate the authoritative state or infer concealed roles.
const scalar=new Set(['seat','source','target','actor','victim','commandedBy','requester','owner','from','to','recipient','by','lord','first','current'])
const lists=new Set(['targets','eligibleSeats'])
export function seatMap(value,viewer,count,inverse=false){return Number.isInteger(value)&&value>=0&&value<count?(value+(inverse?viewer:count-viewer))%count:value}
function mapObject(value,viewer,count,inverse=false,key=''){
 if(value==null)return value
 if(Array.isArray(value))return lists.has(key)?value.map(v=>seatMap(v,viewer,count,inverse)):value.map(v=>mapObject(v,viewer,count,inverse))
 if(typeof value!=='object')return scalar.has(key)?seatMap(value,viewer,count,inverse):value
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mapObject(v,viewer,count,inverse,k)]))
}
export function rotateView(view,viewer){
 const n=view.players.length,out=mapObject(view,viewer,n),order=Array.from({length:n},(_,i)=>(i+viewer)%n)
 out.players=order.map(i=>out.players[i]);out.seat=0
 for(const key of ['sides','suspicion','attackRanges'])if(Array.isArray(view[key]))out[key]=order.map(i=>view[key][i])
 if(Array.isArray(out.legal)&&view.pending?.kind==='tuxi')for(const a of out.legal)if(a.targets)a.value=a.targets.join(',')
 return out
}
export function absoluteAction(action,viewer,count,pending){
 const allowed=['type','skill','as','ids','targets','target','value','top','bottom','heroId','guhuo','revision','promptId']
 const a=mapObject(Object.fromEntries(allowed.filter(k=>action[k]!==undefined).map(k=>[k,action[k]])),viewer,count,true)
 if(a.type==='choose'&&pending?.kind==='tuxi'&&a.value!=='normal'&&typeof a.value==='string')a.value=a.value.split(',').map(x=>seatMap(Number(x),viewer,count,true)).join(',')
 return a
}
