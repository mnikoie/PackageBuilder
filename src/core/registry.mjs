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
    // نمای تعاملی: فهرستِ کارها با تیکِ زندهٔ هرکدام. پیش‌فرضِ turbo ۲ حالتِ
    // «stream» است که همه‌چیز را پشتِ‌سرِ هم می‌ریزد و دنبال‌کردنش سخت است.
    ui: "tui",
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

/**
 * کانفیگِ redocly.
 *
 * دو قاعده عمداً خاموش‌اند و دلیلشان داخلِ خودِ فایل نوشته شده — خاموشیِ
 * بی‌دلیل همان بدهی‌ای است که بعداً کسی جرئت نمی‌کند روشنش کند.
 *
 * قاعدهٔ operation-4xx-response عمداً **روشن** ماند: برای /health پاسخِ ۴xx
 * معنا ندارد و هشدارش می‌ماند، ولی همان هشدار یادآوری‌ای است برای مسیرهای
 * واقعی که بعداً اضافه می‌کنی.
 */
const REDOCLY_YAML = [
  "extends:",
  "  - recommended",
  "rules:",
  "  # انتخابِ لایسنس تصمیمِ صاحبِ پروژه است، نه این ابزار.",
  "  info-license-strict: off",
  "  # پروژهٔ نوساخته واقعاً روی localhost اجرا می‌شود؛ این آدرسِ نمونه نیست.",
  "  no-server-example.com: off",
  "",
].join("\n");

/**
 * اسکلتِ سندِ OpenAPI.
 *
 * عمداً کامل‌تر از «حداقلِ معتبر» است: اجرای واقعیِ `redocly lint` روی نگارشِ
 * اولِ این قالب ۲ خطا و ۳ هشدار داد (servers نبود، امنیت تعریف نشده بود،
 * operationId و پاسخِ خطا نداشت). سندی که ابزارِ رسمیِ خودش ردش کند، از روزِ
 * اول بدهی است — پس همان‌ها اینجا رفع شده‌اند.
 */
const OPENAPI_YAML = [
  "openapi: 3.1.0",
  "info:",
  "  title: API",
  "  version: 0.1.0",
  "  description: نقشهٔ رسمیِ این API. هر مسیرِ نو را اینجا هم بنویس.",
  "  license:",
  "    name: UNLICENSED",
  "servers:",
  "  - url: http://localhost:4000",
  "    description: اجرای محلی",
  "components:",
  "  schemas:",
  "    Error:",
  "      type: object",
  "      properties:",
  "        message:",
  "          type: string",
  "# پیش‌فرض: هیچ مسیری احراز هویت نمی‌خواهد. وقتی احرازِ هویت را انتخاب کردی،",
  "# securitySchemes را اینجا اضافه کن و مسیرهای لازم را security بده.",
  "security: []",
  "paths:",
  "  /health:",
  "    get:",
  "      operationId: getHealth",
  "      summary: زنده بودنِ سرویس",
  "      responses:",
  '        "200":',
  "          description: سرویس بالاست",
  "          content:",
  "            application/json:",
  "              schema:",
  "                type: object",
  "                properties:",
  "                  ok:",
  "                    type: boolean",
  '        "500":',
  "          description: خطای داخلی",
  "          content:",
  "            application/json:",
  "              schema:",
  '                $ref: "#/components/schemas/Error"',
  "",
].join("\n");

/** روترِ نمونهٔ tRPC. کوچک است ولی واقعاً صدا زده می‌شود. */
const TRPC_ROUTER = [
  'import { initTRPC } from "@trpc/server";',
  'import { z } from "zod";',
  "",
  "const t = initTRPC.create();",
  "",
  "export const appRouter = t.router({",
  "  ping: t.procedure.query(() => ({ ok: true })),",
  "  greet: t.procedure",
  "    .input(z.object({ name: z.string() }))",
  "    .query(({ input }) => `سلام ${input.name}`),",
  "});",
  "",
  "// نوعِ روتر همان چیزی است که سمتِ کلاینت import می‌شود — بی تولیدِ کد.",
  "export const createCaller = t.createCallerFactory(appRouter);",
  "",
].join("\n");

/** سرورِ نمونهٔ GraphQL روی graphql-yoga. */
const GRAPHQL_SERVER = [
  'import { createServer } from "node:http";',
  'import { createSchema, createYoga } from "graphql-yoga";',
  "",
  "const yoga = createYoga({",
  "  schema: createSchema({",
  "    typeDefs: `type Query { hello: String! }`,",
  '    resolvers: { Query: { hello: () => "سلام" } },',
  "  }),",
  "});",
  "",
  "const port = Number(process.env.GRAPHQL_PORT ?? 4001);",
  'createServer(yoga).listen(port, "127.0.0.1", () =>',
  "  console.log(`GraphQL: http://127.0.0.1:${port}/graphql`),",
  ");",
  "",
].join("\n");

/** کمترین appِ ممکن برای api — وقتی هنوز فریم‌ورکِ بک‌اندی انتخاب نشده. */
const NODE_AI_APP = minimalApp("ai-service", "src/main.js", [
  "// سرویسِ AI روی Node. کلید را از env بخوان، هرگز در کد ننویس.",
  "//",
  "// کلاینت عمداً تنبل ساخته می‌شود: خودِ کتابخانه اگر کلید نداشته باشد همان",
  "// لحظهٔ ساخت خطا می‌دهد، و ساختنش در بالای فایل یعنی سرویس بی‌کلید اصلاً",
  "// بالا نمی‌آید. در اجرای واقعی دیده شد.",
  'import OpenAI from "openai";',
  "",
  'const apiKey = process.env.OPENAI_API_KEY ?? "";',
  "",
  "export function client() {",
  "  if (!apiKey) {",
  '    throw new Error("OPENAI_API_KEY تنظیم نشده. در فایلِ .env بگذارش.");',
  "  }",
  "  return new OpenAI({ apiKey });",
  "}",
  "",
  'console.log("سرویسِ AI آماده است. کلید:", apiKey ? "هست" : "هنوز تنظیم نشده");',
  "",
]);

const BARE_API_APP = minimalApp("api", "src/main.js", [
  '// این فایل جای‌نگه‌دار است. با انتخابِ فریم‌ورکِ بک‌اند، جایش را می‌گیرد.',
  'console.log("apps/api آماده است.");',
  "",
]);

/** ورودیِ CSS برای Tailwind ۴ — یک خط import کافی است. */
const TAILWIND_CSS = [
  "/* Tailwind نگارشِ ۴: همه‌چیز با همین یک خط می‌آید. */",
  '@import "tailwindcss";',
  "",
  "/* استایلِ خودت را از اینجا به بعد بنویس. */",
  "",
].join("\n");

/** سرویسِ FastAPI — کوچک ولی واقعاً اجراشدنی. */
const FASTAPI_MAIN = [
  "from fastapi import FastAPI",
  "",
  'app = FastAPI(title="سرویسِ پردازشِ فارسی")',
  "",
  "",
  '@app.get("/health")',
  "def health():",
  '    return {"ok": True}',
  "",
  "",
  '@app.get("/normalize")',
  "def normalize(text: str):",
  '    """نمونهٔ ساده: یکدست‌کردنِ «ی» و «ک»‌ِ عربی به فارسی."""',
  '    return {"text": text.replace("ي", "ی").replace("ك", "ک")}',
  "",
].join("\n");

const FASTAPI_REQUIREMENTS = [
  "fastapi",
  "uvicorn[standard]",
  "",
].join("\n");

/** کارگرِ Celery — با یک کارِ نمونه که واقعاً صدا زده می‌شود. */
const CELERY_TASKS = [
  "import os",
  "",
  "from celery import Celery",
  "",
  'broker = os.environ.get("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")',
  'app = Celery("worker", broker=broker, backend=broker)',
  "",
  "",
  "@app.task",
  "def add(x, y):",
  '    """کارِ نمونه. کارهای واقعیِ خودت را کنارش بنویس."""',
  "    return x + y",
  "",
].join("\n");

const CELERY_REQUIREMENTS = [
  "celery",
  "redis",
  "",
].join("\n");

