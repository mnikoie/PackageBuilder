/**
 * اعمالِ واقعیِ یک تصمیم.
 *
 * تا قدمِ ۶ ابزار فقط **می‌دید**. از اینجا **کار می‌کند** — ولی با چهار شرط
 * که همه‌شان از تصمیمِ ۰۰۰۱ می‌آیند:
 *
 * ۱. هر فرمان در ترمینالِ قابلِ دیدن اجرا می‌شود، نه پشتِ صحنه.
 * ۲. کارِ کاربر هرگز بازنویسی نمی‌شود؛ اگر فایلی دستی ویرایش شده، ابزار
 *    عقب می‌کشد و می‌گوید چه چیزی را خودت اضافه کن.
 * ۳. تکرارِ یک کار خرابی نمی‌سازد (همه‌ی نویسنده‌ها idempotentاند).
 * ۴. آخرِ کار، وضعیتِ واقعی **دوباره خوانده** می‌شود. اینکه فرمان فرستاده شد
 *    دلیلِ موفقیت نیست.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

import { technologyById, categoryById, removalFor } from "./registry.mjs";
import { probeProject, PRESENT } from "./detect.mjs";
import { resolveRegistry } from "./resolve.mjs";
import { persianDate } from "./skeleton.mjs";
import { commitDecision, isRepo, isClean, changedFiles, findDecisionCommit } from "./git.mjs";

/** نشانی که می‌گوید این فایل را ابزار ساخته و مالکش است. */
export const GENERATED_MARKER = "# ساختهٔ PackageBuilder — دست‌نویس ویرایش نکن";

// ------------------------------------------------------------------ متغیرهای env

/**
 * افزودنِ متغیرها به `.env.example`، بی‌آنکه مقدارِ موجود عوض شود.
 *
 * چرا فقط اضافه و هرگز تغییر: ممکن است کاربر مقدارِ واقعی گذاشته باشد.
 * بازنویسی‌اش یعنی خراب‌کردنِ کارش.
 */
export function applyEnvVars(projectPath, { techLabel, vars }) {
  const file = join(projectPath, ".env.example");
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const present = new Set();
  for (const line of existing.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) present.add(m[1]);
  }

  const missing = Object.entries(vars).filter(([name]) => !present.has(name));
  if (missing.length === 0) return { changed: false, added: [], skipped: Object.keys(vars) };

  const block = [
    "",
    `# ---- ${techLabel} ----`,
    ...missing.map(([name, value]) => `${name}=${value}`),
    "",
  ].join("\n");

  const next = existing.endsWith("\n") || existing === "" ? existing + block.slice(1) : existing + block;
  writeFileSync(file, next, "utf8");
  return {
    changed: true,
    added: missing.map(([n]) => n),
    skipped: Object.keys(vars).filter((n) => present.has(n)),
  };
}

/**
 * اجازهٔ اجرای اسکریپتِ بیلد به چند پکیج، در `pnpm-workspace.yaml`.
 *
 * چرا لازم است: pnpm ۱۰+ به‌دلیلِ امنیت، `postinstall`ِ پکیج‌ها را بی‌اجازه
 * اجرا نمی‌کند و با `[ERR_PNPM_IGNORED_BUILDS]` کدِ خروجِ غیرصفر می‌دهد. پکیج
 * نصب می‌شود ولی ناقص است — و ابزار درست «شکست» گزارش می‌دهد.
 *
 * ما این فایل را خودمان می‌سازیم، پس ادغامِ سطری بی‌خطر است. اگر فایل نبود،
 * ساخته نمی‌شود: بی workspace، این تنظیم جایی ندارد.
 */
/**
 * مطمئن شو pnpm-workspace.yaml واقعاً «workspace» را اعلام کرده.
 *
 * چرا writeFile کافی نبود: writeFile عمداً روی فایلِ موجود دست
 * نمی‌زند (تا کارِ کاربر را پاک نکند). ولی pnpm ۱۱ خودش همین فایل را
 * برای تنظیماتش می‌سازد (allowBuilds). نتیجه در اجرای واقعی دیده شد: Nx
 * نصب شد، ابزار «موفق» گفت، ولی بخشِ packages هرگز نوشته نشد — یعنی
 * مونوریپویی که appهایش را نمی‌بیند.
 *
 * پس این گام ادغام می‌کند: فایلِ نبود → همان قالب را می‌نویسد (دقیقاً
 * مثلِ قبل)؛ فایلِ بود → فقط آنچه کم است را اضافه می‌کند و بقیه را
 * دست‌نخورده می‌گذارد.
 */
export function ensurePnpmWorkspace(projectPath, content) {
  const file = join(projectPath, "pnpm-workspace.yaml");
  if (!existsSync(file)) {
    writeFileSync(file, content, "utf8");
    return { changed: true, created: true };
  }

  let text = readFileSync(file, "utf8");
  const added = [];

  if (!/^packages:\s*$/m.test(text)) {
    const block = content
      .split(/\r?\n/)
      .filter((l) => /^packages:\s*$/.test(l) || /^\s+-\s/.test(l))
      .join("\n");
    text = block + "\n\n" + text.replace(/^\uFEFF/, "");
    added.push("packages");
  }

  if (!/^strictDepBuilds:/m.test(text)) {
    text = text.replace(/\s*$/, "") + "\nstrictDepBuilds: false\n";
    added.push("strictDepBuilds");
  }

  if (!added.length) return { changed: false, reason: "از قبل کامل بود" };
  writeFileSync(file, text, "utf8");
  return { changed: true, added };
}

