import { TIERS } from "../../shared/pricing.mjs";
import { sellable } from "../../shared/availability.mjs";

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
 * THREE STAGES, NOT TWO, and the third is the reading tier's.
 *
 *   pending          paid for, nothing computed. The link opens a FORM.
 *   writing          the chart is drawn; the words are still being written.
 *   neither          it is all there.
 *
 * The middle one exists because the reading tier gained a real gap: generation
 * runs on a background function and takes tens of seconds, so a buyer gets
 * their chart first and their words a minute later. Without this stage, both
 * emails said "Access your Human Design reading" -- two identical messages, the
 * first of them promising words that had not been written. A buyer who opened
 * that one and found a chart would be right to think something had gone wrong.
 */
export function deliveryEmail({ tier, name, url, links, pending = false, writing = false }) {
  const word = tierWord(tier);
  const top = tier >= TIERS.length - 1;
  // Guest checkout collects no name (Link would have supplied one). "Hello,"
  // on its own reads like a field that failed to fill; this reads as intended.
  const greeting = name ? `Hello ${name},` : "Hello there,";

  const action = pending
    ? `Create and view your Human Design ${word}`
    : writing
      ? "See your bodygraph now"
      : `Access your Human Design ${word}`;

  /**
   * THE SUBJECT SAYS WHAT ARRIVED, because a subject line is how somebody finds
   * this again in a year. "Thank you for your purchase" is a lovely opening and
   * a useless thing to search for.
   *
   * And the two reading-tier emails must not share one. An inbox showing the
   * same subject twice reads as a duplicate send, so the second gets deleted --
   * and the second is the one with the reading in it.
   */
  /**
   * THE CHART'S NAME IS IN THE SUBJECT, and it is not decoration.
   *
   * Every buyer got the identical subject, so Gmail collapsed EVERY PURCHASE
   * INTO ONE CONVERSATION -- one thread in Jeremy's inbox holds six messages
   * from six different purchases. He counted four emails and reasonably
   * suspected duplicates; they were four correct emails wearing one hat.
   *
   * The count was never the hazard. The hazard is that a buyer opens "their"
   * thread, lands on the message Gmail chose to show, and follows a link to
   * SOMEBODY ELSE'S CHART. He hit exactly that: went looking for his summary
   * and arrived at a reading. And it is not a rare case -- one address buying
   * for a partner or a friend is the case the whole credit rule was written
   * around.
   *
   * A name threads correctly, stays searchable a year later, and matches the
   * heading on the page the link opens. Nameless purchases keep the old
   * wording, which is still better than nothing and still unique enough when
   * there is only one of them.
   */
  const whose = name ? `${name}’s` : "Your";
  const subject = writing
    ? `${whose} bodygraph is ready, the reading is being written`
    : pending
      ? `${whose} Human Design ${word}`
      : `${whose} Human Design ${word} is ready`;

  /**
   * WHAT THEY BOUGHT, AND THEN -- SEPARATELY -- WHAT ELSE THERE IS.
   *
   * Jeremy read the summary email and found it describing the CHART: "not tier
   * 0 content relevant. Should only say what they just bought - don't get their
   * hopes up, but DO offer upgrade to get more." One paragraph was doing both
   * jobs, so the tier they had just paid for was never named at all and the one
   * they had not was described in detail.
   *
   * Two blocks now, with a heading between them. The first says what is behind
   * the link; the second is plainly an offer.
   *
   * "CONTAINS", NOT "ADDS" -- "adds" describes a delta somebody has to compute
   * against what they are holding.
   *
   * AND NOT "the same link has it". Same link as what? He asked, which is the
   * whole answer. It names the page instead.
   */
  //
  // NO CASE SURGERY. The first attempt read "The summary is type, Strategy,
  // Authority..." -- lowerFirst does not know a blurb opens with a list of
  // proper nouns. A dash needs no such knowledge.
  const bought = `${TIERS[tier]?.label ?? "What you bought"} — ${TIERS[tier]?.blurb ?? ""}`;

  // Not for a tier that cannot be bought yet -- see readingHandler. An email is
  // the one surface nobody can correct after the fact.
  const upgradeLine = top || !sellable(tier + 1)
    ? null
    : `${TIERS[tier + 1]?.label ?? "The next step"} contains ${lowerFirst(TIERS[tier + 1]?.blurb)} ` +
      `It is offered on the page above, and what you have already paid comes off the price ` +
      `there — nobody pays twice for the same thing.`;

  /**
   * AND AN INVITATION TO SAY IF IT DOES NOT MAKE SENSE. His note, and it costs
   * one line: somebody who has just been handed a page of Human Design
   * vocabulary is exactly the person who will not write in unasked.
   */
  const askLine = `If anything here is unclear, ${links.contact} reaches Jeremy directly.`;

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
    bought,
    "",
    "RESOURCES — free in the library, written for exactly this moment:",
    ...RESOURCES.flatMap(([href, title, blurb]) => [`  ${title} — ${blurb}`, `  ${href}`, ""]),
    ...(upgradeLine ? ["IF YOU WOULD LIKE MORE", "", upgradeLine, ""] : []),
    askLine,
    "",
    ...(pending
      ? []
      : [
          "Your reading is kept for a year. This particular link rests after six days —",
          "open it then and it offers you a fresh one, as many times as you need.",
          "",
        ]),
    "— The Champagne Method",
    links.home,
    "",
    // The plain-text alternative is a real body, not a courtesy copy: it is what
    // text-only clients and screen readers render. A link present in the HTML and
    // absent here is a link half the recipients do not have.
    `What we keep, and for how long: ${links.privacy}`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${GROUND}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND}">
<tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${PAPER};line-height:1.6">

  <tr><td style="padding:0 0 22px;font-size:19px;font-weight:600;color:${GOLD}">${esc(greeting)}</td></tr>

  <tr><td style="padding:0 0 18px;font-size:19px;color:${PAPER}">Thank you for your purchase!</td></tr>

  <tr><td style="padding:0 0 20px">${button(url, action)}</td></tr>

  <tr><td style="padding:0 0 26px;font-size:15px;color:${MUTED}">${esc(bought)}</td></tr>

  <tr><td style="padding:0 0 10px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD}">
    Resources &mdash; free in the library
  </td></tr>
  ${RESOURCES.map(
    ([href, title, blurb]) => `<tr><td style="padding:0 0 16px">
    <a href="${esc(href)}" style="font-size:17px;font-weight:700;color:${TEAL};text-decoration:none">${esc(title)}</a>
    <div style="font-size:15px;color:${MUTED};padding-top:2px">${esc(blurb)}</div>
  </td></tr>`,
  ).join("\n  ")}

  ${
    upgradeLine
      ? `<tr><td style="padding:0 0 10px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD}">If you would like more</td></tr>
  <tr><td style="padding:14px 18px;margin:0;background:${PANEL};border-radius:12px;font-size:15px;color:${MUTED}">${esc(upgradeLine)}</td></tr>
  <tr><td style="height:22px"></td></tr>`
      : `<tr><td style="height:8px"></td></tr>`
  }

  ${
    pending
      ? ""
      : `<tr><td style="padding:0 0 22px;font-size:14px;color:${MUTED}">
    Your reading is kept for a year. This particular link rests after six days &mdash; open it then
    and it offers you a fresh one, as many times as you need.
  </td></tr>`
  }

  <tr><td style="padding:0 0 22px;font-size:14px;color:${MUTED}">${esc(askLine)}</td></tr>

  <tr><td style="border-top:1px solid rgba(201,162,39,0.25);padding:18px 0 0;font-size:15px">
    <a href="${esc(links.home)}" style="color:${GOLD};font-weight:600;text-decoration:none">The Champagne Method</a>
    <div style="font-size:14px;color:${MUTED};padding-top:2px">Coaching, and the rest of the library.</div>
  </td></tr>

  <!--
    THE POLICY TRAVELS WITH THE THING IT DESCRIBES. This email is what a buyer
    still has in a week; the shop page is not. Putting the link only on the
    page they bought from makes it unfindable at exactly the moment somebody
    wonders what was kept.
  -->
  <tr><td style="padding:10px 0 0;font-size:13px;color:${MUTED}">
    <a href="${esc(links.privacy)}" style="color:${MUTED};text-decoration:underline">What we keep, and for how long</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
