::: warning 小游戏集合

欢迎来到小游戏集合！这里有各种有趣的小游戏，帮助你学习和娱乐。

:::

### 1. 键盘学习游戏
- **游戏类型**：教育类
- **游戏目标**：通过射击带有键盘按键的气球，帮助你熟悉键盘布局
- **操作方式**：使用键盘输入对应的按键，即可发射弓箭射落气球
- **支持按键**：A-Z、0-9、空格、回车等常用按键
- **移动端**：支持触屏输入

<router-link to="/blogs/other/keyboard_game" class="game-link">开始游戏</router-link>

### 2. 经典打字游戏
- **游戏类型**：竞速类
- **游戏目标**：在规定时间内尽可能多地输入正确的字符
- **操作方式**：使用键盘输入屏幕上显示的字符
- **支持按键**：所有常用字符

<router-link to="/blogs/other/typing_game" class="game-link">开始游戏</router-link>

### 3. 华容道游戏
- **游戏类型**：益智类
- **游戏目标**：通过移动方块，帮助曹操从棋盘底部的出口逃脱
- **操作方式**：使用键盘方向键或WASD键移动方块；在电脑和移动设备上，均可通过点击选中方块，再点击目标位置移动
- **游戏特色**：经典中国传统益智游戏，锻炼逻辑思维能力

<router-link to="/blogs/other/hua_rong_dao" class="game-link">开始游戏</router-link>

### 4. 数独游戏
- **游戏类型**：逻辑推理类
- **游戏目标**：填充9x9网格，使每行、每列和每个3x3小宫格内的数字1-9都不重复
- **操作方式**：点击空白格子选择位置，使用数字键盘或点击数字按钮输入数字
- **游戏特色**：经典逻辑游戏，锻炼推理能力和专注力，支持多个难度级别

<router-link to="/blogs/other/sudoku" class="game-link">开始游戏</router-link>

### 5. 2048 游戏
- **游戏类型**：益智类
- **游戏目标**：通过合并相同数字的方块，获得2048或更高分数
- **操作方式**：使用键盘方向键或WASD键移动方块；支持触屏滑动操作
- **游戏特色**：简单易懂的规则，富有挑战性的玩法，合并时有炫酷的碰撞特效

<router-link to="/blogs/other/2048" class="game-link">开始游戏</router-link>

### 6. 史莱姆模拟解压游戏
- **游戏类型**：解压类
- **游戏目标**：通过与电子史莱姆互动来放松心情，缓解压力
- **核心玩法**：触摸按压拖动史莱姆，改变其形状，添加颜色混合创造新颜色
- **特色功能**：点按凹陷、拖动起泡、按压戳破等真实物理效果
- **操作方式**：电脑端用鼠标，移动端用手指触摸滑动

<router-link to="/blogs/other/slime_game" class="game-link">开始游戏</router-link>

### 7. 四川麻将（血战到底）
- **游戏类型**：棋牌类
- **游戏目标**：1 名玩家对战 3 名 AI，血战到底，看谁笑到最后
- **核心玩法**：换三张、定缺、碰杠胡，有人胡牌后牌局继续，直至三人胡牌或流局
- **规则特色**：支持碰、明杠、暗杠、补杠、抢杠胡、一炮多响、查花猪、查大叫
- **特色功能**：合法操作智能提示、困难档 AI 陪打（听牌避铳、番型偏好）、策略建议助手、完整结算明细、刷新后可继续上局
- **操作方式**：点击手牌选中，再次点击或点"出牌"确认；电脑端鼠标、移动端触屏均可
- **积分说明**：仅娱乐积分，不涉及充值兑换

<!-- 必须用普通 a 标签整页跳转，不能用 router-link：
     iOS 只在「HTML 解析阶段」就见到 viewport-fit=cover 时才注入 env(safe-area-inset-*)，
     动态插入/改写 viewport 无效。router-link 是 SPA 跳转，页面 head 由 JS 之后改写，
     安全区变量恒为 0，横屏时刘海会盖住牌桌左侧。整页跳转才能让本页 frontmatter 里
     带 viewport-fit=cover 的 viewport 在解析时就生效。
     另外两处细节必须保持：
     1. href 必须带 .html（`/blogs/other/mahjong_game.html`）。项目所有 vue 路由都是
        `<name>.html` 形式，nginx 对无扩展名路径返回的是首页兜底；写 `...mahjong_game`
        会先加载首页再由 JS 路由重定向到 .html，真机上这次重定向常常渲染不出来，
        要刷新后才正常，而且这一跳是客户端渲染，viewport 又变回「JS 之后才写」，刘海照旧。
     2. 外面必须套一个块级标签（下面的 div）。裸 <a> 是行内元素，markdown 会把它包进
        <p>，按钮继承 <p> 的行高/外边距，看起来比其它游戏（router-link 渲染出的裸 <a>）
        的按钮高；套 div 后与其它按钮结构一致，高度就对上了。 -->
<div><a href="/blogs/other/mahjong_game.html" class="game-link">开始游戏</a></div>

## 游戏说明

- 所有游戏都支持键盘和触屏操作
- 游戏会自动保存你的最高分数
- 建议在电脑上使用键盘操作，获得更好的游戏体验
- 在移动设备上，可以使用屏幕键盘进行操作

<style>
.game-link {
  display: inline-block;
  padding: 12px 24px;
  margin: 10px 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-decoration: none;
  border-radius: 25px;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.game-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.game-link:active {
  transform: translateY(0);
  box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
}

/* 游戏卡片样式 */
div[class*="game-card"] {
  background: white;
  border-radius: 10px;
  padding: 20px;
  margin: 15px 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.game-card:hover {
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.15);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .game-link {
    display: block;
    text-align: center;
    margin: 10px auto;
  }
}
</style>
