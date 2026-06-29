/* =========================================================
 *  上架发布后端代理（Listing API）
 *  ---------------------------------------------------------
 *  独立模块，路由前缀 /api/listing/*
 *  不修改 functions/api/[[path]].js，与主 API 互不干扰。
 *
 *  路由：
 *    GET  /api/listing/categories?platform=Ozon&storeIndex=0   抓取并翻译类目
 *    POST /api/listing/generate-images                          调用 GPT-Image 生成电商图
 *    POST /api/listing/generate-copy                            生成标题/描述/标签
 *    POST /api/listing/publish                                  调用店铺 API 上传商品
 *    GET  /api/listing/health                                   健康检查
 *
 *  所需环境变量（在 Cloudflare / 本地 .dev.vars 配置）：
 *    OPENAI_API_KEY             OpenAI / 兼容网关的 API Key
 *    OPENAI_BASE_URL            可选，默认 https://api.openai.com/v1
 *    OPENAI_IMAGE_MODEL         可选，默认 gpt-image-1
 *    OPENAI_TEXT_MODEL          可选，默认 gpt-4o-mini
 *    OZON_STORE_<n>_NAME / _CLIENT_ID / _API_KEY    复用主 API 已有约定
 *    WB_API_TOKEN               WB 主 API Token
 * ========================================================= */

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const DEFAULT_TEXT_MODEL = "gpt-4o-mini";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    },
  });
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeText(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function authSecret(env) {
  const configured = env.AUTH_SESSION_SECRET || env.CONTROL_CENTER_SESSION_SECRET || env.SESSION_SECRET;
  if (configured) return String(configured);
  const users = String(env.CONTROL_CENTER_USERS || env.AUTH_USERS || "");
  return [users, env.CREATOR_PASSWORD, env.ADMIN_PASSWORD, env.CLOUDFLARE_API_TOKEN].filter(Boolean).join(":") || "local-dev-session-secret";
}

function normalizeAuthRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "creator" || role === "admin") return "owner";
  return role || "member";
}

function addAuthUser(users, raw, fallbackRole = "member") {
  if (!raw) return;
  const username = String(raw.username || raw.user || raw.name || "").trim();
  const password = String(raw.password || raw.pass || "").trim();
  if (!username || !password) return;
  users.push({
    username,
    password,
    name: String(raw.displayName || raw.label || raw.name || username),
    role: normalizeAuthRole(raw.role || fallbackRole),
  });
}

function authUsers(env) {
  const users = [];
  for (const key of ["CONTROL_CENTER_USERS", "AUTH_USERS"]) {
    const raw = env[key];
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => addAuthUser(users, item));
      } else if (parsed && typeof parsed === "object") {
        Object.entries(parsed).forEach(([username, value]) => {
          if (typeof value === "string") addAuthUser(users, { username, password: value });
          else addAuthUser(users, { username, ...(value || {}) });
        });
      }
    } catch {
      // Invalid auth JSON simply means no users are loaded from that variable.
    }
  }
  addAuthUser(users, {
    username: env.CREATOR_USERNAME || env.OWNER_USERNAME,
    password: env.CREATOR_PASSWORD || env.OWNER_PASSWORD,
    name: env.CREATOR_DISPLAY_NAME || env.OWNER_DISPLAY_NAME || "Creator",
    role: "owner",
  }, "owner");
  addAuthUser(users, {
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
    name: env.ADMIN_DISPLAY_NAME || "Admin",
    role: "owner",
  }, "owner");
  const seen = new Set();
  return users.filter((user) => {
    const key = user.username.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function authTokenFromRequest(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  const cookie = request.headers.get("cookie") || "";
  const cookieMatch = cookie.match(/(?:^|;\s*)cc_session=([^;]+)/);
  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : "";
}

async function verifyAuth(request, env) {
  const token = authTokenFromRequest(request);
  if (!token) return { ok: false, status: 401, error: "请先登录。" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, status: 401, error: "登录已失效，请重新登录。" };
  const signingInput = `${parts[0]}.${parts[1]}`;
  const expected = await hmacSha256(authSecret(env), signingInput);
  if (expected !== parts[2]) return { ok: false, status: 401, error: "登录已失效，请重新登录。" };
  let payload = null;
  try { payload = JSON.parse(base64UrlDecodeText(parts[1])); } catch { payload = null; }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub || Number(payload.exp || 0) <= now) {
    return { ok: false, status: 401, error: "登录已过期，请重新登录。" };
  }
  const user = authUsers(env).find((item) => item.username === payload.sub);
  if (!user) return { ok: false, status: 401, error: "账号已被停用，请重新登录。" };
  return { ok: true, user: { username: user.username, name: user.name, role: user.role } };
}

function amount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function hasValue(value) {
  return Array.isArray(value) ? value.length > 0 : String(value ?? "").trim() !== "";
}

function compactText(value, limit = 0) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return limit ? text.slice(0, limit) : text;
}

function splitLines(value, limit = 20) {
  return String(value || "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildRichContent(draft) {
  const title = compactText(draft.title || draft.model || draft.code, 500);
  const bullets = [
    ...splitLines(draft.sellingPoints || draft.description, 8),
    ...splitLines(draft.params, 8),
  ].filter(Boolean).slice(0, 10);
  const blocks = [];
  if (title) {
    blocks.push({ type: "text", content: [{ type: "text", text: title }] });
  }
  if (bullets.length) {
    blocks.push({
      type: "list",
      content: bullets.map((text) => ({ type: "list_item", content: [{ type: "text", text }] })),
    });
  }
  const description = compactText(draft.description, 3000);
  if (description) {
    blocks.push({ type: "text", content: [{ type: "text", text: description }] });
  }
  return JSON.stringify({ version: 1, blocks });
}

function autoAttrValue(attr, draft) {
  const name = `${attr.name || ""} ${attr.description || ""}`.toLowerCase();
  if (/rich|content|контент|рич/.test(name)) return buildRichContent(draft);
  if (/аннотац|описан|description|desc/.test(name)) return draft.description || draft.sellingPoints || draft.params || "";
  if (/ключ|поиск|search|tag|тег/.test(name)) return splitLines(draft.tags, 20).join("; ");
  if (/бренд|brand/.test(name)) return draft.brand || "";
  if (/модель|model/.test(name)) return draft.model || draft.code || "";
  if (/артикул|sku|offer/.test(name)) return draft.offerId || draft.code || "";
  if (/назван|title|name/.test(name)) return draft.title || draft.model || "";
  if (/материал|material/.test(name)) {
    const material = String(draft.params || "").match(/(?:материал|material|材质)\s*[:：]\s*([^;\n,，]+)/i);
    return material?.[1]?.trim() || "";
  }
  return "";
}

function attrValueItems(attr, rawValue) {
  const list = Array.isArray(rawValue) ? rawValue : String(rawValue ?? "").split(";").map((v) => v.trim()).filter(Boolean);
  const values = Array.isArray(attr.values) ? attr.values : [];
  return list.filter(Boolean).map((value) => {
    const matched = values.find((item) => String(item.value) === String(value) || String(item.id) === String(value));
    return {
      dictionary_value_id: matched?.id ? Number(matched.id) : 0,
      value: String(matched?.value || value),
    };
  });
}

function buildOzonAttributePayload(draft, definitions, extraAttrValues = {}) {
  const attrValues = { ...(draft.attrValues || {}), ...(extraAttrValues || {}) };
  return (definitions || [])
    .map((attr) => ({ ...attr, _value: hasValue(attrValues[attr.id]) ? attrValues[attr.id] : autoAttrValue(attr, draft) }))
    .filter((attr) => attr && attr.id && hasValue(attr._value))
    .map((attr) => ({
      complex_id: Number(attr.complexId || attr.complex_id || 0),
      id: Number(attr.id),
      values: attrValueItems(attr, attr._value),
    }))
    .filter((attr) => attr.values.length);
}

function attrNameKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function findAttributeForVariantDimension(definitions, dimensionName) {
  const key = attrNameKey(dimensionName);
  if (!key) return null;
  const aliases = {
    color: ["color", "colour", "цвет", "颜色", "цвет товара"],
    "颜色": ["color", "colour", "цвет", "颜色", "цвет товара"],
    "цвет": ["color", "colour", "цвет", "颜色", "цвет товара"],
    size: ["size", "размер", "尺码", "размер изделия"],
    "尺码": ["size", "размер", "尺码", "размер изделия"],
    "размер": ["size", "размер", "尺码", "размер изделия"],
  };
  const wanted = aliases[key] || [key];
  return (definitions || []).find((attr) => {
    const name = attrNameKey(`${attr.name || ""} ${attr.description || ""}`);
    return wanted.some((item) => name === item || name.includes(item));
  }) || null;
}

function variantAttributeValues(variant, definitions) {
  const out = {};
  const explicit = variant?.attrValues && typeof variant.attrValues === "object" ? variant.attrValues : {};
  Object.assign(out, explicit);
  const values = variant?.values && typeof variant.values === "object" ? variant.values : {};
  Object.entries(values).forEach(([dimension, value]) => {
    const attr = findAttributeForVariantDimension(definitions, dimension);
    if (attr?.id && hasValue(value)) out[attr.id] = value;
  });
  return out;
}

function normalizeTemplateAttribute(attr) {
  const values = Array.isArray(attr.values) ? attr.values.map((v) => ({ id: Number(v.id || 0), value: String(v.value || "") })).filter((v) => v.value) : [];
  return {
    id: Number(attr.id || 0),
    name: String(attr.name || ""),
    description: String(attr.description || ""),
    isRequired: Boolean(attr.isRequired),
    type: String(attr.type || "String"),
    isCollection: Boolean(attr.isCollection),
    maxValueCount: Number(attr.maxValueCount || 0),
    complexId: Number(attr.complexId || 0),
    complexName: String(attr.complexName || ""),
    dictionary: values.length ? 1 : Number(attr.dictionary || 0),
    values,
    source: attr.source || "xlsx-template",
  };
}

function extractBalancedJsonObject(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = text.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parse1688Context(html) {
  const raw = extractBalancedJsonObject(html, "window.contextPath,");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function parse1688OfferDetails(html) {
  const raw = extractBalancedJsonObject(html, "window.offer_details");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function uniqList(list, limit = 100) {
  return [...new Set((list || []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))].slice(0, limit);
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractImageUrls(value) {
  const text = htmlDecode(value);
  return uniqList([...text.matchAll(/https?:\/\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp)(?:_[a-z]+)?/gi)].map((m) => m[0]), 80);
}

function attrPairsFromCpv(cpv) {
  const rows = [];
  const add = (items) => {
    (Array.isArray(items) ? items : []).forEach((item) => {
      const name = compactText(item?.name || item?.propertyName || "");
      const values = Array.isArray(item?.values) ? item.values : [item?.value].filter(Boolean);
      const value = values.map((v) => compactText(v)).filter(Boolean).join("; ");
      if (name && value) rows.push({ name, value });
    });
  };
  add(cpv?.decisionCpv);
  add(cpv?.normalCpv);
  return rows;
}

function firstPrice(model) {
  const fields = model || {};
  const candidates = [
    fields.priceModel?.currentPrices?.[0]?.price,
    fields.finalPriceModel?.tradeWithoutPromotion?.offerPriceDisplay,
    fields.priceModel?.originalPriceDisplay,
    fields.finalPriceModel?.tradeWithoutPromotion?.offerMinPrice,
  ];
  return candidates.map(amount).find((n) => n > 0) || 0;
}

function parse1688ProductFromContext(context, html, sourceUrl) {
  const data = context?.result?.data || {};
  const titleFields = data.productTitle?.fields || {};
  const galleryFields = data.gallery?.fields || {};
  const priceFields = data.mainPrice?.fields || {};
  const packFields = data.productPackInfo?.fields || {};
  const shippingFields = data.shippingServices?.fields || {};
  const cpv = galleryFields.CpvEnhance || {};
  const attrs = attrPairsFromCpv(cpv);
  const attrMap = new Map(attrs.map((item) => [item.name, item.value]));
  const skuRows = priceFields.finalPriceModel?.tradeWithoutPromotion?.skuMapOriginal || [];
  const packRows = packFields.pieceWeightScale?.pieceWeightScaleInfo || [];
  const sku = skuRows[0] || {};
  const pack = packRows[0] || {};
  const price = firstPrice(priceFields);
  const shipping = amount(shippingFields.freightInfo?.totalCost);
  const offerDetails = parse1688OfferDetails(html);
  const detailImages = extractImageUrls(offerDetails?.content || "");
  const galleryImages = uniqList([...(galleryFields.mainImage || []), ...(galleryFields.offerImgList || [])], 20);
  const productName = attrMap.get("产品名称") || attrMap.get("商品名称") || titleFields.title || galleryFields.subject || "";
  const spec = attrMap.get("产品规格") || sku.specAttrs || pack.sku1 || "";
  const weight = amount(pack.weight) || amount(shippingFields.freightInfo?.skuWeight?.[sku.skuId]) * 1000 || 0;
  const dimensions = {
    length: amount(pack.length) ? amount(pack.length) * 10 : 0,
    width: amount(pack.width) ? amount(pack.width) * 10 : 0,
    height: amount(pack.height) ? amount(pack.height) * 10 : 0,
  };
  return {
    ok: true,
    source: "1688",
    sourceUrl,
    offerId: String(galleryFields.offerId || titleFields.editUrl?.match(/offerId=(\d+)/)?.[1] || ""),
    title: compactText(titleFields.title || galleryFields.subject || productName, 500),
    productName: compactText(productName, 300),
    brand: compactText(attrMap.get("品牌") || titleFields.tagList?.[0]?.brandText || "", 120),
    code: compactText(attrMap.get("货号") || sku.skuId || "", 80),
    model: compactText(spec || productName, 200),
    spec: compactText(spec, 300),
    unit: compactText(titleFields.unit || priceFields.unit || "", 20),
    price,
    originalPrice: amount(priceFields.priceModel?.originalPrices?.[0]?.price || priceFields.priceModel?.originalPriceDisplay),
    shipping,
    purchaseCost: Math.round((price + shipping) * 100) / 100,
    stock: amount(sku.canBookCount),
    weight,
    ...dimensions,
    attributes: attrs,
    images: galleryImages,
    detailImages,
    variants: skuRows.map((row) => ({
      skuId: String(row.skuId || ""),
      spec: compactText(row.specAttrs || ""),
      price,
      stock: amount(row.canBookCount),
      weight: amount((packRows.find((item) => String(item.skuId) === String(row.skuId)) || {}).weight),
    })),
    rawHints: {
      targetLocation: compactText(shippingFields.targetLocation || shippingFields.freightInfo?.recieveAddress || ""),
      freightText: shipping ? `另需运费(预估): ¥${shipping}` : "",
    },
  };
}

async function import1688Product(body) {
  const sourceUrl = String(body?.url || "").trim();
  if (!/^https:\/\/detail\.1688\.com\/offer\/\d+\.html/i.test(sourceUrl)) {
    return { ok: false, error: "请填写 1688 商品详情链接，例如 https://detail.1688.com/offer/xxxx.html" };
  }
  const res = await fetch(sourceUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "referer": "https://www.1688.com/",
    },
  });
  const html = await res.text();
  if (!res.ok || !html) return { ok: false, error: `1688 页面读取失败:${res.status}` };
  if (/_____tmd_____\/punish|x5secdata|punish\?/.test(html)) {
    return { ok: false, error: "1688 对云端抓取返回了验证页。请在已登录浏览器中打开商品页后，用浏览器抓取兜底导入。" };
  }
  if (/验证码|滑块|login|登录/.test(html) && !html.includes("window.context")) {
    return { ok: false, error: "1688 要求登录或验证码，后端暂时无法直接抓取。请先在浏览器打开该链接后再试。" };
  }
  const context = parse1688Context(html);
  if (!context?.result?.data) return { ok: false, error: "未解析到 1688 商品结构化数据，可能被反爬或页面结构变化。" };
  return parse1688ProductFromContext(context, html, sourceUrl);
}

function templateKvKeys(template) {
  const keys = [];
  const name = String(template?.name || "").trim();
  if (name) keys.push(`template:name:${name}`);
  if (template?.categoryId && template?.typeId) keys.push(`template:cat:${template.categoryId}:${template.typeId}`);
  return keys;
}

function cacheIdPart(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._:-]+/g, "_").slice(0, 80);
}

