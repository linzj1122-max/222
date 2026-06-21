const PRODUCTS = [
  { code: "HS", sku: "3555785455", name: "Product HS", purchase: 28, domestic: 5, firstFreight: 4.18, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "HX", sku: "3592078186", name: "Product HX", purchase: 37, domestic: 5, firstFreight: 6.27, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "HX", sku: "3903949202", name: "Product HX", purchase: 37, domestic: 5, firstFreight: 6.27, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "JBAM", sku: "3714580469", name: "Product JBAM", purchase: 35, domestic: 5, firstFreight: 29.046, lastMile: 6, rate: 11.5, platform: "Ozon" },
  { code: "PJ", sku: "3555656299", name: "Product PJ", purchase: 50, domestic: 5, firstFreight: 27.55, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "SFZ", sku: "3555479037", name: "Product SFZ", purchase: 35, domestic: 5, firstFreight: 25.3, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "TBAM", sku: "3714561826", name: "Product TBAM", purchase: 65, domestic: 5, firstFreight: 12.78, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "XFJ", sku: "3555131131", name: "Product XFJ", purchase: 60, domestic: 5, firstFreight: 22.66, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "JW", sku: "4526520053", name: "Product JW", purchase: 28, domestic: 5, firstFreight: 3.52, lastMile: 3.5, rate: 11.5, platform: "Ozon" },
  { code: "CDAM", sku: "4539993573", name: "Product CDAM", purchase: 150, domestic: 5, firstFreight: 120.6, lastMile: 5, rate: 11.5, platform: "Ozon" },
  { code: "AMY", sku: "4488765265", name: "Product AMY", purchase: 950, domestic: 5, firstFreight: 1587.2, lastMile: 0, rate: 11.5, platform: "Ozon" },
  { code: "QB60-GRAY", sku: "4675959653", name: "Product QB60-GRAY", purchase: 74.5, domestic: 12, firstFreight: 43.2, lastMile: 5, rate: 11.5, platform: "Ozon" },
  { code: "QB-60", sku: "4509788886", name: "Product QB-60", purchase: 70.5, domestic: 12, firstFreight: 43.2, lastMile: 5, rate: 11.5, platform: "Ozon" },
  { code: "PK-750", sku: "4509718786", name: "Product PK-750", purchase: 104.5, domestic: 12, firstFreight: 76.61, lastMile: 7, rate: 11.5, platform: "Ozon" },
  { code: "GP-130", sku: "4509770907", name: "Product GP-130", purchase: 104.5, domestic: 12, firstFreight: 141.86, lastMile: 10, rate: 11.5, platform: "Ozon" },
].map((item, index) => ({ ...item, id: `${item.platform}-${item.sku}-${index}` }));

const ADS_REPORT_TASKS = new Map();
const ADS_REPORT_ROWS = new Map();
const ADS_CAMPAIGN_CACHE = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,x-store-platform,x-store-name,x-store-client-id,x-store-secret,x-store-api-key,x-store-token",
    },
  });
}

function amount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function textAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/\s/g, "").replace("%", "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAdKey(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replaceAll("，", ",")
    .replace(/[{}()[\]₽₽.:%]/g, "")
    .toLowerCase();
}

function dateRange(searchParams) {
  const today = new Date();
  const to = searchParams.get("dateTo") || today.toISOString().slice(0, 10);
  const fromDate = new Date(to);
  fromDate.setDate(fromDate.getDate() - 59);
  const from = searchParams.get("dateFrom") || fromDate.toISOString().slice(0, 10);
  return { from, to };
}

// ---------- 数据接口 KV 缓存 ----------
// 绑定名 env.LISTING_CACHE(与 listing 模块共用同一个 KV namespace)。
// 策略:历史数据(to 早于今天)长期缓存;含当天的数据不缓存(实时累加)。
// 商品图等静态数据可长缓存。未绑定 KV 时优雅降级为每次实时拉取。
const DATA_KV_BOUND = () => null; // 占位,实际用 env.LISTING_CACHE

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 判断日期范围是否纯历史(to 早于今天)→ 可缓存
function isHistoricalRange(to) {
  return String(to || "").slice(0, 10) < todayStr();
}

// 生成缓存 key:接口名 + 店铺标识 + 日期范围 + 额外参数
function dataCacheKey(prefix, store, from, to, extra = "") {
  const storeId = (store && (store.clientId || store.token)) || "default";
  return `data:${prefix}:${storeId}:${from}:${to}${extra ? ":" + extra : ""}`;
}

// 读缓存,返回 { data, ts } 或 null
async function kvGetData(env, key) {
  if (!env.LISTING_CACHE) return null;
  try {
    const raw = await env.LISTING_CACHE.get(key, "json");
    return raw && raw.data !== undefined ? raw : null;
  } catch {
    return null;
  }
}

// 写缓存,ttl 秒后过期
async function kvPutData(env, key, data, ttl) {
  if (!env.LISTING_CACHE) return;
  try {
    await env.LISTING_CACHE.put(key, JSON.stringify({ data, ts: Date.now() }), { expirationTtl: ttl });
  } catch {
    // 写入失败不阻塞
  }
}

// 通用:带缓存的接口包装器
// - historicalTtl: 纯历史范围的缓存时长(秒),默认 7 天
// - forceRefresh: 强制跳过缓存
// 注意:loader 可能返回数组(如 analytics)或对象。数组不能被展开成 {...arr},
// 否则前端 .forEach 会报错。这里用 attachCache 保留原始类型,仅附加 _cache 字段。
async function withCache(env, key, historicalTtl, isCacheable, forceRefresh, loader) {
  const attachCache = (payload, cache) => {
    if (Array.isArray(payload)) {
      // 数组:直接返回(不附加字段,避免破坏 forEach);_cache 只在对象路径下生效
      return payload;
    }
    return { ...(payload || {}), _cache: cache };
  };
  // 判断结果是否"有内容"(空数组/空对象不缓存,避免把拉取失败/未完成缓存住)
  const hasContent = (payload) => {
    if (Array.isArray(payload)) return payload.length > 0;
    if (payload && typeof payload === "object") return Object.keys(payload).length > 0;
    return Boolean(payload);
  };
  if (!forceRefresh && isCacheable) {
    const cached = await kvGetData(env, key);
    // 缓存里如果是空结果(之前 bug 存的),也跳过,重新拉取
    if (cached && hasContent(cached.data)) return attachCache(cached.data, { hit: true, ts: cached.ts });
  }
  const fresh = await loader();
  // 只缓存有内容的结果(空结果可能是拉取失败,缓存了会误导 7 天)
  if (isCacheable && hasContent(fresh)) {
    await kvPutData(env, key, fresh, historicalTtl);
  }
  return attachCache(fresh, { hit: false });
}

function ozonStores(env) {
  const stores = [];
  for (let index = 1; index <= 10; index += 1) {
    const name = env[`OZON_STORE_${index}_NAME`];
    const clientId = env[`OZON_STORE_${index}_CLIENT_ID`];
    const apiKey = env[`OZON_STORE_${index}_API_KEY`];
    if (clientId && apiKey) {
      stores.push({ name: name || `Ozon 店铺 ${index}`, clientId, apiKey });
    }
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
      // Invalid JSON is surfaced in /api/debug via storeCount = 0.
    }
  }
  if (env.OZON_CLIENT_ID && env.OZON_API_KEY) {
    stores.push({ name: env.OZON_STORE_NAME || "Ozon 店铺", clientId: env.OZON_CLIENT_ID, apiKey: env.OZON_API_KEY });
  }
  return stores;
}

