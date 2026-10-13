// 众神斗法内置意见反馈弹窗。
// 站点其他棋牌（麻将/五子棋/象棋/小丑牌）由 VuePress 的 game-feedback 插件提供同款 Valine 弹窗；
// 众神斗法是独立静态页，不经过 VuePress，故在此内置等价实现：同一份表单、同一个留言数据源
// （path 统一为 /docs/about.html），反馈集中收录到「联系我们 → 留言」。
import './feedback.css'
import config from '../../valine-config.js'

const GAME='众神斗法'
const PATH='/docs/about.html'
const TITLE=`【${GAME}游戏反馈】`

export class FeedbackModal{
  constructor({game=GAME,path=PATH}={}){
    this.game=game;this.path=path;this.title=`【${game}游戏反馈】`
    this.modal=null;this.valine=null;this.bodyOverflow='';this.priorFocus=null
    this.observer=null
    this.onKey=e=>this.isolateKey(e)
    this.onFullscreen=()=>this.moveToDisplayRoot()
  }
  // 弹窗挂到全屏元素上，否则真机全屏时会被挡在游戏画面之外。
  displayRoot(){return document.fullscreenElement||document.webkitFullscreenElement||document.body}
  moveToDisplayRoot(){if(!this.modal)return;const root=this.modal.hidden?document.body:this.displayRoot();if(this.modal.parentNode!==root)root.appendChild(this.modal)}
  editor(){return this.modal?.querySelector('.veditor')||null}
  ensureUi(){
    if(this.modal)return
    const dialog=document.createElement('div')
    dialog.id='fs-feedback-modal';dialog.hidden=true
    dialog.innerHTML='<div class="gf-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="fs-feedback-title"><div class="gf-head"><div><p class="gf-eyebrow">GAME FEEDBACK</p><h2 class="gf-title" id="fs-feedback-title">'+this.game+' · 意见反馈</h2></div><button class="gf-close" type="button" data-gf-close aria-label="关闭反馈窗口">×</button></div><p class="gf-copy">告诉我们你的建议，或描述遇到的问题。标题已根据当前游戏自动填写。</p><p class="gf-archive">提交后会统一同步到「联系我们 → 留言」，方便集中查看。</p><div class="gf-valine" id="fs-feedback-valine"></div><p class="gf-error" role="status" aria-live="polite"></p></div>'
    dialog.addEventListener('click',e=>{if(e.target===dialog||e.target.closest('[data-gf-close]'))this.close()})
    dialog.addEventListener('click',e=>{
      const submit=e.target.closest('.vsubmit');if(!submit)return
      const field=this.editor(),value=field?String(field.value||''):''
      const existingTitle=value.match(/^【[^】]+游戏反馈】/),message=existingTitle?value.slice(existingTitle[0].length):value
      const error=dialog.querySelector('.gf-error')
      if(!message.trim()){e.preventDefault();e.stopImmediatePropagation();if(error)error.textContent='请先填写反馈内容，再提交。';if(field)field.focus();return}
      if(field&&value.indexOf(this.title)!==0){field.value=this.title+'\n\n'+message;if(field.dataset)field.dataset.gfPrefill=this.title+'\n\n';field.dispatchEvent(new Event('input',{bubbles:true}))}
      if(error)error.textContent=''
    },true)
    dialog.addEventListener('input',e=>{if(e.target.matches('.veditor')){const error=dialog.querySelector('.gf-error');if(error)error.textContent=''}})
    ;['keydown','keyup','keypress'].forEach(type=>{
      dialog.addEventListener(type,e=>{
        if(type==='keydown'&&e.key==='Escape'){e.preventDefault();this.close()}
        else if(type==='keydown'&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&e.target.matches('.veditor')){e.preventDefault();dialog.querySelector('.vsubmit')?.click()}
        e.stopPropagation()
      })
    })
    this.modal=dialog
  }
  // 动态加载 Valine 运行时（约 130KB），只在首次打开反馈时拉取，不拖慢游戏首屏。
  async ensureValine(){
    const host=this.modal.querySelector('#fs-feedback-valine')
    if(this.valine){this.prefill();return}
    try{
      const {default:Valine}=await import('valine')
      this.valine=new Valine({el:host,appId:config.appId,appKey:config.appKey,path:this.path,lang:'zh-CN',meta:['nick'],requiredFields:[],placeholder:'请描述你的建议，或写下 Bug 的复现步骤和预期结果…',pageSize:10,visitor:false,recordIP:false,notify:false,verify:false,avatar:'mp'})
      this.watchEditor(host)
      this.prefill()
    }catch(error){
      const status=this.modal.querySelector('.gf-error')
      if(status)status.textContent='反馈表单暂时无法加载，请检查网络后重试。'
      console.error('[众神斗法反馈] Valine 加载失败',error)
    }
  }
  watchEditor(host){
    if(!host||this.observer||typeof MutationObserver==='undefined')return
    this.observer=new MutationObserver(()=>{if(this.prefill()){this.observer.disconnect();this.observer=null}})
    this.observer.observe(host,{childList:true,subtree:true})
  }
  // 标题预填：延迟初始化与路由变化都不能覆盖用户已输入的内容。
  prefill(){
    const field=this.editor();if(!field)return false
    const prefix=this.title+'\n\n',previous=field.dataset&&field.dataset.gfPrefill,existing=field.value||''
    if(existing&&existing!==previous)return true
    if(existing!==prefix){field.value=prefix;if(field.dataset)field.dataset.gfPrefill=prefix;field.dispatchEvent(new Event('input',{bubbles:true}));if(typeof field.setSelectionRange==='function')field.setSelectionRange(field.value.length,field.value.length)}
    else if(field.dataset)field.dataset.gfPrefill=prefix
    return true
  }
  open(){
    this.ensureUi()
    this.priorFocus=document.activeElement
    this.bodyOverflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    this.modal.hidden=false
    this.moveToDisplayRoot()
    this.ensureValine()
    const field=this.editor()
    ;(field||this.modal.querySelector('.gf-close')||this.modal.querySelector('.gf-dialog'))?.focus()
    window.setTimeout(()=>{if(!this.modal||this.modal.hidden)return;this.prefill();this.editor()?.focus()},50)
    window.addEventListener('keydown',this.onKey,true)
    window.addEventListener('keyup',this.onKey,true)
    window.addEventListener('keypress',this.onKey,true)
    document.addEventListener('fullscreenchange',this.onFullscreen)
    document.addEventListener('webkitfullscreenchange',this.onFullscreen)
  }
  close(){
    if(!this.modal||this.modal.hidden)return
    this.modal.hidden=true
    document.body.style.overflow=this.bodyOverflow
    this.moveToDisplayRoot()
    const field=this.editor()
    if(field){field.value='';if(field.dataset)delete field.dataset.gfPrefill;field.dispatchEvent(new Event('input',{bubbles:true}))}
    if(this.priorFocus&&this.priorFocus.isConnected)this.priorFocus.focus()
    window.removeEventListener('keydown',this.onKey,true)
    window.removeEventListener('keyup',this.onKey,true)
    window.removeEventListener('keypress',this.onKey,true)
    document.removeEventListener('fullscreenchange',this.onFullscreen)
    document.removeEventListener('webkitfullscreenchange',this.onFullscreen)
  }
  // 弹窗打开时拦截落在游戏上的按键，避免 Esc/空格等触发牌桌操作。
  isolateKey(event){
    const dialog=this.modal
    if(!dialog||dialog.hidden||dialog.contains(event.target))return
    if(event.type==='keydown'&&event.key==='Escape')this.close()
    else if(event.type==='keydown'){event.preventDefault();(this.editor()||dialog.querySelector('.gf-close')||dialog.querySelector('.gf-dialog'))?.focus()}
    else event.preventDefault()
    event.stopImmediatePropagation()
  }
  get open_(){return !!(this.modal&&!this.modal.hidden)}
}
