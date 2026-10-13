import assert from 'node:assert/strict'
import {rm} from 'node:fs/promises'
import {openBrowser} from './browser-cdp.mjs'

const browser = await openBrowser({name: 'public-blog-search'})
try {
  await browser.viewport(1440, 900)
  await browser.navigate('/')
  await browser.waitFor('!!document.querySelector(".search-box")?.__vue__')
  assert.deepEqual(await browser.evaluate(`document.querySelector('.search-box').__vue__.$site.pages
    .filter(p => ['/dev/', '/services/', '/scripts/', '/.private/'].some(prefix => p.path.startsWith(prefix)))
    .map(p => p.path)`), [], 'internal documents are absent from the built page data')
  await browser.evaluate(`(() => {
    const vm = document.querySelector('.search-box').__vue__
    window.__searchUnderTest = vm
    vm.$site.pages.push(
      {path: '/dev/DEVELOPMENT.html', title: '图表组件库 v1.0 开源 开发规范'},
      {path: '/.private/deploy.html', title: '图表组件库 v1.0 开源 开发规范'},
      {path: '/docs/about.html', title: '图表组件库 v1.0 开源'},
      {path: '/categories/internal/', title: '图表组件库 v1.0 开源'},
      {path: '/blogs/other/unpublished.html', title: '图表组件库 v1.0 开源 开发规范', frontmatter: {published: false}},
      {path: '/blogs/other/draft.html', title: '图表组件库 v1.0 开源 开发规范', frontmatter: {draft: true}},
      {path: '/blogs/other/hidden.html', title: '图表组件库 v1.0 开源 开发规范', frontmatter: {search: false}}
    )
    return true
  })()`)
  async function query(text) {
    await browser.evaluate(`(() => {
      const input = document.querySelector('.search-box input')
      input.focus(); input.value = ${JSON.stringify(text)}
      input.dispatchEvent(new Event('input', {bubbles: true}))
      return true
    })()`)
    return browser.evaluate(`(() => ({
      results: window.__searchUnderTest.suggestions || [],
      links: [...document.querySelectorAll('.search-box .suggestion a')].map(a => a.getAttribute('href'))
    }))()`)
  }
  for (const text of ['1', '图表', '公司成立', '在线演示', '部署']) {
    const {results, links} = await query(text)
    assert.ok(results.length > 0, text + ' finds a public blog title or chapter')
    for (const result of results) {
      assert.match(result.path, /^\/blogs\/(?:other|timeline)\//)
      assert.ok(!/\/(?:unpublished|draft|hidden)\.html/.test(result.path))
    }
    for (const path of links) assert.match(path, /^\/blogs\/(?:other|timeline)\//)
  }
  for (const text of ['开发规范', 'DEVELOPMENT', 'DIRECTORY_LAYOUT', 'MIGRATION_ACCEPTANCE']) {
    const {results, links} = await query(text)
    assert.deepEqual(results, [], text)
    assert.deepEqual(links, [], text + ' renders no internal suggestion')
  }
  await query('图表')
  const target = await browser.evaluate('window.__searchUnderTest.suggestions[0].path')
  await browser.evaluate('window.__searchUnderTest.go(0); true')
  await browser.waitFor(`location.pathname === ${JSON.stringify(target.split('#')[0])}`)
  assert.deepEqual(browser.errors.filter(e => e !== JSON.stringify({code: -32602, message: 'Invalid InterceptionId.'})), [])
  console.log('PASS navbar search: public blog titles/chapters only, internal and unpublished results excluded, navigation works')
} finally {
  await browser.close()
  await rm(browser.output, {recursive: true, force: true})
}
