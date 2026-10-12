"""A Process Control Tables PDF (the as-built issue SharePoint holds, e.g. 2000-F14-LST-PR-10001_3.pdf) read as if it were
the workbook: open(path) gives an object with .worksheets, each with .title, .sheet_state and .iter_rows(values_only=True),
so tools/build_pct.py and tools/build_pct_sources.py read it the same way as the .xlsm.

Each table page starts with its section heading (ANALOGUE INPUTS, OPEN-CLOSE VALVES …); the pages of one section become one
sheet ("1. Analogue Input" …), the group heading row and the column heading row kept once, then every data row. Column
headings printed sideways come out of the PDF scrambled; they are named from the heading before them (P_LL, then
"P_LL Delay ON (sec)" and "P_LL Delay OFF (sec)"; A_LL, then "A_LL Delay (sec)").
"""
import re, datetime
import pymupdf

SECS = [(r"ANALOGUE INPUT|ANALOGUE INSTRUMENT", "1. Analogue Input"), (r"ANALOGUE OUTPUT", "2. Analogue Output"), (r"DIGITAL INSTRUMENTS?\W*OUTPUT", "4. Digital Output"), (r"DIGITAL INPUT|DIGITAL INSTRUMENT", "3. Digital Input"), (r"GRAPHICS REFERENCE", "-"),
        (r"DIGITAL OUTPUT", "4. Digital Output"), (r"TOTALISER", "5. Totalisers"), (r"OPEN.CLOSE VALVE|ON.?OFF VALVE", "6. OnOff Valves"),
        (r"CONTROL VALVE", "7. Control Valves"), (r"PID CONTROLLER", "8. PID Cont"), (r"DRIVE", "9. Drives"), (r"SEQUENCE", "10. Sequence"),
        (r"CALCULATION", "11. Calculation"), (r"MISC", "12. Misc"), (r"ALARM DATABASE", "13. Alarm Database"), (r"CAUSE", "14. Cause & Effect")]
LV = r"(P|A)_(LL|Lo|Hi|HH)"
KNOWN = re.compile(r"^(Tag Source|Tag Name|P&ID|Description|Abbreviated Description \(Faceplate\)|Trend \(sec\)|Min|Max|Unit|Units|" + LV +
                   r"|Alarm Masking Conditions?|Comments|Rev|Type|Shift|Day|Cont|State 0|State 1|Alarm State|Source|Alarm Delay \(secs\)|Alarm Priority|"
                   r"Valve Description|Valve Type|Fail Position.*|Manual|Auto|Cascade|Open Condition.*|Close Condition.*|#|Condition|Description.*|Delay On|Delay Off|"
                   r"Open Permissive|Close Permissive|Open Interlock|Close Interlock|Open|Close|Bypass|Reset Required|Name|Drive Type|Speed.*|SP .*|Current\s+Max|"
                   r"Start Condition.*|Stop Condition.*|Start Permissive|Process|Critical|Hardwired.*|Normal State|Alarm Value|Alarm Units|On Delay \(sec\)|"
                   r"Alarm Masking\s+Condition|Impact|Urgency|Priority|Operator Response|Controller Description|Normal Operating Mode|Process Value Tag|"
                   r"Range Min|Range Max|Lower Limit|Upper Limit|Destination.*|Direct / Reverse Acting|P|I|D|Tag|Nom|Calculation|Seq No\.|Seq Description|Step|Action|"
                   r"Tag / Item|Next Step Delay \(s\)|Step Advance Condition|Equipment Permissives|Recovery Seq.*|Controller \(Y/N\)|Comment|Change.*)$", re.I)

def _ok(l):
    """a line read cleanly: two lines printed over each other come out with their letters interleaved ("A cy_cH lei .=")"""
    w = l.split()
    W = {"of", "to", "in", "at", "is", "on", "or", "if", "a", "by", "be", "no", "up", "as", "an", "and", "pv", "sp", "sg", "op", "hh", "ll", "hi", "lo", "kw", "m3"}
    odd = sum(1 for x in w if len(x) <= 2 and re.search(r"[A-Za-z]", x) and x.lower() not in W)
    return (odd < 3 or odd / len(w) < .3) and not re.search(r"[a-z][A-Z]_|_[A-Z][a-z]|\b[a-z]{1,3}_[a-z][A-Z]\b", l)

def _cell(c):
    c = re.sub(r"[ \t]+", " ", (c or "").replace("\u00ad", ""))
    c = "\n".join(l for l in c.split("\n") if _ok(l)).strip()
    return re.sub(r"^([AP])\s*(LL|Lo|Hi|HH)\s*_?$", r"\1_\2", c)   # (A_LL printed sideways: "A LL\n_")

def _heads(row):
    """the column headings, scrambled sideways ones named from the level heading before them"""
    out, last = [], None
    for c in row:
        h = re.sub(r"\s*\n\s*", " ", c).strip(); h = re.sub(r"^Tren ?d", "Trend", h)
        m = re.fullmatch(LV, h)
        if m: last, n = h, 0; out.append(h); continue
        if last and h and not KNOWN.match(h):
            n += 1
            out.append(f"{last} Delay {'ON' if n == 1 else 'OFF'} (sec)" if last.startswith("P") else f"{last} Delay (sec)"); continue
        out.append(h)
    return out

