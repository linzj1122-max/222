# Cloudflare Pages 部署速查

本项目直接从仓库根目录发布：

```text
Production branch: main
Framework preset: None
Build command: exit 0
Build output directory: .
Root directory: 留空
```

Cloudflare Pages 会自动发布根目录中的 `index.html`、`styles/`、`scripts/`，并把根目录中的 `functions/` 注册为 Pages Functions。

完整的 GitHub SSH、自动推送、环境变量、KV 和部署验证说明见 [README_CLOUDFLARE_GITHUB.md](README_CLOUDFLARE_GITHUB.md)。
