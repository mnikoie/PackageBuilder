/**
 * تست‌های رجیستری و حل‌کننده‌اش.
 *
 * محورِ اصلی (همان چیزی که نقشه برای قدمِ ۶ خواسته): دو تکنولوژیِ رقیب در یک
 * دسته باید **ناسازگاری** تشخیص داده شود، نه اینکه یکی بی‌سر‌و‌صدا برنده شود.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  CATEGORIES, TECHNOLOGIES, validateRegistry,
  categoryById, technologyById, technologiesInCategory, unverifiedTechnologies,
} from "../src/core/registry.mjs";
import { resolveRegistry, evaluateDetect, resolveRole } from "../src/core/resolve.mjs";
import { PRESENT, ABSENT, UNKNOWN, detectDockerServices, probeProject } from "../src/core/detect.mjs";

let sandbox;
before(() => { sandbox = mkdtempSync(join(tmpdir(), "pb-reg-")); });
after(() => { rmSync(sandbox, { recursive: true, force: true }); });

function fixture(name, files = {}) {
  const dir = join(sandbox, name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const dest = join(dir, rel);
    mkdirSync(join(dest, ".."), { recursive: true });
    writeFileSync(dest, content);
  }
  return dir;
}

const KNOWN_SERVICES = ["postgres", "mysql", "meilisearch", "elasticsearch", "minio", "redis"];

/**
 * تصویرِ Docker — **دقیقاً** به شکلی که detectDockerServices واقعی می‌سازد.
 *
 * نسخهٔ اولِ این تقلبی فیلدهایی داشت که کدِ واقعی تولید نمی‌کرد
 * (composeFileExists، checked). نتیجه: تست‌ها سبز بودند ولی ابزار روی دادهٔ
 * واقعی اشتباه جواب می‌داد — سرویسِ نبوده را «نامعلوم» می‌گفت.
 * پایینِ همین فایل یک تستِ «قرارداد» هست که جلوی تکرارِ این واگرایی را می‌گیرد.
 */
const dockerProbe = (running = [], { checked = true, hasComposeFile = true } = {}) => {
  if (!hasComposeFile) {
    return {
      docker: {
        cli: { state: ABSENT, evidence: "فایلِ compose پیدا نشد، پس Docker پرسیده نشد" },
        file: null,
        projectName: null,
        services: {},
        declaredServices: [],
      },
    };
  }
  const services = Object.fromEntries(
    KNOWN_SERVICES.map((s) => [
      s,
      !checked
        ? { state: UNKNOWN, evidence: "Docker در دسترس نیست — وضعیتِ واقعی خوانده نشد" }
        : running.includes(s)
          ? { state: PRESENT, evidence: "در «docker compose ps» بالا گزارش شد" }
          : { state: ABSENT, evidence: "در فایلِ compose تعریف شده ولی بالا نیست" },
    ]),
  );
  return {
    docker: {
      cli: checked
        ? { state: PRESENT, evidence: "Docker در دسترس است" }
        : { state: UNKNOWN, evidence: "Docker جواب نداد" },
      file: "deployment/docker-compose.yml",
      projectName: "testproj",
      services,
      declaredServices: KNOWN_SERVICES,
    },
  };
};

// ---------------------------------------------------------------- خودِ داده

