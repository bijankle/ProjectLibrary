"""Builds pfd-equip.js from the MEL, the master instrument list and the control valve list.
Inputs are JSON exports of the three spreadsheets (not committed):
  mel.json    MEL_2000-F00-LST-ME-10001 Rev 0, sheet 'MEL'
  instr.json  Master Instrument List, sheet 'MASTER Instrument List'
  cv.json     Control Valve List, sheet 'Control Valve List'
Usage: python3 tools/build_equip.py <folder with the json files>
"""
import json, re, sys, os
src = sys.argv[1]
mel = json.load(open(os.path.join(src, "mel.json")))
ins = json.load(open(os.path.join(src, "instr.json")))
cvl = json.load(open(os.path.join(src, "cv.json")))

# PFD node id -> MEL equipment numbers (first = primary item)
MAP = {
 "pc1": ["F10-CG-01", "F10-FA-01"], "cos1": ["F10-SP-01", "F10-FB-01A", "F10-FB-01B", "F10-FB-01C", "F10-FB-01D"],
 "pc2": ["F12-CG-401", "F12-BN-401", "F12-FA-401"], "cos2": ["F12-SKP-401", "F13-FA-411", "F13-FA-412", "F13-FA-414", "F13-BN-402"],
 "fimsag": ["F19-MS-61"], "fimpeb": ["F19-CC-65A", "F19-CC-65B"],
 "sag": ["F13-MS-401", "F13-BX-401"], "dscr": ["F13-SC-401"], "peb": ["F13-CC-401", "F13-CC-402", "F13-BN-411", "F13-MD-401", "F13-GA-411", "F13-GA-412"],
 "cfh": ["F13-HP-401", "F13-PP-401", "F13-PP-402"], "cyc": ["F13-CY-401"], "bm": ["F13-MB-401", "F13-BX-402", "F13-BX-403"],
 "trash": ["F13-SL-401", "F13-SL-402", "F13-SL-403", "F13-SL-404"],
 "gcyc": ["F14-CY-411", "F14-CY-412"], "gscr": ["F14-SC-405", "F14-SC-406"], "kn": ["F14-CO-401", "F14-CO-402", "F14-HP-420"],
 "ilr": ["F14-IL-403"], "gew": ["F66-EC-401", "F66-ER-401A", "F66-ER-401B"],
 "ffb": ["F16-BX-411", "F16-SA-401"], "r1": ["F16-CF-411"], "r2": ["F16-CF-412"], "r3": ["F16-CF-413"],
 "s1": ["F16-CF-414"], "s2": ["F16-CF-415"], "s3": ["F16-CF-416"], "s4": ["F16-CF-417"],
 "blow": ["F16-BW-401", "F16-BW-402", "F16-BW-403", "F16-BW-404", "F16-BW-405"],
 "jc": ["F18-CF-501", "F18-PP-501", "F18-PP-502"], "jcs": ["F18-CF-511"], "fch": ["F18-HP-414"], "ftt": ["F17-TH-401", "F17-PP-455", "F17-PP-456"],
 "c4fb": ["F21-FD-431"], **{f"t41{i}": [f"F21-TK-41{i}"] for i in range(1, 9)},
 "ftk": ["F23-TK-404", "F23-PP-466", "F23-PP-467", "F23-PP-468", "F23-PP-469"],
 "lcs4": ["F22-SC-421"], "tv4": ["F22-HP-445"], "el4": ["F22-PR-411", "F22-HT-411"], "eu4": ["F66-TK-461", "F66-TK-471", "F22-TK-442"],
 "ew4": ["F66-EC-411", "F66-EC-412"], "kiln4": ["F22-KN-411", "F22-PK-411"], "sz4": ["F21-SC-420"],
 "ct": ["F30-TH-61"], "fft": ["F35-TK-01A", "F35-TK-01B"], "ufg2": ["F28-MUF-402"], "ufg3": ["F28-MUF-403"], "ufg1": ["F34-MUF-01"],
 "filt": ["F35-FI-01", "F35-FI-21"], "cil1": ["F30-TK-01A", "F30-TK-01B", "F30-TK-02A"], "plt": ["F30-TH-31"],
 "cil2": ["F30-TK-32A", "F30-TK-32B", "F30-TK-32C", "F30-TK-32D", "F30-TK-32E", "F30-TK-32F"],
 "cil3": ["F30-TK-62A", "F30-TK-62B", "F30-TK-62C", "F30-TK-62D", "F30-TK-62E", "F30-TK-62F", "F30-TK-62G"],
 "lcs3": ["F65-SC-471"], "el3": ["F65-PR-61", "F65-PR-62", "F65-PR-63", "F65-PR-64", "F65-TK-61"], "ew3": ["F66-EC-61A", "F66-EC-61B", "F66-EC-62A", "F66-EC-62B", "F66-EC-62C"],
 "kiln3": ["F65-KN-61", "F65-KN-62"], "sz3": ["F30-SC-412"],
 "rg_cu": ["F72-TK-433"], "rg_pax": ["F72-TK-431"], "rg_fr": ["F72-TK-432"], "rg_lime": ["F72-TK-467", "F72-PK-402"],
 "rg_cn": ["F72-TK-437", "F72-TK-439"], "rg_pb": ["F72-TK-438"], "rg_fl": ["F72-PK-401", "F72-TK-465", "F72-TK-466", "F72-PP-691", "F72-PP-692"],
 "rg_hcl": ["F72-TK-435", "F72-TK-424"], "rg_na": ["F72-TK-434"], "rg_h2": ["F72-TK-511", "F72-PP-521", "F72-PP-522", "F72-PP-523", "F72-PP-524"], "rg_lpg": ["F81-TK-01"], "rg_as": ["F72-PK-406", "F72-PK-409"],
 "rwt": ["F24-TK-501", "F24-PW-406", "F24-PW-407"], "gland": ["F24-PW-408", "F24-PW-409", "F24-PW-419", "F24-PW-420"],
 "pwt": ["F24-TK-401"], "hpw": ["F24-PW-401", "F24-PW-402", "F24-PW-417", "F24-PW-418"],
 "air": ["F24-CM-401", "F24-CM-402", "F24-CM-403"], "o2": ["F72-PK-405", "F72-TK-447"], "cnw": ["F75-TK-01", "F75-PW-01A", "F75-PW-01B"],
 "sch": ["F75-TK-481", "F75-TK-482", "F75-PW-481", "F75-PW-482"],
}
FIELDS = [("Equipment Name", "n"), ("Area Description", "ad"), ("Size/Description", "sz"), ("Nominal Duty Point", "nd"), ("Design Duty Point", "dd"),
          ("Material of Construction (Including Lining)", "moc"), ("Installed Power kW", "kw"), ("Voltage", "v"), ("Starter Type", "stt"),
          ("Duty / Standby", "ds"), ("Emergency Power Required", "ep"), ("Status", "sta"), ("Stage", "stg"), ("BF / GF", "bg"),
          ("Supply Type", "sup"), ("Package Number", "pkg"), ("Vendor", "ven"), ("Make / Model", "mm"), ("PFD Number", "pfd"),
          ("P&ID Number", "pid"), ("Reference Drawing", "ref")]
