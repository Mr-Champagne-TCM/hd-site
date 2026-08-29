import { HERO, NAV, CREDIBILITY, EXAMPLE, TIERS_INTRO, LADDER_NOTE, FOOTER, SITE, RESOURCES } from "./copy";
import { useEffect, useState } from "react";
import { ladder, money, SUMMARY } from "../shared/pricing.mjs";
import { startCheckout } from "./purchase";
import { sellable } from "../shared/availability.mjs";
import ExampleSummary from "./ExampleSummary";
import { claimIfReturning } from "./purchase";

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

function Tiers({ owned = -1, token = null }: { owned?: number; token?: string | null }) {
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
    const problem = await startCheckout(level, token);
    if (problem) {
      setFailed({ sku, message: problem });
      setBusy(null);
    }
  };
  return (
    <section className="mx-auto max-w-5xl px-6 pt-20 sm:px-8">
      {/*
        The invitation leads, and the label follows.

        "If you'd like to see your own" used to introduce the form at the foot of
        the page. It is the strongest line on the page and it belongs here, above
        the prices, where it turns three cards from a menu into an answer to a
        question somebody is already asking.

        "Three ways in" keeps its job -- naming what the cards are -- at the size
        that job deserves. It stops being the headline and becomes the label,
        which is what it was doing anyway.
      */}
      <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        {TIERS_INTRO.lead}
      </h2>
      <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper/85">
        {TIERS_INTRO.body}
      </p>

      <p className="mt-10 font-sans text-[12px] uppercase tracking-[0.18em] text-brand-teal">
        {TIERS_INTRO.title}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {rows.map(({ tier, full, due, credit }, level) => (
          <div
            key={tier.sku}
            className="flex flex-col gap-0 rounded-2xl border border-brand-gold/25 bg-white/[0.04] p-5"
          >
            <h3 className="font-sans text-[16px] font-semibold text-brand-paper">{tier.label}</h3>
            {/*
              THREE STATES, and the middle one is the whole point of this page.

              Jeremy walked the upgrade with his own card and it dropped him
              straight into Stripe at full price, with no chance to see the
              other tiers. His design: come back to the tiles with the discount
              ALREADY APPLIED and the old price struck through, and anything
              already owned greyed out and saying so.

              `owned` is -1 on the open offer page, which collapses this back to
              exactly what it was.
            */}
            {level <= owned ? (
              <>
                <p className="mt-3 font-display text-[2rem] leading-none text-brand-muted tabular-nums">
                  {money(full)}
                </p>
                <p className="mt-2 text-[14px] font-semibold leading-snug text-brand-teal">
                  You already have this
                </p>
              </>
            ) : owned >= 0 ? (
              <p className="mt-3 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[2rem] leading-none text-brand-gold tabular-nums">
                  {money(Math.max(0, full - rows[owned].tier.cents))}
                </span>
                <span className="font-display text-[1.25rem] leading-none text-brand-muted line-through tabular-nums">
                  {money(full)}
                </span>
              </p>
            ) : (
              <p className="mt-3 font-display text-[2rem] leading-none text-brand-gold tabular-nums">
                {money(full)}
              </p>
            )}
            {owned >= 0 && level > owned && (
              <p className="mt-2 text-[14px] leading-snug text-brand-teal">
                {money(rows[owned].tier.cents)} already paid comes off
              </p>
            )}
            {owned < 0 && credit > 0 && (
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
            {/*
              Only the summary can be delivered today, so only the summary is
              offered. Said in words rather than shown as a dead grey button:
              a control that does nothing is a worse answer than a sentence.
              The refusal itself lives in the checkout function -- see
              shared/availability.mjs.
            */}
            {level <= owned ? (
              <p className="mt-auto pt-3 text-[14px] leading-snug text-brand-muted">
                It is on the link in your email, and it stays there for a year.
              </p>
            ) : !sellable(level) ? (
              <p className="mt-auto pt-3 text-[14px] leading-snug text-brand-muted">
                {TIERS_INTRO.notYet}
              </p>
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

      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
        {LADDER_NOTE}
      </p>
      {/*
        The standalone call to action is gone, deliberately.

        It said "Start with the summary" at a price and linked to #yours -- the
        form immediately below it. Pressing it moved nobody anywhere, and it
        quoted a price for something the form beneath was handing over free.
        Reported as circular routing, and it was.

        The cards above already carry the purchase, and the form below already
        introduces itself. A third control that duplicates one and points at the
        other is not a path in, it is a loop.

        It comes back when PAYWALL is on and the two are no longer the same
        thing -- at which point it can honestly be the buy button.
      */}
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
      setProblem(
        r.ok
          ? "Your payment went through and your link is on its way by email. If it has not " +
            "arrived in a few minutes, hd-readings@thechampagnemethod.co is read by Jeremy."
          : r.message,
      );
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
        {problem ?? "Opening your reading…"}
      </p>
    </div>
  );
}

/**
 * THE TILES, PRICED AGAINST WHAT A LINK ALREADY OWNS.
 *
 * Jeremy walked the upgrade with his own card: the button dropped him straight
 * into Stripe, at full price, with no chance to see what the other tiers were
 * or to pick a different one. This is the page he asked for instead -- the same
 * tiles, the discount already applied, and anything already owned greyed out.
 *
 * The tier comes from the SERVER, from the signed token, not from anything the
 * page works out. A page that decided for itself what somebody owned would be
 * a page that could be argued with.
 */
function UpgradeView({ token }: { token: string }) {
  const [owned, setOwned] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((body) => alive && setOwned(Number(body?.tier ?? 0)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="font-sans text-brand-paper">
      <Nav />
      <main>
        <section className="mx-auto max-w-5xl px-6 pt-16 sm:px-8">
          <h1 className="font-display text-[clamp(1.7rem,4vw,2.25rem)] font-medium leading-[1.15] tracking-tight text-brand-gold">
            What else there is
          </h1>
          {/*
            NOTHING IS SAID ABOUT PRICE UNTIL THE SERVER HAS ANSWERED.
            Caught by looking at the deployed page: for the moment the fetch was
            in flight it promised a credit above three tiles that had not
            rendered yet -- and if the link then turned out to be unreadable,
            that promise was already read. The tiles were guarded against
            exactly this and the sentence above them was not.
          */}
          <p className="mt-4 min-h-[3.5rem] max-w-[60ch] text-[17px] leading-relaxed text-brand-paper/90">
            {owned === null && !failed
              ? "Reading your link…"
              : failed
                ? "That link could not be read just now, so the prices below are the full ones. Your reading is safe — opening the link from your email again usually sorts it."
                : "What you have already paid comes off whichever you choose. Nobody pays twice for the same thing."}
          </p>
        </section>
        {/*
          Rendered only once the server has answered. Showing full prices for a
          moment and then quietly restriking them is how somebody comes away
          remembering the wrong number.
        */}
        {(owned !== null || failed) && <Tiers owned={owned ?? -1} token={token} />}
        <Resources />
      </main>
      <Footer />
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

  if (upgradeToken) return <UpgradeView token={upgradeToken} />;

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
        <Example />
        <Tiers />
        <Credibility />
        <Resources />
      </main>
      <Footer />
    </div>
  );
}