/** لاگرِ pino با تنظیماتِ عاقلانه — و بدونِ ادعای «Sentry وصل است». */
const PINO_LOGGER = [
  "// لاگرِ مشترکِ برنامه.",
  "//",
  "// دو نکته که در تولید مهم‌اند:",
  "//  - سطحِ لاگ از env می‌آید تا بی تغییرِ کد قابلِ تنظیم باشد.",
  "//  - داده‌های حساس (رمز، توکن، کوکی) پیش از نوشتن پنهان می‌شوند.",
  'import pino from "pino";',
  "",
  "export const logger = pino({",
  '  level: process.env.LOG_LEVEL ?? "info",',
  "  redact: {",
  '    paths: ["password", "token", "authorization", "cookie", "*.password", "*.token"],',
  '    censor: "[پنهان‌شده]",',
  "  },",
  "});",
  "",
].join("\n");

/**
 * راه‌اندازیِ Sentry.
 *
 * عمداً بی DSN هیچ کاری نمی‌کند و صریح می‌گوید خاموش است — ابزارِ خطایابی‌ای
 * که خودش بی‌صدا شکست بخورد، بدترین نوعِ ابزار است.
 */
const SENTRY_INIT = [
  "// گزارشِ خطا به Sentry.",
  "//",
  "// بی SENTRY_DSN این فایل عمداً کاری نمی‌کند و می‌گوید خاموش است. DSN را از",
  "// داشبوردِ خودت بردار و در .env بگذار.",
  'import * as Sentry from "@sentry/node";',
  "",
  'const dsn = process.env.SENTRY_DSN ?? "";',
  "",
  "export const sentryEnabled = Boolean(dsn);",
  "",
  "if (sentryEnabled) {",
  "  Sentry.init({",
  "    dsn,",
  '    environment: process.env.NODE_ENV ?? "development",',
  "    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),",
  "  });",
  "} else {",
  '  console.warn("SENTRY_DSN تنظیم نشده — گزارشِ خطا خاموش است.");',
  "}",
  "",
  "export { Sentry };",
  "",
].join("\n");

/** کانفیگِ Prometheus برای پشتهٔ خودمیزبان. */
const PROMETHEUS_YML = [
  "global:",
  "  scrape_interval: 15s",
  "",
  "scrape_configs:",
  "  - job_name: prometheus",
  "    static_configs:",
  '      - targets: ["localhost:9090"]',
  "",
  "  # سرویسِ خودت را اینجا اضافه کن. مثال:",
  "  # - job_name: api",
  "  #   static_configs:",
  '  #     - targets: ["host.docker.internal:4000"]',
  "",
].join("\n");

/**
 * ورودیِ استایل برای Bootstrap.
 *
 * برخلافِ Tailwind که در زمانِ بیلد کلاس می‌سازد، Bootstrap یک فایلِ CSSِ
 * آمادهٔ کامل است؛ پس فقط import می‌شود. آیکون‌ها و اجزای جاوااسکریپتی‌اش
 * (مثلِ modal) جدا می‌آیند و اینجا تحمیل نشده‌اند.
 */
const BOOTSTRAP_CSS = [
  "/* Bootstrap: فایلِ آمادهٔ کامل. */",
  '@import "bootstrap/dist/css/bootstrap.min.css";',
  "",
  "/* استایلِ خودت را از اینجا به بعد بنویس. */",
  "",
].join("\n");

/** package.jsonِ یک پکیجِ مشترک — نه اجراشدنی، فقط برای import شدن. */
const sharedPkg = (name, description) =>
  JSON.stringify(
    {
      name: `@workspace/${name}`,
      version: "0.0.0",
      private: true,
      description,
      main: "src/index.ts",
      types: "src/index.ts",
    },
    null,
    2,
  ) + "\n";

const SHARED_PACKAGES = [
  { dir: "ui", desc: "کامپوننت‌های مشترکِ رابطِ کاربری", index: "// کامپوننت‌های مشترک را اینجا export کن.\nexport {};\n" },
  { dir: "shared-types", desc: "تایپ‌های مشترکِ بینِ فرانت و بک‌اند", index: "// تایپ‌هایی که هر دو طرف لازمشان دارند.\nexport {};\n" },
  { dir: "api-client", desc: "کلاینتِ API — از روی سندِ OpenAPI تولید می‌شود", index: "// کلاینتِ تولیدشده اینجا می‌نشیند.\nexport {};\n" },
  { dir: "config", desc: "تنظیماتِ مشترک (eslint، tsconfig، ...)", index: "// تنظیماتِ مشترک.\nexport {};\n" },
];

