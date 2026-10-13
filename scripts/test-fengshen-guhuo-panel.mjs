// 妖言（旧于吉·蛊惑）声明选牌弹窗：居中亮出无点数虚拟卡面，点选声明类型后「发动」，
// 再照常选牌、选目标、确认扣置；声明只走弹窗，操作栏「当X」只保留非妖言转化。
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createAssignedGame,playerView,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
import {cardFace} from '../site/.vuepress/components/fengshen/presentation.mjs'
import {CARDS_BY_TYPE} from '../site/.vuepress/components/fengshen/theme.mjs'
import {renderCenter,renderControls} from '../site/.vuepress/components/fengshen/table.mjs'
function fixture(own='shengongbao'){
 const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:[own,'jifa','nezha','dixin','jinling'],seed:23})
 s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.turns=1;s.lastPlayed=null;s.lastResponse=null;s.exchange=null;s.publicReveal=null;s.logs=[]
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp;p.alive=true}
 return s
}
const give=(s,seat,type,suit=null)=>{const i=s.deck.findIndex(c=>c.type===type&&(!suit||c.suit===suit));assert.ok(i>=0,`牌堆缺 ${type}`);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
const model=(s,over={})=>({state:s,selected:[],targets:[],skill:null,as:null,guhuoMode:false,guhuoChoice:false,hints:true,chainReset:false,matching:()=>[],currentAs:()=>null,targetable:()=>[],equipment:()=>'',...over})
const declared=html=>[...html.matchAll(/data-action="guhuo-choice" data-value="([a-z]+)"/g)].map(m=>m[1])
test('妖言弹窗列出无点数虚拟卡面，只列当前可声明牌型，基本牌在前',()=>{
 const s=fixture(),shan=give(s,0,'shan');give(s,0,'tao')
 const v=playerView(s,0),ui=model(s,{guhuoChoice:true}),html=renderCenter(ui,v)
 assert.ok(html.includes('fs-guhuo-choice'),'弹窗打开')
 assert.ok(html.includes('data-action="guhuo-confirm"')&&html.includes('data-action="guhuo-cancel"'),'有发动与取消')
 const pop=html.slice(html.indexOf('fs-guhuo-choice'))
 assert.ok(pop.includes('<span class="fs-rank"><i></i></span>'),'虚拟卡面不渲染点数花色')
 assert.ok(pop.includes(cardFace({type:'sha',virtual:true})),'复用共用卡面入口渲染虚拟杀')
 const types=declared(html)
 assert.ok(types.includes('sha')&&types.includes('draw'),'含基本牌与普通锦囊声明')
 assert.ok(!types.includes('shan')&&types.includes('nullify')===false,'出牌阶段不含闪与破法')
 assert.ok(!types.includes('dilu'),'装备不可声明')
 assert.ok(!types.includes('tao'),'满血时桃不可声明，只列当前可声明的')
 assert.equal(new Set(types).size,types.length,'声明类型不重复')
 const basic=types.filter(t=>CARDS_BY_TYPE[t].category==='basic'),trick=types.filter(t=>CARDS_BY_TYPE[t].category!=='basic')
 assert.deepEqual(types,basic.concat(trick),'基本牌排在锦囊前')
 assert.equal(shan.type,'shan')
})
test('未选声明时发动禁用，选中后可用并高亮',()=>{
 const s=fixture();give(s,0,'shan');const v=playerView(s,0)
 assert.match(renderCenter(model(s,{guhuoChoice:true}),v),/data-action="guhuo-confirm"[^>]*disabled/,'未选中时发动禁用')
 const html=renderCenter(model(s,{guhuoChoice:true,as:'sha'}),v)
 assert.ok(!/data-action="guhuo-confirm"[^>]*disabled/.test(html),'选中后发动可用')
 assert.ok(html.includes('fs-choice-card selected'),'选中卡面高亮')
})
test('声明窗口失效时弹窗静默关闭，不残留',()=>{
 const s=fixture(),v=playerView(s,0),ui=model(s,{guhuoChoice:true})
 v.pending={id:9,kind:'response',actor:0,as:'shan'};v.legal=[]
 const html=renderCenter(ui,v)
 assert.ok(!html.includes('fs-guhuo-choice'),'窗口失效不再渲染弹窗')
 assert.equal(ui.guhuoChoice,false,'弹窗标记被静默清掉')
})
test('濒死救援窗弹窗列仙桃与琼浆，不列无关牌型',()=>{
 const s=fixture(),tao=give(s,0,'tao'),v=playerView(s,0)
 v.pending={id:7,kind:'rescue',actor:0,target:0,as:'tao',source:1}
 v.legal=[{type:'respond',ids:[tao.id],as:'tao'},{type:'respond',ids:[tao.id],as:'wine',guhuo:true},{type:'pass'}]
 const html=renderCenter(model(s,{guhuoChoice:true}),v)
 assert.deepEqual(declared(html),['tao','wine'],'救援窗只列仙桃与琼浆')
})
test('未声明时确认出牌禁用；妖言声明不走「当X」转化按钮',()=>{
 const s=fixture(),shan=give(s,0,'shan'),v=playerView(s,0)
 const opts=[{type:'play',as:'sha',ids:[shan.id],guhuo:true,targets:[1]},{type:'play',as:'draw',ids:[shan.id],guhuo:true,targets:[]}]
 const html=renderControls(model(s,{selected:[shan.id],matching:()=>opts,currentAs:()=>'sha'}),v)
 assert.ok(!html.includes('fs-conversions'),'妖言声明不出现在当X按钮行')
 assert.match(html,/data-action="confirm"[^>]*disabled/,'未声明且只能妖言时确认禁用')
 const ready=renderControls(model(s,{selected:[shan.id],matching:()=>opts,currentAs:()=>'sha',guhuoMode:true,as:'sha'}),v)
 assert.ok(!/data-action="confirm"[^>]*disabled/.test(ready),'已声明后确认可用')
 const natural=renderControls(model(s,{selected:[shan.id],matching:()=>[{type:'play',as:'sha',ids:[shan.id],targets:[1]}],currentAs:()=>'shan'}),v)
 assert.ok(natural.includes('data-action="as" data-value="sha"'),'非妖言转化按钮保留')
})
test('多声明响应窗：妖言玩家的声明按钮打开弹窗，普通玩家保留轮换',()=>{
 const rescue=s=>{const v=playerView(s,0),tao=s.players[0].hand[0];v.pending={id:7,kind:'rescue',actor:0,target:0,as:'tao',source:1};v.legal=[{type:'respond',ids:[tao.id],as:'tao'},{type:'respond',ids:[tao.id],as:'wine',guhuo:true},{type:'pass'}];return v}
 const s=fixture();give(s,0,'tao')
 assert.ok(renderControls(model(s),rescue(s)).includes('data-action="guhuo"'),'妖言玩家声明按钮打开弹窗')
 const other=fixture('yangjian');give(other,0,'tao')
 const plain=renderControls(model(other),rescue(other))
 assert.match(plain,/data-action="as" data-value="/,'普通玩家保留声明轮换')
 assert.ok(!plain.includes('data-action="guhuo"'))
})
test('妖言弹窗样式随布局定稿文件提供',async()=>{
 const css=await readFile(new URL('../site/.vuepress/components/fengshen/mobile-table.css',import.meta.url),'utf8')
 assert.ok(css.includes('.fs-guhuo-choice .fs-card-design>.fs-rank{display:none}'),'虚拟卡面隐藏空点数角标')
})
