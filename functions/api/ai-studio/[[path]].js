/* =========================================================
 *  AI 生图 / 文本工作室（AI Studio API）
 *  ---------------------------------------------------------
 *  独立模块，路由前缀 /api/ai-studio/*
 *  不修改 functions/api/listing/[[path]].js 与主 API，互不干扰。
 *
 *  路由：
 *    POST /api/ai-studio/generate-copy    分析参考图 + 产品信息，生成地道俄文标题/描述/20个标签（附中文翻译）
 *    POST /api/ai-studio/generate-images  生成一组 3:4 / 1200x1600px 的 Ozon 电商主图（9张：1封面+2展示+3卖点+1细节+1说明+1详情）
 *    GET  /api/ai-studio/health           健康检查
 *
 *  所需环境变量（与 listing API 复用，不重复造轮子）：
 *    OPENAI_API_KEY             OpenAI / 兼容网关的 API Key
 *    OPENAI_BASE_URL            可选，默认 https://api.openai.com/v1
 *    OPENAI_IMAGE_MODEL         可选，默认 gpt-image-1
 *    OPENAI_TEXT_MODEL          可选，默认 gpt-4o-mini
 *    OPENAI_VISION_MODEL        可选，默认 gpt-4o（识图用）
 * ========================================================= */

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const DEFAULT_TEXT_MODEL = "gpt-4o-mini";
const DEFAULT_VISION_MODEL = "gpt-4o";

// 9 张图的角色定义（与用户提示词里的"1封面+2展示+3卖点+1细节+1说明+1详情"一一对应）
const IMAGE_ROLES = [
  { key: "cover",    name: "封面主图",   desc: "抓眼球且突出产品主体，带符合应用场景的真实使用者" },
  { key: "display1", name: "展示图 1",   desc: "清晰展示产品全貌与典型使用场景" },
  { key: "display2", name: "展示图 2",   desc: "另一角度展示产品全貌与使用场景" },
  { key: "卖点1",    name: "卖点图 1",   desc: "聚焦第 1 个核心卖点（如容量/功率/续航）" },
  { key: "卖点2",    name: "卖点图 2",   desc: "聚焦第 2 个核心卖点（如接口/便携/安全）" },
  { key: "卖点3",    name: "卖点图 3",   desc: "聚焦第 3 个核心卖点（如附加功能/材质）" },
  { key: "detail",   name: "细节图",     desc: "聚焦材质、接口、做工等细节特写" },
  { key: "guide",    name: "使用说明图", desc: "简明图示使用方法 / 步骤" },
  { key: "specs",    name: "产品详情图", desc: "汇总核心参数的详情图" },
];

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

function openaiBaseUrl(env) {
  return String(env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE).replace(/\/$/, "");
}