const WORKER_APP = minimalApp("worker", "src/main.js", [
  'import { Worker } from "bullmq";',
  "",
  'const connection = { url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379" };',
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
    description: [
      "این پایه‌ای‌ترین تصمیمِ پروژه است: کدها با چه زبانی نوشته می‌شوند.",
      "همه‌چیزِ دیگر رویش سوار می‌شود — فریم‌ورک، مدیرِ پکیج، کتابخانه‌ها.",
      "Node یعنی یک زبان برای فرانت و بک‌اند، و اکوسیستمِ بسیار بزرگ.",
      "Python یعنی دسترسی به کتابخانه‌های پردازشِ زبان و یادگیریِ ماشین.",
      "لازم نیست یکی را برای همیشه انتخاب کنی: می‌شود بک‌اند Node باشد و",
      "سرویسِ AI پایتون — برای همین «سرویسِ AI» دستهٔ جداگانه‌ای دارد.",
    ].join(" "),
  },
  {
    id: "packageManager",
    label: "مدیرِ پکیج",
    question: "وابستگی‌ها با چه ابزاری نصب شوند؟",
    foundational: true,
    requiresCategory: "language",
    description: [
      "ابزاری که وابستگی‌ها (کتابخانه‌های آماده) را نصب و نگه‌داری می‌کند.",
      "pnpm فضای دیسکِ کمتری می‌گیرد چون نسخه‌های مشترک را یک‌بار نگه می‌دارد",
      "و لینک می‌دهد، و برای پروژه‌های چنداپی ساخته شده.",
      "npm همراهِ خودِ Node می‌آید و بیشترین سازگاری را دارد.",
      "این تصمیم بعداً هم عوض‌شدنی است، ولی عوض‌کردنش یعنی پاک‌کردنِ",
      "lockfile و نصبِ دوباره — پس بهتر است از اول درست انتخاب شود.",
    ].join(" "),
  },
  {
    id: "monorepoTool",
    label: "ساختارِ مخزن (مونوریپو)",
    question: "یک پکیجِ تنها، یا چند app در یک مخزن؟",
    requiresCategory: "packageManager",
    description: [
      "اگر پروژه بیش از یک برنامه دارد (مثلاً یک سایت و یک API)، دو راه هست:",
      "هرکدام مخزنِ جدا، یا همه در یک مخزن. این دسته دربارهٔ راهِ دوم است.",
      "«فقط pnpm workspaces» ساده‌ترین حالت است و ابزارِ اضافه نمی‌خواهد.",
      "Turborepo و Nx روی همان سوار می‌شوند و کشِ بیلد اضافه می‌کنند:",
      "کاری که قبلاً انجام شده دوباره اجرا نمی‌شود، پس بیلد خیلی سریع‌تر است.",
      "Nx امکاناتِ بیشتری دارد (گرافِ وابستگی، تولیدکنندهٔ کد) ولی سنگین‌تر است.",
    ].join(" "),
  },
  {
    id: "frontendFramework",
    label: "فریم‌ورکِ فرانت",
    question: "رابطِ کاربری با چه چیزی ساخته شود؟",
    requiresCategory: "packageManager",
    description: [
      "چیزی که کاربر در مرورگر می‌بیند با این ساخته می‌شود.",
      "تفاوتِ اصلی در جایی است که صفحه ساخته می‌شود:",
      "Next.js و React Router می‌توانند صفحه را روی سرور بسازند (SSR) که",
      "برای دیده‌شدن در گوگل و سرعتِ بارِ اول مهم است.",
      "Vite + React یک برنامهٔ تک‌صفحه‌ایِ ساده می‌سازد که همه‌چیزش در مرورگر",
      "اجرا می‌شود — سبک‌تر و ساده‌تر، ولی SEO را خودت باید حل کنی.",
      "نکته: قالبِ رسمیِ Next.js و React Router خودشان Tailwind می‌آورند.",
    ].join(" "),
  },
  {
    id: "uiKit",
    label: "کیتِ رابطِ کاربری",
    question: "دکمه و فرم و مودال از کجا بیایند؟",
    description: [
      "نوشتنِ هر دکمه و فرم و مودال از صفر وقت می‌برد و نتیجه‌اش هم یکدست",
      "نمی‌شود. کیتِ رابطِ کاربری این‌ها را آماده می‌دهد.",
      "shadcn/ui با بقیه فرق دارد: کتابخانه‌ای نیست که import کنی، بلکه کدِ",
      "کامپوننت را داخلِ پروژه‌ات کپی می‌کند. یعنی مالکِ کد خودتی و هر جایش را",
      "خواستی عوض می‌کنی، بی اینکه با پیش‌فرض‌های یک کتابخانه بجنگی.",
      "Lucide هم مجموعهٔ آیکونش است.",
    ].join(" "),
    requiresCategory: "styling",
  },
  {
    id: "dataFetching",
    label: "دادهٔ سمتِ کلاینت",
    question: "گرفتنِ داده از سرور چطور مدیریت شود؟",
    description: [
      "هر صفحه‌ای که از سرور داده می‌گیرد باید چند چیز را خودش حل کند: حالتِ",
      "در حالِ بارگذاری، خطا، تلاشِ دوباره، کشِ نتیجه، و تازه‌سازی بعد از تغییر.",
      "نوشتنِ دستیِ این‌ها با useEffect زود به کدِ تکراری و باگ‌خیز تبدیل می‌شود.",
      "TanStack Query همهٔ این‌ها را می‌دهد و خودش می‌فهمد کِی داده کهنه شده.",
      "SWR سبک‌تر و ساده‌تر است ولی امکاناتِ کمتری دارد.",
    ].join(" "),
    requiresCategory: "frontendFramework",
  },
  {
    id: "stateManagement",
    label: "استیتِ سراسری",
    question: "داده‌ای که چند صفحه لازمش دارند کجا بماند؟",
    description: [
      "چیزهایی مثلِ کاربرِ واردشده، تمِ روشن/تاریک، یا سبدِ خرید را چند بخشِ",
      "مختلفِ برنامه لازم دارند. رد کردنشان از میانِ کامپوننت‌ها به‌سرعت شلوغ",
      "می‌شود.",
      "Zustand کوچک و ساده است: یک تابع می‌نویسی و تمام.",
      "Redux Toolkit ساختارِ سخت‌گیرتری دارد که برای تیمِ بزرگ و تاریخچهٔ",
      "تغییرات مفید است ولی کدِ بیشتری می‌خواهد.",
      "توجه: این با «دادهٔ سمتِ کلاینت» فرق دارد — آن یکی مالِ دادهٔ سرور است.",
    ].join(" "),
    requiresCategory: "frontendFramework",
  },
  {
    id: "persianDate",
    label: "تاریخِ شمسی",
    question: "تاریخِ جلالی چطور نمایش و انتخاب شود؟",
    description: [
      "جاوااسکریپت تاریخِ شمسی را نمی‌شناسد. برای انتخابگرِ تاریخ و نمایشِ",
      "درستِ تاریخ در فرم‌ها به کتابخانه نیاز داری.",
      "react-multi-date-picker تقویمِ جلالی و راست‌به‌چپ را با هم دارد.",
      "خودِ راست‌به‌چپ‌بودنِ صفحه کتابخانه نمی‌خواهد: با dir=\"rtl\" و کلاس‌های",
      "Tailwind حل می‌شود.",
    ].join(" "),
    requiresCategory: "frontendFramework",
  },
  {
    id: "sharedPackages",
    label: "پکیج‌های مشترک",
    question: "کدی که بینِ چند app مشترک است کجا بماند؟",
    description: [
      "وقتی هم سایت داری هم API، چیزهایی بینشان مشترک می‌شود: تایپ‌ها،",
      "کامپوننت‌ها، کلاینتِ API، و تنظیمات. کپی‌کردنشان یعنی روزی که یکی عوض",
      "شود، بقیه از آن عقب می‌مانند.",
      "این گزینه پوشهٔ packages/ را با چهار پکیجِ آمادهٔ workspace می‌سازد:",
      "ui برای کامپوننت‌های مشترک، shared-types برای تایپ‌ها، api-client برای",
      "کلاینتِ تولیدشده از OpenAPI، و config برای تنظیماتِ مشترک.",
    ].join(" "),
    requiresCategory: "monorepoTool",
  },
  {
    id: "backendFramework",
    label: "فریم‌ورکِ بک‌اند",
    question: "API با چه چیزی نوشته شود؟",
    requiresCategory: "packageManager",
    description: [
      "بخشی از برنامه که روی سرور اجرا می‌شود: به درخواست‌ها جواب می‌دهد،",
      "با دیتابیس حرف می‌زند، و منطقِ اصلی را نگه می‌دارد.",
      "Express سبک‌ترین است و هیچ ساختاری تحمیل نمی‌کند — آزادیِ کامل،",
      "ولی نظمِ پروژه با خودت است.",
      "Fastify سریع‌تر است و اعتبارسنجیِ ورودی و لاگ را در خودش دارد.",
      "NestJS ساختارِ آماده و منظم می‌دهد که برای تیم و پروژهٔ بزرگ خوب است،",
      "ولی برای کارِ کوچک زیادی است.",
    ].join(" "),
  },
  {
    id: "styling",
    label: "استایل",
    question: "ظاهرِ برنامه چطور نوشته شود؟",
    requiresCategory: "packageManager",
    description: [
      "ظاهرِ برنامه چطور نوشته شود.",
      "Tailwind کلاس‌های ریز می‌دهد که کنارِ خودِ المان می‌نویسی، و در بیلد",
      "فقط همان‌هایی که استفاده کرده‌ای وارد خروجی می‌شوند.",
      "Bootstrap اجزای آماده می‌دهد (دکمه، فرم، مودال) که بی نوشتنِ CSS",
      "کار می‌کنند — سریع‌تر شروع می‌شود ولی ظاهرِ سایت‌ها شبیهِ هم می‌شود.",
      "اگر فرانتت Next.js یا React Router باشد، Tailwind از قبل هست.",
    ].join(" "),
  },
  {
    id: "aiService",
    label: "سرویسِ AI / پردازشِ فارسی",
    question: "پردازشِ متنِ فارسی و کارهای AI کجا انجام شود؟",
    description: [
      "اگر پروژه کارِ هوشِ مصنوعی یا پردازشِ متنِ فارسی دارد، این تصمیم",
      "می‌گوید آن بخش کجا و با چه زبانی اجرا شود.",
      "پایتون کتابخانه‌های قوی‌ترِ فارسی دارد (مثلِ Hazm و ParsBERT) و",
      "سرویسش جدا از بک‌اند بالا می‌آید.",
      "Node یعنی یک زبان برای کلِ پروژه: یک محیطِ نصب و یک زنجیرهٔ استقرار.",
      "این تصمیم به زبانِ اصلیِ پروژه گره نخورده — می‌شود بک‌اند Node باشد",
      "و این یکی پایتون.",
    ].join(" "),
  },
  {
    id: "backgroundJobs",
    label: "پردازشِ پس‌زمینه",
    question: "کارهای طولانی چطور از درخواستِ کاربر جدا شوند؟",
    requiresCategory: "packageManager",
    description: [
      "کارهایی که طول می‌کشند (ارسالِ ایمیل، پردازشِ فایل، ساختِ گزارش)",
      "نباید کاربر را منتظر بگذارند. راهش این است که به یک صف سپرده شوند",
      "و کارگری جدا آنها را انجام دهد.",
      "BullMQ در دنیای Node است و با بک‌اندت هم‌زبان می‌شود.",
      "Celery استانداردِ دنیای پایتون است و کنارِ سرویسِ AI می‌نشیند.",
      "هر دو به یک بروکر (Redis) نیاز دارند که همین‌جا هم نصب می‌شود.",
    ].join(" "),
  },
  {
    id: "database",
    label: "دیتابیس",
    question: "داده کجا ذخیره شود؟",
    description: [
      "داده‌های برنامه کجا نگه داشته شوند.",
      "PostgreSQL و MySQL و MariaDB رابطه‌ای‌اند: داده در جدول‌های با ستونِ مشخص",
      "می‌نشیند و ارتباط‌ها محکم‌اند. برای اکثرِ پروژه‌ها انتخابِ درست.",
      "MongoDB شکلِ ثابت نمی‌خواهد و برای دادهٔ تودرتو و متغیر راحت‌تر است.",
      "SQLite هیچ سروری لازم ندارد — کلِ دیتابیس یک فایل است. برای پروژهٔ کوچک",
      "یا تستِ محلی سریع‌ترین راه، ولی برای چند کاربرِ همزمان ساخته نشده.",
    ].join(" "),
  },
  {
    id: "search",
    label: "جستجو",
    question: "جستجوی متنی چطور انجام شود؟",
    description: [
      "اگر کاربر باید بینِ حجمِ زیادی متن جستجو کند، دیتابیسِ معمولی کند و ضعیف",
      "می‌شود. موتورِ جستجو دقیقاً برای همین کار ساخته شده.",
      "Meilisearch راه‌اندازیِ خیلی ساده‌ای دارد و برای فارسی خوب کار می‌کند.",
      "Elasticsearch قوی‌تر و مقیاس‌پذیرتر است ولی حافظهٔ زیادی می‌خورد و",
      "نگه‌داری‌اش کارِ بیشتری دارد.",
    ].join(" "),
  },
  {
    id: "storage",
    label: "ذخیره‌سازیِ فایل",
    question: "فایل‌ها کجا نگه داشته شوند؟",
    description: [
      "فایل‌هایی که کاربر آپلود می‌کند (عکس، PDF، ویدیو) نباید در دیتابیس یا",
      "کنارِ کد بمانند. جای درستشان یک انبارِ فایل است.",
      "MinIO روی سرورِ خودت اجرا می‌شود و با S3 سازگار است، پس بعداً می‌شود",
      "بی تغییرِ کد به ابر منتقل شد.",
      "S3 ابری از همان اول مقیاس‌پذیر است ولی هزینه و اینترنت می‌خواهد.",
    ].join(" "),
  },
  {
    id: "apiStyle",
    label: "سبکِ API",
    question: "برنامه و سرور با چه قراردادی حرف بزنند؟",
    requiresCategory: "packageManager",
    description: [
      "قراردادی که برنامهٔ کاربر و سرور با آن حرف می‌زنند.",
      "REST + OpenAPI رایج‌ترین است: هر زبانی می‌فهمدش و سندش رسمی است.",
      "tRPC نوعِ داده را بی هیچ تولیدِ کدی از سرور به کلاینت می‌رساند، پس",
      "خطای ناسازگاری را همان موقعِ نوشتن می‌گیری — ولی فقط در TypeScript.",
      "GraphQL می‌گذارد کلاینت دقیقاً همان داده‌ای را بخواهد که لازم دارد،",
      "به‌جای چند رفت‌وبرگشت — ولی کش‌کردنش سخت‌تر است.",
    ].join(" "),
  },
  {
    id: "auth",
    label: "احرازِ هویت",
    question: "کاربر چطور وارد شود؟",
    requiresCategory: "packageManager",
    description: [
      "کاربر چطور وارد حسابش می‌شود و چطور می‌فهمیم کیست.",
      "Clerk یک سرویسِ ابری است: صفحهٔ ورود و ثبت‌نام و مدیریتِ کاربر آماده",
      "است و در چند دقیقه راه می‌افتد — ولی پولی است و دادهٔ کاربرانت دستِ",
      "شرکتِ دیگری می‌ماند.",
      "Auth.js متن‌باز است و روی سرورِ خودت اجرا می‌شود: دادهٔ کاربر پیشِ",
      "خودت می‌ماند و هزینهٔ ماهانه ندارد، ولی صفحه‌ها را خودت باید بسازی.",
      "توجه: این ابزار فقط نصب و راه‌اندازیِ اولیه را انجام می‌دهد؛ ورودِ",
      "واقعی به کلید و حسابِ خودت نیاز دارد.",
    ].join(" "),
  },
  {
    id: "observability",
    label: "خطایابی و مانیتورینگ",
    question: "وقتی چیزی خراب شد، از کجا می‌فهمی؟",
    description: [
      "وقتی برنامه در دستِ کاربرِ واقعی خراب می‌شود، از کجا می‌فهمی؟",
      "این دسته دو چیز را با هم می‌آورد: لاگِ ساخت‌یافته (تا بشود دنبالش",
      "گشت) و گزارشِ خطا (تا خرابی‌ها گروه‌بندی و اطلاع‌رسانی شوند).",
      "Sentry + pino در چند دقیقه راه می‌افتد ولی خطاها به سرویسِ ابری",
      "می‌روند و در حجمِ بالا پولی می‌شود.",
      "پشتهٔ خودمیزبان همه‌چیز را روی سرورِ خودت نگه می‌دارد و هزینهٔ",
      "ماهانه ندارد، ولی سه سرویسِ اضافه است که خودت باید نگه‌داری کنی.",
    ].join(" "),
  },
  {
    id: "e2e",
    label: "تستِ سرتاسری (e2e)",
    question: "رفتارِ واقعیِ برنامه چطور خودکار آزمایش شود؟",
    requiresCategory: "packageManager",
    description: [
      "تستِ سرتاسری یعنی مرورگرِ واقعی باز شود، مثلِ کاربر کلیک کند، و",
      "بررسی شود که برنامه واقعاً کار می‌کند — نه فقط تکه‌های کد جدا جدا.",
      "این تنها نوعِ تستی است که می‌گوید «کاربر واقعاً می‌تواند کارش را بکند».",
      "Playwright چند مرورگر را پشتیبانی می‌کند و پایدارتر است.",
      "Cypress رابطِ کاربریِ بهتری برای دیدنِ مرحله‌به‌مرحلهٔ تست دارد.",
    ].join(" "),
  },
];