describe("سلامتِ رجیستری", () => {
  test("هیچ ایرادِ ساختاری ندارد", () => {
    assert.deepEqual(validateRegistry(), []);
  });

  test("هر دسته حداقل یک گزینه دارد", () => {
    for (const cat of CATEGORIES) {
      assert.ok(technologiesInCategory(cat.id).length > 0, `دستهٔ ${cat.id} بی‌گزینه است`);
    }
  });

  test("دسته‌های اصلی دو گزینهٔ رقیب دارند — وگرنه عمومی‌بودن ثابت نمی‌شود", () => {
    for (const id of ["frontendFramework", "backendFramework", "database", "search", "storage", "monorepoTool", "e2e"]) {
      assert.ok(
        technologiesInCategory(id).length >= 2,
        `دستهٔ ${id} باید حداقل دو گزینه داشته باشد، وگرنه ماشین امتحان نمی‌شود`,
      );
    }
  });

  test("هر گزینه هم مزیت دارد هم عیب — هیچ‌کدام بی‌عیب معرفی نشده", () => {
    for (const tech of TECHNOLOGIES) {
      assert.ok(tech.meta.pros.length > 0, `${tech.id} مزیت ندارد`);
      assert.ok(tech.meta.cons.length > 0, `${tech.id} عیب ندارد`);
    }
  });

  test("«تأییدشده» فقط به آنهایی داده شده که واقعاً اجرا شدند", () => {
    // نگهبانِ صداقت: این فهرست فقط وقتی رشد می‌کند که یک تکنولوژی واقعاً از
    // صفر تا کارکردن اجرا و با مدرک دیده شود. اگر کسی بی‌آزمایش علامتش را
    // عوض کند، همین تست قرمز می‌شود و مجبور است این فهرست را هم دست بزند.
    const REALLY_TESTED = [
      // هر ۲۸ مورد واقعاً از پوشهٔ خالی تا مدرکِ کارکردن اجرا شد.
      "node", "python", "pnpm", "npm", "turborepo", "nx", "pnpm-workspaces",
      "react-router-v7", "nextjs", "vite-react", "tailwind", "bootstrap",
      "nestjs", "express", "fastify", "bullmq",
      "fastapi", "node-ai-service",
      "clerk", "authjs", "sentry-pino", "grafana-stack", "celery",
      "postgres", "mysql", "mongodb", "mariadb", "sqlite",
      "rest-openapi", "trpc", "graphql",
      "meilisearch", "elasticsearch", "minio", "s3",
      "playwright", "cypress",
    ];
    const verified = TECHNOLOGIES.filter((t) => t.apply.verified).map((t) => t.id);
    assert.deepEqual(verified.sort(), [...REALLY_TESTED].sort());
    assert.equal(unverifiedTechnologies().length, TECHNOLOGIES.length - REALLY_TESTED.length);

    // فعلاً هیچ‌کدام معلق نیست. اگر ردیفِ نویی بی‌اجرا اضافه شود، همین‌جا
    // قرمز می‌شود — و آن‌وقت باید صریح نامش را اینجا بنویسی، نه اینکه
    // خطِ زیر را پاک کنی.
    assert.deepEqual(unverifiedTechnologies().map((t) => t.id), []);
  });

  test("کمکی‌های خواندن درست کار می‌کنند", () => {
    assert.equal(categoryById("database").label, "دیتابیس");
    assert.equal(categoryById("نیست"), null);
    assert.equal(technologyById("postgres").category, "database");
    assert.equal(technologyById("نیست"), null);
  });
});

describe("اعتبارسنجی، ایرادها را می‌گیرد", () => {
  const base = { categories: [{ id: "c1", label: "الف", question: "؟" }] };
  const ok = {
    id: "t1", category: "c1", label: "یک",
    detect: { kind: "file", path: "x" },
    apply: { verified: false, steps: [{ kind: "cli", command: "x" }] },
    meta: { pros: ["الف"], cons: ["ب"] },
  };

  const problemsFor = (tech) => validateRegistry({ ...base, technologies: [tech] });

  test("دستهٔ ناشناخته", () => {
    assert.match(problemsFor({ ...ok, category: "نیست" }).join(), /دستهٔ ناشناخته/);
  });

  test("نوعِ تشخیصِ ناشناخته", () => {
    assert.match(problemsFor({ ...ok, detect: { kind: "جادو" } }).join(), /نوعِ تشخیصِ ناشناخته/);
  });

  test("تشخیصِ بی‌پارامتر", () => {
    assert.match(problemsFor({ ...ok, detect: { kind: "file" } }).join(), /بدونِ path/);
    assert.match(problemsFor({ ...ok, detect: { kind: "npm" } }).join(), /بدونِ name/);
    assert.match(problemsFor({ ...ok, detect: { kind: "all", of: [] } }).join(), /بدونِ زیرشرط/);
  });

  test("عیب‌ننوشتن ایراد است", () => {
    assert.match(problemsFor({ ...ok, meta: { pros: ["الف"], cons: [] } }).join(), /عیبی ننوشته/);
  });

  test("پیش‌نیازِ ناموجود و پیش‌نیازِ خودش", () => {
    assert.match(problemsFor({ ...ok, requires: ["نیست"] }).join(), /پیش‌نیازِ ناموجود/);
    assert.match(problemsFor({ ...ok, requires: ["t1"] }).join(), /پیش‌نیازِ خودش/);
  });

  test("idِ تکراری", () => {
    const problems = validateRegistry({ ...base, technologies: [ok, { ...ok, label: "دو" }] });
    assert.match(problems.join(), /idِ تکراری/);
  });

  test("apply خالی یا بی‌verified", () => {
    assert.match(problemsFor({ ...ok, apply: { verified: false, steps: [] } }).join(), /steps خالی/);
    assert.match(problemsFor({ ...ok, apply: { steps: [{ kind: "cli", command: "x" }] } }).join(), /verified/);
  });
});

