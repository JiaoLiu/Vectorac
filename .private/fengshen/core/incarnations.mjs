export function borrowableSkills(catalog,id){return (catalog.HERO_BY_ID[id]?.skills||[]).filter(s=>catalog.SKILLS[s]&&!['lord','limited','wake'].includes(catalog.SKILLS[s][2])&&!['huashen','xinsheng'].includes(s))}
export function effectiveHero(catalog,p){
 const base=catalog.HERO_BY_ID[p.heroId],i=p.incarnation,h=i?.activeHero&&catalog.HERO_BY_ID[i.activeHero]
 return h&&borrowableSkills(catalog,h.id).includes(i.activeSkill)?{...base,sex:h.sex,faction:h.faction,skills:[...base.skills,i.activeSkill]}:base
}
export function validIncarnation(catalog,p){
 const i=p.incarnation,owns=catalog.HERO_BY_ID[p.heroId]?.skills.includes('huashen')
 if(!owns)return i==null
 if(!i||!Array.isArray(i.pool)||i.pool.length>catalog.HEROES.length||new Set(i.pool).size!==i.pool.length||i.pool.some(id=>id===p.heroId||!borrowableSkills(catalog,id).length))return false
 return i.activeHero==null?i.activeSkill==null:i.pool.includes(i.activeHero)&&borrowableSkills(catalog,i.activeHero).includes(i.activeSkill)
}
