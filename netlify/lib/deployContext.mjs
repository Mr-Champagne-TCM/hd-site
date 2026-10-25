/**
 * WHICH DEPLOY IS THIS, and may it page Jeremy? (batch-1024 item 4)
 *
 * Every deploy of the site -- production, a draft, a deploy preview, a branch
 * deploy -- reads and writes the SAME blob stores. On 10/23 at 21:47 a draft
 * deployed without secrets filed a "places-misconfigured" incident, severity
 * page-jeremy, into the live health store: an alarm about a deploy no buyer
 * can reach. So only production files page-jeremy incidents and sends alerts;
 * any other context says so in its function log and nothing more.
 *
 * WHAT A RUNNING FUNCTION CAN SEE. Build variables do not reach a function at
 * runtime (places.mjs found DEPLOY_ID and COMMIT_REF missing in production,
 * 9/8), and CONTEXT is one of those, so it is only a fallback here. What a v2
 * function does get is its context object: `context.deploy.context` is
 * "production", "deploy-preview", "branch-deploy" or "dev" (Netlify's
 * Functions API), and Netlify's global `Netlify.context` carries the same
 * while a request is being handled. The deploy context is fixed for a deploy,
 * so the first one a function instance is handed (guard() passes it here) holds
 * for every later call in that instance, including the code paths that are
 * never handed the context object themselves.
 *
 * Nothing known at all -- the tests, the local rig -- counts as production, as
 * before this change: a monitor that goes quiet because it could not tell
 * where it runs is the failure this whole watcher exists to prevent.
 */

let seen = null;

/** Remember the deploy context a function was handed (`context.deploy.context`). `null` forgets (tests). */
export function noteDeployContext(context) {
  if (context === null) {
    seen = null;
    return;
  }
  const c = context?.deploy?.context;
  if (typeof c === "string" && c) seen = c;
}

/** The deploy context, from whichever source has it, or null when none does. */
export function deployContext(env = process.env) {
  if (seen) return seen;
  try {
    const g = globalThis.Netlify?.context?.deploy?.context;
    if (typeof g === "string" && g) return g;
  } catch {
    /* outside a request the global may refuse; the env var is next */
  }
  const e = env?.CONTEXT;
  return typeof e === "string" && e ? e : null;
}

/** May this deploy file page-jeremy incidents and send alerts? Production, or unknown. */
export function mayPage(env = process.env) {
  const c = deployContext(env);
  return c === null || c === "production";
}
