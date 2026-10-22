import { TIERS, money } from "../../shared/pricing.mjs";
import { sellable } from "../../shared/availability.mjs";
import { emailFooter } from "./emailFooter.mjs";

/**
 * The delivery email, which is a door and not the product.
 *
 * 10/19 (fix 4A): now TWO emails -- a real receipt and one "ready" email --
 * see `deliveryEmail` below. The history that follows explains the parts that
 * stayed (the button, the library links, the subject naming the chart, the
 * six days kept out of the first email).
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

/**
 * THE LAST LINE (Jeremy 10/16): "— Human Design by The Champagne Method", the
 * same words as the sender name, "by" always lowercase. Exported so the test
 * holds the plain-text and HTML endings to it.
 */
export const SIGN_OFF_NAME = "Human Design by The Champagne Method";
export const SIGN_OFF = `— ${SIGN_OFF_NAME}`;

/** "The summary" -> "summary". The label carries an article the sentence supplies. */
function tierWord(tier) {
  const label = TIERS[tier]?.label;
  if (!label) return "reading";
  return label.replace(/^The\s+/i, "").toLowerCase();
}

function lowerFirst(s) {
  return typeof s === "string" && s ? s[0].toLowerCase() + s.slice(1) : "";
}

/** A chart term keeps its capital wherever it stands; anything else after a dash does not. */
const CHART_TERMS = /^(Type|Strategy|Authority|Profile|Definition)\b/;
function afterDash(s) {
  return CHART_TERMS.test(s) ? s : lowerFirst(s);
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

/** "October 17, 2026", in Jeremy's own time zone (the receipt's date). */
export function receiptDate(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}

/** What the ready email lists, per tier: the parts that are now on the page. */
const READY = Object.freeze({
  0: {
    lead: "Your summary is ready.",
    ticks: ["Type, Strategy, Authority and Profile", "Your definition and your centers", "Your channels and activated gates", "Your incarnation cross"],
  },
  1: {
    lead: "Your chart is ready.",
    // The drawing first: it is what the chart adds (10/22); the values come with it.
    ticks: ["Your bodygraph, drawn", "Your chart values, with your channels and activated gates", "A PDF to keep"],
  },
  2: {
    lead: "Your chart and your written reading are ready.",
    ticks: ["Your bodygraph, drawn", "About 1,200 words written to your chart", "Four small things to try", "A PDF to keep"],
  },
});

/**
 * The same, for a chart bought for SOMEONE NEW: their centers, their cross
 * (10/21 live test, bug 16: it said "your" to the buyer).
 */
const READY_THEIR = Object.freeze({
  0: ["Type, Strategy, Authority and Profile", "Their definition and their centers", "Their channels and activated gates", "Their incarnation cross"],
  1: ["Their bodygraph, drawn", "Their chart values, with their channels and activated gates", "A PDF to keep"],
  2: ["Their bodygraph, drawn", "About 1,200 words written to their chart", "Four small things to try", "A PDF to keep"],
});

/**
 * Build the delivery email.
 *
 * Takes everything it needs and reads nothing from the environment, so the
 * whole message can be asserted in a test without a network, a key or a clock.
 *
 * TWO EMAILS, EACH WITH ONE JOB (Jeremy 10/19, fix 4A). The newcomer review
 * found three emails that all opened "Thank you for your purchase!" and looked
 * the same -- they read as duplicates -- and a "receipt" with no amount and no
 * date. Now:
 *
 *   pending   THE RECEIPT, sent when the card clears: what was bought, the
 *             amount, the date, and the next step -- the birth details, about
 *             two minutes -- behind the button "Enter your birth details"
 *             (Jeremy's own words for it).
 *   ready     ONE "READY" EMAIL, when everything is there. On the reading tier
 *             that is when the words are written, so no separate "bodygraph is
 *             drawn" email any more (chart.mjs sends nothing at tier 2).
 *
 * `name` is the buyer's, already capitalised at the store: it opens the
 * message. `chartName` is the name typed for the chart (fix 17A), when there
 * is one: the ready email's subject says whose chart it is. `amountCents` and
 * `paidAt` come from Stripe's own session; either may be missing (a re-send of
 * an older purchase), and the receipt then leaves that row out rather than
 * guessing. `writing` is no longer used (there is no middle email).
 *
 * `someoneNew`: bought from "Start a new chart for someone else". The email
 * still goes to the buyer, but the chart is THEIRS: "Quinn’s summary is
 * ready", "Enter their birth details" (bug 16). With no name typed it is never
 * titled with the buyer's name: "Your Human Design", as any chart with no name.
 * `freshLink`: sent from "Email me this link", and it says so (W7).
 */
export function deliveryEmail({
  tier,
  name,
  chartName = null,
  url,
  links,
  pending = false,
  /**
   * An upgrade whose chart's birth details were carried over (release 2):
   * the next step is a look to confirm them, not a form to fill.
   */
  kept = false,
  amountCents = null,
  paidAt = null,
  footer = "E",
  footerColor,
  someoneNew = false,
  freshLink = false,
}) {
  const their = someoneNew === true;
  const word = tierWord(tier);
  // The footer is a theme (emailFooter.mjs): "E", side by side, Jeremy's pick 10/16.
  const end = emailFooter(footer, links, footerColor ? { coachColor: footerColor } : undefined);
  const top = tier >= TIERS.length - 1;
  // Guest checkout collects no name (Link would have supplied one). "Hello,"
  // on its own reads like a field that failed to fill; this reads as intended.
  const greeting = name ? `Hello ${name},` : "Hello there,";
  const label = TIERS[tier]?.label ?? "The reading";

  /**
   * THE CHART'S NAME IS IN THE SUBJECT, and it is not decoration: every buyer
   * once got the identical subject, Gmail collapsed every purchase into one
   * conversation, and a buyer could follow a link to somebody else's chart.
   * The receipt names the buyer (nothing has been typed for the chart yet);
   * the ready email names the chart.
   */
  const buyerWhose = name ? `${name}’s` : "Your";
  const forChart = chartName || (their ? null : name);
  const chartWhose = forChart ? `${forChart}’s` : "Your";
  /** Whose chart, mid-sentence: "Quinn’s", else "their" or "your". */
  const whoseInline = forChart ? chartWhose : their ? "their" : "your";
  const WhoseLead = forChart ? chartWhose : their ? "Their" : "Your";
  const amount = Number.isInteger(amountCents) && amountCents >= 0 ? money(amountCents) : null;
  const on = receiptDate(paidAt);

  /**
   * A CHART FOR SOMEONE ELSE (Jeremy 10/22, call 5): the receipt still names
   * the BUYER -- it is their purchase, and the name keeps each purchase its own
   * conversation in Gmail (above) -- but no longer reads as the buyer's chart:
   * "Receipt: Emery Testwell, a Human Design chart for someone else, <price>".
   */
  const receiptWhat = their
    ? `${name ? `${name}, a` : "A"} Human Design ${word} for someone else`
    : `${buyerWhose} Human Design ${word}`;
  const subject = pending
    ? `Receipt: ${receiptWhat}${amount ? `, ${amount}` : ""}`
    : freshLink
      ? `A fresh link to ${whoseInline} Human Design ${word}`
      : // A chart for someone else with no name is "Their", never the buyer's "Your" (10/21 rig).
        `${WhoseLead} Human Design ${word} is ready`;

  /**
   * AND AN INVITATION TO SAY IF IT DOES NOT MAKE SENSE. His note, and it costs
   * one line: somebody who has just been handed a page of Human Design
   * vocabulary is exactly the person who will not write in unasked.
   */
  const askLine = `If anything here is unclear, ${links.contact} reaches Jeremy directly.`;

  const RESOURCES = [
    [
      links.hd101,
      "The Human Design library",
      // What this buyer has, not a reading they may not have (W3, 10/21).
      `Every part of a chart, one layer at a time, and every word in ${their ? "their" : "your"} ${word} explained.`,
    ],
    [
      links.bodygraph,
      "Reading your bodygraph",
      // "colored in", the one word for it everywhere (fix 18A, 10/19).
      "The picture itself — what the shapes mean, and why some are colored in and some are not.",
    ],
  ];
  // Not "While you wait": on a receipt there is nothing to wait for, the next step is the buyer's (W5).
  const resourcesHead = "Free in the library";

  /**
   * WHAT ELSE THERE IS, on the ready email only, and only for a tier that can
   * actually be bought (readingHandler, sellable()). "CONTAINS", NOT "ADDS".
   * Never on the receipt: somebody who has not yet seen what they bought is not
   * sold the next thing.
   */
  const upgradeLine =
    pending || top || !sellable(tier + 1)
      ? null
      : `${TIERS[tier + 1]?.label ?? "The next step"} contains ${lowerFirst(TIERS[tier + 1]?.[their ? "theirBlurb" : "blurb"])} ` +
        `It is offered on the page above, and what you have already paid comes off the price ` +
        `there — nobody pays twice for the same thing.`;

  /** "Your reading is kept for a year..." -- once there is something to come back to. */
  const keptLine =
    `${their ? WhoseLead : "Your"} ${word} is kept for a year. This link works for 6 days; open it after that and it ` +
    "sends you a fresh one, as often as you need.";

  const own = READY[tier] ?? READY[2];
  const ready = {
    lead: freshLink
      ? `Here is the fresh link you asked for — ${whoseInline} ${word}.`
      : their
        ? own.lead.replace(/^Your chart and your/, `${WhoseLead} chart and`).replace(/^Your/, WhoseLead)
        : own.lead,
    ticks: their ? (READY_THEIR[tier] ?? READY_THEIR[2]) : own.ticks,
  };
  const receiptRows = [
    ["What", `Human Design: ${label.toLowerCase()}`],
    ...(amount !== null ? [["Amount paid", amount]] : []),
    ...(on ? [["Date", on]] : []),
    [amountCents === 0 ? "Paid through" : "Paid by card through", "Stripe"],
  ];
  const nextHead = kept ? "Next, one look" : "Next, about 2 minutes";
  const nextLine = kept
    ? "Your birth details are kept from your chart, so there is nothing to type — only a look, " +
      "to be sure they are right."
    : their
      ? "Their birth date, time and place. Their chart is made from them, and the time can be left " +
        "out if it isn’t known."
      : "Your birth date, time and place. Your chart is made from them, and the time can be left " +
        "out if you don’t know it.";
  const action = pending
    ? kept
      ? "Confirm your birth details"
      : their
        ? "Enter their birth details"
        : "Enter your birth details"
    : their
      ? `Open ${whoseInline} ${top ? "reading" : word}`
      : top
        ? "Open your reading"
        : `Open your ${word}`;

  const text = [
    greeting,
    "",
    ...(pending
      ? [
          "Thank you. Your payment went through, and here is your receipt.",
          "",
          "RECEIPT",
          ...receiptRows.map(([k, v]) => `  ${k}: ${v}`),
          "",
          nextHead.toUpperCase(),
          nextLine,
          "",
          `${action}:`,
          url,
          "",
        ]
      : [ready.lead, "", "On one page:", ...ready.ticks.map((t) => `  ✓ ${t}`), "", `${action}:`, url, "", keptLine, ""]),
    `${resourcesHead.toUpperCase()}:`,
    ...RESOURCES.flatMap(([href, title, blurb]) => [`  ${title} — ${blurb}`, `  ${href}`, ""]),
    ...(upgradeLine ? ["IF YOU WOULD LIKE MORE", "", upgradeLine, ""] : []),
    askLine,
    "",
    // The sign-off is the HD brand, as the sender is (Jeremy 10/16): "by" is
    // always lowercase. The plain-text alternative is a real body, not a
    // courtesy copy: text-only clients and screen readers render it.
    ...end.text,
  ].join("\n");

  const row = (html, pad = "0 0 18px", extra = "") => `<tr><td style="padding:${pad};${extra}">${html}</td></tr>`;
  const small = `font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD}`;
  const body = pending
    ? [
        row(esc("Thank you. Your payment went through, and here is your receipt."), "0 0 18px", `font-size:19px;color:${PAPER}`),
        row(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PANEL};border-radius:12px">
    <tr><td colspan="2" style="padding:12px 18px 4px;${small}">Receipt</td></tr>
    ${receiptRows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:5px 0 5px 18px;font-size:14px;color:${MUTED};width:42%">${esc(k)}</td><td style="padding:5px 18px 5px 0;font-size:16px;color:${PAPER};font-weight:600">${esc(v)}</td></tr>`,
      )
      .join("\n    ")}
    <tr><td colspan="2" style="height:8px"></td></tr>
  </table>`,
          "0 0 22px",
        ),
        row(`<div style="${small};padding-bottom:6px">${esc(nextHead)}</div>
    <div style="font-size:17px;color:${PAPER}">${esc(nextLine)}</div>`, "0 0 16px"),
        row(button(url, action), "0 0 24px"),
      ]
    : [
        row(esc(ready.lead), "0 0 18px", `font-size:19px;color:${PAPER}`),
        row(
          `<div style="font-size:15px;color:${MUTED};padding-bottom:6px">On one page:</div>
    <div style="font-size:16px;color:${PAPER};line-height:1.9">${ready.ticks.map((t) => `&#10003; ${esc(t)}`).join("<br>")}</div>`,
          "0 0 20px",
        ),
        row(button(url, action), "0 0 22px"),
        row(esc(keptLine), "0 0 18px", `font-size:14px;color:${MUTED}`),
      ];

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${GROUND}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND}">
<tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${PAPER};line-height:1.6">

  ${row(esc(greeting), "0 0 18px", `font-size:19px;font-weight:600;color:${GOLD}`)}
  ${body.join("\n  ")}

  ${row(esc(resourcesHead), "0 0 10px", small)}
  ${RESOURCES.map(
    ([href, title, blurb]) => `<tr><td style="padding:0 0 16px">
    <a href="${esc(href)}" style="font-size:17px;font-weight:700;color:${TEAL};text-decoration:none">${esc(title)}</a>
    <div style="font-size:15px;color:${MUTED};padding-top:2px">${esc(blurb)}</div>
  </td></tr>`,
  ).join("\n  ")}

  ${
    upgradeLine
      ? `<tr><td style="padding:0 0 10px;${small}">If you would like more</td></tr>
  <tr><td style="padding:14px 18px;margin:0;background:${PANEL};border-radius:12px;font-size:15px;color:${MUTED}">${esc(upgradeLine)}</td></tr>
  <tr><td style="height:22px"></td></tr>`
      : `<tr><td style="height:8px"></td></tr>`
  }

  <!-- The address is a mailto link (link audit, 10/16): one tap opens a reply. -->
  <tr><td style="padding:0 0 22px;font-size:14px;color:${MUTED}">If anything here is unclear,
    <a href="mailto:${esc(links.contact)}" style="color:${TEAL};text-decoration:underline">${esc(links.contact)}</a>
    reaches Jeremy directly.</td></tr>

  ${end.html}

</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
