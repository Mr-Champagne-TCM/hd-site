import { createHmac } from "node:crypto";
import { loadCurrent, loadReading, saveReading, updateRecord } from "./reading.mjs";
import { IDENTIFYING, IDENTIFYING_SETS } from "./chartDiff.mjs";

/** `fn` over `items`, at most `n` at a time, results in order. */
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * WHOSE CHARTS, AND WHICH CHART GREW FROM WHICH (release 2, Jeremy 10/19-10/20).
 *
 * Two jobs live here, because both are about the same question -- "is this the
 * same person's chart?":
 *
 *   1. RECORDING A PURCHASE (`recordPurchase`), for the claim and for the
 *      purchase watcher alike. An upgrade bought from "For me" names the record
 *      it upgrades (Stripe metadata `upgrades`, set by the checkout from a
 *      VERIFIED link, never typed by anybody). The new record carries that
 *      chart's person, its kept birth details (so there is nothing to retype)
 *      and its correction history; the old record is marked `grewTo`, so its
 *      old link opens the grown chart and its credit can never be used again.
 *
 *   2. THE PER-EMAIL LIST behind "Email me my charts". One small blob per
 *      address, under a SCRAMBLED KEY -- an HMAC of the address with the grant
 *      secret, so the store's key list is not a list of email addresses -- and
 *      holding no birth details and no address: only record ids, whose chart
 *      (person), which record it grew from, the tier and when.
 *
 * MIGRATION-FREE. Records from before release 2 have none of this. The list
 * fills itself the first time it is asked for (`ensureIndexed`: one pass over
 * the readings store, marked done), and an older record with no `person` is
 * grouped with the other older records of the same chart -- the same Type,
 * Profile, Authority, centers and channels can only be one birth moment -- so
 * an older summary and the reading it later became still come back as ONE
 * person's chart.
 */

/** The store's name, beside "readings". Holds ids and tiers, nothing personal. */
export const INDEX_STORE = "charts-by-email";
/** The marker that says the one-time pass over older records has been made. */
export const BACKFILL_KEY = "_backfilled";

const ID = /^[0-9a-f]{32}$/;

