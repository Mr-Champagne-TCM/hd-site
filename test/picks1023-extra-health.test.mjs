import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INCIDENT_TTL_SECONDS, record, sweepIncidents } from "../netlify/lib/health.mjs";

/**
 * EXTRA (privacy truth, picks-1023, pending Jeremy): the privacy page keeps a
 * record of a technical failure for fourteen days. Netlify Blobs has no expiry
 * of its own, so the fifteen-minute sweep deletes the records past it.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 1, 12);

function store(keys = [], { listThrows = false, deleteThrows = [] } = {}) {
  const data = new Map(keys.map((k) => [k, {}]));
  const deleted = [];
  return {
    data,
    deleted,
    async list({ prefix = "" } = {}) {
      if (listThrows) throw new Error("down");
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    async delete(k) {
      if (deleteThrows.includes(k)) throw new Error("down");
      data.delete(k);
      deleted.push(k);
    },
    async setJSON(k, v) {
      data.set(k, v);
    },
  };
}

test("extra: the sweep deletes failure records past fourteen days, and only those", async () => {
  assert.equal(INCIDENT_TTL_SECONDS, 14 * 24 * 60 * 60);
  const old = `incident/${NOW - 15 * DAY}-123`;
  const edge = `incident/${NOW - 14 * DAY}-456`;
  const fresh = `incident/${NOW - DAY}-789`;
  const s = store([old, edge, fresh, "incident/odd", "alerted/chart-crash", "rate/x"]);
  assert.deepEqual(await sweepIncidents(s, { now: NOW }), { listed: 4, deleted: 1, kept: 3, failed: 0 });
  assert.deepEqual(s.deleted, [old]);
});

test("extra: a record written by record() is cleared by the sweep fourteen days on", async () => {
  const s = store();
  const e = await record(s, { kind: "chart-crash", detail: "TypeError", now: NOW - 20 * DAY });
  assert.ok(s.data.has(`incident/${e.id}`));
  assert.equal((await sweepIncidents(s, { now: NOW })).deleted, 1);
  assert.equal(s.data.size, 0);
});

test("extra: the sweep never throws and says what it could not do", async () => {
  assert.deepEqual(await sweepIncidents(store([], { listThrows: true }), { now: NOW }), { listed: 0, deleted: 0, kept: 0, failed: 1 });
  const k = `incident/${NOW - 30 * DAY}-1`;
  assert.deepEqual(await sweepIncidents(store([k], { deleteThrows: [k] }), { now: NOW }), { listed: 1, deleted: 0, kept: 0, failed: 1 });
});

test("extra: the fifteen-minute sweep runs it", () => {
  const src = readFileSync(new URL("../netlify/functions/sweep.mjs", import.meta.url), "utf8");
  assert.match(src, /await sweepIncidents\(getStore\(\{ name: "health", consistency: "strong" \}\)\)/);
});
