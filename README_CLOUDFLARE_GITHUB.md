# Cloudflare Pages + GitHub 部署说明

这个项目建议用 Cloudflare Pages 连接 GitHub 部署。以后修改代码后，只需要推送到 GitHub，Cloudflare 会自动重新部署。

## GitHub 上传内容

把整个项目上传到一个 GitHub 仓库即可，关键目录是：

- `app/`：网站前端页面
- `functions/`：Cloudflare Pages Functions 后端 API

Netlify 相关文件已经不再作为部署入口使用。

## Cloudflare Pages 设置

在 Cloudflare Dashboard：

1. 进入 `Workers & Pages`
2. 选择 `Create application`
3. 选择 `Pages`
4. 选择 `Connect to Git`
5. 授权并选择你的 GitHub 仓库

构建设置填写：

```text
Framework preset: None
Build command: 留空
Build output directory: app
Root directory: 留空
```

Cloudflare 会从项目根目录读取 `functions/` 目录，作为 `/api/*` 后端接口。

## 环境变量

部署后进入：

`Settings -> Environment variables`

添加以下变量：

```text
OZON_STORE_1_NAME=ИП Никитина Н.С.1
OZON_STORE_1_CLIENT_ID=4897866
OZON_STORE_1_API_KEY=第一个店铺的 Seller API Key
```

> `OZON_STORE_*` 对应 `api-seller.ozon.ru`，用于订单、产品成本、自然分析数据。
> 多店铺按 `OZON_STORE_2_*`、`OZON_STORE_3_*` 递增（最多到 `OZON_STORE_10_*`），
> 或用单个 JSON 变量 `OZON_STORES=[{"name":"...","clientId":"...","apiKey":"..."}]` 批量配置。

### 广告费用模块（Performance API）

广告费用走的是另一套 API（`api-performance.ozon.ru`），需要单独的 OAuth2 凭证，
**和店铺 Seller API Key 不是同一个东西**。请在 Ozon Performance / 推广后台申请后添加：

```text
OZON_ADS_1_NAME=ИП Никитина Н.С.1
OZON_ADS_1_CLIENT_ID=xxxxxxxx-xxxx@advertising.performance.ozon.ru
OZON_ADS_1_CLIENT_SECRET=对应的 client_secret
```

> 多个广告账号按 `OZON_ADS_2_*`、`OZON_ADS_3_*` 递增（最多到 `OZON_ADS_10_*`）。
> 配置后 `/api/debug` 里 `ads.enabled` 会变为 `true`，`/api/ads/daily-products` 才会返回真实广告数据。
> 首次拉取可能需要点一次"刷新 API 广告数据"按钮（带 `create=1`）来创建异步报表任务。

保存环境变量后，重新部署一次。

## 部署后检查

依次打开：

```text
/api/health
/api/debug
/api/products
/api/orders
```

正常情况下：

- `/api/health` 返回服务正常
- `/api/debug` 中 `ozon.storeCount` 应该是 `2`
- `/api/products` 返回产品成本表
- `/api/orders` 返回真实 Ozon 订单

广告 API 已接入（走 Performance API 的 OAuth2 + 异步报表）。
配置好 `OZON_ADS_*` 环境变量后，`/api/ads/daily-products` 会返回真实广告数据；
首次拉取可能需要带 `?create=1` 触发一次异步报表任务，之后会缓存。
