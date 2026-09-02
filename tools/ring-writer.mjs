/**
 * Ring the writer from OUTSIDE Netlify.
 *
 * The in-platform safety net (`netlify/functions/sweep.mjs`, every fifteen
 * minutes) stopped firing on 2026-09-02 at 16:15Z and never came back: the
 * Netlify UI kept announcing a "next execution" and even "Run now" produced no
 * invocation, while the credit balance and the deploy were fine. A buyer whose
 * first draft was refused sat pending for the afternoon.
 *
 * This does exactly what the sweep does -- one POST with the trigger token --
 * from a GitHub Actions cron, so the net no longer depends on the platform
 * that lost it. The token is derived from GRANT_SECRET the same way the
 * writer derives it; the secret comes from the workflow's environment and is
 * never printed.
 *
 *   GRANT_SECRET=... node tools/ring-writer.mjs [origin]
 */
import { TRIGGER_HEADER, triggerToken } from "../netlify/lib/trigger.mjs";

const origin = process.argv[2] || "https://humandesign.thechampagnemethod.co";
const token = triggerToken(process.env.RING_SECRET || process.env.GRANT_SECRET);
if (!token) {
  console.error("ring-writer: RING_SECRET is not set; nothing rung");
  process.exit(1);
}
const res = await fetch(`${origin}/api/interpret`, { method: "POST", headers: { [TRIGGER_HEADER]: token } });
console.log(`ring-writer: rang ${origin}/api/interpret -> ${res.status}`);
if (res.status !== 202) process.exit(1);
