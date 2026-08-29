/**
 * Which path opens a reading.
 *
 * Its own module, with no React in it, so it can be tested as the pure function
 * it is. It started life inside ReadingPage.tsx and could not be imported by a
 * test -- the harness transpiles a single file into a temp directory, where
 * `react` does not resolve. That is a shallow reason on its own; the real one
 * is that a routing rule is a decision about what the site does, and it should
 * be checkable without rendering anything.
 *
 * THE DANGEROUS DIRECTION IS TOO PERMISSIVE. Every extra path this matches is a
 * page that quietly renders a reading shell instead of whatever was asked for.
 * So: an exact prefix, one segment, an explicit character set, and an optional
 * trailing slash. Nothing else.
 *
 * The character class is base64url plus the dot that separates a signed
 * payload from its signature -- exactly what sig.mjs produces and nothing more.
 * A `/` cannot appear, so `..` cannot become a path, and neither `?` nor `#`
 * can smuggle a second meaning in.
 */
export function tokenFromPath(pathname: string): string | null {
  const m = /^\/r\/([A-Za-z0-9_.-]+)\/?$/.exec(pathname);
  return m ? m[1] : null;
}

/**
 * `/u/<token>` is the same reading, looking at what it could become.
 *
 * A SECOND ROUTE RATHER THAN A FLAG, because it is a different page: the tiles,
 * priced against what this link already owns. Jeremy asked for it after the
 * upgrade button dropped him straight into Stripe with no chance to see what
 * the other tiers were or pick a different one.
 *
 * Same character class and the same single segment as above, for the same
 * reason -- the token is a bearer credential and the permissive direction is
 * the dangerous one.
 */
export function upgradeTokenFromPath(pathname: string): string | null {
  const m = /^\/u\/([A-Za-z0-9_.-]+)\/?$/.exec(pathname);
  return m ? m[1] : null;
}
