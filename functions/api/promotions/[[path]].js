/* =========================================================
 *  OZON 活动报名后端代理
 *  ---------------------------------------------------------
 *  路由前缀 /api/promotions/*
 *    GET  /stores
 *    GET  /actions?storeIndex=0
 *    GET  /candidates?storeIndex=0&actionId=123
 *    GET  /products?storeIndex=0&actionId=123
 *    POST /activate     { storeIndex, actionId, products: [{ product_id, action_price }] }
 *    POST /deactivate   { storeIndex, actionId, productIds: [123] }
 *
 *  店铺凭证复用主系统约定：
 *    OZON_STORE_<n>_NAME / _CLIENT_ID / _API_KEY
 *    OZON_STORES JSON
 *    OZON_CLIENT_ID / OZON_API_KEY
 * ========================================================= */

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
  const n = Number(String(value ?? "").replace(/\s+/g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
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
      // Invalid auth JSON means no users are loaded from that variable.
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

function authSecret(env) {
  const configured = env.AUTH_SESSION_SECRET || env.CONTROL_CENTER_SESSION_SECRET || env.SESSION_SECRET;
  if (configured) return String(configured);
  const users = String(env.CONTROL_CENTER_USERS || env.AUTH_USERS || "");
  return [users, env.CREATOR_PASSWORD, env.ADMIN_PASSWORD, env.CLOUDFLARE_API_TOKEN].filter(Boolean).join(":") || "local-dev-session-secret";
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
  if (!payload?.sub || Number(payload.exp || 0) <= now) return { ok: false, status: 401, error: "登录已过期，请重新登录。" };
  const user = authUsers(env).find((item) => item.username === payload.sub);
  if (!user) return { ok: false, status: 401, error: "账号已被停用，请重新登录。" };
  return { ok: true, user: { username: user.username, name: user.name, role: user.role } };
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
      // Invalid JSON is ignored, matching the main API behavior.
    }
  }
  if (env.OZON_CLIENT_ID && env.OZON_API_KEY) {
    stores.push({ name: env.OZON_STORE_NAME || "Ozon 店铺", clientId: env.OZON_CLIENT_ID, apiKey: env.OZON_API_KEY });
  }
  return stores;
}

function storeList(env) {
  return ozonStores(env).map((store, index) => ({
    index,
    platform: "Ozon",
    name: store.name,
  }));
}

function resolveStore(env, storeIndex) {
  const stores = ozonStores(env);
  return stores[Number(storeIndex || 0)] || stores[0] || null;
}

async function ozonRequest(store, endpoint, body = {}) {
  const response = await fetch(`https://api-seller.ozon.ru${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "client-id": store.clientId,
      "api-key": store.apiKey,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = null; }
  if (!response.ok) {
    const message = payload?.message || payload?.error?.message || payload?.error || text.slice(0, 400);
    throw new Error(`Ozon ${endpoint} ${response.status}: ${message}`);
  }
  return payload || {};
}

async function ozonGet(store, endpoint, params = {}) {
  const url = new URL(`https://api-seller.ozon.ru${endpoint}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "client-id": store.clientId,
      "api-key": store.apiKey,
    },
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = null; }
  if (!response.ok) {
    const message = payload?.message || payload?.error?.message || payload?.error || text.slice(0, 400);
    throw new Error(`Ozon ${endpoint} ${response.status}: ${message}`);
  }
  return payload || {};
}

function resultRows(payload, names = []) {
  const candidates = [
    payload?.result,
    payload?.result?.items,
    payload?.result?.actions,
    payload?.result?.products,
    payload?.items,
    payload?.actions,
    payload?.products,
    payload,
  ];
  for (const name of names) {
    candidates.unshift(payload?.result?.[name], payload?.[name]);
  }
  const rows = candidates.find((item) => Array.isArray(item));
  return rows || [];
}

function resultTotal(payload, fallbackCount) {
  return Number(
    payload?.result?.total ||
    payload?.result?.count ||
    payload?.total ||
    payload?.count ||
    fallbackCount ||
    0
  );
}

