"""Ready-made pictures of every drawing sheet, so a drawing shows at once instead of the phone redrawing it from the
PDF (5 to 7 s for a busy P&ID on a phone). One PNG per page beside its PDF: PIDs/X.pdf -> PIDs/X.pdf.p1.png, 2400 px
on the long side, 4 shades of grey (small, and lines stay smooth). The viewer shows the picture first and draws the
PDF itself only where you zoom past the picture's detail. pics.json lists them: {"PIDs/X.pdf": pages}.
Run after the drawings change, then tools/build_offline.py: python3 tools/build_pics.py [--force]
"""
import glob, io, json, os, sys
import pymupdf as fitz
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), ".."); LONG = 2400
force = "--force" in sys.argv
out = {}
for f in sorted(glob.glob(os.path.join(ROOT, "PIDs", "*.pdf")) + glob.glob(os.path.join(ROOT, "PFDs", "*.pdf"))):
    rel = os.path.relpath(f, ROOT).replace(os.sep, "/")
    d = fitz.open(f); n = d.page_count; out[rel] = n
    for i in range(n):
        png = f"{f}.p{i + 1}.png"
        if not force and os.path.exists(png) and os.path.getmtime(png) >= os.path.getmtime(f): continue
        p = d[i]; k = LONG / max(p.rect.width, p.rect.height)
        pix = p.get_pixmap(matrix=fitz.Matrix(k, k), colorspace=fitz.csGRAY, alpha=False)
        im = Image.frombytes("L", (pix.width, pix.height), pix.samples).quantize(4, dither=Image.Dither.NONE)
        im.save(png, "PNG", optimize=True)
    print(f"{rel} {n} page(s)", flush=True)
json.dump(out, open(os.path.join(ROOT, "pics.json"), "w"), separators=(",", ":"))
tot = sum(os.path.getsize(p) for p in glob.glob(os.path.join(ROOT, "P*Ds", "*.png")))
print(f"{len(out)} drawings, {sum(out.values())} pictures, {tot / 1e6:.1f} MB")
