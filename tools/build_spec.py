"""Builds the pipe and valve spec for the app from the Piping Materials and Valves Specification
(2000-F00-STS-PP-10001): a cleaned copy of the PDF for the in-app viewer and an index of its datasheets.

Usage: python3 tools/build_spec.py <spec pdf>   (the original stays out of the repo; only the cleaned copy is published)
Output:
  spec/pvs.pdf     the spec without its cover page, with the people's names on the revision / sign off blocks blacked out
                   and the file properties cleared (page n of this file = page n + 1 of the original)
  spec/index.json  {meta, pipe: {class: datasheet}, valve: {code: datasheet}, services: [fluid services rows]}
    pipe datasheet  : page, pages, title, material, codes, design (life / temperature / pressure rows), ca, test, nde,
                      comps [{d, size, dim, type, ends, mat}] (merged cells filled down), notes
    valve datasheet : page, title, rows [[item, value]], notes
"""
import json, os, re, sys
import pymupdf
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "spec")
os.makedirs(OUT, exist_ok=True)
doc = pymupdf.open(SRC)
clean = lambda c: re.sub(r"\s+", " ", str(c).replace("\xa0", " ")).replace("‐", "-").replace("DSH-PP- ", "DSH-PP-").strip() if c is not None else None
SKIP_ROW = re.compile(r"^(Date|Datasheet Title|Document Number|Primero Project Number|Piping System Datasheet|Valve Datasheet)\b", re.I)
DATE = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$")

def tables(i):
    try: return [[[clean(c) for c in r] for r in t.extract()] for t in doc[i].find_tables().tables]
    except Exception: return []

# ---------- people's names on revision and sign off blocks ----------
NAMES = set()
def add_names(rows):
    for r in rows:
        v = [c for c in r if c]
        if len(v) >= 5 and DATE.match(v[0]) and re.match(r"^[0-9A-Z]{1,2}$", v[1]):
            for c in v[3:6]:
                if re.match(r"^[A-Z][a-z]?\.? ?[A-Z][A-Za-z'\- ]+$", c) and len(c) < 30: NAMES.add(c)
for i in range(len(doc)):
    for t in tables(i): add_names(t)
cover = doc[0].get_text()
for n in re.findall(r"\n([A-Z] [A-Z][a-zA-Z'\-]+(?: [A-Z][a-zA-Z'\-]+)?) *\n", cover): NAMES.add(n.strip())
for n in (doc.metadata or {}).get("author", "").split(";"):
    if n.strip(): NAMES.add(n.strip())

# ---------- datasheets ----------
# every datasheet code listed in section 3.2 (tables 3-11 and 3-12)
TOC = " ".join(doc[i].get_text() for i in range(8, 16)).replace("‐", "-").replace("\xa0", " ")
KNOWN = set(re.findall(r"2000-F00-DSH-PP-([A-Z][A-Z0-9.]+)", TOC))
APP_A = next(i for i in range(len(doc)) if re.search(r"APPENDIX A", doc[i].get_text()) and len(doc[i].get_text()) < 400)   # datasheets start after this page
pipe, valve, cur = {}, {}, None
def meta_rows(rows):
    return [r for r in rows if any(r)]
