"""White redaction of everything on the drawings and documents that isn't technical.

Usage: python3 tools/redact_docs.py [files…]      (default: every drawing in PIDs/ and PFDs/, the PDC and the pipe spec)
Then rerun tools/build_pid_refs.py and tools/build_offline.py, and bump the documents cache in sw.js.

Drawings (P&IDs, PFDs, the two layouts): everything outside the drawing frame and the whole title band along the bottom
(title block, revision table, reference drawings, logos, drawing number) goes white; so do the red project stamps and
the Docusign line on the older sheets. Inside the drawing, company and project names become their role (tools/sanitize.py)
and Fimiston becomes FIM, printed in place. The app shows each drawing's number and a generic title above the sheet.
Documents (PDC, pipe spec): each page's header and footer bands go white (logo, project name, document number), as do
the cover sheet's title and approval blocks; names in the text become roles, as above.
Everything is removed, not covered: text under a white box is deleted and images under it blanked.
"""
import glob, os, re, sys
import pymupdf
sys.path.insert(0, os.path.dirname(__file__)); from sanitize import clean

ROOT = os.path.join(os.path.dirname(__file__), "..")
WHITE = (1, 1, 1)
# whole words (or word pairs) that name a company, the project or the site
NAME = re.compile(r"^(KCGM|NSR|PRIMERO|PRIMEO|MINPROC|WORLEY|DRA|OMC|DOCUSIGN|FIMISTON|GIDJI|KALGOORLIE|23517)$", re.I)
PAIR = re.compile(r"^(NORTHERN STAR|CONSOLIDATED GOLD|GOLD MINES)$", re.I)

def red(page): return lambda c: c and c[0] > .55 and c[1] < .45 and c[2] < .45

def frame(page):
    """(left, top, right, band top, bottom) of the drawing frame, from its long border lines."""
    W, H = page.rect.width, page.rect.height; hs, vs = [], []; segs = {}
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1], it[2]
                if abs(a.y - b.y) < 1 and a.y > H * .84: segs.setdefault(round(a.y), []).append((min(a.x, b.x), max(a.x, b.x)))
                if abs(a.y - b.y) < 1 and abs(a.x - b.x) > W * .85: hs.append(a.y)   # border lines run (nearly) the whole sheet
                if abs(a.x - b.x) < 1 and abs(a.y - b.y) > H * .8: vs.append(a.x)
            elif it[0] == "re":
                r = it[1]
                if r.width > W * .85: hs += [r.y0, r.y1]
                if r.height > H * .8: vs += [r.x0, r.x1]
    # the border sits within 5% of the sheet's edge (a long pipe line further in is drawing, not border); the title
    # band's top line is in the bottom 16%
    L = max([x for x in vs if x < W * .05], default=W * .015); R = min([x for x in vs if x > W * .95], default=W * .985)
    T = max([y for y in hs if y < H * .05], default=H * .015); B = min([y for y in hs if y > H * .95], default=H * .985)
    # (a band line drawn in pieces counts when the pieces together cross most of the sheet)
    for y, ps in segs.items():
        ps.sort(); cov, end = 0, -1
        for x0, x1 in ps:
            if x1 > end: cov += x1 - max(x0, end); end = x1
        if cov > W * .85: hs.append(y)
    band = min([y for y in hs if H * .84 < y < B - 10], default=B)
    return L, T, R, band, B

