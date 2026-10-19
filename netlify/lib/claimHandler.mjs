import { paidLevel } from "./checkout.mjs";
import { mintGrant } from "./grant.mjs";
import { loadReading, mintReadingLink, nameCase, readingIdForSession, saveReading } from "./reading.mjs";
import { deliveryEmail } from "./deliveryEmail.mjs";
import { customerError } from "./failures.mjs";
import { customerText } from "../../shared/customerMessages.mjs";

/**
 * POST /api/claim, with everything it touches passed in.
 *
 * Moved out of the function on 10/16 for the reason it had to be: the two
 * failure paths here -- the purchase could not be saved, the delivery email
 * did not go -- only run when something has already gone wrong, so the happy
 * path never noticed that they called `record()` without importing it. The
 * ReferenceError turned a recoverable problem into a failed confirm for a
 * buyer whose money was already taken. Injected, every one of those paths is
 * now exercised by a test with a fake that fails on purpose.
 *
 * THE RULE THIS FILE KEEPS: once Stripe says "paid", the buyer's answer is a
 * 200. Whatever fails after that is ours -- recorded, Jeremy paged -- and the
 * buyer is told their purchase is safe.
 *
 * `note(kind, { detail, paid, ref })` files a failure at its severity
 * (netlify/lib/failures.mjs); `ref` is WHICH purchase, ids only. `send` is sendMail with the key already bound.
 */
