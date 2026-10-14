"""Builds issues.json for the Checks page (issues.html): contradictions and gaps between the project documents.
Reads search-data.json (so run tools/build_search.py first), tools/doc_revs.json (revision block dates, from tools/doc_revs.py)
and the decisions made while building the app.
Usage: python3 tools/build_issues.py
Each row: cat (category), sev (Decision / Clash / Missing / Placeholder / Check), item, v1, d1, date1 (value, document 1 and its
revision date), v2, d2, date2 (the same for document 2), note (which one the app takes as true and why).
Rule for clashes: the document with the more recent revision date is taken as true, unless a row says why not.
"""
import datetime, json, os, re
HERE = os.path.dirname(__file__)
d = json.load(open(os.path.join(HERE, "..", "search-data.json")))
REV = json.load(open(os.path.join(HERE, "doc_revs.json")))
T, D = d["types"], d["data"]
def rows(t):
    f = T[t]["f"]; return [dict(zip(f, r + [""] * (len(f) - len(r)))) for r in D[t]]
N = lambda s: re.sub(r"[\s\-_/.]", "", str(s).upper())
def doc(k):   # "Instrument List 2000-F00-LST-IC-11011 Rev 1"
    r = REV[k]; return f"{r['title']} {r['number']} Rev {r['rev']}"
def dt(k): return REV[k]["date"] if k in REV else ""
def nice(k): return f"{REV[k]['title']} Rev {REV[k]['rev']} ({datetime.date.fromisoformat(REV[k]['date']):%d %b %Y})"
def newer(k1, k2):   # sentence saying which document is newer; the newer one is taken as true
    if dt(k1) == dt(k2): return f"Both from {nice(k1)}, so the date does not decide it."
    a, b = (k1, k2) if dt(k1) > dt(k2) else (k2, k1)
    return f"{nice(a)} is newer than {nice(b)}, so it is taken as true."
MEL, INS, CV, LINE, PDC, PFD, CP1 = "mel", "ins", "cv", "line", "pdc", "pfd", "cp1"
mel, ins, cv, line = rows("mel"), rows("ins"), rows("cv"), rows("line")
out = []
def add(cat, sev, item, v1, k1, v2, k2, note, x1="", x2=""):
    out.append(dict(cat=cat, sev=sev, item=item, v1=v1, d1=(doc(k1) + x1) if k1 in REV else (k1 or ""), date1=dt(k1),
                    v2=v2, d2=(doc(k2) + x2) if k2 in REV else (k2 or ""), date2=dt(k2), note=note))

# ---------- decisions taken while building the app (document against document) ----------
add("Process routing", "Decision", "Rougher 1 concentrate destination",
    "Solid (normal) line to the cleaner feed through sampler F16-SA-425; dashed (alternative) line straight to the final concentrate hopper F18-HP-414 through sampler F16-SA-426", PFD,
    "To the Jameson cleaner: cleaner feed includes all rougher and scavenger concentrate (7.4); only cleaner concentrate feeds the concentrate thickener (8.1)", PDC,
    newer(PFD, PDC) + " It agrees with the PDC on the normal route; the dashed bypass is an alternative route. An earlier app note read the bypass as the main route.", " sheet 10009")
add("Equipment count", "Decision", "CIL2 number of tanks", "6 tanks listed (F30-TK-32A to 32F, existing, in service)", MEL, "7 tanks, including a new tank 32G (section 10.2)", PDC,
    newer(MEL, PDC) + " It confirms the 6 existing tanks, but it is silent on the new Stage 2 tank 32G rather than contradicting it, so 32G is kept as the PDC's Stage 2 addition. Raise with the MEL owner.")
add("Equipment count", "Decision", "CIL3 number of tanks", "7 tanks listed (F30-TK-62A to 62G, G from the enabling works, in service). The as built PFD sheet 10020 also shows 62A to 62G.", MEL,
    "6 tanks (section 10.3), 10,110 m³", PDC,
    newer(MEL, PDC) + " The diagram now shows 7 tanks. The PDC design figures (volume, carbon inventory) are still based on 6 tanks.")
