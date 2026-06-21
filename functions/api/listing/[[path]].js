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
      "access-control-allow-headers": "content-type,x-store-platform,x-store-name,x-store-client-id,x-store-secret,x-store-api-key,x-store-token",
    },
  });
}

function amount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function openaiBaseUrl(env) {
  return String(env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE).replace(/\/$/, "");
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
          if (item.clientId && item.apiKey) {
            stores.push({ name: item.name || `Ozon 店铺 ${index + 1}`, clientId: item.clientId, apiKey: item.apiKey });
          }
        });
      }
    } catch {
      // 无效 JSON 忽略，与主 API 行为一致
    }
  }
  if (env.OZON_CLIENT_ID && env.OZON_API_KEY) {
    stores.push({ name: env.OZON_STORE_NAME || "Ozon 店铺", clientId: env.OZON_CLIENT_ID, apiKey: env.OZON_API_KEY });
  }
  return stores;
}

function wbStores(env) {
  const stores = [];
  for (let index = 1; index <= 10; index += 1) {
    const name = env[`WB_STORE_${index}_NAME`];
    const token = env[`WB_STORE_${index}_API_TOKEN`] || env[`WB_STORE_${index}_TOKEN`];
    if (token) stores.push({ name: name || `WB 店铺 ${index}`, token });
  }
  if (env.WB_API_TOKEN) {
    stores.push({ name: env.WB_STORE_NAME || "WB 店铺", token: env.WB_API_TOKEN });
  }
  return stores;
}

function storeList(env) {
  return [
    ...ozonStores(env).map((s, i) => ({ index: i, platform: "Ozon", name: s.name })),
    ...wbStores(env).map((s, i) => ({ index: i + 100, platform: "WB", name: s.name })),
  ];
}

// 解析店铺凭证:优先使用请求 header 里前端传入的(localStorage 手动添加的店铺),
// 找不到再按 storeIndex 回退到环境变量配置。platform: "Ozon" | "WB"。
function resolveStore(env, headers, platform, storeIndex) {
  const pf = String(platform || "Ozon").toLowerCase();
  const hPlatform = String(headers.get("x-store-platform") || "").toLowerCase();
  const hClientId = headers.get("x-store-client-id");
  const hSecret = headers.get("x-store-secret") || headers.get("x-store-api-key") || headers.get("x-store-token");
  // header 带了凭证就用它(支持前端把 localStorage 店铺直接传过来)
  if (hClientId && hSecret && (hPlatform === pf || !hPlatform)) {
    return pf === "wb"
      ? { name: headers.get("x-store-name") || "WB 店铺", token: hSecret }
      : { name: headers.get("x-store-name") || "Ozon 店铺", clientId: hClientId, apiKey: hSecret };
  }
  // 否则回退到环境变量
  if (pf === "wb") {
    const stores = wbStores(env);
    return stores[storeIndex] || stores[0] || null;
  }
  const stores = ozonStores(env);
  return stores[storeIndex] || stores[0] || null;
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
  const walk = (node, parentKey, namePath, depth) => {
    if (!node || typeof node !== "object") return;
    const catId = node.description_category_id;
    const catName = node.category_name;
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
      const typeKey = `type-${node.type_id}`;
      flat.push({
        id: typeKey,
        categoryId: Number(catId || 0),
        typeId: Number(node.type_id),
        name: String(node.type_name),
        fullName: [...namePath, String(node.type_name)].join(" / "),
        parentId: myKey,
        childrenCount: 0,
        isLeaf: true,
        disabled: Boolean(node.disabled),
        depth,
      });
    }
    children.forEach((child) => walk(child, myKey, catName ? [...namePath, catName] : namePath, depth + 1));
  };
  roots.forEach((root) => walk(root, "0", [], 0));
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
const CAT_KV_TTL = 60 * 60 * 24 * 30; // 30 天

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

async function publishOzonProduct(env, store, draft) {
  // 前端选类目后,descriptionCategoryId / typeId 已经是干净的数字,
  // 直接用它们;categoryId 可能是 "type-xxx"/"L1|日化" 等展示用字符串,不可 Number。
  const descriptionCategoryId = Number(draft.descriptionCategoryId) || 0;
  const typeId = Number(draft.typeId) || 0;
  const images = (draft.images || []).filter(Boolean);

  // 新版 Ozon:/v3/category/attribute 需要 description_category_id + type_id
  let requiredAttrs = [];
  if (descriptionCategoryId && typeId) {
    try {
      const attrResp = await fetch("https://api-seller.ozon.ru/v3/category/attribute", {
        method: "POST",
        headers: { "content-type": "application/json", "client-id": store.clientId, "api-key": store.apiKey },
        body: JSON.stringify({ description_category_id: [descriptionCategoryId], type_id: [typeId], language: "ZH_HANS" }),
      });
      if (attrResp.ok) {
        const info = await attrResp.json();
        const all = info?.result || [];
        requiredAttrs = Array.isArray(all[0]?.attributes) ? all[0].attributes.filter((a) => a.is_required) : [];
      }
    } catch {
      // 属性拉取失败不阻塞发布,用户可在后台补全必填属性
    }
  }

  const attributes = requiredAttrs.slice(0, 20).map((attr) => ({
    complex_id: 0,
    id: Number(attr.id),
    values: [{ dictionary_value_id: "", value: String(draft.attrValues?.[attr.id] || "") }],
  }));

  const body = {
    items: [{
      name: String(draft.title || "").slice(0, 500),
      offer_id: String(draft.offerId || draft.code || `SKU-${Date.now()}`),
      sku: 0,
      // 新版 API 用 description_category_id + type_id 取代旧 category_id
      description_category_id: descriptionCategoryId,
      type_id: typeId,
      price: { price: String(draft.price || "0"), old_price: String(draft.oldPrice || ""), premium_price: "" },
      vat: "0",
      weight_g: Math.round(amount(draft.weight) || 0),
      weight_unit: "g",
      dimensions: {
        length: String(draft.length || 0),
        width: String(draft.width || 0),
        height: String(draft.height || 0),
        unit: "mm",
      },
      primary_image: images[0] || "",
      images: images.slice(1, 15),
      attributes,
    }],
  };

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
  return {
    ok: Boolean(result.task_id),
    taskId: result.task_id || null,
    productId: result.product_id || null,
    offerId: body.items[0].offer_id,
    raw: result,
  };
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
    if (path === "categories") return json(await getCategories(env, url.searchParams, request.headers));
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
    if (path === "publish") {
      const body = await request.json().catch(() => ({}));
      return json(await publish(env, body, request.headers));
    }
    return json({ error: "Not found", path }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
}
