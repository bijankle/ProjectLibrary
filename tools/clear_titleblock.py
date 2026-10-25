"""Electrical drawings (SLDs, TLDs, schematics, block diagrams): the title block band along the foot of the sheet
(references, revisions, signatures, logos, project box) is cleared to plain white, the bottom right box (where the
drawing number and title always sit) keeps its outline, and the drawing number with its revision and the drawing's
short title are printed in that box. The P&IDs and PFDs had their title block cropped off already.

  python3 tools/clear_titleblock.py [--dry] [--out DIR] [files…]   (default: every SLD/TLD/SCM/BLK in PIDs/index.json)

Found on each sheet from its own lines: the band is between the two long horizontal lines nearest the foot of the
frame (the drawing area's lower edge and the frame's foot); the box is the band's part right of the last full height
vertical line left of the drawing number (or the TITLE / PROJECT labels). Text under the band is removed with the
lines (true redaction, so nothing hidden is left to find). Marked "tbclear" in the PDF keywords; a rerun skips it.
Run after tools/build_contents.py has read the reference tables (contents.json keeps them).
"""
import json, os, re, sys
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
nk = lambda s: re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
TAGX = re.compile(r"\b[A-Z]?\d{2,3}-[A-Z]{2,4}-\d")
def short(t):   # the title without the area (WBS) name in front (as pid.js short)
    a = (t or "").split(" - ")
    if len(a) < 2: return t or ""
    a.pop(0)
    while len(a) > 1 and not TAGX.search(a[0]) and any(TAGX.search(x) for x in a[1:]): a.pop(0)
    r = " - ".join(a); return r[:1].upper() + r[1:]

def find(p, num):
    W, H = p.rect.width, p.rect.height
    hs, vs = [], []
    for dr in p.get_drawings():
        for it in dr["items"]:
            if it[0] == "l": segs = [(it[1], it[2])]
            elif it[0] == "re": r = it[1]; segs = [(r.tl, r.tr), (r.bl, r.br), (r.tl, r.bl), (r.tr, r.br)]
            else: continue
            for a, b in segs:
                if abs(a.y - b.y) < .6 and abs(a.x - b.x) > W * .55 and a.y > H * .55: hs.append((a.y, min(a.x, b.x), max(a.x, b.x)))
                elif abs(a.x - b.x) < .6 and abs(a.y - b.y) > 15 and max(a.y, b.y) > H * .6: vs.append((a.x, min(a.y, b.y), max(a.y, b.y)))
    if len(hs) < 2: return None
    hs.sort(); foot = hs[-1]
    # the drawing area's lower edge: the long line above the foot leaving a band 5% to 20% of the sheet height
    tops = [h for h in hs if H * .025 < foot[0] - h[0] < H * .22]
    if not tops: return None
    tops = [h for h in tops if H * .025 < foot[0] - h[0] < H * .15]
    if not tops: return None
    top = min(tops, key=lambda h: h[0])   # (the band's top: the highest long line, the rows inside the block lie below it)
    y0, y1, x0, x1 = top[0], foot[0], max(top[1], foot[1]), min(top[2], foot[2])
    words = [w for w in p.get_text("words") if y0 < (w[1] + w[3]) / 2 < y1 and x0 < w[0] < x1]
    # (the number in the right half only: the reference table at the left can list the sheet itself)
    me = [w for w in words if w[0] > x0 + (x1 - x0) * .5 and (nk(num) in nk(w[4]) or (len(nk(w[4])) > 8 and nk(w[4]) in nk(num)))]
    lab = [w for w in words if re.match(r"^(TITLE|PROJECT|DRG|DRAWING)\b", w[4].upper()) and w[0] > x0 + (x1 - x0) * .4]
    # (the TITLE: / PROJECT: labels count only with no number to go by: "PRIMERO PROJECT NUMBER" sits further left)
    lab2 = [w for w in lab if w[4].endswith(":")] or lab
    anchor = min([w[0] for w in me], default=None) if me else min([w[0] for w in lab2], default=None)
    if me and lab2: anchor = min([w[0] for w in lab2 if w[0] > anchor - (x1 - x0) * .25] + [anchor])
    # (a division drawn in pieces, one per row of the block, counts as one line: pieces on one x joined end to end)
    byx = {}
    for x, a0, a1 in vs:
        if x0 + 5 < x < x1 - 5: byx.setdefault(round(x), []).append((max(a0, y0), min(a1, y1)))
    full = []
    for x, segs in byx.items():
        segs.sort(); reach = y0
        for a0, a1 in segs:
            if a0 <= reach + 3: reach = max(reach, a1)
        if segs[0][0] <= y0 + 3 and reach >= y1 - 3: full.append(x)
    full.sort()
    bw = x1 - x0; ok = lambda x: bw * .12 <= x1 - x <= bw * .5
    left = [x for x in full if anchor is not None and x < anchor - 2 and ok(x)]
    if left: bx = left[-1]
    else:   # (no number or label to go by: the full height division nearest a quarter of the band from its right end)
        c = [x for x in full if ok(x)]
        if not c: return None
        bx = min(c, key=lambda x: abs(x1 - x - bw * .27))
    return pymupdf.Rect(x0, y0, x1, y1), pymupdf.Rect(bx, y0, x1, y1), bool(left)

