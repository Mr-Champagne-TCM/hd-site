import { fillInterpretation, loadReading, mintReadingLink } from "./reading.mjs";
import { generateReading } from "./gemini.mjs";
import { promptShape } from "./interpretation.mjs";
import { geminiKind, noteFailure } from "./failures.mjs";
import { PLACEHOLDERS } from "./structured.mjs";

/**
 * WRITE ONE READING. The job itself, with everything it touches passed in.
 *
 * Written this way so the whole path can be tested without Netlify, without
 * Google, and without a network -- which matters more here than anywhere else
 * on the site, because the thing being tested is what a buyer is handed for
 * forty-four dollars.
 *
 * WHY THIS IS NOT DONE ON THE REQUEST. A reading is around 1,200 words and
 * takes the model tens of seconds. A synchronous Netlify function on the free
 * plan is cut off at ten. Generating inline would not be slow, it would be
 * BROKEN -- and broken in the worst way: the buyer's form submit would time out
 * after they had already paid.
 *
 * So the chart is filed and answered immediately, and the writing happens
 * afterwards. Two consequences worth stating rather than discovering:
 *
 *   The buyer sees their chart at once and their reading a minute or two later.
 *   The page says so rather than looking broken.
 *
 *   The job must be SAFE TO RUN TWICE. `fillInterpretation` is write-once, so a
 *   second run finds the text already there and stops. Somebody who paid for a
 *   reading gets ONE reading -- a model asked twice answers twice, and a
 *   document that changes under a person quoting it back is worse than one that
 *   is merely imperfect.
 */
/** Total asks for one reading when drafts are refused. */
export const ASKS = 5;

/**
 * ONE MORE ASK AFTER A TIMEOUT (10/22 AI test round). A Projector / Mental 1/3
 * chart ran past the 90 s limit on all nine asks; given six minutes, one
 * answered normally in 136 s. Until now a timeout ended the job and the buyer
 * waited for the sweep. So a timeout gets ONE re-ask with a longer limit, and
 * it counts as one of the five asks.
 */
export const TIMEOUT_REASK_MS = 150_000;
/** The ask's own limit in gemini.mjs (generateReading's default). */
const ASK_MS = 90_000;
/**
 * TIME, NOT ONLY ASKS. interpret.mjs is a background function: fifteen minutes,
 * hard. One ask can take its limit twice (a busy 503, five seconds, one more
 * try: gemini.mjs), so an ask starts only when that worst case still ends
 * inside this reading's budget and the caller's deadline. A reading stopped
 * here is still owed; the sweep asks again later (the job is safe to run twice).
 */
export const READING_BUDGET_MS = 8 * 60_000;
const worstAsk = (limit) => 2 * limit + 5_000;

export async function interpretOne({
  id,
  store,
  health,
  apiKey,
  prompt,
  grantSecret,
  origin,
  deliver,
  now = Date.now(),
  generate = generateReading,
  clock = Date.now,
  deadline = Infinity,
}) {
  const reading = await loadReading(store, id, now);
  if (!reading) return { ok: false, reason: "not_found" };
  if (reading.tier < 2) return { ok: false, reason: "wrong_tier" };
  if (reading.pending) return { ok: false, reason: "no_chart_yet" };
  if (reading.reading) return { ok: false, reason: "already_written" };

  // The stored prompt decides the shape: form mode or letter mode.
  const shape = promptShape(prompt);
  const stop = Math.min(clock() + READING_BUDGET_MS, deadline);
  const fits = (limit) => clock() + worstAsk(limit) <= stop;
  // Too little of the caller's time left to finish even one ask: leave it for the next run.
  if (!fits(ASK_MS)) return { ok: false, reason: "out_of_time" };
  let made = await generate(reading.output, { apiKey, prompt, shape });
  let reaskedTimeout = false;
  /**
   * UP TO FIVE ASKS ON A REFUSED DRAFT (Jeremy 9/9 + 10/4: refuse and re-ask,
   * five times, instead of rewriting). The first live buyer under the
   * three-state prompt had two drafts refused and then waited on a sweep that
   * never came; another ask costs seconds, leaving it to the net costs the
   * buyer the afternoon. Every refusal is reported with its excerpt.
   */
  for (let ask = 1; ask < ASKS && !made.ok; ask++) {
    if (made.reason === "malformed" && fits(ASK_MS)) {
      // One refused draft is noise on its own (internal-only); the sweep counts
      // them, and six in an hour raises reading-failure-rate.
      // A form of placeholders ("string" in its slots) is its own kind (10/22).
      const kind = String(made.detail ?? "").startsWith(PLACEHOLDERS) ? "gemini-placeholder" : "gemini-refused";
      await noteFailure(health, kind, {
        detail: made.detail ?? null,
        excerpt: made.text ?? null,
        now,
      });
      made = await generate(reading.output, { apiKey, prompt, shape });
    } else if (made.reason === "timeout" && !reaskedTimeout && fits(TIMEOUT_REASK_MS)) {
      // Once only: a second timeout is reported as one, below.
      reaskedTimeout = true;
      // Internal-only, like a refusal: the sweep counts it toward reading-failure-rate.
      await noteFailure(health, "gemini-timeout-reasked", { detail: made.detail ?? null, now });
      made = await generate(reading.output, { apiKey, prompt, shape, timeoutMs: TIMEOUT_REASK_MS });
    } else break;
  }
  if (!made.ok) {
    /**
     * REPORTED, NOT SWALLOWED. This is the one failure nobody else can see: the
     * buyer has a chart and is waiting for words that are never coming, and
     * every other surface looks fine. The reason travels; the chart does not.
     */
    // Granular (gemini-503, gemini-429, gemini-timeout, gemini-refused-5x ...)
    // so the alert says WHICH wall was hit. The buyer meanwhile sees "being
    // written", then "taking longer than it should" -- never an error.
    await noteFailure(health, geminiKind(made.reason, made.detail), {
      detail: made.detail ?? null,
      excerpt: made.text ?? null,
      now,
      // WHICH reading (10/16), so the alert can link to it.
      ref: { reading: id, tier: reading.tier },
      ...(deliver?.alert ? { send: deliver.alert, site: origin } : {}),
    });
    return { ok: false, reason: made.reason, detail: made.detail };
  }

  const filed = await fillInterpretation(store, id, made.text, now);
  if (!filed.ok) return { ok: false, reason: filed.reason };

  /**
   * And tell them. A reading finished in the background that nobody is told
   * about is a reading nobody reads -- they closed the tab when the chart
   * appeared.
   */
  if (typeof deliver?.email === "function" && grantSecret && origin) {
    const url = `${origin}/r/${mintReadingLink({ id, tier: reading.tier }, grantSecret)}`;
    try {
      await deliver.email({
        to: reading.buyer?.email ?? null,
        name: reading.buyer?.name ?? null,
        chartName: reading.birth?.name ?? null,
        url,
        tier: reading.tier,
        // A reading bought for someone new says "their" (bug 16, 10/21).
        someoneNew: reading.fresh === true,
      });
    } catch (e) {
      // The reading is on the page; the email is the copy. Ours to follow up.
      await noteFailure(health, "reading-ready-email", { detail: `${e?.message ?? e?.name ?? "send failed"}`.slice(0, 80), now });
    }
  }

  return { ok: true, words: made.text.split(/\s+/).length };
}
