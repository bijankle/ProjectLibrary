"""Builds offline.json: the downloadable groups offered in Settings > Offline downloads (offline.js), with file sizes.
Run after the sources, spec and drawings builders: python3 tools/build_offline.py
Groups: the pipe and valve spec, the P&IDs, the PFD sheets, and one group per source document (its tables for the
viewer plus its Excel copy). The app itself (lists, PFD, flashcards) is always kept offline by sw.js and is not listed.
"""
import glob, hashlib, json, os
ROOT = os.path.join(os.path.dirname(__file__), "..")
rel = lambda p: os.path.relpath(p, ROOT).replace(os.sep, "/")
size = lambda fs: sum(os.path.getsize(os.path.join(ROOT, f)) for f in fs)
groups = []
def add(id, name, note, files):
    files = [f for f in files if os.path.exists(os.path.join(ROOT, f))]
    if files: groups.append({"id": id, "name": name, "note": note, "files": files, "size": size(files)})

add("spec", "Pipe & valve spec", "2000-F00-STS-PP-10001 Rev 3, every piping class and valve datasheet", ["spec/pvs.pdf"])
dw = json.load(open(os.path.join(ROOT, "PIDs", "index.json")))["pids"] if os.path.exists(os.path.join(ROOT, "PIDs", "index.json")) else {}
pid = sorted(v["file"] for k, v in dw.items() if "-PID-" in k); pfd = sorted(v["file"] for k, v in dw.items() if "-PFD-" in k)
# each drawing with its ready-made sheet pictures (tools/build_pics.py), so a kept drawing opens at once
pics = lambda fs: [x for f in fs for x in [f] + sorted(rel(p) for p in glob.glob(os.path.join(ROOT, f) + ".p*.png"))]
add("pids", "P&IDs", f"{len(pid)} drawings", pics(pid))
add("pfds", "PFD sheets", f"{len(pfd)} drawings", pics(pfd))
bfd = sorted(v["file"] for k, v in dw.items() if "-BLK-" in k)
add("bfds", "Block flowsheets", f"{len(bfd)} drawings", bfd)
six = json.load(open(os.path.join(ROOT, "sources", "index.json"))) if os.path.exists(os.path.join(ROOT, "sources", "index.json")) else {}
revs = json.load(open(os.path.join(ROOT, "tools", "doc_revs.json")))
for k, d in six.items():
    r = revs.get(k, {})
    files = [d["xlsx"]] + sorted(rel(p) for p in glob.glob(os.path.join(ROOT, "sources", k, "*.json")))
    add("src-" + k, r.get("full") or k, f"{r.get('number', '')} Rev {r.get('rev', '')}: tables to view offline and the Excel copy".strip(), files)
import re
cache = re.search(r'const DOCS = "([^"]+)"', open(os.path.join(ROOT, "sw.js")).read()).group(1)
# a short fingerprint of every file, so devices re-download only what has changed
ver = {f: hashlib.sha1(open(os.path.join(ROOT, f), "rb").read()).hexdigest()[:10] for g in groups for f in g["files"]}
sz = {f: os.path.getsize(os.path.join(ROOT, f)) for f in ver}
json.dump({"cache": cache, "ver": ver, "sz": sz, "groups": groups, "total": sum(g["size"] for g in groups)}, open(os.path.join(ROOT, "offline.json"), "w"), indent=1)
for g in groups: print(f"{g['name'][:40]:40} {len(g['files']):4} files {g['size'] / 1e6:7.1f} MB")
print(f"{'Everything':40} {sum(len(g['files']) for g in groups):4} files {sum(g['size'] for g in groups) / 1e6:7.1f} MB")
