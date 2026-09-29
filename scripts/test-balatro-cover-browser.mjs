import assert from 'node:assert/strict'
import {readFile,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {webkit,chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const webp=await readFile(new URL('../.vuepress/public/img/games/balatro-cover.webp',import.meta.url))
const svg=await readFile(new URL('../.vuepress/public/img/games/balatro-cover.svg',import.meta.url))
const css=await readFile(new URL('../.vuepress/components/balatro/style.css',import.meta.url),'utf8')
const output=await mkdtemp(join(tmpdir(),'balatro-cover-'))
for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'&&process.env.CHROME_BINARY?{executablePath:process.env.CHROME_BINARY}:{})})
 try{
  for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:667,height:375}]){
   const page=await browser.newPage({viewport,deviceScaleFactor:2}),compact=viewport.width<800
   await page.setContent('<meta charset="utf-8"><style>body{margin:0}'+css+'</style><div id="balatro-game" class="'+(compact?'bp-compact':'')+'"><div class="bp-entry"><div class="bp-title-art"><img class="bp-entry-cover" src="data:image/svg+xml;base64,'+svg.toString('base64')+'"></div></div></div>')
   await page.locator('img').evaluate(img=>img.decode())
   assert.ok(await page.locator('img').evaluate(img=>img.naturalWidth>0))
   const bounds=await page.locator('.bp-title-art').boundingBox()
   assert.equal(bounds.height,compact?200:285,'do not enlarge the existing cover container')
   assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width)
   assert.equal(await page.locator('img').evaluate(img=>getComputedStyle(img).objectFit),'contain')
   await page.locator('.bp-title-art').screenshot({path:join(output,name+'-'+viewport.width+'.png')})
   await page.setContent('<img width="272" height="153" src="data:image/webp;base64,'+webp.toString('base64')+'">')
   await page.locator('img').evaluate(img=>img.decode())
   assert.ok(await page.locator('img').evaluate(img=>img.naturalWidth>=1200))
   await page.close()
  }
 }finally{await browser.close()}
}
console.log(JSON.stringify({passed:true,screenshots:output}))
