"""The Instrument List's Rev 2 (As Built for SP1, 7 Sep 2026) came as a PDF only (inbox/lists in the private repository),
while the app's instrument records were built from the Rev 1 workbook (tools/build_search.py). This reads the PDF's
master table (Rev, tag, description, P&ID, type, process fluid, process connection, units, make, model, supplied by,
installed by, remote IO panel, emergency power, comments) and brings it into the app:
  search-data.json  each instrument's fields that the PDF carries take the Rev 2 values (the rest, e.g. loop number,
                    stage, package, valve size, stay as Rev 1 had them); tags new in Rev 2 are added
  sources/ins.xlsx, sources/ins/, sources/index.json   the Sources copy becomes the Rev 2 table
  tools/doc_revs.json   the list's revision, date and status
  python3 tools/ins_rev2.py [pdf]     (then tools/checks_auto.py, tools/build_offline.py)
"""
import json, os, re, sys, glob
import pymupdf, openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from sanitize import clean
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
pdf = sys.argv[1] if len(sys.argv) > 1 else glob.glob(os.path.join(RP, "inbox", "lists", "2000-F00-LST-IC-11011_2*.pdf"))[0]
d = pymupdf.open(pdf); hdr = None; rows = []
for p in d:
    for t in p.find_tables().tables:
        x = t.extract()
        if not x or "Instrument Tag No" not in (x[0][1] or ""): continue
        if hdr is None: hdr = [re.sub(r"\s+", " ", c or "").strip() for c in x[0]]
        for r in x[1:]:
            # (company names as roles, as everywhere in the app; "-" is the PDF's empty cell)
            r = [clean(re.sub(r"\s+", " ", c or "").strip()) for c in r] + [""] * (len(hdr) - len(r))
            r = [("" if c in ("-", "–") else c) for c in r]
            if r[1]: rows.append(r[:len(hdr)])
print(len(rows), "rows in the PDF,", len({r[1] for r in rows}), "tags")
# ---- the instrument records ----
S = json.load(open(os.path.join(R, "search-data.json"))); T = S["types"]["ins"]; F = T["f"]
MAP = {"Description": "Description", "P&ID": "P&ID", "Instrument Type": "Instrument type", "Process Fluid": "Process fluid",
       "Instrument Process Connection": "Process connection", "Units": "Range / units", "Make": "Make", "Model": "Model",
       "Supplied By": "Supplied by", "Installed By": "Installed by", "Remote IO Panel": "Remote IO panel", "Emergency Power": "Emergency power", "Comments": "Comments"}
def num(x):
    try: return float(str(x).replace(",", ""))
    except ValueError: return None
def merged(v):
    w = v.split(); return len(w) >= 4 and (set(w) <= {"-", "–"} or any(v.count(c) > 1 for c in {" ".join(w[i:i + 3]) for i in range(len(w) - 2)} if len(c) > 6))
at = {h: i for i, h in enumerate(hdr)}; fi = {f: i for i, f in enumerate(F)}
byTag = {}
for r in rows: byTag.setdefault(r[1], r)
recs = S["data"]["ins"]; have = {rec[0]: rec for rec in recs}; upd = new = 0
for tag, r in byTag.items():
    rec = have.get(tag)
    if rec is None: rec = [tag]; recs.append(rec); have[tag] = rec; new += 1
    while len(rec) < len(F): rec.append("")
    ch = False
    for h, f in MAP.items():
        if h in at and f in fi:
            v, o = r[at[h]], rec[fi[f]]
            # (kept as it was: a cell the PDF leaves empty, the same number printed with commas and decimals, and the
            # PDF's merged cells, which run several rows' values into one: "Vendor - X Vendor - X …", "- - - -")
            if not v or v == o or v.replace("\u2010", "-") == str(o).replace("\u2010", "-") or num(v) is not None and num(v) == num(o) or merged(v): continue
            rec[fi[f]] = v; ch = True
    upd += ch
    while rec and rec[-1] == "": rec.pop()
gone = [t for t in have if t not in byTag]
T["rev"] = "Rev 2 (07 Sep 2026)"
json.dump(S, open(os.path.join(R, "search-data.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(f"instruments: {upd} updated, {new} new, {len(gone)} in the app but not in Rev 2 (kept)")
# ---- the Sources copy ----
out = os.path.join(R, "sources"); k = "ins"
import shutil
if os.path.isdir(os.path.join(out, k)): shutil.rmtree(os.path.join(out, k))
os.makedirs(os.path.join(out, k)); tab = [hdr] + rows; CH = 5000; nc = max(1, -(-len(tab) // CH))
for c in range(nc): json.dump(tab[c * CH:(c + 1) * CH], open(os.path.join(out, k, f"0-{c}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "MASTER Instrument List"
for r in tab: ws.append(r)
ws.freeze_panes = "A2"; wb.save(os.path.join(out, k + ".xlsx"))
I = json.load(open(os.path.join(out, "index.json")))
I[k] = {"chunk": CH, "xlsx": f"sources/{k}.xlsx", "fname": "2000-F00-LST-IC-11011 Instrument List Rev 2 (tables).xlsx",
        "how": "The master instrument table of the PDF (cover page left out), one row per instrument", "from": "PDF",
        "sheets": [{"name": "MASTER Instrument List", "hdr": 0, "n": len(tab), "c": len(hdr), "chunks": nc}], "size": os.path.getsize(os.path.join(out, k + ".xlsx"))}
json.dump(I, open(os.path.join(out, "index.json"), "w"), ensure_ascii=False, indent=1)
# ---- the list's revision ----
p = os.path.join(R, "tools", "doc_revs.json"); D = json.load(open(p)); e = D["ins"]
if e.get("rev") != "2":
    e.update(rev="2", date="2026-09-07", status="As Built for SP1"); e.setdefault("history", []).append({"rev": "2", "date": "2026-09-07", "status": "As Built for SP1"})
json.dump(D, open(p, "w"), ensure_ascii=False, indent=1)
print("sources/ins: Rev 2 table,", len(rows), "rows")