function storeCacheId(platform, store) {
  const pf = cacheIdPart(platform || "ozon").toLowerCase();
  const id = store?.clientId || store?.name || "default";
  return `${pf}:${cacheIdPart(id)}`;
}

function flowCacheKey(platform, store, offerId, kind) {
  return `flow:${storeCacheId(platform, store)}:${cacheIdPart(offerId)}:${cacheIdPart(kind)}`;
}

async function kvGetJson(env, key) {
  if (!env.LISTING_CACHE || !key) return null;
  try { return await env.LISTING_CACHE.get(key, "json"); } catch { return null; }
}

async function kvPutJson(env, key, value, ttl = 60 * 60 * 24 * 30) {
  if (!env.LISTING_CACHE || !key) return false;
  try {
    await env.LISTING_CACHE.put(key, JSON.stringify({ ...value, cachedAt: new Date().toISOString() }), { expirationTtl: ttl });
    return true;
  } catch {
    return false;
  }
}

function openaiBaseUrl(env) {
  return String(env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE).replace(/\/$/, "");
}

function ozonStores(env) {
  const stores = [];
  for (let index = 1; index <= 50; index += 1) {
    const name = env[`OZON_STORE_${index}_NAME`];
    const clientId = env[`OZON_STORE_${index}_CLIENT_ID`];
    const apiKey = env[`OZON_STORE_${index}_API_KEY`];
    if (clientId && apiKey) {
      stores.push({ index: index - 1, envNumber: index, name: name || `Ozon 店铺 ${index}`, clientId, apiKey });
    }
  }
  if (env.OZON_STORES) {
    try {
      const parsed = JSON.parse(env.OZON_STORES);
      if (Array.isArray(parsed)) {
        parsed.forEach((item, index) => {
          if (item.clientId && item.apiKey) {
            stores.push({ index, envNumber: index + 1, name: item.name || `Ozon 店铺 ${index + 1}`, clientId: item.clientId, apiKey: item.apiKey });
          }
        });
      }
    } catch {
      // 无效 JSON 忽略，与主 API 行为一致
    }
  }
  if (env.OZON_CLIENT_ID && env.OZON_API_KEY) {
    stores.push({ index: stores.length, envNumber: 0, name: env.OZON_STORE_NAME || "Ozon 店铺", clientId: env.OZON_CLIENT_ID, apiKey: env.OZON_API_KEY });
  }
  return stores;
}

function wbStores(env) {
  const stores = [];
  for (let index = 1; index <= 50; index += 1) {
    const name = env[`WB_STORE_${index}_NAME`];
    const token = env[`WB_STORE_${index}_API_TOKEN`] || env[`WB_STORE_${index}_TOKEN`];
    if (token) stores.push({ index: index - 1, envNumber: index, name: name || `WB 店铺 ${index}`, token });
  }
  if (env.WB_API_TOKEN) {
    stores.push({ index: stores.length, envNumber: 0, name: env.WB_STORE_NAME || "WB 店铺", token: env.WB_API_TOKEN });
  }
  return stores;
}

function storeList(env) {
  return [
    ...ozonStores(env).map((s, i) => ({ index: Number.isFinite(Number(s.index)) ? Number(s.index) : i, platform: "Ozon", name: s.name })),
    ...wbStores(env).map((s, i) => ({ index: Number.isFinite(Number(s.index)) ? Number(s.index) : i, platform: "WB", name: s.name })),
  ];
}

// 解析店铺凭证:安全模式下只从 Cloudflare 环境变量/Secrets 读取。
function resolveStore(env, headers, platform, storeIndex) {
  const pf = String(platform || "Ozon").toLowerCase();
  const targetIndex = Number(storeIndex);
  if (pf === "wb") {
    const stores = wbStores(env);
    return stores.find((store) => Number(store.index) === targetIndex) || null;
  }
  const stores = ozonStores(env);
  return stores.find((store) => Number(store.index) === targetIndex) || null;
}

// ---------- 类目抓取 ----------

