import { useState } from "react";
import { SITE } from "./copy";
import { startCheckout } from "./purchase";

/**
 * What now — the block under a finished reading.
 *
 * ONE COPY, USED BY BOTH SCREENS. There are two ways to arrive at a finished
 * reading: submitting the form, and opening the link again later. They were two
 * different screens, and it showed — the freshly-submitted one had "Start a new
 * chart" and nothing else, while the returning one had the library links, the
 * upgrade and the re-send. Jeremy asked for those on the first screen too, and
 * the honest way to give him that is to stop having two.
 *
 * "Start a new chart" is gone from here entirely. It belongs on the free page,
 * where somebody is trying the thing; on a reading somebody has paid for it is
 * an invitation to leave.
 */

export type Upgrade = { level: number; label: string } | null;

export default function ReadingActions({
  token,
  upgrade,
  canResend,
  tier = 0,
}: {
  token: string;
  upgrade: Upgrade;
  canResend: boolean;
  /** The PDF is the chart tier and above; the summary was never sold one. */
  tier?: number;
}) {
  return (
    <div className="mt-12 space-y-10 border-t border-brand-gold/15 pt-10">
      <section>
        <h2 className="font-display text-[20px] font-medium text-brand-paper">
          Making sense of it
        </h2>
        <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">
          Both free in the library, and written for exactly this moment.
        </p>
        {/*
          rel="noreferrer" on every outbound link. The token IS this page's
          address bar, and a Referer header would hand it to whatever is on the
          other end. Both go to our own site, which is precisely why it would
          have gone unnoticed.
        */}
        <div className="mt-4 space-y-3">
          <Resource
            href={SITE.hd101}
            title="Human Design, plainly"
            blurb="What the system is, what it is not, and every word in your reading explained."
          />
          <Resource
            href={SITE.bodygraph}
            title="Reading your bodygraph"
            blurb="The picture itself — what the shapes mean, and why some are filled and some are not."
          />
        </div>
      </section>

      {upgrade && (
        <section>
          <h2 className="font-display text-[20px] font-medium text-brand-paper">
            If you would like the rest of it
          </h2>
          <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">
            {upgrade.label} goes further, and what you have already paid comes
            off what you pay next.
          </p>
          <button
            type="button"
            onClick={() => startCheckout(upgrade.level)}
            className="mt-4 rounded-full bg-brand-teal px-6 py-3 font-sans text-[16px] font-semibold text-[#0d1b1a] shadow-lg shadow-brand-teal/25 transition-all duration-200 hover:-translate-y-0.5"
          >
            {upgrade.label}
          </button>
        </section>
      )}

      {tier >= 1 && (
        <section>
          <h2 className="font-display text-[20px] font-medium text-brand-paper">
            The one you keep
          </h2>
          <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">
            Your chart and the values behind it, as a PDF — the same drawing, at
            print size.
          </p>
          {/*
            A plain link, not a fetch-and-blob. A browser downloads what it
            navigates to; building the file in the page and handing it to a
            synthetic anchor is more moving parts and it breaks on a phone.
          */}
          <a
            href={`/api/pdf?t=${encodeURIComponent(token)}`}
            className="mt-4 inline-block rounded-full border border-brand-gold/50 px-5 py-2.5 font-sans text-[15px] text-brand-gold transition-colors hover:bg-brand-gold/10"
          >
            Download the PDF
          </a>
        </section>
      )}

      {canResend && <Resend token={token} />}

      <section>
        <p className="text-[15px] leading-relaxed text-brand-muted">
          The rest of the practice is at{" "}
          <a
            href={SITE.home}
            rel="noreferrer"
            className="text-brand-gold underline decoration-brand-gold/40 underline-offset-4"
          >
            The Champagne Method
          </a>
          , if you would like to look around.
        </p>
      </section>
    </div>
  );
}

function Resource({
  href,
  title,
  blurb,
}: {
  href: string;
  title: string;
  blurb: string;
}) {
  return (
    <p>
      <a
        href={href}
        rel="noreferrer"
        className="font-sans text-[17px] font-semibold text-brand-teal underline decoration-brand-teal/30 underline-offset-4"
      >
        {title}
      </a>
      <span className="block text-[15px] leading-relaxed text-brand-muted">
        {blurb}
      </span>
    </p>
  );
}

/**
 * "Send it to me again."
 *
 * NOT "send it to". The address is never typed here and never sent from here —
 * it is the one on the purchase, chosen by the server (D-9). That single word
 * is the whole difference between a convenience and a way to have somebody
 * else's reading mailed to you.
 */
function Resend({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  );

  async function send() {
    setState("sending");
    try {
      const res = await fetch("/api/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <section>
      <h2 className="font-display text-[20px] font-medium text-brand-paper">
        Keeping it
      </h2>
      <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">
        Your reading is kept for a year, so it can be sent again whenever you
        need it — to the address on your purchase, and only there.
      </p>
      {state === "sent" ? (
        <p className="mt-4 text-[16px] text-brand-teal">
          On its way. It goes to the address you bought it with.
        </p>
      ) : (
        <button
          type="button"
          onClick={send}
          disabled={state === "sending"}
          className="mt-4 rounded-full border border-brand-teal/50 px-5 py-2.5 font-sans text-[15px] text-brand-teal transition-colors hover:bg-brand-teal/10 disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Send it to me again"}
        </button>
      )}
      {state === "failed" && (
        <p className="mt-3 text-[15px] text-brand-muted">
          That did not go through just now. Nothing has changed about your
          reading, and trying again usually works.
        </p>
      )}
    </section>
  );
}

export { Resend };
