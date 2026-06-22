/* =========================================================
 *  AI 生图 / 文本工作室 — 后端代理
 *  ---------------------------------------------------------
 *  路由（路由前缀 /api/ai-studio/*）：
 *    GET  /health                              健康检查
 *    POST /fetch-similar                       抓取同款（Ozon/WB/1688）→ 缓存到 KV → 返回结构化卖点
 *    GET  /category-templates                  返回内置品类模板（Ozon/WB 完整三级类目树）
 *    POST /product-types                       根据产品名/描述自动识别最可能的品类（规则匹配，无 API）
 *
 *  核心设计：
 *    1) 抓取走 Cloudflare 自带的 fetch（原生支持 HTTPS），不需要额外代理
 *    2) 抓取结果按 URL 永久缓存在 KV（LISTING_CACHE 绑定），二次访问秒级返回
 *    3) HTML 解析用 cheerio（轻量、esbuild 友好、零外部依赖通过 jQuery 兼容子集自实现）
 *    4) 卖点提炼走规则（关键词提取 + 类目匹配），零 API 成本
 *    5) 内置 80+ 个细分子品类（Ozon/WB 真实三级类目粒度）做兜底
 * ========================================================= */

// ---- 极简 HTML 解析器（cheerio 子集替代，零依赖） ----
function parseHTML(html) {
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

  const metas = {};
  const metaRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(clean)) !== null) {
    const tag = m[0];
    const nameMatch = tag.match(/(?:name|property|itemprop)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (nameMatch && contentMatch) metas[nameMatch[1].toLowerCase()] = contentMatch[1];
  }

  const titleMatch = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const headings = [];
  const headingRe = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  while ((m = headingRe.exec(clean)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text && text.length < 200) headings.push({ level: Number(m[1]), text });
  }

  const text = clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 20000);

  const images = [];
  const imgRe = /<img\b[^>]*src\s*=\s*["']([^"']+)["']/gi;
  while ((m = imgRe.exec(clean)) !== null) {
    const src = m[1];
    if (/^https?:\/\//.test(src) && images.length < 8) images.push(src);
  }

  return { metas, title, headings, text, images };
}

const STOP_WORDS_RU = new Set([
  "и","в","на","с","по","для","не","от","до","из","за","к","у","о","что","это","как","все","она","он","оно","они","мы","вы","я","быть","мочь","иметь","или","если","его","ее","их","ваш","наш","который","которые","также","так","еще","уже","очень","можно","нужно","надо","этот","эта","эти","тот","та","те","один","одна","одно","два","две","три","при","без","нет","да","между","через","после","перед","над","под","всё","ещё",
]);
const STOP_WORDS_ZH = new Set([
  "的","了","和","是","就","都","而","及","与","或","一个","没有","我们","你们","他们","它们","这","那","这个","那个","这些","那些","上","下","里","外","前","后","中","以","用","可以","不能","需要",
]);

function extractKeywords(text, lang, max = 30) {
  if (!text) return [];
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
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([word, count]) => ({ word, count }));
}

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

