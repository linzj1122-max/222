(function () {
  "use strict";

  const RETRIES = 3;
  const TIMEOUT_MS = 30000;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let quickBatchRunning = false;

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
        if (response.status < 500 && response.status !== 429) {
          error.nonRetryable = true;
          throw error;
        }
        lastError = error;
      } catch (error) {
        if (error?.nonRetryable) throw error;
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

  async function waitForTabComplete(tabId, timeoutMs = 45000) {
    const current = await chrome.tabs.get(tabId);
    if (current.status === "complete") return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Ozon 搜索页面加载超时。"));
      }, timeoutMs);
      const onUpdated = (updatedId, changeInfo) => {
        if (updatedId === tabId && changeInfo.status === "complete") {
          cleanup();
          resolve();
        }
      };
      const onRemoved = (removedId) => {
        if (removedId === tabId) {
          cleanup();
          reject(new Error("Ozon 搜索页面已被关闭。"));
        }
      };
      function cleanup() {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
    });
  }

  async function sendDashboard(tabId, payload) {
    if (!tabId) return;
    try { await chrome.tabs.sendMessage(tabId, { type: "OZON_QUICK_PROGRESS", ...payload }); } catch {}
  }

  async function sendToOzonTab(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      if (!/Receiving end does not exist|Could not establish connection/i.test(error?.message || "")) throw error;
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await wait(500);
      return chrome.tabs.sendMessage(tabId, message);
    }
  }

  async function runQuickBatch(rawTasks, dashboardTabId, requestId) {
    const tasks = (Array.isArray(rawTasks) ? rawTasks : []).slice(0, 100).map((task) => ({
      id: String(task?.id || "").slice(0, 80),
      keyword: String(task?.keyword || "").replace(/\s+/g, " ").trim().slice(0, 120),
      productId: String(task?.productId || "").match(/\d{5,20}/)?.[0] || "",
    })).filter((task) => task.id && task.keyword.length >= 2 && task.productId);
    if (!tasks.length) throw new Error("没有有效的关键词排名任务。");
    const config = await chrome.storage.local.get(["dashboardUrl", "token"]);
    const dashboardUrl = String(config.dashboardUrl || "").replace(/\/+$/, "");
    if (!dashboardUrl || !config.token) throw new Error("采集器尚未连接控制中心，请先粘贴并保存连接配置。");
    const endpoint = `${dashboardUrl}/api/ozon-ranking/collector/rank`;
    let ozonTabId = null;
    let succeeded = 0;
    let failed = 0;
    try {
      for (let index = 0; index < tasks.length; index += 1) {
        const task = tasks[index];
        const progressBase = { requestId, index: index + 1, total: tasks.length, keyword: task.keyword };
        await sendDashboard(dashboardTabId, { ...progressBase, stage: "opening", message: "正在打开 Ozon 搜索页" });
        const searchUrl = `https://www.ozon.ru/search/?deny_category_prediction=true&from_global=true&text=${encodeURIComponent(task.keyword)}`;
        if (ozonTabId) await chrome.tabs.update(ozonTabId, { url: searchUrl, active: true });
        else ozonTabId = (await chrome.tabs.create({ url: searchUrl, active: true })).id;
        try {
          // Give Chrome time to leave the previous completed document before
          // checking the new navigation state.
          await wait(500);
          await waitForTabComplete(ozonTabId);
          await wait(1000);
          await sendDashboard(dashboardTabId, { ...progressBase, stage: "collecting", message: "等待 MPStats 并检查前 50 名" });
          const response = await sendToOzonTab(ozonTabId, { type: "OZON_QUICK_RANK_COLLECT", task });
          if (!response?.ok) throw new Error(response?.error || "快速排名抓取失败。");
          if (response.status === "incomplete") throw new Error(`只加载到 ${response.resultCount || 0} 名，未达到前 50 名，请稍后重试。`);
          await requestJson(endpoint, config.token, {
            id: task.id, rank: response.rank, status: response.status,
            resultCount: response.resultCount, checkedAt: response.checkedAt,
          });
          succeeded += 1;
          await sendDashboard(dashboardTabId, { ...progressBase, stage: "saved", rank: response.rank, message: response.rank ? `已保存排名 #${response.rank}` : "前 50 名未找到" });
        } catch (error) {
          failed += 1;
          const message = error.message || String(error);
          try {
            await requestJson(endpoint, config.token, {
              id: task.id, status: "error", error: message, resultCount: 0, checkedAt: new Date().toISOString(),
            });
          } catch {}
          await sendDashboard(dashboardTabId, { ...progressBase, stage: "failed", message });
        }
      }
    } finally {
      if (ozonTabId) {
        try { await chrome.tabs.remove(ozonTabId); } catch {}
      }
      if (dashboardTabId) {
        try { await chrome.tabs.update(dashboardTabId, { active: true }); } catch {}
      }
    }
    return { succeeded, failed, total: tasks.length };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "OZON_START_QUICK_RANKS") {
      if (quickBatchRunning) {
        sendResponse({ ok: false, error: "已有关键词排名任务正在运行。" });
        return false;
      }
      quickBatchRunning = true;
      runQuickBatch(message.tasks, _sender.tab?.id, message.requestId)
        .then((data) => sendResponse({ ok: true, ...data }))
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }))
        .finally(() => { quickBatchRunning = false; });
      return true;
    }
    if (message?.type === "OZON_RANKING_UPLOAD") {
      requestJson(message.endpoint, message.token, message.payload)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }
    return false;
  });
})();
