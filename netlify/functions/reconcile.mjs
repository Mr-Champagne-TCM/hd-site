import { getStore } from "@netlify/blobs";
import { LOOK_BACK_MS, reconcile } from "../lib/reconcile.mjs";
import { listSessions } from "../lib/stripe.mjs";
import { deliveryEmail } from "../lib/deliveryEmail.mjs";
import { sendMail } from "../lib/mail.mjs";
import { reportFailure } from "../lib/health.mjs";
import { SITE } from "../lib/siteLinks.mjs";

/**
 * DID ANYBODY PAY AND GET NOTHING?
 *
 * The question nothing could answer until now. See lib/reconcile.mjs for why it
 * exists and why it is safe to run repeatedly.
 *
 * EVERY FIFTEEN MINUTES, on the same reasoning as `sweep`: 2,880 invocations a
 * month against a free allowance of 125,000, and finding nothing is the normal
 * case. That is what a safety net is.
 *
 * REPORT-ONLY UNTIL RECONCILE_DELIVER IS SET. Jeremy's option: watch it be
 * right before letting it act. Unset, it finds undelivered purchases and raises
 * an incident for each one, and sends nothing to anybody. Set to "1", it also
 * delivers. The alert fires in BOTH modes, so turning delivery on never makes
 * the failure quieter.
 */
export default async () => {
  const key = process.env.STRIPE_SECRET_KEY;
  const grantSecret = process.env.GRANT_SECRET;
  const mailKey = process.env.RESEND_API_KEY;
  const origin = process.env.URL || "https://humandesign.thechampagnemethod.co";

  if (!key || !grantSecret) {
    console.log("reconcile: not configured, nothing checked");
    return new Response(null, { status: 204 });
  }

  const health = getStore({ name: "health", consistency: "strong" });
  const store = getStore({ name: "readings", consistency: "strong" });

  let page;
  try {
    page = await listSessions(key, { createdGte: Date.now() - LOOK_BACK_MS });
  } catch (e) {
    console.log(`reconcile: could not ask Stripe (${e.code || e.message})`);
    return new Response(null, { status: 204 });
  }

  /**
   * A TRUNCATED LIST IS SAID OUT LOUD. One page is a hundred sessions in two
   * days; more than that and some purchases were not looked at, which is
   * exactly the silence this function exists to break.
   */
  if (page.more) {
    await reportFailure(health, {
      kind: "reconcile-truncated",
      detail: "more than one page of sessions in the window; some were not checked",
      send: alertSender(mailKey),
      site: origin,
    }).catch(() => {});
  }

  const acting = process.env.RECONCILE_DELIVER === "1";
  const result = await reconcile({
    sessions: page.sessions,
    store,
    grantSecret,
    origin,
    deliver: acting && mailKey ? sendDelivery(mailKey) : null,
    /**
     * THE ALERT SAYS WHETHER ANYTHING WAS DONE ABOUT IT.
     *
     * In report-only mode this incident means a real person has paid and is
     * still holding nothing -- and the one thing the person reading it needs to
     * know is that nobody is coming unless they act. An alert that reads the
     * same whether or not the problem was fixed is an alert that gets skimmed.
     */
    report: (incident) =>
      reportFailure(health, {
        ...incident,
        detail:
          `${incident.detail}${
            acting
              ? " -- delivered automatically"
              : " -- NOT DELIVERED: RECONCILE_DELIVER is not set to 1, so this needs you"
          }`,
        send: alertSender(mailKey),
        site: origin,
      }),
  });

  console.log(
    `reconcile: ${result.checked} session(s), ${result.paid} paid, ` +
      `${result.missing} undelivered, ${result.delivered} delivered, ${result.failed} failed` +
      (acting ? "" : " [report-only]"),
  );
  return new Response(null, { status: 204 });
};

/** The same delivery email every other path sends, so there is one design. */
function sendDelivery(apiKey) {
  return async ({ to, name, url, tier }) => {
    if (!to) return;
    const { subject, html, text } = deliveryEmail({ tier, name, url, links: SITE, pending: true });
    const sent = await sendMail({ to, subject, html, text }, { apiKey });
    console.log(`reconcile: delivery ${sent.ok ? "sent" : `failed (${sent.reason})`}`);
    if (!sent.ok) throw new Error(sent.reason || "send failed");
  };
}

/** How an incident reaches Jeremy the moment it happens. */
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

export const config = { schedule: "*/15 * * * *" };
