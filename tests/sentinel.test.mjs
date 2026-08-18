/**
 * تست‌های تجزیه‌گرِ سنتینل.
 *
 * این فایل عمداً سخت‌گیرترین تستِ پروژه است، چون باگی که اینجا بنشیند خودش را
 * به‌صورتِ «صفحه برای همیشه روی در-حالِ-اجرا گیر کرد» نشان می‌دهد — یعنی
 * دیربازترین و گیج‌کننده‌ترین نوعِ خرابی.
 *
 * محورِ اصلی: خروجیِ ترمینال تکه‌تکه می‌رسد و مرزِ تکه‌ها تصادفی است. پس هر
 * تست باید در چند حالتِ تکه‌بندی امتحان شود، از جمله حرف‌به‌حرف.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  createSentinelParser, couldStartSentinel, withSentinel, MAX_SENTINEL_LENGTH, SETUP_COMMAND,
} from "../src/server/sentinel.mjs";

/** متن را با اندازهٔ تکهٔ دلخواه به تجزیه‌گر می‌دهد و خروجیِ نمایشی را جمع می‌کند. */
function feed(text, chunkSize) {
  const results = [];
  const parser = createSentinelParser((r) => results.push(r));
  let shown = "";
  for (let i = 0; i < text.length; i += chunkSize) {
    shown += parser.push(text.slice(i, i + chunkSize));
  }
  shown += parser.flush();
  return { shown, results };
}

/** همان متن، با هر تکه‌بندیِ ممکن — از حرف‌به‌حرف تا یک‌جا. */
function feedAllWays(text) {
  const sizes = [1, 2, 3, 5, 7, 13, 50, text.length || 1];
  return sizes.map((size) => ({ size, ...feed(text, size) }));
}

describe("couldStartSentinel", () => {
  test("پیشوندهای در حالِ ساخت را نگه می‌دارد", () => {
    for (const s of ["#", "##", "##S", "##ST", "##STEP", "##STEP_", "##STEP_O", "##STEP_OK:", "##STEP_FAIL:"]) {
      assert.ok(couldStartSentinel(s), `«${s}» باید نگه داشته شود`);
    }
  });

  test("شناسهٔ نیمه‌کاره و «#» پایانیِ نیمه را نگه می‌دارد", () => {
    assert.ok(couldStartSentinel("##STEP_OK:ab"));
    assert.ok(couldStartSentinel("##STEP_OK:ab#"));
    assert.ok(couldStartSentinel("##STEP_FAIL:x1_y-2"));
  });

  test("چیزی که قطعاً نشانه نیست را نگه نمی‌دارد", () => {
    for (const s of ["", "x", "#x", "##X", "##STEP-OK:", "##STEP_OK:ab!", "##STEP_MAYBE:"]) {
      assert.ok(!couldStartSentinel(s), `«${s}» نباید نگه داشته شود`);
    }
  });

  test("رشتهٔ بی‌اندازه بلند را نگه نمی‌دارد (جلوگیری از رشدِ بی‌مرزِ بافر)", () => {
    assert.ok(!couldStartSentinel("##STEP_OK:" + "a".repeat(200)));
  });
});

describe("تجزیه‌گر — حالتِ ساده", () => {
  test("نشانه در یک تکه: خبر می‌دهد و از نمایش حذف می‌کند", () => {
    const { shown, results } = feed("سلام\r\n##STEP_OK:abc##\r\n", 1000);
    assert.deepEqual(results, [{ id: "abc", ok: true }]);
    assert.equal(shown, "سلام\r\n\r\n");
    assert.ok(!shown.includes("STEP_OK"));
  });

  test("FAIL هم درست تشخیص داده می‌شود", () => {
    const { results } = feed("##STEP_FAIL:xyz##", 1000);
    assert.deepEqual(results, [{ id: "xyz", ok: false }]);
  });

  test("خروجیِ بی‌نشانه دست‌نخورده رد می‌شود", () => {
    const text = "خطِ اول\r\nخطِ دوم\r\n";
    for (const { shown, results, size } of feedAllWays(text)) {
      assert.equal(shown, text, `تکهٔ ${size}`);
      assert.deepEqual(results, [], `تکهٔ ${size}`);
    }
  });
});

