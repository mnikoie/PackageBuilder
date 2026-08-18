/**
 * هستهٔ «قدمِ صفر»: یک پوشه می‌گیرد و اسکلتِ مستقل از تکنولوژی را داخلش می‌سازد.
 *
 * قواعدی که این ماژول رعایت می‌کند:
 * - هیچ فایلِ موجودی بازنویسی نمی‌شود. پوشهٔ پُر → امتناع، نه ادغام.
 * - هیچ چیزی که تکنولوژی را تحمیل کند ساخته نمی‌شود (نه package.json، نه apps/).
 * - dryRun یعنی «بگو چه می‌کنی، ولی نکن» — قابلِ اتکا، نه تقریبی.
 * - بدونِ رابطِ کاربری و بدونِ console.log؛ همه‌چیز به‌صورتِ داده برمی‌گردد
 *   تا هم خط‌فرمان و هم UIِ قدم‌های بعدی از همین یکی استفاده کنند.
 */

import { existsSync, statSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { renderSkeleton } from "./skeleton.mjs";

/**
 * ویندوز و بعضی ابزارها خودشان این‌ها را می‌سازند. اگر پوشه فقط همین‌ها را
 * داشته باشد، «خالی» حساب می‌شود — وگرنه کاربر برای یک فایلِ نامرئیِ اکسپلورر
 * گیر می‌افتد و دلیلش را هم نمی‌فهمد.
 */
const IGNORABLE_ENTRIES = new Set(["desktop.ini", "Thumbs.db", ".DS_Store"]);

/** از نامِ پوشه یک slugِ معتبر می‌سازد: «26- My App» → «26-my-app» */
export function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function isValidSlug(slug) {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

/** وضعیتِ فعلیِ مسیرِ هدف، قبل از هر نوشتنی. */
export function inspectTarget(targetPath) {
  const abs = resolve(targetPath);
  if (!existsSync(abs)) return { abs, exists: false, isDirectory: false, isEmpty: true, blockers: [] };

  const stat = statSync(abs);
  if (!stat.isDirectory()) return { abs, exists: true, isDirectory: false, isEmpty: false, blockers: [] };

  const blockers = readdirSync(abs).filter((e) => !IGNORABLE_ENTRIES.has(e));
  return { abs, exists: true, isDirectory: true, isEmpty: blockers.length === 0, blockers };
}

/**
 * ساختِ اسکلت.
 *
 * @returns {{
 *   ok: boolean, error?: string, targetPath: string, slug: string,
 *   displayName: string, dryRun: boolean, files: string[],
 *   git: { initialized: boolean, committed: boolean, error?: string }
 * }}
 */
export function scaffoldProject({
  targetPath,
  slug: slugArg,
  displayName: displayNameArg,
  dryRun = false,
  initGit = true,
  date = new Date(),
} = {}) {
  if (!targetPath) return fail("مسیرِ پوشه داده نشده.");

  const target = inspectTarget(targetPath);
  const folderName = basename(target.abs);

  if (target.exists && !target.isDirectory) {
    return fail(`مسیرِ هدف یک فایل است، نه پوشه: ${target.abs}`, target.abs);
  }
  if (target.exists && !target.isEmpty) {
    const shown = target.blockers.slice(0, 8).join("، ");
    const more = target.blockers.length > 8 ? ` (و ${target.blockers.length - 8} مورد دیگر)` : "";
    return fail(
      `پوشه خالی نیست، پس دست نمی‌زنم: ${target.abs}\n` +
        `داخلش این‌ها هست: ${shown}${more}\n` +
        `برای پروژهٔ نو یک پوشهٔ خالی بده.`,
      target.abs,
    );
  }

  const displayName = (displayNameArg || folderName).trim();
  const slug = slugArg ? slugArg.trim() : slugify(folderName);

  if (!displayName) return fail("نامِ نمایشی خالی است.", target.abs);
  if (!isValidSlug(slug)) {
    return fail(
      `slug نامعتبر است: «${slug}»\n` +
        `باید با حرفِ کوچکِ لاتین یا رقم شروع شود و فقط حرفِ کوچک/رقم/خط‌تیره داشته باشد.`,
      target.abs,
    );
  }

  const skeleton = renderSkeleton({ slug, displayName, date });

  if (dryRun) {
    return {
      ok: true,
      targetPath: target.abs,
      slug,
      displayName,
      dryRun: true,
      files: skeleton.map((f) => f.targetRel),
      git: { initialized: false, committed: false },
    };
  }

  mkdirSync(target.abs, { recursive: true });
  for (const { targetRel, content } of skeleton) {
    const dest = join(target.abs, targetRel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, "utf8");
  }

  const git = initGit ? initGitRepo(target.abs) : { initialized: false, committed: false };

  return {
    ok: true,
    targetPath: target.abs,
    slug,
    displayName,
    dryRun: false,
    files: skeleton.map((f) => f.targetRel),
    git,
  };
}

/**
 * `git init` + کامیتِ اول.
 *
 * کامیتِ اول لازم است، نه تشریفاتی: مدلِ برگشت‌پذیریِ ابزار (تصمیمِ ۰۰۰۳) این
 * است که هر تصمیم یک کامیتِ جدا باشد تا با git revert برگردد. بدونِ کامیتِ
 * پایه، اولین تصمیم چیزی برای برگشتن به آن ندارد.
 *
 * اگر گیت نصب نباشد یا user.name/email تنظیم نشده باشد، شکست می‌خورد ولی
 * ساختِ پوشه را باطل نمی‌کند — فقط صادقانه گزارش می‌شود.
 */
function initGitRepo(cwd) {
  const run = (args) => spawnSync("git", args, { cwd, encoding: "utf8" });

  const init = run(["init", "-q"]);
  if (init.error || init.status !== 0) {
    return { initialized: false, committed: false, error: gitErr(init, "git init") };
  }

  const add = run(["add", "-A"]);
  if (add.error || add.status !== 0) {
    return { initialized: true, committed: false, error: gitErr(add, "git add") };
  }

  const commit = run(["commit", "-q", "-m", "قدمِ صفر: ساختارِ مستقل از تکنولوژی"]);
  if (commit.error || commit.status !== 0) {
    return { initialized: true, committed: false, error: gitErr(commit, "git commit") };
  }

  return { initialized: true, committed: true };
}

function gitErr(res, label) {
  if (res.error) return `${label}: ${res.error.message}`;
  return `${label}: ${(res.stderr || res.stdout || "").trim() || `کدِ خروج ${res.status}`}`;
}

function fail(error, targetPath = "") {
  return {
    ok: false,
    error,
    targetPath,
    slug: "",
    displayName: "",
    dryRun: false,
    files: [],
    git: { initialized: false, committed: false },
  };
}
