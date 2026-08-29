import { chartFactsOnly, firstProblem, sanitize } from "./interpretation.mjs";

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
 * It lives in `hd-reading-app`, which is private, and reaches production as an
 * ENVIRONMENT VARIABLE that Jeremy sets. `tools/reading-prompt.local.txt` holds
 * a copy for local work; it is gitignored, and the scanner skips `.local.`
 * files by name because they exist to hold precisely what it refuses to
 * publish.
 *
 * WITHOUT IT, NOTHING IS GENERATED. That is the right failure: a reading
 * written to a prompt we did not choose is worse than no reading, and the
 * validator would only catch the ones that came back the wrong SHAPE.
 */
export function systemPrompt(explicit) {
  const raw = explicit ?? process.env.READING_PROMPT ?? "";
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * ONE QUIET RETRY, and only for a malformed answer.
 *
 * Measured by the app over twelve real generations: the model dropped a
 * required heading twice. A bad key or no connection will fail identically the
 * second time, so those are not retried -- there is nothing to gain and a
 * second bill to pay.
 */
const ATTEMPTS = 2;

/**
 * Returns `{ ok: true, text }` or `{ ok: false, reason, detail }`.
 *
 * NEVER THROWS. This runs where a buyer is waiting, and an exception here would
 * be indistinguishable from the purchase itself failing.
 */
export async function generateReading(
  output,
  { apiKey, prompt, model = MODEL, fetchImpl = fetch, timeoutMs = 90_000 } = {},
) {
  if (!apiKey) return { ok: false, reason: "misconfigured", detail: "no GEMINI_API_KEY" };
  const instruction = systemPrompt(prompt);
  if (!instruction) {
    return { ok: false, reason: "misconfigured", detail: "no READING_PROMPT" };
  }
  if (!output || typeof output !== "object") {
    return { ok: false, reason: "no_chart", detail: "nothing to interpret" };
  }

  let last = { ok: false, reason: "unknown" };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    last = await once(output, { apiKey, instruction, model, fetchImpl, timeoutMs });
    if (last.ok) return last;
    // Only a malformed reading is worth asking for again.
    if (last.reason !== "malformed") return last;
  }
  return last;
}

async function once(output, { apiKey, instruction, model, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(ENDPOINT(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instruction }] },
        // THE ONLY THING THAT LEAVES. See interpretation.mjs.
        contents: [{ role: "user", parts: [{ text: chartFactsOnly(output) }] }],
        generationConfig: { temperature: 1, maxOutputTokens: 8192 },
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

  const clean = sanitize(text);
  if (!clean) return { ok: false, reason: "malformed", detail: "gemini returned nothing" };

  const problem = firstProblem(clean);
  if (problem) return { ok: false, reason: "malformed", detail: problem };

  return { ok: true, text: clean };
}
