import {makeDeck} from './core/catalog.mjs'
// Classic Maneuvering: append the original 52 physical cards. Legacy IDs stay
// unchanged, and the deck profile is immutable for the lifetime of a match.
const suits={
 spade:['guding','vine','wine','thundersha','thundersha','thundersha','thundersha','thundersha','wine','supplyshortage','ironchain','ironchain','nullify'],
 club:['silverlion','vine','wine','supplyshortage','thundersha','thundersha','thundersha','thundersha','wine','ironchain','ironchain','ironchain','ironchain'],
 heart:['nullify','fireattack','fireattack','firesha','tao','tao','firesha','shan','shan','firesha','shan','shan','nullify'],
 diamond:['fan','tao','tao','firesha','firesha','shan','shan','shan','wine','shan','shan','fireattack','hualiu'],
}
export function makeMilitaryDeck(){const cards=makeDeck();for(const [suit,types]of Object.entries(suits))types.forEach((type,i)=>cards.push({id:`c${cards.length}`,type,suit,rank:i+1}));return cards}
