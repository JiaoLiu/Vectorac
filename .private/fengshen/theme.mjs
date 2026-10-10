// Internal prototype: aliases do not constitute a cleared commercial design.
import { HERO_BY_ID, CARDS, SKILLS, makeDeck } from './core/catalog.mjs'
import {GODS,GOD_FACTIONS,GOD_ALLIANCES} from './gods.mjs'
import {FENGSHEN_EXPANSION,EXPANSION_CARDS,expandedDeck} from './fengshen-expansion.mjs'
import {CANONICAL_BY_ID}from './canonical-roster.mjs'

export const FACTIONS = { zhou:'周', shang:'商', chan:'阐', jie:'截',...GOD_FACTIONS }
export const ALLIANCES = { zhou:'shu', shang:'wei', chan:'wu', jie:'qun',...GOD_ALLIANCES }
const rows = [
  ['jiangziya','姜子牙','昆仑执榜', 'zhou','zhugeliang',3,'male', {guanxing:'推演',kongcheng:'垂钓'},'silver-haired elderly sage, long white beard, ivory and indigo robes, bamboo fishing rod, scroll, misty river; thoughtful stillness'],
  ['jifa','姬发','西岐明君','zhou','liubei',4,'male',{rende:'仁君',jijiang:'伐纣'},'young solemn king, bronze phoenix crown, jade and ivory ceremonial armor, command sword, dawn banners'],
  ['nezha','哪吒','莲火少年','zhou','zhangfei',4,'male',{paoxiao:'风火'},'adolescent lotus-born male warrior, twin hair buns, red silk ribbons, flaming spear, two fiery wheels, athletic fearless pose; youthful not sexualized'],
  ['yangjian','杨戬','清源显圣','zhou','zhaoyun',4,'male',{longdan:'九转'},'handsome adult warrior with luminous third eye, silver-blue lamellar armor, three-pointed double-edged polearm, black hunting hound silhouette'],
  ['leizhenzi','雷震子','风雷羽翼','zhou','machao',4,'male',{mashu:'风翼',tieji:'雷袭'},'powerful green-skinned winged thunder warrior, eagle wings, bronze staff, electricity, fierce angular face'],
  ['dixin','帝辛','殷商人王','shang','caocao',4,'male',{jianxiong:'帝威',hujia:'王卫'},'proud mature king, black and crimson heavy bronze armor, square jeweled crown, gilded ceremonial axe, burning palace skyline'],
  ['daji','妲己','九尾魅影','shang','diaochan',3,'female',{lijian:'魅惑',biyue:'妖颜'},'adult fox enchantress, elegant covered crimson-and-black court gown, white fox tails, gold hair ornament, cold intelligent expression, no nudity'],
  ['wenzhong','闻仲','三朝太师','shang','simayi',3,'male',{fankui:'雷鉴',guicai:'天眼'},'stern elderly general, third eye, long black-grey beard, dark bronze armor, paired thunder whips, storm cloud'],
  ['shengongbao','申公豹','逆道游说','shang','yuji',3,'male',{guhuo:'妖言'},'lean cunning middle-aged Taoist, sharp goatee, dark plum robes, obsidian prayer beads, black panther silhouette, green smoke'],
  ['moliqing','魔礼青','青锋天王','shang','xuchu',4,'male',{luoyi:'剑威'},'towering broad muscular armored guardian, jade-green face, huge ornate Qingyun sword, ferocious celestial general, swirling black wind'],
  ['taiyi','太乙真人','乾元丹师','chan','huatuo',3,'male',{jijiu:'回生',qingnang:'仙丹'},'kind elderly immortal, rounded friendly face, white hair, peach and turquoise robes, floating golden elixir, lotus cauldron'],
  ['yuding','玉鼎真人','金霞传道','chan','guojia',3,'male',{yiji:'传道',tiandu:'悟道'},'slender scholarly immortal, dark hair with silver streaks, pale jade robes, small bronze tripod, sword scroll, quiet green mountain'],
  ['guangchengzi','广成子','崆峒金仙','chan','zhouyu',3,'male',{yingzi:'仙姿',fanjian:'试心'},'dignified adult immortal, gold-white robes, long black beard, floating bronze seal, crane feathers, luminous mountain palace'],
  ['yunzhongzi','云中子','终南炼器','chan','sunquan',4,'male',{zhiheng:'炼化',jiuyuan:'护道'},'inventive gentle adult Taoist craftsman, white and muted cyan robes, wooden sword, floating miniature bronze artifacts, celestial workshop'],
  ['longji','龙吉公主','瑶池清辉','chan','xiaoqiao',3,'female',{tianxiang:'甘露',hongyan:'圣颜'},'adult celestial princess, dignified jade-white and pale blue full gown, phoenix hairpin, clear water ribbon, lotus and pearl, serene expression'],
  ['tongtian','通天教主','碧游掌教','jie','caopi',3,'male',{xingshang:'收魂',fangzhu:'禁仙'},'majestic austere sect master, black violet robes, sharp long beard, four suspended swords behind him, purple cosmic sky'],
  ['zhaogongming','赵公明','玄坛正道','jie','ganning',4,'male',{qixi:'落宝'},'powerful bearded adult immortal in black-gold armor, dark tiger silhouette, golden whip, orbit of bright blue ocean pearls'],
  ['yunxiao','云霄','九曲玄女','jie','daqiao',3,'female',{guose:'九曲',liuli:'移劫'},'adult calm mystical woman, dark violet and cloud-white robes, floating gold bowl, nine sinuous golden river streams, composed commanding face'],
  ['jinling','金灵圣母','斗府尊神','jie','huangyueying',3,'female',{jizhi:'仙机',qicai:'通法'},'adult regal female immortal, dark turquoise-gold robe and celestial armor, gilded dragon-tiger jade scepter, star map, confident face'],
  ['duobao','多宝道人','万宝归藏','jie','lvmeng',4,'male',{keji:'藏宝'},'solemn adult Taoist with swept-back black hair, saffron and dark violet robes, luminous treasure pagoda and small floating bronze bells'],
]
const draftHeroes = rows.map(([id,name,title,faction,baseHero,hp,sex,skillNames,artDirection])=>({
  id,name,title,faction,baseHero,engineId:baseHero,hp,sex,skillNames,artDirection,
  playable:!!HERO_BY_ID[baseHero], missingSkills:HERO_BY_ID[baseHero]?[]:Object.keys(skillNames),
  image:`assets/heroes/${id}.jpg`, thumbnail:`assets/heroes/${id}-thumb.jpg`,
})).concat(GODS,FENGSHEN_EXPANSION,[
 {id:'tuxingsun',name:'土行孙',title:'地行神通',faction:'zhou',skillNames:{tuxi:'地行'},artDirection:'adult stocky short-statured earth-travelling Taoist warrior, ochre bronze armor, gold binding rope, cave and earth mist',image:'assets/heroes/tuxingsun.jpg',thumbnail:'assets/heroes/tuxingsun-thumb.jpg'},
 {id:'shiji',name:'石矶娘娘',title:'白骨洞仙',faction:'jie',skillNames:{luoshen:'石魄',qingguo:'磐影'},artDirection:'dignified adult female stone immortal, slate-grey violet robes, jade headdress and stone talisman, moonlit sacred pillars',image:'assets/heroes/shiji.jpg',thumbnail:'assets/heroes/shiji-thumb.jpg'},
])
const newSkillNames={jieyin:'生命之契',xiaoji:'圣翼',kurou:'吐气',jushou:'镇塔',qianxun:'五色护体',lianying:'明光',ganglie:'反震',liegong:'射日',kuanggu:'摄魂',shensu:'疾行',buqu:'护道',bazhen:'卢恩护阵',huoji:'神焰',kanpo:'万智',lianhuan:'月链',niepan:'月生',quhu:'驱兽',jieming:'传卦',qiangxi:'雷锤',tianyi:'天剑',mengjin:'钉魂',shuangxiong:'双魄',huoshou:'海御',zaiqi:'潮生',juxiang:'五光',lieren:'飞石',songwei:'尊道',haoshi:'神赐',dimeng:'神盟',yinghun:'日魂',wansha:'禁生',luanwu:'幻乱',weimu:'诡幕',huashen:'七十二变',xinsheng:'再化',beige:'碧曲',duanchang:'绝曲',ganlu:'补天',buyi:'护生',luoying:'晨辉',jiushi:'醇光',jueqing:'灵刃',shangshi:'夜巡',zhenlie:'圣守',miji:'神谋',anxu:'日恩',zhuiyi:'神恩',xueji:'月矢',huxiao:'狩月',wuji:'破界',zhuikong:'云惧',qiuyuan:'云援'}
// A source general is indivisible: art factions never determine mechanical aid.
// Incomplete source profiles remain a gallery entry, not a replacement combo.
export const HEROES=draftHeroes.map(h=>{
 const c=CANONICAL_BY_ID[h.id],base=HERO_BY_ID[c.referenceId]
 const complete=!!base&&base.skills.slice().sort().join('|')===c.skills.slice().sort().join('|')
 return {...h,baseHero:c.referenceId,engineId:c.referenceId,referenceId:c.referenceId,referenceName:c.referenceName,ruleset:c.ruleset,sourcePack:c.pack,mechanicalFaction:c.mechanicalFaction,hp:c.hp,sex:c.sex,
   skillNames:Object.fromEntries(c.skills.map((s,i)=>[s,h.skillNames[s]||newSkillNames[s]||c.sourceSkillNames[i]])),
   playable:complete,missingSkills:complete?[]:c.skills.filter(s=>!SKILLS[s]),
 }
})
export const HERO_BY_THEME_ID=Object.fromEntries(HEROES.map(h=>[h.id,h]))
export const PLAYABLE_HEROES=HEROES.filter(h=>h.playable)
export const SECOND_BATCH=[['huangfeihu','黄飞虎','lvbu'],['shiji','石矶娘娘','zhenji'],['tuxingsun','土行孙','zhangliao'],['jinzha','金吒','guanyu'],['muzha','木吒','huangzhong']]