describe("تجزیه‌گر — همان باگی که نسخهٔ قبلی داشت", () => {
  test("نشانهٔ شکسته بینِ دو تکه، باز هم دیده می‌شود", () => {
    const results = [];
    const parser = createSentinelParser((r) => results.push(r));
    let shown = parser.push("کارها تمام شد\r\n##STEP_");
    assert.deepEqual(results, [], "هنوز نباید خبری بدهد");
    assert.ok(!shown.includes("##"), "نیمهٔ نشانه نباید نمایش داده شود");

    shown += parser.push("OK:step1##\r\n");
    assert.deepEqual(results, [{ id: "step1", ok: true }]);
    assert.ok(!shown.includes("STEP_OK"));
  });

  test("نشانه، حرف‌به‌حرف — بدترین حالتِ ممکن", () => {
    const { shown, results } = feed("پیش\r\n##STEP_OK:slow##\r\nپس", 1);
    assert.deepEqual(results, [{ id: "slow", ok: true }]);
    assert.equal(shown, "پیش\r\n\r\nپس");
  });

  test("در هر تکه‌بندیِ ممکن، نتیجه یکسان است", () => {
    const text = "خروجیِ فرمان\r\n##STEP_OK:same##\r\nادامه\r\n";
    const expectedShown = "خروجیِ فرمان\r\n\r\nادامه\r\n";
    for (const { shown, results, size } of feedAllWays(text)) {
      assert.deepEqual(results, [{ id: "same", ok: true }], `تکهٔ ${size}`);
      assert.equal(shown, expectedShown, `تکهٔ ${size}`);
    }
  });

  test("چند نشانه در یک جریان، به ترتیب", () => {
    const text = "a\r\n##STEP_OK:one##\r\nb\r\n##STEP_FAIL:two##\r\nc";
    for (const { results, shown, size } of feedAllWays(text)) {
      assert.deepEqual(results, [{ id: "one", ok: true }, { id: "two", ok: false }], `تکهٔ ${size}`);
      assert.equal(shown, "a\r\n\r\nb\r\n\r\nc", `تکهٔ ${size}`);
      assert.ok(!shown.includes("STEP_"), `تکهٔ ${size}`);
    }
  });

  test("دو نشانهٔ چسبیده به هم", () => {
    const { results } = feed("##STEP_OK:a####STEP_OK:b##", 1);
    assert.deepEqual(results, [{ id: "a", ok: true }, { id: "b", ok: true }]);
  });
});

describe("تجزیه‌گر — متنی که شبیهِ نشانه است ولی نیست", () => {
  test("«##» معمولی در خروجی، بالاخره نمایش داده می‌شود", () => {
    // مثلاً یک نوارِ پیشرفت یا کامنتِ مارک‌داون. نباید ابدی نگه داشته شود.
    const { shown } = feed("progress ## done\r\n", 1000);
    assert.equal(shown, "progress ## done\r\n");
  });

  test("چیزی که با ##STEP_ شروع می‌شود ولی هرگز تمام نمی‌شود، با flush رها می‌شود", () => {
    const parser = createSentinelParser();
    const shown = parser.push("خروجی\r\n##STEP_OK:never");
    assert.equal(shown, "خروجی\r\n");
    assert.equal(parser.pending(), "##STEP_OK:never", "باید منتظر بماند");
    assert.equal(parser.flush(), "##STEP_OK:never", "flush باید رهایش کند");
    assert.equal(parser.pending(), "");
  });

  test("شناسهٔ نامعتبر نشانه حساب نمی‌شود و متن سالم می‌ماند", () => {
    const text = "##STEP_OK:بد شناسه##\r\n";
    const { shown, results } = feed(text, 1000);
    assert.deepEqual(results, []);
    assert.equal(shown, text);
  });

  test("«#» تنها در انتهای جریان گم نمی‌شود", () => {
    const parser = createSentinelParser();
    let shown = parser.push("قیمت: #");
    shown += parser.flush();
    assert.equal(shown, "قیمت: #");
  });
});

