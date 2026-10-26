import { cleanSource } from "../../shared/countSource.mjs";

/**
 * VISITS AND BUY CLICKS, COUNTED ON THIS SITE ONLY (10/26, Jeremy: "a yes"; the boosted post brought 96 visits
 * and no sale, and nothing could say where those visitors stopped).
 *
 * Two things are counted, as plain daily totals in this site's own store: a visit to the offer page, and a
 * click on a Buy button (which tier; a first purchase, a step further, or someone new). Each comes with one
 * word for where the visit came from (shared/countSource.mjs). Nothing else: no cookie, no address, no device,
 * no id, nothing that could tell one visitor from another, and no other company sees it. The privacy page
 * says so, and these are kept for KEEP_DAYS days (sweepCounts).
 *
 * One blob per count, its key the whole record (`day/event/source/tier/kind/stamp`): writing never reads, so
 * two counts at once can never lose one, and a day's totals are a listing of its keys (tools/counts-report.mjs).
 */
export const COUNTS_STORE = "counts";
export const KEEP_DAYS = 90;
const EVENTS = new Set(["visit", "buy"]);
const KINDS = new Set(["new", "upgrade", "someone"]);

/** The day as Jeremy's calendar has it (New York), "2026-10-26". */
export function countDay(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** The key for one count, or null when the body is not one (anything unexpected is simply not counted). */
export function countKey(body, now, rand = Math.random) {
  if (!body || typeof body !== "object" || !EVENTS.has(body.e)) return null;
  const src = cleanSource(body.src) ?? "other";
  let tier = "-";
  let kind = "-";
  if (body.e === "buy") {
    if (![0, 1, 2].includes(body.tier)) return null;
    tier = String(body.tier);
    kind = KINDS.has(body.kind) ? body.kind : "new";
  }
  const stamp = `${now}-${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0")}`;
  return `${countDay(now)}/${body.e}/${src}/${tier}/${kind}/${stamp}`;
}

/** POST /api/count: counted or not, the answer is the same empty 204 (a page never waits on it or learns from it). */
export async function handleCount({ text, store, now = Date.now(), rand = Math.random }) {
  if (typeof text !== "string" || text.length > 400) return 204;
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    return 204;
  }
  const key = countKey(body, now, rand);
  if (!key) return 204;
  try {
    await store.set(key, "1");
  } catch {
    /* a missed count is a missed count */
  }
  return 204;
}

/** Deletes counts older than KEEP_DAYS days. Never throws: the next sweep tries again. */
export async function sweepCounts(store, { now = Date.now(), keepDays = KEEP_DAYS } = {}) {
  const out = { listed: 0, deleted: 0, failed: 0 };
  const cutoff = countDay(now - keepDays * 86_400_000);
  let keys = [];
  try {
    keys = ((await store.list())?.blobs ?? []).map((b) => b.key);
  } catch {
    out.failed++;
    return out;
  }
  out.listed = keys.length;
  for (const key of keys) {
    if (!(key.slice(0, 10) < cutoff)) continue;
    try {
      await store.delete(key);
      out.deleted++;
    } catch {
      out.failed++;
    }
  }
  return out;
}
