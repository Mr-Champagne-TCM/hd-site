/**
 * Wake the engine before anybody is waiting on it.
 *
 * The engine scales to zero, so the first request after an idle spell pays a
 * cold start of several seconds. Measured on the phone: "aus" typed, four
 * seconds of Looking..., then answers.
 *
 * Warming on the place field's own focus was not early enough -- somebody
 * focuses that field and types within a second, so the warm-up and the real
 * lookup both land on a machine that is still starting. The head start has to
 * come from further back, and the form gives one for free: the date is answered
 * before the place, and answering it takes several seconds.
 *
 * So the first touch of ANY field wakes the engine. Once per session, one tiny
 * request. It is not free, which is why it is not fired on page load -- a
 * visitor who never fills the form never wakes anything.
 *
 * IT HAS ITS OWN ENDPOINT NOW, and that is a scar rather than a preference.
 *
 * This used to call `/api/places?q=a&limit=1` -- a real lookup, deliberately
 * tiny. Then the place endpoint was given a CDN cache and the warm ping started
 * being answered by the edge in 30ms, never reaching the engine at all.
 *
 * Nothing failed. No test broke, no log line appeared, and cached place
 * lookups got measurably faster -- while the first real search after an idle
 * spell went back to a five-second cold start, which is precisely what warming
 * exists to prevent. Reported as "ric took over 5 seconds to produce results".
 *
 * A warm-up must not share a URL with a cacheable answer. /api/warm is
 * no-store and returns nothing, so nothing between here and the engine can
 * satisfy it on the engine's behalf.
 */
let done = false;

export function warmEngine() {
  if (done) return;
  done = true;
  fetch("/api/warm").catch(() => {});
}
