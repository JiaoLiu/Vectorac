import {EDITIONS} from './collections.mjs'
import {STYLES} from './styles.mjs'
import {ACCESSORIES} from './accessories.mjs'
import {JEWELLERY_FOOTWEAR} from './jewellery-footwear.mjs'
export const CATEGORIES = [
  {id:'top',name:'上衣'},{id:'bottom',name:'下装'},{id:'hair',name:'发型'},{id:'headpiece',name:'头饰'},
  {id:'hat',name:'帽子'},{id:'earrings',name:'耳环'},{id:'necklace',name:'项链'},{id:'wrist',name:'手饰'},{id:'socks',name:'袜子'},
  {id:'shoes',name:'鞋子'},{id:'face',name:'脸型'},{id:'eyes',name:'眼睛'},{id:'brows',name:'眉毛'},{id:'lip',name:'口红'}
]
export const PART_GROUPS=[
 {id:'clothing',name:'服装',categories:['top','bottom','socks','shoes']},
 {id:'hair',name:'发饰',categories:['hair','headpiece','hat']},
 {id:'jewellery',name:'首饰',categories:['earrings','necklace','wrist']},
 {id:'makeup',name:'妆容',categories:['face','eyes','brows','lip']}
]
const groups={
  top:[['花瓣衬衫',0,'甜美'],['海风水手领',90,'清新'],['玉兰绣衫',120,'国风'],['夜色丝绒',140,'古典']],
  bottom:[['蔷薇蕾丝裙',0,'甜美'],['藏蓝百褶裙',80,'学院'],['桃花长裙',130,'国风'],['奶油阔腿裤',100,'古典']],
  hair:[['轻柔短发',0,'清新'],['浪漫长卷发',70,'甜美'],['轻盈高马尾',50,'学院'],['典雅盘发',80,'古典']],
  headpiece:[['珍珠蝴蝶结',0,'甜美'],['雏菊发夹',35,'自然'],['蝶舞金钗',65,'国风'],['星月发夹',55,'星光']],
  hat:[['花边草帽',60,'自然'],['天鹅绒贝雷帽',55,'学院'],['碧玉花冠',90,'国风'],['月光小皇冠',90,'梦幻']],
  earrings:[['珍珠耳坠',30,'古典'],['星星耳坠',35,'星光'],['玉滴耳坠',50,'国风'],['红心耳钉',30,'甜美']],
  socks:[['奶油花边短袜',0,'甜美'],['海军蓝及膝袜',35,'学院'],['花影薄纱中筒袜',45,'自然'],['夜色及膝袜',40,'古典'],['奶油蕾丝过膝袜',45,'甜美'],['夜色蕾丝过膝袜',45,'古典']],
  shoes:[['蔷薇玛丽珍',0,'甜美'],['学院乐福鞋',60,'学院'],['绣花软鞋',75,'国风'],['金扣短靴',80,'古典']],
  face:[['自然鹅蛋脸',0,'自然'],['柔和圆脸',0,'甜美'],['精致心形脸',0,'梦幻'],['清晰轮廓脸',0,'古典']],
  eyes:[['暖棕圆眸',0,'自然'],['深棕杏眼',0,'古典'],['碧绿眼眸',0,'自然'],['蓝灰眼眸',0,'梦幻']],
  brows:[['自然眉',0,'自然'],['柔和一字眉',0,'甜美'],['弯月眉',0,'古典'],['英气眉',0,'学院']],
  lip:[['自然唇色',0,'自然'],['玫瑰豆沙',0,'甜美'],['珊瑚橘',0,'清新'],['莓果红',0,'古典'],['樱花粉',0,'梦幻']]
}
export const PARTS=Object.entries(groups).flatMap(([category,rows])=>rows.map(([name,price,tag],index)=>({id:`${category}-${index}`,category,index,name,price,tag})))
PARTS.push(...EDITIONS)
PARTS.push(...STYLES)
PARTS.push(...ACCESSORIES)
PARTS.push(...JEWELLERY_FOOTWEAR)
// Reuse corrected wearing art across colour editions; catalogue designs stay
// independent and old purchase/save IDs do not change.
for(const p of PARTS)if(p.category==='bottom'&&((p.sourceIndex===undefined?p.index:p.sourceIndex)===2||p.index>=12))p.wearVersion='v13'
for(const category of ['headpiece','hat','earrings','necklace','wrist','socks'])PARTS.push({id:`${category}-none`,category,index:-1,name:'不佩戴',price:0,tag:''})
export const FREE_PARTS=PARTS.filter(p=>p.price===0).map(p=>p.id)
export const DEFAULT_PARTS={top:'top-0',bottom:'bottom-0',hair:'hair-0',headpiece:'headpiece-none',hat:'hat-none',earrings:'earrings-none',necklace:'necklace-none',wrist:'wrist-none',socks:'socks-0',shoes:'shoes-0',face:'face-0',eyes:'eyes-0',brows:'brows-0',lip:'lip-0'}
export const REGISTERED_CATEGORIES=['top','bottom','hair','hat','socks','shoes','face','eyes','brows','lip','necklace','wrist']
export const HEAD_CATEGORIES=['hair','hat','face','eyes','brows','lip']
// The ponytail keeps its original registered wearable; catalogue redesigns
// must not substitute a newly illustrated hairstyle on the model.
export const fitIndex=p=>p.sourceIndex===undefined?p.index:p.sourceIndex
export function partAsset(p){
 if(p.index<0)return ''
 const version=p.wearVersion||(p.category==='hat'&&[0,3].includes(fitIndex(p))||p.category==='bottom'&&p.index>=12?'v11':p.assetVersion||(p.category==='brows'&&p.index>=2?'v10':p.category==='face'?'v8':HEAD_CATEGORIES.includes(p.category)?'v7':REGISTERED_CATEGORIES.includes(p.category)?'v5':''))
 return `/img/games/dressup/layers/${version?version+'/':''}${p.category}-${fitIndex(p)}${p.id==='hair-2'?'-restored':''}.webp`
}
export const partBackAsset=p=>p&&p.back&&p.index>=0?`/img/games/dressup/layers/${p.wearVersion||p.assetVersion}/${p.id}-back.webp`:''
// Product/design cards and the registered wearable layers have separate contracts.
export const partThumbnail=p=>p.index<0?'':`/img/games/dressup/layers/${p.assetVersion|| (p.category==='brows'&&p.index>=2?'v10':'v7')}/catalog/${p.category}-${fitIndex(p)}.webp`
export function validParts(raw,owned=FREE_PARTS){const result={};for(const c of CATEGORIES){const p=PARTS.find(p=>p.id===(raw||{})[c.id]&&p.category===c.id);result[c.id]=p&&owned.includes(p.id)?p.id:DEFAULT_PARTS[c.id]}return result}
export function fineTags(parts){return [...new Set(Object.values(parts).map(id=>PARTS.find(p=>p.id===id)).filter(Boolean).map(p=>p.tag).filter(Boolean))]}
