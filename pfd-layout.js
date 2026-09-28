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
    map.on("zoomend", zoomCls); zoomCls(); map.on("moveend", () => setTimeout(declutter, 0));
    map.on("click", () => { if (moving || Date.now() - dropped < 400) return; api.clearSel(true); api.closeInfo(); });
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
    addEventListener("keydown", e => { if (e.key === "Escape" && moving) moving.cancel(); });
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
    Object.values(N).forEach(o => { const e = o.el; if (!e) return; e.classList.remove("dc");
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

  // ---------- equipment: text boxes ----------
  // MEL rows for a node come from pfd-equip.js (EQUIP_DATA). A tag named on the PFD block with no MEL row is a gap.
  const TAG_RE = /F\d{2}-[A-Z]{1,4}-\d{2,4}[A-Z]?/g, nt = t => String(t || "").toUpperCase().replace(/\s+/g, "");
  function melInfo(nd){
    const rows = (typeof EQUIP_DATA !== "undefined" && EQUIP_DATA[nd.id] && EQUIP_DATA[nd.id].eq) || [], have = new Set(rows.map(r => nt(r.tag)));
    const named = String(nd.tag || "").toUpperCase().match(TAG_RE) || [];
    const missing = named.filter(t => !have.has(nt(t)) && ![...have].some(h => h.startsWith(nt(t))));
    const names = [...new Set(rows.map(r => r.n).filter(Boolean))];
    return { rows, missing, gap: !rows.length || missing.length > 0,
      tag: nd.tag || (rows[0] && rows[0].tag) || "", desc: names.length ? names.slice(0, 2).join(" / ") + (names.length > 2 ? ` +${names.length - 2}` : "") : (nd.sn || nd.n) };
  }
  function boxHtml(nd){
    const m = N[nd.id].mel, big = !!LAYOUT.nodes[nd.id].sh;
    const why = !m.rows.length ? "No MEL entry" : "Not in MEL: " + m.missing.join(", ");
    return `<div class="lo-box${big ? " big" : ""}${LAYOUT.nodes[nd.id].est ? " est" : ""}${m.gap ? " gap" : ""}" title="${esc(m.gap ? why : "")}">` +
      `<b>${esc(m.tag || nd.n)}</b><span>${esc(m.desc)}</span>${m.gap ? `<em>⚠ ${esc(why)}</em>` : ""}</div>`;
  }
  function drawNode(nd){
    const id = nd.id; if (!LAYOUT.nodes[id]) return;
    const o = N[id] = { mel: melInfo(nd) };
    o.lay = L.marker(pos(id), { icon: L.divIcon({ className: "lo-bw", html: boxHtml(nd), iconSize: null }), keyboard: false }).addTo(map);
    o.el = o.lay.getElement().querySelector(".lo-box");
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
        save(); sync(false); expLabel(); if (api.infoOpen()) api.refreshPanel(); };
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
      const lay = L.polyline(pathFor(s), { renderer: rend, color: t.color, weight: 1.6, opacity: .95, smoothFactor: 0, interactive: false, className: "lo-s ty-" + s.ty + (SVC.has(s.ty) ? " svc" : "") });
      lay.addTo(map); arrow(lay, s.ty);
      // the thin line is only drawn; a wide invisible line on top of it takes the taps (about a finger wide)
      const hit = L.polyline(pathFor(s), { renderer: rend, color: "#000", weight: matchMedia("(pointer: coarse)").matches ? 22 : 14, opacity: 0, smoothFactor: 0, interactive: true, className: "lo-hit" + (SVC.has(s.ty) ? " svc" : "") });
      hit.addTo(map);
      hit.on("click", e => { L.DomEvent.stopPropagation(e); if (moving) return; api.pick(e.originalEvent, { k: "s", id: s.id }); });
      hit.on("mouseover", () => lay._path && lay._path.classList.add("hov")); hit.on("mouseout", () => lay._path && lay._path.classList.remove("hov"));
      hit.bindTooltip(esc(s.n), { sticky: true, className: "lo-tip", direction: "top", offset: [0, -6] });
      S[s.id] = { lay, hit, s };
    });
  }
  function arrow(lay, ty){ const p = lay._path; if (p){ p.setAttribute("marker-mid", `url(#loA-${ty})`); p.setAttribute("marker-end", `url(#loA-${ty})`); if (/var\(/.test(api.STREAM_TYPES[ty].color)) p.style.stroke = api.STREAM_TYPES[ty].color; } }
  function redrawStreamsOf(id){
    Object.values(S).forEach(o => { if (o.s.f !== id && o.s.to !== id) return;
      const cls = o.lay._path.getAttribute("class"), hc = o.hit._path.getAttribute("class"), pts = pathFor(o.s);
      o.lay.setLatLngs(pts); o.lay._path.setAttribute("class", cls); arrow(o.lay, o.s.ty); o.hit.setLatLngs(pts); o.hit._path.setAttribute("class", hc); });
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
      p.classList.toggle("hide", st.hidden); p.classList.toggle("ghost", st.ghost); p.classList.toggle("hl", hl.has(o.s.id)); p.classList.toggle("sel", sel.has(o.s.id));
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
    if (!v){ if (moving) moving.cancel(); return true; }
    try { await load(); } catch (e) { api.toast("Couldn't load the map (" + e.message + "). Check the connection."); on = false; document.body.classList.remove("layout"); $("mapView").hidden = true; return false; }
    if (!map){ build(); drawStreams(); markers(); Object.values(S).forEach(o => arrow(o.lay, o.s.ty)); }
    setTimeout(declutter, 50);
    map.invalidateSize(); sync(false); return true;
  }
  return {
    init(a){ api = a; },
    show, active: () => on, sync: z => on && sync(z), panelHtml, bindPanel,
    zoomBy: d => map && (d > 0 ? map.zoomIn(.75) : map.zoomOut(.75)), home: () => map && home(true)
  };
})();
