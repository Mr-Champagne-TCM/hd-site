import { getStore } from "@netlify/blobs";
import { TRIGGER_HEADER, triggerToken } from "../lib/trigger.mjs";
import { checkFailureRate } from "../lib/health.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";

/**
 * THE SAFETY NET, and nothing else.
 *
 * Writing a reading is triggered the moment a reading-tier chart is filed. This
 * exists for the case where that trigger never happened: a crash between filing
 * the chart and firing the request, a deploy mid-flight, a network blip on the
 * way out. Without it, one missed call leaves a buyer waiting forever with
 * every surface looking fine -- which is the exact failure mode the whole
 * watcher was built for.
 *
 * IT DOES NO WORK ITSELF. It rings the doorbell and leaves, so there is one
 * writer rather than two implementations of the same job drifting apart. The
 * one other thing it does is LOOK: it counts the refused drafts of the last
 * hour and raises the rate alarm (lib/health.mjs, audit F53). That is watching,
 * not writing, and a fifteen-minute clock is already the right one for it.
 *
 * EVERY FIFTEEN MINUTES, which is 2,880 invocations a month against a free
 * allowance of 125,000. The per-minute schedule this replaces would have been
 * 43,200 -- a third of the budget -- to discover, every single time, that there
 * was nothing to do.
 *
 * Finding nothing is the NORMAL case here. That is what a safety net is.
 */
export default async () => {
  const secret = process.env.GRANT_SECRET;
  const origin = process.env.URL;
  const token = triggerToken(secret);

  if (!token || !origin) {
    console.log("sweep: not configured, nothing rung");
  } else {
    try {
      const res = await fetch(`${origin}/api/interpret`, {
        method: "POST",
        headers: { [TRIGGER_HEADER]: token },
      });
      // A background function answers 202 immediately; the work happens after.
      console.log(`sweep: rang the writer -> ${res.status}`);
    } catch (e) {
      console.log(`sweep: could not reach the writer (${e.message})`);
    }
  }

  try {
    const rate = await checkFailureRate(getStore({ name: "health", consistency: "strong" }), {
      send: alertSender(process.env.RESEND_API_KEY),
      site: origin || SITE.home,
    });
    if (rate.alarmed) console.log(`sweep: failure-rate alarm (${rate.count} in the hour)`);
  } catch (e) {
    console.log(`sweep: could not check the failure rate (${e.message})`);
  }
  return new Response(null, { status: 204 });
};

/** The same plain alert the writer sends, to the forwarding address (D-12). */
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
