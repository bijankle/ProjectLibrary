"""Builds pfd-layout-data.js: where each Smart PFD item sits on the real plant, for the Layout view (pfd-layout.js).

Positions are read off the two layout drawings and converted to latitude / longitude:
  fim2 = 2000-F00-DRG-GE-10100 Rev 0, General Fimiston Site General Arrangement (new plant), A1 at 1:1750
  fim1 = 2000-F00-DRG-GE-20001 Rev 2, Fimiston Process Plant Overall Plant Layout (old plant), A3 print
Each sheet is tied to the ground by a similarity fit (scale, rotation, shift) through three surveyed points taken from
Google Maps: the flotation tails thickener centre, the new crushed ore stockpile 2 dome and the existing Fimiston COS
dome. Fit residuals are about 3 m on FIM 2 and 3.5 m on FIM 1; the fitted scale agrees with the drawing scale within 1 %.
Usage: python3 tools/build_layout.py
"""
import json, math, os
ANCHORS = {  # name: (lat, lng) from Google Maps, and the same point in PDF points on each sheet
    "tails thickener": ((-30, 45, 52.0), (121, 30, 39.6), {"fim2": (871, 577), "fim1": (451, 327)}),
    "COS 2 dome": ((-30, 45, 47.6), (121, 30, 29.1), {"fim2": (417, 801), "fim1": (228.5, 437)}),
    "Fimiston COS dome": ((-30, 45, 58.0), (121, 30, 29.5), {"fim2": (836, 1093), "fim1": (428, 591)}),
}
def deg(d): return math.copysign(abs(d[0]) + d[1] / 60 + d[2] / 3600, d[0])
LAT0, LON0 = deg(ANCHORS["COS 2 dome"][0]), deg(ANCHORS["COS 2 dome"][1])
MY = 111132.954 - 559.822 * math.cos(2 * math.radians(LAT0)); MX = 111412.84 * math.cos(math.radians(LAT0))
def en(lat, lng): return complex((lng - LON0) * MX, (lat - LAT0) * MY)
def fit(sheet):
    Z = [en(deg(a[0]), deg(a[1])) for a in ANCHORS.values()]; W = [complex(a[2][sheet][0], -a[2][sheet][1]) for a in ANCHORS.values()]
    mw, mz = sum(W) / len(W), sum(Z) / len(Z)
    a = sum((w - mw).conjugate() * (z - mz) for w, z in zip(W, Z)) / sum(abs(w - mw) ** 2 for w in W)
    return a, mz - a * mw, max(abs(a * w + mz - a * mw - z) for w, z in zip(W, Z))
TF = {s: fit(s) for s in ("fim1", "fim2")}
def ll(sheet, x, y):
    a, b, _ = TF[sheet]; z = a * complex(x, -y) + b
    return [round(LAT0 + z.imag / MY, 7), round(LON0 + z.real / MX, 7)]

