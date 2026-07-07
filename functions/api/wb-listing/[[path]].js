function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    },
  });
}
function amount(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function wbStores(env) {
  const rows = [];
  for (let i = 1; i <= 20; i += 1) {
    const token = env[`WB_STORE_${i}_API_TOKEN`] || env[`WB_STORE_${i}_TOKEN`];
    if (token) rows.push({ index: rows.length, envNumber: i, name: env[`WB_STORE_${i}_NAME`] || `WB 店铺 ${i}`, token });
  }
  if (env.WB_API_TOKEN) rows.push({ index: rows.length, envNumber: 0, name: env.WB_STORE_NAME || "WB 店铺", token: env.WB_API_TOKEN });
  return rows;
}
function storeAt(env, index) {
  return wbStores(env)[Number(index || 0)] || null;
}
function cacheKey(store) {
  return `wbsa:categories:${store.envNumber || store.name || "default"}`;
}
async function getCategories(env, url) {
  const store = storeAt(env, url.searchParams.get("storeIndex"));
  if (!store) return { ok: false, error: "未配置 WB 店铺，请先在 Cloudflare 配置 WB_API_TOKEN 或 WB_STORE_1_API_TOKEN。" };
  const force = url.searchParams.get("refresh") === "1";
  if (!force && env.LISTING_CACHE) {
    try {
      const cached = await env.LISTING_CACHE.get(cacheKey(store), "json");
      if (cached?.categories?.length) return { ok: true, source: "cloud-kv", storeName: store.name, ...cached };
    } catch {}
  }
  const response = await fetch("https://content-api.wildberries.ru/content/v2/object/all?name=&limit=1000", {
    headers: { Authorization: store.token, "content-type": "application/json" },
  });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch {}
  if (!response.ok) return { ok: false, status: response.status, error: payload?.detail || payload?.errorText || text.slice(0, 240) };
  const categories = (payload.data || [])
    .map((item) => ({
      id: String(item.id ?? item.objectID ?? ""),
      name: String(item.name ?? item.objectName ?? ""),
      parentId: String(item.parentID ?? "0"),
    }))
    .filter((item) => item.id);
  const body = { categories, ts: Date.now() };
  if (env.LISTING_CACHE) {
    try { await env.LISTING_CACHE.put(cacheKey(store), JSON.stringify(body), { expirationTtl: 60 * 60 * 24 * 365 }); } catch {}
  }
  return { ok: true, source: "fresh", storeName: store.name, ...body };
}
function wbCardBody(draft) {
  const sku = String(draft.code || draft.offerId || `SKU-${Date.now()}`).trim();
  const categoryId = Number(draft.categoryId || draft.subjectID || 0);
  return [{
    subjectID: categoryId,
    variants: [{
      vendorCode: sku,
      title: String(draft.title || sku).slice(0, 100),
      description: String(draft.description || "").slice(0, 5000),
      brand: String(draft.brand || "Нет бренда").slice(0, 50),
      dimensions: {
        length: Math.max(1, Math.round(amount(draft.length) / 10)),
        width: Math.max(1, Math.round(amount(draft.width) / 10)),
        height: Math.max(1, Math.round(amount(draft.height) / 10)),
        weightBrutto: Math.max(0.01, Math.round((amount(draft.weight) / 1000) * 1000) / 1000),
      },
      characteristics: [],
      sizes: [{ techSize: "0", wbSize: "", price: Math.max(1, Math.round(amount(draft.price))), skus: [sku.slice(0, 30)] }],
    }],
  }];
}
async function publish(env, body) {
  const draft = body?.draft || {};
  const store = storeAt(env, draft.storeIndex || body?.storeIndex || 0);
  if (!store) return { ok: false, error: "未配置 WB 店铺" };
  if (!Number(draft.categoryId || 0)) return { ok: false, error: "缺少 WB 类目" };
  if (!draft.code) return { ok: false, error: "缺少货号" };
  if (!draft.title) return { ok: false, error: "缺少标题" };
  if (!amount(draft.price)) return { ok: false, error: "缺少售价" };
  const response = await fetch("https://content-api.wildberries.ru/content/v2/cards/upload", {
    method: "POST",
    headers: { Authorization: store.token, "content-type": "application/json" },
    body: JSON.stringify(wbCardBody(draft)),
  });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch {}
  if (!response.ok) return { ok: false, status: response.status, error: payload?.errorText || payload?.detail || text.slice(0, 300), raw: payload };
  return {
    ok: !payload?.error,
    error: payload?.errorText || "",
    offerId: draft.code,
    imageCount: (draft.images || []).length,
    note: "商品卡已提交；图片媒体上传需要拿到 WB 图片接口返回格式后继续接入。",
    raw: payload,
  };
}
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return json({ ok: true });
  const url = new URL(request.url);
  const path = (url.pathname.split("/api/wb-listing/")[1] || "").replace(/^\/+|\/+$/g, "");
  try {
    if (request.method === "GET" && path === "stores") return json({ ok: true, stores: wbStores(env).map(({ token, ...store }) => store) });
    if (request.method === "GET" && path === "categories") return json(await getCategories(env, url));
    if (request.method === "POST" && path === "publish") return json(await publish(env, await request.json()));
    return json({ ok: false, error: "Not found" }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
}
