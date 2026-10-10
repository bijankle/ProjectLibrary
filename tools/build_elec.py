"""Electrical lists (inbox/electrical, the PDFs of the project's electrical equipment lists, load lists, MCC schedules
and cable schedules) read into records: tools/elec_rows.json, used by tools/build_elec_data.py.

  python3 tools/build_elec.py

Every table row under a recognised header is kept with its document, revision, issue date and page. Headers are read
from one or two header rows (the second row's "Equip. Number" under the first row's "From" becomes "From Equip. Number").
Rows that a PDF packs into one cell (a column of values per cell, one per line) are split back into rows.
The Borefield (N02) lists are left out for now.
"""
import glob, json, os, re, sys, datetime
import pymupdf
pymupdf.TOOLS.mupdf_display_errors(False)
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# the raw inputs (the register, inbox/) live in the private repository, cloned beside this one (or KCGM_PRIVATE)
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
WORDS = re.compile(r"\b(cable|equip|equipment|from|to|location|conductor|insulation|cores?|length|installation|supplied|installed|"
                   r"nameplate|name plate|voltage|load|mcc|module|description|manufacturer|model|make|qty|rev|status|kw|type|fed)\b", re.I)
def norm(c): return re.sub(r"[ \t]+", " ", (c or "").replace("Ɵ", "ti")).strip()
def flat(c): return re.sub(r"\s+", " ", c).strip()
def is_header(r):
    cells = [flat(c) for c in r if c and flat(c)]
    if len(cells) < 3: return False
    if not any(re.search(r"equip|cable|tag|number|\bno\.", c, re.I) for c in cells): return False
    TAGV = re.compile(r"\b[A-Z]{0,2}\d{2,3}-?[A-Z]{2,4}-?\d{3}|^[\d.]+$|^\d")
    if any(re.fullmatch(r"(equip(ment|\.)? ?(number|no\.?)|cable (number|no\.?|tag))", c, re.I) for c in cells) and \
       sum(1 for c in cells if re.search(r"[A-Za-z]{3}", c) and not TAGV.search(c)) >= len(cells) * 0.7: return True
    hits = sum(1 for c in cells if len(c) < 70 and WORDS.search(c) and not re.search(r"\b[A-Z]{0,2}\d{2,3}-?[A-Z]{2,4}-?\d{3}|^[\d.]+$", c))
    return hits >= max(3, len(cells) * 0.5)
def merge(h1, h2):
    out, grp = [], ""
    for a, b in zip(h1, h2 + [""] * (len(h1) - len(h2))):
        a, b = flat(a or ""), flat(b or "")
        if a: grp = a if re.fullmatch(r"(from|to)", a, re.I) else ""
        if b: out.append((grp + " " + b).strip() if grp else (b if not a or re.fullmatch(r"(from|to)", a, re.I) else (a + " " + b if len(a) < 25 and a.lower() not in b.lower() else b)))
        else: out.append(a)
    return out
MON = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
def issue_date(doc):
    ds = []
    for p in list(doc)[:2]:
        t = p.get_text()
        for d, m, y in re.findall(r"\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b", t):
            try: ds.append(datetime.date(int(y), int(m), int(d)))
            except ValueError: pass
        for d, m, y in re.findall(r"\b(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{2,4})\b", t):
            try: ds.append(datetime.date(int(y) + (2000 if len(y) == 2 else 0), MON[m.upper()], int(d)))
            except (ValueError, KeyError): pass
        for y, m, d in re.findall(r"\b(20\d{2})-(\d{2})-(\d{2})\b", t):
            try: ds.append(datetime.date(int(y), int(m), int(d)))
            except ValueError: pass
    ds = [x for x in ds if datetime.date(2023, 1, 1) <= x <= datetime.date.today()]
    return max(ds).isoformat() if ds else ""
out, docs = [], {}
for f in sorted(glob.glob(os.path.join(RP, "inbox", "electrical", "*LST*.pdf"))):
    m = re.match(r"(2000-([A-Z0-9]+)-LST-EL-(\d+))_([A-Z0-9]+)", os.path.basename(f))
    if not m or m.group(2) == "N02": continue
    num, rev = m.group(1), m.group(4)
    d = pymupdf.open(f)
    title = next((flat(l) for l in d[0].get_text().split("\n") if re.search(r"(LIST|SCHEDULE)", l, re.I) and 8 < len(l) < 120), "Electrical list")
    docs[num] = {"rev": rev, "date": issue_date(d), "title": title, "file": os.path.relpath(f, R), "pages": d.page_count}
    hdr = None
    for pi, pg in enumerate(d):
        for t in pg.find_tables().tables:
            rows = [[norm(c) for c in r] for r in t.extract()]
            i = 0
            while i < len(rows):
                r = rows[i]
                if is_header(r):
                    h = [flat(c) for c in r]
                    if i + 1 < len(rows) and is_header(rows[i + 1]): h = merge(r, rows[i + 1]); i += 1
                    hdr = h; i += 1; continue
                if hdr and any(r):
                    cells = r + [""] * (len(hdr) - len(r))
                    lines = [c.split("\n") for c in cells]
                    k = len(lines[0]) if lines else 1
                    multi = k > 2 and sum(1 for L in lines if len(L) == k) >= 3
                    for j in range(k if multi else 1):
                        vals = [(L[j] if multi and len(L) == k else (c if not multi else "")) for L, c in zip(lines, cells)]
                        rec = {}
                        for hh, v in zip(hdr, vals):
                            v = flat(v)
                            if v and hh: rec.setdefault(hh, v)
                        if len(rec) >= 2: out.append({"doc": num, "pg": pi + 1, "r": rec})
                i += 1
json.dump({"docs": docs, "rows": out}, open(os.path.join(R, "tools", "elec_rows.json"), "w"), ensure_ascii=False)
print(len(docs), "lists,", len(out), "rows")
