"use strict";

  const PRODUCT_LIMIT = 50;
  const CONCURRENCY = 5;
  const PRODUCT_TIMEOUT_MS = 12000;
  const UPLOAD_TIMEOUT_MS = 30000;

  function safeOzonUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && /(^|\.)ozon\.ru$/i.test(url.hostname) ? url.toString() : "";
    } catch {
      return "";
    }
  }

  function decodeSource(value) {
    return String(value || "")
      .replace(/\\u0023/gi, "#")
      .replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, "&")
      .replace(/&#(?:x23|35);/gi, "#");
  }

  function cleanBrand(value) {
    return String(value || "").replace(/<[^>]+>/g, " ").replace(/\\[nrt]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function addBrand(target, value) {
    const brand = cleanBrand(value);
    if (!brand || /^(?:нет бренда|no brand|без бренда)$/i.test(brand)) return;
    const key = brand.toLocaleLowerCase("ru-RU");
    if (!target.has(key)) target.set(key, brand);
  }

  function collectJsonLdBrands(node, target) {
    if (Array.isArray(node)) {
      node.forEach((item) => collectJsonLdBrands(item, target));
      return;
    }
    if (!node || typeof node !== "object") return;
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.some((type) => String(type || "").toLowerCase() === "product")) {
      const brand = node.brand;
      if (typeof brand === "string") addBrand(target, brand);
      else if (brand && typeof brand === "object") addBrand(target, brand.name);
    }
    if (node["@graph"]) collectJsonLdBrands(node["@graph"], target);
  }

  function extractMainBrands(source) {
    const brands = new Map();
    const scripts = source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of scripts) {
      try { collectJsonLdBrands(JSON.parse(match[1]), brands); } catch { /* malformed structured data */ }
    }
    if (!brands.size) {
      const metaPatterns = [
        /<meta\b[^>]*(?:itemprop|property)=["']brand["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
        /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:itemprop|property)=["']brand["'][^>]*>/gi,
      ];
      metaPatterns.forEach((pattern) => {
        for (const match of source.matchAll(pattern)) addBrand(brands, match[1]);
      });
    }
    if (!brands.size) {
      const direct = source.match(/"brandName"\s*:\s*"([^"\\]{1,120})"/i);
      if (direct) addBrand(brands, direct[1]);
    }
    return Array.from(brands.values()).slice(0, 8);
  }

  function extractBlueTagBlock(source) {
    const headings = Array.from(source.matchAll(/Характеристики(?:\s+товара)?/gi));
    const candidates = [];
    headings.forEach((heading) => {
      const end = Number(heading.index || 0);
      const start = Math.max(0, end - 30000);
      const window = source.slice(start, end);
      const matches = Array.from(window.matchAll(/#[\p{L}\p{N}_]{2,80}/gu));
      if (!matches.length) return;
      const clusters = [];
      matches.forEach((match) => {
        const position = start + Number(match.index || 0);
        const previous = clusters[clusters.length - 1];
        if (!previous || position - previous.lastPosition > 2500) {
          clusters.push({ tags: [match[0]], lastPosition: position });
        } else {
          previous.tags.push(match[0]);
          previous.lastPosition = position;
        }
      });
      const nearest = clusters[clusters.length - 1];
      if (nearest && end - nearest.lastPosition <= 12000) candidates.push(...nearest.tags);
    });
    const unique = new Map();
    candidates.forEach((raw) => {
      const tag = raw.replace(/[_.]+$/g, "");
      if (/^#[0-9a-f]{3,8}$/i.test(tag)) return;
      const key = tag.toLocaleLowerCase("ru-RU");
      if (!unique.has(key)) unique.set(key, tag);
    });
    return Array.from(unique.values()).slice(0, 300);
  }

  function brandParts(value) {
    return String(value || "").toLocaleLowerCase("ru-RU").match(/[\p{L}\p{N}]+/gu) || [];
  }

  function isBrandTag(tag, brands) {
    const tagParts = brandParts(String(tag || "").replace(/^#/, ""));
    const tagCompact = tagParts.join("");
    if (!tagCompact) return false;
    return brands.some((brand) => {
      const parts = brandParts(brand);
      const compact = parts.join("");
      if (compact.length < 2) return false;
      return tagParts.includes(compact) || tagCompact === compact || (parts.length > 1 && tagCompact.includes(compact));
    });
  }

  function extractProductTags(html) {
    const source = decodeSource(html);
    const brands = extractMainBrands(source);
    const found = extractBlueTagBlock(source);
    const excludedBrandTags = found.filter((tag) => isBrandTag(tag, brands));
    const excluded = new Set(excludedBrandTags.map((tag) => tag.toLocaleLowerCase("ru-RU")));
    return {
      brands,
      tags: found.filter((tag) => !excluded.has(tag.toLocaleLowerCase("ru-RU"))),
      excludedBrandTags,
    };
  }

  async function fetchProduct(product) {
    const url = safeOzonUrl(product?.url);
    if (!url) return { ...product, tags: [], brands: [], excludedBrandTags: [], error: "商品链接无效" };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRODUCT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "include",
        headers: { "accept-language": "ru-RU,ru;q=0.9" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { ...product, url, ...extractProductTags(await response.text()) };
    } catch (error) {
      return {
        ...product,
        url,
        tags: [],
        brands: [],
        excludedBrandTags: [],
        error: error?.name === "AbortError" ? "读取超时" : error?.message || String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchProducts(products) {
    const queue = (Array.isArray(products) ? products : []).slice(0, PRODUCT_LIMIT);
    const results = new Array(queue.length);
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fetchProduct(queue[index]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    return results;
  }

  async function upload(endpoint, token, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Collector ${token}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `控制中心返回 HTTP ${response.status}`);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

if (globalThis.chrome?.runtime?.onMessage) chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "OZON_HASHTAG_FETCH_PRODUCTS") {
      fetchProducts(message.products)
        .then((items) => sendResponse({ ok: true, items }))
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }
    if (message?.type === "OZON_HASHTAG_UPLOAD") {
      upload(message.endpoint, message.token, message.payload)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) => sendResponse({ ok: false, error: error?.name === "AbortError" ? "连接控制中心超时" : error.message || String(error) }));
      return true;
    }
    return false;
  });

export { extractProductTags, isBrandTag };
