import { customerText } from "../../shared/customerMessages.mjs";

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
export async function reportFailure(
  store,
  { kind, detail, excerpt, now = Date.now(), send, site, severity, customer } = {},
) {
  const entry = await record(store, { kind, detail, excerpt, now, severity, customer });
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
      ...(entry.severity ? [`Severity: ${entry.severity}`] : []),
      `Customer saw: ${sawLine(entry)}`,
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

export async function record(store, { kind, detail, excerpt, now = Date.now(), severity, customer } = {}) {
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
    // Who needs to know, and which sentence the customer was shown -- a KEY
    // from shared/customerMessages.mjs, never words with anything filled in.
    // Both come from netlify/lib/failures.mjs; older callers leave them out.
    ...(severity ? { severity: String(severity).slice(0, 20) } : {}),
    ...(customer ? { customer: String(customer).slice(0, 40) } : {}),
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

/**
 * THE RATE ALARM FOR READINGS THAT WILL NOT WRITE (audit F53, approved 9/9 as
 * "#8": an alarm, no change to generation).
 *
 * On 3 September every draft came back as an empty skeleton -- "Type: /
 * Strategy: / ..." with nothing after the colons -- and two paid readings sat
 * unwritten. The cause was on Google's side and is still unexplained: the old
 * prompt filled 6 of 6 the same day, so the prompt was never the lever and no
 * code change can be shown to prevent it. It can recur.
 *
 * What CAN be done is to notice. Each refused draft is already on file as an
 * `interpretation-*` incident, but the immediate alert goes out only when a
 * reading gives up after every ask, and only the first of a kind each hour.
 * A spell where most drafts are refused and the fifth ask scrapes through is
 * invisible: buyers wait minutes, and nothing says so until Monday's digest.
 *
 * So the sweep counts them. RATE_LIMIT refused drafts inside RATE_WINDOW_MS
 * raises one `reading-failure-rate` alert, through the same hourly gate as
 * every other kind, so an outage is one email an hour rather than one every
 * fifteen minutes.
 *
 * SIX IN AN HOUR is one more than a single writing attempt can produce (five
 * asks), so it takes two readings struggling at once, or one reading failing
 * attempt after attempt -- never one unlucky draft. A normal hour has none or
 * one (Seth's reading, 8 September: one refusal, then written).
 */
export const RATE_WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMIT = 6;
const RATE_KIND = "reading-failure-rate";

export async function checkFailureRate(
  store,
  { now = Date.now(), send, site, window = RATE_WINDOW_MS, limit = RATE_LIMIT } = {},
) {
  if (!store) return { count: 0, alarmed: false };
  let listed;
  try {
    listed = await store.list({ prefix: "incident/" });
  } catch {
    return { count: 0, alarmed: false };
  }
  let count = 0;
  for (const blob of listed?.blobs ?? []) {
    // The key starts with the moment it was filed, so anything older than the
    // window is skipped without a read -- this runs every fifteen minutes.
    const at = Number(/^incident\/(\d+)-/.exec(blob.key)?.[1]);
    if (!Number.isFinite(at) || now - at > window || at > now) continue;
    try {
      const entry = await store.get(blob.key, { type: "json" });
      // `gemini-*` since 10/16 (failures.mjs); `interpretation-*` before, and
      // still on file for a fortnight after the rename.
      if (entry && /^(interpretation|gemini)-/.test(String(entry.kind))) count += 1;
    } catch {
      /* one unreadable incident is not a reason to lose the count */
    }
  }
  if (count < limit) return { count, alarmed: false };
  const minutes = Math.round(window / 60000);
  const r = await reportFailure(store, {
    kind: RATE_KIND,
    // As failures.mjs files it: buyers are waiting longer than they should.
    severity: "page-jeremy",
    customer: "reading-writing-long",
    detail: `${count} reading drafts refused or failed in the last ${minutes} minutes (alarm at ${limit}). Readings may be stuck or slow; the incidents carry each draft's opening.`,
    now,
    send,
    site,
  }).catch(() => ({ alerted: false }));
  return { count, alarmed: true, alerted: Boolean(r?.alerted) };
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
  /**
   * GROUPED BY SEVERITY, THEN KIND (Jeremy 10/16: "so we know what to present
   * to the customer and what is internal only"). Internal-only noise -- an
   * expired link, a mistyped birth date the customer fixed -- is counted but
   * never makes the subject line look like trouble. An incident filed before
   * severities existed counts as follow-up, which is how it was treated then.
   */
  const sev = (i) => i.severity ?? "needs-follow-up";
  const problems = found.filter((i) => sev(i) !== "internal-only");
  const internal = found.length - problems.length;
  const clear = problems.length === 0;
  const noise = internal ? `, ${internal} internal-only` : "";

  const subject = clear
    ? `HD readings: all clear${noise} (${span})`
    : `HD readings: ${problems.length} problem${problems.length === 1 ? "" : "s"} to follow up${noise} (${span})`;

  const section = (title, list, { detailLines = false } = {}) => {
    if (!list.length) return [];
    const byKind = new Map();
    for (const i of list) {
      const row = byKind.get(i.kind) ?? { n: 0, saw: i };
      row.n += 1;
      byKind.set(i.kind, row);
    }
    const width = Math.min(30, Math.max(...[...byKind.keys()].map((k) => k.length)));
    return [
      title,
      ...[...byKind]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([kind, { n, saw }]) => `  ${String(n).padStart(3)} x ${kind.padEnd(width)}  customer saw: ${sawKey(saw)}`),
      ...(detailLines
        ? [
            "",
            "  Most recent first:",
            ...list.slice(0, 20).map((i) => `    ${new Date(i.at).toISOString()}  ${i.kind}  ${i.detail ?? ""}`),
          ]
        : []),
      "",
    ];
  };

  // What customers actually read, counted by sentence. The point of the split.
  const seen = new Map();
  for (const i of found) if (i.customer) seen.set(i.customer, (seen.get(i.customer) ?? 0) + 1);

  const lines = clear
    ? [
        `Nothing failed in the last ${days} days${internal ? ` (${internal} internal-only, listed below)` : ""}.`,
        "",
        "This message arrives whether or not anything went wrong. If it stops",
        "arriving, the watcher itself is down -- that is the point of it.",
        "",
        ...section("INTERNAL ONLY (noise, nothing to do)", found),
      ]
    : [
        `${problems.length} thing${problems.length === 1 ? "" : "s"} failed in the last ${days} days.`,
        "You were emailed when the first of each page-Jeremy kind happened; this",
        "is the follow-up list.",
        "",
        ...section("PAGED YOU (emailed at the time)", problems.filter((i) => sev(i) === "page-jeremy"), { detailLines: true }),
        ...section("TO FOLLOW UP", problems.filter((i) => sev(i) !== "page-jeremy"), { detailLines: true }),
        ...section("INTERNAL ONLY (noise, nothing to do)", found.filter((i) => sev(i) === "internal-only")),
        ...(seen.size
          ? [
              "WHAT CUSTOMERS WERE SHOWN",
              ...[...seen]
                .sort((a, b) => b[1] - a[1])
                .map(([key, n]) => `  ${String(n).padStart(3)} x ${key}: "${short(customerText(key))}"`),
              "",
            ]
          : []),
        "No buyer details are recorded here, by design. The function logs have",
        "the request that failed.",
      ];

  if (site) lines.push("", site);
  return { subject, text: lines.join("\n") };
}

/** The customer's side of an incident, as a key -- or that they saw nothing. */
function sawKey(entry) {
  if (entry.customer) return entry.customer;
  return entry.severity ? "nothing (invisible to them)" : "(not recorded)";
}

/** The customer's side of an incident, in their words, for an alert. */
function sawLine(entry) {
  if (!entry.customer) return entry.severity ? "nothing -- this is invisible to them." : "(not recorded for this kind)";
  return `"${customerText(entry.customer)}" (${entry.customer})`;
}

function short(text) {
  const t = String(text ?? "");
  return t.length > 90 ? `${t.slice(0, 87)}...` : t;
}

/** Small, stable, and not a security boundary -- only a key suffix. */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
