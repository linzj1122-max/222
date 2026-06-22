/* =========================================================
 *  AI 生图 / 文本工作室 — 后端代理
 *  ---------------------------------------------------------
 *  路由（路由前缀 /api/ai-studio/*）：
 *    GET  /health                              健康检查
 *    POST /fetch-similar                       抓取同款（Ozon/WB/1688）→ 缓存到 KV → 返回结构化卖点
 *    GET  /category-templates                  返回内置品类模板（充电宝/耳机/音箱/包包/女装 等）
 *    POST /product-types                       根据产品名/描述自动识别最可能的品类（规则匹配，无 API）
 *
 *  核心设计：
 *    1) 抓取走 Cloudflare 自带的 fetch（原生支持 HTTPS），不需要额外代理
 *    2) 抓取结果按 URL 永久缓存在 KV（LISTING_CACHE 绑定），二次访问秒级返回
 *    3) HTML 解析用 cheerio（轻量、esbuild 友好、零外部依赖通过 jQuery 兼容子集自实现）
 *    4) 卖点提炼走规则（关键词提取 + 类目匹配），零 API 成本
 *    5) 内置 6 大热门品类模板做兜底
 * ========================================================= */

// ---- 极简 HTML 解析器（cheerio 子集替代，零依赖） ----
// 支持：标签提取、属性提取、文本提取、简单选择器
function parseHTML(html) {
  // 去掉 script/style/comment
  const clean = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 提取 meta
  const metas = {};
  const metaRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(clean)) !== null) {
    const tag = m[0];
    const nameMatch = tag.match(/(?:name|property|itemprop)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (nameMatch && contentMatch) metas[nameMatch[1].toLowerCase()] = contentMatch[1];
  }

  // 提取标题
  const titleMatch = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // 提取 h1/h2/h3
  const headings = [];
  const headingRe = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  while ((m = headingRe.exec(clean)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text && text.length < 200) headings.push({ level: Number(m[1]), text });
  }

  // 提取正文纯文本（用于关键词分析）
  const text = clean
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000);

  // 提取图片
  const images = [];
  const imgRe = /<img\b[^>]*src\s*=\s*["']([^"']+)["']/gi;
  while ((m = imgRe.exec(clean)) !== null) {
    const src = m[1];
    if (/^https?:\/\//.test(src) && images.length < 8) images.push(src);
  }

  return { metas, title, headings, text, images };
}

// ---- 关键词提取（高频词 + 过滤停用词） ----
const STOP_WORDS_RU = new Set([
  "и","в","на","с","по","для","не","от","до","из","за","к","у","о","что","это","как","все","она","он","оно","они","мы","вы","я","быть","мочь","иметь","или","если","его","ее","их","ваш","наш","который","которые","также","так","еще","уже","очень","можно","нужно","надо","этот","эта","эти","тот","та","те","один","одна","одно","два","две","три","при","без","для","нет","да","при","между","через","после","перед","над","под","все","всё","ещё",
]);

const STOP_WORDS_ZH = new Set([
  "的","了","和","是","就","都","而","及","与","或","一个","没有","我们","你们","他们","它们","这","那","这个","那个","这些","那些","上","下","里","外","前","后","中","以","用","可以","不能","可以","需要",
]);

function extractKeywords(text, lang, max = 30) {
  if (!text) return [];
  // 中俄文按字符粒度切片
  let tokens;
  if (lang === "ru") {
    tokens = text.toLowerCase().match(/[а-яё]{3,}/gi) || [];
  } else {
    tokens = text.match(/[一-龥]{2,}/g) || [];
  }
  const stop = lang === "ru" ? STOP_WORDS_RU : STOP_WORDS_ZH;
  const freq = new Map();
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (stop.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word, count]) => ({ word, count }));
}

// ---- 平台识别 + URL 归一化 ----
function detectPlatform(url) {
  const u = String(url || "").toLowerCase();
  if (/ozon\.ru|ozon\.global/.test(u)) return "ozon";
  if (/wildberries\.ru|wb\.ru/.test(u)) return "wb";
  if (/1688\.com/.test(u)) return "1688";
  if (/detail\.1688\.com|detail\.tmall\.com|m\.1688\.com/.test(u)) return "1688";
  if (/pinduoduo\.com|yangkeduo\.com/.test(u)) return "pdd";
  if (/taobao\.com|tmall\.com/.test(u)) return "taobao";
  return "other";
}

