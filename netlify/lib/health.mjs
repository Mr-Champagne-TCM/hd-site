import { customerText } from "../../shared/customerMessages.mjs";
import { deployContext, mayPage } from "./deployContext.mjs";
import { PLAYBOOK, briefLine, countTouched, optionLines, touchLine, whichLines } from "./playbook.mjs";

/**
 * NO SILENT FAILING.
 *
 * Jeremy's words, and the fault they are aimed at is real: when a delivery
 * email fails, the buyer sees their reading on screen and nothing looks wrong.
 * The only person who finds out is the buyer, days later, and the only way it
 * reaches Jeremy is if they bother to write in. Everything before this was a
 * `console.log` in a function log nobody reads.
 *
 * TWO CADENCES, and Jeremy chose both:
 *
 *   IMMEDIATELY, when something fails. "No silent failing!" -- so the first of
 *   a kind emails him the moment it happens, not tomorrow. Since 10/16 every
 *   page carries a BRIEF, WHICH buyer (ids and links, never the person) and
 *   numbered OPTIONS TO RESOLVE (lib/playbook.mjs).
 *
 *   A DIGEST, whether or not anything failed: DAILY for the first 30 days
 *   after RELEASE_DATE ("daily, while the release settles"), then WEEKLY on
 *   Mondays. The follow-up list, and the proof the watcher is alive.
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
 * An incident says what broke and why. Since 10/16 it may carry POINTERS --
 * a reading id, a Stripe checkout or payment id, shape-checked in `cleanRef`
 * -- so Jeremy can open the object that holds the details. Never the details. A monitoring
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
 * THE DIGEST'S CADENCE (Jeremy 10/16: "daily, while [the release settles]...
 * yes"). Daily for DAILY_DIGEST_DAYS after the release, then weekly.
 *
 * RELEASE_DATE IS SET ON THE DAY THE RELEASE GOES OUT -- the one line to change
 * at deploy. Until then it holds the day this was written. The switch to
 * weekly is derived from it, so there is exactly one date to keep right.
 */
export const RELEASE_DATE = "2026-10-16";
export const DAILY_DIGEST_DAYS = 30;
export const WEEKLY_FROM = Date.parse(`${RELEASE_DATE}T00:00:00Z`) + DAILY_DIGEST_DAYS * 24 * 60 * 60 * 1000;

/**
 * Whether today's scheduled run sends, and over how many days. The schedule
 * fires every day; after the switch only Monday's run sends, covering the week.
 */
export function digestPlan(now = Date.now()) {
  if (now < WEEKLY_FROM) return { send: true, days: 1, cadence: "daily" };
  const monday = new Date(now).getUTCDay() === 1;
  return { send: monday, days: 7, cadence: "weekly" };
}

/** A pointer to the object that holds the details -- never the details. */
export function cleanRef(ref) {
  if (!ref || typeof ref !== "object") return null;
  const out = {};
  if (/^[0-9a-f]{32}$/.test(String(ref.reading ?? ""))) out.reading = ref.reading;
  if (/^cs_(test|live)_[A-Za-z0-9]{8,200}$/.test(String(ref.session ?? ""))) out.session = ref.session;
  if (/^pi_[A-Za-z0-9]{8,200}$/.test(String(ref.payment ?? ""))) out.payment = ref.payment;
  if (Number.isInteger(ref.tier) && ref.tier >= 0 && ref.tier <= 9) out.tier = ref.tier;
  return Object.keys(out).length ? out : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
  { kind, detail, excerpt, now = Date.now(), send, site, severity, customer, ref, paid, context } = {},
) {
  // Only production pages Jeremy; a draft or preview shares this store (batch-1024 item 4).
  if (!mayPage()) {
    console.log(`${kind}: not filed and no alert -- deploy context "${deployContext()}" is not production`);
    return { recorded: false, alerted: false, notProduction: true };
  }
  const entry = await record(store, { kind, detail, excerpt, now, severity, customer, ref, paid });
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

  // HOW MANY BUYERS THIS KIND TOUCHED, from what is on file for the last day.
  // Only read when an alert is actually going, so at most once an hour a kind.
  let count = 1;
  try {
    const recent = (await incidents(store, { now, window: DAY_MS })).filter((i) => i.kind === entry.kind);
    count = Math.max(1, countTouched(recent));
  } catch {
    /* one is the floor: this one */
  }

  const ctx = context ?? send.context ?? {};
  const { subject, text, html } = alert(entry, { site, count, ...ctx });
  try {
    await send({ subject, text, html });
  } catch {
    /* Nothing left to try. The incident is on file for the weekly report. */
  }
  return { recorded: true, alerted: true };
}

