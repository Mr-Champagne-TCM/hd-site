import { getStore } from "@netlify/blobs";
import { loadReading, readReadingLink } from "../lib/reading.mjs";
import { readingPdf } from "../lib/readingPdf.mjs";
import { SITE } from "../lib/siteLinks.mjs";

/**
 * GET /api/pdf?t=<token> — the chart tier's downloadable PDF.
 *
 * A GET with the token in the QUERY, which every other endpoint here
 * deliberately avoids. The reason is that this one has to be a navigation: a
 * browser downloads what it navigates to, and a POST cannot be a download
 * without building a blob in the page and handing it to a synthetic anchor —
 * more moving parts, and it breaks on a phone.
 *
 * What that costs is a token in an access log and in browser history, which is
 * the exact objection that put the reading endpoint on POST. It is accepted
 * HERE and nowhere else, because the alternative is worse for the person who
 * paid, and because the token is already in the address bar of the page that
 * links to it.
 *
 * THE TIER IS CHECKED, and it is checked against the SIGNED payload rather than
 * against anything asked for. A summary buyer following a hand-edited URL gets
 * the same 404 as a stranger.
 */
export default async (request) => {
  if (request.method !== "GET") {
    return json(405, { error: { code: "method", message: "Use GET." } });
  }

  const secret = process.env.GRANT_SECRET;
  if (!secret) {
    console.log("GET /api/pdf -> 503 (GRANT_SECRET is not set)");
    return json(503, { error: { code: "misconfigured", message: "Briefly unavailable." } });
  }

  const token = new URL(request.url).searchParams.get("t");
  const link = readReadingLink(token, secret, Date.now());
  if (!link.ok) {
    // Expiry is worth naming, because it is the one failure a person can act
    // on -- the page it came from offers a fresh link. Everything else is one
    // answer, so a forged signature cannot be told from a reading that is not
    // there.
    const expired = link.reason === "expired";
    console.log(`GET /api/pdf -> ${expired ? 410 : 404} (${link.reason})`);
    return json(expired ? 410 : 404, {
      error: {
        code: expired ? "link_expired" : "not_found",
        message: expired
          ? "This link has expired — they last six days. Your reading is kept for a year, so it can be sent to you again."
          : "That link could not be opened.",
      },
    });
  }

  /**
   * THE PDF IS THE CHART TIER AND ABOVE. The summary tier was never sold one —
   * its own description offers the values and nothing else — so this is a
   * refusal rather than an omission, and it is made here rather than by hiding
   * a button.
   */
  if (link.tier < 1) {
    console.log("GET /api/pdf -> 404 (tier 0 has no pdf)");
    return json(404, { error: { code: "not_found", message: "That link could not be opened." } });
  }

  const store = getStore({ name: "readings", consistency: "strong" });
  const reading = await loadReading(store, link.id, Date.now());
  if (!reading || reading.tier !== link.tier) {
    console.log("GET /api/pdf -> 404 (no reading, or tier mismatch)");
    return json(404, { error: { code: "not_found", message: "That link could not be opened." } });
  }
  if (reading.pending) {
    return json(409, {
      error: {
        code: "not_ready",
        message: "Your birth details have not been entered yet, so there is nothing to draw.",
      },
    });
  }

  let bytes;
  try {
    bytes = await readingPdf({
      tier: reading.tier,
      name: reading.buyer?.name ?? null,
      output: reading.output,
      links: SITE,
      /**
       * THE WRITTEN INTERPRETATION. Forgotten when the reading tier's pages
       * were built, and the failure was silent in the worst way: `readingPdf`
       * treats a missing reading as "there isn't one yet" and quietly builds
       * the two-page chart document. So a reading-tier buyer downloaded a
       * chart-tier PDF that opened perfectly and was simply not what they paid
       * for. Jeremy found it by reading his own download.
       *
       * There is a test that a tier-2 call with text produces seven pages. It
       * passed throughout, because it called `readingPdf` directly -- the thing
       * nothing tested was the ONE LINE that hands the text over.
       */
      reading: reading.reading ?? null,
    });
  } catch (e) {
    console.log(`GET /api/pdf -> 500 (${e.message})`);
    return json(500, {
      error: {
        code: "pdf_failed",
        message: "That could not be made just now. Your reading is safe — trying again usually works.",
      },
    });
  }

  console.log(`GET /api/pdf -> 200 (tier ${reading.tier}, ${bytes.length} bytes)`);

  /**
   * The filename is the buyer's name, because a downloads folder full of
   * `reading.pdf` is a folder nobody can find anything in. Reduced to plain
   * characters: a filename crosses filesystems, and one that arrives broken on
   * Windows is worse than one that is plain everywhere.
   */
  const safe = (reading.buyer?.name ?? "Human Design")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  /**
   * A LENGTH, AND A PLAIN BYTE ARRAY.
   *
   * Reported from a phone: "the pdf download was mangled. Couldn't open." The
   * bytes are not the problem -- the same build produces a valid document at
   * every tier, checked from the deploy artefact. A download that arrives
   * incomplete looks exactly like this, and without a Content-Length nothing
   * between here and the phone can tell that it did.
   *
   * So the length is declared, which lets the browser refuse a short read
   * instead of saving one, and the body is a Uint8Array rather than a Node
   * Buffer -- a Buffer is a Node type being handed to a Web Response, and the
   * runtime is free to treat it as either.
   */
  const body = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `attachment; filename="${safe || "Human-Design"}-Human-Design.pdf"`,
      // A reading is private and the link is a bearer token. Nothing in between
      // may keep this.
      "Cache-Control": "no-store, private",
    },
  });
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
  });
}

export const config = { path: "/api/pdf" };
