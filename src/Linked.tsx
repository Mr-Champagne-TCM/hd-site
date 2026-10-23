import { linkedRuns } from "../shared/readingTerms.mjs";
import { hint, libraryHint } from "../shared/linkHints.mjs";

/**
 * FIX 7 (Jeremy 10/19): "make the words clickable and they land in the right
 * place in the human design library. Decode here, don't dilute."
 *
 * The reading's own words, exactly as written, with each Human Design term
 * opening its library entry -- the same terms and anchors the PDF links
 * (shared/readingTerms.mjs), first mention per destination per paragraph.
 * A quiet teal underline marks them, the page's own link style.
 */
export type ChartFacts = {
  type?: string;
  profile?: string | number;
  incarnationCross?: string;
  channels?: string[];
};

export default function Linked({ text, chart }: { text: string; chart: ChartFacts }) {
  const runs = linkedRuns(text, chart) as Array<{ text: string; href: string | null }>;
  return (
    <>
      {runs.map((r, i) =>
        r.href ? (
          <a
            key={i}
            href={r.href}
            {...hint(r.text, libraryHint(r.text))}
            rel="noreferrer"
            className="underline decoration-brand-teal/50 decoration-1 underline-offset-[3px] transition-colors hover:text-brand-teal hover:decoration-brand-teal"
          >
            {r.text}
          </a>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}
