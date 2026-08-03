(function () {
  "use strict";

  const RETRIES = 3;
  const TIMEOUT_MS = 30000;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function requestJson(endpoint, token, payload) {
    let lastError = null;
    for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Collector ${token}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.ok !== false) return data;
        const error = new Error(data.error || `控制中心返回 HTTP ${response.status}`);
        if (response.status < 500 && response.status !== 429) throw error;
        lastError = error;
      } catch (error) {
        lastError = error;
        if (attempt === RETRIES) break;
      } finally {
        clearTimeout(timeout);
      }
      await wait(attempt * 1500);
    }
    const message = lastError?.name === "AbortError"
      ? "连接控制中心超时，请检查网络后重试。"
      : lastError?.message === "Failed to fetch"
        ? "无法连接控制中心，请检查网络或稍后重试。"
        : lastError?.message || "无法把数据发送到控制中心。";
    throw new Error(message);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "OZON_RANKING_UPLOAD") return false;
    requestJson(message.endpoint, message.token, message.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  });
})();
