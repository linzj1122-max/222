import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return /\.(?:js|mjs)$/.test(entry.name) ? [fullPath] : [];
  });
}

const sourceFiles = [
  ...walk(path.join(root, "functions")),
  ...walk(path.join(root, "scripts")).filter((file) => !file.includes(`${path.sep}vendor${path.sep}`)),
];

for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Syntax check failed: ${path.relative(root, file)}\n${result.stderr}`);
  }
}

const checks = [
  ["main", await import("../functions/api/[[path]].js"), "/api/health", "health", "GET", 200],
  ["listing", await import("../functions/api/listing/[[path]].js"), "/api/listing/health", "health", "GET", 200],
  ["ai-studio", await import("../functions/api/ai-studio/[[path]].js"), "/api/ai-studio/health", "health", "GET", 200],
  ["promotions", await import("../functions/api/promotions/[[path]].js"), "/api/promotions/health", "health", "GET", 200],
  ["ozon-ranking", await import("../functions/api/ozon-ranking/[[path]].js"), "/api/ozon-ranking/health", "health", "GET", 200],
  ["wb-listing", await import("../functions/api/wb-listing/[[path]].js"), "/api/wb-listing/stores", "stores", "GET", 200],
];

for (const [name, module, pathname, route, method, expectedStatus] of checks) {
  const response = await module.onRequest({
    request: new Request(`http://127.0.0.1${pathname}`, { method }),
    env: {},
    params: { path: route.split("/") },
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${name} returned HTTP ${response.status}; expected ${expectedStatus}`);
  }
}

const authEnv = {
  CREATOR_USERNAME: "smoke-test",
  CREATOR_PASSWORD: "smoke-test-password",
  AUTH_SESSION_SECRET: "smoke-test-session-secret-at-least-32-bytes",
};
const mainApi = await import("../functions/api/[[path]].js");
const loginResponse = await mainApi.onRequest({
  request: new Request("http://127.0.0.1/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: authEnv.CREATOR_USERNAME, password: authEnv.CREATOR_PASSWORD }),
  }),
  env: authEnv,
  params: { path: ["auth", "login"] },
});
const loginPayload = await loginResponse.json();
if (loginResponse.status !== 200 || !loginPayload.token) {
  throw new Error("Smoke-test login did not return a session token.");
}
const rankingApi = await import("../functions/api/ozon-ranking/[[path]].js");
function createMemoryKv() {
  const values = new Map();
  return {
    async get(key, type) {
      const value = values.get(key);
      if (value === undefined) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}

const rankingEnv = {
  ...authEnv,
  OZON_STORE_1_NAME: "Smoke Ozon",
  OZON_STORE_1_CLIENT_ID: "smoke-client-id",
  OZON_STORE_1_API_KEY: "smoke-api-key",
  LISTING_CACHE: createMemoryKv(),
};
const pairResponse = await rankingApi.onRequest({
  request: new Request("http://127.0.0.1/api/ozon-ranking/collector/pair", {
    method: "POST",
    headers: { authorization: `Bearer ${loginPayload.token}` },
  }),
  env: rankingEnv,
  params: { path: ["collector", "pair"] },
});
const pairPayload = await pairResponse.json();
if (pairResponse.status !== 200 || !pairPayload.token) {
  throw new Error("Ozon ranking collector pairing did not return a token.");
}

const keyword = "сыворотка для глаз";
const products = Array.from({ length: 12 }, (_, index) => ({
  rank: index + 1,
  productId: String(100000 + index),
  name: `Mock Ozon product ${index + 1}`,
  url: `https://www.ozon.ru/product/mock-${100000 + index}/`,
  brand: "Mock brand",
  price: 1000 + index,
  rating: 4.8,
  reviews: 100 + index,
  sales30: 300 - (index * 10),
  revenue30: 250000 + index,
}));

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.origin === "https://api-seller.ozon.ru" && url.pathname === "/v1/analytics/product-queries/details") {
    return new Response(JSON.stringify({
      analytics_period: { date_from: "2026-07-01", date_to: "2026-07-30" },
      queries: [{
        query: keyword,
        sku: 100005,
        position: 6,
        order_count: 22,
        gmv: 22000,
        currency: "RUB",
        unique_search_users: 12345,
        unique_view_users: 321,
        view_conversion: 0.026,
        query_index: 0.75,
      }],
      total: 1,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ error: "Mock route not found" }), { status: 404 });
};
try {
  const uploadResponse = await rankingApi.onRequest({
    request: new Request("http://127.0.0.1/api/ozon-ranking/collector/snapshot", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Collector ${pairPayload.token}`,
      },
      body: JSON.stringify({ keyword, productId: "100005", storeIndex: 0, products }),
    }),
    env: rankingEnv,
    params: { path: ["collector", "snapshot"] },
  });
  const uploadPayload = await uploadResponse.json();
  if (uploadResponse.status !== 200 || uploadPayload.resultCount !== 12 || uploadPayload.ownRank !== 6) {
    throw new Error("Ozon ranking collector did not store and normalize the browser snapshot correctly.");
  }

  const searchResponse = await rankingApi.onRequest({
    request: new Request("http://127.0.0.1/api/ozon-ranking/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${loginPayload.token}`,
      },
      body: JSON.stringify({ keyword, productId: "100005", storeIndex: 0 }),
    }),
    env: rankingEnv,
    params: { path: ["search"] },
  });
  const searchPayload = await searchResponse.json();
  if (searchResponse.status !== 200 || searchPayload.resultCount !== 12 || searchPayload.ownRank !== 6) {
    throw new Error("Ozon ranking API did not read the latest Chrome snapshot correctly.");
  }
  if (!searchPayload.thresholds.some((item) => item.targetRank === 10 && item.monthlyOrders > 0)) {
    throw new Error("Ozon ranking API did not calculate a Top 10 sales threshold.");
  }
  if (searchPayload.products.some((item, index, rows) => index > 0 && rows[index - 1].rank > item.rank)) {
    throw new Error("Ozon ranking API did not return products in ascending rank order.");
  }
  if (searchPayload.official.orders !== 22 || searchPayload.official.uniqueSearchUsers !== 12345) {
    throw new Error("Ozon ranking API did not merge Seller API keyword metrics.");
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`Smoke test passed: ${sourceFiles.length} source files and ${checks.length} route checks.`);
