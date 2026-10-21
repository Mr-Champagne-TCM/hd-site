import { createHmac, randomBytes } from "node:crypto";
import { open as openSealed, seal } from "./sig.mjs";
import { cleanChartName } from "../../shared/chartName.mjs";

/**
 * The kept reading, and the one link that reaches it.
 *
 * WHAT IS KEPT. Jeremy's first ruling was "They enter birth data, we compute
 * with it and discard, then we keep the engine outputs (ALL) and store that."
 * On 16 October 2026 he changed it -- "a veer from our initial approach" -- so
 * the PDF can print the birth line under the name, as the phone's PDF does:
 *
 *   A PAID CHART (the chart tier and the reading tier) now also keeps the
 *   birth details it was cast from -- the date, the local time (or that it
 *   was unknown), the place as it was picked, and the time zone -- in their
 *   own `birth` block, beside the engine's output and never inside it.
 *
 * Nothing else about the birth is kept: no coordinates, no UTC instant.
 *
 * 20 OCTOBER 2026 (release 2, Jeremy: "capture birth details even for
 * summary"): THE SUMMARY KEEPS THEM TOO, so going a step further never means
 * typing them again. One privacy sentence for every tier says so (copy.ts).
 *
 * RELEASE 2 ALSO ADDS, all optional and all read with defaults, so every
 * record written before it loads exactly as it did (no migration):
 *
 *   person     WHICH PERSON'S CHART this is: the id of the first record in
 *              its chain. Absent on older records -> the record's own id
 *              (and `legacy: true`, so the "Email me my charts" list can still
 *              group an older summary with the reading it grew into).
 *   grewFrom   the record this purchase upgraded (Stripe metadata `upgrades`,
 *              set by the checkout from a verified link). Absent -> null.
 *   grewTo     the record that upgraded this one. An old link follows it and
 *              opens the grown chart ("Your chart has grown"). Absent -> null.
 *   fresh      bought from "Start a new chart for someone else".
 *   history    EARLIER BIRTH DETAILS, when "Change a detail" corrected them:
 *              [{ at, was, changed }]. For support lookup only -- never sent
 *              to a page, a PDF or an email. Absent -> [].
 *   correction the calm note the reading page shows after a correction (or
 *              after an older summary's details were typed once): what was
 *              changed and which chart values moved. Absent -> null.
 *
 * THE CREDIT BELONGS TO ITS OWN CHART. Only a purchase that upgrades this very
 * record is credited with what it cost (checkout.mjs `upgradeCredit`), and once
 * it has grown, its old link speaks for the grown one -- so the same credit can
 * never come off a second purchase.
 *
 * Same store, same record and same lifetime as the reading itself: written
 * once with the chart (`fillReading`), carried through `fillInterpretation`,
 * served for READING_TTL_SECONDS from the purchase by `loadReading`. NOTE:
 * nothing in this repo deletes a record after that year -- `loadReading` stops
 * serving it, but the blob stays in the store until removed by hand.
 *
 * Records written before 16 October 2026 have no `birth` block; they load
 * with `birth: null` and their PDF simply has no birth line.
 *
 * WHAT IS KEPT ABOUT THE BUYER, named by Jeremy and kept complete rather than
 * whittled down: name, email, phone, the time of the purchase and what was
 * purchased.
 *
 * That list is not an oversight to be trimmed later -- each entry has a job. The
 * email is where a re-send goes (D-9, and never to an address supplied in a
 * request). The phone is where a text goes when texting exists. The name is how
 * the page says whose reading this is. The time and the purchase type are the
 * receipt: what was bought, when, so that an upgrade knows what has already
 * been paid for.
 *
 * TWO CLOCKS, and they are different on purpose (D-9d). The LINK is short --
 * six days -- because a link is a bearer token and anyone holding it is the
 * holder. The READING is kept a year, because that is the promise attached to
 * the purchase. A dead link on a live reading is a re-send; a dead reading is
 * gone.
 */

/** D-9d. Six days for the link, a year for the thing it points at. */
export const LINK_TTL_SECONDS = 6 * 24 * 60 * 60;
export const READING_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * 128 bits from the system CSPRNG.
 *
 * The id is not a secret -- the signature on the link is what makes it
 * unreachable -- but it must not be guessable either, because a guessable id
 * turns any future listing bug into a way to walk the whole store.
 */
