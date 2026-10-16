import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * 10/16: claim.mjs called `record(...)` in its two failure paths without
 * importing it. Both paths only run when something already went wrong (the
 * purchase could not be saved, or the delivery email failed), so the happy
 * path never noticed -- and the ReferenceError turned a recoverable problem
 * into a failed claim for a buyer whose money was already taken.
 */
test("claim.mjs imports every health helper it calls", async () => {
  const src = await readFile(new URL("../netlify/functions/claim.mjs", import.meta.url), "utf8");
  const imported = src.match(/import\s*\{([^}]*)\}\s*from\s*"\.\.\/lib\/health\.mjs"/);
  assert.ok(imported, "claim.mjs imports from health.mjs");
  const names = imported[1].split(",").map((s) => s.trim());
  for (const fn of ["record", "reportFailure"]) {
    if (new RegExp(`\\b${fn}\\(`).test(src)) assert.ok(names.includes(fn), `${fn} is called but not imported`);
  }
});
