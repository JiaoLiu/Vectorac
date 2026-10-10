// Authoritative one-to-one target mapping. This is NOT an enabled hero pool.
// Historical classic skill names identify the full source general, not a mix
// of freely selectable primitives. Detailed event versions still need audit.
const rows=[
 ['standard','liubei','刘备','jifa','姬发',4,'male','shu','rende jijiang','仁德 激将'],
 ['standard','guanyu','关羽','jinzha','金吒',4,'male','shu','wusheng','武圣'],
 ['standard','zhangfei','张飞','nezha','哪吒',4,'male','shu','paoxiao','咆哮'],
 ['standard','zhugeliang','诸葛亮','jiangziya','姜子牙',3,'male','shu','guanxing kongcheng','观星 空城'],
 ['standard','zhaoyun','赵云','yangjian','杨戬',4,'male','shu','longdan','龙胆'],
 ['standard','machao','马超','leizhenzi','雷震子',4,'male','shu','mashu tieji','马术 铁骑'],
 ['standard','huangyueying','黄月英','jinling','金灵圣母',3,'female','shu','jizhi qicai','集智 奇才'],
 ['standard','sunquan','孙权','yunzhongzi','云中子',4,'male','wu','zhiheng jiuyuan','制衡 救援'],
 ['standard','ganning','甘宁','zhaogongming','赵公明',4,'male','wu','qixi','奇袭'],
 ['standard','lvmeng','吕蒙','duobao','多宝道人',4,'male','wu','keji','克己'],
 ['standard','huanggai','黄盖','chenqi','陈奇',4,'male','wu','kurou','苦肉'],
 ['standard','zhouyu','周瑜','guangchengzi','广成子',3,'male','wu','yingzi fanjian','英姿 反间'],
 ['standard','daqiao','大乔','yunxiao','云霄',3,'female','wu','guose liuli','国色 流离'],
 ['standard','luxun','陆逊','kongxuan','孔宣',3,'male','wu','qianxun lianying','谦逊 连营'],
 ['standard','sunshangxiang','孙尚香','isis','伊西斯',3,'female','wu','jieyin xiaoji','结姻 枭姬'],
 ['standard','caocao','曹操','dixin','帝辛',4,'male','wei','jianxiong hujia','奸雄 护驾'],
 ['standard','simayi','司马懿','wenzhong','闻仲',3,'male','wei','fankui guicai','反馈 鬼才'],
 ['standard','xiahoudun','夏侯惇','zhenglun','郑伦',4,'male','wei','ganglie','刚烈'],
 ['standard','zhangliao','张辽','tuxingsun','土行孙',4,'male','wei','tuxi','突袭'],
 ['standard','xuchu','许褚','moliqing','魔礼青',4,'male','wei','luoyi','裸衣'],
 ['standard','guojia','郭嘉','yuding','玉鼎真人',3,'male','wei','tiandu yiji','天妒 遗计'],
 ['standard','zhenji','甄姬','shiji','石矶娘娘',3,'female','wei','luoshen qingguo','洛神 倾国'],
 ['standard','huatuo','华佗','taiyi','太乙真人',3,'male','qun','qingnang jijiu','青囊 急救'],
 ['standard','diaochan','貂蝉','daji','妲己',3,'female','qun','lijian biyue','离间 闭月'],
 ['standard','lvbu','吕布','huangfeihu','黄飞虎',4,'male','qun','wushuang','无双'],
 ['wind','huangzhong','黄忠','houyi','后羿',4,'male','shu','liegong','烈弓'],
 ['wind','weiyan','魏延','hades','哈迪斯',4,'male','shu','kuanggu','狂骨'],
 ['wind','xiahouyuan','夏侯渊','huangtianhua','黄天化',4,'male','wei','shensu','神速'],
 ['wind','caoren','曹仁','lijing','李靖',4,'male','wei','jushou','据守'],
 ['wind','zhoutai','周泰','weihu','韦护',4,'male','wu','buqu','不屈'],
 ['wind','xiaoqiao','小乔','longji','龙吉公主',3,'female','wu','tianxiang hongyan','天香 红颜'],
 ['wind','zhangjiao','张角','randeng','燃灯道人',3,'male','qun','leiji guidao huangtian','雷击 鬼道 黄天'],
 ['wind','yuji','于吉','shengongbao','申公豹',3,'male','qun','guhuo','蛊惑'],
 ['fire','wolong','卧龙诸葛亮','odin','奥丁',3,'male','shu','bazhen huoji kanpo','八阵 火计 看破'],
 ['fire','pangtong','庞统','tsukuyomi','月读',3,'male','shu','lianhuan niepan','连环 涅槃'],
 ['fire','xunyu','荀彧','fuxi','伏羲',3,'male','wei','quhu jieming','驱虎 节命'],
 ['fire','dianwei','典韦','thor','索尔',4,'male','wei','qiangxi','强袭'],
 ['fire','taishici','太史慈','susanoo','须佐之男',4,'male','wu','tianyi','天义'],
 ['fire','pangde','庞德','luya','陆压',4,'male','qun','mashu mengjin','马术 猛进'],
 ['fire','yanliangwenchou','颜良文丑','anubis','阿努比斯',4,'male','qun','shuangxiong','双雄'],
 ['fire','yuanshao','袁绍','yuanshi','元始天尊',4,'male','qun','luanji xueyi','乱击 血裔'],
 ['forest','menghuo','孟获','poseidon','波塞冬',4,'male','shu','huoshou zaiqi','祸首 再起'],
 ['forest','zhurong','祝融','dengchanyu','邓婵玉',4,'female','shu','juxiang lieren','巨象 烈刃'],
 ['forest','caopi','曹丕','tongtian','通天教主',3,'male','wei','xingshang fangzhu songwei','行殇 放逐 颂威'],
 ['forest','xuhuang','徐晃','muzha','木吒',4,'male','wei','duanliang','断粮'],
 ['forest','lusu','鲁肃','zeus','宙斯',3,'male','wu','haoshi dimeng','好施 缔盟'],
 ['forest','sunjian','孙坚','ra','拉',4,'male','wu','yinghun','英魂'],
 ['forest','dongzhuo','董卓','luoxuan','罗宣',8,'male','qun','jiuchi roulin benghuai baonue','酒池 肉林 崩坏 暴虐'],
 ['forest','jiaxu','贾诩','loki','洛基',3,'male','qun','wansha luanwu weimu','完杀 乱武 帷幕'],
 ['mountain','liushan','刘禅','nanji','南极仙翁',3,'male','shu','xiangle fangquan ruoyu','享乐 放权 若愚'],
 ['mountain','jiangwei','姜维','yangren','杨任',4,'male','shu','tiaoxin zhiji','挑衅 志继'],
 ['mountain','zhanghe','张郃','zhangkui','张奎',4,'male','wei','qiaobian','巧变'],
 ['mountain','dengai','邓艾','juliusun','惧留孙',4,'male','wei','tuntian zaoxian','屯田 凿险'],
 ['mountain','sunce','孙策','yinjiao','殷郊',4,'male','wu','jiang hunzi zhiba','激昂 魂姿 制霸'],
 ['mountain','zhangzhaozhanghong','张昭张纮','laozi','老子',3,'male','wu','zhijian guzhen','直谏 固政'],
 ['mountain','zuoci','左慈','sunwukong','孙悟空',3,'male','qun','huashen xinsheng','化身 新生'],
 ['mountain','caiwenji','蔡文姬','bixiao','碧霄',3,'female','qun','beige duanchang','悲歌 断肠'],
 ['yijiang2011','wuguotai','吴国太','nuwa','女娲',3,'female','wu','ganlu buyi','甘露 补益'],
 ['yijiang2011','caozhi','曹植','apollo','阿波罗',3,'male','wei','luoying jiushi','落英 酒诗'],
 ['yijiang2011','zhangchunhua','张春华','bastet','芭丝特',3,'female','wei','jueqing shangshi','绝情 伤逝'],
 ['yijiang2012','wangyi','王异','athena','雅典娜',3,'female','wei','zhenlie miji','贞烈 秘计'],
 ['yijiang2012','bulianshi','步练师','amaterasu','天照',3,'female','wu','anxu zhuiyi','安恤 追忆'],
 ['yijiang2013','guanyinping','关银屏','artemis','阿尔忒弥斯',3,'female','shu','xueji huxiao wuji','血祭 虎啸 武继'],
 ['yijiang2013','fuhuanghou','伏皇后','qiongxiao','琼霄',3,'female','qun','zhuikong qiuyuan','惴恐 求援'],
]
// Only the Standard batch has implementation + focused timing + AI/save tests.
// Expansion references remain disabled until they have the same evidence.
export const CANONICAL_ROSTER=rows.map(([pack,referenceId,referenceName,id,name,hp,sex,mechanicalFaction,skills,skillNames])=>({pack,referenceId,referenceName,id,name,hp,sex,mechanicalFaction,skills:skills.split(' '),sourceSkillNames:skillNames.split(' '),ruleset:'classic-identity-original',verification:pack==='standard'?'verified':'pending-full-text-review'}))
export const CANONICAL_BY_ID=Object.fromEntries(CANONICAL_ROSTER.map(h=>[h.id,h]))
export const PACK_NAMES={standard:'标准',wind:'风',fire:'火',forest:'林',mountain:'山',yijiang2011:'一将成名2011',yijiang2012:'一将成名2012',yijiang2013:'一将成名2013'}
export function auditCanonicalRoster(heroes,alliances){
 const seen=new Set(),issues=[]
 for(const c of CANONICAL_ROSTER.filter(c=>c.verification==='verified'))if(!heroes.some(h=>h.id===c.id&&h.playable))issues.push(`${c.name}已核定但不在完整可玩将池中`)
 for(const h of heroes.filter(h=>h.playable)){
  const expected=CANONICAL_BY_ID[h.id]
  if(!expected){issues.push(`${h.name}未绑定完整参考武将`);continue}
  if(seen.has(expected.referenceId))issues.push(`${expected.referenceName}被多个人物重复使用`)
  seen.add(expected.referenceId)
  if(Object.keys(h.skillNames).sort().join('|')!==expected.skills.slice().sort().join('|'))issues.push(`${h.name}技能组不等于${expected.referenceName}（${PACK_NAMES[expected.pack]}）`)
  if(h.hp!==expected.hp||h.sex!==expected.sex)issues.push(`${h.name}体力／性别偏离完整参考武将`)
  if((h.mechanicalFaction||alliances[h.faction])!==expected.mechanicalFaction)issues.push(`${h.name}主公响应阵营偏离参考武将`)
  if(h.referenceId!==expected.referenceId||h.ruleset!==expected.ruleset)issues.push(`${h.name}缺少明确的原版身份规则版本绑定`)
  if(expected.verification!=='verified')issues.push(`${h.name}原版技能全文及结算时机尚未核定`)
 }
 return issues
}
