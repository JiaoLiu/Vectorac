// New mythological roster. Skill primitives use the existing audited event
// engine; these combinations are a playtest roster, not 20 new engine systems.
const rows = [
 ['sunwukong','孙悟空','齐天大圣','zhou',3,'male',{paoxiao:'大闹天宫',longdan:'七十二变'},'golden-furred monkey king, expressive simian face, red-gold lamellar armor, long golden staff, phoenix feather crown, cloud mountain'],
 ['nuwa','女娲','补天圣母','zhou',3,'female',{rende:'补天',hujia:'护生'},'adult Chinese creator goddess, elegant jade and ivory layered gown, five luminous stones, serene compassionate face, repaired cosmic sky'],
 ['fuxi','伏羲','八卦始祖','zhou',4,'male',{zhiheng:'演卦',jijiang:'御灵'},'ancient Chinese sage deity, long dark beard, bronze-jade robes, luminous eight-trigram disk, mountain dawn'],
 ['houyi','后羿','射日神弓','zhou',4,'male',{wusheng:'射日',tieji:'穿云'},'athletic adult Chinese divine archer, bronze leather armor, long sun-carved bow, dark hair, distant golden suns'],
 ['zeus','宙斯','奥林匹斯之主','olympus',4,'male',{tieji:'霆怒',luoyi:'天威'},'powerful elderly Greek sky god, white curled beard, white-gold draped robes and bronze cuirass, blue lightning bolt in hand, stormy Olympus'],
 ['athena','雅典娜','智慧战神','olympus',3,'female',{qicai:'神谋',wusheng:'圣枪'},'adult Greek warrior goddess, bronze crested helmet with face visible, ivory tunic and bronze armor, spear and owl, calm intelligent face'],
 ['hades','哈迪斯','冥府之王','olympus',4,'male',{jianxiong:'收魂',kurou:'冥契'},'stern mature Greek underworld god, black beard, obsidian and gold armor, bident, quiet blue spectral flames, no gore'],
 ['poseidon','波塞冬','深海君王','olympus',4,'male',{mashu:'潮行',paoxiao:'怒涛'},'mature Greek sea deity with sea-green beard, scaled bronze armor, long trident, towering dark teal wave'],
 ['artemis','阿尔忒弥斯','月影猎神','olympus',4,'female',{mashu:'逐月',wusheng:'月矢'},'adult Greek huntress goddess, dark braided hair, practical silver-green hunter armor, crescent bow, moonlit forest, no nudity'],
 ['apollo','阿波罗','光明神','olympus',3,'male',{yingzi:'晨辉',jizhi:'神谕'},'adult Greek radiant sun deity, golden curls and laurel, ivory bronze robes, lyre, dawn halo, thoughtful expression'],
 ['odin','奥丁','众父','asgard',3,'male',{zhiheng:'卢恩',jizhi:'万智'},'aged Norse one-eyed god, gray beard, dark blue cloak and iron armor, long spear, two raven silhouettes, snowy rune-lit hall'],
 ['thor','索尔','雷霆守护','asgard',4,'male',{wushuang:'雷锤'},'powerful adult Norse thunder god, long red beard, iron leather armor, compact ancient stone hammer, thunderstorm, no modern superhero costume'],
 ['loki','洛基','幻变之神','asgard',3,'male',{yingzi:'诡焰',fanjian:'幻诈'},'lean adult Norse trickster, copper red hair, intricate forest-green leather tunic, small flame and mirrored rune, clever smile, no superhero costume'],
 ['anubis','阿努比斯','冥途引者','nile',3,'male',{jianxiong:'摄魄',zhiheng:'裁魂'},'Egyptian jackal-headed god, sleek black jackal face, lapis and gold broad collar, black gold ceremonial armor, scales and desert tomb'],
 ['isis','伊西斯','生命圣翼','nile',3,'female',{rende:'圣佑',jizhi:'秘法'},'adult Egyptian goddess, elegant fully covered white and lapis gown, golden wing motifs, throne-shaped headdress, ankh, warm Nile light'],
 ['ra','拉','太阳之主','nile',4,'male',{tieji:'烈日',qicai:'天舟'},'Egyptian falcon-headed sun god, red solar disk, gold lapis armor, staff, sun barque and desert horizon'],
 ['bastet','芭丝特','灵猫守护','nile',3,'female',{longdan:'灵跃',mashu:'夜巡'},'Egyptian black cat-headed goddess, gold and turquoise modest ceremonial gown, alert feline eyes, sistrum, moonlit temple'],
 ['amaterasu','天照','高天日御','takamagahara',3,'female',{yingzi:'日耀',jiuyuan:'神恩'},'adult Japanese sun goddess, white and crimson layered ceremonial kimono, gold hair ornament, bronze sacred mirror, rising sun and clouds'],
 ['susanoo','须佐之男','斩蛇风神','takamagahara',4,'male',{wusheng:'天剑',luoyi:'荒魂'},'adult Japanese storm deity, windswept dark hair, ancient blue lacquer armor, curved sacred sword, storm sea, no modern anime copying'],
 ['tsukuyomi','月读','夜国之君','takamagahara',3,'male',{zhiheng:'月相',qicai:'夜域'},'adult Japanese moon deity, long silver-black hair, indigo silver layered robes, crescent mirror, quiet moonlit celestial shrine'],
]
export const GODS=rows.map(([id,name,title,faction,hp,sex,skillNames,artDirection])=>({id,name,title,faction,hp,sex,skillNames,artDirection,engineId:id,playable:true,missingSkills:[],baseHero:null,image:`assets/heroes/${id}.jpg`,thumbnail:`assets/heroes/${id}-thumb.jpg`}))
export const GOD_FACTIONS={olympus:'奥林匹斯',asgard:'阿斯加德',nile:'尼罗神域',takamagahara:'高天原'}
// Gameplay alliances are independent of geography. Lord skills specify their
// alliance in the help text; there is no implicit cross-pantheon aid.
export const GOD_ALLIANCES={olympus:'wei',asgard:'qun',nile:'shu',takamagahara:'wu'}
