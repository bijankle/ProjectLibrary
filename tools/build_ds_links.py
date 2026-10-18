"""Equipment datasheets on the asset pages: every datasheet in the project document register (-DSH- numbers, titles
with DATASHEET / DATA SHEET, the vendors' F11 / F13 / F14 data documents; safety data sheets left out) matched to the
equipment it covers, into ds-links.json for lookup.js (an asset page's Datasheets row, as the IOM row):
  "d": {doc number: [title, rev, status, SharePoint link]}
  "t": {tag: {"d": [named in the title], "s": [the parent's, for sub equipment], "f": [title phrase, low], "p": [package]}}
How (in order of confidence): a tag in the title (shorthand lists and ranges expanded, a type code the lists spell
differently read as the listed tag of the same area and number); sub equipment of a named tag (its description says
part of / driven by it, its tag is the parent's plus a suffix, or it shares the package and its name starts with the
parent's: SAG MILL -> SAG MILL MOTOR LUBE UNIT HEATER); the package (a vendor document 2000-<PKG>-F1x-…, or a project
datasheet 2000-F00-DSH-ME-1[12]NNN -> package ME-NNN), as the IOM row; a title phrase matched to equipment names in its
area (low). Cancelled, superseded and redline copies are left out. Revs and links from the SharePoint file list
(sources/doclist), else the register.   python3 tools/build_ds_links.py
"""
import collections, glob, json, os, re, sys
import openpyxl
R0 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R0), "projectlibraryprivate")
sys.path.insert(0, os.path.join(R0, "tools"))
from doclist import revkey
REGF = max(glob.glob(os.path.join(RP, "sources", "register", "*.xls[xm]")), key=os.path.getmtime)
rows = [["" if c is None else str(c) for c in r] for r in openpyxl.load_workbook(REGF, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True)][1:]
norm=lambda n: re.sub(r'[\\/]','-',n.strip().upper())
V=re.compile(r'^2000-([A-Z]{2}\d{3}[A-Z]?(?:\.\d+)?)-([A-Z]\d{2})-(\d+)$')
SDS=re.compile(r'SAFETY DATA ?SHEET|\bM?SDS\b|SAFETY ?DATASHEET',re.I)
DSW=re.compile(r'DATA ?SHEET|DATASHT|DATA-SHEET',re.I)
REG={}
for r in rows:
    n=norm(r[3])
    if not n: continue
    REG.setdefault(n,[]).append(r)
C={}; excl=collections.Counter()
for n,rs in REG.items():
    t=' '.join(rs[0][6].split())
    m=V.match(n)
    kind=None
    if '-DSH-' in n: kind='DSH'
    elif DSW.search(t): kind='title'
    elif m and m.group(2) in ('F11','F13','F14'): kind='vcode'
    if not kind: continue
    if SDS.search(t): excl['sds']+=1; continue
    C[n]=dict(n=n,t=t,kind=kind,code=m.group(2) if m else n.split('-')[2] if n.count('-')>=3 else '',pkg=m.group(1) if m else '',rows=rs)
DLP = os.path.join(RP, "sources", "doclist", "doclist.json")
DL = json.load(open(DLP))["L"] if os.path.exists(DLP) else {}
D = json.load(open(os.path.join(R0, "search-data.json")))
nk = lambda s: re.sub(r'[^A-Z0-9]', '', str(s or '').upper())

mf = D['types']['mel']['f']; MEL = {r[0]: r for r in D['data']['mel']}
ef = D['types']['elec']['f']; ELEC = {r[0]: r for r in D['data']['elec']}
INS = {r[0] for r in D['data']['ins']}
gm = lambda r, n: r[mf.index(n)] if r else ''
NK = {}
for t in list(MEL) + list(ELEC): NK.setdefault(nk(t), t)
PKG = collections.defaultdict(list)
for t, r in MEL.items():
    for p in re.split(r'[\s,/;&]+', gm(r, 'Package')):
        if p: PKG[p].append(t)

# ---------- choose rev / status / url ----------
def pick(c):
    rs = c['rows']
    best = max(rs, key=lambda r: (r[5].upper() not in ('CAN', 'SSD'), revkey(r[4])))
    d = DL.get(nk(c['n']))
    url, rev, st = best[1], best[4], best[5]
    if d: url, rev = d['url'], d['rev']; st = d['st'] or st
    return rev, st, url

