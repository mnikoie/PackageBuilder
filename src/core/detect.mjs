/**
 * موتورِ تشخیصِ واقعی — فقط می‌خواند، هرگز نمی‌نویسد.
 *
 * قاعدهٔ حاکم بر کلِ این فایل (تصمیمِ ۰۰۰۱، قاعدهٔ ۱):
 * «نصب است» فقط با مدرکِ واقعی. حضورِ نامِ چیزی در package.json یا
 * docker-compose.yml **مدرک نیست** — آن فقط «اعلام» است.
 *
 * پس هر تشخیص سه حالت دارد، نه دو:
 *   present  → مدرک دیدیم که هست
 *   absent   → مدرک دیدیم که نیست
 *   unknown  → نتوانستیم بپرسیم (مثلاً Docker بالا نبود)
 *
 * «unknown» هرگز نباید به «absent» یا «present» ترجمه شود. همین یک قلم،
 * ریشهٔ سه دور باگِ «سبزِ دروغین» در نسخهٔ قبلیِ ابزار بود.
 */

import { existsSync, statSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const PRESENT = "present";
export const ABSENT = "absent";
export const UNKNOWN = "unknown";

const present = (evidence) => ({ state: PRESENT, evidence });
const absent = (evidence) => ({ state: ABSENT, evidence });
const unknown = (evidence) => ({ state: UNKNOWN, evidence });

/**
 * اجراکنندهٔ فرمان، قابلِ تزریق — تا تست بتواند «Docker خاموش» را بسازد
 * بدونِ اینکه لازم باشد Dockerِ واقعیِ سیستم خاموش شود.
 */
export const realRunner = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: "utf8", timeout: 8000, ...opts });

// ---------------------------------------------------------------- پایه‌ای‌ها

/** پکیجِ npm واقعاً نصب است؟ مدرک: پوشه‌اش در node_modules. */
export function detectNpmPackage(projectPath, { app, name }) {
  const segments = name.startsWith("@") ? name.split("/") : [name];
  const base = app ? join(projectPath, "apps", app) : projectPath;
  const nodeModules = join(base, "node_modules");
  const where = app ? `apps/${app}/node_modules` : "node_modules";

  if (!existsSync(nodeModules)) return absent(`${where} وجود ندارد — هیچ پکیجی نصب نیست`);
  if (existsSync(join(nodeModules, ...segments))) return present(`${where}/${name} موجود است`);
  return absent(`${where} هست ولی ${name} داخلش نیست`);
}

/** محیطِ مجازیِ پایتون واقعاً ساخته شده؟ مدرک: مفسرِ داخلِ .venv. */
export function detectPythonVenv(projectPath, app) {
  const base = app ? join(projectPath, "apps", app) : projectPath;
  const venv = join(base, ".venv");
  const where = app ? `apps/${app}/.venv` : ".venv";

  if (!existsSync(venv)) return absent(`${where} وجود ندارد`);
  // خودِ پوشهٔ .venv کافی نیست؛ ممکن است نیمه‌ساخته یا خالی باشد.
  for (const rel of ["Scripts/python.exe", "bin/python", "bin/python3"]) {
    if (existsSync(join(venv, rel))) return present(`${where}/${rel} موجود است`);
  }
  return unknown(`${where} هست ولی مفسرِ پایتون داخلش پیدا نشد — احتمالاً نیمه‌ساخته`);
}

/** مخزنِ گیت. */
export function detectGitRepo(projectPath) {
  const dotGit = join(projectPath, ".git");
  if (!existsSync(dotGit)) return absent(".git وجود ندارد");
  return present(".git موجود است");
}

/** رانتایمِ Node در این پروژه: هم اعلام‌شده هم واقعاً نصب‌شده؟ */
export function detectNodeRuntime(projectPath) {
  const hasPkgJson = existsSync(join(projectPath, "package.json"));
  const hasModules = existsSync(join(projectPath, "node_modules"));

  if (!hasPkgJson) return absent("package.json وجود ندارد");
  if (!hasModules) return absent("package.json هست ولی node_modules نیست — اعلام شده، نصب نشده");
  return present("package.json و node_modules، هر دو موجودند");
}

