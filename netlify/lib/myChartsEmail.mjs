import { TIERS, money } from "../../shared/pricing.mjs";
import { emailFooter } from "./emailFooter.mjs";
import { firstName } from "../../shared/chartName.mjs";
import { sayDate } from "../../shared/correctionNote.mjs";

/**
 * THE "EMAIL ME MY CHARTS" EMAIL (release 2, Jeremy 10/20), two ways:
 *
 *   charts   one card per PERSON'S chart (an upgraded chart once, at the
 *            tier it has now), each with a fresh link; and a link to start a
 *            new chart ("also in response with list of charts, should still
 *            have link to start new one").
 *   none     "There are none under this email", a link BACK to the Email me
 *            my charts page ("a link back to the place we send them would be
 *            nice"), and the same link to start a new chart.
 *
 * Never "the shop" (Jeremy 10/20: "don't refer to my page as the shop. that
 * is internal only"): his page is "Human Design readings".
 *
 * The same look as the delivery email (deliveryEmail.mjs): its colours, its
 * Outlook-proof button, its footer (theme "E"). Nothing read from the
 * environment, so a test can hold every word.
 */

const GOLD = "#c9a227";
const TEAL = "#3fe0c5";
const PAPER = "#e9e4f2";
const MUTED = "#b4a8ce";
const GROUND = "#1a1040";
const PANEL = "#241a4e";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function button(href, text, { small = false } = {}) {
  const pad = small ? "11px 24px" : "15px 30px";
  const size = small ? "16px" : "17px";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0">
  <tr><td align="center" bgcolor="${TEAL}" style="border-radius:999px">
    <a href="${esc(href)}" style="display:inline-block;padding:${pad};font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:${size};font-weight:700;color:#0d1b1a;text-decoration:none;border-radius:999px">${esc(text)}</a>
  </td></tr>
</table>`;
}

/** "summary" / "chart" / "reading". */
const word = (tier) => (TIERS[tier]?.label ?? "The chart").replace(/^The\s+/i, "").toLowerCase();

/** One chart, as the email names it: whose, what, and when and where (no time). */
export function chartCard(reading) {
  const whose = reading.birth?.name ?? (firstName(reading.buyer?.name) || null);
  const title = whose ? `${whose}’s ${word(reading.tier)}` : `Your ${word(reading.tier)}`;
  const label = TIERS[reading.tier]?.label ?? "The chart";
  const when = sayDate(reading.birth?.date);
  const where = reading.birth?.place ?? null;
  const line = reading.pending
    ? reading.birth
      ? `${label} · paid, birth details waiting to be confirmed`
      : `${label} · paid, birth details not entered yet`
    : [label, when, where].filter(Boolean).join(" · ");
  const action = reading.pending ? (reading.birth ? "Confirm the birth details" : "Enter the birth details") : "Open";
  return { title, line, action };
}

export function myChartsEmail({ charts = [], links, origin }) {
  const end = emailFooter("E", links);
  const none = charts.length === 0;
  const askPage = `${origin}/charts/`;
  const startNew = `${origin}/#ways-in`;
  const prices = TIERS.map((t) => money(t.cents));
  const startLine =
    `A chart for someone new — or a new one for you — starts fresh: ${prices[0]}, ${prices[1]} or ${prices[2]}.`;

  const subject = none ? "Your Human Design charts: none under this email" : "Your Human Design charts, with fresh links";
  const cards = charts.map(({ reading, url }) => ({ ...chartCard(reading), url }));

  const lead = none
    ? [
        "Someone asked Human Design readings for the charts bought with this email. There are none under it.",
        "If you bought with a different email, that one can be typed on the Email me my charts page, and the links go there.",
      ]
    : [`You asked for your charts. Here is a fresh link to ${cards.length === 1 ? "the one" : "each one"} bought with this email:`];
  const keep = none
    ? "Did not ask? Nothing to do — nothing was shown to anyone."
    : "Did not ask for this? Nothing to do — these links only ever come to this inbox.";
  const fresh =
    "Each link is new and works for 6 days. Open it after that and it sends you a fresh one, or ask again on the Email me my charts page.";
  const askLine = `If anything here is unclear, ${links.contact} reaches Jeremy directly.`;

  const text = [
    "Hello,",
    "",
    ...lead.flatMap((l) => [l, ""]),
    ...(none
      ? [`Email me my charts:`, askPage, ""]
      : cards.flatMap((c) => [`${c.title} — ${c.line}`, `${c.action}: ${c.url}`, ""]).concat([fresh, `Email me my charts: ${askPage}`, ""])),
    "START A NEW CHART",
    startLine,
    `Start a new chart: ${startNew}`,
    "",
    keep,
    "",
    askLine,
    "",
    ...end.text,
  ].join("\n");

  const row = (html, pad = "0 0 18px", extra = "") => `<tr><td style="padding:${pad};${extra}">${html}</td></tr>`;
  const small = `font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD}`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${GROUND}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND}">
<tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${PAPER};line-height:1.6">

  ${row("Hello,", "0 0 18px", `font-size:19px;font-weight:600;color:${GOLD}`)}
  ${lead.map((l) => row(esc(l), "0 0 16px", `font-size:17px;color:${PAPER}`)).join("\n  ")}
  ${
    none
      ? row(button(askPage, "Email me my charts"), "0 0 26px")
      : cards
          .map(
            (c) => `<tr><td style="padding:0 0 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PANEL};border-radius:12px">
      <tr><td style="padding:14px 18px 2px;font-size:17px;font-weight:700;color:${PAPER}">${esc(c.title)}</td></tr>
      <tr><td style="padding:0 18px 10px;font-size:15px;color:${MUTED}">${esc(c.line)}</td></tr>
      <tr><td style="padding:0 18px 16px">${button(c.url, c.action, { small: true })}</td></tr>
    </table>
  </td></tr>`,
          )
          .join("\n  ") +
        `\n  ${row(`${esc(fresh.replace(/ or ask again on the Email me my charts page\.$/, ""))} or ask again on the <a href="${esc(askPage)}" style="color:${TEAL};text-decoration:underline">Email me my charts</a> page.`, "4px 0 22px", `font-size:15px;color:${MUTED}`)}`
  }

  ${row("Start a new chart", "0 0 6px", small)}
  ${row(esc(startLine), "0 0 10px", `font-size:16px;color:${PAPER}`)}
  ${row(`<a href="${esc(startNew)}" style="font-size:17px;font-weight:700;color:${TEAL};text-decoration:underline">Start a new chart</a>`, "0 0 24px")}

  ${row(esc(keep), "0 0 14px", `font-size:15px;color:${MUTED}`)}
  <tr><td style="padding:0 0 22px;font-size:14px;color:${MUTED}">If anything here is unclear,
    <a href="mailto:${esc(links.contact)}" style="color:${TEAL};text-decoration:underline">${esc(links.contact)}</a>
    reaches Jeremy directly.</td></tr>

  ${end.html}

</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
