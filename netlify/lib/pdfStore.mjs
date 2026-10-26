import { readingPdf, pdfPageCount } from "./readingPdf.mjs";
import { buyerNameFor } from "../../shared/chartName.mjs";
import { SHOP } from "../../shared/libraryLinks.mjs";
import { mintAddTimeKey } from "./addTime.mjs";

/**
 * EVERY PDF WRITTEN AHEAD, AND KEPT (10/26, Jeremy: "figure out how to write them without failing/lagging").
 *
 * A 10-page reading's PDF took 26-31 s to build on Netlify on 10/25 (past the ~26 s the edge waits, so the
 * download failed), and the reading page built the WHOLE PDF too, only to say "PDF, 10 pages". The fonts fix
 * (pdfText.mjs useFont) brought a build to 5-10 s; this takes the build out of the buyer's way altogether:
 *
 *   - the PDF is built ONCE, in the background, as soon as the chart is cast or the reading written
 *     (functions/pdf-warm.mjs, rung by chart.mjs and add-time.mjs; interpret.mjs builds it right after it
 *     writes), and kept here with its page count;
 *   - the download (pdfHandler.mjs) hands over the kept copy; only when there is none yet does it build,
 *     exactly as before, and keep what it built;
 *   - the reading page (readingHandler.mjs `pdfPages`) only ever READS the kept count. With none yet it
 *     says "PDF" and rings the builder; it never builds on the request again.
 *
 * ONE SET OF INPUTS (`pdfArgs`) for the download, the kept copy and the count -- until 10/26 the page counted
 * a PDF built without the add-time link and the gift lines, so the two could disagree.
 *
 * WHICH COPY: the record as it is now (`filledAt`, `writtenAt`: a corrected or re-timed chart, a rewritten
 * reading is a new copy) under this deploy's code (`build`, the deploy id): a release that changes the layout
 * never serves a PDF the old code drew. The copies of a record's earlier versions are deleted when a new one
 * is kept. The bytes are the reading the record already holds, in the same Netlify store's account, kept for
 * the record's own year: when a record is deleted, `dropPdfs` deletes its copies with it.
 */
export const PDF_STORE = "pdfs";
/** A builder that has not finished in this long has stopped; another may start. */
const WARM_LOCK_MS = 3 * 60_000;

/** This deploy's id (Netlify's function context), so a release never serves a PDF the old code drew. */
export function deployId(context) {
  return context?.deploy?.id || globalThis.Netlify?.context?.deploy?.id || process.env.DEPLOY_ID || "dev";
}

/**
 * Rings functions/pdf-warm.mjs for record `id` (the trigger token opens it, as the writer's door). Answered at
 * once (202); the build happens there. Never throws: a missed ring is built on the first download instead.
 */
