import {openBrowser} from './browser-cdp.mjs'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
const b=await openBrowser({name:'yiji-probe',baseUrl:'http://127.0.0.1:4178',route:'/'})
try{
  await b.viewport(844,390)
  await b.navigate('/')
  await new Promise(r=>setTimeout(r,500))
  await b.evaluate(`(()=>{const t=document.querySelector('.qa-tools');const s=t.querySelector('select');s.value='classic-yiji';t.querySelector('[data-qa-load]').click();return true})()`)
  await new Promise(r=>setTimeout(r,800))
  const st=await b.evaluate(`JSON.stringify(window.__fengshenUI.state.pending)`)
  console.log('pending after load:',st)
  // 不出闪，受伤触发传道
  const r=await b.evaluate(`(()=>{let err='';try{window.__fengshenUI.act({type:'pass'})}catch(e){err=e&&e.stack||String(e)}
    return JSON.stringify({err,pending:window.__fengshenUI.state.pending})})()`)
  console.log('after pass:',r)
  await new Promise(r=>setTimeout(r,600))
  const st2=await b.evaluate(`JSON.stringify({pending:window.__fengshenUI.state.pending,pool:window.__fengshenUI.root.querySelectorAll('[data-yiji-card]').length,sel:window.__fengshenUI.selected})`)
  console.log('after yes:',st2)
  const info=await b.evaluate(`(()=>{const p=document.querySelector('.fs-pool-choice');if(!p)return null;const r=p.getBoundingClientRect(),l=p.querySelector('.fs-center-card-list')?.getBoundingClientRect();return {panel:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},list:l?{x:Math.round(l.x),y:Math.round(l.y),w:Math.round(l.width),h:Math.round(l.height)}:null,cards:p.querySelectorAll('.fs-choice-card').length,html:p.className}})()`)
  console.log('pool:',JSON.stringify(info))
  const f=await b.screenshot('yiji-before')
  console.log('shot:',f)
  // 点第一张牌，观察弹窗是否收起
  await b.evaluate(`(()=>{document.querySelector('[data-yiji-card]')?.click();return true})()`)
  await new Promise(r=>setTimeout(r,400))
  const info2=await b.evaluate(`(()=>{const p=document.querySelector('.fs-pool-choice');return {cls:p?.className,cards:p?.querySelectorAll('.fs-choice-card').length,sel:window.__fengshenUI.selected}})()`)
  console.log('after 1 card tap:',JSON.stringify(info2))
  const f2=await b.screenshot('yiji-after-tap')
  console.log('shot2:',f2)
}finally{await b.close()}