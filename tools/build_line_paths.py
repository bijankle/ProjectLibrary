"""The path of every pipeline drawn on the P&IDs, for the phone's line trace (pdfview.js): tap a line number and the whole
line lights up, a slider runs the view along it. One file per drawing, lines/<number>.json:
  {"<ref index>": [[x, y], …]}   the line's path, from its upstream end where the flow arrows show it ("fl" lists those), in the same 1/10,000 sheet units as
                                 pid-refs.json (keyed by the line label's index in that drawing's refs)
  "rb": {"<ribbon ref index>": "<line ref index>"}   the line a continuation ribbon on the sheet carries on
  "m": {"<line ref index>": [[fraction along, kind, text], …]}   what the line passes, for the commentary under the
                                 phone's Line slider (t tee, v valve, i instrument, e equipment, r ribbon, l next line)
  python3 tools/build_line_paths.py [numbers…]     (default: every P&ID in PIDs/index.json)

How a line is followed: the drawing's pipe strokes (dark, at least 8 pt long, so not the strokes of vector lettering)
are cut where a short tick crosses them (flanges, spec breaks). From the stroke beside the line number the trace runs
both ways: straight on through joints, round a corner where only one stroke meets it, across a gap of up to 30 pt in
the same direction (a valve or other symbol drawn on the line). It stops at a tee (two ways on, neither straight),
at a stroke that has another line's number beside it, or where the strokes run out.
"""
import json, math, os, re, sys
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IX = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
REFS = json.load(open(os.path.join(R, "pid-refs.json")))
OUT = os.path.join(R, "lines"); os.makedirs(OUT, exist_ok=True)
LINE = re.compile(r"\d{2,3}-\d{4}-[A-Z]{1,4}-[A-Z0-9]{2,6}-\d{2,4}")
L = lambda t: math.hypot(t[2] - t[0], t[3] - t[1])
def ori(s):
    dx, dy = s[2] - s[0], s[3] - s[1]
    return "h" if abs(dy) < 0.5 else "v" if abs(dx) < 0.5 else "d"

def strokes(p):
    S = []
    for d in p.get_drawings():
        w = d.get("width") or 0; c = d.get("color") or (1, 1, 1)
        if w < 0.6 or sum(c) > 1.5: continue
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1], it[2]
                if math.hypot(b.x - a.x, b.y - a.y) >= 8: S.append((a.x, a.y, b.x, b.y))
    ticks = [t for t in S if L(t) <= 20 and ori(t) in "hv"]
    out = []
    for t in S:
        o = ori(t)
        if L(t) <= 30 or o not in "hv": out.append(t); continue
        cuts = []
        for k in ticks:
            if ori(k) == o: continue
            if o == "h" and min(k[1], k[3]) - 1 < t[1] < max(k[1], k[3]) + 1 and min(t[0], t[2]) + 3 < k[0] < max(t[0], t[2]) - 3: cuts.append(k[0])
            if o == "v" and min(k[0], k[2]) - 1 < t[0] < max(k[0], k[2]) + 1 and min(t[1], t[3]) + 3 < k[1] < max(t[1], t[3]) - 3: cuts.append(k[1])
        if not cuts: out.append(t); continue
        if o == "h":
            xs = sorted([min(t[0], t[2])] + cuts + [max(t[0], t[2])]); out += [(xs[i], t[1], xs[i + 1], t[1]) for i in range(len(xs) - 1) if xs[i + 1] - xs[i] > 1]
        else:
            ys = sorted([min(t[1], t[3])] + cuts + [max(t[1], t[3])]); out += [(t[0], ys[i], t[0], ys[i + 1]) for i in range(len(ys) - 1) if ys[i + 1] - ys[i] > 1]
    return out

def arrows(p):
    """the flow arrows on the sheet: small filled triangles, as (centre, unit direction the tip points)"""
    A = []
    for g in p.get_drawings():
        if g.get("fill") is None or len(g["items"]) != 3 or any(i[0] != "l" for i in g["items"]): continue
        r = g["rect"]
        if not (2 < max(r.width, r.height) < 16): continue
        V = [(i[1].x, i[1].y) for i in g["items"]]
        E = [math.hypot(V[(k + 1) % 3][0] - V[(k + 2) % 3][0], V[(k + 1) % 3][1] - V[(k + 2) % 3][1]) for k in range(3)]   # (the side opposite each corner)
        k = min(range(3), key=lambda k: E[k]); tip = V[k]; b = ((V[(k + 1) % 3][0] + V[(k + 2) % 3][0]) / 2, (V[(k + 1) % 3][1] + V[(k + 2) % 3][1]) / 2)
        d = math.hypot(tip[0] - b[0], tip[1] - b[1])
        if d < 2 or d < E[k] * 1.1: continue   # (a pointed triangle: longer than its base is wide)
        A.append((((tip[0] + b[0]) / 2, (tip[1] + b[1]) / 2), ((tip[0] - b[0]) / d, (tip[1] - b[1]) / d)))
    return A

