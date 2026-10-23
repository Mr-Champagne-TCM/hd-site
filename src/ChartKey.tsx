import { SITE } from "./copy";

/**
 * THE KEY UNDER THE CHART, as both PDFs print it (Jeremy 10/16): the four
 * ways a channel can be drawn, then the pointer to the long answer.
 *
 * The swatches are the engine drawing's own colours, because they are the key
 * to the picture directly above them; the words are the PDFs' words.
 */
const KEY: ReadonlyArray<readonly [string, string, string, string?]> = [
  ["Personality", "conscious — what you know", "#F0F3F9"],
  ["Design", "unconscious — what the body knows", "#7C5BFF"],
  ["Both", "held consciously and unconsciously", "#F0F3F9", "#7C5BFF"],
  ["Open", "not activated — open to others", "#1F3151"],
];

export default function ChartKey() {
  return (
    <div className="mt-3 border-t border-brand-gold/40 pt-3">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 min-[420px]:grid-cols-2">
        {KEY.map(([title, sub, fill, second]) => (
          <div key={title} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-[3px] inline-block h-[18px] w-[18px] shrink-0 border border-[#8A9099]"
              style={{
                background: second ? `linear-gradient(90deg, ${fill} 50%, ${second} 50%)` : fill,
              }}
            />
            <div>
              <dt className="text-[15px] font-semibold leading-tight text-brand-paper">{title}</dt>
              <dd className="text-[13px] leading-snug text-brand-muted">{sub}</dd>
            </div>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-brand-gold/20 pt-2 text-right text-[14px] text-brand-muted">
        <a
          href={SITE.bodygraph}
          rel="noreferrer"
          className="transition-colors hover:text-brand-teal"
        >
          How to read your bodygraph →{" "}
          <span className="font-semibold text-brand-gold">thechampagnemethod.co/library/bodygraph</span>
        </a>
      </p>
    </div>
  );
}
