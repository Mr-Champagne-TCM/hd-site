import { getStore } from "@netlify/blobs";
import { interpretOne } from "../lib/interpretJob.mjs";
import { promptProblem } from "../lib/interpretation.mjs";
import { PROMPT_STORE, generateReading, loadPrompt } from "../lib/gemini.mjs";
import { claudeWriter } from "../lib/writer.mjs";
import { alertSender, noteFailure } from "../lib/failures.mjs";
import { loadReading } from "../lib/reading.mjs";
import { deliveryEmail } from "../lib/deliveryEmail.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";
import { TRIGGER_HEADER, triggerOk, triggerToken } from "../lib/trigger.mjs";
import { RERING_GAP_MS, reringIfDue, reringWorth } from "../lib/ring.mjs";
import { untilText } from "../lib/writingLock.mjs";

/**
 * THE WRITER. Runs when there is something to write, not on a timer.
 *
 * A BACKGROUND FUNCTION, and that is what makes on-demand possible. The ten
 * second limit that pushed this onto a schedule applies to SYNCHRONOUS
 * functions; a background function answers 202 at once and then has fifteen
 * minutes. Jeremy asked the obvious question -- "why can't sweeper wake up on
 * call?" -- and the answer was that it can, and that I had reached for the
 * always-works option without checking whether the better one was available.
 *
 * What that buys: a buyer waits as long as the model takes, rather than that
 * plus whatever was left on the minute. And nothing wakes 43,200 times a month
 * to discover there is no work.
 *
 * IT STILL DRAINS EVERYTHING PENDING rather than only the purchase that woke
 * it. A trigger can be missed -- a crash between filing the chart and firing
 * the request, a deploy mid-flight -- and a job that only ever serves its own
 * caller leaves those stranded forever. `sweep` calls this on a slow schedule
 * for exactly that reason, and finding nothing is the normal case.
 *
 * SAFE TO RUN TWICE is what makes both of those safe: writing is write-once, so
 * a second pass over the same purchase stops.
 */
