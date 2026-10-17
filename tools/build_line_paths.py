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
LINE = re.compile(r"\d{2,3}-\d{4}-[A-Z]{1,4}-[A-Z0-9]{2,6}-\d{2,4}(?:-[A-Z0-9]{1,4})?")   # (with a suffix: -TI insulated)
L = lambda t: math.hypot(t[2] - t[0], t[3] - t[1])
def ori(s):
    dx, dy = s[2] - s[0], s[3] - s[1]
    return "h" if abs(dy) < 0.5 else "v" if abs(dx) < 0.5 else "d"

def pale(c):
    """white, or a pale grey: construction lines and masks, not pipe (a coloured pen, however light, is pipe)"""
    c = c or (1, 1, 1); return min(c) > .72 and max(c) - min(c) < .15

def drawings(p):
    """the sheet's vector drawing, turned to the page as it is shown (a page set to show turned keeps its drawing unturned)"""
    G = p.get_drawings()
    if not p.rotation: return G
    m = p.rotation_matrix
    for d in G:
        d["items"] = [(it[0],) + tuple((q * m) if isinstance(q, pymupdf.Point) else q for q in it[1:]) for it in d["items"]]
        d["rect"] = d["rect"] * m
    return G

def straight(it):
    """a drawing item that is a straight line: a line, or a curve drawn straight (its handles on the chord)"""
    if it[0] == "l": return (it[1].x, it[1].y), (it[2].x, it[2].y)
    if it[0] == "c":
        a, c1, c2, b = it[1], it[2], it[3], it[4]; L0 = math.hypot(b.x - a.x, b.y - a.y)
        if L0 < 8: return None
        off = lambda q: abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) / L0
        if off(c1) < .5 and off(c2) < .5: return (a.x, a.y), (b.x, b.y)
    return None

def square(t):
    """a stroke within 3% of level or plumb squared up (a pipe drawn a hair off: 3 pt over 940; a real diagonal is at 45)"""
    dx, dy = t[2] - t[0], t[3] - t[1]
    if 0 < abs(dy) <= abs(dx) * .03: y = (t[1] + t[3]) / 2; return (t[0], y, t[2], y)
    if 0 < abs(dx) <= abs(dy) * .03: x = (t[0] + t[2]) / 2; return (x, t[1], x, t[3])
    return t

def strokes(p, mw=None):
    S = []; G = drawings(p)
    # (the pipe pen: 0.6 pt or more; a sheet drawn with a thinner set of pens, its pipes at about 0.48 and its signal
    # lines at 0.24, has hardly any of those, and takes 0.45 pt; one drawn all in a single fine pen, 0.2)
    long_ = lambda d, mw: sum(1 for it in d["items"] if (ab := straight(it)) and math.dist(*ab) >= 8) if (d.get("width") or 0) >= mw and not pale(d.get("color")) else 0
    mw = mw or next((m for m in (0.6, 0.45) if sum(long_(d, m) for d in G) >= 300), 0.2)   # (a small sheet drawn all in one fine pen: that)
    for d in G:
        w = d.get("width") or 0; c = d.get("color") or (1, 1, 1)
        if w < mw or pale(c): continue
        for it in d["items"]:
            ab = straight(it)
            if ab:
                (ax, ay), (bx, by) = ab
                if math.hypot(bx - ax, by - ay) >= 8: S.append(square((ax, ay, bx, by)))
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
    for g in drawings(p):
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

