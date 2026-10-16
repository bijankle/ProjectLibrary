"""Line number boxes stretched to the printed number (pid-refs.json, "line" refs on the P&IDs).

A box fitted from a sheet's text layer misses a character where that layer sits a little off the print (an OCR'd
sheet: 75-8445-PW-PE12.5-160 boxed from its "5"). On a picture of the sheet the ink of the row the box sits on is
followed out from each end, through the gaps between characters (under 0.9 of a character's width), at most two
characters each way, and the box grows to take it in.
"""
import json, os, sys
import numpy as np, pymupdf

R = sys.argv[1] if len(sys.argv) > 1 else "."
P = os.path.join(R, "pid-refs.json"); REFS = json.load(open(P)); IX = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
S = 3.0
grown = 0
# (how wide a number should be: its characters times a character's width, a character's width a fixed share of the
# box's height; the share the median over the sheet's line number boxes)
import statistics
RATIO = {num: statistics.median([r[3] / max(1, r[4]) / len(str(r[5]).split("|")[0]) for r in refs if r[6] == "line" and r[3] > r[4]] or [0])
         for num, refs in REFS.items() if "-PID-" in num}   # (per sheet: its own lettering)
for num, refs in REFS.items():
    if "-PID-" not in num or num not in IX: continue
    doc = None
    for r in refs:
        if r[6] != "line" or r[3] <= r[4]: continue   # (upright numbers only: the row runs across)
        E = RATIO[num] * r[4] * len(str(r[5]).split("|")[0])   # (its width as it should be, in the ref's own units)
        if doc is None: doc = pymupdf.open(os.path.join(R, IX[num]["file"]))
        pg = doc[r[0] - 1]; W, H = pg.rect.width, pg.rect.height
        x0, y0, x1, y1 = r[1] * W / 1e4, r[2] * H / 1e4, (r[1] + r[3]) * W / 1e4, (r[2] + r[4]) * H / 1e4
        h = y1 - y0; cw = h * .75; pad = 2.2 * cw
        clip = pymupdf.Rect(x0 - pad, y0 + h * .15, x1 + pad, y1 - h * .15)
        pm = pg.get_pixmap(matrix=pymupdf.Matrix(S, S), clip=clip, colorspace=pymupdf.csGRAY)
        a = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width)
        ink = (a < 140).sum(0) > 0; n = len(ink)
        l, rr = int(pad * S), n - int(pad * S); gap = int(cw * .9 * S)
        def walk(i, step, stop):
            last = i
            while 0 <= i + step < n and abs(i + step - stop) > 0:
                i += step
                if ink[i]: last = i
                elif abs(i - last) > gap: break
            return last
        nl, nr = walk(l, -1, 0), walk(rr - 1, 1, n - 1)
        # (a long run of ink beyond (a pipe through the row) is not part of the number: keep the box)
        if nl < l and ink[max(0, nl - 1):l].mean() > .8: nl = l
        if nr > rr - 1 and ink[rr:nr + 1].mean() > .8: nr = rr - 1
        if nl < l - 2 or nr > rr + 1:
            nx0 = clip.x0 + nl / S - .5; nx1 = clip.x0 + (nr + 1) / S + .5
            nx0, nx1 = min(nx0, x0), max(nx1, x1)
            Ep = E * W / 1e4
            if nx1 - nx0 > max(1.08 * Ep, 1.1 * (x1 - x0)): continue   # (it ran into something past the number)
            r[1] = round(nx0 / W * 1e4); r[3] = round((nx1 - nx0) / W * 1e4); grown += 1
json.dump(REFS, open(P, "w"), separators=(",", ":"))
print(grown, "line number boxes stretched")
