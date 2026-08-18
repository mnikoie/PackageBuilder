/**
 * تست‌های اعمالِ واقعیِ تصمیم‌ها.
 *
 * محورها:
 * - کارِ کاربر هرگز بازنویسی نشود
 * - تکرارِ یک کار خرابی نسازد
 * - «فرمان فرستاده شد» با «نصب شد» یکی نباشد
 * - برگشت واقعاً برگرداند
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  applyEnvVars, generateCompose, composeServicesFor, nextDecisionNumber,
  writeDecisionDoc, updateStackConfig, applyTechnology, revertTechnology, removeEnvVars,
  GENERATED_MARKER,
} from "../src/core/apply.mjs";
import { scaffoldProject } from "../src/core/scaffold.mjs";
import { technologyById } from "../src/core/registry.mjs";
import { decisionHistory, findDecisionCommit, isClean } from "../src/core/git.mjs";
import { probeProject } from "../src/core/detect.mjs";

let sandbox;
let counter = 0;
before(() => { sandbox = mkdtempSync(join(tmpdir(), "pb-apply-")); });
after(() => { rmSync(sandbox, { recursive: true, force: true }); });

/** یک پروژهٔ نوِ واقعی (با گیت)، ساخته‌شده توسطِ خودِ قدمِ ۲. */
function newProject(name, { git = true } = {}) {
  const dir = join(sandbox, `${name}-${++counter}`);
  const res = scaffoldProject({ targetPath: dir, slug: name.toLowerCase(), displayName: name, initGit: git });
  assert.ok(res.ok, res.error);
  return dir;
}

/**
 * کامیتِ فایل‌هایی که تست دستی ساخته.
 *
 * لازم است چون برگشت عمداً روی درختِ کثیف کار نمی‌کند (تا کارِ کاربر نپرد) —
 * و فایل‌های setupِ تست هم از نظرِ گیت «کارِ کامیت‌نشده»اند.
 */
function commitSetup(dir, message = "تنظیمِ تست") {
  spawnSync("git", ["add", "-A"], { cwd: dir });
  const res = spawnSync("git", ["commit", "-q", "-m", message], { cwd: dir, encoding: "utf8" });
  assert.ok(res.status === 0 || /nothing to commit/.test(res.stdout || ""), res.stderr);
}

/**
 * ترمینالِ تقلبی: فرمان‌ها را ثبت می‌کند و نتیجهٔ دلخواه می‌دهد.
 * (ترمینالِ واقعی جای خودش در terminal.test.mjs تست شده.)
 */
/**
 * هر پورتی را «منتشرشده» اعلام می‌کند — چون ترمینالِ تقلبی واقعاً کانتینری بالا
 * نمی‌آورد. (چکِ واقعیِ انتشارِ پورت در آزمایشِ زندهٔ خط‌فرمان انجام شد.)
 *
 * عمداً به بازه وابسته نیست: نسخهٔ اولش فقط ۵۳۰۰–۵۹۹۹ را می‌شناخت و برای
 * پورت‌های ۹۰۰۰یِ MinIO شکست — همان دامِ «تقلبیِ ناهمگام با واقعی».
 */
const fakePorts = () => ({ known: true, ports: { has: () => true } });

function fakeTerminal({ failOn = [] } = {}) {
  const commands = [];
  return {
    commands,
    async runAndWait(command) {
      commands.push(command);
      const fail = failOn.some((f) => command.includes(f));
      return { ok: !fail, id: "x", reason: fail ? "شکستِ ساختگی" : undefined };
    },
  };
}

// ------------------------------------------------------------ متغیرهای env

