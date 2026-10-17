"""The offline site map (map/site.webp): the plant as an aerial picture, under the satellite on the Layout tab, so the
map shows at once and with no signal (the satellite covers it as its pictures come in; pfd-layout.js).

The detail is the grey aerial photo printed on the FIM 1 / FIM 2 layout drawings, laid on the layout's plant grid
(tools/build_layout.py) at 1 m a pixel, the drawing's white number callouts painted out. Kept in black and
white, sharpened, in a cool grey: colour guessed from it (or borrowed from the 10 m Sentinel 2 satellite) read worse
than the plain photo.

Needs pymupdf, numpy, scipy, Pillow.
"""
import json, os, sys
import numpy as np, pymupdf
from PIL import Image, ImageChops, ImageFilter
from scipy import ndimage as nd

R = sys.argv[1] if len(sys.argv) > 1 else "."
BOUNDS = (-30.7782, -30.7542, 121.4955, 121.5279)   # (lat0, lat1, lon0, lon1: pfd-layout.js lays the picture on these)

src = open(os.path.join(R, "tools", "build_layout.py")).read().split("\n# id: (sheet")[0]
g = {"__file__": os.path.join(R, "tools", "build_layout.py")}; cwd = os.getcwd(); os.chdir(R); exec(src, g); os.chdir(cwd)
TF, en = g["TF"], g["en"]
la0, la1, lo0, lo1 = BOUNDS
E0, N1 = en(la1, lo0).real, en(la1, lo0).imag; E1, N0 = en(la0, lo1).real, en(la0, lo1).imag
W, H = int(E1 - E0), int(N1 - N0)

# the drawings' photo on the plant grid (output pixel -> metres -> sheet point -> raster pixel: one affine per sheet)
photo = Image.new("L", (W, H), 0); cover = Image.new("L", (W, H), 0)
FR = {"fim1": (25, 16, 933, 826), "fim2": (71, 63, 1789, 1466)}   # (the photo's frame on each sheet, past the title block)
for sheet, f, zoom in (("fim1", "PIDs/2000-F00-DRG-GE-20001.pdf", 4.0), ("fim2", "PIDs/2000-F00-DRG-GE-10100.pdf", 1.7)):
    p = pymupdf.open(os.path.join(R, f))[0]; x0, y0, x1, y1 = FR[sheet]
    pm = p.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=pymupdf.Rect(x0, y0, x1, y1), colorspace=pymupdf.csGRAY, alpha=False)
    im = Image.frombytes("L", (pm.width, pm.height), pm.samples); a, b, _ = TF[sheet]
    def s(u, v):
        w = (complex(E0 + u, N1 - v) - b) / a; return ((w.real - x0) * zoom, (-w.imag - y0) * zoom)
    X0, Y0 = s(0, 0); Xu, Yu = s(1, 0); Xv, Yv = s(0, 1); A = (Xu - X0, Xv - X0, X0, Yu - Y0, Yv - Y0, Y0)
    m = Image.new("L", im.size, 255).transform((W, H), Image.AFFINE, A, fillcolor=0).filter(ImageFilter.MinFilter(5))
    photo.paste(im.transform((W, H), Image.AFFINE, A, resample=Image.BILINEAR, fillcolor=255), (0, 0), m); cover = ImageChops.lighter(cover, m)
cv = np.array(cover) > 128; a = np.array(photo).astype(np.float32)

# (the callouts: small white boxes with a number, painted out from the photo round them)
wh = a > 246; lab, n = nd.label(wh); ar = nd.sum(wh, lab, range(1, n + 1))
mk = nd.binary_dilation(np.isin(lab, np.nonzero((ar > 6) & (ar < 900))[0] + 1), iterations=3)
ww = nd.gaussian_filter((~mk).astype(np.float32), 6); a = np.where(mk, nd.gaussian_filter(np.where(mk, 0, a), 6) / np.maximum(ww, 1e-3), a)
lo, hi = np.percentile(a[cv], [2, 98]); st = np.clip((a - lo) / (hi - lo), 0, 1)

# the photo itself, cleaned: sharpened, in a cool grey from slate to near white (no flattening, every roof and slab as it is)
det = np.array(Image.fromarray((st * 255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(2, 80, 2))).astype(np.float32)[..., None] / 255
dk, lt = np.array([44, 52, 64], np.float32), np.array([236, 238, 236], np.float32)
rgb = dk + (lt - dk) * det

# off the drawings: see through (the map's own background, or the satellite)
alpha = (nd.gaussian_filter(cv.astype(np.float32), 1.5) * 255).astype(np.uint8)
os.makedirs(os.path.join(R, "map"), exist_ok=True)
Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha])).save(os.path.join(R, "map", "site.webp"), quality=58, method=6)
print("map/site.webp", W, "x", H, os.path.getsize(os.path.join(R, "map", "site.webp")) // 1024, "KB")
import subprocess; subprocess.run([sys.executable, os.path.join(R, "tools", "build_offline.py")], cwd=R, check=False)
