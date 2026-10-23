import { carryAddedTime, loadCurrent, loadReading, mintReadingLink, readReadingLink, retimeReading } from "./reading.mjs";
import { open as openSealed, seal } from "./sig.mjs";
import { buildCorrection } from "./correction.mjs";
import { check, record } from "./ratelimit.mjs";
import { customerError, describe as describeKind, engineKind } from "./failures.mjs";
import { MESSAGES, forTier } from "../../shared/customerMessages.mjs";
import { summaryOnly } from "./handler.mjs";
import { birthLine } from "../../shared/birthLine.mjs";
import { TIERS } from "../../shared/pricing.mjs";
import { buyerNameFor } from "../../shared/chartName.mjs";

/**
 * "FOUND YOUR BIRTH TIME? YOU'RE WELCOME TO ADD IT HERE, ONCE AND FREE"
 * (Jeremy 10/22: "they can 'update birth time at no cost and get an updated
 * reading'"; "Yes self-serve"; "TEST THIS HARD!!!!").
 *
 * A chart cast at noon because the birth time was not known can have the time
 * added ONCE, by the buyer, with nothing to pay: the chart is cast again with
 * the time known, the details and the chart it replaces go into the record's
 * history (support only), the page shows the calm correction note, and on the
 * reading tier the reading is written again. Once used, the offer is gone
 * everywhere -- it was shown only for a chart with an unknown time -- and both
 * ways in say kindly that it has been used.
 *
 * TWO WAYS IN, ONE FORM:
 *   - the reading page's own link, \`/r/<reading link>#add-time\` (six days,
 *     like every reading link);
 *   - the PDF's link, which must not expire (the PDF is kept for years):
 *     \`/t/<add-time key>\`. The key is \`{ a: <record id>, k: "t" }\` sealed with
 *     GRANT_SECRET (sig.mjs, the reading link's own HMAC): no expiry, no birth
 *     data, a shape a reading-link reader refuses (and the other way round),
 *     and it can do ONE thing -- add a birth time to that one chart, once. It
 *     works for as long as the record is kept (its year); after that the page
 *     says the chart is no longer kept.
 *
 * Both are resolved to the chart the link now speaks for (\`loadCurrent\`: an
 * old link after an upgrade means the grown chart), so a chain has one chart
 * with one offer.
 */

const ID = /^[0-9a-f]{32}$/;

/** The PDF's never-expiring "add it here" key for one record. */
export function mintAddTimeKey(id, secret) {
  if (!secret) throw new Error("mintAddTimeKey: no secret");
  if (!ID.test(String(id))) throw new Error("mintAddTimeKey: bad id");
  return seal({ a: id, k: "t" }, secret);
}

/** Read an add-time key: { ok, id } or { ok: false, reason }. */
export function readAddTimeKey(key, secret) {
  const o = openSealed(key, secret);
  if (!o.ok) return { ok: false, reason: o.reason };
  const p = o.payload;
  if (p?.k !== "t" || typeof p?.a !== "string" || !ID.test(p.a)) return { ok: false, reason: "malformed" };
  return { ok: true, id: p.a };
}

/**
 * Where a record stands:
 *   open     a filled chart cast with an unknown time, the offer not yet used
 *   used     the birth time was added already (this chart, or the one it grew from)
 *   known    cast from a known birth time: nothing to add
 *   pending  no chart yet (the ordinary birth-details form is the way in)
 *   none     no birth details kept (a record from before 16 Oct 2026)
 */
export function addTimeState(r) {
  if (!r) return "none";
  if (r.pending) return "pending";
  if (r.timeAdded) return "used";
  if (!r.birth) return "none";
  if (r.birth.timeKnown !== false || r.output?.timeKnown !== false) return "known";
  return "open";
}

/** "December 5, 2001 · Spokane, Washington": the kept details, without the time (that is what is being added). */
export function datePlaceLine(birth) {
  const line = birthLine(birth);
  if (!line) return null;
  return line
    .split(" · ")
    .filter((p) => !/^Time unknown/.test(p) && !/^\d{1,2}:\d{2} [AP]M$/.test(p))
    .join(" · ");
}

/** "HH:MM", 24-hour, as the time box sends it. */
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** How long a claimed add stays claimed: one engine call and one write fit well inside. */
export const CLAIM_MS = 60_000;

