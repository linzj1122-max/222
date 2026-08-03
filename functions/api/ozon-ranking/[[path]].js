/* Ozon keyword ranking and sales-threshold analysis backed by MPStats Analytics. */

const MPSTATS_BASE_URL = "https://mpstats.io/api/analytics/v1/oz";
const DEFAULT_DAYS = 30;
const MAX_RESULTS = 100;

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
  const expected = await hmacSha256(authSecret(env), `${parts[0]}.${parts[1]}`);
  if (expected !== parts[2]) return { ok: false, status: 401, error: "登录已失效，请重新登录。" };
  let payload = null;
  try { payload = JSON.parse(base64UrlDecodeText(parts[1])); } catch { payload = null; }
  if (!payload?.sub || Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) {
    return { ok: false, status: 401, error: "登录已过期，请重新登录。" };
  }
  return { ok: true, user: { username: String(payload.sub), role: String(payload.role || "member") } };
}

function configuredToken(env) {
  return String(env.MPSTATS_API_TOKEN || env.MPSTATS_TOKEN || "").trim();
}

function compactText(value, maxLength = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rubles(value) {
  const number = optionalNumber(value);
  return number === null ? null : Math.round(number) / 100;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function reportRange(days) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days - 1));
  return { d1: formatDate(start), d2: formatDate(end) };
}

function normalizeKeyword(value) {
  return compactText(value, 120).toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function extractProductId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{5,20}$/.test(text)) return text;
  const matches = [...text.matchAll(/(?:detail\/id\/|product\/|sku[=/:-]?)(\d{5,20})/gi)];
  return matches[0]?.[1] || "";
}

async function mpstatsRequest(env, pathname, options = {}) {
  const token = configuredToken(env);
  if (!token) {
    const error = new Error("尚未配置 MPSTATS_API_TOKEN，无法获取真实 Ozon 排名数据。");
    error.code = "DATA_SOURCE_NOT_CONFIGURED";
    error.status = 503;
    throw error;
  }
  const base = String(env.MPSTATS_BASE_URL || MPSTATS_BASE_URL).replace(/\/+$/, "");
  const url = new URL(`${base}/${String(pathname || "").replace(/^\/+/, "")}`);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-Mpstats-TOKEN": token,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const upstreamMessage = compactText(data?.message || data?.error || text, 240);
    const error = new Error(`MPStats 请求失败（HTTP ${response.status}）${upstreamMessage ? `：${upstreamMessage}` : ""}`);
    error.code = response.status === 401 || response.status === 403 ? "MPSTATS_AUTH_FAILED" : "MPSTATS_UPSTREAM_ERROR";
    error.status = response.status === 401 || response.status === 403 ? 502 : 503;
    throw error;
  }
  return data;
}

