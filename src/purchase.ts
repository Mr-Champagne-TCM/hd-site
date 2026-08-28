/**
 * Buying something, from the page's side.
 *
 * Three moments: sending somebody to Stripe, catching them when they come back,
 * and remembering what they bought for the rest of the visit.
 *
 * WHAT IS STORED, AND WHY IT IS sessionStorage. The grant, and nothing else. No
 * birth details, no email, no card anything -- those never reach this file and
 * two of them never reach the site at all.
 *
 * sessionStorage rather than localStorage because a grant lives about an hour
 * and belongs to this visit: it dies with the tab, which is the correct
 * lifetime for a bearer token on a shared or borrowed computer. localStorage
 * would leave it sitting there for the next person.
 *
 * Every read and write is wrapped, because private windows and locked-down
 * browsers throw on access rather than returning null, and a page that cannot
 * remember a purchase should still render.
 */

const KEY = "hd.grant";

export function heldGrant(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function holdGrant(grant: string): void {
  try {
    sessionStorage.setItem(KEY, grant);
  } catch {
    // A visit that cannot remember still works -- it just asks again.
  }
}

export function dropGrant(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * Send somebody to Stripe.
 *
 * The tier is sent; the PRICE IS NOT. What it costs is decided on the server
 * from the tier and from whatever grant is presented, so a page that lied about
 * the amount would be ignored. Any grant already held travels along, because
 * what has already been paid comes off what is paid next -- and the server
 * verifies it rather than believing it.
 */
export async function startCheckout(level: number): Promise<string | null> {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, grant: heldGrant() ?? undefined }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.url) {
    return (
      body?.error?.message ??
      "The payment page did not open just now. Nothing was charged — another try usually works."
    );
  }
  window.location.href = body.url;
  return null;
}

/**
 * Catch somebody coming back from Stripe.
 *
 * The return URL carries a session id, which proves nothing on its own -- it is
 * just a string in a URL. It is handed to the server, which asks Stripe whether
 * that session was actually paid for, and only then is a grant issued.
 *
 * The parameter is stripped from the address bar afterwards, so a reload does
 * not re-claim and a shared link does not carry somebody's purchase.
 */
export async function claimIfReturning(): Promise<
  { ok: true; level: number } | { ok: false; message: string } | null
> {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("paid");
  if (!id) return null;

  url.searchParams.delete("paid");
  window.history.replaceState({}, "", url.toString());

  try {
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: id }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.grant) {
      return {
        ok: false,
        message:
          body?.error?.message ??
          "That purchase could not be confirmed just now. It is safe — try reloading in a moment.",
      };
    }
    holdGrant(body.grant);
    return { ok: true, level: Number(body.level) };
  } catch {
    return {
      ok: false,
      message:
        "The connection dropped before that could be confirmed. Your purchase is safe — reloading usually finds it.",
    };
  }
}
