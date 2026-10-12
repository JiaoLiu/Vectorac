import {openBrowser} from './browser-cdp.mjs'
const b=await openBrowser({name:'online-name',baseUrl:'http://127.0.0.1:4178',route:'/'})
const wait=ms=>new Promise(r=>setTimeout(r,ms))
try{
  const w=Number(process.argv[2])||1280,h=Number(process.argv[3])||800
  await b.viewport(w,h)
  await b.navigate('/')
  await wait(600)
  await b.evaluate(`(()=>{const t=document.querySelector('.qa-tools');const s=t.querySelector('select');s.value='layout-eight';t.querySelector('[data-qa-load]').click();return true})()`)
  await wait(900)
  // Mimic online.mjs afterRender(): append .fs-online-name to each seat anchor.
  const info=await b.evaluate(`(()=>{
    const ui=window.__fengshenUI,root=ui.root,n=ui.state.players.length
    const names=['我本人','测试','鸡你太美','长名字的玩家昵称','阿波罗之光','赵云','阿','敌将']
    const seats=[]
    for(let i=0;i<n;i++){
      const a=i===0?root.querySelector('.fs-own-hero>button'):root.querySelector('[data-player="'+i+'"] .fs-player-main')
      if(!a)continue
      const el=document.createElement('small');el.className='fs-online-name'
      const bot=i===2||i===5
      el.textContent=bot?'🤖':(names[i]||('玩家'+i));el.dataset.bot=bot?1:0
      a.append(el)
      const hero=a.querySelector('.fs-player-info>strong'),port=a.querySelector('.fs-portrait')
      const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom)}}
      const rn=el.getBoundingClientRect(),rh=hero&&hero.getBoundingClientRect(),rp=port&&port.getBoundingClientRect()
      const ov=(a,b)=>!a||!b?0:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))
      seats.push({seat:i,name:el.textContent,bot,cls:a.className.slice(0,40),nameBox:R(el),heroBox:R(hero),portBox:R(port),overlapHero:Math.round(ov(rn,rh)),overlapPortrait:Math.round(ov(rn,rp))})
    }
    return JSON.stringify({n,seats})})()`)
  console.log(info)
  console.log('shot:',await b.screenshot('online-'+w+'x'+h))
}finally{await b.close()}