/**
 * ONE FAILURE, as Jeremy reads it on his phone (10/16): a BRIEF, WHICH buyer,
 * the numbered OPTIONS TO RESOLVE for them, then the details.
 *
 * `linkFor(ref)` mints the buyer's reading link and `retryLinkFor(entry)` the
 * one-tap retry-code link; both come from failures.mjs `alertContext` and both
 * may be absent (no secret, no key), which the options then say.
 */
export function alert(entry, { site, count = 1, linkFor, retryLinkFor, shop } = {}) {
  const play = PLAYBOOK[entry.kind];
  const link = safe(() => linkFor?.(entry.ref)) || null;
  const retryLink = safe(() => retryLinkFor?.(entry)) || null;
  const parts = {
    brief: briefLine(entry, { count }),
    which: whichLines(entry, { link }),
    options: optionLines(entry, { link, retryLink, shop: shop || site }),
    fix: play?.fix ?? null,
    auto: play?.auto ?? null,
    details: [
      `${entry.kind} failed at ${new Date(entry.at).toISOString()}.`,
      entry.detail ? `Reason: ${entry.detail}` : "No reason was reported.",
      ...(entry.severity ? [`Severity: ${entry.severity}${entry.paid ? " (money was taken)" : ""}`] : []),
      `Customer saw: ${sawLine(entry)}`,
    ],
    footer: [
      "Sent the moment it happened. Repeats of the same kind within the hour are held back and counted in the digest instead.",
      "No names, emails, phones, birth details or reading text are in this email, by design: Stripe and the reading itself hold them.",
      ...(site ? [site] : []),
    ],
  };
  const who = play?.who === "buyer" ? ` (${count} buyer${count === 1 ? "" : "s"})` : "";
  return { subject: `HD readings: ${entry.kind} failed${who}`, ...renderAlert(parts) };
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * The same parts as plain text and as simple, phone-sized HTML with real
 * links.
 */
export function renderAlert({ brief, which, options, fix, auto, details, footer, heading }) {
  const text = [
    ...(heading ? [heading, ""] : []),
    "BRIEF",
    brief,
    "",
    "WHICH",
    ...which.flatMap((w) => [`  ${w.label}: ${w.value}`, ...(w.href && w.href !== w.value ? [`    ${w.href}`] : [])]),
    "",
    ...(options.length
      ? [
          "OPTIONS TO RESOLVE",
          ...options.flatMap((o, i) => o.split("\n").map((line, j) => (j ? `     ${line}` : `  ${i + 1}. ${line}`))),
          "",
        ]
      : []),
    ...(fix ? [`FIX FIRST: ${fix}`] : []),
    ...(auto ? [`ALREADY HAPPENING: ${auto}`] : []),
    ...(fix || auto ? [""] : []),
    "DETAILS",
    ...details.map((d) => `  ${d}`),
    "",
    ...footer,
  ].join("\n");

  return { text, html: alertHtml({ brief, which, options, fix, auto, details, footer, heading }) };
}

const LINK = "color:#1a4f8b";
/** A long signed link reads as its start and an ellipsis; the href stays whole. */
const shown = (u) => (u.length > 72 ? `${u.slice(0, 64)}...` : u);
// `full`: inside a ready-made note the link is shown WHOLE, because the note is
// copied and pasted to a buyer -- a shortened link there would be a broken one.
const linked = (t, { full = false } = {}) =>
  escHtml(t).replace(/https?:\/\/[^\s<"]+[^\s<".,)]/g, (u) => `<a href="${u}" style="${LINK};word-break:break-all">${full ? u : shown(u)}</a>`);
