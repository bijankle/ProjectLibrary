"""Adds the footnotes to the pipe classes in spec/index.json, read from the cleaned spec PDF (spec/pvs.pdf).

Usage: python3 tools/spec_notes.py   (after tools/build_spec.py; needs only the files in spec/)
  - a superscript note number on a datasheet ("Electrofusion Sockets" + small "10", "Elbow" + small "10" + ", 90°…")
    is written into the part's text as ^10 at the spot it sits ("Electrofusion Sockets^10", "Elbow^10, 90°…"), so
    the app can show it as a superscript; table extraction had run it into the text ("Electrofusion Sockets 10")
  - the class's numbered notes (the NOTES block, its numbers in a column left of the text) become notes: [[n, text]]
"""
import json, os, re
import pymupdf
ROOT = os.path.join(os.path.dirname(__file__), "..", "spec")
IX = json.load(open(os.path.join(ROOT, "index.json")))
doc = pymupdf.open(os.path.join(ROOT, "pvs.pdf"))
norm = lambda t: re.sub(r"\s+", " ", t.replace("\xa0", " ").replace("‐", "-")).strip()
FIELDS = ("d", "size", "dim", "type", "ends", "mat")

def sups(pages):
    """(text before, number, text after) for every small digit span on these pages"""
    out = set()
    for i in pages:
        for b in doc[i].get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                ss = l["spans"]
                if not ss: continue
                big = max(s["size"] for s in ss)
                for k, s in enumerate(ss):
                    if s["size"] < big * 0.8 and re.fullmatch(r"\s*\d{1,2}\s*", s["text"]):
                        B = norm("".join(x["text"] for x in ss[:k])); A = norm("".join(x["text"] for x in ss[k + 1:]))
                        if B: out.add((B[-30:], s["text"].strip(), A[:8]))
    return out

def notes(pages):
    """the numbered notes: a column of numbers 1, 2, 3… at the left, each note's lines to its right"""
    best = []
    for i in pages:
        p = doc[i]
        nums = sorted([w for w in p.get_text("words") if re.fullmatch(r"\d{1,2}", w[4]) and w[0] < 60], key=lambda w: w[1])
        run = []
        for w in nums:   # the longest run 1, 2, 3… down the page
            if int(w[4]) == len(run) + 1 and (not run or w[1] > run[-1][1]): run.append(w)
        if len(run) < 2: continue
        x0 = max(w[2] for w in run); top, bot = run[0][1] - 30, run[-1][3] + 14   # the notes only, not the chart under them
        lines = []
        for b in p.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                t = norm("".join(s["text"] for s in l["spans"]))
                x, y0, _, y1 = l["bbox"]
                if t and x0 + 2 < x < x0 + 40 and top < y0 < bot: lines.append(((y0 + y1) / 2, y0, t))
        lines.sort()
        # a note's number sits level with the middle of its lines: split the lines (in order) into one run per number so
        # that each run's middle is as close as it can be to its number (a small dynamic programme)
        L, K = len(lines), len(run)
        if L < K: continue
        mid = [(w[1] + w[3]) / 2 for w in run]
        cost = lambda k, i, j: abs((lines[i][1] + lines[j - 1][1] + (lines[j - 1][0] - lines[j - 1][1]) * 2) / 2 - mid[k])
        INF = float("inf"); D = [[INF] * (L + 1) for _ in range(K + 1)]; W = [[0] * (L + 1) for _ in range(K + 1)]; D[0][0] = 0
        for k in range(1, K + 1):
            for j in range(k, L + 1):
                for i in range(k - 1, j):
                    v = D[k - 1][i] + cost(k - 1, i, j)
                    if v < D[k][j]: D[k][j] = v; W[k][j] = i
        got, j = {}, L
        for k in range(K, 0, -1): i = W[k][j]; got[k] = [t for _, _, t in lines[i:j]]; j = i
        res = [[str(n), " ".join(v)] for n, v in sorted(got.items()) if v]
        if len(res) > len(best): best = res
    return best

tot_s = tot_n = 0
for code, P in IX["pipe"].items():
    pages = range(P["page"] - 1, P["page"] - 1 + P["pages"])
    S = sorted(sups(pages), key=lambda x: -len(x[0]))
    for c in P.get("comps", []):
        for f in FIELDS:
            v = c.get(f)
            if not v or "^" in v: continue
            for B, n, A in S:
                pat = re.escape(B) + r"\s?" + n + (r"(?=\s?" + re.escape(A) + ")" if A else r"(?=\s|$)")
                w = re.sub(pat, lambda m: B + "^" + n, v)
                if w != v: v = w; tot_s += 1
            c[f] = v
    N = notes(pages)
    if N: P["notes"] = N; tot_n += len(N)
json.dump(IX, open(os.path.join(ROOT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(tot_s, "superscripts marked,", tot_n, "notes over", sum(1 for P in IX["pipe"].values() if P.get("notes")), "of", len(IX["pipe"]), "classes")
