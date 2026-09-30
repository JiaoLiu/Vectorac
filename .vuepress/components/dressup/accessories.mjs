// New shapes, each with its own independently drawn product and wearable.
const item=(category,index,name,price,tag,fit={})=>({id:`${category}-${index}`,category,index,name,price,tag,assetVersion:'v11',...fit})
export const ACCESSORIES=[
 item('hair',4,'轻盈双麻花辫',65,'学院'),
 item('hair',5,'柔顺帘刘海长发',75,'清新'),
 item('headpiece',10,'薰衣草丝带发梳',40,'自然'),
 item('headpiece',11,'星辉珍珠发箍',60,'星光'),
 item('hat',10,'缎带钟形帽',65,'自然',{cap:true}),
 item('hat',11,'蝶影纱网小礼帽',75,'古典',{wearVersion:'v12'}),
 item('earrings',8,'银蝶珍珠耳坠',40,'梦幻'),
 item('earrings',9,'琥珀叶滴耳钉',35,'自然'),
 item('socks',6,'星点中筒袜',35,'星光'),
 item('socks',7,'绞花过膝袜',45,'学院'),
 item('shoes',4,'珍珠芭蕾绑带鞋',65,'甜美',{sockEnd:955}),
 item('shoes',5,'奶油系带中筒靴',80,'学院',{sockEnd:810})
]
