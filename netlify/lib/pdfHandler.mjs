import { loadCurrent, readReadingLink } from "./reading.mjs";
import { customerError } from "./failures.mjs";
import { forTier } from "../../shared/customerMessages.mjs";
import { messagePage } from "./messagePage.mjs";
import { keepPdf, keptPdf, pdfArgs, pdfKey } from "./pdfStore.mjs";

/**
 * GET /api/pdf, with the store, the builder and the clock passed in, so every
 * way it can fail is made to happen in a test (10/16).
 *
 * Returns `{ status, headers, body }`. A failure answers in HTML when the
 * request is a page navigation -- which the download button always is -- so a
 * buyer never sees a raw JSON body in a browser tab. A caller that asks only
 * for JSON still gets JSON.
 *
 * `note(kind, { detail })` files the failure at its severity (failures.mjs).
 *
 * `pdfs` + `deploy` (10/26, pdfStore.mjs): the kept copy of this record's PDF is handed over when there is
 * one; otherwise it is built here, as it always was, and kept for next time. Without `pdfs` (the tests that
 * pass a builder) it builds every time.
 */
export async function handlePdf({ token, secret, store, build, links, accept = "", now = Date.now(), note = async () => {}, pdfs = null, deploy = null }) {
  const wantsJson = /application\/json/.test(accept) && !/text\/html/.test(accept);
  const back = typeof token === "string" && token ? `/r/${encodeURIComponent(token)}` : null;

  // The tier, once known, names the way back: a chart's PDF goes back to the chart (10/22).
  let tier = null;
  const fail = async (kind, detail, ref, opts) => {
    try {
      await note(kind, { detail, ...(ref ? { ref } : {}) });
    } catch {
      /* the person waiting on a download is not failed by the record */
    }
    const { status, payload } = customerError(kind, opts);
    if (wantsJson) {
      return {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
        body: JSON.stringify(payload),
      };
    }
    const e = payload.error;
    return {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex" },
      // An unreadable link offers no way back -- there is nothing to go back to.
      body: messagePage({
        heading: e.heading,
        message: e.message,
        back: e.key === "reading-link-bad" ? null : back,
        ...(tier === 1 ? { backLabel: "Back to your chart" } : {}),
      }),
    };
  };

  if (!secret) return fail("pdf-misconfigured", "GRANT_SECRET is not set");

  const link = readReadingLink(token, secret, now);
  if (!link.ok) {
    // Expiry is worth naming, because it is the one failure a person can act
    // on -- the reading page offers a fresh link. Everything else is one
    // answer, so a forged signature cannot be told from a reading not there.
    tier = link.tier ?? null;
    if (link.reason === "expired") return fail("pdf-link-expired", "link expired", undefined, { customer: forTier("pdf-link-expired", link.tier) });
    return fail("pdf-link-bad", `link ${link.reason ?? "bad"}`);
  }
  tier = link.tier;

  let reading;
  let current;
  try {
    // An old link whose chart has grown downloads the GROWN chart (release 2).
    current = await loadCurrent(store, link.id, now, { strict: true });
  } catch (e) {
    return fail("pdf-store-unavailable", `load failed (${e?.name ?? "Error"})`, { reading: link.id, tier: link.tier });
  }
  // The link's tier must be the tier of the record it was signed for.
  if (!current || current.first.tier !== link.tier) return fail("pdf-link-bad", "no reading, or tier mismatch");
  reading = current.reading;
  tier = reading.tier;

  /**
   * THE PDF IS THE CHART TIER AND ABOVE. The summary tier was never sold one,
   * so this is a refusal rather than an omission -- unless a summary link has
   * since grown into a chart, which then has one.
   */
  if (reading.tier < 1) return fail("pdf-link-bad", "tier 0 has no pdf");
  if (reading.pending) return fail("pdf-not-ready", `tier ${reading.tier}`);

  // The kept copy, written ahead (pdfStore.mjs): no build on the request.
  const key = pdfs ? pdfKey(current.id, reading, deploy) : null;
  if (pdfs) {
    const kept = await keptPdf(pdfs, key);
    if (kept) return { status: 200, reading, bytes: kept.bytes, kept: true };
  }

  let bytes;
  try {
    // The inputs (reading, birth line, add-time key, gift) are pdfStore.mjs pdfArgs, shared with the kept copy.
    bytes = await build(pdfArgs(reading, current.id, secret, links));
  } catch (e) {
    console.log(`GET /api/pdf -> 500 (${e?.message})`);
    return fail("pdf-build-failed", `tier ${reading.tier}: ${e?.name ?? "Error"}`, { reading: link.id, tier: link.tier });
  }
  if (pdfs) await keepPdf(pdfs, key, bytes);

  return { status: 200, reading, bytes };
}
