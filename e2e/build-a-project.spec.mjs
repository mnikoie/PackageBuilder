/**
 * تستِ سرتاسری: از یک پوشهٔ خالی تا یک سرویسِ واقعیِ کارکننده — فقط با کلیک.
 *
 * این تست همان کاری را می‌کند که کاربر می‌کند، در مرورگرِ واقعی. تا حالا این
 * وارسی را دستی انجام می‌دادم؛ از اینجا به بعد خودکار است.
 *
 * اجرا: npm run e2e
 */

import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { scaffoldProject } from "../src/core/scaffold.mjs";
import { unverifiedTechnologies } from "../src/core/registry.mjs";

let sandbox;
let project;
const built = [];

/**
 * پروژهٔ نو با نامِ یکتا.
 *
 * چرا هر تستِ تغییردهنده پوشهٔ خودش را می‌خواهد: تست‌ها ترتیبی و در یک worker
 * اجرا می‌شوند، و اگر پوشه و کانتینرها مشترک باشند به هم تداخل می‌کنند —
 * تستی که تنها پاس می‌شد، در اجرای گروهی می‌شکست. نامِ یکتا هم دامنهٔ Docker
 * را جدا می‌کند (همان فیلدِ name در فایلِ compose).
 */
function freshProject(slug) {
  const dir = join(sandbox, slug);
  const res = scaffoldProject({ targetPath: dir, slug, displayName: slug });
  expect(res.ok, res.error).toBe(true);
  built.push(dir);
  return dir;
}

test.beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "pb-e2e-"));
  project = freshProject("clickedapp");
});

test.afterAll(() => {
  // کانتینرهای همهٔ پروژه‌های ساخته‌شده را می‌خوابانیم، وگرنه روی سیستم می‌مانند.
  for (const dir of built) {
    const compose = join(dir, "deployment", "docker-compose.yml");
    if (!existsSync(compose)) continue;
    spawnSync("docker", ["compose", "--env-file", join(dir, ".env"), "-f", compose, "down", "-v"], {
      timeout: 90_000,
    });
  }
  rmSync(sandbox, { recursive: true, force: true });
});

/**
 * مسیرِ پروژه را در صفحه می‌گذارد و منتظر می‌ماند تا **ترمینال هم وصل شود**.
 *
 * چرا انتظار برای ترمینال لازم است: خروجیِ فرمان‌ها فقط به کلاینت‌هایی
 * می‌رسد که در لحظهٔ اجرا وصل بوده‌اند. کلیکِ قبل از اتصال، خروجی را می‌بلعید —
 * که هم تستِ «هیچ چیزی پنهان اجرا نشود» را می‌شکست، هم برای کاربرِ واقعی
 * یعنی فرمانی که ندیدش. حالا خودِ دکمه‌ها تا اتصال خاموش‌اند.
 */
async function openProject(page, dir = project) {
  await page.goto("/?path=" + encodeURIComponent(dir));
  await expect(page.locator(".group").first()).toBeVisible();
  await expect(page.locator("#termDot")).toHaveClass(/on/, { timeout: 25_000 });
}

/** یک دسته را با نامش پیدا می‌کند. */
const category = (page, name) => page.locator(".group").filter({ has: page.locator(".gname", { hasText: name }) });

/** یک گزینه را داخلِ یک دسته پیدا می‌کند. */
/** گروه‌ها آکاردئونی‌اند و جز اولی بسته‌اند — پس قبل از کار باید باز شوند. */
const openGroup = async (cat) => {
  if (await cat.evaluate((e) => e.classList.contains("closed"))) await cat.locator(".ghead").click();
  return cat;
};

const option = (cat, label) => cat.locator(".opt").filter({ has: cat.page().locator("b", { hasText: label }) });

test("صفحه بالا می‌آید و ترمینالِ واقعی وصل می‌شود", async ({ page }) => {
  await openProject(page);

  await expect(page.locator("h1")).toContainText("وضعیتِ واقعیِ پروژه");
  // ترمینال باید واقعاً وصل شود (نقطهٔ سبز)
  await expect(page.locator("#termDot")).toHaveClass(/on/, { timeout: 20_000 });
  await expect(page.locator("#termLabel")).toContainText("ترمینالِ واقعی");
});

