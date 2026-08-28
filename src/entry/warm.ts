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
 */
let done = false;

export function warmEngine() {
  if (done) return;
  done = true;
  fetch("/api/places?q=a&limit=1").catch(() => {});
}