for i in range(APP_A + 1, len(doc)):
    ts = tables(i)
    code = None
    for t in ts:
        for r in t:
            v = [c for c in r if c]
            if len(v) >= 2 and v[0].startswith("Document Number"):
                m = re.search(r"2000-F00-DSH-PP-([A-Z][A-Z0-9.]*)", v[1]); code = m and m.group(1)
    if not code or code not in KNOWN:   # e.g. an attached drawing number: take the datasheet code named on the page
        found = [c for c in re.findall(r"2000.F00.DSH.PP.\s*([A-Z][A-Z0-9.]*)", doc[i].get_text().replace("‐", "-").replace("\xa0", " ")) if c in KNOWN]
        code = found[0] if found else None
    if code:
        kind = "valve" if code.startswith("V") and not re.match(r"^V\d", code) else "pipe"
        store = valve if kind == "valve" else pipe
        if code in store: store[code]["pages"] += 1; cur = (kind, code); continue
        store[code] = {"page": i, "pages": 1}; cur = (kind, code)
    elif cur and cur[0] == "pipe" and i > 40 and ts:
        pipe[cur[1]]["pages"] += 1
    else:
        if i > 97: cur = None
        continue
    kind, code = cur; d = (valve if kind == "valve" else pipe)[code]
    for t in ts:
        width = max(len(r) for r in t)
        above = [None] * width; in_comp = False; in_notes = False
        for r in t:
            v = [c for c in r if c]
            if not v or SKIP_ROW.match(v[0]) or DATE.match(v[0]): continue
            if kind == "pipe":
                if v[0] == code and len(v) > 1 and "title" not in d: d["title"] = v[1]; continue
                key = v[0].rstrip(" :0123456789").rstrip(" :")
                if key in ("Material", "Design Codes", "Corrosion Allowance (mm)", "Pressure Testing", "Non-Destructive Testing") and len(v) > 1:
                    d[{"Material": "material", "Design Codes": "codes", "Corrosion Allowance (mm)": "ca", "Pressure Testing": "test", "Non-Destructive Testing": "nde"}[key]] = v[1]; continue
                if key.startswith(("Design Life", "Design Temperature", "Design Pressure")):
                    d.setdefault("design", []).append([re.sub(r"\s*\d$", "", v[0].rstrip(" :")).rstrip(" 1:").strip()] + v[1:]); continue
                if v[0] == "Description" and "Size Range" in v: in_comp = True; hdr = r; continue
                if v[0] == "NOTES": in_notes = True; in_comp = False; continue
                if in_notes:
                    if len(v) >= 2 and re.match(r"^\d{1,2}$", v[0]): d.setdefault("notes", []).append([v[0], " ".join(v[1:])])
                    continue
                if in_comp:
                    # merged cells come back empty: take them from the row above
                    full = [r[k] if k < len(r) and r[k] else above[k] for k in range(width)]
                    above = full
                    cols = {h: k for k, h in enumerate(hdr) if h}
                    g = lambda h: full[cols[h]] if h in cols and cols[h] < width else ""
                    row = {"d": g("Description"), "size": g("Size Range"), "dim": g("Dimensional Specification"), "type": g("Type"), "ends": g("End Preparations"), "mat": g("Material Specification")}
                    if row["d"] and row["size"]: d.setdefault("comps", []).append(row)
            else:
                if v[0] == code and len(v) > 1 and "title" not in d: d["title"] = v[1]; continue
                if v[0] == "Item": continue
                if v[0] == "NOTES": in_notes = True; continue
                if in_notes:
                    if len(v) >= 2 and re.match(r"^\d{1,2}$", v[0]) and not v[1].startswith("Data "): d.setdefault("notes", []).append([v[0], v[1]])
                    continue
                if len(v) >= 2 and not re.match(r"^\d$", v[1]): d.setdefault("rows", []).append([v[0], v[1]])
# titles from the lists in section 3.2 for any datasheet whose own title row wasn't found
toc = " ".join(doc[i].get_text() for i in range(9, 16)).replace("‐", "-")
for code, (m) in [(m.group(1), m) for m in re.finditer(r"2000-F00-DSH-PP-([A-Z0-9.]+)\s*\n", toc)]:
    pass
for store in (pipe, valve):
    for code, d in store.items():
        if "title" not in d:
            m = re.search(r"2000-F00-DSH-PP-" + re.escape(code) + r"\s*\n(.+?)(?=\n2000-F00-DSH|\nTable)", toc, re.S)
            if m: d["title"] = re.sub(r"\s+", " ", m.group(1)).strip()
        # page numbers of the cleaned file (cover page removed)
        d["page"] = d["page"]