export function newReadingId() {
  return randomBytes(16).toString("hex");
}

/**
 * THE ID OF THE READING A PARTICULAR PAYMENT BUYS.
 *
 * One payment must produce exactly one reading, and until now nothing enforced
 * that. `claim` minted a fresh random id every time it ran, and nothing
 * anywhere recorded that a Stripe session had already been claimed -- so the
 * same session id, which sits in the buyer's own browser history, could be
 * posted to /api/claim again and again and mint another reading and another
 * delivery email each time.
 *
 * Deriving the id FROM the session makes the operation idempotent without a
 * lock, a flag or a second store: the same payment always computes the same
 * id, so the second claim finds the first one's work and hands back the same
 * link. There is nothing to keep in sync and nothing to clean up.
 *
 * HMAC RATHER THAN A PLAIN HASH, keyed with the grant secret, for the reason
 * `newReadingId` is random in the first place: the id must not be guessable.
 * A bare sha256 of the session id would mean anyone holding a session id --
 * it travels in a URL -- could compute the storage key directly, which turns
 * any future listing bug into a way to reach a specific person's reading.
 *
 * Same 32-hex shape as a random one, so every existing id check and every
 * reading already in the store stays exactly as valid as it was.
 */
export function readingIdForSession(sessionId, secret) {
  if (typeof sessionId !== "string" || !sessionId) throw new Error("readingIdForSession: no session");
  if (!secret) throw new Error("readingIdForSession: no secret");
  return createHmac("sha256", secret).update(`session:${sessionId}`).digest("hex").slice(0, 32);
}

/** A reading id, as it must look before it is allowed near a store. */
const ID = /^[0-9a-f]{32}$/;

/**
 * Save a reading. Returns its id.
 *
 * `output` is the engine's response, stored whole. Nothing is picked out of it
 * here: a field this module does not know about is a field a later tier will
 * want, and the failure mode of choosing is silently losing something.
 *
 * IT MAY ALSO BE NULL, which is how every reading starts.
 *
 * The order of events is Jeremy's ruling and it runs backwards from what you
 * would guess: somebody pays FIRST, and only then is there a form to enter a
 * birth moment into. "No birth data entry available until a payment succeeds
 * and signed link provided access to this form."
 *
 * So a record is written the moment the money settles, holding the receipt --
 * who bought, what, when -- and no chart at all. The link points at it
 * immediately, because the link is how they reach the form. `fillReading` puts
 * the chart in later, once.
 *
 * A pending reading is a real reading with nothing computed yet, which is a
 * different thing from a reading that does not exist, and the two must never
 * be confused: one means "enter your details", the other means "this link is
 * not real".
 */
export async function saveReading(
  store,
  {
    tier,
    output,
    name,
    email,
    phone,
    sku,
    purchasedAt,
    paidCents = null,
    id = null,
    now = Date.now(),
    // Release 2: whose chart, what it grew from, kept details carried over.
    person = null,
    grewFrom = null,
    fresh = false,
    birth = null,
    history = null,
  },
) {
  if (!Number.isInteger(tier) || tier < 0 || tier > 2) throw new Error(`saveReading: bad tier ${tier}`);
  // Null is a pending reading. Anything else that is not an object is a caller
  // bug, and undefined is caught here rather than becoming a silent pending.
  if (output !== null && (!output || typeof output !== "object")) {
    throw new Error("saveReading: output must be an object or null");
  }

  // Belt and braces on the promise above. If a birth field ever reaches this
  // function it is a bug upstream, and the right behaviour is to refuse
  // loudly rather than to store it and be quietly wrong about the privacy copy.
  if (output) refuseBirthData(output);

  // An id supplied by the caller is a DELIBERATE one -- see readingIdForSession
  // -- and is what makes claiming the same payment twice harmless. Anything
  // else keeps the random id it always had.
  if (id !== null && !ID.test(id)) throw new Error(`saveReading: bad id ${id}`);
  const readingId = id ?? newReadingId();
  await store.setJSON(readingId, {
    v: 1,
    tier,
    // Explicitly null rather than absent. `loadReading` tells a pending record
    // from a corrupt one by whether the key is THERE, so the difference has to
    // be written down rather than implied by omission.
    output: output ?? null,
    // The buyer, as five fields and no more. Written explicitly rather than by
    // spreading whatever the caller passed: a spread is how an extra field
    // arrives in a store nobody meant to put it in, which is exactly the
    // failure the birth-data guard above exists to prevent.
    buyer: {
      name: nameCase(name),
      email: str(email),
      phone: str(phone),
    },
    // What was bought and when. `purchasedAt` comes from the payment and is the
    // one that matters for the year-long promise; `createdAt` is when this
    // record was written, which is usually seconds later and occasionally is
    // not -- a reading re-rendered after a fix keeps its purchase date.
    sku: str(sku),
    purchasedAt: Number.isFinite(purchasedAt) ? Math.floor(purchasedAt / 1000) : Math.floor(now / 1000),
    // What was actually paid, in cents, from Stripe's own session (fix 4A, 10/19: the
    // receipt email says it). A 100%-off code is 0. Absent on older records.
    ...(Number.isInteger(paidCents) && paidCents >= 0 ? { paidCents } : {}),
    createdAt: Math.floor(now / 1000),
    // WHICH PERSON'S CHART (release 2): its own id unless it grew from another.
    person: ID.test(String(person)) ? person : readingId,
    ...(ID.test(String(grewFrom)) ? { grewFrom } : {}),
    ...(fresh === true ? { fresh: true } : {}),
    // An upgrade carries the kept details over, so there is nothing to retype.
    ...(birthRecord(birth) ? { birth: birthRecord(birth) } : {}),
    ...(cleanHistory(history).length ? { history: cleanHistory(history) } : {}),
  });
  return readingId;
}

