import {CARDS_BY_TYPE,PLAYABLE_HEROES} from './theme.mjs'
export const VOICES={male:'zh-CN-YunxiNeural',female:'zh-CN-XiaoxiaoNeural'}
export const AUDIO_ENTRIES=[
  ...Object.values(CARDS_BY_TYPE).map(c=>({key:`card-${c.type}`,text:c.name})),
  ...[...new Set(PLAYABLE_HEROES.flatMap(h=>Object.keys(h.skillNames)))].map(s=>({key:`skill-${s}`,text:PLAYABLE_HEROES.find(h=>h.skillNames[s]).skillNames[s]})),
]
export const audioPath=(key,sex='male')=>`assets/audio/${sex==='female'?'female':'male'}/${key}.mp3`
