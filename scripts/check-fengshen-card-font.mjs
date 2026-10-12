import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {CARDS_BY_TYPE} from '../.private/fengshen/theme.mjs'

// This cmap was read from the generated WOFF2 by FontTools. Bind it to the
// actual binary, so swapping the font cannot leave a stale passing manifest.
export function auditCardFont(cards,manifest,bytes,css){
 const errors=[]
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)errors.push('Font bytes changed: regenerate coverage.json with update-fengshen-font.py')
 if(!css.includes(`url('${manifest.file}')`))errors.push('Runtime @font-face URL does not match the audited font')
 const cmap=new Set(manifest.codepoints)
 for(const [type,card] of Object.entries(cards)){
  const missing=[...new Set([...card.name].filter(c=>!cmap.has(c.codePointAt(0))))]
  if(missing.length)errors.push(`${type} (${card.name}): missing glyphs ${missing.join('')}; rebuild font before adding the card`)
 }
 return errors
}
export async function checkCardFont(){
 const root=new URL('../.private/fengshen/',import.meta.url)
 const manifest=JSON.parse(await readFile(new URL('assets/fonts/coverage.json',root),'utf8'))
 const issues=auditCardFont(CARDS_BY_TYPE,manifest,await readFile(new URL(manifest.file,root)),await readFile(new URL('style.css',root),'utf8'))
 if(issues.length)throw Error('卡牌字体发布检查失败：\n'+issues.join('\n'))
 console.log(`PASS card font: all ${Object.keys(CARDS_BY_TYPE).length} card titles covered; binary checksum and runtime URL verified`)
}
if(process.argv[1]===fileURLToPath(import.meta.url))await checkCardFont()
