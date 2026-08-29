import { useState } from "react";
import { SITE } from "./copy";
import { startCheckout } from "./purchase";
import { TIERS } from "../shared/pricing.mjs";
import {
  AUTHORITY_NOTES,
  STRATEGY_NOTES,
  TYPE_NOTES,
  describe,
} from "./mechanics";

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

export type Upgrade = { level: number; label: string; available?: boolean } | null;

/** "The reading" -> "the reading", so it can sit inside a sentence. */
function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export default function ReadingActions({
  token,
  upgrade,
  canResend,
  tier = 0,
  mechanics,
  writing = false,
}: {
  token: string;
  upgrade: Upgrade;
  canResend: boolean;
  /** The PDF is the chart tier and above; the summary was never sold one. */
  tier?: number;
  /** Paid for words that are not written yet. The PDF would be short of them. */
  writing?: boolean;
  /** Type, Strategy and Authority, for the sentences about each. */
  mechanics?: { type?: string; strategy?: string; authority?: string } | null;
}) {
  /**
   * A LINE ON WHAT EACH OF THE THREE ACTUALLY IS.
   *
   * Jeremy asked for it on the chart tier. Each stops at the MECHANISM -- what
   * the thing is and how it works -- and none of them gives advice, because
   * the interpretation is what the reading tier is, and this must not quietly
   * become a free version of it.
   *
   * A value with no note renders nothing rather than something generic. A
   * sentence that fits every Type is a sentence about nobody.
   */
  const notes = mechanics
    ? (
        [
          ["Type", mechanics.type, describe(TYPE_NOTES, mechanics.type)],
          [
            "Strategy",
            mechanics.strategy,
            describe(STRATEGY_NOTES, mechanics.strategy),
          ],
          [
            "Authority",
            mechanics.authority,
            describe(AUTHORITY_NOTES, mechanics.authority),
          ],
        ] as const
      ).filter(([, value, note]) => value && note)
    : [];

  return (
    <div className="mt-12 space-y-10 border-t border-brand-gold/15 pt-10">
      {notes.length > 0 && (
        <section>
          <h2 className="font-display text-[20px] font-medium text-brand-paper">
            What these three mean
          </h2>
          <div className="mt-4 space-y-5">
            {notes.map(([label, value, note]) => (
              <div key={label}>
                <p className="font-sans text-[13px] uppercase tracking-[0.14em] text-brand-muted">
                  {label} · <span className="text-brand-gold">{value}</span>
                </p>
                <p className="mt-1 max-w-[62ch] text-[16px] leading-relaxed text-brand-paper/85">
                  {note}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        {/*
          THE LABEL SAYS THESE ARE FREE, the heading keeps the voice.

          Jeremy's note was about the email -- the two links read as something
          load-bearing, as though the reading needed them -- and the page had
          the same problem for the same reason. The email's label is reused
          verbatim so a reader meeting both does not meet two framings.
        */}
        <p className="font-sans text-[12px] uppercase tracking-[0.18em] text-brand-teal">
          Resources — free in the library
        </p>
        <h2 className="mt-2 font-display text-[20px] font-medium text-brand-paper">
          Making sense of it
        </h2>
        <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">
          Both written for exactly this moment.
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
          {/*
            NAMES THE TIER. "If you would like the rest of it" assumed the
            reader knows what "it" is -- Jeremy: "we have been swimming in this
            topic so we know all too well what 'it' is. Pretend they don't."
          */}
          <h2 className="font-display text-[20px] font-medium text-brand-paper">
            If you would like {lowerFirst(upgrade.label)}
          </h2>
          {/*
            WHAT IS ACTUALLY IN IT, not just its name. "The reading goes
            further" tells somebody nothing they can decide on -- Jeremy asked
            for the upgrade to sit "under a teaser or description of what is in
            next tier", which is the difference between an offer and a nudge.

            The words come from shared/pricing.mjs, the same blurb the offer
            page shows. A tier described in two places is a tier that will
            eventually be described two ways.
          */}
          <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-brand-paper/85">
            {TIERS[upgrade.level]?.blurb}
          </p>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-brand-muted">
            What you have already paid comes off what you pay next — nobody pays
            twice for the same thing.
          </p>
          {/*
            NO BUTTON FOR A TIER THAT CANNOT BE BOUGHT.

            This offered "The reading" to every chart buyer, including while the
            offer page said in plain words that it is not ready. The button ran
            straight into the checkout function's own refusal -- an error, at
            the exact moment somebody was trying to give money.

            The server says whether it is available; this only renders it. The
            sentence that replaces the button is the offer page's, so the two
            surfaces say the same thing about the same tier.
          */}
          {upgrade.available === false ? (
            <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-brand-muted">
              It is not ready to buy yet — the written interpretation is still
              being made. Your credit keeps, and this link is how you come back
              to it.
            </p>
          ) : (
            <button
              type="button"
              /*
                TO THE TILES, NOT STRAIGHT TO STRIPE.

                Jeremy walked this with his own card: one press and he was on a
                payment page, at full price, with no chance to see what the
                other tiers were or pick a different one. `/u/<token>` shows the
                same tiles with his credit already applied.
              */
              onClick={() => {
                window.location.href = `/u/${encodeURIComponent(token)}`;
              }}
              className="mt-4 rounded-full bg-brand-teal px-6 py-3 font-sans text-[16px] font-semibold text-[#0d1b1a] shadow-lg shadow-brand-teal/25 transition-all duration-200 hover:-translate-y-0.5"
            >
              {upgrade.label}
            </button>
          )}
        </section>
      )}

      {tier >= 1 && (
        <section>
          <h2 className="font-display text-[20px] font-medium text-brand-paper">
            The one you keep
          </h2>
          <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">
            Your chart and the values behind it, as a PDF — the same drawing, at
            print size. Take it now, or have the link emailed and come back to
            it later.
          </p>
          {/*
            NOT WHILE THE READING IS STILL BEING WRITTEN.

            Jeremy, mid-walkthrough: "i downloaded PDF while processing and it
            came out short of the reading info." Of course it did -- the builder
            puts in what is filed, and at that moment the words are not filed
            yet. So he was handed a two-page chart PDF for a reading he had paid
            forty-four dollars for, with nothing on it to say why.

            That is the worst kind of fault: it succeeds. There is no error to
            read, no retry offered, and the file looks finished. Somebody who
            saves it and closes the tab has quietly lost the thing they bought.

            The button is not hidden, because a control that vanishes reads as
            something taken away. It is disabled and it says what it is waiting
            for, so the wait is legible rather than mysterious.
          */}
          {writing ? (
            <>
              <span
                aria-disabled="true"
                className="mt-4 inline-block cursor-not-allowed rounded-full border border-brand-gold/20 px-5 py-2.5 font-sans text-[15px] text-brand-gold/40"
              >
                Download the PDF
              </span>
              <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-brand-muted">
                Ready once your reading is written — it goes in the PDF, and a
                copy taken now would be missing it.
              </p>
            </>
          ) : (
            /*
              A plain link, not a fetch-and-blob. A browser downloads what it
              navigates to; building the file in the page and handing it to a
              synthetic anchor is more moving parts and it breaks on a phone.
            */
            <a
              href={`/api/pdf?t=${encodeURIComponent(token)}`}
              className="mt-4 inline-block rounded-full border border-brand-gold/50 px-5 py-2.5 font-sans text-[15px] text-brand-gold transition-colors hover:bg-brand-gold/10"
            >
              Download the PDF
            </a>
          )}
        </section>
      )}

      {/*
        "EMAIL ME THIS LINK" IS GONE FROM THIS PAGE.

        Jeremy, standing on a page he had reached BY that link: "it already is
        in a place they can find. Only path to this link is through the vehicle
        it offers. remove."

        Right. The button was designed when the email WAS the delivery -- press
        it and the reading arrives. Now the link opens this page and everything
        is already on it, so the button offers to send somebody a copy of the
        thing they are holding. It also threaded a duplicate into the original
        email, which looks like a fault whichever way you read it.

        `Resend` itself STAYS, and is still exported: an EXPIRED link has no
        page to stand on, and asking for a fresh one is the only way back (D-13).
        That is the case it was really for.
      */}

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
 * "Email me this link."
 *
 * NOT "send it to". The address is never typed here and never sent from here —
 * it is the one on the purchase, chosen by the server (D-9). That distinction
 * is the whole difference between a convenience and a way to have somebody
 * else's reading mailed to you.
 *
 * AND NOT "again", which is what it said first. Jeremy, reading it on a chart
 * he had just made: "this seems awkward... 'again'? they haven't gotten it
 * sent once yet." He was right -- the delivery email is sent at PURCHASE, when
 * there is no chart in it, so the first time somebody presses this it is the
 * first send of anything worth keeping. One wording that is true whenever it
 * is read beats two wordings that need a state to choose between them.
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
        Your reading is kept for a year, so the link can be sent to you whenever
        you need it — to the address on your purchase, and only there.
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
          {state === "sending" ? "Sending…" : "Email me this link"}
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
