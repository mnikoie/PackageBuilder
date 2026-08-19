/**
 * سرورِ لوکالِ رابطِ کاربری.
 *
 * ---- امنیت: چرا این‌قدر سخت‌گیری ----
 * از قدمِ ۵ به بعد این سرور یک قابلیتِ خطرناک دارد: اجرای فرمان در یک
 * پاورشلِ واقعی. یعنی هر کسی که بتواند به آن درخواست بفرستد، می‌تواند روی این
 * کامپیوتر هر کاری بکند.
 *
 * و «فقط لوکال است» کافی نیست: هر صفحهٔ وبی که در مرورگرت باز باشد می‌تواند
 * به http://127.0.0.1:4600 درخواست بفرستد. نسخهٔ قبلیِ این ابزار مسیرِ
 * `GET /run?command=...` داشت بدونِ هیچ محافظتی — یعنی یک تبِ مخرب می‌توانست
 * با یک <img> ساده فرمان اجرا کند.
 *
 * پس چهار لایه:
 *   ۱. فقط 127.0.0.1 (نه 0.0.0.0) — از شبکه در دسترس نیست.
 *   ۲. اجرای فرمان فقط با POST — تا با <img> و <link> و لینکِ ساده نشود.
 *   ۳. توکنِ تصادفیِ هر بار اجرا، که فقط داخلِ همان صفحه‌ای است که خودمان
 *      سِرو می‌کنیم. صفحهٔ بیگانه آن را نمی‌داند (Same-Origin جلوی خواندنش را
 *      می‌گیرد).
 *   ۴. بررسیِ Origin — درخواستِ آمده از هر مبدأِ دیگری رد می‌شود.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import pty from "node-pty";

import { probeProject } from "../core/detect.mjs";
import { scaffoldProject } from "../core/scaffold.mjs";
import { resolveRegistry } from "../core/resolve.mjs";
import { validateRegistry } from "../core/registry.mjs";
import { applyTechnology, revertTechnology } from "../core/apply.mjs";
import { createTerminal } from "./terminal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "public");
const NODE_MODULES = join(HERE, "..", "..", "node_modules");

export const DEFAULT_PORT = 4600;

/**
 * زمانِ آخرین تغییرِ رجیستری، در برابرِ لحظه‌ای که سرور بالا آمد.
 *
 * چرا لازم است: Node ماژول‌ها را یک‌بار می‌خواند و در حافظه نگه می‌دارد. اگر
 * ردیفِ نویی به رجیستری اضافه شود، سرورِ در حالِ اجرا آن را **نمی‌بیند** و
 * صفحه بی‌آنکه کسی بفهمد نسخهٔ کهنه را نشان می‌دهد. این دو بار در عمل پیش آمد
 * و هر دو بار وقت گرفت تا معلوم شود گزینه گم نشده، سرور کهنه است.
 *
 * پس به‌جای سکوت، صریح گزارش می‌شود و UI هشدار می‌دهد.
 */
const REGISTRY_FILE = fileURLToPath(new URL("../core/registry.mjs", import.meta.url));
const SERVER_STARTED_AT = Date.now();

export function registryFreshness() {
  try {
    const changedAt = statSync(REGISTRY_FILE).mtimeMs;
    return { stale: changedAt > SERVER_STARTED_AT, changedAt, startedAt: SERVER_STARTED_AT };
  } catch {
    return { stale: false, changedAt: null, startedAt: SERVER_STARTED_AT };
  }
}


/**
 * فایل‌های کتابخانه‌ای که سِرو می‌شوند — فهرستِ سفیدِ صریح، نه سِروِ پوشه.
 * پس حملهٔ «../» اصلاً معنا ندارد.
 */
const VENDOR = {
  "/vendor/xterm.js": join(NODE_MODULES, "@xterm/xterm/lib/xterm.js"),
  "/vendor/xterm.css": join(NODE_MODULES, "@xterm/xterm/css/xterm.css"),
  "/vendor/addon-fit.js": join(NODE_MODULES, "@xterm/addon-fit/lib/addon-fit.js"),
};
const MIME = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

/** مقایسهٔ توکن در زمانِ ثابت، تا از روی زمانِ پاسخ نشود حدسش زد. */
function tokenMatches(expected, given) {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/**
 * بدنهٔ JSON، با سقفِ حجم تا حافظه پر نشود.
 *
 * وقتی از حد رد شد، سوکت را نمی‌بندیم — بقیه‌اش را می‌ریزیم دور و پاسخِ ۴۱۳
 * می‌دهیم. اگر سوکت را می‌بستیم، طرفِ مقابل به‌جای پیامِ روشن، خطای مبهمِ
 * ECONNRESET می‌گرفت.
 *
 * ولی بی‌نهایت هم صبر نمی‌کنیم: بعدِ چند برابرِ سقف، اتصال قطع می‌شود.
 */
function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const hardLimit = limit * 20;
    let size = 0;
    let tooLarge = false;
    const chunks = [];

    req.on("data", (c) => {
      size += c.length;
      if (size > hardLimit) {
        req.destroy();
        return;
      }
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0; // چیزی که از حد گذشته را نگه نمی‌داریم
        return;
      }
      chunks.push(c);
    });

    req.on("end", () => {
      if (tooLarge) {
        const err = new Error("بدنهٔ درخواست بیش از حد بزرگ است.");
        err.status = 413;
        return reject(err);
      }
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(new Error(`JSONِ نامعتبر: ${err.message}`));
      }
    });
    req.on("error", reject);
  });
}

