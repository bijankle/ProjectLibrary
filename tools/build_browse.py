"""Builds browse.json: the names shown on the Browse pills (browse.js), from the Plant Numbering Specification
(2000-F00-STS-GE-10003, tables in sources/num) and the lists themselves.
  areas: {"F13": "Milling & Classification"}   equip: {"PP": "Pump"}   inst: {"L": ["Level", "Light"]} (1st / later letter)
  svc:   {"BW": "Bore Water (Raw Water)"}      (line service codes, from the line list)
Usage: python3 tools/build_browse.py   (after tools/build_sources.py and tools/build_search.py)
"""
import json, os
ROOT = os.path.join(os.path.dirname(__file__), "..")
S = os.path.join(ROOT, "sources")
ix = json.load(open(os.path.join(S, "index.json")))["num"]["sheets"]
rows = lambda i: [[c for c in r] for r in json.load(open(os.path.join(S, "num", f"{i}-0.json")))]
out = {"areas": {}, "equip": {}, "inst": {}, "svc": {}}
for i, sh in enumerate(ix):
    cap = sh.get("caption", "")
    if cap.startswith("PREFIX"):
        for r in rows(i)[1:]:
            v = [x for x in r if x != ""]
            if len(v) >= 3 and len(str(v[1])) == 2: out["areas"][f"{v[0]}{v[1]}"] = str(v[2]).replace(" – ", " · ")
    elif cap.startswith("EQUIPMENT CODE"):
        for r in rows(i)[1:]:
            v = [x for x in r if x != ""]
            if len(v) >= 2 and str(v[0]).isalpha() and len(str(v[0])) <= 4: out["equip"][str(v[0])] = str(v[1])
    elif cap.startswith("1st Letter"):
        for r in rows(i)[1:]:
            first, later = (r[0], r[2]) if len(r) > 2 else ("", ""), (r[4], r[6]) if len(r) > 6 else ("", "")
            for L, t, k in ((r[0], r[2], 0), (r[4] if len(r) > 4 else "", r[6] if len(r) > 6 else "", 1)):
                if L and t: out["inst"].setdefault(L, ["", ""])[k] = str(t)
out["areas"].setdefault("F00", "General Fimiston Site")
# the spec's letter table is only partly readable; standard ISA 5.1 meanings fill the gaps
ISA = {"A": ["Analysis", "Alarm"], "B": ["Burner / Flame", ""], "C": ["Conductivity", "Control"], "D": ["Density", "Differential"],
       "E": ["Voltage", "Element"], "F": ["Flow", "Ratio"], "G": ["", "Gauge / Glass"], "H": ["Hand", "High"], "I": ["Current", "Indicating"],
       "J": ["Power", "Scan"], "K": ["Time", "Control station"], "L": ["Level", "Low"], "M": ["Motor", "Middle"], "O": ["", "Open"],
       "P": ["Pressure", "Point"], "Q": ["Quantity", "Totalising"], "R": ["Radiation", "Recording"], "S": ["Speed", "Switch"],
       "T": ["Temperature", "Transmitter"], "U": ["Multivariable", "Multifunction"], "V": ["Vibration", "Valve"], "W": ["Weight", "Well"],
       "X": ["Miscellaneous", "Miscellaneous"], "Y": ["Event / State", "Relay / Compute"], "Z": ["Position", "Actuator"]}
for L, (a, b) in ISA.items():
    v = out["inst"].setdefault(L, ["", ""]); v[0] = v[0] or a; v[1] = v[1] or b
d = json.load(open(os.path.join(ROOT, "search-data.json")))
f = d["types"]["line"]["f"]; si, di = f.index("Service"), f.index("Service description")
for r in d["data"]["line"]:
    if len(r) > di and r[si] and r[di]: out["svc"].setdefault(r[si], r[di])
json.dump(out, open(os.path.join(ROOT, "browse.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print({k: len(v) for k, v in out.items()})