/**
 * EVERY FIELD A RECORD CARRIES, rebuilt one by one (never spread), with
 * `patch` laid over what was loaded. One place, so a field added later -- as
 * release 2 added six -- cannot be dropped by one of the three writers that
 * used to list them each by hand.
 *
 * `person` is written only when the record already had one or the patch sets
 * it: an older record stays recognisably older (`legacy`) until a release-2
 * flow says whose chart it is.
 */
function serialize(existing, patch = {}) {
  const r = { ...existing, ...patch };
  const hist = cleanHistory(r.history);
  return {
    v: 1,
    tier: r.tier,
    output: r.output ?? null,
    buyer: r.buyer,
    sku: r.sku ?? null,
    purchasedAt: r.purchasedAt,
    ...(Number.isInteger(r.paidCents) ? { paidCents: r.paidCents } : {}),
    createdAt: r.createdAt,
    ...(r.filledAt ? { filledAt: r.filledAt } : {}),
    ...(r.birth ? { birth: r.birth } : {}),
    ...(typeof r.reading === "string" ? { reading: r.reading } : {}),
    ...(r.writtenAt ? { writtenAt: r.writtenAt } : {}),
    ...(!r.legacy || "person" in patch ? { person: r.person } : {}),
    ...(r.grewFrom ? { grewFrom: r.grewFrom } : {}),
    ...(r.grewTo ? { grewTo: r.grewTo } : {}),
    ...(r.fresh ? { fresh: true } : {}),
    ...(hist.length ? { history: hist } : {}),
    ...(r.correction ? { correction: r.correction } : {}),
  };
}

/** History entries as kept: when, the details as they were, what changed. Nothing else. */
function cleanHistory(h) {
  if (!Array.isArray(h)) return [];
  return h
    .filter((e) => e && typeof e === "object" && Number.isFinite(e.at))
    .map((e) => ({
      at: Math.floor(e.at),
      was: birthRecord(e.was),
      changed: Array.isArray(e.changed) ? e.changed.filter((c) => typeof c === "string").slice(0, 8) : [],
    }))
    .slice(-20);
}

/**
 * A NAME, CAPITALISED ONCE, HERE.
 *
 * Jeremy: "auto capitalize their name(s)... we can support a bit and look
 * professional with this." Somebody typing `asdf asdf` into Stripe at half past
 * eleven gets `Asdf Asdf` on their reading, and the page stops looking like it
 * was assembled from whatever was in the box.
 *
 * HIS RULE, and it is narrower than title-casing on purpose: uppercase the
 * first letter of each term and LEAVE THE REST ALONE. So `McDonald` survives as
 * `McDonald` rather than being flattened to `Mcdonald`, which is what a naive
 * title-case does to half the surnames in Scotland.
 *
 * Terms break on spaces, hyphens and apostrophes, so `o'brien` becomes
 * `O'Brien` and `mary-jane` becomes `Mary-Jane`. He asked for O'Brien by
 * spelling it that way.
 *
 * DONE AT THE STORE, not at each place that displays it. The email, the reading
 * page and the entry form all show this name; capitalising in three places is
 * how they come to disagree, and there is no reason to keep the raw form.
 */
