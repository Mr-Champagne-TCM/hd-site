import { createContext, useContext } from "react";
import { closingCard } from "../shared/readingCopy.mjs";
import { HINT, hint } from "../shared/linkHints.mjs";

/**
 * THE CARD THAT ENDS A CHART OR A READING (11/16). It was the free thirty-minute
 * call (fix 10B, 10/19); Jeremy 11/16: "keep the 30 min free call for coaching
 * funnel only". Now, from the same closingCard() the PDF prints:
 *
 *   a one-to-one's reading   where to pick the thirty minutes
 *   anything else            the paid one-to-one, when it is sold, through
 *                            this chart's own upgrade link (what was paid comes off)
 *   otherwise                nothing
 *
 * The reading page says which, once, through this context, so the card can sit
 * anywhere in the reading without every layer in between passing it along.
 */
export type ClosingCardInfo = { session: boolean; offer: boolean; token: string | null; word: string; booking?: string | null };
export const ClosingCardContext = createContext<ClosingCardInfo | null>(null);

export default function CoachCard() {
  const info = useContext(ClosingCardContext);
  if (!info) return null;
  const card = closingCard({
    session: info.session,
    offer: info.offer,
    word: info.word,
    url: info.token ? `/u/${encodeURIComponent(info.token)}` : null,
    ...(info.session ? { bookingUrl: info.booking ?? null } : {}),
  });
  if (!card) return null;
  return (
    <div
      data-card={info.session ? "booking" : "one-to-one"}
      className="flex flex-col gap-5 rounded-2xl border border-brand-teal/40 bg-brand-teal/[0.06] p-5 sm:flex-row sm:items-center sm:p-6"
    >
      <img
        src="/jeremy.jpg"
        alt="Jeremy Champagne"
        width={96}
        height={96}
        className="h-24 w-24 shrink-0 rounded-full object-cover"
      />
      <div>
        <h2 className="font-display text-[22px] font-medium text-brand-paper">{card.head}</h2>
        <p className="mt-1 max-w-[52ch] text-[16px] leading-relaxed text-brand-paper/85">{card.body}</p>
        {card.link && card.url && (
          <a
            href={card.url}
            {...hint(card.link, info.session ? HINT.booking : HINT.oneToOne)}
            className="mt-4 inline-block rounded-full bg-brand-teal px-6 py-3 font-sans text-[16px] font-semibold text-[#0d1b1a] shadow-lg shadow-brand-teal/25 transition-all duration-200 hover:-translate-y-0.5"
          >
            {card.link} →
          </a>
        )}
      </div>
    </div>
  );
}