/** An address as compared everywhere: trimmed, lower case. Null for anything that is not one. */
export function normaliseEmail(raw) {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  // Deliberately loose: one @, something either side, a dot after it, no spaces.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/** The scrambled key for an address. The address itself is never a key. */
export function emailKey(email, secret) {
  const e = normaliseEmail(email);
  if (!e || !secret) return null;
  return "e_" + createHmac("sha256", secret).update(`email:${e}`).digest("hex").slice(0, 40);
}

async function readList(index, key) {
  const raw = await index.get(key, { type: "json" });
  return raw && Array.isArray(raw.charts) ? raw : { v: 1, charts: [] };
}

/**
 * Add one record to its buyer's list. Idempotent: the same id twice is one
 * entry (a repeat claim, or the backfill meeting a record the claim already
 * listed). Holds ids, tier and time only.
 */
export async function addToIndex(index, { email, id, person, tier, at, grewFrom = null }, secret) {
  const key = emailKey(email, secret);
  if (!key || !ID.test(String(id))) return { ok: false, reason: "no_key" };
  const list = await readList(index, key);
  if (list.charts.some((c) => c.id === id)) return { ok: true, already: true };
  list.charts.push({
    id,
    person: ID.test(String(person)) ? person : id,
    tier: Number.isInteger(tier) ? tier : null,
    at: Number.isFinite(at) ? Math.floor(at) : null,
    ...(ID.test(String(grewFrom)) ? { grewFrom } : {}),
  });
  await index.setJSON(key, { v: 1, charts: list.charts.slice(-200) });
  return { ok: true };
}

/**
 * THE ONE-TIME PASS over records written before the list existed. Every later
 * purchase is listed as it is recorded, so after this the list is complete.
 * Skipped when the store cannot be listed (a test double, or a blip): the
 * marker is only written after a pass that finished.
 */
export async function ensureIndexed({ readings, index, secret, now = Date.now() }) {
  if (!index || !readings || typeof readings.list !== "function") return { ran: false };
  try {
    if (await index.get(BACKFILL_KEY, { type: "json" })) return { ran: false };
  } catch {
    return { ran: false };
  }
  const listed = await readings.list();
  let added = 0;
  for (const blob of listed?.blobs ?? []) {
    if (!ID.test(blob.key)) continue;
    const r = await loadReading(readings, blob.key, now).catch(() => null);
    if (!r || !r.buyer?.email) continue;
    const out = await addToIndex(
      index,
      { email: r.buyer.email, id: r.id, person: r.person, tier: r.tier, at: r.purchasedAt, grewFrom: r.grewFrom },
      secret,
    );
    if (out.ok && !out.already) added += 1;
  }
  await index.setJSON(BACKFILL_KEY, { at: Math.floor(now / 1000), added });
  return { ran: true, added };
}

/**
 * The head of a chain: follow `grewTo` to the newest record, filled or not.
 * (`loadCurrent` stops at a pending one; a purchase must link to the newest.)
 */
export async function chainHead(readings, id, now = Date.now()) {
  let at = await loadReading(readings, id, now, { strict: true });
  for (let hop = 0; at && hop < 4 && at.grewTo; hop++) {
    const next = await loadReading(readings, at.grewTo, now).catch(() => null);
    if (!next) break;
    at = next;
  }
  return at;
}

/**
 * RECORD ONE PAID PURCHASE: the receipt, and -- for an upgrade -- which chart
 * it grew from. Used by the claim and by the purchase watcher, so the two can
 * never record the same purchase two different ways.
 *
 * `note(kind, detail)` is told when an upgrade could not be linked (the chart
 * it named had already grown to this tier -- two upgrades paid at once) or
 * when the list could not be written; neither stops the purchase.
 */
export async function recordPurchase({ readings, index = null, id, level, session, secret, now = Date.now(), note = async () => {} }) {
  const buyer = session?.customer_details ?? {};
  const meta = session?.metadata ?? {};
  let source = null;
  if (ID.test(String(meta.upgrades))) {
    const head = await chainHead(readings, meta.upgrades, now);
    if (head && head.tier < level && head.id !== id) {
      source = head;
    } else if (head) {
      // The credit was given at checkout for this chart, and the chart has
      // already grown this far by another purchase. The buyer has their
      // purchase either way; Jeremy is told, so the rare double can be looked at.
      await note("upgrade-already-grown", `tier ${level} named a chart already at tier ${head.tier}`);
    }
  }

  await saveReading(readings, {
    id,
    tier: level,
    output: null,
    name: buyer.name ?? null,
    email: buyer.email ?? null,
    phone: buyer.phone ?? null,
    sku: meta.sku ?? null,
    purchasedAt: typeof session?.created === "number" ? session.created * 1000 : now,
    paidCents: Number.isInteger(session?.amount_total) ? session.amount_total : null,
    person: source ? source.person : id,
    grewFrom: source ? source.id : null,
    fresh: meta.fresh === "1",
    // NOTHING TO RETYPE: the chart's kept details (the name for the chart
    // with them) and its earlier corrections come along.
    birth: source?.birth ?? null,
    history: source?.history ?? null,
    // A birth time added once to the chart it grows from: the offer stays spent (10/22).
    timeAdded: source?.timeAdded ?? null,
  });

  if (source) {
    try {
      // The old record now points on: its link opens the grown chart, and its
      // credit is spent. `person` is written too, so an older record joins
      // its chain properly.
      await updateRecord(readings, source.id, { grewTo: id, person: source.person }, now);
    } catch (e) {
      await note("upgrade-link-not-saved", `${e?.name ?? "Error"}`);
    }
  }

  if (index && buyer.email) {
    try {
      await addToIndex(
        index,
        { email: buyer.email, id, person: source ? source.person : id, tier: level, at: Math.floor((typeof session?.created === "number" ? session.created * 1000 : now) / 1000), grewFrom: source?.id ?? null },
        secret,
      );
    } catch (e) {
      await note("chart-index-not-saved", `${e?.name ?? "Error"}`);
    }
  }
  return { grewFrom: source?.id ?? null, kept: Boolean(source?.birth) };
}

/** The values that say "this is the same chart", for grouping older records. */
function signature(output) {
  if (!output) return null;
  const parts = IDENTIFYING.map((k) => String(output[k] ?? "").trim());
  for (const k of IDENTIFYING_SETS) {
    const v = output[k];
    parts.push(Array.isArray(v) ? [...v].map((x) => String(x).trim()).sort().join(",") : "");
  }
  return parts.join("|");
}

/**
 * EVERY CHART BOUGHT WITH THIS ADDRESS, ONE PER PERSON (Jeremy 10/20: one
 * link per person's chart; an upgraded chart appears once, at the tier it
 * has now). Only records whose purchase address IS this address -- the list
 * is keyed by it, and each record is checked again here.
 *
 * Returns `[{ reading, id }]`, newest purchase first, where `reading` is the
 * head of its chain as `loadCurrent` reaches it (a pending upgrade is shown
 * as the chart it still is, until its details are in).
 */
export async function chartsForEmail({ readings, index, email, secret, now = Date.now() }) {
  const e = normaliseEmail(email);
  const key = emailKey(e, secret);
  if (!key) return [];
  await ensureIndexed({ readings, index, secret, now }).catch(() => {});
  const list = await readList(index, key);

  const heads = new Map(); // head id -> reading
  /**
   * EIGHT RECORDS AT A TIME (10/21 live test, bug 7): read one after another,
   * 19 charts took ~20 s on "Sending...". Same records, same order, same answer.
   */
  const read = await mapLimit(list.charts, 8, async (entry) => {
    const cur = await loadCurrent(readings, entry.id, now).catch(() => null);
    // The head may have been bought with another address (an upgrade paid
    // from a different email). Then this address's own record is what it has.
    const own =
      cur && normaliseEmail(cur.reading.buyer?.email ?? "") !== e
        ? await loadReading(readings, entry.id, now).catch(() => null)
        : null;
    return { cur, own };
  });
  for (const { cur, own } of read) {
    if (!cur) continue; // past its year, or gone
    if (normaliseEmail(cur.reading.buyer?.email ?? "") !== e) {
      if (own && normaliseEmail(own.buyer?.email ?? "") === e) heads.set(own.id, own);
      continue;
    }
    heads.set(cur.id, cur.reading);
  }

  // One per person. A record whose chain it is part of has grown past it.
  const byPerson = new Map();
  const legacy = [];
  for (const r of heads.values()) {
    if (r.grewTo && heads.has(r.grewTo)) continue;
    if (r.legacy && !r.grewFrom) {
      legacy.push(r);
      continue;
    }
    const prev = byPerson.get(r.person);
    if (!prev || r.tier > prev.tier || (r.tier === prev.tier && r.purchasedAt > prev.purchasedAt)) byPerson.set(r.person, r);
  }
  // Older records: the same chart is the same person; keep the highest tier.
  const bySig = new Map();
  for (const r of legacy) {
    const sig = r.pending ? `pending:${r.id}` : signature(r.output);
    const prev = bySig.get(sig);
    if (!prev || r.tier > prev.tier || (r.tier === prev.tier && r.purchasedAt > prev.purchasedAt)) bySig.set(sig, r);
  }
  /**
   * AN OLDER RECORD OF A NEWER ONE'S CHART is that person too (10/21 live test,
   * bug 8): his Wichita Falls chart was listed twice, the 10/16 record and the
   * one bought that day. The newer one stays -- only when it goes as far: an
   * older READING is never hidden behind a newer summary.
   */
  const newSigs = new Map([...byPerson.values()].filter((r) => signature(r.output)).map((r) => [signature(r.output), r.tier]));
  const olderKept = [...bySig.values()].filter((r) => r.pending || !(newSigs.get(signature(r.output)) >= r.tier));
  return [...byPerson.values(), ...olderKept]
    .sort((a, b) => (b.purchasedAt ?? 0) - (a.purchasedAt ?? 0))
    .map((reading) => ({ reading, id: reading.id }));
}
