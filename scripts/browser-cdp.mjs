// Isolated Chrome/CDP harness for static VuePress game acceptance tests.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve, extname } from 'node:path'
import { tmpdir } from 'node:os'
const require=createRequire(import.meta.url),WebSocket=require('ws')
const activeBrowsers=new Set()
let startingBrowsers=0
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]])process.once(signal,async()=>{
  await Promise.allSettled([...activeBrowsers].map(close=>close()))
  process.exit(code)
})
export async function openBrowser({name='game',baseUrl=null,route='/',extraArgs=[]}={}) {
  if(activeBrowsers.size+startingBrowsers>=4)throw new Error('Browser test concurrency limit (4) reached; close existing clients before retrying')
  startingBrowsers++
  const output=await mkdtemp(join(process.env.VECTORAC_BROWSER_OUTPUT_DIR||tmpdir(),`${name}-browser-`)).catch(error=>{startingBrowsers--;throw error}),root=resolve('build/site')
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg'}
  const server=createServer(async(req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname))
    if(!file.startsWith(root+'/')){res.writeHead(403).end();return}
    try{res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file))}catch{res.writeHead(404).end()}
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)}).catch(async error=>{
    startingBrowsers--
    await rm(output,{recursive:true,force:true})
    throw error
  })
  const origin=(baseUrl||`http://127.0.0.1:${server.address().port}`).replace(/\/$/,'')
  const chrome=spawn(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${join(output,'profile')}`,'--no-first-run','--no-default-browser-check',...extraArgs,'about:blank'],{detached:process.platform!=='win32',stdio:['ignore','ignore','pipe']})
  let socket,session,serial=0
  const pending=new Map(),errors=[]
  let closing
  const exited=new Promise(resolve=>{chrome.once('exit',resolve);chrome.once('error',resolve)})
  const exitedWithin=async ms=>{
    let timer
    try{return await Promise.race([exited.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ms)})])}
    finally{clearTimeout(timer)}
  }
  const stopOwnedGroup=signal=>{
    try{if(process.platform!=='win32'&&chrome.pid)process.kill(-chrome.pid,signal);else chrome.kill(signal)}
    catch(error){if(error.code!=='ESRCH')throw error}
  }
  const close=()=>closing||=(async()=>{
    try{
      if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({id:++serial,method:'Browser.close'}))
      if(!await exitedWithin(2000)){
        stopOwnedGroup('SIGTERM')
        if(!await exitedWithin(2000)){stopOwnedGroup('SIGKILL');if(!await exitedWithin(2000))throw new Error('Owned Chrome did not exit')}
      }
    }finally{
      // Close only this launch's process group, including any leftover helpers.
      stopOwnedGroup('SIGTERM')
      if(socket)socket.terminate()
      for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('Browser closed'))}
      pending.clear()
      server.closeAllConnections()
      await new Promise(resolve=>server.close(resolve))
      await rm(join(output,'profile'),{recursive:true,force:true})
      activeBrowsers.delete(close)
    }
  })()
  activeBrowsers.add(close)
  startingBrowsers--
  try {
    const endpoint=await new Promise((resolve,reject)=>{
      let stderr='';const timer=setTimeout(()=>reject(new Error('Chrome startup timeout')),15000)
      chrome.stderr.on('data',data=>{stderr+=data;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1])}})
      chrome.once('error',error=>{clearTimeout(timer);reject(error)});chrome.once('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited '+code))})
    })
    socket=new WebSocket(endpoint)
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
    const send=(method,params={},target=session)=>new Promise((resolve,reject)=>{
      const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method))},20000)
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}))
    })
    socket.on('message',raw=>{
      const message=JSON.parse(raw)
      if(message.id){const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(new Error(JSON.stringify(message.error))):task.resolve(message.result)}
      else if(message.method==='Runtime.exceptionThrown'){const details=message.params.exceptionDetails;errors.push(details.exception?.description||details.text)}
      else if(message.method==='Fetch.requestPaused'){
        const allow=message.params.request.url.startsWith(origin)||message.params.request.url.startsWith('data:')
        send(allow?'Fetch.continueRequest':'Fetch.failRequest',{requestId:message.params.requestId,...(allow?{}:{errorReason:'BlockedByClient'})},message.sessionId).catch(e=>errors.push(e.message))
      }
    })
    const {targetId}=await send('Target.createTarget',{url:'about:blank'},null)
    ;({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null))
    await send('Runtime.enable');await send('Page.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]})
    const evaluate=async expression=>{
      const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
      if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    const waitFor=async(expression,timeout=15000)=>{
      const started=Date.now()
      while(Date.now()-started<timeout){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50))}
      throw new Error('Timeout waiting for '+expression)
    }
    const navigate=async(path=route)=>{await send('Page.navigate',{url:origin+path});return waitFor('document.readyState === "complete"')}
    const viewport=async(width,height)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000});await send('Emulation.setTouchEmulationEnabled',{enabled:true})}
    const tap=async(selector)=>{
      const point=await evaluate(`(async()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing '+${JSON.stringify(selector)});if(el.disabled)throw new Error('Disabled '+${JSON.stringify(selector)});el.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(r=>setTimeout(r,30));const rect=el.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`)
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:1,radiusY:1,force:1}]})
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
      await new Promise(resolve=>setTimeout(resolve,35))
    }
    const screenshot=async name=>{const result=await send('Page.captureScreenshot',{format:'png'}),file=join(output,name+'.png');await writeFile(file,Buffer.from(result.data,'base64'));return file}
    return {origin,output,errors,send,evaluate,waitFor,navigate,viewport,tap,screenshot,close}
  }catch(error){await close();throw error}
}
