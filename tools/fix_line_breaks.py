"""Where one line number hands over to the next (lines/<sheet>.json, tools/build_line_paths.py): at the first real tee.

The paths are cut where the trace met something, often a small drain or vent tee (a valve on a stub, no line of its
own). A line number changes at a branch or a printed spec break (SS2 | PE20, left as it is), not at a drain: so where line A ends and line B begins at a point with no
branch line there, and B's first branch tee (a tee where another numbered line leaves) is close by, A is carried on to
that tee and B starts from it (12-0638-FW carried past the drain at 25VB03S1 to the 12-0634 tee, where 00-0791 begins).
"""
import glob, json, math, os, re, sys
import pymupdf

R = sys.argv[1] if len(sys.argv) > 1 else "."
REFS = json.load(open(os.path.join(R, "pid-refs.json"))); IX = json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"]
SPEC = re.compile(r"^(PE\d+(\.\d)?|PEDC\d|SS\d+|MSG\d|RL\d|XS|CS\d|PP\d|HD\d|GL\d|PVC\d?)$")
MAXD = 450   # (furthest the handover moves, in 1/10000 of the sheet)


def lens(P):
    L = [0]
    for a, b in zip(P, P[1:]): L.append(L[-1] + math.dist(a, b))
    return L


def cut(P, d):
    """P split at distance d along it: (before, after), the point at d in both"""
    L = lens(P)
    for i in range(1, len(P)):
        if L[i] >= d:
            t = (d - L[i - 1]) / ((L[i] - L[i - 1]) or 1); q = [round(P[i - 1][0] + t * (P[i][0] - P[i - 1][0])), round(P[i - 1][1] + t * (P[i][1] - P[i - 1][1]))]
            return P[:i] + [q], [q] + P[i:]
    return P, [P[-1]]


def run(path):
    num = os.path.basename(path)[:-5]; D = json.load(open(path)); refs = REFS.get(num, []); M = D.setdefault("m", {}); n = 0
    keys = [k for k in D if k.isdigit()]
    words = None
    def specnear(q):   # (a spec break printed at the handover, SS2 | PE20: a real change of line number there)
        nonlocal words
        if words is None:
            pg = pymupdf.open(os.path.join(R, IX[num]["file"]))[0]; W, H = pg.rect.width, pg.rect.height
            words = [((w[0] + w[2]) / 2 / W * 1e4, (w[1] + w[3]) / 2 / H * 1e4) for w in pg.get_text("words") if SPEC.match(w[4])]
        return any(abs(x - q[0]) < 260 and abs(y - q[1]) < 380 for x, y in words)
    for a in keys:
        for b in keys:
            if a == b or a not in D or b not in D: continue
            A, B = D[a], D[b]
            if math.dist(A[-1], B[0]) > 12: continue
            if refs[int(a)][0] != refs[int(b)][0]: continue
            mA, mB = M.get(a, []), M.get(b, [])
            # (a branch already there: the handover is right as it is)
            if any(m[1] == "t" and m[0] >= .99 for m in mA) or any(m[1] == "t" and m[0] <= .01 for m in mB): continue
            if any(k2 not in (a, b) and (math.dist(D[k2][0], A[-1]) < 30 or math.dist(D[k2][-1], A[-1]) < 30) for k2 in keys): continue
            if num not in IX or specnear(A[-1]): continue
            LB = lens(B); tot = LB[-1] or 1
            tees = sorted(m for m in mB if m[1] == "t" and m[2] and m[0] > .01)
            if not tees or tees[0][0] * tot > MAXD: continue
            ft = tees[0][0]; dmove = ft * tot
            LA = lens(A)[-1] or 1
            gain, rest = cut(B, dmove)
            nA = A + gain[1:]; nLA = LA + dmove
            # milestones: A's own rescaled, B's before the tee moved onto A's new end part, the rest of B rescaled
            newA = [[round(m[0] * LA / nLA, 3)] + m[1:] for m in mA if m[0] < .995]
            newA += [[round((LA + m[0] * tot) / nLA, 3)] + m[1:] for m in mB if 0 < m[0] < ft]
            newA += [[1, "t", tees[0][2]]] + [m for m in mA if m[0] >= .995 and m[1] != "t"]
            rtot = tot - dmove or 1
            newB = [[0] + m[1:] for m in mB if m[0] <= .005] + [[round((m[0] * tot - dmove) / rtot, 3)] + m[1:] for m in mB if m[0] > ft]
            D[a] = nA; D[b] = rest; M[a] = sorted(newA); M[b] = sorted(newB); n += 1
    if n: json.dump(D, open(path, "w"), separators=(",", ":"))
    return n


if __name__ == "__main__":
    t = sum(run(p) for p in sorted(glob.glob(os.path.join(R, "lines", "*-PID-*.json"))))
    print(t, "handovers moved to the first branch tee")
    import subprocess; subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_offline.py")], cwd=R, check=False)
