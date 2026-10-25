import { typeLink, profileLink, AUTHORITY } from "./libraryLinks.mjs";
import { curly } from "./curlyQuotes.mjs";

/**
 * THE CALM NOTE AFTER A CORRECTION (release 2, Jeremy 10/19).
 *
 * "Change a detail" is the same person correcting their own details -- a birth
 * time learned since, a town picked wrong -- not somebody new. So nothing is
 * an alarm any more: the corrected details become the chart's details, and the
 * reading says, calmly, what was changed and, kindly, whether Type, Profile or
 * Authority came out differently. ("This is not the chart you had before" is
 * retired everywhere.)
 *
 * The same note, worded as "What changed from your summary", is shown when an
 * older summary -- bought before details were kept -- has its details typed
 * once for an upgrade, and the chart moved.
 *
 * Built from the record's `correction` (netlify/lib/correction.mjs) by the
 * page. Shared, so the words are tested in one place. Never carries the
 * earlier details anywhere but this note on the buyer's own page.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "1991-07-22" -> "July 22, 1991". */
export function sayDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return null;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** "17:40" -> "5:40 PM". */
export function sayTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

const FIELD_WORDS = { type: "Type", profile: "Profile", authority: "Authority" };
/** The chart tier's number, for wording only (a note is never a request for a tier). */
const TIER_CHART = 1;

