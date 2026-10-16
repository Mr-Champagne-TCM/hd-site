#!/usr/bin/env node
/**
 * READ-ONLY: what would the daily retention sweep delete from PRODUCTION today?
 *
 *   node tools/retention-dry-run.mjs            (from the hd-site folder)
 *
 * Runs the real rules (netlify/lib/retention.mjs) in dry-run mode against the
 * live stores, through the logged-in, linked Netlify CLI (`blobs:list`,
 * `blobs:get`). The store adapter below has NO delete and NO write: a delete
 * reaching it throws and is counted as `failed`, so even a bug in the sweep
 * cannot remove anything from here.
 *
 * Prints COUNTS ONLY, plus the date the oldest reading reaches its year. Record
 * contents are parsed in memory and never printed.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { COUNTER_STORES, describe, sweepRetention } from "../netlify/lib/retention.mjs";
import { READING_TTL_SECONDS, readingBoughtAt } from "../netlify/lib/reading.mjs";

const run = promisify(execFile);
const SAFE = /^[A-Za-z0-9_\-:\/.|]+$/;

async function cli(args) {
  for (const a of args) if (!SAFE.test(a)) throw new Error("refusing an unexpected argument");
  const { stdout } = await run("netlify", args, { shell: true, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return stdout;
}

function readOnlyStore(name, onRecord) {
  return {
    async *list() {
      const listed = JSON.parse(await cli(["blobs:list", name, "--json"]));
      const blobs = Array.isArray(listed) ? listed : listed.blobs ?? [];
      yield { blobs: blobs.map((b) => ({ key: typeof b === "string" ? b : b.key })), directories: [] };
    },
    async get(key) {
      if (!SAFE.test(key)) throw new Error("unexpected key shape");
      const text = (await cli(["blobs:get", name, key])).trim();
      if (!text) return null;
      const value = JSON.parse(text);
      onRecord?.(value);
      return value;
    },
    async delete() {
      throw new Error("read-only: this tool never deletes");
    },
    async setJSON() {
      throw new Error("read-only: this tool never writes");
    },
  };
}

let oldest = null;
const readings = readOnlyStore("readings", (raw) => {
  const b = readingBoughtAt(raw);
  if (b !== null && (oldest === null || b < oldest)) oldest = b;
});
const counters = Object.fromEntries(COUNTER_STORES.map((n) => [n, readOnlyStore(n)]));

const result = await sweepRetention({
  stores: { readings, health: readOnlyStore("health"), counters },
  dryRun: true,
  budgetMs: 30 * 60 * 1000,
});

console.log(describe(result));
for (const [name, t] of Object.entries(result.stores)) console.log(`  ${name.padEnd(12)} ${JSON.stringify(t)}`);
if (oldest !== null) {
  const due = new Date((oldest + READING_TTL_SECONDS + 1) * 1000);
  console.log(`  oldest reading bought ${new Date(oldest * 1000).toISOString().slice(0, 10)}; first reading deletion due ${due.toISOString().slice(0, 10)}`);
}
