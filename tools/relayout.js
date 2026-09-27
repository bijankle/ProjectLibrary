// Inserts space into the PFD like adding blank columns/rows: every x (or y) at or beyond a break
// point moves by the amount given, so nodes, frames, hand routed lines, loops and interlocks all keep
// their shape. Nodes move by their centre (sizes unchanged); frames stretch if a break falls inside.
// node tools/relayout.js '[["x",2965,120],["y",500,60]]'   (rewrites pfd-data.js in place)
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "pfd-data.js");
function relayout(breaks){
  let src = fs.readFileSync(file, "utf8");
  const bx = breaks.filter(b => b[0] === "x").sort((a, b) => a[1] - b[1]), by = breaks.filter(b => b[0] === "y").sort((a, b) => a[1] - b[1]);
  const X = x => x + bx.reduce((t, [, at, d]) => x >= at ? t + d : t, 0), Y = y => y + by.reduce((t, [, at, d]) => y >= at ? t + d : t, 0);
  const r = v => Math.round(v);
  const pt = s => s.replace(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g, (m, x, y) => `[${r(X(+x))},${r(Y(+y))}]`);
  const lines = src.split("\n");
  let sect = "";
  for (let i = 0; i < lines.length; i++){
    let L = lines[i];
    const m = L.match(/^const (\w+)/); if (m) sect = m[1];
    if (/^const PFD_W/.test(L)){
      const W = +L.match(/PFD_W = (\d+)/)[1], H = +L.match(/PFD_H = (\d+)/)[1];
      L = L.replace(/PFD_W = \d+/, "PFD_W = " + r(X(W))).replace(/PFD_H = \d+/, "PFD_H = " + r(Y(H)));
    } else if (sect === "FRAMES" && /\{\s*x:/.test(L)){
      L = L.replace(/x:\s*(-?\d+),\s*y:\s*(-?\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)/, (q, x, y, w, h) => { x = +x; y = +y; w = +w; h = +h;
        return `x: ${r(X(x))}, y: ${r(Y(y))}, w: ${r(X(x + w) - X(x))}, h: ${r(Y(y + h) - Y(y))}`; });
    } else if (sect === "NODES" && /\{ id:"/.test(L)){
      L = L.replace(/x:(-?\d+), y:(-?\d+), w:(\d+), h:(\d+)/, (q, x, y, w, h) => { x = +x; y = +y; w = +w; h = +h;
        return `x:${r(X(x + w / 2) - w / 2)}, y:${r(Y(y + h / 2) - h / 2)}, w:${w}, h:${h}`; });
    } else if (sect === "STREAMS" && /\{ id:"/.test(L)){
      L = L.replace(/via:(\[\[.*?\]\])/, (q, v) => "via:" + pt(v)).replace(/\bmx:(-?\d+)/, (q, v) => "mx:" + r(X(+v))).replace(/\bmy:(-?\d+)/, (q, v) => "my:" + r(Y(+v)));
    } else if (sect === "LOOPS" && /\{ tag:"/.test(L)){
      L = L.replace(/se:(\[[^\]]*\])/, (q, v) => "se:" + pt(v)).replace(/\bb:(\[[^\]]*\])/, (q, v) => "b:" + pt(v)).replace(/p:(\[[^\]]*\])/g, (q, v) => "p:" + pt(v));
    } else if (sect === "INTERLOCKS" && /pts:/.test(L)){
      L = L.replace(/pts:(\[\[.*?\]\])/, (q, v) => "pts:" + pt(v));
    }
    lines[i] = L;
  }
  fs.writeFileSync(file, lines.join("\n"));
}
if (require.main === module) relayout(JSON.parse(process.argv[2]));
module.exports = relayout;
