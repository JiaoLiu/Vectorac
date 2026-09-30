// 五子棋引擎复用层：薄 re-export（打包时被真实文件覆盖），规则只有一份。
// 放在 engine/gomoku/ 子目录：真实 ai.js 内部 import './engine.js'，
// 平铺到 engine/ 会撞麻将引擎同名文件。
export * from '../../../.vuepress/components/gomoku/engine.js'
