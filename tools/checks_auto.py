"""Settles the checks the drawings can answer, into resolved.json (the Checks tab's tick boxes read it).

A Valve clash is two lists naming different P&IDs for one tag. The drawings decide (on this project the P&ID is
right far more often than a list): the P&IDs whose labels (pid-refs.json) carry the tag are looked up; if only one of
the two named shows it, that one is taken; if both do (the tag runs across sheets), both are right. Either way the
check is marked resolved with a note saying so. Neither showing it: left open.
An entry made by hand (in the app) is never overwritten; a check settled here before is redone each run.
Check ids: FNV-1a 32 bit of "cat|item|d1|d2", the same as issues.html makes them.
Usage: python3 tools/checks_auto.py
"""
import json, os, re, datetime
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
def cid(r):
    h = 0x811c9dc5
    for ch in f"{r['cat']}|{r['item']}|{r.get('d1','')}|{r.get('d2','')}":
        h ^= ord(ch); h = (h * 0x01000193) & 0xffffffff
    return format(h, "08x")
norm = lambda s: re.sub(r"[^A-Z0-9]", "", str(s).upper())
rows = json.load(open(os.path.join(ROOT, "issues.json")))["rows"]
R = json.load(open(os.path.join(ROOT, "pid-refs.json")))
on = {}
for n, a in R.items():
    for r in a:
        if r[6] in ("d", "x", "q"): continue
        for t in str(r[5]).split("|"): on.setdefault(norm(t), set()).add(n)
# also the drawing's own text: a tag printed in a table or with its letters and number on two lines (a bubble)
import pymupdf
IX = json.load(open(os.path.join(ROOT, "PIDs/index.json")))["pids"]; WORDS = {}
def printed(num, item):
    if num not in IX: return False
    if num not in WORDS:
        WORDS[num] = [w for pg in pymupdf.open(os.path.join(ROOT, IX[num]["file"])) for w in [(pg.number, x[0], x[1], x[4].upper()) for x in pg.get_text("words")]]
    m = re.match(r"\s*([A-Z]+)\s*(\d+[A-Z]?)", item); let, dig = m.group(1), m.group(2); W = WORDS[num]
    if any(norm(w[3]) == let + dig for w in W): return True
    for p, x, y, t in W:   # the number, with the letters just above it or just before it
        if norm(t) == dig and any(q == p and norm(u) == let and abs(xx - x) < 30 and -30 < yy - y < 4 for q, xx, yy, u in W): return True
    return False
path = os.path.join(ROOT, "resolved.json")
res = json.load(open(path)) if os.path.exists(path) else {}
res = {k: v for k, v in res.items() if not v.get("auto")}   # the hand made ones stay
today = datetime.date.today().isoformat(); n1 = n2 = 0
for r in rows:
    if r["sev"] != "Clash" or r["cat"] != "Valve": continue
    i = cid(r)
    if i in res: continue
    tag = norm(re.match(r"\s*([A-Z]+\s*\d+[A-Z]?)", r["item"]).group(1))
    a, b = [(re.search(r"2000-[A-Z0-9]+-PID-[A-Z]+-\d+", v or "") or [None])[0] for v in (r["v1"], r["v2"])]
    if not a or not b: continue
    shows = on.get(tag, set()); ha, hb = a in shows or printed(a, r["item"]), b in shows or printed(b, r["item"])
    if ha and hb: note = f"Settled by the drawings: {r['item']} is shown on both {a} and {b} (it runs across the sheets), so both are right."; n2 += 1
    elif ha or hb: note = f"Settled by the drawing: {r['item']} is shown on {a if ha else b}, not on {b if ha else a}."; n1 += 1
    else: continue
    res[i] = {"by": "Drawing check", "at": today, "note": note, "auto": 1, "keep": a if ha and not hb else b if hb and not ha else f"{a}, {b}"}
json.dump(res, open(path, "w"), indent=1)
print("settled by one drawing:", n1, "by both:", n2, "total resolved:", len(res))
