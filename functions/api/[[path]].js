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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function amount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function dateRange(searchParams) {
  const today = new Date();
  const to = searchParams.get("dateTo") || today.toISOString().slice(0, 10);
  const fromDate = new Date(to);
  fromDate.setDate(fromDate.getDate() - 59);
  const from = searchParams.get("dateFrom") || fromDate.toISOString().slice(0, 10);
  return { from, to };
}

function ozonStores(env) {
  const stores = [];
  for (let index = 1; index <= 10; index += 1) {
    const name = env[`OZON_STORE_${index}_NAME`];
    const clientId = env[`OZON_STORE_${index}_CLIENT_ID`];
    const apiKey = env[`OZON_STORE_${index}_API_KEY`];
    if (clientId && apiKey) {
      stores.push({ name: name || `Ozon 搴楅摵 ${index}`, clientId, apiKey });
    }
  }
  if (env.OZON_STORES) {
    try {
      const parsed = JSON.parse(env.OZON_STORES);
      if (Array.isArray(parsed)) {
        parsed.forEach((item, index) => {
          if (item.clientId && item.apiKey) stores.push({ name: item.name || `Ozon 搴楅摵 ${index + 1}`, clientId: item.clientId, apiKey: item.apiKey });
        });
      }
    } catch {
      // Invalid JSON is surfaced in /api/debug via storeCount = 0.
    }
  }
  if (env.OZON_CLIENT_ID && env.OZON_API_KEY) {
    stores.push({ name: env.OZON_STORE_NAME || "Ozon 搴楅摵", clientId: env.OZON_CLIENT_ID, apiKey: env.OZON_API_KEY });
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
  if (/acquir|褝泻胁邪泄褉|芯锌谢邪褌/.test(name)) return "acquiringFee";
  if (/logistic|delivery|deliver|return|drop.?off|写芯褋褌邪胁|谢芯谐懈褋褌|胁芯蟹胁褉邪褌/.test(name)) return "logisticsFee";
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
    if (/return|refund|胁芯蟹胁褉邪褌/.test(opText)) current.refundFee += Math.abs(amount(operation.amount));
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
  return ozonStores(env).map((store, index) => ({ id: `ozon-env-${index}`, name: store.name, platform: "Ozon", createdAt: "Cloudflare 鐜鍙橀噺" }));
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
    const data = await fetchOzonAnalyticsData(from, to, store, ["day"]);
    const total = data.reduce((acc, row) => {
      const item = analyticsRowBase(row, store.name);
      acc.revenue += item.revenue;
      acc.orderedUnits += item.orderedUnits;
      acc.totalClicks += item.totalClicks;
      acc.naturalImpressions += item.naturalImpressions;
      acc.naturalCartAdds += item.naturalCartAdds;
      return acc;
    }, { store: store.name, revenue: 0, orderedUnits: 0, totalClicks: 0, naturalImpressions: 0, naturalCartAdds: 0 });
    total.totalImpressions = 0;
    total.totalCtr = 0;
    total.naturalCartRate = total.naturalImpressions ? total.naturalCartAdds / total.naturalImpressions * 100 : 0;
    rows.push(total);
  }
  return rows;
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

async function probeOzonAds(env, from, to) {
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
      if (campaignId) {
        const statCreate = await probeRequest("ads_statistics_create_campaign", "https://api-performance.ozon.ru/api/client/statistics", {
          method: "POST",
          headers,
          body: JSON.stringify({ campaigns: [campaignId], dateFrom: from, dateTo: to, groupBy: "DATE" }),
        });
        checks.push(statCreate);
        const reportUuid = probeUuid(statCreate);
        checks.push({ name: "ads_statistics_uuid", ok: Boolean(reportUuid), uuid: reportUuid });
        if (reportUuid) {
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
    note: "Use after configuring OZON_ADS_1_CLIENT_ID and OZON_ADS_1_CLIENT_SECRET. Secrets are not returned.",
    probes,
  };
}

function debugStatus(env) {
  const stores = ozonStores(env);
  const adAccounts = ozonAdAccounts(env);
  const envNames = Object.keys(env).filter((name) => /OZON|WB|WILDBERRIES/i.test(name)).sort();
  return {
    version: "2026-06-19-cloudflare-ads-v1",
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
    if (path === "health") return json({ ok: true, service: "cloudflare-ozon-wb-control-center" });
    if (path === "debug") return json(debugStatus(env));
    if (path === "products") return json(PRODUCTS);
    if (path === "analytics/store") {
      const { from, to } = dateRange(url.searchParams);
      return json(await fetchStoreAnalytics(env, from, to));
    }
    if (path === "analytics/products") {
      const { from, to } = dateRange(url.searchParams);
      return json(await fetchProductAnalytics(env, from, to));
    }
    if (path === "orders") {
      const { from, to } = dateRange(url.searchParams);
      return json(filterRows(await fetchOzonOrders(env, from, to), url.searchParams));
    }
    if (path === "ads/daily-products") return json([]);
    if (path === "competitors") return json([]);
    if (path === "integrations") return json(integrations(env));
    if (path === "probe/ozon-analytics") {
      const { from, to } = dateRange(url.searchParams);
      return json(await probeOzonAnalytics(env, from, to));
    }
    if (path === "probe/ozon-ads") {
      const { from, to } = dateRange(url.searchParams);
      return json(await probeOzonAds(env, from, to));
    }
    return json({ error: "Not found", path }, 404);
  } catch (error) {
    return json({ error: error.message || String(error) }, 500);
  }
}
