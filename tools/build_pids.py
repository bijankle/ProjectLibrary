"""Splits combined P&ID (and PFD) PDFs into one PDF per drawing number for the app (pid.js) and indexes them.

Usage: python3 tools/build_pids.py <pdf or folder> [<pdf or folder> ...] [--pattern REGEX]
Output: PIDs/<drawing number>.pdf and PFDs/<drawing number>.pdf (all sheets of that number, in order) and PIDs/index.json
Numbers that can't be read are set by eye in tools/pid_numbers.json ({source file name: drawing number}).
  index: {meta, pids: {number: {file, title, rev, date, status, pages, size}}}
Each page's own drawing number is read from its title block (the largest text matching the pattern in the bottom right
corner); pages with no number are reported and skipped. On every page the initials / names under DRAW, CHECK, DESIGN,
TECH APP, PROJ APP, their signature images (and a client review stamp signatory) are blacked out,
review stamp annotations are removed and the file properties are cleared.
Existing files in PIDs/ and PFDs/ are replaced; rerun with all the source PDFs whenever a revision comes in.
"""
import glob, json, os, re, sys
from collections import defaultdict
import pymupdf
argv = sys.argv[1:]
pat = r"2000-F\d{2}-(?:PID|PFD)-[A-Z]{2}-\d{5}"
if "--pattern" in argv: k = argv.index("--pattern"); pat = argv[k + 1]; del argv[k:k + 2]
args = argv
NUM = re.compile(pat)
ROOT = os.path.join(os.path.dirname(__file__), "..")
FOLDER = {"PID": "PIDs", "PFD": "PFDs"}   # P&IDs in PIDs/, PFD sheets in PFDs/, one index for both in PIDs/index.json
OVERRIDE = os.path.join(os.path.dirname(__file__), "pid_numbers.json")   # {"source file.pdf": "drawing number"} read by eye
MON = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
SIGN = ("DRAW", "DRAWN", "CHECK", "CHECKED", "DESIGN", "DESIGNED", "TECH APP", "PROJ APP", "CLIENT APP", "APPR", "APPROVED")

