/**
 * تست‌های سرورِ رابطِ کاربری.
 *
 * سرورِ واقعی روی یک پورتِ آزاد بالا می‌آید و با fetchِ خودِ Node صدا زده
 * می‌شود — بدونِ مرورگر و بدونِ هیچ وابستگی. پورت صفر داده می‌شود تا
 * سیستم‌عامل یک پورتِ آزاد بدهد و تست‌ها با سرورِ در حالِ اجرا تصادم نکنند.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startServer } from "../src/server/server.mjs";
import { scaffoldProject } from "../src/core/scaffold.mjs";

let server, base, sandbox, scaffolded, token, terminal;

/**
 * ترمینالِ تقلبی: تست‌های این فایل دربارهٔ سرور و امنیتش هستند، نه دربارهٔ
 * خودِ ترمینال (آن در terminal.test.mjs با پاورشلِ واقعی تست شده). با تقلبی،
 * این تست‌ها سریع و قطعی می‌مانند.
 */
function fakeTerminal() {
  const calls = [];
  const dataSubs = new Set();
  const stepSubs = new Set();
  return {
    calls,
    ensure: () => {},
    isAlive: () => true,
    shell: () => "fake-shell",
    pendingSteps: () => [],
    onData(cb) { dataSubs.add(cb); return () => dataSubs.delete(cb); },
    onStepResult(cb) { stepSubs.add(cb); return () => stepSubs.delete(cb); },
    onExit() { return () => {}; },
    write: (d) => calls.push(["write", d]),
    resize: (c, r) => calls.push(["resize", c, r]),
    run(command, stepId) {
      if (/[\r\n]/.test(command)) throw new Error("فرمانِ چندخطی مجاز نیست.");
      calls.push(["run", command, stepId]);
      return stepId;
    },
    killShell: () => true,
    dispose: () => calls.push(["dispose"]),
    emitStep: (r) => { for (const cb of stepSubs) cb(r); },
  };
}

before(async () => {
  sandbox = mkdtempSync(join(tmpdir(), "pb-server-"));
  scaffolded = join(sandbox, "a-project");
  scaffoldProject({ targetPath: scaffolded, displayName: "A Project", initGit: false });

  terminal = fakeTerminal();
  const started = await startServer({ port: 0, terminal });
  server = started.server;
  base = started.url;
  token = started.token;
});

