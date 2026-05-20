"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

const apiRoutes = {
  "/api/scan": require("../api/scan.js"),
  "/api/state": require("../api/state.js"),
  "/api/user": require("../api/user.js"),
  "/api/admin/showdown": require("../api/admin/showdown.js"),
  "/api/admin/reset": require("../api/admin/reset.js"),
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const cleanPath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const filePath = path.normalize(path.join(ROOT, cleanPath));

  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    res.setHeader("content-type", mimeTypes[path.extname(filePath)] || "application/octet-stream");
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const handler = apiRoutes[requestUrl.pathname];

  if (handler) {
    void handler(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Camp Arcade local server: http://${HOST}:${PORT}`);
});
