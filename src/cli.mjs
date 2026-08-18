#!/usr/bin/env node
/**
 * رابطِ خط‌فرمانِ PackageBuilder.
 *
 * این فایل عمداً نازک است: هیچ منطقی ندارد و فقط ورودی را می‌خواند و خروجیِ
 * هسته را چاپ می‌کند. UIِ قدم‌های بعدی هم از همان هسته استفاده می‌کند، نه از این.
 */

import { scaffoldProject } from "./core/scaffold.mjs";

const USAGE = `
PackageBuilder — ساختِ پروژهٔ نو با اسکلتِ مستقل از تکنولوژی

  استفاده:
    node src/cli.mjs new <مسیرِ پوشه> [گزینه‌ها]

  گزینه‌ها:
    --name "<نامِ نمایشی>"   پیش‌فرض: نامِ خودِ پوشه
    --slug <slug>            پیش‌فرض: از نامِ پوشه ساخته می‌شود
    --dry-run                فقط بگو چه می‌سازی، چیزی نساز
    --no-git                 مخزنِ گیت راه نینداز

  مثال:
    node src/cli.mjs new "D:\\- AIProject\\PRG2" --name "PRG2"
    node src/cli.mjs new ./sandbox/test-app --dry-run
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
  if (opts.command !== "new") {
    console.error(`\n✗ دستورِ ناشناخته: ${opts.command}`);
    console.error(USAGE);
    process.exit(2);
  }
  if (!opts.targetPath) {
    console.error("\n✗ مسیرِ پوشه را بده.");
    console.error(USAGE);
    process.exit(2);
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

main();
