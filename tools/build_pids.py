"""Splits combined P&ID (and PFD) PDFs into one PDF per drawing number for the app (pid.js) and indexes them.

Usage: python3 tools/build_pids.py <pdf or folder> [<pdf or folder> ...] [--pattern REGEX]
Output: drawings/<drawing number>.pdf (all sheets of that number, in order) and drawings/index.json
  index: {meta, pids: {number: {file, title, rev, date, status, pages, size}}}
Each page's own drawing number is read from its title block (the largest text matching the pattern in the bottom right
corner); pages with no number are reported and skipped. On every page the initials / names under DRAW, CHECK, DESIGN,
TECH APP, PROJ APP, their signature images (and a client review stamp signatory) are blacked out,
review stamp annotations are removed and the file properties are cleared.
Existing files in drawings/ are replaced; rerun with all the source PDFs whenever a revision comes in.
"""
import glob, json, os, re, sys
from collections import defaultdict
import pymupdf
argv = sys.argv[1:]
pat = r"2000-F\d{2}-(?:PID|PFD)-[A-Z]{2}-\d{5}"
if "--pattern" in argv: k = argv.index("--pattern"); pat = argv[k + 1]; del argv[k:k + 2]
args = argv
NUM = re.compile(pat)
OUT = os.path.join(os.path.dirname(__file__), "..", "drawings")
MON = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
SIGN = ("DRAW", "DRAWN", "CHECK", "CHECKED", "DESIGN", "DESIGNED", "TECH APP", "PROJ APP", "CLIENT APP", "APPR", "APPROVED")

files = []
for a in args: files += sorted(glob.glob(os.path.join(a, "*.pdf"))) if os.path.isdir(a) else [a]
if not files: sys.exit("no PDFs given")

def lines(p):
    out = []
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            s = " ".join(sp["text"] for sp in l["spans"]).strip()
            if s: out.append((pymupdf.Rect(l["bbox"]), s, max(sp["size"] for sp in l["spans"])))
    return out

def number(p, L):
    W, H = p.rect.width, p.rect.height
    c = [(sz, s) for r, s, sz in L if r.x0 > W * .6 and r.y0 > H * .75 and NUM.search(s)]
    if not c: c = [(sz, s) for r, s, sz in L if NUM.search(s)]
    return NUM.search(max(c)[1]).group(0) if c else None

def title_rev(p, L):
    t = p.get_text().replace("\n", "|")
    revs = re.findall(r"\|\s*([0-9A-Z])\|\s*(\d{2})([A-Z]{3})(\d{2})\s*\|?\s*([A-Z0-9 &/.,-]+?)\|", t)
    rev = max(revs, key=lambda r: r[0]) if revs else None
    m = re.search(r"PRIMERO PROJECT NUMBER:\|(.{3,200}?)\|\s*(?:PIPING AND INSTRUMENTATION DIAGRAM|PROCESS FLOW DIAGRAM|P&ID)\b", t)
    title = re.sub(r"\s*\|\s*", " ", m.group(1)).strip() if m else ""
    date = f"20{rev[3]}-{MON.get(rev[2], 1):02d}-{int(rev[1]):02d}" if rev and rev[2] in MON else ""
    return title, (rev[0] if rev else ""), date, (rev[4].strip() if rev else "")