export function allowPnpmBuilds(projectPath, packages) {
  const file = join(projectPath, "pnpm-workspace.yaml");
  if (!existsSync(file)) return { changed: false, reason: "فایلِ workspace نیست" };

  // نگارشِ اول کلیدِ `onlyBuiltDependencies` را نوشت — نگارشِ pnpm ۱۰. ولی
  // pnpm ۱۱ کلیدِ `allowBuilds` با مقدارِ بولی می‌خواهد، و خودش هم همین را
  // به فایل اضافه کرد با یادداشتِ «set this to true or false». پس همان.
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  // بلوکِ allowBuilds را پیدا یا می‌سازیم، و ورودی‌های ناتمامِ خودِ pnpm را
  // («pkg: set this to true or false») به true تبدیل می‌کنیم.
  const out = [];
  let inBlock = false;
  const seen = new Set();

  for (const line of lines) {
    if (/^allowBuilds:\s*$/.test(line)) { inBlock = true; out.push(line); continue; }
    if (inBlock) {
      const m = line.match(/^\s{2}([^\s:]+):\s*(.*)$/);
      if (m) {
        seen.add(m[1]);
        out.push(`  ${m[1]}: true`); // چه true بوده چه یادداشتِ ناتمامِ pnpm
        continue;
      }
      if (line.trim() !== "") inBlock = false;
    }
    // بلوکِ منسوخِ نگارشِ قبلیِ خودمان را دور می‌ریزیم
    if (/^onlyBuiltDependencies:\s*$/.test(line)) { inBlock = "legacy"; continue; }
    if (inBlock === "legacy") {
      if (/^\s+-\s+/.test(line) || line.trim() === "") continue;
      inBlock = false;
    }
    out.push(line);
  }

  const missing = packages.filter((p) => !seen.has(p));
  let next = out.join("\n").replace(/\n{3,}/g, "\n\n");

  if (missing.length) {
    if (seen.size > 0) {
      next = next.replace(/^allowBuilds:\s*$/m, (h) => h + "\n" + missing.map((p) => `  ${p}: true`).join("\n"));
    } else {
      const sep = next.endsWith("\n") ? "" : "\n";
      next += sep + "\n# اجازهٔ اجرای اسکریپتِ بیلد — بی این، pnpm نصب را ناقص می‌گذارد\n" +
        "allowBuilds:\n" + missing.map((p) => `  ${p}: true`).join("\n") + "\n";
    }
  }

  if (next === text) return { changed: false, allowed: packages };
  writeFileSync(file, next.endsWith("\n") ? next : next + "\n", "utf8");
  return { changed: true, allowed: packages };
}

/**
 * چه چیزهایی از یک اعمالِ **شکست‌خورده** روی دیسک مانده‌اند.
 *
 * چرا لازم است: وقتی گامِ آخر می‌شکند، گام‌های قبلی همان‌جا مانده‌اند —
 * پوشه‌ها، فایل‌ها، پکیج‌های نصب‌شده، سرویس‌های بالا آمده. نگارشِ قبلی فقط
 * می‌گفت «شکست خورد» و ساکت می‌ماند؛ کاربر نمی‌دانست پروژه‌اش الان در چه
 * حالی است و چرا درختِ گیتش کثیف شده. (nextVersion.md بندِ ۳)
 *
 * عمداً چیزی را خودمان پاک نمی‌کنیم: ممکن است کاربر همان لحظه دستی درستش
 * کرده باشد. فقط صریح می‌گوییم چه هست و تصمیم را به او می‌سپاریم.
 *
 * @param {Array<object>} performed گام‌هایی که واقعاً انجام شدند
 * @returns {string[]} توضیحِ خوانا، به ترتیبِ انجام
 */
export function describeLeftovers(performed = []) {
  const out = [];
  for (const step of performed) {
    if (step.kind === "writeFile" && step.changed) out.push(`فایلِ ساخته‌شده: ${step.path}`);
    else if (step.kind === "mkdir" && step.changed) out.push(`پوشهٔ ساخته‌شده: ${step.path}`);
    else if (step.kind === "pnpmWorkspace" && step.changed) out.push("pnpm-workspace.yaml نوشته یا کامل شد");
    else if (step.kind === "cli" && step.ok) out.push(`فرمانی که اجرا شد: ${step.command}`);
    else if (step.kind === "composeUp" && step.ok) out.push(`سرویسِ بالا آمده: ${step.service}`);
    else if (step.kind === "compose" && step.changed) out.push("deployment/docker-compose.yml از نو ساخته شد");
    else if (step.kind === "env" && step.changed) out.push(`متغیرهای env که اضافه شدند: ${(step.added || []).join("، ")}`);
    else if (step.kind === "ports" && Object.keys(step.vars || {}).length) {
      out.push(`پورت‌هایی که انتخاب و ذخیره شدند: ${Object.entries(step.vars).map(([k, v]) => `${k}=${v}`).join("، ")}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- پورتِ آزاد

/**
 * پورت‌هایی که کانتینرهای Docker همین حالا روی میزبان گرفته‌اند.
 *
 * چرا از خودِ Docker می‌پرسیم و نه با تلاشِ bind:
 * روی ویندوز، bind روی پورتی که پروکسیِ Docker گرفته، همیشه خطا نمی‌دهد. پس
 * probeِ شبکه می‌گفت «آزاد است» در حالی که `docker ps` نشان می‌داد
 * `0.0.0.0:5432->5432` گرفته شده. نتیجه‌اش این بود که سرویس بالا می‌آمد ولی
 * **بدونِ نگاشتِ پورت** — یعنی دیتابیسی که از میزبان قابلِ دسترس نبود، و ابزار
 * هم آن را «موفق» گزارش می‌کرد. (در آزمایشِ زنده گرفته شد.)
 *
 * منبعِ تصادم، خودِ Docker است؛ پس مرجع هم باید همان باشد.
 */
export function dockerPublishedPorts(run = defaultRun) {
  const res = run("docker", ["ps", "--format", "{{.Ports}}"]);
  if (res.error || res.status !== 0) return { known: false, ports: new Set() };

  const ports = new Set();
  for (const line of (res.stdout || "").split(/\r?\n/)) {
    // نمونه: «0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp»
    // و بازه: «0.0.0.0:9000-9001->9000-9001/tcp»
    for (const m of line.matchAll(/:(\d+)(?:-(\d+))?->/g)) {
      const from = Number(m[1]);
      const to = m[2] ? Number(m[2]) : from;
      for (let p = from; p <= to; p++) ports.add(p);
    }
  }
  return { known: true, ports };
}

const defaultRun = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", timeout: 10000 });

/**
 * اولین پورتِ آزاد از `from` به بالا.
 *
 * تضمین نیست — بینِ انتخاب و بالا آمدنِ کانتینر فاصله‌ای هست. اگر باز تصادم
 * شد، خطای واقعیِ Docker در ترمینال دیده می‌شود و اعمال شکست‌خورده اعلام
 * می‌شود، نه موفق.
 */
export function findFreePort(from, { taken = new Set(), tries = 60 } = {}) {
  for (let port = from; port < from + tries; port++) {
    if (!taken.has(port)) return port;
  }
  return null;
}

/**
 * کدام متغیرهای پورت در `.env` مقداری دارند که همین حالا اشغال است.
 *
 * فقط وقتی جواب می‌دهد که فهرستِ پورت‌های Docker خوانده شده باشد؛ اگر
 * نخوانده باشیم، چیزی «کهنه» اعلام نمی‌شود — نامعلوم به حکم ترجمه نمی‌شود.
 */
export function staleTakenPortVars(projectPath, vars, { run = defaultRun } = {}) {
  const file = join(projectPath, ".env");
  if (!existsSync(file)) return [];

  const { known, ports } = dockerPublishedPorts(run);
  if (!known) return [];

  const text = readFileSync(file, "utf8");
  const stale = [];
  for (const [key, value] of Object.entries(vars)) {
    const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*$`, "m"));
    if (!m) continue;
    const current = Number(m[1]);
    if (current !== Number(value) && ports.has(current)) stale.push(key);
  }
  return stale;
}

