import {openBrowser} from './browser-cdp.mjs'
const b=await openBrowser({name:'yiji-probe',baseUrl:'http://127.0.0.1:4178',route:'/'})
const wait=ms=>new Promise(r=>setTimeout(r,ms))
try{
  await b.viewport(Number(process.argv[2])||844,Number(process.argv[3])||390)
  await b.navigate('/')
  await wait(500)
  await b.evaluate(`(()=>{const t=document.querySelector('.qa-tools');const s=t.querySelector('select');s.value='classic-yiji';t.querySelector('[data-qa-load]').click();return true})()`)
  await wait(800)
  console.log('after load pending:',await b.evaluate(`JSON.stringify(window.__fengshenUI.state.pending)`))
  console.log('after pass:',await b.evaluate(`(()=>{let err='';try{window.__fengshenUI.act({type:'pass'})}catch(e){err=e&&e.stack||String(e)}return JSON.stringify({err,pending:window.__fengshenUI.state.pending})})()`))
  await wait(700)
  const panel=await b.evaluate(`(()=>{const p=document.querySelector('.fs-pool-choice');if(!p)return null;return {cls:p.className,cards:p.querySelectorAll('[data-yiji-card]').length,targets:[...p.querySelectorAll('.fs-yiji-targets button')].map(x=>x.textContent),mini:!!document.querySelector('.fs-yiji-mini')}})()`)
  console.log('panel:',JSON.stringify(panel))
  // 多选两张牌
  await b.evaluate(`(()=>{const cs=[...document.querySelectorAll('[data-yiji-card]')];cs[0].click();cs[1].click();return true})()`)
  await wait(400)
  console.log('after 2 taps:',await b.evaluate(`JSON.stringify({sel:window.__fengshenUI.selected,cards:document.querySelectorAll('[data-yiji-card]').length,mini:!!document.querySelector('.fs-yiji-mini'),note:document.querySelector('.fs-yiji-choice footer span')?.textContent,confirmDisabled:document.querySelector('.fs-action-row [data-action=confirm]')?.disabled})`))
  // 选接收者
  await b.evaluate(`(()=>{document.querySelector('.fs-yiji-targets button').click();return true})()`)
  await wait(300)
  console.log('after target:',await b.evaluate(`JSON.stringify({targets:window.__fengshenUI.targets,note:document.querySelector('.fs-yiji-choice footer span')?.textContent,confirmDisabled:document.querySelector('.fs-action-row [data-action=confirm]')?.disabled})`))
  await b.screenshot('yiji-multi')
  // 确认赠牌
  const before=await b.evaluate(`JSON.stringify({ids:window.__fengshenUI.state.pending?.ids,hand:window.__fengshenUI.state.players[window.__fengshenUI.targets[0]]?.hand.length})`)
  await b.evaluate(`(()=>{window.__fengshenUI.confirm();return true})()`)
  await wait(500)
  console.log('before give:',before)
  console.log('after give:',await b.evaluate(`JSON.stringify({pending:window.__fengshenUI.state.pending?.kind,ids:window.__fengshenUI.state.pending?.ids,hand:window.__fengshenUI.state.players[1].hand.length,sel:window.__fengshenUI.selected,targets:window.__fengshenUI.targets})`))
  console.log('errors:',JSON.stringify(b.errors))
}finally{await b.close()}