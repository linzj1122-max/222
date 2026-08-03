(function () {
  "use strict";

  const DEFAULT_DASHBOARD = "https://ozon-wb-control-center.pages.dev";
  const $ = (id) => document.getElementById(id);

  function status(message, tone = "") {
    $("status").textContent = message;
    $("status").className = tone;
  }

  function dashboardUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      return /^https?:$/.test(url.protocol) ? url.origin : "";
    } catch {
      return "";
    }
  }

  function config() {
    return { dashboardUrl: dashboardUrl($("dashboardUrl").value), token: $("token").value.trim(), keyword: $("keyword").value.trim() };
  }

  async function save(show = true) {
    const value = config();
    if (!value.dashboardUrl) throw new Error("控制中心地址无效。");
    await chrome.storage.local.set(value);
    if (show) status("配置已保存。", "ok");
    return value;
  }

  async function paste() {
    const raw = await navigator.clipboard.readText();
    let value = null;
    try { value = JSON.parse(raw); } catch { value = null; }
    if (!value?.dashboardUrl || !value?.token) throw new Error("剪贴板中没有有效的采集器配置 JSON。");
    $("dashboardUrl").value = value.dashboardUrl;
    $("token").value = value.token;
    await save(false);
    status("连接配置已粘贴并保存。", "ok");
  }

  async function openSearch() {
    const value = await save(false);
    if (value.keyword.length < 2) throw new Error("请先填写关键词。");
    await chrome.tabs.create({ url: `https://www.ozon.ru/search/?deny_category_prediction=true&from_global=true&text=${encodeURIComponent(value.keyword)}` });
    status("已打开关键词搜索页。页面商品加载后再点击抓取。", "ok");
  }

  async function activeSearchTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(?:www\.)?ozon\.ru\/search\//i.test(tab.url || "")) throw new Error("请先切换到 Ozon 关键词搜索结果页。");
    return tab;
  }

  async function collect() {
    const value = await save(false);
    if (!value.token) throw new Error("请先粘贴控制中心连接 Token。");
    if (value.keyword.length < 2) throw new Error("请填写与当前搜索页一致的关键词。");
    const tab = await activeSearchTab();
    $("collect").disabled = true;
    status("正在读取前 50 个商品链接及蓝色标签，请勿关闭搜索页…");
    try {
      const message = { type: "OZON_HASHTAG_COLLECT", config: value };
      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, message);
      } catch (error) {
        if (!/Receiving end does not exist|Could not establish connection/i.test(error?.message || "")) throw error;
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        response = await chrome.tabs.sendMessage(tab.id, message);
      }
      if (!response?.ok) throw new Error(response?.error || "采集失败。");
      const analysis = response.analysis || {};
      status(`完成：保留 ${analysis.uniqueTagCount || 0} 个标签，过滤 ${analysis.excludedBrandTagCount || 0} 个品牌标签。`, "ok");
    } finally {
      $("collect").disabled = false;
    }
  }

  async function run(action) {
    try { await action(); } catch (error) { status(error.message || String(error), "fail"); }
  }

  async function init() {
    const saved = await chrome.storage.local.get(["dashboardUrl", "token", "keyword"]);
    $("dashboardUrl").value = saved.dashboardUrl || DEFAULT_DASHBOARD;
    $("token").value = saved.token || "";
    $("keyword").value = saved.keyword || "";
    if (saved.token) status("配置已就绪。打开 Ozon 搜索页后即可抓取。", "ok");
  }

  $("pasteConfig").addEventListener("click", () => run(paste));
  $("saveConfig").addEventListener("click", () => run(save));
  $("openSearch").addEventListener("click", () => run(openSearch));
  $("collect").addEventListener("click", () => run(collect));
  init().catch((error) => status(error.message || String(error), "fail"));
})();
