/**
 * یک PowerShell واقعیِ همیشه‌زنده.
 *
 * قاعدهٔ ۲ (تصمیمِ ۰۰۰۱): هیچ چیزی پنهان اجرا نشود. پس یک ترمینالِ واقعی داریم
 * که همهٔ فرمان‌ها داخلِ همان اجرا می‌شوند و کاربر عیناً می‌بیند — با رنگ،
 * نوارِ پیشرفت، و خطای واقعی. لاگِ خلاصه‌شده یا شبیه‌سازی‌شده نداریم.
 *
 * چرا یکی و مشترک، نه یکی به‌ازای هر فرمان:
 * - وضعیت حفظ می‌شود (پوشهٔ جاری، متغیرها) — مثلِ یک ترمینالِ واقعی.
 * - کاربر می‌تواند خودش داخلش تایپ کند و ادامهٔ کارِ ابزار را ببیند.
 * - اگر چند تبِ مرورگر باز باشد، همه یک چیز می‌بینند، نه واقعیت‌های موازی.
 */

import { spawnSync } from "node:child_process";
import { createSentinelParser, withSentinel, SETUP_COMMAND } from "./sentinel.mjs";

/** پاورشلِ ۷ را ترجیح می‌دهیم؛ اگر نبود، پاورشلِ خودِ ویندوز. */
export function detectShell() {
  for (const candidate of ["pwsh.exe", "powershell.exe"]) {
    const res = spawnSync(candidate, ["-NoLogo", "-NoProfile", "-Command", "exit 0"], { timeout: 10000 });
    if (!res.error && res.status === 0) return candidate;
  }
  return null;
}

/**
 * @param {object} opts
 * @param {string} [opts.cwd]        پوشهٔ شروع
 * @param {string} [opts.shell]      اگر ندهی، خودش پیدا می‌کند
 * @param {object} [opts.pty]        برای تست قابلِ تزریق است
 * @param {number} [opts.stepTimeoutMs] سقفِ انتظار برای پایانِ یک مرحله
 * @param {boolean} [opts.useConpty] پایین را بخوان
 */
