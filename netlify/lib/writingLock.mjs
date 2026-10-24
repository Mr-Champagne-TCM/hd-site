import { randomUUID } from "node:crypto";

/**
 * ONE WRITER PER READING (GO page v3, decision 23, 10/23: "An open buyer page
 * rings the writer every 2 minutes (after the first 90 s), even while one is
 * writing, so two writers can ask Google for the same reading (only one is
 * kept; this is old behavior). Add a short "writing" lock.").
 *
 * Every way into the writer goes through interpretJob.mjs interpretOne: the
 * purchase's own ring, the buyer page's poll (ring.mjs ringIfDue), the
 * writer's own re-ring 15 s after a job ends without words (reringIfDue), the
 * fifteen-minute sweep's drain, the outside cron, a birth time added later.
 * Before its first ask to Google a job takes this lock for the reading; while
 * it is live, a second job for the same reading does nothing ("writing
 * elsewhere", said in the log) -- and the poll and the re-ring do not ring
 * at all. The job lets go when it ends, words or not.
 *
 * IT EXPIRES ON ITS OWN, so a crashed writer cannot hold a reading forever:
 * a job's asks end inside its eight-minute budget (interpretJob.mjs
 * READING_BUDGET_MS), and the lock lasts that plus a margin for filing the
 * words and sending the email (WRITING_LOCK_MS there). A function killed
 * mid-job leaves the lock behind; the first ring after it expires writes.
 *
 * WHERE IT LIVES: the health store, beside the ring gates (ring/<id>,
 * rering/<id>), opened with strong consistency by every caller, and read here
 * with strong consistency on every call. Netlify Blobs (8.2) has no
 * write-if-absent, so taking the lock is: read it; if nobody live holds it,
 * write this job's own random owner; wait SETTLE_MS; read it again. Two jobs
 * that took it at the same moment both read the same last write after the
 * wait, so only one goes on (a Blobs write lands in well under a second; the
 * wait is longer than that). A job that started later than the wait reads the
 * first job's lock and stops at once.
 *
 * WHEN THE STORE FAILS, WRITE ANYWAY. fillInterpretation refuses a reading
 * that already has words, as it always has; a second writer that finishes
 * later stops there. (It checks, then writes: two writers finishing in the
 * same instant could both file -- measured 10/23 with two stand-in writers
 * rung together, both filed and both would have emailed. The lock is what
 * makes that practically impossible now.) So an unreadable or unwritable lock
 * never stops a reading from being written: that is the old behavior, and
 * the answer says so (`unlocked`).
 */

/** How long after writing the lock a job reads it again (see above). */
export const SETTLE_MS = 1_500;

export const lockKey = (id) => `writing/${id}`;

const STRONG = { type: "json", consistency: "strong" };

/** Is this stored lock live at `now`? */
export function lockLive(lock, now) {
  return Boolean(lock) && typeof lock.owner === "string" && Number.isFinite(lock.until) && lock.until > now;
}

/** The live lock on a reading, or null (none, expired, or the store could not be read). Never throws. */
export async function liveLock(gate, id, now = Date.now()) {
  try {
    const lock = await gate.get(lockKey(id), STRONG);
    return lockLive(lock, now) ? lock : null;
  } catch {
    return null;
  }
}

/**
 * Take the lock on reading `id` for `ms`.
 *
 *   { ok: true, lock }                 this job holds it until lock.until
 *   { ok: false, held }                another job holds it until held.until
 *   { ok: true, lock: null, unlocked } the store failed: write anyway (old behavior)
 */
export async function takeLock({ gate, id, ms, clock = Date.now, sleep, owner = randomUUID() }) {
  let held;
  try {
    held = await gate.get(lockKey(id), STRONG);
  } catch {
    return { ok: true, lock: null, unlocked: "unreadable" };
  }
  if (lockLive(held, clock()) && held.owner !== owner) return { ok: false, held };

  const at = clock();
  const lock = { owner, at, until: at + ms };
  try {
    await gate.setJSON(lockKey(id), lock);
  } catch {
    return { ok: true, lock: null, unlocked: "unwritable" };
  }
  await sleep(SETTLE_MS);
  let back;
  try {
    back = await gate.get(lockKey(id), STRONG);
  } catch {
    return { ok: true, lock, unlocked: "unreadable after writing" };
  }
  if (back?.owner === owner) return { ok: true, lock };
  // Another job wrote after this one: the last write wins, and it is theirs.
  if (lockLive(back, clock())) return { ok: false, held: back };
  // Gone or expired in the meantime: nobody else is writing it. Take it again, once, without waiting.
  try {
    await gate.setJSON(lockKey(id), lock);
  } catch {
    return { ok: true, lock: null, unlocked: "unwritable" };
  }
  return { ok: true, lock };
}

/** Let go of a lock this job holds. Only its own: a lock another job took after this one expired stays. Never throws. */
export async function releaseLock({ gate, id, lock }) {
  if (!lock) return { released: false };
  try {
    const now = await gate.get(lockKey(id), STRONG);
    if (now?.owner !== lock.owner) return { released: false, reason: "not ours" };
    if (typeof gate.delete === "function") await gate.delete(lockKey(id));
    else await gate.setJSON(lockKey(id), { ...lock, until: 0 });
    return { released: true };
  } catch {
    // It expires by itself.
    return { released: false, reason: "store" };
  }
}

/** "until 14:32:05 UTC", for a log line. */
export function untilText(until) {
  return Number.isFinite(until) ? `until ${new Date(until).toISOString().slice(11, 19)} UTC` : "for now";
}
