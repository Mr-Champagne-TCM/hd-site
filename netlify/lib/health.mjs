/**
 * NO SILENT FAILING.
 *
 * Jeremy's words, and the fault they are aimed at is real: when a delivery
 * email fails, the buyer sees their reading on screen and nothing looks wrong.
 * The only person who finds out is the buyer, days later, and the only way it
 * reaches Jeremy is if they bother to write in. Everything before this was a
 * `console.log` in a function log nobody reads.
 *
 TWO CADENCES, and Jeremy chose both:
 *
 *   IMMEDIATELY, when something fails. "No silent failing!" -- so the first of
 *   a kind emails him the moment it happens, not tomorrow.
 *
 *   WEEKLY, whether or not anything failed. The follow-up list, and the proof
 *   the watcher is alive.
 *
 * The second is not redundant. A report that arrived only when something was
 * wrong could not be told apart from a watcher that had itself stopped -- and
 * the second is the more likely of the two, because nothing exercises it. The
 * weekly all-clear turns SILENCE into the alarm rather than into reassurance.
 *
 * The immediate alert is rate-limited per kind. Resend going down does not fail
 * once, it fails on every purchase until it is fixed, and forty identical
 * emails is its own kind of silence -- the inbox stops being read. Every one is
 * still recorded and counted in the weekly report; only the repetition is lost.
 *
 * WHAT IS NEVER RECORDED: the buyer's address, their name, their birth data.
 * An incident says what broke and why, never who it happened to. A monitoring
 * store is exactly where personal data goes to be forgotten about, and its
 * retention would be nobody's job.
 */

/**
 * A fortnight. The digest is WEEKLY, so a week is not enough -- one missed
 * digest would take its incidents with it.
 */
export const INCIDENT_TTL_SECONDS = 14 * 24 * 60 * 60;

/**
 * How long one kind of failure stays quiet after it has been alerted on.
 *
 * A failure emails Jeremy AT ONCE, which is what he asked for. The hazard that
 * creates is the opposite one: Resend going down at 2am does not fail once, it
 * fails on every purchase until it is fixed, and forty identical emails is its
 * own kind of silence -- the inbox stops being read.
 *
 * So the FIRST of a kind goes immediately and the rest are held. They are still
 * recorded, and the weekly report counts every one of them, so nothing is lost;
 * only the repetition is.
 */
export const ALERT_QUIET_SECONDS = 60 * 60;

/**
 * RECORD AND ALERT. What the purchase path actually calls.
 *
 * Jeremy: "lets put a watcher together. No silent failing!" and then, on the
 * cadence: "immediately if a failure occurs". So this does both -- the incident
 * is filed for the weekly report, and the first of its kind in an hour is sent
 * the moment it happens.
 *
 * `send` is passed in rather than imported so this module stays testable
 * without a network, and so a function that has no mail key simply records.
 *
 * IT NEVER THROWS AND IT NEVER REJECTS. It sits inside the purchase path, and
 * failing a purchase in order to report that a purchase was not reported is
 * not a trade worth making.
 */
export async function reportFailure(store, { kind, detail, excerpt, now = Date.now(), send, site } = {}) {
  const entry = await record(store, { kind, detail, excerpt, now });
  if (!entry || typeof send !== "function") return { recorded: Boolean(entry), alerted: false };

  const gate = `alerted/${entry.kind}`;
  try {
    const last = await store.get(gate, { type: "json" });
    if (last && now - last.at < ALERT_QUIET_SECONDS * 1000) {
      return { recorded: true, alerted: false, reason: "quiet_period" };
    }
    await store.setJSON(gate, { at: now }, {
      expiration: new Date(now + ALERT_QUIET_SECONDS * 1000),
    });
  } catch {
    /* If the gate cannot be read, alert. Too many beats none. */
  }

  const { subject, text } = alert(entry, { site });
  try {
    await send({ subject, text });
  } catch {
    /* Nothing left to try. The incident is on file for the weekly report. */
  }
  return { recorded: true, alerted: true };
}

/** One failure, said plainly, in a subject line a phone shows in full. */
export function alert(entry, { site } = {}) {
  return {
    subject: `HD readings: ${entry.kind} failed`,
    text: [
      `${entry.kind} failed at ${new Date(entry.at).toISOString()}.`,
      entry.detail ? `Reason: ${entry.detail}` : "No reason was reported.",
      "",
      "Sent the moment it happened. Repeats of the same kind within the hour",
      "are held back and counted in the weekly report instead.",
      "",
      "No buyer details are recorded, by design. The function logs have the",
      "request that failed.",
      ...(site ? ["", site] : []),
    ].join("\n"),
  };
}

/** Never let a broken monitor break the thing it monitors. */
let sequence = 0;

export async function record(store, { kind, detail, excerpt, now = Date.now() } = {}) {
  if (!store || !kind) return null;
  // A counter in the hash: two refusals for the same reason in one invocation
  // used to write one key, and the second overwrote the first (audit F39).
  const key = `incident/${now}-${Math.abs(hash(`${kind}${detail}${now}${++sequence}`))}`;
  const entry = {
    kind: String(kind).slice(0, 60),
    // Truncated, and it is a REASON rather than a payload. "resend 401" is the
    // whole of what is useful; anything longer is where an address ends up.
    detail: detail == null ? null : String(detail).slice(0, 200),
    // A refused reading's opening, so the refusal can be read back. Chart
    // prose only -- the writer is never given a name, address or birth moment.
    ...(excerpt ? { excerpt: String(excerpt).slice(0, 600) } : {}),
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
    if (!blob.key.startsWith("incident/")) continue;
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
export function digest({ found, days = 7, site }) {
  const clear = found.length === 0;
  const span = `${days}d`;
  /**
   * THE WEEKLY REPORT, and it goes out either way.
   *
   * Failures already emailed at the moment they happened, so this is not the
   * alarm -- it is the FOLLOW-UP, and the proof the watcher is alive. A report
   * that only arrived when something was wrong could not be told apart from a
   * watcher that had stopped, and the second is the more likely of the two
   * because nothing exercises it.
   */
  const subject = clear
    ? `HD readings: all clear (${span})`
    : `HD readings: ${found.length} problem${found.length === 1 ? "" : "s"} to follow up (${span})`;

  const byKind = new Map();
  for (const i of found) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);

  const lines = clear
    ? [
        `Nothing failed in the last ${days} days.`,
        "",
        "This message arrives whether or not anything went wrong. If it stops",
        "arriving, the watcher itself is down -- that is the point of it.",
      ]
    : [
        `${found.length} thing${found.length === 1 ? "" : "s"} failed in the last ${days} days.`,
        "You were emailed when the first of each kind happened; this is the",
        "follow-up list.",
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