def stamps(page, band):
    """The red project stamps: a red box whose top left corner sits just above and left of the words (KCGM) GROWTH
    PROJECT. Its left and top borders are found next to those words, then followed right and down to the box's
    corners, so a legend or note butting against the stamp stays."""
    out, words = [], page.get_text("words")
    for hit in page.search_for("GROWTH PROJECT"):
        if hit.y1 > band or any(o.intersects(hit) for o in out): continue
        x0 = min([w[0] for w in words if abs(w[1] - hit.y0) < 4 and hit.x0 - 90 < w[2] <= hit.x0 + 2] + [hit.x0])   # the KCGM before it
        clip = pymupdf.Rect(x0 - 30, hit.y0 - 30, x0 + 700, min(band + 4, hit.y1 + 400)) & page.rect
        Z = 2; pix = page.get_pixmap(clip=clip, matrix=pymupdf.Matrix(Z, Z), colorspace=pymupdf.csRGB, alpha=False)   # 2 px a point: thin borders show
        w, h, n, sm, st = pix.width, pix.height, pix.n, pix.samples, pix.stride
        def R(x, y):
            if not (0 <= x < w and 0 <= y < h): return False
            i = y * st + x * n; return sm[i] > 150 and sm[i] - sm[i + 1] > 55 and sm[i] - sm[i + 2] > 55
        ax, ay, ah, aw = int((x0 - clip.x0) * Z), int((hit.y0 - clip.y0) * Z), int(hit.height * Z), int((hit.x1 - x0) * Z)
        # (the words' box can take in the border itself, so the search starts inside it; a border is a near solid line,
        # the letters' strokes are not)
        T = next((y for y in range(ay + ah // 3, max(-1, ay - 40), -1) if sum(R(x, y) for x in range(ax, ax + aw)) >= aw * .8), None)
        L = T is not None and next((x for x in range(ax + ah // 4, max(-1, ax - 50), -1) if sum(R(x, y) for y in range(T, T + ah)) >= ah * .85), None)
        if L in (None, False) or T is None: out.append(pymupdf.Rect(x0, hit.y0, hit.x1, hit.y1) + (-4, -4, 4, 4)); continue
        def run(x, y, dx, dy):   # follow a red line (1 px either side, gaps up to 4 px)
            gap = 0
            while 0 <= x < w and 0 <= y < h and gap <= 8:
                on = any(R(x + k * dy, y + k * dx) for k in (-1, 0, 1)); gap = 0 if on else gap + 1; x += dx; y += dy
            return x - dx * (gap + 1), y - dy * (gap + 1)
        Rt = run(L, T, 1, 0)[0]; Bt = run(L, T, 0, 1)[1]
        out.append(pymupdf.Rect(clip.x0 + L / Z - 3, clip.y0 + T / Z - 3, clip.x0 + Rt / Z + 3, clip.y0 + Bt / Z + 3))
    return out

def redbox(page, hit, band, dark=False):
    """The red box drawn round some words (a revision and sign off table, an acceptance stamp): from the nearest red
    line left of them, followed up and down to the box's top and bottom, and along its top edge both ways."""
    clip = pymupdf.Rect(hit.x0 - 700, hit.y0 - 300, hit.x1 + 700, min(band + 4, hit.y1 + 300)) & page.rect
    Z = 2; pix = page.get_pixmap(clip=clip, matrix=pymupdf.Matrix(Z, Z), colorspace=pymupdf.csRGB, alpha=False)
    w, h, n, sm, st = pix.width, pix.height, pix.n, pix.samples, pix.stride
    def R(x, y):
        if not (0 <= x < w and 0 <= y < h): return False
        i = y * st + x * n
        return (sm[i] < 90 and sm[i + 1] < 90 and sm[i + 2] < 90) if dark else (sm[i] > 150 and sm[i] - sm[i + 1] > 55 and sm[i] - sm[i + 2] > 55)
    ax, ay, ah = int((hit.x0 - clip.x0) * Z), int((hit.y0 - clip.y0) * Z), max(4, int(hit.height * Z))
    L = next((x for x in range(ax - 1, max(-1, ax - 400), -1) if sum(R(x, y) for y in range(ay, ay + ah)) >= ah * .85), None)
    if L is None: return None
    def run(x, y, dx, dy):
        gap = 0
        while 0 <= x < w and 0 <= y < h and gap <= 8:
            on = any(R(x + k * dy, y + k * dx) for k in (-1, 0, 1)); gap = 0 if on else gap + 1; x += dx; y += dy
        return x - dx * (gap + 1), y - dy * (gap + 1)
    T = run(L, ay, 0, -1)[1]; B = run(L, ay, 0, 1)[1]
    # a red table's rows can stick out past its top edge (take the wider); a black box's top line can carry on into
    # the drawing (take the edge its top and bottom share)
    ext = min if dark else max; ins = max if dark else min
    Rt = ext(run(L, T, 1, 0)[0], run(L, B, 1, 0)[0]); Lt = ins(run(L, T, -1, 0)[0], run(L, B, -1, 0)[0])
    # then up and down the outer left border, so a stamp found from one of its rows is taken whole
    if not dark:
        Lx = int(Lt) + 1; T = min(T, run(Lx, T, 0, -1)[1]); B = max(B, run(Lx, B, 0, 1)[1])
    if Rt - Lt < 20 or B - T < 10: return None
    return pymupdf.Rect(clip.x0 + Lt / Z - 3, clip.y0 + T / Z - 3, clip.x0 + Rt / Z + 3, clip.y0 + B / Z + 3)

# words that sit inside a red box to go: revision and sign off tables (their TECH APP column), acceptance stamps
BOXED = ["TECH APP", "ACCEPTANCE DOES NOT", "Approved as Noted", "AS CONSTRUCTED", "NO CHANGE"]
# a drafting company's logo block in the bottom right corner, just above the band: from its name to the corner
LOGO = re.compile(r"(?i)^(WILSHAW|SEDGMAN|JMD|.*jmdengineering.*)$")
BOXED_DARK = ["CLIENT APPROVED"]   # (the old sheets' client sign off box, drawn in black)
# scanned sheets whose logo block the text layer can't read (a picture, misread by OCR): the block's place on the sheet,
# as fractions of its width and height (left, top, right, bottom)
SCAN_LOGO = {n: (.80, .84, .995, .95) for n in ("2000-F75-PID-PR-40022", "2000-F75-PID-PR-40023", "2000-F75-PID-PR-40024", "2000-F75-PID-PR-40025")}
# the piping standard drawing: its client approval stamp (with the logo) and the sign off strokes left in the title band
SCAN_LOGO["2000-F00-STD-PP-10004"] = [(.655, .72, .762, .862), (0, .872, 1, 1)]

def names(page, clip=None):
    """Company, project and site names as words: [(rect, replacement text)]."""
    ws = [w for w in page.get_text("words", clip=clip) if w[4].strip()]; hits = []
    for i, w in enumerate(ws):
        t = re.sub(r"^[\W_]+|[\W_]+$", "", w[4])
        if NAME.match(t): hits.append((pymupdf.Rect(w[:4]), t))
        elif re.search(r"(?i)fimiston|primero|kcgm|northern.?star|kalgoorlie|gidji|23517|consolidated", w[4]):   # (inside a longer word: a file name, a tag)
            hits.append((pymupdf.Rect(w[:4]), w[4]))
        if i + 1 < len(ws):
            v = ws[i + 1]
            if PAIR.match(t + " " + re.sub(r"[\W_]+$", "", v[4])) and abs(v[1] - w[1]) < 3: hits.append((pymupdf.Rect(w[:4]) | pymupdf.Rect(v[:4]), t + " " + v[4]))
    return hits

def replace(page, hits, fill=WHITE):
    """White out each name and print its replacement (role / FIM) in the same place, once per place."""
    done = []
    for r, t in hits:
        if any(abs(r.x0 - d.x0) < 3 and abs(r.y0 - d.y0) < 3 for d in done): continue
        done.append(r); page.add_redact_annot(r, fill=fill)   # (documents: no box, the cell keeps its shading)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    seen = []
    for r, t in hits:
        if any(abs(r.x0 - d.x0) < 3 and abs(r.y0 - d.y0) < 3 for d in seen): continue
        seen.append(r); new = clean(" " + t + " ").strip()
        new = re.sub(r"(?i)[_-]?(KCGM|23517)[_-]?(?=\w)|[_-]?(KCGM|23517)\b|\bconsolidated\b", lambda m: "_" if m.group(0)[:1] == "_" and m.group(0)[-1:] == "_" else "", new).strip("_- ")
        # capitals only where the name was a spelt out word in capitals (PRIMERO, NORTHERN STAR), not an acronym (KCGM)
        new = re.sub(r"(?i)^(owner|engineer|consultant)$", lambda m: m[0].upper() if t.isupper() and len(re.sub(r"\W", "", t)) > 4 else m[0].capitalize(), new)
        if not new or new.lower() in ("docusign",): continue
        vert = r.height > r.width * 1.5 and len(t) > 2
        # sized to the letters it replaces: cap height from the box, and never wider than the word was
        fs = (r.width if vert else r.height) * .8; room = r.height if vert else r.width
        fs = max(3, min(fs, fs * room / max(1, pymupdf.get_text_length(new, "helv", fs)) * (1.6 if len(new) < len(t) else 1)))
        fs = min(fs, (r.width if vert else r.height) * .75)
        try:
            if vert: page.insert_text((r.x1 - fs * .25, r.y1), new, fontsize=fs, fontname="helv", rotate=90)
            else: page.insert_text((r.x0, r.y1 - fs * .22), new, fontsize=fs, fontname="helv")
        except Exception: pass

def drawing(doc, base=""):
    for page in doc:
        W, H = page.rect.width, page.rect.height; L, T, R, band, B = frame(page)
        boxes = [pymupdf.Rect(0, 0, W, T), pymupdf.Rect(0, 0, L, H), pymupdf.Rect(R, 0, W, H), pymupdf.Rect(0, band, W, H)] + stamps(page, band)
        bx = SCAN_LOGO.get(base, []); bx = [bx] if bx and not isinstance(bx[0], (list, tuple)) else bx
        boxes += [pymupdf.Rect(W * x0, H * y0, W * x1, H * y1) for x0, y0, x1, y1 in bx]
        for k in BOXED + BOXED_DARK:
            for hit in page.search_for(k):
                if hit.y1 < band and not any(b.contains(hit) for b in boxes):
                    b = redbox(page, hit, band, k in BOXED_DARK)
                    if b and b.width < W * .5 and b.height < H * .4: boxes.append(b)
        for w in page.get_text("words"):
            if LOGO.match(w[4]) and w[1] > band - H * .15 and w[0] > W * .5:
                h = max(w[3] - w[1], 8); boxes.append(pymupdf.Rect(w[0] - h * 4, w[1] - h * 1.2, R, band))
        # an older vendor title block left inside the drawing (DRAWN / DESIGNED / CHECKED rows), found by the whole word
        for w in page.get_text("words"):
            hit = pymupdf.Rect(w[:4])
            if w[4] == "DRAWN" and hit.y1 < band and not any(b.contains(hit) for b in boxes):
                b = redbox(page, hit, band, True)
                if b and b.width < W * .4 and b.height < H * .2: boxes.append(b)
        boxes += [r + (-2, -2, 2, 2) for r in page.search_for("Docusign Envelope ID")]
        # sign off stamps, initials and signatures added as annotations (a redaction box leaves those): any stamp, and any
        # markup that sits where something is whited out
        for a in list(page.annots() or []):
            if a.type[1] == "Stamp" or any(a.rect.intersects(b) for b in boxes): page.delete_annot(a)
        for b in boxes: page.add_redact_annot(b, fill=WHITE)
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED)
        replace(page, names(page))

def whiteout(page, boxes, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED):
    for b in boxes: page.add_redact_annot(b, fill=WHITE)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS, graphics=graphics)

def spec(doc):
    """The pipe spec: header and footer bands on every page; on the datasheets everything above the item's own title
    bar (datasheet title, document and project numbers, logo, revision and sign off table)."""
    for page in doc:
        W, H = page.rect.width, page.rect.height; ws = page.get_text("words"); boxes = [pymupdf.Rect(0, H * .94, W, H)]
        head = next((w for w in ws if w[4] == "Approved" and w[1] < H * .25), None)
        if head:   # a datasheet: its title bar starts with the item code, at the left, below the sign off table
            ti = next((k for k, w in enumerate(ws) if w[4] == "Title" and w[1] < head[1]), None)
            code = ws[ti + 1][4] if ti is not None and ti + 1 < len(ws) and ws[ti + 1][4] != ":" else (ws[ti + 2][4] if ti is not None and ti + 2 < len(ws) else None)
            vals = [w for w in ws if w[1] < head[1] and abs(w[1] - ws[ti][1]) < 3 and w[0] > ws[ti][2] + 4] if ti is not None else []
            code = vals[-1][4] if vals else None
            nxt = [w for w in ws if w[1] > head[3] + 2 and w[0] < W * .14 and w[4] == code]
            if nxt:   # the bar's first line of text can sit above the code (it is centred in the bar)
                c = nxt[0]; top = min([c[1]] + [w[1] for w in ws if w[0] > c[2] and c[1] - 16 < w[1] <= c[1]])
            else: top = head[3] + 60
            boxes.append(pymupdf.Rect(0, 0, W, top - 6))
        else: boxes.append(pymupdf.Rect(0, 0, W, H * .068))
        whiteout(page, boxes); replace(page, names(page), fill=False)

def pdc(doc):
    """The PDC: the cover and the disclaimer page go; on the rest the running header, the Client / Project / Document
    rows and the footer (logo, page count)."""
    for i, page in enumerate(doc):
        W, H = page.rect.width, page.rect.height; ws = page.get_text("words")
        if i < 2: whiteout(page, [page.rect], pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED); continue
        boxes = [pymupdf.Rect(0, H * .955, W, H)]
        boxes += [pymupdf.Rect(0, w[1] - 1, W * .62, w[3] + 1) for w in ws if w[4] in ("Client", "Project", "Document") and w[0] < W * .12 and w[1] < H * .15]
        boxes += [pymupdf.Rect(0, 0, W * .5, w[3] + 2) for w in ws if w[4] == "PROCESS" and w[1] < H * .06]
        whiteout(page, boxes); replace(page, names(page), fill=False)

DOCS = {"2000-F00-DCR-PR-10002": pdc, "pvs": spec}

def run(path, out=None):
    doc = pymupdf.open(path); base = os.path.splitext(os.path.basename(path))[0]
    if base in DOCS: DOCS[base](doc)
    else: drawing(doc, base)
    doc.set_metadata({}); doc.del_xml_metadata()
    # page level XMP and named destinations can carry the CAD file path (project folder, site name): drop them too
    for pg in doc: doc.xref_set_key(pg.xref, "Metadata", "null")
    for pg in doc:   # markup notes kept: their author (a person's name) goes
        for a in list(pg.annots() or []):
            for k in ("T", "Subj"): doc.xref_set_key(a.xref, k, "null")
    cat = doc.pdf_catalog()
    if doc.xref_get_key(cat, "Names")[0] != "null": doc.xref_set_key(cat, "Names", "null")
    tmp = (out or path) + ".tmp"; doc.save(tmp, garbage=4, deflate=True, clean=True); doc.close(); os.replace(tmp, out or path)

def titles():
    """The app shows each drawing's number and a short generic title (tools/titles.json, written from the sheets'
    title blocks with project and client names left out) in place of the title block that is now white."""
    import json
    ixp = os.path.join(ROOT, "PIDs", "index.json"); ix = json.load(open(ixp)); T = json.load(open(os.path.join(os.path.dirname(__file__), "titles.json")))
    for n, d in ix["pids"].items():
        if n in T: d["title"] = T[n]
        d.pop("from", None); d.pop("status", None)   # (the source upload's file name and the issue status came from the title block)
    json.dump(ix, open(ixp, "w"), indent=1)

if __name__ == "__main__":
    titles()
    if sys.argv[1:] == ["--titles"]: sys.exit()
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "PIDs", "*.pdf")) + glob.glob(os.path.join(ROOT, "PFDs", "*.pdf"))) + [os.path.join(ROOT, "spec", "pvs.pdf")]
    for f in files: run(f); print("redacted", os.path.basename(f))
