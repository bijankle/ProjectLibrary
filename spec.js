// Pipe and valve spec for search results and the Smart PFD (2000-F00-STS-PP-10001 Rev 3, Piping Materials and Valves).
// spec/index.json (built by tools/build_spec.py) holds every piping class and valve datasheet; spec/pvs.pdf is the spec
// itself (cover and names removed). Spec.html(it) gives the section for a line, manual valve or control valve record;
// Spec.bind(el) wires its buttons. The PDF opens in a built in viewer (PDF.js, bundled in vendor/pdfjs) at the right page,
// drawn from the PDF's own vectors at the current zoom so it stays sharp. The first open keeps the PDF on the device.
window.Spec = (() => {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let IX = null, loading = null;
  const load = () => loading || (loading = fetch("spec/index.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => (IX = d)).catch(e => { loading = null; throw e; }));
  const num = v => { const m = String(v || "").match(/\d+(?:\.\d+)?/); return m ? +m[0] : null; };
  const pageBtn = (page, label, title) => `<button class="lk-btn sp-open" data-page="${page}" data-title="${esc(title)}">📄 ${esc(label)} <span>page ${page}</span></button>`;

  // ---------- piping class ----------
  function pipeHTML(cls, size, service){
    const P = IX.pipe[cls];
    if (!P) return `<div class="lk-ns">Piping class ${esc(cls)} is not in the spec.</div>`;
    let h = `<h4 class="lk-h">Piping class ${esc(cls)}</h4><div class="sp-t">${esc(P.title || "")}</div>` + pageBtn(P.page, "Open the " + cls + " datasheet", "Piping class " + cls);
    const rows = [["Material", P.material], ["Design code", P.codes], ["Corrosion allowance", P.ca && P.ca + " mm"], ["Pressure test", P.test], ["NDT", P.nde]].filter(r => r[1]);
    h += `<table class="lk-t">${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table>`;
    if (P.design && P.design.length){
      const cols = Math.max(...P.design.map(r => r.length));
      h += `<div class="sp-sc"><table class="lk-t sp-dt">${P.design.map(r => `<tr><td>${esc(r[0])}</td>${Array.from({ length: cols - 1 }, (_, i) => `<td>${esc(r[i + 1] || "")}</td>`).join("")}</tr>`).join("")}</table></div>`;
    }
    // components that cover this line size
    const comps = (P.comps || []);
    const fit = size != null ? comps.filter(c => c.lo != null && size >= c.lo && size <= c.hi) : [];
    const unit = comps.find(c => c.u) ? comps.find(c => c.u).u : "DN";
    if (size != null){
      h += `<h4 class="lk-h">What to expect at ${esc(unit)}${esc(size)} (${fit.length} item${fit.length === 1 ? "" : "s"})</h4>`;
      h += fit.length ? `<div class="sp-sc"><table class="lk-t sp-ct"><tr><th>Item</th><th>Type / rating</th><th>Ends</th><th>Standard</th><th>Material</th></tr>` +
        fit.map(c => `<tr><td>${esc(c.d.replace(/\s\d{1,2}$/, ""))}</td><td>${esc(c.type)}</td><td>${esc(c.ends)}</td><td>${esc(c.dim)}</td><td>${esc(c.mat)}</td></tr>`).join("") + `</table></div>`
        : `<div class="lk-ns">No component row in ${esc(cls)} covers ${esc(unit)}${esc(size)}: check the datasheet (the size may be non preferred).</div>`;
    }
    if (comps.length && fit.length < comps.length)
      h += `<details class="lk-d"><summary>All ${comps.length} component rows in ${esc(cls)}</summary><div class="sp-sc"><table class="lk-t sp-ct"><tr><th>Item</th><th>Size</th><th>Type / rating</th><th>Ends</th><th>Material</th></tr>` +
        comps.map(c => `<tr><td>${esc(c.d.replace(/\s\d{1,2}$/, ""))}</td><td>${esc(c.size)}</td><td>${esc(c.type)}</td><td>${esc(c.ends)}</td><td>${esc(c.mat)}</td></tr>`).join("") + `</table></div></details>`;
    if (P.notes && P.notes.length)
      h += `<details class="lk-d"><summary>${esc(cls)} notes (${P.notes.length})</summary>${P.notes.map(n => `<div class="sp-n"><b>${esc(n[0])}</b> ${esc(n[1])}</div>`).join("")}</details>`;
    // valves the spec allows for this fluid service in this class
    const sv = service ? IX.services.filter(r => r.code === service && r.sys === cls) : [];
    sv.forEach(r => {
      const vs = String(r.valves || "").split(/[,\s]+/).filter(v => /^V[A-Z0-9]+$/.test(v));
      h += `<h4 class="lk-h">Allowed valves: ${esc(r.service)} in ${esc(cls)}</h4><div class="sp-v">${vs.map(v => IX.valve[v]
        ? `<button class="sp-chip sp-open" data-page="${IX.valve[v].page}" data-title="Valve ${esc(v)}" title="${esc(IX.valve[v].title || "")}">${esc(v)}</button>` : `<span class="sp-chip off" title="No datasheet for this code in the spec">${esc(v)}</span>`).join("")}</div>` +
        `<table class="lk-t">${[["Fluid design", r.fluid], ["Class rating", r.rating], ["Gasket", r.gasket], ["External finish", r.ext], ["Note", r.notes]].filter(x => x[1] && x[1] !== "N/A").map(x => `<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td></tr>`).join("")}</table>`;
    });
    return h;
  }

  // ---------- valve datasheet ----------
  const KEY_ROWS = /^(Type|Service|Size Range|End Connections|Actuation|Lockable|Body Material|Ball Material|Disc Material|Gate Material|Seat Material|Liner|Diaphragm|Stem\/Trim Material|Stem Packing|Design Pressure|Design Temperature|Pressure Class|Flange)/i;
  function valveHTML(code, size){
    const V = IX.valve[code];
    if (!V) return `<div class="lk-ns">Valve code ${esc(code)} has no datasheet in the spec.</div>`;
    let h = `<h4 class="lk-h">Valve datasheet ${esc(code)}</h4><div class="sp-t">${esc(V.title || "")}</div>` + pageBtn(V.page, "Open the " + code + " datasheet", "Valve " + code);
    const rows = (V.rows || []).filter(r => KEY_ROWS.test(r[0]));
    h += `<table class="lk-t">${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table>`;
    if (size != null && V.lo != null && (size < V.lo || size > V.hi)) h += `<div class="sp-warn">DN${esc(size)} is outside this datasheet's size range (${esc(V.u)}${V.lo} to ${V.hi}).</div>`;
    const rest = (V.rows || []).filter(r => !KEY_ROWS.test(r[0]));
    if (rest.length || (V.notes || []).length)
      h += `<details class="lk-d"><summary>More from the datasheet</summary><table class="lk-t">${rest.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table>${(V.notes || []).map(n => `<div class="sp-n"><b>${esc(n[0])}</b> ${esc(n[1])}</div>`).join("")}</details>`;
    return h;
  }

  // ---------- which record needs what ----------
  const get = (it, f, n) => { const i = f.indexOf(n); return i < 0 ? "" : String(it.r[i] || ""); };
  function html(it, f){
    if (!IX || !it) return "";
    if (it.t === "spec") return it.code.startsWith("V") && IX.valve[it.code] ? valveHTML(it.code, null) : pipeHTML(it.code, null, null);
    if (!it.r) return "";
    if (it.t === "line"){
      const cls = get(it, f, "Pipe spec"), size = num(get(it, f, "Size (DN)")) ?? num((it.key.match(/-(\d+)(?:-[A-Z]+)?$/) || [])[1]);
      return cls ? pipeHTML(cls, size, get(it, f, "Service")) : "";
    }
    if (it.t === "mv"){
      const code = get(it, f, "Spec"), size = num(get(it, f, "Size (DN)"));
      return code && IX.valve[code] ? valveHTML(code, size) : code ? `<div class="lk-ns">Valve code ${esc(code)} has no datasheet in the spec.</div>` : "";
    }
    if (it.t === "cv"){
      let h = "";
      const m = get(it, f, "Valve code").match(/^(\d+)([A-Z][A-Z0-9]+)/);
      if (m && IX.valve[m[2]]) h += valveHTML(m[2], +m[1]);
      const cls = get(it, f, "Line spec"), size = num(get(it, f, "Line size (mm)"));
      if (cls && IX.pipe[cls]) h += pipeHTML(cls, size, (get(it, f, "Line number").match(/^\d{2}-\d{4}-([A-Z]+)-/) || [])[1]);
      return h;
    }
    return "";
  }
  const wanted = it => it && (["line", "mv", "cv"].includes(it.t) || it.t === "spec");
  const note = () => IX ? `<div class="lk-src">Spec: ${esc(IX.meta.title)} ${esc(IX.meta.doc)} Rev ${esc(IX.meta.rev)}. Datasheet pages open in the built in viewer; the first open keeps the PDF on this device.</div>` : "";

  // search entries for every piping class and valve datasheet
  function extras(){
    return [...Object.entries(IX.pipe).map(([k, v]) => ({ t: "spec", key: k, code: k, name: "Piping class: " + (v.title || ""), words: (v.material || "") + " piping class spec datasheet" })),
      ...Object.entries(IX.valve).map(([k, v]) => ({ t: "spec", key: k, code: k, name: "Valve datasheet: " + (v.title || ""), words: "valve spec datasheet" }))];
  }

  // ---------- PDF viewer ----------
  let V = null, pdfLib = null, pdfDoc = null;
  const loadLib = () => pdfLib || (pdfLib = new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "vendor/pdfjs/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js"; ok(window.pdfjsLib); }; s.onerror = () => { pdfLib = null; bad(new Error("viewer not reachable")); }; document.head.appendChild(s); }));
  const getDoc = () => pdfDoc || (pdfDoc = loadLib().then(lib => lib.getDocument({ url: IX.meta.file, disableRange: true, disableStream: true }).promise).catch(e => { pdfDoc = null; throw e; }));
  function ui(){
    if (V) return V;
    const el = document.createElement("div"); el.className = "sp-view"; el.hidden = true;
    el.innerHTML = `<div class="sp-top"><b class="sp-tt"></b><div class="sp-nav"><button data-a="prev" title="Previous page">◀</button><span class="sp-pg"></span><button data-a="next" title="Next page">▶</button></div>
      <div class="sp-nav"><button data-a="out" title="Zoom out">−</button><button data-a="fit" title="Fit width">↔</button><button data-a="in" title="Zoom in">+</button></div>
      <a class="sp-dl" download="2000-F00-STS-PP-10001 Rev 3 Piping Materials and Valves.pdf" title="Download the whole spec">⬇ PDF</a><button class="sp-x" data-a="close" title="Close">✕</button></div>
      <div class="sp-body"><div class="sp-sheet"><canvas class="sp-bg"></canvas><canvas class="sp-hi"></canvas></div></div><div class="sp-msg"></div>`;
    document.body.appendChild(el);
    V = { el, body: el.querySelector(".sp-body"), sheet: el.querySelector(".sp-sheet"), bg: el.querySelector(".sp-bg"), hi: el.querySelector(".sp-hi"), msg: el.querySelector(".sp-msg"), page: 1, zoom: 1, pg: null, base: 1 };
    el.querySelector(".sp-dl").href = IX.meta.file;
    el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({ prev: () => go(V.page - 1), next: () => go(V.page + 1), in: () => zoomTo(V.zoom * 1.5), out: () => zoomTo(V.zoom / 1.5), fit: () => zoomTo(1), close })[b.dataset.a]());
    addEventListener("keydown", e => { if (el.hidden) return; if (e.key === "Escape") close(); if (e.key === "ArrowRight" && V.zoom === 1) go(V.page + 1); if (e.key === "ArrowLeft" && V.zoom === 1) go(V.page - 1); });
    addEventListener("popstate", () => { if (!el.hidden) close(true); });
    addEventListener("resize", () => { if (!el.hidden) layout(true); });
    let t; V.body.addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(sharp, 70); });
    // ctrl + wheel / trackpad pinch zooms about the pointer
    V.body.addEventListener("wheel", e => { if (!e.ctrlKey) return; e.preventDefault(); zoomTo(V.zoom * Math.exp(-e.deltaY * .01), e.clientX, e.clientY); }, { passive: false });
    // touch pinch: scale the sheet while pinching, redraw sharp when the fingers lift
    const pts = new Map(); let pin = null;
    V.body.addEventListener("pointerdown", e => { pts.set(e.pointerId, e); if (pts.size === 2){ const [a, b] = [...pts.values()]; pin = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: V.zoom, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, f: 1 }; } });
    V.body.addEventListener("pointermove", e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e); if (pin && pts.size === 2){ const [a, b] = [...pts.values()]; pin.f = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pin.d;
      const r = V.body.getBoundingClientRect(); V.sheet.style.transformOrigin = `${pin.cx - r.left + V.body.scrollLeft}px ${pin.cy - r.top + V.body.scrollTop}px`; V.sheet.style.transform = `scale(${pin.f})`; } });
    const up = e => { pts.delete(e.pointerId); if (pin && pts.size < 2){ const p = pin; pin = null; V.sheet.style.transform = ""; zoomTo(p.z * p.f, p.cx, p.cy); } };
    V.body.addEventListener("pointerup", up); V.body.addEventListener("pointercancel", up);
    V.body.style.touchAction = "pan-x pan-y";
    return V;
  }
  async function open(page, title){
    await load(); ui();
    V.el.hidden = false; document.body.classList.add("sp-on"); V.el.querySelector(".sp-tt").textContent = title || IX.meta.title;
    history.pushState({ sp: 1 }, "");
    V.msg.textContent = "Loading the spec…"; V.msg.hidden = false;
    try { await getDoc(); } catch (e) { V.msg.textContent = "Couldn't load the spec PDF (" + e.message + "). Check the connection."; return; }
    V.msg.hidden = true; V.zoom = 1; go(page);
  }
  function close(fromPop){ if (!V || V.el.hidden) return; V.el.hidden = true; document.body.classList.remove("sp-on"); if (!fromPop && history.state && history.state.sp) history.back(); }
  async function go(n){
    const d = await getDoc(); n = Math.max(1, Math.min(d.numPages, n)); V.page = n;
    V.el.querySelector(".sp-pg").textContent = `${n} / ${d.numPages}`;
    V.pg = await d.getPage(n); V.body.scrollTo(0, 0); layout(true);
  }
  // sheet size: page width fits the window at zoom 1
  function layout(bg){
    if (!V.pg) return;
    const vp1 = V.pg.getViewport({ scale: 1 }), W = V.body.clientWidth - 16;
    V.base = Math.max(.2, W / vp1.width); const s = V.base * V.zoom;
    V.sheet.style.width = Math.round(vp1.width * s) + "px"; V.sheet.style.height = Math.round(vp1.height * s) + "px";
    if (bg) drawBg(); sharp();
  }
  let bgTask = null, hiTask = null;
  function drawBg(){   // whole page at fit width: shown (stretched) while scrolling or zooming
    const dpr = Math.min(2, devicePixelRatio || 1), vp = V.pg.getViewport({ scale: V.base * dpr });
    V.bg.width = vp.width; V.bg.height = vp.height;
    if (bgTask) bgTask.cancel(); bgTask = V.pg.render({ canvasContext: V.bg.getContext("2d"), viewport: vp }); bgTask.promise.catch(() => {});
  }
  function sharp(){    // the visible part at full resolution, straight from the PDF vectors
    if (!V.pg) return;
    const dpr = devicePixelRatio || 1, s = V.base * V.zoom, sw = V.sheet.offsetWidth, sh = V.sheet.offsetHeight;
    const x0 = Math.max(0, V.body.scrollLeft - 8), y0 = Math.max(0, V.body.scrollTop - 8);
    const w = Math.min(sw - x0, V.body.clientWidth + 16), h = Math.min(sh - y0, V.body.clientHeight + 16);
    if (w <= 0 || h <= 0) return;
    const c = V.hi; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.left = x0 + "px"; c.style.top = y0 + "px"; c.style.width = w + "px"; c.style.height = h + "px";
    const vp = V.pg.getViewport({ scale: s * dpr, offsetX: -x0 * dpr, offsetY: -y0 * dpr });
    if (hiTask) hiTask.cancel(); hiTask = V.pg.render({ canvasContext: c.getContext("2d"), viewport: vp }); hiTask.promise.catch(() => {});
  }
  function zoomTo(z, cx, cy){
    z = Math.max(1, Math.min(10, z)); if (!V.pg || Math.abs(z - V.zoom) < .001) return;
    const r = V.body.getBoundingClientRect(); cx = cx == null ? r.left + r.width / 2 : cx; cy = cy == null ? r.top + r.height / 2 : cy;
    const fx = (V.body.scrollLeft + cx - r.left - 8) / V.sheet.offsetWidth, fy = (V.body.scrollTop + cy - r.top - 8) / V.sheet.offsetHeight;
    V.zoom = z; layout(false);
    V.body.scrollLeft = fx * V.sheet.offsetWidth - (cx - r.left - 8); V.body.scrollTop = fy * V.sheet.offsetHeight - (cy - r.top - 8); sharp();
  }
  function bind(root){ root.querySelectorAll(".sp-open").forEach(b => b.onclick = e => { e.preventDefault(); open(+b.dataset.page, b.dataset.title); }); }

  return { load, ready: () => !!IX, html, wanted, note, extras, bind, open };
})();
