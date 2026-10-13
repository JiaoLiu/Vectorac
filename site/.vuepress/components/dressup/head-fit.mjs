// Fixed anatomical sprite frames, not alpha-bounds centring. Cropping blank
// canvas makes high-resolution faces practical on mobile without huge textures.
export const HEAD_FRAMES={face:{x:190,y:25,w:132,h:173},eyes:{x:208,y:98,w:96,h:29},brows:{x:208,y:88,w:96,h:19},lip:{x:236,y:134,w:40,h:22},hair:{x:100,y:0,w:330,h:490},back:{x:100,y:40,w:330,h:190}}
// v18 air-bang art has its face cavity at x=269..272, NOT model x=256.
// Register the front to measured eye/cheek landmarks instead of its margins.
// The rear was independently registered to the model already; never shift it.
export const AIR_BANGS_FRONT_FRAME={x:96,y:0,w:310.2,h:490}
export const BODY_HEAD_START=170
// A cap may suppress a crown but never erase hair beside the ears/nape. Each
// style has its own retained-strand depth; a high pony also has fitted artwork.
export const HAIR_CAP_PROFILES={
 'hair-0':{front:78,back:65},'hair-1':{front:80,back:65},
 'hair-2':{front:84,back:68},'hair-3':{front:76,back:64},
 'hair-4':{front:82,back:66},'hair-5':{front:94,back:68}
}
export const fullCap=hat=>hat&&hat.index>=0&&(hat.cap||[0,1].includes(hat.sourceIndex===undefined?hat.index:hat.sourceIndex))
export const crownCut=(hair,hatCut,back=false)=>Math.min(hatCut,HAIR_CAP_PROFILES[hair.id][back?'back':'front'])
