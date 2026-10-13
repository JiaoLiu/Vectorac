import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,utimes,readdir,rm,mkdir,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pruneReleasePackages} from './prune-release-packages.mjs'

test('retains three newest own archives while protecting other projects, data, directories and symlinks',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vectorac-package-retention-'))
  try{
    for(let i=1;i<=5;i++){
      const file=join(dir,`mahjong-service-20261013-100${i}.tar.gz`)
      await writeFile(file,'fixture');await utimes(file,i,i)
    }
    for(const name of ['usermgr-service-linux-x64-deadbeef.tar.gz','.env','archive-notes.md'])await writeFile(join(dir,name),'preserve')
    await mkdir(join(dir,'mahjong-service-20261013-1000.tar.gz'))
    await symlink('.env',join(dir,'mahjong-service-20261013-1006.tar.gz'))
    const result=await pruneReleasePackages(dir,'mahjong-service')
    assert.equal(result.retained.length,3)
    assert.deepEqual(result.removed,['mahjong-service-20261013-1002.tar.gz','mahjong-service-20261013-1001.tar.gz'])
    for(const name of ['usermgr-service-linux-x64-deadbeef.tar.gz','.env','archive-notes.md','mahjong-service-20261013-1000.tar.gz','mahjong-service-20261013-1006.tar.gz'])assert.ok((await readdir(dir)).includes(name))
    assert.deepEqual((await pruneReleasePackages(dir,'mahjong-service')).removed,[])
    await assert.rejects(pruneReleasePackages(dir,'unknown'))
  }finally{await rm(dir,{recursive:true,force:true})}
})
