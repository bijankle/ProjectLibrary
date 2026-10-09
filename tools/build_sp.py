"""SharePoint links for documents the app mentions but doesn't hold: sp.json {document number: SharePoint address},
from the project document register (sources/register/, newest file there). Only numbers that appear somewhere in
the app are kept (the lists, checks, Ref Only, the drawings' printed references), so the file stays small.
Also adds the printed references to such documents on the drawings to pid-refs.json, kind "s" (a tap opens
SharePoint).   python3 tools/build_sp.py   (after the other builders)
Of several register entries for one number, the latest revision's PDF is linked.
"""
import glob, json, os, re
import openpyxl, pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
nk = lambda s: re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
rf = max(glob.glob(os.path.join(R, "sources", "register", "*.xls[xm]")), key=os.path.getmtime)
REG = {}
def rk(rev, url):
    r = str(rev or "").strip().upper(); pdf = url.lower().endswith(".pdf")
    return (pdf, r.isdigit(), int(r) if r.isdigit() else 0, r)
for row in openpyxl.load_workbook(rf, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True, min_row=2):
    num, url, rev = row[3], row[1], row[4]
    if not num or not url or not str(url).startswith("http"): continue
    k = nk(num)
    if len(k) < 7: continue
    if k not in REG or rk(rev, url) > rk(REG[k][2], REG[k][1]): REG[k] = (str(num).strip(), str(url), rev)
ix = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
iss = json.load(open(os.path.join(R, "issues.json")))
held = {nk(k) for k in ix} | {nk(v.get("number", "")) for v in iss["meta"]["docs"].values()} | {nk("2000-F00-STS-PP-10001")}
DOC = re.compile(r"(?<![A-Z0-9])(?:2000(?:-[A-Z0-9.]{2,10}){3,4}|\d{2,3}[\\/-][A-Z][\\/-]\d{4}(?:-\d{3})?|[A-Z0-9]{2,6}(?:-[A-Z0-9]{2,6}){2,5})(?![A-Z0-9])")
found = set()
def scan(text):
    for m in DOC.findall(str(text).upper()):
        k = nk(m)
        if k in REG and k not in held: found.add(k)
for f in ("search-data.json", "issues.json", "refonly.json", "doc-tags.json", "followups.json"):
    p = os.path.join(R, f)
    if os.path.exists(p): scan(open(p).read())
# printed references on the drawings
refs = json.load(open(os.path.join(R, "pid-refs.json")))
for n in list(refs): refs[n] = [r for r in refs[n] if r[6] != "s"]
added = 0
for num, v in ix.items():
    if not re.search(r"-(PID|PFD|SLD|BLK)-", num) or not os.path.exists(os.path.join(R, v["file"])): continue
    out = []
    for pi, p in enumerate(pymupdf.open(os.path.join(R, v["file"]))):
        W, H = p.rect.width, p.rect.height
        for w in p.get_text("words"):
            t = w[4].strip(".,;:()[]"); k = nk(t)
            if len(k) < 9 or k not in REG or k in held or not DOC.fullmatch(t.upper()): continue
            found.add(k)
            out.append([pi + 1, round(w[0] / W * 1e4), round(w[1] / H * 1e4), round((w[2] - w[0]) / W * 1e4), round((w[3] - w[1]) / H * 1e4), REG[k][0], "s", "t"])
    if out: refs.setdefault(num, []).extend(out); added += len(out)
json.dump(refs, open(os.path.join(R, "pid-refs.json"), "w"), separators=(",", ":"))
sp = {REG[k][0]: REG[k][1] for k in sorted(found)}
json.dump(sp, open(os.path.join(R, "sp.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(len(sp), "SharePoint links,", added, "printed references on drawings,", round(os.path.getsize(os.path.join(R, "sp.json")) / 1e3), "kB")
