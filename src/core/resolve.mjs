/**
 * ارزیابیِ رجیستری روی یک پروژهٔ واقعی.
 *
 * رجیستری می‌گوید «چطور بفهمیم فلان چیز نصب است»؛ این فایل آن را روی یک مسیرِ
 * واقعی اجرا می‌کند و می‌گوید چه چیزی **هست**، چه چیزی **نیست**، و کجا
 * **نمی‌دانیم**.
 *
 * دو قاعده‌ای که همه‌جای این فایل رعایت می‌شود:
 *
 * ۱. سه‌حالتی بودن. «نامعلوم» هرگز به «نیست» ترجمه نمی‌شود. و در ترکیب‌ها هم
 *    سرایت می‌کند: اگر `all` یک زیرشرطِ نامعلوم داشته باشد و بقیه درست باشند،
 *    نتیجه نامعلوم است، نه درست.
 *
 * ۲. فقط-خواندنی. هیچ چیزی نوشته یا اجرا نمی‌شود.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PRESENT, ABSENT, UNKNOWN,
  detectNpmPackage, detectNodeModules, detectPythonVenv, detectPythonPackage, detectMonorepoTool,
} from "./detect.mjs";
import { CATEGORIES, TECHNOLOGIES, secretsFor, describeApply, describeRemoval } from "./registry.mjs";
import { CATEGORIES_EN, TECH_EN } from "./i18n.mjs";

const present = (evidence) => ({ state: PRESENT, evidence });
const absent = (evidence) => ({ state: ABSENT, evidence });
const unknown = (evidence) => ({ state: UNKNOWN, evidence });

/**
 * نقشِ یک app («web»، «api»، …) به پوشهٔ واقعی.
 *
 * دو چیدمان پشتیبانی می‌شود، چون هر دو رایج‌اند و ابزار نباید یکی را تحمیل کند:
 * مونوریپو (`apps/web`) و پروژهٔ تک‌پکیجی (خودِ ریشه).
 *
 * @returns {{ dir: string|null, app: string|null, layout: string }}
 */
export function resolveRole(projectPath, role) {
  if (!role) return { dir: projectPath, app: null, layout: "root" };

  if (existsSync(join(projectPath, "apps", role))) {
    return { dir: join(projectPath, "apps", role), app: role, layout: "monorepo" };
  }
  // پروژهٔ تک‌پکیجی: پوشهٔ apps ندارد ولی خودش یک پکیجِ Node است.
  if (!existsSync(join(projectPath, "apps")) && existsSync(join(projectPath, "package.json"))) {
    return { dir: projectPath, app: null, layout: "single" };
  }
  return { dir: null, app: null, layout: "missing" };
}

/** متغیرهای `.env` — اگر فایل نباشد، null (یعنی نمی‌دانیم، نه «نیست»). */
function readEnvFile(projectPath) {
  for (const name of [".env", ".env.example"]) {
    const file = join(projectPath, name);
    if (!existsSync(file)) continue;
    const vars = {};
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) vars[m[1]] = m[2].trim();
    }
    return { source: name, vars };
  }
  return null;
}

/**
 * ارزیابیِ یک مدرکِ تعریفی.
 *
 * @param {string} projectPath
 * @param {object} spec  همان شکلی که در رجیستری نوشته شده
 * @param {object} ctx   { probe } — تصویرِ پروژه از probeProject
 */
export function evaluateDetect(projectPath, spec, ctx = {}) {
  const { probe } = ctx;

  switch (spec.kind) {
    case "file": {
      const hit = existsSync(join(projectPath, spec.path));
      return hit ? present(`${spec.path} موجود است`) : absent(`${spec.path} وجود ندارد`);
    }

    case "npm": {
      const { dir, app, layout } = resolveRole(projectPath, spec.role);
      if (!dir) return absent(`نه apps/${spec.role} هست و نه پروژه تک‌پکیجی است`);
      const res = detectNpmPackage(projectPath, { app, name: spec.name });
      const where = layout === "monorepo" ? `apps/${spec.role}` : "ریشه";
      return { ...res, evidence: `${res.evidence} (${where})` };
    }

    case "npmRoot":
      return detectNpmPackage(projectPath, { name: spec.name });

    // «فقط pnpm workspaces»: وجودِ فایل کافی نیست — pnpm ۱۱ همین فایل را
    // برای تنظیماتش هم می‌سازد. معیار، داشتنِ بخشِ packages است.
    case "pnpmWorkspacePackages": {
      const res = detectMonorepoTool(projectPath);
      if (res.toolId === "pnpm-workspaces") return present(res.evidence);
      if (res.state === UNKNOWN) return unknown(res.evidence);
      if (res.toolId) return absent(`مونوریپو هست ولی با ${res.tool}، نه pnpm workspaces خالی`);
      return absent(res.evidence);
    }

    case "npmInstalled":
      return detectNodeModules(projectPath, resolveRole(projectPath, spec.role).app);

    case "pythonVenv":
      return detectPythonVenv(projectPath, resolveRole(projectPath, spec.role).app);

    case "pythonPackage":
      return detectPythonPackage(projectPath, resolveRole(projectPath, spec.role).app, spec.name);

    case "dockerService": {
      // بی‌خبری از Docker یعنی «نامعلوم»، نه «نصب نیست».
      if (!probe?.docker) return unknown("وضعیتِ Docker پرسیده نشد");
      const { docker } = probe;

      // بی فایلِ compose، این سرویس جزوِ این پروژه نیست — و این «نامعلوم» نیست،
      // قطعاً «نیست».
      if (!docker.file) return absent(docker.cli?.evidence || "فایلِ compose وجود ندارد");

      // نقشهٔ services خودش سه‌حالتی است: اگر Docker در دسترس نبود، هر سرویس
      // «نامعلوم» است. پس همان را عیناً پاس می‌دهیم.
      const found = docker.services?.[spec.service];
      if (found) return found;

      return absent(`سرویسِ ${spec.service} در ${docker.file} تعریف نشده`);
    }

    case "envVar": {
      const env = readEnvFile(projectPath);
      if (!env) return unknown("فایلِ env پیدا نشد، پس متغیرها خوانده نشدند");
      const value = env.vars[spec.name];
      if (value === undefined) return absent(`${spec.name} در ${env.source} نیست`);
      if (value === "") return absent(`${spec.name} در ${env.source} هست ولی خالی است`);
      return present(`${spec.name} در ${env.source} مقدار دارد`);
    }

    case "all": {
      const subs = spec.of.map((s) => evaluateDetect(projectPath, s, ctx));
      const failed = subs.find((s) => s.state === ABSENT);
      if (failed) return absent(failed.evidence);
      const vague = subs.find((s) => s.state === UNKNOWN);
      if (vague) return unknown(vague.evidence); // نامعلوم سرایت می‌کند
      return present(subs.map((s) => s.evidence).join(" و "));
    }

    case "any": {
      const subs = spec.of.map((s) => evaluateDetect(projectPath, s, ctx));
      const hit = subs.find((s) => s.state === PRESENT);
      if (hit) return present(hit.evidence);
      const vague = subs.find((s) => s.state === UNKNOWN);
      if (vague) return unknown(vague.evidence);
      return absent(subs.map((s) => s.evidence).join("، و "));
    }

    default:
      // نوعِ ناشناخته «نیست» نیست — نمی‌دانیم. (اعتبارسنجیِ رجیستری هم می‌گیردش.)
      return unknown(`نوعِ تشخیصِ ناشناخته: ${spec.kind}`);
  }
}

