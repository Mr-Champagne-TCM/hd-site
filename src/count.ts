import { countSource, fromCheckout } from "../shared/countSource.mjs";

/**
 * THE OFFER PAGE'S TWO COUNTS: a visit, and a click on Buy (10/26; netlify/lib/counts.mjs says what is kept and
 * what is not). The source is worked out once, from the address the visitor landed on, and is one plain word.
 * Nothing is stored in the browser. A count that cannot be sent is simply not counted.
 */
const landing = typeof window === "undefined" ? null : { search: window.location.search, referrer: document.referrer };
const SOURCE = landing ? countSource(landing.search, landing.referrer, window.location.hostname) : "direct";

function send(body: Record<string, unknown>) {
  try {
    const data = JSON.stringify(body);
    if (navigator.sendBeacon?.("/api/count", new Blob([data], { type: "application/json" }))) return;
    void fetch("/api/count", { method: "POST", body: data, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  } catch {
    /* not counted */
  }
}

/** One visit to the offer page (not a return from Stripe). */
export function countVisit() {
  if (!landing || fromCheckout(landing.referrer)) return;
  send({ e: "visit", src: SOURCE });
}

/** One click on a Buy button: the tier, and whether it is a first purchase, a step further, or someone new. */
export function countBuy(level: number, kind: "new" | "upgrade" | "someone") {
  send({ e: "buy", src: SOURCE, tier: level, kind });
}
