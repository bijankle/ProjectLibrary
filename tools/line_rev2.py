"""The Line List's Rev 2 (SP1 As Built, 12 Oct 2026) came as a PDF only (inbox/lists in the private repository), while the
app's line records were built from the Rev 1 workbook (tools/build_search.py). This reads the PDF's table and brings it in:
  search-data.json  each line's fields that the PDF carries take the Rev 2 values (a cell the PDF leaves empty, "?" or
                    "N/A" keeps the Rev 1 value; size, spec, service, operating conditions, length, sub-system stay as Rev 1);
                    lines new in Rev 2 are added (area, service, spec and size from the number); a line renumbered in Rev 2
                    (same area and number, new spec or size) takes the new number and keeps the old one as "Previous number";
                    lines Rev 2 no longer lists are removed (176: mostly the F75 / F23 tailings lines, 151 of them drawn on held sheets, whose tags then link to no line)
  sources/line.xlsx, sources/line/, sources/index.json   the Sources copy becomes the Rev 2 table
  tools/doc_revs.json   the list's revision, date and status
The PDF's table has no full grid on every page, so the columns are placed from the grid of the first table page and each row
runs halfway to the line numbers above and below it (the cells are centred on their row).
  python3 tools/line_rev2.py [pdf]     (then tools/checks_auto.py, tools/build_offline.py)
"""
import json, os, re, sys, glob, shutil
import pymupdf, openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from sanitize import clean
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
pdf = sys.argv[1] if len(sys.argv) > 1 else sorted(glob.glob(os.path.join(RP, "inbox", "*", "2000-F00-LST-PP-10001_2*.pdf")))[0]
d = pymupdf.open(pdf)
COLS = ["Line number", "Insulation", "From", "To", "P&ID", "Stage", "Brownfield / greenfield", "Design pressure (kPag)", "Design temperature (°C)",
        "Above / below ground", "NDE", "Internal cleaning", "Pressure testing standard", "Pressure piping", "Pressure test", "Test pressure (kPag)",
        "Test medium", "Test duration", "Coating system", "Coating colour", "Comments", "Rev"]
xs = [(c[0], c[2]) for c in d[1].find_tables().tables[0].rows[2].cells]   # (a data row: each column's left and right)
LN = re.compile(r"^\d{2,3}-[A-Z0-9]*\d{3,4}-[A-Z0-9]+-[A-Z0-9.]+-\d+")
rows = {}
for p in d:
    ws = p.get_text("words"); x0, x1 = xs[0]; ym = lambda w: (w[1] + w[3]) / 2
    an = sorted([w for w in ws if x0 - 2 <= w[0] < x1 and LN.match(w[4])], key=ym)
    for i, a in enumerate(an):
        y = ym(a); gap = (ym(an[i + 1]) - y) if i + 1 < len(an) else (y - ym(an[i - 1])) if i else 20
        top = (ym(an[i - 1]) + y) / 2 if i else y - gap / 2; bot = (y + ym(an[i + 1])) / 2 if i + 1 < len(an) else y + gap / 2
        rec = {}
        for ci, (cx0, cx1) in enumerate(xs):
            cw = sorted([w for w in ws if top <= ym(w) < bot and cx0 - 1 <= (w[0] + w[2]) / 2 < cx1 + 1], key=lambda w: (round(w[1]), w[0]))
            rec[COLS[ci]] = clean(" ".join(w[4] for w in cw))
        rec["Line number"] = a[4]; rows[a[4]] = rec
print(len(rows), "lines in the PDF")
# ---- the line records ----
S = json.load(open(os.path.join(R, "search-data.json"))); T = S["types"]["line"]; F = T["f"]
if "Line List Rev 2" in F:   # (an earlier run marked the lines it no longer lists: that field goes, the lines go below)
    j = F.index("Line List Rev 2"); F.pop(j)
    for rec in S["data"]["line"]:
        if len(rec) > j: rec.pop(j)
for f in ("Internal cleaning", "Pressure testing standard", "Previous number"):
    if f not in F: F.append(f)
fi = {f: i for i, f in enumerate(F)}
EMPTY = {"", "-", "–", "?", "N/A", "n/a", "NA", "TBA", "TBC"}
def num(x):
    try: return float(str(x).replace(",", ""))
    except ValueError: return None
