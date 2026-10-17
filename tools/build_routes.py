"""The plant's pipe network as one map, for the Export tab (export.html): which traced line runs on into which, on a sheet
and across sheets, and which assets sit on which line. Written to routes.json:
  "n": [[sheet, key, label, page], …]       every traced line (lines/<sheet>.json: numbered, "u<n>" and "r<n>")
  "e": [[a, fa, b, fb, w], …]                a joins b: fa, fb how far along each (0 its start, 1 its end), w the cost
  "a": {tag: [[node, f], …]}                 an asset on a line (its milestones, lines/*.json "m"), f how far along;
                                             a line number names its own line(s), f -1
  "x": {sheet: {page: [a, b, c, d, e, f]}}   a point on the sheet as shown (fractions across and down) in the PDF's own
                                             page space: X = a*u + c*v + e, Y = b*u + d*v + f (to draw on the PDF)
  "t": {sheet: [file, title, rev]},  "flc": the fluid colours (pdfview.js),  "mech": the unnumbered pipe colour
Joins as the trace's next line arrows have them (pdfview.js trNbs): an end on another line's end, or on its side; the
joins through pumps and vessels ("lk"); a continuation ribbon to the line its partner ribbon carries on the next sheet;
and, dearer, the same line number on another sheet, and two lines ending at the same piece of equipment.
"""
import glob, json, math, os, re, sys
import pymupdf

R = sys.argv[1] if len(sys.argv) > 1 else "."
REFS = json.load(open(os.path.join(R, "pid-refs.json"))); IX = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
LINES = {os.path.basename(p)[:-5]: json.load(open(p)) for p in glob.glob(os.path.join(R, "lines", "*-PID-*.json"))}
B_LINE = re.compile(r"\d{2,3}-\d{4}-[A-Z]{1,4}-[A-Z0-9.]{2,7}-\d{2,4}(?:-[A-Z0-9]{1,4})?")
isk = lambda k: re.fullmatch(r"\d+|u\d+|r\d+", k)

N, NI, E, A, X, T, P, U = [], {}, [], {}, {}, {}, {}, {}   # U: (sheet, page) -> points per 1/10000 of the sheet's width
for s, D in sorted(LINES.items()):
    if s not in IX: continue
    refs = REFS.get(s, []); doc = pymupdf.open(os.path.join(R, IX[s]["file"]))
    T[s] = [IX[s]["file"], IX[s].get("title", ""), IX[s].get("rev", "")]
    for k, path in D.items():
        if not isk(k) or len(path) < 2: continue
        if k.isdigit():
            if int(k) >= len(refs): continue
            pg, lab = refs[int(k)][0], str(refs[int(k)][5]).split("|")[0]
        elif k[0] == "u":
            if k not in (D.get("ub") or {}): continue
            pg, lab = D["ub"][k][0], D["lb"][k]
        else:
            if int(k[1:]) >= len(refs): continue
            pg, lab = refs[int(k[1:])][0], (D.get("lb") or {}).get(k, "")
        if pg - 1 >= len(doc): continue
        if (s, pg) not in U:
            p = doc[pg - 1]; Wd, Hd = p.rect.width, p.rect.height; m = p.derotation_matrix; mb = p.mediabox
            f = lambda u, v: (lambda q: (q.x + mb.x0, mb.y1 - q.y))(pymupdf.Point(u * Wd, v * Hd) * m)   # (shown -> unrotated -> PDF space, y up)
            o, ux, vy = f(0, 0), f(1, 0), f(0, 1)
            X.setdefault(s, {})[str(pg)] = [round(ux[0] - o[0], 3), round(ux[1] - o[1], 3), round(vy[0] - o[0], 3), round(vy[1] - o[1], 3), round(o[0], 3), round(o[1], 3)]
            U[s, pg] = (Wd / 1e4, Wd, Hd)
        _, Wd, Hd = U[s, pg]
        i = len(N); N.append([s, k, lab, pg]); NI[s, k] = i
        P[i] = [(q[0] * Wd / 1e4, q[1] * Hd / 1e4) for q in path]

def lens(Q):
    L = [0]
    for a, b in zip(Q, Q[1:]): L.append(L[-1] + math.dist(a, b))
    return L

def proj(Q, q):
    """how far along Q (a fraction) the point nearest q is, and how far off it q lies"""
    L = lens(Q); tot = L[-1] or 1; best = (1e18, 0)
    for i, (a, b) in enumerate(zip(Q, Q[1:])):
        dx, dy = b[0] - a[0], b[1] - a[1]; ll = dx * dx + dy * dy or 1
        t = max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / ll)); d = math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1])
        if d < best[0]: best = (d, (L[i] + t * (L[i + 1] - L[i])) / tot)
    return best[1], best[0]

