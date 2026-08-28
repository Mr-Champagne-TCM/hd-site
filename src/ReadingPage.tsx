import { useEffect, useState } from "react";
import Summary, { type SummaryData } from "./Summary";
import Bodygraph from "./Bodygraph";

/** The forwarding address, never the personal inbox (D-12). */
const CONTACT = "hd-readings@thechampagnemethod.co";
import EntryForm from "./entry/EntryForm";
import ReadingActions, { Resend } from "./ReadingActions";

/**
 * What a delivery link opens.
 *
 * The page a buyer lands on from their email, and the only page they ever need
 * again -- D-11's one URL does view, re-send and upgrade, and what appears here
 * is decided entirely by what the server says the link is worth.
 *
 * NOTHING IS DECIDED IN THE BROWSER. The tier, the label, whether an upgrade
 * exists, whether a re-send has anywhere to go -- all of it arrives from
 * /api/reading. A page that worked out its own upgrade offer could advertise a
 * tier that does not exist, and a page that chose its own tier would be asking
 * a question the server already answered.
 *
 * THE TOKEN IS READ FROM THE PATH AND POSTED IN A BODY. It stays out of query
 * strings, so it stays out of Referer headers on the way to the library links
 * below -- which are the whole reason this page has outbound links at all.
 */

type Reading = {
  pending: boolean;
  tier: number;
  label: string | null;
  name: string | null;
  purchasedAt: number;
  output: SummaryData;
  upgrade: { level: number; label: string } | null;
  canResend: boolean;
};

type State =
  | { at: "loading" }
  | { at: "ready"; reading: Reading }
  | { at: "failed"; message: string; expired: boolean };

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-brand-gold/40 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
      {children}
    </p>
  );
}

export default function ReadingPage({ token }: { token: string }) {
  const [state, setState] = useState<State>({ at: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/reading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setState({
            at: "failed",
            expired: body?.error?.code === "link_expired",
            message: body?.error?.message ?? "That link could not be opened.",
          });
          return;
        }
        setState({ at: "ready", reading: body as Reading });
      } catch {
        if (!alive) return;
        setState({
          at: "failed",
          expired: false,
          message:
            "The connection dropped before your reading arrived. Nothing is lost — reloading usually finds it.",
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const shell = "page-bottom mx-auto max-w-3xl px-6 pt-16 sm:px-8";

  if (state.at === "loading") {
    return (
      <div className={shell}>
        <p className="text-[17px] text-brand-muted">Finding your reading…</p>
      </div>
    );
  }

  if (state.at === "failed") {
    return (
      <div className={shell}>
        <h1 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
          {state.expired
            ? "This link has finished its six days"
            : "That link could not be opened"}
        </h1>
        <div className="mt-5 max-w-[60ch]">
          <Panel>{state.message}</Panel>
        </div>
        {/*
          An expired link is not a dead end and must not read as one, so the way
          back is on the page rather than left for somebody to find. A link that
          simply could not be opened gets no such offer -- there is nothing to
          send, and offering would imply we know who they are.
        */}
        {/*
          AN EXPIRED LINK FIXES ITSELF (D-13). Jeremy's call: "if they can do it
          themselves ... this is best."

          The button works because an expired link is not a broken one -- the
          signature still names a real reading and still proves the holder was
          given it legitimately. Only the clock ran out. A fresh link goes to
          the address on the purchase, so the worst this button can do in the
          wrong hands is send somebody their own reading.

          Writing in is kept as the fallback for the case the button cannot
          cover -- a purchase with no address on it -- and it names the
          forwarding address, never the personal inbox.

          A link that merely could not be opened gets none of this. There is
          nothing to send, and offering would imply we know who they are.
        */}
        {state.expired && (
          <div className="mt-8 max-w-[60ch]">
            <p className="text-[16px] leading-relaxed text-brand-muted">
              A fresh one can be sent right now — to the address on your
              purchase, and only there. As many times as you need, for the whole
              year.
            </p>
            <div className="mt-4">
              <Resend token={token} />
            </div>
            <p className="mt-6 text-[15px] leading-relaxed text-brand-muted">
              If that does not reach you,{" "}
              <a
                href={`mailto:${CONTACT}`}
                className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4"
              >
                {CONTACT}
              </a>{" "}
              is read by Jeremy.
            </p>
          </div>
        )}
      </div>
    );
  }

  const { reading } = state;

  /**
   * PAID, AND NOT YET TOLD US WHEN THEY WERE BORN.
   *
   * The ordinary state of every purchase for the minute or two between the
   * card and the form -- and it can last much longer, because somebody is free
   * to close the tab and come back a week later from the email.
   *
   * The SAME EntryForm the offer page uses, handed the token. One form, so the
   * date rules, the place search and the clock cannot behave differently
   * depending on which door somebody came in through.
   */
  if (reading.pending) {
    return (
      <div className="mx-auto max-w-3xl">
        <EntryForm
          readingToken={token}
          tier={reading.tier}
          name={reading.name}
          upgrade={reading.upgrade}
          canResend={reading.canResend}
        />
      </div>
    );
  }

  return (
    <div className={shell}>
      <h1 className="font-display text-[clamp(1.7rem,4vw,2.25rem)] font-medium leading-[1.15] tracking-tight text-brand-gold">
        {reading.name ? `${reading.name}’s Human Design` : "Your Human Design"}
      </h1>
      {reading.label && (
        <p className="mt-2 font-sans text-[13px] uppercase tracking-[0.16em] text-brand-muted">
          {reading.label}
        </p>
      )}

      {/*
        The picture first, when there is one -- it is what somebody recognises
        as their chart, and the summary reads as its caption. Absent on the
        summary tier, where nothing renders here at all: no placeholder, no
        greyed frame. A locked box is an advert wearing a product's clothes.
      */}
      {reading.output?.bodygraphSvg !== undefined && (
        <div className="mt-8">
          <Bodygraph
            svg={reading.output.bodygraphSvg}
            alt={
              reading.name ? `${reading.name}’s bodygraph` : "Your bodygraph"
            }
          />
        </div>
      )}

      <div className="mt-8">
        <Summary data={reading.output} />
      </div>

      <ReadingActions
        token={token}
        upgrade={reading.upgrade}
        canResend={reading.canResend}
        tier={reading.tier}
        mechanics={reading.output}
      />
    </div>
  );
}