async function fetchOzonCategoryTree(store, language = "ZH_HANS") {
  const response = await fetch("https://api-seller.ozon.ru/v1/description-category/tree", {
    method: "POST",
    headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
    body: JSON.stringify({ language }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Ozon 类目 API ${response.status}: ${text.slice(0, 240)}`);
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = {}; }
  const roots = Array.isArray(payload?.result) ? payload.result : [];
  const flat = [];
  // parentKey: 当前层级的父节点 id(用于正确串层级),namePath: 类目名路径(用于 fullName)
  const walk = (node, parentKey, namePath, depth, inheritedCategoryId = 0, inheritedCategoryName = "") => {
    if (!node || typeof node !== "object") return;
    const catId = node.description_category_id;
    const catName = node.category_name;
    const effectiveCategoryId = Number(catId || inheritedCategoryId || 0);
    const effectiveCategoryName = String(catName || inheritedCategoryName || "");
    const children = Array.isArray(node.children) ? node.children : [];
    let myKey = parentKey;
    if (catId !== undefined && catName) {
      myKey = `cat-${catId}`;
      flat.push({
        id: myKey,
        categoryId: Number(catId),
        typeId: 0,
        name: String(catName),
        fullName: [...namePath, catName].join(" / "),
        parentId: parentKey,
        childrenCount: children.length,
        isLeaf: false,
        depth,
      });
    }
    if (node.type_id !== undefined && node.type_name) {
      const typeKey = `type-${effectiveCategoryId || "unknown"}-${node.type_id}`;
      const fullPath = catName
        ? [...namePath, catName, String(node.type_name)]
        : [...namePath, String(node.type_name)];
      flat.push({
        id: typeKey,
        categoryId: effectiveCategoryId,
        typeId: Number(node.type_id),
        name: String(node.type_name),
        fullName: fullPath.join(" / "),
        parentId: myKey,
        childrenCount: 0,
        isLeaf: true,
        disabled: Boolean(node.disabled),
        depth,
      });
    }
    children.forEach((child) => walk(child, myKey, catName ? [...namePath, catName] : namePath, depth + 1, effectiveCategoryId, effectiveCategoryName));
  };
  roots.forEach((root) => walk(root, "0", [], 0, 0, ""));
  return flat;
}

async function fetchWBCategories(store) {
  const response = await fetch("https://content-api.wildberries.ru/content/v2/object/all?name=&limit=300", {
    method: "GET",
    headers: { Authorization: store.token, "content-type": "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`WB 类目 API ${response.status}: ${text.slice(0, 240)}`);
  const payload = JSON.parse(text);
  const data = payload?.data || [];
  return data.map((node) => ({
    id: String(node.id ?? node.objectID ?? ""),
    name: String(node.name ?? node.objectName ?? ""),
    parentId: String(node.parentID ?? "0"),
    childrenCount: Array.isArray(node.child) ? node.child.length : 0,
  }));
}

function dedupeCategories(items) {
  const seen = new Map();
  items.forEach((item) => {
    if (!item.id) return;
    if (!seen.has(item.id) || (item.childrenCount > 0 && seen.get(item.id).childrenCount === 0)) {
      seen.set(item.id, item);
    }
  });
  return [...seen.values()];
}

async function translateBatch(env, texts) {
  const cleaned = [...new Set(texts.map((t) => String(t || "").trim()).filter(Boolean))];
  if (!cleaned.length) return {};
  if (!env.OPENAI_API_KEY) {
    const map = {};
    cleaned.forEach((t) => { map[t] = t; });
    return map;
  }
  const body = {
    model: env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    messages: [
      { role: "system", content: "你是电商本地化翻译引擎。把输入的俄文/英文类目名翻译成简体中文商品类目名,简洁、贴近电商习惯。只输出 JSON,不要解释。" },
      { role: "user", content: `请把下面的类目列表翻译成中文,并按原样返回 JSON 对象 {"原文":"中文"}:\n${JSON.stringify(cleaned)}` },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };
  const response = await fetch(`${openaiBaseUrl(env)}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`翻译 API ${response.status}: ${err.slice(0, 200)}`);
  }
  const payload = await response.json();
  let map = {};
  try {
    map = JSON.parse(payload?.choices?.[0]?.message?.content || "{}");
  } catch {
    map = {};
  }
  cleaned.forEach((t) => { if (!map[t]) map[t] = t; });
  return map;
}

// ---------- 类目云端缓存(Cloudflare KV) ----------
// KV 绑定名:env.LISTING_CACHE(在 Cloudflare Pages 设置里绑定)。
// 命中 KV 直接返回,不调 Ozon/WB;未绑定 KV 时优雅降级为每次抓取。
// key 规则:cat:<平台>:<店铺clientId 或 token 标识>
// TTL 5 年 ≈ 永久:Ozon/WB 类目极少变化,首次抓取后基本不需要重抓;
// 如需重抓,在「商品上架」页点击「↻ 刷新类目」按钮,会主动清除 KV 缓存并重新拉取。
const CAT_KV_TTL = 60 * 60 * 24 * 365 * 5; // 5 年（实际永久）

function catKvKey(platform, store) {
  const idPart = store.clientId || store.token || "default";
  return `cat:${platform}:${idPart}`;
}

async function kvGetCategories(env, platform, store) {
  if (!env.LISTING_CACHE) return null;
  try {
    const raw = await env.LISTING_CACHE.get(catKvKey(platform, store), "json");
    return raw && Array.isArray(raw.categories) ? raw : null;
  } catch {
    return null;
  }
}

async function kvPutCategories(env, platform, store, payload) {
  if (!env.LISTING_CACHE) return;
  try {
    await env.LISTING_CACHE.put(catKvKey(platform, store), JSON.stringify(payload), { expirationTtl: CAT_KV_TTL });
  } catch {
    // 写入失败不阻塞
  }
}

async function kvDeleteCategories(env, platform, store) {
  if (!env.LISTING_CACHE) return false;
  try {
    await env.LISTING_CACHE.delete(catKvKey(platform, store));
    return true;
  } catch {
    return false;
  }
}

// 实际抓取类目(不经过缓存),供 getCategories 调用
async function fetchCategoriesFromSource(env, platform, store, translate) {
  let raw = [];
  let nativeChinese = false;
  if (platform === "wb") {
    raw = await fetchWBCategories(store);
  } else {
    raw = await fetchOzonCategoryTree(store, "ZH_HANS");
    nativeChinese = true;
  }
  let items = dedupeCategories(raw);
  let translationMap = {};
  if (translate && !nativeChinese) {
    try { translationMap = await translateBatch(env, items.map((i) => i.name)); } catch { translationMap = {}; }
  }
  const categories = items.map((item) => {
    const zh = nativeChinese
      ? (item.fullName || item.name)
      : (translationMap[item.name] || item.name);
    return {
      ...item,
      nameZh: zh,
      displayName: item.fullName || item.name,
      childrenCount: Number(item.childrenCount || 0),
    };
  });
  return { categories, nativeChinese };
}

async function getCategories(env, searchParams, headers = {}) {
  const platform = String(searchParams.get("platform") || "Ozon").toLowerCase();
  const storeIndex = Number(searchParams.get("storeIndex") || "0");
  const translate = searchParams.get("translate") !== "0";
  const forceRefresh = searchParams.get("refresh") === "1";

  const store = resolveStore(env, headers, platform, storeIndex);
  if (platform === "wb") {
    if (!store) return { ok: false, error: "未配置 WB 店铺,请在「店铺设置」添加,或在环境变量配置 WB_API_TOKEN", categories: [] };
  } else {
    if (!store) return { ok: false, error: "未配置 Ozon 店铺,请在「店铺设置」添加,或在环境变量配置 OZON_STORE_1_CLIENT_ID / API_KEY", categories: [] };
  }
  const storeName = store.name;

  // 1. 先读云端 KV 缓存(非强制刷新时)
  if (!forceRefresh) {
    const cached = await kvGetCategories(env, platform, store);
    if (cached) {
      return {
        ok: true,
        platform: platform === "wb" ? "WB" : "Ozon",
        storeName: cached.storeName || storeName,
        nativeChinese: cached.nativeChinese,
        count: cached.categories.length,
        maxDepth: cached.maxDepth || detectMaxDepth(cached.categories),
        categories: cached.categories,
        cachedAt: cached.ts,
        source: "cloud-kv",
      };
    }
  }

  // 2. 缓存未命中 / 强制刷新 → 实际抓取
  const { categories, nativeChinese } = await fetchCategoriesFromSource(env, platform, store, translate);
  const maxDepth = detectMaxDepth(categories);   // 诊断:实际类目最大层级
  const payload = {
    platform: platform === "wb" ? "WB" : "Ozon",
    storeName,
    nativeChinese,
    categories,
    maxDepth,
    ts: Date.now(),
  };
  // 3. 写回 KV 供全局共享
  await kvPutCategories(env, platform, store, payload);

  return { ok: true, ...payload, count: categories.length, source: "fresh" };
}

// 诊断:统计类目 fullName 按 "/" 分列后的最大层级数
function detectMaxDepth(categories) {
  let max = 0;
  for (const c of categories) {
    const segs = String(c.fullName || c.nameZh || c.name || "").split("/").filter(Boolean);
    if (segs.length > max) max = segs.length;
  }
  return max;
}

// ---------- AI 生图 ----------

function buildImagePrompt(product) {
  const title = product.title || product.model || product.name || "产品";
  const category = product.categoryZh || product.category || "";
  const brand = product.brand || "";
  const size = product.size || "";
  const weight = product.weight || "";
  const params = product.params || "";
  const sellingPoints = product.sellingPoints || "";

  return [
    `为「${title}」生成一组 Ozon/俄罗斯电商平台主图,共 9 张图(封面1 + 展示2 + 卖点3 + 细节1 + 说明1 + 详情1),整套色调风格一致,商业级精修。`,
    category ? `类目:${category}。` : "",
    brand ? `品牌:${brand}。` : "",
    size ? `尺寸:${size}。` : "",
    weight ? `重量:${weight}。` : "",
    params ? `参数:${params}。` : "",
    sellingPoints ? `核心卖点:${sellingPoints}。` : "",
    `要求:封面图抓眼球且突出产品主体,带符合应用场景的使用者;展示图清晰展示产品全貌与使用场景;卖点图用 2~3 个不同卖点对照展示;细节图聚焦材质/接口;使用说明图含简明图示;详情图汇总参数。`,
    `画面里出现的所有文案、标签、按钮必须是地道俄文(俄语)。构图干净,白底或浅场景,无错别字,无伪文字。`,
    `严格保持产品外观与参考图一致。`,
  ].filter(Boolean).join("\n");
}

async function generateImages(env, body) {
  if (!env.OPENAI_API_KEY) {
    return { ok: false, error: "未配置 OPENAI_API_KEY,无法调用 GPT-Image。请在 Cloudflare 环境变量配置 OPENAI_API_KEY。" };
  }
  const product = body?.product || {};
  const referenceImages = Array.isArray(body?.referenceImages) ? body.referenceImages : [];
  const count = Math.min(Math.max(Number(body?.count) || 9, 1), 10);
  const prompt = buildImagePrompt(product);
  const imageModel = env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const baseUrl = openaiBaseUrl(env);

  const content = [{ type: "text", text: prompt }];
  referenceImages.slice(0, 4).forEach((dataUrl) => {
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
      content.push({ type: "image_url", image_url: { url: dataUrl } });
    }
  });

  const results = [];
  let lastError = "";
  for (let i = 0; i < count; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: imageModel,
          prompt: content[0].text + (i > 0 ? `\n(第 ${i + 1} 张,角色:${["封面主图", "展示图", "展示图", "卖点图", "卖点图", "卖点图", "细节图", "使用说明图", "产品详情图", "补充图"][i] || "补充图"})` : ""),
          n: 1,
          size: "1024x1536",
          quality: "high",
        }),
      });
      const text = await response.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch { payload = null; }
      if (!response.ok) {
        const errMsg = payload?.error?.message || text.slice(0, 200);
        lastError = errMsg;
        results.push({ index: i + 1, ok: false, error: errMsg });
        continue;
      }
      const item = payload?.data?.[0] || {};
      const url = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : "");
      results.push({ index: i + 1, ok: Boolean(url), url, revised_prompt: item.revised_prompt || "" });
    } catch (error) {
      lastError = error.message || String(error);
      results.push({ index: i + 1, ok: false, error: lastError });
    }
  }
  const successCount = results.filter((r) => r.ok).length;
  // 全部失败时返回 ok:false,让前端能看到真实错误
  if (successCount === 0) {
    return { ok: false, error: `生图失败(0/${count}):${lastError || "OpenAI 未返回图片,请检查 API Key、模型名(${imageModel})、额度"}`, prompt, results };
  }
  return { ok: true, prompt, count, results };
}

