import { pastItsYear, readingBoughtAt } from "./reading.mjs";
import { ALERT_QUIET_SECONDS, INCIDENT_TTL_SECONDS } from "./health.mjs";
import { RING_GATE_TTL_MS } from "./ring.mjs";

/**
 * "AFTER A YEAR YOUR READING IS GONE." The privacy page says so, and until
 * 16 October 2026 nothing made it true: `loadReading` stopped SERVING a reading
 * a year after purchase, but the record -- name, email, phone, the chart, the
 * written reading and (from 16 Oct) the birth details -- stayed in the store
 * for good. Netlify Blobs has no expiry of its own, and the `expiration` option
 * this repo passes on health records is silently ignored by the SDK.
 *
 * Jeremy, 16 Oct: "Queue fix for delete in a year". This is the deleting half.
 * It runs daily (functions/retention.mjs) and removes:
 *
 *   readings      a reading once `pastItsYear` says so -- the SAME test
 *                 `loadReading` uses to stop serving it, from the same
 *                 timestamp (purchasedAt, else createdAt). With it go the two
 *                 small records keyed by that reading's id: the ring gate
 *                 (health `ring/<id>`) and the re-send counter
 *                 (resend-rate `r:<id>`).
 *   health        incidents past their fourteen days (a refused draft's
 *                 excerpt is reading prose), and the ring/alert gates past
 *                 their own short lives -- the TTLs health.mjs and ring.mjs
 *                 already declare and Netlify never enforced.
 *   *-rate        a visitor's salted-IP-hash counter once its newest hit is a
 *                 week old -- longer than every window the limiters count, so
 *                 deleting it can never change a rate-limit answer.
 *
 * KEPT, ON PURPOSE: `config` (the prompt) and `places-cache` (place-name
 * searches, attached to nobody). Neither is personal data.
 *
 * FAIL SAFE. A record whose age cannot be read is KEPT and counted, never
 * guessed old. A key of a shape this file does not know is kept and counted. A
 * read or delete that fails is kept and counted. Run it twice and the second
 * run finds nothing to do. It logs COUNTS only -- never a key, a name, an
 * address or anything out of a record.
 *
 * No Netlify here: stores are passed in, so every rule is tested with an
 * in-memory fake (test/retention.test.mjs).
 */

/** A counter is kept a week past its newest hit (the longest limiter window). */
export const COUNTER_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** The per-visitor counter stores. Each value is an array of hit times in ms. */
export const COUNTER_STORES = ["chart-rate", "places-rate", "resend-rate"];

/**
 * Netlify runs a scheduled function for at most 30 seconds. Stop starting new
 * work well inside that; whatever is left is picked up tomorrow, and the run
 * says it was incomplete.
 */
export const DEFAULT_BUDGET_MS = 20_000;

/** Reads in flight at once. Small stores, but no reason to do them one by one. */
const CONCURRENCY = 8;

const READING_ID = /^[0-9a-f]{32}$/;
const HEALTH_RULES = [
  { prefix: "incident/", ttlMs: INCIDENT_TTL_SECONDS * 1000 },
  { prefix: "ring/", ttlMs: RING_GATE_TTL_MS },
  { prefix: "alerted/", ttlMs: ALERT_QUIET_SECONDS * 1000 },
];

function tally() {
  return { scanned: 0, expired: 0, deleted: 0, kept: 0, undatable: 0, unrecognised: 0, failed: 0 };
}

/**
 * Sweep every store. Returns counts by store; nothing in it identifies anyone.
 *
 * `stores` is `{ readings, health, counters: { "chart-rate": store, ... } }`;
 * any store left out is skipped. `dryRun` decides and counts exactly as a real
 * run does and deletes nothing -- `expired` is then "would delete".
 *
 * EVERY STORE IS LISTED BEFORE ANYTHING IS DELETED, page by page, so no delete
 * happens underneath a listing cursor still being walked, and so a reading's
 * companion records are deleted (and counted) only when they actually exist.
 */
