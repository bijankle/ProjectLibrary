"""Ref Only: the document numbers the library's drawings, lists and inbox files mention that it doesn't hold
(refonly.json, shown in Sources > Ref Only on desktop and in its Excel download).

  python3 tools/build_refonly.py ["<Project Document Register .xlsm/.xlsx>"]

With no file named it uses the newest register in sources/register/ (drop a newer export there to refresh).

Titles, revs, statuses and SharePoint links come from the project document register (the register wins over a title
printed on a drawing). 3D models (-MDL-) and anything already in the
library or waiting in inbox/ are left out. "x" counts the documents that mention a number, "xr" every mention.
"""
import json, re, glob, os, collections, sys
import pymupdf, openpyxl
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# the raw inputs (the register, inbox/) live in the private repository, cloned beside this one (or KCGM_PRIVATE)
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
REGF = sys.argv[1] if len(sys.argv) > 1 else max(glob.glob(os.path.join(RP, 'sources', 'register', '*.xls[xm]')), key=os.path.getmtime)
wb0 = openpyxl.load_workbook(REGF, read_only=True, data_only=True)
reg = [["" if c is None else str(c) for c in r] for r in list(wb0.worksheets[0].iter_rows(values_only=True))[1:]]
norm = lambda n: re.sub(r'[\\/]', '-', n.strip().upper())
REG = {}
for r in reg:
    n = norm(r[3]);
    if n: REG.setdefault(n, r)
P2000 = re.compile(r'\b2000-[A-Z]\d{2,3}-[A-Z]{3}-[A-Z]{2}-\d{5}\b')
TOK = re.compile(r'[A-Z0-9][A-Z0-9.\\/_-]{6,}[A-Z0-9]')
# what is held
P = json.load(open(R + '/PIDs/index.json'))['pids']; meta = json.load(open(R + '/issues.json'))['meta']['docs']
held = set(P) | {v['number'] for v in meta.values()} | {'2000-F00-STS-PP-10001'}
base = lambda f: re.match(r'(.*?)(_[^_]*)*$', os.path.basename(f)[:-4]).group(1)
inbox = {re.split(r'_', os.path.basename(f))[0] for f in glob.glob(RP + '/inbox/**/*.pdf', recursive=True) + glob.glob(R + '/*.pdf')}
ment = collections.defaultdict(collections.Counter); printed = {}
def scan(src, text, pdf=True):
    LS = text.split('\n')
    for i, line in enumerate(LS):
        L = line.upper()
        found = set(P2000.findall(L)) | {norm(t) for t in TOK.findall(L) if norm(t) in REG}
        for n in found:
            if n == src: continue
            ment[n][src] += 1
            rest = L.split(n.split('-')[-1], 1)[-1].strip(' -:')
            if pdf and len(rest) < 4 and i + 1 < len(LS) and not TOK.search(LS[i + 1].upper()): rest = LS[i + 1].upper().strip()
            if pdf and len(re.sub(r'[^A-Z]', '', rest)) >= 8 and n not in printed: printed[n] = rest[:120]
pdfs = [(k, R + '/' + v['file']) for k, v in P.items()] + [(base(f), f) for f in glob.glob(RP + '/inbox/**/*.pdf', recursive=True) + glob.glob(R + '/*.pdf')] + [('2000-F00-STS-PP-10001', R + '/spec/pvs.pdf')]
for k, f in pdfs:
    try:
        d = pymupdf.open(f); scan(re.split('_', k)[0], '\n'.join(p.get_text() for p in d))
    except Exception as e: print('skip', f, e)
for k, v in meta.items():
    x = R + f'/sources/{k}.xlsx'
    if not os.path.exists(x): continue
    wb = openpyxl.load_workbook(x, read_only=True, data_only=True)
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            scan(v['number'], '\n'.join(str(c) for c in row if c is not None), False)
def grp(n):
    if P2000.fullmatch(n): return 'project'
    if n.startswith('2000-'): return 'vendor'
    if n.startswith('23517-'): return 'contractor'
    if re.match(r'\d{2,3}-[A-Z]{1,2}-\d{3,4}', n): return 'legacy'
    return 'other'