add("Tag numbering", "Decision", "UFG 2 IsaMill equipment number", "F28-MUF-402 (UFG 2), F28-MUF-403 (UFG 3), no F28-MUF-401", MEL,
    "Power indication JI28003 and other UFG 2 instruments listed against F28-MUF-401", INS,
    newer(INS, MEL).replace("so it is taken as true.", "but the newest document of all,") + f" {nice(PFD)}, shows F28-MUF-402 and 403 like the MEL. MEL numbering taken; the instrument list equipment reference looks one number out. Raise with instrumentation.")
add("Tag numbering", "Decision", "CIL4 oxygen control loop tags", "Oxygen flow control on both leach tanks and side lances", CP1,
    "Devices still listed (flow element, transmitter, control valve) but their tags read 21DEL", INS,
    newer(INS, CP1) + " The devices are still in it, only their numbers are deleted or not yet allocated, so the loop is shown with tags as not specified.")
add("Process routing", "Decision", "Raw water tank source", "Dam 2 (South)", PDC, "Dam 3 (Source, Greenfields)", PDC,
    newer(PDC, PDC) + " Dam 3 shown, matching the PFD and the greenfields entry; the Dam 2 line appears to describe the existing arrangement.", " section 21.2 (Source)", " section 21.2")
add("Process routing", "Decision", "Gland water source", "Dam 2 (South) via the existing gland water tank", PDC, "Raw Water Tank (new gland water pumps)", PDC,
    newer(PDC, PDC) + " Section 21.3 taken: it describes the new plant; 20.6 is the existing Fimiston system.", " section 20.6 (existing services)", " section 21.3 (new services)")
add("Process routing", "Decision", "Cleaner scavenger tails recycle", "Recycle 'back to Cleaner Flotation Cell Feed Hopper' (comment)", PDC,
    "Cleaner scavenger total feed = new feed + its own tails recycle (mass balance)", PDC,
    newer(PDC, PDC) + " Mass balance taken: the recycle returns to the cleaner scavenger itself (same arrangement as the cleaner); the comment looks copied from 7.4.", " section 7.5 comment", " section 7.5 figures")
add("Figures", "Decision", "Nominal flotation concentrate and gold", "876 kt/a concentrate, 1.19 Moz/a gold (design grade case)", PDC,
    "637 kt/a concentrate, 1.11 Moz/a gold (nominal column)", PDC, newer(PDC, PDC) + " Nominal column used as nominal; design grade figures quoted as design grade.",
    " section 2.7, 2.8 (design grade column)", " section 2.7, 2.8 (nominal column)")
add("Instrument", "Decision", "Crusher 2 gap actuator", "Crusher gap adjusted, drawn as a motor", "This app (first version)",
    "ZT12061 mantle position transmitter on the hydraulic setting cylinder", INS, "Instrument list taken: the final element is a hydraulic mantle actuator. The app drawing was corrected.")

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
            add("Valve", "Clash", tag, "P&ID " + r["P&ID"], CV, "P&ID " + i["P&ID"], INS, newer(INS, CV) + " Check the P&ID register for the current drawing.")
        vs = re.sub(r"\D", "", i["Valve size"] or "")
        if vs and r["Valve size (mm)"] and vs != re.sub(r"\D", "", r["Valve size (mm)"]):
            add("Valve", "Clash", tag, f"Valve size {r['Valve size (mm)']} mm", CV, f"Valve size {i['Valve size']}", INS, newer(INS, CV) + " The control valve list is the datasheet source, so confirm it is updated.")
    L = r["Line number"]
    if L:
        lr = linek.get(N(L))
        if lr:
            if r["Line size (mm)"] and lr["Size (DN)"] and re.sub(r"\D", "", r["Line size (mm)"]) != re.sub(r"\D", "", lr["Size (DN)"]):
                add("Line", "Clash", f"{tag} on {L}", f"Line size {r['Line size (mm)']}", CV, f"Line size DN{lr['Size (DN)']}", LINE, newer(LINE, CV))
        else:
            m = re.match(r"(\d{2}-\d{4})", L); u = lineu.get(m.group(1)) if m else None
            if u: add("Line", "Clash", f"{tag} line {m.group(1)}", L, CV, u["Line number"], LINE, "Same line number, different service, spec or size. " + newer(LINE, CV) + " The valve list reference looks out of date.")
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
            "Instrument data kept; the equipment may be a vendor package item or sub-item not broken out in the MEL. " + newer(INS, MEL).replace("so it is taken as true.", "so the equipment may simply post-date the MEL."))
