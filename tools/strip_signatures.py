"""Digital signature fields and signed names off every drawing in the app. A signed issue carries Adobe signature
fields (form widgets, /FT /Sig) whose appearance shows the signer's signature, "Digitally signed by <name>" and the
date, and whose value holds the signer's details; tools/redact_docs.py cleared stamps and markups but not form widgets,
and the drawings' text reading (tools/ocr_all.py) then copied the name into the text layer. Here, for each page: every
widget's place is truly redacted (text, including the reading's copy, and image pixels), the widgets go and the
document's form (/AcroForm) with them; and a "SIGNED: <name>" line in a scanned title block is blacked out to the end
of its line. Marked "sigclear" in the PDF keywords.
   python3 tools/strip_signatures.py [files…]   (default: every file in PIDs/index.json)
"""
import json, os, re, sys
import pymupdf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WHITE = (1, 1, 1)
def strip(doc):
    n = 0
    for pg in doc:
        rs = [pymupdf.Rect(w.rect) for w in (pg.widgets() or [])]
        for w in list(pg.widgets() or []): pg.delete_widget(w); n += 1
        # (any widget left that PyMuPDF doesn't list as a field: by its subtype)
        for a in list(pg.annots(types=[pymupdf.PDF_ANNOT_WIDGET]) or []): rs.append(pymupdf.Rect(a.rect)); pg.delete_annot(a); n += 1
        ws = pg.get_text("words")
        for i, w in enumerate(ws):   # "Digitally signed by <name>" read off a stamp, wherever it sits
            if re.fullmatch(r"Digitall?y", w[4], re.I) or (re.fullmatch(r"SIGNED:?", w[4]) and w[4].isupper()):
                line = [x for x in ws if abs(x[1] - w[1]) < 4 and w[0] - 2 <= x[0] < w[0] + 420]
                rs.append(pymupdf.Rect(min(x[0] for x in line), min(x[1] for x in line), max(x[2] for x in line), max(x[3] for x in line)) + (-2, -2, 2, 2)); n += 1
        for r in rs: pg.add_redact_annot(r + (-3, -3, 3, 3), fill=WHITE)
        if rs: pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    cat = doc.pdf_catalog()
    if doc.xref_get_key(cat, "AcroForm")[0] != "null": doc.xref_set_key(cat, "AcroForm", "null"); n += 1
    return n
if __name__ == "__main__":
    fs = sys.argv[1:] or [v["file"] for v in json.load(open(os.path.join(R, "PIDs", "index.json")))["pids"].values()]
    done = 0
    for f in fs:
        p = os.path.join(R, f) if not os.path.isabs(f) else f
        if not os.path.exists(p) or not p.lower().endswith(".pdf"): continue
        doc = pymupdf.open(p); n = strip(doc)
        if not n: doc.close(); continue
        kw = (doc.metadata or {}).get("keywords") or ""
        doc.set_metadata({"keywords": (kw + " sigclear").strip()})
        tmp = p + ".tmp"; doc.save(tmp, garbage=4, deflate=True, clean=True); doc.close(); os.replace(tmp, p); done += 1
        print("cleared", os.path.basename(p), n)
    print(done, "files cleared")
