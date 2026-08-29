import { mintReadingLink, nameCase, readingIdForSession, saveReading } from "./reading.mjs";
import { paidLevel } from "./checkout.mjs";

/**
 * WHO PAID AND GOT NOTHING.
 *
 * Delivery happens in `claim`, which runs because the buyer's browser comes
 * back from Stripe to the success URL. Almost always it does. When it does not
 * -- a closed tab, a dead battery, a crash, a dropped connection on the
 * redirect, a "return to merchant" nobody pressed -- the money is taken and
 * NOTHING on our side ever hears about it. No reading, no email, no record, and
 * no alert, because nothing knew a purchase had happened at all.
 *
 * That is the one failure this whole system could not see, and it is the worst
 * one available: a real person has paid and is holding nothing.
 *
 * Jeremy's instinct, and it is better than the webhook I first proposed: "can
 * we set up a watcher to report if someone hasn't been delivered their product
 * yet?" Yes -- and it is stronger than a webhook, because it does not care WHY
 * the delivery is missing. A webhook that is never sent, or is sent and lost,
 * looks exactly like a browser that never returned; this catches all of them,
 * and catches them again on the next run if the first attempt fails.
 *
 * It costs a delay the normal path does not pay. A buyer who comes back is
 * served instantly by `claim` as before; only the already-broken case waits for
 * the next run.
 *
 * SAFE BECAUSE THE ID IS DERIVED FROM THE PAYMENT. A reading's id is an HMAC of
 * the Stripe session id, so this computes the same id `claim` would have and
 * simply finds it already there. Without that, this function would be a
 * duplicate-delivery machine: it would look at a paid session, fail to
 * recognise the reading claim had already made, and send a second copy.
 *
 * No network and no Netlify here. Everything is passed in, so the whole
 * decision can be tested -- which matters more here than anywhere, because the
 * thing being tested is whether somebody who paid gets what they paid for.
 */

/** How far back to look. Generous: re-examining a delivered session is free. */
export const LOOK_BACK_MS = 48 * 60 * 60 * 1000;

/**
 * NOTHING BEFORE THIS CAN BE MATCHED, AND NOTHING BEFORE THIS NEEDS TO BE.
 *
 * A reading's id became an HMAC of the Stripe session id at this moment. Every
 * reading created before it has a RANDOM id, and the hash is one way, so there
 * is no way to look at an older payment and work out which reading belongs to
 * it -- the session id was never stored.
 *
 * Which means an older paid session always looks undelivered here, whether or
 * not it was delivered perfectly at the time. The first run said so: 18 paid,
 * 18 "undelivered", every one of them a test purchase whose delivery email is
 * sitting in Jeremy's inbox. Armed, that would have sent eighteen duplicates in
 * one go. It shipped report-only, which is the only reason it did not.
 *
 * Those purchases were all handled by `claim` when they happened, so skipping
 * them loses nothing. The window this function actually cares about -- the last
 * two days of real trading -- moves past this line permanently within days.
 */
export const NEW_ID_SCHEME_FROM = Date.parse("2026-08-29T21:45:00Z");

/**
 * Deliver anything paid that has no reading. Returns what it found and did.
 *
 * `deliver` may be omitted, which makes this a REPORT rather than an action --
 * it will say what is missing and change nothing. That is the mode to run
 * first, when the question is still "is this thing right?" rather than "is this
 * thing on?".
 */
export async function reconcile({
  sessions,
  store,
  grantSecret,
  origin,
  deliver = null,
  report = null,
  now = Date.now(),
}) {
  const result = { checked: 0, skippedOld: 0, paid: 0, missing: 0, delivered: 0, failed: 0, ids: [] };
  if (!grantSecret || !Array.isArray(sessions)) return result;

  for (const session of sessions) {
    result.checked += 1;

    // Older than the id scheme: unmatchable, and already delivered by `claim`.
    const created = typeof session?.created === "number" ? session.created * 1000 : 0;
    if (created < NEW_ID_SCHEME_FROM) {
      result.skippedOld += 1;
      continue;
    }

    // paidLevel is the SAME function the claim path uses to decide whether a
    // session was paid and for what. Two implementations of "did they pay"
    // would eventually disagree, and the disagreement would be about money.
    const level = paidLevel(session);
    if (level === null) continue;
    result.paid += 1;

    const sessionId = session?.id;
    if (typeof sessionId !== "string" || !sessionId) continue;

    const id = readingIdForSession(sessionId, grantSecret);

    /**
     * THE STORE IS ASKED DIRECTLY, NOT THROUGH `loadReading`.
     *
     * `loadReading` catches a store error and returns null, which is right for
     * every other caller -- a reading page should say "not found" rather than
     * explode. Here it is dangerous: "the store did not answer" would become
     * "nothing is there", and nothing-is-there means DELIVER. One blip and
     * everybody who bought in the last two days gets a second copy.
     *
     * Caught by the test for exactly that, which failed on the first version
     * of this file.
     *
     * Presence of any record at this key is enough. It can only have been
     * written by the claim path or by a previous run of this one.
     */
    let existing;
    try {
      existing = await store.get(id, { type: "json" });
    } catch {
      // Not proof of absence. Skip, and let a later run decide when the store
      // is answering again.
      continue;
    }
    if (existing) continue;

    // Paid, and nothing was ever created for it.
    result.missing += 1;
    result.ids.push(sessionId);

    if (typeof report === "function") {
      // Told either way. Jeremy asked to know when this happens, and a watcher
      // that quietly repairs things teaches nobody that they were broken.
      await report({
        kind: "purchase-undelivered",
        detail: `tier ${level}, session created ${new Date((session.created ?? 0) * 1000).toISOString()}`,
      }).catch(() => {});
    }

    if (typeof deliver !== "function") continue;

    const buyer = session?.customer_details ?? {};
    try {
      await saveReading(store, {
        id,
        tier: level,
        output: null,
        name: buyer.name ?? null,
        email: buyer.email ?? null,
        phone: buyer.phone ?? null,
        sku: session?.metadata?.sku ?? null,
        purchasedAt: typeof session?.created === "number" ? session.created * 1000 : now,
      });

      const url = `${origin}/r/${mintReadingLink({ id, tier: level }, grantSecret)}`;
      await deliver({
        to: buyer.email ?? null,
        name: nameCase(buyer.name),
        url,
        tier: level,
      });
      result.delivered += 1;
    } catch {
      // The record may now exist without the email having gone. That is FINE
      // and is the reason the email is sent to the address on the purchase
      // rather than being the only copy: the next run finds the reading
      // present and stops, and the buyer can still be reached by hand from the
      // incident this already reported.
      result.failed += 1;
    }
  }

  return result;
}