/** پورت‌های آزاد برای سرویس‌های یک تکنولوژی، به‌صورتِ متغیرهای env. */
export function resolvePorts(services, { run = defaultRun } = {}) {
  const { known, ports } = dockerPublishedPorts(run);
  const taken = new Set(ports);
  const vars = {};
  const notes = [];

  if (!known) notes.push("پورت‌های گرفته‌شده از Docker خوانده نشد — پیش‌فرض‌ها استفاده می‌شوند");

  for (const s of services) {
    for (const p of s.ports || []) {
      const free = findFreePort(p.host, { taken });
      if (free === null) {
        notes.push(`پورتِ آزادی نزدیکِ ${p.host} برای ${s.service} پیدا نشد`);
        continue;
      }
      vars[p.env] = String(free);
      taken.add(free); // تا دو سرویس یک پورت نگیرند
      if (free !== p.host) notes.push(`${s.service}: پورتِ ${p.host} مشغول بود، ${free} انتخاب شد`);
    }
  }
  return { vars, notes };
}

// -------------------------------------------------------------- فایلِ compose

/**
 * فایلِ compose از رویِ تصمیم‌ها **ساخته** می‌شود، نه وصله‌زده.
 *
 * چرا: وصله‌زدنِ متنیِ YAML شکننده است. ابزار خودش این فایل را می‌سازد و
 * صاحبش است — پس همیشه سالم و کامل است.
 *
 * ولی مالکیت مشروط است: اگر فایل نشانِ ما را نداشته باشد، یعنی کاربر خودش
 * نوشته یا ویرایش کرده. آن‌وقت **دست نمی‌زنیم** و تکه‌ی YAMLای که باید اضافه
 * شود را برمی‌گردانیم تا خودش بچسباند.
 *
 * نکتهٔ مهمِ `name`: دامنهٔ Docker از این فیلد می‌آید، نه از مسیرِ پوشه. اگر دو
 * کپیِ پروژه نامِ یکسان داشته باشند، وضعیتِ هم را نشان می‌دهند و
 * `compose down` در یکی، سرویسِ دیگری را می‌خواباند. پس همیشه با slugِ پروژه
 * پرش می‌کنیم.
 */
export function generateCompose(projectPath, { slug, services }) {
  const file = join(projectPath, "deployment", "docker-compose.yml");
  const snippet = renderComposeServices(services);

  if (existsSync(file)) {
    const current = readFileSync(file, "utf8");
    if (!current.includes(GENERATED_MARKER)) {
      return {
        changed: false,
        ownedByUser: true,
        snippet,
        message:
          "فایلِ docker-compose.yml را خودت نوشته‌ای، پس دست نمی‌زنم. " +
          "این تکه را خودت داخلِ بخشِ services بگذار.",
      };
    }
  }

  // هر سرویسی که volume دارد، باید در بخشِ بالای volumes هم **تعریف** شود؛
  // وگرنه خودِ Docker فایل را نامعتبر می‌داند:
  // «refers to undefined volume postgres_data: invalid compose project».
  // (این را آزمایشِ زنده پیدا کرد، نه تستِ واحد.)
  const named = services.filter((s) => s.volume).map((s) => `${s.service}_data`);

  const body = [
    GENERATED_MARKER,
    "# محتوایش از تصمیم‌های ثبت‌شده در project.config.json ساخته می‌شود.",
    "#",
    "# «name» دامنهٔ Docker را تعیین می‌کند، نه مسیرِ پوشه. اگر دو کپی از این",
    "# پروژه نامِ یکسان داشته باشند، وضعیتِ هم را نشان می‌دهند — پس این نام",
    "# باید یکتا بماند.",
    `name: ${slug}`,
    "",
    ...(services.length ? ["services:", snippet] : ["services: {}"]),
    ...(named.length ? ["", "volumes:", ...named.map((v) => `  ${v}:`)] : []),
  ].join("\n");

  mkdirSync(dirname(file), { recursive: true });
  const next = body.endsWith("\n") ? body : body + "\n";
  const changed = !existsSync(file) || readFileSync(file, "utf8") !== next;
  if (changed) writeFileSync(file, next, "utf8");
  return { changed, ownedByUser: false, services: services.map((s) => s.service) };
}

function renderComposeServices(services) {
  return services
    .map((s) => {
      const lines = [`  ${s.service}:`, `    image: ${s.image}`, "    restart: unless-stopped"];
      if (s.command) lines.push(`    command: ${s.command}`);
      if (s.ports?.length) {
        lines.push("    ports:");
        for (const p of s.ports) {
          // پورتِ میزبان از متغیرِ env می‌آید، با پیش‌فرضِ خودش. چرا:
          // روی یک کامپیوتر چند پروژه ساخته می‌شود و پورتِ ثابت همیشه تصادم
          // می‌کند («port is already allocated»). این را آزمایشِ زنده نشان داد.
          lines.push(`      - "\${${p.env}:-${p.host}}:${p.container}"`);
        }
      }
      if (s.environment && Object.keys(s.environment).length) {
        lines.push("    environment:");
        // کلیدهای نقطه‌دار (مثلِ discovery.type) باید در گیومه باشند.
        for (const [k, v] of Object.entries(s.environment)) {
          lines.push(`      ${k.includes(".") ? `"${k}"` : k}: ${v}`);
        }
      }
      // مسیرِ دادهٔ هر ایمیج فرق دارد؛ پس از رجیستری می‌آید، نه حدسی.
      if (s.volume) lines.push("    volumes:", `      - ${s.service}_data:${s.volume}`);
      return lines.join("\n");
    })
    .join("\n");
}

/** سرویس‌های composeِ همهٔ تکنولوژی‌هایی که در stack انتخاب شده‌اند. */
export function composeServicesFor(stack) {
  const services = [];
  for (const techId of Object.values(stack || {})) {
    if (!techId) continue;
    const tech = technologyById(techId);
    for (const step of tech?.apply?.steps || []) {
      if (step.kind === "composeService") {
        services.push({
          service: step.service,
          image: step.image,
          ports: step.ports,
          environment: step.environment,
          command: step.command,
          volume: step.volume,
        });
      }
    }
  }
  return services;
}

// ------------------------------------------------------- سندِ تصمیم و کانفیگ