export function createTerminal({
  cwd = process.cwd(),
  shell,
  pty,
  stepTimeoutMs = 10 * 60 * 1000,
  // ---- چرا winpty و نه conpty ----
  // conpty backendِ مدرن‌ترِ ویندوز است، ولی روی این سیستم موقعِ بستنِ ترمینال
  // یک کمکی‌پروسه (conpty_console_list_agent) اجرا می‌کند که با
  // «Error: AttachConsole failed» می‌ترکد و خطای ترسناکِ بی‌ربط چاپ می‌شود.
  //
  // اندازه‌گیری شد: با winpty آن خطا نیست و رنگ‌های ANSI هم کامل می‌آیند.
  // پس پیش‌فرض winpty است. اگر روزی دقتِ بیشترِ conpty لازم شد (مثلاً برنامه‌های
  // تمام‌صفحه‌ای)، همین گزینه را true کن — ولی آن خطا برمی‌گردد.
  useConpty = false,
} = {}) {
  const dataSubs = new Set();
  const stepSubs = new Set();
  const exitSubs = new Set();
  /** @type {Map<string, { timer: NodeJS.Timeout, command: string }>} */
  const pending = new Map();

  let term = null;
  let parser = null;
  let flushTimer = null;
  let shellPath = shell;

  const emitData = (text) => { if (text) for (const cb of dataSubs) cb(text); };

  /**
   * دفاعِ دومِ برابرِ نشانهٔ جعلی: فقط خبرِ مرحله‌ای را می‌پذیریم که واقعاً
   * منتظرش هستیم. اگر متنی در خروجی تصادفاً شکلِ نشانه داشت (یا کاربر خودش
   * چنین چیزی چاپ کرد)، بی‌اثر رد می‌شود.
   *
   * تلهٔ اصلی — پژواکِ فرمان — در withSentinel حل شده؛ این لایه فقط برای
   * حالت‌های پیش‌بینی‌نشده است.
   */
  function emitStep(result) {
    const entry = pending.get(result.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(result.id);
    for (const cb of stepSubs) cb(result);
  }

  /**
   * اگر نیمهٔ یک نشانه نگه داشته شده و ادامه‌اش نیامد، بعدِ مکثِ کوتاهی رهایش
   * کن — وگرنه یک «#» بی‌گناه تهِ خروجی، نمایش را معطل نگه می‌دارد.
   */
  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => emitData(parser.flush()), 150);
  }

  function ensure() {
    if (term) return term;

    if (!shellPath) {
      shellPath = detectShell();
      if (!shellPath) throw new Error("پاورشل پیدا نشد (نه pwsh.exe، نه powershell.exe).");
    }

    parser = createSentinelParser(emitStep);
    term = pty.spawn(shellPath, ["-NoLogo"], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd,
      env: process.env,
      useConpty,
    });

    term.onData((chunk) => {
      emitData(parser.push(chunk));
      scheduleFlush();
    });

    // تابعِ اعلامِ پایان را یک‌بار تعریف می‌کنیم تا خطِ هر فرمان تمیز بماند.
    // این یک خط در آغاز پژواک می‌شود؛ بهایِ کوچکی است در برابرِ تمیزیِ همهٔ
    // فرمان‌های بعدی.
    term.write(SETUP_COMMAND + "\r");

    term.onExit(({ exitCode }) => {
      clearTimeout(flushTimer);
      emitData(parser.flush());
      emitData(`\r\n[ترمینال بسته شد — کدِ خروج ${exitCode}]\r\n`);
      // هر مرحلهٔ نیمه‌کاره باید صادقانه شکست‌خورده اعلام شود، نه معلق بماند.
      for (const id of [...pending.keys()]) emitStep({ id, ok: false, reason: "ترمینال بسته شد" });
      term = null;
      for (const cb of exitSubs) cb({ exitCode });
    });

    return term;
  }

  // به خودش ارجاع می‌دهیم تا runAndWait بتواند run و onStepResult را صدا بزند.
  const api = {
    ensure,
    isAlive: () => term !== null,
    shell: () => shellPath,
    pendingSteps: () => [...pending.keys()],

    onData(cb) { dataSubs.add(cb); return () => dataSubs.delete(cb); },
    onStepResult(cb) { stepSubs.add(cb); return () => stepSubs.delete(cb); },
    onExit(cb) { exitSubs.add(cb); return () => exitSubs.delete(cb); },

    /** ورودیِ خامِ کاربر — عیناً به ترمینال. */
    write(data) { ensure().write(data); },

    resize(cols, rows) {
      if (!term) return;
      if (!Number.isInteger(cols) || !Number.isInteger(rows)) return;
      if (cols < 2 || rows < 2 || cols > 1000 || rows > 1000) return;
      term.resize(cols, rows);
    },

    /**
     * اجرای فرمان و **انتظار** تا پایانش.
     *
     * موتورِ اعمال (قدمِ ۷) به این نیاز دارد: باید بداند فرمانِ قبلی تمام شد و
     * موفق بود، قبل از رفتن به فرمانِ بعدی.
     *
     * @returns {Promise<{ ok: boolean, id: string, reason?: string }>}
     */
    runAndWait(command, stepId) {
      const id = stepId || "w" + Math.random().toString(36).slice(2, 12);
      return new Promise((resolve) => {
        const off = api.onStepResult((r) => {
          if (r.id !== id) return;
          off();
          resolve(r);
        });
        try {
          api.run(command, id);
        } catch (err) {
          off();
          resolve({ ok: false, id, reason: err.message });
        }
      });
    },

    /**
     * اجرای فرمان با اعلامِ خودکارِ پایان.
     * @returns {string} همان stepId، تا بالادست منتظرش بماند.
     */
    run(command, stepId) {
      const t = ensure();
      const line = withSentinel(command, stepId); // خودش شناسه را اعتبارسنجی می‌کند
      const timer = setTimeout(() => {
        pending.delete(stepId);
        for (const cb of stepSubs) cb({ id: stepId, ok: false, reason: "زمان تمام شد" });
      }, stepTimeoutMs);
      // مهم: unref تا این تایمر مانعِ خروجِ پروسه نشود.
      timer.unref?.();
      pending.set(stepId, { timer, command });
      t.write(line + "\r");
      return stepId;
    },

    /**
     * پوسته را می‌کُشد ولی شنونده‌ها را نگه می‌دارد — پس مسیرِ onExit اجرا
     * می‌شود و همه (از جمله مرحله‌های معلق) خبردار می‌شوند.
     *
     * فرق با dispose: این «پوسته مرد» است، آن «دیگر کاری با این ترمینال ندارم».
     * برای دکمهٔ «ترمینال را از نو راه بینداز» همین لازم است، چون ensure بعدش
     * یک پوستهٔ تازه می‌سازد.
     */
    killShell() {
      if (!term) return false;
      try { term.kill(); } catch { /* از قبل مرده بود */ }
      return true;
    },

    dispose() {
      clearTimeout(flushTimer);
      for (const { timer } of pending.values()) clearTimeout(timer);
      pending.clear();
      dataSubs.clear();
      stepSubs.clear();
      exitSubs.clear();
      if (term) {
        try { term.kill(); } catch { /* از قبل مرده بود */ }
        term = null;
      }
    },
  };

  return api;
}
