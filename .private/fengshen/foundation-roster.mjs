// Remaining original Forest/Mountain profiles. No God/SP/revised variants.
export const FOUNDATION_PROFILES=[
 ['dongzhuo',8,'qun','jiuchi roulin benghuai baonue'],['liushan',3,'shu','xiangle fangquan ruoyu'],
 ['jiangwei',4,'shu','tiaoxin zhiji'],['zhanghe',4,'wei','qiaobian'],['dengai',4,'wei','tuntian zaoxian'],
 ['sunce',4,'wu','jiang hunzi zhiba'],['zhangzhaozhanghong',3,'wu','zhijian guzhen'],
].map(([id,hp,faction,skills])=>({id,hp,faction,sex:'male',skills:skills.split(' ')}))
export const FOUNDATION_SKILLS={
 jiuchi:['酒池','一张黑桃手牌可当琼浆使用，也可在自己濒死时当琼浆自救；出牌阶段仍受酒的次数限制。','convert'],
 roulin:['肉林','锁定技：你的杀对女性角色，或女性角色的杀对你，需要连续两张闪才能抵消；不会与另一项双闪效果叠成四张。','locked'],
 benghuai:['崩坏','锁定技：结束阶段，若你的体力不是场上最低，必须选择失去一点体力或一点体力上限。','locked'],
 baonue:['暴虐','主公技：其他玄盟角色造成一次伤害后，可进行判定；黑桃则令你回复一点体力。','lord'],
 xiangle:['享乐','锁定技：成为杀的目标时，使用者须额外弃一张基本手牌，否则这张杀对你无效。','locked'],
 fangquan:['放权','可跳过出牌阶段；本回合弃牌完成后，可弃一张手牌，令一名其他存活角色在本回合结束后立即获得一个额外回合。','trigger'],
 ruoyu:['若愚','主公觉醒技：准备阶段，若体力为场上最低（含并列），体力上限加一、回复一点，并获得伐纣。每局一次。','wake'],
 tiaoxin:['挑衅','出牌阶段限一次：选一名攻击范围包含你的其他角色；他须对你使用一张合法的杀，否则由你弃置其一张手牌或装备。','active'],
 zhiji:['志继','觉醒技：准备阶段没有手牌时，体力上限减一，选择回复一点或摸两张，并获得推演。每局一次。','wake'],
 qiaobian:['巧变','判定、摸牌、出牌、弃牌阶段前，可弃一张手牌跳过该阶段。跳过摸牌时可获得至多两人各一张手牌；跳过出牌时可移动场上的一张装备或阵法到另一名合法角色的对应区域。','trigger'],
 tuntian:['屯田','回合外失去手牌或装备后，可判定；不是红桃则将最终判定牌置为田。计算你到其他人的距离时，减少田的数量。','trigger'],
 zaoxian:['凿险','觉醒技：准备阶段有至少三张田，体力上限减一并获得夺域，可将一张田当摄宝使用。每局一次。','wake'],
 jixi:['急袭','将一张田当摄宝使用；仍须满足距离、目标区域及法术限制。','active'],
 jiang:['激昂','使用红色杀或斗法，或成为红色杀／斗法的目标时，摸一张牌。只按目标确认触发，不按伤害点数重复触发。','trigger'],
 hunzi:['魂姿','觉醒技：准备阶段体力恰为一点时，体力上限减一并获得仙姿和日魂；不额外回血或摸牌。每局一次。','wake'],
 zhiba:['制霸','主公技：其他金盟角色的出牌阶段限一次，可与你拼点；其未赢时，你可获得双方拼点牌。你觉醒后可拒绝此次拼点。','lord'],
 zhijian:['直谏','出牌阶段，将一张装备手牌装给装备槽为空的其他角色，然后摸一张牌；没有距离限制，不替换已有装备。','active'],
 guzhen:['固政','其他角色弃牌阶段结束后，可从其弃置的手牌中选一张返还给他，并获得该弃牌阶段仍在弃牌堆的其余弃牌。','trigger'],
}
export const FOUNDATION_NAMES={jiuchi:'焰酿',roulin:'炽威',benghuai:'焚身',baonue:'炎统',xiangle:'安仙',fangquan:'授道',ruoyu:'归真',tiaoxin:'观战',zhiji:'通明',qiaobian:'地变',tuntian:'仙田',zaoxian:'破土',jixi:'夺域',jiang:'王气',hunzi:'神觉',zhiba:'王令',zhijian:'传宝',guzhen:'守道'}
export const FOUNDATION_HEROES=[
 ['luoxuan','罗宣','火德星君','jie','domineering bronze-armored crimson fire immortal'],
 ['nanji','南极仙翁','南极寿星','chan','kind ancient longevity sage with crane staff and peach'],
 ['yangren','杨任','五路神君','zhou','scholarly green-robed celestial seer with palm eye sigil'],
 ['zhangkui','张奎','地行独角','shang','rugged black-bronze earth-travelling warrior with broad sabre'],
 ['juliusun','惧留孙','夹龙地仙','chan','ancient saffron earth sage with golden binding rope'],
 ['yinjiao','殷郊','值年太岁','shang','young royal blue-bronze celestial warrior with sword and bell'],
 ['laozi','老子','太清道祖','chan','dignified white-bearded indigo-robed patriarch with jade ruyi'],
].map(([id,name,title,faction,artDirection],i)=>({id,name,title,faction,artDirection,skillNames:Object.fromEntries(FOUNDATION_PROFILES[i].skills.map(s=>[s,FOUNDATION_NAMES[s]])),image:`assets/heroes/${id}.jpg`,thumbnail:`assets/heroes/${id}-thumb.jpg`}))
