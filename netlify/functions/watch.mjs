import { getStore } from "@netlify/blobs";
import { digest, incidents } from "../lib/health.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";

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
 * 13:00 UTC is morning in Central time, which is when Jeremy is at a desk.
 */
export default async () => {
  const apiKey = process.env.RESEND_API_KEY;
  const now = Date.now();
  const WINDOW_HOURS = 24;

  let found = [];
  try {
    found = await incidents(getStore({ name: "health", consistency: "strong" }), {
      now,
      window: WINDOW_HOURS * 60 * 60 * 1000,
    });
  } catch (e) {
    /**
     * THE STORE ITSELF FAILING IS THE MOST IMPORTANT THING TO SAY, not a
     * reason to send nothing. Reported as an incident of its own so the digest
     * that goes out is honest about what it could not see.
     */
    found = [{ kind: "health-store", detail: e.message, at: now }];
  }

  const { subject, text } = digest({ found, hours: WINDOW_HOURS, site: SITE.home });

  if (!apiKey) {
    console.log(`watch: ${subject} (no RESEND_API_KEY, nothing sent)`);
    return new Response(null, { status: 204 });
  }

  /**
   * `sendMail` requires an HTML alternative and refuses without one -- a rule
   * worth keeping rather than working around, so this builds the plainest
   * possible one. A monitoring digest wants to be READABLE, not designed.
   */
  const html =
    '<pre style="font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">' +
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
    "</pre>";

  const sent = await sendMail({ to: SITE.contact, subject, html, text }, { apiKey });
  console.log(`watch: ${subject} -> ${sent.ok ? "sent" : `FAILED (${sent.reason})`}`);
  return new Response(null, { status: 204 });
};

export const config = { schedule: "0 13 * * *" };