def clean(v):
    if v is None: return ""
    s = str(v).strip()
    return "" if s in ("-", "N/A", "n/a", "TBC", "TBA", "None", "nan") else s
melby = {}
for r in mel:
    e = clean(r.get("Equipment Number"))
    if e and e not in melby: melby[e] = r
cvby = {re.sub(r"\s+", "", clean(r.get("Valve TAG"))): r for r in cvl if clean(r.get("Valve TAG"))}
CVF = [("Valve Type", "ty"), ("Valve Size", "sz"), ("Valve Class", "cl"), ("Control Valve Code", "code"), ("Location Description", "loc"),
       ("Service Fluid", "fl"), ("Line Size", "ls"), ("Flowrate  (m3/h) Min", "qmin"), ("Flowrate  (m3/h) Max", "qmax"),
       ("Inlet Pressure (kPag)", "pin"), ("Solids P80 (µm)", "p80"), ("% Solids (w/w)", "cw"), ("Fluid SG", "sg"),
       ("Power Failure FC / FO / FL", "fail"), ("Actuator Type", "act"), ("Positioner Yes/No", "pos"), ("Valve Manufacturer", "mfr"),
       ("Valve Model No.", "mod"), ("Actuator Model", "am"), ("P&ID", "pid"), ("Stage", "stg")]
