import { useEffect, useState } from "react";
import TimeField from "./entry/TimeField";
// The form's words live with the offer's (the rig's checks read the same ones).
import { ADD_TIME } from "../shared/timeSpread.mjs";
import { KeptLine, btn, btnQuiet, h1 } from "./Returning";
import MailtoText from "./MailtoText";
import { PageEnd } from "./FooterTheme";
import { MESSAGES, customerText } from "../shared/customerMessages.mjs";

/**
 * "ADD YOUR BIRTH TIME" (Jeremy 10/22: "they can 'update birth time at no
 * cost and get an updated reading'"). The time-only form behind "Found your
 * birth time? You're welcome to add it here, once and free":
 *
 *   /r/<reading link>#add-time   from the reading page (ReadingPage)
 *   /t/<add-time key>            from the PDF -- a key that never expires
 *
 * Only the time: the kept date and place are shown, not asked; there is no
 * "I don't know" (they have just found it). Once used, both ways in say so
 * kindly (AddTimeNotice). The rules live on the server (netlify/lib/addTime.mjs).
 */

const shell = "page-bottom mx-auto max-w-3xl px-6 pt-16 sm:px-8";

/** "#add-time" on the reading page, followed as it changes. */
export function useAddTimeHash() {
  const read = () => (typeof window !== "undefined" ? window.location.hash === "#add-time" : false);
  const [on, setOn] = useState(read);
  useEffect(() => {
    const f = () => {
      setOn(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return on;
}

type Said = { heading?: string; text: string | null };
const SAID = MESSAGES as Record<string, Said>;
/** The catalogue's words, the summary tier's own where it has them ("this summary", 10/22). */
const say = (key: string, tier: number): Said => (tier === 0 && SAID[`${key}-summary`]) || SAID[key];
const sayText = (key: string, tier: number) => say(key, tier)?.text ?? customerText(key);

/** The kind words for a chart whose time cannot be added (used, known, none), as the server words them. */
export function AddTimeNotice({ state, tier }: { state: string; tier?: number }) {
  const key = state === "used" ? "addtime-used" : state === "known" ? "addtime-known" : "addtime-none";
  const m = say(key, tier ?? -1);
  // Opened from "add it here": brought into view, as the form would be (the page draws after the browser looked for the anchor).
  useEffect(() => {
    document.getElementById("add-time")?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <section id="add-time" data-add-time={state} className="mt-6 rounded-2xl border border-brand-teal/40 bg-brand-teal/[0.07] px-5 py-4">
      <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-teal">{m.heading}</p>
      <p className="mt-2 text-[16px] leading-relaxed text-brand-paper">
        <MailtoText text={m.text ?? ""} />
      </p>
    </section>
  );
}

/**
 * THE FORM. `token` (the page's reading link) or `keyToken` (the PDF's key)
 * says which chart; `kept` is the date and place it was cast for.
 */
export function AddTimeForm({
  token = null,
  keyToken = null,
  tier,
  kept,
  onCancel = null,
}: {
  token?: string | null;
  keyToken?: string | null;
  tier: number;
  kept: string | null;
  onCancel?: (() => void) | null;
}) {
  const [time, setTime] = useState("");
  const [state, setState] = useState<{ at: "idle" | "working" } | { at: "failed"; message: string }>({ at: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!time || state.at === "working") return;
    setState({ at: "working" });
    try {
      const res = await fetch("/api/add-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(keyToken ? { key: keyToken } : { token }), time }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setState({ at: "failed", message: body?.error?.message ?? sayText("addtime-slow", tier) });
        return;
      }
      // The chart, redone: the page's own link again, or (from the PDF) the fresh one that came back.
      const t = body.token ?? token;
      window.location.replace(`/r/${encodeURIComponent(t)}`);
    } catch {
      // Nothing reached the server (the connection dropped, or the request never left), so nobody was told:
      // its own honest line, not "addtime-slow" (batch-1024 item 3). A server that answered keeps its words above.
      setState({ at: "failed", message: sayText("addtime-connection-dropped", tier) });
    }
  }

  return (
    <div className={shell}>
      <section id="add-time" data-add-time="open">
        <h1 className={h1}>{ADD_TIME.title}</h1>
        <p className="mt-4 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper/90">{ADD_TIME.intro(tier)}</p>
        {kept && (
          <div className="max-w-[34rem]">
            <KeptLine label={ADD_TIME.kept(tier)} line={kept} />
          </div>
        )}
        <form onSubmit={submit} className="mt-7 max-w-[34rem]">
          <TimeField value={time} onChange={setTime} unknown={false} onUnknownChange={() => {}} askUnknown={false} />
          <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
            <button type="submit" disabled={!time || state.at === "working"} className={btn}>
              {state.at === "working" ? "Working…" : ADD_TIME.button(tier)}
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel} className={btnQuiet}>
                {ADD_TIME.notNow}
              </button>
            )}
          </div>
        </form>
        {state.at === "failed" && (
          <p className="mt-6 max-w-[62ch] rounded-xl border border-brand-gold/50 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
            <MailtoText text={state.message} />
          </p>
        )}
        <p className="mt-6 max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">{ADD_TIME.privacy(tier)}</p>
      </section>
      {/* The footer theme (Jeremy 10/17): every state of the page ends the same way, inside its margins. */}
      <PageEnd />
    </div>
  );
}

type Look =
  | { at: "loading" }
  | { at: "open"; tier: number; kept: string | null }
  | { at: "closed"; state: string; tier: number }
  | { at: "failed"; heading: string | null; message: string };

/**
 * /t/<key>: THE PDF'S WAY IN. It asks where the chart stands, then shows the
 * form, or the kind words when the time cannot be added, or -- a chart past
 * its year -- that it is no longer kept.
 */
export function AddTimePage({ keyToken }: { keyToken: string }) {
  const [look, setLook] = useState<Look>({ at: "loading" });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/add-time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: keyToken, look: true }),
        });
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !body?.state) {
          setLook({
            at: "failed",
            heading: body?.error?.heading ?? null,
            message: body?.error?.message ?? customerText(res.status >= 500 ? "reading-unavailable" : "addtime-key-bad"),
          });
          return;
        }
        setLook(body.state === "open" ? { at: "open", tier: body.tier, kept: body.kept ?? null } : { at: "closed", state: body.state, tier: body.tier ?? 1 });
      } catch {
        if (alive) setLook({ at: "failed", heading: MESSAGES["reading-connection-dropped"].heading ?? null, message: customerText("reading-connection-dropped") });
      }
    })();
    return () => {
      alive = false;
    };
  }, [keyToken]);

  if (look.at === "loading") {
    return (
      <div className={shell}>
        <p className="text-[17px] text-brand-muted">Finding your chart…</p>
      </div>
    );
  }
  if (look.at === "open") return <AddTimeForm keyToken={keyToken} tier={look.tier} kept={look.kept} />;
  if (look.at === "closed") {
    const key = look.state === "used" ? "addtime-used" : look.state === "known" ? "addtime-known" : look.state === "pending" ? "pdf-not-ready" : "addtime-none";
    const m = say(key, look.tier);
    return (
      <div className={shell}>
        <section id="add-time" data-add-time={look.state}>
          <h1 className={h1}>{m.heading}</h1>
          <p className="mt-5 max-w-[60ch] rounded-xl border border-brand-gold/40 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
            <MailtoText text={m.text ?? ""} />
          </p>
        </section>
        <PageEnd />
      </div>
    );
  }
  return (
    <div className={shell}>
      <section id="add-time" data-add-time="failed">
        <h1 className={h1}>{look.heading ?? "That link could not be opened"}</h1>
        <p className="mt-5 max-w-[60ch] rounded-xl border border-brand-gold/40 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
          {/* The panel does not open by repeating the heading above it (W6), as the reading page's does not. */}
          <MailtoText text={look.message.replace(/^That link could not be opened\.\s*/, "")} />
        </p>
      </section>
      <PageEnd />
    </div>
  );
}
