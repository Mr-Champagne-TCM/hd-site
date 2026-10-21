/**
 * The run's report, one HTML page (printed to PDF beside it by print.py):
 *   1. the 10/21 error set, item by item: caught or not on this run;
 *   2. every check x every journey: pass / fail;
 *   3. the findings, grouped (one line per wording, with where it appears);
 *   4. changed words since the last release's baseline -- what to read;
 *   5. what the run did (journeys, AI sources, timings, cost 0).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { E2E } from "../harness/paths.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function coverage(results) {
  const set = JSON.parse(readFileSync(join(E2E, "errorset.json"), "utf8")).items;
  const byId = Object.fromEntries(results.checks.map((c) => [c.id, c]));
  return set.map((it) => {
    if (it.machine === false) return { ...it, state: "human" };
    const c = byId[it.check];
    if (!c) return { ...it, state: "missing" };
    const re = it.match ? new RegExp(it.match, "i") : null;
    const hits = c.findings.filter((f) => (!re || re.test(`${f.what} ${f.where} ${f.evidence}`)) && (!it.where || f.where.includes(it.where)));
    return { ...it, state: hits.length ? "caught" : "not-caught", hits: hits.length, example: hits[0] };
  });
}

function group(findings) {
  const g = new Map();
  for (const f of findings) {
    const k = f.what.replace(/\d+(\.\d+)? s for/, "# s for");
    if (!g.has(k)) g.set(k, { what: f.what, wheres: [], evidence: f.evidence, ai: f.ai, combos: new Set() });
    const x = g.get(k);
    x.wheres.push(f.where);
    x.combos.add(f.combo);
  }
  return [...g.values()];
}

export function writeReport({ runDir, results, seconds }) {
  const cov = coverage(results);
  const caught = cov.filter((c) => c.state === "caught");
  const machine = cov.filter((c) => c.state !== "human");
  const fails = results.checks.filter((c) => c.status === "fail");
  const cols = [...new Set(results.journeys.map((j) => j.id))];
  const siteCols = ["my-charts", "website", "links", "checker", "expired link", "readings site", "phone", "all"];
  const allCols = [...cols, ...siteCols.filter((s) => results.checks.some((c) => c.combos.includes(s) || c.findings.some((f) => f.combo === s)))];
  const cell = (c, col) => {
    const n = c.findings.filter((f) => f.combo === col).length;
    if (n) return `<td class="f" title="${n} finding(s)">✗ ${n}</td>`;
    if (c.combos.includes(col)) return `<td class="p">✓</td>`;
    return `<td class="n">·</td>`;
  };
  const gem = results.gemini ?? [];
  const fixtureN = gem.filter((g) => g.source !== "placeholder").length;
  const diff = results.diff ?? {};

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HD local test run</title>
<style>
:root{--ink:#1d2433;--muted:#5b6476;--line:#d5dae3;--red:#b3261e;--green:#1e7a46;--gold:#c9a227;--bg:#fff}
body{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg);font-size:10.5pt;line-height:1.38;max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:19pt;margin:0 0 4px;color:#14213d}h2{font-size:13pt;margin:18px 0 6px;color:#14213d;border-bottom:2px solid var(--gold);padding-bottom:3px}
h3{font-size:11pt;margin:12px 0 4px}.sub{color:var(--muted);margin:0 0 10px}
table{border-collapse:collapse;width:100%;margin:4px 0 10px}th,td{border:1px solid var(--line);padding:3px 6px;vertical-align:top;text-align:left;font-size:9pt}
th{background:#eef1f6}.f{color:var(--red);font-weight:700;text-align:center}.p{color:var(--green);text-align:center}.n{color:#aab;text-align:center}
.caught{color:var(--green);font-weight:700}.not-caught{color:var(--red);font-weight:700}.human{color:#a15c00;font-weight:700}
.stat{display:inline-block;border:1px solid var(--line);border-radius:6px;padding:4px 10px;margin:0 6px 6px 0;font-size:9.5pt}.stat b{display:block;font-size:14pt}
.fail{color:var(--red)}.pass{color:var(--green)}ul{margin:3px 0 8px 18px;padding:0}li{margin:2px 0}.ev{color:var(--muted);font-size:8.6pt}
.tag{font-size:7.5pt;border:1px solid #a15c00;color:#a15c00;border-radius:3px;padding:0 3px;margin-left:4px}
.plus{color:var(--green)}.minus{color:var(--red);text-decoration:line-through}.wrap{overflow-x:auto}.matrix th,.matrix td{font-size:7pt;padding:2px 3px;text-align:center}.matrix td:first-child{text-align:left;white-space:nowrap}.matrix th{word-break:break-all}
@media print{body{max-width:none;padding:0}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>
<h1>HD local test run</h1>
<p class="sub">Shop ${esc(results.commit)} · website ${esc(results.website ?? "-")} · engine ${esc(results.engine)} · ${esc(new Date(results.at).toLocaleString("en-US"))} · ${Math.round(seconds / 60)} min · <b>0 credits</b> (nothing deployed, no live Stripe, no email sent, no AI called)</p>
<div>
<span class="stat"><b class="${fails.length ? "fail" : "pass"}">${fails.length}</b>checks failing</span>
<span class="stat"><b>${results.checks.length - fails.length}</b>checks passing</span>
<span class="stat"><b>${caught.length} / ${machine.length}</b>error-set items caught</span>
<span class="stat"><b>${results.journeys.length}</b>journeys</span>
<span class="stat"><b>${results.journeys.reduce((n, j) => n + j.steps.length, 0)}</b>purchases</span>
<span class="stat"><b>${results.pages}</b>page states</span>
<span class="stat"><b>${fixtureN} + ${gem.length - fixtureN}</b>readings replayed + placeholders</span>
</div>

<h2>1. The 10/21 error set, on this run</h2>
<p class="sub">Caught = the check failed with a finding for this item. A fixed item turns into "not caught" and its check passes.</p>
<table><tr><th>#</th><th>What a buyer saw on 10/21</th><th>Check</th><th>This run</th></tr>
${cov
  .map(
    (c) => `<tr><td>${esc(c.id)}</td><td>${esc(c.text)}${c.example ? `<div class="ev">${esc(c.example.where)}: ${esc(c.example.what)}</div>` : ""}${c.human ? `<div class="ev">Needs a human: ${esc(c.human)}</div>` : ""}</td><td>${esc(c.check ?? "—")}</td><td class="${c.state}">${{ caught: `caught (${c.hits})`, "not-caught": "not caught", human: "human / phone", missing: "no check" }[c.state]}</td></tr>`,
  )
  .join("\n")}
</table>

<h2>2. Every check, every journey</h2>
<div class="wrap"><table class="matrix"><tr><th>Check</th><th>Item</th>${allCols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>
${results.checks.map((c) => `<tr><td class="${c.status}" title="${esc(c.title)}">${esc(c.id)}</td><td>${esc(c.item)}</td>${allCols.map((col) => cell(c, col)).join("")}</tr>`).join("\n")}
</table></div>
<p class="sub">Rows are check ids (section 3 says each in words). ✗ n = findings for that journey; ✓ = looked at and clean; · = not part of that journey.</p>
<p class="sub">Journeys: ${results.journeys.map((j) => `<b>${esc(j.id)}</b> ${esc(j.about ?? "")}`).join(" · ")}</p>

<h2>3. Findings</h2>
${fails
  .map(
    (c) => `<h3 class="fail">✗ ${esc(c.title)} <span class="ev">(${esc(c.item)}, ${c.findings.length} finding${c.findings.length === 1 ? "" : "s"})</span></h3>
<p class="ev">${esc(c.why)}${c.note ? " " + esc(c.note) : ""}</p><ul>
${group(c.findings)
  .slice(0, 40)
  .map((g) => `<li>${esc(g.what)}${g.ai ? '<span class="tag">AI / data</span>' : ""}<div class="ev">${esc(g.wheres.slice(0, 4).join(" · "))}${g.wheres.length > 4 ? ` · and ${g.wheres.length - 4} more` : ""}${g.evidence ? ` — “${esc(g.evidence)}”` : ""}</div></li>`)
  .join("\n")}
</ul>`,
  )
  .join("\n")}
<h3 class="pass">✓ Passing</h3><ul>${results.checks.filter((c) => c.status !== "fail").map((c) => `<li>${esc(c.title)} <span class="ev">(${c.looked} looked at${c.note ? "; " + esc(c.note) : ""})</span></li>`).join("")}</ul>

<h2>4. Changed words since the last release</h2>
${
  !diff.baseline
    ? `<p>${esc(diff.note ?? "No baseline.")}</p>`
    : `<p class="sub">Against the baseline from ${esc(diff.baseline.commit)} (${esc(diff.baseline.at)}). Only these lines need reading.</p>
${diff.changed.length ? "" : "<p>No words changed.</p>"}
${diff.changed
  .slice(0, 120)
  .map((d) => `<h3>${esc(d.doc)}</h3><ul>${d.minus.map((l) => `<li class="minus">${esc(l)}</li>`).join("")}${d.plus.map((l) => `<li class="plus">${esc(l)}</li>`).join("")}</ul>`)
  .join("")}
${diff.added.length ? `<p><b>New documents:</b> ${diff.added.map((a) => esc(a.doc)).join(" · ")}</p>` : ""}
${diff.gone.length ? `<p><b>Gone:</b> ${diff.gone.map(esc).join(" · ")}</p>` : ""}`
}

<h2>5. What this run did</h2>
<ul>
<li>Shop: this checkout's dist/ and Netlify functions, run locally. Stripe, Resend and Gemini are fakes; every other outside host is refused.</li>
<li>Engine ${esc(results.engine)}: the hd-engine service run locally from its build (no Fly, no key).</li>
<li>Written readings: ${fixtureN} replayed word for word from stored live readings; ${gem.length - fixtureN} placeholders (charts with no stored reading: their pages and PDFs are checked, their words are not).</li>
<li>Website: the-champagne-method's own pages, served locally from its repo.</li>
<li>Time: drive ${results.timings?.driveSeconds ?? "?"} s (links ${results.timings?.linkSeconds ?? "?"} s), whole run ${seconds} s. My-charts at 400 ms per store request: ${results.timings?.myCharts?.seconds ?? "?"} s.</li>
</ul>
<table><tr><th>Journey</th><th>Steps (seconds, emails)</th></tr>
${results.journeys.map((j) => `<tr><td>${esc(j.id)}</td><td>${j.steps.map((s) => `${esc(s.do)} ${["summary", "chart", "reading"][s.tier]} (${s.birth}) ${s.seconds}s, ${s.emails}✉`).join(" → ")}</td></tr>`).join("")}
</table>
<p class="ev">Run folder: ${esc(runDir)}</p>
</body></html>`;
  const f = join(runDir, "report.html");
  writeFileSync(f, html);
  return f;
}
