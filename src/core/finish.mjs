/**
 * قدم‌های پایانی — از «نصب شد» تا «بالا آمد».
 *
 * انتخابِ تکنولوژی‌ها پروژه را **آماده** می‌کند، ولی هنوز اجرا نمی‌شود: فایلِ
 * `.env` واقعی ساخته نشده، کلیدهای سرویس‌های ابری خالی‌اند، محیطِ پایتون
 * ساخته نشده، سرویس‌های Docker بالا نیامده‌اند و برنامه هرگز اجرا نشده.
 *
 * این فایل همان فهرست را از رویِ **وضعیتِ واقعیِ همین پروژه** می‌سازد — نه یک
 * فهرستِ ثابت. قدمی که لازم نباشد اصلاً نشان داده نمی‌شود، و قدمی که انجام
 * شده باشد «انجام‌شده» علامت می‌خورد؛ همان قاعدهٔ همیشگی که ادعا باید مدرک
 * داشته باشد.
 *
 * هیچ‌چیز خودکار اجرا نمی‌شود: هر قدم فرمانِ خودش را نشان می‌دهد و کاربر
 * تصمیم می‌گیرد.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

/** متغیرهای env که مقدارشان خالی مانده — یعنی کلیدی که باید خودت پر کنی. */
function emptyEnvVars(projectPath) {
  const file = join(projectPath, ".env.example");
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

/** سرویس‌های تعریف‌شده در فایلِ compose. */
function composeServices(projectPath) {
  const file = join(projectPath, "deployment", "docker-compose.yml");
  if (!existsSync(file)) return [];
  const out = [];
  let inServices = false;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^services:\s*$/.test(line)) { inServices = true; continue; }
    if (inServices) {
      if (/^\S/.test(line)) inServices = false;
      else {
        const m = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
        if (m) out.push(m[1]);
      }
    }
  }
  return out;
}

/** اسکریپت‌های یک package.json — اگر نبود یا خراب بود، خالی. */
function scriptsOf(file) {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")).scripts || {};
  } catch {
    return {};
  }
}

/**
 * فرمانی که واقعاً همین اسکریپت را اجرا می‌کند — یا null اگر جایی وجود ندارد.
 *
 * نگارشِ اول همیشه `pnpm run build` روی ریشه می‌زد، ولی ریشه‌ای که با
 * `npm init -y` ساخته شده اصلاً اسکریپتِ build ندارد و فرمان با
 * [ERR_PNPM_NO_SCRIPT] می‌شکست. حالا سه جا را به ترتیب نگاه می‌کنیم: خودِ
 * ریشه، ابزارِ مونوریپو، و بعد appها.
 */
function scriptCommand(projectPath, name, appList) {
  const pm = existsSync(join(projectPath, "pnpm-lock.yaml")) ? "pnpm" : "npm";
  const rootScripts = scriptsOf(join(projectPath, "package.json"));
  if (rootScripts[name]) return `${pm} run ${name}`;

  // مونوریپو: ابزارش همهٔ appها را با هم می‌سازد
  const hasTurbo = existsSync(join(projectPath, "turbo.json"));
  const hasNx = existsSync(join(projectPath, "nx.json"));
  const withScript = appList.filter((a) => scriptsOf(join(projectPath, "apps", a, "package.json"))[name]);
  if (!withScript.length) return null;

  if (hasTurbo) {
    const bin = localBin(projectPath, "turbo");
    return bin ? `${bin} run ${name}` : `${pm} exec turbo run ${name}`;
  }
  if (hasNx) {
    const bin = localBin(projectPath, "nx");
    return bin ? `${bin} run-many -t ${name}` : `${pm} exec nx run-many -t ${name}`;
  }

  // بی ابزارِ مونوریپو، هر app را جدا صدا می‌زنیم
  return withScript.map((a) => `${pm} --filter ${a} run ${name}`).join("; ");
}

/**
 * چند کار را با یک فرمان اجرا می‌کند.
 *
 * با Turborepo و Nx همه‌شان در یک اجرا و موازی می‌روند و پیشرفتِ هرکدام جدا
 * دیده می‌شود. بی ابزارِ مونوریپو، پشتِ‌سرِ هم صدا زده می‌شوند.
 */
function multiScriptCommand(projectPath, names, appList) {
  const pm = existsSync(join(projectPath, "pnpm-lock.yaml")) ? "pnpm" : "npm";
  if (existsSync(join(projectPath, "turbo.json"))) {
    const bin = localBin(projectPath, "turbo");
    return bin ? `${bin} run ${names.join(" ")}` : `${pm} exec turbo run ${names.join(" ")}`;
  }
  if (existsSync(join(projectPath, "nx.json"))) {
    const bin = localBin(projectPath, "nx");
    return bin ? `${bin} run-many -t ${names.join(",")}` : `${pm} exec nx run-many -t ${names.join(",")}`;
  }

  const parts = [];
  for (const name of names) {
    const one = scriptCommand(projectPath, name, appList);
    if (one) parts.push(one);
  }
  return parts.length ? parts.join("; ") : null;
}

/**
 * فرمانِ اجرای یک ابزارِ محلی (turbo / nx).
 *
 * اگر باینری‌اش در node_modules/.bin باشد مستقیم صدا زده می‌شود تا ترمینالِ
 * واقعی به آن برسد و نمای تعاملی‌اش کار کند؛ وگرنه از مدیرِ پکیج.
 */
