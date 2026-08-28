import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signing, in one place.
 *
 * There are two signed things on this site now -- a grant, which says a tier
 * was paid for, and a reading link, which says which kept reading a holder may
 * see. Both are "a small JSON payload, base64url, a dot, an HMAC". Written
 * twice, they would drift: one would get a length cap and the other would not,
 * or one would compare its MAC in constant time and the other would use ===,
 * and nobody would notice because both would keep working.
 *
 * So the shape lives here and both callers get the same care:
 *
 *   - a length cap, because everything here is cheap and nothing unbounded
 *   - a constant-time MAC comparison, length-checked FIRST, because
 *     timingSafeEqual throws on a length mismatch and that throw is itself a
 *     timing signal
 *   - an answer on every branch. This parses whatever a stranger sends, so no
 *     path may end in an exception
 *
 * The payload's MEANING is not this module's business. It hands back whatever
 * object was signed and lets the caller decide whether it makes sense.
 */

export function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function sign(body, secret) {
  return b64url(createHmac("sha256", secret).update(body).digest());
}

/** Sign a payload object. Returns `body.mac`. */
export function seal(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/**
 * Open a sealed token.
 *
 * Returns `{ ok: true, payload }` or `{ ok: false, reason }`. Reasons are
 * deliberately coarse -- absent, malformed, bad_signature -- because a caller
 * has no use for a finer distinction and a stranger should not be handed one.
 */
export function open(token, secret, { maxLength = 512 } = {}) {
  if (!secret) return { ok: false, reason: "misconfigured" };
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "absent" };
  if (token.length > maxLength) return { ok: false, reason: "malformed" };

  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const a = Buffer.from(mac);
  const b = Buffer.from(sign(body, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };

  try {
    return { ok: true, payload: JSON.parse(unb64url(body).toString("utf8")) };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
