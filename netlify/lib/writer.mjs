import { askClaude } from "./claude.mjs";

/**
 * WHO WRITES EACH ASK (10/23, Jeremy's T4 + T5 plan: "This is the new approach"; Gemini dropped 10/25:
 * "drop gemini").
 *
 *   1. Claude Opus 5.5 FAST, effort medium, the ask's own limit (90 s a draft). 36 test charts: 89%
 *      first try, ~45 s a reading, ~$0.57.
 *   2. Fast busy (429 / 5xx) or refused, or this credit month's spend at SWITCH_AT or more: Opus at NORMAL
 *      speed, effort medium, NORMAL_MS to answer (~2 min, ~$0.27).
 *   3. Claude cannot write it at all (no key, out of credit, a refusal, a rejected key, a key from any
 *      account but the live one, still busy at normal speed): { ok: false, reason: "claude", detail }.
 *      NOTHING ELSE WRITES IT. The reading waits ("being written", then "taking longer than it should"),
 *      the job files a claude-unavailable incident (Jeremy is paged, failures.mjs), and the writer is rung
 *      again (ring.mjs) and swept every fifteen minutes until Claude answers.
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
 * OUT OF CREDIT IS CHECKED AGAIN EVERY HOUR (10/25 pre-deploy audit): with no other writer, a flag that
 * held until the next credit month would keep readings waiting after Jeremy raised the limit. Between
 * checks no ask is made, so the sweep does not spend fifteen-minute rings on refusals.
 *
 * ALERTS, each once per credit month: the switch to normal speed, `limit` - NEAR_GAP spent (the hd-live
 * workspace limit, HD_CLAUDE_LIMIT, $170: the $190 alert could never fire under it), out of credit, the
 * wrong account. Every reading Claude could not write is also an incident of its own (failures.mjs).
 */

export const SWITCH_AT = 130;
export const CREDIT_DAY = 16;
export const LIMIT = 170;
export const NORMAL_MS = 150_000;
export const OUT_RECHECK_MS = 60 * 60_000;
const ASK_MS = 90_000;
const NEAR_GAP = 20;

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
 * The longest one ask can take, for interpretJob's budget: the fast ask's limit, then the normal-speed
 * ask's (a busy or refused fast ask is asked again at once at normal speed).
 */
export function worstWriterAsk(ms) {
  return ms + normalLimit(ms);
}

/**
 * The writer gemini.mjs calls for each ask: ({ instruction, user, schema, timeoutMs }) resolves to
 * { ok: true, text, by }, { ok: false, reason: "timeout", detail } (the job asks again, longer), or
 * { ok: false, reason: "claude", detail } (Claude cannot write it now; the reading waits).
 */
export function claudeWriter({
  apiKey,
  store,
  notify,
  switchAt = SWITCH_AT,
  creditDay = CREDIT_DAY,
  limit = LIMIT,
  expectOrg = null,
  blockOrgs = [],
  clock = Date.now,
  ask = askClaude,
}) {
  const unavailable = (detail) => ({ ok: false, reason: "claude", detail });
  const nearAt = limit - NEAR_GAP;
  return async ({ instruction, user, schema, timeoutMs }) => {
    if (!apiKey) return { ok: false, reason: "misconfigured", detail: "no Claude key (HD_ANTHROPIC_KEY)" };
    // The Claude writer fills the reading form; letter mode (a prompt with no form) has no writer.
    if (!schema) return { ok: false, reason: "misconfigured", detail: "letter mode: the stored prompt asks for no form" };
    const month = creditMonth(clock(), creditDay);
    const stateKey = `claude-state/${month}`;
    const state = { out: false, said: {}, ...((await read(store, stateKey)) ?? {}) };
    if (state.out && clock() - (Number(state.outAt) || 0) < OUT_RECHECK_MS) {
      return unavailable(`out of credit this month (checked again ${new Date((Number(state.outAt) || 0) + OUT_RECHECK_MS).toISOString().slice(11, 16)} UTC)`);
    }
    const spent = await monthSpend(store, month);

    let fast = spent < switchAt;
    let r = await ask({ apiKey, instruction, user, schema, fast, timeoutMs: fast ? timeoutMs : normalLimit(timeoutMs) });
    if (!r.ok && (r.failure === "busy" || r.failure === "rejected") && fast) {
      // T4: the same ask again at once, at normal speed, with the time a normal one needs. A fast ask
      // REFUSED (a 400 because the account can't use fast mode, say) gets the same one normal try
      // (10/25 pre-deploy audit: the live account had never made a fast call).
      fast = false;
      r = await ask({ apiKey, instruction, user, schema, fast: false, timeoutMs: normalLimit(timeoutMs) });
    }

    if (r.ok && r.org && (blockOrgs.includes(r.org) || (expectOrg && r.org !== expectOrg))) {
      await say("org", spent, `Claude writer: the key answered for the wrong Anthropic account (${String(r.org).slice(0, 8)}...). Readings wait until HD_ANTHROPIC_KEY is the TCM hd-live key.`);
      return unavailable("wrong claude account");
    }
    if (r.ok) {
      await addSpend(store, month, r.cost, clock());
      if (state.out) {
        // Credit is back (a raised limit, a top-up): the hourly check found it.
        state.out = false;
        await write(store, stateKey, state);
      }
      const now = spent + r.cost;
      if (spent < switchAt && now >= switchAt) {
        await say("switch", now, `Claude writer: $${now.toFixed(2)} of this month's credit used, so readings now go to Opus at normal speed (~2 min each) until the credit renews on the ${creditDay}th.`);
      }
      if (spent < nearAt && now >= nearAt) {
        await say("near", now, `Claude writer: $${now.toFixed(2)} used this month, $${NEAR_GAP} from the $${limit} hd-live limit. At the limit readings wait until it is raised or the credit renews on the ${creditDay}th.`);
      }
      return { ok: true, text: r.text, by: fast ? "claude-fast" : "claude-normal" };
    }
    if (r.failure === "timeout") return { ok: false, reason: "timeout", detail: r.detail };

    if (r.failure === "outOfCredit") {
      state.out = true;
      state.outAt = clock();
      await write(store, stateKey, state);
      await say("out", spent, `Claude writer: this month's Claude credit is used up ($${spent.toFixed(2)} counted). Readings wait, and are written as soon as Claude answers again (checked every hour): raise the hd-live limit in the Claude Console, or the credit renews on the ${creditDay}th.`);
      return unavailable("out of credit this month");
    }
    return unavailable(`${r.failure}${r.detail ? `: ${r.detail}` : ""}`);

    /** Once per credit month; the flag is stored before the alert goes out. */
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
