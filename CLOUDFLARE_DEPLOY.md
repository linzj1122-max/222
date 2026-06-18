# Cloudflare Pages + Functions 部署说明

## 部署方式

在 Cloudflare Dashboard 中创建 Pages 项目，上传本项目的 Cloudflare 部署包。

发布目录保持根目录即可，因为包内根目录包含：

- `index.html`
- `styles/main.css`
- `scripts/main.js`
- `functions/api/[[path]].js`

Cloudflare Pages 会自动识别 `functions/` 目录。

## 环境变量配置

推荐使用分组变量，避免 JSON 被平台自动改写。

在 Cloudflare Pages 项目中进入：

`Settings -> Environment variables`

添加：

```text
OZON_STORE_1_NAME=ИП Никитина Н.С.1
OZON_STORE_1_CLIENT_ID=4897866
OZON_STORE_1_API_KEY=第一个店铺的 API Key

OZON_STORE_2_NAME=ИП Никитина Н.С.2
OZON_STORE_2_CLIENT_ID=4898089
OZON_STORE_2_API_KEY=第二个店铺的 API Key
```

不要把两个店铺都写成同一个变量名。

## 自检地址

部署后打开：

```text
/api/health
/api/debug
/api/products
/api/orders
```

`/api/debug` 不会返回密钥，只会显示是否配置成功。

## 广告接口

广告接口暂时搁置：

```text
/api/ads/daily-products
```

当前返回空数组，不返回模拟广告。
