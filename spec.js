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

  // collapsed section: summary line, content hidden until tapped
  // sections become pill filters (Lookup.pills): one shown at a time
  const sec = (id, label, n, html) => ({ id, label, n, html });
  const pills = (S, g) => window.Lookup && Lookup.pills ? Lookup.pills(S, g) : S.map(x => x.html).join("");
  const tbl = rows => `<table class="lk-t">${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table>`;
  const short = t => { t = String(t || ""); return t.length > 70 ? t.slice(0, 68) + "…" : t; };

  // ---------- piping class ----------
  // one line always visible (class, title, the datasheet button); everything else in tap-to-open sections
  function pipeHTML(cls, size, service){
    const P = IX.pipe[cls];
    if (!P) return `<div class="lk-ns">Piping class ${esc(cls)} is not in the spec.</div>`;
    const comps = P.comps || [], unit = comps.find(c => c.u) ? comps.find(c => c.u).u : "DN";
    const fit = size != null ? comps.filter(c => c.lo != null && size >= c.lo && size <= c.hi) : [];
    const dp = (P.design || []).find(r => /pressure/i.test(r[0])), dt = (P.design || []).find(r => /temperature/i.test(r[0]));
    let h = `<div class="sp-head"><b>📘 ${esc(cls)}</b> <span>${esc(short(P.title))}</span></div>` +
      (dp && dt ? `<div class="sp-sub">${esc(dp[1])} kPa(g) at ${esc(dt[1])} °C${P.material ? " · " + esc(short(P.material)) : ""}</div>` : "") +
      pageBtn(P.page, "Open the " + cls + " datasheet", "Piping class " + cls);
    const S = [];
    if (size != null)
      S.push(sec("fit", `At ${unit}${size}`, fit.length, fit.length
        ? `<div class="sp-sc"><table class="lk-t sp-ct"><tr><th>Item</th><th>Type / rating</th><th>Ends</th><th>Standard</th><th>Material</th></tr>` +
          fit.map(c => `<tr><td>${esc(c.d.replace(/\s\d{1,2}$/, ""))}</td><td>${esc(c.type)}</td><td>${esc(c.ends)}</td><td>${esc(c.dim)}</td><td>${esc(c.mat)}</td></tr>`).join("") + `</table></div>`
        : `<div class="lk-ns">No component row in ${esc(cls)} covers ${esc(unit)}${esc(size)}: check the datasheet (the size may be non preferred).</div>`));
    const sv = service ? IX.services.filter(r => r.code === service && r.sys === cls) : [];
    sv.forEach((r, k) => {
      const vs = String(r.valves || "").split(/[,\s]+/).filter(v => /^V[A-Z0-9]+$/.test(v));
      S.push(sec("vl" + k, sv.length > 1 ? "Valves, " + r.service : "Allowed valves", vs.length, `<div class="lk-ns" style="margin:0 0 4px">For ${esc(r.service)}</div><div class="sp-v">${vs.map(v => IX.valve[v]
        ? `<button class="sp-chip sp-open" data-page="${IX.valve[v].page}" data-title="Valve ${esc(v)}" title="${esc(IX.valve[v].title || "")}">${esc(v)}</button>` : `<span class="sp-chip off" title="No datasheet for this code in the spec">${esc(v)}</span>`).join("")}</div>` +
        tbl([["Fluid design", r.fluid], ["Class rating", r.rating], ["Gasket", r.gasket], ["External finish", r.ext], ["Note", r.notes]].filter(x => x[1] && x[1] !== "N/A"))));
    });
    let cd = tbl([["Material", P.material], ["Design code", P.codes], ["Corrosion allowance", P.ca && P.ca + " mm"], ["Pressure test", P.test], ["NDT", P.nde]].filter(r => r[1]));
    if (P.design && P.design.length){
      const cols = Math.max(...P.design.map(r => r.length));
      cd += `<div class="sp-sc"><table class="lk-t sp-dt">${P.design.map(r => `<tr><td>${esc(r[0])}</td>${Array.from({ length: cols - 1 }, (_, i) => `<td>${esc(r[i + 1] || "")}</td>`).join("")}</tr>`).join("")}</table></div>`;
    }
    S.push(sec("cd", "Class data", null, cd));
    if (comps.length && fit.length < comps.length)
      S.push(sec("all", "All components", comps.length, `<div class="sp-sc"><table class="lk-t sp-ct"><tr><th>Item</th><th>Size</th><th>Type / rating</th><th>Ends</th><th>Material</th></tr>` +
        comps.map(c => `<tr><td>${esc(c.d.replace(/\s\d{1,2}$/, ""))}</td><td>${esc(c.size)}</td><td>${esc(c.type)}</td><td>${esc(c.ends)}</td><td>${esc(c.mat)}</td></tr>`).join("") + `</table></div>`));
    if (P.notes && P.notes.length) S.push(sec("notes", "Notes", P.notes.length, P.notes.map(n => `<div class="sp-n"><b>${esc(n[0])}</b> ${esc(n[1])}</div>`).join("")));
    return h + pills(S, "spec-pipe");
  }

  // ---------- valve datasheet ----------
  const KEY_ROWS = /^(Type|Service|Size Range|End Connections|Actuation|Lockable|Body Material|Ball Material|Disc Material|Gate Material|Seat Material|Liner|Diaphragm|Stem\/Trim Material|Stem Packing|Design Pressure|Design Temperature|Pressure Class|Flange)/i;
  function valveHTML(code, size){
    const V = IX.valve[code];
    if (!V) return `<div class="lk-ns">Valve code ${esc(code)} has no datasheet in the spec.</div>`;
    const get = k => ((V.rows || []).find(r => new RegExp("^" + k, "i").test(r[0])) || [])[1];
    let h = `<div class="sp-head"><b>📘 ${esc(code)}</b> <span>${esc(short(V.title))}</span></div>` +
      `<div class="sp-sub">${esc([get("Size Range"), get("End Connections"), get("Actuation"), get("Design Pressure")].filter(Boolean).join(" · "))}</div>`;
    if (size != null && V.lo != null && (size < V.lo || size > V.hi)) h += `<div class="sp-warn">DN${esc(size)} is outside this datasheet's size range (${esc(V.u)}${V.lo} to ${V.hi}).</div>`;
    h += pageBtn(V.page, "Open the " + code + " datasheet", "Valve " + code);
    const rest = (V.rows || []).filter(r => !KEY_ROWS.test(r[0]));
    return h + pills([sec("sum", "Materials & ratings", null, tbl((V.rows || []).filter(r => KEY_ROWS.test(r[0])))),
      rest.length ? sec("more", "More data", rest.length, tbl(rest)) : null,
      (V.notes || []).length ? sec("vn", "Notes", V.notes.length, V.notes.map(n => `<div class="sp-n"><b>${esc(n[0])}</b> ${esc(n[1])}</div>`).join("")) : null].filter(Boolean), "spec-valve");
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
