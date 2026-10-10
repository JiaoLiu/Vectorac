import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile}from 'node:fs/promises'
import {createHash}from 'node:crypto'
import {PLAYABLE_HEROES}from '../.private/fengshen/theme.mjs'
import {catalog}from '../.private/fengshen/engine.mjs'
test('every game-list thumbnail has a cache key matching its actual image contents',async()=>{
 const page=await readFile(new URL('../blogs/other/games.md',import.meta.url),'utf8'),images=[...page.matchAll(/src="(\/img\/games\/thumbs\/[^"?]+)(\?v=[a-f0-9]{12})?"/g)];assert.ok(images.length>=14)
 for(const [_,path,version]of images){const bytes=await readFile(new URL('../.vuepress/public'+path,import.meta.url));assert.equal(bytes.toString('ascii',0,4),'RIFF',path);assert.equal(bytes.toString('ascii',8,12),'WEBP',path);assert.equal(version,'?v='+createHash('sha256').update(bytes).digest('hex').slice(0,12),path+' stale cover cache key')}
})
test('Gods game-list description agrees with the shipped hero and deck counts',async()=>{
 const page=await readFile(new URL('../blogs/other/games.md',import.meta.url),'utf8'),card=page.match(/<a href="\/games\/fengshen\/"[\s\S]*?<\/a>/)?.[0];assert.ok(card);assert.ok(card.includes(`${PLAYABLE_HEROES.length} 位神话角色`));assert.ok(card.includes(`${catalog.makeDeck().length} 张牌`))
})
