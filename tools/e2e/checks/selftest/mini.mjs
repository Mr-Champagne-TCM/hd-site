/**
 * A MINI RUN, for testing one check on a known document.
 *
 * A few documents are taken from a real run (the BASE: its manifest entries
 * and the text, JSON and PDF-text files they point to) and copied into a
 * scratch folder in the data home. A case then corrects them, or plants one
 * known error, and the check is run on that folder alone. The base run is
 * only ever read.
 *
 * Everything a case plants is short and made up. The copied documents stay
 * in the data home (outside the public repo), where the base run lives.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { truthFor } from "../load.mjs";

const J = (f) => JSON.parse(readFileSync(f, "utf8"));
const W = (f, s) => (mkdirSync(dirname(f), { recursive: true }), writeFileSync(f, s));
// An edit callback may change its argument in place (and return whatever an
// arrow returns) or return a replacement: only a replacement of the same kind counts.
const objOr = (r, a) => (r && typeof r === "object" && !Array.isArray(r) ? r : a);
const arrOr = (r, a) => (Array.isArray(r) ? r : a);

/** A labelled pick: `label` names what the case needs if the base has none. */
export const P = (label, fn) => Object.assign(fn, { label });

/** The base run, read lazily. Picks get it as their second argument. */
export function loadBase(dir) {
  const manifest = J(join(dir, "manifest.json"));
  const cache = new Map();
  const read = (rel, json) => {
    if (!rel) return null;
    const f = join(dir, rel);
    const k = `${json}|${f}`;
    if (!cache.has(k)) cache.set(k, existsSync(f) ? (json ? J(f) : readFileSync(f, "utf8")) : null);
    return cache.get(k);
  };
  let truth = null;
  return {
    dir,
    manifest,
    api: (p) => read(p.api, true),
    text: (p) => read(p.text, false) ?? "",
    session: (p) => read(p.session, true),
    /** The engine's full chart for a page's output (matched the way the checks match it). */
    truth: (out) => {
      truth ??= existsSync(join(dir, "truth")) ? readdirSync(join(dir, "truth")).map((f) => ({ chart: J(join(dir, "truth", f)) })) : [];
      return truthFor({ truth }, out);
    },
  };
}