LVS = ["LL", "Lo", "Hi", "HH"]
CANON = {"Process Switchpoints": [x for l in LVS for x in (f"P_{l}", f"P_{l} Delay ON (sec)", f"P_{l} Delay OFF (sec)")],
         "Alarms": [x for l in LVS for x in (f"A_{l}", f"A_{l} Delay (sec)")], "Alarm Priority": [f"A_{l}" for l in LVS]}
def _canon(rows):
    """the switchpoint, alarm and alarm priority columns named by the template's fixed order (their sideways headings
    come out of some PDFs scrambled): the columns under each group heading, empty ones (merged cells) left out"""
    grp, hd, data = rows[4], rows[5], rows[6:]
    w = max(len(r) for r in rows[4:]); grp += [""] * (w - len(grp)); hd += [""] * (w - len(hd))
    used = [i for i in range(w) if hd[i] or any(i < len(r) and r[i] for r in data)]
    starts = [i for i in used if grp[i]]; done = set()
    for g, names in CANON.items():
        i0 = next((i for i in starts if re.sub(r"\s+", " ", grp[i]).strip() == g), None)
        if i0 is None: continue
        nxt = next((i for i in starts if i > i0), w)
        cols = [i for i in used if i0 <= i < nxt]
        if len(cols) >= len(names):
            for i, nm in zip(cols, names): hd[i] = nm; done.add(i)
    # (a delay heading guessed for a column outside those groups is a scrambled heading of something else: left unnamed)
    for i in range(w):
        if i not in done and re.fullmatch(r"[PA]_(LL|Lo|Hi|HH) Delay.*", hd[i]): hd[i] = ""
    rows[4], rows[5] = grp, hd

class Sheet:
    def __init__(self, title, rows): self.title, self.rows, self.sheet_state = title, rows, "visible"
    def iter_rows(self, values_only=True, max_col=None, max_row=None, **k):
        for r in self.rows[:max_row] if max_row else self.rows:
            yield tuple(r[:max_col] if max_col else r)

def _date(s):
    try: return datetime.datetime.strptime(s, "%d-%b-%y")
    except Exception: return s

class Book:
    def __init__(self, path):
        d = pymupdf.open(path); secs = {}; order = []
        self.worksheets = [Sheet("Cover Page", [[l] for l in d[0].get_text().split("\n") if l.strip()]),
                           Sheet("Revisions", [[_date(l.strip())] for l in d[1].get_text().split("\n") if l.strip()])]
        last = None
        for p in d.pages(2):
            # (the section heading: in the table's first rows, else a heading line on the page in capitals, else the section the
            # page before was in, as a table running on)
            # (heading lines only: in capitals, a few words, starting with the heading; a tag description in capitals is not one)
            caps = [l.strip() for l in p.get_text().split("\n") if l.strip() and l.strip() == l.strip().upper() and 5 < len(l.strip()) < 60 and len(l.split()) <= 6]
            for t in p.find_tables().tables:
                x = [[_cell(c) for c in r] for r in t.extract()]
                if not x: continue
                head = " ".join(c for r in x[:5] if sum(1 for c in r if c) == 1 for c in r if c and "PROCESS CONTROL TABLES" not in c.upper()).upper()   # (heading rows: one cell)
                name = next((n for rx, n in SECS if re.search(rx, head)), None) or next((n for l in caps for rx, n in SECS if re.match(r"\W*(" + rx + ")", l)), None) or last
                if not name: continue
                last = name
                if name == "-": continue   # (the graphics list: not a control table)
                h = next((i for i, r in enumerate(x[:8]) if any(c in ("Tag Name", "Seq No.", "Tag Source") for c in r)), None)
                # (two heading rows: the first names the groups and some columns, the second the rest, Min, Max, Tag Source …)
                two = h is not None and h + 1 < len(x) and sum(1 for c in x[h + 1] if c) >= 3 and any(c in ("Min", "Tag Source", "Tag Name", "Unit", "P_LL", "#") or c.startswith("Trend") for c in x[h + 1]) and not re.match(r"2000-|[A-Z]{1,5}\d", x[h + 1][0] or "")
                if h is None: continue
                if name not in secs:
                    grp = x[h - 1] if h > 0 else [""] * len(x[h])
                    hd = [b or a for a, b in zip(x[h], x[h + 1])] if two else x[h]
                    if two: grp = [a if b else "" for a, b in zip(x[h], x[h + 1])]
                    secs[name] = [["KCGM GROWTH PROJECT"], [], [], [name.split(". ", 1)[1].upper()], grp, _heads(hd)]; order.append(name)
                secs[name] += [r for r in x[h + (2 if two else 1):] if any(r)]
        for n in order: _canon(secs[n])
        self.worksheets += [Sheet(n, secs[n]) for n in order]

def open(path): return Book(path)
