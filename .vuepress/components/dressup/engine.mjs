export const SAVE_KEY = 'vectorac.flower-wardrobe.v1'
export const OUTFITS = [
  {id:'blush', name:'蔷薇初绽', price:0, color:'#d894a2', tags:['甜美','茶会'], detail:'蔷薇刺绣 · 珍珠纽扣 · 三层花边', story:'把第一封春日邀请，缝进柔软的裙摆。'},
  {id:'mint', name:'薄荷花信', price:140, color:'#86b6a6', tags:['自然','清新'], detail:'雏菊刺绣 · 薄荷缎带 · 奶油蕾丝', story:'穿过花园，裙摆也沾上清晨的露水。'},
  {id:'rose', name:'红丝绒茶会', price:200, color:'#93445c', tags:['古典','茶会'], detail:'酒红织锦 · 珍珠垂链 · 宫廷花边', story:'下午四点，赴一场只属于自己的茶会。'},
  {id:'night', name:'星河来信', price:260, color:'#535477', tags:['梦幻','星光'], detail:'金线星图 · 星月薄纱 · 宝石蝴蝶结', story:'把夜空的星星，悄悄收进衣橱。'},
  {id:'ice', name:'雪境圆舞曲', price:300, color:'#9bbfce', tags:['梦幻','清新'], detail:'银丝雪花 · 冰蓝欧根纱 · 珍珠点缀', story:'不必等到冬天，也能跳一支雪中的舞。'}
]
export const SCENES = [
  {id:'atelier',name:'晨光衣帽间',price:0,colors:['#f7e9dc','#e6cbbb'],tag:'茶会'},
  {id:'garden',name:'花园来风',price:60,colors:['#e5eee1','#b3cebe'],tag:'自然'},
  {id:'moon',name:'月下露台',price:100,colors:['#424862','#a8a2c4'],tag:'星光'},
  {id:'snow',name:'冬日玻璃屋',price:100,colors:['#e6f3f5','#b7d2e2'],tag:'清新'}
]
export const POSES = [{id:0,name:'静静站立'},{id:1,name:'优雅侧身'},{id:2,name:'轻轻问好'}]
export const QUESTS = [
  {id:'hello',name:'第一封邀请',text:'甜美的裙装，在晨光中轻轻问好。',tag:'甜美',scene:'atelier',pose:2,reward:100},
  {id:'garden',name:'花园写生',text:'自然风裙装，花园里的一次优雅侧身。',tag:'自然',scene:'garden',pose:1,reward:140},
  {id:'tea',name:'四点的茶会',text:'茶会风裙装，在衣帽间静静站立。',tag:'茶会',scene:'atelier',pose:0,reward:100},
  {id:'classic',name:'古典画报',text:'古典风裙装，在晨光里优雅侧身。',tag:'古典',scene:'atelier',pose:1,reward:180},
  {id:'star',name:'寄给星星',text:'星光风裙装，在月下露台轻轻问好。',tag:'星光',scene:'moon',pose:2,reward:200},
  {id:'winter',name:'雪落无声',text:'清新风裙装，在冬日玻璃屋静静站立。',tag:'清新',scene:'snow',pose:0,reward:150},
  {id:'dream',name:'冬日圆舞曲',text:'梦幻风裙装，在冬日玻璃屋优雅侧身。',tag:'梦幻',scene:'snow',pose:1,reward:160},
  {id:'bloom',name:'花间的你',text:'甜美风裙装，在花园里轻轻问好。',tag:'甜美',scene:'garden',pose:2,reward:120}
]
const ids = xs => xs.map(x=>x.id)
const int = (v,max=1000000) => Number.isSafeInteger(v)&&v>=0 ? Math.min(v,max) : 0
export const item = (list,id) => list.find(x=>x.id===id)
export const asset = (outfit,pose=0) => `/img/games/dressup/${outfit}-${pose}.webp`
export function freshState(){return {version:1,coins:100,owned:['blush'],scenes:['atelier'],look:{outfit:'blush',scene:'atelier',pose:0},claimed:[],daily:'',albums:[],atelierWins:0}}
export function normalize(raw){
  const s=freshState()
  if(!raw||raw.version!==1) return s
  s.coins=int(raw.coins)
  s.owned=Array.from(new Set(['blush',...(Array.isArray(raw.owned)?raw.owned:[]).filter(x=>ids(OUTFITS).includes(x))]))
  s.scenes=Array.from(new Set(['atelier',...(Array.isArray(raw.scenes)?raw.scenes:[]).filter(x=>ids(SCENES).includes(x))]))
  s.claimed=Array.from(new Set((Array.isArray(raw.claimed)?raw.claimed:[]).filter(x=>ids(QUESTS).includes(x))))
  s.look=validLook(raw.look,s)
  s.daily=typeof raw.daily==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.daily)?raw.daily:''
  s.atelierWins=int(raw.atelierWins)
  s.albums=(Array.isArray(raw.albums)?raw.albums:[]).slice(0,12).filter(x=>x&&typeof x.id==='string').map(x=>({id:x.id.slice(0,80),look:validLook(x.look,s)}))
  return s
}
function validLook(look,s){
  const l=look||{}
  return {outfit:s.owned.includes(l.outfit)?l.outfit:'blush',scene:s.scenes.includes(l.scene)?l.scene:'atelier',pose:[0,1,2].includes(l.pose)?l.pose:0}
}
export function localDay(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
export function scoreLook(look,quest){
  if(!quest)return {score:0,checks:[]}
  const dress=item(OUTFITS,look.outfit)
  const checks=[{label:`${quest.tag}风格`,ok:!!dress&&dress.tags.includes(quest.tag),points:50},{label:item(SCENES,quest.scene).name,ok:look.scene===quest.scene,points:25},{label:POSES[quest.pose].name,ok:look.pose===quest.pose,points:25}]
  return {score:checks.reduce((n,c)=>n+(c.ok?c.points:0),0),checks}
}
// All economy mutations run here; rendering never awards currency.
export function act(state,action){
  const s=normalize(state), fail=message=>({state:s,ok:false,message})
  switch(action.type){
    case 'buy': {
      const scene=action.kind==='scene',list=scene?SCENES:OUTFITS,owned=scene?s.scenes:s.owned,p=item(list,action.id)
      if(!p)return fail('没有这件藏品')
      if(owned.includes(p.id))return fail('已经拥有，不会重复扣金币')
      if(s.coins<p.price)return fail('金币还不够，去完成邀请或玩配色工坊吧')
      s.coins-=p.price;owned.push(p.id);s.look[scene?'scene':'outfit']=p.id
      return {state:s,ok:true,message:`已解锁「${p.name}」`}
    }
    case 'wear': {
      if(!s.owned.includes(action.outfit))return fail('先解锁这套服装吧')
      s.look.outfit=action.outfit;break
    }
    case 'scene': if(!s.scenes.includes(action.id))return fail('先解锁这个场景吧');s.look.scene=action.id;break
    case 'pose': if(![0,1,2].includes(action.id))return fail('姿势不可用');s.look.pose=action.id;break
    case 'daily': {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(action.day||''))return fail('日期无效')
      if(s.daily>=action.day)return fail('今天的花信已经领取过了')
      s.daily=action.day;s.coins+=40;return {state:s,ok:true,message:'今日花信 · 收到 40 金币'}
    }
    case 'quest': {
      const q=item(QUESTS,action.id)
      if(!q)return fail('邀请不存在')
      if(s.claimed.includes(q.id))return fail('这份邀请已完成，不会重复领奖')
      if(scoreLook(s.look,q).score!==100)return fail('再看看邀请的三个搭配条件吧')
      s.claimed.push(q.id);s.coins+=q.reward;return {state:s,ok:true,message:`完美赴约 · +${q.reward} 金币`}
    }
    case 'album': {
      if(s.albums.length>=12)return fail('相册已满，先移除一张旧穿搭吧')
      if(s.albums.some(x=>JSON.stringify(x.look)===JSON.stringify(s.look)))return fail('相册已经收藏了这套穿搭')
      if(typeof action.id!=='string'||!action.id||s.albums.some(x=>x.id===action.id))return fail('照片编号无效')
      s.albums.unshift({id:action.id,look:{...s.look}});return {state:s,ok:true,message:'已收藏到穿搭相册'}
    }
    case 'removeAlbum':s.albums=s.albums.filter(x=>x.id!==action.id);break
    case 'restoreAlbum': {const a=s.albums.find(x=>x.id===action.id);if(!a)return fail('穿搭不存在');s.look={...a.look};break}
    default:return fail('未知操作')
  }
  return {state:s,ok:true,message:''}
}
// A session can pay only once, after all five requested colors were matched.
export function createWorkshop(random=Math.random){return {targets:Array.from({length:5},()=>Math.min(3,Math.max(0,Math.floor(random()*4)))),step:0,paid:false}}
export function matchColor(session,color){
  if(session.paid||session.step>=5)return {session,correct:false,complete:false}
  if(color!==session.targets[session.step])return {session,correct:false,complete:false}
  const next={...session,step:session.step+1};return {session:next,correct:true,complete:next.step===5}
}
export function finishWorkshop(state,session){
  if(session.paid||session.step!==5)return {state,session,ok:false}
  const s=normalize(state);s.coins+=25;s.atelierWins+=1
  return {state:s,session:{...session,paid:true},ok:true}
}
