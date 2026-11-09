"""Piping isometrics: every current isometric sheet in the project document register, by the line it draws, for the
Isometrics row on a line's page (lookup.js). iso.json {"p": [SharePoint folders], "l": {line: [[sheet, rev, status,
folder index, file name, iso number], …]}}. An isometric's number is its line number between the job number and the sheet:
23517-13-1134-IA-MSG2-80-01 is sheet 01 of line 13-1134-IA-MSG2-80. Markups (-RLM1) and cancelled or superseded sheets
are left out; the link is the register's own, else the library's latest file of that sheet (tools/doclist.py).
The files stay on SharePoint (about 6,300 sheets, 5 to 6 GB).   python3 tools/build_isos.py   (after tools/reg_import.py)
"""
import glob, json, os, re, sys
from urllib.parse import unquote
import openpyxl
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
sys.path.insert(0, os.path.join(R, "tools")); import doclist
L = doclist.latest(); nk = lambda s: re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
rf = max(glob.glob(os.path.join(RP, "sources", "register", "*.xls[xm]")), key=os.path.getmtime)
NUM = re.compile(r"^(?:23517-)?(\d{2,3}-.+?)-(\d{1,2})$")
out, folders, fi = {}, [], {}
for r in openpyxl.load_workbook(rf, read_only=True).worksheets[0].iter_rows(values_only=True, min_row=2):
    r = ["" if c is None else str(c).strip() for c in r]
    if len(r) < 7 or "ISOMETRIC" not in r[6].upper() or re.search(r"-(RLM|GLM)\d*$", r[3]) or r[5] in ("CAN", "SSD"): continue
    m = NUM.match(r[3].upper())
    if not m: continue
    url = r[1] if r[1].startswith("http") else ""
    lt = L.get(nk(r[3]))   # (the register's link into a Superseded folder: the library's current copy where it has one)
    if lt and (not url or ("/superseded/" in url.lower() and not lt["sup"])): url = lt["url"]
    if not url: continue
    d, f = url.rsplit("/", 1)
    if d not in fi: fi[d] = len(folders); folders.append(d)
    out.setdefault(m.group(1), []).append([m.group(2).zfill(2), r[4], r[5], fi[d], unquote(f), r[3]])
for k in out: out[k].sort()
json.dump({"p": folders, "l": dict(sorted(out.items()))}, open(os.path.join(R, "iso.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(sum(len(v) for v in out.values()), "sheets on", len(out), "lines;", len(folders), "folders;", round(os.path.getsize(os.path.join(R, "iso.json")) / 1e3), "kB")
