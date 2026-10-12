import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
const b=await openBrowser({name:'gods-home-spacing',baseUrl:process.env.FENGSHEN_TEST_URL||'http://127.0.0.1:4186'})
const scenarios=[{name:'clean',legacy:false,resume:false,online:false},{name:'legacy',legacy:true,resume:false,online:false},{name:'returning',legacy:true,resume:true,online:true}]
const geometry=()=>b.evaluate(`(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}},css=e=>{const s=getComputedStyle(e);return {font:s.fontFamily,size:s.fontSize,spacing:s.letterSpacing,line:s.lineHeight,padding:s.padding}}
 return {vw:innerWidth,vh:innerHeight,scroll:document.documentElement.scrollWidth,
 modes:[...document.querySelectorAll('.fs-mode-chip')].map(e=>({r:rect(e),title:css(e.querySelector('b')),description:css(e.querySelector('small')),titleWidth:e.querySelector('b').getBoundingClientRect().width,innerWidth:e.clientWidth-parseFloat(getComputedStyle(e).paddingLeft)-parseFloat(getComputedStyle(e).paddingRight)})),
 actions:[...document.querySelectorAll('.fs-entry-actions>*')].map(e=>({r:rect(e),css:css(e),action:e.dataset.action})),
 notice:document.querySelector('.fs-legacy-notice')?css(document.querySelector('.fs-legacy-notice')):null}
})()`)
try{
 await b.navigate();await b.waitFor('!!window.__fengshenUI');await b.evaluate('localStorage.clear();true');await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h]of [[320,568],[360,640],[390,844],[430,932],[568,320],[667,375],[844,390],[932,430],[768,1024],[1280,800]]){
  await b.viewport(w,h)
  for(const scenario of scenarios){
   await b.evaluate(`(()=>{const u=window.__fengshenUI;u.lobby=true;u.state=null;u.setup=null;u.modal=null;u.viewport.setImmersive(false);u.legacySave=${scenario.legacy};u.resumeSession=${scenario.resume?'({kind:"game"})':'null'};u.networkCredential=${scenario.online?'({roomCode:"ABCDEF"})':'null'};u.render();return true})()`)
   const g=await geometry();assert.ok(g.scroll<=w+1,'horizontal page overflow '+w+' '+scenario.name);assert.equal(g.modes.length,6)
   assert.equal(new Set(g.modes.map(x=>x.title.font)).size,1);assert.equal(new Set(g.modes.map(x=>x.title.spacing)).size,1);assert.equal(new Set(g.modes.map(x=>x.title.line)).size,1)
   for(const m of g.modes){assert.ok(m.r.h>=44,'mode touch size');assert.ok(m.titleWidth<=m.innerWidth+1,'clipped title '+w);assert.ok(m.r.x>=0&&m.r.right<=w+1,'mode edge')}
   const start=g.actions.find(x=>x.action==='start'),online=g.actions[1];assert.ok(Math.abs(start.r.y-online.r.y)<1);assert.ok(Math.abs(start.r.w-online.r.w)<1);assert.ok(online.r.x-start.r.right>=7,'CTA gap');assert.deepEqual(start.css,online.css)
   for(const a of g.actions)assert.ok(a.r.h>=44&&a.r.x>=0&&a.r.right<=w+1,'CTA touch/edge')
   if(scenario.legacy){assert.equal(g.notice.spacing,'normal');assert.ok(parseFloat(g.notice.size)>=11&&parseFloat(g.notice.size)<=12)}
   if(!scenario.resume){assert.ok(start.r.bottom<=h+1,'primary controls below viewport '+w+' '+scenario.name)}
   if(scenario.name==='legacy'&&[320,390,568,844,932].includes(w))await b.screenshot(w+'x'+h+'-'+scenario.name)
  }
 }
 await b.viewport(390,844);await b.evaluate('window.__fengshenUI.resumeSession=null;window.__fengshenUI.networkCredential=null;window.__fengshenUI.render();true')
 for(const id of ['identity8','3v3','2v2','1v1','identity5']){await b.tap('[data-action=mode][data-id="'+id+'"]');assert.equal(await b.evaluate('window.__fengshenUI.mode'),id);assert.equal(await b.evaluate('document.querySelector("[data-action=mode][aria-pressed=true]").dataset.id'),id)}
 const before=await b.evaluate('window.__fengshenUI.deckVersion');await b.tap('[data-action=deck]');assert.notEqual(await b.evaluate('window.__fengshenUI.deckVersion'),before);await b.tap('[data-action=deck]');assert.equal(await b.evaluate('window.__fengshenUI.deckVersion'),before)
 assert.ok((await b.evaluate('document.querySelector(".fs-online-entry").getAttribute("href")')).includes('game=fengshen'))
 assert.deepEqual(b.errors.filter(e=>e!==JSON.stringify({code:-32602,message:'Invalid InterceptionId.'})),[]);console.log('PASS: 10 viewports × 3 save/resume states; uniform title spacing, 44px targets, CTA alignment, no clipped titles, actual mode/deck touch switching. Screenshots: '+b.output)
}catch(error){console.error('Failure screenshot: '+await b.screenshot('failure'));throw error}finally{await b.close()}
