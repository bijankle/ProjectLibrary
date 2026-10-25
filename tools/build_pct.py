"""Process Control Tables (PCT, one workbook per area: 2000-Fxx-LST-PR-1xxxx) into pct.json, shown on each asset's page
under "Control": ranges, switchpoints and alarm set points, valve and drive interlocks and permissives, PID controller
settings, calculations, the alarm database, and the tags each condition names (linked both ways).

  python3 tools/build_pct.py

Reads every workbook in the private repository's sources/pct/ (drop a newer revision there and run again; the newest
revision of each document wins). Rows are matched to the app's items by tag (FIT21002, F21-AG-411, XV21013A); a DCS tag
(FI21002, FIC-21002, FAL21321) goes to the field tag on the same row (Tag Source), else to the item with the same loop
number and first letter (a transmitter first).
"""
import json, re, glob, os, datetime, collections
import openpyxl
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import pct_pdf   # (a PCT issued as a PDF only)
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
norm = lambda s: re.sub(r'[\s\-_/.]+', '', str(s or '').upper())
SD = json.load(open(R + '/search-data.json'))
KEYS = {}   # app key -> list type
for t, rows in SD['data'].items():
    if isinstance(rows, list) and t != 'ctl':   # (ctl: this script's own control tags, rebuilt below)
        for r in rows:
            if r and isinstance(r, list): KEYS.setdefault(norm(r[0]), t)
byloop = collections.defaultdict(list)
for k in KEYS:
    m = re.fullmatch(r'([A-Z]{1,5})(\d{5})([A-Z]?)', k)
    if m: byloop[m.group(2) + m.group(3)].append(k)
SEC = {'1': 'Analogue input', '2': 'Analogue output', '3': 'Digital input', '4': 'Digital output', '5': 'Totaliser', '6': 'On/off valve',
       '7': 'Control valve', '8': 'PID controller', '9': 'Drive', '10': 'Sequence', '11': 'Calculation', '12': 'Misc', '13': 'Alarm'}
SKIP = re.compile(r"^(area|type|loop no\.?|suffix|rev|ok|date|c[12] .*|comments - .*|change date|change reference|change description|fat|information/event.*|#ref!|-|\d+|actuatio|tag source|tag name|p&id|seq no\.)$", re.I)
DUP = {'min', 'max', 'unit', 'open', 'close', 'a_ll', 'a_lo', 'a_hi', 'a_hh', 'process', 'critical'}
BAD = {'', '-', '#N/A', '#REF!', 'NONE', '#VALUE!', 'N/A', '#DIV/0!', '0'}

def val(c):
    if c is None: return ''
    if isinstance(c, datetime.datetime): return c.strftime('%Y-%m-%d')
    if isinstance(c, float): c = round(c, 6); return str(int(c)) if c == int(c) else str(c)
    s = re.sub(r'[ \t]+', ' ', str(c)).strip()
    return '' if s.upper() in BAD - {'0'} else s

def appkey(t, src=''):
    """the app item a PCT tag belongs to"""
    for x in (src, t):
        k = norm(x)
        if k and k in KEYS: return k
        k = norm(re.sub(r'_[A-Z0-9_]+$', '', str(x or '').upper()))   # (F13CY401A_RIV: a signal of F13-CY-401A)
        if k and k in KEYS: return k
    for x in (src, t):
        m = re.fullmatch(r'([A-Z]{1,5})(\d{5}[A-Z]?)(?:_[A-Z]+)?', norm(x))
        if not m: continue
        c = [k for k in byloop.get(m.group(2), []) if k[0] == m.group(1)[0]]
        if c: return sorted(c, key=lambda k: (not k.endswith('T' + m.group(2)), len(k)))[0]
    return None

# compact equipment numbers written in conditions (F72PP675) to the app's form (F72-PP-675) so the page links them
EQ = {norm(k): k for t in ('mel', 'elec') for k in [r[0] for r in SD['data'].get(t, []) if r]}
def tidy(s):
    return re.sub(r'\bF\d{2}[A-Z]{2,4}\d{3,4}[A-Z]?\b', lambda m: EQ.get(m.group(0), m.group(0)), s)
TAGIN = re.compile(r'\b(F\d{2}-[A-Z]{1,4}-\d{2,4}[A-Z]?|F\d{2}[A-Z]{2,4}\d{3,4}[A-Z]?|[A-Z]{1,5}-?\d{5}[A-Z]?)\b')

