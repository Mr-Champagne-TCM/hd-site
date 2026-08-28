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
 * come from further back.
 *
 * WHAT ACTUALLY FIRES IT, in the order it happens:
 *
 *   1. an IntersectionObserver on the entry form, with 400px of rootMargin, so
 *      it fires while the form is still BELOW the fold. This is the one that
 *      does the work
 *   2. a date picker changing, or the place field taking focus -- backstops for
 *      anyone who arrives past the observer, or whose browser lacks it
 *
 * `done` makes all of those at most one request per session.
 *
 * The two pages behave differently and both are right. On the offer page the
 * form sits below the hero, the example, the prices and the credibility, so the
 * observer fires while somebody is still scrolling -- a real head start. On
 * /r/<token> the form is the first thing rendered, so it fires at what amounts
 * to page load, which is what the people who have paid should get.
 *
 * NOT LITERALLY ON PAGE LOAD, and that is deliberate rather than an oversight.
 * Every visitor would wake the machine -- bounces, crawlers, link previews --
 * and somebody who reads the hero and leaves would cost a boot.
 *
 * What this cannot do is guarantee anything. A visitor who scrolls straight
 * down and types within a second of the form appearing still outruns it. Only
 * an always-on machine removes that, which is a standing cost decision and
 * Jeremy's to make; warming is the free ninety per cent.
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
