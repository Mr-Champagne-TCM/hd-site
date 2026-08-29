import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * The guard gets guarded.
 *
 * A scanner that silently stops matching is worse than no scanner, because the
 * green tick keeps arriving. Each case below plants something real in a throwaway
 * tree and asserts the scan refuses it.
 */

const SCANNER = join(process.cwd(), "tools", "leak-scan.mjs");

/** Runs the scan in a throwaway tree. Returns { blocked, output }. */
function scan(files, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "leak-"));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const full = join(dir, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, body);
    }
    try {
      const out = execFileSync(process.execPath, [SCANNER, "."], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, LEAK_SCAN_TERMS: "", ...env },
      });
      return { blocked: false, output: out };
    } catch (e) {
      return { blocked: true, output: (e.stdout ?? "") + (e.stderr ?? "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a clean tree passes", () => {
  const r = scan({ "src/app.js": "export const hello = 1;\n" });
  assert.equal(r.blocked, false, r.output);
});

test("it says out loud when no private terms are loaded", () => {
  const r = scan({ "src/app.js": "export const x = 1;\n" });
  assert.match(r.output, /NO private terms loaded/);
});

test("a private term from the environment is caught", () => {
  const r = scan(
    { "src/app.js": 'const who = "Wilhelmina Farnsworth";\n' },
    { LEAK_SCAN_TERMS: "Wilhelmina Farnsworth" },
  );
  assert.equal(r.blocked, true);
  assert.match(r.output, /private-term/);
});

test("a private term from the gitignored file is caught", () => {
  const r = scan({
    "tools/private-terms.local.txt": "# real people\nWilhelmina Farnsworth\n",
    "src/app.js": 'const who = "wilhelmina farnsworth";\n',
  });
  assert.equal(r.blocked, true);
  assert.match(r.output, /private-term/);
});

/** Joins fragments so no rule's pattern ever appears whole in this file. */
const plant = (...parts) => parts.join("");

test("a phone number is caught", () => {
  const r = scan({ "src/app.js": plant("const n = ", '"(512) 555', "-0142", '";\n') });
  assert.equal(r.blocked, true);
  assert.match(r.output, /phone/);
});

test("a real email is caught, an invented one is not", () => {
  const at = "@";
  assert.equal(scan({ "src/a.js": plant("const e = 'someone", at, "gmail.com';\n") }).blocked, true);
  assert.equal(scan({ "src/a.js": plant("const e = 'someone", at, "example.com';\n") }).blocked, false);
  assert.equal(scan({ "src/a.js": plant("const e = 'someone", at, "example.invalid';\n") }).blocked, false);
});

/**
 * THE RULE WAS NARROWED to let our own sending domain through, so here is the
 * boundary of that narrowing.
 *
 * `hd-readings@thechampagnemethod.co` is printed in the headers of every email
 * the site sends -- it exists to be seen, and hiding it in an environment
 * variable would protect nothing. A client's address is never at that domain,
 * so the carve-out cannot swallow the case the rule was written for.
 *
 * The narrowing exists BECAUSE the rule did its job: the first draft of
 * mail.mjs put Jeremy's personal Gmail in the Reply-To header and the scan
 * refused the commit. The fix was to stop putting it there -- replies are
 * forwarded at the registrar now -- not to widen the allowance to cover it.
 */
test("our own sending domain is allowed, because it is published anyway", () => {
  const at = "@";
  for (const path of ["netlify/lib/mail.mjs", "src/copy.ts", "test/x.test.mjs"]) {
    const r = scan({ [path]: plant("const FROM = 'hd-readings", at, "thechampagnemethod.co';\n") });
    assert.equal(r.blocked, false, path + " blocked our own sender: " + r.output);
  }
});

test("a personal inbox is STILL caught, which is the whole point", () => {
  const at = "@";
  // The exact shape that was caught for real, and must stay caught.
  const planted = plant("export const REPLY_TO = 'thechampagnemethod", at, "gmail.com';\n");
  assert.equal(scan({ "netlify/lib/mail.mjs": planted }).blocked, true, "the caught case slipped through");
});

test("the carve-out is the domain, not any lookalike of it", () => {
  const at = "@";
  for (const domain of [
    "thechampagnemethod.co.attacker.com",
    "notthechampagnemethod.com",
    "thechampagnemethod.com",
  ]) {
    const r = scan({ "src/a.js": plant("const e = 'someone", at, domain + "';\n") });
    assert.equal(r.blocked, true, domain + " was let through by the carve-out");
  }
});

/**
 * The planted values are assembled at runtime, never written as one string.
 *
 * A test file that spells out a live-key pattern is a file the scanner refuses,
 * which is correct of it -- the scanner cannot tell a drill from the real thing,
 * and it should not try. Splitting them keeps this file clean without weakening
 * a single rule.
 */
const FAKE = {
  stripe: "sk_" + "live_" + "51".padEnd(22, "Q"),
  github: "gh" + "p_" + "".padEnd(32, "Q"),
  anthropic: "sk-" + "ant-" + "".padEnd(22, "Q"),
  bearer: "".padEnd(24, "Q"),
};

test("a planted secret is caught", () => {
  const planted = [
    'const k = "' + FAKE.stripe + '";',
    'const k = "' + FAKE.github + '";',
    'const k = "' + FAKE.anthropic + '";',
    'const token = "' + FAKE.bearer + '";',
  ];
  for (const line of planted) {
    assert.equal(scan({ "src/a.js": line + "\n" }).blocked, true, line.slice(0, 24) + "...");
  }
});

// --- back doors into paid work -------------------------------------------

test("shipping code asking for a paid tier is caught", () => {
  const r = scan({ "src/checkout.js": "await post({ birth, tier: 2 });\n" });
  assert.equal(r.blocked, true);
  assert.match(r.output, /paid-tier-request/);
});

test("a test naming a paid tier is NOT caught - it proves the door is shut", () => {
  const r = scan({ "test/edge.test.mjs": "// asserts the edge ignores it\nconst body = { tier: 2 };\n" });
  assert.equal(r.blocked, false, r.output);
});

test("paid content in the repo is caught", () => {
  assert.equal(scan({ "src/a.js": plant('const t = data["interpret', 'ation"];\n') }).blocked, true);
  assert.equal(scan({ "src/a.js": plant('const t = data["activ', 'ations"];\n') }).blocked, true);
});

/**
 * THE RULE WAS NARROWED, so here is exactly what it now does and does not do.
 *
 * It used to match the bare identifier `bodygraphSvg`, which made the chart
 * tier unbuildable -- the page has to name the field to display the drawing,
 * so the client, the type and the bundle all carry the word by necessity. A
 * rule that fires on the only possible spelling of a required feature is one
 * that gets skipped, and a skipped rule protects nothing.
 *
 * Narrowed with negatives in ALL FOUR positions the name has to appear in,
 * because a narrowing checked in one place is a narrowing that turns out to be
 * wider than anybody looked.
 */
test("a field CARRYING a drawing is still caught", () => {
  const line = plant('{"bodygraph', 'Svg": "<svg viewBox=1></svg>"}\n');
  assert.equal(scan({ "src/a.js": line }).blocked, true);
  assert.equal(scan({ "netlify/f.mjs": line }).blocked, true);
});

test("the field NAME alone is not caught, in any of the four places it must appear", () => {
  const uses = {
    "src/Summary.tsx": plant("  bodygraph", "Svg?: unknown;\n"),
    "src/entry/EntryForm.tsx": plant("if (d.bodygraph", "Svg !== undefined) show();\n"),
    "netlify/lib/handler.mjs": plant("// upstream may carry bodygraph", "Svg\n"),
    "test/x.test.mjs": plant("assert.ok(body.bodygraph", "Svg);\n"),
  };
  for (const [path, body] of Object.entries(uses)) {
    const r = scan({ [path]: body });
    assert.equal(r.blocked, false, path + " was blocked: " + r.output);
  }
});

test("a rendered chart committed as a file is caught", () => {
  // The renderer's own viewBox. The drawing is Jeremy's design and D-10 makes
  // it the one global look, so a render in a public repo hands the whole
  // appearance to anyone who clones it. This caught a real one: a 188 KB
  // sample was on its way into test/fixtures as a test fixture.
  const render = plant('<svg viewBox="-120 -12 ', '1090 1330"><circle r="13"/></svg>\n');
  for (const path of ["test/fixtures/bodygraph.svg", "src/chart.svg", "dist/assets/x.svg"]) {
    assert.equal(scan({ [path]: render }).blocked, true, path + " slipped through");
  }
});

test("a chart-shaped svg that is NOT ours is not caught", () => {
  // The layout is public knowledge on every Human Design site. This rule is
  // about OUR drawing, identified by our viewBox, not about SVG in general.
  assert.equal(
    scan({ "src/icon.svg": '<svg viewBox="0 0 100 100"><circle r="13"/></svg>\n' }).blocked,
    false,
  );
});

test("an unlock switch is caught", () => {
  assert.equal(scan({ "src/a.js": plant("if (u.includes('?un", "lock=1')) show();\n") }).blocked, true);
  assert.equal(scan({ "src/a.js": plant("let hasP", "aid = true;\n") }).blocked, true);
});

test("grant signing in client code is caught", () => {
  assert.equal(scan({ "src/a.js": plant("import { createH", "mac } from 'node:crypto';\n") }).blocked, true);
});

test("a price written outside the pricing module is caught", () => {
  const price = plant("$44", ".44");
  assert.equal(scan({ "src/offer.js": 'const label = "' + price + '";\n' }).blocked, true);
  assert.equal(scan({ "shared/pricing.mjs": 'const label = "' + price + '";\n' }).blocked, false);
});

// --- engine internals ------------------------------------------------------

test("an engine internal is caught", () => {
  assert.equal(scan({ "src/a.js": plant("const l = chart.ecliptic", "Longitude;\n") }).blocked, true);
  assert.equal(scan({ "src/a.js": plant("// WHEEL_", "START is the wheel anchor\n") }).blocked, true);
});

test("engine source in this repo is caught by extension alone", () => {
  assert.equal(scan({ "src/Engine.kt": "package com.tcm\n" }).blocked, true);
});

// --- leftovers -------------------------------------------------------------

test("an env file is caught by its name, whatever is inside", () => {
  assert.equal(scan({ ".env.production": "NOTHING=1\n" }).blocked, true);
});

test("a note to ourselves in an HTML comment is caught", () => {
  assert.equal(scan({ "src/i.html": plant("<!-- TO", "DO swap this before launch -->\n") }).blocked, true);
});

/**
 * THE GUARD MUST NOT PUBLISH WHAT IT IS GUARDING.
 *
 * Every other rule quotes the offending line, because you need to see a stray
 * key or a hardcoded price to act on it. The private-terms rule matches a real
 * person's NAME, and quoting the line prints the name.
 *
 * This scan runs in GitHub Actions on a PUBLIC repository, where the log is
 * world-readable. So the check that stops a client's name being published
 * would have published it, in the act of catching it -- the same shape of
 * mistake as the version that hardcoded four real first names into the
 * scanner's own source.
 *
 * Found by running it. Filling in the private-terms file for the first time
 * made this rule fire for the first time, and the report quoted the whole
 * offending line -- the name included.
 *
 * And then the scanner caught this very comment, which had quoted that report
 * verbatim and so put a real client's name into the public repo inside the
 * explanation of why real client names must not go into the public repo. It
 * was right both times.
 */
test("A CAUGHT NAME IS NOT REPEATED IN THE REPORT", () => {
  const r = scan(
    { "src/app.js": 'const who = "Wilhelmina Farnsworth";\n' },
    { LEAK_SCAN_TERMS: "Wilhelmina Farnsworth" },
  );
  assert.equal(r.blocked, true);
  // It still says where, and which rule -- that is what makes it actionable.
  assert.match(r.output, /app\.js:1/);
  assert.match(r.output, /private-term/);
  // And it does NOT say who.
  assert.ok(
    !/Wilhelmina/i.test(r.output),
    "the scanner printed the very name it was catching:\n" + r.output,
  );
});

test("other rules still quote the line, because you need to see it", () => {
  // A price literal is safe to echo and useless without the text -- but it is
  // still a price literal, and this rule does not exempt its own test. Built
  // from fragments, like every other fixture in this file.
  const money = plant("$", "44", ".", "44");
  const r = scan({ "src/app.js": plant('const price = "', money, '";\n') });
  assert.equal(r.blocked, true);
  assert.ok(r.output.includes(money), "a non-name finding should still be quoted");
});