LV = {'LL': 'LL', 'LO': 'Lo', 'HI': 'Hi', 'HH': 'HH'}
def nice(x):
    """plain labels: Alarms A_Lo -> Alarm Lo, P_HH Delay ON (sec) -> Switchpoint HH delay on (s)"""
    x = re.sub(r'\s+', ' ', x).replace('(sec)', '(s)').replace('(secs)', '(s)')
    m = re.fullmatch(r'(?:(Alarms|Process Switchpoints|Alarm Priority) )?([AP])_(LL|Lo|Hi|HH)( .*)?', x, re.I)
    if m:
        w = 'Alarm' if m.group(2).upper() == 'A' else 'Switchpoint'
        rest = (m.group(4) or '').lower()
        return f"{w} {LV[m.group(3).upper()]}{' priority' if m.group(1) and m.group(1).lower() == 'alarm priority' else ''}{rest}"
    return {'Abbreviated Description (Faceplate)': 'Faceplate', 'Fail Position (Loss of Power)': 'Fail position', 'Alarm Masking Condition': 'Alarm masking',
            'Alarm Masking Conditions': 'Alarm masking', 'Range Unit': 'Range unit', 'Controller (Y/N)': 'Controller', 'Controlled/Manipulated Variable Unit': 'Output unit',
            'Manipulated Variable Range Min': 'Output range min', 'Manipulated Variable Range Max': 'Output range max', 'Lower Limit': 'Output lower limit',
            'Upper Limit': 'Output upper limit', 'Destination (Output) Tag': 'Output tag', 'Destination Description': 'Output to'}.get(x, 'Comments' if x.endswith(' Comments') else x)

docs = {}
for f in glob.glob(os.path.join(RP, 'sources', 'pct', '*.[xp][ld][sf]*')):
    m = re.match(r'(2000-F\d{2}-LST-PR-\d{5})_(\w+?)(?:_|\.)', os.path.basename(f))
    if m and (m.group(1) not in docs or m.group(2) > docs[m.group(1)][0]): docs[m.group(1)] = (m.group(2), f)
REC = []
for dn, (rev, f) in sorted(docs.items()):
    wb = pct_pdf.open(f) if f.lower().endswith('.pdf') else openpyxl.load_workbook(f, read_only=True, data_only=True)
    area = dn.split('-')[1]
    for ws in wb.worksheets:
        m = re.match(r'(\d+)\.', ws.title)
        if not m or 'broken' in ws.title.lower() or m.group(1) not in SEC: continue
        sec = SEC[m.group(1)]
        rows = [list(r) for r in ws.iter_rows(values_only=True, max_col=120)]
        h = next((i for i, r in enumerate(rows[:12]) if any(str(c).strip() in ('Tag Name', 'Seq No.') for c in r if c)), None)
        if h is None: continue
        sub = h + 1 if h + 1 < len(rows) and any(str(c).strip() in ('Area', 'Min', 'P_LL') for c in rows[h + 1] if c) else h
        top, low = rows[sub - 1], rows[sub]
        n = max(len(top), len(low)); top += [None] * (n - len(top)); low += [None] * (n - len(low))
        names, grp, g = [], [], ''
        for i in range(n):
            a, b = val(top[i]).replace('\n', ' '), val(low[i]).replace('\n', ' ')
            if a: g = a
            if re.match(r'C[12] Sign Off', a or ''): g = 'SIGN'
            names.append(b or a); grp.append(g)
        cnt = collections.Counter(x.lower() for x in names if x)
        lab, seen = [], set()
        for i, x in enumerate(names):
            if not x or grp[i] == 'SIGN' or SKIP.match(x): lab.append(None); continue
            if (x.lower() in DUP or cnt[x.lower()] > 1) and grp[i] and grp[i] != x: x = f'{grp[i]} {x}'
            x = nice(x)
            if x in seen: x = (grp[i].split('/')[-1].strip() + ' ' + x) if grp[i] and not x.startswith(grp[i]) else x + ' (2)'
            seen.add(x); lab.append(x)
        col = lambda *ns: next((i for i, x in enumerate(names) if x in ns), None)
        cT, cS, cP = col('Tag Name', 'Seq No.'), col('Tag Source'), col('P&ID')
        cH = col('#')
        cE = col('Comments') if cH is not None else None
        subc = set(range(cH, cE if cE and cE > cH else n)) if cH is not None else set()
        cur = None
        for r in rows[sub + 1:]:
            r = r + [None] * (n - len(r))
            v = [val(c) for c in r[:n]]
            t = v[cT] if cT is not None else ''
            if t and (re.search(r'refer to|^tag name$', t, re.I) or not re.fullmatch(r'(?=.*[A-Z])[A-Z0-9][A-Z0-9_\-./]{2,39}', t.upper())): t = ''   # (a tag: no spaces, a letter in it; not a step number or a note)
            if t:
                s = v[cS] if cS is not None else ''
                cur = {'s': sec, 'd': dn, 'rev': rev, 'a': area, 't': t, 'src': s if s and s != t else '', 'pid': v[cP] if cP is not None and v[cP].startswith('2000-') else '',
                       'f': [], 'h': [], 'x': []}
                REC.append(cur)
                for i, l in enumerate(lab):
                    if l and v[i] and i not in subc: cur['f'].append([l, tidy(v[i])])
            if cur is None or not any(v[i] for i in subc): continue
            cur['x'].append({lab[i] or names[i]: tidy(v[i]) for i in sorted(subc) if v[i] and (lab[i] or names[i])})
        for c in REC:
            if c['x'] and not c['h']:
                hs = []
                for x in c['x']:
                    for k in x:
                        if k not in hs: hs.append(k)
                c['h'] = hs; c['x'] = [[x.get(k, '') for k in hs] for x in c['x']]

