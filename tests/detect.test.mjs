/**
 * تست‌های موتورِ تشخیص.
 *
 * مهم‌ترین تستِ این فایل: «Docker خاموش → unknown، نه absent».
 * برای این کار Dockerِ واقعیِ سیستم خاموش نمی‌شود؛ اجراکنندهٔ فرمان تزریق
 * می‌شود. هم قابلِ اتکاست، هم روی هر ماشینی یک‌جور جواب می‌دهد.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  PRESENT, ABSENT, UNKNOWN,
  detectNpmPackage, detectPythonVenv, detectGitRepo, detectNodeRuntime,
  detectPackageManager, detectMonorepoTool, detectApps,
  detectDockerCli, detectDockerServices, readComposeDeclaration,
  readDeclaredConfig, findMismatches, probeProject,
} from "../src/core/detect.mjs";
import { scaffoldProject } from "../src/core/scaffold.mjs";

let sandbox;
before(() => { sandbox = mkdtempSync(join(tmpdir(), "pb-detect-")); });
after(() => { rmSync(sandbox, { recursive: true, force: true }); });

/** یک پوشهٔ آزمایشیِ نو با فایل‌های دلخواه. */
function fixture(name, files = {}) {
  const dir = join(sandbox, name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const dest = join(dir, rel);
    mkdirSync(join(dest, ".."), { recursive: true });
    writeFileSync(dest, content);
  }
  return dir;
}

// ----------------------------------------------------- اجراکننده‌های تقلبیِ Docker

/** Docker نصب نیست / بالا نیست. */
const dockerMissing = () => ({ error: new Error("spawn docker ENOENT") });

/** Docker هست، و این سرویس‌ها بالا هستند. */
const dockerWith = (running) => (cmd, args) => {
  if (args[0] === "version") return { status: 0, stdout: "27.0.0\n", stderr: "" };
  if (args[0] === "compose") return { status: 0, stdout: running.join("\n") + "\n", stderr: "" };
  return { status: 1, stdout: "", stderr: "فرمانِ غیرمنتظره" };
};

/** Docker هست ولی خودِ compose خطا می‌دهد. */
const dockerComposeBroken = (cmd, args) => {
  if (args[0] === "version") return { status: 0, stdout: "27.0.0\n", stderr: "" };
  return { status: 1, stdout: "", stderr: "permission denied while trying to connect" };
};

const COMPOSE = `name: myproj
services:
  postgres:
    image: postgres:17
  redis:
    image: redis:7
  meilisearch:
    image: getmeili/meilisearch

volumes:
  pgdata:
`;

// --------------------------------------------------------------------- پکیجِ npm

describe("detectNpmPackage", () => {
  test("بدونِ node_modules → absent", () => {
    const dir = fixture("npm-none", { "package.json": "{}" });
    const res = detectNpmPackage(dir, { name: "turbo" });
    assert.equal(res.state, ABSENT);
    assert.match(res.evidence, /node_modules وجود ندارد/);
  });

  test("node_modules هست ولی پکیج نیست → absent", () => {
    const dir = fixture("npm-empty", { "node_modules/other/index.js": "" });
    assert.equal(detectNpmPackage(dir, { name: "turbo" }).state, ABSENT);
  });

  test("پکیج موجود → present", () => {
    const dir = fixture("npm-has", { "node_modules/turbo/package.json": "{}" });
    const res = detectNpmPackage(dir, { name: "turbo" });
    assert.equal(res.state, PRESENT);
    assert.match(res.evidence, /turbo/);
  });

  test("پکیجِ scopeدار درست پیدا می‌شود", () => {
    const dir = fixture("npm-scoped", { "node_modules/@playwright/test/index.js": "" });
    assert.equal(detectNpmPackage(dir, { name: "@playwright/test" }).state, PRESENT);
  });

  test("پکیجِ داخلِ یک app", () => {
    const dir = fixture("npm-app", { "apps/web/node_modules/react/index.js": "" });
    assert.equal(detectNpmPackage(dir, { app: "web", name: "react" }).state, PRESENT);
    assert.equal(detectNpmPackage(dir, { app: "api", name: "react" }).state, ABSENT);
  });
});

// ------------------------------------------------------------------ محیطِ پایتون

