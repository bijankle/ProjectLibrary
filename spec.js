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
  const pageBtn = (page, label, title) => `<button class="lk-btn sp-open" data-page="${page}" data-title="${esc(title)}">${esc(label)} <span>page ${page}</span></button>`;

  // collapsed section: summary line, content hidden until tapped
  // sections become pill filters (Lookup.pills): one shown at a time
  const sec = (id, label, n, html) => ({ id, label, n, html });
  // the sub pills sit straight under the main pill row; the class / datasheet heading goes below them
  const pills = (S, g, head) => window.Lookup && Lookup.pills ? Lookup.pills(S, g, head) : head + S.map(x => x.html).join("");
  const tbl = rows => `<table class="lk-t">${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table>`;
  const short = t => { t = String(t || ""); return t.length > 70 ? t.slice(0, 68) + "…" : t; };

  // HDPE outside diameter (mm) to the nominal size used on valve datasheets
  const OD_DN = { 20: 15, 25: 20, 32: 25, 40: 32, 50: 40, 63: 50, 75: 65, 90: 80, 110: 100, 125: 100, 140: 125, 160: 150, 180: 150, 200: 150, 225: 200, 250: 200, 280: 250,
    315: 300, 355: 300, 400: 350, 450: 400, 500: 450, 560: 500, 630: 600, 710: 700, 800: 800, 900: 900, 1000: 1000, 1200: 1200 };
  // one component per line, comma separated: item: type / rating, ends, standard ("Elbow, 90°: SDR17, Plain end, AS/NZS 4129")
  const part = (c, withSize) => `<div class="sp-p"><b>${esc(c.d.replace(/\s\d{1,2}$/, ""))}</b>: ${esc([withSize && c.size, c.type, c.ends, c.dim].map(x => String(x || "").trim()).filter(x => x && x !== "-" && x !== "N/A").join(", "))}</div>`;
  // ---------- piping class ----------
  // one line always visible (class, title, the datasheet button); everything else in tap-to-open sections
  function pipeHTML(cls, size, service, parts){
    const P = IX.pipe[cls];
    if (!P) return `<div class="lk-ns">Piping class ${esc(cls)} is not in the spec.</div>`;
    const comps = P.comps || [], unit = comps.find(c => c.u) ? comps.find(c => c.u).u : "DN";
    const fit = size != null ? comps.filter(c => c.lo != null && size >= c.lo && size <= c.hi) : [];
    const dp = (P.design || []).find(r => /pressure/i.test(r[0])), dt = (P.design || []).find(r => /temperature/i.test(r[0]));
    // no summary on top: the datasheet button, then the pills (the class title is the first Class row)
    const h = pageBtn(P.page, cls + " datasheet", "Piping class " + cls);
    const S = [];
    if (size != null)
      S.push(sec("fit", `${unit}${size}`, fit.length, fit.length
        ? `<div class="sp-cl">${fit.map(c => part(c, false)).join("")}</div>`
        : `<div class="lk-ns">No component row in ${esc(cls)} covers ${esc(unit)}${esc(size)}: check the datasheet (the size may be non preferred).</div>`));
    const sv = service ? IX.services.filter(r => r.code === service && r.sys === cls) : [];
    // valves: only the datasheets whose size range covers this line (HDPE OD sizes compared as the matching DN)
    const dn = size == null ? null : unit === "OD" ? OD_DN[size] || size : size;
    sv.forEach((r, k) => {
      const all = String(r.valves || "").split(/[,\s]+/).filter(v => /^V[A-Z0-9]+$/.test(v));
      const vs = dn == null ? all : all.filter(v => !IX.valve[v] || IX.valve[v].lo == null || (dn >= IX.valve[v].lo && dn <= IX.valve[v].hi)), off = all.length - vs.length;
      S.push(sec("vl" + k, sv.length > 1 ? "Valves " + (k + 1) : "Valves", vs.length, `<div class="lk-ns" style="margin:0 0 4px">For ${esc(r.service)}${dn != null ? ` at ${esc(unit)}${esc(size)}` : ""}${off ? `; ${off} more for other sizes are in the datasheet` : ""}</div><div class="sp-v">${vs.map(v => IX.valve[v]
        ? `<a class="sp-chip lk-a" href="#" data-k="${esc(v)}" data-t="spec" title="${esc(IX.valve[v].title || "")}">${esc(v)}</a>` : `<span class="sp-chip off" title="No datasheet for this code in the spec">${esc(v)}</span>`).join("")}</div>` +
        tbl([["Fluid design", r.fluid], ["Class rating", r.rating], ["Gasket", r.gasket], ["External finish", r.ext], ["Note", r.notes]].filter(x => x[1] && x[1] !== "N/A"))));
    });
    let cd = tbl([["Description", P.title], ["Material", P.material], ["Design code", P.codes], ["Corrosion allowance", P.ca && P.ca + " mm"], ["Pressure test", P.test], ["NDT", P.nde]].filter(r => r[1]));
    if (P.design && P.design.length){
      const cols = Math.max(...P.design.map(r => r.length));
      cd += `<div class="sp-sc"><table class="lk-t sp-dt">${P.design.map(r => `<tr><td>${esc(r[0])}</td>${Array.from({ length: cols - 1 }, (_, i) => `<td>${esc(r[i + 1] || "")}</td>`).join("")}</tr>`).join("")}</table></div>`;
    }
    S.push(sec("cd", "Class", null, cd));
    if (comps.length && size == null)   // the whole table only when no size is known (the class opened on its own); sizes that don't apply stay in the PDF
      S.push(sec("all", "All parts", comps.length, `<div class="sp-cl">${comps.map(c => part(c, true)).join("")}</div>`));
    if (P.notes && P.notes.length) S.push(sec("notes", "Notes", P.notes.length, P.notes.map(n => `<div class="sp-n"><b>${esc(n[0])}</b> ${esc(n[1])}</div>`).join("")));
    return parts ? { head: h, S } : pills(S, "spec-pipe", h);
  }

  // ---------- valve datasheet ----------
  const KEY_ROWS = /^(Type|Service|Size Range|End Connections|Actuation|Lockable|Body Material|Ball Material|Disc Material|Gate Material|Seat Material|Liner|Diaphragm|Stem\/Trim Material|Stem Packing|Design Pressure|Design Temperature|Pressure Class|Flange)/i;
  function valveHTML(code, size, parts){
    const V = IX.valve[code];
    if (!V) return `<div class="lk-ns">Valve code ${esc(code)} has no datasheet in the spec.</div>`;
    const get = k => ((V.rows || []).find(r => new RegExp("^" + k, "i").test(r[0])) || [])[1];
    let h = "";   // no summary on top: the table below says it all
    if (size != null && V.lo != null && (size < V.lo || size > V.hi)) h += `<div class="sp-warn">DN${esc(size)} is outside this datasheet's size range (${esc(V.u)}${V.lo} to ${V.hi}).</div>`;
    h += pageBtn(V.page, code + " datasheet", "Valve " + code);
    // one table, no sub pills: type, materials and ratings first, then the rest of the datasheet, then its notes
    const rows = V.rows || [], body = tbl([...rows.filter(r => KEY_ROWS.test(r[0])), ...rows.filter(r => !KEY_ROWS.test(r[0]))]) +
      (V.notes || []).map(n => `<div class="sp-n"><b>${esc(n[0])}</b> ${esc(n[1])}</div>`).join("");
    return parts ? { head: h, body } : h + body;
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
    if (it.t === "spi" || it.t === "hose"){   // pipe specials and hoses name the piping class they sit in
      const cls = get(it, f, "Pipe spec");
      return cls && IX.pipe[cls] ? pipeHTML(cls, num(get(it, f, "Size (DN)")), null) : cls ? `<div class="lk-ns">Piping class ${esc(cls)} is not in the spec.</div>` : "";
    }
    if (it.t === "ins"){   // valves in the instrument list carry their valve datasheet code
      const code = get(it, f, "Valve type").trim();
      return IX.valve[code] ? valveHTML(code, num(get(it, f, "Valve size"))) : "";
    }
    if (it.t === "mv"){
      const code = get(it, f, "Spec"), size = num(get(it, f, "Size (DN)"));
      return code && IX.valve[code] ? valveHTML(code, size) : code ? `<div class="lk-ns">Valve code ${esc(code)} has no datasheet in the spec.</div>` : "";
    }
    if (it.t === "cv"){   // valve datasheet and the line's piping class under one row of sub pills
      const S = [], m = get(it, f, "Valve code").match(/^(\d+)([A-Z][A-Z0-9]+)/);
      if (m && IX.valve[m[2]]){ const v = valveHTML(m[2], +m[1], true); S.push(sec("sum", "Valve", null, v.head + v.body)); }
      const cls = get(it, f, "Line spec"), size = num(get(it, f, "Line size (mm)"));
      if (cls && IX.pipe[cls]){ const p = pipeHTML(cls, size, (get(it, f, "Line number").match(/^\d{2}-\d{4}-([A-Z]+)-/) || [])[1], true);
        S.push(sec("pipe", "Line " + cls, null, p.head), ...p.S.map(x => Object.assign(x, { id: "p-" + x.id }))); }
      return S.length ? pills(S, "spec-cv", "") : "";
    }
    return "";
  }
  const wanted = it => it && (["line", "mv", "cv", "spi", "hose"].includes(it.t) || it.t === "spec" || (it.t === "ins" && it.r && /^V[A-Z0-9]{3,}$/.test(String(it.r[DBf("ins").indexOf("Valve type")] || "").trim())));
  const DBf = t => (window.Lookup && Lookup.fields ? Lookup.fields(t) : []) || [];
  // a control valve list code such as "50VTWD1C1-Double Acting…": the valve datasheet at that size (Smart PFD panel)
  const forCode = c => { const m = String(c || "").match(/^(\d+)([A-Z][A-Z0-9]+)/); return IX && m && IX.valve[m[2]] ? valveHTML(m[2], +m[1]) : ""; };
  const note = () => IX ? `<div class="lk-src">Spec: ${esc(IX.meta.title)} ${esc(IX.meta.doc)} Rev ${esc(IX.meta.rev)}. Datasheet pages open in the built in viewer; the first open keeps the PDF on this device.</div>` : "";

  // search entries for every piping class and valve datasheet
  function extras(){
    return [...Object.entries(IX.pipe).map(([k, v]) => ({ t: "spec", key: k, code: k, name: "Piping class: " + (v.title || ""), words: (v.material || "") + " piping class spec datasheet" })),
      ...Object.entries(IX.valve).map(([k, v]) => ({ t: "spec", key: k, code: k, name: "Valve datasheet: " + (v.title || ""), words: "valve spec datasheet" }))];
  }

  // ---------- PDF viewer (pdfview.js) ----------
  const open = (page, title) => load().then(() => PdfView.open({ url: IX.meta.file, page, title: title || IX.meta.title, fit: "width", download: "2000-F00-STS-PP-10001 Rev 3 Piping Materials and Valves.pdf" }));
  function bind(root){ root.querySelectorAll(".sp-open").forEach(b => b.onclick = e => { e.preventDefault(); open(+b.dataset.page, b.dataset.title); }); }

  return { load, ready: () => !!IX, html, wanted, note, extras, bind, open, forCode };
})();
