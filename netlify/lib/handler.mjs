import { check, record } from "./ratelimit.mjs";
import { tierFor } from "./grant.mjs";
import { fillReading, loadReading, readReadingLink } from "./reading.mjs";
import { buildCorrection, historyEntry } from "./correction.mjs";
import { customerError, engineKind } from "./failures.mjs";
import { measureSpread } from "./birthSpread.mjs";

/**
 * The free chart request, with the storage and the engine passed in.
 *
 * Written this way so the whole path can be tested without Netlify, without a
 * network and without a clock -- including the one assertion that matters most
 * in T-10: when someone is turned away, the ENGINE IS NEVER CALLED. That is the
 * entire point of putting the bouncer on the free door, and it is the sort of
 * thing that quietly stops being true after a refactor unless a test watches it.
 */

/**
 * Only these travel on to the ENGINE. The place NAME never does: the engine
 * needs the zone, not the town.
 *
 * Since 16 October 2026 (Jeremy: "a veer from our initial approach") a PAID
 * chart keeps its birth details with the reading -- date, time or unknown,
 * the place as picked, the zone -- so the PDF can print the birth line. That
 * is `fillReading`'s job and `birthRecord` decides the fields; nothing here
 * writes them anywhere else, and a refused or free request keeps nothing.
 */
const ALLOWED_BIRTH_FIELDS = ["date", "time", "zone", "timeKnown", "utc"];

