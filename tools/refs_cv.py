"""Fits the tappable boxes on a drawing to what is printed, and finds tags the text layer missed (computer vision).

Usage: python3 tools/refs_cv.py [<drawing number> ...] [--preview <folder>]       (after tools/build_pid_refs.py)
With no drawing given it does the checked sheets, tools/refs_checked.json (add one there once it has been checked).
Every P&ID and PFD sheet is in tools/refs_checked.json and fitted (Oct 2026). To redo them (after new drawings):
  1. put every P&ID / PFD sheet in tools/refs_checked.json, 2. python3 tools/build_pid_refs.py,
  3. CVDIR=<a folder kept between runs> python3 tools/refs_cv.py   (four sheets at a time, each kept as it finishes,
     so a run that stops carries on; about 40 sheets an hour). Every sheet in the list is fitted again from the fresh
     build, so run it over all of them, or the finished ones lose their fitting.
For each sheet of the drawing, rendered in grey at 288 dpi:
  1. Bubbles (instrument and valve circles) are found (Hough circles, checked for a drawn ring) and their insides are
     read on their own (Tesseract, letters and digits only, the ring and any divider blanked out), since the OCR of the
     whole sheet usually misses them. A bubble reading one or two characters off a tag the lists put on this drawing
     (and not found yet) becomes a new ref.
  2. Every ref then fits the print: inside a bubble, the bubble's circle; text with a drawn box tight around it (an
     equipment number), that box; otherwise the letters themselves (dark blobs of letter size whose centre is in the
     box; lines, symbols and neighbours left out).
The ref's 8th entry (after page, box, target, kind) says how it was fitted: "o" circle, "b" drawn box, "t" text;
continuation refs ("d") keep their way back there and are only hugged to their text. --preview writes before / after
images of the sheet to the folder and changes nothing.
On the fitted sheets, without fitting again (a few minutes for all, CVDIR as above; each change only adds to the fitting):
  python3 tools/refs_cv.py [<drawing number> ...] --boxes --ribbons [--preview <folder>]
  --boxes: a tag fitted to its letters ("t", or not fitted) printed alone in a drawn box looser than frame() takes (up
     to about one and a half letter heights round it, maybe with one short line more, e.g. SP over SP-005) gets that box
     ("b"). The box is looked for in the sheet's vector lines (a scanned sheet: frame(), loosened), and must show on the
     print and hold no other line, symbol or tag.
  --ribbons: a continuation ref gets the ribbon (flag) drawn round it as a 9th entry [l, t, w, h, shape, depth]: its
     outer box, then each end, "L" / "R" a point on the left / right, "l" / "r" a notch (swallow tail) there ("lR" a
     notched tail pointing right), "B" square, and the point's depth as a part of w. A continuation without a way back
     gets null as its 8th entry first. None where no ribbon was found (a reference in the notes).
"""
import json, os, re, subprocess, sys, tempfile
import numpy as np, pymupdf, cv2

ROOT = os.path.join(os.path.dirname(__file__), "..")
Z, INK = 4.0, 140
norm = lambda s: re.sub(r"[\s\-_/.]+", "", str(s or "").upper())

def lev(a, b, cap):
    if abs(len(a) - len(b)) > cap: return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1): cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
        if min(cur) > cap: return cap + 1
        prev = cur
    return prev[-1]

def own_items():
    db = json.load(open(os.path.join(ROOT, "search-data.json"))); out = {}
    for t, rows in db["data"].items():
        f = db["types"][t]["f"]; pi = [i for i, n in enumerate(f) if n in ("P&ID", "P&IDs")]
        for r in rows:
            for i in pi:
                if i < len(r) and r[i]:
                    for m in re.findall(r"2000-F\d\d-P[IF]D-PR-\d{5}", str(r[i])): out.setdefault(m, {}).setdefault(norm(r[0]), (r[0], t))
    return out

def circles(g):
    bl = cv2.medianBlur(g, 3)
    cs = cv2.HoughCircles(bl, cv2.HOUGH_GRADIENT, dp=1.2, minDist=90, param1=120, param2=45, minRadius=45, maxRadius=95)
    out = []
    for x, y, r in ([] if cs is None else np.round(cs[0]).astype(int)):
        ang = np.linspace(0, 2 * np.pi, 72, endpoint=False); dark = 0
        for a in ang:
            px, py = int(x + r * np.cos(a)), int(y + r * np.sin(a)); w = g[max(0, py - 3):py + 4, max(0, px - 3):px + 4]
            dark += bool(w.size) and w.min() < 120
        if dark >= 62: out.append((x, y, r))
    return out

def read_bubble(g, x, y, r, td):
    x0, y0 = max(0, x - int(r * .85)), max(0, y - int(r * .75)); crop = g[y0:y + int(r * .75), x0:x + int(r * .85)].copy()
    yy, xx = np.ogrid[:crop.shape[0], :crop.shape[1]]
    crop[(xx + x0 - x) ** 2 + (yy + y0 - y) ** 2 > (r * .86) ** 2] = 255
    inv = 255 - crop; hl = cv2.morphologyEx(inv, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, int(r * .9)), 1)))
    crop = np.clip(crop.astype(int) + hl, 0, 255).astype(np.uint8)
    crop = cv2.copyMakeBorder(cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC), 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
    p = os.path.join(td, "b.png"); cv2.imwrite(p, crop)
    t = subprocess.run(["tesseract", p, "-", "--psm", "6", "-c", "tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"], capture_output=True, text=True).stdout
    return [re.sub(r"[^A-Z0-9]", "", l) for l in t.splitlines() if l.strip()]

