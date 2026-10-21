import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleChart } from "../netlify/lib/handler.mjs";
import { mintReadingLink, saveReading } from "../netlify/lib/reading.mjs";

/**
 * A PAID REQUEST THE ENGINE REFUSED.
 *
 * The failure that cost a real purchase: the site's sellable ceiling and the
 * engine key's tier cap are two numbers in two repositories that must move
 * together, and only one of them did. The buyer paid, the engine answered "this
 * key reaches tier 1", and nothing reached anybody except him.
 */

const GRANT = "a-fixture-value-not-a-real-one-000000000";

function fakeStore() {
  const data = new Map();
  return {
    data,
    async setJSON(k, v) {
      data.set(k, JSON.parse(JSON.stringify(v)));
    },
    async get(k) {
      return data.get(k) ?? null;
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
  };
}

const BIRTH = { date: "1985-06-25", zone: "America/Chicago", timeKnown: false };

async function run({ engine, report }) {
  const readings = fakeStore();
  const id = await saveReading(readings, {
    tier: 2,
    output: null,
    name: "J",
    email: "b@example.com",
    phone: null,
    sku: "reading",
    purchasedAt: Date.now(),
  });
  const token = mintReadingLink({ id, tier: 2 }, GRANT);
  return handleChart({
    body: JSON.stringify({ reading: token, birth: BIRTH }),
    ip: "1.2.3.4",
    now: Date.now(),
    // The rate-limit store has its own tiny shape; a reading store is not one.
    store: {
      async keyFor(ip) {
        return `k:${ip}`;
      },
      async load() {
        return [];
      },
      async save() {},
    },
    engine,
    grantSecret: GRANT,
    readings,
    report,
  });
}

test("A PAID CHART THE ENGINE REFUSES IS REPORTED, not only returned", async () => {
  const seen = [];
  const result = await run({
    engine: async () => ({
      ok: false,
      status: 403,
      payload: { error: { code: "tier", message: "This key reaches tier 1. Tier 2 was asked for." } },
    }),
    report: async (i) => seen.push(i),
  });
  // 10/16: the engine's own words ("This key reaches tier 1...") no longer
  // reach the buyer. They get the calm paid sentence; Jeremy gets the kind.
  assert.equal(result.status, 503);
  const body = JSON.parse(result.body);
  assert.equal(body.error.key, "chart-slow-paid");
  assert.doesNotMatch(result.body, /key reaches|Tier 2 was asked/);
  assert.match(body.error.message, /purchase is safe/i);
  assert.equal(seen.length, 1, "nobody was told a paid request failed");
  assert.equal(seen[0].kind, "engine-403-tier");
  assert.equal(seen[0].paid, true);
  assert.match(seen[0].detail, /tier 2/);
  assert.match(seen[0].detail, /engine 403/);
});

test("NO BIRTH MOMENT TRAVELS IN THE INCIDENT", async () => {
  const seen = [];
  await run({
    engine: async () => ({ ok: false, status: 500, payload: { error: { code: "boom" } } }),
    report: async (i) => seen.push(i),
  });
  const written = JSON.stringify(seen);
  for (const secret of ["1985", "06-25", "Chicago", "America"]) {
    assert.ok(!written.includes(secret), `"${secret}" reached the incident`);
  }
});

test("a reporter that throws does not fail the request", async () => {
  // It sits on the path of somebody who has already paid.
  const result = await run({
    engine: async () => ({ ok: false, status: 502, payload: { error: { code: "x" } } }),
    report: async () => {
      throw new Error("health store is down");
    },
  });
  assert.equal(result.status, 503);
  assert.equal(JSON.parse(result.body).error.key, "chart-slow-paid");
});

// --- one address, more than one person --------------------------------------

test("THE ALARM IS RETIRED: no chart is ever stopped to ask 'is this the chart you had before?'", async () => {
  // Release 2 (Jeremy 10/19: "retire no longer needed"). Kept details are
  // confirmed or corrected; a correction is the buyer's own, kept with a
  // history, and the reading says calmly what changed. The 409 is gone, and
  // so is the whole-store scan that fed it.
  const { chartDifferences } = await import("../netlify/lib/chartDiff.mjs");
  const handler = readFileSync(
    fileURLToPath(new URL("../netlify/lib/handler.mjs", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(handler, /chart_differs/, "the alarm's code is still in the handler");
  assert.doesNotMatch(handler, /previousChart/, "the whole-store scan is still in the handler");
  assert.doesNotMatch(handler, /json\(409/, "something still answers 409");

  // The comparison itself is kept -- it groups an older summary with the
  // reading it became (charts.mjs) -- and still notices a real change.
  assert.deepEqual(
    chartDifferences({ type: "Generator" }, { type: "Projector" }),
    ["type"],
  );
});