/**
 * تکنولوژی‌ها.
 *
 * دامنهٔ دورِ اول عمداً محدود است: در هر دسته دو گزینه، تا ماشین واقعاً
 * امتحان شود (انتخاب، تعویض، تشخیصِ ناسازگاری). با یک گزینه هیچ ثابت نمی‌شد.
 * رسیدن به سه-چهار گزینه، بعدش فقط «یک ردیف اضافه کن» است.
 */
/**
 * چرا آدرس‌های سرویس 127.0.0.1 است و نه localhost:
 *
 * Node از نگارشِ ۱۸ به بعد اول IPv6 را امتحان می‌کند، و روی ویندوز نگاشتِ
 * IPv6ِ Docker همیشه جواب نمی‌دهد. نتیجه در ساختِ یک اپِ واقعی دیده شد:
 * `postgresql://...@localhost:5433/app` تایم‌اوت می‌شد در حالی که همان آدرس با
 * 127.0.0.1 بی‌درنگ وصل می‌شد — یعنی آدرسی که خودِ ابزار داده بود کار نمی‌کرد.
 *
 * آدرس‌هایی که **مرورگر** مصرفشان می‌کند (مثلِ VITE_API_URL) عمداً localhost
 * مانده‌اند: مرورگر هر دو خانواده را امتحان می‌کند و localhost برای آدرسی که
 * کاربر می‌بیند خواناتر است.
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
        // Turborepo بی این فیلد اصلاً بالا نمی‌آید: «Could not resolve workspace.
        // Missing packageManager field». نسخه از خودِ pnpmِ نصب‌شده خوانده
        // می‌شود، نه یک عددِ ثابت که فردا کهنه شود.
        { kind: "cli", command: 'pnpm pkg set packageManager="pnpm@$(pnpm --version)"' },
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
    // همان منطقِ Celery: کارگرِ بی‌بروکر کار نمی‌کند.
    detect: {
      kind: "all",
      of: [
        { kind: "npm", role: "worker", name: "bullmq" },
        { kind: "dockerService", service: "redis" },
      ],
    },
    apply: {
      verified: true,
      steps: [
        // هیچ چیزی apps/worker را نمی‌ساخت، پس خودش می‌سازدش.
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "apps/worker/package.json", content: WORKER_APP.pkg },
        { kind: "writeFile", path: "apps/worker/src/main.js", content: WORKER_APP.code },
        { kind: "cli", command: "pnpm --filter worker add bullmq ioredis" },
        { kind: "env", vars: { REDIS_URL: "redis://127.0.0.1:${REDIS_PORT}" } },
        { kind: "composeService", service: "redis", image: "redis:7-alpine", ports: [{ container: 6379, host: 6379, env: "REDIS_PORT" }], volume: "/data" },
      ],
    },
    meta: {
      pros: ["هم‌زبانِ بک‌اند است، یکپارچگیِ ساده", "تلاشِ مجددِ خودکار", "پایدار"],
      cons: ["به Redis نیاز دارد", "فقط در دنیای Node"],
    },
  },
  {
    id: "celery",
    category: "backgroundJobs",
    label: "Celery",
    // مثلِ FastAPI: به تصمیمِ زبانِ پروژه کار ندارد، محیطِ خودش را می‌سازد.

    // مدرک هر دو تکه را می‌خواهد: خودِ celery و بروکرش. کارگری که بروکر
    // نداشته باشد اجرا نمی‌شود، پس «نصب است» با دیدنِ تنها یکی‌شان دروغ است.
    // در اجرای واقعی دیده شد: نصبِ نیمه‌تمام (پکیج بله، Redis نه) را «نصب
    // است» گزارش کرد.
    detect: {
      kind: "all",
      of: [
        { kind: "pythonPackage", role: "worker-py", name: "celery" },
        { kind: "dockerService", service: "redis" },
      ],
    },
    apply: {
      verified: true,
      steps: [
        { kind: "mkdir", path: "apps/worker-py" },
        { kind: "writeFile", path: "apps/worker-py/requirements.txt", content: CELERY_REQUIREMENTS },
        { kind: "writeFile", path: "apps/worker-py/tasks.py", content: CELERY_TASKS },
        { kind: "cli", command: "python -m venv apps/worker-py/.venv" },
        { kind: "cli", command: "apps/worker-py/.venv/Scripts/python -m pip install -r apps/worker-py/requirements.txt" },
        { kind: "env", vars: { CELERY_BROKER_URL: "redis://127.0.0.1:${REDIS_PORT}/0" } },
        // مثلِ BullMQ، بروکرش را هم خودش می‌آورد — وگرنه «نصب شد» یعنی چیزی
        // که اجرا نمی‌شود.
        { kind: "composeService", service: "redis", image: "redis:7-alpine", ports: [{ container: 6379, host: 6379, env: "REDIS_PORT" }], volume: "/data" },
      ],
    },
    meta: {
      pros: ["استانداردِ دنیای پایتون برای کارِ پس‌زمینه", "زمان‌بندی و تلاشِ مجدد و مسیریابیِ صف در خودش دارد", "کنارِ سرویسِ AI هم‌زبان است"],
      cons: ["روی ویندوز باید با pool=solo اجرا شود", "به بروکر (Redis) نیاز دارد"],
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
        { kind: "env", vars: { DATABASE_URL: "postgresql://app:change-me@127.0.0.1:${POSTGRES_PORT}/app" } },
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
        { kind: "env", vars: { DATABASE_URL: "mysql://app:change-me@127.0.0.1:${MYSQL_PORT}/app" } },
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
        { kind: "env", vars: { MONGO_URL: "mongodb://app:change-me@127.0.0.1:${MONGO_PORT}/app?authSource=admin" } },
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
        { kind: "env", vars: { DATABASE_URL: "mysql://app:change-me@127.0.0.1:${MARIADB_PORT}/app" } },
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

  // ------------------------------------------------------------- استایل
  {
    id: "tailwind",
    category: "styling",
    label: "Tailwind CSS",
    requires: ["pnpm"],
    // Tailwind با یک نام شناخته نمی‌شود.
    //
    // بسته به باندلر، نامِ بسته‌اش فرق می‌کند: هستهٔ tailwindcss، یا افزونهٔ
    // postcss (که قالبِ رسمیِ Next.js خودش می‌آورد)، یا افزونهٔ Vite. نگارشِ
    // قبلی فقط هسته را می‌دید، و نتیجه‌اش یک **نیستِ دروغین** بود: پروژه‌ای
    // که با Next ساخته شده بود و globals.css اش `@import "tailwindcss"` داشت
    // و postcss.config هم به آن وصل بود، «Tailwind نصب نیست» گزارش می‌شد.
    // در پروژهٔ واقعیِ کاربر دیده شد.
    detect: {
      kind: "any",
      of: [
        { kind: "npm", role: "web", name: "tailwindcss" },
        { kind: "npm", role: "web", name: "@tailwindcss/postcss" },
        { kind: "npm", role: "web", name: "@tailwindcss/vite" },
      ],
    },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "mkdir", path: "apps/web/src" },
        // نامِ فایل عمداً tailwind.css است نه app.css: قالبِ Vite فایلِ App.css
        // دارد و ویندوز این دو را یکی می‌بیند، پس فایلِ ما هرگز نوشته نمی‌شد
        // و Tailwind بی‌آنکه کسی بفهمد وصل نمی‌شد. در اجرای واقعی دیده شد.
        { kind: "writeFile", path: "apps/web/src/tailwind.css", content: TAILWIND_CSS },
        // @tailwindcss/cli عمداً هست: با آن، درستیِ نصب مستقلِ از باندلر
        // قابلِ سنجش است. وصل‌کردنِ Tailwind به باندلر بستگی به فریم‌ورکِ
        // انتخابیِ تو دارد و یک خط است — در سندِ تصمیم نوشته می‌شود.
        { kind: "cli", command: "pnpm --filter web add -D tailwindcss @tailwindcss/cli" },
      ],
    },
    meta: {
      pros: ["استایل کنارِ خودِ المان می‌ماند، دنبالِ فایلِ CSS نمی‌گردی", "خروجی فقط شاملِ کلاس‌های استفاده‌شده است", "طراحیِ یکدست بی نظمِ دستی"],
      cons: ["کلاس‌ها HTML را شلوغ می‌کنند", "برای تیمی که CSS بلد است، یک زبانِ نو برای یادگیری"],
    },
  },
  {
    id: "bootstrap",
    category: "styling",
    label: "Bootstrap",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "web", name: "bootstrap" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "mkdir", path: "apps/web/src" },
        // نامِ فایل عمداً bootstrap.css است: قالب‌های Vite فایلِ App.css دارند و
        // ویندوز بزرگ و کوچکِ حروف را یکی می‌بیند (همان تلهٔ Tailwind).
        { kind: "writeFile", path: "apps/web/src/bootstrap.css", content: BOOTSTRAP_CSS },
        { kind: "cli", command: "pnpm --filter web add bootstrap" },
      ],
    },
    meta: {
      pros: ["اجزای آماده (دکمه، فرم، مودال) بی نوشتنِ CSS", "برای کسی که CSS بلد نیست سریع‌ترین راه", "پشتیبانیِ راست‌به‌چپ در خودش دارد"],
      cons: ["سایت‌ها شبیهِ هم می‌شوند مگر سفارشی‌سازی کنی", "کلِ فایل می‌آید حتی اگر کمی‌اش را استفاده کنی", "برای طراحیِ خاص، جنگیدن با پیش‌فرض‌هایش سخت است"],
    },
  },

  // ------------------------------------------ سرویسِ AI / پردازشِ فارسی
  {
    id: "fastapi",
    category: "aiService",
    label: "Python + FastAPI",
    // عمداً requires ندارد: دستهٔ «زبان» تک‌انتخابی است و اگر اینجا python را
    // پیش‌نیاز کنیم، پروژه‌ای که بک‌اندش Node است هرگز نمی‌تواند سرویسِ AIِ
    // پایتونی داشته باشد — یعنی دقیقاً همان چیزی که این دسته برایش هست. این
    // سرویس محیطِ مجازیِ خودش را می‌سازد و به تصمیمِ زبانِ پروژه کار ندارد.
    // (پایتون باید روی سیستم نصب باشد؛ اگر نباشد، خطای واقعی در ترمینال دیده
    // می‌شود — همان قاعدهٔ «هیچ چیزی پنهان اجرا نشود».)
    // مدرک، نصبِ واقعی در venv است — نه نامِ fastapi در requirements.txt.
    detect: { kind: "pythonPackage", role: "ai-service", name: "fastapi" },
    apply: {
      verified: true,
      steps: [
        { kind: "mkdir", path: "apps/ai-service" },
        { kind: "writeFile", path: "apps/ai-service/requirements.txt", content: FASTAPI_REQUIREMENTS },
        { kind: "writeFile", path: "apps/ai-service/main.py", content: FASTAPI_MAIN },
        { kind: "cli", command: "python -m venv apps/ai-service/.venv" },
        { kind: "cli", command: "apps/ai-service/.venv/Scripts/python -m pip install -r apps/ai-service/requirements.txt" },
        { kind: "env", vars: { AI_SERVICE_PORT: "8000" } },
      ],
    },
    meta: {
      pros: ["کتابخانه‌های پردازشِ زبانِ فارسی (Hazm، ParsBERT) اینجا زندگی می‌کنند", "سندِ خودکارِ API", "سریع و async"],
      cons: ["یک زبانِ دوم در پروژه یعنی دو محیطِ نصب", "استقرارش از سرویسِ Node جداست"],
    },
  },
  {
    id: "node-ai-service",
    category: "aiService",
    label: "Node.js (همان زبانِ بک‌اند)",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "ai-service", name: "openai" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "apps/ai-service/package.json", content: NODE_AI_APP.pkg },
        { kind: "writeFile", path: "apps/ai-service/src/main.js", content: NODE_AI_APP.code },
        { kind: "cli", command: "pnpm --filter ai-service add openai" },
        { kind: "env", vars: { AI_SERVICE_PORT: "8000", OPENAI_API_KEY: "" } },
      ],
    },
    meta: {
      pros: ["یک زبان برای کلِ پروژه — یک محیطِ نصب و یک زنجیرهٔ استقرار", "اشتراکِ کد و نوع با بک‌اند"],
      cons: ["کتابخانه‌های پردازشِ زبانِ فارسی در پایتون خیلی قوی‌ترند", "برای کارِ سنگینِ عددی مناسب نیست"],
    },
  },
  // -------------------------------------------------------- احرازِ هویت
  //
  // مرزِ صداقت برای این دسته: چیزی که این ابزار می‌تواند ثابت کند، «پکیج نصب
  // شد و کدِ راه‌اندازی نوشته شد» است. «ورود واقعاً کار می‌کند» به حسابِ
  // کاربری و کلیدِ خودت نیاز دارد و اینجا ادعا نمی‌شود.
  {
    id: "clerk",
    category: "auth",
    label: "Clerk",
    requires: ["pnpm"],
    // بستهٔ عمومیِ React نصب می‌شود نه بستهٔ Next: این ابزار سه فرانتِ مختلف
    // دارد و @clerk/nextjs یکی از آنها را تحمیل می‌کرد. تشخیص هر دو را قبول
    // می‌کند، چون پروژه‌ای که با Next ساخته شده ممکن است بستهٔ Next را داشته باشد.
    detect: {
      kind: "any",
      of: [
        { kind: "npm", role: "web", name: "@clerk/clerk-react" },
        { kind: "npm", role: "web", name: "@clerk/nextjs" },
      ],
    },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "cli", command: "pnpm --filter web add @clerk/clerk-react" },
        { kind: "env", vars: { VITE_CLERK_PUBLISHABLE_KEY: "", CLERK_SECRET_KEY: "" } },
      ],
    },
    meta: {
      pros: ["سریع‌ترین راه: صفحهٔ ورود و ثبت‌نام آماده است", "ورود با گوگل و مانندش بی دردسر", "مدیریتِ کاربر داشبوردِ آماده دارد"],
      cons: ["سرویسِ ابریِ پولی — دادهٔ کاربر دستِ سرویسِ دیگری است", "برای Next.js ساخته شده؛ با فریم‌ورکِ دیگر کارِ بیشتری دارد", "بی کلیدِ حسابِ خودت کار نمی‌کند"],
    },
  },
  {
    id: "authjs",
    category: "auth",
    label: "Auth.js (NextAuth)",
    // next-auth بدونِ Next.js واقعاً کار نمی‌کند (به مسیرهای API و میان‌افزارِ
    // خودِ Next تکیه دارد). پس صریح پیش‌نیازش می‌شود، نه اینکه نصب شود و
    // بعد کاربر بفهمد بی‌فایده است.
    requires: ["nextjs"],
    detect: { kind: "npm", role: "web", name: "next-auth" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "cli", command: "pnpm --filter web add next-auth" },
        { kind: "env", vars: { AUTH_SECRET: "", AUTH_URL: "http://localhost:3000" } },
      ],
    },
    meta: {
      pros: ["متن‌باز و روی سرورِ خودت — دادهٔ کاربر پیشِ خودت می‌ماند", "ده‌ها ارائه‌دهندهٔ آماده", "هزینهٔ ماهانه ندارد"],
      cons: ["صفحه‌های ورود و مدیریتِ کاربر را خودت باید بسازی", "تنظیماتش از سرویسِ آماده پیچیده‌تر است"],
    },
  },

  // ------------------------------------------------ خطایابی و مانیتورینگ
  {
    id: "sentry-pino",
    category: "observability",
    label: "Sentry + pino",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "api", name: "pino" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "apps/api/package.json", content: BARE_API_APP.pkg, placeholder: true },
        { kind: "writeFile", path: "apps/api/src/logger.js", content: PINO_LOGGER },
        { kind: "writeFile", path: "apps/api/src/sentry.js", content: SENTRY_INIT },
        { kind: "cli", command: "pnpm --filter api add pino @sentry/node" },
        { kind: "env", vars: { LOG_LEVEL: "info", SENTRY_DSN: "" } },
      ],
    },
    meta: {
      pros: ["راه‌اندازیِ چنددقیقه‌ای", "خطاها با کدِ دقیق و کاربرِ مربوطه گروه‌بندی می‌شوند", "لاگِ ساخت‌یافتهٔ سریع با pino"],
      cons: ["گزارشِ خطا به سرویسِ ابریِ دیگری می‌رود", "بی DSN خاموش است — کلید را خودت باید بگیری", "در حجمِ بالا پولی می‌شود"],
    },
  },
  {
    id: "grafana-stack",
    category: "observability",
    label: "خودمیزبان (Grafana + Loki + Prometheus)",
    detect: { kind: "dockerService", service: "grafana" },
    apply: {
      verified: true,
      steps: [
        { kind: "mkdir", path: "deployment" },
        { kind: "writeFile", path: "deployment/prometheus.yml", content: PROMETHEUS_YML },
        {
          kind: "composeService", service: "prometheus", image: "prom/prometheus:v3.1.0",
          ports: [{ container: 9090, host: 9090, env: "PROMETHEUS_PORT" }],
          volume: "/prometheus",
        },
        {
          kind: "composeService", service: "loki", image: "grafana/loki:3.3.2",
          ports: [{ container: 3100, host: 3100, env: "LOKI_PORT" }],
          command: "-config.file=/etc/loki/local-config.yaml",
          volume: "/loki",
        },
        {
          kind: "composeService", service: "grafana", image: "grafana/grafana:11.5.1",
          ports: [{ container: 3000, host: 3000, env: "GRAFANA_PORT" }],
          environment: { GF_SECURITY_ADMIN_PASSWORD: "change-me", GF_USERS_ALLOW_SIGN_UP: '"false"' },
          volume: "/var/lib/grafana",
        },
        { kind: "env", vars: { GRAFANA_ADMIN_PASSWORD: "change-me" } },
      ],
    },
    meta: {
      pros: ["همه‌چیز روی سرورِ خودت — هیچ داده‌ای بیرون نمی‌رود", "هزینهٔ ماهانه ندارد", "نمودار و هشدار و لاگ در یک جا"],
      cons: ["سه سرویسِ اضافه که خودت باید نگه‌داری‌شان کنی", "حافظه و دیسکِ بیشتری می‌خواهد", "راه‌اندازیِ اولش وقت می‌برد"],
    },
  },

  // ------------------------------------------------- کیتِ رابطِ کاربری
  {
    id: "shadcn-ui",
    category: "uiKit",
    label: "shadcn/ui + Lucide",
    requires: ["pnpm"],
    // مدرک: کدِ کامپوننت‌ها داخلِ پروژه کپی می‌شود، پس نصبِ بسته تنها کافی
    // نیست. lucide-react همان بسته‌ای است که آیکون‌ها از آن می‌آیند.
    detect: { kind: "npm", role: "web", name: "lucide-react" },
    apply: {
      verified: true,
      steps: [
        { kind: "cli", command: "pnpm --filter web exec npx --yes shadcn@latest init -d -y" },
        { kind: "cli", command: "pnpm --filter web add lucide-react" },
      ],
    },
    meta: {
      pros: ["کدِ کامپوننت مالِ خودت می‌شود — هرجایش را خواستی عوض کن", "با Tailwind یکی است، نه یک لایهٔ اضافه", "فقط همان چیزی که لازم داری اضافه می‌شود"],
      cons: ["کد داخلِ پروژه‌ات می‌ماند، پس به‌روزرسانی‌اش با خودت است", "به Tailwind وابسته است"],
    },
  },

  // ------------------------------------------------- دادهٔ سمتِ کلاینت
  {
    id: "tanstack-query",
    category: "dataFetching",
    label: "TanStack Query",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "web", name: "@tanstack/react-query" },
    apply: {
      verified: true,
      steps: [{ kind: "cli", command: "pnpm --filter web add @tanstack/react-query" }],
    },
    meta: {
      pros: ["بارگذاری و خطا و تلاشِ دوباره را خودش مدیریت می‌کند", "کشِ هوشمند — دادهٔ کهنه را خودش تازه می‌کند", "ابزارِ عیب‌یابیِ خوب"],
      cons: ["برای یکی دو درخواستِ ساده زیادی است", "مفهومش (کش و کلید) اول کمی گیج‌کننده است"],
    },
  },
  {
    id: "swr",
    category: "dataFetching",
    label: "SWR",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "web", name: "swr" },
    apply: {
      verified: true,
      steps: [{ kind: "cli", command: "pnpm --filter web add swr" }],
    },
    meta: {
      pros: ["کوچک و ساده", "یادگیری‌اش چند دقیقه است", "از سازندگانِ Next.js"],
      cons: ["امکاناتش از TanStack Query کمتر است", "برای کارِ پیچیده‌تر کم می‌آورد"],
    },
  },

  // ---------------------------------------------------- استیتِ سراسری
  {
    id: "zustand",
    category: "stateManagement",
    label: "Zustand",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "web", name: "zustand" },
    apply: {
      verified: true,
      steps: [{ kind: "cli", command: "pnpm --filter web add zustand" }],
    },
    meta: {
      pros: ["خیلی کم‌حجم و ساده", "بی boilerplate — یک تابع و تمام", "با React Server Components هم کنار می‌آید"],
      cons: ["برای پروژهٔ خیلی بزرگ ساختارِ سخت‌گیرانه‌ای تحمیل نمی‌کند", "ابزارِ عیب‌یابی‌اش از Redux ضعیف‌تر است"],
    },
  },
  {
    id: "redux-toolkit",
    category: "stateManagement",
    label: "Redux Toolkit",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "web", name: "@reduxjs/toolkit" },
    apply: {
      verified: true,
      steps: [{ kind: "cli", command: "pnpm --filter web add @reduxjs/toolkit react-redux" }],
    },
    meta: {
      pros: ["ساختارِ مشخص و یکدست برای تیم", "ابزارِ عیب‌یابیِ عالی (تاریخچهٔ تغییرات)", "اکوسیستمِ بزرگ"],
      cons: ["کدِ بیشتری می‌خواهد", "برای پروژهٔ کوچک زیادی است"],
    },
  },

  // ------------------------------------------------------ تاریخِ شمسی
  {
    id: "persian-datepicker",
    category: "persianDate",
    label: "react-multi-date-picker (جلالی)",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "web", name: "react-multi-date-picker" },
    apply: {
      verified: true,
      steps: [{ kind: "cli", command: "pnpm --filter web add react-multi-date-picker" }],
    },
    meta: {
      pros: ["تقویمِ جلالی و راست‌به‌چپ آماده", "انتخابِ بازه و چند تاریخ", "قابلِ سفارشی‌سازی"],
      cons: ["برای فقط نمایشِ تاریخ، سنگین است", "مستنداتش انگلیسی است"],
    },
  },

  // -------------------------------------------------- پکیج‌های مشترک
  {
    id: "workspace-packages",
    category: "sharedPackages",
    label: "packages/ — ui، تایپ‌ها، کلاینتِ API، تنظیمات",
    requires: ["pnpm"],
    detect: { kind: "file", path: "packages/shared-types/package.json" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        ...SHARED_PACKAGES.flatMap((pkg) => [
          { kind: "mkdir", path: `packages/${pkg.dir}/src` },
          { kind: "writeFile", path: `packages/${pkg.dir}/package.json`, content: sharedPkg(pkg.dir, pkg.desc) },
          { kind: "writeFile", path: `packages/${pkg.dir}/src/index.ts`, content: pkg.index },
        ]),
        { kind: "cli", command: "pnpm install" },
      ],
    },
    meta: {
      pros: ["کدِ مشترک یک‌جا می‌ماند و از هم عقب نمی‌افتد", "تایپِ مشترک یعنی خطای ناسازگاری همان موقعِ نوشتن معلوم می‌شود", "هر app با نامِ پکیج importش می‌کند، نه با مسیرِ نسبیِ طولانی"],
      cons: ["برای پروژهٔ تک‌اپی بی‌فایده است", "یک لایهٔ ساختاری بیشتر"],
    },
  },

  // ----------------------------------------------------------- سبکِ API
  {
    id: "rest-openapi",
    category: "apiStyle",
    label: "REST + OpenAPI",
    requires: ["pnpm"],
    // مدرک، نصبِ ابزارِ سنجشِ سند است نه خودِ فایل: فایلِ yaml را هر کسی
    // می‌تواند دست‌نویس کند، ولی ابزارِ اعتبارسنجی یعنی واقعاً کار شده.
    detect: { kind: "npm", role: "api", name: "@redocly/cli" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "apps/api/package.json", content: BARE_API_APP.pkg, placeholder: true },
        { kind: "writeFile", path: "apps/api/openapi.yaml", content: OPENAPI_YAML },
        { kind: "writeFile", path: "apps/api/redocly.yaml", content: REDOCLY_YAML },
        { kind: "cli", command: "pnpm --filter api add -D @redocly/cli" },
      ],
    },
    meta: {
      pros: ["همه‌جا فهمیده می‌شود — هر زبانی کلاینتش را می‌سازد", "سند از خودِ قرارداد می‌آید", "کش و پراکسی و ابزارهای HTTP همه با آن راحت‌اند"],
      cons: ["برای دادهٔ تودرتو چند رفت‌وبرگشت لازم می‌شود", "هماهنگ نگه‌داشتنِ سند با کد دستی است"],
    },
  },
  {
    id: "trpc",
    category: "apiStyle",
    label: "tRPC",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "api", name: "@trpc/server" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "apps/api/package.json", content: BARE_API_APP.pkg, placeholder: true },
        { kind: "writeFile", path: "apps/api/src/trpc.js", content: TRPC_ROUTER },
        { kind: "cli", command: "pnpm --filter api add @trpc/server zod" },
      ],
    },
    meta: {
      pros: ["نوعِ داده بی هیچ تولیدِ کدی از سرور به کلاینت می‌رسد", "کم‌ترین کدِ اضافه", "خطای ناسازگاری را همان موقعِ نوشتن می‌گیرد"],
      cons: ["فقط در دنیای TypeScript کار می‌کند", "کلاینتِ غیرِ TS باید REST جدا داشته باشد"],
    },
  },
  {
    id: "graphql",
    category: "apiStyle",
    label: "GraphQL",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "api", name: "graphql-yoga" },
    apply: {
      verified: true,
      steps: [
        { kind: "pnpmWorkspace", content: WORKSPACE_YAML },
        { kind: "writeFile", path: "apps/api/package.json", content: BARE_API_APP.pkg, placeholder: true },
        { kind: "writeFile", path: "apps/api/src/graphql.js", content: GRAPHQL_SERVER },
        { kind: "cli", command: "pnpm --filter api add graphql graphql-yoga" },
        { kind: "env", vars: { GRAPHQL_PORT: "4001" } },
      ],
    },
    meta: {
      pros: ["کلاینت دقیقاً همان چیزی را می‌گیرد که خواسته", "یک درخواست به‌جای چند رفت‌وبرگشت", "شمای قویِ خودتوصیف"],
      cons: ["کش‌کردن سخت‌تر از REST است", "پیچیدگیِ اضافه برای APIِ ساده"],
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
        { kind: "env", vars: { MEILI_URL: "http://127.0.0.1:${MEILI_PORT}", MEILI_MASTER_KEY: "change-me" } },
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
        { kind: "env", vars: { ELASTIC_URL: "http://127.0.0.1:${ELASTIC_PORT}" } },
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
        { kind: "env", vars: { MINIO_ENDPOINT: "http://127.0.0.1:${MINIO_PORT}", MINIO_BUCKET: "app" } },
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
  "rest-openapi": {
    steps: [
      { kind: "cli", command: "pnpm --filter api remove @redocly/cli" },
      { kind: "deleteFile", path: "apps/api/openapi.yaml" },
      { kind: "deleteFile", path: "apps/api/redocly.yaml" },
    ],
  },
  trpc: {
    steps: [
      { kind: "cli", command: "pnpm --filter api remove @trpc/server zod" },
      { kind: "deleteFile", path: "apps/api/src/trpc.js" },
    ],
  },
  graphql: {
    steps: [
      { kind: "cli", command: "pnpm --filter api remove graphql graphql-yoga" },
      { kind: "deleteFile", path: "apps/api/src/graphql.js" },
    ],
  },
  fastify: { steps: [{ kind: "cli", command: "pnpm --filter api remove fastify" }] },
  bullmq: { steps: [{ kind: "cli", command: "pnpm --filter worker remove bullmq ioredis" }] },
  celery: {
    steps: [
      { kind: "cli", command: "apps/worker-py/.venv/Scripts/python -m pip uninstall -y celery" },
      { kind: "composeDown", service: "redis" },
    ],
    manual: "پوشهٔ apps/worker-py و محیطِ مجازی‌اش می‌ماند — کدِ کارگرت آنجاست. خودت تصمیم بگیر.",
  },
  "shadcn-ui": {
    steps: [{ kind: "cli", command: "pnpm --filter web remove lucide-react" }],
    manual: "کامپوننت‌هایی که shadcn داخلِ پروژه کپی کرده (components/ui و lib/utils) کدِ خودت‌اند و دست‌نخورده می‌مانند.",
  },
  "tanstack-query": { steps: [{ kind: "cli", command: "pnpm --filter web remove @tanstack/react-query" }] },
  swr: { steps: [{ kind: "cli", command: "pnpm --filter web remove swr" }] },
  zustand: { steps: [{ kind: "cli", command: "pnpm --filter web remove zustand" }] },
  "redux-toolkit": { steps: [{ kind: "cli", command: "pnpm --filter web remove @reduxjs/toolkit react-redux" }] },
  "persian-datepicker": { steps: [{ kind: "cli", command: "pnpm --filter web remove react-multi-date-picker" }] },
  "workspace-packages": {
    manual: "پوشهٔ packages/ کدِ مشترکِ توست — خودت تصمیم بگیر و خودت پاکش کن.",
  },

  tailwind: {
    steps: [{ kind: "cli", command: "pnpm --filter web remove tailwindcss @tailwindcss/cli" }],
    // فقط چیزی که خودمان نصب کرده‌ایم برداشته می‌شود. اگر قالبِ Next.js
    // خودش @tailwindcss/postcss آورده باشد، دست نمی‌خورد — وگرنه بیلدِ
    // پروژه‌ات می‌شکند. اگر واقعاً می‌خواهی Tailwind کاملاً برود، باید
    // postcss.config و globals.css را هم خودت دست بزنی.
    manual:
      "اگر فرانتِ پروژه‌ات Next.js است، Tailwind از قالبِ خودِ Next هم می‌آید (@tailwindcss/postcss). آن را دست نزدیم چون مالِ ما نبود؛ برای حذفِ کامل باید postcss.config و globals.css را هم خودت عوض کنی.",
  },
  bootstrap: { steps: [{ kind: "cli", command: "pnpm --filter web remove bootstrap" }] },
  // پکیج برداشته می‌شود (همان چیزی که مدرکِ نصب بود)، ولی کدِ خودت می‌ماند.
  // اگر فقط manual می‌گذاشتیم، مدرک سرِ جایش می‌ماند و این دسته برای همیشه
  // قفل می‌شد — یعنی نقضِ قاعدهٔ «هر کاری دو طرفه». در اجرای واقعی دیده شد.
  fastapi: {
    steps: [{ kind: "cli", command: "apps/ai-service/.venv/Scripts/python -m pip uninstall -y fastapi uvicorn" }],
    manual: "پوشهٔ apps/ai-service و main.py و venvاش دست‌نخورده ماندند — کدت آنجاست.",
  },
  "node-ai-service": { steps: [{ kind: "cli", command: "pnpm --filter ai-service remove openai" }] },

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

  clerk: { steps: [{ kind: "cli", command: "pnpm --filter web remove @clerk/clerk-react" }] },
  authjs: { steps: [{ kind: "cli", command: "pnpm --filter web remove next-auth" }] },

  "sentry-pino": {
    steps: [
      { kind: "cli", command: "pnpm --filter api remove pino @sentry/node" },
      { kind: "deleteFile", path: "apps/api/src/logger.js" },
      { kind: "deleteFile", path: "apps/api/src/sentry.js" },
    ],
  },
  "grafana-stack": {
    steps: [
      { kind: "composeDown", service: "grafana" },
      { kind: "composeDown", service: "loki" },
      { kind: "composeDown", service: "prometheus" },
      { kind: "deleteFile", path: "deployment/prometheus.yml" },
    ],
  },

  playwright: { steps: [{ kind: "cli", command: "pnpm remove -D @playwright/test" }] },
  cypress: { steps: [{ kind: "cli", command: "pnpm remove -D cypress" }] },
};

/**
 * توضیحِ خواندنیِ اینکه نصبِ یک تکنولوژی دقیقاً چه می‌کند.
 *
 * از خودِ گام‌های رجیستری ساخته می‌شود، نه از متنی که کسی دستی نوشته باشد —
 * پس هیچ‌وقت با واقعیت ناهمگام نمی‌شود. همان قاعدهٔ همیشگی: توضیح باید از
 * همان جایی بیاید که کار از آنجا انجام می‌شود.
 */