files = []
nat = lambda f: [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", os.path.basename(f))]   # _2 before _10
for a in args: files += sorted(glob.glob(os.path.join(a, "*.pdf")), key=nat) if os.path.isdir(a) else [a]
if not files: sys.exit("no PDFs given")

def lines(p):
    out = []
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            s = " ".join(sp["text"] for sp in l["spans"]).strip()
            if s: out.append((pymupdf.Rect(l["bbox"]), s, max(sp["size"] for sp in l["spans"])))
    return out

# title block fields, found by their labels (DRG No., REVISION, TITLE:) so OCR'd sheets read the same as native ones
LOOSE = re.compile(r"[0-9OoIlZ?]{3,6}\s*-\s*F\s*([0-9O]{2})\s*-\s*(PID|PFD|P1D|PlD)\s*-\s*([A-Z]{2})\s*-\s*([0-9OoIl]{5})")
digits = lambda t: t.replace("O", "0").replace("o", "0").replace("I", "1").replace("l", "1")
def label(L, rx, W, H):
    c = [r for r, s, _ in L if re.fullmatch(rx, s.strip(), re.I) and r.x0 > W * .6 and r.y0 > H * .8]
    return max(c, key=lambda r: r.y0) if c else None
def tblock(p, L):
    W, H = p.rect.width, p.rect.height
    drg, rv, tt = label(L, r"DRG\s*No\.?", W, H), label(L, r"REVISION", W, H), label(L, r"TITLE\s*:?|O\s*TITLE\s*:?", W, H)
    num = rev = None; title = []
    if drg:
        x1 = rv.x0 if rv else W
        for r, s, _ in L:
            if drg.y1 - 3 < r.y0 < drg.y1 + 30 and drg.x0 - 20 < r.x0 < x1:
                m = LOOSE.search(s)
                if m: num = f"2000-F{digits(m.group(1))}-{'PFD' if m.group(2) == 'PFD' else 'PID'}-{m.group(3)}-{digits(m.group(4))}"
    if rv:
        for r, s, _ in L:
            if rv.y1 - 3 < r.y0 < rv.y1 + 30 and rv.x0 - 30 < r.x0 < rv.x1 + 30 and re.fullmatch(r"[0-9A-Z]{1,2}", s.strip()): rev = s.strip()
    if not tt or not drg:   # labels unreadable: the Primero A1 title box by position
        rows = sorted([(r, s) for r, s, _ in L if W * .74 < r.x0 < W * .9 and H * .893 < r.y0 < H * .938], key=lambda z: (round(z[0].y0 / 6), z[0].x0))
        title = [s for r, s in rows if not re.search(r"(PIPING AND INSTRUMENTATION|PROCESS FLOW) DIAGRAM|TITLE", s)]
        if not rev:
            for r, s, _ in L:
                if W * .945 < r.x0 < W * .96 and H * .94 < r.y0 < H * .957 and re.fullmatch(r"[0-9A-Z]{1,2}", s.strip()): rev = s.strip()
    if tt and drg:
        rows = sorted([(r, s) for r, s, _ in L if r.x0 >= tt.x1 - 4 and r.x1 < W - 5 and tt.y0 - 6 < r.y0 < drg.y0 - 2], key=lambda z: (round(z[0].y0 / 6), z[0].x0))
        title = [s for r, s in rows if not re.search(r"(PIPING AND INSTRUMENTATION|PROCESS FLOW) DIAGRAM", s)]
    return num, rev, re.sub(r"\s+", " ", " ".join(title)).strip(" -")

def fixed(p, L):
    """Primero A1 title block at its fixed place: the drawing number box (OCR'd labels are often unreadable)"""
    W, H = p.rect.width, p.rect.height
    for r, s, _ in L:
        if W * .80 < r.x0 < W * .86 and H * .94 < r.y0 < H * .957:
            m = LOOSE.search(s)
            if m: return f"2000-F{digits(m.group(1))}-{'PFD' if m.group(2) == 'PFD' else 'PID'}-{m.group(3)}-{digits(m.group(4))}"
def ocr(p):
    """Last resort for scanned sheets: OCR the bottom right corner (Primero stamp or title block) with Tesseract"""
    import shutil, subprocess, tempfile
    if not shutil.which("tesseract"): return None
    W, H = p.rect.width, p.rect.height
    k = 2384 / W   # same pixel density whatever the sheet size
    for clip, psm in ((pymupdf.Rect(W * .78, H * .8, W, H), "6"), (pymupdf.Rect(W * .6, H * .7, W, H), "11")):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "c.png"); p.get_pixmap(clip=clip, dpi=int(300 * k)).save(f)
            t = subprocess.run(["tesseract", f, "-", "--psm", psm], capture_output=True, text=True).stdout
        found = {f"2000-F{digits(m[0])}-{'PFD' if m[1] == 'PFD' else 'PID'}-{m[2]}-{digits(m[3])}" for m in LOOSE.findall(t)}
        if len(found) == 1: return found.pop()
    return None
OCRED = set()
def number(p, L):
    num = tblock(p, L)[0] or fixed(p, L)
    if num: return num
    W, H = p.rect.width, p.rect.height   # no labelled title block: the largest matching text in the title block corner
    c = [(sz, s) for r, s, sz in L if r.x0 > W * .75 and r.y0 > H * .92 and NUM.search(s)]
    if c: return NUM.search(max(c)[1]).group(0)
    num = ocr(p)
    if num: OCRED.add(num)
    return num

def title_rev(p, L):
    num, rev, title = tblock(p, L)
    t = p.get_text().replace("\n", "|")
    revs = re.findall(r"\|\s*([0-9A-Z])\|\s*(\d{2})([A-Z]{3})(\d{2})\s*\|?\s*([A-Z0-9 &/.,-]+?)\|", t)
    row = ([r for r in revs if r[0] == rev] or sorted(revs, key=lambda r: r[0]))[-1:] if revs else []
    row = row[0] if row else None
    if not title:
        m = re.search(r"PRIMERO PROJECT NUMBER:\|(.{3,200}?)\|\s*(?:PIPING AND INSTRUMENTATION DIAGRAM|PROCESS FLOW DIAGRAM|P&ID)\b", t)
        title = re.sub(r"\s*\|\s*", " ", m.group(1)).strip() if m else ""
    title = re.sub(r"(\s+\d{1,2})+$", "", title).replace(" ?", "").strip()   # drop the border grid number and OCR noise
    if re.search(r"KALGOORLIE|CLIENT|MINPROC|WORLEY|SEDGMAN|\bDATE\b", title): title = ""   # older title block read in the wrong place
    date = f"20{row[3]}-{MON.get(row[2], 1):02d}-{int(row[1]):02d}" if row and row[2] in MON else ""
    return title, rev or (row[0] if row else ""), date, (row[4].strip() if row else "")

