#!/usr/bin/env node
/**
 * رابطِ خط‌فرمانِ PackageBuilder.
 *
 * این فایل عمداً نازک است: هیچ منطقی ندارد و فقط ورودی را می‌خواند و خروجیِ
 * هسته را چاپ می‌کند. UIِ قدم‌های بعدی هم از همان هسته استفاده می‌کند، نه از این.
 *
 * چرا پیام‌ها انگلیسی‌اند: ترمینال‌های ویندوز (هم Windows Terminal و هم کنسولِ
 * قدیمی) متنِ راست‌به‌چپ را برعکس می‌چینند — آزمایش شد و هیچ‌کدام خوانا نبود.
 * پس *پیام‌های خودِ این فایل* انگلیسی‌اند. رابطِ کاربری در مرورگر کاملاً فارسی
 * است و دست نخورده. جمله‌های «مدرک» که از هسته می‌آیند هم فارسی می‌مانند، چون
 * همان‌ها را صفحهٔ مرورگر نشان می‌دهد و انگلیسی‌کردنشان آن صفحه را خراب می‌کند.
 */

import { scaffoldProject } from "./core/scaffold.mjs";
import { probeProject, PRESENT, ABSENT, UNKNOWN } from "./core/detect.mjs";
import { validateRegistry } from "./core/registry.mjs";
import { resolveRegistry } from "./core/resolve.mjs";
import { applyTechnology, revertTechnology } from "./core/apply.mjs";
import { startServer, DEFAULT_PORT } from "./server/server.mjs";

