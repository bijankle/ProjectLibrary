"""Reads each pipe class's branch chart and its piping standard reference into spec/index.json (the Fittings table in spec.js).

Usage: python3 tools/spec_branch.py   (after tools/build_spec.py and tools/spec_notes.py; reads only spec/pvs.pdf)
The chart on a class's datasheet is a triangle: header (run) sizes along the bottom, branch sizes up the side, and in each
cell the fitting code for that pair (ET equal tee, RT reducing tee, SO sockolet, TO threadolet, WO weldolet...), named in
the chart's own legend. Stored per class as branch: {codes: {code: name}, g: {header DN: {branch DN: code}}}, sizes as
written ("125*" is a non preferred size, kept with its star). The legend's own codes sit in the empty top right of the
triangle, so a cell counts only where the branch is no bigger than the header.
A class whose chart is left blank with "Refer to Piping Standard Drawing 2000-F00-STD-PP-xxxxx" gets std: that number.
"""
import json, os, re
import pymupdf
ROOT = os.path.join(os.path.dirname(__file__), "..", "spec")
IX = json.load(open(os.path.join(ROOT, "index.json")))
doc = pymupdf.open(os.path.join(ROOT, "pvs.pdf"))
NUM = re.compile(r"\d{2,4}\*?$"); CODE = re.compile(r"[A-Z]{2,3}(\+[A-Z]{2,3})?$")   # (ET, RT+RED)
n = lambda s: float(s.rstrip("*"))
done = 0
for cls, P in IX["pipe"].items():
    P.pop("branch", None); P.pop("std", None)
    for i in range(P["page"] - 1, P["page"] - 1 + P["pages"]):
        page = doc[i]; W = page.get_text("words")
        title = [w for w in W if w[4] == "CHART"]
        if not title: continue
        m = re.search(r"2000-F00-STD-PP-\d{5}", page.get_text().replace("‐", "-"))
        if m: P["std"] = m.group(0)
        top = title[0][1]
        ws = [w for w in W if w[1] > top - 2]
        nums = [w for w in ws if NUM.match(w[4])]
        if not nums: continue
        # the header sizes: the lowest row holding at least five numbers (a stray note number under the chart is not
        # it); the branch sizes: the numbers left of the first header size
        hdr, br = [], []
        for y in sorted({round(w[1]) for w in nums}, reverse=True):
            row = [w for w in nums if abs(w[1] - y) < 3]
            if len(row) >= 5: hdr = row; break
        # a cell reading "Note 7" (see that note) becomes one code
        ws = list(ws)
        for k, w in enumerate(ws):
            if w[4] == "Note" and k + 1 < len(ws) and re.fullmatch(r"\d{1,2}", ws[k + 1][4]) and abs(ws[k + 1][1] - w[1]) < 2:
                ws[k] = (w[0], w[1], ws[k + 1][2], w[3], "Note " + ws[k + 1][4]); ws[k + 1] = (0, 0, 0, 0, "")
        if not hdr:
            # no header row printed (PE16): the chart is square, so the header sizes are the branch sizes, largest on
            # the left, one per column of cells (the equal tees run down its diagonal)
            first = min(nums, key=lambda w: w[0]); br = [w for w in nums if abs(w[0] - first[0]) < 6]
            cells = sorted({round((w[0] + w[2]) / 2 / 3) * 3 for w in ws if (CODE.match(w[4]) or w[4].startswith("Note ")) and w[0] > first[2]})
            xs = []
            for x in cells:
                if not xs or x - xs[-1] > 8: xs.append(x)
            sizes = sorted((w[4] for w in br), key=n, reverse=True)
            if len(xs) != len(sizes): continue
            ymax = max(w[3] for w in ws if w[4]) + 10
            hdr = [(x - 4, ymax, x + 4, ymax + 5, sz) for x, sz in zip(xs, sizes)]
        ymax = sum(w[1] for w in hdr) / len(hdr); x0 = min(w[0] for w in hdr)
        if not br or hdr[0][1] != ymax: br = [w for w in nums if w[2] < x0 - 2 and w[1] < ymax - 3]
        xmin = min([w[0] for w in br] or [0])
        if len(hdr) < 3 or len(br) < 3: continue
        # legend: a code with its name to the right on the same line, inside the box headed LEGEND
        leg = [w for w in ws if w[4].upper() == "LEGEND"]; codes = {}
        if leg:
            L = leg[0]
            for w in ws:
                if CODE.match(w[4]) and w[1] > L[1] + 2 and w[1] < L[1] + 120 and abs(w[0] - L[0]) < 40:
                    # (some legends print their text twice or three times over: each word once, in order; a note
                    # number after the name dropped)
                    words = []
                    for v in sorted(ws, key=lambda v: v[0]):
                        if abs((v[1] + v[3]) / 2 - (w[1] + w[3]) / 2) < 3 and w[2] < v[0] < w[2] + 170 and v[4] not in words: words.append(v[4])
                    name = re.sub(r"\s+\d{1,2}$", "", " ".join(words)).replace("Connection Conn.", "Conn.").strip()
                    if name and w[4] not in codes: codes[w[4]] = name
        g = {}
        for w in ws:
            if not (w[4].startswith("Note ") or CODE.match(w[4]) and (not codes or w[4] in codes)): continue
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            if cy > ymax - 1 or cx < xmin + 5: continue
            h = min(hdr, key=lambda v: abs((v[0] + v[2]) / 2 - cx)); b = min(br, key=lambda v: abs((v[1] + v[3]) / 2 - cy))
            if abs((h[0] + h[2]) / 2 - cx) > 15 or abs((b[1] + b[3]) / 2 - cy) > 6 or n(b[4]) > n(h[4]): continue
            g.setdefault(h[4], {})[b[4]] = w[4]
        if g: P["branch"] = {"codes": codes, "g": g}; done += 1
json.dump(IX, open(os.path.join(ROOT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(done, "branch charts;", [c for c, P in IX["pipe"].items() if P.get("std")], "refer to a standard drawing")
for c, P in IX["pipe"].items():
    if "branch" in P: print(c, P["branch"]["codes"], sum(len(v) for v in P["branch"]["g"].values()), "cells")
