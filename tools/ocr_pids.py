"""Adds a better searchable text layer to the P&IDs so the app can find and mark a tag on the sheet (pdfview.js).
The uploaded sheets carry a weak OCR layer that misses boxed tags and vertical line numbers. Each sheet is rendered at
500 dpi and read with Tesseract in sparse text + orientation mode (psm 12), and every word is written back onto the page
as invisible text (vertical words rotated to match). Nothing visible changes.

Usage: python3 tools/ocr_pids.py [PIDs/2000-F24-PID-PR-10004.pdf …]   (default: every PID; run after tools/build_pids.py)
Needs the tesseract command. Uses all CPU cores; about 20 s per sheet per core.
"""
import glob, json, os, re, subprocess, sys, tempfile
from multiprocessing import Pool
import pymupdf
ROOT = os.path.join(os.path.dirname(__file__), "..")
DPI = 500
MARK = "ocr500"

def words(page):
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "p.png"); page.get_pixmap(dpi=DPI, colorspace=pymupdf.csGRAY).save(f)
        try: tsv = subprocess.run(["tesseract", f, "-", "--psm", "12", "tsv"], capture_output=True, text=True, timeout=300,
                                  env=dict(os.environ, OMP_THREAD_LIMIT="1")).stdout   # one thread each: the pool uses the cores
        except subprocess.TimeoutExpired: return []
    k = DPI / 72; out = []
    for row in tsv.splitlines()[1:]:
        c = row.split("\t")
        if len(c) != 12 or not c[11].strip() or float(c[10]) < 35: continue
        t = c[11].strip()
        if len(t) < 2 or not re.search(r"[A-Za-z0-9]", t): continue
        x, y, w, h = (int(v) for v in c[6:10])
        out.append((pymupdf.Rect(x / k, y / k, (x + w) / k, (y + h) / k), t))
    return out

def one(path):
    doc = pymupdf.open(path)
    if MARK in (doc.metadata.get("keywords") or ""): return path, 0
    font = pymupdf.Font("helv"); n = 0
    for page in doc:
        for r, t in words(page):
            vertical = r.height > r.width * 1.6 and len(t) > 3
            size = (r.width if vertical else r.height) * .8
            L = font.text_length(t, fontsize=size) or 1
            span = r.height if vertical else r.width
            size *= span / L    # stretch so the invisible word covers the same length as the printed one
            size = max(2, min(size, (r.width if vertical else r.height) * 1.3))
            try:
                if vertical: page.insert_text((r.x1 - size * .2, r.y1), t, fontsize=size, fontname="helv", render_mode=3, rotate=90)
                else: page.insert_text((r.x0, r.y1 - size * .2), t, fontsize=size, fontname="helv", render_mode=3)
                n += 1
            except Exception: pass
    m = doc.metadata; m["keywords"] = ((m.get("keywords") or "") + " " + MARK).strip(); doc.set_metadata(m)
    tmp = path + ".tmp"; doc.save(tmp, garbage=3, deflate=True); doc.close(); os.replace(tmp, path)
    return path, n

if __name__ == "__main__":
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "PIDs", "*.pdf")))
    with Pool(os.cpu_count() or 2) as pool:
        for i, (p, n) in enumerate(pool.imap_unordered(one, files), 1):
            print(f"{i}/{len(files)} {os.path.basename(p)} {n} words", flush=True)
    ix = os.path.join(ROOT, "PIDs", "index.json")
    if os.path.exists(ix):   # sizes changed
        d = json.load(open(ix))
        for v in d["pids"].values():
            f = os.path.join(ROOT, v["file"])
            if os.path.exists(f): v["size"] = os.path.getsize(f)
        json.dump(d, open(ix, "w"), indent=1)
