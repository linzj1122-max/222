(function () {
  "use strict";

  const TAB_ID = "wbSemiAuto";
  const STORAGE_KEY = "wb_semi_auto_drafts_v1";
  const API = (sub) => `/api/wb-listing/${sub}`;
  const $ = (id) => document.getElementById(id);
  const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const toNumber = (value) => {
    const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const normalizeKey = (value) => String(value || "").toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
  const rowValue = (row, names) => {
    for (const name of names) {
      const key = Object.keys(row).find((item) => String(item).trim().toLowerCase() === String(name).trim().toLowerCase());
      if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
    }
    return "";
  };

  let stores = [];
  let categories = [];
  let drafts = loadJson(STORAGE_KEY, []);
  let selected = new Set();
  let pricingRules = [];

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch { return fallback; }
  }

  function saveDrafts() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)); } catch {}
  }

  function injectShell() {
    const nav = document.querySelector("aside nav");
    if (nav && !document.querySelector(`[data-tab="${TAB_ID}"]`)) {
      const btn = document.createElement("button");
      btn.className = "tab-btn";
      btn.dataset.tab = TAB_ID;
      btn.type = "button";
      btn.innerHTML = `<span>WB</span>WB半自动上架`;
      const settings = nav.querySelector('[data-tab="settings"]');
      if (settings) nav.insertBefore(btn, settings);
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
      <section class="dashboard-brief"><div><h2>WB 半自动上架</h2><p>类目缓存、商品包导入、自动定价、批量建卡提交。</p></div><span class="live-chip"><span></span>SEMI AUTO</span></section>
      <section class="panel"><div class="toolbar"><div><h3>1. 店铺与类目</h3><p class="section-note">类目从 WB API 读取并写入 Cloudflare KV，前端只负责筛选选择。</p></div><button class="secondary" id="wbsaReloadCats" type="button">刷新类目</button></div><div class="cols-2"><label>WB 店铺<select id="wbsaStore"></select></label><label>类目搜索<input id="wbsaCatSearch" placeholder="输入中文/俄文/英文关键词" /></label></div><div class="actions" id="wbsaCatList"></div><div class="table-status" id="wbsaCatStatus">等待加载类目。</div></section>
      <section class="panel"><div class="toolbar"><div><h3>2. 定价规则与商品包</h3><p class="section-note">商品表最少需要货号、成本、重量。图片文件名或所在文件夹包含货号即可自动匹配。</p></div></div><div class="cols-3"><label>默认汇率<input id="wbsaRate" type="number" step="0.01" value="11.5" /></label><label>目标毛利率 %<input id="wbsaMargin" type="number" step="1" value="65" /></label><label>平台扣点 %<input id="wbsaCommission" type="number" step="1" value="12" /></label></div><div class="cols-3"><label>每 kg 运费 RMB<input id="wbsaFreight" type="number" step="0.01" value="36" /></label><label>单件处理费 RMB<input id="wbsaHandling" type="number" step="0.01" value="3" /></label><label>价格取整 RMB<input id="wbsaRound" type="number" step="1" value="1" /></label></div><div class="cols-3"><label>定价表(可选)<input id="wbsaPricingFile" type="file" accept=".xlsx,.xls,.csv" /></label><label>商品表格<input id="wbsaProductFile" type="file" accept=".xlsx,.xls,.csv" /></label><label>图片文件夹<input id="wbsaImages" type="file" accept="image/*" multiple webkitdirectory /></label></div><div class="actions"><button class="primary" id="wbsaImport" type="button">生成草稿</button><button class="secondary" id="wbsaSelectAll" type="button">全选草稿</button><button class="primary" id="wbsaPublish" type="button">发布选中</button><button class="danger" id="wbsaDelete" type="button">删除选中</button></div><div class="table-status" id="wbsaReport">尚未导入商品包。</div></section>
      <section class="panel"><div class="toolbar"><h3>3. 上架草稿</h3><span class="status">发布前检查价格、图片匹配和类目。</span></div><div id="wbsaDrafts"></div></section>`;
  }

  function activateTab(id) {
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelector(`[data-tab="${id}"]`)?.classList.add("active");
    $(id)?.classList.add("active");
    const title = $("pageTitle");
    if (title) title.textContent = "WB半自动上架";
    renderDrafts();
  }

  async function readJson(response) {
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`接口返回非 JSON: ${text.slice(0, 160)}`); }
    if (!response.ok || data.ok === false) throw new Error(data.error || data.message || `请求失败 ${response.status}`);
    return data;
  }

  async function loadStores() {
    try {
      const data = await readJson(await fetch(API("stores")));
      stores = data.stores || [];
      const sel = $("wbsaStore");
      if (sel) sel.innerHTML = stores.map((s) => `<option value="${s.index}">${escapeHtml(s.name)}</option>`).join("") || `<option value="0">未配置 WB 店铺</option>`;
      await loadCategories(false);
    } catch (error) { setStatus(error.message || String(error)); }
  }

  async function loadCategories(force) {
    const storeIndex = Number($("wbsaStore")?.value || 0);
    setStatus("正在加载 WB 类目...");
    try {
      const data = await readJson(await fetch(API(`categories?storeIndex=${storeIndex}${force ? "&refresh=1" : ""}`)));
      categories = data.categories || [];
      setStatus(`${data.source === "cloud-kv" ? "云端缓存" : "API"} 已加载 ${categories.length} 个类目。`);
      renderCategories();
    } catch (error) { setStatus(error.message || String(error)); }
  }

  function setStatus(text) { const el = $("wbsaCatStatus"); if (el) el.textContent = text; }
  function renderCategories() {
    const box = $("wbsaCatList");
    if (!box) return;
    const kw = String($("wbsaCatSearch")?.value || "").trim().toLowerCase();
    const list = categories.filter((cat) => !kw || `${cat.name} ${cat.id}`.toLowerCase().includes(kw)).slice(0, 120);
    box.innerHTML = list.map((cat) => `<button type="button" class="secondary ${cat.selected ? "active" : ""}" data-wbsa-cat="${cat.id}">${escapeHtml(cat.name)} <small>${escapeHtml(cat.id)}</small></button>`).join("") || `<div class="muted-cell">没有匹配类目</div>`;
  }
  function selectedCategory() { return categories.find((cat) => cat.selected) || null; }

  async function parseSheet(file) {
    if (!file) return [];
    if (!window.XLSX) throw new Error("页面未加载 XLSX 解析库");
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: "" });
  }

  async function buildImageIndex(files) {
    const rows = [];
    for (const file of [...files].filter((f) => /^image\//i.test(f.type || ""))) {
      if (file.size > 4 * 1024 * 1024) continue;
      const path = file.webkitRelativePath || file.name;
      rows.push({ key: normalizeKey(path), path, dataUrl: await fileToDataUrl(file) });
    }
    return rows;
  }
  function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
  function matchImages(index, sku) { const key = normalizeKey(sku); return index.filter((item) => key && item.key.includes(key)).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })).map((item) => item.dataUrl).slice(0, 15); }
  function ruleFor(weightG) { const kg = toNumber(weightG) / 1000; return pricingRules.find((r) => kg >= toNumber(r.minKg ?? r.minWeight) && (!toNumber(r.maxKg ?? r.maxWeight) || kg <= toNumber(r.maxKg ?? r.maxWeight))) || {}; }
  function computePrice(row) {
    const cost = toNumber(row.purchaseCost);
    const weightG = toNumber(row.weight);
    if (!cost || !weightG) return { price: "", error: "缺成本或重量" };
    const rule = ruleFor(weightG);
    const margin = toNumber(row.targetGrossRate || rule.targetGrossRate || $("wbsaMargin")?.value || 65) / 100;
    const commission = toNumber(row.commissionRate || rule.commissionRate || $("wbsaCommission")?.value || 12) / 100;
    const freight = toNumber(rule.freight || rule.freightPerKg || $("wbsaFreight")?.value || 36) * (weightG / 1000);
    const handling = toNumber(rule.handling || rule.handlingFee || $("wbsaHandling")?.value || 3);
    const roundTo = Math.max(1, toNumber(rule.roundTo || $("wbsaRound")?.value || 1));
    const denominator = Math.max(0.05, 1 - margin - commission);
    const price = Math.ceil(((cost + freight + handling) / denominator) / roundTo) * roundTo;
    return { price: price.toFixed(2), oldPrice: (Math.ceil(price * 2)).toFixed(2) };
  }

  function draftFromRow(row, imageIndex, cat) {
    const draft = { id: uid(), platform: "WB", storeIndex: Number($("wbsaStore")?.value || 0), categoryId: cat?.id || "", categoryName: cat?.name || "", code: String(rowValue(row, ["货号", "SKU", "sku", "offer_id", "offerId", "code", "Артикул"]) || "").trim(), title: String(rowValue(row, ["标题", "品名", "name", "title", "Название"]) || "").trim(), brand: String(rowValue(row, ["品牌", "brand", "Бренд"]) || "Нет бренда").trim(), description: String(rowValue(row, ["描述", "description", "Описание"]) || "").trim(), purchaseCost: String(rowValue(row, ["成本", "采购成本", "进货价", "purchaseCost", "cost"]) || "").trim(), weight: String(rowValue(row, ["重量g", "重量", "weight", "weight_g"]) || "").trim(), length: String(rowValue(row, ["长mm", "长", "length"]) || "").trim(), width: String(rowValue(row, ["宽mm", "宽", "width"]) || "").trim(), height: String(rowValue(row, ["高mm", "高", "height"]) || "").trim(), images: [], status: "draft", error: "" };
    draft.images = [...splitImages(rowValue(row, ["图片", "图片URL", "images", "image", "image_url"])), ...matchImages(imageIndex, draft.code)].slice(0, 15);
    const manualPrice = rowValue(row, ["售价", "价格", "price", "Цена"]);
    if (manualPrice) draft.price = String(manualPrice).trim();
    else Object.assign(draft, computePrice(draft));
    if (!draft.title) draft.title = draft.code;
    return draft;
  }
  function splitImages(value) { return String(value || "").split(/[\n,，;；]+/).map((v) => v.trim()).filter(Boolean).slice(0, 15); }

  async function importPackage() {
    const cat = selectedCategory();
    if (!cat) return alert("请先选择 WB 类目。");
    const productFile = $("wbsaProductFile")?.files?.[0];
    if (!productFile) return alert("请先选择商品表格。");
    pricingRules = await parseSheet($("wbsaPricingFile")?.files?.[0]);
    const rows = await parseSheet(productFile);
    const imageIndex = await buildImageIndex($("wbsaImages")?.files || []);
    const imported = rows.map((row) => draftFromRow(row, imageIndex, cat)).filter((d) => d.code || d.title);
    drafts = [...imported, ...drafts];
    saveDrafts(); renderDrafts();
    report(`生成 ${imported.length} 个草稿；匹配图片 ${imported.filter((d) => d.images.length).length} 个；定价失败 ${imported.filter((d) => !d.price).length} 个。`);
  }
  function report(text) { const el = $("wbsaReport"); if (el) el.textContent = text; }
  function renderDrafts() {
    const box = $("wbsaDrafts");
    if (!box) return;
    box.innerHTML = drafts.length ? drafts.map((d) => `<div class="listing-draft-row ${selected.has(d.id) ? "is-selected" : ""}"><label class="inline-check"><input type="checkbox" data-wbsa-check="${d.id}" ${selected.has(d.id) ? "checked" : ""}></label><span class="listing-draft-info"><strong>${escapeHtml(d.code || d.title)}</strong> · ${escapeHtml(d.title || "")} <small>¥${escapeHtml(d.price || "-")} · 图 ${d.images?.length || 0} · ${escapeHtml(d.categoryName || "未选类目")}</small></span><span class="actions"><button class="danger" data-wbsa-del="${d.id}" type="button">删除</button></span></div>`).join("") : `<div class="listing-draft-row muted-cell">暂无 WB 草稿。</div>`;
  }
  async function publishSelected() {
    const ids = [...selected];
    if (!ids.length) return alert("请先勾选草稿。");
    let ok = 0, fail = 0;
    for (const id of ids) {
      const draft = drafts.find((item) => item.id === id);
      if (!draft) continue;
      try {
        const data = await readJson(await fetch(API("publish"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft }) }));
        draft.status = data.ok ? "submitted" : "failed";
        draft.error = data.error || data.note || "";
        data.ok ? ok++ : fail++;
      } catch (error) { draft.status = "failed"; draft.error = error.message || String(error); fail++; }
      saveDrafts(); renderDrafts();
    }
    report(`发布完成：成功 ${ok}，失败 ${fail}。`);
  }
  function bind() {
    $("wbsaStore")?.addEventListener("change", () => loadCategories(false));
    $("wbsaReloadCats")?.addEventListener("click", () => loadCategories(true));
    $("wbsaCatSearch")?.addEventListener("input", renderCategories);
    $("wbsaCatList")?.addEventListener("click", (event) => { const btn = event.target.closest("[data-wbsa-cat]"); if (!btn) return; categories.forEach((cat) => { cat.selected = String(cat.id) === btn.getAttribute("data-wbsa-cat"); }); renderCategories(); });
    $("wbsaImport")?.addEventListener("click", () => importPackage().catch((error) => alert(error.message || error)));
    $("wbsaSelectAll")?.addEventListener("click", () => { drafts.forEach((draft) => selected.add(draft.id)); renderDrafts(); });
    $("wbsaDelete")?.addEventListener("click", () => { drafts = drafts.filter((draft) => !selected.has(draft.id)); selected.clear(); saveDrafts(); renderDrafts(); });
    $("wbsaPublish")?.addEventListener("click", publishSelected);
    $("wbsaDrafts")?.addEventListener("change", (event) => { const checkbox = event.target.closest("[data-wbsa-check]"); if (!checkbox) return; checkbox.checked ? selected.add(checkbox.dataset.wbsaCheck) : selected.delete(checkbox.dataset.wbsaCheck); renderDrafts(); });
    $("wbsaDrafts")?.addEventListener("click", (event) => { const del = event.target.closest("[data-wbsa-del]"); if (!del) return; drafts = drafts.filter((draft) => draft.id !== del.dataset.wbsaDel); selected.delete(del.dataset.wbsaDel); saveDrafts(); renderDrafts(); });
  }
  function init() { injectShell(); bind(); renderDrafts(); loadStores(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