def flow(P, A):
    """which way the line runs, by the arrows drawn on it: +1 from P[0] to P[-1], -1 the other way, 0 not shown"""
    v = 0
    for (cx, cy), (ux, uy) in A:
        for a, b in zip(P, P[1:]):
            sl = math.hypot(b[0] - a[0], b[1] - a[1])
            if sl < 1: continue
            dx, dy = (b[0] - a[0]) / sl, (b[1] - a[1]) / sl; u = (cx - a[0]) * dx + (cy - a[1]) * dy
            if -2 < u < sl + 2 and abs((cx - a[0]) * dy - (cy - a[1]) * dx) < 2.5 and abs(ux * dx + uy * dy) > .85: v += 1 if ux * dx + uy * dy > 0 else -1; break
    return (v > 0) - (v < 0)

def trace(S, LBL, r, label, gap=30, tol=1.6):
    cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2; vert = r.height > r.width
    best = None
    for i, s in enumerate(S):
        o = ori(s)
        if vert and o == "v" and min(s[1], s[3]) - 5 < cy < max(s[1], s[3]) + 5: d = abs(s[0] - cx)
        elif not vert and o == "h" and min(s[0], s[2]) - 5 < cx < max(s[0], s[2]) + 5: d = abs(s[1] - cy)
        else: continue
        if d < 25 and (best is None or d < best[0]): best = (d, i)
    if not best: return None
    def owner(t):
        o = ori(t); bl = None
        for txt, q in LBL:
            qx, qy = (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2
            if o == "h" and min(t[0], t[2]) - 3 < qx < max(t[0], t[2]) + 3: d = abs(t[1] - qy)
            elif o == "v" and min(t[1], t[3]) - 3 < qy < max(t[1], t[3]) + 3: d = abs(t[0] - qx)
            else: continue
            if d < 20 and (bl is None or d < bl[0]): bl = (d, txt)
        return bl and bl[1]
    ends = lambda s: [(s[0], s[1]), (s[2], s[3])]
    near = lambda a, b: abs(a[0] - b[0]) < tol and abs(a[1] - b[1]) < tol
    seen = {best[1]}; chains = []; why = []
    for start in ends(S[best[1]]):   # each way from the label: a chain of points
        pts = [start]; i, pt = best[1], start
        while True:
            s = S[i]; o = ori(s)
            cand = [j for j, t in enumerate(S) if j not in seen and any(near(pt, e) for e in ends(t))]
            straight = [j for j in cand if ori(S[j]) == o]
            nxt = straight or (cand if len(cand) == 1 else [])
            if not nxt and o in "hv":
                mx, my = (s[0] + s[2]) / 2, (s[1] + s[3]) / 2
                for j, t in enumerate(S):
                    if j in seen or ori(t) != o: continue
                    for e in ends(t):
                        if o == "h" and abs(e[1] - pt[1]) < tol and 0 < abs(e[0] - pt[0]) < gap and (e[0] - pt[0]) * (pt[0] - mx) > 0: nxt = [j]; break
                        if o == "v" and abs(e[0] - pt[0]) < tol and 0 < abs(e[1] - pt[1]) < gap and (e[1] - pt[1]) * (pt[1] - my) > 0: nxt = [j]; break
                    if nxt: break
            if not nxt: why.append(("t", "") if len(cand) > 1 else ("s", "")); break
            j = nxt[0]; ow = owner(S[j])
            if ow and ow != label: why.append(("l", ow)); break
            seen.add(j); t = S[j]
            a, b = sorted(ends(t), key=lambda e: math.hypot(e[0] - pt[0], e[1] - pt[1]))
            pts += [a, b]; i, pt = j, b
        chains.append(pts)
    path = list(reversed(chains[0])) + chains[1]
    path = [p for k, p in enumerate(path) if k == 0 or math.hypot(p[0] - path[k - 1][0], p[1] - path[k - 1][1]) > 0.5]
    # tees along the way: another pipe stroke ending on the line between its ends (not a short tick: a flange or spec break)
    Lc = [0]
    for a, b in zip(path, path[1:]): Lc.append(Lc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    tees = []
    for j, t in enumerate(S):
        if j in seen or L(t) <= 20: continue
        for e in ends(t):
            for i, (a, b) in enumerate(zip(path, path[1:])):
                sl = Lc[i + 1] - Lc[i]
                if sl < 1: continue
                u = ((e[0] - a[0]) * (b[0] - a[0]) + (e[1] - a[1]) * (b[1] - a[1])) / sl / sl
                if not (0 < u < 1) or u * sl < 3 or (1 - u) * sl < 3: continue
                if math.hypot(a[0] + u * (b[0] - a[0]) - e[0], a[1] + u * (b[1] - a[1]) - e[1]) < tol: tees.append((Lc[i] + u * sl, owner(t) or ""))
    return path, (why + [("s", ""), ("s", "")])[:2], tees, Lc

def build(num):
    v = IX[num]; doc = pymupdf.open(os.path.join(R, v["file"])); refs = REFS.get(num, [])
    out = {}; rb = {}; pages = {}; marks = {}; fl = {}
    for k, r in enumerate(refs):
        if r[6] != "line": continue
        pg = r[0] - 1
        if pg not in pages:
            p = doc[pg]
            if p.rotation: pages[pg] = None; continue
            LBL = [(w[4], pymupdf.Rect(w[:4])) for w in p.get_text("words") if LINE.fullmatch(w[4])]
            pages[pg] = (p, strokes(p), LBL, arrows(p))
        if not pages[pg]: continue
        p, S, LBL, AR = pages[pg]; W, H = p.rect.width, p.rect.height
        rr = pymupdf.Rect(r[1] * W / 1e4, r[2] * H / 1e4, (r[1] + r[3]) * W / 1e4, (r[2] + r[4]) * H / 1e4)
        label = str(r[5]).split("|")[0]
        T = trace(S, LBL, rr, label)
        if not T or len(T[0]) < 2: continue
        P, why, tees, Lc = T; tot = Lc[-1] or 1
        # upstream first: the path turned round when the flow arrows on it point back along it
        fw = flow(P, AR)
        if fw < 0: P = P[::-1]; why = why[::-1]; tees = [(tot - d, o) for d, o in tees]; Lc = [tot - x for x in reversed(Lc)]
        if fw: fl[str(k)] = 1
        out[str(k)] = [[round(x / W * 1e4), round(y / H * 1e4)] for x, y in P]
        # what the line passes (commentary along the phone's Line slider): [fraction along, kind, text]
        # kinds: t tee, v valve, i instrument, e equipment, r ribbon (set below), l the next line, s the line's end
        M = [[round(d / tot, 3), "t", o] for d, o in tees]
        for f, (kd, tx) in zip((0, 1), why):
            if kd in "tl": M.append([f, kd, tx])
        for q in refs:
            if q[0] != r[0] or q[6] not in ("mv", "cv", "ins", "spi", "mel"): continue
            cx, cy = (q[1] + q[3] / 2) * W / 1e4, (q[2] + q[4] / 2) * H / 1e4; bd = None
            for i, (a, b) in enumerate(zip(P, P[1:])):
                sl = Lc[i + 1] - Lc[i]
                u = 0 if sl < 1e-6 else max(0, min(1, ((cx - a[0]) * (b[0] - a[0]) + (cy - a[1]) * (b[1] - a[1])) / sl / sl))
                dd = math.hypot(a[0] + u * (b[0] - a[0]) - cx, a[1] + u * (b[1] - a[1]) - cy)
                if bd is None or dd < bd[0]: bd = (dd, (Lc[i] + u * sl) / tot)
            lim = {"mel": 60, "mv": 36, "cv": 36, "spi": 24, "ins": 18}[q[6]]
            if bd and bd[0] < lim: M.append([round(bd[1], 3), {"mel": "e", "mv": "v", "cv": "v", "spi": "v", "ins": "i"}[q[6]], str(q[5]).split("|")[0]])
        marks[str(k)] = M
    # a continuation ribbon carries on the line whose path ends nearest it (within 300 units, about 7 cm at A1)
    for k, r in enumerate(refs):
        if r[6] != "d": continue
        bx = (r[1], r[2], r[1] + r[3], r[2] + r[4]); bestd = None
        for lk, P in out.items():
            if refs[int(lk)][0] != r[0]: continue
            for e in (P[0], P[-1]):
                dx = max(bx[0] - e[0], 0, e[0] - bx[2]); dy = max(bx[1] - e[1], 0, e[1] - bx[3]); d = math.hypot(dx, dy)
                if d < 300 and (bestd is None or d < bestd[0]): bestd = (d, lk)
        if bestd:
            rb[str(k)] = bestd[1]; P = out[bestd[1]]; e0 = math.hypot(P[0][0] - (r[1] + r[3] / 2), P[0][1] - (r[2] + r[4] / 2)); e1 = math.hypot(P[-1][0] - (r[1] + r[3] / 2), P[-1][1] - (r[2] + r[4] / 2))
            f = 0 if e0 < e1 else 1; marks[bestd[1]] = [m for m in marks[bestd[1]] if not (m[0] == f and m[1] in "ts")] + [[f, "r", str(r[5]).split("|")[0]]]
    if out: out["rb"] = rb; out["m"] = {k: sorted(v) for k, v in marks.items()}; out["fl"] = fl
    json.dump(out, open(os.path.join(OUT, num + ".json"), "w"), separators=(",", ":"))
    return sum(1 for r in refs if r[6] == "line"), len(out) - (3 if out else 0), len(rb), len(fl)

if __name__ == "__main__":
    nums = sys.argv[1:] or sorted(k for k in IX if "-PID-" in k)
    tot = [0, 0, 0, 0]
    for n in nums:
        try: a = build(n)
        except Exception as e: print("skip", n, e); continue
        tot = [x + y for x, y in zip(tot, a)]
    print(f"{len(nums)} P&IDs: {tot[1]} of {tot[0]} line numbers traced ({tot[3]} with their flow direction from the arrows); {tot[2]} ribbons matched to a line")