// ------------------------------------------------------------ نقشِ appها

describe("resolveRole", () => {
  test("چیدمانِ مونوریپو", () => {
    const dir = fixture("role-mono", { "apps/web/package.json": "{}" });
    const r = resolveRole(dir, "web");
    assert.equal(r.layout, "monorepo");
    assert.equal(r.app, "web");
  });

  test("پروژهٔ تک‌پکیجی: نقش به خودِ ریشه نگاشت می‌شود", () => {
    const dir = fixture("role-single", { "package.json": "{}" });
    const r = resolveRole(dir, "web");
    assert.equal(r.layout, "single");
    assert.equal(r.app, null);
  });

  test("هیچ‌کدام: صادقانه می‌گوید پیدا نشد", () => {
    const dir = fixture("role-none", { "apps/api/package.json": "{}" });
    assert.equal(resolveRole(dir, "web").layout, "missing");
  });

  test("بی‌نقش = خودِ ریشه", () => {
    assert.equal(resolveRole(fixture("role-null"), null).layout, "root");
  });
});

// -------------------------------------------------- ارزیابیِ مدرکِ تعریفی

describe("evaluateDetect", () => {
  test("file", () => {
    const dir = fixture("d-file", { "turbo.json": "{}" });
    assert.equal(evaluateDetect(dir, { kind: "file", path: "turbo.json" }).state, PRESENT);
    assert.equal(evaluateDetect(dir, { kind: "file", path: "nx.json" }).state, ABSENT);
  });

  test("npm با نقش، در مونوریپو و در تک‌پکیجی", () => {
    const mono = fixture("d-npm-mono", {
      "apps/web/package.json": "{}",
      "apps/web/node_modules/react-router/i.js": "",
    });
    const res = evaluateDetect(mono, { kind: "npm", role: "web", name: "react-router" });
    assert.equal(res.state, PRESENT);
    assert.match(res.evidence, /apps\/web/);

    const single = fixture("d-npm-single", {
      "package.json": "{}",
      "node_modules/react-router/i.js": "",
    });
    const res2 = evaluateDetect(single, { kind: "npm", role: "web", name: "react-router" });
    assert.equal(res2.state, PRESENT);
    assert.match(res2.evidence, /ریشه/);
  });

  test("dockerService — سه حالت", () => {
    const dir = fixture("d-docker");
    const pg = { kind: "dockerService", service: "postgres" };

    assert.equal(evaluateDetect(dir, pg, { probe: dockerProbe(["postgres"]) }).state, PRESENT);
    assert.equal(evaluateDetect(dir, pg, { probe: dockerProbe([]) }).state, ABSENT);
    // Docker در دسترس نبود → نامعلوم، نه «نیست»
    assert.equal(evaluateDetect(dir, pg, { probe: dockerProbe([], { checked: false }) }).state, UNKNOWN);
    // اصلاً پرسیده نشد → نامعلوم
    assert.equal(evaluateDetect(dir, pg, {}).state, UNKNOWN);
  });

  test("envVar: خالی‌بودن با نبودن یکی نیست، و بی‌فایل نامعلوم است", () => {
    const withVal = fixture("d-env-1", { ".env": "AWS_S3_BUCKET=my-bucket\n" });
    assert.equal(evaluateDetect(withVal, { kind: "envVar", name: "AWS_S3_BUCKET" }).state, PRESENT);

    const empty = fixture("d-env-2", { ".env": "AWS_S3_BUCKET=\n" });
    const res = evaluateDetect(empty, { kind: "envVar", name: "AWS_S3_BUCKET" });
    assert.equal(res.state, ABSENT);
    assert.match(res.evidence, /خالی/);

    assert.equal(evaluateDetect(fixture("d-env-3"), { kind: "envVar", name: "X" }).state, UNKNOWN);
  });

  test("all: یک «نیست» کافی است تا نتیجه «نیست» شود", () => {
    const dir = fixture("d-all", { "turbo.json": "{}" });
    const spec = { kind: "all", of: [{ kind: "file", path: "turbo.json" }, { kind: "npmRoot", name: "turbo" }] };
    assert.equal(evaluateDetect(dir, spec).state, ABSENT);

    const full = fixture("d-all-2", { "turbo.json": "{}", "node_modules/turbo/p.json": "{}" });
    assert.equal(evaluateDetect(full, spec).state, PRESENT);
  });

  test("all: «نامعلوم» سرایت می‌کند و درست را هم نامعلوم می‌کند", () => {
    const dir = fixture("d-all-unknown", { "turbo.json": "{}" });
    const spec = {
      kind: "all",
      of: [{ kind: "file", path: "turbo.json" }, { kind: "dockerService", service: "postgres" }],
    };
    const res = evaluateDetect(dir, spec, { probe: dockerProbe([], { checked: false }) });
    assert.equal(res.state, UNKNOWN, "نباید نتیجه را قطعی جا بزند");
  });

  test("any: یکی کافی است", () => {
    const dir = fixture("d-any", { "requirements.txt": "fastapi" });
    const spec = {
      kind: "any",
      of: [{ kind: "file", path: "pyproject.toml" }, { kind: "file", path: "requirements.txt" }],
    };
    assert.equal(evaluateDetect(dir, spec).state, PRESENT);
    assert.equal(evaluateDetect(fixture("d-any-2"), spec).state, ABSENT);
  });

  test("نوعِ ناشناخته «نامعلوم» می‌دهد، نه «نیست»", () => {
    assert.equal(evaluateDetect(fixture("d-unknown"), { kind: "جادو" }).state, UNKNOWN);
  });
});

