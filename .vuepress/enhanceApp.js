// 全局加载五子棋 / 象棋 / 斗地主样式（原各 md 内联 <style>）。
// 联机大厅（gamehall）就地挂载三棋联机房间，复用单机页的 .gk-* / .xq-* 类名；
// VuePress 只给 md 所在页注入页面级 <style>，大厅页拿不到这些规则，
// 会导致联机房间全屏接管与横屏布局完全失效，因此抽为全局 CSS 全站可用。
import './styles/gomoku.css'
import './styles/xiangqi.css'
import './styles/doudizhu.css'

export default () => {}
