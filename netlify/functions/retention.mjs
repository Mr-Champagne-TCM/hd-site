import { getStore } from "@netlify/blobs";
import { COUNTER_STORES, describe, sweepRetention } from "../lib/retention.mjs";
import { reportFailure } from "../lib/health.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";

/**
 * THE YEAR, KEPT. Daily, it deletes every reading past its year from purchase
 * -- with the birth details, buyer details and written reading inside it --
 * and the health and counter records past their own stated lives. The rules
 * and why are in lib/retention.mjs.
 *
 * RETENTION_DRY_RUN=1 makes it count what it WOULD delete and delete nothing.
 * Unset, it deletes: the privacy page promises the deleting, not the counting.
 *
 * The log line is counts only. A run that could not read a store, failed on a
 * record, or ran out of time files an incident (no buyer details, as always)
 * so it reaches Jeremy instead of a log nobody reads.
 *
 * 09:17 UTC daily: early morning in Central time, off the quarter-hour that
 * `sweep` and `reconcile` share.
 */
export default async () => {
  const dryRun = process.env.RETENTION_DRY_RUN === "1";
  const health = getStore({ name: "health", consistency: "strong" });
  const counters = Object.fromEntries(COUNTER_STORES.map((name) => [name, getStore({ name, consistency: "strong" })]));

  let result;
  try {
    result = await sweepRetention({
      stores: { readings: getStore({ name: "readings", consistency: "strong" }), health, counters },
      dryRun,
    });
  } catch (e) {
    console.log(`retention: could not run (${e.message})`);
    await report(health, `could not run: ${String(e.message).slice(0, 120)}`);
    return new Response(null, { status: 204 });
  }

  console.log(describe(result));

  const failed = Object.values(result.stores).reduce((n, t) => n + t.failed, 0);
  if (failed || result.incomplete) {
    await report(
      health,
      `${failed} store or record operation(s) failed${result.incomplete ? ", and the run stopped for time" : ""}; ` +
        "nothing was deleted that could not be dated. Tomorrow's run retries.",
    );
  }
  return new Response(null, { status: 204 });
};

async function report(health, detail) {
  await reportFailure(health, {
    kind: "retention",
    detail,
    send: alertSender(process.env.RESEND_API_KEY),
    site: process.env.URL || SITE.home,
  }).catch(() => {});
}

/** The same plain alert the other scheduled functions send (D-12). */
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

export const config = { schedule: "17 9 * * *" };
