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
  let collectorToken = "";
  let state = {};
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch { state = {}; }

  function shellHtml() {
    return `
      <section class="dashboard-brief ranking-hero">
        <div>
          <h2>Ozon 关键词排名与坑产</h2>
          <p>查看关键词 Top 100、定位自己的 Product ID，并用目标名次附近商品的实际销量估算订单门槛。</p>
        </div>
        <span class="live-chip"><span></span>Chrome + Seller API</span>
      </section>

      <section class="panel ranking-search-panel">
        <form id="rankingForm" class="ranking-form">
          <label>Ozon 关键词
            <input id="rankingKeyword" required minlength="2" maxlength="120" placeholder="例如：сыворотка для глаз" />
          </label>
          <label>我的 Product ID / 链接
            <input id="rankingProductId" placeholder="可选，例如：1786874757" />
          </label>
          <button class="primary" id="rankingSearchBtn" type="submit">读取最新 Top 100</button>
          <button class="secondary" id="rankingLoadHashtags" type="button">只读取最新标签</button>
        </form>
        <div id="rankingStatus" class="table-status">先用 Chrome 采集器抓取 Ozon 搜索页，再在这里读取最新 Top 100。</div>
      </section>

      <section class="panel ranking-collector-panel">
        <div class="toolbar">
          <div>
            <h3>Chrome 采集器</h3>
            <p class="section-note">原“Ozon 排名采集器”只负责 MPStats 排名和销量。Top 50 蓝色 #标签请单独加载 <code>chrome-extension/ozon-hashtag-collector</code>，两个插件互不覆盖。</p>
          </div>
          <button class="secondary" id="rankingOpenOzon" type="button">打开关键词搜索页</button>
        </div>
        <div class="ranking-collector-grid">
          <div>
            <strong>首次连接</strong>
            <ol>
              <li>Chrome 打开 <code>chrome://extensions</code>，启用开发者模式。</li>
              <li>加载项目里的 <code>chrome-extension/ozon-ranking-collector</code> 文件夹。</li>
              <li>点击下方生成连接 Token，将地址和 Token 填入扩展。</li>
            </ol>
          </div>
          <div class="ranking-pair-box">
            <label>控制中心地址<input id="rankingCollectorUrl" readonly /></label>
            <label>采集器 Token<textarea id="rankingCollectorToken" rows="3" readonly placeholder="点击生成"></textarea></label>
            <div class="actions">
              <button class="primary" id="rankingPairCollector" type="button">生成连接 Token</button>
              <button class="secondary" id="rankingCopyCollector" type="button">复制配置</button>
            </div>
            <small id="rankingCollectorExpiry" class="muted"></small>
          </div>
        </div>
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

      <section class="panel ranking-hashtag-panel" id="rankingHashtagPanel" hidden>
        <div class="toolbar ranking-hashtag-toolbar">
          <div>
            <h3>Top 50 商品链接 #标签分析</h3>
            <p class="section-note" id="rankingHashtagMethod"></p>
          </div>
          <div class="ranking-hashtag-actions">
            <button class="secondary" id="rankingCopyTopTags" type="button">复制高频俄文</button>
            <button class="secondary" id="rankingCopyAllTags" type="button">复制全部俄文</button>
          </div>
        </div>
        <div class="ranking-hashtag-summary" id="rankingHashtagSummary"></div>
        <div class="table-wrap ranking-hashtag-table-wrap">
          <table class="ranking-hashtag-table">
            <thead><tr><th>高频俄文标签</th><th>中文翻译</th><th>出现链接</th><th>重复率</th></tr></thead>
            <tbody id="rankingTopTagRows"></tbody>
          </table>
        </div>
        <details class="ranking-all-tags">
          <summary>查看全部标签（<span id="rankingAllTagCount">0</span> 个）</summary>
          <div class="ranking-all-tag-list" id="rankingAllTagList"></div>
        </details>
      </section>

      <section class="panel" id="rankingResultsPanel" hidden>
        <div class="toolbar ranking-table-toolbar">
          <div>
            <h3>关键词商品 Top 100（排名升序）</h3>
            <p class="section-note" id="rankingMethod"></p>
          </div>
          <div class="ranking-table-actions">
            <input id="rankingFilter" type="search" placeholder="筛选 ID / 商品 / 品牌 / 店铺" />
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
                <th>30 天销量</th>
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
    button.textContent = busy ? "正在读取并计算…" : "读取最新 Top 100";
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
    const official = result.official || {};
    box.innerHTML = [
      summaryCard("Ozon 搜索人数", number(official.uniqueSearchUsers), official.available ? "Seller API 关键词数据" : "需要自己的 Product ID"),
      summaryCard("我的排名", ownRank, official.found ? "Ozon Seller API" : "Chrome 搜索结果"),
      summaryCard("30 天销量", number(own?.sales), own ? `日均 ${number(own.dailySales, 2)} 单` : "自己的商品不在当前结果中"),
      summaryCard("抓取商品", `${number(result.resultCount)} 个`, "Chrome 当前快照"),
      summaryCard("销量覆盖率", `${coverage}%`, `详情覆盖 ${Math.round(Number(result.diagnostics?.detailCoverage || 0) * 100)}%`),
      summaryCard("关键词订单", number(official.orders), official.gmv !== null && official.gmv !== undefined ? `GMV ${rub(official.gmv)}` : "Seller API 指定关键词"),
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
        <strong>${item.monthlyOrders === null ? "--" : `${number(item.monthlyOrders)} 单 / 30天`}</strong>
        <div>建议日单：<b>${number(item.dailyOrders)}</b></div>
        <div>相比当前还差：<b>${number(item.additionalMonthlyOrders)} 单</b></div>
        <small>附近有效样本 ${number(item.sampleSize)} 个</small>
      </article>
    `).join("");
    panel.hidden = false;
  }

  function percent(value) {
    if (!Number.isFinite(Number(value))) return "--";
    return `${(Number(value) * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
  }

  function renderHashtags() {
    const panel = $("rankingHashtagPanel");
    const analysis = result?.hashtagAnalysis;
    if (!panel || !analysis) return;
    const method = $("rankingHashtagMethod");
    if (method) {
      const translationNote = analysis.translationError
        ? analysis.translationError
        : analysis.translationConfigured ? "中文翻译仅用于查看，复制按钮只复制俄文。" : "未配置 OpenAI，当前仅显示俄文；复制按钮仍可正常使用。";
      method.textContent = `${analysis.sourceArea || ""} ${analysis.rateDefinition || ""} ${analysis.brandFilter || ""} ${translationNote}`.trim();
    }
    const summary = $("rankingHashtagSummary");
    if (summary) summary.innerHTML = [
      `<span>计划抓取 <strong>${number(analysis.requestedLimit)}</strong> 条</span>`,
      `<span>成功 <strong>${number(analysis.successfulCount)}/${number(analysis.attemptedCount)}</strong> 条</span>`,
      `<span>含标签 <strong>${number(analysis.linksWithTags)}</strong> 条</span>`,
      `<span>全部不同标签 <strong>${number(analysis.uniqueTagCount)}</strong> 个</span>`,
      `<span>重复标签 <strong>${number(analysis.repeatedTagCount)}</strong> 个</span>`,
      `<span>已过滤品牌标签 <strong>${number(analysis.excludedBrandTagCount)}</strong> 个</span>`,
    ].join("");
    const topRows = $("rankingTopTagRows");
    const topTags = Array.isArray(analysis.topTags) ? analysis.topTags : [];
    if (topRows) topRows.innerHTML = topTags.length ? topTags.map((item) => `
      <tr>
        <td><strong class="ranking-hashtag-ru">${escapeHtml(item.tag)}</strong></td>
        <td>${escapeHtml(item.translation || "--")}</td>
        <td>${number(item.count)} / ${number(analysis.rateDenominator)}</td>
        <td><strong>${percent(item.rate)}</strong></td>
      </tr>
    `).join("") : '<tr><td colspan="4" class="muted-cell">前 50 个商品链接中没有读取到俄文 #标签。</td></tr>';
    const all = Array.isArray(analysis.allTags) ? analysis.allTags : [];
    if ($("rankingAllTagCount")) $("rankingAllTagCount").textContent = number(all.length);
    const list = $("rankingAllTagList");
    if (list) list.innerHTML = all.length ? all.map((item) => `
      <span class="ranking-all-tag"><b>${escapeHtml(item.tag)}</b>${item.translation ? `<small>${escapeHtml(item.translation)}</small>` : ""}<em>${percent(item.rate)}</em></span>
    `).join("") : '<span class="muted">暂无标签</span>';
    panel.hidden = false;
  }

  function filteredProducts() {
    const query = String($("rankingFilter")?.value || "").trim().toLowerCase();
    const products = [...(result?.products || [])].sort((a, b) => Number(a.rank) - Number(b.rank));
    if (!query) return products;
    return products.filter((item) =>
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
          <td><strong class="ranking-rank">#${number(item.rank)}</strong>${isOwn ? '<span class="ranking-own-badge">我的商品</span>' : ""}${item.sponsored ? '<span class="ranking-ad-badge">广告</span>' : ""}</td>
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
    renderHashtags();
    renderRows();
    $("rankingMethod").textContent = `${result.methodology?.ranking || ""} ${result.methodology?.threshold || ""}`.trim();
  }

  async function checkProvider() {
    const health = await apiRequest(API("health"));
    if (!health.snapshotStorageConfigured) {
      setStatus("Chrome 自动采集需要在 Cloudflare 绑定 LISTING_CACHE KV；当前尚未检测到该绑定。", "fail");
    } else if (!health.configured && !result) {
      setStatus("Chrome Top 100 可以使用；但没有检测到 Ozon Seller API 店铺，自己的官方关键词排名暂不可用。", "");
    }
    return health;
  }

  async function pairCollector() {
    const button = $("rankingPairCollector");
    if (button) button.disabled = true;
    try {
      const payload = await apiRequest(API("collector/pair"), { method: "POST", body: "{}" });
      collectorToken = payload.token || "";
      $("rankingCollectorToken").value = collectorToken;
      $("rankingCollectorExpiry").textContent = payload.expiresAt ? `有效期至 ${new Date(payload.expiresAt).toLocaleString("zh-CN")}` : "";
      try {
        await copyCollectorConfig();
        setStatus("采集器连接 Token 已生成，并已复制配置。请粘贴到 Chrome 扩展中。", "ok");
      } catch {
        setStatus("采集器连接 Token 已生成。浏览器未允许自动复制，请手动复制上面的 Token 和控制中心地址。", "ok");
      }
    } catch (error) {
      setStatus(error.message || String(error), "fail");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function collectorConfig() {
    return JSON.stringify({
      dashboardUrl: location.origin,
      token: collectorToken || $("rankingCollectorToken")?.value || "",
      productId: String($("rankingProductId")?.value || "").trim(),
    }, null, 2);
  }

  async function copyCollectorConfig() {
    const config = collectorConfig();
    if (!JSON.parse(config).token) throw new Error("请先生成连接 Token。");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(config);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = config;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("浏览器未允许复制，请手动复制 Token 和地址。");
    }
    setStatus("采集器配置已复制。打开扩展后点击“粘贴配置”。", "ok");
  }

  async function copyRussianTags(scope) {
    const analysis = result?.hashtagAnalysis;
    const source = scope === "top" ? analysis?.topTags : analysis?.allTags;
    const tags = (Array.isArray(source) ? source : [])
      .map((item) => String(item?.tag || "").trim())
      .filter((tag) => tag.startsWith("#"));
    if (!tags.length) throw new Error("暂无可复制的俄文标签。");
    const content = tags.join(" ");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("浏览器未允许复制，请手动选择标签。");
    }
    setStatus(`已复制 ${tags.length} 个${scope === "top" ? "高频" : "全部"}原始标签（不含中文翻译）。`, "ok");
  }

  function openOzonSearch() {
    const keyword = String($("rankingKeyword")?.value || "").trim();
    if (keyword.length < 2) {
      setStatus("请先输入 Ozon 关键词。", "fail");
      return;
    }
    const url = `https://www.ozon.ru/search/?deny_category_prediction=true&from_global=true&text=${encodeURIComponent(keyword)}`;
    window.open(url, "_blank", "noopener");
  }

  async function search(event) {
    event.preventDefault();
    const keyword = String($("rankingKeyword")?.value || "").trim();
    const productId = String($("rankingProductId")?.value || "").trim();
    state = { keyword, productId };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    setBusy(true);
    setStatus("正在读取 Chrome 最新快照，并用 Ozon Seller API 校验自己的关键词数据…");
    try {
      result = await apiRequest(API("search"), {
        method: "POST",
        body: JSON.stringify({ keyword, productId }),
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

  async function loadHashtags() {
    const keyword = String($("rankingKeyword")?.value || "").trim();
    if (keyword.length < 2) {
      setStatus("请先输入 Ozon 关键词。", "fail");
      return;
    }
    const button = $("rankingLoadHashtags");
    if (button) button.disabled = true;
    setStatus("正在读取独立标签采集器的最新快照…");
    try {
      const payload = await apiRequest(API("hashtags/search"), {
        method: "POST",
        body: JSON.stringify({ keyword }),
      });
      result = { ...(result || {}), keyword, hashtagAnalysis: payload.hashtagAnalysis };
      renderHashtags();
      setStatus(`标签分析完成：保留 ${payload.hashtagAnalysis?.uniqueTagCount || 0} 个标签，已过滤 ${payload.hashtagAnalysis?.excludedBrandTagCount || 0} 个品牌标签。`, "ok");
    } catch (error) {
      setStatus(error.message || String(error), "fail");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function bindEvents() {
    $("rankingForm")?.addEventListener("submit", search);
    $("rankingFilter")?.addEventListener("input", renderRows);
    $("rankingPairCollector")?.addEventListener("click", pairCollector);
    $("rankingCopyCollector")?.addEventListener("click", () => copyCollectorConfig().catch((error) => setStatus(error.message || String(error), "fail")));
    $("rankingCopyTopTags")?.addEventListener("click", () => copyRussianTags("top").catch((error) => setStatus(error.message || String(error), "fail")));
    $("rankingCopyAllTags")?.addEventListener("click", () => copyRussianTags("all").catch((error) => setStatus(error.message || String(error), "fail")));
    $("rankingLoadHashtags")?.addEventListener("click", loadHashtags);
    $("rankingOpenOzon")?.addEventListener("click", openOzonSearch);
  }

  function init() {
    injectShell();
    if ($("rankingKeyword")) $("rankingKeyword").value = state.keyword || "";
    if ($("rankingProductId")) $("rankingProductId").value = state.productId || "";
    if ($("rankingCollectorUrl")) $("rankingCollectorUrl").value = location.origin;
    bindEvents();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
