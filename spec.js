// Pipe and valve spec for search results and the Smart PFD (2000-F00-STS-PP-10001 Rev 3, Piping Materials and Valves).
// spec/index.json (built by tools/build_spec.py) holds every piping class and valve datasheet; spec/pvs.pdf is the spec
// itself (cover and names removed). Spec.html(it) gives the section for a line, manual valve or control valve record;
// Spec.bind(el) wires its buttons, which open the PDF at the right page in the built in viewer (pdfview.js).
// The first open keeps the PDF on the device.
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

  // ---------- PDF viewer (pdfview.js) ----------
  const open = (page, title) => load().then(() => PdfView.open({ url: IX.meta.file, page, title: title || IX.meta.title, fit: "width", download: "2000-F00-STS-PP-10001 Rev 3 Piping Materials and Valves.pdf" }));
  function bind(root){ root.querySelectorAll(".sp-open").forEach(b => b.onclick = e => { e.preventDefault(); open(+b.dataset.page, b.dataset.title); }); }

  return { load, ready: () => !!IX, html, wanted, note, extras, bind, open };
})();
