import { CENTERS, channelLink, lineLink } from "../shared/libraryLinks.mjs";
import { hint, libraryHint } from "../shared/linkHints.mjs";
import Linked, { type ChartFacts } from "./Linked";
import { markedFields } from "../shared/timeSpread.mjs";
import { Tag, measuredSpread } from "./TimeSpread";

/**
 * "START HERE" -- centers, channels, profile, each a short list with the
 * library's one-liner and a Takeaway made of sentences the reading already
 * holds (moved up, never rewritten). The same section as pages 3-4 of both
 * PDFs and the phone's Reading tab, built by the same server function
 * (netlify/lib/readingView.mjs), so the page cannot say something else.
 */

export type Item = { title: string; name: string; tag: string; line: string };

export type ReadingView = {
  summary: Record<string, string>;
  definedCenters: Item[];
  otherCenters: Item[];
  centersTakeaway: string[];
  channels: Item[];
  channelsTakeaway: string[];
  profile: string;
  profileLines: Item[];
  profileLinesTakeaway: string[];
  reading: Array<{ heading: string; lede: string | null; paragraphs: string[] }>;
  takeaways: string[];
  disclaimer: string;
};

export const NO_CHANNELS = "No defined channels.";

function Head({ n, title, count, tag = false }: { n: number; title: string; count?: string; tag?: boolean }) {
  return (
    <h3 className="mt-10 flex items-center gap-3 first:mt-0">
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-gold font-sans text-[13px] font-semibold text-brand-gold"
      >
        {n}
      </span>
      <span className="font-display text-[22px] font-medium text-brand-gold">{title}</span>
      {count && <span className="text-[15px] text-brand-muted">{count}</span>}
      {tag && <Tag />}
    </h3>
  );
}

function SubLabel({ children, tag = false }: { children: React.ReactNode; tag?: boolean }) {
  return (
    <p className="mt-4 font-sans text-[12px] uppercase tracking-[0.14em] text-brand-muted">
      {children}
      {tag && <Tag className="ml-2" />}
    </p>
  );
}

function List({ items, dim, href }: { items: Item[]; dim: boolean; href: (it: Item) => string }) {
  return (
    <ul className="mt-2 divide-y divide-white/[0.08] rounded-xl border border-brand-gold/20 bg-white/[0.03] px-4">
      {items.map((it) => (
        <li key={it.title + it.name} className="py-3">
          <p className={dim ? "text-[15px]" : "text-[16px]"}>
            <a
              href={href(it)}
              {...hint(!dim && it.name && it.name !== it.title ? `${it.title} ${it.name}` : it.title, libraryHint(it.title))}
              rel="noreferrer"
              className="font-semibold transition-colors hover:text-brand-teal"
            >
              <span className={dim ? "text-brand-muted" : "text-brand-gold"}>{it.title}</span>
              {!dim && it.name && it.name !== it.title && <span className="text-brand-paper"> {it.name}</span>}
            </a>
            {it.tag && <span className="text-[14px] text-brand-muted"> · {it.tag}</span>}
          </p>
          {it.line && (
            <p
              className={
                "mt-1 border-l-2 border-[#3FA7A0] pl-3 leading-relaxed " +
                (dim ? "text-[15px] text-brand-muted" : "text-[15.5px] text-brand-paper/90")
              }
            >
              {it.line}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Takeaway({ lines, chart }: { lines: string[]; chart: ChartFacts }) {
  if (!lines.length) return null;
  return (
    <div className="mt-4 border-l-[3px] border-brand-gold pl-4">
      <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-gold">Takeaway</p>
      {lines.map((t, i) => (
        <p key={i} className="mt-1 text-[17px] leading-relaxed text-brand-paper">
          {/* The reading's own sentences: their Human Design words link (fix 7). */}
          <Linked text={t} chart={chart} />
        </p>
      ))}
    </div>
  );
}

export default function StartHere({ v, chart }: { v: ReadingView; chart: ChartFacts }) {
  /**
   * WITH NO BIRTH TIME, the lists whose values change during the birth day
   * carry PROVISIONAL beside their label (Jeremy 10/22: "wherever it prints").
   */
  const marked = measuredSpread(chart) ? markedFields(chart) : new Set<string>();
  const others = marked.has("undefinedCenters") || marked.has("openCenters");
  return (
    <section aria-labelledby="start-here">
      <h2 id="start-here" className="font-display text-[clamp(1.3rem,3vw,1.6rem)] font-medium tracking-tight text-brand-paper">
        Start here
      </h2>
      <div className="mt-6">
        <Head n={1} title="Your centers" />
        <SubLabel tag={marked.has("definedCenters")}>Colored in ({v.definedCenters.length}) · steady, yours</SubLabel>
        {v.definedCenters.length ? (
          <List items={v.definedCenters} dim={false} href={() => CENTERS} />
        ) : (
          <p className="mt-2 text-[16px] text-brand-paper">None colored in.</p>
        )}
        {v.otherCenters.length > 0 && (
          <>
            <SubLabel tag={others}>Not colored in ({v.otherCenters.length}) · taken in from others</SubLabel>
            <List items={v.otherCenters} dim href={() => CENTERS} />
          </>
        )}
        <Takeaway lines={v.centersTakeaway} chart={chart} />

        <Head n={2} title="Your channels" count={`(${v.channels.length})`} tag={marked.has("channels")} />
        {v.channels.length ? (
          <List items={v.channels} dim={false} href={(it) => channelLink(it.title)} />
        ) : (
          <p className="mt-2 text-[16px] text-brand-paper">{NO_CHANNELS}</p>
        )}
        <Takeaway lines={v.channelsTakeaway} chart={chart} />

        <Head n={3} title="Your profile" count={v.profile} tag={marked.has("profile")} />
        <List items={v.profileLines} dim={false} href={(it) => lineLink(it.title)} />
        <Takeaway lines={v.profileLinesTakeaway} chart={chart} />
      </div>
    </section>
  );
}
