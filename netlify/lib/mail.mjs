/**
 * Sending an email.
 *
 * One function, one provider behind it, and the provider named in exactly one
 * place. Resend was chosen for being free at this volume -- 3,000 a month,
 * capped at 100 a day, which would need a hundred sales in one day to reach --
 * and for being a single POST rather than an SDK.
 *
 * NO SDK, for the same reason the Stripe client has none: a dependency that
 * wraps one HTTP call is a supply-chain risk and a version to keep up with, in
 * exchange for saving twenty lines. The API version is not pinned here because
 * Resend does not version its send endpoint; if that ever changes, it changes
 * in this file.
 *
 * WHAT THIS FILE MUST NEVER DO. It must never decide WHO to send to. The
 * address comes from the stored purchase, per D-9, and a function that could be
 * handed an address by a request is a function that will eventually be handed
 * one by a stranger. `to` arrives already decided; this only carries it.
 *
 * SWAPPING PROVIDERS is a rewrite of `deliver()` and nothing else. Everything
 * above it -- the template, the delivery path, the tests -- works in terms of
 * `sendMail`, which is why the shape is a plain object of headers and bodies
 * rather than anything Resend-flavoured.
 */

/**
 * D-12, amended. One address, and the routing happens off-site.
 *
 * The first version put Jeremy's personal Gmail in Reply-To, which achieved the
 * right thing -- replies reaching the inbox he reads -- by the wrong route. The
 * leak scanner caught it, and it was right twice over: that address would have
 * been committed to a PUBLIC repo for scrapers, and printed in the headers of
 * every email to every buyer.
 *
 * Forwarding does the same job privately. `hd-readings@` is forwarded at the
 * registrar to wherever he wants it to land, so a reply still arrives in his
 * inbox and his personal address appears in neither place. Where mail ends up
 * is a setting he controls, not a string in a public repo -- which also means
 * changing it later is a registrar edit rather than a deploy.
 *
 * Here rather than in the environment on purpose. These are not secrets, they
 * are part of the product's voice, and a from-address settable by an
 * environment variable is one that gets changed by accident on one deploy and
 * not another.
 */
export const FROM = "The Champagne Method <hd-readings@thechampagnemethod.co>";
export const REPLY_TO = "hd-readings@thechampagnemethod.co";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Send one email. Returns `{ ok: true, id }` or `{ ok: false, reason }`.
 *
 * NEVER THROWS, and never on a caller's behalf. A failed send must not take a
 * successful purchase down with it: the money is taken, the reading is stored,
 * and the buyer is looking at it on screen. An email that did not go is a
 * problem to report and retry, not a reason to fail the request that produced
 * it.
 *
 * `fetchImpl` is injectable so the whole path can be tested without a network
 * and without a key. The tests are the reason the argument exists; nothing in
 * production passes it.
 */
export async function sendMail(
  { to, subject, html, text },
  { apiKey, fetchImpl = fetch, timeoutMs = 10_000 } = {},
) {
  if (!apiKey) return { ok: false, reason: "misconfigured" };
  if (typeof to !== "string" || !to.includes("@")) return { ok: false, reason: "no_recipient" };
  if (typeof subject !== "string" || !subject) return { ok: false, reason: "no_subject" };
  if (typeof html !== "string" || !html) return { ok: false, reason: "no_body" };

  // A plain-text alternative is not optional. Without one a message is more
  // likely to be filtered, and it is the version a screen reader and a
  // text-only client actually get.
  if (typeof text !== "string" || !text) return { ok: false, reason: "no_text_body" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: [to],
        subject,
        html,
        text,
      }),
      signal: controller.signal,
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // The provider's message is logged, never returned to a visitor -- it can
      // name the recipient, and an error surface that echoes an address is a
      // way to confirm whether an address exists.
      console.log(`mail: send failed ${res.status} ${body?.message ?? ""}`.trim());
      return { ok: false, reason: res.status >= 500 ? "provider_down" : "rejected" };
    }
    return { ok: true, id: body?.id ?? null };
  } catch (e) {
    console.log(`mail: send threw ${e?.name === "AbortError" ? "timeout" : "network"}`);
    return { ok: false, reason: e?.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
