/**
 * Where the rest of the practice lives, for the server side.
 *
 * The same four URLs `src/copy.ts` holds for the page. Duplicated deliberately
 * rather than imported across the boundary: `src/` is bundled and served to
 * every visitor, and a server module reaching into it is the shape that put
 * signing code one careless import away from the browser last time.
 *
 * Four constants are a cheap duplication and the test beside this file asserts
 * the two copies agree, so they cannot drift in silence.
 *
 * `contact` is the FORWARDING address, never the personal one (D-12, D-13). It
 * reaches the same inbox and is the one designed to be seen.
 */
export const SITE = {
  home: "https://thechampagnemethod.co",
  library: "https://thechampagnemethod.co/library/",
  hd101: "https://thechampagnemethod.co/library/human-design/",
  bodygraph: "https://thechampagnemethod.co/library/bodygraph/",
  /**
   * What a purchase collects and what becomes of it.
   *
   * It is linked from the email and the PDF, not only from the shop, because
   * those two are the only things a buyer still has a week later -- and the
   * page describes THEIR data. A policy reachable only from the page you
   * bought on is a policy nobody can find at the moment they want it.
   *
   * Under /readings/, not /privacy/: every fact on it is about buying a
   * reading, and none of it describes the coaching.
   */
  privacy: "https://thechampagnemethod.co/readings/privacy/",
  contact: "hd-readings@thechampagnemethod.co",
};
