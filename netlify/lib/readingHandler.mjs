import { loadCurrent, loadReading, readReadingLink } from "./reading.mjs";
import { TIERS } from "../../shared/pricing.mjs";
import { marginNotes, parseReading, structureProblem } from "./interpretation.mjs";
import { buildReadingView, forDisplay, writtenForDisplay } from "./readingView.mjs";
import { birthLine } from "../../shared/birthLine.mjs";
import { sellable } from "../../shared/availability.mjs";
import { customerError } from "./failures.mjs";
import { forTier } from "../../shared/customerMessages.mjs";
import { buyerNameFor, firstName, shownName } from "../../shared/chartName.mjs";
import { addTimeState } from "./addTime.mjs";
import { markedFields } from "../../shared/timeSpread.mjs";

/** Page counts by reading and version, so a reload does not build the PDF again. */
const PAGES = new Map();

async function pagesFor(reading, id, countPages) {
  if (typeof countPages !== "function" || reading.tier < 1 || reading.pending) return null;
  if (reading.tier >= 2 && !reading.reading) return null; // still being written
  const key = `${id}:${reading.filledAt}:${reading.writtenAt}`;
  if (PAGES.has(key)) return PAGES.get(key);
  try {
    const n = await countPages(reading, id);
    const pages = Number.isInteger(n) && n > 0 ? n : null;
    if (pages) {
      if (PAGES.size > 500) PAGES.clear();
      PAGES.set(key, pages);
    }
    return pages;
  } catch {
    return null; // a count is a nicety; the page never fails for it
  }
}

/**
 * Opening a reading link, with the store passed in.
 *
 * Written this way so the whole path can be tested without Netlify, without a
 * network and without a clock -- including the assertions that matter most
 * here, which are all about what a stranger holding a URL can get.
 *
 * THE LINK IS A BEARER TOKEN. Anyone holding it is the holder; there is no
 * login, and by design there never will be. That is the trade Jeremy chose
 * (D-9c): no accounts, no passwords, no customer database. What it costs is
 * that a forwarded link forwards the reading, which is why the link is short
 * (six days) while the reading is kept a year.
 *
 * So this endpoint's job is narrow and it should stay narrow: verify the
 * signature, load exactly what it names, and return nothing that was not paid
 * for.
 */

/**
 * WHAT IS NEVER RETURNED, however convenient it would be.
 *
 * The buyer's email and phone stay on the server. The page has no use for them
 * -- the re-send button says "send it to me" and the address is chosen by the
 * server, per D-9 -- and returning them would turn a link into a way to read
 * somebody's contact details. A link is guessable-adjacent in a way an account
 * is not, and the blast radius of a leaked one should be a chart, not an
 * identity.
 *
 * The NAME is returned, because it is what labels the page as theirs, and it is
 * the thing that makes keeping a birthday unnecessary.
 */
