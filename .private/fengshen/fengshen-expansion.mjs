// First playable expansion: references describe mechanics, not copied artwork.
const rows=[
 ['huangfeihu','黄飞虎','五岳武成','zhou',4,'male',{wushuang:'武成'},'吕布 / 双响应','mature bearded Chinese marshal, ornate jade-green and bronze armor, long polearm, sacred five-colored bull silhouette, commanding honest expression'],
 ['jinzha','金吒','金莲护法','zhou',4,'male',{wusheng:'金莲'},'关羽 / 红牌转杀','young adult Chinese warrior, gold-white armor, twin bronze swords, restrained lotus-gold light, swept-back black hair'],
 ['lijing','李靖','玲珑托塔','zhou',4,'male',{keji:'镇塔',jianxiong:'收镇'},'吕蒙 + 曹操 / 蓄牌收牌','stern middle-aged Chinese celestial commander, long neat beard, dark green gold ceremonial armor, a small luminous seven-storey pagoda held in one hand'],
 ['dengchanyu','邓婵玉','五光飞石','zhou',3,'female',{qingguo:'飞石',longdan:'巧击'},'甄姬 + 赵云 / 防御转化','adult Chinese female general, practical crimson and ivory armor, high tied dark hair, five small colorful glowing stones, confident sharp-eyed expression, fully clothed'],
 ['huangtianhua','黄天化','炳灵少年','zhou',4,'male',{longdan:'攒心',wusheng:'玉麟'},'赵云 + 关羽 / 攻防转化','young adult Chinese immortal warrior, silver bronze armor, pair of short maces, a tiny golden heart-piercing dart, jade qilin silhouette, youthful resolute face'],
 ['weihu','韦护','三教护法','chan',3,'male',{mashu:'护道',wushuang:'降魔'},'马超 + 吕布 / 近身双响应','powerful bald adult Chinese guardian monk, saffron and dark bronze protective robes, long heavy golden vajra staff, disciplined calm face'],
 ['kongxuan','孔宣','五色神光','shang',3,'male',{qixi:'五色摄宝',qicai:'孔雀明光'},'甘宁 + 黄月英 / 拆宝控制','regal adult Chinese deity with sharp beautiful face, dark turquoise and gold armor, subtle five-colored peacock feather halo, one raised hand drawing an artifact into light'],
 ['luya','陆压','西昆散仙','chan',3,'male',{qixi:'斩仙',tieji:'钉魂'},'甘宁 + 马超 / 拆牌强攻','lean ancient Chinese wandering immortal, reddish beard, muted crimson and ochre robes, pale jade gourd releasing one tiny silver blade, mysterious piercing eyes'],
 ['qiongxiao','琼霄','碧游云仙','jie',3,'female',{qingguo:'云隐',jizhi:'云机'},'甄姬 + 黄月英 / 转闪过牌','adult Chinese immortal woman, dignified pale lilac and midnight blue robes, flowing long hair, jade cloud ornaments, quiet purple silver mist'],
 ['bixiao','碧霄','金蛟仙子','jie',3,'female',{qixi:'剪宝',yingzi:'碧云'},'甘宁 + 周瑜 / 拆牌摸牌','adult Chinese female immortal, vivid emerald and antique gold robes, small floating dragon-handled gold scissors, lively resolute face, dark green clouds'],
 ['zhenglun','郑伦','哼将镇魂','shang',4,'male',{qingguo:'玄气',keji:'镇魂'},'甄姬 + 吕蒙 / 防守蓄牌','massive adult Chinese armored general, iron and indigo armor, angry bronze face, two narrow streams of white mystical vapor at nostrils, heavy iron pestle'],
 ['chenqi','陈奇','哈将摄魄','shang',3,'male',{luoyi:'黄气',wushuang:'摄魄'},'许褚 + 吕布 / 爆发双响应','broad adult Chinese armored general, gold-bronze and red armor, short beard, a controlled golden breath vortex before his face, heavy war pestle'],
]
export const FENGSHEN_EXPANSION=rows.map(([id,name,title,faction,hp,sex,skillNames,reference,artDirection])=>({id,name,title,faction,hp,sex,skillNames,reference,artDirection,engineId:id,baseHero:null,playable:true,missingSkills:[],image:`assets/heroes/${id}.jpg`,thumbnail:`assets/heroes/${id}-thumb.jpg`}))
const equip=(name,slot,help,extra={})=>({name,category:'equip',slot,help,...extra})
export const EXPANSION_CARDS={
 guding:equip('化血神刀','weapon','攻击范围2。杀命中时，若目标没有手牌，伤害增加一点。',{range:2,symbol:'血',baseName:'古锭刀',artDirection:'single curved ancient crimson bronze saber, restrained red spectral aura, no gore'}),
 fan:equip('五火七禽扇','weapon','攻击范围4。使用普通杀时，可将其改为火属性杀；已是属性杀不能再转化。',{range:4,symbol:'扇',baseName:'朱雀羽扇',artDirection:'single elegant seven-feather ancient fan, five small controlled colored flames, bronze jade handle'}),
 silverlion:equip('莲花宝甲','armor','受到伤害时，每次至多承受一点；失去装备区此甲时，若存活，回复一点体力。',{symbol:'莲',baseName:'白银狮子',artDirection:'single silver and pale jade breastplate with sculpted lotus petals, warm protective glow'}),
 vine:equip('青莲宝色旗','armor','无视普通杀、万妖袭营和飞剑齐发；受到火属性伤害时增加一点。斩仙飞刀可忽略此防具。',{symbol:'旗',baseName:'藤甲',artDirection:'single teal-blue lotus sacred banner with bronze staff, translucent layered protective aura'}),
 firesha:{name:'炎杀',category:'basic',symbol:'炎',help:'火属性的杀：同样需要闪响应；对青莲宝色旗增加一点伤害。计入本阶段杀次数。',attackNature:'fire',baseName:'火杀',artDirection:'one ancient bronze spear enveloped in clear red-gold flame against dark cloud, strong simple silhouette'},
 thundersha:{name:'雷杀',category:'basic',symbol:'雷',help:'雷属性的杀：同样需要闪响应；可以穿透青莲宝色旗的普通杀防御。计入本阶段杀次数。',attackNature:'thunder',baseName:'雷杀',artDirection:'one ancient bronze spear carrying blue-white lightning against dark cloud, strong simple silhouette'},
 wine:{name:'琼浆',category:'basic',symbol:'酒',help:'出牌阶段限一次：本回合下一张杀伤害增加一点。自己濒死时也可使用，回复一点；不能用来救别人。',baseName:'酒',artDirection:'single antique bronze ceremonial wine cup with luminous golden liquid and restrained celestial mist'},
}
export function expandedDeck(makeBaseDeck){
 const cards=makeBaseDeck()
 // Append only: all legacy c0..c107 retain their exact type/suit/rank.
 const extras=[['guding','spade',1],['fan','diamond',1],['silverlion','club',1],['vine','spade',2],['firesha','heart',4],['firesha','heart',7],['firesha','diamond',10],['firesha','diamond',4],['thundersha','spade',6],['thundersha','club',7],['wine','spade',3],['wine','club',9],['wine','diamond',9]]
 for(const [type,suit,rank] of extras)cards.push({id:`c${cards.length}`,type,suit,rank})
 return cards
}
