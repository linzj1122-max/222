(function () {
  "use strict";

  const DEFAULT_DASHBOARD = "https://ozon-wb-control-center.pages.dev";
  const $ = (id) => document.getElementById(id);

  function setStatus(message, tone = "") {
    $("status").textContent = message;
    $("status").className = tone;
  }

  function cleanDashboardUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (!/^https?:$/.test(url.protocol)) return "";
      return url.origin;
    } catch {
      return "";
    }
  }

  function currentConfig() {
    return {
      dashboardUrl: cleanDashboardUrl($("dashboardUrl").value),
      token: $("token").value.trim(),
      keyword: $("keyword").value.trim(),
      productId: $("productId").value.trim(),
      storeIndex: Number($("storeIndex").value || 0),
    };
  }

  async function saveConfig(showMessage = true) {
    const config = currentConfig();
    if (!config.dashboardUrl) throw new Error("控制中心地址无效。");
    await chrome.storage.local.set(config);
    if (showMessage) setStatus("配置已保存。", "ok");
    return config;
  }

  async function pasteConfig() {
    const text = await navigator.clipboard.readText();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (!parsed?.dashboardUrl || !parsed?.token) throw new Error("剪贴板中没有有效的采集器配置 JSON。");
    $("dashboardUrl").value = parsed.dashboardUrl;
    $("token").value = parsed.token;
    if (parsed.productId) $("productId").value = parsed.productId;
    if (parsed.storeIndex !== undefined) $("storeIndex").value = String(parsed.storeIndex);
    await saveConfig(false);
    setStatus("控制中心配置已粘贴并保存。", "ok");
  }

  async function openSearch() {
    const config = await saveConfig(false);
    if (config.keyword.length < 2) throw new Error("请先填写关键词。");
    const url = `https://www.ozon.ru/search/?deny_category_prediction=true&from_global=true&text=${encodeURIComponent(config.keyword)}`;
    await chrome.tabs.create({ url });
    setStatus("已打开 Ozon 全站搜索。等待 MPStats 表格出现后点击采集。", "ok");
  }

  async function activeOzonTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !/^https:\/\/(?:www\.)?ozon\.ru\//i.test(tab.url || "")) {
      throw new Error("请先切换到 Ozon 搜索结果页面。");
    }
    return tab;
  }

  async function collect() {
    const config = await saveConfig(false);
    if (!config.token) throw new Error("请先从控制中心生成并粘贴连接 Token。");
    if (config.keyword.length < 2) throw new Error("请填写与当前页面一致的关键词。");
    const tab = await activeOzonTab();
    $("collect").disabled = true;
    setStatus("正在滚动页面并读取 MPStats 表格，请不要切换或关闭当前标签页…");
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "OZON_RANKING_COLLECT",
        config,
      });
      if (!response?.ok) throw new Error(response?.error || "采集失败。");
      setStatus(`上传完成：${response.resultCount} 个商品${response.ownRank ? `，自己的排名 #${response.ownRank}` : ""}。`, "ok");
    } finally {
      $("collect").disabled = false;
    }
  }

  async function run(action) {
    try { await action(); } catch (error) { setStatus(error.message || String(error), "fail"); }
  }

  async function init() {
    const saved = await chrome.storage.local.get(["dashboardUrl", "token", "keyword", "productId", "storeIndex"]);
    $("dashboardUrl").value = saved.dashboardUrl || DEFAULT_DASHBOARD;
    $("token").value = saved.token || "";
    $("keyword").value = saved.keyword || "";
    $("productId").value = saved.productId || "";
    $("storeIndex").value = String(saved.storeIndex ?? 0);
    if (saved.token) setStatus("连接配置已就绪。打开 Ozon 搜索页后即可采集。", "ok");
  }

  $("pasteConfig").addEventListener("click", () => run(pasteConfig));
  $("saveConfig").addEventListener("click", () => run(saveConfig));
  $("openSearch").addEventListener("click", () => run(openSearch));
  $("collect").addEventListener("click", () => run(collect));
  init().catch((error) => setStatus(error.message || String(error), "fail"));
})();
