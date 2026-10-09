"""Electrical data into the app: reads tools/elec_rows.json (tools/build_elec.py) and adds to search-data.json
  elec   Equipment (elec): electrical equipment with no MEL entry (switchboards, drives, LCS, isolators, JBs...)
  elx    the electrical data of MEL equipment (hidden: it shows inside the mech item's page, under "Electrical")
  cable  Cables
and to issues.json the clashes, category Electrical: electrical lists against the MEL (electrical is taken as true:
win 2), and electrical lists against each other (the newest issue is taken as true).

  python3 tools/build_elec_data.py        (after tools/build_search.py / build_tsf.py, before tools/build_issues.py
                                           is rerun: the Electrical rows are re-added here each time)
Rules: the same field in several electrical lists: the newest issue date wins. Voltage: a MEL voltage class of 1 kV
(LV) matches any supply up to 1000 V. A drive, starter, LCS or isolator (F16AG421-VS, F75PV414-LCS) belongs to its
equipment (F16-AG-421); its cables are listed on that equipment too. TSF lists (the 4xxxx series and T00) set
Project TSF.
"""
import json, os, re, collections
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = json.load(open(os.path.join(R, "tools", "elec_rows.json"))); DOCS, ROWS = E["docs"], E["rows"]
SD = json.load(open(os.path.join(R, "search-data.json")))
for k in ("elec", "elx", "cable"): SD["types"].pop(k, None); SD["data"].pop(k, None)
MF = SD["types"]["mel"]["f"]; MEL = {r[0]: r for r in SD["data"]["mel"]}
nk = lambda s: re.sub(r"[^A-Z0-9]", "", str(s).upper())
MELK = {nk(k): k for k in MEL}
def tagfix(t):
    t = re.sub(r"\s+", "", str(t or "")).upper().strip("-")
    return t if re.match(r"^[A-Z]\d{2,3}", t) else ""
def tsf(doc): return bool(re.search(r"-T\d\d-|-EL-4\d{4}$", doc))
def dtitle(doc):
    t = re.sub(r"\s+", " ", DOCS[doc]["title"]).strip(); return t[:1] + t[1:].lower() if t.isupper() else t
def dkey(doc): d = DOCS[doc]; return (d.get("date") or "0000", d.get("rev") or "")
def src(doc, pg): return f"{doc} Rev {DOCS[doc]['rev']}, page {pg}"
# ---- header -> field
CAB = [("cable", r"^cable (number|no\.?|tag|ref)"), ("from", r"^(from|cable origin) equip|equip\.? number - from"), ("to", r"^(to|cable destination) equip|equip\.? number - to"),
       ("from_name", r"^from equipment name|equipment name - from"), ("to_name", r"^to equipment name|equipment name - to"),
       ("from_loc", r"^from location|location - from"), ("to_loc", r"^to location|location - to"),
       ("size", r"ductor size"), ("ins", r"nsula"), ("cores", r"cores"), ("cond", r"^s? ?conductor$"), ("constr", r"construction$|^construction"),
       ("sheath", r"sheath"), ("ctype", r"cable type|cable description"), ("len", r"length"), ("inst", r"installation"),
       ("sup", r"supplied|supplier"), ("instb", r"installed|installer"), ("com", r"comment"), ("rev", r"^rev"), ("scm", r"schematic|drawing"), ("status", r"status")]
EQ = [("tag", r"^equip(ment|\.)? ?(number|no\.?)$"), ("name", r"^equipment (name|description)$"), ("qty", r"^qty"), ("desc", r"^description"), ("type", r"^type$"),
      ("make", r"^make$|manufacturer"), ("model", r"^model$"), ("loc", r"^location$"), ("fed", r"^fed from$|^mcc( no\.?)?$"), ("sup", r"supplied|supplier"),
      ("instb", r"installed|installer"), ("std", r"standard spec"), ("ref", r"reference drawing"), ("kw", r"name ?plate.*kw|nameplate \(kw\)"), ("volt", r"^voltage"),
      ("ltype", r"^load type"), ("duty", r"^duty"), ("module", r"^module"), ("flc", r"^(approx\. )?full load current \(a\)$"), ("cb", r"^circuit breaker model"),
      ("ol", r"^electronic overload model"), ("elr", r"^elr make"), ("scm", r"^schematic"), ("sld", r"^single line"), ("stage", r"^load stage"), ("status", r"^status"),
      ("rev", r"^rev$"), ("com", r"^comment")]
def fields(rec, table):
    out, side = {}, ""
    for h, v in rec.items():
        hl = h.lower().strip(); key = None
        for k, rx in table:
            if re.search(rx, hl): key = k; break
        if table is CAB:
            if key in ("from", "to"): side = key
            elif key is None and re.fullmatch(r"equipment name", hl) and side: key = side + "_name"
            elif key is None and re.fullmatch(r"location", hl) and side: key = side + "_loc"
        if key and key not in out: out[key] = v
    return out
