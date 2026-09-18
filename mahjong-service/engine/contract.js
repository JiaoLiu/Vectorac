// ============================================================
// 规则引擎复用层（mahjong-service/engine/contract.js）
// ------------------------------------------------------------
// 薄 re-export：仓库内直接指向 .vuepress/components/mahjong/contract.js，
// 保证「规则只有一份」。打包时 scripts/bundle.sh 会把真实文件覆盖到本目录，
// 使服务端在独立部署形态下仍然自包含（文档 §六十六：不要复制第二套规则）。
// ============================================================

export * from '../../.vuepress/components/mahjong/contract.js'