# ---------- classify ----------
def category(n, t, code):
    T = t.upper()
    if re.search(r'-RFI-', n): return 'rfi'
    if re.search(r'CERTIFICATE|MATERIAL TEST|MATERIAL DATA SHEET|CURECON|BLYGOLD|PAINTING|RING BOLTS|THRUST BLOCK', T) or n.startswith(('2000-CN06', '2000-CC001')): return 'material'
    if re.match(r'2000-PP0(05|06|07|09|12|14|24|28|37)\b', n) and not re.search(r'\b[FT]\d{2,3}-?[A-Z]{2,4}-?\d{3}', T): return 'piping/bulk'
    if re.match(r'2000-PP0(05|06|09|32)', n): return 'piping/bulk'
    if '-DSH-IC-' in n or '-DSH-EJ-' in n or re.search(r'INSTRUMENT DATA ?SHEET|TRANSMITTER|SENSOR|POSITIONER|VOLUME BOOSTER', T): return 'instrument'
    if '-DSH-EL-' in n or n.startswith(('2000-EL', '2000-SE', 'SP0', '2000-T00')) or re.search(r'MOTOR', T): return 'electrical/motor'
    return 'equipment'

# ---------- tags in a title ----------
TAGRE = re.compile(r'(?<![A-Z0-9])([FT]?\d{2,3})-?([A-Z]{2,4})-?(\d{3,4})([A-Z]?)(?:-([A-Z]{2,4}\d*))?(?![0-9])')
def tags_in(title):
    T = title.upper().replace('–', '-')
    found = []  # (written, canonical-or-None)
    for m in TAGRE.finditer(T):
        area, typ, num, sfx, tail = m.groups()
        if not area.startswith(('F', 'T')):
            if not re.match(r'\d{2,3}$', area): continue
            area = 'F' + area  # 75-PW-489 -> F75-PW-489
        base = f'{area}-{typ}-{num}'
        nums = [num + sfx]
        rest = T[m.end():]
        # shorthand lists: /404/405, , 402, & 491, TO F75PW488, THROUGH 417
        mm = re.match(r'((?:\s*(?:/|,|&|AND)\s*\d{3,4}[A-Z]?(?![0-9-]))+)', rest)
        if mm: nums += re.findall(r'\d{3,4}[A-Z]?', mm.group(1))
        mr = re.match(r'\s*(?:TO|THROUGH|-)\s*(?:[FT]?\d{2,3}-?' + typ + r'-?)?(\d{3,4})(?![0-9])', rest)
        if mr and 0 < int(mr.group(1)) - int(num) <= 25:
            nums += [str(i) for i in range(int(num) + 1, int(mr.group(1)) + 1)]
        for x in nums:
            cand = [f'{area}-{typ}-{x}']
            if tail and x == num + sfx: cand.insert(0, f'{area}{typ}{x}-{tail}')
            hit = next((NK[nk(c)] for c in cand if nk(c) in NK), None)
            found.append((cand[-1], hit))
    return found

# alias: tag written with another type code than the list uses (F16-FL-411 vs F16-CF-411)
def alias(written, title):
    m = re.match(r'([FT]\d{2,3})-([A-Z]{2,4})-(\d{3,4}[A-Z]?)$', written)
    if not m: return None
    a, _, n = m.groups()
    c = [t for t in MEL if re.match(rf'{a}-[A-Z]{{2,4}}-{n}$', t)]
    W = set(re.findall(r'[A-Z]{4,}', title.upper())) - {'DATASHEET', 'DATA', 'SHEET', 'THROUGH'}
    sc = {t: len(W & set(re.findall(r'[A-Z]{4,}', gm(MEL[t], 'Equipment name')))) for t in c}
    top = max(sc.values(), default=0)
    # (and the kind of thing it is in the title too: CELL for F16-FL-411 read as the flotation cell F16-CF-411; a
    # switchroom F175-SR-701 is not the pump F175-PW-701 though both are "Southlakes booster")
    kind = lambda t: (re.findall(r'[A-Z]{4,}', gm(MEL[t], 'Equipment name')) or [''])[-1]
    stem = lambda w: w[:-1] if w.endswith('S') else w
    good = [t for t in c if sc[t] == top and top > 0 and stem(kind(t)) in {stem(w) for w in W}]
    return good[0] if len(good) == 1 else None

