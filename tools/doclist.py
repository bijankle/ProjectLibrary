"""The latest revision of every document on SharePoint, from an export of the KCGM Controlled Library's file list
(sources/doclist/*.xlsx in the private repository, newest file: SharePoint > the library in a flat view > Export).
Each cell holds the file name with its SharePoint address as a hyperlink. A file's number is its name up to the first
"_", its revision the next part (2000-F00-SLD-EL-10002_5.pdf: rev 5; _4A_RLM: rev 4A, status RLM). Of several files for
one number, one outside a "Superseded" folder and not marked SSD (superseded) or CAN (cancelled) wins, then a PDF, then the latest modified date, then the highest
revision (letters before numbers: A < B < 0 < 1 < 1A < 2). The export's Name, Path and Modified columns are used. The result is cached beside the export as doclist.json (rebuilt when the export is newer).
   from doclist import latest, revkey      latest() -> {key: {"n", "rev", "st", "url", "file", "sup"}}
"""
import glob, json, os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
nk = lambda s: re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
def revkey(r):
    r = str(r or "").strip().upper()
    m = re.fullmatch(r"(\d+)([A-Z]*)", r)
    if m: return (2, int(m.group(1)), m.group(2))
    if re.fullmatch(r"[A-Z]{1,2}", r): return (1, 0, r)
    return (0, 0, r)
EXT = {"pdf": 3, "xlsx": 2, "xlsm": 2, "docx": 1, "dwg": 0}
FILES = {}   # every numbered file on SharePoint: {file name, lower case: modified date} (filled by latest())
def latest():
    xs = sorted(glob.glob(os.path.join(RP, "sources", "doclist", "*.xlsx")), key=os.path.getmtime)
    if not xs: return {}
    src, cache = xs[-1], os.path.join(RP, "sources", "doclist", "doclist.json")
    if os.path.exists(cache) and os.path.getmtime(cache) >= os.path.getmtime(src):
        c = json.load(open(cache)); FILES.update(c.get("F", {})); return c["L"]
    import openpyxl
    from urllib.parse import quote
    rows = openpyxl.load_workbook(src, read_only=True).worksheets[0].iter_rows(values_only=True)
    hd = [str(x or "").strip() for x in next(rows)]; col = {h: i for i, h in enumerate(hd)}
    best = {}; files = {}
    for row in rows:
        name = str(row[col["Name"]] or "").strip().split("\n")[-1].strip(); path = str(row[col["Path"]] or "").strip().strip("/")
        if (row[col.get("Item Type", -1)] if "Item Type" in col else "Item") != "Item" or "." not in name or not path: continue
        stem, ext = name.rsplit(".", 1); ext = ext.lower()
        if ext not in EXT: continue
        parts = stem.split("_"); num = parts[0].strip()
        if len(nk(num)) < 7 or len(parts) < 2: continue
        rev = parts[1].strip(); st = "_".join(parts[2:]).strip()
        mod = str(row[col["Modified"]] or "")[:19]; files[name.lower()] = mod
        sup = "/superseded" in ("/" + path).lower()
        url = "https://nsrltd.sharepoint.com/" + quote(path + "/" + name)
        k = nk(num); e = {"n": num, "rev": rev, "st": st, "url": url, "file": name, "sup": sup, "mod": mod}
        # the newest file wins: one outside a Superseded folder, a PDF (the drawing the app shows), then the latest
        # modified date, then the highest revision
        # (a file marked SSD, superseded, or CAN, cancelled, or a copy named "... old", only when there's nothing else)
        bad = st.upper().split("_")[0] in ("SSD", "CAN") or rev.upper() in ("SSD", "CAN") or stem.lower().endswith(" old")
        rank = (not sup and not bad, ext == "pdf", mod, revkey(rev))
        if k not in best or rank > best[k][0]: best[k] = (rank, e)
    out = {k: v[1] for k, v in best.items()}; FILES.update(files)
    json.dump({"L": out, "F": files}, open(cache, "w"), separators=(",", ":"))
    return out
if __name__ == "__main__":
    L = latest(); print(len(L), "documents;", sum(1 for v in L.values() if v["sup"]), "only in Superseded folders")