def comps(m):
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    return [(st[i, 1], st[i, 0], st[i, 1] + st[i, 3], st[i, 0] + st[i, 2], st[i, 4]) for i in range(1, n)]

def hug(g, box, want=None, td=None, whole=False):
    """the letters inside a text box: (x0, y0, x1, y1) or None"""
    x0, y0, x1, y1 = box; bw, bh = x1 - x0, y1 - y0
    vert = bh > bw * 1.6; s = bw if vert else bh
    if s < 4: return None
    mx, my = (s * .6, max(bh * .25, s * .6)) if vert else (max(bw * .25, s * .6), s * .6)
    X0, Y0, X1, Y1 = int(max(0, x0 - mx)), int(max(0, y0 - my)), int(min(g.shape[1], x1 + mx)), int(min(g.shape[0], y1 + my))
    if X1 - X0 < 3 or Y1 - Y0 < 3: return None
    # the blobs centred in the box; the letter height is the usual height among them (the box itself is often loose)
    inb = []
    for (a, b, c, d, n) in comps(g[Y0:Y1, X0:X1] < INK):
        cy, cx = Y0 + (a + c) / 2, X0 + (b + d) / 2; tol = s * .2
        if x0 - tol <= cx <= x1 + tol and y0 - tol <= cy <= y1 + tol:
            ch, cw = (d - b, c - a) if vert else (c - a, d - b); inb.append((ch, cw, (X0 + b, Y0 + a, X0 + d, Y0 + c)))
    hs = sorted(ch for ch, cw, _ in inb if s * .25 <= ch <= s * 1.2 and cw <= ch * 3)
    if not hs: return None
    lh = hs[len(hs) // 2]
    keep = [bb for ch, cw, bb in inb if lh * .45 <= ch <= lh * 1.4 and cw <= lh * 4.5]
    if not keep: return None
    # more than one line of text in the box (a loose OCR box over two lines): read each and keep the one that is the tag
    ax = 0 if vert else 1
    rows = []
    for bb in sorted(keep, key=lambda b: (b[ax] + b[ax + 2]) / 2):
        c0 = (bb[ax] + bb[ax + 2]) / 2
        if rows and abs(c0 - rows[-1][0]) < lh * .6: rows[-1][1].append(bb)
        else: rows.append([c0, [bb]])
    if len(rows) > 1 and not whole:
        def box_of(r): return (min(b[0] for b in r), min(b[1] for b in r), max(b[2] for b in r), max(b[3] for b in r))
        if want and td:
            def score(r):
                bx = box_of(r); crop = g[max(0, bx[1] - 4):bx[3] + 4, max(0, bx[0] - 4):bx[2] + 4]
                if vert: crop = cv2.rotate(crop, cv2.ROTATE_90_CLOCKWISE)
                p = os.path.join(td, "r.png"); cv2.imwrite(p, cv2.copyMakeBorder(crop, 15, 15, 15, 15, cv2.BORDER_CONSTANT, value=255))
                txt = norm(subprocess.run(["tesseract", p, "-", "--psm", "7"], capture_output=True, text=True).stdout)
                return lev(txt, norm(want), 99)
            keep = min((r[1] for r in rows), key=score)
        else: keep = max((r[1] for r in rows), key=lambda r: sum((b[2] - b[0]) if not vert else (b[3] - b[1]) for b in r))
    t = (min(k[0] for k in keep), min(k[1] for k in keep), max(k[2] for k in keep), max(k[3] for k in keep))
    if ((t[3] - t[1]) if vert else (t[2] - t[0])) < (bh if vert else bw) * .35: return None
    return t

def frame(g, t, gap=1.0, area=3.5):
    """a drawn rectangle closely around the letters t: its outline, or None"""
    x0, y0, x1, y1 = t; s = min(x1 - x0, y1 - y0); m = 2.6 * s
    X0, Y0, X1, Y1 = int(max(0, x0 - m)), int(max(0, y0 - m)), int(min(g.shape[1], x1 + m)), int(min(g.shape[0], y1 + m))
    best = None
    for (a, b, c, d, n) in comps(g[Y0:Y1, X0:X1] < INK):
        bx0, by0, bx1, by1 = X0 + b, Y0 + a, X0 + d, Y0 + c
        if not (bx0 <= x0 + 1 and by0 <= y0 + 1 and bx1 >= x1 - 1 and by1 >= y1 - 1): continue
        # the box is where its straight edge lines are (a pipe, leader or text touching it stretches the blob's outline)
        sub = g[by0:by1, bx0:bx1] < INK
        rows, cols = np.nonzero(sub.mean(1) >= .5)[0], np.nonzero(sub.mean(0) >= .5)[0]
        if len(rows) < 2 or len(cols) < 2: continue
        bx0, bx1, by0, by1 = bx0 + cols[0], bx0 + cols[-1] + 1, by0 + rows[0], by0 + rows[-1] + 1
        if not (bx0 <= x0 + 2 and by0 <= y0 + 2 and bx1 >= x1 - 2 and by1 >= y1 - 2): continue
        # close along the writing; across it there may be another line of the label (the SP over MC-001)
        if max(x0 - bx0, bx1 - x1) > gap * s or max(y0 - by0, by1 - y1) > (gap if gap < 1 else 2.4) * s: continue
        if area and (bx1 - bx0) * (by1 - by0) > area * (x1 - x0) * (y1 - y0): continue
        # a drawn box: all four sides solid straight lines (not a symbol or leader that happens to wrap the text)
        sub = g[by0:by1, bx0:bx1] < INK; e = max(2, int(s * .15))
        if min(sub[:e].any(0).mean(), sub[-e:].any(0).mean(), sub[:, :e].any(1).mean(), sub[:, -e:].any(1).mean()) < .9: continue
        ar = (bx1 - bx0) * (by1 - by0)
        if not best or ar < best[1]: best = ((bx0, by0, bx1, by1), ar)
    return best and best[0]

def vlines(page, k=Z):
    """the drawn straight lines of a vector sheet, in pixels at scale k: (horizontal [(y, x0, x1)], vertical [(x, y0, y1)],
    the outlines drawn in one stroke [[(x, y), ...]] (a ribbon, a box), the longer open strokes (an outline drawn in parts)),
    or None for a scanned sheet"""
    dr = page.get_drawings()
    if len(dr) < 200: return None
    m = page.rotation_matrix * pymupdf.Matrix(k, k); H, V, P, O = [], [], [], []
    for d in dr:
        if d.get("color") is None or d.get("width") == 0: continue   # only what is stroked (a white fill behind the text is no box)
        segs = []
        for it in d["items"]:
            if it[0] == "l": segs.append((it[1], it[2]))
            elif it[0] == "re": r = it[1]; segs += [(r.tl, r.tr), (r.tr, r.br), (r.br, r.bl), (r.bl, r.tl)]
            elif it[0] == "qu": q = it[1]; segs += [(q.ul, q.ur), (q.ur, q.lr), (q.lr, q.ll), (q.ll, q.ul)]
            else: segs.append(None)   # a curve: no straight outline through here (its straight bits still count)
        pcs = [[]]
        for s in segs:
            if s is None: pcs.append([]); continue
            a, b = s[0] * m, s[1] * m
            if abs(a.y - b.y) < .6 and abs(a.x - b.x) > 2: H.append(((a.y + b.y) / 2, min(a.x, b.x), max(a.x, b.x)))
            elif abs(a.x - b.x) < .6 and abs(a.y - b.y) > 2: V.append(((a.x + b.x) / 2, min(a.y, b.y), max(a.y, b.y)))
            if pcs[-1] and abs(pcs[-1][-1][0] - a.x) + abs(pcs[-1][-1][1] - a.y) > 1.5: pcs.append([])
            if not pcs[-1]: pcs[-1].append((a.x, a.y))
            pcs[-1].append((b.x, b.y))
        for j, pts in enumerate(pcs):
            if len(pts) < 2: continue
            shut = abs(pts[0][0] - pts[-1][0]) + abs(pts[0][1] - pts[-1][1]) < 1.5 or (d.get("closePath") and j == len(pcs) - 1)
            if shut and len(pts) >= 4: P.append(pts)
            elif not shut:   # an outline drawn in the same stroke as the line leading off it (a ribbon run straight into
                # its pipe): the closed loop inside the stroke counts as an outline too
                for i in range(len(pts)):
                    j = next((j for j in range(i + 4, len(pts)) if abs(pts[i][0] - pts[j][0]) + abs(pts[i][1] - pts[j][1]) < 1.5), None)
                    if j is not None: P.append(pts[i:j + 1]); break
            if not shut and max(max(p[0] for p in pts) - min(p[0] for p in pts), max(p[1] for p in pts) - min(p[1] for p in pts)) > 6 * k: O.append(pts)
    def merge(L):   # collinear pieces of one line (a box side drawn in parts) joined
        out = []
        for c, a, b in sorted(L):
            j = next((i for i in range(len(out) - 1, max(-1, len(out) - 40), -1) if abs(out[i][0] - c) < 1.5 and a <= out[i][2] + 2 and b >= out[i][1] - 2), None)
            if j is None: out.append([c, a, b])
            else: out[j][1], out[j][2] = min(out[j][1], a), max(out[j][2], b)
        return out
    return merge(H), merge(V), P, O

def drawn(g, pts, part=.85):
    """whether the outline through pts (closed) shows dark on the print (a white or hidden stroke does not)"""
    ok = n = 0
    for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
        for f in np.linspace(0, 1, max(2, int(abs(bx - ax) + abs(by - ay)) // 6)):
            x, y = int(ax + (bx - ax) * f), int(ay + (by - ay) * f); w = g[max(0, y - 3):y + 4, max(0, x - 3):x + 4]
            n += 1; ok += bool(w.size) and w.min() < INK
    return n and ok >= part * n

def vframe(vl, t):
    """the drawn rectangles around the letters t made of the sheet's vector lines, smallest first: [(x0, y0, x1, y1)]"""
    H, V = vl[:2]; x0, y0, x1, y1 = t; s = min(x1 - x0, y1 - y0); c = max(3, .3 * s)
    # far enough for a second line across the writing, and along it for the rest of a tag only partly fitted (alone() decides)
    fx, fy = 3.8 * s + (x1 - x0 if s == y1 - y0 else 0), 3.8 * s + (y1 - y0 if s == x1 - x0 else 0)
    tops = [h for h in H if y0 - fy <= h[0] <= y0 + 1 and h[1] <= x0 + 1 and h[2] >= x1 - 1]
    bots = [h for h in H if y1 - 1 <= h[0] <= y1 + fy and h[1] <= x0 + 1 and h[2] >= x1 - 1]
    lefs = [v for v in V if x0 - fx <= v[0] <= x0 + 1 and v[1] <= y0 + 1 and v[2] >= y1 - 1]
    rigs = [v for v in V if x1 - 1 <= v[0] <= x1 + fx and v[1] <= y0 + 1 and v[2] >= y1 - 1]
    out = []
    for tp in tops:
        for bt in bots:
            for lf in lefs:
                for rg in rigs:
                    # closed at the corners, and no side running on past them (pipes crossing around the text are no box)
                    if all(abs(h[1] - lf[0]) <= c and abs(h[2] - rg[0]) <= c for h in (tp, bt)) and all(abs(v[1] - tp[0]) <= c and abs(v[2] - bt[0]) <= c for v in (lf, rg)):
                        out.append((lf[0], tp[0], rg[0], bt[0]))
    return sorted(set(out), key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))

def alone(g, f, t, others=()):
    """whether the drawn box f holds only the text t (and at most one short line more, a label), not far from it all round"""
    x0, y0, x1, y1 = t; vert = (y1 - y0) > (x1 - x0) * 1.6; s = (x1 - x0) if vert else (y1 - y0)
    if any(f[0] < cx < f[2] and f[1] < cy < f[3] and not (x0 - s < cx < x1 + s and y0 - s < cy < y1 + s) for cx, cy in others): return False
    e = max(3, int(s * .15)); X0, Y0, X1, Y1 = int(f[0]) + e, int(f[1]) + e, int(f[2]) - e, int(f[3]) - e
    if X1 - X0 < 3 or Y1 - Y0 < 3: return False
    tol = s * .35; extra = []; m = g[Y0:Y1, X0:X1] < INK
    # a divider straight across the box (the SP over MC-001) is part of the box, not something else in it
    if vert: m[:, (m.mean(0) >= .9) & ((np.arange(X0, X1) < x0) | (np.arange(X0, X1) > x1))] = False
    else: m[(m.mean(1) >= .9) & ((np.arange(Y0, Y1) < y0) | (np.arange(Y0, Y1) > y1))] = False
    for (a, b, c, d, n) in comps(m):
        bb = (X0 + b, Y0 + a, X0 + d, Y0 + c)
        if n < 4 or (bb[0] >= x0 - tol and bb[1] >= y0 - tol and bb[2] <= x1 + tol and bb[3] <= y1 + tol): continue
        hh, ww = (bb[2] - bb[0], bb[3] - bb[1]) if vert else (bb[3] - bb[1], bb[2] - bb[0])
        if hh > s * 1.5 or ww > s * 4.5: return False   # a line or symbol in the box
        extra.append(bb)
    ax = 0 if vert else 1
    # letters on the tag's own line are the rest of it (a fit that caught only part of the tag)
    row = [b for b in extra if min(b[ax + 2], t[ax + 2]) - max(b[ax], t[ax]) > s * .5]
    if row:
        t = (min([t[0]] + [b[0] for b in row]), min([t[1]] + [b[1] for b in row]), max([t[2]] + [b[2] for b in row]), max([t[3]] + [b[3] for b in row]))
        extra = [b for b in extra if b not in row]
    u = t
    if extra:
        e0 = (min(b[0] for b in extra), min(b[1] for b in extra), max(b[2] for b in extra), max(b[3] for b in extra))
        # across the writing: one more line (above or below, or beside when vertical) ...
        if e0[ax + 2] - e0[ax] > s * 1.6 or min(e0[ax + 2], t[ax + 2]) - max(e0[ax], t[ax]) > s * .3: return False
        if e0[3 - ax] - e0[1 - ax] > (t[3 - ax] - t[1 - ax]) * 1.3: return False   # ... and no longer than the tag
        u = (min(t[0], e0[0]), min(t[1], e0[1]), max(t[2], e0[2]), max(t[3], e0[3]))
    return max(u[0] - f[0], u[1] - f[1], f[2] - u[2], f[3] - u[3]) <= s * 1.6

def joined(O, area, near=1.5):
    """the closed outlines made of the open strokes lying wholly in area (a ribbon drawn in two halves): [[(x, y), ...]]"""
    L = [p for p in O if all(area[0] <= x <= area[2] and area[1] <= y <= area[3] for x, y in p)][:60]; out = []
    close = lambda a, b: abs(a[0] - b[0]) + abs(a[1] - b[1]) < near
    def grow(path, used):
        if len(used) > 1 and close(path[0], path[-1]): out.append(path); return
        if len(used) >= 6 or len(out) > 20: return
        for i, p in enumerate(L):
            if i in used: continue
            if close(p[0], path[-1]): grow(path + p[1:], used | {i})
            elif close(p[-1], path[-1]): grow(path + p[::-1][1:], used | {i})
    for i in range(len(L)): grow(L[i], {i})
    return out

def ribbon(vl, t, g=None):
    """the drawn ribbon (continuation flag) around the text t: ((x0, y0, x1, y1), shape, depth) or None. The shape tells each
    end: "L" / "R" a point on the left / right, "l" / "r" a notch (swallow tail) there, "B" both ends square; the depth is
    that of the point (or notch) as a part of the width"""
    x0, y0, x1, y1 = t; s = min(x1 - x0, y1 - y0); best = None
    for P in vl[2] + joined(vl[3] if len(vl) > 3 else [], (x0 - 12 * s, y0 - 3 * s, x1 + 12 * s, y1 + 3 * s)):
        xs, ys = [p[0] for p in P], [p[1] for p in P]; b = (min(xs), min(ys), max(xs), max(ys)); w, h = b[2] - b[0], b[3] - b[1]
        if not (b[0] <= x0 + 2 and b[1] <= y0 + 2 and b[2] >= x1 - 2 and b[3] >= y1 - 2): continue
        if h > s * 4.5 or w > (x1 - x0) + 12 * s or (best and w * h <= best[3]): continue   # the outermost (one may be drawn over another)
        e = max(2, h * .1); ym = (b[1] + b[3]) / 2; ends = []
        for X in (b[0], b[2]):
            at = [p for p in P if abs(p[0] - X) <= e]
            flat = any(abs(p[1] - b[1]) <= e for p in at) and any(abs(p[1] - b[3]) <= e for p in at)
            mid = [abs(p[0] - X) for p in P if abs(p[1] - ym) <= h * .2 and e < abs(p[0] - X) < w * .45]
            tip = not flat and at and all(abs(p[1] - ym) <= h * .2 for p in at)
            # where the top and bottom edges end: the point's depth
            cn = [abs(p[0] - X) for p in P if (abs(p[1] - b[1]) <= e or abs(p[1] - b[3]) <= e) and abs(p[0] - X) < w / 2]
            if tip and cn: ends.append(("P", min(cn)))
            elif flat and mid: ends.append(("N", min(mid)))
            elif flat: ends.append(("", 0))
            else: ends = None; break
        if not ends: continue
        sh = {"P": "L", "N": "l"}.get(ends[0][0], "") + {"P": "R", "N": "r"}.get(ends[1][0], "") or "B"
        dep = max(d for k, d in ends) / w
        if dep > .45 or sh in ("l", "r", "lr"): continue   # a notch alone (no point): not a ribbon seen before, unsure
        if g is not None and not drawn(g, P[:-1] if P[0] == P[-1] else P, .45): continue   # (may be dashed)
        best = (b, sh, round(dep, 3), w * h)
    return best and best[:3]

def ribbon_raster(g, t):
    """a scanned sheet's ribbon: the outline (one dark blob) closely around t, read as a polygon"""
    x0, y0, x1, y1 = t; s = min(x1 - x0, y1 - y0); m = 4 * s
    X0, Y0, X1, Y1 = int(max(0, x0 - m)), int(max(0, y0 - 2 * s)), int(min(g.shape[1], x1 + m)), int(min(g.shape[0], y1 + 2 * s))
    n, lab, st, _ = cv2.connectedComponentsWithStats((g[Y0:Y1, X0:X1] < INK).astype(np.uint8), connectivity=8); best = None
    for i in range(1, n):
        bx0, by0, bw, bh = X0 + st[i, 0], Y0 + st[i, 1], st[i, 2], st[i, 3]
        if not (bx0 <= x0 and by0 <= y0 and bx0 + bw >= x1 and by0 + bh >= y1) or bh > 4.5 * s: continue
        if bx0 <= X0 or by0 <= Y0 or bx0 + bw >= X1 or by0 + bh >= Y1: continue   # runs off (a pipe or frame): unsure
        cs, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        hull = cv2.convexHull(max(cs, key=cv2.contourArea)); ap = cv2.approxPolyDP(hull, .02 * cv2.arcLength(hull, True), True)
        if not 4 <= len(ap) <= 6: continue
        P = [(X0 + p[0][0], Y0 + p[0][1]) for p in ap]; P.append(P[0])
        r = ribbon(([], [], [P]), t, g)
        if r and (not best or bw * bh < best[1]): best = (r, bw * bh)
    return best and best[0]

def process(num, refs, own, ix, td, preview=None):
    doc = pymupdf.open(os.path.join(ROOT, ix[num]["file"])); stats = {"o": 0, "b": 0, "t": 0, "new": 0, "same": 0}; shots = []
    have = {norm(x) for r in refs for x in r[5].split("|")}
    rem = {k: v for k, v in own.items() if k not in have and re.fullmatch(r"[A-Z]{1,5}\d{5}[A-Z]?", k)}
    for pno, page in enumerate(doc, 1):
        pm = page.get_pixmap(matrix=pymupdf.Matrix(Z, Z), colorspace=pymupdf.csGRAY, alpha=False)
        g = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.stride)[:, :pm.width].copy()
        sx, sy = pm.width / 1e4, pm.height / 1e4
        before = [r[:] for r in refs if r[0] == pno]
        cs = circles(g)
        # 1. bubbles the text layer missed (and second drawings of a bubble, e.g. in the field and on the DCS)
        bub = {k: v for k, v in own.items() if re.fullmatch(r"[A-Z]{1,5}\d{5}[A-Z]?", k)}
        for (x, y, r) in cs:
            if any(rr[0] == pno and abs((rr[1] + rr[3] / 2) * sx - x) < r and abs((rr[2] + rr[4] / 2) * sy - y) < r for rr in refs): continue
            lines = read_bubble(g, x, y, r, td)
            if len(lines) < 2: continue
            # the letters must read exactly; the number may be one character off (the OCR doubles a 7 now and then)
            let, dig = re.sub(r"\d", "", lines[0]), "".join(lines[1:])
            sc = sorted((lev(dig, re.sub(r"^[A-Z]+", "", rk), 1), rk) for rk in bub if re.match(r"[A-Z]+", rk).group(0) == let)
            if not sc or sc[0][0] > 1 or (len(sc) > 1 and sc[1][0] == sc[0][0]): continue
            key, t = bub[sc[0][1]]; rem.pop(sc[0][1], None)
            f = frame(g, (x - r, y - r, x + r, y + r), .3); bx = f or (x - r, y - r, x + r, y + r)
            refs.append([pno, round(bx[0] / sx), round(bx[1] / sy), round((bx[2] - bx[0]) / sx), round((bx[3] - bx[1]) / sy), key, t, "b" if f else "o"]); stats["new"] += 1
        # 2. a bubble the text layer could only narrow to several tags ("q": the number matched, the letters didn't read):
        # read the bubble itself; its letters pick the tag, or show it is none of them (an HS bubble on an XV loop)
        for rr in [r for r in refs if r[0] == pno and r[6] == "q"]:
            cx, cy = (rr[1] + rr[3] / 2) * sx, (rr[2] + rr[4] / 2) * sy
            c = next(((x, y, r) for (x, y, r) in cs if (cx - x) ** 2 + (cy - y) ** 2 < r * r), None)
            if not c: continue
            lines = read_bubble(g, *c, td)
            if len(lines) < 2 or not re.fullmatch(r"[A-Z]{1,5}", lines[0]): continue
            tags = rr[5].split("|"); L0 = lambda t: (re.match(r"[A-Z]*", norm(t)).group(0))
            hit = [t for t in tags if L0(t) == lines[0]] or [t for t in tags if lev(L0(t), lines[0], 1) <= 1]
            if len(hit) > 1: continue
            if not hit and any(lev(L0(t), lines[0], 2) <= 2 for t in tags): continue   # misread by two: leave the guess
            if len(hit) == 1: rr[5], rr[6] = hit[0], own.get(norm(hit[0]), (hit[0], "ins"))[1]
            elif not hit: rr[6] = "x"; stats["dropped"] = stats.get("dropped", 0) + 1   # kept in place (other drawings' ways back count positions); the viewer skips "x"
        # 3. fit every ref on this sheet
        for rr in refs:
            if rr[0] != pno or rr[6] == "x" or (len(rr) > 7 and rr[7] in ("o", "b", "t")): continue
            box = (rr[1] * sx, rr[2] * sy, (rr[1] + rr[3]) * sx, (rr[2] + rr[4]) * sy); cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            c = next(((x, y, r) for (x, y, r) in cs if (cx - x) ** 2 + (cy - y) ** 2 < (r * .8) ** 2 and box[2] - box[0] < 2.2 * r), None)
            if c and rr[6] != "d":
                x, y, r = c; nb, how = (x - r, y - r, x + r, y + r), "o"
                f = frame(g, nb, .3)                  # a bubble in a square (DCS shared display): the square
                if f: nb, how = f, "b"
            else:
                t = hug(g, box, rr[5].split("|")[0], td)
                # a drawn box holds the whole label (SP over MC-001 in one box): look around all its lines, then the line
                f = t and rr[6] != "d" and (frame(g, hug(g, box, whole=True) or t) or frame(g, t))
                nb, how = (f, "b") if f else (t, "t") if t else (None, None)
            if not nb: stats["same"] += 1; continue
            rr[1], rr[2], rr[3], rr[4] = round(nb[0] / sx), round(nb[1] / sy), max(1, round((nb[2] - nb[0]) / sx)), max(1, round((nb[3] - nb[1]) / sy))
            if rr[6] != "d":
                while len(rr) < 8: rr.append(None)
                rr[7] = how
            stats[how] += 1
        if preview: shots.append((pno, g, sx, sy, before, [r for r in refs if r[0] == pno]))
    return stats, shots, rem

TAGS = ("mel", "spi", "q", "cv", "mv", "ins")

def upgrade(num, refs, ix, td, preview=None, boxes=True, ribs=True):
    """on a fitted sheet, only: a tag fitted to its letters (or not fitted) that sits alone in a drawn box gets that box
    ("b"), and a continuation ref gets the ribbon drawn round it as a 9th entry [l, t, w, h, shape, point depth / w]"""
    doc = pymupdf.open(os.path.join(ROOT, ix[num]["file"])); stats = {"b": 0, "ribbon": 0}; shots = []
    for pno in sorted({r[0] for r in refs}):
        page = doc[pno - 1]
        # in colour, each pixel its darkest channel: thin red or blue lines and letters are ink, not light grey
        pm = page.get_pixmap(matrix=pymupdf.Matrix(Z, Z), colorspace=pymupdf.csRGB, alpha=False)
        g = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.stride)[:, :pm.width * 3].reshape(pm.height, pm.width, 3).min(2)
        sx, sy = pm.width / 1e4, pm.height / 1e4; vl = vlines(page)
        before = [r[:] for r in refs if r[0] == pno]
        px = lambda r: (r[1] * sx, r[2] * sy, (r[1] + r[3]) * sx, (r[2] + r[4]) * sy)
        others = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for b in (px(r) for r in refs if r[0] == pno and r[6] not in ("d", "x"))]
        for rr in refs:
            if rr[0] != pno: continue
            fit = rr[7] if len(rr) > 7 else None
            if boxes and rr[6] in TAGS and fit in ("t", None):
                t = px(rr) if fit == "t" else hug(g, px(rr), rr[5].split("|")[0], td)
                if not t: continue
                # the sheet's own lines first; a scanned sheet's dark outlines (the box loose round the text allowed)
                fs = vframe(vl, t)[:3] if vl else [frame(g, t, 1.6, None)]
                f = next((f for f in fs if f and drawn(g, [(f[0], f[1]), (f[2], f[1]), (f[2], f[3]), (f[0], f[3])]) and alone(g, f, t, others)), None)
                if not f: continue
                rr[1], rr[2], rr[3], rr[4] = round(f[0] / sx), round(f[1] / sy), max(1, round((f[2] - f[0]) / sx)), max(1, round((f[3] - f[1]) / sy))
                while len(rr) < 8: rr.append(None)
                rr[7] = "b"; stats["b"] += 1
            elif ribs and rr[6] == "d":
                r = None
                if max(rr[3], rr[4]) > 1500 or min(rr[3], rr[4]) > 150: continue   # no line of text: unsure
                for t in (px(rr), hug(g, px(rr), whole=True)):
                    r = t and (ribbon(vl, t, g) if vl else ribbon_raster(g, t))
                    if r: break
                if not r: continue
                (b0, b1, b2, b3), sh, dep = r
                while len(rr) < 8: rr.append(None)   # (a continuation without a way back keeps none: null)
                del rr[8:]; rr.append([round(b0 / sx), round(b1 / sy), max(1, round((b2 - b0) / sx)), max(1, round((b3 - b1) / sy)), sh, dep])
                stats["ribbon"] += 1; stats[sh] = stats.get(sh, 0) + 1
        if preview: shots.append((pno, g, sx, sy, before, [r for r in refs if r[0] == pno]))
    return stats, shots

