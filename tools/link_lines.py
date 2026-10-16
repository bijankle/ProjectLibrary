"""Joins across equipment, after tools/build_line_paths.py: a line that stops at a pump (or a strainer, a filter, a
short gap in the drawing) and the line that carries on from the other side, the same fluid code, end to end close by,
with nothing else there. Written to lines/<sheet>.json as "lk": [[k1, end1, k2, end2], …] (end 0 the start of the
path, 1 its end), which the trace's next line arrows (pdfview.js trNbs) follow.

Through a vessel (a tank, hopper, box, cyclone, any closed outline): a line that runs into it and one that runs out
of it are joined whatever their fluids (process water in, slurry out through the pump), so next line flies on
through. The outline is found on a picture of the sheet: the white inside it, reached a few points on past the
line's end, a closed patch of a vessel's size.

Where both lines run into the join, or both away from it, one flow is wrong (two suctions, or two discharges): at a
pump the larger bore is the suction, so the smaller is turned round (path reversed, milestones mirrored).
"""
import glob, json, math, os, sys
import numpy as np, pymupdf
from scipy import ndimage

R = sys.argv[1] if len(sys.argv) > 1 else "."
REFS = json.load(open(os.path.join(R, "pid-refs.json")))
NEAR, FAR = 45, 260   # (ends closer than NEAR already join at run time; FAR the most a pump or strainer takes)


def parts(lbl):
    p = str(lbl).split("|")[0].split("-")
    bore = next((int(x) for x in p[4:5] if x.isdigit()), None)
    return (p[2] if len(p) > 2 else None), bore


def segd(P, q):
    m = 1e18
    for a, b in zip(P, P[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]; ll = dx * dx + dy * dy or 1
        t = max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / ll))
        m = min(m, math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1]))
    return m


def ahead(P, e, q):
    """how far q lies straight on from the end e of P (cosine of the angle off its last run)"""
    a, b = (P[-2], P[-1]) if e else (P[1], P[0])
    for i in range(2, len(P)):
        if math.dist(a, b) > 5: break
        a = P[-1 - i] if e else P[i]
    ux, uy = b[0] - a[0], b[1] - a[1]; vx, vy = q[0] - b[0], q[1] - b[1]
    n = math.hypot(ux, uy) * math.hypot(vx, vy)
    return (ux * vx + uy * vy) / n if n else 0


IX = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]


UTIL = {"IA", "CA", "BA", "LO", "HO", "GW", "FD", "OXY", "LPG", "AS", "TO", "V"}   # (services into a vessel that are not the process going through it)


def vessels(num, D, keys, pg, free, info, done):
    if num not in IX: return []
    doc = pymupdf.open(os.path.join(R, IX[num]["file"])); out = []
    for pn in sorted({pg[k] for k in keys}):
        page = doc[pn - 1]; s = 1.0; pm = page.get_pixmap(matrix=pymupdf.Matrix(s, s), colorspace=pymupdf.csGRAY)
        img = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width)
        dark = ndimage.binary_dilation(img < 170)
        lab, n = ndimage.label(~dark); area = np.bincount(lab.ravel())
        W, H = pm.width, pm.height; top = W * H * .02
        def inside(k, e):
            """the vessel a line's end runs into: the closed white patch just past it"""
            P = D[k]; b = P[-1] if e else P[0]
            a = next((q for q in (P[::-1] if e else P)[1:] if math.dist(q, b) > 5), None)
            if a is None: return None
            ux, uy = (b[0] - a[0]) * W / 1e4, (b[1] - a[1]) * H / 1e4; L = math.hypot(ux, uy); ux, uy = ux / L, uy / L
            x0, y0 = b[0] * W / 1e4, b[1] * H / 1e4; hit = False
            for t in range(1, 26):
                x, y = int(x0 + ux * t), int(y0 + uy * t)
                if not (0 <= x < W and 0 <= y < H): return None
                if dark[y, x]: hit = True; continue
                c = lab[y, x]
                if 250 < area[c] < top and (hit or t > 3): return c
                if hit: return None
            return None
        ins, outs = {}, {}
        for k in keys:
            if pg[k] != pn: continue
            for e in (0, 1):
                if not free(k, e): continue
                c = inside(k, e)
                if c: (ins if e else outs).setdefault(c, []).append(k)
        for c, I in ins.items():
            O = [k for k in outs.get(c, []) if k not in I]
            if not O or len(O) > 3 or len(I) > 4: continue
            for a in I:
                for b in O:
                    fa, fb = info[a][0], info[b][0]
                    if fa != fb and (fa in UTIL or fb in UTIL): continue
                    if (a, b) not in done: out.append([int(a), 1, int(b), 0]); done.add((a, b))
    return out