const label = (t) =>
  `<p style="margin:18px 0 6px;font:600 12px/1.3 system-ui,sans-serif;letter-spacing:.08em;color:#6b5a1e">${t}</p>`;

export function alertHtml({ brief, which, options, fix, auto, details, footer, heading }) {
  const whichHtml = which
    .map(
      (w) =>
        `<li><b>${escHtml(w.label)}:</b> ${
          w.href
            ? `<a href="${escHtml(w.href)}" style="${LINK};word-break:break-all">${escHtml(shown(w.value))}</a>`
            : `<span style="word-break:break-all">${escHtml(w.value)}</span>`
        }</li>`,
    )
    .join("");
  const optionsHtml = options
    .map((o) => {
      const [lead, ...rest] = o.split("\n");
      const quote = rest.length
        ? `<div style="margin:6px 0 2px;padding:8px 12px;border-left:3px solid #c9a227;background:#faf6ea">${linked(rest.join(" "), { full: true })}</div>`
        : "";
      return `<li style="margin:0 0 10px;word-break:break-word">${linked(lead)}${quote}</li>`;
    })
    .join("");
  return `<div style="font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1d2430;max-width:640px">
${heading ? `<p style="margin:0 0 4px;font-weight:600">${escHtml(heading)}</p>` : ""}${label("BRIEF")}<p style="margin:0">${escHtml(brief)}</p>
${label("WHICH")}<ul style="margin:0;padding-left:18px">${whichHtml}</ul>
${options.length ? `${label("OPTIONS TO RESOLVE")}<ol style="margin:0;padding-left:22px">${optionsHtml}</ol>` : ""}
${fix ? `<p style="margin:12px 0 0"><b>Fix first:</b> ${linked(fix)}</p>` : ""}${auto ? `<p style="margin:8px 0 0"><b>Already happening:</b> ${linked(auto)}</p>` : ""}
${label("DETAILS")}<p style="margin:0;font:13px/1.5 ui-monospace,Consolas,monospace;color:#3a4352">${details.map(escHtml).join("<br>")}</p>
<p style="margin:18px 0 0;font-size:12px;color:#6a7280">${footer.map(linked).join("<br>")}</p>
</div>`;
}

