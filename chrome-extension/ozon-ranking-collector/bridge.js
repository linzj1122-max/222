(function () {
  "use strict";

  const PAGE_SOURCE = "OZON_RANKING_PAGE_V1";
  const EXTENSION_SOURCE = "OZON_RANKING_EXTENSION_V1";

  function post(type, payload = {}) {
    window.postMessage({ source: EXTENSION_SOURCE, type, ...payload }, location.origin);
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data || {};
    if (message.source !== PAGE_SOURCE) return;
    if (message.type === "PING") {
      post("READY");
      return;
    }
    if (message.type !== "START_QUICK_RANKS") return;
    const requestId = String(message.requestId || "");
    const tasks = Array.isArray(message.tasks) ? message.tasks.slice(0, 100) : [];
    post("QUICK_STARTED", { requestId, total: tasks.length });
    try {
      const response = await chrome.runtime.sendMessage({
        type: "OZON_START_QUICK_RANKS",
        requestId,
        tasks,
      });
      if (!response?.ok) throw new Error(response?.error || "快速排名任务启动失败。");
      post("QUICK_COMPLETE", { requestId, ...response });
    } catch (error) {
      post("QUICK_ERROR", { requestId, error: error.message || String(error) });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "OZON_QUICK_PROGRESS") return false;
    post("QUICK_PROGRESS", message);
    return false;
  });

  post("READY");
})();
