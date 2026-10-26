import { CONTACT } from "../../shared/customerMessages.mjs";
import { footerColumns, PRIVACY_LABEL } from "../../shared/footerTheme.mjs";
import { HINT, hintAttrs } from "../../shared/linkHints.mjs";
import { SITE } from "./siteLinks.mjs";

/**
 * A SHORT PAGE IN THE SHOP'S OWN CLOTHES, for an answer a browser shows as a
 * page rather than one the app reads.
 *
 * Made for /api/pdf (10/16). The download is a plain link, so a failure there
 * used to arrive as a raw JSON body in a browser tab --
 * `{"error":{"code":"pdf_failed","message":...}}` -- which is exactly the
 * "error that looks like an error" Jeremy asked to be rid of. Now it is the
 * same calm sentence the app would show, in the site's colours and type, with
 * a way back to the reading.
 *
 * `back` is a same-site path (the reading page); `backLabel` names it.
 */
/** The way back's label: "Back to your reading" opens your reading; "/" is the readings' front page. */
const backHint = (back, label) => (back === "/" ? HINT.readings : `Opens ${label.replace(/^Back to /, "")}`);

export function messagePage({ heading, message, back = null, backLabel = "Back to your reading" }) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  // The readings address becomes a mailto link wherever a sentence names it.
  const body = esc(message).split(CONTACT).join(`<a href="mailto:${CONTACT}"${hintAttrs(CONTACT, HINT.mail)}>${CONTACT}</a>`);
  const safeBack = typeof back === "string" && back.startsWith("/") && !back.startsWith("//") ? back : null;
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(heading || "Human Design readings")} — The Champagne Method</title>
<link rel="preload" href="/fonts/outfit-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;font-family:Outfit,system-ui,-apple-system,sans-serif;color:#F3EFF7;
       background:linear-gradient(170deg,#0b1428,#1a1040 55%,#2d1155);background-attachment:fixed}
  main{max-width:36rem;margin:0 auto;padding:4rem 1.5rem}
  .mark{font-size:.68rem;letter-spacing:.19em;color:#B4A8CE;font-weight:500;margin:0 0 1.75rem}
  h1{font-family:Fraunces,Georgia,serif;font-weight:500;color:#E8CBA0;font-size:clamp(1.6rem,4vw,2rem);line-height:1.18;margin:0 0 1.25rem}
  .panel{border:1px solid rgba(232,203,160,.4);background:rgba(232,203,160,.08);border-radius:.75rem;
         padding:.85rem 1rem;font-size:15px;line-height:1.65;margin:0}
  a{color:#3FE0C5;text-decoration:underline;text-decoration-color:rgba(63,224,197,.4);text-underline-offset:4px}
  .back{display:inline-block;margin-top:1.75rem;border:1px solid rgba(63,224,197,.5);border-radius:999px;
        padding:.6rem 1.25rem;text-decoration:none;font-size:15px}
  .tf{display:flex;flex-wrap:wrap;gap:1.1rem 2rem;margin:3.5rem 0 0;padding-top:1.75rem;border-top:1px solid rgba(232,203,160,.15)}
  .tf div{flex:1 1 14rem;border-left:2px solid;padding:0 0 0 .75rem}
  .tf a{font-weight:500;font-size:16px;line-height:1.4;text-decoration:none}
  .tf p{font-size:15px;line-height:1.6;color:#B4A8CE;margin:.25rem 0 0}
  .pv{margin:1.25rem 0 0;font-size:14px}
  .pv a{color:#B4A8CE;text-decoration-color:rgba(180,168,206,.4)}
</style>
<main>
  <p class="mark">HUMAN DESIGN by THE CHAMPAGNE METHOD COACHING AND CONSULTING</p>
  <h1>${esc(heading || "Nothing is lost")}</h1>
  <p class="panel">${body}</p>
  ${safeBack ? `<a class="back" href="${esc(safeBack)}"${hintAttrs(backLabel, backHint(safeBack, backLabel))}>${esc(backLabel)}</a>` : ""}
  ${pageEnd()}
</main>
</html>`;
}

export function messageResponse(status, page) {
  return new Response(page, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex",
    },
  });
}

/**
 * THE FOOTER THEME (Jeremy 10/17), as on every other page a buyer sees: the HD
 * name in this page's gold to the shop, the business name in lavender to the
 * coaching home, side by side and stacked on a phone, then the privacy line.
 * Words from shared/footerTheme.mjs, the file the email reads too.
 */
export function pageEnd() {
  const tint = (hex) => {
    const h = hex.replace("#", "");
    return `rgba(${[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",")},0.55)`;
  };
  const cols = footerColumns("#E8CBA0")
    .map((c) => `<div style="border-color:${tint(c.color)}"><a href="${c.href}" style="color:${c.color}"${hintAttrs(c.name, c.hint)}>${c.name}</a><p>${c.line}</p></div>`)
    .join("\n    ");
  return `<footer class="tf">
    ${cols}
  </footer>
  <p class="pv"><a href="${SITE.privacy}"${hintAttrs(PRIVACY_LABEL, HINT.privacy)}>${PRIVACY_LABEL}</a></p>`;
}