export async function handleReading({ body, store, secret, now = Date.now(), note = async () => {}, countPages = null }) {
  /**
   * Every failure is noted at its severity (failures.mjs) and answered with
   * the catalogue's words. `note` never throws into this path.
   */
  const fail = async (kind, detail, opts, ref) => {
    try {
      await note(kind, { detail, ...(ref ? { ref } : {}) });
    } catch {
      /* the reader is waiting; the record is ours to lose */
    }
    const { status, payload } = customerError(kind, opts);
    return json(status, payload);
  };

  let request;
  try {
    request = JSON.parse(body);
  } catch {
    return fail("reading-link-bad", "body is not json", { code: "bad_json", status: 400 });
  }

  const token = request?.token;
  const link = readReadingLink(token, secret, now);
  if (!link.ok) {
    // ONE MESSAGE FOR EVERY WAY OF FAILING except expiry, which is the only one
    // a real person can act on. A forged signature and a reading that does not
    // exist must be indistinguishable, or the endpoint becomes a way to ask
    // whether a given reading exists.
    if (link.reason === "expired") return fail("reading-link-expired", "link expired", { customer: forTier("reading-link-expired", link.tier) });
    if (link.reason === "misconfigured") return fail("reading-misconfigured", "GRANT_SECRET unusable");
    return fail("reading-link-bad", `link ${link.reason ?? "bad"}`);
  }

  /**
   * A STORE THAT DOES NOT ANSWER IS NOT A BAD LINK. This used to throw, and
   * the buyer -- holding a perfectly good link -- was shown "That link could
   * not be opened", which reads as their problem and has no next step. It is
   * ours: say the reading is safe, and that reloading usually finds it.
   */
  let reading;
  let current;
  try {
    /*
     * RELEASE 2 (Jeremy 10/19, "2 yes"): an OLD LINK AFTER AN UPGRADE opens the
     * grown chart, with a small "Your chart has grown" note. `loadCurrent`
     * follows the record's `grewTo` to the newest filled one.
     */
    current = await loadCurrent(store, link.id, now, { strict: true });
    reading = current?.reading ?? null;
  } catch (e) {
    return fail("reading-store-unavailable", `load failed (${e?.name ?? "Error"})`, undefined, { reading: link.id, tier: link.tier });
  }
  // Same message as a bad signature, deliberately. A reading past its year and
  // a reading that never existed look identical from outside.
  if (!reading) return fail("reading-link-bad", "no reading for a valid link");

  /**
   * THE LINK'S TIER AND THE STORED TIER MUST AGREE.
   *
   * They always do when both are minted by this system: a link is signed with
   * the tier of the reading it points at, and an upgrade produces a new reading
   * AND a new link rather than editing either.
   *
   * So a mismatch is not a case to handle gracefully by serving the lower of
   * the two -- it means something is wrong that this code does not understand,
   * and the safe response to that is to serve nothing. Trimming a response down
   * to a tier is the engine's job, done once, at purchase; re-implementing it
   * here would be a second boundary to keep in step with the first.
   */
  if (link.tier !== current.first.tier) {
    console.log(`reading: tier mismatch, link ${link.tier} vs stored ${current.first.tier}`);
    return fail("reading-tier-mismatch", `link ${link.tier} vs stored ${current.first.tier}`);
  }

  /**
   * THE CHART IT GREW FROM, for an upgrade (release 2): its kept details are
   * on this record already; its values are what the confirm screen shows
   * ("Your chart: Manifesting Generator · 2/4 · Sacral authority") and its
   * centers draw the small picture beside them.
   */
  let source = null;
  if (reading.grewFrom) {
    try {
      source = await loadReading(store, reading.grewFrom, now);
    } catch {
      source = null;
    }
  }
  /** "Alex": the name on the chart, else the buyer's first name (never on a chart for someone else). */
  const whose = shownName(reading.birth?.name ?? firstName(buyerNameFor(reading))) ?? null;

  /**
   * A PENDING READING IS NOT A BROKEN ONE. They have paid and have not yet
   * said when they were born, which is the ordinary state of every purchase
   * for the minute or two between the card and the form.
   *
   * No upgrade is offered here. Somebody who has not yet seen the thing they
   * bought is not being sold the next one -- that is the register the whole
   * site avoids, and it would read as a shop rather than a threshold.
   */
  if (reading.pending) {
    return json(200, {
      pending: true,
      tier: reading.tier,
      label: TIERS[reading.tier]?.label ?? null,
      name: reading.buyer?.name ?? null,
      /**
       * The form's "Whose chart will this be?" starts with the buyer's first
       * name (fix 17A) -- or with nothing, for a new chart for someone else.
       */
      chartName: reading.fresh ? "" : (reading.birth?.name ?? firstName(reading.buyer?.name)),
      whose,
      /**
       * RELEASE 2: an upgrade carries its chart's kept details, so the page
       * shows them to CONFIRM ("These are right -- make my reading") rather
       * than asking again. The buyer's own details, on the buyer's own link.
       */
      kept: reading.birth ? { ...reading.birth, birthLine: birthLine(reading.birth) } : null,
      grewFrom: source
        ? {
            tier: source.tier,
            label: TIERS[source.tier]?.label ?? null,
            chart: chartLine(source.output),
            // The same three, each with whether it is PROVISIONAL (time unknown, the value changes that day), 10/22 B2.
            chartParts: chartParts(source.output),
            definedCenters: source.output?.definedCenters ?? [],
          }
        : null,
      /** An upgrade of an older summary, which kept no details: typed once. */
      typeOnce: Boolean(reading.grewFrom && !reading.birth),
      /** Bought from "Start a new chart for someone else". */
      fresh: reading.fresh,
      purchasedAt: reading.purchasedAt,
      output: null,
      upgrade: null,
      canResend: Boolean(reading.buyer?.email),
    });
  }

  const next = reading.tier + 1;
  return json(200, {
    pending: false,
    tier: reading.tier,
    // What they bought, in the words the site already uses for it.
    label: TIERS[reading.tier]?.label ?? null,
    /**
     * WHOSE CHART, for the title (fix 17A, 10/19): the name typed on the birth
     * form when there is one, else the buyer's, as before -- but not on a chart
     * for someone else, which with no name is "Your Human Design".
     */
    name: reading.birth?.name ?? buyerNameFor(reading),
    whose,
    /**
     * Bought from "Start a new chart for someone else" (or grown from one): their chart. The options page
     * says "For them" and "Their birth details" from it (10/25 live test: Kit O'Brien's options said "For me";
     * only the pending answer carried this).
     */
    fresh: reading.fresh === true,
    purchasedAt: reading.purchasedAt,
    output: reading.output,
    /**
     * RELEASE 2: "Your chart has grown" -- this link was signed for an earlier
     * tier, and opens the chart it grew into. Null on the link's own chart.
     */
    grown: current.grown ? { fromTier: current.first.tier, fromLabel: TIERS[current.first.tier]?.label ?? null } : null,
    /**
     * THE CALM NOTE after "Change a detail" (or an older summary typed once):
     * what changed, and whether Type, Profile or Authority moved. Formatted on
     * the page by shared/correctionNote.mjs. The record's HISTORY of earlier
     * details is never sent -- it is for support only.
     */
    correction: reading.correction ?? null,
    /**
     * THE PDF'S REAL PAGE COUNT (fix 9A, 10/19): the download button says
     * "PDF, 8 pages". Counted from the PDF itself, built the way /api/pdf
     * builds it -- only when there is one to download (chart tier and up, not
     * while the words are still being written). Null when it cannot be had;
     * the button then simply says "PDF".
     */
    pdfPages: await pagesFor(reading, current.id, countPages),
    /**
     * THE WRITTEN INTERPRETATION, PARSED, when the tier paid for one.
     *
     * Jeremy's assumption, and it held: "Should have PDF content, in the page,
     * then PDF'able when they need." A reading whose only form is a download is
     * a reading nobody reads on a phone.
     *
     * PARSED HERE, not in the browser. `interpretation.mjs` is a server module
     * and stays one -- the prompt lives in it, and shipping a prompt to every
     * visitor is how the next person builds the same product for nothing. What
     * crosses is the finished blocks.
     *
     * Gated on the TIER rather than on whether text happens to be stored, so a
     * record that somehow carried text it was not paid for still shows none.
     *
     * The model's sentences curled for display (decision 4, 10/23), here and
     * in `view` below: parsed from the stored text, curled on the way out,
     * never written back (readingView.mjs forDisplay).
     */
    written:
      reading.tier >= 2 && typeof reading.reading === "string"
        ? writtenForDisplay(parseReading(reading.reading))
        : null,
    /**
     * The chart facts that sit beside each section. From the CHART, never from
     * the model -- the same table the PDF prints, sent rather than recomputed
     * so the page and the document cannot answer differently.
     */
    notes:
      reading.tier >= 2 && typeof reading.reading === "string"
        ? marginNotes(reading.output)
        : null,
    /**
     * PAID FOR WORDS THAT ARE NOT WRITTEN YET.
     *
     * Generation runs on a sweep rather than on the request -- a reading takes
     * the model tens of seconds and a synchronous function is cut off at ten --
     * so there is a real minute or two where a reading-tier buyer has their
     * chart and none of their reading. Answered here in a field of its own,
     * because a page that quietly shows less than was paid for reads as broken.
     */
    /**
     * THE PDF'S ORDER, FOR THE PAGE (Jeremy 10/16): the glance sentences,
     * Start here (centers, channels, profile, each with the library's
     * one-liner and a Takeaway), then the reading decision-first. Built by
     * the SAME function the PDF uses, so the page and the document cannot
     * disagree. Null for a reading that cannot be laid out that way (letter
     * mode), which keeps the old shape.
     */
    view:
      reading.tier >= 2 && typeof reading.reading === "string" && structureProblem(reading.reading) === null
        ? forDisplay(buildReadingView(reading.output, reading.reading))
        : null,
    /** The PDF's birth line, when the record keeps birth details (16 Oct 2026 on). */
    birthLine: birthLine(reading.birth),
    /**
     * "ADD IT HERE" (10/22): whether this chart's birth time can still be added
     * -- "open" (cast at noon, not used yet), "used", "known", "none". The page
     * opens the time-only form on #add-time only when it is open.
     */
    addTime: addTimeState(reading),
    writing: reading.tier >= 2 && !reading.pending && !reading.reading,
    /**
     * D-11: no upgrade offered at the top tier, because there is nothing above
     * it. Decided here rather than in the page, so that a page which forgets to
     * check cannot advertise something that does not exist -- and so the same
     * answer serves the email and the screen.
     */
    /**
     * AND WHETHER IT CAN ACTUALLY BE BOUGHT. Found while reviewing the page:
     * a chart buyer was offered a Buy button for the reading -- a tier that
     * does not exist, that the offer page says plainly is "not ready to buy
     * yet", and that the checkout function refuses. Pressing it produced an
     * error, which is the worst possible place to meet one.
     *
     * Answered here, from the same `sellable()` the checkout enforces, so the
     * page, the email and the PDF cannot each decide it differently.
     */
    upgrade:
      next < TIERS.length
        ? { level: next, label: TIERS[next].label, available: sellable(next) }
        : null,
    /** Whether a re-send has anywhere to go. The address itself never leaves. */
    canResend: Boolean(reading.buyer?.email),
  });
}

function json(status, payload) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // A reading is private and a link is a bearer token. No shared cache may
      // hold this, and no proxy may hand it to the next person along.
      "Cache-Control": "no-store, private",
    },
    body: JSON.stringify(payload),
  };
}

/** "Manifesting Generator · 2/4 · Sacral authority": the chart in one line, for the confirm screen. */
/**
 * The confirm screen's "Your chart" line as its three values, each marked
 * PROVISIONAL when it is one of the values that change during an unknown
 * birth day (10/22 verbatim read, B2) -- as every other place they print.
 */
export function chartParts(output) {
  if (!output) return null;
  const marked = markedFields(output);
  const parts = [
    ["type", output.type],
    ["profile", output.profile],
    ["authority", output.authority ? `${output.authority} authority` : null],
  ]
    .map(([field, v]) => ({ text: typeof v === "string" ? v.trim() : "", provisional: marked.has(field) }))
    .filter((p) => p.text);
  return parts.length ? parts : null;
}

export function chartLine(output) {
  if (!output) return null;
  const parts = [output.type, output.profile, output.authority ? `${output.authority} authority` : null]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
