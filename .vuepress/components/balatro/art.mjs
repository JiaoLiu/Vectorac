import { SUITS, JOKERS, TAROTS, HANDS, SPECTRALS, byId } from './catalog.mjs'

const svg = body => `<svg viewBox="0 0 120 168" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
const text = (x,y,label,size=18,color='#25282d',extra='') => `<text x="${x}" y="${y}" font-family="Georgia, serif" font-size="${size}" text-anchor="middle" fill="${color}" ${extra}>${label}</text>`
const pip = (x,y,suit,size=22,flip=false) => `<g ${flip?`transform="rotate(180 ${x} ${y})"`:''}>${text(x,y+size*.33,suit,size)}</g>`
const pips = {
  2:[[60,42],[60,126]],3:[[60,42],[60,84],[60,126]],
  4:[[38,42],[82,42],[38,126],[82,126]],5:[[38,42],[82,42],[60,84],[38,126],[82,126]],
  6:[[38,42],[82,42],[38,84],[82,84],[38,126],[82,126]],
  7:[[38,42],[82,42],[60,63],[38,84],[82,84],[38,126],[82,126]],
  8:[[38,38],[82,38],[60,61],[38,84],[82,84],[60,107],[38,130],[82,130]],
  9:[[38,37],[82,37],[38,68],[82,68],[60,84],[38,100],[82,100],[38,131],[82,131]],
  10:[[38,37],[82,37],[60,52],[38,68],[82,68],[38,100],[82,100],[60,116],[38,131],[82,131]]
}

// Standard indices, symmetric suit pips and bespoke, double-ended court illustrations.
export function playingCard(c,hidden=false) {
  if(hidden)return svg(`<rect x="1" y="1" width="118" height="166" rx="7" fill="#e7e4d6"/><rect x="6" y="6" width="108" height="156" rx="4" fill="#2b617f"/><path d="M12 12H108V156H12Z M17 17H103V151H17Z" fill="none" stroke="#d4dccf"/>${Array.from({length:12},(_,i)=>`<path d="M18 ${i*11+20}l84 42m-84-20 84-42" stroke="#80a5aa" stroke-width="1"/>`).join('')}<path d="M60 48L89 84 60 120 31 84Z" fill="#163e5a" stroke="#d6cfad" stroke-width="2"/>${text(60,96,'♠',38,'#e3dabd')}`)
  const suit=SUITS[c.suit],r=c.rank===14?'A':({11:'J',12:'Q',13:'K'}[c.rank]||c.rank),red=c.suit%2===1,color=red?'#b63235':'#232d35'
  let middle=''
  if(c.enh==='stone')middle=`<path d="M25 32L84 23 103 54 94 136 34 146 18 103Z" fill="#899999" stroke="#526666" stroke-width="3"/><path d="M25 32L65 76 103 54M65 76L34 146M65 76L94 136" fill="none" stroke="#adbbaf" stroke-width="2"/>${text(61,98,'50',28,'#eef2e8')}`
  else if(c.rank===14)middle=pip(60,85,suit,60)+text(60,128,c.suit===0?'ACE OF SPADES':'A C E',7,color)
  else if(c.rank<=10)middle=pips[c.rank].map(([x,y])=>pip(x,y,suit,c.rank>=8?21:25,y>84)).join('')
  else {
    const queen=c.rank===12,king=c.rank===13
    const half=`<path d="M27 82Q30 65 47 61L70 60Q86 64 94 84" fill="${color}" stroke="#283342" stroke-width="2"/><path d="M37 81L45 65 77 80M64 65L56 84" fill="#dcb657" stroke="#eee0a8" stroke-width="2"/><path d="M46 63L49 51 68 49 74 66 61 76Z" fill="#efd5ac" stroke="#333e49" stroke-width="1.4"/><path d="M46 42Q46 27 61 26Q77 28 75 45L69 56 54 57Z" fill="#efd5ac" stroke="#333e49" stroke-width="1.4"/><path d="M47 40L51 31 72 34 74 43 78 48 69 48" fill="none" stroke="#333e49" stroke-width="2"/><path d="M57 43h4m7 0h3M61 50l6 1" stroke="#333e49" stroke-width="1.5"/>${queen?'<path d="M44 35Q36 48 44 64L49 52M74 33Q84 47 78 63L71 54" fill="#282f38"/>':king?'<path d="M52 50L54 60 65 64 72 52 62 55Z" fill="#333e49"/>':'<path d="M47 34Q40 45 48 54" fill="none" stroke="#333e49" stroke-width="5"/>'}<path d="M45 32L44 22 53 27 60 19 66 27 75 22 73 34Z" fill="#d5a943" stroke="#333e49" stroke-width="1.5"/>${queen?'<path d="M89 42L83 74" stroke="#58856c" stroke-width="2"/><path d="M88 37q-12-11-12 1t11 3q12 10 10-2t-9-2" fill="#bc4950"/><circle cx="88" cy="39" r="3" fill="#dfbd67"/>':`<path d="M${king?86:32} 75V28" stroke="#405d6c" stroke-width="4"/><path d="M${king?79:25} 51h14" stroke="#cb9c37" stroke-width="4"/>`}<path d="M30 83H91" stroke="#e2c469" stroke-width="3"/>`
    middle=`<rect x="25" y="20" width="70" height="128" fill="#eae3c9" stroke="${color}"/><g>${half}</g><g transform="rotate(180 60 84)">${half}</g>`
  }
  const bg={steel:'#c0d4d8',gold:'#f0d28e',glass:'#e7f4f1',lucky:'#f5ebc8',mult:'#f6ded9',bonus:'#e0ecf6',wild:'#e7e6f1',stone:'#d5dfd7'}[c.enh]||'#f6f1df'
  const indices=c.enh==='stone'?'':`<g>${text(13,24,r,17,color,'font-weight="bold"')}${text(13,42,suit,17,color)}</g><g transform="rotate(180 60 84)">${text(13,24,r,17,color,'font-weight="bold"')}${text(13,42,suit,17,color)}</g>`
  const sealColor={red:'#b73837',blue:'#3a79ab',gold:'#c89225',purple:'#9862a3'}[c.seal]
  return svg(`<rect x="1" y="1" width="118" height="166" rx="7" fill="${bg}" stroke="#ded8c8" stroke-width="2"/><rect x="4" y="4" width="112" height="160" rx="5" fill="none" stroke="#fff" stroke-opacity=".6"/><g fill="${color}" color="${color}" class="bp-pips">${middle.replace(/fill="#25282d"/g,`fill="${color}"`)}</g>${indices}${c.seal?`<path d="M101 8l3 3 4-.2.8 3.9 3.2 2.4-1.8 3.7 1.2 3.8-3.7 1.5-1.6 3.7-3.8-1.1-3.4 2.2-2.6-3.1-4-.5.1-4-2.8-2.8 2.5-3.1-.4-4 3.9-.9 2-3.5 3.6 1.5z" fill="${sealColor}" stroke="#f3db9b" stroke-width="1.2"/><circle cx="101" cy="19" r="5.2" fill="#f3d784" opacity=".8"/>${text(101,22,'✦',8,'#69451c')}</g>`:''}${c.edition?'<path d="M5 52L115 14V39L5 77ZM5 129L115 91V102L5 140Z" fill="#fff" opacity=".18"/>':''}`)
}
const symbols={diamond:'♦',heart:'♥',spade:'♠',club:'♣',eye:'◉',half:'½',flag:'⚑',mountain:'▲',glitch:'!?',fist:'✊',spiral:'φ',skull:'☠',eight:'8',nine:'9',book:'A',business:'$',photo:'◧',smile:'☺',ticket:'★',crown:'♛',shoe:'♜',binary:'01',sunset:'☀',bottle:'♟',mime:'◐',moon:'☽',board:'♠',steel:'⬡',abstract:'◒',nova:'✷',car:'♞',runner:'➶',square:'▦',green:'♣',bus:'▣',trousers:'Ⅱ',stars:'✧',holo:'◈',crystal:'◉',ice:'♧',popcorn:'✹',ramen:'≋',banana:'☽',duo:'Ⅱ',trio:'Ⅲ',family:'Ⅳ',order:'↗',tribe:'♠',acrobat:'✧',stencil:'?',blueprint:'✣',brain:'⚡',splash:'≋',hand:'Ⅳ',stairs:'↗',paint:'◒',mask:'◑',dice:'⚄',credit:'$',egg:'⬭',rocket:'↑',gold:'$',cloud:'☁',bull:'♉',boot:'♞',satellite:'♁',trade:'⇄',fire:'♨',dna:'⧬',beans:'◔',balls:'●',burglar:'◉',knife:'†',vampire:'♜',gem:'◆',arrow:'➤',radio:'▥',rope:'∞',double:'◉',ace:'A',flower:'✿',ancient:'☉',idol:'♟',baseball:'⚾',castle:'♜',stone:'⬡',glass:'◇',tiny:'2',cat:'♧',red:'♥',flash:'⚡',list:'☷',clock:'◷',mail:'✉',parking:'P'}
export function jokerArt(j,hidden=false) {
  if(hidden)return playingCard({},true)
  const d=byId(JOKERS,j.id),h=d.hue,symbol=symbols[d.art]
  const face=`<path d="M26 68Q14 29 39 43L56 24 73 43Q101 24 95 69L82 56 69 62 55 46 44 67Z" fill="hsl(${h},55%,46%)" stroke="#273b43" stroke-width="3"/><circle cx="27" cy="66" r="5" fill="#e9c967"/><circle cx="56" cy="25" r="5" fill="#e9c967"/><circle cx="95" cy="66" r="5" fill="#e9c967"/><path d="M39 61Q33 99 58 115Q85 102 82 60L65 67 55 53 45 70Z" fill="#f0d7af" stroke="#273b43" stroke-width="3"/><path d="M44 80l8-3m15 0 9 3M48 95Q61 106 74 92" fill="none" stroke="#293640" stroke-width="3"/><path d="M58 81L55 91 64 92" fill="none" stroke="#ba6960" stroke-width="2"/><path d="M34 122L43 108 58 118 76 108 87 123 71 121 60 135 46 121Z" fill="hsl(${h},50%,42%)" stroke="#273b43" stroke-width="2"/>`
  return svg(`<rect x="1" y="1" width="118" height="166" rx="7" fill="#eee4c7" stroke="#d3c7a9" stroke-width="2"/><rect x="7" y="7" width="106" height="154" rx="3" fill="hsl(${h},25%,69%)"/><path d="M8 8L112 160M8 46L85 160M34 8L112 123M8 160L112 8M8 123L86 8M33 160L112 46" stroke="#f5eccc" stroke-width="1" opacity=".23"/><rect x="14" y="24" width="92" height="116" fill="none" stroke="#faf1d6" stroke-width="2"/>${text(60,19,'J O K E R',9,'#24363c','font-weight="bold"')}${symbol?`<circle cx="60" cy="82" r="36" fill="hsl(${h},25%,37%)" stroke="#edcd87" stroke-width="2"/><circle cx="60" cy="82" r="29" fill="none" stroke="#e9ce92" stroke-width=".7"/>${text(60,99,symbol,49,'#f4deb0')}${text(60,130,'✦  ✦  ✦',11,'#2a4140')}`:face}${text(60,153,['','COMMON','UNCOMMON','RARE','LEGENDARY'][d.rarity],8,'#273a3b')}`)
}
export function consumableArt(card) {
  const planet=card.kind==='planet',spectral=card.kind==='spectral',def=byId(planet?HANDS:spectral?SPECTRALS:TAROTS,card.id),i=planet?HANDS.indexOf(def):spectral?SPECTRALS.indexOf(def):def.number
  const h=(i*29+(planet?175:250))%360
  const content=planet?`<circle cx="60" cy="83" r="27" fill="hsl(${h},47%,65%)"/><path d="M35 72Q65 60 82 79M34 84Q64 71 85 91M39 98Q64 87 81 105" fill="none" stroke="hsl(${h},35%,42%)" stroke-width="6"/><ellipse cx="60" cy="83" rx="46" ry="12" transform="rotate(-24 60 83)" fill="none" stroke="#e4c89c" stroke-width="4"/>`:`<path d="M60 38L89 83 60 127 31 83Z" fill="hsl(${h},26%,36%)" stroke="#d2b375" stroke-width="2"/><circle cx="60" cy="82" r="23" fill="none" stroke="#d6bd85"/>${text(60,96,spectral?'✧':['☉','∞','☽','♛','♚','†','♥','♞','⚖','☼','☸','♌','☥','♜','♒','♟','♜','★','☽','☀','☷','⊕'][i],35,'#f2d9a0')}`
  return svg(`<rect x="1" y="1" width="118" height="166" rx="7" fill="#eadbb8"/><rect x="6" y="6" width="108" height="156" rx="4" fill="hsl(${h},25%,19%)"/><rect x="11" y="11" width="98" height="146" rx="2" fill="none" stroke="#bca36b"/><path d="M21 37l2-5 2 5-2 5ZM91 49l2-5 2 5-2 5ZM83 128l2-5 2 5-2 5ZM25 120l2-5 2 5-2 5Z" fill="#e1c47d"/>${text(60,29,planet?'PLANET':spectral?'SPECTRAL':String(i),10,'#dec58e')}${content}${text(60,148,planet?'CELESTIAL':spectral?'SPECTRAL':'ARCANA',9,'#dec58e')}`)
}
export function packArt(kind) {
  const styles={joker:['#ae6546','BUFFOON','☺'],planet:['#566f9d','CELESTIAL','♄'],tarot:['#8d657e','ARCANA','☽'],standard:['#638b76','STANDARD','♠'],spectral:['#708d9b','SPECTRAL','✧']},[color,name,symbol]=styles[kind]
  return svg(`<path d="M10 5H110L106 18V149L110 163H10L14 149V18Z" fill="${color}" stroke="#ddc59a" stroke-width="2"/><path d="M10 10H110M12 16H108M12 152H108M10 158H110" stroke="#333e46" stroke-width="2"/><path d="M20 23H100V143H20Z" fill="none" stroke="#e1ca9c"/><path d="M24 28L96 136M96 28L24 136" stroke="#e9d3a7" opacity=".15" stroke-width="15"/>${text(60,45,name,11,'#f7e9c6','font-weight="bold"')}${text(60,106,symbol,58,'#f8e5ba')}${text(60,136,'BOOSTER PACK',8,'#f8e5ba')}`)
}