def _up(a):
    num, refs, boxes, ribs = a; ix = json.load(open(os.path.join(ROOT, "PIDs/index.json")))["pids"]
    try: st, _ = upgrade(num, refs, ix, tempfile.mkdtemp(), None, boxes, ribs)
    except Exception as e: return num, None, {"error": str(e)[:80]}
    return num, refs, st

def draw(g, sx, sy, refs, old=False):
    from PIL import Image, ImageDraw
    im = Image.fromarray(g).convert("RGB"); d = ImageDraw.Draw(im, "RGBA")
    for r in refs:
        if r[6] == "x": continue
        x0, y0, x1, y1 = r[1] * sx, r[2] * sy, (r[1] + r[3]) * sx, (r[2] + r[4]) * sy; how = r[7] if len(r) > 7 and isinstance(r[7], str) else None
        if old or how is None: m = .25 * min(x1 - x0, y1 - y0); x0, y0, x1, y1 = x0 - m, y0 - m, x1 + m, y1 + m
        elif how == "t": m = float(os.environ.get("TM", ".15")) * min(x1 - x0, y1 - y0); x0, y0, x1, y1 = x0 - m, y0 - m, x1 + m, y1 + m
        new = len(r) > 8 and r[8] == "new"
        col = (30, 140, 60) if new else (224, 32, 27)
        if r[6] == "d" and len(r) > 8 and isinstance(r[8], list) and not old:   # the ribbon round a continuation
            l, t, w, h, sh, dep = r[8]; x0, y0, x1, y1 = l * sx, t * sy, (l + w) * sx, (t + h) * sy; k = dep * (x1 - x0); ym = (y0 + y1) / 2
            l0, r0 = x0 + k * ("L" in sh), x1 - k * ("R" in sh)
            pts = [(l0, y0), (r0, y0)] + ([(x1, ym)] if "R" in sh else [(x1 - k, ym)] if "r" in sh else []) + [(r0, y1), (l0, y1)]
            pts += [(x0, ym)] if "L" in sh else [(x0 + k, ym)] if "l" in sh else []
            d.polygon(pts, outline=(30, 90, 220, 230), fill=(30, 90, 220, 40), width=4); continue
        (d.ellipse if how == "o" and not old else d.rectangle)([x0, y0, x1, y1], outline=col + (210,), width=4, fill=col + (26,))
    return im

