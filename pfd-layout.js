// Layout view of the Smart PFD: the same equipment and streams placed on the real plant (satellite map).
// Positions come from pfd-layout-data.js (built by tools/build_layout.py from the FIM 1 / FIM 2 layout drawings).
// Selection, flows, stage and the info panel are shared with the schematic: pfd.html hands over an api and calls
// PFDLayout.sync() whenever what is highlighted changes. Leaflet is loaded the first time the layout is opened.
// Equipment shows as plain text boxes: tag and MEL description, flagged when a tag has no MEL row.
// Anyone can correct a position: press and hold a box for half a second until it lifts, drag it, let go. A shorter
// tap only selects it, so nothing moves by accident. Moves are kept on the device and can be exported.
window.PFDLayout = (() => {
  const KEY = "kcgm_layout_pos", SVC = new Set(["water", "cnw", "reag", "air"]);
  const TILES = {
    sat: ["https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", { subdomains: ["mt0", "mt1", "mt2", "mt3"], maxNativeZoom: 21, attribution: "Imagery © Google" }],
    hyb: ["https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", { subdomains: ["mt0", "mt1", "mt2", "mt3"], maxNativeZoom: 21, attribution: "Imagery © Google" }],
    esri: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxNativeZoom: 19, attribution: "Imagery © Esri, Maxar" }]
  };
  let api = null, map = null, rend = null, on = false, ready = null, base = null, moving = null, lastHl = "";
  const N = {}, S = {};
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };
  const pos = id => saved[id] || LAYOUT.nodes[id].ll;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // local metres about a reference point (fine over a few km)
  const MY = 110850, mx = lat => 111320 * Math.cos(lat * Math.PI / 180);
  const toM = (p, o) => [(p[1] - o[1]) * mx(o[0]), (p[0] - o[0]) * MY];
  const toLL = (m, o) => [o[0] + m[1] / MY, o[1] + m[0] / mx(o[0])];
  const ROT = LAYOUT.rot * Math.PI / 180;   // plant grid x axis, radians anticlockwise from east
  const ux = [Math.cos(ROT), Math.sin(ROT)], uy = [Math.sin(ROT), -Math.cos(ROT)];   // sheet x and sheet y (down) in east / north
  const reach = id => { const sh = LAYOUT.nodes[id].sh; return !sh ? 3 : sh[0] === "c" ? sh[1] : Math.min(sh[1], sh[2]) * .45; };

  function load(){
    if (ready) return ready;
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
    ready = new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"; s.onload = ok; s.onerror = () => { ready = null; bad(new Error("map library not reachable")); }; document.head.appendChild(s); });
    return ready;
  }

  function build(){
    map = L.map("mapView", { zoomControl: false, attributionControl: true, maxZoom: 23, minZoom: 11, zoomSnap: .25, wheelPxPerZoomLevel: 90, boxZoom: false });
    rend = L.svg({ padding: .6 });
    setBase(api.pref.get("lo_base", "sat"));
    home(false);
    map.on("zoomend", () => { zoomCls(); redrawStreamsOf(null); }); zoomCls(); map.on("moveend", () => setTimeout(() => { declutter(); declutterAreas(); }, 0));
    map.on("click", () => { if (moving || Date.now() - dropped < 400) return; api.clearSel(true); api.closeInfo(); });
    // corner controls: imagery, dim, home, export
    // top left: ⌂ Plant and the WBS filters, Flow filters and Map options menus (folded until tapped)
    const tl = L.DomUtil.create("div", "lo-tl"); tl.id = "loTL"; $("mapView").appendChild(tl); L.DomEvent.disableClickPropagation(tl); L.DomEvent.disableScrollPropagation(tl);
    // one row: ⌂ Plant, then three folded menus: WBS filters (added by wbsPanel), Flow filters, Map options
    const pans = L.DomUtil.create("div", "lo-pans", tl);
    pans.innerHTML = `<button class="lo-b lo-home" id="loHome" title="Back to the processing plant">⌂ Plant</button>`;
    const menu = (id, cls, title, body) => { const m = L.DomUtil.create("div", "lo-pan shut " + cls, pans); m.id = id;
      m.innerHTML = `<button class="lo-wh" type="button">${title}<span>▾</span></button><div class="lo-fb">${body}</div>`;
      m.querySelector(".lo-wh").onclick = () => { m.classList.toggle("shut"); dispatchEvent(new Event("resize")); }; return m; };
    menu("loFF", "lo-ff", "Flow filters", "");
    const mo = menu("loMO", "lo-mo", "Map options",
      `<div class="lo-seg">${[["sat", "Satellite"], ["hyb", "Hybrid"], ["esri", "Esri"]].map(([k, t]) => `<button data-b="${k}">${t}</button>`).join("")}</div>
       <button class="lo-b" id="loDim" title="Dim the photo so the overlay reads better">◐ Dim</button>
       <button class="lo-b" id="loFlows" title="The PFD streams drawn on the plant (a flow picked in the list always shows)"></button>
       <button class="lo-b" id="loMinor" title="Items not on the layout drawings, placed beside the equipment they work with (dashed boxes)"></button>
       <button class="lo-b" id="loExp" title="Download the positions moved on this device, to send in">⬇ Moves</button>
       <button class="lo-b lo-dwg" data-dwg="2000-F00-DRG-GE-20001" title="Fimiston process plant overall plant layout (old plant)">Open old layout<small>2000-F00-DRG-GE-20001</small></button>
       <button class="lo-b lo-dwg" data-dwg="2000-F00-DRG-GE-10100" title="General Fimiston site general arrangement (new plant)">Open new layout<small>2000-F00-DRG-GE-10100</small></button>`);
    const bar = mo;
    bar.querySelectorAll("[data-b]").forEach(b => b.onclick = () => setBase(b.dataset.b));
    $("loHome").onclick = () => home(true);
    const dim = () => $("mapView").classList.toggle("dim", api.pref.get("lo_dim", "1") === "1");
    $("loDim").onclick = () => { api.pref.set("lo_dim", api.pref.get("lo_dim", "1") === "1" ? "0" : "1"); dim(); }; dim();
    $("loExp").onclick = exportMoves; expLabel();
    // minor equipment: the items not found on the layout drawings (position estimated), hidden unless asked for
    const minor = () => { const shown = api.pref.get("lo_minor", "0") === "1"; $("mapView").classList.toggle("nominor", !shown);
      $("loMinor").textContent = shown ? "Hide minor equipment" : "Show minor equipment"; $("loMinor").classList.toggle("on", shown); setTimeout(declutter, 0); };
    // flow lines: off unless asked for; a highlighted flow still shows
    const flows = () => { const shown = api.pref.get("lo_flows", "0") === "1"; $("mapView").classList.toggle("noflows", !shown);
      $("loFlows").textContent = shown ? "Hide flow lines" : "Show flow lines"; $("loFlows").classList.toggle("on", shown); };
    $("loFlows").onclick = () => { api.pref.set("lo_flows", api.pref.get("lo_flows", "0") === "1" ? "0" : "1"); flows(); }; flows();
    $("loMinor").onclick = () => { api.pref.set("lo_minor", api.pref.get("lo_minor", "0") === "1" ? "0" : "1"); minor(); }; minor();
    bar.querySelectorAll(".lo-dwg").forEach(b => b.onclick = () => window.Pid && Pid.load().then(() => { if (!Pid.open(b.dataset.dwg)) api.toast("That drawing isn't in the app yet."); }).catch(() => api.toast("Couldn't load the drawing list.")));
    addEventListener("keydown", e => { if (e.key === "Escape" && moving) moving.cancel(); });
    api.NODES.forEach(drawNode);
    api.STREAMS.forEach(drawStream);
    drawAreas();
    markers();
  }
  function setBase(k){
    if (!TILES[k]) k = "sat";
    if (base) map.removeLayer(base);
    base = L.tileLayer(TILES[k][0], Object.assign({ maxZoom: 23 }, TILES[k][1])).addTo(map);
    api.pref.set("lo_base", k);
    document.querySelectorAll(".lo-seg [data-b]").forEach(b => b.classList.toggle("on", b.dataset.b === k));
  }
  function home(anim){
    const b = L.latLngBounds(LAYOUT.home);
    anim ? map.flyToBounds(b, { padding: [10, 10], duration: .6 }) : map.fitBounds(b, { padding: [10, 10] });
  }
  function zoomCls(){
    const z = map.getZoom(), c = $("mapView").classList;
    c.toggle("zl1", z >= 17.75); c.toggle("zl2", z >= 19); c.toggle("areas", z < AREA_Z); declutterAreas();
    declutter();
  }
  // labels never overlap: selected first, then highlighted, then big items, then the rest
  // Boxes are never hidden for overlapping: most important first (selected, highlighted, major items), and a box
  // that would sit on another slides to the nearest free spot, with a thin leader and a dot at its true position.
  let lastOff = "";
  function setOff(o, dx, dy){
    o.dx = dx; o.dy = dy; o.el.style.setProperty("--dx", dx + "px"); o.el.style.setProperty("--dy", dy + "px");
    const on = !!(dx || dy); o.lead.style.display = o.dot.style.display = on ? "block" : "";
    if (on){ o.lead.style.width = Math.hypot(dx, dy) + "px"; o.lead.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`; }
  }
  function declutter(){
    const labs = [];
    Object.values(N).forEach(o => { if (!o.el) return; o.el.classList.remove("dc"); if (!o.el.classList.contains("lift")) setOff(o, 0, 0);
      labs.push({ o, pr: o.el.classList.contains("sel") ? 0 : o.el.classList.contains("hl") ? 1 : o.el.classList.contains("big") ? 2 : 3 }); });
    labs.sort((a, b) => a.pr - b.pr);
    const placed = [];
    labs.forEach(({ o }) => { const e = o.el; if (getComputedStyle(e).display === "none") return; const r = e.getBoundingClientRect(); if (!r.width) return;
      const hit = (dx, dy) => placed.some(b => r.left + dx < b.right + 3 && r.right + dx > b.left - 3 && r.top + dy < b.bottom + 2 && r.bottom + dy > b.top - 2);
      let best = [0, 0];
      if (!e.classList.contains("lift") && hit(0, 0)){
        const h = r.height + 3, w = r.width / 2 + 8, C = [];
        for (let k = 1; k <= 8; k++) C.push([0, k * h], [0, -k * h], [k * w, k * h], [-k * w, k * h], [k * w, -k * h], [-k * w, -k * h]);
        for (let k = 1; k <= 4; k++) C.push([k * 2 * w, 0], [-k * 2 * w, 0]);
        best = C.sort((a, b) => Math.hypot(...a) - Math.hypot(...b)).find(([dx, dy]) => !hit(dx, dy)) || [0, 0];
      }
      if (best[0] || best[1]) setOff(o, best[0], best[1]);
      placed.push({ left: r.left + best[0], right: r.right + best[0], top: r.top + best[1], bottom: r.bottom + best[1] }); });
    const sig = Object.values(N).map(o => (o.dx || 0) + "," + (o.dy || 0)).join(";");
    if (sig !== lastOff){ lastOff = sig; redrawStreamsOf(null); }   // lines to a moved box end at its dot
  }
  // arrowheads, one per stream colour
  function markers(){
    const svg = rend._container; if (!svg || svg.querySelector("defs")) return;
    const d = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    d.innerHTML = Object.entries(api.STREAM_TYPES).map(([k, t]) => `<marker id="loA-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto"><path d="M0 0L10 5L0 10z" style="fill:${t.color}"/></marker>`).join("");
    svg.insertBefore(d, svg.firstChild);
  }

  // ---------- equipment: text boxes ----------
  // MEL rows for a node come from pfd-equip.js (EQUIP_DATA). A tag named on the PFD block with no MEL row is a gap.
  const TAG_RE = /F\d{2}-[A-Z]{1,4}-\d{2,4}[A-Z]?/g, nt = t => String(t || "").toUpperCase().replace(/\s+/g, "");
  function melInfo(nd){
    const rows = (typeof EQUIP_DATA !== "undefined" && EQUIP_DATA[nd.id] && EQUIP_DATA[nd.id].eq) || [], have = new Set(rows.map(r => nt(r.tag)));
    const named = String(nd.tag || "").toUpperCase().match(TAG_RE) || [];
    const missing = named.filter(t => !have.has(nt(t)) && ![...have].some(h => h.startsWith(nt(t))));
    return { rows, missing, gap: !rows.length || missing.length > 0,
      tag: nd.tag || (rows[0] && rows[0].tag) || "", desc: nd.sn || nd.n };   // the PFD's own short name ("Ball Mill", not every MEL line): tap the box for the full list
  }
  function boxHtml(nd){
    const m = N[nd.id].mel, big = !!LAYOUT.nodes[nd.id].sh;
    const why = !m.rows.length ? "No MEL entry" : "Not in MEL: " + m.missing.join(", ");
    return `<div class="lo-box${big ? " big" : ""}${LAYOUT.nodes[nd.id].est ? " est" : ""}${m.gap ? " gap" : ""}" title="${esc(m.gap ? why : "")}">` +
      `<b>${esc(m.desc)}</b>${m.gap ? `<em>⚠ ${esc(why)}</em>` : ""}</div><i class="lo-lead"></i><s class="lo-dot"></s>`;   // the concise name only: tap for tags and MEL rows
  }
  // Zoomed far out the boxes can't be read: the map shows WBS areas instead, a soft zone round each area's equipment
  // (the area is the WBS code most of an item's MEL tags start with) labelled "F12 (Primary crushing)". Items of one
  // area more than 120 m from the rest get a zone of their own. Tapping a zone zooms in until the boxes show.
  const AREA_Z = 16.75;
  const WBS = {F00: "General Fimiston Site", F10: "Primary Crushing - Existing", F12: "Primary Crushing", F13: "Milling & Classification", F14: "Gravity Circuit & Intensive Leaching",
    F16: "Rougher & Scavenger Flotation", F17: "Flotation Tailings Pre-Leach Thickening", F18: "Cleaner & Cleaner Scavenger Flotation", F19: "Milling & Classification - Existing - Area A",
    F20: "Milling & Classification - Area B", F21: "Flotation Tailings CIL4", F22: "CIL4 - Carbon Treatment & Elution", F23: "Final Tailings Handling & Storage", F24: "Air & Water Services",
    F28: "Ultra Fine Grinding 2 / 3", F30: "Concentrate Pre-Leach Thickening, CIL2/3 & Concentrate Thickening", F34: "Ultra Fine Grinding - Existing", F35: "Concentrate Handling & Filtration",
    F65: "Concentrate Carbon Treatment & Elution", F66: "Electrowinning & Goldroom", F72: "Reagents Mixing & Storage", F75: "Water Services - Existing", F78: "Carbon Regeneration - Existing",
    F81: "Air Services - Existing"};   // WBS level 2 (KCGM Growth Work Breakdown Structure)
  // plant shorthand: Concentrate → Con., Flotation → Flot. …
  const SHORT = [[/\bconcentrate\b/g, "con."], [/\bflotation\b/g, "flot."], [/\bthickening\b/g, "thick."], [/\bclassification\b/g, "class."], [/\bscavenger\b/g, "scav."],
    [/\bregeneration\b/g, "regen."], [/\btreatment\b/g, "treat."], [/\belectrowinning\b/g, "EW"], [/\bultra fine grinding\b/g, "UFG"], [/\bexisting\b/g, "exist."],
    [/\bintensive leaching\b/g, "ILR"], [/\bhandling\b/g, "hand."], [/\bfiltration\b/g, "filt."], [/\btailings\b/g, "tails"], [/\bservices\b/g, "svcs"], [/\bgeneral\b/g, "gen."],
    [/\bprimary\b/g, "prim."], [/\bcircuit\b/g, "circ."], [/\bstorage\b/g, "stor."], [/\breagents\b/g, "reag."], [/\bcarbon\b/g, "carb."]];
  const wbsName = c => { let t = (WBS[c] || "").replace(/\s+-\s+/g, ", ").toLowerCase(); SHORT.forEach(([r, v]) => t = t.replace(r, v));
    return t.replace(/^./, x => x.toUpperCase()).replace(/\b(cil\d?|ufg|ew|ilr)\b/gi, x => x.toUpperCase()).replace(/\barea ([a-z])\b/, (m, x) => "area " + x.toUpperCase()); };
  const HUE = [42, 200, 140, 330, 20, 265, 95, 180, 0, 300];
  let areas = [];
  function hull(P){   // convex hull, monotone chain
    P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    P.forEach(p => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    P.slice().reverse().forEach(p => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function drawAreas(){
    if (!map) return;
    areas.forEach(a => { map.removeLayer(a.poly); map.removeLayer(a.lab); }); areas = [];
    const ED = typeof EQUIP_DATA !== "undefined" ? EQUIP_DATA : {}, by = {};
    api.NODES.forEach(nd => { if (!LAYOUT.nodes[nd.id] || LAYOUT.nodes[nd.id].est) return; const c = {};   // major equipment only (on the drawings)
      ((ED[nd.id] && ED[nd.id].eq) || []).forEach(r => { const m = /^F\d\d/.exec(r.tag || ""); if (m) c[m[0]] = (c[m[0]] || 0) + 1; });
      const code = Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b))[0]; if (code) (by[code] = by[code] || []).push(nd.id); });
    const o = LAYOUT.home[0];
    Object.keys(by).sort().forEach((code, ci) => {
      // split far apart groups of one area (single linkage, 120 m)
      const pts = by[code].map(id => ({ id, m: toM(pos(id), o) })), groups = [];
      pts.forEach(p => { const near = groups.filter(g => g.some(q => Math.hypot(q.m[0] - p.m[0], q.m[1] - p.m[1]) < 120));
        if (!near.length) return groups.push([p]);
        near.slice(1).forEach(b => { near[0].push(...b); groups.splice(groups.indexOf(b), 1); }); near[0].push(p); });
      groups.forEach(g => {
        const P = []; g.forEach(p => { const r = reach(p.id) + 14; for (let k = 0; k < 12; k++) P.push([p.m[0] + r * Math.cos(k * Math.PI / 6), p.m[1] + r * Math.sin(k * Math.PI / 6)]); });
        const ll = hull(P).map(m => toLL(m, o)), hue = HUE[ci % HUE.length];
        const poly = L.polygon(ll, { renderer: rend, className: "lo-area", color: `hsl(${hue} 85% 62%)`, weight: 1.5, fillColor: `hsl(${hue} 85% 55%)`, fillOpacity: .22, smoothFactor: 0 }).addTo(map);
        const cx = g.reduce((s, p) => s + p.m[0], 0) / g.length, cy = g.reduce((s, p) => s + p.m[1], 0) / g.length;
        const lab = L.marker(toLL([cx, cy], o), { icon: L.divIcon({ className: "lo-area-lab", html: `<span style="--h:${hue}" title="${esc(code + " (" + wbsName(code) + ")")}"><b>${code}</b></span>`, iconSize: null }), keyboard: false, zIndexOffset: 500 }).addTo(map);
        const go = e => { L.DomEvent.stopPropagation(e); const b = poly.getBounds(); map.flyTo(b.getCenter(), Math.min(18.5, Math.max(AREA_Z + 1, map.getBoundsZoom(b, false, [40, 40]))), { duration: .6 }); };
        poly.on("click", go); lab.on("click", go);
        areas.push({ code, poly, lab, n: g.length, hue });
      });
    });
    declutterAreas(); wbsPanel();
  }
  // WBS buttons in the map's top right corner, A to Z like the Smart PFD's flow list: tap one to fly to that area
  // (all its zones) and flash it. Folds to one button on a phone.
  let wbsOn = null;
  function wbsPanel(){
    let el = $("loWbs");
    if (!el){ el = document.createElement("div"); el.id = "loWbs"; el.className = "lo-pan lo-wbs shut"; $("loHome").after(el); }
    const codes = [...new Set(areas.map(a => a.code))].sort();
    el.innerHTML = `<button class="lo-wh" type="button">WBS filters<span>▾</span></button><div class="lo-wl">` +
      codes.map(c => `<button class="flow${c === wbsOn ? " on" : ""}" data-w="${c}" type="button"><i style="background:hsl(${areas.find(a => a.code === c).hue} 85% 55%)"></i><b>${c}</b><span>${esc(wbsName(c))}</span></button>`).join("") + `</div>`;
    el.querySelector(".lo-wh").onclick = () => el.classList.toggle("shut");
    el.querySelectorAll("[data-w]").forEach(b => b.onclick = () => {
      const c = b.dataset.w, zs = areas.filter(a => a.code === c); if (!zs.length) return;
      const bb = zs.reduce((u, a) => u.extend(a.poly.getBounds()), L.latLngBounds(zs[0].poly.getBounds().getSouthWest(), zs[0].poly.getBounds().getNorthEast()));
      map.flyToBounds(bb, { padding: [50, 50], maxZoom: 18.5, duration: .6 });
      wbsOn = c; el.querySelectorAll("[data-w]").forEach(x => x.classList.toggle("on", x === b));
      if (matchMedia("(max-width: 700px)").matches) el.classList.add("shut");
      zs.forEach(a => { const p = a.poly._path; if (p){ p.classList.remove("pick"); void p.getBoundingClientRect(); p.classList.add("pick"); setTimeout(() => p.classList.remove("pick"), 2600); } });
    });
  }
  // area labels (the code; the name is in the WBS panel) never overlap: biggest areas first, the rest wait for a closer zoom
  function declutterAreas(){
    if (!map || !$("mapView").classList.contains("areas")) return;
    const placed = [], hit = r => placed.some(b => r.left < b.right + 4 && r.right > b.left - 4 && r.top < b.bottom + 3 && r.bottom > b.top - 3);
    areas.slice().sort((a, b) => b.n - a.n).forEach(a => { const sp = a.lab.getElement() && a.lab.getElement().querySelector("span"); if (!sp) return;
      sp.classList.remove("off");
      const r = sp.getBoundingClientRect(); if (!hit(r)) return placed.push(r);
      sp.classList.add("off"); });
  }
  function drawNode(nd){
    const id = nd.id; if (!LAYOUT.nodes[id]) return;
    const o = N[id] = { mel: melInfo(nd) };
    o.lay = L.marker(pos(id), { icon: L.divIcon({ className: "lo-bw", html: boxHtml(nd), iconSize: null }), keyboard: false }).addTo(map);
    o.el = o.lay.getElement().querySelector(".lo-box"); o.lead = o.lay.getElement().querySelector(".lo-lead"); o.dot = o.lay.getElement().querySelector(".lo-dot");
    o.lay.on("click", e => { L.DomEvent.stopPropagation(e); if (moving || Date.now() - dropped < 400) return; api.pick(e.originalEvent, { k: "n", id }); });
    holdToDrag(id, o);
  }
  function redrawNode(id){ N[id].lay.setLatLng(pos(id)); }
  // press and hold 0.5 s: the box lifts and follows the finger or mouse; a shorter press is a normal tap (select)
  let dropped = 0;
  function holdToDrag(id, o){
    const el = o.lay.getElement(); let tm = null, st = null;
    el.addEventListener("contextmenu", e => e.preventDefault());
    const clear = () => { clearTimeout(tm); tm = null; o.el.classList.remove("press"); };
    el.addEventListener("pointerdown", e => {
      if (e.button || moving) return; if (st){ clear(); st = null; return; }   // a second finger: pinch, not a hold
      st = { x: e.clientX, y: e.clientY, pid: e.pointerId }; o.el.classList.add("press");
      tm = setTimeout(() => lift(e), 500);
    });
    const lift = e => {
      tm = null; if (!st) return;
      map.dragging.disable(); if (map.touchZoom) map.touchZoom.disable();
      try { el.setPointerCapture(st.pid); } catch (x) {}
      const start = pos(id), p0 = map.latLngToContainerPoint(start), c = map.mouseEventToContainerPoint({ clientX: st.x, clientY: st.y });
      const off = [c.x - p0.x, c.y - p0.y];
      o.el.classList.remove("press"); o.el.classList.add("lift"); $("mapView").classList.add("moving");
      if (navigator.vibrate) try { navigator.vibrate(25); } catch (x) {}
      const move = ev => { const q = map.mouseEventToContainerPoint(ev), ll = map.containerPointToLatLng([q.x - off[0], q.y - off[1]]);
        saved[id] = [+ll.lat.toFixed(7), +ll.lng.toFixed(7)]; o.lay.setLatLng(ll); redrawStreamsOf(id); };
      const end = keep => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", cancelEv);
        try { el.releasePointerCapture(st.pid); } catch (x) {}
        st = null; moving = null; dropped = Date.now(); o.el.classList.remove("lift"); $("mapView").classList.remove("moving");
        map.dragging.enable(); if (map.touchZoom) map.touchZoom.enable();
        if (!keep){ if (LAYOUT.nodes[id].ll[0] === start[0] && LAYOUT.nodes[id].ll[1] === start[1]) delete saved[id]; else saved[id] = start; o.lay.setLatLng(start); redrawStreamsOf(id); }
        else api.toast("Position saved on this device. Use ⬇ Moves to send it in.");
        save(); sync(false); expLabel(); drawAreas(); if (api.infoOpen()) api.refreshPanel(); };
      const up = () => end(true), cancelEv = () => end(false);
      moving = { id, cancel: () => end(false) };
      el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", cancelEv);
    };
    el.addEventListener("pointermove", e => { if (!st || !tm || e.pointerId !== st.pid) return; if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8){ clear(); st = null; } });
    const rel = () => { if (tm){ clear(); st = null; } };
    el.addEventListener("pointerup", rel); el.addEventListener("pointercancel", rel); el.addEventListener("pointerleave", e => { if (tm && e.pointerType === "mouse") rel(); });
  }

  // ---------- streams ----------
  const pairIx = {};
  // how far (metres) from an item's position to the edge of its text box, in direction d = [east, north] metres;
  // lines stop there so their arrowheads touch the box at every zoom
  function edgeM(id, d){
    const e = N[id] && N[id].el, lat = pos(id)[0];
    if (N[id] && (N[id].dx || N[id].dy)) return 3 * (map ? 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8) : .5);   // box slid aside: stop at its dot
    const mpp = map ? 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8) : .5;
    const r = e && e.offsetParent ? e.getBoundingClientRect() : null, hw = r && r.width ? r.width / 2 + 3 : 3, hh = r && r.height ? r.height / 2 + 3 : 3;
    const l = Math.hypot(d[0], d[1]) || 1, ux = Math.abs(d[0] / l), uy = Math.abs(d[1] / l);
    return Math.min(ux ? hw / ux : 1e9, uy ? hh / uy : 1e9) * mpp;
  }
  function pathFor(s){
    const a = pos(s.f), b = pos(s.to), o = a;
    if (s.f === s.to){   // recycle onto itself: small loop beside the item
      const hw = edgeM(s.f, [1, 0]), hh = edgeM(s.f, [0, 1]), r = Math.max(hh * .9, hw * .25), c = toM(a, o);
      // a smooth loop off the right edge of the box, leaving and rejoining it
      return Array.from({ length: 19 }, (_, i) => { const t = -Math.PI / 2 + i * Math.PI / 10; return toLL([c[0] + hw * .85 + r * Math.cos(t) + r * .2, c[1] + r * Math.sin(t)], o); });
    }
    let pts = [toM(a, o), ...(LAYOUT.via[s.id] || []).map(p => toM(p, o)), toM(b, o)];
    // several streams between the same two items: spread them sideways
    const k = [s.f, s.to].sort().join("|"), list = pairIx[k], i = list.indexOf(s.id), n = list.length;
    if (n > 1 && !LAYOUT.via[s.id]){
      const d = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], L0 = Math.hypot(...d) || 1, sgn = s.f < s.to ? 1 : -1;
      const mpp = map ? 40075016.686 * Math.cos(a[0] * Math.PI / 180) / Math.pow(2, map.getZoom() + 8) : .5;   // 8 px apart on screen at any zoom
      const off = (i - (n - 1) / 2) * 8 * mpp * sgn, nx = -d[1] / L0 * off, ny = d[0] / L0 * off;
      pts = pts.map(p => [p[0] + nx, p[1] + ny]);
    }
    // stop short of the shapes at both ends
    const cut = (p, q, r) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, t = Math.min(r, l * .4) / l; return [p[0] + dx * t, p[1] + dy * t]; };
    const dir = (p, q) => [q[0] - p[0], q[1] - p[1]], P = pts.length;
    pts[0] = cut(pts[0], pts[1], edgeM(s.f, dir(pts[0], pts[1]))); pts[P - 1] = cut(pts[P - 1], pts[P - 2], edgeM(s.to, dir(pts[P - 1], pts[P - 2])));
    return pts.map(p => toLL(p, o));
  }
  function drawStream(s){
    if (!LAYOUT.nodes[s.f] || !LAYOUT.nodes[s.to]) return;
    const k = [s.f, s.to].sort().join("|"); (pairIx[k] = pairIx[k] || []).includes(s.id) || pairIx[k].push(s.id);
  }
  function drawStreams(){
    api.STREAMS.forEach(s => { if (!LAYOUT.nodes[s.f] || !LAYOUT.nodes[s.to]) return;
      const t = api.STREAM_TYPES[s.ty], mn = LAYOUT.nodes[s.f].est || LAYOUT.nodes[s.to].est ? " minor" : "";
      const lay = L.polyline(pathFor(s), { renderer: rend, color: t.color, weight: 1.6, opacity: .95, smoothFactor: 0, interactive: false, className: "lo-s ty-" + s.ty + (SVC.has(s.ty) ? " svc" : "") + mn });
      lay.addTo(map); arrow(lay, s.ty);
      const mid = L.polyline(midSeg(lay.getLatLngs()), { renderer: rend, color: t.color, weight: 1.6, opacity: .95, smoothFactor: 0, interactive: false, className: "lo-s lo-mid ty-" + s.ty + (SVC.has(s.ty) ? " svc" : "") + mn }).addTo(map); arrow(mid, s.ty);
      // the thin line is only drawn; a wide invisible line on top of it takes the taps (about a finger wide)
      const hit = L.polyline(pathFor(s), { renderer: rend, color: "#000", weight: matchMedia("(pointer: coarse)").matches ? 22 : 14, opacity: 0, smoothFactor: 0, interactive: true, className: "lo-hit" + (SVC.has(s.ty) ? " svc" : "") + mn });
      hit.addTo(map);
      hit.on("click", e => { L.DomEvent.stopPropagation(e); if (moving) return; api.pick(e.originalEvent, { k: "s", id: s.id }); });
      hit.on("mouseover", () => lay._path && lay._path.classList.add("hov")); hit.on("mouseout", () => lay._path && lay._path.classList.remove("hov"));
      hit.bindTooltip(esc(s.n), { sticky: true, className: "lo-tip", direction: "top", offset: [0, -6] });
      S[s.id] = { lay, hit, mid, s };
    });
  }
  // two arrowheads per line whatever its bends: one halfway along (a short segment of its own) and one at the end
  function arrow(lay, ty){ const p = lay._path; if (p){ p.removeAttribute("marker-mid"); p.setAttribute("marker-end", `url(#loA-${ty})`); if (/var\(/.test(api.STREAM_TYPES[ty].color)) p.style.stroke = api.STREAM_TYPES[ty].color; } }
  function midSeg(pts){
    const o = [pts[0].lat != null ? pts[0].lat : pts[0][0], pts[0].lng != null ? pts[0].lng : pts[0][1]];
    const m = pts.map(p => toM([p.lat != null ? p.lat : p[0], p.lng != null ? p.lng : p[1]], o)), seg = [];
    let tot = 0; for (let i = 1; i < m.length; i++){ const l = Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]); seg.push(l); tot += l; }
    let half = tot / 2; for (let i = 1; i < m.length; i++){ if (half <= seg[i - 1] || i === m.length - 1){ const l = seg[i - 1] || 1, f = Math.min(1, half / l), d = [(m[i][0] - m[i - 1][0]) / l, (m[i][1] - m[i - 1][1]) / l];
      const c = [m[i - 1][0] + (m[i][0] - m[i - 1][0]) * f, m[i - 1][1] + (m[i][1] - m[i - 1][1]) * f]; return [toLL([c[0] - d[0] * .3, c[1] - d[1] * .3], o), toLL([c[0] + d[0] * .3, c[1] + d[1] * .3], o)]; } half -= seg[i - 1]; }
    return [pts[0], pts[pts.length - 1]];
  }
  function redrawStreamsOf(id){
    Object.values(S).forEach(o => { if (id != null && o.s.f !== id && o.s.to !== id) return;   // null: every line (after a zoom)
      const cls = o.lay._path.getAttribute("class"), hc = o.hit._path.getAttribute("class"), pts = pathFor(o.s);
      o.lay.setLatLngs(pts); o.lay._path.setAttribute("class", cls); arrow(o.lay, o.s.ty); o.hit.setLatLngs(pts); o.hit._path.setAttribute("class", hc);
      const mc = o.mid._path.getAttribute("class"); o.mid.setLatLngs(midSeg(pts)); o.mid._path.setAttribute("class", mc); arrow(o.mid, o.s.ty); });
  }

  // ---------- keep in step with the schematic ----------
  function sync(zoom){
    if (!map) return;
    const hl = api.hlIds(), sel = api.selIds(), focus = hl.size > 0;
    $("mapView").classList.toggle("focus", focus);
    api.NODES.forEach(nd => { const o = N[nd.id]; if (!o) return; const st = api.nodeState(nd.id), e = o.el;
      e.classList.toggle("hide", st.hidden); e.classList.toggle("ghost", st.ghost); e.classList.toggle("hl", hl.has(nd.id)); e.classList.toggle("sel", sel.has(nd.id));
      o.lay.setZIndexOffset(sel.has(nd.id) ? 2000 : hl.has(nd.id) ? 1000 : 0); });
    Object.values(S).forEach(o => { const st = api.streamState(o.s.id), p = o.lay._path; if (!p) return;
      [p, o.mid._path].forEach(q => { if (!q) return; q.classList.toggle("hide", st.hidden); q.classList.toggle("ghost", st.ghost); q.classList.toggle("hl", hl.has(o.s.id)); q.classList.toggle("sel", sel.has(o.s.id)); });
      const hp = o.hit._path; if (hp){ hp.classList.toggle("hide", st.hidden); hp.classList.toggle("hl", hl.has(o.s.id)); } });
    declutter();
    const key = [...hl].sort().join(",");
    if (zoom && focus && key !== lastHl){
      const pts = [];
      hl.forEach(id => { if (N[id]) pts.push(pos(id)); else if (S[id]) S[id].lay.getLatLngs().forEach(p => pts.push([p.lat, p.lng])); });
      if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(.25), { maxZoom: 19.5, duration: .55, paddingBottomRight: api.infoOpen() && innerWidth > 900 ? [480, 0] : [0, 0] });
    }
    lastHl = key;
  }

  // ---------- moving an item (hold and drag, above) ----------
  function panelHtml(n){
    if (!on || !LAYOUT.nodes[n.id]) return "";
    const est = LAYOUT.nodes[n.id].est, mine = !!saved[n.id], m = N[n.id] && N[n.id].mel;
    return `<div class="lo-mv"><span>✥ To move it: press and hold its box on the map for half a second, then drag. ${mine ? "Position moved on this device." : est ? "Position estimated: not identified on the layout drawings. Please move it if you know where it is." : "Placed from the layout drawings (about ±5 m)."}</span>${mine ? `<button class="hbtn" id="loReset">↺ Reset position</button>` : ""}</div>` +
      (m && m.gap ? `<div class="lo-gap">⚠ ${!m.rows.length ? "This block has no matching MEL entry." : "Tag" + (m.missing.length > 1 ? "s" : "") + " with no MEL row: " + esc(m.missing.join(", ")) + "."}</div>` : "");
  }
  function bindPanel(n){
    const r = $("loReset"); if (r) r.onclick = () => { delete saved[n.id]; save(); redrawNode(n.id); redrawStreamsOf(n.id); sync(false); expLabel(); api.refreshPanel(); };
  }
  function expLabel(){ const n = Object.keys(saved).length, b = $("loExp"); if (b){ b.textContent = `⬇ Moves (${n})`; b.disabled = !n; } }
  function exportMoves(){
    const out = { exported: new Date().toISOString(), note: "Smart PFD layout positions moved on this device ([lat, lng]). Send to be built into tools/build_layout.py.", moves: {} };
    Object.entries(saved).forEach(([id, p]) => { const n = api.byId[id]; out.moves[id] = { ll: p, name: n ? n.n : id, tag: n ? n.tag : "" }; });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
    a.download = `kcgm-layout-moves-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- show / hide ----------
  async function show(v){
    on = v; document.body.classList.toggle("layout", v); $("mapView").hidden = !v;
    const mleg = $("mleg");
    if (!v){ if (moving) moving.cancel(); if (mleg && mleg.closest("#loFF")) { document.body.appendChild(mleg); dispatchEvent(new Event("resize")); } return true; }
    try { await load(); } catch (e) { api.toast("Couldn't load the map (" + e.message + "). Check the connection."); on = false; document.body.classList.remove("layout"); $("mapView").hidden = true; return false; }
    if (!map){ build(); drawStreams(); markers(); Object.values(S).forEach(o => { arrow(o.lay, o.s.ty); arrow(o.mid, o.s.ty); }); }
    if (mleg) { $("loFF").querySelector(".lo-fb").appendChild(mleg); dispatchEvent(new Event("resize")); }
    setTimeout(declutter, 50);
    map.invalidateSize(); sync(false); return true;
  }
  return {
    init(a){ api = a; },
    show, active: () => on, zoom: z => map && (z == null ? map.getZoom() : map.setZoom(z, { animate: false })), sync: z => on && sync(z), panelHtml, bindPanel, declutter: () => map && declutter(),
    zoomBy: d => map && (d > 0 ? map.zoomIn(.75) : map.zoomOut(.75)), home: () => map && home(true)
  };
})();
