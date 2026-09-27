// Moves whole areas (frames) of the PFD. Everything whose centre lies in a frame moves with it; lines with
// both ends moving together keep their hand routing (shifted); lines between areas that move differently lose
// their routing and are marked ar:1 so pfd.html routes them automatically (then bake them with pfdBake()).
// node tools/moveframes.js '{"frames":{"3":[-1800,30]},"nodes":{"gold":[4760,800]},"resize":{"12":[1720,1790,3170,250]},"W":4900,"H":2400}'
//   frames: frame index -> [dx, dy];  nodes: node id -> absolute [x, y] (overrides);  resize: frame index -> [x, y, w, h]
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "pfd-data.js");
const cfg = JSON.parse(process.argv[2]);
let src = fs.readFileSync(file, "utf8");
const D = new Function(src.replace(/^const /gm, "var ") + "; return { FRAMES, NODES, STREAMS };")();
const inside = (n, f) => n.x + n.w / 2 > f.x && n.x + n.w / 2 < f.x + f.w && n.y + n.h / 2 > f.y && n.y + n.h / 2 < f.y + f.h;
const vec = {};
D.NODES.forEach(n => {
  if (cfg.nodes && cfg.nodes[n.id]) { vec[n.id] = [cfg.nodes[n.id][0] - n.x, cfg.nodes[n.id][1] - n.y]; return; }
  const fi = D.FRAMES.findIndex(f => inside(n, f)); vec[n.id] = (fi >= 0 && cfg.frames[fi]) ? cfg.frames[fi] : [0, 0];
});
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const lines = src.split("\n"); let sect = "", fi = -1;
for (let i = 0; i < lines.length; i++){
  let L = lines[i]; const m = L.match(/^const (\w+)/); if (m) sect = m[1];
  if (/^const PFD_W/.test(L) && cfg.W) L = L.replace(/PFD_W = \d+/, "PFD_W = " + cfg.W).replace(/PFD_H = \d+/, "PFD_H = " + cfg.H);
  else if (sect === "FRAMES" && /\{\s*x:/.test(L)){ fi++;
    const r = cfg.resize && cfg.resize[fi], v = cfg.frames[fi] || [0, 0];
    L = L.replace(/x:\s*(-?\d+),\s*y:\s*(-?\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)/, (q, x, y, w, h) => r ? `x: ${r[0]}, y: ${r[1]}, w: ${r[2]}, h: ${r[3]}` : `x: ${+x + v[0]}, y: ${+y + v[1]}, w: ${w}, h: ${h}`);
  } else if (sect === "NODES"){ const id = (L.match(/\{ id:"([^"]+)"/) || [])[1];
    if (id){ const v = vec[id]; L = L.replace(/x:(-?\d+), y:(-?\d+)/, (q, x, y) => `x:${+x + v[0]}, y:${+y + v[1]}`); }
  } else if (sect === "STREAMS"){ const id = (L.match(/\{ id:"([^"]+)"/) || [])[1];
    if (id){ const s = D.STREAMS.find(s => s.id === id), a = vec[s.f], b = vec[s.to];
      if (same(a, b)) L = L.replace(/via:(\[\[.*?\]\])/, (q, v) => "via:" + v.replace(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g, (z, x, y) => `[${+x + a[0]},${+y + a[1]}]`))
                          .replace(/\bmx:(-?\d+)/, (q, v) => "mx:" + (+v + a[0])).replace(/\bmy:(-?\d+)/, (q, v) => "my:" + (+v + a[1]));
      else if (!/\bar:1\b/.test(L)) L = L.replace(/,\s*via:\[\[.*?\]\]/, "").replace(/,\s*mx:-?\d+/, "").replace(/,\s*my:-?\d+/, "").replace(/\{ id:"([^"]+)",/, '{ id:"$1", ar:1,');
    } }
  lines[i] = L;
}
fs.writeFileSync(file, lines.join("\n"));
console.log("auto-route:", D.STREAMS.filter(s => !same(vec[s.f], vec[s.to])).length, "lines");
