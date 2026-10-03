"""Clears the part values that tools/build_spec.py copied down into cells merged sideways (spec/index.json).

Usage: python3 tools/spec_merged.py   (after tools/build_spec.py; reads only spec/pvs.pdf and spec/index.json)
The datasheet tables merge cells both ways. A cell merged down (AS/NZS 1252.1 covering the stud bolt, machine bolt and
nut rows) belongs to every row it covers, and build_spec fills it down. A cell merged sideways ("Galvanised, Gr. 8.8
bolts" across Type and End Preparations; the rubber lining text across four columns) belongs to the leftmost column
only, but its empty neighbours were filled from the row above too, so bolts read "Threaded, BSP" from the plugs above
them and gaskets took the nuts' material. Here each empty cell is checked against the cell outlines on the page: if the
cell to its left reaches over it, the value copied into it is removed.
"""
import json, os, re
import pymupdf
ROOT = os.path.join(os.path.dirname(__file__), "..", "spec")
IX = json.load(open(os.path.join(ROOT, "index.json")))
doc = pymupdf.open(os.path.join(ROOT, "pvs.pdf"))
FIELD = {"Dimensional Specification": "dim", "Type": "type", "End Preparations": "ends", "Material Specification": "mat"}
# (a note number reads "^12" in the index and runs into the word on the page: "Gaskets12", "Metric 7")
key = lambda s: re.sub(r"[\s‐-]+", " ", re.sub(r"\^\d{1,2}|\s\d{1,2}$|(?<=[A-Za-z)])\d{1,2}$", "", str(s or "").strip())).strip().lower()
skey = lambda s: re.sub(r"[\s^‐–-]+", "", str(s or "")).lower()   # (sizes: "OD90^3" in the index is "OD903" on the page)
cleared = 0
for code, P in IX["pipe"].items():
    blank = {}   # (description, size) → fields merged sideways
    last = ""; cols = None   # (kept from page to page: a table carried on to the next page has no header row)
    for i in range(P["page"] - 1, P["page"] - 1 + P["pages"]):
        try: ts = doc[i].find_tables().tables
        except Exception: continue
        for t in ts:
            rows, text = t.rows, t.extract()
            if cols and max(cols) >= len(t.rows[0].cells): cols = None
            for r, tx in zip(rows, text):
                tx = [re.sub(r"\s+", " ", c or "").strip() for c in tx]
                if "Description" in tx and "Size Range" in tx:
                    cols = {k: h for k, h in enumerate(tx) if h}; continue
                if not cols: continue
                dc = next(k for k, h in cols.items() if h == "Description")   # (some tables have empty spacer columns)
                d, size = tx[dc] if dc < len(tx) else "", next((tx[k] for k, h in cols.items() if h == "Size Range"), "") or last
                last = size
                if not d or d == "NOTES" or re.match(r"^\d{1,2}$", d): continue
                for k, h in cols.items():
                    if h not in FIELD or r.cells[k] is not None: continue
                    left = next((c for c in reversed(r.cells[:k]) if c is not None), None)
                    xk = next(c[0] for c in (rr.cells[k] for rr in rows) if c is not None) if any(rr.cells[k] for rr in rows) else None
                    if left and xk is not None and left[2] > xk + 1: blank.setdefault((key(d), skey(size)), set()).add(FIELD[h])
    for c in P.get("comps", []):
        for f in blank.get((key(c["d"]), skey(c["size"])), ()):
            if c.get(f): c[f] = ""; cleared += 1
# a cell merged down over two rows can come back split between them ("ASTM A53 Gr B / API 5L" over "Grade B", CL1 pipe):
# both rows get the joined text
for P in IX["pipe"].values():
    cs = P.get("comps", [])
    for a, b in zip(cs, cs[1:]):
        for f in ("type", "ends", "dim", "mat"):
            x, y = a.get(f) or "", b.get(f) or ""
            if re.search(r"(/|API 5L)\s*$", x) and re.match(r"^(Grade|Gr\.?\s)", y): a[f] = b[f] = x + " " + y; cleared += 1
json.dump(IX, open(os.path.join(ROOT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(cleared, "values cleared")
