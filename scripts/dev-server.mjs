import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8787);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function createMemoryKv() {
  const store = new Map();
  return {
    async get(key, type = "text") {
      if (!store.has(key)) return null;
      const value = store.get(key);
      if (type === "json") {
        try { return JSON.parse(value); } catch { return null; }
      }
      return value;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

const env = { ...process.env, LISTING_CACHE: createMemoryKv() };

const routeModules = [
  {
    prefix: "/api/listing/",
    modulePath: path.join(root, "functions", "api", "listing", "[[path]].js"),
    params(urlPath) {
      return { path: urlPath.slice("/api/listing/".length).split("/").filter(Boolean) };
    },
  },
  {
    prefix: "/api/ai-studio/",
    modulePath: path.join(root, "functions", "api", "ai-studio", "[[path]].js"),
    params(urlPath) {
      return { path: urlPath.slice("/api/ai-studio/".length).split("/").filter(Boolean) };
    },
  },
  {
    prefix: "/api/promotions/",
    modulePath: path.join(root, "functions", "api", "promotions", "[[path]].js"),
    params(urlPath) {
      return { path: urlPath.slice("/api/promotions/".length).split("/").filter(Boolean) };
    },
  },
  {
    prefix: "/api/",
    modulePath: path.join(root, "functions", "api", "[[path]].js"),
    params(urlPath) {
      return { path: urlPath.slice("/api/".length).split("/").filter(Boolean) };
    },
  },
];

async function handleApi(req, url) {
  const route = routeModules.find((item) => url.pathname.startsWith(item.prefix));
  if (!route) return jsonResponse({ ok: false, error: "API route not found" }, 404);
  const mod = await import(pathToFileURL(route.modulePath).href + `?t=${Date.now()}`);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(url.href, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : body,
  });
  return mod.onRequest({ request, env, params: route.params(url.pathname) });
}

async function serveStatic(url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(root, pathname));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const data = await readFile(filePath);
  return new Response(data, {
    headers: { "content-type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" },
  });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${port}`}`);
    const response = url.pathname.startsWith("/api/")
      ? await handleApi(req, url)
      : await serveStatic(url);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    const body = JSON.stringify({ ok: false, error: error.message || String(error) });
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(body);
  }
}).listen(port, () => {
  console.log(`Local app with API: http://127.0.0.1:${port}`);
});
