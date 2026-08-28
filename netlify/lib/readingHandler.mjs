import { loadReading, readReadingLink } from "./reading.mjs";
import { TIERS } from "../../shared/pricing.mjs";

/**
 * Opening a reading link, with the store passed in.
 *
 * Written this way so the whole path can be tested without Netlify, without a
 * network and without a clock -- including the assertions that matter most
 * here, which are all about what a stranger holding a URL can get.
 *
 * THE LINK IS A BEARER TOKEN. Anyone holding it is the holder; there is no
 * login, and by design there never will be. That is the trade Jeremy chose
 * (D-9c): no accounts, no passwords, no customer database. What it costs is
 * that a forwarded link forwards the reading, which is why the link is short
 * (six days) while the reading is kept a year.
 *
 * So this endpoint's job is narrow and it should stay narrow: verify the
 * signature, load exactly what it names, and return nothing that was not paid
 * for.
 */

/**
 * WHAT IS NEVER RETURNED, however convenient it would be.
 *
 * The buyer's email and phone stay on the server. The page has no use for them
 * -- the re-send button says "send it to me" and the address is chosen by the
 * server, per D-9 -- and returning them would turn a link into a way to read
 * somebody's contact details. A link is guessable-adjacent in a way an account
 * is not, and the blast radius of a leaked one should be a chart, not an
 * identity.
 *
 * The NAME is returned, because it is what labels the page as theirs, and it is
 * the thing that makes keeping a birthday unnecessary.
 */
export async function handleReading({ body, store, secret, now = Date.now() }) {
  let request;
  try {
    request = JSON.parse(body);
  } catch {
    return json(400, { error: { code: "bad_json", message: "That request was not readable." } });
  }

  const token = request?.token;
  const link = readReadingLink(token, secret, now);
  if (!link.ok) {
    // ONE MESSAGE FOR EVERY WAY OF FAILING except expiry, which is the only one
    // a real person can act on. A forged signature and a reading that does not
    // exist must be indistinguishable, or the endpoint becomes a way to ask
    // whether a given reading exists.
    if (link.reason === "expired") {
      return json(410, {
        error: {
          code: "link_expired",
          message:
            "This link has expired — they last six days. Your reading is kept for a year, so it can be sent to you again.",
        },
      });
    }
    if (link.reason === "misconfigured") {
      return json(503, {
        error: { code: "misconfigured", message: "Readings are briefly unavailable. Please try again shortly." },
      });
    }
    return json(404, {
      error: { code: "not_found", message: "That link could not be opened." },
    });
  }

  const reading = await loadReading(store, link.id, now);
  // Same message as a bad signature, deliberately. A reading past its year and
  // a reading that never existed look identical from outside.
  if (!reading) {
    return json(404, { error: { code: "not_found", message: "That link could not be opened." } });
  }

  /**
   * THE LINK'S TIER AND THE STORED TIER MUST AGREE.
   *
   * They always do when both are minted by this system: a link is signed with
   * the tier of the reading it points at, and an upgrade produces a new reading
   * AND a new link rather than editing either.
   *
   * So a mismatch is not a case to handle gracefully by serving the lower of
   * the two -- it means something is wrong that this code does not understand,
   * and the safe response to that is to serve nothing. Trimming a response down
   * to a tier is the engine's job, done once, at purchase; re-implementing it
   * here would be a second boundary to keep in step with the first.
   */
  if (link.tier !== reading.tier) {
    console.log(`reading: tier mismatch, link ${link.tier} vs stored ${reading.tier}`);
    return json(404, { error: { code: "not_found", message: "That link could not be opened." } });
  }

  const next = reading.tier + 1;
  return json(200, {
    tier: reading.tier,
    // What they bought, in the words the site already uses for it.
    label: TIERS[reading.tier]?.label ?? null,
    name: reading.buyer?.name ?? null,
    purchasedAt: reading.purchasedAt,
    output: reading.output,
    /**
     * D-11: no upgrade offered at the top tier, because there is nothing above
     * it. Decided here rather than in the page, so that a page which forgets to
     * check cannot advertise something that does not exist -- and so the same
     * answer serves the email and the screen.
     */
    upgrade: next < TIERS.length ? { level: next, label: TIERS[next].label } : null,
    /** Whether a re-send has anywhere to go. The address itself never leaves. */
    canResend: Boolean(reading.buyer?.email),
  });
}

function json(status, payload) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // A reading is private and a link is a bearer token. No shared cache may
      // hold this, and no proxy may hand it to the next person along.
      "Cache-Control": "no-store, private",
    },
    body: JSON.stringify(payload),
  };
}