def find_px(p):
    """a scanned sheet (no drawn lines to go by): the same band and box found in its picture. A ruled line is a row of
    the picture dark from frame to frame; a division a column dark for nearly the band's whole height"""
    import numpy as np
    W, H = p.rect.width, p.rect.height; z = 2000 / W
    pix = p.get_pixmap(matrix=pymupdf.Matrix(z, z), colorspace=pymupdf.csGRAY)
    a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w) < 235   # (grey lines count: many sheets are drawn light)
    def runs(idx):   # neighbouring rows / columns as one line, at its middle
        out, g = [], []
        for i in idx:
            if g and i > g[-1] + 2: out.append(sum(g) / len(g)); g = []
            g.append(i)
        if g: out.append(sum(g) / len(g))
        return out
    lo = int(pix.h * .55); fr = a[lo:].mean(axis=1)
    hs = [int(lo + y) for y in runs([i for i, v in enumerate(fr) if v > .4]) if lo + y < pix.h - 4]   # (not the page's own edge)
    if len(hs) < 2: return None
    # (the frame's foot, the lowest ruled line; the band's top a line unbroken across the same width: wires stop short)
    foot = hs[-1]; fx = np.nonzero(a[foot - 1:foot + 2].any(axis=0))[0]
    if not len(fx): return None
    fx0, fx1 = int(fx.min()), int(fx.max())
    whole = lambda y: a[y - 1:y + 2, fx0:fx1 + 1].any(axis=0).mean() > .93
    tops = [y for y in hs if pix.h * .025 < foot - y < pix.h * .15 and whole(y)]
    if not tops: return None
    top = min(tops); y0, y1 = int(top), int(foot)
    xs =np.nonzero(a[int(top)] | a[int(top) + 1] | a[int(top) - 1])[0]
    x0, x1 = (int(xs.min()), int(xs.max())) if len(xs) else (0, pix.w - 1)
    col = a[y0 + 3:y1 - 2, :].mean(axis=0)
    full = [x for x in runs([i for i, v in enumerate(col) if v > .9]) if x0 + 5 < x < x1 - 5]
    bw = x1 - x0; ok = lambda x: bw * .12 <= x1 - x <= bw * .5
    c = [x for x in full if ok(x)]
    bx = min(c, key=lambda x: abs(x1 - x - bw * .27)) if c else x1 - bw * .27
    s = 1 / z
    return pymupdf.Rect(x0 * s, y0 * s, x1 * s, y1 * s), pymupdf.Rect(bx * s, y0 * s, x1 * s, y1 * s), False

