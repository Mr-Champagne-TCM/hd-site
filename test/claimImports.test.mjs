import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

/**
 * 10/16: claim.mjs called `record(...)` in its two failure paths without
 * importing it. Both paths only run when something already went wrong (the
 * purchase could not be saved, or the delivery email failed), so the happy
 * path never noticed -- and the ReferenceError turned a recoverable problem
 * into a failed claim for a buyer whose money was already taken.
 *
 * The same day, chart.mjs turned out to have the same fault: its two
 * ready-email incidents called `record` with only `reportFailure` imported, so
 * neither was ever filed.
 *
 * So the check is no longer about one file. EVERY function and lib module is
 * read, and every helper exported by health.mjs or failures.mjs that it calls
 * must be imported or declared in that file. Failure paths are exactly the
 * code no happy-path test runs, which is why this is a static check.
 */

const ROOT = new URL("../", import.meta.url);

async function exportsOf(rel) {
  const src = await readFile(new URL(rel, ROOT), "utf8");
  return [...src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

async function sources() {
  const out = [];
  for (const dir of ["netlify/functions/", "netlify/lib/"]) {
    for (const name of await readdir(new URL(dir, ROOT))) {
      if (!name.endsWith(".mjs")) continue;
      out.push({ path: dir + name, src: await readFile(new URL(dir + name, ROOT), "utf8") });
    }
  }
  return out;
}

/** Every name a file brings in with `import { a, b as c } from "..."`. */
function importedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g)) {
    for (const part of m[1].split(",")) {
      const local = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (local) names.add(local);
    }
  }
  return names;
}

function declaredNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/(?:function\s+|(?:const|let|var)\s+)([A-Za-z0-9_]+)/g)) names.add(m[1]);
  return names;
}

test("every file imports the health and failure helpers it calls", async () => {
  const helpers = [
    ...(await exportsOf("netlify/lib/health.mjs")),
    ...(await exportsOf("netlify/lib/failures.mjs")),
  ];
  assert.ok(helpers.includes("record") && helpers.includes("noteFailure"), "the helper lists did not read");

  const missing = [];
  for (const { path, src } of await sources()) {
    const imported = importedNames(src);
    const declared = declaredNames(src);
    // Comments quote helpers by name; only code counts.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const fn of helpers) {
      // A call, not a method (`store.record(`) and not a declaration.
      const called = new RegExp(`(^|[^.\\w])${fn}\\(`, "m").test(code);
      if (called && !imported.has(fn) && !declared.has(fn)) missing.push(`${path}: ${fn}`);
    }
  }
  assert.deepEqual(missing, [], `called but never imported:\n  ${missing.join("\n  ")}`);
});

test("the guard catches the 10/16 fault itself", () => {
  // The check above is only worth having if it fails on the original bug.
  const original = `import { reportFailure } from "../lib/health.mjs";\nawait record(store, { kind: "claim-email" });`;
  const imported = importedNames(original);
  const code = original;
  assert.ok(/(^|[^.\w])record\(/m.test(code));
  assert.equal(imported.has("record"), false);
});

test("every customer-facing function is wrapped in the failure net", async () => {
  // Anything thrown that nothing caught used to reach the buyer as Netlify's
  // own error page. `guard` turns it into a recorded `<name>-crash` and the
  // calm sentence for that path.
  for (const name of ["chart", "checkout", "claim", "pdf", "places", "reading", "resend"]) {
    const src = await readFile(new URL(`netlify/functions/${name}.mjs`, ROOT), "utf8");
    assert.match(src, new RegExp(`export default guard\\(\\s*"${name}"`), `${name}.mjs is not wrapped in guard()`);
  }
});
