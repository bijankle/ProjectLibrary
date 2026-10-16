"""What is on every drawing, read off its text (the CAD text and the four OCR readings, tools/ocr_all.py), into
contents.json for the app (lookup.js): a drawing's page lists its contents as pills, an item's page lists every drawing
it is on, and things no list has are searchable on their own.

  python3 tools/build_contents.py      (after tools/ocr_all.py and tools/build_pid_refs.py / build_sld_refs.py)

Read on each sheet: single words, two or three words side by side (one line, or the same height a letter or so apart)
and two words stacked in an instrument bubble (ZSO over 22016). Matched against every list (equipment, instruments,
control and manual valves, lines, specials, hoses, electrical equipment, cables), ignoring spaces and hyphens. The tag
boxes already on a drawing (pid-refs.json) count too, so nothing linked by hand is lost.
  contents.json: {"d": {drawing: {"k": [list keys], "o": [read, no list has it], "r": [drawing / document numbers]}}}
"o" holds plant tags (F23-SW-016, with OCR slips put right), line numbers (30-4329-FD-PE10-90) and the existing plant's
tags (25-SW-31); "r" the other drawings and documents named on the sheet.
"""
import json, os, re
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
nk = lambda s: re.sub(r"[\s\-_/.]+", "", str(s or "").upper())
# a line number with its leading zeros dropped in each part (14-8201-BW-SS1-050 is the list's 14-8201-BW-SS1-50)
nz = lambda s: "-".join(x.lstrip("0") or "0" for x in str(s).upper().split("-"))
ix = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
db = json.load(open(os.path.join(R, "search-data.json")))
KEYS = {}
for t in ("mel", "elec", "elx", "cable", "ins", "cv", "mv", "line", "spi", "hose"):
    for r in db["data"].get(t, []):
        k = nk(r[0])
        if len(k) >= 5: KEYS.setdefault(k, r[0])
        if t == "line": KEYS.setdefault(nk(nz(r[0])), r[0])
DW = {nk(k): k for k in ix}
AREAS = {m.group(1) for k in KEYS.values() for m in [re.match(r"([A-Z]\d{2,3})-", k)] if m}
# OCR slips in a plant tag, put right by position: a letter for a digit in the numbers, a digit for a letter in the code
LOOSE = re.compile(r"([A-Z])([0-9OISBZ]{2,3})-([A-Z0-9]{2,4})-([0-9OISBZ]{3,4})([A-Z]?)")
D = str.maketrans("OISBZ", "01582"); A = str.maketrans("01582", "OISBZ")
def tag(t):
    m = LOOSE.fullmatch(t)
    if not m: return None
    a, n, c, s, x = m.groups(); f = f"{a}{n.translate(D)}-{c.translate(A)}-{s.translate(D)}{x}"
    return f if f.split("-")[0] in AREAS and c.translate(A).isalpha() else None
