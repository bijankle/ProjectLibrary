"""The current revision of each document as the project document register has it (sources/register/, newest file:
tools/reg_import.py writes it from the 2000 Project Document Register workbook). The register keeps one row per number:
  a drawing with an as-built markup set (NUMBER_MS, usually marked "**SUPERSEDED BY …_MS**") is at that set's
    issue (the number's own row may not say so yet); one superseded by its as-built markup set ("**SUPERSEDED BY 2000-F13-PID-PR-10002_MS**") is at that set's
    issue: NUMBER_MS rev 1 is MS_1, the file NUMBER_MS_1.pdf
  a number superseded by another number is marked so ("by": the number that replaced it)
  a cancelled one (CAN) is marked cancelled
  else its own row's revision
Redline / greenline markups (-RLM1, -GLM1, _MS-RLM1) are rows of their own and change nothing here. Each entry's link is
the register's own hyperlink for that row, else the SharePoint file list's file of that revision (tools/doclist.py).
   from reglatest import current, base      current() -> {key: {"n", "rev", "st", "url", "title", "by", "can"}}
   base(rev): a markup's revision as the issue it marks up (MS-RLM1_1 -> MS_1, 1-RLM2 -> 1)
"""
import glob, os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.environ.get("KCGM_PRIVATE") or os.path.join(os.path.dirname(R), "projectlibraryprivate")
nk = lambda s: re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
def base(rev):
    r = str(rev or "").strip().upper(); r = re.sub(r"[-_](?:RLM|GLM)\d*", "", r); return r
_C = None
def current():
    global _C
    if _C is not None: return _C
    import openpyxl
    rf = max(glob.glob(os.path.join(RP, "sources", "register", "*.xls[xm]")), key=os.path.getmtime)
    rows = {}
    for r in openpyxl.load_workbook(rf, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True, min_row=2):
        r = ["" if c is None else str(c).strip() for c in r]
        if len(r) < 7 or not r[3]: continue
        rows[r[3].upper()] = {"url": r[1] if r[1].startswith("http") else "", "rev": r[4], "st": r[5].upper(), "title": r[6]}
    try:
        import sys; sys.path.insert(0, os.path.join(R, "tools")); import doclist; doclist.latest(); F = doclist.FILES; L = doclist.latest()
    except Exception: F, L = {}, {}
    def fileurl(num, rev):   # the SharePoint file of that number and revision, from the library's file list
        d = L.get(nk(num))
        if d and base(d["rev"]) == base(rev): return d["url"]
        return ""
    out = {}
    for num, x in rows.items():
        if re.search(r"(_MS|-RLM\d*|-GLM\d*|_MS-RLM\d*)$", num): continue   # (markups and markup sets: read through their drawing)
        e = {"n": num, "rev": x["rev"], "st": x["st"], "url": x["url"], "title": re.sub(r"^\*\*.*?\*\*\s*", "", x["title"]), "by": "", "can": x["st"] == "CAN"}
        m = re.search(r"SUPERSEDED BY\s+([A-Z0-9][A-Z0-9_.\\/-]+)", x["title"].upper())
        to = m.group(1).rstrip("*.") if m else ""; ms = rows.get(num + "_MS")
        # (an as-built set filed for the number is its latest issue, whether or not the number's own row says superseded)
        if ms and (not to or to == num + "_MS"):
            e.update(rev="MS_" + (ms["rev"] or "0").lstrip("_"), st=ms["st"], url=ms["url"] or fileurl(num, "MS_" + ms["rev"]))
        elif to and to != num: e["by"] = re.sub(r"_MS$", "", to.replace("\\", "-"))
        if not e["url"]: e["url"] = fileurl(num, e["rev"])
        # (an issue the register has received but the library hasn't filed yet: the latest filed file, and its revision)
        if not e["url"] and L.get(nk(num)): e["alt"], e["altrev"] = L[nk(num)]["url"], L[nk(num)]["rev"]
        out[nk(num)] = e
    _C = out; return out
if __name__ == "__main__":
    C = current(); print(len(C), "documents;", sum(1 for v in C.values() if v["rev"].startswith("MS")), "at an as-built set;", sum(1 for v in C.values() if v["by"]), "superseded by another number;", sum(1 for v in C.values() if v["can"]), "cancelled;", sum(1 for v in C.values() if not v["url"]), "with no link")
    for k in ("2000F13PIDPR10004", "2000F24PIDPR10033", "2000F66PIDPR10006", "2000F81PIDPR10001"): print(C.get(k))
