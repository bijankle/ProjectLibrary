"""Files the documents uploaded from Sources (sources-list.js) into the library. Run by .github/workflows/ingest.yml on a
push that touches uploads/, or by hand: python3 tools/ingest_uploads.py
Each upload is a pair in uploads/: <NUMBER>_Rev<REV>.pdf and its note <NUMBER>_Rev<REV>.json
{number, rev, title (new documents), uploaded (ISO time), file (the name it had)}. A PDF waits until its note is there
(the app sends the note first, but each is its own commit).
- A document already in PIDs/index.json: its current file moves to <folder>/rev/<NUMBER>_Rev<oldrev>.pdf and goes on
  the entry's "revs" list (oldest first: {rev, date, file, size}); the new file takes the normal path and the entry's
  rev, date (the upload's day), size and pages. The same rev again replaces the file (a correction); an older rev than
  the current one is only filed under revs.
- A new number gets a new entry (PFDs/ for a -PFD- number, PIDs/ for everything else, as tools/build_pids.py does).
Nothing is redacted. The processed pair is removed from uploads/; then the sheet pictures (build_pics.py, only the
missing ones), offline.json (build_offline.py) and sw.js's VERSION (so the app refreshes) are rebuilt.
Safe to run with nothing to do (changes nothing) and again after a failure.
"""
import glob, json, os, re, shutil, subprocess, sys, time
import pymupdf as fitz

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
UP, IDX = os.path.join(ROOT, "uploads"), os.path.join(ROOT, "PIDs", "index.json")
A = lambda rel: os.path.join(ROOT, rel)
NUM, REV = re.compile(r"^[A-Z0-9][A-Z0-9-]{4,60}$"), re.compile(r"^[A-Z0-9]{1,4}$")

def rk(r):   # as the app (sources-list.js): letters (issues before Rev 0) < numbers, 1A after 1
    r = str(r or "").upper(); m = re.match(r"^(\d+)([A-Z]?)$", r)
    return (1, int(m.group(1)), m.group(2)) if m else (0, len(r), r) if re.match(r"^[A-Z]{1,2}$", r) else (0, 0, r)

def pages(path):
    with fitz.open(path) as d: return d.page_count

def free(rel):   # a path not taken yet: X.pdf, else X_2.pdf, X_3.pdf…
    base, ext = os.path.splitext(rel); n, out = 2, rel
    while os.path.exists(A(out)): out = f"{base}_{n}{ext}"; n += 1
    return out

def drop_pics(rel):   # the old sheet pictures of a file that changed (build_pics draws them again)
    for p in glob.glob(A(rel) + ".p*.png"): os.remove(p)

