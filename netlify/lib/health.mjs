/**
 * NO SILENT FAILING.
 *
 * Jeremy's words, and the fault they are aimed at is real: when a delivery
 * email fails, the buyer sees their reading on screen and nothing looks wrong.
 * The only person who finds out is the buyer, days later, and the only way it
 * reaches Jeremy is if they bother to write in. Everything before this was a
 * `console.log` in a function log nobody reads.
 *
 * TWO PARTS, AND THE SECOND IS THE IMPORTANT ONE.
 *
 *   1. Anything that fails quietly is RECORDED here.
 *   2. A digest goes out on a schedule EVEN WHEN THERE IS NOTHING WRONG.
 *
 * A watcher that only speaks when something breaks is indistinguishable from a
 * watcher that has itself broken -- and the second is the more likely of the
 * two, because nothing exercises it. A daily "nothing to report" is the only
 * message that proves the thing is alive, so silence becomes the alarm.
 *
 * WHAT IS NEVER RECORDED: the buyer's address, their name, their birth data.
 * An incident says what broke and why, never who it happened to. A monitoring
 * store is exactly where personal data goes to be forgotten about, and its
 * retention would be nobody's job.
 */

/** A week. Long enough for a digest to be missed and still catch up. */
export const INCIDENT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Never let a broken monitor break the thing it monitors. */
export async function record(store, { kind, detail, now = Date.now() } = {}) {
  if (!store || !kind) return null;
  const key = `incident/${now}-${Math.abs(hash(`${kind}${detail}${now}`))}`;
  const entry = {
    kind: String(kind).slice(0, 60),
    // Truncated, and it is a REASON rather than a payload. "resend 401" is the
    // whole of what is useful; anything longer is where an address ends up.
    detail: detail == null ? null : String(detail).slice(0, 200),
    at: now,
  };
  try {
    await store.setJSON(key, entry, {
      metadata: { kind: entry.kind },
      // Netlify expires this for us, so nothing here needs a sweeper -- and a
      // retention rule nobody has to remember is the only kind that holds.
      expiration: new Date(now + INCIDENT_TTL_SECONDS * 1000),
    });
  } catch {
    /* A monitor that throws is worse than a monitor that misses one. */
    return null;
  }
  return entry;
}

/** Everything still on file, newest first. */
export async function incidents(store, { now = Date.now(), window = 24 * 60 * 60 * 1000 } = {}) {
  if (!store) return [];
  let listed;
  try {
    listed = await store.list({ prefix: "incident/" });
  } catch {
    return [];
  }
  const out = [];
  for (const blob of listed?.blobs ?? []) {
    try {
      const entry = await store.get(blob.key, { type: "json" });
      if (entry && now - entry.at <= window) out.push(entry);
    } catch {
      /* one unreadable incident is not a reason to lose the rest */
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * The digest, as subject and body.
 *
 * THE SUBJECT CARRIES THE ANSWER, because a digest that has to be opened to
 * learn whether anything is wrong will stop being opened. "all clear" or a
 * count -- and the count is in the subject line where a phone shows it.
 */
export function digest({ found, hours = 24, site }) {
  const clear = found.length === 0;
  const subject = clear
    ? `HD readings: all clear (${hours}h)`
    : `HD readings: ${found.length} problem${found.length === 1 ? "" : "s"} (${hours}h)`;

  const byKind = new Map();
  for (const i of found) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);

  const lines = clear
    ? [
        `Nothing failed in the last ${hours} hours.`,
        "",
        "This message arrives whether or not anything went wrong. If it stops",
        "arriving, the watcher itself is down -- that is the point of it.",
      ]
    : [
        `${found.length} thing${found.length === 1 ? "" : "s"} failed quietly in the last ${hours} hours.`,
        "",
        ...[...byKind].map(([kind, n]) => `  ${n} x ${kind}`),
        "",
        "Most recent first:",
        "",
        ...found.slice(0, 20).map((i) => `  ${new Date(i.at).toISOString()}  ${i.kind}  ${i.detail ?? ""}`),
        "",
        "No buyer details are recorded here, by design. The function logs have",
        "the request that failed.",
      ];

  if (site) lines.push("", site);
  return { subject, text: lines.join("\n") };
}

/** Small, stable, and not a security boundary -- only a key suffix. */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
