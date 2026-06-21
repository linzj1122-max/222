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
  const STORE_KEY = "ozon_wb_api_configs_v1";
  const TAB_ID = "listing";
  const TAB_LABEL = "🚀 商品上架";

  const API = (sub) => `/api/listing/${sub}`;

  // 读取「店铺设置」里手动添加的店铺(localStorage),结构与 main.js 一致
  function readLocalStores() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]") || []; }
    catch { return []; }
  }
  // 当前选中的店铺对象(含凭证),供请求后端时塞进 header
  function currentStoreCreds() {
    const platform = draft.platform;
    const idx = Number(draft.storeIndex || 0);
    const list = readLocalStores().filter((s) => normalizePlatform(s.platform) === platform);
    const store = list[idx] || list[0] || null;
    if (!store) return null;
    return {
      name: store.name || "",
      platform,
      clientId: store.clientId || "",
      secret: store.secret || store.apiKey || store.token || "",
    };
  }
  const normalizePlatform = (v) => (String(v || "").toLowerCase() === "wb" ? "WB" : "Ozon");
  // 构造带店铺凭证的请求头(localStorage 店铺走 header;环境变量店铺走 storeIndex)
  function storeHeaders(extra = {}) {
    const creds = currentStoreCreds();
    const h = { "content-type": "application/json", ...extra };
    if (creds && creds.clientId && creds.secret) {
      h["x-store-platform"] = creds.platform;
      h["x-store-name"] = creds.name;
      h["x-store-client-id"] = creds.clientId;
      h["x-store-secret"] = creds.secret;
    }
    return h;
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

  // ---- 草稿状态 ----
  const emptyDraft = () => ({
    id: uid(),
    updatedAt: nowIso(),
    step: 1,
    platform: "Ozon",
    storeIndex: 0,
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
    price: "",
    oldPrice: "",
    weight: "",   // g
    length: "",   // mm
    width: "",
    height: "",
    params: "",
    sellingPoints: "",
    images: [],   // dataURL 数组（参考图/单图）
    // 第三步产出
    generatedImages: [],
    title: "",
    description: "",
    tags: "",
    // 发布
    publishResult: null,
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
      btn.innerHTML = `<span>${TAB_LABEL}</span>`;
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

        <div data-source-pane="single">
          <div class="cols-3">
            <label>货号<input id="lst_code" type="text" placeholder="例如 HS" /></label>
            <label>品牌<input id="lst_brand" type="text" placeholder="例如 Baseus" /></label>
            <label>型号名称<input id="lst_model" type="text" placeholder="例如 PPALL20000" /></label>
          </div>
          <div class="cols-3">
            <label>售价 RUB<input id="lst_price" type="number" step="0.01" min="0" placeholder="例如 1890" /></label>
            <label>折扣前价格 RUB<input id="lst_oldPrice" type="number" step="0.01" min="0" placeholder="例如 2590" /></label>
            <label>重量 g<input id="lst_weight" type="number" step="1" min="0" placeholder="例如 210" /></label>
          </div>
          <div class="cols-3">
            <label>长 mm<input id="lst_length" type="number" step="0.1" min="0" placeholder="68.5" /></label>
            <label>宽 mm<input id="lst_width" type="number" step="0.1" min="0" placeholder="68.5" /></label>
            <label>高 mm<input id="lst_height" type="number" step="0.1" min="0" placeholder="144" /></label>
          </div>
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

        <label>商品图片(至少 1 张,建议 3:4 竖图,最多 15 张,第一张为首图)<input id="lst_images" type="file" accept="image/*" multiple /></label>
        <div class="listing-thumb-row" id="lst_thumbRow"></div>

        <label>产品标题(俄文)<textarea id="lst_title" rows="2" placeholder="Ozon 标题,建议 60~110 字符"></textarea></label>
        <label>产品描述(俄文)<textarea id="lst_description" rows="6" placeholder="产品描述,卖点分点列出"></textarea></label>
        <label>搜索标签(<strong>每行一个</strong>,每个标签 ≤ 30 字符,最多 20 个)<textarea id="lst_tags" rows="4" placeholder="每行输入一个标签,例如:&#10;массажер&#10;для шеи"></textarea></label>
        <div id="lst_tagHint" class="table-status">提示:Ozon 要求每个标签单独一行,单个标签不超过 30 个字符(含 #)。</div>

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
    if (draft.step === 2) renderTrayRows();
    if (draft.step === 3) {
      $("lst_pubStore") && ($("lst_pubStore").value = String(draft.storeIndex));
      $("lst_pubOfferId") && ($("lst_pubOfferId").value = draft.code || draft.offerId || "");
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

  // ---- 渲染:平台/店铺下拉(从「店铺设置」localStorage 读取) ----
  function refreshStores() {
    const platform = draft.platform;
    const all = readLocalStores().filter((s) => normalizePlatform(s.platform) === platform);
    const options = all.length
      ? all.map((s, i) => `<option value="${i}">${escapeHtml(s.name || `${platform} 店铺 ${i + 1}`)}</option>`).join("")
      : `<option value="0">(未添加${platform}店铺,请到「店铺设置」添加)</option>`;
    const sel = $("lst_storeIndex");
    const pubSel = $("lst_pubStore");
    if (sel) { sel.innerHTML = options; sel.value = String(Math.min(draft.storeIndex || 0, Math.max(all.length - 1, 0))); }
    if (pubSel) { pubSel.innerHTML = options; }
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
    const c = currentStoreCreds();
    return c ? `${c.platform}|${c.clientId}` : draft.platform;
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
    const storeIndex = Number(draft.storeIndex || 0);
    if (status) status.textContent = `正在从 ${platform} 抓取类目并翻译为中文…`;
    catLoading = true;
    try {
      const res = await fetch(
        API(`categories?platform=${encodeURIComponent(platform)}&storeIndex=${storeIndex}`),
        { headers: storeHeaders() }
      );
      const data = await res.json();
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
      draft.categoryId = leaf.origId || node.id;
      draft.categoryName = node.name;
      draft.categoryNameZh = node.name;
      draft.categoryFullPath = leaf.fullPath || node.name;   // Ozon 可接受的完整类目名,如 日化/空气清新剂/空气清新剂
      draft.typeId = leaf.typeId || 0;
      draft.descriptionCategoryId = leaf.categoryId || 0;
    } else {
      draft.categoryId = "";   // 中间节点不能上架,清空
      draft.categoryFullPath = "";
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
    draft.categoryId = leaf.origId || node.id;
    draft.categoryName = node.name;
    draft.categoryNameZh = node.name;
    draft.categoryFullPath = leaf.fullPath;
    draft.typeId = leaf.typeId || 0;
    draft.descriptionCategoryId = leaf.categoryId || 0;
    return true;
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
      draft.categoryId = leaf.origId || node.id;
      draft.categoryName = node.name;
      draft.categoryNameZh = node.name;
      draft.categoryFullPath = leaf.fullPath || node.name;
      draft.typeId = leaf.typeId || 0;
      draft.descriptionCategoryId = leaf.categoryId || 0;
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
    const fields = ["code", "brand", "model", "price", "oldPrice", "weight", "length", "width", "height"];
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
  }

  function fillStep2Form() {
    ["code", "brand", "model", "price", "oldPrice", "weight", "length", "width", "height"].forEach((k) => {
      const el = $(`lst_${k}`);
      if (el) el.value = draft[k] ?? "";
    });
    $("lst_title") && ($("lst_title").value = draft.title || "");
    $("lst_description") && ($("lst_description").value = draft.description || "");
    $("lst_tags") && ($("lst_tags").value = draft.tags || "");
    const platformSel = $("lst_platform");
    if (platformSel) platformSel.value = draft.platform;
    const storeSel = $("lst_storeIndex");
    if (storeSel) storeSel.value = String(draft.storeIndex);
    renderThumbs();
  }

  // ---- 第三步:发布 ----
  async function runPublish() {
    readStep2Form();
    const offerId = $("lst_pubOfferId")?.value || draft.code;
    const storeIndex = Number($("lst_pubStore")?.value || 0);
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
        body: JSON.stringify({
          platform: draft.platform,
          storeIndex,
          draft: {
            title: draft.title,
            description: draft.description,
            offerId,
            code: draft.code,
            brand: draft.brand,
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
            images,
          },
        }),
      });
      const data = await res.json();
      draft.publishResult = data;
      if (data.ok) {
        // 标记为上架中(Ozon 异步任务,需稍后检测)
        draft.publishStatus = "pending";
        draft.publishError = "";
        draft.publishTaskId = data.taskId || "";
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
      const res = await fetch(API(`publish-status?taskId=${encodeURIComponent(d.publishTaskId || "")}&offerId=${encodeURIComponent(d.code || "")}&storeIndex=${d.storeIndex || 0}&platform=${encodeURIComponent(d.platform || "Ozon")}`), {
        headers: storeHeaders(),
      });
      const data = await res.json();
      if (data.ok) {
        d.publishStatus = data.status || "pending";
        d.publishError = data.error || "";
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
      }
      saveDraft();
      renderDraftList();
    }
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
      if (tools) tools.hidden = true;
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
        await fetch(API(`refresh-cache?platform=${encodeURIComponent(draft.platform)}&storeIndex=${draft.storeIndex || 0}`), {
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
      }
      persistDraft();
      goToStep(3);
      log("进入发布步骤,请核对店铺与货号。");
    });

    $("lst_publish")?.addEventListener("click", runPublish);
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
    // 取消选择
    $("lst_draftClearSel")?.addEventListener("click", () => {
      selectedDrafts.clear();
      renderDraftList();
    });

    // 第三步字段实时回写
    ["lst_title", "lst_description", "lst_tags"].forEach((id) => {
      $(id)?.addEventListener("input", () => {
        if (id === "lst_title") draft.title = $(id).value;
        if (id === "lst_description") draft.description = $(id).value;
        if (id === "lst_tags") draft.tags = $(id).value;
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
    // 跨页签实时同步:其他标签页(如「店铺设置」)改动店铺后,本页下拉立即更新
    window.addEventListener("storage", (e) => {
      if (e.key === STORE_KEY) refreshStores();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