export async function sweepRetention({
  stores = {},
  now = Date.now(),
  dryRun = false,
  budgetMs = DEFAULT_BUDGET_MS,
  clock = Date.now,
} = {}) {
  const deadline = clock() + budgetMs;
  const out = { dryRun: Boolean(dryRun), incomplete: false, stores: {} };
  const outOfTime = () => {
    if (clock() > deadline) out.incomplete = true;
    return out.incomplete;
  };

  // name -> { store, keys (null if the listing failed), has, t (tally), done }
  const named = [
    ["readings", stores.readings],
    ["health", stores.health],
    ...COUNTER_STORES.map((name) => [name, stores.counters?.[name]]),
  ].filter(([, store]) => store);
  const at = {};
  for (const [name, store] of named) {
    const t = (out.stores[name] = tally());
    let keys = null;
    try {
      keys = await listAll(store);
    } catch {
      t.failed += 1;
    }
    at[name] = { store, keys, has: new Set(keys ?? []), t, done: new Set() };
  }

  const remove = async (name, key) => {
    if (!dryRun) await at[name].store.delete(key);
  };

  /**
   * A record keyed by a reading's id goes with the reading. Only if it was in
   * the listing; counted in its own store, and skipped when that store's own
   * pass comes round.
   */
  const companion = async (name, key) => {
    const s = at[name];
    if (!s?.keys || s.done.has(key) || !s.has.has(key)) return;
    await remove(name, key);
    s.done.add(key);
    s.t.scanned += 1;
    s.t.expired += 1;
    if (!dryRun) s.t.deleted += 1;
  };

  // READINGS FIRST: the promise on the page is about them, so if the budget
  // runs out it runs out on the housekeeping, not on the reading.
  await sweepStore(at.readings, { outOfTime, dryRun }, async (key) => {
    if (!READING_ID.test(key)) return "unrecognised";
    const raw = await at.readings.store.get(key, { type: "json" });
    if (raw == null) return "gone";
    const bought = readingBoughtAt(raw);
    if (bought === null) return "undatable";
    if (!pastItsYear(bought, now)) return "kept";
    // The small records keyed by this reading go first, so a failure part way
    // leaves the reading in place to be retried tomorrow rather than
    // orphaning them.
    await companion("health", `ring/${key}`);
    await companion("resend-rate", `r:${key}`);
    await remove("readings", key);
    return "expired";
  });

  await sweepStore(at.health, { outOfTime, dryRun }, async (key) => {
    const rule = HEALTH_RULES.find((r) => key.startsWith(r.prefix));
    if (!rule) return "unrecognised";
    // An incident's key starts with the moment it was filed, so most are
    // decided without a read. Anything else reads its `at`.
    let when = rule.prefix === "incident/" ? Number(/^incident\/(\d+)-/.exec(key)?.[1]) : NaN;
    if (!Number.isFinite(when)) {
      const raw = await at.health.store.get(key, { type: "json" });
      if (raw == null) return "gone";
      when = raw?.at;
    }
    if (typeof when !== "number" || !Number.isFinite(when) || when <= 0) return "undatable";
    if (now - when <= rule.ttlMs) return "kept";
    await remove("health", key);
    return "expired";
  });

  for (const name of COUNTER_STORES) {
    await sweepStore(at[name], { outOfTime, dryRun }, async (key) => {
      const hits = await at[name].store.get(key, { type: "json" });
      if (hits == null) return "gone";
      if (!Array.isArray(hits) || hits.length === 0) return "undatable";
      if (!hits.every((h) => typeof h === "number" && Number.isFinite(h) && h > 0)) return "undatable";
      if (now - Math.max(...hits) <= COUNTER_KEEP_MS) return "kept";
      await remove(name, key);
      return "expired";
    });
  }

  return out;
}

/** Decide every listed key not already handled, a few at a time, until out of time. */
async function sweepStore(s, { outOfTime, dryRun }, decide) {
  if (!s?.keys) return;
  const keys = s.keys.filter((k) => !s.done.has(k));
  const t = s.t;
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      if (outOfTime()) return;
      const key = keys[next++];
      if (s.done.has(key)) continue;
      t.scanned += 1;
      let verdict;
      try {
        verdict = await decide(key);
      } catch {
        verdict = "failed";
      }
      if (verdict === "expired") {
        t.expired += 1;
        if (!dryRun) t.deleted += 1;
      } else if (verdict === "gone") {
        // Removed between the listing and the read. Nothing to do, nothing kept.
      } else {
        t[verdict] += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, worker));
}

async function listAll(store) {
  const keys = [];
  for await (const page of store.list({ paginate: true })) {
    for (const blob of page?.blobs ?? []) {
      if (typeof blob?.key === "string") keys.push(blob.key);
    }
  }
  return keys;
}

/**
 * The log line. Counts by store and nothing else -- no key, no id, no field
 * out of any record.
 */
export function describe(result) {
  const parts = Object.entries(result.stores).map(([name, t]) => {
    const deleted = result.dryRun ? `${t.expired} would delete` : `${t.deleted} deleted`;
    const extra = [
      t.undatable && `${t.undatable} undatable kept`,
      t.unrecognised && `${t.unrecognised} unrecognised kept`,
      t.failed && `${t.failed} failed`,
    ].filter(Boolean);
    return `${name}: ${t.scanned} scanned, ${deleted}, ${t.kept} kept${extra.length ? `, ${extra.join(", ")}` : ""}`;
  });
  return `retention${result.dryRun ? " [dry run]" : ""}${result.incomplete ? " [INCOMPLETE: out of time]" : ""}: ${parts.join("; ")}`;
}