export function nameCase(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  // The character AFTER a boundary is what gets raised. Everything else is
  // left exactly as typed.
  return trimmed.replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/** Empty string, whitespace and anything that is not a string all become null. */
function str(v) {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Load a reading. Returns null for anything that is not a readable one.
 *
 * Expiry is checked HERE rather than left to the store, because Netlify Blobs
 * has no TTL of its own -- a reading past its year is still sitting there, and
 * "still in the bucket" must not mean "still served".
 */
export async function loadReading(store, id, now = Date.now(), { strict = false } = {}) {
  if (typeof id !== "string" || !ID.test(id)) return null;
  let raw;
  try {
    raw = await store.get(id, { type: "json" });
  } catch (e) {
    /**
     * STRICT: a store that did not answer is NOT a reading that is not there
     * (10/16). The customer paths ask strictly, so a blip is told as "on our
     * side, your reading is safe" rather than "that link could not be opened"
     * -- and so a repeat claim cannot mistake a blip for "never saved" and
     * write a blank pending record over a reading that has a chart.
     */
    if (strict) throw e;
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  if (!Number.isInteger(raw.tier)) return null;
  // PRESENT-BUT-NULL is pending; ABSENT is corrupt. A record with no `output`
  // key at all was not written by saveReading, and serving it as "pending"
  // would invite somebody to enter a birth moment into a record we do not
  // understand.
  if (!("output" in raw)) return null;
  if (raw.output !== null && typeof raw.output !== "object") return null;

  // Measured from the PURCHASE, not from when the record happened to be
  // written. The year belongs to what was bought; re-rendering a reading must
  // not quietly extend it, and must not shorten it either.
  const bought = raw.purchasedAt ?? raw.createdAt ?? 0;
  if (Math.floor(now / 1000) - bought > READING_TTL_SECONDS) return null;

  return {
    tier: raw.tier,
    output: raw.output,
    /** Nothing computed yet: they have paid, and not yet said when they were born. */
    pending: raw.output === null,
    // v1 records written before the buyer block existed carried a bare `email`.
    // Read both, so an early reading does not lose the one address it has.
    buyer: raw.buyer ?? { name: null, email: raw.email ?? null, phone: null },
    sku: raw.sku ?? null,
    purchasedAt: bought,
    paidCents: Number.isInteger(raw.paidCents) ? raw.paidCents : null,
    createdAt: raw.createdAt ?? 0,
    /** When the chart was cast. Carried so a later write cannot reset it. */
    filledAt: raw.filledAt ?? 0,
    /**
     * The written interpretation, when one has been filed. Absent on every
     * tier below 2 because none was ever asked for -- and read straight
     * through rather than parsed, so what is stored stays the thing that was
     * validated.
     */
    reading: typeof raw.reading === "string" ? raw.reading : null,
    writtenAt: raw.writtenAt ?? 0,
    /** The birth details the chart was cast from (16 Oct 2026 on); null before that. */
    birth: birthRecord(raw.birth),
    // --- release 2: every one defaulted, so an older record loads unchanged ---
    id,
    /** Which person's chart. An older record is its own person. */
    person: ID.test(String(raw.person)) ? raw.person : id,
    /** No `person` written: from before release 2 (see `serialize`). */
    legacy: !ID.test(String(raw.person)),
    grewFrom: ID.test(String(raw.grewFrom)) ? raw.grewFrom : null,
    grewTo: ID.test(String(raw.grewTo)) ? raw.grewTo : null,
    fresh: raw.fresh === true,
    /** Earlier details, for support only. Never returned to a page. */
    history: cleanHistory(raw.history),
    correction: raw.correction && typeof raw.correction === "object" ? raw.correction : null,
  };
}

/**
 * THE CHART THIS LINK NOW SPEAKS FOR (release 2, Jeremy 10/19 "2 yes").
 *
 * An upgrade is a new record, so the link in the first email still names the
 * old one. Once the upgrade has a chart, that old link opens the grown one --
 * "Your chart has grown, this is now your reading". Followed only to a record
 * that is filled and higher, at most a few steps (summary -> chart -> reading),
 * so a paid-but-not-yet-entered upgrade leaves the old chart showing.
 *
 * Returns `{ reading, id, grown }`, or null when the starting record is not
 * readable. `strict` is passed through for the first load only: a blip on a
 * later step leaves the link on the chart it already reached.
 */
export async function loadCurrent(store, id, now = Date.now(), { strict = false } = {}) {
  const first = await loadReading(store, id, now, { strict });
  if (!first) return null;
  let at = first;
  for (let hop = 0; hop < 4 && at.grewTo; hop++) {
    let next = null;
    try {
      next = await loadReading(store, at.grewTo, now);
    } catch {
      next = null;
    }
    if (!next || next.pending || next.tier <= at.tier) break;
    at = next;
  }
  return { reading: at, id: at.id, grown: at.id !== first.id, first };
}

/**
 * Rewrite a record with a few fields changed, everything else carried
 * (`serialize`). For the release-2 links between records -- `grewTo` on the
 * one that was upgraded -- never for the chart or the words, which stay
 * write-once in `fillReading` / `fillInterpretation`.
 */
export async function updateRecord(store, id, patch, now = Date.now()) {
  const existing = await loadReading(store, id, now, { strict: true });
  if (!existing) return { ok: false, reason: "not_found" };
  const allowed = {};
  for (const k of ["grewTo", "person"]) if (k in patch) allowed[k] = patch[k];
  await store.setJSON(id, serialize(existing, allowed));
  return { ok: true };
}

/**
 * Mint the one link.
 *
 * D-11: there is ONE signed URL per purchase. Not a view link and an upgrade
 * link and a re-send link -- one, whose payload says which reading and which
 * tier, and the page is a function of that. Three links would be three things
 * to expire, three to leak, and three to get out of step.
 */
export function mintReadingLink({ id, tier, ttlSeconds = LINK_TTL_SECONDS, now = Date.now() }, secret) {
  if (!secret) throw new Error("mintReadingLink: no secret");
  if (!ID.test(String(id))) throw new Error("mintReadingLink: bad id");
  if (!Number.isInteger(tier) || tier < 0 || tier > 2) throw new Error(`mintReadingLink: bad tier ${tier}`);
  return seal({ r: id, t: tier, x: Math.floor(now / 1000) + ttlSeconds }, secret);
}

/**
 * Read a link, and say why not if it cannot be read.
 *
 * The tier is taken from the SIGNED payload and never from the stored record
 * on its own, so that a link minted for the chart tier cannot be pointed at a
 * reading-tier record and come back with more than it was sold. The lower of
 * the two wins, which is checked where they meet rather than assumed here.
 */
export function readReadingLink(token, secret, now = Date.now()) {
  const opened = openSealed(token, secret);
  if (!opened.ok) return { ok: false, reason: opened.reason };

  const p = opened.payload;
  if (typeof p?.r !== "string" || !ID.test(p.r)) return { ok: false, reason: "malformed" };
  if (!Number.isInteger(p?.t) || p.t < 0 || p.t > 2) return { ok: false, reason: "malformed" };
  if (typeof p?.x !== "number" || p.x * 1000 <= now) return { ok: false, reason: "expired" };

  return { ok: true, id: p.r, tier: p.t };
}

/**
 * THE ENGINE'S OUTPUT NEVER CARRIES BIRTH FIELDS. The birth details a paid
 * chart keeps live in their own `birth` block (see `birthRecord`), so a birth
 * field turning up INSIDE the output is still a bug upstream and is refused.
 */
function refuseBirthData(output) {
  for (const forbidden of ["date", "time", "zone", "utc", "birth", "place", "lat", "lon"]) {
    if (forbidden in output) throw new Error(`saveReading: output carries birth data (${forbidden})`);
  }
}

/**
 * The birth details a paid chart keeps, as five fields and no more:
 * { date, time, timeKnown, place, zone } -- and, since 19 October 2026, the
 * optional NAME FOR THE CHART typed on the same form (Jeremy, fix 17A: the
 * page and PDF title "Alex's Human Design"). Kept with the reading exactly as
 * the birth details are, for the same year; never sent to the engine or the
 * writer. Absent when none was typed.
 *
 * Built field by field rather than copied, so nothing else a request carried
 * (coordinates, a UTC instant, a stray field) can ride along into the store.
 * Anything unusable becomes null: a reading without a birth line is fine, a
 * wrong one is not.
 */
export function birthRecord(b) {
  if (!b || typeof b !== "object") return null;
  const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date.trim()) ? b.date.trim() : null;
  const zone = typeof b.zone === "string" && /^[A-Za-z][A-Za-z0-9_+\-/]{1,63}$/.test(b.zone.trim()) ? b.zone.trim() : null;
  if (!date || !zone) return null;
  const timeKnown = b.timeKnown !== false;
  const time =
    timeKnown && typeof b.time === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(b.time.trim()) ? b.time.trim() : null;
  if (timeKnown && !time) return null;
  const place = typeof b.place === "string" ? b.place.trim().replace(/\s+/g, " ").slice(0, 120) || null : null;
  const name = cleanChartName(b.name);
  return { date, time, timeKnown, place, zone, ...(name ? { name } : {}) };
}

/**
 * Put the chart into a pending reading. Once.
 *
 * WRITE-ONCE, and the refusal to overwrite is the point rather than tidiness.
 * A filled reading that could be refilled would let anybody holding the link
 * replace somebody's chart with one cast from a birth moment of their choosing
 * -- silently, on a reading that had already been delivered and read.
 *
 * Returns `{ ok: true }`, or a reason. Never throws on a reading that simply is
 * not fillable, because "already done" is an ordinary thing for a double-
 * submitted form to be.
 */
export async function fillReading(store, id, output, now = Date.now(), birth = null, { history = null, correction = null } = {}) {
  if (!output || typeof output !== "object") throw new Error("fillReading: no output");
  refuseBirthData(output);

  const existing = await loadReading(store, id, now);
  if (!existing) return { ok: false, reason: "not_found" };
  if (!existing.pending) return { ok: false, reason: "already_filled" };

  const kept = birthRecord(birth);
  await store.setJSON(
    id,
    serialize(existing, {
      output,
      // When the chart was computed, which is NOT when it was bought. The year
      // runs from the purchase either way; this is only ever for looking at.
      filledAt: Math.floor(now / 1000),
      // The birth details it was cast from -- EVERY tier since release 2 (the
      // summary too), and only the fields `birthRecord` allows (Jeremy 10/16).
      // None given keeps what the record already had (an upgrade's carried
      // details, confirmed with "These are right").
      birth: kept ?? existing.birth,
      // A correction keeps the details it replaced, for support only.
      history: history ? [...existing.history, ...cleanHistory(history)] : existing.history,
      ...(correction && typeof correction === "object" ? { correction } : {}),
    }),
  );
  return { ok: true, tier: existing.tier };
}

/**
 * The written interpretation, filed against a reading. WRITE-ONCE, exactly as
 * the chart is.
 *
 * Somebody who paid for a reading gets ONE reading, not a different one every
 * time they open the link. A model asked twice answers twice, and a document
 * that changes under a person quoting it back to their coach is worse than one
 * that is merely imperfect.
 *
 * THE TIER IS CHECKED HERE, not only by whoever calls this. Storing an
 * interpretation against a chart-tier purchase would put reading-tier content
 * one `tier >= 2` mistake away from being handed over.
 *
 * The record is rebuilt field by field rather than spread, for the same reason
 * `fillReading` does it: `loadReading` adds `pending` for the caller's
 * convenience, and spreading would write that derived flag back as data.
 */
export async function fillInterpretation(store, id, text, now = Date.now()) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("fillInterpretation: no text");
  }
  const existing = await loadReading(store, id, now);
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.pending) return { ok: false, reason: "no_chart_yet" };
  if (existing.tier < 2) return { ok: false, reason: "wrong_tier" };
  if (existing.reading) return { ok: false, reason: "already_written" };

  await store.setJSON(
    id,
    serialize(existing, {
      filledAt: existing.filledAt || Math.floor(now / 1000),
      reading: text,
      // When it was written -- neither when it was bought nor when the chart was
      // cast. Kept for looking at, never for expiry.
      writtenAt: Math.floor(now / 1000),
    }),
  );
  return { ok: true, tier: existing.tier };
}
