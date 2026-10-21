import { TIERS } from "../../shared/pricing.mjs";
import { emailFooter } from "./emailFooter.mjs";
import { GOLD, MUTED, PAPER, GROUND, PANEL, button, esc, receiptDate } from "./deliveryEmail.mjs";

/**
 * THE "UPDATED PDF" NOTE (Jeremy 10/21): "send out updated PDFs to all ready
 * customers as an offer ... I have updated the interpretation PDF layout.
 * Easier to read and more accurate! ... Thank them for their purchase."
 *
 * One email per buyer, sent once, by tools/pdf-update-offer.mjs (dry run by
 * default). Same look, same footer (E) and same sender as the delivery email,
 * so it reads as from the same place.
 *
 * WHAT IT MAY CLAIM, and why "more accurate" is not in it. The PDF is rebuilt
 * on demand from the STORED chart. Records written before 16 October 2026
 * keep no birth details, so their chart cannot be cast again on engine 0.5.0:
 * the chart in the new PDF is exactly the chart they bought. "Easier to read"
 * is true (new pages, plainer words, library links); "more accurate" would not
 * be, for any buyer this was written for. The email says so plainly instead:
 * same chart, same words, new pages.
 *
 * Two wordings for Jeremy to choose from: "A" calm, "B" a little more playful.
 * Voice rules as everywhere: thanks and invitations, never instructions.
 */

export const OPTIONS = ["A", "B"];

/** What is new in the PDF, per tier -- only what that tier's PDF really has. */
export const WHATS_NEW = Object.freeze({
  1: [
    "A larger bodygraph drawing on page 1",
    "Plain words where Human Design jargon stood (“When it’s on track” for Signature)",
    "A closing page with where to go from here, and the free Human Design library one tap away",
  ],
  2: [
    "“Start here” pages: your centers, channels and profile, a line each, before the reading",
    "The reading now opens with how you decide",
    "Chart words link straight to their page in the free Human Design library",
    "Plain words where Human Design jargon stood (“When it’s on track” for Signature)",
  ],
});

/** "The reading" -> "reading". */
const tierWord = (tier) => (TIERS[tier]?.label ?? "The reading").replace(/^The\s+/i, "").toLowerCase();

/** "September 2026" -> "in September" (the purchase month, Jeremy's time zone). */
function monthOf(ms) {
  const d = receiptDate(ms);
  return d ? d.split(" ")[0] : null;
}

/** Bought in the first ten days the readings were on sale (live 2026-08-29). */
export const FIRST_DAYS_END_MS = Date.parse("2026-09-09T05:00:00Z");

/**
 * Build the note. Reads nothing from the environment, so a test can assert
 * the whole message.
 *
 *   tier         1 (chart) or 2 (reading); a summary has no PDF and gets none
 *   name         the buyer's name as stored, or null ("Hello there,")
 *   pdfUrl       a fresh signed /api/pdf?t= link
 *   pageUrl      the same token's /r/ page
 *   purchasedAt  ms, for "your reading in September"
 *   option       "A" | "B"
 */
export function updateOfferEmail({ tier, name, pdfUrl, pageUrl, purchasedAt, links, option = "A", signOff = "Respectfully," }) {
  if (tier !== 1 && tier !== 2) throw new Error(`updateOfferEmail: no PDF at tier ${tier}`);
  if (!OPTIONS.includes(option)) throw new Error(`updateOfferEmail: option ${option}`);
  const word = tierWord(tier);
  const month = monthOf(purchasedAt);
  const when = month ? ` in ${month}` : "";
  const early = Number.isFinite(purchasedAt) && purchasedAt < FIRST_DAYS_END_MS;
  const greeting = name ? `Hello ${name},` : "Hello there,";
  const whose = name ? `${name}, your` : "Your";
  const end = emailFooter("E", links);

  const subject =
    option === "A"
      ? `${whose} Human Design PDF has a new layout`
      : "Same chart, easier on the eyes";

  const opening =
    option === "A"
      ? [
          `Thank you again for your Human Design ${word}${when}.`,
          "I have updated the layout of the interpretation PDF, and yours is ready in the new design. It is easier to read:",
        ]
      : [
          "Your chart hasn’t changed a bit. The pages around it have.",
          (early
            ? `You were one of the very first people to buy a Human Design ${word} from me, and I am grateful. Thank you.`
            : `Thank you again for your Human Design ${word}${when}.`) +
            " I have reworked the interpretation PDF so it reads more like a guide and less like a printout:",
        ];

  const ticks = WHATS_NEW[tier];
  const same =
    tier === 2
      ? "Your chart is exactly the one you had, and every word of your reading is as it was written. Only the pages are new."
      : "Your chart is exactly the one you had. Only the pages are new.";
  const action = "Open your updated PDF";
  const nothing = "Nothing is needed from you. It is yours to keep, with my thanks.";
  const linkLine =
    // The delivery email's own words for the six days (approved copy).
    "This link works for 6 days; open it after that and it sends you a fresh one, as often as you need.";

  const text = [
    greeting,
    "",
    ...opening.flatMap((p) => [p, ""]).slice(0, -1),
    ...ticks.map((t) => `  ✓ ${t}`),
    "",
    same,
    "",
    `${action}:`,
    pdfUrl,
    "",
    `Your reading page: ${pageUrl}`,
    "",
    nothing,
    linkLine,
    "",
    signOff,
    "Jeremy",
    "",
    ...end.text,
  ].join("\n");

  const row = (html, pad = "0 0 18px", extra = "") => `<tr><td style="padding:${pad};${extra}">${html}</td></tr>`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${GROUND}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND}">
<tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${PAPER};line-height:1.6">

  ${row(esc(greeting), "0 0 18px", `font-size:19px;font-weight:600;color:${GOLD}`)}
  ${opening.map((p, i) => row(esc(p), "0 0 14px", `font-size:${i === 0 ? 19 : 17}px;color:${PAPER}`)).join("\n  ")}
  ${row(`<div style="font-size:16px;color:${PAPER};line-height:1.8">${ticks.map((t) => `&#10003; ${esc(t)}`).join("<br>")}</div>`, "4px 18px 14px", `background:${PANEL};border-radius:12px`)}
  <tr><td style="height:14px"></td></tr>
  ${row(esc(same), "0 0 20px", `font-size:16px;color:${PAPER}`)}
  ${row(button(pdfUrl, action), "0 0 10px")}
  ${row(`<a href="${esc(pageUrl)}" style="color:${MUTED};text-decoration:underline">Your reading page</a>`, "0 0 20px", "font-size:14px")}
  ${row(esc(nothing), "0 0 8px", `font-size:16px;color:${PAPER}`)}
  ${row(esc(linkLine), "0 0 22px", `font-size:14px;color:${MUTED}`)}
  ${row(`${esc(signOff)}<br>Jeremy`, "0 0 26px", `font-size:17px;color:${PAPER}`)}

  ${end.html}

</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