BANDS = {}   # page size -> sign off band found on a sheet of that size, reused on sheets whose text is outlined
def margins(p):
    """CAD plot stamps along the sheet edges carry the plotting person's login, e.g. '…30PI0438.dwg-Kieta.Hoelzema'"""
    W, H = p.rect.width, p.rect.height; n = 0
    edge = lambda w: w[1] < H * .035 or w[3] > H * .965 or w[0] < W * .03 or w[2] > W * .975
    words = [w for w in p.get_text("words") if edge(w)] + tess_words(p, pymupdf.Rect(0, H * .965, W, H))
    for w in words:
        t = w[4]
        if re.search(r"\.(dwg|dgn|DWG|DGN)-", t) or re.fullmatch(r"[A-Z][a-z]+\.[A-Z][a-z]+[,.;]?", t):
            p.add_redact_annot(pymupdf.Rect(w[:4]) + (-1, -1, 1, 1), fill=(1, 1, 1)); n += 1
    return n
def redact(p, L):
    m = margins(p)
    if "primero.com.au" not in p.get_text().lower().replace(" ", ""):   # an older (client, Minproc, Worley…) title block
        n = legacy(p) + m
        if n: p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED)
        return n
    n = m; found = []
    heads = [(r, s) for r, s, _ in L if any(re.fullmatch(r"\s*" + h + r"\s*", x) for h in SIGN for x in re.split(r"\s{2,}", s))]
    heads += [(pymupdf.Rect(w[:4]), w[4]) for w in p.get_text("words") if w[4].strip(".|").upper() in ("DRAW", "CHECK", "DESIGN", "TECH", "PROJ", "APP")
              and w[0] < p.rect.width * .5]   # not the "DESIGN | CONSTRUCT | OPERATE" tagline under the logo
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

KEEP = {"SAG", "MT", "AS", "BI", "APP", "CHK", "CL", "ST", "NO.", "UP", "CV", "PP", "HP", "LP", "TK", "DG", "CH", "IA", "VSD", "PSV", "ETC", "MIN", "MAX", "OD", "ID", "PE", "SS", "HDPE", "DWG", "RL", "EL", "NTS", "REV", "NO", "B1", "A1", "A0", "A2", "A3", "B0", "B2", "KCGM", "PID", "PFD", "LTD", "PTY", "FOR", "THE", "AND", "OF", "TO", "IN", "ON", "BY", "SP1", "SP2", "IFC", "IFD", "IFR", "AFC", "N/A", "DN", "MM", "GW", "MS", "PW", "SW", "CW"}
def tess_words(p, clip):
    """words Tesseract finds in part of the page, as (x0, y0, x1, y1, text) in page coordinates"""
    import shutil, subprocess, tempfile
    if not shutil.which("tesseract"): return []
    k = 300 / 72
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "c.png"); p.get_pixmap(clip=clip, dpi=300).save(f)
        tsv = subprocess.run(["tesseract", f, "-", "--psm", "11", "tsv"], capture_output=True, text=True).stdout
    out = []
    for row in tsv.splitlines()[1:]:
        c = row.split("\t")
        if len(c) == 12 and c[11].strip() and float(c[10]) > 30:
            x, y, w, h = (int(v) for v in c[6:10])
            out.append((clip.x0 + x / k, clip.y0 + y / k, clip.x0 + (x + w) / k, clip.y0 + (y + h) / k, c[11].strip()))
    return out
