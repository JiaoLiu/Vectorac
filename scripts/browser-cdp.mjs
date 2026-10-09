// Isolated Chrome/CDP harness for static VuePress game acceptance tests.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { join, resolve, extname } from 'node:path'
import { tmpdir } from 'node:os'
const require=createRequire(import.meta.url),WebSocket=require('ws')
export async function openBrowser({name='game',baseUrl=null,route='/'}={}) {
  const output=await mkdtemp(join(tmpdir(),`${name}-browser-`)),root=resolve('public')
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg'}
  const server=createServer(async(req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname))
    if(!file.startsWith(root+'/')){res.writeHead(403).end();return}
    try{res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file))}catch{res.writeHead(404).end()}
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const origin=(baseUrl||`http://127.0.0.1:${server.address().port}`).replace(/\/$/,'')
  const chrome=spawn(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${join(output,'profile')}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:['ignore','ignore','pipe']})
  let socket,session,serial=0
  const pending=new Map(),errors=[]
  const close=async()=>{if(socket)socket.close();for(const task of pending.values())clearTimeout(task.timer);chrome.kill();await new Promise(resolve=>server.close(resolve))}
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
