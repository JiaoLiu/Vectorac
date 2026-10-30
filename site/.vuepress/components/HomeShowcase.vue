<template>
  <div
    class="home-showcase"
    :class="{ 'is-ready': isReady, 'is-paused': isPaused, 'is-static': reducedMotion }"
  >
    <section class="home-hero" :class="{ 'is-offscreen': !heroVisible }" aria-labelledby="home-hero-title">
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-glow hero-glow-one" aria-hidden="true"></div>
      <div class="hero-glow hero-glow-two" aria-hidden="true"></div>

      <div class="section-shell hero-layout">
        <div class="hero-copy">
          <p class="hero-eyebrow"><span></span> VECTORAC · INTELLIGENT PRODUCTS</p>
          <h1 id="home-hero-title"><span class="hero-title-first">让智能，</span><span class="hero-title-connect">连接</span><br class="hero-title-break" /><span class="hero-title-result">每一个产品。</span></h1>
          <p class="hero-description">
            从 AI 机器人、视觉识别到数据服务与互动体验，<br class="desktop-break" />
            Vectorac 把技术变成真正可用、好用的产品。
          </p>
          <div class="hero-actions">
            <a class="button button-primary" href="#products">
              探索产品
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" /></svg>
            </a>
            <router-link class="button button-secondary" to="/blogs/other/xiaov.html">
              体验小V AI
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.5 12.5 10 7 15.5" /></svg>
            </router-link>
          </div>
          <ul class="hero-capabilities" aria-label="核心能力">
            <li>AI 驱动</li>
            <li>数据连接</li>
            <li>软硬件融合</li>
          </ul>
        </div>

        <div
          ref="systemStage"
          class="system-stage"
          role="img"
          aria-label="Vectorac 智能产品中枢：人脸与文字识别负责感知，小V与智慧问答负责理解，数据服务与固件烧录连接更多产品"
          @pointermove="handlePointerMove"
          @pointerleave="resetPointer"
          @pointercancel="resetPointer"
        >
          <div class="system-stage-inner" aria-hidden="true">
            <svg class="system-map" viewBox="0 0 600 600" fill="none">
              <defs>
                <linearGradient id="home-line-gradient" x1="80" y1="80" x2="520" y2="520" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#58E6C0" />
                  <stop offset="1" stop-color="#5B8DEF" />
                </linearGradient>
                <radialGradient id="home-core-gradient">
                  <stop stop-color="#58E6C0" stop-opacity=".2" />
                  <stop offset="1" stop-color="#58E6C0" stop-opacity="0" />
                </radialGradient>
              </defs>
              <circle cx="300" cy="300" r="222" class="map-orbit" />
              <circle cx="300" cy="300" r="156" class="map-orbit map-orbit-inner" />
              <circle cx="300" cy="300" r="138" fill="url(#home-core-gradient)" />
              <g class="map-paths">
                <path d="M140 190C200 210 215 250 238 268" />
                <path d="M140 410C200 390 215 350 238 332" />
                <path d="M300 110V225" />
                <path d="M460 190C400 210 385 250 362 268" />
                <path d="M460 410C400 390 385 350 362 332" />
                <path d="M300 490V375" />
              </g>
              <g class="map-flows" stroke="url(#home-line-gradient)">
                <path d="M140 190C200 210 215 250 238 268" />
                <path d="M140 410C200 390 215 350 238 332" />
                <path d="M300 110V225" />
                <path d="M460 190C400 210 385 250 362 268" />
                <path d="M460 410C400 390 385 350 362 332" />
                <path d="M300 490V375" />
              </g>
              <g class="map-points" fill="#8DF5D8">
                <circle cx="140" cy="190" r="3" /><circle cx="140" cy="410" r="3" />
                <circle cx="300" cy="110" r="3" /><circle cx="460" cy="190" r="3" />
                <circle cx="460" cy="410" r="3" /><circle cx="300" cy="490" r="3" />
              </g>
            </svg>

            <div class="system-core">
              <span class="core-ring core-ring-one"></span>
              <span class="core-ring core-ring-two"></span>
              <div class="core-logo"><img :src="$withBase('/logo.png')" alt="" width="84" height="60" /></div>
              <strong>VECTORAC</strong>
              <small>INTELLIGENCE CORE</small>
            </div>

            <div
              v-for="(node, index) in systemNodes"
              :key="node.title"
              class="system-node-position"
              :style="{ left: node.x + '%', top: node.y + '%' }"
            >
              <div class="system-node" :style="{ animationDelay: (index * -0.65) + 's' }">
                <span class="node-glyph">{{ node.mark }}</span>
                <span class="node-copy"><strong>{{ node.title }}</strong><small>{{ node.subtitle }}</small></span>
              </div>
            </div>
          </div>
          <div class="system-caption" aria-hidden="true">
            <span><i></i> AI · DATA · CLOUD</span>
            <span>一个技术底座，多种产品形态</span>
          </div>
        </div>
      </div>

      <a class="scroll-cue" href="#capabilities" aria-label="向下了解核心能力">
        <span>SCROLL TO EXPLORE</span><i></i>
      </a>
    </section>

    <section id="capabilities" class="story-section">
      <div class="section-shell">
        <header class="section-heading" data-reveal>
          <p class="section-eyebrow">ONE FOUNDATION. MANY POSSIBILITIES.</p>
          <h2>从技术能力，到真实体验。</h2>
          <p>让感知、理解与执行彼此连接，技术不再停留在概念里，而是进入每一个具体场景。</p>
        </header>

        <div class="story-layout">
          <div class="story-chapters">
            <article
              v-for="(step, index) in storySteps"
              :key="step.id"
              class="story-chapter"
              :class="{ 'is-active': activeStory === index }"
              :data-story-index="index"
            >
              <div class="chapter-number">{{ step.number }}<span>/ 03</span></div>
              <p class="chapter-kicker">{{ step.kicker }}</p>
              <h3>{{ step.title }}</h3>
              <p class="chapter-description">{{ step.description }}</p>
              <ul class="chapter-tags"><li v-for="tag in step.tags" :key="tag">{{ tag }}</li></ul>
              <div class="chapter-mobile-visual">
                <img :src="$withBase(step.image)" :alt="step.imageAlt" loading="lazy" width="1024" height="640" />
              </div>
            </article>
          </div>

          <div class="story-visual" data-reveal>
            <div class="story-visual-frame">
              <article
                v-for="(step, index) in storySteps"
                :key="step.id"
                class="story-visual-card"
                :class="{ 'is-active': activeStory === index }"
                :aria-hidden="activeStory !== index"
              >
                <img :src="$withBase(step.image)" :alt="step.imageAlt" loading="lazy" width="1024" height="640" />
                <div class="visual-shade"></div>
                <div class="visual-topline"><span><i></i>{{ step.visualLabel }}</span><span>VECTORAC / {{ step.number }}</span></div>
                <div class="visual-bottomline"><span>{{ step.kicker }}</span><strong>{{ step.shortTitle }}</strong></div>
              </article>
            </div>
            <div class="story-progress" aria-hidden="true">
              <span v-for="(step, index) in storySteps" :key="step.id" :class="{ 'is-active': activeStory === index }"></span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="products" class="products-section">
      <div class="section-shell">
        <header class="section-heading product-heading" data-reveal>
          <div>
            <p class="section-eyebrow">PRODUCT ECOSYSTEM</p>
            <h2>一个 Vectorac，<br />不止一种可能。</h2>
          </div>
          <p>从智能助手到开发工具，从视觉能力到互动娱乐，<br class="desktop-break" />选择你感兴趣的产品，直接开始体验。</p>
        </header>

        <div class="product-grid">
          <component
            :is="linkComponent(product.link)"
            v-bind="linkProps(product.link)"
            v-for="(product, index) in products"
            :key="product.title"
            class="product-card"
            :style="{ '--product-accent': product.color, '--reveal-delay': ((index % 4) * 70) + 'ms' }"
            :aria-label="'了解' + product.title"
            data-reveal
          >
            <span class="product-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="product.iconPath" /></svg>
            </span>
            <span class="product-type">{{ product.type }}</span>
            <strong class="product-title">{{ product.title }}</strong>
            <span class="product-description">{{ product.description }}</span>
            <span class="product-link">立即体验<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" /></svg></span>
          </component>
        </div>
      </div>
    </section>

    <section class="values-section">
      <div class="section-shell">
        <header class="section-heading values-heading" data-reveal>
          <p class="section-eyebrow">PAST. PRESENT. FUTURE.</p>
          <h2>持续进化，始终为了更好用。</h2>
        </header>
        <div class="values-grid">
          <article v-for="(value, index) in values" :key="value.title" class="value-card" :style="{ '--reveal-delay': (index * 80) + 'ms' }" data-reveal>
            <span>{{ value.number }}</span>
            <p>{{ value.period }}</p>
            <h3>{{ value.title }}</h3>
            <div></div>
            <p>{{ value.description }}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="contact-section">
      <div class="section-shell">
        <div class="contact-panel" data-reveal>
          <div class="contact-orbit" aria-hidden="true"></div>
          <div class="contact-copy">
            <p class="section-eyebrow">CREATE WHAT'S NEXT</p>
            <h2>有一个想法？<br />一起把它做成产品。</h2>
            <p>无论是 AI 应用、互联网服务，还是软硬件创新，我们都乐意与你聊聊。</p>
          </div>
          <router-link class="button contact-button" to="/docs/about.html">
            联系我们
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" /></svg>
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  name: 'HomeShowcase',
  data () {
    return {
      isReady: false,
      isPaused: false,
      heroVisible: true,
      reducedMotion: false,
      activeStory: 0,
      revealObserver: null,
      storyObserver: null,
      heroObserver: null,
      motionQuery: null,
      pointerQuery: null,
      pointerFrame: 0,
      pointerX: 0,
      pointerY: 0,
      systemNodes: [
        { mark: 'CV', title: '人脸匹配', subtitle: '视觉感知', x: 14, y: 29 },
        { mark: 'OCR', title: '文字识别', subtitle: '结构化输入', x: 14, y: 71 },
        { mark: 'AI', title: '小V机器人', subtitle: '智能交互', x: 50, y: 9 },
        { mark: 'QA', title: '智慧问答', subtitle: '语义理解', x: 86, y: 29 },
        { mark: 'API', title: '数据服务', subtitle: '短链 · 图表', x: 86, y: 71 },
        { mark: 'IoT', title: '固件烧录', subtitle: '设备连接', x: 50, y: 91 }
      ],
      storySteps: [
        {
          id: 'perception', number: '01', kicker: '感知 / PERCEPTION', title: '让设备看懂世界。',
          shortTitle: '看见，才能理解',
          description: '人脸匹配与文字识别，把真实世界中的图像和信息转化为可使用、可分析的数据，为产品打开感知入口。',
          tags: ['人脸匹配', '文字识别'], image: '/img/face/hero.png', imageAlt: 'Vectorac 人脸匹配视觉能力示意图',
          visualLabel: 'VISION INPUT'
        },
        {
          id: 'intelligence', number: '02', kicker: '理解 / INTELLIGENCE', title: '让 AI 成为产品的智慧中枢。',
          shortTitle: '理解，才能回应',
          description: '小V机器人与智慧问答连接模型、知识和交互，让设备理解需求，也让每一次回应更自然、更有帮助。',
          tags: ['小V机器人', '智慧问答', 'AI 应用'], image: '/img/xiaov/xiaov-hero.webp', imageAlt: 'Vectorac 小V AI 机器人产品设计图',
          visualLabel: 'AI REASONING'
        },
        {
          id: 'experience', number: '03', kicker: '执行 / EXPERIENCE', title: '让技术抵达每一种场景。',
          shortTitle: '连接，创造体验',
          description: '短链、烧录、图表与互动游戏，把能力交付到网页、设备和用户手中，形成完整而具体的产品体验。',
          tags: ['数据服务', '固件烧录', '互动体验'], image: '/img/games/thumbs/fengshen.webp', imageAlt: 'Vectorac 互动游戏产品画面',
          visualLabel: 'PRODUCT OUTPUT'
        }
      ],
      products: [
        {
          title: '小V机器人', type: 'AI COMPANION', description: '有形象、有交互，也有温度的 AI 智能伙伴。', link: '/blogs/other/xiaov.html', color: '#3eaf7c',
          iconPath: 'M12 3v3m-5 0h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Zm-2 5H3v5h2m14-5h2v5h-2M8.5 10v2m7-2v2M9 15h6'
        },
        {
          title: '短链跳转', type: 'SMART LINK', description: '让每一次分享更简洁，让每一次访问可追踪。', link: '/blogs/other/shorturl.html', color: '#4b8fe8',
          iconPath: 'M9.5 14.5 14.5 9m-7 7-1 1a3.54 3.54 0 0 1-5-5l3-3a3.54 3.54 0 0 1 5 0m5-2 1-1a3.54 3.54 0 0 1 5 5l-3 3a3.54 3.54 0 0 1-5 0'
        },
        {
          title: '固件烧录', type: 'DEVICE TOOL', description: '连接网页与设备，让固件更新简单、可靠。', link: '/blogs/other/flasher.html', color: '#8b72df',
          iconPath: 'M8 2v3m4-3v3m4-3v3M8 19v3m4-3v3m4-3v3M2 8h3m-3 4h3m-3 4h3m14-8h3m-3 4h3m-3 4h3M5 5h14v14H5V5Zm4 4h6v6H9V9Z'
        },
        {
          title: '小游戏', type: 'INTERACTIVE FUN', description: '把创意变成即开即玩的互动体验。', link: '/blogs/other/games.html', color: '#e88b55',
          iconPath: 'M8 7h8a5 5 0 0 1 4.8 6.35l-1.2 4.2a2.5 2.5 0 0 1-4.15 1.1L14 17h-4l-1.45 1.65a2.5 2.5 0 0 1-4.15-1.1l-1.2-4.2A5 5 0 0 1 8 7Zm-1 3v4m-2-2h4m7-1h.01M18 13h.01'
        },
        {
          title: '人脸匹配', type: 'COMPUTER VISION', description: '快速比对面部特征，提供直观视觉能力。', link: '/blogs/other/face_compare.html', color: '#39a9b8',
          iconPath: 'M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3M9 9v1m6-1v1m-7 4a5 5 0 0 0 8 0M8 5a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0V5Z'
        },
        {
          title: '文字识别', type: 'OCR SERVICE', description: '从图片中提取文字，让信息录入更高效。', link: '/blogs/other/ch_ocr.html', color: '#5984df',
          iconPath: 'M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm8 0v5h4M9 12h6m-6 4h6M9 8h2'
        },
        {
          title: '图表组件', type: 'DATA VISUALIZATION', description: '把复杂数据变成清晰、易读的视觉表达。', link: '/blogs/other/chcharts.html', color: '#36a888',
          iconPath: 'M4 3v17h17M8 16v-4m4 4V8m4 8v-6m4 6V5'
        },
        {
          title: '智慧问答', type: 'KNOWLEDGE AI', description: '连接知识与对话，快速找到所需答案。', link: 'https://chat.vectorac.com/', color: '#9b72d5',
          iconPath: 'M20 11.5a7.5 7.5 0 0 1-8 7.5 9.4 9.4 0 0 1-3-.5L4 20l1.5-4A7.5 7.5 0 1 1 20 11.5ZM8 10h8m-8 4h5'
        }
      ],
      values: [
        { number: '01', period: 'YESTERDAY · 技术沉淀', title: '把基础打牢', description: '持续积累大数据、AI、移动互联网与软硬件开发能力。' },
        { number: '02', period: 'TODAY · 产品打磨', title: '把体验做好', description: '用简洁界面与可靠服务，让复杂技术变得自然易用。' },
        { number: '03', period: 'TOMORROW · 开放共创', title: '把可能放大', description: '与更多领域交流协作，让互联网+走进更广阔的场景。' }
      ]
    }
  },
  mounted () {
    this.isReady = true
    this.homeNavbar = document.querySelector('.vectorac-home .navbar')
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.pointerQuery = window.matchMedia('(pointer: fine) and (min-width: 1024px)')
    this.reducedMotion = this.motionQuery.matches
    this.handleMotionChange = () => {
      this.reducedMotion = this.motionQuery.matches
      if (this.reducedMotion) this.resetPointer()
    }
    this.handleVisibilityChange = () => {
      this.isPaused = document.hidden
      if (this.isPaused) this.resetPointer()
    }
    this.addMediaListener(this.motionQuery, this.handleMotionChange)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.updateHomeNavbar()
    this.$nextTick(this.setupObservers)
  },
  beforeDestroy () {
    this.removeMediaListener(this.motionQuery, this.handleMotionChange)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    if (this.revealObserver) this.revealObserver.disconnect()
    if (this.storyObserver) this.storyObserver.disconnect()
    if (this.heroObserver) this.heroObserver.disconnect()
    if (this.pointerFrame) cancelAnimationFrame(this.pointerFrame)
    if (this.homeNavbar) this.homeNavbar.classList.remove('is-home-scrolled')
    this.homeNavbar = null
  },
  methods: {
    linkComponent (link) {
      return /^https?:\/\//.test(link) ? 'a' : 'router-link'
    },
    linkProps (link) {
      return this.linkComponent(link) === 'a'
        ? { href: link, target: '_blank', rel: 'noopener noreferrer' }
        : { to: link }
    },
    addMediaListener (query, handler) {
      if (query.addEventListener) query.addEventListener('change', handler)
      else query.addListener(handler)
    },
    removeMediaListener (query, handler) {
      if (!query || !handler) return
      if (query.removeEventListener) query.removeEventListener('change', handler)
      else query.removeListener(handler)
    },
    updateHomeNavbar () {
      if (!this.homeNavbar) return
      this.homeNavbar.classList.toggle('is-home-scrolled', !this.heroVisible)
    },
    setupObservers () {
      const revealItems = this.$el.querySelectorAll('[data-reveal]')
      if (!('IntersectionObserver' in window)) {
        revealItems.forEach(item => item.classList.add('is-visible'))
        return
      }
      this.revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-visible')
          this.revealObserver.unobserve(entry.target)
        })
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
      revealItems.forEach(item => this.revealObserver.observe(item))

      const chapters = this.$el.querySelectorAll('[data-story-index]')
      this.storyObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return
          this.activeStory = Number(entry.target.getAttribute('data-story-index'))
        })
      }, { threshold: 0, rootMargin: '-35% 0px -45% 0px' })
      chapters.forEach(chapter => this.storyObserver.observe(chapter))

      const hero = this.$el.querySelector('.home-hero')
      this.heroObserver = new IntersectionObserver(entries => {
        this.heroVisible = entries[0].isIntersecting
        this.updateHomeNavbar()
      }, { threshold: 0.02 })
      this.heroObserver.observe(hero)
    },
    handlePointerMove (event) {
      if (this.reducedMotion || this.isPaused || !this.pointerQuery.matches) return
      const stage = this.$refs.systemStage
      const rect = stage.getBoundingClientRect()
      this.pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 12
      this.pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 12
      if (this.pointerFrame) return
      this.pointerFrame = requestAnimationFrame(() => {
        stage.style.setProperty('--parallax-x', this.pointerX.toFixed(2) + 'px')
        stage.style.setProperty('--parallax-y', this.pointerY.toFixed(2) + 'px')
        this.pointerFrame = 0
      })
    },
    resetPointer () {
      if (this.pointerFrame) cancelAnimationFrame(this.pointerFrame)
      this.pointerFrame = 0
      const stage = this.$refs.systemStage
      if (!stage) return
      stage.style.setProperty('--parallax-x', '0px')
      stage.style.setProperty('--parallax-y', '0px')
    }
  }
}
</script>

