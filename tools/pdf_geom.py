"""Geometric checks over every rendered PDF in a directory, and a PNG of every page.

What a unit test cannot see and a person can: text drawn on top of other text,
text past the page margin, text on top of the footer. This measures those with
the text-run rectangles pdfium reports for every page (one rectangle per run of
text on one baseline -- pdfium's own grouping, not a guess from glyph centres,
which split "Your Human Design" into a capitals line and a lowercase line on
the first attempt and flagged every title on every page).

  overlap   two text runs whose rectangles intersect by more than a sliver
            (a tight descender is not an overlap; two lines of 9pt text
            printed over each other is)
  margin    any run outside the page's live area
  footer    any non-footer run reaching into the footer band, where the footer
            band is measured from the footer's own runs (the ones carrying the
            site name), not assumed

Run:  uv run --with pypdfium2 --with pillow python tools/pdf_geom.py <pdfDir> [--png]
Exit 0 only when every page of every file is clean. Every flag is printed with
file, page and the two strings involved, so it can be looked at.
"""
import json
import sys
from pathlib import Path

import pypdfium2 as pdfium

PAGE_W, PAGE_H = 612.0, 792.0
LIVE_X0, LIVE_X1 = 36.0, PAGE_W - 36.0
LIVE_Y0, LIVE_Y1 = 20.0, PAGE_H - 20.0
MIN_OVERLAP_AREA = 6.0          # pt^2
FOOTER_MARK = "thechampagnemethod"


def runs(page):
    tp = page.get_textpage()
    out = []
    n = tp.count_rects()
    for i in range(n):
        l, b, r, t = tp.get_rect(i)
        if r - l <= 0 or t - b <= 0:
            continue
        text = tp.get_text_bounded(left=l, bottom=b, right=r, top=t).strip()
        if not text:
            continue
        out.append({"box": (l, b, r, t), "text": text})
    return out


def overlap_area(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return w * h if w > 0 and h > 0 else 0.0


def check_page(rs):
    flags = []
    for i, a in enumerate(rs):
        for b in rs[i + 1:]:
            area = overlap_area(a["box"], b["box"])
            if area > MIN_OVERLAP_AREA:
                flags.append(("overlap", round(area, 1), a["text"][:60], b["text"][:60]))
    for r in rs:
        l, b, rt, t = r["box"]
        if l < LIVE_X0 - 0.5 or rt > LIVE_X1 + 0.5 or b < LIVE_Y0 or t > LIVE_Y1:
            flags.append(("margin", tuple(round(v) for v in r["box"]), r["text"][:60], ""))
    # The footer sits in the bottom 60pt. The mark alone is not enough: pdfium can
    # hand back one oversized rect whose bounded text happens to include the
    # footer, and a band measured from that swallowed the whole page.
    footer = [r for r in rs if FOOTER_MARK in r["text"].replace(" ", "").lower() and r["box"][3] < 60]
    if footer:
        band_top = max(r["box"][3] for r in footer)
        footer_ids = {id(r) for r in footer}
        for r in rs:
            if id(r) in footer_ids:
                continue
            # Anything living wholly inside the band is the footer's own furniture
            # (the page number, the Privacy link). The fault is a BODY run that
            # reaches down into it.
            if r["box"][1] < band_top and r["box"][3] >= 60:
                flags.append(("footer", round(r["box"][1], 1), r["text"][:60], ""))
    else:
        flags.append(("no-footer", 0, "", ""))
    return flags


def main(argv):
    pdf_dir = Path(argv[1])
    want_png = "--png" in argv
    png_dir = pdf_dir / "png"
    if want_png:
        png_dir.mkdir(exist_ok=True)
    report = {}
    total_flags = 0
    clean = 0
    for pdf in sorted(pdf_dir.glob("*.pdf")):
        doc = pdfium.PdfDocument(str(pdf))
        pages_report = []
        for pi in range(len(doc)):
            page = doc[pi]
            w, h = page.get_size()
            if abs(w - PAGE_W) > 0.5 or abs(h - PAGE_H) > 0.5:
                flags = [("page-size", (w, h), "", "")]
                rs = []
            else:
                rs = runs(page)
                flags = check_page(rs)
            pages_report.append({"page": pi + 1, "runs": len(rs), "flags": flags})
            total_flags += len(flags)
            if want_png:
                page.render(scale=1.5).to_pil().save(png_dir / f"{pdf.stem}-p{pi + 1}.png")
        report[pdf.name] = pages_report
        bad = [p for p in pages_report if p["flags"]]
        if not bad:
            clean += 1
        else:
            print(f"{pdf.name.ljust(40)} pages={len(doc)}  {sum(len(p['flags']) for p in bad)} FLAGS")
            for p in bad:
                for f in p["flags"]:
                    print(f"    p{p['page']} {f[0]:10} {f[1]}  |{f[2]}|  |{f[3]}|")
    (pdf_dir / "geom-report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(f"\n{len(report)} files: {clean} clean, {len(report) - clean} flagged, {total_flags} flags")
    return 0 if total_flags == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
