import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright')
const origin = (process.env.XIANGQI_TEST_URL || 'http://127.0.0.1:8080').replace(/\/$/, '')
const screenshots = await mkdtemp(join(tmpdir(), 'xiangqi-layout-'))
const viewports = [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 667, height: 375 }]

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {})
  })
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/*', (route) => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin) ? route.abort() : route.continue())
      await page.goto(`${origin}/blogs/other/xiangqi.html`)
      await page.waitForSelector('.xq-piece')
      await page.waitForTimeout(250)
      assert.equal(await page.locator('.xq-piece').count(), 32)
      assert.equal(await page.locator('[data-xq-music]').getAttribute('aria-pressed'), 'true', 'music preference defaults to on')
      assert.equal(await page.locator('#xiangqiGame').evaluate((root) => root.classList.contains('xq-expanded')), true, 'the game enters immersive fullscreen by default')
      assert.equal(await page.locator('[data-xq-back]').getAttribute('href'), '/blogs/other/games.html', 'the game provides a direct route back to the game list')
      const landscape = viewport.width > viewport.height
      assert.equal(await page.locator('.xq-board-svg').getAttribute('viewBox'), '0 0 540 620', 'the board stays portrait-oriented in both viewport orientations')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'page does not overflow horizontally')

      if (landscape) {
        assert.equal(await page.locator('.xq-topbar').isVisible(), false)
        assert.equal(await page.locator('.xq-side [data-xq-back]').count(), 1)
        assert.equal(await page.locator('.xq-side [data-game-feedback]').count(), 1)
        const board = await page.locator('.xq-board-svg').boundingBox()
        assert.ok(board.height >= viewport.height - 28, 'portrait-oriented board uses nearly the full landscape screen height')
        assert.ok(board.height > board.width, 'landscape layout does not rotate the chessboard sideways')
      }

      for (const side of ['red', 'black']) {
        await page.evaluate((playerSide) => {
          window.__xiangqiUI.playerSide = playerSide
          window.__xiangqiUI.render()
        }, side)
        const orientation = await page.evaluate((playerSide) => {
          const svg = document.querySelector('.xq-board-svg')
          const center = (file, rank) => {
            const rect = svg.querySelector(`.xq-piece[data-x="${file}"][data-y="${rank}"]`).getBoundingClientRect()
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
          }
          const own = center(4, playerSide === 'red' ? 9 : 0)
          const opponent = center(4, playerSide === 'red' ? 0 : 9)
          const face = svg.querySelector('.xq-piece-face').getBoundingClientRect()
          const shadow = svg.querySelector('.xq-piece-shadow').getBoundingClientRect()
          const gloss = svg.querySelector('.xq-piece-gloss').getBoundingClientRect()
          const scaleFace = face.width / face.height
          return {
            board: svg.getBoundingClientRect(),
            own,
            opponent,
            scaleFace,
            light: {
              shadowBelow: shadow.y + shadow.height / 2 > face.y + face.height / 2 + 2,
              glossUpperLeft: gloss.x + gloss.width / 2 < face.x + face.width / 2 && gloss.y + gloss.height / 2 < face.y + face.height / 2
            },
            allInside: Array.from(svg.querySelectorAll('.xq-piece')).every((piece) => {
              const rect = piece.getBoundingClientRect()
              const board = svg.getBoundingClientRect()
              return rect.x >= board.x - 1 && rect.y >= board.y - 1 && rect.right <= board.right + 1 && rect.bottom <= board.bottom + 1
            })
          }
        }, side)
        assert.ok(orientation.allInside, 'pieces and hit targets stay inside the board')
        assert.ok(orientation.light.shadowBelow, 'piece shadow remains below the piece for either player')
        assert.ok(orientation.light.glossUpperLeft, 'piece highlight keeps a consistent top-left light source')
        assert.ok(orientation.scaleFace > 1.1 && orientation.scaleFace < 1.3, 'piece faces stay upright and undistorted')
        assert.ok(orientation.own.y > orientation.opponent.y, 'the active side stays at the bottom in every viewport orientation')
        await page.screenshot({ path: join(screenshots, `${name}-${viewport.width}-${side}.png`) })
      }

      await page.evaluate(() => {
        window.__xiangqiUI.playerSide = 'red'
        window.__xiangqiUI.newGame()
      })
      await page.locator('.xq-piece[data-x="0"][data-y="6"]').click()
      await page.locator('.xq-square-hit[data-x="0"][data-y="5"]').click()
      assert.ok(await page.evaluate(() => window.__xiangqiUI.board[5][0]?.side === 'red'), 'touch targets map back to logical squares')

      await page.locator('[data-xq-mode="puzzle"]').click()
      assert.equal(await page.locator('[data-xq-puzzle-panel]').isVisible(), true)
      assert.equal(await page.locator('[data-xq-puzzle-level]').count(), 8)
      assert.equal(await page.locator('[data-xq-puzzle-level]:not(:disabled)').count(), 1, 'later levels remain locked until solved')
      const solution = await page.evaluate(() => ({ ...window.__xiangqiUI.currentPuzzle.solution }))
      await page.locator(`.xq-piece[data-x="${solution.fromX}"][data-y="${solution.fromY}"]`).click()
      await page.locator(`.xq-square-hit[data-x="${solution.toX}"][data-y="${solution.toY}"]`).click()
      assert.equal(await page.locator('[data-xq-next]').isVisible(), true, 'solving a level offers the next one')
      assert.equal(await page.locator('[data-xq-puzzle-level]:not(:disabled)').count(), 2, 'solving unlocks the next level')
      assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('vectorac.xiangqi.puzzles.v1')).completed.length >= 1), 'completed levels persist locally')
      await page.locator('[data-xq-next]').click()
      assert.match(await page.locator('[data-xq-puzzle-title]').textContent(), /第 2 关/)

      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(150)
      assert.equal(await page.locator('.xq-board-svg').getAttribute('viewBox'), '0 0 540 620', 'orientation change restores portrait board coordinates')
      assert.equal(await page.locator('#xiangqiGame').evaluate((root) => root.classList.contains('xq-expanded')), true, 'rotating the device does not leave immersive mode')
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

console.log(JSON.stringify({ passed: true, screenshots }))