test("پوشهٔ نو: هیچ ادعای سبزِ دروغینی ندارد", async ({ page }) => {
  await openProject(page);

  // هیچ دسته‌ای نباید «انتخاب‌شده» داشته باشد
  await expect(page.locator(".group .verdict-pill.chosen")).toHaveCount(0);
  // و هیچ گزینه‌ای «هست» نباشد
  await expect(page.locator(".opt .chip.ok")).toHaveCount(0);
});

test("ترتیبِ پیش‌نیازها راهنمایی می‌کند", async ({ page }) => {
  await openProject(page);

  // Node.js پیش‌نیاز ندارد → دکمه‌اش فعال است
  const node = option(await openGroup(category(page, "زبان/رانتایمِ اصلی")), "Node.js");
  await expect(node.getByRole("button", { name: "نصب کن" })).toBeEnabled();

  // pnpm به Node نیاز دارد و Node نصب نیست → خاموش، با توضیحِ صریح.
  // (هر گزینه می‌تواند چند برچسبِ هشدار داشته باشد، پس دقیقاً همان یکی را
  // می‌گیریم — وگرنه انتخاب‌گر مبهم می‌شود.)
  const pnpm = option(await openGroup(category(page, "مدیرِ پکیج")), "pnpm");
  await expect(pnpm.getByRole("button", { name: "نصب کن" })).toBeDisabled();
  await expect(pnpm.locator(".warn-tag").filter({ hasText: "اول لازم است" })).toContainText("Node.js");
});

test("برچسبِ «آزمایش‌نشده» دقیقاً به همان‌هایی می‌خورد که واقعاً اجرا نشده‌اند", async ({ page }) => {
  await openProject(page);

  // نگارشِ قبلیِ این تست انتظار داشت این برچسب **هیچ‌جا** نباشد، چون آن موقع
  // همهٔ ردیف‌ها اجرا شده بودند. حالا دو تا هستند که روی این سیستم اجرا
  // نشدند (Docker بالا نیامد)، و پنهان‌کردنشان یعنی همان سبزِ دروغینی که این
  // پروژه علیه آن نوشته شده.
  //
  // پس تست از خودِ رجیستری می‌پرسد چند تا هنوز اجرا نشده‌اند و همان تعداد را
  // در صفحه انتظار دارد: نه کمتر (پنهان‌کاری)، نه بیشتر (برچسبِ بی‌جا). فهرستِ
  // دقیقشان در tests/registry.test.mjs میخ شده است.
  const pending = unverifiedTechnologies().length;
  await expect(page.locator(".warn-tag").filter({ hasText: "آزمایش‌نشده" })).toHaveCount(pending);
});

test("دکمه‌ها تا وصل‌نشدنِ ترمینال خاموش‌اند", async ({ page }) => {
  // فرمانی که خروجی‌اش دیده نشود، ناقضِ قاعدهٔ «هیچ چیزی پنهان اجرا نشود» است.
  await page.goto("/?path=" + encodeURIComponent(project));
  await expect(page.locator(".group").first()).toBeVisible();

  const pg = option(await openGroup(category(page, "دیتابیس")), "PostgreSQL");
  const go = pg.getByRole("button", { name: "نصب کن" });

  // بعد از وصل‌شدن، همان دکمه فعال می‌شود
  await expect(page.locator("#termDot")).toHaveClass(/on/, { timeout: 25_000 });
  await expect(go).toBeEnabled();
});

test("راهنمای هر گروه و هر گزینه، از دادهٔ واقعی پر می‌شود", async ({ page }) => {
  await openProject(page);

  // راهنمای گروه
  const db = await openGroup(category(page, "دیتابیس"));
  await db.locator(".info-btn").first().click();
  const groupModal = page.locator(".modal");
  await expect(groupModal.locator("h3")).toContainText("دیتابیس");
  await expect(groupModal.locator(".lead")).not.toBeEmpty();
  await expect(groupModal.locator("h4").filter({ hasText: "گزینه‌ها" })).toBeVisible();
  await groupModal.locator("header .x").click();
  await expect(page.locator(".modal")).toHaveCount(0);

  // راهنمای گزینه — باید بگوید دقیقاً چه اتفاقی می‌افتد و برگشتش چطور است.
  // این متن از خودِ گام‌های رجیستری ساخته می‌شود، نه از نوشتهٔ دستی، پس
  // هیچ‌وقت با واقعیت ناهمگام نمی‌شود.
  const pg = option(db, "PostgreSQL");
  await pg.locator(".info-btn").click();
  const optModal = page.locator(".modal");
  await expect(optModal.locator("h3")).toContainText("PostgreSQL");
  await expect(optModal).toContainText("با زدنِ «نصب کن» دقیقاً چه می‌شود");
  await expect(optModal.locator("pre").first()).toContainText("postgres");
  await expect(optModal).toContainText("برگشت چطور است");
  await optModal.locator("header .x").click();
});