/** شمارهٔ بعدیِ سندِ تصمیم. */
export function nextDecisionNumber(projectPath) {
  const dir = join(projectPath, "docs", "decisions");
  if (!existsSync(dir)) return 1;
  const numbers = readdirSync(dir)
    .map((f) => f.match(/^(\d{4})-/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

/**
 * نوشتنِ سندِ تصمیم — با **دلیل** و **گزینه‌های ردشده**.
 *
 * این همان چیزی است که از خواندنِ کد هرگز فهمیده نمی‌شود: چرا این و نه آن.
 */
export function writeDecisionDoc(projectPath, { tech, alternatives, number, date = new Date() }) {
  const category = categoryById(tech.category);
  const num = String(number).padStart(4, "0");
  const file = join(projectPath, "docs", "decisions", `${num}-${tech.category}-${tech.id}.md`);

  const altRows = alternatives.length
    ? alternatives.map((a) => `| ${a.label} | ${a.meta.pros[0]} | ${a.meta.cons.join("؛ ")} |`).join("\n")
    : "| — | — | گزینهٔ دیگری در این دسته ثبت نشده |";

  const body = `# ${num} — ${category?.label || tech.category}: ${tech.label}

- **تاریخ:** ${persianDate(date)}
- **وضعیت:** ✅ پذیرفته‌شده

## زمینه

${category?.question || "این تصمیم لازم بود."}

## تصمیم

**${tech.label}** انتخاب شد.

دلیل‌ها:
${tech.meta.pros.map((p) => `- ${p}`).join("\n")}

عیب‌هایی که پذیرفته شد:
${tech.meta.cons.map((c) => `- ${c}`).join("\n")}

## گزینه‌های دیگر

| گزینه | مزیت | چرا انتخاب نشد |
|---|---|---|
${altRows}

## پیامدها

- فایل‌ها و وابستگی‌هایی که این تصمیم اضافه کرد، در همان کامیتِ این تصمیم‌اند.
- برگشت از این تصمیم با \`git revert\` همان کامیت انجام می‌شود — دقیقاً همان
  تغییرها پس گرفته می‌شوند، نه بیشتر و نه کمتر.
- \`project.config.json\` فقط **قصد** را ثبت می‌کند. نصب‌بودنِ واقعی جدا و با
  مدرک بررسی می‌شود (لینکِ node_modules، خروجیِ docker compose ps، وجودِ .venv).
`;

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, "utf8");
  return { file: `docs/decisions/${num}-${tech.category}-${tech.id}.md`, number };
}

/** ثبتِ تصمیم در project.config.json — «قصد»، نه «واقعیت». */
export function updateStackConfig(projectPath, category, techId) {
  const file = join(projectPath, "project.config.json");
  if (!existsSync(file)) return { changed: false, error: "project.config.json وجود ندارد." };

  let config;
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return { changed: false, error: `project.config.json خوانده نشد: ${err.message}` };
  }

  config.stack = config.stack || {};
  const before = config.stack[category] ?? null;
  if (before === techId) return { changed: false, previous: before };

  config.stack[category] = techId;
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n", "utf8");
  return { changed: true, previous: before };
}

// ------------------------------------------------------------------- اعمال

/**
 * اعمالِ یک تصمیم، از اول تا آخر.
 *
 * @param {object} opts
 * @param {string}  opts.projectPath
 * @param {string}  opts.techId
 * @param {object}  opts.terminal   ترمینالِ قابلِ دیدن (باید runAndWait داشته باشد)
 * @param {boolean} [opts.dryRun]   فقط بگو چه می‌کنی
 * @param {boolean} [opts.commit]   کامیتِ جدا بزن (پیش‌فرض: بله)
 */
export async function applyTechnology({
  projectPath, techId, terminal, dryRun = false, commit = true, date = new Date(),
  // چک‌کنندهٔ پورتِ منتشرشده. قابلِ تزریق است چون در تست، ترمینالِ تقلبی واقعاً
  // «docker compose up» نمی‌زند — پس چکِ واقعی همیشه شکست می‌خورد.
  dockerPorts = dockerPublishedPorts,
} = {}) {
  const tech = technologyById(techId);
  if (!tech) return { ok: false, error: `تکنولوژیِ ناشناخته: ${techId}` };
  if (!existsSync(projectPath)) return { ok: false, error: `مسیر وجود ندارد: ${projectPath}` };

  const before = probeProject(projectPath);
  const resolvedBefore = resolveRegistry(projectPath, { probe: before });
  const category = resolvedBefore.categories.find((c) => c.id === tech.category);
  const option = category?.options.find((o) => o.id === techId);

  // پیش‌نیازِ برآورده‌نشده → عقب می‌کشیم. اجرا کردنِ فرمانی که قطعاً شکست
  // می‌خورد، فقط سردرگمی می‌سازد.
  if (option?.missingRequirements.length) {
    return {
      ok: false,
      error: `پیش‌نیازها نصب نیستند: ${option.missingRequirements.join("، ")}`,
      needs: option.missingRequirements,
    };
  }

  // اگر همین حالا نصب است، دوباره نصبش نمی‌کنیم.
  if (option?.state === PRESENT) {
    return { ok: true, alreadyPresent: true, techId, evidence: option.evidence, steps: [] };
  }

  // ناسازگاری: گزینهٔ رقیب نصب است → خودمان تصمیم نمی‌گیریم.
  if (category?.conflict) {
    return {
      ok: false,
      error: `در دستهٔ «${category.label}» چند گزینه همزمان نصب‌اند: ${category.conflict.join("، ")}. اول یکی را بردار.`,
      conflict: category.conflict,
    };
  }
  const rival = category?.options.find((o) => o.state === PRESENT && o.id !== techId);
  if (rival) {
    return {
      ok: false,
      error: `«${rival.label}» در همین دسته نصب است. اول آن را برگردان، بعد این را نصب کن.`,
      rival: rival.id,
    };
  }

  const planned = [];
  const performed = [];

  // پورت‌های این تکنولوژی یک‌بار و **پیش از** نوشتنِ هر آدرسی معلوم می‌شوند.
  //
  // چرا تنبل: فقط تکنولوژی‌هایی که سرویسِ Docker دارند به این نیاز دارند، و
  // پرسیدنش یک فراخوانیِ docker است. چرا زودتر: مقدارِ env مثلِ
  // `postgresql://...@localhost:${POSTGRES_PORT}/app` باید در همان لحظهٔ
  // نوشته‌شدن پورتِ واقعی را داشته باشد. نگارشِ قبلی اول env را می‌نوشت و بعد
  // پورت را انتخاب می‌کرد، پس آدرس با پورتِ پیش‌فرض می‌ماند در حالی که سرویس
  // روی پورتِ دیگری بالا آمده بود.
  let portsMemo = null;
  const getPorts = () => {
    if (portsMemo) return portsMemo;
    const config = readConfig(projectPath);
    const stack = { ...(config?.stack || {}), [tech.category]: techId };
    const mine = composeServicesFor(stack).filter((svc) =>
      tech.apply.steps.some((st) => st.kind === "composeService" && st.service === svc.service),
    );
    portsMemo = mine.length ? resolvePorts(mine) : { vars: {}, notes: [] };
    return portsMemo;
  };

  /** `${VAR}` را با پورتِ واقعی جایگزین می‌کند؛ ناشناخته‌ها دست‌نخورده می‌مانند. */
  const withRealPorts = (vars) => {
    if (!Object.values(vars).some((v) => typeof v === "string" && v.includes("${"))) return vars;
    const portVars = getPorts().vars;
    const out = {};
    for (const [k, v] of Object.entries(vars)) {
      out[k] = typeof v === "string"
        ? v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name) => portVars[name] ?? m)
        : v;
    }
    return out;
  };

  for (const step of tech.apply.steps) {
    if (step.kind === "mkdir") {
      // بعضی CLIهای رسمی توقع دارند پوشهٔ والد از قبل باشد. مثلاً
      // `create-next-app apps/web` وقتی apps/ نباشد می‌گوید
      // «The application path is not writable» — که پیامِ گمراه‌کننده‌ای است
      // برای «پوشهٔ والد وجود ندارد». (در آزمایشِ زنده گرفته شد.)
      planned.push({ kind: "mkdir", path: step.path });
      if (dryRun) continue;
      mkdirSync(join(projectPath, step.path), { recursive: true });
      performed.push({ kind: "mkdir", path: step.path });
      continue;
    }

    if (step.kind === "pnpmWorkspace") {
      planned.push({ kind: "writeFile", path: "pnpm-workspace.yaml" });
      if (dryRun) continue;
      performed.push({ kind: "pnpmWorkspace", ...ensurePnpmWorkspace(projectPath, step.content) });
      continue;
    }

    if (step.kind === "writeFile") {
      planned.push({ kind: "writeFile", path: step.path });
      if (dryRun) continue;
      const dest = join(projectPath, step.path);
      if (existsSync(dest)) {
        // فایلِ جای‌نگه‌دار: فقط برای وقتی است که هنوز چیزی نساخته باشد. اگر
        // فریم‌ورکِ واقعی از قبل ساخته باشدش، ردشدن از رویش خبرِ گفتنی نیست.
        performed.push({ kind: "writeFile", path: step.path, skipped: "از قبل بود، دست نزدم", placeholder: !!step.placeholder });
      } else {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, step.content, "utf8");
        performed.push({ kind: "writeFile", path: step.path, changed: true });
      }
      continue;
    }

    if (step.kind === "pnpmAddDev" || step.kind === "pnpmAdd") {
      // pnpm ۱۰+ اسکریپتِ بیلدِ پکیج‌ها را بی‌اجازه اجرا نمی‌کند و با
      // [ERR_PNPM_IGNORED_BUILDS] کدِ خروجِ غیرصفر می‌دهد — یعنی نصب ناقص است.
      // (nx و cypress هر دو به آن خوردند.) اجازه را از قبل در فایلِ workspace
      // می‌نویسیم؛ این همان «لایهٔ چسبِ» تصمیمِ ۰۰۰۳ است.
      if (step.allowBuild?.length && !dryRun) {
        performed.push({ kind: "allowBuild", ...allowPnpmBuilds(projectPath, step.allowBuild) });
      }
      // pnpm سرِ این یک نکته سخت‌گیر است: داخلِ workspace باید «-w» بدهی و
      // بیرونش نباید. پس فرمان را از رویِ واقعیتِ پوشه می‌سازیم، نه حدسی.
      //
      // این تنها شرطِ داخلِ موتور است، و عمداً: مربوط به قلقِ خودِ pnpm است،
      // نه به یک تکنولوژیِ خاص. وگرنه هر رکوردِ رجیستری باید دو نسخه داشت.
      //
      // pnpmAdd همان کار را برای وابستگیِ معمولی می‌کند (نه ابزارِ توسعه):
      // درایورِ دیتابیس جزوِ خودِ برنامه است، پس -D نمی‌گیرد.
      //
      // معیارِ «داخلِ workspace» وجودِ فایل نیست، داشتنِ بخشِ packages است: pnpm ۱۱
      // همین فایل را برای تنظیماتِ خودش هم می‌سازد (allowBuilds)، و آن فایلِ تنظیماتی
      // اصلاً workspace نیست. آزموده شد: با چنین فایلی، pnpm پرچمِ -w نمی‌خواهد.
      const wsFile = join(projectPath, "pnpm-workspace.yaml");
      const inWorkspace = existsSync(wsFile) && /^packages:\s*$/m.test(readFileSync(wsFile, "utf8"));
      const dev = step.kind === "pnpmAddDev";
      const flag = inWorkspace ? (dev ? "-Dw" : "-w") : dev ? "-D" : "";
      // پرچمِ رسمیِ خودِ pnpm برای اجازهٔ بیلد. لازم است چون نوشتنِ اجازه در
      // فایل، وقتی فایل هنوز ساخته نشده، کاری نمی‌کند — و در پروژهٔ تک‌پکیجی
      // همیشه همین طور است. بی این پرچم، better-sqlite3 نصب می‌شد ولی بیلد رد
      // می‌شد و pnpm کلِ نصب را شکست‌خورده اعلام می‌کرد.
      const allow = step.allowBuild?.length ? `--allow-build=${step.allowBuild.join(",")}` : "";
      const command = ["pnpm add", flag, allow, step.packages.join(" ")].filter(Boolean).join(" ");
      planned.push({ kind: "cli", command });
      if (dryRun) continue;
      if (!terminal) return { ok: false, error: "ترمینالی برای اجرای فرمان داده نشد." };
      const res = await terminal.runAndWait(`cd "${projectPath}"; ${command}`);
      performed.push({ kind: "cli", command, ok: res.ok });
      if (!res.ok) {
        return { ok: false, error: `فرمان شکست خورد: ${command}`, steps: performed, hint: "خروجیِ واقعی در ترمینال است." };
      }
      continue;
    }

    if (step.kind === "cli") {
      planned.push({ kind: "cli", command: step.command });
      if (dryRun) continue;
      if (!terminal) return { ok: false, error: "ترمینالی برای اجرای فرمان داده نشد." };
      const res = await terminal.runAndWait(`cd "${projectPath}"; ${step.command}`);
      performed.push({ kind: "cli", command: step.command, ok: res.ok, reason: res.reason });
      if (!res.ok) {
        return {
          ok: false,
          error: `فرمان شکست خورد: ${step.command}${res.reason ? ` (${res.reason})` : ""}`,
          steps: performed,
          hint: "خروجیِ واقعی در ترمینال است.",
        };
      }
    } else if (step.kind === "env") {
      planned.push({ kind: "env", vars: Object.keys(step.vars) });
      if (dryRun) continue;
      performed.push({
        kind: "env",
        ...applyEnvVars(projectPath, { techLabel: tech.label, vars: withRealPorts(step.vars) }),
      });
    } else if (step.kind === "composeService") {
      planned.push({ kind: "composeService", service: step.service });
    } else if (step.kind === "file") {
      planned.push({ kind: "file", path: step.path, role: step.role });
    }
  }

  // فایلِ compose یک‌جا و کامل ساخته می‌شود، از رویِ همهٔ تصمیم‌ها.
  const needsCompose = tech.apply.steps.some((s) => s.kind === "composeService");
  if (needsCompose && !dryRun) {
    const config = readConfig(projectPath);
    const stack = { ...(config?.stack || {}), [tech.category]: techId };
    const allServices = composeServicesFor(stack);

    // پورت‌ها: آزاد را پیدا کن و در env بنویس. هم در .env.example (نقشه) و هم
    // در .env (که خودِ Docker می‌خواندش) — وگرنه پیش‌فرضِ مشغول استفاده می‌شود.
    // (getPorts همان حافظه‌ای است که گامِ env هم از آن استفاده کرده، پس آدرس و
    // پورتِ منتشرشده حتماً یکی‌اند.)
    const ports = getPorts();
    if (Object.keys(ports.vars).length) {
      performed.push({ kind: "ports", ...ports });
      applyEnvVars(projectPath, { techLabel: `${tech.label} — پورت‌ها`, vars: ports.vars });
      // اگر مقدارِ قبلیِ .env حالا واقعاً اشغال است، اصلاحش کن. مرجع همان
      // «چه پورت‌هایی گرفته‌اند»ِ خودِ Docker است، نه حدس.
      const stale = staleTakenPortVars(projectPath, ports.vars);
      writeDotEnvValues(projectPath, ports.vars, { force: stale });
      if (stale.length) performed.push({ kind: "portsCorrected", vars: stale });
    }

    const composeRes = generateCompose(projectPath, {
      slug: config?.slug || "app",
      services: allServices,
    });
    performed.push({ kind: "compose", ...composeRes });
    if (composeRes.ownedByUser) {
      return {
        ok: false,
        error: composeRes.message,
        snippet: composeRes.snippet,
        steps: performed,
      };
    }

    // نوشتنِ فایلِ compose «نصب» نیست؛ سرویس باید واقعاً بالا بیاید — چون
    // تصمیمِ ۰۰۰۳ می‌گوید خروجی باید کدِ کارکندهٔ قابلِ اجرا باشد.
    //
    // این را در داده تکرار نمی‌کنیم: هر تکنولوژی‌ای که سرویسِ Docker دارد،
    // اعمالش یعنی بالا آوردنش. پس یک قدمِ اضافیِ «composeUp» در رجیستری لازم
    // نیست و نمی‌تواند با واقعیت ناهمگام شود.
    const composeFile = join(projectPath, "deployment", "docker-compose.yml");
    for (const step of tech.apply.steps.filter((s) => s.kind === "composeService")) {
      if (!terminal) {
        performed.push({ kind: "composeUp", service: step.service, skipped: "ترمینالی داده نشد" });
        continue;
      }
      // «--force-recreate» لازم است: اگر از تلاشِ قبلی کانتینری با کانفیگِ
      // قدیمی مانده باشد، Docker همان را استارت می‌کند و نگاشتِ پورتِ جدید
      // اعمال نمی‌شود — که یعنی سرویسی بالا ولی غیرقابلِ دسترس.
      const res = await terminal.runAndWait(
        `docker compose --env-file "${join(projectPath, ".env")}" -f "${composeFile}" up -d --force-recreate ${step.service}`,
      );
      performed.push({ kind: "composeUp", service: step.service, ok: res.ok });
      if (!res.ok) {
        return {
          ok: false,
          error: `سرویسِ ${step.service} بالا نیامد. خروجیِ واقعی در ترمینال است.`,
          steps: performed,
        };
      }

      // بالا آمدن کافی نیست: پورت هم باید واقعاً روی میزبان منتشر شده باشد،
      // وگرنه برنامه نمی‌تواند به سرویس وصل شود.
      const wanted = (step.ports || []).map((p) => Number(ports.vars[p.env] ?? p.host));
      if (wanted.length) {
        const published = dockerPorts().ports;
        const missing = wanted.filter((p) => !published.has(p));
        if (missing.length) {
          performed.push({ kind: "portCheck", service: step.service, missing });
          return {
            ok: false,
            error:
              `سرویسِ ${step.service} بالا آمد ولی پورت ${missing.join("، ")} روی میزبان منتشر نشد — ` +
              `از بیرونِ کانتینر قابلِ دسترس نیست.`,
            steps: performed,
          };
        }
      }
    }
  }

  if (dryRun) {
    return { ok: true, dryRun: true, techId, label: tech.label, planned };
  }

  // ثبتِ تصمیم: هم سندِ خوانا، هم کانفیگِ ماشین‌خوان.
  const alternatives = (category?.options || []).filter((o) => o.id !== techId);
  const doc = writeDecisionDoc(projectPath, {
    tech,
    alternatives: alternatives.map((a) => ({ label: a.label, meta: a.meta })),
    number: nextDecisionNumber(projectPath),
    date,
  });
  performed.push({ kind: "decisionDoc", file: doc.file });
  performed.push({ kind: "config", ...updateStackConfig(projectPath, tech.category, techId) });

  // وضعیت را **دوباره** می‌خوانیم. فرستادنِ فرمان دلیلِ موفقیت نیست.
  const after = probeProject(projectPath);
  const optionAfter = resolveRegistry(projectPath, { probe: after })
    .categories.find((c) => c.id === tech.category)
    ?.options.find((o) => o.id === techId);

  let gitResult = null;
  if (commit && isRepo(projectPath)) {
    gitResult = commitDecision(projectPath, {
      subject: `${category?.label || tech.category}: ${tech.label}`,
      body: [
        `تصمیمِ ثبت‌شده در ${doc.file}`,
        "",
        `وضعیتِ واقعیِ بعد از نصب: ${optionAfter?.state} — ${optionAfter?.evidence}`,
      ].join("\n"),
      decisionId: techId,
    });
  }

  // فایلی که از قبل بود و دست نخورد، باید گفته شود.
  //
  // چرا: writeFile عمداً روی فایلِ موجود نمی‌نویسد (تا کارِ کاربر نپرد)، ولی
  // اگر ساکت رد شود، تکنولوژی نیمه‌وصل می‌ماند و ابزار «موفق» می‌گوید. در
  // اجرای واقعی دیده شد: قالبِ Vite فایلِ App.css داشت و چون ویندوز بزرگ و
  // کوچکِ حروف را یکی می‌بیند، فایلِ Tailwind هرگز نوشته نشد.
  const skippedFiles = performed
    .filter((x) => x.kind === "writeFile" && x.skipped && !x.placeholder)
    .map((x) => `${x.path} از قبل وجود داشت و دست‌نخورده ماند — اگر محتوایش را لازم داری، خودت نگاهش کن.`);

  return {
    ok: true,
    techId,
    label: tech.label,
    steps: performed,
    decisionDoc: doc.file,
    git: gitResult,
    manualSteps: skippedFiles.length ? skippedFiles : undefined,
    // مدرکِ واقعی، نه ادعا
    verified: optionAfter?.state === PRESENT,
    state: optionAfter?.state,
    evidence: optionAfter?.evidence,
  };
}

