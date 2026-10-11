// Focused legacy scenarios must not accidentally gain a newly-added opponent's
// damage-replacement/transfer skills when the random production pool grows.
import {catalog} from '../../.private/fengshen/engine.mjs'
export function stableOpponents(s){
 const ids=['liubei','zhangfei','zhaoyun','huangyueying','caocao','ganning','lvmeng'].filter(id=>id!==s.players[0].heroId)
 for(const p of s.players.slice(1)){p.heroId=ids[p.seat-1];p.hp=p.maxHp=catalog.HERO_BY_ID[p.heroId].hp+(s.teamMode?0:p.role==='lord'?1:0);delete p.incarnation;delete p.persistent;delete p.skillsSealed;delete p.buquPile;delete p.chained;delete p.disabledSkills;delete p.faceDown}
 return s
}