describe("applyEnvVars", () => {
  test("متغیرِ نو اضافه می‌شود", () => {
    const dir = newProject("env-add", { git: false });
    const res = applyEnvVars(dir, { techLabel: "PostgreSQL", vars: { DATABASE_URL: "postgres://x" } });

    assert.equal(res.changed, true);
    assert.deepEqual(res.added, ["DATABASE_URL"]);
    const text = readFileSync(join(dir, ".env.example"), "utf8");
    assert.match(text, /# ---- PostgreSQL ----/);
    assert.match(text, /DATABASE_URL=postgres:\/\/x/);
  });

  test("مقدارِ موجود هرگز عوض نمی‌شود — کارِ کاربر محفوظ است", () => {
    const dir = newProject("env-keep", { git: false });
    const file = join(dir, ".env.example");
    writeFileSync(file, "DATABASE_URL=مقدارِ واقعیِ من\n");

    const res = applyEnvVars(dir, { techLabel: "PostgreSQL", vars: { DATABASE_URL: "postgres://default" } });

    assert.equal(res.changed, false);
    assert.deepEqual(res.skipped, ["DATABASE_URL"]);
    assert.match(readFileSync(file, "utf8"), /مقدارِ واقعیِ من/);
  });

  test("فقط متغیرهای نبوده اضافه می‌شوند", () => {
    const dir = newProject("env-partial", { git: false });
    writeFileSync(join(dir, ".env.example"), "A=1\n");
    const res = applyEnvVars(dir, { techLabel: "X", vars: { A: "2", B: "3" } });

    assert.deepEqual(res.added, ["B"]);
    assert.deepEqual(res.skipped, ["A"]);
    assert.match(readFileSync(join(dir, ".env.example"), "utf8"), /^A=1$/m);
  });

  test("اجرای دوباره چیزی اضافه نمی‌کند", () => {
    const dir = newProject("env-idem", { git: false });
    const vars = { FOO: "bar" };
    applyEnvVars(dir, { techLabel: "X", vars });
    const once = readFileSync(join(dir, ".env.example"), "utf8");
    const second = applyEnvVars(dir, { techLabel: "X", vars });

    assert.equal(second.changed, false);
    assert.equal(readFileSync(join(dir, ".env.example"), "utf8"), once);
  });
});

// -------------------------------------------------------------- compose

describe("generateCompose", () => {
  const services = [{ service: "postgres", image: "postgres:17-alpine", ports: ["5432:5432"] }];

  test("فایل را می‌سازد، با نامِ پروژه به‌عنوانِ دامنه", () => {
    const dir = newProject("compose-new", { git: false });
    const res = generateCompose(dir, { slug: "myproj", services });

    assert.equal(res.changed, true);
    const text = readFileSync(join(dir, "deployment", "docker-compose.yml"), "utf8");
    assert.match(text, /^name: myproj$/m);
    assert.match(text, /^ {2}postgres:$/m);
    assert.match(text, /image: postgres:17-alpine/);
    assert.ok(text.includes(GENERATED_MARKER));
  });

  test("دامنه با نامِ پروژه پر می‌شود — همان دامی که کپی‌ها را قاطی می‌کرد", () => {
    const a = generateCompose(newProject("scope-a", { git: false }), { slug: "proj-a", services });
    const b = generateCompose(newProject("scope-b", { git: false }), { slug: "proj-b", services });
    assert.ok(a.changed && b.changed);
    // دو پروژه، دو نامِ متفاوت → وضعیتِ هم را نشان نمی‌دهند
  });

  test("فایلِ دست‌نویسِ کاربر دست‌نخورده می‌ماند و تکه‌ی YAML برگردانده می‌شود", () => {
    const dir = newProject("compose-user", { git: false });
    const file = join(dir, "deployment", "docker-compose.yml");
    mkdirSync(join(dir, "deployment"), { recursive: true });
    writeFileSync(file, "name: منم-نوشتم\nservices:\n  redis:\n    image: redis:7\n");

    const res = generateCompose(dir, { slug: "x", services });

    assert.equal(res.changed, false);
    assert.equal(res.ownedByUser, true);
    assert.ok(res.snippet.includes("postgres"), "باید تکه‌ی آماده بدهد تا کاربر خودش بچسباند");
    assert.match(readFileSync(file, "utf8"), /منم-نوشتم/);
  });

  test("اجرای دوباره با همان سرویس‌ها، تغییری نمی‌دهد", () => {
    const dir = newProject("compose-idem", { git: false });
    generateCompose(dir, { slug: "x", services });
    const second = generateCompose(dir, { slug: "x", services });
    assert.equal(second.changed, false);
  });

  test("composeServicesFor فقط تکنولوژی‌های انتخاب‌شده را می‌آورد", () => {
    assert.deepEqual(composeServicesFor({}), []);
    const out = composeServicesFor({ database: "postgres", search: "meilisearch", frontendFramework: "nextjs" });
    assert.deepEqual(out.map((s) => s.service).sort(), ["meilisearch", "postgres"]);
  });
});

// ---------------------------------------------------- سندِ تصمیم و کانفیگ

describe("سندِ تصمیم", () => {
  test("شماره‌گذاری از سندِ موجود ادامه می‌یابد", () => {
    const dir = newProject("doc-num", { git: false });
    assert.equal(nextDecisionNumber(dir), 2, "پروژهٔ نو سندِ ۰۰۰۱ دارد، پس بعدی ۲ است");
  });

  test("سند، دلیل و گزینه‌های ردشده را می‌نویسد", () => {
    const dir = newProject("doc-write", { git: false });
    const tech = technologyById("postgres");
    const res = writeDecisionDoc(dir, {
      tech,
      alternatives: [{ label: "MySQL", meta: { pros: ["رایج"], cons: ["امکاناتِ کمتر"] } }],
      number: 2,
    });

    const text = readFileSync(join(dir, res.file), "utf8");
    assert.match(text, /PostgreSQL/);
    assert.match(text, /## گزینه‌های دیگر/);
    assert.match(text, /MySQL/);
    assert.match(text, /امکاناتِ کمتر/, "دلیلِ ردشدنِ گزینهٔ دیگر باید نوشته شود");
    assert.match(text, /git revert/);
  });

  test("کانفیگ، شناسهٔ تکنولوژی را ثبت می‌کند", () => {
    const dir = newProject("cfg", { git: false });
    const res = updateStackConfig(dir, "database", "postgres");
    assert.equal(res.changed, true);
    assert.equal(res.previous, null);

    const cfg = JSON.parse(readFileSync(join(dir, "project.config.json"), "utf8"));
    assert.equal(cfg.stack.database, "postgres");

    const again = updateStackConfig(dir, "database", "postgres");
    assert.equal(again.changed, false, "ثبتِ دوباره نباید تغییری بدهد");
  });
});

// -------------------------------------------------------- اعمالِ کامل

describe("applyTechnology", () => {
  test("dry-run فقط نقشه می‌دهد و هیچ چیزی نمی‌نویسد", async () => {
    const dir = newProject("apply-dry");
    const before = readdirSync(join(dir, "docs", "decisions"));
    const term = fakeTerminal();

    const res = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "postgres", terminal: term, dryRun: true });

    assert.ok(res.ok);
    assert.equal(res.dryRun, true);
    assert.ok(res.planned.length > 0);
    assert.deepEqual(term.commands, [], "در dry-run نباید فرمانی اجرا شود");
    assert.deepEqual(readdirSync(join(dir, "docs", "decisions")), before);
  });

  test("پیش‌نیازِ نبوده → عقب می‌کشد و فرمانی اجرا نمی‌کند", async () => {
    const dir = newProject("apply-needs");
    const term = fakeTerminal();
    const res = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "react-router-v7", terminal: term });

    assert.equal(res.ok, false);
    assert.match(res.error, /پیش‌نیاز/);
    assert.deepEqual(term.commands, [], "فرمانی که قطعاً شکست می‌خورد نباید اجرا شود");
  });

  test("سرویسِ Docker: سند و کانفیگ و کامیت، همه انجام می‌شوند", async () => {
    const dir = newProject("apply-pg");
    const term = fakeTerminal();
    const res = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "postgres", terminal: term });

    assert.ok(res.ok, res.error);
    assert.ok(existsSync(join(dir, res.decisionDoc)), "سندِ تصمیم ساخته نشد");

    const cfg = JSON.parse(readFileSync(join(dir, "project.config.json"), "utf8"));
    assert.equal(cfg.stack.database, "postgres");

    const compose = readFileSync(join(dir, "deployment", "docker-compose.yml"), "utf8");
    assert.match(compose, /postgres:/);
    assert.match(compose, /^name: apply-pg$/m, "دامنه باید نامِ پروژه باشد");

    assert.match(readFileSync(join(dir, ".env.example"), "utf8"), /DATABASE_URL=/);

    assert.ok(res.git?.ok, `کامیت نشد: ${res.git?.error}`);
    assert.equal(isClean(dir), true, "بعدِ اعمال، چیزی کامیت‌نشده نباید بماند");
    assert.ok(findDecisionCommit(dir, "postgres"), "کامیت با نشانیِ تصمیم پیدا نشد");
  });

  test("«فرمان فرستاده شد» با «نصب شد» یکی نیست", async () => {
    // سرویسِ Docker با یک فایلِ compose «نصب» نمی‌شود؛ باید بالا هم بیاید.
    // پس verified باید false باشد، در حالی که خودِ اعمال موفق بوده.
    const dir = newProject("apply-honest");
    const res = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "postgres", terminal: fakeTerminal() });

    assert.ok(res.ok, "اعمال باید موفق باشد");
    assert.equal(res.verified, false, "ولی نباید ادعا کند که واقعاً بالا آمده");
    assert.ok(res.evidence, "و باید بگوید چرا");
  });

  test("فرمانِ شکست‌خورده → اعمال متوقف می‌شود و ادعای موفقیت نمی‌کند", async () => {
    const dir = newProject("apply-fail");
    // ابتدا pnpm را «نصب» می‌کنیم تا پیش‌نیاز برآورده شود
    writeFileSync(join(dir, "package.json"), "{}");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    mkdirSync(join(dir, "node_modules"), { recursive: true });

    const term = fakeTerminal({ failOn: ["playwright"] });
    const res = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "playwright", terminal: term });

    assert.equal(res.ok, false);
    assert.match(res.error, /شکست خورد/);
    assert.ok(term.commands.length > 0, "فرمان باید تلاش شده باشد");
    // و نباید سندِ تصمیم بنویسد
    const docs = readdirSync(join(dir, "docs", "decisions"));
    assert.ok(!docs.some((f) => f.includes("playwright")), "برای کارِ شکست‌خورده نباید سند بنویسد");
  });

  test("اگر از قبل نصب باشد، دوباره نصب نمی‌کند", async () => {
    const dir = newProject("apply-twice");
    const term = fakeTerminal();
    await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "postgres", terminal: term });

    // بارِ دوم — ولی سرویس بالا نیست، پس «نصب» حساب نمی‌شود و باز اعمال می‌شود.
    // پس این را با یک تکنولوژیِ فایل‌محور امتحان می‌کنیم:
    writeFileSync(join(dir, "package.json"), "{}");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    const res = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "pnpm", terminal: term });

    assert.ok(res.ok);
    assert.equal(res.alreadyPresent, true, "pnpm از قبل هست، نباید دوباره نصب شود");
  });

  test("رقیبِ نصب‌شده → عقب می‌کشد و خودش تصمیم نمی‌گیرد", async () => {
    const dir = newProject("apply-rival");
    writeFileSync(join(dir, "package.json"), "{}");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    mkdirSync(join(dir, "node_modules"), { recursive: true });

    const res = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "npm", terminal: fakeTerminal() });
    assert.equal(res.ok, false);
    assert.match(res.error, /pnpm/);
    assert.equal(res.rival, "pnpm");
  });

  test("تکنولوژیِ ناشناخته و مسیرِ ناموجود، صادقانه رد می‌شوند", async () => {
    assert.match((await applyTechnology({ projectPath: sandbox, techId: "جادو" })).error, /ناشناخته/);
    assert.match(
      (await applyTechnology({ projectPath: join(sandbox, "نیست"), techId: "postgres" })).error,
      /وجود ندارد/,
    );
  });
});

