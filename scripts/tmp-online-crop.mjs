import {openBrowser} from './browser-cdp.mjs'
const b=await openBrowser({name:'online-crop',baseUrl:'http://127.0.0.1:4178',route:'/'})
const wait=ms=>new Promise(r=>setTimeout(r,ms))
try{
  await b.viewport(1280,800)
  await b.navigate('/')
  await wait(600)
  await b.evaluate(`(()=>{const t=document.querySelector('.qa-tools');const s=t.querySelector('select');s.value='layout-eight';t.querySelector('[data-qa-load]').click();return true})()`)
  await wait(900)
  await b.evaluate(`(()=>{
    const ui=window.__fengshenUI,root=ui.root,n=ui.state.players.length
    const names=['我本人','测试','鸡你太美','长名字的玩家昵称','阿波罗之光','赵云','阿','敌将']
    for(let i=0;i<n;i++){
      const a=i===0?root.querySelector('.fs-own-hero>button'):root.querySelector('[data-player="'+i+'"] .fs-player-main')
      if(!a)continue
      const el=document.createElement('small');el.className='fs-online-name'
      el.textContent=(i===2||i===5)?'🤖':(names[i]||('玩家'+i));a.append(el)
    }
    return true})()`)
  const shot=await b.send('Page.captureScreenshot',{format:'png',clip:{x:440,y:0,width:130,height:80,scale:4}})
  console.log('cropA written')
  const fs=await import('node:fs')
  fs.writeFileSync('/tmp/cropA.png',Buffer.from(shot.data,'base64'))
  const s2=await b.send('Page.captureScreenshot',{format:'png',clip:{x:0,y:615,width:135,height:185,scale:4}})
  fs.writeFileSync('/tmp/cropB.png',Buffer.from(s2.data,'base64'))
  const s3=await b.send('Page.captureScreenshot',{format:'png',clip:{x:0,y:432,width:130,height:190,scale:4}})
  fs.writeFileSync('/tmp/cropC.png',Buffer.from(s3.data,'base64'))
  console.log('done')
}finally{await b.close()}