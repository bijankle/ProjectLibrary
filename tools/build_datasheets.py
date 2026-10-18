"""What the equipment datasheets in the app say, on their equipment's asset pages (lookup.js: the Datasheet pill).
  python3 tools/build_datasheets.py      (after tools/build_ds_links.py; reads the datasheets in PIDs/index.json)
Each datasheet's tables are read row by row: Parameter | Unit | Duty | Supplier (Vendor) | Notes | Rev. A row with a
parameter and nothing else is a section heading (Mill Shell, Trommel, Electrical Supply). The value kept is the
supplier's where both are filled (what is built), the duty where only the duty is (a supplier's Comply or Noted takes
the duty value as it stands).
Only what the app doesn't already say is kept: a value already in one of the tag's list entries is dropped; a value for
the same quantity that differs from the list (power, voltage, speed, mass, flow, head …) stays on the list's side and
goes to Checks as a clash (tools/ds_clash.json, read by build_issues.py).
Pills: a section with 4 or more new fields is a pill of its own; smaller ones are put together in General, so no pill
holds one lonely value.
  ds-data.json: {tag: [{"n": doc number, "r": rev, "p": [[pill, [[field, value, unit], …]], …]}]}
The data goes on the tags the datasheet names (ds-links.json "d").
"""
import json, os, re
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ix = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
LK = json.load(open(os.path.join(R, "ds-links.json"))) if os.path.exists(os.path.join(R, "ds-links.json")) else {"t": {}}
DB = json.load(open(os.path.join(R, "search-data.json")))
MINP = 4
SAY = re.compile(r"^(comply|complies|complied|noted|agreed|accepted|as above|as per duty|confirmed|ok|-+|–)\.?$", re.I)
cell = lambda c: re.sub(r"\s+", " ", (c or "").replace("\n", " ")).strip()

DUTY = {"duty", "primero data", "dra data", "purchaser data", "required", "client requirement", "purchaser", "design data"}
SUP = {"vendor", "supplier", "supplier data", "vendor data", "supplier / comment", "vendor / comment", "offered", "supplier comment", "vendor comment"}
UNIT = {"unit", "units", "uom"}
NOTE = {"notes", "note", "remarks", "comments", "rev"}
def heads(row):
    """a header row's columns, each a span of cells [a, b): param, unit, duty, sup (None if it isn't a header row).
    A label sits a cell into its merged span (the span starts one cell before it where that one is empty)."""
    low = [cell(c).lower() for c in row]; lab = []
    for i, c in enumerate(low):
        k = "unit" if c in UNIT else "duty" if c in DUTY else "sup" if c in SUP else "note" if c in NOTE else None
        if k: lab.append((k, i - 1 if i and not low[i - 1] and (not lab or lab[-1][1] < i - 1) else i))
    ks = [k for k, _ in lab]
    if "duty" not in ks:
        # (one column per item, F12-WD-402 | F13-WD-403 …: the labels after the unit's span, the tags in a row below)
        if "unit" not in ks or not low[0] and not any(low[:lab[0][1] + 1]): return None
        u = dict(lab)["unit"]; nt = dict(lab).get("note", len(row))
        cols = [i for i in range(u + 2, nt) if low[i]]
        return {"param": (0, u), "unit": (u, u + 3), "multi": cols, "note": nt} if len(cols) >= 2 else None
    H = {"param": (0, lab[0][1])}
    for n, (k, a) in enumerate(lab):
        H.setdefault(k, (a, lab[n + 1][1] if n + 1 < len(lab) else len(row)))
    return H

def first(row, ab):
    for c in row[ab[0]:ab[1]] if ab else []:
        c = cell(c)
        if c: return c
    return ""

