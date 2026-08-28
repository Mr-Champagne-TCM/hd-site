import { loadReading, mintReadingLink, readReadingLink } from "./reading.mjs";
import { deliveryEmail } from "./deliveryEmail.mjs";

/**
 * Sending a reading again — including from a link that has already expired.
 *
 * D-13, and the whole thing rests on one observation: AN EXPIRED LINK IS NOT A
 * BROKEN LINK. Its signature is still valid, it still names a real reading, and
 * it is still proof that whoever holds it was given it legitimately. The only
 * thing that ran out is the clock.
 *
 * So expiry answers two different questions differently:
 *
 *     may I SEE this reading?              six days, then no
 *     may I have a fresh link SENT?        the signature is enough
 *
 * That asymmetry is the feature. A dead link heals itself and nobody writes to
 * anybody.
 *
 * WHAT AN ATTACKER GETS, since this deliberately accepts an expired token. An
 * old link found in a forwarded email is a bearer token for this action. But it
 * SENDS TO THE ADDRESS ON THE PURCHASE and returns nothing to the caller: no
 * reading, no address, not even confirmation that anything exists. The only
 * harm available is causing email to somebody else's inbox, which is why the
 * answer is rate limiting rather than more authentication. A password guarding
 * an action whose entire output goes to the victim would be guarding the wrong
 * door.
 */

/**
 * TWO LIMITS, because they stop different attacks.
 *
 *   per reading   one buyer's inbox being buried from many machines
 *   per visitor   one machine walking many links it happens to have collected
 *
 * A per-visitor limit alone leaves a botnet free to bury one person. A
 * per-reading limit alone leaves one machine free to hit thousands of readings
 * once each. Neither is redundant.
 *
 * The numbers are small on purpose. A person who wants their reading again
 * needs one send, occasionally two if the first went to spam. Three in ten
 * minutes is already generous for the honest case, and the daily cap is what
 * bounds a slow drip.
 */
export const READING_LIMITS = [
  { name: "burst", ms: 10 * 60_000, max: 3 },
  { name: "day", ms: 86_400_000, max: 10 },
];
export const VISITOR_LIMITS = [
  { name: "burst", ms: 10 * 60_000, max: 5 },
  { name: "day", ms: 86_400_000, max: 20 },
];

function overLimit(hits, now, limits) {
  for (const l of limits) {
    if (hits.filter((t) => now - t < l.ms).length >= l.max) return l;
  }
  return null;
}

const HORIZON = 86_400_000;

/**
 * Re-send a reading.
 *
 * Everything is injected -- the store, the limits' storage, the clock, the
 * sender -- so the whole path is testable without Netlify, a network, a key or
 * a real minute passing.
 */
export async function handleResend({
  body,
  store,
  counters,
  visitorKey,
  secret,
  send,
  origin,
  links,
  now = Date.now(),
}) {
  let request;
  try {
    request = JSON.parse(body);
  } catch {
    return json(400, { error: { code: "bad_json", message: "That request was not readable." } });
  }

  /**
   * EXPIRY IS IGNORED HERE, and that is the point of D-13. `readReadingLink`
   * refuses an expired token, so this asks it a moment the token was still
   * alive for -- epoch. The signature is what is being checked; the clock is
   * not part of this question.
   *
   * Everything else it enforces still applies: a bad signature, a malformed
   * payload and a bogus reading id are all refused exactly as before.
   */
  const link = readReadingLink(request?.token, secret, 0);
  if (!link.ok) {
    if (link.reason === "misconfigured") {
      return json(503, {
        error: { code: "misconfigured", message: "That could not be sent just now. Please try again shortly." },
      });
    }
    return json(404, { error: { code: "not_found", message: "That link could not be opened." } });
  }

  // The visitor limit is charged BEFORE the store is touched, so somebody
  // hammering made-up tokens cannot make us do lookups for free.
  const visitorHits = await counters.load(`v:${visitorKey}`);
  const visitorFull = overLimit(visitorHits, now, VISITOR_LIMITS);
  if (visitorFull) return tooMany();

  const reading = await loadReading(store, link.id, now);
  // Past the year there is nothing to send, which needs no separate rule.
  // Indistinguishable from a forged id, deliberately.
  if (!reading) {
    return json(404, { error: { code: "not_found", message: "That link could not be opened." } });
  }
  if (!reading.buyer?.email) {
    return json(409, {
      error: {
        code: "no_address",
        message:
          "There is no email address on this purchase, so there is nowhere to send it. A note through the site can sort it out.",
      },
    });
  }

  const readingHits = await counters.load(`r:${link.id}`);
  if (overLimit(readingHits, now, READING_LIMITS)) return tooMany();

  // Both counters are charged BEFORE the send, not after. A send that fails
  // still cost somebody an attempt, and a failure that refunded the attempt
  // would be an unlimited retry loop for anyone who can make sends fail.
  await counters.save(`v:${visitorKey}`, prune([...visitorHits, now], now));
  await counters.save(`r:${link.id}`, prune([...readingHits, now], now));

  /**
   * A FRESH LINK, not the one that was presented. Six days again, from now.
   * Re-sending the expired token would be a re-send of nothing.
   */
  const fresh = mintReadingLink({ id: link.id, tier: reading.tier, now }, secret);
  const url = `${origin}/r/${fresh}`;

  const { subject, html, text } = deliveryEmail({
    tier: reading.tier,
    name: reading.buyer.name,
    url,
    links,
  });

  const sent = await send({ to: reading.buyer.email, subject, html, text });
  if (!sent.ok) {
    console.log(`resend: send failed (${sent.reason})`);
    return json(502, {
      error: {
        code: "send_failed",
        message: "That could not be sent just now. Nothing has changed about your reading — trying again usually works.",
      },
    });
  }

  /**
   * The response says a send happened and NOTHING about where. Echoing even a
   * masked address would confirm that this reading exists and that this is the
   * address on it, to anybody holding an old link.
   */
  return json(200, { sent: true });
}

function prune(hits, now) {
  return hits.filter((t) => now - t < HORIZON);
}

function tooMany() {
  // One message for both limits. Which one was hit is a fact about our defences
  // and not something a caller needs -- or should be able to probe for.
  return json(429, {
    error: {
      code: "too_many",
      message:
        "That has been sent a few times just now. Give it a few minutes and it will go through — nothing is wrong with your reading.",
    },
  });
}

function json(status, payload) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
    },
    body: JSON.stringify(payload),
  };
}
