/**
 * رجیستریِ تکنولوژی‌ها — قلبِ عمومی‌بودنِ ابزار.
 *
 * ---- قاعدهٔ حاکم ----
 * هر تکنولوژی یک **ردیفِ داده** است، نه کدِ پراکنده. اضافه‌کردنِ تکنولوژیِ
 * جدید باید یعنی اضافه‌کردنِ یک رکورد در همین فایل — نه دست‌بردن در منطقِ
 * ابزار. اگر یک روز برای پشتیبانی از یک فریم‌ورکِ جدید مجبور شدی جای دیگری
 * `if` بنویسی، یعنی این اسکیما ناقص است و باید خودِ اسکیما را گسترش داد.
 *
 * ---- سه بخشِ هر رکورد ----
 * ۱. `detect` — از کجا **بفهمیم** واقعاً نصب است. تعریفی و ترکیب‌شدنی، تا
 *    منطقِ تشخیص هم داده باشد نه کد.
 * ۲. `apply`  — چطور نصبش کنیم: CLIِ رسمیِ خودش + لایهٔ چسبِ ما (تصمیمِ ۰۰۰۳).
 * ۳. `meta`   — آنچه کاربر برای انتخاب لازم دارد: مزیت و عیب.
 *
 * ---- `verified` یعنی چه ----
 * `verified: true` فقط به تکنولوژی‌ای داده می‌شود که **واقعاً اجرا شده** و
 * نتیجه‌اش با مدرک دیده شده — نه فرمانی که قابل‌قبول به نظر می‌رسد.
 *
 * هر ۱۹ مورد این آزمون را داده‌اند: هر کدام روی یک پوشهٔ خالی اجرا شد و
 * نتیجه‌اش با مدرکِ واقعی سنجیده شد (لینکِ node_modules، پاسخِ سرویس از
 * میزبان، وجودِ فایلِ امضا). `tests/registry.test.mjs` فهرستشان را نگهبانی
 * می‌کند: اگر کسی بی‌آزمایش این علامت را بدهد، تست قرمز می‌شود.
 *
 * همین آزمایش هفت باگِ واقعی بیرون کشید که هیچ‌کدام را تستِ واحد نگرفته بود.
 * شرحشان در docs/ROADMAP.md، بخشِ «تأییدِ نهایی».
 */

// ---- محتوای فایل‌هایی که خودمان می‌سازیم ----
//
// اینها «چسبِ» ما هستند، نه خروجیِ CLIِ رسمی: `pnpm add -Dw` بیرونِ یک
// workspace خطا می‌دهد، پس ابزارِ مونوریپو باید اول خودِ workspace را بسازد.

/** داخلِ data/ همه‌چیز دادهٔ کاربر است، جز خودِ این فایل. */
const GITIGNORE_DATA = [
  "# فایل‌هایِ دیتابیس دادهٔ تواند، نه کد. واردِ گیت نمی‌شوند.",
  "*",
  "!.gitignore",
  "",
].join("\n");

const WORKSPACE_YAML = [
  "packages:",
  '  - "apps/*"',
  '  - "packages/*"',
  "",
  "# pnpm ۱۱ به‌طورِ پیش‌فرض، اگر اسکریپتِ بیلدِ یک پکیج بی‌اجازه رد شود، کلِ",
  "# نصب را با خطا شکست می‌دهد ([ERR_PNPM_IGNORED_BUILDS]). مشکلش این است که",
  "# اسکافولدرهای رسمی (NestJS، Next) وابستگی‌های فرعی‌ای می‌آورند که از قبل",
  "# نمی‌شود دانست کدامشان بیلد لازم دارند — پس نصب همیشه شکست می‌خورد.",
  "#",
  "# پس خاموشش می‌کنیم: ردشدنِ بیلد هشدار می‌شود، نه خطا. در عوض پکیج‌هایی که",
  "# واقعاً به بیلد نیاز دارند (nx، cypress) صریح در allowBuilds اجازه می‌گیرند،",
  "# و درستیِ نصب با مدرکِ واقعی سنجیده می‌شود نه با کدِ خروجِ pnpm.",
  "strictDepBuilds: false",
  "",
].join("\n");

const TURBO_JSON = JSON.stringify(
  {
    $schema: "https://turborepo.com/schema.json",
    tasks: {
      build: { dependsOn: ["^build"], outputs: ["dist/**", "build/**", ".next/**"] },
      lint: {},
      typecheck: {},
      test: {},
      dev: { cache: false, persistent: true },
    },
  },
  null,
  2,
) + "\n";

const NX_JSON = JSON.stringify({ $schema: "./node_modules/nx/schemas/nx-schema.json" }, null, 2) + "\n";

const REQUIREMENTS_TXT = [
  "# وابستگی‌های پایتونِ این پروژه.",
  "# نصب:  .venv\\Scripts\\pip install -r requirements.txt   (ویندوز)",
  "#       .venv/bin/pip install -r requirements.txt        (لینوکس/مک)",
  "",
].join("\n");


/**
 * appِ حداقلی برای تکنولوژی‌هایی که **اسکافولدرِ رسمی ندارند**.
 *
 * تصمیمِ ۰۰۰۳ می‌گوید اسکلت را از CLIِ رسمی بگیر، نه از قالبِ دست‌نویس. ولی
 * Express و BullMQ چنین CLIای ندارند. پس کمترین چیزِ ممکن را خودمان می‌نویسیم:
 * یک package.json و یک فایلِ چندخطیِ اجرایی — نه یک قالبِ کهنه‌شدنی.
 *
 * چرا لازم شد: فرمانِ `pnpm --filter api add express` فرض می‌کرد appِ «api» از
 * قبل هست، ولی در پروژهٔ نو هیچ‌چیز آن را نمی‌ساخت. همین‌طور apps/worker.
 */
