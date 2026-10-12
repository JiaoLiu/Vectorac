import {CARDS_BY_TYPE,skillName} from './theme.mjs'
import {ROLES} from './core/catalog.mjs'
import {esc,effectiveCard} from './presentation.mjs'
export function delayedTargetReason(view,type,target,selected=[]){
 if(type!=='indulgence')return ''
 const p=view.players[target],own=view.players[view.seat??0]
 if(!p?.alive)return '迷魂阵不能对已阵亡角色使用'
 if(target===(view.seat??0))return '迷魂阵只能对其他角色使用'
 if(p.effectiveSkills?.includes('qianxun'))return `${skillName(p,'qianxun')}：该角色免疫迷魂阵，与坐骑和距离无关`
 if(p.judgment.some(c=>c.type==='indulgence'))return '该角色已有迷魂阵，不能重复布置'
 if(p.effectiveSkills?.includes('weimu')&&selected.length&&selected.every(c=>['spade','club'].includes(effectiveCard(own,c).suit)))return `${skillName(p,'weimu')}：该角色免疫黑色法术，当前迷魂阵为黑色，与距离无关`
 return ''
}
export function jiushiButton(view){
 const p=view.players[view.seat??0],pending=view.pending
 if(pending?.actor===(view.seat??0)&&pending.kind==='ext'&&pending.skill==='jiushi-back'){
  const action=view.legal.find(a=>a.type==='invoke'&&a.value==='yes')
  if(action)return {action,label:'翻正',reason:''}
 }
 if(view.legal.some(a=>a.type==='skill'&&a.skill==='jiushi'))return {action:null,label:'发动',reason:''}
 if(p.faceDown)return {action:null,label:'背面',reason:'醇光不能主动把背面翻正。背面受到伤害后，可在醇光触发窗口翻回正面；否则下次轮到你时翻正并跳过该回合。'}
 if(p.marks?.wineUsed)return {action:null,label:'已用',reason:'本回合已使用琼浆类效果，醇光不能再次主动发动。'}
 return {action:null,label:'待机',reason:'醇光主动发动需正面朝上，且在自己的出牌阶段；背面受到伤害后的翻正由触发窗口处理。'}
}
export function heroBattleDetails(p,view){
 const status=[p.alive?p.hp<=0?'濒死 · 等待救援':'存活':'已阵亡',p.faceDown?'背面朝上 · 下回合翻正并休整':'正面朝上',p.chained?'已连环':'未连环',...(p.skillsSealed?['技能已失效']:[]),...(p.marks?.wine?['琼浆强化 · 下一张杀伤害 +1']:[]),...(view.current===p.seat&&p.marks?.skipPlay?['本回合跳过出牌阶段']:[]),...(view.current===p.seat&&p.marks?.skipDraw?['本回合跳过摸牌阶段']:[])]
 const identity=view.teamMode?'阵营公开':p.role?ROLES[p.role]?.name||'身份已公开':'身份未公开'
 const slots={weapon:'武器',armor:'防具',offenseHorse:'进攻坐骑（−1）',defenseHorse:'防御坐骑（+1）'}
 const equip=Object.entries(p.equip).filter(([,c])=>c).map(([slot,c])=>{const d=CARDS_BY_TYPE[c.type];return `<li><span>${slots[slot]||'法宝'}</span><button data-action="card-detail" data-id="${esc(c.id)}">${esc(d.name)}</button><p>${esc(d.help)}</p></li>`}).join('')
 const delays=p.judgment.map(c=>({type:c.type,id:c.id,pending:false}))
 const q=view.pending,active=q?.target===p.seat?(q.kind==='reveal'?q.delayType:q.kind==='judge-replace'?view.judgmentKind:q.kind==='counter'&&q.source==null?q.cardType:null):null
 if(CARDS_BY_TYPE[active]?.category==='delay'&&!delays.some(c=>c.type===active))delays.push({type:active,pending:true})
 const effects=delays.map(c=>{const d=CARDS_BY_TYPE[c.type];return `<li data-status-delay="${esc(c.type)}"><strong>${esc(d.name)}${c.pending?' · 正在判定':''}</strong><p>${esc(d.help)}</p></li>`}).join('')
 const limits=['qianxun','weimu'].filter(s=>p.effectiveSkills?.includes(s)).map(s=>`${skillName(p,s)}：${s==='qianxun'?'不能成为迷魂阵或摄宝的目标':'不能成为黑色法术的目标'}`)
 return `<section class="fs-live-hero-state" aria-label="当前人物状态"><h3>当前状态</h3><div class="fs-live-resources"><b>体力 ${esc(p.hp)}/${esc(p.maxHp)}</b><b>手牌 ${esc(p.handCount??0)} 张</b><span>${esc(identity)}</span></div><p>${status.map(esc).join(' · ')}</p><h4>当前装备</h4>${equip?`<ul>${equip}</ul>`:'<p>未装备法宝或坐骑</p>'}<h4>判定区／阵法</h4>${effects?`<ul>${effects}</ul>`:'<p>没有待判定阵法</p>'}${limits.length?`<h4>目标限制</h4><p>${limits.map(esc).join('；')}</p>`:''}</section>`
}
