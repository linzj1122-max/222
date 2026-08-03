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
const unconfiguredResponse = await rankingApi.onRequest({
  request: new Request("http://127.0.0.1/api/ozon-ranking/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${loginPayload.token}`,
    },
    body: JSON.stringify({ keyword: "сыворотка для глаз", limit: 100 }),
  }),
  env: authEnv,
  params: { path: ["search"] },
});
const unconfiguredPayload = await unconfiguredResponse.json();
if (unconfiguredResponse.status !== 503 || unconfiguredPayload.code !== "DATA_SOURCE_NOT_CONFIGURED") {
  throw new Error("Ozon ranking API must fail clearly when MPSTATS_API_TOKEN is not configured.");
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith("/items")) {
    return new Response(JSON.stringify({
      total: 12,
      data: Array.from({ length: 12 }, (_, index) => ({
        id: 100000 + index,
        name: `Mock Ozon product ${index + 1}`,
        thumb: `https://example.test/${index + 1}.jpg`,
      })),
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  const detailMatch = url.pathname.match(/\/items\/(\d+)\/full$/);
  if (detailMatch) {
    const id = Number(detailMatch[1]);
    const rank = id - 99999;
    return new Response(JSON.stringify({
      id,
      name: `Mock Ozon product ${rank}`,
      link: `https://www.ozon.ru/context/detail/id/${id}/`,
      price: { final_price: 99900 + rank * 100 },
      rating: 4.8,
      comments: 100 + rank,
      seller: { name: "Mock seller" },
      period_stats: { sales: 300 - rank * 10, revenue: 2500000 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (/\/items\/\d+\/keywords$/.test(url.pathname)) {
    return new Response(JSON.stringify([{ query: "сыворотка для глаз", avg_position: 6, positions: [6] }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.pathname.endsWith("/keywords/frequency")) {
    return new Response(JSON.stringify([{ date: "2026-08-02", frequency: 12345 }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ error: "Mock route not found" }), { status: 404 });
};
try {
  const configuredResponse = await rankingApi.onRequest({
    request: new Request("http://127.0.0.1/api/ozon-ranking/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${loginPayload.token}`,
      },
      body: JSON.stringify({ keyword: "сыворотка для глаз", productId: "100005", limit: 100, days: 30 }),
    }),
    env: { ...authEnv, MPSTATS_API_TOKEN: "mock-token", MPSTATS_BASE_URL: "https://mpstats.example.test/api" },
    params: { path: ["search"] },
  });
  const configuredPayload = await configuredResponse.json();
  if (configuredResponse.status !== 200 || configuredPayload.resultCount !== 12 || configuredPayload.ownRank !== 6) {
    throw new Error("Ozon ranking API did not normalize the mocked Top 100 response correctly.");
  }
  if (!configuredPayload.thresholds.some((item) => item.targetRank === 10 && item.monthlyOrders > 0)) {
    throw new Error("Ozon ranking API did not calculate a Top 10 sales threshold.");
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`Smoke test passed: ${sourceFiles.length} source files and ${checks.length} route checks.`);
