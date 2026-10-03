"""Adds the tailings storage facility (TSF) project lists to search-data.json and tags every item with its project.

Usage: python3 tools/build_tsf.py <folder holding the TSF .xlsx files>
       (after tools/build_search.py and the P&ID tools, before tools/sanitize.py and tools/build_pid_refs.py)
Files are found by document number in the file name:
  TSF MEL 2000-F00-LST-ME-40001, Control Valve List 2000-F00-LST-PP-40002, Manual Valve List 2000-F00-LST-PP-40003,
  Line List 2000-T00-LST-PP-40003.
Each TSF row is written into the main list's columns (same field names), so it searches and shows like any other item.
  - an item already in the main lists keeps its main row (the TSF copy is left out)
  - rows marked deleted are left out
  - a line is taken only when its sequential number (the 0545 in 23-0545-FT-RL2-500) is printed on a P&ID in the app;
    the sequential number is unique across both projects, so spec and size don't matter for that
Project: an item is TSF when one of its P&IDs is a TSF drawing (TSF in the title block, or one of the final tailings
handling and storage sheets, see TSF_DWG); everything else is Main plant. The answer goes in a "Project" field at the
end of every list ("TSF", or blank for Main plant). Rerunning replaces the TSF rows added last time.
"""
import glob, json, os, re, sys, warnings
import openpyxl
import pymupdf
warnings.filterwarnings("ignore")
SRC = sys.argv[1]
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "search-data.json")
TSF_DWG = {"2000-F23-PID-PR-" + n for n in ("40002", "40003", "40005", "40006", "40007", "40008")} | {
    "2000-F30-PID-PR-40003", "2000-F75-PID-PR-40016", "2000-F75-PID-PR-40021", "2000-F75-PID-PR-40025", "2000-F75-PID-PR-40029"}
DOCS = {"mel": "2000-F00-LST-ME-40001", "cv": "2000-F00-LST-PP-40002", "mv": "2000-F00-LST-PP-40003", "line": "2000-T00-LST-PP-40003"}

def find(doc):
    m = [f for f in glob.glob(os.path.join(SRC, "*.xlsx")) if doc in f]
    if not m: sys.exit("missing " + doc)
    return m[0]

def clean(v):
    if v is None: return ""
    if isinstance(v, float):
        v = round(v, 3)
        if v == int(v): v = int(v)
    s = re.sub(r"\s+", " ", str(v)).strip()
    return "" if s in ("-", "N/A", "n/a", "NA", "None", "nan", "#N/A", "TBA", "TBC", "?", "0 mm") else s

def rows(doc, sheet, hdr):
    ws = openpyxl.load_workbook(find(doc), read_only=True, data_only=True)[sheet]
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i > hdr: yield [clean(v) for v in r]

DB = json.load(open(OUT))
T, D = DB["types"], DB["data"]
# undo the last run: drop the TSF rows it added
for t, keys in DB.pop("tsf_added", {}).items():
    ks = set(keys); D[t] = [r for r in D[t] if r[0] not in ks]
added = {}

def add(t, vals):
    """vals: {field name: value}; skipped when the main list already has the key"""
    f = T[t]["f"]; key = vals[f[0]]
    if not key or key in have[t]: return
    rec = [vals.get(n, "") for n in f]
    while rec and rec[-1] == "": rec.pop()
    D[t].append(rec); have[t].add(key); added.setdefault(t, []).append(key)
have = {t: {r[0] for r in rs} for t, rs in D.items()}

# ---- MEL ----
for r in rows(DOCS["mel"], "Equipment List", 5):
    r += [""] * (40 - len(r))
    if not r[2] or r[6]: continue   # (Deleted column)
    volt, _, start = r[18].partition(" ")
    add("mel", {"Equipment number": r[2], "Equipment name": r[9], "Area": r[3], "Size / description": r[10], "Nominal duty point": r[11],
                "Installed power (kW)": r[19], "Voltage": volt, "Starter type": start, "Duty / standby": r[24].capitalize(),
                "Status": "Future" if r[7] else "In Service" if r[8] else "New", "Supply type": r[15], "Package": r[16],
                "Vendor": r[14], "Make / model": r[13], "P&ID": r[12], "MEL revision": r[27]})

