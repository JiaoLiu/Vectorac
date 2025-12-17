module.exports = {
  title: '成都向量加速科技有限公司',
  description: 'Vectorac',
  dest: 'public',
  head: [
    ['script', { type: 'text/javascript', src: '/js/bdPush.js' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'vectorac,向量加速,成都向量加速科技有限公司,互联网+,AI,大数据,人工智能,移动互联网,软件开发'
      }
    ],
    [
      ('link',
      {
        rel: 'icon',
        href: '/favicon.ico'
      })
    ],
    [
      'meta',
      {
        name: 'viewport',
        content: 'width=device-width,initial-scale=1,user-scalable=no'
      }
    ]
  ],
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
            text: '打字游戏',
            link: '/blogs/other/typing_game.md',
            icon: 'reco-api'
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
    valineConfig: {
      appId: 'U0MS3MvBkFXhqRxsoj7nWKii-gzGzoHsz', // your appId
      appKey: '0VPcObmnbcWKHqRM77jChYQL', // your appKey
      showComment: false
    },
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
    lineNumbers: true
  }
}