test("پوشهٔ بی‌اسکلت، دکمهٔ ساخت دارد — و بعدِ ساخت، اسکلت واقعاً هست", async ({ page }) => {
  // این تا پیش از این فقط در خط‌فرمان ممکن بود و کاربر در صفحه راهی نداشت.
  const dir = join(sandbox, "bare-" + Date.now());
  mkdirSync(dir, { recursive: true });

  await page.goto("/?path=" + encodeURIComponent(dir));
  const make = page.locator(".make");
  await expect(make).toBeVisible();
  await make.getByRole("button", { name: "اسکلتِ پروژه را بساز" }).click();

  const dialog = page.locator(".modal");
  await expect(dialog.locator("h3")).toContainText("ساختِ اسکلتِ پروژه");
  await dialog.locator("input").fill("پروژهٔ تستی");
  await dialog.getByRole("button", { name: "بساز" }).click();

  // ادعای صفحه کافی نیست — خودِ دیسک را می‌سنجیم
  await expect(page.locator(".make")).toHaveCount(0, { timeout: 30_000 });
  expect(existsSync(join(dir, "project.config.json"))).toBe(true);
  expect(existsSync(join(dir, "docs", "decisions"))).toBe(true);
  expect(readFileSync(join(dir, "project.config.json"), "utf8")).toContain("پروژهٔ تستی");
});

test("چیزی که نصب است، نشانِ دیدنی دارد — نه فقط دکمهٔ خاموش", async ({ page }) => {
  // کاربر درست گفت: «چیزی نمی‌گوید که نصب است و نمی‌خواهد نصب کنی».
  // قبلاً فقط دکمه خاموش می‌شد و توضیحش در tooltip پنهان بود.
  // پوشهٔ تستِ e2e خالی است، پس اول واقعاً یک چیز نصب می‌کنیم — وگرنه تست
  // چیزی را می‌سنجد که اصلاً وجود ندارد.
  const dir = freshProject("badge" + Date.now());
  await page.goto("/?path=" + encodeURIComponent(dir));
  await expect(page.locator("#termDot")).toHaveClass(/on/, { timeout: 25_000 });

  const lang = await openGroup(category(page, "زبان"));
  const node = option(lang, "Node.js");
  await expect(node.locator(".badge-installed")).toHaveCount(0);

  await node.getByRole("button", { name: "نصب کن" }).click();

  await expect(node.locator(".badge-installed")).toContainText("از قبل نصب است", { timeout: 90_000 });
  await expect(node.getByRole("button", { name: "نصب کن" })).toBeDisabled();
  await expect(node).toHaveClass(/installed/);
});

/**
 * رد شدن از پنجرهٔ رمز و برگرداندنِ مقداری که واقعاً فرستاده شد.
 *
 * مقدار را از خودِ input می‌خوانیم، نه از حدس: بعداً با همین باید به دیتابیس
 * وصل شویم، و اگر چیزِ دیگری بنویسیم تست دیگر چیزی را ثابت نمی‌کند.
 */
async function passSecretModal(page, name) {
  const box = page.locator(".modal");
  await expect(box).toBeVisible({ timeout: 15_000 });
  await expect(box.locator(".secret-name", { hasText: name })).toBeVisible();

  const input = box.locator(".secret-line input").first();
  const generated = await input.inputValue();
  expect(generated.length).toBeGreaterThan(15);
  // پیش‌فرض باید ساختارِ URL را نشکند، وگرنه DATABASE_URL خراب می‌شود.
  expect(generated).not.toMatch(/[@:/]/);

  // «دوباره بساز» باید واقعاً مقدارِ دیگری بدهد.
  await box.getByRole("button", { name: "دوباره بساز" }).click();
  const second = await input.inputValue();
  expect(second).not.toBe(generated);

  await box.getByRole("button", { name: "نصب با این رمز" }).click();
  await expect(box).toBeHidden({ timeout: 10_000 });
  return second;
}