const USAGE = `
PackageBuilder - build a new project on a technology-neutral skeleton

  Usage:
    node src/cli.mjs new    <folder> [options]     create a new project
    node src/cli.mjs probe  <folder>               real status, read-only
    node src/cli.mjs stack  <folder>               decisions and their options
    node src/cli.mjs apply  <folder> --tech <id>   apply one decision
    node src/cli.mjs revert <folder> --tech <id>   undo one decision
    node src/cli.mjs serve  [--port <number>]      the same report, in a browser

  Options for new:
    --name "<display name>"  default: the name of the folder itself
    --slug <slug>            default: derived from the folder name
    --dry-run                say what would be created, create nothing
    --no-git                 do not start a git repository

  Examples:
    node src/cli.mjs new ./my-app --name "My App"
    node src/cli.mjs new ./my-app --dry-run
    node src/cli.mjs probe .
    node src/cli.mjs probe ./my-app

  Paths may be relative or absolute. This tool depends on no particular
  folder or project, and works from anywhere on any path.
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command, targetPath: "", name: "", slug: "", tech: "", dryRun: false, initGit: true, port: 0 };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--no-git") opts.initGit = false;
    else if (arg === "--name") opts.name = rest[++i] ?? "";
    else if (arg === "--slug") opts.slug = rest[++i] ?? "";
    else if (arg === "--tech") opts.tech = rest[++i] ?? "";
    else if (arg === "--port") {
      const raw = rest[++i] ?? "";
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return { error: `invalid port: ${raw}` };
      opts.port = n;
    }
    else if (arg.startsWith("--")) return { error: `unknown option: ${arg}` };
    else if (!opts.targetPath) opts.targetPath = arg;
    else return { error: `extra path: ${arg}` };
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.error) {
    console.error(`\n✗ ${opts.error}`);
    console.error(USAGE);
    process.exit(2);
  }
  if (!opts.command || opts.command === "help" || opts.command === "--help") {
    console.log(USAGE);
    process.exit(0);
  }
  if (!["new", "probe", "stack", "apply", "revert", "serve"].includes(opts.command)) {
    console.error(`\n✗ unknown command: ${opts.command}`);
    console.error(USAGE);
    process.exit(2);
  }

  if (opts.command === "serve") return runServe(opts.port);

  if (!opts.targetPath) {
    console.error("\n✗ give me a folder path.");
    console.error(USAGE);
    process.exit(2);
  }

  if (opts.command === "probe") return runProbe(opts.targetPath);
  if (opts.command === "stack") return runStack(opts.targetPath);
  if (opts.command === "apply" || opts.command === "revert") {
    if (!opts.tech) {
      console.error("\n✗ name the technology with --tech. To see the list: stack\n");
      process.exit(2);
    }
    return runApplyOrRevert(opts);
  }

  const result = scaffoldProject({
    targetPath: opts.targetPath,
    slug: opts.slug || undefined,
    displayName: opts.name || undefined,
    dryRun: opts.dryRun,
    initGit: opts.initGit,
  });

  if (!result.ok) {
    console.error(`\n✗ ${result.error}\n`);
    process.exit(1);
  }

  const head = result.dryRun ? "dry run (nothing was written)" : "created";
  console.log(`\n✓ ${head}`);
  console.log(`  path:         ${result.targetPath}`);
  console.log(`  display name: ${result.displayName}`);
  console.log(`  slug:         ${result.slug}`);
  console.log(`\n  ${result.files.length} files:`);
  for (const f of result.files) console.log(`    ${result.dryRun ? "+" : "✓"} ${f}`);

  if (!result.dryRun) {
    if (result.git.committed) console.log(`\n  git: started, base commit made`);
    else if (result.git.initialized) console.log(`\n  git: started but not committed - ${result.git.error}`);
    else if (result.git.error) console.log(`\n  git: did not start - ${result.git.error}`);
  }

  console.log(
    `\n  Next: no technology has been chosen yet.` +
      `\n  See the open decisions in docs/decisions/0001-open-decisions.md\n`,
  );
}

/**
 * گزارشِ وضعیت. سه حالت سه علامتِ متفاوت دارند — «نامعلوم» عمداً شبیهِ «نیست»
 * نیست، چون معنایش کاملاً متفاوت است.
 */
function runProbe(targetPath) {
  const p = probeProject(targetPath);

  if (!p.exists || !p.isDirectory) {
    console.error(`\n✗ ${p.error}: ${p.path}\n`);
    process.exit(1);
  }

  const mark = (s) => (s === PRESENT ? "✓" : s === ABSENT ? "✗" : "?");
  const line = (label, res) => console.log(`  ${mark(res.state)} ${label.padEnd(24)} ${res.evidence}`);

  console.log(`\nReal status of: ${p.path}`);
  console.log(`(✓ present   ✗ absent   ? unknown - meaning we could not ask)\n`);

  line("PackageBuilder skeleton", p.scaffolded);
  line("git repository", p.git);
  line("Node runtime", p.nodeRuntime);
  line("package manager", p.packageManager);
  line("monorepo tool", p.monorepo);

  if (p.apps.length) {
    console.log(`\n  apps:`);
    for (const app of p.apps) {
      const parts = [];
      if (app.nodeDeps) parts.push(`node_modules: ${mark(app.nodeDeps.state)}`);
      if (app.pythonEnv) parts.push(`python env: ${mark(app.pythonEnv.state)}`);
      const detail = parts.length ? ` - ${parts.join(", ")}` : "";
      console.log(`    • ${app.name} (${app.kind})${detail}`);
    }
  }

  console.log(`\n  Docker:`);
  if (!p.docker.file) {
    console.log(`    ✗ no compose file found, so Docker was not asked`);
  } else {
    console.log(`    file: ${p.docker.file}`);
    console.log(`    Docker project name: ${p.docker.projectName || "(not set)"}`);
    if (!p.docker.projectName) {
      console.log(`    ⚠ without name:, the scope comes from the folder name and copies collide`);
    }
    for (const [name, res] of Object.entries(p.docker.services)) line(`  ${name}`, res);
  }

  if (p.declared?.stack) {
    const chosen = Object.entries(p.declared.stack).filter(([, v]) => v !== null);
    console.log(`\n  declared decisions (intent, not reality): ${chosen.length ? "" : "none"}`);
    for (const [k, v] of chosen) console.log(`    ${k} = ${v}`);
  }

  if (p.mismatches.length) {
    console.log(`\n  ⚠ what is declared does not match reality:`);
    for (const m of p.mismatches) {
      const flag = m.severity === "conflict" ? "✗" : "?";
      console.log(`    ${flag} ${m.field}: declared "${m.declared}" - reality: ${m.reality}`);
    }
  }

  console.log("");
}

/**
 * تصمیم‌ها و گزینه‌هایشان، با وضعیتِ واقعیِ هر گزینه.
 * هیچ چیزی را عوض نمی‌کند — فقط نشان می‌دهد.
 */
function runStack(targetPath) {
  const probe = probeProject(targetPath);
  if (!probe.exists || !probe.isDirectory) {
    console.error(`\n✗ ${probe.error}: ${probe.path}\n`);
    process.exit(1);
  }

  const problems = validateRegistry();
  if (problems.length) {
    console.error(`\n✗ the registry itself is broken:`);
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }

  const out = resolveRegistry(probe.path, { probe });
  const mark = (s) => (s === PRESENT ? "✓" : s === ABSENT ? "✗" : "?");

  console.log(`\nProject decisions: ${probe.path}`);
  console.log(`(✓ installed   ✗ not installed   ? unknown)\n`);

  for (const cat of out.categories) {
    let headline;
    if (cat.conflict) headline = `⚠ conflict: ${cat.conflict.join(" and ")} are both installed`;
    else if (cat.chosen) headline = `✓ ${cat.options.find((o) => o.id === cat.chosen).label}`;
    else if (cat.uncertain) headline = "? unknown";
    else headline = "- not decided";

    console.log(`${cat.label}  ->  ${headline}`);
    for (const opt of cat.options) {
      const flags = [];
      if (opt.missingRequirements.length) flags.push(`needs: ${opt.missingRequirements.join(", ")}`);
      if (!opt.verified) flags.push("install not proven yet");
      const suffix = flags.length ? `  [${flags.join(" | ")}]` : "";
      console.log(`    ${mark(opt.state)} ${opt.label.padEnd(34)} ${opt.evidence}${suffix}`);
    }
    console.log("");
  }

  if (out.conflicts.length) {
    console.log(`⚠ ${out.conflicts.length} conflict(s) found. Only one option per category may be installed.\n`);
  }
  if (out.unverified.length) {
    console.log(
      `Note: the install commands of ${out.unverified.length} technolog(ies) have never really been run and proven. ` +
        `Until then they carry the "install not proven yet" mark.\n`,
    );
  }
}

/**
 * اعمال یا برگشتِ یک تصمیم، با ترمینالِ واقعی.
 *
 * فرمان‌ها در یک پاورشلِ واقعی اجرا می‌شوند و خروجی‌شان زنده چاپ می‌شود —
 * همان قاعدهٔ «هیچ چیزی پنهان اجرا نشود»، این‌بار در خط‌فرمان.
 */
async function runApplyOrRevert(opts) {
  const { createTerminal } = await import("./server/terminal.mjs");
  const pty = (await import("node-pty")).default;

  const terminal = createTerminal({ pty, cwd: opts.targetPath });
  terminal.ensure();

  // خروجی را **بعد** از گرم‌شدن وصل می‌کنیم: پرامپتِ اولیه و خطِ آماده‌سازیِ
  // __pbEnd کارِ داخلیِ ابزارند و چاپشان فقط شلوغی است. از این لحظه به بعد،
  // هر چه در ترمینال بیفتد عیناً دیده می‌شود.
  await new Promise((r) => setTimeout(r, 900));
  terminal.onData((chunk) => process.stdout.write(chunk));

  const isApply = opts.command === "apply";
  console.log(`\n${isApply ? "▶ applying" : "◀ reverting"} "${opts.tech}" on ${opts.targetPath}\n`);

  let result;
  try {
    result = isApply
      ? await applyTechnology({ projectPath: opts.targetPath, techId: opts.tech, terminal, dryRun: opts.dryRun })
      : await revertTechnology({ projectPath: opts.targetPath, techId: opts.tech, terminal });
  } finally {
    // کمی صبر تا آخرین خروجیِ ترمینال برسد، بعد ببند
    await new Promise((r) => setTimeout(r, 400));
    terminal.dispose();
  }

  console.log("\n" + "─".repeat(60));
  if (!result.ok) {
    console.error(`✗ ${result.error}`);
    if (result.snippet) console.error(`\nAdd this piece by hand:\n${result.snippet}`);
    if (result.needs) console.error(`\nInstall these first: ${result.needs.join(", ")}`);
    console.error("");
    process.exit(1);
  }

  if (result.dryRun) {
    console.log(`✓ dry run - nothing was done. The plan:`);
    for (const step of result.planned) {
      if (step.kind === "cli") console.log(`  • command: ${step.command}`);
      else if (step.kind === "env") console.log(`  • env variables: ${step.vars.join(", ")}`);
      else if (step.kind === "composeService") console.log(`  • Docker service: ${step.service}`);
      else if (step.kind === "file") console.log(`  • file: ${step.path}`);
    }
    console.log("");
    process.exit(0);
  }

  if (result.alreadyPresent) {
    console.log(`✓ "${opts.tech}" is already installed - ${result.evidence}\n`);
    return;
  }

  console.log(`${isApply ? "✓ applied" : "✓ reverted"}: ${result.label}`);
  if (result.decisionDoc) console.log(`  decision doc: ${result.decisionDoc}`);
  if (result.git?.ok) console.log(`  commit: ${result.git.sha?.slice(0, 8)}`);
  else if (result.git?.error) console.log(`  not committed: ${result.git.error}`);

  // مهم‌ترین خط: وضعیتِ **واقعی**، نه ادعا
  const mark = result.state === PRESENT ? "✓" : result.state === ABSENT ? "✗" : "?";
  console.log(`\n  real status right now: ${mark} ${result.evidence}`);
  if (isApply && !result.verified) {
    console.log(`  Note: the commands ran, but no evidence of an install was seen - read the output above.`);
  }
  if (result.manualSteps?.length) {
    console.log(`\n  what was not done automatically:`);
    for (const s of result.manualSteps) console.log(`  • ${s}`);
  }
  console.log("");

  // PTY حلقهٔ رویداد را زنده نگه می‌دارد، پس پروسه خودش بیرون نمی‌آید.
  // برای یک دستورِ خط‌فرمان که کارش تمام شده، خروجِ صریح درست است.
  process.exit(0);
}

/** سرورِ رابطِ کاربری. فقط-خواندنی و فقط روی 127.0.0.1. */
async function runServe(port) {
  try {
    const { url, terminal } = await startServer({ port: port || DEFAULT_PORT });
    console.log(`\n✓ UI is up: ${url}`);
    console.log(`  Terminal: ${terminal.shell() || "detecting..."}`);
    console.log(`  Bound to 127.0.0.1 only, gated by this page's token - not reachable from outside.`);
    console.log(`  To stop: Ctrl+C, or run stop-server.bat\n`);
  } catch (err) {
    if (err.code === "EADDRINUSE") {
      console.error(`\n✗ Port ${port || DEFAULT_PORT} is busy. Pass another one with --port.\n`);
    } else {
      console.error(`\n✗ Server did not start: ${err.message}\n`);
    }
    process.exit(1);
  }
}

main();
