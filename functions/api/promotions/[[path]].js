/* =========================================================
 *  OZON 活动报名后端代理
 *  ---------------------------------------------------------
 *  路由前缀 /api/promotions/*
 *    GET  /stores
 *    GET  /actions?storeIndex=0
 *    GET  /candidates?storeIndex=0&actionId=123&includeActive=1
 *    GET  /products?storeIndex=0&actionId=123
 *    POST /activate     { storeIndex, actionId, products: [{ product_id, action_price, stock? }] }
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

function normalizeProduct(row = {}, participating = false) {
  const productId = row.product_id || row.productId || row.id || row.sku || row.sku_id || 0;
  const currentPrice = amount(row.price || row.current_price || row.marketing_price || row.old_price || row.discount_price);
  const actionPrice = amount(row.action_price || row.actionPrice || row.discount_price || row.discountPrice);
  const maxActionPrice = amount(row.max_action_price || row.maxActionPrice || row.max_discount_price || row.price_for_action);
  const minActionPrice = amount(row.min_action_price || row.minActionPrice);
  return {
    productId: Number(productId) || String(productId || ""),
    offerId: String(row.offer_id || row.offerId || row.article || ""),
    sku: String(row.sku || row.sku_id || ""),
    name: String(row.name || row.title || row.product_name || ""),
    currentPrice,
    actionPrice,
    maxActionPrice,
    minActionPrice,
    stock: amount(row.stock || row.stock_count || row.quantity || row.available_stock_count),
    status: String(row.status || row.state || ""),
    participating: Boolean(participating || row.participating || row.is_participating || row.is_active),
    raw: row,
  };
}

async function fetchActions(store) {
  const rows = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 20; page += 1) {
    const payload = await ozonRequest(store, "/v1/actions", { limit, offset });
    const batch = resultRows(payload, ["actions"]).map(normalizeAction).filter((item) => item.id);
    rows.push(...batch);
    const total = resultTotal(payload, batch.length);
    if (!batch.length || rows.length >= total || batch.length < limit) break;
    offset += limit;
  }
  const seen = new Set();
  return rows.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
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
    const key = String(product.productId || product.offerId || product.sku);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      stock: item.stock === undefined || item.stock === null || item.stock === "" ? undefined : Math.max(0, Math.round(amount(item.stock))),
    }))
    .filter((item) => item.product_id && item.action_price > 0);
  if (!normalized.length) return { ok: false, error: "没有可提交的商品，请填写 Product ID 和活动价。" };

  const successProductIds = [];
  const errors = [];
  for (const part of chunk(normalized, 100)) {
    const body = {
      action_id: Number(actionId) || actionId,
      products: part.map((item) => {
        const out = { product_id: item.product_id, action_price: item.action_price };
        if (item.stock !== undefined) out.stock = item.stock;
        return out;
      }),
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
      const actions = await fetchActions(store);
      return json({ ok: true, storeName: store.name, actions, count: actions.length });
    }

    if (path === "candidates") {
      const actionId = url.searchParams.get("actionId") || url.searchParams.get("action_id");
      if (!actionId) return json({ ok: false, error: "缺少 actionId。" }, 400);
      const candidates = await fetchActionProducts(store, actionId, "candidates");
      const includeActive = url.searchParams.get("includeActive") === "1";
      if (!includeActive) return json({ ok: true, products: candidates, count: candidates.length });
      const active = await fetchActionProducts(store, actionId, "products");
      const merged = new Map();
      candidates.forEach((item) => merged.set(String(item.productId || item.offerId || item.sku), item));
      active.forEach((item) => merged.set(String(item.productId || item.offerId || item.sku), { ...merged.get(String(item.productId || item.offerId || item.sku)), ...item, participating: true }));
      return json({ ok: true, products: [...merged.values()], count: merged.size, activeCount: active.length });
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
