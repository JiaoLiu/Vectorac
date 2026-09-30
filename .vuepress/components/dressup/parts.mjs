export const CATEGORIES = [
  {id:'top',name:'上衣'},{id:'bottom',name:'下装'},{id:'headpiece',name:'头饰'},
  {id:'hat',name:'帽子'},{id:'earrings',name:'耳环'},{id:'socks',name:'袜子'},
  {id:'shoes',name:'鞋子'},{id:'face',name:'脸型'},{id:'brows',name:'眉毛'},{id:'lip',name:'口红'}
]
const groups={
  top:[['花瓣衬衫',0,'甜美'],['海风水手领',90,'清新'],['玉兰绣衫',120,'国风'],['夜色丝绒',140,'古典']],
  bottom:[['蔷薇蕾丝裙',0,'甜美'],['藏蓝百褶裙',80,'学院'],['桃花长裙',130,'国风'],['奶油阔腿裤',100,'古典']],
  headpiece:[['珍珠蝴蝶结',0,'甜美'],['雏菊发夹',35,'自然'],['蝶舞金钗',65,'国风'],['星月发夹',55,'星光']],
  hat:[['花边草帽',60,'自然'],['天鹅绒贝雷帽',55,'学院'],['碧玉花冠',90,'国风'],['月光小皇冠',90,'梦幻']],
  earrings:[['珍珠耳坠',30,'古典'],['星星耳坠',35,'星光'],['玉滴耳坠',50,'国风'],['红心耳钉',30,'甜美']],
  socks:[['奶油花边袜',0,'甜美'],['海军蓝长袜',35,'学院'],['花影薄纱袜',45,'自然'],['夜色长袜',40,'古典']],
  shoes:[['蔷薇玛丽珍',0,'甜美'],['学院乐福鞋',60,'学院'],['绣花软鞋',75,'国风'],['金扣短靴',80,'古典']],
  face:[['自然鹅蛋脸',0,'自然'],['柔和圆脸',0,'甜美'],['精致心形脸',0,'梦幻'],['清晰轮廓脸',0,'古典']],
  brows:[['自然眉',0,'自然'],['柔和一字眉',0,'甜美'],['弯月眉',0,'古典'],['英气眉',0,'学院']],
  lip:[['自然唇色',0,'自然'],['玫瑰豆沙',0,'甜美'],['珊瑚橘',0,'清新'],['莓果红',0,'古典'],['樱花粉',0,'梦幻']]
}
export const PARTS=Object.entries(groups).flatMap(([category,rows])=>rows.map(([name,price,tag],index)=>({id:`${category}-${index}`,category,index,name,price,tag})))
for(const category of ['headpiece','hat','earrings','socks'])PARTS.push({id:`${category}-none`,category,index:-1,name:'不佩戴',price:0,tag:''})
export const FREE_PARTS=PARTS.filter(p=>p.price===0).map(p=>p.id)
export const DEFAULT_PARTS={top:'top-0',bottom:'bottom-0',headpiece:'headpiece-none',hat:'hat-none',earrings:'earrings-none',socks:'socks-0',shoes:'shoes-0',face:'face-0',brows:'brows-0',lip:'lip-0'}
export const partAsset=p=>p.index<0||['brows','lip'].includes(p.category)?'':`/img/games/dressup/layers/${p.category}-${p.index}.webp`
export function validParts(raw,owned=FREE_PARTS){const result={};for(const c of CATEGORIES){const p=PARTS.find(p=>p.id===(raw||{})[c.id]&&p.category===c.id);result[c.id]=p&&owned.includes(p.id)?p.id:DEFAULT_PARTS[c.id]}return result}
export function fineTags(parts){return [...new Set(Object.values(parts).map(id=>PARTS.find(p=>p.id===id)).filter(Boolean).map(p=>p.tag).filter(Boolean))]}