# the compiled PCT tables (sources/pct/lookup/: PCT_Tables_Compiled.xlsx and its PCT_Lookup.html, every table row of 22
# PCTs, the four EDCR controller PCTs among them). A document the app holds no file of comes in whole from there; one
# held at the same revision gets the rows and values the reading of its own file missed (the PDF ones most); one held at
# a newer revision is left as it is
import base64, gzip
LKS = {'Analogue Inputs': 'Analogue input', 'Analogue Outputs': 'Analogue output', 'Digital Inputs': 'Digital input', 'Digital Outputs': 'Digital output',
       'Totalisers': 'Totaliser', 'On/Off Valves': 'On/off valve', 'Control Valves': 'Control valve', 'PID Controllers': 'PID controller',
       'Drives & Interlocks': 'Drive', 'Sequences': 'Sequence', 'Calculations': 'Calculation', 'Misc': 'Misc', 'Alarm Database': 'Alarm'}
LKF = os.path.join(RP, 'sources', 'pct', 'lookup', 'PCT_Lookup.html')
LKADD = collections.Counter()
if os.path.exists(LKF):
    LK = json.loads(gzip.decompress(base64.b64decode(re.search(r'const B64="([^"]+)"', open(LKF).read()).group(1))))
    have = {(c['d'], norm(c['t'])): c for c in REC}
    TAGOK = re.compile(r'(?=.*[A-Z])[A-Z0-9][A-Z0-9_\-./]{2,39}')
    seen2 = set()
    for r in LK['r']:
        dn, lrev, title = LK['d'][r[4]]
        if dn in docs and docs[dn][0] != lrev: continue   # (the app's own file is a newer revision)
        whole = dn not in docs
        if whole: docs.setdefault('+' + dn, (lrev, ''))
        sec = LKS.get(LK['t'][r[3]], 'Misc')
        tags = [t for t in str(r[0]).split() if t]
        # (two drives on one row, "34HE01 34FN01": a row each, a value with a line per drive split between them)
        for ti, t in enumerate(tags):
            if not TAGOK.fullmatch(t.upper()): continue
            part = lambda v: (v.split('\n')[ti] if len(tags) > 1 and v.count('\n') == len(tags) - 1 else v)
            f = [[nice(l), tidy(part(val(v)))] for l, v in r[6] if val(v) and not SKIP.match(l) and l != 'Tag Source']
            x = [{nice(l): tidy(val(v)) for l, v in sr if val(v) and l not in ('Rev',)} for sr in r[7]]
            pid = next((val(v) for l, v in r[6] if l == 'P&ID' and val(v).startswith('2000-')), '')
            c = have.get((dn, norm(t)))
            if c is None:
                sig = (norm(t), sec, json.dumps(f), json.dumps(x))
                if sig in seen2: continue   # (the same row in the two issues of one controller's PCT)
                seen2.add(sig)
                am = re.search(r'\bF\d{2}\b', next((v for l, v in r[6] if l == 'Area'), '') + ' ' + title)
                c = {'s': sec, 'd': dn, 'rev': lrev, 'a': am.group(0) if am else dn.split('-')[1], 't': t, 'src': r[1] if r[1] and r[1] != t else '', 'pid': pid, 'f': f, 'h': [], 'x': []}
                if x:
                    hs = []
                    for q in x:
                        for k in q:
                            if k not in hs: hs.append(k)
                    c['h'] = hs; c['x'] = [[q.get(k, '') for k in hs] for q in x]
                REC.append(c); have[(dn, norm(t))] = c; LKADD['row'] += 1; continue
            # (held: the values its own reading missed, and its conditions if it read none)
            txt = norm(' '.join([v for _, v in c['f']] + [v for q in c['x'] for v in q]))
            for l, v in f:
                if norm(v) and norm(v) not in txt and l not in [q[0] for q in c['f']]: c['f'].append([l, v]); LKADD['value'] += 1
            if x and not c['x']:
                hs = []
                for q in x:
                    for k in q:
                        if k not in hs: hs.append(k)
                c['h'] = hs; c['x'] = [[q.get(k, '') for k in hs] for q in x]; LKADD['conditions'] += 1
    docs = {k.lstrip('+'): v for k, v in docs.items()}
    print('compiled PCT tables:', dict(LKADD))