function describePayloadShape(payload) {
  if (Array.isArray(payload)) return `array:${payload.length}`;
  if (!payload || typeof payload !== "object") return typeof payload;
  const keys = Object.keys(payload).slice(0, 8).join(",");
  const result = payload.result;
  if (Array.isArray(result)) return `result[]:${result.length}; keys:${keys}`;
  if (result && typeof result === "object") {
    const resultKeys = Object.keys(result).slice(0, 8).join(",");
    const arrayKey = Object.keys(result).find((key) => Array.isArray(result[key]));
    return arrayKey ? `result.${arrayKey}[]:${result[arrayKey].length}; keys:${resultKeys}` : `result{}; keys:${resultKeys}`;
  }
  return `object; keys:${keys}`;
}

function normalizeAction(row = {}) {
  const id = row.id || row.action_id || row.actionId || row.promo_id || row.promotion_id || "";
  return {
    id: String(id),
    title: String(row.title || row.name || row.action_name || row.description || `活动 ${id}`),
    status: String(row.status || row.state || row.type || ""),
    type: String(row.type || row.mechanics_type || row.mechanic_type || ""),
    dateStart: row.date_start || row.dateStart || row.start_date || row.startDate || "",
    dateEnd: row.date_end || row.dateEnd || row.end_date || row.endDate || "",
    raw: row,
  };
}

function productPriceValue(row = {}) {
  const candidates = [
    row.price,
    row.price?.price,
    row.price?.marketing_price,
    row.current_price,
    row.marketing_price,
    row.old_price,
    row.discount_price,
    row.min_price,
  ];
  for (const value of candidates) {
    const n = amount(value);
    if (n) return n;
  }
  return 0;
}

function normalizeProduct(row = {}, participating = false) {
  const productId = row.product_id || row.productId || row.id || row.sku || row.sku_id || 0;
  const currentPrice = productPriceValue(row);
  const actionPrice = amount(row.action_price || row.actionPrice || row.discount_price || row.discountPrice);
  const maxActionPrice = amount(row.max_action_price || row.maxActionPrice || row.max_discount_price || row.price_for_action);
  const minActionPrice = amount(row.min_action_price || row.minActionPrice);
  const isParticipating = Boolean(participating || row.participating || row.is_participating || row.is_active);
  const enrolledActionPrice = isParticipating
    ? actionPrice
    : amount(row.enrolled_action_price || row.enrolledActionPrice || row.participating_price || row.participatingPrice);
  return {
    productId: Number(productId) || String(productId || ""),
    offerId: String(row.offer_id || row.offerId || row.article || ""),
    sku: String(row.sku || row.sku_id || ""),
    name: String(row.name || row.title || row.product_name || ""),
    currentPrice,
    actionPrice,
    enrolledActionPrice,
    maxActionPrice,
    minActionPrice,
    status: String(row.status || row.state || ""),
    candidate: Boolean(row.candidate || row.is_candidate),
    participating: isParticipating,
    raw: row,
  };
}

function mergeProduct(base, incoming) {
  const merged = { ...(base || {}), ...(incoming || {}) };
  merged.productId = incoming?.productId || base?.productId || "";
  merged.offerId = incoming?.offerId || base?.offerId || "";
  merged.sku = incoming?.sku || base?.sku || "";
  merged.name = incoming?.name || base?.name || "";
  merged.currentPrice = amount(incoming?.currentPrice) || amount(base?.currentPrice);
  merged.actionPrice = amount(incoming?.actionPrice) || amount(base?.actionPrice);
  merged.enrolledActionPrice = amount(incoming?.enrolledActionPrice) || amount(base?.enrolledActionPrice);
  merged.maxActionPrice = amount(incoming?.maxActionPrice) || amount(base?.maxActionPrice);
  merged.minActionPrice = amount(incoming?.minActionPrice) || amount(base?.minActionPrice);
  merged.candidate = Boolean(base?.candidate || incoming?.candidate);
  merged.participating = Boolean(base?.participating || incoming?.participating);
  merged.status = incoming?.status || base?.status || (merged.participating ? "已报名" : (merged.candidate ? "未报名" : "店铺商品"));
  return merged;
}

