/**
 * HAS THIS PERSON'S CHART CHANGED SINCE LAST TIME?
 *
 * Birth details are never stored -- they are used to compute a chart and thrown
 * away -- so an upgrade asks for them again. Jeremy walked that path and named
 * the hazard himself:
 *
 *   "if we don't save birth details, and they enter a different birth dataset,
 *    they will get a different reading silently... they may need to correct
 *    birth data from an error last time OR they learned their birth time since
 *    the first entry... and if we do that we HAVE to be impeccable, bc doing
 *    this in error will lose client confidence greatly."
 *
 * So: DETECT, DO NOT STORE. The engine's OUTPUT is already kept, and comparing
 * two outputs is exact -- it is not a guess about what somebody typed. Nothing
 * new is retained to make this work.
 *
 * IMPECCABLE MEANS NO FALSE ALARMS. Only fields that are properties of the
 * BIRTH MOMENT are compared. Anything that could differ for a reason other than
 * different details -- the drawing, a tier-gated field that is present on one
 * record and absent on the other, a note about an unknown time -- is excluded
 * on purpose. A warning that fires when nothing changed would do more damage
 * than the silence it replaces.
 */

/**
 * The fields that identify a chart. Every one is decided by the birth moment
 * and by nothing else, and every one is present at EVERY tier -- so comparing a
 * summary against a reading cannot manufacture a difference out of scope.
 */
export const IDENTIFYING = [
  "type",
  "strategy",
  "authority",
  "profile",
  "definition",
  "signature",
  "notSelfTheme",
  "incarnationCross",
];

/** Arrays that are also decided by the birth moment. Order is not significant. */
export const IDENTIFYING_SETS = ["definedCenters", "openCenters", "channels"];

/**
 * What changed between two engine outputs, as a list of field names. Empty
 * means the same chart.
 *
 * A field MISSING from either side is skipped rather than counted as a change.
 * Tiers carry different fields, and a record written before a field existed is
 * not evidence that somebody's birth moment moved.
 */
export function chartDifferences(before, after) {
  if (!before || !after) return [];
  const changed = [];

  for (const key of IDENTIFYING) {
    const a = before[key];
    const b = after[key];
    if (a == null || b == null) continue;
    if (String(a).trim() !== String(b).trim()) changed.push(key);
  }

  for (const key of IDENTIFYING_SETS) {
    const a = before[key];
    const b = after[key];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    const norm = (v) => [...v].map((x) => String(x).trim()).sort().join("|");
    if (norm(a) !== norm(b)) changed.push(key);
  }

  return changed;
}

/**
 * The most recent chart this buyer already has, by the address on the purchase.
 *
 * The address is the identity (D-9) and it is the only thread between two
 * separate purchases -- an upgrade is a NEW reading with a new id, so there is
 * nothing inside one record that points at the other.
 *
 * Returns null rather than throwing on anything unreadable. This runs while
 * somebody is waiting for a chart they have paid for, and a comparison that
 * cannot be made is a comparison not made -- never a failure.
 */
export async function previousChart(store, { email, excludeId, loadReading, now = Date.now() }) {
  if (!store || !email || typeof loadReading !== "function") return null;
  let listed;
  try {
    listed = await store.list();
  } catch {
    return null;
  }

  const wanted = String(email).trim().toLowerCase();
  let best = null;
  for (const blob of listed?.blobs ?? []) {
    if (blob.key === excludeId) continue;
    let r;
    try {
      r = await loadReading(store, blob.key, now);
    } catch {
      continue;
    }
    if (!r || r.pending || !r.output) continue;
    if (String(r.buyer?.email ?? "").trim().toLowerCase() !== wanted) continue;
    // The most recently FILLED one is the one they last saw.
    if (!best || (r.filledAt ?? 0) > (best.filledAt ?? 0)) best = r;
  }
  return best;
}

/** A short, human list of what moved: "Type, Profile and your channels". */
export function describeDifferences(fields) {
  const names = {
    type: "Type",
    strategy: "Strategy",
    authority: "Authority",
    profile: "Profile",
    definition: "Definition",
    signature: "Signature",
    notSelfTheme: "Not-Self Theme",
    incarnationCross: "Incarnation Cross",
    definedCenters: "your defined centres",
    openCenters: "your open centres",
    channels: "your channels",
  };
  const list = fields.map((f) => names[f] ?? f);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