after(() => {
  server?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

const runReq = (body, headers = {}) =>
  fetch(base + "/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const get = (path) => fetch(base + path);
const getJson = async (path) => {
  const res = await get(path);
  return { status: res.status, body: await res.json() };
};

describe("سرور — صفحه", () => {
  test("صفحهٔ اصلی HTML می‌دهد", async () => {
    const res = await get("/");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    const html = await res.text();
    assert.match(html, /<html lang="fa" dir="rtl">/);
  });

  test("صفحه هر سه حالت را در راهنما توضیح می‌دهد", async () => {
    const html = await (await get("/")).text();
    for (const word of ["هست", "نیست", "نامعلوم"]) {
      assert.ok(html.includes(word), `«${word}» در صفحه نیست`);
    }
  });

  test("مسیرِ ناشناخته ۴۰۴ می‌دهد", async () => {
    const { status, body } = await getJson("/چیزی-که-نیست");
    assert.equal(status, 404);
    assert.equal(body.ok, false);
  });

  test("متدهای دیگر روی مسیرهای خواندنی رد می‌شوند", async () => {
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const res = await fetch(base + "/api/probe?path=.", { method });
      assert.equal(res.status, 405, `${method} باید رد شود`);
    }
  });

  test("توکن داخلِ صفحه تزریق می‌شود و جای‌گیرِ خامی نمی‌ماند", async () => {
    const html = await (await get("/")).text();
    assert.ok(!html.includes("__PB_TOKEN__"), "جای‌گیرِ توکن پر نشده");
    assert.ok(html.includes(token), "توکن در صفحه نیست");
  });

  test("فایل‌های کتابخانه‌ای سِرو می‌شوند", async () => {
    for (const [path, type] of [["/vendor/xterm.js", /javascript/], ["/vendor/xterm.css", /css/], ["/vendor/addon-fit.js", /javascript/]]) {
      const res = await get(path);
      assert.equal(res.status, 200, `${path} سِرو نشد`);
      assert.match(res.headers.get("content-type"), type);
    }
  });

  test("مسیرِ فایلِ کتابخانه‌ایِ خارج از فهرستِ سفید سِرو نمی‌شود", async () => {
    // فهرستِ سفیدِ صریح داریم، پس «../» اصلاً معنا ندارد — ولی صریح تستش می‌کنیم.
    for (const attack of ["/vendor/../../package.json", "/vendor/ws/index.js", "/vendor/anything.js"]) {
      const res = await get(attack);
      assert.ok(res.status === 404 || res.status === 400, `${attack} باید رد شود، ولی ${res.status} داد`);
    }
  });
});

// ---------------------------------------------------------------------------
// امنیت: اجرای فرمان یعنی دسترسیِ کامل به این کامپیوتر. «فقط لوکال است» کافی
// نیست، چون هر تبِ مرورگر می‌تواند به 127.0.0.1 درخواست بفرستد. نسخهٔ قبلیِ
// ابزار GET /run?command=... داشت، بی هیچ محافظتی.
// ---------------------------------------------------------------------------
describe("امنیتِ اجرای فرمان", () => {
  test("بدونِ توکن، اجرا نمی‌شود", async () => {
    const before = terminal.calls.length;
    const res = await runReq({ command: "Write-Host hi" });
    assert.equal(res.status, 401);
    assert.equal(terminal.calls.length, before, "هیچ فرمانی نباید اجرا شده باشد");
  });

  test("با توکنِ غلط، اجرا نمی‌شود", async () => {
    const before = terminal.calls.length;
    for (const bad of ["", "x", "0".repeat(48), token.slice(0, -1) + "0"]) {
      const res = await runReq({ command: "Write-Host hi" }, { "x-pb-token": bad });
      assert.equal(res.status, 401, `توکنِ «${bad.slice(0, 8)}…» نباید پذیرفته شود`);
    }
    assert.equal(terminal.calls.length, before);
  });

  test("با GET نمی‌شود فرمان اجرا کرد (جلوگیری از حملهٔ <img>)", async () => {
    const before = terminal.calls.length;
    const res = await get("/api/run?command=" + encodeURIComponent("Write-Host hi"));
    assert.ok(res.status === 404 || res.status === 405, `GET باید رد شود، ولی ${res.status} داد`);
    assert.equal(terminal.calls.length, before);
  });

  test("مبدأِ بیگانه رد می‌شود، حتی با توکنِ درست", async () => {
    const before = terminal.calls.length;
    const res = await runReq(
      { command: "Write-Host hi" },
      { "x-pb-token": token, Origin: "http://evil.example.com" },
    );
    assert.equal(res.status, 403);
    assert.equal(terminal.calls.length, before);
  });

  test("مبدأِ خودمان پذیرفته می‌شود", async () => {
    const res = await runReq({ command: "Write-Host ok" }, { "x-pb-token": token, Origin: base });
    assert.equal(res.status, 200);
  });

  test("با توکنِ درست، فرمان واقعاً به ترمینال می‌رسد", async () => {
    const res = await runReq({ command: "Write-Host سلام" }, { "x-pb-token": token });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.ok);
    assert.match(body.stepId, /^s[0-9a-f]{16}$/);

    const last = terminal.calls.at(-1);
    assert.equal(last[0], "run");
    assert.equal(last[1], "Write-Host سلام");
    assert.equal(last[2], body.stepId);
  });

  test("شناسهٔ مرحله هر بار تازه و تصادفی است", async () => {
    const ids = new Set();
    for (let i = 0; i < 5; i++) {
      const r = await runReq({ command: "Write-Host x" }, { "x-pb-token": token });
      ids.add((await r.json()).stepId);
    }
    assert.equal(ids.size, 5, "شناسه‌ها باید یکتا باشند");
  });

  test("فرمانِ خالی رد می‌شود", async () => {
    for (const command of ["", "   ", undefined, 42, null]) {
      const res = await runReq({ command }, { "x-pb-token": token });
      assert.equal(res.status, 400, `«${command}» باید رد شود`);
    }
  });

  test("بدنهٔ نامعتبر یا حجیم، سرور را نمی‌خواباند", async () => {
    const bad = await runReq("{این JSON نیست", { "x-pb-token": token });
    assert.equal(bad.status, 400);

    const huge = await runReq({ command: "x".repeat(200 * 1024) }, { "x-pb-token": token });
    assert.ok(huge.status >= 400, "بدنهٔ حجیم باید رد شود");

    // سرور باید هنوز سالم باشد
    const ok = await get("/api/terminal-info");
    assert.equal(ok.status, 200);
  });

  test("خطای ترمینال به‌صورتِ ۴۰۰ برمی‌گردد، نه فروپاشی", async () => {
    const res = await runReq({ command: "line1\nline2" }, { "x-pb-token": token });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });
});

describe("سرور — /api/terminal-info", () => {
  test("پوسته و وضعیتِ زنده‌بودن را می‌دهد", async () => {
    const { status, body } = await getJson("/api/terminal-info");
    assert.equal(status, 200);
    assert.equal(body.shell, "fake-shell");
    assert.equal(body.alive, true);
  });
});

describe("سرور — /api/probe", () => {
  test("بدونِ مسیر → ۴۰۰ با پیامِ روشن", async () => {
    const { status, body } = await getJson("/api/probe");
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(body.error, /مسیر/);
  });

  test("مسیرِ خالی (فقط فاصله) هم ۴۰۰ می‌دهد", async () => {
    const { status } = await getJson("/api/probe?path=%20%20");
    assert.equal(status, 400);
  });

  test("مسیرِ ناموجود → ۲۰۰ ولی exists=false، نه کرش", async () => {
    const ghost = join(sandbox, "ghost-folder");
    const { status, body } = await getJson("/api/probe?path=" + encodeURIComponent(ghost));
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.probe.exists, false);
    assert.ok(body.probe.error);
  });

  test("پوشهٔ تازه‌ساخته: ساختارمند ولی هیچ تکنولوژی‌ای نصب نیست", async () => {
    const { body } = await getJson("/api/probe?path=" + encodeURIComponent(scaffolded));
    const p = body.probe;

    assert.equal(p.scaffolded.state, "present");
    assert.equal(p.nodeRuntime.state, "absent");
    assert.equal(p.packageManager.state, "absent");
    assert.equal(p.monorepo.state, "absent");
    assert.deepEqual(p.apps, []);
    assert.deepEqual(p.mismatches, []);
    // هر تشخیص باید مدرکش را هم بیاورد، نه فقط جواب را
    assert.ok(p.nodeRuntime.evidence.length > 0);
  });

  test("پوشهٔ بی‌ربط → scaffolded=absent، بدونِ فروپاشی", async () => {
    const plain = join(sandbox, "just-a-folder");
    mkdirSync(plain);
    writeFileSync(join(plain, "notes.txt"), "x");
    const { body } = await getJson("/api/probe?path=" + encodeURIComponent(plain));
    assert.equal(body.probe.scaffolded.state, "absent");
    assert.equal(body.probe.declared, null);
  });

  test("مسیری که فایل است → isDirectory=false", async () => {
    const file = join(sandbox, "a-file.txt");
    writeFileSync(file, "x");
    const { body } = await getJson("/api/probe?path=" + encodeURIComponent(file));
    assert.equal(body.probe.isDirectory, false);
  });

  test("مسیرِ فارسی و مسیرِ دارای فاصله درست کار می‌کند", async () => {
    const weird = join(sandbox, "پوشهٔ آزمایشی با فاصله");
    scaffoldProject({ targetPath: weird, slug: "farsi-test", displayName: "آزمایشی", initGit: false });
    const { body } = await getJson("/api/probe?path=" + encodeURIComponent(weird));
    assert.equal(body.ok, true);
    assert.equal(body.probe.scaffolded.state, "present");
    assert.equal(body.probe.declared.displayName, "آزمایشی");
  });

  test("پاسخ کش نمی‌شود — وضعیت لحظه‌ای است", async () => {
    const res = await get("/api/probe?path=" + encodeURIComponent(scaffolded));
    assert.match(res.headers.get("cache-control"), /no-store/);
  });
});
