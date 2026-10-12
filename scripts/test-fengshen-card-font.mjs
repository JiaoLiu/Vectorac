import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {auditCardFont,checkCardFont} from './check-fengshen-card-font.mjs'
const bytes=Buffer.from('fixture'),manifest={file:'assets/fonts/test.woff2',sha256:createHash('sha256').update(bytes).digest('hex'),codepoints:[...'杀琼浆'].map(c=>c.codePointAt(0))},css="src:url('assets/fonts/test.woff2')"
test('actual runtime font covers all current card titles',checkCardFont)
test('new card with an unsupported character blocks release',()=>assert.match(auditCardFont({wine:{name:'琼浆'},new:{name:'獬豸'}},manifest,bytes,css).join('\n'),/new.*獬豸/))
test('font replacement cannot reuse old coverage metadata',()=>assert.match(auditCardFont({},manifest,Buffer.from('replaced'),css).join('\n'),/Font bytes changed/))
test('runtime stylesheet cannot point back at the old font',()=>assert.match(auditCardFont({},manifest,bytes,"url('assets/fonts/old.woff2')").join('\n'),/URL does not match/))