export async function handleChart({
  body,
  ip,
  now,
  store,
  engine,
  grantSecret,
  paywall = false,
  readings = null,
  /**
   * Sends the "it is ready" email. Injected so the whole path stays testable
   * without a network or a key, and OPTIONAL so the free summary path -- which
   * has nobody to write to -- simply does not pass one.
   */
  deliver = null,
  /**
   * How a failure reaches the record: `{ kind, detail, paid }`, with `kind`
   * from netlify/lib/failures.mjs. Every failure on this path is noted --
   * the severity decides whether anybody is emailed -- and the customer gets
   * the catalogue's sentence for that kind, never the engine's own words.
   * Injected so the whole path stays testable without a network.
   */
  report = null,
  /**
   * The engine's other door, POST /v1/spread (engine 0.6.0): the noon chart's
   * spread through the birth day, for an unknown birth time. Same answer shape
   * as `engine` ({ ok, status, payload }). OPTIONAL: without it, an unknown
   * time is charted with the engine's note, as before.
   */
  spread = null,
}) {
  const note = async (kind, detail, paid = false, ref = null) => {
    if (typeof report !== "function") return;
    try {
      await report({ kind, detail, paid, ...(ref ? { ref } : {}) });
    } catch {
      /* a reporter that fails must never fail the person waiting */
    }
  };
  const fail = (kind, { paid = false, ...opts } = {}, headers = {}) => {
    const { status, payload } = customerError(kind, { paid, ...opts });
    return json(status, payload, headers);
  };

  let request;
  try {
    request = JSON.parse(body);
  } catch {
    await note("chart-bad-request", "body is not json");
    return fail("chart-bad-request", { code: "bad_json" });
  }

  /**
   * THE RECORD THIS FORM IS FILLING, read once, up front (release 2). An
   * upgrade carries its chart's kept details, so "These are right -- make my
   * reading" sends no birth at all (`kept: true`): the record's own details
   * are used, exactly as they are kept. A typed birth on a record that already
   * has details is a CORRECTION ("Change a detail").
   */
  const early = readReadingLink(request?.reading, grantSecret, now);
  let filling = null;
  if (early.ok && readings) {
    try {
      filling = await loadReading(readings, early.id, now);
    } catch {
      filling = null;
    }
  }
  const useKept = request?.kept === true;
  const birth = useKept
    ? filling?.pending && filling.birth
      ? { ...filling.birth }
      : null
    : request?.birth;
  if (!birth || typeof birth !== "object") {
    await note("chart-bad-request", "no birth object");
    return fail("chart-bad-request", { code: "no_birth" });
  }

  /**
   * THE COUNTER FAILS OPEN. It protects the engine from strangers; a counter
   * store that will not answer is our problem, and turning the customer away
   * for it would make it theirs.
   */
  let key = null;
  let hits = [];
  try {
    key = await store.keyFor(ip);
    hits = await store.load(key);
  } catch (e) {
    key = null;
    await note("chart-rate-store", `counter read failed (${e?.name ?? "Error"})`);
  }

  const verdict = check(hits, now);
  if (!verdict.allowed) {
    // Nothing reaches the engine. No container starts, no chart is computed,
    // and no compute is spent on a request that was always going to be refused.
    await note("chart-rate-limited", `limit ${verdict.limit?.name ?? "?"}`);
    return fail(
      "chart-rate-limited",
      { message: verdict.message },
      { "Retry-After": String(verdict.retryAfter) },
    );
  }

  if (key !== null) {
    try {
      await store.save(key, record(hits, now));
    } catch (e) {
      await note("chart-rate-store", `counter write failed (${e?.name ?? "Error"})`);
    }
  }

  // Only the named fields travel on. A caller cannot smuggle an extra field
  // through this into the engine, and nothing else is ever read off the object.
  const scrubbed = {};
  for (const f of ALLOWED_BIRTH_FIELDS) {
    if (birth[f] !== undefined) scrubbed[f] = birth[f];
  }

  /**
   * What this request is entitled to.
   *
   * Read from the presented grant, not from anything the caller asked for --
   * a request cannot name its own tier, which is the whole reason `tier` was
   * hardcoded here before there was anything better. Now it is derived.
   *
   * The refusal happens BEFORE the engine call, deliberately, for the same
   * reason the rate limiter does: work that will not be delivered should not
   * be done, and an unpaid request must not cost us compute.
   */
  /**
   * A READING LINK IS ALSO AN ENTITLEMENT, and the stronger of the two.
   *
   * Somebody arriving from their delivery email has a signed link and no
   * grant -- the grant lived in the tab they closed. The link says which tier
   * was paid for just as authoritatively, because it was signed by us at the
   * moment the money settled.
   *
   * Checked BEFORE the grant, and its tier wins, so a stale low grant left in
   * a tab cannot quietly downgrade what somebody actually bought.
   */
  const readingLink = readReadingLink(request?.reading, grantSecret, now);
  const entitled = readingLink.ok
    ? { tier: readingLink.tier, via: "link" }
    : tierFor({ token: request?.grant, paywall, secret: grantSecret, now });
  if (entitled.tier === null) {
    await note("chart-payment-required", `grant ${entitled.reason ?? "missing"}`);
    return fail("chart-payment-required");
  }

  /** Money has been taken for this one, so every failure below weighs more. */
  const paid = readingLink.ok;
  const tierNote = `tier ${entitled.tier}${paid ? ", paid link" : ""}`;
  /** WHICH reading, for an alert (10/16): the id and tier the link was signed with. */
  const ref = paid ? { reading: readingLink.id, tier: readingLink.tier } : null;

  let upstream;
  try {
    upstream = await engine({ birth: scrubbed, tier: Math.max(entitled.tier, 1) });
    if (entitled.tier === 0 && upstream?.ok && upstream.payload) upstream = { ...upstream, payload: summaryOnly(upstream.payload) };
  } catch (e) {
    /**
     * SLOW AND DOWN ARE TOLD APART. The engine call carries its own deadline
     * (chart.mjs), so a cold or stuck engine is answered by us -- calmly --
     * instead of by Netlify's function timeout, which the page cannot read.
     */
    const kind = e?.name === "AbortError" || e?.name === "TimeoutError" ? "engine-timeout" : "engine-unreachable";
    await note(kind, `${tierNote}: ${e?.name ?? "Error"}`, paid, ref);
    return fail(kind, { paid });
  }

  if (!upstream.ok) {
    /**
     * A PAID REQUEST THAT THE ENGINE REFUSED IS AN INCIDENT, not just a reply.
     *
     * This is the failure that cost a real purchase. Jeremy bought the reading
     * tier and the engine answered "This key reaches tier 1. Tier 2 was asked
     * for." -- the site's ceiling and the engine key's cap are two numbers in
     * two repositories that must move together, and only one of them did. The
     * money was taken and nothing was delivered, and the only reason anybody
     * found out is that he was the buyer.
     *
     * Now noted for EVERY request, at a severity that depends on whether money
     * was taken (netlify/lib/failures.mjs): a paid buyer refused pages Jeremy,
     * a stranger's typo is counted as noise.
     *
     * The upstream status and code travel. The birth moment does not.
     *
     * AND THE ENGINE'S OWN WORDS NO LONGER REACH THE CUSTOMER. They were
     * written for a developer -- "This key reaches tier 1. Tier 2 was asked
     * for.", "Use HH:MM in 24-hour time" -- and the buyer read them verbatim.
     * A typo the customer can fix gets a plain request to check that one
     * field; anything on our side gets "something on our side is slow".
     */
    const kind = engineKind(upstream.status, upstream.payload?.error?.code);
    await note(kind, `${tierNote}: engine ${upstream.status} ${upstream.payload?.error?.code ?? "unknown"}`, paid, ref);
    return fail(kind, { paid });
  }

  /**
   * AN UNKNOWN BIRTH TIME, MEASURED (Jeremy 10/22). Asked ONCE, here, when the
   * noon chart is made, and kept with it (`timeSpread` rides in the output, so
   * the record, the page and the PDF all have it). One engine call: the engine
   * casts the birth day itself (netlify/lib/birthSpread.mjs). It is asked at
   * the chart's own tier, so it carries no stretch of a value this chart does
   * not show, and it holds no birth field -- minutes of the day and values.
   *
   * A spread that cannot be had never stops the chart: the page then says what
   * it said before (the engine's note; Type, Authority and Profile provisional)
   * and Jeremy hears of it.
   */
  if (typeof spread === "function" && scrubbed.timeKnown === false && scrubbed.date && scrubbed.zone && upstream.payload) {
    try {
      const got = await measureSpread({ ask: spread, birth: scrubbed, tier: Math.max(entitled.tier, 1), chart: upstream.payload });
      if (got.spread) upstream.payload.timeSpread = got.spread;
      else await note("chart-time-spread", `${tierNote}: ${got.why}`, paid, ref);
    } catch (e) {
      await note("chart-time-spread", `${tierNote}: ${e?.name ?? "Error"}`, paid, ref);
    }
  }

  /**
   * THE CHART IS PUT AWAY BEFORE IT IS HANDED OVER.
   *
   * Only when the request came in on a reading link -- that is the only case
   * where there is a paid record waiting for it. `fillReading` is write-once,
   * so a double-submitted form cannot replace a chart somebody has already
   * been sent.
   *
   * A storage failure is retried once and then answered honestly (below): the
   * buyer keeps the form as they filled it, and is told their purchase is safe.
   */
  /**
   * "THIS IS NOT THE CHART YOU HAD BEFORE" IS RETIRED (release 2, Jeremy 10/19:
   * "retire no longer needed"). It compared an upgrade's freshly typed details
   * with the chart before, because nothing was kept. Now the details ARE kept
   * and carried to the upgrade, so the buyer confirms them ("These are right")
   * or corrects them ("Change a detail") -- a correction is theirs to make, and
   * it is kept as their new, accurate details with the old ones in the
   * record's history. The reading then says calmly what changed. Nothing here
   * stops a chart any more; a request's old `accept` flag is simply ignored.
   */

  if (readingLink.ok && readings) {
    /**
     * ONE MORE TRY, THEN SAY SO (10/16). A paid chart that could not be filed
     * used to be logged and handed over anyway -- and the page then sent the
     * buyer to their reading link, which, still pending, showed them an EMPTY
     * form to fill in again. Now the store gets a second chance, and if that
     * fails too the buyer stays on the form with everything they typed, is
     * told their purchase is safe, and Jeremy is paged.
     */
    const birthKept = {
      date: birth.date,
      time: birth.time,
      timeKnown: birth.timeKnown,
      zone: birth.zone,
      place: birth.place,
      // The optional name for the chart (fix 17A, 10/19): kept with the birth
      // details for the title; never in ALLOWED_BIRTH_FIELDS, so never sent on.
      name: birth.name,
    };

    /**
     * A CORRECTION, OR DETAILS TYPED ONCE (release 2). Worked out from the
     * record read above -- never from anything the page claims.
     *
     *   kept details, confirmed      nothing new to note; a correction the
     *                                chart it grew from had travels with it
     *   kept details, typed again    a correction: the old details go to the
     *                                record's history, and the reading gets a
     *                                calm note of what changed
     *   an upgrade with NO kept      an older summary, typed once: the reading
     *   details (older summary)      says only whether the chart moved
     *
     * The chart it is compared with is the one it grew from.
     */
    let extra = {};
    if (filling?.pending && !useKept && (filling.birth || filling.grewFrom)) {
      let before = null;
      if (filling.grewFrom) {
        try {
          before = (await loadReading(readings, filling.grewFrom, now))?.output ?? null;
        } catch {
          before = null;
        }
      }
      if (filling.birth) {
        const entry = historyEntry({ was: filling.birth, now: birthKept, at: now });
        const correction = buildCorrection({ type: "correction", was: filling.birth, now: birthKept, before, after: upstream.payload, at: now });
        extra = { history: entry ? [entry] : null, correction };
      } else {
        extra = { correction: buildCorrection({ type: "first-details", before, after: upstream.payload, at: now }) };
      }
    } else if (filling?.pending && useKept && filling.grewFrom) {
      /**
       * Kept details, confirmed, on an upgrade of a chart that was CORRECTED:
       * the correction travels with it, so the reading keeps "Your correction"
       * (W15, 10/21 live test: Maya's vanished once her chart became a reading).
       * Nothing new is worked out; the chart's own note is carried.
       */
      try {
        const source = await loadReading(readings, filling.grewFrom, now);
        if (source?.correction) extra = { correction: source.correction };
      } catch {
        /* a note is a nicety; the chart is not held up for it */
      }
    }

    let filled;
    let lastError = null;
    for (let attempt = 0; attempt < 2 && !filled; attempt++) {
      try {
        filled = await fillReading(readings, readingLink.id, upstream.payload, now, birthKept, extra);
      } catch (e) {
        lastError = e;
      }
    }
    if (!filled) {
      console.log(`chart: could not store the reading (${lastError?.message})`);
      await note("chart-not-saved", `${tierNote}: ${lastError?.name ?? "Error"}`, true, ref);
      return fail("chart-not-saved", { paid: true });
    }
    if (!filled.ok) {
      console.log(`chart: reading not filled (${filled.reason})`);
    } else if (deliver) {
      /**
       * THE SECOND EMAIL, and the one that is actually worth keeping.
       *
       * The first goes out when the card clears and contains a door to a
       * FORM -- there is no chart in it, because there is no chart yet.
       * Jeremy, having just made one: "as soon as the bodygraph is shown, an
       * email should be in flight with link/code, right? I didn't get one."
       *
       * Right. So one goes now, and because the reading is filled it says
       * "Access your Human Design chart" rather than "Create and view".
       *
       * Sent only on a FIRST fill. `fillReading` is write-once, so a second
       * submission returns `already_filled` and lands in the branch above --
       * which means a double-tapped form cannot send a second email either.
       *
       * A failure here does not fail the chart. The person is looking at it.
       */
      try {
        // ONE "READY" EMAIL ON THE READING TIER (fix 4A, 10/19): it goes when
        // the words are written (interpret.mjs), not now. `deliver` still runs
        // so the writer is rung; it sends nothing at tier 2.
        await deliver({ id: readingLink.id, tier: filled.tier });
      } catch (e) {
        console.log(`chart: ready-email failed (${e?.message})`);
        await note("ready-email", `${tierNote}: ${e?.name ?? "Error"}`, true);
      }
    }
  }

  return json(200, upstream.payload);
}

