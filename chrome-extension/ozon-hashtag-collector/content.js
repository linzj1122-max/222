(function () {
  "use strict";

  const LIMIT = 50;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (element) => String(element?.textContent || "").replace(/\s+/g, " ").trim();

  function productIdFromUrl(value) {
    return String(value || "").match(/\/product\/[^?#]*-(\d{5,20})(?:\/|\?|#|$)/i)?.[1] || "";
  }

  function readProductLinks(target) {
    Array.from(document.querySelectorAll('a[href*="/product/"]')).forEach((link) => {
      const productId = productIdFromUrl(link.href);
      if (!productId || target.has(productId)) return;
      target.set(productId, { productId, url: link.href, name: text(link) || `Ozon ${productId}` });
    });
  }

  function progress(message, tone = "") {
    let box = document.getElementById("ozon-hashtag-collector-progress");
    if (!box) {
      box = document.createElement("div");
      box.id = "ozon-hashtag-collector-progress";
      Object.assign(box.style, {
        position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647",
        maxWidth: "390px", padding: "12px 14px", borderRadius: "10px",
        font: "13px/1.45 Microsoft YaHei, sans-serif", boxShadow: "0 8px 30px rgba(0,0,0,.2)",
      });
      document.documentElement.appendChild(box);
    }
    box.style.color = tone === "fail" ? "#8d2f25" : tone === "ok" ? "#145d44" : "#3d3a35";
    box.style.background = tone === "fail" ? "#f8ded9" : tone === "ok" ? "#d9f3e7" : "#fff7df";
    box.textContent = message;
    if (tone) setTimeout(() => box.remove(), 10000);
  }

  async function collectTopLinks() {
    window.scrollTo({ top: 0, behavior: "auto" });
    await wait(800);
    const links = new Map();
    let stableRounds = 0;
    for (let round = 0; round < 24 && links.size < LIMIT && stableRounds < 4; round += 1) {
      const before = links.size;
      readProductLinks(links);
      progress(`正在读取关键词搜索结果：已找到 ${Math.min(links.size, LIMIT)}/${LIMIT} 个商品链接…`);
      stableRounds = links.size > before ? 0 : stableRounds + 1;
      if (links.size >= LIMIT) break;
      window.scrollBy({ top: Math.max(1200, Math.round(window.innerHeight * 1.8)), behavior: "smooth" });
      await wait(1600);
    }
    readProductLinks(links);
    return Array.from(links.values()).slice(0, LIMIT).map((item, index) => ({ ...item, rank: index + 1 }));
  }

  async function collect(config) {
    const products = await collectTopLinks();
    if (!products.length) throw new Error("当前页面没有找到 Ozon 商品链接，请确认已打开关键词搜索结果页。");
    progress(`已找到 ${products.length} 个链接，正在读取商品页蓝色 #标签并过滤品牌标签…`);
    const detailResponse = await chrome.runtime.sendMessage({ type: "OZON_HASHTAG_FETCH_PRODUCTS", products });
    if (!detailResponse?.ok) throw new Error(detailResponse?.error || "无法读取商品详情页。");
    const hashtagProducts = Array.isArray(detailResponse.items) ? detailResponse.items : [];
    const endpoint = `${String(config.dashboardUrl || "").replace(/\/+$/, "")}/api/ozon-ranking/collector/hashtags`;
    const uploadResponse = await chrome.runtime.sendMessage({
      type: "OZON_HASHTAG_UPLOAD",
      endpoint,
      token: config.token,
      payload: {
        keyword: config.keyword,
        hashtagProducts,
        searchUrl: location.href,
        generatedAt: new Date().toISOString(),
      },
    });
    if (!uploadResponse?.ok) throw new Error(uploadResponse?.error || "无法发送标签数据到控制中心。");
    const analysis = uploadResponse.data?.hashtagAnalysis || {};
    progress(`标签采集完成：${analysis.successfulCount || 0} 个商品读取成功，保留 ${analysis.uniqueTagCount || 0} 个标签，已过滤 ${analysis.excludedBrandTagCount || 0} 个品牌标签。`, "ok");
    return analysis;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "OZON_HASHTAG_COLLECT") return false;
    collect(message.config || {})
      .then((analysis) => sendResponse({ ok: true, analysis }))
      .catch((error) => {
        progress(error.message || String(error), "fail");
        sendResponse({ ok: false, error: error.message || String(error) });
      });
    return true;
  });
})();