for r in ins:
    if re.search(r"DEL|TBA|TBC|XXX", r["Instrument tag"]):
        add("Instrument", "Placeholder", r["Instrument tag"], r["Description"] or r["Instrument type"], INS, "", "", "Placeholder or deleted tag; ignored in control loops and shown as not specified.")
for r in ins:
    m = melk.get(N(r["Equipment number"]))
    if m and r["Stage"] in ("Stage 1", "Stage 2") and m["Stage"] in ("Stage 1", "Stage 2") and r["Stage"] != m["Stage"]:
        add("Stage", "Check", r["Instrument tag"] + " on " + m["Equipment number"], "Instrument " + r["Stage"], INS, "Equipment " + m["Stage"], MEL,
            "Often legitimate (Stage 2 instrument added to Stage 1 equipment). Check. " + newer(INS, MEL))

# ---------- the process control tables against the instrument list (tools/build_pct.py, tools/pct_rows.json) ----------
# Clash: the PCT puts an instrument on a P&ID the instrument list doesn't name for it, and the sheet doesn't show the tag
# either (a tag drawn on both sheets is right on both). Missing: a field instrument the PCT controls (its Tag Source) that
# the instrument list doesn't have.
PR = os.path.join(HERE, "pct_rows.json")
if os.path.exists(PR):
    pct = json.load(open(PR)); insk = {N(r["Instrument tag"]): r for r in ins}
    CT = json.load(open(os.path.join(HERE, "..", "contents.json")))["d"]
    onsheet = lambda k, n: n in CT and k in {N(x) for x in CT[n].get("k", [])}
    pk = lambda dn: "pct" + re.sub(r"\D", "", dn.split("-", 1)[1])
    seen = set()
    for c in pct:
        k, d0 = c.get("k"), c["d"]
        if k in insk and not c.get("via") and c.get("pid") and (k, c["pid"]) not in seen:
            seen.add((k, c["pid"])); r = insk[k]; ip = re.findall(r"2000-[A-Z0-9]+-PID-PR-\d+", r["P&ID"])
            if ip and c["pid"] not in ip and not onsheet(k, c["pid"]):
                add("Instrument", "Clash", r["Instrument tag"] + " P&ID", r["P&ID"], INS, c["pid"] + f" ({c['s'].lower()} {c['t']})", pk(d0),
                    newer(INS, pk(d0)) + " The tag isn't read on " + c["pid"] + " in the app, so check which sheet it is on.")
        src = c.get("src") or ""
        if c.get("ctl") and src and re.fullmatch(r"[A-Z]{2,4}\d{5}[A-Z]?", src) and N(src) not in insk and ("m", src) not in seen:
            seen.add(("m", src))
            add("Instrument", "Missing", src, f"Controlled in the process control tables ({c['s'].lower()} {c['t']}" + (f", {c['pid']}" if c.get("pid") else "") + ")", pk(d0),
                "Not in the instrument list", INS, "In the process control tables only. Kept as a control tag (searchable); raise with the instrument list owner.")

# ---------- control valve list tags given as a number only (tools/unify_tags.py read the letters off the P&ID) ----------
FXP = os.path.join(HERE, "tag_fixes.json")
for x in (json.load(open(FXP)) if os.path.exists(FXP) else []):
    add("Valve", "Check", x["new"], f"Tagged {x['old']} (number only, no letters)", CV, f"Drawn as {x['new'][:-len(x['old'])]} {x['old']}", x["pid"],
        f"The app names it {x['new']} from the letters in its bubble on {x['pid']}. Raise with the control valve list owner to add the letters.")

meta = {"rule": "Where two documents clash, the one with the more recent revision date is taken as true unless the comment says why not.",
        "sources": {v["title"]: {"doc": doc(k), "date": v["date"], "status": v["status"]} for k, v in REV.items()},
        "docs": REV}
json.dump({"meta": meta, "rows": out}, open(os.path.join(HERE, "..", "issues.json"), "w"), ensure_ascii=False, separators=(",", ":"))
from collections import Counter
print(len(out), Counter(r["sev"] for r in out))