// ---------------------------------------------- محورِ اصلی: ناسازگاری

describe("resolveRegistry", () => {
  test("پوشهٔ خالی: همهٔ دسته‌ها تصمیم‌نگرفته، بدونِ ناسازگاری", () => {
    const dir = fixture("r-empty");
    const out = resolveRegistry(dir, { probe: dockerProbe([], { hasComposeFile: false }) });

    assert.deepEqual(out.conflicts, []);
    for (const cat of out.categories) {
      assert.equal(cat.chosen, null, `${cat.id} نباید انتخابی داشته باشد`);
      assert.equal(cat.conflict, null);
    }
    // و هیچ گزینه‌ای «هست» نباشد
    const anyPresent = out.categories.flatMap((c) => c.options).filter((o) => o.state === PRESENT);
    assert.deepEqual(anyPresent, []);
  });

  test("یک گزینهٔ نصب‌شده → همان به‌عنوانِ انتخاب‌شده", () => {
    const dir = fixture("r-one", {
      "package.json": "{}",
      "apps/web/package.json": "{}",
      "apps/web/node_modules/react-router/i.js": "",
    });
    const out = resolveRegistry(dir, { probe: dockerProbe([]) });
    const front = out.categories.find((c) => c.id === "frontendFramework");

    assert.equal(front.chosen, "react-router-v7");
    assert.equal(front.conflict, null);
    assert.equal(front.undecided, false);
    assert.equal(front.options.find((o) => o.id === "nextjs").state, ABSENT);
  });

  test("دو رقیب در یک دسته → ناسازگاری، نه انتخابِ حدسی", () => {
    // این همان تستی است که نقشه برای قدمِ ۶ خواسته بود.
    const dir = fixture("r-conflict", {
      "package.json": "{}",
      "apps/web/package.json": "{}",
      "apps/web/node_modules/react-router/i.js": "",
      "apps/web/node_modules/next/i.js": "",
    });
    const out = resolveRegistry(dir, { probe: dockerProbe([]) });
    const front = out.categories.find((c) => c.id === "frontendFramework");

    assert.equal(front.chosen, null, "با دو گزینهٔ همزمان نباید یکی را انتخاب‌شده اعلام کند");
    assert.deepEqual(front.conflict.sort(), ["nextjs", "react-router-v7"]);
    assert.deepEqual(out.conflicts, [{ category: "frontendFramework", options: front.conflict }]);
  });

  test("ناسازگاریِ سرویس‌های Docker هم گرفته می‌شود", () => {
    const dir = fixture("r-db-conflict");
    const out = resolveRegistry(dir, { probe: dockerProbe(["postgres", "mysql"]) });
    const db = out.categories.find((c) => c.id === "database");

    assert.equal(db.chosen, null);
    assert.deepEqual(db.conflict.sort(), ["mysql", "postgres"]);
  });

  test("وضعیتِ نامعلوم، «تصمیم‌نگرفته» حساب نمی‌شود", () => {
    const dir = fixture("r-uncertain");
    const out = resolveRegistry(dir, { probe: dockerProbe([], { checked: false }) });
    const db = out.categories.find((c) => c.id === "database");

    assert.equal(db.chosen, null);
    assert.equal(db.undecided, false, "نامعلوم با تصمیم‌نگرفته یکی نیست");
    assert.equal(db.uncertain, true);
  });

  test("پیش‌نیازِ نصب‌نشده گزارش می‌شود، جدا از «نصب نیست»", () => {
    const dir = fixture("r-requires");
    const out = resolveRegistry(dir, { probe: dockerProbe([]) });
    const front = out.categories.find((c) => c.id === "frontendFramework");
    const rr = front.options.find((o) => o.id === "react-router-v7");

    assert.ok(rr.missingRequirements.includes("pnpm"), `پیش‌نیاز باید گزارش شود: ${JSON.stringify(rr)}`);
  });

  test("پیش‌نیازِ برآورده‌شده دیگر گزارش نمی‌شود", () => {
    const dir = fixture("r-requires-ok", { "package.json": "{}", "pnpm-lock.yaml": "" });
    const out = resolveRegistry(dir, { probe: dockerProbe([]) });
    const rr = out.categories
      .find((c) => c.id === "frontendFramework")
      .options.find((o) => o.id === "react-router-v7");

    assert.deepEqual(rr.missingRequirements, []);
  });

  test("هر گزینه، مدرکِ خودش را همراه دارد", () => {
    const dir = fixture("r-evidence");
    const out = resolveRegistry(dir, { probe: dockerProbe([]) });
    for (const cat of out.categories) {
      for (const opt of cat.options) {
        assert.ok(opt.evidence && opt.evidence.length > 0, `${opt.id} بی‌مدرک است`);
      }
    }
  });

  test("فهرستِ تأییدنشده‌ها با واقعیتِ رجیستری می‌خواند", () => {
    const out = resolveRegistry(fixture("r-unverified"), { probe: dockerProbe([]) });
    const expected = TECHNOLOGIES.filter((t) => !t.apply.verified).map((t) => t.id);
    assert.deepEqual(out.unverified.sort(), expected.sort());
    // الان هر ۱۹ مورد آزمایش شده، پس این فهرست خالی است. ولی سازوکارش باید
    // بماند: تکنولوژیِ نو تا آزمایش نشود اینجا ظاهر می‌شود و UI برچسبِ
    // «نصبش آزمایش‌نشده» را نشانش می‌دهد.
  });
});

