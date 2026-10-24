import { fillInterpretation, loadReading, mintReadingLink, redoneWithTime } from "./reading.mjs";
import { generateReading } from "./gemini.mjs";
import { promptShape } from "./interpretation.mjs";
import { geminiKind, noteFailure } from "./failures.mjs";
import { PLACEHOLDERS } from "./structured.mjs";
import { releaseLock, takeLock } from "./writingLock.mjs";

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

/**
 * RE-ASK ONLY THE FAILING PART, AND SOONER (Jeremy 10/23: "yes, reask only
 * failing part"; "Better to retry sooner. Minimize delays to customer").
 *
 * A refused form whose every problem rests on at most reask.mjs FIX_SLOTS
 * slots is not thrown away: the model is asked for those slots only, with its
 * own draft and the checker's words, and the whole draft is judged again. Such
 * an ask writes a sentence or a paragraph, not a reading, so it is cheap and
 * quick, and there can be more of them inside the same eight minutes:
 *
 *   ASKS          fresh drafts, as before (the first ask is one);
 *   PART_ASKS     asks for parts, on top of them;
 *   PART_TRIES    the same slot asked for this many times and still refused:
 *                 a fresh draft instead (a part that will not come right is
 *                 usually the draft's framing, not the sentence);
 *   PART_ASK_MS   a part's time limit (a whole reading's is 90 s);
 *   ASK_GAP_MS    a part ask starts at least this long after the ask before
 *                 it started (a fresh draft takes longer than that by
 *                 itself). The free tier counts
 *                 requests per minute per model (Google: "Rate limits are
 *                 applied per project"; a 429's quota id is
 *                 ...PerProjectPerModel-FreeTier); part asks can come back in
 *                 a few seconds, and ten a minute is the most one reading may
 *                 use, so a second reading at the same moment still fits.
 *
 * Fifteen asks at most, and the time rule above still decides: an ask starts
 * only when its worst case ends inside the reading's budget and the caller's
 * deadline, so the background function's fifteen minutes are never at risk.
 */
export const PART_ASKS = 10;
export const PART_TRIES = 3;
export const PART_ASK_MS = 45_000;
export const ASK_GAP_MS = 6_000;

/**
 * ONE WRITER PER READING (GO page v3, decision 23, 10/23; writingLock.mjs).
 * A job takes the reading's "writing" lock before its first ask and lets go
 * when it ends; while another job holds it, this one does nothing and says
 * so (`writing_elsewhere`). The lock outlives the reading's budget by a
 * margin for filing the words and sending the email, then expires by itself,
 * so a writer killed mid-job holds a reading for ten minutes at most.
 *
 * `lock` is the store it lives in (the health store, strong consistency:
 * interpret.mjs passes it). Without one, no lock is taken -- the old
 * behavior, which the tests of the job's own logic keep.
 */
export const WRITING_LOCK_MARGIN_MS = 2 * 60_000;
export const WRITING_LOCK_MS = READING_BUDGET_MS + WRITING_LOCK_MARGIN_MS;
export const WRITING_ELSEWHERE = "writing_elsewhere";

