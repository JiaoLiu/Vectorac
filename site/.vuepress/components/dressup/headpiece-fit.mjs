import {fullCap} from './head-fit.mjs'
export const HAIR_PIECE_ANCHORS=[[285,46,43,60],[289,66,38,42],[282,58,45,87],[286,54,40,62]]
// Bow/flowers decorate the outside of a full cap. Hairpins and headbands
// retain their original hair attachment and stay behind hats/crowns.
const CAP_ANCHORS={0:[[297,63,33,46],[300,69,28,31]],1:[[294,51,33,46],[298,58,28,31]],10:[[291,53,33,46],[295,60,28,31]]}
export function capDecoration(piece,hat){
 if(!piece||piece.index<0||!fullCap(hat))return null
 const index=piece.sourceIndex===undefined?piece.index:piece.sourceIndex,cap=hat.sourceIndex===undefined?hat.index:hat.sourceIndex,anchors=CAP_ANCHORS[cap]
 if(!anchors)return null
 return index===0||index===1?anchors[index]:index===10?[anchors[0][0],anchors[0][1],33,43]:null
}