function localBin(projectPath, name) {
  const win = existsSync(join(projectPath, "node_modules", ".bin", `${name}.CMD`));
  const nix = existsSync(join(projectPath, "node_modules", ".bin", name));
  if (win || nix) return `.${sep}node_modules${sep}.bin${sep}${name}`;
  return null;
}

/** appهایی که پوشه‌شان هست. */
function apps(projectPath) {
  const dir = join(projectPath, "apps");
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * فهرستِ قدم‌های پایانی برای این پروژه.
 *
 * @param {string} projectPath
 * @param {object} probe خروجیِ probeProject — برای اینکه دوباره دیسک را نکاویم
 * @returns {Array<{id,title,command,done,why,manual}>}
 */
export function finishSteps(projectPath, probe) {
  const steps = [];
  const has = (rel) => existsSync(join(projectPath, rel));
  const appList = apps(projectPath);
  const services = composeServices(projectPath);
  const nodeApps = appList.filter((a) => has(join("apps", a, "package.json")));
  const pyApps = appList.filter((a) => has(join("apps", a, "requirements.txt")));

  // ۱) فایلِ env واقعی
  if (has(".env.example")) {
    steps.push({
      id: "env",
      title: "ساختِ فایلِ .env",
      why: ".env.example نقشه است و کامیت می‌شود؛ .env مقدارهای واقعیِ توست و کامیت نمی‌شود.",
      command: `copy "${join(projectPath, ".env.example")}" "${join(projectPath, ".env")}"`,
      done: has(".env"),
    });
  }

  // ۲) کلیدهایی که باید دستی پر شوند
  const empty = emptyEnvVars(projectPath);
  if (empty.length) {
    steps.push({
      id: "keys",
      title: "پر کردنِ کلیدها",
      why: `این متغیرها خالی‌اند و بی آن‌ها سرویسِ مربوطه کار نمی‌کند: ${empty.join("، ")}`,
      command: `notepad "${join(projectPath, ".env")}"`,
      done: false,
      manual: true,
    });
  }

  // ۳) نصبِ وابستگی‌ها
  if (has("package.json")) {
    const missing = !has("node_modules") || nodeApps.some((a) => !has(join("apps", a, "node_modules")));
    steps.push({
      id: "install",
      title: "نصبِ وابستگی‌ها",
      why: "پکیج‌ها روی دیسک نیستند تا نصب نشوند؛ اسمشان در package.json کافی نیست.",
      command: `cd "${projectPath}"; ${has("pnpm-lock.yaml") ? "pnpm install" : "npm install"}`,
      done: !missing,
    });
  }

  // ۴) محیطِ پایتون
  for (const app of pyApps) {
    steps.push({
      id: `venv-${app}`,
      title: `محیطِ پایتونِ ${app}`,
      why: "این سرویس پایتونی است و محیطِ مجازیِ خودش را می‌خواهد.",
      command:
        `cd "${projectPath}"; python -m venv apps/${app}/.venv; ` +
        `apps/${app}/.venv/Scripts/python -m pip install -r apps/${app}/requirements.txt`,
      done: has(join("apps", app, ".venv")),
    });
  }

  // ۵) بالا آوردنِ سرویس‌ها
  if (services.length) {
    const up = probe?.docker?.services
      ? Object.values(probe.docker.services).filter((s) => s.state === "present").length
      : 0;
    steps.push({
      id: "compose",
      title: "بالا آوردنِ سرویس‌ها",
      why: `${services.join("، ")} — نوشتنشان در فایل یعنی اعلام، نه اجرا.`,
      command:
        `cd "${projectPath}"; docker compose --env-file .env -f deployment/docker-compose.yml up -d`,
      done: services.length > 0 && up >= services.length,
    });
  }

  // ۶) سنجشِ سلامت.
  //
  // بیلدِ تنها کافی نیست: خطای نوع، ایرادِ lint و تستِ شکسته هیچ‌کدام در بیلد
  // معلوم نمی‌شوند. پس هر چهار کار با هم اجرا می‌شوند — ولی فقط آن‌هایی که
  // واقعاً در پروژه تعریف شده‌اند، وگرنه فرمان روی کارِ ناموجود می‌شکند.
  const checks = ["lint", "typecheck", "build", "test"].filter((name) =>
    scriptsOf(join(projectPath, "package.json"))[name] ||
    appList.some((a) => scriptsOf(join(projectPath, "apps", a, "package.json"))[name]),
  );
  if (checks.length) {
    const runner = multiScriptCommand(projectPath, checks, appList);
    if (runner) {
      steps.push({
        id: "check",
        title: "بررسیِ سالم‌بودن",
        why: `${checks.join("، ")} — قبل از اجرا یک‌بار همه را بزن تا اگر چیزی نیمه‌کاره مانده همین‌جا معلوم شود.`,
        command: `cd "${projectPath}"; ${runner}`,
        done: false,
        manual: true,
      });
    }
  }

  // ۷) اجرا — همان منطق: فرمانی که وجود ندارد پیشنهاد نمی‌شود
  const devCmd = scriptCommand(projectPath, "dev", appList) || scriptCommand(projectPath, "start", appList);
  if (devCmd) {
    steps.push({
      id: "dev",
      title: "اجرای برنامه",
      why: "آخرین قدم: بالا بیاورش و در مرورگر ببین.",
      command: `cd "${projectPath}"; ${devCmd}`,
      done: false,
      manual: true,
    });
  }

  return steps;
}
