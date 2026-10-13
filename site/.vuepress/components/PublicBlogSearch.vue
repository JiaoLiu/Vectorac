<script>
import ThemeSearchBox from 'vuepress-theme-reco/components/SearchBox.vue'
import isPublicBlogPage from './public-blog-search'

export default {
  extends: ThemeSearchBox,
  computed: {
    suggestions() {
      // Reuse the theme's matching, result limit and chapter links with a filtered page list.
      return ThemeSearchBox.computed.suggestions.call({
        query: this.query,
        $site: {...this.$site, pages: this.$site.pages.filter(isPublicBlogPage)},
        $localePath: this.$localePath,
        getPageLocalePath: this.getPageLocalePath
      })
    }
  }
}
</script>
