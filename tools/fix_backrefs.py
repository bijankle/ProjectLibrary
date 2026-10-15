"""The way back across a continuation ribbon, checked on every drawing (pid-refs.json): a ribbon on drawing A leading to
B keeps (r[7]) the place in B's list of the ribbon there that leads back to A, so arriving on B marks the right ribbon.
When B's list is rebuilt (a newer revision swapped in) those places move; here each is checked and, if it no longer
points at a ribbon on B leading back to A, pointed at the one that does (the nearest in order if B has several), or
cleared (none: B's own number is then found on the sheet).   python3 tools/fix_backrefs.py
"""
import json, os, re
R0 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(R0, "pid-refs.json"); R = json.load(open(P))
key = lambda s: re.sub(r"[^A-Z0-9]", "", str(s).upper())
ok = fixed = cleared = 0
for a, refs in R.items():
    for r in refs:
        if r[6] != "d" or len(r) < 8 or isinstance(r[7], str): continue   # (a letter there is a box shape, not a way back)
        for b in str(r[5]).split("|"):
            if b not in R: continue
            back = [j for j, x in enumerate(R[b]) if x[6] == "d" and any(key(t) == key(a) for t in str(x[5]).split("|"))]
            cur = r[7]
            if isinstance(cur, list):   # (several ribbons back: the ones still right kept, else all that lead back)
                keep = [j for j in cur if j in back]
                if keep == cur and cur: ok += 1
                elif back: r[7] = keep or back; fixed += 1
                else: r[7] = None; cleared += 1
                break
            if cur is not None and cur in back: ok += 1; break
            if back:
                r[7] = min(back, key=lambda j: abs(j - (cur or 0))); fixed += 1
            elif cur is not None: r[7] = None; cleared += 1
            break
json.dump(R, open(P, "w"), separators=(",", ":"))
print("ways back: right", ok, "re-pointed", fixed, "cleared", cleared)
