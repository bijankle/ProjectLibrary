"""One copy of each word on a sheet. The OCR readings (tools/ocr_all.py: four passes) write each word they read as
invisible text, one small content stream per word ("3 Tr", Helvetica). A later pass skipped a word only when its box
overlapped the earlier copy by half, and an invisible word's box sits a little off the printed letters, so many words
went on two, three or four times; a find on the sheet then drew a box for each copy. This removes the extra copies:
an invisible word goes when the sheet already has the same word (any case) over the same place, drawn text first, then
the first invisible copy. Nothing visible changes.
  python3 tools/dedupe_ocr.py [files…]        (default: every drawing in PIDs/index.json)
"""
import json, os, re, sys
from multiprocessing import Pool
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# an OCR word: "q … BT … /helv <size> Tf 3 Tr … <x> <y> TD|Tm … [(text)|<hex>]TJ ET Q", turned a quarter when it carries
# "0 1 -1 0 0 0 cm"; on its own stream (written after the last redaction) or folded into the sheet's main stream
BLK = re.compile(rb"q\s+(?:0 1 -1 0 0 0 cm\s+)?(?:[\d.]+ w 1 M\s*)?BT\s*((?:(?!BT|ET\s*Q).){0,400}?)ET\s*Q", re.S)
FONT = pymupdf.Font("helv")

def lit(b):   # a PDF string literal's text
    out, i = bytearray(), 0
    while i < len(b):
        c = b[i]
        if c == 92 and i + 1 < len(b):
            n = b[i + 1]; i += 2
            if 48 <= n <= 55:
                j = i - 1; o = b[j:j + 3]; k = 0
                while k < len(o) and 48 <= o[k] <= 55: k += 1
                out.append(int(o[:k], 8) & 255); i = j + k; continue
            out.append({110: 10, 114: 13, 116: 9, 98: 8, 102: 12}.get(n, n)); continue
        out.append(c); i += 1
    return out.decode("latin-1")

def word(m, H):
    """an OCR word's text and its box on the page (top left origin), from the block's matrix, size and text; None if not one"""
    blk, inner = m.group(0), m.group(1)
    if b"/helv" not in inner or b"3 Tr" not in inner: return None
    f = re.search(rb"/helv\s+([\d.]+)\s+Tf", inner); xy = re.search(rb"(-?[\d.]+)\s+(-?[\d.]+)\s+(?:TD|Tm)", inner); tj = re.search(rb"\[(.*)\]\s*TJ", inner, re.S)
    if not (f and xy and tj): return None
    size, tx, ty, raw = float(f.group(1)), float(xy.group(1)), float(xy.group(2)), tj.group(1).strip()
    t = bytes.fromhex(raw[1:-1].decode()).decode("latin-1") if raw[:1] == b"<" else lit(raw[1:-1]) if raw[:1] == b"(" else None
    if not t: return None
    w = FONT.text_length(t, fontsize=size)
    if b"0 1 -1 0 0 0 cm" in blk: x, y = -ty, H - tx; return t, (x - .8 * size, y - w, x + .25 * size, y)   # (turned: reads bottom to top)
    x, y = tx, H - ty; return t, (x, y - .8 * size, x + w, y + .25 * size)

def over(a, b, k=.4):
    x = min(a[2], b[2]) - max(a[0], b[0]); y = min(a[3], b[3]) - max(a[1], b[1])
    return x > 0 and y > 0 and x * y > k * min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))

def one(path):
    d = pymupdf.open(path); gone = 0; skipped = 0
    for p in d:
        H = p.mediabox.height; st = []   # (xref, start, end, text, box), in page order
        for x in p.get_contents():
            s = d.xref_stream(x) or b""
            if b"3 Tr" not in s: continue
            for m in BLK.finditer(s):
                w = word(m, H)
                if w: st.append((x, m.start(), m.end()) + w)
        if not st: continue
        # the sheet's other text, drawn or invisible (a vendor's own OCR layer): any of it counts as the word being there
        keep = []
        for b in p.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for sp in l["spans"]:
                    t = sp["text"].strip()
                    if t and not (sp.get("alpha", 255) == 0 and "Helvetica" in sp["font"]): keep.append((t.upper(), tuple(sp["bbox"])))
        drop = {}
        for x, a0, a1, t, bb in st:
            u = t.strip().upper()
            if any(u == k and over(bb, kb, .3) for k, kb in keep): drop.setdefault(x, []).append((a0, a1)); continue
            keep.append((u, bb))
        for x, cuts in drop.items():
            s = bytearray(d.xref_stream(x))
            for a0, a1 in sorted(cuts, reverse=True): s[a0:a1] = b" "
            d.update_stream(x, bytes(s)); gone += len(cuts)
    if gone:
        tmp = path + ".tmp"; d.save(tmp, garbage=4, deflate=True); d.close(); os.replace(tmp, path)
    return os.path.basename(path), gone, skipped

if __name__ == "__main__":
    files = sys.argv[1:] or [os.path.join(R, v["file"]) for v in json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"].values() if os.path.exists(os.path.join(R, v["file"]))]
    with Pool(os.cpu_count() or 2) as P: res = P.map(one, files)
    print(sum(r[1] for r in res), "extra copies removed on", sum(1 for r in res if r[1]), "sheets;", sum(r[2] for r in res), "pages left alone (copies not paired)")