def merge(f):
    """one row per quantity: "Range 0 to 40 m3/h", "Alarm Lo 3 (5 s delay)", "Modes Manual, Auto"""
    f = [[re.sub(r'^Manipulated Variable Range', 'Output range', l).replace('Output range Min', 'Output range Min'), v] for l, v in f]
    d = dict(f); out, used = [], set()
    unit = lambda p: next((d[k] for k in (p + ' Unit', p + ' unit', p + ' Units', 'Output unit' if p.startswith('Output') else '') if k in d), '')
    for l, v in f:
        if l in used: continue
        m = re.fullmatch(r'(Range|Setpoint|Output range|Speed|SP) (Min|Max|Lower Limit|Upper Limit)', l) or re.fullmatch(r'(Output) (lower limit|upper limit)', l)
        if m:
            p = m.group(1); lo, hi = ((p + ' Min', p + ' Max') if 'M' in m.group(2) else (p + ' lower limit', p + ' upper limit')) if p != 'SP' else ('SP Lower Limit', 'SP Upper Limit')
            u = unit(p) or (d.get('Speed Units', '') if p in ('Speed', 'SP') else '')
            for k in (lo, hi, p + ' Unit', p + ' unit', p + ' Units') + (('Speed Units',) if p in ('Speed', 'SP') else ()): used.add(k)
            a, b = d.get(lo, ''), d.get(hi, '')
            out.append([{'Output': 'Output limits', 'SP': 'Speed setpoint limits'}.get(p, p), (f"{a} to {b}" if a and b else f"min {a}" if a else f"max {b}") + (' ' + u if u else '')]); continue
        if l in ('P', 'I', 'D'):
            if 'Tuning' not in [x[0] for x in out]: out.append(['Tuning', ', '.join(f"{k} {d[k]}" for k in ('P', 'I', 'D') if d.get(k))])
            continue
        m = re.fullmatch(r'(Alarm|Switchpoint) (LL|Lo|Hi|HH)', l)
        if m:
            dl = [d[k] for k in (l + ' delay (s)', l + ' delay on (s)') if k in d]; used |= {l + ' delay (s)', l + ' delay on (s)'}
            off = d.get(l + ' delay off (s)'); used.add(l + ' delay off (s)')
            out.append([l, v + (f" ({dl[0]} s delay" + (f", {off} s off" if off else '') + ")" if dl and dl[0] != '0' else '')]); continue
        if l in ('Manual', 'Auto') and v == 'Yes':
            if 'Modes' not in [x[0] for x in out]: out.append(['Modes', ', '.join(x for x in ('Manual', 'Auto') if d.get(x) == 'Yes') + (', Cascade' if d.get('Cascade') == 'Yes' else '')])
            continue
        if l == 'Cascade' and v == 'Yes': continue
        if l in ('Output unit',) and any(x[0].startswith('Output') for x in out): continue
        out.append([l, v])
    return out
# yes marks: "X" in a mode or flag column
for c in REC:
    c['f'] = merge([[l, 'Yes' if v.upper() == 'X' else v] for l, v in c['f']])
    c['x'] = [['✓' if v.upper() == 'X' else v for v in x] for x in c['x']]
# owners and mentions
by, used = collections.defaultdict(list), collections.defaultdict(set)
miss = collections.Counter()
for i, c in enumerate(REC):
    k = appkey(c['t'], c['src'])
    if not k:   # a soft tag the lists don't hold (XA21140_FAULT): the equipment its faceplate or description names
        for l, v in c['f']:
            if l in ('Faceplate', 'Description', 'Valve Description', 'Description (Software Tag Only)', 'Name'):
                k = next((appkey(m) for m in TAGIN.findall(v.upper()) if appkey(m)), None)
                if k: c['via'] = 1; break
    if c['s'] == 'Sequence': k = None
    if k: by[k].append(i); c['k'] = k
    else: miss[c['s']] += 1
