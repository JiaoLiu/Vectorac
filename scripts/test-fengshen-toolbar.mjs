import test from 'node:test'
import assert from 'node:assert/strict'
import {renderToolbar} from '../.private/fengshen/toolbar.mjs'
const state={lobby:false,setup:null,paused:false,voice:true,music:true,fullscreen:false}
test('all eight battle tools use accessible vectors, not visible text glyphs',()=>{
 const html=renderToolbar(state);assert.equal((html.match(/<button /g)||[]).length,8);assert.equal((html.match(/<svg /g)||[]).length,8);assert.equal((html.match(/aria-hidden="true"/g)||[]).length,8)
 for(const action of ['rules','gallery','report','pause','new','voice','music','screen'])assert.ok(html.includes(`data-action="${action}"`))
 assert.equal(html.includes('>声<'),false);assert.equal(html.includes('>乐<'),false);assert.equal(html.includes('⛶'),false)
 for(const label of ['规则','图鉴','战报','暂停','新局','报牌及音效开','背景音乐开','全屏横屏'])assert.ok(html.includes(`aria-label="${label}"`))
})
test('mute, pause and fullscreen states change icon, accessible label and pressed state',()=>{
 const html=renderToolbar({...state,paused:true,voice:false,music:false,fullscreen:true})
 for(const icon of ['muted','quietMusic','play','shrink'])assert.ok(html.includes(`data-icon="${icon}"`))
 assert.ok(html.includes('aria-label="报牌及音效关" aria-pressed="false"'));assert.ok(html.includes('aria-label="背景音乐关" aria-pressed="false"'));assert.ok(html.includes('aria-label="继续" aria-pressed="true"'));assert.ok(html.includes('aria-label="退出全屏" aria-pressed="true"'))
})
test('lobby and drafting toolbar retain only the appropriate actions',()=>{
 const home=renderToolbar({...state,lobby:true});assert.equal((home.match(/<button /g)||[]).length,5);assert.equal(home.includes('data-action="new"'),false)
 const draft=renderToolbar({...state,setup:{}});assert.ok(draft.includes('data-icon="back"'));assert.ok(draft.includes('aria-label="返回"'));assert.equal(draft.includes('data-action="pause"'),false)
})