# id: (sheet, x, y, shape, est)   shape: ("c", radius_m) circle, ("r", w_m, h_m) rectangle along the plant grid, None = small dot
# est: 1 = position estimated (not identified on either drawing)
P = {  # id: (sheet, x, y, shape, est)
 # crushing and stockpiles (FIM 1)
 "rom": ("fim2", 612, 1341, None, 1), "pc1": ("fim1", 425, 712, ("r", 20, 20), 0), "cos1": ("fim1", 428, 591, ("c", 31), 0),
 "pc2": ("fim1", 221, 641, ("r", 22, 22), 0), "cos2": ("fim2", 417, 801, ("c", 40), 0),
 "fimsag": ("fim1", 495, 477, ("r", 12, 20), 0), "fimpeb": ("fim1", 470, 470, None, 1), "peb": ("fim1", 348, 446, ("r", 18, 14), 0),
 # milling, gravity (FIM 2)
 "sag": ("fim2", 961, 761, ("r", 12, 20), 0), "dscr": ("fim2", 985, 762, None, 0), "cfh": ("fim2", 978, 735, None, 1),
 "cyc": ("fim2", 919, 708, ("c", 5), 0), "bm": ("fim2", 960, 799, ("r", 10, 22), 0), "trash": ("fim2", 918, 725, ("r", 12, 12), 0),
 "gcyc": ("fim2", 912, 760, None, 1), "gscr": ("fim2", 926, 766, None, 1), "kn": ("fim2", 919, 782, ("c", 5), 0), "ilr": ("fim2", 903, 790, None, 1),
 # flotation (FIM 2): cells along the flotation bank, feed at the south end, tails end by the tails thickener
 "ffb": ("fim2", 962, 705, None, 0), "r1": ("fim2", 963, 681, ("c", 6), 0), "r2": ("fim2", 963, 666, ("c", 6), 0), "r3": ("fim2", 963, 651, ("c", 6), 0),
 "s1": ("fim2", 963, 636, ("c", 6), 0), "s2": ("fim2", 963, 621, ("c", 6), 0), "s3": ("fim2", 963, 606, ("c", 6), 0), "s4": ("fim2", 963, 591, ("c", 6), 0),
 "blow": ("fim1", 505, 310, ("r", 20, 10), 0), "jc": ("fim2", 983, 614, ("c", 4), 0), "jcs": ("fim2", 988, 633, ("c", 4), 0), "fch": ("fim2", 996, 648, None, 1),
 "ftt": ("fim2", 871, 577, ("c", 28), 0),
 # CIL4 and carbon (FIM 1)
 "c4fb": ("fim1", 655, 318, None, 0),
 "t411": ("fim1", 646, 332, ("c", 9), 0), "t412": ("fim1", 646, 345, ("c", 9), 0), "t413": ("fim1", 646, 358, ("c", 9), 0), "t414": ("fim1", 646, 371, ("c", 9), 0),
 "t415": ("fim1", 664, 371, ("c", 9), 0), "t416": ("fim1", 664, 358, ("c", 9), 0), "t417": ("fim1", 664, 345, ("c", 9), 0), "t418": ("fim1", 664, 332, ("c", 9), 0),
 "ftk": ("fim1", 630, 305, None, 0), "tsf": ("fim1", 900, 150, None, 1),
 "lcs4": ("fim1", 690, 348, None, 0), "tv4": ("fim1", 697, 356, None, 0), "sz4": ("fim1", 700, 343, None, 1), "kiln4": ("fim1", 706, 362, None, 1),
 "el4": ("fim1", 680, 368, None, 0), "eu4": ("fim1", 586, 434, None, 0), "ew4": ("fim1", 590, 418, None, 1),
 # concentrate, UFG, thickeners, CIL1-3 (FIM 1)
 "ct": ("fim1", 634.5, 536.4, ("c", 15), 0), "fft": ("fim1", 627, 489, None, 0), "filt": ("fim1", 646, 495, ("r", 12, 20), 0),
 "ufg2": ("fim1", 628, 418, None, 0), "ufg3": ("fim1", 637, 419, None, 0), "ufg1": ("fim1", 652, 476, None, 0),
 "gidji": ("fim1", 900, 60, None, 1), "cil1": ("fim1", 545, 600, ("r", 45, 70), 1), "plt": ("fim1", 595.4, 535, ("c", 14), 0),
 "cil2": ("fim1", 594, 610, ("r", 28, 50), 0), "cil3": ("fim1", 634, 610, ("r", 28, 50), 0),
 "lcs3": ("fim1", 642, 590, None, 1), "el3": ("fim1", 565, 470, None, 1), "ew3": ("fim1", 576, 418, None, 0), "kiln3": ("fim1", 575, 480, None, 1),
 "sz3": ("fim1", 620, 588, None, 1), "gold": ("fim1", 582, 421, ("r", 20, 8), 0), "gew": ("fim1", 582, 426, None, 1),
 # reagents (FIM 1 balloons)
 "rg_cu": ("fim1", 396, 318, ("c", 3), 0), "rg_fr": ("fim1", 396, 328, ("c", 3), 0), "rg_fl": ("fim1", 396, 345, ("c", 3), 0), "rg_pax": ("fim1", 396, 356, ("c", 3), 0),
 "rg_lime": ("fim1", 754, 402, None, 0), "rg_cn": ("fim1", 695, 404, ("r", 14, 7), 0), "rg_pb": ("fim1", 733, 370, None, 0), "rg_hcl": ("fim1", 733, 382, None, 0),
 "rg_na": ("fim1", 732, 400, None, 0), "rg_h2": ("fim1", 771, 400, None, 0), "rg_lpg": ("fim1", 548, 395, None, 1), "rg_as": ("fim1", 672, 425, None, 0),
 # water and services
 "sch": ("fim1", 575, 235, None, 1), "dams": ("fim1", 690, 700, ("r", 50, 30), 0), "rwt": ("fim2", 1069, 582, ("c", 8), 0), "gland": ("fim2", 1058, 595, None, 1),
 "pwt": ("fim2", 923, 628, ("c", 9), 0), "hpw": ("fim2", 933, 640, None, 1), "air": ("fim2", 1003, 545, ("r", 12, 6), 0), "o2": ("fim1", 572, 302, ("r", 25, 6), 0),
 "cnw": ("fim1", 571, 652, ("c", 6), 0),
}

# conveyors follow their real alignment (points on FIM 1); other streams run straight
VIA = {
    "s_pc2": [("fim1", 152, 578)],
    "s_cos2": [("fim1", 290, 438), ("fim1", 470, 438)],
    "s_dso": [("fim1", 470, 450), ("fim1", 352, 450)],
    "s_pebr": [("fim1", 360, 438), ("fim1", 470, 438)],
}
# default view: the processing plant (FIM 1 points)
HOME = [ll("fim1", 380, 280), ll("fim1", 800, 660)]

if __name__ == "__main__":
    for s, (a, b, r) in TF.items(): print(s, "m/pt %.4f" % abs(a), "rotation %.2f deg" % math.degrees(math.atan2(a.imag, a.real)), "max residual %.1f m" % r)
    rot = math.degrees(math.atan2(TF["fim2"][0].imag, TF["fim2"][0].real))   # sheet x axis bearing, used to square rectangles to the plant grid
    out = {"rot": round(rot, 2), "home": HOME, "nodes": {}, "via": {k: [ll(*p) for p in v] for k, v in VIA.items()}}
    for i, (s, x, y, sh, est) in P.items():
        o = {"ll": ll(s, x, y)}
        if sh: o["sh"] = list(sh)
        if est: o["est"] = 1
        out["nodes"][i] = o
    js = ("// Built by tools/build_layout.py from the FIM 1 and FIM 2 layout drawings. Real positions of the Smart PFD items for the Layout view.\n"
          "// ll: [lat, lng]; sh: [\"c\", radius m] circle or [\"r\", width m, length m] rectangle square to the plant grid; est: position estimated.\n"
          "const LAYOUT = " + json.dumps(out, separators=(",", ":")) + ";\n")
    open(os.path.join(os.path.dirname(__file__), "..", "pfd-layout-data.js"), "w").write(js)
    print(len(out["nodes"]), "items,", sum(1 for v in out["nodes"].values() if v.get("est")), "estimated")