/**
 * برداشتنِ بلوکِ env مربوط به یک تکنولوژی.
 *
 * بلوک با `# ---- <برچسب> ----` علامت خورده، پس دقیقاً همان چیزی برداشته
 * می‌شود که خودمان اضافه کرده بودیم — نه یک خطِ بیشتر.
 */
export function removeEnvVars(projectPath, { techLabel, vars }) {
  const file = join(projectPath, ".env.example");
  if (!existsSync(file)) return { changed: false, removed: [] };

  const marker = `# ---- ${techLabel} ----`;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const names = new Set(Object.keys(vars || {}));
  const out = [];
  const removed = [];
  let inBlock = false;

  for (const line of lines) {
    if (line.trim() === marker) { inBlock = true; continue; }
    // بلوکِ ما با سرفصلِ بعدی یا یک خطِ ناشناخته تمام می‌شود.
    if (inBlock) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m && names.has(m[1])) { removed.push(m[1]); continue; }
      if (line.trim() === "") continue;
      inBlock = false;
    }
    out.push(line);
  }

  if (removed.length === 0) return { changed: false, removed: [] };
  const next = out.join("\n").replace(/\n{3,}/g, "\n\n");
  writeFileSync(file, next.endsWith("\n") ? next : next + "\n", "utf8");
  return { changed: true, removed };
}

