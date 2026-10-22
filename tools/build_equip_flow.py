"""Where the process goes from each piece of equipment, for the fly through's equipment stop (pdfview.js, viz.js): a line
that ends at a tundish, a box, a tank offers that equipment on its strip, and the equipment offers what comes next.
Written to equip-flow.json:
  {tag: {"n": name, "nx": [next equipment], "pa": parent, "out": [lines leaving], "in": [lines coming in], "d": [P&IDs]}}
  nx   the next main equipment in the process, from the Smart PFD's streams (pfd-data.js NODES / STREAMS, the node's
       equipment from pfd-equip.js), reagent, water and air streams left out; a node with no equipment is passed through.
       Sub equipment (a tundish on a feed box, named after it: "FLOTATION FEED BOX XANTHATE TUNDISH" on "FLOTATION FEED
       BOX") takes its parent's. Off the PFD: down the line list, each line leaving it followed to the equipment it reaches.
  out / in   the line list's lines From / To it.   d   the P&IDs it is read on (contents.json, pid-refs.json).
  python3 tools/build_equip_flow.py
"""
import json, os, re, subprocess

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
norm = lambda s: re.sub(r"[^A-Z0-9]", "", str(s).upper())
SD = json.load(open(os.path.join(R, "search-data.json")))
MEL = {r[0]: dict(zip(SD["types"]["mel"]["f"], r)) for r in SD["data"]["mel"]}
LINES = [dict(zip(SD["types"]["line"]["f"], r)) for r in SD["data"]["line"]]
CT = json.load(open(os.path.join(R, "contents.json")))["d"]; REFS = json.load(open(os.path.join(R, "pid-refs.json")))

# the Smart PFD's nodes and streams (JavaScript data files: read with node)
js = """const fs = require("fs"); const g = s => fs.readFileSync(s, "utf8").replace(/^const /mg, "global.");
eval(g("pfd-equip.js")); eval(g("pfd-data.js"));
console.log(JSON.stringify({ N: NODES.map(n => ({ id: n.id, tag: n.tag || null, eq: ((EQUIP_DATA[n.id] || {}).eq || []).map(e => e.tag) })),
  S: STREAMS.map(s => ({ f: s.f, to: s.to, ty: s.ty })), T: STREAM_TYPES }));"""
P = json.loads(subprocess.run(["node", "-e", js], cwd=R, capture_output=True, text=True, check=True).stdout)
SIDE = {k for k, v in P["T"].items() if re.search(r"reag|water|air|steam|gas|lime|flocc|antiscal|caustic|acid|cyanide|oxygen|carbon", k + " " + v.get("name", ""), re.I) and not re.search(r"slurry|ore|flot", v.get("name", ""), re.I)}
NODE = {n["id"]: n for n in P["N"]}
main = lambda n: n["tag"] or (n["eq"][0] if n["eq"] else None)
OUT = {}
for s in P["S"]:
    if s["ty"] in SIDE or s["f"] not in NODE or s["to"] not in NODE: continue
    OUT.setdefault(s["f"], []).append(s["to"])
def nexts(nid):
    """the next nodes with equipment, through any without"""
    seen, todo, got = {nid}, list(OUT.get(nid, [])), []
    while todo:
        x = todo.pop(0)
        if x in seen: continue
        seen.add(x)
        if main(NODE[x]): got.append(main(NODE[x]))
        else: todo += OUT.get(x, [])
    return got
NX = {}
for n in P["N"]:
    nx = [t for t in nexts(n["id"]) if t not in n["eq"] and t != n["tag"]]
    for t in set(n["eq"] + ([n["tag"]] if n["tag"] else [])): NX[t] = list(dict.fromkeys(NX.get(t, []) + nx))

# sub equipment: named after a parent in the same area, the longest such name
BYAREA = {}
for t, m in MEL.items(): BYAREA.setdefault(t.split("-")[0], []).append((t, str(m.get("Equipment name") or "").upper().strip()))
def parent(t):
    nm = str(MEL[t].get("Equipment name") or "").upper().strip(); best = None
    for t2, n2 in BYAREA.get(t.split("-")[0], []):
        if t2 != t and len(n2) >= 6 and nm.startswith(n2 + " ") and (best is None or len(n2) > len(best[1])): best = (t2, n2)
    return best and best[0]

ON = {}
for d, e in CT.items():
    if "-PID-" in d:
        for t in (e.get("k") or []) + (e.get("o") or []): ON.setdefault(norm(t), []).append(d)
for d, refs in REFS.items():
    if "-PID-" in d:
        for r in refs:
            if r[6] == "mel":
                k = norm(str(r[5]).split("|")[0])
                if d not in ON.setdefault(k, []): ON[k].append(d)

# off the Smart PFD: the next equipment down the line list, each line leaving it followed (To a line: that line's To, on
# until a piece of equipment is reached, six lines at most); a drain to grade or a sampler that names no equipment ends it
LN0 = SD["types"]["line"]["f"][0]; LBY = {norm(l.get(LN0)): l for l in LINES}; MELN = {norm(t): t for t in MEL}
EQ_RE = re.compile(r"\bF\d{2,3}-[A-Z]{1,4}-\d{2,4}[A-Z]?\b")
def down(t):
    got, todo, seen = [], [norm(l.get(LN0)) for l in LINES if norm(l.get("From")) == norm(t)], set()
    for _ in range(6):
        nxt = []
        for ln in todo:
            if ln in seen or ln not in LBY: continue
            seen.add(ln); to = str(LBY[ln].get("To") or "")
            eq = [MELN[norm(x)] for x in EQ_RE.findall(to) if norm(x) in MELN and norm(x) != norm(t)]
            if eq: got += [x for x in eq if x not in got]
            elif norm(to) in LBY: nxt.append(norm(to))
        if not nxt: break
        todo = nxt
    return got

E = {}
for t, m in MEL.items():
    pa = parent(t); nx = NX.get(t) or (NX.get(pa, []) if pa else []) or down(t)
    out = [L0 for L0 in (l.get(SD["types"]["line"]["f"][0]) for l in LINES if norm(l.get("From")) == norm(t)) if L0]
    inn = [L0 for L0 in (l.get(SD["types"]["line"]["f"][0]) for l in LINES if norm(l.get("To")) == norm(t)) if L0]
    d = sorted(set(ON.get(norm(t), [])))
    if not (nx or out or inn) or not d: continue
    e = {"n": m.get("Equipment name") or "", "d": d}
    if nx: e["nx"] = [x for x in nx if x in MEL]
    if pa: e["pa"] = pa
    if out: e["out"] = out
    if inn: e["in"] = inn
    E[t] = e
json.dump(E, open(os.path.join(R, "equip-flow.json"), "w"), separators=(",", ":"), ensure_ascii=False)
print(len(E), "equipment;", sum(1 for e in E.values() if e.get("nx")), "with a next in the process,", sum(1 for e in E.values() if e.get("pa")), "sub equipment on a parent")
