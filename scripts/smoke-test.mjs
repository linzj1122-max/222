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

console.log(`Smoke test passed: ${sourceFiles.length} source files and ${checks.length} route checks.`);
