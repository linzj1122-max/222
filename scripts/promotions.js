/* =========================================================
 *  OZON 活动报名模块（Promotions）
 *  ---------------------------------------------------------
 *  独立自包含模块：
 *    - 自行注入导航按钮和页面 DOM；
 *    - 调用 /api/promotions/*，不在前端保存店铺密钥；
 *    - 支持活动列表、全部商品状态、批量报名、从活动中删除。
 * ========================================================= */
(function () {
  "use strict";

  const TAB_ID = "promotions";
  const API = (sub) => `/api/promotions/${sub}`;
  const STORAGE_KEY = "ozon_wb_promotions_state_v1";

  const $ = (id) => document.getElementById(id);
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
  const cny = (v) => `¥${Number(v || 0).toFixed(2)}`;

  let stores = [];
  let actions = [];
  let products = [];
  let selectedProducts = new Set();
  let state = {};
  let bootstrapped = false;
  let bootstrapping = false;

  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch { state = {}; }

  function saveState() {
    const keep = {
      storeIndex: $("promoStore")?.value || "0",
      actionId: $("promoAction")?.value || "",
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
          <p>选择店铺和活动后查看全部商品，勾选商品批量报名或从活动中删除。</p>
        </div>
        <span class="live-chip"><span></span>Seller API</span>
      </section>

      <section class="panel promo-control-panel">
        <div class="toolbar">
          <div>
            <h3>活动工作台</h3>
            <p class="section-note">活动列表来自 OZON Seller API，商品表会合并店铺商品、未报名商品和已报名商品。</p>
          </div>
          <div class="promo-controls">
            <label class="inline-select">店铺
              <select id="promoStore"></select>
            </label>
            <label class="inline-select">活动
              <select id="promoAction"></select>
            </label>
            <button class="secondary" id="promoReloadActions" type="button">刷新活动</button>
            <button class="primary" id="promoLoadProducts" type="button">加载商品</button>
          </div>
        </div>
        <div id="promoStatus" class="table-status">正在初始化模块...</div>
        <div id="promoResult" class="api-verify-status" hidden></div>
      </section>

      <section class="panel promo-products-panel">
        <div class="toolbar">
          <h3>商品</h3>
          <input class="search" id="promoSearch" placeholder="搜索 Product ID / Offer ID / SKU / 商品名" />
        </div>
        <div class="promo-bulkbar">
          <label class="inline-select">活动价 RMB
            <input id="promoBulkPrice" type="number" step="0.01" min="0" placeholder="批量填入" />
          </label>
          <button class="secondary" id="promoApplyBulkPrice" type="button">填入选中</button>
          <button class="primary" id="promoActivateBtn" type="button">批量报名</button>
          <button class="danger" id="promoDeactivateBtn" type="button">从活动删除</button>
        </div>
        <div class="table-status" id="promoProductSummary">请选择店铺和活动后加载商品。</div>
        <div class="table-wrap promo-products-wrap">
          <table>
            <thead>
              <tr>
                <th><input id="promoSelectAll" type="checkbox" /></th>
                <th>商品</th>
                <th>当前价 RMB</th>
                <th>已报名价 RMB</th>
                <th>活动价 RMB</th>
                <th>建议/上限 RMB</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody id="promoProductRows"></tbody>
          </table>
        </div>
      </section>
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
    return amount(row.actionPrice || row.maxActionPrice || row.enrolledActionPrice || row.currentPrice || row.price);
  }

  function productEnrolledPrice(row) {
    return amount(row.enrolledActionPrice || row.enrolled_action_price || (row.participating ? row.actionPrice : 0));
  }

  function productImage(row) {
    return String(row.image || row.primary_image || row.primaryImage || row.primary_image_url || row.image_url || row.images?.[0] || "").trim();
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
        : "请选择活动并加载商品。";
    }
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="muted-cell">没有匹配的商品。</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((row) => {
      const key = productKey(row);
      const checked = selectedProducts.has(key) ? "checked" : "";
      const title = row.name || row.title || row.offerId || row.sku || `Product ${row.productId}`;
      const hint = [row.offerId ? `Offer: ${row.offerId}` : "", row.sku ? `SKU: ${row.sku}` : "", row.productId ? `Product: ${row.productId}` : ""].filter(Boolean).join(" · ");
      const suggestion = [row.minActionPrice ? `最低 ${cny(row.minActionPrice)}` : "", row.maxActionPrice ? `上限 ${cny(row.maxActionPrice)}` : ""].filter(Boolean).join(" / ") || "—";
      const enrolledPrice = productEnrolledPrice(row);
      const imageUrl = productImage(row);
      const image = imageUrl
        ? `<img class="promo-product-img" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" />`
        : `<span class="promo-product-placeholder">${escapeHtml(String(row.offerId || row.sku || title || "?").slice(0, 3))}</span>`;
      return `
        <tr>
          <td><input class="promo-row-check" type="checkbox" value="${escapeHtml(key)}" ${checked} /></td>
          <td><div class="promo-product">${image}<div class="promo-product-copy"><strong class="promo-product-name" title="${escapeHtml(title)}">${escapeHtml(title)}</strong><div class="sku">${escapeHtml(hint || key)}</div></div></div></td>
          <td class="money">${row.currentPrice || row.price ? cny(row.currentPrice || row.price) : "—"}</td>
          <td class="money">${enrolledPrice ? cny(enrolledPrice) : (row.participating ? "待返回" : "—")}</td>
          <td><input class="promo-price-input" data-promo-price="${escapeHtml(key)}" type="number" step="0.01" min="0" value="${productDefaultPrice(row) || ""}" placeholder="必填" /></td>
          <td>${escapeHtml(suggestion)}</td>
          <td><span class="scope-chip">${escapeHtml(row.status || (row.participating ? "已报名" : (row.candidate ? "未报名" : "店铺商品")))}</span></td>
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
    let data = null;
    try {
      data = await apiRequest(`${API("actions")}?storeIndex=${selectedStoreIndex()}`);
    } catch (error) {
      actions = [];
      renderActions();
      bootstrapped = true;
      setStatus(`活动加载失败：${error.message || error}。正在尝试加载店铺商品...`, "fail");
      await loadStoreProductsOnly();
      return;
    }
    actions = data.actions || [];
    if (!actions.some((action) => String(action.id) === String(state.actionId))) state.actionId = actions[0]?.id || "";
    renderActions();
    bootstrapped = true;
    const note = data.diagnostics?.shape ? `（返回结构：${data.diagnostics.shape}）` : "";
    setStatus(actions.length ? `已加载 ${actions.length} 个活动。${note}` : `OZON 当前没有返回可报名活动。${note}`);
    if (actions.length) {
      await loadProducts();
    } else {
      await loadStoreProductsOnly();
    }
  }

  async function loadStoreProductsOnly() {
    selectedProducts = new Set();
    renderProducts();
    setStatus("正在加载店铺商品...");
    const data = await apiRequest(`${API("store-products")}?storeIndex=${selectedStoreIndex()}`);
    products = data.products || [];
    renderProducts();
    setStatus(products.length ? `已加载 ${products.length} 个店铺商品。当前店铺暂无可选择活动，报名/删除需先有活动。` : "没有拉到店铺商品。");
  }

  async function loadProducts() {
    const actionId = selectedActionId();
    if (!actionId) {
      setStatus("请先选择一个活动。", "fail");
      return;
    }
    saveState();
    selectedProducts = new Set();
    renderProducts();
    setStatus(`正在加载活动「${currentAction()?.title || actionId}」的全部商品状态...`);
    const data = await apiRequest(`${API("candidates")}?storeIndex=${selectedStoreIndex()}&actionId=${encodeURIComponent(actionId)}`);
    products = data.products || [];
    renderProducts();
    const counts = data.counts || {};
    const extra = products.length
      ? `店铺商品 ${counts.store ?? "?"} 个，可报名 ${counts.candidates ?? 0} 个，已报名 ${counts.active ?? 0} 个。`
      : "没有拉到店铺商品或活动商品。";
    const warnings = [data.diagnostics?.storeError, data.diagnostics?.candidatesError, data.diagnostics?.activeError].filter(Boolean);
    setStatus(`已加载 ${products.length} 个商品。${extra}${warnings.length ? " 注意：" + warnings.join("；") : ""}`);
  }

  function selectedPayload() {
    const rows = products.filter((row) => selectedProducts.has(productKey(row)));
    return rows.map((row) => {
      const key = productKey(row);
      const price = amount(document.querySelector(`[data-promo-price="${CSS.escape(key)}"]`)?.value);
      return {
        product_id: Number(row.productId || row.product_id || row.id || 0),
        offer_id: row.offerId || row.offer_id || "",
        action_price: price,
      };
    }).filter((row) => row.product_id && row.action_price > 0);
  }

  async function activateSelected() {
    const actionId = selectedActionId();
    const payload = selectedPayload();
    if (!actionId) return setStatus("请先选择活动；当前如果没有活动，只能查看店铺商品。", "fail");
    if (!payload.length) return setStatus("请勾选商品，并填写大于 0 的活动价。", "fail");
    if (!confirm(`确认将 ${payload.length} 个商品报名到当前 OZON 活动？`)) return;
    setStatus(`正在提交 ${payload.length} 个商品报名...`);
    const data = await apiRequest(API("activate"), {
      method: "POST",
      body: JSON.stringify({ storeIndex: selectedStoreIndex(), actionId, products: payload }),
    });
    const okCount = data.successCount ?? data.successProductIds?.length ?? 0;
    const failCount = data.errorCount ?? data.errors?.length ?? 0;
    const errorText = (data.errors || []).slice(0, 3).map((item) => `${item.product_id || ""} ${item.message || ""}`.trim()).filter(Boolean).join("；");
    setResult(`报名完成：成功 ${okCount} 个，失败 ${failCount} 个。${errorText ? "失败原因：" + errorText : ""}`, failCount === 0);
    if (okCount > 0) {
      const priceById = data.submittedPrices || {};
      const successIds = new Set((data.successProductIds || []).map((id) => String(id)));
      products = products.map((row) => {
        const productId = String(row.productId || row.product_id || row.id || "");
        if (!successIds.has(productId)) return row;
        const price = amount(priceById[productId]);
        return {
          ...row,
          participating: true,
          candidate: true,
          enrolledActionPrice: price || row.enrolledActionPrice,
          actionPrice: price || row.actionPrice,
          status: "已报名",
        };
      });
      renderProducts();
      setStatus("报名完成，正在重新加载已报名商品和活动价...");
      await loadProducts();
      setResult(`报名完成：成功 ${okCount} 个，失败 ${failCount} 个。${errorText ? "失败原因：" + errorText : "已刷新已报名价。"}`, failCount === 0);
    } else {
      setStatus(errorText || "Ozon 没有返回报名成功，请检查活动要求、商品资格或后台提示。", "fail");
    }
  }

  async function deactivateSelected() {
    const actionId = selectedActionId();
    const productIds = products
      .filter((row) => selectedProducts.has(productKey(row)))
      .map((row) => Number(row.productId || row.product_id || row.id || 0))
      .filter(Boolean);
    if (!actionId) return setStatus("请先选择活动；当前如果没有活动，只能查看店铺商品。", "fail");
    if (!productIds.length) return setStatus("请先勾选要取消报名的商品。", "fail");
    if (!confirm(`确认取消 ${productIds.length} 个商品的活动报名？`)) return;
    setStatus(`正在取消 ${productIds.length} 个商品报名...`);
    const data = await apiRequest(API("deactivate"), {
      method: "POST",
      body: JSON.stringify({ storeIndex: selectedStoreIndex(), actionId, productIds }),
    });
    const okCount = data.successCount ?? data.successProductIds?.length ?? 0;
    const failCount = data.errorCount ?? data.errors?.length ?? 0;
    setResult(`删除完成：成功 ${okCount} 个，失败 ${failCount} 个。`, failCount === 0);
    if (okCount > 0) {
      setStatus("已同步删除 OZON 活动商品，正在刷新列表...");
      await loadProducts();
    } else {
      setStatus("删除请求已提交，可重新加载商品核对活动状态。");
    }
  }

  function applyBulkPrice() {
    const price = amount($("promoBulkPrice")?.value);
    if (!selectedProducts.size) return setStatus("请先勾选商品。", "fail");
    if (price <= 0) return setStatus("请填写活动价。", "fail");
    selectedProducts.forEach((key) => {
      if (price > 0) {
        const input = document.querySelector(`[data-promo-price="${CSS.escape(key)}"]`);
        if (input) input.value = price;
      }
    });
    setStatus(`已填入 ${selectedProducts.size} 个选中商品。`);
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
      loadActions().catch((e) => setStatus(e.message || String(e), "fail"));
    });
    $("promoAction")?.addEventListener("change", () => {
      products = [];
      selectedProducts = new Set();
      saveState();
      renderActions();
      renderProducts();
      loadProducts().catch((e) => setStatus(e.message || String(e), "fail"));
    });
    $("promoReloadActions")?.addEventListener("click", () => loadActions().catch((e) => setStatus(e.message || String(e), "fail")));
    $("promoLoadProducts")?.addEventListener("click", () => loadProducts().catch((e) => setStatus(e.message || String(e), "fail")));
    $("promoSearch")?.addEventListener("input", () => { saveState(); renderProducts(); });
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
  }

  async function init() {
    injectShell();
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