CABLE_RX = re.compile(r"^[A-Z]\d{2,3}[A-Z0-9]*(-[A-Z0-9]+)*-[A-Z]{1,3}\d{1,2}(-[A-Z]{1,2})?$")
cab = collections.defaultdict(dict)    # cable -> doc -> (fields, page)
eqp = collections.defaultdict(dict)    # tag -> doc -> (fields, page)
ends = collections.defaultdict(dict)   # tag -> name/loc seen at cable ends
for x in ROWS:
    r = x["r"]; doc, pg = x["doc"], x["pg"]
    c = fields(r, CAB); cn = tagfix(c.get("cable", ""))
    if cn and CABLE_RX.match(cn):
        for s in ("from", "to"): c[s] = tagfix(c.get(s, ""))
        cab[cn].setdefault(doc, (c, pg))
        for s in ("from", "to"):
            t = c.get(s)
            if t:
                if c.get(s + "_name"): ends[t].setdefault("name", c[s + "_name"])
                if c.get(s + "_loc"): ends[t].setdefault("loc", c[s + "_loc"])
        continue
    e = fields(r, EQ); t = tagfix(e.get("tag", ""))
    if t and re.match(r"^[A-Z]\d{2,3}-?[A-Z]{2,4}", t) and not CABLE_RX.match(t): eqp[t].setdefault(doc, (e, pg))
# ---- merge, newest issue first
issues = []
def newest(per):   # [(doc, fields, pg)] newest first
    return sorted(((d, f, p) for d, (f, p) in per.items()), key=lambda z: dkey(z[0]), reverse=True)
def num(v):
    m = re.search(r"-?\d+(?:\.\d+)?", str(v or "").replace(",", "")); return float(m.group()) if m else None
def volts(v):
    s = str(v or "").upper().replace(" ", ""); n = num(s)
    if n is None: return None
    return n * 1000 if "KV" in s or (n < 50 and "V" not in s.replace("KV", "")) and n <= 33 and "KV" in s else n
def vnorm(v):
    s = str(v or "").upper().replace(" ", ""); n = num(s)
    if n is None: return None
    return n * 1000 if "KV" in s else n
def differ(k, a, b):
    if k == "kw": x, y = num(a), num(b); return x is not None and y is not None and abs(x - y) > 0.01
    if k == "volt": x, y = vnorm(a), vnorm(b); return x is not None and y is not None and abs(x - y) > 1
    if k == "fed": return tagfix(str(a).split()[0]) != tagfix(str(b).split()[0])
    return nk(a) != nk(b)
def merged(per, keys, what):
    out, srcs, nw = {}, [], newest(per)
    for d, f, p in nw:
        srcs.append(src(d, p))
        for k, v in f.items():
            if k not in out: out[k] = (v, d, p)
            elif k in keys and differ(k, out[k][0], v):
                a, b = out[k], (v, d, p)
                issues.append({"cat": "Electrical", "sev": "Clash", "item": f"{what} {LBL[k][0].lower() + LBL[k][1:]}", "field": LBL[k], "win": 2,
                    "v1": str(b[0]), "d1": f"{dtitle(b[1])} {b[1]} Rev {DOCS[b[1]]['rev']}", "date1": DOCS[b[1]]["date"],
                    "v2": str(a[0]), "d2": f"{dtitle(a[1])} {a[1]} Rev {DOCS[a[1]]['rev']}", "date2": DOCS[a[1]]["date"],
                    "note": f"The two electrical lists differ; the newer issue ({a[1]}) is taken as true."})
    return {k: v[0] for k, v in out.items()}, srcs, [d for d, _, _ in nw]
LBL = {"kw": "Rating (kW)", "volt": "Voltage", "duty": "Duty / standby", "fed": "Fed from"}
CODE = {"SW": "Switchboard / MCC", "DB": "Distribution board", "LCS": "Local control station", "VS": "Variable speed drive", "ISL": "Isolator", "JB": "Junction box",
        "TR": "Transformer", "TX": "Transformer", "SR": "Switchroom", "UPS": "UPS", "RIO": "Remote IO panel", "COM": "Communications rack", "FOB": "Fibre optic break out",
        "NR": "Neutral earthing resistor", "SS": "Soft starter", "AC": "Air conditioner", "CP": "Control panel", "ETH": "Ethernet switch", "ANT": "Antenna",
        "RTU": "Remote telemetry unit", "PE": "Power factor equipment", "XE": "Earth electrode", "MB": "Marshalling box", "BA": "Battery", "FIP": "Fire indicator panel",
        "DPS": "Distribution panel", "DCS": "DCS panel", "HF": "Harmonic filter", "EB": "Earth bar", "GE": "Generator", "HTR": "Heater", "SH": "Space heater"}
