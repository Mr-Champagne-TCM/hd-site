import { getStore } from "@netlify/blobs";
import { loadCurrent } from "../lib/reading.mjs";
import { TRIGGER_HEADER, triggerOk } from "../lib/trigger.mjs";
import { PDF_STORE, deployId, warmPdf } from "../lib/pdfStore.mjs";
import { SITE } from "../lib/siteLinks.mjs";

/**
 * POST /api/pdf-warm {id} -- BUILD A RECORD'S PDF AHEAD, AND KEEP IT (10/26, Jeremy: "figure out how to write
 * them without failing/lagging"; lib/pdfStore.mjs).
 *
 * A background function: answered at once, then up to fifteen minutes to build -- so a PDF that takes ten
 * seconds on a cold Lambda takes them here, not on a buyer's download. Rung by chart.mjs and add-time.mjs when
 * a chart is cast, and by the reading page when it finds no kept copy; interpret.mjs builds right after it
 * writes. Opened only by the trigger token (lib/trigger.mjs), like the writer: the work is harmless to repeat,
 * but it is not the public's to start.
 */
export default async (request, context) => {
  const secret = process.env.GRANT_SECRET;
  if (!triggerOk(request.headers.get(TRIGGER_HEADER), secret)) {
    console.log("pdf-warm: refused (bad or missing trigger)");
    return new Response(null, { status: 404 });
  }
  let id = null;
  try {
    const body = await request.json();
    if (body && typeof body.id === "string" && body.id) id = body.id;
  } catch {
    /* no body: nothing to build */
  }
  if (!id) return new Response(null, { status: 204 });
  try {
    const current = await loadCurrent(getStore({ name: "readings", consistency: "strong" }), id, Date.now());
    const t0 = Date.now();
    const out = await warmPdf({
      pdfs: getStore({ name: PDF_STORE, consistency: "strong" }),
      current,
      secret,
      links: SITE,
      build: deployId(context),
    });
    // Status and timing only: never the id, never a name.
    console.log(`pdf-warm: ${out.built ? `built ${out.pages ?? "?"} pages in ${Date.now() - t0} ms` : `nothing to do (${out.why})`}`);
  } catch (e) {
    console.log(`pdf-warm: failed (${e?.name ?? "Error"}); the first download builds it instead`);
  }
  return new Response(null, { status: 204 });
};

export const config = { background: true, path: "/api/pdf-warm" };
