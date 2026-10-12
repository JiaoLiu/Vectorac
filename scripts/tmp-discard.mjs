import {openBrowser} from './browser-cdp.mjs'
const b=await openBrowser({name:'probe',baseUrl:'http://127.0.0.1:4178',route:'/'})
try{
  await b.viewport(844,390)
  await b.navigate('/')
  await new Promise(r=>setTimeout(r,500))
  const r=await b.evaluate(`(()=>{const t=document.querySelector('.qa-tools');t.querySelector('select').value='hand12';t.querySelector('[data-qa-load]').click();
    let err='';try{window.__fengshenUI.act({type:'end'})}catch(e){err=e&&e.message||String(e)}
    return JSON.stringify({err,pending:window.__fengshenUI.state.pending?.kind,dom:!!document.querySelector('.fs-center-choice'),btns:[...document.querySelectorAll('.fs-action-row button')].map(x=>x.textContent)})})()`)
  console.log(r)
}finally{await b.close()}