# ---------- package of a document ----------
VEND = re.compile(r'^2000-([A-Z]{2}\d{3}[A-Z]?(?:\.\d+)?)-([A-Z]\d{2})-\d+')
PROJ = re.compile(r'^2000-F00-DSH-(ME|EL|IC)-1([12])(\d{3})([A-Z]?)$')
def doc_pkgs(n):
    m = VEND.match(n)
    if m: return [m.group(1)], 'vendor package'
    m = PROJ.match(n)
    if m:
        disc, stage, num, let = m.groups()
        if disc != 'ME': return [], ''
        if num == '001' and let: return ['ME019' + let], 'project datasheet number -> package (ME019x agitators, guessed)'
        p = f'ME{num}{let}'
        if p in PKG: return [p], 'project datasheet number -> package'
        ps = [k for k in PKG if re.fullmatch(rf'ME{num}[A-Z]?', k)]
        return ps, 'project datasheet number -> package (letter-insensitive)'
    return [], ''

# ---------- sub equipment ----------
PARENT_RE = re.compile(r'(?:PART OF(?: AND POWERED BY)?(?: HPU)?|POWERED BY|DRIVEN BY(?: HPU)?|SITS WITHIN|DISTRIBUTOR OF|TRANSPORT FRAME FOR)\s+([FT]\d{2,3}-[A-Z]{2,4}-\d{3,4}[A-Z]?)')
CHILD = collections.defaultdict(dict)  # parent -> {child: reason}
for t, r in MEL.items():
    txt = ' '.join(str(gm(r, f)) for f in ('Equipment name', 'Size / description', 'Material of construction')).upper()
    for p in PARENT_RE.findall(txt):
        if p in MEL and p != t: CHILD[p][t] = 'description says part of / driven by ' + p
    nm = gm(r, 'Equipment name').upper()
    m = re.match(r'([FT]\d{2,3}-[A-Z]{2,4}-\d{3,4}[A-Z]?)\s', nm)
    if m and m.group(1) in MEL: CHILD[m.group(1)][t] = 'name starts with ' + m.group(1)
# tag + suffix (F13-MS-401A, F23PP651-VS ...)
ALLK = sorted(set(MEL) | set(ELEC))
for p in MEL:
    k = nk(p)
    for t in ALLK:
        if t != p and nk(t).startswith(k) and not nk(t)[len(k)].isdigit():
            CHILD[p].setdefault(t, 'tag is ' + p + ' + suffix')
for t, r in ELEC.items():
    b = r[ef.index('Belongs to')]
    if b in MEL: CHILD[b].setdefault(t, 'elec list: belongs to ' + b)
# same package, name starts with the parent's name
SUBW = re.compile(r'\b(MOTOR|HEATER|LUBE|LUBRICATION|BRAKE|FAN|COOLER|COOLING|HPU|HYDRAULIC|GEARBOX|DRIVE|OIL|FILTER|PUMP|ACCUMULATOR|HEAT EXCHANGER|SPRAY|GREASE|SEAL|TROMMEL|SCANNER|VSD|BEARING|RESERVOIR|SKID|COMPRESSOR|PANEL|TANK HEATER|BLOWER|AGITATOR|ROTARY VALVE|SCREW)\b')
BIGW = re.compile(r'\b(CONVEYOR|CHUTE|SUMP|AREA|BIN|STOCKPILE|FEED BOX|LAUNDER|PIPE|MONORAIL|HOIST|CRANE|TROLLEY|PLATFORM|TUNNEL|ISOLATION GATE)\b')
byarea = collections.defaultdict(list)
for t in MEL: byarea[t.split('-')[0]].append(t)
for p, r in MEL.items():
    pn = re.sub(r'\s+', ' ', gm(r, 'Equipment name').upper()).strip()
    if len(pn) < 6: continue
    pp = set(re.split(r'[\s,/;&]+', gm(r, 'Package'))) - {''}
    for t in byarea[p.split('-')[0]]:
        if t == p or t in CHILD[p]: continue
        tn = re.sub(r'\s+', ' ', gm(MEL[t], 'Equipment name').upper()).strip()
        if not tn.startswith(pn + ' '): continue
        rest = tn[len(pn):]
        if re.match(r'\s*\d', rest) and not re.match(r'\s*\d+\s*-?\s*\D', rest): continue  # "PUMP 2" is a sibling, not a sub
        tp = set(re.split(r'[\s,/;&]+', gm(MEL[t], 'Package'))) - {''}
        if pp and tp & pp and not BIGW.search(rest):
            CHILD[p][t] = f'same package {"/".join(sorted(pp))}, name starts "{pn}"'
        elif SUBW.search(rest) and not BIGW.search(rest) and (not tp or not pp or tp & pp):
            CHILD[p][t] = f'same area, name "{pn}" + {SUBW.search(rest).group(0).lower()}'
