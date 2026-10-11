"""Full read of every drawing in the app (P&IDs, PFDs, SLDs, TLDs, schematics, block diagrams): four Tesseract readings,
each written onto the sheet as invisible text, so the viewer's find and the contents index (tools/build_contents.py) see
everything printed, also on sheets whose CAD text layer misses words drawn as shapes.
  1. upright (tools/ocr_pids.py)                     marked ocr500
  2. upright, greys to black, strokes thickened      marked ocr500thick   (hairline lettering)
  3. a quarter turn clockwise (tools/ocr_slds.py)    marked ocrvert       (text running bottom to top)
  4. the same, thickened                              marked ocrvthick
A word already on the sheet in the same place is not added again. Each reading marks the PDF, so a rerun picks up
where it stopped.   python3 tools/ocr_all.py [files…]   (default: every drawing in PIDs/index.json)
"""
import json, os, sys, time
from multiprocessing import Pool
import pymupdf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_pids, ocr_slds
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
kws = lambda f: (pymupdf.open(f).metadata.get("keywords") or "").split()

def one(path):
    t0 = time.time(); n = 0
    try:
        k = kws(path)
        for thick, mark in ((False, "ocr500"), (True, "ocr500thick")):
            if mark not in k: n += ocr_slds.upright(path, thick)
        k = kws(path)
        if "ocrvert" not in k: n += ocr_slds.write(path, False)
        if "ocrvthick" not in k: n += ocr_slds.write(path, True)
        return path, n, round(time.time() - t0), ""
    except Exception as e:
        return path, n, round(time.time() - t0), repr(e)[:200]

if __name__ == "__main__":
    ix = json.load(open(os.path.join(ROOT, "PIDs", "index.json")))["pids"]
    files = sys.argv[1:] or [os.path.join(ROOT, v["file"]) for v in ix.values() if os.path.exists(os.path.join(ROOT, v["file"]))]
    files = [f for f in files if not {"ocr500", "ocr500thick", "ocrvert", "ocrvthick"} <= set(kws(f))]
    print(len(files), "sheets to read", flush=True)
    with Pool(os.cpu_count() or 2) as pool:
        for i, (p, n, s, err) in enumerate(pool.imap_unordered(one, files), 1):
            print(f"{i}/{len(files)} {os.path.basename(p)} {n} words {s}s {err}", flush=True)
    d = json.load(open(os.path.join(ROOT, "PIDs", "index.json")))   # (sizes changed)
    for v in d["pids"].values():
        f = os.path.join(ROOT, v["file"])
        if os.path.exists(f): v["size"] = os.path.getsize(f)
    json.dump(d, open(os.path.join(ROOT, "PIDs", "index.json"), "w"), indent=1, ensure_ascii=False)
    print("done", flush=True)