/**
 * نوشتنِ مقدارها در `.env` واقعی (نه `.env.example`).
 *
 * لازم است چون `docker compose` متغیرهای `${...}` را از `.env` می‌خواند، نه از
 * `.env.example`. مقدارِ موجود عوض نمی‌شود — کارِ کاربر محفوظ است.
 *
 * `.env` در `.gitignore` است، پس در کامیت نمی‌آید (و نباید بیاید).
 */
export function writeDotEnvValues(projectPath, vars, { force = [] } = {}) {
  const file = join(projectPath, ".env");
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const present = new Set();
  for (const line of existing.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) present.add(m[1]);
  }
  // مقدارِ موجود عمداً دست نمی‌خورد (ممکن است کاربر خودش تنظیمش کرده باشد) —
  // مگر اینکه فراخوان صریح بگوید این کلید باید اصلاح شود. تنها کاربردش الان
  // پورتی است که **قابلِ اثبات** اشغال شده؛ نگه‌داشتنش یعنی نصبی که هر بار
  // شکست می‌خورد. در اجرای واقعی دیده شد: پورتِ redis وقتی Docker خواب بود
  // انتخاب و ذخیره شد، و بعد از برگشتنِ Docker همان مقدارِ کهنه استفاده
  // می‌شد و کانتینر بالا نمی‌آمد.
  const forced = new Set(force);
  const missing = Object.entries(vars).filter(([k]) => !present.has(k));
  const overwrite = Object.entries(vars).filter(([k]) => present.has(k) && forced.has(k));

  if (overwrite.length) {
    let text = existing;
    for (const [k, v] of overwrite) {
      text = text.replace(new RegExp(`^\\s*${k}\\s*=.*$`, "m"), `${k}=${v}`);
    }
    if (text !== existing) {
      writeFileSync(file, text, "utf8");
      const after = missing.length ? writeDotEnvValues(projectPath, Object.fromEntries(missing)) : { added: [] };
      return { changed: true, added: after.added, corrected: overwrite.map(([k]) => k) };
    }
  }

  if (missing.length === 0) return { changed: false, added: [] };

  const head = existing === "" ? "# مقدارهای واقعی. کامیت نمی‌شود.\n" : "";
  const sep = existing === "" || existing.endsWith("\n") ? "" : "\n";
  writeFileSync(file, existing + sep + head + missing.map(([k, v]) => `${k}=${v}`).join("\n") + "\n", "utf8");
  return { changed: true, added: missing.map(([k]) => k) };
}