async function fetchOzonPostings(kind, from, to, store) {
  const endpoint = kind === "fbo"
    ? "https://api-seller.ozon.ru/v2/posting/fbo/list"
    : "https://api-seller.ozon.ru/v3/posting/fbs/list";
  const body = {
    dir: "ASC",
    filter: { since: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
    limit: 1000,
    offset: 0,
    with: { analytics_data: false, financial_data: true },
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "client-id": store.clientId,
      "api-key": store.apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ozon ${kind.toUpperCase()} API ${response.status}: ${text.slice(0, 240)}`);
  }
  const payload = await response.json();
  return payload.result?.postings || payload.result || [];
}

async function fetchOzonFinanceTransactions(from, to, store) {
  const rows = [];
  const ranges = splitDateRange(from, to, 28);
  for (const range of ranges) {
    let page = 1;
    let pageCount = 1;
    while (page <= pageCount && page <= 20) {
      const response = await fetch("https://api-seller.ozon.ru/v3/finance/transaction/list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "client-id": store.clientId,
          "api-key": store.apiKey,
        },
        body: JSON.stringify({
          filter: {
            date: { from: `${range.from}T00:00:00Z`, to: `${range.to}T23:59:59Z` },
            transaction_type: "all",
          },
          page,
          page_size: 1000,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ozon finance API ${response.status}: ${text.slice(0, 240)}`);
      }
      const payload = await response.json();
      const result = payload.result || {};
      rows.push(...(result.operations || []));
      pageCount = Number(result.page_count || 1);
      page += 1;
    }
  }
  return rows;
}

function splitDateRange(from, to, maxDays) {
  const ranges = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const chunkFrom = cursor.toISOString().slice(0, 10);
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    ranges.push({ from: chunkFrom, to: chunkEnd.toISOString().slice(0, 10) });
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return ranges;
}

function financeBucketForService(serviceName) {
  const name = String(serviceName || "").toLowerCase();
  if (/acquir|эквайр|оплат/.test(name)) return "acquiringFee";
  if (/logistic|delivery|deliver|return|drop.?off|достав|логист|возврат/.test(name)) return "logisticsFee";
  return "otherFixedFee";
}

function financeIndex(transactions) {
  const map = new Map();
  for (const operation of transactions) {
    const postingNo = operation.posting?.posting_number || operation.posting_number || "";
    if (!postingNo) continue;
    const current = map.get(postingNo) || {
      backendPrice: 0,
      commission: 0,
      logisticsFee: 0,
      handlingFee: 0,
      acquiringFee: 0,
      otherFixedFee: 0,
      refundFee: 0,
      financeReady: false,
    };
    current.backendPrice += Math.max(amount(operation.accruals_for_sale), 0);
    current.commission += Math.abs(amount(operation.sale_commission));
    for (const service of operation.services || []) {
      const value = amount(service.price);
      if (value >= 0) continue;
      current[financeBucketForService(service.name)] += Math.abs(value);
    }
    const opText = `${operation.operation_type || ""} ${operation.operation_type_name || ""}`.toLowerCase();
    if (/return|refund|возврат/.test(opText)) current.refundFee += Math.abs(amount(operation.amount));
    current.financeReady = true;
    map.set(postingNo, current);
  }
  return map;
}

async function fetchOzonOrders(env, from, to) {
  const stores = ozonStores(env);
  const rows = [];
  for (const store of stores) {
    const postings = [
      ...(await fetchOzonPostings("fbs", from, to, store)),
      ...(await fetchOzonPostings("fbo", from, to, store)),
    ];
    const financeByPosting = financeIndex(await fetchOzonFinanceTransactions(from, to, store));
    for (const posting of postings) {
      const date = String(posting.in_process_at || posting.created_at || posting.shipment_date || "").slice(0, 10);
      const postingNo = posting.posting_number || posting.order_id || "";
      const finance = financeByPosting.get(postingNo) || {};
      const products = posting.products || [];
      const productCount = Math.max(products.length, 1);
      for (const product of posting.products || []) {
        const sale = amount(product.price) * amount(product.quantity || 1);
        const financeSale = amount(finance.backendPrice);
        const allocation = financeSale > 0 ? sale / financeSale : 1 / productCount;
        rows.push({
          date,
          store: store.name,
          orderNo: postingNo,
          sku: String(product.offer_id || product.sku || product.name || ""),
          sale,
          backendPrice: financeSale > 0 ? financeSale * allocation : sale,
          commission: amount(finance.commission) * allocation || amount(product.commission_amount),
          logisticsFee: amount(finance.logisticsFee) * allocation,
          handlingFee: amount(finance.handlingFee) * allocation,
          acquiringFee: amount(finance.acquiringFee) * allocation,
          otherFixedFee: amount(finance.otherFixedFee) * allocation,
          refundFee: amount(finance.refundFee) * allocation,
          adCost: 0,
          financeReady: Boolean(finance.financeReady),
        });
      }
    }
  }
  return rows.filter((row) => row.date);
}

function filterRows(rows, params) {
  const store = params.get("store") || "all";
  const dateFrom = params.get("dateFrom") || "";
  const dateTo = params.get("dateTo") || "";
  return rows.filter((row) => {
    if (store !== "all" && row.store !== store) return false;
    if (dateFrom && row.date < dateFrom) return false;
    if (dateTo && row.date > dateTo) return false;
    return true;
  });
}

function integrations(env) {
  return ozonStores(env).map((store, index) => ({ id: `ozon-env-${index}`, name: store.name, platform: "Ozon", createdAt: "Cloudflare 环境变量" }));
}

