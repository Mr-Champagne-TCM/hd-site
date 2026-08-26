/**
 * The bouncer, at the cheap door.
 *
 * This runs on the free Netlify layer, not on the paid JVM. If the engine
 * answered "no" instead, every abusive request would still start a container
 * and compute a real chart before refusing -- you would pay for the attack.
 *
 * Three windows, not one. An hourly cap alone lets someone sit at 20 an hour
 * around the clock and take 3,360 charts a week; a daily cap alone lets them
 * take 700. The week is the one that actually bounds the total.
 *
 *   20 an hour   a burst, or a curious afternoon
 *   100 a day    a genuinely heavy day
 *   210 a week   two heavy days and then a wall
 *
 * Pure functions on purpose: the whole thing is testable without Netlify, a
 * network, or a clock, and time is a parameter rather than something the code
 * reaches out and grabs.
 */

export const HOUR = 3600_000;
export const DAY = 86_400_000;
export const WEEK = 604_800_000;

export const LIMITS = [
  { name: "hour", ms: HOUR, max: 20 },
  { name: "day", ms: DAY, max: 100 },
  { name: "week", ms: WEEK, max: 210 },
];

/** The longest window we care about. Anything older is forgotten entirely. */
export const HORIZON = Math.max(...LIMITS.map((l) => l.ms));

/** Drops timestamps that have fallen out of every window. */
export function prune(hits, now) {
  return hits.filter((t) => now - t < HORIZON);
}

function countWithin(hits, now, ms) {
  let n = 0;
  for (const t of hits) if (now - t < ms) n++;
  return n;
}

/**
 * Decides, without recording. Returns the FIRST window that is full, so the
 * message names the one the person actually hit rather than the smallest.
 */
export function check(hits, now) {
  for (const limit of LIMITS) {
    const used = countWithin(hits, now, limit.ms);
    if (used >= limit.max) {
      // When the oldest hit inside this window falls out, one slot frees.
      const inWindow = hits.filter((t) => now - t < limit.ms);
      const oldest = Math.min(...inWindow);
      const retryAfter = Math.max(1, Math.ceil((oldest + limit.ms - now) / 1000));
      return { allowed: false, limit, used, retryAfter, message: refusal(limit, retryAfter) };
    }
  }
  return { allowed: true };
}

/** Records a hit. Returns the new list; does not mutate the old one. */
export function record(hits, now) {
  return prune([...hits, now], now);
}

/**
 * What a person reads when they are turned away.
 *
 * It says what happened and what to do. A failure that only says "429" or
 * "rate limited" leaves someone thinking the site is broken, and that is the
 * worst possible first impression of a thing they were about to pay for.
 */
function refusal(limit, retryAfterSeconds) {
  const when = friendly(retryAfterSeconds);
  const span = { hour: "an hour", day: "a day", week: "a week" }[limit.name];
  return (
    `That is ${limit.max} charts in ${span}, which is as many as this page will draw ` +
    `for one person. Nothing is wrong and nothing was charged. ${when}`
  );
}

function friendly(seconds) {
  if (seconds < 90) return "Another one will go through in about a minute.";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `Another one will go through in about ${minutes} minutes.`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 36) return `Another one will go through in about ${hours} hours.`;
  return `Another one will go through in about ${Math.ceil(hours / 24)} days.`;
}
