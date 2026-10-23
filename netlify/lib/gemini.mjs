import { chartFactsOnly, copyProblem, draftProblem, firstProblem, sanitize } from "./interpretation.mjs";
import { FACT_CARDS, READING_SCHEMA, renderReading, schemaNotes, structuredFacts } from "./structured.mjs";
import { FIX_WORDS, fixRequest, mergeFix, refusedPlan } from "./reask.mjs";

/**
 * Asking Gemini for the written interpretation.
 *
 * THE CONTRACT LIVES IN `interpretation.mjs` AND IS NOT REPEATED HERE. This
 * file only knows how to make the request and how to give up. What is asked
 * for, and what counts as an acceptable answer, are that module's business --
 * written first on purpose, because a generator is worth nothing until
 * something can say the answer came back wrong.
 *
 * THE PRIVACY RULE, restated because this is the file that actually opens the
 * socket: `chartFactsOnly(output)` is the ONLY thing that goes over the wire.
 * No name, no birth date, no birth time, no place. Google offers no deletion
 * path for API content, and on the free tier prompts may be used to improve
 * their products -- so the protection is that identifying data never leaves.
 *
 * Free tier is Jeremy's decision, made with that in front of him: what could
 * ever be reviewed is "Manifesting Generator, 2/4, Sacral, 20-34" with nothing
 * attached to it.
 */

/** The app's model, so both surfaces are asking the same thing. */
export const MODEL = "gemini-3.5-flash-lite";

const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * THE PROMPT IS NOT IN THIS REPO, AND MUST NOT BE.
 *
 * `hd-site` is a PUBLIC repository. The instruction that turns a set of chart
 * values into a reading is the product -- it is what Jeremy has been refining
 * against real clients -- and committing it here would hand it to anybody who
 * looked. The leak scanner has a rule for exactly this and it caught the first
 * attempt at this file, which is the only reason this comment exists.
 *
 * It lives in `hd-reading-app`, which is private. In production it lives in a
 * BLOB, not an environment variable, and that is a hard limit rather than a
 * preference: Netlify Functions run on Lambda, Lambda caps ALL environment
 * variables together at 4 KB, and this prompt is 6 KB on its own. Compressed it
 * is 3.8 KB, which would leave no room for the six variables already there.
 *
 * Put in place once, from Jeremy's machine, with nothing exposed on the web:
 *
 *   netlify blobs:set config reading-prompt --input tools/reading-prompt.local.txt
 *
 * No endpoint writes it, so there is no endpoint to abuse. `.local.` files are
 * gitignored and the scanner skips them by name -- they exist to hold precisely
 * what it refuses to publish.
 *
 * WITHOUT IT, NOTHING IS GENERATED. That is the right failure: a reading
 * written to a prompt we did not choose is worse than no reading, and the
 * validator would only catch the ones that came back the wrong SHAPE.
 */
export const PROMPT_STORE = "config";
export const PROMPT_KEY = "reading-prompt";

/**
 * The prompt, from wherever it actually is. An explicit one wins (tests), then
 * the blob, then the environment -- the last kept because a short prompt would
 * still fit there, and a fallback that costs one line is worth having.
 */
export async function loadPrompt({ store, explicit } = {}) {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (store) {
    try {
      const text = await store.get(PROMPT_KEY, { type: "text" });
      if (typeof text === "string" && text.trim()) return text.trim();
    } catch {
      /* an unreachable store is a missing prompt, and that is reported */
    }
  }
  const env = process.env.READING_PROMPT ?? "";
  return typeof env === "string" && env.trim() ? env.trim() : null;
}

/**
 * ONE QUIET RETRY, and only for a malformed answer.
 *
 * Measured by the app over twelve real generations: the model dropped a
 * required heading twice. A bad key or no connection will fail identically the
 * second time, so those are not retried -- there is nothing to gain and a
 * second bill to pay.
 */
/**
 * ONE ask per call now, not two: interpretJob.mjs retries a malformed draft
 * once itself and records BOTH refusals with their excerpts. Two loops
 * stacked meant four requests per stuck reading and only two of them on
 * file (audit F40, 2026-09-03).
 */
const ATTEMPTS = 1;