describe("detectPythonVenv", () => {
  test("بدونِ .venv → absent", () => {
    assert.equal(detectPythonVenv(fixture("py-none")).state, ABSENT);
  });

  test("با مفسر → present", () => {
    const dir = fixture("py-ok", { ".venv/Scripts/python.exe": "" });
    assert.equal(detectPythonVenv(dir).state, PRESENT);
  });

  test(".venvِ نیمه‌ساخته → unknown، نه absent و نه present", () => {
    const dir = fixture("py-half", { ".venv/pyvenv.cfg": "" });
    const res = detectPythonVenv(dir);
    assert.equal(res.state, UNKNOWN);
    assert.match(res.evidence, /نیمه‌ساخته/);
  });
});

// ------------------------------------------------------- رانتایم و مدیرِ پکیج

describe("detectNodeRuntime", () => {
  test("بدونِ package.json → absent", () => {
    assert.equal(detectNodeRuntime(fixture("node-none")).state, ABSENT);
  });

  test("package.json هست ولی node_modules نیست → absent با ذکرِ «اعلام شده، نصب نشده»", () => {
    const dir = fixture("node-declared", { "package.json": "{}" });
    const res = detectNodeRuntime(dir);
    assert.equal(res.state, ABSENT);
    assert.match(res.evidence, /اعلام شده، نصب نشده/);
  });

  test("هر دو → present", () => {
    const dir = fixture("node-real", { "package.json": "{}", "node_modules/x/i.js": "" });
    assert.equal(detectNodeRuntime(dir).state, PRESENT);
  });
});

describe("detectPackageManager", () => {
  test("بدونِ lockfile → absent", () => {
    const res = detectPackageManager(fixture("pm-none"));
    assert.equal(res.state, ABSENT);
    assert.equal(res.name, null);
  });

  test("یک lockfile → present با نامِ درست", () => {
    const dir = fixture("pm-pnpm", { "pnpm-lock.yaml": "" });
    const res = detectPackageManager(dir);
    assert.equal(res.state, PRESENT);
    assert.equal(res.name, "pnpm");
  });

  test("چند lockfile همزمان → unknown، نه انتخابِ حدسی", () => {
    const dir = fixture("pm-both", { "pnpm-lock.yaml": "", "package-lock.json": "" });
    const res = detectPackageManager(dir);
    assert.equal(res.state, UNKNOWN);
    assert.equal(res.name, null);
  });
});

describe("detectMonorepoTool", () => {
  test("turbo.json هست ولی turbo نصب نیست → absent", () => {
    const dir = fixture("mono-declared", { "turbo.json": "{}" });
    const res = detectMonorepoTool(dir);
    assert.equal(res.state, ABSENT);
    assert.equal(res.tool, null);
    assert.match(res.evidence, /اعلام شده، نصب نشده/);
  });

  test("turbo.json + نصبِ واقعی → present", () => {
    const dir = fixture("mono-real", { "turbo.json": "{}", "node_modules/turbo/p.json": "{}" });
    const res = detectMonorepoTool(dir);
    assert.equal(res.state, PRESENT);
    assert.equal(res.tool, "Turborepo");
  });

  test("فقط pnpm-workspace → present با ابزارِ ساده", () => {
    const dir = fixture("mono-plain", { "pnpm-workspace.yaml": "" });
    const res = detectMonorepoTool(dir);
    assert.equal(res.state, PRESENT);
    assert.match(res.tool, /pnpm workspaces/);
  });

  test("هیچ‌کدام → absent", () => {
    assert.equal(detectMonorepoTool(fixture("mono-none")).state, ABSENT);
  });
});

