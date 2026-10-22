import { useEffect, useState } from "react";
import { customerText } from "../shared/customerMessages.mjs";
import { type SummaryData } from "./Summary";
import Bodygraph from "./Bodygraph";
import ChartKey from "./ChartKey";
import Glance from "./Glance";
import StartHere, { type ReadingView } from "./StartHere";
import type { Activation } from "./Activations";

/** The forwarding address, never the personal inbox (D-12). */
const CONTACT = "hd-readings@thechampagnemethod.co";
import EntryForm from "./entry/EntryForm";
import ReadingActions, { Resend, pdfLabel, PDF_BUTTON } from "./ReadingActions";
import ThreeLines from "./ThreeLines";
import CoachCard from "./CoachCard";
import { chartTitle } from "../shared/chartName.mjs";
import { PageEnd } from "./FooterTheme";
import WrittenReading, { ReadingInOrder, type Written } from "./WrittenReading";
import { ConfirmKept, ReadingNotes } from "./Returning";
import { TimeNote } from "./TimeSpread";

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
  /** Whose chart: the name typed on the birth form (fix 17A), else the buyer's. */
  name: string | null;
  /** Pending only: what the form's "Name for this chart" starts with. */
  chartName?: string | null;
  /** The PDF's real page count (fix 9A), when there is one to download. */
  pdfPages?: number | null;
  purchasedAt: number;
  output: SummaryData & { personality?: Activation[]; design?: Activation[] };
  upgrade: { level: number; label: string; available?: boolean } | null;
  canResend: boolean;
  written: Written | null;
  notes: Record<string, Array<[string, string]>> | null;
  /** The PDFs' order, when the reading lays out that way (Jeremy 10/16). */
  view?: ReadingView | null;
  /** "December 14, 1976 · 6:18 PM · Chicago, Illinois", when kept (no time zone since fix 20A). */
  birthLine?: string | null;
  /** Paid for words the sweeper has not written yet. */
  writing: boolean;
  // --- release 2 ---------------------------------------------------------------
  /** "Alex": the name on the chart, else the buyer's first name. */
  whose?: string | null;
  /** Pending upgrade: its chart's kept details, to confirm rather than retype. */
  kept?: { date: string; time: string | null; timeKnown: boolean; place: string | null; zone: string; name?: string; birthLine?: string | null } | null;
  grewFrom?: { tier: number; label: string | null; chart: string | null; definedCenters: string[] } | null;
  typeOnce?: boolean;
  fresh?: boolean;
  /** This link was signed for an earlier tier and opens the chart it grew into. */
  grown?: { fromTier: number; fromLabel: string | null } | null;
  /** The calm note after a correction (shared/correctionNote.mjs words it). */
  correction?: unknown;
};

type State =
  | { at: "loading" }
  | { at: "ready"; reading: Reading }
  /**
   * `ours`: the failure is on our side (the store, the configuration, the
   * connection), so the page says the reading is SAFE rather than that the
   * link could not be opened -- the second reads as the customer's problem,
   * and it is not one (10/16).
   */
  | { at: "failed"; message: string; expired: boolean; ours: boolean };

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-brand-gold/40 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
      {children}
    </p>
  );
}

