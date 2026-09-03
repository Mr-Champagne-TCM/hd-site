/**
 * THE BUYER'S OWN PAGE IS THE SAFETY NET.
 *
 * Both hosted schedulers failed the same week: Netlify's scheduled functions
 * stopped being invoked on 2026-09-02 with the UI still advertising a next
 * run, and GitHub's cron for the outside ring fired every four or five hours
 * against a fifteen-minute schedule. A reading whose first two drafts were
 * refused therefore waited on luck.
 *
 * The one thing that reliably happens while a reading is being written is
 * that the buyer's page polls for it. That poll reaches /api/reading, which
 * holds the grant secret and can derive the writer's token. So: when a poll
 * finds a reading still unwritten and nobody has rung the writer for it in
 * the last little while, the poll rings. The writer is idempotent, answers
 * 202 at once and does the work in the background, so the poll costs nothing
 * visible. The gate below is what stops a page polling every few seconds from
 * ringing every few seconds.
 */

/** How long a filled chart may sit unwritten before a poll is allowed to ring. */
export const RING_AFTER_MS = 90_000;
/** How long after one ring the next may follow. */
export const RING_EVERY_MS = 120_000;

/**
 * Pure decision. `filledAtMs` is when the chart was filed (seconds in the
 * record, milliseconds here); `lastRingMs` is the previous ring, or null.
 */
export function shouldRing({ filledAtMs, lastRingMs, now = Date.now() }) {
  if (!Number.isFinite(filledAtMs)) return false;
  if (now - filledAtMs < RING_AFTER_MS) return false;
  if (Number.isFinite(lastRingMs) && now - lastRingMs < RING_EVERY_MS) return false;
  return true;
}

/**
 * Ring if due, remembering when. `gate` is a tiny key-value store (Netlify
 * Blobs in production, a Map in tests) keyed by reading id; `ring` performs
 * the POST. Never throws: a failed ring is a missed nudge, not a broken page.
 */
export async function ringIfDue({ id, filledAtMs, gate, ring, now = Date.now() }) {
  let lastRingMs = null;
  try {
    const prior = await gate.get(`ring/${id}`, { type: "json" });
    if (prior && Number.isFinite(prior.at)) lastRingMs = prior.at;
  } catch {
    /* an unreadable gate rings; a duplicate ring is idempotent */
  }
  if (!shouldRing({ filledAtMs, lastRingMs, now })) return { rang: false };
  try {
    await gate.setJSON(`ring/${id}`, { at: now }, { expiration: new Date(now + 24 * 60 * 60 * 1000) });
  } catch {
    /* if the gate cannot be written, still ring */
  }
  try {
    await ring(id);
    return { rang: true };
  } catch {
    return { rang: false };
  }
}
