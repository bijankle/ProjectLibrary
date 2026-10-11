"""Reads the electrical drawings (SLDs/) whose text is drawn as outlines or scanned, so the app can tell what is on them.
Two readings with Tesseract, written back as invisible text (nothing visible changes):
  1. the sheet as it lies (tools/ocr_pids.py), for a sheet not read yet;
  2. the sheet turned a quarter turn clockwise, which is how the feeder names down an SLD are written (bottom to top:
     F23-TR-016, FINAL TAILS PUMPS …). Read upright those come out backwards (OL0-MS-004) and match nothing.
Only sheets without a drawn text layer are read (under 150 words of their own, or already marked ocr500); the rest
carry real text. A sheet read here is marked ocrvert in the PDF keywords and skipped next time.
A sheet drawn in hairlines reads as almost nothing (a dozen words off a full A3 sheet): one that still has under 300
words a page, or that tools/ocr_pids.py --thick already had to thicken, is read again both ways with every grey pixel
made black and the strokes thickened (marked ocrvthick).

Usage: python3 tools/ocr_slds.py [SLDs/2000-F00-SLD-EL-10006.pdf …]   (default: every SLDs/*.pdf; after tools/build_slds.py,
before tools/build_sld_refs.py). Needs the tesseract command and Pillow.
"""
import glob, json, os, re, subprocess, sys, tempfile
from multiprocessing import Pool
import pymupdf
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_pids
Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DPI, MARK, THICK = 400, "ocrvert", "ocrvthick"

def turned(page, thick=False):
    """words read on the page turned 90° clockwise, as (rect on the page, text)"""
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "p.png"); page.get_pixmap(dpi=DPI, colorspace=pymupdf.csGRAY).save(f)
        im = Image.open(f); H = im.height
        if thick: im = im.point(lambda v: 0 if v < 235 else 255).filter(ImageFilter.MinFilter(3))
        im.transpose(Image.ROTATE_270).save(f)
        try: tsv = subprocess.run(["tesseract", f, "-", "--psm", "11", "tsv"], capture_output=True, text=True, timeout=600, env=dict(os.environ, OMP_THREAD_LIMIT="1")).stdout
        except subprocess.TimeoutExpired: tsv = ""
    k = DPI / 72; out = []
    for row in tsv.splitlines():
        c = row.split("\t")
        if len(c) != 12 or c[0] == "level" or not c[11].strip() or float(c[10]) < 40: continue
        t = c[11].strip()
        if len(t) < 3 or not re.search(r"[A-Za-z0-9]{2}", t): continue
        x, y, w, h = (int(v) for v in c[6:10])
        if w < h * 1.2: continue   # (a word lying along the turned sheet; the upright reading has the rest)
        out.append((pymupdf.Rect(y / k, (H - x - w) / k, (y + h) / k, (H - x) / k), t))   # turned back onto the page
    return out

def kws(doc): return (doc.metadata.get("keywords") or "").split()
def nwords(doc): return sum(len(p.get_text("words")) for p in doc)
def scanned(doc):   # no drawn text layer: read before, or next to no words of its own
    kw = kws(doc); return any(m.startswith("ocr") for m in kw) or nwords(doc) < 150 * doc.page_count
def needs(doc):
    kw = kws(doc)
    if not scanned(doc): return False
    return MARK not in kw or (THICK not in kw and ("ocr500thick" in kw or nwords(doc) < 300 * doc.page_count))

def write(path, thick):
    """the turned reading written onto the sheet as invisible text; returns the words added"""
    doc = pymupdf.open(path); font = pymupdf.Font("helv"); n = 0
    for page in doc:
        have = [(pymupdf.Rect(w[:4]), w[4]) for w in page.get_text("words")]
        for r, t in turned(page, thick):
            if any(t == u and (r & q).get_area() > .5 * r.get_area() for q, u in have): continue
            have.append((r, t))
            size = r.width * .8; size *= r.height / (font.text_length(t, fontsize=size) or 1)
            size = max(2, min(size, r.width * 1.3))
            try: page.insert_text((r.x1 - size * .2, r.y1), t, fontsize=size, fontname="helv", render_mode=3, rotate=90); n += 1
            except Exception: pass
    m = doc.metadata; m["keywords"] = ((m.get("keywords") or "") + " " + (THICK if thick else MARK)).strip(); doc.set_metadata(m)
    tmp = path + ".tmp"; doc.save(tmp, garbage=3, deflate=True); doc.close(); os.replace(tmp, path)
    return n

def upright(path, thick):   # tools/ocr_pids.py's reading, plain or thickened
    ocr_pids.THICK, ocr_pids.MARK = thick, "ocr500thick" if thick else "ocr500"
    return ocr_pids.one(path)[1]

def one(path):
    doc = pymupdf.open(path); kw = kws(doc); ok = needs(doc); doc.close()
    if not ok: return path, -1
    n = 0
    if MARK not in kw:
        if not any(m.startswith("ocr500") for m in kw): n += upright(path, False)
        n += write(path, False)
    doc = pymupdf.open(path); kw = kws(doc); thick = THICK not in kw and ("ocr500thick" in kw or nwords(doc) < 300 * doc.page_count); doc.close()
    if thick:
        if "ocr500thick" not in kw: n += upright(path, True)
        n += write(path, True)
    return path, n

if __name__ == "__main__":
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "SLDs", "*.pdf")))
    files = [f for f in files if needs(pymupdf.open(f))]
    print(len(files), "sheets to read", flush=True)
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