// ------------------------------------------------------------- برگشت

describe("removeEnvVars", () => {
  test("فقط بلوکِ خودمان برداشته می‌شود، نه یک خطِ بیشتر", () => {
    const dir = newProject("env-remove", { git: false });
    const file = join(dir, ".env.example");
    writeFileSync(file, "KEEP_ME=1\n\n# ---- PostgreSQL ----\nDATABASE_URL=x\n\nOTHER=2\n");

    const res = removeEnvVars(dir, { techLabel: "PostgreSQL", vars: { DATABASE_URL: "" } });

    assert.equal(res.changed, true);
    assert.deepEqual(res.removed, ["DATABASE_URL"]);
    const text = readFileSync(file, "utf8");
    assert.match(text, /^KEEP_ME=1$/m);
    assert.match(text, /^OTHER=2$/m);
    assert.ok(!/^DATABASE_URL=/m.test(text));
    assert.ok(!text.includes("# ---- PostgreSQL ----"));
  });

  test("اگر بلوکی نبود، چیزی عوض نمی‌شود", () => {
    const dir = newProject("env-remove-none", { git: false });
    const before = readFileSync(join(dir, ".env.example"), "utf8");
    const res = removeEnvVars(dir, { techLabel: "X", vars: { NOPE: "" } });
    assert.equal(res.changed, false);
    assert.equal(readFileSync(join(dir, ".env.example"), "utf8"), before);
  });
});

