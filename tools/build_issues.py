"""Builds issues.json for the Checks page (issues.html): contradictions and gaps between the project documents.
Reads search-data.json (so run tools/build_search.py first) plus the decisions made while building the app.
Usage: python3 tools/build_issues.py
Each row: cat (category), sev (Decision / Clash / Missing / Placeholder / Check), item, v1, d1 (value and document 1),
v2, d2 (value and document 2), note (which one the app takes as true and why).
"""
import json, os, re
HERE = os.path.dirname(__file__)
d = json.load(open(os.path.join(HERE, "..", "search-data.json")))
T, D = d["types"], d["data"]
def rows(t):
    f = T[t]["f"]; return [dict(zip(f, r + [""] * (len(f) - len(r)))) for r in D[t]]
N = lambda s: re.sub(r"[\s\-_/.]", "", str(s).upper())
MEL = "MEL 2000-F00-LST-ME-10001 Rev 0"; INS = "Instrument List 2000-F00-LST-IC-11011"; CV = "Control Valve List 2000-F00-LST-PP-10003"
LINE = "Line List 2000-F00-LST-PP-10001 Rev 2"; PDC = "PDC 2000-F00-DCR-PR-10002 Rev 4"; PFD = "Stage 1 PFDs 2000-F00-PFD-PR series"
CP1 = "Plant General Control Philosophy Stage 1 2000-F00-REP-PR-10001"
mel, ins, cv, line = rows("mel"), rows("ins"), rows("cv"), rows("line")
out = []
def add(cat, sev, item, v1, d1, v2, d2, note): out.append(dict(cat=cat, sev=sev, item=item, v1=v1, d1=d1, v2=v2, d2=d2, note=note))

# ---------- decisions taken while building the app (document against document) ----------
add("Process routing", "Decision", "Rougher 1 concentrate destination", "Straight to the final concentrate hopper", PFD,
    "To the Jameson cleaner: cleaner feed includes all rougher and scavenger concentrate (7.4); only cleaner concentrate feeds the concentrate thickener (8.1)", PDC,
    "PDC taken as true: it is the later design basis and people update P&IDs and the PDC but often not the PFDs.")
add("Equipment count", "Decision", "CIL2 number of tanks", "6 tanks listed (F30-TK-32A to 32F)", MEL, "7 tanks (section 10.2)", PDC,
    "PDC taken for the tank count shown on the PFD; MEL tags shown as listed. Raise with the MEL owner.")
add("Equipment count", "Decision", "CIL3 number of tanks", "7 tanks listed (F30-TK-62A to 62G, G from enabling works)", MEL, "6 tanks (section 10.3)", PDC,
    "PDC count used for design figures; the MEL tank G is shown in the equipment data. Check whether tank G is in adsorption service.")
add("Tag numbering", "Decision", "UFG 2 IsaMill equipment number", "F28-MUF-402 (UFG 2), F28-MUF-403 (UFG 3), no F28-MUF-401", MEL,
    "Power indication JI28003 and other UFG 2 instruments listed against F28-MUF-401", INS,
    "MEL taken as true for equipment numbers; the instrument list equipment reference looks one number out. Raise with instrumentation.")
add("Tag numbering", "Decision", "CIL4 oxygen control loop tags", "Oxygen flow control on both leach tanks and side lances", CP1,
    "Tags shown as 21DEL placeholders (deleted or not yet numbered)", INS,
    "Loop shown from the control philosophy; device tags shown as not specified until the instrument list is updated.")
add("Process routing", "Decision", "Raw water tank source", "Dam 2 (South)", PDC + " section 21.2 (Source)", "Dam 3 (Source, Greenfields)", PDC + " section 21.2",
    "Dam 3 shown, matching the PFD and the greenfields entry; the Dam 2 line appears to describe the existing arrangement.")
add("Process routing", "Decision", "Gland water source", "Dam 2 (South) via the existing gland water tank", PDC + " section 20.6 (existing services)",
    "Raw Water Tank (new gland water pumps)", PDC + " section 21.3 (new services)", "Section 21.3 taken: it describes the new plant; 20.6 is the existing Fimiston system.")
add("Process routing", "Decision", "Cleaner scavenger tails recycle", "Recycle 'back to Cleaner Flotation Cell Feed Hopper' (comment)", PDC + " section 7.5 comment",
    "Cleaner scavenger total feed = new feed + its own tails recycle (mass balance)", PDC + " section 7.5 figures",
    "Mass balance taken: the recycle returns to the cleaner scavenger itself (same arrangement as the cleaner); the comment looks copied from 7.4.")
add("Figures", "Decision", "Nominal flotation concentrate and gold", "876 kt/a concentrate, 1.19 Moz/a gold (design grade case)", PDC + " section 2.7, 2.8 (design grade column)",
    "637 kt/a concentrate, 1.11 Moz/a gold (nominal column)", PDC + " section 2.7, 2.8 (nominal column)", "Nominal column used as nominal; design grade figures quoted as design grade.")
