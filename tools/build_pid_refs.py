"""Finds every reference printed on the P&IDs and PFD sheets so the drawing viewer can make them tappable.

Usage: python3 tools/build_pid_refs.py            (after build_pids.py and build_search.py)
Output: pid-refs.json  {drawing number: [[page, left, top, width, height, target, kind], ...]}
  box in 1/10000 of the sheet width and height (top left origin); kind "d" = another drawing in the app (continuation
  ribbons, vendor package and reference drawings), "q" = a bubble shared by several list entries (opens a search),
  otherwise the list the tag is in (line, mel, ins, cv, mv, spi, hose).
Read from the sheets' text: the drawn text where the PDF has it, and the OCR text layer on scanned sheets (a sheet can
carry both, so a place found twice is kept once). Instrument and valve bubbles print the letters above the number
("HV" over "12262"): the number picks the instruments and valves listed on that drawing, the letters above pick
between them (several left, e.g. YI12000A and B: "q", the tags joined by |, and the viewer offers a choice). OCR slips in drawing numbers
("7a00-F24-PID-PR-10020") are matched on everything after the leading 2000.
"""
import difflib, json, os, re
import pymupdf

ROOT = os.path.join(os.path.dirname(__file__), "..")
norm = lambda s: re.sub(r"[\s\-_/.]+", "", str(s or "").upper())
ix = json.load(open(os.path.join(ROOT, "PIDs/index.json")))["pids"]
db = json.load(open(os.path.join(ROOT, "search-data.json")))
ORDER = ["line", "mv", "cv", "ins", "mel", "spi", "hose"]
KEYS = {}
for t in ORDER:
    for r in db["data"].get(t, []):
        k = norm(r[0])
        if len(k) >= 5 and k not in KEYS: KEYS[k] = (r[0], t)
DWG = {norm(n): n for n in ix}
DWG_TAIL = {}
for k, n in DWG.items():
    if k.startswith("2000"): DWG_TAIL.setdefault(k[4:], []).append(n)
DWG_RE = re.compile(r"^.{3,5}(F\d{2}(PID|PFD)[A-Z]{2}\d{5})$")

def clean(w):   # OCR bracket / slash noise around a tag
    return re.sub(r"^[\(\[\\/|]+|[\)\]\\/|,.;:]+$", "", w)

def match(text):
    k = norm(clean(text))
    if len(k) < 5: return None
    if k in DWG: return (DWG[k], "d")
    m = DWG_RE.match(k)
    if m and len(DWG_TAIL.get(m.group(1), [])) == 1: return (DWG_TAIL[m.group(1)][0], "d")
    if k in KEYS: return KEYS[k]
    return None

# loop number → [(letters, tag, drawings)] for instruments and control valves
BYNUM = {}
for t in ("ins", "cv"):
    for r in db["data"].get(t, []):
        m = re.fullmatch(r"([A-Z]{1,5})(\d{5})([A-Z]{0,2})", norm(r[0]))
        if m: BYNUM.setdefault(m.group(2), []).append((m.group(1), r[0], norm(" ".join(str(x) for x in r if x))))

out, stats = {}, {"d": 0}
for num, d in sorted(ix.items()):
    doc = pymupdf.open(os.path.join(ROOT, d["file"])); own = norm(num); refs = []
    for pno, page in enumerate(doc, 1):
        W, H = page.rect.width, page.rect.height
        words = [(w[0], w[1], w[2], w[3], w[4]) for w in page.get_text("words") if w[4].strip()]
        found = []
        def add(box, hit):
            if not hit or norm(hit[0]) == own: return
            x0, y0, x1, y1 = box
            for f in found:   # the same place from the other text layer (or a joined word): keep one
                b = f[0]
                if f[1][0] == hit[0] and not (x1 < b[0] or x0 > b[2] or y1 < b[1] or y0 > b[3]): return
            found.append(((x0, y0, x1, y1), hit))
        for i, w in enumerate(words):
            add(w[:4], match(w[4]))
            # a tag split over two words on one text line ("2000-F24-PID-PR-" "10020", "HV" "12262")
            if i + 1 < len(words):
                v = words[i + 1]
                if abs(v[1] - w[1]) < 3 and 0 <= v[0] - w[2] < 12:
                    add((w[0], min(w[1], v[1]), v[2], max(w[3], v[3])), match(w[4] + v[4]))
        # bubbles: the loop number, with the letters above it (often misread on scanned sheets). The instruments and
        # control valves listed on this drawing with that number are the candidates; the letters pick between them.
        for n in words:
            m = re.fullmatch(r"[\(\[\\/|]?(\d{5})([A-Z]{0,2})[\)\]\\/|,]?", n[4])
            if not m: continue
            cands = [c for c in BYNUM.get(m.group(1), []) if own in c[2] and (not m.group(2) or c[1].endswith(m.group(2)))]
            if not cands: continue
            nh = n[3] - n[1]
            ocr = re.sub(r"[^A-Z]", "", "".join(w[4] for w in words if 0 <= n[1] - w[3] < nh * 1.3 and w[2] > n[0] and w[0] < n[2]).upper().replace("|", "I"))
            lets = sorted({c[0] for c in cands})
            pick = [l for l in lets if l == ocr] or ([max(lets, key=lambda l: difflib.SequenceMatcher(None, l, ocr).ratio())] if ocr and max(difflib.SequenceMatcher(None, l, ocr).ratio() for l in lets) >= .5 else lets)
            got = list({norm(c[1]): c for c in cands if c[0] in pick}.values())
            box = (n[0] - nh * .3, n[1] - nh * 1.3, n[2] + nh * .3, n[3])
            if len(got) == 1: add(box, KEYS[norm(got[0][1])])
            elif got: add(box, ("|".join(sorted(c[1] for c in got)), "q"))
        for (x0, y0, x1, y1), (tgt, kind) in found:
            refs.append([pno, round(x0 / W * 1e4), round(y0 / H * 1e4), round((x1 - x0) / W * 1e4), round((y1 - y0) / H * 1e4), tgt, kind])
            stats[kind] = stats.get(kind, 0) + 1
    if refs: out[num] = refs
json.dump(out, open(os.path.join(ROOT, "pid-refs.json"), "w"), separators=(",", ":"))
print(len(out), "drawings", stats, os.path.getsize(os.path.join(ROOT, "pid-refs.json")) // 1024, "kB")
