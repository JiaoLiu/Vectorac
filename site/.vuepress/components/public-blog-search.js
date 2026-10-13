// Only pages in the public blog sections may appear in the navbar search.
module.exports = function isPublicBlogPage(page) {
  if (!page || typeof page.path !== 'string') return false
  if (!/^\/blogs\/(?:other\/[^/]+|timeline\/[^?#]+)\.html$/.test(page.path)) return false
  const meta = page.frontmatter || {}
  return meta.search !== false && meta.draft !== true && meta.published !== false
}
