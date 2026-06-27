/* =========================================================
 *  上架发布模块（Listing Wizard）
 *  ---------------------------------------------------------
 *  独立自包含模块（与 sourcing.js 同构）：
 *    - 自带 localStorage key，不与 main.js 共用存储；
 *    - 自行注入导航按钮、页面 DOM、内联样式；
 *    - 自行绑定事件，不修改 main.js 任何逻辑；
 *  依赖：后端 /api/listing/* 代理（见 functions/api/listing/[[path]].js）。
 *
 *  四步向导：
 *    1) 选平台 → 抓类目 → 翻译成中文
 *    2) 选货盘 / 单个添加产品（图片、货号、价格、尺寸、品牌、型号、参数、卖点）
 *    3) GPT-Image 生成 9~10 张电商图 + 生成标题/描述/标签
 *    4) 调店铺 API 发布商品
 * ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "ozon_wb_listing_drafts_v1";
  const CAT_CACHE_KEY = "ozon_wb_listing_cat_cache_v1";
  const TEMPLATE_CACHE_KEY = "ozon_wb_listing_template_cache_v1";
  const TAB_ID = "listing";
  const TAB_LABEL = "🚀 商品上架";

  const API = (sub) => `/api/listing/${sub}`;
  let listingStores = [];

  // 当前选中的店铺不再暴露凭证,后端按 storeIndex 从环境变量读取。
  function currentStoreCreds() {
    return null;
  }
  function currentApiStoreIndex(uiIndex = draft.storeIndex) {
    const selected = listingStores[Number(uiIndex || 0)] || null;
    return Number(selected?.apiIndex ?? 0);
  }
  const normalizePlatform = (v) => (String(v || "").toLowerCase() === "wb" ? "WB" : "Ozon");
  // 构造请求头:不携带店铺密钥。
  function storeHeaders(extra = {}) {
    return { "content-type": "application/json", ...extra };
  }

  // ---- 局部工具（避免污染全局） ----
  const $ = (id) => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  const nowIso = () => new Date().toISOString().slice(0, 19);
  const escapeHtml = (v) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const escapeAttr = escapeHtml;
  const toNumber = (v) => {
    const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function readJsonResponse(response) {
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch {
      throw new Error(`接口返回非 JSON:${response.status} ${text.slice(0, 120)}`);
    }
    if (!response.ok) throw new Error(data.error || data.message || `API 请求失败:${response.status}`);
    return data;
  }

  const GUOO_RFBS_STANDARD = [
    { id: "extra-small-standard", name: "Extra Small 超级轻小件", method: "陆空联运", minRub: 1, maxRub: 1500, minKg: 0.001, maxKg: 0.5, maxSumCm: 90, maxSideCm: 60, rate: 36.4, ticket: 3.12, charge: "actual" },
    { id: "budget-standard", name: "Budget 低客单轻小件", method: "陆空联运", minRub: 1, maxRub: 1500, minKg: 0.501, maxKg: 30, maxSumCm: 150, maxSideCm: 60, rate: 26, ticket: 23.92, charge: "actual" },
    { id: "small-standard", name: "Small 高客单轻小件", method: "陆空联运", minRub: 1501, maxRub: 7000, minKg: 0.001, maxKg: 2, maxSumCm: 150, maxSideCm: 60, rate: 36.4, ticket: 16.64, charge: "actual" },
    { id: "big-standard", name: "Big 大件", method: "陆空联运", minRub: 1501, maxRub: 7000, minKg: 2.001, maxKg: 30, maxSumCm: 250, maxSideCm: 150, maxOtherSideCm: 50, rate: 26, ticket: 37.44, charge: "volume" },
    { id: "premium-small-standard", name: "Premium Small 高客单轻小件", method: "陆空联运", minRub: 7001, maxRub: 250000, minKg: 0.001, maxKg: 5, maxSumCm: 250, maxSideCm: 150, maxOtherSideCm: 80, rate: 36.4, ticket: 22.88, charge: "actual" },
    { id: "premium-big-standard", name: "Premium Big 高客单大件", method: "陆空联运", minRub: 7001, maxRub: 250000, minKg: 5.001, maxKg: 30, maxSumCm: 310, maxSideCm: 150, maxOtherSideCm: 80, rate: 29.12, ticket: 64.48, charge: "volume" },
  ];

  function guooDimensions() {
    const dims = [toNumber(draft.length), toNumber(draft.width), toNumber(draft.height)].map((mm) => mm / 10).filter((cm) => cm > 0);
    const sorted = [...dims].sort((a, b) => b - a);
    return { dims, longest: sorted[0] || 0, second: sorted[1] || 0, third: sorted[2] || 0, sum: dims.reduce((a, b) => a + b, 0) };
  }

  function guooSchemeFitsSize(scheme, kg, dim) {
    if (kg < scheme.minKg || kg > scheme.maxKg) return false;
    if (!dim.dims.length) return true;
    if (dim.sum > scheme.maxSumCm || dim.longest > scheme.maxSideCm) return false;
    if (scheme.maxOtherSideCm && (dim.second > scheme.maxOtherSideCm || dim.third > scheme.maxOtherSideCm)) return false;
    return true;
  }

  function guooFreightRmb(scheme, kg, dim) {
    const volumeKg = dim.dims.length === 3 ? (dim.dims[0] * dim.dims[1] * dim.dims[2]) / 12000 : kg;
    const chargeKg = scheme.charge === "volume" ? Math.max(kg, volumeKg) : kg;
    return { chargeKg, freight: scheme.rate * chargeKg + scheme.ticket };
  }

  function ozonAgentFeeRmb(priceRmb, exchangeRate) {
    const priceRub = priceRmb * exchangeRate;
    const rubFee = Math.min(200, Math.max(15, priceRub * 0.02));
    return rubFee / exchangeRate;
  }

  function evaluateGuooPrice(priceRmb, scheme, inputs) {
    const saleRub = priceRmb * inputs.exchangeRate;
    const freight = guooFreightRmb(scheme, inputs.kg, inputs.dim);
    const agentFee = ozonAgentFeeRmb(priceRmb, inputs.exchangeRate);
    const commission = priceRmb * inputs.commissionRate;
    const grossProfit = priceRmb - commission - inputs.purchaseCost - freight.freight - agentFee;
    const grossRate = priceRmb > 0 ? grossProfit / priceRmb : 0;
    return { saleRub, ...freight, agentFee, commission, grossProfit, grossRate };
  }

  function solvePriceForScheme(scheme, inputs) {
    if (!guooSchemeFitsSize(scheme, inputs.kg, inputs.dim)) return null;
    let low = Math.max(1, scheme.minRub / inputs.exchangeRate);
    let high = Math.max(low, Math.min(scheme.maxRub / inputs.exchangeRate, 250000 / inputs.exchangeRate));
    const okAt = (price) => {
      const e = evaluateGuooPrice(price, scheme, inputs);
      return e.saleRub >= scheme.minRub && e.saleRub <= scheme.maxRub && e.grossRate >= inputs.targetGrossRate;
    };
    if (!okAt(high)) return null;
    for (let i = 0; i < 48; i += 1) {
      const mid = (low + high) / 2;
      if (okAt(mid)) high = mid;
      else low = mid;
    }
    const minimumPriceRmb = high;
    const evalResult = evaluateGuooPrice(minimumPriceRmb, scheme, inputs);
    const recommendedPriceRmb = Math.ceil(minimumPriceRmb * 2 * 100) / 100;
    const recommendedEval = evaluateGuooPrice(recommendedPriceRmb, scheme, inputs);
    return {
      scheme,
      priceRmb: minimumPriceRmb,
      minimumPriceRmb,
      minimumPriceRub: Math.ceil(evalResult.saleRub),
      recommendedPriceRmb,
      recommendedPriceRub: Math.ceil(recommendedEval.saleRub),
      recommendedGrossRate: recommendedEval.grossRate,
      recommendedGrossProfit: recommendedEval.grossProfit,
      ...evalResult,
    };
  }

  function calculateGuooPricing() {
    readStep2Form();
    const inputs = {
      purchaseCost: toNumber(draft.purchaseCost),
      targetGrossRate: Math.max(0, toNumber(draft.targetGrossRate || 65) / 100),
      commissionRate: Math.max(0, toNumber(draft.commissionRate || 12) / 100),
      exchangeRate: toNumber(draft.exchangeRate || 11.5),
      kg: toNumber(draft.weight) / 1000,
      dim: guooDimensions(),
    };
    if (!inputs.purchaseCost || !inputs.kg || !inputs.exchangeRate) {
      return { ok: false, error: "请填写采购成本、重量和汇率。" };
    }
    if (inputs.targetGrossRate < 0.65) inputs.targetGrossRate = 0.65;
    const candidates = GUOO_RFBS_STANDARD.map((scheme) => solvePriceForScheme(scheme, inputs)).filter(Boolean);
    if (!candidates.length) return { ok: false, error: "未找到满足 GUOO realFBS 限制且毛利率≥65%的方案,请检查价格区间/重量/尺寸。" };
    candidates.sort((a, b) => a.minimumPriceRmb - b.minimumPriceRmb);
    const best = candidates[0];
    return { ok: true, ...best, targetGrossRate: inputs.targetGrossRate, exchangeRate: inputs.exchangeRate, purchaseCost: inputs.purchaseCost, kg: inputs.kg, dim: inputs.dim };
  }

  // ---- 草稿状态 ----
  const emptyDraft = () => ({
    id: uid(),
    updatedAt: nowIso(),
    step: 1,
    platform: "Ozon",
    storeIndex: 0,
    apiStoreIndex: 0,
    categoryId: "",
    categoryName: "",
    categoryNameZh: "",
    categoryFullPath: "",   // Ozon 可接受的完整类目名,如 日化/空气清新剂/空气清新剂
    typeId: 0,
    descriptionCategoryId: 0,
    source: "single", // single | tray
    // 单个产品
    code: "",
    brand: "",
    model: "",
    purchaseCost: "",
    sourceUrl1688: "",
    purchasePrice1688: "",
    purchaseShipping1688: "",
    targetGrossRate: "65",
    commissionRate: "12",
    exchangeRate: "11.5",
    price: "",
    oldPrice: "",
    pricingResult: null,
    weight: "",   // g
    length: "",   // mm
    width: "",
    height: "",
    params: "",
    paramRows: [
      { name: "材质", value: "" },
      { name: "规格/容量", value: "" },
      { name: "适用场景", value: "" },
      { name: "包装清单", value: "" },
    ],
    sellingPoints: "",
    images: [],   // dataURL 数组（参考图/单图）
    attrValues: {},   // 类目必填属性的值 { attrId: value }
    attrDefinitions: [],
    attrCategoryKey: "",
    variantsEnabled: false,
    variantDimensions: "",
    variants: [],
    // 第三步产出
    generatedImages: [],
    title: "",
    description: "",
    tags: "",
    // 发布
    publishResult: null,
    preflightResult: null,
    auditResult: null,
    productId: "",
    stockWarehouseId: "",
    stockQty: "20",
  });

  let draft = emptyDraft();
  let drafts = [];
  let selectedDrafts = new Set();   // 勾选的草稿 id 集合(批量删除用)
  try { drafts = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") || []; } catch { drafts = []; }

  const saveDraft = () => {
    draft.updatedAt = nowIso();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)); } catch (e) { console.warn("[listing] 保存失败", e); }
  };

  // ---- 样式注入（已迁移至 styles/main.css，此处保留空函数避免报错） ----
  function injectStyles() {
    // 样式由 main.css 统一管理（护眼浅色主题），此处不再内联注入深色样式
  }

  // ---- 导航 + 页面壳 ----
  function injectShell() {
    const nav = document.querySelector("aside nav");
    if (nav && !document.querySelector(`[data-tab="${TAB_ID}"]`)) {
      const btn = document.createElement("button");
      btn.className = "tab-btn";
      btn.dataset.tab = TAB_ID;
      btn.type = "button";
      btn.innerHTML = `<span>🚀</span>商品上架`;
      const settingsBtn = nav.querySelector('[data-tab="settings"]');
      if (settingsBtn) nav.insertBefore(btn, settingsBtn);
      else nav.appendChild(btn);
      btn.addEventListener("click", () => activateTab(TAB_ID));
    }

    const main = document.querySelector("main");
    if (main && !$(TAB_ID)) {
      const section = document.createElement("section");
      section.className = "tab";
      section.id = TAB_ID;
      section.innerHTML = buildShellHtml();
      main.appendChild(section);
    }
  }

  function buildShellHtml() {
    return `
      <section class="dashboard-brief">
        <div>
          <h2>商品上架</h2>
          <p>Ozon / WB 三步上架:① 选平台与类目 → ② 录产品信息 + 上传图片 + 填文案 → ③ 调店铺 API 发布。</p>
        </div>
        <span class="live-chip"><span></span>上架流水线</span>
      </section>

      <section class="panel">
        <div class="listing-steps">
          <div class="listing-step active" data-listing-step="1">
            <span class="num">1</span><span class="label">平台 & 类目<small>选择并搜索</small></span>
          </div>
          <div class="listing-step" data-listing-step="2">
            <span class="num">2</span><span class="label">产品信息 & 图文<small>图片 / 标题 / 描述</small></span>
          </div>
          <div class="listing-step" data-listing-step="3">
            <span class="num">3</span><span class="label">发布上架<small>店铺 API</small></span>
          </div>
        </div>
      </section>

      <section class="panel listing-step-pane active" data-listing-pane="1">
        <div class="toolbar">
          <h3>第一步 · 选择平台与类目</h3>
          <button class="secondary" type="button" id="lst_refreshCat" title="清空缓存并重新抓取">↻ 刷新类目</button>
        </div>
        <div class="cols-2">
          <label class="inline-select">平台
            <select id="lst_platform">
              <option value="Ozon">OZON</option>
              <option value="WB">WB</option>
            </select>
          </label>
          <label class="inline-select">店铺
            <select id="lst_storeIndex"></select>
          </label>
        </div>
        <div id="lst_catStatus" class="table-status">选择平台与店铺后会自动抓取类目(已缓存,类目一般不变,无需重复抓取)。</div>
        <div class="listing-cat-search">
          <input id="lst_catSearch" class="search" placeholder="搜索类目,如:运动 / U型枕头 / 空气清新剂" />
          <div id="lst_catSearchResult" class="listing-cat-search-result" hidden></div>
        </div>
        <div class="listing-cat-list" id="lst_catList"></div>
        <div class="actions">
          <button class="primary" type="button" id="lst_toStep2">下一步:产品信息 →</button>
        </div>
      </section>

      <section class="panel listing-step-pane" data-listing-pane="2">
        <div class="toolbar">
          <h3>第二步 · 产品信息、图片与文案</h3>
          <div class="segmented small" id="lst_sourceToggle">
            <button class="active" type="button" data-source="single">单个添加</button>
            <button type="button" data-source="tray">从货盘选</button>
          </div>
        </div>

        <div id="lst_attrsWrap" class="listing-attrs-wrap listing-attrs-primary">
          <div class="toolbar">
            <div>
              <h3>Ozon 类目属性</h3>
              <p class="section-note" id="lst_attrsCategory">这里才是真正的 Ozon 类目属性，会按第一步选择的末级类目从 KV 缓存读取。</p>
              <div class="table-status" id="lst_attrsStatus">选择末级类目后进入本步，会显示该类目的属性。</div>
            </div>
            <button class="primary" type="button" id="lst_autoFillAttrs">自动生成属性</button>
            <button class="secondary" type="button" id="lst_refreshAttrs">刷新该类目属性</button>
            <button class="secondary" type="button" id="lst_importTemplate">导入 Ozon 模板表格</button>
            <input id="lst_templateFile" type="file" accept=".xlsx,.xls" hidden />
          </div>
          <div id="lst_attrsList"></div>
        </div>

        <hr class="listing-divider" />

        <div data-source-pane="single">
          <section class="listing-import-box">
            <div class="toolbar">
              <div>
                <h3>1688 链接导入</h3>
                <p class="section-note">粘贴 1688 商品详情链接后，会自动填入基础信息、采购成本、图片，并只写入当前 Ozon 类目支持的属性。</p>
              </div>
              <button class="primary" type="button" id="lst_import1688">导入并匹配属性</button>
            </div>
            <div class="cols-2">
              <label>1688 商品链接<input id="lst_sourceUrl1688" type="url" placeholder="https://detail.1688.com/offer/xxxx.html" /></label>
              <div class="listing-import-cost" id="lst_1688Cost">商品价/运费会自动读取。</div>
            </div>
            <div class="table-status" id="lst_1688Status">先选择 Ozon 末级类目，再导入 1688 链接，属性匹配会更准确。</div>
          </section>
          <div class="cols-3">
            <label>货号<input id="lst_code" type="text" placeholder="例如 HS" /></label>
            <label>品牌<input id="lst_brand" type="text" placeholder="例如 Baseus" /></label>
            <label>型号名称<input id="lst_model" type="text" placeholder="例如 PPALL20000" /></label>
          </div>
          <div class="cols-3">
            <label>采购成本 RMB<input id="lst_purchaseCost" type="number" step="0.01" min="0" placeholder="例如 8" /></label>
            <label>目标毛利率 %<input id="lst_targetGrossRate" type="number" step="0.1" min="0" max="95" value="65" /></label>
            <label>平台佣金率 %<input id="lst_commissionRate" type="number" step="0.1" min="0" max="80" value="12" /></label>
          </div>
          <div class="cols-3">
            <label>汇率 RUB/CNY<input id="lst_exchangeRate" type="number" step="0.0001" min="1" value="11.5" /></label>
            <label style="display:flex;align-items:flex-end;">
              <button class="secondary" type="button" id="lst_calcPrice">按 GUOO 规则测算 RMB 定价</button>
            </label>
            <div class="listing-pricing-result" id="lst_pricingResult">填写采购成本、重量、尺寸后可测算售价。</div>
          </div>
          <div class="cols-3">
            <label>售价 RMB<input id="lst_price" type="number" step="0.01" min="0" placeholder="例如 39.90" /></label>
            <label>折扣前价格 RMB<input id="lst_oldPrice" type="number" step="0.01" min="0" placeholder="例如 59.90" /></label>
            <label>重量 g<input id="lst_weight" type="number" step="1" min="0" placeholder="例如 210" /></label>
          </div>
          <div class="cols-3">
            <label>长 mm<input id="lst_length" type="number" step="0.1" min="0" placeholder="68.5" /></label>
            <label>宽 mm<input id="lst_width" type="number" step="0.1" min="0" placeholder="68.5" /></label>
            <label>高 mm<input id="lst_height" type="number" step="0.1" min="0" placeholder="144" /></label>
          </div>
          <div class="cols-2">
            <label>通用参数备注<textarea id="lst_params" rows="3" placeholder="补充说明,如特殊规格、认证、注意事项等"></textarea></label>
            <label>核心卖点<textarea id="lst_sellingPoints" rows="3" placeholder="每行一个卖点,用于生成俄文文案和电商图"></textarea></label>
          </div>
          <section class="listing-param-box">
            <div class="toolbar">
              <div>
                <h3>结构化产品参数</h3>
                <p class="section-note">这里是商品基础参数,用于生成文案和自动补属性；下面的 Ozon 类目属性会按所选类目从 KV 缓存读取。</p>
              </div>
              <button class="secondary" type="button" id="lst_addParamRow">添加参数</button>
            </div>
            <div id="lst_paramRows" class="listing-param-rows"></div>
          </section>
        </div>

        <div data-source-pane="tray" hidden>
          <div class="notice">从货盘管理中选择一个产品,会自动带出品名/货号/采购价(售价需自行填写)。如未维护货盘,请先用「货盘管理」录入。</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>选择</th><th>品名/货号</th><th>供应商</th><th>规格</th><th>采购价</th><th>供货量</th></tr></thead>
              <tbody id="lst_trayRows"></tbody>
            </table>
          </div>
        </div>

        <hr class="listing-divider" />
        <section class="listing-variant-box">
          <div class="toolbar">
            <div>
              <h3>变体矩阵</h3>
              <p class="section-note">按颜色、尺码等维度生成多个 SKU。维度名会自动匹配 Ozon 对应属性。</p>
            </div>
            <label class="inline-check"><input id="lst_variantsEnabled" type="checkbox" /> 启用变体</label>
          </div>
          <label>变体维度<textarea id="lst_variantDimensions" rows="3" placeholder="每行一个维度,格式: 颜色: 黑色,白色&#10;尺码: S,M,L"></textarea></label>
          <div class="actions">
            <button class="secondary" type="button" id="lst_generateVariants">生成变体 SKU</button>
            <button class="secondary" type="button" id="lst_clearVariants">清空变体</button>
          </div>
          <div id="lst_variantTable" class="listing-variant-table"></div>
        </section>

        <hr class="listing-divider" />

        <label>商品图片(至少 1 张,建议 3:4 竖图,最多 15 张,第一张为首图)<input id="lst_images" type="file" accept="image/*" multiple /></label>
        <div class="listing-thumb-row" id="lst_thumbRow"></div>

        <label>产品标题(俄文)<textarea id="lst_title" rows="2" placeholder="Ozon 标题,建议 60~110 字符"></textarea></label>
        <label>产品描述(俄文)<textarea id="lst_description" rows="6" placeholder="产品描述,卖点分点列出"></textarea></label>
        <label>搜索标签(<strong>每行一个</strong>,每个标签 ≤ 30 字符,最多 20 个)<textarea id="lst_tags" rows="4" placeholder="每行输入一个标签,例如:&#10;массажер&#10;для шеи"></textarea></label>
        <div id="lst_tagHint" class="table-status">提示:Ozon 要求每个标签单独一行,单个标签不超过 30 个字符(含 #)。</div>
        <div class="actions">
          <button class="secondary" type="button" id="lst_generateCopy">AI 生成俄文文案</button>
          <button class="secondary" type="button" id="lst_generateImages">AI 生成 9 张商品图</button>
          <button class="secondary" type="button" id="lst_applyGenImages" hidden>将生成图加入商品图片</button>
        </div>
        <div id="lst_aiStatus" class="table-status">可先上传参考图,再生成俄文文案或商品图。</div>
        <div class="listing-gen-grid" id="lst_genGrid"></div>

        <div class="actions">
          <button class="secondary" type="button" id="lst_backTo1">← 上一步</button>
          <button class="primary" type="button" id="lst_toStep3">下一步:发布上架 →</button>
        </div>
      </section>

      <section class="panel listing-step-pane" data-listing-pane="3">
        <div class="toolbar">
          <h3>第三步 · 调店铺 API 发布</h3>
        </div>
        <div class="notice">将调用店铺 API(Ozon /v3/product/import 或 WB /content/v2/cards/upload)上传商品。请确认标题、描述、图片、价格无误后再发布。</div>
        <div class="cols-3">
          <label>目标店铺<select id="lst_pubStore"></select></label>
          <label>货号 / SKU<input id="lst_pubOfferId" type="text" /></label>
          <label style="display:flex;align-items:flex-end;">
            <button class="primary" type="button" id="lst_publish">立即发布</button>
          </label>
        </div>
        <div class="actions">
          <button class="secondary" type="button" id="lst_preflight">上传前自检</button>
          <button class="secondary" type="button" id="lst_pollStatus">轮询上架状态</button>
          <button class="secondary" type="button" id="lst_auditProduct">完整性检查</button>
          <button class="secondary" type="button" id="lst_loadWarehouses">加载仓库</button>
        </div>
        <div class="cols-3">
          <label>库存仓库<select id="lst_stockWarehouse"><option value="">先加载仓库</option></select></label>
          <label>库存数量<input id="lst_stockQty" type="number" min="0" step="1" value="20" /></label>
          <label style="display:flex;align-items:flex-end;">
            <button class="secondary" type="button" id="lst_setStock">设置库存</button>
          </label>
        </div>
        <div class="listing-flow-checks" id="lst_flowChecks"></div>
        <div class="listing-log" id="lst_log">就绪。</div>
        <div class="actions">
          <button class="secondary" type="button" id="lst_backTo3">← 上一步</button>
          <button class="secondary" type="button" id="lst_newDraft">保存草稿并新建</button>
        </div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h3>上架草稿</h3>
          <span class="status">本地保存,可继续编辑或删除。</span>
          <div class="listing-draft-tools" id="lst_draftTools" hidden>
            <label class="inline-check"><input type="checkbox" id="lst_draftSelectAll" /> 全选</label>
            <button class="secondary" type="button" id="lst_batchImport">批量导入</button>
            <input id="lst_batchFile" type="file" accept=".xlsx,.xls,.csv" hidden />
            <button class="primary" type="button" id="lst_batchPublish">批量发布选中</button>
            <button class="danger" type="button" id="lst_draftDelSelected">删除选中</button>
            <button class="secondary" type="button" id="lst_draftClearSel">取消选择</button>
          </div>
        </div>
        <div id="lst_draftList"></div>
      </section>
    `;
  }

  function activateTab(id) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    const btn = document.querySelector(`[data-tab="${id}"]`);
    const panel = $(id);
    if (btn) btn.classList.add("active");
    if (panel) panel.classList.add("active");
    const title = $("pageTitle");
    if (title && btn) title.textContent = btn.textContent.trim();
    renderAll();
    // 每次进入上架页都刷新店铺下拉,确保「店铺设置」新增的店铺立即可见
    refreshStores();
  }

  // ---- 步骤切换(三步流程) ----
  function goToStep(step) {
    draft.step = Math.min(Math.max(step, 1), 3);
    document.querySelectorAll("[data-listing-step]").forEach((el) => {
      const n = Number(el.dataset.listingStep);
      el.classList.toggle("active", n === draft.step);
      el.classList.toggle("done", n < draft.step);
    });
    document.querySelectorAll("[data-listing-pane]").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.listingPane) === draft.step);
    });
    if (draft.step === 2) {
      renderTrayRows();
      loadCategoryAttributes();
    }
    if (draft.step === 3) {
      $("lst_pubStore") && ($("lst_pubStore").value = String(draft.storeIndex));
      $("lst_pubOfferId") && ($("lst_pubOfferId").value = draft.code || draft.offerId || "");
      $("lst_stockQty") && ($("lst_stockQty").value = draft.stockQty || "20");
      renderFlowChecks();
    }
  }

  // ---- 日志 ----
  function log(msg) {
    const box = $("lst_log");
    if (!box) return;
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    box.textContent = box.textContent ? box.textContent + "\n" + line : line;
    box.scrollTop = box.scrollHeight;
  }

  // ---- 读取货盘(localStorage 跨脚本读取,只读) ----
  function readTray() {
    try { return JSON.parse(localStorage.getItem("ozon_wb_sourcing_v1") || "[]") || []; } catch { return []; }
  }

  // ---- 渲染:平台/店铺下拉(只显示 Cloudflare 环境变量/Secrets 中的店铺) ----
  async function refreshStores() {
    const platform = draft.platform;
    let envStores = [];
    try {
      const res = await fetch(API("stores"));
      const data = await readJsonResponse(res);
      envStores = (data.stores || [])
        .filter((store) => normalizePlatform(store.platform) === platform)
        .map((store) => ({
          source: "env",
          apiIndex: Number(store.index || 0),
          platform: normalizePlatform(store.platform),
          name: store.name || `${platform} 环境变量店铺`,
          raw: store,
        }));
    } catch (e) {
      console.warn("[listing] 后端店铺加载失败", e);
    }
    listingStores = envStores;
    const options = listingStores.length
      ? listingStores.map((s, i) => `<option value="${i}">${escapeHtml(s.name)}（云端）</option>`).join("")
      : `<option value="0">(未配置${platform}云端店铺,请到 Cloudflare 环境变量添加)</option>`;
    const sel = $("lst_storeIndex");
    const pubSel = $("lst_pubStore");
    const selectedIndex = Math.min(Number(draft.storeIndex || 0), Math.max(listingStores.length - 1, 0));
    draft.storeIndex = selectedIndex;
    if (sel) { sel.innerHTML = options; sel.value = String(selectedIndex); }
    if (pubSel) { pubSel.innerHTML = options; pubSel.value = String(selectedIndex); }
    // 店铺变化后,触发类目自动抓取(如果该平台类目未缓存)
    autoLoadCategories();
  }

  // ---- 渲染:类目列表 ----
  // ---- 类目缓存 + 自动抓取 ----
  // 缓存结构: { "Ozon": { ts, storeKey, tree }, "WB": {...} }
  // tree 是带 children 的多级树(用于级联展示)
  let categoryCache = [];
  let categoryTree = [];          // 当前平台的多级树
  let cascadeState = { l1: "", l2: "", l3: "", l4: "" }; // 级联选中状态
  let catLoading = false;

  function loadCatCacheAll() {
    try { return JSON.parse(localStorage.getItem(CAT_CACHE_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function saveCatCacheAll(obj) {
    try { localStorage.setItem(CAT_CACHE_KEY, JSON.stringify(obj)); } catch (e) { console.warn(e); }
  }
  function currentStoreKey() {
    const selected = listingStores[Number(draft.storeIndex || 0)] || null;
    if (selected) return `${selected.platform}|${selected.source}|${selected.apiIndex}|${selected.raw?.clientId || selected.name || ""}`;
    return draft.platform;
  }

  // 用后端返回的 parentId(真实 ID)重建层级树。
  // 不用 fullName 的 "/" 分列——因为类目名本身可能含 "/"(如"健身器材/训练器"
  // 是一个二级类目),分列会把它错误拆成两级,丢失真正的下游类目。
  // fullName 仅用于显示和 Ozon 发布时的完整路径。
  function buildTree(flat) {
    const map = new Map();
    const roots = [];
    // 第一遍:建节点索引
    flat.forEach((item) => {
      if (!item.id) return;
      map.set(item.id, {
        id: item.id,
        name: item.nameZh || item.name,
        level: 0,
        leaf: makeLeaf(item),
        children: [],
        _raw: item,
      });
    });
    // 第二遍:按 parentId 串层级
    flat.forEach((item) => {
      if (!item.id) return;
      const node = map.get(item.id);
      const parent = map.get(item.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    });
    // 标注层级深度(根=1)
    const markLevel = (nodes, depth) => {
      nodes.forEach((n) => { n.level = depth; markLevel(n.children, depth + 1); });
    };
    markLevel(roots, 1);
    return roots;
  }

  // 收集叶子信息:保留发布所需的 categoryId/typeId,以及完整路径
  function makeLeaf(item) {
    return {
      categoryId: Number(item.categoryId || 0),
      typeId: Number(item.typeId || 0),
      fullPath: String(item.fullName || item.nameZh || item.name || ""),
      origId: item.id,
    };
  }

  // 类目缓存版本:数据结构变更后递增,旧缓存自动失效重抓
  const CAT_CACHE_VERSION = 5;

  // 自动抓取:进入第一步 / 切换平台 / 切换店铺 时触发,带缓存
  async function autoLoadCategories() {
    const platform = draft.platform;
    if (!platform) return;
    if (catLoading) return;
    const cache = loadCatCacheAll();
    const storeKey = currentStoreKey();
    const cached = cache[platform];
    // 命中缓存优先同步渲染(版本一致即可,storeKey 不一致也先用着,避免首次进页面白屏)
    if (cached && cached.flat && cached.v === CAT_CACHE_VERSION) {
      categoryCache = cached.flat;
      categoryTree = buildTree(categoryCache);
      cascadeState = { l1: "", l2: "", l3: "", l4: "" };
      renderCascade();
      const status = $("lst_catStatus");
      if (status) status.textContent = `已加载缓存的 ${platform} 类目(共 ${cached.flat.length} 项,来自「${cached.storeName || "本地缓存"}」)。`;
      // 若店铺不一致,后台静默刷新(不阻塞界面)
      if (cached.storeKey !== storeKey) {
        fetchCategories(true);
      }
      return;
    }
    await fetchCategories();
  }

  async function fetchCategories() {
    const status = $("lst_catStatus");
    const platform = draft.platform;
    const storeIndex = currentApiStoreIndex();
    if (status) status.textContent = `正在从 ${platform} 抓取类目并翻译为中文…`;
    catLoading = true;
    try {
      const res = await fetch(
        API(`categories?platform=${encodeURIComponent(platform)}&storeIndex=${storeIndex}`),
        { headers: storeHeaders() }
      );
      const data = await readJsonResponse(res);
      if (!data.ok) throw new Error(data.error || "抓取失败");
      categoryCache = data.categories || [];
      categoryTree = buildTree(categoryCache);
      cascadeState = { l1: "", l2: "", l3: "", l4: "" };
      // 写入缓存(只存扁平数据,节省 localStorage 空间)
      const cache = loadCatCacheAll();
      cache[platform] = { v: CAT_CACHE_VERSION, ts: Date.now(), storeKey: currentStoreKey(), storeName: data.storeName || "", flat: categoryCache };
      saveCatCacheAll(cache);
      renderCascade();
      const depthInfo = data.maxDepth ? `,类目最大 ${data.maxDepth} 级` : "";
      const srcInfo = data.source === "cloud-kv" ? "(云端缓存) " : "";
      if (status) status.textContent = `${srcInfo}已加载 ${categoryCache.length} 个 ${platform} 类目(来源:${data.storeName || "-"})${depthInfo}。`;
    } catch (e) {
      categoryCache = [];
      categoryTree = [];
      renderCascade();
      if (status) status.textContent = "抓取失败:" + (e.message || e);
    } finally {
      catLoading = false;
    }
  }

  // ---- 渲染:三级级联类目选择器 ----
  function renderCascade() {
    const box = $("lst_catList");
    if (!box) return;
    if (catLoading) {
      box.innerHTML = `<div class="listing-cascade-empty">正在加载类目…</div>`;
      return;
    }
    if (!categoryTree.length) {
      box.innerHTML = `<div class="listing-cascade-empty">暂无类目。请确认已在「店铺设置」添加对应平台的店铺。</div>`;
      return;
    }
    const l1Nodes = categoryTree;
    const l1Sel = l1Nodes.find((n) => n.id === cascadeState.l1);
    const l2Nodes = (l1Sel && l1Sel.children) || [];
    const l2Sel = l2Nodes.find((n) => n.id === cascadeState.l2);
    const l3Nodes = (l2Sel && l2Sel.children) || [];
    const l3Sel = l3Nodes.find((n) => n.id === cascadeState.l3);
    const l4Nodes = (l3Sel && l3Sel.children) || [];

    const renderItem = (n, level, selectedId) => {
      const isSel = n.id === selectedId;
      const hasChild = n.children && n.children.length;
      const isTerminal = !hasChild;   // 无子节点 = 末级(可选定上架)
      const leaf = isTerminal ? `<span class="leaf-tag">可上架</span>` : "";
      const arrow = hasChild ? `<span class="arrow">▸</span>` : "";
      return `<div class="listing-cascade-item ${isSel ? "selected" : ""} ${hasChild ? "has-child" : ""}" data-cascade-level="${level}" data-cascade-id="${escapeAttr(n.id)}">
        <span class="name">${escapeHtml(n.name)}</span>
        ${leaf}${arrow}
      </div>`;
    };
    const colHtml = (nodes, level, selectedId, title) => {
      const items = nodes.map((n) => renderItem(n, level, selectedId)).join("");
      return `<div class="listing-cascade-col">
        <div class="listing-cascade-col-title">${title}</div>
        <div class="listing-cascade-col-body">${items}</div>
      </div>`;
    };

    // 按需拼接列:逐级展开,有子节点且已选 → 出现下一级列(支持任意深度)
    const levelNames = ["一级类目", "二级类目", "三级类目", "四级类目", "五级类目"];
    const cols = [colHtml(l1Nodes, 1, cascadeState.l1, levelNames[0])];
    const layers = [
      [l1Sel, l2Nodes, 2, cascadeState.l2],
      [l2Sel, l3Nodes, 3, cascadeState.l3],
      [l3Sel, l4Nodes, 4, cascadeState.l4],
    ];
    layers.forEach(([sel, nodes, level, selectedId]) => {
      if (sel && nodes && nodes.length) {
        cols.push(colHtml(nodes, level, selectedId, levelNames[level - 1] || `${level}级类目`));
      }
    });

    box.innerHTML = `
      <div class="listing-cascade">${cols.join("")}</div>
      <div class="listing-cascade-breadcrumb">${renderBreadcrumb()}</div>
    `;
  }

  function renderBreadcrumb() {
    const path = [];
    const l1 = categoryTree.find((n) => n.id === cascadeState.l1);
    if (l1) path.push(l1.name);
    if (l1) {
      const l2 = (l1.children || []).find((n) => n.id === cascadeState.l2);
      if (l2) path.push(l2.name);
      if (l2) {
        const l3 = (l2.children || []).find((n) => n.id === cascadeState.l3);
        if (l3) path.push(l3.name);
        if (l3) {
          const l4 = (l3.children || []).find((n) => n.id === cascadeState.l4);
          if (l4) path.push(l4.name);
        }
      }
    }
    if (!path.length) return `<span class="muted-cell">尚未选择类目(逐级选择到末级即可上架)</span>`;
    return `已选类目:<strong>${path.map(escapeHtml).join(" / ")}</strong>`;
  }

  // 处理级联点击:有子类目则下钻;无子类目(末级)→ 确认为最终上架类目
  function onCascadeClick(level, id) {
    const findIn = (nodes, fid) => {
      for (const n of nodes) { if (n.id === fid) return n; if (n.children) { const f = findIn(n.children, fid); if (f) return f; } }
      return null;
    };
    const node = findIn(categoryTree, id);
    if (!node) return;
    const hasChild = node.children && node.children.length;
    // 逐级设置选中,并清空更深层级
    if (level === 1) { cascadeState.l1 = id; cascadeState.l2 = ""; cascadeState.l3 = ""; cascadeState.l4 = ""; }
    else if (level === 2) { cascadeState.l2 = id; cascadeState.l3 = ""; cascadeState.l4 = ""; }
    else if (level === 3) { cascadeState.l3 = id; cascadeState.l4 = ""; }
    else { cascadeState.l4 = id; }

    if (!hasChild) {
      // 末级 → 确认为最终上架类目,保留 Ozon 发布所需的完整路径与 id
      const leaf = node.leaf || {};
      const oldKey = attrCategoryKey();
      draft.categoryId = leaf.origId || node.id;
      draft.categoryName = node.name;
      draft.categoryNameZh = node.name;
      draft.categoryFullPath = leaf.fullPath || node.name;   // Ozon 可接受的完整类目名,如 日化/空气清新剂/空气清新剂
      draft.typeId = leaf.typeId || 0;
      draft.descriptionCategoryId = leaf.categoryId || 0;
      if (oldKey !== attrCategoryKey()) resetAttrsForCurrentCategory();
    } else {
      draft.categoryId = "";   // 中间节点不能上架,清空
      draft.categoryFullPath = "";
      draft.typeId = 0;
      draft.descriptionCategoryId = 0;
      resetAttrsForCurrentCategory();
    }
    persistDraft();
    renderCascade();
  }

  // 校验类目是否已选到末级(叶子节点)。
  // 不信任 draft 对象(可能残留旧数据),实时从级联状态 + 类目树验证。
  function isCategoryFullySelected() {
    if (!categoryTree || !categoryTree.length) {
      alert("类目尚未加载完成,请稍候或点击「刷新类目」。");
      return false;
    }
    // 找出用户当前选中的最深节点
    const findIn = (nodes, fid) => {
      for (const n of nodes) { if (n.id === fid) return n; if (n.children) { const f = findIn(n.children, fid); if (f) return f; } }
      return null;
    };
    const selId = cascadeState.l4 || cascadeState.l3 || cascadeState.l2 || cascadeState.l1;
    if (!selId) {
      alert("请先选择类目:逐级点击到最末级(带「可上架」标签的才是最终类目),再进入下一步。");
      return false;
    }
    const node = findIn(categoryTree, selId);
    if (!node) {
      alert("选中的类目无效,请重新选择。");
      return false;
    }
    // 必须是叶子(无子节点)才能上架
    if (node.children && node.children.length) {
      alert(`当前选的是「${node.name}」,它还有下级类目。\n请继续点击展开,选到带「可上架」标签的最末级再进下一步。`);
      return false;
    }
    // 叶子必须有完整的发布信息
    const leaf = node.leaf || {};
    if (!leaf.fullPath) {
      alert("该类目缺少完整路径信息,请重新选择。");
      return false;
    }
    // 同步回 draft,确保发布数据准确
    const oldKey = attrCategoryKey();
    draft.categoryId = leaf.origId || node.id;
    draft.categoryName = node.name;
    draft.categoryNameZh = node.name;
    draft.categoryFullPath = leaf.fullPath;
    draft.typeId = leaf.typeId || 0;
    draft.descriptionCategoryId = leaf.categoryId || 0;
    if (oldKey !== attrCategoryKey()) resetAttrsForCurrentCategory();
    return true;
  }

  // 加载类目的必填属性并渲染表单(进入第二步时触发)
  let currentAttributes = [];   // 当前类目的属性列表
  let attrValues = {};          // 用户填的属性值 { attrId: value }
  function attrCategoryKey(categoryId = draft.descriptionCategoryId, typeId = draft.typeId) {
    return categoryId && typeId ? `${categoryId}:${typeId}` : "";
  }
  function applyCategoryAttributes(attributes, sourceLabel) {
    const previousKey = draft.attrCategoryKey || "";
    const key = attrCategoryKey();
    currentAttributes = Array.isArray(attributes) ? attributes : [];
    draft.attrDefinitions = currentAttributes;
    draft.attrCategoryKey = key;
    attrValues = previousKey === key ? { ...(draft.attrValues || {}) } : {};
    draft.attrValues = attrValues;
    renderAttrForm();
    const reqCount = currentAttributes.filter((a) => a.isRequired).length;
    const status = $("lst_attrsStatus");
    if (status) status.textContent = `${sourceLabel}:该类目共 ${currentAttributes.length} 个属性(其中 ${reqCount} 个必填)。`;
    autoFillAttributes({ silent: true, onlyEmpty: true });
  }
  function resetAttrsForCurrentCategory() {
    currentAttributes = [];
    attrValues = {};
    draft.attrValues = {};
    draft.attrDefinitions = [];
    draft.attrCategoryKey = attrCategoryKey();
  }
  function loadTemplateCache() {
    try { return JSON.parse(localStorage.getItem(TEMPLATE_CACHE_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function saveTemplateCache(cache) {
    try { localStorage.setItem(TEMPLATE_CACHE_KEY, JSON.stringify(cache)); } catch {}
  }
  function templateCacheKeys(template = {}) {
    const keys = [];
    const name = String(template.name || "").trim();
    if (name) keys.push(`name:${name}`);
    if (template.categoryId && template.typeId) keys.push(`cat:${template.categoryId}:${template.typeId}`);
    return keys;
  }
  function rememberTemplate(template) {
    const cache = loadTemplateCache();
    templateCacheKeys(template).forEach((key) => { cache[key] = template; });
    saveTemplateCache(cache);
  }
  function findCachedTemplateForDraft() {
    const cache = loadTemplateCache();
    const exactKey = draft.descriptionCategoryId && draft.typeId ? `cat:${draft.descriptionCategoryId}:${draft.typeId}` : "";
    if (exactKey && cache[exactKey]) return cache[exactKey];
    return null;
  }
  function decodeBase64Utf8(value) {
    const bin = atob(value);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }
  function orderedLookupValues(attr) {
    const lookup = attr.LookupData || {};
    const values = lookup.Values || {};
    const ordered = Array.isArray(lookup.OrderedValueIDs) ? lookup.OrderedValueIDs : Object.keys(values);
    return ordered.map((id) => values[String(id)] || values[id]).filter(Boolean).map((v) => ({
      id: Number(v.ID || v.id || 0),
      value: String(v.Value || v.value || ""),
    })).filter((v) => v.value);
  }
  function normalizeTemplateAttribute(attr) {
    const values = orderedLookupValues(attr);
    return {
      id: Number(attr.ID || attr.id || 0),
      name: String(attr.Name || attr.name || ""),
      description: String(attr.Label?.Value || attr.description || ""),
      isRequired: Boolean(attr.IsRequired || attr.isRequired),
      type: String(attr.Type || attr.type || "String"),
      isCollection: Boolean(attr.IsCollection || attr.isCollection),
      maxValueCount: Number(attr.MaxValueCount || attr.maxValueCount || 0),
      complexId: Number(attr.ComplexID || attr.complexId || 0),
      complexName: String(attr.ComplexName || attr.complexName || ""),
      dictionary: values.length ? 1 : 0,
      values,
      source: "xlsx-template",
    };
  }
  async function parseOzonTemplateFile(file) {
    if (!window.XLSX) throw new Error("页面未加载 XLSX 解析库");
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets.configs;
    if (!ws) throw new Error("模板中没有 configs sheet");
    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    const row = rows.find((r) => r[0] === "XLS_TEMPLATE_INFO_BASE64");
    if (!row) throw new Error("没有找到 XLS_TEMPLATE_INFO_BASE64");
    const raw = decodeBase64Utf8(row.slice(1).filter(Boolean).join(""));
    const info = JSON.parse(raw);
    const attributes = Object.values(info.attributes || {})
      .map(normalizeTemplateAttribute)
      .filter((a) => a.id && a.name);
    return {
      name: String(info.name || file.name.replace(/\.(xlsx|xls)$/i, "")),
      categoryId: draft.descriptionCategoryId || 0,
      typeId: draft.typeId || 0,
      platform: draft.platform || "Ozon",
      importedAt: nowIso(),
      fileName: file.name,
      attributes,
      complexGroups: info.complex_list || {},
    };
  }
  async function pushTemplateToKv(template) {
    try {
      const res = await fetch(API("template-cache"), {
        method: "POST",
        headers: storeHeaders(),
        body: JSON.stringify({ template }),
      });
      return await readJsonResponse(res);
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }
  function applyTemplateAttributes(template, source = "模板") {
    currentAttributes = Array.isArray(template?.attributes) ? template.attributes : [];
    draft.attrDefinitions = currentAttributes;
    draft.attrCategoryKey = attrCategoryKey(template?.categoryId || draft.descriptionCategoryId, template?.typeId || draft.typeId);
    attrValues = { ...(draft.attrValues || {}) };
    renderAttrForm();
    const reqCount = currentAttributes.filter((a) => a.isRequired).length;
    const status = $("lst_attrsStatus");
    if (status) status.textContent = `${source}:「${template.name || "未命名模板"}」共 ${currentAttributes.length} 个字段(其中 ${reqCount} 个必填)。`;
  }
  async function loadCategoryAttributes(force = false) {
    const box = $("lst_attrsList");
    const status = $("lst_attrsStatus");
    const key = attrCategoryKey();
    if (!draft.descriptionCategoryId || !draft.typeId) {
      const cachedTemplate = findCachedTemplateForDraft();
      if (cachedTemplate) {
        applyTemplateAttributes(cachedTemplate, "本地模板缓存");
        return;
      }
      currentAttributes = [];
      attrValues = {};
      draft.attrDefinitions = [];
      draft.attrValues = {};
      draft.attrCategoryKey = "";
      if (box) box.innerHTML = `<div class="table-status">还没有选择 Ozon 末级类目。请回第一步选择带「可上架」标签的末级类目，进入第二步后这里会直接加载可填写属性。</div>`;
      if (status) status.textContent = "未选择末级类目。";
      return;
    }
    if (draft.attrCategoryKey && draft.attrCategoryKey !== key) {
      resetAttrsForCurrentCategory();
    }
    if (status) status.textContent = force ? "正在刷新云端 KV 属性缓存…" : "正在读取云端 KV 属性缓存…";
    try {
      const res = await fetch(API(`category-attributes?platform=${encodeURIComponent(draft.platform)}&storeIndex=${currentApiStoreIndex()}&categoryId=${draft.descriptionCategoryId}&typeId=${draft.typeId}${force ? "&force=1" : ""}`), {
        headers: storeHeaders(),
      });
      const data = await readJsonResponse(res);
      if (!data.ok) throw new Error(data.error || "加载属性失败");
      const label = data.source === "kv-cache" ? "云端 KV 缓存" : (data.source === "fresh" ? "首次获取并写入 KV" : "属性缓存");
      applyCategoryAttributes(data.attributes || [], label);
    } catch (e) {
      const cachedTemplate = findCachedTemplateForDraft();
      if (cachedTemplate) {
        applyTemplateAttributes(cachedTemplate, "属性接口失败,已使用本地模板缓存");
      } else {
        if (status) status.textContent = "属性加载失败:" + (e.message || e);
        if (box) box.innerHTML = "";
      }
    }
  }

  // 渲染属性表单(必填优先,折叠可选)
  function renderAttrForm() {
    const box = $("lst_attrsList");
    if (!box) return;
    const cat = $("lst_attrsCategory");
    if (cat) {
      cat.textContent = draft.categoryFullPath
        ? `当前类目:${draft.categoryFullPath}。这里才是真正的 Ozon 类目属性，会从 KV 缓存读取。`
        : "这里才是真正的 Ozon 类目属性，会按第一步选择的末级类目从 KV 缓存读取。";
    }
    if (!currentAttributes.length) { box.innerHTML = `<div class="table-status">该类目暂无必填属性。</div>`; return; }
    // 必填在前,可选在后
    const sorted = [...currentAttributes].sort((a, b) => Number(b.isRequired) - Number(a.isRequired));
    box.innerHTML = sorted.map((a) => {
      const rawVal = attrValues[a.id];
      const vals = Array.isArray(rawVal) ? rawVal.map(String) : String(rawVal || "").split(";").map((v) => v.trim()).filter(Boolean);
      const val = escapeAttr(Array.isArray(rawVal) ? vals.join(";") : (rawVal || ""));
      const star = a.isRequired ? `<span style="color:#dc2626">*</span>` : "";
      const isDict = a.dictionary || (a.values && a.values.length);
      const type = String(a.type || "").toLowerCase();
      const values = a.values || [];
      const filter = isDict && values.length > 12
        ? `<input class="listing-attr-filter" type="search" data-attr-filter="${a.id}" placeholder="搜索选项" />`
        : "";
      const field = isDict
        ? `${filter}<select data-attr-id="${a.id}" ${a.isCollection ? `multiple size="${Math.min(Math.max(values.length, 3), 6)}"` : ""}>
            ${a.isCollection ? "" : `<option value="">请选择</option>`}
            ${values.map((v) => {
              const selected = vals.includes(String(v.value)) || vals.includes(String(v.id));
              return `<option value="${escapeAttr(v.value)}" ${selected ? "selected" : ""}>${escapeHtml(v.value)}</option>`;
            }).join("")}
          </select>`
        : type === "boolean"
          ? `<select data-attr-id="${a.id}"><option value="">请选择</option><option value="true" ${String(rawVal) === "true" ? "selected" : ""}>是</option><option value="false" ${String(rawVal) === "false" ? "selected" : ""}>否</option></select>`
          : type === "multiline"
            ? `<textarea data-attr-id="${a.id}" rows="3" placeholder="${escapeAttr(a.description || a.name)}">${val}</textarea>`
            : `<input type="${type === "integer" || type === "decimal" ? "number" : "text"}" data-attr-id="${a.id}" value="${val}" placeholder="${escapeAttr(a.description || a.name)}" />`;
      const meta = [
        a.isCollection ? `可多选${a.maxValueCount ? `,最多 ${a.maxValueCount} 个` : ""}` : "",
        a.complexName ? `分组:${a.complexName}` : "",
      ].filter(Boolean).join(" · ");
      return `<label class="listing-attr-row ${a.isRequired ? "is-required" : ""}">
        <span class="listing-attr-name">${star} ${escapeHtml(a.name)}${meta ? `<small class="muted"> ${escapeHtml(meta)}</small>` : ""}</span>
        ${field}
      </label>`;
    }).join("");
    // 绑定输入事件,实时保存值
    box.querySelectorAll("[data-attr-id]").forEach((el) => {
      el.addEventListener("input", () => {
        attrValues[el.getAttribute("data-attr-id")] = el.multiple ? [...el.selectedOptions].map((o) => o.value) : el.value;
        draft.attrValues = attrValues;
        persistDraft();
      });
      el.addEventListener("change", () => {
        attrValues[el.getAttribute("data-attr-id")] = el.multiple ? [...el.selectedOptions].map((o) => o.value) : el.value;
        draft.attrValues = attrValues;
        persistDraft();
      });
    });
    box.querySelectorAll("[data-attr-filter]").forEach((input) => {
      input.addEventListener("input", () => {
        const id = input.getAttribute("data-attr-filter");
        const select = box.querySelector(`select[data-attr-id="${CSS.escape(id)}"]`);
        const attr = currentAttributes.find((item) => String(item.id) === String(id));
        if (!select || !attr) return;
        const selected = new Set([...select.selectedOptions].map((o) => o.value));
        const kw = input.value.trim().toLowerCase();
        const values = (attr.values || []).filter((v) => !kw || String(v.value).toLowerCase().includes(kw)).slice(0, 200);
        select.innerHTML = `${attr.isCollection ? "" : `<option value="">请选择</option>`}${values.map((v) => `<option value="${escapeAttr(v.value)}" ${selected.has(String(v.value)) ? "selected" : ""}>${escapeHtml(v.value)}</option>`).join("")}`;
      });
    });
  }

  // 校验必填属性是否都填了
  function validateRequiredAttrs() {
    const missing = currentAttributes.filter((a) => {
      const v = attrValues[a.id];
      return a.isRequired && (Array.isArray(v) ? !v.length : !String(v || "").trim());
    });
    if (missing.length) {
      const names = missing.map((a) => a.name).join("、");
      alert(`以下必填属性未填写:${names}`);
      return false;
    }
    return true;
  }

  function normalizeAttrText(value) {
    return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  }

  function productFactMap() {
    readStep2Form();
    const facts = new Map();
    const put = (keys, value) => {
      if (!String(value || "").trim()) return;
      keys.forEach((key) => facts.set(normalizeAttrText(key), String(value).trim()));
    };
    put(["бренд", "brand", "品牌"], draft.brand);
    put(["модель", "model", "型号", "型号名称"], draft.model || draft.code);
    put(["артикул", "sku", "offer", "货号"], draft.code);
    put(["название", "title", "名称", "标题"], draft.title || draft.model);
    put(["вес", "weight", "重量"], draft.weight);
    put(["длина", "length", "长"], draft.length);
    put(["ширина", "width", "宽"], draft.width);
    put(["высота", "height", "高"], draft.height);
    normalizedParamRows().forEach((row) => put([row.name], row.value));
    parseVariantDimensions(draft.variantDimensions).forEach((dim) => put([dim.name], dim.values.join(";")));
    String(draft.params || "").split(/\n+/).forEach((line) => {
      const parts = line.split(/[:：]/);
      if (parts.length >= 2) put([parts.shift()], parts.join(":"));
    });
    return facts;
  }

  function inferAttrRawValue(attr, facts) {
    const name = normalizeAttrText(`${attr.name || ""} ${attr.description || ""}`);
    const direct = [...facts.entries()].find(([key]) => key && name.includes(key));
    if (direct) return direct[1];
    const aliases = [
      [["бренд", "brand"], draft.brand],
      [["модель", "model"], draft.model || draft.code],
      [["артикул", "sku", "offer"], draft.code],
      [["назван", "title", "name"], draft.title || draft.model],
      [["материал", "material", "材质"], facts.get("材质") || facts.get("material")],
      [["цвет", "color", "颜色"], facts.get("颜色") || facts.get("color") || facts.get("цвет")],
      [["размер", "size", "尺码"], facts.get("尺码") || facts.get("size") || facts.get("размер")],
      [["комплектац", "package", "包装"], facts.get("包装清单") || facts.get("包装") || facts.get("package")],
      [["назначение", "scenario", "适用"], facts.get("适用场景") || facts.get("场景")],
      [["вес", "weight", "重量"], draft.weight],
      [["длина", "length"], draft.length],
      [["ширина", "width"], draft.width],
      [["высота", "height"], draft.height],
    ];
    const hit = aliases.find(([keys, value]) => value && keys.some((key) => name.includes(normalizeAttrText(key))));
    return hit ? hit[1] : "";
  }

  function chooseDictionaryValue(attr, raw) {
    const values = attr.values || [];
    if (!values.length || !String(raw || "").trim()) return raw;
    const wanted = normalizeAttrText(raw);
    const exact = values.find((v) => normalizeAttrText(v.value) === wanted);
    if (exact) return exact.value;
    const contains = values.find((v) => {
      const val = normalizeAttrText(v.value);
      return val.includes(wanted) || wanted.includes(val);
    });
    return contains ? contains.value : "";
  }

  function autoFillAttributes(options = {}) {
    const { silent = false, onlyEmpty = false } = options;
    if (!currentAttributes.length) {
      if (!silent) alert("当前类目属性还没有加载出来。请先选择末级类目，或点击「刷新该类目属性」。");
      return;
    }
    const facts = productFactMap();
    let count = 0;
    currentAttributes.forEach((attr) => {
      if (!attr?.id) return;
      const oldValue = attrValues[attr.id];
      const hasOldValue = Array.isArray(oldValue) ? oldValue.length > 0 : String(oldValue || "").trim() !== "";
      if (onlyEmpty && hasOldValue) return;
      const raw = inferAttrRawValue(attr, facts);
      const value = (attr.dictionary || attr.values?.length) ? chooseDictionaryValue(attr, raw) : raw;
      if (!String(value || "").trim()) return;
      attrValues[attr.id] = attr.isCollection ? String(value).split(";").map((v) => v.trim()).filter(Boolean) : String(value).trim();
      count += 1;
    });
    draft.attrValues = attrValues;
    renderAttrForm();
    persistDraft();
    const status = $("lst_attrsStatus");
    if (status && (!silent || count > 0)) status.textContent = `已自动生成 ${count} 个属性，可继续手动修改。`;
  }

  function normalizeImportKey(value) {
    return normalizeAttrText(value)
      .replace(/[()（）【】\[\]{}]/g, "")
      .replace(/\s+/g, "");
  }

  function importFactEntries(product) {
    const entries = [];
    const put = (name, value) => {
      const text = Array.isArray(value) ? value.filter(Boolean).join("; ") : String(value || "").trim();
      if (name && text) entries.push({ name: String(name), key: normalizeImportKey(name), value: text });
    };
    put("标题", product.title);
    put("产品名称", product.productName);
    put("品牌", product.brand);
    put("货号", product.code);
    put("型号", product.model);
    put("规格", product.spec);
    put("净含量", (product.attributes || []).find((item) => item.name === "净含量")?.value);
    put("重量", product.weight ? String(product.weight) : "");
    put("长", product.length ? String(product.length) : "");
    put("宽", product.width ? String(product.width) : "");
    put("高", product.height ? String(product.height) : "");
    (product.attributes || []).forEach((item) => put(item.name, item.value));
    return entries;
  }

  function attrAliases(attr) {
    const text = `${attr.name || ""} ${attr.description || ""}`;
    const key = normalizeImportKey(text);
    const aliases = [key];
    const pairs = [
      ["品牌", ["brand", "бренд", "斜褉械薪写"]],
      ["型号", ["model", "модель", "屑芯写械谢褜"]],
      ["货号", ["sku", "offer", "артикул", "邪褉褌懈泻褍谢"]],
      ["标题", ["title", "name", "название", "薪邪蟹胁邪薪"]],
      ["产品名称", ["商品名称", "name", "название"]],
      ["净含量", ["容量", "volume", "объем", "объемтовара"]],
      ["规格", ["产品规格", "尺寸", "size", "размер"]],
      ["重量", ["weight", "вес"]],
      ["长", ["length", "длина"]],
      ["宽", ["width", "ширина"]],
      ["高", ["height", "высота"]],
      ["适用人群", ["人群", "gender", "пол"]],
      ["适用肤质", ["肤质", "skin"]],
      ["化妆品功效", ["功效", "effect", "назначение"]],
      ["质地", ["texture"]],
      ["保质期", ["shelf", "срок"]],
      ["产地", ["country", "origin", "страна"]],
      ["包装种类", ["包装", "package"]],
    ];
    pairs.forEach(([cn, items]) => {
      const keys = [cn, ...items].map(normalizeImportKey);
      if (keys.some((item) => key.includes(item) || item.includes(key))) aliases.push(...keys);
    });
    return [...new Set(aliases.filter(Boolean))];
  }

  function matchImportValueToAttr(attr, entries) {
    const aliases = attrAliases(attr);
    const hit = entries.find((entry) => aliases.some((alias) => entry.key === alias || entry.key.includes(alias) || alias.includes(entry.key)));
    if (!hit) return "";
    return (attr.dictionary || attr.values?.length) ? chooseDictionaryValue(attr, hit.value) : hit.value;
  }

  function appendImportedParamRows(product, usedNames) {
    const exists = new Set((draft.paramRows || []).map((row) => normalizeImportKey(row.name)));
    const rows = (product.attributes || [])
      .filter((item) => item.name && item.value && !usedNames.has(normalizeImportKey(item.name)) && !exists.has(normalizeImportKey(item.name)))
      .slice(0, 24)
      .map((item) => ({ name: item.name, value: item.value }));
    draft.paramRows = [...(draft.paramRows || []), ...rows];
  }

  function applyImported1688Product(product) {
    readStep2Form();
    draft.sourceUrl1688 = product.sourceUrl || draft.sourceUrl1688;
    draft.title = product.title || draft.title;
    draft.description = product.title || draft.description;
    draft.code = product.code || product.offerId || draft.code;
    draft.brand = product.brand || draft.brand;
    draft.model = product.productName || product.model || draft.model;
    draft.purchasePrice1688 = product.price ? String(product.price) : draft.purchasePrice1688;
    draft.purchaseShipping1688 = product.shipping ? String(product.shipping) : draft.purchaseShipping1688;
    draft.purchaseCost = product.purchaseCost ? String(product.purchaseCost) : draft.purchaseCost;
    draft.weight = product.weight ? String(Math.round(Number(product.weight))) : draft.weight;
    draft.length = product.length ? String(Number(product.length).toFixed(1)) : draft.length;
    draft.width = product.width ? String(Number(product.width).toFixed(1)) : draft.width;
    draft.height = product.height ? String(Number(product.height).toFixed(1)) : draft.height;
    const imgs = [...(product.images || []), ...(product.detailImages || [])].filter(Boolean);
    if (imgs.length) {
      const existing = new Set(draft.images || []);
      draft.images = [...(draft.images || []), ...imgs.filter((src) => !existing.has(src))].slice(0, 15);
    }
    const entries = importFactEntries(product);
    const usedNames = new Set();
    let matched = 0;
    currentAttributes.forEach((attr) => {
      if (!attr?.id) return;
      const value = matchImportValueToAttr(attr, entries);
      if (!String(value || "").trim()) return;
      attrValues[attr.id] = attr.isCollection ? String(value).split(";").map((item) => item.trim()).filter(Boolean) : String(value).trim();
      matched += 1;
      attrAliases(attr).forEach((alias) => usedNames.add(alias));
    });
    draft.attrValues = attrValues;
    appendImportedParamRows(product, usedNames);
    fillStep2Form();
    renderAttrForm();
    persistDraft();
    const cost = $("lst_1688Cost");
    if (cost) cost.textContent = `商品 ¥${Number(product.price || 0).toFixed(2)} + 运费 ¥${Number(product.shipping || 0).toFixed(2)} = 成本 ¥${Number(product.purchaseCost || 0).toFixed(2)}`;
    const status = $("lst_1688Status");
    const skipped = Math.max(0, (product.attributes || []).length - matched);
    if (status) status.textContent = `已导入 1688 商品，匹配 Ozon 属性 ${matched} 个；未匹配的 ${skipped} 个已放入结构化产品参数，不会作为 Ozon 属性提交。`;
  }

  async function import1688Link() {
    const input = $("lst_sourceUrl1688");
    const status = $("lst_1688Status");
    const btn = $("lst_import1688");
    const url = String(input?.value || draft.sourceUrl1688 || "").trim();
    if (!url) { alert("请先粘贴 1688 商品链接。"); return; }
    if (!currentAttributes.length && draft.descriptionCategoryId && draft.typeId) {
      await loadCategoryAttributes();
    }
    if (status) status.textContent = "正在抓取 1688 商品并匹配 Ozon 属性...";
    if (btn) { btn.disabled = true; btn.textContent = "导入中..."; }
    try {
      const res = await fetch(API("import-1688"), {
        method: "POST",
        headers: storeHeaders(),
        body: JSON.stringify({ url }),
      });
      const data = await readJsonResponse(res);
      if (!data.ok) throw new Error(data.error || "1688 导入失败");
      applyImported1688Product(data);
      if (!currentAttributes.length && status) status.textContent += " 当前还没有 Ozon 类目属性，只填入了基础信息和产品参数。";
    } catch (e) {
      if (status) status.textContent = "1688 导入失败:" + (e.message || e);
      alert("1688 导入失败:" + (e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "导入并匹配属性"; }
    }
  }

  window.ozonWbImport1688Product = (product) => {
    applyImported1688Product(product || {});
    return {
      ok: true,
      attrCount: Object.keys(draft.attrValues || {}).length,
      imageCount: (draft.images || []).length,
      purchaseCost: draft.purchaseCost,
    };
  };

  function parseVariantDimensions(text) {
    return String(text || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[:：]/);
        const name = (parts.shift() || "").trim();
        const values = parts.join(":").split(/[,，;；/|]+/).map((v) => v.trim()).filter(Boolean);
        return { name, values };
      })
      .filter((item) => item.name && item.values.length);
  }

  function cartesianDimensions(dimensions) {
    return dimensions.reduce((rows, dim) => rows.flatMap((row) => dim.values.map((value) => ({ ...row, [dim.name]: value }))), [{}]);
  }

  function variantSuffix(values) {
    return Object.values(values || {})
      .map((value) => String(value || "").replace(/\s+/g, "-").replace(/[^\w\u0400-\u04ff\u4e00-\u9fff-]+/g, "").toUpperCase())
      .filter(Boolean)
      .join("-");
  }

  function generateVariantsFromDimensions() {
    readStep2Form();
    const dims = parseVariantDimensions(draft.variantDimensions);
    if (!dims.length) { alert("请先填写变体维度,例如: 颜色: 黑色,白色"); return; }
    const combos = cartesianDimensions(dims).slice(0, 100);
    const base = draft.code || "SKU";
    const oldByOffer = new Map((draft.variants || []).map((v) => [String(v.offerId || ""), v]));
    draft.variantsEnabled = true;
    draft.variants = combos.map((values, index) => {
      const offerId = `${base}-${variantSuffix(values) || index + 1}`;
      const old = oldByOffer.get(offerId) || {};
      return {
        offerId,
        barcode: old.barcode || "",
        price: old.price || draft.price || "",
        oldPrice: old.oldPrice || draft.oldPrice || "",
        stock: old.stock || draft.stockQty || "20",
        values,
        attrValues: old.attrValues || {},
      };
    });
    fillStep2Form();
    persistDraft();
  }

  function renderVariantTable() {
    const box = $("lst_variantTable");
    if (!box) return;
    const enabled = $("lst_variantsEnabled");
    const dims = $("lst_variantDimensions");
    if (enabled) enabled.checked = Boolean(draft.variantsEnabled);
    if (dims) dims.value = draft.variantDimensions || "";
    if (!draft.variantsEnabled) {
      box.innerHTML = `<div class="table-status">未启用变体,发布时只创建 1 个 SKU。</div>`;
      return;
    }
    const variants = Array.isArray(draft.variants) ? draft.variants : [];
    if (!variants.length) {
      box.innerHTML = `<div class="table-status">启用后请先生成变体 SKU。</div>`;
      return;
    }
    const dimNames = [...new Set(variants.flatMap((variant) => Object.keys(variant.values || {})))];
    box.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>${dimNames.map((name) => `<th>${escapeHtml(name)}</th>`).join("")}<th>SKU</th><th>条码</th><th>售价 RMB</th><th>折扣前</th><th>库存</th><th>操作</th></tr></thead>
          <tbody>
            ${variants.map((variant, index) => `
              <tr data-variant-row="${index}">
                ${dimNames.map((name) => `<td>${escapeHtml(variant.values?.[name] || "")}</td>`).join("")}
                <td><input data-variant-field="offerId" value="${escapeAttr(variant.offerId || "")}" /></td>
                <td><input data-variant-field="barcode" value="${escapeAttr(variant.barcode || "")}" /></td>
                <td><input data-variant-field="price" type="number" min="0" step="0.01" value="${escapeAttr(variant.price || "")}" /></td>
                <td><input data-variant-field="oldPrice" type="number" min="0" step="0.01" value="${escapeAttr(variant.oldPrice || "")}" /></td>
                <td><input data-variant-field="stock" type="number" min="0" step="1" value="${escapeAttr(variant.stock || "")}" /></td>
                <td><button class="danger" type="button" data-variant-delete="${index}">删除</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function updateVariantFromInput(input) {
    const row = input.closest("[data-variant-row]");
    if (!row) return;
    const index = Number(row.getAttribute("data-variant-row"));
    const field = input.getAttribute("data-variant-field");
    if (!draft.variants?.[index] || !field) return;
    draft.variants[index][field] = input.value;
    persistDraft();
  }

  // 收集树的所有节点(带路径),用于搜索
  function flattenTreeForSearch(nodes, parentPath = []) {
    const out = [];
    nodes.forEach((n) => {
      const path = [...parentPath, n.name];
      out.push({ node: n, path, pathStr: path.join(" / "), level: n.level });
      if (n.children && n.children.length) {
        out.push(...flattenTreeForSearch(n.children, path));
      }
    });
    return out;
  }

  function runCatSearch(kw) {
    const box = $("lst_catSearchResult");
    if (!box) return;
    const keyword = String(kw || "").trim().toLowerCase();
    if (!keyword) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    if (!categoryTree.length) {
      box.hidden = false;
      box.innerHTML = `<div class="listing-search-empty">类目尚未加载,请先选择平台与店铺。</div>`;
      return;
    }
    const all = flattenTreeForSearch(categoryTree);
    // 匹配:节点名或完整路径包含关键词
    const matched = all.filter((x) =>
      x.node.name.toLowerCase().includes(keyword) || x.pathStr.toLowerCase().includes(keyword)
    ).slice(0, 60);

    if (!matched.length) {
      box.hidden = false;
      box.innerHTML = `<div class="listing-search-empty">未找到包含「${escapeHtml(kw)}」的类目。</div>`;
      return;
    }
    box.hidden = false;
    box.innerHTML = matched.map((x) => {
      const isLeaf = !(x.node.children && x.node.children.length);
      const tag = isLeaf ? `<span class="leaf-tag">可上架</span>` : `<span class="level-tag">${x.level}级</span>`;
      // 高亮匹配段
      const pathHtml = escapeHtml(x.pathStr).replace(new RegExp(`(${escapeHtml(kw)})`, "gi"), '<mark>$1</mark>');
      return `<div class="listing-search-item" data-search-id="${escapeAttr(x.node.id)}" data-search-level="${x.level}">
        <span class="path">${pathHtml}</span>
        ${tag}
      </div>`;
    }).join("");
  }

  // 点击搜索结果:若是末级 → 直接确认上架;若是中间级 → 跳转级联到该节点
  function onSearchResultClick(id) {
    const findIn = (nodes, fid) => {
      for (const n of nodes) { if (n.id === fid) return n; if (n.children) { const f = findIn(n.children, fid); if (f) return f; } }
      return null;
    };
    const node = findIn(categoryTree, id);
    if (!node) return;
    const isLeaf = !(node.children && node.children.length);
    if (isLeaf) {
      // 末级:直接确认上架
      const leaf = node.leaf || {};
      const oldKey = attrCategoryKey();
      draft.categoryId = leaf.origId || node.id;
      draft.categoryName = node.name;
      draft.categoryNameZh = node.name;
      draft.categoryFullPath = leaf.fullPath || node.name;
      draft.typeId = leaf.typeId || 0;
      draft.descriptionCategoryId = leaf.categoryId || 0;
      if (oldKey !== attrCategoryKey()) resetAttrsForCurrentCategory();
      persistDraft();
    }
    // 跳转级联(末级也跳转,让用户看到选中状态)
    jumpCascadeTo(node);
    // 清空搜索
    const searchInput = $("lst_catSearch");
    if (searchInput) searchInput.value = "";
    const box = $("lst_catSearchResult");
    if (box) { box.hidden = true; box.innerHTML = ""; }
  }

  // 把级联状态跳转到指定节点(展开其父级链)
  function jumpCascadeTo(node) {
    // 找到从根到 node 的完整路径
    const findPath = (nodes, fid, trail) => {
      for (const n of nodes) {
        const newTrail = [...trail, n];
        if (n.id === fid) return newTrail;
        if (n.children) { const f = findPath(n.children, fid, newTrail); if (f) return f; }
      }
      return null;
    };
    const path = findPath(categoryTree, node.id, []);
    if (!path) return;
    cascadeState.l1 = path[0]?.id || "";
    cascadeState.l2 = path[1]?.id || "";
    cascadeState.l3 = path[2]?.id || "";
    cascadeState.l4 = path[3]?.id || "";
    renderCascade();
  }

  function renderThumbs() {
    const row = $("lst_thumbRow");
    if (!row) return;
    row.innerHTML = draft.images.map((src, i) => `
      <div class="listing-thumb">
        <img src="${escapeAttr(src)}" alt="参考图 ${i + 1}" />
        <button class="rm" type="button" data-rm-img="${i}" title="移除">×</button>
      </div>`).join("");
  }

  function renderGeneratedImages(pendingCount = 0) {
    const grid = $("lst_genGrid");
    if (!grid) return;
    const images = (draft.generatedImages || []).filter(Boolean);
    if (pendingCount) {
      grid.innerHTML = Array.from({ length: pendingCount }, (_, i) => `
        <div class="listing-gen-cell pending"><span class="tag">${i + 1}</span></div>`).join("");
    } else {
      grid.innerHTML = images.map((src, i) => `
        <div class="listing-gen-cell">
          <img src="${escapeAttr(src)}" alt="AI 生成图 ${i + 1}" />
          <span class="tag">${i + 1}</span>
        </div>`).join("");
    }
    const applyBtn = $("lst_applyGenImages");
    if (applyBtn) applyBtn.hidden = !images.length || Boolean(pendingCount);
  }

  function aiProductPayload() {
    readStep2Form();
    return {
      title: draft.title,
      brand: draft.brand,
      model: draft.model,
      categoryZh: draft.categoryNameZh,
      category: draft.categoryFullPath || draft.categoryName,
      params: combinedParamsText(),
      sellingPoints: draft.sellingPoints,
      price: draft.price,
      oldPrice: draft.oldPrice,
      weight: draft.weight,
      size: [draft.length, draft.width, draft.height].filter(Boolean).join(" x "),
    };
  }

  function normalizedParamRows() {
    const rows = Array.isArray(draft.paramRows) ? draft.paramRows : [];
    return rows
      .map((row) => ({ name: String(row?.name || "").trim(), value: String(row?.value || "").trim() }))
      .filter((row) => row.name || row.value);
  }

  function combinedParamsText() {
    const structured = normalizedParamRows()
      .filter((row) => row.name && row.value)
      .map((row) => `${row.name}:${row.value}`);
    const note = String(draft.params || "").trim();
    return [...structured, note].filter(Boolean).join("\n");
  }

  function readParamRows() {
    const box = $("lst_paramRows");
    if (!box) return;
    draft.paramRows = [...box.querySelectorAll("[data-param-row]")].map((row) => ({
      name: row.querySelector("[data-param-name]")?.value || "",
      value: row.querySelector("[data-param-value]")?.value || "",
    }));
  }

  function renderParamRows() {
    const box = $("lst_paramRows");
    if (!box) return;
    const rows = Array.isArray(draft.paramRows) && draft.paramRows.length ? draft.paramRows : [{ name: "", value: "" }];
    box.innerHTML = rows.map((row, index) => `
      <div class="listing-param-row" data-param-row="${index}">
        <input data-param-name value="${escapeAttr(row.name || "")}" placeholder="参数名,如材质" />
        <input data-param-value value="${escapeAttr(row.value || "")}" placeholder="参数值" />
        <button class="danger" type="button" data-param-remove="${index}">删除</button>
      </div>`).join("");
  }

  function normalizeTags(value) {
    return String(value || "")
      .split(/[\n,，;；]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20)
      .join("\n");
  }

  async function generateCopy() {
    const btn = $("lst_generateCopy");
    const status = $("lst_aiStatus");
    if (btn) { btn.disabled = true; btn.textContent = "生成中…"; }
    if (status) status.textContent = "正在生成俄文标题、描述和搜索标签…";
    try {
      const res = await fetch(API("generate-copy"), {
        method: "POST",
        headers: storeHeaders(),
        body: JSON.stringify({ product: aiProductPayload() }),
      });
      const data = await readJsonResponse(res);
      if (!data.ok) throw new Error(data.error || "文案生成失败");
      draft.title = data.title || draft.title;
      draft.description = data.description || draft.description;
      draft.tags = normalizeTags(data.tags || draft.tags);
      fillStep2Form();
      persistDraft();
      if (status) status.textContent = "文案已生成并写入表单。";
    } catch (e) {
      if (status) status.textContent = "文案生成失败:" + (e.message || e);
      alert("文案生成失败:" + (e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "AI 生成俄文文案"; }
    }
  }

  async function generateImages() {
    if (!draft.images.length) {
      alert("请先上传至少 1 张参考图,再生成商品图。");
      return;
    }
    const btn = $("lst_generateImages");
    const status = $("lst_aiStatus");
    if (btn) { btn.disabled = true; btn.textContent = "生图中…"; }
    if (status) status.textContent = "正在生成 9 张商品图,可能需要一些时间…";
    renderGeneratedImages(9);
    try {
      const res = await fetch(API("generate-images"), {
        method: "POST",
        headers: storeHeaders(),
        body: JSON.stringify({
          product: aiProductPayload(),
          referenceImages: draft.images.slice(0, 4),
          count: 9,
        }),
      });
      const data = await readJsonResponse(res);
      if (!data.ok) throw new Error(data.error || "生图失败");
      draft.generatedImages = (data.results || []).filter((item) => item.ok && item.url).map((item) => item.url);
      renderGeneratedImages();
      persistDraft();
      if (status) status.textContent = `已生成 ${draft.generatedImages.length} 张商品图。`;
    } catch (e) {
      draft.generatedImages = [];
      renderGeneratedImages();
      if (status) status.textContent = "生图失败:" + (e.message || e);
      alert("生图失败:" + (e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "AI 生成 9 张商品图"; }
    }
  }

  // ---- 渲染:货盘选择 ----
  function renderTrayRows() {
    const tbody = $("lst_trayRows");
    if (!tbody) return;
    const tray = readTray();
    if (!tray.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted-cell">货盘为空,请先到「货盘管理」录入。</td></tr>`;
      return;
    }
    tbody.innerHTML = tray.map((it) => `
      <tr>
        <td><button class="secondary" type="button" data-tray-pick="${escapeAttr(it.id)}">选用</button></td>
        <td><strong>${escapeHtml(it.name)}</strong><div class="sku">${escapeHtml(it.code || "")}</div></td>
        <td>${escapeHtml(it.supplier || "—")}</td>
        <td>${escapeHtml(it.spec || "—")}</td>
        <td class="money">¥${Number(it.price || 0).toFixed(2)}</td>
        <td>${Number(it.stock || 0)}</td>
      </tr>`).join("");
  }

  // ---- 收集第二步表单(产品信息 + 图片 + 文案) ----
  function readStep2Form() {
    const fields = ["sourceUrl1688", "code", "brand", "model", "purchaseCost", "targetGrossRate", "commissionRate", "exchangeRate", "price", "oldPrice", "weight", "length", "width", "height", "params", "sellingPoints"];
    fields.forEach((k) => {
      const el = $(`lst_${k}`);
      if (el) draft[k] = el.value;
    });
    // 文案字段(标题/描述/标签现在也在第二步)
    const titleEl = $("lst_title");
    const descEl = $("lst_description");
    const tagsEl = $("lst_tags");
    if (titleEl) draft.title = titleEl.value;
    if (descEl) draft.description = descEl.value;
    if (tagsEl) draft.tags = tagsEl.value;
    readParamRows();
    const variantsEnabled = $("lst_variantsEnabled");
    const variantDimensions = $("lst_variantDimensions");
    if (variantsEnabled) draft.variantsEnabled = variantsEnabled.checked;
    if (variantDimensions) draft.variantDimensions = variantDimensions.value;
  }

  function fillStep2Form() {
    ["sourceUrl1688", "code", "brand", "model", "purchaseCost", "targetGrossRate", "commissionRate", "exchangeRate", "price", "oldPrice", "weight", "length", "width", "height", "params", "sellingPoints"].forEach((k) => {
      const el = $(`lst_${k}`);
      if (el) el.value = draft[k] ?? "";
    });
    const cost = $("lst_1688Cost");
    if (cost) {
      const price = Number(draft.purchasePrice1688 || 0);
      const shipping = Number(draft.purchaseShipping1688 || 0);
      cost.textContent = price || shipping
        ? `商品 ¥${price.toFixed(2)} + 运费 ¥${shipping.toFixed(2)} = 成本 ¥${Number(draft.purchaseCost || 0).toFixed(2)}`
        : "商品价/运费会自动读取。";
    }
    $("lst_title") && ($("lst_title").value = draft.title || "");
    $("lst_description") && ($("lst_description").value = draft.description || "");
    $("lst_tags") && ($("lst_tags").value = draft.tags || "");
    const platformSel = $("lst_platform");
    if (platformSel) platformSel.value = draft.platform;
    const storeSel = $("lst_storeIndex");
    if (storeSel) storeSel.value = String(draft.storeIndex);
    renderThumbs();
    renderGeneratedImages();
    renderPricingResult();
    renderVariantTable();
    renderParamRows();
  }

  function renderPricingResult() {
    const box = $("lst_pricingResult");
    if (!box) return;
    const r = draft.pricingResult;
    if (!r?.ok) {
      box.textContent = r?.error || "填写采购成本、重量、尺寸后可测算售价。";
      box.classList.toggle("is-error", Boolean(r?.error));
      return;
    }
    box.classList.remove("is-error");
    const minimumPrice = Number(r.minimumPriceRmb || r.priceRmb || 0);
    const recommendedPrice = Number(r.recommendedPriceRmb || minimumPrice * 2 || 0);
    box.innerHTML = `
      <strong>${escapeHtml(r.scheme?.name || "")}</strong> · ${escapeHtml(r.scheme?.method || "")}
      <span>最低售价 ¥${minimumPrice.toFixed(2)}</span>
      <span>建议售价 ¥${recommendedPrice.toFixed(2)}</span>
      <span>毛利率 ${(Number(r.grossRate || 0) * 100).toFixed(1)}%</span>
      <span>运费 ¥${Number(r.freight || 0).toFixed(2)}</span>
      <span>计费重 ${Number(r.chargeKg || 0).toFixed(3)}kg</span>`;
  }

  function runGuooPricing() {
    const result = calculateGuooPricing();
    draft.pricingResult = result;
    if (!result.ok) {
      renderPricingResult();
      alert(result.error);
      persistDraft();
      return;
    }
    const minimumPrice = Number(result.minimumPriceRmb || result.priceRmb || 0);
    const recommendedPrice = Number(result.recommendedPriceRmb || minimumPrice * 2 || 0);
    draft.price = recommendedPrice.toFixed(2);
    const oldPrice = Math.ceil(recommendedPrice * 1.35 * 100) / 100;
    if (!toNumber(draft.oldPrice) || toNumber(draft.oldPrice) < recommendedPrice) draft.oldPrice = oldPrice.toFixed(2);
    fillStep2Form();
    persistDraft();
  }

  function publishPayload() {
    readStep2Form();
    const offerId = $("lst_pubOfferId")?.value || draft.code;
    const uiStoreIndex = Number($("lst_pubStore")?.value || draft.storeIndex || 0);
    const storeIndex = currentApiStoreIndex(uiStoreIndex);
    draft.storeIndex = uiStoreIndex;
    draft.apiStoreIndex = storeIndex;
    const sameAttrCategory = draft.attrCategoryKey === attrCategoryKey();
    const attrDefinitions = currentAttributes.length ? currentAttributes : (sameAttrCategory ? (draft.attrDefinitions || []) : []);
    draft.attrDefinitions = attrDefinitions;
    return {
      platform: draft.platform,
      storeIndex,
      draft: {
        title: draft.title,
        description: draft.description,
        offerId,
        code: draft.code,
        brand: draft.brand,
        model: draft.model,
        categoryId: draft.categoryId,
        categoryFullPath: draft.categoryFullPath,
        typeId: draft.typeId || 0,
        descriptionCategoryId: draft.descriptionCategoryId || 0,
        price: draft.price,
        oldPrice: draft.oldPrice,
        weight: draft.weight,
        length: draft.length,
        width: draft.width,
        height: draft.height,
        params: combinedParamsText(),
        sellingPoints: draft.sellingPoints,
        tags: draft.tags,
        images: (draft.images || []).filter(Boolean),
        attrValues: sameAttrCategory ? (draft.attrValues || {}) : {},
        attrDefinitions,
        variantsEnabled: Boolean(draft.variantsEnabled),
        variantDimensions: draft.variantDimensions || "",
        variants: (draft.variants || []).map((variant) => ({
          offerId: variant.offerId || "",
          barcode: variant.barcode || "",
          price: variant.price || draft.price,
          oldPrice: variant.oldPrice || draft.oldPrice,
          stock: variant.stock || draft.stockQty || "20",
          values: variant.values || {},
          attrValues: variant.attrValues || {},
          images: variant.images || [],
        })).filter((variant) => variant.offerId),
      },
    };
  }

  function renderFlowChecks() {
    const box = $("lst_flowChecks");
    if (!box) return;
    const checks = draft.preflightResult?.checks || [];
    const audit = draft.auditResult || null;
    const checkHtml = checks.length ? checks.map((check) => `
      <span class="listing-flow-chip ${check.ok ? "is-ok" : "is-bad"}">
        ${check.ok ? "✓" : "!"} ${escapeHtml(check.label)} <small>${escapeHtml(check.detail || "")}</small>
      </span>`).join("") : `<span class="muted-cell">还没有上传前自检结果。</span>`;
    const auditHtml = audit ? `
      <span class="listing-flow-chip ${audit.status === "complete" ? "is-ok" : "is-warn"}">
        完整性 ${escapeHtml(audit.status || "-")} <small>${Number(audit.attributeCount || 0)} 属性 / Rich ${audit.richWritten ? "已写入" : "未确认"}</small>
      </span>` : "";
    box.innerHTML = `${checkHtml}${auditHtml}`;
  }

  async function runPreflight() {
    const btn = $("lst_preflight");
    if (btn) { btn.disabled = true; btn.textContent = "自检中…"; }
    try {
      const payload = publishPayload();
      const res = await fetch(API("preflight"), { method: "POST", headers: storeHeaders(), body: JSON.stringify(payload) });
      const data = await readJsonResponse(res);
      draft.preflightResult = data;
      persistDraft();
      renderFlowChecks();
      const failed = (data.checks || []).filter((check) => !check.ok);
      log(failed.length ? `上传前自检未通过:${failed.map((x) => x.label).join("、")}` : `上传前自检通过:SKU=${data.offerId || payload.draft.offerId}`);
      return data;
    } catch (e) {
      log("上传前自检异常:" + (e.message || e));
      alert("上传前自检异常:" + (e.message || e));
      return { ok: false, error: e.message || String(e) };
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "上传前自检"; }
    }
  }

  // ---- 第三步:发布 ----
  async function runPublish() {
    const preflight = await runPreflight();
    if (!preflight.ok && !confirm("上传前自检未通过,仍然尝试发布?")) return;
    const payload = publishPayload();
    const offerId = payload.draft.offerId;
    const images = (draft.images || []).filter(Boolean);
    if (!draft.title) { alert("缺少标题"); return; }
    if (!images.length) { alert("请至少上传 1 张商品图片"); return; }
    const btn = $("lst_publish");
    btn.disabled = true;
    log(`开始发布到 ${draft.platform}…`);
    try {
      const res = await fetch(API("publish"), {
        method: "POST",
        headers: storeHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(res);
      draft.publishResult = data;
      if (data.ok) {
        // 标记为上架中(Ozon 异步任务,需稍后检测)
        draft.publishStatus = "pending";
        draft.publishError = "";
        draft.publishTaskId = data.taskId || "";
        draft.productId = data.productId || draft.productId || "";
        draft.offerId = data.offerId || offerId;
        draft.publishedAt = nowIso();
        log(`发布请求已提交:${data.taskId ? "任务 ID " + data.taskId : "成功"}${data.offerId ? ",SKU=" + data.offerId : ""}`);
        alert("发布请求已提交!草稿状态已标记为「上架中」,可在草稿列表点击「检测状态」查看结果。");
        // 5 秒后自动检测一次状态(Ozon 异步处理需要时间)
        setTimeout(() => checkPublishStatus(draft.id), 5000);
      } else {
        draft.publishStatus = "failed";
        draft.publishError = data.error || "未知错误";
        log("发布失败:" + (data.error || JSON.stringify(data)));
        alert("发布失败:" + (data.error || "未知错误"));
      }
      persistDraft();
    } catch (e) {
      draft.publishStatus = "failed";
      draft.publishError = e.message || String(e);
      log("发布异常:" + (e.message || e));
      alert("发布异常:" + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  }

  // 检测草稿的上架状态(调后端查询 Ozon 任务结果)
  async function checkPublishStatus(draftId) {
    const d = drafts.find((x) => x.id === draftId);
    if (!d) return;
    const btn = document.querySelector(`[data-draft-check-status="${CSS.escape(draftId)}"]`);
    if (btn) { btn.disabled = true; btn.textContent = "检测中…"; }
    try {
      const apiStoreIndex = Number(d.apiStoreIndex ?? currentApiStoreIndex(d.storeIndex || 0));
      const res = await fetch(API(`publish-status?taskId=${encodeURIComponent(d.publishTaskId || "")}&offerId=${encodeURIComponent(d.offerId || d.code || "")}&storeIndex=${apiStoreIndex}&platform=${encodeURIComponent(d.platform || "Ozon")}`), {
        headers: storeHeaders(),
      });
      const data = await readJsonResponse(res);
      if (data.ok) {
        d.publishStatus = data.status || "pending";
        d.publishError = data.error || "";
        d.productId = data.productId || d.productId || "";
        d.offerId = data.offerId || d.offerId || d.code || "";
        if (data.status === "done") log(`「${d.title || d.code}」上架成功!`);
        else if (data.status === "failed") log(`「${d.title || d.code}」上架失败:${data.error || ""}`);
        else log(`「${d.title || d.code}」仍在处理中…`);
      } else {
        log("状态检测失败:" + (data.error || ""));
      }
    } catch (e) {
      log("状态检测异常:" + (e.message || e));
    } finally {
      // 同步当前 draft(若正在编辑的就是这个草稿)
      if (draft.id === draftId) {
        draft.publishStatus = d.publishStatus;
        draft.publishError = d.publishError;
        draft.productId = d.productId || draft.productId || "";
        draft.offerId = d.offerId || draft.offerId || "";
      }
      saveDraft();
      renderDraftList();
      renderFlowChecks();
    }
  }

  async function pollCurrentStatus(maxAttempts = 12) {
    const id = draft.id;
    const btn = $("lst_pollStatus");
    if (btn) { btn.disabled = true; btn.textContent = "轮询中…"; }
    for (let i = 0; i < maxAttempts; i += 1) {
      await checkPublishStatus(id);
      const latest = drafts.find((x) => x.id === id) || draft;
      if (latest.publishStatus === "done" || latest.publishStatus === "failed") break;
      await sleep(i < 3 ? 3000 : 6000);
    }
    if (btn) { btn.disabled = false; btn.textContent = "轮询上架状态"; }
  }

  async function auditCurrentProduct() {
    const btn = $("lst_auditProduct");
    if (btn) { btn.disabled = true; btn.textContent = "检查中…"; }
    try {
      const payload = publishPayload();
      const expectedAttributes = (currentAttributes || [])
        .filter((attr) => attr.id && (attr.isRequired || hasAttrValue(attr.id)))
        .map((attr) => Number(attr.id));
      const res = await fetch(API("audit-product"), {
        method: "POST",
        headers: storeHeaders(),
        body: JSON.stringify({
          platform: draft.platform,
          storeIndex: payload.storeIndex,
          offerId: draft.offerId || payload.draft.offerId || draft.code,
          productId: draft.productId || draft.publishResult?.productId || 0,
          expectedAttributes,
        }),
      });
      const data = await readJsonResponse(res);
      draft.auditResult = data;
      draft.productId = data.productId || draft.productId || "";
      persistDraft();
      renderFlowChecks();
      log(data.ok ? `完整性检查:${data.status || "-"}, 属性 ${data.attributeCount || 0}, Rich Content ${data.richWritten ? "已写入" : "未确认"}` : `完整性检查失败:${data.error || ""}`);
    } catch (e) {
      log("完整性检查异常:" + (e.message || e));
      alert("完整性检查异常:" + (e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "完整性检查"; }
    }
  }

  function hasAttrValue(attrId) {
    const value = (draft.attrValues || {})[attrId];
    return Array.isArray(value) ? value.length > 0 : String(value || "").trim() !== "";
  }

  async function loadWarehouses() {
    const btn = $("lst_loadWarehouses");
    const sel = $("lst_stockWarehouse");
    if (btn) { btn.disabled = true; btn.textContent = "加载中…"; }
    try {
      const payload = publishPayload();
      const res = await fetch(API(`warehouses?platform=${encodeURIComponent(draft.platform)}&storeIndex=${payload.storeIndex}`), { headers: storeHeaders() });
      const data = await readJsonResponse(res);
      if (!data.ok) throw new Error(data.error || "仓库加载失败");
      if (sel) {
        sel.innerHTML = (data.warehouses || []).map((w) => `<option value="${escapeAttr(w.id)}">${escapeHtml(w.name || w.id)}</option>`).join("") || `<option value="">没有可用仓库</option>`;
        if (draft.stockWarehouseId) sel.value = String(draft.stockWarehouseId);
        draft.stockWarehouseId = sel.value || draft.stockWarehouseId || "";
      }
      persistDraft();
      log(`已加载 ${data.warehouses?.length || 0} 个仓库。`);
    } catch (e) {
      log("仓库加载失败:" + (e.message || e));
      alert("仓库加载失败:" + (e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "加载仓库"; }
    }
  }

  async function setStock() {
    const warehouseId = $("lst_stockWarehouse")?.value || draft.stockWarehouseId;
    const stock = $("lst_stockQty")?.value || draft.stockQty || "20";
    if (!warehouseId) { alert("请先选择库存仓库"); return; }
    const btn = $("lst_setStock");
    if (btn) { btn.disabled = true; btn.textContent = "设置中…"; }
    try {
      const payload = publishPayload();
      const res = await fetch(API("set-stock"), {
        method: "POST",
        headers: storeHeaders(),
        body: JSON.stringify({
          platform: draft.platform,
          storeIndex: payload.storeIndex,
          offerId: draft.offerId || payload.draft.offerId || draft.code,
          productId: draft.productId || draft.publishResult?.productId || 0,
          stocks: [{ warehouseId, stock }],
        }),
      });
      const data = await readJsonResponse(res);
      if (!data.ok) throw new Error(data.error || "库存设置失败");
      draft.stockWarehouseId = warehouseId;
      draft.stockQty = stock;
      persistDraft();
      log(`库存已提交:仓库 ${warehouseId}, 数量 ${stock}`);
    } catch (e) {
      log("库存设置失败:" + (e.message || e));
      alert("库存设置失败:" + (e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "设置库存"; }
    }
  }

  function storeHeadersFor(uiStoreIndex = 0, platform = draft.platform, extra = {}) {
    return { "content-type": "application/json", ...extra };
  }

  function payloadForDraft(d) {
    const categoryKey = d.descriptionCategoryId && d.typeId ? `${d.descriptionCategoryId}:${d.typeId}` : "";
    const sameAttrCategory = d.attrCategoryKey === categoryKey;
    const attrDefinitions = sameAttrCategory ? (d.attrDefinitions || []) : [];
    const uiStoreIndex = Number(d.storeIndex || 0);
    return {
      platform: d.platform || "Ozon",
      storeIndex: Number(d.apiStoreIndex ?? currentApiStoreIndex(uiStoreIndex)),
      draft: {
        title: d.title,
        description: d.description,
        offerId: d.offerId || d.code,
        code: d.code,
        brand: d.brand,
        model: d.model,
        categoryId: d.categoryId,
        categoryFullPath: d.categoryFullPath,
        typeId: d.typeId || 0,
        descriptionCategoryId: d.descriptionCategoryId || 0,
        price: d.price,
        oldPrice: d.oldPrice,
        weight: d.weight,
        length: d.length,
        width: d.width,
        height: d.height,
        params: [
          ...((Array.isArray(d.paramRows) ? d.paramRows : []).filter((row) => row?.name && row?.value).map((row) => `${row.name}:${row.value}`)),
          d.params || "",
        ].filter(Boolean).join("\n"),
        sellingPoints: d.sellingPoints,
        tags: d.tags,
        images: (d.images || []).filter(Boolean),
        attrValues: sameAttrCategory ? (d.attrValues || {}) : {},
        attrDefinitions,
        variantsEnabled: Boolean(d.variantsEnabled),
        variantDimensions: d.variantDimensions || "",
        variants: (d.variants || []).filter((variant) => variant.offerId),
      },
    };
  }

  function rowValue(row, names) {
    for (const name of names) {
      const key = Object.keys(row).find((k) => String(k).trim().toLowerCase() === String(name).trim().toLowerCase());
      if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
    }
    return "";
  }

  function splitImageList(value) {
    return String(value || "")
      .split(/[\n,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 15);
  }

  function rowVariantValues(row) {
    const values = {};
    Object.entries(row).forEach(([key, value]) => {
      const k = String(key || "").trim();
      if (/^(变体|variant)[:：]/i.test(k)) {
        const name = k.replace(/^(变体|variant)[:：]/i, "").trim();
        if (name && String(value || "").trim()) values[name] = String(value).trim();
      }
    });
    ["颜色", "color", "цвет", "尺码", "size", "размер"].forEach((name) => {
      const value = rowValue(row, [name]);
      if (value) values[name] = String(value).trim();
    });
    return values;
  }

  function draftFromRow(row) {
    const d = emptyDraft();
    Object.assign(d, {
      platform: draft.platform || "Ozon",
      storeIndex: draft.storeIndex || 0,
      apiStoreIndex: currentApiStoreIndex(),
      categoryId: draft.categoryId,
      categoryName: draft.categoryName,
      categoryNameZh: draft.categoryNameZh,
      categoryFullPath: draft.categoryFullPath,
      typeId: draft.typeId || 0,
      descriptionCategoryId: draft.descriptionCategoryId || 0,
      attrDefinitions: currentAttributes.length ? currentAttributes : (draft.attrDefinitions || []),
      attrCategoryKey: attrCategoryKey(),
      attrValues: { ...(draft.attrValues || {}) },
      code: String(rowValue(row, ["货号", "SKU", "sku", "offer_id", "offerId", "code", "Артикул"]) || "").trim(),
      brand: String(rowValue(row, ["品牌", "brand", "Бренд"]) || draft.brand || "").trim(),
      model: String(rowValue(row, ["型号", "型号名称", "model", "name", "品名"]) || "").trim(),
      title: String(rowValue(row, ["标题", "title", "Название"]) || "").trim(),
      description: String(rowValue(row, ["描述", "description", "Описание"]) || "").trim(),
      price: String(rowValue(row, ["售价", "价格", "price", "Цена"]) || "").trim(),
      oldPrice: String(rowValue(row, ["折扣前价格", "old_price", "oldPrice"]) || "").trim(),
      weight: String(rowValue(row, ["重量g", "重量", "weight", "weight_g"]) || "").trim(),
      length: String(rowValue(row, ["长mm", "长", "length"]) || "").trim(),
      width: String(rowValue(row, ["宽mm", "宽", "width"]) || "").trim(),
      height: String(rowValue(row, ["高mm", "高", "height"]) || "").trim(),
      params: String(rowValue(row, ["参数", "params"]) || "").trim(),
      paramRows: [
        { name: "材质", value: String(rowValue(row, ["材质", "material", "Материал"]) || "").trim() },
        { name: "规格/容量", value: String(rowValue(row, ["规格", "容量", "spec", "capacity"]) || "").trim() },
        { name: "适用场景", value: String(rowValue(row, ["适用场景", "场景", "scenario"]) || "").trim() },
        { name: "包装清单", value: String(rowValue(row, ["包装清单", "包装", "package"]) || "").trim() },
      ].filter((item) => item.value),
      sellingPoints: String(rowValue(row, ["卖点", "sellingPoints", "selling_points"]) || "").trim(),
      tags: normalizeTags(rowValue(row, ["标签", "tags", "keywords"]) || ""),
      images: splitImageList(rowValue(row, ["图片", "图片URL", "images", "image", "image_url"])),
    });
    if (!d.title) d.title = d.model || d.code;
    return d;
  }

  function applyAttributeColumns(d, row) {
    const values = { ...(d.attrValues || {}) };
    (d.attrDefinitions || []).forEach((attr) => {
      const raw = rowValue(row, [`属性:${attr.name}`, `attribute:${attr.name}`, attr.name, String(attr.id)]);
      if (raw !== "") values[attr.id] = String(raw).trim();
    });
    d.attrValues = values;
  }

  async function importBatchDrafts(file) {
    if (!window.XLSX) throw new Error("页面未加载 XLSX 解析库");
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });
    if (!rows.length) throw new Error("表格没有可导入的数据行");
    const groups = new Map();
    const singles = [];
    rows.forEach((row) => {
      const parent = String(rowValue(row, ["父货号", "parent_sku", "parent", "group"]) || "").trim();
      if (!parent) {
        const d = draftFromRow(row);
        applyAttributeColumns(d, row);
        singles.push(d);
        return;
      }
      if (!groups.has(parent)) groups.set(parent, { base: draftFromRow({ ...row, 货号: parent, sku: parent }), rows: [] });
      groups.get(parent).rows.push(row);
    });
    const groupedDrafts = [...groups.values()].map((group) => {
      const d = group.base;
      applyAttributeColumns(d, group.rows[0] || {});
      d.variantsEnabled = true;
      d.variants = group.rows.map((row, index) => ({
        offerId: String(rowValue(row, ["货号", "SKU", "sku", "offer_id", "offerId", "code"]) || `${d.code}-${index + 1}`).trim(),
        barcode: String(rowValue(row, ["条码", "barcode"]) || "").trim(),
        price: String(rowValue(row, ["售价", "价格", "price", "Цена"]) || d.price || "").trim(),
        oldPrice: String(rowValue(row, ["折扣前价格", "old_price", "oldPrice"]) || d.oldPrice || "").trim(),
        stock: String(rowValue(row, ["库存", "stock", "qty"]) || d.stockQty || "20").trim(),
        values: rowVariantValues(row),
        attrValues: {},
      }));
      const dimNames = [...new Set(d.variants.flatMap((v) => Object.keys(v.values || {})))];
      d.variantDimensions = dimNames.map((name) => `${name}: ${[...new Set(d.variants.map((v) => v.values?.[name]).filter(Boolean))].join(",")}`).join("\n");
      return d;
    });
    const imported = [...groupedDrafts, ...singles].filter((d) => d.code || d.title);
    drafts = [...imported, ...drafts];
    saveDraft();
    renderDraftList();
    log(`已批量导入 ${imported.length} 个草稿。`);
    return imported.length;
  }

  async function publishSelectedDrafts() {
    if (!selectedDrafts.size) { alert("请先勾选要批量发布的草稿。"); return; }
    const ids = [...selectedDrafts];
    const btn = $("lst_batchPublish");
    if (btn) { btn.disabled = true; btn.textContent = "批量发布中…"; }
    let okCount = 0;
    let failCount = 0;
    for (const id of ids) {
      const d = drafts.find((item) => item.id === id);
      if (!d) continue;
      try {
        const payload = payloadForDraft(d);
        const res = await fetch(API("publish"), {
          method: "POST",
          headers: storeHeadersFor(d.storeIndex, d.platform),
          body: JSON.stringify(payload),
        });
        const data = await readJsonResponse(res);
        if (data.ok) {
          d.publishResult = data;
          d.publishStatus = "pending";
          d.publishError = "";
          d.publishTaskId = data.taskId || "";
          d.productId = data.productId || d.productId || "";
          d.offerId = data.offerId || d.offerId || d.code;
          d.apiStoreIndex = payload.storeIndex;
          d.publishedAt = nowIso();
          okCount += 1;
          log(`批量发布已提交:${d.title || d.code}`);
        } else {
          d.publishStatus = "failed";
          d.publishError = data.error || "未知错误";
          failCount += 1;
          log(`批量发布失败:${d.title || d.code} ${d.publishError}`);
        }
      } catch (e) {
        d.publishStatus = "failed";
        d.publishError = e.message || String(e);
        failCount += 1;
        log(`批量发布异常:${d.title || d.code} ${d.publishError}`);
      }
      saveDraft();
      renderDraftList();
    }
    if (btn) { btn.disabled = false; btn.textContent = "批量发布选中"; }
    alert(`批量发布完成:已提交 ${okCount} 个,失败 ${failCount} 个。`);
  }

  // ---- 草稿持久化 ----
  function persistDraft() {
    const idx = drafts.findIndex((d) => d.id === draft.id);
    if (idx >= 0) drafts[idx] = draft;
    else drafts.unshift(draft);
    saveDraft();
    renderDraftList();
  }

  function renderDraftList() {
    const box = $("lst_draftList");
    if (!box) return;
    const tools = $("lst_draftTools");
    if (!drafts.length) {
      if (tools) tools.hidden = false;
      selectedDrafts.clear();
      box.innerHTML = `<div class="listing-draft-row muted-cell">暂无草稿。</div>`;
      return;
    }
    if (tools) tools.hidden = false;
    // 清理已不存在草稿的选中状态
    selectedDrafts = new Set([...selectedDrafts].filter((id) => drafts.some((d) => d.id === id)));
    const allSel = $("lst_draftSelectAll");
    if (allSel) allSel.checked = selectedDrafts.size === drafts.length;

    const statusBadge = (d) => {
      const st = d.publishStatus || "draft";
      if (st === "pending") return `<span class="listing-status-badge is-pending" title="正在上架,点击检测状态">⏳ 上架中</span>`;
      if (st === "done") return `<span class="listing-status-badge is-done" title="上架成功">✅ 已上架</span>`;
      if (st === "failed") return `<span class="listing-status-badge is-failed" title="${escapeAttr(d.publishError || "上架失败")}">❌ 失败</span>`;
      return `<span class="listing-status-badge is-draft">📝 草稿</span>`;
    };

    box.innerHTML = drafts.map((d) => {
      const checked = selectedDrafts.has(d.id) ? "checked" : "";
      return `<div class="listing-draft-row ${checked ? "is-selected" : ""}">
        <label class="inline-check"><input type="checkbox" data-draft-check="${escapeAttr(d.id)}" ${checked} /></label>
        <span class="listing-draft-info">
          <strong>${escapeHtml(d.platform)}</strong> ·
          ${escapeHtml(d.title || d.model || d.code || "未命名草稿")}
          <small style="color:var(--muted,#94a3b8)"> · ${escapeHtml(d.updatedAt || "")}</small>
          ${statusBadge(d)}
        </span>
        <span class="actions">
          <button class="secondary" type="button" data-draft-load="${escapeAttr(d.id)}">继续</button>
          ${d.publishStatus === "pending" ? `<button class="secondary" type="button" data-draft-check-status="${escapeAttr(d.id)}">检测状态</button>` : ""}
          <button class="danger" type="button" data-draft-del="${escapeAttr(d.id)}">删除</button>
        </span>
      </div>`;
    }).join("");
  }

  function renderAll() {
    fillStep2Form();
    renderCascade();
    renderDraftList();
    goToStep(draft.step || 1);
  }

  // ---- 事件绑定 ----
  function bindEvents() {
    $("lst_platform")?.addEventListener("change", (e) => { draft.platform = e.target.value; draft.storeIndex = 0; refreshStores(); });
    $("lst_storeIndex")?.addEventListener("change", (e) => { draft.storeIndex = Number(e.target.value); autoLoadCategories(); });
    // 类目搜索
    $("lst_catSearch")?.addEventListener("input", (e) => runCatSearch(e.target.value));
    $("lst_catSearchResult")?.addEventListener("click", (e) => {
      const item = e.target.closest("[data-search-id]");
      if (!item) return;
      onSearchResultClick(item.getAttribute("data-search-id"));
    });
    // 点击搜索框外部时收起搜索结果
    document.addEventListener("click", (e) => {
      const wrap = e.target.closest(".listing-cat-search");
      if (!wrap) {
        const box = $("lst_catSearchResult");
        if (box) box.hidden = true;
      }
    });
    $("lst_refreshCat")?.addEventListener("click", async () => {
      // 1. 清本地缓存 2. 清云端 KV 缓存 3. 强制重新抓取
      const cache = loadCatCacheAll();
      if (cache[draft.platform]) { delete cache[draft.platform]; saveCatCacheAll(cache); }
      const btn = $("lst_refreshCat");
      if (btn) btn.disabled = true;
      try {
        await fetch(API(`refresh-cache?platform=${encodeURIComponent(draft.platform)}&storeIndex=${currentApiStoreIndex()}`), {
          headers: storeHeaders(),
        });
      } catch { /* 云端清除失败不阻塞本地重抓 */ }
      await fetchCategories();
      if (btn) btn.disabled = false;
    });

    // 三级级联类目点击(事件委托)
    $("lst_catList")?.addEventListener("click", (e) => {
      const item = e.target.closest("[data-cascade-id]");
      if (!item) return;
      const level = Number(item.getAttribute("data-cascade-level"));
      const id = item.getAttribute("data-cascade-id");
      onCascadeClick(level, id);
    });

    $("lst_toStep2")?.addEventListener("click", () => {
      // 强制校验:必须选到末级类目(无子节点的叶子,且有完整路径 + 数字 id)
      if (!isCategoryFullySelected()) {
        return;   // isCategoryFullySelected 内部已 alert 提示
      }
      readStep2Form();
      goToStep(2);
      log(`已选类目:${draft.categoryFullPath}`);
      // 加载该类目的必填属性(动态表单)
      loadCategoryAttributes();
    });

    // 来源切换
    document.querySelectorAll("#lst_sourceToggle button").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#lst_sourceToggle button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        draft.source = b.dataset.source;
        document.querySelectorAll("[data-source-pane]").forEach((p) => {
          p.hidden = p.dataset.sourcePane !== draft.source;
        });
        if (draft.source === "tray") renderTrayRows();
      });
    });

    // 图片上传
    $("lst_images")?.addEventListener("change", async (e) => {
      const files = [...(e.target.files || [])];
      for (const file of files) {
        if (file.size > 4 * 1024 * 1024) { alert(`${file.name} 超过 4MB,已跳过(请压缩后再传)。`); continue; }
        const dataUrl = await new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.readAsDataURL(file);
        });
        draft.images.push(dataUrl);
      }
      e.target.value = "";
      renderThumbs();
      persistDraft();
    });

    $("lst_thumbRow")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-rm-img]");
      if (!btn) return;
      const i = Number(btn.getAttribute("data-rm-img"));
      draft.images.splice(i, 1);
      renderThumbs();
      persistDraft();
    });

    $("lst_importTemplate")?.addEventListener("click", () => $("lst_templateFile")?.click());
    $("lst_autoFillAttrs")?.addEventListener("click", () => autoFillAttributes());
    $("lst_refreshAttrs")?.addEventListener("click", () => loadCategoryAttributes(true));
    $("lst_templateFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const status = $("lst_attrsStatus");
      if (status) status.textContent = `正在解析模板:${file.name}…`;
      try {
        const template = await parseOzonTemplateFile(file);
        rememberTemplate(template);
        applyTemplateAttributes(template, "已导入模板");
        const kv = await pushTemplateToKv(template);
        if (status) {
          const reqCount = template.attributes.filter((a) => a.isRequired).length;
          status.textContent = `已导入「${template.name}」模板: ${template.attributes.length} 个字段,${reqCount} 个必填。${kv.ok ? "已写入 KV 缓存。" : "已保存本地缓存,KV 暂不可用。"}`;
        }
      } catch (err) {
        if (status) status.textContent = "模板导入失败:" + (err.message || err);
        alert("模板导入失败:" + (err.message || err));
      } finally {
        e.target.value = "";
      }
    });

    $("lst_generateCopy")?.addEventListener("click", generateCopy);
    $("lst_generateImages")?.addEventListener("click", generateImages);
    $("lst_calcPrice")?.addEventListener("click", runGuooPricing);
    $("lst_import1688")?.addEventListener("click", import1688Link);
    $("lst_sourceUrl1688")?.addEventListener("input", (e) => { draft.sourceUrl1688 = e.target.value; persistDraft(); });
    $("lst_addParamRow")?.addEventListener("click", () => {
      readParamRows();
      draft.paramRows = [...(draft.paramRows || []), { name: "", value: "" }];
      renderParamRows();
      persistDraft();
    });
    $("lst_paramRows")?.addEventListener("input", () => {
      readParamRows();
      persistDraft();
    });
    $("lst_paramRows")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-param-remove]");
      if (!btn) return;
      readParamRows();
      draft.paramRows.splice(Number(btn.getAttribute("data-param-remove")), 1);
      if (!draft.paramRows.length) draft.paramRows.push({ name: "", value: "" });
      renderParamRows();
      persistDraft();
    });
    $("lst_variantsEnabled")?.addEventListener("change", (e) => { draft.variantsEnabled = e.target.checked; renderVariantTable(); persistDraft(); });
    $("lst_variantDimensions")?.addEventListener("input", (e) => { draft.variantDimensions = e.target.value; persistDraft(); });
    $("lst_generateVariants")?.addEventListener("click", generateVariantsFromDimensions);
    $("lst_clearVariants")?.addEventListener("click", () => {
      if (!draft.variants?.length || confirm("确认清空当前变体 SKU?")) {
        draft.variants = [];
        renderVariantTable();
        persistDraft();
      }
    });
    $("lst_variantTable")?.addEventListener("input", (e) => {
      const input = e.target.closest("[data-variant-field]");
      if (input) updateVariantFromInput(input);
    });
    $("lst_variantTable")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-variant-delete]");
      if (!btn) return;
      draft.variants.splice(Number(btn.getAttribute("data-variant-delete")), 1);
      renderVariantTable();
      persistDraft();
    });
    $("lst_applyGenImages")?.addEventListener("click", () => {
      const generated = (draft.generatedImages || []).filter(Boolean);
      if (!generated.length) return;
      const existing = new Set(draft.images || []);
      const additions = generated.filter((src) => !existing.has(src));
      draft.images = [...draft.images, ...additions].slice(0, 15);
      renderThumbs();
      persistDraft();
      const status = $("lst_aiStatus");
      if (status) status.textContent = additions.length ? `已将 ${additions.length} 张生成图加入商品图片。` : "这些生成图已在商品图片中。";
    });

    // 货盘选用
    $("lst_trayRows")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tray-pick]");
      if (!btn) return;
      const id = btn.getAttribute("data-tray-pick");
      const tray = readTray();
      const item = tray.find((x) => x.id === id);
      if (!item) return;
      draft.code = item.code || draft.code;
      draft.model = item.name || draft.model;
      draft.brand = item.supplier || draft.brand;
      draft.purchaseCost = item.price || draft.purchaseCost;
      draft.params = item.spec ? `规格:${item.spec}` : draft.params;
      fillStep2Form();
      alert(`已选用货盘「${item.name}」,请补全售价/重量/尺寸/参考图。`);
    });

    $("lst_backTo1")?.addEventListener("click", () => { readStep2Form(); goToStep(1); });
    $("lst_backTo3")?.addEventListener("click", () => { readStep2Form(); goToStep(2); });

    // 第二步 → 第三步(发布):校验必填项
    $("lst_toStep3")?.addEventListener("click", () => {
      readStep2Form();
      if (draft.source === "single") {
        if (!draft.images.length) { alert("请至少上传 1 张商品图片。"); return; }
        if (!draft.code) { alert("请填写货号。"); return; }
        if (!draft.price) { alert("请填写售价。"); return; }
        if (!draft.title) { alert("请填写产品标题。"); return; }
        if (draft.variantsEnabled && !(draft.variants || []).filter((v) => v.offerId).length) { alert("已启用变体,请先生成或填写至少 1 个变体 SKU。"); return; }
      }
      // 校验必填属性
      if (!validateRequiredAttrs()) return;
      draft.attrValues = attrValues;
      persistDraft();
      goToStep(3);
      log("进入发布步骤,请核对店铺与货号。");
    });

    $("lst_publish")?.addEventListener("click", runPublish);
    $("lst_preflight")?.addEventListener("click", runPreflight);
    $("lst_pollStatus")?.addEventListener("click", () => pollCurrentStatus());
    $("lst_auditProduct")?.addEventListener("click", auditCurrentProduct);
    $("lst_loadWarehouses")?.addEventListener("click", loadWarehouses);
    $("lst_setStock")?.addEventListener("click", setStock);
    $("lst_stockWarehouse")?.addEventListener("change", (e) => { draft.stockWarehouseId = e.target.value; persistDraft(); });
    $("lst_stockQty")?.addEventListener("input", (e) => { draft.stockQty = e.target.value; persistDraft(); });
    $("lst_newDraft")?.addEventListener("click", () => {
      persistDraft();
      draft = emptyDraft();
      categoryCache = [];
      renderAll();
      refreshStores();
      log("已新建草稿。");
    });

    // 草稿列表:勾选 + 加载 + 删除 + 检测状态
    $("lst_draftList")?.addEventListener("click", (e) => {
      const load = e.target.closest("[data-draft-load]");
      const del = e.target.closest("[data-draft-del]");
      const checkStatus = e.target.closest("[data-draft-check-status]");
      if (load) {
        const id = load.getAttribute("data-draft-load");
        const d = drafts.find((x) => x.id === id);
        if (d) { draft = JSON.parse(JSON.stringify(d)); renderAll(); refreshStores(); }
      } else if (del) {
        const id = del.getAttribute("data-draft-del");
        if (confirm("确认删除该草稿?")) {
          drafts = drafts.filter((x) => x.id !== id);
          selectedDrafts.delete(id);
          saveDraft();
          renderDraftList();
        }
      } else if (checkStatus) {
        const id = checkStatus.getAttribute("data-draft-check-status");
        checkPublishStatus(id);
      }
    });
    // 勾选框变化(用 change 事件,避免点按钮时误触)
    $("lst_draftList")?.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-draft-check]");
      if (!cb) return;
      const id = cb.getAttribute("data-draft-check");
      if (cb.checked) selectedDrafts.add(id);
      else selectedDrafts.delete(id);
      renderDraftList();
    });
    // 全选
    $("lst_draftSelectAll")?.addEventListener("change", (e) => {
      if (e.target.checked) drafts.forEach((d) => selectedDrafts.add(d.id));
      else selectedDrafts.clear();
      renderDraftList();
    });
    // 删除选中
    $("lst_draftDelSelected")?.addEventListener("click", () => {
      if (!selectedDrafts.size) { alert("请先勾选要删除的草稿。"); return; }
      if (!confirm(`确认删除选中的 ${selectedDrafts.size} 个草稿?`)) return;
      const ids = new Set(selectedDrafts);
      drafts = drafts.filter((x) => !ids.has(x.id));
      selectedDrafts.clear();
      saveDraft();
      renderDraftList();
      log(`已删除 ${ids.size} 个草稿。`);
    });
    $("lst_batchImport")?.addEventListener("click", () => $("lst_batchFile")?.click());
    $("lst_batchFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const count = await importBatchDrafts(file);
        alert(`已导入 ${count} 个上架草稿。`);
      } catch (err) {
        alert("批量导入失败:" + (err.message || err));
      } finally {
        e.target.value = "";
      }
    });
    $("lst_batchPublish")?.addEventListener("click", publishSelectedDrafts);
    // 取消选择
    $("lst_draftClearSel")?.addEventListener("click", () => {
      selectedDrafts.clear();
      renderDraftList();
    });

    // 文案和补充信息实时回写
    ["lst_title", "lst_description", "lst_tags", "lst_params", "lst_sellingPoints", "lst_purchaseCost", "lst_targetGrossRate", "lst_commissionRate", "lst_exchangeRate"].forEach((id) => {
      $(id)?.addEventListener("input", () => {
        if (id === "lst_title") draft.title = $(id).value;
        if (id === "lst_description") draft.description = $(id).value;
        if (id === "lst_tags") draft.tags = $(id).value;
        if (id === "lst_params") draft.params = $(id).value;
        if (id === "lst_sellingPoints") draft.sellingPoints = $(id).value;
        if (id === "lst_purchaseCost") draft.purchaseCost = $(id).value;
        if (id === "lst_targetGrossRate") draft.targetGrossRate = $(id).value;
        if (id === "lst_commissionRate") draft.commissionRate = $(id).value;
        if (id === "lst_exchangeRate") draft.exchangeRate = $(id).value;
        persistDraft();
      });
    });
  }

  // ---- 启动 ----
  function init() {
    injectStyles();
    injectShell();
    bindEvents();
    renderAll();
    refreshStores();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