# control tags no list holds (soft tags, calculations, sequences, signals): searchable in their own right ("Control tag",
# search-data.json type ctl), on a sheet where other rows did match (a sheet with nothing matching is left out)
hit = collections.Counter((c['d'], c['s']) for c in REC if c.get('k'))
CT = {}
for i, c in enumerate(REC):
    if c.get('k') or not (hit[(c['d'], c['s'])] or c['s'] == 'Sequence'): continue
    k = norm(c['t'])
    if not k or k in KEYS: continue
    c['k'] = k; c['ctl'] = 1; by[k].append(i); miss[c['s']] -= 1
    dsc = next((v for l, v in c['f'] if l in ('Faceplate', 'Description', 'Description (Software Tag Only)', 'Seq Description', 'Name')), '')
    e = CT.setdefault(k, [c['t'], dsc, [], c['a'], c['pid'], []])
    if c['s'] not in e[2]: e[2].append(c['s'])
    if c['d'] not in e[5]: e[5].append(c['d'])
    if not e[1]: e[1] = dsc
    if not e[4]: e[4] = c['pid']
for k in CT: KEYS[k] = 'ctl'
SD['types']['ctl'] = {'n': 'Control tag', 'doc': 'Process Control Tables', 'rev': '', 'f': ['Control tag', 'Description', 'Kind', 'Area', 'P&ID', 'Process control tables']}
SD['data']['ctl'] = [[e[0], e[1], ', '.join(e[2]), e[3], e[4], ', '.join(e[5])] for k, e in sorted(CT.items())]
json.dump(SD, open(R + '/search-data.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(CT), 'control tags added to the search (type ctl)')
for i, c in enumerate(REC):
    k = c.get('k')
    txt = ' '.join([v for _, v in c['f']] + [v for x in c['x'] for v in x])
    for m in TAGIN.findall(txt):
        mk = appkey(m)
        if mk and mk != k: used[mk].add(i)
    c['rel'] = sorted({appkey(m) for m in TAGIN.findall(txt)} - {None, k})
# per item bundles, sharded (pct/<n>.json, n = the key's character codes summed, mod 32; lookup.js uses the same) with
# an index of the keys (pct/idx.json): an item's own rows, and the conditions of other rows that name it
json.dump([{q: c.get(q) for q in ('s', 'd', 'rev', 't', 'src', 'pid', 'k', 'via', 'ctl')} for c in REC], open(R + '/tools/pct_rows.json', 'w'), separators=(',', ':'))   # (tools/build_issues.py)
NSH = 32
shard = lambda k: sum(map(ord, k)) % NSH
def named(c, k):
    """where row c names item k: [label, text] of each field or sub row line"""
    hits = []
    for l, v in c.get('f', []):
        if any(appkey(m) == k for m in TAGIN.findall(v)): hits.append([l, v])
    for x in c.get('x', []):
        if any(appkey(m) == k for v in x for m in TAGIN.findall(v)): hits.append(['', ' · '.join(v for v in x if v)])
    return hits[:4]
B = collections.defaultdict(dict)
for k in set(by) | set(used):
    b = {}
    if k in by: b['r'] = [{q: v for q, v in REC[i].items() if q not in ('k', 'a') and v not in ('', [], None)} for i in by[k]]
    if k in used: b['u'] = [[REC[i].get('k') or '', REC[i]['t'], REC[i]['s'], named(REC[i], k)] for i in sorted(used[k])]
    B[shard(k)][k] = b
os.makedirs(R + '/pct', exist_ok=True)
for f in glob.glob(R + '/pct/*.json'): os.remove(f)
for n, d in B.items(): json.dump(d, open(f'{R}/pct/{n}.json', 'w'), separators=(',', ':'), ensure_ascii=False)
json.dump({'built': datetime.date.today().isoformat(), 'n': NSH, 'docs': {d: r for d, (r, f) in docs.items()},
           'k': {k: [len(by.get(k, [])), len(used.get(k, []))] for k in sorted(set(by) | set(used))}}, open(R + '/pct/idx.json', 'w'), separators=(',', ':'))
print(len(docs), 'workbooks', len(REC), 'rows', len(by), 'items with control data', sum(len(v) for v in by.values()), 'matched;', len(used), 'items named in conditions;',
      'unmatched', dict(miss), 'size', sum(os.path.getsize(f) for f in glob.glob(R + '/pct/*.json')) // 1024, 'KB')
