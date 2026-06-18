const PRODUCTS = [
  { code: "HS", sku: "3555785455", name: "电动按摩器", purchase: 28, domestic: 5, firstFreight: 4.18, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "HX", sku: "3592078186", name: "电动按摩器", purchase: 37, domestic: 5, firstFreight: 6.27, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "HX", sku: "3903949202", name: "电动按摩器", purchase: 37, domestic: 5, firstFreight: 6.27, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "JBAM", sku: "3714580469", name: "电动按摩器", purchase: 35, domestic: 5, firstFreight: 29.046, lastMile: 6, rate: 11.5, platform: "Ozon" },
  { code: "PJ", sku: "3555656299", name: "电动按摩器", purchase: 50, domestic: 5, firstFreight: 27.55, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "SFZ", sku: "3555479037", name: "按摩枕", purchase: 35, domestic: 5, firstFreight: 25.3, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "TBAM", sku: "3714561826", name: "电动按摩器", purchase: 65, domestic: 5, firstFreight: 12.78, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "XFJ", sku: "3555131131", name: "电动按摩器", purchase: 60, domestic: 5, firstFreight: 22.66, lastMile: 4, rate: 11.5, platform: "Ozon" },
  { code: "JW", sku: "4526520053", name: "脚腕按摩器", purchase: 28, domestic: 5, firstFreight: 3.52, lastMile: 3.5, rate: 11.5, platform: "Ozon" },
  { code: "CDAM", sku: "4539993573", name: "床垫按摩器", purchase: 150, domestic: 5, firstFreight: 120.6, lastMile: 5, rate: 11.5, platform: "Ozon" },
  { code: "AMY", sku: "4488765265", name: "按摩椅", purchase: 950, domestic: 5, firstFreight: 1587.2, lastMile: 0, rate: 11.5, platform: "Ozon" },
  { code: "QB60-GRAY", sku: "4675959653", name: "水泵", purchase: 74.5, domestic: 12, firstFreight: 43.2, lastMile: 5, rate: 11.5, platform: "Ozon" },
  { code: "QB-60", sku: "4509788886", name: "水泵", purchase: 70.5, domestic: 12, firstFreight: 43.2, lastMile: 5, rate: 11.5, platform: "Ozon" },
  { code: "PK-750", sku: "4509718786", name: "水泵", purchase: 104.5, domestic: 12, firstFreight: 76.61, lastMile: 7, rate: 11.5, platform: "Ozon" },
  { code: "GP-130", sku: "4509770907", name: "水泵", purchase: 104.5, domestic: 12, firstFreight: 141.86, lastMile: 10, rate: 11.5, platform: "Ozon" },
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
          date: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
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
  return rows;
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

function debugStatus(env) {
  const stores = ozonStores(env);
  const envNames = Object.keys(env).filter((name) => /OZON|WB|WILDBERRIES/i.test(name)).sort();
  return {
    version: "2026-06-18-cloudflare-v1",
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
    ads: { enabled: false, reason: "广告 API 暂停接入：当前未确认广告权限" },
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
    if (path === "orders") {
      const { from, to } = dateRange(url.searchParams);
      return json(filterRows(await fetchOzonOrders(env, from, to), url.searchParams));
    }
    if (path === "ads/daily-products") return json([]);
    if (path === "competitors") return json([]);
    if (path === "integrations") return json(integrations(env));
    return json({ error: "Not found", path }, 404);
  } catch (error) {
    return json({ error: error.message || String(error) }, 500);
  }
}
