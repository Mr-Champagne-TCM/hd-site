import { test } from "node:test";
import assert from "node:assert/strict";
import { WINDOW_FIELDS, birthDay, birthSpread, localInstant, valueAt, wallAt, wallMinute } from "../netlify/lib/birthSpread.mjs";
import {
  graphRows,
  holdsLine,
  markedFields,
  offerLine,
  offerText,
  sayClock,
  spreadSvg,
  usableSpread,
  windowWords,
} from "../shared/timeSpread.mjs";
import { handleChart } from "../netlify/lib/handler.mjs";

/**
 * MOCK TIME (Jeremy 10/22): the unknown-time spread. These tests run against a
 * MADE-UP sky -- 26 activations whose gates move at chosen instants -- so every
 * claim (which values change, the window, each stretch, to the minute) has a
 * known answer. The real engine is proved separately and at scale by
 * tools/time-spread/property.mjs.
 */

const MIN = 60_000;
const PLANETS = ["SUN", "EARTH", "MOON", "NORTH_NODE", "SOUTH_NODE", "MERCURY", "VENUS", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"];

/**
 * A sky: `events` are [instant ms, piece, value] -- piece "pMOON" (a gate),
 * "pSUN.line", "dSUN.line", ... The chart's values are worked out from the
 * pieces the way the engine's are: a few made-up rules, enough to give each
 * value its own reason to change.
 */
function sky(events = []) {
  const base = { "pSUN.line": 3, "dSUN.line": 5 };
  for (const p of PLANETS) {
    base[`p${p}`] = 10;
    base[`d${p}`] = 20;
  }
  const sorted = [...events].sort((a, b) => a[0] - b[0]);
  const calls = [];
  const cast = async (iso) => {
    const t = Date.parse(iso);
    calls.push(t);
    const s = { ...base };
    for (const [at, piece, v] of sorted) if (at <= t) s[piece] = v;
    const side = (k) => PLANETS.map((p) => ({ planet: p, gate: s[`${k}${p}`], line: p === "SUN" || p === "EARTH" ? s[`${k}SUN.line`] : 1 }));
    // Made-up mechanics: the personality Moon in gate 34 makes a Projector; Mercury in 34 a Generator again.
    const projector = s.pMOON === 34 && s.pMERCURY !== 34;
    const headDefined = s.dMOON === 64;
    return {
      type: projector ? "Projector" : "Generator",
      strategy: projector ? "Wait for the invitation" : "Wait to respond",
      authority: s.pMARS === 55 ? "Emotional" : "Sacral",
      profile: `${s["pSUN.line"]}/${s["dSUN.line"]}`,
      definition: headDefined ? "Split" : "Single",
      signature: projector ? "Success" : "Satisfaction",
      notSelfTheme: projector ? "Bitterness" : "Frustration",
      incarnationCross: "Right Angle Cross of Planning (37/40 | 9/16)",
      definedCenters: headDefined ? ["Sacral", "G", "Head", "Ajna"] : ["Sacral", "G"],
      undefinedCenters: headDefined ? ["Throat"] : ["Throat", "Head", "Ajna"],
      openCenters: ["Heart"],
      channels: headDefined ? ["2-14 (The Beat)", "64-47 (Abstraction)"] : ["2-14 (The Beat)"],
      activatedGates: [...new Set([...side("p"), ...side("d")].map((a) => a.gate))].sort((a, b) => a - b),
      personality: side("p"),
      design: side("d"),
    };
  };
  cast.calls = calls;
  return cast;
}

/** Minute k of the local day, as an instant. */
const at = (date, zone, k) => birthDay(date, zone).start + k * MIN;

/* ------------------------------------------------------------ the day */

test("a plain day: 1440 minutes from local midnight, noon at 720, one clock", () => {
  const d = birthDay("1985-06-25", "America/Chicago");
  assert.equal(d.minutes, 1440);
  assert.equal(d.noon, 720);
  assert.equal(new Date(d.start).toISOString(), "1985-06-25T05:00:00.000Z");
  assert.deepEqual(d.clock, [[0, 0]]);
});

test("a spring-forward day has 23 hours, and its clock jumps from 2:00 to 3:00", () => {
  const d = birthDay("2001-04-01", "America/New_York");
  assert.equal(d.minutes, 1380);
  assert.equal(d.noon, 660);
  assert.deepEqual(d.clock, [[0, 0], [120, 180]]);
  assert.equal(wallMinute(d.clock, 150), 210, "minute 150 reads 3:30 AM");
});

test("a fall-back day has 25 hours, and 1:00-2:00 comes twice", () => {
  const d = birthDay("2001-10-28", "America/New_York");
  assert.equal(d.minutes, 1500);
  assert.equal(d.noon, 780);
  assert.deepEqual(d.clock, [[0, 0], [120, 60]]);
  assert.equal(wallMinute(d.clock, 90), 90);
  assert.equal(wallMinute(d.clock, 150), 90, "the second 1:30 AM");
});

test("half-hour zones, a half-hour DST and a day that starts at 1 AM", () => {
  assert.equal(new Date(birthDay("1985-06-25", "Asia/Kolkata").start).toISOString(), "1985-06-24T18:30:00.000Z");
  assert.equal(birthDay("1985-06-25", "Asia/Kathmandu").minutes, 1440);
  // Lord Howe moves its clock by thirty minutes.
  const lh = [];
  for (let t = Date.UTC(2005, 0, 1); t < Date.UTC(2006, 0, 1); t += 86_400_000) {
    const m = birthDay(new Date(t).toISOString().slice(0, 10), "Australia/Lord_Howe").minutes;
    if (m !== 1440) lh.push(m);
  }
  assert.deepEqual(lh.sort(), [1410, 1470]);
  // Brazil moved its clocks at midnight: 00:00 never happened, the day starts at 01:00.
  const br = birthDay("2008-10-19", "America/Sao_Paulo");
  assert.equal(br.minutes, 1380);
  assert.deepEqual(br.clock[0], [0, 60]);
});

test("a typed time is read the engine's way: an overlap takes the earlier instant, a gap moves later", () => {
  const zone = "America/New_York";
  const overlap = localInstant(Date.UTC(2001, 9, 28, 1, 30), zone);
  assert.equal(new Date(overlap).toISOString(), "2001-10-28T05:30:00.000Z", "the first 1:30 AM (EDT)");
  const gap = localInstant(Date.UTC(2001, 3, 1, 2, 30), zone);
  assert.equal(wallAt(gap, zone), Date.UTC(2001, 3, 1, 3, 30), "2:30 AM does not exist; it becomes 3:30 AM");
});

/* --------------------------------------------------------- the spread */

const DATE = "1985-06-25";
const ZONE = "America/Chicago";

test("nothing moves: nothing changes, the window is the whole day, the line says so", async () => {
  const s = await birthSpread({ date: DATE, zone: ZONE, cast: sky() });
  assert.deepEqual(s.changes, []);
  assert.deepEqual(s.window, [0, 1439]);
  assert.equal(s.gates, "same");
  assert.match(holdsLine(s).text, /Your chart is the same whatever time you were born\.$/);
  assert.ok(!holdsLine(s).parts.some((p) => p.tag), "nothing marked");
});

test("each change is found to the minute, and the window is the stretch holding noon", async () => {
  const cast = sky([
    [at(DATE, ZONE, 6), "pSUN.line", 4], // 00:06 profile 3/5 -> 4/5
    [at(DATE, ZONE, 861), "dMOON", 64], // 14:21 Head and Ajna defined
    [at(DATE, ZONE, 1433), "dMOON", 63], // 23:53 not again
  ]);
  const s = await birthSpread({ date: DATE, zone: ZONE, cast });
  assert.deepEqual(s.window, [6, 860]);
  assert.deepEqual(s.changes, ["profile", "definition", "definedCenters", "undefinedCenters", "channels"]);
  assert.deepEqual(s.segments.profile, [[0, "3/5"], [6, "4/5"]]);
  assert.deepEqual(s.segments.definition, [[0, "Single"], [861, "Split"], [1433, "Single"]]);
  assert.equal(valueAt(s, "definition", 860, "x"), "Single");
  assert.equal(valueAt(s, "definition", 861, "x"), "Split");
  assert.ok(s.casts < 200, `${s.casts} casts`);
  assert.equal(s.gates, "change");
});

test("two pieces moving inside one ten-minute step are told apart (a change and its undoing)", async () => {
  const cast = sky([
    [at(DATE, ZONE, 603), "pMOON", 34], // 10:03 Projector...
    [at(DATE, ZONE, 607), "pMERCURY", 34], // 10:07 ...and Generator again
  ]);
  const s = await birthSpread({ date: DATE, zone: ZONE, cast });
  assert.deepEqual(s.segments.type, [[0, "Generator"], [603, "Projector"], [607, "Generator"]]);
  assert.deepEqual(s.window, [607, 1439], "noon's stretch starts when the Projector minutes end");
  assert.ok(s.changes.includes("type") && s.changes.includes("strategy"));
});

test("a piece that moves without changing anything shown costs no search and marks nothing", async () => {
  const cast = sky([[at(DATE, ZONE, 400), "pVENUS", 11]]);
  const s = await birthSpread({ date: DATE, zone: ZONE, cast });
  assert.deepEqual(s.changes, []);
  assert.equal(s.casts, 145, "the ten-minute scan and nothing more");
});

test("a DST day is scanned in real minutes: the repeated hour counts twice", async () => {
  const date = "2001-10-28";
  const zone = "America/New_York";
  // A change in the SECOND 1:30 AM (minute 150 of the day).
  const s = await birthSpread({ date, zone, cast: sky([[at(date, zone, 150), "pSUN.line", 4]]) });
  assert.equal(s.minutes, 1500);
  assert.deepEqual(s.window, [150, 1499]);
  assert.equal(wallMinute(s.clock, s.window[0]), 90);
});

test("the stored noon chart must match the scan's own noon, or the spread is not used", async () => {
  const cast = sky([[at(DATE, ZONE, 30), "pSUN.line", 4]]);
  const good = await birthSpread({ date: DATE, zone: ZONE, cast, noonChart: await cast(new Date(at(DATE, ZONE, 720)).toISOString()) });
  assert.equal(good.ok, true);
  const wrong = await birthSpread({ date: DATE, zone: ZONE, cast, noonChart: { ...(await cast(new Date(at(DATE, ZONE, 720)).toISOString())), profile: "3/5" } });
  assert.equal(wrong.ok, false);
  const output = { timeKnown: false, provisional: ["type", "authority", "profile"], timeSpread: wrong };
  assert.equal(usableSpread(output), null);
  assert.deepEqual([...markedFields(output)], ["type", "authority", "profile"], "an unusable spread keeps today's marks");
});

test("the spread carries no birth field (the record's output may never hold one)", async () => {
  const s = await birthSpread({ date: DATE, zone: ZONE, cast: sky([[at(DATE, ZONE, 30), "pSUN.line", 4]]) });
  const keys = JSON.stringify(s).match(/"([a-zA-Z]+)":/g).map((k) => k.slice(1, -2));
  for (const banned of ["date", "time", "zone", "utc", "birth", "place", "lat", "lon"]) assert.ok(!keys.includes(banned), banned);
});

/* ---------------------------------------------------------- the words */

const spread = (window, changes = ["profile"], minutes = 1440, clock = [[0, 0]]) => ({
  v: 1,
  ok: true,
  minutes,
  noon: 720,
  window,
  changes,
  segments: { profile: [[0, "2/5"], [window[0] || 1, "3/5"], ...(window[1] < minutes - 1 ? [[window[1] + 1, "3/6"]] : [])] },
  clock,
  gates: "change",
});

test("Jeremy's line, word for word, when both edges are inside the day", () => {
  const line = holdsLine(spread([31, 870])).text.replace(/ /g, " ");
  assert.equal(
    line,
    "Your birth time isn’t known, so this chart is cast at noon. It holds for a birth between about 12:30 AM and " +
      "2:30 PM; outside those hours the lines marked PROVISIONAL may change.",
  );
});

test("the edges are said to the nearest 15 minutes, never past noon, never onto midnight", () => {
  assert.deepEqual(windowWords(spread([535, 720])), { start: "9:00 AM", end: "noon", fromStart: false, toEnd: false });
  assert.equal(windowWords(spread([6, 860])).start, "just after midnight");
  assert.equal(windowWords(spread([6, 860])).end, "2:15 PM");
  assert.equal(windowWords(spread([300, 1435])).end, "just before midnight");
  // An edge minutes after noon still says "noon", not a time before it.
  assert.equal(windowWords(spread([600, 724])).end, "noon");
  assert.equal(windowWords(spread([716, 760])).start, "noon");
});

test("each shape of window gets its own sentence, and the tag is the word PROVISIONAL", () => {
  const say = (w) => holdsLine(spread(w)).text.replace(/ /g, " ");
  assert.match(say([6, 860]), /between just after midnight and about 2:15 PM; outside those hours/);
  assert.match(say([0, 870]), /It holds for a birth before about 2:30 PM; after that, the lines marked PROVISIONAL may change\.$/);
  assert.match(say([480, 1439]), /It holds for a birth after about 8:00 AM; before that, the lines marked PROVISIONAL may change\.$/);
  assert.match(say([535, 720]), /between about 9:00 AM and noon;/);
  assert.match(say([4, 1439]), /at almost any hour; only in the first minutes after midnight may the lines marked PROVISIONAL change\.$/);
  assert.match(say([4, 1436]), /only in the first minutes after midnight or the last minutes before midnight may/);
  const parts = holdsLine(spread([31, 870])).parts;
  assert.deepEqual(parts.filter((p) => p.tag), [{ tag: "PROVISIONAL" }]);
  assert.ok(!/ (AM|PM)/.test(holdsLine(spread([31, 870])).text), "times keep their AM/PM on the same line");
});

test("the clock words", () => {
  assert.equal(sayClock(0), "midnight");
  assert.equal(sayClock(720), "noon");
  assert.equal(sayClock(30), "12:30 AM");
  assert.equal(sayClock(1425), "11:45 PM");
});

test("marked: what changes, plus the gates and the 26 activations; nothing with a known time", () => {
  const out = { timeKnown: false, provisional: ["type"], timeSpread: spread([31, 870], ["profile", "definedCenters"]) };
  assert.deepEqual([...markedFields(out)].sort(), ["definedCenters", "gates", "planetNumbers", "profile"]);
  assert.deepEqual([...markedFields({ ...out, timeKnown: true })], []);
});

test("the offer: a request in Jeremy's voice, once and free, never 'the shop', in two wordings", () => {
  for (const tier of [0, 1, 2]) {
    for (const v of ["A", "B"]) {
      const t = offerText(tier, v);
      assert.ok(!/\bshop\b/i.test(t), t);
      assert.match(t, /once/);
      assert.match(t, /free|no cost/);
      assert.equal(offerLine(tier, v).link, "add it here");
    }
  }
  assert.match(offerText(2, "A"), /your chart and your reading are redone from it\.$/);
  assert.match(offerText(1, "A"), /your chart is redone from it\.$/);
  assert.match(offerText(2, "B"), /^If you find your birth time later, I’d be glad to redo your chart and your reading/);
});

/* -------------------------------------------------------- the drawing */

test("rows: at most three, the big three first, the centers only when they move together", () => {
  const s = {
    ...spread([535, 720]),
    changes: ["type", "authority", "profile", "definition", "definedCenters", "undefinedCenters"],
    segments: {
      type: [[0, "Generator"], [737, "Projector"]],
      authority: [[0, "Sacral"], [500, "Emotional"]],
      profile: [[0, "1/3"], [535, "1/4"], [721, "2/4"]],
      definition: [[0, "Single"], [737, "Split"]],
      definedCenters: [[0, "Sacral"], [737, "Ajna, Head, Sacral"]],
      undefinedCenters: [[0, "Ajna, Head"], [737, ""]],
    },
  };
  const rows = graphRows(s);
  assert.deepEqual(rows.map((r) => r.label), ["Type", "Authority", "Profile"]);
  assert.deepEqual(rows[2].segments.map((x) => [x.value, x.noon]), [["1/3", false], ["1/4", true], ["2/4", false]]);
  const centersOnly = { ...s, changes: ["definedCenters", "undefinedCenters"], segments: { definedCenters: s.segments.definedCenters, undefinedCenters: s.segments.undefinedCenters } };
  const c = graphRows(centersOnly);
  assert.deepEqual(c.map((r) => r.label), ["Head, Ajna"], "named top to bottom, as the bodygraph has them");
  assert.deepEqual(c[0].segments.map((x) => x.value), ["undefined", "defined"]);
});

test("every edge of the gold stretch is where a drawn row changes (Boise: a Heart center ends it)", () => {
  const s = {
    ...spread([479, 1060]),
    changes: ["authority", "profile", "definedCenters", "undefinedCenters", "channels"],
    segments: {
      authority: [[0, "Emotional"], [479, "Sacral"]],
      profile: [[0, "3/5"], [145, "3/6"], [327, "4/6"]],
      definedCenters: [[0, "Ajna, Head, Sacral, Solar Plexus, Throat"], [479, "Ajna, Head, Heart, Sacral, Throat"], [1061, "Ajna, Head, Sacral, Throat"]],
      undefinedCenters: [[0, "G, Heart, Root, Spleen"], [479, "G, Root, Solar Plexus, Spleen"], [1061, "G, Heart, Root, Solar Plexus, Spleen"]],
      channels: [[0, "12-22, 20-34, 35-36, 47-64"], [319, "20-34, 35-36, 47-64"], [479, "20-34, 21-45, 47-64"], [1061, "20-34, 47-64"]],
    },
  };
  const rows = graphRows(s);
  assert.deepEqual(rows.map((r) => r.label), ["Authority", "Profile", "Heart"]);
  assert.deepEqual(rows[2].segments.map((x) => [x.start, x.value]), [[0, "undefined"], [479, "defined"], [1061, "undefined"]]);
});

test("the drawing: the noon marker, a bar, the rows when asked, escaped words, no NaN", () => {
  const s = { ...spread([31, 870]), segments: { profile: [[0, "2/5 <&>"], [31, "3/5"], [871, "3/6"]] } };
  for (const width of [340, 640]) {
    const withRows = spreadSvg(s, { width, rows: true }).svg;
    const bare = spreadSvg(s, { width, rows: false }).svg;
    for (const svg of [withRows, bare]) {
      assert.ok(svg.startsWith("<svg"));
      assert.ok(!/NaN|undefined/.test(svg), svg.slice(0, 200));
      assert.match(svg, />cast at noon</);
      assert.match(svg, />12 AM</);
      assert.match(svg, />12 PM</);
    }
    assert.match(withRows, /2\/5 &lt;&amp;&gt;/);
    assert.ok(!/Profile|PROFILE/.test(bare), "no rows without rows");
    assert.ok(/Profile|PROFILE/.test(withRows));
    assert.ok(!/%/.test(withRows.replace(/aria-label="[^"]*"/, "")), "no percentages");
  }
  const calm = spreadSvg({ ...s, changes: [], segments: {}, window: [0, 1439] }, { width: 640 }).svg;
  assert.match(calm, />the same all day</);
  const paper = spreadSvg(s, { width: 504, palette: "paper", size: 7.5 });
  assert.ok(paper.height > 30 && paper.height < 140, `${paper.height}`);
});

/* ------------------------------------------------------- the handler */

function engineFrom(cast) {
  const calls = [];
  const fn = async ({ birth, tier }) => {
    calls.push({ birth, tier });
    if (birth.utc) return { ok: true, status: 200, payload: await cast(birth.utc) };
    // The noon chart, as the engine casts it (local noon in the zone).
    const noon = localInstant(Date.parse(birth.date + "T12:00:00Z"), birth.zone);
    return { ok: true, status: 200, payload: { ...(await cast(new Date(noon).toISOString())), timeKnown: false } };
  };
  fn.calls = calls;
  return fn;
}
const counter = () => {
  const m = new Map();
  return { keyFor: async (ip) => ip, load: async (k) => m.get(k) ?? [], save: async (k, v) => m.set(k, v) };
};

test("the chart request works the spread out once, with the noon chart, when the switch is on", async () => {
  const prev = process.env.HD_FIX;
  process.env.HD_FIX = "TIME";
  try {
    const engine = engineFrom(sky([[at(DATE, ZONE, 6), "pSUN.line", 4]]));
    const res = await handleChart({
      body: JSON.stringify({ birth: { date: DATE, zone: ZONE, timeKnown: false } }),
      ip: "203.0.113.9",
      now: Date.now(),
      store: counter(),
      engine,
    });
    assert.equal(res.status, 200);
    const out = JSON.parse(res.body);
    assert.equal(out.timeSpread.ok, true);
    assert.deepEqual(out.timeSpread.window, [6, 1439]);
    assert.ok(engine.calls.slice(1).every((c) => c.tier === 2 && c.birth.utc && !c.birth.date), "spread casts are exact instants");
    // A known time: no spread, one engine call.
    const known = engineFrom(sky());
    const r2 = await handleChart({
      body: JSON.stringify({ birth: { date: DATE, zone: ZONE, time: "08:00", timeKnown: true } }),
      ip: "203.0.113.10",
      now: Date.now(),
      store: counter(),
      engine: known,
    });
    assert.equal(JSON.parse(r2.body).timeSpread, undefined);
    assert.equal(known.calls.length, 1);
  } finally {
    if (prev === undefined) delete process.env.HD_FIX;
    else process.env.HD_FIX = prev;
  }
});

test("a summary (no channels bought) keeps no channel stretches in its spread", async () => {
  const prev = process.env.HD_FIX;
  process.env.HD_FIX = "TIME";
  try {
    const inner = engineFrom(sky([[at(DATE, ZONE, 861), "dMOON", 64]]));
    const engine = async (req) => {
      const r = await inner(req);
      if (req.birth.utc) return r;
      const { channels, channelLines, activatedGates, personality, design, ...summary } = r.payload;
      return { ...r, payload: summary };
    };
    const res = await handleChart({
      body: JSON.stringify({ birth: { date: DATE, zone: ZONE, timeKnown: false } }),
      ip: "203.0.113.13",
      now: Date.now(),
      store: counter(),
      engine,
    });
    const s = JSON.parse(res.body).timeSpread;
    assert.ok(s.changes.includes("definedCenters"));
    assert.ok(!s.changes.includes("channels"));
    assert.equal(s.segments.channels, undefined);
    assert.ok(!/\d+-\d+/.test(JSON.stringify(s)), "no channel numbers anywhere in it");
  } finally {
    if (prev === undefined) delete process.env.HD_FIX;
    else process.env.HD_FIX = prev;
  }
});

test("a spread that cannot be made never stops the chart, and is reported", async () => {
  const prev = process.env.HD_FIX;
  process.env.HD_FIX = "TIME";
  try {
    let n = 0;
    const engine = async ({ birth }) =>
      birth.utc && ++n > 20 ? { ok: false, status: 503, payload: null } : { ok: true, status: 200, payload: await sky()(birth.utc ?? "1985-06-25T17:00:00Z") };
    const notes = [];
    const res = await handleChart({
      body: JSON.stringify({ birth: { date: DATE, zone: ZONE, timeKnown: false } }),
      ip: "203.0.113.11",
      now: Date.now(),
      store: counter(),
      engine,
      report: async (r) => notes.push(r),
    });
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).timeSpread, undefined);
    assert.deepEqual(notes.map((x) => x.kind), ["chart-time-spread"]);
  } finally {
    if (prev === undefined) delete process.env.HD_FIX;
    else process.env.HD_FIX = prev;
  }
});

test("with the switch off, an unknown time is charted exactly as today: one engine call, no spread", async () => {
  const prev = process.env.HD_FIX;
  delete process.env.HD_FIX;
  try {
    const engine = engineFrom(sky());
    const res = await handleChart({
      body: JSON.stringify({ birth: { date: DATE, zone: ZONE, timeKnown: false } }),
      ip: "203.0.113.12",
      now: Date.now(),
      store: counter(),
      engine,
    });
    assert.equal(engine.calls.length, 1);
    assert.equal(JSON.parse(res.body).timeSpread, undefined);
  } finally {
    if (prev !== undefined) process.env.HD_FIX = prev;
  }
});

test("every window field is one the shop shows", () => {
  assert.deepEqual(WINDOW_FIELDS.length, 12);
});
