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
 * تا این لحظه دو مورد این آزمون را داده‌اند: `postgres` و `meilisearch`. هر دو
 * از یک پوشهٔ خالی تا سرویسِ بالا و پاسخ‌دهنده از میزبان اجرا شدند. همین
 * آزمایش سه باگِ واقعی بیرون کشید که هیچ‌کدام را تستِ واحد نگرفته بود:
 *
 *   ۱. فایلِ composeِ تولیدی، volume را ارجاع می‌داد ولی تعریف نمی‌کرد →
 *      «invalid compose project».
 *   ۲. متغیرهای لازمِ خودِ ایمیج (مثلِ POSTGRES_PASSWORD) و مسیرِ دادهٔ هر
 *      ایمیج و `command`ِ MinIO جا افتاده بود.
 *   ۳. با `-f <path>`، خودِ Docker فایلِ `.env` را از پوشهٔ فایلِ compose
 *      می‌خواند نه ریشهٔ پروژه → پورت‌ها اعمال نمی‌شدند.
 *
 * بقیه `verified: false` می‌مانند و UI صریح می‌گوید «نصبش آزمایش‌نشده». این
 * علامت باید با اجرای واقعی به دست بیاید، نه با حدس.
 */

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
    detect: { kind: "all", of: [{ kind: "file", path: "package.json" }, { kind: "npmInstalled", role: null }] },
    apply: { verified: false, steps: [{ kind: "cli", command: "npm init -y" }] },
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
    apply: { verified: false, steps: [{ kind: "cli", command: "python -m venv .venv" }] },
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
    apply: { verified: false, steps: [{ kind: "cli", command: "pnpm install" }] },
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
    apply: { verified: false, steps: [{ kind: "cli", command: "npm install" }] },
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
      verified: false,
      steps: [
        { kind: "cli", command: "pnpm add -Dw turbo" },
        { kind: "file", path: "turbo.json", role: "کانفیگِ taskها و کش" },
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
    apply: { verified: false, steps: [{ kind: "cli", command: "pnpm add -Dw nx" }] },
    meta: {
      pros: ["امکاناتِ بیشتر: گرافِ وابستگی، تولیدکنندهٔ کد", "برای مخزنِ خیلی بزرگ قوی‌تر"],
      cons: ["پیچیده‌تر و سنگین‌تر", "یادگیریِ بیشتری می‌خواهد"],
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
      verified: false,
      steps: [
        { kind: "cli", command: "pnpm create react-router@latest apps/web --yes" },
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
      verified: false,
      steps: [
        { kind: "cli", command: "pnpm create next-app@latest apps/web --yes" },
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
    id: "nestjs",
    category: "backendFramework",
    label: "NestJS",
    requires: ["pnpm"],
    detect: { kind: "npm", role: "api", name: "@nestjs/core" },
    apply: {
      verified: false,
      steps: [
        { kind: "cli", command: "pnpm dlx @nestjs/cli new apps/api --skip-git --package-manager pnpm" },
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
      verified: false,
      steps: [
        { kind: "cli", command: "pnpm --filter api add express" },
        { kind: "env", vars: { API_PORT: "4000" } },
      ],
    },
    meta: {
      pros: ["سبک و ساده", "آزادیِ کامل در طراحی", "رایج‌ترین"],
      cons: ["ساختار را خودت باید بسازی", "در پروژهٔ بزرگ بی‌نظم می‌شود"],
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
      verified: false,
      steps: [
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
      verified: false,
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
      verified: false,
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
      verified: false,
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
      verified: false,
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
      verified: false,
      steps: [
        { kind: "cli", command: "pnpm add -Dw @playwright/test" },
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
    apply: { verified: false, steps: [{ kind: "cli", command: "pnpm add -Dw cypress" }] },
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

  turborepo: { steps: [{ kind: "cli", command: "pnpm remove -Dw turbo" }, { kind: "deleteFile", path: "turbo.json" }] },
  nx: { steps: [{ kind: "cli", command: "pnpm remove -Dw nx" }, { kind: "deleteFile", path: "nx.json" }] },

  "react-router-v7": {
    manual: "این یک پوشهٔ کاملِ app ساخته (apps/web). حذفش یعنی پاک‌کردنِ کدی که ممکن است رویش کار کرده باشی — خودت تصمیم بگیر و خودت پاکش کن.",
  },
  nextjs: {
    manual: "این یک پوشهٔ کاملِ app ساخته (apps/web). حذفش یعنی پاک‌کردنِ کدی که ممکن است رویش کار کرده باشی — خودت تصمیم بگیر و خودت پاکش کن.",
  },
  nestjs: {
    manual: "این یک پوشهٔ کاملِ app ساخته (apps/api). حذفش یعنی پاک‌کردنِ کدت — خودت تصمیم بگیر و خودت پاکش کن.",
  },
  express: { steps: [{ kind: "cli", command: "pnpm --filter api remove express" }] },
  bullmq: { steps: [{ kind: "cli", command: "pnpm --filter worker remove bullmq ioredis" }] },

  // سرویس‌های Docker: اول خوابانده می‌شوند، بعد از فایلِ compose حذف می‌شوند
  // (چون آن فایل از رویِ تصمیم‌ها از نو ساخته می‌شود).
  postgres: { steps: [{ kind: "composeDown", service: "postgres" }] },
  mysql: { steps: [{ kind: "composeDown", service: "mysql" }] },
  meilisearch: { steps: [{ kind: "composeDown", service: "meilisearch" }] },
  elasticsearch: { steps: [{ kind: "composeDown", service: "elasticsearch" }] },
  minio: { steps: [{ kind: "composeDown", service: "minio" }] },
  s3: { steps: [] }, // فقط متغیرِ env بود، و آن خودش برداشته می‌شود

  playwright: { steps: [{ kind: "cli", command: "pnpm remove -Dw @playwright/test" }] },
  cypress: { steps: [{ kind: "cli", command: "pnpm remove -Dw cypress" }] },
};

export const removalFor = (techId) => REMOVALS[techId] || null;

/** تکنولوژی‌هایی که برداشتنشان دستی است — UI باید صریح بگوید. */
export const manualRemovalTechnologies = () =>
  TECHNOLOGIES.filter((t) => REMOVALS[t.id]?.manual).map((t) => t.id);

// ---------------------------------------------------------------- اعتبارسنجی

const DETECT_KINDS = new Set([
  "file", "npm", "npmRoot", "npmInstalled", "dockerService", "pythonVenv", "envVar", "all", "any",
]);
const APPLY_KINDS = new Set(["cli", "env", "file", "composeService"]);
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
