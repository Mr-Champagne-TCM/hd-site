import { getStore } from "@netlify/blobs";
import { interpretOne } from "../lib/interpretJob.mjs";
import { promptProblem } from "../lib/interpretation.mjs";
import { systemPrompt } from "../lib/gemini.mjs";
import { reportFailure } from "../lib/health.mjs";
import { loadReading } from "../lib/reading.mjs";
import { deliveryEmail } from "../lib/deliveryEmail.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";

/**
 * THE SWEEPER. Finds reading-tier purchases whose words have not been written,
 * and writes them.
 *
 * A SWEEPER RATHER THAN A REQUEST, and the reason is a hard limit rather than a
 * preference: a reading is around 1,200 words and takes the model tens of
 * seconds, while a synchronous function on the free plan is cut off at ten.
 * Generating inline would not be slow, it would be BROKEN -- and broken at the
 * worst possible moment, timing out the form submit of somebody who has already
 * paid.
 *
 * A SWEEP RATHER THAN A QUEUE. There is no queue to lose a message from: the
 * store IS the work list, because "tier 2, has a chart, has no words" is a
 * question the store can answer. A job that was never enqueued cannot go
 * missing, and a job that failed halfway is simply found again next time.
 *
 * ONE AT A TIME. Each generation can take most of a minute and the run has to
 * finish; taking one per pass means a backlog drains at one a minute rather
 * than timing out in the middle of somebody's document. There is no volume
 * here that this cannot keep up with, and if there ever is, the number is one
 * line.
 *
 * SAFE TO RUN TWICE, which is the property that makes the whole design work --
 * `fillInterpretation` is write-once, so a second pass over the same purchase
 * finds the text already there and moves on.
 */
export default async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  const grantSecret = process.env.GRANT_SECRET;
  const mailKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log("interpret: no GEMINI_API_KEY, nothing to do");
    return new Response(null, { status: 204 });
  }

  const store = getStore({ name: "readings", consistency: "strong" });
  const health = getStore({ name: "health", consistency: "strong" });

  /**
   * IS THE CONFIGURED PROMPT THE ONE THIS CODE EXPECTS?
   *
   * The prompt is an environment variable, because it cannot be committed to a
   * public repo. That means it can fall behind the validator -- and a prompt
   * missing a heading produces a reading that fails EVERY time, for every
   * buyer, with a message about the model rather than about the configuration.
   *
   * Checked before a single request, so the answer is one alert naming the
   * missing heading instead of a slow trickle of "malformed" that looks like
   * Google having a bad week.
   */
  const wrong = promptProblem(systemPrompt());
  if (wrong) {
    console.log(`interpret: ${wrong}`);
    await reportFailure(health, {
      kind: "reading-prompt",
      detail: wrong,
      send: alertSender(mailKey),
      site: process.env.URL,
    }).catch(() => {});
    return new Response(null, { status: 204 });
  }

  let waiting;
  try {
    waiting = await pending(store);
  } catch (e) {
    console.log(`interpret: could not read the store (${e.message})`);
    return new Response(null, { status: 204 });
  }

  if (!waiting.length) {
    console.log("interpret: nothing waiting");
    return new Response(null, { status: 204 });
  }

  /**
   * THE SITE'S OWN ADDRESS, from Netlify rather than from a constant.
   *
   * Every other function reads it off the incoming request. A scheduled run has
   * no request, and a hard-coded origin is how a link in an email points at
   * production from a branch deploy -- or at nothing at all after a rename.
   * `URL` is set by Netlify to the primary address of this site.
   */
  const origin = process.env.URL || "https://humandesign.thechampagnemethod.co";
  const id = waiting[0];
  const result = await interpretOne({
    id,
    store,
    health,
    apiKey,
    grantSecret,
    origin,
    deliver: { email: readyEmail(mailKey), alert: alertSender(mailKey) },
  });

  console.log(
    `interpret: ${waiting.length} waiting, wrote ${result.ok ? `${result.words} words` : `nothing (${result.reason})`}`,
  );
  return new Response(null, { status: 204 });
};

/** Reading-tier purchases that have a chart and no words yet. */
async function pending(store) {
  const listed = await store.list();
  const out = [];
  for (const blob of listed?.blobs ?? []) {
    // Skip anything that is not a reading record -- other keys share the store.
    const r = await loadReading(store, blob.key).catch(() => null);
    if (r && r.tier >= 2 && !r.pending && !r.reading) out.push(blob.key);
  }
  // Oldest purchase first: whoever has been waiting longest is served first.
  return out;
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
 * EVERY MINUTE. The shortest schedule Netlify offers, and the right one: a
 * buyer is sitting in front of their chart waiting for the rest of it, so the
 * worst case is a minute rather than five.
 *
 * A pass with nothing waiting costs one list call and returns 204.
 */
export const config = { schedule: "* * * * *" };
