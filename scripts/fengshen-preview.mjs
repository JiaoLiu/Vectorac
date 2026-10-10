// This preview is deliberately outside VuePress/public. Bind only to loopback.
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {mkdir,copyFile,cp,readFile,stat,writeFile} from 'node:fs/promises'
import {resolve,extname} from 'node:path'
const qa=process.argv.includes('--qa'),release=process.argv.includes('--release'),source=resolve('.private/fengshen'),output=release?resolve('public/games/fengshen'):resolve('.private/fengshen',qa?'qa-dist':'dist')
if(qa&&release)throw new Error('QA fixtures must never be published')
await mkdir(output,{recursive:true})
const result=await build({entryPoints:[resolve(source,qa?'qa.mjs':'app.js')],...(release?{outdir:output,entryNames:'app-[hash]',metafile:true}:{outfile:resolve(output,qa?'qa.js':'app.js')}),bundle:true,format:'esm',target:['safari15','chrome100'],external:['assets/*'],minify:true,define:{__FENGSHEN_RELEASE__:JSON.stringify(release)}})
if(release){
 const entry=Object.keys(result.metafile.outputs).find(p=>p.endsWith('.js')),css=result.metafile.outputs[entry].cssBundle
 const html=(await readFile(resolve(source,'index.html'),'utf8')).replace('src="app.js"',`src="${entry.split('/').pop()}"`).replace('href="app.css"',`href="${css.split('/').pop()}"`)
 await writeFile(resolve(output,'index.html'),html)
 // Runtime-only allowlist: no QA pages, prompts, manifests, docs or secrets.
 for(const dir of ['heroes','cards','audio/male','audio/female'])await cp(resolve(source,'assets',dir),resolve(output,'assets',dir),{recursive:true,filter:p=>!p.endsWith('.json')})
 await mkdir(resolve(output,'assets/audio/sfx'),{recursive:true})
 for(const name of ['damage.wav','heavenly-duel.mp3'])await copyFile(resolve(source,'assets/audio/sfx',name),resolve(output,'assets/audio/sfx',name))
 await copyFile(resolve(source,'assets/heavenly-arena.jpg'),resolve(output,'assets/heavenly-arena.jpg'))
}else{
 await copyFile(resolve(source,qa?'qa.html':'index.html'),resolve(output,'index.html'))
 await cp(resolve(source,'assets'),resolve(output,'assets'),{recursive:true})
}
console.log(release?'Website game built:':'Internal preview built:',output)
if(process.argv.includes('--build-only'))process.exit(0)
const port=Number(process.env.FENGSHEN_PORT||4178),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.json':'application/json','.mp3':'audio/mpeg','.wav':'audio/wav'}
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(output,'.'+(path.endsWith('/')?path+'index.html':path))
  res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('Cache-Control','no-store')
  if(!file.startsWith(output+'/')){res.writeHead(403).end();return}
  try{if(!(await stat(file)).isFile())throw new Error('not a file');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file))}catch{res.writeHead(404).end()}
})
server.listen(port,'127.0.0.1',()=>console.log(`封神杀 · 内部原型 http://127.0.0.1:${port}/`))
