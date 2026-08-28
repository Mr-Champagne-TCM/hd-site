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
 */
export async function saveReading(
  store,
  { tier, output, name, email, phone, sku, purchasedAt, now = Date.now() },
) {
  if (!Number.isInteger(tier) || tier < 0 || tier > 2) throw new Error(`saveReading: bad tier ${tier}`);
  if (!output || typeof output !== "object") throw new Error("saveReading: no output");

  // Belt and braces on the promise above. If a birth field ever reaches this
  // function it is a bug upstream, and the right behaviour is to refuse
  // loudly rather than to store it and be quietly wrong about the privacy copy.
  for (const forbidden of ["date", "time", "zone", "utc", "birth", "place", "lat", "lon"]) {
    if (forbidden in output) throw new Error(`saveReading: output carries birth data (${forbidden})`);
  }

  const id = newReadingId();
  await store.setJSON(id, {
    v: 1,
    tier,
    output,
    // The buyer, as five fields and no more. Written explicitly rather than by
    // spreading whatever the caller passed: a spread is how an extra field
    // arrives in a store nobody meant to put it in, which is exactly the
    // failure the birth-data guard above exists to prevent.
    buyer: {
      name: str(name),
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
  if (!Number.isInteger(raw.tier) || !raw.output) return null;

  // Measured from the PURCHASE, not from when the record happened to be
  // written. The year belongs to what was bought; re-rendering a reading must
  // not quietly extend it, and must not shorten it either.
  const bought = raw.purchasedAt ?? raw.createdAt ?? 0;
  if (Math.floor(now / 1000) - bought > READING_TTL_SECONDS) return null;

  return {
    tier: raw.tier,
    output: raw.output,
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
