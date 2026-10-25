import { getStore } from "@netlify/blobs";
import { digest, digestPlan, incidents } from "../lib/health.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";
import { alertContext } from "../lib/failures.mjs";
import { deployContext, mayPage, noteDeployContext } from "../lib/deployContext.mjs";

/**
 * The daily watch. A scheduled function, not an endpoint anybody calls.
 *
 * IT REPORTS EVEN WHEN THERE IS NOTHING TO REPORT. A watcher that only speaks
 * on failure cannot be told apart from a watcher that has itself stopped, and
 * the second is the more likely of the two because nothing exercises it. The
 * "all clear" is the message that proves it is alive, which turns SILENCE into
 * the alarm rather than into reassurance.
 *
 * It goes to the forwarding address (D-12), never the personal inbox, and it
 * carries no buyer details -- see lib/health.mjs.
 *
 * 13:00 UTC is morning in Central time. DAILY for 30 days after the release,
 * then WEEKLY on Mondays (Jeremy 10/16; the switch is RELEASE_DATE in
 * lib/health.mjs). The schedule fires daily either way and `digestPlan` says
 * whether today sends -- one schedule, one date, nothing to remember to edit.
 */
export default async (request, context) => {
  noteDeployContext(context);
  // The digest reports the live store; only production sends it (batch-1024 item 4).
  if (!mayPage()) {
    console.log(`watch: deploy context "${deployContext()}" is not production, no digest`);
    return new Response(null, { status: 204 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  const now = Date.now();
  const plan = digestPlan(now);
  if (!plan.send) {
    console.log(`watch: ${plan.cadence} digest, not today`);
    return new Response(null, { status: 204 });
  }
  const WINDOW_DAYS = plan.days;

  let found = [];
  try {
    found = await incidents(getStore({ name: "health", consistency: "strong" }), {
      now,
      window: WINDOW_DAYS * 24 * 60 * 60 * 1000,
    });
  } catch (e) {
    /**
     * THE STORE ITSELF FAILING IS THE MOST IMPORTANT THING TO SAY, not a
     * reason to send nothing. Reported as an incident of its own so the digest
     * that goes out is honest about what it could not see.
     */
    found = [{ kind: "health-store", detail: e.message, at: now }];
  }

  // The paged items carry their briefs, buyer links and one-tap retry links.
  const { subject, text, html } = digest({ found, days: WINDOW_DAYS, site: SITE.home, context: alertContext() });

  if (!apiKey) {
    console.log(`watch: ${subject} (no RESEND_API_KEY, nothing sent)`);
    return new Response(null, { status: 204 });
  }

  // `html` is the same plain text in a <pre>, with its links made tappable.
  // A monitoring digest wants to be READABLE, not designed.
  const sent = await sendMail({ to: SITE.contact, subject, html, text }, { apiKey });
  console.log(`watch: ${subject} -> ${sent.ok ? "sent" : `FAILED (${sent.reason})`}`);
  return new Response(null, { status: 204 });
};

/**
 * EVERY MORNING; `digestPlan` turns it weekly (Mondays) after the first 30
 * days. Failures already emailed the moment they happened; this is the
 * follow-up list, and the proof the watcher is still running.
 */
export const config = { schedule: "0 13 * * *" };