describe("تجزیه‌گر — مقاومت", () => {
  test("خروجیِ حجیم، بافر را متورم نمی‌کند", () => {
    const parser = createSentinelParser();
    for (let i = 0; i < 500; i++) parser.push("x".repeat(1000) + "\r\n");
    assert.equal(parser.pending().length, 0, "بافر باید خالی بماند");
  });

  test("بافرِ نگه‌داشته‌شده هرگز از بلندترین نشانهٔ ممکن بیشتر نمی‌شود", () => {
    const parser = createSentinelParser();
    parser.push("متن ##STEP_OK:" + "a".repeat(500));
    assert.ok(
      parser.pending().length <= MAX_SENTINEL_LENGTH,
      `بافر ${parser.pending().length} حرف شد، بیشتر از سقفِ ${MAX_SENTINEL_LENGTH}`,
    );
  });

  test("هیچ نشانه‌ای در خروجیِ نمایشی نشت نمی‌کند", () => {
    const text = Array.from({ length: 20 }, (_, i) => `خط ${i}\r\n##STEP_OK:s${i}##\r\n`).join("");
    for (const { shown, results, size } of feedAllWays(text)) {
      assert.equal(results.length, 20, `تکهٔ ${size}`);
      assert.ok(!shown.includes("##STEP"), `تکهٔ ${size}: نشانه نشت کرد`);
    }
  });
});

