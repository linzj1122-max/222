/* Ozon keyword ranking from the MPStats Chrome overlay + official Ozon Seller API. */

const DEFAULT_DAYS = 30;
const MAX_RESULTS = 100;
const HASHTAG_LINK_LIMIT = 50;
const HASHTAG_TRANSLATION_LIMIT = 400;
const COLLECTOR_TTL_SECONDS = 90 * 24 * 60 * 60;
const SNAPSHOT_TTL_SECONDS = 30 * 24 * 60 * 60;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "cache-control": "no-store",
    },
  });
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(String(value || "")));
}

function base64UrlDecodeText(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function authSecret(env) {
  const configured = env.AUTH_SESSION_SECRET || env.CONTROL_CENTER_SESSION_SECRET || env.SESSION_SECRET;
  if (configured) return String(configured);
  const users = String(env.CONTROL_CENTER_USERS || env.AUTH_USERS || "");
  return [users, env.CREATOR_PASSWORD, env.ADMIN_PASSWORD, env.CLOUDFLARE_API_TOKEN]
    .filter(Boolean)
    .join(":") || "local-dev-session-secret";
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

function sessionTokenFromRequest(request) {
  const header = request.headers.get("authorization") || "";
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)cc_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function verifySignedToken(token, env, expectedPrefix = "") {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || (expectedPrefix && parts[0] !== expectedPrefix)) return null;
  const expected = await hmacSha256(authSecret(env), `${parts[0]}.${parts[1]}`);
  if (expected !== parts[2]) return null;
  let payload = null;
  try { payload = JSON.parse(base64UrlDecodeText(parts[1])); } catch { payload = null; }
  if (!payload?.sub || Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function verifyAuth(request, env) {
  const payload = await verifySignedToken(sessionTokenFromRequest(request), env);
  if (!payload) return { ok: false, status: 401, error: "请先登录或重新登录。" };
  return { ok: true, user: { username: String(payload.sub), role: String(payload.role || "member") } };
}

async function issueCollectorToken(user, env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(user.username || "collector"),
    role: "ozon-ranking-collector",
    iat: now,
    exp: now + COLLECTOR_TTL_SECONDS,
  };
  const encoded = base64UrlEncodeText(JSON.stringify(payload));
  const input = `collector.${encoded}`;
  return { token: `${input}.${await hmacSha256(authSecret(env), input)}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

async function verifyCollector(request, env) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Collector\s+(.+)$/i);
  if (!match) return null;
  const payload = await verifySignedToken(match[1].trim(), env, "collector");
  return payload?.role === "ozon-ranking-collector" ? payload : null;
}

function compactText(value, maxLength = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNumber(value, fallback = 0) {
  const number = optionalNumber(value);
  return number === null ? fallback : number;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function reportRange(days, delayDays = 0) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - Math.max(0, delayDays));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days - 1));
  return { d1: formatDate(start), d2: formatDate(end) };
}

function normalizeKeyword(value) {
  return compactText(value, 120).toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function keywordKey(value) {
  return encodeURIComponent(normalizeKeyword(value)).slice(0, 180);
}

function extractProductId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{5,20}$/.test(text)) return text;
  const direct = text.match(/(?:detail\/id\/|sku[=/:-]?)(\d{5,20})/i);
  if (direct) return direct[1];
  const product = text.match(/\/product\/[^?#]*-(\d{5,20})(?:\/|\?|#|$)/i);
  return product?.[1] || "";
}

function ozonStores(env) {
  const stores = [];
  for (let index = 1; index <= 10; index += 1) {
    const name = env[`OZON_STORE_${index}_NAME`];
    const clientId = env[`OZON_STORE_${index}_CLIENT_ID`];
    const apiKey = env[`OZON_STORE_${index}_API_KEY`];
    if (clientId && apiKey) stores.push({ name: name || `Ozon 店铺 ${index}`, clientId, apiKey });
  }
  if (env.OZON_STORES) {
    try {
      const parsed = JSON.parse(env.OZON_STORES);
      if (Array.isArray(parsed)) {
        parsed.forEach((item, index) => {
          if (item.clientId && item.apiKey) stores.push({ name: item.name || `Ozon 店铺 ${index + 1}`, clientId: item.clientId, apiKey: item.apiKey });
        });
      }
    } catch {
      // Invalid JSON is ignored to match the main API behavior.
    }
  }
  if (env.OZON_CLIENT_ID && env.OZON_API_KEY) {
    stores.push({ name: env.OZON_STORE_NAME || "Ozon 店铺", clientId: env.OZON_CLIENT_ID, apiKey: env.OZON_API_KEY });
  }
  return stores;
}

async function ozonRequest(store, endpoint, body) {
  const response = await fetch(`https://api-seller.ozon.ru${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept-language": "zh-CN,zh;q=0.9,ru;q=0.7,en;q=0.6",
      "client-id": store.clientId,
      "api-key": store.apiKey,
    },
    body: JSON.stringify(body || {}),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = null; }
  if (!response.ok) {
    const message = compactText(payload?.message || payload?.error?.message || payload?.error || text, 300);
    const error = new Error(`Ozon Seller API ${response.status}${message ? `：${message}` : ""}`);
    error.status = response.status === 401 || response.status === 403 ? 502 : 503;
    error.code = "OZON_SELLER_API_ERROR";
    throw error;
  }
  return payload || {};
}

async function officialKeywordMetrics(env, input) {
  const productId = extractProductId(input.productId || input.productUrl || "");
  if (!productId) return { available: false, found: false, reason: "未填写自己的 Product ID" };
  const stores = ozonStores(env);
  if (!stores.length) return { available: false, found: false, reason: "系统尚未配置 Ozon Seller API" };
  const days = Math.min(30, Math.max(7, Math.round(finiteNumber(input.days, DEFAULT_DAYS))));
  const range = reportRange(days, 3);
  const wanted = normalizeKeyword(input.keyword);
  let firstSuccessful = null;
  const errors = [];
  for (const store of stores) {
    try {
      const payload = await ozonRequest(store, "/v1/analytics/product-queries/details", {
        date_from: `${range.d1}T00:00:00.000Z`,
        date_to: `${range.d2}T23:59:59.999Z`,
        limit_by_sku: 1000,
        page: 0,
        page_size: 1000,
        skus: [productId],
        sort_by: "BY_SEARCHES",
        sort_dir: "DESCENDING",
      });
      const queries = Array.isArray(payload?.queries) ? payload.queries : [];
      const exact = queries.find((row) => normalizeKeyword(row.query) === wanted) || null;
      const metrics = {
        available: true,
        found: Boolean(exact),
        storeName: store.name,
        range: payload?.analytics_period || range,
        position: optionalNumber(exact?.position),
        orders: optionalNumber(exact?.order_count),
        gmv: optionalNumber(exact?.gmv),
        currency: compactText(exact?.currency || "RUB", 10),
        uniqueSearchUsers: optionalNumber(exact?.unique_search_users),
        uniqueViewUsers: optionalNumber(exact?.unique_view_users),
        viewConversion: optionalNumber(exact?.view_conversion),
        queryIndex: optionalNumber(exact?.query_index),
        totalQueries: finiteNumber(payload?.total, queries.length),
        storesChecked: stores.length,
      };
      if (metrics.found) return metrics;
      if (!firstSuccessful) firstSuccessful = metrics;
    } catch (error) {
      errors.push(`${store.name}：${error.message || String(error)}`);
    }
  }
  if (firstSuccessful) return firstSuccessful;
  const error = new Error(errors.join("；") || "无法读取 Ozon Seller API 关键词数据。");
  error.status = 503;
  error.code = "OZON_SELLER_API_ERROR";
  throw error;
}

function normalizeBrowserProduct(raw, fallbackRank) {
  const productId = extractProductId(raw?.productId || raw?.sku || raw?.url || "");
  if (!productId) return null;
  const rank = Math.max(1, Math.round(finiteNumber(raw?.rank, fallbackRank)));
  const sales = optionalNumber(raw?.sales ?? raw?.sales30);
  return {
    rank,
    productId,
    name: compactText(raw?.name || `Ozon ${productId}`, 300),
    url: compactText(raw?.url || `https://www.ozon.ru/context/detail/id/${productId}/`, 500),
    image: compactText(raw?.image, 500),
    brand: compactText(raw?.brand, 160),
    seller: compactText(raw?.seller, 200),
    price: optionalNumber(raw?.price),
    regularPrice: optionalNumber(raw?.regularPrice),
    rating: optionalNumber(raw?.rating),
    reviews: optionalNumber(raw?.reviews),
    sales,
    dailySales: sales === null ? null : Number((sales / DEFAULT_DAYS).toFixed(2)),
    revenue: optionalNumber(raw?.revenue ?? raw?.revenue30),
    stock: optionalNumber(raw?.stock),
    promotion: compactText(raw?.promotion, 120),
    sponsored: Boolean(raw?.sponsored),
    detailReady: sales !== null,
    updatedAt: compactText(raw?.updatedAt, 40),
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function thresholdAt(products, requestedRank, ownSales) {
  const effectiveRank = Math.min(requestedRank, products.length);
  const start = Math.max(0, effectiveRank - 5);
  const end = Math.min(products.length, effectiveRank + 4);
  const samples = products.slice(start, end).map((item) => item.sales).filter(Number.isFinite);
  const monthly = median(samples);
  if (monthly === null) {
    return { targetRank: requestedRank, monthlyOrders: null, dailyOrders: null, additionalMonthlyOrders: null, additionalDailyOrders: null, sampleSize: 0 };
  }
  const monthlyOrders = Math.max(0, Math.ceil(monthly));
  const additionalMonthlyOrders = Number.isFinite(ownSales) ? Math.max(0, monthlyOrders - ownSales) : null;
  return {
    targetRank: requestedRank,
    monthlyOrders,
    dailyOrders: Math.ceil(monthlyOrders / DEFAULT_DAYS),
    additionalMonthlyOrders,
    additionalDailyOrders: additionalMonthlyOrders === null ? null : Math.ceil(additionalMonthlyOrders / DEFAULT_DAYS),
    sampleSize: samples.length,
  };
}

function safeSearchUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /(^|\.)ozon\.ru$/i.test(url.hostname) ? url.toString().slice(0, 1000) : "";
  } catch {
    return "";
  }
}

function normalizeHashtag(value) {
  const cleaned = compactText(value, 82).replace(/^[^#]*#/, "#").replace(/[^\p{L}\p{N}_#].*$/u, "");
  if (!/^#[\p{L}\p{N}_]{2,80}$/u.test(cleaned)) return "";
  return cleaned;
}

function hashtagParts(value) {
  return String(value || "").toLocaleLowerCase("ru-RU").match(/[\p{L}\p{N}]+/gu) || [];
}

function hashtagContainsBrand(tag, brands) {
  const tagTokens = hashtagParts(String(tag || "").replace(/^#/, ""));
  const tagCompact = tagTokens.join("");
  if (!tagCompact) return false;
  return brands.some((brand) => {
    const brandTokens = hashtagParts(brand);
    const brandCompact = brandTokens.join("");
    if (brandCompact.length < 2) return false;
    return tagTokens.includes(brandCompact) || tagCompact === brandCompact || (brandTokens.length > 1 && tagCompact.includes(brandCompact));
  });
}

function normalizeHashtagProducts(input) {
  const source = Array.isArray(input?.hashtagProducts)
    ? input.hashtagProducts
    : Array.isArray(input?.hashtagAnalysis?.products) ? input.hashtagAnalysis.products : [];
  return source.slice(0, HASHTAG_LINK_LIMIT).map((raw, index) => {
    const brands = Array.from(new Set((Array.isArray(raw?.brands) ? raw.brands : [])
      .map((value) => compactText(value, 120))
      .filter((value) => value && !/^(?:нет бренда|no brand|без бренда)$/i.test(value))));
    const unique = new Map();
    let excludedBrandCount = Math.max(0, Math.round(finiteNumber(raw?.excludedBrandCount, Array.isArray(raw?.excludedBrandTags) ? raw.excludedBrandTags.length : 0)));
    (Array.isArray(raw?.tags) ? raw.tags : []).slice(0, 300).forEach((value) => {
      const tag = normalizeHashtag(value);
      if (!tag) return;
      if (hashtagContainsBrand(tag, brands)) {
        excludedBrandCount += 1;
        return;
      }
      const key = tag.toLocaleLowerCase("ru-RU");
      if (!unique.has(key)) unique.set(key, tag);
    });
    return {
      rank: Math.max(1, Math.round(finiteNumber(raw?.rank, index + 1))),
      productId: extractProductId(raw?.productId || raw?.url || ""),
      url: safeSearchUrl(raw?.url),
      tags: Array.from(unique.values()),
      brands,
      excludedBrandCount,
      error: compactText(raw?.error, 160),
    };
  });
}

function buildHashtagAnalysis(input) {
  const products = normalizeHashtagProducts(input);
  const existing = new Map((Array.isArray(input?.hashtagAnalysis?.allTags) ? input.hashtagAnalysis.allTags : [])
    .map((item) => [normalizeHashtag(item?.tag).toLocaleLowerCase("ru-RU"), compactText(item?.translation, 120)]));
  const successful = products.filter((item) => !item.error);
  const counts = new Map();
  successful.forEach((product) => product.tags.forEach((tag) => {
    const key = tag.toLocaleLowerCase("ru-RU");
    const current = counts.get(key) || { tag, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }));
  const denominator = successful.length;
  const allTags = Array.from(counts.values())
    .map((item) => ({
      ...item,
      rate: denominator ? Number((item.count / denominator).toFixed(4)) : 0,
      translation: existing.get(item.tag.toLocaleLowerCase("ru-RU")) || "",
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ru"));
  const repeated = allTags.filter((item) => item.count > 1);
  return {
    requestedLimit: HASHTAG_LINK_LIMIT,
    attemptedCount: products.length,
    successfulCount: successful.length,
    failedCount: products.length - successful.length,
    linksWithTags: successful.filter((item) => item.tags.length).length,
    uniqueTagCount: allTags.length,
    repeatedTagCount: repeated.length,
    excludedBrandTagCount: products.reduce((sum, item) => sum + item.excludedBrandCount, 0),
    totalOccurrences: allTags.reduce((sum, item) => sum + item.count, 0),
    rateDenominator: denominator,
    rateDefinition: "包含该标签的成功商品链接数 ÷ 成功读取的商品链接数；同一链接内重复标签只计一次。",
    sourceArea: "商品详情页“Характеристики”上方的蓝色 #标签区域。",
    brandFilter: "商品品牌及包含品牌词的标签已排除，不参与统计和复制。",
    topTags: (repeated.length ? repeated : allTags).slice(0, 20),
    allTags,
    products,
    translationConfigured: Boolean(input?.hashtagAnalysis?.translationConfigured),
    translationError: compactText(input?.hashtagAnalysis?.translationError, 240),
  };
}

async function translateHashtagAnalysis(env, analysis) {
  if (!analysis.allTags.length || !env.OPENAI_API_KEY) {
    return { ...analysis, translationConfigured: Boolean(env.OPENAI_API_KEY) };
  }
  const tags = analysis.allTags.slice(0, HASHTAG_TRANSLATION_LIMIT).map((item) => item.tag);
  const baseUrl = String(env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是俄语电商标签翻译器。把俄文 hashtag 翻译成简洁自然的简体中文，只输出 JSON 对象，键必须保留原始 hashtag，值为中文含义（不带#）。品牌名可音译或保留原文。" },
          { role: "user", content: `翻译这些 Ozon 商品标签：${JSON.stringify(tags)}` },
        ],
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(compactText(payload?.error?.message || `HTTP ${response.status}`, 180));
    let translations = {};
    try {
      const content = String(payload?.choices?.[0]?.message?.content || "{}").replace(/^```(?:json)?\s*|\s*```$/gi, "");
      translations = JSON.parse(content);
    } catch {
      translations = {};
    }
    const translated = analysis.allTags.map((item) => ({
      ...item,
      translation: compactText(translations[item.tag] || item.translation, 120),
    }));
    const byKey = new Map(translated.map((item) => [item.tag.toLocaleLowerCase("ru-RU"), item]));
    return {
      ...analysis,
      allTags: translated,
      topTags: analysis.topTags.map((item) => byKey.get(item.tag.toLocaleLowerCase("ru-RU")) || item),
      translationConfigured: true,
      translationError: "",
      translatedCount: translated.filter((item) => item.translation).length,
    };
  } catch (error) {
    return {
      ...analysis,
      translationConfigured: true,
      translationError: error?.name === "AbortError" ? "中文翻译请求超时，俄文标签已完整保留。" : `中文翻译失败：${compactText(error?.message || error, 180)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validateSnapshot(input) {
  const keyword = compactText(input.keyword, 120);
  if (keyword.length < 2) {
    const error = new Error("采集快照缺少有效关键词。");
    error.status = 400;
    error.code = "INVALID_KEYWORD";
    throw error;
  }
  const source = Array.isArray(input.products) ? input.products : [];
  const seen = new Set();
  const products = source
    .slice(0, MAX_RESULTS * 2)
    .map((row, index) => normalizeBrowserProduct(row, index + 1))
    .filter((row) => {
      if (!row || seen.has(row.productId)) return false;
      seen.add(row.productId);
      return true;
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_RESULTS);
  if (!products.length) {
    const error = new Error("未在页面中读到 MPStats 搜索结果表。请确认 MPStats 插件已显示“搜索结果”表格后重试。");
    error.status = 400;
    error.code = "EMPTY_BROWSER_SNAPSHOT";
    throw error;
  }
  return {
    keyword,
    products,
    searchUrl: safeSearchUrl(input.searchUrl),
    generatedAt: input.generatedAt && !Number.isNaN(Date.parse(input.generatedAt)) ? new Date(input.generatedAt).toISOString() : new Date().toISOString(),
  };
}

async function kvGet(env, key) {
  if (!env.LISTING_CACHE?.get) return null;
  return env.LISTING_CACHE.get(key, "json");
}

async function kvPut(env, key, value, ttl = SNAPSHOT_TTL_SECONDS) {
  if (!env.LISTING_CACHE?.put) {
    const error = new Error("Chrome 自动采集需要 Cloudflare KV 绑定 LISTING_CACHE。");
    error.status = 503;
    error.code = "KV_NOT_CONFIGURED";
    throw error;
  }
  await env.LISTING_CACHE.put(key, JSON.stringify(value), { expirationTtl: ttl });
}

async function updateHistory(env, result) {
  if (!env.LISTING_CACHE?.get || !env.LISTING_CACHE?.put || !result.productId) return [];
  const key = `ozon-ranking:history:${keywordKey(result.keyword)}:${result.productId}`;
  const history = await kvGet(env, key) || [];
  const observation = {
    date: result.generatedAt.slice(0, 10),
    generatedAt: result.generatedAt,
    rank: result.ownRank,
    sales30: result.ownProduct?.sales ?? null,
    officialOrders: result.official?.orders ?? null,
    officialGmv: result.official?.gmv ?? null,
    searchUsers: result.official?.uniqueSearchUsers ?? null,
    viewConversion: result.official?.viewConversion ?? null,
  };
  const merged = [...history.filter((row) => row.date !== observation.date), observation]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-90);
  await kvPut(env, key, merged, SNAPSHOT_TTL_SECONDS * 4);
  return merged;
}

async function analyzeSnapshot(env, rawSnapshot, input = {}) {
  const snapshot = validateSnapshot(rawSnapshot);
  const hashtagAnalysis = buildHashtagAnalysis(rawSnapshot);
  const productId = extractProductId(input.productId || rawSnapshot.productId || "");
  const ownProduct = productId ? snapshot.products.find((row) => row.productId === productId) || null : null;
  let official = { available: false, found: false, reason: "未填写自己的 Product ID" };
  if (productId) {
    try {
      official = await officialKeywordMetrics(env, { keyword: snapshot.keyword, productId, days: DEFAULT_DAYS });
    } catch (error) {
      official = { available: true, found: false, error: error.message || String(error) };
    }
  }
  const ownRank = official.position ?? ownProduct?.rank ?? null;
  if (ownProduct) ownProduct.rank = ownRank ?? ownProduct.rank;
  snapshot.products.sort((a, b) => a.rank - b.rank);
  const ownSales = optionalNumber(ownProduct?.sales);
  const thresholds = [3, 10, 20, 50, 100]
    .filter((rank) => rank <= snapshot.products.length || rank === 100)
    .map((rank) => thresholdAt(snapshot.products, rank, ownSales));
  const salesCoverage = snapshot.products.length
    ? snapshot.products.filter((item) => Number.isFinite(item.sales)).length / snapshot.products.length
    : 0;
  const confidence = snapshot.products.length >= 50 && salesCoverage >= 0.9
    ? "high"
    : snapshot.products.length >= 16 && salesCoverage >= 0.7 ? "medium" : "low";
  const result = {
    ok: true,
    source: "chrome-mpstats-overlay+ozon-seller-api",
    keyword: snapshot.keyword,
    productId: productId || null,
    range: reportRange(DEFAULT_DAYS, 1),
    days: DEFAULT_DAYS,
    generatedAt: snapshot.generatedAt,
    frequency: official.uniqueSearchUsers ?? null,
    totalAvailable: snapshot.products.length,
    resultCount: snapshot.products.length,
    ownRank,
    ownAverageRank: official.position ?? null,
    ownProduct,
    official,
    thresholds,
    products: snapshot.products,
    hashtagAnalysis,
    searchUrl: snapshot.searchUrl,
    diagnostics: {
      detailCoverage: 1,
      salesCoverage: Number(salesCoverage.toFixed(3)),
      confidence,
      partialErrors: official.error ? [{ productId, error: official.error }] : [],
    },
    methodology: {
      ranking: "Top 100 来自当前 Chrome 中 Ozon 搜索页的 MPStats 插件表格；自己的排名优先采用 Ozon Seller API 关键词数据。",
      threshold: "坑产为目标名次附近最多 9 个商品的 30 天订单量中位数，再换算为日单量。",
      caveat: "排名会受广告、转化、评价、价格、库存、配送时效、地区和个性化搜索影响；坑产是运营估算，不是 Ozon 官方承诺。",
    },
  };
  result.history = await updateHistory(env, result);
  return result;
}

async function saveAndAnalyzeSnapshot(env, input) {
  const snapshot = validateSnapshot(input);
  const stored = {
    ...snapshot,
    productId: extractProductId(input.productId || ""),
  };
  await kvPut(env, `ozon-ranking:browser:${keywordKey(snapshot.keyword)}`, stored);
  const result = await analyzeSnapshot(env, stored, input);
  const resultKey = `ozon-ranking:latest:${keywordKey(snapshot.keyword)}:${result.productId || "none"}`;
  await kvPut(env, resultKey, result);
  return result;
}

async function saveHashtagSnapshot(env, input) {
  const keyword = compactText(input.keyword, 120);
  if (keyword.length < 2) {
    const error = new Error("标签快照缺少有效关键词。");
    error.status = 400;
    error.code = "INVALID_KEYWORD";
    throw error;
  }
  let hashtagAnalysis = buildHashtagAnalysis(input);
  if (!hashtagAnalysis.attemptedCount) {
    const error = new Error("没有收到商品标签数据，请在 Ozon 关键词搜索页重新运行独立标签采集器。");
    error.status = 400;
    error.code = "EMPTY_HASHTAG_SNAPSHOT";
    throw error;
  }
  hashtagAnalysis = await translateHashtagAnalysis(env, hashtagAnalysis);
  const stored = {
    keyword,
    hashtagAnalysis,
    searchUrl: safeSearchUrl(input.searchUrl),
    generatedAt: input.generatedAt && !Number.isNaN(Date.parse(input.generatedAt)) ? new Date(input.generatedAt).toISOString() : new Date().toISOString(),
  };
  await kvPut(env, `ozon-ranking:hashtags:${keywordKey(keyword)}`, stored);
  return { ok: true, ...stored };
}

async function latestHashtagSnapshot(env, input) {
  const keyword = compactText(input.keyword, 120);
  if (keyword.length < 2) {
    const error = new Error("请输入至少 2 个字符的 Ozon 关键词。");
    error.status = 400;
    error.code = "INVALID_KEYWORD";
    throw error;
  }
  const stored = await kvGet(env, `ozon-ranking:hashtags:${keywordKey(keyword)}`);
  if (!stored) {
    const error = new Error("还没有这个关键词的标签快照。请先运行独立的“Ozon 标签采集器”。");
    error.status = 404;
    error.code = "HASHTAG_SNAPSHOT_REQUIRED";
    throw error;
  }
  return { ok: true, ...stored, hashtagAnalysis: buildHashtagAnalysis(stored) };
}

async function analyzeLatestSnapshot(env, input) {
  const keyword = compactText(input.keyword, 120);
  if (keyword.length < 2) {
    const error = new Error("请输入至少 2 个字符的 Ozon 关键词。");
    error.status = 400;
    error.code = "INVALID_KEYWORD";
    throw error;
  }
  const snapshot = await kvGet(env, `ozon-ranking:browser:${keywordKey(keyword)}`);
  if (!snapshot) {
    const error = new Error("还没有这个关键词的 Chrome 快照。请先在 Ozon 搜索页运行“Ozon 排名采集器”。");
    error.status = 404;
    error.code = "BROWSER_SNAPSHOT_REQUIRED";
    throw error;
  }
  const hashtagSnapshot = await kvGet(env, `ozon-ranking:hashtags:${keywordKey(keyword)}`);
  const result = await analyzeSnapshot(env, hashtagSnapshot?.hashtagAnalysis ? { ...snapshot, hashtagAnalysis: hashtagSnapshot.hashtagAnalysis } : snapshot, input);
  await kvPut(env, `ozon-ranking:latest:${keywordKey(keyword)}:${result.productId || "none"}`, result);
  return result;
}

async function authorizeSnapshotUpload(request, env) {
  const collector = await verifyCollector(request, env);
  if (collector) return { ok: true, user: { username: collector.sub, role: collector.role } };
  return verifyAuth(request, env);
}

export async function onRequest({ request, env, params }) {
  if (request.method === "OPTIONS") return json({}, 204);
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");

  if (path === "health") {
    return json({
      ok: true,
      service: "ozon-keyword-ranking-api",
      provider: "chrome-mpstats-overlay+ozon-seller-api",
      configured: ozonStores(env).length > 0,
      storeCount: ozonStores(env).length,
      snapshotStorageConfigured: Boolean(env.LISTING_CACHE?.get && env.LISTING_CACHE?.put),
      maxResults: MAX_RESULTS,
      hashtagLinkLimit: HASHTAG_LINK_LIMIT,
      translationConfigured: Boolean(env.OPENAI_API_KEY),
    });
  }

  if (path === "collector/snapshot" && request.method === "POST") {
    const collectorAuth = await authorizeSnapshotUpload(request, env);
    if (!collectorAuth.ok) return json({ ok: false, error: collectorAuth.error }, collectorAuth.status);
    try {
      const input = await request.json().catch(() => ({}));
      const result = await saveAndAnalyzeSnapshot(env, input);
      return json({ ...result, collector: { accepted: true, user: collectorAuth.user.username } });
    } catch (error) {
      return json({ ok: false, code: error.code || "SNAPSHOT_ERROR", error: error.message || String(error) }, Number(error.status || 500));
    }
  }

  if (path === "collector/hashtags" && request.method === "POST") {
    const collectorAuth = await authorizeSnapshotUpload(request, env);
    if (!collectorAuth.ok) return json({ ok: false, error: collectorAuth.error }, collectorAuth.status);
    try {
      const input = await request.json().catch(() => ({}));
      const result = await saveHashtagSnapshot(env, input);
      return json({ ...result, collector: { accepted: true, user: collectorAuth.user.username } });
    } catch (error) {
      return json({ ok: false, code: error.code || "HASHTAG_SNAPSHOT_ERROR", error: error.message || String(error) }, Number(error.status || 500));
    }
  }

  const auth = await verifyAuth(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  try {
    if (path === "collector/pair" && request.method === "POST") {
      return json({ ok: true, ...(await issueCollectorToken(auth.user, env)) });
    }
    if (path === "search" && request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      return json(await analyzeLatestSnapshot(env, input));
    }
    if (path === "hashtags/search" && request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      return json(await latestHashtagSnapshot(env, input));
    }
    if (path === "official" && request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      return json({ ok: true, official: await officialKeywordMetrics(env, input) });
    }
    if (path === "latest" && request.method === "GET") {
      const url = new URL(request.url);
      const keyword = compactText(url.searchParams.get("keyword"), 120);
      const productId = extractProductId(url.searchParams.get("productId")) || "none";
      if (!keyword) return json({ ok: false, error: "缺少 keyword。" }, 400);
      const result = await kvGet(env, `ozon-ranking:latest:${keywordKey(keyword)}:${productId}`);
      return result ? json(result) : json({ ok: false, error: "没有找到历史快照。" }, 404);
    }
    return json({ ok: false, error: "Not found", path }, 404);
  } catch (error) {
    return json({
      ok: false,
      code: error.code || "OZON_RANKING_ERROR",
      error: error.message || String(error),
    }, Number(error.status || 500));
  }
}
