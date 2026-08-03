# GitHub SSH + Cloudflare Pages 自动部署

## 工作流

```text
本地修改 -> Git commit -> SSH push 到 GitHub main -> Cloudflare Pages 自动部署
```

Cloudflare 连接 GitHub 后，每次 `main` 分支收到新提交都会自动部署。不需要在 GitHub 保存 Cloudflare API Token。

## 1. 首次配置 GitHub SSH

准备一个已创建的 GitHub 仓库，取得 SSH 地址，例如：

```text
git@github.com:your-name/your-repo.git
```

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-github-ssh.ps1 `
  -Repository "git@github.com:your-name/your-repo.git" `
  -GitUserName "你的 GitHub 名称" `
  -GitUserEmail "你的 GitHub 邮箱"
```

脚本会：

1. 在用户 `.ssh` 目录生成该项目专用的 Ed25519 密钥（已有则复用）；
2. 初始化 `main` 分支、配置 SSH remote 和自动推送钩子；
3. 显示公钥。

把显示的整行公钥添加到 GitHub：`Settings -> SSH and GPG keys -> New SSH key`。私钥绝不能上传到 GitHub、Cloudflare或聊天窗口。

添加公钥后，执行首次发布：

```powershell
.\scripts\publish.ps1 -Message "Initial import"
```

以后每次更新只需执行：

```powershell
.\scripts\publish.ps1 -Message "说明本次修改"
```

脚本会自动暂存、提交并通过 SSH 推送。普通的 `git commit` 也会触发项目内的 `post-commit` 钩子自动推送；如果推送失败，本地提交仍会保留，可修复网络或权限后运行 `git push origin main`。

## 2. Cloudflare Pages 连接 GitHub

在 Cloudflare Dashboard 中进入 `Workers & Pages -> Create -> Pages -> Connect to Git`，选择上述仓库。

构建配置：

```text
Production branch: main
Framework preset: None
Build command: exit 0
Build output directory: .
Root directory: 留空
```

重要：本项目没有 `app/` 目录。`index.html` 和 `functions/` 都位于根目录，因此发布目录必须是项目根目录。Cloudflare 对不需要构建的静态站点推荐使用 `exit 0`，以正常启用 Pages Functions。

## 3. Cloudflare 环境变量与 Secret

至少配置登录账号和独立会话密钥：

```text
CREATOR_USERNAME=管理员账号
CREATOR_PASSWORD=管理员密码
AUTH_SESSION_SECRET=至少 32 字节的高强度随机值
```

店铺 Seller API：

```text
OZON_STORE_1_NAME=店铺名称
OZON_STORE_1_CLIENT_ID=Seller Client ID
OZON_STORE_1_API_KEY=Seller API Key

WB_STORE_1_NAME=店铺名称
WB_STORE_1_API_TOKEN=Wildberries API Token
```

Ozon Performance 广告 API（与 Seller API 凭证不同）：

```text
OZON_ADS_1_NAME=账号名称
OZON_ADS_1_CLIENT_ID=xxxxxxxx-xxxx@advertising.performance.ozon.ru
OZON_ADS_1_CLIENT_SECRET=Performance Client Secret
```

AI 刊登功能：

```text
OPENAI_API_KEY=API Key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_TEXT_MODEL=gpt-4o-mini
```

如需网页内增删店铺/员工，还要配置：

```text
CLOUDFLARE_ACCOUNT_ID=Cloudflare Account ID
CLOUDFLARE_PAGES_PROJECT_NAME=Pages 项目名
CLOUDFLARE_API_TOKEN=仅具备所需 Pages 编辑权限的 Token
```

敏感值应在 Cloudflare 中使用 Secret 类型。不要把真实值写入本项目。

可选：创建 KV namespace，并以 `LISTING_CACHE` 绑定到 Pages 项目，用于跨请求缓存。

## 4. 部署验证

部署完成后先检查：

```text
https://你的域名/api/health
```

应返回 `ok: true`。登录后再检查 `/api/debug`、订单、商品和广告页面。Cloudflare Dashboard 的 Deployments 页面应能看到对应 GitHub commit。

## 常见问题

- `Permission denied (publickey)`：公钥尚未添加到正确的 GitHub 账号，或该账号没有仓库写权限。
- GitHub 已更新但 Cloudflare 未部署：确认 Pages 连接的是同一仓库和 `main` 分支。
- 页面存在但 `/api/*` 404：确认输出目录是 `.`，并且仓库根目录中存在 `functions/`。
- 登录后频繁失效：确认所有部署环境使用固定且独立的 `AUTH_SESSION_SECRET`。
