(function () {
  "use strict";

  const TAB_ID = "ozonRanking";
  const STORAGE_KEY = "ozon_keyword_ranking_v1";
  const API = (path) => `/api/ozon-ranking/${path}`;
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let result = null;
  let state = {};
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch { state = {}; }

  function shellHtml() {
    return `
      <section class="dashboard-brief ranking-hero">
        <div>
          <h2>Ozon 关键词排名与坑产</h2>
          <p>查看关键词 Top 100、定位自己的 Product ID，并用目标名次附近商品的实际销量估算订单门槛。</p>
        </div>
        <span class="live-chip"><span></span>MPStats Analytics</span>
      </section>

      <section class="panel ranking-search-panel">
        <form id="rankingForm" class="ranking-form">
          <label>Ozon 关键词
            <input id="rankingKeyword" required minlength="2" maxlength="120" placeholder="例如：сыворотка для глаз" />
          </label>
          <label>我的 Product ID / 链接
            <input id="rankingProductId" placeholder="可选，例如：1786874757" />
          </label>
          <label>销量周期
            <select id="rankingDays">
              <option value="30" selected>最近 30 天</option>
              <option value="14">最近 14 天</option>
              <option value="60">最近 60 天</option>
              <option value="90">最近 90 天</option>
            </select>
          </label>
          <button class="primary" id="rankingSearchBtn" type="submit">分析 Top 100</button>
        </form>
        <div id="rankingStatus" class="table-status">输入俄语关键词后开始分析。数据源未配置时会明确提示，不显示模拟数据。</div>
      </section>

      <section class="grid metrics ranking-summary" id="rankingSummary" hidden></section>

      <section class="panel" id="rankingThresholdPanel" hidden>
        <div class="toolbar">
          <div>
            <h3>目标排名坑产估算</h3>
            <p class="section-note">门槛采用目标名次附近最多 9 个商品的周期销量中位数。它是运营参考值，不是 Ozon 官方排名公式。</p>
          </div>
          <span class="scope-chip" id="rankingConfidence">置信度：--</span>
        </div>
        <div class="ranking-thresholds" id="rankingThresholds"></div>
      </section>

      <section class="panel" id="rankingResultsPanel" hidden>
        <div class="toolbar ranking-table-toolbar">
          <div>
            <h3>关键词商品 Top 100</h3>
            <p class="section-note" id="rankingMethod"></p>
          </div>
          <div class="ranking-table-actions">
            <input id="rankingFilter" type="search" placeholder="筛选 ID / 商品 / 品牌 / 店铺" />
            <button class="secondary" id="rankingExport" type="button">导出 CSV</button>
          </div>
        </div>
        <div class="table-wrap ranking-table-wrap">
          <table class="ranking-table">
            <thead>
              <tr>
                <th>排名</th>
                <th>商品</th>
                <th>价格</th>
                <th>评分 / 评价</th>
                <th>周期销量</th>
                <th>日均单量</th>
                <th>销售额</th>
                <th>卖家 / 品牌</th>
              </tr>
            </thead>
            <tbody id="rankingRows"></tbody>
          </table>
        </div>
      </section>
    `;
  }

  function injectShell() {
    const nav = document.querySelector("aside nav");
    if (nav && !document.querySelector(`[data-tab="${TAB_ID}"]`)) {
      const button = document.createElement("button");
      button.className = "tab-btn";
      button.dataset.tab = TAB_ID;
      button.type = "button";
      button.innerHTML = "<span>🔎</span>关键词排名";
      const competitors = nav.querySelector('[data-tab="competitors"]') || nav.querySelector('[data-tab="settings"]');
      if (competitors) nav.insertBefore(button, competitors);
      else nav.appendChild(button);
      button.addEventListener("click", activateTab);
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

  function activateTab() {
    document.querySelectorAll(".tab-btn").forEach((button) => button.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelector(`[data-tab="${TAB_ID}"]`)?.classList.add("active");
    $(TAB_ID)?.classList.add("active");
    if ($("pageTitle")) $("pageTitle").textContent = "Ozon 关键词排名";
    checkProvider().catch(() => {});
  }

  async function readJson(response) {
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {
      throw new Error(`接口返回格式错误（HTTP ${response.status}）`);
    }
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `请求失败（HTTP ${response.status}）`);
      error.code = data.code || "";
      throw error;
    }
    return data;
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      cache: "no-store",
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    return readJson(response);
  }

  function setStatus(message, tone = "") {
    const element = $("rankingStatus");
    if (!element) return;
    element.textContent = message;
    element.className = `table-status ${tone}`.trim();
  }

  function setBusy(busy) {
    const button = $("rankingSearchBtn");
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? "正在获取并计算…" : "分析 Top 100";
  }

  function number(value, digits = 0) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "--";
    return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function rub(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "--";
    return `₽${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  }

  function confidenceLabel(value) {
    return value === "high" ? "高" : value === "medium" ? "中" : "低";
  }

  function summaryCard(label, value, note = "") {
    return `<div class="panel metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><div class="metric-sub">${escapeHtml(note)}</div></div>`;
  }

  function renderSummary() {
    const box = $("rankingSummary");
    if (!box || !result) return;
    const own = result.ownProduct;
    const ownRank = result.ownRank ? `#${number(result.ownRank)}` : result.productId ? "100 名外 / 未收录" : "未填写";
    const coverage = Math.round(Number(result.diagnostics?.salesCoverage || 0) * 100);
    box.innerHTML = [
      summaryCard("关键词频率", number(result.frequency), "MPStats 最近一期"),
      summaryCard("我的排名", ownRank, result.ownAverageRank ? `周期平均 #${number(result.ownAverageRank, 1)}` : "当前检索结果"),
      summaryCard(`${result.days} 天销量`, number(own?.sales), own ? `日均 ${number(own.dailySales, 2)} 单` : "未获得自己的商品数据"),
      summaryCard("抓取商品", `${number(result.resultCount)} 个`, `市场共 ${number(result.totalAvailable)} 个`),
      summaryCard("销量覆盖率", `${coverage}%`, `详情覆盖 ${Math.round(Number(result.diagnostics?.detailCoverage || 0) * 100)}%`),
      summaryCard("分析周期", `${result.range?.d1 || "--"}`, `至 ${result.range?.d2 || "--"}`),
    ].join("");
    box.hidden = false;
  }

  function renderThresholds() {
    const panel = $("rankingThresholdPanel");
    const box = $("rankingThresholds");
    if (!panel || !box || !result) return;
    $("rankingConfidence").textContent = `置信度：${confidenceLabel(result.diagnostics?.confidence)}`;
    box.innerHTML = (result.thresholds || []).map((item) => `
      <article class="ranking-threshold-card">
        <span>目标 Top ${number(item.targetRank)}</span>
        <strong>${item.monthlyOrders === null ? "--" : `${number(item.monthlyOrders)} 单 / ${result.days}天`}</strong>
        <div>建议日单：<b>${number(item.dailyOrders)}</b></div>
        <div>相比当前还差：<b>${number(item.additionalMonthlyOrders)} 单</b></div>
        <small>附近有效样本 ${number(item.sampleSize)} 个</small>
      </article>
    `).join("");
    panel.hidden = false;
  }

  function filteredProducts() {
    const query = String($("rankingFilter")?.value || "").trim().toLowerCase();
    if (!query) return result?.products || [];
    return (result?.products || []).filter((item) =>
      [item.productId, item.name, item.brand, item.seller].join(" ").toLowerCase().includes(query)
    );
  }

  function renderRows() {
    const tbody = $("rankingRows");
    if (!tbody || !result) return;
    const ownId = String(result.productId || "");
    const rows = filteredProducts();
    tbody.innerHTML = rows.length ? rows.map((item) => {
      const isOwn = ownId && String(item.productId) === ownId;
      const image = item.image ? `<img class="ranking-product-image" src="${escapeHtml(item.image)}" alt="" loading="lazy" />` : "";
      return `
        <tr class="${isOwn ? "ranking-own-row" : ""}">
          <td><strong class="ranking-rank">#${number(item.rank)}</strong>${isOwn ? '<span class="ranking-own-badge">我的商品</span>' : ""}</td>
          <td><div class="ranking-product-cell">${image}<div><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a><small>Product ID: ${escapeHtml(item.productId)}</small></div></div></td>
          <td>${rub(item.price)}${item.regularPrice && item.regularPrice !== item.price ? `<small class="ranking-old-price">${rub(item.regularPrice)}</small>` : ""}</td>
          <td>${number(item.rating, 1)} / ${number(item.reviews)}</td>
          <td><strong>${number(item.sales)}</strong></td>
          <td>${number(item.dailySales, 2)}</td>
          <td>${rub(item.revenue)}</td>
          <td>${escapeHtml(item.seller || "--")}<small>${escapeHtml(item.brand || "")}</small></td>
        </tr>`;
    }).join("") : '<tr><td colspan="8" class="muted-cell">没有符合筛选条件的商品。</td></tr>';
    $("rankingResultsPanel").hidden = false;
  }

  function renderResult() {
    renderSummary();
    renderThresholds();
    renderRows();
    $("rankingMethod").textContent = `${result.methodology?.ranking || ""} ${result.methodology?.threshold || ""}`.trim();
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    if (!result?.products?.length) return;
    const headers = ["排名", "Product ID", "链接", "商品", "品牌", "卖家", "价格RUB", "评分", "评价数", `${result.days}天销量`, "日均单量", "销售额RUB"];
    const lines = [headers, ...result.products.map((item) => [
      item.rank, item.productId, item.url, item.name, item.brand, item.seller, item.price,
      item.rating, item.reviews, item.sales, item.dailySales, item.revenue,
    ])].map((row) => row.map(csvCell).join(","));
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `ozon-ranking-${result.keyword}-${result.generatedAt.slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  async function checkProvider() {
    const health = await apiRequest(API("health"));
    if (!health.configured && !result) {
      setStatus("功能已就绪，但 Cloudflare 尚未配置 MPSTATS_API_TOKEN。配置后即可获取真实 Ozon 数据。", "fail");
    }
  }

  async function search(event) {
    event.preventDefault();
    const keyword = String($("rankingKeyword")?.value || "").trim();
    const productId = String($("rankingProductId")?.value || "").trim();
    const days = Number($("rankingDays")?.value || 30);
    state = { keyword, productId, days };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    setBusy(true);
    setStatus("正在读取 Top 100 并补充商品销量、评价和价格。首次分析通常需要一些时间…");
    try {
      result = await apiRequest(API("search"), {
        method: "POST",
        body: JSON.stringify({ keyword, productId, days, limit: 100 }),
      });
      renderResult();
      const partial = result.diagnostics?.partialErrors?.length || 0;
      setStatus(`分析完成：返回 ${result.resultCount} 个商品，销量覆盖率 ${Math.round(Number(result.diagnostics?.salesCoverage || 0) * 100)}%${partial ? `，${partial} 项补充数据未获取` : ""}。`, partial ? "" : "ok");
    } catch (error) {
      setStatus(error.message || String(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  function bindEvents() {
    $("rankingForm")?.addEventListener("submit", search);
    $("rankingFilter")?.addEventListener("input", renderRows);
    $("rankingExport")?.addEventListener("click", exportCsv);
  }

  function init() {
    injectShell();
    if ($("rankingKeyword")) $("rankingKeyword").value = state.keyword || "";
    if ($("rankingProductId")) $("rankingProductId").value = state.productId || "";
    if ($("rankingDays") && state.days) $("rankingDays").value = String(state.days);
    bindEvents();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
