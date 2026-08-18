/**
 * خواندنِ قالب‌های «قدمِ صفر» و پر کردنِ جای‌گیرها.
 *
 * قالب‌ها فایل‌های واقعی‌اند (در پوشهٔ templates)، نه رشته‌های داخلِ کد —
 * تا ویرایششان مثلِ ویرایشِ یک فایلِ معمولی باشد و داخلِ کد قِلقلی نشوند.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "templates");

/**
 * نامِ فایل‌های مخفی در پوشهٔ قالب با «_» شروع می‌شود، نه «.» — وگرنه خودِ گیت
 * `_gitignore` را به‌عنوانِ .gitignoreِ واقعیِ پوشهٔ قالب‌ها تفسیر می‌کرد و
 * قالب‌ها روی مخزنِ خودِ ابزار اثر می‌گذاشتند.
 */
function templatePathToTarget(relPath) {
  return relPath
    .split(sep)
    .map((seg) => (seg.startsWith("_") ? "." + seg.slice(1) : seg))
    .join("/");
}

function* walkFiles(dir, prefix = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) yield* walkFiles(join(dir, entry.name), rel);
    else yield rel;
  }
}

/** فهرستِ قالب‌ها: [{ templateRel, targetRel }] */
export function listTemplates() {
  return [...walkFiles(TEMPLATES_DIR)]
    .map((templateRel) => ({ templateRel, targetRel: templatePathToTarget(templateRel) }))
    .sort((a, b) => a.targetRel.localeCompare(b.targetRel));
}

/** تاریخِ شمسی، با ارقامِ فارسی — همان قالبی که در متن‌ها استفاده می‌شود. */
export function persianDate(date = new Date()) {
  return new Intl.DateTimeFormat("fa-IR").format(date);
}

/**
 * محتوای نهاییِ همهٔ فایل‌های اسکلت.
 * @returns {{ targetRel: string, content: string }[]}
 */
export function renderSkeleton({ slug, displayName, date = new Date() }) {
  const values = {
    SLUG: slug,
    DISPLAY_NAME: displayName,
    DATE_ISO: date.toISOString().slice(0, 10),
    DATE_FA: persianDate(date),
  };

  return listTemplates().map(({ templateRel, targetRel }) => {
    const raw = readFileSync(join(TEMPLATES_DIR, templateRel), "utf8");
    const content = raw.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
      if (!(key in values)) throw new Error(`جای‌گیرِ ناشناخته در ${templateRel}: ${match}`);
      return values[key];
    });
    // اگر جای‌گیری با نگارشِ غلط نوشته شده باشد (مثلاً {{ SLUG }}) بی‌صدا رد
    // می‌شود و در خروجی می‌ماند — پس صریح خطا می‌دهیم.
    if (content.includes("{{")) throw new Error(`جای‌گیرِ پرنشده در ${templateRel}`);
    return { targetRel, content };
  });
}
