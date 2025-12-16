# 项目部署文档

## 项目概述
这是一个基于 **VuePress 1.5.4** 构建的静态网站项目，使用了 **vuepress-theme-reco** 主题，主要用于展示成都向量加速科技有限公司的信息。

## 运行方式

### 1. 安装依赖
首先需要安装项目依赖：
```bash
npm install
```

### 2. 开发模式
运行开发服务器，用于本地开发和预览：
```bash
npm run dev
```
- 会启动本地开发服务器，默认地址：`http://localhost:8080`
- 自动打开浏览器
- 支持热重载，修改文件后会自动刷新页面

### 3. 构建生产版本
生成可部署的静态文件：
```bash
npm run build
```
- 构建输出目录：`public/`（在 `.vuepress/config.js` 中配置）
- 生成的静态文件可以直接部署到任何静态网站托管服务

## 部署配置

### 1. 核心配置文件
- **`package.json`**：定义了项目依赖和脚本命令
- **`.vuepress/config.js`**：VuePress 主配置文件，包含：
  - 网站标题、描述、关键词
  - 主题配置（导航栏、博客设置、评论系统等）
  - 构建输出目录（`dest: 'public'`）
  - 元数据配置（viewport、备案信息等）
  - 百度推送脚本

### 2. 部署步骤
1. **构建生产版本**：`npm run build`
2. **部署静态文件**：将 `public/` 目录下的所有文件部署到静态网站托管服务
   - 支持的托管服务：GitHub Pages、Netlify、Vercel、阿里云OSS、腾讯云COS等
   - 可以使用 CI/CD 工具（如GitHub Actions、GitLab CI）自动化部署

### 3. 项目结构
```
Vectorac/
├── .vuepress/           # VuePress 配置和静态资源
│   ├── public/          # 静态资源目录（图片、JS文件等）
│   └── config.js        # 主配置文件
├── blogs/               # 博客文章目录
│   ├── other/           # 其他文章
│   └── timeline/        # 时间线文章
├── docs/                # 文档目录
├── public/              # 构建输出目录（自动生成）
├── .gitignore           # Git 忽略文件配置
├── package.json         # 项目配置
└── README.md            # 首页内容
```

## 主要功能配置

1. **主题**：使用了 `vuepress-theme-reco` 博客主题
2. **评论系统**：配置了 Valine 评论系统（当前已关闭显示）
3. **百度推送**：集成了百度推送脚本
4. **响应式设计**：支持移动端和桌面端
5. **备案信息**：包含了ICP备案和公安备案信息

## 开发建议

### 1. 修改内容
- **首页内容**：修改 `README.md`
- **导航栏**：修改 `.vuepress/config.js` 中的 `nav` 配置
- **博客文章**：在 `blogs/` 目录下添加或修改 Markdown 文件
- **文档**：在 `docs/` 目录下添加或修改 Markdown 文件

### 2. 添加新页面
- 在对应目录下创建 Markdown 文件
- 在导航栏中配置链接（如果需要）

### 3. 自定义样式
- 可以在 `.vuepress/` 目录下创建 `styles/` 目录，添加自定义 CSS 文件
- 在 `config.js` 中配置 `stylus` 或 `scss` 预处理器

## 部署示例

### GitHub Pages 部署

1. **安装 gh-pages 依赖**：
```bash
npm install -D gh-pages
```

2. **修改 package.json**，添加 deploy 脚本：
```json
"scripts": {
  "dev": "vuepress dev . --open --host \"localhost\"",
  "build": "vuepress build .",
  "deploy": "npm run build && gh-pages -d public"
}
```

3. **运行部署命令**：
```bash
npm run deploy
```

### 其他部署方式

#### Netlify / Vercel
1. 连接 GitHub 仓库
2. 配置构建命令：`npm run build`
3. 配置发布目录：`public`
4. 保存配置，自动部署

#### 阿里云 OSS / 腾讯云 COS
1. 构建生产版本：`npm run build`
2. 登录云服务控制台，创建存储桶
3. 开启静态网站托管
4. 将 `public/` 目录下的所有文件上传到存储桶

## 注意事项

1. **备案信息**：如果网站域名变更，需要更新 `.vuepress/config.js` 中的备案信息
2. **百度推送**：如果网站域名变更，需要更新百度推送脚本配置
3. **评论系统**：如果需要开启评论功能，需要在 `.vuepress/config.js` 中修改 `valineConfig.showComment` 为 `true`
4. **主题更新**：如果需要更新 VuePress 或主题版本，建议先在测试环境测试后再升级

## 常见问题

### 1. 构建失败
- 检查依赖是否正确安装：`npm install`
- 检查 Node.js 版本是否兼容（建议使用 Node.js 12+）
- 查看错误信息，针对性解决

### 2. 本地开发服务器无法启动
- 检查端口是否被占用
- 查看控制台错误信息
- 尝试重新安装依赖

### 3. 部署后样式错乱
- 检查构建是否成功：`npm run build`
- 检查部署的文件是否完整
- 检查网站根路径配置

### 4. 源码样式修改

#### 4.1 移除侧边栏个人信息组件

**修改文件**：`node_modules/vuepress-theme-reco/components/Common.vue`

**修改内容**：

**原始代码**：
```vue
<Sidebar
  :items="sidebarItems"
  @toggle-sidebar="toggleSidebar">
  <template slot="top">
    <PersonalInfo />  <!-- 个人信息组件 -->
  </template>
  <slot
    name="sidebar-bottom"
    slot="bottom"/>
</Sidebar>
```

**修改后代码**：
```vue
<Sidebar
  :items="sidebarItems"
  @toggle-sidebar="toggleSidebar">
  <!-- 已移除个人信息组件 -->
  <slot
    name="sidebar-bottom"
    slot="bottom"/>
</Sidebar>
```

**功能说明**：
- 该修改用于移除侧边栏顶部的个人信息组件
- 个人信息组件包含作者头像、名称、文章数和标签数统计
- 修改后侧边栏将不再显示这些个人信息

**注意事项**：
- 此修改直接修改了 node_modules 目录中的文件，升级主题版本后需要重新应用
- 如需长期移除该组件，建议使用主题的自定义覆盖机制或创建本地组件覆盖

#### 4.2 其他样式定制建议

1. **自定义全局样式**：在 `.vuepress/styles/index.styl` 中添加自定义样式
2. **覆盖主题组件**：在 `.vuepress/components/` 目录下创建同名组件覆盖默认组件
3. **使用 CSS 变量**：主题支持通过 CSS 变量自定义颜色、间距等样式

**示例**：修改主题主色调
```css
:root {
  --accent-color: #3eaf7c;  /* 主题主色调 */
  --text-color: #2c3e50;     /* 文本颜色 */
  --background-color: #fff;  /* 背景颜色 */
}
```

## 维护建议

1. 定期更新依赖，修复安全漏洞
2. 定期备份配置文件和重要内容
3. 遵循 Git 工作流，合理使用分支管理
4. 编写清晰的 commit 信息，便于追溯历史变更
5. 定期检查网站运行状态，确保正常访问

---

**更新时间**：2025-12-11
**维护人员**：Jiao
