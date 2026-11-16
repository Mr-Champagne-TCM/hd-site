/**
 * WHERE A VISIT CAME FROM, AS ONE PLAIN WORD (10/26, Jeremy: "a yes" -- count the front page's visits and Buy
 * clicks before the ad is boosted again; netlify/lib/counts.mjs).
 *
 * A `?src=` tag on the link wins (the ad's link will carry one: the Instagram app often sends no referrer at
 * all). Otherwise the referring site is reduced to a word -- "instagram", "google", "website" -- and the
 * address itself goes nowhere: no path, no query, nothing that could name a person or a page they were on.
 */

/** A tag as given (`?src=ig-oct`), or null when it is not a short plain word. */
export function cleanSource(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,23}$/.test(v) ? v : null;
}

const SITES = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, "facebook"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|search\.brave\.com)$/, "search"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "linkedin"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)thechampagnemethod\.co$/, "website"],
];

/**
 * The visit's source: the link's tag, else the referring site as a word, else "direct" (typed, bookmarked, or
 * an app that sends nothing). `ownHost` is this shop: coming back to it from one of its own pages is "self".
 */
export function countSource(search, referrer, ownHost) {
  let tagged = null;
  try {
    const p = new URLSearchParams(search || "");
    tagged = cleanSource(p.get("src") ?? p.get("utm_source"));
  } catch {
    /* no tag */
  }
  if (tagged) return tagged;
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  if (!host) return "direct";
  if (ownHost && host === String(ownHost).toLowerCase()) return "self";
  for (const [re, word] of SITES) if (re.test(host)) return word;
  return "other";
}

/** Back from Stripe (paid or not): not a new visit. */
export function fromCheckout(referrer) {
  try {
    return /(^|\.)stripe\.com$/.test(new URL(referrer).hostname);
  } catch {
    return false;
  }
}
