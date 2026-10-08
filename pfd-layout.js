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
    map.on("click", e => { if (moving || Date.now() - dropped < 400) return; if (wf.size && !inWbs(e.latlng)) wbsFilter([], true); api.clearSel(true); api.closeInfo(); });
    // corner controls: imagery, dim, home, export
    // top left: Plant and the WBS filters, Flow filters and Map options menus (folded until tapped)
    const tl = L.DomUtil.create("div", "lo-tl"); tl.id = "loTL"; $("mapView").appendChild(tl); L.DomEvent.disableClickPropagation(tl); L.DomEvent.disableScrollPropagation(tl);
    // one row: Plant, then three folded menus: WBS filters (added by wbsPanel), Flow filters, Map options
    const pans = L.DomUtil.create("div", "lo-pans", tl);
    pans.innerHTML = `<button class="lo-b lo-home" id="loHome" title="Back to the processing plant" aria-label="Back to the processing plant"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/></svg></button>`;
    // north arrow, top right (the map is always north up)
    const nc = L.DomUtil.create("div", "lo-north", $("mapView")); nc.title = "North"; L.DomEvent.disableClickPropagation(nc);
    nc.innerHTML = `<svg viewBox="0 0 40 52" aria-label="North"><text x="20" y="11" text-anchor="middle">N</text><path d="M20 15 29 45 20 39 11 45Z" class="n1"/><path d="M20 15 20 39 11 45Z" class="n2"/></svg>`;
    const menu = (id, cls, title, body) => { const m = L.DomUtil.create("div", "lo-pan shut " + cls, pans); m.id = id;
      m.innerHTML = `<button class="lo-wh" type="button">${title}<span>▾</span></button><div class="lo-fb">${body}</div>`;
      m.querySelector(".lo-wh").onclick = () => { m.classList.toggle("shut"); dispatchEvent(new Event("resize")); }; return m; };
    menu("loFF", "lo-ff", "Flow filters", "");
    const mo = menu("loMO", "lo-mo", "Map options",
      `<div class="lo-seg">${[["sat", "Satellite"], ["esri", "Esri"]].map(([k, t]) => `<button data-b="${k}">${t}</button>`).join("")}</div>
       <button class="lo-b" id="loDim" title="Dim the photo so the overlay reads better">Dim</button>
       <button class="lo-b" id="loFlows" title="The PFD streams drawn on the plant (a flow picked in the list always shows)"></button>
       <button class="lo-b" id="loMinor" title="Items not on the layout drawings, placed beside the equipment they work with (dashed boxes)"></button>
       <button class="lo-b" id="loExp" title="Download the positions moved on this device, to send in">Moves</button>
       <button class="lo-b lo-dwg" data-dwg="2000-F00-DRG-GE-20001" title="FIM process plant overall plant layout (old plant)">Open old layout<small>2000-F00-DRG-GE-20001</small></button>
       <button class="lo-b lo-dwg" data-dwg="2000-F00-DRG-GE-10100" title="General FIM site general arrangement (new plant)">Open new layout<small>2000-F00-DRG-GE-10100</small></button>`);
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
    $("loFlows").hidden = true;   // (the Layout shows no flow lines)
    $("loMinor").onclick = () => { api.pref.set("lo_minor", api.pref.get("lo_minor", "0") === "1" ? "0" : "1"); minor(); }; minor();
    bar.querySelectorAll(".lo-dwg").forEach(b => b.onclick = () => window.Pid && Pid.load().then(() => { if (!Pid.open(b.dataset.dwg)) api.toast("That drawing isn't in the app yet."); }).catch(() => api.toast("Couldn't load the drawing list.")));
    addEventListener("keydown", e => { if (e.key === "Escape" && moving) moving.cancel(); });
    api.NODES.forEach(drawNode);
    api.STREAMS.forEach(drawStream);
    drawAreas(); home(false);   // (now the zones are there: open on them)
    markers();
  }
  function setBase(k){
    if (!TILES[k]) k = "sat";
    if (base) map.removeLayer(base);
    base = L.tileLayer(TILES[k][0], Object.assign({ maxZoom: 23 }, TILES[k][1])).addTo(map);
    api.pref.set("lo_base", k);
    document.querySelectorAll(".lo-seg [data-b]").forEach(b => b.classList.toggle("on", b.dataset.b === k));
  }
  // home (the opening view and ⌂): every WBS zone, filling the screen edge to edge; the WBS view reaches at least
  // this close, so home always shows the zones and their names
  function home(anim){
    let b = null; areas.forEach(a => { const g = a.poly.getBounds(); b = b ? b.extend(g) : L.latLngBounds(g.getSouthWest(), g.getNorthEast()); });   // the WBS zones
    if (!b) b = L.latLngBounds(LAYOUT.home);
    const ph = document.documentElement.classList.contains("phone");   // (clear of the buttons over the map's top and bottom)
    const o = { paddingTopLeft: ph ? [4, 20] : [10, 30], paddingBottomRight: ph ? [4, 20] : [10, 10], maxZoom: BOX_Z - 1 };
    const hz = map.getBoundsZoom(b, false, L.point(o.paddingTopLeft).add(o.paddingBottomRight)); AREA_Z = Math.max(16.75, Math.min(BOX_Z - .75, hz + .25));
    anim ? map.flyToBounds(b, Object.assign(o, { duration: .6 })) : map.fitBounds(b, o);
  }
  function zoomCls(){
    const z = map.getZoom(), c = $("mapView").classList;
    c.toggle("zl1", z >= 17.75); c.toggle("zl2", z >= 19); c.toggle("areas", z < AREA_Z); c.toggle("stack", z >= AREA_Z && z < BOX_Z); declutterAreas();
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
  // Three phases by zoom: WBS areas (below AREA_Z), callout stacks (to BOX_Z), name boxes on the equipment (from BOX_Z)
  const BOX_Z = 18.5;
  function declutter(){
    if (map && map.getZoom() >= AREA_Z && map.getZoom() < BOX_Z) return stackOut();
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
  // Callout stacks: every name in view lines up in tidy columns left and right of the plant, joined by a thin leader to
  // a dot at the equipment. Each side is ordered top to bottom so the leaders don't cross; a side too tall for the
  // screen spreads over more columns, outward.
  function stackOut(){
    const box = $("mapView").getBoundingClientRect(), W = box.width, H = box.height, GAP = 2, CG = 8, zl = [0, 0], BOT = 34 + ROWH * zl[1];
    const tl = $("loTL"), TOP = (tl ? Math.max(58, tl.querySelector(".lo-pans").getBoundingClientRect().bottom - box.top + 8) : 58) + ROWH * zl[0];   // below the menus and the zone codes (one or more lines)
    const items = [];
    Object.values(N).forEach(o => { if (!o.el) return; o.el.classList.remove("dc", "so"); if (o.el.classList.contains("lift")) return; setOff(o, 0, 0);
      if (getComputedStyle(o.el).display === "none") return; const r = o.el.getBoundingClientRect(); if (!r.width) return;
      const p = { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) return o.el.classList.add("so");   // equipment off screen: its name hides rather than hang over the edge
      items.push({ o, p, w: r.width, h: r.height }); });
    if (!items.length) return;
    items.sort((a, b) => a.p.x - b.p.x);
    // one column a side: when a side is taller than the room, the names get smaller (down to 60%) to fit
    const mv = $("mapView"), room = H - TOP - BOT, hs0 = items.map(i => i.h + GAP), tot = hs0.reduce((t, v) => t + v, 0) / 2;
    const k = Math.max(.6, Math.min(1, room / Math.max(1, tot))), k0 = parseFloat(mv.style.getPropertyValue("--sk")) || 1;
    if (Math.abs(k - k0) > .02){ mv.style.setProperty("--sk", k.toFixed(3)); items.forEach(i => { const r = i.o.el.getBoundingClientRect(); i.w = r.width; i.h = r.height; }); }
    const minX = Math.min(...items.map(i => i.p.x)), maxX = Math.max(...items.map(i => i.p.x)), avail = H - TOP - BOT;
    // split left / right near the middle, moved so neither side needs more columns than it must (a narrow phone has
    // room for about one column a side)
    const hs = items.map(i => i.h + GAP), sum = (a, b) => hs.slice(a, b).reduce((t, v) => t + v, 0);
    let half = Math.ceil(items.length / 2), bestK = half, bestC = 1e9;
    for (let k = 0; k <= items.length; k++){ const c = Math.max(Math.ceil(sum(0, k) / avail), Math.ceil(sum(k) / avail)) * 1e4 + Math.abs(k - half);
      if (c < bestC){ bestC = c; bestK = k; } }
    half = bestK; const sides = [items.slice(0, half), items.slice(half)];
    sides.forEach((grp, si) => { if (!grp.length) return;
      grp.sort((a, b) => a.p.y - b.p.y);
      const nc = 1, per = grp.length;
      const cols = []; for (let c = 0; c < nc; c++) cols.push(grp.slice(c * per, (c + 1) * per));
      const cw = cols.map(c => Math.max(...c.map(i => i.w), 0)), all = cw.reduce((a, b) => a + b, 0) + CG * (nc - 1);
      // the stack's inner edge sits just outside the plant, but never off the screen
      let x0 = si === 0 ? Math.max(8, Math.min(minX - 26 - all, W - all - 8)) : Math.min(W - all - 8, Math.max(maxX + 26, 8));
      if (si === 0) gapL = x0 + all; else gapR = x0;   // the WBS codes sit centred between the two columns
      // column 0 (the top part of the side) sits nearest the plant, further columns step outward
      let acc = 0; const lx = cw.map(w => { const v = si === 0 ? x0 + all - acc - w : x0 + acc; acc += w + CG; return v; });
      cols.forEach((col, k) => { const cx = lx[k], w = cw[k];
        const h = col.reduce((t, i) => t + i.h + GAP, 0) - GAP, my = col.reduce((t, i) => t + i.p.y, 0) / col.length;
        let y = Math.max(TOP, Math.min(H - BOT - h, my - h / 2));
        col.forEach(i => { const tx = si === 0 ? cx + w - i.w / 2 : cx + i.w / 2, ty = y + i.h / 2; setOff(i.o, tx - i.p.x, ty - i.p.y); y += i.h + GAP; }); });
    });
    const sig = Object.values(N).map(o => (o.dx || 0) + "," + (o.dy || 0)).join(";");
    if (sig !== lastOff){ lastOff = sig; redrawStreamsOf(null); }
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
  // a name longer than 12 characters goes on two lines, split at the space that makes the halves closest in length
  function two(t){
    t = String(t || ""); if (t.length <= 12) return esc(t);
    t = t.replace(/ · /g, " · "); let best = -1, d = 1e9; for (let i = t.indexOf(" "); i > 0; i = t.indexOf(" ", i + 1)){ const k = Math.abs(i - (t.length - i - 1)); if (k < d){ d = k; best = i; } }
    if (best < 0) return esc(t);
    const a = t.slice(0, best).replace(/\s*·$/, ""), b = t.slice(best + 1).replace(/^·\s*/, "");   // the · separator isn't needed at a line break
    return esc(a) + " <br>" + esc(b);   // (the space keeps the words apart when a stack shows it on one line)
  }
  function boxHtml(nd){
    const m = N[nd.id].mel, big = !!LAYOUT.nodes[nd.id].sh;
    const why = !m.rows.length ? "No MEL entry" : "Not in MEL: " + m.missing.join(", ");
    return `<div class="lo-box${big ? " big" : ""}${LAYOUT.nodes[nd.id].est ? " est" : ""}${m.gap ? " gap" : ""}" title="${esc(m.gap ? why : "")}">` +
      `<b>${two(m.desc)}</b>${m.gap ? `<em>${esc(why)}</em>` : ""}</div><i class="lo-lead"></i><s class="lo-dot"></s>`;   // the concise name only: tap for tags and MEL rows
  }
  // Zoomed far out the boxes can't be read: the map shows WBS areas instead, a soft zone round each area's equipment
  // (the area is the WBS code most of an item's MEL tags start with) labelled "F12 (Primary crushing)". Items of one
  // area more than 120 m from the rest get a zone of their own. Tapping a zone zooms in until the boxes show.
  let AREA_Z = 16.75;   // (raised by home() so the home view, however close, is always the WBS view)
  const WBS = {F00: "General FIM Site", F10: "Primary Crushing 1 - Existing", F12: "Primary Crushing 2", F13: "Milling & Classification", F14: "Gravity Circuit & Intensive Leaching",
    F16: "Rougher & Scavenger Flotation", F17: "Flotation Tailings Pre-Leach Thickening", F18: "Cleaner & Cleaner Scavenger Flotation", F19: "Milling & Classification - Existing - Area A",
    F20: "Milling & Classification - Area B", F21: "Flotation Tailings CIL4", F22: "CIL4 - Carbon Treatment & Elution", F23: "Final Tailings Handling & Storage", F24: "Air & Water Services",
    F28: "Ultra Fine Grinding 2 / 3", F30: "Concentrate Pre-Leach Thickening, CIL2/3 & Concentrate Thickening", F34: "Ultra Fine Grinding - Existing", F35: "Concentrate Handling & Filtration",
    F65: "Concentrate Carbon Treatment & Elution", F66: "Electrowinning & Goldroom", F72: "Reagents Mixing & Storage", F75: "Water Services - Existing", F78: "Carbon Regeneration - Existing",
    F81: "Air Services - Existing"};   // WBS level 2 (Growth Work Breakdown Structure)
  // plant shorthand: Concentrate → Con., Flotation → Flot. …
  const SHORT = [[/\bconcentrate\b/g, "con."], [/\bflotation\b/g, "flot."], [/\bthickening\b/g, "thick."], [/\bclassification\b/g, "class."], [/\bscavenger\b/g, "scav."],
    [/\bregeneration\b/g, "regen."], [/\btreatment\b/g, "treat."], [/\belectrowinning\b/g, "EW"], [/\bultra fine grinding\b/g, "UFG"], [/\bexisting\b/g, "exist."],
    [/\bintensive leaching\b/g, "ILR"], [/\bhandling\b/g, "hand."], [/\bfiltration\b/g, "filt."], [/\btailings\b/g, "tails"], [/\bservices\b/g, "svcs"], [/\bgeneral\b/g, "gen."],
    [/\bprimary\b/g, "prim."], [/\bcircuit\b/g, "circ."], [/\bstorage\b/g, "stor."], [/\breagents\b/g, "reag."], [/\bcarbon\b/g, "carb."]];
  const wbsName = c => { let t = (WBS[c] || "").replace(/\s+-\s+/g, ", ").toLowerCase(); SHORT.forEach(([r, v]) => t = t.replace(r, v));
    return t.replace(/^./, x => x.toUpperCase()).replace(/\b(cil\d?|ufg|ew|ilr)\b/gi, x => x.toUpperCase()).replace(/\barea ([a-z])\b/, (m, x) => "area " + x.toUpperCase()); };
  const fullName = c => { const f = (typeof FRAMES != "undefined" ? FRAMES : []).find(fr => (String(fr.label).match(/^F\d+/) || [])[0] === c), m = f && f.label.match(/^F\d+\s*-\s*(.*?)(\s*\(.*)?$/);
    return m ? m[1].replace(/^CIL\d\s+/i, "").toLowerCase().replace(/(^|[\s/&,])([a-z])/g, (x, a, b) => a + b.toUpperCase()).replace(/\bCil(\d)/gi, "CIL$1").replace(/\bUfg\b/g, "UFG").replace(/\bEw\b/g, "EW") : wbsName(c); };
  const HUE = [42, 200, 140, 330, 20, 265, 95, 180, 0, 300];
  let areas = [], byCode = {};
  function hull(P){   // convex hull, monotone chain
    P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    P.forEach(p => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    P.slice().reverse().forEach(p => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // the outline of several convex parts joined by necks (half width w, metres): the union is drawn on a 2 m grid and its
  // edge traced (marching squares), the longest loop kept
  function outline(rings, necks, w){
    const inPoly = (R, x, y) => { let s = 0; for (let i = 0; i < R.length; i++){ const a = R[i], b = R[(i + 1) % R.length], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c > 0) s |= 1; else if (c < 0) s |= 2; if (s === 3) return false; } return true; };
    const nearSeg = (a, b, x, y) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= w; };
    const pts = rings.flat(), C = 2, x0 = Math.min(...pts.map(p => p[0])) - 3 * C, y0 = Math.min(...pts.map(p => p[1])) - 3 * C;
    const nx = Math.ceil((Math.max(...pts.map(p => p[0])) + 3 * C - x0) / C) + 1, ny = Math.ceil((Math.max(...pts.map(p => p[1])) + 3 * C - y0) / C) + 1;
    const G = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){ const x = x0 + i * C, y = y0 + j * C;
      G[j * nx + i] = rings.some(R => inPoly(R, x, y)) || necks.some(([a, b]) => nearSeg(a, b, x, y)) ? 1 : 0; }
    const v = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny) ? 0 : G[j * nx + i], next = new Map(), key = p => p[0] + "," + p[1];
    // edges between inside and outside cells, directed so the inside is on the left; chained into loops
    for (let j = -1; j < ny; j++) for (let i = -1; i < nx; i++){
      const a = v(i, j), r = v(i + 1, j), d = v(i, j + 1);
      if (a !== r){ const p = [i + .5, j - .5], q = [i + .5, j + .5]; a ? next.set(key(q), p) : next.set(key(p), q); }
      if (a !== d){ const p = [i - .5, j + .5], q = [i + .5, j + .5]; a ? next.set(key(p), q) : next.set(key(q), p); } }
    let best = [];
    while (next.size){ const [k0] = next.keys(), loop = []; let k = k0;
      while (next.has(k)){ const p = next.get(k); next.delete(k); loop.push(p); k = key(p); }
      if (loop.length > best.length) best = loop; }
    let out = best.filter((p, i) => i % 2 === 0).map(p => [x0 + p[0] * C, y0 + p[1] * C]);
    for (let n = 0; n < 3; n++) out = out.map((p, i) => { const a = out[(i + out.length - 1) % out.length], c = out[(i + 1) % out.length]; return [(a[0] + 2 * p[0] + c[0]) / 4, (a[1] + 2 * p[1] + c[1]) / 4]; });   // soften the grid steps
    return out;
  }
  function drawAreas(){
    if (!map) return;
    areas.forEach(a => { map.removeLayer(a.poly); map.removeLayer(a.lab); }); areas = [];
    const ED = typeof EQUIP_DATA !== "undefined" ? EQUIP_DATA : {}, by = {};
    api.NODES.forEach(nd => { if (!LAYOUT.nodes[nd.id] || LAYOUT.nodes[nd.id].est) return; const c = {};   // major equipment only (on the drawings)
      ((ED[nd.id] && ED[nd.id].eq) || []).forEach(r => { const m = /^F\d\d/.exec(r.tag || ""); if (m) c[m[0]] = (c[m[0]] || 0) + 1; });
      const code = Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b))[0]; if (code) (by[code] = by[code] || []).push(nd.id); });
    byCode = by;
    const o = LAYOUT.home[0];
    Object.keys(by).sort().forEach((code, ci) => {
      // split far apart groups of one area (single linkage, 120 m)
      const pts = by[code].map(id => ({ id, m: toM(pos(id), o) })), groups = [];
      pts.forEach(p => { const near = groups.filter(g => g.some(q => Math.hypot(q.m[0] - p.m[0], q.m[1] - p.m[1]) < 120));
        if (!near.length) return groups.push([p]);
        near.slice(1).forEach(b => { near[0].push(...b); groups.splice(groups.indexOf(b), 1); }); near[0].push(p); });
      // parts of one area within 300 m of each other join up: each keeps its outline, a narrow neck runs between the
      // nearest pieces of equipment (a minimum spanning tree, so no loops); further parts stay on their own
      const gap = (a, b) => { let d = 1e9, pa, pb; a.forEach(p => b.forEach(q => { const x = Math.hypot(p.m[0] - q.m[0], p.m[1] - q.m[1]); if (x < d){ d = x; pa = p; pb = q; } })); return { d, pa, pb }; };
      const clusters = []; groups.forEach(g => { const near = clusters.filter(c => c.some(h => gap(g, h).d < 300));
        if (!near.length) return clusters.push([g]); near.slice(1).forEach(c => { near[0].push(...c); clusters.splice(clusters.indexOf(c), 1); }); near[0].push(g); });
      const hue = HUE[ci % HUE.length], mine = [];
      clusters.forEach(cl => {
        const ring = g => { const P = []; g.forEach(p => { const r = reach(p.id) + 14; for (let k = 0; k < 12; k++) P.push([p.m[0] + r * Math.cos(k * Math.PI / 6), p.m[1] + r * Math.sin(k * Math.PI / 6)]); }); return hull(P); };
        const rings = cl.map(ring), necks = [];
        for (const inT = [0]; inT.length < cl.length;){ let b = null;
          inT.forEach(i => cl.forEach((g, j) => { if (inT.includes(j)) return; const x = gap(cl[i], g); if (!b || x.d < b.d) b = { ...x, j }; }));
          inT.push(b.j); necks.push([b.pa.m, b.pb.m]); }
        const shape = cl.length > 1 ? outline(rings, necks, 7) : rings[0], all = cl.flat();
        const poly = L.polygon(shape.map(m => toLL(m, o)), { renderer: rend, className: "lo-area", color: `hsl(${hue} 85% 62%)`, weight: 1.5, fillColor: `hsl(${hue} 85% 55%)`, fillOpacity: .22, smoothFactor: 0 }).addTo(map);
        const big = cl.slice().sort((a, b) => b.length - a.length)[0], cx = big.reduce((t, p) => t + p.m[0], 0) / big.length, cy = big.reduce((t, p) => t + p.m[1], 0) / big.length;   // the label sits on the biggest part
        const lab = L.marker(toLL([cx, cy], o), { icon: L.divIcon({ className: "lo-area-lab", html: `<i class="la-ld" style="--h:${hue}"></i><span style="--h:${hue}" title="${esc(code + " (" + wbsName(code) + ")")}"><b>${code}</b><em class="la-n">${esc(wbsName(code))}</em></span>`, iconSize: null }), keyboard: false, zIndexOffset: 500 }).addTo(map);
        // a tap shows the whole area, every part of it, however far apart
        const go = e => { L.DomEvent.stopPropagation(e); const add = e.originalEvent && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);
          wbsFilter(add ? (wf.has(code) ? [...wf].filter(c => c !== code) : [...wf, code]) : [code], true);
          if (add) return; const b = L.featureGroup(mine).getBounds(); map.flyTo(b.getCenter(), Math.min(18.5, Math.max(AREA_Z + 1, map.getBoundsZoom(b, false, [40, 40]))), { duration: .6 }); flash(code); };
        poly.on("click", go); lab.on("click", go); mine.push(poly);
        areas.push({ code, poly, lab, n: all.length, hue });
      });
    });
    declutterAreas(); wbsPanel(); wbsMark();
  }
  // WBS buttons in the map's top right corner, A to Z like the Smart PFD's flow list: tap one to fly to that area
  // (all its zones) and flash it. Folds to one button on a phone.
  let wbsOn = null;
  function wbsPanel(){
    let el = $("loWbs");
    if (!el){ el = document.createElement("div"); el.id = "loWbs"; el.className = "lo-pan lo-wbs shut"; $("loHome").after(el); }
    const codes = [...new Set(areas.map(a => a.code))].sort();
    el.innerHTML = `<button class="lo-wh" type="button">WBS filters<span>▾</span></button><div class="lo-wl">` +
      codes.map(c => `<button class="flow${wf.has(c) ? " on" : ""}" data-w="${c}" type="button"><i style="background:hsl(${areas.find(a => a.code === c).hue} 85% 55%)"></i><b>${c}</b><span>${esc(wbsName(c))}</span></button>`).join("") + `</div>`;
    el.querySelector(".lo-wh").onclick = () => el.classList.toggle("shut");
    el.querySelectorAll("[data-w]").forEach(b => b.onclick = e => {
      const c = b.dataset.w, zs = areas.filter(a => a.code === c); if (!zs.length) return;
      if (e.ctrlKey || e.metaKey){ wbsFilter(wf.has(c) ? [...wf].filter(x => x !== c) : [...wf, c], true); return; }
      const bb = zs.reduce((u, a) => u.extend(a.poly.getBounds()), L.latLngBounds(zs[0].poly.getBounds().getSouthWest(), zs[0].poly.getBounds().getNorthEast()));
      map.flyToBounds(bb, { padding: [50, 50], maxZoom: 18.5, duration: .6 });
      wbsOn = c; wbsFilter([c], true);
      if (matchMedia("(max-width: 700px)").matches) el.classList.add("shut");
      if (PH) layers(false);
      flash(c);
    });
  }
  // The WBS filter: a zone tapped (or picked from WBS filters or the side panel) keeps that zone, its name, its equipment
  // and the lines touching it as they are while everything else fades to grey. Ctrl+click adds or removes a zone;
  // Esc, a tap on the map outside the zones or the ✕ on the chip (phone) clears it.
  let wf = new Set(), wfCb = null;
  const inRing = (ll, R) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++){ const a = R[i], b = R[j];
    if ((a.lat > ll.lat) !== (b.lat > ll.lat) && ll.lng < (b.lng - a.lng) * (ll.lat - a.lat) / (b.lat - a.lat) + a.lng) c = !c; } return c; };
  const inWbs = ll => areas.some(a => wf.has(a.code) && inRing(ll, a.poly.getLatLngs()[0]));
  function wbsFilter(codes, user){
    const n = new Set(codes || []); if (n.size === wf.size && [...n].every(c => wf.has(c))) return;
    wf = n; wbsOn = wf.size === 1 ? [...wf][0] : null; wbsMark(); if (user && wfCb) wfCb([...wf]);
  }
  let head = null;
  function wbsMark(){
    if (!map) return; const on = wf.size > 0, ids = new Set(); wf.forEach(c => (byCode[c] || []).forEach(id => ids.add(id)));
    $("mapView").classList.toggle("wf", on);
    areas.forEach(a => { const k = wf.has(a.code); if (a.poly._path) a.poly._path.classList.toggle("wf-in", k); const e = a.lab.getElement(); if (e) e.classList.toggle("wf-in", k); });
    Object.keys(N).forEach(id => { const e = N[id].lay && N[id].lay.getElement(); if (e) e.classList.toggle("wf-in", ids.has(id)); });
    Object.values(S).forEach(o => { const k = ids.has(o.s.f) || ids.has(o.s.to); [o.lay._path, o.mid && o.mid._path].forEach(q => q && q.classList.toggle("wf-in", k)); });
    const el = $("loWbs"); if (el) el.querySelectorAll("[data-w]").forEach(x => x.classList.toggle("on", wf.has(x.dataset.w)));
    let chip = $("loWf"); if (!chip){ chip = document.createElement("button"); chip.type = "button"; chip.id = "loWf"; chip.className = "lo-wf"; $("mapView").appendChild(chip);
      L.DomEvent.disableClickPropagation(chip); chip.onclick = () => wbsFilter([], true); }
    // one area picked: its name in a label just above it (the zones' combined top edge)
    if (head){ head.remove(); head = null; }
    if (wf.size === 1){ const c = [...wf][0], zs = areas.filter(a => a.code === c); if (zs.length){
      const bb = zs.reduce((u, a) => u.extend(a.poly.getBounds()), L.latLngBounds(zs[0].poly.getBounds().getSouthWest(), zs[0].poly.getBounds().getNorthEast()));
      head = L.marker([bb.getNorth(), bb.getCenter().lng], { icon: L.divIcon({ className: "lo-whd", html: `<span style="--h:${zs[0].hue}"><b>${esc(c)} –</b> ${esc(fullName(c))}</span>`, iconSize: null }), interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(map); } }
    chip.hidden = !on; if (on){ const c = [...wf].sort(); chip.innerHTML = `<b>${c.length === 1 ? esc(c[0] + " " + wbsShort(c[0])) : esc(c.join(", "))}</b><i aria-label="Clear">✕</i>`; }
  }
  const wbsShort = c => wbsName(c).split(/[,(&]| and /)[0].trim().split(" ").slice(0, 2).join(" ");
  addEventListener("keydown", e => { if (e.key === "Escape" && on && wf.size && !moving) wbsFilter([], true); });
  // area labels (the code; the name is in the WBS panel) never overlap: biggest areas first, the rest wait for a closer zoom
  function declutterAreas(){
    if (!map) return;
    const mv = $("mapView").classList;
    areas.forEach(a => { const e = a.lab.getElement(); if (!e) return; const sp = e.querySelector("span"), ld = e.querySelector(".la-ld");
      sp.style.removeProperty("--dx"); sp.style.removeProperty("--dy"); sp.classList.remove("col"); ld.style.display = ""; const sv = e.querySelector(".la-sv"); if (sv) sv.style.display = ""; });
    if (mv.contains("stack")) return stackAreas();
    if (!mv.contains("areas")) return;
    return colAreas();
    const placed = [], hit = r => placed.some(b => r.left < b.right + 4 && r.right > b.left - 4 && r.top < b.bottom + 3 && r.bottom > b.top - 3);
    areas.slice().sort((a, b) => b.n - a.n).forEach(a => { const sp = a.lab.getElement() && a.lab.getElement().querySelector("span"); if (!sp) return;
      sp.classList.remove("off");
      const r = sp.getBoundingClientRect(); if (!hit(r)) return placed.push(r);
      sp.classList.add("off"); });
  }
  // Zoomed right out: each area's code and name beside its own zone, pointing away from the plant (zones on the left
  // out to the left, on the right to the right, the top ones up, the bottom ones down), joined by a short leader; it
  // keeps off the zones if it can, never sits on its own, and tries the other sides when there's no room
  // (an area in several zones labels once, on its biggest)
  function colAreas(){
    const box = $("mapView").getBoundingClientRect(), W = box.width, H = box.height, ph = document.documentElement.classList.contains("phone");
    const big = {}; areas.forEach(a => { if (!big[a.code] || a.n > big[a.code].n) big[a.code] = a; });
    const its = []; areas.forEach(a => { const e = a.lab.getElement(); if (!e) return; const sp = e.querySelector("span");
      if (big[a.code] !== a){ sp.classList.add("off"); return; }
      sp.classList.remove("off"); sp.classList.add("col"); its.push({ a, e, sp, p: map.latLngToContainerPoint(a.lab.getLatLng()) }); });
    const pt = ll => map.latLngToContainerPoint(ll), bb = a => { const b = a.poly.getBounds(), p = pt(b.getNorthWest()), q = pt(b.getSouthEast()); return [p.x, p.y, q.x, q.y]; };
    const polys = areas.map(a => ({ a, P: a.poly.getLatLngs().flat(2).map(pt) }));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; areas.forEach(a => { const [p, q, r, t] = bb(a); x0 = Math.min(x0, p); y0 = Math.min(y0, q); x1 = Math.max(x1, r); y1 = Math.max(y1, t); });
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, sx = (x1 - x0) / 2 || 1, sy = (y1 - y0) / 2 || 1;
    const tl = $("loTL"), nb = document.querySelector("#mapView .lo-north"), bt = el => el ? el.getBoundingClientRect().bottom - box.top : 0;
    const TOP = Math.max(50, bt(tl && tl.querySelector(".lo-pans"))) + 4, BOT = H - (ph ? 76 : 26), RGT = W - (ph ? 4 : 60), NR = nb ? nb.getBoundingClientRect().left - box.left : W;
    const inP = (P, X, Y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++){ const a = P[i], b = P[j]; if ((a.y > Y) !== (b.y > Y) && X < (b.x - a.x) * (Y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
    const onZ = (r, list) => list.some(({ P }) => P.some(q => q.x > r.l - 3 && q.x < r.r + 3 && q.y > r.t - 3 && q.y < r.b + 3) || [[r.l, r.t], [r.r, r.t], [r.l, r.b], [r.r, r.b], [(r.l + r.r) / 2, (r.t + r.b) / 2]].some(([x, y]) => inP(P, x, y)));
    const taken = [], inside = r => r.l > 4 && r.r < RGT && r.t > TOP && r.b < BOT && !(r.r > NR - 4 && r.t < bt(nb) + 4);
    const clear = r => !taken.some(q => r.l < q.r + 3 && r.r > q.l - 3 && r.t < q.b + 2 && r.b > q.t - 2);
    its.sort((p, q) => { const s = a => { const [l, t, r, b] = bb(a); return (r - l) * (b - t); }; return s(q.a) - s(p.a); }).forEach(it => {
      const w = it.sp.offsetWidth, h = it.sp.offsetHeight, [bl, btp, br, bbm] = bb(it.a), dx = (it.p.x - cx) / sx, dy = (it.p.y - cy) / sy;
      const want = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "l" : "r") : (dy < 0 ? "u" : "d");
      const order = want === "l" || want === "r" ? [want, dy < 0 ? "u" : "d", dy < 0 ? "d" : "u", want === "l" ? "r" : "l"] : [want, dx < 0 ? "l" : "r", dx < 0 ? "r" : "l", want === "u" ? "d" : "u"];
      const own = polys.filter(z => z.a.code === it.a.code);
      let got = null;
      // each side in turn: first clear of every zone, then (failing that) clear of its own only; further out step by step, sliding along
      for (const strict of [true, false]) for (const dir of order){ if (got) break;
        for (let g = 0; g < 10 && !got; g++) for (let k = 0; k < 24 && !got; k++){ const G = 10 + g * 16, sh = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (dir === "u" || dir === "d" ? 10 : 6);
          const x = dir === "l" ? bl - G - w : dir === "r" ? br + G : it.p.x - w / 2 + sh, y = dir === "u" ? btp - G - h : dir === "d" ? bbm + G : it.p.y - h / 2 + sh;
          const r = { l: x, r: x + w, t: y, b: y + h };
          if (inside(r) && clear(r) && !onZ(r, strict ? polys : own)) got = { r, dir }; }
        if (got) break; }
      if (!got){ const x = Math.min(RGT - w, Math.max(4, it.p.x + 8)), y = Math.min(BOT - h, Math.max(TOP, it.p.y - h / 2)); got = { r: { l: x, r: x + w, t: y, b: y + h }, dir: "r" }; }
      taken.push(got.r);
      const { r, dir } = got;
      it.sp.style.setProperty("--dx", r.l - it.p.x + "px"); it.sp.style.setProperty("--dy", r.t + h / 2 - it.p.y + "px");
      // the leader: from the label's near edge to the area's own spot
      const ex = (dir === "l" ? r.r : dir === "r" ? r.l : Math.max(r.l + 2, Math.min(r.r - 2, it.p.x))) - it.p.x, ey = (dir === "u" ? r.b : dir === "d" ? r.t : r.t + h / 2) - it.p.y;
      let sv = it.e.querySelector(".la-sv"); if (!sv){ sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.setAttribute("class", "la-sv"); sv.innerHTML = "<polyline/><circle r='2.2'/>"; it.e.prepend(sv); }
      sv.style.setProperty("--h", it.a.hue); sv.style.display = "block"; sv.firstChild.setAttribute("points", `${ex},${ey} 0,0`); });
  }

  // Plant view (callout stacks): the zones show as outlines only (stackAreas)
  const ROWH = 30;
  // an area's zones flash a few times (picked from WBS filters or tapped on the map); they show while flashing at any zoom
  function flash(code){ areas.filter(a => a.code === code).forEach(a => { const p = a.poly._path; if (!p) return;
    p.classList.remove("pick"); void p.getBoundingClientRect(); p.classList.add("pick"); setTimeout(() => p.classList.remove("pick"), 2600); }); }
  // the codes in view, split into the top and bottom rows; a row too wide for the screen (a phone) wraps onto more lines,
  // every other code on the next line so each line still spans the plant and the leaders stay short
  const RB = 52;   // the bottom row stays clear of the map's corner buttons (info, full screen)
  let gapL = 0, gapR = 0;   // inner edges of the name columns (stackOut)
  const gap = W => gapR - gapL > 160 && gapL >= 0 && gapR <= W ? [gapL + 8, gapR - 8] : [12, W - 12];
  function planAreas(){
    const box = $("mapView").getBoundingClientRect(), W = box.width, H = box.height, G = 8, rows = [[], []];
    areas.forEach(a => { const e = a.lab.getElement(); if (!e) return; const sp = e.querySelector("span");
      const p = map.latLngToContainerPoint(a.lab.getLatLng()); if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) return;
      rows[0].push({ a, e, sp, p, w: sp.offsetWidth }); });   // every code along the top (as many rows as it takes)
    const lines = rows.map(row => { row.sort((x, y) => x.p.x - y.p.x);
      const [gl, gr] = gap(W), nl = Math.max(1, Math.ceil((row.reduce((t, r) => t + r.w + G, 0) - G) / (gr - gl)));
      row.forEach((r, k) => r.ln = k % nl); return nl; });
    return { W, H, G, rows, lines };
  }
  // plant view: the zones keep their outlines but no codes (too crowded beside the name columns; the codes and names show
  // zoomed right out)
  function stackAreas(){
    areas.forEach(a => { const e = a.lab.getElement(); if (e) e.querySelector("span").classList.add("off"); }); return;
    const { W, H, G, rows } = planAreas();
    const tl = $("loTL"), top = (tl ? tl.querySelector(".lo-pans").getBoundingClientRect().bottom - $("mapView").getBoundingClientRect().top : 50) + ROWH / 2 + 4, bot = H - ROWH / 2 - 6;
    areas.forEach(a => { const e = a.lab.getElement(); if (e) e.querySelector("span").classList.add("off"); });
    rows.forEach((row, ri) => { const nl = Math.max(0, ...row.map(r => r.ln)) + 1;
      for (let ln = 0; ln < nl; ln++){ const line = row.filter(r => r.ln === ln);
        // side by side, left to right in plant order, the row centred between the two name columns
        const [gl, gr] = gap(W), tw = line.reduce((t, r) => t + r.w + G, 0) - G; let cur = Math.max(gl, (gl + gr) / 2 - tw / 2);
        line.forEach(r => { r.sp.classList.remove("off"); r.x = cur; cur += r.w + G; });
        // the first line sits at the edge of the map, further lines step in towards the plant
        line.forEach(r => { const tx = r.x + r.w / 2, ty = ri ? bot - ln * ROWH : top + ln * ROWH, dx = tx - r.p.x, dy = ty - r.p.y;
          r.sp.style.setProperty("--dx", dx + "px"); r.sp.style.setProperty("--dy", dy + "px");
          const ld = r.e.querySelector(".la-ld"); ld.style.display = "block"; ld.style.width = Math.hypot(dx, dy) + "px"; ld.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`; }); } });
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
        else api.toast("Position saved on this device. Use Map options → Moves to send it in.");
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
    declutter(); if (wf.size) wbsMark();
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
    return `<div class="lo-mv"><span>To move it: press and hold its box on the map for half a second, then drag. ${mine ? "Position moved on this device." : est ? "Position estimated: not identified on the layout drawings. Please move it if you know where it is." : "Placed from the layout drawings (about ±5 m)."}</span>${mine ? `<button class="hbtn" id="loReset">↺ Reset position</button>` : ""}</div>` +
      (m && m.gap ? `<div class="lo-gap">${!m.rows.length ? "This block has no matching MEL entry." : "Tag" + (m.missing.length > 1 ? "s" : "") + " with no MEL row: " + esc(m.missing.join(", ")) + "."}</div>` : "");
  }
  function bindPanel(n){
    const r = $("loReset"); if (r) r.onclick = () => { delete saved[n.id]; save(); redrawNode(n.id); redrawStreamsOf(n.id); sync(false); expLabel(); api.refreshPanel(); };
  }
  function expLabel(){ const n = Object.keys(saved).length, b = $("loExp"); if (b){ b.textContent = `Moves (${n})`; b.disabled = !n; } }
  function exportMoves(){
    const out = { exported: new Date().toISOString(), note: "Smart PFD layout positions moved on this device ([lat, lng]). Send to be built into tools/build_layout.py.", moves: {} };
    Object.entries(saved).forEach(([id, p]) => { const n = api.byId[id]; out.moves[id] = { ll: p, name: n ? n.n : id, tag: n ? n.tag : "" }; });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
    a.download = `kcgm-layout-moves-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- phone ----------
  // Map or List at the top (the map first); one Layers button opens a sheet with the three menus as tabs: Areas (the WBS
  // filters), Flows (the flow filters) and Map (the map options)
  const PH = document.documentElement.classList.contains("phone");
  let lsh = null, lscrim = null, lbtn = null, list = null;
  function layers(on, tab){
    if (!lsh) return; lsh.hidden = lscrim.hidden = !on; lbtn.classList.toggle("on", on);
    if (tab) lsh.querySelectorAll("[data-lt]").forEach(b => { const me = b.dataset.lt === tab; b.classList.toggle("on", me); $(b.dataset.p).hidden = !me; });
  }
  function phoneSetup(){
    const mv = $("mapView");
    // the switch
    const sw = document.createElement("div"); sw.className = "lo-sw"; sw.innerHTML = `<button data-v="map" class="on">Map</button><button data-v="list">List</button>`;
    mv.appendChild(sw); L.DomEvent.disableClickPropagation(sw);
    list = document.createElement("div"); list.className = "lo-list"; list.hidden = true; mv.appendChild(list); L.DomEvent.disableClickPropagation(list); L.DomEvent.disableScrollPropagation(list);
    sw.querySelectorAll("button").forEach(b => b.onclick = () => view(b.dataset.v));
    // the Layers button and its sheet (in the page, above the map)
    lbtn = document.createElement("button"); lbtn.type = "button"; lbtn.className = "lo-lb"; lbtn.textContent = "▣ Layers"; mv.appendChild(lbtn); L.DomEvent.disableClickPropagation(lbtn);
    lscrim = document.createElement("div"); lscrim.className = "lo-scrim"; lscrim.hidden = true;
    lsh = document.createElement("div"); lsh.className = "lo-sh"; lsh.hidden = true;
    lsh.innerHTML = `<div class="lo-shh"><div class="lo-seg lo-tabs"><button data-lt="areas" data-p="loShA" class="on">Areas</button><button data-lt="map" data-p="loShM">Map</button></div><button type="button" class="lo-done">Done</button></div>
      <div class="lo-shb" id="loShA"></div><div class="lo-shb" id="loShF" hidden></div><div class="lo-shb" id="loShM" hidden></div>`;
    document.body.append(lscrim, lsh);
    let wb = $("loWbs"); if (!wb){ wb = document.createElement("div"); wb.id = "loWbs"; wb.className = "lo-pan lo-wbs"; }
    $("loShA").appendChild(wb); $("loShF").appendChild($("loFF")); $("loShM").appendChild($("loMO"));
    lsh.querySelectorAll("[data-lt]").forEach(b => b.onclick = () => layers(true, b.dataset.lt));
    lbtn.onclick = () => layers(lsh.hidden, null); lscrim.onclick = lsh.querySelector(".lo-done").onclick = () => layers(false);
  }
  function view(v){
    const sw = $("mapView").querySelector(".lo-sw"); sw.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
    list.hidden = v !== "list"; $("mapView").classList.toggle("listing", v === "list"); document.body.classList.toggle("lo-listing", v === "list"); if (v === "list") drawList(); else map.invalidateSize();
  }
  // the list: every WBS area with its equipment; an item opens on the map (flown to and selected)
  let listOpen = null;
  function drawList(){
    const codes = Object.keys(byCode).sort();
    list.innerHTML = codes.map(c => { const a = areas.find(x => x.code === c), ids = byCode[c].slice().sort((x, y) => String(api.byId[x] && api.byId[x].n).localeCompare(String(api.byId[y] && api.byId[y].n)));
      return `<button class="lo-lr${c === listOpen ? " open" : ""}" data-c="${c}"><i style="background:hsl(${a ? a.hue : 0} 85% 55%)"></i><b>${c}</b><span>${esc(wbsName(c))}</span><em>${ids.length}</em></button>` +
        (c === listOpen ? `<div class="lo-le">${ids.map(id => { const n = api.byId[id] || {}; return `<button data-id="${esc(id)}"><b>${esc(n.n || id)}</b><span>${esc(n.tag || "")}</span></button>`; }).join("")}</div>` : ""); }).join("");
    list.querySelectorAll(".lo-lr").forEach(b => b.onclick = () => { listOpen = listOpen === b.dataset.c ? null : b.dataset.c; const y = list.scrollTop; drawList(); list.scrollTop = y; });
    list.querySelectorAll(".lo-le button").forEach(b => b.onclick = () => { const id = b.dataset.id; view("map");
      setTimeout(() => { map.flyTo(pos(id), Math.max(map.getZoom(), 19), { duration: .6 }); api.pick(null, { k: "n", id }); }, 60); });
  }

  // ---------- show / hide ----------
  async function show(v){
    on = v; document.body.classList.toggle("layout", v); $("mapView").hidden = !v;
    const mleg = $("mleg");
    if (!v){ if (moving) moving.cancel(); if (PH) layers(false); document.body.classList.remove("lo-listing"); if (mleg && mleg.closest("#loFF,#fxFlow")) { document.body.appendChild(mleg); dispatchEvent(new Event("resize")); } return true; }
    try { await load(); } catch (e) { api.toast("Couldn't load the map (" + e.message + "). Check the connection."); on = false; document.body.classList.remove("layout"); $("mapView").hidden = true; return false; }
    if (!map){ build(); markers(); Object.values(S).forEach(o => { arrow(o.lay, o.s.ty); arrow(o.mid, o.s.ty); }); if (PH) phoneSetup(); }

    if (PH && list && !list.hidden) document.body.classList.add("lo-listing");
    setTimeout(declutter, 50);
    map.invalidateSize(); sync(false); return true;
  }
  return {
    init(a){ api = a; },
    show, active: () => on, zoom: z => map && (z == null ? map.getZoom() : map.setZoom(z, { animate: false })), sync: z => on && sync(z), panelHtml, bindPanel, declutter: () => map && declutter(),
    zoomBy: d => map && (d > 0 ? map.zoomIn(.75) : map.zoomOut(.75)), home: () => map && home(true),
    focus: id => { if (map && LAYOUT.nodes[id]) map.flyTo(pos(id), Math.max(map.getZoom(), 19), { duration: .6 }); },
    // fly to a WBS area (all its zones) and flash it, as the WBS filters do
    wbs: (codes, fly) => { if (!map) return false; wbsFilter(codes || []); if (fly && codes && codes.length){ const zs = areas.filter(a => codes.includes(a.code)); if (zs.length){
        const bb = zs.reduce((u, a) => u.extend(a.poly.getBounds()), L.latLngBounds(zs[0].poly.getBounds().getSouthWest(), zs[0].poly.getBounds().getNorthEast()));
        map.flyToBounds(bb, { padding: [50, 50], maxZoom: 18.5, duration: .6 }); codes.forEach(flash); } } return true; },
    onWbs: f => { wfCb = f; }, wbsOn: () => [...wf], wbsIds: () => { const ids = new Set(); wf.forEach(c => (byCode[c] || []).forEach(id => ids.add(id))); return ids; },
    area: c => { const zs = areas.filter(a => a.code === c); if (!map || !zs.length) return false;
      const bb = zs.reduce((u, a) => u.extend(a.poly.getBounds()), L.latLngBounds(zs[0].poly.getBounds().getSouthWest(), zs[0].poly.getBounds().getNorthEast()));
      map.flyToBounds(bb, { padding: [50, 50], maxZoom: 18.5, duration: .6 }); flash(c); return true; }
  };
})();
