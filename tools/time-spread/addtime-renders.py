"""Screenshots, page text, PDF pages and emails for the "add your birth time"
review (addtime-renders.mjs calls this).

usage: python addtime-renders.py <manifest.json> <out-dir>

Every page is the real shop page served by the local rig, driven the way a
buyer would (the clock picker, the button). Nothing here talks to anything but
127.0.0.1 (and the Google Fonts the page itself loads).
"""
import json
import os
import re
import sys
import time
import urllib.request

import pypdfium2 as pdfium
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

MANIFEST, OUT = sys.argv[1], sys.argv[2]
m = json.load(open(MANIFEST, encoding="utf-8"))
ORIGIN = m["origin"]
made = []
WIDTHS = (1280, 390)


def rig(path):
    with urllib.request.urlopen(ORIGIN + path, timeout=200) as r:
        return json.loads(r.read().decode("utf-8"))


def settle(page, ms=900):
    try:
        page.wait_for_load_state("networkidle", timeout=20_000)
    except Exception:  # noqa: BLE001
        pass
    page.wait_for_timeout(ms)


def tall(page, width):
    """The viewport as tall as the page, so the body's fixed gradient covers every pixel."""
    h = page.evaluate("document.documentElement.scrollHeight")
    page.set_viewport_size({"width": width, "height": min(int(h), 15000)})
    page.wait_for_timeout(500)


def shoot(page, name, width, crops=()):
    """Text, the whole page, and crops of the named parts."""
    open(os.path.join(OUT, name + ".txt"), "w", encoding="utf-8").write(page.inner_text("body"))
    tall(page, width)
    for sel, suffix in crops:
        loc = page.locator(sel)
        if loc.count():
            loc.first.scroll_into_view_if_needed()
            page.wait_for_timeout(200)
            path = os.path.join(OUT, f"{name}-{suffix}.png")
            loc.first.screenshot(path=path)
            made.append(path)
    path = os.path.join(OUT, f"{name}-full.png")
    page.screenshot(path=path, full_page=True)
    made.append(path)


def open_page(b, url, width, wait):
    page = b.new_page(viewport={"width": width, "height": 900}, device_scale_factor=2)
    page.goto(url)
    settle(page)
    page.wait_for_selector(wait, timeout=60_000)
    page.wait_for_timeout(500)
    return page


def set_time(page, hhmm):
    page.get_by_role("button", name=re.compile(r"Choose the time|Open clock|Change", re.I)).first.click()
    page.get_by_role("button", name="24h").click()
    hh, mm = hhmm.split(":")
    page.get_by_label("Hour").fill(hh)
    page.get_by_label("Minute").fill(mm)
    page.get_by_role("button", name="Set", exact=True).click()
    page.wait_for_timeout(300)


def until(page, js, seconds=60):
    t0 = time.time()
    while time.time() - t0 < seconds:
        try:
            if page.evaluate(js):
                return True
        except Exception:  # noqa: BLE001  (navigating)
            pass
        page.wait_for_timeout(300)
    return False


