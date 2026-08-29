import { check, record } from "./ratelimit.mjs";
import { tierFor } from "./grant.mjs";
import { fillReading, loadReading, readReadingLink } from "./reading.mjs";
import { chartDifferences, describeDifferences, previousChart } from "./chartDiff.mjs";

/**
 * The free chart request, with the storage and the engine passed in.
 *
 * Written this way so the whole path can be tested without Netlify, without a
 * network and without a clock -- including the one assertion that matters most
 * in T-10: when someone is turned away, the ENGINE IS NEVER CALLED. That is the
 * entire point of putting the bouncer on the free door, and it is the sort of
 * thing that quietly stops being true after a refactor unless a test watches it.
 */

/** Birth data is never written down. Only these leave the request object. */
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
   * How a paid request that FAILED reaches somebody. Injected for the same
   * reason `deliver` is: the whole path stays testable without a network, and
   * the free path simply does not pass one.
   */
  report = null,
}) {
  let request;
  try {
    request = JSON.parse(body);
  } catch {
    return json(400, { error: { code: "bad_json", message: "That request was not readable. Please try again." } });
  }

  const birth = request?.birth;
  if (!birth || typeof birth !== "object") {
    return json(400, {
      error: { code: "no_birth", message: "A birth date, timezone, and whether the time is known are needed." },
    });
  }

  const key = await store.keyFor(ip);
  const hits = await store.load(key);

  const verdict = check(hits, now);
  if (!verdict.allowed) {
    // Nothing reaches the engine. No container starts, no chart is computed,
    // and no compute is spent on a request that was always going to be refused.
    return json(
      429,
      { error: { code: "rate_limited", message: verdict.message } },
      { "Retry-After": String(verdict.retryAfter) },
    );
  }

  await store.save(key, record(hits, now));

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
    return json(402, {
      error: {
        code: "payment_required",
        message:
          "This one needs to be paid for first. Nothing was charged just now, and your birth details were not stored.",
      },
    });
  }

  let upstream;
  try {
    upstream = await engine({ birth: scrubbed, tier: entitled.tier });
  } catch {
    return json(502, {
      error: {
        code: "engine_unreachable",
        message: "The chart service did not answer just now. Nothing was charged. Trying again usually works.",
      },
    });
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
     * Reported the moment it happens, and only for a request that arrived on a
     * PAID LINK. A stranger poking at the endpoint is not an incident; somebody
     * who has paid and been refused is.
     *
     * The upstream status and code travel. The birth moment does not.
     */
    if (readingLink.ok && typeof report === "function") {
      await report({
        kind: `chart-refused-${upstream.status}`,
        detail: `tier ${readingLink.tier}: ${upstream.payload?.error?.code ?? "unknown"}`,
      }).catch(() => {});
    }
    // The engine's own message is already written for a person to read, and
    // its codes are stable, so it is passed through rather than reworded.
    return json(upstream.status, upstream.payload);
  }

  /**
   * THE CHART IS PUT AWAY BEFORE IT IS HANDED OVER.
   *
   * Only when the request came in on a reading link -- that is the only case
   * where there is a paid record waiting for it. `fillReading` is write-once,
   * so a double-submitted form cannot replace a chart somebody has already
   * been sent.
   *
   * A storage failure does not fail the request. The person is waiting and the
   * chart is computed; handing it over is the thing that matters, and a
   * reading that was never stored can be recomputed from the same form.
   */
  /**
   * IS THIS THE SAME CHART THEY HAD LAST TIME?
   *
   * Asked BEFORE anything is filed or shown. Jeremy's instruction: "that message
   * should come before the output is shown, and allow chance to change or accept
   * their entries." A warning printed above a chart somebody is already reading
   * is not a choice, it is an apology.
   *
   * Only on an upgrade -- there has to be an earlier chart to differ from -- and
   * only until they say to go ahead. `accept` comes back on the second submit.
   *
   * Nothing extra is stored to make this work. The engine's outputs are already
   * kept; comparing two of them is exact rather than a guess about what somebody
   * typed.
   */
  if (readingLink.ok && readings && request?.accept !== true) {
    const previous = await previousChart(readings, {
      email: (await loadReading(readings, readingLink.id, now))?.buyer?.email ?? null,
      excludeId: readingLink.id,
      loadReading,
      now,
    }).catch(() => null);

    const changed = previous ? chartDifferences(previous.output, upstream.payload) : [];
    if (changed.length) {
      console.log(`chart: differs from the previous one (${changed.join(", ")})`);
      return json(409, {
        error: {
          code: "chart_differs",
          message:
            `This chart is not the same as the one you had. ${describeDifferences(changed)} ` +
            "changed, which means the birth details entered this time are different from last " +
            "time. Either can be the right one — a time that was guessed before and is known " +
            "now would do exactly this.",
          changed,
          previous: summaryOf(previous.output),
          computed: summaryOf(upstream.payload),
        },
      });
    }
  }

  if (readingLink.ok && readings) {
    try {
      const filled = await fillReading(readings, readingLink.id, upstream.payload, now);
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
        await deliver({ id: readingLink.id, tier: filled.tier }).catch((e) =>
          console.log(`chart: ready-email failed (${e.message})`),
        );
      }
    } catch (e) {
      console.log(`chart: could not store the reading (${e.message})`);
    }
  }

  return json(200, upstream.payload);
}

function json(status, payload, headers = {}) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
    body: JSON.stringify(payload),
  };
}

/**
 * The few values worth putting side by side. Not the whole output and never the
 * drawing -- this is a comparison, and a comparison nobody can read is not one.
 */
function summaryOf(output) {
  return {
    type: output?.type ?? null,
    profile: output?.profile ?? null,
    authority: output?.authority ?? null,
    definition: output?.definition ?? null,
    incarnationCross: output?.incarnationCross ?? null,
    definedCenters: output?.definedCenters ?? [],
    channels: output?.channels ?? [],
  };
}
