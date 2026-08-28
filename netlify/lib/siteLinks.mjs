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
  contact: "hd-readings@thechampagnemethod.co",
};