def kind(t):
    m = re.match(r"^[A-Z]\d{2,3}(?:-([A-Z]{2,4})-\d|[A-Z]{2,4}\d{3,4}[A-Z]?-([A-Z]{2,4})|([A-Z]{2,4}))", t)
    c = m and (m.group(2) or m.group(1) or m.group(3)) or ""
    return CODE.get(c, "")
def parent(t):   # the MEL equipment a drive / LCS / isolator / starter belongs to
    m = re.match(r"^([A-Z]\d{2,3})-?([A-Z]{2,4})-?(\d{3,4}[A-Z]?)(?:-?[A-Z]{2,4}\d{0,2})?$", t)
    if not m: return ""
    p = MELK.get(nk(m.group(1) + m.group(2) + m.group(3)), "")
    return p if p and nk(p) != nk(t) else ""
# ---- MEL comparison (electrical wins)
MI = {n: i for i, n in enumerate(MF)}
def mel(tag, n): r = MEL[tag]; i = MI[n]; return r[i] if i < len(r) else ""
def lvclass(v): s = str(v or "").upper().replace(" ", ""); return s in ("1KV", "1000V", "LV", "0.6/1KV", "0.6/1")
def melclash(tag, k, ev, docs):
    mf = {"kw": "Installed power (kW)", "volt": "Voltage", "duty": "Duty / standby"}[k]; mv = mel(tag, mf)
    if not mv or not ev: return
    if k == "volt" and lvclass(mv) and (vnorm(ev) or 0) <= 1000: return
    if k == "duty": a, b = nk(mv), nk(ev); same = a == b or (a.startswith("DUTY") and b.startswith("DUTY")) or (a.startswith("STANDBY") and b.startswith("STANDBY"))
    else: same = not differ(k, mv, ev)
    if same: return
    d = docs[0]
    issues.append({"cat": "Electrical", "sev": "Clash", "item": f"{tag} {mf.split(' (')[0].lower()}", "field": mf, "win": 2,
        "v1": mv, "d1": "MEL 2000-F00-LST-ME-10001 Rev 0", "date1": "2025-12-26",
        "v2": ev + ("" if k != "kw" else " kW"), "d2": f"{dtitle(d)} {d} Rev {DOCS[d]['rev']}", "date2": DOCS[d]["date"],
        "note": f"MEL says {mv}; the electrical list says {ev}{' kW' if k == 'kw' else ''}. Electrical is taken as true."})
# ---- build records
EF = ["Equipment number", "Equipment name", "Type", "Description", "Rating (kW)", "Voltage", "Load type", "Duty / standby", "Fed from", "MCC module",
      "Full load current (A)", "Circuit breaker", "Overload relay", "Earth leakage relay", "Make", "Model", "Quantity", "Location", "Belongs to",
      "Supplied by", "Installed by", "Schematic", "Single line diagram", "Reference drawing", "Standard specification", "Electrical status", "Comments", "Source", "Project"]
MAP = {"name": "Equipment name", "type": "Type", "desc": "Description", "kw": "Rating (kW)", "volt": "Voltage", "ltype": "Load type", "duty": "Duty / standby",
       "fed": "Fed from", "module": "MCC module", "flc": "Full load current (A)", "cb": "Circuit breaker", "ol": "Overload relay", "elr": "Earth leakage relay",
       "make": "Make", "model": "Model", "qty": "Quantity", "loc": "Location", "sup": "Supplied by", "instb": "Installed by", "scm": "Schematic", "sld": "Single line diagram",
       "ref": "Reference drawing", "std": "Standard specification", "status": "Electrical status", "com": "Comments"}
def vfmt(k, v):
    if k == "volt" and re.fullmatch(r"\d+(\.\d+)?", v): return v + " V"
    return v
