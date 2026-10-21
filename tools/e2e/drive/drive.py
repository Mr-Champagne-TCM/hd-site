"""Drive every buyer journey in tools/e2e/combos.json through the LOCAL shop
(tools/e2e/harness), the way a buyer would: real clicks in headless Chrome,
the fake Stripe page, the entry form, the confirm screen, Change a detail,
the someone-new cards. Captures every page state at 1280 and 390 px, every
PDF, the Stripe session each checkout made, and which emails each step sent.

Writes <run>/manifest.json; tools/e2e/checks reads it. Nothing here talks to
anything but 127.0.0.1.

usage (run.mjs calls it):
  uv run --with playwright --with pypdf --with pypdfium2 --with pillow \
      python tools/e2e/drive/drive.py <run-dir> <shop-origin> [<website-origin>] [--only id,id]
"""
import json
import os
import re
import sys
import time
import traceback
import urllib.request
from urllib.parse import quote

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
E2E = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from pdfcap import capture_pdf, capture_pdf_file  # noqa: E402

RUN, SHOP = sys.argv[1], sys.argv[2].rstrip("/")
SITE = sys.argv[3].rstrip("/") if len(sys.argv) > 3 and not sys.argv[3].startswith("--") else None
ONLY = None
if "--only" in sys.argv:
    ONLY = set(sys.argv[sys.argv.index("--only") + 1].split(","))
COMBOS = json.load(open(os.path.join(E2E, "combos.json"), encoding="utf-8"))
CAP = os.path.join(RUN, "cap")
PDF = os.path.join(RUN, "pdf")
os.makedirs(CAP, exist_ok=True)
os.makedirs(PDF, exist_ok=True)
EMAIL = COMBOS["buyerEmail"]

manifest = {"shop": SHOP, "website": SITE, "journeys": [], "pages": [], "errors": [], "timings": {}}


def rig(path):
    with urllib.request.urlopen(SHOP + path, timeout=200) as r:
        return json.loads(r.read().decode("utf-8"))


def mails_now():
    return rig("/__rig/state")["mails"]


def outbox_since(n):
    """Emails sent since outbox count n (the outbox files are numbered)."""
    d = os.path.join(RUN, "outbox")
    out = []
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if f.endswith(".json") and int(f[:3]) > n:
            out.append(json.load(open(os.path.join(d, f), encoding="utf-8")))
    return out


def settle(page, ms=600):
    try:
        page.wait_for_load_state("networkidle", timeout=20_000)
    except Exception:  # noqa: BLE001
        pass
    page.wait_for_timeout(ms)


