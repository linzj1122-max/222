/* =========================================================
 *  货盘管理模块（货盘 / Sourcing Tray）
 *  ---------------------------------------------------------
 *  独立自包含模块：
 *    - 自带 localStorage key，不与 main.js 共用存储；
 *    - 自行注入导航按钮、页面 DOM、表单、表格；
 *    - 自行绑定事件，不修改 main.js 任何逻辑；
 *  依赖：全局 window.XLSX（页面已通过 CDN 引入 xlsx.full.min.js）。
 *  ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "ozon_wb_sourcing_v1";
  const TAB_ID = "sourcing";
  const TAB_LABEL = "🧺 货盘管理";

  // ---- 工具函数（局部，避免污染全局） ----
  const $ = (id) => document.getElementById(id);
  const rmb = (v) => `¥${Number(v || 0).toFixed(2)}`;
  const escapeHtml = (v) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  const nowIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const normHeader = (v) =>
    String(v ?? "").replace(/\s+/g, "").replaceAll("\uFF0C", ",").toLowerCase();
  const toNumber = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const cleaned = String(v ?? "")
      .replace(/\s/g, "")
      .replace("%", "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // ---- 字段定义（初版，后续可增减） ----
  const FIELDS = [
    { key: "code",      label: "货号",       hint: "可关联现有产品货号",   required: false, type: "text"   },
    { key: "name",      label: "品名",       hint: "必填",                 required: true,  type: "text"   },
    { key: "supplier",  label: "供应商",     hint: "厂家 / 供货商",        required: false, type: "text"   },
    { key: "spec",      label: "规格/款式",  hint: "颜色 / 尺寸 / 型号",   required: false, type: "text"   },
    { key: "price",     label: "采购价 RMB", hint: "单件采购价",           required: false, type: "number" },
    { key: "moq",       label: "起订量",     hint: "Minimum Order Qty",    required: false, type: "number" },
    { key: "stock",     label: "可供货量",   hint: "厂家库存",             required: false, type: "number" },
    { key: "leadTime",  label: "发货周期(天)", hint: "下单到发货天数",      required: false, type: "number" },
    { key: "origin",    label: "发货地",     hint: "如 义乌 / 广州",       required: false, type: "text"   },
    { key: "link",      label: "下单链接",   hint: "1688 / 工厂下单网址",  required: false, type: "url"    },
    { key: "note",      label: "备注",       hint: "可选",                 required: false, type: "text"   },
  ];

  // ---- 状态 ----
  let tray = [];
  try {
    tray = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") || [];
  } catch { tray = []; }
  let editingId = null;

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tray));
    } catch (e) {
      console.warn("[sourcing] 保存失败：", e);
      alert("货盘数据保存失败，可能浏览器存储已满。");
    }
  };

  // ---- UI 注入：导航按钮 + 页面容器 ----
  function injectShell() {
    // 1) 侧边栏导航按钮 —— 插入到「竞品跟价」之后、「店铺设置」之前
    const nav = document.querySelector("aside nav");
    if (nav && !document.querySelector(`[data-tab="${TAB_ID}"]`)) {
      const btn = document.createElement("button");
      btn.className = "tab-btn";
      btn.dataset.tab = TAB_ID;
      btn.type = "button";
      btn.innerHTML = `<span>🧺</span>货盘管理`;
      const settingsBtn = nav.querySelector('[data-tab="settings"]');
      if (settingsBtn) nav.insertBefore(btn, settingsBtn);
      else nav.appendChild(btn);
      // 挂接 tab 切换（与 main.js 的 .tab-btn 逻辑一致，互不干扰）
      btn.addEventListener("click", () => activateTab(TAB_ID));
    }

    // 2) 页面 section —— 追加到 <main> 末尾
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
          <h2>货盘管理</h2>
          <p>维护供货商货盘：可单个添加，也可通过 Excel / CSV 批量导入。字段为初版，后续可调整。</p>
        </div>
        <span class="live-chip"><span></span>供货视角</span>
      </section>

      <div class="grid split">
        <section class="panel">
          <h3 id="sourcingFormTitle">添加货盘</h3>
          <form id="sourcingForm">
            <input id="sourcingEditId" type="hidden" />
            <div class="cols-2">
              <label>货号<input id="src_code" type="text" placeholder="可关联现有产品货号" /></label>
              <label>品名 <small style="color:var(--red)">*</small><input id="src_name" type="text" required placeholder="例如 电动按摩器" /></label>
            </div>
            <div class="cols-2">
              <label>供应商<input id="src_supplier" type="text" placeholder="厂家 / 供货商" /></label>
              <label>规格/款式<input id="src_spec" type="text" placeholder="颜色 / 尺寸 / 型号" /></label>
            </div>
            <div class="cols-3">
              <label>采购价 RMB<input id="src_price" type="number" step="0.01" min="0" value="0" /></label>
              <label>起订量<input id="src_moq" type="number" step="1" min="0" value="0" /></label>
              <label>可供货量<input id="src_stock" type="number" step="1" min="0" value="0" /></label>
            </div>
            <div class="cols-2">
              <label>发货周期(天)<input id="src_leadTime" type="number" step="1" min="0" value="0" /></label>
              <label>发货地<input id="src_origin" type="text" placeholder="如 义乌 / 广州" /></label>
            </div>
            <label>下单链接<input id="src_link" type="url" placeholder="https://detail.1688.com/..." /></label>
            <label>备注<input id="src_note" type="text" placeholder="可选" /></label>
            <div class="actions">
              <button class="primary" type="submit" id="sourcingSubmitBtn">保存货盘</button>
              <button class="secondary" type="button" id="resetSourcingForm">清空表单</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="toolbar">
            <h3>货盘清单</h3>
            <input class="search" id="sourcingSearch" placeholder="搜索品名、货号、供应商、规格" />
          </div>
          <div class="actions" style="margin-bottom:12px">
            <button class="secondary" id="exportSourcing" type="button">导出 CSV</button>
            <button class="secondary" id="importSourcing" type="button">导入表格</button>
            <button class="secondary" id="downloadSourcingTemplate" type="button">下载导入模板</button>
            <input id="importSourcingFile" type="file" accept=".xlsx,.xls,.csv" hidden />
          </div>
          <div id="sourcingImportStatus" class="table-status">提示：导入表格列名可包含「品名、货号、供应商、规格、采购价、起订量、供货量、发货周期、发货地、链接、备注」。</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>品名 / 货号</th>
                  <th>供应商</th>
                  <th>规格</th>
                  <th>采购价</th>
                  <th>起订量</th>
                  <th>供货量</th>
                  <th>发货</th>
                  <th>链接</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="sourcingRows"></tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  // ---- Tab 激活（与 main.js 行为一致，仅作用于本模块元素） ----
  function activateTab(id) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    const btn = document.querySelector(`[data-tab="${id}"]`);
    const panel = $(id);
    if (btn) btn.classList.add("active");
    if (panel) panel.classList.add("active");
    const title = $("pageTitle");
    if (title && btn) title.textContent = btn.textContent.trim();
    render();
  }

  // ---- 表单读写 ----
  function readForm() {
    const item = { id: $("sourcingEditId").value || uid(), updatedAt: nowIso() };
    FIELDS.forEach((f) => {
      const el = $(`src_${f.key}`);
      const raw = el ? el.value.trim() : "";
      item[f.key] = f.type === "number" ? (raw === "" ? 0 : toNumber(raw)) : raw;
    });
    return item;
  }

  function fillForm(item) {
    editingId = item.id || null;
    $("sourcingEditId").value = item.id || "";
    FIELDS.forEach((f) => {
      const el = $(`src_${f.key}`);
      if (el) el.value = item[f.key] ?? (f.type === "number" ? 0 : "");
    });
    $("sourcingFormTitle").textContent = "编辑货盘";
    $("sourcingSubmitBtn").textContent = "保存修改";
    document.getElementById("sourcingForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    editingId = null;
    $("sourcingForm")?.reset();
    $("sourcingEditId").value = "";
    $("sourcingFormTitle").textContent = "添加货盘";
    $("sourcingSubmitBtn").textContent = "保存货盘";
    // 数值字段回默认 0
    FIELDS.filter((f) => f.type === "number").forEach((f) => {
      const el = $(`src_${f.key}`);
      if (el) el.value = 0;
    });
  }

  // ---- 渲染 ----
  function render() {
    const tbody = $("sourcingRows");
    if (!tbody) return;
    const kw = ($("sourcingSearch")?.value || "").trim().toLowerCase();
    const rows = tray.filter((it) =>
      !kw ||
      [it.name, it.code, it.supplier, it.spec, it.origin, it.note]
        .map((v) => String(v || ""))
        .join(" ")
        .toLowerCase()
        .includes(kw)
    );

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="muted-cell">暂无货盘数据，可在左侧表单添加或导入表格。</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((it) => {
        const head = `<strong>${escapeHtml(it.name || "未命名")}</strong>` +
          (it.code ? `<div class="sku">${escapeHtml(it.code)}</div>` : "");
        const link = it.link
          ? `<a href="${escapeHtml(it.link)}" target="_blank" rel="noopener">去下单</a>`
          : `<span class="muted-cell">—</span>`;
        const ship = [it.leadTime ? `${it.leadTime}天` : "", it.origin || ""]
          .filter(Boolean).join(" / ") || "—";
        return `
          <tr>
            <td>${head}</td>
            <td>${escapeHtml(it.supplier || "—")}</td>
            <td>${escapeHtml(it.spec || "—")}</td>
            <td class="money">${rmb(it.price)}</td>
            <td>${Number(it.moq || 0)}</td>
            <td>${Number(it.stock || 0)}</td>
            <td>${escapeHtml(ship)}</td>
            <td>${link}</td>
            <td>${escapeHtml(it.note || "—")}</td>
            <td class="actions">
              <button class="secondary" data-src-edit="${escapeHtml(it.id)}">编辑</button>
              <button class="danger" data-src-del="${escapeHtml(it.id)}">删除</button>
            </td>
          </tr>`;
      })
      .join("");
  }

  // ---- CSV / XLSX 导入解析 ----
  async function parseImportFile(file) {
    if (!window.XLSX) throw new Error("Excel 解析组件未加载，请刷新页面后重试。");
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const headerIndex = rows.findIndex((r) =>
      r.some((c) => /品名|名称|商品|货号|供应商|采购价|链接/i.test(String(c)))
    );
    if (headerIndex < 0) throw new Error("未找到包含「品名/货号」的表头行。");
    const headerMap = new Map(rows[headerIndex].map((h, i) => [normHeader(h), i]));

    // 字段 -> 列名候选
    const aliases = {
      code: ["货号", "代码", "code"],
      name: ["品名", "名称", "商品名称", "产品名称", "name"],
      supplier: ["供应商", "厂家", "供货商", "supplier"],
      spec: ["规格", "款式", "规格款式", "spec"],
      price: ["采购价", "采购价RMB", "价格", "price"],
      moq: ["起订量", "MOQ", "moq"],
      stock: ["供货量", "可供货量", "库存", "stock"],
      leadTime: ["发货周期", "发货周期天", "交期", "leadtime"],
      origin: ["发货地", "产地", "origin"],
      link: ["下单链接", "链接", "url", "link"],
      note: ["备注", "note"],
    };
    const pick = (row, keys) => {
      for (const k of keys) {
        const idx = headerMap.get(normHeader(k));
        if (idx !== undefined && row[idx] !== "") return row[idx];
      }
      return "";
    };

    const result = [];
    rows.slice(headerIndex + 1).forEach((row) => {
      const name = String(pick(row, aliases.name)).trim();
      const code = String(pick(row, aliases.code)).trim();
      if (!name && !code) return;
      const item = { id: uid(), updatedAt: nowIso() };
      FIELDS.forEach((f) => {
        const raw = pick(row, aliases[f.key] || [f.key]);
        item[f.key] = f.type === "number" ? toNumber(raw) : String(raw).trim();
      });
      if (!item.name) item.name = name || code;
      result.push(item);
    });
    return result;
  }

  // ---- 导出 CSV ----
  function exportCsv() {
    if (!tray.length) { alert("货盘为空，无可导出数据。"); return; }
    const headers = FIELDS.map((f) => f.label);
    const lines = [headers.join(",")];
    tray.forEach((it) => {
      const cells = FIELDS.map((f) => {
        const v = it[f.key] ?? "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cells.join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `货盘_${nowIso()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const headers = FIELDS.map((f) => f.label);
    const sample = ["HS", "电动按摩器", "示例工厂A", "蓝色", "28", "2", "500", "3", "义乌", "https://detail.1688.com/xxx", "首批试单"];
    const blob = new Blob(["\uFEFF" + headers.join(",") + "\n" + sample.join(",")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "货盘导入模板.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- 事件绑定 ----
  function bindEvents() {
    const form = $("sourcingForm");
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const item = readForm();
      if (!item.name) { alert("请填写品名。"); return; }
      if (editingId) {
        const idx = tray.findIndex((x) => x.id === editingId);
        if (idx >= 0) tray[idx] = { ...tray[idx], ...item, id: editingId };
      } else {
        tray.unshift(item);
      }
      save();
      resetForm();
      render();
    });

    $("resetSourcingForm")?.addEventListener("click", resetForm);

    $("sourcingSearch")?.addEventListener("input", render);

    $("exportSourcing")?.addEventListener("click", exportCsv);
    $("downloadSourcingTemplate")?.addEventListener("click", downloadTemplate);

    $("importSourcing")?.addEventListener("click", () => $("importSourcingFile")?.click());

    $("importSourcingFile")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const status = $("sourcingImportStatus");
      try {
        const imported = await parseImportFile(file);
        if (!imported.length) throw new Error("未能识别出任何货盘行（需包含 品名/货号 列）。");
        // 按品名+规格+供应商 去重 upsert
        const keyOf = (it) => `${it.name}|${it.spec || ""}|${it.supplier || ""}`;
        const byKey = new Map(tray.map((x) => [keyOf(x), x]));
        let added = 0, updated = 0;
        imported.forEach((it) => {
          const k = keyOf(it);
          const exist = byKey.get(k);
          if (exist) { Object.assign(exist, it, { id: exist.id }); updated += 1; }
          else { tray.unshift(it); byKey.set(k, it); added += 1; }
        });
        save();
        render();
        if (status) status.textContent = `导入完成：新增 ${added} 条，更新 ${updated} 条（来源：${file.name}）。`;
      } catch (err) {
        if (status) status.textContent = "导入失败：" + (err.message || err);
        alert("导入失败：" + (err.message || err));
      } finally {
        event.target.value = "";
      }
    });

    // 表格内编辑/删除（事件委托）
    $("sourcingRows")?.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-src-edit]");
      const delBtn = e.target.closest("[data-src-del]");
      if (editBtn) {
        const id = editBtn.getAttribute("data-src-edit");
        const item = tray.find((x) => x.id === id);
        if (item) fillForm(item);
      } else if (delBtn) {
        const id = delBtn.getAttribute("data-src-del");
        const item = tray.find((x) => x.id === id);
        if (item && confirm(`确认删除货盘「${item.name}」？`)) {
          tray = tray.filter((x) => x.id !== id);
          if (editingId === id) resetForm();
          save();
          render();
        }
      }
    });
  }

  // ---- 启动 ----
  function init() {
    injectShell();
    bindEvents();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
