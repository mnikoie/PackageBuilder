import { defineConfig, devices } from "@playwright/test";

/**
 * تستِ سرتاسری — مرورگرِ واقعی، سرورِ واقعی، پروژهٔ واقعی.
 *
 * چرا این تست‌ها جدا از `npm test` اجرا می‌شوند: کندترند (مرورگر بالا می‌آید و
 * فرمان‌های واقعی اجرا می‌شوند). `npm test` باید در چند ثانیه تمام شود تا
 * موقعِ کار مرتب اجرا شودش؛ این یکی قبلِ commit.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // ترمینال و Docker مشترک‌اند؛ موازی‌سازی تصادم می‌سازد
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4611",
    locale: "fa-IR",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node src/cli.mjs serve --port 4611",
    url: "http://127.0.0.1:4611/",
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
