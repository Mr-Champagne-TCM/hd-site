import { getStore } from "@netlify/blobs";
import { handlePdf } from "../lib/pdfHandler.mjs";
import { alertSender, guard, noteFailure } from "../lib/failures.mjs";
import { messagePage, messageResponse } from "../lib/messagePage.mjs";
import { readingPdf } from "../lib/readingPdf.mjs";
import { PDF_STORE, deployId } from "../lib/pdfStore.mjs";
import { SITE } from "../lib/siteLinks.mjs";
import { buyerNameFor } from "../../shared/chartName.mjs";

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
const health = () => getStore({ name: "health", consistency: "strong" });

export default guard(
  "pdf",
  async (request, context) => {
    if (request.method !== "GET") {
      return json(405, { error: { code: "method", message: "Use GET." } });
    }

    /**
     * Everything that can fail lives in ../lib/pdfHandler.mjs (10/16), where a
     * test makes each failure happen. What comes back is either the finished
     * bytes or a calm page -- never a raw JSON body in a browser tab.
     */
    const token = new URL(request.url).searchParams.get("t");
    const result = await handlePdf({
      token,
      secret: process.env.GRANT_SECRET,
      store: getStore({ name: "readings", consistency: "strong" }),
      build: readingPdf,
      // The copy written ahead (10/26, lib/pdfStore.mjs): handed over when kept, else built and kept.
      pdfs: getStore({ name: PDF_STORE, consistency: "strong" }),
      deploy: deployId(context),
      links: SITE,
      accept: request.headers.get("accept") ?? "",
      note: (kind, { detail, ref } = {}) =>
        noteFailure(health(), kind, { detail, ref, send: alertSender(process.env.RESEND_API_KEY), site: process.env.URL }),
    });
    if (!result.bytes) {
      console.log(`GET /api/pdf -> ${result.status}`);
      return new Response(result.body, { status: result.status, headers: result.headers });
    }
    const { reading, bytes } = result;

    console.log(`GET /api/pdf -> 200 (tier ${reading.tier}, ${bytes.length} bytes, ${result.kept ? "kept copy" : "built now"})`);

    /**
     * The filename is the chart's name, because a downloads folder full of
     * `reading.pdf` is a folder nobody can find anything in. Reduced to plain
     * characters: a filename crosses filesystems, and one that arrives broken on
     * Windows is worse than one that is plain everywhere. With no name (and on a
     * chart for someone else, never the buyer's) it is the title's own words,
     * "Your-Human-Design.pdf" -- it was "Human-Design-Human-Design.pdf".
     */
    const safe = (reading.birth?.name ?? buyerNameFor(reading) ?? "")
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
        "Content-Disposition": `attachment; filename="${safe || "Your"}-Human-Design.pdf"`,
        // A reading is private and the link is a bearer token. Nothing in between
        // may keep this.
        "Cache-Control": "no-store, private",
      },
    });
  },
  {
    health,
    // Even the net answers this navigation with a page, not with JSON.
    page: (e, status) => messageResponse(status, messagePage({ heading: e.heading, message: e.message })),
  },
);

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
  });
}

export const config = { path: "/api/pdf" };