LINE = re.compile(r"\d{2,3}-\d{4}-[A-Z]{1,4}-[A-Z0-9]{2,6}-\d{2,4}(?:-[A-Z0-9]{1,4})?")      # 30-4329-FD-PE10-90, 13-0096-COW-MSG1-100-TI
OLD = re.compile(r"\d{2,3}-[A-Z]{2,4}-\d{2,3}[A-Z]?")                    # 25-SW-31, the existing plant's numbering
DOC = re.compile(r"2000-[A-Z0-9.]{2,10}-[A-Z]{3}(?:-[A-Z]{2})?-\d{5}")   # 2000-F13-SCM-EL-10202, 2000-ME060-J02-10003
refs = json.load(open(os.path.join(R, "pid-refs.json")))
# an electrical drawing's references, sorted by what is printed beside each on the sheet: f From (FED FROM, INCOMER,
# 33 kV FROM …), t To (FEEDER TO, CONT TO …), s the schematics under the feeders, x reference drawings (the title band's
# reference table, notes, standards and lists), l other drawings linked with no direction printed
ELECX = re.compile(r"-(SLD|TLD|SCM|BLK)-")
FROMW = re.compile(r"^(FROM|FED|INCOMER|INCOMING|SUPPLIED)$"); TOW = re.compile(r"^(TO|OUTGOING)$")
def rclass(num, ref, box, ws, W, H):
    x0, y0, x1, y1 = box; h = (y1 - y0) or 5; w = (x1 - x0) or 40
    k, me = ELECX.search(ref), ELECX.search(num)
    if not k: return "x"   # a standard, a list, a layout: a reference drawing
    if me.group(1) in ("SLD", "TLD") and k.group(1) == "SCM": return "s"   # the schematics of the sheet's feeders
    if me.group(1) == "SCM" and k.group(1) in ("SLD", "TLD"): return "f"   # a schematic's single line diagram feeds it
    if y0 > .86 * H and x0 < .5 * W: return "x"   # the reference drawing table in the title band
    near = [t for t in ws if t[1] >= y0 - 4 * h and t[3] <= y1 + 1.2 * h and t[0] >= x0 - .8 * w and t[2] <= x1 + 1.8 * w]
    txt = " ".join(t[4] for t in near).upper()
    if re.search(r"\bREFER|\bSEE\b|\bNOTE", txt): return "x"
    df = [abs(t[1] - y0) for t in near if FROMW.search(t[4].upper())]; dt = [abs(t[1] - y0) for t in near if TOW.search(t[4].upper())]
    if df or dt: return "f" if df and (not dt or min(df) <= min(dt)) else "t"
    if me.group(1) in ("SLD", "TLD"):   # drawn top down: the supply comes in at the top, the feeders leave along the bottom
        cy = (y0 + y1) / 2 / H
        if cy < .3: return "f"
        if cy > .5: return "t"
    return "l"
