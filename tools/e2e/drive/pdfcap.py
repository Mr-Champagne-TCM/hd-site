"""One PDF, taken apart for the checks: text per page, every link annotation,
a PNG per page, and how much of each page is filled (ink rows / page rows),
so a page left almost empty is a number rather than something to spot.
"""
import json

import pypdfium2 as pdfium
from pypdf import PdfReader


def fill_of(img):
    """Fraction of the page's height that carries any ink (non-near-white)."""
    g = img.convert("L")
    w, h = g.size
    px = g.load()
    inked = 0
    step = 2
    for y in range(0, h, step):
        row_ink = 0
        for x in range(0, w, 3):
            if px[x, y] < 235:
                row_ink += 1
                if row_ink > 2:
                    break
        if row_ink > 2:
            inked += 1
    return round(inked / (h / step), 4)


def ink_band(img):
    """Top and bottom of the inked area, as fractions of the page height."""
    g = img.convert("L")
    w, h = g.size
    px = g.load()
    rows = [y for y in range(0, h, 2) if sum(1 for x in range(0, w, 4) if px[x, y] < 235) > 2]
    return (round(rows[0] / h, 3), round(rows[-1] / h, 3)) if rows else (None, None)


def capture_pdf(request, url, prefix):
    r = request.get(url, timeout=120_000)
    out = {"url": url, "status": r.status, "type": r.headers.get("content-type"), "disposition": r.headers.get("content-disposition")}
    if r.status != 200 or "pdf" not in (r.headers.get("content-type") or ""):
        out["error"] = (r.text() or "")[:300]
        return out
    path = prefix + ".pdf"
    open(path, "wb").write(r.body())
    rd = PdfReader(path)
    texts, links = [], []
    for n, pg in enumerate(rd.pages, 1):
        texts.append(pg.extract_text() or "")
        for a in pg.get("/Annots") or []:
            a = a.get_object()
            uri = (a.get("/A") or {}).get("/URI")
            if uri:
                links.append({"page": n, "href": str(uri)})
    doc = pdfium.PdfDocument(path)
    pages = []
    for n in range(len(doc)):
        img = doc[n].render(scale=1.2).to_pil()
        img.save(f"{prefix}.p{n + 1}.png")
        top, bottom = ink_band(img)
        pages.append({"n": n + 1, "fill": fill_of(img), "inkTop": top, "inkBottom": bottom, "png": f"{prefix}.p{n + 1}.png"})
    json.dump(texts, open(prefix + ".pages.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(links, open(prefix + ".links.json", "w", encoding="utf-8"), indent=1)
    out.update({"file": path, "pages": len(rd.pages), "pageInfo": pages, "title": str((rd.metadata or {}).get("/Title") or ""), "textFile": prefix + ".pages.json", "linksFile": prefix + ".links.json"})
    return out


def capture_pdf_file(path, prefix):
    """The same, for a PDF already on disk (the website's sample PDFs)."""
    rd = PdfReader(path)
    texts = [pg.extract_text() or "" for pg in rd.pages]
    links = []
    for n, pg in enumerate(rd.pages, 1):
        for a in pg.get("/Annots") or []:
            a = a.get_object()
            uri = (a.get("/A") or {}).get("/URI")
            if uri:
                links.append({"page": n, "href": str(uri)})
    json.dump(texts, open(prefix + ".pages.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(links, open(prefix + ".links.json", "w", encoding="utf-8"), indent=1)
    return {"file": path, "pages": len(rd.pages), "title": str((rd.metadata or {}).get("/Title") or ""), "textFile": prefix + ".pages.json", "linksFile": prefix + ".links.json"}
