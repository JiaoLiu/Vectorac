import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readdir} from 'node:fs/promises'

const require = createRequire(import.meta.url)
const isPublicBlogPage = require('../site/.vuepress/components/public-blog-search.js')

test('navbar search admits public blog pages and rejects internal, generated and non-blog pages', () => {
  for (const path of ['/blogs/other/chcharts.html', '/blogs/timeline/2026/260904.html']) {
    assert.equal(isPublicBlogPage({path, title: '公开内容'}), true)
  }
  for (const path of ['/', '/docs/about.html', '/dev/DEVELOPMENT.html', '/.private/deploy.html', '/AGENTS.html', '/services/usermgr/README.html', '/scripts/fixtures/README.html', '/categories/产品/', '/tag/AI/', '/timeline/', '/blogs/dev/DEVELOPMENT.html', '/blogs/other/internal/README.html']) {
    assert.equal(isPublicBlogPage({path, title: '开发规范', headers: [{title: '开发规范'}]}), false, path)
  }
  assert.equal(isPublicBlogPage(undefined), false)
})

test('unpublished, draft and explicitly unsearchable blog pages cannot appear in results', () => {
  for (const frontmatter of [{search: false}, {draft: true}, {published: false}]) {
    assert.equal(isPublicBlogPage({path: '/blogs/other/chcharts.html', frontmatter}), false)
  }
})

test('page collection only includes the homepage, open blog sections and public contact page', async () => {
  const {patterns} = require('../site/.vuepress/config.js')
  const globby = require('globby')
  const entries = ['README.md', 'blogs/other/chcharts.md', 'blogs/timeline/2026/260904.md', 'docs/about.md', 'AGENTS.md', 'DEVELOPMENT.md', 'dev/DEVELOPMENT.md', '.private/deploy.md', 'docs/INTERNAL.md', 'blogs/other/AGENTS.md', 'blogs/dev/DEVELOPMENT.md', 'services/usermgr/README.md', 'scripts/fixtures/README.md']
  const minimatch = require('minimatch')
  const positives = patterns.filter(p => !p.startsWith('!'))
  const negatives = patterns.filter(p => p.startsWith('!')).map(p => p.slice(1))
  const admitted = entries.filter(e => positives.some(p => minimatch(e, p)) && !negatives.some(p => minimatch(e, p)))
  assert.deepEqual(admitted, entries.slice(0, 4))
  const realPages = await globby([...patterns, '!.vuepress', '!node_modules'], {cwd: 'site'})
  async function sourceBlogs(directory) {
    const paths = []
    for (const entry of await readdir('site/' + directory, {withFileTypes: true})) {
      const path = directory + '/' + entry.name
      if (entry.isDirectory()) paths.push(...await sourceBlogs(path))
      else if (entry.name.endsWith('.md') && entry.name !== 'AGENTS.md') paths.push(path)
    }
    return paths
  }
  assert.deepEqual(realPages.sort(), ['README.md', 'docs/about.md', ...await sourceBlogs('blogs/other'), ...await sourceBlogs('blogs/timeline')].sort())
})