export default async (request) => {
  /**
   * Fifteen minutes is the background function's hard limit. Every reading is
   * handed this deadline (interpretJob starts an ask only when its worst case
   * still ends before it), so a slow Google can no longer run the job past it.
   */
  const deadline = Date.now() + 14 * 60 * 1000;
  const grantSecret = process.env.GRANT_SECRET;
  /**
   * TWO KEYS OPEN THIS DOOR. The sweep inside Netlify derives its token from
   * GRANT_SECRET. The cron outside Netlify (.github/workflows/ring-writer.yml)
   * derives its own from RING_SECRET, a value that exists only to ring this
   * function -- because GRANT_SECRET signs every reading link and storage key
   * and cannot be handed to a second platform, let alone rotated.
   */
  const rung =
    triggerOk(request.headers.get(TRIGGER_HEADER), grantSecret) ||
    triggerOk(request.headers.get(TRIGGER_HEADER), process.env.RING_SECRET);
  if (!rung) {
    /**
     * A background function's path is on the public internet like any other.
     * The job is idempotent, so this is not a door to anything -- but two
     * invocations racing on one purchase both call Google, and only one answer
     * is ever kept. The other is billed and discarded.
     */
    console.log("interpret: refused (bad or missing trigger)");
    return new Response(null, { status: 404 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const mailKey = process.env.RESEND_API_KEY;
  const origin = process.env.URL || "https://humandesign.thechampagnemethod.co";
  /**
   * CLAUDE WRITES, GEMINI CATCHES (10/23, Jeremy's T4 + T5 plan; writer.mjs). HD_ANTHROPIC_KEY is the
   * TCM "hd-live" workspace key -- deliberately NOT named ANTHROPIC_API_KEY, which Netlify's AI Gateway
   * fills with its own paid key when it is unset. HD_WRITER=gemini is the off switch. No key, or the
   * switch off, and every reading is written by Gemini exactly as before.
   */
  const claudeKey = process.env.HD_WRITER === "gemini" ? null : process.env.HD_ANTHROPIC_KEY || null;

  if (!apiKey && !claudeKey) {
    console.log("interpret: no GEMINI_API_KEY or HD_ANTHROPIC_KEY, nothing to do");
    return new Response(null, { status: 204 });
  }

  const store = getStore({ name: "readings", consistency: "strong" });
  const health = getStore({ name: "health", consistency: "strong" });
  const writer = claudeKey
    ? claudeWriter({
        apiKey: claudeKey,
        store: health,
        notify: alertSender(mailKey),
        ...(Number(process.env.HD_CLAUDE_SWITCH_AT) > 0 ? { switchAt: Number(process.env.HD_CLAUDE_SWITCH_AT) } : {}),
        ...(Number(process.env.HD_CREDIT_DAY) > 0 ? { creditDay: Number(process.env.HD_CREDIT_DAY) } : {}),
        expectOrg: process.env.HD_ANTHROPIC_ORG || null,
        blockOrgs: (process.env.HD_ANTHROPIC_BLOCK_ORGS || "").split(",").map((s) => s.trim()).filter(Boolean),
      })
    : null;

  /**
   * One reading, written. The named purchase and the drain share this exactly.
   *
   * ONE WRITER PER READING (decision 23, 10/23): `lock` is where the reading's
   * "writing" lock lives -- the health store, strong consistency, beside the
   * ring gates. A run that finds another run writing the same reading does
   * nothing for it and says so below (interpretJob.mjs, writingLock.mjs).
   */
  const run = (id) =>
    interpretOne({
      id,
      store,
      health,
      lock: health,
      apiKey,
      prompt,
      grantSecret,
      origin,
      deliver: { email: readyEmail(mailKey), alert: alertSender(mailKey) },
      deadline,
      ...(writer ? { generate: (output, opts) => generateReading(output, { ...opts, writer }) } : {}),
    });
  /** What a run that found another writer on the reading says. */
  const elsewhere = (r) => `another run is writing it (writing lock ${untilText(r.until)}); this one does nothing`;

  /**
   * IS THE CONFIGURED PROMPT THE ONE THIS CODE EXPECTS?
   *
   * The prompt is configuration -- it cannot be committed to a public repo --
   * so it can fall behind the validator. A prompt missing a heading fails EVERY
   * reading, for every buyer, with a message about the model rather than about
   * the configuration. Checked once, before any request, so the answer is one
   * alert naming what is missing instead of a trickle of "malformed" that looks
   * like Google having a bad week.
   */
  const prompt = await loadPrompt({
    store: getStore({ name: PROMPT_STORE, consistency: "strong" }),
  });
  const wrong = promptProblem(prompt);
  if (wrong) {
    console.log(`interpret: ${wrong}`);
    await noteFailure(health, "reading-prompt", {
      detail: wrong,
      send: alertSender(mailKey),
      site: origin,
    });
    return new Response(null, { status: 204 });
  }

  /**
   * THE ONE THAT WOKE US, FIRST -- BEFORE ANY SCAN.
   *
   * `pending()` below lists the readings store and loads every blob in it. That
   * is a round trip per reading ever sold, and it used to sit in front of the
   * generation the buyer is watching a page for. It is a safety net for missed
   * triggers, not a step in the happy path, so it happens AFTERWARDS now.
   *
   * The id is a queue position and nothing more. `interpretOne` refuses
   * anything that is not a paid reading tier with a chart and no words, so an
   * id that named somebody else's purchase would either do the work that was
   * already owed or do nothing at all. The trigger token is the door; this is
   * only the order things are done in.
   */
  let first = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.id === "string" && body.id) first = body.id;
  } catch {
    /* no body is the ordinary case for `sweep`, which has no one purchase */
  }

  const done = new Set();
  // Readings this run could not write, for ringing the writer again soon (ring.mjs reringIfDue).
  const unwritten = [];
  if (first) {
    const r = await run(first);
    done.add(first);
    if (!r.ok && reringWorth(r.reason)) unwritten.push(first);
    console.log(
      `interpret: named ${first} -> ${r.ok ? `written (${r.asks} asks, ${r.partAsks} for parts)` : r.reason === "writing_elsewhere" ? elsewhere(r) : r.reason}`,
    );
  }

  let waiting;
  try {
    waiting = (await pending(store)).filter((id) => !done.has(id));
  } catch (e) {
    console.log(`interpret: could not read the store (${e.message})`);
    await noteFailure(health, "interpret-store", { detail: `list failed (${e?.name ?? "Error"})` });
    await ringSoon(unwritten);
    return new Response(null, { status: 204 });
  }

  if (!waiting.length) {
    console.log(`interpret: nothing else waiting (wrote ${done.size ? 1 : 0})`);
    await ringSoon(unwritten);
    return new Response(null, { status: 204 });
  }

  /**
   * A BUDGET RATHER THAN A COUNT. Fifteen minutes is the hard limit and a
   * generation takes tens of seconds, so this stops well short and leaves the
   * rest to the next run. Being cut off mid-write would throw away a
   * generation that has already been paid for.
   */
  const BUDGET_MS = 10 * 60 * 1000;
  const started = Date.now();
  let wrote = 0;

  for (const id of waiting) {
    if (Date.now() - started > BUDGET_MS) {
      console.log(`interpret: out of budget, ${waiting.length - wrote} still waiting`);
      break;
    }
    const result = await run(id);
    if (result.ok) wrote += 1;
    else {
      if (reringWorth(result.reason)) unwritten.push(id);
      console.log(`interpret: skipped one (${result.reason === "writing_elsewhere" ? elsewhere(result) : result.reason})`);
    }
  }

  console.log(
    `interpret: ${waiting.length} waiting, wrote ${wrote}${done.size ? " (+1 named)" : ""}`,
  );
  await ringSoon(unwritten);
  return new Response(null, { status: 204 });

  /**
   * RETRY SOONER (Jeremy 10/23, ring.mjs RERINGS): a reading this run could not
   * write rings the writer again RERING_GAP_MS from now instead of waiting for
   * the sweep -- ONE ring per run, for the first such reading whose count
   * allows it (the next run drains every other reading still waiting, so two
   * rings would only race each other). Only while the gap and the ring still
   * fit well inside this function's fifteen minutes.
   */
  async function ringSoon(ids) {
    if (!ids.length) return;
    const token = triggerToken(grantSecret);
    if (!token) return;
    if (Date.now() + RERING_GAP_MS + 30_000 > deadline + 60_000) {
      console.log("interpret: no time left to ring again; the sweep will");
      return;
    }
    await new Promise((r) => setTimeout(r, RERING_GAP_MS));
    for (const id of ids) {
      const out = await reringIfDue({
        id,
        gate: health,
        ring: async (named) => {
          const res = await fetch(`${origin}/api/interpret`, {
            method: "POST",
            headers: { [TRIGGER_HEADER]: token, "Content-Type": "application/json" },
            body: JSON.stringify({ id: named }),
          });
          console.log(`interpret: rang the writer again for an unwritten reading -> ${res.status}`);
        },
      }).catch(() => ({ rang: false }));
      if (out.rang) return;
      // Decision 23: another run took the reading in the gap; it re-rings for itself if it must.
      if (out.writing) console.log(`interpret: no re-ring for ${id}: another run is writing it (writing lock ${untilText(out.writing)})`);
    }
    console.log("interpret: nothing to ring again (rings used up, or another run is writing); the sweep carries on");
  }
};

/** Reading-tier purchases that have a chart and no words yet, oldest first. */
async function pending(store) {
  const listed = await store.list();
  const found = [];
  for (const blob of listed?.blobs ?? []) {
    // Other keys share this store; anything that is not a reading is skipped.
    const r = await loadReading(store, blob.key).catch(() => null);
    if (r && r.tier >= 2 && !r.pending && !r.reading) {
      found.push({ id: blob.key, at: r.purchasedAt ?? 0 });
    }
  }
  // Whoever has been waiting longest is served first.
  return found.sort((a, b) => a.at - b.at).map((f) => f.id);
}

/**
 * "Your reading is ready." The same delivery email the chart uses, so the two
 * messages are one design rather than two.
 */
function readyEmail(apiKey) {
  if (!apiKey) return undefined;
  return async ({ to, name, chartName = null, url, tier, someoneNew = false, redone = false }) => {
    if (!to) return;
    const { subject, html, text } = deliveryEmail({ tier, name, chartName, url, links: SITE, pending: false, someoneNew, redone });
    const sent = await sendMail({ to, subject, html, text }, { apiKey });
    console.log(`interpret: ready-email ${sent.ok ? "sent" : `failed (${sent.reason})`}`);
    // Thrown so interpretJob files it as reading-ready-email (10/16: this
    // failure used to be a log line nobody read). The reason, never the address.
    if (!sent.ok) throw new Error(`ready-email ${sent.reason}`);
  };
}

/**
 * Background, so the caller is answered at once and this gets fifteen minutes
 * rather than ten seconds. The path is what `chart` and `sweep` call.
 */
export const config = { background: true, path: "/api/interpret" };
