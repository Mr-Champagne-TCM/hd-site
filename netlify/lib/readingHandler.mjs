import { loadReading, readReadingLink } from "./reading.mjs";
import { TIERS } from "../../shared/pricing.mjs";
import { marginNotes, parseReading, structureProblem } from "./interpretation.mjs";
import { buildReadingView } from "./readingView.mjs";
import { birthLine } from "../../shared/birthLine.mjs";
import { sellable } from "../../shared/availability.mjs";
import { customerError } from "./failures.mjs";

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
export async function handleReading({ body, store, secret, now = Date.now(), note = async () => {} }) {
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
    if (link.reason === "expired") return fail("reading-link-expired", "link expired");
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
  try {
    reading = await loadReading(store, link.id, now, { strict: true });
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
  if (link.tier !== reading.tier) {
    console.log(`reading: tier mismatch, link ${link.tier} vs stored ${reading.tier}`);
    return fail("reading-tier-mismatch", `link ${link.tier} vs stored ${reading.tier}`);
  }

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
    name: reading.buyer?.name ?? null,
    purchasedAt: reading.purchasedAt,
    output: reading.output,
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
     */
    written:
      reading.tier >= 2 && typeof reading.reading === "string"
        ? parseReading(reading.reading)
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
        ? buildReadingView(reading.output, reading.reading)
        : null,
    /** The PDF's birth line, when the record keeps birth details (16 Oct 2026 on). */
    birthLine: birthLine(reading.birth),
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
