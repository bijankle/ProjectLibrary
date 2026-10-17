"""Process pipes with no line number, after tools/build_line_paths.py (and fix_line_breaks.py), before link_lines.py.

Slurry and other mechanical pipework is labelled by size and spec, not numbered (1200-MECH-CERAMIC from a hopper to its
pump, 1050-MECH-CERAMIC on to the cyclones). The numbered lines run into these, and the trace stopped dead there. Each
one is traced like a line (build_line_paths.trace, from its label) and kept in lines/<sheet>.json as "u<n>":
  "u<n>": [[x, y], …]   its path, upstream first when the flow is known ("fl")
  "lb": {"u<n>": label}, "ub": {"u<n>": [page, x, y, w, h]}   its label and where it sits (the app traces it under that name)
  "m": {"u<n>": […]}    what it passes, as for a numbered line

Which way it flows, by simple physics where no arrow on it says:
  out of a vessel at its bottom half (a hopper's outlet), into a vessel at its top half (a feed);
  into a pump on the larger bore (the suction), out of it on the smaller (the discharge);
  away from where a numbered line of known flow ends on its end, towards where one starts.
"""
import glob, json, math, os, re, sys
import numpy as np, pymupdf
from scipy import ndimage

R = sys.argv[1] if len(sys.argv) > 1 else "."
sys.path.insert(0, os.path.join(R, "tools"))
import build_line_paths as B

REFS = json.load(open(os.path.join(R, "pid-refs.json"))); IX = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
LISTED = {str(r[0]) for r in json.load(open(os.path.join(R, "search-data.json")))["data"].get("line", [])}
PIPE = re.compile(r"^(\d{2,4})(?:x\d{2,4})?-MECH-[A-Z0-9.]{2,10}$")


def bore(lbl):
    m = PIPE.match(lbl)
    if m: return int(m.group(1))
    p = str(lbl).split("|")[0].split("-")
    return next((int(x) for x in p[4:5] if x.isdigit()), 0)