export function escHtml(t) {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Never let a broken monitor break the thing it monitors. */
let sequence = 0;

export async function record(store, { kind, detail, excerpt, now = Date.now(), severity, customer, ref, paid } = {}) {
  if (!store || !kind) return null;
  // A counter in the hash: two refusals for the same reason in one invocation
  // used to write one key, and the second overwrote the first (audit F39).
  const id = `${now}-${Math.abs(hash(`${kind}${detail}${now}${++sequence}`))}`;
  const key = `incident/${id}`;
  const pointer = cleanRef(ref);
  const entry = {
    // The incident's own name, so a retry-code link is one-use PER INCIDENT.
    id,
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
    ...(pointer ? { ref: pointer } : {}),
    ...(paid ? { paid: true } : {}),
    at: now,
  };
  try {
    await store.setJSON(key, entry, {
      metadata: { kind: entry.kind },
      // NOT an expiry (10/23, picks-1023): @netlify/blobs 8.x takes metadata
      // only and drops this, so nothing ever removed these records. The
      // fifteen-minute sweep deletes them past INCIDENT_TTL_SECONDS
      // (sweepIncidents, below), which is what the privacy page promises.
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
      if (entry && /^(interpretation|gemini|claude)-/.test(String(entry.kind))) count += 1;
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

/**
 * THE FOURTEEN DAYS, KEPT (extra, picks-1023, pending Jeremy). The privacy page
 * says "A record of a technical failure, so it can be fixed: Fourteen days".
 * Netlify Blobs keeps a blob until something deletes it -- the `expiration`
 * handed to setJSON is not an option it has -- so this deletes every
 * "incident/<at>-<n>" record older than INCIDENT_TTL_SECONDS. The time is in
 * the key, so nothing is read; a key this site did not write is left alone.
 * Returns counts; never throws. Run by the fifteen-minute sweep.
 */
export async function sweepIncidents(store, { now = Date.now(), keepMs = INCIDENT_TTL_SECONDS * 1000 } = {}) {
  const counts = { listed: 0, deleted: 0, kept: 0, failed: 0 };
  let keys = [];
  try {
    keys = ((await store.list({ prefix: "incident/" }))?.blobs ?? []).map((b) => b.key);
  } catch {
    counts.failed++;
    return counts;
  }
  counts.listed = keys.length;
  for (const key of keys) {
    const at = Number(/^incident\/(\d+)-/.exec(key)?.[1]);
    if (!Number.isFinite(at) || now - at <= keepMs) {
      counts.kept++;
      continue;
    }
    try {
      await store.delete(key);
      counts.deleted++;
    } catch {
      counts.failed++;
    }
  }
  return counts;
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
export function digest({ found, days = 7, site, context = {} }) {
  const span = `${days}d`;
  const period = days === 1 ? "the last day" : `the last ${days} days`;
  /**
   * THE DIGEST, and it goes out either way -- daily while the release settles,
   * weekly after (digestPlan).
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
        `Nothing failed in ${period}${internal ? ` (${internal} internal-only, listed below)` : ""}.`,
        "",
        "This message arrives whether or not anything went wrong. If it stops",
        "arriving, the watcher itself is down -- that is the point of it.",
        "",
        ...section("INTERNAL ONLY (noise, nothing to do)", found),
      ]
    : [
        `${problems.length} thing${problems.length === 1 ? "" : "s"} failed in ${period}.`,
        "You were emailed when the first of each page-Jeremy kind happened; this",
        "is the follow-up list.",
        "",
        ...section("PAGED YOU (emailed at the time)", problems.filter((i) => sev(i) === "page-jeremy"), { detailLines: true }),
        ...briefs(problems.filter((i) => sev(i) === "page-jeremy"), { period, context, site }),
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
  const text = lines.join("\n");
  return { subject, text, html: digestHtml(text) };
}

/**
 * THE PAGED ITEMS' BRIEFS (10/16): per kind, the brief, which buyers (up to
 * five, newest first, with their Stripe and reading links and their own
 * one-tap retry-code link), and the options -- the same words the alert used.
 */
function briefs(paged, { period, context, site }) {
  if (!paged.length) return [];
  const byKind = new Map();
  for (const i of paged) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  const out = ["BRIEFS AND OPTIONS FOR WHAT PAGED YOU", ""];
  for (const [kind, list] of byKind) {
    const play = PLAYBOOK[kind];
    const newest = list[0];
    const link = safe(() => context.linkFor?.(newest.ref)) || null;
    out.push(`  ${kind}`);
    out.push(`    BRIEF: ${play?.brief ?? `${kind} failed.`} ${touchLine(play?.who ?? "system", countTouched(list), period)}`);
    out.push("    WHICH (newest first):");
    for (const i of list.slice(0, 5)) {
      const ilink = safe(() => context.linkFor?.(i.ref)) || null;
      const retry = safe(() => context.retryLinkFor?.(i)) || null;
      const which = whichLines(i, { link: ilink })
        .map((w) => (w.href ? `${w.label} ${w.href}` : `${w.label}: ${w.value}`))
        .join(" | ");
      out.push(`      ${new Date(i.at).toISOString().slice(0, 16)}Z  ${which}${retry ? ` | free retry code (one tap): ${retry}` : ""}`);
    }
    if (list.length > 5) out.push(`      ...and ${list.length - 5} more of this kind.`);
    const opts = optionLines(newest, { link, retryLink: null, shop: context.shop || site });
    if (opts.length) {
      out.push("    OPTIONS TO RESOLVE:");
      opts.forEach((o, n) => o.split("\n").forEach((line, j) => out.push(j ? `         ${line}` : `      ${n + 1}. ${line}`)));
    }
    if (play?.fix) out.push(`    FIX FIRST: ${play.fix}`);
    if (play?.auto) out.push(`    ALREADY HAPPENING: ${play.auto}`);
    out.push("");
  }
  return out;
}

/** The digest stays plain text; the HTML copy only makes its links tappable. */
function digestHtml(text) {
  return (
    '<pre style="font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">' +
    escHtml(text).replace(/https?:\/\/[^\s<"]+[^\s<".,)]/g, (u) => `<a href="${u}">${u}</a>`) +
    "</pre>"
  );
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
