import {PARTS,FREE_PARTS,DEFAULT_PARTS,validParts,fineTags} from './parts.mjs'
import {beautyPreset} from './beauty.mjs'
export const SAVE_KEY = 'vectorac.flower-wardrobe.v1'
export const OUTFITS = [
  {id:'blush', name:'蔷薇初绽', price:0, color:'#d894a2', tags:['甜美','茶会'], detail:'蔷薇刺绣 · 珍珠纽扣 · 三层花边', story:'把第一封春日邀请，缝进柔软的裙摆。'},
  {id:'mint', name:'薄荷花信', price:140, color:'#86b6a6', tags:['自然','清新'], detail:'雏菊刺绣 · 薄荷缎带 · 奶油蕾丝', story:'穿过花园，裙摆也沾上清晨的露水。'},
  {id:'rose', name:'红丝绒茶会', price:200, color:'#93445c', tags:['古典','茶会'], detail:'酒红织锦 · 珍珠垂链 · 宫廷花边', story:'下午四点，赴一场只属于自己的茶会。'},
  {id:'night', name:'星河来信', price:260, color:'#535477', tags:['梦幻','星光'], detail:'金线星图 · 星月薄纱 · 宝石蝴蝶结', story:'把夜空的星星，悄悄收进衣橱。'},
  {id:'ice', name:'雪境圆舞曲', price:300, color:'#9bbfce', tags:['梦幻','清新'], detail:'银丝雪花 · 冰蓝欧根纱 · 珍珠点缀', story:'不必等到冬天，也能跳一支雪中的舞。'},
  {id:'hanfu', name:'桃枝春信', price:220, color:'#c9938d', tags:['国风','自然'], detail:'交领绣花 · 宽袖轻纱 · 桃色长裙', story:'桃花开时，赴一场春日之约。'},
  {id:'academy', name:'书页与风', price:160, color:'#626d84', tags:['学院','古典'], detail:'奶油西装 · 金色纽扣 · 藏蓝阔腿裤', story:'把诗集夹在臂弯，让风翻开新的一页。'},
  {id:'sailor', name:'海盐晴空', price:160, color:'#709bae', tags:['海风','清新'], detail:'水手方领 · 缎带领结 · 清爽百褶', story:'晴空、海风和不急着归来的午后。'},
  {id:'wisteria', name:'紫藤轻梦', price:240, color:'#a189b3', tags:['梦幻','自然'], detail:'紫藤刺绣 · 轻盈雪纺 · 飘逸长裙', story:'花影落在裙摆上，连脚步也轻了。'},
  {id:'champagne', name:'金色序曲', price:280, color:'#b79a63', tags:['礼服','古典'], detail:'香槟缎面 · 金线枝叶 · 长裙礼服', story:'不必等待盛大的舞会，今天就值得闪耀。'},
  {id:'qipao',name:'碧水兰亭',price:230,color:'#74a99c',tags:['国风','古典'],detail:'碧色绣花 · 珍珠盘扣 · 轻盈旗袍',story:'把江南的春天穿在身上。'},
  {id:'fairy',name:'云端芭蕾',price:240,color:'#a4bad5',tags:['梦幻','甜美'],detail:'星光薄纱 · 芭蕾缎带 · 珍珠发夹',story:'轻轻踮起脚尖，让云朵陪你跳舞。'},
  {id:'street',name:'晴日漫步',price:160,color:'#b4a1c7',tags:['学院','清新'],detail:'丁香外套 · 炭灰长裤 · 白色运动鞋',story:'逛街、听歌，去发现日常里的好心情。'},
  {id:'ruby',name:'红宝石之夜',price:290,color:'#a55262',tags:['礼服','古典'],detail:'红丝绒长裙 · 金线玫瑰 · 轻柔披袖',story:'为舞会的最后一支曲子，留下最美的身影。'}
]
export const SCENES = [
  {id:'atelier',name:'晨光衣帽间',price:0,colors:['#f7e9dc','#e6cbbb'],tag:'茶会'},
  {id:'garden',name:'花园来风',price:60,colors:['#e5eee1','#b3cebe'],tag:'自然'},
  {id:'moon',name:'月下露台',price:100,colors:['#424862','#a8a2c4'],tag:'星光'},
  {id:'snow',name:'冬日玻璃屋',price:100,colors:['#e6f3f5','#b7d2e2'],tag:'清新'},
  {id:'sea',name:'海边假日',price:70,colors:['#d8edf0','#b9d5d6'],tag:'海风'},
  {id:'gallery',name:'金色画廊',price:80,colors:['#f3e6cf','#d4b992'],tag:'古典'},
  {id:'castle',name:'玫瑰城堡',price:90,colors:['#e8d9d7','#c3c7d2'],tag:'古典'}
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
  {id:'bloom',name:'花间的你',text:'甜美风裙装，在花园里轻轻问好。',tag:'甜美',scene:'garden',pose:2,reward:120},
  {id:'peach',name:'桃花笺',text:'国风服装，在花园里优雅侧身。',tag:'国风',scene:'garden',pose:1,reward:200},
  {id:'study',name:'书店漫游',text:'学院服装，在晨光里静静站立。',tag:'学院',scene:'atelier',pose:0,reward:160},
  {id:'sailing',name:'海边明信片',text:'海风服装，在海边假日轻轻问好。',tag:'海风',scene:'sea',pose:2,reward:200},
  {id:'gala',name:'画廊晚宴',text:'礼服风装扮，在金色画廊优雅侧身。',tag:'礼服',scene:'gallery',pose:1,reward:220}
]
const ids = xs => xs.map(x=>x.id)
const int = (v,max=1000000) => Number.isSafeInteger(v)&&v>=0 ? Math.min(v,max) : 0
export const item = (list,id) => list.find(x=>x.id===id)
export const asset = (outfit,pose=0) => `/img/games/dressup/${outfit}-${pose}.webp`
export const sceneAsset=id=>`/img/games/dressup/scenes/${id}.webp`
export function freshState(){return {version:1,coins:100,owned:['blush'],scenes:['atelier'],ownedParts:[...FREE_PARTS],look:{outfit:'blush',scene:'atelier',pose:0,mode:'outfit',parts:{...DEFAULT_PARTS}},claimed:[],daily:'',albums:[],atelierWins:0,gameClaims:[]}}
export function normalize(raw){
  const s=freshState()
  if(!raw||raw.version!==1) return s
  s.coins=int(raw.coins)
  s.owned=Array.from(new Set(['blush',...(Array.isArray(raw.owned)?raw.owned:[]).filter(x=>ids(OUTFITS).includes(x))]))
  s.scenes=Array.from(new Set(['atelier',...(Array.isArray(raw.scenes)?raw.scenes:[]).filter(x=>ids(SCENES).includes(x))]))
  s.ownedParts=Array.from(new Set([...FREE_PARTS,...(Array.isArray(raw.ownedParts)?raw.ownedParts:[]).filter(x=>ids(PARTS).includes(x))]))
  s.gameClaims=(Array.isArray(raw.gameClaims)?raw.gameClaims:[]).filter(x=>typeof x==='string').slice(-60)
  s.claimed=Array.from(new Set((Array.isArray(raw.claimed)?raw.claimed:[]).filter(x=>ids(QUESTS).includes(x))))
  s.look=validLook(raw.look,s)
  s.daily=typeof raw.daily==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.daily)?raw.daily:''
  s.atelierWins=int(raw.atelierWins)
  s.albums=(Array.isArray(raw.albums)?raw.albums:[]).slice(0,12).filter(x=>x&&typeof x.id==='string').map(x=>({id:x.id.slice(0,80),look:validLook(x.look,s)}))
  return s
}
function validLook(look,s){
  const l=look||{}
  return {outfit:s.owned.includes(l.outfit)?l.outfit:'blush',scene:s.scenes.includes(l.scene)?l.scene:'atelier',pose:[0,1,2].includes(l.pose)?l.pose:0,mode:l.mode==='fine'?'fine':'outfit',parts:validParts(l.parts,s.ownedParts)}
}
export function localDay(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
export function scoreLook(look,quest){
  if(!quest)return {score:0,checks:[]}
  const dress=item(OUTFITS,look.outfit)
  const tags=look.mode==='fine'?fineTags(look.parts):dress?dress.tags:[]
  const checks=[{label:`${quest.tag}风格`,ok:tags.includes(quest.tag),points:50},{label:item(SCENES,quest.scene).name,ok:look.scene===quest.scene,points:25},{label:POSES[quest.pose].name,ok:look.pose===quest.pose,points:25}]
  return {score:checks.reduce((n,c)=>n+(c.ok?c.points:0),0),checks}
}
// All economy mutations run here; rendering never awards currency.
export function act(state,action){
  const s=normalize(state), fail=message=>({state:s,ok:false,message})
  switch(action.type){
    case 'buy': {
      const scene=action.kind==='scene',part=action.kind==='part',list=scene?SCENES:part?PARTS:OUTFITS,owned=scene?s.scenes:part?s.ownedParts:s.owned,p=item(list,action.id)
      if(!p)return fail('没有这件藏品')
      if(owned.includes(p.id))return fail('已经拥有，不会重复扣金币')
      if(s.coins<p.price)return fail('金币还不够，去完成邀请或玩配色工坊吧')
      s.coins-=p.price;owned.push(p.id)
      if(part){s.look.mode='fine';s.look.parts[p.category]=p.id;s.look.pose=0}else{s.look[scene?'scene':'outfit']=p.id;if(!scene)s.look.mode='outfit'}
      return {state:s,ok:true,message:`已解锁「${p.name}」`}
    }
    case 'wear': {
      if(!s.owned.includes(action.outfit))return fail('先解锁这套服装吧')
      s.look.outfit=action.outfit;s.look.mode='outfit';break
    }
    case 'scene': if(!s.scenes.includes(action.id))return fail('先解锁这个场景吧');s.look.scene=action.id;break
    case 'pose': if(![0,1,2].includes(action.id))return fail('姿势不可用');s.look.pose=action.id;break
    case 'mode': if(!['fine','outfit'].includes(action.mode))return fail('装扮方式不可用');s.look.mode=action.mode;if(action.mode==='fine')s.look.pose=0;break
    case 'part': {const p=item(PARTS,action.id);if(!p||!s.ownedParts.includes(p.id))return fail('先解锁这件装扮吧');s.look.mode='fine';s.look.parts[p.category]=p.id;s.look.pose=0;break}
    case 'beauty': {
      const preset=beautyPreset(action.id)
      if(!preset||!Object.values(preset.parts).every(id=>s.ownedParts.includes(id)))return fail('这套妆容暂不可用')
      s.look.mode='fine';s.look.pose=0;s.look.parts={...s.look.parts,...preset.parts};break
    }
    case 'gameReward': {
      if(typeof action.id!=='string'||!action.id||![45,60,65].includes(action.reward))return fail('工坊结算无效')
      if(s.gameClaims.includes(action.id))return fail('这局奖励已经领取')
      s.gameClaims=[...s.gameClaims,action.id].slice(-60);s.coins+=action.reward;s.atelierWins++;return {state:s,ok:true,message:`工坊完成 · +${action.reward} 金币`}
    }
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
      s.albums.unshift({id:action.id,look:{...s.look,parts:{...s.look.parts}}});return {state:s,ok:true,message:'已收藏到穿搭相册'}
    }
    case 'removeAlbum':s.albums=s.albums.filter(x=>x.id!==action.id);break
    case 'restoreAlbum': {const a=s.albums.find(x=>x.id===action.id);if(!a)return fail('穿搭不存在');s.look={...a.look,parts:{...a.look.parts}};break}
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