// 缓存 key：URL 哈希 + 平台
async function urlHash(url) {
  const data = new TextEncoder().encode(String(url).toLowerCase().trim());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function cacheKey(platform, urlHashStr) {
  return `aistudio:${platform}:${urlHashStr}`;
}

// ---- 抓取同款 ----
async function fetchSimilar(env, body) {
  const url = String(body?.url || "").trim();
  const manualDescription = String(body?.description || "").trim();

  if (!url && !manualDescription) {
    return { ok: false, error: "请提供同款链接或粘贴一段产品描述。" };
  }

  // 模式 1：手动描述模式（不抓取，直接提炼）
  if (!url && manualDescription) {
    return extractFromManualDescription(manualDescription);
  }

  // 模式 2：链接抓取模式
  const platform = detectPlatform(url);
  if (platform === "other") {
    return { ok: false, error: "暂不支持该平台链接。目前支持：Ozon / Wildberries / 1688 / 拼多多 / 淘宝。" };
  }

  const uHash = await urlHash(url);

  // 1) 先查 KV 缓存
  if (env.LISTING_CACHE) {
    try {
      const cached = await env.LISTING_CACHE.get(cacheKey(platform, uHash), "json");
      if (cached && cached.extracted) {
        return { ok: true, source: "cache", platform, url, extracted: cached.extracted, fetchedAt: cached.ts };
      }
    } catch { /* KV 读失败不阻塞 */ }
  }

  // 2) 抓取页面
  let html;
  try {
    const resp = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ru-RU,ru;q=0.9,zh-CN;q=0.8,en;q=0.7",
      },
      redirect: "follow",
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (!resp.ok) {
      return { ok: false, error: `抓取失败：HTTP ${resp.status}（${platform} 平台可能反爬或链接已失效）`, platform, url };
    }
    html = await resp.text();
  } catch (e) {
    return { ok: false, error: `抓取异常：${e.message || e}`, platform, url };
  }

  // 3) 解析 HTML 提取结构化信息
  const parsed = parseHTML(html);
  const extracted = extractStructured(parsed, platform, url);

  // 4) 写回 KV 永久缓存
  if (env.LISTING_CACHE) {
    try {
      await env.LISTING_CACHE.put(cacheKey(platform, uHash), JSON.stringify({
        extracted, ts: Date.now(), url, platform,
      }), { expirationTtl: 60 * 60 * 24 * 365 * 5 }); // 5 年（永久）
    } catch { /* 写失败不阻塞返回 */ }
  }

  return { ok: true, source: "fresh", platform, url, extracted, fetchedAt: Date.now() };
}

// ---- 从手动描述提取（无抓取） ----
function extractFromManualDescription(desc) {
  // 中文关键词
  const zhKeywords = extractKeywords(desc, "zh", 20).map((k) => k.word);
  // 简单品类识别
  const category = guessCategoryByKeywords(desc + " " + zhKeywords.join(" "));
  return {
    ok: true,
    source: "manual",
    platform: "manual",
    url: "",
    extracted: {
      title: desc.split(/[。\n；;]/)[0]?.slice(0, 80) || "未命名产品",
      description: desc.slice(0, 500),
      highlights: extractHighlightsFromText(desc, category),
      specs: {},
      keywords: { zh: zhKeywords, ru: [] },
      category: category.id,
      categoryName: category.name,
      images: [],
    },
  };
}

// ---- 从解析结果结构化提取 ----
function extractStructured(parsed, platform, url) {
  const { metas, title, headings, text, images } = parsed;

  // Ozon / WB 常用 og:title / description:description
  const ogTitle = metas["og:title"] || metas["twitter:title"] || title;
  const ogDesc = metas["og:description"] || metas["description"] || metas["twitter:description"] || "";
  const ogImage = metas["og:image"] || images[0] || "";

  // 拼接完整描述文本（meta + headings + 前 3000 字正文）
  const fullText = [ogTitle, ogDesc, ...headings.map((h) => h.text), text].join(" ");

  // 关键词提取（按平台语言）
  const lang = platform === "1688" || platform === "pdd" || platform === "taobao" ? "zh" : "ru";
  const keywords = extractKeywords(fullText, lang, 25).map((k) => k.word);

  // 品类识别
  const category = guessCategoryByKeywords(fullText);

  // 卖点提取（基于品类模板的强匹配 + 通用规则）
  const highlights = extractHighlightsFromText(fullText, category);

  // 参数提取（粗略正则匹配 "X 毫安"、"X cm"、"X mAh" 等）
  const specs = extractSpecs(fullText);

  return {
    title: ogTitle.replace(/\s*[-—–]\s*(Ozon|Wildberries|1688|阿里巴巴|拼多多|Taobao).*$/i, "").trim().slice(0, 200),
    description: ogDesc.slice(0, 800),
    highlights,
    specs,
    keywords: { [lang]: keywords, ru: lang === "ru" ? keywords : [], zh: lang === "zh" ? keywords : [] },
    category: category.id,
    categoryName: category.name,
    images: images.slice(0, 6),
    coverImage: ogImage,
    headings: headings.slice(0, 10),
  };
}

