import { test } from "node:test";
import assert from "node:assert/strict";
import { importTs } from "./support/ts.mjs";

/**
 * The gate on the one place a response body becomes live document.
 *
 * WHY THERE IS NO REAL RENDER IN THIS FILE, which was the first instinct and
 * the wrong one. A 188 KB sample was copied in as a fixture and the leak
 * scanner refused the commit -- correctly. The drawing is Jeremy's design: the
 * palette, the three-tier lighting, the label positions that took four rounds
 * to solve. The chart LAYOUT is public knowledge on every Human Design site;
 * this drawing of it is not, and a render committed to a public repo hands the
 * whole appearance to anyone who clones it. D-10 makes it the single global
 * look for the product, which is exactly what makes it worth not publishing.
 *
 * So the vocabulary is checked where the render actually lives. hd-engine is
 * private and has the renderer, and its BodygraphVocabularyTest asserts a real
 * render uses only the elements this gate allows. If the renderer gains an
 * element, THAT test goes red, next to the code that changed.
 *
 * This file's job is the other half: that the gate's LOGIC is right. Built from
 * a chart-shaped SVG assembled here, so every case below is a complete drawing
 * with exactly one thing done to it -- a test cannot pass by refusing something
 * that was never a chart in the first place.
 */

const { checkBodygraph, ALLOWED_ELEMENTS } = await importTs("src", "bodygraphGate.ts");

/**
 * A drawing shaped like ours: every allowed element, and big enough to clear
 * the size floor the way a real one does.
 */
function chart({ inject = "", tamper = (s) => s } = {}) {
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
    "<title>Bodygraph</title>",
    "<defs>",
    '<linearGradient id="a"><stop offset="0" stop-opacity="0.5"/></linearGradient>',
    '<radialGradient id="b"><stop offset="1" stop-opacity="0.2"/></radialGradient>',
    "</defs>",
    inject,
    '<rect width="10" height="10"/>',
    "<g>",
    '<polygon points="1,1 2,2 3,1"/>',
    '<polyline points="1,1 2,2"/>',
    '<path d="M0 0 L1 1"/>',
  ];
  for (let i = 0; i < 700; i++) {
    parts.push(`<line x1="${i}" y1="0" x2="${i}" y2="9" stroke-width="9.5"/>`);
    parts.push(`<circle cx="${i}" cy="5" r="13"/>`);
  }
  parts.push('<text x="1" y="1">SACRAL<tspan>1</tspan></text>', "</g>", "</svg>");
  return tamper(parts.join(""));
}

test("a chart-shaped drawing passes", () => {
  const v = checkBodygraph(chart());
  assert.equal(v.ok, true, v.ok ? "" : `refused: ${v.reason}`);
});

test("the allowlist is not silently empty or tiny", () => {
  assert.ok(ALLOWED_ELEMENTS.length >= 14, `allowlist shrank to ${ALLOWED_ELEMENTS.length}`);
  for (const required of ["svg", "circle", "line", "polygon", "text", "linearGradient"]) {
    assert.ok(ALLOWED_ELEMENTS.includes(required), `allowlist lost ${required}`);
  }
});

// --- what must never get through -------------------------------------------

test("a script tag is refused", () => {
  const v = checkBodygraph(chart({ inject: "<script>fetch('//x')</script>" }));
  assert.equal(v.ok, false);
  assert.match(v.reason, /<script>/);
});

test("a script tag is refused however it is cased", () => {
  const v = checkBodygraph(chart({ inject: "<SCRIPT>x()</SCRIPT>" }));
  assert.equal(v.ok, false, "an HTML parser folds case and so must this");
});

test("a foreignObject is refused", () => {
  const v = checkBodygraph(chart({ inject: "<foreignObject><b>hi</b></foreignObject>" }));
  assert.equal(v.ok, false);
  assert.match(v.reason, /foreignobject/i);
});

test("an image that would fetch something is refused", () => {
  assert.equal(checkBodygraph(chart({ inject: '<image href="//tracker/x.png"/>' })).ok, false);
});

test("a use element pointing anywhere is refused", () => {
  assert.equal(checkBodygraph(chart({ inject: '<use xlink:href="#x"/>' })).ok, false);
});

test("an anchor wrapping the drawing is refused", () => {
  assert.equal(checkBodygraph(chart({ inject: '<a href="//elsewhere">x</a>' })).ok, false);
});

test("an event handler is refused even on an allowed element", () => {
  const v = checkBodygraph(chart({ tamper: (s) => s.replace("<rect", '<rect onload="alert(1)"') }));
  assert.equal(v.ok, false);
  assert.match(v.reason, /event handler/);
});

test("an event handler is refused however it is cased or spaced", () => {
  const v = checkBodygraph(chart({ tamper: (s) => s.replace("<rect", '<rect\n  OnClick = "x()"') }));
  assert.equal(v.ok, false);
  assert.match(v.reason, /event handler/);
});

test("a javascript: url is refused", () => {
  const v = checkBodygraph(chart({ tamper: (s) => s.replace("<rect", '<rect fill="javascript:alert(1)"') }));
  assert.equal(v.ok, false);
});

test("an entity declaration is refused", () => {
  const v = checkBodygraph("<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///etc/passwd'>]>" + chart());
  assert.equal(v.ok, false);
});

// --- what a broken engine looks like, which is the likelier failure ---------

test("a truncated response is refused rather than half-drawn", () => {
  const v = checkBodygraph(chart().slice(0, 30_000));
  assert.equal(v.ok, false);
  assert.match(v.reason, /truncated/);
});

test("an empty or missing drawing is refused, with a reason", () => {
  for (const bad of [undefined, null, "", 42, {}, []]) {
    const v = checkBodygraph(bad);
    assert.equal(v.ok, false, `${JSON.stringify(bad)} was accepted`);
    assert.equal(typeof v.reason, "string");
    assert.ok(v.reason.length > 0, "refused without saying why");
  }
});

test("a well-formed but empty svg is refused: it is a picture of nothing", () => {
  const padded = '<svg xmlns="http://www.w3.org/2000/svg">' + " ".repeat(40_000) + "</svg>";
  const v = checkBodygraph(padded);
  assert.equal(v.ok, false);
  assert.match(v.reason, /no <(text|circle|line|polygon)>/);
});

test("a drawing that lost its gate numbers is refused", () => {
  const v = checkBodygraph(chart({ tamper: (s) => s.replace(/<text[\s\S]*?<\/text>/g, "") }));
  assert.equal(v.ok, false);
  assert.match(v.reason, /no <text>/);
});

test("an absurdly large body is refused rather than parsed", () => {
  const v = checkBodygraph("<svg>" + "x".repeat(3_000_000) + "</svg>");
  assert.equal(v.ok, false);
  assert.match(v.reason, /too large/);
});
