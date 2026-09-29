"""Adds project documents (not drawings) to the app's document viewer: they open like a P&ID (pid.js), are searchable,
and the tags written in them are tappable (tools/build_pid_refs.py).

Usage: python3 tools/build_docs.py <pdc.pdf>     (then rerun tools/build_pid_refs.py)
Output: PIDs/<document number>.pdf, and its entry in PIDs/index.json ({"doc": true} so build_pids.py keeps it).
As with the drawings, the names in the cover sign off table and the client review stamp are blacked out, review stamp
annotations are removed and the file properties are cleared.
"""
import json, os, re, sys
import pymupdf

ROOT = os.path.join(os.path.dirname(__file__), "..")
DOCS = {r"DCR-PR-10002": ("2000-F00-DCR-PR-10002", "PROCESS DESIGN CRITERIA - STAGE 2")}
NAME = re.compile(r"^[A-Z]{1,2} (?:[A-Z][a-z]+|De|Van|Du)(?: [A-Z][a-z]+)*$")   # "J Bachiller", "J De Man"
ixp = os.path.join(ROOT, "PIDs", "index.json"); ix = json.load(open(ixp))
for src in sys.argv[1:]:
    hit = next(((n, t) for k, (n, t) in DOCS.items() if re.search(k, os.path.basename(src))), None)
    if not hit: print("unknown document, skipped:", src); continue
    num, title = hit
    doc = pymupdf.open(src); cover = doc[0]; text = cover.get_text()
    rev = (re.findall(r"^(\d+)\n", text, re.M) or ["?"])[-1]
    for a in list(cover.annots() or []): cover.delete_annot(a)
    for b in cover.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            s = "".join(sp["text"] for sp in l["spans"]).strip()
            if NAME.match(s) or re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", s): cover.add_redact_annot(pymupdf.Rect(l["bbox"]), fill=(0, 0, 0))
    for img in cover.get_images(full=True):   # signature images on the cover
        for r in cover.get_image_rects(img[0]):
            if r.width < cover.rect.width * .3: cover.add_redact_annot(r, fill=(0, 0, 0))
    cover.apply_redactions()
    doc.set_metadata({}); out = os.path.join(ROOT, "PIDs", num + ".pdf")
    doc.save(out, garbage=4, deflate=True)
    ix["pids"][num] = {"file": "PIDs/" + num + ".pdf", "title": title, "rev": rev, "pages": doc.page_count, "size": os.path.getsize(out), "doc": True}
    print(num, "rev", rev, doc.page_count, "pages", os.path.getsize(out) // 1024, "kB")
json.dump(ix, open(ixp, "w"), indent=1)
