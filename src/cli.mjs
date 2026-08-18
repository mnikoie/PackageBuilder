#!/usr/bin/env node
/**
 * رابطِ خط‌فرمانِ PackageBuilder.
 *
 * این فایل عمداً نازک است: هیچ منطقی ندارد و فقط ورودی را می‌خواند و خروجیِ
 * هسته را چاپ می‌کند. UIِ قدم‌های بعدی هم از همان هسته استفاده می‌کند، نه از این.
 */

import { scaffoldProject } from "./core/scaffold.mjs";
import { probeProject, PRESENT, ABSENT, UNKNOWN } from "./core/detect.mjs";
import { validateRegistry } from "./core/registry.mjs";
import { resolveRegistry } from "./core/resolve.mjs";
import { applyTechnology, revertTechnology } from "./core/apply.mjs";
import { startServer, DEFAULT_PORT } from "./server/server.mjs";

const USAGE = `
PackageBuilder — ساختِ پروژهٔ نو با اسکلتِ مستقل از تکنولوژی

  استفاده:
    node src/cli.mjs new    <مسیرِ پوشه> [گزینه‌ها]  ساختِ پروژهٔ نو
    node src/cli.mjs probe  <مسیرِ پوشه>             گزارشِ وضعیتِ واقعی
    node src/cli.mjs stack  <مسیرِ پوشه>             تصمیم‌ها و گزینه‌هایشان
    node src/cli.mjs apply  <مسیرِ پوشه> --tech <id> اعمالِ یک تصمیم
    node src/cli.mjs revert <مسیرِ پوشه> --tech <id> برگشت از یک تصمیم
    node src/cli.mjs serve  [--port <شماره>]         همان گزارش، در مرورگر

  گزینه‌های new:
    --name "<نامِ نمایشی>"   پیش‌فرض: نامِ خودِ پوشه
    --slug <slug>            پیش‌فرض: از نامِ پوشه ساخته می‌شود
    --dry-run                فقط بگو چه می‌سازی، چیزی نساز
    --no-git                 مخزنِ گیت راه نینداز

  مثال:
    node src/cli.mjs new ./my-app --name "My App"
    node src/cli.mjs new ./my-app --dry-run
    node src/cli.mjs probe .
    node src/cli.mjs probe ./my-app

  مسیرها هم نسبی می‌شوند هم مطلق. این ابزار به هیچ پوشه یا پروژهٔ خاصی
  وابسته نیست و از هر جایی روی هر مسیری کار می‌کند.
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command, targetPath: "", name: "", slug: "", tech: "", dryRun: false, initGit: true, port: 0 };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--no-git") opts.initGit = false;
    else if (arg === "--name") opts.name = rest[++i] ?? "";
    else if (arg === "--slug") opts.slug = rest[++i] ?? "";
    else if (arg === "--tech") opts.tech = rest[++i] ?? "";
    else if (arg === "--port") {
      const raw = rest[++i] ?? "";
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return { error: `پورتِ نامعتبر: ${raw}` };
      opts.port = n;
    }
    else if (arg.startsWith("--")) return { error: `گزینهٔ ناشناخته: ${arg}` };
    else if (!opts.targetPath) opts.targetPath = arg;
    else return { error: `مسیرِ اضافی: ${arg}` };
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.error) {
    console.error(`\n✗ ${opts.error}`);
    console.error(USAGE);
    process.exit(2);
  }
  if (!opts.command || opts.command === "help" || opts.command === "--help") {
    console.log(USAGE);
    process.exit(0);
  }
  if (!["new", "probe", "stack", "apply", "revert", "serve"].includes(opts.command)) {
    console.error(`\n✗ دستورِ ناشناخته: ${opts.command}`);
    console.error(USAGE);
    process.exit(2);
  }

  if (opts.command === "serve") return runServe(opts.port);

  if (!opts.targetPath) {
    console.error("\n✗ مسیرِ پوشه را بده.");
    console.error(USAGE);
    process.exit(2);
  }

  if (opts.command === "probe") return runProbe(opts.targetPath);
  if (opts.command === "stack") return runStack(opts.targetPath);
  if (opts.command === "apply" || opts.command === "revert") {
    if (!opts.tech) {
      console.error("\n✗ شناسهٔ تکنولوژی را با --tech بده. برای دیدنِ فهرست: stack\n");
      process.exit(2);
    }
    return runApplyOrRevert(opts);
  }

  const result = scaffoldProject({
    targetPath: opts.targetPath,
    slug: opts.slug || undefined,
    displayName: opts.name || undefined,
    dryRun: opts.dryRun,
    initGit: opts.initGit,
  });

  if (!result.ok) {
    console.error(`\n✗ ${result.error}\n`);
    process.exit(1);
  }

  const head = result.dryRun ? "نمایشی (چیزی نوشته نشد)" : "ساخته شد";
  console.log(`\n✓ ${head}`);
  console.log(`  مسیر:        ${result.targetPath}`);
  console.log(`  نامِ نمایشی: ${result.displayName}`);
  console.log(`  slug:        ${result.slug}`);
  console.log(`\n  ${result.files.length} فایل:`);
  for (const f of result.files) console.log(`    ${result.dryRun ? "+" : "✓"} ${f}`);

  if (!result.dryRun) {
    if (result.git.committed) console.log(`\n  گیت: راه افتاد و کامیتِ پایه زده شد`);
    else if (result.git.initialized) console.log(`\n  گیت: راه افتاد ولی کامیت نشد — ${result.git.error}`);
    else if (result.git.error) console.log(`\n  گیت: راه نیفتاد — ${result.git.error}`);
  }

  console.log(
    `\n  قدمِ بعد: هیچ تکنولوژی‌ای انتخاب نشده.` +
      `\n  تصمیم‌های باز را در docs/decisions/0001-open-decisions.md ببین.\n`,
  );
}

/**
 * گزارشِ وضعیت. سه حالت سه علامتِ متفاوت دارند — «نامعلوم» عمداً شبیهِ «نیست»
 * نیست، چون معنایش کاملاً متفاوت است.
 */
function runProbe(targetPath) {
  const p = probeProject(targetPath);

  if (!p.exists || !p.isDirectory) {
    console.error(`\n✗ ${p.error}: ${p.path}\n`);
    process.exit(1);
  }

  const mark = (s) => (s === PRESENT ? "✓" : s === ABSENT ? "✗" : "؟");
  const line = (label, res) => console.log(`  ${mark(res.state)} ${label.padEnd(22)} ${res.evidence}`);

  console.log(`\nوضعیتِ واقعیِ: ${p.path}`);
  console.log(`(✓ هست   ✗ نیست   ؟ نامعلوم — یعنی نتوانستیم بپرسیم)\n`);

  line("ساختهٔ PackageBuilder", p.scaffolded);
  line("مخزنِ گیت", p.git);
  line("رانتایمِ Node", p.nodeRuntime);
  line("مدیرِ پکیج", p.packageManager);
  line("ابزارِ مونوریپو", p.monorepo);

  if (p.apps.length) {
    console.log(`\n  appها:`);
    for (const app of p.apps) {
      const parts = [];
      if (app.nodeDeps) parts.push(`node_modules: ${mark(app.nodeDeps.state)}`);
      if (app.pythonEnv) parts.push(`محیطِ پایتون: ${mark(app.pythonEnv.state)}`);
      const detail = parts.length ? ` — ${parts.join("، ")}` : "";
      console.log(`    • ${app.name} (${app.kind})${detail}`);
    }
  }

  console.log(`\n  Docker:`);
  if (!p.docker.file) {
    console.log(`    ✗ فایلِ compose پیدا نشد، پس Docker پرسیده نشد`);
  } else {
    console.log(`    فایل: ${p.docker.file}`);
    console.log(`    نامِ پروژهٔ Docker: ${p.docker.projectName || "(تعریف نشده)"}`);
    if (!p.docker.projectName) {
      console.log(`    ⚠ بدونِ name، دامنه از نامِ پوشه می‌آید و کپی‌ها به هم قِلق می‌دهند`);
    }
    for (const [name, res] of Object.entries(p.docker.services)) line(`  ${name}`, res);
  }

  if (p.declared?.stack) {
    const chosen = Object.entries(p.declared.stack).filter(([, v]) => v !== null);
    console.log(`\n  تصمیم‌های اعلام‌شده (قصد، نه واقعیت): ${chosen.length ? "" : "هیچ‌کدام"}`);
    for (const [k, v] of chosen) console.log(`    ${k} = ${v}`);
  }

  if (p.mismatches.length) {
    console.log(`\n  ⚠ اعلام با واقعیت نمی‌خواند:`);
    for (const m of p.mismatches) {
      console.log(`    ${m.severity === "conflict" ? "✗" : "؟"} ${m.field}: اعلام «${m.declared}» — واقعیت: ${m.reality}`);
    }
  }

  console.log("");
}

/**
 * تصمیم‌ها و گزینه‌هایشان، با وضعیتِ واقعیِ هر گزینه.
 * هیچ چیزی را عوض نمی‌کند — فقط نشان می‌دهد.
 */
function runStack(targetPath) {
  const probe = probeProject(targetPath);
  if (!probe.exists || !probe.isDirectory) {
    console.error(`\n✗ ${probe.error}: ${probe.path}\n`);
    process.exit(1);
  }

  const problems = validateRegistry();
  if (problems.length) {
    console.error(`\n✗ خودِ رجیستری ایراد دارد:`);
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }

  const out = resolveRegistry(probe.path, { probe });
  const mark = (s) => (s === PRESENT ? "✓" : s === ABSENT ? "✗" : "؟");

  console.log(`\nتصمیم‌های پروژه: ${probe.path}`);
  console.log(`(✓ نصب است   ✗ نصب نیست   ؟ نامعلوم)\n`);

  for (const cat of out.categories) {
    let headline;
    if (cat.conflict) headline = `⚠ ناسازگاری: ${cat.conflict.join(" و ")} هر دو نصب‌اند`;
    else if (cat.chosen) headline = `✓ ${cat.options.find((o) => o.id === cat.chosen).label}`;
    else if (cat.uncertain) headline = "؟ نامعلوم";
    else headline = "— تصمیم گرفته نشده";

    console.log(`${cat.label}  →  ${headline}`);
    for (const opt of cat.options) {
      const flags = [];
      if (opt.missingRequirements.length) flags.push(`پیش‌نیاز: ${opt.missingRequirements.join("، ")}`);
      if (!opt.verified) flags.push("نصبش آزمایش‌نشده");
      const suffix = flags.length ? `  [${flags.join(" | ")}]` : "";
      console.log(`    ${mark(opt.state)} ${opt.label.padEnd(34)} ${opt.evidence}${suffix}`);
    }
    console.log("");
  }

  if (out.conflicts.length) {
    console.log(`⚠ ${out.conflicts.length} ناسازگاری پیدا شد. در هر دسته باید فقط یک گزینه نصب باشد.\n`);
  }
  console.log(
    `توجه: فرمان‌های نصبِ ${out.unverified.length} تکنولوژی هنوز واقعاً اجرا و تأیید نشده‌اند ` +
      `(قدمِ ۷). تا آن موقع «آزمایش‌نشده» علامت خورده‌اند.\n`,
  );
}

/**
 * اعمال یا برگشتِ یک تصمیم، با ترمینالِ واقعی.
 *
 * فرمان‌ها در یک پاورشلِ واقعی اجرا می‌شوند و خروجی‌شان زنده چاپ می‌شود —
 * همان قاعدهٔ «هیچ چیزی پنهان اجرا نشود»، این‌بار در خط‌فرمان.
 */
async function runApplyOrRevert(opts) {
  const { createTerminal } = await import("./server/terminal.mjs");
  const pty = (await import("node-pty")).default;

  const terminal = createTerminal({ pty, cwd: opts.targetPath });
  terminal.ensure();

  // خروجی را **بعد** از گرم‌شدن وصل می‌کنیم: پرامپتِ اولیه و خطِ آماده‌سازیِ
  // __pbEnd کارِ داخلیِ ابزارند و چاپشان فقط شلوغی است. از این لحظه به بعد،
  // هر چه در ترمینال بیفتد عیناً دیده می‌شود.
  await new Promise((r) => setTimeout(r, 900));
  terminal.onData((chunk) => process.stdout.write(chunk));

  const isApply = opts.command === "apply";
  console.log(`\n${isApply ? "▶ اعمالِ" : "◀ برگشت از"} «${opts.tech}» روی ${opts.targetPath}\n`);

  let result;
  try {
    result = isApply
      ? await applyTechnology({ projectPath: opts.targetPath, techId: opts.tech, terminal, dryRun: opts.dryRun })
      : await revertTechnology({ projectPath: opts.targetPath, techId: opts.tech, terminal });
  } finally {
    // کمی صبر تا آخرین خروجیِ ترمینال برسد، بعد ببند
    await new Promise((r) => setTimeout(r, 400));
    terminal.dispose();
  }

  console.log("\n" + "─".repeat(60));
  if (!result.ok) {
    console.error(`✗ ${result.error}`);
    if (result.snippet) console.error(`\nاین تکه را خودت اضافه کن:\n${result.snippet}`);
    if (result.needs) console.error(`\nاول این‌ها را نصب کن: ${result.needs.join("، ")}`);
    console.error("");
    process.exit(1);
  }

  if (result.dryRun) {
    console.log(`✓ نمایشی — چیزی انجام نشد. نقشه:`);
    for (const step of result.planned) {
      if (step.kind === "cli") console.log(`  • فرمان: ${step.command}`);
      else if (step.kind === "env") console.log(`  • متغیرهای env: ${step.vars.join("، ")}`);
      else if (step.kind === "composeService") console.log(`  • سرویسِ Docker: ${step.service}`);
      else if (step.kind === "file") console.log(`  • فایل: ${step.path}`);
    }
    console.log("");
    process.exit(0);
  }

  if (result.alreadyPresent) {
    console.log(`✓ «${opts.tech}» از قبل نصب است — ${result.evidence}\n`);
    return;
  }

  console.log(`${isApply ? "✓ اعمال شد" : "✓ برگشت انجام شد"}: ${result.label}`);
  if (result.decisionDoc) console.log(`  سندِ تصمیم: ${result.decisionDoc}`);
  if (result.git?.ok) console.log(`  کامیت: ${result.git.sha?.slice(0, 8)}`);
  else if (result.git?.error) console.log(`  کامیت نشد: ${result.git.error}`);

  // مهم‌ترین خط: وضعیتِ **واقعی**، نه ادعا
  const mark = result.state === PRESENT ? "✓" : result.state === ABSENT ? "✗" : "؟";
  console.log(`\n  وضعیتِ واقعیِ الان: ${mark} ${result.evidence}`);
  if (isApply && !result.verified) {
    console.log(`  توجه: فرمان‌ها اجرا شدند ولی مدرکِ نصب دیده نشد — بالا را بخوان.`);
  }
  if (result.manualSteps?.length) {
    console.log(`\n  کارهایی که خودکار انجام نشد:`);
    for (const s of result.manualSteps) console.log(`  • ${s}`);
  }
  console.log("");

  // PTY حلقهٔ رویداد را زنده نگه می‌دارد، پس پروسه خودش بیرون نمی‌آید.
  // برای یک دستورِ خط‌فرمان که کارش تمام شده، خروجِ صریح درست است.
  process.exit(0);
}

/** سرورِ رابطِ کاربری. فقط-خواندنی و فقط روی 127.0.0.1. */
async function runServe(port) {
  try {
    const { url, terminal } = await startServer({ port: port || DEFAULT_PORT });
    console.log(`\n✓ رابطِ کاربری بالا آمد: ${url}`);
    console.log(`  ترمینال: ${terminal.shell() || "در حالِ تشخیص…"}`);
    console.log(`  فقط روی 127.0.0.1 و با توکنِ همان صفحه — از بیرون در دسترس نیست.`);
    console.log(`  برای بستن: Ctrl+C\n`);
  } catch (err) {
    if (err.code === "EADDRINUSE") {
      console.error(`\n✗ پورت ${port || DEFAULT_PORT} مشغول است. با --port یک شمارهٔ دیگر بده.\n`);
    } else {
      console.error(`\n✗ سرور بالا نیامد: ${err.message}\n`);
    }
    process.exit(1);
  }
}

main();
