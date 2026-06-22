/* =========================================================
 *  AI 生图 / 文本工作室 — 纯前端提示词生成器 + 同款链接抓取
 *  ---------------------------------------------------------
 *  独立自包含模块（与 sourcing.js / listing.js 同构）：
 *    - 自带 localStorage key，不与 main.js 共用存储；
 *    - 自行注入导航按钮、页面 DOM、事件；
 *
 *  工作流：上传参考图 + 填产品名 →
 *    ① 可选：粘贴同款链接（Ozon / WB / 1688 / 拼多多 / 淘宝）→ 后端抓取并自动提取卖点
 *    ② 可选：手动粘贴一段产品描述 → 后端提炼核心卖点
 *    ③ 一键生成：俄文文案提示词 + 整套 9 张主图提示词（已自动整合抓取的卖点）
 *    ④ 复制提示词 → 去 ChatGPT / GPT-Image 手动生成
 *    ⑤ 历史记录（localStorage 持久化，KV 后端缓存按 URL 永久）
 * ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "ozon_wb_ai_studio_history_v1";
  const TAB_ID = "aiStudio";
  const TAB_LABEL = "🎨 AI生图/文本";
  const API = (sub) => `/api/ai-studio/${sub}`;

  // ---- 局部工具 ----
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

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("读取文件失败"));
      r.readAsDataURL(file);
    });
  }

  // ---- 状态 ----
  const state = {
    referenceImages: [],
    productName: "",
    extraInfo: "",
    platform: "Ozon",
    similarUrl: "",         // 同款链接
    similarExtracted: null, // 后端抓取结果
    prompts: null,
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
          <p>上传参考图 + 填产品信息 +（可选）粘贴同款链接自动提取卖点 → 一键生成俄文文案与 9 张主图提示词。零 API 成本。</p>
        </div>
        <span class="live-chip"><span></span>提示词 + 同款抓取</span>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h3>第一步 · 上传参考图 + 产品信息</h3>
          <span class="status">第一张为产品主体参考。</span>
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
            <label class="inline-select">目标平台
              <select id="ai_platform">
                <option value="Ozon">Ozon</option>
                <option value="WB">Wildberries</option>
                <option value="Yandex">Yandex.Market</option>
              </select>
            </label>
            <label>补充卖点 / 参数（可选，AI 也会自动从同款抓取）
              <textarea id="ai_extraInfo" rows="4" placeholder="例如：长6.85cm，高14.4cm，重210g，电池容量20000毫安，自带数据线，多U口输出，电量数显，聚合物锂离子电芯，带LED手电"></textarea>
            </label>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h3>第二步 ·（可选）粘贴同款链接，自动提取卖点</h3>
          <span class="status">支持 Ozon / Wildberries / 1688 / 拼多多 / 淘宝，结果按 URL 永久缓存。</span>
        </div>
        <div class="ai-similar-row">
          <input id="ai_similarUrl" type="url" placeholder="粘贴同款产品链接（Ozon / WB / 1688 / 拼多多）" />
          <button class="primary" type="button" id="ai_fetchSimilar">抓取并提取</button>
        </div>
        <div id="ai_similarStatus" class="table-status">未抓取同款。粘贴链接后点击抓取，可自动识别品类与卖点。</div>
        <div id="ai_similarCard" class="ai-similar-card" hidden>
          <div class="ai-similar-meta">
            <div class="ai-similar-title" id="ai_similarTitle"></div>
            <div class="ai-similar-tags">
              <span class="ai-tag" id="ai_similarSource"></span>
              <span class="ai-tag" id="ai_similarCategory"></span>
            </div>
            <div class="ai-similar-specs" id="ai_similarSpecs"></div>
          </div>
          <div class="ai-similar-highlights">
            <strong>自动提取的核心卖点（已整合到主图提示词）：</strong>
            <ul id="ai_similarHighlights"></ul>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="actions ai-studio-actions">
          <button class="primary" type="button" id="ai_generateAll">🚀 一键生成全部提示词</button>
          <button class="secondary" type="button" id="ai_clearForm">清空</button>
        </div>
        <div id="ai_status" class="table-status">就绪。填好信息后点击生成。</div>
      </section>

      <section class="panel" id="ai_promptsPanel" hidden>
        <div class="toolbar">
          <h3>第三步 · 生成的提示词（2 个 Tab：文案 + 整套主图）</h3>
          <span class="status">点击「复制」按钮，连同参考图粘贴到 ChatGPT / GPT-Image 即可生成。</span>
        </div>
        <div class="ai-prompt-tabs">
          <button class="ai-prompt-tab active" type="button" data-prompt-tab="copy">📝 俄文文案提示词</button>
          <button class="ai-prompt-tab" type="button" data-prompt-tab="group">🖼️ 整套 9 张主图提示词</button>
        </div>
        <div class="ai-prompt-pane active" data-prompt-pane="copy">
          <div class="ai-prompt-block">
            <div class="ai-prompt-block-head">
              <span>俄文文案生成提示词（直接粘贴到 ChatGPT 对话框）</span>
              <button class="secondary" type="button" data-copy="copyPrompt">复制</button>
            </div>
            <pre id="ai_copyPrompt" class="ai-prompt-text"></pre>
          </div>
        </div>
        <div class="ai-prompt-pane" data-prompt-pane="group">
          <div class="ai-prompt-block">
            <div class="ai-prompt-block-head">
              <span>整套 9 张主图统一提示词（粘贴到 GPT-Image 一次性生成整套）</span>
              <button class="secondary" type="button" data-copy="groupPrompt">复制</button>
            </div>
            <pre id="ai_groupPrompt" class="ai-prompt-text"></pre>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h3>历史记录</h3>
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

  function readForm() {
    state.productName = $("ai_productName")?.value.trim() || "";
    state.extraInfo = $("ai_extraInfo")?.value.trim() || "";
    state.platform = $("ai_platform")?.value || "Ozon";
    state.similarUrl = $("ai_similarUrl")?.value.trim() || "";
  }
  function fillForm() {
    if ($("ai_productName")) $("ai_productName").value = state.productName || "";
    if ($("ai_extraInfo")) $("ai_extraInfo").value = state.extraInfo || "";
    if ($("ai_platform")) $("ai_platform").value = state.platform || "Ozon";
    if ($("ai_similarUrl")) $("ai_similarUrl").value = state.similarUrl || "";
  }

  // ---- 核心：生成提示词 ----
  function mergeSellingPoints() {
    // 优先级：手动补充 > 抓取结果 > 内置品类模板
    const parts = [];
    if (state.extraInfo) parts.push(`【手动补充】\n${state.extraInfo}`);
    if (state.similarExtracted) {
      const e = state.similarExtracted;
      if (e.title) parts.push(`【同款标题】\n${e.title}`);
      if (e.description) parts.push(`【同款描述】\n${e.description}`);
      if (e.highlights && e.highlights.length) {
        parts.push(`【自动提取的卖点】\n${e.highlights.map((h, i) => `${i + 1}. ${h}`).join("\n")}`);
      }
      if (e.specs && Object.keys(e.specs).length) {
        const specs = Object.entries(e.specs).map(([k, v]) => `${k}: ${v}`).join("，");
        parts.push(`【自动提取的参数】\n${specs}`);
      }
    }
    return parts.join("\n\n");
  }

  function buildCopyPrompt() {
    const productName = state.productName || "该产品";
    const extra = mergeSellingPoints();
    const platform = state.platform;
    return `请你扮演一位资深的俄罗斯本土电商文案专家和 Yandex SEO 优化师。接下来，我会发给你几张产品图片。请仔细分析图片中的产品外观、功能、卖点及目标受众，为我生成一份地道、高转化率的俄语电商商品详情文案。

具体要求如下：

俄语标题（Название）：必须符合俄罗斯主流电商平台（如 Ozon, Wildberries, Yandex.Market）的搜索习惯。使用本地消费者真实搜索的高频长尾词和核心词，结构紧凑，卖点前置。

俄语简介（Описание）：文案需极具吸引力且专业。突出核心优势、使用场景和材质细节，语言必须是纯正的俄语母语表达，带有强烈的购买引导（Call to Action），绝对避免机器翻译的生硬感。

主题标签（Теги/Хэштеги）：生成 20 个用于优化 SEO 的俄语标签，必须包含大词、精准属性词和场景词，符合 Yandex 搜索词逻辑。

排版与翻译：先完整输出俄文版本，然后使用分割线隔开，在结尾附上对应的完整中文翻译。

输出格式：

[俄文版本]
Название: [生成地道的俄文标题]
Описание: [生成分段清晰的俄文简介，可使用 Emoji 作为列表符号增强阅读体验]
Хэштеги: [20 个俄文 SEO 标签，以 # 开头，空格隔开]

[中文翻译版本]
商品标题：[中文标题]
商品简介：[中文简介]
主题标签：[20 个中文标签]

【本次生成的产品信息】
产品名称：${productName}
目标平台：${platform}
${extra ? `产品资料（请在文案中重点突出以下卖点/参数）：\n${extra}` : "（未提供补充信息，请从参考图自行分析卖点）"}`;
  }

  function buildGroupImagePrompt() {
    const productName = state.productName || "该产品";
    const extra = mergeSellingPoints();
    const platform = state.platform;
    const sizeReq = '3:4 竖版（建议 1200×1600px，适配 Ozon / WB / Yandex.Market 主图）';
    const highlights = state.similarExtracted?.highlights?.join("；") || "";
    return `生成一组${platform}电商主图，共 9 张（1 张封面 + 2 张展示 + 3 张卖点 + 1 张细节 + 1 张使用说明 + 1 张产品详情），整套图色系风格须完全一致，商业级精修。

【产品信息】
产品：${productName}
${extra ? `核心卖点/参数：\n${extra}` : "（请从参考图识别核心卖点）"}

${highlights ? `【重点突出以下卖点（按重要性排序）】\n${state.similarExtracted.highlights.map((h, i) => `${i + 1}. ${h}`).join("\n")}` : ""}

【整套图统一要求】
- 尺寸：${sizeReq}
- 画面中出现的所有文案、标签、按钮、参数必须是地道俄文（кириллица），无错别字、无伪文字、无乱码。
- 严格保持产品外观、颜色、形状、比例与参考图一致，不得擅自改变产品工业设计或添加不存在的功能。
- 构图干净，白底或浅色生活化场景，主体居中突出。
- 整套 9 张图色调、字体、版式必须保持统一（主色 + 辅色 + 光感一致）。

【9 张图角色分工】
1. 封面主图：抓眼球且突出产品主体，带符合应用场景的真实使用者；
2. 展示图 1：清晰展示产品全貌与典型使用场景；
3. 展示图 2：另一角度展示产品全貌与使用场景；
4. 卖点图 1：聚焦第 1 个核心卖点；
5. 卖点图 2：聚焦第 2 个核心卖点；
6. 卖点图 3：聚焦第 3 个核心卖点；
7. 细节图：聚焦材质、接口、做工等细节特写；
8. 使用说明图：简明图示使用方法 / 步骤；
9. 产品详情图：汇总核心参数的详情图。

请严格依据我提供的参考图生成，保持产品一致性。`;
  }

  // ---- 抓取同款 ----
  async function fetchSimilar() {
    readForm();
    const url = state.similarUrl;
    if (!url) { alert("请先粘贴同款链接。"); return; }
    setStatus("正在抓取同款页面…", true);
    try {
      const res = await fetch(API("fetch-similar"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "抓取失败");
      state.similarExtracted = res.extracted;
      renderSimilarCard(res);
      setStatus(`已抓取同款 ✅ 来源：${res.source === "cache" ? "KV 缓存" : "实时"}，识别品类：${res.extracted.categoryName || "通用"}`, false);
    } catch (e) {
      setStatus("抓取失败：" + (e.message || e), false);
      alert("抓取失败：" + (e.message || e));
    }
  }

  function renderSimilarCard(res) {
    const card = $("ai_similarCard");
    const status = $("ai_similarStatus");
    if (!card) return;
    const e = res.extracted;
    card.hidden = false;
    $("ai_similarTitle").textContent = e.title || e.description || "（未提取到标题）";
    $("ai_similarSource").textContent = res.source === "cache" ? "✅ KV 缓存" : "🆕 实时抓取";
    $("ai_similarCategory").textContent = e.categoryName || "通用";
    // 参数
    const specsBox = $("ai_similarSpecs");
    if (specsBox) {
      const specs = e.specs ? Object.entries(e.specs) : [];
      specsBox.innerHTML = specs.length
        ? `<strong>关键参数：</strong> ${specs.map(([k, v]) => `<span class="ai-tag">${escapeHtml(k)}: ${escapeHtml(v)}</span>`).join(" ")}`
        : "";
    }
    // 卖点
    const ul = $("ai_similarHighlights");
    ul.innerHTML = (e.highlights || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("");
    if (status) status.textContent = `同款已识别为「${e.categoryName || "通用"}」品类，已自动提取 ${e.highlights?.length || 0} 条核心卖点。`;
  }

  function generateAll() {
    readForm();
    if (!state.productName && !state.extraInfo && !state.referenceImages.length) {
      alert("请至少填写产品名称，或上传参考图，或填写补充卖点。");
      return;
    }
    state.prompts = {
      copyPrompt: buildCopyPrompt(),
      groupPrompt: buildGroupImagePrompt(),
    };
    renderPrompts();
    pushHistory();
    setStatus("提示词已生成 ✅ 已自动整合同款抓取的卖点（如有）。", false);
    $("ai_promptsPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- 渲染 ----
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

  function renderPrompts() {
    const panel = $("ai_promptsPanel");
    if (!panel) return;
    if (!state.prompts) { panel.hidden = true; return; }
    panel.hidden = false;
    $("ai_copyPrompt").textContent = state.prompts.copyPrompt;
    $("ai_groupPrompt").textContent = state.prompts.groupPrompt;
  }

  function renderHistory() {
    const box = $("ai_historyList");
    if (!box) return;
    if (!history.length) {
      box.innerHTML = `<div class="ai-history-empty muted-cell">暂无历史记录。</div>`;
      return;
    }
    box.innerHTML = history.map((h) => {
      const cover = (h.referenceImages && h.referenceImages[0]) || "";
      return `<div class="ai-history-row">
        <div class="ai-history-cover">${cover ? `<img src="${escapeAttr(cover)}" alt="" />` : "<span>📷</span>"}</div>
        <div class="ai-history-info">
          <strong>${escapeHtml(h.productName || "未命名")}</strong>
          <small>${escapeHtml(h.platform || "")} · ${escapeHtml(h.updatedAt || "")}${h.similarUrl ? " · 含同款" : ""}</small>
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
    renderPrompts();
    renderHistory();
  }

  function setStatus(msg, busy = false) {
    const el = $("ai_status");
    if (el) el.textContent = msg;
    const btn = $("ai_generateAll");
    const fetchBtn = $("ai_fetchSimilar");
    if (btn) btn.disabled = busy;
    if (fetchBtn) fetchBtn.disabled = busy;
  }

  // ---- 历史 ----
  function pushHistory() {
    const item = {
      id: uid(),
      updatedAt: nowIso(),
      productName: state.productName,
      platform: state.platform,
      similarUrl: state.similarUrl,
      referenceImages: state.referenceImages.slice(0, 2),
      prompts: state.prompts,
      similarExtracted: state.similarExtracted,
    };
    history.unshift(item);
    history = history.slice(0, 50);
    saveHistory();
    renderHistory();
  }

  // ---- 复制 ----
  async function copyText(text, label = "提示词") {
    if (!text) { alert("暂无内容可复制。"); return; }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`已复制${label} ✅`, false);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setStatus(`已复制${label} ✅`, false); }
      catch { alert("复制失败，请手动选中复制。"); }
      document.body.removeChild(ta);
    }
  }

  // ---- 事件 ----
  function bindEvents() {
    const dropzone = $("aiDropzone");
    const fileInput = $("ai_images");
    if (fileInput) {
      fileInput.addEventListener("change", async (e) => {
        for (const file of [...(e.target.files || [])]) {
          if (file.size > 4 * 1024 * 1024) { alert(`${file.name} 超过 4MB，已跳过（请压缩后再传）。`); continue; }
          try { state.referenceImages.push(await readFileAsDataURL(file)); }
          catch (err) { alert(`${file.name} 读取失败：${err.message}`); }
        }
        e.target.value = "";
        renderThumbs();
      });
    }
    if (dropzone) {
      ["dragover", "dragenter"].forEach((ev) =>
        dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("is-drag"); })
      );
      ["dragleave", "drop"].forEach((ev) =>
        dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("is-drag"); })
      );
      dropzone.addEventListener("drop", async (e) => {
        const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
        for (const file of files) {
          if (file.size > 4 * 1024 * 1024) { alert(`${file.name} 超过 4MB，已跳过。`); continue; }
          try { state.referenceImages.push(await readFileAsDataURL(file)); }
          catch (err) { alert(`${file.name} 读取失败：${err.message}`); }
        }
        renderThumbs();
      });
    }

    $("ai_thumbRow")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-rm-img]");
      if (!btn) return;
      state.referenceImages.splice(Number(btn.getAttribute("data-rm-img")), 1);
      renderThumbs();
    });

    ["ai_productName", "ai_extraInfo", "ai_platform", "ai_similarUrl"].forEach((id) => {
      $(id)?.addEventListener("input", readForm);
      $(id)?.addEventListener("change", readForm);
    });

    $("ai_fetchSimilar")?.addEventListener("click", fetchSimilar);
    $("ai_generateAll")?.addEventListener("click", generateAll);
    $("ai_clearForm")?.addEventListener("click", () => {
      if (!confirm("确认清空当前表单与参考图？（历史记录不受影响）")) return;
      state.referenceImages = [];
      state.productName = "";
      state.extraInfo = "";
      state.platform = "Ozon";
      state.similarUrl = "";
      state.similarExtracted = null;
      state.prompts = null;
      const card = $("ai_similarCard");
      if (card) card.hidden = true;
      renderAll();
      setStatus("已清空。", false);
    });

    document.querySelectorAll("[data-prompt-tab]")?.forEach((tab) => {
      tab.addEventListener("click", () => {
        const key = tab.dataset.promptTab;
        document.querySelectorAll("[data-prompt-tab]").forEach((t) => t.classList.toggle("active", t === tab));
        document.querySelectorAll("[data-prompt-pane]").forEach((p) => {
          p.classList.toggle("active", p.dataset.promptPane === key);
        });
      });
    });

    $("ai_promptsPanel")?.addEventListener("click", (e) => {
      const copyBtn = e.target.closest("[data-copy]");
      if (!copyBtn) return;
      const key = copyBtn.getAttribute("data-copy");
      const map = { copyPrompt: "文案提示词", groupPrompt: "整套主图提示词" };
      copyText(state.prompts?.[key], map[key] || "提示词");
    });

    $("ai_historyList")?.addEventListener("click", (e) => {
      const load = e.target.closest("[data-hist-load]");
      const del = e.target.closest("[data-hist-del]");
      if (load) {
        const h = history.find((x) => x.id === load.getAttribute("data-hist-load"));
        if (!h) return;
        state.referenceImages = [...(h.referenceImages || [])];
        state.productName = h.productName || "";
        state.platform = h.platform || "Ozon";
        state.similarUrl = h.similarUrl || "";
        state.similarExtracted = h.similarExtracted || null;
        state.prompts = h.prompts || null;
        renderAll();
        if (state.similarExtracted) {
          renderSimilarCard({ source: "cache", extracted: state.similarExtracted });
        }
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

    $("ai_clearHistory")?.addEventListener("click", () => {
      if (!history.length) { alert("历史已为空。"); return; }
      if (confirm(`确认清空全部 ${history.length} 条历史？`)) {
        history = [];
        saveHistory();
        renderHistory();
      }
    });
  }

  function init() {
    injectShell();
    bindEvents();
    renderAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