def _one(a):
    num, refs, own = a; ix = json.load(open(os.path.join(ROOT, "PIDs/index.json")))["pids"]
    try: st, _, rem = process(num, refs, own, ix, tempfile.mkdtemp())
    except Exception as e: return num, refs, {"error": str(e)[:80]}, {}
    return num, refs, st, rem

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    prev = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    if prev: args = [a for a in args if a != prev]
    ix = json.load(open(os.path.join(ROOT, "PIDs/index.json")))["pids"]
    R = json.load(open(os.path.join(ROOT, "pid-refs.json"))); OWN = own_items(); td = tempfile.mkdtemp()
    if not args: args = json.load(open(os.path.join(ROOT, "tools/refs_checked.json")))   # the checked sheets
    boxes, ribs = "--boxes" in sys.argv, "--ribbons" in sys.argv
    if boxes or ribs:   # on the fitted sheets: only the boxes round tags and the ribbons round continuations
        out = os.path.join(ROOT, "pid-refs.json")
        if prev:
            for num in args:
                st, shots = upgrade(num, R[num], ix, td, prev, boxes, ribs); print(num, st, flush=True)
                for pno, g, sx, sy, before, after in shots:
                    draw(g, sx, sy, before).save(os.path.join(prev, f"{num}-p{pno}-before.png"))
                    draw(g, sx, sy, after).save(os.path.join(prev, f"{num}-p{pno}-after.png"))
            return
        from multiprocessing import Pool
        # each sheet is kept as it finishes (in $CVDIR), so a run that stops can carry on where it left off
        cd = os.environ.get("CVDIR") or os.path.join(tempfile.gettempdir(), "refs_cv_up"); os.makedirs(cd, exist_ok=True)
        f = lambda n: os.path.join(cd, n + ".json")
        todo = [n for n in args if n in ix and n in R and not os.path.exists(f(n))]
        with Pool(int(os.environ.get("JOBS", "4"))) as pool:
            for num, refs, st in pool.imap_unordered(_up, [(n, R[n], boxes, ribs) for n in todo]):
                if refs is not None: json.dump(refs, open(f(num), "w"))
                print(num, st, flush=True)
        for n in args:
            if os.path.exists(f(n)):
                refs = json.load(open(f(n)))
                if len(refs) == len(R[n]): R[n] = refs   # every position kept (other drawings' ways back count them)
        json.dump(R, open(out, "w"), separators=(",", ":")); return
    if not prev and len(args) > 1:   # several sheets: four at a time
        from multiprocessing import Pool
        # each sheet is kept as it finishes (in $CVDIR), so a run that stops can carry on where it left off
        cd = os.environ.get("CVDIR") or os.path.join(tempfile.gettempdir(), "refs_cv"); os.makedirs(cd, exist_ok=True)
        f = lambda n: os.path.join(cd, n + ".json")
        todo = [n for n in args if n in ix and not os.path.exists(f(n))]
        with Pool(int(os.environ.get("JOBS", "4"))) as pool:
            for num, refs, st, rem in pool.imap_unordered(_one, [(n, R.get(n, []), OWN.get(n, {})) for n in todo]):
                json.dump(refs, open(f(num), "w")); print(num, st, "not found:", len(rem), flush=True)
        for n in args:
            if os.path.exists(f(n)): R[n] = json.load(open(f(n)))
        json.dump(R, open(os.path.join(ROOT, "pid-refs.json"), "w"), separators=(",", ":")); return
    for num in (list(R) if args == ["all"] else args):
        n0 = len(R.get(num, []))
        st, shots, rem = process(num, R.setdefault(num, []), OWN.get(num, {}), ix, td, prev)
        for r in R[num][n0:]: r.append("new") if prev else None
        print(num, st, "still not found:", sorted(v[0] for v in rem.values()))
        if prev:
            for pno, g, sx, sy, before, after in shots:
                draw(g, sx, sy, before, True).save(os.path.join(prev, f"{num}-p{pno}-before.png"))
                draw(g, sx, sy, after).save(os.path.join(prev, f"{num}-p{pno}-after.png"))
    if not prev: json.dump(R, open(os.path.join(ROOT, "pid-refs.json"), "w"), separators=(",", ":"))

if __name__ == "__main__": main()
