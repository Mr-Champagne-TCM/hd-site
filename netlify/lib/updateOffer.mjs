import { createHash } from "node:crypto";
import { loadReading, mintReadingLink } from "./reading.mjs";
import { updateOfferEmail } from "./updateOfferEmail.mjs";

/**
 * WHO GETS THE "UPDATED PDF" NOTE, AND SENDING IT ONCE (Jeremy 10/21).
 *
 * Pure planning plus one injected sender, so the whole run -- who is picked,
 * who is skipped and why, what is logged -- is tested with made-up records
 * and no network (test/pdfUpdateOffer.test.mjs). The one-off command around
 * it is tools/pdf-update-offer.mjs: a DRY RUN unless `--send` is given.
 *
 * RULES, in the order they are applied:
 *   1. Readable: `loadReading` serves it (within its year, not corrupt).
 *   2. Not a test: Jeremy's own addresses, made-up test names, 100%-off
 *      test purchases (paidCents 0) are all ours, never a buyer's.
 *   3. Ready: a PDF exists -- chart or reading tier, chart cast, and on the
 *      reading tier the words written. A summary has no PDF.
 *   4. Has an address. 5. One note per buyer (same address): the highest tier,
 *      then the latest; a record that grew into another is covered by it.
 *   6. Not already sent (the run log, by record id and by buyer).
 */

export const OWN_EMAILS = Object.freeze(
  (process.env.OWN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
); // Jeremy's own addresses come from the environment (OWN_EMAILS): never in this public repo
const MADE_UP = /\b(claude|test|asdf|example|sample|fake|demo)\b/i;

/** Why a record is ours rather than a buyer's; [] for a real buyer. */
export function testReasons(rec) {
  const email = String(rec?.buyer?.email ?? "").trim().toLowerCase();
  const reasons = [];
  if (OWN_EMAILS.includes(email)) reasons.push("own-email");
  if (/@(example\.(com|org|net)|test\b)/i.test(email)) reasons.push("example-email");
  if (MADE_UP.test(String(rec?.buyer?.name ?? ""))) reasons.push("made-up-name");
  if (MADE_UP.test(String(rec?.birth?.name ?? ""))) reasons.push("made-up-chart-name");
  if (rec?.paidCents === 0) reasons.push("test-code");
  return reasons;
}

/** A stable key for "this buyer" that is not their address. */
export function buyerKey(email) {
  return createHash("sha256").update(`pdf-update-offer:${String(email).trim().toLowerCase()}`).digest("hex").slice(0, 16);
}

/**
 * Decide who would get the note. `records` are what `loadReading` returned
 * (each with its `id`), or null for one that is not served. `sent` is the run
 * log: [{ id, buyer }]. Returns the picks and a count per skip reason -- no
 * names, no addresses.
 */
export function planOffer(records, sent = []) {
  const skipped = { notServed: 0, test: 0, summaryNoPdf: 0, notReady: 0, noAddress: 0, coveredByLater: 0, alreadySent: 0 };
  const sentIds = new Set(sent.map((s) => s.id));
  const sentBuyers = new Set(sent.map((s) => s.buyer));
  const candidates = [];
  for (const r of records) {
    if (!r) { skipped.notServed++; continue; }
    if (testReasons(r).length) { skipped.test++; continue; }
    if (r.tier < 1) { skipped.summaryNoPdf++; continue; }
    if (r.pending || (r.tier >= 2 && !r.reading)) { skipped.notReady++; continue; }
    if (!r.buyer?.email) { skipped.noAddress++; continue; }
    candidates.push(r);
  }
  // One per buyer: the highest tier, then the most recent purchase.
  const best = new Map();
  for (const r of candidates) {
    const k = buyerKey(r.buyer.email);
    const cur = best.get(k);
    if (!cur || r.tier > cur.tier || (r.tier === cur.tier && r.purchasedAt > cur.purchasedAt)) {
      if (cur) skipped.coveredByLater++;
      best.set(k, r);
    } else skipped.coveredByLater++;
  }
  const picks = [];
  for (const [k, r] of best) {
    if (r.grewTo || sentIds.has(r.id) || sentBuyers.has(k)) {
      if (r.grewTo) skipped.coveredByLater++;
      else skipped.alreadySent++;
      continue;
    }
    picks.push({ record: r, buyer: k });
  }
  picks.sort((a, b) => a.record.purchasedAt - b.record.purchasedAt);
  const byTier = { 1: 0, 2: 0 };
  for (const p of picks) byTier[p.record.tier]++;
  return { picks, skipped, byTier };
}

/** Load every record in the store through the same door the site uses. */
export async function loadAll(store, keys, now = Date.now()) {
  const out = [];
  for (const id of keys) {
    if (!/^[0-9a-f]{32}$/.test(id)) continue;
    out.push(await loadReading(store, id, now));
  }
  return out;
}

/**
 * Send to the picks, ONE AT A TIME, with a pause between (Resend's free plan
 * allows 2 a second and 100 a day; this stays far under both). Stops at `max`.
 * Every send that went is appended to the log BEFORE the next one starts, so
 * a crash mid-run never sends anyone a second note.
 *
 * `send` is mail.mjs `sendMail` bound to the key; `appendLog` writes one line.
 * Returns counts and the ids sent -- never an address.
 */
export async function sendOffer({ picks, option, secret, origin, links, send, appendLog, max = 10, delayMs = 1500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() }) {
  if (!secret) throw new Error("sendOffer: no GRANT_SECRET");
  if (!["A", "B"].includes(option)) throw new Error("sendOffer: --option A or B");
  const result = { sent: 0, failed: 0, ids: [] };
  for (const { record: r, buyer } of picks.slice(0, Math.min(max, 100))) {
    if (result.sent + result.failed > 0) await sleep(Math.max(delayMs, 600));
    const token = mintReadingLink({ id: r.id, tier: r.tier, now: now() }, secret);
    const { subject, html, text } = updateOfferEmail({
      tier: r.tier,
      name: r.birth?.name ?? r.buyer.name ?? null,
      pdfUrl: `${origin}/api/pdf?t=${encodeURIComponent(token)}`,
      pageUrl: `${origin}/r/${token}`,
      purchasedAt: r.purchasedAt * 1000,
      links,
      option,
    });
    let res;
    try {
      res = await send({ to: r.buyer.email, subject, html, text });
    } catch (e) {
      res = { ok: false, reason: e?.name ?? "threw" };
    }
    if (res?.ok) {
      result.sent++;
      result.ids.push(r.id.slice(0, 8));
      await appendLog({ at: new Date(now()).toISOString(), id: r.id, buyer, tier: r.tier, option, mail: res.id ?? null });
    } else {
      result.failed++;
      console.log(`pdf-update-offer: ${r.id.slice(0, 8)} not sent (${res?.reason ?? "unknown"})`);
    }
  }
  return result;
}
