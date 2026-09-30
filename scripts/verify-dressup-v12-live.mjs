import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const base=process.env.DRESSUP_BASE||'https://vectorac.com',root='/img/games/dressup/layers/v12/'
const sum=d=>createHash('sha256').update(d).digest('hex')
async function walk(dir){const files=[];for(const entry of await readdir('.vuepress/public'+dir,{withFileTypes:true})){const path=dir+entry.name;if(entry.isDirectory())files.push(...await walk(path+'/'));else files.push(path)}return files}
const paths=[...await walk(root),'/img/games/dressup/layers/v7/hair-2-restored.webp','/img/games/dressup/layers/v11/catalog/hat-11.webp']
for(const path of paths){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.equal(sum(Buffer.from(await r.arrayBuffer())),sum(await readFile('.vuepress/public'+path)),`live bytes differ: ${path}`)}
const r=await fetch(base+'/blogs/other/flower_wardrobe.html');assert.equal(r.status,200);assert.match(await r.text(),/骑士靴/)
console.log(JSON.stringify({passed:true,liveAssets:paths.length,base}))