// All baseline physical cards retain their IDs, quantities, suit, rank and stats.
const cardNames={sha:'杀',shan:'闪',tao:'仙桃',duel:'斗法',dismantle:'破阵',snatch:'摄宝',draw:'天机显化',savage:'万妖袭营',arrows:'飞剑齐发',garden:'瑶池仙宴',harvest:'仙山采宝',collateral:'借宝诛敌',nullify:'破法',indulgence:'迷魂阵',lightning:'天雷劫',crossbow:'火尖枪',dualsword:'阴阳双剑',qinggang:'斩仙飞刀',blade:'打神鞭',spear:'混天绫',axe:'番天印',halberd:'金蛟剪',bow:'五色神光',ice:'乾坤圈',bagua:'戊己杏黄旗',renwang:'紫绶仙衣',chitu:'风火轮',dayuan:'金睛兽',zixing:'墨麒麟',jueying:'五色神牛',dilu:'青鸾',zhuahuang:'白鹤'}
export const CARDS_BY_TYPE=Object.fromEntries(Object.entries(CARDS).map(([type,base])=>[type,{...base,type,baseName:base.name,name:cardNames[type],image:`assets/cards/${type}.jpg`,thumb:`assets/cards/${type}-thumb.webp`,help:base.help}]))
export const PLANNED_EQUIPMENT=Object.entries(EXPANSION_CARDS).map(([type,c])=>({type,...c}))
export const makeExpandedDeck=()=>expandedDeck(makeDeck)
export function heroForBase(id){return PLAYABLE_HEROES.find(h=>h.engineId===id)||null}
const aliases=[...PLAYABLE_HEROES.filter(h=>h.baseHero).map(h=>[HERO_BY_ID[h.baseHero].name,h.name]),...Object.values(CARDS_BY_TYPE).map(c=>[c.baseName,c.name]),...HEROES.filter(h=>h.baseHero).flatMap(h=>Object.entries(h.skillNames).filter(([id])=>SKILLS[id]).map(([id,n])=>[SKILLS[id][0],n])),['八卦','杏黄旗'],['青龙刀','打神鞭']]
const replacements=new Map(aliases)
// Reserve full themed words, so the old name 桃 never turns 仙桃 into 仙仙桃.
for(const word of [...HEROES.map(h=>h.name),...Object.values(CARDS_BY_TYPE).map(c=>c.name),...HEROES.flatMap(h=>Object.values(h.skillNames))])replacements.set(word,word)
const displayPattern=new RegExp([...replacements.keys()].sort((a,b)=>b.length-a.length).join('|'),'g')
export function displayText(text) {
  const result=String(text??'').replace(displayPattern,word=>replacements.get(word))
  return result.replace(/其他蜀将/g,'其他青盟角色').replace(/其他魏将/g,'其他赤盟角色').replace(/其他吴将/g,'其他金盟角色')
}
export function skillName(heroId,skill){const p=typeof heroId==='object'?heroId:null,id=p?(p.incarnation?.activeSkill===skill?p.incarnation.activeHero:p.heroId):heroId;return heroForBase(id)?.skillNames[skill]||PLAYABLE_HEROES.find(h=>h.skillNames[skill])?.skillNames[skill]||'技能'}
export function skillHelp(h,skill){
 let text=displayText(SKILLS[skill]?.[1]||'技能待接入')
 if(skill==='jijiang')text='主公技：需要杀时，可请其他青盟角色提供。'
 if(skill==='hujia')text='主公技：需要闪时，可请其他赤盟角色提供。'
 if(skill==='jiuyuan')text='主公技：其他金盟角色救你时，一张仙桃回复两点体力。'
 return text.replaceAll('经典原版','')+(h?.playable&&['xinsheng','jizhi','yingzi','jianxiong','tieji'].includes(skill)?' 有效条件满足时自动发动。':'')
}
export const ALLIANCE_NAMES={shu:'青盟',wei:'赤盟',wu:'金盟',qun:'玄盟'}
export function manifest(){return {codeName:'众神斗法',visibility:'free-demo',rules:'classic-identity-original',heroes:HEROES,cards:CARDS_BY_TYPE,plannedEquipment:PLANNED_EQUIPMENT,deckSize:makeDeck().length}}
