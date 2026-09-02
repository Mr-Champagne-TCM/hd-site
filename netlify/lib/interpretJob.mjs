import { fillInterpretation, loadReading, mintReadingLink } from "./reading.mjs";
import { generateReading } from "./gemini.mjs";
import { reportFailure } from "./health.mjs";

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
}) {
  const reading = await loadReading(store, id, now);
  if (!reading) return { ok: false, reason: "not_found" };
  if (reading.tier < 2) return { ok: false, reason: "wrong_tier" };
  if (reading.pending) return { ok: false, reason: "no_chart_yet" };
  if (reading.reading) return { ok: false, reason: "already_written" };

  let made = await generate(reading.output, { apiKey, prompt });
  /**
   * ONE IMMEDIATE RETRY ON A REFUSED DRAFT. The first live buyer under the
   * three-state prompt had two drafts refused (one wrong strategy, one missing
   * heading) and then waited on a sweep that never came. A second ask costs
   * thirty seconds; leaving it to the net costs the buyer the afternoon.
   */
  if (!made.ok && made.reason === "malformed") {
    await reportFailure(health, {
      kind: "interpretation-malformed",
      detail: made.detail ?? null,
      excerpt: made.text ?? null,
      now,
    }).catch(() => {});
    made = await generate(reading.output, { apiKey, prompt });
  }
  if (!made.ok) {
    /**
     * REPORTED, NOT SWALLOWED. This is the one failure nobody else can see: the
     * buyer has a chart and is waiting for words that are never coming, and
     * every other surface looks fine. The reason travels; the chart does not.
     */
    await reportFailure(health, {
      kind: `interpretation-${made.reason}`,
      detail: made.detail ?? null,
      excerpt: made.text ?? null,
      now,
      ...(deliver?.alert ? { send: deliver.alert, site: origin } : {}),
    }).catch(() => {});
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
    await deliver
      .email({ to: reading.buyer?.email ?? null, name: reading.buyer?.name ?? null, url, tier: reading.tier })
      .catch(() => {});
  }

  return { ok: true, words: made.text.split(/\s+/).length };
}
