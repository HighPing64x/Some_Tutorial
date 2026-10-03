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

## 添加文章

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
