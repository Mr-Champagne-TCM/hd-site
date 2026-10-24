import { askClaude } from "./claude.mjs";

/**
 * WHO WRITES EACH ASK (10/23, Jeremy's T4 + T5 plan: "This is the new approach").
 *
 *   1. Claude Opus 5.5 FAST, effort medium, the ask's own limit (90 s a draft). 36 test charts: 89%
 *      first try, ~45 s a reading, ~$0.57.
 *   2. Fast busy (429 / 5xx), or this credit month's spend at SWITCH_AT or more: Opus at NORMAL
 *      speed, effort medium, NORMAL_MS to answer (~2 min, ~$0.27).
 *   3. Claude cannot write it at all (no key, out of credit, a refusal, a rejected key, a key from
 *      any account but the live one): { useGemini: true }, and gemini.mjs asks Gemini exactly as before.
 *
 * WHICH ACCOUNT: `expectOrg` (HD_ANTHROPIC_ORG) is the TCM "TCM HD live" org; an answer from any other
 * org is refused, and so is one from `blockOrgs` (HD_ANTHROPIC_BLOCK_ORGS: the test account). The ids
 * live in Netlify's settings, never in this public repo.
 *
 * The credit month starts on CREDIT_DAY, when the thechampagnemethod Max plan renews and its $200 of API
 * credit arrives. The month's spend is counted from Anthropic's own token counts and kept in the health
 * store (one record per ask under `claude-spend/<month>/`); the Console stays the real figure (asks cut off at a time limit still
 * cost, and are not counted here), which is why the switch sits well below the credit.
 *
 * ALERTS, each once per month: the switch to normal speed, $190 spent, out of credit, the wrong account.
 * Gemini stepping in for any other reason, once per day.
 */

export const SWITCH_AT = 130;
export const CREDIT_DAY = 16;
export const NORMAL_MS = 150_000;
const ASK_MS = 90_000;
const NEAR_OUT = 190;


const STRONG = { type: "json", consistency: "strong" };

/** The credit month a moment falls in, named by the month it starts in (the 16th to the 15th, UTC). */
export function creditMonth(ms, day = CREDIT_DAY) {
  const d = new Date(ms);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1;
  if (d.getUTCDate() < day) {
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** A draft at normal speed gets NORMAL_MS; a part ask keeps a short limit. */
export function normalLimit(ms) {
  return ms >= ASK_MS ? Math.max(ms, NORMAL_MS) : Math.max(ms, ASK_MS);
}

/**
 * The writer gemini.mjs calls for each ask: ({ instruction, user, schema, timeoutMs }) resolves to
 * { ok: true, text, by }, { ok: false, reason: "timeout", detail } (the job asks again, longer), or
 * { useGemini: true, why }.
 */
export function claudeWriter({
  apiKey,
  store,
  notify,
  switchAt = SWITCH_AT,
  creditDay = CREDIT_DAY,
  expectOrg = null,
  blockOrgs = [],
  clock = Date.now,
  ask = askClaude,
}) {
  return async ({ instruction, user, schema, timeoutMs }) => {
    if (!apiKey) return { useGemini: true, why: "no claude key" };
    // Letter mode (no form) is Gemini's: the Claude path is form mode only.
    if (!schema) return { useGemini: true, why: "letter mode" };
    const month = creditMonth(clock(), creditDay);
    const stateKey = `claude-state/${month}`;
    const state = { out: false, said: {}, ...((await read(store, stateKey)) ?? {}) };
    if (state.out) return { useGemini: true, why: "claude credit used up this month" };
    const spent = await monthSpend(store, month);

    let fast = spent < switchAt;
    let r = await ask({ apiKey, instruction, user, schema, fast, timeoutMs: fast ? timeoutMs : normalLimit(timeoutMs) });
    if (!r.ok && r.failure === "busy" && fast) {
      // T4: the same ask again at once, at normal speed, with the time a normal one needs.
      fast = false;
      r = await ask({ apiKey, instruction, user, schema, fast: false, timeoutMs: normalLimit(timeoutMs) });
    }

    if (r.ok && r.org && (blockOrgs.includes(r.org) || (expectOrg && r.org !== expectOrg))) {
      await say("org", spent, `Claude writer: the key answered for the wrong Anthropic account (${String(r.org).slice(0, 8)}...). Readings are on Gemini until HD_ANTHROPIC_KEY is the TCM hd-live key.`);
      return { useGemini: true, why: "wrong claude account" };
    }
    if (r.ok) {
      await addSpend(store, month, r.cost, clock());
      const now = spent + r.cost;
      if (spent < switchAt && now >= switchAt) {
        await say("switch", now, `Claude writer: $${now.toFixed(2)} of this month's credit used, so readings now go to Opus at normal speed (~2 min each) until the credit renews on the ${creditDay}th.`);
      }
      if (spent < NEAR_OUT && now >= NEAR_OUT) {
        await say("near", now, `Claude writer: $${now.toFixed(2)} of the $200 credit used this month. At $0 readings move to Gemini by themselves.`);
      }
      return { ok: true, text: r.text, by: fast ? "claude-fast" : "claude-normal" };
    }
    if (r.failure === "timeout") return { ok: false, reason: "timeout", detail: r.detail };

    if (r.failure === "outOfCredit") {
      state.out = true;
      await write(store, stateKey, state);
      await say("out", spent, `Claude writer: this month's Claude credit is used up ($${spent.toFixed(2)} counted). Readings are on Gemini until the credit renews on the ${creditDay}th.`);
    } else {
      const day = new Date(clock()).toISOString().slice(0, 10);
      await say(`gemini-${day}`, spent, `Claude writer: Gemini wrote a reading today because Claude could not (${r.failure}${r.detail ? `: ${r.detail}` : ""}). This is said once a day.`);
    }
    return { useGemini: true, why: r.failure };

    /** Once per month (once per day for Gemini); the flag is stored before the alert goes out. */
    async function say(what, total, text) {
      if (state.said[what]) return;
      state.said[what] = clock();
      await write(store, stateKey, state);
      if (typeof notify === "function") {
        try {
          await notify({ subject: `HD readings: ${text.split(":")[0]}: ${what}`, text: `${text}\n\nSpend this credit month: $${total.toFixed(2)} (counted by the shop).` });
        } catch {
          // An alert that cannot be sent never stops a reading.
        }
      }
    }
  };
}

/**
 * ONE RECORD PER ASK, NEVER A RUNNING TOTAL (10/24): readings written at the same time each read a total
 * and wrote it back, and the 36-chart proof counted $7 of ~$20 spent. Now every ask adds its own key,
 * its cost in millionths of a dollar at the end of the name, and the month's spend is the sum of one
 * listing. Nothing is rewritten, so nothing is lost.
 */
const SPEND = (month) => `claude-spend/${month}/`;

export async function addSpend(store, month, cost, at = Date.now()) {
  const micro = Math.max(0, Math.round(cost * 1e6));
  await write(store, `${SPEND(month)}${at}-${Math.random().toString(36).slice(2, 8)}-${micro}`, { cost });
}

export async function monthSpend(store, month) {
  try {
    const { blobs = [] } = (await store?.list?.({ prefix: SPEND(month) })) ?? {};
    return blobs.reduce((sum, b) => sum + (Number(String(b.key).split("-").pop()) || 0), 0) / 1e6;
  } catch {
    return 0;
  }
}

async function read(store, key) {
  try {
    return await store?.get?.(key, STRONG);
  } catch {
    return null;
  }
}

async function write(store, key, value) {
  try {
    await store?.setJSON?.(key, value);
  } catch {
    // The counter is a guide; a reading never waits on it.
  }
}