/**
 * Returns `{ ok: true, text }` or `{ ok: false, reason, detail }`.
 *
 * NEVER THROWS. This runs where a buyer is waiting, and an exception here would
 * be indistinguishable from the purchase itself failing.
 */
/**
 * `fix` (10/23, re-asking only the failing part): a refused draft's
 * { form, parts } (reask.mjs planFix). The model is asked for those parts only,
 * its answer goes back into its own draft, and the whole draft is judged again
 * exactly as a new one is. `factCards`: the per-center notes in the facts
 * (structured.mjs FACT_CARDS, an A/B arm, off by default).
 *
 * A refused form-mode draft comes back with `form` and `plan` (reask.mjs
 * refusedPlan): every problem it has, the slots each rests on, and the parts
 * to ask for again when all of them are local.
 */
export async function generateReading(
  output,
  { apiKey, prompt, model = MODEL, fetchImpl = fetch, timeoutMs = 90_000, shape = "text", fix = null, factCards = FACT_CARDS } = {},
) {
  if (!apiKey) return { ok: false, reason: "misconfigured", detail: "no GEMINI_API_KEY" };
  const instruction = typeof prompt === "string" && prompt.trim() ? prompt.trim() : null;
  if (!instruction) {
    return { ok: false, reason: "misconfigured", detail: "no READING_PROMPT" };
  }
  if (!output || typeof output !== "object") {
    return { ok: false, reason: "no_chart", detail: "nothing to interpret" };
  }

  // A part can only be asked for in form mode, of a draft that has its parts listed.
  const part = shape === "json" && fix && fix.form && Array.isArray(fix.parts) && fix.parts.length ? fix : null;
  let last = { ok: false, reason: "unknown" };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    last = await once(output, { apiKey, instruction, model, fetchImpl, timeoutMs, shape, fix: part, factCards });
    if (last.ok) return last;
    /**
     * A BUSY MODEL IS NOT A VERDICT. On 2026-09-03 Google answered 503 for a
     * stretch of minutes, every draft in that window was counted as a final
     * failure, and two paid readings sat unwritten with no net to catch them.
     * One pause and one more ask, before giving up.
     */
    const busy = last.reason === "http" && /\b(503|429)\b/.test(String(last.detail));
    if (busy) {
      await new Promise((r) => setTimeout(r, 5000));
      last = await once(output, { apiKey, instruction, model, fetchImpl, timeoutMs, shape, fix: part, factCards });
      if (last.ok) return last;
    }
    if (last.reason !== "malformed") return last;
  }
  return last;
}

/**
 * EVERY CHECK A DRAFT MUST PASS, in order, on its sanitized text: the first
 * problem, or null. Exported so the local rig's stand-in writer
 * (tools/e2e/harness/fakeGemini.mjs) holds its drafts to exactly this.
 *
 * `sources` / `allowed` (10/23, re-asking only the failing part): what the copy
 * check holds the draft to. A re-ask passes its own (the prompt, the form notes
 * AND the re-ask's words, reask.mjs FIX_WORDS); left out, they are the prompt
 * and the form notes, and the facts just sent, as for any new draft.
 */
export function draftCheck(clean, output, { instruction, facts, json, sources = null, allowed = null }) {
  return (
    // The TYPE comes from the chart, never from the reading. The check exists to
    // catch the reading disagreeing with the chart it was written from.
    // All three centre lists travel, not just the open one: the undefined branch
    // of openCentreProblem had never run in production because this call passed
    // four arguments to a function that takes five, and centreStateProblem needs
    // the defined list to catch a reading calling an undefined centre defined.
    firstProblem(
      clean,
      output?.type,
      output?.profile,
      output?.openCenters,
      output?.undefinedCenters,
      output?.definedCenters,
    ) ??
    // 10/22, every check that needs the chart itself (interpretation.mjs
    // draftProblem, the phone's the same): a try-this tag names a feature this
    // chart has; no "birth time was not known" on a time-known chart and no
    // astrology words; an unknown birth time said once, only about the values
    // the birth day changes; another type's word about the reader; "you must";
    // a word said twice; a misspelled feeling word.
    draftProblem(clean, output) ??
    // 10/22: words lifted from the instructions are a copy, not a reading. Only
    // this file knows the prompt, so the check runs here; the facts just sent
    // (cross name, centers, channel lines) are the reading's own vocabulary.
    // 10/23: after a re-ask, the words of the re-ask count as instructions too.
    copyProblem(clean, sources ?? [instruction, ...(json ? schemaNotes() : [])], allowed ?? [facts])
  );
}

