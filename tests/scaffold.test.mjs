/**
 * تست‌های هستهٔ «قدمِ صفر».
 *
 * اجرا:  pnpm test   (یا: node --test tests/)
 *
 * هر تست در یک پوشهٔ موقتِ جدا کار می‌کند و به پروژه‌های واقعی دست نمی‌زند.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { scaffoldProject, slugify, isValidSlug, inspectTarget } from "../src/core/scaffold.mjs";
import { renderSkeleton, listTemplates } from "../src/core/skeleton.mjs";

let sandbox;
before(() => { sandbox = mkdtempSync(join(tmpdir(), "pb-test-")); });
after(() => { rmSync(sandbox, { recursive: true, force: true }); });

const freshPath = (name) => join(sandbox, name);

describe("slugify و اعتبارسنجی", () => {
  test("نامِ پوشه را به slugِ معتبر تبدیل می‌کند", () => {
    assert.equal(slugify("Widget9"), "widget9");
    assert.equal(slugify("26- Some Tool"), "26-some-tool");
    assert.equal(slugify("My  Cool__App!!"), "my-cool-app");
    assert.equal(slugify("--edge--"), "edge");
  });

  test("slugِ نامعتبر را رد می‌کند", () => {
    assert.ok(isValidSlug("prg1"));
    assert.ok(isValidSlug("26-packagebuilder"));
    assert.ok(!isValidSlug("-starts-with-dash"));
    assert.ok(!isValidSlug("HasUpperCase"));
    assert.ok(!isValidSlug("has space"));
    assert.ok(!isValidSlug(""));
  });
});

describe("renderSkeleton", () => {
  test("همهٔ قالب‌ها را با جای‌گیرِ پرشده برمی‌گرداند", () => {
    const files = renderSkeleton({ slug: "demo", displayName: "Demo App" });
    assert.equal(files.length, listTemplates().length);
    assert.ok(files.length >= 13, `انتظار ۱۳ فایل یا بیشتر، ولی ${files.length} بود`);
    for (const f of files) {
      assert.ok(!f.content.includes("{{"), `جای‌گیرِ پرنشده در ${f.targetRel}`);
    }
  });

  test("فایل‌های مخفی با نامِ درست (نقطه‌دار) ساخته می‌شوند", () => {
    const names = renderSkeleton({ slug: "demo", displayName: "Demo" }).map((f) => f.targetRel);
    for (const expected of [".gitignore", ".gitattributes", ".editorconfig", ".env.example", ".github/workflows/README.md"]) {
      assert.ok(names.includes(expected), `${expected} در فهرست نیست`);
    }
    assert.ok(!names.some((n) => n.startsWith("_")), "فایلی با پیشوندِ _ به خروجی نشت کرده");
  });

  test("هیچ فایلی که تکنولوژی را تحمیل کند وجود ندارد", () => {
    const names = renderSkeleton({ slug: "demo", displayName: "Demo" }).map((f) => f.targetRel);
    for (const forbidden of ["package.json", "turbo.json", "pnpm-workspace.yaml", "docker-compose.yml", "playwright.config.ts"]) {
      assert.ok(!names.includes(forbidden), `${forbidden} نباید در اسکلت باشد`);
    }
  });
});

describe("scaffoldProject", () => {
  test("پوشهٔ ناموجود را می‌سازد و فایل‌ها را می‌نویسد", () => {
    const dir = freshPath("not-yet-there");
    const res = scaffoldProject({ targetPath: dir, initGit: false });

    assert.ok(res.ok, res.error);
    assert.equal(res.slug, "not-yet-there");
    assert.equal(res.displayName, "not-yet-there");
    assert.ok(existsSync(join(dir, ".gitignore")));
    assert.ok(existsSync(join(dir, "docs/decisions/0001-open-decisions.md")));
    assert.equal(res.files.length, listTemplates().length);
  });

  test("پوشهٔ خالیِ موجود را قبول می‌کند", () => {
    const dir = freshPath("already-empty");
    mkdirSync(dir);
    const res = scaffoldProject({ targetPath: dir, initGit: false });
    assert.ok(res.ok, res.error);
    assert.ok(existsSync(join(dir, "README.md")));
  });

  test("پوشهٔ پُر را رد می‌کند و هیچ چیزی نمی‌نویسد", () => {
    const dir = freshPath("has-stuff");
    mkdirSync(dir);
    writeFileSync(join(dir, "important.txt"), "کارِ قبلیِ من");

    const res = scaffoldProject({ targetPath: dir, initGit: false });

    assert.ok(!res.ok);
    assert.match(res.error, /خالی نیست/);
    assert.match(res.error, /important\.txt/);
    assert.deepEqual(readdirSync(dir), ["important.txt"], "فایلِ موجود دست‌نخورده نماند");
  });

  test("پوشه‌ای که فقط زبالهٔ سیستم‌عامل دارد، خالی حساب می‌شود", () => {
    const dir = freshPath("only-os-junk");
    mkdirSync(dir);
    writeFileSync(join(dir, "desktop.ini"), "[.ShellClassInfo]");

    const res = scaffoldProject({ targetPath: dir, initGit: false });
    assert.ok(res.ok, res.error);
    assert.ok(existsSync(join(dir, "README.md")));
  });

  test("مسیری که فایل است (نه پوشه) رد می‌شود", () => {
    const file = freshPath("iam-a-file.txt");
    writeFileSync(file, "x");
    const res = scaffoldProject({ targetPath: file, initGit: false });
    assert.ok(!res.ok);
    assert.match(res.error, /فایل است/);
  });

  test("dry-run فهرست می‌دهد ولی هیچ چیزی نمی‌نویسد", () => {
    const dir = freshPath("dry-run-dir");
    const res = scaffoldProject({ targetPath: dir, dryRun: true, initGit: false });

    assert.ok(res.ok, res.error);
    assert.equal(res.dryRun, true);
    assert.ok(res.files.length >= 13);
    assert.ok(!existsSync(dir), "dry-run نباید حتی پوشه را بسازد");
  });

  test("slug و نامِ نمایشیِ دستی اعمال می‌شوند", () => {
    const dir = freshPath("whatever-folder");
    const res = scaffoldProject({
      targetPath: dir, slug: "my-app", displayName: "برنامهٔ من", initGit: false,
    });

    assert.ok(res.ok, res.error);
    const config = JSON.parse(readFileSync(join(dir, "project.config.json"), "utf8"));
    assert.equal(config.slug, "my-app");
    assert.equal(config.displayName, "برنامهٔ من");
    assert.ok(readFileSync(join(dir, "README.md"), "utf8").includes("برنامهٔ من"));
  });

  test("slugِ نامعتبر رد می‌شود و پوشه ساخته نمی‌شود", () => {
    const dir = freshPath("bad-slug-dir");
    const res = scaffoldProject({ targetPath: dir, slug: "Bad Slug!", initGit: false });
    assert.ok(!res.ok);
    assert.match(res.error, /slug نامعتبر/);
    assert.ok(!existsSync(dir));
  });

  test("بدونِ مسیر، خطا می‌دهد", () => {
    assert.ok(!scaffoldProject({}).ok);
  });

  test("هر مقدارِ stack در ابتدا null است", () => {
    const dir = freshPath("null-stack");
    scaffoldProject({ targetPath: dir, initGit: false });
    const config = JSON.parse(readFileSync(join(dir, "project.config.json"), "utf8"));
    const values = Object.values(config.stack);
    assert.ok(values.length > 0);
    assert.ok(values.every((v) => v === null), "هیچ تکنولوژی‌ای نباید از قبل انتخاب شده باشد");
  });
});

describe("گیت", () => {
  test("مخزن راه می‌افتد و کامیتِ پایه زده می‌شود", () => {
    const dir = freshPath("with-git");
    const res = scaffoldProject({ targetPath: dir, initGit: true });

    assert.ok(res.ok, res.error);
    assert.ok(res.git.initialized, `گیت راه نیفتاد: ${res.git.error}`);
    assert.ok(res.git.committed, `کامیت نشد: ${res.git.error}`);
    assert.ok(existsSync(join(dir, ".git")));
  });

  test("--no-git مخزن نمی‌سازد", () => {
    const dir = freshPath("without-git");
    const res = scaffoldProject({ targetPath: dir, initGit: false });
    assert.ok(res.ok, res.error);
    assert.ok(!existsSync(join(dir, ".git")));
  });
});

describe("inspectTarget", () => {
  test("سه حالت را درست تشخیص می‌دهد", () => {
    const missing = inspectTarget(freshPath("nope"));
    assert.equal(missing.exists, false);

    const empty = freshPath("inspect-empty");
    mkdirSync(empty);
    assert.equal(inspectTarget(empty).isEmpty, true);

    const full = freshPath("inspect-full");
    mkdirSync(full);
    writeFileSync(join(full, "a.txt"), "x");
    const res = inspectTarget(full);
    assert.equal(res.isEmpty, false);
    assert.deepEqual(res.blockers, ["a.txt"]);
  });
});
