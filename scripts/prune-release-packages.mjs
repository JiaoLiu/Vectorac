import {readdir,stat,unlink} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'

const projects=new Set(['mahjong-service','shorturl-service','usermgr-service'])

export async function pruneReleasePackages(directory,project){
  if(!projects.has(project))throw new Error('Unknown release package project')
  const pattern=new RegExp(`^${project}-(?:linux-x64-)?[a-zA-Z0-9-]+\\.tar\\.gz$`)
  const entries=await readdir(directory,{withFileTypes:true})
  const packages=await Promise.all(entries.filter(e=>e.isFile()&&pattern.test(e.name)).map(async e=>({
    name:e.name,mtime:(await stat(join(directory,e.name))).mtimeMs
  })))
  packages.sort((a,b)=>b.mtime-a.mtime||b.name.localeCompare(a.name))
  const removed=[]
  for(const {name} of packages.slice(3)){await unlink(join(directory,name));removed.push(name)}
  return {project,retained:packages.slice(0,3).map(p=>p.name),removed}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [directory,project]=process.argv.slice(2)
  if(!directory||!project)throw new Error('Usage: node scripts/prune-release-packages.mjs <directory> <project>')
  console.log(JSON.stringify(await pruneReleasePackages(resolve(directory),project)))
}