def run(path):
    num = os.path.basename(path)[:-5]
    if num not in IX: return 0
    D = json.load(open(path)); refs = REFS.get(num, [])
    isu = lambda k: re.fullmatch(r"u\d+", k)
    for k in [k for k in D if isu(k)]: del D[k]
    D.pop("ub", None); D.pop("pj", None); D.pop("uk", None)
    for g in ("lb", "m", "fl"):
        if g in D: D[g] = {k: v for k, v in D[g].items() if not isu(k)}
    doc = pymupdf.open(os.path.join(R, IX[num]["file"])); n = 0
    for pn in range(len(doc)):
        p = doc[pn]
        words = p.get_text("words"); mech = [(w[4], pymupdf.Rect(w[:4])) for w in words if PIPE.match(w[4])]
        # (and line numbers printed on the sheet that its tappable refs missed: in the line list or not, traced the same)
        have = {str(q[5]).split("|")[0] for q in refs if q[6] == "line" and q[0] == pn + 1}
        lone = [(w[4], pymupdf.Rect(w[:4])) for w in words if B.LINE.fullmatch(w[4]) and w[4] not in have]
        if not mech and not lone: continue
        W, H = p.rect.width, p.rect.height
        S = B.strokes(p); AR = B.arrows(p)
        LBL = [(w[4], pymupdf.Rect(w[:4])) for w in words if B.LINE.fullmatch(w[4])] + mech
        WD = [pymupdf.Rect(w[:4]) for w in words if B.DRAIN.search(w[4])]
        sc = lambda q: (q[0] * W / 1e4, q[1] * H / 1e4)
        known = {k: [sc(q) for q in v] for k, v in D.items() if k.isdigit() and int(k) < len(refs) and refs[int(k)][0] == pn + 1}
        # the sheet as a picture, for the vessels (closed white patches) and where on them a pipe joins
        pm = p.get_pixmap(matrix=pymupdf.Matrix(1, 1), colorspace=pymupdf.csGRAY)
        img = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width); dark = ndimage.binary_dilation(img < 170)
        lab, nl = ndimage.label(~dark); area = np.bincount(lab.ravel()); objs = ndimage.find_objects(lab)
        def vessel(P, e):
            """where the end e of P meets a vessel: 'bot' (its lower half), 'top', or None"""
            b = P[-1] if e else P[0]; a = next((q for q in (P[::-1] if e else P)[1:] if math.dist(q, b) > 3), None)
            if a is None: return None
            ux, uy = b[0] - a[0], b[1] - a[1]; L = math.hypot(ux, uy); ux, uy = ux / L, uy / L; hit = False
            for t in range(1, 26):
                x, y = int(b[0] + ux * t), int(b[1] + uy * t)
                if not (0 <= x < pm.width and 0 <= y < pm.height): return None
                if dark[y, x]: hit = True; continue
                c = lab[y, x]
                if 250 < area[c] < pm.width * pm.height * .02 and (hit or t > 3):
                    sl = objs[c - 1]; y0, y1 = sl[0].start, sl[0].stop
                    return "bot" if b[1] > y0 + .55 * (y1 - y0) else "top" if b[1] < y0 + .45 * (y1 - y0) else None
                if hit: return None
            return None
        pumps = [pymupdf.Rect(q[1] * W / 1e4, q[2] * H / 1e4, (q[1] + q[3]) * W / 1e4, (q[2] + q[4]) * H / 1e4) for q in refs
                 if q[0] == pn + 1 and q[6] == "mel" and re.search(r"-PP-|-PU-", str(q[5]))]
        def pump(pt):
            for i, r in enumerate(pumps):
                rr = pymupdf.Rect(r.x0 - 45, r.y0 - 70, r.x1 + 45, r.y1 + 10)   # (the symbol sits above its tag)
                if rr.contains(pymupdf.Point(*pt)): return i
            return None
        U = {}
        THIN = [(it[1].x, it[1].y, it[2].x, it[2].y) for d in B.drawings(p) if not B.pale(d.get("color")) for it in d["items"] if it[0] == "l" and math.hypot(it[2].x - it[1].x, it[2].y - it[1].y) >= 3]
        FINE = None
        for lbl, rr in mech + lone:
            num_ = not PIPE.match(lbl)
            T = B.trace(S, LBL, rr, lbl, WD=WD, splits=num_)
            if num_ and (not T or len(T[0]) < 2):   # (as a numbered line: a leader, then the fine pens)
                sd = B.leader(rr, THIN, S); T = sd and B.trace(S, LBL, sd, lbl, WD=WD)
                if not T or len(T[0]) < 2:
                    FINE = FINE or B.strokes(p, -1); T = B.trace(FINE, LBL, rr, lbl, WD=WD)
            if not T or len(T[0]) < 2 or T[3][-1] < 25: continue
            P = list(T[0])
            # (an end run on along a numbered line's pipe, round a corner into it: cut back to where it meets it)
            for end in (0, 1):
                Q = P if end == 0 else P[::-1]
                run = max([B.shared(Q, K) for K in known.values()] or [0])
                if 6 < run < B.seglen(Q)[-1] - 20: Q = B.cut(Q, run); P = Q if end == 0 else Q[::-1]
            T = (P, T[1], T[2], B.seglen(P))
            # (not a numbered line's own pipe, nor one already traced from the same label printed twice)
            if any(B.shared(P, Q) > .6 * T[3][-1] for Q in list(known.values()) + [u[0] for u in U.values()]): continue
            U["u" + str(len(U) + sum(1 for k in D if isu(k)))] = [P, lbl, rr, T]
        if not U: continue
        # which way each flows
        fl = {}
        for k, (P, lbl, rr, T) in U.items():
            v = B.flow(P, AR)
            if v: fl[k] = v; continue
            ves = [vessel(P, 0), vessel(P, 1)]
            if ves[0] == "bot" or ves[1] == "top": fl[k] = 1; continue
            if ves[1] == "bot" or ves[0] == "top": fl[k] = -1; continue
            # numbered lines of known flow at its ends: one ending there feeds it, one starting there takes from it
            for e in (0, 1):
                q = P[-1] if e else P[0]
                for j, Q in known.items():
                    if j not in D.get("fl", {}): continue
                    if math.dist(Q[-1], q) < 6: fl[k] = 1 if e == 0 else -1
                    elif math.dist(Q[0], q) < 6: fl[k] = -1 if e == 0 else 1
                if k in fl: break
            # (one end on the side of a line of any known flow, a branch off it: that end upstream; the other end free)
            if k not in fl:
                for e in (0, 1):
                    q = P[-1] if e else P[0]
                    if any(j in D.get("fl", {}) and min(math.dist(Q[0], q), math.dist(Q[-1], q)) > 6 and B.on(q, Q, 2.5) for j, Q in known.items()):
                        fl[k] = 1 if e == 0 else -1; break
        # at a pump: the larger bore is the suction (into it), the smaller the discharge
        at = {}
        for k, (P, lbl, rr, T) in U.items():
            for e in (0, 1):
                i = pump(P[-1] if e else P[0])
                if i is not None: at.setdefault(i, []).append((k, e, bore(lbl)))
        for j, Q in known.items():
            for e in (0, 1):
                i = pump(Q[-1] if e else Q[0])
                if i is not None and i in at: at[i].append((j, e, bore(refs[int(j)][5])))
        for i, L in at.items():
            if len(L) < 2: continue
            bs = sorted({b for _, _, b in L})
            if len(bs) < 2: continue
            for k, e, b in L:
                if not isu(k) or k in fl: continue
                into = b == bs[-1]   # (the suction runs into the pump: that end downstream)
                fl[k] = (1 if e == 1 else -1) if into else (1 if e == 0 else -1)
        # through each pump: what runs into it joins what runs out of it (kept as "pj", added to the joins by link_lines.py)
        for i, L in at.items():
            fwd = lambda k: fl.get(k, 0) if isu(k) else (1 if k in D.get("fl", {}) else 0)
            ins = [k for k, e, b in L if fwd(k) and e == (1 if fwd(k) > 0 else 0)]
            outs = [k for k, e, b in L if fwd(k) and e == (0 if fwd(k) > 0 else 1)]
            for a in ins:
                for b in outs:
                    if a != b and (isu(a) or isu(b)): D.setdefault("pj", []).append([int(a) if a.isdigit() else a, 1, int(b) if b.isdigit() else b, 0])
        for k, (P, lbl, rr, T) in U.items():
            Lc = T[3]; tot = Lc[-1] or 1; tees = T[2]
            if fl.get(k, 0) < 0: P = P[::-1]; tees = [(tot - d, o) for d, o in tees]
            D[k] = [[round(x / W * 1e4), round(y / H * 1e4)] for x, y in P]
            D.setdefault("lb", {})[k] = lbl
            if lbl in LISTED: D.setdefault("uk", {})[k] = 1   # (in the line list: its page can open)
            D.setdefault("ub", {})[k] = [pn + 1, round(rr.x0 / W * 1e4), round(rr.y0 / H * 1e4), round(rr.width / W * 1e4), round(rr.height / H * 1e4)]
            M = [[round(d / tot, 3), "t", o] for d, o in tees]
            for q in refs:
                if q[0] != pn + 1 or q[6] not in ("mv", "cv", "ins", "spi", "mel"): continue
                c = ((q[1] + q[3] / 2) * W / 1e4, (q[2] + q[4] / 2) * H / 1e4); Lq = B.seglen(P); bd = None
                for a, b2, l0, l1 in zip(P, P[1:], Lq, Lq[1:]):
                    sl = l1 - l0; u = 0 if sl < 1e-6 else max(0, min(1, ((c[0] - a[0]) * (b2[0] - a[0]) + (c[1] - a[1]) * (b2[1] - a[1])) / sl / sl))
                    dd = math.hypot(a[0] + u * (b2[0] - a[0]) - c[0], a[1] + u * (b2[1] - a[1]) - c[1])
                    if bd is None or dd < bd[0]: bd = (dd, (l0 + u * sl) / tot)
                lim = {"mel": 60, "mv": 36, "cv": 36, "spi": 24, "ins": 42}[q[6]]
                if bd and bd[0] < lim: M.append([round(bd[1], 3), {"mel": "e", "mv": "v", "cv": "v", "spi": "p", "ins": "i"}[q[6]], str(q[5]).split("|")[0]])
            D.setdefault("m", {})[k] = sorted(M)
            if k in fl: D.setdefault("fl", {})[k] = 1
            n += 1
    json.dump(D, open(path, "w"), separators=(",", ":"))
    return n


if __name__ == "__main__":
    t = 0
    for p in sorted(glob.glob(os.path.join(R, "lines", "*-PID-*.json"))):
        try: t += run(p)
        except Exception as e: print("skip", os.path.basename(p), e)
    print(t, "unnumbered process pipes traced")