export async function ringPdf({ origin, token, header, id, fetchImpl = fetch }) {
  if (!origin || !token || !id) return false;
  try {
    const res = await fetchImpl(`${origin}/api/pdf-warm`, {
      method: "POST",
      headers: { [header]: token, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.status === 202 || res.ok;
  } catch {
    return false;
  }
}

/** Everything a PDF is built from (as pdfHandler.mjs always built it). `id`: the record the add-time key opens. */
export function pdfArgs(reading, id, secret, links) {
  return {
    tier: reading.tier,
    // The name typed for the chart (fix 17A), else the buyer's, as the page shows.
    name: reading.birth?.name ?? buyerNameFor(reading),
    output: reading.output,
    links,
    // THE WRITTEN INTERPRETATION -- forgotten once, and a reading-tier buyer downloaded a chart-tier PDF.
    reading: reading.reading ?? null,
    // THE BIRTH LINE under the name (Jeremy 10/16).
    birth: reading.birth ?? null,
    // Where "add it here" opens: the PDF's own never-expiring key for this chart (addTime.mjs), not the
    // six-day reading link -- a PDF is kept far longer than six days.
    addTimeUrl: secret ? `${SHOP}t/${mintAddTimeKey(id, secret)}` : null,
    // Bought for someone else: page 3 speaks to the person it is for too (decision 30).
    gift: reading.fresh === true,
  };
}

/** Whether this record has a PDF to make now: chart tier and up, cast, and on the reading tier written. */
export function pdfReady(reading) {
  return Boolean(
    reading && reading.tier >= 1 && !reading.pending && reading.output && (reading.tier < 2 || typeof reading.reading === "string"),
  );
}

/** The kept copy's name: this record as it is now, drawn by this deploy's code. */
export function pdfKey(id, reading, build) {
  const v = `${Number(reading?.filledAt) || 0}-${Number(reading?.writtenAt) || 0}-${String(build || "dev").replace(/[^A-Za-z0-9]/g, "")}`;
  return `${id}/${v}`;
}

/** The kept page count, or null (none kept, or the store did not answer: the page then says "PDF"). */
export async function keptPages(pdfs, key) {
  try {
    const meta = await pdfs.get(`pages/${key}`, { type: "json" });
    return Number.isInteger(meta?.pages) && meta.pages > 0 ? meta.pages : null;
  } catch {
    return null;
  }
}

/** The kept bytes and page count, or null. */
export async function keptPdf(pdfs, key) {
  try {
    const data = await pdfs.get(`pdf/${key}`, { type: "arrayBuffer" });
    if (!data || !data.byteLength) return null;
    return { bytes: new Uint8Array(data), pages: await keptPages(pdfs, key) };
  } catch {
    return null;
  }
}

/** Keeps a built PDF and its count, and drops the record's earlier copies. Never throws: keeping is a nicety. */
export async function keepPdf(pdfs, key, bytes) {
  let pages = null;
  try {
    pages = pdfPageCount(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)) || null;
  } catch {
    /* counted next time */
  }
  try {
    await pdfs.set(`pdf/${key}`, bytes);
    if (pages) await pdfs.setJSON(`pages/${key}`, { pages, at: Date.now() });
    const id = key.split("/")[0];
    for (const kind of ["pdf", "pages", "lock"]) {
      const { blobs = [] } = (await pdfs.list({ prefix: `${kind}/${id}/` })) ?? {};
      for (const b of blobs) if (b.key !== `${kind}/${key}`) await pdfs.delete(b.key);
    }
  } catch {
    /* the next request builds it again */
  }
  return pages;
}

/** Deletes every kept copy of a record (with the record itself: its year is up, or it was asked for). */
export async function dropPdfs(pdfs, id) {
  for (const kind of ["pdf", "pages", "lock"]) {
    const { blobs = [] } = (await pdfs.list({ prefix: `${kind}/${id}/` })) ?? {};
    for (const b of blobs) await pdfs.delete(b.key);
  }
}

/**
 * Builds and keeps the PDF of record `id` (the current record of its chain, `current` from loadCurrent),
 * unless a copy is kept already or another builder holds it. Returns { pages, built }.
 */
export async function warmPdf({ pdfs, current, secret, links, build, now = Date.now(), make = readingPdf }) {
  const reading = current?.reading;
  if (!pdfReady(reading)) return { pages: null, built: false, why: "not ready" };
  const key = pdfKey(current.id, reading, build);
  const have = await keptPages(pdfs, key);
  if (have) return { pages: have, built: false, why: "kept" };
  try {
    const lock = await pdfs.get(`lock/${key}`, { type: "json" });
    if (lock && Number(lock.until) > now) return { pages: null, built: false, why: "another builder" };
    await pdfs.setJSON(`lock/${key}`, { until: now + WARM_LOCK_MS });
  } catch {
    /* no lock is no harm: two builders keep the same bytes */
  }
  const bytes = await make(pdfArgs(reading, current.id, secret, links));
  const pages = await keepPdf(pdfs, key, bytes);
  return { pages, built: true };
}