# ---------- fluid services table (section 4) ----------
# columns found from the header row; merged cells (None) repeat the value above
services = []
COLS = {"Fluid Code": "code", "Fluid Service": "service", "Fluid Design": "fluid", "Piping System": "sys", "External": "ext", "Gasket": "gasket", "Notes": "notes", "Permissible Valves": "valves"}
for i in range(15, 26):
    for t in doc[i].find_tables().tables:
        raw = [[clean(c) for c in r] for r in t.extract()]
        if not raw or "Fluid Code" not in raw[0]: continue
        idx = {}
        for k, h in enumerate(raw[0]):
            if h in COLS:
                key = COLS[h]
                if key == "sys" and "sys" in idx: key = "rating"
                idx.setdefault(key, k)
        # some headings sit one column right of their data: use the first column that holds data at or just before the heading
        data = raw[3:]
        used = lambda k: any(k < len(r) and r[k] for r in data)
        for key in ("fluid", "rating", "ext"):
            if key in idx and not used(idx[key]):
                for k in (idx[key] - 1, idx[key] - 2, idx[key] + 1):
                    if 0 <= k and used(k) and k not in idx.values(): idx[key] = k; break
        above = {}
        for r in raw[3:]:
            row = {}
            for key, k in idx.items():
                v = r[k] if k < len(r) else None
                row[key] = v if v is not None else (above.get(key, "") if key in ("code", "service", "fluid") else "")
            above = row
            if row.get("sys") and row["sys"] != "N/A": services.append(row)

# ---------- size ranges as numbers ----------
# "DN50 3 – 600" (3 is a footnote), "OD20 - OD63", "DN15 to DN50", "OD450 – 900": lo / hi in mm (DN or OD as written)
def rng(txt):
    t = re.sub(r"(?<=\d) \d{1,2}\b(?=\s*(?:[–-]|to|$))", "", txt or "")
    m = re.search(r"(DN|OD)?\s*(\d+(?:\.\d+)?)(?:\s*(?:[–-]|to)\s*(?:DN|OD)?\s*(\d+(?:\.\d+)?))?", t)
    if not m: return None
    lo = float(m.group(2)); hi = float(m.group(3)) if m.group(3) else lo
    return [m.group(1) or "", lo, hi]
for d in pipe.values():
    for c in d.get("comps", []):
        r = rng(c["size"])
        if r: c["u"], c["lo"], c["hi"] = r
for d in valve.values():
    for k, v in d.get("rows", []):
        if k.lower().startswith("size range"):
            r = rng(v)
            if r: d["u"], d["lo"], d["hi"] = r

# ---------- cleaned PDF ----------
out = pymupdf.open(SRC)
out.delete_page(0)
hits = 0
for p in out:
    for n in NAMES:
        for r in p.search_for(n):
            p.add_redact_annot(r, fill=(0, 0, 0)); hits += 1
    p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
out.set_metadata({"title": "Piping Materials and Valves Specification 2000-F00-STS-PP-10001 Rev 3 (names removed)", "author": "", "subject": "KCGM Growth Project", "keywords": "", "creator": "", "producer": ""})
out.del_xml_metadata()
out.save(os.path.join(OUT, "pvs.pdf"), garbage=4, deflate=True, clean=True)

meta = {"doc": "2000-F00-STS-PP-10001", "title": "Piping Materials and Valves Specification", "rev": "3", "file": "spec/pvs.pdf",
        "pages": len(out), "note": "Cover page removed and people's names blacked out; page numbers here are pages of spec/pvs.pdf."}
for store in (pipe, valve):
    for d in store.values(): d["page"] -= 0   # already 0-based original index = 1-based page of the file without its cover
json.dump({"meta": meta, "pipe": pipe, "valve": valve, "services": services}, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(len(pipe), "piping classes,", len(valve), "valve datasheets,", len(services), "fluid service rows,", len(NAMES), "names,", hits, "name marks blacked out,",
      round(os.path.getsize(os.path.join(OUT, "pvs.pdf")) / 1e6, 1), "MB")
