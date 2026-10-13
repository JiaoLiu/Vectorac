// New cuts, not palette editions. Existing IDs and purchases remain intact.
const pair=(index,top,bottom,tag,price)=>[
 {id:`top-${index}`,category:'top',index,name:top,tag,price,assetVersion:'v10'},
 {id:`bottom-${index}`,category:'bottom',index,name:bottom,tag,price:price+10,assetVersion:'v10'}
]
export const STYLES=[
 ...pair(12,'冰晶珍珠短衫','冰晶花瓣长裙','梦幻',95),
 ...pair(13,'蝶翼荷叶衫','蝶舞花瓣短裙','梦幻',75),
 ...pair(14,'草莓茶会衬衫','草莓格纹茶会裙','甜美',65),
 ...pair(15,'学院绞花针织衫','秋日格纹中裙','学院',70),
 ...pair(16,'森林叶绣斗篷衫','森光斜襟中裙','自然',80),
 ...pair(17,'玉莲交领短衫','玉莲垂缎长裙','国风',85)
]
