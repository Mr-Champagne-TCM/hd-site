import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WHO IS ALLOWED TO SET THE WRITER RUNNING.
 *
 * A background function is invoked over HTTP, which means its path is on the
 * public internet like any other. The job itself is safe to run twice --
 * `fillInterpretation` is write-once -- but "safe" is not "free": two
 * invocations racing on the same purchase both call Google, and only one of
 * those answers is ever stored. The other is billed and thrown away.
 *
 * So it carries a token. Derived from GRANT_SECRET rather than being a secret
 * of its own, because a second secret is a second thing to set, to rotate, and
 * to forget -- and this one guards an idempotent job, not a door to anything.
 *
 * Compared in constant time, and LENGTH-CHECKED FIRST: timingSafeEqual throws
 * on a length mismatch, and a throw is itself a timing signal.
 */
export const TRIGGER_HEADER = "x-tcm-trigger";

export function triggerToken(secret) {
  if (!secret) return null;
  return createHmac("sha256", secret).update("interpret").digest("base64url");
}

export function triggerOk(given, secret) {
  const want = triggerToken(secret);
  if (!want || typeof given !== "string" || given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
}
