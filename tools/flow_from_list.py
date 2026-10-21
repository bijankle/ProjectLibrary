"""Which way each traced line flows, set from the line list (its From and To), after tools/link_lines.py and before
tools/build_routes.py. The drawing's own clues (arrowheads read off the sheet, the way a continuation ribbon points)
are wrong now and then: an arrowhead belonging to a crossing line, a ribbon drawn pointing out where the flow comes in.
The line list says where each line comes from and goes to, so where it can be placed on the sheet it decides:

  a ribbon at one end of the line, to a sheet that holds the line's From and not its To: that end is upstream (or
  holds its To and not its From: that end is downstream)
  the From or To line traced on this sheet, its path touching one end of this line and not the other
  the From or To item's tag on this sheet, much nearer one end than the other

Each clue is a vote (a ribbon's counts double); a line whose votes settle it (two at least against arrowheads read
off the sheet) is turned round where it runs the other
way (path reversed, milestones mirrored, its joins' ends swapped) and marked as having a known flow ("fl").
  python3 tools/flow_from_list.py [--dry]      (--dry: only report what it would turn)
"""
import glob, json, math, os, re, sys

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = "--dry" in sys.argv
REFS = json.load(open(os.path.join(R, "pid-refs.json")))
CT = json.load(open(os.path.join(R, "contents.json")))["d"]
SD = json.load(open(os.path.join(R, "search-data.json")))
norm = lambda s: re.sub(r"[^A-Z0-9]", "", str(s).upper())
F = SD["types"]["line"]["f"]; LIST = {norm(r[0]): dict(zip(F, r)) for r in SD["data"]["line"]}

# the P&IDs each tag or line number is read on
ON = {}
for d, e in CT.items():
    if "-PID-" in d:
        for t in (e.get("k") or []) + (e.get("o") or []): ON.setdefault(norm(t), set()).add(d)
for d, refs in REFS.items():
    if "-PID-" in d:
        for r in refs:
            if r[6] in ("line", "mel", "ins", "cv", "mv", "spi"): ON.setdefault(norm(str(r[5]).split("|")[0]), set()).add(d)


def segd(P, q):
    """the distance from point q to the path P"""
    m = 1e18
    for a, b in zip(P, P[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy
        u = 0 if L2 == 0 else max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2))
        m = min(m, math.hypot(a[0] + u * dx - q[0], a[1] + u * dy - q[1]))
    return m


def votes(num, D, refs, k):
    """+ the start of the path upstream, - its end upstream; and the clues, for the report"""
    r = refs[int(k)]; ln = LIST.get(norm(str(r[5]).split("|")[0]))
    if not ln: return 0, []
    P = D[k]; ends = (P[0], P[-1]); s = 0; why = []
    fr, to = norm(ln.get("From", "")), norm(ln.get("To", ""))
    Y = {fr: to, to: fr}
    for role, X in (("up", fr), ("dn", to)):
        if not X: continue
        here = num in ON.get(X, set())
        # a ribbon at an end to a sheet that holds X and not the other end's item (X may be read on this sheet too, a
        # tank's number printed by its outlet ribbon)
        for m in D.get("m", {}).get(k, []):
            if m[1] != "r" or m[0] not in (0, 1): continue
            if m[2] in ON.get(X, set()) and m[2] not in ON.get(Y[X], set()):
                v = 2 if (role == "up") == (m[0] == 0) else -2; s += v; why.append(f"ribbon {m[2][5:]} at {'start' if m[0] == 0 else 'end'} has {role == 'up' and 'From' or 'To'}")
        if not here: continue
        # X a line traced on this sheet: its path touching one end
        for k2, Q in D.items():
            if not k2.isdigit() or k2 == k or int(k2) >= len(refs) or norm(str(refs[int(k2)][5]).split("|")[0]) != X or len(Q) < 2: continue
            d0, d1 = segd(Q, ends[0]), segd(Q, ends[1])
            if min(d0, d1) < 80 and max(d0, d1) > 250:
                e = 0 if d0 < d1 else 1; v = 1 if (role == "up") == (e == 0) else -1; s += v; why.append(f"{role == 'up' and 'From' or 'To'} line at {'start' if e == 0 else 'end'}")
        # X a tag on this sheet: much nearer one end
        for q in refs:
            if q[0] != r[0] or q[6] in ("line", "d") or norm(str(q[5]).split("|")[0]) != X: continue
            c = (q[1] + q[3] / 2, q[2] + q[4] / 2); d0, d1 = math.dist(c, ends[0]), math.dist(c, ends[1])
            if min(d0, d1) < 1500 and min(d0, d1) < .5 * max(d0, d1):
                e = 0 if d0 < d1 else 1; v = 1 if (role == "up") == (e == 0) else -1; s += v; why.append(f"{role == 'up' and 'From' or 'To'} tag at {'start' if e == 0 else 'end'}")
    return s, why


def turn(D, k):
    D[k] = D[k][::-1]
    if k in D.get("m", {}): D["m"][k] = sorted([[round(1 - m[0], 3)] + m[1:] for m in D["m"][k]])
    for key in ("lk", "pj"):
        for j in D.get(key, []):
            if str(j[0]) == k: j[1] = 1 - j[1]
            if str(j[2]) == k: j[3] = 1 - j[3]


if __name__ == "__main__":
    turned = kept = 0; rep = []
    for path in sorted(glob.glob(os.path.join(R, "lines", "*-PID-*.json"))):
        num = os.path.basename(path)[:-5]; D = json.load(open(path)); refs = REFS.get(num, []); ch = False
        for k in [k for k in D if k.isdigit() and int(k) < len(refs) and len(D[k]) > 1]:
            s, why = votes(num, D, refs, k)
            if not s or (s == -1 and D.get("fl", {}).get(k)): continue   # (one clue alone doesn't overrule the arrowheads)
            if s < 0:
                turned += 1; rep.append((num, str(refs[int(k)][5]).split("|")[0], "was " + ("arrows" if D.get("fl", {}).get(k) else "guess"), "; ".join(why)))
                if not DRY: turn(D, k)
            else: kept += 1
            if not DRY: D.setdefault("fl", {})[k] = 1; ch = True
        if ch and not DRY: json.dump(D, open(path, "w"), separators=(",", ":"))
    for x in rep: print(*x, sep=" | ")
    print(f"{kept} lines already ran as the line list says, {turned} {'would be ' if DRY else ''}turned round")
