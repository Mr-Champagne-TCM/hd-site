import { SHOP } from "../../shared/libraryLinks.mjs";

/**
 * THE EMAIL FOOTER AS A THEME (Jeremy 10/16: "mock both coaching site link and
 * hd site link texts I may want both... we are creating a theme").
 *
 * One footer, written once, chosen by a letter, so the same ending can later
 * go on the resend email, the reading-ready email and the alerts without being
 * re-typed into each. MOCK STAGE: the delivery email still defaults to "A",
 * which is the footer exactly as it is today, so nothing a buyer receives has
 * changed until Jeremy picks one.
 *
 * WHERE EACH NAME POINTS follows the PDF, which he has already accepted
 * (10/16 03:20): the HD brand line opens the SHOP, the business line opens the
 * coaching home.
 *
 *   "Human Design by The Champagne Method"        -> the shop
 *   "The Champagne Method Coaching and Consulting" -> thechampagnemethod.co
 *
 * The library is not repeated here on purpose: the email already links it
 * twice, in its Resources block.
 *
 *   A   now: the HD name, linked to the coaching home, one line under it
 *   B   HD only: the HD name -> shop, one line under it
 *   C1  both, stacked, coaching line wording 1
 *   C2  both, stacked, coaching line wording 2
 *   D1  both, one line each, no lines under them
 *   D2  both, side by side
 *
 * "by" is always lowercase. Gold stays on the HD name only (gold is sparing);
 * the business name is paper-white, one step quieter.
 */

export const HD_NAME = "Human Design by The Champagne Method";
export const BUSINESS_NAME = "The Champagne Method Coaching and Consulting";

/** The line under the HD name when it opens the shop. */
export const HD_LINE = "Charts and readings, for you or someone close to you.";

/** The two proposed lines under the business name (option C). */
export const COACHING_LINES = {
  1: "Coaching, if you’d like to go further.",
  2: "Coaching, whenever you’d like to talk it through.",
};

export const FOOTER_OPTIONS = ["A", "B", "C1", "C2", "D1", "D2"];

const GOLD = "#c9a227";
const PAPER = "#e9e4f2";
const MUTED = "#b4a8ce";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const RULE = "border-top:1px solid rgba(201,162,39,0.25);padding:18px 0 0;font-size:15px";

const hdLink = (href) =>
  `<a href="${esc(href)}" style="color:${GOLD};font-weight:600;text-decoration:none">${esc(HD_NAME)}</a>`;
const bizLink = (href) =>
  `<a href="${esc(href)}" style="color:${PAPER};font-weight:600;text-decoration:none">${esc(BUSINESS_NAME)}</a>`;
const under = (words) => `<div style="font-size:14px;color:${MUTED};padding-top:2px">${esc(words)}</div>`;

/**
 * The privacy line, the same under every option.
 *
 * THE POLICY TRAVELS WITH THE THING IT DESCRIBES. This email is what a buyer
 * still has in a week; the shop page is not.
 */
function privacyRow(links) {
  return `<!--
    THE POLICY TRAVELS WITH THE THING IT DESCRIBES. This email is what a buyer
    still has in a week; the shop page is not. Putting the link only on the
    page they bought from makes it unfindable at exactly the moment somebody
    wonders what was kept.
  -->
  <tr><td style="padding:10px 0 0;font-size:13px;color:${MUTED}">
    <a href="${esc(links.privacy)}" style="color:${MUTED};text-decoration:underline">What we keep, and for how long</a>
  </td></tr>`;
}

/**
 * The footer for one option: `html` is table rows for the email's inner table,
 * `text` is the plain-text ending as lines (the sign-off down to the policy).
 *
 * Every link in the HTML is in the text too: the plain-text body is what
 * text-only clients and screen readers get.
 */
export function emailFooter(option = "A", links) {
  const shop = links.shop ?? SHOP;
  const home = links.home;
  const privacyText = `What we keep, and for how long: ${links.privacy}`;

  switch (option) {
    case "B":
      return {
        html: `<tr><td style="${RULE}">
    ${hdLink(shop)}
    ${under(HD_LINE)}
  </td></tr>

  ${privacyRow(links)}`,
        text: [`— ${HD_NAME}`, HD_LINE, shop, "", privacyText],
      };

    case "C1":
    case "C2": {
      const line = COACHING_LINES[option === "C1" ? 1 : 2];
      return {
        html: `<tr><td style="${RULE}">
    ${hdLink(shop)}
    ${under(HD_LINE)}
  </td></tr>

  <tr><td style="padding:14px 0 0;font-size:15px">
    ${bizLink(home)}
    ${under(line)}
  </td></tr>

  ${privacyRow(links)}`,
        text: [`— ${HD_NAME}`, HD_LINE, shop, "", BUSINESS_NAME, line, home, "", privacyText],
      };
    }

    case "D1":
      return {
        html: `<tr><td style="${RULE}">
    ${hdLink(shop)}
    <div style="padding-top:6px">${bizLink(home)}</div>
  </td></tr>

  ${privacyRow(links)}`,
        text: [`— ${HD_NAME}`, shop, BUSINESS_NAME, home, "", privacyText],
      };

    case "D2":
      // Two cells, not floats: a table cell is the only column every client keeps.
      return {
        html: `<tr><td style="${RULE}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="50%" valign="top" style="padding:0 12px 0 0;font-size:15px">
          ${hdLink(shop)}
          ${under("Charts and readings")}
        </td>
        <td width="50%" valign="top" style="padding:0 0 0 12px;font-size:15px;border-left:1px solid rgba(201,162,39,0.25)">
          ${bizLink(home)}
          ${under("Coaching")}
        </td>
      </tr>
    </table>
  </td></tr>

  ${privacyRow(links)}`,
        text: [`— ${HD_NAME}`, shop, BUSINESS_NAME, home, "", privacyText],
      };

    case "A":
    default:
      // Today's footer, byte for byte.
      return {
        html: `<tr><td style="${RULE}">
    <a href="${esc(home)}" style="color:${GOLD};font-weight:600;text-decoration:none">${esc(HD_NAME)}</a>
    <div style="font-size:14px;color:${MUTED};padding-top:2px">Coaching, and the rest of the library.</div>
  </td></tr>

  ${privacyRow(links)}`,
        text: [`— ${HD_NAME}`, home, "", privacyText],
      };
  }
}
