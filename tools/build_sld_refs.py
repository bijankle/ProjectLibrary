"""Tappable tags on the single line diagrams: every word on an SLD that is a known tag (MEL equipment, electrical
equipment, a cable) or another drawing in the app goes into pid-refs.json under that SLD, in the format
tools/build_pid_refs.py writes ([page, left, top, width, height, target, kind, shape] in 1/10000 of the sheet).
The P&ID and PFD entries there are left as they are.   python3 tools/build_sld_refs.py   (after build_slds.py and
build_elec_data.py)
"""
import json, os, re
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
nk = lambda s: re.sub(r"[\s\-_/.]+", "", str(s or "").upper())
ix = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
db = json.load(open(os.path.join(R, "search-data.json")))
KEYS = {}
for t in ("mel", "elec", "cable"):
    for r in db["data"].get(t, []): KEYS.setdefault(nk(r[0]), (r[0], t))
DW = {nk(k): k for k in ix}
refs = json.load(open(os.path.join(R, "pid-refs.json")))
for k in [k for k in refs if "-SLD-" in k or "-BLK-IC-" in k]: del refs[k]
n = 0
for num, v in ix.items():
    if "-SLD-" not in num and "-BLK-IC-" not in num: continue
    out = []
    for pi, p in enumerate(pymupdf.open(os.path.join(R, v["file"]))):
        W, H = p.rect.width, p.rect.height
        for w in p.get_text("words"):
            t = w[4].strip(".,;:()")
            k = nk(t)
            if len(k) < 6: continue
            box = [pi + 1, round(w[0] / W * 1e4), round(w[1] / H * 1e4), round((w[2] - w[0]) / W * 1e4), round((w[3] - w[1]) / H * 1e4)]
            if k in DW and DW[k] != num: out.append(box + [DW[k], "d", "t"])
            elif k in KEYS: out.append(box + [KEYS[k][0], KEYS[k][1], "t"])
    if out: refs[num] = out; n += len(out)
json.dump(refs, open(os.path.join(R, "pid-refs.json"), "w"), separators=(",", ":"))
print(n, "tags on", sum(1 for k in refs if "-SLD-" in k), "SLDs")
