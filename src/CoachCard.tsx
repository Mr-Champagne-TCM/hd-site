import { COACH } from "../shared/readingCopy.mjs";
import { HINT, hint } from "../shared/linkHints.mjs";

/**
 * FIX 10B (Jeremy 10/19): the coaching card at the end of the reading, on the
 * page as in the PDF -- his current site photo (approach-candid.jpg, cropped
 * round), "Talk it through with Jeremy", and the free 30-minute conversation.
 * The natural next step the newcomer review found was never offered.
 */
export default function CoachCard() {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-brand-teal/40 bg-brand-teal/[0.06] p-5 sm:flex-row sm:items-center sm:p-6">
      <img
        src="/jeremy.jpg"
        alt="Jeremy Champagne"
        width={96}
        height={96}
        className="h-24 w-24 shrink-0 rounded-full object-cover"
      />
      <div>
        <h2 className="font-display text-[22px] font-medium text-brand-paper">{COACH.head}</h2>
        <p className="mt-1 max-w-[52ch] text-[16px] leading-relaxed text-brand-paper/85">{COACH.body}</p>
        <a
          href={COACH.url}
          {...hint(COACH.link, HINT.connect)}
          className="mt-4 inline-block rounded-full bg-brand-teal px-6 py-3 font-sans text-[16px] font-semibold text-[#0d1b1a] shadow-lg shadow-brand-teal/25 transition-all duration-200 hover:-translate-y-0.5"
        >
          {COACH.link} →
        </a>
      </div>
    </div>
  );
}
