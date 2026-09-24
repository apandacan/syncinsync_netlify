const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "shared_state.json");

const { createBoard, normalizeState, defaultState } = require('./lib/board.cjs');

function loadState() {
  try { return normalizeState(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); }
  catch { return defaultState(); }
}

function saveState() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
}

let state = loadState();
const clients = new Set();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function broadcast() {
  const data = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) {
    if (client.destroyed || client.writableEnded) {
      clients.delete(client);
      continue;
    }
    try {
      client.write(data);
    } catch (err) {
      clients.delete(client);
      console.warn("Live-update client disconnected:", err.message);
    }
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function serveFile(reqPath, res) {
  const safePath = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const typeMap = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".pdf": "application/pdf",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    };

    res.writeHead(200, {
      "Content-Type": typeMap[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

async function handleUpdate(req, res) {
  let body;
  try { body = await parseBody(req); }
  catch { sendJson(res, 400, { error: 'Invalid JSON body' }); return; }
  const board = createBoard(state);
  const result = board.applyUpdate(body);
  if (result.status === 200 && body.action !== 'setSelectedPatient') {
    state = board.getState();
    saveState();
    broadcast();
  }
  sendJson(res, result.status, result.body);
}

const server = http.createServer(async (req, res) => {
  res.on("error", (err) => {
    clients.delete(res);
    console.warn("Response stream error:", err.message);
  });

  let urlObj;
  try {
    urlObj = new URL(req.url, `http://${req.headers.host}`);
  } catch (err) {
    sendJson(res, 400, { error: "Invalid request URL" });
    return;
  }

  if (req.method === 'GET' && urlObj.pathname === '/runtime-config') {
    sendJson(res, 200, { transport: 'sse' });
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
    });

    clients.add(res);
    res.write(`data: ${JSON.stringify(state)}\n\n`);

    const removeClient = () => clients.delete(res);
    req.on("close", removeClient);
    res.on("close", removeClient);
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/state") {
    sendJson(res, 200, state);
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/update") {
    const previousState = JSON.parse(JSON.stringify(state));
    try {
      await handleUpdate(req, res);
    } catch (err) {
      state = previousState;
      console.error("Update request failed:", err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Could not save the shared board. Please try again." });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
    return;
  }

  if (req.method === "GET") {
    serveFile(urlObj.pathname, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`InSync Roles Sync running on http://localhost:${server.address().port}`);
});
