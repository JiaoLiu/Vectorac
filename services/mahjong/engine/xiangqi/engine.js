// 薄转发：规则只有一份（site/.vuepress/components/xiangqi/engine.mjs，单机与联机共用）。
// 打包时 scripts/bundle.sh 用真实文件覆盖本文件（.mjs 无内部依赖，可直接改名 .js）。
export * from '../../../../site/.vuepress/components/xiangqi/engine.mjs'
