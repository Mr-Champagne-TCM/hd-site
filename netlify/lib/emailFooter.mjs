import { SHOP } from "../../shared/libraryLinks.mjs";
import { HD_NAME, BUSINESS_NAME, HD_LINE, COACH_LINE, COACH_COLOR } from "../../shared/footerTheme.mjs";
import { HINT, hintAttrs } from "../../shared/linkHints.mjs";

// The words and the lavender live in shared/footerTheme.mjs (10/17), so the shop
// pages carry exactly what the email does. Re-exported for the tests and callers.
export { HD_NAME, BUSINESS_NAME, HD_LINE, COACH_COLOR };

/**
 * THE EMAIL FOOTER AS A THEME (Jeremy 10/16: "mock both coaching site link and
 * hd site link texts I may want both... we are creating a theme").
 *
 * One footer, written once, chosen by a letter, so the same ending can later
 * go on the resend email, the reading-ready email and the alerts without being
 * re-typed into each. PICKED 10/16 (mock v2): "E", the two names side by
 * side with C1's words ("Coaching, if you'd like to go further."), coaching
 * title in colour 4, lavender. "A" stays for comparison and tests.
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
 *   E   Jeremy's pick from mock v1 (10/16): "C with 'if you'd like to go
 *       further' AND i like the side by side. Bring those 2 together." D2's
 *       columns carrying C1's words, the business name in its own colour
 *       (not white: "i dont like the white(ish)") -- `coachColor`, mock v2.
 *
 * "by" is always lowercase. Gold stays on the HD name only (gold is sparing).
 */


/**
 * Option E's two columns, a theme's worth of parts the readings site reuses.
 * Each column is the name, then one line under it.
 */
export const COLUMNS = (links, coachColor = COACH_COLOR) => [
  { href: links.shop ?? SHOP, name: HD_NAME, line: HD_LINE, color: "#c9a227", hint: HINT.readings },
  { href: links.home, name: BUSINESS_NAME, line: COACHING_LINES[1], color: coachColor, hint: HINT.home },
];

/** "#3fe0c5" -> "rgba(63,224,197,0.55)" for the thin bar beside each column. */
const tint = (hex, a) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
};

/** The two proposed lines under the business name (option C). */
export const COACHING_LINES = {
  1: COACH_LINE,
  2: "Coaching, whenever you’d like to talk it through.",
};

export const FOOTER_OPTIONS = ["A", "B", "C1", "C2", "D1", "D2", "E"];

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
  `<a href="${esc(href)}" style="color:${GOLD};font-weight:600;text-decoration:none"${hintAttrs(HD_NAME, HINT.readings)}>${esc(HD_NAME)}</a>`;
const bizLink = (href) =>
  `<a href="${esc(href)}" style="color:${PAPER};font-weight:600;text-decoration:none"${hintAttrs(BUSINESS_NAME, HINT.home)}>${esc(BUSINESS_NAME)}</a>`;
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
    still has in a week; the readings page is not. Putting the link only on the
    page they bought from makes it unfindable at exactly the moment somebody
    wonders what was kept.
  -->
  <tr><td style="padding:10px 0 0;font-size:13px;color:${MUTED}">
    <a href="${esc(links.privacy)}" style="color:${MUTED};text-decoration:underline"${hintAttrs("What I keep, and for how long", HINT.privacy)}>What I keep, and for how long</a>
  </td></tr>`;
}

/**
 * The footer for one option: `html` is table rows for the email's inner table,
 * `text` is the plain-text ending as lines (the sign-off down to the policy).
 *
 * Every link in the HTML is in the text too: the plain-text body is what
 * text-only clients and screen readers get.
 */
export function emailFooter(option = "A", links, { coachColor = COACH_COLOR } = {}) {
  const shop = links.shop ?? SHOP;
  const home = links.home;
  const privacyText = `What I keep, and for how long: ${links.privacy}`;

  switch (option) {
    case "E": {
      /*
        SIDE BY SIDE ON A COMPUTER, STACKED ON A PHONE, WITH NO MEDIA QUERY.
        Two inline blocks of at most 268px fit beside each other in the 544px
        column and fall one under the other on anything narrower -- the only
        responsive trick that Gmail, Apple Mail and Outlook.com all honour.
        Outlook for Windows ignores max-width, so it gets a two-cell table in
        conditional comments. font-size:0 on the cell removes the gap a space
        between two inline blocks would leave.
      */
      const cols = COLUMNS(links, coachColor);
      const block = ({ href, name, line, color, hint }) =>
        `<div style="display:inline-block;vertical-align:top;width:100%;max-width:268px;font-size:15px">
      <div style="border-left:2px solid ${tint(color, 0.55)};padding:0 14px 0 12px;margin:0 0 14px">
        <a href="${esc(href)}" style="color:${color};font-weight:600;text-decoration:none"${hintAttrs(name, hint)}>${esc(name)}</a>
        ${under(line)}
      </div>
    </div>`;
      return {
        html: `<tr><td style="border-top:1px solid rgba(201,162,39,0.25);padding:18px 0 0;font-size:0">
    <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="50%" valign="top"><![endif]-->
    ${block(cols[0])}
    <!--[if mso]></td><td width="50%" valign="top"><![endif]-->
    ${block(cols[1])}
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>

  ${privacyRow(links).replace("padding:10px 0 0", "padding:0")}`,
        text: [
          `— ${HD_NAME}`, HD_LINE, shop, "",
          BUSINESS_NAME, COACHING_LINES[1], home, "",
          privacyText,
        ],
      };
    }

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