// ---- 参数粗略提取（数值 + 单位） ----
function extractSpecs(text) {
  const specs = {};
  if (!text) return specs;
  const patterns = [
    [/(\d+(?:\.\d+)?)\s*(мАч|мач|мА·ч)/gi, "battery_mAh", (n) => Math.round(parseFloat(n))],
    [/(\d+(?:\.\d+)?)\s*(Вт|вт|W|w)\b/gi, "power_W", (n) => Math.round(parseFloat(n))],
    [/(\d+(?:\.\d+)?)\s*(В|в)\b/gi, "voltage_V", (n) => Math.round(parseFloat(n))],
    [/(\d+(?:\.\d+)?)\s*(см|cm|mm|мм|寸|英寸|дюйм)/gi, "size", null],
    [/(\d+(?:\.\d+)?)\s*(г|гр|kg|кг|克|千克)/gi, "weight", null],
    [/(\d+(?:\.\d+)?)\s*(м|米|метров?)/gi, "length_m", null],
    [/(Bluetooth|Блютуз|蓝牙)\s*([\d.]+)/gi, "bluetooth", null],
    [/(USB[- ]?C|Type-?C|Micro[- ]?USB|Lightning)/gi, "port", null],
  ];
  for (const [re, key, transform] of patterns) {
    const matches = text.matchAll(re);
    const values = [];
    for (const m of matches) {
      let v = m[1] || m[0];
      if (transform && m[1]) v = transform(m[1]);
      if (v && !values.includes(v)) values.push(String(v));
      if (values.length >= 3) break;
    }
    if (values.length) specs[key] = values.join(" / ");
  }
  return specs;
}

// ---- 卖点提取（基于品类模板 + 通用规则） ----
function extractHighlightsFromText(text, category) {
  const highlights = [];
  const t = String(text || "").toLowerCase();

  // 1) 先从品类模板的"高频卖点关键词"里匹配
  if (category && CATEGORY_TEMPLATES[category.id] && CATEGORY_TEMPLATES[category.id].usps) {
    for (const usp of CATEGORY_TEMPLATES[category.id].usps) {
      const hit = usp.keys.find((k) => t.includes(k.toLowerCase()));
      if (hit && !highlights.includes(usp.text)) highlights.push(usp.text);
      if (highlights.length >= 6) break;
    }
  }

  // 2) 通用卖点关键词（俄文 + 中文）
  const COMMON_USPS = [
    { keys: ["беспроводн", "wireless", "无线", "蓝牙"], text: "支持无线 / 蓝牙连接" },
    { keys: ["водонепроницаем", "防水", "ip67", "ip68", "ipx7", "ipx8"], text: "具备防水能力" },
    { keys: ["быстрая зарядка", "fast charge", "quick charge", "快充"], text: "支持快速充电" },
    { keys: ["долговечн", "прочн", "износостойк", "耐用", "坚固"], text: "耐用 / 经久耐用" },
    { keys: ["компактн", "портативн", "легк", "便携", "小巧", "轻便"], text: "便携小巧" },
    { keys: ["многофункциональн", "多功能"], text: "多功能集成" },
    { keys: ["экологичн", "环保"], text: "环保材质" },
    { keys: ["led", "светодиод", "灯"], text: "LED 灯 / 指示功能" },
    { keys: ["дисплей", "display", "显示屏", "数显"], text: "数字显示" },
    { keys: ["power bank", "повербанк", "充电宝"], text: "移动电源功能" },
  ];
  for (const usp of COMMON_USPS) {
    if (highlights.length >= 8) break;
    if (usp.keys.some((k) => t.includes(k)) && !highlights.includes(usp.text)) {
      highlights.push(usp.text);
    }
  }

  // 3) 从数值参数里推卖点
  if (/мАч|мач|20000|10000|30000/.test(text) && !highlights.some((h) => h.includes("大容量"))) {
    highlights.push("大容量电池");
  }
  if (/\d+\s*Вт/.test(text) && !highlights.some((h) => h.includes("功率"))) {
    highlights.push("高功率输出");
  }
  if (/(5\s*устройств|5\s*device|五台|五部)/i.test(text) && !highlights.some((h) => h.includes("多设备"))) {
    highlights.push("可同时为多台设备充电");
  }

  return highlights.slice(0, 8);
}