/** سندِ تصمیم را «جایگزین‌شده» علامت می‌زند. پاکش نمی‌کنیم — تاریخ ارزش دارد. */
export function markDecisionSuperseded(projectPath, techId, { date = new Date() } = {}) {
  const dir = join(projectPath, "docs", "decisions");
  if (!existsSync(dir)) return { changed: false };

  const match = readdirSync(dir).find((f) => f.endsWith(`-${techId}.md`));
  if (!match) return { changed: false };

  const file = join(dir, match);
  const text = readFileSync(file, "utf8");
  if (text.includes("↩️ برگشت‌خورده")) return { changed: false, file: match };

  const next = text.replace(
    /^- \*\*وضعیت:\*\* .*$/m,
    `- **وضعیت:** ↩️ برگشت‌خورده در ${persianDate(date)}`,
  );
  writeFileSync(file, next, "utf8");
  return { changed: true, file: `docs/decisions/${match}` };
}

/**
 * برگشت از یک تصمیم — با **بازسازی**، نه معکوس‌کردنِ وصله.
 *
 * چرا نه `git revert`: تصمیم‌ها فایل‌های مشترک دارند (`.env.example`،
 * `docker-compose.yml`، `project.config.json`). برگشتِ یک تصمیمِ قدیمی‌تر به
 * تضاد می‌خورد چون تصمیمِ بعدی همان خطوط را عوض کرده — پس دکمهٔ پشیمانی فقط
 * برای آخرین تصمیم کار می‌کرد. (تستِ همین قدم نشانش داد.)
 *
 * روشِ فعلی: هر جنسِ فایل با راهِ خودش برگردانده می‌شود، بعد یک کامیتِ نو.
 * گیت همچنان تاریخ و تورِ ایمنی است، ولی مکانیزمِ برگشت نیست.
 */
