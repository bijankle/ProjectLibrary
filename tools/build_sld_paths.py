"""Supply paths on the single line diagrams, for the fly through (pdfview.js trace), in the same form as the P&ID line
paths (tools/build_line_paths.py): lines/<sheet>.json, {"<ref index>": [[x, y] ...] (1e4 sheet units, supply first),
"m": {key: [[f, kind, text]]}, "fl": {key: 1}, "rb": {ribbon: key}, "up": {key: ribbon}, "dn": {key: ribbon},
"lb": {key: label}}.

Each motor, heater, feeder (anything tagged under a feeder, mel/elec refs) is walked up its cable: the dashed field
cable, the starter, the breaker (gaps of up to 70 pt where a device is drawn on the line), across a jog or a busbar to
the vertical that carries on up (the incomer, the longest run up), through the ACB and the transformer to the supply
at the top of the sheet. A "FEEDER TO" ribbon under a feeder is walked the same way (the trace goes on to that sheet),
and the supply ribbon at the top gets a key of its own: the board, ribbon down to its busbar.
Milestones along the path: the supply sheet (r), board (b), transformer (x), ACB/EOL/VSD/AFD (d), ratings (a, 400A),
feeder numbers (f, 3F-09) and the item at the end (e).
"""
import collections, json, math, os, re, sys, pymupdf

R = sys.argv[1] if len(sys.argv) > 1 else "."
REFS = json.load(open(R + "/pid-refs.json")); IX = json.load(open(R + "/PIDs/index.json"))["pids"]
V = lambda s: abs(s[0] - s[2]) < .6
Hh = lambda s: abs(s[1] - s[3]) < .6
BOARD = re.compile(r"-(SW|SR|MCC|DB|SB)-")


def strokes(p):
    S = []
    for d in p.get_drawings():
        w = d.get("width") or 0; c = d.get("color") or (1, 1, 1)
        if w < .7 or sum(c) > 1.2: continue
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1], it[2]
                if math.hypot(b.x - a.x, b.y - a.y) >= 2: S.append((a.x, a.y, b.x, b.y, w))
    return S


def is_bus(s): return Hh(s) and abs(s[0] - s[2]) > 150 and s[4] > 1.2


def column_up(S, x, y, stop_y=None, gap=70):
    """from (x, y) up the vertical run at x, through gaps (a device drawn on the line, a dashed cable) of up to gap pt"""
    top = y
    while True:
        best = None
        for s in S:
            if not V(s) or abs(s[0] - x) > 1.6: continue
            t, b = min(s[1], s[3]), max(s[1], s[3])
            if b <= top + 1 and top - b < gap and t < top - .5:
                if stop_y is not None and t < stop_y - 1: t = stop_y
                if best is None or t < best: best = t
        if best is None or best >= top - .5: break
        top = best
        if stop_y is not None and top <= stop_y + .5: break
    return top


def walk(S, B, x, y):
    """the path up from (x, y) to the supply: up each vertical run, across a busbar or a jog to the run carrying on up"""
    P = [(x, y)]; seen = {round(x)}
    for _ in range(10):
        bus = [b for b in B if min(b[0], b[2]) - 1 < x < max(b[0], b[2]) + 1 and b[1] < y - .5]
        stop = max((b[1] for b in bus), default=None)
        t = column_up(S, x, y, stop)
        if t < y - .5: P.append((x, t)); y = t
        # the horizontal it meets at the top: a busbar, or a jog (a cable joining two drops)
        hs = [s for s in S if Hh(s) and min(s[0], s[2]) - 2 < x < max(s[0], s[2]) + 2 and y - 12 < s[1] < y + 3 and abs(s[0] - s[2]) > 8]
        if not hs: break
        h = min(hs, key=lambda s: (not is_bus(s), abs(s[1] - y)))
        hy = h[1]; lo, hi = min(h[0], h[2]), max(h[0], h[2])
        if is_bus(h):   # (the bus may be drawn in pieces)
            for _ in range(4):
                more = [s for s in B if abs(s[1] - hy) < 1 and min(s[0], s[2]) < hi + 3 and max(s[0], s[2]) > lo - 3]
                lo2, hi2 = min([lo] + [min(s[0], s[2]) for s in more]), max([hi] + [max(s[0], s[2]) for s in more])
                if (lo2, hi2) == (lo, hi): break
                lo, hi = lo2, hi2
        ups = {}
        for s in S:
            if V(s) and lo - 1 < s[0] < hi + 1 and round(s[0]) not in seen and abs(max(s[1], s[3]) - hy) < 2 and min(s[1], s[3]) < hy - 4:
                ups.setdefault(round(s[0]), s[0])
        if not ups: break
        nx = max(ups.values(), key=lambda u: hy - column_up(S, u, hy))
        if hy - column_up(S, nx, hy) < 10: break
        if abs(hy - y) > .5: P.append((x, hy))
        P.append((nx, hy)); x, y = nx, hy; seen.add(round(nx))
    return P


