::: warning 小游戏集合

欢迎来到小游戏集合！这里有各种有趣的小游戏，帮助你学习和娱乐。

:::

<div class="games-wrap">

<!-- ========== 棋牌对战 ========== -->
<div class="game-cat">
  <span class="game-cat-icon">🀄</span>
  <span class="game-cat-name">棋牌对战</span>
</div>

<div class="game-grid">

  <!-- 麻将必须用普通 a 标签整页跳转，不能用 router-link：
       iOS 只在「HTML 解析阶段」就见到 viewport-fit=cover 时才注入 env(safe-area-inset-*)，
       动态插入/改写 viewport 无效。router-link 是 SPA 跳转，页面 head 由 JS 之后改写，
       安全区变量恒为 0，横屏时刘海会盖住牌桌左侧。整页跳转才能让目标页 frontmatter 里
       带 viewport-fit=cover 的 viewport 在解析时就生效。
       href 必须带 .html（`/blogs/other/mahjong_game.html`）：项目所有 vue 路由都是
       `<name>.html` 形式，nginx 对无扩展名路径返回首页兜底；写无扩展名会先加载首页再由
       JS 路由重定向，真机上这次重定向常渲染不出来，且 viewport 又变回「JS 之后才写」。 -->
  <a href="/blogs/other/mahjong_game.html" class="game-card">
    <div class="game-card-cover"><img src="/img/games/mahjong.png" alt="四川麻将" loading="lazy"></div>
    <div class="game-card-body">
      <div class="game-card-title">四川麻将</div>
      <div class="game-card-desc">血战到底 · 1 对 3 AI · 换三张 / 定缺 / 碰杠胡</div>
      <span class="game-card-btn">开始游戏</span>
    </div>
  </a>

</div>

<!-- ========== 键盘练习 ========== -->
<div class="game-cat">
  <span class="game-cat-icon">⌨️</span>
  <span class="game-cat-name">键盘练习</span>
</div>

<div class="game-grid">

  <a href="/blogs/other/keyboard_game.html" class="game-card">
    <div class="game-card-cover"><img src="/img/games/keyboard.png" alt="键盘学习" loading="lazy"></div>
    <div class="game-card-body">
      <div class="game-card-title">键盘学习</div>
      <div class="game-card-desc">射落带字母的气球，熟悉键盘布局，支持触屏</div>
      <span class="game-card-btn">开始游戏</span>
    </div>
  </a>

  <a href="/blogs/other/typing_game.html" class="game-card">
    <div class="game-card-cover"><img src="/img/games/typing.png" alt="经典打字" loading="lazy"></div>
    <div class="game-card-body">
      <div class="game-card-title">经典打字</div>
      <div class="game-card-desc">限时竞速，实时统计 WPM / 准确率 / 连击</div>
      <span class="game-card-btn">开始游戏</span>
    </div>
  </a>

</div>

<!-- ========== 益智烧脑 ========== -->
<div class="game-cat">
  <span class="game-cat-icon">🧩</span>
  <span class="game-cat-name">益智烧脑</span>
</div>

<div class="game-grid">

  <a href="/blogs/other/hua_rong_dao.html" class="game-card">
    <div class="game-card-cover"><img src="/img/games/hrd.png" alt="华容道" loading="lazy"></div>
    <div class="game-card-body">
      <div class="game-card-title">华容道</div>
      <div class="game-card-desc">经典滑块解谜，5 大 BFS 验证关卡，Q 版三国立绘</div>
      <span class="game-card-btn">开始游戏</span>
    </div>
  </a>

  <a href="/blogs/other/sudoku.html" class="game-card">
    <div class="game-card-cover"><img src="/img/games/sudoku.png" alt="数独" loading="lazy"></div>
    <div class="game-card-body">
      <div class="game-card-title">数独</div>
      <div class="game-card-desc">保证唯一解，三档难度，高亮辅助与计时</div>
      <span class="game-card-btn">开始游戏</span>
    </div>
  </a>

  <a href="/blogs/other/2048.html" class="game-card">
    <div class="game-card-cover"><img src="/img/games/2048.png" alt="2048" loading="lazy"></div>
    <div class="game-card-body">
      <div class="game-card-title">2048</div>
      <div class="game-card-desc">合并数字方块冲击高分，滑动动画 + 撤销</div>
      <span class="game-card-btn">开始游戏</span>
    </div>
  </a>

</div>

<!-- ========== 解压放松 ========== -->
<div class="game-cat">
  <span class="game-cat-icon">🫧</span>
  <span class="game-cat-name">解压放松</span>
</div>

<div class="game-grid">

  <a href="/blogs/other/slime_game.html" class="game-card">
    <div class="game-card-cover"><img src="/img/games/slime.png" alt="史莱姆" loading="lazy"></div>
    <div class="game-card-body">
      <div class="game-card-title">史莱姆模拟</div>
      <div class="game-card-desc">戳一戳、拉一拉电子史莱姆，真实物理超解压</div>
      <span class="game-card-btn">开始游戏</span>
    </div>
  </a>

</div>

</div>

<style>
.games-wrap {
  margin: 8px 0;
}

/* 分类标题 */
.game-cat {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 26px 0 14px;
  font-size: 19px;
  font-weight: 700;
  color: #2c3e50;
}
.game-cat:first-child {
  margin-top: 10px;
}
.game-cat-icon {
  font-size: 22px;
}
.game-cat-name {
  letter-spacing: 1px;
}

/* 卡片网格：桌面 3 列，平板 2 列，手机 1 列 */
.game-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
@media (max-width: 960px) {
  .game-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .game-grid { grid-template-columns: 1fr; gap: 14px; }
}

/* 卡片（整卡可点） */
.game-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.08);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  border: 1px solid #eef0f3;
}
.game-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.14);
  text-decoration: none;
}

/* 封面图 */
.game-card-cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #f0f2f5;
}
.game-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.35s ease;
}
.game-card:hover .game-card-cover img {
  transform: scale(1.05);
}

/* 卡片文字区 */
.game-card-body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.game-card-title {
  font-size: 17px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 6px;
}
.game-card-desc {
  font-size: 13px;
  line-height: 1.6;
  color: #8492a6;
  margin-bottom: 12px;
  flex: 1;
}

/* 按钮 */
.game-card-btn {
  display: inline-block;
  align-self: flex-start;
  padding: 8px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 3px 10px rgba(102, 126, 234, 0.35);
  transition: all 0.25s ease;
}
.game-card:hover .game-card-btn {
  box-shadow: 0 5px 16px rgba(102, 126, 234, 0.5);
}
</style>