const minimalApp = (name, main, lines) => ({
  pkg:
    JSON.stringify(
      { name, version: "0.0.0", private: true, type: "module", main, scripts: { start: `node ${main}` } },
      null,
      2,
    ) + "\n",
  code: lines.join("\n"),
});

const EXPRESS_APP = minimalApp("api", "src/main.js", [
  'import express from "express";',
  "",
  "const app = express();",
  "const port = process.env.API_PORT ?? 4000;",
  "",
  'app.get("/health", (_req, res) => res.json({ ok: true }));',
  "",
  "app.listen(port, () => console.log(`API روی http://localhost:${port}`));",
  "",
]);

const FASTIFY_APP = minimalApp("api", "src/main.js", [
  'import Fastify from "fastify";',
  "",
  "const app = Fastify({ logger: true });",
  "const port = Number(process.env.API_PORT ?? 4000);",
  "",
  'app.get("/health", async () => ({ ok: true }));',
  "",
  'app.listen({ port, host: "127.0.0.1" });',
  "",
]);

const WORKER_APP = minimalApp("worker", "src/main.js", [
  'import { Worker } from "bullmq";',
  "",
  'const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };',
  "",
  '// یک کارگرِ نمونه. نامِ صفِ واقعیِ خودت را جای "demo" بگذار.',
  'new Worker("demo", async (job) => {',
  '  console.log("کارِ رسیده:", job.id, job.data);',
  "}, { connection });",
  "",
  'console.log("کارگر آماده است.");',
  "",
]);

/** دسته‌های تصمیم. ترتیب مهم است: از پایه به بالا. */
export const CATEGORIES = [
  {
    id: "language",
    label: "زبان/رانتایمِ اصلی",
    question: "کدِ این پروژه با چه زبانی نوشته می‌شود؟",
    foundational: true,
  },
  {
    id: "packageManager",
    label: "مدیرِ پکیج",
    question: "وابستگی‌ها با چه ابزاری نصب شوند؟",
    foundational: true,
    requiresCategory: "language",
  },
  {
    id: "monorepoTool",
    label: "ساختارِ مخزن",
    question: "یک پکیجِ تنها، یا چند app در یک مخزن؟",
    requiresCategory: "packageManager",
  },
  {
    id: "frontendFramework",
    label: "فریم‌ورکِ فرانت",
    question: "رابطِ کاربری با چه چیزی ساخته شود؟",
    requiresCategory: "packageManager",
  },
  {
    id: "backendFramework",
    label: "فریم‌ورکِ بک‌اند",
    question: "API با چه چیزی نوشته شود؟",
    requiresCategory: "packageManager",
  },
  {
    id: "backgroundJobs",
    label: "پردازشِ پس‌زمینه",
    question: "کارهای طولانی چطور از درخواستِ کاربر جدا شوند؟",
    requiresCategory: "packageManager",
  },
  { id: "database", label: "دیتابیس", question: "داده کجا ذخیره شود؟" },
  { id: "search", label: "جستجو", question: "جستجوی متنی چطور انجام شود؟" },
  { id: "storage", label: "ذخیره‌سازیِ فایل", question: "فایل‌ها کجا نگه داشته شوند؟" },
  {
    id: "e2e",
    label: "تستِ سرتاسری",
    question: "رفتارِ واقعیِ برنامه چطور خودکار آزمایش شود؟",
    requiresCategory: "packageManager",
  },
];

/**
 * تکنولوژی‌ها.
 *
 * دامنهٔ دورِ اول عمداً محدود است: در هر دسته دو گزینه، تا ماشین واقعاً
 * امتحان شود (انتخاب، تعویض، تشخیصِ ناسازگاری). با یک گزینه هیچ ثابت نمی‌شد.
 * رسیدن به سه-چهار گزینه، بعدش فقط «یک ردیف اضافه کن» است.
 */