function list(words) {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** One sentence per detail that was changed. */
export function detailSentences(c) {
  const was = c?.was ?? {};
  const now = c?.now ?? {};
  const out = [];
  for (const f of c?.changed ?? []) {
    if (f === "time") {
      const a = was.timeKnown === false ? null : sayTime(was.time);
      const b = now.timeKnown === false ? null : sayTime(now.time);
      if (a && b) out.push(`Birth time changed from ${a} to ${b}`);
      else if (b) out.push(`Birth time added: ${b}`);
      else if (a) out.push(`Birth time now unknown (it was ${a}), so the chart is cast at noon`);
    } else if (f === "date") {
      out.push(`Birth date changed from ${sayDate(was.date)} to ${sayDate(now.date)}`);
    } else if (f === "place") {
      // A place with an apostrophe ("Coeur d'Alene, Idaho") is curled where it is shown, as the
      // birth line curls it (shared/birthLine.mjs, decision 8); the kept places stay as typed
      // (batch-1024, 10/24).
      out.push(`Birth place changed from ${was.place ? curly(was.place) : "the one before"} to ${now.place ? curly(now.place) : "the new one"}`);
    } else if (f === "name") {
      out.push(
        was.name && now.name
          ? `The name on the chart changed from ${was.name} to ${now.name}`
          : now.name
            ? `The chart is now named for ${now.name}`
            : "The chart no longer carries a name",
      );
    }
  }
  return out;
}

/**
 * The note, as words: `{ eyebrow, lead, body, learn }`, or null when there is
 * nothing to say (a summary typed once that came out exactly the same).
 * `learn` is a library link for the first value that moved.
 */
export function correctionNote(c, { tier: pageTier } = {}) {
  if (!c || typeof c !== "object") return null;
  // The page's tier names the thing redone (a time added); unsaid, a chart.
  const tier = Number.isInteger(pageTier) ? pageTier : TIER_CHART;
  const moved = Array.isArray(c.chart) ? c.chart.filter((x) => x && FIELD_WORDS[x.field]) : [];
  const same = ["type", "profile", "authority"].filter((f) => !moved.some((m) => m.field === f));

  const movedSentence = moved.length
    ? `${moved.length === 1 ? "One part" : moved.length === 2 ? "Two parts" : "Three parts"} came out differently: ` +
      list(moved.map((m) => `your ${FIELD_WORDS[m.field]} is now ${m.now} (it was ${m.was})`)) +
      "."
    : "";
  const sameSentence = same.length
    ? `Your ${list(same.map((f) => FIELD_WORDS[f]))} ${same.length === 1 ? "is" : "are"} the same.`
    : "";

  const first = moved[0];
  const learn = first
    ? {
        label:
          first.field === "authority"
            ? `What ${first.now} authority means`
            : first.field === "profile"
              ? `What a ${first.now} profile means`
              : `What being a ${first.now} means`,
        href: first.field === "type" ? typeLink(first.now) : first.field === "profile" ? profileLink(first.now) : AUTHORITY,
      }
    : null;

  if (c.type === "first-details") {
    if (!moved.length) return null;
    return {
      eyebrow: "What changed from your summary",
      lead: "Your chart is cast from the details typed today.",
      // What stayed the same beside what moved, before the closing sentence, as the
      // "Birth time added" note says it (10/23 read N1; extra, picks-1023, pending Jeremy).
      body: [
        movedSentence,
        sameSentence,
        "A birth time that was guessed before and is known now would do exactly this — nothing went wrong, and everything below is written for this chart.",
      ]
        .filter(Boolean)
        .join(" "),
      learn,
    };
  }

  /**
   * A BIRTH TIME FOUND LATER, ADDED (10/22): nothing was wrong, so the note
   * never says "correction" or "corrected". The words are the page's tier's
   * (a summary that grew into a chart says "chart").
   */
  if (c.type === "time-added") {
    const at = sayTime(c.now?.time);
    if (!at) return null;
    const what = tier >= 2 ? "your chart and your reading are" : tier === 1 ? "your chart is" : "your summary is";
    const thing = tier >= 1 ? "chart" : "summary";
    // Scoped to the three the note names (10/22 verbatim read), and the rest of the chart said too.
    const scoped = moved.length
      ? `Of your Type, Profile and Authority, ${moved.length === 1 ? "one" : moved.length === 2 ? "two" : "all three"} came out differently: ` +
        list(moved.map((m) => `your ${FIELD_WORDS[m.field]} is now ${m.now} (it was ${m.was})`)) +
        "."
      : "";
    const ALSO = { definition: "definition", incarnationCross: "incarnation cross", centers: "centers", channels: "channels" };
    const also = (Array.isArray(c.also) ? c.also : []).filter((f) => ALSO[f]).map((f) => ALSO[f]);
    const alsoSentence = also.length ? `Your ${list(also)} ${moved.length ? "changed too" : "came out differently"}.` : "";
    const follows = moved.length || also.length ? `That follows from your birth time — nothing went wrong, and everything below is written for your ${thing} as it is now.` : "";
    return {
      eyebrow: "Your birth time",
      lead: `Birth time added: ${at} — ${what} now redone from it.`,
      // What stayed the same is said beside what moved, before the closing sentence (10/23 verbatim read, N1).
      body: moved.length
        ? [scoped, sameSentence, alsoSentence, follows].filter(Boolean).join(" ")
        : [sameSentence, alsoSentence, follows].filter(Boolean).join(" "),
      learn,
    };
  }

  const details = detailSentences(c);
  if (!details.length && !moved.length) return null;
  const lead = details.length
    ? `${details.join(". ")} — your chart is cast from the corrected details.`
    : "Your chart is cast from the corrected details.";
  // The same order as the other two notes: what moved, what stayed the same, then the close
  // (10/23 read N1; extra, picks-1023, pending Jeremy).
  const body = moved.length
    ? [movedSentence, sameSentence, "That follows from your correction — nothing went wrong, and everything below is written for the corrected chart."]
        .filter(Boolean)
        .join(" ")
    : sameSentence;
  return { eyebrow: "Your correction", lead, body, learn };
}

/** "Your chart has grown" -- an old link that now opens the grown chart. */
export function grownNote(fromLabel, toLabel) {
  const from = String(fromLabel ?? "").replace(/^The\s+/i, "").toLowerCase() || "summary";
  const to = String(toLabel ?? "").replace(/^The\s+/i, "").toLowerCase() || "reading";
  return {
    eyebrow: "Your chart has grown",
    lead: `This is now your ${to}.`,
    body: `This link first opened your ${from}. Since you took it further, it opens the whole ${to} — the ${from} is part of it.`,
  };
}