SUBS = {"minimum", "min", "nominal", "nom", "normal", "max", "maximum", "design", "rated"}
def read(path):
    """{None: [[section, [[field, value, unit]]]], tag: … (a sheet with a column per item)} in the order printed"""
    S, H, sub, keys, pend, tagc = {None: [["General", []]]}, None, None, [None], None, {}; doc = pymupdf.open(path)
    def sec(name):
        for k in keys: S.setdefault(k, [["General", []]]).append([name, []])
    for page in doc:
        try: tabs = page.find_tables().tables
        except Exception as e: print("  no tables read on", os.path.basename(path), "page", page.number + 1, e); continue
        for t in tabs:
            rows = t.extract()
            # (the client's header block on each page: project number, datasheet title, client name; not data)
            if any(re.match(r"(primero |epc )?(project number|document number|datasheet title|client company|datasheet kcgm|equipment (name|number))", cell(r[0]).lower()) for r in rows if r): continue
            for row in rows:
                h = heads(row)
                if h and "multi" in h: pend = h; continue   # (taken on only once a row of tags shows it is one)
                if h: H, sub, keys, pend = h, None, [None], None; continue
                if pend:
                    tg = {i: cell(row[i]) for i in range(pend["unit"][1] - 1, min(pend["note"], len(row))) if re.fullmatch(r"F\d{2,3}-[A-Z]{2,4}-\d{3}[A-Z]?(-[A-Z]{2})?", cell(row[i]))}
                    if len(tg) >= 2: H, sub, pend, tagc = pend, None, None, tg; keys = list(tg.values()); continue
                if not H: continue
                name = first(row, H["param"]); unit = first(row, H.get("unit"))
                if "multi" in H:
                    vc = [(i, cell(row[i])) for i in range(H["unit"][1] - 1, min(H["note"], len(row))) if cell(row[i])]
                    if name and not vc and not unit:
                        if len(name) <= 60: sec(name.rstrip(":"))
                        continue
                    if not name or name.upper().startswith("DUTY SPEC"): continue
                    if unit in ("-", "–", "#") or " / " in unit and not re.search(r"\d", unit): unit = ""
                    for i, x in vc:
                        k = tagc[min(tagc, key=lambda c: abs(c - i))]
                        if SAY.match(x) or x.lower() in ("tba", "tbc", "tbd", "vta", "-"): continue
                        L = S.setdefault(k, [["General", []]])
                        if not any(f[0] == name for f in L[-1][1]): L[-1][1].append([name, x, unit])
                    continue
                # (a row naming sub columns in the duty span: Minimum / Nominal / Max / Design)
                a, b = H["duty"]; dc = [(i, cell(row[i])) for i in range(a, min(b, len(row))) if cell(row[i])]
                if len(dc) >= 2 and all(x.lower() in SUBS for _, x in dc):
                    sub = dc
                    if name and len(name) <= 60: sec(name.rstrip(":"))
                    continue
                if sub and len(dc) >= 2:
                    near = lambda i: min(sub, key=lambda q: abs(q[0] - i))[1].lower()
                    duty = ", ".join(f"{near(i)} {x}" for i, x in dc)
                else: duty = first(row, H["duty"])
                sup = first(row, H.get("sup"))
                if not name: continue
                if not duty and not sup and not unit:
                    if len(name) <= 60 and not re.match(r"^\d", name): sec(name.rstrip(":")); sub = None
                    continue
                if unit in ("-", "–", "#") or " / " in unit and not re.search(r"\d", unit): unit = ""   # (an option list, Yes / No, is no unit)
                if name.upper() in ("DUTY SPECIFICATION", "DUTY SPECIFICAITION", "PARAMETER", "DESCRIPTION"): continue
                v = sup if sup and not SAY.match(sup) else duty
                if not v or SAY.match(v) or v.lower() in ("yes / no", "tba", "tbc", "tbd", "by vendor", "vendor to advise", "vendor to confirm", "-", "vta", "vendor to advise standard"): continue
                if unit and (re.search(r"\d", unit) or v.lower().startswith(unit.lower()) or unit.lower() in v.lower().split()): unit = ""   # (IP56, not IP56 IP; a range in the unit column is no unit)
                L = S[None]
                if not any(f[0] == name for f in L[-1][1]): L[-1][1].append([name, v, unit])
    return {k: [x for x in v if x[1]] for k, v in S.items() if any(x[1] for x in v)}

# what the lists already say about a tag: every value of its entries, and the numbers by quantity
QTY = [("power", r"\bpower|kw\b", ("kw",)), ("voltage", r"voltage", ("v", "kv")), ("speed", r"speed|rpm", ("rpm", "r/min")),
       ("mass", r"mass|weight", ("kg", "t", "tonne")), ("flow", r"flow|capacity", ("m³/h", "m3/h", "t/h", "tph", "l/s")), ("head", r"\bhead\b", ("m",)),
       ("current", r"current", ("a",)), ("frequency", r"frequency", ("hz",))]