def run(path):
    num = os.path.basename(path)[:-5]; D = json.load(open(path)); refs = REFS.get(num, [])
    keys = [k for k in D if k.isdigit() and int(k) < len(refs)]
    if not keys: return 0, 0
    info = {k: parts(refs[int(k)][5]) for k in keys}
    pg = {k: refs[int(k)][0] for k in keys}
    def free(k, e):
        q = D[k][-1 if e else 0]
        for k2 in keys:
            if k2 != k and pg[k2] == pg[k] and segd(D[k2], q) < NEAR: return False
        for j, kk in (D.get("rb") or {}).items():
            if str(kk) == k:
                r = refs[int(j)]
                if math.hypot(max(r[1] - q[0], 0, q[0] - r[1] - r[3]), max(r[2] - q[1], 0, q[1] - r[2] - r[4])) < 300: return False
        return True
    ends = [(k, e) for k in keys for e in (0, 1) if info[k][0] and free(k, e)]
    cand = []
    for i, (k, e) in enumerate(ends):
        for k2, e2 in ends[i + 1:]:
            if k2 == k or pg[k2] != pg[k] or info[k2][0] != info[k][0]: continue
            A, B = D[k][-1 if e else 0], D[k2][-1 if e2 else 0]; d = math.dist(A, B)
            if d >= FAR: continue
            # (two lines both running in, or both out, join only across a pump: bores differ)
            if e == e2 and (info[k][1] or 0) == (info[k2][1] or 0): continue
            # (the step across carries on the way one of the lines was going: not two lines side by side)
            if d > 8 and max(ahead(D[k], e, B), ahead(D[k2], e2, A)) < .3: continue
            cand.append((d, k, e, k2, e2))
    # (each end joined once, nearest first; an end with a second candidate nearly as close is left alone)
    cand.sort(); used = set(); lk = []; flips = 0
    for d, k, e, k2, e2 in cand:
        if (k, e) in used or (k2, e2) in used: continue
        rival = [c for c in cand if c[0] < d * 1.5 and c[0] != d and ((c[1], c[2]) in ((k, e), (k2, e2)) or (c[3], c[4]) in ((k, e), (k2, e2)))]
        if rival: continue
        used |= {(k, e), (k2, e2)}
        if e == e2:   # (both run in, or both run out: turn the smaller bore round)
            b1, b2 = info[k][1] or 0, info[k2][1] or 0
            if b1 != b2:
                s = k2 if (b2 < b1) == (e == 1) else k   # (two ends in: the smaller is the discharge; two starts: the larger is the suction)
                D[s] = D[s][::-1]
                if "m" in D and s in D["m"]: D["m"][s] = sorted([[round(1 - m[0], 3)] + m[1:] for m in D["m"][s]])
                flips += 1
                if s == k: e = 1 - e
                else: e2 = 1 - e2
        lk.append([int(k), e, int(k2), e2])
    lk += vessels(num, D, keys, pg, free, info, {(a, b) for a, _, b, _ in lk} | {(b, a) for a, _, b, _ in lk})
    if lk: D["lk"] = lk
    elif "lk" in D: del D["lk"]
    json.dump(D, open(path, "w"), separators=(",", ":"))
    return len(lk), flips


if __name__ == "__main__":
    n = f = 0
    for p in sorted(glob.glob(os.path.join(R, "lines", "*-PID-*.json"))):
        a, b = run(p); n += a; f += b
    print(n, "joins,", f, "lines turned round")
