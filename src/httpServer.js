const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { currentMonth, localDay } = require("./deviceTrafficStore");
const { surgeRequest } = require("./surgeApi");

function createServer({
  publicDir = path.join(process.cwd(), "public"),
  surgeRequestImpl = surgeRequest,
  deviceTrafficStore = null,
  now = () => new Date(),
} = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/local/devices/")) {
        await handleLocalDevices(req, res, { surgeRequestImpl, deviceTrafficStore, now });
        return;
      }

      if (req.url.startsWith("/api/surge/")) {
        await handleProxy(req, res, surgeRequestImpl);
        return;
      }

      if (req.url === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      await serveStatic(req, res, publicDir);
    } catch (error) {
      sendJson(res, error.status || 500, {
        error: error.message || "Internal server error",
        status: error.status || 500,
      });
    }
  });
}

async function handleLocalDevices(req, res, { surgeRequestImpl, deviceTrafficStore, now }) {
  if (!deviceTrafficStore) {
    sendJson(res, 503, { error: "Device traffic history is not configured", status: 503 });
    return;
  }

  const incomingUrl = new URL(req.url, "http://local.surge-dashboard");
  if (incomingUrl.pathname === "/api/local/devices/snapshot") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Only POST is supported", status: 405 });
      return;
    }

    const capturedAt = now();
    const payload = await surgeRequestImpl({
      baseUrl: req.headers["x-surge-base"],
      apiKey: req.headers["x-surge-key"],
      method: "GET",
      path: "/v1/devices",
    });
    const devices = Array.isArray(payload.devices) ? payload.devices : [];
    deviceTrafficStore.upsertDailyDevices({
      day: localDay(capturedAt),
      lastSeen: capturedAt.toISOString(),
      devices,
    });
    sendJson(res, 200, {
      ...payload,
      captured: true,
      day: localDay(capturedAt),
      month: currentMonth(capturedAt),
    });
    return;
  }

  if (incomingUrl.pathname === "/api/local/devices/monthly") {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Only GET is supported", status: 405 });
      return;
    }
    const month = incomingUrl.searchParams.get("month") || currentMonth(now());
    sendJson(res, 200, {
      month,
      devices: deviceTrafficStore.getMonthlySummary({ month }),
    });
    return;
  }

  sendJson(res, 404, { error: "Not found", status: 404 });
}

async function handleProxy(req, res, surgeRequestImpl) {
  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { error: "Only GET and POST are supported", status: 405 });
    return;
  }

  const incomingUrl = new URL(req.url, "http://local.surge-dashboard");
  const surgePath = incomingUrl.pathname.replace(/^\/api\/surge/, "");
  const query = Object.fromEntries(incomingUrl.searchParams.entries());
  const body = req.method === "POST" ? await readJsonBody(req) : undefined;

  const payload = await surgeRequestImpl({
    baseUrl: req.headers["x-surge-base"],
    apiKey: req.headers["x-surge-key"],
    method: req.method,
    path: surgePath,
    query,
    body,
  });

  sendJson(res, 200, payload);
}

async function serveStatic(req, res, publicDir) {
  if (!publicDir) {
    sendJson(res, 404, { error: "Not found", status: 404 });
    return;
  }

  const incomingUrl = new URL(req.url, "http://local.surge-dashboard");
  const requestPath = incomingUrl.pathname === "/" ? "/index.html" : incomingUrl.pathname;
  const decodedPath = decodeURIComponent(requestPath);
  const filePath = path.resolve(publicDir, `.${decodedPath}`);
  const rootPath = path.resolve(publicDir);

  if (!filePath.startsWith(`${rootPath}${path.sep}`) && filePath !== rootPath) {
    sendJson(res, 403, { error: "Forbidden", status: 403 });
    return;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      sendJson(res, 404, { error: "Not found", status: 404 });
      return;
    }
  } catch {
    sendJson(res, 404, { error: "Not found", status: 404 });
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(Object.assign(new Error("Request body is too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    }[ext] || "application/octet-stream"
  );
}

module.exports = {
  createServer,
};
