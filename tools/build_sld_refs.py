"""Tappable tags on the single line diagrams: every word on an SLD that is a known tag (MEL equipment, electrical
equipment, a cable) or another drawing in the app goes into pid-refs.json under that SLD, in the format
tools/build_pid_refs.py writes ([page, left, top, width, height, target, kind, shape] in 1/10000 of the sheet).
The P&ID and PFD entries there are left as they are. Also sld-tags.json: the tags on each sheet, for its page's pills.   python3 tools/build_sld_refs.py   (after build_slds.py and
build_elec_data.py)
"""
import json, os, re
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
nk = lambda s: re.sub(r"[\s\-_/.]+", "", str(s or "").upper())
ELEC = lambda n: "-SLD-" in n or "-TLD-" in n or "-SCM-" in n or "-BLK-IC-" in n
ix = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
db = json.load(open(os.path.join(R, "search-data.json")))
# every list a tag on an electrical drawing can come from: equipment, electrical equipment and its data, cables, then
# the instruments and control valves a schematic wires up (first list wins when a tag is in two)
KEYS = {}
for t in ("mel", "elec", "cable", "elx", "ins", "cv"):
    for r in db["data"].get(t, []): KEYS.setdefault(nk(r[0]), (r[0], t))
DW = {nk(k): k for k in ix}
AREAS = {m.group(1) for k in KEYS.values() for m in [re.match(r"([A-Z]\d{2,3})-", k[0])] if m}
# a plant tag as it is written (F00-SW-010), with the slips OCR makes: a letter read for a digit in the numbers
# (O I S B Z) and a digit for a letter in the code. Put right by position, then it is a tag whether or not a list has it.
LOOSE = re.compile(r"([A-Z])([0-9OISBZ]{2,3})-([A-Z0-9]{2,4})-([0-9OISBZ]{3,4})([A-Z]?)")
OLD = re.compile(r"\d{2,3}-[A-Z]{2,4}-\d{2,3}[A-Z]?")
D = str.maketrans("OISBZ", "01582"); A = str.maketrans("01582", "OISBZ")
def tag(t):
    m = LOOSE.fullmatch(t.upper())
    if not m: return None
    a, n, c, s, x = m.groups()
    if not x and len(s) == 4 and s[3].isalpha() and nk(f"{a}{n}{c}{s}".translate(D)) not in KEYS: s, x = s[:3], s[3]   # (556B: a suffix letter, not a fourth digit)
    t = f"{a}{n.translate(D)}-{c.translate(A)}-{s.translate(D)}{x}"
    return t if t.split("-")[0] in AREAS and c.translate(A).isalpha() else None
# a tag read with its hyphens lost (F75PW556, F75PW556-1200): only a list's own tag, exactly, so nothing is guessed
BARE = re.compile(r"([A-Z]\d{2,3})([A-Z]{2,4})(\d{3,4}[A-Z]?)(?:[-.][A-Z0-9.]*)?")
def bare(t):
    m = BARE.fullmatch(t.upper()); f = m and f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return f if f and nk(f) in KEYS else None
refs = json.load(open(os.path.join(R, "pid-refs.json")))
for k in [k for k in refs if ELEC(k)]: del refs[k]
n = 0; other = {}
for num, v in ix.items():
    if not ELEC(num): continue
    out = []; oth = set()
    for pi, p in enumerate(pymupdf.open(os.path.join(R, v["file"]))):
        W, H = p.rect.width, p.rect.height
        ws = [w for w in p.get_text("words") if w[4].strip(".,;:()[]|")]
        box = lambda a: [pi + 1, round(min(w[0] for w in a) / W * 1e4), round(min(w[1] for w in a) / H * 1e4), round((max(w[2] for w in a) - min(w[0] for w in a)) / W * 1e4), round((max(w[3] for w in a) - min(w[1] for w in a)) / H * 1e4)]
        def hit(a):
            t = "".join(w[4] for w in a).strip(".,;:()[]|"); k = nk(t)
            if len(k) < 6: return None
            if k in DW: return None if DW[k] == num else box(a) + [DW[k], "d", "t"]
            if k in KEYS: return box(a) + [KEYS[k][0], KEYS[k][1], "t"]
            f = tag(t)
            if f and nk(f) in KEYS: return box(a) + [KEYS[nk(f)][0], KEYS[nk(f)][1], "t"]
            b = bare(t) if len(a) == 1 else None
            if b: return box(a) + [KEYS[nk(b)][0], KEYS[nk(b)][1], "t"]
            if not f and len(a) == 1 and OLD.fullmatch(t.upper()): f = t.upper()   # the existing plant's numbering: 25-SW-31, 30-PP-65A
            if f and (len(a) == 1 or "-" in t): oth.add(f)   # (joined pieces too, when they carry the tag's own hyphens)   # a tag no list has: named on the drawing's page, not a link on the sheet
            return None
        # side by side on the sheet (the OCR layer files each word as its own line): the same height, each word starting
        # within a letter height or so of where the one before ends
        def beside(a):
            for u, w in zip(a, a[1:]):
                h = max(u[3] - u[1], w[3] - w[1]) or 1
                if min(u[3], w[3]) - max(u[1], w[1]) < .5 * h or not (-.3 * h < w[0] - u[2] < 1.2 * h): return False
            return True
        used = set()
        for i, w in enumerate(ws):
            r = hit([w])
            if r: out.append(r); used.add(i)
        # a tag the text layer split in two or three words (F23-TR- 016): the words side by side on one line, joined
        for g in (2, 3):
            for i in range(len(ws) - g + 1):
                a = ws[i:i + g]
                if any(j in used for j in range(i, i + g)) or (len({(w[5], w[6]) for w in a}) > 1 and not beside(a)): continue
                r = hit(a)
                if r: out.append(r); used.update(range(i, i + g))
    if out: refs[num] = out; n += len(out)
    oth -= {r[5] for r in out}
    if oth: other[num] = sorted(oth)
json.dump(refs, open(os.path.join(R, "pid-refs.json"), "w"), separators=(",", ":"))
# the tags on each sheet once, for the pills on the drawing's own page (lookup.js): sld-tags.json {drawing: [tags]},
# and under "_other" the tags read on a sheet that no list has (a switchboard the equipment lists leave out)
st = {num: sorted({r[5] for r in v if r[6] != "d"}) for num, v in refs.items() if ELEC(num)}
st = {k: v for k, v in st.items() if v}; st["_other"] = other
json.dump(st, open(os.path.join(R, "sld-tags.json"), "w"), separators=(",", ":"))
none = sorted(k for k in ix if ELEC(k) and k not in st and k not in other)
print(n, "tags on", len(st) - 1, "electrical drawings;", sum(map(len, other.values())), "tags no list has on", len(other), "; nothing read on", len(none), none[:20])