export function createApp({ host = "127.0.0.1", port = DEFAULT_PORT, terminal } = {}) {
  const token = randomBytes(24).toString("hex");
  const term = terminal ?? createTerminal({ pty });

  /**
   * مبدأ فقط وقتی پذیرفته می‌شود که با میزبانِ خودِ همین درخواست یکی باشد.
   * (مقایسه با Host، نه با یک پورتِ ثابت — چون پورت می‌تواند در زمانِ اجرا
   * عوض شود، مثلاً پورتِ صفر در تست.)
   *
   * درخواستِ بدونِ Origin پذیرفته می‌شود (مثلِ curl یا خودِ خط‌فرمان)؛ محافظتِ
   * اصلی توکن است، و این لایه فقط دفاعِ اضافه در برابرِ صفحهٔ مرورگرِ بیگانه است.
   */
  function originAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true;

    let originHost;
    try { originHost = new URL(origin).host; } catch { return false; }

    const reqHost = req.headers.host || "";
    if (originHost === reqHost) return true;

    // localhost و 127.0.0.1 روی همان پورت، یک چیزند.
    const samePort = originHost.split(":")[1] === reqHost.split(":")[1];
    const localNames = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return samePort
      && localNames.has(originHost.split(":")[0])
      && localNames.has(reqHost.split(":")[0]);
  }

  async function handleRun(req, res) {
    if (!originAllowed(req)) {
      return sendJson(res, 403, { ok: false, error: "مبدأِ درخواست پذیرفته نشد." });
    }
    if (!tokenMatches(token, req.headers["x-pb-token"])) {
      return sendJson(res, 401, { ok: false, error: "توکن نامعتبر است." });
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, err.status || 400, { ok: false, error: err.message });
    }

    const command = typeof body.command === "string" ? body.command.trim() : "";
    if (!command) return sendJson(res, 400, { ok: false, error: "فرمانی داده نشد." });

    const stepId = "s" + randomBytes(8).toString("hex");
    try {
      term.run(command, stepId);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
    return sendJson(res, 200, { ok: true, stepId });
  }

  /**
   * اعمال یا برگشتِ یک تصمیم، از خودِ صفحه.
   *
   * همان محافظت‌های /api/run: فقط POST، توکنِ صفحه، و بررسیِ مبدأ. چون این هم
   * فرمانِ واقعی روی این کامپیوتر اجرا می‌کند.
   */
  async function handleDecision(req, res, kind) {
    if (!originAllowed(req)) return sendJson(res, 403, { ok: false, error: "مبدأِ درخواست پذیرفته نشد." });
    if (!tokenMatches(token, req.headers["x-pb-token"])) {
      return sendJson(res, 401, { ok: false, error: "توکن نامعتبر است." });
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, err.status || 400, { ok: false, error: err.message });
    }

    const projectPath = typeof body.path === "string" ? body.path.trim() : "";
    const techId = typeof body.tech === "string" ? body.tech.trim() : "";
    if (!projectPath || !techId) return sendJson(res, 400, { ok: false, error: "مسیر و شناسهٔ تکنولوژی لازم است." });

    try {
      const result = kind === "apply"
        ? await applyTechnology({ projectPath, techId, terminal: term, dryRun: !!body.dryRun })
        : await revertTechnology({ projectPath, techId, terminal: term });
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: `خطای غیرمنتظره: ${err.message}` });
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${host}:${port}`);

    if (req.method === "POST" && url.pathname === "/api/run") return handleRun(req, res);
    if (req.method === "POST" && url.pathname === "/api/new") return handleNew(req, res);
    if (req.method === "POST" && url.pathname === "/api/apply") return handleDecision(req, res, "apply");
    if (req.method === "POST" && url.pathname === "/api/revert") return handleDecision(req, res, "revert");

    if (req.method !== "GET") {
      return sendJson(res, 405, { ok: false, error: "متد پذیرفته نشد." });
    }

    if (url.pathname === "/") {
      // توکن داخلِ همان صفحه تزریق می‌شود. صفحهٔ بیگانه نمی‌تواند بخواندش،
      // چون Same-Origin Policy جلویش را می‌گیرد.
      const html = readFileSync(join(PUBLIC_DIR, "index.html"), "utf8")
        .replace("__PB_TOKEN__", token);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }

    if (VENDOR[url.pathname]) {
      const file = VENDOR[url.pathname];
      if (!existsSync(file)) return sendJson(res, 500, { ok: false, error: "فایلِ کتابخانه پیدا نشد." });
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      return res.end(readFileSync(file));
    }

    if (url.pathname === "/api/probe") {
      const target = (url.searchParams.get("path") || "").trim();
      if (!target) return sendJson(res, 400, { ok: false, error: "مسیرِ پوشه داده نشده." });
      try {
        return sendJson(res, 200, { ok: true, probe: probeProject(target) });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: `خطا در بررسی: ${err.message}` });
      }
    }

    if (url.pathname === "/api/stack") {
      const target = (url.searchParams.get("path") || "").trim();
      if (!target) return sendJson(res, 400, { ok: false, error: "مسیرِ پوشه داده نشده." });
      const problems = validateRegistry();
      if (problems.length) return sendJson(res, 500, { ok: false, error: `رجیستری ایراد دارد: ${problems[0]}` });
      try {
        const probe = probeProject(target);
        if (!probe.exists || !probe.isDirectory) return sendJson(res, 200, { ok: false, error: probe.error });
        const lang = url.searchParams.get("lang") === "en" ? "en" : "fa";
        return sendJson(res, 200, { ok: true, stack: resolveRegistry(probe.path, { probe, lang }), freshness: registryFreshness() });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: `خطا در بررسی: ${err.message}` });
      }
    }

    if (url.pathname === "/api/terminal-info") {
      return sendJson(res, 200, { ok: true, shell: term.shell(), alive: term.isAlive() });
    }

    return sendJson(res, 404, { ok: false, error: "مسیر پیدا نشد." });
  });

  // ---- پُلِ WebSocket بینِ ترمینالِ واقعی و مرورگر ----
  // noServer است تا خودمان قبلِ ارتقا، توکن و مبدأ را بررسی کنیم.
  /**
   * ساختِ اسکلتِ پروژهٔ نو — همان کاری که فرمانِ `new` می‌کند.
   *
   * تا پیش از این فقط در خط‌فرمان ممکن بود، و کاربر در UI راهی نداشت جز
   * اینکه پوشه‌ای دستی بسازد و مستقیم پکیج نصب کند — یعنی پروژه‌ای بی
   * project.config.json و بی گیت، که بعد ابزار درست می‌گفت «ساختهٔ
   * PackageBuilder نیست» و کاربر گیج می‌شد.
   */
  async function handleNew(req, res) {
    let body;
    try { body = await readJsonBody(req); } catch (err) { return sendJson(res, 400, { ok: false, error: err.message }); }

    const target = String(body.path || "").trim();
    if (!target) return sendJson(res, 400, { ok: false, error: "مسیرِ پوشه داده نشده." });

    try {
      const result = scaffoldProject({
        targetPath: target,
        displayName: body.name ? String(body.name) : undefined,
        slug: body.slug ? String(body.slug) : undefined,
        dryRun: false,
        initGit: body.initGit !== false,
      });
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: `ساخته نشد: ${err.message}` });
    }
  }

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, `http://${host}:${port}`);
    const bad = (reason) => {
      socket.write(`HTTP/1.1 401 Unauthorized\r\n\r\n${reason}`);
      socket.destroy();
    };
    if (url.pathname !== "/pty") return bad("مسیر نامعتبر");
    if (!originAllowed(req)) return bad("مبدأ پذیرفته نشد");
    if (!tokenMatches(token, url.searchParams.get("token"))) return bad("توکن نامعتبر");

    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      term.ensure();

      ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.type === "input" && typeof msg.data === "string") term.write(msg.data);
        else if (msg.type === "resize") term.resize(msg.cols, msg.rows);
      });
      ws.on("close", () => clients.delete(ws));
      ws.on("error", () => clients.delete(ws));
    });
  });

  const broadcast = (msg) => {
    const payload = JSON.stringify(msg);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(payload);
  };

  const unsubData = term.onData((data) => broadcast({ type: "data", data }));
  const unsubStep = term.onStepResult((r) => broadcast({ type: "stepResult", ...r }));

  const origClose = server.close.bind(server);
  server.close = (cb) => {
    unsubData();
    unsubStep();
    for (const ws of clients) { try { ws.close(); } catch { /* بسته بود */ } }
    clients.clear();
    wss.close();
    if (!terminal) term.dispose(); // اگر ترمینال را خودمان ساختیم، خودمان هم می‌بندیم
    return origClose(cb);
  };

  return { server, token, terminal: term };
}

/** @returns {Promise<{ server: import("node:http").Server, port: number, url: string, token: string }>} */
export function startServer({ port = DEFAULT_PORT, host = "127.0.0.1", terminal } = {}) {
  const { server, token, terminal: term } = createApp({ host, port, terminal });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      resolve({ server, port: actual, url: `http://${host}:${actual}`, token, terminal: term });
    });
  });
}
