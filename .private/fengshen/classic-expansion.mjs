// Full original profiles, separate from the baseline Standard catalog.
import {COMPLETE_BY_ID} from './complete-roster.mjs'
export const CLASSIC_EXPANSION=[
 {id:'huangzhong',name:'黄忠',faction:'shu',hp:4,sex:'male',skills:['liegong']},
 {id:'weiyan',name:'魏延',faction:'shu',hp:4,sex:'male',skills:['kuanggu']},
 {id:'xiahouyuan',name:'夏侯渊',faction:'wei',hp:4,sex:'male',skills:['shensu']},
 {id:'caoren',name:'曹仁',faction:'wei',hp:4,sex:'male',skills:['jushou']},
 {id:'dianwei',name:'典韦',faction:'wei',hp:4,sex:'male',skills:['qiangxi']},
 {id:'pangde',name:'庞德',faction:'qun',hp:4,sex:'male',skills:['mashu','mengjin']},
]
export const EXPANSION_BY_ID={...COMPLETE_BY_ID,...Object.fromEntries(CLASSIC_EXPANSION.map(h=>[h.id,h]))}
