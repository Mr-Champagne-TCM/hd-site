import {
  HERO,
  NAV,
  CREDIBILITY,
  EXAMPLE,
  TIERS_INTRO,
  LADDER_NOTE,
  FOOTER,
  SITE,
  RESOURCES,
  WHO_MAKES,
  PLAIN_ACCURACY,
  CARDS,
  MY_CHARTS,
  RETURNING,
} from "./copy";
import { useEffect, useState } from "react";
import { ladder, money, SUMMARY, CHART, READING, TIERS } from "../shared/pricing.mjs";
import ChartThumb from "./ChartThumb";
import { ChoiceCard, KeptLine, SomeoneNewCard, btn, h1, tierWord, whoseOf } from "./Returning";
import { startCheckout } from "./purchase";
import { sellable } from "../shared/availability.mjs";
import ExampleSummary from "./ExampleSummary";
import MailtoText from "./MailtoText";
import FooterTheme from "./FooterTheme";
import { claimIfReturning } from "./purchase";
import { customerText } from "../shared/customerMessages.mjs";
import { HINT, hint, ownPageHint } from "../shared/linkHints.mjs";

/**
 * The offer page.
 *
 * Order matters here and is not arbitrary: what it is, what the answer looks
 * like, what it costs, why the numbers can be trusted. The price appears
 * before anything is asked of the visitor -- no birth date, no email, no
 * account -- and the worked example appears before the price, so nobody is
 * asked to pay for something they have not seen the shape of.
 */

/**
 * THE HEADER WORDMARK (Jeremy's brand call 10/16, B2 = option B): the
 * wordmark unchanged, with a small "Human Design by" eyebrow above it, so the
 * header says whose Human Design readings these are. "by" stays lowercase in
 * every brand line, so it is kept out of the eyebrow's uppercase.
 */
function Wordmark() {
  return (
    <a href={SITE.home} {...hint("Human Design by The Champagne Method", HINT.home)} className="group whitespace-nowrap leading-none">
      <span className="mb-1 block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-muted sm:text-[11px]">
        Human Design <span className="normal-case">by</span>
      </span>
      <span className="block font-display text-[20px] font-medium tracking-tight text-brand-paper transition-colors group-hover:text-brand-gold sm:text-[26px]">
        The <span className="text-brand-gold">Champagne</span> Method
      </span>
    </a>
  );
}

export function Nav() {
  return (
    <nav className="border-b border-brand-gold/15">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 gap-y-3 px-6 py-5 sm:flex-nowrap sm:px-8">
        {/* The brand is the way home, as it is on the main site. Two links on
            the right and no more.
            FIX 13A (Jeremy 10/19): "The Human Design library" beside Coaching
            on every screen. On a phone the two links take their own row under
            the name ("Library  Coaching"), so neither collides with the brand
            -- the fault that had to be fixed on the library at 390px. */}
        <Wordmark />
        <div className="flex w-full shrink-0 items-center gap-5 sm:w-auto">
          <a
            href={SITE.hd101}
            {...hint(NAV.library, HINT.library)}
            className="whitespace-nowrap font-sans text-[14px] text-brand-muted transition-colors hover:text-brand-teal sm:text-[15px]"
          >
            <span className="sm:hidden">{NAV.libraryShort}</span>
            <span className="hidden sm:inline">{NAV.library}</span>
          </a>
          <a
            href={SITE.connect}
            {...hint(NAV.toCoaching, HINT.connect)}
            className="whitespace-nowrap font-sans text-[14px] text-brand-muted transition-colors hover:text-brand-teal sm:text-[15px]"
          >
            {NAV.toCoaching}
          </a>
        </div>
      </div>
    </nav>
  );
}

/**
 * FIX 3A (Jeremy 10/19): who makes this, under the opening -- his current
 * site photo (approach-candid.jpg, cropped round), one line in his own voice,
 * and the AI said plainly before anybody pays, not only on the privacy page.
 */
const AI_LINE =
  `Your chart is calculated, not written by AI. The written part of the ${money(READING.cents)} reading is ` +
  "drafted by AI (Anthropic’s Claude, with Google’s Gemini on standby) from your chart’s values only — no name, no birth date, no place. " +
  "Every sentence goes through my checks against your chart and Human Design’s original teaching — or it doesn’t reach you.";

