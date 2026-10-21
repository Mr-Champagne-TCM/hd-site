"""Print the report HTML to PDF with headless Chrome (Letter, backgrounds on).
usage: python print.py <report.html> <report.pdf>"""
import pathlib
import sys
from playwright.sync_api import sync_playwright

src, dst = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    page = b.new_page()
    page.goto(pathlib.Path(src).resolve().as_uri(), wait_until="load")
    page.pdf(path=dst, format="Letter", print_background=True, margin={"top": "0.45in", "bottom": "0.5in", "left": "0.45in", "right": "0.45in"},
             display_header_footer=True, header_template="<span></span>",
             footer_template='<div style="font-size:8px;width:100%;text-align:center;color:#777">HD local test run &middot; page <span class="pageNumber"></span> of <span class="totalPages"></span></div>')
    b.close()
print("pdf", dst)
