import { TIERS } from "../../shared/pricing.mjs";

/**
 * The delivery email, which is a door and not the product.
 *
 * D-11, close to Jeremy's own words: it says "Thank you for your purchase! Here
 * is your Human Design [summary | chart | reading]", and THAT SENTENCE is the
 * hyperlink. It also carries the two library links and, unless they are already
 * at the top tier, a link to upgrade -- which is the SAME link, because there is
 * one signed URL per purchase and the page decides what to offer.
 *
 * NO ATTACHMENT. The reading is delivered by link so that a re-send is possible
 * at all and so that an upgrade lands the buyer on a page rather than in an
 * inbox thread. Nothing in this email is the product.
 *
 * THE VOICE RULES APPLY HERE TOO, and they are easy to forget in an email
 * because every transactional email ever written is full of imperatives. This
 * one asks and offers; it does not instruct. "Here is your chart", not "Click
 * here to view your chart". "If you would like the rest", not "Upgrade now".
 * No urgency, no countdown, no "don't miss out" -- the link's six days are
 * stated as a fact about the link, never as pressure.
 *
 * The tier words come from shared/pricing.mjs rather than being written here.
 * A tier named in two places is a tier that will eventually be named two
 * different things.
 */

/** "The summary" -> "summary". The label carries an article the sentence supplies. */
function tierWord(tier) {
  const label = TIERS[tier]?.label;
  if (!label) return "reading";
  return label.replace(/^The\s+/i, "").toLowerCase();
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Build the delivery email.
 *
 * Takes everything it needs and reads nothing from the environment, so the
 * whole message can be asserted in a test without a network, a key or a clock.
 *
 * `name` is the buyer's, from the purchase. It is used only to open the message
 * and is allowed to be missing -- a greeting is a nicety, and a message that
 * cannot be sent because somebody checked out without a name would be a real
 * failure caused by a decorative one.
 */
export function deliveryEmail({ tier, name, url, links }) {
  const word = tierWord(tier);
  const top = tier >= TIERS.length - 1;
  const greeting = name ? `Hello ${name},` : "Hello,";

  const lead = `Thank you for your purchase! Here is your Human Design ${word}`;

  // The subject says what arrived, because a subject line is how somebody finds
  // this again in a year. "Thank you for your purchase" is a lovely opening and
  // a useless thing to search for.
  const subject = `Your Human Design ${word}`;

  const upgradeLine = top
    ? null
    : `If you would like the rest of it, the same link has your next step on it — ` +
      `and what you have already paid comes off what you pay next.`;

  const text = [
    greeting,
    "",
    `${lead}:`,
    url,
    "",
    "Two pieces in the library, free, written for exactly this moment:",
    `  Human Design, plainly — ${links.hd101}`,
    `  Reading your bodygraph — ${links.bodygraph}`,
    ...(upgradeLine ? ["", upgradeLine] : []),
    "",
    "This link is active for six days. After that it can be sent again — your",
    "reading is kept for a year, and it stays yours whether or not the link does.",
    "",
    "— The Champagne Method",
    links.home,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#1a1040;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e9e4f2;line-height:1.6">
<div style="max-width:34rem;margin:0 auto">
  <p style="margin:0 0 20px">${esc(greeting)}</p>

  <p style="margin:0 0 24px;font-size:18px">
    <a href="${esc(url)}" style="color:#3fe0c5;text-decoration:underline">${esc(lead)}</a>.
  </p>

  <p style="margin:0 0 8px;color:#b4a8ce">Two pieces in the library, free, written for exactly this moment:</p>
  <p style="margin:0 0 24px">
    <a href="${esc(links.hd101)}" style="color:#3fe0c5">Human Design, plainly</a><br>
    <a href="${esc(links.bodygraph)}" style="color:#3fe0c5">Reading your bodygraph</a>
  </p>

  ${
    upgradeLine
      ? `<p style="margin:0 0 24px;color:#b4a8ce">${esc(upgradeLine)}</p>`
      : ""
  }

  <p style="margin:0 0 24px;font-size:14px;color:#b4a8ce">
    This link is active for six days. After that it can be sent again — your reading is kept
    for a year, and it stays yours whether or not the link does.
  </p>

  <p style="margin:0;font-size:14px;color:#b4a8ce">
    — <a href="${esc(links.home)}" style="color:#c9a227">The Champagne Method</a>
  </p>
</div>
</body></html>`;

  return { subject, html, text };
}
