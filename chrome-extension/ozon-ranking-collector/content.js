(function () {
  "use strict";

  const REQUIRED_HEADERS = ["Место в поисковой выдаче", "SKU", "Заказы за 30 дней, шт."];
  const PLUGIN_LOAD_WAIT_MS = 4000;
  const PLUGIN_EXTRA_WAIT_MS = 2000;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (element) => String(element?.textContent || "").replace(/\s+/g, " ").trim();
  const number = (value) => {
    const normalized = String(value ?? "").replace(/\s+/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    return normalized && Number.isFinite(parsed) ? parsed : null;
  };

  function findMpstatsTable() {
    return Array.from(document.querySelectorAll("table")).find((table) => {
      const header = Array.from(table.querySelectorAll("th")).map(text).join("|");
      return REQUIRED_HEADERS.every((name) => header.includes(name));
    }) || null;
  }

  function headerIndex(headers, expected) {
    return headers.findIndex((header) => header.includes(expected));
  }

  function productLinkMap() {
    const map = new Map();
    Array.from(document.querySelectorAll('a[href*="/product/"]')).forEach((link) => {
      const match = String(link.href || "").match(/\/product\/[^?#]*-(\d{5,20})(?:\/|\?|#|$)/i);
      if (!match) return;
      const id = match[1];
      const title = text(link);
      const previous = map.get(id);
      if (!previous || title.length > previous.name.length) map.set(id, { url: link.href, name: title });
    });
    return map;
  }

  function parseTable() {
    const table = findMpstatsTable();
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll("th")).map(text);
    const indices = {
      rank: headerIndex(headers, "Место в поисковой выдаче"),
      sku: headerIndex(headers, "SKU"),
      brand: headerIndex(headers, "Бренд"),
      price: headerIndex(headers, "Цена"),
      stock: headerIndex(headers, "Остаток"),
      revenue: headerIndex(headers, "Заказы за 30 дней, ₽"),
      sales: headerIndex(headers, "Заказы за 30 дней, шт."),
      rating: headerIndex(headers, "Рейтинг"),
      reviews: headerIndex(headers, "Кол-во отзывов"),
      promotion: headerIndex(headers, "Акция"),
    };
    const links = productLinkMap();
    const seen = new Set();
    return Array.from(table.querySelectorAll("tbody tr")).map((row, index) => {
      const cells = Array.from(row.querySelectorAll("td"));
      const cell = (position) => position >= 0 ? text(cells[position]) : "";
      const productId = cell(indices.sku).match(/\d{5,20}/)?.[0] || "";
      if (!productId || seen.has(productId)) return null;
      seen.add(productId);
      const link = links.get(productId) || {};
      const firstCell = cell(indices.rank);
      return {
        rank: number(firstCell) || index + 1,
        productId,
        name: link.name || `Ozon ${productId}`,
        url: link.url || `https://www.ozon.ru/context/detail/id/${productId}/`,
        brand: cell(indices.brand),
        price: number(cell(indices.price)),
        stock: number(cell(indices.stock)),
        revenue30: number(cell(indices.revenue)),
        sales30: number(cell(indices.sales)),
        rating: number(cell(indices.rating)),
        reviews: number(cell(indices.reviews)),
        promotion: cell(indices.promotion),
        sponsored: /Внешняя реклама/i.test(firstCell),
      };
    }).filter(Boolean).sort((a, b) => a.rank - b.rank).slice(0, 100);
  }

  function progress(message, tone = "") {
    let box = document.getElementById("ozon-ranking-collector-progress");
    if (!box) {
      box = document.createElement("div");
      box.id = "ozon-ranking-collector-progress";
      Object.assign(box.style, {
        position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647",
        maxWidth: "360px", padding: "12px 14px", borderRadius: "10px",
        font: "13px/1.45 Microsoft YaHei, sans-serif", boxShadow: "0 8px 30px rgba(0,0,0,.2)",
      });
      document.documentElement.appendChild(box);
    }
    box.style.color = tone === "fail" ? "#8d2f25" : tone === "ok" ? "#145d44" : "#3d3a35";
    box.style.background = tone === "fail" ? "#f8ded9" : tone === "ok" ? "#d9f3e7" : "#fff7df";
    box.textContent = message;
    if (tone) setTimeout(() => box.remove(), 8000);
  }

  function mergeProducts(target, products) {
    const before = target.size;
    products.forEach((product) => {
      const previous = target.get(product.productId);
      if (!previous) {
        target.set(product.productId, product);
        return;
      }
      target.set(product.productId, {
        ...previous,
        ...Object.fromEntries(Object.entries(product).filter(([, value]) => value !== null && value !== "")),
      });
    });
    return target.size > before;
  }

  async function waitForInitialTable(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const products = parseTable();
      if (products.length) {
        progress(`已发现 MPStats 表格，等待约 ${PLUGIN_LOAD_WAIT_MS / 1000} 秒加载完整数据…`);
        await wait(PLUGIN_LOAD_WAIT_MS);
        return parseTable().length ? parseTable() : products;
      }
      progress("正在等待 MPStats 排名和销量表格加载…");
      await wait(1000);
    }
    return [];
  }

  async function collectAfterScroll(collected) {
    await wait(PLUGIN_LOAD_WAIT_MS);
    let grew = mergeProducts(collected, parseTable());
    const deadline = Date.now() + PLUGIN_EXTRA_WAIT_MS;
    while (Date.now() < deadline) {
      await wait(500);
      if (mergeProducts(collected, parseTable())) {
        grew = true;
        await wait(1000);
        mergeProducts(collected, parseTable());
        break;
      }
    }
    return grew;
  }

  async function collectRows() {
    window.scrollTo({ top: 0, behavior: "auto" });
    await wait(800);
    const collected = new Map();
    mergeProducts(collected, await waitForInitialTable());
    if (!collected.size) return [];
    let stableRounds = 0;
    for (let round = 0; round < 18 && collected.size < 100 && stableRounds < 3; round += 1) {
      progress(`正在分段加载 Ozon 和 MPStats 数据：已读取 ${collected.size} 个商品…`);
      window.scrollBy({ top: Math.max(1200, Math.round(window.innerHeight * 1.8)), behavior: "smooth" });
      const grew = await collectAfterScroll(collected);
      stableRounds = grew ? 0 : stableRounds + 1;
    }
    return Array.from(collected.values()).sort((a, b) => a.rank - b.rank).slice(0, 100);
  }

  async function upload(config) {
    const products = await collectRows();
    if (!products.length) throw new Error("未找到 MPStats 搜索结果表。请等待页面中的 MPStats 表格显示后再试。");
    progress(`读取完成，正在发送 ${products.length} 个商品到控制中心…`);
    const endpoint = `${String(config.dashboardUrl || "").replace(/\/+$/, "")}/api/ozon-ranking/collector/snapshot`;
    const response = await chrome.runtime.sendMessage({
      type: "OZON_RANKING_UPLOAD",
      endpoint,
      token: config.token,
      payload: {
        keyword: config.keyword,
        productId: config.productId,
        products,
        searchUrl: location.href,
        generatedAt: new Date().toISOString(),
      },
    });
    if (!response?.ok) throw new Error(response?.error || "无法把数据发送到控制中心。");
    const data = response.data || {};
    progress(`已保存到控制中心：${data.resultCount} 个商品${data.ownRank ? `，自己的排名 #${data.ownRank}` : ""}。`, "ok");
    return data;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "OZON_RANKING_COLLECT") return false;
    upload(message.config || {})
      .then((data) => sendResponse({ ok: true, resultCount: data.resultCount, ownRank: data.ownRank }))
      .catch((error) => {
        progress(error.message || String(error), "fail");
        sendResponse({ ok: false, error: error.message || String(error) });
      });
    return true;
  });
})();
