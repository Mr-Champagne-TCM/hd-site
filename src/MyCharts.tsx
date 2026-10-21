import { useState } from "react";
import { MY_CHARTS } from "./copy";
import { Footer, Nav } from "./App";
import MailtoText from "./MailtoText";
import { customerText } from "../shared/customerMessages.mjs";
import { btn, h1 } from "./Returning";

/**
 * "EMAIL ME MY CHARTS" (release 2, Jeremy 10/20 "3B"), at /charts/.
 *
 * One field: the email used when buying. Pressing the button sends a fresh
 * link to every person's chart bought with it TO THAT INBOX, and the page says
 * the same thing whether or not that address has any -- so nobody can use it
 * to learn who bought here. Nothing about a chart is ever shown on this page.
 */
export default function MyChartsPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<
    { at: "idle" } | { at: "sending" } | { at: "sent"; to: string } | { at: "failed"; message: string }
  >({ at: "idle" });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const to = email.trim();
    if (!to) return;
    setState({ at: "sending" });
    try {
      const res = await fetch("/api/my-charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: to }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.sent) {
        setState({ at: "sent", to });
        return;
      }
      setState({ at: "failed", message: body?.error?.message ?? customerText("mycharts-unavailable") });
    } catch {
      setState({ at: "failed", message: customerText("mycharts-unavailable") });
    }
  }

  return (
    <div className="font-sans text-brand-paper">
      <Nav />
      <main>
        <section className="page-bottom mx-auto max-w-3xl px-6 pt-16 sm:px-8">
          <h1 className={h1}>{MY_CHARTS.title}</h1>
          <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-brand-paper/90">{MY_CHARTS.body}</p>
          {state.at === "sent" ? (
            <div
              role="status"
              className="mt-8 max-w-[34rem] rounded-2xl border border-brand-teal/40 bg-brand-teal/[0.07] px-5 py-5"
            >
              <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-teal">
                {MY_CHARTS.sentHead}
              </p>
              <p className="mt-2 break-words text-[18px] leading-snug text-brand-paper">{MY_CHARTS.sentLine(state.to)}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-brand-paper/85">{MY_CHARTS.sentMore}</p>
            </div>
          ) : (
            <form onSubmit={send}>
              <label className="mt-8 block font-sans text-[15px] font-semibold text-brand-paper" htmlFor="my-charts-email">
                {MY_CHARTS.label}
              </label>
              <input
                id="my-charts-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full max-w-[26rem] rounded-xl border border-brand-gold/30 bg-ground-top/60 px-4 py-3.5 text-[17px] text-brand-paper placeholder:text-brand-muted/50 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
              />
              <div className="mt-6">
                <button type="submit" disabled={state.at === "sending" || !email.trim()} className={btn}>
                  {state.at === "sending" ? "Sending…" : MY_CHARTS.button}
                </button>
              </div>
              {state.at === "failed" && (
                <p className="mt-5 max-w-[60ch] rounded-xl border border-brand-gold/50 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
                  <MailtoText text={state.message} />
                </p>
              )}
              <p className="mt-5 max-w-[60ch] text-[15px] leading-relaxed text-brand-muted">{MY_CHARTS.nothingShown}</p>
            </form>
          )}
          <p className="mt-10 text-[15px]">
            <a href="/" className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4">
              ← {MY_CHARTS.back}
            </a>
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