export function describeApply(techId) {
  const tech = technologyById(techId);
  if (!tech) return [];
  const out = [];
  for (const step of tech.apply?.steps || []) {
    if (step.kind === "cli") out.push(`فرمان: ${step.command}`);
    else if (step.kind === "pnpmAdd") out.push(`نصبِ پکیج: ${step.packages.join("، ")}`);
    else if (step.kind === "pnpmAddDev") out.push(`نصبِ پکیجِ توسعه: ${step.packages.join("، ")}`);
    else if (step.kind === "writeFile") out.push(`ساختِ فایل: ${step.path}`);
    else if (step.kind === "mkdir") out.push(`ساختِ پوشه: ${step.path}`);
    else if (step.kind === "pnpmWorkspace") out.push("اطمینان از اینکه pnpm-workspace.yaml بخشِ packages دارد");
    else if (step.kind === "env") out.push(`متغیرهای env: ${Object.keys(step.vars).join("، ")}`);
    else if (step.kind === "composeService") {
      const ports = (step.ports || []).map((x) => x.container).join("، ");
      out.push(`سرویسِ Docker: ${step.service} (ایمیجِ ${step.image}${ports ? `، پورتِ ${ports}` : ""})`);
    }
  }
  return out;
}

/** برگشت چطور انجام می‌شود — و اگر دستی است، چرا. */
export function describeRemoval(techId) {
  const removal = REMOVALS[techId];
  if (!removal) return { kind: "unknown", lines: [], note: "" };
  const lines = [];
  for (const step of removal.steps || []) {
    if (step.kind === "cli") lines.push(`فرمان: ${step.command}`);
    else if (step.kind === "deleteFile") lines.push(`حذفِ فایل: ${step.path}`);
    else if (step.kind === "composeDown") lines.push(`خواباندن و برداشتنِ کانتینرِ ${step.service} (دادهٔ ذخیره‌شده می‌ماند)`);
  }
  return {
    kind: lines.length ? (removal.manual ? "partial" : "auto") : "manual",
    lines,
    note: removal.manual || removal.note || "",
  };
}

export const removalFor = (techId) => REMOVALS[techId] || null;

/** تکنولوژی‌هایی که برداشتنشان دستی است — UI باید صریح بگوید. */
export const manualRemovalTechnologies = () =>
  TECHNOLOGIES.filter((t) => REMOVALS[t.id]?.manual).map((t) => t.id);

// ---------------------------------------------------------------- اعتبارسنجی

const DETECT_KINDS = new Set([
  "file", "npm", "npmRoot", "npmInstalled", "dockerService", "pythonVenv", "pythonPackage", "envVar",
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
  } else if (spec.kind === "pythonPackage" && !spec.name) {
    problems.push(`${techId}: مدرکِ pythonPackage بدونِ name`);
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