/**
 * POST /api/add-time, with everything outside passed in (tests run it with no
 * network, no clock and no Netlify).
 *
 *   body       { token } (a reading link) or { key } (the PDF's add-time key),
 *              and { look: true } to ask where it stands, or { time: "HH:MM" }
 *   readings   the readings store
 *   counters   { keyFor(ip), load(key), save(key, hits) } -- the per-visitor limit
 *   claims     { get(id), set(id, at), del(id) } -- one add at a time per chart
 *   engine     the engine's /v1/chart, as { ok, status, payload }
 *   deliver    ({ id, tier }) -> rings the writer (reading tier) or sends the
 *              "ready" email with a fresh link (summary, chart)
 *   report     ({ kind, detail, paid, ref }) -> noted at its severity
 *   sleep      (ms) -> a pause, while a second submit waits for the first
 *
 * Nothing about the birth is ever logged or reported: the record's ref and
 * the tier only.
 */
export async function handleAddTime({ body, ip, now = Date.now(), readings, counters, claims, engine, secret, deliver = null, report = null, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const note = async (kind, detail, ref = null) => {
    if (typeof report !== "function") return;
    try {
      await report({ kind, detail, paid: true, ...(ref ? { ref } : {}) });
    } catch {
      /* a reporter that fails never fails the person waiting */
    }
  };
  // A summary is said as a summary ("your summary wasn't redone", "this summary has its time"), 10/22.
  let summary = false;
  const fail = (kind, opts = {}, extra = {}) => {
    const base = describeKind(kind).customer;
    const customer = summary && base && MESSAGES[`${base}-summary`] ? `${base}-summary` : undefined;
    const { status, payload } = customerError(kind, { paid: true, ...(customer ? { customer } : {}), ...opts });
    return json(status, { ...payload, ...extra });
  };

  let request;
  try {
    request = JSON.parse(body);
  } catch {
    return fail("addtime-bad-request");
  }

  /* --- which chart: the reading link, or the PDF's key --- */
  const via = typeof request?.key === "string" ? "pdf" : "page";
  let firstId;
  if (via === "pdf") {
    const k = readAddTimeKey(request.key, secret);
    // Cut short in the copying, or not ours: said as the PDF's link it is.
    if (!k.ok) return fail(k.reason === "misconfigured" ? "addtime-misconfigured" : "addtime-key-bad");
    firstId = k.id;
  } else {
    const link = readReadingLink(request?.token, secret, now);
    if (!link.ok) {
      if (link.reason === "expired") return fail("reading-link-expired", { customer: forTier("reading-link-expired", link.tier) });
      if (link.reason === "misconfigured") return fail("addtime-misconfigured");
      return fail("addtime-link-bad");
    }
    firstId = link.id;
  }

  let current;
  try {
    current = await loadCurrent(readings, firstId, now, { strict: true });
  } catch (e) {
    return fail("addtime-store-unavailable", {}, {});
  }
  if (!current) {
    // A key we signed whose record is past its year: say so, calmly. A reading
    // link that names nothing is the same "could not be opened" as everywhere.
    return via === "pdf" ? fail("addtime-gone") : fail("addtime-link-bad");
  }
  const rec = current.reading;
  const ref = { reading: current.id, tier: rec.tier };
  const state = addTimeState(rec);
  summary = rec.tier === 0;

  if (request?.look === true) {
    return json(200, {
      state,
      tier: rec.tier,
      label: TIERS[rec.tier]?.label ?? null,
      // Whose chart, for the title -- as the reading page names it.
      name: rec.birth?.name ?? buyerNameFor(rec),
      // Which chart: the kept date and place (never the zone, never anything else).
      kept: state === "open" ? datePlaceLine(rec.birth) : null,
    });
  }

  if (state === "used") return fail("addtime-used", {}, { state });
  if (state === "known") return fail("addtime-known", {}, { state });
  if (state === "pending") return fail("addtime-pending", {}, { state });
  if (state !== "open") return fail("addtime-none", {}, { state });

  const time = typeof request?.time === "string" ? request.time.trim() : "";
  const m = TIME.exec(time);
  if (!m) return fail("addtime-check-time");
  const hhmm = `${m[1].padStart(2, "0")}:${m[2]}`;

  /* --- the per-visitor limit (it protects the engine, as the chart form's does) --- */
  let key = null;
  let hits = [];
  try {
    key = await counters.keyFor(ip);
    hits = await counters.load(key);
  } catch {
    key = null;
  }
  const verdict = check(hits, now);
  if (!verdict.allowed) return fail("chart-rate-limited", { message: verdict.message });
  if (key !== null) {
    try {
      await counters.save(key, record(hits, now));
    } catch {
      /* the counter is ours; the buyer is not failed for it */
    }
  }

  /**
   * ONE ADD AT A TIME PER CHART. A double-tapped button (or two tabs) is one
   * recast: the second request finds the claim and waits for the first to
   * finish, then answers as it did. A claim older than CLAIM_MS is a request
   * that died; it is taken over.
   */
  let claimed = null;
  try {
    claimed = await claims.get(current.id);
  } catch {
    claimed = null;
  }
  if (Number.isFinite(claimed) && now - claimed < CLAIM_MS) {
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const again = await loadReading(readings, current.id, now).catch(() => null);
      if (again?.timeAdded) return json(200, done(via, current.id, rec.tier, secret, now));
    }
    return fail("addtime-busy");
  }
  try {
    await claims.set(current.id, now);
  } catch {
    /* no claim store: the record's own flag still stops a second write */
  }
  const release = async () => {
    try {
      await claims.del(current.id);
    } catch {
      /* it expires on its own */
    }
  };

  /* --- cast again, the time known, at the tier that was bought --- */
  const was = rec.birth;
  // Only the time changes: the name the chart was cast for stays (so the note says nothing else changed).
  const birth = { date: was.date, time: hhmm, zone: was.zone, place: was.place, timeKnown: true, ...(was.name ? { name: was.name } : {}) };
  let upstream;
  try {
    upstream = await engine({ birth: { date: birth.date, time: birth.time, zone: birth.zone, timeKnown: true }, tier: Math.max(rec.tier, 1) });
  } catch (e) {
    await release();
    const kind = e?.name === "AbortError" || e?.name === "TimeoutError" ? "engine-timeout" : "engine-unreachable";
    await note("addtime-engine", `${kind}, tier ${rec.tier}: ${e?.name ?? "Error"}`, ref);
    return fail("addtime-engine");
  }
  if (!upstream?.ok || !upstream.payload) {
    await release();
    const kind = engineKind(upstream?.status, upstream?.payload?.error?.code);
    const detail = `${kind}, tier ${rec.tier}: engine ${upstream?.status ?? "?"} ${upstream?.payload?.error?.code ?? ""}`.trim();
    // A time the engine refuses is the one thing the buyer can fix (noted at its own kind, no page).
    if (kind === "engine-400-bad-time") {
      await note(kind, `add-time, ${detail}`, ref);
      return fail("addtime-check-time");
    }
    await note("addtime-engine", detail, ref);
    return fail("addtime-engine");
  }
  const output = rec.tier === 0 ? summaryOnly(upstream.payload) : upstream.payload;

  /* --- keep it: the old details and chart to history, the note, the flag --- */
  const correction = buildCorrection({ type: "time-added", was, now: birth, before: rec.output, after: output, at: now });
  let saved;
  for (let attempt = 0; attempt < 2 && !saved; attempt++) {
    try {
      saved = await retimeReading(readings, current.id, { output, birth, correction, via }, now);
    } catch {
      saved = null;
    }
  }
  if (!saved) {
    await release();
    await note("addtime-not-saved", `tier ${rec.tier}`, ref);
    return fail("addtime-not-saved");
  }
  if (!saved.ok) {
    await release();
    // Another request got there first (its flag is on the record now): the same answer it had.
    if (saved.reason === "already_added") return json(200, done(via, current.id, rec.tier, secret, now));
    return fail(saved.reason === "time_known" ? "addtime-known" : "addtime-none");
  }
  // The record's own flag holds from here; the claim is not needed any more.
  await release();

  // A paid upgrade of this chart, not cast yet, carries the time and the spent offer.
  if (rec.grewTo) {
    try {
      await carryAddedTime(readings, rec.grewTo, { birth, timeAdded: { at: Math.floor(now / 1000), via } }, now);
    } catch {
      /* the upgrade still has its own form; nothing is lost */
    }
  }

  // Jeremy hears of every use: which record, which tier, which way in. No birth data.
  await note("time-added", `tier ${rec.tier}, via the ${via === "pdf" ? "PDF" : "reading page"}`, ref);

  if (typeof deliver === "function") {
    try {
      await deliver({ id: current.id, tier: rec.tier });
    } catch (e) {
      await note("ready-email", `add-time, tier ${rec.tier}: ${e?.name ?? "Error"}`, ref);
    }
  }
  return json(200, done(via, current.id, rec.tier, secret, now));
}

/**
 * The answer to a finished add. From the PDF's key there is no reading link in
 * hand, so a fresh one comes back for the page to open (the "ready" email
 * carries one too). From the page, it reloads its own link.
 */
function done(via, id, tier, secret, now) {
  return { ok: true, tier, ...(via === "pdf" ? { token: mintReadingLink({ id, tier, now }, secret) } : {}) };
}

function json(status, payload) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
    body: JSON.stringify(payload),
  };
}
