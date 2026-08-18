/**
 * سرورِ لوکالِ رابطِ کاربری.
 *
 * قدمِ ۴ عمداً فقط «آینه» است: هیچ مسیری چیزی را عوض نمی‌کند، نمی‌نویسد، و
 * فرمانی اجرا نمی‌کند. فقط خروجیِ موتورِ تشخیص را نشان می‌دهد.
 *
 * دو نکتهٔ امنیتیِ عمدی:
 * - فقط به 127.0.0.1 گوش می‌دهد، نه 0.0.0.0. این سرور مسیرهای دلخواهِ
 *   فایل‌سیستم را می‌خواند؛ نباید از بیرونِ همین کامپیوتر قابلِ دسترس باشد.
 * - فقط یک فایلِ ثابت سِرو می‌شود (همان صفحه). هیچ سِروِ پوشه‌ای نیست، پس
 *   حملهٔ «../» معنا ندارد.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { probeProject } from "../core/detect.mjs";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");
export const DEFAULT_PORT = 4600;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function handleProbe(res, url) {
  const target = (url.searchParams.get("path") || "").trim();
  if (!target) {
    return sendJson(res, 400, { ok: false, error: "مسیرِ پوشه داده نشده." });
  }
  try {
    return sendJson(res, 200, { ok: true, probe: probeProject(target) });
  } catch (err) {
    // خواندنِ یک مسیرِ عجیب نباید کلِ سرور را بخواباند.
    return sendJson(res, 500, { ok: false, error: `خطا در بررسی: ${err.message}` });
  }
}

export function createApp() {
  return createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method !== "GET") {
      // قدمِ ۴ فقط-خواندنی است. هر چیزی جز GET، عمداً پذیرفته نمی‌شود.
      return sendJson(res, 405, { ok: false, error: "این سرور فقط GET می‌پذیرد." });
    }

    if (url.pathname === "/") {
      const html = readFileSync(join(PUBLIC_DIR, "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }

    if (url.pathname === "/api/probe") return handleProbe(res, url);

    return sendJson(res, 404, { ok: false, error: "مسیر پیدا نشد." });
  });
}

/** @returns {Promise<{ server: import("node:http").Server, port: number, url: string }>} */
export function startServer({ port = DEFAULT_PORT, host = "127.0.0.1" } = {}) {
  const server = createApp();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      resolve({ server, port: actual, url: `http://${host}:${actual}` });
    });
  });
}
