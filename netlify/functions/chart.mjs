import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { handleChart } from "../lib/handler.mjs";
import { loadReading, mintReadingLink } from "../lib/reading.mjs";
import { deliveryEmail } from "../lib/deliveryEmail.mjs";
import { record } from "../lib/health.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";

/**
 * POST /api/chart -- the free summary.
 *
 * Unauthenticated public traffic reaching a metered service, so this free layer
 * is the shield: the JVM never sees a request that was going to be refused.
 *
 * The visitor's IP is never stored. It is hashed with a server-side salt and
 * only the hash is kept, so the counter works without this becoming a log of
 * who visited and when.
 */
export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method", message: "Use POST." } }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const blobs = getStore({ name: "chart-rate", consistency: "strong" });

  // No silent fallback to an empty salt. An unsalted hash of an IPv4 address is
  // reversible by anyone willing to hash four billion candidates, which is a
  // few seconds -- so a missing salt turns the counter store into a readable
  // record of who visited and when. Refusing is the honest failure: it says
  // what is wrong, and it cannot be mistaken for working.
  const salt = process.env.RATE_SALT;
  if (!salt) {
    console.log("POST /api/chart -> 503 (RATE_SALT is not set)");
    return new Response(
      JSON.stringify({
        error: {
          code: "misconfigured",
          message: "Charts are briefly unavailable. Nothing was charged. Please try again shortly.",
        },
      }),
      { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  }

  const store = {
    async keyFor(ip) {
      return createHash("sha256").update(salt).update(String(ip)).digest("hex").slice(0, 32);
    },
    async load(key) {
      const raw = await blobs.get(key, { type: "json" });
      return Array.isArray(raw) ? raw : [];
    },
    async save(key, hits) {
      await blobs.setJSON(key, hits);
    },
  };

  const engine = async (payload) => {
    const res = await fetch(`${process.env.ENGINE_URL}/v1/chart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Engine-Key": process.env.ENGINE_KEY,
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status, payload: await res.json() };
  };

  const ip = context?.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";

  const result = await handleChart({
    body: await request.text(),
    ip,
    now: Date.now(),
    store,
    engine,
    grantSecret: process.env.GRANT_SECRET,
    /**
     * Where a computed chart is put away, when the request arrived on a paid
     * reading link. Separate store from the rate counters above: one holds
     * people's readings for a year, the other holds hashed IPs for a week, and
     * a single bucket for both is how a retention rule gets applied to the
     * wrong thing.
     */
    readings: getStore({ name: "readings", consistency: "strong" }),

    /**
     * Tell them it is ready, with a link that now opens a chart rather than a
     * form. A FRESH link, six days from now, because the one they followed may
     * be most of the way through its own six.
     */
    deliver: async ({ id, tier }) => {
      const secret = process.env.GRANT_SECRET;
      const apiKey = process.env.RESEND_API_KEY;
      if (!secret || !apiKey) return;

      const store = getStore({ name: "readings", consistency: "strong" });
      const reading = await loadReading(store, id, Date.now());
      const to = reading?.buyer?.email;
      if (!to) {
        console.log("chart: no address on the purchase, nothing sent");
        await record(getStore({ name: "health", consistency: "strong" }), {
          kind: "ready-email-no-address",
          detail: `tier ${tier}`,
        });
        return;
      }

      const url = `${new URL(request.url).origin}/r/${mintReadingLink({ id, tier }, secret)}`;
      const { subject, html, text } = deliveryEmail({
        tier,
        name: reading.buyer.name,
        url,
        links: SITE,
        pending: false,
      });
      const sent = await sendMail({ to, subject, html, text }, { apiKey });
      console.log(`chart: ready-email ${sent.ok ? "sent" : `failed (${sent.reason})`}`);
      // The second email. Nobody notices it missing except the buyer.
      if (!sent.ok) {
        await record(getStore({ name: "health", consistency: "strong" }), {
          kind: "ready-email",
          detail: `${sent.reason} (tier ${tier})`,
        });
      }
    },
    // The launch switch. Absent or anything but "1" means open, which is how
    // the page has behaved since it went up and how it is being tested. Set it
    // to "1" and nothing is served without a paid grant.
    //
    // A switch rather than a code change, so turning the paywall on is not a
    // deploy and turning it back off in a hurry is not one either.
    paywall: process.env.PAYWALL === "1",
  });

  // Status only. The request body carries birth data and is never logged, at
  // any level, in any environment -- a body log would put it into a retention
  // window and would not show up in any manual test.
  console.log(`POST /api/chart -> ${result.status}`);

  return new Response(result.body, { status: result.status, headers: result.headers });
};

export const config = { path: "/api/chart" };