elec, elx = [], []
alltags = set(eqp) | set(ends)
for t in sorted(alltags):
    m, srcs, docs = merged(eqp.get(t, {}), {"kw", "volt", "duty", "fed"}, t) if t in eqp else ({}, [], [])
    rec = {"Equipment number": t}
    for k, v in m.items():
        if k in MAP: rec[MAP[k]] = vfmt(k, v)
    if "Equipment name" not in rec and ends.get(t, {}).get("name"): rec["Equipment name"] = ends[t]["name"]
    if "Location" not in rec and ends.get(t, {}).get("loc"): rec["Location"] = ends[t]["loc"]
    if "Type" not in rec and kind(t): rec["Type"] = kind(t)
    p = parent(t)
    if p: rec["Belongs to"] = p
    cdocs = sorted({d for c in cab.values() for d, (f, _) in c.items() if f.get("from") == t or f.get("to") == t}, key=dkey, reverse=True)
    if not srcs and cdocs: srcs = [f"{d} Rev {DOCS[d]['rev']} (cable schedule)" for d in cdocs[:3]]
    rec["Source"] = "; ".join(dict.fromkeys(srcs))
    alld = docs or cdocs
    if alld and all(tsf(d) for d in alld): rec["Project"] = "TSF"
    mk = MELK.get(nk(t))
    if mk:   # MEL equipment: its electrical data, the overlapping fields compared with the MEL
        rec["Equipment number"] = mk
        for k, f in (("kw", "Rating (kW)"), ("volt", "Voltage"), ("duty", "Duty / standby")):
            if rec.get(f) and docs: melclash(mk, k, rec[f].replace(" V", "") if k == "volt" else rec[f], docs)
            mf = {"kw": "Installed power (kW)", "volt": "Voltage", "duty": "Duty / standby"}[k]
            if rec.get(f) and mel(mk, mf): rec.pop(f)   # shown once, on the MEL row (red when they differ)
        rec.pop("Equipment name", None); rec.pop("Type", None); rec.pop("Belongs to", None)
        if mel(mk, "Project") if "Project" in MI else False: rec.pop("Project", None)
        if len([k for k in rec if k not in ("Equipment number", "Source", "Project", "Location")]): elx.append(rec)
    else: elec.append(rec)
CF = ["Cable number", "From", "From name", "From location", "To", "To name", "To location", "Cable", "Size (mm²)", "Cores", "Insulation (kV)", "Conductor",
      "Construction", "Sheath", "Length (m)", "Installation", "Supplied by", "Installed by", "Equipment", "Schematic", "Comments", "Cable revision", "Source", "Project"]
CM = {"from": "From", "from_name": "From name", "from_loc": "From location", "to": "To", "to_name": "To name", "to_loc": "To location", "ctype": "Cable",
      "size": "Size (mm²)", "cores": "Cores", "ins": "Insulation (kV)", "cond": "Conductor", "constr": "Construction", "sheath": "Sheath", "len": "Length (m)",
      "inst": "Installation", "sup": "Supplied by", "instb": "Installed by", "scm": "Schematic", "com": "Comments", "rev": "Cable revision"}
cables = []
for cn in sorted(cab):
    m, srcs, docs = merged(cab[cn], set(), cn)
    rec = {"Cable number": cn}
    for k, v in m.items():
        if k in CM: rec[CM[k]] = v
    if "Cable" not in rec:
        parts = [m.get("size") and m["size"] + " mm²", m.get("cores"), m.get("cond"), m.get("ins") and m["ins"] + " kV", m.get("constr"), m.get("sheath")]
        if any(parts): rec["Cable"] = " ".join(p for p in parts if p)
    par = [p for p in dict.fromkeys(parent(m.get(s, "")) or (MELK.get(nk(m.get(s, ""))) or "") for s in ("from", "to")) if p]
    if par: rec["Equipment"] = ", ".join(par)
    rec["Source"] = "; ".join(dict.fromkeys(srcs))
    if docs and all(tsf(d) for d in docs): rec["Project"] = "TSF"
    cables.append(rec)
def rows(F, recs):
    out = []
    for r in recs:
        a = [r.get(f, "") for f in F]
        while a and a[-1] == "": a.pop()
        out.append(a)
    return out
SD["types"]["elec"] = {"n": "Equipment (elec)", "doc": "Electrical equipment lists", "rev": "", "f": EF}
SD["types"]["elx"] = {"n": "Electrical data", "doc": "Electrical lists", "rev": "", "f": EF, "hidden": 1}
SD["types"]["cable"] = {"n": "Cable", "doc": "Cable schedules", "rev": "", "f": CF}
SD["types"]["mel"]["n"] = "Equipment (mech)"
SD["data"]["elec"], SD["data"]["elx"], SD["data"]["cable"] = rows(EF, elec), rows(EF, elx), rows(CF, cables)
json.dump(SD, open(os.path.join(R, "search-data.json"), "w"), ensure_ascii=False, separators=(",", ":"))
seen = set(); issues = [i for i in issues if not ((i["item"], i["v1"], i["v2"]) in seen or seen.add((i["item"], i["v1"], i["v2"])))]
# issues: replace the Electrical rows
I = json.load(open(os.path.join(R, "issues.json")))
I["rows"] = [r for r in I["rows"] if r.get("cat") != "Electrical"] + issues
for d, v in DOCS.items(): I["meta"].setdefault("sources", {})[dtitle(d)[:60] + " " + d[-5:]] = {"doc": f"{dtitle(d)} {d} Rev {v['rev']}", "date": v["date"], "status": ""}
json.dump(I, open(os.path.join(R, "issues.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(len(elec), "elec,", len(elx), "MEL items with electrical data,", len(cables), "cables,", len(issues), "clashes",
      collections.Counter(i["field"] for i in issues))