async function verifyOzonCredentials(clientId, apiKey) {
  if (!clientId || !apiKey) return { ok: false, status: 0, error: "缺少 Client ID 或 API 密钥" };
  try {
    const response = await fetch("https://api-seller.ozon.ru/v1/supplier", {
      method: "POST",
      headers: { "content-type": "application/json", "client-id": clientId, "api-key": apiKey },
      body: JSON.stringify({}),
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = null; }
    if (response.ok) {
      const name = payload?.result?.name || payload?.name || "";
      return { ok: true, status: response.status, storeName: name, message: name ? `验证成功：${name}` : "验证成功，凭证有效" };
    }
    const code = payload?.code || payload?.error?.code || "";
    const message = payload?.message || payload?.error?.message || text.slice(0, 200) || `HTTP ${response.status}`;
    return { ok: false, status: response.status, error: message, code };
  } catch (error) {
    return { ok: false, status: 0, error: error.message || String(error) };
  }
}

const ANALYTICS_METRICS = ["revenue", "ordered_units", "session_view", "hits_view_search", "hits_tocart_search", "conv_tocart"];

async function fetchOzonAnalyticsData(from, to, store, dimension) {
  const response = await fetch("https://api-seller.ozon.ru/v1/analytics/data", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "client-id": store.clientId,
      "api-key": store.apiKey,
    },
    body: JSON.stringify({
      date_from: from,
      date_to: to,
      metrics: ANALYTICS_METRICS,
      dimension,
      filters: [],
      sort: [{ key: "revenue", order: "DESC" }],
      limit: 1000,
      offset: 0,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ozon analytics API ${response.status}: ${text.slice(0, 240)}`);
  }
  const payload = await response.json();
  return payload.result?.data || [];
}

function analyticsMetric(row, index) {
  return amount((row.metrics || [])[index]);
}

function analyticsRowBase(row, storeName) {
  return {
    store: storeName,
    revenue: analyticsMetric(row, 0),
    orderedUnits: analyticsMetric(row, 1),
    totalClicks: analyticsMetric(row, 2),
    naturalImpressions: analyticsMetric(row, 3),
    naturalCartAdds: analyticsMetric(row, 4),
    naturalCartRate: analyticsMetric(row, 5),
  };
}

async function fetchStoreAnalytics(env, from, to) {
  const rows = [];
  for (const store of ozonStores(env)) {
    const data = await fetchOzonAnalyticsData(from, to, store, ["sku"]);
    const total = data.reduce((acc, row) => {
      const item = analyticsRowBase(row, store.name);
      acc.revenue += item.revenue;
      acc.orderedUnits += item.orderedUnits;
      acc.totalClicks += item.totalClicks;
      acc.naturalImpressions += item.naturalImpressions;
      acc.naturalCartAdds += item.naturalCartAdds;
      return acc;
    }, { store: store.name, revenue: 0, orderedUnits: 0, totalClicks: 0, naturalImpressions: 0, naturalCartAdds: 0 });
   total.totalImpressions = total.naturalImpressions;
   total.totalCtr = total.totalImpressions ? (total.totalClicks / total.totalImpressions * 100) : 0;
   total.naturalCartRate = total.naturalImpressions ? total.naturalCartAdds / total.naturalImpressions * 100 : 0;
    rows.push(total);
  }
  return rows;
}

// 清空所有订单/店铺分析的旧缓存(包括早期 withCache bug 存的坏数据)
// 用 KV list 遍历,删除 data:orders:* 和 data:store:* 开头的 key
async function cleanStaleDataCache(env) {
  if (!env.LISTING_CACHE) return { error: "未绑定 KV" };
  const deleted = { orders: 0, store: 0, daily: 0, total: 0 };
  const prefixes = ["data:orders:", "data:store:", "data:daily:", "data:products:"];
  try {
    let cursor;
    do {
      const listResult = await env.LISTING_CACHE.list({ cursor });
      cursor = listResult.list_complete ? null : listResult.cursor;
      const keys = (listResult.keys || []).map((k) => k.name);
      const toDelete = keys.filter((k) => prefixes.some((p) => k.startsWith(p)));
      for (const k of toDelete) {
        await env.LISTING_CACHE.delete(k);
        if (k.startsWith("data:orders:")) deleted.orders++;
        else if (k.startsWith("data:store:")) deleted.store++;
        else if (k.startsWith("data:daily:")) deleted.daily++;
        deleted.total++;
      }
    } while (cursor);
  } catch (e) {
    return { error: e.message || String(e), deleted };
  }
  return deleted;
}

// 预热缓存:抓取常见日期范围的订单+店铺分析,写入 KV。
// 范围:今天 / 7天 / 28天 / 本月 / 上月(均按莫斯科时间)。
// 只缓存非空结果,避免把拉取失败缓存住。
async function precacheCommonRanges(env) {
  if (!env.LISTING_CACHE) return { error: "未绑定 KV" };
  // 用莫斯科时间算今天
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const mskNow = new Date(utcMs + 3 * 3600000);
  const mskDate = (d) => d.toISOString().slice(0, 10);
  const addDaysStr = (iso, n) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return mskDate(d);
  };
  const today = mskDate(mskNow);
  const yesterday = addDaysStr(today, -1);
  const firstOfMonth = today.slice(0, 8) + "01";
  const lastMonthEnd = addDaysStr(firstOfMonth, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + "01";

  const ranges = [
    { label: "today", from: today, to: today, cacheable: false },     // 今天不缓存(实时)
    { label: "7d", from: addDaysStr(today, -7), to: yesterday, cacheable: true },
    { label: "28d", from: addDaysStr(today, -28), to: yesterday, cacheable: true },
    { label: "month", from: firstOfMonth, to: yesterday, cacheable: true },
    { label: "lastMonth", from: lastMonthStart, to: lastMonthEnd, cacheable: true },
  ];

  const results = [];
  for (const r of ranges) {
    try {
      // 抓订单
      const orders = await fetchOzonOrders(env, r.from, r.to);
      const ordersKey = dataCacheKey("orders", null, r.from, r.to);
      if (r.cacheable && Array.isArray(orders) && orders.length > 0) {
        await kvPutData(env, ordersKey, orders, 7 * 24 * 3600);
      }
      // 抓按天分析数据(曝光/点击/转化),前端累积后可本地筛选任意子范围
      const daily = await fetchDailyStoreAnalytics(env, r.from, r.to);
      const dailyKey = dataCacheKey("daily", null, r.from, r.to);
      if (r.cacheable && Array.isArray(daily) && daily.length > 0) {
        await kvPutData(env, dailyKey, daily, 7 * 24 * 3600);
      }
      results.push({ label: r.label, from: r.from, to: r.to, orders: orders.length, dailyRows: daily.length, cached: r.cacheable });
    } catch (e) {
      results.push({ label: r.label, from: r.from, to: r.to, error: e.message || String(e) });
    }
  }
  return results;
}

async function fetchProductAnalytics(env, from, to) {
  const rows = [];
  for (const store of ozonStores(env)) {
    const data = await fetchOzonAnalyticsData(from, to, store, ["sku"]);
    for (const row of data) {
      const dimensions = row.dimensions || [];
      rows.push({
        ...analyticsRowBase(row, store.name),
        sku: String(dimensions[0]?.id || ""),
        name: dimensions[0]?.name || "",
      });
    }
  }
  return rows;
}

// 诊断:测试所有可能的曝光/点击指标,找出哪些返回非0值
// 分别测试 [sku] 维度和 [day] 维度,以及无维度(店铺总览)
async function probeAnalyticsMetrics(env, from, to) {
  const store = ozonStores(env)[0];
  if (!store) return { error: "未配置店铺" };
  // 候选指标:Ozon /v1/analytics/data 支持的所有流量相关指标
  const candidates = [
    "revenue", "ordered_units",
    "session_view", "session_position_category", "session_position_cart",
    "hits_view", "hits_view_search", "hits_view_pdp", "hits_view_catalog",
    "hits_tocart", "hits_tocart_search", "hits_tocart_pdp", "hits_tocart_catalog",
    "conv_tocart", "conv_tocart_search", "conv_tocart_pdp", "conv_tocart_catalog",
    "returns", "cancellations",
    "united_impressions", "united_clicks",
  ];
  const dimensions = [["sku"], ["day"], []];   // 测试三种维度
  const result = { store: store.name, from, to, dimensions: {} };
  for (const dim of dimensions) {
    const dimKey = dim.length ? dim.join("+") : "none(店铺总览)";
    try {
      const response = await fetch("https://api-seller.ozon.ru/v1/analytics/data", {
        method: "POST",
        headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
        body: JSON.stringify({ date_from: from, date_to: to, metrics: candidates, dimension: dim, filters: [], limit: 5, offset: 0 }),
      });
      const payload = await response.json();
      if (!response.ok) {
        result.dimensions[dimKey] = { error: `${response.status}`, detail: String(payload.message || payload.error || "").slice(0, 200) };
        continue;
      }
      const data = payload.result?.data || [];
      // 汇总每个指标的总和,找出非0的
      const totals = {};
      for (const m of candidates) totals[m] = 0;
      for (const row of data) {
        (row.metrics || []).forEach((val, i) => { totals[candidates[i]] += amount(val); });
      }
      const nonzero = Object.entries(totals).filter(([_, v]) => v > 0).map(([k, v]) => ({ metric: k, value: v }));
      result.dimensions[dimKey] = { rowCount: data.length, nonzero, allTotals: totals };
    } catch (e) {
      result.dimensions[dimKey] = { error: e.message || String(e) };
    }
  }
  return result;
}

// 按天+店铺维度抓取分析数据(曝光/点击/转化/销售额/件数)
// 用于:店铺经营概览随时间区间显示,以及数据分析按天展示
// dimension 用 ["day"] 让 Ozon 每天返回一行,前端可本地 filter 任意子范围
async function fetchDailyStoreAnalytics(env, from, to) {
  const rows = [];
  for (const store of ozonStores(env)) {
    let offset = 0;
    while (true) {
      const response = await fetch("https://api-seller.ozon.ru/v1/analytics/data", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "client-id": store.clientId,
          "api-key": store.apiKey,
        },
        body: JSON.stringify({
          date_from: from,
          date_to: to,
          metrics: ANALYTICS_METRICS,
          dimension: ["day"],
          filters: [],
          sort: [{ key: "revenue", order: "DESC" }],
          limit: 1000,
          offset,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ozon daily analytics ${response.status}: ${text.slice(0, 200)}`);
      }
      const payload = await response.json();
      const data = payload.result?.data || [];
      for (const row of data) {
        const day = String((row.dimensions || [])[0]?.id || "");
        if (!day) continue;
        const item = analyticsRowBase(row, store.name);
        rows.push({ ...item, date: day });
      }
      if (data.length < 1000) break;   // 分页取完
      offset += 1000;
    }
  }
  return rows;
}