/** مدیرِ پکیج — از رویِ lockfileِ واقعی، نه از رویِ چیزی که کسی گفته. */
export function detectPackageManager(projectPath) {
  const locks = [
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
  ];
  const found = locks.filter(([file]) => existsSync(join(projectPath, file)));

  if (found.length === 0) return { ...absent("هیچ lockfileای پیدا نشد"), name: null };
  if (found.length > 1) {
    const names = found.map(([, n]) => n).join(" و ");
    return { ...unknown(`چند lockfile همزمان هست (${names}) — معلوم نیست کدام واقعی است`), name: null };
  }
  const [file, name] = found[0];
  return { ...present(`${file} موجود است`), name };
}

/** ابزارِ مونوریپو — فایلِ کانفیگ **و** نصبِ واقعیِ خودش. */
export function detectMonorepoTool(projectPath) {
  const candidates = [
    ["turbo.json", "turbo", "Turborepo", "turborepo"],
    ["nx.json", "nx", "Nx", "nx"],
  ];
  for (const [configFile, pkg, label, id] of candidates) {
    if (!existsSync(join(projectPath, configFile))) continue;
    const installed = detectNpmPackage(projectPath, { name: pkg });
    if (installed.state === PRESENT) return { ...present(`${configFile} هست و ${pkg} نصب است`), tool: label, toolId: id };
    return { ...absent(`${configFile} هست ولی ${pkg} نصب نیست — اعلام شده، نصب نشده`), tool: null, toolId: null };
  }
  // وجودِ pnpm-workspace.yaml به‌تنهایی مدرکِ مونوریپو نیست.
  //
  // pnpm ۱۱ همین فایل را به‌عنوانِ جایِ تنظیماتش هم به‌کار می‌برد: نصبِ یک
  // پکیجِ دارایِ اسکریپتِ بیلد (مثلِ better-sqlite3) خودش این فایل را می‌سازد و
  // فقط allowBuilds درونش می‌نویسد. تا قبل از این اصلاح، همان فایل باعث می‌شد
  // ابزار بگوید «مونوریپو هست» در حالی که کاربر چنین تصمیمی نگرفته بود —
  // یعنی دقیقاً همان سبزِ دروغینی که این ابزار برای ریشه‌کنی‌اش نوشته شد.
  //
  // معیارِ درست: فایل باید واقعاً بگوید کدام پکیج‌ها عضوِ این مجموعه‌اند.
  const wsFile = join(projectPath, "pnpm-workspace.yaml");
  if (existsSync(wsFile)) {
    let declaresPackages = false;
    try {
      declaresPackages = /^packages:\s*$/m.test(readFileSync(wsFile, "utf8"));
    } catch {
      // فایل هست ولی خوانده نشد — این «نامعلوم» است، نه «نیست»
      return { ...unknown("pnpm-workspace.yaml هست ولی خوانده نشد"), tool: null, toolId: null };
    }
    if (declaresPackages) {
      return { ...present("pnpm-workspace.yaml با بخشِ packages هست، بدونِ ابزارِ اضافه"), tool: "فقط pnpm workspaces", toolId: "pnpm-workspaces" };
    }
    return {
      ...absent("pnpm-workspace.yaml هست ولی بخشِ packages ندارد — فقط تنظیماتِ pnpm است"),
      tool: null,
      toolId: null,
    };
  }
  return { ...absent("نه turbo.json، نه nx.json، نه pnpm-workspace.yaml"), tool: null, toolId: null };
}

/**
 * یک پکیجِ پایتون واقعاً داخلِ venv نصب است؟
 *
 * مدرک، پوشهٔ خودِ پکیج در site-packages است — نه نامش در requirements.txt.
 * (همان تفکیکِ همیشگی: «اعلام‌شده» با «نصب‌شده» یکی نیست.)
 *
 * دو چیدمانِ site-packages پشتیبانی می‌شود: ویندوز (Lib/site-packages) و
 * یونیکس (lib/pythonX.Y/site-packages).
 */