recs = S["data"]["line"]
have = {rec[0]: rec for rec in recs}
key = lambda s: "-".join(s.split("-")[:3])
gone0 = [k for k in have if k not in rows]; byKey = {}
for k in gone0: byKey.setdefault(key(k), []).append(k)
upd = new = ren = 0; changes = {}
for k, r in rows.items():
    rec = have.get(k)
    if rec is None and len(byKey.get(key(k), [])) == 1:      # renumbered: same area, number and service
        o = byKey[key(k)][0]; rec = have.pop(o); rec[0] = k; have[k] = rec
        while len(rec) < len(F): rec.append("")
        rec[fi["Previous number"]] = o; ren += 1; changes[k] = {"Line number": [o, k]}
    if rec is None:
        rec = [k] + [""] * (len(F) - 1); recs.append(rec); have[k] = rec; new += 1; changes[k] = {"new": True}
        m = re.match(r"^(\d{2,3})-[A-Z0-9]*\d{3,4}-([A-Z0-9]+)-([A-Z0-9.]+)-(\d+)", k)
        if m:
            for f, v in zip(("Area", "Service", "Pipe spec", "Size (DN)"), m.groups()): rec[fi[f]] = v
            # (the service description from a line of the same service)
            sd = next((x[fi["Service description"]] for x in recs if len(x) > fi["Service description"] and x[fi["Service"]] == m.group(2) and x[fi["Service description"]]), "")
            rec[fi["Service description"]] = sd
    while len(rec) < len(F): rec.append("")
    ch = False
    for f, v in r.items():
        if f in ("Line number", "Rev") or f not in fi or v in EMPTY: continue
        o = rec[fi[f]]
        if v == o or num(v) is not None and num(v) == num(o) or re.sub(r"[\s\-]", "", v) == re.sub(r"[\s\-]", "", str(o)): continue   # (the PDF prints some tags without hyphens: F12 CV 401)
        if o: changes.setdefault(k, {})[f] = [o, v]
        rec[fi[f]] = v; ch = True
    upd += ch and k not in [c for c in changes if changes[c].get("new")]
gone = [k for k in have if k not in rows]
G = set(gone); recs[:] = [rec for rec in recs if rec[0] not in G]
for rec in recs:
    while rec and rec[-1] == "": rec.pop()
T["rev"] = "Rev 2 (12 Oct 2026)"
json.dump(S, open(os.path.join(R, "search-data.json"), "w"), ensure_ascii=False, separators=(",", ":"))
json.dump({"new": [k for k in changes if changes[k].get("new")], "gone": gone, "changed": {k: v for k, v in changes.items() if not v.get("new")}},
          open(os.path.join(R, "tools", "line_rev2_changes.json"), "w"), ensure_ascii=False, indent=1)
print(f"lines: {upd} updated ({ren} renumbered), {new} new, {len(gone)} in the app but not in Rev 2 (removed)")
# ---- the Sources copy ----
out = os.path.join(R, "sources"); k = "line"
if os.path.isdir(os.path.join(out, k)): shutil.rmtree(os.path.join(out, k))
os.makedirs(os.path.join(out, k)); tab = [COLS] + [[r[c] for c in COLS] for r in rows.values()]; CH = 5000; nc = max(1, -(-len(tab) // CH))
for c in range(nc): json.dump(tab[c * CH:(c + 1) * CH], open(os.path.join(out, k, f"0-{c}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Line List"
for r in tab: ws.append(r)
ws.freeze_panes = "A2"; wb.save(os.path.join(out, k + ".xlsx"))
I = json.load(open(os.path.join(out, "index.json")))
I[k] = {"chunk": CH, "xlsx": f"sources/{k}.xlsx", "fname": "2000-F00-LST-PP-10001 Line List Rev 2 (tables).xlsx",
        "how": "The line table of the PDF (cover page left out), one row per line", "from": "PDF",
        "sheets": [{"name": "Line List", "hdr": 0, "n": len(tab), "c": len(COLS), "chunks": nc}], "size": os.path.getsize(os.path.join(out, k + ".xlsx"))}
json.dump(I, open(os.path.join(out, "index.json"), "w"), ensure_ascii=False, indent=1)
# ---- the list's revision ----
p = os.path.join(R, "tools", "doc_revs.json"); D = json.load(open(p)); e = D["line"]
if e.get("rev") != "2":
    e.update(rev="2", date="2026-10-12", status="SP1 As Built"); e.setdefault("history", []).append({"rev": "2", "date": "2026-10-12", "status": "SP1 As Built"})
json.dump(D, open(p, "w"), ensure_ascii=False, indent=1)
print("sources/line: Rev 2 table,", len(tab) - 1, "rows")
