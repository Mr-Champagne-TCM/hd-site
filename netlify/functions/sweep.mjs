import { getStore } from "@netlify/blobs";
import { TRIGGER_HEADER, triggerToken } from "../lib/trigger.mjs";
import { checkFailureRate, sweepIncidents } from "../lib/health.mjs";
import { sweepCounters } from "../lib/ratelimit.mjs";
import { alertSender } from "../lib/failures.mjs";
import { noteDeployContext } from "../lib/deployContext.mjs";
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
 *
 * A reading another run is writing right now is left to that run (decision
 * 23, 10/23): the writer this rings passes over any reading whose "writing"
 * lock is live (interpretJob.mjs, writingLock.mjs), and says so in its log.
 */
export default async (request, context) => {
  // Which deploy this is: the rate alarm pages only from production (batch-1024 item 4).
  noteDeployContext(context);
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

  // The failure records past their fourteen days (the privacy page says so; extra, picks-1023).
  try {
    const gone = await sweepIncidents(getStore({ name: "health", consistency: "strong" }));
    if (gone.deleted || gone.failed) console.log(`sweep: health records past 14 days: ${gone.deleted} deleted, ${gone.failed} failed`);
  } catch (e) {
    console.log(`sweep: could not clear old health records (${e.message})`);
  }

  // The scrambled-IP counters past their one week (the privacy page says so; picks-1023).
  for (const name of ["chart-rate", "resend-rate", "places-rate"]) {
    try {
      const gone = await sweepCounters(getStore({ name, consistency: "strong" }));
      if (gone.deleted || gone.failed) console.log(`sweep: ${name} counters past 7 days: ${gone.deleted} deleted, ${gone.failed} failed`);
    } catch (e) {
      console.log(`sweep: could not clear old ${name} counters (${e.message})`);
    }
  }
  return new Response(null, { status: 204 });
};

export const config = { schedule: "*/15 * * * *" };