function ozonAdAccounts(env) {
  const sellerStores = ozonStores(env);
  const accounts = [];
  for (let index = 1; index <= 10; index += 1) {
    const clientId = env[`OZON_ADS_${index}_CLIENT_ID`];
    const clientSecret = env[`OZON_ADS_${index}_CLIENT_SECRET`];
    if (clientId && clientSecret) {
      const store = sellerStores[index - 1] || {};
      accounts.push({
        name: env[`OZON_ADS_${index}_NAME`] || store.name || `Ozon Ads ${index}`,
        clientId,
        clientSecret,
      });
    }
  }
  return accounts;
}

async function fetchOzonAdsToken(account) {
  const response = await fetch("https://api-performance.ozon.ru/api/client/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: account.clientId,
      client_secret: account.clientSecret,
      grant_type: "client_credentials",
    }),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(`Ozon ads token API ${response.status}: ${text.slice(0, 240)}`);
  }
  const token = payload?.access_token || payload?.result?.access_token || payload?.token;
  if (!token) throw new Error("Ozon ads token API did not return access_token");
  return token;
}

async function probeRequest(name, url, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "manual", ...options });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return {
      name,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      sample: parsed ? summarizeProbePayload(parsed) : text.slice(0, 500),
      raw: parsed || undefined,
    };
  } catch (error) {
    return { name, ok: false, error: error.message || String(error), ms: Date.now() - started };
  }
}

async function probeJson(name, url, headers, body) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return {
      name,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      sample: parsed ? summarizeProbePayload(parsed) : text.slice(0, 500),
    };
  } catch (error) {
    return { name, ok: false, error: error.message || String(error), ms: Date.now() - started };
  }
}

function summarizeProbePayload(payload) {
  if (Array.isArray(payload)) return { type: "array", count: payload.length, first: payload[0] || null };
  const result = payload.result ?? payload;
  if (Array.isArray(result)) return { type: "array", count: result.length, first: result[0] || null };
  if (result && typeof result === "object") {
    const summary = {};
    for (const [key, value] of Object.entries(result).slice(0, 8)) {
      if (Array.isArray(value)) summary[key] = { type: "array", count: value.length, first: value[0] || null };
      else if (value && typeof value === "object") summary[key] = Object.fromEntries(Object.entries(value).slice(0, 6));
      else summary[key] = value;
    }
    return summary;
  }
  return payload;
}

function probeArray(payload) {
  const result = payload?.result ?? payload;
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.list)) return result.list;
  if (Array.isArray(result?.campaigns)) return result.campaigns;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.campaigns)) return payload.campaigns;
  if (payload?.type === "array" && payload.first) return [payload.first];
  if (payload?.list?.type === "array" && payload.list.first) return [payload.list.first];
  if (payload?.campaigns?.type === "array" && payload.campaigns.first) return [payload.campaigns.first];
  return [];
}

function firstCampaignId(payload) {
  const campaigns = probeArray(payload);
  const campaign = campaigns.find((item) => item.state === "CAMPAIGN_STATE_RUNNING") || campaigns[0] || {};
  return String(campaign.id || campaign.campaignId || campaign.campaign_id || "");
}

function probeUuid(payload) {
  const candidates = [
    payload?.UUID,
    payload?.uuid,
    payload?.result?.UUID,
    payload?.result?.uuid,
    payload?.raw?.UUID,
    payload?.raw?.uuid,
    payload?.raw?.result?.UUID,
    payload?.raw?.result?.uuid,
    payload?.sample?.UUID,
    payload?.sample?.uuid,
  ];
  return String(candidates.find(Boolean) || "");
}

async function probeAdsReportChecks(checks, headers, reportUuid) {
  checks.push({ name: "ads_statistics_uuid", ok: Boolean(reportUuid), uuid: reportUuid });
  if (!reportUuid) return;
  checks.push(await probeRequest("ads_statistics_status_by_uuid", `https://api-performance.ozon.ru/api/client/statistics/${encodeURIComponent(reportUuid)}`, {
    method: "GET",
    headers,
  }));
  checks.push(await probeRequest("ads_statistics_report_uuid_upper", `https://api-performance.ozon.ru/api/client/statistics/report?UUID=${encodeURIComponent(reportUuid)}`, {
    method: "GET",
    headers,
  }));
  checks.push(await probeRequest("ads_statistics_report_uuid_lower", `https://api-performance.ozon.ru/api/client/statistics/report?uuid=${encodeURIComponent(reportUuid)}`, {
    method: "GET",
    headers,
  }));
  checks.push(await probeRequest("ads_statistics_report_by_uuid", `https://api-performance.ozon.ru/api/client/statistics/${encodeURIComponent(reportUuid)}/report`, {
    method: "GET",
    headers,
  }));
}

function adTaskKey(account, from, to) {
  return `${account.clientId}|${from}|${to}`;
}

function adObjectValue(row, names) {
  if (!row || typeof row !== "object") return "";
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
  }
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeAdKey(key), value]));
  for (const name of names) {
    const key = normalizeAdKey(name);
    if (normalized.has(key)) return normalized.get(key);
  }
  for (const [rawKey, value] of Object.entries(row)) {
    const key = normalizeAdKey(rawKey);
    for (const name of names) {
      const wanted = normalizeAdKey(name);
      if (wanted.length >= 4 && (key.includes(wanted) || wanted.includes(key))) return value;
    }
  }
  return "";
}

function adArrayFromPayload(payload) {
  const candidates = [
    payload,
    payload?.result,
    payload?.rows,
    payload?.data,
    payload?.items,
    payload?.result?.rows,
    payload?.result?.data,
    payload?.result?.items,
    payload?.report?.rows,
    payload?.statistics,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) return item;
  }
  return [];
}

function compactAdRaw(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return {};
  const raw = {};
  for (const [key, value] of Object.entries(row).slice(0, 80)) {
    if (value === undefined || typeof value === "function") continue;
    if (value && typeof value === "object") {
      try {
        raw[key] = JSON.stringify(value).slice(0, 500);
      } catch {
        raw[key] = String(value).slice(0, 500);
      }
    } else {
      raw[key] = value;
    }
  }
  return raw;
}

function campaignRowsFromPayload(payload) {
  return probeArray(payload).map((campaign) => ({
    campaignId: String(campaign.id || campaign.campaignId || campaign.campaign_id || ""),
    campaignName: String(campaign.title || campaign.name || ""),
    state: String(campaign.state || ""),
  })).filter((campaign) => campaign.campaignId);
}

function adsReportCampaignIds(campaigns) {
  const running = campaigns.filter((campaign) => /RUNNING/i.test(campaign.state));
  if (running.length) return [...new Set(running.map((campaign) => campaign.campaignId).filter(Boolean))];
  const ordered = [...running, ...campaigns.filter((campaign) => !/RUNNING/i.test(campaign.state))];
  return [...new Set(ordered.map((campaign) => campaign.campaignId).filter(Boolean))].slice(0, 10);
}