// ---- 品类识别（基于关键词规则，零 API） ----
function guessCategoryByKeywords(text) {
  const t = String(text || "").toLowerCase();
  let best = { id: "general", name: "通用", score: 0 };
  for (const [id, tpl] of Object.entries(CATEGORY_TEMPLATES)) {
    let score = 0;
    for (const kw of tpl.matchKeywords) {
      if (t.includes(kw.toLowerCase())) score += 1;
    }
    if (score > best.score) best = { id, name: tpl.name, score };
  }
  return best.score > 0 ? best : { id: "general", name: "通用", score: 0 };
}

// ---- 内置品类模板（兜底） ----
// 这些模板是手动整理的 Ozon / WB 热销品类高频卖点+关键词，无需抓取直接可用
const CATEGORY_TEMPLATES = {
  powerbank: {
    id: "powerbank",
    name: "充电宝 / 移动电源",
    matchKeywords: ["повербанк", "power bank", "充电宝", "移动电源", "мАч", "мач", "аккумулятор внешн", "портативное зарядное"],
    usps: [
      { keys: ["20000", "30000", "大容量", "большая ёмкость"], text: "超大容量，续航持久" },
      { keys: ["быстрая зарядка", "快充", "fast charge"], text: "支持快速充电，节省时间" },
      { keys: ["много устройств", "5 устройств", "多台", "5 台"], text: "可同时为多台设备充电" },
      { keys: ["led", "дисплей", "数显"], text: "LED 数字显示，电量一目了然" },
      { keys: ["встроенн кабель", "自带线"], text: "自带数据线，免带额外配件" },
      { keys: ["компактн", "тонк", "轻薄", "轻便"], text: "轻薄便携，轻松放入口袋" },
      { keys: ["фонар", "手电"], text: "内置 LED 手电筒" },
      { keys: ["li-pol", "li-po", "полимерн", "聚合物"], text: "采用优质锂聚合物电芯" },
      { keys: ["авиа", "民航", "飞机"], text: "符合民航携带规定，可登机" },
    ],
    ozonKeywords: ["повербанк", "внешний аккумулятор", "портативное зарядное", "power bank"],
  },
  headphones: {
    id: "headphones",
    name: "蓝牙耳机 / 头戴式",
    matchKeywords: ["наушник", "headphone", "earphone", "earbud", "耳机", "蓝牙", "bluetooth", "tws"],
    usps: [
      { keys: ["tws", "беспроводн", "无线", "bluetooth"], text: "真无线蓝牙连接，自由无束缚" },
      { keys: ["шумоподавлен", "anc", "降噪"], text: "主动降噪，沉浸聆听" },
      { keys: ["водонепроницаем", "ipx", "防水"], text: "IPX 防水，运动无忧" },
      { keys: ["долгое время", "长续航", "время работы"], text: "超长续航" },
      { keys: ["bass", "бас", "重低音"], text: "强劲低音" },
      { keys: ["микрофон", "mic", "麦克风"], text: "内置麦克风，清晰通话" },
      { keys: ["сенсор", "触控", "touch"], text: "智能触控操作" },
    ],
    ozonKeywords: ["наушники", "беспроводные наушники", "tws", "bluetooth наушники"],
  },
  speaker: {
    id: "speaker",
    name: "蓝牙音箱",
    matchKeywords: ["колонка", "speaker", "音箱", "акустика", "bluetooth колонка"],
    usps: [
      { keys: ["bluetooth", "蓝牙", "беспроводн"], text: "蓝牙无线连接" },
      { keys: ["мощн", "ватт", "вт", "watt", "功率"], text: "大功率输出，震撼音质" },
      { keys: ["водонепроницаем", "ipx7", "ip67", "防水"], text: "防水设计，户外适用" },
      { keys: ["bass", "бас", "低音"], text: "强劲低音" },
      { keys: ["время работы", "续航", "часов"], text: "超长续航" },
      { keys: ["fm", "радио", "收音机"], text: "内置 FM 收音机" },
      { keys: ["tf", "карт", "microsd", "usb"], text: "支持 TF 卡 / U 盘播放" },
    ],
    ozonKeywords: ["колонка bluetooth", "портативная колонка", "беспроводная колонка"],
  },
  bag: {
    id: "bag",
    name: "包包 / 背包",
    matchKeywords: ["сумк", "рюкзак", "bag", "背包", "包", "кошелёк", "wallet"],
    usps: [
      { keys: ["водонепроницаем", "防水"], text: "防水面料" },
      { keys: ["кож", "leather", "皮"], text: "优质皮革 / PU 材质" },
      { keys: ["usb", "зарядк"], text: "外置 USB 充电接口" },
      { keys: ["антивор", "防盗"], text: "防盗设计" },
      { keys: ["ноутбук", "laptop", "电脑"], text: "可容纳笔记本电脑" },
      { keys: ["эргономичн", "ergonomic", "人体工学"], text: "人体工学背带" },
    ],
    ozonKeywords: ["сумка", "рюкзак", "женская сумка", "мужской рюкзак"],
  },
  clothing: {
    id: "clothing",
    name: "服装 / 女装 / 男装",
    matchKeywords: ["одежда", "платье", "футболка", "куртка", "上衣", "裤子", "dress", "t-shirt", "jacket", "clothing"],
    usps: [
      { keys: ["хлопок", "cotton", "棉"], text: "纯棉面料，舒适透气" },
      { keys: ["зимн", "утеплённ", "保暖", "冬"], text: "保暖 / 冬季适用" },
      { keys: ["водонепроницаем", "防水"], text: "防水面料" },
      { keys: ["большой размер", "plus size", "大码"], text: "支持大码尺码" },
      { keys: ["модн", "стильн", "стиль", "时尚"], text: "时尚设计" },
      { keys: ["дышащ", "透气"], text: "透气面料" },
      { keys: ["эластичн", "弹性", "stretch"], text: "弹性面料" },
    ],
    ozonKeywords: ["платье", "футболка", "куртка", "одежда", "женская одежда"],
  },
  lighting: {
    id: "lighting",
    name: "灯具 / LED 灯",
    matchKeywords: ["лампа", "светильник", "led", "灯", "灯具", "освещен", "люстра"],
    usps: [
      { keys: ["энергосберегающ", "节能", "低功耗"], text: "节能环保" },
      { keys: ["rgb", "цветн", "多彩", "rgb"], text: "RGB 多彩氛围" },
      { keys: ["диммируем", "调光", "dimmable"], text: "可调光" },
      { keys: ["умный", "smart", "wi-fi", "智能"], text: "智能控制（WiFi / 语音）" },
      { keys: ["долговечн", "长寿命", "срок служб"], text: "超长使用寿命" },
      { keys: ["usb", "аккумулятор", "充电", "аккумулятор"], text: "可充电 / USB 供电" },
    ],
    ozonKeywords: ["светодиодная лампа", "led лампа", "светильник", "умная лампа"],
  },
  general: {
    id: "general",
    name: "通用",
    matchKeywords: [],
    usps: [
      { keys: ["высокое качество", "高品质", "качеств"], text: "高品质保障" },
      { keys: ["гарантия", "质保", "保固"], text: "官方质保" },
      { keys: ["доставка", "быстрая доставка", "发货", "物流"], text: "快速发货" },
      { keys: ["новый", "新款", "new"], text: "全新正品" },
    ],
    ozonKeywords: [],
  },
};

// ---- 入口 ----
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === "OPTIONS") return json({}, 204);
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");

  try {
    if (path === "health") {
      return json({
        ok: true,
        service: "ai-studio-api",
        kvBound: Boolean(env.LISTING_CACHE),
        categories: Object.keys(CATEGORY_TEMPLATES).map((id) => ({ id, name: CATEGORY_TEMPLATES[id].name })),
        supportedPlatforms: ["Ozon", "Wildberries", "1688", "拼多多", "淘宝"],
      });
    }
    if (path === "fetch-similar") {
      const body = await request.json().catch(() => ({}));
      return json(await fetchSimilar(env, body));
    }
    if (path === "category-templates") {
      return json({
        ok: true,
        templates: Object.values(CATEGORY_TEMPLATES).map((tpl) => ({
          id: tpl.id, name: tpl.name, uspCount: tpl.usps.length, ozonKeywords: tpl.ozonKeywords,
        })),
      });
    }
    if (path === "product-types") {
      // 简单实现：直接复用 guess 逻辑
      const body = await request.json().catch(() => ({}));
      const text = String(body?.text || body?.productName || "");
      const cat = guessCategoryByKeywords(text);
      return json({ ok: true, category: cat });
    }
    return json({ error: "Not found", path }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
}
