/**
 * کارهای گیت — فقط همان چند تایی که برای «نقطهٔ ذخیره» و «دکمهٔ پشیمانی» لازم است.
 *
 * چرا گیت (تصمیمِ ۰۰۰۳):
 * نصبِ یک تکنولوژی یک کار نیست، بیست کار است — چند پکیج، چند فایلِ نو، چند
 * فایلِ ویرایش‌شده، چند متغیرِ env. پس‌گرفتنِ دستیِ این‌ها یا ناقص می‌شود
 * (آشغال باقی می‌ماند) یا خطرناک (چیزی که کاربر خودش ویرایش کرده پاک می‌شود).
 *
 * گیت این را از قبل حل کرده. پس: هر تصمیم = یک کامیتِ جدا. برگشت = revert.
 *
 * گیت هرگز «مجبور» نمی‌شود: هیچ‌کدام از این توابع reset --hard یا force
 * نمی‌زنند و کارِ کامیت‌نشدهٔ کاربر را نمی‌بلعند.
 */

import { spawnSync } from "node:child_process";

/** نشانی که با آن، کامیتِ یک تصمیم را بعداً پیدا می‌کنیم. */
export const DECISION_TRAILER = "PackageBuilder-Decision";

function git(cwd, args, { timeout = 30000 } = {}) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8", timeout });
  const stderr = (res.stderr || "").trim();
  const stdout = (res.stdout || "").trim();
  return {
    ok: !res.error && res.status === 0,
    stdout,
    stderr,
    error: res.error ? res.error.message : stderr || (res.status !== 0 ? `کدِ خروج ${res.status}` : ""),
  };
}

export function isRepo(cwd) {
  return git(cwd, ["rev-parse", "--git-dir"]).ok;
}

export function head(cwd) {
  const res = git(cwd, ["rev-parse", "HEAD"]);
  return res.ok ? res.stdout : null;
}

/** آیا چیزی کامیت‌نشده هست؟ (شاملِ فایل‌های ردیابی‌نشده) */
export function isClean(cwd) {
  const res = git(cwd, ["status", "--porcelain"]);
  if (!res.ok) return null; // نمی‌دانیم — و «نمی‌دانم» را «تمیز است» جا نمی‌زنیم
  return res.stdout === "";
}

export function changedFiles(cwd) {
  const res = git(cwd, ["status", "--porcelain"]);
  if (!res.ok) return [];
  return res.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3));
}

/**
 * کامیتِ همهٔ تغییرها، با نشانیِ تصمیم در پایانِ پیام.
 *
 * @returns {{ ok: boolean, sha?: string, error?: string, nothingToCommit?: boolean }}
 */
export function commitDecision(cwd, { subject, body = "", decisionId }) {
  if (!isRepo(cwd)) return { ok: false, error: "این پوشه مخزنِ گیت نیست." };
  if (isClean(cwd)) return { ok: true, nothingToCommit: true };

  const add = git(cwd, ["add", "-A"]);
  if (!add.ok) return { ok: false, error: `git add: ${add.error}` };

  const message = [subject, "", body, "", `${DECISION_TRAILER}: ${decisionId}`]
    .filter((part, i) => part !== "" || i === 1 || i === 3)
    .join("\n");

  const commit = git(cwd, ["commit", "-q", "-m", message]);
  if (!commit.ok) return { ok: false, error: `git commit: ${commit.error}` };

  return { ok: true, sha: head(cwd) };
}

/** کامیتِ مربوط به یک تصمیم را پیدا می‌کند (آخرین‌شان، اگر چند بار اعمال شده). */
export function findDecisionCommit(cwd, decisionId) {
  const res = git(cwd, [
    "log", "--format=%H", `--grep=^${DECISION_TRAILER}: ${decisionId}$`, "--extended-regexp", "-n", "1",
  ]);
  if (!res.ok || !res.stdout) return null;
  return res.stdout.split(/\r?\n/)[0];
}

/**
 * برگشت از یک تصمیم.
 *
 * از `revert` استفاده می‌شود، نه `reset`: تاریخ پاک نمی‌شود و کامیت‌های بعدی
 * سرِ جایشان می‌مانند. یعنی می‌شود تصمیمِ وسطی را برگرداند بدونِ خرابیِ بقیه.
 *
 * اگر برگشت به تضاد بخورد، خودش را عقب می‌کشد و صادقانه می‌گوید — نه اینکه
 * پروژه را نیمه‌کاره و خراب رها کند.
 */
export function revertDecision(cwd, decisionId) {
  if (!isRepo(cwd)) return { ok: false, error: "این پوشه مخزنِ گیت نیست." };

  const clean = isClean(cwd);
  if (clean === null) return { ok: false, error: "وضعیتِ گیت خوانده نشد." };
  if (!clean) {
    return {
      ok: false,
      error:
        "کارِ کامیت‌نشده داری. اول آن را کامیت یا کنار بگذار، تا برگشت با کارِ خودت قاطی نشود.\n" +
        `فایل‌های تغییرکرده: ${changedFiles(cwd).slice(0, 8).join("، ")}`,
    };
  }

  const sha = findDecisionCommit(cwd, decisionId);
  if (!sha) return { ok: false, error: `کامیتی برای تصمیمِ «${decisionId}» پیدا نشد.` };

  const res = git(cwd, ["revert", "--no-edit", sha]);
  if (!res.ok) {
    // تضاد → عقب می‌کشیم تا پروژه نیمه‌کاره نماند.
    git(cwd, ["revert", "--abort"]);
    return { ok: false, error: `برگشت به تضاد خورد و لغو شد: ${res.error}`, sha };
  }
  return { ok: true, revertedSha: sha, sha: head(cwd) };
}

/** فهرستِ تصمیم‌هایی که در تاریخِ گیت ثبت شده‌اند. */
export function decisionHistory(cwd) {
  const res = git(cwd, ["log", "--format=%H%x00%s%x00%b%x1e"]);
  if (!res.ok || !res.stdout) return [];

  return res.stdout
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, subject, body = ""] = entry.split("\x00");
      const m = body.match(new RegExp(`^${DECISION_TRAILER}: (.+)$`, "m"));
      return { sha, subject, decisionId: m ? m[1].trim() : null };
    })
    .filter((c) => c.decisionId);
}
