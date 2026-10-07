# 一些新手指南

基于 Astro 的静态 Markdown 博客，适用于 GitHub Pages。文章由 `src/content/blog/` 管理，搜索索引在构建时由 Pagefind 生成。

## 本地预览

需要 Node.js 22.12 或更新版本。

```sh
npm install
npm run dev
```

打开终端显示的本地地址即可预览。正式构建和本地预览：

```sh
npm run build
npm run preview
```

## 导入文章

可以继续在被忽略的 `temp/` 里写草稿，不需要手动搬图片。确保 Markdown 和图片都在同一个文章目录中，图片使用相对路径，例如 `![截图](image/1/screen.png)`。

先预演，确认目标文件和图片列表：

```sh
npm run article:import:preview -- "temp/文章目录/1.md"
```

确认后去掉 `--dry-run` 正式导入：

```sh
npm run article:import -- "temp/文章目录/1.md"
```

Windows PowerShell 中，如果目录名包含中文弯引号 `“”`，请用 ASCII 单引号包裹完整路径，例如：

```powershell
npm run article:import -- 'temp/004 “Styles破解”病毒解析/1.md'
```

需要手动设置简短摘要时，直接运行导入脚本：

```powershell
node scripts/import-article.mjs --article-description "简短摘要" 'temp/文章目录/1.md'
```

命令会读取一级标题作为文章标题、生成摘要和日期、复制本地图片并改写图片链接；段内单回车会自动转换为 Markdown 硬换行，`’` 会映射为反引号，空行和代码围栏保持不变。原始草稿不会被修改。生成后可编辑 frontmatter 中的分类、网址文件名、`pinned` 置顶选项和 `draft` 草稿选项。

再次导入同标题文章会更新已有文章并保留原网址，不会新增副本。标题变了但仍是同一篇文章时，用 `--update-slug` 指定旧网址，避免新建重复页面：

```powershell
node scripts/import-article.mjs --update-slug wpf-launcher-guide 'temp/002 如何使用WPFLauncher/1.md'
```

如果历史上已经有多个同标题文件，预演会提示路径；用 `node scripts/import-article.mjs --slug 原有网址名 "temp/文章目录/1.md"` 处理。

首页顺序为置顶优先、发布日期从新到旧；同一发布日期按标题固定排序。需要控制同一天内的先后时，可以在 `pubDate` 中填写时间，例如 `2026-10-03T18:00:00+08:00`。

导入后运行 `npm run dev` 预览。需要发布时，将生成的 `src/content/blog/` 文章及其 `assets/` 图片提交并推送到 `main`，GitHub Actions 会自动更新网站。

## 手动添加文章

在 `src/content/blog/` 新建 `.md` 文件，开头填写：

```yaml
---
title: "文章标题"
description: "简短摘要"
pubDate: 2026-10-03
category: "分类"
pinned: false
---
```

例如新建 `src/content/blog/my-first-article.md`，填写上面的信息，然后在 `---` 之后用标准 Markdown 写标题、段落、列表和正文。保存后运行 `npm run dev` 预览；正式搜索索引会在 `npm run build` 时更新。

需要置顶时，将 `pinned` 改为 `true`；置顶文章会排在列表前面，同组内仍按日期从新到旧排列。普通文章设为 `false` 或删掉这一行即可。草稿可设置 `draft: true`，草稿不会发布。

## 添加图片

把图片放进 `public/images/`，在文章中使用相对链接：

```markdown
![图片说明](../../images/图片文件名.jpg)
```

支持浏览器可显示的常用图片格式。

## 发布到 GitHub Pages

1. 将项目推送到 GitHub 仓库的 `main` 分支。
2. 在仓库的 **Settings → Pages → Build and deployment** 中，将 **Source** 设为 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 会自动构建并发布网站；以后推送到 `main` 时会自动更新。

项目站点会根据 `GITHUB_REPOSITORY` 自动设置仓库子路径；`username.github.io` 用户站点使用根路径。若默认分支不是 `main`，请同步修改工作流中的分支名。
