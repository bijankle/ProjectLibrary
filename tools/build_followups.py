"""Builds followups.json: the written "Dig deeper" answers for the quiz cards (index.html, FOLLOW UP Q&A).

Usage: python3 tools/build_followups.py <folder of batch files>      (then python3 tools/sanitize.py)
Each batch file is a JSON array [{"i": card index, "f": [level 1 nodes]}]. A node is {"q", "a", "s", "f"}: the card's
3 starter questions (cards.js "f", verbatim and in order) answered; under each, 3 more questions answered; under each of
those, 3 questions only (strings), which Gemini answers when tapped. "s" is the source label the app shows ("plant docs",
"docs + general", "general knowledge", "not covered"). Answers were written from facts.js, the glossary, the cards and
the source documents, under the same rules the live tutor follows (ai.js SYSTEM).
Output: {card question: [level 1 nodes]}; cards whose starter questions changed since are left out (Gemini answers them).
"""
import glob, json, os, re, subprocess, sys
ROOT = os.path.join(os.path.dirname(__file__), "..")
cards = json.loads(subprocess.run(["node", "-e", "global.window={};const fs=require('fs');eval(fs.readFileSync(process.argv[1],'utf8').replace(/^const /mg,'var '));"
                                   "console.log(JSON.stringify(CARDS.map(c=>({q:c.q,f:c.f||[]}))))", os.path.join(ROOT, "cards.js")],
                                  capture_output=True, text=True, check=True).stdout)
# (no dashes in the app's prose; the site's town named as "site", as tools/sanitize.py does)
tidy = lambda t: re.sub(r"\bKalgoorlie (winter|summer) (\w+)", lambda m: m[1].capitalize() + " " + m[2] + " on site",
                        re.sub(r"[ \t]*[–—][ \t]*", ", ", t)).strip()
def node(n):
    out = {"q": n["q"].strip(), "a": tidy(n["a"]), "s": n["s"]}
    out["f"] = [node(x) if isinstance(x, dict) else x.strip() for x in n.get("f", [])]
    return out
out, skipped = {}, 0
for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.json"))):
    for c in json.load(open(f)):
        card = cards[c["i"]]
        if [n["q"] for n in c["f"]] != card["f"]: skipped += 1; continue
        out[card["q"]] = [node(n) for n in c["f"]]
json.dump(out, open(os.path.join(ROOT, "followups.json"), "w"), ensure_ascii=False, separators=(",", ":"))
n2 = sum(len(n["f"]) for v in out.values() for n in v)
print(len(out), "of", len(cards), "cards,", sum(map(len, out.values())) + n2, "answers;", skipped, "skipped;",
      round(os.path.getsize(os.path.join(ROOT, "followups.json")) / 1e6, 2), "MB")
