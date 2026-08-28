import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { handleResend } from "../lib/resendHandler.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";

/**
 * POST /api/resend -- send a reading again, to the address on the purchase.
 *
 * The thin half. All the judgement lives in ../lib/resendHandler.mjs, tested
 * without Netlify, a network, a key or a real minute passing.
 *
 * Accepts an EXPIRED link on purpose (D-13). The signature is what authorises
 * this, not the clock -- and what the action can produce is an email to the
 * buyer's own address plus `{"sent":true}`, which is why rate limiting is the
 * right defence rather than more authentication.
 */
export default async (request, context) => {
  if (request.method !== "POST") {
    return json(405, { error: { code: "method", message: "Use POST." } });
  }

  const secret = process.env.GRANT_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  const salt = process.env.RATE_SALT;
  if (!secret || !apiKey || !salt) {
    // Named in the log, vague to the caller. Which piece of configuration is
    // missing is our problem to fix and not a stranger's to learn.
    console.log(
      `POST /api/resend -> 503 (missing: ${[
        !secret && "GRANT_SECRET",
        !apiKey && "RESEND_API_KEY",
        !salt && "RATE_SALT",
      ].filter(Boolean).join(", ")})`,
    );
    return json(503, {
      error: { code: "misconfigured", message: "That could not be sent just now. Please try again shortly." },
    });
  }

  const blobs = getStore({ name: "resend-rate", consistency: "strong" });
  const counters = {
    async load(key) {
      const raw = await blobs.get(key, { type: "json" }).catch(() => null);
      return Array.isArray(raw) ? raw : [];
    },
    async save(key, hits) {
      await blobs.setJSON(key, hits);
    },
  };

  /**
   * The visitor is a salted hash of the IP and never the IP itself, exactly as
   * the chart limiter does it. An unsalted hash of an IPv4 address is
   * reversible in seconds by anyone willing to hash four billion candidates,
   * which would turn this counter store into a log of who asked for what and
   * when.
   */
  const ip = context?.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";
  const visitorKey = createHash("sha256").update(salt).update(String(ip)).digest("hex").slice(0, 32);

  const result = await handleResend({
    body: await request.text(),
    store: getStore({ name: "readings", consistency: "strong" }),
    counters,
    visitorKey,
    secret,
    send: (message) => sendMail(message, { apiKey }),
    origin: new URL(request.url).origin,
    links: SITE,
    now: Date.now(),
  });

  // Status only. Never the token, never the reading id, never the address.
  console.log(`POST /api/resend -> ${result.status}`);

  return new Response(result.body, { status: result.status, headers: result.headers });
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
  });
}

export const config = { path: "/api/resend" };