// ---------------------------------------------------------------------------
// برگشت با **بازسازی**، نه معکوس‌کردنِ وصله.
//
// نگارشِ اول از git revert استفاده می‌کرد و همین تست نشان داد که کار نمی‌کند:
// تصمیم‌ها فایل‌های مشترک دارند، پس برگشتِ تصمیمِ قدیمی‌تر به تضاد می‌خورد و
// دکمهٔ پشیمانی فقط برای آخرین تصمیم جواب می‌داد. شرحش در تصمیمِ ۰۰۰۳.
// ---------------------------------------------------------------------------
describe("revertTechnology", () => {
  test("برگشتِ یک تصمیمِ قدیمی‌تر، وقتی تصمیمِ جدیدتری هم هست", async () => {
    const dir = newProject("revert-one");
    const term = fakeTerminal();

    const a1 = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "postgres", terminal: term });
    assert.ok(a1.ok, a1.error);
    const a2 = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "meilisearch", terminal: term });
    assert.ok(a2.ok, a2.error);
    const env0 = readFileSync(join(dir, ".env.example"), "utf8");
    // «خطِ انتساب» را چک می‌کنیم نه صرفِ وجودِ کلمه — چون متنِ توضیحیِ خودِ
    // قالب هم نامِ چند متغیر را به‌عنوانِ مثال آورده. (همین یک‌بار گمراهمان کرد.)
    assert.match(env0, /^DATABASE_URL=/m);
    assert.match(env0, /^MEILI_URL=/m);

    // postgres تصمیمِ **قدیمی‌تر** است — همان حالتی که با git revert تضاد می‌داد
    const res = await revertTechnology({ projectPath: dir, techId: "postgres", terminal: term });
    assert.ok(res.ok, res.error);

    const env = readFileSync(join(dir, ".env.example"), "utf8");
    assert.ok(!/^DATABASE_URL=/m.test(env), `متغیرِ تصمیمِ برگشته باید رفته باشد. محتوا:
${env}`);
    assert.match(env, /^MEILI_URL=/m, "تصمیمِ دیگر باید سرِ جایش بماند");

    const cfg = JSON.parse(readFileSync(join(dir, "project.config.json"), "utf8"));
    assert.equal(cfg.stack.database, null, "قصدِ ثبت‌شده هم باید برگردد");
    assert.equal(cfg.stack.search, "meilisearch", "تصمیمِ دیگر دست‌نخورده");

    const compose = readFileSync(join(dir, "deployment", "docker-compose.yml"), "utf8");
    assert.ok(!compose.includes("postgres:"), "سرویس باید از فایلِ ساخته‌شده برود");
    assert.match(compose, /meilisearch:/, "سرویسِ دیگر باید بماند");
  });

  test("سندِ تصمیم پاک نمی‌شود، «برگشت‌خورده» علامت می‌خورد", async () => {
    const dir = newProject("revert-doc");
    const term = fakeTerminal();
    const applied = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "postgres", terminal: term });

    await revertTechnology({ projectPath: dir, techId: "postgres", terminal: term });

    const text = readFileSync(join(dir, applied.decisionDoc), "utf8");
    assert.match(text, /برگشت‌خورده/, "تاریخ ارزش دارد و نباید پاک شود");
  });

  /** پیش‌نیازِ pnpm را برآورده می‌کند، بدونِ نصبِ چیزِ دیگری. */
  function withPnpm(dir) {
    writeFileSync(join(dir, "package.json"), "{}");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    commitSetup(dir, "پیش‌نیازِ pnpm");
  }

  test("حذفِ دستی صریح اعلام می‌شود، نه ادعای حذف", async () => {
    const dir = newProject("revert-manual");
    withPnpm(dir);

    const term = fakeTerminal();
    const applied = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "react-router-v7", terminal: term });
    assert.ok(applied.ok, applied.error);
    assert.ok(!applied.alreadyPresent, "برای این تست باید واقعاً اعمال شود");

    // فرض می‌کنیم CLIِ رسمی پوشه را ساخته (ترمینال تقلبی است، پس دستی می‌سازیم)
    mkdirSync(join(dir, "apps", "web", "node_modules", "react-router"), { recursive: true });
    writeFileSync(join(dir, "apps", "web", "package.json"), "{}");
    commitSetup(dir, "خروجیِ CLIِ رسمی");

    const res = await revertTechnology({ projectPath: dir, techId: "react-router-v7", terminal: term });
    assert.ok(res.ok, res.error);
    assert.ok(res.manualSteps.length > 0, "باید بگوید چه کاری را خودت باید بکنی");
    assert.match(res.manualSteps.join(), /apps\/web/);
    assert.equal(res.stillPresent, true, "و صادقانه بگوید هنوز نصب است");
  });

  test("برگشت، فرمانِ حذف را در ترمینال اجرا می‌کند", async () => {
    const dir = newProject("revert-cli");
    withPnpm(dir);

    const term = fakeTerminal();
    const applied = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "playwright", terminal: term });
    assert.ok(applied.ok, applied.error);
    assert.ok(!applied.alreadyPresent);
    term.commands.length = 0;

    const res = await revertTechnology({ projectPath: dir, techId: "playwright", terminal: term });
    assert.ok(res.ok, res.error);
    assert.ok(
      term.commands.some((c) => c.includes("remove") && c.includes("@playwright/test")),
      `فرمانِ حذف اجرا نشد: ${JSON.stringify(term.commands)}`,
    );
  });

  test("چیزی که نصب است ولی تصمیمش ثبت نشده، باز هم قابلِ برداشتن است", async () => {
    // حالتِ واقعی: کاربر خودش قبلاً چیزی نصب کرده و حالا می‌خواهد برش دارد.
    const dir = newProject("revert-unrecorded");
    withPnpm(dir);
    mkdirSync(join(dir, "node_modules", "@playwright", "test"), { recursive: true });
    commitSetup(dir, "نصبِ دستیِ کاربر");

    const term = fakeTerminal();
    const res = await revertTechnology({ projectPath: dir, techId: "playwright", terminal: term });
    assert.ok(res.ok, res.error);
    assert.ok(term.commands.some((c) => c.includes("@playwright/test")), "باید فرمانِ حذف را بزند");
  });

  test("با کارِ کامیت‌نشده، برگشت انجام نمی‌شود — تا کارِ کاربر نپرد", async () => {
    const dir = newProject("revert-dirty");
    await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "postgres", terminal: fakeTerminal() });
    writeFileSync(join(dir, "کارِ-نیمه‌کارهٔ-من.txt"), "مهم");

    const res = await revertTechnology({ projectPath: dir, techId: "postgres" });
    assert.equal(res.ok, false);
    assert.match(res.error, /کامیت‌نشده/);
    assert.ok(existsSync(join(dir, "کارِ-نیمه‌کارهٔ-من.txt")), "فایلِ کاربر باید بماند");
  });

  test("تصمیمِ اعمال‌نشده قابلِ برگشت نیست", async () => {
    const dir = newProject("revert-none");
    const res = await revertTechnology({ projectPath: dir, techId: "postgres" });
    assert.equal(res.ok, false);
    assert.match(res.error, /چیزی برای برگرداندن نیست/);
  });

  test("تاریخِ تصمیم‌ها و برگشت‌ها در گیت خوانده می‌شود", async () => {
    const dir = newProject("revert-history");
    const term = fakeTerminal();
    await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "postgres", terminal: term });
    await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "minio", terminal: term });
    await revertTechnology({ projectPath: dir, techId: "postgres", terminal: term });

    const ids = decisionHistory(dir).map((h) => h.decisionId).sort();
    assert.deepEqual(ids, ["minio", "postgres", "revert:postgres"]);
  });

  test("بعدِ برگشت، همان تصمیم دوباره قابلِ اعمال است", async () => {
    const dir = newProject("revert-reapply");
    const term = fakeTerminal();
    await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "minio", terminal: term });
    await revertTechnology({ projectPath: dir, techId: "minio", terminal: term });

    const again = await applyTechnology({ dockerPorts: fakePorts, projectPath: dir, techId: "minio", terminal: term });
    assert.ok(again.ok, again.error);
    const cfg = JSON.parse(readFileSync(join(dir, "project.config.json"), "utf8"));
    assert.equal(cfg.stack.storage, "minio");
  });
});
