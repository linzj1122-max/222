const initialProducts = [
      {code:"HS", sku:"3555785455", name:"电动按摩器", purchase:28, domestic:5, firstFreight:4.18, lastMile:4, rate:11.5, platform:"Ozon"},
      {code:"HX", sku:"3592078186", name:"电动按摩器", purchase:37, domestic:5, firstFreight:6.27, lastMile:4, rate:11.5, platform:"Ozon"},
      {code:"HX", sku:"3903949202", name:"电动按摩器", purchase:37, domestic:5, firstFreight:6.27, lastMile:4, rate:11.5, platform:"Ozon"},
      {code:"JBAM", sku:"3714580469", name:"电动按摩器", purchase:35, domestic:5, firstFreight:29.046, lastMile:6, rate:11.5, platform:"Ozon"},
      {code:"PJ", sku:"3555656299", name:"电动按摩器", purchase:50, domestic:5, firstFreight:27.55, lastMile:4, rate:11.5, platform:"Ozon"},
      {code:"SFZ", sku:"3555479037", name:"按摩枕", purchase:35, domestic:5, firstFreight:25.3, lastMile:4, rate:11.5, platform:"Ozon"},
      {code:"TBAM", sku:"3714561826", name:"电动按摩器", purchase:65, domestic:5, firstFreight:12.78, lastMile:4, rate:11.5, platform:"Ozon"},
      {code:"XFJ", sku:"3555131131", name:"电动按摩器", purchase:60, domestic:5, firstFreight:22.66, lastMile:4, rate:11.5, platform:"Ozon"},
      {code:"JW", sku:"4526520053", name:"脚腕按摩器", purchase:28, domestic:5, firstFreight:3.52, lastMile:3.5, rate:11.5, platform:"Ozon"},
      {code:"CDAM", sku:"4539993573", name:"床垫按摩器", purchase:150, domestic:5, firstFreight:120.6, lastMile:5, rate:11.5, platform:"Ozon"},
      {code:"AMY", sku:"4488765265", name:"按摩椅", purchase:950, domestic:5, firstFreight:1587.2, lastMile:0, rate:11.5, platform:"Ozon"},
      {code:"HQB60", sku:"4675959653", name:"水泵", purchase:74.5, domestic:12, firstFreight:43.2, lastMile:5, rate:11.5, platform:"Ozon"},
      {code:"QB-60", sku:"4509788886", name:"水泵", purchase:70.5, domestic:12, firstFreight:43.2, lastMile:5, rate:11.5, platform:"Ozon"},
      {code:"PK-750", sku:"4509718786", name:"水泵", purchase:104.5, domestic:12, firstFreight:76.61, lastMile:7, rate:11.5, platform:"Ozon"},
      {code:"GP-130", sku:"4509770907", name:"水泵", purchase:104.5, domestic:12, firstFreight:141.86, lastMile:10, rate:11.5, platform:"Ozon"}
    ].map((item) => ({...item, id: crypto.randomUUID()}));

    const productKey = "ozon_wb_products_v3";
    const orderKey = "ozon_wb_orders_v1";
    const competitorKey = "ozon_wb_competitors_v2";
    const apiConfigKey = "ozon_wb_api_configs_v1";
    const storeGroupKey = "ozon_wb_store_groups_v1";
    const importedAdsKey = "ozon_wb_imported_ads_v1";
    const adsTaskCacheKey = "ozon_wb_ads_task_cache_v1";
    const adImageCacheKey = "ozon_wb_ad_image_cache_v1";
    const adsRowsCacheKey = "ozon_wb_ads_rows_cache_v2";
    const orderRangeCacheKey = "ozon_wb_order_range_cache_v2";
    const storeAnalyticsCacheKey = "ozon_wb_store_analytics_cache_v2";
    const summarySnapshotKey = "ozon_wb_summary_snapshot_v1";
    const platformFeesKey = "ozon_wb_platform_fees_v1";
    const builtInOzonLocalFees = {
      "3555785455": { defaultPrice: 2812.68, commissionRate: 0.47, logisticsFee: 146.9176, handlingFee: 25.9, acquiringFee: 11.1049, otherFixedFee: 10.8444 },
      "3592078186": { defaultPrice: 3050.0357, commissionRate: 0.47, logisticsFee: 249.9216, handlingFee: 24.5982, acquiringFee: 15.6189, otherFixedFee: 13.4782 },
      "3903949202": { defaultPrice: 2584, commissionRate: 0.41, logisticsFee: 119, handlingFee: 0, acquiringFee: 29.3, otherFixedFee: 12.74 },
      "3714580469": { defaultPrice: 3567.5, commissionRate: 0.45, logisticsFee: 203.0417, handlingFee: 2.5, acquiringFee: 37.3179, otherFixedFee: 11.7492 },
      "3555656299": { defaultPrice: 3625.1429, commissionRate: 0.47, logisticsFee: 384.2331, handlingFee: 38.5, acquiringFee: 20.4539, otherFixedFee: 11.5067 },
      "3555479037": { defaultPrice: 3482.8333, commissionRate: 0.41, logisticsFee: 320.2089, handlingFee: 18.8725, acquiringFee: 16.047, otherFixedFee: 9.4427 },
      "3714561826": { defaultPrice: 3526.5, commissionRate: 0.45, logisticsFee: 142, handlingFee: 30, acquiringFee: 39.4925, otherFixedFee: 11.62 },
      "3555131131": { defaultPrice: 3923.5926, commissionRate: 0.41, logisticsFee: 116.3185, handlingFee: 29.8148, acquiringFee: 27.7459, otherFixedFee: 9.7626 },
      "3240738611": { defaultPrice: 8815.5625, commissionRate: 0.49, logisticsFee: 403.6033, handlingFee: 35, acquiringFee: 63.6601, otherFixedFee: 17.1434 },
      "3951061552": { defaultPrice: 8083.2424, commissionRate: 0.49, logisticsFee: 115.3939, handlingFee: 31.8182, acquiringFee: 64.1867, otherFixedFee: 14.8176 },
      "3489562559": { defaultPrice: 4658.3636, commissionRate: 0.44, logisticsFee: 235.9927, handlingFee: 25.4545, acquiringFee: 39.1891, otherFixedFee: 20.2982 },
      "3259565474": { defaultPrice: 11108.1333, commissionRate: 0.44, logisticsFee: 311.3637, handlingFee: 35, acquiringFee: 98.4683, otherFixedFee: 12.3947 }
    };
    const feeScopeKey = (platform, mode, fulfillment) => `${platform}|${mode}|${fulfillment}`;
    const FULFILLMENT_OPTIONS = (platform, mode) => {
      if (mode === "cross") {
        return platform === "Ozon" ? ["FBP", "直发"] : ["FBS", "直发"];
      }
      return ["FBO", "FBS"];
    };
    const MODE_LABELS = { local: "本土", cross: "跨境" };
    const PLATFORM_LABELS = { Ozon: "OZON", WB: "WB" };
    const normalizePlatform = (value) => (String(value || "").toLowerCase() === "wb" ? "WB" : "Ozon");
    const normalizeMode = (value) => (String(value || "") === "cross" ? "cross" : "local");
    const normalizeFulfillment = (value, platform, mode) => {
      const allowed = FULFILLMENT_OPTIONS(platform, mode);
      return allowed.includes(value) ? value : allowed[0];
    };
    const ensureProductScope = (p) => {
      const platform = normalizePlatform(p.platform);
      const mode = normalizeMode(p.mode);
      const fulfillment = normalizeFulfillment(p.fulfillment, platform, mode);
      return { ...p, platform, mode, fulfillment };
    };
    let platformFees = JSON.parse(localStorage.getItem(platformFeesKey) || "[]");
    const findFeeBundle = (platform, mode, fulfillment) => {
      const key = feeScopeKey(normalizePlatform(platform), normalizeMode(mode), normalizeFulfillment(fulfillment, platform, mode));
      return platformFees.find((bundle) => feeScopeKey(bundle.platform, bundle.mode, bundle.fulfillment) === key) || null;
    };
    const feeModelForProduct = (product) => {
      if (!product) return {};
      const bundle = findFeeBundle(product.platform, product.mode, product.fulfillment);
      if (bundle?.models?.[String(product.sku)]) return bundle.models[String(product.sku)];
      if (bundle?.models?.[String(product.code)]) return bundle.models[String(product.code)];
      return bundle?.defaultModel || {};
    };
    const skuFeeModels = new Proxy({}, {
      get: (_, sku) => {
        for (const product of products) {
          if (String(product.sku) === String(sku) || String(product.code) === String(sku)) {
            const model = feeModelForProduct(product);
            if (Object.keys(model).length) return model;
          }
        }
        return builtInOzonLocalFees[String(sku)] || {};
      }
    });
    const $ = (id) => document.getElementById(id);
    const rmb = (v) => `¥${Number(v || 0).toFixed(2)}`;
    const rub = (v) => `₽${Number(v || 0).toFixed(2)}`;
    const escapeHtml = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
    const localIso = (date) => {
      const d = date instanceof Date ? date : new Date(`${date}T00:00:00`);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    const mskTodayIso = () => {
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const mskDate = new Date(utcMs + 3 * 3600000);
      return localIso(mskDate);
    };
    const todayIso = () => mskTodayIso();
    const adsTodayIso = () => mskTodayIso();
    const mskFetchBoundaryDate = () => {
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const mskDate = new Date(utcMs + 3 * 3600000);
      const mskHour = mskDate.getHours();
      return mskHour >= 4 ? localIso(mskDate) : localIso(addDays(localIso(mskDate), -1));
    };
    const mskNowString = () => {
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      return new Date(utcMs + 3 * 3600000).toLocaleString("zh-CN", { timeZone: "UTC" });
    };
    const addDays = (date, days) => {
      const d = new Date(`${date}T00:00:00`);
      d.setDate(d.getDate() + days);
      return localIso(d);
    };

    let products = JSON.parse(localStorage.getItem(productKey) || "null") || initialProducts;
    const codeRenames = { "4675959653": "HQB60" };
    products.forEach((p) => { if (codeRenames[String(p.sku)]) p.code = codeRenames[String(p.sku)]; });
    products = products.map((p) => ensureProductScope(p));
    let orders = JSON.parse(localStorage.getItem(orderKey) || "[]");
    let trendOrders = JSON.parse(localStorage.getItem("ozon_wb_trend_orders_v1") || "[]");
    let competitors = JSON.parse(localStorage.getItem(competitorKey) || "[]");
    let apiConfigs = JSON.parse(localStorage.getItem(apiConfigKey) || "[]");
    let storeGroups = JSON.parse(localStorage.getItem(storeGroupKey) || "[]");
    let importedAds = JSON.parse(localStorage.getItem(importedAdsKey) || "[]");
    let backendAds = [];
    let adsTaskCache = JSON.parse(localStorage.getItem(adsTaskCacheKey) || "{}");
    let adsRowsCache = JSON.parse(localStorage.getItem(adsRowsCacheKey) || "{}");
    let adsStatusRows = [];
    let adImageCache = JSON.parse(localStorage.getItem(adImageCacheKey) || "{}");
    let orderRangeCache = JSON.parse(localStorage.getItem(orderRangeCacheKey) || "{}");
    let storeAnalyticsCache = JSON.parse(localStorage.getItem(storeAnalyticsCacheKey) || "{}");
    let summarySnapshot = JSON.parse(localStorage.getItem(summarySnapshotKey) || "{}");
    let storeAnalyticsRows = [];
    // 累积全部按天分析数据(曝光/点击/转化),用于本地筛选任意子范围秒出
    const trendDailyAnalyticsKey = "ozon_wb_trend_daily_analytics_v1";
    let trendDailyAnalytics = JSON.parse(localStorage.getItem(trendDailyAnalyticsKey) || "[]");
    // 清理旧版本缓存（v1 已废弃，数据结构不兼容）
    ["ozon_wb_order_range_cache_v1", "ozon_wb_store_analytics_cache_v1"].forEach((staleKey) => {
      if (localStorage.getItem(staleKey) !== null) localStorage.removeItem(staleKey);
    });
    // 清理被早期 withCache bug 破坏的缓存条目(orders/rows 变成了对象而非数组)
    let _cacheDirty = false;
    Object.keys(orderRangeCache).forEach((k) => {
      if (!orderRangeCache[k] || !Array.isArray(orderRangeCache[k].orders)) {
        delete orderRangeCache[k]; _cacheDirty = true;
      }
    });
    Object.keys(storeAnalyticsCache).forEach((k) => {
      if (!storeAnalyticsCache[k] || !Array.isArray(storeAnalyticsCache[k].rows)) {
        delete storeAnalyticsCache[k]; _cacheDirty = true;
      }
    });
    if (_cacheDirty) {
      try {
        localStorage.setItem(orderRangeCacheKey, JSON.stringify(orderRangeCache));
        localStorage.setItem(storeAnalyticsCacheKey, JSON.stringify(storeAnalyticsCache));
      } catch {}
    }
    let revenueChartHitboxes = [];
    let activeChartIndex = null;
    let adChartHitboxes = [];
    let activeAdChartIndex = null;
    let adPollTimer = null;
    let adPollAttempts = 0;
    let adDateFrom = addDays(adsTodayIso(), -27);
    let adDateTo = adsTodayIso();
    let adCalendarCursor = new Date(`${adDateFrom}T00:00:00`);
    let pendingAdDateAnchor = null;
    let adCompareEnabled = true;
    let chartConfig = { unit: "rub" };
    let chartStore = "all";
    let pendingChartDateAnchor = null;
    // 记录最近一次时间选择的来源："summary" 或 "chart"，用于联动时另一边变暗
    let lastRangeSource = "summary";
    let selectedStore = "all";
    let storeOverviewView = "store";
    let storeOverviewGroup = "all";
    let orderDateFrom = addDays(todayIso(), -28);
    let orderDateTo = addDays(todayIso(), -1);
    // 趋势图拥有独立的时间段状态，便于与经营汇总范围解耦联动
    let chartDateFrom = orderDateFrom;
    let chartDateTo = orderDateTo;
    let chartCalendarCursor = new Date(`${chartDateFrom}T00:00:00`);
    let calendarCursor = new Date(`${orderDateFrom}T00:00:00`);
    let pickingDateField = "from";
    let pendingOrderDateAnchor = null;
    const backendEnabled = location.protocol !== "file:";

    const totalRmb = (p) => Number(p.purchase||0) + Number(p.domestic||0) + Number(p.firstFreight||0) + Number(p.lastMile||0);
    const totalRub = (p) => totalRmb(p) * Number(p.rate || 0);
    const productById = (id) => products.find((p) => p.id === id);
    const isBrushOrder = (sku) => /[-_]JS$/i.test(String(sku || "").trim());
    const normalizeOffer = (value) => String(value || "").trim().replace(/[-_](RU|FBO|FBS)$/i, "");
    const productBySku = (sku) => {
      const raw = String(sku || "");
      const normalized = normalizeOffer(raw);
      return products.find((p) => String(p.sku) === raw || String(p.code) === raw)
        || products.find((p) => String(p.sku) === normalized || String(p.code) === normalized);
    };
    const feeModelByProduct = (product, fallbackSku) => {
      if (product) return skuFeeModels[String(product.sku)] || skuFeeModels[String(product.code)] || {};
      return skuFeeModels[String(fallbackSku)] || {};
    };
    const orderProductKey = (order) => {
      const product = productBySku(order.sku);
      return product ? String(product.code || product.sku) : normalizeOffer(order.sku);
    };
    const financeEstimateForOrder = (order) => {
      const key = orderProductKey(order);
      const samples = orders.filter((item) => item !== order && item.financeReady && !isBrushOrder(item.sku) && orderProductKey(item) === key);
      if (!samples.length) return null;
      const avg = (field) => samples.reduce((sum, item) => sum + Number(item[field] || 0), 0) / samples.length;
      return {
        commission: avg("commission"),
        logisticsFee: avg("logisticsFee"),
        handlingFee: avg("handlingFee"),
        acquiringFee: avg("acquiringFee"),
        otherFixedFee: avg("otherFixedFee"),
      };
    };
    const normalizeOrderRange = () => {
      orderDateFrom = $("orderDateFrom")?.value || addDays(todayIso(), -59);
      orderDateTo = $("orderDateTo")?.value || todayIso();
      if (orderDateFrom > orderDateTo) {
        [orderDateFrom, orderDateTo] = [orderDateTo, orderDateFrom];
      }
      if ($("orderDateFrom")) $("orderDateFrom").value = orderDateFrom;
      if ($("orderDateTo")) $("orderDateTo").value = orderDateTo;
      updateOrderDateButton();
      return true;
    };
    const updateOrderDateButton = () => {
      if ($("orderDateRangeButton")) $("orderDateRangeButton").textContent = `${orderDateFrom} - ${orderDateTo}`;
      if ($("orderDateFromDisplay")) $("orderDateFromDisplay").textContent = orderDateFrom.replaceAll("-", "/");
      if ($("orderDateToDisplay")) $("orderDateToDisplay").textContent = orderDateTo.replaceAll("-", "/");
    };
    const monthLabel = (date) => `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
    const renderCalendar = () => {
      const box = $("orderCalendar");
      if (!box) return;
      const base = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
      const months = [0, 1].map((offset) => new Date(base.getFullYear(), base.getMonth() + offset, 1));
      $("calendarTitle").textContent = `${monthLabel(months[0])} - ${monthLabel(months[1])}`;
      const weeks = ["一", "二", "三", "四", "五", "六", "日"];
      box.innerHTML = months.map((month) => {
        const first = new Date(month.getFullYear(), month.getMonth(), 1);
        const startOffset = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < startOffset; i += 1) {
          days.push(`<span class="calendar-empty"></span>`);
        }
        for (let date = 1; date <= daysInMonth; date += 1) {
          const day = new Date(month.getFullYear(), month.getMonth(), date);
          const iso = localIso(day);
          const rangeFrom = orderDateFrom <= orderDateTo ? orderDateFrom : orderDateTo;
          const rangeTo = orderDateFrom <= orderDateTo ? orderDateTo : orderDateFrom;
          const classes = [
            "calendar-day",
            iso === todayIso() ? "today" : "",
            iso === rangeFrom || iso === rangeTo || iso === pendingOrderDateAnchor ? "selected" : "",
            iso > rangeFrom && iso < rangeTo ? "in-range" : "",
          ].filter(Boolean).join(" ");
          days.push(`<button type="button" class="${classes}" data-date="${iso}">${day.getDate()}</button>`);
        }
        return `<div class="calendar-month">
          <div class="calendar-title">${monthLabel(month)}</div>
          <div class="calendar-week">${weeks.map((w) => `<span>${w}</span>`).join("")}</div>
          <div class="calendar-days">${days.join("")}</div>
        </div>`;
      }).join("");
    };
    const setOrderDate = async (value) => {
      if (!pendingOrderDateAnchor) {
        pendingOrderDateAnchor = value;
        orderDateFrom = value;
        orderDateTo = value;
        $("orderDateFrom").value = orderDateFrom;
        $("orderDateTo").value = orderDateTo;
        updateOrderDateButton();
        renderCalendar();
        return;
      }
      const sorted = [pendingOrderDateAnchor, value].sort();
      pendingOrderDateAnchor = null;
      orderDateFrom = sorted[0];
      orderDateTo = sorted[1];
      $("orderDateFrom").value = orderDateFrom;
      $("orderDateTo").value = orderDateTo;
      updateOrderDateButton();
      renderCalendar();
      $("orderDateRangePanel")?.classList.remove("open");
      await reloadOrdersForRange(orderDateFrom, orderDateTo);
    };
    const trendOrdersKey = "ozon_wb_trend_orders_v1";
    const orderIdentity = (order) => `${order.date}|${order.store}|${order.orderNo}|${order.sku}`;
    const mergeIntoTrendOrders = (newOrders) => {
      if (!Array.isArray(newOrders) || !newOrders.length) return;
      const seen = new Set(trendOrders.map(orderIdentity));
      let appended = false;
      for (const order of newOrders) {
        const id = orderIdentity(order);
        if (!seen.has(id)) {
          trendOrders.push(order);
          seen.add(id);
          appended = true;
        }
      }
      if (appended) {
        trendOrders.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        localStorage.setItem(trendOrdersKey, JSON.stringify(trendOrders));
      }
    };
    const save = () => {
      localStorage.setItem(productKey, JSON.stringify(products));
      localStorage.setItem(orderKey, JSON.stringify(orders));
      localStorage.setItem(trendOrdersKey, JSON.stringify(trendOrders));
      localStorage.setItem(competitorKey, JSON.stringify(competitors));
      localStorage.setItem(apiConfigKey, JSON.stringify(apiConfigs));
      localStorage.setItem(storeGroupKey, JSON.stringify(storeGroups));
      localStorage.setItem(importedAdsKey, JSON.stringify(importedAds));
      localStorage.setItem(adsTaskCacheKey, JSON.stringify(adsTaskCache));
      try { localStorage.setItem(adsRowsCacheKey, JSON.stringify(adsRowsCache)); } catch {}
      localStorage.setItem(adImageCacheKey, JSON.stringify(adImageCache));
      localStorage.setItem(orderRangeCacheKey, JSON.stringify(orderRangeCache));
      localStorage.setItem(storeAnalyticsCacheKey, JSON.stringify(storeAnalyticsCache));
      try { localStorage.setItem(trendDailyAnalyticsKey, JSON.stringify(trendDailyAnalytics)); } catch {}
      try { localStorage.setItem(summarySnapshotKey, JSON.stringify(summarySnapshot)); } catch {}
      try { localStorage.setItem(platformFeesKey, JSON.stringify(platformFees)); } catch {}
      // 店铺同步到云端 KV(去敏感字段:secret 完整保留,发布时需要)
      syncStoresToCloud();
    };

    // 店铺持久化到 KV(跨设备/跨部署共享)
    let cloudStoresSyncing = false;
    function syncStoresToCloud() {
      if (cloudStoresSyncing) return;
      cloudStoresSyncing = true;
      fetch("/api/stores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stores: apiConfigs }),
      }).catch((e) => console.warn("[stores] 云端同步失败:", e.message))
        .finally(() => { cloudStoresSyncing = false; });
    }
    // 启动时从 KV 加载店铺,与本地合并(KV 优先,因为可能是其他设备更新)
    async function loadStoresFromCloud() {
      try {
        const res = await fetch("/api/stores");
        const data = await res.json();
        if (data.ok && Array.isArray(data.stores) && data.stores.length) {
          // KV 有数据:合并(以 id 为准,KV 覆盖本地,本地独有的保留)
          const cloudIds = new Set(data.stores.map((s) => s.id));
          const localOnly = apiConfigs.filter((s) => !cloudIds.has(s.id));
          apiConfigs = [...data.stores, ...localOnly];
          localStorage.setItem(apiConfigKey, JSON.stringify(apiConfigs));
          return true;
        }
      } catch (e) {
        console.warn("[stores] 云端加载失败:", e.message);
      }
      return false;
    }

    async function apiRequest(path, options = {}) {
      const response = await fetch(path, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
      });
      if (!response.ok) throw new Error(`API 请求失败：${response.status}`);
      return response.json();
    }

    const cacheDayKey = () => todayIso();
    const rangeCacheKey = (from, to) => `orders-v2|${from}|${to}`;
    const isFutureRange = (from) => from > todayIso();
    const rangeNeedsRefresh = (entry, from, to, force) => {
      if (force) return true;
      if (!entry) return true;
      if (to >= todayIso()) return true;
      const entryFetchDate = entry.fetchDate || "";
      return entryFetchDate !== mskFetchBoundaryDate();
    };
    // 判断是否已覆盖目标范围[from,to],两种来源:
    // 1) trendOrders:累积全部历史订单(按订单实际日期判断边界)
    // 2) orderRangeCache:已缓存的范围(边界更可靠,不受某天没订单影响)
    // 任一来源覆盖即返回 true,这样选子范围(如6-4~6-11)能本地秒出
    const trendOrdersCoversRange = (from, to) => {
      if (!from || !to) return false;
      if (to >= todayIso()) return false;   // 包含今天的范围不本地筛(要实时)
      // 来源1:trendOrders 按订单日期判断
      let minDate = "9999", maxDate = "0000";
      if (Array.isArray(trendOrders) && trendOrders.length) {
        for (const o of trendOrders) {
          const d = String(o.date || "");
          if (!d) continue;
          if (d < minDate) minDate = d;
          if (d > maxDate) maxDate = d;
        }
        if (minDate <= from && maxDate >= to) return true;
      }
      // 来源2:orderRangeCache 的范围边界(更可靠,不受某天没订单影响)
      // rangeCacheKey 格式: orders-v2|from|to,反解出 from/to
      for (const k of Object.keys(orderRangeCache)) {
        const parts = k.split("|");
        if (parts.length < 3) continue;
        const cf = parts[1], ct = parts[2];
        const entry = orderRangeCache[k];
        if (entry && Array.isArray(entry.orders) && entry.orders.length > 0 && cf <= from && ct >= to) {
          return true;
        }
      }
      console.log("[trendCover] 未覆盖:", { from, to, trendMin: minDate, trendMax: maxDate, today: todayIso(), cachedRanges: Object.keys(orderRangeCache) });
      return false;
    };
    // 从 trendOrders 本地筛选指定范围(避免重复请求)
    const ordersFromTrend = (from, to) => {
      return trendOrders.filter((o) => {
        const d = String(o.date || "");
        return d >= from && d <= to;
      });
    };
    const adRowsArray = () => Array.isArray(backendAds) ? backendAds : (Array.isArray(backendAds?.rows) ? backendAds.rows : []);
    const adRowHasMetrics = (row) => Number(row.adCost || 0) || Number(row.adRevenue || row.revenue || 0) || Number(row.adOrders || 0) || Number(row.impressions || 0) || Number(row.clicks || 0);
    const adRowHasRawData = (row) => row && typeof row === "object" && Object.keys(row.raw || {}).length > 0;
    const adRowVisible = (row) => adRowHasMetrics(row) || adRowHasRawData(row) || Object.keys(row || {}).length > 0;
    const adMetricRows = () => adRowsArray().filter(adRowHasMetrics);

    function scheduleAdsPoll(from, to) {
      const pending = adsStatusRows.find((row) => row.uuid && !/READY|CACHED|OK|SUCCESS|DONE|COMPLETED|ERROR/i.test(String(row.state || "")));
      if (!pending || adRowsArray().filter(adRowVisible).length || adPollAttempts >= 12) return;
      clearTimeout(adPollTimer);
      adPollAttempts += 1;
      adPollTimer = setTimeout(async () => {
        await loadBackendAds({ dateFrom: from, dateTo: to, uuid: pending.uuid });
        renderAds();
      }, 6000);
    }

    async function loadBackendAds(options = {}) {
      if (!backendEnabled) {
        backendAds = [];
        adsStatusRows = [];
        return;
      }
      const from = options.dateFrom || adDateFrom || orderDateFrom;
      const to = options.dateTo || adDateTo || orderDateTo;
      const key = `${from}|${to}`;
      if (!options.forceCreate && adsRowsCache[key]) {
        backendAds = adsRowsCache[key].rows || [];
        adsStatusRows = adsRowsCache[key].status || [];
      }
      if (options.cacheOnly) return;
      if (backendAds.length === 0) { backendAds = []; adsStatusRows = []; }
      const params = new URLSearchParams();
      if (from) params.set("dateFrom", from);
      if (to) params.set("dateTo", to);
      const task = adsTaskCache[key];
      if (options.uuid && !options.forceCreate) params.set("uuid", options.uuid);
      else if (task?.uuid && !options.forceCreate) params.set("uuid", task.uuid);
      else if (options.allowCreate || options.forceCreate) params.set("create", "1");
      if (options.forceCreate) params.set("force", "1");
      try {
        const payload = await apiRequest(`/api/ads/daily-products?${params.toString()}`);
        const newRows = Array.isArray(payload) ? payload : (Array.isArray(payload?.rows) ? payload.rows : []);
        const newStatus = Array.isArray(payload) ? [] : (Array.isArray(payload?.meta) ? payload.meta : []);
        if (!newRows.length && !newStatus.some((row) => /READY|DIRECT_JSON/i.test(String(row.state || ""))) && backendAds.length) {
          adsStatusRows = newStatus;
        } else {
          backendAds = newRows;
          adsStatusRows = newStatus;
        }
        if (backendAds.length) {
          const cleanStatus = adsStatusRows.filter((row) => !row.uuid || /READY|OK|SUCCESS|DONE|COMPLETED|CACHED/i.test(String(row.state || "")));
          adsRowsCache[key] = { rows: backendAds, status: cleanStatus, updatedAt: new Date().toISOString() };
          save();
        }
        fetchAdImagesForRows(backendAds).then(renderAds);
        const found = adsStatusRows.find((row) => row.uuid);
        if (found?.uuid) {
          adsTaskCache[key] = { uuid: found.uuid, state: found.state, updatedAt: new Date().toISOString() };
          save();
        }
        if (adRowsArray().filter(adRowVisible).length || options.forceCreate) adPollAttempts = 0;
        scheduleAdsPoll(from, to);
        if (options.allowCreate && !adMetricRows().length && !task?.uuid && adsStatusRows.some((row) => row.state === "NO_REPORT_TASK")) {
          return loadBackendAds({ forceCreate: true, dateFrom: from, dateTo: to });
        }
      } catch (error) {
        if (!adsRowsCache[key]) {
          backendAds = [];
          adsStatusRows = [{ store: "API", state: "ERROR", error: error.message || String(error) }];
        }
      }
    }

    function setAdsLoading(loading) {
      const button = $("refreshAdsApi");
      const buttonWrap = button?.parentElement;
      const status = $("adImportStatus");
      const adsTab = $("ads");
      if (loading) {
        if (adsTab) adsTab.classList.add("ads-loading");
        if (button) {
          button.disabled = true;
          button.classList.add("loading");
          button.innerHTML = '<span class="btn-spinner"></span> 正在抓取广告数据...';
        }
        if (buttonWrap && !buttonWrap.querySelector(".ads-fetch-hint")) {
          const hint = document.createElement("span");
          hint.className = "ads-fetch-hint";
          hint.innerHTML = '<span class="inline-spinner"></span> 正在向 Ozon 请求广告报表，最长可能需要 1-2 分钟…';
          buttonWrap.appendChild(hint);
        }
        if (status) status.innerHTML = '<span class="inline-spinner"></span> 正在向 Ozon 请求广告报表，最长可能需要 1-2 分钟…';
      } else {
        if (adsTab) adsTab.classList.remove("ads-loading");
        if (button) {
          button.disabled = false;
          button.classList.remove("loading");
          button.textContent = "刷新 API 广告数据";
        }
        buttonWrap?.querySelector(".ads-fetch-hint")?.remove();
      }
    }

    async function refreshAdsApi() {
      setAdsLoading(true);
      try {
        adPollAttempts = 0;
        clearTimeout(adPollTimer);
        const key = `${adDateFrom}|${adDateTo}`;
        delete adsTaskCache[key];
        save();
        await loadBackendAds({ forceCreate: true, dateFrom: adDateFrom, dateTo: adDateTo });
        renderAds();
      } finally {
        setAdsLoading(false);
      }
    }

    let adsAutoRefreshing = false;
    function adsRowsCoverRange(from, to) {
      for (const cacheKey of Object.keys(adsRowsCache)) {
        const [cFrom, cTo] = cacheKey.split("|");
        if (cFrom <= from && cTo >= to) return { rows: adsRowsCache[cacheKey].rows || [], status: adsRowsCache[cacheKey].status || [] };
      }
      if (backendAds.length) {
        return { rows: backendAds, status: adsStatusRows };
      }
      return null;
    }
    async function autoRefreshAds() {
      if (!backendEnabled || adsAutoRefreshing) return;
      adsAutoRefreshing = true;
      try {
        const key = `${adDateFrom}|${adDateTo}`;
        if (adsRowsCache[key]?.rows?.length) {
          backendAds = adsRowsCache[key].rows || [];
          adsStatusRows = adsRowsCache[key].status || [];
          renderAds();
          return;
        }
        const covered = adsRowsCoverRange(adDateFrom, adDateTo);
        if (covered?.rows?.length) {
          backendAds = covered.rows;
          adsStatusRows = covered.status;
          renderAds();
          return;
        }
        renderAds();
        const wideFrom = addDays(adDateFrom < todayIso() ? adDateFrom : todayIso(), -30);
        const wideTo = todayIso();
        await loadBackendAds({ forceCreate: true, dateFrom: wideFrom, dateTo: wideTo });
        const wideKey = `${wideFrom}|${wideTo}`;
        const wideRows = adsRowsCache[wideKey]?.rows || backendAds;
        if (wideRows.length) {
          backendAds = wideRows;
          adsStatusRows = adsRowsCache[wideKey]?.status || adsStatusRows;
        }
        renderAds();
      } catch {} finally {
        adsAutoRefreshing = false;
      }
    }

    async function loadBackendOrders(options = {}) {
      if (!backendEnabled) return false;
      const key = rangeCacheKey(orderDateFrom, orderDateTo);
      if (isFutureRange(orderDateFrom)) {
        orders = [];
        if ($("orderRangeStatus")) $("orderRangeStatus").textContent = `订单范围：${orderDateFrom} 至 ${orderDateTo}，日期还没到，暂无订单。`;
        return false;
      }
      const cached = orderRangeCache[key];
      const includeToday = orderDateTo >= todayIso();
      // 防御:缓存数据可能被早期 withCache bug 破坏成对象,必须校验是数组
      // 另外:历史范围的缓存如果是空数组,可能是之前拉取失败,强制重新拉取
      const cacheUsable = cached && Array.isArray(cached.orders) && cached.orders.length > 0;
      if (!rangeNeedsRefresh(cached, orderDateFrom, orderDateTo, options.force) && cacheUsable) {
        orders = cached.orders;
        loadBackendAds({ cacheOnly: true });
        if (adRowsArray().length) orders = mergeAdRowsIntoOrders(orders, adRowsArray());
        if ($("orderRangeStatus")) $("orderRangeStatus").textContent = `订单范围：${orderDateFrom} 至 ${orderDateTo}，已从本地缓存读取 ${orders.length} 条订单（${cached.fetchDate} 抓取）。`;
        return true;   // 本地命中,无需再调 API
      }
      // 智能本地筛选:trendOrders(累积历史)如果已覆盖目标范围,直接本地秒出,不再请求
      // 这样选子范围(如6-10~6-15)时,只要之前抓过更大的范围(如28天),就秒出
      if (!options.force && trendOrdersCoversRange(orderDateFrom, orderDateTo)) {
        orders = ordersFromTrend(orderDateFrom, orderDateTo);
        if (adRowsArray().length) orders = mergeAdRowsIntoOrders(orders, adRowsArray());
        orderRangeCache[key] = { orders, fetchDate: mskFetchBoundaryDate(), includeToday: false, updatedAt: new Date().toISOString() };
        if ($("orderRangeStatus")) $("orderRangeStatus").textContent = `订单范围：${orderDateFrom} 至 ${orderDateTo}，已从本地历史数据筛选 ${orders.length} 条订单。`;
        return true;   // 本地命中,无需再调 API
      }
      if ($("orderRangeStatus")) $("orderRangeStatus").textContent = `正在抓取 ${orderDateFrom} 至 ${orderDateTo} 的订单，请稍等...`;
      const params = new URLSearchParams();
      if (orderDateFrom) params.set("dateFrom", orderDateFrom);
      if (orderDateTo) params.set("dateTo", orderDateTo);
      if (options.force) params.set("force", "1");   // 强制跳过云端 KV 缓存
      orders = await apiRequest(`/api/orders?${params.toString()}`);
      orders = Array.isArray(orders) ? orders : (Array.isArray(orders?.result) ? orders.result : []);
      mergeIntoTrendOrders(orders);
      loadBackendAds({ cacheOnly: true });
      if (adRowsArray().length) orders = mergeAdRowsIntoOrders(orders, adRowsArray());
      orderRangeCache[key] = { orders, fetchDate: mskFetchBoundaryDate(), includeToday, updatedAt: new Date().toISOString() };
      if ($("orderRangeStatus")) $("orderRangeStatus").textContent = `订单范围：${orderDateFrom} 至 ${orderDateTo}，已抓取并缓存 ${orders.length} 条订单。`;
      save();
      return false;   // 走了 API
    }

    // 合并按天分析数据到累积存储(去重:date|store 唯一)
    const mergeIntoTrendDailyAnalytics = (newRows) => {
      if (!Array.isArray(newRows) || !newRows.length) return;
      const seen = new Set(trendDailyAnalytics.map((r) => `${r.date}|${r.store}`));
      let appended = false;
      for (const r of newRows) {
        const id = `${r.date}|${r.store}`;
        if (!seen.has(id)) {
          trendDailyAnalytics.push(r);
          seen.add(id);
          appended = true;
        }
      }
      if (appended) {
        trendDailyAnalytics.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        try { localStorage.setItem(trendDailyAnalyticsKey, JSON.stringify(trendDailyAnalytics)); } catch {}
      }
    };
    // 从累积的按天分析数据筛选指定范围,并聚合为按店铺的汇总行
    // 这样选任意子范围都能本地秒出(不调 API),返回结构与 fetchStoreAnalytics 一致
    const aggregateDailyAnalytics = (from, to) => {
      const inRange = trendDailyAnalytics.filter((r) => {
        const d = String(r.date || "");
        return d >= from && d <= to;
      });
      const map = new Map();
      for (const r of inRange) {
        const store = r.store || "未命名店铺";
        const acc = map.get(store) || { store, revenue: 0, orderedUnits: 0, totalClicks: 0, naturalImpressions: 0, naturalCartAdds: 0 };
        acc.revenue += Number(r.revenue || 0);
        acc.orderedUnits += Number(r.orderedUnits || 0);
        acc.totalClicks += Number(r.totalClicks || 0);
        acc.naturalImpressions += Number(r.naturalImpressions || 0);
        acc.naturalCartAdds += Number(r.naturalCartAdds || 0);
        map.set(store, acc);
      }
      return [...map.values()].map((t) => {
        t.totalImpressions = t.naturalImpressions;
        t.totalCtr = t.totalImpressions ? (t.totalClicks / t.totalImpressions * 100) : 0;
        t.naturalCartRate = t.naturalImpressions ? (t.naturalCartAdds / t.naturalImpressions * 100) : 0;
        return t;
      });
    };
    // 判断累积的按天分析数据是否覆盖目标范围
    const dailyAnalyticsCoversRange = (from, to) => {
      if (!Array.isArray(trendDailyAnalytics) || !trendDailyAnalytics.length) return false;
      if (!from || !to) return false;
      if (to >= todayIso()) return false;
      let minDate = "9999", maxDate = "0000";
      for (const r of trendDailyAnalytics) {
        const d = String(r.date || "");
        if (!d) continue;
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
      }
      return minDate <= from && maxDate >= to;
    };

    async function loadStoreAnalytics(options = {}) {
      storeAnalyticsRows = [];
      if (!backendEnabled) return false;
      const key = rangeCacheKey(orderDateFrom, orderDateTo);
      // 1) 精确缓存命中
      const cached = storeAnalyticsCache[key];
      if (!rangeNeedsRefresh(cached, orderDateFrom, orderDateTo, options.force) && Array.isArray(cached?.rows) && cached.rows.length) {
        storeAnalyticsRows = cached.rows;
        return true;
      }
      // 2) 本地累积覆盖 → 直接聚合秒出
      if (!options.force && dailyAnalyticsCoversRange(orderDateFrom, orderDateTo)) {
        storeAnalyticsRows = aggregateDailyAnalytics(orderDateFrom, orderDateTo);
        storeAnalyticsCache[key] = { rows: storeAnalyticsRows, fetchDate: mskFetchBoundaryDate(), updatedAt: new Date().toISOString() };
        return true;
      }
      // 3) 调 API:抓一个更大的范围(本月),累积到 trendDailyAnalytics,以后子范围都能本地秒出
      try {
        const today = todayIso();
        const yesterday = addDays(today, -1);
        const fetchFrom = `${orderDateFrom.slice(0, 8)}01`;   // 从月初抓(扩大范围)
        const fetchTo = orderDateTo >= today ? yesterday : orderDateTo;
        if (fetchFrom <= fetchTo) {
          const params = new URLSearchParams();
          params.set("dateFrom", fetchFrom);
          params.set("dateTo", fetchTo);
          if (options.force) params.set("force", "1");
          const resp = await apiRequest(`/api/analytics/daily?${params.toString()}`);
          const dailyRows = Array.isArray(resp) ? resp : (Array.isArray(resp?.result) ? resp.result : []);
          mergeIntoTrendDailyAnalytics(dailyRows);
        }
        // 从累积数据聚合出当前范围
        storeAnalyticsRows = aggregateDailyAnalytics(orderDateFrom, orderDateTo);
        storeAnalyticsCache[key] = { rows: storeAnalyticsRows, fetchDate: mskFetchBoundaryDate(), updatedAt: new Date().toISOString() };
        save();
        return false;
      } catch {
        storeAnalyticsRows = [];
        return false;
      }
    }

    async function runApiDiagnostics() {
      const box = $("apiDiagnostics");
      if (!box) return;
      box.textContent = "正在检测线上 API...";
      const checks = [
        ["health", "/api/health"],
        ["debug", "/api/debug"],
        ["products", "/api/products"],
        ["orders", "/api/orders"],
        ["ads", "/api/ads/daily-products"],
      ];
      const results = [];
      for (const [name, path] of checks) {
        try {
          const started = performance.now();
          const data = await apiRequest(path);
          const elapsed = Math.round(performance.now() - started);
          results.push({
            name,
            ok: true,
            ms: elapsed,
            count: Array.isArray(data) ? data.length : undefined,
            data: Array.isArray(data) ? data.slice(0, 2) : data,
          });
        } catch (error) {
          results.push({ name, ok: false, error: error.message });
        }
      }
      box.innerHTML = `<pre style="white-space:pre-wrap;margin:0;font-size:12px;line-height:1.6">${escapeHtml(JSON.stringify(results, null, 2))}</pre>`;
    }

    function mergeAdRowsIntoOrders(sourceOrders, adRows) {
      // 防御:确保是数组(避免 sourceOrders.forEach is not a function)
      const orders = Array.isArray(sourceOrders) ? sourceOrders : [];
      const ads = Array.isArray(adRows) ? adRows : [];
      const adMap = new Map();
      ads.forEach((row) => {
        adMap.set(`${row.date}|${row.store}|${row.sku}`, Number(row.adCost || 0));
      });
      const groupCounts = new Map();
      orders.forEach((order) => {
        const key = `${order.date}|${order.store}|${order.sku}`;
        groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
      });
      return orders.map((order) => {
        const key = `${order.date}|${order.store}|${order.sku}`;
        const groupAd = adMap.get(key);
        if (groupAd === undefined) return order;
        return { ...order, adCost: groupAd / Math.max(groupCounts.get(key) || 1, 1) };
      });
    }

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        btn.classList.add("active");
        $(btn.dataset.tab).classList.add("active");
        $("pageTitle").textContent = btn.textContent;
        if (btn.dataset.tab === "dashboard") drawRevenueChart();
        if (btn.dataset.tab === "ads") drawAdChart();
        // 切到数据分析 tab 时,如果还没加载过,自动加载
        if (btn.dataset.tab === "analytics" && !analyticsProductRows.length) refreshAnalytics();
      });
    });

    // 数据分析 tab 的事件绑定
    document.querySelectorAll("[data-analytics-range]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-analytics-range]").forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        analyticsRangeValue = button.dataset.analyticsRange;
        refreshAnalytics();
      });
    });
    $("analyticsStoreFilter")?.addEventListener("change", (e) => {
      analyticsStoreValue = e.target.value;
      renderAnalytics();
    });
    $("analyticsSkuFilter")?.addEventListener("input", (e) => {
      analyticsSkuValue = e.target.value;
      renderAnalytics();
    });
    $("analyticsRefresh")?.addEventListener("click", () => refreshAnalytics(true));

    function calcOrder(order) {
      if (isBrushOrder(order.sku)) {
        return {
          product: null,
          feeModel: {},
          sale: 0,
          commissionRate: 0,
          commission: 0,
          logisticsFee: 0,
          handlingFee: 0,
          acquiringFee: 0,
          otherFixedFee: 0,
          platformFee: 0,
          refundFee: 0,
          adCost: 0,
          platformProfit: 0,
          serviceFee: 0,
          cost: 0,
          preliminaryProfit: 0,
          realProfit: 0,
          ignored: true,
        };
      }
      const product = productBySku(order.sku);
      const feeModel = feeModelByProduct(product, order.sku);
      const useActualFinance = Boolean(order.financeReady);
      const learnedEstimate = useActualFinance ? null : financeEstimateForOrder(order);
      const sale = Number(order.backendPrice || order.sale || feeModel.defaultPrice || 0);
      const commissionRate = Number(feeModel.commissionRate || 0);
      const commission = useActualFinance ? Number(order.commission || 0) : Number(learnedEstimate?.commission ?? (commissionRate ? sale * commissionRate : Number(order.commission || 0)));
      const logisticsFee = useActualFinance ? Number(order.logisticsFee || 0) : Number(learnedEstimate?.logisticsFee ?? order.logisticsFee ?? feeModel.logisticsFee ?? 0);
      const handlingFee = useActualFinance ? Number(order.handlingFee || 0) : Number(learnedEstimate?.handlingFee ?? order.handlingFee ?? feeModel.handlingFee ?? 0);
      const acquiringFee = useActualFinance ? Number(order.acquiringFee || 0) : Number(learnedEstimate?.acquiringFee ?? order.acquiringFee ?? feeModel.acquiringFee ?? 0);
      const otherFixedFee = useActualFinance ? Number(order.otherFixedFee || 0) : Number(learnedEstimate?.otherFixedFee ?? order.otherFixedFee ?? feeModel.otherFixedFee ?? 0);
      const platformFee = logisticsFee + handlingFee + acquiringFee + otherFixedFee;
      const refundFee = Number(order.refundFee || 0);
      const adCost = Number(order.adCost || 0);
      const platformProfit = sale - commission - platformFee - refundFee;
      const serviceFee = platformProfit * 0.13;
      const cost = product ? totalRub(product) : 0;
      const preliminaryProfit = platformProfit - serviceFee - cost;
      return { product, feeModel, sale, commissionRate, commission, logisticsFee, handlingFee, acquiringFee, otherFixedFee, platformFee, refundFee, adCost, platformProfit, serviceFee, cost, preliminaryProfit, realProfit: preliminaryProfit - adCost, learnedEstimate: Boolean(learnedEstimate) };
    }

    function calcPriceProfit(productId, price) {
      const product = productById(productId);
      const sale = Number(price || 0);
      const feeModel = product ? skuFeeModels[String(product.sku)] || {} : {};
      const commissionRate = Number(feeModel.commissionRate || 0.47);
      const commission = sale * commissionRate;
      const logisticsFee = Number(feeModel.logisticsFee || 0);
      const handlingFee = Number(feeModel.handlingFee || 0);
      const acquiringFee = Number(feeModel.acquiringFee || 0);
      const otherFixedFee = Number(feeModel.otherFixedFee || 0);
      const platformFee = logisticsFee + handlingFee + acquiringFee + otherFixedFee;
      const platformProfit = sale - commission - platformFee;
      const serviceFee = platformProfit * 0.13;
      const cost = product ? totalRub(product) : 0;
      const profit = platformProfit - serviceFee - cost;
      return { profit, rate: sale ? profit / sale * 100 : 0, commission, commissionRate, platformFee, serviceFee, cost };
    }

    function allStoreNames() {
      const names = new Set();
      apiConfigs.forEach((item) => item.name && names.add(item.name));
      orders.forEach((order) => order.store && names.add(order.store));
      importedAds.forEach((row) => row.store && names.add(row.store));
      adRowsArray().forEach((row) => row.store && names.add(row.store));
      (Array.isArray(storeAnalyticsRows) ? storeAnalyticsRows : []).forEach((row) => row.store && names.add(row.store));
      return [...names].sort();
    }

    function storesInGroup(groupId) {
      const group = storeGroups.find((item) => item.id === groupId);
      return group?.stores || [];
    }

    function isStoreInSelection(storeName) {
      if (selectedStore === "all") return true;
      if (String(selectedStore).startsWith("group:")) {
        const groupId = selectedStore.slice("group:".length);
        return storesInGroup(groupId).includes(storeName);
      }
      return storeName === selectedStore;
    }

    function formatCreatedAt(value) {
      if (!value) return "-";
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toLocaleString("zh-CN", { hour12: false });
      return String(value);
    }

    function purgeStoreData(storeName) {
      orders = orders.filter((order) => order.store !== storeName);
      trendOrders = trendOrders.filter((order) => order.store !== storeName);
      importedAds = importedAds.filter((row) => row.store !== storeName);
      storeAnalyticsRows = storeAnalyticsRows.filter((row) => row.store !== storeName);
      Object.keys(orderRangeCache).forEach((key) => {
        const entry = orderRangeCache[key];
        if (entry?.orders) {
          entry.orders = entry.orders.filter((order) => order.store !== storeName);
          if (!entry.orders.length) delete orderRangeCache[key];
        }
      });
      Object.keys(storeAnalyticsCache).forEach((key) => {
        const entry = storeAnalyticsCache[key];
        if (Array.isArray(entry?.rows)) {
          entry.rows = entry.rows.filter((row) => row.store !== storeName);
          if (!entry.rows.length) delete storeAnalyticsCache[key];
        }
      });
      Object.keys(adsRowsCache).forEach((key) => {
        const entry = adsRowsCache[key];
        if (Array.isArray(entry?.rows)) {
          entry.rows = entry.rows.filter((row) => row.store !== storeName);
          if (Array.isArray(entry?.status)) entry.status = entry.status.filter((row) => row.store !== storeName);
          if (!entry.rows.length && (!entry.status || !entry.status.length)) delete adsRowsCache[key];
        }
      });
      Object.keys(adsTaskCache).forEach((key) => { delete adsTaskCache[key]; });
      storeGroups.forEach((group) => {
        if (Array.isArray(group.stores)) group.stores = group.stores.filter((name) => name !== storeName);
      });
    }

    function renderChartControls() {
      const select = $("chartStoreSelect");
      if (select) {
        const stores = [...new Set([...orders, ...trendOrders].map((order) => order.store).filter(Boolean))].sort();
        const nextHtml = [`<option value="all">全部店铺</option>`, ...stores.map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`)].join("");
        if (select.innerHTML !== nextHtml) select.innerHTML = nextHtml;
        if (!stores.includes(chartStore) && chartStore !== "all") chartStore = "all";
        select.value = chartStore;
      }
      updateChartMenuText();
      syncChartRangePills();
      syncSummaryRangePills();
    }

    function renderAll() {
      normalizeCompetitorRecords();
      renderProductSelects();
      renderStoreFilter();
      renderCosts();
      renderDashboard();
      renderStoreOverview();
      renderStoreOverviewControls();
      renderChartControls();
      renderAds();
      renderCompetitors();
      renderCompetitorProfit();
      renderApiConfigs();
      renderStoreGroups();
      save();
    }

    function renderDashboard() {
      const today = todayIso();
      const scopedOrders = filteredOrders();
      const rangeOrders = scopedOrders.filter((o) => (!orderDateFrom || o.date >= orderDateFrom) && (!orderDateTo || o.date <= orderDateTo));
      const todayRevenue = rangeOrders.reduce((sum, o) => sum + calcOrder(o).sale, 0);
      const weekRevenue = scopedOrders.filter((o) => o.date === addDays(today, -7)).reduce((sum, o) => sum + calcOrder(o).sale, 0);
      const todayGrossProfit = rangeOrders.reduce((sum, o) => sum + calcOrder(o).preliminaryProfit, 0);
      const todayAdCost = rangeOrders.reduce((sum, o) => sum + Number(o.adCost || 0), 0);
      const todayProfit = todayGrossProfit - todayAdCost;
      $("todayRevenue").textContent = rub(todayRevenue);
      $("weekAgoRevenue").textContent = rub(weekRevenue);
      $("todayProfit").textContent = rub(todayProfit);
      $("todayOrderCount").textContent = rangeOrders.length;
      // 诊断:当范围数据为 0 时,在"范围总营业额"下方提示具体原因
      const revLabel = $("revenueMetricLabel");
      if (revLabel) {
        if (!orders.length) {
          revLabel.textContent = `范围总营业额（提示:未拉取到任何订单,共 ${orders.length} 条）`;
        } else if (!scopedOrders.length) {
          revLabel.textContent = `范围总营业额（提示:订单 ${orders.length} 条,但当前店铺筛选后为 0,请检查店铺筛选）`;
        } else if (!rangeOrders.length) {
          revLabel.textContent = `范围总营业额（提示:订单 ${orders.length} 条,但范围内为 0,可能该时间段无订单。范围 ${orderDateFrom} 至 ${orderDateTo}）`;
        } else {
          revLabel.textContent = "范围总营业额";
        }
      }
      if ($("summaryRangeText")) $("summaryRangeText").textContent = `当前统计范围：${orderDateFrom} 至 ${orderDateTo}`;
      if ($("orderRangeStatus")) {
        // 诊断信息:总订单数 / 过滤后 / 范围内,便于排查为何显示 0
        $("orderRangeStatus").textContent = `订单数据：共 ${orders.length} 条，当前店铺过滤后 ${scopedOrders.length} 条，范围内 ${rangeOrders.length} 条。范围：${orderDateFrom || "最早"} 至 ${orderDateTo || "今天"}。`;
      }
      $("orderRows").innerHTML = [...scopedOrders].sort((a,b) => b.date.localeCompare(a.date)).map((order) => {
        const c = calcOrder(order);
        const financeStatus = c.ignored
          ? `<span class="finance-badge ignored">刷单忽略</span>`
          : order.financeReady
          ? `<span class="finance-badge actual">真实费用</span>`
          : c.learnedEstimate
          ? `<span class="finance-badge learned">同品预估</span>`
          : `<span class="finance-badge estimated">预估费用</span>`;
        return `<tr>
          <td>${order.date}</td>
          <td>${escapeHtml(order.store)}</td>
          <td>${escapeHtml(order.orderNo)}</td>
          <td><strong>${escapeHtml(c.product?.code || order.sku)}</strong><div class="sku">${escapeHtml(c.product?.name || "未匹配成本")}</div></td>
          <td>${financeStatus}</td>
          <td class="money">${rub(c.sale)}</td>
          <td class="money">${rub(c.cost)}</td>
          <td class="money">${rub(c.commission)}</td>
          <td class="money">${rub(c.logisticsFee)}</td>
          <td class="money">${rub(c.handlingFee)}</td>
          <td class="money">${rub(c.acquiringFee)}</td>
          <td class="money">${rub(c.otherFixedFee)}</td>
          <td class="money">${rub(c.refundFee)}</td>
          <td class="money">${rub(c.serviceFee)}</td>
          <td class="money"><strong>${rub(c.preliminaryProfit)}</strong></td>
        </tr>`;
      }).join("");
      drawRevenueChart();
    }

    function analyticsForStore(store) {
      return storeAnalyticsRows.find((row) => row.store === store) || null;
    }

    function metricText(value, fallback = "\u5F85\u63A5\u5165") {
      const number = Number(value || 0);
      return number > 0 ? number.toLocaleString("zh-CN") : fallback;
    }

    function percentText(value, fallback = "\u5F85\u63A5\u5165") {
      const number = Number(value || 0);
      return number > 0 ? number.toFixed(2) + "%" : fallback;
    }

    function buildStoreMetricMap(scoped) {
      const map = new Map();
      scoped.forEach((order) => {
        const c = calcOrder(order);
        const store = order.store || "未命名店铺";
        const row = map.get(store) || { store, revenue: 0, profit: 0, orders: 0, refunds: 0 };
        row.revenue += c.sale;
        row.profit += c.preliminaryProfit;
        if (!c.ignored) row.orders += 1;
        if (Number(c.refundFee || 0) > 0) row.refunds += 1;
        map.set(store, row);
      });
      (Array.isArray(storeAnalyticsRows) ? storeAnalyticsRows : []).forEach((analytics) => {
        const store = analytics.store || "未命名店铺";
        if (!map.has(store)) map.set(store, { store, revenue: 0, profit: 0, orders: 0, refunds: 0 });
      });
      return map;
    }

    function aggregateStoreMetrics(storeMap, storeNames) {
      const aggregate = { store: "", revenue: 0, profit: 0, orders: 0, refunds: 0, exposure: 0, clicks: 0, cartAdds: 0 };
      storeNames.forEach((storeName) => {
        const row = storeMap.get(storeName);
        if (!row) return;
        aggregate.revenue += row.revenue;
        aggregate.profit += row.profit;
        aggregate.orders += row.orders;
        aggregate.refunds += row.refunds;
        const analytics = analyticsForStore(storeName) || {};
        aggregate.exposure += Number(analytics.totalImpressions || analytics.naturalImpressions || analytics.impressions || 0);
        aggregate.clicks += Number(analytics.totalClicks || analytics.clicks || 0);
        aggregate.cartAdds += Number(analytics.naturalCartAdds || 0);
      });
      return aggregate;
    }

    function renderStoreOverview() {
      const body = $("storeOverviewRows");
      if (!body) return;
      const scoped = filteredOrders().filter((o) => (!orderDateFrom || o.date >= orderDateFrom) && (!orderDateTo || o.date <= orderDateTo));
      const storeMap = buildStoreMetricMap(scoped);

      if (storeOverviewView === "group") {
        const groups = storeOverviewGroup === "all" ? storeGroups : storeGroups.filter((group) => group.id === storeOverviewGroup);
        const rows = groups.map((group) => {
          const agg = aggregateStoreMetrics(storeMap, group.stores || []);
          return { group, ...agg };
        });
        if (storeOverviewGroup === "all" && !groups.length) {
          body.innerHTML = '<tr><td colspan="6" class="muted-cell">还没有创建店铺分组，请到「店铺设置」中新增分组。</td></tr>';
          return;
        }
        if (storeOverviewGroup !== "all" && !groups.length) {
          body.innerHTML = '<tr><td colspan="6" class="muted-cell">该分组暂无数据。</td></tr>';
          return;
        }
        body.innerHTML = rows.map((row) => {
          const refundRate = row.orders ? row.refunds / row.orders * 100 : 0;
          const profitClass = row.profit >= 0 ? "positive" : "negative";
          const memberLabel = (row.group.stores || []).length ? (row.group.stores.length + " 家店铺") : "未分配店铺";
          return '<tr>' +
            '<td><strong>' + escapeHtml(row.group.name) + '</strong><div class="sku">负责人：' + escapeHtml(row.group.owner || "—") + ' · ' + escapeHtml(memberLabel) + '</div></td>' +
            '<td class="money">' + rub(row.revenue) + '</td>' +
            '<td class="money ' + profitClass + '"><strong>' + rub(row.profit) + '</strong></td>' +
            '<td>' + row.orders + '</td>' +
            '<td>' + row.refunds + '</td>' +
            '<td>' + refundRate.toFixed(2) + '%</td>' +
          '</tr>';
        }).join("");
        return;
      }

      const rows = [...storeMap.values()].sort((a, b) => b.revenue - a.revenue);
      body.innerHTML = rows.length ? rows.map((row) => {
        const refundRate = row.orders ? row.refunds / row.orders * 100 : 0;
        const profitClass = row.profit >= 0 ? "positive" : "negative";
        return '<tr>' +
          '<td><strong>' + escapeHtml(row.store) + '</strong></td>' +
          '<td class="money">' + rub(row.revenue) + '</td>' +
          '<td class="money ' + profitClass + '"><strong>' + rub(row.profit) + '</strong></td>' +
          '<td>' + row.orders + '</td>' +
          '<td>' + row.refunds + '</td>' +
          '<td>' + refundRate.toFixed(2) + '%</td>' +
        '</tr>';
      }).join("") : '<tr><td colspan="6" class="muted-cell">当前时间范围暂无店铺数据</td></tr>';
    }

    // ============ 数据分析 tab ============
    // 状态:分析数据的范围、店铺、SKU 筛选,以及已加载的按SKU分析数据
    let analyticsRangeValue = "28";
    let analyticsStoreValue = "all";
    let analyticsSkuValue = "";
    let analyticsProductRows = [];   // 从 /api/analytics/products 加载的按SKU数据
    function analyticsRangeDates(value) {
      const today = todayIso();
      const yesterday = addDays(today, -1);
      if (value === "7") return { from: addDays(today, -7), to: yesterday };
      if (value === "quarter") {
        const d = new Date(`${today}T00:00:00`);
        const qm = Math.floor(d.getMonth() / 3) * 3;
        return { from: localIso(new Date(d.getFullYear(), qm, 1)), to: yesterday };
      }
      if (value === "year") return { from: `${new Date(`${today}T00:00:00`).getFullYear()}-01-01`, to: yesterday };
      return { from: addDays(today, -28), to: yesterday };
    }
    async function loadAnalyticsProducts(force = false) {
      const { from, to } = analyticsRangeDates(analyticsRangeValue);
      if ($("analyticsStatus")) $("analyticsStatus").textContent = `正在加载 ${from} 至 ${to} 的按SKU数据…`;
      showGlobalLoader(`正在加载分析数据…`);
      try {
        const params = new URLSearchParams();
        params.set("dateFrom", from);
        params.set("dateTo", to);
        if (force) params.set("force", "1");
        const resp = await apiRequest(`/api/analytics/products?${params.toString()}`);
        analyticsProductRows = Array.isArray(resp) ? resp : (Array.isArray(resp?.result) ? resp.result : []);
        if ($("analyticsStatus")) $("analyticsStatus").textContent = `已加载 ${analyticsProductRows.length} 个SKU(${from} 至 ${to})`;
      } catch (e) {
        analyticsProductRows = [];
        if ($("analyticsStatus")) $("analyticsStatus").textContent = `加载失败:${e.message}`;
      } finally {
        hideGlobalLoader();
      }
    }
    function renderAnalyticsStoreFilter() {
      const select = $("analyticsStoreFilter");
      if (!select) return;
      const stores = [...new Set(analyticsProductRows.map((r) => r.store).filter(Boolean))].sort();
      const current = analyticsStoreValue;
      select.innerHTML = `<option value="all">全部店铺</option>` + stores.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
      if (stores.includes(current) || current === "all") select.value = current;
      else { analyticsStoreValue = "all"; select.value = "all"; }
    }
    function renderAnalytics() {
      renderAnalyticsStoreFilter();
      const body = $("analyticsRows");
      const summary = $("analyticsSummary");
      if (!body) return;
      const kw = analyticsSkuValue.trim().toLowerCase();
      let rows = analyticsProductRows.slice();
      if (analyticsStoreValue !== "all") rows = rows.filter((r) => r.store === analyticsStoreValue);
      if (kw) rows = rows.filter((r) => String(r.sku || "").toLowerCase().includes(kw) || String(r.name || "").toLowerCase().includes(kw));
      // 汇总卡片(只保留有真实数据的指标)
      const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
      const totalUnits = rows.reduce((s, r) => s + Number(r.orderedUnits || 0), 0);
      const totalReturns = rows.reduce((s, r) => s + Number(r.returns || 0), 0);
      const totalCancellations = rows.reduce((s, r) => s + Number(r.cancellations || 0), 0);
      if (summary) {
        summary.innerHTML = `
          <div class="panel metric"><span>总销售额</span><strong>${rub(totalRevenue)}</strong></div>
          <div class="panel metric"><span>总销售件数</span><strong>${Math.round(totalUnits)} 件</strong></div>
          <div class="panel metric"><span>退货件数</span><strong>${Math.round(totalReturns)} 件</strong></div>
          <div class="panel metric"><span>取消件数</span><strong>${Math.round(totalCancellations)} 件</strong></div>`;
      }
      // 明细表(按销售额降序)
      rows.sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
      body.innerHTML = rows.length ? rows.map((r) => {
        return '<tr>' +
          '<td><strong>' + escapeHtml(r.sku || "—") + '</strong><div class="sku">' + escapeHtml(r.name || "未命名商品") + '</div></td>' +
          '<td>' + escapeHtml(r.store || "—") + '</td>' +
          '<td class="money">' + rub(Number(r.revenue || 0)) + '</td>' +
          '<td>' + Math.round(Number(r.orderedUnits || 0)) + '</td>' +
          '<td>' + Math.round(Number(r.returns || 0)) + '</td>' +
          '<td>' + Math.round(Number(r.cancellations || 0)) + '</td>' +
        '</tr>';
      }).join("") : '<tr><td colspan="6" class="muted-cell">暂无数据,请刷新或调整筛选条件</td></tr>';
    }
    async function refreshAnalytics(force = false) {
      await loadAnalyticsProducts(force);
      renderAnalytics();
    }

    function renderStoreOverviewControls() {
      const viewSelect = $("storeOverviewView");
      const groupWrap = $("storeOverviewGroupWrap");
      const groupSelect = $("storeOverviewGroup");
      if (!viewSelect) return;
      if (viewSelect.value !== storeOverviewView) viewSelect.value = storeOverviewView;
      if (groupWrap) groupWrap.hidden = storeOverviewView !== "group";
      if (groupSelect) {
        const options = '<option value="all">全部分组</option>' + storeGroups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join("");
        if (groupSelect.innerHTML !== options) groupSelect.innerHTML = options;
        groupSelect.value = storeGroups.some((group) => group.id === storeOverviewGroup) ? storeOverviewGroup : "all";
        storeOverviewGroup = groupSelect.value;
      }
    }
    function filteredOrders() {
      if (selectedStore === "all") return orders;
      if (String(selectedStore).startsWith("group:")) {
        const groupStores = storesInGroup(selectedStore.slice("group:".length));
        return orders.filter((order) => groupStores.includes(order.store));
      }
      return orders.filter((order) => order.store === selectedStore);
    }

    function renderStoreFilter() {
      const select = $("storeFilter");
      if (!select) return;
      const stores = allStoreNames();
      const validValues = new Set(["all", ...stores, ...storeGroups.map((group) => `group:${group.id}`)]);
      if (!validValues.has(selectedStore)) selectedStore = "all";
      const groupOptions = storeGroups.length
        ? `<optgroup label="店铺分组">${storeGroups.map((group) => `<option value="group:${escapeHtml(group.id)}">${escapeHtml(group.name)}${group.owner ? `（${escapeHtml(group.owner)}）` : ""}</option>`).join("")}</optgroup>`
        : "";
      const storeOptions = stores.length
        ? `<optgroup label="单店">${stores.map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`).join("")}</optgroup>`
        : "";
      const nextHtml = `<option value="all">全部店铺</option>${groupOptions}${storeOptions}`;
      if (select.innerHTML !== nextHtml) select.innerHTML = nextHtml;
      select.value = selectedStore;
    }

    function chartScopedOrders() {
      const base = trendOrders.length ? trendOrders : orders;
      if (chartStore === "all") return base;
      return base.filter((order) => order.store === chartStore);
    }

    function dailyTotalsForRange(from, to) {
      const map = new Map();
      const source = chartScopedOrders();
      source.forEach((order) => {
        if (!order.date || order.date < from || order.date > to) return;
        const c = calcOrder(order);
        const current = map.get(order.date) || { revenue: 0, orders: 0, count: 0 };
        current.revenue += c.sale;
        current.count += c.ignored ? 0 : 1;
        current.orders += 1;
        map.set(order.date, current);
      });
      const days = [];
      let cursor = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      while (cursor <= end) {
        const iso = localIso(cursor);
        days.push({ date: iso, revenue: map.get(iso)?.revenue || 0, orders: map.get(iso)?.orders || 0, count: map.get(iso)?.count || 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      return days;
    }

    function drawRevenueChart() {
      const canvas = $("revenueChart");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const useCount = chartConfig.unit === "count";
      const from = chartDateFrom;
      const to = chartDateTo;
      const period = daysInclusive(from, to);
      const current = dailyTotalsForRange(from, to);
      const previousFrom = addDays(from, -period);
      const previousTo = addDays(from, -1);
      const comparison = period > 1 ? dailyTotalsForRange(previousFrom, previousTo) : [];
      const width = canvas.width;
      const height = canvas.height;
      const padLeft = 54;
      const padRight = 74;
      const padTop = 30;
      const padBottom = 58;
      const chartX = padLeft;
      const chartY = padTop;
      const chartW = width - padLeft - padRight;
      const chartH = height - padTop - padBottom;
      const formatSales = (value) => useCount ? `${Math.round(value)} 件` : rub(value);
      const formatOrders = (value) => `${Math.round(value)} 单`;

      ctx.clearRect(0, 0, width, height);
      // 暖米白背景 + 微弱雾蓝氛围
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#fdfbf6");
      bgGrad.addColorStop(1, "#faf8f3");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
      // 左上角柔和光晕
      const glow = ctx.createRadialGradient(Math.min(width * 0.3, 240), 40, 20, Math.min(width * 0.3, 240), 40, Math.min(width * 0.6, 480));
      glow.addColorStop(0, "rgba(107, 142, 175, 0.07)");
      glow.addColorStop(1, "rgba(107, 142, 175, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      const primaryValue = (item) => useCount ? (item.count || 0) : (item.revenue || 0);
      const maxValue = Math.max(...comparison.map(primaryValue), ...current.map(primaryValue), 1);
      const maxOrders = Math.max(...current.map((item) => item.orders), 1);
      const axisMax = useCount ? (Math.ceil(maxValue / 10) * 10 || 10) : (Math.ceil(maxValue / 1000) * 1000 || 1000);
      const orderAxisMax = Math.ceil(maxOrders / 10) * 10 || 10;
      const xStep = chartW / Math.max(current.length - 1, 1);
      const toY = (value) => chartY + chartH - (Number(value || 0) / axisMax) * chartH;
      const toOrderY = (value) => chartY + chartH - (Number(value || 0) / orderAxisMax) * chartH;
      const toX = (index) => chartX + index * xStep;

      ctx.strokeStyle = "rgba(120, 110, 90, 0.10)";
      ctx.lineWidth = 1;
      ctx.fillStyle = "#948e84";
      ctx.font = "12px SF Pro Display, PingFang SC, Microsoft YaHei, Arial";
      for (let i = 0; i <= 4; i++) {
        const value = axisMax / 4 * i;
        const y = toY(value);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartW, y);
        ctx.stroke();
        ctx.textAlign = "right";
        const leftLabel = useCount ? Math.round(value) : `${(value / 1000).toFixed(value >= 1000 ? 1 : 0)}k`;
        ctx.fillText(leftLabel, chartX - 12, y + 4);
        ctx.textAlign = "left";
        ctx.fillText(Math.round(orderAxisMax / 4 * i), chartX + chartW + 14, y + 4);
      }

      const comparePoints = comparison.map((item, index) => ({ x: toX(index), y: toY(primaryValue(item)) }));
      const orderPoints = current.map((item, index) => ({ x: toX(index), y: toOrderY(item.orders) }));
      if (activeChartIndex !== null && current[activeChartIndex]) {
        const activeX = toX(activeChartIndex);
        ctx.fillStyle = "rgba(107, 142, 175, 0.08)";
        ctx.fillRect(activeX - Math.max(10, xStep / 2), chartY, Math.max(20, xStep), chartH);
        ctx.strokeStyle = "rgba(196, 163, 90, 0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(activeX, chartY);
        ctx.lineTo(activeX, chartY + chartH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawSmoothLine(ctx, comparePoints, "rgba(123, 160, 135, 0.55)", 2, { dots: false, dashed: true });

      const barStep = chartW / Math.max(current.length, 1);
      const barW = Math.min(34, Math.max(8, barStep * .46));
      current.forEach((item, index) => {
        const x = toX(index) - barW / 2;
        const y = toY(primaryValue(item));
        const h = chartY + chartH - y;
        const grad = ctx.createLinearGradient(0, y, 0, chartY + chartH);
        if (index === activeChartIndex) {
          grad.addColorStop(0, "#7ba087");
          grad.addColorStop(1, "#6b8eaf");
        } else {
          grad.addColorStop(0, "rgba(107, 142, 175, 0.85)");
          grad.addColorStop(1, "rgba(123, 160, 135, 0.78)");
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        const r = Math.min(5, barW / 2, h);
        ctx.moveTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, y + h);
        ctx.closePath();
        ctx.fill();
        // 柱顶微光
        if (h > 10) {
          const topGrad = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 18));
          topGrad.addColorStop(0, "rgba(255, 255, 255, 0.35)");
          topGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = topGrad;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + barW / 2, y - 1, x + barW, y);
          ctx.lineTo(x + barW, y + Math.min(h, 18));
          ctx.lineTo(x, y + Math.min(h, 18));
          ctx.closePath();
          ctx.fill();
        }
      });
      drawSmoothLine(ctx, orderPoints, "#c4a35a", 2.5, { dots: false });
      if (activeChartIndex !== null && orderPoints[activeChartIndex]) {
        const point = orderPoints[activeChartIndex];
        ctx.fillStyle = "#fdfbf6";
        ctx.strokeStyle = "#c4a35a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = "#948e84";
      ctx.font = "12px SF Pro Display, PingFang SC, Microsoft YaHei, Arial";
      current.forEach((item, index) => {
        const interval = period <= 7 ? 1 : period <= 14 ? 2 : 4;
        if (index % interval !== 0 && index !== current.length - 1) return;
        ctx.textAlign = "center";
        ctx.fillText(item.date.slice(8), toX(index), height - 34);
        if (period >= 14 && (index === 2 || index === 16)) {
          ctx.fillStyle = "#b8b1a5";
          ctx.fillText(index < 10 ? "Sa" : "Su", toX(index), height - 18);
          ctx.fillStyle = "#948e84";
        }
      });

      revenueChartHitboxes = current.map((item, index) => {
        const compare = comparison[index] || { revenue: 0, count: 0 };
        const curVal = primaryValue(item);
        const prevVal = primaryValue(compare);
        const change = prevVal ? (curVal - prevVal) / prevVal * 100 : null;
        const changeLabel = prevVal
          ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`
          : curVal > 0
          ? "新增"
          : "无变化";
        return {
          x: toX(index) - Math.max(8, xStep / 2),
          y: chartY,
          w: Math.max(16, xStep),
          h: chartH,
          index,
          date: item.date,
          revenue: item.revenue,
          count: item.count,
          primary: curVal,
          previous: prevVal,
          orders: item.orders,
          change,
          changeLabel,
          formatSales,
          formatOrders
        };
      });
    }

    function drawAreaLine(ctx, points, baselineY, color) {
      if (!points.length) return;
      const base = color || "rgba(91, 140, 255, 0.35)";
      // 将 rgba 拆分并生成不透明度梯度
      const make = (a) => base.replace(/rgba?\(([^)]+)\)/, (m, inner) => {
        const parts = inner.split(",").map((s) => s.trim());
        const r = parts[0], g = parts[1], b = parts[2];
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      });
      const grad = ctx.createLinearGradient(0, Math.min(...points.map((point) => point.y)), 0, baselineY);
      grad.addColorStop(0, make(0.35));
      grad.addColorStop(0.55, make(0.12));
      grad.addColorStop(1, make(0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0].x, baselineY);
      points.forEach((point, index) => {
        if (index === 0) ctx.lineTo(point.x, point.y);
        else {
          const prev = points[index - 1];
          const cx = (prev.x + point.x) / 2;
          ctx.bezierCurveTo(cx, prev.y, cx, point.y, point.x, point.y);
        }
      });
      ctx.lineTo(points[points.length - 1].x, baselineY);
      ctx.closePath();
      ctx.fill();
    }

    function drawSmoothLine(ctx, points, color, width, options = {}) {
      if (!points.length) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash(options.dashed ? [7, 7] : []);
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else {
          const prev = points[index - 1];
          const cx = (prev.x + point.x) / 2;
          ctx.bezierCurveTo(cx, prev.y, cx, point.y, point.x, point.y);
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
      if (options.dots === false) return;
      points.forEach((point, index) => {
        if (points.length > 14 && index % 2 !== 0 && index !== points.length - 1) return;
        ctx.fillStyle = "#fdfbf6";
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function normalizeAdHeader(value) {
      return String(value ?? "").replace(/\s+/g, "").replaceAll("\uFF0C", ",").toLowerCase();
    }

    function adNumber(value) {
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      const cleaned = String(value ?? "").replace(/\s/g, "").replace("%", "").replace(",", ".").replace(/[^\d.-]/g, "");
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function parseRuDate(value) {
      const match = String(value ?? "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
      return match ? match[3] + "-" + match[2] + "-" + match[1] : "";
    }

    function parseAdDate(value) {
      const text = String(value ?? "");
      const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
      return parseRuDate(text);
    }

    function parseAdPeriod(rows) {
      const firstCells = rows.slice(0, 3).flat().map((cell) => String(cell ?? ""));
      const periodText = firstCells.find((cell) => /\d{2}\.\d{2}\.\d{4}/.test(cell)) || "";
      const dates = [...periodText.matchAll(/(\d{2}\.\d{2}\.\d{4})/g)].map((match) => parseRuDate(match[1]));
      return { from: dates[0] || todayIso(), to: dates[1] || dates[0] || todayIso() };
    }

    function adCell(row, headerMap, names) {
      for (const name of names) {
        const index = headerMap.get(normalizeAdHeader(name));
        if (index !== undefined) return row[index];
      }
      return "";
    }

    function dateInRange(date, from, to) {
      const value = normalizeAdDate(date);
      if (!value) return false;
      return (!from || value >= from) && (!to || value <= to);
    }

    function normalizeAdDate(value) {
      const text = String(value || "").trim();
      if (!text) return "";
      const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const ru = text.match(/(\d{2})[.\/](\d{2})[.\/](\d{4})/);
      if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
      return "";
    }

    function daysInclusive(from, to) {
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      const diff = Math.round((end - start) / 86400000) + 1;
      return Math.max(1, Number.isFinite(diff) ? diff : 1);
    }

    function adStoreMatchesSelected(storeName) {
      const selected = $("adStoreSelect")?.value || "all";
      if (selected === "all") return true;
      if (String(selected).startsWith("group:")) {
        return storesInGroup(selected.slice("group:".length)).includes(storeName);
      }
      return storeName === selected;
    }

    function baseAdRows() {
      const apiRows = adRowsArray().filter((row) => {
        if (!adStoreMatchesSelected(row.store)) return false;
        if (!adRowVisible(row)) return false;
        if (row.source === "api" && row.hasValidSku === false) return false;
        return true;
      });
      if (apiRows.length) return apiRows.map((row) => ({ ...row, revenue: Number(row.revenue ?? row.adRevenue ?? 0), adRevenue: Number(row.adRevenue ?? row.revenue ?? 0), source: row.source || "api" }));
      const uploaded = importedAds.filter((row) => adStoreMatchesSelected(row.store));
      if (uploaded.length) return uploaded.map((row) => ({ ...row, revenue: Number(row.revenue ?? row.adRevenue ?? 0), adRevenue: Number(row.adRevenue ?? row.revenue ?? 0), source: row.source || "xlsx" }));
      return orders
        .filter((order) => Number(order.adCost || 0) > 0 && adStoreMatchesSelected(order.store))
        .map((order) => {
          const c = calcOrder(order);
          return { date: order.date, dateFrom: order.date, dateTo: order.date, store: order.store, sku: order.sku, name: c.product?.name || "", revenue: c.sale, adRevenue: c.sale, adCost: c.adCost, adOrders: 1, impressions: 0, clicks: 0, ctr: 0, source: "order" };
        });
    }

    function adRowsForRange(from = adDateFrom, to = adDateTo) {
      return baseAdRows().filter((row) => {
        return dateInRange(row.date || row.dateTo, from, to);
      });
    }

    function adSourceRows() {
      return adRowsForRange();
    }

    function adRawObject(row) {
      if (row?.raw && typeof row.raw === "object" && !Array.isArray(row.raw)) return row.raw;
      const raw = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        if (["raw", "rawKeys", "product", "image"].includes(key)) return;
        if (value === undefined || typeof value === "function") return;
        raw[key] = value;
      });
      return raw;
    }

    function adRawColumns(rows) {
      const seen = new Set();
      const columns = [];
      rows.forEach((row) => {
        Object.keys(adRawObject(row)).forEach((key) => {
          if (!seen.has(key)) {
            seen.add(key);
            columns.push(key);
          }
        });
      });
      return columns.slice(0, 14);
    }

    function rawDisplayValue(value) {
      if (value === null || value === undefined) return "";
      if (typeof value === "object") {
        try { return JSON.stringify(value); } catch { return String(value); }
      }
      return String(value);
    }

    function renderAdCalendar() {
      const box = $("adCalendar");
      if (!box) return;
      const base = new Date(adCalendarCursor.getFullYear(), adCalendarCursor.getMonth(), 1);
      const months = [0, 1].map((offset) => new Date(base.getFullYear(), base.getMonth() + offset, 1));
      if ($("adCalendarTitle")) $("adCalendarTitle").textContent = `${monthLabel(months[0])} - ${monthLabel(months[1])}`;
      const weeks = ["一", "二", "三", "四", "五", "六", "日"];
      const rangeFrom = adDateFrom <= adDateTo ? adDateFrom : adDateTo;
      const rangeTo = adDateFrom <= adDateTo ? adDateTo : adDateFrom;
      box.innerHTML = months.map((month) => {
        const first = new Date(month.getFullYear(), month.getMonth(), 1);
        const startOffset = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < startOffset; i += 1) days.push(`<span class="calendar-empty"></span>`);
        for (let date = 1; date <= daysInMonth; date += 1) {
          const day = new Date(month.getFullYear(), month.getMonth(), date);
          const iso = localIso(day);
          const classes = [
            "calendar-day",
            iso === adsTodayIso() ? "today" : "",
            iso === rangeFrom || iso === rangeTo || iso === pendingAdDateAnchor ? "selected" : "",
            iso > rangeFrom && iso < rangeTo ? "in-range" : "",
          ].filter(Boolean).join(" ");
          days.push(`<button type="button" class="${classes}" data-ad-date="${iso}">${day.getDate()}</button>`);
        }
        return `<div class="calendar-month">
          <div class="calendar-title">${monthLabel(month)}</div>
          <div class="calendar-week">${weeks.map((w) => `<span>${w}</span>`).join("")}</div>
          <div class="calendar-days">${days.join("")}</div>
        </div>`;
      }).join("");
    }

    function ensureAdDatePicker() {
      if ($("adDateRangeButton") || !$("adStoreSelect")?.parentElement) return;
      const wrapper = document.createElement("div");
      wrapper.className = "date-range-picker ad-date-picker";
      wrapper.innerHTML = `
        <button class="date-range-button" id="adDateRangeButton" type="button">选择日期范围</button>
        <div class="date-range-panel ad-date-range-panel" id="adDateRangePanel">
          <div class="date-range-main">
            <div class="date-fields">
              <button class="date-display" id="adDateFromDisplay" type="button"></button>
              <button class="date-display" id="adDateToDisplay" type="button"></button>
            </div>
            <div class="calendar-head">
              <button id="adCalendarPrev" type="button">‹</button>
              <strong id="adCalendarTitle"></strong>
              <button id="adCalendarNext" type="button">›</button>
            </div>
            <div class="calendar-months" id="adCalendar"></div>
          </div>
          <div class="quick-ranges">
            <button type="button" data-ad-picker-range="today">今天</button>
            <button type="button" data-ad-picker-range="yesterday">昨天</button>
            <button type="button" data-ad-picker-range="7">最近 7 天</button>
            <button type="button" data-ad-picker-range="28">最近 28 天</button>
            <button type="button" data-ad-picker-range="90">最近 90 天</button>
          </div>
        </div>`;
      const anchor = $("refreshAdsApi") || $("adStoreSelect").parentElement;
      anchor.insertAdjacentElement("afterend", wrapper);
      $("adDateRangeButton").addEventListener("click", () => {
        $("adDateRangePanel")?.classList.toggle("open");
        renderAdCalendar();
      });
      $("adCalendarPrev").addEventListener("click", () => {
        adCalendarCursor = new Date(adCalendarCursor.getFullYear(), adCalendarCursor.getMonth() - 1, 1);
        renderAdCalendar();
      });
      $("adCalendarNext").addEventListener("click", () => {
        adCalendarCursor = new Date(adCalendarCursor.getFullYear(), adCalendarCursor.getMonth() + 1, 1);
        renderAdCalendar();
      });
      $("adCalendar").addEventListener("click", (event) => {
        const button = event.target.closest("[data-ad-date]");
        if (!button) return;
        event.stopPropagation();
        setAdDate(button.dataset.adDate).catch((error) => alert(error.message));
      });
      wrapper.querySelectorAll("[data-ad-picker-range]").forEach((button) => {
        button.addEventListener("click", async () => {
          const value = button.dataset.adPickerRange;
          const today = adsTodayIso();
          const yesterday = addDays(today, -1);
          pendingAdDateAnchor = null;
          if (value === "today") {
            adDateFrom = today;
            adDateTo = today;
          } else if (value === "yesterday") {
            adDateFrom = yesterday;
            adDateTo = yesterday;
          } else {
            adDateTo = today;
            adDateFrom = addDays(adDateTo, -(Number(value || 28) - 1));
          }
          $("adDateRangePanel")?.classList.remove("open");
          updateAdDateInputs();
          renderAds();
          await autoRefreshAds();
        });
      });
    }

    async function setAdDate(value) {
      if (!pendingAdDateAnchor) {
        pendingAdDateAnchor = value;
        adDateFrom = value;
        adDateTo = value;
        updateAdDateInputs();
        renderAds();
        await autoRefreshAds();
        return;
      }
      const sorted = [pendingAdDateAnchor, value].sort();
      pendingAdDateAnchor = null;
      adDateFrom = sorted[0];
      adDateTo = sorted[1];
      updateAdDateInputs();
      renderAds();
      await autoRefreshAds();
    }

    function updateAdDateInputs() {
      if (!$("refreshAdsApi") && $("adStoreSelect")?.parentElement) {
        const button = document.createElement("button");
        button.id = "refreshAdsApi";
        button.type = "button";
        button.className = "secondary";
        button.textContent = "刷新 API 广告数据";
        $("adStoreSelect").parentElement.insertAdjacentElement("afterend", button);
        button.addEventListener("click", refreshAdsApi);
      }
      ensureAdDatePicker();
      if ($("adDateRangeButton")) $("adDateRangeButton").textContent = `${adDateFrom} - ${adDateTo}`;
      if ($("adDateFromDisplay")) $("adDateFromDisplay").textContent = adDateFrom.replaceAll("-", "/");
      if ($("adDateToDisplay")) $("adDateToDisplay").textContent = adDateTo.replaceAll("-", "/");
      if ($("adCompareToggle")) $("adCompareToggle").checked = adCompareEnabled;
      const currentDays = daysInclusive(adDateFrom, adDateTo);
      document.querySelectorAll("[data-ad-range]").forEach((button) => {
        button.classList.toggle("active", currentDays === Number(button.dataset.adRange));
      });
      const adRangePanel = $("adDateRangePanel");
      if (adRangePanel) adRangePanel.classList.toggle("custom-range", ![7, 14, 28].includes(currentDays));
      renderAdCalendar();
    }

    function adImageFor(row) {
      const key = String(row.sku || row.campaignId || "");
      return row.image || row.product?.image || adImageCache[key] || "";
    }

    async function fetchAdImagesForRows(rows) {
      if (!backendEnabled) return;
      const skus = [...new Set(rows.map((row) => String(row.sku || "")).filter(Boolean).filter((sku) => !adImageCache[sku]))].slice(0, 50);
      if (!skus.length) return;
      try {
        const payload = await apiRequest(`/api/product-images?skus=${encodeURIComponent(skus.join(","))}`);
        Object.entries(payload?.images || {}).forEach(([sku, image]) => {
          if (image) adImageCache[String(sku)] = image;
        });
        save();
      } catch {
        // Product images are helpful, but ad numbers must keep rendering without them.
      }
    }

    async function importAdFile() {
      const input = $("adImportFile");
      const store = $("adImportStore")?.value || "\u672A\u6307\u5B9A\u5E97\u94FA";
      const status = $("adImportStatus");
      const file = input?.files?.[0];
      if (!file) { alert("\u8BF7\u5148\u9009\u62E9 Ozon \u63A8\u5E7F\u5206\u6790 Excel \u6587\u4EF6\u3002"); return; }
      if (!window.XLSX) { alert("Excel \u8BFB\u53D6\u7EC4\u4EF6\u6CA1\u6709\u52A0\u8F7D\u6210\u529F\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u518D\u8BD5\u3002"); return; }
      try {
        const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = workbook.Sheets.Statistics || workbook.Sheets[workbook.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        const period = parseAdPeriod(rows);
        const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeAdHeader(cell) === "sku"));
        if (headerIndex < 0) throw new Error("\u6CA1\u6709\u627E\u5230 SKU \u8868\u5934");
        const headerMap = new Map(rows[headerIndex].map((header, index) => [normalizeAdHeader(header), index]));
        const imported = rows.slice(headerIndex + 1).map((row) => {
          const sku = String(adCell(row, headerMap, ["SKU"]) || "").trim();
          if (!sku) return null;
          const rowDate = parseAdDate(adCell(row, headerMap, ["日期", "Date", "День", "Дата"])) || period.to;
          return {
            id: crypto.randomUUID(), fileName: file.name, source: "xlsx", store, date: rowDate, dateFrom: rowDate, dateTo: rowDate, reportFrom: period.from, reportTo: period.to, sku,
            name: String(adCell(row, headerMap, ["\u5546\u54C1\u540D\u79F0"]) || "").trim(),
            tool: String(adCell(row, headerMap, ["\u5DE5\u5177"]) || "").trim(),
            placement: String(adCell(row, headerMap, ["\u6295\u653E\u4F4D\u7F6E"]) || "").trim(),
            campaignId: String(adCell(row, headerMap, ["\u5E7F\u544A\u6D3B\u52A8 ID"]) || "").trim(),
            adCost: adNumber(adCell(row, headerMap, ["\u8D39\u7528\uFF0C\u20BD", "\u8D39\u7528,\u20BD", "\u8D39\u7528"])),
            adRevenue: adNumber(adCell(row, headerMap, ["\u4FC3\u9500\u9500\u552E\uFF0C{\u8D27\u5E01}", "\u4FC3\u9500\u9500\u552E,{\u8D27\u5E01}", "\u63A8\u5E7F\u5E26\u6765\u7684\u9500\u552E\u989D\uFF0C\u20BD", "\u63A8\u5E7F\u5E26\u6765\u7684\u9500\u552E\u989D"])),
            adOrders: adNumber(adCell(row, headerMap, ["\u5DF2\u552E\u5546\u54C1\u6570\u91CF\uFF0C\u4EF6", "\u5DF2\u552E\u5546\u54C1\u6570\u91CF,\u4EF6"])),
            ctr: adNumber(adCell(row, headerMap, ["CTR, %", "CTR,%"])),
            impressions: adNumber(adCell(row, headerMap, ["\u5C55\u73B0\u91CF", "\u5C55\u793A\u91CF"])),
            clicks: adNumber(adCell(row, headerMap, ["\u70B9\u51FB\u6B21\u6570", "\u70B9\u51FB\u91CF"])),
            cartAdds: adNumber(adCell(row, headerMap, ["\u6DFB\u52A0\u5230\u8D2D\u7269\u8F66\u6B21\u6570"])),
            cartRate: adNumber(adCell(row, headerMap, ["\u6DFB\u52A0\u5230\u8D2D\u7269\u8F66\u7684\u8F6C\u5316\u7387\uFF0C %", "\u6DFB\u52A0\u5230\u8D2D\u7269\u8F66\u7684\u8F6C\u5316\u7387,%"])),
            importedAt: new Date().toISOString(),
          };
        }).filter(Boolean);
        if (!imported.length) throw new Error("\u8868\u683C\u91CC\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u5E7F\u544A\u884C");
        importedAds = importedAds.filter((row) => !(row.store === store && (row.fileName || row.source) === file.name)).concat(imported);
        adDateFrom = period.from;
        adDateTo = period.to;
        updateAdDateInputs();
        save();
        fetchAdImagesForRows(imported).then(renderAds);
        input.value = "";
        if (status) status.textContent = "\u5DF2\u5BFC\u5165 " + imported.length + " \u6761\u5E7F\u544A\u6570\u636E\uFF0C\u5468\u671F " + period.from + " - " + period.to + "\uFF0C\u6765\u6E90\uFF1A" + file.name;
        renderAds();
      } catch (error) {
        if (status) status.textContent = "\u5BFC\u5165\u5931\u8D25\uFF1A" + (error.message || error);
        alert("\u5BFC\u5165\u5931\u8D25\uFF1A" + (error.message || error));
      }
    }

    function formatAdPeriod(from, to) {
      if (!from || !to) return from || to || "-";
      if (from === to) return from;
      const today = adsTodayIso();
      const days = daysInclusive(from, to);
      const isEndToday = to === today;
      const isStartContinuous = from === addDays(today, -(days - 1));
      if (isEndToday && isStartContinuous && [7, 14, 28].includes(days)) {
        return `近 ${days} 天（${from} - ${to}）`;
      }
      return `${from} - ${to}`;
    }

    function renderAds() {
      if (!$("adStoreSelect")) return;
      updateAdDateInputs();
      const currentStore = $("adStoreSelect").value || "all";
      const allStores = [...new Set([...orders.map((order) => order.store), ...importedAds.map((row) => row.store), ...adRowsArray().map((row) => row.store)].filter(Boolean))];
      const validValues = new Set(["all", ...allStores, ...storeGroups.map((group) => `group:${group.id}`)]);
      const groupOptions = storeGroups.length
        ? `<optgroup label="店铺分组">${storeGroups.map((group) => `<option value="group:${escapeHtml(group.id)}">${escapeHtml(group.name)}${group.owner ? `（${escapeHtml(group.owner)}）` : ""}</option>`).join("")}</optgroup>`
        : "";
      const storeOptions = '<option value="all">全部店铺</option>' + groupOptions + (allStores.length ? `<optgroup label="单店">${allStores.map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`).join("")}</optgroup>` : "");
      $("adStoreSelect").innerHTML = storeOptions;
      $("adStoreSelect").value = validValues.has(currentStore) ? currentStore : "all";
      if ($("adImportStore")) {
        const importCurrent = $("adImportStore").value;
        $("adImportStore").innerHTML = allStores.map((store) => '<option value="' + escapeHtml(store) + '">' + escapeHtml(store) + '</option>').join("") || '<option value="\u672A\u6307\u5B9A\u5E97\u94FA">\u672A\u6307\u5B9A\u5E97\u94FA</option>';
        if (allStores.includes(importCurrent)) $("adImportStore").value = importCurrent;
      }
      if ($("adImportStatus")) {
        const apiCount = adMetricRows().length;
        const xlsxCount = importedAds.length;
        const stateInfo = adsStatusRows.map((row) => `${row.store}: ${row.state}`).filter(Boolean).join("；");
        $("adImportStatus").textContent = apiCount
          ? `已读取 API 广告数据 ${apiCount} 条`
          : xlsxCount
            ? `显示已上传 Excel 数据 ${xlsxCount} 条`
            : stateInfo
              ? `暂无数据（${stateInfo}），正在后台获取中…`
              : "暂无广告数据，点击刷新按钮获取";
      }

      const summaryMap = new Map();
      adSourceRows().forEach((row) => {
        const product = productBySku(row.sku);
        const isApiRow = row.source === "api";
        const periodFrom = isApiRow ? adDateFrom : (row.dateFrom || row.date);
        const periodTo = isApiRow ? adDateTo : (row.dateTo || row.date);
        const key = periodFrom + "|" + periodTo + "|" + row.store + "|" + row.sku;
        const existing = summaryMap.get(key) || { date: row.date, dateFrom: periodFrom, dateTo: periodTo, store: row.store, sku: row.sku, name: row.name || product?.name || "", image: adImageFor({ ...row, product }), product, revenue: 0, adCost: 0, adOrders: 0, impressions: 0, clicks: 0, ctrWeightedClicks: 0 };
        existing.revenue += Number(row.revenue || 0);
        existing.adCost += Number(row.adCost || 0);
        existing.adOrders += Number(row.adOrders || 0);
        existing.impressions += Number(row.impressions || 0);
        existing.clicks += Number(row.clicks || 0);
        existing.ctrWeightedClicks += Number(row.ctr || 0) * Number(row.clicks || 0);
        summaryMap.set(key, existing);
      });
      const summaryRows = [...summaryMap.values()].map((row) => ({ ...row, ctr: row.clicks ? row.ctrWeightedClicks / row.clicks : (row.impressions ? row.clicks / row.impressions * 100 : 0) })).sort((a, b) => (b.dateTo || b.date).localeCompare(a.dateTo || a.date) || b.adCost - a.adCost);
      const adTotal = summaryRows.reduce((sum, row) => sum + row.adCost, 0);
      const revenue = summaryRows.reduce((sum, row) => sum + row.revenue, 0);
      const productCount = new Set(summaryRows.map((row) => row.sku)).size;
      $("adTotal").textContent = rub(adTotal);
      $("adRevenue").textContent = rub(revenue);
      $("adRatio").textContent = (revenue ? adTotal / revenue * 100 : 0).toFixed(2) + "%";
      $("adProductCount").textContent = productCount;
      $("adRows").innerHTML = summaryRows.map((row) => {
        const period = formatAdPeriod(row.dateFrom, row.dateTo);
        const label = row.product?.code || row.sku;
        const image = row.image ? '<img src="' + escapeHtml(row.image) + '" alt="' + escapeHtml(label) + '" />' : '<span class="ad-product-placeholder">' + escapeHtml(String(label || "?").slice(0, 3)) + '</span>';
        const productCell = '<div class="ad-product">' + image + '<div><strong>' + escapeHtml(label) + '</strong><div class="sku">' + escapeHtml(row.sku) + '</div></div></div>';
        return '<tr><td>' + escapeHtml(period) + '</td><td>' + escapeHtml(row.store) + '</td><td>' + productCell + '</td><td class="money">' + rub(row.revenue) + '</td><td>' + Number(row.adOrders || 0).toFixed(0) + '</td><td class="money">' + rub(row.adCost) + '</td><td>' + Number(row.impressions || 0).toLocaleString("zh-CN") + '</td><td>' + Number(row.clicks || 0).toLocaleString("zh-CN") + '</td><td>' + Number(row.ctr || 0).toFixed(2) + '%</td><td>' + (row.revenue ? row.adCost / row.revenue * 100 : 0).toFixed(2) + '%</td></tr>';
      }).join("");
      drawAdChart();
    }

    function drawAdChart() {
      const canvas = $("adChart");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const width = canvas.width;
      const height = canvas.height;
      const padLeft = 78, padRight = 34, padTop = 28, padBottom = 62;
      const chartX = padLeft, chartY = padTop, chartW = width - padLeft - padRight, chartH = height - padTop - padBottom;
      const period = daysInclusive(adDateFrom, adDateTo);
      const previousTo = addDays(adDateFrom, -1);
      const previousFrom = addDays(previousTo, -(period - 1));
      const makeSeries = (from, to) => {
        const totalDays = daysInclusive(from, to);
        const map = new Map();
        for (let i = 0; i < totalDays; i += 1) map.set(addDays(from, i), 0);
        adRowsForRange(from, to).forEach((row) => {
          const date = row.date || row.dateTo || to;
          if (map.has(date)) map.set(date, map.get(date) + Number(row.adCost || 0));
        });
        const days = [];
        for (let i = 0; i < totalDays; i += 1) {
          const date = addDays(from, i);
          days.push({ date, value: map.get(date) || 0 });
        }
        return days;
      };
      const current = makeSeries(adDateFrom, adDateTo);
      const previous = adCompareEnabled ? makeSeries(previousFrom, previousTo) : [];
      const max = Math.max(...current.map((item) => item.value), ...previous.map((item) => item.value), 1);
      const axisMax = Math.ceil(max / 500) * 500 || 500;
      const toY = (value) => chartY + chartH - (Number(value || 0) / axisMax) * chartH;
      const step = chartW / Math.max(current.length - 1, 1);
      const toX = (index) => chartX + index * step;
      ctx.clearRect(0, 0, width, height);
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#fdfbf6");
      bgGrad.addColorStop(1, "#faf8f3");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
      // 柔和发光
      const glow = ctx.createRadialGradient(Math.min(width * 0.3, 240), 40, 20, Math.min(width * 0.3, 240), 40, Math.min(width * 0.6, 480));
      glow.addColorStop(0, "rgba(107, 142, 175, 0.07)");
      glow.addColorStop(1, "rgba(107, 142, 175, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(120, 110, 90, 0.10)";
      ctx.fillStyle = "#948e84";
      ctx.font = "12px SF Pro Display, PingFang SC, Microsoft YaHei, Arial";
      for (let i = 0; i <= 4; i++) {
        const value = axisMax / 4 * i;
        const y = toY(value);
        ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.moveTo(chartX, y); ctx.lineTo(chartX + chartW, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.textAlign = "right"; ctx.fillText((value / 1000).toFixed(value >= 1000 ? 1 : 0) + "k", chartX - 12, y + 4);
      }
      const previousPoints = previous.map((item, index) => ({ x: toX(index), y: toY(item.value) }));
      const points = current.map((item, index) => ({ x: toX(index), y: toY(item.value) }));
      // 上期线（鼠尾草绿虚线）
      if (previousPoints.length) drawSmoothLine(ctx, previousPoints, "rgba(123, 160, 135, 0.6)", 3, { dashed: true, dots: false });
      // 本期线（雾蓝渐变填充 + 主色描边）
      if (points.length) drawAreaLine(ctx, points, chartY + chartH, "rgba(107, 142, 175, 0.25)");
      drawSmoothLine(ctx, points, "#6b8eaf", 3.5);
      if (activeAdChartIndex !== null && current[activeAdChartIndex]) {
        const x = toX(activeAdChartIndex);
        ctx.strokeStyle = "rgba(196, 163, 90, 0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, chartY);
        ctx.lineTo(x, chartY + chartH);
        ctx.stroke();
        [points[activeAdChartIndex], previousPoints[activeAdChartIndex]].filter(Boolean).forEach((point, index) => {
          ctx.fillStyle = "#fdfbf6";
          ctx.strokeStyle = index ? "rgba(123, 160, 135, 0.85)" : "#7ba087";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.fillStyle = "#948e84"; ctx.font = "12px SF Pro Display, PingFang SC, Microsoft YaHei, Arial";
      const interval = current.length <= 7 ? 1 : current.length <= 14 ? 2 : 4;
      current.forEach((item, index) => { if (index % interval !== 0 && index !== current.length - 1) return; ctx.textAlign = "center"; ctx.fillText(item.date.slice(5), toX(index), height - 26); });
      ctx.strokeStyle = "#6b8eaf"; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(chartX + chartW - 150, height - 18); ctx.lineTo(chartX + chartW - 122, height - 18); ctx.stroke();
      ctx.fillStyle = "#6b665e"; ctx.textAlign = "left"; ctx.fillText("本期", chartX + chartW - 114, height - 14);
      if (previousPoints.length) {
        ctx.strokeStyle = "rgba(123, 160, 135, 0.65)"; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(chartX + chartW - 68, height - 18); ctx.lineTo(chartX + chartW - 40, height - 18); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillText("上期", chartX + chartW - 32, height - 14);
      }
      adChartHitboxes = current.map((item, index) => ({
        x: toX(index) - Math.max(8, step / 2),
        y: chartY,
        w: Math.max(16, step),
        h: chartH,
        index,
        date: item.date,
        current: item.value,
        previous: previous[index]?.value || 0,
        previousDate: previous[index]?.date || "",
      }));
      ctx.textAlign = "left";
    }

    function roundRect(ctx, x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }

    function seedDemoOrders() {
      const stores = ["Ozon 一号店", "Ozon 二号店", "WB 一号店"];
      const newOrders = [];
      for (let day = 59; day >= 0; day--) {
        const date = addDays(todayIso(), -day);
        const count = 4 + Math.floor(Math.random() * 5);
        for (let i = 0; i < count; i++) {
          const p = products[Math.floor(Math.random() * products.length)];
          const feeModel = skuFeeModels[String(p.sku)] || {};
          const cost = totalRub(p);
          const sale = Math.round((feeModel.defaultPrice || cost * (1.45 + Math.random() * .65)) * 100) / 100;
          newOrders.push({
            date,
            store: stores[Math.floor(Math.random() * stores.length)],
            orderNo: `${date.replaceAll("-","")}-${i + 1}-${Math.floor(Math.random() * 900 + 100)}`,
            sku: p.sku,
            sale,
            backendPrice: sale,
            commission: sale * Number(feeModel.commissionRate || 0.12),
            logisticsFee: Number(feeModel.logisticsFee || sale * 0.025),
            handlingFee: Number(feeModel.handlingFee || 25),
            acquiringFee: Number(feeModel.acquiringFee || sale * 0.01),
            otherFixedFee: Number(feeModel.otherFixedFee || 12),
            refundFee: Math.random() > .88 ? sale * 0.08 : 0,
            adCost: Math.random() > .35 ? sale * (0.03 + Math.random() * .07) : 0
          });
        }
      }
      orders = newOrders;
      mergeIntoTrendOrders(newOrders);
      renderAll();
    }

    function updateChartMenuText() {
      const useCount = chartConfig.unit === "count";
      $("chartTitle").textContent = useCount ? "每日订购商品数量走势" : "每日销量与销售额走势";
      document.querySelectorAll("[data-chart-unit]").forEach((button) => {
        button.classList.toggle("active", button.dataset.chartUnit === chartConfig.unit);
      });
      if ($("chartDateRangeButton")) $("chartDateRangeButton").textContent = `${chartDateFrom} - ${chartDateTo}`;
      if ($("chartDateFromDisplay")) $("chartDateFromDisplay").textContent = chartDateFrom.replaceAll("-", "/");
      if ($("chartDateToDisplay")) $("chartDateToDisplay").textContent = chartDateTo.replaceAll("-", "/");
      if ($("chartDateFrom")) $("chartDateFrom").value = chartDateFrom;
      if ($("chartDateTo")) $("chartDateTo").value = chartDateTo;
      renderChartCalendar();
    }
    async function reloadOrdersForRange(from, to) {
      if (from > to) [from, to] = [to, from];
      orderDateFrom = from;
      orderDateTo = to;
      chartDateFrom = from;
      chartDateTo = to;
      if ($("orderDateFrom")) $("orderDateFrom").value = orderDateFrom;
      if ($("orderDateTo")) $("orderDateTo").value = orderDateTo;
      // 显示加载动画(转圈圈)
      showGlobalLoader(`正在加载 ${from} 至 ${to} 的数据…`);
      if ($("orderRangeStatus")) $("orderRangeStatus").textContent = `正在加载 ${from} 至 ${to} 的数据,请稍候…`;
      try {
        // 先拉数据,再统一渲染,避免「旧数据先闪现一次再变正确」的观感问题
        await loadBackendOrders();
        // loadStoreAnalytics 内部会优先本地命中(缓存/按天累积覆盖),秒出;
        // 没命中才抓"本月"按天数据并累积。这样曝光/点击/转化率也跟随时间区间。
        await loadStoreAnalytics();
        updateOrderDateButton();
        renderCalendar();
        renderAll();
      } finally {
        hideGlobalLoader();
      }
    }

    // 全局加载动画控制(智能延迟:数据快时不弹,慢了才弹)
    let _loaderShowTimer = null;
    let _loaderHideTimer = null;
    let _loaderMinVisible = false;
    // 延迟显示动画:超过 delay(默认 350ms)还没 hideGlobalLoader 才显示
    function showGlobalLoader(text, delay = 350) {
      const loader = $("globalLoader");
      if (!loader) return;
      if ($("globalLoaderText")) $("globalLoaderText").textContent = text || "正在加载…";
      clearTimeout(_loaderShowTimer);
      // 快路径:先不显示,等 delay 过后再显示
      _loaderShowTimer = setTimeout(() => {
        loader.hidden = false;
        _loaderMinVisible = true;
        // 显示后至少保持 300ms,避免一闪而过
        clearTimeout(_loaderHideTimer);
        _loaderHideTimer = setTimeout(() => { _loaderMinVisible = false; }, 300);
        // 超过 30 秒还没完成,自动隐藏(防止卡死)
        clearTimeout(_loaderShowTimer);
        _loaderShowTimer = setTimeout(() => hideGlobalLoader(), 30000);
      }, delay);
    }
    function hideGlobalLoader() {
      const loader = $("globalLoader");
      clearTimeout(_loaderShowTimer);
      // 如果已经显示了,至少保持 300ms 再隐藏(避免闪烁)
      const doHide = () => { if (loader) loader.hidden = true; _loaderMinVisible = false; };
      if (_loaderMinVisible) {
        setTimeout(doHide, 300);
      } else {
        doHide();
      }
    }
    function summaryRangeFromDates(from, to) {
      const today = todayIso();
      const yesterday = addDays(today, -1);
      if (from === today && to === today) return "today";
      if (from === addDays(today, -7) && to === yesterday) return "7";
      if (from === addDays(today, -28) && to === yesterday) return "28";
      const d = new Date(`${today}T00:00:00`);
      const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
      if (from === localIso(new Date(d.getFullYear(), quarterStartMonth, 1)) && to === yesterday) return "quarter";
      if (from === `${d.getFullYear()}-01-01` && to === yesterday) return "year";
      return "";
    }
    // 经营汇总范围与趋势图共用同一时间段；lastRangeSource 决定哪一侧高亮，另一侧变暗
    function syncSummaryRangePills() {
      const active = lastRangeSource === "summary";
      const value = active ? summaryRangeFromDates(orderDateFrom, orderDateTo) : "";
      document.querySelectorAll("[data-summary-range]").forEach((item) => {
        item.classList.toggle("active", active && item.dataset.summaryRange === value);
        item.classList.toggle("dim", !active);
      });
    }
    function syncChartRangePills() {
      const active = lastRangeSource === "chart";
      const value = active ? summaryRangeFromDates(chartDateFrom, chartDateTo) : "";
      document.querySelectorAll("[data-chart-picker-range]").forEach((item) => {
        item.classList.toggle("active", active && item.dataset.chartPickerRange === value);
        item.classList.toggle("dim", !active);
      });
    }

    function renderChartCalendar() {
      const box = $("chartCalendar");
      if (!box) return;
      const base = new Date(chartCalendarCursor.getFullYear(), chartCalendarCursor.getMonth(), 1);
      const months = [0, 1].map((offset) => new Date(base.getFullYear(), base.getMonth() + offset, 1));
      if ($("chartCalendarTitle")) $("chartCalendarTitle").textContent = `${monthLabel(months[0])} - ${monthLabel(months[1])}`;
      const weeks = ["一", "二", "三", "四", "五", "六", "日"];
      const rangeFrom = chartDateFrom <= chartDateTo ? chartDateFrom : chartDateTo;
      const rangeTo = chartDateFrom <= chartDateTo ? chartDateTo : chartDateFrom;
      box.innerHTML = months.map((month) => {
        const first = new Date(month.getFullYear(), month.getMonth(), 1);
        const startOffset = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < startOffset; i += 1) days.push(`<span class="calendar-empty"></span>`);
        for (let date = 1; date <= daysInMonth; date += 1) {
          const day = new Date(month.getFullYear(), month.getMonth(), date);
          const iso = localIso(day);
          const classes = [
            "calendar-day",
            iso === todayIso() ? "today" : "",
            iso === rangeFrom || iso === rangeTo || iso === pendingChartDateAnchor ? "selected" : "",
            iso > rangeFrom && iso < rangeTo ? "in-range" : "",
          ].filter(Boolean).join(" ");
          days.push(`<button type="button" class="${classes}" data-chart-date="${iso}">${day.getDate()}</button>`);
        }
        return `<div class="calendar-month">
          <div class="calendar-title">${monthLabel(month)}</div>
          <div class="calendar-week">${weeks.map((w) => `<span>${w}</span>`).join("")}</div>
          <div class="calendar-days">${days.join("")}</div>
        </div>`;
      }).join("");
    }
    async function setChartDate(value) {
      if (!pendingChartDateAnchor) {
        pendingChartDateAnchor = value;
        chartDateFrom = value;
        chartDateTo = value;
        lastRangeSource = "chart";
        updateChartMenuText();
        syncChartRangePills();
        syncSummaryRangePills();
        drawRevenueChart();
        return;
      }
      const sorted = [pendingChartDateAnchor, value].sort();
      pendingChartDateAnchor = null;
      $("chartDateRangePanel")?.classList.remove("open");
      lastRangeSource = "chart";
      await reloadOrdersForRange(sorted[0], sorted[1]);
    }
    async function applyChartQuickRange(value) {
      const today = todayIso();
      const yesterday = addDays(today, -1);
      pendingChartDateAnchor = null;
      if (value === "today") {
        chartDateFrom = today;
        chartDateTo = today;
      } else if (value === "yesterday") {
        chartDateFrom = yesterday;
        chartDateTo = yesterday;
      } else if (value === "quarter") {
        const d = new Date(`${today}T00:00:00`);
        const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
        chartDateFrom = localIso(new Date(d.getFullYear(), quarterStartMonth, 1));
        chartDateTo = yesterday;
      } else if (value === "year") {
        chartDateFrom = `${new Date(`${today}T00:00:00`).getFullYear()}-01-01`;
        chartDateTo = yesterday;
      } else {
        chartDateFrom = addDays(today, -Number(value));
        chartDateTo = yesterday;
      }
      $("chartDateRangePanel")?.classList.remove("open");
      lastRangeSource = "chart";
      await reloadOrdersForRange(chartDateFrom, chartDateTo);
    }

    async function applySummaryRange(value) {
      const today = todayIso();
      const yesterday = addDays(today, -1);
      let from = today;
      let to = today;
      if (value === "7") {
        from = addDays(today, -7);
        to = yesterday;
      } else if (value === "28") {
        from = addDays(today, -28);
        to = yesterday;
      } else if (value === "quarter") {
        const d = new Date(`${today}T00:00:00`);
        const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
        from = localIso(new Date(d.getFullYear(), quarterStartMonth, 1));
        to = yesterday;
      } else if (value === "year") {
        from = `${new Date(`${today}T00:00:00`).getFullYear()}-01-01`;
        to = yesterday;
      }
      lastRangeSource = "summary";
      await reloadOrdersForRange(from, to);
    }

    document.addEventListener("click", (event) => {
      const chartPicker = event.target.closest("#chartDateRangeButton, #chartDateRangePanel");
      if (!chartPicker && $("chartDateRangePanel")?.classList.contains("open")) {
        $("chartDateRangePanel").classList.remove("open");
        pendingChartDateAnchor = null;
        renderChartCalendar();
      }
      const orderPicker = event.target.closest("#orderDateRangeButton, #orderDateRangePanel");
      if (!orderPicker && $("orderDateRangePanel")?.classList.contains("open")) {
        $("orderDateRangePanel").classList.remove("open");
        pendingOrderDateAnchor = null;
        renderCalendar();
      }
      const adPicker = event.target.closest("#adDateRangeButton, #adDateRangePanel");
      if (!adPicker && $("adDateRangePanel")?.classList.contains("open")) {
        $("adDateRangePanel").classList.remove("open");
        pendingAdDateAnchor = null;
        renderAdCalendar();
      }
    });

    document.querySelectorAll("[data-chart-unit]").forEach((button) => {
      button.addEventListener("click", () => {
        chartConfig.unit = button.dataset.chartUnit;
        activeChartIndex = null;
        updateChartMenuText();
        drawRevenueChart();
      });
    });
    document.querySelectorAll("[data-chart-picker-range]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.textContent = "抓取中...";
        button.disabled = true;
        try {
          await applyChartQuickRange(button.dataset.chartPickerRange);
        } catch (error) {
          alert(error.message);
        } finally {
          const labels = { today: "今天", yesterday: "昨天", "7": "最近 7 天", "28": "最近 28 天", quarter: "本季度", year: "本年" };
          button.textContent = labels[button.dataset.chartPickerRange] || "范围";
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-summary-range]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.textContent = "抓取中...";
        button.disabled = true;
        try {
          await applySummaryRange(button.dataset.summaryRange);
        } catch (error) {
          alert(error.message);
        } finally {
          const labels = { today: "今天", "7": "7天", "28": "28天", quarter: "季度", year: "年" };
          button.textContent = labels[button.dataset.summaryRange] || "范围";
          button.disabled = false;
        }
      });
    });

    $("revenueChart").addEventListener("mousemove", (event) => {
      const canvas = $("revenueChart");
      const tooltip = $("chartTooltip");
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      const hit = revenueChartHitboxes.find((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
      if (!hit) {
        tooltip.style.display = "none";
        if (activeChartIndex !== null) {
          activeChartIndex = null;
          drawRevenueChart();
        }
        return;
      }
      if (activeChartIndex !== hit.index) {
        activeChartIndex = hit.index;
        drawRevenueChart();
      }
      tooltip.innerHTML = `
        <strong>${hit.date}</strong><br>
        本期：${hit.formatSales(hit.primary)}<br>
        上个周期：${hit.formatSales(hit.previous)}<br>
        订单数：${hit.formatOrders(hit.orders)}<br>
        涨跌：<span style="color:${hit.change === null ? "#fde68a" : hit.change >= 0 ? "#ffd6d2" : "#d6f7df"}">${hit.changeLabel}</span>
      `;
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.min(event.clientX - rect.left + 14, rect.width - 170)}px`;
      tooltip.style.top = `${Math.max(event.clientY - rect.top - 10, 8)}px`;
    });

    $("revenueChart").addEventListener("mouseleave", () => {
      $("chartTooltip").style.display = "none";
      activeChartIndex = null;
      drawRevenueChart();
    });

    function renderCosts() {
      $("sideCount").textContent = products.length;
      const keyword = $("costSearch").value.trim().toLowerCase();
      const scopePlatform = normalizePlatform($("costScopePlatform")?.value);
      const scopeMode = normalizeMode($("costScopeMode")?.value);
      const scopeFulfillment = normalizeFulfillment($("costScopeFulfillment")?.value, scopePlatform, scopeMode);
      const rows = products
        .map((p) => ensureProductScope(p))
        .filter((p) => p.platform === scopePlatform && p.mode === scopeMode && p.fulfillment === scopeFulfillment)
        .filter((p) => [p.code, p.sku, p.name].join(" ").toLowerCase().includes(keyword));
      $("costRows").innerHTML = rows.length ? rows.map((p) => `
        <tr>
          <td><strong>${escapeHtml(p.code)}</strong><div>${escapeHtml(p.name)}</div><div class="sku">${escapeHtml(p.sku)}</div></td>
          <td><span class="scope-chip">${PLATFORM_LABELS[p.platform] || p.platform} · ${MODE_LABELS[p.mode] || p.mode} · ${escapeHtml(p.fulfillment)}</span></td>
          <td class="money">${rmb(p.purchase)}</td>
          <td class="money">${rmb(p.firstFreight)}</td>
          <td class="money">${rmb(p.lastMile)}</td>
          <td>${Number(p.rate).toFixed(2)}</td>
          <td class="money"><strong>${rmb(totalRmb(p))}</strong></td>
          <td class="money"><strong>${rub(totalRub(p))}</strong></td>
          <td class="actions"><button class="secondary" onclick="editProduct('${p.id}')">编辑</button><button class="danger" onclick="deleteProduct('${p.id}')">删除</button></td>
        </tr>
      `).join("") : `<tr><td colspan="9" class="muted-cell">当前范围暂无产品成本，可在左侧表单添加或导入表格。</td></tr>`;
      renderFeeRows();
    }

    function renderProductSelects() {
      return;
    }

    function renderApiConfigs() {
      const rows = apiConfigs.map((item) => `
        <tr>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td>${escapeHtml(item.platform)}</td>
          <td>${escapeHtml(item.clientId || "—")}</td>
          <td>${escapeHtml(formatCreatedAt(item.createdAt))}</td>
          <td class="actions">
            <button class="secondary" type="button" onclick="editApiConfig('${item.id}')">编辑</button>
            <button class="danger" type="button" onclick="deleteApiConfig('${item.id}')">删除</button>
          </td>
        </tr>
      `).join("");
      $("apiRows").innerHTML = rows || `<tr><td colspan="5" class="status">还没有添加店铺，请在左侧新增。</td></tr>`;
    }

    window.editApiConfig = (id) => {
      const item = apiConfigs.find((entry) => entry.id === id);
      if (!item) return;
      $("editApiId").value = item.id;
      $("apiName").value = item.name || "";
      $("apiPlatform").value = item.platform || "Ozon";
      $("apiClientId").value = item.clientId || "";
      $("apiSecret").value = item.secret || "";
      $("apiVerifyStatus").hidden = true;
      $("apiForm").scrollIntoView({ behavior: "smooth", block: "center" });
    };

    window.deleteApiConfig = async (id) => {
      const item = apiConfigs.find((entry) => entry.id === id);
      const storeName = item?.name || "";
      const hint = storeName
        ? `确认删除店铺「${storeName}」？\n\n这会一并清除该店铺的：\n· 订单与趋势数据\n· 广告数据与缓存\n· 店铺分析数据\n· 所属分组的成员引用\n删除后其他功能不会再显示该店铺的残留数据。`
        : "确认删除这个店铺？这会清除其所有相关数据。";
      if (!confirm(hint)) return;
      if (backendEnabled) {
        try {
          await apiRequest(`/api/integrations/${id}`, { method: "DELETE" });
        } catch (error) {
          alert(error.message);
          return;
        }
      }
      if (storeName) purgeStoreData(storeName);
      apiConfigs = apiConfigs.filter((entry) => entry.id !== id);
      if (String(selectedStore) === storeName) selectedStore = "all";
      renderAll();
    };

    function renderStoreGroups() {
      const body = $("storeGroupRows");
      const select = $("groupStores");
      if (select) {
        const stores = allStoreNames();
        const options = stores.map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`).join("");
        if (select.innerHTML !== options) select.innerHTML = options;
      }
      if (!body) return;
      if (!storeGroups.length) {
        body.innerHTML = `<tr><td colspan="5" class="status">还没有创建分组，可在上方表单新增。</td></tr>`;
        return;
      }
      body.innerHTML = storeGroups.map((group) => {
        const members = (group.stores || []).map((store) => escapeHtml(store)).join("、") || "<span class='muted'>未分配</span>";
        return `<tr>
          <td><strong>${escapeHtml(group.name)}</strong></td>
          <td>${escapeHtml(group.owner || "—")}</td>
          <td>${members}</td>
          <td>${escapeHtml(group.note || "—")}</td>
          <td class="actions">
            <button class="secondary" type="button" onclick="editStoreGroup('${group.id}')">编辑</button>
            <button class="danger" type="button" onclick="deleteStoreGroup('${group.id}')">删除</button>
          </td>
        </tr>`;
      }).join("");
    }

    function readGroupForm() {
      return {
        id: $("editGroupId").value || crypto.randomUUID(),
        name: $("groupName").value.trim(),
        owner: $("groupOwner").value.trim(),
        note: $("groupNote").value.trim(),
        stores: [...(($("groupStores")?.selectedOptions || []))].map((option) => option.value),
      };
    }

    function resetGroupForm() {
      $("storeGroupForm").reset();
      $("editGroupId").value = "";
      $("groupSubmitBtn").textContent = "新增分组";
    }

    window.editStoreGroup = (id) => {
      const group = storeGroups.find((entry) => entry.id === id);
      if (!group) return;
      $("editGroupId").value = group.id;
      $("groupName").value = group.name || "";
      $("groupOwner").value = group.owner || "";
      $("groupNote").value = group.note || "";
      const select = $("groupStores");
      if (select) {
        const members = new Set(group.stores || []);
        [...select.options].forEach((option) => { option.selected = members.has(option.value); });
      }
      $("groupSubmitBtn").textContent = "保存分组";
      $("storeGroupForm").scrollIntoView({ behavior: "smooth", block: "center" });
    };

    window.deleteStoreGroup = (id) => {
      const group = storeGroups.find((entry) => entry.id === id);
      if (!group) return;
      if (!confirm(`确认删除分组「${group.name}」？\n（仅删除分组，店铺本身不受影响；已联动使用该分组的筛选会自动回到「全部店铺」。）`)) return;
      storeGroups = storeGroups.filter((entry) => entry.id !== id);
      if (String(selectedStore) === `group:${id}`) selectedStore = "all";
      if (storeOverviewGroup === id) storeOverviewGroup = "all";
      renderAll();
    };

    function dynamicFieldDefs(mode) {
      if (mode === "cross") {
        return [
          { id: "firstFreight", label: "头程运费 RMB", step: "0.001" },
          { id: "lastMile", label: "国际物流 RMB", step: "0.01" },
        ];
      }
      return [
        { id: "firstFreight", label: "头程运费 RMB", step: "0.001" },
        { id: "lastMile", label: "尾程操作费 RMB", step: "0.01" },
      ];
    }

    function renderDynamicCostFields(mode, values) {
      const box = $("costDynamicFields");
      if (!box) return;
      box.innerHTML = "";
      for (const def of dynamicFieldDefs(mode)) {
        const wrap = document.createElement("label");
        wrap.textContent = def.label;
        const input = document.createElement("input");
        input.type = "number";
        input.step = def.step;
        input.min = "0";
        input.value = values?.[def.id] ?? 0;
        input.dataset.costField = def.id;
        wrap.appendChild(input);
        box.appendChild(wrap);
      }
    }

    function refreshFulfillmentOptions(selectEl, platform, mode, currentValue) {
      if (!selectEl) return;
      const options = FULFILLMENT_OPTIONS(platform, mode);
      const allowed = options.includes(currentValue) ? currentValue : options[0];
      selectEl.innerHTML = options.map((opt) => `<option value="${opt}">${opt}</option>`).join("");
      selectEl.value = allowed;
    }

    function readCostForm() {
      const platform = normalizePlatform($("platform").value);
      const mode = normalizeMode($("mode").value);
      const fulfillment = normalizeFulfillment($("fulfillment").value, platform, mode);
      const picked = {};
      document.querySelectorAll("[data-cost-field]").forEach((input) => {
        picked[input.dataset.costField] = Number(input.value || 0);
      });
      return ensureProductScope({
        id: $("editId").value || crypto.randomUUID(),
        code: $("code").value.trim(),
        sku: $("sku").value.trim(),
        name: $("name").value.trim(),
        purchase: Number($("purchase").value || 0),
        domestic: Number($("domestic").value || 0),
        firstFreight: picked.firstFreight ?? Number($("firstFreight")?.value || 0),
        lastMile: picked.lastMile ?? Number($("lastMile")?.value || 0),
        rate: Number($("rate").value || 0),
        platform,
        mode,
        fulfillment,
      });
    }

    function updateCostTotal() {
      const p = readCostForm();
      $("costTotal").textContent = `${rmb(totalRmb(p))} / ${rub(totalRub(p))}`;
      updateCostFeeHint(p);
    }

    function updateCostFeeHint(p) {
      const hint = $("costFeeHint");
      if (!hint) return;
      const bundle = findFeeBundle(p.platform, p.mode, p.fulfillment);
      const hasModel = bundle && (bundle.defaultModel || (bundle.models && Object.keys(bundle.models).length));
      if (hasModel) {
        hint.textContent = `费用模型：${PLATFORM_LABELS[bundle.platform]} · ${MODE_LABELS[bundle.mode]} · ${bundle.fulfillment}（${bundle.models ? Object.keys(bundle.models).length : 0} SKU）`;
        hint.classList.add("configured");
      } else {
        hint.textContent = "费用模型：未配置（可在下方导入费用表）";
        hint.classList.remove("configured");
      }
    }

    window.editProduct = (id) => {
      const p = productById(id);
      if (!p) return;
      const scoped = ensureProductScope(p);
      $("editId").value = scoped.id;
      $("code").value = scoped.code || "";
      $("sku").value = scoped.sku || "";
      $("name").value = scoped.name || "";
      $("purchase").value = scoped.purchase ?? 0;
      $("domestic").value = scoped.domestic ?? 0;
      $("platform").value = scoped.platform;
      $("mode").value = scoped.mode;
      refreshFulfillmentOptions($("fulfillment"), scoped.platform, scoped.mode, scoped.fulfillment);
      renderDynamicCostFields(scoped.mode, scoped);
      $("rate").value = scoped.rate ?? 11.5;
      $("costFormTitle").textContent = "编辑产品成本";
      updateCostTotal();
      const costsTab = document.querySelector('[data-tab="costs"]');
      if (costsTab) costsTab.click();
      const formPanel = $("costForm")?.closest(".panel");
      if (formPanel) formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      const formTitle = $("costFormTitle");
      if (formTitle) { formTitle.style.transition = "color .3s ease"; formTitle.style.color = "var(--accent-gold)"; setTimeout(() => { formTitle.style.color = ""; }, 1200); }
    };

    window.deleteProduct = (id) => {
      const p = productById(id);
      if (!p) return;
      if (!confirm(`确认删除产品成本？\n${p.code} / ${p.name}`)) return;
      products = products.filter((item) => item.id !== id);
      renderAll();
    };

    function resetCostForm() {
      const platform = normalizePlatform($("costScopePlatform")?.value || $("platform")?.value || "Ozon");
      const mode = normalizeMode($("costScopeMode")?.value || $("mode")?.value || "local");
      const fulfillment = normalizeFulfillment($("costScopeFulfillment")?.value, platform, mode);
      $("costForm").reset();
      $("editId").value = "";
      $("platform").value = platform;
      $("mode").value = mode;
      refreshFulfillmentOptions($("fulfillment"), platform, mode, fulfillment);
      renderDynamicCostFields(mode, { firstFreight: 0, lastMile: 0 });
      $("rate").value = 11.5;
      $("costFormTitle").textContent = "添加产品成本";
      updateCostTotal();
    }

    function renderCompetitorProfit() {
      const code = $("priceCheckCode")?.value.trim().toLowerCase() || "";
      const price = Number($("priceCheckPrice")?.value || 0);
      const product = products.find((item) => String(item.code || "").toLowerCase() === code);
      const result = product ? calcPriceProfit(product.id, price) : { profit: 0, rate: 0 };
      const latest = competitors[0];
      const last = latest?.history?.[latest.history.length - 1] || { price: 0, sales: 0 };
      $("competitorCount").textContent = competitors.length;
      $("lastCompetitorPrice").textContent = rub(last.price);
      $("lastCompetitorSales").textContent = Number(last.sales || 0);
      $("matchedProduct").textContent = product ? `${product.code} / ${product.name}` : "未匹配";
      $("priceCheckCost").textContent = rub(result.cost || 0);
      $("priceCheckFees").textContent = rub((result.commission || 0) + (result.platformFee || 0) + (result.serviceFee || 0));
      $("compProfit").textContent = rub(result.profit);
      $("compProfitRate").textContent = `${result.rate.toFixed(2)}%`;
      const advice = $("compAdvice");
      advice.className = `pill ${product && result.profit > 0 && result.rate >= 10 ? "ok" : product && result.profit > 0 ? "mid" : "bad"}`;
      advice.textContent = !code ? "填写货号和售价" : !product ? "货号未匹配成本" : result.profit > 0 && result.rate >= 10 ? "利润健康，可以跟价" : result.profit > 0 ? "利润偏薄，谨慎跟价" : "按此价格会亏损";
    }

    function ozonProductId(url) {
      const match = String(url || "").match(/-(\d+)\/?(?:\?|$)/);
      return match ? match[1] : "";
    }

    function knownCompetitorData(url) {
      const id = ozonProductId(url);
      if (id === "148170185") {
        const image = "ozon-148170185-main.png";
        return {
          productId: id,
          title: "Экзодерил раствор 1%, 20мл",
          price: 1357,
          todaySales: 5,
          sales: 153,
          image
        };
      }
      return null;
    }

    function simulateCompetitorFetch(url) {
      const known = knownCompetitorData(url);
      if (known) return known;
      const product = products[Math.abs([...url].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % Math.max(products.length, 1)] || products[0];
      const baseCost = product ? totalRub(product) : 1200;
      const seed = [...url].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const price = Math.round((baseCost * (1.28 + (seed % 45) / 100)) * 100) / 100;
      const sales = 12 + (seed % 430);
      const todaySales = Math.max(1, Math.round(sales / 30 + (seed % 5) - 2));
      const imageHue = seed % 360;
      const image = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="116" height="116" viewBox="0 0 116 116"><rect width="116" height="116" rx="16" fill="hsl(${imageHue},64%,88%)"/><circle cx="58" cy="48" r="22" fill="hsl(${imageHue},62%,54%)"/><rect x="28" y="74" width="60" height="14" rx="7" fill="hsl(${imageHue},48%,38%)"/></svg>`)}`;
      return { productId: ozonProductId(url), title: "竞品商品", price, todaySales, sales, image };
    }

    function normalizeCompetitorRecords() {
      competitors.forEach((item) => {
        const known = knownCompetitorData(item.url);
        if (!known) return;
        item.history = item.history?.length ? item.history : [{ date: todayIso() }];
        const last = item.history[item.history.length - 1];
        last.price = known.price;
        last.todaySales = known.todaySales;
        last.sales = known.sales;
        last.image = known.image;
        last.title = known.title;
        item.productId = known.productId;
      });
    }

    function competitorChange(item) {
      const history = item.history || [];
      if (history.length < 2) return null;
      const now = history[history.length - 1].price;
      const prev = history[history.length - 2].price;
      if (!prev) return null;
      return (now - prev) / prev * 100;
    }

    function renderCompetitors() {
      $("competitorRows").innerHTML = competitors.map((item) => {
        const last = item.history?.[item.history.length - 1] || { price: 0, todaySales: 0, sales: 0, image: "", title: "", date: "" };
        const change = competitorChange(item);
        const changeHtml = change === null ? "暂无" : `<span class="${change >= 0 ? "change-up" : "change-down"}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</span>`;
        return `<tr>
          <td>${last.image ? `<img class="competitor-img" src="${last.image}" alt="竞品图片" onclick="openImageModal('${encodeURIComponent(last.image)}')" />` : ""}<div class="sku">${escapeHtml(last.title || item.productId || "")}</div></td>
          <td class="money">${rub(last.price)}</td>
          <td>${Number(last.todaySales || 0)}</td>
          <td>${Number(last.sales || 0)}</td>
          <td>${changeHtml}</td>
          <td><a href="${escapeHtml(item.url)}" target="_blank">打开链接</a></td>
          <td>${escapeHtml(last.date)}</td>
          <td class="actions">
            <button class="secondary" onclick="loadCompetitor('${item.id}')">载入</button>
            <button class="danger" onclick="deleteCompetitor('${item.id}')">删除</button>
          </td>
        </tr>`;
      }).join("");
    }

    window.loadCompetitor = (id) => {
      const item = competitors.find((c) => c.id === id);
      if (!item) return;
      $("competitorUrl").value = item.url;
      competitors = [item, ...competitors.filter((c) => c.id !== id)];
      renderCompetitorProfit();
    };

    window.openImageModal = (encodedSrc) => {
      $("imageModalImg").src = decodeURIComponent(encodedSrc);
      $("imageModal").classList.add("open");
    };

    function closeImageModal() {
      $("imageModal").classList.remove("open");
      $("imageModalImg").src = "";
    }

    window.deleteCompetitor = (id) => {
      competitors = competitors.filter((c) => c.id !== id);
      renderAll();
    };

    function download(filename, content, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    $("costForm").addEventListener("input", updateCostTotal);
    $("platform").addEventListener("change", () => {
      const platform = normalizePlatform($("platform").value);
      const mode = normalizeMode($("mode").value);
      refreshFulfillmentOptions($("fulfillment"), platform, mode, $("fulfillment").value);
      updateCostTotal();
    });
    $("mode").addEventListener("change", () => {
      const platform = normalizePlatform($("platform").value);
      const mode = normalizeMode($("mode").value);
      const prevMode = $("mode").dataset.prevMode;
      refreshFulfillmentOptions($("fulfillment"), platform, mode, $("fulfillment").value);
      if (prevMode && prevMode !== mode) renderDynamicCostFields(mode, readCostForm());
      $("mode").dataset.prevMode = mode;
      updateCostTotal();
    });
    $("fulfillment").addEventListener("change", updateCostTotal);
    $("costForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const p = readCostForm();
      if (!p.code || !p.sku) { alert("请填写货号和 SKU。"); return; }
      const index = products.findIndex((item) => item.id === p.id);
      if (index >= 0) products[index] = p; else products.unshift(p);
      resetCostForm();
      renderAll();
    });
    $("resetCostForm").addEventListener("click", resetCostForm);
    $("costSearch").addEventListener("input", renderCosts);

    $("costScopePlatform").addEventListener("change", () => {
      syncScopeFulfillment();
      syncFormScopeFromGlobal();
      renderCosts();
    });
    $("costScopeMode").addEventListener("change", () => {
      syncScopeFulfillment();
      syncFormScopeFromGlobal();
      renderCosts();
    });
    $("costScopeFulfillment").addEventListener("change", () => {
      syncFormScopeFromGlobal();
      renderCosts();
    });

    function syncScopeFulfillment() {
      const platform = normalizePlatform($("costScopePlatform").value);
      const mode = normalizeMode($("costScopeMode").value);
      refreshFulfillmentOptions($("costScopeFulfillment"), platform, mode, $("costScopeFulfillment").value);
    }
    function syncFormScopeFromGlobal() {
      if ($("editId").value) return;
      const platform = normalizePlatform($("costScopePlatform").value);
      const mode = normalizeMode($("costScopeMode").value);
      const fulfillment = normalizeFulfillment($("costScopeFulfillment").value, platform, mode);
      $("platform").value = platform;
      $("mode").value = mode;
      $("mode").dataset.prevMode = mode;
      refreshFulfillmentOptions($("fulfillment"), platform, mode, fulfillment);
      renderDynamicCostFields(mode, { firstFreight: 0, lastMile: 0 });
      updateCostTotal();
    }

    function initCostScope() {
      if (!$("costScopePlatform")) return;
      refreshFulfillmentOptions($("costScopeFulfillment"), "Ozon", "local", "FBO");
      refreshFulfillmentOptions($("fulfillment"), "Ozon", "local", "FBO");
      $("mode").dataset.prevMode = "local";
      renderDynamicCostFields("local", { firstFreight: 0, lastMile: 0 });
    }

    $("exportCosts").addEventListener("click", () => {
      const headers = ["平台","模式","履约","货号","SKU","产品名称","采购成本RMB","国内运费RMB","头程运费RMB","尾程操作费RMB","汇率","成本合计RMB","RUB成本"];
      const rows = products.map((p) => [p.platform,p.mode,p.fulfillment,p.code,p.sku,p.name,p.purchase,p.domestic,p.firstFreight,p.lastMile,p.rate,totalRmb(p),totalRub(p)]);
      const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n");
      download("ozon-wb-product-costs.csv", "\ufeff" + csv, "text/csv;charset=utf-8");
    });

    $("importCosts").addEventListener("click", () => $("importCostsFile").click());
    $("importCostsFile").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const status = $("costImportStatus");
      try {
        const imported = await parseProductCostFile(file);
        if (!imported.length) throw new Error("未能从表格中识别出任何产品行（需要包含 货号/SKU/产品名称 列）。");
        const byKey = new Map(products.map((p) => [`${p.platform}|${p.mode}|${p.fulfillment}|${p.sku}`, p]));
        let added = 0, updated = 0;
        for (const item of imported) {
          const key = `${item.platform}|${item.mode}|${item.fulfillment}|${item.sku}`;
          const existing = byKey.get(key);
          if (existing) { Object.assign(existing, item, { id: existing.id }); updated += 1; }
          else { const fresh = { ...item, id: crypto.randomUUID() }; products.unshift(fresh); byKey.set(key, fresh); added += 1; }
        }
        save();
        renderAll();
        if (status) status.textContent = `导入完成：新增 ${added} 条，更新 ${updated} 条（来源：${file.name}）。`;
      } catch (error) {
        if (status) status.textContent = "导入失败：" + (error.message || error);
        alert("导入失败：" + (error.message || error));
      } finally {
        event.target.value = "";
      }
    });

    async function parseProductCostFile(file) {
      if (!window.XLSX) throw new Error("Excel 解析组件未加载，请刷新页面后重试。");
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const headerIndex = rows.findIndex((row) => row.some((cell) => /货号|代码|code/i.test(String(cell))));
      if (headerIndex < 0) throw new Error("未找到包含「货号」的表头行。");
      const headerMap = new Map(rows[headerIndex].map((h, i) => [normalizeAdHeader(h), i]));
      const pick = (row, names) => {
        for (const n of names) { const idx = headerMap.get(normalizeAdHeader(n)); if (idx !== undefined && row[idx] !== "") return row[idx]; }
        return "";
      };
      const scopePlatform = normalizePlatform($("costScopePlatform").value);
      const scopeMode = normalizeMode($("costScopeMode").value);
      const scopeFulfillment = normalizeFulfillment($("costScopeFulfillment").value, scopePlatform, scopeMode);
      const result = [];
      rows.slice(headerIndex + 1).forEach((row) => {
        const code = String(pick(row, ["货号", "代码", "code"])).trim();
        const sku = String(pick(row, ["SKU", "sku", "平台SKU"])).trim();
        const name = String(pick(row, ["产品名称", "名称", "商品名称", "name"])).trim();
        if (!code && !sku) return;
        result.push(ensureProductScope({
          code, sku, name: name || code || sku,
          purchase: adNumber(pick(row, ["采购成本RMB", "采购成本", "采购"])),
          domestic: adNumber(pick(row, ["国内运费RMB", "国内运费", "国内"])),
          firstFreight: adNumber(pick(row, ["头程运费RMB", "头程运费", "头程"])),
          lastMile: adNumber(pick(row, ["尾程操作费RMB", "尾程操作费", "尾程", "国际物流RMB", "国际物流"])),
          rate: adNumber(pick(row, ["汇率", "rate"])) || 11.5,
          platform: normalizePlatform(pick(row, ["平台", "platform"]) || scopePlatform),
          mode: normalizeMode(pick(row, ["模式", "mode"]) || scopeMode),
          fulfillment: normalizeFulfillment(pick(row, ["履约", "fulfillment"]) || scopeFulfillment, scopePlatform, scopeMode),
        }));
      });
      return result;
    }

    function refreshFeeImportFulfillment() {
      const platform = normalizePlatform($("feeImportPlatform").value);
      const mode = normalizeMode($("feeImportMode").value);
      refreshFulfillmentOptions($("feeImportFulfillment"), platform, mode, $("feeImportFulfillment").value);
    }
    $("feeImportPlatform").addEventListener("change", refreshFeeImportFulfillment);
    $("feeImportMode").addEventListener("change", refreshFeeImportFulfillment);

    $("importFees").addEventListener("click", async () => {
      const file = $("feeImportFile")?.files?.[0];
      const status = $("feeImportStatus");
      if (!file) { if (status) status.textContent = "请先选择费用表文件。"; return; }
      try {
        const platform = normalizePlatform($("feeImportPlatform").value);
        const mode = normalizeMode($("feeImportMode").value);
        const fulfillment = normalizeFulfillment($("feeImportFulfillment").value, platform, mode);
        const parsed = await parseFeeTableFile(file);
        upsertFeeBundle(platform, mode, fulfillment, parsed);
        save();
        renderFeeRows();
        updateCostTotal();
        if (status) status.textContent = `已导入 ${PLATFORM_LABELS[platform]} · ${MODE_LABELS[mode]} · ${fulfillment} 费用表：${parsed.modelCount} 条 SKU 费用${parsed.defaultModel ? "，含默认费用" : ""}（来源：${file.name}）。`;
      } catch (error) {
        if (status) status.textContent = "费用表导入失败：" + (error.message || error);
        alert("费用表导入失败：" + (error.message || error));
      } finally {
        $("feeImportFile").value = "";
      }
    });

    $("clearImportedFees").addEventListener("click", () => {
      if (!platformFees.length) { if ($("feeImportStatus")) $("feeImportStatus").textContent = "当前没有已导入的费用表。"; return; }
      if (!confirm("确认清空全部已导入的平台费用表？")) return;
      platformFees = [];
      save();
      renderFeeRows();
      updateCostTotal();
      if ($("feeImportStatus")) $("feeImportStatus").textContent = "已清空全部平台费用表。";
    });

    async function parseFeeTableFile(file) {
      if (!window.XLSX) throw new Error("Excel 解析组件未加载，请刷新页面后重试。");
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const headerIndex = rows.findIndex((row) => row.some((cell) => /sku|货号|代码/i.test(String(cell))));
      if (headerIndex < 0) throw new Error("未找到包含「SKU」或「货号」的表头行。");
      const headerMap = new Map(rows[headerIndex].map((h, i) => [normalizeAdHeader(h), i]));
      const pick = (row, names) => {
        for (const n of names) { const idx = headerMap.get(normalizeAdHeader(n)); if (idx !== undefined && row[idx] !== "") return row[idx]; }
        return "";
      };
      const models = {};
      let defaultModel = null;
      rows.slice(headerIndex + 1).forEach((row) => {
        const key = String(pick(row, ["sku", "货号", "代码"])).trim();
        const model = {
          defaultPrice: adNumber(pick(row, ["默认售价", "后台定价", "售价", "defaultprice"])),
          commissionRate: adNumber(pick(row, ["佣金率", "佣金", "commissionrate"])),
          logisticsFee: adNumber(pick(row, ["物流费", "logisticsfee"])),
          handlingFee: adNumber(pick(row, ["揽收处理", "处理费", "handlingfee"])),
          acquiringFee: adNumber(pick(row, ["收款手续费", "acquiringfee"])),
          otherFixedFee: adNumber(pick(row, ["其他固定费", "其他费用", "otherfixedfee"])),
        };
        if (key) models[key] = model;
        else if (!defaultModel) defaultModel = model;
      });
      if (!Object.keys(models).length && !defaultModel) throw new Error("费用表里没有可识别的费用行。");
      return { models, defaultModel, modelCount: Object.keys(models).length };
    }

    function upsertFeeBundle(platform, mode, fulfillment, parsed) {
      platform = normalizePlatform(platform);
      mode = normalizeMode(mode);
      fulfillment = normalizeFulfillment(fulfillment, platform, mode);
      const key = feeScopeKey(platform, mode, fulfillment);
      platformFees = platformFees.filter((b) => feeScopeKey(b.platform, b.mode, b.fulfillment) !== key);
      platformFees.unshift({
        id: crypto.randomUUID(),
        platform, mode, fulfillment,
        models: parsed.models || {},
        defaultModel: parsed.defaultModel || null,
        fileName: parsed.fileName || "",
        importedAt: new Date().toISOString(),
      });
    }

    window.deleteFeeBundle = (id) => {
      if (!confirm("确认删除这组平台费用表？")) return;
      platformFees = platformFees.filter((b) => b.id !== id);
      save();
      renderFeeRows();
      updateCostTotal();
    };

    function renderFeeRows() {
      const body = $("feeRows");
      if (!body) return;
      body.innerHTML = platformFees.length ? platformFees.map((b) => {
        const modelCount = b.models ? Object.keys(b.models).length : 0;
        const coveredSkus = b.models ? products.filter((p) => b.models[String(p.sku)] || b.models[String(p.code)]).length : 0;
        const imported = b.importedAt ? b.importedAt.replace("T", " ").slice(0, 16) : "-";
        return `<tr>
          <td><strong>${PLATFORM_LABELS[b.platform] || b.platform}</strong></td>
          <td>${MODE_LABELS[b.mode] || b.mode}</td>
          <td>${escapeHtml(b.fulfillment)}</td>
          <td>${modelCount}${b.defaultModel ? " <span class='sku'>+默认</span>" : ""}</td>
          <td>${coveredSkus} / ${products.length}</td>
          <td>${escapeHtml(imported)}</td>
          <td><button class="danger" type="button" onclick="deleteFeeBundle('${b.id}')">删除</button></td>
        </tr>`;
      }).join("") : `<tr><td colspan="7" class="muted-cell">尚未导入任何平台费用表。上传后将在这里显示，订单利润与跟价计算会自动使用。</td></tr>`;
    }

    if ($("seedOrders")) $("seedOrders").addEventListener("click", seedDemoOrders);
    if ($("clearOrders")) $("clearOrders").addEventListener("click", () => {
      if (!confirm("确认清空订单数据？")) return;
      orders = [];
      renderAll();
    });
    if ($("runApiDiagnostics")) $("runApiDiagnostics").addEventListener("click", runApiDiagnostics);
    $("closeImageModal").addEventListener("click", closeImageModal);
    $("imageModal").addEventListener("click", (event) => {
      if (event.target.id === "imageModal") closeImageModal();
    });
    $("adStoreSelect").addEventListener("change", renderAds);
    $("storeOverviewView")?.addEventListener("change", (event) => {
      storeOverviewView = event.target.value;
      renderStoreOverviewControls();
      renderStoreOverview();
    });
    $("storeOverviewGroup")?.addEventListener("change", (event) => {
      storeOverviewGroup = event.target.value;
      renderStoreOverview();
    });
    if ($("refreshAdsApi")) $("refreshAdsApi").addEventListener("click", refreshAdsApi);
    if ($("adCompareToggle")) $("adCompareToggle").addEventListener("change", (event) => {
      adCompareEnabled = event.target.checked;
      renderAds();
    });
    document.querySelectorAll("[data-ad-range]").forEach((button) => {
      button.addEventListener("click", async () => {
        const days = Number(button.dataset.adRange || 28);
        adDateTo = adsTodayIso();
        adDateFrom = addDays(adDateTo, -(days - 1));
        updateAdDateInputs();
        renderAds();
        await autoRefreshAds();
      });
    });
    if ($("adChart")) {
      $("adChart").addEventListener("mousemove", (event) => {
        const canvas = $("adChart");
        const tooltip = $("adChartTooltip");
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        const hit = adChartHitboxes.find((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
        if (!hit) {
          tooltip.style.display = "none";
          if (activeAdChartIndex !== null) {
            activeAdChartIndex = null;
            drawAdChart();
          }
          return;
        }
        if (activeAdChartIndex !== hit.index) {
          activeAdChartIndex = hit.index;
          drawAdChart();
        }
        tooltip.innerHTML = '<strong>费用</strong><br><span>本期 ' + escapeHtml(hit.date) + '</span><b style="float:right;margin-left:18px">' + rub(hit.current) + '</b><br>' + (hit.previousDate ? '<span>上期 ' + escapeHtml(hit.previousDate) + '</span><b style="float:right;margin-left:18px">' + rub(hit.previous) + '</b>' : '');
        tooltip.style.display = "block";
        tooltip.style.left = Math.min(event.clientX - rect.left + 14, rect.width - 210) + "px";
        tooltip.style.top = Math.max(event.clientY - rect.top - 12, 8) + "px";
      });
      $("adChart").addEventListener("mouseleave", () => {
        $("adChartTooltip").style.display = "none";
        activeAdChartIndex = null;
        drawAdChart();
      });
    }
    if ($("importAds")) $("importAds").addEventListener("click", importAdFile);
    if ($("clearImportedAds")) $("clearImportedAds").addEventListener("click", () => {
      if (!confirm("确定清空本机已导入的广告数据吗？")) return;
      importedAds = [];
      save();
      if ($("adImportStatus")) $("adImportStatus").textContent = "已清空导入广告数据。";
      renderAds();
    });
    ["priceCheckCode", "priceCheckPrice"].forEach((id) => {
      if ($(id)) $(id).addEventListener("input", renderCompetitorProfit);
    });
    if ($("priceCheckForm")) $("priceCheckForm").addEventListener("submit", (event) => event.preventDefault());

    $("competitorForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const url = $("competitorUrl").value.trim();
      const existing = competitors.find((item) => item.url === url);
      const fetched = simulateCompetitorFetch(url);
      const record = {
        date: todayIso(),
        price: fetched.price,
        todaySales: fetched.todaySales,
        sales: fetched.sales,
        image: fetched.image,
        title: fetched.title
      };
      if (existing) {
        existing.productId = fetched.productId;
        existing.history = [...(existing.history || []), record];
        competitors = [existing, ...competitors.filter((item) => item.id !== existing.id)];
      } else {
        competitors.unshift({
          id: crypto.randomUUID(),
          url,
          productId: fetched.productId,
          history: [record]
        });
      }
      $("competitorUrl").value = "";
      renderAll();
    });

    function setApiVerifyStatus(ok, message) {
      const box = $("apiVerifyStatus");
      if (!box) return;
      box.hidden = false;
      box.className = "api-verify-status " + (ok ? "ok" : "fail");
      box.textContent = message;
    }

    async function verifyApiCredentials() {
      const clientId = $("apiClientId").value.trim();
      const secret = $("apiSecret").value.trim();
      if (!clientId || !secret) {
        setApiVerifyStatus(false, "请先填写 Client ID 和 API 密钥。");
        return false;
      }
      const btn = $("verifyApiBtn");
      if (btn) { btn.disabled = true; btn.textContent = "验证中..."; }
      try {
        if (backendEnabled) {
          const result = await apiRequest("/api/integrations", {
            method: "POST",
            body: JSON.stringify({ action: "verify", clientId, secret })
          });
          if (result.ok) {
            setApiVerifyStatus(true, "✓ " + (result.message || "验证成功，凭证有效"));
            return true;
          }
          setApiVerifyStatus(false, "✗ " + (result.error || "验证失败，请检查 Client ID 与密钥"));
          return false;
        }
        setApiVerifyStatus(true, "✓ 本地演示模式：凭证已记录，保存后即可使用（在线上环境会真实校验）。");
        return true;
      } catch (error) {
        setApiVerifyStatus(false, "✗ 验证请求失败：" + (error.message || error));
        return false;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "验证可用性"; }
      }
    }

    $("verifyApiBtn").addEventListener("click", verifyApiCredentials);

    $("apiForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const editId = $("editApiId").value;
      const payload = {
        name: $("apiName").value.trim(),
        platform: $("apiPlatform").value,
        clientId: $("apiClientId").value.trim(),
        secret: $("apiSecret").value
      };
      if (!payload.name || !payload.clientId || !payload.secret) {
        alert("请填写店铺名称、Client ID 和 API 密钥。");
        return;
      }
      if (backendEnabled) {
        try {
          if (editId) {
            const index = apiConfigs.findIndex((entry) => entry.id === editId);
            if (index >= 0) {
              apiConfigs[index] = { ...apiConfigs[index], ...payload };
            }
          } else {
            const created = await apiRequest("/api/integrations", {
              method: "POST",
              body: JSON.stringify(payload)
            });
            apiConfigs.unshift(created);
          }
        } catch (error) {
          alert(error.message);
          return;
        }
      } else {
        if (editId) {
          const index = apiConfigs.findIndex((entry) => entry.id === editId);
          if (index >= 0) apiConfigs[index] = { ...apiConfigs[index], ...payload };
        } else {
          apiConfigs.unshift({
            id: crypto.randomUUID(),
            ...payload,
            createdAt: new Date().toISOString()
          });
        }
      }
      $("apiForm").reset();
      $("editApiId").value = "";
      $("apiVerifyStatus").hidden = true;
      renderAll();
    });

    $("resetApiForm")?.addEventListener("click", () => {
      $("apiForm").reset();
      $("editApiId").value = "";
      $("apiVerifyStatus").hidden = true;
    });

    $("storeGroupForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = readGroupForm();
      if (!data.name) { alert("请填写分组名称。"); return; }
      const index = storeGroups.findIndex((entry) => entry.id === data.id);
      if (index >= 0) {
        storeGroups[index] = data;
      } else {
        storeGroups.unshift(data);
      }
      resetGroupForm();
      renderAll();
    });
    $("resetGroupForm").addEventListener("click", resetGroupForm);

    $("storeFilter").addEventListener("change", (event) => {
      selectedStore = event.target.value;
      renderDashboard();
      renderStoreOverview();
    });
    $("reloadOrders").addEventListener("click", async () => {
      if (!normalizeOrderRange()) return;
      $("reloadOrders").textContent = "抓取中...";
      $("reloadOrders").disabled = true;
      try {
        await loadBackendOrders();
      } catch (error) {
        alert(error.message);
      } finally {
        $("reloadOrders").textContent = "刷新订单";
        $("reloadOrders").disabled = false;
        renderAll();
      }
    });
    $("orderDateRangeButton")?.addEventListener("click", () => {
      $("orderDateRangePanel")?.classList.toggle("open");
      renderCalendar();
    });
    $("orderDateFromDisplay")?.addEventListener("click", () => { pickingDateField = "from"; renderCalendar(); });
    $("orderDateToDisplay")?.addEventListener("click", () => { pickingDateField = "to"; renderCalendar(); });
    $("calendarPrev")?.addEventListener("click", () => {
      calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
      renderCalendar();
    });
    $("calendarNext")?.addEventListener("click", () => {
      calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
      renderCalendar();
    });
    $("orderCalendar")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-date]");
      if (!button) return;
      setOrderDate(button.dataset.date).catch((error) => alert(error.message));
    });
    $("chartDateRangeButton")?.addEventListener("click", () => {
      $("chartDateRangePanel")?.classList.toggle("open");
      renderChartCalendar();
    });
    $("chartCalendarPrev")?.addEventListener("click", () => {
      chartCalendarCursor = new Date(chartCalendarCursor.getFullYear(), chartCalendarCursor.getMonth() - 1, 1);
      renderChartCalendar();
    });
    $("chartCalendarNext")?.addEventListener("click", () => {
      chartCalendarCursor = new Date(chartCalendarCursor.getFullYear(), chartCalendarCursor.getMonth() + 1, 1);
      renderChartCalendar();
    });
    $("chartCalendar")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-chart-date]");
      if (!button) return;
      event.stopPropagation();
      setChartDate(button.dataset.chartDate).catch((error) => alert(error.message));
    });
    $("chartStoreSelect")?.addEventListener("change", (event) => {
      chartStore = event.target.value;
      activeChartIndex = null;
      drawRevenueChart();
    });
    document.querySelectorAll("[data-range]").forEach((button) => {
      button.addEventListener("click", async () => {
        const value = button.dataset.range;
        const today = todayIso();
        const yesterday = addDays(today, -1);
        pendingOrderDateAnchor = null;
        if (value === "today") {
          orderDateFrom = today;
          orderDateTo = today;
        } else if (value === "yesterday") {
          orderDateFrom = yesterday;
          orderDateTo = yesterday;
        } else if (value === "quarter") {
          const d = new Date(`${today}T00:00:00`);
          const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
          orderDateFrom = localIso(new Date(d.getFullYear(), quarterStartMonth, 1));
          orderDateTo = yesterday;
        } else if (value === "year") {
          orderDateFrom = `${new Date(`${today}T00:00:00`).getFullYear()}-01-01`;
          orderDateTo = yesterday;
        } else {
          orderDateFrom = addDays(today, -Number(value));
          orderDateTo = yesterday;
        }
        $("orderDateRangePanel")?.classList.remove("open");
        try {
          await reloadOrdersForRange(orderDateFrom, orderDateTo);
        } catch (error) {
          alert(error.message);
        }
      });
    });

    // 静默预缓存28天广告数据（每日一次，避免用户刷新后还要手动选大范围才有数据）
    function precacheAds28Days() {
      const today = adsTodayIso();
      const cacheFrom = addDays(today, -27);
      const cacheTo = today;
      const key = `${cacheFrom}|${cacheTo}`;
      const cache = adsRowsCache[key];
      // 已有今日缓存或已有数据则跳过
      if (cache?.rows?.length) {
        const cacheDate = cache.updatedAt?.split("T")[0];
        if (cacheDate === today) return;
      }
      // 静默后台预抓（不等完成，不阻塞页面）
      loadBackendAds({ forceCreate: true, dateFrom: cacheFrom, dateTo: cacheTo })
        .then(() => { save(); })
        .catch(() => {});
    }

    // 经营汇总范围预缓存：7天/28天/季度/年（过去数据，每日凌晨4点后抓取一次）
    function precacheSummarySnapshots() {
      if (!backendEnabled) return;
      const today = todayIso();
      const yesterday = addDays(today, -1);
      // 先快照用户当前查看范围，用于 prune 时保留，避免异步竞态污染
      const userFrom = orderDateFrom;
      const userTo = orderDateTo;
      const ranges = [
        { name: "7", from: addDays(today, -7), to: yesterday },
        { name: "28", from: addDays(today, -28), to: yesterday },
        { name: "quarter", from: quarterStartIso(today), to: yesterday },
        { name: "year", from: `${new Date(`${today}T00:00:00`).getFullYear()}-01-01`, to: yesterday },
      ];
      const boundary = mskFetchBoundaryDate();
      for (const range of ranges) {
        const key = rangeCacheKey(range.from, range.to);
        const cached = orderRangeCache[key];
        if (!rangeNeedsRefresh(cached, range.from, range.to, false) && cached?.orders) continue;
        const snapshot = summarySnapshot[range.name] || {};
        if (snapshot.fetchDate === boundary) continue;
        // 使用局部参数抓取，不修改全局 orderDateFrom/orderDateTo，避免竞态
        (async () => {
          try {
            const params = new URLSearchParams();
            params.set("dateFrom", range.from);
            params.set("dateTo", range.to);
            const fetched = await apiRequest(`/api/orders?${params.toString()}`);
            mergeIntoTrendOrders(fetched);
            orderRangeCache[key] = { orders: fetched, fetchDate: boundary, includeToday: false, updatedAt: new Date().toISOString() };
            summarySnapshot[range.name] = { fetchDate: boundary, count: fetched.length, updatedAt: new Date().toISOString() };
            save();
          } catch {
            // 抓取失败则下次进入页面时再试，不阻塞其他范围
          }
        })();
      }
      // 把用户当前查看范围纳入保留集，防止 prune 误删正在使用的缓存
      pruneStaleRangeCache([...ranges, { from: userFrom, to: userTo }]);
    }

    // 每天调用一次后端 /api/precache,预热订单+店铺分析缓存(今天/7天/28天/本月/上月)
    // 记录上次调用的莫斯科日期,同一天内不重复调用
    // 首次(或版本升级后)带 clean=1 清空旧坏缓存再预热
    async function precacheOrdersDaily() {
      try {
        const lastKey = "ozon_wb_precache_orders_day";
        const cleanVerKey = "ozon_wb_precache_clean_ver";
        const boundary = mskFetchBoundaryDate();
        if (localStorage.getItem(lastKey) === boundary) return;   // 今天已预热过
        localStorage.setItem(lastKey, boundary);
        // clean=1 仅在版本号变化时触发一次,清掉早期 bug 存的坏缓存
        const needClean = localStorage.getItem(cleanVerKey) !== "v2";
        if (needClean) localStorage.setItem(cleanVerKey, "v2");
        const url = needClean ? "/api/precache?clean=1" : "/api/precache";
        const res = await fetch(url);
        const data = await res.json();
        if (data.ok) console.log("[precache] 订单预热完成:", data.results, needClean ? "(已清旧缓存)" : "");
      } catch (e) {
        console.warn("[precache] 预热失败:", e.message);
      }
    }

    // 清理过期/无用的范围缓存：保留当前经营汇总标准范围 + 当前查看范围，其余删除
    function pruneStaleRangeCache(keepRanges) {
      const keepKeys = new Set(keepRanges.map((range) => rangeCacheKey(range.from, range.to)));
      keepKeys.add(rangeCacheKey(orderDateFrom, orderDateTo));
      const boundary = mskFetchBoundaryDate();
      let pruned = false;
      for (const key of Object.keys(orderRangeCache)) {
        if (keepKeys.has(key)) continue;
        const entry = orderRangeCache[key] || {};
        const entryFetchDate = entry.fetchDate || "";
        if (entryFetchDate && entryFetchDate !== boundary) {
          delete orderRangeCache[key];
          pruned = true;
        }
      }
      for (const key of Object.keys(storeAnalyticsCache)) {
        if (keepKeys.has(key)) continue;
        const entry = storeAnalyticsCache[key] || {};
        const entryFetchDate = entry.fetchDate || "";
        if (entryFetchDate && entryFetchDate !== boundary) {
          delete storeAnalyticsCache[key];
          pruned = true;
        }
      }
      if (pruned) {
        try { save(); } catch {}
      }
    }

    function quarterStartIso(today) {
      const d = new Date(`${today}T00:00:00`);
      const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
      return localIso(new Date(d.getFullYear(), quarterStartMonth, 1));
    }

    // 定时器：每个整点检查是否越过莫斯科凌晨4点边界，越过则静默刷新缓存
    let summaryRefreshTimer = null;
    let summaryRefreshBoundary = null;
    function scheduleSummaryRefresh() {
      if (summaryRefreshTimer) return;
      summaryRefreshBoundary = mskFetchBoundaryDate();
      summaryRefreshTimer = setInterval(() => {
        const boundary = mskFetchBoundaryDate();
        if (boundary !== summaryRefreshBoundary) {
          summaryRefreshBoundary = boundary;
          precacheSummarySnapshots();
        }
      }, 60 * 60 * 1000);
    }

    async function bootstrap() {
      if ($("orderDateFrom")) $("orderDateFrom").value = orderDateFrom;
      if ($("orderDateTo")) $("orderDateTo").value = orderDateTo;
      updateOrderDateButton();
      renderCalendar();
      showGlobalLoader("正在加载店铺数据…");
      if (backendEnabled) {
        try {
          const [backendProducts, backendCompetitors, backendIntegrations] = await Promise.all([
            apiRequest("/api/products"),
            apiRequest("/api/competitors"),
            apiRequest("/api/integrations")
          ]);
          if (backendProducts.length) products = backendProducts.map((p) => ensureProductScope(p));
          await loadBackendOrders();
          await loadStoreAnalytics();
          competitors = backendCompetitors;
          apiConfigs = backendIntegrations;
        } catch {
          apiConfigs = JSON.parse(localStorage.getItem(apiConfigKey) || "[]");
        }
      }
      initCostScope();
      resetCostForm();
      renderAll();
      // 启动时从云端 KV 加载店铺(若 KV 有数据则覆盖本地,解决重新部署/换设备丢失问题)
      loadStoresFromCloud().then((loaded) => {
        if (loaded) { renderApiConfigs(); renderAll(); }
      });
      if (backendEnabled) autoRefreshAds();
      // 页面加载后静默预缓存28天广告数据（每日一次）
      if (backendEnabled) precacheAds28Days();
      // 静默预缓存经营汇总范围数据（7/28/季/年），每天凌晨4点后抓取一次
      if (backendEnabled) precacheSummarySnapshots();
      // 启动时后台预热订单+店铺分析缓存(今天/7天/28天/本月/上月),每天一次
      if (backendEnabled) precacheOrdersDaily();
      // 启动定时器，在莫斯科凌晨4点边界越过时自动刷新缓存
      if (backendEnabled) scheduleSummaryRefresh();
    }

    bootstrap();