// ---------------------------------------------------------------------------
// قرارداد بینِ تقلبی و واقعی.
//
// یک باگِ واقعی از همین‌جا آمد: تقلبیِ Docker فیلدهایی داشت که کدِ واقعی
// نمی‌سازد، پس تست‌ها سبز بودند ولی ابزار روی دادهٔ واقعی اشتباه جواب می‌داد
// (سرویسِ نبوده را «نامعلوم» می‌گفت، نه «نیست»).
//
// این تست‌ها با **خروجیِ واقعیِ** موتورِ تشخیص کار می‌کنند، نه با تقلبی.
// ---------------------------------------------------------------------------
describe("قرارداد: تقلبی باید شکلِ واقعی را داشته باشد", () => {
  test("تقلبی همان کلیدهایی را دارد که کدِ واقعی می‌سازد", () => {
    const realNoCompose = detectDockerServices(fixture("c-no-compose"));
    const fakeNoCompose = dockerProbe([], { hasComposeFile: false }).docker;
    assert.deepEqual(
      Object.keys(fakeNoCompose).sort(),
      Object.keys(realNoCompose).sort(),
      "کلیدهای تقلبی با واقعی یکی نیست — همین واگرایی یک‌بار باگ ساخت",
    );
  });

  test("بی فایلِ compose، سرویس «نیست» است نه «نامعلوم»", () => {
    // با خروجیِ واقعی، نه تقلبی.
    const dir = fixture("c-real-absent");
    const probe = { docker: detectDockerServices(dir) };
    const res = evaluateDetect(dir, { kind: "dockerService", service: "postgres" }, { probe });
    assert.equal(res.state, ABSENT, "فایلِ compose نیست، پس سرویس قطعاً نیست");
  });

  test("resolveRegistry روی probeProjectِ واقعی هم درست کار می‌کند", () => {
    const dir = fixture("c-real-full", { "package.json": "{}" });
    const probe = probeProject(dir);
    const out = resolveRegistry(dir, { probe });

    const db = out.categories.find((c) => c.id === "database");
    assert.equal(db.chosen, null);
    assert.equal(db.uncertain, false, "بی فایلِ compose نباید «نامعلوم» بگوید");
    assert.equal(db.undecided, true);
    assert.deepEqual(out.conflicts, []);
  });
});