export default function ReadingPage({ token }: { token: string }) {
  const [state, setState] = useState<State>({ at: "loading" });
  /** "Change a detail" on the confirm screen (release 2): the kept details, as a form. */
  const [correcting, setCorrecting] = useState(false);

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
          // No readable answer at all is ours too: the function fell over.
          const ours = res.status >= 500 || !body?.error;
          setState({
            at: "failed",
            expired: body?.error?.code === "link_expired",
            ours,
            message: body?.error?.message ?? customerText(ours ? "reading-unavailable" : "reading-link-bad"),
          });
          return;
        }
        setState({ at: "ready", reading: body as Reading });
      } catch {
        if (!alive) return;
        setState({
          at: "failed",
          expired: false,
          ours: true,
          message: customerText("reading-connection-dropped"),
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  /**
   * WHILE THE READING IS BEING WRITTEN, KEEP LOOKING.
   *
   * The page fetched once and never again. It said "your reading is being
   * written now", the writer finished a minute later, and the page went on
   * saying it -- Jeremy watched exactly that happen: the server had all eleven
   * sections while the screen still showed the panel. A page that tells
   * somebody to wait and then does not change is a page that looks broken at
   * the moment it is actually working.
   *
   * Only while `writing` is true, so a finished reading costs nothing. Every
   * three seconds, which is far below how long a generation takes and far above
   * anything that would trouble a function.
   *
   * IT WAS SIX. Jeremy timed the whole wait at about a minute and a half, and
   * up to six of those seconds were this page simply not having asked yet --
   * the reading was finished and sitting on the server. Halving it is the
   * cheapest second or two available: at three seconds a two-minute wait costs
   * forty requests, against a free tier of 125,000 a month.
   *
   * IT GIVES UP AFTER TEN MINUTES rather than polling a dead purchase forever.
   * By then something has gone wrong that this cannot fix, and the alert has
   * already reached Jeremy -- so the page says so plainly instead of spinning.
   */
  const writing = state.at === "ready" && state.reading.writing;
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!writing || gaveUp) return;
    let alive = true;
    const startedAt = Date.now();
    const GIVE_UP_MS = 10 * 60 * 1000;

    const timer = setInterval(async () => {
      if (Date.now() - startedAt > GIVE_UP_MS) {
        if (alive) setGaveUp(true);
        return;
      }
      try {
        const res = await fetch("/api/reading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok || !alive) return;
        const body = (await res.json()) as Reading;
        // Only ever swap FORWARD. A blip that answered "still writing" must not
        // take a reading back off the screen once it has arrived.
        if (alive && body && !body.writing) setState({ at: "ready", reading: body });
      } catch {
        /* a missed poll is a missed poll; the next one is three seconds away */
      }
    }, 3000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [writing, gaveUp, token]);

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
            : state.ours
              ? "Your reading is safe"
              : "That link could not be opened"}
        </h1>
        <div className="mt-5 max-w-[60ch]">
          <Panel>
            {/* The panel does not open by repeating the heading above it (W6). The
                message keeps it for where it stands alone, under "Email me this link". */}
            {!state.expired && !state.ours
              ? state.message.replace(/^That link could not be opened\.\s*/, "")
              : state.message}
          </Panel>
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
        {/*
          A LINK THAT COULD NOT BE OPENED (Jeremy 10/5, "5a"): nothing is sent
          from here -- a bad link proves nothing about who holds it -- but the
          way to a person and the way to the readings are both on the page.
        */}
        {state.ours && (
          <div className="mt-8 max-w-[60ch]">
            <p className="text-[16px] leading-relaxed text-brand-muted">
              If it still does not appear,{" "}
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
        {!state.expired && !state.ours && (
          <div className="mt-8 max-w-[60ch]">
            <p className="text-[16px] leading-relaxed text-brand-muted">
              If this link came with a purchase,{" "}
              <a
                href={`mailto:${CONTACT}`}
                className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4"
              >
                {CONTACT}
              </a>{" "}
              is read by Jeremy.
            </p>
            <p className="mt-4 text-[16px] leading-relaxed text-brand-muted">
              The readings, and what each one includes, are{" "}
              <a
                href="/"
                className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4"
              >
                here
              </a>
              .
            </p>
          </div>
        )}
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
        {/* The footer theme (Jeremy 10/17): every state of this page ends the same way. */}
        <PageEnd />
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
    /**
     * AN UPGRADE WITH KEPT DETAILS (release 2, mock v2 step 2): nothing to
     * type -- the kept birth line, one look, three ways on. "Change a detail"
     * opens the same form prefilled, as a CORRECTION by the same person.
     */
    if (reading.kept && !correcting) {
      return (
        <div className="mx-auto max-w-3xl">
          <ConfirmKept
            token={token}
            tier={reading.tier}
            whose={reading.whose ?? null}
            fromTier={reading.grewFrom?.tier ?? null}
            birthLine={reading.kept.birthLine ?? null}
            chart={reading.grewFrom?.chart ?? null}
            definedCenters={reading.grewFrom?.definedCenters ?? []}
            onChange={() => {
              setCorrecting(true);
              window.scrollTo({ top: 0 });
            }}
          />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl">
        <EntryForm
          readingToken={token}
          tier={reading.tier}
          name={reading.name}
          chartName={reading.chartName ?? null}
          upgrade={reading.upgrade}
          canResend={reading.canResend}
          mode={reading.kept ? "correct" : reading.fresh ? "someoneNew" : reading.typeOnce ? "typeOnce" : "first"}
          initial={reading.kept ?? null}
          onCancel={() => setCorrecting(false)}
        />
      </div>
    );
  }

  return (
    <div className={shell}>
      <h1 className="font-display text-[clamp(1.7rem,4vw,2.25rem)] font-medium leading-[1.15] tracking-tight text-brand-gold">
        {chartTitle(reading.name)}
      </h1>
      {reading.label && (
        <p className="mt-2 font-sans text-[13px] uppercase tracking-[0.16em] text-brand-muted">
          {reading.label}
        </p>
      )}
      {/*
        THE BIRTH LINE, as both PDFs print it under the name (Jeremy 10/16).
        Only when the reading keeps birth details -- every paid chart filled
        from 16 October 2026; older readings simply have none.
      */}
      {reading.birthLine && (
        <p className="mt-2 text-[15px] text-brand-muted">{reading.birthLine}</p>
      )}

      {/*
        RELEASE 2: the calm notes. "Your chart has grown" when this link was
        signed for an earlier tier; "Your correction" after Change a detail
        (or "What changed from your summary" for an older summary typed once).
      */}
      <ReadingNotes grown={reading.grown} label={reading.label} correction={reading.correction} />

      {/*
        FIX 9A (Jeremy 10/19): the PDF, solid and named, right under the title
        -- on the first screen, on a phone too, saying what is in it. Not while
        the words are still being written (the file would be short of them).
      */}
      {reading.tier >= 1 && !reading.writing && (
        <div className="mt-6">
          <a href={`/api/pdf?t=${encodeURIComponent(token)}`} className={`block w-full sm:w-auto ${PDF_BUTTON}`}>
            {pdfLabel(reading.tier, reading.pdfPages)}
          </a>
          <p className="mt-2 text-[14px] text-brand-muted">
            {reading.tier >= 2
              ? "The chart, its values and the written reading, ready to print or keep."
              : "The chart and its values, ready to print or keep."}
          </p>
        </div>
      )}

      {/*
        FIX 1A (Jeremy 10/19): "Your chart in three lines", a plain way in
        before the chart. Below the chart, today's order stays (his 1B half).
      */}
      {reading.output && <ThreeLines chart={reading.output} takeaways={reading.view?.takeaways ?? null} />}
      {/* An unknown birth time (Jeremy 10/22): the one line, the bar under it, and the offer. */}
      {reading.output && <TimeNote output={reading.output} tier={reading.tier} />}

      {/*
        THE NEW ORDER, the PDFs' order (Jeremy 10/16: "All PDFs should look
        the same", and the page follows them): the chart and its key; the
        glance box with the reading's own sentences, the chart values and the
        activations; Start here; the reading, decision first; the
        experiments; then the PDF and the resources.

        The picture first, when there is one -- it is what somebody recognises
        as their chart. Absent on the summary tier, where nothing renders here
        at all: no placeholder, no greyed frame.
      */}
      {reading.output?.bodygraphSvg !== undefined && (
        <div className="mt-8">
          <Bodygraph
            svg={reading.output.bodygraphSvg}
            alt={
              reading.name ? `${reading.name}’s bodygraph` : "Your bodygraph"
            }
          />
          <ChartKey />
        </div>
      )}

      <div className="mt-10">
        <Glance
          data={reading.output}
          says={reading.view?.summary ?? reading.written?.summary ?? null}
          showActivations={reading.tier >= 2}
        />
      </div>

      {reading.view ? (
        <>
          <div className="mt-14">
            <StartHere v={reading.view} chart={reading.output} />
          </div>
          <div className="mt-14">
            <ReadingInOrder v={reading.view} notes={reading.notes ?? {}} chart={reading.output} />
          </div>
        </>
      ) : (
        <>
          {/* A reading that cannot be laid out the new way (letter mode) keeps its old shape. */}
          {reading.written && <WrittenReading written={reading.written} notes={reading.notes ?? {}} />}
          {/* FIX 10B: the coaching card ends every reading page; the new-order reading carries its own. */}
          {!reading.writing && (
            <div className="mt-12">
              <CoachCard />
            </div>
          )}
        </>
      )}

      {/*
        THE MINUTE BETWEEN THE CHART AND THE WORDS.

        Generation runs on a sweep rather than on the request -- a reading takes
        the model tens of seconds and a synchronous function is cut off at ten.
        So there is a real gap, and a page that quietly shows less than was paid
        for reads as broken. It says so instead, and says what to do, which is
        nothing.
      */}
      {reading.writing && (
        <div className="mt-10 rounded-xl border border-brand-gold/40 bg-brand-gold/[0.08] px-5 py-4">
          {/*
            SOMETHING THAT MOVES.
            Jeremy: "No real way for user to know reading is pending." The panel
            said the right words and looked like a finished page that happened
            to be missing something. Three dots that pulse are the difference
            between "waiting" and "broken" -- and they are the only part of this
            page that is allowed to move.

            Staggered so they read as a sequence rather than a flash, and stilled
            entirely under prefers-reduced-motion, where the sentence carries it.
          */}
          <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-gold">
            <span aria-hidden className="flex gap-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-[6px] w-[6px] rounded-full bg-brand-gold animate-pulse motion-reduce:animate-none"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
            Processing
          </p>
          <p className="mt-3 text-[17px] leading-relaxed text-brand-paper">
            Your chart is above, and your reading is being written now. It
            usually takes a few minutes, and a draft that does not pass its own
            checks is written again rather than handed over.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-brand-muted">
            {gaveUp
              ? "This is taking longer than it should. Nothing is lost and nothing needs doing — Jeremy has been told, and the email will reach you when it is written."
              : "Nothing needs doing — this page will show it as soon as it is written, and an email arrives too."}
          </p>
        </div>
      )}

      <ReadingActions
        token={token}
        upgrade={reading.upgrade}
        canResend={reading.canResend}
        tier={reading.tier}
        mechanics={reading.output}
        writing={reading.writing}
        pdfPages={reading.pdfPages ?? null}
      />
    </div>
  );
}
