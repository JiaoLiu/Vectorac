import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const base=process.env.DRESSUP_BASE||'https://vectorac.com',root='/img/games/dressup/layers/v13/'
const sum=d=>createHash('sha256').update(d).digest('hex')
const manifest=JSON.parse(await readFile('scripts/wardrobe-v13-art.json','utf8'))
const paths=[...(await readdir('.vuepress/public'+root)).map(f=>root+f),...Object.keys(manifest.protectedAssets)]
for(const path of paths){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.equal(sum(Buffer.from(await r.arrayBuffer())),sum(await readFile('.vuepress/public'+path)),`live bytes differ: ${path}`)}
const page=await fetch(base+'/blogs/other/flower_wardrobe.html');assert.equal(page.status,200);assert.match(await page.text(),/花间衣橱/)
console.log(JSON.stringify({passed:true,liveAssets:paths.length,base}))