def legacy(p):
    """Older scanned sheets (KCGM, Minproc, Worley… title blocks, Primero stamp): black out, in the bottom title block
    band, anything that reads as a person: D.MARSHALL style names, 2-3 letter initials and the name after SIGNED:.
    Uses the sheet's OCR text layer; redaction clears both the scanned pixels and the hidden text there."""
    W, H = p.rect.width, p.rect.height; n = 0
    words = [w for w in p.get_text("words") if w[1] > H * .78] + tess_words(p, pymupdf.Rect(0, H * .78, W, H))
    for i, w in enumerate(words):
        t = w[4].strip(".,:;|()[]"); u = t.upper()
        name = re.fullmatch(r"[A-Z]{1,2}\.\s?[A-Z][A-Za-z'\-]{2,}", t) or re.fullmatch(r"[A-Z]\.[A-Z]{1,2}\.?", t)
        initials = False
        after_signed = i and re.fullmatch(r"SIGNED:?", words[i - 1][4].strip().upper() or "") and re.fullmatch(r"[A-Z][A-Za-z.'\-]+", t)
        if name or initials or after_signed:
            p.add_redact_annot(pymupdf.Rect(w[:4]) + (-2, -2, 2, 2), fill=(0, 0, 0)); n += 1
    # revision tables: short entries in the BY / CHECKED / APPROV. columns (rows sit above or below the headings);
    # a heading only counts when another one sits beside it, so "APPROVED FOR CONSTRUCTION" is left alone
    HEAD = re.compile(r"^(BY|CHECKED|CHECK|CHK|CHKD|APPROV|APPROVED|APPR|APP|TECH|DRN|DSGN|ENG)$", re.I)
    heads = [w for w in words if HEAD.match(w[4].strip(":.").strip())]
    heads = [w for w in heads if any(v is not w and abs(v[1] - w[1]) < 4 and abs(v[0] - w[0]) < W * .07 for v in heads)]
    heads = [w for w in heads if w[2] - w[0] < W * .04]   # a real column heading is a short word
    for hd in heads:
        for v in words:
            cx = (v[0] + v[2]) / 2; t = v[4].strip()
            if hd[0] - 6 < cx < hd[2] + 6 and v is not hd and -H * .045 < v[1] - hd[1] < H * .045 and not re.search(r"\d", t) \
               and re.fullmatch(r"[A-Za-z][A-Za-z.'\-]{0,4}", t) and not HEAD.match(t.strip(":.")) and t.upper() not in KEEP:
                p.add_redact_annot(pymupdf.Rect(v[:4]) + (-2, -2, 2, 2), fill=(0, 0, 0)); n += 1
    # sign off tables with the role written beside the name: DRAWN  K. HOEKSEMA  NOV 2023
    LAB = re.compile(r"^(DRAWN|CHECKED|DESIGNED|APPR|DRAFTED|REVIEWED)$", re.I)
    rows = sorted(words, key=lambda w: (w[1], w[0]))
    for w in rows:
        prev = [v for v in words if abs(v[1] - w[1]) < 4 and 0 < w[0] - v[2] < 12]
        is_app = w[4].strip(":.").upper() == "APP" and any(v[4].strip(":.").upper() in ("TECH", "PROJ", "CLIENT") for v in prev)
        if not (LAB.match(w[4].strip(":.")) or is_app): continue
        yc, h = (w[1] + w[3]) / 2, w[3] - w[1]
        right = sorted([v for v in words if abs((v[1] + v[3]) / 2 - yc) < max(3, h * .6) and w[2] < v[0] < w[2] + W * .09], key=lambda v: v[0])
        for v in right:
            t = v[4].strip()
            if LAB.match(t.strip(":.")) or re.search(r"\d", t) or t.upper() in ("FOR", "AS", "TO"): break   # stop at the date or the next role
            if re.fullmatch(r"[A-Z][A-Za-z.'\-]*", t) and t.upper() not in KEEP:
                p.add_redact_annot(pymupdf.Rect(v[:4]) + (-2, -2, 2, 2), fill=(0, 0, 0)); n += 1
    return n

