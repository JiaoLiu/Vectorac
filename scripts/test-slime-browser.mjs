import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=resolve(import.meta.dirname,'..'),out=await mkdtemp(join(tmpdir(),'slime-qa-'));
const md=await readFile(join(root,'blogs/other/slime_game.md'),'utf8');
const audioSource=await readFile(join(root,'.vuepress/components/slime-audio.js'),'utf8');
const {TOOL_SOUNDS}=await import('data:text/javascript;base64,'+Buffer.from(audioSource).toString('base64'));
const kitSize=new Set([...Object.values(TOOL_SOUNDS).flat(),'bed_01']).size;
const html=md.slice(md.indexOf('<div id="slimeGame"'),md.indexOf('<div class="game-introduction">'));
const css=md.match(/<style>([\s\S]*?)<\/style>/)[1];
const built=await build({stdin:{contents:"export {default as Studio} from './.vuepress/components/SlimeStudio';export {default as Audio} from './.vuepress/components/slime-audio';",resolveDir:root},bundle:true,format:'iife',globalName:'SlimeTest',write:false});
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/test.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text);return;}
  if(req.url.startsWith('/audio/')){res.setHeader('Content-Type','audio/wav');res.end(await readFile(join(root,'.vuepress/public',req.url)));return;}
  if(req.url.startsWith('/js/')){res.setHeader('Content-Type','text/javascript');res.end(await readFile(join(root,'.vuepress/public',req.url)));return;}
  res.setHeader('Content-Type','text/html');res.end(`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${css}</style>${html}<script src="/test.js"></script>`);
 }catch(_){res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true,...(process.env.BROWSER!=='webkit'?{executablePath:process.env.CHROME_BINARY,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
try{
 for(const viewport of [{width:1100,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport,hasTouch:true,deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(()=>{
   window.studio=new SlimeTest.Studio(document.querySelector('#slimeCanvas'));
   window.sounds=[];const play=studio.audio.play.bind(studio.audio);
   studio.audio.play=(tool,...args)=>{const result=play(tool,...args);if(result)sounds.push(tool);return result;};
  });
  // Warmup may create a suspended context during idle time, but nothing may
  // be audible before the first user gesture.
  assert.notEqual(await page.evaluate(()=>studio.audio.context&&studio.audio.context.state),'running');
  await page.locator('[data-material=cotton]').click();
  await page.waitForFunction(()=>studio.audio.context && studio.audio.context.state==='running');
  await page.evaluate(()=>studio.audio.ready);
  assert.equal(await page.evaluate(()=>studio.audio.buffers.size),kitSize,'all recorded foley decoded');
  assert.ok(await page.evaluate(()=>Array.from(studio.audio.buffers.values()).every(b=>{
    const data=b.getChannelData(0);let peak=0;for(const sample of data)peak=Math.max(peak,Math.abs(sample));return peak>.005 && peak<=1;
  })),'recordings contain a non-silent, non-clipped signal');
  assert.equal(await page.evaluate(()=>studio.model.material),'cotton');
  await page.locator('#slimeCanvas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(()=>!studio.mesh.children.some(c=>c.isPoints) && studio.material.bumpMap===studio.cotton.texture),'cotton inclusions stay in the gel, no fur layer');
  await page.locator('#slimeCanvas').screenshot({path:join(out,`cotton-${viewport.width}.png`)});
  await page.locator('[data-material=crystal]').click();
  await page.waitForFunction(()=>studio.material.bumpMap===null && studio.cottonSoftness.value===0);
  await page.locator('[data-material=cotton]').click();
  const center=async()=>{
   await page.locator('#slimeCanvas').scrollIntoViewIfNeeded();
   return page.evaluate(()=>{
    studio.updateCamera();const p=studio.mesh.localToWorld(studio.mesh.position.clone().set(0,0,.25)).project(studio.camera),r=studio.canvas.getBoundingClientRect();
    return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
   });
  };
  const touch=await center();
  await page.touchscreen.tap(touch.x,touch.y);
  assert.ok(await page.evaluate(()=>sounds.includes('pump')),'trusted touch tap also plays foley');
  for(const tool of ['pump','pinch','carve','flatten','smooth','glitter','foil','move','tear','fold','bubble']){
   await page.locator('[data-mold=round]').click();
   await page.locator(`[data-tool=${tool}]`).first().click();
   const p=await center();await page.mouse.move(p.x,p.y);await page.mouse.down();
   await page.waitForTimeout(240);await page.mouse.move(p.x+20,p.y-8,{steps:5});await page.waitForTimeout(120);await page.mouse.up();
   await page.waitForFunction(()=>!studio.rebuilding);
   assert.ok(await page.evaluate(t=>sounds.includes(t),tool),'real gesture emits '+tool);
   assert.ok(await page.evaluate(()=>Array.from(studio.model.positions).every(Number.isFinite)));
  }
  // Pop a real generated bubble, not a click on empty clay.
  await page.locator('[data-tool=pop]').click();await page.locator('#slimeCanvas').scrollIntoViewIfNeeded();
  const bubble=await page.evaluate(()=>{const b=studio.bubbles[0],p=b.mesh.getWorldPosition(studio.mesh.position.clone()).project(studio.camera),r=studio.canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
  await page.mouse.click(bubble.x,bubble.y);assert.ok(await page.evaluate(()=>sounds.includes('pop')));
  await page.locator('[data-sound]').first().click();
  assert.equal(await page.evaluate(()=>studio.audio.voices.size),0);
  assert.deepEqual(await page.locator('[data-sound]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed'))),['false','false']);
  const count=await page.evaluate(()=>sounds.length);
  await page.locator('[data-tool=pump]').first().click();const p=await center();await page.mouse.click(p.x,p.y);
  assert.equal(await page.evaluate(()=>sounds.length),count,'muted gestures do not play');
  await page.evaluate(()=>{studio.root.classList.add('slime-fs');studio.resize();});
  await page.locator('[data-fs-drop=material] .fs-trigger').click();
  assert.ok(await page.locator('[data-fs-drop=material] [data-option=cotton]').isVisible());
  await page.locator('[data-fs-drop=material] [data-option=cotton]').click();
  await page.screenshot({path:join(out,`fullscreen-${viewport.width}.png`)});
  await page.evaluate(()=>studio.destroy());
  assert.equal(await page.evaluate(()=>studio.audio.voices.size),0);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log(JSON.stringify({passed:true,screenshots:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