export function detectPythonPackage(projectPath, app, name) {
  const base = app ? join(projectPath, "apps", app) : projectPath;
  const venv = join(base, ".venv");
  const where = app ? `apps/${app}/.venv` : ".venv";

  if (!existsSync(venv)) return absent(`${where} وجود ندارد`);

  const roots = [join(venv, "Lib", "site-packages")];
  const libDir = join(venv, "lib");
  if (existsSync(libDir)) {
    try {
      for (const entry of readdirSync(libDir)) roots.push(join(libDir, entry, "site-packages"));
    } catch {
      return unknown(`${where}/lib خوانده نشد`);
    }
  }

  const found = roots.find((r) => existsSync(r));
  if (!found) return unknown(`${where} هست ولی site-packages پیدا نشد — احتمالاً نیمه‌ساخته`);

  // نامِ پکیج روی دیسک با خط‌تیره/زیرخط فرق می‌کند (مثلِ python-multipart)
  const candidates = [name, name.replace(/-/g, "_")];
  for (const c of candidates) {
    if (existsSync(join(found, c))) return present(`${c} در ${where}/site-packages موجود است`);
  }
  // بعضی پکیج‌ها فقط یک ماژولِ تک‌فایلی‌اند
  for (const c of candidates) {
    if (existsSync(join(found, `${c}.py`))) return present(`${c}.py در ${where}/site-packages موجود است`);
  }
  return absent(`${name} در ${where}/site-packages نیست`);
}

/** وابستگی‌های node یک app واقعاً نصب شده‌اند؟ مدرک: خودِ پوشهٔ node_modules. */
export function detectNodeModules(projectPath, app) {
  const where = app ? `apps/${app}/node_modules` : "node_modules";
  const dir = app ? join(projectPath, "apps", app, "node_modules") : join(projectPath, "node_modules");
  return existsSync(dir) ? present(`${where} موجود است`) : absent(`${where} وجود ندارد`);
}

/**
 * appهای واقعیِ داخلِ apps/ و جنسشان.
 *
 * جنس می‌تواند **چندتایی** باشد: یک appِ پایتونی در مونوریپوی pnpm معمولاً یک
 * package.json هم دارد (فقط برای اینکه workspace ببیندش). برچسبِ تک‌کلمه‌ای
 * «node» برای چنین appای گمراه‌کننده است.
 */
export function detectApps(projectPath) {
  const appsDir = join(projectPath, "apps");
  if (!existsSync(appsDir)) return [];

  return readdirSync(appsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dir = join(appsDir, e.name);
      const isNode = existsSync(join(dir, "package.json"));
      const isPython =
        existsSync(join(dir, "requirements.txt")) || existsSync(join(dir, "pyproject.toml"));

      const kinds = [];
      if (isNode) kinds.push("node");
      if (isPython) kinds.push("python");

      return {
        name: e.name,
        kinds,
        kind: kinds.length ? kinds.join("+") : "نامعلوم",
        nodeDeps: isNode ? detectNodeModules(projectPath, e.name) : null,
        pythonEnv: isPython ? detectPythonVenv(projectPath, e.name) : null,
      };
    });
}

// ------------------------------------------------------------------- Docker

/** خودِ Docker در دسترس است؟ اگر نه، هیچ ادعایی دربارهٔ سرویس‌ها مجاز نیست. */
export function detectDockerCli(run = realRunner) {
  const res = run("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (res.error) return unknown(`فرمانِ docker اجرا نشد: ${res.error.message}`);
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout || "").trim().split("\n")[0] || `کدِ خروج ${res.status}`;
    return unknown(`Docker جواب نداد: ${msg}`);
  }
  return present(`Docker در دسترس است (نسخهٔ سرور ${res.stdout.trim()})`);
}

/**
 * نامِ سرویس‌ها را از فایلِ compose درمی‌آورد.
 *
 * این «اعلام» است، نه واقعیت — فقط می‌گوید چه سرویس‌هایی *قرار است* باشند.
 * تجزیه‌ی سطری است، نه YAMLِ کامل (تا وابستگیِ اضافه نخواهیم)؛ برای فایل‌های
 * استاندارد کافی است و در قدمِ ۶ با رجیستری جایگزین می‌شود.
 */
