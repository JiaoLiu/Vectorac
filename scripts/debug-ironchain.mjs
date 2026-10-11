import {createAssignedGame,dispatch,playerView,catalog} from '../.private/fengshen/engine.mjs'
import {stateMarkers,renderBattle} from '../.private/fengshen/table.mjs'

function fixture(hero='tsukuyomi',others=['jifa','nezha','dixin','jinling'],current=0){
 const ids=[hero,...others]
 const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:ids,seed:23});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.lastPlayed=null;s.lastResponse=null;s.exchange=null;s.publicReveal=null;s.logs=[]
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp;p.alive=true;delete p.faceDown;delete p.chained;delete p.skillsSealed;delete p.persistent;delete p.buquPile}
 return s
}
function card(s,seat,type,suit=null,rank=null){const i=s.deck.findIndex(c=>c.type===type&&(!suit||c.suit===suit)&&(!rank||c.rank===rank));const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});if(!r.ok)throw new Error(r.error);return r.state}

let s=fixture('tsukuyomi');const cost=card(s,0,'sha','club')
console.log('legal ironchain actions:')
for(const a of playerView(s,0).legal.filter(a=>a.as==='ironchain'))console.log(' targets',JSON.stringify(a.targets))
s=step(s,{type:'play',as:'ironchain',ids:[cost.id],targets:[1,2]})
console.log('pending:',s.pending?.kind)
let guard=0
while(s.pending&&guard++<30){if(s.pending.kind==='counter'){s=step(s,{type:'pass'});continue}break}
console.log('chained:',s.players.map(p=>p.seat+':'+p.chained))
console.log('marker seat1:',stateMarkers(s.players[1]))
console.log('marker seat2:',stateMarkers(s.players[2]))
