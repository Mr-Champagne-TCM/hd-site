/**
 * Where a word on the reading goes when clicked -- PORTED from the phone app
 * (hd-reading-app LibraryLinks.kt, 10/16), so the shop's PDF, the shop's page
 * and the phone's PDF open the same library entry for the same word (Jeremy:
 * "All PDFs should look the same").
 *
 * Existing words only -- no new sentences, no sales copy. Chart words open the
 * free Human Design library at the entry that explains them; the brand lines
 * open the shop; the footer opens his coaching home.
 *
 * The anchors are the library's own (the-champagne-method,
 * src/library/hd/engine.ts): fold ids "type-<name>", "line-<n>", and the
 * entries its openHash() opens on arrival -- "profile-<a>-<b>",
 * "channel-<lo>-<hi>", "cross-<r|l|j>-<name>" (its crossId()). Topic sections
 * are plain ids: #authority, #centers, #definition, #channels, #crosses.
 *
 * test/libraryLinks.test.mjs holds these to the phone's own outputs.
 */

export const LIBRARY = "https://thechampagnemethod.co/library/human-design/";
export const SHOP = "https://humandesign.thechampagnemethod.co/";
export const SITE_URL = "https://thechampagnemethod.co/";
export const BODYGRAPH_GUIDE = "https://thechampagnemethod.co/library/bodygraph/";

export const topic = (id) => `${LIBRARY}#${id}`;

export const AUTHORITY = topic("authority");
export const CENTERS = topic("centers");
export const DEFINITION = topic("definition");
export const CHANNELS = topic("channels");
/** The library's own section on gates (10/22): the "Activated gates" row links here, not to #channels. */
export const GATES = topic("gates");
export const PROFILES = topic("profiles");
export const CROSSES = topic("crosses");
export const TYPES = topic("types");

/** "Manifesting Generator" -> #type-manifesting-generator (the library's fold id). */
export function typeLink(type) {
  const t = String(type ?? "").trim();
  return t ? topic("type-" + t.toLowerCase().replace(/ /g, "-")) : TYPES;
}

/** "1/3" -> #profile-1-3, which opens that profile. */
export function profileLink(profile) {
  const d = String(profile ?? "").replace(/\D/g, "");
  return d.length === 2 ? topic(`profile-${d[0]}-${d[1]}`) : PROFILES;
}

/** "Line 3" (or 3) -> #line-3. */
export function lineLink(title) {
  const digits = String(title ?? "").replace(/\D/g, "");
  const n = digits ? Number(digits) : NaN;
  return n >= 1 && n <= 6 ? topic(`line-${n}`) : PROFILES;
}

/** "20-57" (either order) -> #channel-20-57, lower gate first as the library keys it. */
export function channelLink(numbers) {
  const g = (String(numbers ?? "").match(/\d+/g) ?? []).map(Number);
  return g.length === 2 ? topic(`channel-${Math.min(g[0], g[1])}-${Math.max(g[0], g[1])}`) : CHANNELS;
}

/**
 * "Right Angle Cross of Eden (11/12 | 6/36)" -> #cross-r-eden, exactly the
 * library's crossId(): kind letter + name, lower-cased, every run of other
 * characters one hyphen. A cross the engine cannot name goes to the crosses
 * topic.
 */
export function crossLink(cross) {
  const m = /^(Right Angle|Left Angle|Juxtaposition) Cross of (.+?)\s*(\(|$)/.exec(String(cross ?? "").trim());
  if (!m) return CROSSES;
  const kind = m[1] === "Right Angle" ? "r" : m[1] === "Left Angle" ? "l" : "j";
  return topic("cross-" + `${kind}-${m[2]}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
}
