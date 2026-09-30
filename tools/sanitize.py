"""Takes project, client and company names out of the app's data, so only technical content is left.

Usage: python3 tools/sanitize.py            (run after any tools/build_*.py, which read the original documents)
Company names become roles (Owner, EPC, Engineer, Consultant), the project number goes, the site name Fimiston
becomes FIM and the old offsite roaster site is called that. Equipment makers (Weir, Metso…) stay: they are technical.
Also used by tools/redact_docs.py for the text written onto the PDFs.
"""
import glob, os, re, zipfile

ROOT = os.path.join(os.path.dirname(__file__), "..")
RULES = [
    (r"Kalgoorlie Consolidated Gold Mines(?: Pty\.? Ltd\.?)?", "Owner"), (r"KALGOORLIE CONSOLIDATED GOLD MINES(?: PTY\.? LTD\.?)?", "OWNER"),
    (r"Northern Star Resources(?: Ltd\.?| Limited)?", "Owner"), (r"NORTHERN STAR RESOURCES(?: LTD\.?| LIMITED)?", "OWNER"),
    (r"Northern Star(?: \(Primeo\))?", "Owner"), (r"NORTHERN STAR", "OWNER"), (r"\bNSR\b", "Owner"), (r"_NSR\b", "_Owner"),
    (r"KCGM[ _-]*(?=Growth|GROWTH)", ""), (r"\bKCGM\b ?- ?", ""), (r"\bKCGM\b", "Owner"),
    (r"Primero(?: Group)?", "EPC"), (r"PRIMERO(?: GROUP)?", "EPC"), (r"\bPrimeo\b", "EPC"),
    (r"\bMinproc(?: Engineers(?: Limited)?)?\b", "Engineer"), (r"\bMINPROC(?: ENGINEERS(?: LIMITED)?)?\b", "ENGINEER"),
    (r"\bWorley\b", "Engineer"), (r"\bDRA\b", "Engineer"), (r"\bOMC\b", "Consultant"),
    (r"(?<=[\[,])23517(?=[,\]])", '""'), (r"\b23517[ _-]?", ""),   # (a bare number in the JSON tables becomes an empty string)
    (r"Fimiston", "FIM"), (r"FIMISTON", "FIM"),
    (r"\b(to|at|from|in) Gidji\b", r"\1 the offsite roaster"), (r"\bGidji\b", "offsite roaster"), (r"\bGIDJI\b", "OFFSITE ROASTER"),
    (r",? (?:in )?Kalgoorlie(?: WA)?\b", ""), (r"\bKALGOORLIE\b", ""),
]
RX = [(re.compile(a), b) for a, b in RULES]
def clean(s):
    for r, b in RX: s = r.sub(b, s)
    return s

TEXT = ["search-data.json", "issues.json", "browse.json", "PIDs/index.json", "pfd-data.js", "pfd-equip.js", "pfd-streams.js", "pfd-layout-data.js",
        "cards.js", "facts.js", "glossary.js", "sources/index.json"] + glob.glob("sources/*/*.json")
if __name__ == "__main__":
    n = 0
    for f in TEXT:
        p = os.path.join(ROOT, f); s = open(p, encoding="utf8").read(); t = clean(s)
        if t != s: open(p, "w", encoding="utf8").write(t); n += 1
    for p in glob.glob(os.path.join(ROOT, "sources", "*.xlsx")):
        z = zipfile.ZipFile(p); parts = {i.filename: z.read(i.filename) for i in z.infolist()}; z.close(); ch = False
        for k, v in parts.items():
            if k.endswith(".xml"):
                # only the cell text, never the sheet markup (row and cell numbers)
                t = re.sub(r">([^<]+)<", lambda m: ">" + clean(m.group(1)) + "<", v.decode("utf8")).encode("utf8")
                if t != v: parts[k] = t; ch = True
        if ch:
            with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as o:
                for k, v in parts.items(): o.writestr(k, v)
            n += 1
    print(n, "files cleaned")
