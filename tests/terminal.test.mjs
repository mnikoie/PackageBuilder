/**
 * تست‌های ترمینالِ واقعی.
 *
 * اینها با یک PowerShellِ **واقعی** کار می‌کنند، نه شبیه‌سازی — چون کلِ ارزشِ
 * قدمِ ۵ همین است که ترمینال واقعی باشد. پس کمی کندترند و طبیعی است.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import pty from "node-pty";

import { createTerminal, detectShell } from "../src/server/terminal.mjs";

const SHELL = detectShell();

/**
 * PTYِ باز، حلقهٔ رویدادِ Node را زنده نگه می‌دارد؛ پس حتی وقتی همهٔ تست‌ها
 * تمام شده‌اند، پروسه بیرون نمی‌آید و اجرا برای همیشه معطل می‌ماند (خودِ همین
 * موضوع یک‌بار سرِ ما آمد: تستی که ۳۰۰ ثانیه بی‌خروجی ماند).
 *
 * پس آخرِ کار، بعد از اینکه هر ترمینالی بسته شد، خودمان صریح خارج می‌شویم.
 */
const openTerminals = new Set();

function makeTerminal(opts = {}) {
  const term = createTerminal({ pty, shell: SHELL, ...opts });
  openTerminals.add(term);
  return term;
}

after(() => {
  for (const t of openTerminals) t.dispose();
  // اگر بعدِ بستنِ همهٔ ترمینال‌ها هنوز چیزی حلقه را زنده نگه داشته، خودمان
  // خارج می‌شویم. تایمر unref شده است، پس اگر حلقه طبیعی خالی شود این هرگز
  // اجرا نمی‌شود و در مسیرِ عادی دخالتی نمی‌کند — فقط ضامنِ ضدِ معطلی است.
  setTimeout(() => process.exit(process.exitCode ?? 0), 1000).unref();
});

/** منتظرِ برقراریِ یک شرط روی خروجی می‌ماند. */
function waitFor(check, timeoutMs = 25000, label = "شرط") {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`زمانِ انتظار برای ${label} تمام شد`));
      setTimeout(tick, 50);
    };
    tick();
  });
}

describe("detectShell", () => {
  test("پاورشل را روی این سیستم پیدا می‌کند", () => {
    assert.ok(SHELL, "هیچ پاورشلی پیدا نشد");
    assert.match(SHELL, /pwsh\.exe|powershell\.exe/);
  });
});

