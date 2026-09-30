// Each is a new silhouette, not a recolour. Jewellery uses independent slots.
const item=(category,index,name,price,tag,fit={})=>({id:`${category}-${index}`,category,index,name,price,tag,assetVersion:'v12',...fit})
export const JEWELLERY_FOOTWEAR=[
 item('shoes',6,'晴日轻跑运动鞋',65,'清新',{sockEnd:943,wearVersion:'v13'}),
 item('shoes',7,'山野复古跑鞋',75,'自然',{sockEnd:943,wearVersion:'v13'}),
 item('shoes',8,'奶油高帮帆布鞋',65,'学院',{sockEnd:897,wearVersion:'v13'}),
 item('shoes',9,'夜色系带马丁靴',85,'古典',{sockEnd:864,wearVersion:'v13'}),
 item('shoes',10,'秋野麂皮牛仔靴',90,'自然',{sockEnd:837,wearVersion:'v13'}),
 item('shoes',11,'巧克力及膝骑士靴',100,'古典',{sockEnd:722,wearVersion:'v13'}),
 item('necklace',0,'晨露珍珠项链',40,'甜美'),
 item('necklace',1,'星光细链',45,'星光'),
 item('necklace',2,'玉叶坠链',55,'国风'),
 item('necklace',3,'丝绒浮雕颈链',50,'古典'),
 item('wrist',0,'花信珍珠手链',35,'甜美',{back:true}),
 item('wrist',1,'清玉圆镯',45,'国风',{back:true}),
 item('wrist',2,'晨光皮革腕表',55,'学院',{wearVersion:'v13',back:true}),
 item('wrist',3,'银蝶双层手链',40,'清新',{back:true})
]