// ---------- 第一步：识图（Vision） ----------
// 用多模态模型分析参考图，提取产品外观/功能/卖点/受众，供后续文案与生图复用。
async function analyzeProduct(env, body) {
  const referenceImages = Array.isArray(body?.referenceImages) ? body.referenceImages : [];
  const productName = String(body?.productName || "").trim();
  const extraInfo = String(body?.extraInfo || "").trim();   // 用户补充的卖点/参数文本
  const competitorUrl = String(body?.competitorUrl || "").trim();

  if (!referenceImages.length) {
    return { ok: false, error: "请至少上传 1 张产品参考图。" };
  }

  const visionModel = env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL;
  if (!env.OPENAI_API_KEY) {
    return { ok: false, error: "未配置 OPENAI_API_KEY，无法识图。请在 Cloudflare 环境变量配置。" };
  }

  const prompt = [
    "你是资深电商选品专家。请仔细分析图片中的产品，输出严格的 JSON，字段如下：",
    "- category：产品类目（中文，如"移动电源/充电宝"）",
    "- categoryRu：俄文类目名（地道表达）",
    "- appearance：外观描述（颜色/形状/材质/尺寸感，中文，50~120字）",
    "- features：核心功能/卖点数组（中文，6~10条，每条不超过25字）",
    "- featuresRu：对应的俄文卖点数组（与 features 一一对应，地道俄文）",
    "- audience：目标受众（中文，如"商务出差/学生/户外爱好者"）",
    "- scenario：典型使用场景（中文，2~3个）",
    "只输出 JSON，不要任何解释或前后缀。",
    productName ? `\n用户告知产品名：${productName}。` : "",
    extraInfo ? `\n用户补充信息：${extraInfo}` : "",
  ].filter(Boolean).join("\n");

  const content = [{ type: "text", text: prompt }];
  referenceImages.slice(0, 4).forEach((dataUrl) => {
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
      content.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
    }
  });

  try {
    const response = await fetch(`${openaiBaseUrl(env)}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: visionModel,
        messages: [{ role: "user", content }],
        temperature: 0.3,
        response_format: { type: "json_object" },
        max_tokens: 1400,
      }),
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = null; }
    if (!response.ok) {
      const errMsg = payload?.error?.message || text.slice(0, 240);
      return { ok: false, error: `识图失败（${visionModel}）：${errMsg}` };
    }
    let analysis = {};
    try { analysis = JSON.parse(payload?.choices?.[0]?.message?.content || "{}"); } catch { analysis = {}; }
    return { ok: true, analysis, model: visionModel };
  } catch (error) {
    return { ok: false, error: "识图异常：" + (error.message || String(error)) };
  }
}

// ---------- 第二步：生成俄文文案（标题/描述/20标签）+ 中文翻译 ----------
// 严格遵循用户的"俄罗斯本土电商文案专家 + Yandex SEO 优化师"角色提示词。
async function generateCopy(env, body) {
  if (!env.OPENAI_API_KEY) {
    return { ok: false, error: "未配置 OPENAI_API_KEY，无法生成文案。请在 Cloudflare 环境变量配置。" };
  }

  const analysis = body?.analysis || {};
  const productName = String(body?.productName || "").trim();
  const extraInfo = String(body?.extraInfo || "").trim();
  const platform = String(body?.platform || "Ozon").trim();
  const textModel = env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL;

  const prompt = [
    "请你扮演一位资深的俄罗斯本土电商文案专家和 Yandex SEO 优化师。",
    "下面会给你产品的识别结果与补充信息，请生成地道、高转化率的俄语电商商品详情文案。",
    "",
    "具体要求：",
    "1. 俄语标题（Название）：必须符合俄罗斯主流电商平台（Ozon / Wildberries / Yandex.Market）的搜索习惯。",
    "   使用本地消费者真实搜索的高频长尾词和核心词，结构紧凑，卖点前置。长度 60~110 字符。",
    "2. 俄语简介（Описание）：极具吸引力且专业。突出核心优势、使用场景和材质细节，",
    "   语言必须是纯正的俄语母语表达，带有强烈的购买引导（Call to Action），绝对避免机器翻译的生硬感。",
    "   分段清晰，可使用 Emoji 作为列表符号增强阅读体验。长度 600~1200 字符。",
    "3. 主题标签（Теги）：生成 20 个用于优化 SEO 的俄语标签，",
    "   必须包含大词、精准属性词和场景词，符合 Yandex 搜索词逻辑。以 # 开头，空格隔开。",
    "4. 排版与翻译：同时输出完整地道的中文翻译版本（标题/简介/20个标签）。",
    "",
    "严格按以下 JSON 结构输出，不要任何额外文字：",
    "{",
    '  "title_ru": "",',
    '  "description_ru": "",',
    '  "tags_ru": "#tag1 #tag2 ...",   // 20 个俄文标签',
    '  "title_zh": "",',
    '  "description_zh": "",',
    '  "tags_zh": "#标签1 #标签2 ..."   // 20 个中文标签',
    "}",
    "",
    "产品识别结果（JSON）：",
    JSON.stringify(analysis, null, 2),
    productName ? `\n用户告知产品名：${productName}` : "",
    extraInfo ? `\n用户补充信息（卖点/参数/材质等，请重点吸收）：${extraInfo}` : "",
    platform ? `\n目标平台：${platform}` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await fetch(`${openaiBaseUrl(env)}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: textModel,
        messages: [
          { role: "system", content: "你是俄罗斯本土电商文案专家与 Yandex SEO 优化师，只输出 JSON。" },
          { role: "user", content: prompt },
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
      return { ok: false, error: `文案生成失败（${textModel}）：${errMsg}` };
    }
    let copy = {};
    try { copy = JSON.parse(payload?.choices?.[0]?.message?.content || "{}"); } catch { copy = {}; }
    return {
      ok: true,
      title: copy.title_ru || "",
      description: copy.description_ru || "",
      tags: copy.tags_ru || "",
      titleZh: copy.title_zh || "",
      descriptionZh: copy.description_zh || "",
      tagsZh: copy.tags_zh || "",
    };
  } catch (error) {
    return { ok: false, error: "文案生成异常：" + (error.message || String(error)) };
  }
}