<style scoped>
.home-showcase {
  --home-green: #58e6c0;
  --home-blue: #6b9cff;
  --home-ink: #071019;
  color: var(--text-color);
  background: var(--background-color);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  overflow: clip;
}

.home-showcase *, .home-showcase *::before, .home-showcase *::after { box-sizing: border-box; }
.home-showcase a { text-decoration: none; }
.section-shell { width: calc(100% - 64px); max-width: 1220px; margin: 0 auto; }

.home-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  min-height: 100vh;
  min-height: 100svh;
  padding: calc(104px + env(safe-area-inset-top)) 0 calc(76px + env(safe-area-inset-bottom));
  color: #f4f8fb;
  background: radial-gradient(circle at 71% 44%, #102a32 0, #09141f 31%, #070d16 63%, #050910 100%);
}
.hero-grid {
  position: absolute;
  z-index: -2;
  inset: 0;
  opacity: .32;
  background-image: linear-gradient(rgba(137, 199, 207, .055) 1px, transparent 1px), linear-gradient(90deg, rgba(137, 199, 207, .055) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse at 70% 48%, #000 0, transparent 70%);
}
.hero-glow { position: absolute; z-index: -1; border-radius: 50%; filter: blur(4px); pointer-events: none; }
.hero-glow-one { width: 480px; height: 480px; right: -190px; top: -190px; background: radial-gradient(circle, rgba(62, 175, 124, .14), transparent 68%); }
.hero-glow-two { width: 540px; height: 540px; left: -260px; bottom: -260px; background: radial-gradient(circle, rgba(73, 116, 214, .12), transparent 70%); }
.hero-layout { display: grid; grid-template-columns: minmax(0, .94fr) minmax(480px, 1.06fr); align-items: center; gap: 32px; }
.hero-copy { position: relative; z-index: 2; padding-bottom: 12px; }
.hero-eyebrow, .section-eyebrow { margin: 0 0 22px; font-size: 11px; line-height: 1.4; font-weight: 650; letter-spacing: .2em; }
.hero-eyebrow { display: flex; align-items: center; gap: 10px; color: #9bb6c2; }
.hero-eyebrow > span { width: 7px; height: 7px; border-radius: 50%; background: var(--home-green); box-shadow: 0 0 0 5px rgba(88, 230, 192, .08), 0 0 20px rgba(88, 230, 192, .6); }
.hero-copy h1 { display: block; margin: 0; color: #f7fbfd; font-size: clamp(50px, 5.15vw, 76px); line-height: 1.12; font-weight: 680; letter-spacing: -.055em; }
.hero-copy h1 > .hero-title-result { color: transparent; background: linear-gradient(105deg, #f7fbfd 4%, #77e7c9 48%, #8aaefd 96%); background-clip: text; -webkit-background-clip: text; }
.hero-description { max-width: 590px; margin: 30px 0 0; color: #a9bbc6; font-size: 16px; line-height: 1.95; letter-spacing: .015em; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 13px; margin-top: 36px; }
.button { display: inline-flex; align-items: center; justify-content: center; gap: 22px; min-height: 50px; padding: 0 24px; border: 1px solid transparent; border-radius: 999px; font-size: 14px; font-weight: 600; transition: transform .25s ease, background-color .25s ease, border-color .25s ease, box-shadow .25s ease; }
.button svg, .product-link svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform .25s ease; }
.button:hover { transform: translateY(-2px); }
.button:hover svg, .product-card:hover .product-link svg { transform: translateX(3px); }
.button:focus-visible, .scroll-cue:focus-visible, .product-card:focus-visible { outline: 2px solid var(--home-green); outline-offset: 4px; }
.button-primary { color: #07150f !important; background: #75e7c8; box-shadow: 0 8px 32px rgba(74, 217, 176, .14); }
.button-primary:hover { background: #91efd4; box-shadow: 0 10px 38px rgba(74, 217, 176, .24); }
.button-secondary { color: #e7f0f5 !important; border-color: rgba(196, 222, 232, .18); background: rgba(255, 255, 255, .035); }
.button-secondary:hover { border-color: rgba(117, 231, 200, .45); background: rgba(117, 231, 200, .07); }
.hero-capabilities { display: flex; flex-wrap: wrap; gap: 24px; margin: 34px 0 0; padding: 0; color: #738d9a; font-size: 12px; list-style: none; }
.hero-capabilities li { display: flex; align-items: center; gap: 8px; }
.hero-capabilities li::before { content: ""; width: 4px; height: 4px; border-radius: 50%; background: #527584; }

.system-stage { --parallax-x: 0px; --parallax-y: 0px; position: relative; width: 100%; max-width: 620px; aspect-ratio: 1; justify-self: end; }
.system-stage-inner { position: absolute; inset: 0; transform: translate3d(var(--parallax-x), var(--parallax-y), 0); transition: transform .22s ease-out; }
.system-map { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.map-orbit { stroke: rgba(128, 197, 200, .1); stroke-width: 1; stroke-dasharray: 2 8; transform-origin: 300px 300px; animation: home-orbit 48s linear infinite; }
.map-orbit-inner { stroke: rgba(128, 197, 200, .08); stroke-dasharray: 1 10; animation-direction: reverse; animation-duration: 36s; }
.map-paths { stroke: rgba(115, 177, 185, .17); stroke-width: 1.2; }
.map-flows { stroke-width: 1.8; stroke-linecap: round; stroke-dasharray: 3 17; animation: home-data-flow 3.2s linear infinite; }
.map-flows path:nth-child(2) { animation-delay: -.6s; }
.map-flows path:nth-child(3) { animation-delay: -1.2s; }
.map-points { filter: drop-shadow(0 0 5px rgba(88, 230, 192, .85)); }
.system-core { position: absolute; left: 50%; top: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 150px; height: 150px; transform: translate(-50%, -50%); border: 1px solid rgba(117, 231, 200, .19); border-radius: 50%; background: radial-gradient(circle at 45% 35%, rgba(40, 78, 84, .9), rgba(8, 20, 28, .96) 68%); box-shadow: 0 0 70px rgba(68, 208, 175, .12), inset 0 0 28px rgba(106, 224, 198, .05); }
.core-ring { position: absolute; border-radius: 50%; pointer-events: none; }
.core-ring-one { inset: -13px; border: 1px dashed rgba(117, 231, 200, .18); animation: home-orbit 22s linear infinite; }
.core-ring-two { inset: 9px; border-top: 1px solid rgba(117, 231, 200, .36); border-right: 1px solid transparent; animation: home-orbit 12s linear infinite reverse; }
.core-logo { display: flex; align-items: center; justify-content: center; width: 68px; height: 53px; margin-bottom: 5px; }
.core-logo img { display: block; width: 62px; height: auto; filter: drop-shadow(0 0 13px rgba(88, 230, 192, .18)); }
.system-core strong { color: #dcefeb; font-size: 10px; letter-spacing: .19em; }
.system-core small { margin-top: 4px; color: #658b91; font-size: 6px; letter-spacing: .13em; }
.system-node-position { position: absolute; transform: translate(-50%, -50%); }
.system-node { display: flex; align-items: center; gap: 10px; width: 142px; padding: 11px 12px; border: 1px solid rgba(151, 199, 205, .14); border-radius: 13px; background: linear-gradient(135deg, rgba(21, 42, 51, .87), rgba(10, 23, 32, .77)); box-shadow: 0 10px 35px rgba(0, 0, 0, .15), inset 0 1px rgba(255, 255, 255, .035); backdrop-filter: blur(12px); animation: home-node-float 5s ease-in-out infinite alternate; }
.node-glyph { display: flex; flex: 0 0 34px; align-items: center; justify-content: center; width: 34px; height: 34px; border: 1px solid rgba(117, 231, 200, .14); border-radius: 9px; color: #85dec9; background: rgba(82, 202, 172, .065); font-size: 10px; font-weight: 700; letter-spacing: -.02em; }
.node-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.node-copy strong { overflow: hidden; color: #dce8eb; font-size: 11px; font-weight: 550; white-space: nowrap; }
.node-copy small { color: #6f8b96; font-size: 8px; white-space: nowrap; }
.system-caption { position: absolute; left: 50%; bottom: 1.5%; display: flex; width: 72%; align-items: center; justify-content: space-between; transform: translateX(-50%); color: #526e79; font-size: 8px; letter-spacing: .08em; }
.system-caption > span:first-child { display: flex; align-items: center; gap: 7px; }
.system-caption i, .visual-topline i { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--home-green); box-shadow: 0 0 8px rgba(88, 230, 192, .7); }
.scroll-cue { position: absolute; left: 50%; bottom: calc(21px + env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 14px; transform: translateX(-50%); color: #4e6874 !important; font-size: 8px; letter-spacing: .2em; }
.scroll-cue i { position: relative; display: block; width: 38px; height: 1px; overflow: hidden; background: rgba(122, 164, 175, .18); }
.scroll-cue i::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, #78cbb7, transparent); animation: home-scroll-line 2.4s ease-in-out infinite; }

.is-ready .hero-copy > * { opacity: 0; animation: home-hero-enter .8s cubic-bezier(.22, 1, .36, 1) forwards; }
.is-ready .hero-copy > :nth-child(1) { animation-delay: .08s; }
.is-ready .hero-copy > :nth-child(2) { animation-delay: .16s; }
.is-ready .hero-copy > :nth-child(3) { animation-delay: .26s; }
.is-ready .hero-copy > :nth-child(4) { animation-delay: .36s; }
.is-ready .hero-copy > :nth-child(5) { animation-delay: .44s; }
.is-ready .system-stage { opacity: 0; animation: home-stage-enter 1.1s .24s cubic-bezier(.22, 1, .36, 1) forwards; }
.is-paused *, .is-paused *::before, .is-paused *::after, .home-hero.is-offscreen * { animation-play-state: paused !important; }

.story-section, .products-section, .values-section { padding: 136px 0; }
.section-heading { max-width: 730px; margin-bottom: 76px; }
.section-eyebrow { color: #3eaf7c; }
.section-heading h2, .contact-copy h2 { margin: 0; padding-left: 0; color: var(--text-color); font-size: clamp(36px, 4vw, 54px); line-height: 1.18; font-weight: 650; letter-spacing: -.045em; }
.section-heading h2::before, .contact-copy h2::before { display: none; }
.section-heading > p:last-child { max-width: 640px; margin: 24px 0 0; color: var(--text-color-sub); font-size: 16px; line-height: 1.9; }
.story-layout { display: grid; grid-template-columns: minmax(0, .82fr) minmax(0, 1.18fr); align-items: start; gap: 90px; }
.story-chapter { display: flex; min-height: 70vh; flex-direction: column; justify-content: center; opacity: .25; transition: opacity .5s ease; }
.story-chapter.is-active { opacity: 1; }
.chapter-number { margin-bottom: 32px; color: #3eaf7c; font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: .08em; }
.chapter-number span { margin-left: 7px; color: var(--text-color-sub); font-size: 10px; opacity: .55; }
.chapter-kicker { margin: 0 0 16px; color: var(--text-color-sub); font-size: 10px; font-weight: 600; letter-spacing: .16em; }
.story-chapter h3 { max-width: 400px; margin: 0; color: var(--text-color); font-size: clamp(28px, 2.7vw, 40px); line-height: 1.3; font-weight: 620; letter-spacing: -.035em; }
.chapter-description { max-width: 420px; margin: 22px 0 0; color: var(--text-color-sub); font-size: 15px; line-height: 1.95; }
.chapter-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 28px 0 0; padding: 0; list-style: none; }
.chapter-tags li { padding: 6px 11px; border: 1px solid var(--border-color); border-radius: 999px; color: var(--text-color-sub); font-size: 10px; }
.story-visual { position: sticky; top: calc(50vh - 285px); padding-top: 40px; }
.story-visual-frame { position: relative; overflow: hidden; aspect-ratio: 1.18; border: 1px solid rgba(115, 157, 165, .18); border-radius: 28px; background: #09131c; box-shadow: 0 28px 80px rgba(13, 31, 40, .14); }
.story-visual-card { position: absolute; inset: 0; margin: 0; opacity: 0; transform: scale(1.025); transition: opacity .65s ease, transform .9s cubic-bezier(.22, 1, .36, 1); }
.story-visual-card.is-active { opacity: 1; transform: scale(1); }
.story-visual-card img { display: block; width: 100%; height: 100%; object-fit: cover; }
.visual-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(4, 11, 17, .38), transparent 36%, transparent 57%, rgba(4, 11, 17, .82)); }
.visual-topline, .visual-bottomline { position: absolute; left: 26px; right: 26px; display: flex; align-items: center; justify-content: space-between; color: rgba(231, 244, 247, .76); }
.visual-topline { top: 23px; font-size: 8px; letter-spacing: .15em; }
.visual-topline > span:first-child { display: flex; align-items: center; gap: 8px; }
.visual-bottomline { bottom: 25px; align-items: flex-end; }
.visual-bottomline span { font-size: 9px; letter-spacing: .12em; }
.visual-bottomline strong { color: #fff; font-size: 20px; font-weight: 550; letter-spacing: -.02em; }
.story-progress { display: flex; justify-content: center; gap: 7px; margin-top: 25px; }
.story-progress > span { width: 20px; height: 2px; border-radius: 2px; background: var(--border-color); transition: width .35s ease, background-color .35s ease; }
.story-progress > span.is-active { width: 38px; background: #3eaf7c; }
.chapter-mobile-visual { display: none; }

.products-section { position: relative; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); background: linear-gradient(145deg, rgba(62, 175, 124, .035), transparent 42%), var(--background-color); }
.product-heading { display: flex; max-width: none; align-items: flex-end; justify-content: space-between; gap: 40px; }
.product-heading > p:last-child { flex: 0 0 auto; margin: 0 0 4px; font-size: 14px; }
.product-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.product-card { position: relative; display: flex; overflow: hidden; min-height: 280px; flex-direction: column; padding: 25px; border: 1px solid var(--border-color); border-radius: 19px; color: var(--text-color) !important; background: var(--background-color); transition: transform .3s cubic-bezier(.22, 1, .36, 1), border-color .3s ease, box-shadow .3s ease; }
.product-card::before { content: ""; position: absolute; width: 160px; height: 160px; right: -90px; top: -90px; border-radius: 50%; background: radial-gradient(circle, var(--product-accent), transparent 70%); opacity: .055; transition: opacity .3s ease; }
.product-card:hover { transform: translateY(-6px); border-color: color-mix(in srgb, var(--product-accent) 45%, transparent); box-shadow: 0 18px 45px rgba(16, 37, 45, .09); }
.product-card:hover::before { opacity: .13; }
.product-icon { display: flex; width: 43px; height: 43px; align-items: center; justify-content: center; margin-bottom: 29px; border: 1px solid color-mix(in srgb, var(--product-accent) 18%, transparent); border-radius: 12px; color: var(--product-accent); background: color-mix(in srgb, var(--product-accent) 7%, transparent); }
.product-icon svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.product-type { margin-bottom: 9px; color: var(--text-color-sub); font-size: 8px; font-weight: 600; letter-spacing: .15em; opacity: .75; }
.product-title { color: var(--text-color); font-size: 20px; font-weight: 620; letter-spacing: -.02em; }
.product-description { margin-top: 11px; color: var(--text-color-sub); font-size: 12px; line-height: 1.75; }
.product-link { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 22px; color: var(--text-color); font-size: 11px; font-weight: 550; }
.product-link svg { width: 17px; color: var(--product-accent); }

.values-heading { margin-bottom: 55px; }
.values-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 34px; }
.value-card { position: relative; padding: 29px 0 0; border-top: 1px solid var(--border-color); }
.value-card > span { position: absolute; right: 0; top: 22px; color: var(--text-color-sub); font-size: 11px; opacity: .45; }
.value-card > p:first-of-type { margin: 0 0 21px; color: #3eaf7c; font-size: 9px; font-weight: 600; letter-spacing: .12em; }
.value-card h3 { margin: 0; color: var(--text-color); font-size: 25px; font-weight: 600; letter-spacing: -.03em; }
.value-card > div { width: 26px; height: 2px; margin: 22px 0; background: #3eaf7c; }
.value-card > p:last-child { max-width: 320px; margin: 0; color: var(--text-color-sub); font-size: 13px; line-height: 1.85; }

.contact-section { padding: 0 0 120px; }
.contact-panel { position: relative; display: flex; overflow: hidden; min-height: 350px; align-items: center; justify-content: space-between; gap: 50px; padding: 64px 70px; border: 1px solid rgba(114, 191, 181, .15); border-radius: 28px; background: radial-gradient(circle at 90% 20%, rgba(64, 156, 139, .18), transparent 38%), linear-gradient(125deg, #0a151e, #081019); }
.contact-panel::before { content: ""; position: absolute; inset: 0; opacity: .23; background-image: linear-gradient(rgba(137, 199, 207, .07) 1px, transparent 1px), linear-gradient(90deg, rgba(137, 199, 207, .07) 1px, transparent 1px); background-size: 42px 42px; mask-image: linear-gradient(90deg, transparent, #000); }
.contact-copy { position: relative; z-index: 1; }
.contact-copy h2 { color: #f2f8fa; font-size: clamp(34px, 3.6vw, 50px); }
.contact-copy > p:last-child { max-width: 590px; margin: 22px 0 0; color: #8da5b0; font-size: 14px; line-height: 1.85; }
.contact-button { position: relative; z-index: 1; flex: 0 0 auto; min-width: 160px; color: #0a1a14 !important; background: #79e2c4; }
.contact-button:hover { background: #98edd3; box-shadow: 0 12px 38px rgba(80, 211, 174, .17); }
.contact-orbit { position: absolute; width: 400px; height: 400px; right: -150px; top: -170px; border: 1px solid rgba(104, 223, 192, .09); border-radius: 50%; box-shadow: 0 0 0 50px rgba(104, 223, 192, .025), 0 0 0 100px rgba(104, 223, 192, .018); }

[data-reveal] { opacity: 0; transform: translateY(28px); transition: opacity .75s var(--reveal-delay, 0ms) ease, transform .75s var(--reveal-delay, 0ms) cubic-bezier(.22, 1, .36, 1); }
[data-reveal].is-visible { opacity: 1; transform: translateY(0); }

@keyframes home-hero-enter { from { opacity: 0; transform: translateY(25px); } to { opacity: 1; transform: translateY(0); } }
@keyframes home-stage-enter { from { opacity: 0; transform: translateY(18px) scale(.965); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes home-data-flow { to { stroke-dashoffset: -80; } }
@keyframes home-orbit { to { transform: rotate(360deg); } }
@keyframes home-node-float { from { transform: translateY(-3px); } to { transform: translateY(4px); } }
@keyframes home-scroll-line { 0% { transform: translateX(-100%); } 60%, 100% { transform: translateX(100%); } }

@media (max-width: 1100px) {
  .hero-layout { grid-template-columns: minmax(0, .9fr) minmax(420px, 1.1fr); gap: 10px; }
  .hero-copy h1 { font-size: 54px; }
  .system-node { width: 126px; padding: 9px; gap: 8px; }
  .node-glyph { flex-basis: 30px; width: 30px; height: 30px; }
  .story-layout { gap: 48px; }
  .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .product-card { min-height: 255px; }
}

@media (max-width: 860px) {
  .section-shell { width: calc(100% - 44px); }
  .home-hero { padding-top: 112px; }
  .hero-layout { grid-template-columns: 1fr; gap: 44px; }
  .hero-copy { max-width: 660px; text-align: center; justify-self: center; }
  .hero-eyebrow, .hero-actions, .hero-capabilities { justify-content: center; }
  .hero-copy h1 { font-size: clamp(48px, 8.8vw, 68px); }
  .system-stage { max-width: 560px; justify-self: center; }
  .scroll-cue { display: none; }
  .story-section, .products-section, .values-section { padding: 100px 0; }
  .story-layout { display: block; }
  .story-chapter { min-height: 0; padding: 44px 0 70px; opacity: 1; }
  .chapter-number { margin-bottom: 24px; }
  .story-chapter h3, .chapter-description { max-width: 620px; }
  .chapter-mobile-visual { display: block; overflow: hidden; margin-top: 32px; aspect-ratio: 1.5; border: 1px solid var(--border-color); border-radius: 20px; background: #09131c; }
  .chapter-mobile-visual img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .story-visual { display: none; }
  .product-heading { display: block; }
  .product-heading > p:last-child { margin-top: 24px; }
  .values-grid { gap: 22px; }
  .contact-panel { padding: 50px 44px; }
}

@media (max-width: 600px) {
  .section-shell { width: calc(100% - 36px); }
  .home-hero { min-height: auto; padding: calc(102px + env(safe-area-inset-top)) 0 calc(64px + env(safe-area-inset-bottom)); }
  .hero-layout { gap: 30px; }
  .hero-eyebrow { margin-bottom: 16px; font-size: 8px; letter-spacing: .12em; }
  .hero-copy h1 { font-size: clamp(32px, 9.2vw, 38px); line-height: 1.2; font-weight: 600; letter-spacing: -.025em; }
  .hero-title-first { display: block; }
  .hero-title-break { display: none; }
  .hero-title-connect, .hero-title-result { color: transparent; background: linear-gradient(105deg, #f7fbfd 4%, #77e7c9 48%, #8aaefd 96%); background-clip: text; -webkit-background-clip: text; }
  .hero-description { max-width: 330px; margin: 18px auto 0; font-size: 13px; line-height: 1.75; letter-spacing: 0; }
  .desktop-break { display: none; }
  .hero-actions { gap: 10px; margin-top: 24px; }
  .button { min-height: 44px; gap: 15px; padding: 0 18px; font-size: 12px; }
  .hero-capabilities { gap: 14px; margin-top: 22px; font-size: 9px; }
  .system-stage { width: calc(100% + 20px); max-width: 440px; margin-left: -10px; }
  .system-core { width: 106px; height: 106px; }
  .core-logo { width: 50px; height: 39px; margin-bottom: 2px; }
  .core-logo img { width: 46px; }
  .system-core strong { font-size: 7px; }
  .system-core small { font-size: 4.5px; }
  .core-ring-one { inset: -9px; }
  .system-node { width: 108px; gap: 6px; padding: 8px; border-radius: 10px; }
  .node-glyph { flex-basis: 26px; width: 26px; height: 26px; border-radius: 7px; font-size: 8px; }
  .node-copy { gap: 2px; }
  .node-copy strong { font-size: 9px; }
  .node-copy small { font-size: 6.5px; }
  .system-caption { bottom: -2%; width: 78%; font-size: 6px; }
  .story-section, .products-section, .values-section { padding: 82px 0; }
  .section-heading { margin-bottom: 42px; }
  .section-eyebrow { margin-bottom: 16px; font-size: 9px; }
  .section-heading h2, .contact-copy h2 { font-size: 34px; }
  .section-heading > p:last-child { margin-top: 19px; font-size: 14px; }
  .story-chapter { padding: 28px 0 55px; }
  .story-chapter h3 { font-size: 29px; }
  .chapter-description { font-size: 14px; }
  .chapter-mobile-visual { aspect-ratio: 1.25; border-radius: 16px; }
  .product-grid { grid-template-columns: 1fr; gap: 12px; }
  .product-card { min-height: 225px; padding: 23px; }
  .product-icon { margin-bottom: 22px; }
  .values-grid { grid-template-columns: 1fr; gap: 36px; }
  .value-card > p:last-child { max-width: none; }
  .contact-section { padding-bottom: 72px; }
  .contact-panel { min-height: 0; flex-direction: column; align-items: flex-start; gap: 32px; padding: 38px 27px; border-radius: 22px; }
  .contact-copy > p:last-child { font-size: 13px; }
  .contact-button { min-width: 148px; }
}

@media (prefers-reduced-motion: reduce) {
  .home-showcase *, .home-showcase *::before, .home-showcase *::after { scroll-behavior: auto !important; animation: none !important; transition-duration: .01ms !important; }
  .is-ready .hero-copy > *, .is-ready .system-stage, [data-reveal] { opacity: 1; transform: none; }
  .system-stage-inner { transform: none; }
  .story-visual-card { transform: none; }
}
</style>
