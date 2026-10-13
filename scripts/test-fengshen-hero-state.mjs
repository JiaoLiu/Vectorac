import test from 'node:test'
import assert from 'node:assert/strict'
import {createAssignedGame,catalog,dispatch,playerView,distance} from '../.private/fengshen/engine.mjs'
import {delayedTargetReason,jiushiButton,heroBattleDetails} from '../.private/fengshen/hero-state.mjs'
import {renderControls} from '../.private/fengshen/table.mjs'
function fixture(own='yangjian',other='jifa'){
 const s=createAssignedGame({heroIds:[own,other,'nezha','jinling','daji'],roles:['lord','loyal','rebel','rebel','renegade'],seed:37})
 Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],queue:[],pending:null,phase:'play',current:0,lastPlayed:null,lastResponse:null,exchange:null,publicReveal:null})
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0};p.hp=p.maxHp}
 return s
}
const take=(s,type,seat)=>{const i=s.deck.findIndex(c=>c.type===type);assert.ok(i>=0,type);const c=s.deck.splice(i,1)[0];if(seat!=null)s.players[seat].hand.push(c);return c}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);return r.state}
test('Indulgence ignores defensive horse and distance, while Snatch retains its own range',()=>{
 const s=fixture(),c=take(s,'indulgence',0);for(const t of [1,2,3])s.players[t].equip.defenseHorse=take(s,['dilu','jueying','zhuahuang'][t-1]);take(s,'snatch',0)
 const v=playerView(s,0);for(const t of [1,2,3]){assert.ok(distance(s,0,t)>=2);assert.ok(v.legal.some(a=>a.as==='indulgence'&&a.ids.includes(c.id)&&a.targets.includes(t)));assert.equal(delayedTargetReason(v,'indulgence',t,[c]),'')}
 assert.ok(!v.legal.some(a=>a.as==='snatch'&&a.targets.includes(1)))
})
test('unavailable Indulgence states explain immunity/duplicate rather than blaming horse',()=>{
 const s=fixture('yangjian','kongxuan'),c=take(s,'indulgence',0);s.players[1].equip.defenseHorse=take(s,'dilu');let v=playerView(s,0)
 assert.match(delayedTargetReason(v,'indulgence',1,[c]),/免疫迷魂阵.*与.*距离无关/)
 s.players[2].judgment.push(take(s,'indulgence'));v=playerView(s,0);assert.match(delayedTargetReason(v,'indulgence',2,[c]),/已有迷魂阵/)
 const l=fixture('yangjian','loki'),black=take(l,'indulgence',0);v=playerView(l,0);assert.match(delayedTargetReason(v,'indulgence',1,[black]),/黑色/)
})
test('an unavailable natural card can still explicitly select its legal conversion',()=>{
 const s=fixture('jinzha','kongxuan'),v=playerView(s,0),c={id:'red-delay',type:'indulgence',suit:'diamond',rank:6};v.players[0].hand=[c];const option={type:'play',as:'sha',ids:[c.id],targets:[1]}
 const ui={state:s,selected:[c.id],targets:[],matching:()=>[option],currentAs:()=>'indulgence',targetable:()=>[]}
 assert.ok(renderControls(ui,v).includes('data-action="as" data-value="sha"'))
})
test('Fangzhu flips Apollo but does not grant a free Jiushi flip-back action',()=>{
 let s=fixture('apollo','tongtian');const sha=take(s,'sha',0);s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[1]});s=step(s,{type:'pass'})
 assert.equal(s.pending.skill,'fangzhu');const a=playerView(s,1).legal.find(a=>a.type==='invoke');assert.ok(a);s=step(s,{...a,target:0,ids:[]})
 assert.equal(s.players[0].faceDown,true);const v=playerView(s,0);assert.ok(!v.legal.some(a=>a.skill==='jiushi'));assert.match(jiushiButton(v).reason,/不能主动.*翻正/)
})
test('damage while face-down offers Jiushi flip-back; correct skill action turns face up',()=>{
 let s=fixture('apollo');s.current=1;s.players[0].faceDown=true;const sha=take(s,'sha',1);s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]});s=step(s,{type:'pass'})
 assert.equal(s.pending.skill,'jiushi-back');const v=playerView(s,0),b=jiushiButton(v);assert.equal(b.label,'翻正');assert.ok(b.action);s=step(s,b.action);assert.equal(s.players[0].faceDown,false)
})
test('hero details show real public equipment/delays and current counts, not concealed cards or role',()=>{
 const s=fixture();s.players[1].equip.armor=take(s,'bagua');s.players[1].equip.defenseHorse=take(s,'dilu');s.players[1].judgment.push(take(s,'indulgence'));s.players[1].faceDown=true;s.players[1].chained=true;take(s,'sha',1)
 const v=playerView(s,0),html=heroBattleDetails(v.players[1],v);for(const text of ['体力 4/4','手牌 1 张','防具','戊己杏黄旗','防御坐骑','迷魂阵','背面朝上','已连环'])assert.ok(html.includes(text),text)
 assert.ok(!html.includes('忠臣'));assert.ok(!html.includes(s.players[1].hand[0].id))
 v.pending={kind:'reveal',target:1,delayType:'supplyshortage'};assert.ok(heroBattleDetails(v.players[1],v).includes('闭粮阵 · 正在判定'))
})
test('ordinary empty state has no placeholders, identity, normal flags or empty disclosure',()=>{
 const s=fixture(),v=playerView(s,0),html=heroBattleDetails(v.players[1],v)
 for(const text of ['存活','正面朝上','未连环','身份','阵营','未装备','没有待判定','fs-live-equipment','fs-live-delays','<details'])assert.ok(!html.includes(text),text)
 assert.ok(html.includes('体力 4/4'));assert.ok(html.includes('手牌 0 张'))
})
test('populated state defaults to compact chips with effect explanations collapsed',()=>{
 const s=fixture();s.players[1].equip.armor=take(s,'bagua');s.players[1].judgment.push(take(s,'indulgence'))
 const v=playerView(s,0),html=heroBattleDetails(v.players[1],v)
 assert.ok(html.includes('aria-label="当前装备"'));assert.ok(html.includes('aria-label="判定区"'))
 assert.ok(html.includes('<details class="fs-live-state-more">'));assert.ok(!html.includes(' open'))
 assert.ok(heroBattleDetails(v.players[1],v,{expanded:true}).includes('<details class="fs-live-state-more" open>'))
})
