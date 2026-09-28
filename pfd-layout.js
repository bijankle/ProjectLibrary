// Layout view of the Smart PFD: the same equipment and streams placed on the real plant (satellite map).
// Positions come from pfd-layout-data.js (built by tools/build_layout.py from the FIM 1 / FIM 2 layout drawings).
// Selection, flows, stage and the info panel are shared with the schematic: pfd.html hands over an api and calls
// PFDLayout.sync() whenever what is highlighted changes. Leaflet is loaded the first time the layout is opened.
// Anyone can correct a position: Move on the item's panel, drag, Done. Moves are kept on the device and can be exported.
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
    map.on("zoomend", zoomCls); zoomCls(); map.on("moveend", () => setTimeout(declutter, 0));
    map.on("click", () => { if (moving) return; api.clearSel(true); api.closeInfo(); });
    // corner controls: imagery, dim, home, export
    const bar = L.DomUtil.create("div", "lo-bar"); bar.innerHTML =
      `<div class="lo-seg">${[["sat", "Satellite"], ["hyb", "Hybrid"], ["esri", "Esri"]].map(([k, t]) => `<button data-b="${k}">${t}</button>`).join("")}</div>
       <button class="lo-b" id="loDim" title="Dim the photo so the overlay reads better">◐ Dim</button>
       <button class="lo-b" id="loHome" title="Back to the processing plant">⌂ Plant</button>
       <button class="lo-b" id="loExp" title="Download the positions moved on this device, to send in">⬇ Moves</button>`;
    $("mapView").appendChild(bar); L.DomEvent.disableClickPropagation(bar); L.DomEvent.disableScrollPropagation(bar);
    bar.querySelectorAll("[data-b]").forEach(b => b.onclick = () => setBase(b.dataset.b));
    $("loHome").onclick = () => home(true);
    const dim = () => $("mapView").classList.toggle("dim", api.pref.get("lo_dim", "1") === "1");
    $("loDim").onclick = () => { api.pref.set("lo_dim", api.pref.get("lo_dim", "1") === "1" ? "0" : "1"); dim(); }; dim();
    $("loExp").onclick = exportMoves; expLabel();
    const done = L.DomUtil.create("div", "lo-done"); done.id = "loDone"; done.innerHTML = `<span>Drag the marker to the item's real position</span><button id="loDoneB">✓ Done</button><button id="loCancel">Cancel</button>`;
    $("mapView").appendChild(done); L.DomEvent.disableClickPropagation(done);
    $("loDoneB").onclick = () => stopMove(true); $("loCancel").onclick = () => stopMove(false);
    addEventListener("keydown", e => { if (e.key === "Escape" && moving) stopMove(false); });
    api.NODES.forEach(drawNode);
    api.STREAMS.forEach(drawStream);
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
    c.toggle("zl1", z >= 17.75); c.toggle("zl2", z >= 19);
    declutter();
  }
  // labels never overlap: selected first, then highlighted, then big items, then the rest
  function declutter(){
    const labs = [];
    Object.values(N).forEach(o => { const t = o.lay.getTooltip(), e = t && t._container; if (!e) return; e.classList.remove("dc");
      labs.push({ e, pr: e.classList.contains("sel") ? 0 : e.classList.contains("hl") ? 1 : e.classList.contains("big") ? 2 : 3 }); });
    labs.sort((a, b) => a.pr - b.pr);
    const boxes = [];
    labs.forEach(l => { if (getComputedStyle(l.e).display === "none") return; const r = l.e.getBoundingClientRect(); if (!r.width) return;
      if (boxes.some(b => r.left < b.right + 3 && r.right > b.left - 3 && r.top < b.bottom + 1 && r.bottom > b.top - 1)) l.e.classList.add("dc"); else boxes.push(r); });
  }
  // arrowheads, one per stream colour
  function markers(){
    const svg = rend._container; if (!svg || svg.querySelector("defs")) return;
    const d = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    d.innerHTML = Object.entries(api.STREAM_TYPES).map(([k, t]) => `<marker id="loA-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto"><path d="M0 0L10 5L0 10z" style="fill:${t.color}"/></marker>`).join("");
    svg.insertBefore(d, svg.firstChild);
  }

  // ---------- equipment ----------
  function shapeLayer(id){
    const n = LAYOUT.nodes[id], p = pos(id), sh = n.sh, cls = "lo-n" + (n.est ? " est" : "") + (sh ? " big" : " dot");
    if (!sh) return L.circleMarker(p, { renderer: rend, radius: 4.5, className: cls });
    if (sh[0] === "c") return L.circle(p, { renderer: rend, radius: sh[1], className: cls });
    const w = sh[1] / 2, h = sh[2] / 2;
    const pts = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([a, b]) => toLL([a * ux[0] + b * uy[0], a * ux[1] + b * uy[1]], p));
    return L.polygon(pts, { renderer: rend, className: cls });
  }
  function drawNode(nd){
    const id = nd.id; if (!LAYOUT.nodes[id]) return;
    const o = N[id] = { lay: shapeLayer(id) };
    o.lay.addTo(map).bindTooltip(esc(nd.sn || nd.n), { permanent: true, direction: "top", className: "lo-lab" + (LAYOUT.nodes[id].sh ? " big" : ""), offset: [0, -4], opacity: 1 });
    o.lay.on("click", e => { L.DomEvent.stopPropagation(e); if (moving) return; api.pick(e.originalEvent, { k: "n", id }); });
  }
  function redrawNode(id){
    const o = N[id], tip = o.lay.getTooltip(), cls = o.lay._path && o.lay._path.getAttribute("class");
    map.removeLayer(o.lay); o.lay = shapeLayer(id); o.lay.addTo(map).bindTooltip(tip.getContent(), tip.options);
    o.lay.on("click", e => { L.DomEvent.stopPropagation(e); if (moving) return; api.pick(e.originalEvent, { k: "n", id }); });
    if (cls && o.lay._path) o.lay._path.setAttribute("class", cls);
  }

  // ---------- streams ----------
  const pairIx = {};
  function pathFor(s){
    const a = pos(s.f), b = pos(s.to), o = a;
    if (s.f === s.to){   // recycle onto itself: small loop beside the item
      const r = reach(s.f) + 5, c = toM(a, o);
      return [0, 1, 2, 3, 4, 5, 6].map(i => { const t = -Math.PI / 2 + i * Math.PI / 3.5; return toLL([c[0] + r * Math.cos(t) + r * .9, c[1] + r * Math.sin(t)], o); });
    }
    let pts = [toM(a, o), ...(LAYOUT.via[s.id] || []).map(p => toM(p, o)), toM(b, o)];
    // several streams between the same two items: spread them sideways
    const k = [s.f, s.to].sort().join("|"), list = pairIx[k], i = list.indexOf(s.id), n = list.length;
    if (n > 1 && !LAYOUT.via[s.id]){
      const d = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], L0 = Math.hypot(...d) || 1, sgn = s.f < s.to ? 1 : -1;
      const off = (i - (n - 1) / 2) * 3.5 * sgn, nx = -d[1] / L0 * off, ny = d[0] / L0 * off;
      pts = pts.map(p => [p[0] + nx, p[1] + ny]);
    }
    // stop short of the shapes at both ends
    const cut = (p, q, r) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, t = Math.min(r, l * .4) / l; return [p[0] + dx * t, p[1] + dy * t]; };
    pts[0] = cut(pts[0], pts[1], reach(s.f) + 1); pts[pts.length - 1] = cut(pts[pts.length - 1], pts[pts.length - 2], reach(s.to) + 2);
    if (pts.length === 2) pts.splice(1, 0, [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]);   // middle vertex carries a direction arrow
    return pts.map(p => toLL(p, o));
  }
  function drawStream(s){
    if (!LAYOUT.nodes[s.f] || !LAYOUT.nodes[s.to]) return;
    const k = [s.f, s.to].sort().join("|"); (pairIx[k] = pairIx[k] || []).includes(s.id) || pairIx[k].push(s.id);
  }
  function drawStreams(){
    api.STREAMS.forEach(s => { if (!LAYOUT.nodes[s.f] || !LAYOUT.nodes[s.to]) return;
      const t = api.STREAM_TYPES[s.ty];
      const lay = L.polyline(pathFor(s), { renderer: rend, color: t.color, weight: 1.6, opacity: .95, smoothFactor: 0, interactive: true, className: "lo-s ty-" + s.ty + (SVC.has(s.ty) ? " svc" : "") });
      lay.addTo(map); arrow(lay, s.ty);
      lay.on("click", e => { L.DomEvent.stopPropagation(e); if (moving) return; api.pick(e.originalEvent, { k: "s", id: s.id }); });
      lay.bindTooltip(esc(s.n), { sticky: true, className: "lo-tip", direction: "top", offset: [0, -6] });
      S[s.id] = { lay, s };
    });
  }
  function arrow(lay, ty){ const p = lay._path; if (p){ p.setAttribute("marker-mid", `url(#loA-${ty})`); p.setAttribute("marker-end", `url(#loA-${ty})`); if (/var\(/.test(api.STREAM_TYPES[ty].color)) p.style.stroke = api.STREAM_TYPES[ty].color; } }
  function redrawStreamsOf(id){
    Object.values(S).forEach(o => { if (o.s.f !== id && o.s.to !== id) return;
      const cls = o.lay._path.getAttribute("class"); o.lay.setLatLngs(pathFor(o.s)); o.lay._path.setAttribute("class", cls); arrow(o.lay, o.s.ty); });
  }

  // ---------- keep in step with the schematic ----------
  function sync(zoom){
    if (!map) return;
    const hl = api.hlIds(), sel = api.selIds(), focus = hl.size > 0;
    $("mapView").classList.toggle("focus", focus);
    api.NODES.forEach(nd => { const o = N[nd.id]; if (!o) return; const st = api.nodeState(nd.id), p = o.lay._path, tip = o.lay.getTooltip() && o.lay.getTooltip()._container;
      [p, tip].forEach(e => { if (!e) return; e.classList.toggle("hide", st.hidden); e.classList.toggle("ghost", st.ghost); e.classList.toggle("hl", hl.has(nd.id)); e.classList.toggle("sel", sel.has(nd.id)); }); });
    Object.values(S).forEach(o => { const st = api.streamState(o.s.id), p = o.lay._path; if (!p) return;
      p.classList.toggle("hide", st.hidden); p.classList.toggle("ghost", st.ghost); p.classList.toggle("hl", hl.has(o.s.id)); p.classList.toggle("sel", sel.has(o.s.id)); });
    declutter();
    const key = [...hl].sort().join(",");
    if (zoom && focus && key !== lastHl){
      const pts = [];
      hl.forEach(id => { if (N[id]) pts.push(pos(id)); else if (S[id]) S[id].lay.getLatLngs().forEach(p => pts.push([p.lat, p.lng])); });
      if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(.25), { maxZoom: 19.5, duration: .55, paddingBottomRight: api.infoOpen() && innerWidth > 900 ? [480, 0] : [0, 0] });
    }
    lastHl = key;
  }

  // ---------- moving an item ----------
  function panelHtml(n){
    if (!on || !LAYOUT.nodes[n.id]) return "";
    const est = LAYOUT.nodes[n.id].est, mine = !!saved[n.id];
    return `<div class="lo-mv"><button class="hbtn" id="loMove">✥ Move on layout</button>${mine ? `<button class="hbtn" id="loReset">↺ Reset position</button>` : ""}
      <span>${mine ? "Position moved on this device." : est ? "Position estimated: not identified on the layout drawings. Please move it if you know where it is." : "Placed from the layout drawings (about ±5 m)."}</span></div>`;
  }
  function bindPanel(n){
    const m = $("loMove"); if (m) m.onclick = () => startMove(n.id);
    const r = $("loReset"); if (r) r.onclick = () => { delete saved[n.id]; save(); redrawNode(n.id); redrawStreamsOf(n.id); sync(false); expLabel(); api.refreshPanel(); };
  }
  function startMove(id){
    if (moving) stopMove(false);
    const start = pos(id);
    const mk = L.marker(start, { draggable: true, autoPan: true, icon: L.divIcon({ className: "lo-pin", html: "<i></i>", iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 1000 }).addTo(map);
    moving = { id, start, mk };
    mk.on("drag", () => { const p = mk.getLatLng(); saved[id] = [+p.lat.toFixed(7), +p.lng.toFixed(7)]; redrawNode(id); redrawStreamsOf(id); sync(false); });
    $("mapView").classList.add("moving");
    if (innerWidth <= 900) api.closeInfo();
    map.panTo(start);
  }
  function stopMove(keep){
    if (!moving) return;
    const { id, start, mk } = moving; map.removeLayer(mk); moving = null; $("mapView").classList.remove("moving");
    if (keep){ const p = mk.getLatLng(); saved[id] = [+p.lat.toFixed(7), +p.lng.toFixed(7)]; api.toast("Position saved on this device. Use ⬇ Moves to send it in."); }
    else if (LAYOUT.nodes[id].ll[0] === start[0] && LAYOUT.nodes[id].ll[1] === start[1]) delete saved[id]; else saved[id] = start;
    save(); redrawNode(id); redrawStreamsOf(id); sync(false); expLabel(); api.refreshPanel();
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
    if (!v){ if (moving) stopMove(false); return true; }
    try { await load(); } catch (e) { api.toast("Couldn't load the map (" + e.message + "). Check the connection."); on = false; document.body.classList.remove("layout"); $("mapView").hidden = true; return false; }
    if (!map){ build(); drawStreams(); markers(); Object.values(S).forEach(o => arrow(o.lay, o.s.ty)); }
    map.invalidateSize(); sync(false); return true;
  }
  return {
    init(a){ api = a; },
    show, active: () => on, sync: z => on && sync(z), panelHtml, bindPanel,
    zoomBy: d => map && (d > 0 ? map.zoomIn(.75) : map.zoomOut(.75)), home: () => map && home(true)
  };
})();