// ---------- AI 文案 ----------

function buildCopyPrompt(product) {
  return [
    "你是 Ozon / WB 资深俄文电商文案,根据产品信息生成上架所需的俄文标题、描述和标签。",
    "严格遵守:",
    "- 标题:60~110 字符,包含品牌/型号/核心卖点/适用场景,符合 Ozon/WB 搜索权重;",
    "- 描述:300~600 字符,卖点分点列出,自然融入关键词,地道俄文,带 emoji 与换行;",
    "- 标签:8~15 个逗号分隔的关键词短语(俄文)。",
    "输出 JSON: {\"title\":\"\",\"description\":\"\",\"tags\":\"\"}",
    "产品信息:",
    JSON.stringify({
      title: product.title || "",
      brand: product.brand || "",
      model: product.model || "",
      categoryZh: product.categoryZh || "",
      category: product.category || "",
      params: product.params || "",
      sellingPoints: product.sellingPoints || "",
      price: product.price || "",
      oldPrice: product.oldPrice || "",
    }, null, 2),
  ].join("\n");
}

async function generateCopy(env, body) {
  if (!env.OPENAI_API_KEY) {
    return { ok: false, error: "未配置 OPENAI_API_KEY,无法生成文案。请在 Cloudflare 环境变量配置。" };
  }
  const product = body?.product || {};
  const textModel = env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
  try {
    const response = await fetch(`${openaiBaseUrl(env)}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: textModel,
        messages: [
          { role: "system", content: "你是 Ozon/WB 资深俄文电商文案。" },
          { role: "user", content: buildCopyPrompt(product) },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = null; }
    if (!response.ok) {
      const errMsg = payload?.error?.message || text.slice(0, 240);
      return { ok: false, error: `文案生成失败(${textModel}):${errMsg}` };
    }
    let copy = {};
    try { copy = JSON.parse(payload?.choices?.[0]?.message?.content || "{}"); } catch { copy = {}; }
    return {
      ok: true,
      title: copy.title || "",
      description: copy.description || "",
      tags: copy.tags || "",
    };
  } catch (error) {
    return { ok: false, error: "文案生成失败:" + (error.message || String(error)) };
  }
}

// ---------- 发布 ----------

async function loadOzonAttributeDefinitions(store, draft) {
  const descriptionCategoryId = Number(draft.descriptionCategoryId) || 0;
  const typeId = Number(draft.typeId) || 0;
  let requiredAttrs = [];
  const templateAttrs = Array.isArray(draft.attrDefinitions) ? draft.attrDefinitions.map(normalizeTemplateAttribute).filter((a) => a.id) : [];
  if (!templateAttrs.length && descriptionCategoryId && typeId) {
    try {
      const fetched = await fetchOzonAttributeDefinitions(store, descriptionCategoryId, typeId);
      requiredAttrs = fetched.attributes.filter((a) => a.isRequired);
    } catch {
      // 属性拉取失败不阻塞发布,用户可在后台补全必填属性
    }
  }
  const fallbackAttrs = requiredAttrs.map((attr) => ({
    id: Number(attr.id),
    name: String(attr.name || ""),
    description: String(attr.description || ""),
    isRequired: Boolean(attr.isRequired || attr.is_required),
    type: String(attr.type || "String"),
    isCollection: Boolean(attr.isCollection || attr.is_collection),
    maxValueCount: Number(attr.maxValueCount || attr.max_value_count || 0),
    dictionary: Number(attr.dictionary || attr.dictionary_id || 0),
    complexId: Number(attr.complexId || attr.complex_id || 0),
    complexName: String(attr.complexName || attr.complex_name || ""),
    values: Array.isArray(attr.values) ? attr.values.map((v) => ({ id: Number(v.id || 0), value: String(v.value || "") })) : [],
  }));
  return templateAttrs.length ? templateAttrs : fallbackAttrs;
}

function normalizedVariants(draft) {
  if (!draft.variantsEnabled) return [];
  return (Array.isArray(draft.variants) ? draft.variants : [])
    .filter((variant) => variant && String(variant.offerId || "").trim())
    .slice(0, 100);
}

function buildOzonImportItem(draft, definitions, variant = null) {
  const images = (draft.images || []).filter(Boolean);
  const variantValues = variantAttributeValues(variant || {}, definitions);
  const offerId = String(variant?.offerId || draft.offerId || draft.code || `SKU-${Date.now()}`);
  const titleSuffix = variant?.values && Object.keys(variant.values).length
    ? ` ${Object.values(variant.values).filter(Boolean).join(" ")}`
    : "";
  return {
    name: String((variant?.title || draft.title || "") + titleSuffix).trim().slice(0, 500),
    offer_id: offerId,
    barcode: String(variant?.barcode || draft.barcode || ""),
    sku: 0,
    description_category_id: Number(draft.descriptionCategoryId) || 0,
    type_id: Number(draft.typeId) || 0,
    price: {
      price: String(variant?.price || draft.price || "0"),
      old_price: String(variant?.oldPrice || draft.oldPrice || ""),
      premium_price: "",
    },
    vat: "0",
    weight_g: Math.round(amount(variant?.weight || draft.weight) || 0),
    weight_unit: "g",
    dimensions: {
      length: String(variant?.length || draft.length || 0),
      width: String(variant?.width || draft.width || 0),
      height: String(variant?.height || draft.height || 0),
      unit: "mm",
    },
    primary_image: (variant?.images || []).filter(Boolean)[0] || images[0] || "",
    images: ((variant?.images || []).filter(Boolean).slice(1).concat(images.slice(1))).slice(0, 14),
    attributes: buildOzonAttributePayload(draft, definitions, variantValues),
  };
}

function preflightOzonItem(item, definitions) {
  const attrIds = new Set((item.attributes || []).map((attr) => Number(attr.id)));
  const requiredMissing = (definitions || [])
    .filter((attr) => attr.isRequired && !attrIds.has(Number(attr.id)))
    .map((attr) => attr.name || String(attr.id));
  const hasRich = (item.attributes || []).some((attr) => (attr.values || []).some((v) => /blocks|rich|content/i.test(String(v.value || ""))));
  const checks = [
    { key: "title", label: "标题", ok: Boolean(item.name), detail: item.name ? `${item.name.length} chars` : "missing" },
    { key: "category", label: "类目", ok: Boolean(item.description_category_id && item.type_id), detail: `category=${item.description_category_id || "-"}, type=${item.type_id || "-"}` },
    { key: "price", label: "售价", ok: amount(item.price?.price) > 0, detail: item.price?.price || "0" },
    { key: "images", label: "图片", ok: Boolean(item.primary_image), detail: `${1 + (item.images || []).length} image(s)` },
    { key: "weight", label: "重量", ok: Number(item.weight_g) > 0, detail: `${item.weight_g || 0}g` },
    { key: "dimensions", label: "尺寸", ok: ["length", "width", "height"].every((k) => amount(item.dimensions?.[k]) > 0), detail: `${item.dimensions.length}x${item.dimensions.width}x${item.dimensions.height}mm` },
    { key: "attributes", label: "属性", ok: item.attributes.length > 0 && !requiredMissing.length, detail: requiredMissing.length ? `missing: ${requiredMissing.join(", ")}` : `${item.attributes.length} filled` },
    { key: "rich", label: "Rich Content", ok: hasRich, detail: hasRich ? "mapped" : "template has no rich/content field or value is empty" },
  ];
  return { ok: checks.filter((check) => check.key !== "rich").every((check) => check.ok), checks, requiredMissing, attributeCount: item.attributes.length };
}

async function buildOzonImportPayload(store, draft) {
  const definitions = await loadOzonAttributeDefinitions(store, draft);
  const variants = normalizedVariants(draft);
  const items = variants.length
    ? variants.map((variant) => buildOzonImportItem(draft, definitions, variant))
    : [buildOzonImportItem(draft, definitions)];
  return { body: { items }, item: items[0], items, definitions };
}

async function preflight(env, body, headers = {}) {
  const platform = String(body?.platform || "Ozon").toLowerCase();
  const storeIndex = Number(body?.storeIndex || "0");
  const draft = body?.draft || {};
  if (platform !== "ozon") return { ok: true, platform, checks: [{ key: "platform", label: "平台", ok: true, detail: "WB uses card upload" }] };
  const store = resolveStore(env, headers, platform, storeIndex);
  if (!store) return { ok: false, error: "未配置 Ozon 店铺" };
  const { items, definitions } = await buildOzonImportPayload(store, draft);
  const itemResults = items.map((item) => ({ offerId: item.offer_id, ...preflightOzonItem(item, definitions) }));
  const first = itemResults[0] || { checks: [] };
  const response = {
    ...first,
    ok: itemResults.every((result) => result.ok),
    offerId: items[0]?.offer_id || "",
    itemCount: items.length,
    itemResults,
    itemPreview: { ...items[0], primary_image: Boolean(items[0]?.primary_image), images: items[0]?.images?.length || 0 },
  };
  response.kvSaved = await kvPutJson(env, flowCacheKey(platform, store, response.offerId, "preflight"), response, 60 * 60 * 24 * 30);
  return response;
}

async function publishOzonProduct(env, store, draft) {
  const { body, items, definitions } = await buildOzonImportPayload(store, draft);
  const gates = items.map((item) => ({ offerId: item.offer_id, ...preflightOzonItem(item, definitions) }));
  const failedGate = gates.find((gate) => !gate.ok);
  if (failedGate) {
    const failed = failedGate.checks.filter((check) => !check.ok).map((check) => `${check.label}:${check.detail}`).join("; ");
    return { ok: false, error: `上传前自检未通过(${failedGate.offerId}): ${failed}`, preflight: failedGate, itemResults: gates };
  }

  const response = await fetch("https://api-seller.ozon.ru/v3/product/import", {
    method: "POST",
    headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok) return { ok: false, status: response.status, error: payload?.error?.message || payload?.message || text.slice(0, 300) };
  const result = payload?.result || {};
  const responseBody = {
    ok: Boolean(result.task_id),
    taskId: result.task_id || null,
    productId: result.product_id || null,
    offerId: items[0]?.offer_id || "",
    offerIds: items.map((item) => item.offer_id),
    itemCount: items.length,
    preflight: gates[0],
    itemResults: gates,
    raw: result,
  };
  responseBody.kvSaved = await kvPutJson(env, flowCacheKey("ozon", store, responseBody.offerId, "publish"), responseBody, 60 * 60 * 24 * 90);
  return responseBody;
}

async function publishWBProduct(env, store, draft) {
  const body = {
    name: String(draft.title || "").slice(0, 100),
    vendorCode: String(draft.offerId || draft.code || `SKU-${Date.now()}`),
    description: String(draft.description || ""),
    brand: String(draft.brand || ""),
    characteristics: [],
    sizes: [{
      price: Math.round(amount(draft.price) * 100),
      skus: [],
    }],
  };
  const response = await fetch("https://content-api.wildberries.ru/content/v2/cards/upload", {
    method: "POST",
    headers: { Authorization: store.token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok) return { ok: false, status: response.status, error: payload?.errorText || payload?.detail || text.slice(0, 300) };
  return { ok: !payload?.error, raw: payload };
}

async function publish(env, body, headers = {}) {
  const platform = String(body?.platform || "Ozon").toLowerCase();
  const storeIndex = Number(body?.storeIndex || "0");
  const draft = body?.draft || {};
  if (!draft.title) return { ok: false, error: "缺少标题" };
  if (!Array.isArray(draft.images) || !draft.images.length) return { ok: false, error: "至少需要 1 张图片" };

  const store = resolveStore(env, headers, platform, storeIndex);
  if (platform === "wb") {
    if (!store) return { ok: false, error: "未配置 WB 店铺" };
    return await publishWBProduct(env, store, draft);
  }
  if (!store) return { ok: false, error: "未配置 Ozon 店铺" };
  // 兼容历史/多种 categoryId 写法。新版前端已直接发送 descriptionCategoryId + typeId(数字),
  // 这里仅在前端没发数字 id 时,从 categoryId 字符串尽力回填。
  const rawCat = String(draft.categoryId || "");
  if (!draft.descriptionCategoryId) {
    if (rawCat.startsWith("cat-")) draft.descriptionCategoryId = Number(rawCat.slice(4)) || 0;
    else if (/^\d+$/.test(rawCat)) draft.descriptionCategoryId = Number(rawCat);
  }
  if (!draft.typeId && rawCat.startsWith("type-")) {
    draft.typeId = Number(rawCat.slice(5)) || 0;
  }
  return await publishOzonProduct(env, store, draft);
}

// 检测上架任务状态(Ozon /v1/product/import/info)
async function checkPublishStatus(env, searchParams, headers = {}) {
  const platform = String(searchParams.get("platform") || "Ozon").toLowerCase();
  const storeIndex = Number(searchParams.get("storeIndex") || "0");
  const taskId = String(searchParams.get("taskId") || "");
  const offerId = String(searchParams.get("offerId") || "");
  const store = resolveStore(env, headers, platform, storeIndex);
  if (!store) return { ok: false, error: "未配置店铺" };
  const saveStatus = async (body, resolvedOfferId = offerId) => {
    const keyOffer = resolvedOfferId || offerId || taskId || "unknown";
    const kvSaved = await kvPutJson(env, flowCacheKey(platform, store, keyOffer, "status"), body, 60 * 60 * 24 * 90);
    if (taskId && keyOffer !== taskId) {
      await kvPutJson(env, flowCacheKey(platform, store, taskId, "status"), body, 60 * 60 * 24 * 90);
    }
    return { ...body, kvSaved };
  };
  const cachedStatus = async () => {
    const cached = await kvGetJson(env, flowCacheKey(platform, store, offerId || taskId || "unknown", "status"));
    return cached ? { ...cached, source: "kv-cache" } : null;
  };

  if (platform === "wb") {
    // WB 同步创建,无任务 id,按货号查商品是否存在即可
    return await saveStatus({ ok: true, status: offerId ? "done" : "pending", note: "WB 暂不支持状态检测" });
  }

  if (!taskId) {
    // 没有 taskId,尝试按 offer_id 查商品信息判断是否成功
    if (!offerId) return { ok: true, status: "pending", note: "无任务 ID,无法检测" };
    try {
      const resp = await fetch("https://api-seller.ozon.ru/v3/product/info/list", {
        method: "POST",
        headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
        body: JSON.stringify({ offer_id: [offerId], sku: [] }),
      });
      const info = await resp.json();
      const items = info?.result?.items || [];
      if (items.length) {
        return await saveStatus({ ok: true, status: "done", sku: items[0]?.product_id || 0, productId: items[0]?.product_id || 0 });
      }
      return await saveStatus({ ok: true, status: "pending", note: "商品尚未出现在列表中" });
    } catch (e) {
      return (await cachedStatus()) || { ok: false, error: "查询商品失败:" + (e.message || String(e)) };
    }
  }

  // 有 taskId:查任务状态
  try {
    const resp = await fetch("https://api-seller.ozon.ru/v1/product/import/info", {
      method: "POST",
      headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
      body: JSON.stringify({ task_id: [Number(taskId)] }),
    });
    const data = await resp.json();
    const result = data?.result?.items?.[0];
    if (!result) return await saveStatus({ ok: true, status: "pending", note: "任务尚未返回结果" });
    // status: "pending" | "imported" | "failed"
    const st = String(result.status || "").toLowerCase();
    if (st === "imported") return await saveStatus({ ok: true, status: "done", offerId: result.offer_id, productId: result.product_id }, result.offer_id);
    if (st === "failed" || st === "error") {
      const errs = (result.errors || []).map((e) => e.message || JSON.stringify(e)).join("; ");
      return await saveStatus({ ok: true, status: "failed", offerId: result.offer_id || offerId, error: errs || "上架被拒" }, result.offer_id);
    }
    return await saveStatus({ ok: true, status: "pending", offerId: result.offer_id || offerId, note: "处理中…" }, result.offer_id);
  } catch (e) {
    return (await cachedStatus()) || { ok: false, error: "检测失败:" + (e.message || String(e)) };
  }
}

async function fetchOzonProductAttributes(store, offerId, productId) {
  const filter = {};
  if (offerId) filter.offer_id = [offerId];
  if (productId) filter.product_id = [Number(productId)];
  const response = await fetch("https://api-seller.ozon.ru/v4/product/info/attributes", {
    method: "POST",
    headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
    body: JSON.stringify({ filter, limit: 100, sort_dir: "ASC" }),
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.message || payload?.error?.message || text.slice(0, 300));
  return payload?.result?.[0] || payload?.result?.items?.[0] || null;
}

async function auditOzonProduct(env, body, headers = {}) {
  const platform = String(body?.platform || "Ozon").toLowerCase();
  const storeIndex = Number(body?.storeIndex || "0");
  if (platform !== "ozon") return { ok: false, error: "完整性检查目前仅支持 Ozon" };
  const store = resolveStore(env, headers, platform, storeIndex);
  if (!store) return { ok: false, error: "未配置 Ozon 店铺" };
  const offerId = String(body?.offerId || body?.code || "").trim();
  const productId = Number(body?.productId || 0);
  if (!offerId && !productId) return { ok: false, error: "缺少 offerId 或 productId" };
  const auditKey = flowCacheKey(platform, store, offerId || productId, "audit");
  try {
    const item = await fetchOzonProductAttributes(store, offerId, productId);
    if (!item) {
      const pending = { ok: true, status: "pending", note: "商品属性暂未返回,稍后再查" };
      pending.kvSaved = await kvPutJson(env, auditKey, pending, 60 * 60 * 24 * 30);
      return pending;
    }
    const attributes = Array.isArray(item.attributes) ? item.attributes : [];
    const attrIds = new Set(attributes.map((attr) => Number(attr.id)));
    const expected = Array.isArray(body?.expectedAttributes) ? body.expectedAttributes.map(Number).filter(Boolean) : [];
    const missing = expected.filter((id) => !attrIds.has(id));
    const richWritten = attributes.some((attr) => (attr.values || []).some((v) => /blocks|rich|content/i.test(String(v.value || ""))));
    const result = {
      ok: true,
      status: missing.length ? "incomplete" : "complete",
      offerId: item.offer_id || offerId,
      productId: item.id || item.product_id || productId || 0,
      attributeCount: attributes.length,
      expectedCount: expected.length,
      missing,
      richWritten,
      rawName: item.name || "",
    };
    result.kvSaved = await kvPutJson(env, auditKey, result, 60 * 60 * 24 * 90);
    return result;
  } catch (e) {
    return (await kvGetJson(env, auditKey)) || { ok: false, error: "完整性检查失败:" + (e.message || String(e)) };
  }
}

async function listOzonWarehouses(env, searchParams, headers = {}) {
  const platform = String(searchParams.get("platform") || "Ozon").toLowerCase();
  const storeIndex = Number(searchParams.get("storeIndex") || "0");
  if (platform !== "ozon") return { ok: false, error: "仓库列表目前仅支持 Ozon" };
  const store = resolveStore(env, headers, platform, storeIndex);
  if (!store) return { ok: false, error: "未配置 Ozon 店铺" };
  const cacheKey = `warehouses:${storeCacheId(platform, store)}`;
  const cached = await kvGetJson(env, cacheKey);
  if (cached?.warehouses?.length && searchParams.get("force") !== "1") {
    return { ok: true, warehouses: cached.warehouses, source: "kv-cache", cachedAt: cached.cachedAt };
  }
  try {
    const probe = await fetchOzonStockWarehouseProbe(store);
    const result = {
      ok: true,
      warehouses: probe.warehouses,
      source: "fresh",
      attempts: searchParams.get("debug") === "1" ? probe.attempts : undefined,
      warning: probe.warehouses.length ? "" : "Ozon 没有返回可用于修改库存的 warehouse_id",
    };
    if (probe.warehouses.length) result.kvSaved = await kvPutJson(env, cacheKey, result, 60 * 60 * 6);
    return result;
  } catch (e) {
    return cached || { ok: false, error: "查询仓库失败:" + (e.message || String(e)) };
  }
}

function stockAmount(row) {
  const candidates = [
    row?.present,
    row?.stock,
    row?.free_to_sell_amount,
    row?.available_stock_count,
    row?.valid_stock_count,
    row?.quantity,
  ];
  for (const value of candidates) {
    const n = amount(value);
    if (n) return n;
  }
  return 0;
}

function stockPrice(item = {}, detail = {}) {
  const candidates = [
    detail.price,
    detail.marketing_price,
    detail.old_price,
    detail.min_price,
    detail.price?.price,
    detail.price?.marketing_price,
    item.price,
    item.marketing_price,
    item.old_price,
    item.min_price,
    item.price?.price,
    item.price?.marketing_price,
  ];
  for (const value of candidates) {
    const n = amount(value);
    if (n) return n;
  }
  return 0;
}

function stockOldPrice(item = {}, detail = {}) {
  const candidates = [detail.old_price, detail.price?.old_price, item.old_price, item.price?.old_price];
  for (const value of candidates) {
    const n = amount(value);
    if (n) return n;
  }
  return 0;
}

function promotionRows(payload, names = []) {
  const result = payload?.result || payload;
  const candidates = [
    result,
    payload,
    result?.products,
    result?.items,
    payload?.products,
    payload?.items,
  ];
  for (const name of names) {
    candidates.unshift(result?.[name], payload?.[name]);
  }
  return candidates.find((rows) => Array.isArray(rows)) || [];
}

function promotionTotal(payload, fallbackCount) {
  return Number(payload?.result?.total || payload?.result?.count || payload?.total || payload?.count || fallbackCount || 0);
}

async function ozonSellerGet(store, endpoint, params = {}) {
  const url = new URL(`https://api-seller.ozon.ru${endpoint}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "client-id": store.clientId, "api-key": store.apiKey },
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.message || payload?.error?.message || text.slice(0, 300));
  return payload || {};
}

async function ozonSellerPost(store, endpoint, body = {}) {
  const response = await fetch(`https://api-seller.ozon.ru${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.message || payload?.error?.message || text.slice(0, 300));
  return payload || {};
}

function promotionPriceValue(row = {}) {
  const candidates = [
    row.action_price,
    row.actionPrice,
    row.enrolled_action_price,
    row.enrolledActionPrice,
    row.participating_price,
    row.participatingPrice,
    row.discount_price,
    row.discountPrice,
    row.price_for_action,
  ];
  for (const value of candidates) {
    const n = amount(value);
    if (n) return n;
  }
  return 0;
}

function promotionLookupKeys(row = {}) {
  return [
    row.product_id,
    row.productId,
    row.id,
    row.offer_id,
    row.offerId,
    row.article,
    row.sku,
    row.sku_id,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

async function fetchOzonPromotionPrices(store, items) {
  const wanted = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    promotionLookupKeys(item).forEach((key) => wanted.add(key));
  });
  if (!wanted.size) return { prices: new Map(), checkedActions: 0, matched: 0, error: "" };

  const actions = [];
  let offset = 0;
  const limit = 50;
  for (let page = 0; page < 10; page += 1) {
    const payload = await ozonSellerGet(store, "/v1/actions", { limit, offset });
    const batch = promotionRows(payload, ["actions"]);
    if (!batch.length) break;
    actions.push(...batch);
    const total = promotionTotal(payload, batch.length);
    if (actions.length >= total || batch.length < limit) break;
    offset += limit;
  }

  const byKey = new Map();
  for (const action of actions.slice(0, 30)) {
    const actionId = action.id || action.action_id || action.actionId || action.promo_id || action.promotion_id;
    if (!actionId) continue;
    let productOffset = 0;
    const productLimit = 100;
    for (let page = 0; page < 20; page += 1) {
      const payload = await ozonSellerPost(store, "/v1/actions/products", {
        action_id: Number(actionId) || actionId,
        limit: productLimit,
        offset: productOffset,
      });
      const batch = promotionRows(payload, ["products", "items"]);
      if (!batch.length) break;
      batch.forEach((row) => {
        const price = promotionPriceValue(row);
        if (!price) return;
        const title = String(action.title || action.name || action.action_name || `活动 ${actionId}`);
        promotionLookupKeys(row).forEach((key) => {
          if (!wanted.has(key)) return;
          byKey.set(key, { price, title, actionId: String(actionId) });
        });
      });
      const total = promotionTotal(payload, batch.length);
      if (batch.length < productLimit || (productOffset + batch.length) >= total) break;
      productOffset += productLimit;
    }
  }
  return { prices: byKey, checkedActions: actions.length, matched: byKey.size, error: "" };
}

function fallbackStockWarehouses(store) {
  const name = String(store?.name || "");
  if (/子杰3店/i.test(name)) {
    return [
      { id: 111, name: "111", source: "manual-fallback" },
      { id: 222, name: "222", source: "manual-fallback" },
    ];
  }
  return [];
}

function ozonWarehouseRows(payload) {
  const result = payload?.result || payload;
  if (Array.isArray(result)) return result;
  const candidates = [
    result?.delivery_methods,
    result?.delivery_method,
    result?.warehouses,
    result?.warehouse,
    result?.items,
    payload?.items,
  ];
  return candidates.find((rows) => Array.isArray(rows)) || [];
}

function normalizeOzonWarehouse(row = {}, source = "") {
  const warehouse = row.warehouse && typeof row.warehouse === "object" ? row.warehouse : {};
  const isDeliveryMethod = source.includes("/delivery-method/");
  const id = Number(
    row.warehouse_id ||
    row.stock_warehouse_id ||
    warehouse.warehouse_id ||
    warehouse.id ||
    (!isDeliveryMethod ? row.id : 0) ||
    0
  );
  if (!id) return null;
  const name = String(
    row.warehouse_name ||
    row.stock_warehouse_name ||
    warehouse.name ||
    row.name ||
    row.provider_name ||
    (typeof row.warehouse === "string" ? row.warehouse : "") ||
    `仓库 ${id}`
  );
  return {
    id,
    name,
    status: row.status || "",
    deliveryMethodId: isDeliveryMethod ? Number(row.id || 0) : 0,
    source,
  };
}

function warehouseDebugSample(row = {}) {
  const out = {};
  Object.entries(row).slice(0, 20).forEach(([key, value]) => {
    if (value && typeof value === "object") {
      out[key] = Array.isArray(value) ? value.slice(0, 3) : Object.fromEntries(Object.entries(value).slice(0, 12));
    } else {
      out[key] = value;
    }
  });
  return out;
}

function displayOzonWarehouseForStore(store, warehouse) {
  const storeName = String(store?.name || "");
  const name = String(warehouse?.name || "");
  if (/子杰3店/i.test(storeName)) {
    if (/轻小件|GUOO\s*轻/i.test(name)) return { ...warehouse, name: name.startsWith("111") ? name : `111 / ${name}` };
    if (/small/i.test(name)) return { ...warehouse, name: name.startsWith("222") ? name : `222 / ${name}` };
  }
  return warehouse;
}

async function fetchOzonStockWarehouseProbe(store) {
  const headers = { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey };
  const endpoints = [
    {
      url: "https://api-seller.ozon.ru/v3/delivery-method/list",
      bodies: [
        { limit: 100, offset: 0 },
        { filter: {}, limit: 100, offset: 0 },
      ],
    },
    {
      url: "https://api-seller.ozon.ru/v2/delivery-method/list",
      bodies: [
        { limit: 100, offset: 0 },
        { filter: {}, limit: 100, offset: 0 },
      ],
    },
    {
      url: "https://api-seller.ozon.ru/v1/delivery-method/list",
      bodies: [
        { limit: 100, offset: 0 },
        { filter: {}, limit: 100, offset: 0 },
      ],
    },
    {
      url: "https://api-seller.ozon.ru/v3/warehouse/list",
      bodies: [{}],
    },
    {
      url: "https://api-seller.ozon.ru/v2/warehouse/list",
      bodies: [{}],
    },
    {
      url: "https://api-seller.ozon.ru/v1/warehouse/list",
      bodies: [{}],
    },
  ];
  const warehouses = new Map();
  const attempts = [];
  for (const endpoint of endpoints) {
    for (const body of endpoint.bodies) {
      try {
        const response = await fetch(endpoint.url, { method: "POST", headers, body: JSON.stringify(body) });
        const text = await response.text();
        const payload = JSON.parse(text || "{}");
        const rows = response.ok ? ozonWarehouseRows(payload) : [];
        attempts.push({
          url: endpoint.url,
          status: response.status,
          ok: response.ok,
          body,
          rows: rows.length,
          error: response.ok ? "" : (payload?.message || payload?.error?.message || text.slice(0, 200)),
          sample: rows[0] ? Object.keys(rows[0]).slice(0, 12) : [],
          sampleRows: rows.slice(0, 3).map(warehouseDebugSample),
        });
        if (!response.ok || !Array.isArray(rows)) continue;
        rows.forEach((row) => {
          const warehouse = normalizeOzonWarehouse(row, endpoint.url);
          if (warehouse) warehouses.set(String(warehouse.id), warehouse);
        });
      } catch {
        attempts.push({ url: endpoint.url, status: 0, ok: false, body, rows: 0, error: "请求或解析仓库响应失败", sample: [] });
      }
    }
    if (warehouses.size) break;
  }
  return { warehouses: [...warehouses.values()].map((warehouse) => displayOzonWarehouseForStore(store, warehouse)), attempts };
}

async function fetchOzonStockWarehouses(store) {
  const probe = await fetchOzonStockWarehouseProbe(store);
  return probe.warehouses;
}

function normalizeStockRow(item, stock = {}, detail = {}, fallbackWarehouse = null, promotion = null) {
  const productId = Number(item.product_id || item.id || detail.product_id || detail.id || 0);
  const offerId = String(item.offer_id || item.offerId || detail.offer_id || detail.offerId || "");
  const sku = String(stock.sku || item.sku || detail.sku || "");
  const source = String(stock.source || stock.type || "").toLowerCase();
  const directWarehouseId = Number(stock.warehouse_id || stock.warehouseId || stock.warehouse?.id || stock.source_id || 0);
  const warehouseIds = Array.isArray(stock.warehouse_ids) ? stock.warehouse_ids.map(Number).filter(Boolean) : [];
  const isSellerWarehouseStock = ["fbs", "rfbs"].includes(source);
  const warehouseId = directWarehouseId || warehouseIds[0] || (isSellerWarehouseStock && fallbackWarehouse ? Number(fallbackWarehouse.id || 0) : 0);
  const warehouseName = String(stock.warehouse_name || stock.warehouseName || stock.warehouse?.name || fallbackWarehouse?.name || stock.source || stock.type || "");
  const rawImage = detail.primary_image || detail.primary_image_url || detail.images?.[0] || item.primary_image || item.primary_image_url || item.images?.[0] || "";
  const image = Array.isArray(rawImage) ? (rawImage[0] || "") : String(rawImage || "");
  return {
    id: `${productId || offerId || sku}:${warehouseId || warehouseName || "stock"}`,
    productId,
    offerId,
    sku,
    name: String(detail.name || item.name || ""),
    image,
    warehouseId,
    warehouseName,
    source,
    editable: isSellerWarehouseStock && Boolean(warehouseId),
    price: stockPrice(item, detail),
    oldPrice: stockOldPrice(item, detail),
    activityPrice: amount(promotion?.price),
    activityTitle: String(promotion?.title || ""),
    activityId: String(promotion?.actionId || ""),
    currencyCode: String(detail.currency_code || item.currency_code || "RUB"),
    present: stockAmount(stock),
    reserved: amount(stock.reserved),
    rawStock: stock,
  };
}

async function fetchOzonProductDetails(store, items) {
  const headers = { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey };
  const byKey = new Map();
  const productIds = [...new Set(items.map((item) => Number(item.product_id || item.id || 0)).filter(Boolean))].slice(0, 1000);
  const offerIds = [...new Set(items.map((item) => String(item.offer_id || item.offerId || "").trim()).filter(Boolean))].slice(0, 1000);
  const bodies = [];
  for (let i = 0; i < productIds.length; i += 100) bodies.push({ product_id: productIds.slice(i, i + 100) });
  for (let i = 0; i < offerIds.length; i += 100) bodies.push({ offer_id: offerIds.slice(i, i + 100) });
  for (const body of bodies) {
    try {
      const response = await fetch("https://api-seller.ozon.ru/v3/product/info/list", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      const rows = payload?.items || payload?.result?.items || payload?.result || [];
      if (!Array.isArray(rows)) continue;
      rows.forEach((row) => {
        [row.product_id, row.id, row.offer_id, row.sku].map((value) => String(value || "")).filter(Boolean).forEach((key) => byKey.set(key, row));
      });
    } catch {
      // Details are optional; stock rows can still be shown without images.
    }
  }
  return byKey;
}

function searchParamList(searchParams, key) {
  return [
    ...searchParams.getAll(key),
    String(searchParams.get(`${key}[]`) || ""),
  ]
    .join(",")
    .split(/[\s,，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 1000);
}

async function fetchOzonInventoryStocks(store, filters = {}) {
  const headers = { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey };
  const offerIds = Array.isArray(filters.offerIds) ? filters.offerIds.map(String).filter(Boolean).slice(0, 1000) : [];
  const productIds = Array.isArray(filters.productIds) ? filters.productIds.map(Number).filter(Boolean).slice(0, 1000) : [];
  const filtered = offerIds.length || productIds.length;
  const endpoints = [
    "https://api-seller.ozon.ru/v4/product/info/stocks",
    "https://api-seller.ozon.ru/v3/product/info/stocks",
  ];
  let lastError = "";
  for (const endpoint of endpoints) {
    const items = [];
    let cursor = "";
    for (let page = 0; page < 50; page += 1) {
      const body = {
        filter: { offer_id: offerIds, product_id: productIds, visibility: "ALL" },
        limit: filtered ? Math.max(1, Math.min(1000, offerIds.length + productIds.length)) : 1000,
        cursor,
        last_id: cursor,
      };
      const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await response.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch { payload = null; }
      if (!response.ok) {
        lastError = payload?.message || payload?.error?.message || text.slice(0, 300);
        break;
      }
      const batch = payload?.items || payload?.result?.items || payload?.result || [];
      if (Array.isArray(batch)) items.push(...batch);
      cursor = payload?.cursor || payload?.last_id || payload?.result?.cursor || payload?.result?.last_id || "";
      if (filtered || !cursor || !Array.isArray(batch) || !batch.length) break;
    }
    if (items.length) return { endpoint, items };
  }
  throw new Error(lastError || "未拉取到 Ozon 库存数据");
}

async function getOzonInventory(env, searchParams, headers = {}) {
  const platform = String(searchParams.get("platform") || "Ozon").toLowerCase();
  const storeIndex = Number(searchParams.get("storeIndex") || "0");
  if (platform !== "ozon") return { ok: false, error: "库存管理目前仅支持 Ozon" };
  const store = resolveStore(env, headers, platform, storeIndex);
  if (!store) return { ok: false, error: "未配置 Ozon 店铺" };
  const offerIds = [...new Set([...searchParamList(searchParams, "offerIds"), ...searchParamList(searchParams, "offerId")])];
  const productIds = [...new Set([...searchParamList(searchParams, "productIds"), ...searchParamList(searchParams, "productId")].map(Number).filter(Boolean))];
  try {
    const [fetched, warehouseProbe] = await Promise.all([
      fetchOzonInventoryStocks(store, { offerIds, productIds }),
      fetchOzonStockWarehouseProbe(store),
    ]);
    const stockWarehouses = warehouseProbe.warehouses;
    const [details, promotionResult] = await Promise.all([
      fetchOzonProductDetails(store, fetched.items),
      fetchOzonPromotionPrices(store, fetched.items).catch((error) => ({ prices: new Map(), checkedActions: 0, matched: 0, error: error.message || String(error) })),
    ]);
    const promotionPrices = promotionResult.prices || new Map();
    const rows = [];
    const singleWarehouse = stockWarehouses.length === 1 ? stockWarehouses[0] : null;
    fetched.items.forEach((item) => {
      const detail = details.get(String(item.product_id || item.id || "")) || details.get(String(item.offer_id || "")) || details.get(String(item.sku || "")) || {};
      const promotion = promotionLookupKeys({ ...item, ...detail }).map((key) => promotionPrices.get(key)).find(Boolean) || null;
      const stocks = Array.isArray(item.stocks) && item.stocks.length ? item.stocks : [item];
      stocks.forEach((stock) => rows.push(normalizeStockRow(item, stock, detail, singleWarehouse, promotion)));
    });
    const stockTypeWarehouses = [...new Map(rows
      .filter((row) => row.warehouseId || row.warehouseName)
      .map((row) => [String(row.warehouseId || row.warehouseName), {
        id: row.warehouseId,
        name: row.warehouseName || (row.warehouseId ? `仓库 ${row.warehouseId}` : "未命名仓库"),
      }])).values()];
    const warehouses = stockWarehouses.length ? stockWarehouses : stockTypeWarehouses;
    return {
      ok: true,
      store: store.name,
      source: fetched.endpoint,
      rows,
      warehouses,
      count: rows.length,
      productCount: new Set(rows.map((row) => row.productId || row.offerId || row.sku)).size,
      activityPriceCount: new Set(rows.filter((row) => row.activityPrice).map((row) => row.productId || row.offerId || row.sku)).size,
      promotionWarning: promotionResult.error || "",
      warning: [
        stockWarehouses.length ? "" : "没有从 Ozon API 获取到可提交库存的仓库 ID，后台编号 111/222 不能直接提交。",
        promotionResult.error ? `活动价拉取失败：${promotionResult.error}` : "",
      ].filter(Boolean).join(" "),
      warehouseAttempts: searchParams.get("debug") === "1" ? warehouseProbe.attempts : undefined,
    };
  } catch (e) {
    return { ok: false, error: "拉取库存失败:" + (e.message || String(e)) };
  }
}

async function setOzonStocks(env, body, headers = {}) {
  const platform = String(body?.platform || "Ozon").toLowerCase();
  const storeIndex = Number(body?.storeIndex || "0");
  if (platform !== "ozon") return { ok: false, error: "库存设置目前仅支持 Ozon" };
  const store = resolveStore(env, headers, platform, storeIndex);
  if (!store) return { ok: false, error: "未配置 Ozon 店铺" };
  const offerId = String(body?.offerId || body?.code || "").trim();
  const productId = Number(body?.productId || 0);
  const stocks = Array.isArray(body?.stocks) ? body.stocks : [];
  const normalized = stocks.map((row) => {
    const rowOfferId = String(row.offerId || row.offer_id || row.sku || row.code || offerId || "").trim();
    const rowProductId = Number(row.productId || row.product_id || productId || 0) || undefined;
    return {
      ...(rowOfferId ? { offer_id: rowOfferId } : { product_id: rowProductId }),
      warehouse_id: Number(row.warehouseId || row.warehouse_id || 0),
      stock: Math.max(0, Math.round(Number(row.stock || 0))),
    };
  }).filter((row) => row.warehouse_id && (row.offer_id || row.product_id));
  if (!normalized.length) return { ok: false, error: "缺少仓库或库存数量" };
  try {
    const chunks = [];
    for (let i = 0; i < normalized.length; i += 100) chunks.push(normalized.slice(i, i + 100));
    const responses = [];
    const updatedRows = [];
    for (const chunk of chunks) {
      const response = await fetch("https://api-seller.ozon.ru/v2/products/stocks", {
        method: "POST",
        headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
        body: JSON.stringify({ stocks: chunk }),
      });
      const text = await response.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch { payload = null; }
      if (!response.ok) return { ok: false, status: response.status, error: payload?.message || payload?.error?.message || text.slice(0, 300), raw: payload, stocks: chunk };
      const resultRows = ozonStockUpdateRows(payload);
      if (!resultRows.length) {
        return { ok: false, status: response.status, error: "Ozon 未返回逐商品更新结果，无法确认库存是否修改成功", raw: payload, stocks: chunk };
      }
      const failures = resultRows
        .map((row, index) => ozonStockFailure(row, chunk[index]))
        .filter(Boolean);
      if (failures.length) {
        const detail = failures.slice(0, 5).map((row) => `${row.offerId || row.productId || "商品"}：${row.message}`).join("；");
        return { ok: false, status: response.status, error: `Ozon 拒绝 ${failures.length}/${chunk.length} 行库存修改：${detail}`, failures, raw: payload, stocks: chunk };
      }
      updatedRows.push(...resultRows);
      responses.push(payload?.result || payload);
    }
    const result = { ok: true, result: responses.length === 1 ? responses[0] : responses, stocks: normalized, count: normalized.length, updatedCount: updatedRows.length };
    result.kvSaved = await kvPutJson(env, flowCacheKey(platform, store, offerId || productId || "batch", "stock"), result, 60 * 60 * 24 * 90);
    return result;
  } catch (e) {
    return { ok: false, error: "设置库存失败:" + (e.message || String(e)) };
  }
}

function ozonStockUpdateRows(payload) {
  const result = payload?.result ?? payload?.items ?? payload;
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.stocks)) return result.stocks;
  return [];
}

function ozonStockFailure(row = {}, fallback = {}) {
  const errors = [];
  if (Array.isArray(row.errors)) {
    row.errors.forEach((error) => {
      const message = error?.message || error?.error || error?.code || JSON.stringify(error);
      if (message) errors.push(message);
    });
  }
  if (row.error) errors.push(String(row.error));
  if (row.error_message) errors.push(String(row.error_message));
  if (row.message && row.updated === false) errors.push(String(row.message));
  if (row.updated === false && !errors.length) errors.push("Ozon 返回 updated=false");
  if (!errors.length) return null;
  return {
    offerId: row.offer_id || fallback.offer_id || "",
    productId: row.product_id || fallback.product_id || "",
    warehouseId: row.warehouse_id || fallback.warehouse_id || "",
    stock: row.stock ?? fallback.stock ?? "",
    message: errors.join("；"),
    raw: row,
  };
}

function attrKvKeys(platform, categoryId, typeId) {
  const pf = String(platform || "ozon").toLowerCase();
  return [
    `attrs:v3:${pf}:${categoryId}:${typeId}`,
    `attrs:v3:any:${categoryId}:${typeId}`,
  ];
}

function normalizeOzonApiAttribute(a) {
  const values = Array.isArray(a.values)
    ? a.values.slice(0, 300).map((v) => ({ id: Number(v.id || v.value_id || 0), value: String(v.value || v.name || "") })).filter((v) => v.value)
    : [];
  return {
    id: Number(a.id || 0),
    name: String(a.name || ""),
    description: String(a.description || ""),
    isRequired: Boolean(a.is_required ?? a.isRequired),
    type: String(a.type || "string"),
    dictionary: Number(a.dictionary_id || a.dictionary || 0),
    isCollection: Boolean(a.is_collection ?? a.isCollection),
    maxValueCount: Number(a.max_value_count || a.maxValueCount || 0),
    complexId: Number(a.complex_id || a.attribute_complex_id || a.complexId || 0),
    complexName: String(a.complex_name || a.group_name || a.complexName || ""),
    values,
  };
}

async function fetchOzonAttributeDefinitions(store, categoryId, typeId) {
  const requests = [
    {
      endpoint: "https://api-seller.ozon.ru/v1/description-category/attribute",
      body: { description_category_id: Number(categoryId), type_id: Number(typeId), language: "ZH_HANS" },
      source: "description-category-v1",
    },
    {
      endpoint: "https://api-seller.ozon.ru/v3/category/attribute",
      body: { description_category_id: [Number(categoryId)], type_id: [Number(typeId)], language: "ZH_HANS" },
      source: "category-v3",
    },
  ];
  let lastError = "";
  for (const req of requests) {
    try {
      const resp = await fetch(req.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
        body: JSON.stringify(req.body),
      });
      const text = await resp.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!resp.ok) {
        lastError = data?.message || data?.error || text.slice(0, 200);
        continue;
      }
      const result = data?.result;
      const rawAttrs = Array.isArray(result)
        ? (Array.isArray(result[0]?.attributes) ? result[0].attributes : result)
        : (Array.isArray(result?.attributes) ? result.attributes : []);
      const attributes = rawAttrs.map(normalizeOzonApiAttribute).filter((a) => a.id && a.name);
      if (attributes.length) return { attributes, source: req.source };
    } catch (e) {
      lastError = e.message || String(e);
    }
  }
  throw new Error(lastError || "Ozon attribute API returned no attributes");
}

// 查询类目的必填属性(Ozon /v3/category/attribute),带 KV 缓存。
// 不同类目有不同的必填参数(颜色/材质/电池容量等),前端据此动态生成表单。
async function getCategoryAttributes(env, searchParams, headers = {}) {
  const platform = String(searchParams.get("platform") || "Ozon").toLowerCase();
  const storeIndex = Number(searchParams.get("storeIndex") || "0");
  const categoryId = Number(searchParams.get("categoryId") || "0");
  const typeId = Number(searchParams.get("typeId") || "0");
  const force = searchParams.get("force") === "1";
  if (!categoryId || !typeId) return { ok: false, error: "缺少 categoryId 或 typeId" };

  // KV 缓存:按平台 + Ozon description_category_id/type_id 存一份中央缓存。
  // 前端不再使用本地属性缓存,客户选类目时统一读取这里;force=1 时覆盖刷新。
  const cacheKeys = attrKvKeys(platform, categoryId, typeId);
  if (!force && env.LISTING_CACHE) {
    for (const key of cacheKeys) {
      try {
        const cached = await env.LISTING_CACHE.get(key, "json");
        if (cached?.attributes?.length) {
          return { ok: true, attributes: cached.attributes, source: "kv-cache", categoryId, typeId, key, cachedAt: cached.cachedAt || cached.ts || "" };
        }
      } catch {}
    }
  }

  const store = resolveStore(env, headers, platform, storeIndex);
  if (!store) return { ok: false, error: "未配置店铺" };

  try {
    const fetched = await fetchOzonAttributeDefinitions(store, categoryId, typeId);
    let attributes = fetched.attributes;
    attributes = await enrichOzonAttributeValues(store, categoryId, typeId, attributes);
    // 缓存到 KV(5 年,实际永久——类目属性极少变化)
    if (env.LISTING_CACHE) {
      try {
        const payload = JSON.stringify({ attributes, categoryId, typeId, platform, cachedAt: new Date().toISOString(), ts: Date.now() });
        await Promise.all(cacheKeys.map((key) => env.LISTING_CACHE.put(key, payload, { expirationTtl: 60 * 60 * 24 * 365 * 5 })));
      } catch {}
    }
    return { ok: true, attributes, source: "fresh", apiSource: fetched.source, categoryId, typeId, total: attributes.length, required: attributes.filter((a) => a.isRequired).length };
  } catch (e) {
    return { ok: false, error: "查询属性失败:" + (e.message || String(e)) };
  }
}

async function fetchOzonAttributeValues(store, categoryId, typeId, attr, language = "ZH_HANS") {
  const attributeId = Number(attr.id || 0);
  const dictionaryId = Number(attr.dictionary || attr.dictionary_id || 0);
  if (!attributeId || !dictionaryId) return [];
  const endpoints = [
    "https://api-seller.ozon.ru/v1/description-category/attribute/values",
    "https://api-seller.ozon.ru/v3/category/attribute/values",
    "https://api-seller.ozon.ru/v2/category/attribute/values",
  ];
  for (const endpoint of endpoints) {
    let lastValueId = 0;
    const values = [];
    for (let page = 0; page < 3; page += 1) {
      const body = {
        description_category_id: Number(categoryId),
        type_id: Number(typeId),
        attribute_id: attributeId,
        language,
        limit: 1000,
      };
      if (endpoint.includes("/v1/description-category/")) body.last_value_id = lastValueId;
      else body.last_value_id = lastValueId;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      if (!resp.ok) {
        if (page === 0) break;
        return values;
      }
      let data = {};
      try { data = JSON.parse(text); } catch { data = {}; }
      const result = data?.result || {};
      const rows = Array.isArray(result) ? result : (result.values || []);
      rows.forEach((row) => {
        const id = Number(row.id || row.value_id || 0);
        const value = String(row.value || row.name || "");
        if (value) values.push({ id, value });
      });
      lastValueId = Number(result.last_value_id || result.last_value_id_next || rows[rows.length - 1]?.id || 0);
      if (!rows.length || !result.has_next || !lastValueId || values.length >= 2000) break;
    }
    if (values.length) {
      const seen = new Set();
      return values.filter((item) => {
        const key = `${item.id}:${item.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }
  return [];
}

async function enrichOzonAttributeValues(store, categoryId, typeId, attributes) {
  const candidates = attributes
    .filter((attr) => attr.dictionary && (!Array.isArray(attr.values) || !attr.values.length))
    .slice(0, 40);
  for (const attr of candidates) {
    try {
      attr.values = await fetchOzonAttributeValues(store, categoryId, typeId, attr);
    } catch {
      attr.values = [];
    }
  }
  return attributes;
}

async function saveTemplateCache(env, body) {
  const raw = body?.template || {};
  const template = {
    name: String(raw.name || ""),
    categoryId: Number(raw.categoryId || 0),
    typeId: Number(raw.typeId || 0),
    platform: raw.platform || "Ozon",
    importedAt: raw.importedAt || new Date().toISOString(),
    fileName: String(raw.fileName || ""),
    complexGroups: raw.complexGroups || {},
    attributes: Array.isArray(raw.attributes) ? raw.attributes.map(normalizeTemplateAttribute).filter((a) => a.id && a.name) : [],
  };
  if (!template.name || !template.attributes.length) return { ok: false, error: "模板缺少名称或字段" };
  if (!env.LISTING_CACHE) return { ok: false, error: "未绑定 LISTING_CACHE KV", template };
  const keys = templateKvKeys(template);
  try {
    await Promise.all(keys.map((key) => env.LISTING_CACHE.put(key, JSON.stringify(template), { expirationTtl: 60 * 60 * 24 * 365 * 5 })));
    return { ok: true, keys, template: { name: template.name, attributeCount: template.attributes.length, requiredCount: template.attributes.filter((a) => a.isRequired).length } };
  } catch (e) {
    return { ok: false, error: "写入模板缓存失败:" + (e.message || String(e)) };
  }
}

async function getTemplateCache(env, searchParams) {
  if (!env.LISTING_CACHE) return { ok: false, error: "未绑定 LISTING_CACHE KV" };
  const name = String(searchParams.get("name") || "").trim();
  const categoryId = Number(searchParams.get("categoryId") || 0);
  const typeId = Number(searchParams.get("typeId") || 0);
  const keys = [];
  if (categoryId && typeId) keys.push(`template:cat:${categoryId}:${typeId}`);
  if (name) keys.push(`template:name:${name}`);
  if (!keys.length) return { ok: false, error: "缺少 name 或 categoryId/typeId" };
  for (const key of keys) {
    try {
      const template = await env.LISTING_CACHE.get(key, "json");
      if (template?.attributes?.length) return { ok: true, source: "kv", key, template };
    } catch {}
  }
  return { ok: false, error: "模板缓存不存在" };
}

// ---------- 入口 ----------

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === "OPTIONS") return json({}, 204);
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  const url = new URL(request.url);

  try {
    if (path === "health") {
      return json({
        ok: true,
        service: "listing-api",
        stores: storeList(env),
        openaiConfigured: Boolean(env.OPENAI_API_KEY),
        openaiImageModel: env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
        openaiTextModel: env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
        kvBound: Boolean(env.LISTING_CACHE),
      });
    }
    const auth = await verifyAuth(request, env);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    if (path === "categories") return json(await getCategories(env, url.searchParams, request.headers));
    if (path === "category-attributes") return json(await getCategoryAttributes(env, url.searchParams, request.headers));
    if (path === "template-cache") {
      if (request.method === "GET") return json(await getTemplateCache(env, url.searchParams));
      const body = await request.json().catch(() => ({}));
      return json(await saveTemplateCache(env, body));
    }
    if (path === "refresh-cache") {
      // 清除指定平台+店铺的云端 KV 类目缓存(配合前端「刷新类目」按钮)
      const platform = String(url.searchParams.get("platform") || "Ozon").toLowerCase();
      const storeIndex = Number(url.searchParams.get("storeIndex") || "0");
      const store = resolveStore(env, request.headers, platform, storeIndex);
      if (!store) return json({ ok: false, error: "未配置店铺" });
      const deleted = await kvDeleteCategories(env, platform, store);
      return json({ ok: true, deleted, kvBound: Boolean(env.LISTING_CACHE) });
    }
    if (path === "stores") return json({ ok: true, stores: storeList(env) });
    if (path === "generate-images") {
      const body = await request.json().catch(() => ({}));
      return json(await generateImages(env, body));
    }
    if (path === "generate-copy") {
      const body = await request.json().catch(() => ({}));
      return json(await generateCopy(env, body));
    }
    if (path === "import-1688") {
      const body = await request.json().catch(() => ({}));
      return json(await import1688Product(body));
    }
    if (path === "preflight") {
      const body = await request.json().catch(() => ({}));
      return json(await preflight(env, body, request.headers));
    }
    if (path === "publish") {
      const body = await request.json().catch(() => ({}));
      return json(await publish(env, body, request.headers));
    }
    if (path === "publish-status") {
      return json(await checkPublishStatus(env, url.searchParams, request.headers));
    }
    if (path === "audit-product") {
      const body = await request.json().catch(() => ({}));
      return json(await auditOzonProduct(env, body, request.headers));
    }
    if (path === "inventory") return json(await getOzonInventory(env, url.searchParams, request.headers));
    if (path === "warehouses") return json(await listOzonWarehouses(env, url.searchParams, request.headers));
    if (path === "set-stock") {
      const body = await request.json().catch(() => ({}));
      return json(await setOzonStocks(env, body, request.headers));
    }
    return json({ error: "Not found", path }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
}