def main():
    notes = sorted(glob.glob(os.path.join(UP, "*.json")))
    lone = [p for p in glob.glob(os.path.join(UP, "*.pdf")) if not os.path.exists(p[:-4] + ".json")]
    for p in lone: print(f"waiting for its note: uploads/{os.path.basename(p)}")
    if not notes: print("Nothing to ingest."); return 0
    index = json.load(open(IDX)); P = index["pids"]; done, skipped = [], []
    def when(p):
        try: return str(json.load(open(p)).get("uploaded", ""))
        except (ValueError, AttributeError): return ""
    for jp in sorted(notes, key=lambda p: (when(p), p)):   # (oldest upload first, so the last one sent ends up current)
        pdf, name = jp[:-5] + ".pdf", os.path.basename(jp)[:-5]
        if not os.path.exists(pdf): print(f"waiting for its PDF: uploads/{name}.pdf"); continue
        try: note = json.load(open(jp)); note = note if isinstance(note, dict) else {}
        except ValueError: note = {}
        m = re.match(r"^(.+)_Rev([A-Za-z0-9]+)$", name)
        num = str(note.get("number") or (m and m.group(1)) or "").strip().upper()
        rev = str(note.get("rev") or (m and m.group(2)) or "").strip().upper()
        date = str(note.get("uploaded") or time.strftime("%Y-%m-%d"))[:10]
        try: n = pages(pdf)
        except Exception: n = 0
        if not NUM.match(num) or not REV.match(rev) or not n:
            # not something to file: set aside (out of the way of the next run) and say why
            why = "not a readable PDF" if not n else "bad number or revision"
            os.makedirs(os.path.join(UP, "failed"), exist_ok=True)
            for p in (pdf, jp): shutil.move(p, os.path.join(UP, "failed", os.path.basename(p)))
            skipped.append(f"{name}: {why}, moved to uploads/failed/"); continue
        size = os.path.getsize(pdf); e = P.get(num)
        if e:
            folder = os.path.dirname(e["file"]) or "PIDs"; cur = e.get("rev", "")
            if cur and rev != cur and rk(rev) < rk(cur):
                # an older revision than the one in use: kept under revs only
                rel = free(f"{folder}/rev/{num}_Rev{rev}.pdf"); os.makedirs(os.path.dirname(A(rel)), exist_ok=True); shutil.move(pdf, A(rel))
                e["revs"] = sorted(e.get("revs", []) + [{"rev": rev, "date": date, "file": rel, "size": size}], key=lambda r: rk(r["rev"]))
                done.append(f"{num} Rev {rev}: filed as a superseded revision (current is Rev {cur})")
            else:
                if rev != cur and os.path.exists(A(e["file"])):
                    rel = free(f"{folder}/rev/{num}_Rev{cur or '-'}.pdf"); os.makedirs(os.path.dirname(A(rel)), exist_ok=True)
                    shutil.move(A(e["file"]), A(rel))
                    e.setdefault("revs", []).append({"rev": cur, "date": e.get("date", ""), "file": rel, "size": os.path.getsize(A(rel))})
                dest = f"{folder}/{num}.pdf"; drop_pics(e["file"]); drop_pics(dest)
                shutil.move(pdf, A(dest))
                for k in ("ocr", "inferred", "from", "status"): e.pop(k, None)   # (about the old file's origin)
                e.update({"file": dest, "rev": rev, "date": date, "pages": n, "size": size})
                done.append(f"{num} Rev {rev}: " + (f"replaces Rev {cur or '-'}" if rev != cur else "replaces the file of the same revision"))
        else:
            dest = f"{'PFDs' if '-PFD-' in num else 'PIDs'}/{num}.pdf"; drop_pics(dest); shutil.move(pdf, A(dest))
            P[num] = {"file": dest, "title": str(note.get("title") or "").strip() or num, "rev": rev, "date": date, "pages": n, "size": size}
            done.append(f"{num} Rev {rev}: new document")
        os.remove(jp)
    if not done:
        for s in skipped: print("skipped:", s)
        print("Nothing filed."); return 0
    json.dump(index, open(IDX, "w"), indent=1)
    # build_pics redraws a picture older than its PDF; a fresh checkout gives every file the same time, so mark the
    # pictures there as current: only the removed ones (the files that changed) are drawn
    now = time.time()
    for p in glob.glob(A("P*Ds/*.png")): os.utime(p, (now, now))
    for tool in ("build_pics.py", "build_offline.py"):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", tool)], cwd=ROOT, capture_output=True, text=True)
        print(f"{tool}: " + (r.stdout.strip().splitlines() or [""])[-1])
        if r.returncode: print(r.stderr); return r.returncode
    sw = open(A("sw.js")).read(); v = re.search(r'const VERSION = "kcgm-v(\d+)"', sw)
    if v: sw = sw.replace(v.group(0), f'const VERSION = "kcgm-v{int(v.group(1)) + 1}"'); open(A("sw.js"), "w").write(sw)
    print(f"Ingested {len(done)} upload(s), app version kcgm-v{int(v.group(1)) + 1 if v else '?'}:")
    for s in done: print("  " + s)
    for s in skipped: print("  skipped: " + s)
    return 0

if __name__ == "__main__": sys.exit(main())
