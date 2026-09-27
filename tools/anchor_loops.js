// One-off conversion: pins every loop/interlock point to the nearest equipment symbol in the ORIGINAL layout
// as [nodeId, side, fraction along side, distance out], so the overlay follows equipment through any relayout.
// node tools/anchor_loops.js <original pfd-data.js>
const fs = require("fs"), path = require("path");
const load = f => new Function(fs.readFileSync(f, "utf8").replace(/^const /gm, "var ") + "; return { NODES, LOOPS, INTERLOCKS };")();
const orig = load(process.argv[2]);
const file = path.join(__dirname, "..", "pfd-data.js");
function anchor(p, prefer){
  const [x, y] = p; let best = null;
  orig.NODES.forEach(n => { if (orig.NODES.length && n.st === 1 && prefer && prefer !== n.id) {}
    const dx = x < n.x ? n.x - x : x > n.x + n.w ? x - n.x - n.w : 0, dy = y < n.y ? n.y - y : y > n.y + n.h ? y - n.y - n.h : 0;
    const d = Math.hypot(dx, dy) - (n.id === prefer ? 25 : 0); if (!best || d < best.d) best = { n, d }; });
  const n = best.n; let side, f, d;
  if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h){ side = "in"; f = (x - n.x) / n.w; d = (y - n.y) / n.h; }
  else { const ox = x < n.x ? n.x - x : x > n.x + n.w ? x - n.x - n.w : 0, oy = y < n.y ? n.y - y : y > n.y + n.h ? y - n.y - n.h : 0;
    if (oy >= ox){ side = y < n.y ? "t" : "b"; f = (x - n.x) / n.w; d = oy; } else { side = x < n.x ? "l" : "r"; f = (y - n.y) / n.h; d = ox; } }
  return `["${n.id}","${side}",${Math.round(f * 100) / 100},${Math.round(d * 100) / 100}]`;
}
let src = fs.readFileSync(file, "utf8").split("\n"), sect = "";
const loopsO = orig.LOOPS, ilkO = orig.INTERLOCKS; let li = 0, ii = 0;
for (let i = 0; i < src.length; i++){
  const m = src[i].match(/^const (\w+)/); if (m) sect = m[1];
  if (sect === "LOOPS" && /^\{ tag:"/.test(src[i])){
    const L = loopsO[li++];
    src[i] = src[i].replace(/se:\[[^\]]*\]/, "se:" + anchor(L.se, L.node)).replace(/\bb:\[[^\]]*\]/, "b:" + anchor(L.b, L.node));
    let k = 0; src[i] = src[i].replace(/p:\[[^\]]*\]/g, () => "p:" + anchor(L.a[k++].p, L.node));
  } else if (sect === "INTERLOCKS" && /^\{ k:"/.test(src[i])){
    const I = ilkO[ii++], P = I.pts;
    src[i] = src[i].replace(/pts:\[\[.*?\]\]/, "pts:[" + anchor(P[0]) + "," + anchor(P[P.length - 1]) + "]");
  }
}
fs.writeFileSync(file, src.join("\n"));
console.log("loops", li, "interlocks", ii);