/**
 * THE SUMMARY'S SHARE OF A CHART (Jeremy 10/22: "gates/channels go to summary
 * (with no explanation)"; "chart option should only show the BG as upgrade").
 *
 * The engine's tier 0 answer has no channels and no gates, so the summary asks
 * for the chart tier's answer and keeps, beside the chart-level values, only
 * the channel list (as the chart names them, "1-8 (Inspiration)") and the
 * activated gate numbers. NEVER the drawing: the bodygraph and its PDF are
 * what the chart tier adds, so they are dropped here, before the record is
 * written and before the page is answered. Nothing else of the chart tier's
 * answer (its channel directions) travels either; a field is kept only by name.
 */
const SUMMARY_FIELDS = [
  "type", "strategy", "authority", "profile", "definition", "notSelfTheme", "signature", "incarnationCross",
  "definedCenters", "undefinedCenters", "openCenters", "timeKnown", "chartedAt", "note", "provisional",
  "engineVersion", "computedAt",
  // new at the summary, 10/22: values only, no explanation
  "channels", "activatedGates",
];

export function summaryOnly(payload) {
  const out = {};
  for (const k of SUMMARY_FIELDS) if (payload[k] !== undefined) out[k] = payload[k];
  return out;
}

function json(status, payload, headers = {}) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
    body: JSON.stringify(payload),
  };
}
