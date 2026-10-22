/**
 * MOCK SWITCH -- branch only, never main.
 *
 * The 10/21 live-test items still waiting on Jeremy's call, each behind its own
 * id so the mock's GREEN renders are real pages, PDFs and emails (Jeremy: red
 * now / green proposed, one change per page). Only these remain; every chosen
 * fix is written in plainly:
 *
 *   17A / 17B  an unknown birth time, told two ways (W4's dash rides with it)
 *   W13B       "HEART (EGO)" on two lines ("HEART" over a smaller "(EGO)");
 *   W13C       "HEART (EGO)" on one line, 10 units left of the engine's spot
 *              (one line at the engine's spot is the default on this branch,
 *              shared/heartLabel.mjs)
 *   TIME       an unknown birth time, measured (mock 10/22): the one line, the
 *              day drawn with its rows, PROVISIONAL only on what changes
 *              (netlify/lib/birthSpread.mjs, shared/timeSpread.mjs)
 *   TIMEBAR    with TIME: the day drawn without rows
 *   TIMEOFFERB with TIME: the second wording of "Found your birth time?"
 *
 * Written in plainly on mock-tiers-1022 (Jeremy's calls, 10/22): 2A / 2B (the
 * summary keeps channels and activated gates, the new tier split), W13 ("HEART
 * (EGO)" on the drawing) and W14 ("Cross of the ...", shared/crossName.mjs).
 *
 * Same pattern as the earlier `?ux=` / `?mock=` mocks:
 *
 *   pages     ?fix=2A        (or ?fix=2A,17B)
 *   server    HD_FIX=2A      (PDF, emails, handlers)
 *
 * With no switch, these items read exactly as they do live today.
 * Once Jeremy picks, the chosen option is written in plainly and this goes.
 */
function picked() {
  let raw = "";
  if (typeof window !== "undefined" && window.location) {
    raw = new URLSearchParams(window.location.search).get("fix") ?? "";
  } else if (typeof process !== "undefined" && process.env) {
    raw = process.env.HD_FIX ?? "";
  }
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** True when any of the given option ids is switched on. */
export function fix(...ids) {
  const on = picked();
  return on.length > 0 && ids.some((id) => on.includes(String(id).toUpperCase()));
}
