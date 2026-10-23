#!/usr/bin/env node
/**
 * TESTS FOR THE CHECKS. A check that misses a real error is a masked error; a
 * check that fires on right text is a false error. Either makes the rig
 * another source of the mistakes it exists to stop (Jeremy, 10/21: "Make sure
 * testing locally is not another source of masked error or false error").
 *
 * For every check in checks/index.mjs, selftest/cases.mjs holds a KNOWN-GOOD
 * document (from a real run, corrected, plus look-alikes that are right as
 * they are) that must PASS, and KNOWN-BAD versions of it, each with one error
 * planted in the shape the live test found it, that must FAIL with a finding
 * naming it. Each is run alone on a mini run in the data home
 * (<data home>\selftest-tmp\, deleted afterwards). Nothing is driven, built
 * or sent; the base run is only read.
 *
 *   node tools/e2e/checks/selftest.mjs                 newest finished run as the base
 *   node tools/e2e/checks/selftest.mjs --base=<run dir>
 *   node tools/e2e/checks/selftest.mjs --only=style,links
 *   node tools/e2e/checks/selftest.mjs --keep          leave the mini runs, to look at
 *
 * Exit code 1 when any case fails, or a check has no good or no bad case.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { E2E, HOME, RUNS } from "../harness/paths.mjs";
import { runChecks } from "./index.mjs";
import { CASES, STRICT } from "./selftest/cases.mjs";
import { Mini, loadBase } from "./selftest/mini.mjs";
import { regressCases } from "./selftest/regress.mjs";
import { loadFixList } from "../regress.mjs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? (process.argv.includes(`--${name}`) ? true : null);
const say = (m) => process.stdout.write(m + "\n");

function newestRun() {
  if (!existsSync(RUNS)) return null;
  const done = readdirSync(RUNS)
    .filter((d) => existsSync(join(RUNS, d, "manifest.json")) && existsSync(join(RUNS, d, "results.json")))
    .sort();
  return done.length ? join(RUNS, done.at(-1)) : null;
}

const baseDir = arg("base") || newestRun();
if (!baseDir || !existsSync(join(baseDir, "manifest.json"))) {
  say(`selftest: no base run (looked in ${RUNS}). Give one: --base=<run dir>`);
  process.exit(1);
}
const only = typeof arg("only") === "string" ? arg("only").split(",") : null;
const keep = !!arg("keep");
const base = loadBase(baseDir);
const tmp = join(HOME, "selftest-tmp", `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${process.pid}`);
mkdirSync(tmp, { recursive: true });

say(`selftest: base ${baseDir}`);
say(`  mini runs in ${tmp}${keep ? " (kept)" : " (deleted afterwards)"}`);

/** Every check id the checks file defines. */
const ids = [...readFileSync(join(E2E, "checks", "index.mjs"), "utf8").matchAll(/add\(check\("([a-z0-9-]+)"/g)].map((m) => m[1]);

let n = 0;
const results = [];
async function variant(c, name, kind, plant, expect, count) {
  const dir = join(tmp, String(++n).padStart(3, "0"));
  // A bad case named "#16: …" or "AI1 in …" plants that error-set item.
  const r = { check: c.check, item: c.item, kind, name, ok: false, why: "", items: kind === "bad" ? [/^(#\d+|W\d+|AI\d+)\b/.exec(name)?.[1]].filter(Boolean) : [], findings: [] };
  try {
    const m = new Mini(base, dir, c.take);
    c.good(m);
    if (plant) plant(m);
    m.save();
    const out = await runChecks({ runDir: dir, baselineDir: dir, only: [c.check], fixtures: join(dir, "fixtures"), phoneRoot: join(dir, "phone"), websiteGit: m.opts.websiteGit ?? (() => null), checker: m.opts.checker ?? STRICT });
    const res = out.checks.find((x) => x.id === c.check);
    r.findings = res?.findings ?? [];
    const said = (f) => `${f.where} ${f.what} ${f.evidence ?? ""}`;
    if (!res) r.why = "the check did not run";
    else if (kind === "good") {
      if (res.status !== "pass") r.why = res.status === "skip" ? "skipped: it looked at nothing" : `failed on right text: ${res.findings.slice(0, 3).map((f) => `[${f.where}] ${f.what} ${f.evidence ? `«${f.evidence.slice(0, 120)}»` : ""}`).join(" | ")}`;
      else if (c.probed && !(res.probed > 0)) r.why = "passed without probing the checker";
      else r.ok = true;
    } else {
      const named = res.findings.filter((f) => expect.test(said(f)));
      if (res.status !== "fail") r.why = `missed it (${res.status})`;
      else if (!named.length) r.why = `failed, but no finding names it: ${res.findings.slice(0, 3).map((f) => `[${f.where}] ${f.what}`).join(" | ")}`;
      else if (count !== undefined && res.findings.length !== count) r.why = `${res.findings.length} findings, expected ${count}: ${res.findings.map((f) => f.what).join(" | ")}`;
      else r.ok = true;
    }
  } catch (e) {
    r.why = `could not build: ${e.message}`;
  } finally {
    if (!keep) rmSync(dir, { recursive: true, force: true });
  }
  results.push(r);
  say(`  ${r.ok ? "ok  " : "FAIL"}  ${c.check.padEnd(22)} ${kind.padEnd(4)}  ${name}${r.ok ? "" : `\n          ${r.why}`}`);
}

const t0 = Date.now();
for (const c of CASES.filter((c) => !only || only.includes(c.check))) {
  await variant(c, "corrected document passes", "good", null);
  for (const b of c.bad) await variant(c, b.name, "bad", b.plant, b.expect, b.count);
}
// changes-on-fix-list: run.mjs adds it after the checks above (regress.mjs), so its cases run on their own.
ids.push("changes-on-fix-list");
if (!only || only.includes("changes-on-fix-list")) {
  for (const r of await regressCases(tmp, loadFixList)) {
    results.push(r);
    say(`  ${r.ok ? "ok  " : "FAIL"}  ${r.check.padEnd(22)} ${r.kind.padEnd(4)}  ${r.name}${r.ok ? "" : `\n          ${r.why}`}`);
  }
}
if (!keep) {
  rmSync(tmp, { recursive: true, force: true });
  try {
    rmdirSync(join(HOME, "selftest-tmp")); // only when empty (another self-test may be using it)
  } catch {}
}

/* Every check has at least one good and one bad case that ran. */
const missing = [];
for (const id of ids.filter((id) => !only || only.includes(id))) {
  const mine = results.filter((r) => r.check === id);
  if (!mine.some((r) => r.kind === "good")) missing.push(`${id}: no known-good case`);
  if (!mine.some((r) => r.kind === "bad")) missing.push(`${id}: no known-bad case`);
}
for (const id of new Set(results.map((r) => r.check))) if (!ids.includes(id)) missing.push(`${id}: a case for a check that no longer exists`);

/* Every error-set item the rig can see has a planted case that its check
   catches THE WAY THE REPORT COUNTS IT (errorset.json `match` and `where`),
   so the report's "caught" list can be trusted. */
const set = JSON.parse(readFileSync(join(E2E, "errorset.json"), "utf8")).items;
const human = [];
let caughtN = 0;
for (const it of set) {
  if (it.machine === false) {
    human.push(it.id);
    continue;
  }
  if (only && !only.includes(it.check)) continue;
  const re = it.match ? new RegExp(it.match, "i") : null;
  const planted = results.filter((r) => r.kind === "bad" && r.check === it.check && r.items.includes(it.id));
  const caught = planted.filter((r) => r.ok && r.findings.some((f) => (!re || re.test(`${f.what} ${f.where} ${f.evidence}`)) && (!it.where || f.where.includes(it.where))));
  if (caught.length) caughtN++;
  else missing.push(`${it.id}: ${planted.length ? "planted, but not caught the way the report counts it" : "no planted case"} (${it.check}${it.match ? `, /${it.match}/` : ""}${it.where ? `, where ${it.where}` : ""})`);
}

const bad = results.filter((r) => !r.ok);
say("");
say(`selftest: ${new Set(results.map((r) => r.check)).size} of ${only ? only.length : ids.length} checks, ${results.filter((r) => r.kind === "good").length} known-good and ${results.filter((r) => r.kind === "bad").length} known-bad cases, ${bad.length} failing  (${Math.round((Date.now() - t0) / 1000)} s)`);
say(`  error set: ${caughtN} items planted and caught as the report counts them; ${human.join(", ")} need a human (errorset.json says why)`);
for (const m of missing) say(`  MISSING  ${m}`);
for (const r of bad) say(`  FAIL  ${r.check} (${r.item}) ${r.kind}: ${r.name}`);
process.exit(bad.length || missing.length ? 1 : 0);
