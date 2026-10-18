"""Project documents from the Ref Only list taken into the app (Ref Only uploads, in the private repository's
inbox/refonly): equipment datasheets (-DSH-), philosophies (-PHL-) and design criteria (-DCR-), NUMBER_REV.pdf.
  python3 tools/add_docs.py [files…]      (default: every such document in inbox/refonly that the Ref Only list has)
Each goes in as a document (PIDs/NUMBER.pdf, {"doc": true}), opened like a P&ID, its title from tools/titles.json, else
the register's: names, logos, sign off tables and the client's header blanked (redact_docs.py), a scanned one read
(ocr_all.py), its tag links built (build_pid_refs.py: only the new documents take links, every other sheet keeps its
checked ones), then the pictures, contents, the datasheets' data on the asset pages (build_datasheets.py), Checks, Ref
Only and the offline list. The originals move to inbox/docs in the private repository.
"""
import datetime, glob, json, os, re, shutil, subprocess, sys
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
run = lambda *a: subprocess.run([sys.executable] + list(a), cwd=R, check=True)
D = json.load(open(os.path.join(R, "PIDs", "index.json"))); ix = D["pids"]
TITLES = json.load(open(os.path.join(R, "tools", "titles.json")))
RO = {r["n"]: r for r in json.load(open(os.path.join(R, "refonly.json"))).get("ref", [])}
# (a rebuilt list leaves out what waits in the inbox, these among them: the last published list has them)
try: RO = {**{r["n"]: r for r in json.loads(subprocess.run(["git", "show", "HEAD:refonly.json"], cwd=R, capture_output=True, text=True).stdout).get("ref", [])}, **RO}
except Exception: pass
KIND = re.compile(r"^(2000-[A-Z0-9.]+-(?:DSH|PHL|DCR)-[A-Z]{2}-[A-Z0-9]+?)_([A-Z0-9]{1,4})(?:_[A-Z]{2,4})?(?: \(\d+\))?\.pdf$")
KEEP = re.compile(r"^(?:[A-Z]{1,3}\d*[A-Z]?|[A-Z]\d{2,3}-[A-Z]{2,3}-\d{3}[A-Z]?(?:-[A-Z]{2})?|\d+(?:\.\d+)?K?V|I/O)$")

def nice(t):   # "SAG MILL DATASHEET F13-MS-401" -> "SAG mill datasheet F13-MS-401" (short capitals and tags kept)
    t = re.sub(r"\*\*.*?\*\*", "", t or "").strip(); out = []
    for i, w in enumerate(t.split()):
        core = re.sub(r"^[(\[]|[)\],.:;]$", "", w)
        if KEEP.match(core) and (len(core) <= 4 or re.search(r"\d", core)): out.append(w)
        else: out.append(w.lower() if i else w[:1].upper() + w[1:].lower())
    return re.sub(r"\s+-\s+", ", ", " ".join(out))

RES = "--resume" in sys.argv   # (after a failure past the redaction: the documents already added carry on from the tag links)
files = [a for a in sys.argv[1:] if a != "--resume"] or sorted(glob.glob(os.path.join(RP, "inbox", "refonly", "*.pdf")))
added = []
for f in files:
    m = KIND.match(os.path.basename(f))
    if not m: continue
    n, rev = m.groups()
    if n in ix:
        if RES and os.path.basename(f) in ix[n].get("src", []): added.append((n, f))
        else: print("already in:", n)
        continue
    if n not in RO: print("not on the Ref Only list:", os.path.basename(f)); continue
    rel = "PIDs/" + n + ".pdf"; shutil.copy(f, os.path.join(R, rel))
    title = TITLES.get(n) or nice(RO[n].get("t", "")) or n
    ix[n] = {"file": rel, "title": title, "rev": rev, "date": datetime.date.today().isoformat(), "pages": pymupdf.open(os.path.join(R, rel)).page_count,
             "size": os.path.getsize(os.path.join(R, rel)), "doc": True, "src": [os.path.basename(f)]}
    TITLES.setdefault(n, title); added.append((n, f))
if not added: sys.exit("nothing to add")
json.dump(D, open(os.path.join(R, "PIDs", "index.json"), "w"), indent=1, ensure_ascii=False)
json.dump(dict(sorted(TITLES.items())), open(os.path.join(R, "tools", "titles.json"), "w"), indent=1, ensure_ascii=False)
new = [n for n, _ in added]; paths = [ix[n]["file"] for n in new]
if not RES: run("tools/redact_docs.py", *paths)
for n in new:   # the redaction rewrote them: sizes again
    ix[n]["size"] = os.path.getsize(os.path.join(R, ix[n]["file"]))
json.dump(D, open(os.path.join(R, "PIDs", "index.json"), "w"), indent=1, ensure_ascii=False)
# (a scanned one, no text to read: read it)
scan = [p for p in paths if len("".join(pg.get_text() for pg in pymupdf.open(os.path.join(R, p)))) < 200]
if scan and not RES: subprocess.run([sys.executable, "tools/ocr_all.py"] + scan, cwd=R, check=True, env=dict(os.environ, OMP_THREAD_LIMIT="1"))
# tag links: a fresh run, taken only for the new documents, and the links to them on the other sheets put on the end
before = json.load(open(os.path.join(R, "pid-refs.json"))); dt0 = json.load(open(os.path.join(R, "doc-tags.json")))
run("tools/build_pid_refs.py")
fresh = json.load(open(os.path.join(R, "pid-refs.json"))); out = dict(before); sw = set(new)
for n in sw: out[n] = fresh.get(n, [])
for a, refs in fresh.items():
    if a in sw or a not in out: continue
    for r in refs:
        if r[6] == "d" and any(t in sw for t in str(r[5]).split("|")) and not any(x[6] == "d" and x[5] == r[5] and abs(x[1] - r[1]) < 60 and abs(x[2] - r[2]) < 60 for x in out[a]):
            out[a].append(r[:7] + ([r[7]] if len(r) > 7 else []))
json.dump(out, open(os.path.join(R, "pid-refs.json"), "w"), separators=(",", ":"))
run("tools/fix_backrefs.py")
dt1 = json.load(open(os.path.join(R, "doc-tags.json"))); dt0.update({k: v for k, v in dt1.items() if k not in dt0})
for k, v in dt1.items():   # (the new documents on tags already listed)
    if k in dt0: dt0[k] += [x for x in v if x[0] in sw and x not in dt0[k]]
json.dump(dt0, open(os.path.join(R, "doc-tags.json"), "w"), separators=(",", ":"))
for t in ("build_pics.py", "build_bbox.py", "build_contents.py", "build_datasheets.py", "build_issues.py", "checks_auto.py", "build_refonly.py", "build_offline.py"): run("tools/" + t)
os.makedirs(os.path.join(RP, "inbox", "docs"), exist_ok=True)
for n, f in added: subprocess.run(["git", "mv", f, os.path.join(RP, "inbox", "docs", os.path.basename(f))], cwd=RP)
print("added:", ", ".join(f"{n} ({ix[n]['rev']})" for n in new))