DRAIN = re.compile(r"GRADE|DRAIN|VENT|ATM|SUMP|BUND|FUNNEL|TUNDISH", re.I)
def trace(S, LBL, r, label, gap=30, tol=1.6, WD=(), splits=True):
    cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2; vert = r.height > r.width
    best = None
    for i, s in enumerate(S):
        o = ori(s)
        if vert and o == "v" and min(s[1], s[3]) - 5 < cy < max(s[1], s[3]) + 5: d = abs(s[0] - cx)
        elif not vert and o == "h" and min(s[0], s[2]) - 5 < cx < max(s[0], s[2]) + 5: d = abs(s[1] - cy)
        else: continue
        if d < 25 and (best is None or d < best[0]): best = (d, i)
    if not best:   # (a label overhanging its pipe's end: the pipe under any part of it)
        for i, s in enumerate(S):
            o = ori(s)
            if vert and o == "v" and min(s[1], s[3]) < r.y1 and max(s[1], s[3]) > r.y0: d = abs(s[0] - cx)
            elif not vert and o == "h" and min(s[0], s[2]) < r.x1 and max(s[0], s[2]) > r.x0: d = abs(s[1] - cy)
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
    def bown(j0, at, main):
        """the line number on a branch: the first line label beside the strokes leading off from stroke j0 (up to 30 of
        them); with none, "" for a real run of pipe (reaching 80 pt or more from the tee, at) or None for something close
        by (an instrument tapping, a valve's actuator, a vent)"""
        # (never back along the main line itself: a pipe drawn twice over has a second copy the walk could follow)
        mo = "h" if abs(main[1] - main[3]) < .5 else "v" if abs(main[0] - main[2]) < .5 else "d"
        onmain = lambda t: ori(t) == mo and (abs(t[1] - main[1]) < tol if mo == "h" else abs(t[0] - main[0]) < tol if mo == "v" else False)
        if onmain(S[j0]): return "x"
        q, got, run = [j0], {j0}, 0
        while q and len(got) < 31:
            j = q.pop(0); ow = owner(S[j]); run = max(run, *(math.hypot(e[0] - at[0], e[1] - at[1]) for e in ends(S[j])))
            if ow: return ow
            # (a drain or vent: "TO GRADE", "TO DRAIN", "VENT TO ATM" at its end, not the line going two ways)
            if any(abs(e[0] - (w.x0 + w.x1) / 2) < 25 and abs(e[1] - (w.y0 + w.y1) / 2) < 25 for e in ends(S[j]) for w in WD): return None
            for k2, t in enumerate(S):
                if k2 not in got and k2 not in seen and not onmain(t) and any(near(e, f) for e in ends(S[j]) for f in ends(t)): got.add(k2); q.append(k2)
        return "" if run >= 80 else None
    split = lambda b: splits and (b == "" or b == label)   # (the same line going two ways; splits=False: on past every branch, tools/link_pipes.py)
    for start in ends(S[best[1]]):   # each way from the label: a chain of points
        pts = [start]; i, pt = best[1], start
        while True:
            s = S[i]; o = ori(s)
            cand = [j for j, t in enumerate(S) if j not in seen and any(near(pt, e) for e in ends(t))]
            straight = [j for j in cand if ori(S[j]) == o]
            nxt = straight or (cand if len(cand) == 1 else [])
            # (a corner with a long run one way and only short stubs the others, a vent or a tapping: on along the run)
            if not nxt and len(cand) > 1:
                bo = [(j, bown(j, pt, s)) for j in cand]; runs = [j for j, b in bo if b == "" or b == label]
                if len(runs) == 1 and all(b is None for j, b in bo if j != runs[0]): nxt = runs
            # a split with no new line number on the branch (the same line going two ways): the line ends at the tee
            if straight and len(cand) > len(straight) and any(split(bown(j, pt, s)) for j in cand if j not in straight): why.append(("t", "")); break
            if not nxt and o in "hv":
                mx, my = (s[0] + s[2]) / 2, (s[1] + s[3]) / 2
                for j, t in enumerate(S):
                    if j in seen or ori(t) != o: continue
                    for e in ends(t):
                        if o == "h" and abs(e[1] - pt[1]) < tol and 0 < abs(e[0] - pt[0]) < gap and (e[0] - pt[0]) * (pt[0] - mx) > 0: nxt = [j]; break
                        if o == "v" and abs(e[0] - pt[0]) < tol and 0 < abs(e[1] - pt[1]) < gap and (e[1] - pt[1]) * (pt[1] - my) > 0: nxt = [j]; break
                    if nxt: break
            if not nxt and not cand and o in "hv":   # (a corner drawn a little short: a square run starting within 7 pt)
                near7 = [j for j, t in enumerate(S) if j not in seen and ori(t) in "hv" and ori(t) != o and L(t) > 20 and min(math.hypot(e[0] - pt[0], e[1] - pt[1]) for e in ends(t)) < 7]
                if len(near7) == 1: nxt = near7
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
                if math.hypot(a[0] + u * (b[0] - a[0]) - e[0], a[1] + u * (b[1] - a[1]) - e[1]) < tol: tees.append((Lc[i] + u * sl, bown(j, e, (a[0], a[1], b[0], b[1]))))
    why = (why + [("s", ""), ("s", "")])[:2]
    # the same line splitting part way along a stroke (a branch with no new number): cut there, keeping the side with the label
    cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2; dL, bd = 0, None
    for i, (a, b) in enumerate(zip(path, path[1:])):
        sl = Lc[i + 1] - Lc[i]; u = 0 if sl < 1e-6 else max(0, min(1, ((cx - a[0]) * (b[0] - a[0]) + (cy - a[1]) * (b[1] - a[1])) / sl / sl))
        dd = math.hypot(a[0] + u * (b[0] - a[0]) - cx, a[1] + u * (b[1] - a[1]) - cy)
        if bd is None or dd < bd: bd, dL = dd, Lc[i] + u * sl
    cuts = [d for d, o in tees if split(o)]
    lo = max([d for d in cuts if d < dL - 1], default=0); hi = min([d for d in cuts if d > dL + 1], default=Lc[-1])
    if lo > 0 or hi < Lc[-1]:
        def at(d):
            for i in range(1, len(Lc)):
                if Lc[i] >= d or i == len(Lc) - 1:
                    u = (d - Lc[i - 1]) / ((Lc[i] - Lc[i - 1]) or 1); return (path[i - 1][0] + u * (path[i][0] - path[i - 1][0]), path[i - 1][1] + u * (path[i][1] - path[i - 1][1]))
        path = [at(lo)] + [p for p, d in zip(path, Lc) if lo < d < hi] + [at(hi)]
        tees = [(d - lo, o) for d, o in tees if lo + 1 < d < hi - 1]
        if lo > 0: why[0] = ("t", "")
        if hi < Lc[-1]: why[1] = ("t", "")
        Lc = [0]
        for a, b in zip(path, path[1:]): Lc.append(Lc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    return path, why, [(d, o or "") for d, o in tees if o != "x"], Lc

def leader(rr, THIN, S, pad=None):
    """a label's leader: a fine line from the label's end (within 6 pt of its box), followed through its corners to its
    tip, and the pipe stroke the tip lands on (within 5 pt): a small box there, the way the pipe runs, to trace from"""
    if pad is None: return leader(rr, THIN, S, 6) or leader(rr, THIN, S, 14)   # (close to the label first; a leader started a little off it after)
    box = pymupdf.Rect(rr.x0 - pad, rr.y0 - 6, rr.x1 + pad, rr.y1 + 6); inner = pymupdf.Rect(rr.x0 + 1, rr.y0 + 1, rr.x1 - 1, rr.y1 - 1)
    E = lambda t: [(t[0], t[1]), (t[2], t[3])]
    for t in THIN:
        for a, b in (E(t), E(t)[::-1]):
            if not box.contains(pymupdf.Point(*a)) or box.contains(pymupdf.Point(*b)) or inner.contains(pymupdf.Point(*b)): continue
            pts, used, tip = [a, b], {t}, b
            for _ in range(4):   # (on round up to four corners)
                nx = [u for u in THIN if u not in used and any(math.hypot(e[0] - tip[0], e[1] - tip[1]) < 1.5 for e in E(u))]
                if len(nx) != 1: break
                u = nx[0]; used.add(u); tip = max(E(u), key=lambda e: math.hypot(e[0] - tip[0], e[1] - tip[1])); pts.append(tip)
            if math.hypot(tip[0] - a[0], tip[1] - a[1]) < 12: continue
            best = None; pv = pts[-2]; ll = math.hypot(tip[0] - pv[0], tip[1] - pv[1]) or 1; ux, uy = (tip[0] - pv[0]) / ll, (tip[1] - pv[1]) / ll
            for s in S:
                o = ori(s)
                for st in range(0, 13, 2):   # (on past the tip up to 12 pt: an arrowhead drawn short of the pipe)
                    tx, ty = tip[0] + ux * st, tip[1] + uy * st
                    if o == "v" and min(s[1], s[3]) - 1 < ty < max(s[1], s[3]) + 1: d, q = abs(s[0] - tx), (s[0], ty)
                    elif o == "h" and min(s[0], s[2]) - 1 < tx < max(s[0], s[2]) + 1: d, q = abs(s[1] - ty), (tx, s[1])
                    else: continue
                    if d < 2.5 and (best is None or st + d < best[0]): best = (st + d, q, o)
            if best:
                (x, y), o = best[1], best[2]
                return pymupdf.Rect(x - 1, y - 6, x + 1, y + 6) if o == "v" else pymupdf.Rect(x - 6, y - 1, x + 6, y + 1)
    return None

def seglen(P):
    return [0] + list(__import__("itertools").accumulate(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(P, P[1:])))
def point_at(P, d):
    Lc = seglen(P)
    for i in range(1, len(Lc)):
        if Lc[i] >= d or i == len(Lc) - 1:
            u = (d - Lc[i - 1]) / ((Lc[i] - Lc[i - 1]) or 1); return (P[i - 1][0] + u * (P[i][0] - P[i - 1][0]), P[i - 1][1] + u * (P[i][1] - P[i - 1][1]))
def on(q, Q, tol=1.2):
    for a, b in zip(Q, Q[1:]):
        sl = math.hypot(b[0] - a[0], b[1] - a[1]); u = 0 if sl < 1e-6 else max(0, min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / sl / sl))
        if math.hypot(a[0] + u * (b[0] - a[0]) - q[0], a[1] + u * (b[1] - a[1]) - q[1]) < tol: return True
    return False
