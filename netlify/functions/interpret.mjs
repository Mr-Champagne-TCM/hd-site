import { getStore } from "@netlify/blobs";
import { interpretOne } from "../lib/interpretJob.mjs";
import { promptProblem } from "../lib/interpretation.mjs";
import { PROMPT_STORE, loadPrompt } from "../lib/gemini.mjs";
import { reportFailure } from "../lib/health.mjs";
import { loadReading } from "../lib/reading.mjs";
import { deliveryEmail } from "../lib/deliveryEmail.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";
import { TRIGGER_HEADER, triggerOk } from "../lib/trigger.mjs";

/**
 * THE WRITER. Runs when there is something to write, not on a timer.
 *
 * A BACKGROUND FUNCTION, and that is what makes on-demand possible. The ten
 * second limit that pushed this onto a schedule applies to SYNCHRONOUS
 * functions; a background function answers 202 at once and then has fifteen
 * minutes. Jeremy asked the obvious question -- "why can't sweeper wake up on
 * call?" -- and the answer was that it can, and that I had reached for the
 * always-works option without checking whether the better one was available.
 *
 * What that buys: a buyer waits as long as the model takes, rather than that
 * plus whatever was left on the minute. And nothing wakes 43,200 times a month
 * to discover there is no work.
 *
 * IT STILL DRAINS EVERYTHING PENDING rather than only the purchase that woke
 * it. A trigger can be missed -- a crash between filing the chart and firing
 * the request, a deploy mid-flight -- and a job that only ever serves its own
 * caller leaves those stranded forever. `sweep` calls this on a slow schedule
 * for exactly that reason, and finding nothing is the normal case.
 *
 * SAFE TO RUN TWICE is what makes both of those safe: writing is write-once, so
 * a second pass over the same purchase stops.
 */
