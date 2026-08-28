import { randomBytes } from "node:crypto";
import { open as openSealed, seal } from "./sig.mjs";

/**
 * The kept reading, and the one link that reaches it.
 *
 * WHAT IS KEPT, AND WHAT IS NOT. Jeremy's ruling, and it is the whole design:
 * "They enter birth data, we compute with it and discard, then we keep the
 * engine outputs (ALL) and store that." So what lands here is the engine's own
 * response -- type, profile, centres, channels, the drawing -- and no birth
 * date, no time, no place, no coordinates. Those are used to compute and then
 * they are gone.
 *
 * A kept reading therefore cannot say what MOMENT it was cast for, and it does
 * not need to. It is labelled by the buyer's name, which came from the purchase
 * and not from the chart. "Jeremy's reading" needs no birthday attached to it.
 *
 * The activations in a stored reading are, in principle, invertible back to a
 * birth moment of about fifteen minutes -- not a place. That is why the privacy
 * copy says the details are discarded and never claims the moment is
 * unrecoverable. Storing the outputs is not the same as storing the inputs, and
 * it is not the same as storing nothing either.
 *
 * WHAT IS KEPT ABOUT THE BUYER, named by Jeremy and kept complete rather than
 * whittled down: name, email, phone, the time of the purchase and what was
 * purchased. Nothing else, and specifically nothing about the birth moment.
 *
 * That list is not an oversight to be trimmed later -- each entry has a job. The
 * email is where a re-send goes (D-9, and never to an address supplied in a
 * request). The phone is where a text goes when texting exists. The name is how
 * the page can say whose reading this is WITHOUT keeping a birthday, which is
 * the whole reason the labelling problem is not a problem. The time and the
 * purchase type are the receipt: what was bought, when, so that an upgrade
 * knows what has already been paid for.
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
  { tier, output, name, email, phone, sku, purchasedAt, now = Date.now() },
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

  const id = newReadingId();
  await store.setJSON(id, {
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
    createdAt: Math.floor(now / 1000),
  });
  return id;
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
export async function loadReading(store, id, now = Date.now()) {
  if (typeof id !== "string" || !ID.test(id)) return null;
  let raw;
  try {
    raw = await store.get(id, { type: "json" });
  } catch {
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
    createdAt: raw.createdAt ?? 0,
  };
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

/** Birth details are used to compute and then discarded. Nothing here keeps one. */
function refuseBirthData(output) {
  for (const forbidden of ["date", "time", "zone", "utc", "birth", "place", "lat", "lon"]) {
    if (forbidden in output) throw new Error(`saveReading: output carries birth data (${forbidden})`);
  }
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
export async function fillReading(store, id, output, now = Date.now()) {
  if (!output || typeof output !== "object") throw new Error("fillReading: no output");
  refuseBirthData(output);

  const existing = await loadReading(store, id, now);
  if (!existing) return { ok: false, reason: "not_found" };
  if (!existing.pending) return { ok: false, reason: "already_filled" };

  await store.setJSON(id, {
    v: 1,
    tier: existing.tier,
    output,
    buyer: existing.buyer,
    sku: existing.sku,
    purchasedAt: existing.purchasedAt,
    createdAt: existing.createdAt,
    // When the chart was computed, which is NOT when it was bought. The year
    // runs from the purchase either way; this is only ever for looking at.
    filledAt: Math.floor(now / 1000),
  });
  return { ok: true, tier: existing.tier };
}