out = []
for n, c in ment.items():
    if n in held or n in inbox or '-MDL-' in n: continue
    r = REG.get(n)
    out.append({'n': n, 'g': grp(n), 't': (r[6] if r else '') or printed.get(n, ''), 'ts': 'reg' if r and r[6] else 'drw' if n in printed else '', 'rev': r[4] if r else '', 'st': r[5] if r else '', 'url': r[1] if r else '', 'in': dict(c), 'x': len(c), 'xr': sum(c.values()), 'inbox': n in inbox})
out.sort(key=lambda o: (-o['x'], -o['xr']))
hd = {}
for n in sorted(held):
    r = REG.get(n); c = ment.get(n, {})
    hd[n] = {'g': grp(n), 'rev': r[4] if r else '', 'st': r[5] if r else '', 'url': r[1] if r else '', 'rt': r[6] if r else '', 'in': dict(c), 'x': len(c), 'xr': sum(c.values())}
# the latest revision on SharePoint (tools/doclist.py, from an export of the library's file list) wins over the register
# for the link and the revision; documents in the app whose revision is older than SharePoint's go in "old" (Old Revs)
import sys; sys.path.insert(0, os.path.join(R, 'tools')); import doclist; from doclist import latest, revkey
DL = latest(); nkk = lambda s: re.sub(r'[^A-Z0-9]', '', str(s or '').upper())
for o in out:
    d = DL.get(nkk(o['n']))
    if d:
        if d['rev'] != o['rev']: o['st'] = d['st']
        o['url'], o['rev'] = d['url'], d['rev']
appRev = {k: v.get('rev', '') for k, v in P.items()}; appRev.update({v['number']: v.get('rev', '') for v in meta.values() if v.get('number')})
appT = {k: v.get('title', '') for k, v in P.items()}; appT.update({v['number']: v.get('full') or v.get('title', '') for v in meta.values() if v.get('number')})
old = []
for n, h in hd.items():
    d = DL.get(nkk(n))
    if not d: continue
    h['url'] = d['url']; h['srev'] = d['rev']
    a = str(appRev.get(n, '')).strip()
    # newer: the app's own source file is on SharePoint with an older date than the latest file; else (a list, or a
    # renamed file) the latest revision is higher than the app's
    src = [f.lower() for f in (P.get(n, {}).get('from') or [])]
    if a and not any(f in doclist.FILES for f in src):   # (no source file name kept: the files of the app's revision)
        pre = (n + '_' + a).lower(); src = [f for f in doclist.FILES if f.startswith(pre + '.') or f.startswith(pre + '_')]
    sm = [doclist.FILES[f] for f in src if f in doclist.FILES]
    newer = (d['file'].lower() not in src and d['mod'] > max(sm)) if sm else bool(a) and revkey(d['rev']) > revkey(a)
    if newer: old.append({'n': n, 'g': h['g'], 't': appT.get(n, '') or h.get('rt', ''), 'app': a, 'rev': d['rev'], 'st': d['st'], 'url': d['url'], 'file': d['file'], 'mod': d['mod'][:10], 'have': (P.get(n, {}).get('from') or [''])[0]})
old.sort(key=lambda o: o['n'])
print('Old revs', len(old), 'SharePoint links from the file list:', sum(1 for o in out if DL.get(nkk(o['n']))), 'of', len(out))
json.dump({'ref': out, 'held': hd, 'old': old}, open(R + '/refonly.json', 'w'), separators=(',', ':'))
c = collections.Counter(o['g'] for o in out); print('Ref Only', len(out), c, sum(o['inbox'] for o in out), sum(1 for o in out if o['ts']=='reg'), sum(1 for o in out if o['ts']=='drw'), sum(1 for o in out if not o['t']))