describe("ترمینالِ واقعی", { skip: SHELL ? false : "پاورشل نیست" }, () => {
  let term, output, steps;

  before(() => {
    output = "";
    steps = [];
    term = makeTerminal({ stepTimeoutMs: 30000 });
    term.onData((d) => { output += d; });
    term.onStepResult((r) => steps.push(r));
    term.ensure();
  });

  after(() => term?.dispose());

  test("تا فرمانی نیاید، زنده است ولی مرحله‌ای معلق ندارد", () => {
    assert.ok(term.isAlive());
    assert.deepEqual(term.pendingSteps(), []);
  });

  test("فرمانِ موفق: خروجی می‌آید و پایانش OK اعلام می‌شود", async () => {
    term.run('Write-Host "سلامِ ترمینال"', "ok1");
    await waitFor(() => steps.some((s) => s.id === "ok1"), 25000, "پایانِ ok1");

    const step = steps.find((s) => s.id === "ok1");
    assert.equal(step.ok, true);
    assert.ok(output.includes("سلامِ ترمینال"), "خروجیِ واقعی نیامد");
    assert.ok(!output.includes("##STEP_OK"), "نشانه به خروجیِ نمایشی نشت کرد");
    assert.deepEqual(term.pendingSteps(), [], "مرحله باید از فهرستِ معلق‌ها برود");
  });

  test("هر فرمان دقیقاً یک خبر می‌دهد — پژواکِ پاورشل خبرِ جعلی نمی‌سازد", async () => {
    // رگرسیونِ باگی که در آزمایشِ زنده پیدا شد: پاورشلِ تعاملی خطِ فرمان را
    // پژواک می‌کند، و قبل از اصلاح، همان پژواک سه خبر می‌ساخت (true/false/true)
    // برای یک فرمان. یعنی «موفق» اعلام می‌شد پیش از اینکه فرمان اجرا شود.
    const before = steps.length;
    term.run('Write-Host "یک‌بار"', "once1");
    await waitFor(() => steps.some((s) => s.id === "once1"), 25000, "پایانِ once1");
    // کمی صبر، تا اگر خبرِ اضافه‌ای در راه بود برسد
    await new Promise((r) => setTimeout(r, 1500));

    const mine = steps.slice(before).filter((s) => s.id === "once1");
    assert.equal(mine.length, 1, `باید یک خبر باشد، ولی ${mine.length} خبر آمد: ${JSON.stringify(mine)}`);
    assert.equal(mine[0].ok, true);
  });

  test("فرمانِ شکست‌خورده: FAIL اعلام می‌شود، نه OK", async () => {
    const before = steps.length;
    term.run("cmd /c exit 1", "fail1");
    await waitFor(() => steps.some((s) => s.id === "fail1"), 25000, "پایانِ fail1");
    await new Promise((r) => setTimeout(r, 1500));

    const mine = steps.slice(before).filter((s) => s.id === "fail1");
    assert.equal(mine.length, 1, "باید فقط یک خبر بدهد");
    assert.equal(mine[0].ok, false, "شکست باید شکست گزارش شود، نه موفقیت");
  });

  test("فرمانِ موفقی که روی stderr می‌نویسد، شکست حساب نمی‌شود", async () => {
    // رگرسیونِ باگی که در آزمایشِ ۱۷ تکنولوژی پیدا شد: در پاورشل، `$?` برای
    // فرمانِ بیرونی که روی stderr بنویسد `false` می‌شود، حتی با کدِ خروجِ صفر.
    // pnpm نوارِ پیشرفتش را روی stderr می‌نویسد، پس نصبِ **موفق** «شکست»
    // گزارش می‌شد. حالا کدِ خروج معیار است.
    term.run('cmd /c "echo روی-خطا 1>&2 & exit 0"', "stderrok");
    await waitFor(() => steps.some((s) => s.id === "stderrok"), 25000, "پایانِ stderrok");
    assert.equal(
      steps.find((s) => s.id === "stderrok").ok,
      true,
      "کدِ خروج صفر بوده، پس باید موفق باشد — نوشتن روی stderr شکست نیست",
    );
  });

  test("cmdletِ شکست‌خورده هم شکست حساب می‌شود", async () => {
    // طرفِ دیگرِ همان تفکیک: cmdlet کدِ خروج ندارد، پس معیارش `$?` است.
    term.run("Get-Item 'C:\\این-فایل-وجود-ندارد-۹۹۹' -ErrorAction Stop", "cmdletfail");
    await waitFor(() => steps.some((s) => s.id === "cmdletfail"), 25000, "پایانِ cmdletfail");
    assert.equal(steps.find((s) => s.id === "cmdletfail").ok, false);
  });

  test("cmdletِ موفق درست تشخیص داده می‌شود", async () => {
    term.run("Get-Location", "cmdletok");
    await waitFor(() => steps.some((s) => s.id === "cmdletok"), 25000, "پایانِ cmdletok");
    assert.equal(steps.find((s) => s.id === "cmdletok").ok, true);
  });

  test("فرمانِ ناموجود هم شکست حساب می‌شود", async () => {
    term.run("این-فرمان-وجود-ندارد-۱۲۳", "fail2");
    await waitFor(() => steps.some((s) => s.id === "fail2"), 25000, "پایانِ fail2");
    assert.equal(steps.find((s) => s.id === "fail2").ok, false);
  });

  test("فرمانِ پرخروجی: همه‌اش می‌آید و نشانه گم نمی‌شود", async () => {
    const before = output.length;
    term.run("1..300 | ForEach-Object { \"خط شمارهٔ $_\" }", "bulk1");
    await waitFor(() => steps.some((s) => s.id === "bulk1"), 30000, "پایانِ bulk1");

    assert.equal(steps.find((s) => s.id === "bulk1").ok, true);
    const chunk = output.slice(before);
    assert.ok(chunk.includes("خط شمارهٔ 300"), "خروجیِ کامل نیامد");
    assert.ok(!chunk.includes("##STEP"), "نشانه در حجمِ زیاد نشت کرد");
  });

  test("فرمانِ کند: خبرِ پایان دیر می‌آید ولی می‌آید", async () => {
    const started = Date.now();
    term.run("Start-Sleep -Milliseconds 2500", "slow1");

    // بلافاصله بعدِ فرستادن، باید معلق باشد
    assert.ok(term.pendingSteps().includes("slow1"), "باید معلق ثبت شود");

    await waitFor(() => steps.some((s) => s.id === "slow1"), 30000, "پایانِ slow1");
    assert.equal(steps.find((s) => s.id === "slow1").ok, true);
    assert.ok(Date.now() - started >= 2000, "زودتر از موعد اعلامِ پایان کرد");
  });

  test("چند فرمانِ پشتِ‌سرهم، هر کدام خبرِ خودش را می‌دهد", async () => {
    term.run('Write-Host "یک"', "m1");
    term.run('Write-Host "دو"', "m2");
    term.run('Write-Host "سه"', "m3");
    await waitFor(() => ["m1", "m2", "m3"].every((id) => steps.some((s) => s.id === id)), 30000, "سه مرحله");

    for (const id of ["m1", "m2", "m3"]) {
      assert.equal(steps.find((s) => s.id === id).ok, true, `${id} باید موفق باشد`);
    }
    assert.deepEqual(term.pendingSteps(), []);
  });

  test("ورودیِ خامِ کاربر هم کار می‌کند (ترمینالِ واقعی، نه فقط اجراکنندهٔ فرمان)", async () => {
    const before = output.length;
    term.write('Write-Host "تایپِ دستی"\r');
    await waitFor(() => output.slice(before).includes("تایپِ دستی"), 25000, "پژواکِ ورودی");
  });

  test("شناسهٔ نامعتبر رد می‌شود و فرمان اجرا نمی‌شود", () => {
    assert.throws(() => term.run("Write-Host hi", 'bad; rm -rf "'), /نامعتبر/);
  });
});

