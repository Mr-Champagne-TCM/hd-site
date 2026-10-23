import { DISCLAIMER, allProblems, checkByName, formattingProblem, sanitize } from "./interpretation.mjs";
import {
  PLACEHOLDERS,
  getSlot,
  renderReading,
  sectionOf,
  sectionSlots,
  setSlots,
  slotLabel,
  slotNote,
  summarySlotOf,
} from "./structured.mjs";

/**
 * RE-ASK ONLY THE FAILING PART (Jeremy 10/23: "yes, reask only failing part.
 * This makes perfect sense").
 *
 * Until now a refused draft was thrown away whole and the model asked for a
 * new reading with no word on why; 74% of refused drafts had exactly ONE
 * problem (v3p-v3s census). Now every problem of the draft is collected
 * (allProblems), each is traced to the slot(s) of the form it rests on, and
 * the model is asked again for ONLY those slots -- shown its own draft as
 * read-only context, the failing words, and the checker's exact message(s).
 * Its new words go back into its own draft (setSlots) and EVERY check runs
 * again on the whole result; only a draft that passes them all is delivered.
 *
 * THE MODEL WRITES EVERY WORD (Jeremy 9/9 + 10/4: check, then ask again, never
 * rewrite). Nothing here writes or changes a sentence: it only chooses which
 * of the model's words to keep and which to ask for again.
 *
 * A problem that is not one slot's (no disclaimer, too short, a form of
 * placeholders, sections missing or out of order, a copy across two slots,
 * a form that is not JSON) gets a fresh draft, as before.
 *
 * WHICH SLOT A REFUSAL RESTS ON, in order:
 *   1. the message's longest quoted excerpt, found in the page text and
 *      matched to the slot it sits in (renderReading's spans);
 *   2. failing that, one slot at a time: the slot whose blanking changes the
 *      check's answer;
 *   3. failing that, a section or summary row the message names, for the
 *      checks that refuse something MISSING from it ("never names one of this
 *      chart's open centers").
 * Every answer of 1 and 2 is confirmed the same way: the check is run again
 * on the draft with those slots blanked, and must answer differently.
 */

/** More failing slots than this in one draft: a fresh draft instead. */
export const FIX_SLOTS = 5;
/** What a slot holds while a check is run without it. */
const BLANK = "Blank.";
/** Checks that refuse what is MISSING from a section: blanking never moves them (step 3). */
const ABSENCE = new Set(["openCentre", "structure"]);
/** Never one slot's: a fresh draft. */
const NOT_LOCAL = new Set(["disclaimer", "tooShort"]);

/**
 * THE WORDS OF A RE-ASK, the same on the phone (Reask.kt). The copy check holds
 * a draft against these as it does against the prompt and the form notes.
 */
export const FIX_DRAFT = "YOUR DRAFT OF THIS READING, AS THE PAGE WOULD PRINT IT (read only; it stays as it is):";
export const FIX_ASK =
  "A CHECK REFUSED PART OF THIS DRAFT. Write ONLY the part(s) named below again, each one whole, in the small form " +
  "you are given. Fix exactly what the check says, keep to every rule you were given, and fit each part to the rest " +
  "of the draft without repeating its sentences.";
export const FIX_WORDS = [FIX_DRAFT, FIX_ASK];
const marker = (id) => `PART ${id} GOES HERE`;

/** The opening checks of firstProblem, as checks of their own (allProblems' four). */
function openingCheck(rule) {
  if (rule === "formatting") return (t) => formattingProblem(t);
  if (rule === "question") {
    return (t) => {
      const at = t.indexOf(DISCLAIMER);
      const body = (at >= 0 ? t.slice(0, at) : t).trim();
      return body.slice(-400).includes("?") ? "The reading ended by asking the client a question." : null;
    };
  }
  return null;
}
const checkFor = (rule) => checkByName(rule) ?? openingCheck(rule);

/** Quoted words in a checker message, without the "..." an excerpt carries. */
export function quotesOf(message) {
  const out = [];
  for (const m of String(message ?? "").matchAll(/"([^"]*)"/g)) {
    const q = m[1].replace(/^\.\.\./, "").replace(/\.\.\.$/, "").trim();
    if (q.length >= 3) out.push(q);
  }
  return out;
}

/**
 * Where a quoted excerpt sits in the page text, as [start, end), or null. As
 * written first; then word for word in lower case without punctuation (the
 * copy check quotes that way), the first and last word left out when there
 * are four or more (an excerpt can cut a word in two).
 */