export const TECHNOLOGIES = [
  // ---------------------------------------------------------------- زبان
  {
    id: "node",
    category: "language",
    label: "Node.js",
    // امضای «زبانِ این پروژه Node است» همان package.json است.
    //
    // نگارشِ اول node_modules را هم شرط کرده بود، و نتیجه‌اش یک قفلِ کامل شد:
    // فرمانِ نصبش (`npm init -y`) هرگز node_modules نمی‌سازد، پس Node هیچ‌وقت
    // «نصب» نمی‌شد و هر چیزی که به آن نیاز داشت (pnpm و بعدش همه) خاموش
    // می‌ماند. نصب‌بودنِ وابستگی‌ها سؤالِ جداگانه‌ای است و probe.rootDeps
    // جوابش را می‌دهد.
    detect: { kind: "file", path: "package.json" },
    apply: { verified: true, steps: [{ kind: "cli", command: "npm init -y" }] },
    meta: {
      pros: ["یک زبان برای فرانت و بک‌اند", "اکوسیستمِ بزرگ", "برای کارِ I/O-محور سریع"],
      cons: ["برای پردازشِ سنگینِ CPU مناسب نیست", "پردازشِ زبانِ فارسی کتابخانهٔ قوی ندارد"],
    },
  },
  {
    id: "python",
    category: "language",
    label: "Python",
    detect: {
      kind: "any",
      of: [{ kind: "file", path: "pyproject.toml" }, { kind: "file", path: "requirements.txt" }],
    },
    // همان درسِ Node: فرمانِ ساختِ محیط (`python -m venv`) هیچ manifestای
    // نمی‌سازد، پس بی این فایل، پایتون هرگز «نصب» تشخیص داده نمی‌شد.
    apply: {
      verified: true,
      steps: [
        { kind: "writeFile", path: "requirements.txt", content: REQUIREMENTS_TXT },
        { kind: "cli", command: "python -m venv .venv" },
      ],
    },
    meta: {
      pros: ["کتابخانه‌های پردازشِ زبان و یادگیریِ ماشین (Hazm، ParsBERT)", "خوانا"],
      cons: ["برای فرانت کاری نمی‌کند", "کندتر از Node در I/O همزمان"],
    },
  },

  // -------------------------------------------------------- مدیرِ پکیج
  {
    id: "pnpm",
    category: "packageManager",
    label: "pnpm",
    requires: ["node"],
    detect: { kind: "file", path: "pnpm-lock.yaml" },
    apply: { verified: true, steps: [{ kind: "cli", command: "pnpm install" }] },
    meta: {
      pros: ["فضای دیسکِ کمتر (وابستگی‌های مشترک لینک می‌شوند)", "برای مونوریپو ساخته شده", "سریع"],
      cons: ["بعضی ابزارهای قدیمی با ساختارِ لینکش مشکل دارند"],
    },
  },
  {
    id: "npm",
    category: "packageManager",
    label: "npm",
    requires: ["node"],
    detect: { kind: "file", path: "package-lock.json" },
    apply: { verified: true, steps: [{ kind: "cli", command: "npm install" }] },
    meta: {
      pros: ["همراهِ خودِ Node می‌آید، نصبِ جدا ندارد", "بیشترین سازگاری"],
      cons: ["فضای دیسکِ بیشتر", "مونوریپو را ضعیف‌تر مدیریت می‌کند"],
    },
  },

  // ------------------------------------------------------ ساختارِ مخزن
  {
    id: "turborepo",
    category: "monorepoTool",
    label: "Turborepo",
    requires: ["pnpm"],
    detect: {
      kind: "all",
      of: [{ kind: "file", path: "turbo.json" }, { kind: "npmRoot", name: "turbo" }],
    },
    apply: {
      verified: true,
      steps: [
        // ابزارِ مونوریپو بدونِ workspace بی‌معناست، و «pnpm add -Dw» هم بیرونِ
        // workspace خطا می‌دهد. پس خودش هر دو فایل را می‌سازد.
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "turbo.json", content: TURBO_JSON },
        { kind: "pnpmAddDev", packages: ["turbo"] },
      ],
    },
    meta: {
      pros: ["کشِ بیلد — کارِ تکراری دوباره اجرا نمی‌شود", "اجرای موازیِ taskها", "کانفیگِ ساده"],
      cons: ["برای پروژهٔ تک‌پکیجی بی‌فایده است"],
    },
  },
  {
    id: "nx",
    category: "monorepoTool",
    label: "Nx",
    requires: ["pnpm"],
    detect: { kind: "all", of: [{ kind: "file", path: "nx.json" }, { kind: "npmRoot", name: "nx" }] },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "nx.json", content: NX_JSON },
        { kind: "pnpmAddDev", packages: ["nx"], allowBuild: ["nx"] },
      ],
    },
    meta: {
      pros: ["امکاناتِ بیشتر: گرافِ وابستگی، تولیدکنندهٔ کد", "برای مخزنِ خیلی بزرگ قوی‌تر"],
      cons: ["پیچیده‌تر و سنگین‌تر", "یادگیریِ بیشتری می‌خواهد"],
    },
  },
  {
    id: "pnpm-workspaces",
    category: "monorepoTool",
    label: "فقط pnpm workspaces",
    requires: ["pnpm"],
    // وجودِ فایل کافی نیست: pnpm ۱۱ همین فایل را برای تنظیماتش هم می‌سازد.
    // این مدرک وجودِ بخشِ packages را می‌خواهد.
    detect: { kind: "pnpmWorkspacePackages" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "mkdir", path: "apps" },
        { kind: "cli", command: "pnpm install" },
      ],
    },
    meta: {
      pros: ["هیچ ابزارِ اضافه‌ای لازم ندارد", "ساده و قابلِ فهم", "برای چند appِ کم کافی است"],
      cons: ["کشِ بیلد و اجرای موازی ندارد", "با بزرگ‌شدنِ پروژه کند می‌شود"],
    },
  },

  // ----------------------------------------------------- فریم‌ورکِ فرانت
  {
    id: "react-router-v7",
    category: "frontendFramework",
    label: "React Router v7 (framework mode)",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "web", name: "react-router" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "mkdir", path: "apps" },
        { kind: "cli", command: "npx --yes create-react-router@latest apps/web --yes --no-install" },
        { kind: "cli", command: "pnpm install" },
        { kind: "env", vars: { VITE_API_URL: "http://localhost:4000" } },
      ],
    },
    meta: {
      pros: ["رندرِ سمتِ سرور با روتینگِ ساده", "رویِ Vite — devِ سریع", "همان خطِ فکریِ Remix"],
      cons: ["اکوسیستمِ کوچک‌تر از Next.js", "منابعِ آموزشیِ کمتر"],
    },
  },
  {
    id: "nextjs",
    category: "frontendFramework",
    label: "Next.js",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "web", name: "next" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "mkdir", path: "apps" },
        { kind: "cli", command: "npx --yes create-next-app@latest apps/web --yes --skip-install" },
        { kind: "cli", command: "pnpm install" },
        { kind: "env", vars: { NEXT_PUBLIC_API_URL: "http://localhost:4000" } },
      ],
    },
    meta: {
      pros: ["بزرگ‌ترین اکوسیستم و بیشترین منبعِ آموزشی", "امکاناتِ آمادهٔ زیاد"],
      cons: ["به Vercel متمایل است", "پیچیدگیِ درونیِ بیشتر", "بیلدِ کندتر"],
    },
  },

  // ---------------------------------------------------- فریم‌ورکِ بک‌اند
  {
    id: "vite-react",
    category: "frontendFramework",
    label: "Vite + React (SPA)",
    requires: ["pnpm"],
    // مدرک عمداً @vitejs/plugin-react است، نه خودِ vite: React Router هم روی
    // Vite می‌نشیند، پس «vite نصب است» هر دو گزینه را سبز می‌کرد و یک دسته
    // به‌دروغ «هر دو نصب» می‌شد. آزموده شد: قالبِ React Router این پلاگین را
    // ندارد (پلاگینِ خودش را دارد).
    detect: { kind: "npm", role: "web", name: "@vitejs/plugin-react" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "mkdir", path: "apps" },
        { kind: "cli", command: "npx --yes create-vite@latest apps/web --no-interactive --template react-ts" },
        { kind: "cli", command: "pnpm install" },
        { kind: "env", vars: { VITE_API_URL: "http://localhost:4000" } },
      ],
    },
    meta: {
      pros: ["ساده‌ترین راه برای یک برنامهٔ تک‌صفحه‌ای", "devِ خیلی سریع", "بی‌قاعدهٔ تحمیلی — هر کتابخانه‌ای را می‌شود چسباند"],
      cons: ["رندرِ سمتِ سرور ندارد — برای SEO باید خودت کاری کنی", "روتینگ و داده‌گیری را خودت باید بچینی"],
    },
  },
  {
    id: "nestjs",
    category: "backendFramework",
    label: "NestJS",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "api", name: "@nestjs/core" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "mkdir", path: "apps" },
        { kind: "cli", command: "npx --yes @nestjs/cli@latest new apps/api --skip-git --skip-install --package-manager pnpm" },
        { kind: "cli", command: "pnpm install" },
        { kind: "env", vars: { API_PORT: "4000" } },
      ],
    },
    meta: {
      pros: ["ساختارِ آماده (ماژول، تزریقِ وابستگی)", "برای تیم و پروژهٔ بزرگ مناسب", "مستنداتِ خوب"],
      cons: ["برای کارِ کوچک زیادی است", "مفاهیمِ بیشتری برای یادگیری"],
    },
  },
  {
    id: "express",
    category: "backendFramework",
    label: "Express",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "api", name: "express" },
    apply: {
      verified: true,
      steps: [
        // Express اسکافولدرِ رسمی ندارد، پس کمترین appِ ممکن را خودمان می‌سازیم.
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "apps/api/package.json", content: EXPRESS_APP.pkg },
        { kind: "writeFile", path: "apps/api/src/main.js", content: EXPRESS_APP.code },
        { kind: "cli", command: "pnpm --filter api add express" },
        { kind: "env", vars: { API_PORT: "4000" } },
      ],
    },
    meta: {
      pros: ["سبک و ساده", "آزادیِ کامل در طراحی", "رایج‌ترین"],
      cons: ["ساختار را خودت باید بسازی", "در پروژهٔ بزرگ بی‌نظم می‌شود"],
    },
  },
  {
    id: "fastify",
    category: "backendFramework",
    label: "Fastify",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "api", name: "fastify" },
    apply: {
      verified: true,
      steps: [
        // مثلِ Express: اسکافولدرِ رسمیِ غیرتعاملی ندارد، پس کمترین appِ ممکن
        // را خودمان می‌سازیم (استثنای مستندِ تصمیمِ ۰۰۰۳).
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "apps/api/package.json", content: FASTIFY_APP.pkg },
        { kind: "writeFile", path: "apps/api/src/main.js", content: FASTIFY_APP.code },
        { kind: "cli", command: "pnpm --filter api add fastify" },
        { kind: "env", vars: { API_PORT: "4000" } },
      ],
    },
    meta: {
      pros: ["از Express سریع‌تر است", "اعتبارسنجیِ ورودی و لاگِ درست‌وحسابی در خودش دارد", "مدلِ پلاگینیِ مرتب"],
      cons: ["جامعهٔ کوچک‌تر از Express", "میان‌افزارهای Express همیشه مستقیم کار نمی‌کنند"],
    },
  },

  // ------------------------------------------------- پردازشِ پس‌زمینه
  {
    id: "bullmq",
    category: "backgroundJobs",
    label: "BullMQ",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "worker", name: "bullmq" },
    apply: {
      verified: true,
      steps: [
        // هیچ چیزی apps/worker را نمی‌ساخت، پس خودش می‌سازدش.
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "apps/worker/package.json", content: WORKER_APP.pkg },
        { kind: "writeFile", path: "apps/worker/src/main.js", content: WORKER_APP.code },
        { kind: "cli", command: "pnpm --filter worker add bullmq ioredis" },
        { kind: "env", vars: { REDIS_URL: "redis://localhost:6379" } },
        { kind: "composeService", service: "redis", image: "redis:7-alpine", ports: [{ container: 6379, host: 6379, env: "REDIS_PORT" }], volume: "/data" },
      ],
    },
    meta: {
      pros: ["هم‌زبانِ بک‌اند است، یکپارچگیِ ساده", "تلاشِ مجددِ خودکار", "پایدار"],
      cons: ["به Redis نیاز دارد", "فقط در دنیای Node"],
    },
  },

  // ------------------------------------------------------------ دیتابیس
  {
    id: "postgres",
    category: "database",
    label: "PostgreSQL",
    detect: { kind: "dockerService", service: "postgres" },
    apply: {
      verified: true,
      steps: [
        {
          kind: "composeService", service: "postgres", image: "postgres:17-alpine", ports: [{ container: 5432, host: 5432, env: "POSTGRES_PORT" }],
          // بدونِ POSTGRES_PASSWORD کانتینر بالا نمی‌آید — الزامِ خودِ ایمیج است.
          environment: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "change-me", POSTGRES_DB: "app" },
          volume: "/var/lib/postgresql/data",
        },
        { kind: "env", vars: { DATABASE_URL: "postgresql://app:change-me@localhost:5432/app" } },
      ],
    },
    meta: {
      pros: ["رابطه‌ای و قوی، با پشتیبانیِ JSON", "جستجوی متنی داخلی دارد", "بسیار پایدار"],
      cons: ["تنظیمش از MySQL کمی سخت‌تر است"],
    },
  },
  {
    id: "mysql",
    category: "database",
    label: "MySQL",
    detect: { kind: "dockerService", service: "mysql" },
    apply: {
      verified: true,
      steps: [
        {
          kind: "composeService", service: "mysql", image: "mysql:8", ports: [{ container: 3306, host: 3306, env: "MYSQL_PORT" }],
          environment: { MYSQL_ROOT_PASSWORD: "change-me", MYSQL_DATABASE: "app" },
          volume: "/var/lib/mysql",
        },
        { kind: "env", vars: { DATABASE_URL: "mysql://app:change-me@localhost:3306/app" } },
      ],
    },
    meta: {
      pros: ["رایج‌ترین، میزبانیِ ارزان و فراوان", "ابزارهای مدیریتیِ زیاد"],
      cons: ["امکاناتِ پیشرفتهٔ کمتر از Postgres", "پشتیبانیِ JSON ضعیف‌تر"],
    },
  },

  {
    id: "mongodb",
    category: "database",
    label: "MongoDB",
    detect: { kind: "dockerService", service: "mongodb" },
    apply: {
      verified: true,
      steps: [
        {
          kind: "composeService", service: "mongodb", image: "mongo:8", ports: [{ container: 27017, host: 27017, env: "MONGO_PORT" }],
          // بی این دو متغیر کانتینر بالا می‌آید ولی بی‌رمز — یعنی هر کسی روی
          // شبکهٔ لوکال به همهٔ داده دسترسی دارد. الزامِ خودِ ایمیج نیست، الزامِ
          // عقل است.
          environment: { MONGO_INITDB_ROOT_USERNAME: "app", MONGO_INITDB_ROOT_PASSWORD: "change-me", MONGO_INITDB_DATABASE: "app" },
          volume: "/data/db",
        },
        // authSource=admin لازم است: کاربرِ ریشه در دیتابیسِ admin ساخته می‌شود،
        // نه در دیتابیسِ app. بی آن، ورود رد می‌شود.
        { kind: "env", vars: { MONGO_URL: "mongodb://app:change-me@localhost:27017/app?authSource=admin" } },
      ],
    },
    meta: {
      pros: ["شکلِ داده از قبل تعریف‌شده لازم ندارد", "برای دادهٔ تودرتو و متغیر راحت", "مقیاسِ افقیِ آسان"],
      cons: ["تراکنش و join مثلِ دیتابیسِ رابطه‌ای قوی نیست", "بی‌انضباطیِ شکلِ داده به‌مرور دردسر می‌شود"],
    },
  },
  {
    id: "mariadb",
    category: "database",
    label: "MariaDB",
    detect: { kind: "dockerService", service: "mariadb" },
    apply: {
      verified: true,
      steps: [
        {
          kind: "composeService", service: "mariadb", image: "mariadb:11", ports: [{ container: 3306, host: 3306, env: "MARIADB_PORT" }],
          environment: { MARIADB_ROOT_PASSWORD: "change-me", MARIADB_DATABASE: "app", MARIADB_USER: "app", MARIADB_PASSWORD: "change-me" },
          volume: "/var/lib/mysql",
        },
        { kind: "env", vars: { DATABASE_URL: "mysql://app:change-me@localhost:3306/app" } },
      ],
    },
    meta: {
      pros: ["شاخهٔ آزادِ MySQL، با همان ابزارها و همان دستورها", "کمی سریع‌تر از MySQL در بعضی کارها", "بی‌نگرانیِ مالکیتِ شرکتی"],
      cons: ["در بعضی جزئیات از MySQL جدا شده و ۱۰۰٪ یکسان نیست", "میزبان‌های ابری کمتر مستقیم پشتیبانی‌اش می‌کنند"],
    },
  },
  {
    id: "sqlite",
    category: "database",
    label: "SQLite",
    // تنها دیتابیسِ این فهرست که کانتینر نمی‌خواهد: یک فایل روی دیسک است.
    // پس مدرکش هم Docker نیست، نصب‌بودنِ درایورش در پروژه است.
    requires: ["pnpm"],
    detect: { kind: "npmRoot", name: "better-sqlite3" },
    apply: {
      verified: true,
      steps: [
        // allowBuild لازم است: این پکیج باینریِ بومی دارد و pnpm ۱۰+ بی‌اجازه
        // اسکریپتِ بیلد را اجرا نمی‌کند و نصب را شکست‌خورده اعلام می‌کند.
        { kind: "pnpmAdd", packages: ["better-sqlite3"], allowBuild: ["better-sqlite3"] },
        { kind: "mkdir", path: "data" },
        // چسبِ لازم: فایلِ دیتابیس نباید واردِ گیت شود. بی این، هر بار که
        // برنامه چیزی می‌نویسد درختِ گیت کثیف می‌شود و دکمهٔ برگشت — که عمداً روی
        // درختِ کثیف امتناع می‌کند — برای همیشه قفل می‌ماند. در اجرای واقعی دیده شد.
        { kind: "writeFile", path: "data/.gitignore", content: GITIGNORE_DATA },
        { kind: "env", vars: { DATABASE_URL: "file:./data/app.db" } },
      ],
    },
    meta: {
      pros: ["هیچ سروری لازم ندارد — یک فایل است", "برای پروژهٔ کوچک و تستِ محلی سریع‌ترین راه", "پشتیبان‌گیری یعنی کپیِ یک فایل"],
      cons: ["برای نوشتنِ همزمانِ چند کاربر ساخته نشده", "روی چند سرور اصلاً کار نمی‌کند"],
    },
  },

  // -------------------------------------------------------------- جستجو
  {
    id: "meilisearch",
    category: "search",
    label: "Meilisearch",
    detect: { kind: "dockerService", service: "meilisearch" },
    apply: {
      verified: true,
      steps: [
        {
          kind: "composeService", service: "meilisearch", image: "getmeili/meilisearch:v1.11", ports: [{ container: 7700, host: 7700, env: "MEILI_PORT" }],
          environment: { MEILI_MASTER_KEY: "change-me", MEILI_NO_ANALYTICS: '"true"' },
          volume: "/meili_data",
        },
        { kind: "env", vars: { MEILI_URL: "http://localhost:7700", MEILI_MASTER_KEY: "change-me" } },
      ],
    },
    meta: {
      pros: ["راه‌اندازیِ خیلی ساده", "سریع، با تحملِ غلطِ تایپی", "با فارسی خوب کار می‌کند"],
      cons: ["برای دادهٔ خیلی بزرگ مقیاس‌پذیریِ کمتر", "امکاناتِ تحلیلی ندارد"],
    },
  },
  {
    id: "elasticsearch",
    category: "search",
    label: "Elasticsearch",
    detect: { kind: "dockerService", service: "elasticsearch" },
    apply: {
      verified: true,
      steps: [
        {
          kind: "composeService", service: "elasticsearch", image: "elasticsearch:8.15.0", ports: [{ container: 9200, host: 9200, env: "ELASTIC_PORT" }],
          // برای اجرای تک‌گره‌ایِ لوکال، این دو لازم‌اند وگرنه بالا نمی‌آید.
          environment: { "discovery.type": "single-node", "xpack.security.enabled": '"false"', ES_JAVA_OPTS: "-Xms512m -Xmx512m" },
          volume: "/usr/share/elasticsearch/data",
        },
        { kind: "env", vars: { ELASTIC_URL: "http://localhost:9200" } },
      ],
    },
    meta: {
      pros: ["بسیار قوی و مقیاس‌پذیر", "تحلیل و تجمیعِ پیشرفته"],
      cons: ["حافظهٔ زیادی می‌خورد", "نگه‌داری و تنظیمش سنگین است"],
    },
  },

  // ------------------------------------------------- ذخیره‌سازیِ فایل
  {
    id: "minio",
    category: "storage",
    label: "MinIO",
    detect: { kind: "dockerService", service: "minio" },
    apply: {
      verified: true,
      steps: [
        {
          kind: "composeService", service: "minio", image: "minio/minio:latest", ports: [{ container: 9000, host: 9000, env: "MINIO_PORT" }, { container: 9001, host: 9001, env: "MINIO_CONSOLE_PORT" }],
          // MinIO بدونِ command سرور را بالا نمی‌آورد.
          command: 'server /data --console-address ":9001"',
          environment: { MINIO_ROOT_USER: "app", MINIO_ROOT_PASSWORD: "change-me-min-8" },
          volume: "/data",
        },
        { kind: "env", vars: { MINIO_ENDPOINT: "http://localhost:9000", MINIO_BUCKET: "app" } },
      ],
    },
    meta: {
      pros: ["سازگار با S3، لوکال اجرا می‌شود", "بدونِ هزینه و بدونِ نیاز به اینترنت", "کنسولِ وب دارد"],
      cons: ["پشتیبان‌گیری و پایداری با خودت است"],
    },
  },
  {
    id: "s3",
    category: "storage",
    label: "S3 (ابری)",
    detect: { kind: "envVar", name: "AWS_S3_BUCKET" },
    apply: {
      verified: true,
      steps: [{ kind: "env", vars: { AWS_S3_BUCKET: "", AWS_REGION: "", AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "" } }],
    },
    meta: {
      pros: ["بی‌نهایت مقیاس‌پذیر", "نگه‌داری با خودت نیست", "پایداریِ بالا"],
      cons: ["از همان اول هزینه و اینترنت لازم دارد", "کارِ لوکال بدونِ اینترنت سخت می‌شود"],
    },
  },

  // ------------------------------------------------- تستِ سرتاسری
  {
    id: "playwright",
    category: "e2e",
    label: "Playwright",
    requires: ["pnpm"],
    detect: { kind: "npmRoot", name: "@playwright/test" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmAddDev", packages: ["@playwright/test"] },
        { kind: "cli", command: "pnpm exec playwright install chromium" },
      ],
    },
    meta: {
      pros: ["چند مرورگر (Chromium، Firefox، WebKit)", "سریع و پایدار", "گزارشِ خوب با عکس و ویدیو"],
      cons: ["دانلودِ مرورگرها حجم دارد"],
    },
  },
  {
    id: "cypress",
    category: "e2e",
    label: "Cypress",
    requires: ["pnpm"],
    detect: { kind: "npmRoot", name: "cypress" },
    apply: { verified: true, steps: [{ kind: "pnpmAddDev", packages: ["cypress"], allowBuild: ["cypress"] }] },
    meta: {
      pros: ["رابطِ کاربریِ خوب برای دیدنِ تست", "جامعهٔ بزرگ"],
      cons: ["عمدتاً Chromium", "کندتر", "تستِ چند-تب و چند-دامنه ضعیف"],
    },
  },
];

