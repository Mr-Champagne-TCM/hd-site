"""Screenshots, page text and PDF pages for the release review (renders.mjs calls this).

usage: python renders.py <manifest.json> <out-dir>

Every page is the real shop page served by the local rig. Nothing here talks
to anything but 127.0.0.1 (and the Google Fonts the page itself loads).
"""
import json
import os
import sys

import pypdfium2 as pdfium
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

MANIFEST, OUT = sys.argv[1], sys.argv[2]
m = json.load(open(MANIFEST, encoding="utf-8"))
ORIGIN = m["origin"]
made = []


def settle(page):
    try:
        page.wait_for_load_state("networkidle", timeout=20_000)
    except Exception:  # noqa: BLE001
        pass
    page.wait_for_timeout(900)


def tall(page, width):
    """The viewport as tall as the page, so the body's fixed gradient covers every pixel."""
    h = page.evaluate("document.documentElement.scrollHeight")
    page.set_viewport_size({"width": width, "height": min(int(h), 15000)})
    page.wait_for_timeout(500)


def crop(page, selector, name):
    loc = page.locator(selector)
    if not loc.count():
        return
    loc.first.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    path = os.path.join(OUT, name)
    loc.first.screenshot(path=path)
    made.append(path)


def web(b, case, width):
    page = b.new_page(viewport={"width": width, "height": 900}, device_scale_factor=2)
    page.goto(f"{ORIGIN}/r/{case['token']}")
    settle(page)
    # The reading is fetched after the shell loads: wait for the chart itself, not just a quiet network.
    page.wait_for_selector("section[aria-labelledby=glance]", timeout=60_000)
    page.wait_for_timeout(600)
    base = f"{case['id']}-web-{width}"
    open(os.path.join(OUT, base + ".txt"), "w", encoding="utf-8").write(page.inner_text("body"))
    links = page.eval_on_selector_all("a[href]", "els => els.map(e => ({text: (e.innerText || '').trim(), href: e.href}))")
    json.dump(links, open(os.path.join(OUT, base + ".links.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    # The viewport as tall as the page first: a crop taller than the viewport paints black under it.
    tall(page, width)
    crop(page, "section[data-time-note]", f"{base}-time-note.png")
    crop(page, "section[aria-labelledby=three-lines]", f"{base}-three-lines.png")
    crop(page, "section[aria-labelledby=glance]", f"{base}-glance.png")
    crop(page, "section[aria-labelledby=start-here]", f"{base}-start-here.png")
    path = os.path.join(OUT, f"{base}-full.png")
    page.screenshot(path=path, full_page=True)
    made.append(path)
    page.close()


def pdf_pages(case):
    doc = pdfium.PdfDocument(case["pdf"])
    texts = [p.extract_text() for p in PdfReader(case["pdf"]).pages]
    json.dump(texts, open(os.path.join(OUT, f"{case['id']}-pdf.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    for i in range(len(doc)):
        name = f"{case['id']}-pdf-p{i + 1}.png"
        doc[i].render(scale=2.5).to_pil().save(os.path.join(OUT, name))
        made.append(os.path.join(OUT, name))
    return len(doc)


def home(b, width):
    """The offer page (the "From a real reading" strip, the three cards)."""
    page = b.new_page(viewport={"width": width, "height": 900}, device_scale_factor=2)
    page.goto(f"{ORIGIN}/")
    settle(page)
    open(os.path.join(OUT, f"home-web-{width}.txt"), "w", encoding="utf-8").write(page.inner_text("body"))
    tall(page, width)
    crop(page, "figure", f"home-web-{width}-strip.png")
    path = os.path.join(OUT, f"home-web-{width}-full.png")
    page.screenshot(path=path, full_page=True)
    made.append(path)
    page.close()


with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    for width in (1280, 390):
        home(b, width)
    for case in m["cases"]:
        for width in (1280, 390):
            web(b, case, width)
        if case.get("pdf"):
            case["pdfPages"] = pdf_pages(case)
    b.close()

json.dump({"renders": made, "cases": m["cases"]}, open(os.path.join(OUT, "renders.json"), "w"), indent=1)
print(f"{len(made)} renders in {OUT}")
