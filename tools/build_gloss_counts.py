"""How often each glossary term comes up in the library's source documents, for the glossary's Mentions column.
Reads every list's tables (sources/<key>/*.json) and the text of every drawing PDF (PIDs/, PFDs/, SLDs/, spec/).
A term like "PV / SV / CV" or "0.6/1 kV, 1.9/3.3 kV" counts each of its forms. A form with lower case letters is
matched in any case, an all capitals one (an abbreviation) only in capitals, both as whole words; a suffix form such as
"-P" only straight after a tag. Writes glossary-counts.js: { term: [mentions, documents] }.
"""
import glob, json, os, re, subprocess
import pymupdf

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = json.loads(subprocess.run(["node", "-e", "eval(require('fs').readFileSync(process.argv[1],'utf8')+';process.stdout.write(JSON.stringify(GLOSSARY))')", os.path.join(R, "glossary.js")], capture_output=True, text=True, check=True).stdout)

def cells(x, out):
    if isinstance(x, str): out.append(x)
    elif isinstance(x, (int, float)): pass
    elif isinstance(x, dict): [cells(v, out) for v in x.values()]
    elif isinstance(x, list): [cells(v, out) for v in x]
docs = {}
for d in sorted(glob.glob(os.path.join(R, "sources", "*", ""))):
    out = []
    for f in sorted(glob.glob(d + "*.json")): cells(json.load(open(f)), out)
    if out: docs["list:" + os.path.basename(d.rstrip("/"))] = "\n".join(out)
for f in sorted(glob.glob(os.path.join(R, "PIDs", "*.pdf")) + glob.glob(os.path.join(R, "PFDs", "*.pdf")) + glob.glob(os.path.join(R, "SLDs", "*.pdf")) + glob.glob(os.path.join(R, "spec", "*.pdf"))):
    try:
        with pymupdf.open(f) as p: docs[os.path.relpath(f, R)] = "\n".join(pg.get_text() for pg in p)
    except Exception as e: print("skip", f, e)

def forms(term):
    # "Schematic (SCM)": the words and the code in brackets; "CV (document)": just CV
    inner = [m for m in re.findall(r"\(([^)]*)\)", term) if re.fullmatch(r"[A-Z0-9/ ]{2,}", m)]
    base = re.sub(r"\s*\([^)]*\)", "", term)
    return [x.strip() for x in re.split(r"\s+/\s+|,\s+", base) + inner if x.strip()]
def rx(f):
    e = re.escape(f).replace(r"\ ", r"\s*")   # (a space may be missing: 0.6/1kV)
    if f.startswith("-"): return re.compile(r"(?<=[A-Za-z0-9])" + e + r"(?![A-Za-z0-9])")
    return re.compile(r"(?<![A-Za-z0-9])" + e + r"(?![A-Za-z0-9])", 0 if f == f.upper() else re.I)

out = {}
for term, _m, _d in G:
    R1 = [rx(f) for f in forms(term)]; n = nd = 0
    for t in docs.values():
        c = sum(len(r.findall(t)) for r in R1); n += c; nd += c > 0
    out[term] = [n, nd]
open(os.path.join(R, "glossary-counts.js"), "w").write("// How often each glossary term comes up in the source documents (tools/build_gloss_counts.py): { term: [mentions, documents] }\nconst GLOSSARY_COUNT = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
top = sorted(out.items(), key=lambda x: -x[1][0])
print(len(docs), "documents;", sum(1 for v in out.values() if v[0]), "terms found;", top[:12], [k for k, v in out.items() if not v[0]][:20])
