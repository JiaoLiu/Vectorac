// Contact sheets for inspection only. No source illustration is changed.
import {openBrowser} from '../../scripts/browser-cdp.mjs'
import {HEROES,CARDS_BY_TYPE} from './theme.mjs'
const browser=await openBrowser({name:'fengshen-art',baseUrl:'http://127.0.0.1:4178/',route:'/'})
try{
  for(const [kind,rows,columns]of [['heroes',HEROES,5],['cards',Object.values(CARDS_BY_TYPE),8]]){
    await browser.viewport(1280,1040);await browser.navigate();await browser.waitFor('!!window.__fengshenUI')
    await browser.evaluate(`(()=>{window.__fengshenUI.destroy();document.body.innerHTML='<main id="review" style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:8px;padding:12px;background:#132128;width:1280px;height:1040px;overflow:hidden"></main>';const rows=${JSON.stringify(rows)};for(const r of rows){const f=document.createElement('figure');f.style='margin:0;min-height:0;display:flex;flex-direction:column;align-items:center;background:#0d171c;padding:5px';const i=new Image();i.src=r.image;i.style='width:100%;height:calc(100% - 23px);min-height:0;object-fit:contain';f.append(i);const t=document.createElement('figcaption');t.textContent=r.name;t.style='height:23px;color:#e5d8b9;font:14px sans-serif;padding:4px';f.append(t);document.getElementById('review').append(f)}return true})()`)
    await browser.waitFor('[...document.images].every(i=>i.complete&&i.naturalWidth>0)')
    console.log(kind,await browser.screenshot(kind))
  }
}finally{await browser.close()}
