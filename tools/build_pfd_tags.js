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

// ---------- associations: items the PFD doesn't show, linked to the PFD item they belong to ----------
// 1. a tag in the item's own row that the PFD shows (an instrument's equipment, a line's From / To, a valve's location)
// 2. same P&ID as items the PFD shows, and a shared meaningful word with that PFD item (its name, its short name, the
//    names of its equipment), e.g. the PAX fan and PAX valves on the PAX tank's P&ID → the PAX (collector) node.
//    Synonyms: xanthate / XA (the line service code) = PAX.
// 3. a valve on a line that got linked → the line's PFD item
const DB = JSON.parse(fs.readFileSync(path.join(root, "search-data.json"), "utf8"));
const TAG = /F\d{2}-[A-Z]{1,4}-\d{2,4}[A-Z]?|\b[A-Z]{1,5} ?\d{5}[A-Z]?\b/g, PIDRE = /2000-F\d\d-PID-[A-Z]{2}-\d{4,5}/g;
const STOP = new Set("THE AND FOR WITH FROM TO OF IN ON AT NO NEW EXISTING STAGE AREA TANK TANKS PUMP PUMPS MOTOR FAN VALVE VALVES LINE LINES SUPPLY RETURN DISCHARGE FEED INLET OUTLET TRANSMITTER INDICATOR SWITCH CONTROL PRESSURE FLOW LEVEL TEMPERATURE POSITION OPEN CLOSED SOLENOID ISOLATION DRAIN VENT SAMPLE PLANT PROCESS WATER AIR SYSTEM UNIT PACKAGE BOX CHUTE HOPPER SUMP SPARE DUTY STANDBY BLOWER AGITATOR MIXING STORAGE DOSING TRANSFER DELIVERY ELEMENT GAUGE ANALYSER CONVEYOR SCREEN BIN".split(" "));
const SYN = { XANTHATE: "PAX", XA: "PAX", SIBX: "PAX", COLLECTOR: "PAX", CN: "CYANIDE", NACN: "CYANIDE", MIBC: "FROTHER", FLOC: "FLOCCULANT", CUSO4: "COPPER" };
const words = t => new Set((String(t || "").toUpperCase().match(/[A-Z][A-Z0-9]{1,}/g) || []).map(w => SYN[w] || w).filter(w => w.length > 1 && !STOP.has(w) && !/^[A-Z]\d|^\d/.test(w)));
const nodeOf = id => NODES.find(n => n.id === id);
const nodeWords = {};
Object.entries(EQ).forEach(([id, d]) => { const n = nodeOf(id) || {}; const w = new Set([...words(n.n), ...words(n.sn)]); (d.eq || []).forEach(r => words(r.n).forEach(x => w.add(x))); nodeWords[id] = w; });
const recs = [];
Object.entries(DB.data).forEach(([t, rows]) => { if (!DB.types[t]) return; const f = DB.types[t].f;
  rows.forEach(r => { const k = norm(r[0]); const txt = r.slice(1).join(" "); recs.push({ t, k, r, f, txt, pids: [...new Set(txt.match(PIDRE) || [])] }); }); });
const direct = k => { const v = pfd[k]; return v && !/^L:/.test(v) ? v : null; };
const pidNodes = {};
recs.forEach(x => { const id = direct(x.k); if (!id) return; x.pids.forEach(p => (pidNodes[p] = pidNodes[p] || new Set()).add(id)); });
const assoc = {};
const nameOf = x => { const g = n => x.r[x.f.indexOf(n)] || ""; return [g("Equipment name"), g("Description"), g("Location"), g("Service"), g("Service description"), g("Equipment description"), g("Type")].join(" "); };
const SITE = /\b(FIRE|FIREWATER|HYDRANT|SAFETY SHOWER|EYEWASH|EYE WASH|DELUGE|SPRINKLER)\b/i;   // site services: no PFD item
for (const x of recs){ if (pfd[x.k] || SITE.test(x.txt)) continue;
  // 1. a tag the PFD shows, in the item's row
  let id = null; for (const m of x.txt.match(TAG) || []){ const d = direct(norm(m)); if (d){ id = d; break; } }
  // 2. same P&ID, shared word
  if (!id){ const w = words(nameOf(x)), cand = [...new Set(x.pids.flatMap(p => [...(pidNodes[p] || [])]))];
    let best = null, bs = 0, tie = false; cand.forEach(c => { const sc = [...w].filter(v => nodeWords[c] && nodeWords[c].has(v)).length; if (sc > bs){ bs = sc; best = c; tie = false; } else if (sc && sc === bs) tie = true; });
    if (bs > 0 && !tie && (bs >= 2 || cand.length === 1)) id = best; }   // one shared word is enough only when the P&ID has one PFD item
  if (id) assoc[x.k] = id; }
// 3. valves on a linked line
for (const x of recs){ if (pfd[x.k] || assoc[x.k] || !/^(mv|cv)$/.test(x.t)) continue; const ln = x.r[x.f.indexOf("Line number")]; const a = ln && (direct(norm(ln)) || assoc[norm(ln)]); if (a) assoc[x.k] = a; }
// 4. still nothing, but its P&ID has PFD items: the main one (most tags the PFD shows on that P&ID); a tie → the area link
const pidMain = {};
recs.forEach(x => { const id = direct(x.k); if (!id) return; x.pids.forEach(p => { const c = pidMain[p] = pidMain[p] || {}; c[id] = (c[id] || 0) + 1; }); });
const mainOf = p => { const c = pidMain[p]; if (!c) return null; const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e.length > 1 && e[0][1] === e[1][1] ? null : e[0][0]; };
const JUNK = /not used|reserved|spare tag|deleted/i, none = [];
let main = 0;
for (const x of recs){ if (pfd[x.k] || assoc[x.k]) continue;
  if (JUNK.test(String(x.r[1] || "")) || !String(x.r[1] || "").trim() || SITE.test(x.txt)){ none.push(x.k); continue; }   // left unlinked on purpose
  const m = x.pids.map(mainOf).find(Boolean); if (m){ assoc[x.k] = m; main++; } }
// 5. everything else gets its area (worked out from the tag in the app): which areas the PFD frames and the layout show
const FRAMES = get("FRAMES"), pfdAreas = [...new Set(FRAMES.flatMap(f => String(f.label || "").match(/F\d\d/g) || []))].sort();
const layoutAreas = [...new Set(Object.entries(LAYOUT.nodes).filter(([id, n]) => !n.est && EQ[id]).map(([id]) => { const c = {};
  (EQ[id].eq || []).forEach(r => { const m = /^F\d\d/.exec(r.tag || ""); if (m) c[m[0]] = (c[m[0]] || 0) + 1; });
  return Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b))[0]; }).filter(Boolean))].sort();
fs.writeFileSync(path.join(root, "pfd-tags.json"), JSON.stringify({ pfd, assoc, layout, none, pfdAreas, layoutAreas }));
console.log(Object.keys(pfd).length, "tags on the PFD,", Object.keys(assoc).length, "linked to a PFD item (" + main + " as the main item of their P&ID),", none.length, "left out,", layout.length, "items on the layout; areas: PFD", pfdAreas.join(" "), "/ layout", layoutAreas.join(" "));
