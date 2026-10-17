"""The way back across a continuation ribbon, decided by what the two ribbons print (pid-refs.json r[7]). A sheet often
has several ribbons to the same drawing, and the ribbon there leading back is the one carrying the same stream: the
fluid printed under the drawing number (FLOTATION BLOWER AIR, HP PROCESS WATER) is the same on both ends. Each word
round a ribbon goes to the nearest ribbon (so the name over the ribbon below is not read as this one's fluid); the
words under it are its fluid. The best fluid match wins; where the fluids can't tell them apart the earlier picks
stand (opposite edge, line numbers nearby: build_pid_refs.py).   python3 tools/pair_ribbons.py [--dry]
"""
import json, os, re, sys
import pymupdf
R0 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(R0, "pid-refs.json"); R = json.load(open(P)); IX = json.load(open(os.path.join(R0, "PIDs", "index.json")))["pids"]
key = lambda s: re.sub(r"[^A-Z0-9]", "", str(s).upper())
NOISE = {"TO", "FROM", "OF", "AND", "THE", "NO", "SHEET", "DWG", "SEE", "CONT", "CONTD", "CONTINUED"}

FL = {}   # (sheet, index) -> the words printed under the ribbon
def read(s):
    if s not in IX or not os.path.exists(os.path.join(R0, IX[s]["file"])): return
    doc = pymupdf.open(os.path.join(R0, IX[s]["file"])); bypg = {}
    for i, r in enumerate(R[s]):
        if r[6] == "d": bypg.setdefault(r[0], []).append(i)
    for pg, ids in bypg.items():
        if pg - 1 >= len(doc): continue
        p = doc[pg - 1]; W, H = p.rect.width, p.rect.height
        bx = {}
        for i in ids:
            r = R[s][i]; b = r[8] if len(r) > 8 and isinstance(r[8], list) else r[1:5]
            bx[i] = (b[0] / 1e4 * W, b[1] / 1e4 * H, (b[0] + b[2]) / 1e4 * W, (b[1] + b[3]) / 1e4 * H)
        under = {i: [] for i in ids}
        for w in p.get_text("words"):
            t = w[4].strip()
            if not t: continue
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2; best = None
            for i, (x0, y0, x1, y1) in bx.items():
                h = y1 - y0; ww = x1 - x0
                if not (x0 - ww * .2 <= cx <= x1 + ww * .2) or not (y0 - h * 2.6 <= cy <= y1 + h * 2.6): continue
                if y0 <= cy <= y1: best = None; break   # (the drawing number itself)
                d = y0 - cy if cy < y0 else cy - y1
                if best is None or d < best[0]: best = (d, i, cy > y1)
            if best and best[2]: under[best[1]].append((w[1], w[0], t))
        for i, ws in under.items():
            FL[s, i] = {x for _, _, t in sorted(ws) for x in re.findall(r"[A-Z0-9]{2,}", t.upper()) if x not in NOISE and not re.fullmatch(r"\d+", x)}

need = set()
for a, refs in R.items():
    for r in refs:
        if r[6] == "d" and len(r) > 7 and not isinstance(r[7], str):
            for b in str(r[5]).split("|"):
                if b in R and sum(1 for x in R[b] if x[6] == "d" and any(key(t) == key(a) for t in str(x[5]).split("|"))) > 1: need |= {a, b}
for s in sorted(need): read(s)

def sim(x, y):
    return len(x & y) / len(x | y) if x and y else 0
changed = same = tied = 0; log = []
for a, refs in R.items():
    for i, r in enumerate(refs):
        if r[6] != "d" or len(r) < 8 or isinstance(r[7], str): continue
        b = next((t for t in str(r[5]).split("|") if t in R), None)
        if not b: continue
        back = [j for j, x in enumerate(R[b]) if x[6] == "d" and any(key(t) == key(a) for t in str(x[5]).split("|"))]
        if len(back) < 2: continue
        fa = FL.get((a, i), set()); sc = {j: sim(fa, FL.get((b, j), set())) for j in back}; top = max(sc.values())
        if top < .5: tied += 1; continue   # (the fluids say nothing sure: the earlier pick stands)
        win = [j for j in back if sc[j] == top]
        cur = [x for x in ([r[7]] if isinstance(r[7], int) else r[7] or []) if x in win]
        win = cur or win   # (an earlier pick carrying the same fluid stands: the fluid only rules out the wrong ones)
        new = win[0] if len(win) == 1 else win
        if new == r[7]: same += 1; continue
        log.append(f"{a} #{i} {' '.join(sorted(fa))!r} -> {b} {r[7]} => {new} {' '.join(sorted(FL.get((b, win[0]), set())))!r}")
        r[7] = new; changed += 1
# both ends agree: a ribbon sure of its partner settles the partner's way back when that one could not tell
mut = 0
for a, refs in R.items():
    for i, r in enumerate(refs):
        if r[6] != "d" or len(r) < 8 or not isinstance(r[7], list): continue
        b = next((t for t in str(r[5]).split("|") if t in R), None)
        sure = [j for j in r[7] if j < len(R[b]) and len(R[b][j]) > 7 and R[b][j][7] == i] if b else []
        if len(sure) == 1: r[7] = sure[0]; mut += 1
print("\n".join(log)); print("settled by the partner:", mut)
print("ways back by fluid: re-pointed", changed, "already right", same, "fluid can't tell", tied)
if "--dry" not in sys.argv: json.dump(R, open(P, "w"), separators=(",", ":"))