describe("detectApps", () => {
  test("جنسِ هر app را تشخیص می‌دهد", () => {
    const dir = fixture("apps-mixed", {
      "apps/web/package.json": "{}",
      "apps/ai/requirements.txt": "fastapi",
      "apps/mystery/notes.txt": "",
    });
    const apps = detectApps(dir);
    assert.equal(apps.length, 3);
    assert.deepEqual(apps.find((a) => a.name === "web").kinds, ["node"]);
    assert.deepEqual(apps.find((a) => a.name === "ai").kinds, ["python"]);
    assert.equal(apps.find((a) => a.name === "mystery").kind, "نامعلوم");
  });

  test("appِ پایتونی که برای مونوریپو package.json هم دارد، «node» برچسب نمی‌خورد", () => {
    // این حالتِ واقعیِ apps/ai-service در پروژهٔ 25 است: هم package.json دارد
    // (که pnpm ببیندش) هم requirements.txt. برچسبِ «node» گمراه‌کننده بود.
    const dir = fixture("apps-dual", {
      "apps/ai-service/package.json": "{}",
      "apps/ai-service/requirements.txt": "fastapi",
    });
    const app = detectApps(dir)[0];
    assert.deepEqual(app.kinds, ["node", "python"]);
    assert.equal(app.kind, "node+python");
    assert.ok(app.pythonEnv, "محیطِ پایتون باید بررسی شود");
    assert.ok(app.nodeDeps, "node_modules هم باید بررسی شود");
  });

  test("node_modules از رویِ خودِ پوشه چک می‌شود، نه یک پکیجِ نمونه", () => {
    const dir = fixture("apps-deps", {
      "apps/a/package.json": "{}",
      "apps/a/node_modules/whatever/i.js": "",
      "apps/b/package.json": "{}",
    });
    const apps = detectApps(dir);
    assert.equal(apps.find((a) => a.name === "a").nodeDeps.state, PRESENT);
    assert.equal(apps.find((a) => a.name === "b").nodeDeps.state, ABSENT);
  });

  test("بدونِ پوشهٔ apps → فهرستِ خالی", () => {
    assert.deepEqual(detectApps(fixture("apps-none")), []);
  });
});

// -------------------------------------------------------------- فایلِ compose

describe("readComposeDeclaration", () => {
  test("نامِ پروژه و سرویس‌ها را درمی‌آورد", () => {
    const dir = fixture("compose-ok", { "deployment/docker-compose.yml": COMPOSE });
    const res = readComposeDeclaration(dir);
    assert.equal(res.file, "deployment/docker-compose.yml");
    assert.equal(res.projectName, "myproj");
    assert.deepEqual(res.services, ["postgres", "redis", "meilisearch"]);
  });

  test("کلیدهای بیرونِ بلوکِ services را سرویس حساب نمی‌کند", () => {
    const dir = fixture("compose-vol", { "docker-compose.yml": COMPOSE });
    assert.ok(!readComposeDeclaration(dir).services.includes("pgdata"));
  });

  test("بدونِ فایل → خالی", () => {
    const res = readComposeDeclaration(fixture("compose-none"));
    assert.equal(res.file, null);
    assert.deepEqual(res.services, []);
  });
});

// ------------------------------------------------------ مهم‌ترین بخش: سه‌حالتی

describe("Docker — سه حالت", () => {
  test("Docker خاموش → همهٔ سرویس‌ها unknown، هیچ‌کدام absent", () => {
    const dir = fixture("dk-off", { "deployment/docker-compose.yml": COMPOSE });
    const res = detectDockerServices(dir, dockerMissing);

    assert.equal(res.cli.state, UNKNOWN);
    for (const [name, s] of Object.entries(res.services)) {
      assert.equal(s.state, UNKNOWN, `${name} باید unknown باشد، ولی ${s.state} بود`);
    }
    assert.equal(Object.keys(res.services).length, 3);
  });

  test("Docker روشن → بالاها present، بقیه absent", () => {
    const dir = fixture("dk-on", { "deployment/docker-compose.yml": COMPOSE });
    const res = detectDockerServices(dir, dockerWith(["postgres", "redis"]));

    assert.equal(res.cli.state, PRESENT);
    assert.equal(res.services.postgres.state, PRESENT);
    assert.equal(res.services.redis.state, PRESENT);
    assert.equal(res.services.meilisearch.state, ABSENT);
  });

  test("compose خطا بدهد → unknown، نه absent", () => {
    const dir = fixture("dk-broken", { "deployment/docker-compose.yml": COMPOSE });
    const res = detectDockerServices(dir, dockerComposeBroken);
    for (const s of Object.values(res.services)) assert.equal(s.state, UNKNOWN);
  });

  test("بدونِ فایلِ compose، Docker حتی پرسیده نمی‌شود", () => {
    let asked = false;
    const spy = (...a) => { asked = true; return dockerMissing(...a); };
    const res = detectDockerServices(fixture("dk-nofile"), spy);
    assert.equal(asked, false, "نباید بی‌دلیل Docker را صدا بزند");
    assert.deepEqual(res.services, {});
  });

  test("نامِ پروژهٔ compose برگردانده می‌شود (برای هشدارِ دامنهٔ مشترک)", () => {
    const dir = fixture("dk-name", { "deployment/docker-compose.yml": COMPOSE });
    assert.equal(detectDockerServices(dir, dockerWith([])).projectName, "myproj");
  });
});

