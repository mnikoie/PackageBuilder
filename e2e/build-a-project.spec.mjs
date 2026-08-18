/**
 * تستِ سرتاسری: از یک پوشهٔ خالی تا یک سرویسِ واقعیِ کارکننده — فقط با کلیک.
 *
 * این تست همان کاری را می‌کند که کاربر می‌کند، در مرورگرِ واقعی. تا حالا این
 * وارسی را دستی انجام می‌دادم؛ از اینجا به بعد خودکار است.
 *
 * اجرا: npm run e2e
 */

import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { scaffoldProject } from "../src/core/scaffold.mjs";

let sandbox;
let project;

test.beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "pb-e2e-"));
  project = join(sandbox, "clicked-app");
  const res = scaffoldProject({ targetPath: project, slug: "clickedapp", displayName: "Clicked App" });
  expect(res.ok, res.error).toBe(true);
});

test.afterAll(() => {
  // کانتینرهای این تست را می‌خوابانیم، وگرنه روی سیستم می‌مانند.
  const compose = join(project, "deployment", "docker-compose.yml");
  if (existsSync(compose)) {
    spawnSync("docker", ["compose", "--env-file", join(project, ".env"), "-f", compose, "down", "-v"], {
      timeout: 90_000,
    });
  }
  rmSync(sandbox, { recursive: true, force: true });
});

/** مسیرِ پروژه را در صفحه می‌گذارد و منتظرِ آمدنِ تصمیم‌ها می‌ماند. */
async function openProject(page) {
  await page.goto("/?path=" + encodeURIComponent(project));
  await expect(page.locator(".cat").first()).toBeVisible();
}

/** یک دسته را با نامش پیدا می‌کند. */
const category = (page, name) => page.locator(".cat").filter({ has: page.locator(".name", { hasText: name }) });

/** یک گزینه را داخلِ یک دسته پیدا می‌کند. */
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
  await expect(page.locator(".cat .verdict.chosen")).toHaveCount(0);
  // و هیچ گزینه‌ای «هست» نباشد
  await expect(page.locator(".opt .chip.ok")).toHaveCount(0);
});

test("ترتیبِ پیش‌نیازها راهنمایی می‌کند", async ({ page }) => {
  await openProject(page);

  // Node.js پیش‌نیاز ندارد → دکمه‌اش فعال است
  const node = option(category(page, "زبان/رانتایمِ اصلی"), "Node.js");
  await expect(node.getByRole("button", { name: "نصب کن" })).toBeEnabled();

  // pnpm به Node نیاز دارد و Node نصب نیست → خاموش، با توضیحِ صریح.
  // (هر گزینه می‌تواند چند برچسبِ هشدار داشته باشد، پس دقیقاً همان یکی را
  // می‌گیریم — وگرنه انتخاب‌گر مبهم می‌شود.)
  const pnpm = option(category(page, "مدیرِ پکیج"), "pnpm");
  await expect(pnpm.getByRole("button", { name: "نصب کن" })).toBeDisabled();
  await expect(pnpm.locator(".warn-tag").filter({ hasText: "اول لازم است" })).toContainText("Node.js");
});

test("گزینه‌های آزمایش‌نشده صریح علامت خورده‌اند", async ({ page }) => {
  await openProject(page);

  // Nx واقعاً اجرا نشده، پس باید هشدار داشته باشد
  const nx = option(category(page, "ساختارِ مخزن"), "Nx");
  await expect(nx.locator(".warn-tag").filter({ hasText: "آزمایش‌نشده" })).toBeVisible();

  // PostgreSQL اجرا شده، پس نباید داشته باشد
  const pg = option(category(page, "دیتابیس"), "PostgreSQL");
  await expect(pg.locator(".warn-tag").filter({ hasText: "آزمایش‌نشده" })).toHaveCount(0);
});

test("چرخهٔ کامل: نصب با کلیک → سرویسِ واقعی → برداشتن با کلیک", async ({ page }) => {
  // پیام‌های alert را می‌گیریم تا تست معطل نماند
  const alerts = [];
  page.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });

  await openProject(page);

  const db = category(page, "دیتابیس");
  const pg = option(db, "PostgreSQL");

  // ---- نصب
  await expect(pg.locator(".chip")).toContainText("نیست");
  await pg.getByRole("button", { name: "نصب کن" }).click();

  await expect(db.locator(".verdict.chosen")).toContainText("PostgreSQL", { timeout: 90_000 });
  await expect(pg.locator(".chip")).toContainText("هست");
  expect(alerts.join()).toContain("اعمال شد");

  // مدرکِ واقعی، نه فقط ظاهرِ صفحه: کانتینر باید بالا باشد
  const running = spawnSync("docker", ["ps", "--filter", "name=clickedapp", "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  expect(running.stdout).toContain("clickedapp-postgres-1");

  // و سرویس باید واقعاً جواب بدهد
  const ready = spawnSync("docker", ["exec", "clickedapp-postgres-1", "pg_isready", "-U", "app"], {
    encoding: "utf8", timeout: 30_000,
  });
  expect(ready.stdout).toContain("accepting connections");

  // و تصمیم باید ثبت شده باشد
  const docs = readdirSync(join(project, "docs", "decisions"));
  expect(docs.some((f) => f.includes("database-postgres"))).toBe(true);
  const config = JSON.parse(readFileSync(join(project, "project.config.json"), "utf8"));
  expect(config.stack.database).toBe("postgres");

  // ---- برداشتن
  alerts.length = 0;
  await pg.getByRole("button", { name: "بردار" }).click();

  await expect(db.locator(".verdict.none")).toBeVisible({ timeout: 90_000 });
  await expect(pg.locator(".chip")).toContainText("نیست");
  expect(alerts.join()).toContain("برگشت انجام شد");

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
  await openProject(page);

  const pg = option(category(page, "دیتابیس"), "PostgreSQL");
  await pg.getByRole("button", { name: "نصب کن" }).click();
  await expect(pg.locator(".chip")).toContainText("هست", { timeout: 90_000 });

  // متنِ ترمینال باید فرمانِ واقعیِ docker را نشان بدهد
  const termText = await page.evaluate(() => {
    const buf = window.term.buffer.active;
    let all = "";
    for (let i = 0; i < buf.length; i++) all += (buf.getLine(i)?.translateToString(true) ?? "") + "\n";
    return all;
  });
  expect(termText).toContain("docker compose");
  // و نشانهٔ داخلیِ ابزار نباید نشت کند
  expect(termText).not.toContain("##STEP_OK");

  // پاک‌سازی برای تستِ بعدی
  await pg.getByRole("button", { name: "بردار" }).click();
  await expect(pg.locator(".chip")).toContainText("نیست", { timeout: 90_000 });
});
