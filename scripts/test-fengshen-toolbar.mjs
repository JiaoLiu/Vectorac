import test from 'node:test'
import assert from 'node:assert/strict'
import {renderToolbar,renderMenu} from '../.private/fengshen/toolbar.mjs'
const state={lobby:false,setup:null,paused:false,voice:true,music:true,fullscreen:false}
test('battle toolbar collapses to a single menu entry; menu holds every tool',()=>{
 const html=renderToolbar(state);assert.equal((html.match(/<button /g)||[]).length,1);assert.ok(html.includes('data-action="menu"'));assert.ok(html.includes('aria-label="菜单"'))
 const menu=renderMenu({inGame:true,paused:false,voice:true,music:true,hints:true,pace:'标准',fullscreen:false})
 for(const action of ['rules','gallery','report','pause','new','voice','music','help','pace','screen'])assert.ok(menu.includes(`data-action="${action}"`))
 for(const label of ['规则','图鉴','战报','暂停对局','新局','报牌及音效','背景音乐','教学提示','出牌节奏','全屏横屏'])assert.ok(menu.includes(`<span>${label}</span>`))
 assert.ok(menu.includes('<small>开</small>'));assert.ok(menu.includes('<small>标准</small>'))
})
test('menu item states reflect voice/music/pause/fullscreen toggles',()=>{
 const menu=renderMenu({inGame:true,paused:true,voice:false,music:false,hints:false,pace:'快',fullscreen:true})
 for(const icon of ['muted','quietMusic','play','shrink'])assert.ok(menu.includes(`data-icon="${icon}"`))
 assert.ok(menu.includes('<small>关</small>'));assert.ok(menu.includes('<small>快</small>'));assert.ok(menu.includes('继续对局'))
})
test('lobby and drafting toolbar retain only the appropriate actions',()=>{
 const home=renderToolbar({...state,lobby:true});assert.equal((home.match(/<button /g)||[]).length,5);assert.equal(home.includes('data-action="new"'),false)
 const draft=renderToolbar({...state,setup:{}});assert.ok(draft.includes('data-icon="back"'));assert.ok(draft.includes('aria-label="返回"'));assert.equal(draft.includes('data-action="pause"'),false)
})