/**
 * راهِ **برداشتنِ** هر تکنولوژی.
 *
 * جدا از خودِ رکوردها نوشته شده تا یک‌جا خوانده شود — چون مهم‌ترین سؤالِ این
 * جدول این است: «کدام‌ها را نمی‌شود خودکار برداشت؟»
 *
 * دو شکل دارد:
 * - `steps`  → قابلِ برداشتنِ خودکار.
 * - `manual` → **نمی‌شود** خودکار برداشت، و دلیلش نوشته شده. ابزار در این حالت
 *   ادعای حذف نمی‌کند؛ صریح می‌گوید «این را خودت باید برداری».
 *
 * چرا بعضی‌ها manualاند: یک CLIِ رسمی که یک پوشهٔ کاملِ app ساخته، معکوس
 * ندارد. پاک‌کردنِ آن پوشه یعنی پاک‌کردنِ کدی که کاربر ممکن است رویش کار کرده
 * باشد. این تصمیمِ کاربر است، نه ابزار.
 */
export const REMOVALS = {
  node: { manual: "زبانِ اصلی را نمی‌شود دکمه‌ای عوض کرد — کلِ پروژه رویش بنا شده." },
  python: { steps: [{ kind: "cli", command: "Remove-Item -Recurse -Force .venv" }] },

  pnpm: { manual: "برای عوض‌کردنِ مدیرِ پکیج، lockfile و node_modules را پاک کن و با ابزارِ جدید نصب کن." },
  npm: { manual: "برای عوض‌کردنِ مدیرِ پکیج، lockfile و node_modules را پاک کن و با ابزارِ جدید نصب کن." },

  turborepo: { steps: [{ kind: "cli", command: "pnpm remove -D turbo" }, { kind: "deleteFile", path: "turbo.json" }] },
  nx: { steps: [{ kind: "cli", command: "pnpm remove -D nx" }, { kind: "deleteFile", path: "nx.json" }] },
  "pnpm-workspaces": {
    manual: "فایلِ pnpm-workspace.yaml ممکن است تنظیماتِ دیگرِ pnpm را هم داشته باشد (مثلِ allowBuilds). خودت نگاهش کن و فقط بخشِ packages را بردار.",
  },

  "react-router-v7": {
    manual: "این یک پوشهٔ کاملِ app ساخته (apps/web). حذفش یعنی پاک‌کردنِ کدی که ممکن است رویش کار کرده باشی — خودت تصمیم بگیر و خودت پاکش کن.",
  },
  "vite-react": {
    manual: "این یک پوشهٔ کاملِ app ساخته (apps/web). حذفش یعنی پاک‌کردنِ کدی که ممکن است رویش کار کرده باشی — خودت تصمیم بگیر و خودت پاکش کن.",
  },
  nextjs: {
    manual: "این یک پوشهٔ کاملِ app ساخته (apps/web). حذفش یعنی پاک‌کردنِ کدی که ممکن است رویش کار کرده باشی — خودت تصمیم بگیر و خودت پاکش کن.",
  },
  nestjs: {
    manual: "این یک پوشهٔ کاملِ app ساخته (apps/api). حذفش یعنی پاک‌کردنِ کدت — خودت تصمیم بگیر و خودت پاکش کن.",
  },
  express: { steps: [{ kind: "cli", command: "pnpm --filter api remove express" }] },
  fastify: { steps: [{ kind: "cli", command: "pnpm --filter api remove fastify" }] },
  bullmq: { steps: [{ kind: "cli", command: "pnpm --filter worker remove bullmq ioredis" }] },

  // سرویس‌های Docker: اول خوابانده می‌شوند، بعد از فایلِ compose حذف می‌شوند
  // (چون آن فایل از رویِ تصمیم‌ها از نو ساخته می‌شود).
  postgres: { steps: [{ kind: "composeDown", service: "postgres" }] },
  mysql: { steps: [{ kind: "composeDown", service: "mysql" }] },
  mongodb: { steps: [{ kind: "composeDown", service: "mongodb" }] },
  mariadb: { steps: [{ kind: "composeDown", service: "mariadb" }] },
  // SQLite کانتینر ندارد؛ درایورش برداشته می‌شود. فایلِ data/app.db عمداً
  // نمی‌ماند دستِ ابزار: دادهٔ کاربر است و پاک‌کردنش تصمیمِ او.
  sqlite: {
    steps: [{ kind: "cli", command: "pnpm remove better-sqlite3" }],
    note: "فایلِ دیتابیس در data/ دست‌نخورده می‌ماند — دادهٔ توست، خودت تصمیم بگیر.",
  },
  meilisearch: { steps: [{ kind: "composeDown", service: "meilisearch" }] },
  elasticsearch: { steps: [{ kind: "composeDown", service: "elasticsearch" }] },
  minio: { steps: [{ kind: "composeDown", service: "minio" }] },
  s3: { steps: [] }, // فقط متغیرِ env بود، و آن خودش برداشته می‌شود

  playwright: { steps: [{ kind: "cli", command: "pnpm remove -D @playwright/test" }] },
  cypress: { steps: [{ kind: "cli", command: "pnpm remove -D cypress" }] },
};

