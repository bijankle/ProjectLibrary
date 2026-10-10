"""Installation, operation and maintenance manuals (IOMs) from the project document register into iom.json, for the
asset pages (lookup.js: an IOM row under P&ID / PFD with SharePoint links) and Ref Only (tools/build_refonly.py lists
every IOM, mentioned or not).

  python3 tools/build_iom.py      then tools/build_refonly.py

IOMs are the vendor documents coded J01 (preliminary manual, or an IOM index) and J02 (final manual), plus the
project's own IOM numbers (2000-N02-IOM-ME-…); cancelled and superseded ones are left out. Links and revisions are the
latest file on SharePoint (tools/doclist.py), else the register's.
  iom.json: {d: {number: [title, rev, kind, url]}, p: {package: [numbers]}, t: {tag: [numbers]}}
kind: F final, P preliminary, I index. p holds what an asset page shows for its package (every manual of the package,
the final one where a final and a preliminary share a number, no indexes); t the manuals that name a tag in their title.
"""
import collections, glob, json, os, re, sys
import openpyxl
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
REGF = max(glob.glob(os.path.join(RP, "sources", "register", "*.xls[xm]")), key=os.path.getmtime)
sys.path.insert(0, os.path.join(R, "tools")); import doclist
DL = doclist.latest(); nkk = lambda s: re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
VEND = re.compile(r"^2000-([A-Z]{2}\d{3}[A-Z]?(?:\.\d+)?)-(J0[12])-\d+$")
PROJ = re.compile(r"^2000-[A-Z]\d{2,3}-IOM-[A-Z]{2}-\d+$")
rows = list(openpyxl.load_workbook(REGF, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))[1:]
D = {}
for r in rows:
    n = str(r[3] or "").strip().upper(); st = str(r[5] or "").strip().upper(); t = re.sub(r"\s+", " ", str(r[6] or "")).strip()
    if not (VEND.match(n) or PROJ.match(n)) or st in ("CAN", "SSD") or n in D: continue
    m = VEND.match(n)
    kind = "I" if re.search(r"\bINDEX\b", t, re.I) else "P" if (m and m.group(2) == "J01") or re.search(r"PRELIM", t, re.I) else "F"
    d = DL.get(nkk(n)); url = d["url"] if d else str(r[1] or ""); rev = d["rev"] if d else str(r[4] or "")
    D[n] = [t, rev, kind, url]
# a final manual replaces the preliminary one of the same package and number
fin = {(VEND.match(n).group(1), n.rsplit("-", 1)[1]) for n, v in D.items() if VEND.match(n) and v[2] == "F"}
P = collections.defaultdict(list)
for n, v in sorted(D.items()):
    m = VEND.match(n)
    if not m or v[2] == "I": continue
    if v[2] == "P" and (m.group(1), n.rsplit("-", 1)[1]) in fin: continue
    P[m.group(1)].append(n)
# tags named in a title, with the shorthand "F72-PP-521/522/523" spelled out
T = collections.defaultdict(list)
TAG = re.compile(r"\b([FT]\d{2,3}-[A-Z]{2,4}-)(\d{3,4}[A-Z]?)((?:\s*[/,&]\s*\d{3,4}[A-Z]?\b)*)")
for n, v in sorted(D.items()):
    if v[2] == "I": continue
    for pre, first, more in TAG.findall(v[0].upper()):
        for num in [first] + re.findall(r"\d{3,4}[A-Z]?", more):
            if n not in T[pre + num]: T[pre + num].append(n)
json.dump({"d": D, "p": P, "t": T}, open(os.path.join(R, "iom.json"), "w"), separators=(",", ":"))
c = collections.Counter(v[2] for v in D.values())
print(len(D), "IOMs", dict(c), len(P), "packages,", len(T), "tags named,", sum(1 for v in D.values() if v[3]), "with a link")