export function readComposeDeclaration(projectPath) {
  const candidates = ["deployment/docker-compose.yml", "docker-compose.yml", "compose.yml"];
  const rel = candidates.find((c) => existsSync(join(projectPath, c)));
  if (!rel) return { file: null, projectName: null, services: [] };

  const text = readFileSync(join(projectPath, rel), "utf8");
  const lines = text.split(/\r?\n/);
  const projectName = (text.match(/^name:\s*(\S+)/m) || [])[1] || null;

  const services = [];
  let inServices = false;
  for (const line of lines) {
    if (/^services:\s*$/.test(line)) { inServices = true; continue; }
    if (inServices && /^\S/.test(line)) break; // بلوکِ بعدی شروع شد
    const m = inServices && line.match(/^ {2}([A-Za-z0-9][\w-]*):\s*$/);
    if (m) services.push(m[1]);
  }
  return { file: rel, projectName, services };
}

/**
 * آرگومان‌های استانداردِ فراخوانیِ docker compose.
 *
 * `--env-file` حیاتی است: با `-f <path>`، خودِ Docker فایلِ `.env` را از پوشهٔ
 * **فایلِ compose** می‌خواند (یعنی `deployment/`)، نه ریشهٔ پروژه. بدونِ این،
 * متغیرهایی مثلِ `${POSTGRES_PORT}` به پیش‌فرضشان برمی‌گشتند و سرویس روی پورتِ
 * اشتباه بالا می‌آمد — یا اصلاً بالا نمی‌آمد. (در آزمایشِ زنده گرفته شد.)
 */
export function composeArgs(projectPath, composePath, rest) {
  const envFile = join(projectPath, ".env");
  return existsSync(envFile)
    ? ["compose", "--env-file", envFile, "-f", composePath, ...rest]
    : ["compose", "-f", composePath, ...rest];
}

/**
 * وضعیتِ واقعیِ سرویس‌های Docker.
 *
 * نکتهٔ مهمِ دامنه: Docker کانتینرها را با «نامِ پروژه» گروه می‌کند (فیلدِ
 * name: در فایلِ compose)، نه با مسیرِ پوشه. اگر دو کپی از یک قالب هر دو
 * name پیش‌فرض را داشته باشند، وضعیتِ هم را نشان می‌دهند. برای همین
 * projectName را برمی‌گردانیم تا لایهٔ بالاتر بتواند هشدار بدهد.
 */
