/**
 * OLDER PURCHASES, as the older code stored them: no `person` (so they load as
 * `legacy`), no birth kept, no name -- the records a buyer who has been around
 * since before 16 October has in their inbox. Written straight into the local
 * store and the per-email index, for "Email me my charts" to meet.
 *
 * The outputs and words are the live shop's own (fixtures in the data home);
 * the stored text is rebuilt with the site's renderer from the parsed view.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { formFromWritten } from "./fakeGemini.mjs";
import { REPO } from "./paths.mjs";

const lib = (f) => import(pathToFileURL(join(REPO, "netlify", "lib", f)).href);

function textFromWritten(written, I) {
  const out = [I.SUMMARY_MARKER, ""];
  for (const k of I.SUMMARY_KEYS) out.push(`${I.SUMMARY_LABELS[k] ?? k}: ${written.summary?.[k] ?? ""}`);
  for (const s of written.sections ?? []) {
    out.push("", s.heading, "");
    if (s.lede) out.push(s.lede, "");
    for (const p of s.paragraphs ?? []) out.push(p, "");
  }
  out.push(I.DISCLAIMER);
  return out.join("\n");
}

export async function seedLegacy({ combos, fixturesDir, email }) {
  const { getStore } = await import("@netlify/blobs");
  const { renderReading } = await lib("structured.mjs");
  const I = await lib("interpretation.mjs");
  const { addToIndex, INDEX_STORE } = await lib("charts.mjs");
  const readings = getStore({ name: "readings", consistency: "strong" });
  const index = getStore({ name: INDEX_STORE, consistency: "strong" });
  const seeded = [];
  const all = existsSync(join(fixturesDir, "all-readings.json")) ? JSON.parse(readFileSync(join(fixturesDir, "all-readings.json"), "utf8")) : [];
  const picks = (combos.legacy?.fromAllReadings ?? []).map((i) => all[i]).filter(Boolean);
  const older = combos.legacy?.olderCopyOf && existsSync(join(fixturesDir, combos.legacy.olderCopyOf))
    ? JSON.parse(readFileSync(join(fixturesDir, combos.legacy.olderCopyOf), "utf8"))
    : null;
  if (older) picks.push({ ...older, purchasedAt: 1791900000 });
  const now = Math.floor(Date.now() / 1000);
  for (const [i, r] of picks.entries()) {
    const id = randomBytes(16).toString("hex");
    let reading;
    if (r.tier >= 2 && r.written) {
      const built = renderReading(formFromWritten(r.written), r.output);
      reading = built.text ?? textFromWritten(r.written, I);
    }
    // Before 10/16 a purchase was dated some weeks back; spread them out.
    const at = Math.min(r.purchasedAt ?? now - 40 * 86400, 1792000000) - i * 3600;
    const record = {
      v: 1,
      tier: r.tier,
      output: r.output,
      buyer: { name: null, email, phone: null },
      sku: ["hd_summary", "hd_chart", "hd_reading"][r.tier],
      purchasedAt: at,
      createdAt: at,
      filledAt: at + 60,
      ...(reading ? { reading, writtenAt: at + 120 } : {}),
    };
    await readings.setJSON(id, record);
    // The index was backfilled from the store on first use (charts.mjs
    // ensureIndexed); adding them here is the same end state.
    await addToIndex(index, { email, id, person: id, tier: r.tier, at }, process.env.GRANT_SECRET);
    seeded.push({ id, tier: r.tier, type: r.output?.type, at });
  }
  // Live, the one-time backfill has long since run.
  await index.setJSON("_backfilled", { at: now, added: 0 });
  return seeded;
}