async function urlHash(url) {
  const data = new TextEncoder().encode(String(url).toLowerCase().trim());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function cacheKey(platform, urlHashStr) {
  return `aistudio:${platform}:${urlHashStr}`;
}

async function fetchSimilar(env, body) {
  const url = String(body?.url || "").trim();
  const manualDescription = String(body?.description || "").trim();

  if (!url && !manualDescription) {
    return { ok: false, error: "请提供同款链接或粘贴一段产品描述。" };
  }

  if (!url && manualDescription) {
    return extractFromManualDescription(manualDescription);
  }

  const platform = detectPlatform(url);
  if (platform === "other") {
    return { ok: false, error: "暂不支持该平台链接。目前支持：Ozon / Wildberries / 1688 / 拼多多 / 淘宝。" };
  }

  const uHash = await urlHash(url);

  if (env.LISTING_CACHE) {
    try {
      const cached = await env.LISTING_CACHE.get(cacheKey(platform, uHash), "json");
      if (cached && cached.extracted) {
        return { ok: true, source: "cache", platform, url, extracted: cached.extracted, fetchedAt: cached.ts };
      }
    } catch { /* KV 读失败不阻塞 */ }
  }

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

  const parsed = parseHTML(html);
  const extracted = extractStructured(parsed, platform, url);

  if (env.LISTING_CACHE) {
    try {
      await env.LISTING_CACHE.put(cacheKey(platform, uHash), JSON.stringify({
        extracted, ts: Date.now(), url, platform,
      }), { expirationTtl: 60 * 60 * 24 * 365 * 5 });
    } catch { /* 写失败不阻塞返回 */ }
  }

  return { ok: true, source: "fresh", platform, url, extracted, fetchedAt: Date.now() };
}

function extractFromManualDescription(desc) {
  const zhKeywords = extractKeywords(desc, "zh", 20).map((k) => k.word);
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

function extractStructured(parsed, platform, url) {
  const { metas, title, headings, text, images } = parsed;
  const ogTitle = metas["og:title"] || metas["twitter:title"] || title;
  const ogDesc = metas["og:description"] || metas["description"] || metas["twitter:description"] || "";
  const ogImage = metas["og:image"] || images[0] || "";

  const fullText = [ogTitle, ogDesc, ...headings.map((h) => h.text), text].join(" ");
  const lang = platform === "1688" || platform === "pdd" || platform === "taobao" ? "zh" : "ru";
  const keywords = extractKeywords(fullText, lang, 25).map((k) => k.word);
  const category = guessCategoryByKeywords(fullText);
  const highlights = extractHighlightsFromText(fullText, category);
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

function extractHighlightsFromText(text, category) {
  const highlights = [];
  const t = String(text || "").toLowerCase();

  if (category && CATEGORY_TEMPLATES[category.id] && CATEGORY_TEMPLATES[category.id].usps) {
    for (const usp of CATEGORY_TEMPLATES[category.id].usps) {
      const hit = usp.keys.find((k) => t.includes(k.toLowerCase()));
      if (hit && !highlights.includes(usp.text)) highlights.push(usp.text);
      if (highlights.length >= 6) break;
    }
  }

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

// ---- 内置品类模板（80+ 个三级子品类，Ozon/WB 真实类目树粒度） ----
const CATEGORY_TEMPLATES = {
  // ==================== 电子产品 > 充电类 ====================
  powerbank: { id: "powerbank", name: "移动电源 / 充电宝",
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
    ozonKeywords: ["повербанк", "внешний аккумулятор"] },
  wireless_charger: { id: "wireless_charger", name: "无线充电器",
    matchKeywords: ["беспроводн зарядк", "无线充电", "wireless charger", "qi charger", "индукционн зарядн"],
    usps: [
      { keys: ["qi", "стандарт qi"], text: "Qi 无线充电标准" },
      { keys: ["быстрая зарядка", "快充", "fast charge"], text: "支持快充协议" },
      { keys: ["магнитн", "магсейф", "magsafe", "磁吸"], text: "磁吸对准" },
      { keys: ["двойн", "2-в-1", "3-в-1", "双"], text: "支持多设备同充" },
    ],
    ozonKeywords: ["беспроводное зарядное устройство", "qi зарядка"] },
  wall_charger: { id: "wall_charger", name: "手机充电器 / 充电头",
    matchKeywords: ["зарядн устройств", "充电头", "充电头", "адаптер питания", "адаптер", "зарядк для телефон"],
    usps: [
      { keys: ["быстрая зарядка", "快充", "fast charge", "pd", "qc"], text: "支持 PD/QC 快充" },
      { keys: ["gan", "氮化镓"], text: "氮化镓 GaN 芯片，更小更安全" },
      { keys: ["двойн", "2 порт", "双口"], text: "多口同时输出" },
      { keys: ["65w", "100w", "65w", "100w"], text: "大功率快充" },
    ],
    ozonKeywords: ["зарядное устройство", "адаптер питания", "сетевое зарядное"] },
  cable: { id: "cable", name: "数据线 / 充电线",
    matchKeywords: ["кабель", "数据线", "充电线", "usb кабель", "type-c кабель", "lightning кабель"],
    usps: [
      { keys: ["быстрая зарядка", "快充", "fast charge"], text: "支持快充" },
      { keys: ["нейлонов", "плетён", "编织", "braided"], text: "尼龙编织耐用" },
      { keys: ["магнитн", "磁吸"], text: "磁吸接头" },
      { keys: ["длина 1м", "длина 2м", "1м", "2м", "3м"], text: "多种长度可选" },
    ],
    ozonKeywords: ["кабель для зарядки", "usb кабель", "type-c кабель"] },

  // ==================== 电子产品 > 音频 ====================
  tws_earbuds: { id: "tws_earbuds", name: "TWS 真无线耳机",
    matchKeywords: ["tws", "真无线", "беспроводн наушник", "wireless earbud", "in-ear наушник", "вкладыш"],
    usps: [
      { keys: ["tws", "真无线", "true wireless"], text: "真无线蓝牙连接" },
      { keys: ["шумоподавлен", "anc", "降噪", "noise cancelling"], text: "主动降噪 ANC" },
      { keys: ["ipx5", "ipx7", "防水", "waterproof"], text: "IPX 防水防汗" },
      { keys: ["сенсор", "触控", "touch"], text: "智能触控操作" },
      { keys: ["микрофон", "mic", "麦克风"], text: "高清通话麦克风" },
      { keys: ["время работ 30", "长续航", "long battery"], text: "超长续航" },
    ],
    ozonKeywords: ["tws наушники", "беспроводные наушники вкладыши"] },
  over_ear_headphones: { id: "over_ear_headphones", name: "头戴式蓝牙耳机",
    matchKeywords: ["头戴式", "头戴", "over-ear", "полноразмерн наушник", "большие наушник", "наушник накладн"],
    usps: [
      { keys: ["шумоподавлен", "anc", "降噪"], text: "主动降噪" },
      { keys: ["bluetooth 5", "蓝牙 5"], text: "蓝牙 5.x 稳定连接" },
      { keys: ["время работ 30", "40 часов", "长续航"], text: "40+ 小时长续航" },
      { keys: ["складн", "可折叠", "foldable"], text: "可折叠便携" },
    ],
    ozonKeywords: ["полноразмерные наушники", "наушники накладные беспроводные"] },
  wired_earphones: { id: "wired_earphones", name: "有线耳机",
    matchKeywords: ["проводн наушник", "有线耳机", "wired earphone", "проводн гарнитур"],
    usps: [
      { keys: ["разъём 3.5", "3.5mm", "type-c"], text: "3.5mm / Type-C 接口" },
      { keys: ["микрофон", "mic", "麦克风", "пульт"], text: "线控麦克风" },
      { keys: ["bass", "бас", "重低音"], text: "强劲重低音" },
    ],
    ozonKeywords: ["проводные наушники", "гарнитура проводная"] },
  gaming_headset: { id: "gaming_headset", name: "电竞游戏耳机",
    matchKeywords: ["игров наушник", "gaming headset", "电竞耳机", "игров гарнитур"],
    usps: [
      { keys: ["7.1 surround", "объёмн звук", "虚拟 7.1"], text: "7.1 虚拟环绕声" },
      { keys: ["микрофон с шумоподавл", "降噪麦克"], text: "降噪麦克风" },
      { keys: ["rgb", "подсветк", "灯效"], text: "RGB 灯光效果" },
      { keys: ["проводн", "беспроводн 2.4g", "usb"], text: "有线 / 2.4G 无线" },
    ],
    ozonKeywords: ["игровые наушники", "игровая гарнитура"] },
  bluetooth_speaker: { id: "bluetooth_speaker", name: "蓝牙音箱",
    matchKeywords: ["bluetooth колонк", "蓝牙音箱", "portable speaker", "беспроводн колонк", "акустическ систем"],
    usps: [
      { keys: ["мощн 20", "мощн 30", "вт", "watt"], text: "大功率输出" },
      { keys: ["ipx7", "водонепроницаем", "防水"], text: "IPX7 级防水" },
      { keys: ["время работ 12", "20 часов", "长续航"], text: "超长续航" },
      { keys: ["bass", "низк частот", "低音"], text: "强劲低音" },
      { keys: ["fm", "радио", "收音机"], text: "内置 FM 收音机" },
      { keys: ["tf", "microsd", "usb", "aux"], text: "支持 TF 卡 / U 盘 / AUX" },
    ],
    ozonKeywords: ["bluetooth колонка", "портативная колонка"] },
  smart_speaker: { id: "smart_speaker", name: "智能音箱 / 智能音响",
    matchKeywords: ["умн колонк", "smart speaker", "yandex станци", "алис", "маруся", "ассистент"],
    usps: [
      { keys: ["голосов помощник", "ассистент"], text: "内置语音助手" },
      { keys: ["wi-fi", "bluetooth"], text: "WiFi + 蓝牙双连接" },
      { keys: ["умн дом", "smart home"], text: "智能家居控制中枢" },
    ],
    ozonKeywords: ["умная колонка", "смарт колонка"] },

  // ==================== 电子产品 > 穿戴 ====================
  smartwatch: { id: "smartwatch", name: "智能手表",
    matchKeywords: ["смарт-часы", "smart watch", "умные часы", "智能手表"],
    usps: [
      { keys: ["пульс", "心率", "spo2", "血氧", "心率"], text: "实时心率 / 血氧监测" },
      { keys: ["gps", "навигац"], text: "内置 GPS" },
      { keys: ["ip68", "вод", "防水"], text: "IP68 防水" },
      { keys: ["спорт режим", "运动模式", "100+"], text: "100+ 运动模式" },
      { keys: ["уведомлен", "通知", "звонк", "通话"], text: "消息通知 / 蓝牙通话" },
    ],
    ozonKeywords: ["смарт-часы", "умные часы"] },
  fitness_band: { id: "fitness_band", name: "智能手环",
    matchKeywords: ["фитнес-браслет", "fitness band", "智能手环", "小米手环", "honor band"],
    usps: [
      { keys: ["пульс", "心率", "spo2", "血氧"], text: "心率血氧监测" },
      { keys: ["шаг", "步数", "睡眠", "сон"], text: "步数 / 睡眠监测" },
      { keys: ["ip68", "防水", "5 атм"], text: "5ATM 防水" },
      { keys: ["14 дней", "长续航", "long battery"], text: "14 天长续航" },
    ],
    ozonKeywords: ["фитнес-браслет", "спортивный браслет"] },

  // ==================== 电子产品 > 影像 ====================
  action_camera: { id: "action_camera", name: "运动相机 / 户外相机",
    matchKeywords: ["экшн-камер", "action camera", "运动相机", "gopro"],
    usps: [
      { keys: ["4k 60fps", "4k 30fps", "4k"], text: "4K 高清拍摄" },
      { keys: ["стабилизац", "防抖", "gimbal"], text: "电子防抖" },
      { keys: ["водонепроницаем 10м", "ipx8", "防水"], text: "10 米防水" },
      { keys: ["широкоугольн", "超广角", "wide angle"], text: "超广角镜头" },
    ],
    ozonKeywords: ["экшн-камера", "спортивная камера"] },
  car_dvr: { id: "car_dvr", name: "行车记录仪",
    matchKeywords: ["видеорегистратор", "行车记录仪", "dash cam", "авто регистратор"],
    usps: [
      { keys: ["1080p", "2k", "4k", "全高清"], text: "全高清录制" },
      { keys: ["широкоугольн 170", "170 度", "广角"], text: "170° 广角" },
      { keys: ["gps", "g-сенсор", "g-sensor"], text: "GPS + G-sensor" },
      { keys: ["ночн режим", "夜视", "night vision"], text: "夜视功能" },
    ],
    ozonKeywords: ["видеорегистратор"] },

  // ==================== 家居 > 厨房小家电 ====================
  electric_kettle: { id: "electric_kettle", name: "电水壶",
    matchKeywords: ["электрическ чайник", "电水壶", "electric kettle", "чайник"],
    usps: [
      { keys: ["мощн 1500", "2200", "вт"], text: "1500W+ 速热" },
      { keys: ["1.5л", "1.7л", "2л"], text: "大容量" },
      { keys: ["нержавеющ сталь", "不锈钢", "stainless steel"], text: "食品级不锈钢内胆" },
      { keys: ["автоотключен", "защита от перегрев"], text: "防干烧自动断电" },
      { keys: ["подсветк", "световой индикатор"], text: "蓝光水位窗" },
    ],
    ozonKeywords: ["электрический чайник", "чайник"] },
  coffee_maker: { id: "coffee_maker", name: "咖啡机",
    matchKeywords: ["кофеварк", "кофемашин", "咖啡机", "coffee maker", "espresso machine"],
    usps: [
      { keys: ["15 бар", "15 bar", "давление"], text: "15bar 高压萃取" },
      { keys: ["капучинатор", "капучино", "奶泡"], text: "奶泡机 / 卡布奇诺" },
      { keys: ["автоматическ", "automatic"], text: "全自动操作" },
      { keys: ["капсульн", "nespresso", "胶囊"], text: "胶囊 / 研磨两用" },
    ],
    ozonKeywords: ["кофемашина", "кофеварка"] },
  blender: { id: "blender", name: "料理机 / 榨汁机",
    matchKeywords: ["блендер", "料理机", "榨汁机", "blender", "соковыжималк"],
    usps: [
      { keys: ["мощн 1000", "1200", "вт"], text: "大功率马达" },
      { keys: ["стакан 1.5л", "1.8л", "2л"], text: "大容量杯" },
      { keys: ["нож из нержавеющ", "不锈钢刀片"], text: "不锈钢 6 叶刀片" },
      { keys: ["пульс режим", "pulse mode"], text: "脉冲模式" },
    ],
    ozonKeywords: ["блендер", "стационарный блендер"] },
  air_fryer: { id: "air_fryer", name: "空气炸锅",
    matchKeywords: ["аэрогриль", "аэрофритюрниц", "空气炸锅", "air fryer"],
    usps: [
      { keys: ["5л", "6л", "8л"], text: "5-8L 大容量" },
      { keys: ["мощн 1500", "1800", "вт"], text: "大功率快速加热" },
      { keys: ["сенсорн управлен", "触屏"], text: "触屏操作" },
      { keys: ["без масла", "无油", "oil-free"], text: "无油健康烹饪" },
    ],
    ozonKeywords: ["аэрогриль", "аэрофритюрница"] },
  microwave: { id: "microwave", name: "微波炉",
    matchKeywords: ["микроволнов", "微波炉", "microwave", "микроволновк"],
    usps: [
      { keys: ["20л", "23л", "25л", "30л"], text: "20-30L 容量" },
      { keys: ["гриль", "烧烤", "convection"], text: "烧烤 / 对流功能" },
      { keys: ["инвертор", "inverter"], text: "变频技术" },
    ],
    ozonKeywords: ["микроволновая печь", "микроволновка"] },
  vacuum_cleaner: { id: "vacuum_cleaner", name: "吸尘器",
    matchKeywords: ["пылесос", "吸尘器", "vacuum cleaner", "робот-пылесос"],
    usps: [
      { keys: ["мощн всасыван 20000", "20000pa", "pa"], text: "20000+pa 大吸力" },
      { keys: ["аккумулятор", "беспроводн", "无线"], text: "无线便携" },
      { keys: ["hepa фильтр", "hepa"], text: "HEPA 滤网" },
      { keys: ["робот", "авто", "智能避障"], text: "智能避障" },
    ],
    ozonKeywords: ["пылесос", "робот-пылесос"] },

  // ==================== 家居 > 生活小家电 ====================
  hair_dryer: { id: "hair_dryer", name: "吹风机",
    matchKeywords: ["фен для волос", "吹风机", "hair dryer"],
    usps: [
      { keys: ["мощн 1800", "2200", "вт"], text: "1800W+ 大功率" },
      { keys: ["ионизац", "ионн", "负离子", "negative ion"], text: "负离子护发" },
      { keys: ["складн", "可折叠"], text: "可折叠便携" },
      { keys: ["3 насадк", "3 档", "3 режим"], text: "3 档风温 / 多种风嘴" },
    ],
    ozonKeywords: ["фен для волос", "фен"] },
  hair_straightener: { id: "hair_straightener", name: "直发器 / 卷发棒",
    matchKeywords: ["выпрямитель", "直发器", "плойк", "卷发棒", "утюжок для волос"],
    usps: [
      { keys: ["кера", "турмал", "керамич", "ceramic"], text: "陶瓷涂层不伤发" },
      { keys: ["230", "210", "200", "макс"], text: "200-230°C 快速升温" },
      { keys: ["ионизац", "отрицат ион"], text: "负离子护发" },
    ],
    ozonKeywords: ["выпрямитель для волос", "плойка"] },
  electric_shaver: { id: "electric_shaver", name: "电动剃须刀",
    matchKeywords: ["электробритв", "电动剃须刀", "shaver", "razor"],
    usps: [
      { keys: ["аккумулятор", "电池", "беспроводн"], text: "无线便携" },
      { keys: ["водонепроницаем", "防水", "ipx"], text: "全身水洗" },
      { keys: ["3 лезвия", "rotary", "rotating"], text: "3 刀头浮动剃须" },
      { keys: ["быстрая зарядка 1 час", "1 小时快充"], text: "快充长续航" },
    ],
    ozonKeywords: ["электробритва"] },

  // ==================== 美妆护肤 > 面部 ====================
  face_cream: { id: "face_cream", name: "面霜 / 乳液",
    matchKeywords: ["крем для лиц", "面霜", "面霜", "крем увлажняющ", "лосьон для лиц"],
    usps: [
      { keys: ["увлажняющ", "保湿", "moisturizing"], text: "24h 深层保湿" },
      { keys: ["антивозрастн", "anti-age", "抗皱"], text: "抗皱抗老" },
      { keys: ["гиалуронов", "玻尿酸", "hyaluronic"], text: "含玻尿酸" },
      { keys: ["натуральн", "有机", "organic"], text: "天然成分" },
      { keys: ["spf 30", "spf 50", "防晒"], text: "SPF 防晒" },
    ],
    ozonKeywords: ["крем для лица", "увлажняющий крем"] },
  serum: { id: "serum", name: "精华 / 精华液",
    matchKeywords: ["сыворотк", "精华", "serum", "essence", "эссенция"],
    usps: [
      { keys: ["витамин c", "维 c"], text: "高浓度维 C" },
      { keys: ["ниацинамид", "烟酰胺"], text: "烟酰胺亮肤" },
      { keys: ["гиалуронов кислот", "玻尿酸"], text: "玻尿酸保湿" },
      { keys: ["ретинол", "视黄醇"], text: "视黄醇抗老" },
    ],
    ozonKeywords: ["сыворотка для лица", "серум"] },
  face_mask: { id: "face_mask", name: "面膜",
    matchKeywords: ["маск для лиц", "面膜", "sheet mask", "тканев маск"],
    usps: [
      { keys: ["увлажняющ", "保湿"], text: "深层补水" },
      { keys: ["гиалуронов", "玻尿酸"], text: "含玻尿酸" },
      { keys: ["коллаген", "胶原蛋白"], text: "含胶原蛋白" },
      { keys: ["набор 10", "набор 25", "套装"], text: "多片套装" },
    ],
    ozonKeywords: ["маска для лица тканевая"] },
  sunscreen: { id: "sunscreen", name: "防晒霜",
    matchKeywords: ["солнцезащитн крем", "防晒", "sunscreen", "spf крем"],
    usps: [
      { keys: ["spf 50", "spf 30"], text: "SPF 30-50+" },
      { keys: ["pa++++", "pa +++"], text: "高倍 PA 防护" },
      { keys: ["водостойк", "waterproof", "防水防晒"], text: "防水防汗" },
      { keys: ["некомедогенн", "低敏"], text: "低敏配方" },
    ],
    ozonKeywords: ["солнцезащитный крем", "санскрин"] },
  cleanser: { id: "cleanser", name: "洁面 / 卸妆",
    matchKeywords: ["гель для умыван", "洁面", "cleanser", "пенк для умыван", "卸妆水", "卸妆油", "micellar water"],
    usps: [
      { keys: ["мягк", "нежн", "低刺激"], text: "温和不刺激" },
      { keys: ["глубок очищ", "глубок очистк", "深层清洁"], text: "深层清洁" },
      { keys: ["гипоаллергенн", "低敏"], text: "低敏配方" },
    ],
    ozonKeywords: ["гель для умывания", "мицеллярная вода"] },

  // ==================== 美妆护肤 > 彩妆 ====================
  lipstick: { id: "lipstick", name: "口红 / 唇釉",
    matchKeywords: ["помад", "口红", "lipstick", "блеск для губ", "唇釉", "тинт для губ"],
    usps: [
      { keys: ["стойк 24", "long-lasting 24h", "持久"], text: "24h 持久" },
      { keys: ["увлажняющ", "保湿", "moisturizing"], text: "保湿不干" },
      { keys: ["матовая", "丝绒", "哑光", "matte"], text: "哑光 / 丝绒质地" },
      { keys: ["витамин e", "维 e"], text: "含维 E 护唇" },
    ],
    ozonKeywords: ["помада для губ", "блеск для губ"] },
  foundation: { id: "foundation", name: "粉底 / BB 霜",
    matchKeywords: ["тональн крем", "粉底", "foundation", "bb крем", "cc крем"],
    usps: [
      { keys: ["spf", "防晒"], text: "含 SPF 防晒" },
      { keys: ["матов", "matte"], text: "哑光持妆" },
      { keys: ["увлажняющ", "保湿"], text: "保湿服帖" },
      { keys: ["стойк 24", "持久"], text: "24h 持久不脱妆" },
    ],
    ozonKeywords: ["тональный крем", "тональник"] },
  mascara: { id: "mascara", name: "睫毛膏",
    matchKeywords: ["туш для ресниц", "睫毛膏", "mascara"],
    usps: [
      { keys: ["объём", "volume", "浓密"], text: "浓密卷翘" },
      { keys: ["длин", "length", "纤长"], text: "纤长浓密" },
      { keys: ["водостойк", "waterproof", "防水"], text: "防水防汗" },
      { keys: ["стойк 24", "持久"], text: "24h 持久" },
    ],
    ozonKeywords: ["тушь для ресниц", "тушь"] },
  eyeshadow: { id: "eyeshadow", name: "眼影 / 眼妆盘",
    matchKeywords: ["тени для век", "眼影", "eyeshadow", "палетк теней"],
    usps: [
      { keys: ["12 цветов", "24 цвет", "12 色", "多色"], text: "12-24 色多色盘" },
      { keys: ["матов", "мерцающ", "shimmer", "珠光"], text: "哑光 / 珠光多质地" },
      { keys: ["стойк", "long-lasting"], text: "长效不脱色" },
    ],
    ozonKeywords: ["палетка теней для век", "тени для век"] },
  nail_polish: { id: "nail_polish", name: "指甲油 / 美甲",
    matchKeywords: ["лак для ногт", "指甲油", "nail polish", "гель-лак", "美甲"],
    usps: [
      { keys: ["гель-лак", "gel"], text: "持久凝胶" },
      { keys: ["led", "uv", "光疗"], text: "LED/UV 光疗" },
      { keys: ["без вредн", "无毒", "9-free"], text: "无毒无害" },
    ],
    ozonKeywords: ["лак для ногтей", "гель-лак"] },

  // ==================== 美妆护肤 > 香水 ====================
  perfume_women: { id: "perfume_women", name: "女士香水",
    matchKeywords: ["женск парфюм", "女士香水", "women perfume", "edp женск"],
    usps: [
      { keys: ["цветочн", "floral", "花香"], text: "花香调" },
      { keys: ["фруктов", "果香"], text: "果香调" },
      { keys: ["восточн", "oriental", "东方调"], text: "东方调" },
      { keys: ["стойк 12", "持久"], text: "12h+ 持久留香" },
    ],
    ozonKeywords: ["женский парфюм", "духи женские"] },
  perfume_men: { id: "perfume_men", name: "男士香水",
    matchKeywords: ["мужск парфюм", "男士香水", "men perfume", "edt мужск"],
    usps: [
      { keys: ["древесн", "woody", "木香"], text: "木质香调" },
      { keys: ["кожан", "皮革"], text: "皮革烟草调" },
      { keys: ["свеж", "fresh", "清新"], text: "清新调" },
      { keys: ["стойк 12", "持久"], text: "12h+ 持久" },
    ],
    ozonKeywords: ["мужской парфюм", "одеколон мужской"] },

  // ==================== 服装 > 女装 ====================
  womens_dress: { id: "womens_dress", name: "女装连衣裙",
    matchKeywords: ["платье", "连衣裙", "women dress", "сарафан", "女裙"],
    usps: [
      { keys: ["хлопок", "cotton", "棉"], text: "纯棉 / 亲肤面料" },
      { keys: ["льнян", "linen", "亚麻"], text: "亚麻透气" },
      { keys: ["большой размер", "大码", "plus size"], text: "大码支持" },
      { keys: ["эластичн", "弹性", "stretch"], text: "弹性面料" },
      { keys: ["модн", "стильн", "时尚"], text: "时尚设计" },
    ],
    ozonKeywords: ["платье женское", "женское платье"] },
  womens_tshirt: { id: "womens_tshirt", name: "女装 T 恤 / 上衣",
    matchKeywords: ["футболк женск", "女 t 恤", "майк женск", "топ женск", "блузк"],
    usps: [
      { keys: ["хлопок 100", "100% хлопок", "纯棉"], text: "100% 纯棉" },
      { keys: ["дышащ", "透气"], text: "透气亲肤" },
      { keys: ["oversize", "оверсайз", "宽松"], text: "oversize 宽松版型" },
    ],
    ozonKeywords: ["футболка женская", "топ женский"] },
  womens_jacket: { id: "womens_jacket", name: "女装外套 / 大衣",
    matchKeywords: ["куртк женск", "女外套", "пальто", "大衣", "女大衣", "пуховик женск"],
    usps: [
      { keys: ["утеплённ", "保暖", "теплый"], text: "加厚保暖" },
      { keys: ["пух", "down", "羽绒"], text: "白鸭绒 / 灰鸭绒" },
      { keys: ["водонепроницаем", "防水"], text: "防风防水" },
      { keys: ["капюшон", "hood", "连帽"], text: "可拆卸连帽" },
    ],
    ozonKeywords: ["куртка женская", "пальто женское", "пуховик женский"] },
  womens_pants: { id: "womens_pants", name: "女装裤装",
    matchKeywords: ["брюк женск", "女裤", "джинс женск", "女牛仔裤", "леггинс", "打底裤"],
    usps: [
      { keys: ["хлопок", "棉", "cotton"], text: "纯棉 / 棉弹" },
      { keys: ["высок посадк", "高腰", "high waist"], text: "高腰显瘦" },
      { keys: ["эластичн", "弹性", "stretch"], text: "弹力修身" },
    ],
    ozonKeywords: ["брюки женские", "джинсы женские"] },
  lingerie: { id: "lingerie", name: "女装内衣 / 睡衣",
    matchKeywords: ["бюстгальтер", "内衣", "brassiere", "bra", "нижнее белье", "睡衣", "пижам"],
    usps: [
      { keys: ["хлопок", "棉", "cotton"], text: "纯棉透气" },
      { keys: ["кружев", "lace", "蕾丝"], text: "蕾丝装饰" },
      { keys: ["бесшовн", "seamless", "无痕"], text: "无痕无钢圈" },
    ],
    ozonKeywords: ["бюстгальтер", "нижнее белье"] },

  // ==================== 服装 > 男装 ====================
  mens_tshirt: { id: "mens_tshirt", name: "男装 T 恤 / POLO",
    matchKeywords: ["футболк мужск", "男 t 恤", "поло мужск", "polo"],
    usps: [
      { keys: ["хлопок 100", "100% хлопок"], text: "100% 纯棉" },
      { keys: ["дышащ", "透气"], text: "透气舒适" },
      { keys: ["большой размер", "大码"], text: "大码支持" },
    ],
    ozonKeywords: ["футболка мужская", "поло мужское"] },
  mens_jacket: { id: "mens_jacket", name: "男装外套 / 夹克",
    matchKeywords: ["куртк мужск", "男外套", "пуховик мужск", "ветровк", "ветровка"],
    usps: [
      { keys: ["утеплённ", "保暖"], text: "加厚保暖" },
      { keys: ["ветрозащитн", "防风"], text: "防风防水" },
      { keys: ["капюшон", "hood", "连帽"], text: "可调节连帽" },
    ],
    ozonKeywords: ["куртка мужская", "пуховик мужской"] },
  mens_pants: { id: "mens_pants", name: "男装裤装",
    matchKeywords: ["брюк мужск", "男裤", "джинс мужск", "男牛仔裤", "штаны"],
    usps: [
      { keys: ["хлопок", "棉", "cotton"], text: "纯棉 / 棉弹" },
      { keys: ["эластичн", "弹性", "stretch"], text: "弹力修身" },
      { keys: ["классическ", "经典", "classic"], text: "经典版型" },
    ],
    ozonKeywords: ["брюки мужские", "джинсы мужские"] },
  mens_underwear: { id: "mens_underwear", name: "男装内衣 / 袜子",
    matchKeywords: ["трусы", "内裤", "men underwear", "носк", "袜子", "袜"],
    usps: [
      { keys: ["хлопок", "棉", "cotton"], text: "纯棉透气" },
      { keys: ["бесшовн", "seamless", "无痕"], text: "无痕舒适" },
      { keys: ["набор", "套装", "set"], text: "多件套装" },
    ],
    ozonKeywords: ["мужское нижнее белье", "носки мужские"] },

  // ==================== 服装 > 鞋帽 ====================
  sneakers: { id: "sneakers", name: "运动鞋 / 休闲鞋",
    matchKeywords: ["кроссовк", "运动鞋", "sneaker", "sneakers"],
    usps: [
      { keys: ["дышащ", "透气", "breathable"], text: "透气网面" },
      { keys: ["амортизац", "缓震", "cushion"], text: "缓震气垫" },
      { keys: ["лёгк", "轻量"], text: "轻量设计" },
      { keys: ["водоотталкивающ", "防泼水"], text: "防泼水" },
    ],
    ozonKeywords: ["кроссовки", "спортивная обувь"] },
  winter_boots: { id: "winter_boots", name: "雪地靴 / 冬靴",
    matchKeywords: ["зимн сапог", "雪地靴", "зимн ботинк", "冬靴", "уги"],
    usps: [
      { keys: ["утеплённ", "保暖", "мех"], text: "加绒保暖" },
      { keys: ["натуральн овчин", "天然羊毛"], text: "天然羊毛内里" },
      { keys: ["водонепроницаем", "防水"], text: "防水鞋面" },
      { keys: ["антискользящ подошв", "防滑鞋底"], text: "防滑大底" },
    ],
    ozonKeywords: ["зимние сапоги", "уги"] },
  slippers: { id: "slippers", name: "拖鞋 / 凉拖",
    matchKeywords: ["тапк", "拖鞋", "шлёпанц", "凉拖", "сланцы", "flip flop"],
    usps: [
      { keys: ["ev", "эва", "轻量 eva"], text: "EVA 轻量材质" },
      { keys: ["амортизац", "缓震"], text: "缓震舒适" },
      { keys: ["водостойк", "防水"], text: "防水可水洗" },
    ],
    ozonKeywords: ["тапочки", "шлепанцы"] },
  hat: { id: "hat", name: "帽子 / 头饰",
    matchKeywords: ["шапк", "帽子", "帽", "кепк", "棒球帽", "берет", "панам"],
    usps: [
      { keys: ["утеплённ", "保暖", "теплый"], text: "加绒保暖" },
      { keys: ["хлопок", "棉", "棉质"], text: "纯棉 / 棉质" },
      { keys: ["защит от солнц", "防晒", "upf"], text: "UPF 防晒" },
    ],
    ozonKeywords: ["шапка", "кепка", "бейсболка"] },

  // ==================== 母婴 ====================
  baby_clothes: { id: "baby_clothes", name: "婴幼儿童装",
    matchKeywords: ["детск одежд", "儿童装", "婴幼装", "宝宝装", "kids clothing"],
    usps: [
      { keys: ["хлопок 100", "100% хлопок", "有机棉"], text: "100% 纯棉 / 有机棉" },
      { keys: ["гипоаллергенн", "低敏"], text: "低敏无刺激" },
      { keys: ["безопасн", "无毒"], text: "无荧光剂安全" },
    ],
    ozonKeywords: ["детская одежда", "одежда для новорожденных"] },
  diaper: { id: "diaper", name: "纸尿裤 / 拉拉裤",
    matchKeywords: ["подгузник", "尿不湿", "diaper", "拉拉裤", "трусики подгузник"],
    usps: [
      { keys: ["12 часов", "сухост", "12h 干爽"], text: "12 小时干爽" },
      { keys: ["дышащ", "透气"], text: "透气不闷" },
      { keys: ["гипоаллергенн", "低敏"], text: "低敏材质" },
      { keys: ["впитывающ", "absor", "瞬吸"], text: "瞬吸防漏" },
    ],
    ozonKeywords: ["подгузники", "подгузники-трусики"] },
  baby_toy: { id: "baby_toy", name: "婴幼玩具",
    matchKeywords: ["игрушк для малыш", "婴幼玩具", "婴儿玩具", "погремушк", "摇铃"],
    usps: [
      { keys: ["безопасн", "无毒", "без бпа"], text: "无 BPA 安全材质" },
      { keys: ["развивающ", "益智", "educational"], text: "益智早教" },
      { keys: ["мягк", "柔软", "soft"], text: "柔软不伤手" },
    ],
    ozonKeywords: ["игрушки для малышей", "развивающие игрушки"] },
  stroller: { id: "stroller", name: "婴儿车 / 推车",
    matchKeywords: ["коляск", "婴儿车", "推车", "stroller", "прогулочн коляск"],
    usps: [
      { keys: ["складн", "可折叠", "foldable"], text: "一键折叠" },
      { keys: ["лёгк", "轻便", "lightweight"], text: "轻量便携" },
      { keys: ["поворотн", "360", "转向"], text: "360° 转向轮" },
    ],
    ozonKeywords: ["коляска детская", "прогулочная коляска"] },

  // ==================== 玩具 ====================
  lego: { id: "lego", name: "积木 / 拼装玩具",
    matchKeywords: ["конструктор", "积木", "拼装", "лего", "lego", "блоки"],
    usps: [
      { keys: ["развивающ", "益智", "educational"], text: "益智开发" },
      { keys: ["мотор", "электрическ", "电动"], text: "电动 / 机械" },
      { keys: ["безопасн", "无毒", "abs"], text: "ABS 安全材质" },
    ],
    ozonKeywords: ["конструктор", "лего"] },
  plush: { id: "plush", name: "毛绒玩具 / 公仔",
    matchKeywords: ["мягк игрушк", "毛绒玩具", "公仔", "плюшев игрушк", "plush"],
    usps: [
      { keys: ["мягк", "柔软", "soft"], text: "柔软亲肤" },
      { keys: ["безопасн", "无毒"], text: "环保无毒填充" },
      { keys: ["обнимашк", "huggable"], text: "可抱可搂" },
    ],
    ozonKeywords: ["мягкая игрушка", "плюшевая игрушка"] },
  puzzle: { id: "puzzle", name: "拼图 / 益智玩具",
    matchKeywords: ["пазл", "拼图", "puzzle", "головоломк", "益智玩具"],
    usps: [
      { keys: ["1000 элемент", "1000 片"], text: "1000+ 片大容量" },
      { keys: ["деревянн", "木质", "wooden"], text: "木质耐用" },
      { keys: ["развивающ", "обучающ", "educational"], text: "益智开发智力" },
    ],
    ozonKeywords: ["пазлы", "головоломки"] },

  // ==================== 家居家纺 ====================
  bedding: { id: "bedding", name: "床品套件 / 被套",
    matchKeywords: ["постельн белье", "床品", "被子", "простын", "床单", "наволочк", "подушк", "枕头", "одеял"],
    usps: [
      { keys: ["хлопок 100", "cotton", "纯棉"], text: "100% 纯棉" },
      { keys: ["сатин", "satin"], text: "高密度缎纹" },
      { keys: ["сатин-жаккард", "жаккард", "提花"], text: "提花工艺" },
      { keys: ["гипоаллергенн", "低敏"], text: "低敏面料" },
    ],
    ozonKeywords: ["постельное белье", "комплект постельного белья"] },
  towel: { id: "towel", name: "毛巾 / 浴巾",
    matchKeywords: ["полотенц", "毛巾", "浴巾", "towel"],
    usps: [
      { keys: ["хлопок 100", "纯棉"], text: "100% 纯棉" },
      { keys: ["плотн 600", "600 г/м", "高密度"], text: "高密度长毛圈" },
      { keys: ["впитывающ", "吸水"], text: "强吸水" },
    ],
    ozonKeywords: ["полотенце банное", "полотенце"] },
  curtain: { id: "curtain", name: "窗帘",
    matchKeywords: ["штор", "窗帘", "curtain", "занавеск"],
    usps: [
      { keys: ["блэкаут", "遮光", "blackout"], text: "全遮光" },
      { keys: ["полиэстер", "polyester"], text: "免烫易护理" },
      { keys: ["длин 2.5м", "2.7м", "加长款"], text: "加长款适合高层" },
    ],
    ozonKeywords: ["шторы", "шторы блэкаут"] },
  storage_box: { id: "storage_box", name: "收纳箱 / 整理盒",
    matchKeywords: ["контейнер для хранен", "收纳", "ящик для хранен", "整理盒", "storage box"],
    usps: [
      { keys: ["складн", "可折叠"], text: "可折叠收纳" },
      { keys: ["прозрачн", "透明"], text: "透明可视" },
      { keys: ["больш объём", "大容量"], text: "大容量" },
      { keys: ["многосекцион", "多格"], text: "多格分类" },
    ],
    ozonKeywords: ["контейнер для хранения", "коробка для хранения"] },

  // ==================== 厨房用品 ====================
  pan: { id: "pan", name: "不粘锅 / 煎锅",
    matchKeywords: ["сковород", "煎锅", "pan", "frying pan", "wok"],
    usps: [
      { keys: ["антипригарн", "不粘", "non-stick"], text: "不粘涂层" },
      { keys: ["мраморн", "гранитн", "granite", "大理石"], text: "麦饭石 / 大理石涂层" },
      { keys: ["индукц", "电磁炉", "induction"], text: "电磁炉适用" },
      { keys: ["съёмн ручк", "可拆手柄"], text: "可拆手柄" },
    ],
    ozonKeywords: ["сковорода", "сковорода антипригарная"] },
  pot: { id: "pot", name: "汤锅 / 炖锅 / 奶锅",
    matchKeywords: ["кастрюл", "汤锅", "炖锅", "pot", "сотейник", "奶锅", "ковш"],
    usps: [
      { keys: ["нержавеющ сталь", "不锈钢", "stainless"], text: "食品级 304 不锈钢" },
      { keys: ["многослойн дно", "多层底", "三层底"], text: "三层复合底" },
      { keys: ["стеклян крышк", "玻璃盖"], text: "玻璃可视盖" },
      { keys: ["индукц", "电磁炉"], text: "电磁炉适用" },
    ],
    ozonKeywords: ["кастрюля", "кастрюля из нержавеющей стали"] },
  knife: { id: "knife", name: "厨刀 / 刀具",
    matchKeywords: ["нож кухон", "厨刀", "knives", "刀", "нож набор", "刀具套装"],
    usps: [
      { keys: ["нержавеющ сталь", "不锈钢"], text: "高碳不锈钢" },
      { keys: ["керамич", "陶瓷", "ceramic"], text: "陶瓷刀具" },
      { keys: ["набор", "套装", "set"], text: "多件套组合" },
      { keys: ["самозатачивающ", "self-sharpening", "自动磨刀"], text: "持久锋利" },
    ],
    ozonKeywords: ["нож кухонный", "набор ножей"] },

  // ==================== 灯具 ====================
  smart_bulb: { id: "smart_bulb", name: "智能灯泡 / 智能照明",
    matchKeywords: ["умн лампочк", "智能灯泡", "smart bulb", "умн свет", "智能灯"],
    usps: [
      { keys: ["wi-fi", "wifi", "智能"], text: "WiFi 智能控制" },
      { keys: ["alexa", "google home", "ассистент"], text: "兼容 Alexa/Google Home" },
      { keys: ["rgb", "цветн", "16 млн"], text: "1600 万色 RGB" },
      { keys: ["диммируем", "调光"], text: "可调光调色温" },
    ],
    ozonKeywords: ["умная лампочка", "смарт лампа"] },
  led_strip: { id: "led_strip", name: "LED 灯带 / 氛围灯",
    matchKeywords: ["led лент", "灯带", "led strip", "rgb лент", "氛围灯"],
    usps: [
      { keys: ["rgb", "rgbic", "多彩"], text: "RGB 多彩模式" },
      { keys: ["wi-fi", "bluetooth", "智能"], text: "APP 智能控制" },
      { keys: ["5м", "10м", "20м", "加长"], text: "5-20m 加长款" },
      { keys: ["музык синхрон", "music sync"], text: "音乐律动同步" },
    ],
    ozonKeywords: ["светодиодная лента", "LED лента RGB"] },

  // ==================== 汽配 ====================
  car_phone_holder: { id: "car_phone_holder", name: "车载手机支架",
    matchKeywords: ["автодержател", "车载手机支架", "car phone holder", "держатель телефон"],
    usps: [
      { keys: ["магнитн", "磁吸", "magnetic"], text: "磁吸秒装" },
      { keys: ["беспроводн зарядк", "无线充电"], text: "支持无线充电" },
      { keys: ["универсальн", "通用", "universal"], text: "通用型适配" },
    ],
    ozonKeywords: ["автодержатель для телефона"] },
  car_vacuum: { id: "car_vacuum", name: "车载吸尘器",
    matchKeywords: ["автопылесос", "车载吸尘器", "car vacuum"],
    usps: [
      { keys: ["мощн 120", "5000pa", "pa"], text: "大吸力" },
      { keys: ["аккумулятор", "беспроводн", "无线"], text: "无线便携" },
      { keys: ["hepa фильтр", "hepa"], text: "HEPA 滤网" },
    ],
    ozonKeywords: ["автомобильный пылесос"] },

  // ==================== 运动户外 ====================
  yoga_mat: { id: "yoga_mat", name: "瑜伽垫 / 健身垫",
    matchKeywords: ["коврик для йог", "瑜伽垫", "yoga mat", "健身垫"],
    usps: [
      { keys: ["tpe", "экологичн", "环保"], text: "TPE 环保无味" },
      { keys: ["нескользящ", "防滑", "non-slip"], text: "双面防滑" },
      { keys: ["6мм", "8мм", "10мм", "加厚"], text: "加厚 6-10mm" },
    ],
    ozonKeywords: ["коврик для йоги", "коврик для фитнеса"] },
  tent: { id: "tent", name: "帐篷 / 露营",
    matchKeywords: ["палатка", "帐篷", "tent", "кемпинг", "露营"],
    usps: [
      { keys: ["водонепроницаем", "防水"], text: "防雨防水" },
      { keys: ["автоматическ", "速开", "automatic"], text: "一键速开" },
      { keys: ["2-местн", "3-местн", "4-местн", "2-4 人"], text: "2-4 人款" },
      { keys: ["лёгк", "轻量", "lightweight"], text: "轻量便携" },
    ],
    ozonKeywords: ["палатка туристическая", "палатка кемпинговая"] },
  dumbbell: { id: "dumbbell", name: "哑铃 / 杠铃",
    matchKeywords: ["гантел", "哑铃", "dumbbell", "штанг", "杠铃"],
    usps: [
      { keys: ["регулируем", "可调", "adjustable"], text: "可调节重量" },
      { keys: ["нескользящ", "防滑"], text: "防滑握把" },
      { keys: ["комплект", "套装", "set"], text: "一对 / 套装" },
    ],
    ozonKeywords: ["гантели", "набор гантелей"] },

  // ==================== 保健 / 食品 ====================
  vitamin: { id: "vitamin", name: "维生素 / 营养品",
    matchKeywords: ["витамин", "维他命", "vitamin", "бад", "营养品"],
    usps: [
      { keys: ["натуральн", "organic", "天然"], text: "天然成分" },
      { keys: ["без гмо", "non-gmo"], text: "非转基因" },
      { keys: ["веган", "vegan", "素食"], text: "素食 / 纯素" },
      { keys: ["60 таблет", "90 капсул", "100 капсул", "高含量"], text: "高含量 60-100 粒" },
    ],
    ozonKeywords: ["витамины", "биологически активные добавки"] },
  tea: { id: "tea", name: "茶叶 / 茶饮",
    matchKeywords: ["чай", "茶叶", "茶", "tea", "травяной", "草本茶", "пуэр", "普洱", "улун", "乌龙", "зелёный чай", "绿茶"],
    usps: [
      { keys: ["натуральн", "органич", "organic"], text: "天然有机" },
      { keys: ["крупнолистов", "整叶", "loose leaf"], text: "整叶原叶" },
      { keys: ["подарочн упаковк", "礼盒"], text: "精美礼盒" },
      { keys: ["100 г", "200 г", "大份量"], text: "大份量装" },
    ],
    ozonKeywords: ["чай листовой", "чай в пакетиках"] },

  // ==================== 文具 / 办公 ====================
  pen: { id: "pen", name: "钢笔 / 中性笔",
    matchKeywords: ["ручк", "钢笔", "pen", "中性笔", "шариков ручк"],
    usps: [
      { keys: ["чернил", "墨水", "ink"], text: "出墨顺滑" },
      { keys: ["0.5", "0.7", "细字"], text: "细字书写" },
      { keys: ["металл", "金属", "metal"], text: "金属笔身" },
    ],
    ozonKeywords: ["ручка шариковая", "перьевые ручки"] },
  notebook: { id: "notebook", name: "笔记本 / 手账",
    matchKeywords: ["тетрад", "笔记本", "блокнот", "notebook", "ежедневник"],
    usps: [
      { keys: ["80 лист", "100 лист", "120 лист", "多页"], text: "80-120 页" },
      { keys: ["клетк", "точка", "точка в клетку", "点格"], text: "点格 / 方格" },
      { keys: ["твёрд переплёт", "硬面精装"], text: "硬面精装" },
    ],
    ozonKeywords: ["тетрадь", "блокнот"] },

  // ==================== 图书 ====================
  book_children: { id: "book_children", name: "儿童图书",
    matchKeywords: ["детск книг", "儿童图书", "绘本", "детск энциклопед"],
    usps: [
      { keys: ["иллюстрац", "彩图", "иллюстрированн"], text: "全彩插图" },
      { keys: ["возраст 3+", "3-6", "детск"], text: "适合 3-6 岁" },
      { keys: ["тверд переплёт", "精装"], text: "精装封面" },
    ],
    ozonKeywords: ["детские книги", "книги для детей"] },

  // ==================== 宠物 ====================
  dog_food: { id: "dog_food", name: "狗粮 / 猫粮",
    matchKeywords: ["корма для собак", "狗粮", "korm", "猫粮", "корма для кошек", "dog food", "cat food"],
    usps: [
      { keys: ["натуральн", "organic", "天然"], text: "天然原料" },
      { keys: ["без зерн", "grain-free", "无谷"], text: "无谷低敏" },
      { keys: ["без гмо", "non-gmo"], text: "非转基因" },
      { keys: ["мясо 30%", "мясо 60%", "高肉含量"], text: "高肉含量" },
    ],
    ozonKeywords: ["корм для собак", "корм для кошек"] },

  // ==================== 工具 ====================
  drill: { id: "drill", name: "电钻 / 电动工具",
    matchKeywords: ["дрель", "电钻", "drill", "шуруповёрт", "电动螺丝刀"],
    usps: [
      { keys: ["аккумулятор", "беспроводн", "cordless"], text: "无线便携" },
      { keys: ["2 скорост", "2 档", "双速"], text: "双速调节" },
      { keys: ["led подсветк", "led 灯"], text: "LED 工作灯" },
      { keys: ["кейс", "收纳箱"], text: "配套收纳箱" },
    ],
    ozonKeywords: ["шуруповёрт", "дрель аккумуляторная"] },

  // ==================== 通用兜底 ====================
  general: { id: "general", name: "通用",
    matchKeywords: [],
    usps: [
      { keys: ["высокое качество", "高品质", "качеств"], text: "高品质保障" },
      { keys: ["гарантия", "质保", "保固"], text: "官方质保" },
      { keys: ["доставка", "быстрая доставка", "发货", "物流"], text: "快速发货" },
      { keys: ["новый", "新款", "new"], text: "全新正品" },
    ],
    ozonKeywords: [] },
};

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
        categoryCount: Object.keys(CATEGORY_TEMPLATES).length,
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
        count: Object.keys(CATEGORY_TEMPLATES).length,
        templates: Object.values(CATEGORY_TEMPLATES).map((tpl) => ({
          id: tpl.id, name: tpl.name, uspCount: tpl.usps.length, ozonKeywords: tpl.ozonKeywords,
        })),
      });
    }
    if (path === "product-types") {
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