const linkCls =
  "text-brand-teal underline decoration-brand-teal/40 underline-offset-4 transition-colors hover:decoration-brand-teal";

function WhoMakesThis() {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-10 sm:px-8">
      <div className="flex flex-col gap-5 rounded-2xl border border-brand-gold/25 bg-white/[0.04] p-5 sm:flex-row sm:items-start sm:p-6">
        <img
          src="/jeremy.jpg"
          alt="Jeremy Champagne"
          width={120}
          height={120}
          className="h-[120px] w-[120px] shrink-0 rounded-xl object-cover"
        />
        <div>
          <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-teal">
            {WHO_MAKES.label}
          </p>
          <p className="mt-2 max-w-[60ch] text-[17px] leading-relaxed text-brand-paper">{WHO_MAKES.line}</p>
          <p className="mt-3 max-w-[60ch] text-[15.5px] leading-relaxed text-brand-paper/85">
            <span className="font-semibold text-brand-gold">{WHO_MAKES.howLabel}</span>
            {AI_LINE}
          </p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
            <a href={WHO_MAKES.myStory} {...hint("My story", HINT.myStory)} className={linkCls}>
              My story
            </a>
            <a href={SITE.privacy} {...hint("What is sent, and to whom", HINT.privacy)} className={linkCls}>
              What is sent, and to whom
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

function Hero() {
  return (
    <header className="mx-auto max-w-5xl px-6 pb-4 pt-16 sm:px-8 sm:pt-20">
      <span className="mb-4 block font-sans text-[14px] font-semibold uppercase tracking-[0.22em] text-brand-teal">
        {HERO.eyebrow}
      </span>
      <h1 className="max-w-[18ch] font-display text-[clamp(2.25rem,6vw,3.4rem)] font-medium leading-[1.08] tracking-tight">
        {HERO.title}
      </h1>
      <p className="mt-5 max-w-[58ch] text-[clamp(1.125rem,2vw,1.3125rem)] leading-relaxed text-brand-paper/90">
        {HERO.standfirst}
      </p>
      <p className="mt-8 border-l-2 border-brand-gold pl-5 text-[19px] leading-relaxed text-brand-paper">
        {HERO.note}
      </p>
    </header>
  );
}

function Example() {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-16 sm:px-8">
      <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        {EXAMPLE.title}
      </h2>
      <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">
        {EXAMPLE.caption}
      </p>
      <div className="mt-6 max-w-[46rem]">
        <ExampleSummary />
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-brand-muted/80">
        That is the whole of the {money(SUMMARY.cents)} summary. Nothing is blurred out or held back
        within it.
      </p>
      {/* One quiet link at the point of confusion. Someone meeting
          "Manifesting Generator" and "Sacral" for the first time wants a
          glossary now, not at the bottom of the page -- and the fuller pair
          still sits further down for anyone who reads to the end. */}
      <p className="mt-2 text-[15px] leading-relaxed text-brand-muted">
        Every word in it is explained in{" "}
        <a
          href={SITE.hd101}
          {...hint("the Human Design library", HINT.library)}
          className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4 transition-colors hover:decoration-brand-teal"
        >
          the Human Design library
        </a>
        , free.
      </p>
    </section>
  );
}

/**
 * The someone-new cards describe THEIR chart (W8, 10/21): they said "your
 * centers, your incarnation cross" to a buyer starting a chart for someone else.
 */
const THEIR = {
  readingLead: "Their chart, plus about 1,200 words written to it:",
  readingTicks: ["How they decide", "How they meet the world", "What they take in from others", "Four small things to try"],
};