export default async (request) => {
  const grantSecret = process.env.GRANT_SECRET;
  if (!triggerOk(request.headers.get(TRIGGER_HEADER), grantSecret)) {
    /**
     * A background function's path is on the public internet like any other.
     * The job is idempotent, so this is not a door to anything -- but two
     * invocations racing on one purchase both call Google, and only one answer
     * is ever kept. The other is billed and discarded.
     */
    console.log("interpret: refused (bad or missing trigger)");
    return new Response(null, { status: 404 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const mailKey = process.env.RESEND_API_KEY;
  const origin = process.env.URL || "https://humandesign.thechampagnemethod.co";

  if (!apiKey) {
    console.log("interpret: no GEMINI_API_KEY, nothing to do");
    return new Response(null, { status: 204 });
  }

  const store = getStore({ name: "readings", consistency: "strong" });
  const health = getStore({ name: "health", consistency: "strong" });

  /** One reading, written. The named purchase and the drain share this exactly. */
  const run = (id) =>
    interpretOne({
      id,
      store,
      health,
      apiKey,
      prompt,
      grantSecret,
      origin,
      deliver: { email: readyEmail(mailKey), alert: alertSender(mailKey) },
    });

  /**
   * IS THE CONFIGURED PROMPT THE ONE THIS CODE EXPECTS?
   *
   * The prompt is configuration -- it cannot be committed to a public repo --
   * so it can fall behind the validator. A prompt missing a heading fails EVERY
   * reading, for every buyer, with a message about the model rather than about
   * the configuration. Checked once, before any request, so the answer is one
   * alert naming what is missing instead of a trickle of "malformed" that looks
   * like Google having a bad week.
   */
  const prompt = await loadPrompt({
    store: getStore({ name: PROMPT_STORE, consistency: "strong" }),
  });
  const wrong = promptProblem(prompt);
  if (wrong) {
    console.log(`interpret: ${wrong}`);
    await reportFailure(health, {
      kind: "reading-prompt",
      detail: wrong,
      send: alertSender(mailKey),
      site: origin,
    }).catch(() => {});
    return new Response(null, { status: 204 });
  }

  /**
   * THE ONE THAT WOKE US, FIRST -- BEFORE ANY SCAN.
   *
   * `pending()` below lists the readings store and loads every blob in it. That
   * is a round trip per reading ever sold, and it used to sit in front of the
   * generation the buyer is watching a page for. It is a safety net for missed
   * triggers, not a step in the happy path, so it happens AFTERWARDS now.
   *
   * The id is a queue position and nothing more. `interpretOne` refuses
   * anything that is not a paid reading tier with a chart and no words, so an
   * id that named somebody else's purchase would either do the work that was
   * already owed or do nothing at all. The trigger token is the door; this is
   * only the order things are done in.
   */
  let first = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.id === "string" && body.id) first = body.id;
  } catch {
    /* no body is the ordinary case for `sweep`, which has no one purchase */
  }

  const done = new Set();
  if (first) {
    const r = await run(first);
    done.add(first);
    console.log(`interpret: named ${first} -> ${r.ok ? "written" : r.reason}`);
  }

  let waiting;
  try {
    waiting = (await pending(store)).filter((id) => !done.has(id));
  } catch (e) {
    console.log(`interpret: could not read the store (${e.message})`);
    return new Response(null, { status: 204 });
  }

  if (!waiting.length) {
    console.log(`interpret: nothing else waiting (wrote ${done.size ? 1 : 0})`);
    return new Response(null, { status: 204 });
  }

  /**
   * A BUDGET RATHER THAN A COUNT. Fifteen minutes is the hard limit and a
   * generation takes tens of seconds, so this stops well short and leaves the
   * rest to the next run. Being cut off mid-write would throw away a
   * generation that has already been paid for.
   */
  const BUDGET_MS = 10 * 60 * 1000;
  const started = Date.now();
  let wrote = 0;

  for (const id of waiting) {
    if (Date.now() - started > BUDGET_MS) {
      console.log(`interpret: out of budget, ${waiting.length - wrote} still waiting`);
      break;
    }
    const result = await run(id);
    if (result.ok) wrote += 1;
    else console.log(`interpret: skipped one (${result.reason})`);
  }

  console.log(
    `interpret: ${waiting.length} waiting, wrote ${wrote}${done.size ? " (+1 named)" : ""}`,
  );
  return new Response(null, { status: 204 });
};

/** Reading-tier purchases that have a chart and no words yet, oldest first. */
async function pending(store) {
  const listed = await store.list();
  const found = [];
  for (const blob of listed?.blobs ?? []) {
    // Other keys share this store; anything that is not a reading is skipped.
    const r = await loadReading(store, blob.key).catch(() => null);
    if (r && r.tier >= 2 && !r.pending && !r.reading) {
      found.push({ id: blob.key, at: r.purchasedAt ?? 0 });
    }
  }
  // Whoever has been waiting longest is served first.
  return found.sort((a, b) => a.at - b.at).map((f) => f.id);
}

/**
 * "Your reading is ready." The same delivery email the chart uses, so the two
 * messages are one design rather than two.
 */
function readyEmail(apiKey) {
  if (!apiKey) return undefined;
  return async ({ to, name, url, tier }) => {
    if (!to) return;
    const { subject, html, text } = deliveryEmail({ tier, name, url, links: SITE, pending: false });
    const sent = await sendMail({ to, subject, html, text }, { apiKey });
    console.log(`interpret: ready-email ${sent.ok ? "sent" : `failed (${sent.reason})`}`);
  };
}

/** How a failed generation reaches Jeremy the moment it happens. */
function alertSender(apiKey) {
  if (!apiKey) return undefined;
  return async ({ subject, text }) => {
    const html =
      '<pre style="font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">' +
      text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
      "</pre>";
    await sendMail({ to: SITE.contact, subject, html, text }, { apiKey });
  };
}

/**
 * Background, so the caller is answered at once and this gets fifteen minutes
 * rather than ten seconds. The path is what `chart` and `sweep` call.
 */
export const config = { background: true, path: "/api/interpret" };
