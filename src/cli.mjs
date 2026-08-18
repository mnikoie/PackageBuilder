#!/usr/bin/env node
/**
 * رابطِ خط‌فرمانِ PackageBuilder.
 *
 * این فایل عمداً نازک است: هیچ منطقی ندارد و فقط ورودی را می‌خواند و خروجیِ
 * هسته را چاپ می‌کند. UIِ قدم‌های بعدی هم از همان هسته استفاده می‌کند، نه از این.
 */

import { scaffoldProject } from "./core/scaffold.mjs";
import { probeProject, PRESENT, ABSENT, UNKNOWN } from "./core/detect.mjs";

const USAGE = `
PackageBuilder — ساختِ پروژهٔ نو با اسکلتِ مستقل از تکنولوژی

  استفاده:
    node src/cli.mjs new   <مسیرِ پوشه> [گزینه‌ها]   ساختِ پروژهٔ نو
    node src/cli.mjs probe <مسیرِ پوشه>              گزارشِ وضعیتِ واقعی

  گزینه‌های new:
    --name "<نامِ نمایشی>"   پیش‌فرض: نامِ خودِ پوشه
    --slug <slug>            پیش‌فرض: از نامِ پوشه ساخته می‌شود
    --dry-run                فقط بگو چه می‌سازی، چیزی نساز
    --no-git                 مخزنِ گیت راه نینداز

  مثال:
    node src/cli.mjs new "D:\\- AIProject\\PRG2" --name "PRG2"
    node src/cli.mjs new ./sandbox/test-app --dry-run
    node src/cli.mjs probe "D:\\- AIProject\\25- TaminLibrary"
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command, targetPath: "", name: "", slug: "", dryRun: false, initGit: true };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--no-git") opts.initGit = false;
    else if (arg === "--name") opts.name = rest[++i] ?? "";
    else if (arg === "--slug") opts.slug = rest[++i] ?? "";
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
  if (opts.command !== "new" && opts.command !== "probe") {
    console.error(`\n✗ دستورِ ناشناخته: ${opts.command}`);
    console.error(USAGE);
    process.exit(2);
  }
  if (!opts.targetPath) {
    console.error("\n✗ مسیرِ پوشه را بده.");
    console.error(USAGE);
    process.exit(2);
  }

  if (opts.command === "probe") return runProbe(opts.targetPath);

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

main();