add("Instrument", "Decision", "Crusher 2 gap actuator", "Crusher gap adjusted (drawn as a motor on the first app version)", PFD,
    "ZT12061 mantle position transmitter on the hydraulic setting cylinder", INS, "Instrument list taken: the final element is a hydraulic mantle actuator.")

# ---------- automatic checks between the lists ----------
insk = {}
for r in ins: insk.setdefault(N(r["Instrument tag"]), r)
melk = {N(r["Equipment number"]): r for r in mel}
linek = {N(r["Line number"]): r for r in line}
lineu = {}
for r in line:
    m = re.match(r"(\d{2}-\d{4})", r["Line number"])
    if m: lineu.setdefault(m.group(1), r)
for r in cv:
    tag, i = r["Valve tag"], insk.get(N(r["Valve tag"]))
    if not i:
        add("Valve", "Missing", tag, f"{r['Valve type']} valve at {r['Location'] or 'location not given'}", CV, "Not listed", INS, "Valve shown from the control valve list only.")
    else:
        if r["P&ID"] and i["P&ID"] and r["P&ID"] != i["P&ID"]:
            add("Valve", "Clash", tag, "P&ID " + r["P&ID"], CV, "P&ID " + i["P&ID"], INS, "Both kept in their own records; control valve list used for valve data. Check which drawing is current.")
        vs = re.sub(r"\D", "", i["Valve size"] or "")
        if vs and r["Valve size (mm)"] and vs != re.sub(r"\D", "", r["Valve size (mm)"]):
            add("Valve", "Clash", tag, f"Valve size {r['Valve size (mm)']} mm", CV, f"Valve size {i['Valve size']}", INS, "Control valve list taken (valve datasheet source).")
    L = r["Line number"]
    if L:
        lr = linek.get(N(L))
        if lr:
            if r["Line size (mm)"] and lr["Size (DN)"] and re.sub(r"\D", "", r["Line size (mm)"]) != re.sub(r"\D", "", lr["Size (DN)"]):
                add("Line", "Clash", f"{tag} on {L}", f"Line size {r['Line size (mm)']}", CV, f"Line size DN{lr['Size (DN)']}", LINE, "Line list taken for line data.")
        else:
            m = re.match(r"(\d{2}-\d{4})", L); u = lineu.get(m.group(1)) if m else None
            if u: add("Line", "Clash", f"{tag} line {m.group(1)}", L, CV, u["Line number"], LINE, "Same line number, different service, spec or size. Line list taken for line data; the valve list reference looks out of date.")
            else: add("Line", "Missing", f"{tag} line", L, CV, "Line number not listed", LINE, "No line data available for this valve's line.")
def expand(e):   # "F18-PP-501/502" -> F18-PP-501, F18-PP-502
    parts = [p.strip() for p in re.split(r"/", e) if p.strip()]; first = parts[0]; out = [first]
    for p in parts[1:]: out.append(p if len(p) >= len(first) else first[:len(first) - len(p)] + p)
    return out
ELEC = re.compile(r"^F\d\d-(SR|TR|GE|MCC|RIO|DB|SWB|VSD|UPS|MSB|LCS|PLC|CP|JB|FDP|MMS|HV|LV|SB|DP)-")
seen = set()
for r in ins:
    e = r["Equipment number"]
    if e and re.match(r"^F\d\d-", e) and not all(N(x) in melk for x in expand(e)) and not ELEC.match(e) and e not in seen:
        seen.add(e); n = sum(1 for x in ins if x["Equipment number"] == e)
        add("Equipment", "Missing", e, f"{n} instrument(s) listed against {e} ({r['Equipment description'] or 'no description'})", INS, "Equipment number not listed", MEL,
            "Instrument data kept; the equipment may be a vendor package item or sub-item not broken out in the MEL.")
for r in ins:
    if re.search(r"DEL|TBA|TBC|XXX", r["Instrument tag"]):
        add("Instrument", "Placeholder", r["Instrument tag"], r["Description"] or r["Instrument type"], INS, "", "", "Placeholder or deleted tag; ignored in control loops and shown as not specified.")
for r in ins:
    m = melk.get(N(r["Equipment number"]))
    if m and r["Stage"] in ("Stage 1", "Stage 2") and m["Stage"] in ("Stage 1", "Stage 2") and r["Stage"] != m["Stage"]:
        add("Stage", "Check", r["Instrument tag"] + " on " + m["Equipment number"], "Instrument " + r["Stage"], INS, "Equipment " + m["Stage"], MEL,
            "Often legitimate (Stage 2 instrument added to Stage 1 equipment). Check.")

meta = {"sources": {"MEL": MEL, "Instrument list": INS, "Control valve list": CV, "Line list": LINE, "PDC": PDC}}
json.dump({"meta": meta, "rows": out}, open(os.path.join(HERE, "..", "issues.json"), "w"), ensure_ascii=False, separators=(",", ":"))
from collections import Counter
print(len(out), Counter(r["sev"] for r in out))