groups, skipped, info, marks, inferred = defaultdict(list), [], {}, 0, set()
def split(n): m = re.match(r"(.*?)(\d+)$", n); return m.group(1), int(m.group(2)), len(m.group(2))
for f in files:
    d = pymupdf.open(f); nums = []
    for i, p in enumerate(d):
        L = lines(p); nums.append((number(p, L), L))
    # pages whose number can't be read (outlined text): if the readable numbers either side leave exactly that many
    # numbers free, the sheets are taken to be in order and numbered into the gap
    ov = json.load(open(OVERRIDE)) if os.path.exists(OVERRIDE) else {}
    if os.path.basename(f) in ov and len(nums) == 1: nums[0] = (ov[os.path.basename(f)], nums[0][1])
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
for fd in FOLDER.values():
    os.makedirs(os.path.join(ROOT, fd), exist_ok=True)
    for old in glob.glob(os.path.join(ROOT, fd, "*.pdf")): os.remove(old)
index = {}
for num in sorted(groups):
    out = pymupdf.open(); seen_pages = []
    keep = []
    for f, i in reversed(groups[num]):   # latest upload first, so of two copies of a sheet the later revision is kept
        # take the sheet on its own first (copying straight out of a combined file can drag along half of it), bake
        # the markups (Primero clouds, new tags, stamps) into the drawing so they can't be edited and names in them can
        # be blacked out, and remove any page rotation so coordinates match what is seen
        src = pymupdf.open(f); src.select([i]); src.bake(); src[0].remove_rotation()
        px = src[0].get_pixmap(dpi=12, colorspace=pymupdf.csGRAY).samples   # the same sheet uploaded twice
        if any(len(o) == len(px) and sum(abs(x - y) for x, y in zip(o, px)) / len(px) < 2 for o in seen_pages): continue
        seen_pages.append(px); keep.insert(0, pymupdf.open("pdf", src.tobytes(garbage=4, deflate=True)))
    for k in keep: out.insert_pdf(k)
    for p in out: marks += redact(p, lines(p))
    out.set_metadata({"title": num, "author": "", "subject": "Growth Project P&ID", "keywords": "", "creator": "", "producer": ""})
    out.del_xml_metadata()
    rel = f"{FOLDER['PFD' if '-PFD-' in num else 'PID']}/{num}.pdf"; path = os.path.join(ROOT, rel)
    out.save(path, garbage=4, deflate=True, clean=True)
    title, rev, date, status = info[num]
    index[num] = {"file": rel, "title": title, "rev": rev, "date": date, "status": status, "pages": len(out), "size": os.path.getsize(path)}
    if num in inferred: index[num]["inferred"] = 1
    if num in OCRED: index[num]["ocr"] = 1
    index[num]["from"] = [f"{os.path.basename(f)}#{i + 1}" for f, i in groups[num]]
# documents added by tools/build_docs.py (the PDC…) stay in the index
try:
    for k, v in json.load(open(os.path.join(ROOT, "PIDs", "index.json")))["pids"].items():
        if v.get("doc") and k not in index: index[k] = v
except (OSError, ValueError, KeyError): pass
# drawings stamped cancelled or superseded (tools/withdrawn.json) stay out
try:
    for k in json.load(open(os.path.join(ROOT, "tools", "withdrawn.json")))["pids"]: index.pop(k, None)
except (OSError, ValueError, KeyError): pass
json.dump({"meta": {"unread": skipped, "built": "tools/build_pids.py", "sources": [os.path.basename(f) for f in files], "note": "Names and initials in the sign off blocks blacked out."}, "pids": index},
          open(os.path.join(ROOT, "PIDs", "index.json"), "w"), indent=1)
if OCRED: print("numbers read by OCR from the corner of scanned sheets:", ", ".join(sorted(OCRED)))
if inferred: print("numbers inferred from the sheet order (text outlined):", ", ".join(sorted(inferred)))
print(len(index), "drawings,", sum(v["pages"] for v in index.values()), "pages,", marks, "names blacked out,", round(sum(v["size"] for v in index.values()) / 1e6, 1), "MB")
if skipped: print("no drawing number found on:", ", ".join(skipped[:20]), "…" if len(skipped) > 20 else "")
