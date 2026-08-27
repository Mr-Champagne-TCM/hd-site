import { HERO, NAV, CREDIBILITY, EXAMPLE, TIERS_INTRO, LADDER_NOTE, FOOTER } from "./copy";
import { ladder, money, SUMMARY } from "../shared/pricing.mjs";
import ExampleSummary from "./ExampleSummary";

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
        <span className="whitespace-nowrap font-display text-[20px] font-medium tracking-tight text-brand-paper sm:text-[26px]">
          The <span className="text-brand-gold">Champagne</span> Method
        </span>
        <a
          href="https://thechampagnemethod.co"
          className="shrink-0 whitespace-nowrap font-sans text-[14px] text-brand-muted transition-colors hover:text-brand-teal sm:text-[15px]"
        >
          {NAV.toCoaching}
        </a>
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
      <p className="mt-4 text-[15px] text-brand-muted/80">
        That is the whole of the {money(SUMMARY.cents)} summary. Nothing is blurred out or held back
        within it.
      </p>
    </section>
  );
}

function Tiers() {
  const rows = ladder();
  return (
    <section className="mx-auto max-w-5xl px-6 pt-20 sm:px-8">
      <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        {TIERS_INTRO.title}
      </h2>
      <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper/85">
        {TIERS_INTRO.body}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {rows.map(({ tier, full, due, credit }) => (
          <div
            key={tier.sku}
            className="flex flex-col rounded-2xl border border-brand-gold/25 bg-white/[0.04] p-5"
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
          </div>
        ))}
      </div>

      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
        {LADDER_NOTE}
      </p>
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

function Footer() {
  return (
    <footer className="mt-24 border-t border-brand-gold/15 py-11">
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <p className="max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
          {FOOTER.disclaimer}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-brand-gold/10 pt-6">
          <a
            href="https://thechampagnemethod.co"
            className="text-[15px] text-brand-muted transition-colors hover:text-brand-teal"
          >
            {FOOTER.coaching}
          </a>
          <span className="text-[13px] text-brand-muted/60">{FOOTER.attribution}</span>
        </div>
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
        <Credibility />
      </main>
      <Footer />
    </div>
  );
}
