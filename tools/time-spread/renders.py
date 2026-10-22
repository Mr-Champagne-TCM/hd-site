"""Screenshots and PDF pages for the mock TIME renders (renders.mjs calls this).

usage: python renders.py <manifest.json> <out-dir>

Every page is the real shop page served by the local rig; the phone screens
are the HTML drawn for the mock. Nothing here talks to anything but
127.0.0.1 (and the Google Fonts the page itself loads).
"""
import json
import os
import sys

import pypdfium2 as pdfium
from playwright.sync_api import sync_playwright

MANIFEST, OUT = sys.argv[1], sys.argv[2]
m = json.load(open(MANIFEST, encoding="utf-8"))
ORIGIN = m["origin"]
made = []


def shot(page, name, **kw):
    path = os.path.join(OUT, name)
    page.screenshot(path=path, **kw)
    made.append(path)


def settle(page):
    try:
        page.wait_for_load_state("networkidle", timeout=20_000)
    except Exception:  # noqa: BLE001
        pass
    page.wait_for_timeout(900)


def tall(page, width):
    """The viewport as tall as the page: the body's fixed gradient then covers every pixel
    (a full-page capture of a short viewport paints black under the first screen)."""
    h = page.evaluate("document.documentElement.scrollHeight")
    page.set_viewport_size({"width": width, "height": min(int(h), 15000)})
    page.wait_for_timeout(500)


def web(b, case, width, flags, label, crops=True, values=False, extra=""):
    page = b.new_page(viewport={"width": width, "height": 900}, device_scale_factor=2)
    page.goto(f"{ORIGIN}/r/{case['token']}?fix={flags}{extra}")
    settle(page)
    base = f"{case['id']}-web-{width}-{label}"
    if extra == "#add-time":
        tall(page, width)
        shot(page, f"{base}.png", full_page=True)
        page.close()
        return
    note = page.locator("section[data-time-note]")
    note.wait_for(timeout=15_000)
    tall(page, width)
    shot(page, f"{base}-full.png", full_page=True)
    if crops:
        box = note.bounding_box()
        top = page.evaluate("window.scrollY")
        shot(page, f"{base}-top.png", full_page=True, clip={"x": 0, "y": 0, "width": width, "height": box["y"] + top + box["height"] + 28})
        shot(page, f"{base}-note.png", clip={"x": max(0, box["x"] - 12), "y": box["y"] + top - 12, "width": min(width, box["width"] + 24), "height": box["height"] + 24}, full_page=True)
    if values:
        g = page.locator("section[aria-labelledby=glance]")
        g.scroll_into_view_if_needed()
        page.wait_for_timeout(200)
        path = os.path.join(OUT, f"{case['id']}-web-{width}-values.png")
        g.screenshot(path=path)
        made.append(path)
    page.close()


def pdf_pages(case, variant, path, pages=None):
    doc = pdfium.PdfDocument(path)
    n = len(doc)
    for i in range(n) if pages is None else [p - 1 for p in pages if p <= n]:
        name = f"{case['id']}-pdf-{variant}-p{i + 1}.png"
        doc[i].render(scale=2.5).to_pil().save(os.path.join(OUT, name))
        made.append(os.path.join(OUT, name))
    return n


with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    for case in m["cases"]:
        for width in (1280, 390):
            web(b, case, width, "TIME", "rows", values=True)
            if not case.get("madeUp"):
                web(b, case, width, "TIME,TIMEBAR", "bar")
        if case["id"] == "a-theo":
            web(b, case, 1280, "TIME,TIMEOFFERB", "offerB")
            for width in (1280, 390):
                web(b, case, width, "TIME", "add-time", extra="#add-time")
        for variant, path in case["pdfs"].items():
            pdf_pages(case, variant, path, None if variant == "rows" else [1])
        for variant, path in case.get("phone", {}).items():
            page = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3)
            page.goto("file:///" + path.replace("\\", "/"))
            settle(page)
            shot(page, f"{case['id']}-phone-mock-{variant}.png", full_page=True)
            page.close()
    b.close()

# The made-up "same all day" case is stamped on every image, so it can never pass for a real birth.
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

def stamp(path):
    text = "MADE UP: no real birth day is the same all day"
    im = Image.open(path).convert("RGB")
    h = max(36, im.size[0] // 28)
    out = Image.new("RGB", (im.size[0], im.size[1] + h), (176, 32, 32))
    out.paste(im, (0, h))
    d = ImageDraw.Draw(out)
    size = int(h * 0.55)
    while size > 8:
        font = ImageFont.truetype("arialbd.ttf", size)
        if d.textlength(text, font=font) <= im.size[0] - h:
            break
        size -= 1
    d.text((h // 2, (h - size) // 2), text, fill=(255, 255, 255), font=font)
    out.save(path)


for path in made:
    if os.path.basename(path).startswith("c2-MADE-UP"):
        stamp(path)

json.dump(made, open(os.path.join(OUT, "renders.json"), "w"), indent=1)
print(f"{len(made)} renders in {OUT}")
