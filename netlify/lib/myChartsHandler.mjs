import { chartsForEmail, emailKey, normaliseEmail } from "./charts.mjs";
import { mintReadingLink } from "./reading.mjs";
import { myChartsEmail } from "./myChartsEmail.mjs";
import { customerError } from "./failures.mjs";

/**
 * "EMAIL ME MY CHARTS" (release 2, Jeremy 10/20: "3B now").
 *
 * Somebody who bought before types the email they used; a fresh link to each
 * person's chart bought with it goes TO THAT INBOX -- and nowhere else, and
 * nothing at all is shown on the page. Jeremy's calls, each one here:
 *
 *   the same answer       "Sent" whether or not that address has charts, so
 *                         the page cannot be used to learn who bought here
 *   only to that address  the links go to the typed address, and only charts
 *                         whose purchase address IS that address are listed
 *   one link per person   an upgraded chart once, at the tier it has now
 *   a rate limit          per visitor and per address, so nobody can bury an
 *                         inbox (the same reasoning as "Email me this link")
 *   start a new chart     both emails link to the start of a new chart; the
 *                         "none under this email" one links back here too
 *
 * Everything is injected, as the resend handler does, so the whole path is
 * tested without Netlify, a network, a key or a real minute passing.
 */

export const VISITOR_LIMITS = [
  { name: "burst", ms: 10 * 60_000, max: 5 },
  { name: "day", ms: 86_400_000, max: 20 },
];
/** Per address: three in ten minutes covers a typo and a spam-folder doubt. */
export const ADDRESS_LIMITS = [
  { name: "burst", ms: 10 * 60_000, max: 3 },
  { name: "day", ms: 86_400_000, max: 6 },
];
const HORIZON = 86_400_000;

function overLimit(hits, now, limits) {
  for (const l of limits) {
    if (hits.filter((t) => now - t < l.ms).length >= l.max) return l;
  }
  return null;
}
const prune = (hits, now) => hits.filter((t) => now - t < HORIZON);

export async function handleMyCharts({
  body,
  readings,
  index,
  counters,
  visitorKey,
  secret,
  send,
  origin,
  links,
  now = Date.now(),
  note = async () => {},
}) {
  const fail = async (kind, detail) => {
    try {
      await note(kind, { detail });
    } catch {
      /* never fails the person asking */
    }
    const { status, payload } = customerError(kind);
    return json(status, payload);
  };

  try {
    return await run();
  } catch (e) {
    return fail("mycharts-store-unavailable", `store failed (${e?.name ?? "Error"})`);
  }

  async function run() {
    if (!secret) return fail("mycharts-misconfigured", "GRANT_SECRET unusable");
    let request;
    try {
      request = JSON.parse(body);
    } catch {
      return fail("mycharts-bad-email", "body is not json");
    }
    const email = normaliseEmail(request?.email);
    if (!email) return fail("mycharts-bad-email", "not an address");

    // Both limits are charged BEFORE anything is looked up, and the address
    // limit counts every ask for that address -- charts or none -- so being
    // turned away says nothing about whether it has charts.
    const vKey = `mv:${visitorKey}`;
    const aKey = `ma:${emailKey(email, secret)}`;
    const vHits = await counters.load(vKey);
    if (overLimit(vHits, now, VISITOR_LIMITS)) return fail("mycharts-too-many", "visitor limit");
    const aHits = await counters.load(aKey);
    if (overLimit(aHits, now, ADDRESS_LIMITS)) return fail("mycharts-too-many", "address limit");
    await counters.save(vKey, prune([...vHits, now], now));
    await counters.save(aKey, prune([...aHits, now], now));

    const found = await chartsForEmail({ readings, index, email, secret, now });
    const charts = found.map(({ reading, id }) => ({
      reading,
      url: `${origin}/r/${mintReadingLink({ id, tier: reading.tier, now }, secret)}`,
    }));

    const { subject, html, text } = myChartsEmail({ charts, links, origin });
    let sent;
    try {
      sent = await send({ to: email, subject, html, text });
    } catch (e) {
      sent = { ok: false, reason: e?.name ?? "threw" };
    }
    // Logged without the address, and without saying whether it had charts.
    console.log(`my-charts: email ${sent?.ok ? "sent" : `failed (${sent?.reason})`}`);
    if (!sent?.ok) return fail("mycharts-email-failed", `${sent?.reason ?? "unknown"}`);

    // THE SAME ANSWER EITHER WAY. Nothing about what was found.
    return json(200, { sent: true });
  }
}

function json(status, payload) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
    body: JSON.stringify(payload),
  };
}