function itemList(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "items", "result", "products"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function productIdOf(item) {
  return String(item?.id || item?.sku || item?.product_id || item?.productId || "").trim();
}

function normalizeProduct(listItem, detail, rank, days) {
  const source = detail && typeof detail === "object" ? detail : {};
  const period = source.period_stats || source.periodStats || listItem?.period_stats || {};
  const price = source.price && typeof source.price === "object" ? source.price : {};
  const seller = source.seller && typeof source.seller === "object" ? source.seller : listItem?.seller || {};
  const brand = source.brand && typeof source.brand === "object"
    ? source.brand.name
    : source.brand || (typeof listItem?.brand === "object" ? listItem.brand.name : listItem?.brand);
  const id = productIdOf(source) || productIdOf(listItem);
  const monthlySales = optionalNumber(period.sales ?? source.sales ?? listItem?.sales);
  const revenue = rubles(period.revenue ?? source.revenue ?? listItem?.revenue);
  const finalPriceRaw = price.final_price ?? price.ozon_card_price ?? source.final_price ?? listItem?.final_price;
  const regularPriceRaw = price.price ?? source.price_value ?? listItem?.price;
  const image = source.photo?.list?.[0]?.m || source.photo?.list?.[0]?.t || source.thumb_middle || source.thumb || listItem?.thumb_middle || listItem?.thumb || "";
  return {
    rank,
    productId: id,
    name: compactText(source.name || listItem?.name || `Ozon ${id}`, 300),
    url: compactText(source.link || source.url || listItem?.url || `https://www.ozon.ru/context/detail/id/${id}/`, 500),
    image: compactText(image, 500),
    brand: compactText(brand, 160),
    seller: compactText(seller?.name || seller, 200),
    price: rubles(finalPriceRaw ?? regularPriceRaw),
    regularPrice: rubles(regularPriceRaw),
    rating: optionalNumber(source.rating ?? listItem?.rating),
    reviews: optionalNumber(source.comments ?? source.reviews ?? listItem?.comments ?? listItem?.reviews),
    sales: monthlySales,
    dailySales: monthlySales === null ? null : Number((monthlySales / days).toFixed(2)),
    revenue,
    stock: optionalNumber(source.balance ?? listItem?.balance),
    deliveryScheme: compactText(source.delivery_scheme || listItem?.delivery_scheme, 40),
    detailReady: Boolean(detail),
    updatedAt: compactText(source.updated || listItem?.updated, 40),
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        output[index] = await mapper(items[index], index);
      } catch (error) {
        output[index] = { __error: error.message || String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return output;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function thresholdAt(products, targetRank, ownSales, days) {
  const start = Math.max(0, targetRank - 5);
  const end = Math.min(products.length, targetRank + 4);
  const neighborhood = products.slice(start, end).map((item) => item.sales).filter(Number.isFinite);
  const monthly = median(neighborhood);
  if (monthly === null) {
    return { targetRank, monthlyOrders: null, dailyOrders: null, additionalMonthlyOrders: null, additionalDailyOrders: null, sampleSize: 0 };
  }
  const monthlyOrders = Math.max(0, Math.ceil(monthly));
  const additionalMonthlyOrders = Number.isFinite(ownSales) ? Math.max(0, monthlyOrders - ownSales) : null;
  return {
    targetRank,
    monthlyOrders,
    dailyOrders: Math.max(0, Math.ceil(monthlyOrders / days)),
    additionalMonthlyOrders,
    additionalDailyOrders: additionalMonthlyOrders === null ? null : Math.max(0, Math.ceil(additionalMonthlyOrders / days)),
    sampleSize: neighborhood.length,
  };
}

function keywordPosition(payload, keyword) {
  const rows = itemList(payload);
  const wanted = normalizeKeyword(keyword);
  const exact = rows.find((row) => normalizeKeyword(row.query || row.keyword) === wanted);
  if (!exact) return { current: null, average: null, frequency: null };
  const positions = Array.isArray(exact.positions) ? exact.positions.map(optionalNumber).filter(Number.isFinite) : [];
  return {
    current: positions.length ? positions[positions.length - 1] : optionalNumber(exact.position),
    average: optionalNumber(exact.avg_position ?? exact.average_position),
    frequency: optionalNumber(exact.count ?? exact.frequency),
  };
}

function latestFrequency(payload) {
  const rows = itemList(payload);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return optionalNumber(sorted[0]?.frequency ?? sorted[0]?.count);
}

async function analyzeKeyword(env, input) {
  const keyword = compactText(input.keyword, 120);
  if (keyword.length < 2) {
    const error = new Error("请输入至少 2 个字符的 Ozon 关键词。");
    error.status = 400;
    error.code = "INVALID_KEYWORD";
    throw error;
  }
  const requestedProductId = input.productId || input.productUrl || input.ownProductId || "";
  const productId = extractProductId(requestedProductId);
  if (requestedProductId && !productId) {
    const error = new Error("商品 ID 无效，请输入 Ozon Product ID 或完整商品链接。");
    error.status = 400;
    error.code = "INVALID_PRODUCT_ID";
    throw error;
  }
  const days = Math.min(90, Math.max(7, Math.round(finiteNumber(input.days, DEFAULT_DAYS))));
  const limit = Math.min(MAX_RESULTS, Math.max(10, Math.round(finiteNumber(input.limit, MAX_RESULTS))));
  const range = reportRange(days);
  const listPayload = await mpstatsRequest(env, "items", {
    method: "POST",
    query: { keyword, d1: range.d1, d2: range.d2, startRow: 0, endRow: limit },
    body: {},
  });
  const baseItems = itemList(listPayload).slice(0, limit).filter((item) => productIdOf(item));
  if (!baseItems.length) {
    const error = new Error("该关键词没有返回商品数据，请检查关键词或 MPStats Ozon Analytics 权限。");
    error.status = 404;
    error.code = "NO_RESULTS";
    throw error;
  }

  const detailResults = await mapWithConcurrency(baseItems, 8, (item) =>
    mpstatsRequest(env, `items/${encodeURIComponent(productIdOf(item))}/full`, { query: range })
  );
  const detailErrors = [];
  const products = baseItems.map((item, index) => {
    const result = detailResults[index];
    if (result?.__error) detailErrors.push({ productId: productIdOf(item), error: result.__error });
    return normalizeProduct(item, result?.__error ? null : result, index + 1, days);
  });

  let ownProduct = productId ? products.find((item) => item.productId === productId) || null : null;
  if (productId && !ownProduct) {
    try {
      const detail = await mpstatsRequest(env, `items/${encodeURIComponent(productId)}/full`, { query: range });
      ownProduct = normalizeProduct({ id: productId }, detail, null, days);
    } catch (error) {
      detailErrors.push({ productId, error: error.message || String(error) });
    }
  }

  let position = { current: null, average: null, frequency: null };
  if (productId) {
    try {
      const oneDay = { d1: range.d2, d2: range.d2 };
      let keywordPayload = await mpstatsRequest(env, `items/${encodeURIComponent(productId)}/keywords`, { query: oneDay });
      position = keywordPosition(keywordPayload, keyword);
      if (position.current === null && position.average === null) {
        keywordPayload = await mpstatsRequest(env, `items/${encodeURIComponent(productId)}/keywords`, { query: range });
        position = keywordPosition(keywordPayload, keyword);
      }
    } catch (error) {
      detailErrors.push({ productId, error: `关键词排名：${error.message || String(error)}` });
    }
  }

  let frequency = position.frequency;
  try {
    const frequencyPayload = await mpstatsRequest(env, "keywords/frequency", { query: { keyword } });
    frequency = latestFrequency(frequencyPayload) ?? frequency;
  } catch (error) {
    detailErrors.push({ productId: "keyword", error: `搜索频率：${error.message || String(error)}` });
  }

  const listRank = productId ? products.find((item) => item.productId === productId)?.rank ?? null : null;
  const ownRank = position.current ?? listRank;
  if (ownProduct) ownProduct.rank = ownRank;
  const ownSales = optionalNumber(ownProduct?.sales);
  const thresholds = [3, 10, 20, 50, 100]
    .filter((rank) => rank <= products.length || rank === 100)
    .map((rank) => thresholdAt(products, Math.min(rank, products.length), ownSales, days))
    .map((item, index) => ({ ...item, targetRank: [3, 10, 20, 50, 100].filter((rank) => rank <= products.length || rank === 100)[index] }));
  const detailCoverage = products.length ? products.filter((item) => item.detailReady).length / products.length : 0;
  const salesCoverage = products.length ? products.filter((item) => Number.isFinite(item.sales)).length / products.length : 0;
  const confidence = detailCoverage >= 0.9 && salesCoverage >= 0.8 ? "high" : detailCoverage >= 0.6 && salesCoverage >= 0.5 ? "medium" : "low";

  const result = {
    ok: true,
    source: "mpstats-ozon-analytics",
    keyword,
    productId: productId || null,
    range,
    days,
    generatedAt: new Date().toISOString(),
    frequency,
    totalAvailable: finiteNumber(listPayload?.total, products.length),
    resultCount: products.length,
    ownRank,
    ownAverageRank: position.average,
    ownProduct,
    thresholds,
    products,
    diagnostics: {
      detailCoverage: Number(detailCoverage.toFixed(3)),
      salesCoverage: Number(salesCoverage.toFixed(3)),
      confidence,
      partialErrors: detailErrors.slice(0, 20),
    },
    methodology: {
      ranking: "Top 100 按 MPStats 关键词商品列表的返回顺序编号；指定商品优先采用 MPStats 商品关键词位置接口。",
      threshold: "坑产为目标名次附近最多 9 个商品在所选周期销量的中位数，不代表 Ozon 官方承诺排名。",
      caveat: "Ozon 排名还会受到广告、点击转化、评价、价格、库存、配送时效和个性化搜索等因素影响。",
    },
  };

  if (env.LISTING_CACHE?.put) {
    const key = `ozon-ranking:latest:${encodeURIComponent(normalizeKeyword(keyword)).slice(0, 180)}:${productId || "none"}`;
    await env.LISTING_CACHE.put(key, JSON.stringify(result), { expirationTtl: 7 * 24 * 60 * 60 }).catch(() => {});
  }
  return result;
}

export async function onRequest({ request, env, params }) {
  if (request.method === "OPTIONS") return json({}, 204);
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (path === "health") {
    return json({
      ok: true,
      service: "ozon-keyword-ranking-api",
      provider: "mpstats-ozon-analytics",
      configured: Boolean(configuredToken(env)),
      maxResults: MAX_RESULTS,
    });
  }

  const auth = await verifyAuth(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  try {
    if (path === "search" && request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      return json(await analyzeKeyword(env, input));
    }
    if (path === "latest" && request.method === "GET") {
      const url = new URL(request.url);
      const keyword = normalizeKeyword(url.searchParams.get("keyword"));
      const productId = extractProductId(url.searchParams.get("productId")) || "none";
      if (!keyword) return json({ ok: false, error: "缺少 keyword。" }, 400);
      const key = `ozon-ranking:latest:${encodeURIComponent(keyword).slice(0, 180)}:${productId}`;
      const result = await env.LISTING_CACHE?.get?.(key, "json");
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
