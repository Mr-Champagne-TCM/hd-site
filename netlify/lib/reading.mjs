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
 * That is a real promise with a real cost, and the cost should be named rather
 * than discovered: a kept reading CANNOT say whose it is or what moment it was
 * cast for, because we did not keep that. The page shows a chart, not a chart
 * labelled with somebody's birthday.
 *
 * The activations in a stored reading are, in principle, invertible back to a
 * birth moment of about fifteen minutes -- not a place. That is why the privacy
 * copy says the details are discarded and never claims the moment is
 * unrecoverable. Storing the outputs is not the same as storing the inputs, and
 * it is not the same as storing nothing either.
 *
 * WHAT IDENTIFIES A BUYER. The email on the purchase, per D-9, kept beside the
 * reading so a re-send has somewhere to go. It is the one piece of personal
 * data here and it exists for exactly one purpose: sending this reading back to
 * the person who bought it. Never to an address supplied in a request.
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
export async function saveReading(store, { tier, output, email, now = Date.now() }) {
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
    email: typeof email === "string" && email ? email : null,
    createdAt: Math.floor(now / 1000),
  });
  return id;
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

  const age = Math.floor(now / 1000) - (raw.createdAt ?? 0);
  if (age > READING_TTL_SECONDS) return null;

  return { tier: raw.tier, output: raw.output, email: raw.email ?? null, createdAt: raw.createdAt ?? 0 };
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
