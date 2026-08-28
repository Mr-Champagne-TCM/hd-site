import { HERO, NAV, CREDIBILITY, EXAMPLE, TIERS_INTRO, LADDER_NOTE, FOOTER, SITE, RESOURCES } from "./copy";
import { useState } from "react";
import { ladder, money, SUMMARY } from "../shared/pricing.mjs";
import { startCheckout } from "./purchase";
import ExampleSummary from "./ExampleSummary";
import EntryForm from "./entry/EntryForm";

/**
 * The offer page.
 *
 * Order matters here and is not arbitrary: what it is, what the answer looks
 * like, what it costs, why the numbers can be trusted. The price appears
 * before anything is asked of the visitor -- no birth date, no email, no
 * account -- and the worked example appears before the price, so nobody is
 * asked to pay for something they have not seen the shape of.
 */

function Nav() {
  return (
    <nav className="border-b border-brand-gold/15">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5 sm:px-8">
        {/* The brand is the way home, as it is on the main site. Two links on
            the right and no more: at 390px a third one starts colliding with
            the brand, which is the fault that had to be fixed on the library. */}
        <a
          href={SITE.home}
          className="whitespace-nowrap font-display text-[20px] font-medium tracking-tight text-brand-paper transition-colors hover:text-brand-gold sm:text-[26px]"
        >
          The <span className="text-brand-gold">Champagne</span> Method
        </a>
        <div className="flex shrink-0 items-center gap-5">
          <a
            href={SITE.library}
            className="hidden whitespace-nowrap font-sans text-[15px] text-brand-muted transition-colors hover:text-brand-teal sm:inline"
          >
            {NAV.library}
          </a>
          <a
            href={SITE.connect}
            className="whitespace-nowrap font-sans text-[14px] text-brand-muted transition-colors hover:text-brand-teal sm:text-[15px]"
          >
            {NAV.toCoaching}
          </a>
        </div>
      </div>
    </nav>
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
          className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4 transition-colors hover:decoration-brand-teal"
        >
          Human Design, plainly
        </a>
        , free in the library.
      </p>
    </section>
  );
}

function Tiers() {
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
    const problem = await startCheckout(level);
    if (problem) {
      setFailed({ sku, message: problem });
      setBusy(null);
    }
  };
  return (
    <section className="mx-auto max-w-5xl px-6 pt-20 sm:px-8">
      <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        {TIERS_INTRO.title}
      </h2>
      <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper/85">
        {TIERS_INTRO.body}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {rows.map(({ tier, full, due, credit }, level) => (
          <div
            key={tier.sku}
            className="flex flex-col gap-0 rounded-2xl border border-brand-gold/25 bg-white/[0.04] p-5"
          >
            <h3 className="font-sans text-[16px] font-semibold text-brand-paper">{tier.label}</h3>
            <p className="mt-3 font-display text-[2rem] leading-none text-brand-gold tabular-nums">
              {money(full)}
            </p>
            {credit > 0 && (
              <p className="mt-2 text-[14px] leading-snug text-brand-teal">
                {/* The labels already begin with "The", so the article is stripped
                    rather than added. Without this it reads "the the summary". */}
                {money(due)} if you already have{" "}
                {rows[rows.findIndex((r) => r.tier === tier) - 1].tier.label.replace(/^The /, "the ")}
              </p>
            )}
            <p className="mt-3 text-[15px] leading-relaxed text-brand-paper/80">{tier.blurb}</p>

            {/*
              The cards were inert until now, and "clicking the price squares
              does nothing" was exactly right. mt-auto pins the button to the
              bottom so three cards of different heights still line up.
            */}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => buy(tier.sku, level)}
              className="mt-auto rounded-full bg-brand-teal px-5 py-3 font-sans text-[15px] font-semibold text-[#0d1b1a] transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === tier.sku ? "Opening…" : `Buy ${tier.label.replace(/^The /, "the ")}`}
            </button>
            {failed?.sku === tier.sku && (
              <p className="mt-2 text-[14px] leading-snug text-brand-gold">{failed.message}</p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
        {LADDER_NOTE}
      </p>
      {/* The cards used to be inert -- "I cannot tell how to get into the
          reading" was exactly right, because there was nowhere to go. */}
      <a
        href="#yours"
        className="mt-6 inline-block rounded-full bg-brand-teal px-6 py-3.5 font-sans text-[16px] font-semibold text-[#0d1b1a] shadow-lg shadow-brand-teal/25 transition-all duration-200 hover:-translate-y-0.5"
      >
        Start with the summary &mdash; {money(SUMMARY.cents)}
      </a>
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
        {CREDIBILITY.body}
      </p>

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
    </section>
  );
}

function Resources() {
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

function Footer() {
  return (
    <footer className="mt-24 border-t border-brand-gold/15 py-11">
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <p className="max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
          {FOOTER.disclaimer}
        </p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-brand-gold/10 pt-6">
          {[
            [SITE.home, "The Champagne Method"],
            [SITE.library, "The Library"],
            [SITE.hd101, "Human Design, plainly"],
            [SITE.bodygraph, "Reading your bodygraph"],
            [SITE.connect, "Start a conversation"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
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

export default function App() {
  return (
    <div className="font-sans text-brand-paper">
      <Nav />
      <main>
        <Hero />
        <Example />
        <Tiers />
        <EntryForm />
        <Credibility />
        <Resources />
      </main>
      <Footer />
    </div>
  );
}