export function detectDockerServices(projectPath, run = realRunner) {
  const declaration = readComposeDeclaration(projectPath);

  if (!declaration.file) {
    return {
      cli: absent("فایلِ compose پیدا نشد، پس Docker پرسیده نشد"),
      ...declaration,
      services: {},
      declaredServices: [],
    };
  }

  const cli = detectDockerCli(run);
  if (cli.state !== PRESENT) {
    // Docker در دسترس نیست → دربارهٔ هیچ سرویسی حق نداریم چیزی بگوییم.
    const services = {};
    for (const name of declaration.services) {
      services[name] = unknown(`Docker در دسترس نیست — وضعیتِ واقعی خوانده نشد`);
    }
    return { cli, ...declaration, services, declaredServices: declaration.services };
  }

  const composePath = join(projectPath, declaration.file);
  const res = run("docker", composeArgs(projectPath, composePath, [
    "ps", "--services", "--filter", "status=running",
  ]));

  const services = {};
  if (res.error || res.status !== 0) {
    const msg = (res.stderr || "").trim().split("\n")[0] || `کدِ خروج ${res.status}`;
    for (const name of declaration.services) {
      services[name] = unknown(`docker compose ps خطا داد: ${msg}`);
    }
    return { cli, ...declaration, services, declaredServices: declaration.services };
  }

  const running = new Set(res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  for (const name of declaration.services) {
    services[name] = running.has(name)
      ? present(`در «docker compose ps» بالا گزارش شد`)
      : absent(`در فایلِ compose تعریف شده ولی بالا نیست`);
  }
  return { cli, ...declaration, services, declaredServices: declaration.services };
}

// ------------------------------------------------------- اعلام در برابر واقعیت

/** محتوای project.config.json — این «قصد» است، نه «واقعیت». */
export function readDeclaredConfig(projectPath) {
  const file = join(projectPath, "project.config.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return { _parseError: err.message };
  }
}

/**
 * جاهایی که «اعلام» با «واقعیت» نمی‌خواند.
 *
 * این قلبِ ارزشِ این موتور است: تشخیصِ اینکه در project.config.json نوشته
 * «PostgreSQL» ولی هیچ Postgresای بالا نیست — همان دروغی که نسخهٔ قبلی
 * سبز نشانش می‌داد.
 */
export function findMismatches({ declared, docker, monorepo }) {
  const out = [];
  const stack = declared?.stack || {};

  const declaredDb = stack.database;
  if (declaredDb) {
    const svc = Object.entries(docker.services).find(([name]) =>
      declaredDb.toLowerCase().includes(name.toLowerCase()),
    );
    if (!svc) {
      // اینجا واقعاً نمی‌دانیم: یا سرویس جا مانده، یا این دیتابیس اصلاً
      // کانتینر ندارد (SQLite یک فایل است). تشخیص از روی خودِ پروژه
      // ممکن نیست، پس «نامعلوم» — نه «تضاد». ترجمهٔ نامعلوم به حکم،
      // همان کاری است که نسخهٔ قبلیِ این ابزار می‌کرد.
      out.push({
        field: "stack.database",
        declared: declaredDb,
        reality: `سرویسی به این نام در ${docker.file} نیست — یا این دیتابیس کانتینر ندارد`,
        severity: "unknown",
      });
    } else if (svc[1].state === ABSENT) {
      out.push({
        field: "stack.database",
        declared: declaredDb,
        reality: `سرویسِ ${svc[0]} بالا نیست`,
        severity: "conflict",
      });
    } else if (svc[1].state === UNKNOWN) {
      out.push({
        field: "stack.database",
        declared: declaredDb,
        reality: `وضعیتِ سرویسِ ${svc[0]} نامعلوم است`,
        severity: "unknown",
      });
    }
  }

  // مقایسه باید شناسه با شناسه باشد. نگارشِ قبل شناسهٔ ثبت‌شده («nx») را با
  // برچسبِ نمایشی («Nx») می‌سنجید، پس هر مونوریپویِ درست‌نصب‌شده «تضاد»
  // علامت می‌خورد — در اجرای واقعی دیده شد.
  if (stack.monorepoTool && (monorepo.toolId ?? monorepo.tool) !== stack.monorepoTool) {
    out.push({
      field: "stack.monorepoTool",
      declared: stack.monorepoTool,
      reality: monorepo.tool ? `واقعاً ${monorepo.tool} است` : monorepo.evidence,
      severity: "conflict",
    });
  }

  return out;
}

// ------------------------------------------------------------ تصویرِ کاملِ پروژه

/**
 * یک نگاهِ کاملِ فقط-خواندنی به پروژه.
 * @returns تصویرِ ساختاریافته، بدونِ هیچ چاپ و هیچ نوشتنی روی دیسک.
 */
export function probeProject(projectPath, { run = realRunner } = {}) {
  const abs = resolve(projectPath);

  if (!existsSync(abs)) {
    return { path: abs, exists: false, isDirectory: false, error: "مسیر وجود ندارد" };
  }
  if (!statSync(abs).isDirectory()) {
    return { path: abs, exists: true, isDirectory: false, error: "مسیر یک فایل است، نه پوشه" };
  }

  const declared = readDeclaredConfig(abs);
  const monorepo = detectMonorepoTool(abs);
  const docker = detectDockerServices(abs, run);

  return {
    path: abs,
    exists: true,
    isDirectory: true,
    scaffolded: declared
      ? present("project.config.json موجود است")
      : absent("project.config.json نیست — با PackageBuilder ساخته نشده"),
    declared,
    git: detectGitRepo(abs),
    nodeRuntime: detectNodeRuntime(abs),
    // ردیفِ جدا، چون UI نباید وضعیت را از **متنِ** مدرک حدس بزند. (یک‌بار
    // همین کار را کردم و صفحه دو حرفِ متناقض زد.)
    rootDeps: detectNodeModules(abs, null),
    packageManager: detectPackageManager(abs),
    monorepo,
    apps: detectApps(abs),
    docker,
    mismatches: declared ? findMismatches({ declared, docker, monorepo }) : [],
  };
}