function normalizeAdsReportRows(payload, account, campaigns, from, to) {
  const campaignMap = new Map(campaigns.map((campaign) => [String(campaign.campaignId), campaign]));
  const knownCampaignIds = new Set(campaigns.map((campaign) => String(campaign.campaignId)));
  return adArrayFromPayload(payload).map((row, index) => {
    const raw = compactAdRaw(row);
    const campaignId = String(adObjectValue(row, ["campaignId", "campaign_id", "campaign", "广告活动 ID", "ID кампании", "Кампания ID", "Campaign ID", "CampaignId", "__campaignId", "ID", "campaigns"]) || "");
    const campaign = campaignMap.get(campaignId) || {};
    const impressions = textAmount(adObjectValue(row, ["impressions", "views", "shows", "展示量", "展现量", "Показы", "Показы, шт.", "Impressions", "Shows"]));
    const clicks = textAmount(adObjectValue(row, ["clicks", "click", "点击次数", "点击量", "Клики", "Клики, шт.", "Clicks"]));
    const ctr = textAmount(adObjectValue(row, ["ctr", "CTR", "CTR, %", "CTR,%", "Кликабельность"])) || (impressions ? clicks / impressions * 100 : 0);
    const adRevenue = textAmount(adObjectValue(row, ["revenue", "ordersMoney", "money", "sales", "推广带来的销售额", "推广带来的销售额，₽", "促销销售", "促销销售，{货币}", "Выручка", "Продажи", "Заказы, ₽", "Продажи в продвижении, ₽", "Продажи в продвижении с заказов модели, ₽", "Заказано на сумму, ₽", "Revenue", "Sales"]));
    const adCost = textAmount(adObjectValue(row, ["expense", "expenses", "cost", "spent", "moneySpent", "费用", "费用，₽", "Расход", "Расход, ₽", "Расход, ₽, с НДС", "Затраты", "Expense", "Cost", "Spend"]));
    const sku = String(adObjectValue(row, ["sku", "SKU", "offerId", "offer_id", "productId", "product_id", "商品 SKU", "Артикул", "Артикул продавца", "Ozon ID", "Ozon Product Id", "fbo", "fbs", "ID товара"]) || campaignId) || detectRowSku(row);
    const rawDate = String(adObjectValue(row, ["date", "day", "dateTo", "日期", "День", "Дата", "Date", "Day", "Period", "Период", "at"]) || "");
    const rowDate = toIsoDate(rawDate, "") || detectRowDate(row);
    return {
      date: rowDate || to,
      dateFrom: rowDate || from,
      dateTo: rowDate || to,
      store: account.name,
      campaignId,
      campaignName: String(adObjectValue(row, ["campaignName", "campaign_name", "title", "广告活动", "Название кампании", "Campaign name"]) || campaign.campaignName || ""),
      sku: sku || campaignId,
      hasValidSku: /^\d{8,13}$/.test(String(sku || "")),
      name: String(adObjectValue(row, ["name", "title", "productName", "商品名称", "Название товара", "Наименование", "Product name"]) || ""),
      adCost,
      adRevenue,
      revenue: adRevenue,
      adOrders: textAmount(adObjectValue(row, ["orders", "orderedUnits", "units", "soldItems", "已售商品数量", "已售商品数量，件", "Заказы", "Количество заказов", "Продано товаров", "Продано товаров модели", "Продажи, шт.", "Orders", "Items sold"])),
      impressions,
      clicks,
      ctr,
      source: "api",
      raw,
      rawKeys: Object.keys(raw),
    };
  }).filter((row) => {
    return row.adCost || row.adRevenue || row.impressions || row.clicks || row.adOrders || row.sku || row.campaignId;
  });
}

function adRowHasMetrics(row) {
  return Boolean(row && (row.adCost || row.adRevenue || row.revenue || row.impressions || row.clicks || row.adOrders));
}

async function fetchAdsCampaigns(headers) {
  const response = await fetch("https://api-performance.ozon.ru/api/client/campaign", { method: "GET", headers });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(`Ozon ads campaign API ${response.status}: ${text.slice(0, 240)}`);
  return { payload, campaigns: campaignRowsFromPayload(payload) };
}

async function fetchAdsCampaignsCached(headers, account) {
  const key = account.clientId;
  const cached = ADS_CAMPAIGN_CACHE.get(key);
  if (cached && Date.now() - cached.time < 5 * 60 * 1000) return cached.data;
  const data = await fetchAdsCampaigns(headers);
  ADS_CAMPAIGN_CACHE.set(key, { time: Date.now(), data });
  return data;
}

