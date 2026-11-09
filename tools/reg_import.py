"""The project's 2000 Project Document Register workbook (Doc Register sheet, plus the SharePoint library export in its
Team Site Export and Overflow sheets) turned into the two inputs the builders read, in the private repository:
  sources/register/register_from_2000.xlsx   the register in the layout tools/build_refonly.py, build_sp.py … read
      (file name, SharePoint address, "view", doc number, rev, status, title)
  sources/doclist/doc_list_from_2000.xlsx    the library's file list for tools/doclist.py (Name, Modified, Path, Item Type)
Each file name in the workbook is a hyperlink to its SharePoint copy; the export's Modified is an Excel day number.
   python3 tools/reg_import.py "<2000 Project Document Register.xlsm>"
"""
import datetime, os, re, sys, zipfile
import xml.etree.ElementTree as ET
from urllib.parse import unquote
import openpyxl
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
SRC = sys.argv[1]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "p": "http://schemas.openxmlformats.org/package/2006/relationships"}
z = zipfile.ZipFile(SRC)
def links(i):   # {row number: address} for the hyperlinks in column A of sheet i
    rels = {e.get("Id"): e.get("Target") for e in ET.fromstring(z.read(f"xl/worksheets/_rels/sheet{i}.xml.rels")).findall("p:Relationship", NS)}
    out = {}
    for ev, el in ET.iterparse(z.open(f"xl/worksheets/sheet{i}.xml")):
        if el.tag.endswith("}hyperlink"):
            ref = el.get("ref", ""); rid = el.get("{%s}id" % NS["r"]); m = re.fullmatch(r"A(\d+)", ref)
            if m and rid in rels: out[int(m[1])] = rels[rid]
        elif el.tag.endswith("}row"): el.clear()
    return out
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
# ---- the register
L = links(1); reg = [["File", "URL", "Open", "Doc Number", "Rev", "Status", "Title"]]
for i, r in enumerate(wb.worksheets[0].iter_rows(values_only=True, min_row=2), start=2):
    if not r or len(r) < 6 or not r[2]: continue
    reg.append([str(r[0] or ""), L.get(i, ""), "view", str(r[2]).strip(), "" if r[3] is None else str(r[3]).strip(), str(r[4] or "").strip(), str(r[5] or "").strip()])
# ---- the library's file list (Name, Modified By, Modified as a day number, size …, Item Type, Path in the last column)
day = lambda v: (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(v))).replace(microsecond=0) if v not in (None, "") else ""
files = [["Name", "Modified", "Path", "Item Type"]]; seen = set()
for si, ws in ((1, wb.worksheets[1]), (2, wb.worksheets[2])):
    for r in ws.iter_rows(values_only=True, min_row=2 if si == 1 else 1):
        if not r or not r[0] or len(r) < 11: continue
        name, path, typ = str(r[0]).strip(), str(r[10] or "").strip().strip("/"), str(r[9] or "").strip()
        if not path.startswith("sites/") or name.startswith("http"): continue
        try: mod = day(r[2])
        except (TypeError, ValueError): mod = ""
        key = (path + "/" + name).lower()
        if key in seen: continue
        seen.add(key); files.append([name, str(mod), path, typ or "Item"])
def save(rows, path):
    o = openpyxl.Workbook(write_only=True); s = o.create_sheet("Sheet1")
    for row in rows: s.append(row)
    os.makedirs(os.path.dirname(path), exist_ok=True); o.save(path)
save(reg, os.path.join(RP, "sources", "register", "register_from_2000.xlsx"))
save(files, os.path.join(RP, "sources", "doclist", "doc_list_from_2000.xlsx"))
print(len(reg) - 1, "register rows,", sum(1 for x in reg[1:] if x[1]), "with a SharePoint link;", len(files) - 1, "library files")
