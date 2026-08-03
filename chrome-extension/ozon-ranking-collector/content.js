(function () {
  "use strict";

  const REQUIRED_HEADERS = ["Место в поисковой выдаче", "SKU", "Заказы за 30 дней, шт."];

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

  async function collectRows() {
    window.scrollTo({ top: 0, behavior: "auto" });
    await wait(600);
    let best = parseTable();
    let stableRounds = 0;
    for (let round = 0; round < 24 && best.length < 100 && stableRounds < 5; round += 1) {
      progress(`正在加载 Ozon 搜索结果：已读取 ${best.length} 个商品…`);
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await wait(1300);
      const next = parseTable();
      if (next.length > best.length) {
        best = next;
        stableRounds = 0;
      } else {
        stableRounds += 1;
      }
    }
    return best.slice(0, 100);
  }

  async function upload(config) {
    const products = await collectRows();
    if (!products.length) throw new Error("未找到 MPStats 搜索结果表。请等待页面中的 MPStats 表格显示后再试。");
    progress(`读取完成，正在发送 ${products.length} 个商品到控制中心…`);
    const endpoint = `${String(config.dashboardUrl || "").replace(/\/+$/, "")}/api/ozon-ranking/collector/snapshot`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Collector ${config.token}`,
      },
      body: JSON.stringify({
        keyword: config.keyword,
        productId: config.productId,
        products,
        searchUrl: location.href,
        generatedAt: new Date().toISOString(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `控制中心返回 HTTP ${response.status}`);
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
