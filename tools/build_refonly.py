"""Ref Only: the document numbers the library's drawings, lists and inbox files mention that it doesn't hold
(refonly.json, shown in Sources > Ref Only on desktop and in its Excel download).

  python3 tools/build_refonly.py ["<Project Document Register .xlsm/.xlsx>"]

With no file named it uses the newest register in sources/register/ (drop a newer export there to refresh).

Titles, revs, statuses and SharePoint links come from the project document register (the register wins over a title
printed on a drawing). Every IOM manual is listed too, mentioned or not (tools/build_iom.py). 3D models (-MDL-) and anything already in the
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
WD = set(json.load(open(R + '/tools/withdrawn.json'))['pids'])
out = []
for n, c in ment.items():
    if n in held or n in inbox or n in WD or '-MDL-' in n: continue   # (WD: drawings cancelled or superseded, tools/withdrawn.json)
    r = REG.get(n)
    out.append({'n': n, 'g': grp(n), 't': (r[6] if r else '') or printed.get(n, ''), 'ts': 'reg' if r and r[6] else 'drw' if n in printed else '', 'rev': r[4] if r else '', 'st': r[5] if r else '', 'url': r[1] if r else '', 'in': dict(c), 'x': len(c), 'xr': sum(c.values()), 'inbox': n in inbox})
# every IOM manual (iom.json, tools/build_iom.py) is listed, mentioned or not ("iom" marks them, "in" empty = no mention)
IOMD = json.load(open(R + '/iom.json'))['d'] if os.path.exists(R + '/iom.json') else {}
byn = {o['n']: o for o in out}
for n, (t, rev, kind, url) in IOMD.items():
    if n in held or n in inbox: continue
    if n in byn: byn[n]['iom'] = 1; continue
    r = REG.get(n)
    out.append({'n': n, 'g': grp(n), 't': t, 'ts': 'reg', 'rev': rev, 'st': r[5] if r else '', 'url': url, 'in': {}, 'x': 0, 'xr': 0, 'inbox': False, 'iom': 1})
# every project Process Control Table (2000-Fxx-LST-PR-…, register title "PROCESS CONTROL TABLES …") the app doesn't hold
# is listed too, mentioned or not ("pct" marks them), so they can be downloaded and dropped back for tools/build_pct.py
# (the vendors' control tables, 2000-AA001-…, are left out)
for n, r in REG.items():
    if not re.fullmatch(r'2000-F\d{2}-LST-PR-\d{5}', n) or not str(r[6] or '').upper().startswith('PROCESS CONTROL TABLES') or n in held or n in inbox: continue
    if n in byn: byn[n]['pct'] = 1; continue
    o = {'n': n, 'g': grp(n), 't': r[6], 'ts': 'reg', 'rev': r[4], 'st': r[5], 'url': r[1], 'in': {}, 'x': 0, 'xr': 0, 'inbox': False, 'pct': 1}
    out.append(o); byn[n] = o
out.sort(key=lambda o: (-o['x'], -o['xr']))
hd = {}
for n in sorted(held):
    r = REG.get(n); c = ment.get(n, {})
    hd[n] = {'g': grp(n), 'rev': r[4] if r else '', 'st': r[5] if r else '', 'url': r[1] if r else '', 'rt': r[6] if r else '', 'in': dict(c), 'x': len(c), 'xr': sum(c.values())}
# the latest revision on SharePoint (tools/doclist.py, from an export of the library's file list) wins over the register
# (a markup set the register files on its own, 2000-F13-PID-PR-10002_MS, is the drawing the app holds once the app has
# that issue: not Ref Only)
def msheld(n):   # (the app's rev, or its source file name, is that MS issue)
    v = P.get(n[:-3], {}); f = ' '.join(v.get('src') or v.get('from') or []).upper()
    return str(v.get('rev', '')).upper().startswith('MS') or (n[:-3] + '_MS').upper() in f
out = [o for o in out if not (o['n'].upper().endswith('_MS') and msheld(o['n'].upper()))]
# for the link and the revision; documents in the app whose revision is older than SharePoint's go in "old" (Old Revs)
import sys; sys.path.insert(0, os.path.join(R, 'tools')); import doclist; from doclist import latest, revkey
DL = latest(); nkk = lambda s: re.sub(r'[^A-Z0-9]', '', str(s or '').upper())
for o in out:
    d = DL.get(nkk(o['n']))
    if d:
        if d['rev'] != o['rev']: o['st'] = d['st']
        o['url'], o['rev'] = d['url'], d['rev']
appRev = {k: v.get('rev', '') for k, v in P.items()}; appRev.update({v['number']: v.get('rev', '') for v in meta.values() if v.get('number')})
# (the pipe spec: its revision is the spec viewer's, spec/index.json)
try: _sm = json.load(open(R + '/spec/index.json'))['meta']; appRev[_sm['doc']] = _sm.get('rev', '')
except Exception: pass
appT = {k: v.get('title', '') for k, v in P.items()}; appT.update({v['number']: v.get('full') or v.get('title', '') for v in meta.values() if v.get('number')})
# Old Revs: the documents in the app behind the project document register's current revision (tools/reglatest.py: the
# register decides, an as-built set _MS counting as its drawing's latest issue, a redline markup the app holds as the issue
# it marks up). Also listed: one the register says another number replaced or cancelled, and one whose revision the app
# never recorded (the first combined P&ID set) where the register has an issue on SharePoint. Not in the register: the
# library's file list decides, as before.
from reglatest import current as regcur, base as rbase
from urllib.parse import unquote
RC = regcur()
def apprev(n):
    a = str(appRev.get(n, '')).strip().upper()
    if a: return a
    for f in (P.get(n, {}).get('from') or P.get(n, {}).get('src') or []):
        m = re.match(re.escape(n) + r'_((?:MS[-_A-Z0-9]*?_)?[0-9A-Z]{1,3})(?:_[A-Z]{3})?\.pdf$', f, re.I)
        if m: return m.group(1).upper()
    return ''
old = []
for n, h in hd.items():
    if P.get(n, {}).get('sp'): continue   # (an electrical drawing: its link opens SharePoint's latest, nothing to up rev)
    c = RC.get(nkk(n)); a = apprev(n)
    if c:
        if c['url']: h['url'] = c['url']
        h['srev'] = c['rev']
        lg = P.get(n, {}).get('legacy')   # (the older drawing the app holds, renumbered later: behind any 2000 issue)
        why = ('superseded by ' + c['by']) if c['by'] else 'cancelled' if c['can'] else 'legacy drawing in app' if lg else '' if not a else 'up rev' if revkey(rbase(c['rev'])) > revkey(rbase(a)) else ''
        if not why and not a and c['url']: why = 'rev unknown in app'
        if not why: continue
        u = c['url'] or c.get('alt', ''); f = unquote(u.rsplit('/', 1)[-1]) if u else ''
        # (the register has a newer issue, but SharePoint's newest file is the one the app holds: nothing to fetch yet)
        if why == 'up rev' and not c['url'] and a and rbase(str(c.get('altrev', ''))).upper() == rbase(a): why = 'not on SharePoint yet'
        if not c['url'] and u: f = f'{f} (rev {c["rev"]} not on SharePoint yet)'
        old.append({'n': n, 'g': h['g'], 't': appT.get(n, '') or c['title'], 'app': a or (('legacy ' + lg) if lg else '?'), 'rev': c['rev'], 'st': c['st'], 'url': u, 'file': f, 'mod': '', 'why': why, 'by': c['by'],
                    'have': (P.get(n, {}).get('from') or P.get(n, {}).get('src') or [''])[0]})
        continue
    d = DL.get(nkk(n))
    if not d: continue
    h['url'] = d['url']; h['srev'] = d['rev']
    src = [f.lower() for f in (P.get(n, {}).get('from') or P.get(n, {}).get('src') or [])]
    if a and not any(f in doclist.FILES for f in src):
        pre = (n + '_' + a).lower(); src = [f for f in doclist.FILES if f.startswith(pre + '.') or f.startswith(pre + '_')]
    sm = [doclist.FILES[f] for f in src if f in doclist.FILES]
    bad = any(re.search(r'_(ssd|can)(_|\.)', f) for f in src)
    newer = (d['file'].lower() not in src and (bad or d['mod'] > max(sm) or revkey(d['rev'])[0] == 3 > revkey(a)[0])) if sm else bool(a) and revkey(d['rev']) > revkey(a)
    if newer: old.append({'n': n, 'g': h['g'], 't': appT.get(n, '') or h.get('rt', ''), 'app': a, 'rev': d['rev'], 'st': d['st'], 'url': d['url'], 'file': d['file'], 'mod': d['mod'][:10], 'why': 'up rev', 'have': (P.get(n, {}).get('from') or P.get(n, {}).get('src') or [''])[0]})
# P&IDs a drawing in the app continues onto that the app doesn't hold, but the register does: listed with the Old Revs
# too, so one list holds everything to fetch from SharePoint and upload (the upload adds them, tools/swap_revs.py)
for o in out:
    c = RC.get(nkk(o['n']))
    if '-PID-' in o['n'] and c and not c['can'] and not c['by'] and any('-PID-' in m for m in (o.get('in') or {})):
        u = c['url'] or c.get('alt', ''); f = unquote(u.rsplit('/', 1)[-1]) if u else ''
        old.append({'n': o['n'], 'g': o.get('g', 'project'), 't': c['title'], 'app': '—', 'rev': c['rev'], 'st': c['st'], 'url': u, 'file': f, 'mod': '', 'why': 'continuation, not in app', 'by': '', 'have': '',
                    'on': sorted(m for m in o['in'] if '-PID-' in m)[:4]})
# revs.json: every drawing and document the app holds, its revision here against the register's current one, for the
# drawing's Details pill and its header (lookup.js, viz.js): {number: [rev in app, legacy drawing, register rev, register
# status, SharePoint link of the current issue, why it's in Old Revs ("" when current)]}
OLDW = {o['n']: o.get('why', '') for o in old}
RV = {}
for n in hd:
    c = RC.get(nkk(n)); a = apprev(n); lg = P.get(n, {}).get('legacy', '')
    RV[n] = [a, lg, c['rev'] if c else '', c['st'] if c else '', (c['url'] or c.get('alt', '')) if c else hd[n].get('url', ''), OLDW.get(n, '')]
json.dump(RV, open(R + '/revs.json', 'w'), ensure_ascii=False, separators=(',', ':'))
# (Ref Only too: the register's current issue and its link where it has one)
for o in out:
    c = RC.get(nkk(o['n']))
    if c and c['url']: o['url'], o['rev'], o['st'] = c['url'], c['rev'], c['st']
old.sort(key=lambda o: o['n'])
print('Old revs', len(old), 'SharePoint links from the file list:', sum(1 for o in out if DL.get(nkk(o['n']))), 'of', len(out))
json.dump({'ref': out, 'held': hd, 'old': old}, open(R + '/refonly.json', 'w'), separators=(',', ':'))
c = collections.Counter(o['g'] for o in out); print('Ref Only', len(out), c, sum(o['inbox'] for o in out), sum(1 for o in out if o['ts']=='reg'), sum(1 for o in out if o['ts']=='drw'), sum(1 for o in out if not o['t']))
