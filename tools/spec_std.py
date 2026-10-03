"""Adds the piping standard drawing 2000-F00-STD-PP-10004 (rubber lined spools, Table D/E, details sheet 1 of 3, Rev 0)
to spec/index.json as std, for the Fittings table in spec.js. The drawing's text is drawn as lines (no text layer), so
its tables are typed in here from the drawing and were checked against it cell by cell.

Usage: python3 tools/spec_std.py   (after tools/spec_branch.py; the redacted drawing is spec/2000-F00-STD-PP-10004.pdf,
       made with python3 tools/redact_docs.py spec/2000-F00-STD-PP-10004.pdf)
Lengths in mm over the flange faces:
  lateral (details 2, 45° and 60°), lateral30 (detail 3), y (detail 7, 60° and 90° wye): {pipe DN: [A, B]}
    A: from the run end to where the branch meets it; B: from there to the other run end, and along the branch
  tee (details 4 and 5): {header DN: {branch DN: [A, B]}}  A: run centre to each run end; B: run centre to the branch
    end (an equal tee has A only)
  reducer (detail 1): straight length A at each end by the larger size, taper B = 1.5 × the largest pipe
  tangential tee (detail 6): C by size; flush port (note 3): optional DN50 at 200 mm up to DN200, 250 mm from DN250
"""
import json, os
ROOT = os.path.join(os.path.dirname(__file__), "..", "spec")
IX = json.load(open(os.path.join(ROOT, "index.json")))
rows = lambda t: {int(r[0]): [int(r[1]), int(r[2])] for r in (x.split() for x in t.strip().splitlines())}
LAT = rows("""80 150 350
90 150 400
100 150 450
125 200 450
150 200 500
200 200 600
250 300 650
300 350 750
350 400 850
400 400 950
450 400 1050
500 450 1150
600 500 1300
750 500 1400
900 500 1600""")
LAT30 = rows("""80 150 550
90 150 600
100 150 600
125 200 700
150 200 750
200 200 900
250 300 1050
300 350 1200
350 400 1300
400 400 1500
450 400 1550
500 450 1670
600 500 1950
750 500 2100
900 500 2500""")
Y = rows("""80 200 300
90 200 300
100 200 350
125 200 350
150 200 400
200 200 450
250 300 500
300 350 600
350 350 650
400 350 700
450 350 750
500 450 800
600 500 950
750 500 1100
900 500 1300""")
BR = [50, 80, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 750, 900]
# header DN: A,B per branch column from DN50 up ("-" none); the last pair on each row is the equal tee (A only)
TEE_T = """50 150,-
80 150,150 175,-
100 150,150 175,150 200,-
125 175,175 175,175 200,175
150 175,175 175,175 200,175 225,-
200 175,200 175,200 200,200 250,225 250,-
250 200,235 200,250 225,250 250,250 275,250 300,-
300 200,275 225,275 225,275 250,275 275,275 300,300 325,-
350 200,300 225,300 225,300 250,300 275,300 300,325 350,325 350,-
400 200,325 225,325 225,325 250,325 275,350 300,350 350,350 375,350 375,-
450 200,350 225,350 250,350 275,350 300,350 325,350 350,375 375,375 425,375 425,-
500 225,375 225,375 250,400 275,400 300,400 325,400 375,400 400,400 425,400 450,425 475,-
600 225,455 225,455 250,455 275,455 300,455 325,455 375,475 400,475 425,475 450,475 475,500 525,-
750 250,525 250,550 250,550 275,550 300,550 325,550 375,550 400,550 425,575 450,575 500,575 550,575 625,-
900 200,625 250,625 250,625 275,625 325,625 350,650 375,650 400,650 425,650 450,650 500,650 550,650 625,700 725,-"""
TEE = {}
for line in TEE_T.splitlines():
    h, *cells = line.split()
    TEE[int(h)] = {BR[k]: [int(a), None if b == "-" else int(b)] for k, c in enumerate(cells) for a, b in [c.split(",")]}
IX["std"] = {"2000-F00-STD-PP-10004": {
    "file": "spec/2000-F00-STD-PP-10004.pdf", "rev": "0", "title": "Piping standards, rubber lined spools, Table D/E, details sheet 1 of 3",
    "lateral": LAT, "lateral30": LAT30, "y": Y, "tee": TEE,
    "reducer": {"A": [[300, 100], [99999, 150]], "B": "1.5 × largest pipe", "note": "Mating to a pump nozzle: dimensions and thickness by engineering calculation (note 2)."},
    "tangential": [[80, 100], [300, 150], [99999, 200]],
    "flush": [[200, 200], [99999, 250]]}}
json.dump(IX, open(os.path.join(ROOT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("tee rows", len(TEE), "lateral", len(LAT), "lateral30", len(LAT30), "y", len(Y))
