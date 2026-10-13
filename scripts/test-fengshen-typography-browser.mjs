import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {CARDS_BY_TYPE} from '../site/.vuepress/components/fengshen/theme.mjs'
import {cardFace,scaleCards} from '../site/.vuepress/components/fengshen/presentation.mjs'
import {createAssignedGame} from '../site/.vuepress/components/fengshen/engine.mjs'
const cards=Object.values(CARDS_BY_TYPE)
const state=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['yangjian','jifa','nezha','jinling','daji'],seed:23})
Object.assign(state,{queue:[],pending:null,phase:'play',current:0,logs:[],lastPlayed:null,lastResponse:null,publicReveal:null})
const html=cards.map((c,i)=>`<div data-font-card="${i}" style="width:100px;height:144px">${cardFace({type:c.type,suit:'heart',rank:10})}</div>`).join('')
const b=await openBrowser({name:'gods-all-card-fonts',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 // Font contact-sheet is a fixed QA overlay, not a live settling effect.
 await b.evaluate('window.__fengshenUI.tableSettlement.frame=()=>({closedChain:null,fading:false,remaining:0});true')
 await b.evaluate(`(async()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(state)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();const sheet=document.createElement('div');sheet.id='fs-font-audit';sheet.style.cssText='position:fixed;inset:0;z-index:9999;background:#102019;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,100px);gap:12px;padding:12px;align-content:start';sheet.innerHTML=${JSON.stringify(html)};u.root.append(sheet);for(const face of sheet.querySelectorAll('.fs-clean-card'))face.style.cssText='display:block;width:100px;height:144px';for(const img of sheet.querySelectorAll('img'))img.loading='eager';(${scaleCards.toString()})(sheet);await document.fonts.ready;await Promise.all([...sheet.querySelectorAll('img')].map(img=>img.decode()));return true})()`)
 await b.send('DOM.enable');await b.send('CSS.enable')
 for(const [w,h] of [[932,430],[812,375],[568,320],[390,844]]){
  await b.viewport(w,h)
  const bounds=await b.evaluate(`(()=>{const sheet=document.getElementById('fs-font-audit');return [...sheet.querySelectorAll('strong')].map(e=>{const r=document.createRange();r.selectNodeContents(e);const text=r.getBoundingClientRect(),box=e.getBoundingClientRect(),css=getComputedStyle(e);return {name:e.textContent,within:text.left>=box.left-.5&&text.right<=box.right+.5&&text.top>=box.top-.5&&text.bottom<=box.bottom+.5,font:css.fontFamily,size:parseFloat(css.fontSize)}})})()`)
  for(const x of bounds){assert.ok(x.within,`${w}x${h}: clipped title ${JSON.stringify(x)}`);assert.ok(x.font.startsWith('"Ma Shan Zheng"'),x.name+' changed family')}
  const {root}=await b.send('DOM.getDocument')
  for(let i=0;i<cards.length;i++){
   const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:`#fs-font-audit [data-font-card="${i}"] strong`})
   const {fonts}=await b.send('CSS.getPlatformFontsForNode',{nodeId})
   assert.equal(fonts.length,1,`${cards[i].name}: mixed fallback fonts ${JSON.stringify(fonts)}`)
   assert.ok(fonts[0].isCustomFont,`${cards[i].name}: system font fallback ${JSON.stringify(fonts)}`)
   assert.match(fonts[0].familyName,/Ma Shan Zheng/)
   assert.equal(fonts[0].glyphCount,[...cards[i].name].length,`${cards[i].name}: missing glyph`)
  }
  console.log(`PASS ${w}x${h}: ${cards.length} titles use real embedded font glyphs, not fallback; all title bounds fit`)
  console.log('screenshot',await b.screenshot(`${w}x${h}-all-cards`))
  await b.evaluate("(()=>{const sheet=document.getElementById('fs-font-audit');sheet.scrollTop=sheet.scrollHeight;return true})()")
  console.log('new card screenshot',await b.screenshot(`${w}x${h}-new-card-titles`))
  await b.evaluate("document.getElementById('fs-font-audit').scrollTop=0;true")
 }
 assert.deepEqual(b.errors,[])
 console.log('PASS all card names including 琼浆/炎杀/雷杀/闭粮阵/缚神索; Chromium emulation, NOT physical iPhone Safari')
}finally{await b.close()}