export function findQuote(text, quote) {
  const at = text.indexOf(quote);
  if (at >= 0) return [at, at + quote.length];
  const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'");
  let want = norm(quote).match(/[a-z0-9']+/g) ?? [];
  if (want.length >= 4) want = want.slice(1, -1);
  if (want.length < 2) return null;
  const toks = [...norm(text).matchAll(/[a-z0-9']+/g)];
  outer: for (let i = 0; i + want.length <= toks.length; i++) {
    for (let k = 0; k < want.length; k++) if (toks[i + k][0] !== want[k]) continue outer;
    const last = toks[i + want.length - 1];
    return [toks[i].index, last.index + last[0].length];
  }
  return null;
}

/** The slots a stretch of the page text overlaps. */
function slotsAt(spans, [start, end]) {
  return spans.filter((s) => s.start < end && start < s.end).map((s) => s.id);
}

/** A message with its long quotes (excerpts) set aside: what it claims, not where it quotes from. */
const claimOf = (message) => String(message).replace(/"[^"]{25,}"/g, '"..."');

/**
 * DOES THE PROBLEM REST ON THESE SLOTS? The check is run again on the draft
 * with them blanked. It does when the check no longer answers, answers with
 * another claim, or makes the same claim from somewhere else (the next
 * takeaway ending on the same word). The same claim with the blank inside its
 * excerpt is the same place quoted again (a slip is read across a section's
 * lede and first paragraph), so it is not a yes.
 */
function restsOn(ctx, problem, ids) {
  const form = setSlots(ctx.form, Object.fromEntries(ids.map((id) => [id, BLANK])));
  const r = renderReading(form, ctx.output);
  let answer;
  if (problem.rule === "render" || r.problem) answer = r.problem ?? null;
  else {
    const check = checkFor(problem.rule);
    answer = check ? check(sanitize(r.text), ctx.output, ctx.copy) ?? null : null;
  }
  if (answer === problem.message) return false;
  if (answer === null || claimOf(answer) !== claimOf(problem.message)) return true;
  return !answer.includes(BLANK);
}

/** A section heading or summary label the message names, as slots. */
function namedSlots(message, form) {
  for (const q of quotesOf(message)) {
    const section = sectionOf(q);
    if (section) return sectionSlots(section, form);
    if (q === "Your incarnation cross") return ["incarnationCross"];
    if (q === "Your definition") return ["definition"];
    const row = summarySlotOf(q);
    if (row) return [row];
  }
  return null;
}

/**
 * The slots one problem rests on, or null when it is not one part's.
 * `ctx` = { form, output, text, spans, copy } for a draft that rendered, or
 * { form, output } for one that did not (a render problem).
 */
export function locate(problem, ctx) {
  const { rule, message } = problem;
  if (NOT_LOCAL.has(rule)) return null;
  if (rule === "render") return locateRender(message, ctx);
  if (rule === "structure") {
    // A summary row the page could not print; anything else (a section missing, out of order) is not local.
    const m = /^The summary panel came back missing (.+)\.$/.exec(message);
    if (!m) return null;
    const ids = m[1].split(", ").map((k) => summarySlotOf(k));
    return ids.every(Boolean) ? ids : null;
  }
  const spans = ctx.spans.filter((s) => s.end > s.start);
  // 1. The longest quoted excerpt.
  let best = null;
  for (const q of quotesOf(message)) {
    const at = findQuote(ctx.text, q);
    if (at && (!best || q.length > best.q.length)) best = { q, at };
  }
  if (best) {
    const ids = slotsAt(spans, best.at);
    if (rule === "copy" && ids.length > 1) return null; // a copy across two slots: a fresh draft
    if (ids.length && restsOn(ctx, problem, ids)) {
      // An excerpt can run on into the next slot ("...through p[aragraph two]"): the slots it rests on alone.
      const own = ids.length > 1 ? ids.filter((id) => restsOn(ctx, problem, [id])) : [];
      return own.length ? own : ids;
    }
  }
  // 2. One slot at a time.
  const alone = spans.map((s) => s.id).filter((id) => restsOn(ctx, problem, [id]));
  if (alone.length && alone.length <= FIX_SLOTS) return alone;
  if (alone.length) return null;
  // 3. What is missing from a place the message names.
  if (ABSENCE.has(rule)) return namedSlots(message, ctx.form);
  return null;
}

/** A form that did not render: a channel left without a sentence, an invitation in the Strategy line or How you decide. */
function locateRender(message, ctx) {
  if (String(message).startsWith(PLACEHOLDERS)) return null;
  const channel = /^The reading left channel (\d+)-(\d+) without a sentence\.$/.exec(message);
  if (channel) return [`channel_${channel[1]}_${channel[2]}`];
  const strategy = /^The reading's (Strategy line|How you decide) gives /.exec(message);
  if (strategy) {
    const candidates = strategy[1] === "Strategy line" ? ["summary_strategy"] : sectionSlots("decide", ctx.form);
    const problem = { rule: "render", message };
    const ids = candidates.filter((id) => restsOn(ctx, problem, [id]));
    if (ids.length) return ids;
    return restsOn(ctx, problem, candidates) ? candidates : null;
  }
  return null;
}

/**
 * EVERY HIT OF A CHECK, NOT ONLY ITS FIRST (10/23, round rk-a: a draft with all
 * six summary rows in lower case took five part asks, one row each, because a
 * check names only its first hit). With the slots of the first hit blanked, the
 * same check is run again: a new answer that does not quote the blank is the
 * next hit, located the same way on the blanked draft. Up to FIX_SLOTS of them.
 * The messages are the checker's own, as it would give them once the hits
 * before were mended.
 */
function furtherHits(first, ctx) {
  const out = [];
  let blanked = [...first.slots];
  let last = first.message;
  for (let i = 0; i < FIX_SLOTS; i++) {
    const form = setSlots(ctx.form, Object.fromEntries(blanked.map((id) => [id, BLANK])));
    const r = renderReading(form, ctx.output);
    if (r.problem) break;
    const text = sanitize(r.text);
    const check = checkFor(first.rule);
    const answer = check ? check(text, ctx.output, ctx.copy) ?? null : null;
    if (!answer || answer === last || answer.includes(BLANK)) break;
    const slots = locate({ rule: first.rule, message: answer }, { ...ctx, form, text, spans: r.spans });
    if (!slots || slots.some((id) => blanked.includes(id))) break;
    out.push({ rule: first.rule, message: answer, slots });
    blanked = [...blanked, ...slots];
    last = answer;
  }
  return out;
}

/**
 * THE PLAN FOR A REFUSED DRAFT: every problem and the slots it rests on, and,
 * when every one of them is local and they touch at most FIX_SLOTS slots, the
 * parts to ask for again: [{ id, label, words, messages }] in page order.
 */
export function planFix({ form, output, text = null, spans = [], problems, copy }) {
  const ctx = { form, output, text, spans, copy };
  const located = problems.flatMap((p) => {
    const first = { ...p, slots: locate(p, ctx) };
    return [first, ...(first.slots && p.rule !== "render" ? furtherHits(first, ctx) : [])];
  });
  const local = located.length > 0 && located.every((p) => p.slots && p.slots.length);
  const ids = [...new Set(located.flatMap((p) => p.slots ?? []))];
  if (!local || ids.length > FIX_SLOTS) return { problems: located, parts: null };
  const order = spans.map((s) => s.id);
  ids.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
  const parts = ids.map((id) => ({
    id,
    label: slotLabel(id),
    words: getSlot(form, id),
    messages: located.filter((p) => (p.slots ?? []).includes(id)).map((p) => p.message),
  }));
  return { problems: located, parts };
}

/** Every problem of a rendered draft (allProblems) with its plan; or the render problem's plan. */
export function refusedPlan({ form, output, rendered, copy }) {
  if (rendered.problem) {
    return planFix({ form, output, problems: [{ rule: "render", message: rendered.problem }], copy });
  }
  const text = sanitize(rendered.text);
  return planFix({ form, output, text, spans: rendered.spans ?? [], problems: allProblems(text, output, copy), copy });
}

/**
 * THE RE-ASK ITSELF: what is added to the facts, and the small form. The draft
 * is printed as the page would print it, each part being asked for again
 * marked in its place; then each part with the words the model wrote there and
 * what the check said about them.
 */
export function fixRequest(form, output, parts) {
  const marked = renderReading(setSlots(form, Object.fromEntries(parts.map((p) => [p.id, marker(p.id)]))), output);
  const draft = marked.text ?? "";
  const blocks = parts.map((p) =>
    [
      `Part "${p.id}", ${p.label}. As you wrote it:`,
      p.words || "(nothing)",
      ...p.messages.map((m) => `What the check said: ${m}`),
    ].join("\n"),
  );
  const text = ["", FIX_DRAFT, draft, "", FIX_ASK, "", blocks.join("\n\n"), ""].join("\n");
  const ids = parts.map((p) => p.id);
  const schema = {
    type: "OBJECT",
    properties: Object.fromEntries(ids.map((id) => [id, { type: "STRING", description: slotNote(id) }])),
    required: ids,
    propertyOrdering: ids,
  };
  return { text, schema };
}

/** The model's answer to a re-ask, put back into its own draft: only the asked-for slots, only strings. */
export function mergeFix(form, parts, answer) {
  const values = {};
  for (const p of parts) {
    const v = answer && typeof answer === "object" ? answer[p.id] : undefined;
    if (typeof v === "string") values[p.id] = v;
  }
  return setSlots(form, values);
}
