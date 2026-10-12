"""Where the drawing sits on each sheet: the box round everything drawn on page 1 (from its picture, PIDs/X.pdf.p1.png),
in fractions of the page, into sheet-bbox.json, so the viewers fit the drawing itself and not the page's empty margin.

  python3 tools/build_bbox.py      (after tools/build_pics.py)
  sheet-bbox.json: {file: [left, top, right, bottom]}   (fractions of the page, 0 to 1)
"""
import json, os
from PIL import Image, ImageOps
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ix = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
out = {}
for v in ix.values():
    f = os.path.join(R, v["file"] + ".p1.png")
    if not os.path.exists(f): continue
    im = Image.open(f).convert("L"); w, h = im.size
    # (near white counts as paper: a faint scan speck must not stretch the box)
    b = ImageOps.invert(im.point(lambda x: 255 if x > 235 else x)).getbbox()
    if not b: continue
    m = 6   # a few pixels of paper kept round the drawing
    out[v["file"]] = [round(max(0, b[0] - m) / w, 4), round(max(0, b[1] - m) / h, 4), round(min(w, b[2] + m) / w, 4), round(min(h, b[3] + m) / h, 4)]
json.dump(out, open(os.path.join(R, "sheet-bbox.json"), "w"), separators=(",", ":"))
print(len(out), "sheets;", sum(1 for x in out.values() if (x[2] - x[0]) * (x[3] - x[1]) < .85), "with a margin of more than 15%")
