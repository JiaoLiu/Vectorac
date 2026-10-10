// Compose the fengshen list-cover: hero cards duel over the heavenly arena.
// Stages .private/fengshen/cover.html into the preview dist (scripts/fengshen-preview.mjs
// must be running on 4178), captures a 1200x675 webp straight into the games thumbnail.
import {copyFile,rm,writeFile} from 'node:fs/promises'
import {openBrowser} from './browser-cdp.mjs'
await copyFile('.private/fengshen/cover.html','.private/fengshen/dist/cover.html')
const browser=await openBrowser({name:'fengshen-cover',baseUrl:'http://127.0.0.1:4178',route:'/cover.html'})
await browser.viewport(1200,675)
await browser.navigate()
await browser.waitFor('document.fonts.status==="loaded"')
await browser.waitFor('[...document.images].every(i=>i.complete&&i.naturalWidth>0)')
await new Promise(r=>setTimeout(r,120))
const shot=await browser.send('Page.captureScreenshot',{format:'webp',quality:84})
const target='.vuepress/public/img/games/thumbs/fengshen.webp'
await writeFile(target,Buffer.from(shot.data,'base64'))
await browser.close()
await rm('.private/fengshen/dist/cover.html')
console.log('wrote',target)
process.exit(0)
