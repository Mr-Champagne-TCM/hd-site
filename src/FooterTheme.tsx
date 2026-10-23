import { footerColumns, PRIVACY_LABEL } from "../shared/footerTheme.mjs";
import { HINT, hint } from "../shared/linkHints.mjs";
import { SITE } from "./copy";

/**
 * THE FOOTER THEME ON THE SHOP'S OWN PAGES (Jeremy 10/17, footer-everywhere
 * mock): the same two names the delivery email ends with, side by side on a
 * computer and stacked on a phone. Words and links come from
 * shared/footerTheme.mjs, the file the email reads too.
 *
 * The HD name takes THIS site's gold (brand-gold, the champagne of every
 * heading here) rather than the email's darker gold: a colour this page does
 * not otherwise use would look like a mistake. The business name is the
 * lavender the email uses.
 *
 * `privacy` adds the "What I keep, and for how long" line under the two
 * columns, for pages that have no other footer (the reading page and its
 * messages). The offer page's footer already lists Privacy in its link row.
 */
const GOLD = "#E8CBA0";

/** "#a78bfa" -> "rgba(167,139,250,0.55)", the thin bar beside each column. */
function tint(hex: string, a: number) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

export default function FooterTheme({ privacy = false }: { privacy?: boolean }) {
  const cols = footerColumns(GOLD) as { href: string; name: string; line: string; color: string; hint: string }[];
  return (
    <div data-footer-theme="">
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {cols.map((c) => (
          <div key={c.href} className="pl-3" style={{ borderLeft: `2px solid ${tint(c.color, 0.55)}` }}>
            <a
              href={c.href}
              {...hint(c.name, c.hint)}
              className="font-sans text-[16px] font-semibold leading-snug no-underline hover:underline"
              style={{ color: c.color }}
            >
              {c.name}
            </a>
            <p className="mt-1 text-[15px] leading-relaxed text-brand-muted">{c.line}</p>
          </div>
        ))}
      </div>
      {privacy && (
        <p className="mt-5 text-[14px]">
          <a
            href={SITE.privacy}
            {...hint(PRIVACY_LABEL, HINT.privacy)}
            className="text-brand-muted underline decoration-brand-muted/40 underline-offset-4 hover:text-brand-teal"
          >
            {PRIVACY_LABEL}
          </a>
        </p>
      )}
    </div>
  );
}

/**
 * The end of a page that has no footer of its own: a rule, then the theme with
 * the privacy line. Used under every state of the reading page (/r/...).
 */
export function PageEnd() {
  return (
    <footer className="mt-16 border-t border-brand-gold/15 pt-8">
      <FooterTheme privacy />
    </footer>
  );
}
