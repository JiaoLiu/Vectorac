// Material editions share the original pattern/attachment. No extra full-body
// bitmap download, and an edition must never change a garment's alpha or fit.
const edition=(category,index,sourceIndex,name,price,tag,color,pattern='',ink='#f9ead1')=>({
 id:`${category}-${index}`,category,index,sourceIndex,name,price,tag,
 material:{color,pattern,ink}
})
export const EDITIONS=[
 edition('top',4,0,'薄荷雏菊衬衫',55,'自然','#83aaa0','daisy'),
 edition('top',5,0,'蓝莓波点衬衫',55,'学院','#8e9cbc','dot'),
 edition('top',6,1,'樱桃水手领',60,'甜美','#ad5069'),
 edition('top',7,1,'海盐水手领',60,'清新','#629998'),
 edition('top',8,2,'暮紫绣衫',75,'国风','#9788b6'),
 edition('top',9,2,'青竹绣衫',75,'国风','#7b9d85'),
 edition('top',10,3,'祖母绿丝绒',85,'古典','#487d70'),
 edition('top',11,3,'星砂丝绒',85,'星光','#767498','star'),
 edition('bottom',4,0,'薄荷花园裙',60,'自然','#83aaa0','daisy'),
 edition('bottom',5,0,'蓝莓波点裙',60,'学院','#8e9cbc','dot'),
 edition('bottom',6,1,'樱桃百褶裙',55,'甜美','#ad5069'),
 edition('bottom',7,1,'海盐百褶裙',55,'清新','#629998'),
 edition('bottom',8,2,'暮紫花影长裙',80,'国风','#9788b6'),
 edition('bottom',9,2,'青竹花影长裙',80,'国风','#7b9d85'),
 edition('bottom',10,3,'可可阔腿裤',65,'古典','#aa8370'),
 edition('bottom',11,3,'星砂阔腿裤',65,'星光','#9099b6','star'),
 edition('headpiece',4,0,'海盐珍珠蝴蝶结',25,'清新','#779ba6'),
 edition('headpiece',5,0,'葡萄珍珠蝴蝶结',25,'梦幻','#9a84af'),
 edition('headpiece',6,1,'蜜桃花夹',25,'甜美','#e19b97'),
 edition('headpiece',7,1,'晴空花夹',25,'清新','#83b1c0'),
 edition('headpiece',8,2,'玫瑰金蝶钗',40,'古典','#bc917e'),
 edition('headpiece',9,3,'紫晶星月夹',35,'星光','#9d88b6'),
 edition('hat',4,0,'蜜桃花边草帽',40,'甜美','#d7ac95'),
 edition('hat',5,0,'湖畔花边草帽',40,'清新','#9bb9ae'),
 edition('hat',6,1,'莓果丝绒贝雷帽',40,'甜美','#a75870'),
 edition('hat',7,1,'森林丝绒贝雷帽',40,'自然','#538575'),
 edition('hat',8,2,'紫藤花冠',60,'梦幻','#aa91bb'),
 edition('hat',9,3,'玫瑰金小皇冠',60,'古典','#be9b8b'),
 edition('earrings',4,0,'蜜桃珍珠耳坠',20,'甜美','#d6b199'),
 edition('earrings',5,1,'紫晶星星耳坠',25,'梦幻','#9688b9'),
 edition('earrings',6,2,'海蓝宝耳坠',30,'清新','#73a4b0'),
 edition('earrings',7,3,'紫莓爱心耳钉',20,'梦幻','#a278ac')
]