async function once(output, { apiKey, instruction, model, fetchImpl, timeoutMs, shape, fix = null, factCards = FACT_CARDS }) {
  // "json": the model fills READING_SCHEMA and structured.mjs writes the
  // document. "text": the original letter-shaped prompt. See structured.mjs.
  const json = shape === "json";
  const facts = chartFactsOnly(output, { form: json }) + (json ? structuredFacts(output, { cards: factCards }) : "");
  // A re-ask of parts: the facts, then the draft and the parts (reask.mjs fixRequest), and the small form.
  const asked = fix ? fixRequest(fix.form, output, fix.parts) : null;
  // What the draft is held to for copying: the prompt, the form notes, and the words of a re-ask.
  const sources = [instruction, ...(json ? schemaNotes() : []), ...(fix ? FIX_WORDS : [])];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(ENDPOINT(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instruction }] },
        // THE ONLY THING THAT LEAVES. See interpretation.mjs. A re-ask adds the
        // model's own draft of this chart and the checker's words, nothing else.
        contents: [{ role: "user", parts: [{ text: facts + (asked ? asked.text : "") }] }],
        generationConfig: json
          ? {
              temperature: 1,
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
              responseSchema: asked ? asked.schema : READING_SCHEMA,
            }
          : { temperature: 1, maxOutputTokens: 8192 },
      }),
      signal: controller.signal,
    });
  } catch (e) {
    // An abort and a dropped connection are the same answer to the caller.
    return {
      ok: false,
      reason: e?.name === "AbortError" ? "timeout" : "network",
      detail: e?.message ?? "no reply",
    };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    /**
     * THE STATUS TRAVELS, THE BODY DOES NOT. An error body from Google can
     * echo the request back, and the request is a chart -- which is exactly
     * what must not end up in a log or in a monitoring digest.
     */
    return { ok: false, reason: "http", detail: `gemini ${res.status}` };
  }

  let text;
  try {
    const body = await res.json();
    text = body?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
  } catch {
    return { ok: false, reason: "unreadable", detail: "gemini sent something that is not json" };
  }

  let form = null;
  let built = null;
  const copy = { sources, allowed: [facts] };
  if (json) {
    let filled;
    try {
      filled = JSON.parse(text);
    } catch {
      // A re-ask that came back unreadable leaves its draft as it was, to be asked for again.
      if (fix) return { ok: false, reason: "malformed", detail: "the reading form came back unreadable", text, form: fix.form, plan: { parts: fix.parts } };
      return { ok: false, reason: "malformed", detail: "the reading form came back unreadable", text };
    }
    form = fix ? mergeFix(fix.form, fix.parts, filled) : filled;
    built = renderReading(form, output);
    if (built.problem) {
      return { ok: false, reason: "malformed", detail: built.problem, text, form, plan: refusedPlan({ form, output, rendered: built, copy }) };
    }
    text = built.text;
  }

  const clean = sanitize(text);
  if (!clean) return { ok: false, reason: "malformed", detail: "gemini returned nothing" };

  // Every check, in order (draftCheck above); the copy check held to this ask's own sources.
  const problem = draftCheck(clean, output, { instruction, facts, json, sources: copy.sources, allowed: copy.allowed });
  // The rejected text travels with the reason, so an incident can show WHAT
  // was refused -- without it a prompt regression is indistinguishable from
  // Google having a bad week.
  if (problem) {
    // Every short line is a heading candidate; a "missing section" incident
    // then shows what the model wrote instead of the heading it was given.
    const headings = clean
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && l.length < 60 && !/[.!?]$/.test(l) && !/^\(/.test(l))
      .join(" | ");
    const refused = { ok: false, reason: "malformed", detail: problem, text: `${headings}\n---\n${clean}` };
    // Form mode: the draft and every problem it has, for a re-ask of only the failing part (interpretJob.mjs).
    return json ? { ...refused, form, plan: refusedPlan({ form, output, rendered: built, copy }) } : refused;
  }

  // The form travels with a passing draft too (form mode), so a test round can read what was written where.
  return json ? { ok: true, text: clean, form } : { ok: true, text: clean };
}