def capture(page, cid, meta):
    """The page as it is now: text, links, full-page screenshots at 1280 and 390."""
    rec = {"id": cid, "url": page.url, **meta}
    page.set_viewport_size({"width": 1280, "height": 900})
    page.wait_for_timeout(250)
    rec["text"] = f"cap/{cid}.txt"
    open(os.path.join(CAP, cid + ".txt"), "w", encoding="utf-8").write(page.inner_text("body"))
    links = page.eval_on_selector_all(
        "a[href]", "els => els.map(e => ({text: (e.innerText || e.getAttribute('aria-label') || '').trim(), href: e.href}))"
    )
    json.dump(links, open(os.path.join(CAP, cid + ".links.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    rec["links"] = f"cap/{cid}.links.json"
    # Buttons too: the confirm button, the buy buttons, their exact words.
    rec["buttons"] = page.eval_on_selector_all("button", "els => els.filter(e => e.offsetParent !== null).map(e => e.innerText.trim())")
    # Element ids (not the drawing's gradients), for same-page #anchor links.
    rec["ids"] = page.eval_on_selector_all("[id]", "els => els.map(e => e.id).filter(i => i && !/^pg\\d+$/.test(i))")
    page.screenshot(path=os.path.join(CAP, cid + ".desk.png"), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(350)
    rec["phoneScrollWidth"] = page.evaluate("document.documentElement.scrollWidth")
    page.screenshot(path=os.path.join(CAP, cid + ".phone.png"), full_page=True)
    page.set_viewport_size({"width": 1280, "height": 900})
    page.wait_for_timeout(150)
    manifest["pages"].append(rec)
    return rec


def fill_birth(page, birth, name, unknown=None):
    """The entry form, the way a buyer fills it: typed date, picked town, clock."""
    b = COMBOS["births"][birth]
    if name is not None:
        # The first box in the form is the chart's name (optional, prefilled).
        box = page.locator('form input:not([type=checkbox]):not([placeholder="Town, and the state or country"]):not([placeholder=MMDDYYYY])').first
        if box.count():
            box.fill(name)
    if page.get_by_role("button", name="Type the date instead").count():
        page.get_by_role("button", name="Type the date instead").click()
    y, m, d = b["date"].split("-")
    page.get_by_placeholder("MMDDYYYY").fill(m + d + y)
    place = page.get_by_placeholder("Town, and the state or country")
    place.click()
    place.fill("")
    page.keyboard.type(b["type"], delay=25)
    page.locator("[role=option] button", has_text=b["pick"]).first.click(timeout=15_000)
    if b["time"] is None or unknown:
        # "their birth time" on someone new's form (fix 19).
        page.get_by_label(re.compile("know (my|their) birth time", re.I)).check()
    else:
        set_time(page, b["time"])


def set_time(page, hhmm):
    opener = page.get_by_role("button", name=re.compile(r"Choose the time|Open clock|Change", re.I)).first
    opener.click()
    page.get_by_role("button", name="24h").click()
    hh, mm = hhmm.split(":")
    page.get_by_label("Hour").fill(hh)
    page.get_by_label("Minute").fill(mm)
    page.get_by_role("button", name="Set", exact=True).click()


def stripe_pay(page, cid, buyer, promo, meta):
    page.wait_for_url("**/__stripe/pay/**", timeout=30_000)
    settle(page, 200)
    sid = page.url.rstrip("/").split("/")[-1]
    session = rig("/__rig/session/" + sid)
    json.dump(session, open(os.path.join(CAP, cid + ".stripe.json"), "w", encoding="utf-8"), indent=1)
    capture(page, cid, {**meta, "kind": "stripe", "session": f"cap/{cid}.stripe.json"})
    page.fill("#email", EMAIL)
    page.fill("#name", buyer)
    if promo and page.locator("#promo").count():
        page.fill("#promo", promo)
    page.click("#pay")
    page.wait_for_url("**/r/**", timeout=60_000)
    settle(page)
    return session


def wait_written(page, tier):
    """A reading tier is written in the background (interpret, replayed)."""
    if tier < 2:
        return
    for _ in range(30):
        rig("/__rig/idle")
        page.reload()
        settle(page, 500)
        body = page.inner_text("body")
        if "being written" not in body.lower():
            return
        page.wait_for_timeout(1000)


def submitted(page, seconds=60):
    """After the form's button: the page reloads to the chart, or the form
    stays with a message. The second is a failed step, said in its words."""
    t0 = time.time()
    while time.time() - t0 < seconds:
        page.wait_for_timeout(500)
        try:
            body = page.inner_text("body")
        except Exception:  # noqa: BLE001  (navigating)
            continue
        if "THREE THINGS, THEN" not in body and "Choose the time" not in body:
            settle(page, 800)
            return
        if "Working" in body or "Casting" in body or "…" in body[-200:]:
            continue
    tail = page.inner_text("body")[-600:].replace("\n", " ")
    raise RuntimeError(f"the chart did not appear after the form was sent; the page says: {tail}")


def token_of(url):
    m = re.search(r"/r/([A-Za-z0-9_.-]+)", url)
    return m.group(1) if m else None


def result(page, ctx, cid, meta, tier):
    wait_written(page, tier)
    token = token_of(page.url)
    rec = capture(page, cid, {**meta, "kind": "result", "token": token, "record": rig("/__rig/record?t=" + quote(token))})
    if tier >= 1:
        rec["pdf"] = capture_pdf(ctx.request, f"{SHOP}/api/pdf?t={quote(token)}", os.path.join(PDF, cid))
    # The API answer the page was drawn from (values on the page are checked against it).
    req = urllib.request.Request(SHOP + "/api/reading", data=json.dumps({"token": token}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        open(os.path.join(CAP, cid + ".api.json"), "w", encoding="utf-8").write(r.read().decode("utf-8"))
    rec["api"] = f"cap/{cid}.api.json"
    return token


def journey(browser, j):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, extra_http_headers={"x-rig-visitor": j["id"]})
    page = ctx.new_page()
    jr = {"id": j["id"], "about": j.get("about"), "steps": []}
    manifest["journeys"].append(jr)
    token = None
    birth = None
    own_tokens = []  # this buyer's links so far, oldest first (someone-new charts are their own)
    for i, st in enumerate(j["steps"]):
        sid = f"{j['id']}-{i + 1}-{st['do']}-t{st['tier']}"
        step = {"id": sid, "do": st["do"], "tier": st["tier"], "birth": st.get("birth") or birth, "name": st.get("name")}
        jr["steps"].append(step)
        n0 = mails_now()
        t0 = time.time()
        try:
            meta = {"journey": j["id"], "step": sid, "do": st["do"], "tier": st["tier"], "birth": step["birth"], "fresh": st["do"] == "someone-new"}
            if st["do"] == "buy":
                birth = st["birth"]
                page.goto(SHOP + "/", wait_until="networkidle")
                if i == 0 and j is COMBOS["journeys"][0]:
                    capture(page, "offer", {"kind": "offer", "tier": None})
                label = ["Buy the summary", "Buy the chart", "Buy the reading"][st["tier"]]
                page.get_by_role("button", name=label).click()
                stripe_pay(page, sid + "-stripe", j["buyer"], st.get("promo"), meta)
                capture(page, sid + "-form", {**meta, "kind": "form-blank"})
                if j is COMBOS["journeys"][0] and i == 0:
                    # The typed-date box and its hint, which close once a date is in.
                    page.get_by_role("button", name="Type the date instead").click()
                    capture(page, sid + "-form-typing", {**meta, "kind": "form-typing"})
                fill_birth(page, birth, st.get("name"))
                capture(page, sid + "-form-filled", {**meta, "kind": "form-filled"})
                page.locator("form button[type=submit]").last.click()
                submitted(page)
                settle(page, 800)
                token = result(page, ctx, sid, meta, st["tier"])
                own_tokens.append(token)
            elif st["do"] == "upgrade":
                page.goto(f"{SHOP}/u/{quote(token)}", wait_until="networkidle")
                settle(page)
                capture(page, sid + "-choose", {**meta, "kind": "upgrade-choice"})
                tier_word = ["summary", "chart", "reading"][st["tier"]]
                page.get_by_role("button", name=re.compile(rf"^Take .* to the {tier_word}$")).click()
                stripe_pay(page, sid + "-stripe", j["buyer"], st.get("promo"), {**meta, "upgrade": True})
                capture(page, sid + "-confirm", {**meta, "kind": "confirm", "upgrade": True})
                if st.get("correct"):
                    page.get_by_role("button", name="Change a detail").click()
                    settle(page, 300)
                    capture(page, sid + "-correct", {**meta, "kind": "correct-form"})
                    if st["correct"].get("time"):
                        set_time(page, st["correct"]["time"])
                        COMBOS["births"][birth] = {**COMBOS["births"][birth], "time": st["correct"]["time"]}
                    page.locator("form button[type=submit]").last.click()
                else:
                    buttons = page.eval_on_selector_all("button", "els => els.map(e => e.innerText.trim())")
                    yes = [b for b in buttons if b.startswith("These are right")]
                    page.get_by_role("button", name=yes[0]).click()
                page.wait_for_timeout(1500)
                settle(page, 800)
                token = result(page, ctx, sid, {**meta, "upgrade": True, "birth": birth}, st["tier"])
                # The buyer's earlier links, opened again now the chart has grown: what the
                # link in an older email shows (live 10/21: run1-oldlink, run1-oldchartlink).
                for k, old in enumerate(own_tokens):
                    page.goto(f"{SHOP}/r/{quote(old)}", wait_until="networkidle")
                    settle(page)
                    capture(page, f"{sid}-old{k + 1}", {**meta, "kind": "old-link", "upgrade": True, "birth": birth})
                own_tokens.append(token)
            elif st["do"] == "someone-new":
                page.goto(f"{SHOP}/u/{quote(token)}#new", wait_until="networkidle")
                settle(page)
                capture(page, sid + "-tiers", {**meta, "kind": "someone-new-tiers"})
                label = ["Buy the summary", "Buy the chart", "Buy the reading"][st["tier"]]
                page.get_by_role("button", name=label).click()
                stripe_pay(page, sid + "-stripe", j["buyer"], st.get("promo"), meta)
                capture(page, sid + "-form", {**meta, "kind": "form-blank", "birth": st["birth"]})
                fill_birth(page, st["birth"], st.get("name"))
                capture(page, sid + "-form-filled", {**meta, "kind": "form-filled", "birth": st["birth"]})
                page.locator("form button[type=submit]").last.click()
                submitted(page)
                settle(page, 800)
                # The someone-new chart is its own record; the journey's token stays the original.
                result(page, ctx, sid, {**meta, "birth": st["birth"]}, st["tier"])
        except Exception as e:  # noqa: BLE001
            shot = os.path.join(CAP, sid + ".ERROR.png")
            try:
                page.screenshot(path=shot, full_page=True)
                open(os.path.join(CAP, sid + ".ERROR.txt"), "w", encoding="utf-8").write(page.inner_text("body"))
            except Exception:  # noqa: BLE001
                pass
            manifest["errors"].append({"step": sid, "error": f"{type(e).__name__}: {str(e)[:400]}", "trace": traceback.format_exc()[-1500:], "url": page.url})
            print("STEP FAILED", sid, type(e).__name__, str(e)[:200], flush=True)
            break
        finally:
            rig("/__rig/idle")
            time.sleep(0.4)
            step["emails"] = outbox_since(n0)
            step["seconds"] = round(time.time() - t0, 1)
            print(f"  {sid}: {step['seconds']}s, {len(step['emails'])} email(s)", flush=True)
    jr["lastToken"] = token
    ctx.close()


def extras(browser):
    """The pages a journey does not pass through on its own."""
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, extra_http_headers={"x-rig-visitor": "extras"})
    page = ctx.new_page()
    first = next((j for j in manifest["journeys"] if j.get("lastToken")), None)
    try:
        if first:
            rec = rig("/__rig/record?t=" + quote(first["lastToken"]))
            # An EXPIRED link for a real record, then its "send a fresh link" button.
            tok = rig(f"/__rig/mint?id={rec['id']}&tier={rec['tier']}&ttl=-1")["token"]
            page.goto(f"{SHOP}/r/{quote(tok)}", wait_until="networkidle")
            settle(page)
            capture(page, "link-expired", {"kind": "expired", "tier": rec["tier"]})
            n0 = mails_now()
            btn = page.get_by_role("button", name=re.compile("fresh|email me|send", re.I))
            if btn.count():
                btn.first.click()
                page.wait_for_timeout(1500)
                capture(page, "link-expired-sent", {"kind": "expired-sent", "tier": rec["tier"]})
            manifest["freshLinkEmails"] = outbox_since(n0)
            # A link cut short in the copying.
            page.goto(f"{SHOP}/r/{quote(first['lastToken'][:-9])}", wait_until="networkidle")
            settle(page)
            capture(page, "link-cut-short", {"kind": "cut-short"})
        # Email me my charts, timed with prod-like store latency.
        page.goto(f"{SHOP}/charts", wait_until="networkidle")
        settle(page)
        capture(page, "my-charts", {"kind": "my-charts"})
        rig("/__rig/latency?ms=400")
        n0 = mails_now()
        page.locator("#my-charts-email").fill(EMAIL)
        t0 = time.time()
        page.get_by_role("button", name=re.compile("send|email", re.I)).first.click()
        page.wait_for_function("() => !document.body.innerText.includes('Sending')", timeout=180_000)
        manifest["timings"]["myCharts"] = {"seconds": round(time.time() - t0, 2), "latencyMs": 400, "blobOps": rig("/__rig/blob-ops")["count"]}
        rig("/__rig/latency?ms=0")
        settle(page)
        capture(page, "my-charts-sent", {"kind": "my-charts-sent"})
        manifest["myChartsEmails"] = outbox_since(n0)
        # The phone app's readings site, a link that never existed.
        page.goto(f"{SHOP}/__readings/r/NeverExisted12345", wait_until="networkidle")
        capture(page, "readings-site-unknown", {"kind": "readings-site-unknown"})
        # The shop's own 404.
        page.goto(f"{SHOP}/no-such-page", wait_until="networkidle")
        capture(page, "shop-404", {"kind": "404"})
    except Exception as e:  # noqa: BLE001
        manifest["errors"].append({"step": "extras", "error": f"{type(e).__name__}: {str(e)[:400]}", "trace": traceback.format_exc()[-1500:], "url": page.url})
        print("EXTRAS FAILED", e, flush=True)
    ctx.close()


def website(browser):
    """The website's pages that describe the shop, served locally from its repo."""
    if not SITE:
        return
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    for path in ["/", "/readings/", "/readings/privacy/", "/library/", "/library/human-design/", "/library/bodygraph/", "/tools/"]:
        cid = "web" + (path.strip("/").replace("/", "-") or "-home")
        cid = cid if cid.startswith("web-") else "web-" + cid[3:]
        try:
            page.goto(SITE + path, wait_until="networkidle", timeout=60_000)
            settle(page, 800)
            capture(page, cid, {"kind": "website", "path": path})
        except Exception as e:  # noqa: BLE001
            manifest["errors"].append({"step": cid, "error": f"{type(e).__name__}: {str(e)[:300]}"})
    ctx.close()


def samples():
    """The website's sample PDFs, as shipped in its repo."""
    repo = os.environ.get("HD_WEBSITE_REPO")
    manifest["samples"] = []
    if not repo:
        return
    base = os.path.join(repo, "public", "samples")
    for root, _dirs, files in os.walk(base):
        for f in sorted(files):
            if f.lower().endswith(".pdf"):
                rel = os.path.relpath(os.path.join(root, f), base).replace("\\", "/")
                info = capture_pdf_file(os.path.join(root, f), os.path.join(PDF, "sample-" + rel.replace("/", "-")[:-4]))
                info["published"] = "/samples/" + rel
                manifest["samples"].append(info)


LOCAL_HOSTS = {"thechampagnemethod.co": lambda: SITE, "www.thechampagnemethod.co": lambda: SITE, "humandesign.thechampagnemethod.co": lambda: SHOP}


def local_url(href):
    """A live address on our own sites, pointed at the local copy instead."""
    m = re.match(r"^https?://([^/]+)(/.*)?$", href)
    if not m:
        return None
    host, rest = m.group(1), m.group(2) or "/"
    if host.startswith("127.0.0.1"):
        return href
    if host in LOCAL_HOSTS and LOCAL_HOSTS[host]():
        return LOCAL_HOSTS[host]() + rest
    return None


def gather_links():
    found = {}

    def add(href, where):
        href = href.strip().rstrip(".,)")
        found.setdefault(href, set()).add(where)

    for p in manifest["pages"]:
        for l in json.load(open(os.path.join(RUN, p["links"]), encoding="utf-8")):
            add(l["href"], "page:" + p["id"])
        if p.get("pdf", {}).get("linksFile"):
            for l in json.load(open(p["pdf"]["linksFile"], encoding="utf-8")):
                add(l["href"], f"pdf:{p['id']}:p{l['page']}")
    for s in manifest.get("samples", []):
        for l in json.load(open(s["linksFile"], encoding="utf-8")):
            add(l["href"], f"sample:{s['published']}:p{l['page']}")
    d = os.path.join(RUN, "outbox")
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if f.endswith(".html"):
            for h in re.findall(r'href="([^"]+)"', open(os.path.join(d, f), encoding="utf-8").read()):
                add(h.replace("&amp;", "&"), "email:" + f[:-5])
        if f.endswith(".txt"):
            for h in re.findall(r"https?://[^\s<>\"]+", open(os.path.join(d, f), encoding="utf-8").read()):
                add(h, "email:" + f[:-4])
    return found


def linkcheck(browser):
    """Every link a buyer can press: status after redirects, and for #anchors
    whether the target is present AND in view when the page loads with the hash
    (the library opens entries from the hash)."""
    found = gather_links()
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    status_cache = {}
    out = []
    for href, where in sorted(found.items()):
        rec = {"href": href, "where": sorted(where)[:12], "count": len(where)}
        if href.startswith(("mailto:", "tel:")):
            rec["kind"] = "mailto"
            out.append(rec)
            continue
        url = local_url(href)
        if not url:
            rec["kind"] = "external"
            if os.environ.get("HD_LIVE_LINKS") == "1" and href.startswith("http"):
                try:
                    req = urllib.request.Request(href, headers={"User-Agent": "Mozilla/5.0 hd-e2e linkcheck"})
                    with urllib.request.urlopen(req, timeout=30) as r:
                        rec["status"] = r.status
                except Exception as e:  # noqa: BLE001
                    rec["status"] = getattr(e, "code", None) or str(e)[:60]
            out.append(rec)
            continue
        rec["kind"] = "ours"
        rec["local"] = url
        base, _, frag = url.partition("#")
        if base not in status_cache:
            try:
                with urllib.request.urlopen(urllib.request.Request(base, headers={"Accept": "text/html,*/*"}), timeout=60) as r:
                    status_cache[base] = r.status
            except Exception as e:  # noqa: BLE001
                status_cache[base] = getattr(e, "code", None) or str(e)[:60]
        rec["status"] = status_cache[base]
        if frag and rec["status"] == 200:
            try:
                page.goto("about:blank")
                page.goto(url, wait_until="load", timeout=60_000)
                # Up to 5 s for the page to bring the anchor into view (the
                # library opens an entry from the hash after it renders).
                state = "missing"
                for _ in range(25):
                    page.wait_for_timeout(200)
                    state = page.evaluate(
                        """id => { const el = document.getElementById(decodeURIComponent(id)) || document.querySelector(`[name='${id}']`);
                        if (!el) return 'missing'; const r = el.getBoundingClientRect();
                        return (r.height > 0 && r.bottom > 0 && r.top < innerHeight) ? 'in-view' : 'present-not-in-view'; }""",
                        frag,
                    )
                    if state == "in-view":
                        break
                rec["anchor"] = state
            except Exception as e:  # noqa: BLE001
                rec["anchor"] = "error " + str(e)[:60]
        out.append(rec)
    page.close()
    manifest["links"] = out


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    t_all = time.time()
    for j in COMBOS["journeys"]:
        if ONLY and j["id"] not in ONLY:
            continue
        print("journey", j["id"], flush=True)
        journey(browser, j)
    extras(browser)
    website(browser)
    samples()
    t_links = time.time()
    linkcheck(browser)
    manifest["timings"]["linkSeconds"] = round(time.time() - t_links, 1)
    browser.close()
    manifest["timings"]["driveSeconds"] = round(time.time() - t_all, 1)

json.dump(manifest, open(os.path.join(RUN, "manifest.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"drive: {len(manifest['pages'])} page states, {len(manifest['errors'])} error(s), {manifest['timings']['driveSeconds']}s")