async function postAdsJsonStatistics(headers, endpoint, body) {
  const response = await fetch(`https://api-performance.ozon.ru${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) return { ok: false, status: response.status, endpoint, error: payload?.error || text.slice(0, 240), payload };
  return { ok: true, status: response.status, endpoint, payload };
}

async function fetchAdsDirectJsonRows(headers, account, campaigns, campaignIds, from, to) {
  if (!campaignIds.length) return { rows: [], attempts: [], sampleKeys: [], sample: {} };
  const bodies = [
    { campaigns: campaignIds, dateFrom: from, dateTo: to, groupBy: "DATE" },
    { campaigns: campaignIds, from, to, groupBy: "DATE" },
  ];
  const endpoints = [
    "/api/client/statistics/daily/json",
    "/api/client/statistics/expense/json",
    "/api/client/statistics/campaign/product/json",
  ];
  const attempts = [];
  for (const endpoint of endpoints) {
    for (const body of bodies) {
      const result = await postAdsJsonStatistics(headers, endpoint, body);
      const rawRows = adArrayFromPayload(result.payload);
      const normalized = result.ok ? normalizeAdsReportRows(result.payload, account, campaigns, from, to) : [];
      attempts.push({
        endpoint,
        ok: result.ok,
        status: result.status,
        rows: normalized.length,
        rawRows: rawRows.length,
        rawKeys: rawRows[0] ? Object.keys(rawRows[0]) : [],
        error: result.error || "",
      });
      if (normalized.length) return { rows: normalized, attempts, sampleKeys: rawRows[0] ? Object.keys(rawRows[0]) : [], sample: rawRows[0] || {} };
    }
  }
  return { rows: [], attempts, sampleKeys: [], sample: {} };
}

async function fetchOzonProductImages(env, skus) {
  const wanted = [...new Set((skus || []).map((sku) => String(sku || "").trim()).filter(Boolean))].slice(0, 100);
  const images = {};
  if (!wanted.length) return { images };
  for (const store of ozonStores(env)) {
    const headers = { "client-id": store.clientId, "api-key": store.apiKey, "content-type": "application/json" };
    const numericSkus = wanted.map((sku) => Number(sku)).filter((sku) => Number.isFinite(sku));
    const bodies = [
      numericSkus.length ? { sku: numericSkus } : null,
      { offer_id: wanted },
    ].filter(Boolean);
    for (const body of bodies) {
      try {
        const response = await fetch("https://api-seller.ozon.ru/v3/product/info/list", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) continue;
        const items = payload?.items || payload?.result?.items || payload?.result || [];
        if (!Array.isArray(items)) continue;
        items.forEach((item) => {
          const keys = [item.sku, item.offer_id, item.product_id].map((value) => String(value || "")).filter(Boolean);
          const image = item.primary_image || item.primary_image_url || item.images?.[0] || item.images360?.[0] || "";
          if (!image) return;
          keys.forEach((key) => {
            if (wanted.includes(key) && !images[key]) images[key] = image;
          });
        });
      } catch {
        // Try the next store/body. Images are optional enrichment.
      }
    }
  }
  return { images };
}

async function createAdsStatisticsReport(headers, campaignIds, from, to) {
  const response = await fetch("https://api-performance.ozon.ru/api/client/statistics", {
    method: "POST",
    headers,
    body: JSON.stringify({ campaigns: campaignIds, dateFrom: from, dateTo: to, groupBy: "DATE" }),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) {
    return { ok: false, status: response.status, error: payload?.error || text.slice(0, 240), activeLimit: /лимит|limit/i.test(text) };
  }
  return { ok: true, status: response.status, uuid: probeUuid({ raw: payload, sample: payload }), payload };
}

async function fetchAdsStatisticsStatus(headers, uuid) {
  const response = await fetch(`https://api-performance.ozon.ru/api/client/statistics/${encodeURIComponent(uuid)}`, { method: "GET", headers });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) return { ok: false, status: response.status, state: "ERROR", error: payload?.error || text.slice(0, 240), payload };
  return {
    ok: true,
    status: response.status,
    state: String(payload?.state || payload?.result?.state || payload?.status || "UNKNOWN"),
    payload,
  };
}

function toIsoDate(value, fallback = "") {
  const text = String(value || "");
  const ru = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return fallback;
}

function detectRowDate(row) {
  if (!row || typeof row !== "object") return "";
  const dateKeys = Object.entries(row).filter(([key]) => /date|day|дата|день|период|period/i.test(key));
  for (const [, value] of dateKeys) {
    const iso = toIsoDate(value, "");
    if (iso) return iso;
  }
  return "";
}

function detectRowSku(row) {
  if (!row || typeof row !== "object") return "";
  const skuKeys = Object.entries(row).filter(([key]) => /sku|артикул|offer|product|товар|id/i.test(key));
  for (const [, value] of skuKeys) {
    const text = String(value || "").trim();
    if (/^\d{8,13}$/.test(text)) return text;
  }
  return "";
}

function detectCsvDelimiter(text) {
  const sample = String(text || "").split(/\r?\n/).slice(0, 20).join("\n");
  return [";", "\t", ","].map((delimiter) => ({
    delimiter,
    count: sample.split(delimiter).length,
  })).sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function parseCsv(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

function csvObjectsFromText(text, fileName = "") {
  const rows = parseCsv(text).filter((row) => row.some((cell) => String(cell).trim()));
  if (!rows.length) return [];
  const headerScore = (row) => {
    if (!Array.isArray(row) || row.length < 2) return 0;
    const joined = row.map((cell) => String(cell || "").trim().toLowerCase()).join(" | ");
    let score = 0;
    if (/(^|\|)\s*sku\s*(\||$)|артикул|ozon id|offer/i.test(joined)) score += 50;
    if (/date|день|дата|period|период/i.test(joined)) score += 20;
    if (/expense|cost|spend|расход|затрат|费用/i.test(joined)) score += 20;
    if (/impressions|shows|показы|展示|展现/i.test(joined)) score += 15;
    if (/clicks|клики|点击/i.test(joined)) score += 15;
    if (/ctr|кликабель/i.test(joined)) score += 10;
    if (/orders|sales|заказ|продаж|выруч|销售/i.test(joined)) score += 10;
    return score;
  };
  const scored = rows.map((row, index) => ({ index, score: headerScore(row) })).sort((a, b) => b.score - a.score || a.index - b.index);
  const headerIndex = scored[0]?.score >= 50 ? scored[0].index : rows.findIndex((row) => row.length > 1 && row.some((cell) => /date|день|дата|sku|расход|показы|клики/i.test(String(cell))));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((cell) => String(cell || "").trim());
  const campaignId = String(fileName).match(/^(\d+)/)?.[1] || "";
  return rows.slice(headerIndex + 1).map((row) => {
    const item = { __campaignId: campaignId, __fileName: fileName };
    headers.forEach((header, index) => {
      if (header) item[header] = row[index];
    });
    return item;
  }).filter((item) => Object.values(item).some((value) => String(value || "").trim()));
}

function decodeReportText(bytes) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const utf8 = new TextDecoder("utf-8").decode(array);
  const badUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  if (badUtf8 < 3) return utf8;
  try {
    return new TextDecoder("windows-1251").decode(array);
  } catch {
    return utf8;
  }
}

async function inflateZipEntry(bytes) {
  if (typeof DecompressionStream === "undefined") return null;
  for (const format of ["deflate-raw", "deflate"]) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // Try the next supported format.
    }
  }
  return null;
}

async function csvObjectsFromZip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 66000); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return [];
  const entryCount = view.getUint16(eocd + 10, true);
  let centralOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const output = [];
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const fileName = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength));
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
    if (!/\.csv$/i.test(fileName) || view.getUint32(localOffset, true) !== 0x04034b50) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const content = method === 0 ? compressed : method === 8 ? await inflateZipEntry(compressed) : null;
    if (!content) continue;
    output.push(...csvObjectsFromText(decodeReportText(content), fileName));
  }
  return output;
}

async function fetchAdsStatisticsReport(headers, uuid) {
  const response = await fetch(`https://api-performance.ozon.ru/api/client/statistics/report?UUID=${encodeURIComponent(uuid)}`, { method: "GET", headers });
  const buffer = await response.arrayBuffer();
  const text = decodeReportText(new Uint8Array(buffer));
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (response.ok) {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { ok: true, status: response.status, payload: await csvObjectsFromZip(buffer) };
    if (payload) return { ok: true, status: response.status, payload };
    return { ok: true, status: response.status, payload: csvObjectsFromText(text) };
  }
  return { ok: false, status: response.status, error: payload?.error || text.slice(0, 240) };
}

async function pollAdsStatisticsStatus(headers, uuid, { maxAttempts = 20, intervalMs = 3000 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await fetchAdsStatisticsStatus(headers, uuid);
    if (/OK|SUCCESS|DONE|COMPLETED/i.test(status.state)) return { ok: true, state: status.state };
    if (/ERROR|FAIL|CANCEL/i.test(status.state)) return { ok: false, state: status.state, error: status.error || status.state };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ok: false, state: "TIMEOUT", error: `still not ready after ${maxAttempts * intervalMs / 1000}s` };
}

async function fetchAdsCampaignReport(headers, account, campaignId, from, to) {
  const created = await createAdsStatisticsReport(headers, [campaignId], from, to);
  if (!created.ok) return { campaignId, ok: false, error: created.error, activeLimit: created.activeLimit };
  const uuid = created.uuid;
  const polled = await pollAdsStatisticsStatus(headers, uuid);
  if (!polled.ok) return { campaignId, ok: false, uuid, error: polled.error, state: polled.state };
  const report = await fetchAdsStatisticsReport(headers, uuid);
  if (!report.ok) return { campaignId, ok: false, uuid, error: report.error, state: "REPORT_PENDING" };
  return { campaignId, ok: true, uuid, payload: report.payload };
}

