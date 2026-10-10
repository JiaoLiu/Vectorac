// Complete beauty faces are the source of truth for both wearing and previews.
// A matching feature is already part of its face; never paint it twice.
export const BEAUTY_SLOTS=['face','eyes','brows','lip']
export const BEAUTY_PRESETS=[
 {id:'morning',name:'晨光自然',detail:'鹅蛋脸 · 自然杏眼',parts:{face:'face-0',eyes:'eyes-0',brows:'brows-0',lip:'lip-0'}},
 {id:'peach',name:'蜜桃甜心',detail:'圆脸 · 明亮圆眸',parts:{face:'face-1',eyes:'eyes-1',brows:'brows-1',lip:'lip-1'}},
 {id:'heart',name:'柔光心颜',detail:'柔和心形脸 · 桃花眼',parts:{face:'face-2',eyes:'eyes-2',brows:'brows-2',lip:'lip-2'}},
 {id:'elegant',name:'清透韩妆',detail:'清透鹅蛋脸 · 清雅长眸',parts:{face:'face-3',eyes:'eyes-3',brows:'brows-3',lip:'lip-3'}},
 {id:'sakura',name:'樱花晴空',detail:'自然鹅蛋脸 · 蓝灰眼眸 · 樱花粉',parts:{face:'face-0',eyes:'eyes-4',brows:'brows-0',lip:'lip-4'}},
 {id:'sweet',name:'甜梨灵眸',detail:'小圆鹅蛋脸 · 灵动棕眸 · 微笑蜜桃唇',assetVersion:'v20',parts:{face:'face-4',eyes:'eyes-5',brows:'brows-4',lip:'lip-5'}}
]
export const beautyPreset=id=>BEAUTY_PRESETS.find(p=>p.id===id)
export const beautyPreview=p=>'/img/games/dressup/layers/'+(p.assetVersion||'v17')+'/catalog/look-'+p.id+'.webp'
export const matchesBeauty=(parts,p)=>BEAUTY_SLOTS.every(slot=>parts[slot]===p.parts[slot])
export const bakedFeature=(face,part)=>face&&face.beautyIndex!==undefined&&part.beautyIndex===face.beautyIndex&&['eyes','brows','lip'].includes(part.category)
