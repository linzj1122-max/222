/* =========================================================
 *  OZON 活动报名模块（Promotions）
 *  ---------------------------------------------------------
 *  独立自包含模块：
 *    - 自行注入导航按钮和页面 DOM；
 *    - 调用 /api/promotions/*，不在前端保存店铺密钥；
 *    - 支持活动列表、候选商品、Excel/CSV 匹配、批量报名/取消。
 * ========================================================= */
(function () {
  "use strict";

  const TAB_ID = "promotions";
  const API = (sub) => `/api/promotions/${sub}`;
  const STORAGE_KEY = "ozon_wb_promotions_state_v1";

  const $ = (id) => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const escapeHtml = (v) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const amount = (v) => {
    const n = Number(String(v ?? "").replace(/\s+/g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const rub = (v) => `₽${Number(v || 0).toFixed(2)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const norm = (v) => String(v ?? "").replace(/\s+/g, "").toLowerCase();

  let stores = [];
  let actions = [];
  let products = [];
  let selectedProducts = new Set();
  let importedMap = new Map();
  let state = {};
  let bootstrapped = false;
  let bootstrapping = false;

  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch { state = {}; }

  function saveState() {
    const keep = {
      storeIndex: $("promoStore")?.value || "0",
      actionId: $("promoAction")?.value || "",
      includeActive: $("promoIncludeActive")?.checked || false,
      query: $("promoSearch")?.value || "",
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keep)); } catch {}
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {
      throw new Error(`接口返回非 JSON：${response.status} ${text.slice(0, 160)}`);
    }
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || data.message || `API 请求失败：${response.status}`);
    }
    return data;
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    return readJsonResponse(response);
  }

  function setStatus(message, tone = "") {
    const el = $("promoStatus");
    if (!el) return;
    el.textContent = message || "";
    el.className = `table-status ${tone}`.trim();
  }

  function setResult(message, ok = true) {
    const el = $("promoResult");
    if (!el) return;
    el.hidden = !message;
    el.className = "api-verify-status " + (ok ? "ok" : "fail");
    el.textContent = message || "";
  }

  function authLocked() {
    return document.body.classList.contains("auth-locked");
  }

  async function ensureReady() {
    if (bootstrapped || bootstrapping) return;
    if (authLocked()) {
      setStatus("登录完成后会加载 OZON 活动；也可以进入本模块后点击「刷新活动」。");
      return;
    }
    bootstrapping = true;
    try {
      await loadStores();
      await loadActions();
      bootstrapped = true;
    } finally {
      bootstrapping = false;
    }
  }

  function injectShell() {
    const nav = document.querySelector("aside nav");
    if (nav && !document.querySelector(`[data-tab="${TAB_ID}"]`)) {
      const btn = document.createElement("button");
      btn.className = "tab-btn";
      btn.dataset.tab = TAB_ID;
      btn.type = "button";
      btn.innerHTML = `<span>🏷️</span>活动报名`;
      const adsBtn = nav.querySelector('[data-tab="ads"]') || nav.querySelector('[data-tab="settings"]');
      if (adsBtn) nav.insertBefore(btn, adsBtn);
      else nav.appendChild(btn);
      btn.addEventListener("click", () => activateTab(TAB_ID));
    }

    const main = document.querySelector("main");
    if (main && !$(TAB_ID)) {
      const section = document.createElement("section");
      section.className = "tab";
      section.id = TAB_ID;
      section.innerHTML = shellHtml();
      main.appendChild(section);
    }
  }

  function shellHtml() {
    return `
      <section class="dashboard-brief">
        <div>
          <h2>OZON 活动报名</h2>
          <p>按店铺拉取 OZON 可报名活动，筛选候选商品后批量提交活动价。</p>
        </div>
        <span class="live-chip"><span></span>Seller API</span>
      </section>

      <section class="panel promo-control-panel">
        <div class="toolbar">
          <div>
            <h3>活动与店铺</h3>
            <p class="section-note">先选择店铺并刷新活动，再进入具体活动查看可报名商品。</p>
          </div>
          <div class="promo-controls">
            <label class="inline-select">店铺
              <select id="promoStore"></select>
            </label>
            <label class="inline-select">活动
              <select id="promoAction"></select>
            </label>
            <label class="inline-check"><input id="promoIncludeActive" type="checkbox" /> 包含已报名商品</label>
            <button class="secondary" id="promoReloadActions" type="button">刷新活动</button>
            <button class="primary" id="promoLoadProducts" type="button">加载商品</button>
          </div>
        </div>
        <div id="promoStatus" class="table-status">正在初始化模块...</div>
        <div id="promoResult" class="api-verify-status" hidden></div>
      </section>

      <div class="grid split promo-grid">
        <section class="panel">
          <div class="toolbar">
            <h3>可报名活动</h3>
            <span class="status" id="promoActionCount">0 个活动</span>
          </div>
          <div class="table-wrap promo-actions-wrap">
            <table>
              <thead><tr><th>活动</th><th>时间</th><th>状态</th><th>操作</th></tr></thead>
              <tbody id="promoActionRows"></tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="toolbar">
            <h3>候选商品</h3>
            <input class="search" id="promoSearch" placeholder="搜索 Product ID / Offer ID / SKU / 商品名" />
          </div>
          <div class="promo-bulkbar">
            <label class="inline-select">活动价
              <input id="promoBulkPrice" type="number" step="0.01" min="0" placeholder="批量填入" />
            </label>
            <label class="inline-select">库存
              <input id="promoBulkStock" type="number" step="1" min="0" placeholder="可选" />
            </label>
            <button class="secondary" id="promoApplyBulkPrice" type="button">填入选中</button>
            <button class="secondary" id="promoImportFileBtn" type="button">导入报名表</button>
            <button class="secondary" id="promoTemplateBtn" type="button">下载模板</button>
            <button class="primary" id="promoActivateBtn" type="button">批量报名</button>
            <button class="danger" id="promoDeactivateBtn" type="button">取消报名</button>
            <input id="promoImportFile" type="file" accept=".xlsx,.xls,.csv" hidden />
          </div>
          <div class="table-status" id="promoProductSummary">请选择活动并加载候选商品。</div>
          <div class="table-wrap promo-products-wrap">
            <table>
              <thead>
                <tr>
                  <th><input id="promoSelectAll" type="checkbox" /></th>
                  <th>商品</th>
                  <th>当前价</th>
                  <th>已报名价</th>
                  <th>活动价</th>
                  <th>建议/上限</th>
                  <th>库存</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody id="promoProductRows"></tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  function activateTab(id) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelector(`[data-tab="${id}"]`)?.classList.add("active");
    $(id)?.classList.add("active");
    if ($("pageTitle")) $("pageTitle").textContent = "活动报名";
    renderActions();
    renderProducts();
    ensureReady().catch((error) => setStatus(error.message || String(error), "fail"));
  }

  function selectedStoreIndex() {
    return Number($("promoStore")?.value || 0);
  }

  function selectedActionId() {
    return String($("promoAction")?.value || "");
  }

  function currentAction() {
    const id = selectedActionId();
    return actions.find((item) => String(item.id) === id) || null;
  }

  function renderStores() {
    const select = $("promoStore");
    if (!select) return;
    const current = String(state.storeIndex ?? select.value ?? "0");
    select.innerHTML = stores.length
      ? stores.map((store) => `<option value="${Number(store.index || 0)}">${escapeHtml(store.name || `Ozon 店铺 ${Number(store.index || 0) + 1}`)}</option>`).join("")
      : `<option value="0">未配置 OZON 店铺</option>`;
    if (stores.some((store) => String(store.index || 0) === current)) select.value = current;
  }

  function renderActionSelect() {
    const select = $("promoAction");
    if (!select) return;
    const current = state.actionId || select.value || "";
    select.innerHTML = actions.length
      ? actions.map((action) => `<option value="${escapeHtml(action.id)}">${escapeHtml(action.title || `活动 ${action.id}`)}</option>`).join("")
      : `<option value="">暂无活动</option>`;
    if (actions.some((action) => String(action.id) === String(current))) select.value = current;
  }

  function actionDateText(action) {
    const from = String(action.dateStart || action.date_start || "").slice(0, 10);
    const to = String(action.dateEnd || action.date_end || "").slice(0, 10);
    if (from || to) return `${from || "?"} - ${to || "?"}`;
    return "未返回时间";
  }

  function renderActions() {
    renderActionSelect();
    const body = $("promoActionRows");
    if (!body) return;
    if ($("promoActionCount")) $("promoActionCount").textContent = `${actions.length} 个活动`;
    if (!actions.length) {
      body.innerHTML = `<tr><td colspan="4" class="muted-cell">暂无活动。请选择店铺后点击「刷新活动」。</td></tr>`;
      return;
    }
    body.innerHTML = actions.map((action) => {
      const active = String(action.id) === selectedActionId();
      return `
        <tr class="${active ? "promo-action-active" : ""}">
          <td><strong>${escapeHtml(action.title || `活动 ${action.id}`)}</strong><div class="sku">ID: ${escapeHtml(action.id)}</div></td>
          <td>${escapeHtml(actionDateText(action))}</td>
          <td><span class="scope-chip">${escapeHtml(action.status || action.type || "可查看")}</span></td>
          <td><button class="${active ? "primary" : "secondary"}" type="button" data-promo-pick="${escapeHtml(action.id)}">选择</button></td>
        </tr>`;
    }).join("");
  }

  function productKey(row) {
    return String(row.productId || row.product_id || row.id || row.offerId || row.offer_id || row.sku || "");
  }

  function productSearchText(row) {
    return [row.productId, row.offerId, row.sku, row.name, row.title]
      .map((v) => String(v || ""))
      .join(" ")
      .toLowerCase();
  }

  function filteredProducts() {
    const q = String($("promoSearch")?.value || "").trim().toLowerCase();
    if (!q) return products;
    return products.filter((row) => productSearchText(row).includes(q));
  }

  function productDefaultPrice(row) {
    return amount(importedMap.get(productKey(row))?.actionPrice || row.actionPrice || row.maxActionPrice || row.currentPrice || row.price);
  }

  function productEnrolledPrice(row) {
    return amount(row.enrolledActionPrice || row.enrolled_action_price || (row.participating ? row.actionPrice : 0));
  }

  function renderProducts() {
    const body = $("promoProductRows");
    if (!body) return;
    const rows = filteredProducts();
    const selectedVisible = rows.filter((row) => selectedProducts.has(productKey(row))).length;
    const allBox = $("promoSelectAll");
    if (allBox) {
      allBox.checked = rows.length > 0 && selectedVisible === rows.length;
      allBox.indeterminate = selectedVisible > 0 && selectedVisible < rows.length;
    }
    if ($("promoProductSummary")) {
      $("promoProductSummary").textContent = products.length
        ? `已加载 ${products.length} 个商品，显示 ${rows.length} 个，已选 ${selectedProducts.size} 个。`
        : "请选择活动并加载候选商品。";
    }
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8" class="muted-cell">没有匹配的商品。</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((row) => {
      const key = productKey(row);
      const checked = selectedProducts.has(key) ? "checked" : "";
      const imported = importedMap.get(key);
      const title = row.name || row.title || row.offerId || row.sku || `Product ${row.productId}`;
      const hint = [row.offerId ? `Offer: ${row.offerId}` : "", row.sku ? `SKU: ${row.sku}` : "", row.productId ? `Product: ${row.productId}` : ""].filter(Boolean).join(" · ");
      const suggestion = [row.minActionPrice ? `最低 ${rub(row.minActionPrice)}` : "", row.maxActionPrice ? `上限 ${rub(row.maxActionPrice)}` : ""].filter(Boolean).join(" / ") || "—";
      const enrolledPrice = productEnrolledPrice(row);
      return `
        <tr>
          <td><input class="promo-row-check" type="checkbox" value="${escapeHtml(key)}" ${checked} /></td>
          <td><strong>${escapeHtml(title)}</strong><div class="sku">${escapeHtml(hint || key)}</div></td>
          <td class="money">${row.currentPrice || row.price ? rub(row.currentPrice || row.price) : "—"}</td>
          <td class="money">${enrolledPrice ? rub(enrolledPrice) : (row.participating ? "待返回" : "—")}</td>
          <td><input class="promo-price-input" data-promo-price="${escapeHtml(key)}" type="number" step="0.01" min="0" value="${productDefaultPrice(row) || ""}" placeholder="必填" /></td>
          <td>${escapeHtml(suggestion)}</td>
          <td><input class="promo-stock-input" data-promo-stock="${escapeHtml(key)}" type="number" step="1" min="0" value="${amount(imported?.stock || row.stock || "") || ""}" placeholder="可选" /></td>
          <td><span class="scope-chip">${escapeHtml(imported ? "已导入" : (row.status || row.participating ? "已报名" : "候选"))}</span></td>
        </tr>`;
    }).join("");
  }

  async function loadStores() {
    setStatus("正在读取 OZON 店铺...");
    const data = await apiRequest(API("stores"));
    stores = (data.stores || []).filter((store) => String(store.platform || "Ozon").toLowerCase() === "ozon");
    renderStores();
    if (!stores.length) {
      setStatus("未找到已配置的 OZON 店铺，请先到「店铺设置」添加。", "fail");
      return;
    }
    setStatus("店铺已加载，请刷新活动。");
  }

  async function loadActions() {
    if (!stores.length) await loadStores();
    if (!stores.length) return;
    saveState();
    setResult("");
    setStatus("正在从 OZON 拉取活动列表...");
    const data = await apiRequest(`${API("actions")}?storeIndex=${selectedStoreIndex()}`);
    actions = data.actions || [];
    if (!actions.some((action) => String(action.id) === String(state.actionId))) state.actionId = actions[0]?.id || "";
    renderActions();
    bootstrapped = true;
    const note = data.diagnostics?.shape ? `（返回结构：${data.diagnostics.shape}）` : "";
    setStatus(actions.length ? `已加载 ${actions.length} 个活动。${note}` : `OZON 当前没有返回可报名活动。${note}`);
  }

  async function loadProducts() {
    const actionId = selectedActionId();
    if (!actionId) {
      setStatus("请先选择一个活动。", "fail");
      return;
    }
    saveState();
    selectedProducts = new Set();
    importedMap = new Map();
    renderProducts();
    const includeActive = $("promoIncludeActive")?.checked ? "1" : "0";
    setStatus(`正在加载活动「${currentAction()?.title || actionId}」的候选商品...`);
    const data = await apiRequest(`${API("candidates")}?storeIndex=${selectedStoreIndex()}&actionId=${encodeURIComponent(actionId)}&includeActive=${includeActive}`);
    products = data.products || [];
    renderProducts();
    setStatus(products.length ? `已加载 ${products.length} 个商品。` : "该活动没有返回候选商品，或店铺暂无可报名商品。");
  }

  function selectedPayload() {
    const rows = products.filter((row) => selectedProducts.has(productKey(row)));
    return rows.map((row) => {
      const key = productKey(row);
      const price = amount(document.querySelector(`[data-promo-price="${CSS.escape(key)}"]`)?.value);
      const stock = amount(document.querySelector(`[data-promo-stock="${CSS.escape(key)}"]`)?.value);
      return {
        product_id: Number(row.productId || row.product_id || row.id || 0),
        offer_id: row.offerId || row.offer_id || "",
        action_price: price,
        stock: stock > 0 ? Math.round(stock) : undefined,
      };
    }).filter((row) => row.product_id && row.action_price > 0);
  }

  async function activateSelected() {
    const actionId = selectedActionId();
    const payload = selectedPayload();
    if (!actionId) return setStatus("请先选择活动。", "fail");
    if (!payload.length) return setStatus("请勾选商品，并填写大于 0 的活动价。", "fail");
    if (!confirm(`确认将 ${payload.length} 个商品报名到当前 OZON 活动？`)) return;
    setStatus(`正在提交 ${payload.length} 个商品报名...`);
    const data = await apiRequest(API("activate"), {
      method: "POST",
      body: JSON.stringify({ storeIndex: selectedStoreIndex(), actionId, products: payload }),
    });
    const okCount = data.successCount ?? data.successProductIds?.length ?? 0;
    const failCount = data.errorCount ?? data.errors?.length ?? 0;
    setResult(`报名完成：成功 ${okCount} 个，失败 ${failCount} 个。`, failCount === 0);
    if (okCount > 0) {
      const includeActive = $("promoIncludeActive");
      if (includeActive) includeActive.checked = true;
      setStatus("报名完成，正在重新加载已报名商品和活动价...");
      await loadProducts();
      setResult(`报名完成：成功 ${okCount} 个，失败 ${failCount} 个。已刷新已报名价。`, failCount === 0);
    } else {
      setStatus("提交完成，可重新加载商品核对活动状态。");
    }
  }

  async function deactivateSelected() {
    const actionId = selectedActionId();
    const productIds = products
      .filter((row) => selectedProducts.has(productKey(row)))
      .map((row) => Number(row.productId || row.product_id || row.id || 0))
      .filter(Boolean);
    if (!actionId) return setStatus("请先选择活动。", "fail");
    if (!productIds.length) return setStatus("请先勾选要取消报名的商品。", "fail");
    if (!confirm(`确认取消 ${productIds.length} 个商品的活动报名？`)) return;
    setStatus(`正在取消 ${productIds.length} 个商品报名...`);
    const data = await apiRequest(API("deactivate"), {
      method: "POST",
      body: JSON.stringify({ storeIndex: selectedStoreIndex(), actionId, productIds }),
    });
    const okCount = data.successCount ?? data.successProductIds?.length ?? 0;
    const failCount = data.errorCount ?? data.errors?.length ?? 0;
    setResult(`取消完成：成功 ${okCount} 个，失败 ${failCount} 个。`, failCount === 0);
    setStatus("取消请求已提交，可重新加载商品核对活动状态。");
  }

  function applyBulkPrice() {
    const price = amount($("promoBulkPrice")?.value);
    const stock = amount($("promoBulkStock")?.value);
    if (!selectedProducts.size) return setStatus("请先勾选商品。", "fail");
    if (price <= 0 && stock <= 0) return setStatus("请填写活动价或库存。", "fail");
    selectedProducts.forEach((key) => {
      if (price > 0) {
        const input = document.querySelector(`[data-promo-price="${CSS.escape(key)}"]`);
        if (input) input.value = price;
      }
      if (stock > 0) {
        const input = document.querySelector(`[data-promo-stock="${CSS.escape(key)}"]`);
        if (input) input.value = Math.round(stock);
      }
    });
    setStatus(`已填入 ${selectedProducts.size} 个选中商品。`);
  }

  function downloadTemplate() {
    const csv = "\uFEFFproduct_id,offer_id,sku,action_price,stock\n123456789,ABC-001,,999,20\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ozon活动报名模板_${today()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function parseImport(file) {
    if (!window.XLSX) throw new Error("Excel 解析组件未加载，请刷新页面后重试。");
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const headerIndex = rows.findIndex((row) => row.some((cell) => /product|offer|sku|活动价|价格|库存/i.test(String(cell))));
    if (headerIndex < 0) throw new Error("未识别到表头，请使用模板列名 product_id / offer_id / sku / action_price / stock。");
    const headers = rows[headerIndex].map(norm);
    const aliases = {
      productId: ["product_id", "productid", "商品id", "产品id"],
      offerId: ["offer_id", "offerid", "货号", "offer"],
      sku: ["sku"],
      actionPrice: ["action_price", "活动价", "报名价", "价格", "price"],
      stock: ["stock", "库存", "数量"],
    };
    const idx = (keys) => headers.findIndex((h) => keys.map(norm).includes(h));
    const pos = Object.fromEntries(Object.entries(aliases).map(([key, keys]) => [key, idx(keys)]));
    const out = [];
    rows.slice(headerIndex + 1).forEach((row) => {
      const item = {
        id: uid(),
        productId: pos.productId >= 0 ? String(row[pos.productId]).trim() : "",
        offerId: pos.offerId >= 0 ? String(row[pos.offerId]).trim() : "",
        sku: pos.sku >= 0 ? String(row[pos.sku]).trim() : "",
        actionPrice: pos.actionPrice >= 0 ? amount(row[pos.actionPrice]) : 0,
        stock: pos.stock >= 0 ? amount(row[pos.stock]) : 0,
      };
      if (item.productId || item.offerId || item.sku) out.push(item);
    });
    return out;
  }

  function importKeyMatches(row, imported) {
    const keys = [row.productId, row.offerId, row.sku].map((v) => String(v || "").trim()).filter(Boolean);
    const importedKeys = [imported.productId, imported.offerId, imported.sku].map((v) => String(v || "").trim()).filter(Boolean);
    return keys.some((key) => importedKeys.includes(key));
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseImport(file);
      let matched = 0;
      rows.forEach((item) => {
        const row = products.find((product) => importKeyMatches(product, item));
        if (!row) return;
        const key = productKey(row);
        importedMap.set(key, item);
        selectedProducts.add(key);
        matched += 1;
      });
      renderProducts();
      setStatus(`导入完成：读取 ${rows.length} 行，匹配当前商品 ${matched} 行。`);
    } catch (error) {
      setStatus("导入失败：" + (error.message || error), "fail");
      alert("导入失败：" + (error.message || error));
    } finally {
      event.target.value = "";
    }
  }

  function bindEvents() {
    $("promoStore")?.addEventListener("change", () => {
      actions = [];
      products = [];
      selectedProducts = new Set();
      bootstrapped = false;
      saveState();
      renderActions();
      renderProducts();
    });
    $("promoAction")?.addEventListener("change", () => {
      products = [];
      selectedProducts = new Set();
      saveState();
      renderActions();
      renderProducts();
    });
    $("promoIncludeActive")?.addEventListener("change", saveState);
    $("promoReloadActions")?.addEventListener("click", () => loadActions().catch((e) => setStatus(e.message || String(e), "fail")));
    $("promoLoadProducts")?.addEventListener("click", () => loadProducts().catch((e) => setStatus(e.message || String(e), "fail")));
    $("promoSearch")?.addEventListener("input", () => { saveState(); renderProducts(); });
    $("promoActionRows")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-promo-pick]");
      if (!btn) return;
      $("promoAction").value = btn.getAttribute("data-promo-pick") || "";
      products = [];
      selectedProducts = new Set();
      saveState();
      renderActions();
      renderProducts();
    });
    $("promoSelectAll")?.addEventListener("change", (event) => {
      filteredProducts().forEach((row) => {
        const key = productKey(row);
        if (event.target.checked) selectedProducts.add(key);
        else selectedProducts.delete(key);
      });
      renderProducts();
    });
    $("promoProductRows")?.addEventListener("change", (event) => {
      const input = event.target.closest(".promo-row-check");
      if (!input) return;
      if (input.checked) selectedProducts.add(input.value);
      else selectedProducts.delete(input.value);
      renderProducts();
    });
    $("promoApplyBulkPrice")?.addEventListener("click", applyBulkPrice);
    $("promoActivateBtn")?.addEventListener("click", () => activateSelected().catch((e) => setResult(e.message || String(e), false)));
    $("promoDeactivateBtn")?.addEventListener("click", () => deactivateSelected().catch((e) => setResult(e.message || String(e), false)));
    $("promoImportFileBtn")?.addEventListener("click", () => $("promoImportFile")?.click());
    $("promoImportFile")?.addEventListener("change", handleImport);
    $("promoTemplateBtn")?.addEventListener("click", downloadTemplate);
  }

  async function init() {
    injectShell();
    if ($("promoIncludeActive")) $("promoIncludeActive").checked = Boolean(state.includeActive);
    if ($("promoSearch")) $("promoSearch").value = state.query || "";
    bindEvents();
    renderProducts();
    setStatus("进入「活动报名」后会自动加载 OZON 店铺和活动。");
    const observer = new MutationObserver(() => {
      if (!authLocked() && $(TAB_ID)?.classList.contains("active")) {
        ensureReady().catch((error) => setStatus(error.message || String(error), "fail"));
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (!authLocked() && $(TAB_ID)?.classList.contains("active")) {
      ensureReady().catch((error) => setStatus(error.message || String(error), "fail"));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