/** Fix 2, option B (Jeremy 10/20 "1B"): the reading's card in four plain ticks. */
function ReadingTicks({ their = false }: { their?: boolean }) {
  return (
    <div className="mt-3">
      <p className="text-[15px] leading-relaxed text-brand-paper/85">{their ? THEIR.readingLead : CARDS.readingLead}</p>
      <ul className="mt-2 space-y-1">
        {(their ? THEIR.readingTicks : CARDS.readingTicks).map((t) => (
          <li key={t} className="flex gap-2 text-[15px] text-brand-paper/90">
            <span aria-hidden className="text-brand-teal">
              ✓
            </span>
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[14px] text-brand-muted">{CARDS.readingPdf}</p>
    </div>
  );
}

/**
 * THE LIBRARY NOTE on the summary and chart cards (Jeremy 10/19 pm: "these
 * outputs can be used to get nearly a full reading when used with my HD
 * library"), on every state of those cards.
 */
function LibraryNote({ sku }: { sku: string }) {
  const [before, link, after] = sku === SUMMARY.sku ? CARDS.summaryNote : CARDS.chartNote;
  return (
    <p className="mb-2 mt-2 text-[14px] leading-snug text-brand-teal/90">
      {before}
      <a href={SITE.hd101} {...hint(link, HINT.library)} className={linkCls}>
        {link}
      </a>
      {after}
    </p>
  );
}

/** Fix 2B, under the three cards: one real line from a real reading. */
function RealLine() {
  return (
    <figure className="mt-6 rounded-2xl border border-brand-gold/30 bg-white/[0.04] px-5 py-4">
      <p className="font-sans text-[12px] uppercase tracking-[0.16em] text-brand-gold">{CARDS.stripHead}</p>
      <blockquote className="mt-2 font-display text-[1.2rem] italic leading-snug text-brand-paper">
        “{CARDS.stripQuote}”
      </blockquote>
      <figcaption className="mt-2 text-[14px] text-brand-muted">
        {CARDS.stripCaption}{" "}
        <a href={SITE.readings} {...hint(CARDS.stripMore, HINT.examples)} className={linkCls}>
          {CARDS.stripMore}
        </a>
      </figcaption>
    </figure>
  );
}

/**
 * THE THREE CARDS.
 *
 * Two states since release 2. The first visit (`fresh` false) is the offer
 * page as it was, with fix 2B and the library notes. `fresh` is "Start a new
 * chart for someone else" from a returning buyer's link: full prices, no
 * credit wording at all (Jeremy: never "what you paid comes off" on that
 * path), and the purchase is marked as a new chart for someone new.
 *
 * The old third state -- the tiles priced against an owned tier -- is gone:
 * a returning buyer now meets the question first (ReturningView).
 */
export function Tiers({ fresh = false, from = null }: { fresh?: boolean; from?: string | null }) {
  const rows = ladder();
  /**
   * Which card is waiting on Stripe, and what went wrong if anything did.
   *
   * Held per card rather than once for the section, so pressing one button does
   * not grey out the other two -- and so a failure is reported next to the
   * thing that failed rather than somewhere else on the page.
   */
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ sku: string; message: string } | null>(null);

  const buy = async (sku: string, level: number) => {
    setBusy(sku);
    setFailed(null);
    // Resolves with a message only if it did NOT leave -- the success case is a
    // redirect, so there is nothing to do afterwards.
    // `from`: the owned chart's link, so Stripe's email box starts filled (batch-1024 item 2). Never credit.
    const problem = await startCheckout(level, fresh ? { someoneNew: true, reading: from } : {});
    if (problem) {
      setFailed({ sku, message: problem });
      setBusy(null);
    }
  };
  return (
    <section id="ways-in" className={"mx-auto max-w-5xl px-6 sm:px-8 " + (fresh ? "pt-8" : "pt-20")}>
      {/*
        The invitation leads, and the label follows. "If you'd like to see your
        own" turns three cards from a menu into an answer to a question somebody
        is already asking; "Three ways in" names what the cards are.
      */}
      {!fresh && (
        <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
          {TIERS_INTRO.lead}
        </h2>
      )}

      {/* PICKS-PRICE-LINE (Jeremy 10/23, GO v3): the line under the invitation ("The price is here before
          anything is asked of you.") is gone. The label sits closer (mt-6, was mt-10 under that line), so
          the invitation, the label and the cards read as one block. */}
      <p className={(fresh ? "" : "mt-6 ") + "font-sans text-[12px] uppercase tracking-[0.18em] text-brand-teal"}>
        {TIERS_INTRO.title}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {rows.map(({ tier, full, due, credit }, level) => (
          <div
            key={tier.sku}
            data-card={tier.sku}
            className="flex flex-col gap-0 rounded-2xl border border-brand-gold/25 bg-white/[0.04] p-5"
          >
            <h3 className="font-sans text-[16px] font-semibold text-brand-paper">{tier.label}</h3>
            <p className="mt-3 font-display text-[2rem] leading-none text-brand-gold tabular-nums">{money(full)}</p>
            {!fresh && credit > 0 && (
              <p className="mt-2 text-[14px] leading-snug text-brand-teal">
                {/* The labels already begin with "The", so the article is stripped
                    rather than added. Without this it reads "the the summary". */}
                {money(due)} if you already have{" "}
                {rows[rows.findIndex((r) => r.tier === tier) - 1].tier.label.replace(/^The /, "the ")}
              </p>
            )}
            {tier.sku === READING.sku ? (
              <ReadingTicks their={fresh} />
            ) : (
              <>
                <p className="mt-3 text-[15px] leading-relaxed text-brand-paper/80">
                  {fresh ? tier.theirBlurb : tier.blurb}
                </p>
                <LibraryNote sku={tier.sku} />
              </>
            )}

            {/*
              Only what can be delivered is offered. Said in words rather than
              shown as a dead grey button; the refusal itself lives in the
              checkout function -- see shared/availability.mjs.
            */}
            {!sellable(level) ? (
              <p className="mt-auto pt-3 text-[14px] leading-snug text-brand-muted">{TIERS_INTRO.notYet}</p>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => buy(tier.sku, level)}
                className="mt-auto rounded-full bg-brand-teal px-5 py-3 font-sans text-[15px] font-semibold text-[#0d1b1a] transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === tier.sku ? "Opening…" : `Buy ${tier.label.replace(/^The /, "the ")}`}
              </button>
            )}
            {failed?.sku === tier.sku && (
              <p className="mt-2 text-[14px] leading-snug text-brand-gold">{failed.message}</p>
            )}
          </div>
        ))}
      </div>

      <RealLine />

      {!fresh && <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">{LADDER_NOTE}</p>}
      {/*
        THE LONG ANSWER, one click away -- ONCE (release 1 showed it twice on
        the upgrade page; Jeremy 10/20 "4A", fixed here).
      */}
      <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-brand-paper/85">
        <a href={SITE.readings} {...hint("What each one actually is", HINT.examples)} className={linkCls}>
          What each one actually is
        </a>
        , shown with a real example chart — the summary in full, the bodygraph drawn, and the PDF exactly as it
        downloads.
      </p>
      {/*
        "EMAIL ME MY CHARTS" (Jeremy 10/20, "3B"): one small line, after "What
        each one actually is", for somebody who bought before and has lost the
        email. Not on the someone-new tiles: that buyer has their link in hand.
      */}
      {!fresh && (
        <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-brand-paper/85">
          {MY_CHARTS.lineLead}{" "}
          <a href="/charts/" {...hint(MY_CHARTS.line, HINT.myCharts)} className={linkCls}>
            {MY_CHARTS.line}
          </a>
        </p>
      )}
    </section>
  );
}

function Credibility() {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-20 sm:px-8">
      <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        {CREDIBILITY.title}
      </h2>
      <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper/85">
        {CREDIBILITY.body.map((part) =>
          part.emphasis ? (
            <strong key={part.text} className="text-[1.08em] font-semibold italic text-brand-paper">
              {part.text}
            </strong>
          ) : (
            <span key={part.text}>{part.text}</span>
          ),
        )}
      </p>
      <p className="mt-4 max-w-[62ch] font-display text-[1.2rem] italic leading-snug text-brand-gold/90">
        {CREDIBILITY.standout}
      </p>

      {/*
        FIX 5B (Jeremy 10/19): every word above stays exactly; one plain line
        is added, and the four number cards and the closing paragraph fold
        behind a tap. A newcomer read "14 seconds", "15 of 15" and "1 in 3,000"
        as doubts raised right before the buy.
      */}
      <p className="mt-4 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper">{PLAIN_ACCURACY}</p>
      <details className="mt-5 rounded-2xl border border-brand-teal/25 bg-white/[0.02] px-5 py-4">
        <summary className="cursor-pointer select-none font-sans text-[16px] font-semibold text-brand-teal">
          How I check: the four numbers
        </summary>
        <dl className="mt-7 grid gap-4 sm:grid-cols-2">
          {CREDIBILITY.checks.map(([figure, what]) => (
            <div key={figure} className="rounded-2xl border border-brand-teal/20 bg-white/[0.03] p-5">
              <dt className="font-display text-[1.6rem] leading-none text-brand-teal tabular-nums">
                {figure}
              </dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-brand-paper/80">{what}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
          {CREDIBILITY.closing}
        </p>
      </details>
    </section>
  );
}

export function Resources() {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-20 sm:px-8">
      <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        {RESOURCES.title}
      </h2>
      <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper/85">
        {RESOURCES.body}
      </p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {RESOURCES.items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            /* The whole card is the link: its accessible name keeps every word on it, then where it goes. */
            {...hint(`${item.tag}. ${item.title}. ${item.blurb}`, item.href === SITE.bodygraph ? HINT.bodygraph : HINT.library)}
            className="group rounded-2xl border border-brand-gold/20 bg-white/[0.03] p-5 transition-colors hover:border-brand-teal/50"
          >
            <span className="inline-block rounded-full border border-brand-teal/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-teal">
              {item.tag}
            </span>
            <h3 className="mt-3 font-display text-[1.25rem] font-medium text-brand-paper transition-colors group-hover:text-brand-teal">
              {item.title}
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-brand-paper/80">{item.blurb}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

/** `their`: under "Start a new chart for someone else", whose birth details the terms speak of. */
export function Footer({ their = false }: { their?: boolean } = {}) {
  return (
    // ROOM UNDERNEATH, and it is not decoration.
    //
    // Reported on a phone: "site bottom is scrolled and the bottom text looks
    // crowded... the lowest text is crowded near my ask bar." A phone's browser
    // chrome, gesture bar and any keyboard-adjacent UI all sit in the last
    // inch of the screen, and a page whose last line ends flush with its own
    // footer ends underneath them.
    //
    // pb-24 on the footer buys that inch, and the safe-area inset adds
    // whatever the specific device says it needs on top -- which is zero on a
    // desktop and real on a phone with a gesture bar.
    <footer
      className="page-bottom mt-24 border-t border-brand-gold/15 pt-11"
    >
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <p className="max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
          {FOOTER.disclaimer}
        </p>
        {/*
          THE TERMS SIT WHERE SOMEBODY CAN READ THEM BEFORE THEY PAY, which is
          the only placement that is either fair or useful. See the note in
          copy.ts for why the wording is what it is.
        */}
        <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
          <MailtoText text={FOOTER.terms(their ? "their" : "your")} />
        </p>
        {/*
          THE FOOTER THEME (Jeremy 10/17): the two names the delivery email ends
          with, side by side. The business name used to lead the link row below;
          it lives here now, with its line, so it is not said twice.
        */}
        <div className="mt-8 border-t border-brand-gold/10 pt-6">
          <FooterTheme />
        </div>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {[
            // "The Library" (the coaching library) left this row with fix 13A
            // (10/19): the header now names the Human Design library instead.
            [SITE.hd101, "The Human Design library"],
            [SITE.bodygraph, "Reading your bodygraph"],
            [SITE.connect, "Start a conversation"],
            // Last in the row on purpose: it is the one a reader goes looking
            // for rather than wanders into, and it belongs beside the terms
            // above it rather than among the reading matter.
            [SITE.privacy, "Privacy"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              {...hint(label, href === SITE.hd101 ? HINT.library : href === SITE.bodygraph ? HINT.bodygraph : href === SITE.connect ? HINT.connect : HINT.privacy)}
              className="text-[15px] text-brand-muted transition-colors hover:text-brand-teal"
            >
              {label}
            </a>
          ))}
        </div>
        <p className="mt-6 text-[13px] text-brand-muted/60">{FOOTER.attribution}</p>
      </div>
    </footer>
  );
}

/**
 * COMING BACK FROM STRIPE.
 *
 * ONE DOOR PER PURCHASE. This is the fix for a fault that produced four
 * separate symptoms in one test buy: no PDF or re-send on the result page, no
 * second email, an emailed link that kept offering the form, and one purchase
 * able to make unlimited charts.
 *
 * All four were the same thing. Stripe returned the buyer HERE, where a form
 * ran on a browser-held "grant" -- a path that computes a chart and files it
 * against nothing. Meanwhile their real reading sat untouched, still pending,
 * and the link in their email kept opening a form because that is what a
 * pending reading is.
 *
 * So this page no longer takes birth details from anybody. It confirms the
 * payment and hands the browser to the reading link, which is the only place a
 * chart is ever made. Write-once, the ready email, the PDF, the re-send and the
 * upgrade all follow from being on that path instead of beside it.
 *
 * `replace` rather than `href`: the ?paid= URL is spent, and Back should reach
 * the offer page rather than a claim that cannot be made twice.
 */
function PaidReturn() {
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    claimIfReturning().then((r) => {
      if (!alive || !r) return;
      if (r.ok && r.url) {
        window.location.replace(r.url);
        return;
      }
      // No link back means the purchase could not be filed on our side; the
      // server says so in the catalogue's words (and Jeremy has been paged).
      setProblem(r.ok ? (r.notice ?? customerText("purchase-safe-setup-pending")) : r.message);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page-bottom mx-auto max-w-3xl px-6 pt-20 sm:px-8">
      <h1 className="font-display text-[clamp(1.7rem,4vw,2.25rem)] font-medium leading-[1.15] tracking-tight text-brand-gold">
        {problem ? "Your purchase is safe" : "Payment received, thank you"}
      </h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-brand-paper/90">
        {problem ? <MailtoText text={problem} /> : "Opening your page…"}
      </p>
    </div>
  );
}

/**
 * THE RETURNING BUYER, ARRIVED BY THEIR SIGNED LINK (release 2, mock v2
 * accepted 10/19). `/u/<token>`, where the upgrade tiles used to be.
 *
 * Before anything is bought, one question: "Your chart, a step further -- or
 * someone new?" Two cards. "For me" is THE SAME CHART a step further: its
 * kept details shown, what it has cost so far taken off, and Stripe told which
 * chart this upgrades. "Start a new chart for someone else" opens the three
 * cards at full price, fresh, in plain words -- and never "what you paid comes
 * off" there, because it does not: what Alex paid stays with Alex's chart.
 *
 * Owning the top tier already: "Alex's reading is here" and the same
 * someone-new card. Everything about what is owned comes from the SERVER, from
 * the signed token -- the page decides nothing about money.
 */
type Returning = {
  pending: boolean;
  tier: number;
  label: string | null;
  whose: string | null;
  birthLine?: string | null;
  kept?: { birthLine?: string | null } | null;
  output?: { definedCenters?: string[] } | null;
};

function ReturningView({ token }: { token: string }) {
  const [data, setData] = useState<Returning | null>(null);
  const [failed, setFailed] = useState(false);
  const [showNew, setShowNew] = useState(() => typeof window !== "undefined" && window.location.hash === "#new");
  const [busy, setBusy] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((body) => alive && setData(body as Returning))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    const onHash = () => setShowNew(window.location.hash === "#new");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const startNew = () => {
    window.location.hash = "new";
    setShowNew(true);
    window.scrollTo({ top: 0 });
  };

  const upgrade = async (level: number) => {
    setBusy(level);
    setProblem(null);
    // FOR ME: the same chart, a step further. The server works out the credit
    // from the chart this link names, and tells Stripe which chart it grows.
    const message = await startCheckout(level, { reading: token, upgrade: true });
    if (message) {
      setProblem(message);
      setBusy(null);
    }
  };

  const whose = data?.whose ?? null;
  const back = data?.pending ? `/r/${encodeURIComponent(token)}` : `/u/${encodeURIComponent(token)}`;

  let body: React.ReactNode;
  if (!data && !failed) {
    body = (
      <section className="mx-auto max-w-5xl px-6 pt-16 sm:px-8">
        <p className="min-h-[3.5rem] text-[17px] text-brand-paper/90">Reading your link…</p>
      </section>
    );
  } else if (failed) {
    // Nothing is said about credit when the link could not be read: the cards
    // below are full price, and say nothing else.
    body = (
      <>
        <section className="mx-auto max-w-5xl px-6 pt-16 sm:px-8">
          <p className="max-w-[60ch] text-[17px] leading-relaxed text-brand-paper/90">
            That link could not be read just now, so the prices below are the full ones. Nothing is lost —
            opening the link from your email again usually sorts it.
          </p>
        </section>
        <Tiers fresh />
      </>
    );
  } else if (showNew || data!.pending) {
    // "Start a new chart for someone else": full price, fresh, plain words.
    const backLabel = data!.pending ? `Back to ${whoseOf(whose)} chart` : "Back to your options";
    body = (
      <>
        <section className="mx-auto max-w-5xl px-6 pt-16 sm:px-8">
          {/* Decision 14 (GO v3): the way back says where it goes. From the choices it goes back to
              them ("your options"); before the buyer's own details it goes to the chart's page. */}
          <a
            href={back}
            {...hint(
              backLabel,
              data!.pending ? ownPageHint(whoseOf(whose), "chart") : `Opens your options for ${whoseOf(whose)} chart`,
            )}
            onClick={(e) => {
              if (data!.pending) return;
              e.preventDefault();
              window.history.pushState({}, "", window.location.pathname);
              setShowNew(false);
            }}
            className="font-sans text-[15px] text-brand-teal"
          >
            ← {backLabel}
          </a>
          <h1 className={h1 + " mt-4"}>{RETURNING.startNew}</h1>
          <p className="mt-4 max-w-[60ch] text-[19px] leading-relaxed text-brand-paper">
            A chart for someone new starts fresh: {money(SUMMARY.cents)}, {money(CHART.cents)} or{" "}
            {money(READING.cents)}.
          </p>
          <p className="mt-2 max-w-[60ch] text-[19px] leading-relaxed text-brand-paper">{RETURNING.staysWithYours}</p>
          <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">{RETURNING.theirDetailsLater}</p>
        </section>
        <Tiers fresh from={token} />
      </>
    );
  } else if (data!.tier >= TIERS.length - 1) {
    // THE TOP TIER, ALREADY OWNED: nothing to take further, so no question.
    body = (
      <section className="mx-auto max-w-5xl px-6 pt-16 sm:px-8">
        <h1 className={h1}>
          {whoseOf(whose, true)} {tierWord(data!.tier)} is here
        </h1>
        <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-brand-paper/90">{RETURNING.topBody}</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <ChoiceCard
            tone="gold"
            picture={<ChartThumb defined={data!.output?.definedCenters ?? []} />}
            eyebrow={RETURNING.forMe}
            title={`${whoseOf(whose, true)} ${tierWord(data!.tier)}`}
            action={
              <a
                href={`/r/${encodeURIComponent(token)}`}
                {...hint(`Open ${whoseOf(whose)} ${tierWord(data!.tier)}`, ownPageHint(whoseOf(whose), tierWord(data!.tier)))}
                className={btn}
              >
                Open {whoseOf(whose)} {tierWord(data!.tier)} →
              </a>
            }
          >
            <p className="mt-5 text-[17px] leading-relaxed text-brand-paper/90">{RETURNING.topCard}</p>
            {data!.birthLine && <KeptLine label="Cast from" line={data!.birthLine} />}
          </ChoiceCard>
          <SomeoneNewCard onStart={startNew} />
        </div>
      </section>
    );
  } else {
    // THE QUESTION (wording A's heading over wording B's two cards, warmer).
    const owned = data!.tier;
    const paid = TIERS[owned].cents;
    const ahead = TIERS.map((t, level) => ({ t, level })).filter(({ level }) => level > owned);
    body = (
      <section className="mx-auto max-w-5xl px-6 pt-16 sm:px-8">
        <h1 className={h1}>{RETURNING.question}</h1>
        <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-brand-paper/90">{RETURNING.questionBody}</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <ChoiceCard
            tone="gold"
            picture={<ChartThumb defined={data!.output?.definedCenters ?? []} />}
            eyebrow={RETURNING.forMe}
            title={RETURNING.sameChart}
            action={
              <div className="flex flex-col items-start gap-3">
                {ahead.map(({ t, level }) =>
                  sellable(level) ? (
                    <button
                      key={t.sku}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => upgrade(level)}
                      className={btn}
                    >
                      {busy === level ? "Opening…" : `Take ${whoseOf(whose)} ${tierWord(owned)} to the ${tierWord(level)}`}
                    </button>
                  ) : null,
                )}
                {problem && <p className="text-[14px] leading-snug text-brand-gold">{problem}</p>}
              </div>
            }
          >
            <p className="mt-5 text-[17px] leading-relaxed text-brand-paper/90">
              {ahead.length > 1
                ? `The chart and the written reading, from the ${tierWord(owned)} you already have.`
                : `The written ${tierWord(ahead[0]?.level ?? 2)}, from the ${tierWord(owned)} you already have.`}{" "}
              {data!.birthLine ? "Your birth details are kept, so there is nothing to type." : ""}
            </p>
            {data!.birthLine ? (
              <KeptLine label={owned === 0 ? RETURNING.keptLabelSummary : RETURNING.keptLabel} line={data!.birthLine} />
            ) : (
              <p className="mt-4 text-[15px] leading-relaxed text-brand-muted">{RETURNING.noKeptYet}</p>
            )}
            {ahead.map(({ t, level }) => (
              <p key={t.sku} className="mt-5 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[2.1rem] leading-none text-brand-gold tabular-nums">
                  {money(t.cents - paid)}
                </span>
                <span className="font-display text-[1.25rem] leading-none text-brand-muted line-through tabular-nums">
                  {money(t.cents)}
                </span>
                <span className="text-[15px] text-brand-muted">the {tierWord(level)}</span>
                {/* What this step adds, and only that (10/22: the drawing is the chart's reason). */}
                <span className="basis-full text-[15px] leading-snug text-brand-paper/85">
                  {level === 2 && owned === 0 ? READING.addsToSummary : t.adds}
                </span>
              </p>
            ))}
            <p className="mt-2 text-[15px] leading-snug text-brand-teal">
              {/* The sentence finished (10/22 verbatim read): it said "comes off" and stopped. */}
              The {money(paid)} you paid for this {tierWord(owned)} comes off {ahead.length > 1 ? "both prices" : "the price"} above.
            </p>
          </ChoiceCard>
          <SomeoneNewCard onStart={startNew} />
        </div>
        {/* "What each one actually is", ONCE on this page (release-1 bug: it was here twice). */}
        <p className="mt-8 max-w-[62ch] text-[16px] leading-relaxed text-brand-paper/85">
          <a href={SITE.readings} {...hint("What each one actually is", HINT.examples)} className={linkCls}>
            What each one actually is
          </a>
          , shown with a real example chart.
        </p>
      </section>
    );
  }

  return (
    <div className="font-sans text-brand-paper">
      <Nav />
      <main>{body}</main>
      <Footer their={Boolean(failed || showNew || data?.pending)} />
    </div>
  );
}

export default function App({ upgradeToken = null }: { upgradeToken?: string | null }) {
  /**
   * Detected from the `?paid=` parameter Stripe returns to, read before
   * `claimIfReturning` strips it -- which is why this is captured once, at
   * mount, rather than read live.
   */
  const [returningPaid] = useState(
    () =>
      typeof window !== "undefined" && new URL(window.location.href).searchParams.has("paid"),
  );

  if (upgradeToken) return <ReturningView token={upgradeToken} />;

  if (returningPaid) {
    return (
      <div className="font-sans text-brand-paper">
        <Nav />
        <main>
          <PaidReturn />
        </main>
        <Footer />
      </div>
    );
  }

  /**
   * NO BIRTH FORM FOR SOMEBODY WHO HAS NOT BOUGHT ANYTHING. Jeremy: "this goes
   * away now. only see that when they buy something."
   *
   * It also closes a real hole. The form ran on a grant held in the tab, and a
   * grant does not spend -- one purchase could produce any number of charts
   * from this page. The offer page is the pitch and the prices; the chart is
   * made behind the signed link and nowhere else.
   */
  return (
    <div className="font-sans text-brand-paper">
      <Nav />
      <main>
        <Hero />
        <WhoMakesThis />
        {/* Prices before the example. Jeremy, 2026-10-04: "They can't tell they
            can buy anything unless they scroll." The library's "your chart"
            links land here, so the buy buttons have to be on the first screen. */}
        <Tiers />
        <Example />
        <Credibility />
        <Resources />
      </main>
      <Footer />
    </div>
  );
}
