"""Fits the tappable boxes on a drawing to what is printed, and finds tags the text layer missed (computer vision).

Usage: python3 tools/refs_cv.py [<drawing number> ...] [--preview <folder>]       (after tools/build_pid_refs.py)
With no drawing given it does the checked sheets, tools/refs_checked.json (add one there once it has been checked).
To carry on with the sheets not done yet (Oct 2026: 83 of 262 done, the list in tools/refs_checked.json):
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

def frame(g, t, gap=1.0):
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
        if (bx1 - bx0) * (by1 - by0) > 3.5 * (x1 - x0) * (y1 - y0): continue
        # a drawn box: all four sides solid straight lines (not a symbol or leader that happens to wrap the text)
        sub = g[by0:by1, bx0:bx1] < INK; e = max(2, int(s * .15))
        if min(sub[:e].any(0).mean(), sub[-e:].any(0).mean(), sub[:, :e].any(1).mean(), sub[:, -e:].any(1).mean()) < .9: continue
        area = (bx1 - bx0) * (by1 - by0)
        if not best or area < best[1]: best = ((bx0, by0, bx1, by1), area)
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
