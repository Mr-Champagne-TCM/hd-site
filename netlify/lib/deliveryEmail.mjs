import { TIERS } from "../../shared/pricing.mjs";

/**
 * The delivery email, which is a door and not the product.
 *
 * D-11, close to Jeremy's own words: it says "Thank you for your purchase!",
 * then a BUTTON to their reading. Two library links with a line each saying
 * what they are for, a link home, and — unless they are already at the top
 * tier — a way to upgrade. The upgrade is the SAME link, because there is one
 * signed URL per purchase and the page decides what to offer.
 *
 * NO ATTACHMENT. The reading is delivered by link so that a re-send is possible
 * at all and so an upgrade lands the buyer on a page rather than in an inbox
 * thread. Nothing in this email is the product.
 *
 * IT KNOWS WHETHER THE READING EXISTS YET, which is the fault the first version
 * had. Somebody pays before they enter a birth moment, so the email that
 * arrives seconds after the card is a door to a FORM, not to a chart —
 * "Here is your Human Design summary" was a promise about something that had
 * not been made. Two wordings now, chosen by whether the reading is filled:
 *
 *   pending   Create and view your Human Design chart
 *   filled    Access your Human Design chart
 *
 * THE SIX DAYS ARE NOT MENTIONED IN THE FIRST EMAIL, and that is Jeremy's
 * call. In the app the line urged people to act; here it arrives seconds after
 * a card has been charged, before they have anything, and it reads as a
 * question about whether their purchase expires. "It adds anxiety about what
 * happens when 6 days passes. Do they lose their purchase?"
 *
 * So it appears only once there is something to come back TO, where it reads
 * as how to get it again rather than as a countdown on something they have
 * just bought.
 *
 * THE VOICE RULES APPLY HERE TOO, and they are easy to forget in an email
 * because every transactional email ever written is full of imperatives. This
 * one asks and offers; it does not instruct. No urgency, no countdown, no
 * "don't miss out" — the link's six days are stated as a fact about the link
 * and immediately followed by the reassurance, never as pressure.
 *
 * The tier words come from shared/pricing.mjs rather than being written here. A
 * tier named in two places is a tier that will eventually be named two
 * different things.
 */

/** "The summary" -> "summary". The label carries an article the sentence supplies. */
function tierWord(tier) {
  const label = TIERS[tier]?.label;
  if (!label) return "reading";
  return label.replace(/^The\s+/i, "").toLowerCase();
}

function lowerFirst(s) {
  return typeof s === "string" && s ? s[0].toLowerCase() + s.slice(1) : "";
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Brand, in the few places an email client will honour them. */
const GOLD = "#c9a227";
const TEAL = "#3fe0c5";
const PAPER = "#e9e4f2";
const MUTED = "#b4a8ce";
const GROUND = "#1a1040";
const PANEL = "#241a4e";

/**
 * A button that survives Outlook, which draws no CSS it was not asked to.
 *
 * A table with a background colour and padding is the only thing that renders
 * as a button everywhere. A styled <a> collapses to a text link in several
 * clients, which is exactly what this email was trying to stop being.
 */
function button(href, text) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px">
  <tr><td align="center" bgcolor="${TEAL}" style="border-radius:999px">
    <a href="${esc(href)}" style="display:inline-block;padding:15px 30px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:17px;font-weight:700;color:#0d1b1a;text-decoration:none;border-radius:999px">${esc(text)}</a>
  </td></tr>
</table>`;
}

/**
 * Build the delivery email.
 *
 * Takes everything it needs and reads nothing from the environment, so the
 * whole message can be asserted in a test without a network, a key or a clock.
 *
 * `name` is the buyer's, already capitalised at the store. It opens the message
 * and is allowed to be missing — a greeting is a nicety, and a message that
 * could not be sent because somebody checked out without a name would be a real
 * failure caused by a decorative one.
 *
 * `pending` says the reading has been paid for and not yet computed.
 */
export function deliveryEmail({ tier, name, url, links, pending = false }) {
  const word = tierWord(tier);
  const top = tier >= TIERS.length - 1;
  const greeting = name ? `Hello ${name},` : "Hello,";

  const action = pending
    ? `Create and view your Human Design ${word}`
    : `Access your Human Design ${word}`;

  // The subject says WHAT ARRIVED, because a subject line is how somebody finds
  // this again in a year. "Thank you for your purchase" is a lovely opening and
  // a useless thing to search for.
  const subject = `Your Human Design ${word}`;

  const upgradeLine = top
    ? null
    : `${TIERS[tier + 1]?.label ?? "The next step"} adds ${lowerFirst(TIERS[tier + 1]?.blurb)} ` +
      `The same link has it, and what you have already paid comes off what you pay next — ` +
      `nobody pays twice for the same thing.`;

  const RESOURCES = [
    [
      links.hd101,
      "Human Design, plainly",
      "What the system is, what it is not, and every word in your reading explained.",
    ],
    [
      links.bodygraph,
      "Reading your bodygraph",
      "The picture itself — what the shapes mean, and why some are filled and some are not.",
    ],
  ];

  const text = [
    greeting,
    "",
    "Thank you for your purchase!",
    "",
    `${action}:`,
    url,
    "",
    "Two pieces in the library, free, written for exactly this moment:",
    ...RESOURCES.flatMap(([href, title, blurb]) => [`  ${title} — ${blurb}`, `  ${href}`, ""]),
    ...(upgradeLine ? [upgradeLine, ""] : []),
    ...(pending
      ? []
      : [
          "This link is active for six days, and can be sent to you again whenever you",
          "need it. Your reading is kept for a year.",
          "",
        ]),
    "— The Champagne Method",
    links.home,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${GROUND}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND}">
<tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${PAPER};line-height:1.6">

  <tr><td style="padding:0 0 22px;font-size:19px;font-weight:600;color:${GOLD}">${esc(greeting)}</td></tr>

  <tr><td style="padding:0 0 18px;font-size:19px;color:${PAPER}">Thank you for your purchase!</td></tr>

  <tr><td style="padding:0 0 26px">${button(url, action)}</td></tr>

  <tr><td style="padding:0 0 10px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD}">
    Free in the library
  </td></tr>
  ${RESOURCES.map(
    ([href, title, blurb]) => `<tr><td style="padding:0 0 16px">
    <a href="${esc(href)}" style="font-size:17px;font-weight:700;color:${TEAL};text-decoration:none">${esc(title)}</a>
    <div style="font-size:15px;color:${MUTED};padding-top:2px">${esc(blurb)}</div>
  </td></tr>`,
  ).join("\n  ")}

  ${
    upgradeLine
      ? `<tr><td style="padding:14px 18px;margin:0;background:${PANEL};border-radius:12px;font-size:15px;color:${MUTED}">${esc(upgradeLine)}</td></tr>
  <tr><td style="height:22px"></td></tr>`
      : `<tr><td style="height:8px"></td></tr>`
  }

  ${
    pending
      ? ""
      : `<tr><td style="padding:0 0 22px;font-size:14px;color:${MUTED}">
    This link is active for six days, and can be sent to you again whenever you need it. Your
    reading is kept for a year.
  </td></tr>`
  }

  <tr><td style="border-top:1px solid rgba(201,162,39,0.25);padding:18px 0 0;font-size:15px">
    <a href="${esc(links.home)}" style="color:${GOLD};font-weight:600;text-decoration:none">The Champagne Method</a>
    <div style="font-size:14px;color:${MUTED};padding-top:2px">Coaching, and the rest of the library.</div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