# ---- Control valves ----
for r in rows(DOCS["cv"], "Control Valves List", 5):
    r += [""] * (45 - len(r))
    if not r[8] or r[42]: continue
    tag = re.sub(r"^([A-Z]+)-?(\d)", r"\1 \2", r[8])   # XV-23512 → XV 23512, as in the main list
    ln = r[12].split("-")
    add("cv", {"Valve tag": tag, "Location": r[11], "Valve type": r[1], "Valve code": r[9], "Valve size (mm)": r[14], "Line number": r[12],
               "Service fluid": ln[2] if len(ln) >= 5 else "", "Fluid": r[13], "Line spec": ln[3] if len(ln) >= 5 else "",
               "Line size (mm)": ln[4] if len(ln) >= 5 else "", "Flow max (m³/h)": r[30], "Fluid SG": r[39], "Fail position": r[28],
               "Actuator type": r[23] or r[15], "Solenoid type": r[19], "Positioner": r[24], "Position feedback": r[25],
               "Pneumatic panel / HPU": r[17], "Valve make": r[21], "Valve model": r[22], "Package": r[6], "P&ID": r[10], "Comments": r[41]})

# ---- Manual valves (tag = F + area + unique sequential number, as in the main list) ----
for r in rows(DOCS["mv"], "Manual Valve List - Unique", 5):
    r += [""] * (20 - len(r))
    if not r[12] or not r[4] or r[1]: continue
    add("mv", {"Valve tag": "F%02d-%s" % (int(r[4]), r[12]), "Valve type": r[9], "Spec": r[7], "Size (DN)": r[6], "Code": r[8], "Area": r[4],
               "P&ID": r[10], "Package": r[16], "Line number": r[11], "Revision": r[18], "Manufacturer": r[14], "Model": r[15]})

# ---- Lines: only those whose sequential number is printed on a P&ID in the app ----
ix = json.load(open(os.path.join(ROOT, "PIDs/index.json")))["pids"]
seqs = set()
for n, d in ix.items():
    if "-PID-" not in n: continue
    for page in pymupdf.open(os.path.join(ROOT, d["file"])):
        for m in re.finditer(r"\b\d{2}-(\d{3,4})-[A-Z]{1,4}\d?-", page.get_text()): seqs.add(int(m.group(1)))
svc = {}   # service code → description, from the main line list
fl = T["line"]["f"]
for r in D["line"]:
    if len(r) > 2 and r[1] and r[2]: svc.setdefault(r[1], r[2])
on = off = 0
for r in rows(DOCS["line"], "Line List", 4):
    r += [""] * (30 - len(r))
    if not r[1] or not re.match(r"^\d", r[1]) or r[24]: continue
    try: seq = int(float(r[2]))
    except ValueError: continue
    if seq not in seqs: off += 1; continue
    on += 1
    add("line", {"Line number": r[1], "Service": r[4], "Service description": svc.get(r[4], ""), "Size (DN)": r[6], "Pipe spec": r[8],
                 "From": r[18], "To": r[19], "Area": r[3], "Insulation": r[11], "Above / below ground": r[20], "Pressure test": r[23],
                 "Coating system": r[14], "Coating colour": r[15], "Brownfield / greenfield": r[22], "P&ID": r[16], "Comments": r[21]})

# a line end written as "Name (tag)" becomes the tag when the tag is a known item (the app shows its name from the tag)
fi, ti = fl.index("From"), fl.index("To"); known = set().union(*have.values())
for r in D["line"]:
    if r[0] not in set(added.get("line", [])): continue
    for i in (fi, ti):
        m = re.fullmatch(r".*\(([A-Z0-9][A-Z0-9-]+)\)", r[i]) if i < len(r) else None
        if m and m.group(1) in known: r[i] = m.group(1)

# ---- Project of every item, from its P&IDs ----
DW = re.compile(r"2000-F\d{2}-PID-PR-\d{5}")
counts = {}
for t, f in ((t, T[t]["f"]) for t in T):
    if "Project" not in f: f.append("Project")
    pi = [i for i, n in enumerate(f) if n in ("P&ID", "P&IDs")]; j = f.index("Project")
    for r in D[t]:
        tsf = any(set(DW.findall(r[i])) & TSF_DWG for i in pi if i < len(r))
        if len(r) > j: r[j] = "TSF" if tsf else ""
        elif tsf: r += [""] * (j - len(r)) + ["TSF"]
        while r and r[-1] == "": r.pop()
        counts[t] = counts.get(t, 0) + tsf
DB["tsf_dwg"] = sorted(TSF_DWG)
DB["tsf_added"] = added
json.dump(DB, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("added", {t: len(v) for t, v in added.items()}, "| lines on the P&IDs", on, "left out", off, "| TSF items", counts)