def shared(P, Q):
    """how far from its start the path P runs along the path Q (in 2 pt steps)"""
    tot = seglen(P)[-1]; d = 0
    while d <= tot and on(point_at(P, d), Q): d += 2
    return max(0, min(tot, d - 2))
def cut(P, d):
    """the path P without its first d"""
    Lc = seglen(P); return [point_at(P, d)] + [p for p, x in zip(P, Lc) if x > d + .5]

def build(num):
    v = IX[num]; doc = pymupdf.open(os.path.join(R, v["file"])); refs = REFS.get(num, [])
    out = {}; rb = {}; pages = {}; FINE = {}; WORDS = {}; marks = {}; fl = {}; ptp = {}; teep = {}; rv = {}; TRC = {}
    for k, r in enumerate(refs):
        if r[6] != "line": continue
        pg = r[0] - 1
        if pg not in pages:
            p = doc[pg]
            LBL = [(w[4], pymupdf.Rect(w[:4])) for w in p.get_text("words") if LINE.fullmatch(w[4])]
            THIN = [(it[1].x, it[1].y, it[2].x, it[2].y) for d in drawings(p) if not pale(d.get("color")) for it in d["items"] if it[0] == "l" and math.hypot(it[2].x - it[1].x, it[2].y - it[1].y) >= 3]
            WORDS[pg] = p.get_text("words")
            pages[pg] = (p, strokes(p), LBL, arrows(p), [pymupdf.Rect(w[:4]) for w in p.get_text("words") if DRAIN.search(w[4])], THIN)
        if not pages[pg]: continue
        p, S, LBL, AR, WD, THIN = pages[pg]; W, H = p.rect.width, p.rect.height
        rr = pymupdf.Rect(r[1] * W / 1e4, r[2] * H / 1e4, (r[1] + r[3]) * W / 1e4, (r[2] + r[4]) * H / 1e4)
        label = str(r[5]).split("|")[0]
        # (the label where the sheet's own text has it: a box fitted to part of it, one character, misreads which way it runs)
        tw = [q for t, q in LBL if t == label and math.hypot((q.x0 + q.x1 - rr.x0 - rr.x1) / 2, (q.y0 + q.y1 - rr.y0 - rr.y1) / 2) < 120]
        if tw: rr = min(tw, key=lambda q: math.hypot((q.x0 + q.x1 - rr.x0 - rr.x1) / 2, (q.y0 + q.y1 - rr.y0 - rr.y1) / 2))
        # (turned text the sheet reports as a speck, its first character only: the label laid out upward from there, as
        # long as its characters at this sheet's usual lettering)
        cw = sorted(q.width / len(t) for t, q in LBL if q.width > q.height * 2)
        if cw and max(rr.width, rr.height) < len(label) * cw[len(cw) // 2] * .4:
            Lx = len(label) * cw[len(cw) // 2]; rr = pymupdf.Rect(rr.x0, rr.y1 - Lx, rr.x1, rr.y1)
        T = trace(S, LBL, rr, label, WD=WD)
        if not T or len(T[0]) < 2:   # (a label off to one side, a leader drawn from it to its pipe, an arrow at the tip)
            seed = leader(rr, THIN, S)
            if seed: T = trace(S, LBL, seed, label, WD=WD)
        if not T or len(T[0]) < 2:   # (a sheet with two pens for pipe, new lines finer than the old: with the fine pen too)
            if pg not in FINE: FINE[pg] = strokes(p, -1)
            T = trace(FINE[pg], LBL, rr, label, WD=WD)
            if not T or len(T[0]) < 2:
                seed = leader(rr, THIN, FINE[pg])
                if seed: T = trace(FINE[pg], LBL, seed, label, WD=WD)
        if not T or len(T[0]) < 2:   # ("A TO B" beside one drawn pipe, a range of lines drawn once: the pipe B's number sits by)
            vert = rr.height > rr.width; TOs = [pymupdf.Rect(w[:4]) for w in WORDS[pg] if w[4] == "TO"]
            near = lambda q, g: (abs((q.x0 + q.x1 - rr.x0 - rr.x1) / 2) < g and min(q.y1, rr.y1) - max(q.y0, rr.y0) > -4) if vert else (abs((q.y0 + q.y1 - rr.y0 - rr.y1) / 2) < g and min(q.x1, rr.x1) - max(q.x0, rr.x0) > -4)
            span = lambda q: (min(q.y1, rr.y1) - max(q.y0, rr.y0)) / (rr.height or 1) if vert else (min(q.x1, rr.x1) - max(q.x0, rr.x0)) / (rr.width or 1)
            tight = [t for t, q in LBL if t != label and near(q, 26) and span(q) > .8]   # (the TO printed but not in the sheet's text)
            if any(near(q, 22) for q in TOs) or tight:
                for t2, q2 in sorted(((t, q) for t, q in LBL if t != label and near(q, 40)), key=lambda tq: abs((tq[1].x0 + tq[1].x1 - rr.x0 - rr.x1) if vert else (tq[1].y0 + tq[1].y1 - rr.y0 - rr.y1))):
                    T = trace(S, LBL, q2, t2, WD=WD) or trace(FINE.setdefault(pg, strokes(p, -1)), LBL, q2, t2, WD=WD)
                    if T and len(T[0]) >= 2: break
        if not T or len(T[0]) < 2: continue
        P, why, tees, Lc = list(T[0]), list(T[1]), list(T[2]), list(T[3])
        # (an end run on into an instrument's bubble, its tapping drawn on from the pipe: cut back to the bubble's edge)
        for q in refs:
            if q[0] != r[0] or q[6] != "ins": continue
            bx = pymupdf.Rect(q[1] * W / 1e4 - 2, q[2] * H / 1e4 - 2, (q[1] + q[3]) * W / 1e4 + 2, (q[2] + q[4]) * H / 1e4 + 2)
            for end in (0, 1):
                Q = P if end == 0 else P[::-1]
                if not bx.contains(pymupdf.Point(*Q[0])): continue
                i = 0
                while i < len(Q) - 1 and bx.contains(pymupdf.Point(*Q[i + 1])): i += 1
                if i >= len(Q) - 1: continue
                a, b = Q[i], Q[i + 1]; lo, hi = 0.0, 1.0   # (where the run leaves the box: halving the step)
                for _ in range(20):
                    m = (lo + hi) / 2; pm_ = (a[0] + m * (b[0] - a[0]), a[1] + m * (b[1] - a[1]))
                    if bx.contains(pymupdf.Point(*pm_)): lo = m
                    else: hi = m
                Q2 = [(a[0] + hi * (b[0] - a[0]), a[1] + hi * (b[1] - a[1]))] + Q[i + 1:]
                if seglen(Q2)[-1] < 20: continue
                cutl = seglen(Q)[-1] - seglen(Q2)[-1]; tot0 = Lc[-1]
                P = Q2 if end == 0 else Q2[::-1]
                tees = [((d - cutl) if end == 0 else d, o) for d, o in tees if (d > cutl + 1 if end == 0 else d < tot0 - cutl - 1)]
                why[end] = ("s", ""); Lc = seglen(P)
        TRC[k] = [r, label, rr, P, why, tees, Lc, pg]
    # a stretch of pipe two traces both ran along (one ran on past a spec break unseen) belongs to the line whose number is
    # nearer to it: the other trace is cut back to where the stretch begins, ending there at the next line
    for k, A in TRC.items():
        for end in (0, 1):
            P = A[3] if end == 0 else A[3][::-1]
            for j, B in TRC.items():
                if j == k or B[7] != A[7]: continue
                run = shared(P, B[3])
                if run < 6: continue
                mid = point_at(P, run / 2); dA = math.hypot(mid[0] - (A[2].x0 + A[2].x1) / 2, mid[1] - (A[2].y0 + A[2].y1) / 2)
                dB = math.hypot(mid[0] - (B[2].x0 + B[2].x1) / 2, mid[1] - (B[2].y0 + B[2].y1) / 2)
                if dB >= dA: continue
                tot0 = A[6][-1]; P2 = cut(P, run)
                if len(P2) < 2: break
                A[3] = P2 if end == 0 else P2[::-1]; A[4][end] = ("l", B[1])
                A[5] = [((d - run) if end == 0 else d, o) for d, o in A[5] if (d > run + 1 if end == 0 else d < tot0 - run - 1)]
                A[6] = [0]
                for a, b in zip(A[3], A[3][1:]): A[6].append(A[6][-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
                break
    for k, (r, label, rr, P, why, tees, Lc, pg) in TRC.items():
        p, S, LBL, AR, WD, _ = pages[pg]; W, H = p.rect.width, p.rect.height; tot = Lc[-1] or 1
        # upstream first: the path turned round when the flow arrows on it point back along it
        fw = flow(P, AR)
        if fw < 0: P = P[::-1]; why = why[::-1]; tees = [(tot - d, o) for d, o in tees]; Lc = [tot - x for x in reversed(Lc)]
        if fw: fl[str(k)] = 1
        out[str(k)] = [[round(x / W * 1e4), round(y / H * 1e4)] for x, y in P]
        # what the line passes (commentary along the phone's Line slider): [fraction along, kind, text]
        # kinds: t tee, v valve, p special item (SP), i instrument, e equipment, r ribbon (set below), l the next line, s the line's end
        M = [[round(d / tot, 3), "t", o] for d, o in tees]
        def at(d):
            for i in range(1, len(Lc)):
                if Lc[i] >= d or i == len(Lc) - 1:
                    u = (d - Lc[i - 1]) / ((Lc[i] - Lc[i - 1]) or 1); return (P[i - 1][0] + u * (P[i][0] - P[i - 1][0]), P[i - 1][1] + u * (P[i][1] - P[i - 1][1]))
        ptp[str(k)] = (r[0], P); teep[str(k)] = [(m, at(d)) for m, (d, o) in zip(M, tees)]
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
            lim = {"mel": 60, "mv": 36, "cv": 36, "spi": 24, "ins": 42}[q[6]]
            if bd and bd[0] < lim and 0 <= bd[1] <= 1: M.append([round(bd[1], 3), {"mel": "e", "mv": "v", "cv": "v", "spi": "p", "ins": "i"}[q[6]], str(q[5]).split("|")[0]])
        marks[str(k)] = M
    # each tee named by the line that leaves it: the traced line whose end is at the tee (within 4 pt)
    for k, T in teep.items():
        for m, (tx, ty) in T:
            best = None
            for j, (pg, Q) in ptp.items():
                if j == k or pg != ptp[k][0]: continue
                for e in (Q[0], Q[-1]):
                    dd = math.hypot(e[0] - tx, e[1] - ty)
                    if dd < 4 and (best is None or dd < best[0]): best = (dd, j)
            if best: m[2] = str(refs[int(best[1])][5]).split("|")[0]
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
            # (which way the flow goes there, from the way the ribbon points: towards the line, it comes in from the other
            # sheet, that end upstream; away from it, it leaves)
            sh = r[8][4] if len(r) > 8 and isinstance(r[8], list) and len(r[8]) > 4 else ""
            if "R" in sh or "L" in sh:
                e = P[0] if f == 0 else P[-1]; side = 1 if r[1] + r[3] / 2 > e[0] else -1; pts = 1 if "R" in sh else -1
                rv.setdefault(bestd[1], []).append(f if pts == -side else 1 - f)   # (the end that is upstream)
    # flow for the lines the arrows didn't settle: by their ribbons, then carried on from a line joined end to end (a spec
    # break) whose flow is known; the path turned round so it runs upstream to downstream
    def turn(k):
        out[k] = out[k][::-1]; marks[k] = [[round(1 - m[0], 3)] + m[1:] for m in marks[k]]
    for k, v in rv.items():
        if k in fl or not v: continue
        if all(x == v[0] for x in v):
            if v[0] == 1: turn(k)
            fl[k] = 1
    W0, H0 = (doc[0].rect.width, doc[0].rect.height)
    near = lambda a, b: math.hypot((a[0] - b[0]) * W0 / 1e4, (a[1] - b[1]) * H0 / 1e4) < 4
    for _ in range(6):
        grew = False
        for k in [k for k in out if k not in fl]:
            for j in list(fl):
                if j == k or refs[int(j)][0] != refs[int(k)][0]: continue
                Q, P = out[j], out[k]
                if near(Q[-1], P[0]) or near(Q[0], P[-1]): fl[k] = 1; grew = True; break
                if near(Q[-1], P[-1]) or near(Q[0], P[0]): turn(k); fl[k] = 1; grew = True; break
        if not grew: break
    # a ribbon whose line carries on unnumbered on this sheet (the number printed only on the sheet before): that pipe
    # traced from the ribbon to the next numbered line, kept as "r<ribbon>" (the app traces it under the number it came
    # with), flowing away from the ribbon when the ribbon points into the sheet
    for j, r in enumerate(refs):
        if r[6] != "d" or str(j) in rb: continue
        pg = r[0] - 1
        if pg not in pages or not pages[pg]: continue
        p, S, LBL, AR, WD, _ = pages[pg]; W, H = p.rect.width, p.rect.height
        bb = r[8] if len(r) > 8 and isinstance(r[8], list) else r[1:5]
        bx = pymupdf.Rect(bb[0] * W / 1e4, bb[1] * H / 1e4, (bb[0] + bb[2]) * W / 1e4, (bb[1] + bb[3]) * H / 1e4)
        seed = None
        for t in S:
            if ori(t) != "h" or L(t) < 15: continue
            for e, o in (((t[0], t[1]), (t[2], t[3])), ((t[2], t[3]), (t[0], t[1]))):
                if bx.y0 - 1 < e[1] < bx.y1 + 1 and (abs(e[0] - bx.x0) < 6 or abs(e[0] - bx.x1) < 6) and not (bx.x0 + 2 < o[0] < bx.x1 - 2):
                    seed = (e, o); break
            if seed: break
        if not seed: continue
        (ex, ey), (ox, oy) = seed; mx = ex + (8 if ox > ex else -8)
        T = trace(S, LBL, pymupdf.Rect(mx - 2, ey - 1, mx + 2, ey + 1), "", WD=WD)
        if not T or len(T[0]) < 2: continue
        P = [q for q in T[0] if not (bx.x0 + 3 < q[0] < bx.x1 - 3 and bx.y0 + 1 < q[1] < bx.y1 - 1)]   # (not round the ribbon's outline)
        if len(P) < 2: continue
        flip = math.hypot(P[-1][0] - ex, P[-1][1] - ey) < math.hypot(P[0][0] - ex, P[0][1] - ey)
        if flip: P = P[::-1]   # (from the ribbon)
        Lc = seglen(P); tot = Lc[-1] or 1; t0 = T[3][-1] or 1
        if tot < 20: continue
        M = [[0, "r", str(r[5]).split("|")[0]]] + [[round(min(1, max(0, (t0 - d if flip else d) / tot)), 3), "t", o] for d, o in T[2]]
        if T[1][1][0] == "l" or T[1][0][0] == "l": M.append([1, "l", (T[1][1] if T[1][1][0] == "l" else T[1][0])[1]])
        for q in refs:
            if q[0] != r[0] or q[6] not in ("mv", "cv", "ins", "spi", "mel"): continue
            cx, cy = (q[1] + q[3] / 2) * W / 1e4, (q[2] + q[4] / 2) * H / 1e4; bd = None
            for i, (a, b) in enumerate(zip(P, P[1:])):
                sl = Lc[i + 1] - Lc[i]; u = 0 if sl < 1e-6 else max(0, min(1, ((cx - a[0]) * (b[0] - a[0]) + (cy - a[1]) * (b[1] - a[1])) / sl / sl))
                dd = math.hypot(a[0] + u * (b[0] - a[0]) - cx, a[1] + u * (b[1] - a[1]) - cy)
                if bd is None or dd < bd[0]: bd = (dd, (Lc[i] + u * sl) / tot)
            lim = {"mel": 60, "mv": 36, "cv": 36, "spi": 24, "ins": 42}[q[6]]
            if bd and bd[0] < lim and 0 <= bd[1] <= 1: M.append([round(bd[1], 3), {"mel": "e", "mv": "v", "cv": "v", "spi": "p", "ins": "i"}[q[6]], str(q[5]).split("|")[0]])
        key = "r" + str(j); out[key] = [[round(x / W * 1e4), round(y / H * 1e4)] for x, y in P]; marks[key] = M; rb[str(j)] = key
        sh = r[8][4] if len(r) > 8 and isinstance(r[8], list) and len(r[8]) > 4 else ""
        if "R" in sh or "L" in sh:
            side = 1 if (bx.x0 + bx.x1) / 2 > ex else -1; pts = 1 if "R" in sh else -1
            if pts == -side: fl[key] = 1   # (points into the sheet: the flow comes from the ribbon, as the path runs)
            else: turn(key); fl[key] = 1
    if out: out["rb"] = rb; out["m"] = {k: sorted(v) for k, v in marks.items()}; out["fl"] = fl
    json.dump(out, open(os.path.join(OUT, num + ".json"), "w"), separators=(",", ":"))
    return sum(1 for r in refs if r[6] == "line"), sum(1 for k in out if k.isdigit()), len(rb), sum(1 for k in fl if k.isdigit())

if __name__ == "__main__":
    nums = sys.argv[1:] or sorted(k for k in IX if "-PID-" in k)
    tot = [0, 0, 0, 0]
    for n in nums:
        try: a = build(n)
        except Exception as e: print("skip", n, e); continue
        tot = [x + y for x, y in zip(tot, a)]
    print(f"{len(nums)} P&IDs: {tot[1]} of {tot[0]} line numbers traced ({tot[3]} with their flow direction from arrows, ribbons or the line they join); {tot[2]} ribbons matched to a line")

    # (the offline list holds each file's fingerprint: rebuilt, so phones and browsers that kept the old paths fetch the new ones)
    import subprocess; subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_offline.py")], cwd=R, check=False)