export async function revertTechnology({ projectPath, techId, terminal, commit = true, date = new Date() }) {
  const tech = technologyById(techId);
  if (!tech) return { ok: false, error: `تکنولوژیِ ناشناخته: ${techId}` };
  if (!existsSync(projectPath)) return { ok: false, error: `مسیر وجود ندارد: ${projectPath}` };

  // سه راه برای اینکه برگشت معنا داشته باشد. سومی مهم است: چیزی می‌تواند نصب
  // باشد بدونِ اینکه تصمیمش ثبت شده باشد (مثلاً از قبل دستی نصب شده). آن هم
  // باید قابلِ برداشتن باشد، وگرنه ابزار در حالتی که کاربر واقعاً کمک می‌خواهد
  // دستش را می‌کشد.
  const config = readConfig(projectPath);
  const declared = config?.stack?.[tech.category] ?? null;
  const currentOption = resolveRegistry(projectPath, { probe: probeProject(projectPath) })
    .categories.find((c) => c.id === tech.category)
    ?.options.find((o) => o.id === techId);

  const worthReverting =
    declared === techId ||
    !!findDecisionCommit(projectPath, techId) ||
    currentOption?.state === PRESENT;

  if (!worthReverting) {
    return {
      ok: false,
      error: `«${tech.label}» نه ثبت شده و نه نصب است — چیزی برای برگرداندن نیست.`,
      evidence: currentOption?.evidence,
    };
  }

  // کارِ کامیت‌نشده → دست نمی‌زنیم، تا کارِ کاربر با برگشت قاطی نشود.
  if (isRepo(projectPath)) {
    const clean = isClean(projectPath);
    if (clean === null) return { ok: false, error: "وضعیتِ گیت خوانده نشد." };
    if (!clean) {
      return {
        ok: false,
        error:
          "کارِ کامیت‌نشده داری. اول آن را کامیت یا کنار بگذار، تا برگشت با کارِ خودت قاطی نشود.\n" +
          `فایل‌های تغییرکرده: ${changedFiles(projectPath).slice(0, 8).join("، ")}`,
      };
    }
  }

  const removal = removalFor(techId);
  const performed = [];
  const manualSteps = [];

  if (removal?.manual) manualSteps.push(removal.manual);

  // ۱) فایل‌های بیرونی: با فرمانِ حذفِ خودش
  for (const step of removal?.steps || []) {
    if (step.kind === "cli") {
      if (!terminal) { manualSteps.push(`این فرمان را خودت بزن: ${step.command}`); continue; }
      const res = await terminal.runAndWait(`cd "${projectPath}"; ${step.command}`);
      performed.push({ kind: "cli", command: step.command, ok: res.ok });
      if (!res.ok) manualSteps.push(`این فرمان شکست خورد و باید دستی رسیدگی شود: ${step.command}`);
    } else if (step.kind === "composeDown") {
      // «خواباندن» کافی نیست.
      //
      // نگارشِ قبلی فقط stop می‌زد. بعدش نامِ سرویس از فایلِ compose برداشته
      // می‌شد و کانتینرِ خاموش **یتیم** می‌ماند: نه در فهرست بود، نه هیچ
      // فرمانِ پاک‌سازیِ استانداردی پیدایش می‌کرد. با هر نصب-و-برگشت یکی
      // اضافه می‌شد. در اجرای واقعی دیده شد (nextVersion.md بندِ ۱).
      //
      // پس: stop و بعد rm — و عمداً **بی** حذفِ volume. دادهٔ داخلِ دیتابیس
      // مالِ کاربر است و پاک‌کردنش تصمیمِ او، نه ما. اگر بعداً همان سرویس را
      // دوباره نصب کند، داده‌اش سرِ جایش است.
      const compose = join(projectPath, "deployment", "docker-compose.yml");
      if (existsSync(compose) && terminal) {
        const envFile = join(projectPath, ".env");
        const stopped = await terminal.runAndWait(
          `docker compose --env-file "${envFile}" -f "${compose}" stop ${step.service}`,
        );
        const removed = await terminal.runAndWait(
          `docker compose --env-file "${envFile}" -f "${compose}" rm -f ${step.service}`,
        );
        performed.push({
          kind: "composeDown",
          service: step.service,
          ok: stopped.ok && removed.ok,
          removed: removed.ok,
        });
      }
    } else if (step.kind === "deleteFile") {
      const target = join(projectPath, step.path);
      if (existsSync(target)) { rmSync(target, { force: true }); performed.push({ kind: "deleteFile", path: step.path }); }
    }
  }

  // ۲) بلوکِ envِ خودمان
  const envVars = Object.assign({}, ...tech.apply.steps.filter((s) => s.kind === "env").map((s) => s.vars));
  if (Object.keys(envVars).length) {
    performed.push({ kind: "env", ...removeEnvVars(projectPath, { techLabel: tech.label, vars: envVars }) });
  }

  // ۳) قصد را پاک می‌کنیم، بعد فایلِ ساخته‌شده را از نو می‌سازیم
  const cfgRes = updateStackConfig(projectPath, tech.category, null);
  performed.push({ kind: "config", ...cfgRes });

  const stackAfter = { ...(readConfig(projectPath)?.stack || {}) };
  const composeNeeded = existsSync(join(projectPath, "deployment", "docker-compose.yml"));
  if (composeNeeded) {
    const composeRes = generateCompose(projectPath, {
      slug: readConfig(projectPath)?.slug || "app",
      services: composeServicesFor(stackAfter),
    });
    performed.push({ kind: "compose", ...composeRes });
    if (composeRes.ownedByUser) manualSteps.push("سرویس را خودت از docker-compose.yml بردار.");
  }

  // ۴) سند می‌ماند، ولی «برگشت‌خورده» علامت می‌خورد
  performed.push({ kind: "decisionDoc", ...markDecisionSuperseded(projectPath, techId, { date }) });

  // ۵) وضعیتِ واقعی را دوباره می‌خوانیم
  const optionAfter = resolveRegistry(projectPath, { probe: probeProject(projectPath) })
    .categories.find((c) => c.id === tech.category)
    ?.options.find((o) => o.id === techId);

  let gitResult = null;
  if (commit && isRepo(projectPath)) {
    gitResult = commitDecision(projectPath, {
      subject: `برگشت از تصمیم — ${categoryById(tech.category)?.label}: ${tech.label}`,
      body: [
        `وضعیتِ واقعیِ بعد از برگشت: ${optionAfter?.state} — ${optionAfter?.evidence}`,
        manualSteps.length ? `\nکارهایی که خودکار انجام نشد:\n${manualSteps.map((s) => `- ${s}`).join("\n")}` : "",
      ].join("\n"),
      decisionId: `revert:${techId}`,
    });
  }

  return {
    ok: true,
    techId,
    label: tech.label,
    steps: performed,
    manualSteps,
    git: gitResult,
    // صداقت: برگشتِ فایل‌ها با برگشتِ نصب یکی نیست.
    stillPresent: optionAfter?.state === PRESENT,
    state: optionAfter?.state,
    evidence: optionAfter?.evidence,
  };
}

function readConfig(projectPath) {
  const file = join(projectPath, "project.config.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
