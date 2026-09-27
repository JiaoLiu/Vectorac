import assert from 'node:assert/strict'
import {readFile, mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
const require = createRequire(import.meta.url)
const {webkit, chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright')
const svg = await readFile(new URL('../.vuepress/public/img/games/balatro-cover.svg', import.meta.url), 'utf8')
const css = await readFile(new URL('../.vuepress/components/balatro/style.css', import.meta.url), 'utf8')
const output = await mkdtemp(join(tmpdir(), 'balatro-cover-'))
for (const [name, engine] of [['webkit', webkit], ['chromium', chromium]]) {
  const browser = await engine.launch({headless: true, ...(name === 'chromium' && process.env.CHROME_BINARY ? {executablePath:process.env.CHROME_BINARY} : {})})
  try {
    for (const dpr of [1, 2, 3]) {
      const page = await browser.newPage({viewport: {width: 720, height: 440}, deviceScaleFactor: dpr})
      await page.setContent(`<meta charset="utf-8"><style>body{margin:0;background:#eee}img{display:block}</style><img width="272" height="153" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`)
      await page.locator('img').evaluate(img => img.decode())
      const structure = await page.evaluate(source => {
        const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
        const art = doc.querySelector('#court-artwork')
        return {
          valid: !doc.querySelector('parsererror'),
          embeddedBitmaps: doc.querySelectorAll('image').length,
          filteredArtwork: Array.from(art.querySelectorAll('*')).some(el => el.closest('[filter]')) || !!art.closest('[filter]'),
          cards: Array.from(art.querySelectorAll('svg')).map(el => [el.getAttribute('width'), el.getAttribute('height')]),
          shadowSilhouettes: doc.querySelectorAll('g[filter] rect').length
        }
      }, svg)
      assert.equal(structure.valid, true)
      assert.equal(structure.embeddedBitmaps, 0)
      assert.equal(structure.filteredArtwork, false, 'fine artwork must never be inside a filter compositing layer')
      assert.deepEqual(structure.cards, Array(3).fill(['174', '244']), 'original card proportions stay unchanged')
      assert.equal(structure.shadowSilhouettes, 3, 'shadows are rendered separately from the artwork')
      await page.locator('img').screenshot({path: join(output, `${name}-272px-${dpr}x.png`)})
      await page.close()
    }
    for (const viewport of [{width:1280,height:800}, {width:390,height:844}, {width:667,height:375}]) {
      const page = await browser.newPage({viewport,deviceScaleFactor:2})
      const compact = viewport.width < 800
      await page.setContent(`<meta charset="utf-8"><style>body{margin:0}${css}</style><div id="balatro-game" class="${compact?'bp-compact':''}"><div class="bp-entry"><div class="bp-title-art"><img class="bp-entry-cover" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></div></div></div>`)
      await page.locator('img').evaluate(img=>img.decode())
      const bounds = await page.locator('.bp-title-art').boundingBox()
      assert.equal(bounds.height, compact?200:285, 'cover container keeps its pre-enlargement height')
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width, 'cover fits viewport')
      await page.locator('.bp-title-art').screenshot({path:join(output,`${name}-${viewport.width}x${viewport.height}.png`)})
      await page.close()
    }
  } finally { await browser.close() }
}
console.log(JSON.stringify({passed:true,screenshots:output}))
