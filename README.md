# Ozon / Wildberries 运营控制中心

这是一个部署在 Cloudflare Pages 上的轻量运营后台，采用“静态前端 + Pages Functions”架构，不需要前端打包。

## 主要功能

- Ozon 订单、商品、自然流量和广告费用分析
- Ozon / Wildberries 店铺接入与商品刊登
- AI 文案、商品图片和相似商品辅助
- Ozon 促销活动管理
- Ozon 每日关键词前 50 名快速监控、90 天排名历史，以及 Top 100、指定商品排名和销量坑产完整分析（Chrome 采集器 + Ozon Seller API，无需 MPStats API Token）
- 多账号登录、Cloudflare KV 缓存和店铺配置管理

## 目录

- `index.html`、`styles/`、`scripts/`：浏览器端页面
- `functions/api/`：Cloudflare Pages Functions API
- `scripts/dev-server.mjs`：本地零依赖开发服务器
- `scripts/publish.ps1`：提交并通过 SSH 推送到 GitHub
- `scripts/setup-github-ssh.ps1`：首次配置 Git、SSH 和自动推送
- `chrome-extension/ozon-ranking-collector/`：读取 Ozon 搜索页 MPStats 表格的本地 Chrome 采集器

## 本地运行

需要 Node.js 20 或更高版本。

```powershell
npm start
```

然后打开 `http://127.0.0.1:8787`。本地环境变量可在启动命令前设置；本地 KV 使用内存模拟，重启后清空。

运行基础检查：

```powershell
npm test
```

## 部署

本项目应由 Cloudflare Pages 直接连接 GitHub 仓库。构建配置：

```text
Production branch: main
Framework preset: None
Build command: exit 0
Build output directory: .
Root directory: 留空
```

项目根目录就是发布目录，不是 `app`。`exit 0` 是 Cloudflare 对无构建静态站点及 Pages Functions 的推荐配置。详细的 SSH、GitHub、Cloudflare 和环境变量配置见 [README_CLOUDFLARE_GITHUB.md](README_CLOUDFLARE_GITHUB.md)。

## 安全要求

- 私钥、`.env*`、`.dev.vars`、Cloudflare Token、Ozon/WB/OpenAI 密钥不得提交到 GitHub。
- 生产环境必须配置独立的 `AUTH_SESSION_SECRET`，并在 Cloudflare 中把敏感值保存为 Secret。
- `CONTROL_CENTER_USERS` 当前包含可逆的明文密码，仅适合受控的小团队；后续应升级为密码哈希或外部身份认证。
