/**
 * MOCK SWITCH -- branch fix-mock-1021 only, never main.
 *
 * The fixes for the 10/21 live-test error set, each behind its own id so the
 * mock's GREEN renders are real pages, PDFs and emails (Jeremy: red now /
 * green proposed, one change per page). Same pattern as the earlier
 * `?ux=` / `?mock=` mocks:
 *
 *   pages     ?fix=2A        (or ?fix=2A,6B)
 *   server    HD_FIX=2A      (PDF, emails, checker, handlers)
 *
 * With no switch every page, PDF and email is exactly what is live today.
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