def pdf_pages(path, name):
    doc = pdfium.PdfDocument(path)
    texts = [p.extract_text() for p in PdfReader(path).pages]
    json.dump(texts, open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    for i in range(len(doc)):
        out = os.path.join(OUT, f"{name}-p{i + 1}.png")
        doc[i].render(scale=2.5).to_pil().save(out)
        made.append(out)


def fetch_pdf(token, name):
    with urllib.request.urlopen(f"{ORIGIN}/api/pdf?t={token}", timeout=120) as r:
        path = os.path.join(OUT, name + ".pdf")
        open(path, "wb").write(r.read())
    pdf_pages(path, name)


def outbox():
    d = m["outbox"]
    return sorted(f for f in os.listdir(d) if f.endswith(".json")) if os.path.isdir(d) else []


def emails_since(seen, b, name):
    """Every email the step sent (not the alerts to Jeremy, shown on their own), as the inbox shows it."""
    n = 0
    for f in outbox():
        if f in seen:
            continue
        seen.add(f)
        meta = json.load(open(os.path.join(m["outbox"], f), encoding="utf-8"))
        html = os.path.join(m["outbox"], f[:-5] + ".html")
        kind = "alert" if str(meta.get("subject", "")).startswith("HD readings:") else "email"
        n += 1
        tag = f"{name}-{kind}{n}"
        open(os.path.join(OUT, tag + ".subject.txt"), "w", encoding="utf-8").write(str(meta.get("subject", "")))
        txt = os.path.join(m["outbox"], f[:-5] + ".txt")
        if os.path.exists(txt):
            open(os.path.join(OUT, tag + ".txt"), "w", encoding="utf-8").write(open(txt, encoding="utf-8").read())
        if os.path.exists(html):
            for width in (680, 390):
                page = b.new_page(viewport={"width": width, "height": 900}, device_scale_factor=2)
                page.set_content(open(html, encoding="utf-8").read())
                page.wait_for_timeout(400)
                path = os.path.join(OUT, f"{tag}-{width}.png")
                page.screenshot(path=path, full_page=True)
                made.append(path)
                page.close()


FORM = [("[data-add-time]", "form")]
NOTE = [("[data-add-time]", "note")]
AFTER = [("[data-note]", "note"), ("section[aria-labelledby=glance]", "glance")]
BEFORE = [("section[data-time-note]", "time-note"), ("section[aria-labelledby=start-here]", "start-here"), ("section[aria-labelledby=glance]", "glance")]

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    seen = set(outbox())
    for case in m["cases"]:
        cid, token, key = case["id"], case["token"], case["key"]
        if case.get("time"):
            # A known birth time: nothing to add, said kindly from both ways in.
            for width in WIDTHS:
                page = open_page(b, f"{ORIGIN}/r/{token}#add-time", width, "[data-add-time=known]")
                shoot(page, f"{cid}-known-page-{width}", width, NOTE)
                page.close()
                page = open_page(b, f"{ORIGIN}/t/{key}", width, "[data-add-time=known]")
                shoot(page, f"{cid}-known-pdf-{width}", width, NOTE)
                page.close()
            continue
        # BEFORE: the chart cast at noon (the tags beside the labels, Start here's and the margin's on a reading).
        for width in WIDTHS:
            page = open_page(b, f"{ORIGIN}/r/{token}", width, "section[aria-labelledby=glance]")
            shoot(page, f"{cid}-before-{width}", width, BEFORE)
            page.close()
        if case.get("pdf"):
            pdf_pages(case["pdf"], f"{cid}-before-pdf")
        # THE FORM, both ways in (the PDF's only where there is a PDF).
        ways = ["page", "pdf"] if case["tier"] >= 1 else ["page"]
        for via in ways:
            url = f"{ORIGIN}/r/{token}#add-time" if via == "page" else f"{ORIGIN}/t/{key}"
            for width in WIDTHS:
                page = open_page(b, url, width, "[data-add-time=open]")
                shoot(page, f"{cid}-form-{via}-{width}", width, FORM)
                if width == 390:
                    set_time(page, case["add"])
                    shoot(page, f"{cid}-form-{via}-filled-{width}", width, FORM)
                page.close()
        # THE ENGINE DOWN, once: nothing changes, the calm words, the time still in the box.
        url = f"{ORIGIN}/r/{token}#add-time" if case["via"] == "page" else f"{ORIGIN}/t/{key}"
        if case.get("engineDownFirst"):
            rig("/__rig/engine?down=1")
            try:
                for width in WIDTHS:
                    page = open_page(b, url, width, "[data-add-time=open]")
                    set_time(page, case["add"])
                    page.get_by_role("button", name=re.compile(r"^Redo my")).click()
                    page.wait_for_selector("[data-add-time=open] .border-brand-gold\\/50", timeout=30_000)
                    page.wait_for_timeout(400)
                    shoot(page, f"{cid}-engine-down-{width}", width, FORM)
                    page.close()
            finally:
                rig("/__rig/engine?down=0")
            emails_since(seen, b, f"{cid}-engine-down")
        # ADDED: the form sent, the chart redone.
        page = open_page(b, url, 1280, "[data-add-time=open]")
        set_time(page, case["add"])
        page.get_by_role("button", name=re.compile(r"^Redo my")).click()
        until(page, "() => location.pathname.startsWith('/r/') && !location.hash && !document.querySelector('[data-add-time]') && !!document.querySelector('section[aria-labelledby=glance]')")
        page.wait_for_timeout(300)
        fresh = re.search(r"/r/([A-Za-z0-9_.-]+)", page.url).group(1)
        if case["tier"] >= 2 and "being written" in page.inner_text("body").lower():
            shoot(page, f"{cid}-after-writing-1280", 1280, AFTER)
        page.close()
        rig("/__rig/idle")
        for width in WIDTHS:
            page = open_page(b, f"{ORIGIN}/r/{fresh}", width, "section[aria-labelledby=glance]")
            if case["tier"] >= 2:
                until(page, "() => !document.body.innerText.toLowerCase().includes('being written')", 30)
            shoot(page, f"{cid}-after-{width}", width, AFTER)
            page.close()
        if case["tier"] >= 1:
            fetch_pdf(fresh, f"{cid}-after-pdf")
        emails_since(seen, b, f"{cid}-added")
        # USED: both ways in, again.
        for via in ways:
            url = f"{ORIGIN}/r/{fresh}#add-time" if via == "page" else f"{ORIGIN}/t/{key}"
            for width in WIDTHS:
                page = open_page(b, url, width, "[data-add-time=used]")
                shoot(page, f"{cid}-used-{via}-{width}", width, NOTE)
                page.close()
    # THE PDF KEY'S OTHER PAGES: not cast yet, from before birth details were kept, no longer kept, not a key.
    for name, state in (("pending", "pending"), ("none", "none"), ("gone", "failed"), ("bad", "failed")):
        for width in WIDTHS:
            page = open_page(b, f"{ORIGIN}/t/{m['keys'][name]}", width, f"[data-add-time={state}]")
            shoot(page, f"key-{name}-{width}", width, NOTE)
            page.close()
    for width in WIDTHS:
        page = open_page(b, f"{ORIGIN}/r/{m['oldToken']}#add-time", width, "[data-add-time=none]")
        shoot(page, f"key-none-page-{width}", width, NOTE)
        page.close()
    b.close()

json.dump({"renders": made}, open(os.path.join(OUT, "renders.json"), "w"), indent=1)
print(f"{len(made)} renders in {OUT}")