/**
 * تصویرِ کاملِ وضعیتِ رجیستری روی یک پروژه.
 *
 * @returns {{
 *   categories: Array<{
 *     id, label, question,
 *     options: Array<{ id, label, state, evidence, meta, verified, missingRequirements }>,
 *     chosen: string|null,
 *     conflict: string[]|null,
 *     undecided: boolean,
 *   }>,
 *   conflicts: Array<{ category: string, options: string[] }>,
 *   unverified: string[],
 * }}
 */
export function resolveRegistry(projectPath, { probe, categories = CATEGORIES, technologies = TECHNOLOGIES, lang = "fa" } = {}) {
  const ctx = { probe };
  const byId = new Map();

  // مرحلهٔ اول: وضعیتِ خودِ هر تکنولوژی
  for (const tech of technologies) {
    byId.set(tech.id, { tech, ...evaluateDetect(projectPath, tech.detect, ctx) });
  }

  // مرحلهٔ دوم: پیش‌نیازها. اگر پیش‌نیاز نیست، خودِ گزینه قابلِ نصب نیست —
  // ولی این با «نصب نیست» فرق دارد و باید جدا گزارش شود.
  // برچسب و پرسش و توضیحِ دسته، به زبانِ خواسته‌شده. اگر ترجمه‌ای نبود،
  // فارسی می‌ماند — چیزی نصفه‌ونیمه نشان داده نمی‌شود.
  const en = (cat, key) => {
    if (lang === "en" && CATEGORIES_EN[cat.id] && CATEGORIES_EN[cat.id][key]) return CATEGORIES_EN[cat.id][key];
    return cat[key] || "";
  };

  const resolvedCategories = categories.map((cat) => {
    const options = technologies
      .filter((t) => t.category === cat.id)
      .map((t) => {
        const found = byId.get(t.id);
        const missing = (t.requires || [])
          .filter((dep) => byId.get(dep)?.state !== PRESENT)
          .map((dep) => byId.get(dep)?.tech.label || dep);
        return {
          id: t.id,
          label: t.label,
          state: found.state,
          evidence: found.evidence,
          meta: lang === "en" && TECH_EN[t.id] ? TECH_EN[t.id] : t.meta,
          verified: !!t.apply?.verified,
          missingRequirements: missing,
          // برای مودالِ راهنما در UI: دقیقاً همان کاری که انجام می‌شود.
          installs: describeApply(t.id),
          // رمزهایی که UI باید قبل از نصب بپرسد.
          secrets: secretsFor(t.id),
          removal: describeRemoval(t.id),
          requires: (t.requires || []).map((dep) => byId.get(dep)?.tech.label || dep),
        };
      });

    const hits = options.filter((o) => o.state === PRESENT);
    const vague = options.filter((o) => o.state === UNKNOWN);

    return {
      id: cat.id,
      label: en(cat, "label"),
      question: en(cat, "question"),
      description: en(cat, "description"),
      foundational: !!cat.foundational,
      options,
      chosen: hits.length === 1 ? hits[0].id : null,
      conflict: hits.length > 1 ? hits.map((o) => o.id) : null,
      // «تصمیم‌نگرفته» فقط وقتی که هیچ گزینه‌ای نیست **و** هیچ ابهامی هم نیست.
      undecided: hits.length === 0 && vague.length === 0,
      uncertain: hits.length === 0 && vague.length > 0,
    };
  });

  return {
    categories: resolvedCategories,
    conflicts: resolvedCategories
      .filter((c) => c.conflict)
      .map((c) => ({ category: c.id, options: c.conflict })),
    unverified: technologies.filter((t) => !t.apply?.verified).map((t) => t.id),
  };
}