export async function interpretOne(args) {
  const { id, lock = null, clock = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = args;
  if (!lock) return writeOne(args);
  const took = await takeLock({ gate: lock, id, ms: WRITING_LOCK_MS, clock, sleep });
  if (!took.ok) return { ok: false, reason: WRITING_ELSEWHERE, until: took.held?.until ?? null };
  try {
    // Loaded AFTER the lock is held, so a job that waited on another one sees its words and stops ("already_written").
    const out = await writeOne(args);
    return took.unlocked ? { ...out, unlocked: took.unlocked } : out;
  } finally {
    if (took.lock) await releaseLock({ gate: lock, id, lock: took.lock });
  }
}

async function writeOne({
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
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
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
  let lastAskAt = clock();
  let made = await generate(reading.output, { apiKey, prompt, shape });
  let reaskedTimeout = false;
  let drafts = 1;
  let partAsks = 0;
  let noted = 0;
  // How often each slot of the current draft has been asked for again.
  const tries = new Map();
  // A part ask starts ASK_GAP_MS after the ask before it started (the free tier's per-minute count; a fresh
  // draft takes longer than that by itself). The wait is part of the time rule.
  const gap = (part) => (part ? Math.max(0, lastAskAt + ASK_GAP_MS - clock()) : 0);
  const ask = async (opts, limit) => {
    const wait = gap(Boolean(opts.fix));
    if (wait > 0) await sleep(wait);
    lastAskAt = clock();
    return generate(reading.output, { apiKey, prompt, shape, ...opts, ...(limit !== ASK_MS ? { timeoutMs: limit } : {}) });
  };
  const fitsAfterGap = (limit, part = false) => clock() + gap(part) + worstAsk(limit) <= stop;
  /**
   * UP TO FIVE FRESH DRAFTS ON A REFUSED DRAFT (Jeremy 9/9 + 10/4: refuse and
   * re-ask, five times, instead of rewriting), and since 10/23 the failing
   * part of a draft asked for on its own before a fresh draft is (PART_ASKS).
   * The first live buyer under the three-state prompt had two drafts refused
   * and then waited on a sweep that never came; another ask costs seconds,
   * leaving it to the net costs the buyer the afternoon. Every refusal is
   * reported with its excerpt.
   */
  while (!made.ok) {
    if (made.reason === "malformed") {
      // One refused draft is noise on its own (internal-only); the sweep counts
      // them, and six in an hour raises reading-failure-rate. ASKS - 1 of them
      // at most per job, as before part asks: the alarm still means two
      // readings struggling at once, or one failing job after job.
      // A form of placeholders ("string" in its slots) is its own kind (10/22).
      if (noted < ASKS - 1) {
        noted += 1;
        const kind = String(made.detail ?? "").startsWith(PLACEHOLDERS) ? "gemini-placeholder" : "gemini-refused";
        await noteFailure(health, kind, {
          detail: made.detail ?? null,
          excerpt: made.text ?? null,
          now,
        });
      }
      const parts = made.plan?.parts ?? null;
      const tired = (parts ?? []).some((p) => (tries.get(p.id) ?? 0) >= PART_TRIES);
      if (parts && made.form && !tired && partAsks < PART_ASKS && fitsAfterGap(PART_ASK_MS, true)) {
        partAsks += 1;
        for (const p of parts) tries.set(p.id, (tries.get(p.id) ?? 0) + 1);
        made = await ask({ fix: { form: made.form, parts } }, PART_ASK_MS);
        continue;
      }
      if (drafts < ASKS && fitsAfterGap(ASK_MS)) {
        drafts += 1;
        tries.clear();
        made = await ask({}, ASK_MS);
        continue;
      }
      break;
    }
    if (made.reason === "timeout" && !reaskedTimeout && drafts < ASKS && fitsAfterGap(TIMEOUT_REASK_MS)) {
      // Once only: a second timeout is reported as one, below.
      reaskedTimeout = true;
      drafts += 1;
      tries.clear();
      // Internal-only, like a refusal: the sweep counts it toward reading-failure-rate.
      await noteFailure(health, "gemini-timeout-reasked", { detail: made.detail ?? null, now });
      made = await ask({}, TIMEOUT_REASK_MS);
      continue;
    }
    break;
  }
  const asks = drafts + partAsks;
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
    return { ok: false, reason: made.reason, detail: made.detail, asks };
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
        // Written again for a birth time found later (10/22): the email says it was redone.
        redone: redoneWithTime(reading),
      });
    } catch (e) {
      // The reading is on the page; the email is the copy. Ours to follow up.
      await noteFailure(health, "reading-ready-email", { detail: `${e?.message ?? e?.name ?? "send failed"}`.slice(0, 80), now });
    }
  }

  return { ok: true, words: made.text.split(/\s+/).length, asks, partAsks };
}
