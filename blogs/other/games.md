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