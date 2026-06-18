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
      {code:"QB60-GRAY", sku:"4675959653", name:"水泵", purchase:74.5, domestic:12, firstFreight:43.2, lastMile:5, rate:11.5, platform:"Ozon"},
      {code:"QB-60", sku:"4509788886", name:"水泵", purchase:70.5, domestic:12, firstFreight:43.2, lastMile:5, rate:11.5, platform:"Ozon"},
      {code:"PK-750", sku:"4509718786", name:"水泵", purchase:104.5, domestic:12, firstFreight:76.61, lastMile:7, rate:11.5, platform:"Ozon"},
      {code:"GP-130", sku:"4509770907", name:"水泵", purchase:104.5, domestic:12, firstFreight:141.86, lastMile:10, rate:11.5, platform:"Ozon"}
    ].map((item) => ({...item, id: crypto.randomUUID()}));

    const productKey = "ozon_wb_products_v3";
    const orderKey = "ozon_wb_orders_v1";
    const competitorKey = "ozon_wb_competitors_v2";
    const apiConfigKey = "ozon_wb_api_configs_v1";
    const skuFeeModels = {
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
    const $ = (id) => document.getElementById(id);
    const rmb = (v) => `¥${Number(v || 0).toFixed(2)}`;
    const rub = (v) => `₽${Number(v || 0).toFixed(2)}`;
    const escapeHtml = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
    const todayIso = () => new Date().toISOString().slice(0,10);
    const addDays = (date, days) => {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0,10);
    };

    let products = JSON.parse(localStorage.getItem(productKey) || "null") || initialProducts;
    let orders = JSON.parse(localStorage.getItem(orderKey) || "[]");
    let competitors = JSON.parse(localStorage.getItem(competitorKey) || "[]");
    let apiConfigs = JSON.parse(localStorage.getItem(apiConfigKey) || "[]");
    let revenueChartHitboxes = [];
    let activeChartIndex = null;
    let chartConfig = { compare: "previous", unit: "rub", period: 28, periodLabel: "28天" };
    let selectedStore = "all";
    let orderDateFrom = addDays(todayIso(), -59);
    let orderDateTo = todayIso();
    let calendarCursor = new Date(`${orderDateFrom}T00:00:00`);
    let pickingDateField = "from";
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
        alert("开始日期不能晚于结束日期，请重新选择日期范围。");
        return false;
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
        const start = new Date(first);
        start.setDate(first.getDate() - startOffset);
        const days = [];
        for (let i = 0; i < 42; i += 1) {
          const day = new Date(start);
          day.setDate(start.getDate() + i);
          const iso = day.toISOString().slice(0, 10);
          const classes = [
            "calendar-day",
            day.getMonth() !== month.getMonth() ? "muted" : "",
            iso === todayIso() ? "today" : "",
            iso === orderDateFrom || iso === orderDateTo ? "selected" : "",
            iso > orderDateFrom && iso < orderDateTo ? "in-range" : "",
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
    const setOrderDate = (value) => {
      if (pickingDateField === "from") {
        orderDateFrom = value;
        pickingDateField = "to";
      } else {
        orderDateTo = value;
        pickingDateField = "from";
      }
      $("orderDateFrom").value = orderDateFrom;
      $("orderDateTo").value = orderDateTo;
      updateOrderDateButton();
      renderCalendar();
    };
    const save = () => {
      localStorage.setItem(productKey, JSON.stringify(products));
      localStorage.setItem(orderKey, JSON.stringify(orders));
      localStorage.setItem(competitorKey, JSON.stringify(competitors));
      localStorage.setItem(apiConfigKey, JSON.stringify(apiConfigs));
    };

    async function apiRequest(path, options = {}) {
      const response = await fetch(path, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
      });
      if (!response.ok) throw new Error(`API 请求失败：${response.status}`);
      return response.json();
    }

    async function loadBackendOrders() {
      if (!backendEnabled) return;
      const params = new URLSearchParams();
      if (orderDateFrom) params.set("dateFrom", orderDateFrom);
      if (orderDateTo) params.set("dateTo", orderDateTo);
      orders = await apiRequest(`/api/orders?${params.toString()}`);
      const backendAds = await apiRequest("/api/ads/daily-products");
      if (backendAds.length) orders = mergeAdRowsIntoOrders(orders, backendAds);
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
      const adMap = new Map();
      adRows.forEach((row) => {
        adMap.set(`${row.date}|${row.store}|${row.sku}`, Number(row.adCost || 0));
      });
      const groupCounts = new Map();
      sourceOrders.forEach((order) => {
        const key = `${order.date}|${order.store}|${order.sku}`;
        groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
      });
      return sourceOrders.map((order) => {
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
      });
    });

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

    function renderAll() {
      normalizeCompetitorRecords();
      renderProductSelects();
      renderStoreFilter();
      renderCosts();
      renderDashboard();
      renderStoreOverview();
      renderAds();
      renderCompetitors();
      renderCompetitorProfit();
      renderApiConfigs();
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
      if ($("summaryRangeText")) $("summaryRangeText").textContent = `当前统计范围：${orderDateFrom} 至 ${orderDateTo}`;
      if ($("orderRangeStatus")) {
        $("orderRangeStatus").textContent = `当前订单范围：${orderDateFrom || "最早"} 至 ${orderDateTo || "今天"}，共 ${scopedOrders.length} 单。未出财务的订单先按历史模型预估，出财务后自动改为真实费用。`;
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

    function renderStoreOverview() {
      const body = $("storeOverviewRows");
      if (!body) return;
      const scoped = filteredOrders().filter((o) => (!orderDateFrom || o.date >= orderDateFrom) && (!orderDateTo || o.date <= orderDateTo));
      const map = new Map();
      scoped.forEach((order) => {
        const c = calcOrder(order);
        const row = map.get(order.store) || { store: order.store || "未命名店铺", revenue: 0, profit: 0, orders: 0, refunds: 0 };
        row.revenue += c.sale;
        row.profit += c.preliminaryProfit;
        if (!c.ignored) row.orders += 1;
        if (Number(c.refundFee || 0) > 0) row.refunds += 1;
        map.set(order.store, row);
      });
      const rows = [...map.values()].sort((a, b) => b.revenue - a.revenue);
      body.innerHTML = rows.length ? rows.map((row) => {
        const refundRate = row.orders ? row.refunds / row.orders * 100 : 0;
        const profitClass = row.profit >= 0 ? "positive" : "negative";
        return `<tr>
          <td><strong>${escapeHtml(row.store)}</strong></td>
          <td class="money">${rub(row.revenue)}</td>
          <td class="money ${profitClass}"><strong>${rub(row.profit)}</strong></td>
          <td>${row.orders}</td>
          <td class="muted-cell">待接入</td>
          <td class="muted-cell">待接入</td>
          <td class="muted-cell">待接入</td>
          <td>${row.refunds}</td>
          <td>${refundRate.toFixed(2)}%</td>
        </tr>`;
      }).join("") : `<tr><td colspan="9" class="muted-cell">当前时间范围暂无店铺数据</td></tr>`;
    }

    function filteredOrders() {
      return selectedStore === "all" ? orders : orders.filter((order) => order.store === selectedStore);
    }

    function renderStoreFilter() {
      const select = $("storeFilter");
      if (!select) return;
      const stores = [...new Set(orders.map((order) => order.store).filter(Boolean))].sort();
      if (selectedStore !== "all" && !stores.includes(selectedStore)) selectedStore = "all";
      const nextHtml = [
        `<option value="all">全部店铺</option>`,
        ...stores.map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`)
      ].join("");
      if (select.innerHTML !== nextHtml) select.innerHTML = nextHtml;
      select.value = selectedStore;
    }

    function dailyTotals(daysNeeded = chartConfig.period * 2) {
      const map = new Map();
      filteredOrders().forEach((order) => {
        const current = map.get(order.date) || { revenue: 0, orders: 0 };
        current.revenue += calcOrder(order).sale;
        current.orders += 1;
        map.set(order.date, current);
      });
      const end = new Date(todayIso());
      const days = [];
      for (let i = daysNeeded - 1; i >= 0; i--) days.push(addDays(end, -i));
      return days.map((date) => ({ date, revenue: map.get(date)?.revenue || 0, orders: map.get(date)?.orders || 0 }));
    }

    function drawRevenueChart() {
      const canvas = $("revenueChart");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const period = Number(chartConfig.period || 28);
      const data = dailyTotals(period * 2);
      const previousPeriod = data.slice(0, period);
      const current = data.slice(period, period * 2);
      const comparison = previousPeriod;
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
      const formatSales = (value) => rub(value);
      const formatOrders = (value) => `${Math.round(value)} 单`;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0b111e";
      ctx.fillRect(0, 0, width, height);

      const maxValue = Math.max(...comparison.map((item) => item.revenue), ...current.map((item) => item.revenue), 1);
      const maxOrders = Math.max(...current.map((item) => item.orders), 1);
      const axisMax = Math.ceil(maxValue / 1000) * 1000 || 1000;
      const orderAxisMax = Math.ceil(maxOrders / 10) * 10 || 10;
      const xStep = chartW / Math.max(current.length - 1, 1);
      const toY = (value) => chartY + chartH - (Number(value || 0) / axisMax) * chartH;
      const toOrderY = (value) => chartY + chartH - (Number(value || 0) / orderAxisMax) * chartH;
      const toX = (index) => chartX + index * xStep;

      ctx.strokeStyle = "rgba(148, 163, 184, .16)";
      ctx.lineWidth = 1;
      ctx.fillStyle = "#64748b";
      ctx.font = "12px Microsoft YaHei, Arial";
      for (let i = 0; i <= 4; i++) {
        const value = axisMax / 4 * i;
        const y = toY(value);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartW, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(`${(value / 1000).toFixed(value >= 1000 ? 1 : 0)}k`, chartX - 12, y + 4);
        ctx.textAlign = "left";
        ctx.fillText(Math.round(orderAxisMax / 4 * i), chartX + chartW + 14, y + 4);
      }

      const comparePoints = comparison.map((item, index) => ({ x: toX(index), y: toY(item.revenue) }));
      const orderPoints = current.map((item, index) => ({ x: toX(index), y: toOrderY(item.orders) }));
      if (activeChartIndex !== null && current[activeChartIndex]) {
        const activeX = toX(activeChartIndex);
        ctx.fillStyle = "rgba(255, 255, 255, .06)";
        ctx.fillRect(activeX - Math.max(10, xStep / 2), chartY, Math.max(20, xStep), chartH);
        ctx.strokeStyle = "rgba(250, 217, 97, .45)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(activeX, chartY);
        ctx.lineTo(activeX, chartY + chartH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawSmoothLine(ctx, comparePoints, "rgba(148, 163, 184, .58)", 2, { dots: false, dashed: true });

      const barStep = chartW / Math.max(current.length, 1);
      const barW = Math.min(34, Math.max(8, barStep * .46));
      current.forEach((item, index) => {
        const x = toX(index) - barW / 2;
        const y = toY(item.revenue);
        const h = chartY + chartH - y;
        const grad = ctx.createLinearGradient(0, y, 0, chartY + chartH);
        grad.addColorStop(0, index === activeChartIndex ? "#b9fbff" : "#00f2fe");
        grad.addColorStop(1, index === activeChartIndex ? "#6bb8ff" : "#4facfe");
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
      });
      drawSmoothLine(ctx, orderPoints, "#fad961", 2.5, { dots: false });
      if (activeChartIndex !== null && orderPoints[activeChartIndex]) {
        const point = orderPoints[activeChartIndex];
        ctx.fillStyle = "#0b111e";
        ctx.strokeStyle = "#fad961";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = "#64748b";
      ctx.font = "12px Microsoft YaHei, Arial";
      current.forEach((item, index) => {
        const interval = period <= 7 ? 1 : period <= 14 ? 2 : 4;
        if (index % interval !== 0 && index !== current.length - 1) return;
        ctx.textAlign = "center";
        ctx.fillText(item.date.slice(8), toX(index), height - 34);
        if (period >= 14 && (index === 2 || index === 16)) {
          ctx.fillStyle = "#475569";
          ctx.fillText(index < 10 ? "Sa" : "Su", toX(index), height - 18);
          ctx.fillStyle = "#64748b";
        }
      });

      revenueChartHitboxes = current.map((item, index) => {
        const compare = comparison[index] || { revenue: 0 };
        const change = compare.revenue ? (item.revenue - compare.revenue) / compare.revenue * 100 : null;
        const changeLabel = compare.revenue
          ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`
          : item.revenue > 0
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
          previous: compare.revenue,
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
      const grad = ctx.createLinearGradient(0, Math.min(...points.map((point) => point.y)), 0, baselineY);
      grad.addColorStop(0, "rgba(47, 156, 244, .22)");
      grad.addColorStop(.58, "rgba(47, 156, 244, .08)");
      grad.addColorStop(1, "rgba(47, 156, 244, 0)");
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
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function adFilteredOrders() {
      const selected = $("adStoreSelect")?.value || "all";
      return orders.filter((order) => Number(order.adCost || 0) > 0 && (selected === "all" || order.store === selected));
    }

    function renderAds() {
      if (!$("adStoreSelect")) return;
      const currentStore = $("adStoreSelect").value || "all";
      const stores = [...new Set(orders.map((order) => order.store).filter(Boolean))];
      $("adStoreSelect").innerHTML = `<option value="all">全部店铺</option>${stores.map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`).join("")}`;
      $("adStoreSelect").value = stores.includes(currentStore) ? currentStore : "all";

      const rows = adFilteredOrders();
      const summaryMap = new Map();
      rows.forEach((order) => {
        const c = calcOrder(order);
        const key = `${order.date}|${order.store}|${order.sku}`;
        const existing = summaryMap.get(key) || {
          date: order.date,
          store: order.store,
          sku: order.sku,
          product: c.product,
          revenue: 0,
          adCost: 0
        };
        existing.revenue += c.sale;
        existing.adCost += c.adCost;
        summaryMap.set(key, existing);
      });
      const summaryRows = [...summaryMap.values()].sort((a, b) => b.date.localeCompare(a.date) || b.adCost - a.adCost);
      const adTotal = summaryRows.reduce((sum, row) => sum + row.adCost, 0);
      const revenue = summaryRows.reduce((sum, row) => sum + row.revenue, 0);
      const productCount = new Set(summaryRows.map((row) => row.sku)).size;
      $("adTotal").textContent = rub(adTotal);
      $("adRevenue").textContent = rub(revenue);
      $("adRatio").textContent = `${(revenue ? adTotal / revenue * 100 : 0).toFixed(2)}%`;
      $("adProductCount").textContent = productCount;
      $("adRows").innerHTML = summaryRows.map((row) => {
        return `<tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.store)}</td>
          <td><strong>${escapeHtml(row.product?.code || row.sku)}</strong><div class="sku">${escapeHtml(row.product?.name || "")}</div></td>
          <td class="money">${rub(row.revenue)}</td>
          <td class="money">${rub(row.adCost)}</td>
          <td>${(row.revenue ? row.adCost / row.revenue * 100 : 0).toFixed(2)}%</td>
        </tr>`;
      }).join("");
      drawAdChart();
    }

    function drawAdChart() {
      const canvas = $("adChart");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const width = canvas.width;
      const height = canvas.height;
      const padLeft = 78;
      const padRight = 34;
      const padTop = 28;
      const padBottom = 58;
      const chartX = padLeft;
      const chartY = padTop;
      const chartW = width - padLeft - padRight;
      const chartH = height - padTop - padBottom;
      const map = new Map();
      adFilteredOrders().forEach((order) => map.set(order.date, (map.get(order.date) || 0) + Number(order.adCost || 0)));
      const days = [];
      for (let i = 27; i >= 0; i--) {
        const date = addDays(todayIso(), -i);
        days.push({ date, value: map.get(date) || 0 });
      }
      const max = Math.max(...days.map((item) => item.value), 1);
      const axisMax = Math.ceil(max / 500) * 500 || 500;
      const toY = (value) => chartY + chartH - (Number(value || 0) / axisMax) * chartH;
      const step = chartW / Math.max(days.length - 1, 1);

      ctx.clearRect(0, 0, width, height);
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "#fffaf6");
      bg.addColorStop(.55, "#f8fbff");
      bg.addColorStop(1, "#ffffff");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(150, 164, 173, .24)";
      ctx.fillStyle = "#667781";
      ctx.font = "12px Microsoft YaHei, Arial";
      for (let i = 0; i <= 4; i++) {
        const value = axisMax / 4 * i;
        const y = toY(value);
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartW, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = "right";
        ctx.fillText(`${(value / 1000).toFixed(value >= 1000 ? 1 : 0)} 千`, chartX - 12, y + 4);
      }

      const points = days.map((item, index) => ({ x: chartX + index * step, y: toY(item.value) }));
      drawSmoothLine(ctx, points, "#f97316", 4);

      ctx.fillStyle = "#465961";
      ctx.font = "12px Microsoft YaHei, Arial";
      days.forEach((item, index) => {
        if (index % 4 !== 0 && index !== days.length - 1) return;
        ctx.textAlign = "center";
        ctx.fillText(item.date.slice(8), chartX + index * step, height - 26);
      });
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
      renderAll();
    }

    function updateChartMenuText() {
      const unitText = chartConfig.unit === "count" ? "件" : "卢布";
      $("chartTitle").textContent = chartConfig.unit === "count" ? "订购商品数量" : "每日销量与销售额走势";
      $("chartMenuButton").textContent = `以${unitText}为单位 周期为${chartConfig.periodLabel}⌄`;
    }
    async function reloadOrdersForRange(from, to) {
      orderDateFrom = from;
      orderDateTo = to;
      if ($("orderDateFrom")) $("orderDateFrom").value = orderDateFrom;
      if ($("orderDateTo")) $("orderDateTo").value = orderDateTo;
      updateOrderDateButton();
      renderCalendar();
      await loadBackendOrders();
      renderAll();
    }
    async function applySummaryRange(value) {
      const today = todayIso();
      let from = today;
      let to = today;
      if (value === "7") from = addDays(today, -6);
      else if (value === "28") from = addDays(today, -27);
      else if (value === "quarter") from = addDays(today, -89);
      else if (value === "year") from = addDays(today, -364);
      await reloadOrdersForRange(from, to);
    }

    $("chartMenuButton").addEventListener("click", () => {
      $("chartMenu").classList.toggle("open");
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".chart-select")) $("chartMenu").classList.remove("open");
    });

    document.querySelectorAll(".menu-option").forEach((option) => {
      option.addEventListener("click", () => {
        const key = option.dataset.config;
        const value = option.dataset.value;
        if (key === "period") {
          chartConfig.period = Number(value);
          chartConfig.periodLabel = option.dataset.label || option.textContent.trim();
        } else {
          chartConfig[key] = value;
        }
        document.querySelectorAll(`.menu-option[data-config="${key}"]`).forEach((item) => item.classList.remove("active"));
        option.classList.add("active");
        updateChartMenuText();
        drawRevenueChart();
      });
    });
    document.querySelectorAll("[data-chart-period]").forEach((button) => {
      button.addEventListener("click", () => {
        chartConfig.period = Number(button.dataset.chartPeriod);
        chartConfig.periodLabel = `${chartConfig.period}天`;
        document.querySelectorAll("[data-chart-period]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        document.querySelectorAll(`.menu-option[data-config="period"]`).forEach((item) => {
          item.classList.toggle("active", Number(item.dataset.value) === chartConfig.period);
        });
        updateChartMenuText();
        activeChartIndex = null;
        drawRevenueChart();
      });
    });
    document.querySelectorAll("[data-summary-range]").forEach((button) => {
      button.addEventListener("click", async () => {
        document.querySelectorAll("[data-summary-range]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
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
        今日销售额：${hit.formatSales(hit.revenue)}<br>
        7天前销售额：${hit.formatSales(hit.previous)}<br>
        今日订单数：${hit.formatOrders(hit.orders)}<br>
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
      const rows = products.filter((p) => [p.code, p.sku, p.name].join(" ").toLowerCase().includes(keyword));
      $("costRows").innerHTML = rows.map((p) => `
        <tr>
          <td><strong>${escapeHtml(p.code)}</strong><div>${escapeHtml(p.name)}</div><div class="sku">${escapeHtml(p.sku)}</div></td>
          <td class="money">${rmb(p.purchase)}</td>
          <td class="money">${rmb(p.domestic)}</td>
          <td class="money">${rmb(p.firstFreight)}</td>
          <td class="money">${rmb(p.lastMile)}</td>
          <td>${Number(p.rate).toFixed(2)}</td>
          <td class="money"><strong>${rmb(totalRmb(p))}</strong></td>
          <td class="money"><strong>${rub(totalRub(p))}</strong></td>
          <td class="actions"><button class="secondary" onclick="editProduct('${p.id}')">编辑</button><button class="danger" onclick="deleteProduct('${p.id}')">删除</button></td>
        </tr>
      `).join("");
    }

    function renderProductSelects() {
      return;
    }

    function renderApiConfigs() {
      const rows = apiConfigs.map((item) => `
        <tr>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td>${escapeHtml(item.platform)}</td>
          <td>${escapeHtml(item.createdAt)}</td>
          <td><button class="danger" type="button" onclick="deleteApiConfig('${item.id}')">删除</button></td>
        </tr>
      `).join("");
      $("apiRows").innerHTML = rows || `<tr><td colspan="4" class="status">还没有添加接口。</td></tr>`;
    }

    window.deleteApiConfig = async (id) => {
      if (!confirm("确认删除这个接口？")) return;
      if (backendEnabled) {
        try {
          await apiRequest(`/api/integrations/${id}`, { method: "DELETE" });
        } catch (error) {
          alert(error.message);
          return;
        }
      }
      apiConfigs = apiConfigs.filter((item) => item.id !== id);
      renderAll();
    };

    function readCostForm() {
      return {
        id: $("editId").value || crypto.randomUUID(),
        code: $("code").value.trim(),
        sku: $("sku").value.trim(),
        name: $("name").value.trim(),
        purchase: Number($("purchase").value || 0),
        domestic: Number($("domestic").value || 0),
        firstFreight: Number($("firstFreight").value || 0),
        lastMile: Number($("lastMile").value || 0),
        rate: Number($("rate").value || 0),
        platform: $("platform").value
      };
    }

    function updateCostTotal() {
      const p = readCostForm();
      $("costTotal").textContent = `${rmb(totalRmb(p))} / ${rub(totalRub(p))}`;
    }

    window.editProduct = (id) => {
      const p = productById(id);
      if (!p) return;
      $("editId").value = p.id; $("code").value = p.code; $("sku").value = p.sku; $("name").value = p.name;
      $("purchase").value = p.purchase; $("domestic").value = p.domestic; $("firstFreight").value = p.firstFreight; $("lastMile").value = p.lastMile;
      $("rate").value = p.rate; $("platform").value = p.platform || "Ozon"; $("costFormTitle").textContent = "编辑产品成本";
      updateCostTotal();
      document.querySelector('[data-tab="costs"]').click();
    };

    window.deleteProduct = (id) => {
      if (!confirm("确认删除这个产品成本？")) return;
      products = products.filter((p) => p.id !== id);
      renderAll();
    };

    function resetCostForm() {
      $("costForm").reset();
      $("editId").value = "";
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
    $("costForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const p = readCostForm();
      const index = products.findIndex((item) => item.id === p.id);
      if (index >= 0) products[index] = p; else products.unshift(p);
      resetCostForm();
      renderAll();
    });
    $("resetCostForm").addEventListener("click", resetCostForm);
    $("costSearch").addEventListener("input", renderCosts);
    $("clearCosts").addEventListener("click", () => {
      if (!confirm("确认清空本地产品成本？")) return;
      products = [];
      renderAll();
    });
    $("exportCosts").addEventListener("click", () => {
      const headers = ["货号","SKU","产品名称","采购成本RMB","国内运费RMB","头程运费RMB","尾程操作费RMB","汇率","成本合计RMB","采购运费成本RUB"];
      const rows = products.map((p) => [p.code,p.sku,p.name,p.purchase,p.domestic,p.firstFreight,p.lastMile,p.rate,totalRmb(p),totalRub(p)]);
      const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n");
      download("ozon-wb-product-costs.csv", "\ufeff" + csv, "text/csv;charset=utf-8");
    });

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

    $("apiForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        name: $("apiName").value.trim(),
        platform: $("apiPlatform").value,
        secret: $("apiSecret").value
      };
      if (backendEnabled) {
        try {
          const created = await apiRequest("/api/integrations", {
            method: "POST",
            body: JSON.stringify(payload)
          });
          apiConfigs.unshift(created);
        } catch (error) {
          alert(error.message);
          return;
        }
      } else {
        apiConfigs.unshift({
          id: crypto.randomUUID(),
          ...payload,
          createdAt: new Date().toLocaleString("zh-CN")
        });
      }
      $("apiForm").reset();
      renderAll();
    });

    $("storeFilter").addEventListener("change", (event) => {
      selectedStore = event.target.value;
      renderDashboard();
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
      setOrderDate(button.dataset.date);
    });
    document.querySelectorAll("[data-range]").forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.range;
        const today = todayIso();
        if (value === "today") {
          orderDateFrom = today;
          orderDateTo = today;
        } else if (value === "yesterday") {
          orderDateFrom = addDays(today, -1);
          orderDateTo = addDays(today, -1);
        } else if (value === "quarter") {
          orderDateFrom = addDays(today, -89);
          orderDateTo = today;
        } else if (value === "year") {
          orderDateFrom = addDays(today, -364);
          orderDateTo = today;
        } else {
          orderDateFrom = addDays(today, -(Number(value) - 1));
          orderDateTo = today;
        }
        $("orderDateFrom").value = orderDateFrom;
        $("orderDateTo").value = orderDateTo;
        updateOrderDateButton();
        renderCalendar();
        $("orderDateRangePanel")?.classList.remove("open");
      });
    });

    async function bootstrap() {
      if ($("orderDateFrom")) $("orderDateFrom").value = orderDateFrom;
      if ($("orderDateTo")) $("orderDateTo").value = orderDateTo;
      updateOrderDateButton();
      renderCalendar();
      if (backendEnabled) {
        try {
          const [backendProducts, backendCompetitors, backendIntegrations] = await Promise.all([
            apiRequest("/api/products"),
            apiRequest("/api/competitors"),
            apiRequest("/api/integrations")
          ]);
          if (backendProducts.length) products = backendProducts;
          await loadBackendOrders();
          competitors = backendCompetitors;
          apiConfigs = backendIntegrations;
        } catch {
          apiConfigs = JSON.parse(localStorage.getItem(apiConfigKey) || "[]");
        }
      }
      resetCostForm();
      updateChartMenuText();
      renderAll();
    }

    bootstrap();
