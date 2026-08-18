/**
 * نگهبانِ استقلال.
 *
 * این ابزار باید کاملاً خودبسنده باشد: به هیچ پوشه، پروژه، یا مسیرِ خاصی
 * روی این کامپیوتر وابسته نباشد و از هر جایی اجرا شود.
 *
 * این تست‌ها آن را **اجبار** می‌کنند، نه اینکه به قول و نیتِ خوب تکیه کنند.
 * اگر یک روز کسی (یا خودِ من) مسیری را داخلِ کد هارد-کد کند، همین‌جا قرمز می‌شود.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/\.(mjs|js|json)$/.test(entry.name)) yield full;
  }
}

const rel = (file) => file.slice(ROOT.length + 1);
/** خودِ این فایل استثناست: الگوهای ممنوعه به‌عنوانِ «داده» داخلش نوشته شده‌اند. */
const isGuardFile = (file) => file.endsWith("independence.test.mjs");

describe("استقلال از محیط", () => {
  test("هیچ مسیرِ مطلقی در کدِ اصلی هارد-کد نشده", () => {
    // مسیرِ درایوِ ویندوزی: یک حرفِ تنها + «:\» یا «:/».
    // نگاهِ-به-عقب لازم است تا «name:\s*» به‌عنوانِ درایوِ «e:\» خوانده نشود.
    const winDrive = /(?<![A-Za-z0-9_$])[A-Za-z]:[\\/]{1,2}/g;
    const unixMount = /\/mnt\/[a-z]\//g;

    const offenders = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const pattern of [winDrive, unixMount]) {
        for (const m of text.matchAll(pattern)) {
          const line = text.slice(0, m.index).split("\n").length;
          offenders.push(`${rel(file)}:${line} → ${m[0]}`);
        }
      }
    }
    assert.deepEqual(offenders, [], `مسیرِ مطلق در کد:\n${offenders.join("\n")}`);
  });

  test("به هیچ پروژهٔ خاصی روی این کامپیوتر ارجاع نمی‌دهد", () => {
    // نامِ پروژه‌های همسایه نباید در کدِ ابزار باشند — نه به‌عنوانِ وابستگی،
    // نه حتی به‌عنوانِ مثالِ راهنما (کاربر آن را وابستگی می‌خواند، و حق دارد).
    const forbidden = ["TaminLibrary", "NilaLibrary", "AIProject", "PackageBuilder\\", "PRG1", "PRG2"];
    const offenders = [];
    for (const file of [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "tests"))]) {
      if (isGuardFile(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const word of forbidden) {
        if (text.includes(word)) offenders.push(`${rel(file)}: ${word}`);
      }
    }
    assert.deepEqual(offenders, [], `ارجاع به پروژهٔ بیرونی:\n${offenders.join("\n")}`);
  });

  test("تست‌ها فقط در پوشهٔ موقتِ سیستم کار می‌کنند، نه مسیرِ ثابت", () => {
    // اگر تستی روی یک پوشهٔ واقعیِ این کامپیوتر تکیه کند، روی ماشینِ دیگر
    // می‌شکند و دیگر «تست» نیست.
    const offenders = [];
    for (const file of sourceFiles(join(ROOT, "tests"))) {
      if (isGuardFile(file)) continue;
      const text = readFileSync(file, "utf8");
      const usesFs = /mkdtempSync|mkdirSync|writeFileSync/.test(text);
      if (usesFs && !text.includes("tmpdir")) {
        offenders.push(`${rel(file)}: روی فایل‌سیستم می‌نویسد ولی tmpdir استفاده نمی‌کند`);
      }
    }
    assert.deepEqual(offenders, [], offenders.join("\n"));
  });

  // -------------------------------------------------------------------------
  // وابستگی‌ها: فهرستِ سفیدِ صریح.
  //
  // تا قدمِ ۴ این پروژه صفر وابستگی داشت. در قدمِ ۵ (ترمینالِ واقعی) چهار
  // وابستگی لازم شد. این تست خاموش نشد — به فهرستِ زیر تبدیل شد، تا اضافه‌شدنِ
  // وابستگیِ جدید یک **تصمیمِ آگاهانه** باشد و نه لغزشی که کسی نبیند.
  //
  // فرقِ مهم: وابستگی به یک **پکیج** مجاز است؛ وابستگی به **پوشهٔ کسی** نه.
  // -------------------------------------------------------------------------
  const ALLOWED_DEPS = new Set([
    "node-pty",           // تنها راهِ عملیِ یک PTYِ واقعیِ ویندوزی
    "ws",                 // خروجیِ ترمینال جریانی است؛ درخواست/پاسخ جواب نمی‌دهد
    "@xterm/xterm",       // نمایشِ ترمینال در مرورگر (همان که VS Code استفاده می‌کند)
    "@xterm/addon-fit",   // اندازهٔ درستِ ستون/سطر
  ]);

  test("هیچ وابستگیِ خارج از فهرستِ سفید اضافه نشده", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const all = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    const extra = all.filter((d) => !ALLOWED_DEPS.has(d));
    assert.deepEqual(extra, [], `وابستگیِ تأییدنشده: ${extra.join(", ")} — اگر عمدی است، به ALLOWED_DEPS اضافه‌اش کن و دلیلش را بنویس`);
  });

  test("همهٔ وابستگی‌های فهرستِ سفید واقعاً نصب‌اند", () => {
    // «اعلام» کافی نیست؛ همان قاعدهٔ خودمان دربارهٔ مدرکِ واقعی.
    const missing = [...ALLOWED_DEPS].filter(
      (d) => !existsSync(join(ROOT, "node_modules", ...d.split("/"))),
    );
    assert.deepEqual(missing, [], `در package.json هست ولی نصب نیست: ${missing.join(", ")}`);
  });

  test("قالب‌ها داخلِ خودِ ابزارند، نه کپی‌شده از پروژهٔ دیگر در زمانِ اجرا", () => {
    const templatesDir = join(ROOT, "src", "core", "templates");
    assert.ok(existsSync(templatesDir), "پوشهٔ قالب‌ها باید داخلِ خودِ ابزار باشد");
    const count = [...sourceFiles(templatesDir)].length +
      readdirSync(templatesDir).filter((f) => !f.includes(".")).length;
    assert.ok(count > 0, "قالبی پیدا نشد");
  });

  test("همهٔ importها نسبی، از خودِ Node، یا از فهرستِ سفید هستند", () => {
    const offenders = [];
    for (const file of [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "tests"))]) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)) {
        const spec = m[1];
        const ok = spec.startsWith(".") || spec.startsWith("node:") || ALLOWED_DEPS.has(spec);
        if (!ok) offenders.push(`${file.slice(ROOT.length + 1)}: ${spec}`);
      }
    }
    assert.deepEqual(offenders, [], `importِ تأییدنشده:\n${offenders.join("\n")}`);
  });
});
