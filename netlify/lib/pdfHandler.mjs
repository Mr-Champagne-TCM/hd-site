import { loadCurrent, readReadingLink } from "./reading.mjs";
import { customerError } from "./failures.mjs";
import { buyerNameFor } from "../../shared/chartName.mjs";
import { messagePage } from "./messagePage.mjs";
import { SHOP } from "../../shared/libraryLinks.mjs";

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
 */
export async function handlePdf({ token, secret, store, build, links, accept = "", now = Date.now(), note = async () => {} }) {
  const wantsJson = /application\/json/.test(accept) && !/text\/html/.test(accept);
  const back = typeof token === "string" && token ? `/r/${encodeURIComponent(token)}` : null;

  const fail = async (kind, detail, ref) => {
    try {
      await note(kind, { detail, ...(ref ? { ref } : {}) });
    } catch {
      /* the person waiting on a download is not failed by the record */
    }
    const { status, payload } = customerError(kind);
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
      body: messagePage({ heading: e.heading, message: e.message, back: e.key === "reading-link-bad" ? null : back }),
    };
  };

  if (!secret) return fail("pdf-misconfigured", "GRANT_SECRET is not set");

  const link = readReadingLink(token, secret, now);
  if (!link.ok) {
    // Expiry is worth naming, because it is the one failure a person can act
    // on -- the reading page offers a fresh link. Everything else is one
    // answer, so a forged signature cannot be told from a reading not there.
    if (link.reason === "expired") return fail("pdf-link-expired", "link expired");
    return fail("pdf-link-bad", `link ${link.reason ?? "bad"}`);
  }

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

  /**
   * THE PDF IS THE CHART TIER AND ABOVE. The summary tier was never sold one,
   * so this is a refusal rather than an omission -- unless a summary link has
   * since grown into a chart, which then has one.
   */
  if (reading.tier < 1) return fail("pdf-link-bad", "tier 0 has no pdf");
  if (reading.pending) return fail("pdf-not-ready", `tier ${reading.tier}`);

  let bytes;
  try {
    bytes = await build({
      tier: reading.tier,
      // The name typed for the chart (fix 17A), else the buyer's, as the page shows.
      name: reading.birth?.name ?? buyerNameFor(reading),
      output: reading.output,
      links,
      // THE WRITTEN INTERPRETATION -- forgotten once, and a reading-tier buyer
      // downloaded a chart-tier PDF. pdfEndpoint.test.mjs watches this line.
      reading: reading.reading ?? null,
      // THE BIRTH LINE under the name (Jeremy 10/16).
      birth: reading.birth ?? null,
      // Where "add it here" opens: this link's own page, its time box (#add-time; the time-only form is still to be built).
      addTimeUrl: `${SHOP}r/${encodeURIComponent(token)}#add-time`,
    });
  } catch (e) {
    console.log(`GET /api/pdf -> 500 (${e?.message})`);
    return fail("pdf-build-failed", `tier ${reading.tier}: ${e?.name ?? "Error"}`, { reading: link.id, tier: link.tier });
  }

  return { status: 200, reading, bytes };
}