seen = set()
def edge(a, fa, b, fb, w):
    if a == b or (min(a, b), max(a, b)) in seen: return
    seen.add((min(a, b), max(a, b))); E.append([a, round(fa, 3), b, round(fb, 3), w])

# on a sheet: an end on another's end (45 in 1/10000 of the width) or on its side (25)
by = {}
for i, (s, k, lab, pg) in enumerate(N): by.setdefault((s, pg), []).append(i)
for (s, pg), ids in by.items():
    u = U[s, pg][0]
    for i in ids:
        Q = P[i]
        for ei, e in ((0, Q[0]), (1, Q[-1])):
            for j in ids:
                if j == i: continue
                Q2 = P[j]; d0, d1 = math.dist(Q2[0], e), math.dist(Q2[-1], e)
                if min(d0, d1) < 45 * u: edge(i, ei, j, 0 if d0 < d1 else 1, 1)
                else:
                    f, d = proj(Q2, e)
                    if d < 25 * u: edge(i, ei, j, f, 1)
    for a, ea, b, eb in LINES[s].get("lk", []):
        ia, ib = NI.get((s, str(a))), NI.get((s, str(b)))
        if ia is not None and ib is not None and N[ia][3] == pg: edge(ia, ea, ib, eb, 1)

# across sheets: a ribbon's line to the line its partner (the ribbon on the other sheet pointing back) carries there
def rend(i, r):
    """which end of node i is by ribbon ref r"""
    s, k, lab, pg = N[i]; _, Wd, Hd = U[s, pg]; c = ((r[1] + r[3] / 2) * Wd / 1e4, (r[2] + r[4] / 2) * Hd / 1e4)
    return 0 if math.dist(P[i][0], c) < math.dist(P[i][-1], c) else 1
for s, D in LINES.items():
    refs = REFS.get(s, [])
    for j, k in (D.get("rb") or {}).items():
        i = NI.get((s, str(k)))
        if i is None or int(j) >= len(refs): continue
        r = refs[int(j)]
        if len(r) < 8 or r[7] is None: continue
        for t in str(r[5]).split("|"):
            Dt = LINES.get(t)
            if not Dt: continue
            for b in ([r[7]] if isinstance(r[7], int) else r[7]):
                kt = (Dt.get("rb") or {}).get(str(b)); i2 = NI.get((t, str(kt))) if kt is not None else None
                if i2 is None or b >= len(REFS.get(t, [])): continue
                edge(i, rend(i, r), i2, rend(i2, REFS[t][b]), 1.5)
# (and the same line number on another sheet, where no ribbon pair said so: dearer)
bylab = {}
for i, (s, k, lab, pg) in enumerate(N):
    if lab: bylab.setdefault(lab, []).append(i)
for lab, ids in bylab.items():
    for a in ids:
        for b in ids:
            if N[a][0] < N[b][0]: edge(a, 1, b, 0, 4)

# assets on the lines: the milestones (equipment, valves, instruments, specials), and each line by its own number
for i, (s, k, lab, pg) in enumerate(N):
    for m in (LINES[s].get("m") or {}).get(k, []):
        if m[1] in "evip" and m[2]: A.setdefault(m[2], []).append([i, round(m[0], 3)])
    if lab: A.setdefault(lab, []).append([i, -1])

# (through a piece of equipment: two lines ending at the same tag on a sheet, a vessel or a pump the joins above missed)
ends = {}
for tag, L in A.items():
    for i, f in L:
        if f >= 0 and (f < .06 or f > .94) and not B_LINE.fullmatch(tag): ends.setdefault((N[i][0], tag), []).append((i, 0 if f < .5 else 1))
for (s, tag), L in ends.items():
    for x in range(len(L)):
        for y in range(x + 1, len(L)):
            if L[x][0] != L[y][0]: edge(L[x][0], L[x][1], L[y][0], L[y][1], 2)

src = open(os.path.join(R, "pdfview.js")).read()
flc = json.loads(re.search(r"const FLC = (\{[^}]*\})", src).group(1)); mech = re.search(r'const MECHC = "([^"]+)"', src).group(1)
out = {"n": N, "e": E, "a": A, "x": X, "t": T, "flc": flc, "mech": mech}
json.dump(out, open(os.path.join(R, "routes.json"), "w"), separators=(",", ":"))
print(len(N), "lines,", len(E), "joins,", len(A), "assets ->", os.path.getsize(os.path.join(R, "routes.json")) // 1024, "KB")
