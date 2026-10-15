"""Newer issues of drawings the app already holds (Old Revs uploads from the app, in the private repository's
inbox/refonly), swapped in: NUMBER_REV.pdf, e.g. 2000-F24-PID-PR-10034_MS_1.pdf.
  python3 tools/swap_revs.py [files…]      (default: every P&ID / PFD issue in inbox/refonly whose number the app holds)
For each: the app's current file moves to PIDs/rev/NUMBER_Rev<old>.pdf (listed under the drawing in Sources), the new
one takes its place with its revision as SharePoint writes it (MS_1 …) and its file name as the source; then names and
the title band are blanked (redact_docs.py), it is read four ways (ocr_all.py), extra word copies removed
(dedupe_ocr.py), its tag links built (build_pid_refs.py: only the swapped sheets take new links, ways back into them
re-pointed), and the pictures, contents, Ref Only and offline list rebuilt. The originals move to inbox/pids.
"""
import glob, json, os, re, shutil, subprocess, sys
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
run = lambda *a: subprocess.run([sys.executable] + list(a), cwd=R, check=True)
D = json.load(open(os.path.join(R, "PIDs", "index.json"))); ix = D["pids"]
files = sys.argv[1:] or sorted(glob.glob(os.path.join(RP, "inbox", "refonly", "*.pdf")))
done = []
for f in files:
    m = re.match(r"^(2000-[A-Z0-9.]+-(?:PID|PFD)-[A-Z]{2}-\d+)_(.+)\.pdf$", os.path.basename(f))
    if not m or m.group(1) not in ix: print("not a held P&ID / PFD:", os.path.basename(f)); continue
    n, rev = m.groups(); v = ix[n]
    if v.get("rev") == rev: print("already in:", n, rev); continue
    old = v["file"]; dst = f"{os.path.dirname(old)}/rev/{n}_Rev{v.get('rev') or '0'}.pdf"; os.makedirs(os.path.join(R, os.path.dirname(dst)), exist_ok=True)
    shutil.move(os.path.join(R, old), os.path.join(R, dst))
    for p in glob.glob(os.path.join(R, old) + ".p*.png"): os.remove(p)
    v.setdefault("revs", []).append({"rev": v.get("rev", ""), "date": v.get("date", ""), "file": dst, "size": os.path.getsize(os.path.join(R, dst))})
    shutil.copy(f, os.path.join(R, old))
    v.update(rev=rev, src=[os.path.basename(f)], size=os.path.getsize(os.path.join(R, old)), pages=pymupdf.open(os.path.join(R, old)).page_count)
    done.append(n)
json.dump(D, open(os.path.join(R, "PIDs", "index.json"), "w"), indent=1, ensure_ascii=False)
if not done: sys.exit("nothing to swap")
paths = [ix[n]["file"] for n in done]
run("tools/redact_docs.py", *paths)
subprocess.run([sys.executable, "tools/ocr_all.py"] + paths, cwd=R, check=True, env=dict(os.environ, OMP_THREAD_LIMIT="1"))
run("tools/dedupe_ocr.py", *[os.path.join(R, p) for p in paths])
# tag links: a fresh run, taken only for the swapped sheets (the others keep their checked links)
before = json.load(open(os.path.join(R, "pid-refs.json"))); dt0 = json.load(open(os.path.join(R, "doc-tags.json")))
run("tools/build_pid_refs.py")
new = json.load(open(os.path.join(R, "pid-refs.json"))); out = dict(before); sw = set(done)
for n in sw: out[n] = new.get(n, [])
json.dump(out, open(os.path.join(R, "pid-refs.json"), "w"), separators=(",", ":"))
run("tools/fix_backrefs.py")   # (the ways back into the swapped sheets: their ribbons were renumbered)
dt1 = json.load(open(os.path.join(R, "doc-tags.json"))); dt0.update({k: v for k, v in dt1.items() if k not in dt0})
json.dump(dt0, open(os.path.join(R, "doc-tags.json"), "w"), separators=(",", ":"))
for t in ("build_pics.py", "build_bbox.py", "build_contents.py", "build_refonly.py", "build_offline.py"): run("tools/" + t)
for f in files:
    if any(os.path.basename(f).startswith(n + "_") for n in done):
        subprocess.run(["git", "mv", f, os.path.join(RP, "inbox", "pids", os.path.basename(f))], cwd=RP)
print("swapped:", ", ".join(f"{n} → {ix[n]['rev']}" for n in done))