def subs_of(tags):
    out, seen, q = {}, set(tags), list(tags)
    while q:
        p = q.pop()
        for c, why in CHILD.get(p, {}).items():
            if c in seen: continue
            seen.add(c); out[c] = why; q.append(c)
    return out

# MEL "Reference drawing" naming a datasheet
REFD = collections.defaultdict(list)
for t, r in MEL.items():
    for x in re.findall(r'2000-[A-Z0-9.\-]+', gm(r, 'Reference drawing')):
        REFD[x.upper()].append(t)

# ---------- class phrase (area datasheets with no tag: "FINAL TAILINGS PUMPS DATASHEET") ----------
STOP = r'\b(DATASHEETS?|DATA SHEETS?|EQUIPMENT|FIM III|FIM IIII|ENABLING WORKS|REPLACEMENT PROJECT|PROJECT|PACKAGE)\b'
def phrase(n, t):
    m = re.match(r'2000-(F\d{2,3})-DSH-', n)
    if not m: return '', []
    area = m.group(1); TU = t.upper()
    # conveyor component datasheets (belts, idlers, drives, pulleys): the project's conveyors
    if 'CONVEYOR' in TU and re.search(r'BELTS|IDLER|DRIVE|PULLEY|SCRAPER|SKIRT|HUNGRY', TU) and 'WEIGHER' not in TU:
        cv = [k for k in MEL if '-CV-' in k and (k.startswith('F35-') if area == 'F35' else re.match(r'F1[23]-CV-4\d\d$', k))]
        return 'conveyor components -> project conveyors', cv
    T = re.sub(STOP, ' ', TU)
    hits = []; prev = []
    for p in re.split(r',|&| AND ', T):
        p = re.sub(r'[^A-Z0-9 ]', ' ', p)
        pw = [re.sub(r'(?<=[A-Z]{3})S$', '', w).replace('TAILING', 'TAIL') for w in p.split()]
        if not pw: continue
        if len(pw) == 1 and len(prev) > 1: pw = prev[:-1] + pw   # "SUMP PUMP HOISTS & MONORAILS": monorails of the same
        prev = pw
        def scan(anyarea):
            h = []
            for k, r in MEL.items():
                if not anyarea and area != 'F00' and not k.startswith(area + '-'): continue
                nm = re.sub(r'[^A-Z0-9 ]', ' ', gm(r, 'Equipment name').upper()).replace('TAILINGS', 'TAIL').replace('TAILS', 'TAIL')
                nw = nm.split()
                if all(any(x.startswith(w) for x in nw) for w in pw) and any(x.startswith(pw[-1]) for x in nw[-3:]):
                    if 'FIM III' in TU and 'FIM III' not in gm(r, 'Equipment name').upper(): continue
                    h.append(k)
            return h
        h = scan(False)
        if len(h) > 40: h = []
        if not h and len(pw) >= 2 and pw[0] not in ('SOLUTION', 'SLURRY', 'WATER', 'SUMP', 'PROCESS'): h = scan(True); h = h if len(h) <= 6 else []
        hits += [k for k in h if k not in hits]
    if len(hits) > 40: return T.strip(), []
    return re.sub(r'\s+', ' ', T).strip(), hits

