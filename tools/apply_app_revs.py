"""Writes the revisions read off the combined set's title blocks (tools/app_revs_read.json) into PIDs/index.json, for
drawings that have none recorded: "rev", or "legacy" (the older drawing the app holds, renumbered later: no 2000 issue).
   python3 tools/apply_app_revs.py"""
import json, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = json.load(open(os.path.join(R, "tools", "app_revs_read.json"))); D = json.load(open(os.path.join(R, "PIDs", "index.json"))); n = 0
for k, v in A.items():
    e = D["pids"].get(k)
    if not e or str(e.get("rev", "")).strip(): continue
    if isinstance(v, dict): e["legacy"] = v["legacy"]
    else: e["rev"] = v
    n += 1
json.dump(D, open(os.path.join(R, "PIDs", "index.json"), "w"), indent=1, ensure_ascii=False); print(n, "drawings given their revision")
