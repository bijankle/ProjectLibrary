"""The revision of drawings the app took from the original combined P&ID / PFD sets, which recorded none: read off the
REVISION box beside the drawing number in each sheet's title block, in the combined set's own pages (the private
repository's history-archive/, where the title blocks are still whole). Each box is cut out at 300 dpi and read by
Tesseract as one short line; only a plain revision (0, 1, 2A, B …) is taken. Writes the "rev" into PIDs/index.json for
drawings that have none, and prints what it read.   python3 tools/revs_from_combined.py [--dry]
"""
import glob, json, os, re, subprocess, sys, tempfile
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
D = json.load(open(os.path.join(R, "PIDs", "index.json"))); ix = D["pids"]
want = {n for n, v in ix.items() if not str(v.get("rev", "")).strip() and re.search(r"-(PID|PFD)-", n)}
got = {}
for f in sorted(glob.glob(os.path.join(RP, "history-archive", "*Combined*.pdf"))):
    try: doc = pymupdf.open(f)
    except Exception: continue
    for p in doc:
        W, H = p.rect.width, p.rect.height
        for w in p.get_text("words"):
            n = next((x for x in want if x in w[4] and x not in got), None)
            if not n or w[1] < H * .85 or w[0] < W * .5: continue
            # (the REVISION label above, its box from just right of the number to the frame)
            lab = [x for x in p.get_text("words") if x[4].upper().startswith("REVISION") and x[0] > w[2] and abs(x[1] - w[1]) < 40]
            if not lab: continue
            l = lab[0]; box = pymupdf.Rect(l[0] - 25, l[3] + 1, l[2] + 25, w[3] + 12)
            box &= p.rect
            if box.width < 8 or box.height < 8: continue
            with tempfile.TemporaryDirectory() as td:
                im = os.path.join(td, "r.png")
                try: p.get_pixmap(dpi=300, clip=box).save(im)
                except Exception: continue
                t = subprocess.run(["tesseract", im, "-", "--psm", "7", "-c", "tessedit_char_whitelist=0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"], capture_output=True, text=True).stdout.strip()
            m = re.fullmatch(r"([0-9]{1,2}[A-Z]?|[A-Z]{1,2})(?:RL\d*|RLM\d*)?", t)   # (a redline copy, "2RL1": its issue, 2)
            if m: got[n] = m.group(1)
            else: print("unread:", n, repr(t), os.path.basename(f))
for n, r in sorted(got.items()): print(n, "->", r)
print(len(got), "of", len(want), "read")
if "--dry" not in sys.argv:
    for n, r in got.items(): ix[n]["rev"] = r
    json.dump(D, open(os.path.join(R, "PIDs", "index.json"), "w"), indent=1, ensure_ascii=False)