def anchor(S, cx, cy, wide=30, pen=2):
    """the cable over a tag: the column of vertical strokes above it (nearest, most drawn), and its lowest point"""
    col = collections.defaultdict(float)
    for s in S:
        if V(s) and abs(s[0] - cx) < wide and cy - 400 < max(s[1], s[3]) < cy + 2: col[round(s[0])] += abs(s[1] - s[3]) * (s[4] if wide > 30 else 1)
    if not col: return None
    x = max(col, key=lambda x: col[x] - abs(x - cx) * pen)
    if col[x] < 60: return None
    ss = [s for s in S if V(s) and abs(s[0] - x) < 1.6 and max(s[1], s[3]) < cy + 2]
    return ss[0][0], max(max(s[1], s[3]) for s in ss)


def kind(t):
    if re.fullmatch(r"\d[A-Z]-\d{2}", t): return "f"
    if re.fullmatch(r"\d{2,4}A", t): return "a"
    if t in ("ACB", "EOL", "VSD", "AFD", "VVVF", "SS", "DOL"): return "d"
    if re.fullmatch(r"F\d{2,3}-TR-\d+[A-Z]?", t): return "x"
    return None


def build(num):
    doc = pymupdf.open(R + "/" + IX[num]["file"]); refs = REFS[num]; out = {"m": {}, "fl": {}, "rb": {}, "up": {}, "dn": {}, "lb": {}}
    pages = {}; BUS = {}
    def page(n):
        if n not in pages:
            pg = doc[n - 1]; S = strokes(pg)
            pages[n] = (pg.rect.width, pg.rect.height, S, [s for s in S if is_bus(s)],
                        [(w[4], (w[0] + w[2]) / 2, (w[1] + w[3]) / 2) for w in pg.get_text("words")])
        return pages[n]
    def box(r, W, H): return r[1] * W / 1e4, r[2] * H / 1e4, (r[1] + r[3]) * W / 1e4, (r[2] + r[4]) * H / 1e4
    for k, r in enumerate(refs):
        tag = str(r[5]).split("|")[0]
        rib = r[6] == "d" and "-SLD-" in tag
        if not (r[6] in ("mel", "elec") and not BOARD.search(tag) and "-TR-" not in tag) and not rib: continue
        W, H, S, B, words = page(r[0]); x0, y0, x1, y1 = box(r, W, H)
        a = anchor(S, (x0 + x1) / 2, y0) or (rib and anchor(S, (x0 + x1) / 2, y0, 160, .5))
        if not a: continue
        P = walk(S, B, *a)[::-1]; cont = None
        # a board drawn over two sheets: the feeder ends on a busbar with no incomer on this sheet. Along the busbar to
        # its end where the ribbon "CONTINUED ON SHT 1" is, the supply
        if len(P) >= 2 and any(abs(P[0][1] - b[1]) < 1 for b in B):
            lo, hi = span(B, P[0][0], P[0][1]); y = P[0][1]
            c = [(min(dist(box(q, W, H), (e, y)) for e in (lo, hi)), j, min((lo, hi), key=lambda e: dist(box(q, W, H), (e, y)))) for j, q in enumerate(refs)
                 if q[0] == r[0] and q[6] == "d" and "-SLD-" in str(q[5]) and j != k]
            c = [e for e in c if e[0] < 200]
            if c:
                _, cont, e = min(c); P.insert(0, (e, y)); BUS.setdefault((r[0], round(y)), [lo, hi, None, None])[3] = (cont, e)
        if len(P) < 3 or not any(abs(P[i][1] - P[i + 1][1]) < .5 and any(abs(b[1] - P[i][1]) < 1 for b in B) for i in range(len(P) - 1)): continue
        Lc = [0]
        for p, q in zip(P, P[1:]): Lc.append(Lc[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
        tot = Lc[-1] or 1
        def proj(x, y, near):
            best = None
            for i, (p, q) in enumerate(zip(P, P[1:])):
                sl = Lc[i + 1] - Lc[i]
                if sl < 1e-6 or abs(p[1] - q[1]) < .5: continue   # (on the verticals only: a busbar passes other feeders' names)
                u = max(0, min(1, (y - p[1]) / (q[1] - p[1])))
                dx, dy = abs(p[0] - x), abs(p[1] + u * (q[1] - p[1]) - y)
                if near < 0 and x > p[0]: continue   # (a breaker's trip setting is written to the left of it)
                if dx < abs(near) and dy < 3 and (best is None or dx < best[0]): best = (dx, (Lc[i] + u * sl) / tot)
            return best and best[1]
        M = []
        for t, x, y in words:
            kd = kind(t)
            if not kd: continue
            f = proj(x, y, 26 if kd in "fd" else 60 if kd == "x" else -40)
            if f is not None and 0 < f < .995: M.append([round(f, 3), kd, t])
        # the board: its busbar, named by the board's tag drawn over it (the nearest board tag above, within its span)
        for i, (p, q) in enumerate(zip(P, P[1:])):
            if abs(p[1] - q[1]) < .5 and any(abs(b[1] - p[1]) < 1 for b in B):
                bt = [(rr, box(rr, W, H)) for rr in refs if rr[0] == r[0] and rr[6] in ("mel", "elec") and BOARD.search(str(rr[5]))]
                bt = [(rr, bb) for rr, bb in bt if bb[3] < p[1] and bb[0] < max(p[0], q[0]) + 400]
                if bt:
                    rr = min(bt, key=lambda e: (p[1] - e[1][3]) + abs(e[1][0] - min(p[0], q[0])) * .3)[0]
                    M.append([round((Lc[i] + Lc[i + 1]) / 2 / tot, 3), "b", str(rr[5]).split("|")[0]])
                break
        if rib: M.append([1, "r", tag])
        else: M.append([1, "e", tag])
        # the supply: a ribbon to another single line diagram at the top of the path
        sx, sy = P[0]; up = None
        for j, q in enumerate(refs):
            if q[0] == r[0] and q[6] == "d" and "-SLD-" in str(q[5]) and j != k:
                qx0, qy0, qx1, qy1 = box(q, W, H)
                d = math.hypot(max(qx0 - sx, 0, sx - qx1), max(qy0 - sy, 0, sy - qy1))
                if d < 60 and (up is None or d < up[0]): up = (d, j)
        if cont is not None: up = (0, cont)
        else:   # (a busbar fed on this sheet: kept for a ribbon at its end, "CONTINUED ON SHT 2")
            ib = next((i for i in range(len(P) - 1) if abs(P[i][1] - P[i + 1][1]) < .5 and any(abs(b[1] - P[i][1]) < 1 for b in B)), None)
            if ib is not None:
                y = P[ib][1]; lo, hi = span(B, P[ib + 1][0], y); BUS.setdefault((r[0], round(y)), [lo, hi, None, None])[2] = (k, ib)
        if cont is not None: M.append([0, "r", str(refs[cont][5]).split("|")[0]]); out["up"][str(k)] = cont
        if up and cont is None:
            j = up[1]; M.append([0, "r", str(refs[j][5]).split("|")[0]]); out["up"][str(k)] = j
            # (the board as a key of its own: the supply ribbon down to the busbar, to arrive at from upstream)
            ib = next((i for i in range(len(P) - 1) if abs(P[i][1] - P[i + 1][1]) < .5 and any(abs(b[1] - P[i][1]) < 1 for b in B)), None)
            if ib is not None and str(j) not in out:
                out[str(j)] = [[round(x / W * 1e4), round(y / H * 1e4)] for x, y in P[:ib + 1]]
                bm = [m for m in M if m[0] * tot <= Lc[ib] + 1 and m[1] != "e"]
                bl = next((m[2] for m in M if m[1] == "b"), None)
                out["m"][str(j)] = sorted([[round(m[0] * tot / (Lc[ib] or 1), 3)] + m[1:] for m in bm] + ([[1, "b", bl]] if bl else []))
                out["fl"][str(j)] = 1; out["rb"][str(j)] = j
                if bl: out["lb"][str(j)] = bl
        if rib: out["dn"][str(k)] = k; out["rb"][str(k)] = k; out["lb"][str(k)] = "Feeder to " + sh(tag)
        out[str(k)] = [[round(x / W * 1e4), round(y / H * 1e4)] for x, y in P]
        out["m"][str(k)] = sorted(M); out["fl"][str(k)] = 1
    # the ribbon at the end of a busbar fed on this sheet: the board carried on (supply, along the busbar to the ribbon)
    for (pn, y), (lo, hi, fed, _) in BUS.items():
        if not fed: continue
        W, H, S, B, words = page(pn); k, ib = fed; P = [(x * W / 1e4, yy * H / 1e4) for x, yy in out[str(k)]]
        for j, q in enumerate(refs):
            if q[0] != pn or q[6] != "d" or "-SLD-" not in str(q[5]) or str(j) in out: continue
            e = min((lo, hi), key=lambda e: dist(box(q, W, H), (e, P[ib][1])))
            if dist(box(q, W, H), (e, P[ib][1])) > 200: continue
            Q = P[:ib + 1] + [(e, P[ib][1])]
            Lp = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(P, P[1:])); Lq = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(Q, Q[1:]))
            Li = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(P[:ib + 1], P[1:ib + 1]))
            M = [[round(m[0] * Lp / Lq, 3)] + m[1:] for m in out["m"][str(k)] if m[0] * Lp <= Li + 1 and m[1] not in "ef"]
            out[str(j)] = [[round(x / W * 1e4), round(yy / H * 1e4)] for x, yy in Q]; out["m"][str(j)] = sorted(M + [[1, "r", str(q[5]).split("|")[0]]])
            out["fl"][str(j)] = 1; out["rb"][str(j)] = j; out["dn"][str(j)] = j
            out["lb"][str(j)] = next((m[2] for m in M if m[1] == "b"), "Board") + " to " + sh(str(q[5]).split("|")[0])
            if str(k) in out["up"]: out["up"][str(j)] = out["up"][str(k)]
    # the ribbon a board on its second sheet is fed through: that sheet's busbar from the ribbon on (to arrive at)
    for (pn, y), (lo, hi, fed, cf) in BUS.items():
        if fed or not cf or str(cf[0]) in out: continue
        W, H, *_ = page(pn); j, e = cf; o = hi if e == lo else lo
        out[str(j)] = [[round(e / W * 1e4), round(y / H * 1e4)], [round(o / W * 1e4), round(y / H * 1e4)]]
        out["m"][str(j)] = [[0, "r", str(refs[j][5]).split("|")[0]]]; out["fl"][str(j)] = 1; out["rb"][str(j)] = j; out["up"][str(j)] = j
    return out