nk = lambda s: re.sub(r"[^a-z0-9.]", "", str(s).lower())
num = lambda s: [float(x.replace(",", "")) for x in re.findall(r"\d[\d,]*\.?\d*", str(s))]
MAIN = re.compile(r"^(rated |nominal |motor |installed |absorbed |main |drive |design |operating )*(power|voltage|speed|mass|weight|flow|flow ?rate|head|current|frequency)( rating)?( \(.*\))?$", re.I)
def qty(name, unit):
    if not MAIN.match(name.strip()): return None   # (only the main figure: a fire panel's supply voltage is not the motor's)
    n, u = name.lower(), unit.lower().strip()
    for q, rx, us in QTY:
        if re.search(rx, n) and (not u or u in us): return q
    return None
REC = {}
for t, rows in DB["data"].items():
    f = DB["types"][t]["f"]
    for r in rows:
        if r and r[0]: REC.setdefault(r[0], []).append((t, dict(zip(f, r))))

out, clash = {}, []
for n, v in sorted(ix.items()):
    if "-DSH-" not in n or not v.get("doc"): continue
    tags = [t for t, m in LK["t"].items() if n in m.get("d", [])]
    got = read(os.path.join(R, v["file"]))
    tags = list(dict.fromkeys(tags + [k for k in got if k and k in REC]))   # (a column per item: those items too)
    # (and the equipment its first page names: "EQUIPMENT NUMBER(S): F13-PP-401 / F13-PP-402", a handful at most)
    p1 = [t for t in dict.fromkeys(re.findall(r"\bF\d{2,3}-[A-Z]{2,4}-\d{3}[A-Z]?\b", pymupdf.open(os.path.join(R, v["file"]))[0].get_text())) if t in REC]
    code = lambda t: (lambda m: m.group(1) + (m.group(2) or "") if m else t)(re.match(r"F\d+-?([A-Z]+)-?\d+[A-Z]?(-[A-Z]+)?$", t))   # (F23PP651-VS: PP-VS, a drive, not the pump)
    if tags: p1 = [t for t in p1 if code(t) in {code(x) for x in tags}]   # (a VSD sheet naming the pumps it drives: not the pumps' datasheet)
    if 0 < len(p1) <= 6: tags = list(dict.fromkeys(tags + p1))
    if not tags: continue
    for tag in tags:
        secs = got.get(tag) or got.get(None) or []
        recs = REC.get(tag, []); vals = [nk(x) for _, r in recs for k, x in r.items() if k not in ("Equipment number",) and len(nk(x)) >= 3]
        have = {}
        for t, r in recs:
            for k, x in r.items():
                q = qty(k, "kw" if "kw" in k.lower() else "")
                if q and num(x): have.setdefault(q, (k, x, t))
        kept = []
        for s, fs in secs:
            fs2 = []
            for name, val, unit in fs:
                if len(nk(val)) >= 3 and any(nk(val) in x for x in vals): continue   # (the list says it already)
                q = qty(name, unit)
                if q and q in have and num(val) and num(have[q][1]):
                    a, b = num(val)[0], num(have[q][1])[0]
                    if abs(a - b) <= .01 * max(a, b): continue
                    clash.append({"tag": tag, "field": name, "ds": f"{val} {unit}".strip(), "rec": have[q][1], "recf": have[q][0], "list": have[q][2], "doc": n, "rev": v.get("rev", "")})
                    continue
                fs2.append([name, val, unit])
            if fs2: kept.append([s, fs2])
        # (pills: a section of 4 or more is its own, the rest together in General)
        pills, gen = [], []
        for s, fs in kept:
            if len(fs) >= MINP and s != "General": pills.append([s.title() if s.isupper() else s, fs])
            else: gen += fs
        if gen: pills.insert(0, ["General", gen])
        if pills: out.setdefault(tag, []).append({"n": n, "r": v.get("rev", ""), "p": pills})
json.dump(out, open(os.path.join(R, "ds-data.json"), "w"), ensure_ascii=False, separators=(",", ":"))
json.dump(clash, open(os.path.join(R, "tools", "ds_clash.json"), "w"), ensure_ascii=False, indent=0)
print(len(out), "tags with datasheet data,", sum(len(p[1]) for L in out.values() for d in L for p in d["p"]), "values,", len(clash), "clashes ->",
      os.path.getsize(os.path.join(R, "ds-data.json")) // 1024, "KB")
