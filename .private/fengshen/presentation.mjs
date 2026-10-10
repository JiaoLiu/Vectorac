import {CARDS_BY_TYPE,heroForBase} from './theme.mjs'
import {SUITS,isRed,rankName} from './core/catalog.mjs'
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export const display=p=>heroForBase(p.heroId)
export const portrait=(h,extra='',full=false)=>`<img class="fs-portrait ${extra}" src="${full?h.image:h.thumbnail}" alt="${esc(h.name)}原创形象" draggable="false" loading="${full?'eager':'lazy'}">`
export const hp=p=>`<span class="fs-hp" aria-label="体力 ${p.hp}/${p.maxHp}">${Array.from({length:p.maxHp},(_,i)=>`<i class="${i<p.hp?'full':''}">◆</i>`).join('')}<b>${p.hp}/${p.maxHp}</b></span>`
export const cardTitle=type=>CARDS_BY_TYPE[type].name
// One fixed design surface: the table, hand, judgments and transfer cards all
// scale this surface, never reflow its text into a different card layout.
export const cardFace=c=>{const d=CARDS_BY_TYPE[c.type],title=cardTitle(c.type);return `<span class="fs-card-face fs-clean-card ${isRed(c)?'red':''} ${d.category==='basic'?'fs-basic-card':''}" data-type="${c.type}" data-category="${d.category}"><span class="fs-card-design" style="--title-size:${title.length===1?40:title.length===2?28:title.length===3?23:title.length===4?18:14}px"><img src="${d.thumb||d.image}" alt="" draggable="false" loading="lazy"><span class="fs-rank">${c.virtual?'':rankName(c.rank)}<i>${c.virtual?'':SUITS[c.suit]}</i></span><strong>${title}</strong></span></span>`}
export function scaleCards(root){for(const face of root.querySelectorAll('.fs-clean-card')){const scale=Math.min(face.clientWidth/100,face.clientHeight/144);if(scale>0)face.style.setProperty('--face-scale',scale)}}
export const cardBack=label=>`<span class="fs-card-back"><i>封</i><b>暗手牌</b><small>${esc(label)}</small></span>`
const equipSymbols={weapon:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 2 7 9 5 7 12 1zM3 7l6 6M2 14l4-4"/></svg>',armor:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 14 4v4c0 3-3 5-6 7-3-2-6-4-6-7V4z"/></svg>',offenseHorse:'−',defenseHorse:'+'}
export const equipmentSlot=slot=>`<i class="fs-equip-slot" aria-hidden="true">${equipSymbols[slot]||''}</i>`