async function fetchOzonAdsDailyProducts(env, from, to, options = {}) {
  const rows = [];
  const meta = [];
  for (const account of ozonAdAccounts(env).slice(0, 1)) {
    try {
      const token = await fetchOzonAdsToken(account);
      const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
      let campaigns = [];
      if (options.uuid) {
        campaigns = ADS_CAMPAIGN_CACHE.get(account.clientId)?.data?.campaigns || [];
      } else {
        const campaignResult = await fetchAdsCampaignsCached(headers, account);
        campaigns = campaignResult.campaigns;
      }
      const campaignIds = adsReportCampaignIds(campaigns);
      const key = adTaskKey(account, from, to);
      const cachedRows = ADS_REPORT_ROWS.get(key) || [];
      if (cachedRows.length && !options.force) {
        rows.push(...cachedRows);
        meta.push({ store: account.name, state: "CACHED", rows: cachedRows.length, campaigns: campaignIds.length });
        continue;
      }
      if (!options.uuid) {
        const direct = await fetchAdsDirectJsonRows(headers, account, campaigns, campaignIds, from, to);
        if (direct.rows.length) {
          ADS_REPORT_ROWS.set(key, direct.rows);
          rows.push(...direct.rows);
          meta.push({ store: account.name, state: "DIRECT_JSON", rows: direct.rows.length, campaigns: campaignIds.length, attempts: direct.attempts.slice(-3), sampleKeys: direct.sampleKeys, sample: direct.sample });
          continue;
        }
        if (!options.create && !options.force) {
          meta.push({ store: account.name, state: "DIRECT_EMPTY", rows: 0, campaigns: campaignIds.length, attempts: direct.attempts.slice(-6), note: "Direct JSON statistics returned no metric rows. Click refresh once to create an async report task." });
          continue;
        }
      }
      let task = options.uuid ? { uuid: options.uuid, from, to, store: account.name, status: "EXTERNAL", createdAt: "" } : ADS_REPORT_TASKS.get(key);
      if (options.uuid) {
        const status = await fetchAdsStatisticsStatus(headers, options.uuid);
        if (/OK|SUCCESS|DONE|COMPLETED/i.test(status.state)) {
          const report = await fetchAdsStatisticsReport(headers, options.uuid);
          if (report.ok) {
            const normalized = normalizeAdsReportRows(report.payload, account, campaigns, from, to);
            rows.push(...normalized);
            meta.push({ store: account.name, state: "READY", uuid: options.uuid, rows: normalized.length, campaigns: campaignIds.length });
          } else {
            meta.push({ store: account.name, state: "REPORT_PENDING", uuid: options.uuid, rows: 0, campaigns: campaignIds.length, error: report.error });
          }
        } else {
          meta.push({ store: account.name, state: status.state, uuid: options.uuid, rows: 0, campaigns: campaignIds.length });
        }
        continue;
      }
      if (!options.create && !options.force) {
        meta.push({ store: account.name, state: "NO_REPORT_TASK", rows: 0, campaigns: campaignIds.length, note: "Pass create=1 once to create per-campaign report tasks." });
        continue;
      }
      if (!campaignIds.length) {
        meta.push({ store: account.name, state: "NO_CAMPAIGNS", rows: 0, campaigns: 0 });
        continue;
      }
      const reportResults = await Promise.all(campaignIds.slice(0, 10).map((campaignId) => fetchAdsCampaignReport(headers, account, campaignId, from, to)));
      const perCampaignMeta = [];
      for (const result of reportResults) {
        if (result.ok) {
          const normalized = normalizeAdsReportRows(result.payload, account, campaigns, from, to);
          rows.push(...normalized);
          perCampaignMeta.push({ campaignId: result.campaignId, uuid: result.uuid, rows: normalized.length, state: "READY" });
        } else {
          perCampaignMeta.push({ campaignId: result.campaignId, uuid: result.uuid || "", rows: 0, state: result.activeLimit ? "WAIT_ACTIVE_REPORT" : (result.state || "ERROR"), error: result.error || "" });
        }
      }
      if (rows.length) ADS_REPORT_ROWS.set(key, rows);
      ADS_REPORT_TASKS.set(key, { uuid: "multi", from, to, store: account.name, status: rows.length ? "COMPLETED" : "EMPTY", updatedAt: new Date().toISOString() });
      meta.push({
        store: account.name,
        state: rows.length ? "READY" : "EMPTY",
        rows: rows.length,
        campaigns: campaignIds.length,
        perCampaign: perCampaignMeta,
      });
    } catch (error) {
      meta.push({ store: account.name, state: "ERROR", rows: 0, error: error.message || String(error) });
    }
  }
  return { rows, meta };
}

async function probeOzonAnalytics(env, from, to) {
  const stores = ozonStores(env);
  const probes = [];
  for (const store of stores) {
    const sellerHeaders = { "client-id": store.clientId, "api-key": store.apiKey };
    const sellerBody = {
      date_from: from,
      date_to: to,
      metrics: ["revenue", "ordered_units", "hits_view_search", "hits_tocart_search", "session_view", "conv_tocart"],
      dimension: ["sku", "day"],
      filters: [],
      sort: [{ key: "revenue", order: "DESC" }],
      limit: 10,
      offset: 0,
    };
    probes.push({
      store: store.name,
      checks: [
        await probeJson("seller_analytics_data", "https://api-seller.ozon.ru/v1/analytics/data", sellerHeaders, sellerBody),
        await probeJson("performance_statistics_with_seller_key", "https://api-performance.ozon.ru/api/client/statistics", { Authorization: `Bearer ${store.apiKey}` }, {
          campaigns: [],
          dateFrom: from,
          dateTo: to,
          groupBy: "DATE",
        }),
      ],
    });
  }
  return {
    dateFrom: from,
    dateTo: to,
    storeCount: stores.length,
    note: "seller_analytics_data checks Seller API analytics. performance_* checks require a separate Performance API token.",
    probes,
  };
}

async function probeOzonAds(env, from, to, existingUuid = "", createReport = false) {
  const accounts = ozonAdAccounts(env);
  const probes = [];
  for (const account of accounts) {
    const checks = [];
    try {
      const token = await fetchOzonAdsToken(account);
      checks.push({ name: "ads_token", ok: true, status: 200, note: "token received" });
      const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
      const campaignList = await probeRequest("ads_campaign_list", "https://api-performance.ozon.ru/api/client/campaign", {
        method: "GET",
        headers,
      });
      checks.push(campaignList);
      const campaignId = firstCampaignId(campaignList.raw || campaignList.sample);
      checks.push({ name: "ads_selected_campaign", ok: Boolean(campaignId), campaignId });
      if (existingUuid) {
        checks.push({ name: "ads_statistics_create_campaign", ok: true, skipped: true, note: "Using existing uuid; no new report request was created." });
        await probeAdsReportChecks(checks, headers, existingUuid);
        probes.push({
          store: account.name,
          clientIdConfigured: Boolean(account.clientId),
          clientSecretConfigured: Boolean(account.clientSecret),
          checks,
        });
        continue;
      }
      if (!createReport) {
        checks.push({ name: "ads_statistics_create_campaign", ok: true, skipped: true, note: "Add create=1 to create a new statistics report. Add uuid=... to check an existing report." });
        probes.push({
          store: account.name,
          clientIdConfigured: Boolean(account.clientId),
          clientSecretConfigured: Boolean(account.clientSecret),
          checks,
        });
        continue;
      }
      if (campaignId) {
        const statCreate = await probeRequest("ads_statistics_create_campaign", "https://api-performance.ozon.ru/api/client/statistics", {
          method: "POST",
          headers,
          body: JSON.stringify({ campaigns: [campaignId], dateFrom: from, dateTo: to, groupBy: "DATE" }),
        });
        checks.push(statCreate);
        const reportUuid = probeUuid(statCreate);
        await probeAdsReportChecks(checks, headers, reportUuid);
      }
    } catch (error) {
      checks.push({ name: "ads_token", ok: false, error: error.message || String(error) });
    }
    probes.push({
      store: account.name,
      clientIdConfigured: Boolean(account.clientId),
      clientSecretConfigured: Boolean(account.clientSecret),
      checks,
    });
  }
  return {
    dateFrom: from,
    dateTo: to,
    accountCount: accounts.length,
    existingUuid: existingUuid || "",
    createReport,
    note: "Use after configuring OZON_ADS_1_CLIENT_ID and OZON_ADS_1_CLIENT_SECRET. Secrets are not returned.",
    probes,
  };
}

