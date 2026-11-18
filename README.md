# 白昃战略研究院网站改版预览

公开页面由 GitHub Pages 托管。研究院概况直接呈现所提供的完整中英文正文，并设有图文资料。新闻、科研成果和学术活动可以站内浏览，期刊和公众号等外部来源保留入口。部分历史报道正文和图片原件待校方提供。

网站由 Node.js 生成静态 HTML，无需安装依赖。维护人员可更新公开的 `内容底稿.json` 和 `展示配置.json`，再在 PowerShell 生成 GitHub Pages 文件。

```powershell
$env:BISS_TARGET = 'github'
$env:BISS_BASE_PATH = '/baize-institute-site/'
node build.mjs
```

将生成的 `docs` 和公开源文件提交到 `main` 后，GitHub Pages 会重新发布。团队使用 V2 管理文章时，可将本地导出的备份路径作为 `build.mjs` 的参数，生成只含已发布内容的页面。完整备份、草稿和内部审核记录保存在本地。

切换学校域名前，先补齐历史正文和附件，然后核对原有文章地址与生成目录里的跳转清单。