function productKey(row = {}) {
  return String(row.productId || row.offerId || row.sku || "").trim();
}

async function fetchActions(store) {
  const rows = [];
  const attempts = [];
  let offset = 0;
  const limit = 50;
  for (let page = 0; page < 20; page += 1) {
    const payload = await ozonGet(store, "/v1/actions", { limit, offset });
    if (page === 0) {
      attempts.push({
        endpoint: "/v1/actions",
        shape: describePayloadShape(payload),
        total: resultTotal(payload, 0),
      });
    }
    const batch = resultRows(payload, ["actions"]).map(normalizeAction).filter((item) => item.id);
    rows.push(...batch);
    const total = resultTotal(payload, batch.length);
    if (!batch.length || rows.length >= total || batch.length < limit) break;
    offset += limit;
  }
  const seen = new Set();
  const actions = rows.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
  return { actions, diagnostics: attempts[0] || { endpoint: "/v1/actions", shape: "empty" } };
}

async function fetchActionProducts(store, actionId, kind = "candidates") {
  const endpoint = kind === "products" ? "/v1/actions/products" : "/v1/actions/candidates";
  const rows = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 50; page += 1) {
    const payload = await ozonRequest(store, endpoint, { action_id: Number(actionId) || actionId, limit, offset });
    const batch = resultRows(payload, ["products", "items"]).map((row) => normalizeProduct(row, kind === "products"));
    rows.push(...batch);
    const total = resultTotal(payload, batch.length);
    if (!batch.length || rows.length >= total || batch.length < limit) break;
    offset += limit;
  }
  const seen = new Set();
  return rows.filter((product) => {
    const key = productKey(product);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchStoreProducts(store) {
  const headers = { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey };
  const rows = [];
  const seen = new Set();
  const endpoints = [
    "https://api-seller.ozon.ru/v4/product/info/stocks",
    "https://api-seller.ozon.ru/v3/product/info/stocks",
  ];
  let lastError = "";
  for (const endpoint of endpoints) {
    let cursor = "";
    rows.length = 0;
    seen.clear();
    for (let page = 0; page < 20; page += 1) {
      const body = {
        filter: { visibility: "ALL" },
        limit: 1000,
        cursor,
        last_id: cursor,
      };
      const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = null; }
      if (!response.ok) {
        lastError = payload?.message || payload?.error?.message || text.slice(0, 300);
        break;
      }
      const batch = payload?.items || payload?.result?.items || payload?.result || [];
      if (!Array.isArray(batch) || !batch.length) break;
      batch.forEach((item) => {
        const product = normalizeProduct({
          ...item,
          product_id: item.product_id || item.id,
          offer_id: item.offer_id,
          sku: item.sku,
          name: item.name,
          price: item.price || item.marketing_price || item.old_price,
        }, false);
        const key = productKey(product);
        if (!key || seen.has(key)) return;
        seen.add(key);
        rows.push({ ...product, status: "店铺商品", source: "store" });
      });
      cursor = payload?.cursor || payload?.last_id || payload?.result?.cursor || payload?.result?.last_id || "";
      if (!cursor) break;
    }
    if (rows.length) break;
  }
  if (!rows.length && lastError) throw new Error(lastError);
  const details = await fetchPromotionProductDetails(store, rows);
  return rows.map((row) => {
    const detail = details.get(String(row.productId || "")) || details.get(String(row.offerId || "")) || details.get(String(row.sku || "")) || {};
    return mergeProduct(row, normalizeProduct({
      ...detail,
      product_id: detail.product_id || detail.id || row.productId,
      offer_id: detail.offer_id || row.offerId,
      sku: detail.sku || row.sku,
      name: detail.name || row.name,
      price: detail.price || detail.marketing_price || detail.old_price || row.currentPrice,
    }, false));
  });
}

async function fetchPromotionProductDetails(store, products) {
  const headers = { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey };
  const byKey = new Map();
  const productIds = [...new Set(products.map((item) => Number(item.productId || item.product_id || 0)).filter(Boolean))].slice(0, 1000);
  const offerIds = [...new Set(products.map((item) => String(item.offerId || item.offer_id || "").trim()).filter(Boolean))].slice(0, 1000);
  const bodies = [];
  for (let i = 0; i < productIds.length; i += 100) bodies.push({ product_id: productIds.slice(i, i + 100) });
  for (let i = 0; i < offerIds.length; i += 100) bodies.push({ offer_id: offerIds.slice(i, i + 100) });
  for (const body of bodies) {
    try {
      const response = await fetch("https://api-seller.ozon.ru/v3/product/info/list", { method: "POST", headers, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      const rows = payload?.items || payload?.result?.items || payload?.result || [];
      if (!Array.isArray(rows)) continue;
      rows.forEach((row) => {
        [row.product_id, row.id, row.offer_id, row.sku].map((value) => String(value || "")).filter(Boolean).forEach((key) => byKey.set(key, row));
      });
    } catch {
      // Details are optional; product IDs can still be displayed.
    }
  }
  return byKey;
}

async function fetchPromotionWorkspaceProducts(store, actionId) {
  const [storeProducts, candidates, active] = await Promise.all([
    fetchStoreProducts(store).catch((error) => ({ error: error.message || String(error), rows: [] })),
    fetchActionProducts(store, actionId, "candidates").catch((error) => ({ error: error.message || String(error), rows: [] })),
    fetchActionProducts(store, actionId, "products").catch((error) => ({ error: error.message || String(error), rows: [] })),
  ]);
  const diagnostics = {
    storeError: storeProducts?.error || "",
    candidatesError: candidates?.error || "",
    activeError: active?.error || "",
  };
  const map = new Map();
  const add = (list, patch = {}) => {
    (Array.isArray(list) ? list : list?.rows || []).forEach((item) => {
      const next = { ...item, ...patch };
      const key = productKey(next);
      if (!key) return;
      map.set(key, mergeProduct(map.get(key), next));
    });
  };
  add(storeProducts, { source: "store" });
  add(candidates, { candidate: true, participating: false, status: "未报名" });
  add(active, { participating: true, candidate: true, status: "已报名" });
  const products = [...map.values()].sort((a, b) => {
    if (a.participating !== b.participating) return a.participating ? -1 : 1;
    if (a.candidate !== b.candidate) return a.candidate ? -1 : 1;
    return String(a.name || a.offerId || a.productId).localeCompare(String(b.name || b.offerId || b.productId), "zh-Hans-CN");
  });
  return {
    products,
    counts: {
      store: Array.isArray(storeProducts) ? storeProducts.length : 0,
      candidates: Array.isArray(candidates) ? candidates.length : 0,
      active: Array.isArray(active) ? active.length : 0,
      total: products.length,
    },
    diagnostics,
  };
}

function chunk(list, size = 100) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

function collectActivationResult(payload, fallbackProducts) {
  const successProductIds = [
    ...(Array.isArray(payload?.result?.product_ids) ? payload.result.product_ids : []),
    ...(Array.isArray(payload?.result?.products) ? payload.result.products.map((item) => item.product_id || item.id || item) : []),
    ...(Array.isArray(payload?.product_ids) ? payload.product_ids : []),
  ].map(Number).filter(Boolean);
  const errors = [
    ...(Array.isArray(payload?.result?.errors) ? payload.result.errors : []),
    ...(Array.isArray(payload?.errors) ? payload.errors : []),
  ];
  if (!successProductIds.length && !errors.length) {
    successProductIds.push(...fallbackProducts.map((item) => Number(item.product_id || item.productId || 0)).filter(Boolean));
  }
  return { successProductIds, errors };
}

async function activateProducts(store, actionId, products) {
  const normalized = (Array.isArray(products) ? products : [])
    .map((item) => ({
      product_id: Number(item.product_id || item.productId || item.id || 0),
      action_price: amount(item.action_price || item.actionPrice || item.price),
    }))
    .filter((item) => item.product_id && item.action_price > 0);
  if (!normalized.length) return { ok: false, error: "没有可提交的商品，请填写 Product ID 和活动价。" };

  const successProductIds = [];
  const errors = [];
  for (const part of chunk(normalized, 100)) {
    const body = {
      action_id: Number(actionId) || actionId,
      products: part.map((item) => ({ product_id: item.product_id, action_price: item.action_price })),
    };
    try {
      const payload = await ozonRequest(store, "/v1/actions/products/activate", body);
      const parsed = collectActivationResult(payload, part);
      successProductIds.push(...parsed.successProductIds);
      errors.push(...parsed.errors);
    } catch (error) {
      part.forEach((item) => errors.push({ product_id: item.product_id, message: error.message || String(error) }));
    }
  }
  return {
    ok: true,
    completed: errors.length === 0,
    successProductIds: [...new Set(successProductIds)],
    successCount: new Set(successProductIds).size,
    errors,
    errorCount: errors.length,
  };
}

async function deactivateProducts(store, actionId, productIds) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : [])
    .map((id) => Number(id))
    .filter(Boolean))];
  if (!ids.length) return { ok: false, error: "没有可取消的 Product ID。" };

  const successProductIds = [];
  const errors = [];
  for (const part of chunk(ids, 100)) {
    try {
      const payload = await ozonRequest(store, "/v1/actions/products/deactivate", {
        action_id: Number(actionId) || actionId,
        product_ids: part,
      });
      const parsed = collectActivationResult(payload, part.map((id) => ({ product_id: id })));
      successProductIds.push(...(parsed.successProductIds.length ? parsed.successProductIds : part));
      errors.push(...parsed.errors);
    } catch (error) {
      part.forEach((id) => errors.push({ product_id: id, message: error.message || String(error) }));
    }
  }
  return {
    ok: true,
    completed: errors.length === 0,
    successProductIds: [...new Set(successProductIds)],
    successCount: new Set(successProductIds).size,
    errors,
    errorCount: errors.length,
  };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === "OPTIONS") return json({}, 204);
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  const url = new URL(request.url);

  try {
    if (path === "health") return json({ ok: true, service: "ozon-promotions-api" });
    const auth = await verifyAuth(request, env);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

    if (path === "stores") return json({ ok: true, stores: storeList(env) });

    const storeIndex = request.method === "GET"
      ? url.searchParams.get("storeIndex")
      : (await request.clone().json().catch(() => ({}))).storeIndex;
    const store = resolveStore(env, storeIndex);
    if (!store) return json({ ok: false, error: "未配置 OZON 店铺，请先到「店铺设置」添加店铺 API。" }, 400);

    if (path === "actions") {
      const result = await fetchActions(store);
      return json({ ok: true, storeName: store.name, actions: result.actions, count: result.actions.length, diagnostics: result.diagnostics });
    }

    if (path === "candidates") {
      const actionId = url.searchParams.get("actionId") || url.searchParams.get("action_id");
      if (!actionId) return json({ ok: false, error: "缺少 actionId。" }, 400);
      const result = await fetchPromotionWorkspaceProducts(store, actionId);
      return json({ ok: true, products: result.products, count: result.products.length, counts: result.counts, diagnostics: result.diagnostics });
    }

    if (path === "products") {
      const actionId = url.searchParams.get("actionId") || url.searchParams.get("action_id");
      if (!actionId) return json({ ok: false, error: "缺少 actionId。" }, 400);
      const products = await fetchActionProducts(store, actionId, "products");
      return json({ ok: true, products, count: products.length });
    }

    if (path === "activate") {
      const body = await request.json().catch(() => ({}));
      const actionId = body.actionId || body.action_id;
      if (!actionId) return json({ ok: false, error: "缺少 actionId。" }, 400);
      return json(await activateProducts(store, actionId, body.products || []));
    }

    if (path === "deactivate") {
      const body = await request.json().catch(() => ({}));
      const actionId = body.actionId || body.action_id;
      if (!actionId) return json({ ok: false, error: "缺少 actionId。" }, 400);
      return json(await deactivateProducts(store, actionId, body.productIds || body.product_ids || []));
    }

    return json({ ok: false, error: "Not found", path }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
}