export const removalFor = (techId) => REMOVALS[techId] || null;

/** تکنولوژی‌هایی که برداشتنشان دستی است — UI باید صریح بگوید. */
export const manualRemovalTechnologies = () =>
  TECHNOLOGIES.filter((t) => REMOVALS[t.id]?.manual).map((t) => t.id);

// ---------------------------------------------------------------- اعتبارسنجی

const DETECT_KINDS = new Set([
  "file", "npm", "npmRoot", "npmInstalled", "dockerService", "pythonVenv", "envVar",
  "pnpmWorkspacePackages", "all", "any",
]);
const APPLY_KINDS = new Set(["cli", "env", "file", "composeService", "writeFile", "pnpmWorkspace", "pnpmAddDev", "pnpmAdd", "mkdir"]);
const REMOVE_KINDS = new Set(["cli", "deleteFile", "composeDown"]);

/**
 * درستیِ ساختاریِ خودِ رجیستری.
 *
 * این برای تست نوشته نشده — برای این است که یک غلطِ تایپی در داده، خودش را
 * به‌صورتِ رفتارِ عجیبِ ابزار نشان ندهد.
 *
 * @returns {string[]} فهرستِ ایرادها. خالی = سالم.
 */
export function validateRegistry({ categories = CATEGORIES, technologies = TECHNOLOGIES } = {}) {
  const problems = [];
  const catIds = new Set();
  const techIds = new Set();

  for (const cat of categories) {
    if (!cat.id) problems.push("دسته‌ای بدونِ id");
    else if (catIds.has(cat.id)) problems.push(`idِ تکراریِ دسته: ${cat.id}`);
    else catIds.add(cat.id);
    if (!cat.label) problems.push(`دستهٔ ${cat.id} برچسب ندارد`);
    if (!cat.question) problems.push(`دستهٔ ${cat.id} پرسش ندارد`);
  }

  for (const cat of categories) {
    if (cat.requiresCategory && !catIds.has(cat.requiresCategory)) {
      problems.push(`دستهٔ ${cat.id} به دستهٔ ناموجودِ ${cat.requiresCategory} ارجاع می‌دهد`);
    }
  }

  for (const tech of technologies) {
    if (!tech.id) { problems.push("تکنولوژی‌ای بدونِ id"); continue; }
    if (techIds.has(tech.id)) problems.push(`idِ تکراریِ تکنولوژی: ${tech.id}`);
    techIds.add(tech.id);

    if (!tech.label) problems.push(`${tech.id}: برچسب ندارد`);
    if (!catIds.has(tech.category)) problems.push(`${tech.id}: دستهٔ ناشناخته «${tech.category}»`);
    if (!tech.detect) problems.push(`${tech.id}: مدرکِ تشخیص ندارد`);
    else problems.push(...validateDetectSpec(tech.id, tech.detect));

    if (!tech.apply) problems.push(`${tech.id}: راهِ نصب ندارد`);
    else {
      if (typeof tech.apply.verified !== "boolean") problems.push(`${tech.id}: apply.verified باید بولی باشد`);
      if (!Array.isArray(tech.apply.steps) || tech.apply.steps.length === 0) {
        problems.push(`${tech.id}: apply.steps خالی است`);
      } else {
        for (const step of tech.apply.steps) {
          if (!APPLY_KINDS.has(step.kind)) problems.push(`${tech.id}: نوعِ نصبِ ناشناخته «${step.kind}»`);
        }
      }
    }

    const meta = tech.meta || {};
    if (!Array.isArray(meta.pros) || meta.pros.length === 0) problems.push(`${tech.id}: مزیتی ننوشته`);
    if (!Array.isArray(meta.cons) || meta.cons.length === 0) {
      problems.push(`${tech.id}: عیبی ننوشته — هیچ تکنولوژی‌ای بی‌عیب نیست`);
    }
  }

  for (const tech of technologies) {
    for (const dep of tech.requires || []) {
      if (dep === tech.id) problems.push(`${tech.id}: پیش‌نیازِ خودش است`);
      else if (!techIds.has(dep)) problems.push(`${tech.id}: پیش‌نیازِ ناموجودِ ${dep}`);
    }
  }

  // هر تکنولوژی باید راهِ برداشتنش معلوم باشد — حتی اگر جواب «نمی‌شود، دستی
  // است». نبودنِ این ردیف یعنی ابزار نمی‌داند و ممکن است ادعای حذفِ بی‌پایه بکند.
  for (const tech of technologies) {
    if (!Object.prototype.hasOwnProperty.call(REMOVALS, tech.id)) {
      problems.push(`${tech.id}: راهِ برداشتنش در REMOVALS ثبت نشده`);
      continue;
    }
    const rem = REMOVALS[tech.id];
    if (rem.manual) {
      if (typeof rem.manual !== "string" || rem.manual.length < 10) {
        problems.push(`${tech.id}: دلیلِ دستی‌بودنِ حذف باید توضیح داده شود`);
      }
    } else if (!Array.isArray(rem.steps)) {
      problems.push(`${tech.id}: remove باید steps یا manual داشته باشد`);
    } else {
      for (const step of rem.steps) {
        if (!REMOVE_KINDS.has(step.kind)) problems.push(`${tech.id}: نوعِ حذفِ ناشناخته «${step.kind}»`);
      }
    }
  }

  return problems;
}