def cvrec(tag):
    r = cvby.get(tag)
    if not r: return None
    o = {"tag": clean(r.get("Valve TAG"))}
    for k, s in CVF:
        v = clean(r.get(k))
        if v: o[s] = v
    return o
# instrument types kept on the equipment panel (skip hand switches, lamps, local gauges on every pump)
SKIP = re.compile(r"^(HS|HY|XL|ZL|YL|ZSO|ZSC|HMI|JY|YY|UA|UY|KY|XY|EY|PI|TI|LG|FG|XA)$")
insby = {}
for r in ins:
    e = clean(r.get("eq"))
    if e: insby.setdefault(e, []).append(r)
out = {}; allcv = {}
for node, eqs in MAP.items():
    items = []
    for e in eqs:
        r = melby.get(e)
        o = {"tag": e}
        if r:
            for k, s in FIELDS:
                v = clean(r.get(k))
                if v: o[s] = v
        else:
            o["missing"] = 1
        items.append(o)
    inst = []; seen = set()
    for e in eqs:
        for r in insby.get(e, []):
            t = clean(r.get("tag"))
            if not t or t in seen or SKIP.match(clean(r.get("itype"))): continue
            seen.add(t)
            i = {"tag": t, "ty": clean(r.get("itypen")) or clean(r.get("itype")), "eq": e}
            loc = clean(r.get("loc"))
            if loc: i["loc"] = loc
            for k, s in (("fluid", "fl"), ("units", "u"), ("make", "mk"), ("model", "md"), ("pid", "pid")):
                v = clean(r.get(k))
                if v: i[s] = v
            c = cvrec(t)
            if c: i["cv"] = 1; allcv[t] = c
            inst.append(i)
    inst.sort(key=lambda i: (0 if re.search(r"Transmitter|Analy|Control|Valve|Element", i["ty"]) else 1, i["tag"]))
    out[node] = {"eq": items, "ins": inst[:80], "insN": len(inst)}
# also expose every instrument used by the PFD loop drawing
LOOPTAGS = open(sys.argv[2]).read().split() if len(sys.argv) > 2 else []
ixt = {clean(r.get("tag")): r for r in ins if clean(r.get("tag"))}
lt = {}
for t in LOOPTAGS:
    r = ixt.get(t)
    if r:
        lt[t] = {"ty": clean(r.get("itypen")) or clean(r.get("itype")), "eq": clean(r.get("eq")), "eqd": clean(r.get("eqd")),
                 "loc": clean(r.get("loc")), "desc": clean(r.get("desc")), "fl": clean(r.get("fluid")), "u": clean(r.get("units")),
                 "mk": clean(r.get("make")), "md": clean(r.get("model")), "pid": clean(r.get("pid"))}
        lt[t] = {k: v for k, v in lt[t].items() if v}
    c = cvrec(t)
    if c: allcv[t] = c
hdr = ("// GENERATED by tools/build_equip.py. Do not edit by hand.\n"
       "// EQUIP_DATA: MEL 2000-F00-LST-ME-10001 Rev 0 rows per PFD node, plus instruments on that equipment from the\n"
       "//   Master Instrument List. CV_DATA: Control Valve List rows keyed by tag without spaces. INSTR_DATA: loop tags.\n")
with open(os.path.join(os.path.dirname(__file__), "..", "pfd-equip.js"), "w") as f:
    f.write(hdr)
    f.write("const EQUIP_DATA = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    f.write("const CV_DATA = " + json.dumps(allcv, ensure_ascii=False, separators=(",", ":")) + ";\n")
    f.write("const INSTR_DATA = " + json.dumps(lt, ensure_ascii=False, separators=(",", ":")) + ";\n")
miss = [(n, i["tag"]) for n, d in out.items() for i in d["eq"] if i.get("missing")]
print("nodes", len(out), "cv", len(allcv), "loop tags found", len(lt), "/", len(LOOPTAGS), "missing MEL", miss)
print("instrument counts", {n: d["insN"] for n, d in out.items() if d["insN"] > 80})
