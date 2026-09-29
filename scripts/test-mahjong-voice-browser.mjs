// Real WebKit audio decoding + FIFO playback, using local generated WAVs.
// No production room is joined, no microphone permission or messages sent.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{build}=require('esbuild')
const {webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const root=resolve(import.meta.dirname,'..'),out=await mkdtemp(join(tmpdir(),'mahjong-voice-'))
const md=await readFile(join(root,'blogs/other/mahjong_game.md'),'utf8')
const template=md.slice(md.indexOf('<div id="scmjGame"'),md.indexOf('<div class="scmj-intro">'))
const css=md.match(/<style>([\s\S]*?)<\/style>/)[1]
const built=await build({stdin:{contents:"export {default as UI} from './.vuepress/components/mahjong/ui.js'",resolveDir:root},bundle:true,format:'iife',globalName:'VoiceTest',write:false})
const server=createServer(async(req,res)=>{
 if(req.url==='/test.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text);return}
 if(/^\/mahjong\/tiles\/[mps][1-9]\.png$/.test(req.url)){
  res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','no-store')
  res.end(await readFile(join(root,'.vuepress/public',req.url)));return
 }
 res.setHeader('Content-Type','text/html');res.end(`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>${template}<script src="/test.js"></script>`)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await webkit.launch({headless:true})
try{
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const page=await browser.newPage({viewport,hasTouch:true,isMobile:true}),errors=[],tileRequests=[]
  page.on('request',r=>{if(/\/mahjong\/tiles\/[mps][1-9]\.png$/.test(r.url()))tileRequests.push(r.url())})
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.evaluate(()=>{
   const ui=window.ui=new VoiceTest.UI(document.querySelector('#scmjGame'));ui.mount()
   ui.settings.music=false;ui.settings.sound=false;ui.settings.voice=true;ui.applySettingsToUi()
   ui.isOnline=true;ui.net={sendVoice:()=>true};ui.onlinePlayer={seatIndex:0}
   ui._els.modalSettings.hidden=false
   window.started=[];window.finished=[]
   const start=ui._startVoiceData.bind(ui),finish=ui._finishVoiceItem.bind(ui)
   ui._startVoiceData=(mime,data,bubble,job)=>{started.push(job.entry.data);return start(mime,data,bubble,job)}
   ui._finishVoiceItem=job=>{if(ui._voiceActive===job)finished.push(job.entry.data);return finish(job)}
   // Include a ten-second message: exercise game events throughout playback.
   window.clips=[350,450,550].map(freq=>{
    const n=freq===350?80000:8000,buf=new ArrayBuffer(44+n*2),v=new DataView(buf)
    const str=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)))
    str(0,'RIFF');v.setUint32(4,buf.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true)
    v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true)
    v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true)
    for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(Math.sin(i*freq*Math.PI*2/8000)*1500),true)
    return btoa(Array.from(new Uint8Array(buf),v=>String.fromCharCode(v)).join(''))
   })
   window.receive=i=>ui._onChatMsg({type:'VOICE_MSG',payload:{seatIndex:1,mime:'audio/wav',data:clips[i],duration:1}})
   document.querySelector('[data-scmj-set-voice]').addEventListener('click',()=>ui._ensureAudio())
  })
  await page.locator('[data-scmj-set-voice]').uncheck()
  await page.evaluate(()=>{receive(0);receive(1);receive(2)})
  assert.equal(await page.evaluate(()=>started.length),0)
  await page.locator('[data-scmj-set-voice]').check()
  await page.waitForFunction(()=>ui._voiceMsgPlaying&&ui._ac.state==='running')
  assert.equal(await page.evaluate(()=>ui.settings.sound),false,'sound-off does not mute player voice')
  await page.evaluate(()=>{ui.settings.sound=true;for(const key of ['wan1','peng','gang','hu','phrase-0'])ui.speak(key,'test')})
  assert.equal(await page.evaluate(()=>ui._voiceNow),null,'announcements yield')
  assert.equal(await page.evaluate(()=>ui._master.gain.value),0)
  await page.evaluate(()=>{
   window.gameTicks=0;window.mixFailures=0
   window.gameTimer=setInterval(()=>{
    if(!ui._voiceActive)return
    gameTicks++
    for(const type of ['discard','draw','peng','gang','hu'])ui.sound(type)
    ui.speak('wan1','一万');ui._note(990);ui._duckBgm(gameTicks%2===0)
    if(ui._master.gain.value!==0||ui._voiceNow)mixFailures++
   },100)
  })
  await page.waitForFunction(()=>finished.length===3&&!ui._voiceActive)
  await page.evaluate(()=>clearInterval(gameTimer))
  assert.ok(await page.evaluate(()=>gameTicks>=90),'long message exercised throughout game actions')
  assert.equal(await page.evaluate(()=>mixFailures),0)
  assert.deepEqual(await page.evaluate(()=>started.map(v=>clips.indexOf(v))),[0,1,2])
  assert.deepEqual(await page.evaluate(()=>finished.map(v=>clips.indexOf(v))),[0,1,2])
  // Mid-play recording pause, new messages arrive, release resumes queue.
  await page.evaluate(()=>{started.length=0;finished.length=0;receive(0)})
  await page.waitForFunction(()=>!!ui._voiceMsgPlaying)
  await page.evaluate(()=>{ui._recStarting=true;ui._pauseVoiceQueue();receive(1);receive(2)})
  await page.waitForTimeout(1100)
  assert.equal(await page.evaluate(()=>started.length),1)
  await page.evaluate(()=>{ui._recStarting=false;ui._drainVoiceQueue()})
  await page.waitForFunction(()=>finished.length===3&&!ui._voiceActive)
  assert.deepEqual(await page.evaluate(()=>started.map(v=>clips.indexOf(v))),[0,0,1,2])
  assert.deepEqual(await page.evaluate(()=>finished.map(v=>clips.indexOf(v))),[0,1,2])
  // Separate persisted checkboxes, visible in phone portrait and landscape.
  await page.locator('[data-scmj-set-sound]').check()
  await page.locator('[data-scmj-set-voice]').uncheck()
  assert.equal(await page.locator('[data-scmj-set-sound]').isChecked(),true)
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('scmj-settings')).voice),false)
  await page.screenshot({path:join(out,`settings-${viewport.width}.png`)})
  // All 27 original PNGs preload once on entry; even with HTTP cache disabled,
  // offline redraws must synchronously use decoded originals, never fallback art.
  await page.evaluate(()=>ui._tileImagesReady)
  assert.equal(tileRequests.length,27);assert.equal(new Set(tileRequests).size,27)
  await page.context().setOffline(true)
  const handResult=await page.evaluate(()=>{
   ui.view={phase:'play',legal:[{type:'discard',tiles:[0,1,2,3,4,5,6,7,8]}],my:{hand:[0,0,1,1,2,2,3,3,4,4,5,5,6],drawnTile:7,void:null}}
   ui.renderHand(ui.view)
   const before=Array.from(ui._els.hand.children),images=before.map(b=>b.querySelector('canvas'))
   for(let i=0;i<50;i++){ui.selectedIdx=i%14;ui.renderHand(ui.view)}
   const stable=before.every((b,i)=>b===ui._els.hand.children[i]&&images[i]===b.querySelector('canvas'))
   ui.view.my.hand.shift();ui.view.my.drawnTile=8;ui.renderHand(ui.view)
   let originals=true
   for(let id=0;id<27;id++){
    const hand=ui.makeTile(id,'hand').querySelector('canvas')
    for(let i=0;i<20;i++){
     const discarded=ui.makeTile(id,'disc').querySelector('canvas')
     if(hand.dataset.ready!=='true'||discarded.dataset.ready!=='true'||hand.toDataURL()!==discarded.toDataURL())originals=false
    }
    const meld=ui.makeMeldGroup({tile:id,kind:'peng'})
    if(!Array.from(meld.querySelectorAll('canvas')).every(c=>c.dataset.ready==='true'&&c.toDataURL()===hand.toDataURL()))originals=false
   }
   return {stable,originals,count:ui._els.hand.children.length,correct:Array.from(ui._els.hand.children).every((b,i)=>b._tileIdx===i)}
  })
  assert.deepEqual(handResult,{stable:true,originals:true,count:13,correct:true})
  assert.equal(tileRequests.length,27,'offline redraws issue no new PNG requests')
  await page.evaluate(()=>ui.destroy());assert.deepEqual(errors,[]);await page.close()
 }
 console.log(JSON.stringify({passed:true,screenshots:out}))
}finally{await browser.close();await new Promise(r=>server.close(r))}
