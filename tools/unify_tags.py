"""Tag spelling made the same across the lists, in search-data.json (run after tools/build_search.py, which calls it):
a control valve list tag is written as the instrument list and the P&IDs write it, letters and number together
(XV 12551 -> XV12551), and a tag the control valve list gives as a number only (23527) gets the letters its P&ID draws
in the valve's bubble (HV23527). Each number-only tag fixed is kept in tools/tag_fixes.json for Checks (tools/build_issues.py).
   python3 tools/unify_tags.py
"""
import json, os, re
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(R, "search-data.json"); d = json.load(open(P))
IX = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
f = d["types"]["cv"]["f"]; pj = f.index("P&ID") if "P&ID" in f else None
FX = os.path.join(R, "tools", "tag_fixes.json")
fixes = {x["old"]: x for x in json.load(open(FX))} if os.path.exists(FX) else {}
n = 0
def letters(num, pid):
    """the valve letters drawn just above the number on its P&ID (HV, XV, FCV …)"""
    if pid not in IX: return None
    W = [(p.number, w[0], w[1], w[4]) for p in pymupdf.open(os.path.join(R, IX[pid]["file"])) for w in p.get_text("words")]
    seen = {}
    for pg, x, y, t in W:
        if re.sub(r"\W", "", t) != num: continue
        for q, xx, yy, u in W:
            if q == pg and abs(xx - x) < 25 and -25 < yy - y < 2 and re.fullmatch(r"[A-Z]{0,3}V", u): seen[u] = seen.get(u, 0) + 1
    return max(seen, key=seen.get) if seen else None
for r in d["data"].get("cv", []):
    t = str(r[0]).strip(); u = re.sub(r"^([A-Z]{1,5})\s+(?=\d)", r"\1", t)
    if re.fullmatch(r"\d{4,6}[A-Z]?", t):
        x = fixes.get(t)
        if not x:
            pid = (re.findall(r"2000-[A-Z0-9]+-PID-[A-Z]{2}-\d+", r[pj]) or [""])[0] if pj is not None and pj < len(r) else ""
            L = letters(t, pid)
            if L: x = fixes[t] = {"old": t, "new": L + t, "pid": pid}
        if x: u = x["new"]
    if u != r[0]: r[0] = u; n += 1
json.dump(d, open(P, "w"), ensure_ascii=False, separators=(",", ":"))
json.dump(list(fixes.values()), open(FX, "w"), indent=1)
print(n, "control valve tags respelled;", len(fixes), "number-only tags given their letters:", ", ".join(x["new"] for x in fixes.values()))
