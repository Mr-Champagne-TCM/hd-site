import Anthropic from "@anthropic-ai/sdk";

/**
 * ASKING CLAUDE FOR THE READING FORM (10/23, Jeremy: "i think we have enough data to support my t4+t5
 * approach. This is the new approach"). The same instruction, the same chart facts and the same form
 * as the Gemini call in gemini.mjs; the answer comes back as the form's JSON text and gemini.mjs
 * renders and checks it exactly as it does Gemini's. Which speed to ask at, and when to step aside for
 * Gemini, is writer.mjs's business.
 *
 * THE PRIVACY RULE HOLDS: only `chartFactsOnly(output)` (and, on a re-ask, the model's own draft) goes
 * over the wire. Anthropic does not train on API traffic and deletes it within 30 days.
 *
 * Measured on the 36 test charts (hd-e2e/ai-test-claude-1023): fast + effort medium, 89% first try,
 * ~45 s a reading; normal speed + effort medium, ~2 min.
 */

export const MODEL = "claude-opus-5-5";
const EFFORT = "medium";
const MAX_TOKENS = 32_000;

/** Published Opus 5.5 prices, $ per token; fast mode is twice these. */
const PRICE = { in: 4e-6, cacheWrite: 5e-6, cacheRead: 0.2e-6, out: 20e-6 };

/**
 * GEMINI'S FORM SCHEMA AS A JSON SCHEMA. Lower-case types, every object closed (structured outputs
 * require `additionalProperties: false`), and an array of fixed length says so in words: structured
 * outputs accept no length constraint. The checker refuses a wrong count either way.
 */
export function toJsonSchema(s) {
  const out = {};
  if (s.type) out.type = s.type.toLowerCase();
  let description = s.description ?? "";
  if (s.type === "ARRAY" && s.minItems != null && s.minItems === s.maxItems) {
    description = [description, `Exactly ${s.minItems} items.`].filter(Boolean).join(" ");
  }
  if (description) out.description = description;
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
    out.required = s.required ?? Object.keys(s.properties);
    out.additionalProperties = false;
  }
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.enum) out.enum = s.enum;
  return out;
}

export function cost(usage = {}, fast = false) {
  const x = fast ? 2 : 1;
  return x * ((usage.input_tokens ?? 0) * PRICE.in + (usage.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (usage.output_tokens ?? 0) * PRICE.out);
}

/**
 * WHAT A FAILED CALL MEANS. Only the status and the error's own type travel: an error body can echo the
 * request, and the request is a chart.
 *   busy         429 / 5xx / overloaded: fast mode may be full; writer.mjs asks again at normal speed.
 *   outOfCredit  the month's credit or a spend limit is used up: Gemini until the credit renews.
 *   rejected     a bad key, a bad request: Gemini, and an alert.
 */
export function failureKind(e) {
  const status = e?.status ?? 0;
  const err = e?.error?.error ?? e?.error ?? {};
  const message = String(err?.message ?? e?.message ?? "");
  if (err?.details?.error_code === "enforced_spend_limit_reached") return "outOfCredit";
  if (status === 400 && /credit balance|usage limits/i.test(message)) return "outOfCredit";
  if (status === 429 || status === 529 || status >= 500 || err?.type === "overloaded_error") return "busy";
  if (status) return "rejected";
  return "network";
}

/**
 * One call. Resolves to { ok: true, text, cost, org } or { ok: false, failure, detail }; a timeout is
 * { ok: false, failure: "timeout" }. `fetchImpl` lets tests answer instead of Anthropic.
 */
export async function askClaude({ apiKey, instruction, user, schema, fast, timeoutMs, fetchImpl }) {
  const client = new Anthropic({ apiKey, maxRetries: 0, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        betas: ["server-side-fallback-2026-07-01", ...(fast ? ["fast-mode-2026-02-01"] : [])],
        fallbacks: "default",
        ...(fast ? { speed: "fast" } : {}),
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT, format: { type: "json_schema", schema: toJsonSchema(schema) } },
        system: [{ type: "text", text: instruction, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      },
      { signal: controller.signal },
    );
    const msg = await stream.finalMessage();
    const org = stream.response?.headers?.get?.("anthropic-organization-id") ?? null;
    if (msg.stop_reason === "refusal") return { ok: false, failure: "refusal", detail: "claude declined this chart", org };
    const text = msg.content.filter((c) => c.type === "text").map((c) => c.text).join("");
    return { ok: true, text, cost: cost(msg.usage, fast), org, fast };
  } catch (e) {
    if (controller.signal.aborted) return { ok: false, failure: "timeout", detail: "claude took too long" };
    const failure = failureKind(e);
    return { ok: false, failure, detail: `claude ${e?.status ?? failure}` };
  } finally {
    clearTimeout(timer);
  }
}
