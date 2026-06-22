/* =========================================================
 *  AI 生图 / 文本工作室（AI Studio）
 *  ---------------------------------------------------------
 *  独立自包含模块（与 sourcing.js / listing.js 同构）：
 *    - 自带 localStorage key，不与 main.js 共用存储；
 *    - 自行注入导航按钮、页面 DOM、内联样式；
 *    - 自行绑定事件，不修改 main.js 任何逻辑；
 *  依赖：后端 /api/ai-studio/* 代理（见 functions/api/ai-studio/[[path]].js）。
 *
 *  工作流：上传参考图 + 产品名 + 补充卖点 →
 *    ① 一键生成（识图 → 俄文标题/描述/20标签 + 中文翻译 → 9 张 3:4 主图）
 *    ② 也可分步：仅生成文案 / 仅生成图片
 * ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "ozon_wb_ai_studio_history_v1";
  const TAB_ID = "aiStudio";
  const TAB_LABEL = "🎨 AI生图/文本";

  const API = (sub) => `/api/ai-studio/${sub}`;

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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 图片转 dataURL（用于上传参考图与生成结果回写）
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("读取文件失败"));
      r.readAsDataURL(file);
    });
  }

  // 把远端图片 URL 转为 dataURL（便于历史记录本地持久化，避免外链过期）
  async function urlToDataURL(url) {
    if (!url || typeof url !== "string") return "";
    if (url.startsWith("data:")) return url;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      });
    } catch {
      return url;   // 转换失败就保留原 URL
    }
  }

  // ---- 状态 ----
  // 当前工作台状态（不入历史，历史单独存）
  const state = {
    referenceImages: [],   // dataURL 数组
    productName: "",
    extraInfo: "",
    platform: "Ozon",
    analysis: null,        // 识图结果
    copy: null,            // 文案结果
    images: [],            // 生成图结果 [{role,url,...}]
    busy: false,
  };

  let history = [];
  try { history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") || []; } catch { history = []; }

  const saveHistory = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50))); }
    catch (e) { console.warn("[ai-studio] 历史保存失败", e); }
  };

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
          <h2>AI 生图 / 文本工作室</h2>
          <p>上传产品参考图 + 填产品名，一键生成地道俄文标题/描述/20个SEO标签（附中文翻译）与 9 张 3:4 Ozon 电商主图。</p>
        </div>
        <span class="live-chip"><span></span>Ozon / WB 文案 + 主图</span>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h3>第一步 · 上传参考图与产品信息</h3>
          <span class="status">支持多图，第一张为产品主体参考。</span>
        </div>
        <div class="ai-studio-input">
          <div class="ai-studio-upload">
            <label class="ai-studio-dropzone" id="aiDropzone">
              <input id="ai_images" type="file" accept="image/*" multiple hidden />
              <span class="ai-dropzone-icon">📷</span>
              <span class="ai-dropzone-text">点击或拖拽上传产品参考图</span>
              <span class="ai-dropzone-hint">JPG / PNG，单张 ≤ 4MB，建议 3:4 竖图</span>
            </label>
            <div class="ai-thumb-row" id="ai_thumbRow"></div>
          </div>

          <div class="ai-studio-fields">
            <label>产品名称（中文，例如：20000毫安超薄充电宝）
              <input id="ai_productName" type="text" placeholder="告诉AI这是什么产品" />
            </label>
            <label>补充卖点 / 参数（可选，越详细生成越准）
              <textarea id="ai_extraInfo" rows="5" placeholder="例如：长6.85cm，高14.4cm，重210g，电池容量20000毫安，充电功率10W，自带数据线，多U口输出，电量数显，聚合物锂离子电芯，自带苹果/安卓三线+USB，可同时为五部设备充电，带LED手电，符合民航携带规定"></textarea>
            </label>
            <label class="inline-select">目标平台
              <select id="ai_platform">
                <option value="Ozon">Ozon</option>
                <option value="WB">Wildberries</option>
                <option value="Yandex">Yandex.Market</option>
              </select>
            </label>
            <div class="actions ai-studio-actions">
              <button class="primary" type="button" id="ai_generateAll">🚀 一键生成（文案+主图）</button>
              <button class="secondary" type="button" id="ai_generateCopy">仅生成文案</button>
              <button class="secondary" type="button" id="ai_generateImages">仅生成主图</button>
            </div>
            <div id="ai_status" class="table-status">就绪。上传参考图并填写产品信息后点击生成。</div>
          </div>
        </div>
      </section>

      <section class="panel" id="ai_copyPanel" hidden>
        <div class="toolbar">
          <h3>第二步 · 俄文商品文案（含中文翻译）</h3>
          <div class="ai-copy-actions">
            <button class="secondary" type="button" id="ai_copyTitle">复制标题</button>
            <button class="secondary" type="button" id="ai_copyDesc">复制描述</button>
            <button class="secondary" type="button" id="ai_copyTags">复制标签</button>
            <button class="secondary" type="button" id="ai_copyAllRu">复制完整俄文</button>
          </div>
        </div>
        <div class="ai-copy-grid">
          <div class="ai-copy-block ai-copy-ru">
            <div class="ai-copy-head">🇷🇺 俄文版本</div>
            <div class="ai-copy-field"><span class="ai-copy-label">Название</span><div id="ai_titleRu" class="ai-copy-text"></div></div>
            <div class="ai-copy-field"><span class="ai-copy-label">Описание</span><div id="ai_descRu" class="ai-copy-text"></div></div>
            <div class="ai-copy-field"><span class="ai-copy-label">Хэштеги</span><div id="ai_tagsRu" class="ai-copy-text"></div></div>
          </div>
          <div class="ai-copy-block ai-copy-zh">
            <div class="ai-copy-head">🇨🇳 中文翻译</div>
            <div class="ai-copy-field"><span class="ai-copy-label">商品标题</span><div id="ai_titleZh" class="ai-copy-text"></div></div>
            <div class="ai-copy-field"><span class="ai-copy-label">商品简介</span><div id="ai_descZh" class="ai-copy-text"></div></div>
            <div class="ai-copy-field"><span class="ai-copy-label">主题标签</span><div id="ai_tagsZh" class="ai-copy-text"></div></div>
          </div>
        </div>
      </section>

      <section class="panel" id="ai_imagesPanel" hidden>
        <div class="toolbar">
          <h3>第三步 · Ozon 电商主图组图（9 张 · 3:4）</h3>
          <div class="ai-img-actions">
            <button class="secondary" type="button" id="ai_downloadAll">打包下载（新窗口）</button>
          </div>
        </div>
        <div class="notice">每张图角色：1封面 + 2展示 + 3卖点 + 1细节 + 1说明 + 1详情。整套色系一致，画面文案为地道俄文。</div>
        <div class="ai-image-grid" id="ai_imageGrid"></div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h3>生成历史</h3>
          <span class="status">本地保存最近 50 条，点击可回填。</span>
          <button class="danger" type="button" id="ai_clearHistory" style="margin-left:auto">清空历史</button>
        </div>
        <div id="ai_historyList"></div>
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
  }

  // ---- 状态读写 ----
  function readForm() {
    state.productName = $("ai_productName")?.value.trim() || "";
    state.extraInfo = $("ai_extraInfo")?.value.trim() || "";
    state.platform = $("ai_platform")?.value || "Ozon";
  }
  function fillForm() {
    if ($("ai_productName")) $("ai_productName").value = state.productName || "";
    if ($("ai_extraInfo")) $("ai_extraInfo").value = state.extraInfo || "";
    if ($("ai_platform")) $("ai_platform").value = state.platform || "Ozon";
  }

  // ---- 渲染：参考图缩略图 ----
  function renderThumbs() {
    const row = $("ai_thumbRow");
    if (!row) return;
    if (!state.referenceImages.length) {
      row.innerHTML = `<div class="ai-thumb-empty">尚未上传参考图</div>`;
      return;
    }
    row.innerHTML = state.referenceImages.map((src, i) => `
      <div class="ai-thumb">
        <img src="${escapeAttr(src)}" alt="参考图 ${i + 1}" />
        <span class="ai-thumb-badge">${i === 0 ? "主参考" : "参考 " + (i + 1)}</span>
        <button class="rm" type="button" data-rm-img="${i}" title="移除">×</button>
      </div>`).join("");
  }

  // ---- 渲染：文案结果 ----
  function renderCopy() {
    const panel = $("ai_copyPanel");
    if (!panel) return;
    if (!state.copy) { panel.hidden = true; return; }
    panel.hidden = false;
    const c = state.copy;
    $("ai_titleRu").textContent = c.title || "—";
    $("ai_descRu").textContent = c.description || "—";
    $("ai_tagsRu").textContent = c.tags || "—";
    $("ai_titleZh").textContent = c.titleZh || "—";
    $("ai_descZh").textContent = c.descriptionZh || "—";
    $("ai_tagsZh").textContent = c.tagsZh || "—";
  }

  // ---- 渲染：图片结果 ----
  function renderImages() {
    const panel = $("ai_imagesPanel");
    const grid = $("ai_imageGrid");
    if (!panel || !grid) return;
    if (!state.images || !state.images.length) { panel.hidden = true; return; }
    panel.hidden = false;
    grid.innerHTML = state.images.map((img) => {
      if (!img.ok) {
        return `<div class="ai-image-card ai-image-failed">
          <div class="ai-image-fallback">❌<small>${escapeHtml(img.role_name || "图 " + img.index)}</small><span>${escapeHtml(img.error || "生成失败")}</span></div>
        </div>`;
      }
      return `<div class="ai-image-card">
        <img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.role_name || "")}" loading="lazy" />
        <div class="ai-image-meta">
          <span class="ai-image-role">${escapeHtml(img.role_name || "图 " + img.index)}</span>
          <a href="${escapeAttr(img.url)}" target="_blank" rel="noopener" download="${escapeAttr((img.role || "image") + ".png")}">下载</a>
        </div>
      </div>`;
    }).join("");
  }

  // ---- 渲染：历史 ----
  function renderHistory() {
    const box = $("ai_historyList");
    if (!box) return;
    if (!history.length) {
      box.innerHTML = `<div class="ai-history-empty muted-cell">暂无生成历史。</div>`;
      return;
    }
    box.innerHTML = history.map((h) => {
      const cover = (h.referenceImages && h.referenceImages[0]) || (h.images && h.images[0] && h.images[0].url) || "";
      return `<div class="ai-history-row">
        <div class="ai-history-cover">${cover ? `<img src="${escapeAttr(cover)}" alt="" />` : "<span>📷</span>"}</div>
        <div class="ai-history-info">
          <strong>${escapeHtml(h.productName || h.copy?.titleZh || "未命名")}</strong>
          <small>${escapeHtml(h.platform || "")} · ${escapeHtml(h.updatedAt || "")} · ${h.images ? h.images.filter((x) => x.ok).length + " 张图" : "无图"}</small>
        </div>
        <div class="ai-history-actions">
          <button class="secondary" type="button" data-hist-load="${escapeAttr(h.id)}">回填</button>
          <button class="danger" type="button" data-hist-del="${escapeAttr(h.id)}">删除</button>
        </div>
      </div>`;
    }).join("");
  }

  function renderAll() {
    fillForm();
    renderThumbs();
    renderCopy();
    renderImages();
    renderHistory();
  }

  // ---- 状态条 ----
  function setStatus(msg, busy = false) {
    const el = $("ai_status");
    if (el) el.textContent = msg;
    state.busy = busy;
    ["ai_generateAll", "ai_generateCopy", "ai_generateImages"].forEach((id) => {
      const b = $(id);
      if (b) b.disabled = busy;
    });
  }

  // ---- 调后端：收集请求体 ----
  function buildRequestBody() {
    return {
      productName: state.productName,
      extraInfo: state.extraInfo,
      platform: state.platform,
      referenceImages: state.referenceImages,
    };
  }

  // ---- 保存到历史 ----
  function pushHistory() {
    const item = {
      id: uid(),
      updatedAt: nowIso(),
      productName: state.productName,
      platform: state.platform,
      referenceImages: state.referenceImages.slice(0, 2),   // 只存前 2 张参考图，节省 localStorage
      copy: state.copy,
      images: (state.images || []).map((img) => ({ ...img, url: img.url })).slice(0, 9),
    };
    history.unshift(item);
    history = history.slice(0, 50);
    saveHistory();
    renderHistory();
  }

  // ---- 生成：文案 ----
  async function doGenerateCopy() {
    readForm();
    if (!state.referenceImages.length && !state.extraInfo) {
      alert("请至少上传 1 张参考图，或在「补充卖点」里填写产品信息。");
      return;
    }
    setStatus("正在分析图片并生成俄文文案…", true);
    try {
      // 先识图（若尚未识图），再生成文案
      let analysis = state.analysis;
      if (!analysis && state.referenceImages.length) {
        const ar = await fetch(API("analyze"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildRequestBody()),
        }).then((r) => r.json());
        if (!ar.ok) throw new Error(ar.error || "识图失败");
        analysis = ar.analysis;
        state.analysis = analysis;
      }
      const cr = await fetch(API("generate-copy"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...buildRequestBody(), analysis }),
      }).then((r) => r.json());
      if (!cr.ok) throw new Error(cr.error || "文案生成失败");
      state.copy = {
        title: cr.title, description: cr.description, tags: cr.tags,
        titleZh: cr.titleZh, descriptionZh: cr.descriptionZh, tagsZh: cr.tagsZh,
      };
      renderCopy();
      setStatus("文案已生成 ✅ 可继续生成主图，或一键生成全部。", false);
      pushHistory();
    } catch (e) {
      setStatus("文案生成失败：" + (e.message || e), false);
      alert("文案生成失败：" + (e.message || e));
    }
  }

  // ---- 生成：图片 ----
  async function doGenerateImages() {
    readForm();
    if (!state.referenceImages.length && !state.extraInfo && !state.analysis) {
      alert("请先上传参考图或填写产品信息。");
      return;
    }
    setStatus("正在生成 9 张主图，每张约 10~20 秒，请耐心等待…", true);
    try {
      let analysis = state.analysis;
      if (!analysis && state.referenceImages.length) {
        const ar = await fetch(API("analyze"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildRequestBody()),
        }).then((r) => r.json());
        if (!ar.ok) throw new Error(ar.error || "识图失败");
        analysis = ar.analysis;
        state.analysis = analysis;
      }
      const ir = await fetch(API("generate-images"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...buildRequestBody(), analysis, copy: state.copy }),
      }).then((r) => r.json());
      if (!ir.ok) throw new Error(ir.error || "生图失败");
      // 远端 URL 转 dataURL，便于本地持久化与下载
      setStatus("正在缓存图片到本地…", true);
      const imgs = [];
      for (const r of (ir.results || [])) {
        if (r.ok) {
          const dataUrl = await urlToDataURL(r.url);
          imgs.push({ ...r, url: dataUrl });
        } else {
          imgs.push(r);
        }
      }
      state.images = imgs;
      renderImages();
      const okCount = imgs.filter((x) => x.ok).length;
      setStatus(`主图生成完成 ✅ 成功 ${okCount}/${imgs.length} 张。`, false);
      pushHistory();
    } catch (e) {
      setStatus("生图失败：" + (e.message || e), false);
      alert("生图失败：" + (e.message || e));
    }
  }

  // ---- 生成：一键全流程 ----
  async function doGenerateAll() {
    readForm();
    if (!state.referenceImages.length && !state.extraInfo) {
      alert("请至少上传 1 张参考图，或在「补充卖点」里填写产品信息。");
      return;
    }
    setStatus("一键生成中：识图 → 文案 → 9 张主图，全程约 2~4 分钟…", true);
    try {
      const res = await fetch(API("generate-all"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildRequestBody()),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "生成失败");
      state.analysis = res.analysis;
      state.copy = res.copy;
      // 远端图片转 dataURL
      setStatus("正在缓存图片到本地…", true);
      const imgs = [];
      for (const r of (res.images?.results || [])) {
        if (r.ok) {
          const dataUrl = await urlToDataURL(r.url);
          imgs.push({ ...r, url: dataUrl });
        } else {
          imgs.push(r);
        }
      }
      state.images = imgs;
      renderCopy();
      renderImages();
      const okCount = imgs.filter((x) => x.ok).length;
      setStatus(`一键生成完成 ✅ 文案已生成，主图成功 ${okCount}/${imgs.length} 张。`, false);
      pushHistory();
    } catch (e) {
      setStatus("一键生成失败：" + (e.message || e), false);
      alert("一键生成失败：" + (e.message || e));
    }
  }

  // ---- 复制到剪贴板 ----
  async function copyText(text, label = "内容") {
    if (!text || text === "—") { alert("暂无内容可复制。"); return; }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`已复制${label}到剪贴板 ✅`, state.busy);
    } catch {
      // 降级：选中文本
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setStatus(`已复制${label} ✅`, state.busy); }
      catch { alert("复制失败，请手动选中复制。"); }
      document.body.removeChild(ta);
    }
  }

  // ---- 事件绑定 ----
  function bindEvents() {
    // 图片上传（点击 + 拖拽）
    const dropzone = $("aiDropzone");
    const fileInput = $("ai_images");
    if (fileInput) {
      fileInput.addEventListener("change", async (e) => {
        const files = [...(e.target.files || [])];
        for (const file of files) {
          if (file.size > 4 * 1024 * 1024) { alert(`${file.name} 超过 4MB，已跳过（请压缩后再传）。`); continue; }
          try {
            const dataUrl = await readFileAsDataURL(file);
            state.referenceImages.push(dataUrl);
          } catch (err) {
            alert(`${file.name} 读取失败：${err.message}`);
          }
        }
        e.target.value = "";
        renderThumbs();
      });
    }
    if (dropzone) {
      ["dragover", "dragenter"].forEach((ev) => {
        dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("is-drag"); });
      });
      ["dragleave", "drop"].forEach((ev) => {
        dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("is-drag"); });
      });
      dropzone.addEventListener("drop", async (e) => {
        const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
        for (const file of files) {
          if (file.size > 4 * 1024 * 1024) { alert(`${file.name} 超过 4MB，已跳过。`); continue; }
          try {
            const dataUrl = await readFileAsDataURL(file);
            state.referenceImages.push(dataUrl);
          } catch (err) {
            alert(`${file.name} 读取失败：${err.message}`);
          }
        }
        renderThumbs();
      });
    }

    // 移除参考图
    $("ai_thumbRow")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-rm-img]");
      if (!btn) return;
      const i = Number(btn.getAttribute("data-rm-img"));
      state.referenceImages.splice(i, 1);
      // 移除参考图后清空识图缓存，强制下次重新分析
      state.analysis = null;
      renderThumbs();
    });

    // 表单实时回写
    ["ai_productName", "ai_extraInfo", "ai_platform"].forEach((id) => {
      $(id)?.addEventListener("input", readForm);
      $(id)?.addEventListener("change", readForm);
    });

    // 生成按钮
    $("ai_generateAll")?.addEventListener("click", doGenerateAll);
    $("ai_generateCopy")?.addEventListener("click", doGenerateCopy);
    $("ai_generateImages")?.addEventListener("click", doGenerateImages);

    // 复制按钮
    $("ai_copyTitle")?.addEventListener("click", () => copyText(state.copy?.title, "标题"));
    $("ai_copyDesc")?.addEventListener("click", () => copyText(state.copy?.description, "描述"));
    $("ai_copyTags")?.addEventListener("click", () => copyText(state.copy?.tags, "标签"));
    $("ai_copyAllRu")?.addEventListener("click", () => {
      const c = state.copy || {};
      const text = `Название: ${c.title || ""}\n\nОписание: ${c.description || ""}\n\nХэштеги: ${c.tags || ""}`;
      copyText(text, "完整俄文");
    });

    // 打包下载（逐张在新窗口打开，浏览器原生下载）
    $("ai_downloadAll")?.addEventListener("click", () => {
      const ok = (state.images || []).filter((x) => x.ok);
      if (!ok.length) { alert("暂无成功生成的图片。"); return; }
      ok.forEach((img, i) => {
        setTimeout(() => {
          const a = document.createElement("a");
          a.href = img.url;
          a.download = `${img.role || "image"}_${i + 1}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, i * 250);
      });
    });

    // 历史：回填 + 删除
    $("ai_historyList")?.addEventListener("click", (e) => {
      const load = e.target.closest("[data-hist-load]");
      const del = e.target.closest("[data-hist-del]");
      if (load) {
        const id = load.getAttribute("data-hist-load");
        const h = history.find((x) => x.id === id);
        if (!h) return;
        state.referenceImages = [...(h.referenceImages || [])];
        state.productName = h.productName || "";
        state.platform = h.platform || "Ozon";
        state.copy = h.copy || null;
        state.images = h.images || [];
        state.analysis = null;
        renderAll();
        $("aiStudio")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (del) {
        const id = del.getAttribute("data-hist-del");
        if (confirm("确认删除该条历史？")) {
          history = history.filter((x) => x.id !== id);
          saveHistory();
          renderHistory();
        }
      }
    });

    // 清空历史
    $("ai_clearHistory")?.addEventListener("click", () => {
      if (!history.length) { alert("历史已为空。"); return; }
      if (confirm(`确认清空全部 ${history.length} 条历史？此操作不可撤销。`)) {
        history = [];
        saveHistory();
        renderHistory();
      }
    });
  }

  // ---- 启动 ----
  function init() {
    injectShell();
    bindEvents();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
