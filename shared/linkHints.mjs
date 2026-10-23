/**
 * LINK LABELS (Jeremy's GO PDF, 10/23: "Good, lets add link labels (hover hints?)").
 *
 * Every link that leaves the page says where it goes. The words a link shows
 * stay as they are; the destination rides along as a hover hint (`title`) and
 * in the link's accessible name (`aria-label`, which starts with the words the
 * link shows), so a screen reader hears it too.
 *
 * The same style as the website's src/site/linkHints.ts ("Opens …", no full
 * stop), and the same words for the same three destinations the website names:
 * the readings' front page, the coaching home page and its contact section.
 * One place for the words, so a destination is always named the same way, on
 * the pages, the server's own pages and the emails.
 *
 * Links that stay on the page (#start-here, #add-time) have none: they do not
 * leave it.
 */
export const HINT = Object.freeze({
  /** humandesign.thechampagnemethod.co, the readings' own front page (website: HINT.readings) */
  readings: "Opens Human Design readings",
  /** thechampagnemethod.co, the coaching home page (website: HINT.home) */
  home: "Opens The Champagne Method home page",
  /** thechampagnemethod.co/#connect: the booking link and the contact form (website: HINT.connect) */
  connect: "Opens the contact section on the home page",
  /** thechampagnemethod.co/#my-story */
  myStory: "Opens Jeremy’s story on the home page",
  /** thechampagnemethod.co/library/human-design/ */
  library: "Opens the Human Design library",
  /** thechampagnemethod.co/library/bodygraph/ */
  bodygraph: "Opens “Reading your bodygraph” in the library",
  /** thechampagnemethod.co/readings/: the website's page titled "What each reading actually is" */
  examples: "Opens “What each reading actually is”, with a real example chart",
  /** thechampagnemethod.co/readings/privacy/ */
  privacy: "Opens the privacy page",
  /** /charts/ */
  myCharts: "Opens the page that emails your charts",
  /** mailto: the readings address */
  mail: "Opens your email app, to write to Jeremy",
  /** /api/pdf: a download, not a page */
  pdf: "Downloads the PDF, to print or keep",
  /** /u/<token>#new: the three ways in, for a new chart for someone else */
  someoneNew: "Opens the prices for a new chart for someone else",
});

/** A Human Design term, row label or list item that opens its library entry. */
export const libraryHint = (what) => `Opens ${String(what).replace(/\s+/g, " ").trim()} in the Human Design library`;

/** "your" / "Robin’s" + "summary" / "chart" / "reading": the buyer's own page. */
export const ownPageHint = (whose, what) => `Opens ${whose} ${what}`;

/**
 * An email button, from its own words: "Open your reading" opens your reading;
 * "Enter your birth details" opens the page to enter them.
 */
export const actionHint = (action) => {
  const a = String(action).trim();
  return /^Open /.test(a) ? a.replace(/^Open /, "Opens ") : `Opens the page to ${a.charAt(0).toLowerCase()}${a.slice(1)}`;
};

/** title + aria-label for a link whose visible words are `label` (JSX: {...hint(label, where)}). */
export const hint = (label, where) => ({ title: where, "aria-label": `${String(label).replace(/\s+/g, " ").trim()} (${where})` });

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The same, as HTML attributes for the server's pages and the emails: ` title="…" aria-label="…"`. */
export const hintAttrs = (label, where) => {
  const h = hint(label, where);
  return ` title="${esc(h.title)}" aria-label="${esc(h["aria-label"])}"`;
};
