/*
 * FreqDig
 * Copyright (c) 2026 Diggercat (挖煤猫)
 * SPDX-License-Identifier: MIT
 *
 * Tiny local static server for development.
 * It serves files from the repository root and can optionally open the browser.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const port = Number(args.find((arg) => /^\d+$/.test(arg))) || 8000;
const shouldOpenBrowser = args.includes("--open");
const host = "127.0.0.1";
const homeFile = "index.html";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const relativePath = urlPath === "/" ? homeFile : urlPath.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, filePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}/${homeFile}`;
  console.log(`Static server running at ${url}`);
  console.log("Press Ctrl+C to stop.");
  if (shouldOpenBrowser) openBrowser(url);
});

function openBrowser(url) {
  const command = process.platform === "win32"
    ? "cmd"
    : process.platform === "darwin"
      ? "open"
      : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", url]
    : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}
