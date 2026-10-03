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
  // a note number written into the spec text as ^10 (tools/spec_notes.py) shows as a superscript
  const tx = t => esc(t).replace(/\^(\d{1,2})/g, "<sup>$1</sup>");
  // the attributes always in one order (type / wall / rating, ends, standard, material), plain words with commas (a value
  // can hold commas of its own: "STD WT, ERW"); a value repeated in the same row shows once
  const F4 = ["type", "ends", "dim", "mat"];
  const vals = (c, fs) => { const out = []; fs.forEach(f => { const v = val(c[f]); if (v && !out.some(o => o.toLowerCase() === v.toLowerCase())) out.push(v); }); return out; };
  const part = (c, withSize) => `<div class="sp-p"><b>${tx(c.d.replace(/\s\d{1,2}$/, ""))}</b>: ${tx([withSize && val(c.size)].concat(vals(c, F4)).filter(Boolean).join(", "))}</div>`;
  // "As per pipe" (and "As per pipe WT", "As per large end piping": a reducer's wall is the bigger pipe's) written out as
  // the pipe's own value at this size, so a header names the spec instead of pointing at another row; a note on the
  // reference stays ("As per pipe^2" → "ASME B36.10M^2")
  const PIPE = c => /^pipe(\^\d{1,2})*$/i.test(String(c.d).trim());
  const wall = t => { const w = String(t || "").split(/,\s*/).filter(x => /\b(WT|SCH|SDR|PN|Class)\b|^\d+(\.\d+)?\s*mm\b/i.test(x)); return w.length ? w.join(", ") : t; };
  function resolve(c, pipe){
    if (!pipe) return c; const r = { ...c };
    F4.forEach(f => { const m = /^(as per pipe( wt)?|as per large end piping)((?:\^\d{1,2})*)\s*$/i.exec(val(c[f])); if (!m) return;
      const ref = val(m[2] || /large/i.test(m[1]) ? wall(pipe.type) : pipe[f]); if (ref) r[f] = ref + m[3]; });
    return r; }
  const pipeAt = (comps, size) => comps.find(c => PIPE(c) && c.lo != null && size >= c.lo && size <= c.hi);
  // the notes the parts shown point to, one per line under them
  const refNotes = (P, comps) => { const ns = new Set(comps.flatMap(c => ["d", "type", "ends", "dim", "mat"].flatMap(f => (String(c[f] || "").match(/\^\d{1,2}/g) || []).map(x => x.slice(1)))));
    const N = (P.notes || []).filter(n => ns.has(String(n[0])));
    return N.length ? `<div class="sp-nh">Notes</div>` + N.map(n => `<div class="sp-n"><sup>${esc(n[0])}</sup> ${esc(n[1])}</div>`).join("") : ""; };
  // the parts for one size: pipe, bolting, gaskets and the like as rows; the fittings and the flanges each with what
  // they all share in one box ("All fittings: SDR17 · Manufacturer Std"), then a heading per remaining difference
  // (usually the end type) with the parts under it. Only where it saves rows; otherwise the rows as they were.
  const val = x => { x = String(x || "").trim(); return x && x !== "-" && x !== "N/A" ? x : ""; };
  const nm = c => c.d.replace(/\s\d{1,2}$/, "");
  const KIND = c => /^pipe\b/i.test(c.d) ? "" : /flange/i.test(c.d) ? "flanges" : /bolt|nut|washer|gasket|lining|stud/i.test(c.d) ? "" : "fittings";
  function group(fits, label){
    if (!fits.length) return "";
    const F = F4, same = f => { const v = val(fits[0][f]).toLowerCase(); return v && fits.every(c => val(c[f]).toLowerCase() === v); };
    const shared = F.filter(same), rest = F.filter(f => !shared.includes(f)), groups = new Map();
    fits.forEach(c => { const k = vals(c, rest).join(", "); if (!groups.has(k)) groups.set(k, []); const g = groups.get(k); if (!g.includes(nm(c))) g.push(nm(c)); });
    if (fits.length < 2 || (!shared.length && groups.size >= fits.length)) return fits.map(c => part(c, false)).join("");
    return (shared.length ? `<div class="sp-all"><b>All ${label}:</b> ${tx(vals(fits[0], shared).join(", "))}</div>` : "") +
      [...groups].map(([k, ns]) => ns.length < 2 && k ? `<div class="sp-p"><b>${tx(ns[0])}</b>: ${tx(k)}</div>`   // a group of one: an ordinary row
        : (k ? `<div class="sp-gh">${tx(k)}</div>` : "") + `<div class="sp-gl">${ns.map(tx).join(" · ")}</div>`).join("");
  }
  function grouped(comps, size){
    const pipe = comps.find(PIPE); comps = comps.map(c => resolve(c, pipe));
    const by = k => comps.filter(c => KIND(c) === k);
    return comps.filter(c => /^pipe\b/i.test(c.d)).map(c => part(c, false)).join("") + group(by("fittings"), "fittings") + group(by("flanges"), "flanges") +
      comps.filter(c => !KIND(c) && !/^pipe\b/i.test(c.d)).map(c => part(c, false)).join("");
  }
  // ---------- fittings table ----------
  // Pick a fitting the class's spec calls for, its run size (starts on the line's size) and, for a branch or reducer, the
  // second size; every value the documents give for it shows below: the fitting the branch chart names (tools/spec_branch.py),
  // its spec row (written out as above), and its lengths where the class points to a piping standard drawing (spec_std.py).
  // A value the documents don't give is left out. The standard drawing's link sits at the top.
  const DNS = [15, 20, 25, 32, 40, 50, 65, 80, 90, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 900, 1000, 1050, 1200];
  const ODS = [20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1200];
  const ITEMS = [   // [label, test on the part's description, needs a second size]
    ["90° branch", /^(tee|tees\b)|olet\b|tapping saddle/i, "Branch size"],
    ["45° lateral", /^lateral, 45|junction.*45/i], ["60° lateral", /^lateral, 60|junction.*60/i],
    ["Y piece", /^wye|^y piece/i],
    ["Reducer, concentric", /^reducer(, concentric)?(\^\d+)?$/i, "Small end"], ["Reducer, eccentric", /^reducer, eccentric/i, "Small end"]];
  const sizeN = s => parseFloat(String(s).replace("*", ""));
  const clean = d => String(d).replace(/\^\d{1,2}/g, "").trim();
  // the fittings the class's spec calls for at size n (all sizes when n is null): a branch where its chart or a tee covers it
  function items(P, n){
    const comps = P.comps || [], has = re => comps.some(c => re.test(clean(c.d)) && (n == null || (c.lo != null && n >= c.lo && n <= c.hi))), out = [];
    ITEMS.forEach(([l, re, two]) => { if (has(re) || (l === "90° branch" && P.branch && (n == null || branchSizes(P, n).length))) out.push({ l, re, two }); });
    // elbows and bends, each as the spec names it
    [...new Set(comps.filter(c => /elbow|bend/i.test(c.d) && !/street/i.test(c.d)).map(c => clean(c.d)))].forEach(d => {
      const re = new RegExp("^" + d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); if (has(re)) out.push({ l: d, re }); });
    return out;
  }
  // branch sizes for a header size: the chart's cells, else the sizes a tee row covers
  function branchSizes(P, h){
    const g = P.branch && P.branch.g;
    if (g){ const hk = Object.keys(g).find(k => sizeN(k) === h); return hk ? Object.keys(g[hk]).map(sizeN).sort((a, b) => b - a) : []; }
    return null;
  }
  const allAt = (comps, re, n) => comps.filter(c => re.test(clean(c.d)) && c.lo != null && n >= c.lo && n <= c.hi);
  const band = (rules, n) => (rules.find(r => n <= r[0]) || [])[1];
  function fittingOut(cls, il, h, b){
    const P = IX.pipe[cls], comps = P.comps || [], it = items(P, h).find(x => x.l === il); if (!it) return "";
    const S = P.std && IX.std[P.std], top = []; let title = it.l, code = "", rows = [], note = "";
    const kv = (a, k, v) => { if (v != null && v !== "") a.push([k, v]); };
    if (it.l === "90° branch"){
      const g = P.branch && P.branch.g, hk = g && Object.keys(g).find(k => sizeN(k) === h), bk = hk && Object.keys(g[hk]).find(k => sizeN(k) === b);
      code = bk ? g[hk][bk] : P.branch ? "" : b === h ? "ET" : "RT";
      if (/^Note (\d+)/.test(code)){ const nn = code.slice(5); note = ((P.notes || []).find(x => String(x[0]) === nn) || [])[1] || ""; title = "See note " + nn; code = ""; }
      else if (code){
        title = (P.branch && P.branch.codes[code]) || { ET: "Equal tee", RT: "Reducing tee" }[code] || code;
        const base = code.split("+")[0], re = { ET: /^tee, equal|^tees\b/i, RT: /^tee, reducing|^tees\b/i, SO: /sockolet/i, TO: /threadolet|thredolet/i, WO: /weldolet/i }[base];
        if (re) rows = allAt(comps, re, /O$/.test(base) ? b : h);   // (an olet's size range is its branch size)
        if (/RED/.test(code)) rows = rows.concat(allAt(comps, /^reducer/i, h).slice(0, 1));
        if (S && (base === "ET" || base === "RT") && S.tee[h] && S.tee[h][b]){ kv(top, "A, centre to run end", S.tee[h][b][0] + " mm"); if (S.tee[h][b][1]) kv(top, "B, centre to branch end", S.tee[h][b][1] + " mm"); }
      }
    } else {
      rows = allAt(comps, it.re, h);
      if (/reducer/i.test(it.l) && S){ kv(top, "A, straight each end", band(S.reducer.A, h) + " mm"); kv(top, "B, taper", S.reducer.B); note = S.reducer.note; }
      const t = S && (/lateral/i.test(it.l) ? S.lateral : /y piece/i.test(it.l) ? S.y : null);
      if (t && t[h]){ kv(top, "A, run end to branch", t[h][0] + " mm"); kv(top, "B, branch to run end", t[h][1] + " mm"); kv(top, "Flush port, optional", "DN50, " + band(S.flush, h) + " mm"); }
    }
    const pipe = pipeAt(comps, h);
    // one block per spec row that covers this size: the spec can offer two ways of making the same fitting
    const blocks = rows.map(c => { const r = resolve(c, pipe), a = []; if (clean(c.d).toLowerCase() !== String(title).toLowerCase()) kv(a, "Part", clean(c.d)); kv(a, "Sizes", val(c.size)); [["Wall / rating", r.type], ["Ends", r.ends], ["Standard", r.dim], ["Material", r.mat]].forEach(([k, v]) => kv(a, k, val(v))); return a; });
    const kvh = a => a.map(([k, v]) => `<div class="sp-kv"><span>${esc(k)}</span><b>${tx(String(v))}</b></div>`).join("");
    return `<div class="sp-fo"><h4>${code ? `<span class="sp-fc">${esc(code)}</span>` : ""}${tx(title)}</h4>${kvh(top)}` +
      blocks.map((a, k) => (blocks.length > 1 ? `<div class="sp-fv">Option ${k + 1} of ${blocks.length}</div>` : "") + kvh(a)).join("") +
      (note ? `<div class="sp-fn">${esc(note)}</div>` : "") + `</div>`;
  }
  function fittingsHTML(cls, size){
    const P = IX.pipe[cls]; if (!items(P, null).length) return "";
    const comps = P.comps || [], unit = comps.find(c => c.u) ? comps.find(c => c.u).u : "DN";
    const list = (unit === "OD" ? ODS : DNS).filter(n => items(P, n).length);   // only sizes something is listed for
    if (!list.length) return "";
    const S = P.std && IX.std[P.std], h0 = list.includes(size) ? size : list.reduce((a, n) => size != null && Math.abs(n - size) < Math.abs(a - size) ? n : a, list[0]);
    return (S ? `<button class="lk-btn sp-std" data-file="${esc(S.file)}" data-title="${esc(P.std)}">Standard drawing ${esc(P.std)} <span>${esc(S.title.replace(/^Piping standards, (.)/, (m, c) => c.toUpperCase()))}</span></button>` : "") +
      `<div class="sp-ff" data-cls="${esc(cls)}" data-list="${list.join(",")}" data-unit="${unit}" data-h="${h0}"><label class="sp-f w"><span>Item</span><select data-k="it"></select></label>` +
      `<label class="sp-f"><span>Size</span><select data-k="h">${list.map(n => `<option value="${n}"${n === h0 ? " selected" : ""}>${unit}${n}</option>`).join("")}</select></label><label class="sp-f"><span class="sp-l2"></span><select data-k="b"></select></label></div><div class="sp-out"></div>`;
  }
  function bindFit(root){
    root.querySelectorAll(".sp-ff").forEach(f => {
      const P = IX.pipe[f.dataset.cls], list = f.dataset.list.split(",").map(Number), unit = f.dataset.unit, q = k => f.querySelector(`[data-k="${k}"]`), out = f.nextElementSibling;
      const opts = (ns, sel) => ns.map(n => `<option value="${n}"${n === sel ? " selected" : ""}>${unit}${n}</option>`).join("");
      const run = () => {
        const h = +q("h").value, its = items(P, h), was = q("it").value, it = its.find(x => x.l === was) || its[0];
        q("it").innerHTML = its.map(x => `<option${x === it ? " selected" : ""}>${esc(x.l)}</option>`).join("");   // only what this size has
        const two = it && it.two, bw = q("b").parentElement; bw.style.display = two ? "" : "none"; bw.querySelector(".sp-l2").textContent = two || "";
        if (two){
          const prev = +q("b").value, ns = it.l === "90° branch" ? (branchSizes(P, h) || list.filter(n => n <= h).reverse()) : list.filter(n => n < h && allAt(P.comps, it.re, h).length).reverse();
          const sel = ns.includes(prev) ? prev : ns[0]; q("b").innerHTML = opts(ns, sel);
        }
        out.innerHTML = it ? fittingOut(f.dataset.cls, it.l, h, two ? +q("b").value : null) : "";
      };
      q("it").onchange = run; q("h").onchange = run; q("b").onchange = run; run();
    });
    root.querySelectorAll(".sp-std").forEach(b => b.onclick = e => { e.preventDefault(); PdfView.open({ url: b.dataset.file, page: 1, title: b.dataset.title, fit: "width", download: b.dataset.title + ".pdf" }); });
  }
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
        ? `<div class="sp-cl">${grouped(fit, size)}</div>` + refNotes(P, fit)
        : `<div class="lk-ns">No component row in ${esc(cls)} covers ${esc(unit)}${esc(size)}: check the datasheet (the size may be non preferred).</div>`));
    const ft = fittingsHTML(cls, size); if (ft) S.push(sec("ft", "Fittings table", null, ft));
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
      S.push(sec("all", "All parts", comps.length, `<div class="sp-cl">${comps.map(c => part(resolve(c, c.lo != null && pipeAt(comps, c.lo)), true)).join("")}</div>` + refNotes(P, comps)));
    if (P.notes && P.notes.length) S.push(sec("notes", "Notes", P.notes.length, P.notes.map(n => `<div class="sp-n"><sup>${esc(n[0])}</sup> ${esc(n[1])}</div>`).join("")));
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
  function bind(root){ root.querySelectorAll(".sp-open").forEach(b => b.onclick = e => { e.preventDefault(); open(+b.dataset.page, b.dataset.title); }); bindFit(root); }

  return { load, ready: () => !!IX, html, wanted, note, extras, bind, open, forCode };
})();
