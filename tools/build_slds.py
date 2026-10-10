"""Single line diagrams and communications block diagrams (the SLD and BLK-IC PDFs in inbox/electrical) into the app as drawings, beside the P&IDs and PFDs.

  python3 tools/build_slds.py      then tools/build_pics.py, tools/build_pid_refs.py and tools/build_offline.py

Each SLD is saved as SLDs/<number>.pdf with the same clean up as the P&IDs (tools/build_pids.py: sign off names and
signatures blacked out, review stamps removed, markups baked in, file properties cleared) and added to PIDs/index.json
(other drawings there are kept). The title is the title block's "... SINGLE LINE DIAGRAM SHEET n" text; the revision
comes from the file name, its date from the revision table. The Borefield (N02) SLDs are left out for now.
"""
import glob, json, os, re, sys, datetime
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# the raw inputs (the register, inbox/) live in the private repository, cloned beside this one (or KCGM_PRIVATE)
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
src = sorted(f for f in glob.glob(os.path.join(RP, "inbox", "electrical", "*-SLD-*.pdf")) + glob.glob(os.path.join(RP, "inbox", "electrical", "*-BLK-IC-*.pdf")) if "-N02-" not in f)   # (and the communications block diagrams, same drafting)
# build_pids.py's title block and redaction helpers (its main loop isn't run)
code = open(os.path.join(R, "tools", "build_pids.py")).read()
argv0 = sys.argv; sys.argv = [argv0[0], src[0]]; g = {"__file__": os.path.join(R, "tools", "build_pids.py")}
exec(compile(code[:code.index("def split(")], "build_pids.py", "exec"), g); sys.argv = argv0
lines, redact = g["lines"], g["redact"]
def title_of(p):
    W = p.rect.width
    for b in p.get_text("blocks"):
        if b[0] > W * 0.6 and re.search(r"SINGLE\s+LINE\s+DIAGRAM", b[4], re.I):
            t = re.sub(r"\s+", " ", b[4]).strip()
            t = re.sub(r"\bSINGLE\s+LINE\s+DIAGRAM\b", "single line diagram", t, flags=re.I)
            return t[:1] + t[1:].lower().replace("kv", "kV") if t.isupper() else t
    return "Single line diagram"
def tagcase(t):   # tags and kV back to their own case after lowering the title
    t = re.sub(r"\b([ft]\d{2,3})-([a-z]{2,4})-(\d{3,4}[a-z]?)\b", lambda m: "-".join(x.upper() for x in m.groups()), t)
    return re.sub(r"(\d)\s*v\b", r"\1V", t)
def rdate(d):
    ds = []
    for p in d:
        for dd, mm, yy in re.findall(r"\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b", p.get_text()):
            try: ds.append(datetime.date(int(yy), int(mm), int(dd)))
            except ValueError: pass
    return max(ds).isoformat() if ds else ""
# titles from the project document register (sources/register/), else the title block
REG = {}
try:
    import openpyxl
    rf = max(glob.glob(os.path.join(RP, "sources", "register", "*.xls[xm]")), key=os.path.getmtime)
    for r in openpyxl.load_workbook(rf, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True):
        if r[3] and r[6]: REG.setdefault(str(r[3]).strip().upper(), str(r[6]).strip())
except (ValueError, OSError): pass
def nice(t):
    t = re.sub(r"\s+", " ", t).strip()
    if t.isupper(): t = t[:1] + t[1:].lower()
    t = re.sub(r"\b(\d{2})-([a-z]{2})-(\d{2,3})\b", lambda m: m.group(0).upper(), t)
    for a, b in ((r"\bsag\b", "SAG"), (r"\bcil ?(\d)", r"CIL\1"), (r"\bcct\b", "CCT"), (r"\bmt charlotte\b", "Mt Charlotte"), (r"\bfimiston\b", "Fimiston"), (r"\bufg\b", "UFG"), (r"\bfim\b", "FIM"), (r"\btsf\b", "TSF"), (r"\biii\b", "III"), (r"\bii\b", "II"), (r"\bsht\b", "sheet")):
        t = re.sub(a, b, t, flags=re.I)
    return tagcase(t).replace("kv ", "kV ").replace(" mcc", " MCC").replace("ups", "UPS").replace("hv ", "HV ").replace("lv ", "LV ").replace(" vsd", " VSD")
NAME = re.compile(r"\b[A-Z]\.\s?[A-Z][a-z]{2,}\b")   # initial and surname (review stamp signatories)
def unname(p):
    n = 0
    for w in p.get_text("words"):
        if NAME.fullmatch(w[4]) or (re.fullmatch(r"[A-Z]\.", w[4]) and False):
            p.add_redact_annot(pymupdf.Rect(w[:4]), fill=(0, 0, 0)); n += 1
    if n: p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)
    return n
os.makedirs(os.path.join(R, "SLDs"), exist_ok=True)
ix_path = os.path.join(R, "PIDs", "index.json"); ix = json.load(open(ix_path))
for k in [k for k in ix["pids"] if "-SLD-" in k]: del ix["pids"][k]
marks = 0
for f in src:
    m = re.match(r"(2000-[A-Z0-9]+-(?:SLD-EL|BLK-IC)-\d+)_([A-Z0-9]+)", os.path.basename(f)); num, rev = m.group(1), m.group(2)
    d = pymupdf.open(f); d.bake()
    for p in d: p.remove_rotation()
    tb = title_of(d[0]); title, date = nice(REG.get(num) or (tb if tb != "Single line diagram" else "Single line diagram")), rdate(d)
    for p in d: marks += redact(p, lines(p)) + unname(p)
    d.set_metadata({"title": num, "author": "", "subject": "Growth Project SLD", "keywords": "", "creator": "", "producer": ""}); d.del_xml_metadata()
    rel = f"SLDs/{num}.pdf"; d.save(os.path.join(R, rel), garbage=4, deflate=True, clean=True)
    ix["pids"][num] = {"file": rel, "title": title, "rev": rev, "date": date, "status": "", "pages": d.page_count, "size": os.path.getsize(os.path.join(R, rel)), "from": [os.path.basename(f)]}
json.dump(ix, open(ix_path, "w"), indent=1)
print(len(src), "SLDs,", marks, "names blacked out")