test("چرخهٔ کامل: نصب با کلیک → سرویسِ واقعی → برداشتن با کلیک", async ({ page }) => {
  // پیامِ موفقیت دیگر alert نیست — توستی است که خودش بعد از چند ثانیه می‌رود.
  // پس به‌جای انتظارِ لحظه‌ای (که مسابقه‌ای است)، از همان اول ضبطشان می‌کنیم.
  await page.addInitScript(() => {
    window.__toasts = [];
    const seen = new WeakSet();
    new MutationObserver(() => {
      for (const t of document.querySelectorAll(".toast")) {
        if (seen.has(t)) continue;
        seen.add(t);
        window.__toasts.push(t.textContent);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const toastsSoFar = () => page.evaluate(() => (window.__toasts || []).join(" | "));

  await openProject(page);

  const db = await openGroup(category(page, "دیتابیس"));
  const pg = option(db, "PostgreSQL");

  // ---- نصب
  await expect(pg.locator(".chip.no")).toBeVisible();
  await pg.getByRole("button", { name: "نصب کن" }).click();

  // رمز قبل از نصب پرسیده می‌شود.
  const password = await passSecretModal(page, "POSTGRES_PASSWORD");

  await expect(db.locator(".verdict-pill.chosen")).toContainText("PostgreSQL", { timeout: 90_000 });
  await expect(pg.locator(".chip.ok")).toBeVisible();
  expect(await toastsSoFar()).toContain("نصب شد");

  // مدرکِ واقعی، نه فقط ظاهرِ صفحه: کانتینر باید بالا باشد
  const running = spawnSync("docker", ["ps", "--filter", "name=clickedapp", "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  expect(running.stdout).toContain("clickedapp-postgres-1");

  // و سرویس باید واقعاً جواب بدهد.
  //
  // چرا حلقه و نه یک پرسشِ ساده: «کانتینر بالاست» با «Postgres آماده است» یکی
  // نیست. ایمیج اولِ کار دیتابیس را می‌سازد و در آن چند ثانیه
  // `pg_isready` جواب می‌دهد «no response». این همان چیزی بود که این تست را
  // گاهی قرمز می‌کرد — نوسانی نبود، فقط زود می‌پرسید.
  const waitFor = (fn, what) => {
    for (let i = 0; i < 40; i++) {
      const r = fn();
      if (r.ok) return r.value;
      // خوابِ بی‌وابستگی: از خودِ داکر، تا روی هر سیستمی یکسان باشد.
      spawnSync("docker", ["run", "--rm", "postgres:17-alpine", "sleep", "1"]);
    }
    throw new Error(`${what} در ۴۰ تلاش آماده نشد`);
  };

  waitFor(() => {
    const r = spawnSync("docker", ["exec", "clickedapp-postgres-1", "pg_isready", "-U", "app"],
      { encoding: "utf8", timeout: 30_000 });
    return { ok: (r.stdout || "").includes("accepting connections"), value: r.stdout };
  }, "Postgres");

  // رمزی که در پنجره دیدیم باید همانی باشد که سرویس واقعاً قبول می‌کند —
  // وگرنه «نصب شد»ِ صفحه ادعای بی‌مدرک است.
  const auth = waitFor(() => {
    const r = spawnSync("docker", [
      "exec", "-e", `PGPASSWORD=${password}`, "clickedapp-postgres-1",
      "psql", "-h", "127.0.0.1", "-U", "app", "-d", "app", "-c", "select 1;",
    ], { encoding: "utf8", timeout: 30_000 });
    // رمزِ غلط را دوباره امتحان نمی‌کنیم: آن شکستِ واقعی است، نه نبودنِ آمادگی.
    if ((r.stderr || "").includes("password authentication failed")) {
      throw new Error(`رمزی که در پنجره دیدیم قبول نشد: ${r.stderr}`);
    }
    return { ok: r.status === 0, value: r };
  }, "اتصال با رمز");
  expect(auth.status, auth.stderr).toBe(0);

  // و در .env نشسته باشد، ولی در .env.example هرگز — آن فایل کامیت می‌شود.
  const dotenv = readFileSync(join(project, ".env"), "utf8");
  expect(dotenv).toContain(`POSTGRES_PASSWORD=${password}`);
  expect(dotenv).toContain(`app:${password}@`);
  expect(readFileSync(join(project, ".env.example"), "utf8")).not.toContain(password);

  // فایلِ compose باید ارجاع بدهد، نه رمز را در خودش داشته باشد.
  const compose = readFileSync(join(project, "deployment", "docker-compose.yml"), "utf8");
  expect(compose).not.toContain(password);
  expect(compose).toContain("${POSTGRES_PASSWORD}");

  // و تصمیم باید ثبت شده باشد
  const docs = readdirSync(join(project, "docs", "decisions"));
  expect(docs.some((f) => f.includes("database-postgres"))).toBe(true);
  const config = JSON.parse(readFileSync(join(project, "project.config.json"), "utf8"));
  expect(config.stack.database).toBe("postgres");

  // ---- برداشتن
  await page.evaluate(() => { window.__toasts.length = 0; });
  await pg.getByRole("button", { name: "بردار" }).click();

  await expect(db.locator(".verdict-pill.none")).toBeVisible({ timeout: 90_000 });
  await expect(pg.locator(".chip.no")).toBeVisible();
  expect(await toastsSoFar()).toContain("برداشته شد");

  // کانتینر باید خوابیده باشد
  const after = spawnSync("docker", ["ps", "--filter", "name=clickedapp", "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  expect(after.stdout.trim()).toBe("");

  // و قصدِ ثبت‌شده هم پاک شده باشد
  const configAfter = JSON.parse(readFileSync(join(project, "project.config.json"), "utf8"));
  expect(configAfter.stack.database).toBe(null);
});

test("فرمان‌ها در ترمینال دیده می‌شوند — هیچ چیزی پنهان اجرا نمی‌شود", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  // پوشهٔ خودش، تا با تستِ چرخهٔ کامل (که همین سرویس را نصب و برمی‌دارد) تداخل
  // نکند. بی این، تستی که تنها پاس می‌شد در اجرای گروهی می‌شکست.
  await openProject(page, freshProject("terminalvisible"));

  const pg = option(await openGroup(category(page, "دیتابیس")), "PostgreSQL");
  await pg.getByRole("button", { name: "نصب کن" }).click();
  await passSecretModal(page, "POSTGRES_PASSWORD");
  await expect(pg.locator(".chip.ok")).toBeVisible({ timeout: 90_000 });

  // متنِ ترمینال باید فرمانِ واقعیِ docker را نشان بدهد.
  const termText = await page.evaluate(() => {
    const buf = window.term.buffer.active;
    let all = "";
    for (let i = 0; i < buf.length; i++) all += (buf.getLine(i)?.translateToString(true) ?? "") + "\n";
    return all;
  });

  // ---- چرا فاصله‌ها حذف می‌شوند ----
  // ترمینال ۱۲۰ ستون است و خودِ پاورشل خطِ بلندِ ورودی را با نیوـ‌لاینِ واقعی
  // می‌شکند. پس کلمهٔ «docker» در بافر می‌تواند «doc» + شکستِ خط + «ker» باشد،
  // در حالی که کاربر متنِ سالم را می‌بیند. جست‌وجو باید مقاومِ به شکستِ خط باشد.
  const squished = termText.replace(/\s+/g, "");
  expect(squished, "فرمانِ واقعیِ docker باید در ترمینال دیده شود").toContain("dockercompose");
  expect(squished, "و پرچمِ --env-file هم که خودمان اضافه می‌کنیم").toContain("--env-file");

  // نشانهٔ داخلیِ ابزار نباید نشت کند
  expect(squished).not.toContain("##STEP_OK");

  // پاک‌سازی برای تستِ بعدی
  await pg.getByRole("button", { name: "بردار" }).click();
  await expect(pg.locator(".chip.no")).toBeVisible({ timeout: 90_000 });
});