describe("ترمینال — پایان و پاک‌سازی", { skip: SHELL ? false : "پاورشل نیست" }, () => {
  test("با مردنِ پوسته، مرحلهٔ معلق شکست‌خورده اعلام می‌شود، نه معلقِ ابدی", async () => {
    const steps = [];
    const term = makeTerminal();
    term.onStepResult((r) => steps.push(r));
    term.ensure();

    // فرمانی که تا مدت‌ها تمام نمی‌شود، پس مرحله معلق می‌ماند.
    term.run("Start-Sleep -Seconds 60", "willDie");
    await waitFor(() => term.pendingSteps().includes("willDie"), 10000, "ثبتِ معلق");

    // پوسته را می‌کُشیم (فرستادنِ «exit» فایده ندارد: پاورشل مشغولِ خواب است و
    // ورودی را تا پایانِ خواب نمی‌خواند).
    assert.ok(term.killShell(), "کشتنِ پوسته باید موفق شود");

    await waitFor(() => steps.some((s) => s.id === "willDie"), 25000, "اعلامِ شکستِ معلق");
    const dead = steps.find((s) => s.id === "willDie");
    assert.equal(dead.ok, false, "مرحلهٔ معلق باید شکست‌خورده اعلام شود");
    assert.ok(dead.reason, "باید دلیلش را بگوید");
    assert.equal(term.isAlive(), false);
    term.dispose();
  });

  test("بعدِ مردنِ پوسته، ترمینال از نو راه می‌افتد", async () => {
    const term = makeTerminal();
    let out = "";
    term.onData((d) => { out += d; });
    term.ensure();
    term.killShell();
    await waitFor(() => !term.isAlive(), 15000, "مردنِ پوسته");

    // ensure باید پوستهٔ تازه بسازد
    const steps = [];
    term.onStepResult((r) => steps.push(r));
    term.run('Write-Host "زندهٔ دوباره"', "reborn");
    await waitFor(() => steps.some((s) => s.id === "reborn"), 25000, "فرمان روی پوستهٔ تازه");

    assert.equal(steps.find((s) => s.id === "reborn").ok, true);
    assert.ok(out.includes("زندهٔ دوباره"));
    term.dispose();
  });

  test("dispose ترمینال را می‌بندد و دوباره‌فراخوانی‌اش خطا نمی‌دهد", () => {
    const term = makeTerminal();
    term.ensure();
    assert.ok(term.isAlive());
    term.dispose();
    assert.equal(term.isAlive(), false);
    term.dispose(); // نباید بترکد
  });
});