export class Mini {
  /**
   * take: {
   *   pages:    [P(label, (page, base) => bool)]   each picks the first base page it matches
   *   journeys: [P(label, (journey, base) => bool)] a whole journey, every step and email
   *   steps:    [P(label, (journey, step, base) => bool)] one step (and its emails), in its journey
   *   fresh, myCharts: true                         the fresh-link / my-charts emails
   *   samples:  n                                   the first n website sample PDFs
   *   truth:    true                                the engine's charts for every birth
   * }
   */
  constructor(base, dir, take = {}) {
    this.base = base;
    this.dir = dir;
    this.opts = {};
    mkdirSync(dir, { recursive: true });
    const bm = base.manifest;
    this.manifest = { shop: bm.shop, website: bm.website, journeys: [], pages: [], errors: [], timings: JSON.parse(JSON.stringify(bm.timings ?? {})), freshLinkEmails: [], myChartsEmails: [], samples: [], links: [] };
    this.rig = { commit: "selftest", blocked: [] };
    this.combos = { journeys: [] };

    const taken = new Set();
    for (const pick of take.pages ?? []) {
      const p = bm.pages.find((x) => !taken.has(x.id) && pick(x, base));
      if (!p) throw new Error(`the base run has no page for: ${pick.label}`);
      taken.add(p.id);
      this.manifest.pages.push(this.#copyPage(p));
    }
    for (const pick of take.journeys ?? []) {
      const j = bm.journeys.find((x) => pick(x, base));
      if (!j) throw new Error(`the base run has no journey for: ${pick.label}`);
      this.#addJourney(j, j.steps);
    }
    for (const pick of take.steps ?? []) {
      let hit = null;
      for (const j of bm.journeys) for (const s of j.steps) if (!hit && pick(j, s, base)) hit = { j, s };
      if (!hit) throw new Error(`the base run has no step for: ${pick.label}`);
      this.#addJourney(hit.j, [hit.s]);
    }
    if (take.fresh) this.manifest.freshLinkEmails = (bm.freshLinkEmails ?? []).map((e) => this.#copyMail(e));
    if (take.myCharts) this.manifest.myChartsEmails = (bm.myChartsEmails ?? []).map((e) => this.#copyMail(e));
    if (take.samples) {
      this.manifest.samples = (bm.samples ?? []).slice(0, take.samples).map((s) => ({ ...s, textFile: this.#copyAbs(s.textFile, "pdf"), linksFile: this.#copyAbs(s.linksFile, "pdf") }));
      if (this.manifest.samples.length < take.samples) throw new Error("the base run has no website sample PDFs");
    }
    if (take.truth) {
      const td = join(base.dir, "truth");
      if (existsSync(td)) for (const f of readdirSync(td)) this.#copyRel(join("truth", f));
    }
  }

  #copyRel(rel) {
    if (!rel || !existsSync(join(this.base.dir, rel))) return rel;
    mkdirSync(dirname(join(this.dir, rel)), { recursive: true });
    copyFileSync(join(this.base.dir, rel), join(this.dir, rel));
    return rel;
  }
  #copyAbs(file, sub) {
    if (!file || !existsSync(file)) return file;
    const to = join(this.dir, sub, basename(file));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(file, to);
    return to;
  }
  #copyPage(p) {
    const q = JSON.parse(JSON.stringify(p));
    for (const k of ["text", "links", "api", "session"]) this.#copyRel(q[k]);
    if (!q.text) q.text = `cap/${q.id}.txt`;
    if (!existsSync(join(this.dir, q.text))) W(join(this.dir, q.text), "");
    if (q.pdf?.textFile) {
      q.pdf.textFile = this.#copyAbs(q.pdf.textFile, "pdf");
      q.pdf.linksFile = this.#copyAbs(q.pdf.linksFile, "pdf");
    }
    return q;
  }
  #copyMail(e) {
    const q = { ...e };
    for (const ext of [".txt", ".html"]) if (existsSync(e.file + ext)) this.#copyAbs(e.file + ext, "mail");
    q.file = join(this.dir, "mail", basename(e.file));
    if (!existsSync(q.file + ".txt")) W(q.file + ".txt", "");
    return q;
  }
  #addJourney(j, steps) {
    let mj = this.manifest.journeys.find((x) => x.id === j.id);
    if (!mj) {
      mj = { ...j, steps: [] };
      this.manifest.journeys.push(mj);
      this.combos.journeys.push({ id: j.id, buyer: "Wren Testwell", steps: j.steps.map((s) => ({ do: s.do, tier: s.tier })) });
    }
    for (const s of steps) if (!mj.steps.some((x) => x.id === s.id)) mj.steps.push({ ...s, emails: (s.emails ?? []).map((e) => this.#copyMail(e)) });
    mj.steps.sort((a, b) => j.steps.findIndex((s) => s.id === a.id) - j.steps.findIndex((s) => s.id === b.id));
  }

  /** One more base page, copied in. */
  include(p) {
    const q = this.#copyPage(p);
    this.manifest.pages.push(q);
    return q;
  }

  /* ---- finding things ---- */
  get pages() {
    return this.manifest.pages;
  }
  page(pred) {
    const p = this.manifest.pages.find((x) => (typeof pred === "function" ? pred(x, this) : x.kind === pred || x.id === pred));
    if (!p) throw new Error(`no page in this mini run for: ${pred.label ?? pred}`);
    return p;
  }
  /** Every email in this mini run: the journeys' steps, then the fresh-link and my-charts ones. */
  mails(pred = () => true) {
    const out = [];
    for (const j of this.manifest.journeys) for (const s of j.steps) for (const e of s.emails ?? []) out.push(Object.assign(e, { _step: s }));
    out.push(...this.manifest.freshLinkEmails, ...this.manifest.myChartsEmails);
    return out.filter(pred);
  }

  /* ---- reading and changing them ---- */
  text(p) {
    return readFileSync(join(this.dir, p.text), "utf8");
  }
  edit(p, fn) {
    W(join(this.dir, p.text), fn(this.text(p)));
  }
  api(p) {
    return J(join(this.dir, p.api));
  }
  editApi(p, fn) {
    const a = this.api(p);
    W(join(this.dir, p.api), JSON.stringify(objOr(fn(a), a)));
  }
  session(p) {
    return J(join(this.dir, p.session));
  }
  editSession(p, fn) {
    const s = this.session(p);
    W(join(this.dir, p.session), JSON.stringify(objOr(fn(s), s)));
  }
  pdf(p) {
    return J(p.pdf.textFile);
  }
  editPdf(p, fn) {
    const pages = this.pdf(p);
    W(p.pdf.textFile, JSON.stringify(arrOr(fn(pages), pages)));
  }
  mailText(e) {
    return readFileSync(e.file + ".txt", "utf8");
  }
  editMail(e, fn) {
    W(e.file + ".txt", fn(this.mailText(e)));
  }
  editSample(s, fn) {
    const t = J(s.textFile);
    W(s.textFile, JSON.stringify(arrOr(fn(t), t)));
  }
  /** A made-up page with its own text (for a page kind the base run lacks). */
  addPage(entry, text) {
    const p = { links: `cap/${entry.id}.links.json`, text: `cap/${entry.id}.txt`, phoneScrollWidth: 390, ...entry };
    W(join(this.dir, p.text), text);
    W(join(this.dir, p.links), "[]");
    this.manifest.pages.push(p);
    return p;
  }
  /** A made-up email file (its manifest entry is the caller's to place). */
  addMail(name, subject, text, extra = {}) {
    const file = join(this.dir, "mail", name);
    W(file + ".txt", text);
    return { subject, file, from: "Human Design by The Champagne Method <hd-readings@thechampagnemethod.co>", to: "rig-buyer@example.com", ...extra };
  }
  /** An alert to Jeremy, in the outbox the way the fake mailer writes one. */
  alert(subject, text) {
    const file = join(this.dir, "outbox", "900-alert");
    W(file + ".txt", text);
    W(file + ".json", JSON.stringify({ n: 900, subject, file, to: "hd-readings@thechampagnemethod.co" }));
  }
  /** A stored live reading (the data-home fixtures the AI checks read). */
  fixture(name, records) {
    W(join(this.dir, "fixtures", name), JSON.stringify(records));
  }
  /** A file in the phone app's source tree. */
  phoneFile(rel, text) {
    W(join(this.dir, "phone", "app", "src", "main", rel), text);
  }
  /** A record in the local store, as the harness keeps it. */
  blob(id, record) {
    W(join(this.dir, "blobs", "entries", "rig-local", encodeURIComponent("site:readings"), id), JSON.stringify(record));
  }

  save() {
    W(join(this.dir, "manifest.json"), JSON.stringify(this.manifest, (k, v) => (k === "_step" ? undefined : v), 1));
    W(join(this.dir, "rig.json"), JSON.stringify(this.rig));
    W(join(this.dir, "combos.json"), JSON.stringify(this.combos));
    mkdirSync(join(this.dir, "fixtures"), { recursive: true });
  }
}
