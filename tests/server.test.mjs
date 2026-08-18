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

let server, base, sandbox, scaffolded;

before(async () => {
  sandbox = mkdtempSync(join(tmpdir(), "pb-server-"));
  scaffolded = join(sandbox, "a-project");
  scaffoldProject({ targetPath: scaffolded, displayName: "A Project", initGit: false });

  const started = await startServer({ port: 0 });
  server = started.server;
  base = started.url;
});

after(() => {
  server?.close();
  rmSync(sandbox, { recursive: true, force: true });
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

  test("متدِ غیر GET رد می‌شود — این صفحه فقط-خواندنی است", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await fetch(base + "/api/probe?path=.", { method });
      assert.equal(res.status, 405, `${method} باید رد شود`);
    }
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
