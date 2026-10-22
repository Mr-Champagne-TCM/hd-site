#!/usr/bin/env node
/**
 * ONE COMMAND: the whole local end-to-end run, zero credits.
 *
 *   node tools/e2e/run.mjs                 build, drive every journey, check, report
 *   node tools/e2e/run.mjs --skip-build    reuse dist/ as it is
 *   node tools/e2e/run.mjs --only=rowan,theo
 *   node tools/e2e/run.mjs --engine=cache  no Java: answer charts from the recorded cache
 *   node tools/e2e/run.mjs --update-baseline   after a release: this run's words become the baseline
 *   node tools/e2e/run.mjs --checks-only=<run dir>   re-check and re-report an earlier run
 *
 * Writes <data home>/runs/<when>-<commit>/report.html and report.pdf.
 * Exit code 1 when any check fails, so it can gate a deploy.
 *
 * What it never does: deploy, push, call Stripe, Resend, Gemini or the live
 * engine, or write to anything live. See tools/e2e/README.md.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";
import { BASELINE, E2E, FIXTURES, HOME, REPO, RUNS, SIBLINGS } from "./harness/paths.mjs";

const arg = (name, dflt = null) => {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return dflt;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};
const say = (m) => process.stdout.write(m + "\n");
const t0 = Date.now();

const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8" }).stdout.trim() || "nogit";
const dirty = spawnSync("git", ["status", "--porcelain", "--", "src", "netlify", "shared", "public"], { cwd: REPO, encoding: "utf8" }).stdout.trim() ? "+dirty" : "";
const websiteSha = existsSync(SIBLINGS.website) ? spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: SIBLINGS.website, encoding: "utf8" }).stdout.trim() : null;

let runDir = arg("checks-only");
const fresh = !runDir;
if (fresh) {
  runDir = join(RUNS, new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "-" + sha + dirty);
  mkdirSync(runDir, { recursive: true });
}
say(`hd-e2e: run ${runDir}`);
say(`  data home ${HOME}${existsSync(FIXTURES) ? "" : "  (NO FIXTURES: readings will all be placeholders; see README)"}`);

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

async function startWebsite() {
  const vite = join(SIBLINGS.website, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(vite)) {
    say("  website: not found (no ../the-champagne-method with node_modules); website checks skipped");
    return null;
  }
  const port = await freePort();
  const child = spawn(process.execPath, [vite, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
    cwd: SIBLINGS.website,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  // Its own words, kept: a website that stops mid-run otherwise leaves only "connection refused".
  child.on("exit", (code, signal) => writeFileSync(join(runDir, "website.log"), `${out}\n[exit ${code ?? signal}]\n`));
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(origin + "/readings/");
      if (r.ok) break;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  say(`  website: ${origin} (its own Vite dev server, repo ${websiteSha ?? "?"})`);
  return {
    origin,
    stop: () =>
      new Promise((r) => {
        if (child.exitCode !== null) return r();
        child.once("exit", r);
        child.kill();
        setTimeout(r, 3000);
      }),
  };
}

function uvPython(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn("uv", ["run", "--quiet", "--with", "playwright", "--with", "pypdf", "--with", "pypdfium2", "--with", "pillow", "python", ...args], {
      cwd: REPO,
      env: { ...process.env, PYTHONUTF8: "1", ...env },
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    });
    child.on("exit", (code) => resolve(code));
  });
}

if (fresh) {
  if (!arg("skip-build")) {
    say("  building dist/ (npm run build)...");
    const b = spawnSync("npm run build", { cwd: REPO, encoding: "utf8", shell: true });
    writeFileSync(join(runDir, "build.log"), (b.stdout ?? "") + (b.stderr ?? ""));
    if (b.status !== 0) {
      say("  BUILD FAILED, see build.log");
      process.exit(2);
    }
  }
  const { startRig } = await import("./harness/server.mjs");
  const { seedLegacy } = await import("./harness/seed.mjs");
  const combos = JSON.parse(readFileSync(join(E2E, "combos.json"), "utf8"));
  // The journeys as they were for this run, so a later --checks-only judges it by them.
  writeFileSync(join(runDir, "combos.json"), JSON.stringify(combos, null, 1));
  const rig = await startRig({ runDir, fixturesDir: FIXTURES, engineMode: arg("engine", "local"), log: (m) => say("  " + m) });
  say(`  shop: ${rig.origin} (built dist/, functions in-process, fakes for Stripe / Resend / Gemini)`);
  const seeded = await seedLegacy({ combos, fixturesDir: FIXTURES, email: combos.buyerEmail });
  writeFileSync(join(runDir, "seeded.json"), JSON.stringify(seeded, null, 1));
  say(`  seeded ${seeded.length} pre-10/16 purchases for the my-charts inbox`);
  const site = arg("no-website") ? null : await startWebsite();
  const only = arg("only");
  say("  driving journeys (headless Chrome)...");
  let code = 1;
  try {
    code = await uvPython(
      [join(E2E, "drive", "drive.py"), runDir, rig.origin, ...(site ? [site.origin] : []), ...(only ? ["--only", only] : [])],
      { HD_WEBSITE_REPO: SIBLINGS.website },
    );
  } finally {
    writeFileSync(
      join(runDir, "rig.json"),
      JSON.stringify(
        {
          commit: sha + dirty,
          website: websiteSha,
          engine: rig.engine.version,
          engineCache: rig.cacheStats,
          blocked: rig.blocked,
          gemini: rig.gemini.asked,
          fixtures: rig.gemini.fixtures.map((f) => f.source),
          mails: rig.mail.sent.length,
          sessions: rig.stripe.sessions.size,
          stripeCalls: rig.stripe.calls,
        },
        null,
        1,
      ),
    );
    await site?.stop();
    await rig.stop();
  }
  if (code !== 0) say(`  driver exited ${code} (the report says which step)`);
}

/* ------------------------------------------------------------- checks ---- */
const { runChecks } = await import("./checks/index.mjs");
const results = await runChecks({ runDir, baselineDir: BASELINE });
// Every changed word must be one a fix on tools/e2e/fixlist.json meant to change.
const { regressCheck } = await import("./regress.mjs");
results.checks.push(regressCheck(results.diff));
writeFileSync(join(runDir, "results.json"), JSON.stringify(results, null, 1));

if (arg("update-baseline")) {
  const { saveBaseline } = await import("./checks/baseline.mjs");
  saveBaseline({ runDir, baselineDir: BASELINE, commit: sha + dirty });
  say(`  baseline saved from this run (${BASELINE})`);
}

/* ------------------------------------------------------------- report ---- */
const { writeReport } = await import("./report/report.mjs");
const html = writeReport({ runDir, results, seconds: Math.round((Date.now() - t0) / 1000) });
await uvPython([join(E2E, "report", "print.py"), html, join(runDir, "report.pdf")]);

const fails = results.checks.filter((c) => c.status === "fail");
say("");
say(`hd-e2e: ${results.checks.length} checks, ${fails.length} failing, ${results.checks.filter((c) => c.status === "pass").length} passing  (${Math.round((Date.now() - t0) / 1000)} s)`);
for (const f of fails) say(`  FAIL  ${f.id}  ${f.title}  (${f.findings.length})`);
say(`report: ${join(runDir, "report.html")}`);
say(`        ${join(runDir, "report.pdf")}`);
process.exit(fails.length ? 1 : 0);