# ---------- build ----------
out = []
for n, c in sorted(C.items()):
    rev, st, url = pick(c)
    t = c['t']; T = t.upper()
    dead = st.upper() in ('CAN', 'SSD') or bool(re.match(r'\W*(SUPERSEDED|CANCELLED|RENUMBERED)', T)) or 'CANCELLED' in T[:20] or T.strip() == 'SPARE'
    rlm = bool(re.search(r'-RLM\d*$', n))
    cat = category(n, t, c['code'])
    o = dict(n=n, t=t, rev=rev, st=st, url=url, kind={'DSH': 'project datasheet (-DSH-)', 'title': 'title says datasheet', 'vcode': 'vendor code F11/F13/F14 (not titled datasheet)'}[c['kind']], cat=cat, tags=[], sub=[], pkg=[], unmatched=[], how='')
    if dead: o['how'] = 'cancelled/superseded: not mapped'; o['dead'] = 1; out.append(o); continue
    if rlm: o['how'] = 'redline copy of ' + n.rsplit('-', 1)[0] + ': not mapped separately'; o['dead'] = 1; out.append(o); continue
    hows = []
    direct = []
    for w, hit in tags_in(t):
        if hit:
            if hit not in direct: direct.append(hit)
            if hit not in MEL:   # on the electrical list only: the MEL may carry it under another type code (F75-FL-600 / F75-FI-600)
                a = alias(w, t)
                if a and a not in direct: direct.append(a); hows.append(f'{w} (elec list) also read as MEL {a}')
        else:
            a = alias(w, t)
            if a:
                if a not in direct: direct.append(a); hows.append(f'{w} read as {a} (same area/number, list uses another type code)')
            elif w not in o['unmatched'] and nk(w) not in {nk(x) for x in INS}: o['unmatched'].append(w)
    if direct: hows.insert(0, 'tag(s) in title')
    for x in REFD.get(n, []):
        if x not in direct: direct.append(x); hows.append('MEL Reference drawing names it')
    o['tags'] = direct
    if not direct and cat in ('equipment', 'electrical/motor'):
        ps, why = doc_pkgs(n)
        tg = sorted({x for p in ps for x in PKG.get(p, [])})
        if tg: o['pkg'] = tg; o['pkgs'] = ps; hows.append(f'{why} {",".join(ps)}: {len(tg)} MEL tags')
    if not direct and not o['pkg'] and cat == 'equipment':
        ph, tg = phrase(n, t)
        if tg: o['cls'] = tg; hows.append(f'{"title phrase " + repr(ph) + " matched in MEL equipment names" if not ph.startswith("conveyor") else ph}: {len(tg)} tags (low confidence)')
    s = subs_of([x for x in direct + o.get('cls', []) if x in MEL])
    o['sub'] = sorted(k for k in s if k in MEL); o['esub'] = sorted(k for k in s if k not in MEL)
    o['subwhy'] = {k: s[k] for k in o['sub']}
    if o['sub']:
        kinds = sorted({('package+name' if v.startswith('same package') else 'area+name' if v.startswith('same area') else 'tag suffix' if 'suffix' in v else 'description') for v in o['subwhy'].values()})
        hows.append(str(len(o['sub'])) + ' MEL sub-equipment (' + '/'.join(kinds) + ')')
    if o['esub']: hows.append(f"{len(o['esub'])} electrical items (LCS/VSD/JB) of those tags")
    o['how'] = '; '.join(hows) or ('no tag or package found' if cat in ('equipment', 'electrical/motor', 'instrument') else f'{cat}: not equipment')
    out.append(o)


# ---------- out: the documents still live, the tags each covers ----------
EQ = ("equipment", "electrical/motor", "instrument")
docs, tags = {}, collections.defaultdict(lambda: collections.defaultdict(list))
for o in out:
    if o.get("dead") or o.get("cat") not in EQ: continue
    put = [("d", o["tags"]), ("s", o.get("sub", []) + o.get("esub", [])), ("f", o.get("cls", []))] + ([("p", o["pkg"])] if o.get("cat") != "instrument" else [])
    if not any(v for _, v in put): continue
    docs[o["n"]] = [o["t"], o.get("rev", ""), o.get("st", ""), o.get("url", "")]
    for k, v in put:
        for t in v:
            if o["n"] not in tags[t][k]: tags[t][k].append(o["n"])
for t, m in tags.items():   # (a document listed once, at its best level)
    seen = set()
    for k in ("d", "s", "f", "p"):
        m[k] = [x for x in m.get(k, []) if not (x in seen or seen.add(x))]
        if not m[k]: m.pop(k, None)
json.dump({"d": docs, "t": tags}, open(os.path.join(R0, "ds-links.json"), "w"), separators=(",", ":"))
print(len(docs), "datasheets,", len(tags), "tags,", sum(1 for m in tags.values() if "d" in m), "named,", sum(1 for m in tags.values() if "s" in m and "d" not in m), "as sub equipment ->", os.path.getsize(os.path.join(R0, "ds-links.json")) // 1024, "KB")
