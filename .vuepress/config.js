const valineConfig = require('./valine-config')

module.exports = {
  title: '成都向量加速科技有限公司',
  description: 'Vectorac',
  dest: 'public',
  patterns: [
    '**/*.md',
    '**/*.vue',
    '!shorturl-service/**',
    '!usermgr-service/**',
    '!mahjong-service/**',
    '!.private/**',
    '!**/node_modules/**'
  ],
  // 关闭 prefetch：VuePress 默认给每页 SSR HTML 注入 44+ 个 <link rel="prefetch">
  // 预取全部页面 chunk（约 1.7MB JS），冷缓存时严重抢占首屏关键资源带宽。
  // @vuepress/core/lib/node/build/index.js 读取 siteConfig.shouldPrefetch
  shouldPrefetch: () => false,
  // 注意：devServer 只能写在顶层。VuePress 1.x 只读 siteConfig.devServer
  // （@vuepress/core/lib/node/dev/index.js 里 Object.assign(默认值, siteConfig.devServer)），
  // 在 chainWebpack 里 config.devServer.set(...) 不会被消费，写了等于没写。
  devServer: {
    // dev 模式所有响应都强制 no-store，修改 shorturl-demo.js 等文件后无需硬刷即可生效
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    },
    // 麻将联机服务反向代理（仅 dev）：前端联机大厅走同源路径，
    // 生产环境由 nginx 做同样的反代（见 mahjong-service/scripts/mahjong-proxy.conf），
    // 前端代码无需区分环境。需先启动 mahjong-service（默认 127.0.0.1:3032）。
    proxy: {
      '/api/rooms': { target: 'http://127.0.0.1:3032', changeOrigin: true },
      '/api/game-stats': { target: 'http://127.0.0.1:3032', changeOrigin: true },
      '/mahjong-ws': { target: 'ws://127.0.0.1:3032', ws: true, changeOrigin: true }
    }
  },
  chainWebpack(config, isServer) {
  },
  head: [
    // defer：不阻塞 HTML 解析（三个脚本内部都处理了 readyState，DOM 未就绪时会等 DOMContentLoaded）
    ['script', { type: 'text/javascript', src: '/js/bdPush.js', defer: true }],
    ['script', { type: 'text/javascript', src: '/js/shorturl-demo.js', defer: true }],
    ['script', { type: 'text/javascript', src: '/js/flasher.js', defer: true }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'vectorac,向量加速,成都向量加速科技有限公司,互联网+,AI,大数据,人工智能,移动互联网,软件开发'
      }
    ],
    [
      'link',
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg'
      }
    ],
    [
      'link',
      {
        rel: 'icon',
        type: 'image/x-icon',
        href: '/favicon.ico'
      }
    ],
    [
      'link',
      {
        rel: 'shortcut icon',
        type: 'image/x-icon',
        href: '/favicon.ico'
      }
    ],
    [
      'meta',
      {
        name: 'viewport',
        content: 'width=device-width,initial-scale=1,user-scalable=no'
      }
    ]
  ],
  plugins: [require('./plugins/chat-widget'), require('./plugins/game-feedback')],
  theme: 'reco',
  themeConfig: {
    nav: [
      {
        text: '首页',
        link: '/',
        icon: 'reco-home'
      },
      {
        text: '产品',
        icon: 'reco-category',
        items: [
          {
            text: '小V机器人',
            link: '/blogs/other/xiaov.md',
            icon: 'reco-robot'
          },
          {
            text: '短链跳转',
            link: '/blogs/other/shorturl.md',
            icon: 'reco-api'
          },
          {
            text: '固件烧录',
            link: '/blogs/other/flasher.md',
            icon: 'reco-firmware'
          },
          {
            text: '小游戏',
            link: '/blogs/other/games.md',
            icon: 'reco-game'
          },
          {
            text: '人脸匹配',
            link: '/blogs/other/face_compare.md',
            icon: 'reco-account'
          },
          {
            text: '文字识别',
            link: '/blogs/other/ch_ocr.md',
            icon: 'reco-document'
          },
          {
            text: '图表组件',
            link: '/blogs/other/chcharts.md',
            icon: 'reco-blog'
          },
          {
            text: '智慧问答',
            link: 'https://chat.vectorac.com/',
            icon: 'reco-other'
          }
        ]
      },
      {
        text: '大事纪要',
        link: '/timeline/',
        icon: 'reco-date'
      },
      // {
      //   text: 'Docs',
      //   icon: 'reco-message',
      //   items: [
      //     {
      //       text: 'vuepress-reco',
      //       link: '/docs/theme-reco/'
      //     }
      //   ]
      // },
      {
        text: '联系我们',
        icon: 'reco-message',
        items: [
          {
            text: '留言',
            link: '/docs/about.md',
            icon: 'reco-suggestion'
          },
          {
            text: '邮件联系',
            link: 'mailto:support@vectorac.com',
            icon: 'reco-mail'
          },
          {
            text: '开发团队',
            link: 'https://www.jianshu.com/c/1a4a1f8797a2',
            icon: 'reco-jianshu'
          }
        ]
      }
    ],
    // sidebar: [
    //   {
    //     title: '大事纪要', // 必要的
    //     path: '/timeline/', // 可选的, 标题的跳转链接，应为绝对路径且必须存在
    //     collapsable: false, // 可选的, 默认值是 true,
    //     sidebarDepth: 1, // 可选的, 默认值是 1
    //     children: ['/blogs/timeline/2020/201119.md']
    //   }
    // ],
    type: 'blog',
    valineConfig,
    // blogConfig: {
    //   category: {
    //     location: 2,
    //     text: 'Category'
    //   },
    //   tag: {
    //     location: 3,
    //     text: 'Tag'
    //   }
    // },
    // friendLink: [
    //   {
    //     title: '午后南杂',
    //     desc: 'Enjoy when you can, and endure when you must.',
    //     email: '1156743527@qq.com',
    //     link: 'https://www.recoluan.com'
    //   },
    //   {
    //     title: 'vuepress-theme-reco',
    //     desc: 'A simple and beautiful vuepress Blog & Doc theme.',
    //     avatar:
    //       'https://vuepress-theme-reco.recoluan.com/icon_vuepress_reco.png',
    //     link: 'https://vuepress-theme-reco.recoluan.com'
    //   }
    // ],
    logo: null,
    search: true,
    searchMaxSuggestions: 10,
    // lastUpdated: 'Last Updated',
    // author: 'Jiao',
    // authorAvatar: '/avatar.png',
    record: '蜀ICP备2020035895号',
    recordLink: 'https://beian.miit.gov.cn/',
    cyberSecurityRecord: '川公网安备 51012202000830号',
    cyberSecurityLink:
      'http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=51012202000830',
    startYear: '2020'
  },
  markdown: {
    lineNumbers: true,
    // 全局给 markdown 语法渲染的图片加 lazy/async，避免首屏外大图阻塞加载
    extendMarkdown(md) {
      const defaultRender =
        md.renderer.rules.image ||
        ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
      md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        token.attrSet('loading', 'lazy')
        token.attrSet('decoding', 'async')
        return defaultRender(tokens, idx, options, env, self)
      }
    }
  }
}