out = {}
# (sheets whose title block was cleared, tools/clear_titleblock.py: what was read off the block before keeps counting,
# merged with this reading, so the reference tables still feed the Reference drawings pill)
try: PREV = json.load(open(os.path.join(R, "contents.json")))["d"]
except Exception: PREV = {}
for num, v in ix.items():
    keys, oth, docs = set(), set(), set()
    for r in refs.get(num, []):   # the tag boxes already on the sheet
        if r[6] == "d": docs.update(str(r[5]).split("|"))
        elif r[6] != "x": keys.update(k for k in str(r[5]).split("|") if nk(k) in KEYS)
    try: d = pymupdf.open(os.path.join(R, v["file"]))
    except Exception as e: print("skip", num, e); continue
    rc = {}   # (electrical drawings) reference → its class
    for pi, p in enumerate(d):
        ws = [w for w in p.get_text("words") if w[4].strip(".,;:()[]|")]
        def look(t, single):
            t = t.strip(".,;:()[]|").upper(); k = nk(t)
            if len(k) < 5: return False
            if k in KEYS: keys.add(KEYS[k]); return True
            if k in DW:
                if DW[k] != num: docs.add(DW[k])
                return True
            for m in DOC.finditer(t):
                if m.group(0) not in (num,): docs.add(m.group(0))
            f = tag(t)
            if f:
                if nk(f) in KEYS: keys.add(KEYS[nk(f)])
                elif single or "-" in t: oth.add(f)
                return True
            if LINE.fullmatch(t):
                if nk(nz(t)) in KEYS: keys.add(KEYS[nk(nz(t))])
                else: oth.add(t)
                return True
            if single and OLD.fullmatch(t): oth.add(t); return True
            return False
        used = set()
        for i, w in enumerate(ws):
            if look(w[4], True): used.add(i)
        # side by side: the same text line, or the same height with the next word starting a letter or so on
        def beside(a):
            for u, w in zip(a, a[1:]):
                h = max(u[3] - u[1], w[3] - w[1]) or 1
                if min(u[3], w[3]) - max(u[1], w[1]) < .5 * h or not (-.3 * h < w[0] - u[2] < 1.2 * h): return False
            return True
        for g in (2, 3):
            for i in range(len(ws) - g + 1):
                a = ws[i:i + g]
                if any(j in used for j in range(i, i + g)): continue
                if len({(w[5], w[6]) for w in a}) > 1 and not beside(a): continue
                if look("".join(w[4] for w in a), False): used.update(range(i, i + g))
        # stacked in a bubble: a short word with another right under it, centred on it (ZSO over 22016)
        loose = [w for j, w in enumerate(ws) if j not in used and len(w[4]) <= 8]
        loose.sort(key=lambda w: (round(w[1]), w[0]))
        for u in loose:
            cu, h = (u[0] + u[2]) / 2, u[3] - u[1]
            for w in loose:
                if w is u: continue
                if 0 <= w[1] - u[3] < .8 * h and abs((w[0] + w[2]) / 2 - cu) < .6 * max(u[2] - u[0], w[2] - w[0]) and abs((w[3] - w[1]) - h) < .5 * h:
                    k = nk(u[4] + w[4])
                    if k in KEYS: keys.add(KEYS[k])
        if ELECX.search(num):
            W, H = p.rect.width, p.rect.height
            occ = [((r[1] / 1e4 * W, r[2] / 1e4 * H, (r[1] + r[3]) / 1e4 * W, (r[2] + r[4]) / 1e4 * H), str(r[5])) for r in refs.get(num, []) if r[0] == pi + 1 and r[6] in ("d", "s")]
            occ += [(tuple(w[:4]), m.group(0)) for w in ws for m in DOC.finditer(w[4].upper())]
            RANK = {"f": 0, "t": 0, "s": 1, "x": 2, "l": 3}
            for b, ref in occ:
                for one in ref.split("|"):
                    if one == num: continue
                    c = rclass(num, one, b, ws, W, H)
                    if one not in rc or RANK[c] < RANK[rc[one]]: rc[one] = c
    oth -= set(keys); oth = {o for o in oth if nk(o) not in KEYS}
    # (an OCR fragment that lost the area's F: 00-SW-010 when F00-SW-010 is on the sheet or in a list)
    oth = {o for o in oth if not (re.fullmatch(r"\d{2,3}-[A-Z]{2,4}-\d{3}[A-Z]?", o) and ("F" + o in oth or nk("F" + o) in KEYS or "F" + o in keys))}
    docs.discard(num)
    if "tbclear" in (d.metadata.get("keywords") or "") and num in PREV:
        o = PREV[num]; keys |= set(o.get("k", [])); oth |= set(o.get("o", [])); docs |= set(o.get("r", []))
        for c, refs_ in (o.get("rc") or {}).items():
            for one in refs_:
                if one not in rc or {"f": 0, "t": 0, "s": 1, "x": 2, "l": 3}[c] < {"f": 0, "t": 0, "s": 1, "x": 2, "l": 3}[rc[one]]: rc[one] = c
    e = {}
    if keys: e["k"] = sorted(keys)
    if oth: e["o"] = sorted(oth)
    if docs: e["r"] = sorted(docs)
    if rc:
        g = {}
        for ref in sorted(set(rc) | (docs if ELECX.search(num) else set())):
            if ref == num: continue
            g.setdefault(rc.get(ref, "l" if ELECX.search(ref) else "x"), []).append(ref)
        e["rc"] = g
    if e: out[num] = e
json.dump({"d": out}, open(os.path.join(R, "contents.json"), "w"), separators=(",", ":"))
nk_ = sum(len(e.get("k", [])) for e in out.values()); no = sum(len(e.get("o", [])) for e in out.values()); nr = sum(len(e.get("r", [])) for e in out.values())
print(f"{len(out)} of {len(ix)} drawings: {nk_} list items, {no} read with no list, {nr} drawing references; "
      f"{os.path.getsize(os.path.join(R, 'contents.json')) // 1000} kB; nothing on: {[k for k in ix if k not in out][:20]}")
