"""The client's red review stamps on electrical drawings (Approved / Approved as Noted / Not Approved / For Information
Only, then a row with the reviewer's name, signature and date): that signer row cleared to white, whatever it is drawn
as (text, line art or a picture). Also the plot stamp's file path printed along an edge of the sheet (L:\\Projects\\... with the drafter's
folders) cleared. Marked "stampclear" and "pathclear" in the PDF keywords; a rerun skips it.

  python3 tools/clear_stamps.py [files…]      (default: every PDF in SLDs/; then tools/build_pics.py)
"""
import glob, os, re, sys
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def rows(p):
    """the signer row of each stamp on the page"""
    ws = p.get_text("words"); out = []
    for i, w in enumerate(ws):
        if w[4] != "Only" or i == 0 or ws[i - 1][4] != "Information": continue
        near = [v for v in ws if abs(v[1] - w[1]) < 80 and abs(v[0] - w[0]) < 160]
        if not any(v[4] in ("Noted", "Approved") for v in near): continue
        x0 = ws[i - 1][0] - 30
        box = [v for v in ws if abs((v[1] + v[3]) / 2 - (w[1] + w[3]) / 2) < 4 and v[0] > w[2] and v[0] - w[2] < 120]
        x1 = (max(v[2] for v in box) if box else w[2] + 70) + 8
        below = sorted(v[1] for v in ws if v[1] > w[3] + 4 and v[1] - w[3] < 60 and x0 < v[0] < x1 and re.fullmatch(r"(DOES|ACCEPTANCE|THIS|NOTE:?|APPROVAL)", v[4]))
        y1 = (below[0] - 1) if below else w[3] + 30
        out.append(pymupdf.Rect(x0, w[3] + 1.5, x1, y1))
    return out

def clear(path):
    d = pymupdf.open(path)
    kw = d.metadata.get("keywords") or ""
    if "stampclear" in kw and "pathclear" in kw: return "done before"
    n = 0
    for p in d:
        if "stampclear" not in kw:
            for r in rows(p): p.add_redact_annot(r, fill=(1, 1, 1)); n += 1
        # (the plot stamp: the CAD file's path, with the client's and drafter's folder names and the plotting machine,
        # printed along any edge of the sheet)
        W, H = p.rect.width, p.rect.height
        for b in p.get_text("blocks"):
            edge = b[1] > H * .965 or b[3] < H * .035 or b[2] < W * .035 or b[0] > W * .965
            if edge and re.search(r"[A-Z]:\\|\\Projects\\|\.DWG\b", b[4], re.I): p.add_redact_annot(pymupdf.Rect(b[:4]) + (-1, -1, 1, 1), fill=(1, 1, 1)); n += 1
        p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    md = d.metadata or {}; md["keywords"] = " ".join(dict.fromkeys(((md.get("keywords") or "") + " stampclear pathclear").split())); d.set_metadata(md); d.saveIncr()
    return f"{n} cleared" if n else "none"

if __name__ == "__main__":
    from collections import Counter; c = Counter()
    for f in sys.argv[1:] or sorted(glob.glob(os.path.join(R, "SLDs", "*.pdf"))):
        s = clear(f); c["cleared" if s.endswith("cleared") else s] += 1
        if s.endswith("cleared"): print(s, os.path.basename(f))
    print(dict(c))