def sh(n): return re.sub(r"-SLD-EL-", "-", re.sub(r"^2000-", "", n))


def dist(b, p): return math.hypot(max(b[0] - p[0], 0, p[0] - b[2]), max(b[1] - p[1], 0, p[1] - b[3]))


def span(B, x, y):
    """the busbar at height y through x, its pieces joined: its two ends"""
    lo = hi = x
    for _ in range(6):
        more = [s for s in B if abs(s[1] - y) < 1 and min(s[0], s[2]) < hi + 3 and max(s[0], s[2]) > lo - 3]
        lo2, hi2 = min([lo] + [min(s[0], s[2]) for s in more]), max([hi] + [max(s[0], s[2]) for s in more])
        if (lo2, hi2) == (lo, hi): break
        lo, hi = lo2, hi2
    return lo, hi


if __name__ == "__main__":
    only = sys.argv[2:] or [n for n in IX if "-SLD-" in n]
    tot = got = 0
    for num in only:
        if num not in REFS: continue
        o = build(num); n = len([k for k in o if k.isdigit()]); got += n
        tot += sum(1 for r in REFS[num] if r[6] in ("mel", "elec") and not BOARD.search(str(r[5])))
        json.dump(o, open(R + "/lines/" + num + ".json", "w"), separators=(",", ":"))
    print(got, "paths;", tot, "items on the sheets")

    # (the offline list holds each file's fingerprint: rebuilt, so phones and browsers that kept the old paths fetch the new ones)
    import subprocess; subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_offline.py")], cwd=R, check=False)
