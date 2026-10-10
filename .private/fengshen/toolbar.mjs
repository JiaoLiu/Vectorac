import {esc} from './presentation.mjs'
const paths={
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5.8-1.5 1.5-1.5 2.5M12 17h.01"/>',
 rules:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/><path d="M6 8h3M6 12h3M15 8h3M15 12h3"/>',
 gallery:'<rect x="7" y="5" width="13" height="16" rx="2"/><path d="m5 18-3-13a2 2 0 0 1 1.5-2.5L13 1"/><path d="m13.5 9-3 4 3 4 3-4-3-4Z"/>',
 report:'<path d="M7 3h12v16H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 16v-5H4M10 7h6M10 11h6M10 15h3"/>',
 pause:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
 play:'<path d="m8 4 12 8-12 8V4Z"/>',
 new:'<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
 back:'<path d="m10 5-7 7 7 7M3 12h18"/>',
 voice:'<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
 muted:'<path d="m11 4-6 5H2v6h3l6 5V4ZM16 9l6 6M22 9l-6 6"/>',
 music:'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
 quietMusic:'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/><path class="fs-icon-slash" d="m3 2 19 20"/>',
 screen:'<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>',
 shrink:'<path d="M3 9h6V3M15 3v6h6M9 21v-6H3M21 15h-6v6"/>',
 bot:'<rect x="4" y="9" width="16" height="10" rx="2.5"/><path d="M12 9V5.5M9 13h.01M15 13h.01M9.5 16h5"/><circle cx="12" cy="4" r="1.2"/>'
}
export {paths}
export function toolButton(action,icon,label,pressed){return `<button type="button" class="fs-tool ${pressed===true?'is-on':pressed===false?'is-off':''}" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}"${pressed==null?'':` aria-pressed="${pressed}"`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-icon="${icon}">${paths[icon]}</svg></button>`}
// 牌桌只留一个「菜单」入口（英雄杀式收纳）；大厅/选将保留完整工具栏。
// 对局始终默认全屏横屏（开局自动 requestFullscreen），不再提供全屏开关。
export function renderToolbar({lobby,setup,paused,voice,music}){
 if(!lobby&&!setup)return `<nav aria-label="牌桌工具">${toolButton('menu','menu','菜单')}</nav>`
 return `<nav aria-label="牌桌工具">${toolButton('rules','rules','规则')}${toolButton('gallery','gallery','图鉴')}${!lobby&&!setup?toolButton('report','report','战报')+toolButton('pause',paused?'play':'pause',paused?'继续':'暂停',paused)+toolButton('new','new','新局'):setup?toolButton('new','back','返回'):''}${toolButton('voice',voice?'voice':'muted','报牌及音效'+(voice?'开':'关'),voice)}${toolButton('music',music?'music':'quietMusic','背景音乐'+(music?'开':'关'),music)}</nav>`
}
// 牌桌菜单面板内容：不常用功能全部收纳，开关项右侧显示当前状态。
export function renderMenu({inGame,paused,voice,music,hints,pace,auto}){
 const item=(action,icon,label,state)=>`<button data-action="${action}" class="fs-menu-item ${state===true?'is-on':state===false?'is-off':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="${icon}">${paths[icon]}</svg><span>${label}</span>${state==null?'':`<small>${state===true?'开':state===false?'关':state}</small>`}</button>`
 return `<div class="fs-menu-grid">${item('rules','rules','规则')+item('gallery','gallery','图鉴')+(inGame?item('report','report','战报')+item('pause',paused?'play':'pause',paused?'继续对局':'暂停对局')+item('new','new','新局')+item('auto','bot','AI 托管',auto):'')+item('voice',voice?'voice':'muted','报牌及音效',voice)+item('music',music?'music':'quietMusic','背景音乐',music)+item('help','help','教学提示',hints)+item('pace','clock','出牌节奏',pace)}</div>`
}