function debugStatus(env) {
  const stores = ozonStores(env);
  const adAccounts = ozonAdAccounts(env);
  const envNames = Object.keys(env).filter((name) => /OZON|WB|WILDBERRIES/i.test(name)).sort();
  return {
    version: "2026-06-20-cloudflare-ads-v10-russian-fields",
    cloudflarePagesFunction: true,
    ozon: {
      storeCount: stores.length,
      stores: stores.map((store) => ({ name: store.name, clientIdConfigured: Boolean(store.clientId), apiKeyConfigured: Boolean(store.apiKey) })),
      singleStoreEnv: {
        clientIdConfigured: Boolean(env.OZON_CLIENT_ID),
        apiKeyConfigured: Boolean(env.OZON_API_KEY),
        storeName: env.OZON_STORE_NAME || "",
      },
      multiStoreJsonConfigured: Boolean(env.OZON_STORES),
      detectedEnvNames: envNames,
    },
    wb: { tokenConfigured: Boolean(env.WB_API_TOKEN), storeName: env.WB_STORE_NAME || "" },
    ads: {
      enabled: adAccounts.length > 0,
      accountCount: adAccounts.length,
      accounts: adAccounts.map((account) => ({
        name: account.name,
        clientIdConfigured: Boolean(account.clientId),
        clientSecretConfigured: Boolean(account.clientSecret),
      })),
    },
  };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === "OPTIONS") return json({}, 204);
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  const url = new URL(request.url);

  try {
    if (path === "health") return json({ ok: true, service: "cloudflare-ozon-wb-control-center", kvBound: Boolean(env.LISTING_CACHE) });
    if (path === "debug") return json({ ...debugStatus(env), kvBound: Boolean(env.LISTING_CACHE) });
    if (path === "products") return json(PRODUCTS);
    if (path === "product-images") {
      const skus = String(url.searchParams.get("skus") || "").split(",").filter(Boolean).sort();
      const force = url.searchParams.get("force") === "1";
      const key = `data:images:${skus.join(",")}`;
      // 商品图几乎不变,长期缓存 24 小时
      return json(await withCache(env, key, 24 * 3600, skus.length > 0, force, () => fetchOzonProductImages(env, skus)));
    }
    if (path === "analytics/store") {
      const { from, to } = dateRange(url.searchParams);
      const force = url.searchParams.get("force") === "1";
      const cacheable = isHistoricalRange(to);
      const key = dataCacheKey("store", null, from, to);
      return json(await withCache(env, key, 7 * 24 * 3600, cacheable, force, () => fetchStoreAnalytics(env, from, to)));
    }
    if (path === "analytics/products") {
      const { from, to } = dateRange(url.searchParams);
      const force = url.searchParams.get("force") === "1";
      const cacheable = isHistoricalRange(to);
      const key = dataCacheKey("products", null, from, to);
      return json(await withCache(env, key, 7 * 24 * 3600, cacheable, force, () => fetchProductAnalytics(env, from, to)));
    }
    // 按天+店铺的分析数据(曝光/点击/转化),前端累积后可本地筛选任意子范围
    if (path === "analytics/daily") {
      const { from, to } = dateRange(url.searchParams);
      const force = url.searchParams.get("force") === "1";
      const cacheable = isHistoricalRange(to);
      const key = dataCacheKey("daily", null, from, to);
      return json(await withCache(env, key, 7 * 24 * 3600, cacheable, force, () => fetchDailyStoreAnalytics(env, from, to)));
    }
    if (path === "orders") {
      const { from, to } = dateRange(url.searchParams);
      const force = url.searchParams.get("force") === "1";
      const cacheable = isHistoricalRange(to);
      const key = dataCacheKey("orders", null, from, to);
      return json(await withCache(env, key, 7 * 24 * 3600, cacheable, force, async () => filterRows(await fetchOzonOrders(env, from, to), url.searchParams)));
    }
    if (path === "ads/daily-products") {
      const { from, to } = dateRange(url.searchParams);
      const force = url.searchParams.get("force") === "1";
      const cacheable = isHistoricalRange(to);
      const uuidExtra = url.searchParams.get("uuid") || "";
      const key = dataCacheKey("ads", null, from, to, uuidExtra);
      return json(await withCache(env, key, 6 * 3600, cacheable, force, () => fetchOzonAdsDailyProducts(env, from, to, {
        force: url.searchParams.get("force") === "1",
        create: url.searchParams.get("create") === "1",
        uuid: uuidExtra,
      })));
    }
    if (path === "competitors") return json([]);
    if (path === "integrations") {
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        return json({ id: crypto.randomUUID(), name: body.name || "未命名店铺", platform: body.platform || "Ozon", createdAt: new Date().toISOString() });
      }
      return json(integrations(env));
    }
    if (path === "integrations/verify") {
      const body = await request.json().catch(() => ({}));
      const clientId = String(body.clientId || "").trim();
      const apiKey = String(body.secret || body.apiKey || "").trim();
      return json(await verifyOzonCredentials(clientId, apiKey));
    }
    if (path.startsWith("integrations/")) {
      if (request.method === "DELETE") return json({ ok: true, id: path.split("/")[1] });
      return json({ ok: false, error: "Method not allowed" }, 405);
    }
    // 店铺持久化到 KV(跨设备/跨部署共享)。POST 保存整个列表,GET 读取。
    if (path === "stores") {
      if (!env.LISTING_CACHE) return json({ ok: false, error: "未绑定 KV,无法持久化店铺" }, 503);
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const stores = Array.isArray(body.stores) ? body.stores : [];
        await env.LISTING_CACHE.put("stores:all", JSON.stringify({ stores, ts: Date.now() }));
        return json({ ok: true, count: stores.length });
      }
      // GET:从 KV 读取
      try {
        const raw = await env.LISTING_CACHE.get("stores:all", "json");
        if (raw && Array.isArray(raw.stores)) {
          return json({ ok: true, stores: raw.stores, ts: raw.ts });
        }
        return json({ ok: true, stores: [], ts: 0 });
      } catch (e) {
        return json({ ok: false, error: "读取店铺失败:" + (e.message || String(e)) });
      }
    }
    if (path === "probe/ozon-analytics") {
      const { from, to } = dateRange(url.searchParams);
      return json(await probeOzonAnalytics(env, from, to));
    }
    if (path === "probe/ozon-ads") {
      const { from, to } = dateRange(url.searchParams);
      return json(await probeOzonAds(env, from, to, url.searchParams.get("uuid") || "", url.searchParams.get("create") === "1"));
    }
    // 诊断:测试所有可能的曝光/点击指标,找出哪些返回非0值
    // 用于解决"曝光/点击都是0"的问题
    if (path === "probe/analytics-metrics") {
      const { from, to } = dateRange(url.searchParams);
      return json(await probeAnalyticsMetrics(env, from, to));
    }
    // 定时预热缓存:抓取常见范围(今天/7天/28天/本月/上月)的订单+分析,写入 KV。
    // 前端打开页面时后台静默调用一次;也可配外部 cron 定时调用。
    // ?clean=1 时先清空所有旧缓存再预热(用于修复历史坏缓存)
    if (path === "precache") {
      const cleaned = url.searchParams.get("clean") === "1" ? await cleanStaleDataCache(env) : null;
      const results = await precacheCommonRanges(env);
      return json({ ok: true, results, cleaned, ts: Date.now() });
    }
    // 单独清空所有订单/分析缓存(不带预热)
    if (path === "precache/clean") {
      const cleaned = await cleanStaleDataCache(env);
      return json({ ok: true, cleaned, ts: Date.now() });
    }
    return json({ error: "Not found", path }, 404);
  } catch (error) {
    return json({ error: error.message || String(error) }, 500);
  }
}
