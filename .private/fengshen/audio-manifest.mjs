import {CARDS_BY_TYPE,PLAYABLE_HEROES,heroForBase} from './theme.mjs'
export const VOICES={male:'zh-CN-YunxiNeural',female:'zh-CN-XiaoxiaoNeural'}
export const AUDIO_ENTRIES=[
  ...Object.values(CARDS_BY_TYPE).map(c=>({key:`card-${c.type}`,text:c.name})),
  ...[...new Set(PLAYABLE_HEROES.filter(h=>h.baseHero).flatMap(h=>Object.keys(h.skillNames)))].map(s=>({key:`skill-${s}`,text:PLAYABLE_HEROES.find(h=>h.baseHero&&h.skillNames[s]).skillNames[s]})),
  ...PLAYABLE_HEROES.filter(h=>!h.baseHero).flatMap(h=>Object.entries(h.skillNames).map(([s,text])=>({key:`skill-${h.id}-${s}`,text}))),
]
export function skillAudioKey(heroId,skill){const h=heroForBase(heroId);return h&&!h.baseHero?`skill-${h.id}-${skill}`:`skill-${skill}`}
export const audioPath=(key,sex='male')=>`assets/audio/${sex==='female'?'female':'male'}/${key}.mp3`
