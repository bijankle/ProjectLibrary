"""Reads the cover page / title block of every source document and writes tools/doc_revs.json:
document number, title, latest revision and date, status, the full revision history and the client review stamp.
Used by tools/build_issues.py (the newer of two clashing documents is taken as true) and tools/build_search.py,
and shown on the Source documents tab of the Checks page (issues.html#sources).

Usage: python3 tools/doc_revs.py <folder holding the source .xlsx and .pdf files>
Where the revisions come from:
  spreadsheets  the "Cover page" sheet, rows under DATE / REVISION / STATUS
  MEL           no cover page, so the "Rev 0, Issued for Use, 26/12/2025" text at the top of the MEL sheet
  PFDs          the title block revision rows on each sheet, e.g. "1 | 04SEP26 | SP1 AS BUILT" (most common per revision)
  reports       the DATE / REVISION / STATUS table on the cover, e.g. "10-Sept-24 | 4 | General Updates"
  other PDFs    revision from the file name where the document has no readable revision block
Only numbers, titles, revisions, dates and status are kept (no names).
"""
import datetime, glob, json, os, re, sys, warnings
from collections import Counter
warnings.filterwarnings("ignore")
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "doc_revs.json")
MON = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
REVIEW = {"AAN": "Approved as noted", "APP": "Approved", "NAP": "Not approved", "FIO": "For information only"}

def find(key, ext):
    m = [f for f in glob.glob(os.path.join(SRC, "*" + ext)) if key in os.path.basename(f)]
    return m[0] if m else None
def iso(d): return d.isoformat() if d else ""
def dmy(s):   # 10-Sept-24, 13/05/24, 11/08/2025
    m = re.match(r"(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{2})$", s)
    if m: return datetime.date(2000 + int(m[3]), MON[m[2].upper()], int(m[1]))
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})$", s)
    if m: return datetime.date(int(m[3]) + (2000 if len(m[3]) == 2 else 0), int(m[2]), int(m[1]))

def cover(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[next(s for s in wb.sheetnames if "cover" in s.lower())]
    hist, title = [], ""
    for r in ws.iter_rows(values_only=True):
        v = [x for x in r if x not in (None, "")]
        if len(v) >= 3 and isinstance(v[0], datetime.datetime): hist.append((v[0].date(), str(v[1]), str(v[2])))
        elif len(v) == 1 and isinstance(v[0], str) and v[0].isupper() and len(v[0]) > 8 and not title and "PROJECT" not in v[0] and not v[0].startswith("2000-"): title = v[0]
    return hist, title

def mel(path):
    import openpyxl
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True)["MEL"]
    for r in ws.iter_rows(max_row=4, values_only=True):
        for x in r:
            m = re.search(r"Rev\s*(\w+),\s*([^,]+),\s*(\d{1,2}/\d{1,2}/\d{4})", str(x or ""))
            if m: return [(dmy(m[3]), m[1], m[2].strip())], "MECHANICAL EQUIPMENT LIST"
    return [], ""

def drawing(path):
    import pymupdf
    rows, sheets = Counter(), set()
    for p in pymupdf.open(path):
        t = p.get_text().replace("\n", "|")
        sheets.update(re.findall(r"2000-F00-PFD-PR-\d{5}", t)[-1:])
        for rev, d, mo, y, st in set(re.findall(r"\|\s*([0-9A-Z])\|\s*(\d{2})([A-Z]{3})(\d{2})\s*\|?\s*([A-Z0-9 ]+?)\|", t)):
            rows[(rev, datetime.date(2000 + int(y), MON[mo], int(d)), st.strip())] += 1
    best = {}
    for (rev, d, st), n in rows.items():   # one date per revision: the one most sheets carry (ignores title block typos)
        if rev not in best or n > best[rev][0]: best[rev] = (n, d, st)
    return [(d, rev, st) for rev, (n, d, st) in best.items()], "PROCESS FLOW DIAGRAMS", sorted(sheets)

def report(path):
    import pymupdf
    t = pymupdf.open(path)[0].get_text().replace("\n", "|")
    t = re.sub(r"\s*\|\s*", "|", t)
    hist = [(dmy(d), r, (st + " " + more if st.endswith(" and") else st).strip())   # a status can wrap onto a second line
            for d, r, st, more in re.findall(r"\|(\d{1,2}-[A-Za-z]{3,4}-\d{2})\|(\w{1,2})\|([^|]+)\|([^|]*)", t)]
    stamp = re.search(r"\|(\d{1,2}/\d{1,2}/\d{2,4})\|", t)
    return hist, "", iso(dmy(stamp[1])) if stamp else ""