describe("withSentinel", () => {
  test("همه در یک خط می‌ماند، بدونِ خطِ جدید", () => {
    const cmd = withSentinel("pnpm install", "abc123");
    assert.ok(!cmd.includes("\n"), "نباید خطِ جدید بسازد");
    assert.ok(cmd.includes("pnpm install"), "خودِ فرمان باید داخلش باشد");
    assert.ok(cmd.includes("__pbEnd abc123"), "اعلامِ پایان باید شناسه را داشته باشد");
  });

  test("هر دو معیارِ موفقیت فرستاده می‌شوند — نه فقط $?", () => {
    // `$?` برای فرمانِ بیرونی‌ای که روی stderr می‌نویسد دروغ می‌گوید (مثلِ pnpm
    // که نوارِ پیشرفتش را روی stderr می‌نویسد). پس کدِ خروج هم فرستاده می‌شود
    // و __pbEnd تفکیک می‌کند که فرمان بیرونی بوده یا cmdlet.
    const cmd = withSentinel("pnpm add x", "id1");
    assert.ok(cmd.includes("$?"), "معیارِ cmdlet");
    assert.ok(cmd.includes("$LASTEXITCODE"), "معیارِ فرمانِ بیرونی");
    assert.match(cmd, /LASTEXITCODE = 999/, "عددِ نشانه باید قبلِ اجرا ست شود");
  });

  test("خطای قطع‌کننده هم خبرِ شکست می‌دهد — سکوت نمی‌کند", () => {
    // بدونِ try/catch، خطای terminating بقیهٔ خط را رد می‌کرد و سنتینل هرگز
    // اجرا نمی‌شد؛ نتیجه‌اش گیرکردنِ ابدیِ وضعیت بود.
    const cmd = withSentinel("Get-Item nope -ErrorAction Stop", "id2");
    assert.ok(cmd.includes("try {"), "باید داخلِ try باشد");
    assert.match(cmd, /catch \{ __pbEnd id2 \$false 1 \}/, "شاخهٔ catch باید شکست را اعلام کند");
  });

  test("تابعِ آماده‌سازی، نشانه را در زمانِ اجرا سرِهم می‌کند", () => {
    assert.ok(!SETUP_COMMAND.includes("##"), "خودِ خطِ آماده‌سازی هم نباید «##» داشته باشد");
    assert.ok(SETUP_COMMAND.includes("__pbEnd"));
    assert.ok(!SETUP_COMMAND.includes("\n"), "باید یک خط باشد");
  });

  test("خطِ آماده‌سازی هیچ خبرِ جعلی تولید نمی‌کند — در هر تکه‌بندی", () => {
    for (const { results, size } of feedAllWays(SETUP_COMMAND + "\r\n")) {
      assert.deepEqual(results, [], `تکهٔ ${size}: خطِ آماده‌سازی خبرِ جعلی داد`);
    }
  });

  test("خروجی‌اش با تجزیه‌گر جور است — چرخهٔ کامل", () => {
    const cmd = withSentinel("echo hi", "roundtrip");
    // شبیه‌سازیِ اینکه پاورشل شاخهٔ موفق را چاپ کند
    const fakeOutput = `hi\r\n##STEP_OK:roundtrip##\r\n`;
    const { results, shown } = feed(fakeOutput, 1);
    assert.deepEqual(results, [{ id: "roundtrip", ok: true }]);
    assert.equal(shown, "hi\r\n\r\n");
    assert.ok(cmd.includes("roundtrip"));
  });

  // ---------------------------------------------------------------------
  // رگرسیونِ باگی که در آزمایشِ زنده پیدا شد:
  //
  // پاورشلِ تعاملی خطِ فرمان را پژواک می‌کند. اگر نشانه عیناً در متنِ فرمان
  // باشد، تجزیه‌گر همان را در پژواک می‌بیند — قبل از اجرای فرمان. و چون
  // پژواک هر دو شاخه (OK و FAIL) را دارد، اولین خبر «موفق» است. یعنی
  // فرمانی که شکست خورده، موفق گزارش می‌شود.
  //
  // اندازه‌گیریِ واقعی قبل از اصلاح: سه خبر برای یک فرمان — true، false، true.
  // ---------------------------------------------------------------------
  test("متنِ خودِ فرمان نه «##» دارد و نه «STEP_»", () => {
    const cmd = withSentinel('Write-Host "hi"', "echo1");
    assert.ok(!cmd.includes("##"), `متنِ فرمان نباید «##» داشته باشد:\n${cmd}`);
    assert.ok(!cmd.includes("STEP_"), `متنِ فرمان نباید «STEP_» داشته باشد:\n${cmd}`);
  });

  test("پژواکِ فرمان هیچ خبری تولید نمی‌کند — در هر تکه‌بندی", () => {
    const cmd = withSentinel('Write-Host "سلام"', "echo2");
    // پاورشل خطِ فرمان را پژواک می‌کند، بعد نتیجه را چاپ می‌کند.
    for (const { results, size } of feedAllWays(cmd + "\r\n")) {
      assert.deepEqual(results, [], `تکهٔ ${size}: پژواک خبرِ جعلی داد`);
    }
  });

  test("پژواک + اجرا: فقط یک خبر، و همان خبرِ درست", () => {
    // شبیه‌سازیِ جریانِ کاملِ واقعی: پژواکِ فرمان، بعد خروجی، بعد نشانهٔ واقعی.
    const cmd = withSentinel("cmd /c exit 1", "real1");
    const stream = `${cmd}\r\n##STEP_FAIL:real1##\r\n`;
    for (const { results, size } of feedAllWays(stream)) {
      assert.deepEqual(results, [{ id: "real1", ok: false }], `تکهٔ ${size}`);
    }
  });

  test("شناسهٔ نامعتبر را رد می‌کند (تا نشود فرمان تزریق کرد)", () => {
    for (const bad of ["", "a b", 'x"; rm -rf /', "a;b", "#", "a".repeat(65)]) {
      assert.throws(() => withSentinel("echo hi", bad), /نامعتبر/, `«${bad}» باید رد شود`);
    }
  });
});