def clear(path, num, rev, title, out=None):
    d = pymupdf.open(path); p = d[0]
    if p.rotation: return "rotated"
    f = find(p, num) or find_px(p)
    if not f: return "no band"
    # (the signing service's envelope number printed above the frame goes too)
    for w in p.search_for("Docusign Envelope ID") + p.search_for("DocuSign Envelope ID"): p.add_redact_annot(pymupdf.Rect(0, w.y0 - 2, p.rect.width * .5, w.y1 + 2), fill=(1, 1, 1))
    band, box, _ = f
    lw = 1.2
    inner = pymupdf.Rect(band.x0 + lw, band.y0 + lw, band.x1 - lw, band.y1 - lw)
    p.add_redact_annot(inner, fill=(1, 1, 1))
    p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    # the box's left edge, drawn again (the redaction painted over it)
    sh = p.new_shape(); sh.draw_line((box.x0, band.y0), (box.x0, band.y1)); sh.finish(color=(0, 0, 0), width=1.4); sh.commit()
    # number_rev (large) and the short title under it, centred in the box, as big as fits
    lab = num + (f"_Rev{rev}" if rev else ""); t = short(title)
    pad = box.height * .08; w = box.width - 2 * pad
    fs1 = min(box.height * .28, .94 * w / (pymupdf.get_text_length(lab, "hebo", 1) or 1))
    L = lambda t, f, fs: pymupdf.get_text_length(t, f, fs)
    def wrap(t, fs):   # the title's words in lines no wider than the box
        out = [""]
        for wd in t.split():
            tr = (out[-1] + " " + wd).strip()
            if L(tr, "helv", fs) <= w or not out[-1]: out[-1] = tr
            else: out.append(wd)
        return out
    room = box.height - 2 * pad - fs1 * 1.25
    fs2 = min(fs1 * .62, room / 1.2)
    while fs2 > 4 and (len(wrap(t, fs2)) * fs2 * 1.2 > room or max(L(x, "helv", fs2) for x in wrap(t, fs2)) > w): fs2 *= .93
    lines = wrap(t, fs2)
    # the block (number, then the title lines) centred up and down in the box, each line centred across it
    tot = fs1 * 1.25 + len(lines) * fs2 * 1.2; y = box.y0 + (box.height - tot) / 2 + fs1
    cx = (box.x0 + box.x1) / 2
    p.insert_text((cx - L(lab, "hebo", fs1) / 2, y), lab, fontname="hebo", fontsize=fs1)
    y += fs1 * .25
    for ln in lines:
        y += fs2 * 1.2; p.insert_text((cx - L(ln, "helv", fs2) / 2, y - fs2 * .2), ln, fontname="helv", fontsize=fs2)
    md = d.metadata or {}; md["keywords"] = ((md.get("keywords") or "") + " tbclear").strip(); d.set_metadata(md)
    tgt = os.path.join(out, os.path.basename(path)) if out else path
    if out: d.save(tgt, garbage=3, deflate=True)
    else: d.saveIncr()
    return "ok"

if __name__ == "__main__":
    a = sys.argv[1:]; dry = "--dry" in a; out = None
    if "--out" in a: out = a[a.index("--out") + 1]; a = [x for x in a if x != out]
    a = [x for x in a if not x.startswith("--")]
    ix = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
    todo = [(k, v) for k, v in ix.items() if re.search(r"-(SLD|TLD|SCM|BLK)-", k)]
    if a: todo = [(k, v) for k, v in todo if k in a or os.path.basename(v["file"]) in [os.path.basename(x) for x in a]]
    from collections import Counter; c = Counter()
    for k, v in todo:
        path = os.path.join(R, v["file"])
        if "tbclear" in (pymupdf.open(path).metadata.get("keywords") or ""): c["done before"] += 1; continue
        if dry:
            f = find(pymupdf.open(path)[0], k); s = "no band" if not f else "ok" if f[2] else "ok (box guessed)"
        else: s = clear(path, k, v.get("rev"), v.get("title"), out)
        c[s] += 1
        if s not in ("ok",): print(s, k)
    print(dict(c))
    # (the app leaves its own corner label off a cleared sheet: the number and title are printed on it now)
    if not dry and not out:
        d = json.load(open(os.path.join(R, "PIDs", "index.json")))
        for k, v in d["pids"].items():
            f = os.path.join(R, v["file"])
            if re.search(r"-(SLD|TLD|SCM|BLK)-", k) and os.path.exists(f) and "tbclear" in (pymupdf.open(f).metadata.get("keywords") or ""): v["tb"] = 1
        json.dump(d, open(os.path.join(R, "PIDs", "index.json"), "w"), indent=1, ensure_ascii=False)