BANDS = {}   # page size -> sign off band found on a sheet of that size, reused on sheets whose text is outlined
def redact(p, L):
    n = 0; found = []
    heads = [(r, s) for r, s, _ in L if any(re.fullmatch(r"\s*" + h + r"\s*", x) for h in SIGN for x in re.split(r"\s{2,}", s))]
    # the sign off columns: from the first heading to the last one on that header row
    rows = defaultdict(list)
    for r, s in heads: rows[round(r.y0 / 4)].append(r)
    for rs in rows.values():
        if len(rs) < 2: continue
        x0, x1, yh = min(r.x0 for r in rs) - 4, max(r.x1 for r in rs) + 4, min(r.y0 for r in rs)
        for r, s, _ in L:
            if r.x0 >= x0 and r.x1 <= x1 and yh - 80 < r.y1 <= yh + 1 and not any(h in s.upper() for h in SIGN):
                p.add_redact_annot(r + (-1, -1, 1, 1), fill=(0, 0, 0)); n += 1
        band = pymupdf.Rect(x0, yh - 80, x1, yh + 1); found.append(band)
        for im in p.get_image_info():   # signature images in the sign off cells
            r = pymupdf.Rect(im["bbox"]) & band
            if r.width > 1 and r.height > 1: p.add_redact_annot(r, fill=(0, 0, 0)); n += 1
    # a client review stamp: "A Name" just before a date like 3/11/25
    txt = [(r, s) for r, s, _ in L]
    for i, (r, s) in enumerate(txt):
        if re.fullmatch(r"[A-Z]\.? ?[A-Z][a-z]+(?: [A-Z][a-z]+)?", s) and any(re.fullmatch(r"\d{1,2}/\d{1,2}/\d{2,4}", s2) and abs(r2.y0 - r.y0) < 30 and abs(r2.x0 - r.x0) < 200 for r2, s2 in txt):
            p.add_redact_annot(r + (-1, -1, 1, 1), fill=(0, 0, 0)); n += 1
    size = (round(p.rect.width), round(p.rect.height))
    if found: BANDS[size] = found
    elif size in BANDS:   # no readable sign off headings (outlined text): black out the same band as its sister sheets
        for band in BANDS[size]: p.add_redact_annot(band + (1, 1, -1, -1), fill=(0, 0, 0)); n += 1
    if n: p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED)
    return n

groups, skipped, info, marks, inferred = defaultdict(list), [], {}, 0, set()
def split(n): m = re.match(r"(.*?)(\d+)$", n); return m.group(1), int(m.group(2)), len(m.group(2))
for f in files:
    d = pymupdf.open(f); nums = []
    for i, p in enumerate(d):
        L = lines(p); nums.append((number(p, L), L))
    # pages whose number can't be read (outlined text): if the readable numbers either side leave exactly that many
    # numbers free, the sheets are taken to be in order and numbered into the gap
    for i, (num, L) in enumerate(nums):
        if num: continue
        a = next((k for k in range(i - 1, -1, -1) if nums[k][0]), None); b = next((k for k in range(i + 1, len(nums)) if nums[k][0]), None)
        if a is None or b is None: continue
        pa, na, w = split(nums[a][0]); pb, nb, _ = split(nums[b][0])
        if pa == pb and nb - na == b - a:
            nums[i] = (f"{pa}{na + (i - a):0{w}d}", L); inferred.add(nums[i][0])
    for i, (num, L) in enumerate(nums):
        if not num: skipped.append(f"{os.path.basename(f)} page {i + 1}"); continue
        groups[num].append((f, i))
        if num not in info or not info[num][0]: info[num] = title_rev(d[i], L)
os.makedirs(OUT, exist_ok=True)
for old in glob.glob(os.path.join(OUT, "*.pdf")): os.remove(old)
index = {}
for num in sorted(groups):
    out = pymupdf.open()
    for f, i in groups[num]:
        # take the sheet on its own first: copying straight out of a combined file drags along everything its
        # review stamp annotations reference. Stamps and markups are dropped (they carry reviewers' signatures).
        src = pymupdf.open(f); src.select([i])
        pg = src[0]
        while True:
            a = pg.first_annot
            if not a: break
            pg.delete_annot(a)
        out.insert_pdf(pymupdf.open("pdf", src.tobytes(garbage=4, deflate=True)))
    for p in out: marks += redact(p, lines(p))
    out.set_metadata({"title": num, "author": "", "subject": "KCGM Growth Project P&ID", "keywords": "", "creator": "", "producer": ""})
    out.del_xml_metadata()
    path = os.path.join(OUT, num + ".pdf"); out.save(path, garbage=4, deflate=True, clean=True)
    title, rev, date, status = info[num]
    index[num] = {"file": f"drawings/{num}.pdf", "title": title, "rev": rev, "date": date, "status": status, "pages": len(out), "size": os.path.getsize(path)}
    if num in inferred: index[num]["inferred"] = 1
json.dump({"meta": {"built": "tools/build_pids.py", "sources": [os.path.basename(f) for f in files], "note": "Names and initials in the sign off blocks blacked out."}, "pids": index},
          open(os.path.join(OUT, "index.json"), "w"), indent=1)
if inferred: print("numbers inferred from the sheet order (text outlined):", ", ".join(sorted(inferred)))
print(len(index), "drawings,", sum(v["pages"] for v in index.values()), "pages,", marks, "names blacked out,", round(sum(v["size"] for v in index.values()) / 1e6, 1), "MB")
if skipped: print("no drawing number found on:", ", ".join(skipped[:20]), "…" if len(skipped) > 20 else "")