// ---------- 第三步：生成 9 张主图 ----------
// 把"识图结果 + 文案卖点"组装成符合用户提示词的生图 prompt，
// 逐张调用 images/generations，尺寸锁定 1024x1536（≈3:4，前端可再压到 1200x1600）。
async function generateImages(env, body) {
  if (!env.OPENAI_API_KEY) {
    return { ok: false, error: "未配置 OPENAI_API_KEY，无法调用生图模型。请在 Cloudflare 环境变量配置。" };
  }
  const analysis = body?.analysis || {};
  const copy = body?.copy || {};
  const referenceImages = Array.isArray(body?.referenceImages) ? body.referenceImages : [];
  const count = Math.min(Math.max(Number(body?.count) || 9, 1), IMAGE_ROLES.length);
  const productName = String(body?.productName || analysis?.category || "产品").trim();
  const imageModel = env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const baseUrl = openaiBaseUrl(env);

  // 组装统一风格描述（整套图色系一致）
  const styleBrief = [
    `产品：${productName}。`,
    analysis?.categoryRu ? `类目（俄）：${analysis.categoryRu}。` : "",
    analysis?.appearance ? `外观：${analysis.appearance}。` : "",
    (analysis?.featuresRu && analysis.featuresRu.length) ? `核心卖点（俄）：${analysis.featuresRu.slice(0, 6).join(" / ")}。` : "",
    copy?.title ? `俄文标题：${copy.title}。` : "",
    `整套 9 张图色调风格必须完全一致（统一主色 + 辅色 + 光感），商业级精修，Ozon/俄罗斯电商主图风格。`,
    `画面里出现的所有文案、标签、按钮、参数必须是地道俄文（кириллица），无错别字、无伪文字、无乱码。`,
    `严格保持产品外观、颜色、形状、比例与参考图一致，不得擅自改变产品工业设计或添加不存在的功能。`,
    `构图干净，白底或浅色生活化场景，主体居中突出，3:4 竖版构图。`,
  ].filter(Boolean).join("\n");

  const results = [];
  let lastError = "";
  for (let i = 0; i < count; i += 1) {
    const role = IMAGE_ROLES[i];
    const perPrompt = [
      styleBrief,
      "",
      `本张图角色：${role.name}。`,
      `要求：${role.desc}。`,
    ].join("\n");

    // 参考图只随封面图传入，避免每张都重复消耗 token，且保持整套风格由 prompt 统一控制
    const requestBody = {
      model: imageModel,
      prompt: perPrompt,
      n: 1,
      size: "1024x1536",
      quality: "high",
    };
    // gpt-image-1 支持多模态参考图；其他模型走纯 prompt
    if (i === 0 && referenceImages.length && imageModel === DEFAULT_IMAGE_MODEL) {
      requestBody.image = referenceImages.slice(0, 4).map((d) => d);
    }

    try {
      const response = await fetch(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify(requestBody),
      });
      const text = await response.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch { payload = null; }
      if (!response.ok) {
        const errMsg = payload?.error?.message || text.slice(0, 240);
        lastError = errMsg;
        results.push({ index: i + 1, role: role.key, role_name: role.name, ok: false, error: errMsg });
        continue;
      }
      const item = payload?.data?.[0] || {};
      const url = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : "");
      results.push({
        index: i + 1,
        role: role.key,
        role_name: role.name,
        ok: Boolean(url),
        url,
        revised_prompt: item.revised_prompt || "",
      });
    } catch (error) {
      lastError = error.message || String(error);
      results.push({ index: i + 1, role: role.key, role_name: role.name, ok: false, error: lastError });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  if (successCount === 0) {
    return {
      ok: false,
      error: `生图失败（0/${count}）：${lastError || `OpenAI 未返回图片，请检查 API Key、模型名（${imageModel}）与额度`}`,
      prompt: styleBrief,
      results,
    };
  }
  return { ok: true, prompt: styleBrief, count, results };
}

// ---------- 一键全流程：识图 → 文案 → 生图 ----------
// 前端"一键生成"按钮调用，串起三步，减少往返。
async function generateAll(env, body) {
  const analyzeResult = await analyzeProduct(env, body);
  if (!analyzeResult.ok) return analyzeResult;
  const analysis = analyzeResult.analysis;

  const copyResult = await generateCopy(env, { ...body, analysis });
  if (!copyResult.ok) return { ...copyResult, analysis };

  const imagesResult = await generateImages(env, { ...body, analysis, copy });
  return {
    ok: imagesResult.ok,
    analysis,
    copy: {
      title: copyResult.title,
      description: copyResult.description,
      tags: copyResult.tags,
      titleZh: copyResult.titleZh,
      descriptionZh: copyResult.descriptionZh,
      tagsZh: copyResult.tagsZh,
    },
    images: imagesResult,
    error: imagesResult.ok ? "" : imagesResult.error,
  };
}

// ---------- 入口 ----------
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === "OPTIONS") return json({}, 204);
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");

  try {
    if (path === "health") {
      return json({
        ok: true,
        service: "ai-studio-api",
        openaiConfigured: Boolean(env.OPENAI_API_KEY),
        openaiImageModel: env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
        openaiTextModel: env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
        openaiVisionModel: env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL,
        imageRoles: IMAGE_ROLES.map((r) => ({ key: r.key, name: r.name })),
      });
    }
    if (path === "analyze") {
      const body = await request.json().catch(() => ({}));
      return json(await analyzeProduct(env, body));
    }
    if (path === "generate-copy") {
      const body = await request.json().catch(() => ({}));
      return json(await generateCopy(env, body));
    }
    if (path === "generate-images") {
      const body = await request.json().catch(() => ({}));
      return json(await generateImages(env, body));
    }
    if (path === "generate-all") {
      const body = await request.json().catch(() => ({}));
      return json(await generateAll(env, body));
    }
    return json({ error: "Not found", path }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
}