export async function handleClaim({
  body,
  stripeKey,
  grantSecret,
  getSession,
  readings,
  send = null,
  note = async () => {},
  origin,
  links,
  now = Date.now(),
}) {
  const fail = (kind, opts) => {
    const { status, payload } = customerError(kind, opts);
    return { status, payload };
  };

  if (!stripeKey || !grantSecret) {
    console.log("POST /api/claim -> 503 (missing configuration)");
    await note("claim-misconfigured", { detail: "STRIPE_SECRET_KEY or GRANT_SECRET is not set" });
    return fail("claim-misconfigured");
  }

  let request;
  try {
    request = JSON.parse(body);
  } catch {
    await note("claim-bad-session", { detail: "body is not json" });
    return fail("claim-bad-session", { code: "bad_json" });
  }

  const id0 = request?.session_id;
  // Stripe session ids are `cs_` plus a long token. A length cap because this
  // parses what a stranger sends and nothing here should be unbounded.
  if (typeof id0 !== "string" || !id0.startsWith("cs_") || id0.length > 256) {
    await note("claim-bad-session", { detail: "not a checkout session id" });
    return fail("claim-bad-session");
  }

  let session;
  try {
    session = await getSession(stripeKey, id0);
  } catch (e) {
    // Stripe's text is for a developer; its code and status are the reason.
    console.log(`POST /api/claim -> 502 (${e?.code || e?.message})`);
    await note("claim-stripe-unreachable", {
      detail: `stripe ${e?.status ?? e?.name ?? "error"}${e?.code ? ` ${e.code}` : ""}`,
      ref: { session: id0 },
    });
    return fail("claim-stripe-unreachable");
  }

  const level = paidLevel(session);
  if (level === null) {
    // Not paid, still processing, or a session someone made up. All three get
    // the same answer, because telling them apart tells a stranger which ids
    // are real.
    console.log(`POST /api/claim -> 402 (payment_status ${session?.payment_status})`);
    await note("claim-not-paid", { detail: `payment_status ${session?.payment_status ?? "none"}` });
    return fail("claim-not-paid");
  }

  // Short-lived on purpose. A grant is spent within minutes of buying; the
  // artefact it unlocks is kept far longer (D-7).
  const grant = mintGrant({ tier: level, sku: session?.metadata?.sku, ttlSeconds: 3600 }, grantSecret);

  /**
   * THE PURCHASE IS RECORDED BEFORE THERE IS ANYTHING TO SHOW (Jeremy's
   * ruling: no birth-data entry until a payment succeeds). The record holds the
   * RECEIPT -- from Stripe, never from the browser -- and no chart.
   *
   * ONE PAYMENT, ONE READING: the id is derived from the session, so a repeat
   * claim finds the same reading and sends nothing twice.
   */
  const buyer = session?.customer_details ?? {};
  let url = null;
  let alreadyThere = false;
  let lastError = null;
  const id = readingIdForSession(id0, grantSecret);
  // WHICH purchase, for an alert: ids only (10/16). No tier until a reading
  // exists, so an alert never offers a link that leads nowhere.
  const payment = typeof session?.payment_intent === "string" ? session.payment_intent : undefined;
  const ref = { session: id0, reading: id, payment };
  // ONE MORE TRY before calling it (10/16). A blob store blip is the likeliest
  // cause, and the second ask usually lands.
  for (let attempt = 0; attempt < 2 && url === null; attempt++) {
    try {
      const existing = await loadReading(readings, id, now, { strict: true });
      if (existing) {
        alreadyThere = true;
        console.log("POST /api/claim: already claimed, returning the same reading");
      } else {
        await saveReading(readings, {
          id,
          tier: level,
          output: null,
          name: buyer.name ?? null,
          email: buyer.email ?? null,
          phone: buyer.phone ?? null,
          sku: session?.metadata?.sku ?? null,
          purchasedAt: typeof session?.created === "number" ? session.created * 1000 : now,
          paidCents: Number.isInteger(session?.amount_total) ? session.amount_total : null,
        });
      }
      url = `${origin}/r/${mintReadingLink({ id, tier: level }, grantSecret)}`;
    } catch (e) {
      lastError = e;
    }
  }

  if (url === null) {
    /**
     * The worst failure on this path: money taken, nothing stored, and no link
     * to send. It must NOT fail the claim -- the grant in the response is real
     * -- and it must reach Jeremy at once, because the buyer is now waiting on
     * an email only he (or the reconcile sweep) can cause.
     */
    console.log(`POST /api/claim: could not record the purchase (${lastError?.message})`);
    await note("claim-not-recorded", { detail: `tier ${level}: ${lastError?.name ?? "Error"}`, paid: true, ref });
  }

  /**
   * The email is best-effort: a buyer who never sees it still has their
   * reading on screen. But "best effort, logged" is how a buyer ends up the
   * only person who knows -- so a failure pages Jeremy, who can reach them.
   */
  if (url && !alreadyThere && buyer.email && typeof send === "function") {
    const { subject, html, text } = deliveryEmail({
      tier: level,
      // THE CAPITALISED NAME, the same one the store keeps.
      name: nameCase(buyer.name),
      url,
      links,
      // Always pending here: nobody has entered a birth moment yet. The
      // RECEIPT (fix 4A, 10/19): what was paid and when, from Stripe itself.
      pending: true,
      amountCents: Number.isInteger(session?.amount_total) ? session.amount_total : null,
      paidAt: typeof session?.created === "number" ? session.created * 1000 : now,
    });
    let sent;
    try {
      sent = await send({ to: buyer.email, subject, html, text });
    } catch (e) {
      sent = { ok: false, reason: e?.name ?? "threw" };
    }
    // Logged either way, and never with the address in it.
    console.log(`POST /api/claim: delivery email ${sent?.ok ? "sent" : `failed (${sent?.reason})`}`);
    if (!sent?.ok) {
      await note("claim-email", { detail: `${sent?.reason ?? "unknown"} (tier ${level})`, paid: true, ref: { ...ref, tier: level } });
    }
  } else if (url && !alreadyThere && !buyer.email) {
    console.log("POST /api/claim: no email on the purchase, nothing sent");
    await note("claim-no-address", { detail: `tier ${level}`, paid: true, ref: { ...ref, tier: level } });
  }

  console.log(`POST /api/claim -> 200 (tier ${level}${url ? ", link minted" : ", NO LINK"})`);
  return {
    status: 200,
    payload: {
      grant,
      level,
      url,
      // When there is no link, the page says why in the catalogue's words.
      ...(url
        ? {}
        : { notice: { key: "purchase-safe-setup-pending", message: customerText("purchase-safe-setup-pending") } }),
    },
  };
}