function validateDetectSpec(techId, spec, depth = 0) {
  if (depth > 4) return [`${techId}: مدرکِ تشخیص بیش از حد تو-در-تو است`];
  if (!spec || !spec.kind) return [`${techId}: مدرکِ تشخیص بدونِ kind`];
  if (!DETECT_KINDS.has(spec.kind)) return [`${techId}: نوعِ تشخیصِ ناشناخته «${spec.kind}»`];

  const problems = [];
  if (spec.kind === "all" || spec.kind === "any") {
    if (!Array.isArray(spec.of) || spec.of.length === 0) {
      problems.push(`${techId}: «${spec.kind}» بدونِ زیرشرط`);
    } else {
      for (const sub of spec.of) problems.push(...validateDetectSpec(techId, sub, depth + 1));
    }
  } else if (spec.kind === "file" && !spec.path) {
    problems.push(`${techId}: تشخیصِ file بدونِ path`);
  } else if ((spec.kind === "npm" || spec.kind === "npmRoot") && !spec.name) {
    problems.push(`${techId}: تشخیصِ ${spec.kind} بدونِ name`);
  } else if (spec.kind === "dockerService" && !spec.service) {
    problems.push(`${techId}: تشخیصِ dockerService بدونِ service`);
  } else if (spec.kind === "envVar" && !spec.name) {
    problems.push(`${techId}: تشخیصِ envVar بدونِ name`);
  }
  return problems;
}

// ------------------------------------------------------------ کمکی‌های خواندن

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || null;
export const technologyById = (id) => TECHNOLOGIES.find((t) => t.id === id) || null;
export const technologiesInCategory = (id) => TECHNOLOGIES.filter((t) => t.category === id);

/** تکنولوژی‌هایی که هنوز فرمانِ نصبشان واقعاً اجرا و تأیید نشده. */
export const unverifiedTechnologies = () => TECHNOLOGIES.filter((t) => !t.apply?.verified);
