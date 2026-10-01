// The tags the Smart PFD and the Layout map can show, for the Assets item page's PFD / Layout buttons (only offered when
// the item is really on that view). Run: node tools/build_pfd_tags.js  →  pfd-tags.json {pfd: {TAG: node id or "L:loop id"},
// layout: [node ids on the layout map]}. Tags are normalised like Lookup.norm (upper case, no spaces, hyphens, slashes, dots).
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, ".."), ctx = { window: {}, console };
vm.createContext(ctx);
for (const f of ["pfd-data.js", "pfd-equip.js", "pfd-layout-data.js", "tools/tagutil.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8") + "\n;this.__x = typeof NODES !== 'undefined';", ctx, { filename: f });
const get = n => vm.runInContext(`typeof ${n} === "undefined" ? undefined : ${n}`, ctx);
const NODES = get("NODES"), EQ = get("EQUIP_DATA"), LOOPS = get("LOOPS"), LAYOUT = get("LAYOUT"), expandTag = get("expandTag");
const norm = s => String(s || "").toUpperCase().replace(/[\s\-_/.]+/g, "");
const pfd = {};
Object.entries(EQ).forEach(([id, d]) => { (d.eq || []).forEach(r => pfd[norm(r.tag)] = id); (d.ins || []).forEach(i => { const k = norm(i.tag); if (!(k in pfd)) pfd[k] = id; }); });
LOOPS.forEach(L => [...(L.m || []), ...(L.f || [])].forEach(t => expandTag(t).forEach(x => { const k = norm(x); if (!(k in pfd) || !/^F\d\d[A-Z]/.test(k)) pfd[k] = "L:" + L.id; })));
const layout = Object.keys(LAYOUT.nodes).filter(id => NODES.some(n => n.id === id));
fs.writeFileSync(path.join(root, "pfd-tags.json"), JSON.stringify({ pfd, layout }));
console.log(Object.keys(pfd).length, "tags on the PFD,", layout.length, "items on the layout");