// ------------------------------------------------------ اعلام در برابر واقعیت

describe("findMismatches", () => {
  const declared = { stack: { database: "PostgreSQL", monorepoTool: "Turborepo" } };

  test("دیتابیسِ اعلام‌شده که بالا نیست → conflict", () => {
    const out = findMismatches({
      declared,
      docker: { services: { postgres: { state: ABSENT, evidence: "" } } },
      monorepo: { tool: "Turborepo" },
    });
    const db = out.find((m) => m.field === "stack.database");
    assert.ok(db);
    assert.equal(db.severity, "conflict");
  });

  test("دیتابیسِ اعلام‌شده با وضعیتِ نامعلوم → unknown، نه conflict", () => {
    const out = findMismatches({
      declared,
      docker: { services: { postgres: { state: UNKNOWN, evidence: "" } } },
      monorepo: { tool: "Turborepo" },
    });
    assert.equal(out.find((m) => m.field === "stack.database").severity, "unknown");
  });

  test("همه‌چیز جور → بدونِ ایراد", () => {
    const out = findMismatches({
      declared,
      docker: { services: { postgres: { state: PRESENT, evidence: "" } } },
      monorepo: { tool: "Turborepo" },
    });
    assert.deepEqual(out, []);
  });

  test("ابزارِ مونوریپوی اعلام‌شده با واقعیت نمی‌خواند → conflict", () => {
    const out = findMismatches({
      declared: { stack: { monorepoTool: "Nx" } },
      docker: { services: {} },
      monorepo: { tool: "Turborepo", evidence: "" },
    });
    assert.equal(out[0].field, "stack.monorepoTool");
  });
});

// ------------------------------------------------------------------ تصویرِ کامل

describe("probeProject", () => {
  test("مسیرِ ناموجود → صادقانه خطا می‌دهد، نه ادعای خالی‌بودن", () => {
    const res = probeProject(join(sandbox, "ghost"));
    assert.equal(res.exists, false);
    assert.ok(res.error);
  });

  test("مسیری که فایل است → خطا", () => {
    const f = join(sandbox, "a-file.txt");
    writeFileSync(f, "x");
    assert.equal(probeProject(f).isDirectory, false);
  });

  test("پوشهٔ تازه‌ساختهٔ قدمِ صفر: ساختارمند ولی هیچ تکنولوژی‌ای نصب نیست", () => {
    const dir = join(sandbox, "fresh-scaffold");
    const built = scaffoldProject({ targetPath: dir, initGit: false });
    assert.ok(built.ok, built.error);

    const res = probeProject(dir, { run: dockerMissing });

    assert.equal(res.scaffolded.state, PRESENT);
    assert.equal(res.nodeRuntime.state, ABSENT);
    assert.equal(res.packageManager.state, ABSENT);
    assert.equal(res.monorepo.state, ABSENT);
    assert.deepEqual(res.apps, []);
    assert.deepEqual(res.docker.services, {}, "بدونِ فایلِ compose نباید سرویسی ادعا شود");
    assert.deepEqual(res.mismatches, [], "با stackِ خالی نباید ناسازگاری باشد");
    // و مهم‌تر: همهٔ تصمیم‌ها باید null باشند
    assert.ok(Object.values(res.declared.stack).every((v) => v === null));
  });

  test("پوشهٔ بی‌ربط: scaffolded=absent، بدونِ فروپاشی", () => {
    const dir = fixture("random-folder", { "notes.txt": "x" });
    const res = probeProject(dir, { run: dockerMissing });
    assert.equal(res.scaffolded.state, ABSENT);
    assert.equal(res.declared, null);
    assert.deepEqual(res.mismatches, []);
  });

  test("project.config.jsonِ خراب باعثِ کرش نمی‌شود", () => {
    const dir = fixture("bad-config", { "project.config.json": "{ این JSON نیست" });
    const res = probeProject(dir, { run: dockerMissing });
    assert.ok(res.declared._parseError);
  });
});