DOCS = [  # key, document number, file key, kind, what the app uses it for
    ("mel", "2000-F00-LST-ME-10001", "MEL_2000-F00-LST-ME-10001", "List", "Equipment search, equipment tags and data on the Smart PFD"),
    ("ins", "2000-F00-LST-IC-11011", "2000-F00-LST-IC-11011", "List", "Instrument search, control loop tags on the Smart PFD"),
    ("cv", "2000-F00-LST-PP-10003", "2000-F00-LST-PP-10003", "List", "Control valve search, final elements of the control loops"),
    ("line", "2000-F00-LST-PP-10001", "2000-F00-LST-PP-10001", "List", "Pipe line search (size, spec, from and to)"),
    ("mv", "2000-F00-LST-PP-10002", "2000-F00-LST-PP-10002", "List", "Manual valve search"),
    ("spi", "2000-F00-LST-PP-10005", "2000-F00-LST-PP-10005", "List", "Pipe special (SPI) search"),
    ("hose1", "2000-F00-LST-PP-10032", "2000-F00-LST-PP-10032", "List", "Slurry hose search (Stage 1)"),
    ("hose2", "2000-F00-LST-PP-12032", "2000-F00-LST-PP-12032", "List", "Slurry hose search (Stage 2)"),
    ("pdc", "2000-F00-DCR-PR-10002", "2000-F00-DCR-PR-10002", "Report", "Design figures, flow cases and stream tonnages on the Smart PFD, flashcards"),
    ("cp1", "2000-F00-REP-PR-10001", "2000-F00-REP-PR-10001", "Report", "Stage 1 control loops and interlocks, flashcards"),
    ("cp2", "2000-F00-REP-PR-10002", "2000-F00-REP-PR-10002", "Report", "Stage 2 control loops and interlocks, flashcards"),
    ("pfd", "2000-F00-PFD-PR-10001 to 10050", "PFDs_combined", "Drawing", "Process routing and equipment layout of the Smart PFD"),
    ("num", "2000-F00-STS-GE-10003", "2000-F00-STS-GE-10003", "Specification", "How tags are built (area, equipment code, number), search and glossary"),
    ("layout", "2000-F00-DRG-GE-20001", "2000-F00-DRG-GE-20001", "Drawing", "Area numbers and names (F10 to F75), frame titles on the Smart PFD"),
    ("wbs", "", "KCGM_Growth_WBS", "Reference", "Area and facility codes (WBS), glossary"),
]
TITLES = {"pdc": "PROCESS DESIGN CRITERIA STAGE 2", "cp1": "PLANT GENERAL PROCESS CONTROL PHILOSOPHY STAGE 1", "cp2": "PLANT GENERAL PROCESS CONTROL PHILOSOPHY STAGE 2",
          "num": "PLANT NUMBERING SPECIFICATION", "pfd": "PROCESS FLOW DIAGRAMS STAGE 1", "line": "LINE LIST", "mv": "MANUAL VALVE LIST", "spi": "SPECIAL PIPING ITEMS (SPI) LIST", "cv": "CONTROL VALVE LIST", "ins": "INSTRUMENT LIST",
          "hose1": "SLURRY HOSE LIST STAGE 1", "hose2": "SLURRY HOSE LIST STAGE 2", "layout": "OVERALL PLANT LAYOUT PLAN", "wbs": "KCGM GROWTH WORK BREAKDOWN STRUCTURE"}
SHORT = {"mel": "MEL", "ins": "Instrument List", "cv": "Control Valve List", "line": "Line List", "mv": "Manual Valve List", "spi": "SPI List",
         "hose1": "Slurry Hose List Stage 1", "hose2": "Slurry Hose List Stage 2", "pdc": "PDC", "cp1": "Control Philosophy Stage 1",
         "cp2": "Control Philosophy Stage 2", "pfd": "Stage 1 PFDs", "num": "Plant Numbering Specification", "layout": "Overall Plant Layout", "wbs": "WBS"}
NOTES = {"line": "The Line List data sheet header reads Revision 2 but is undated; the cover page's latest dated revision is Rev 1.",
         "pfd": "One sheet (10019) has 04SEP24 in its title block, taken as a typing error for 04SEP26 like every other sheet.",
         "mel": "No cover page; revision and date from the header line of the MEL sheet.",
         "layout": "The title block revision rows are not readable as text; the drawing is dated Oct 2023 as drawn.",
         "wbs": "A reference chart with no revision block."}
out = {}
for key, num, fkey, kind, used in DOCS:
    f = find(fkey, ".xlsx") or find(fkey, ".pdf")
    if not f: print("not found:", key); continue
    ext, hist, title, extra = os.path.splitext(f)[1], [], "", {}
    if key == "mel": hist, title = mel(f)
    elif ext == ".xlsx": hist, title = cover(f)
    elif key == "pfd": hist, title, extra["sheets"] = drawing(f)
    elif kind in ("Report", "Specification"): hist, title, extra["review_date"] = report(f)
    hist = sorted((h for h in hist if h[0]), key=lambda h: (h[0], h[1]))
    fm = re.search(r"_(\w{1,2})_(AAN|APP|NAP|FIO)\b", os.path.basename(f))
    if fm: extra["review"] = REVIEW[fm[2]]
    fr = re.search(re.escape(num) + r"_(\w{1,2})_", os.path.basename(f))
    if not hist and fr: hist = [(None, fr[1], "Revision from the file name; no readable revision date")]
    if not hist: hist = [(None, "", "No revision block")]
    last = hist[-1] if hist else (None, "", "")
    out[key] = dict(title=SHORT[key], full=re.sub(r"\b(Mel|Pfd|Spi|Wbs|Kcgm)\b", lambda m: m[0].upper(), (TITLES.get(key) or title or SHORT[key]).title()),
                    number=num or "(no number)", kind=kind, rev=last[1], date=iso(last[0]), status=last[2], used=used,
                    history=[{"rev": r, "date": iso(d), "status": s} for d, r, s in hist if d], note=NOTES.get(key, ""), **extra)
    if key == "pfd": out[key]["number"] = "2000-F00-PFD-PR series"
    print(f"{SHORT[key]:28} {out[key]['number']:24} Rev {last[1]:3} {iso(last[0]):10} {last[2][:30]:30} {extra.get('review', '')} {len(hist)} revs  {out[key]['full']}")
json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
