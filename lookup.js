// Tag lookup shared by the phone app (index.html) and the desktop PFD (pfd.html).
// Data: search-data.json, built from the project lists by tools/build_search.py.
// Search is forgiving: case, spaces, hyphens and slashes are ignored, partial tags match,
// and plain words search every description. Photo text recognition (Tesseract.js) is loaded only when used.
(function(){
  const L = {};
  let DB = null, done = false, loading = null, items = [], byKey = new Map(), refs = new Map(), extras = [];
  const norm = s => String(s || "").toUpperCase().replace(/[\s\-_/.]+/g, "");
  L.norm = norm;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Things that look like a plant code inside any text
  const TAG_RE = /\b(2000-[A-Z0-9]{3,6}-[A-Z]{3}-[A-Z]{2}-\d{4,5}|\d{2}-\d{4}-[A-Z0-9]{1,6}-[A-Z0-9]{2,6}-\d{2,4}(?:-[A-Z]{1,3})?|F\d{2}-[A-Z]{1,4}-\d{2,4}[A-Z]?|F\d{2}-\d{5}|SP-[A-Z]{2}-\d{3}|[A-Z]{1,5} ?\d{5}[A-Z]?)\b/g;
  const TYPE_ORDER = ["pfd", "mel", "ins", "cv", "mv", "line", "spec", "spi", "hose", "gloss", "pid"];
  const ICON = {};   // no pictures: each list is named in words (the type line, the pills)

  L.addExtra = list => { extras = extras.concat(list); if (DB) indexExtras(list); };
  function indexExtras(list){ list.forEach(x => { x.k = norm(x.key); x.txt = (x.key + " " + x.name + " " + (x.words || "")).toLowerCase(); items.push(x); addKey(x.k, x); }); }
  function addKey(k, it){ if (!k) return; const a = byKey.get(k); if (a) a.push(it); else byKey.set(k, [it]); }

  let dtLoad = null;
  L.load = () => loading || (dtLoad = fetch("doc-tags.json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(d => { DT = d; }), loading = fetch("search-data.json").then(r => { if (!r.ok) throw new Error("search data " + r.status); return r.json(); }).then(d => { DB = d; build();
    if (window.Spec) Spec.load().then(() => L.addExtra(Spec.extras())).catch(() => {});   // piping classes and valve datasheets become searchable
    // drawings in the app (small index, waited for so a drawing number in a record links to the drawing straight away);
    // drawings no list refers to (e.g. PFD sheets) become search results of their own
    return (window.Pid ? Pid.load().then(() => Pid.all().forEach(d => { const k = norm(d.number); if (byKey.has(k)) return;
      const it = { t: "pid", key: d.number, k, name: Pid.kind(d.number) + " drawing" + (d.title ? ": " + d.title : ""), r: null }; items.push(it); addKey(k, it); })).catch(() => {}) : Promise.resolve()).then(() => dtLoad).then(() => { done = true; return L; }); }));
  L.ready = () => !!DB;
  function build(){
    Object.entries(DB.data).forEach(([t, rows]) => rows.forEach(r => { const it = { t, r, key: r[0], k: norm(r[0]), name: nameOf(t, r) }; items.push(it); addKey(it.k, it); }));
    // cross references: any field that mentions a known code (or a P&ID) links back to this item
    const pids = new Map();
    items.forEach(it => { if (!it.r) return;
      it.r.forEach((v, i) => { if (!v || i === 0) return; String(v).replace(TAG_RE, m => {
        const k = norm(m); if (k === it.k) return m;
        if (/^2000/.test(m) && /PID/.test(m)) { if (!pids.has(k)) pids.set(k, m); }
        else if (!byKey.has(k)) return m;
        let a = refs.get(k); if (!a) refs.set(k, a = []); if (a[a.length - 1] !== it) a.push(it); return m; }); }); });
    pids.forEach((m, k) => { const it = { t: "pid", key: m, k, name: "P&ID drawing: everything shown on it", r: null }; items.push(it); addKey(k, it); });
    indexExtras(extras);
  }
  function nameOf(t, r){
    const f = DB.types[t].f, g = n => r[f.indexOf(n)] || "";
    if (t === "mel") return g("Equipment name");
    if (t === "ins") return g("Description") || g("Instrument type");
    if (t === "cv") return g("Location");
    if (t === "line") return [g("Service description") || g("Service"), "DN" + g("Size (DN)"), g("From") && "from " + g("From"), g("To") && "to " + g("To")].filter(Boolean).join(" ");
    if (t === "mv") return [g("Size (DN)") && "DN" + g("Size (DN)"), g("Valve type"), "valve", /^\d{2,3}-[A-Z]?\d{3,4}-/.test(g("Line number")) && "on " + g("Line number")].filter(Boolean).join(" ");
    if (t === "spi" || t === "hose") return g("Description");
    return r[1] || "";
  }
  const typeName = t => t === "pfd" ? "On the PFD" : t === "gloss" ? "Glossary" : t === "pid" ? "Drawing (P&ID / PFD)" : t === "spec" ? "Pipe & valve spec" : DB.types[t].n;
  const textOf = it => it.txt || (it.txt = (it.r ? it.r.join(" ") : it.key + " " + it.name).toLowerCase());

  L.search = (q, limit = 60) => {
    if (!DB) return [];
    const nq = norm(q); if (nq.length < 2) return [];
    const words = String(q).toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const out = [];
    for (const it of items){
      let s = 0;
      if (it.k === nq) s = 100; else if (it.k.startsWith(nq)) s = 80 - Math.min(10, it.k.length - nq.length) / 2; else if (nq.length >= 3 && it.k.includes(nq)) s = 60 - Math.min(10, it.k.length - nq.length) / 2;
      if (!s && words.length && words.every(w => textOf(it).includes(w))) s = 30 + (words.every(w => String(it.name).toLowerCase().includes(w)) ? 8 : 0);
      if (s){ if (it.t === "pfd") s += 5; out.push({ it, s }); }
    }
    out.sort((a, b) => b.s - a.s || TYPE_ORDER.indexOf(a.it.t) - TYPE_ORDER.indexOf(b.it.t) || a.it.key.localeCompare(b.it.key));
    return out.slice(0, limit).map(x => x.it);
  };
  L.count = q => { const nq = norm(q); return nq.length < 2 ? 0 : L.search(q, 100000).length; };

  // ---------- rendering ----------
  // a drawing in the app: its number links straight to the drawing; any other known code links to its page
  const linkify = v => esc(v).replace(TAG_RE, m => { const k = norm(m);
    if (/-(PID|PFD)-/.test(m) && window.Pid && Pid.has(m)) return `<a class="lk-a" data-dwg="${m}" href="#" title="Open the drawing">${m}</a>`;
    return byKey.has(k) ? `<a class="lk-a" data-k="${k}">${m}</a>` : m; });
  L.resultsHTML = (hits, q) => {
    if (!hits.length) return `<div class="lk-empty">No match for “${esc(q)}”. Try fewer characters, e.g. the number only.</div>`;
    // one line per result: icon, code, description (the pill shows the list it comes from)
    const codey = k => !/\s\S+\s/.test(k) || k.length < 16;   // a tag or number, not a sentence (PFD stream names)
    return hits.map((it, i) => `<button class="lk-row1${codey(it.key) ? "" : " txt"}" data-i="${i}" title="${esc(typeName(it.t))}"><b>${esc(it.key)}</b><span>${esc(L.listName(it))}</span></button>`).join("");
  };
  const PILLN = { mel: "Equipment", ins: "Instruments", cv: "Control valves", mv: "Manual valves", line: "Lines", spi: "Specials", hose: "Hoses", pid: "Drawings", spec: "Spec", pfd: "PFD", gloss: "Glossary" };
  const KEYF = {
    mel: ["Equipment name", "Size / description", "Installed power (kW)", "Status", "Stage", "P&ID"],
    ins: ["Description", "Instrument type", "Equipment number", "Range / units", "Loop number", "P&ID"],
    cv: ["Location", "Valve type", "Valve code", "Valve size (mm)", "Line number", "Fail position", "P&ID"],
    line: ["Service description", "Size (DN)", "Pipe spec", "From", "To", "P&ID"],
    mv: ["Valve type", "Spec", "Size (DN)", "Line number", "Model", "P&ID"],
    spi: ["Description", "Size (DN)", "Pipe spec", "Make / model", "P&IDs"],
    hose: ["Description", "Size (DN)", "Length (m)", "Service", "Stage"] };
  // Pill filters over a panel's sections: one pill per heading (with its count), one section shown at a time.
  // secs: [{ id, label, n, html }]; sections without html are left out. The last pill picked in a group is kept
  // for the next item, when it has one. Clicks are handled once for the whole page (below).
  const pfLast = {};
  const PHONE = () => document.documentElement.classList.contains("phone");
  L.pills = (secs, group = "g", mid = "") => {
    secs = secs.filter(x => x && x.html); if (!secs.length) return "";
    if (secs.length === 1) return mid + secs[0].html;   // one section: no pill bar
    const last = pfLast[group], act = last && !/^(r-|also$)/.test(last) && secs.some(x => x.id === last) ? last : secs[0].id;   // links to other items are not carried over
    return `<div class="pf" data-g="${esc(group)}"><div class="pf-bar">${secs.map(x => `<button type="button" class="pf-b${x.id === act ? " on" : ""}" data-p="${esc(x.id)}">${esc(x.label)}${x.n != null ? ` <i>${x.n}</i>` : ""}</button>`).join("")}</div>` + mid +
      secs.map(x => `<div class="pf-sec" data-p="${esc(x.id)}"${x.id === act ? "" : " hidden"}>${x.html}</div>`).join("") + `</div>`;
  };
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest(".pf-b"); if (!b) return; const pf = b.closest(".pf"); pfLast[pf.dataset.g] = b.dataset.p;
    [...pf.children].forEach(c => { if (c.classList.contains("pf-bar")) c.querySelectorAll(".pf-b").forEach(x => x.classList.toggle("on", x === b)); else if (c.classList.contains("pf-sec")) c.hidden = c.dataset.p !== b.dataset.p; }); });
  L.refs = k => refs.get(norm(k)) || [];
  // ---------- no double ups ----------
  // rows [{ l: label, v: value, h: html }] in priority order. The same property (label without units, synonyms joined)
  // is kept once with the more complete value; a value already readable from the tag, a longer code, other text or the
  // heading is dropped. Different properties that happen to share a value both stay.
  const SYN = { "process fluid": "fluid", "equipment name": "name", "valve size": "size", "size": "size", "line size": "line size", "quantity": "total qty", "p&ids": "p&id" };
  const ABBR = { "internal diameter": "ID", "outside diameter": "OD", "max bend radius": "bend radius" };
  const canon = l => { l = String(l).toLowerCase().replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim(); return SYN[l] || l; };
  const unitless = v => String(v).toUpperCase().replace(/\bDN\s*(?=\d)|\bOD\s*(?=\d)|\bMM\b|\bNB\b/g, "").replace(/[^A-Z0-9.]/g, "");
  const segs = v => String(v).toUpperCase().split(/[\s\-_/,;:()]+/).filter(Boolean);
  const CODEL = /type|class|spec|service|code|model|size|area|loop|number|tag|fluid|package|panel|stage/i;
  const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function said(r, o){   // is r's value already said inside the (longer) text o?
    const v = String(r.v).trim(), O = String(o || "").trim(); if (!v || O.length <= v.length) return false;
    const V = v.toUpperCase();
    // a figure a longer text already states under its own name, e.g. Length 0.835 in "Hose Length: 0.835 m"
    const nm = canon(r.l).replace(/[^a-z ]/g, "").trim();
    if (nm.length >= 4 && [nm, ABBR[nm]].filter(Boolean).some(w => new RegExp("(^|[^a-z])" + reEsc(w) + "[^0-9A-Za-z]{0,12}" + reEsc(v) + "([^0-9A-Za-z]|$)", "i").test(O))) return true;
    if (/^[\d.,]+$/.test(v)){   // a bare number only when it is a size / area / loop / number field
      if (!/size|area|loop|number|dn/i.test(r.l)) return false;
      return segs(O).some(x => x === V || (x.length > V.length && /[A-Z]/.test(x) && (x.startsWith(V) || x.endsWith(V))) || (V.length >= 4 && x.includes(V)));
    }
    if (/^[A-Za-z0-9.]+$/.test(v)){   // a code
      if (segs(O).includes(V)) return (CODEL.test(r.l) || V.length >= 3) && (/\d/.test(V) || O.length <= 40);   // a plain word isn't "said" by a long product description
      if (!CODEL.test(r.l) && V.length < 5) return false;
      if (!/\d/.test(V)) return false;   // a plain word (e.g. "Check") only counts as said when it stands alone, not inside "SUPERCHECK"
      return segs(O).some(x => x.length > V.length && (x.startsWith(V) || x.endsWith(V) || ((V.length >= 4 || (V.length === 3 && CODEL.test(r.l) && /\d/.test(x))) && x.includes(V))));
    }
    return v.length >= 4 && new RegExp("(^|[^A-Za-z0-9])" + reEsc(v) + "([^A-Za-z0-9]|$)", "i").test(O);   // words inside other words
  }
  const same = (a, b) => unitless(a) === unitless(b) && unitless(a) !== "";
  L.dedupe = (rows, ctx = {}) => {
    const out = [];
    rows.forEach(r => { if (r.v == null || String(r.v).trim() === "") return;
      const c = canon(r.l), prev = out.find(x => x.c === c);
      if (prev){ if (same(prev.v, r.v) || said(r, prev.v)) return; if (said(prev, r.v)){ Object.assign(prev, r, { c }); return; } }
      out.push(Object.assign({ c }, r)); });
    const heads = (ctx.heads || []).filter(Boolean);
    return out.filter(r => !heads.some(t => same(r.v, t) || said(r, t)) && !out.some(o => o !== r && said(r, o.v)));
  };
  L.rowsHTML = rows => rows.map(r => `<tr><td>${esc(r.l)}</td><td>${r.h != null ? r.h : esc(r.v)}</td></tr>`).join("");
  L.fields = t => DB && DB.types[t] ? DB.types[t].f : null;
  // a line in a list: "from <equipment description> (<tag>) to …", equipment named from the MEL; another line stays a number
  const endText = v => { v = String(v || "").trim().replace(/^(to|from)\s+/i, ""); if (!v) return "not given";
    return v.replace(TAG_RE, m => { const e = (byKey.get(norm(m)) || []).find(x => x.t === "mel"); return e && e.name ? `${e.name} (${m})` : m; }); };
  // a line's two ends as "Name (tag)" (or the other line's number)
  // names: an equipment end as its MEL name only (no tag); another line's end stays its number
  const endName = v => { v = String(v || "").trim().replace(/^(to|from)\s+/i, ""); if (!v) return "not given";
    return v.replace(TAG_RE, m => { const e = (byKey.get(norm(m)) || []).find(x => x.t === "mel"); return e && e.name ? e.name : m; }); };
  L.lineEnds = (it, names) => { const f = DB.types.line.f, e = names ? endName : endText; return [e(it.r[f.indexOf("From")]), e(it.r[f.indexOf("To")])]; };
  L.lineText = it => { if (it.t !== "line" || !it.r) return it.name; const f = DB.types.line.f;
    return `from ${endText(it.r[f.indexOf("From")])} to ${endText(it.r[f.indexOf("To")])}`; };
  // the line under the tag: a line's service and size (its ends are in Details, tappable); never the tag again
  const headName = it => { let n = it.t === "line" && it.r ? [L.get(it, "Service description") || L.get(it, "Service"), L.get(it, "Size (DN)") && "DN" + L.get(it, "Size (DN)")].filter(Boolean).join(" ") : String(it.name || "");
    const k = String(it.key); if (n.toUpperCase().startsWith(k.toUpperCase())) n = n.slice(k.length).replace(/^[\s:,\-]+/, ""); return n; };
  // the text beside a tag in a list: lines say where they run, everything else its name without the tag again
  L.listName = it => it.t === "line" ? L.lineText(it) : headName(it);
  L.itemHTML = (it, opts = {}) => {
    const dwg = it.t === "pid" && window.Pid && Pid.has(it.key) ? Pid.info(it.key) : null;
    let h = `<div class="lk-head"><div class="lk-hs"><div class="lk-kind">${esc(typeName(it.t))}</div><span class="lk-slot"></span></div><div class="lk-hb">` +
      `<div class="lk-kr">` + (dwg ? `<a class="lk-key lk-dwg" data-dwg="${esc(dwg.number)}" href="#" title="Open the drawing">${esc(it.key)}</a>` : `<div class="lk-key">${esc(it.key)}</div>`) + `<span class="lk-vslot"></span></div>` + (it.t === "pid" ? (PHONE() && dwg && dwg.title ? `<div class="lk-name">${esc(dwg.title)}</div>` : "") : it.r && !PHONE() || it.t === "spec" || it.t === "line" ? "" : `<div class="lk-name">${linkify(headName(it))}</div>`) +   // records: the table says it (no summary line; the phone's header card names it)
      (PHONE() ? figs(it) : "") + `</div></div>`;
    // a drawing: no summary lines (the preview beside it shows the number and title); the phone has no preview, so the title stays there
    if (!dwg && it.t === "pid") h += `<div class="lk-ns">This drawing isn't loaded in the app yet.</div>`;
    const pfd = opts.pfd && opts.pfd(it);
    if (pfd) h += `<button class="lk-btn" data-pfd="1">${esc(pfd.label)}</button>`;
    if (it.t === "pfd" || it.t === "gloss"){ h += it.html || `<p>${esc(it.text || "")}</p>`; }
    // the rest sits under pill filters: Details, Pipe spec, All fields, Also in, then one pill per list that refers to it
    const secs = [];
    if (it.t === "spec") secs.push({ id: "spec", label: "Spec", html: `<div class="lk-spec sp-self"></div>` });   // the heading already names the class / valve
    // the same tag in other lists (e.g. an instrument that is also in the control valve list) merges into Details
    const same = (byKey.get(it.k) || []).filter(x => x !== it), twins = same.filter(x => x.r && DB.types[x.t]), others = same.filter(x => !twins.includes(x));
    if (it.r){
      // Details: every attribute of the item itself in one table, key fields first
      const f = DB.types[it.t].f, key = KEYF[it.t] || f.slice(1, 7);
      const top = key.map(n => f.indexOf(n)).filter(i => i > 0 && it.r[i]);
      const rest = f.map((n, i) => i).filter(i => i > 0 && it.r[i] && !top.includes(i));
      // this list first, then the same tag in other lists; each property once (L.dedupe)
      const rows = [...top, ...rest].map(i => ({ l: f[i], v: it.r[i], h: linkify(it.r[i]) }));
      // the manual valve list puts words like "Commissioning" in its line number column: that is a note, not a line
      rows.forEach(r => { if (/^line number$/i.test(r.l) && !/\d{2,3}-[A-Z]?\d{3,4}-/.test(r.v)) r.l = "Note"; });
      twins.forEach(x => { const g = DB.types[x.t].f; g.forEach((n, i) => { if (i > 0 && x.r[i]) rows.push({ l: n, v: x.r[i], h: linkify(x.r[i]) }); }); });
      const NAMEF = { mel: "Equipment name", ins: "Description", cv: "Location", spi: "Description", hose: "Description" };   // the phone's header card names it
      const kept = L.dedupe(rows.filter(r => !inTag(it, r.l) && !(PHONE() && r.l === NAMEF[it.t])), { heads: [it.key, ...twins.map(x => x.key)] });
      docRows(it, kept);
      // the item's drawings sit above the sections, P&ID first (number only) then PFD with its sheet title (out of the Details table)
      const DW = /^(P&IDs?|PFD)$/, dws = kept.filter(r => DW.test(r.l)).sort((a, b) => (a.l === "PFD") - (b.l === "PFD"));
      if (dws.length){ for (let i = kept.length - 1; i >= 0; i--) if (DW.test(kept[i].l)) kept.splice(i, 1);
        h += `<div class="lk-dw">` + dws.map(r => { const ns = [...new Set(String(r.v).match(/2000-[A-Z0-9]{2,6}-P[FI]D-[A-Z]{2}-\d{4,5}/g) || [])];
          return `<div class="lk-dr"><span>${r.l === "PFD" ? "PFD" : "P&amp;ID"}</span><div>` + (ns.length ? ns.map(n => `<div>${dwgA(n)}${r.l === "PFD" && dwgTitle(n) ? ` <i>${esc(dwgTitle(n))}</i>` : ""}</div>`).join("") : r.h) + `</div></div>`; }).join("") + `</div>`; }
      secs.push({ id: "det", label: "Details", html: `<table class="lk-t">${L.rowsHTML(kept)}</table>` });
      const sp = window.Spec && [it, ...twins].find(x => Spec.wanted(x));
      if (sp) secs.push({ id: "spec", label: ["line", "spi", "hose"].includes(sp.t) ? "Pipe spec" : "Valve spec", html: `<div class="lk-spec" data-k="${sp.k}" data-t="${sp.t}"><div class="lk-ns">Loading the pipe and valve spec…</div></div>` });
    }
    if (others.length) secs.push({ id: "also", label: "Also in", n: others.length, html: others.map(x => `<a class="lk-a lk-row" data-k="${x.k}" data-t="${x.t}">${esc(typeName(x.t))}: ${esc(x.name)}</a>`).join("") });
    // related items: one pill per list that refers to this tag (or its twin entries)
    const rf = [...new Set([it, ...twins].flatMap(y => refs.get(y.k) || []))].filter(x => x !== it && !twins.includes(x));
    if (rf.length){
      const g = {}; rf.forEach(x => (g[x.t] = g[x.t] || []).push(x));
      TYPE_ORDER.filter(t => g[t]).forEach(t => { const a = g[t], show = a.slice(0, 60);
        secs.push({ id: "r-" + t, label: (PILLN[t] || typeName(t)), n: a.length, html: 
          show.map(x => `<a class="lk-a lk-row" data-k="${x.k}" data-t="${x.t}"><b>${esc(x.key)}</b> ${esc(L.lineText(x))}</a>`).join("") +
          (a.length > show.length ? `<div class="lk-ns">and ${a.length - show.length} more; search the tag to see them all.</div>` : "") }); });
    }
    // a P&ID: the drawings it joins (P&IDs pill first) and the lines that cross, each split From / To one row below
    const pl = it.t === "pid" && /-PID-/.test(it.key) && L.pidLinks(it.key);
    if (pl){
      const lineRow = x => `<a class="lk-a lk-row" data-k="${x.k}" data-t="${x.t}"><b>${esc(x.key)}</b> ${esc(L.lineText(x))}</a>`;
      const pidRow = p => { const d = window.Pid && Pid.info(p.n), t = d && d.title ? ` (${esc(L.pidTitle(d.title))})` : "", c = ` <span class="lk-ns">(x${p.lines.length} line${p.lines.length > 1 ? "s" : ""})</span>`;
        return L.find(p.k, "pid") ? `<a class="lk-a lk-row" data-k="${p.k}" data-t="pid"><b>${esc(p.n)}</b>${t}${c}</a>` : `<div class="lk-row"><b>${esc(p.n)}</b>${t}${c}</div>`; };
      const none = w => `<div class="lk-ns">No line in the line list ${w}.</div>`;
      const sub = (g, a, b) => L.pills([{ id: "from", label: "From", n: a.n, html: a.html }, { id: "to", label: "To", n: b.n, html: b.html }], g);
      const P = sub("pid-p", { n: pl.from.length, html: pl.from.length ? pl.from.map(pidRow).join("") : none("comes in from another P&ID") },
        { n: pl.to.length, html: pl.to.length ? pl.to.map(pidRow).join("") : none("goes out to another P&ID") });
      secs.unshift({ id: "pids", label: "P&IDs", n: new Set([...pl.from, ...pl.to].map(p => p.k)).size, html: P });
      const ln = secs.find(x => x.id === "r-line"), all = ln ? ln.html : "";
      const Ls = L.pills([{ id: "from", label: "From", n: pl.lin.length, html: pl.lin.length ? pl.lin.map(lineRow).join("") : none("comes in from another P&ID") },
        { id: "to", label: "To", n: pl.lout.length, html: pl.lout.length ? pl.lout.map(lineRow).join("") : none("goes out to another P&ID") },
        all && { id: "all", label: "On this drawing", n: ln.n, html: all }], "pid-l");
      if (ln) Object.assign(ln, { id: "lines", html: Ls }); else if (pl.lin.length + pl.lout.length) secs.splice(1, 0, { id: "lines", label: "Lines", html: Ls });
    }
    h += L.pills(secs, "item-" + (it.t === "pid" ? "pid" : "rec"));
    return h;
  };
  // properties the tag's own nomenclature already says, never repeated: a line number carries its area, service (fluid),
  // pipe spec and size (13-0051-PW-SS1-300); equipment its area (F12-…); an instrument its type letters and loop number;
  // a control valve its type letters; a manual valve its area; a pipe special its type (SP-HS-001)
  const NOMEN = { line: /^(area|service|service description|size \(dn\)|pipe spec)$/i, mel: /^area$/i, ins: /^(instrument type|loop number)$/i,
    cv: /^valve type$/i, mv: /^area$/i, spi: /^type$/i };
  const inTag = (it, l) => !!(NOMEN[it.t] && NOMEN[it.t].test(String(l).trim()) && (it.t !== "ins" || /^[A-Z]{1,5}\s*\d/.test(it.key)));
  // phone header card: up to three key figures for the item's kind, never one its tag or name already says
  const FIG = { mel: ["Installed power (kW)", "Design duty point", "Nominal duty point", "Size / description", "Duty / standby", "Status"],
    ins: ["Instrument type", "Range / units", "Process fluid", "Loop number", "Make"], cv: ["Valve size (mm)", "Fail position", "Actuator type", "Fluid", "Flow max (m³/h)"],
    line: ["Size (DN)", "Pipe spec", "Design pressure (kPag)", "Operating pressure (kPag)", "Insulation", "Pipe length (m)"], mv: ["Size (DN)", "Valve type", "Spec", "Manufacturer", "Model"],
    spi: ["Size (DN)", "Total qty", "Pipe spec", "Make / model"], hose: ["Size (DN)", "Length (m)", "Internal diameter (mm)", "Pipe spec", "Service"] };
  function figs(it){
    const want = FIG[it.t]; if (!it.r || !want) return "";
    const rows = want.map(n => ({ l: n, v: L.get(it, n) })).filter(r => r.v && String(r.v).trim() && String(r.v).length <= 22 && !inTag(it, r.l));
    const kept = L.dedupe(rows, { heads: [it.key, headName(it)] }).slice(0, 3); if (!kept.length) return "";
    const show = r => { const u = (/\(([^)]+)\)\s*$/.exec(r.l) || [])[1], l = r.l.replace(/\s*\([^)]*\)\s*$/, "");
      return [u === "DN" ? "DN" + r.v : u && /^[\d.,\s]+$/.test(r.v) ? r.v + " " + u : r.v, l]; };
    return `<div class="lk-figs">${kept.map(r => { const [v, l] = show(r); return `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`; }).join("")}</div>`;
  }
  // spec section (pipe class for a line, datasheet for a valve), filled once spec/index.json is loaded
  L.fillSpec = (root, it) => { const el = root.querySelector(".lk-spec"); if (!el || !window.Spec) return;
    if (el.dataset.k) it = L.find(el.dataset.k, el.dataset.t) || it;   // the spec may come from the same tag in another list
    Spec.load().then(() => { if (!el.isConnected) return; el.innerHTML = Spec.html(it, it.r && DB.types[it.t] ? DB.types[it.t].f : []); Spec.bind(el); })
      .catch(e => { el.innerHTML = `<div class="lk-ns">Couldn't load the pipe and valve spec (${esc(e.message)}).</div>`; }); };
  // for the Browse pickers (browse.js): every item, a field by name, the list icons and names
  L.items = () => items;
  L.get = (it, n) => { if (!it.r || !DB.types[it.t]) return ""; const i = DB.types[it.t].f.indexOf(n); return i < 0 ? "" : it.r[i] || ""; };
  L.ICON = ICON; L.typeName = t => typeName(t);
  // PFD sheets and documents a tag is written on (doc-tags.json, tools/build_pid_refs.py): equipment gets a PFD row
  // just above its P&ID (the list's own PFD plus any sheet it is read on), anything in the PDC a PDC row below it.
  // Each drawing is a link that opens the sheet (at the page) with the tag marked.
  let DT = null;
  const dwgA = (n, pg) => window.Pid && Pid.has(n) ? `<a class="lk-a" data-dwg="${esc(n)}" data-page="${pg || 1}" href="#">${esc(n)}</a>` : esc(n);
  const dwgTitle = n => { const d = window.Pid && Pid.info(n); return d && d.title ? L.pidTitle(d.title) : ""; };
  function docRows(it, rows){
    const seen = (DT && DT[it.key]) || [];
    const at = () => { const i = rows.findIndex(r => /^P&IDs?$/.test(r.l)); return i < 0 ? rows.length : i; };
    if (it.t === "mel"){
      const own = String(L.get(it, "PFD")).match(/2000-[A-Z0-9]{3,6}-PFD-[A-Z]{2}-\d{4,5}/g) || [];
      const pfds = [...new Set([...own, ...seen.filter(x => /-PFD-/.test(x[0])).map(x => x[0])])];
      for (let i = rows.length - 1; i >= 0; i--) if (/^PFD$/.test(rows[i].l)) rows.splice(i, 1);
      if (pfds.length) rows.splice(at(), 0, { l: "PFD", v: pfds.join(", "), h: pfds.map(n => dwgA(n) + (dwgTitle(n) ? ` (${esc(dwgTitle(n))})` : "")).join("<br>") });
    }
    const docs = seen.filter(x => !/-P[FI]D-/.test(x[0]));
    if (docs.length){ const i = at(); rows.splice(i < rows.length ? i + 1 : i, 0, { l: docs.every(x => /-DCR-/.test(x[0])) ? "PDC" : "Documents", v: docs.map(x => x[0]).join(", "),
      h: docs.map(x => dwgA(x[0], x[1]) + ` (${esc(dwgTitle(x[0]).toLowerCase().replace(/^./, c => c.toUpperCase()))}, page ${x[1]})`).join("<br>") }); }
  }
  // a PFD sheet's WBS area: the area code most of its equipment starts with (read on the sheet, doc-tags.json, or the
  // equipment list's PFD column)
  let PFDA = null;
  L.pfdArea = n => { if (!PFDA){ if (!DT) return ""; PFDA = {}; const c = {};
      Object.entries(DT).forEach(([tag, a]) => { const m = /^F\d\d/.exec(tag); if (!m) return; a.forEach(([d]) => { if (!/-PFD-/.test(d)) return; const x = c[d] = c[d] || {}; x[m[0]] = (x[m[0]] || 0) + 1; }); });
      items.forEach(it => { if (it.t !== "mel") return; const m = /^F\d\d/.exec(it.key); if (!m) return;   // and the sheet the equipment list names
        (String(L.get(it, "PFD")).match(/2000-[A-Z0-9]{3,6}-PFD-[A-Z]{2}-\d{4,5}/g) || []).forEach(d => { const x = c[d] = c[d] || {}; x[m[0]] = (x[m[0]] || 0) + 1; }); });
      Object.entries(c).forEach(([d, x]) => PFDA[d] = Object.keys(x).sort((p, q) => x[q] - x[p] || p.localeCompare(q))[0]); }
    return PFDA[n] || ""; };
  // the drawings to preview for an item: its P&IDs (every number named in its row), else for equipment its PFD sheets
  const DRE = /2000-[A-Z0-9]{3,6}-P[FI]D-[A-Z]{2}-\d{4,5}/g;
  L.drawingsOf = it => { if (!it) return [];
    if (it.t === "pid") return window.Pid && Pid.has(it.key) ? [it.key] : [];
    const has = n => window.Pid && Pid.has(n);
    const pids = [...new Set((it.r || []).join(" ").match(DRE) || [])].filter(n => /-PID-/.test(n) && has(n));
    if (pids.length) return pids;
    if (it.t !== "mel") return [];
    const seen = (DT && DT[it.key]) || [];
    return [...new Set([...(String(L.get(it, "PFD")).match(DRE) || []), ...seen.map(x => x[0])])].filter(n => /-PFD-/.test(n) && has(n)); };
  L.find = (k, t) => { const a = byKey.get(k) || []; return (t && a.find(x => x.t === t)) || a[0] || null; };
  // How the P&IDs join up, read from the line list: a line's From / To end names another line or an item (equipment,
  // valve, instrument…) whose own P&ID is known. When that end sits on a different drawing the line crosses between
  // the two. L.pidLinks(number) → { from: [{ n, lines }], to: [{ n, lines }], lin: [line items], lout: [line items] }
  // (from = drawings feeding this one, lin = the lines that bring it in; to / lout the same leaving it).
  let LINKS = null;
  const pidsOf = it => { if (!it.r || !DB.types[it.t]) return []; const f = DB.types[it.t].f;   // "P&ID" / "P&IDs", not "Air P&ID"
    return [...new Set(f.flatMap((n, i) => /^P&IDs?$/.test(n) && it.r[i] ? String(it.r[i]).split(/[,;\n]+/) : []).map(x => { const k = norm(x); if (k && !RAW.has(k)) RAW.set(k, x.trim()); return k; }).filter(Boolean))]; };
  const RAW = new Map();   // a drawing number as written, by its normalised key
  // a drawing title without the words every P&ID title carries
  L.pidTitle = t => String(t || "").replace(/^.*\bTI?TLE\.?\s+/i, "").replace(/[\s\-–]*(STAGE\s*\d+\s*)?(PIPING|PROCESS) AND INSTRUMENTATION DIAGRAM.*$/i, "").replace(/(\b[A-Z]) (?=[A-Z]\b)/g, "$1").trim();
  function buildLinks(){
    LINKS = new Map(); const f = DB.types.line.f, iF = f.indexOf("From"), iT = f.indexOf("To");
    const get = k => { let m = LINKS.get(k); if (!m) LINKS.set(k, m = { from: new Map(), to: new Map(), lin: new Set(), lout: new Set() }); return m; };
    const endPids = v => { for (const c of String(v || "").match(TAG_RE) || []){ for (const x of byKey.get(norm(c)) || []){ const p = pidsOf(x); if (p.length) return p; } } return []; };
    const add = (m, k, line) => { let a = m.get(k); if (!a) m.set(k, a = []); if (!a.includes(line)) a.push(line); };
    items.forEach(it => { if (it.t !== "line" || !it.r) return; const own = pidsOf(it); if (!own.length) return; const a = own[0];
      const pf = endPids(it.r[iF]), pt = endPids(it.r[iT]);
      if (pf.length && !pf.includes(a)){ const b = pf[0]; add(get(a).from, b, it); get(a).lin.add(it); add(get(b).to, a, it); get(b).lout.add(it); }
      if (pt.length && !pt.includes(a)){ const b = pt[0]; add(get(a).to, b, it); get(a).lout.add(it); add(get(b).from, a, it); get(b).lin.add(it); } });
  }
  L.pidLinks = n => { if (!DB) return null; if (!LINKS) buildLinks(); const m = LINKS.get(norm(n)) || { from: new Map(), to: new Map(), lin: new Set(), lout: new Set() };
    const nm = k => { const p = (byKey.get(k) || []).find(y => y.t === "pid"); return p ? p.key : (window.Pid && Pid.info(k) || {}).number || RAW.get(k) || k; };
    const side = s => [...s].map(([k, lines]) => ({ n: nm(k), k, lines })).sort((x, y) => y.lines.length - x.lines.length || x.n.localeCompare(y.n));
    const byTag = s => [...s].sort((x, y) => String(x.key).localeCompare(String(y.key)));
    return { from: side(m.from), to: side(m.to), lin: byTag(m.lin), lout: byTag(m.lout) }; };

  // A self contained search box: input, camera, results and item view with back history.
  L.mount = (root, opts = {}) => {
    root.classList.add("lk");
    root.innerHTML = `<form class="lk-bar" role="search" autocomplete="off" onsubmit="return false"><input class="lk-in" type="search" name="kcgm-tag-search" id="kcgm-tag-search-${Math.random().toString(36).slice(2, 7)}" inputmode="search" enterkeyhint="search" placeholder="${esc(opts.placeholder || "Any tag, line, valve or word")}" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" aria-label="Search tags, lines, valves" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other">
      <button class="lk-cam" type="button" title="Read a tag from a photo" aria-label="Read a tag from a photo"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.6"/></svg></button><input type="file" accept="image/*" capture="environment" hidden></form>
      <div class="lk-status"></div><div class="lk-body"></div>`;
    const inp = root.querySelector(".lk-in"), cam = root.querySelector(".lk-cam"), file = root.querySelector("input[type=file]"), body = root.querySelector(".lk-body"), stat = root.querySelector(".lk-status");
    const stack = []; let hits = [], showingRecent = false;
    // recent searches (items opened), shown when the empty bar gets focus
    const RK = opts.recent || "kcgm_recent_lookups";
    const recents = () => { try { return JSON.parse(localStorage.getItem(RK) || "[]"); } catch (e) { return []; } };
    const rememberQ = q => { q = q.trim(); if (q.length < 2) return; try { const r = recents().filter(x => x.q !== q && !(x.k && x.k === norm(q))); r.unshift({ q }); localStorage.setItem(RK, JSON.stringify(r.slice(0, 12))); } catch (e) {} };
    const remember = it => { try { const r = recents().filter(x => !(x.k === it.k && x.t === it.t) && x.q !== inp.value.trim()); r.unshift({ k: it.k, t: it.t, key: it.key, name: it.name });
      localStorage.setItem(RK, JSON.stringify(r.slice(0, 12))); } catch (e) {} };
    const showRecent = () => {
      if (opts.noRecent){ showingRecent = false; status(""); body.innerHTML = opts.intro || ""; return; }   // the page shows them itself (Assets: chips above the filters)
      const r = recents(); status(""); showingRecent = true;
      body.innerHTML = `<div class="lk-rh"><span>Recent searches</span>${r.length ? '<button type="button" class="lk-clr">Clear</button>' : ""}</div>` +
        (r.length ? r.map((x, i) => x.q ? `<button type="button" class="lk-hit lk-rec" data-r="${i}"><span class="lk-hb"><b>${esc(x.q)}</b><em>search</em></span></button>`
          : `<button type="button" class="lk-hit lk-rec" data-r="${i}"><span class="lk-hb"><b>${esc(x.key)}</b><span>${esc(x.name)}</span><em>${esc(DB ? typeName(x.t) : "")}</em></span></button>`).join("")
          : `<div class="lk-empty">Nothing yet. Type any part of a tag, line, valve or plain words; items you open show up here.</div>`);
      body.querySelectorAll(".lk-rec").forEach(b => b.onclick = () => { const x = r[+b.dataset.r];
        if (x.q){ inp.value = x.q; rememberQ(x.q); ensure().then(() => showList(x.q)); return; }
        ensure().then(() => { const it = L.find(x.k, x.t); if (it){ showingRecent = false; inp.value = it.key; open(it, true); } }); });
      const c = body.querySelector(".lk-clr"); if (c) c.onclick = () => { try { localStorage.removeItem(RK); } catch (e) {} showRecent(); inp.focus(); };
    };
    const hideRecent = () => { if (showingRecent){ showingRecent = false; body.innerHTML = opts.intro || ""; } };
    // taps inside the results must not count as leaving the search
    let keep = false; body.addEventListener("pointerdown", () => { keep = true; setTimeout(() => keep = false, 400); });
    inp.addEventListener("focus", () => { if (!inp.value.trim() && !cur) showRecent(); });
    inp.addEventListener("blur", () => setTimeout(() => { if (!keep && !inp.value.trim() && document.activeElement !== inp) hideRecent(); }, 150));
    const status = m => { stat.innerHTML = m || ""; };
    // filter pills: one per list with matches (with counts); the choice is kept while typing
    let only = "", shownN = 80;
    const PILL = { pfd: "PFD", mel: "Equipment", ins: "Instruments", cv: "Control valves", mv: "Manual valves", line: "Lines", spec: "Spec", pid: "Drawings", spi: "SPI", hose: "Hoses", gloss: "Glossary" };
    const showList = (q, keepN) => {
      if (opts.onList) opts.onList();
      // opts.within(q): a page can take the typing for itself (Assets: with Browse filters set, the search narrows that list)
      if (opts.within && opts.within(q)){ status(""); body.innerHTML = ""; return; }
      showingRecent = false; if (!q.trim() && document.activeElement === inp){ showRecent(); return; }
      if (q.trim().length < 2){ status(""); body.innerHTML = opts.intro || ""; return; }
      if (!keepN) shownN = 80;
      const all = L.search(q, 100000), counts = {};
      all.forEach(it => counts[it.t] = (counts[it.t] || 0) + 1);
      if (only && !counts[only]) only = "";
      const list = only ? all.filter(it => it.t === only) : all;
      hits = list.slice(0, shownN); lastList = list;
      status(all.length ? `${all.length} match${all.length > 1 ? "es" : ""}${only ? `, ${list.length} in ${PILL[only] || typeName(only)}` : ""}` : "");
      const types = TYPE_ORDER.filter(t => counts[t]);
      body.innerHTML = (types.length ? `<div class="lk-pills"><button class="lk-pill${only ? "" : " on"}" data-t="">All <i>${all.length}</i></button>${types.map(t => `<button class="lk-pill${only === t ? " on" : ""}" data-t="${t}">${ICON[t] || ""} ${esc(PILL[t] || typeName(t))} <i>${counts[t]}</i></button>`).join("")}</div>` : "") +
        L.resultsHTML(hits, q) + (list.length > hits.length ? `<button class="lk-more">Show ${Math.min(200, list.length - hits.length)} more (${list.length - hits.length} left)</button>` : "");
      body.querySelectorAll(".lk-row1").forEach(b => b.onclick = () => { ctx = lastList; open(hits[+b.dataset.i], true); });
      body.querySelectorAll(".lk-pill").forEach(b => b.onclick = () => { only = b.dataset.t; showList(inp.value); });
      const m = body.querySelector(".lk-more"); if (m) m.onclick = () => { shownN += 200; showList(inp.value, true); };
    };
    // the list an item was opened from (Browse's filtered list, search results); stepping walks it. With no list (a link,
    // a drawing, a recent) it is every item of the same kind in tag order
    let ctx = null, lastList = [];
    const ORD = new Intl.Collator(undefined, { numeric: true });
    const stepList = it => { if (ctx && ctx.includes(it)) return ctx;
      const all = items.filter(x => x.t === it.t && x.r !== undefined).sort((a, b) => ORD.compare(a.key, b.key)); ctx = all; return all; };
    const open = (it, push, how) => {
      if (!it) return; remember(it); showingRecent = false; if (it.go){ it.go(); return; } if (push) stack.push({ q: inp.value, scroll: body.scrollTop, it: cur });
      cur = it;
      // the tag to mark on a drawing: the item itself, or on a drawing's own page the item you came from
      const from = it.t === "pid" ? (stack.length && stack[stack.length - 1].it ? stack[stack.length - 1].it.key : null) : it.key;
      const hv = (d, t) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
      body.innerHTML = `<div class="lk-nav">` + (opts.noNav ? "" : `<button class="lk-home" title="Home" aria-label="Home">${hv('<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>')}</button>` +
        `<button class="lk-back" title="Back to ${stack.length && stack[stack.length - 1].it ? "previous" : "results"}" aria-label="Back">${hv('<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>')}</button>`) + `</div>` + L.itemHTML(it, Object.assign({}, opts, { find: from }));
      const slot = body.querySelector(".lk-slot"); if (slot) slot.outerHTML = stepHTML(it);   // the stepper sits in the card's gold header
      const vs = body.querySelector(".lk-vslot"); if (vs) vs.outerHTML = viewsHTML(it);   // PFD / Layout on the tag's line, right
      const nv = body.querySelector(".lk-nav"); if (nv && !nv.children.length) nv.remove();
      body.querySelectorAll("[data-dwg]").forEach(a => a.onclick = e => { e.preventDefault(); Pid.open(a.dataset.dwg, from, { page: +a.dataset.page || 1 }); });
      body.scrollTop = 0; if (root.scrollIntoView && opts.scrollTop) opts.scrollTop();
      if (!opts.noNav){ body.querySelector(".lk-back").onclick = back; body.querySelector(".lk-home").onclick = home; }
      body.querySelectorAll(".lk-st[data-s]").forEach(b => b.onclick = () => { const a = stepList(cur), i = a.indexOf(cur), x = a[i + +b.dataset.s]; if (x) open(x, false, "step"); });

      const pb = body.querySelector("[data-pfd]"); if (pb) pb.onclick = () => opts.pfd(it).go();
      L.fillSpec(body, it);
      if (opts.onOpen) opts.onOpen(it, how);
    };
    let cur = null;
    // the item on the other views: PFD and Layout as one split control at the right of the row (only the views it is on)
    const viewsHTML = it => { const v = opts.views && opts.views(it); if (!v || !(v.pfd || v.layout)) return "";
      return `<span class="lk-vw">${v.pfd ? `<a href="${esc(v.pfd)}" title="Show it on the Smart PFD">PFD<sup>smart</sup></a>` : ""}${v.layout ? `<a href="${esc(v.layout)}" title="Show it on the plant layout">Layout<sup>smart</sup></a>` : ""}</span>`; };
    // previous / next item in the list it came from: one gold block, ‹ 12 of 147 ›
    const stepHTML = it => { const a = stepList(it), i = a.indexOf(it); if (i < 0 || a.length < 2) return "";
      return `<span class="lk-step"><button class="lk-st" data-s="-1"${i > 0 ? ` title="${esc(a[i - 1].key)}"` : " disabled"} aria-label="Previous item">‹</button><span class="lk-sn"><b>${(i + 1).toLocaleString()}</b> of ${a.length.toLocaleString()}</span><button class="lk-st" data-s="1"${i < a.length - 1 ? ` title="${esc(a[i + 1].key)}"` : " disabled"} aria-label="Next item">›</button></span>`; };
    // any code link in an item (also ones filled in later, like the valve codes in a pipe spec) opens that item
    body.addEventListener("click", e => { const a = e.target.closest && e.target.closest("a[data-k]"); if (!a || !body.contains(a)) return; e.preventDefault();
      ensure().then(() => { const x = L.find(a.dataset.k, a.dataset.t); if (x){ ctx = null; open(x, true); } }); });
    // home: back to the start (the Assets page's own reset when it has one, else an empty search)
    const home = () => { stack.length = 0; cur = null; inp.value = ""; showList(""); if (opts.home) opts.home(); };
    const back = () => { const s = stack.pop(); if (s && s.it){ cur = null; open(s.it, false); } else { cur = null; showList(inp.value); if (s) body.scrollTop = s.scroll; } };
    let tmr; inp.addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(() => { stack.length = 0; cur = null; ensure().then(() => showList(inp.value)); }, 120); });
    inp.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); clearTimeout(tmr); stack.length = 0; rememberQ(inp.value); ensure().then(() => { showList(inp.value); if (hits.length && (hits[0].k === norm(inp.value) || hits.length === 1)) open(hits[0], true); }); inp.blur(); } });
    const ensure = () => done ? Promise.resolve() : (status("Loading plant lists…"), L.load().then(() => status("")).catch(e => { status("Couldn't load the lists (" + esc(e.message) + "). Check your connection and try again."); throw e; }));
    cam.onclick = () => file.click();
    file.onchange = () => { const f = file.files[0]; file.value = ""; if (!f) return;
      ensure().then(() => L.scan(f, m => status(m))).then(res => {
        status(""); body.innerHTML = scanHTML(res);
        body.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { inp.value = b.dataset.q; stack.length = 0; showList(inp.value); const h = L.find(norm(b.dataset.q)); if (h && hits[0] === h) open(h, true); });
        const ed = body.querySelector(".lk-ocr"); if (ed) body.querySelector(".lk-ocrgo").onclick = () => { inp.value = ed.value.trim(); showList(inp.value); };
      }).catch(e => status("Photo reading failed: " + esc(e.message || e)));
    };
    const scanHTML = res => `<div class="lk-kind">Read from photo</div>` +
      (res.found.length ? `<h4 class="lk-h">Codes found in the lists</h4>` + res.found.map(c => `<button class="lk-hit" data-q="${esc(c.q)}"><span class="lk-hb"><b>${esc(c.it.key)}</b><span>${esc(c.it.name)}</span><em>read as “${esc(c.raw)}”</em></span></button>`).join("")
        : `<div class="lk-empty">No list code recognised. Edit the text below and search, or retake the photo closer and straight on.</div>`) +
      `<h4 class="lk-h">Text read</h4><textarea class="lk-ocr" rows="4">${esc(res.text)}</textarea><button class="lk-btn lk-ocrgo">Search this text</button>`;
    inp.value = opts.initial || ""; if (opts.initial) ensure().then(() => showList(inp.value)); else body.innerHTML = opts.intro || "";
    return { input: inp, search: q => { inp.value = q; ensure().then(() => showList(q)); }, openKey: k => ensure().then(() => open(L.find(norm(k)), true)),
      openItem: (it, list, how) => { stack.length = 0; cur = null; ctx = list || null; open(it, true, how); },
      close: () => { stack.length = 0; cur = null; showList(inp.value); }, current: () => cur };
  };

  // ---------- photo text recognition ----------
  let worker = null;
  const loadScript = src => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("couldn't load the text reader (needs internet the first time)")); document.head.appendChild(s); });
  async function getWorker(progress){
    if (worker) return worker;
    if (!window.Tesseract) { progress("Downloading the text reader (about 5 MB, first time only)…"); await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"); }
    worker = await Tesseract.createWorker("eng", 1, { logger: m => { if (m.status === "recognizing text") progress(`Reading text… ${Math.round(m.progress * 100)}%`); else if (m.status) progress(m.status.replace(/^\w/, c => c.toUpperCase()) + "…"); } });
    await worker.setParameters({ tessedit_pageseg_mode: "11", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/. " });
    return worker;
  }
  function prep(file){   // downscale big phone photos, grey scale, stretch contrast
    return new Promise((ok, bad) => { const img = new Image(); img.onload = () => {
      const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      let lo = 255, hi = 0; for (let i = 0; i < p.length; i += 4){ const g = .3 * p[i] + .59 * p[i + 1] + .11 * p[i + 2]; p[i] = g; if (g < lo) lo = g; if (g > hi) hi = g; }
      const sc = 255 / Math.max(1, hi - lo); for (let i = 0; i < p.length; i += 4){ const g = (p[i] - lo) * sc; p[i] = p[i + 1] = p[i + 2] = g; }
      x.putImageData(d, 0, 0); URL.revokeObjectURL(img.src); ok(c); }; img.onerror = () => bad(new Error("couldn't open the photo")); img.src = URL.createObjectURL(file); });
  }
  L.scan = async (file, progress = () => {}) => {
    progress("Preparing photo…"); const canvas = await prep(file);
    const w = await getWorker(progress);
    const { data } = await w.recognize(canvas);
    return Object.assign({ text: data.text.trim() }, L.fromText(data.text));
  };
  // Pull list codes out of recognised text, fixing the usual OCR mix ups (O/0, I/1, S/5, B/8, Z/2)
  L.fromText = text => {
    const T = String(text || "").toUpperCase().replace(/[|]/g, "I");
    const toks = T.split(/[\s,;:]+/).filter(Boolean), cands = new Set();
    toks.forEach((t, i) => { cands.add(t); if (toks[i + 1]) cands.add(t + toks[i + 1]); if (toks[i + 2]) cands.add(t + toks[i + 1] + toks[i + 2]); });
    const fixes = s => { const out = new Set([s]);
      const dig = s.replace(/(?<=\d|-)[O]|[O](?=\d)/g, "0").replace(/(?<=\d)[IL]|[IL](?=\d{2})/g, "1").replace(/(?<=\d)S|S(?=\d{2})/g, "5").replace(/(?<=\d)B(?=\d)/g, "8").replace(/(?<=\d)Z(?=\d)/g, "2");
      out.add(dig); out.add(dig.replace(/^0/, "O")); return [...out]; };
    const found = new Map();
    cands.forEach(raw => fixes(raw).forEach(v => { const k = norm(v); if (k.length < 5) return; const a = byKey.get(k);
      if (a && !found.has(k)) found.set(k, { q: a[0].key, it: a[0], raw }); }));
    return { found: [...found.values()].slice(0, 20) };
  };

  // ---------- styles (use the host page's colours) ----------
  const css = `.lk{--lk-c:var(--card,var(--panel2));--lk-a:var(--gold,var(--accent));--lk-l:var(--line)}
.lk-bar{display:flex;gap:8px}.lk-in{flex:1;min-width:0;padding:12px 13px;border-radius:12px;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);font-size:var(--fb,15px);font-family:inherit}
@media (min-width:901px) and (hover:hover){.lk-cam{display:none !important}}   /* no camera on a desktop */
.lk-cam{display:flex;align-items:center;justify-content:center;color:var(--ink);flex:none;width:48px;border-radius:12px;border:1px solid var(--lk-l);background:var(--lk-c);font-size:21px;cursor:pointer}
.lk-status{font-size:var(--fb,15px);color:var(--mute);min-height:18px;margin:6px 2px}
.lk-hit{display:flex;gap:10px;width:100%;text-align:left;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);border-radius:12px;padding:10px 11px;margin-bottom:7px;cursor:pointer;font:inherit}
.lk-hit:hover{border-color:var(--lk-a)}
.lk-pills{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;margin-bottom:2px;scrollbar-width:none;-webkit-overflow-scrolling:touch}.lk-pills::-webkit-scrollbar{display:none}
.lk-pill{flex:none;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);border-radius:99px;padding:5px 10px;font:inherit;font-size:var(--fb,15px);font-weight:700;cursor:pointer;white-space:nowrap}
.lk-pill i{font-style:normal;font-weight:600;color:var(--mute);margin-left:2px}.lk-pill.on{background:var(--lk-a);border-color:var(--lk-a);color:#1a1307}.lk-pill.on i{color:#1a1307}
.lk-row1{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--lk-l);background:none;color:var(--ink);padding:7px 4px;cursor:pointer;font:inherit;font-size:var(--fb,15px);line-height:1.3}
.lk-row1:hover,.lk-row1:focus{background:var(--lk-c)}.lk-ic1{flex:none;font-size:13px;width:18px;text-align:center}
.lk-row1 b{flex:none;font-family:inherit;font-size:var(--fb,15px);color:var(--lk-a);max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lk-row1.txt b{font-family:inherit;font-size:var(--fb,15px);max-width:62%}.lk-row1.txt span{color:var(--mute)}
.lk-row1 span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}
.lk-more{width:100%;margin:8px 0;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);border-radius:10px;padding:8px;font:inherit;font-weight:700;cursor:pointer}.lk-ic{font-size:18px;line-height:1.2}.lk-hb{display:flex;flex-direction:column;gap:2px;min-width:0}
.lk-hb b{font-family:inherit;font-size:var(--fb,15px);color:var(--lk-a);word-break:break-all}.lk-hb span{font-size:var(--fb,15px);line-height:1.3}.lk-hb em{font-size:var(--fb,15px);color:var(--mute);font-style:normal}
.lk-rh{display:flex;justify-content:space-between;align-items:center;font-size:var(--fl,13px);font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--mute);margin:2px 2px 8px}
.lk-rh button{border:0;background:none;color:var(--lk-a);font:inherit;text-transform:none;letter-spacing:0;font-size:var(--fb,15px);cursor:pointer;padding:4px}
.lk-empty{color:var(--mute);font-size:var(--fb,15px);padding:10px 2px;line-height:1.45}
.lk-nav{display:flex;gap:8px;margin:2px 0 12px}
.lk-home,.lk-back{width:34px;height:34px;border-radius:50%;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);display:grid;place-items:center;padding:0;cursor:pointer}
.lk-nav{align-items:center}.lk-kr{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}.lk-kr .lk-key{margin:0;min-width:0}.lk-vw{margin-left:auto;display:inline-flex;border:1.5px solid var(--lk-a);border-radius:9px;overflow:hidden;background:var(--lk-c)}
.lk-vw a{display:flex;align-items:center;padding:0 11px;height:31px;color:var(--ink);text-decoration:none;font-weight:800;font-size:var(--fb,15px);white-space:nowrap}.lk-vw a+a{border-left:1.5px solid var(--lk-a)}
.lk-vw a:hover{background:color-mix(in srgb,var(--lk-a) 22%,var(--lk-c))}.lk-vw sup{font-size:.6em;font-weight:700;font-style:italic;margin-left:2px;opacity:.75}.lk-step{display:inline-flex;align-items:stretch;height:34px;border-radius:9px;overflow:hidden;background:var(--lk-a);margin-left:6px}
.lk-st{border:0;background:var(--lk-a);color:#1a1307;font:inherit;font-size:20px;font-weight:800;padding:0 11px;cursor:pointer;line-height:1}.lk-st:hover:not(:disabled){filter:brightness(1.1)}.lk-st:disabled{opacity:.4;cursor:default}
.lk-sn{display:flex;align-items:center;padding:0 8px;background:color-mix(in srgb,var(--lk-a) 55%,#fff);color:#1a1307;font-size:var(--fl,13px);white-space:nowrap}.lk-sn b{margin-right:3px}
.lk-home:hover,.lk-back:hover{border-color:var(--lk-a);color:var(--lk-a)}
.lk-kind{font-size:var(--fl,13px);font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--lk-a)}
.lk-key{font-family:inherit;font-size:var(--fh,22px);font-weight:800;margin:4px 0 2px;word-break:break-all}.lk-name{font-size:var(--fb,15px);line-height:1.35;margin-bottom:8px}
.lk-t{width:100%;border-collapse:collapse;font-size:var(--fb,15px);margin:6px 0}.lk-t td{padding:5px 4px;border-bottom:1px solid var(--lk-l);vertical-align:top;word-break:break-word}.lk-t td:first-child{color:var(--mute);width:13.5em;padding-right:10px;font-size:var(--fb,15px);word-break:normal;overflow-wrap:normal;hyphens:manual}
.lk-a{color:var(--lk-a);text-decoration:underline;cursor:pointer}.lk-row{display:block;text-decoration:none;color:var(--ink);background:var(--lk-c);border-radius:8px;padding:6px 8px;margin:4px 0;font-size:var(--fb,15px)}
.lk-row b{font-family:inherit;color:var(--lk-a);margin-right:4px}.lk-h{margin:14px 0 4px;font-size:var(--fl,13px);letter-spacing:1px;text-transform:uppercase;color:var(--mute)}
.lk-dw{border:1px solid var(--lk-l);border-radius:12px;background:var(--lk-c);padding:4px 12px;margin:0 0 4px;font-size:var(--fb,15px)}
.lk-dr{display:flex;gap:10px;padding:6px 0;line-height:1.35}.lk-dr+.lk-dr{border-top:1px solid var(--lk-l)}
.lk-dr>span{flex:none;width:3.4em;color:var(--mute);font-weight:700}.lk-dr>div{min-width:0;overflow-wrap:anywhere}.lk-dr i{font-style:normal;color:var(--mute)}
.pf-bar{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0 8px}
.pf-b{border:1px solid var(--lk-l,var(--line));background:var(--lk-c,var(--panel2));color:var(--ink);border-radius:99px;padding:4px 10px;font:inherit;font-size:var(--fb,15px);font-weight:700;cursor:pointer;white-space:nowrap}
.pf-b i{font-style:normal;color:var(--mute);font-weight:600;font-size:var(--fb,15px)}
.pf-b.on{background:var(--lk-a,var(--accent));border-color:var(--lk-a,var(--accent));color:#1a1307}.pf-b.on i{color:#3a2b0c}
.pf-sec[hidden]{display:none}
.pf .pf .pf-bar,.pf-sec>.lk-spec>.pf>.pf-bar{margin:-2px 0 8px;padding-left:10px;border-left:2px solid var(--lk-a,var(--accent))}
.pf .pf .pf-b{font-size:var(--fb,15px);padding:3px 9px;background:transparent}
.pf .pf .pf-b.on{background:color-mix(in srgb,var(--lk-a,var(--accent)) 28%,transparent);color:var(--ink);border-color:var(--lk-a,var(--accent))}
.pf .pf .pf-b.on i{color:var(--ink)}
.lk-d{border:1px solid var(--lk-l);border-radius:10px;margin:6px 0;padding:0 8px}.lk-d summary{cursor:pointer;padding:8px 0;font-weight:700;font-size:var(--fb,15px)}
.lk-ns{font-size:var(--fb,15px);color:var(--mute);margin:4px 0;line-height:1.4}.lk-src{font-size:var(--fb,15px);color:var(--mute);margin-top:12px;line-height:1.4}
.lk-btn{border:1px solid var(--lk-a);background:none;color:var(--lk-a);border-radius:10px;padding:8px 12px;font:inherit;font-weight:700;cursor:pointer;margin:6px 0}
.lk-spec .lk-btn{font-size:var(--fb,15px);padding:6px 10px;margin:6px 0 4px}
.lk-spec .sp-t{font-size:var(--fb,15px);line-height:1.4;margin:2px 0 4px}.lk-spec .lk-btn span{font-weight:500;opacity:.75;font-size:var(--fb,15px);margin-left:4px}
.lk-t td:last-child{overflow-wrap:anywhere}
.lk-t td.lk-sub{color:var(--lk-a);font-size:var(--fl,13px);font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding-top:10px;width:auto}
.sp-self .sp-head{display:none}
.sp-cl{display:flex;flex-direction:column}.sp-p{padding:6px 2px;border-bottom:1px solid var(--lk-l);font-size:var(--fb,15px);line-height:1.4;color:var(--mute)}.sp-p b{color:var(--ink);font-weight:600}
.sp-sc{overflow-x:auto;-webkit-overflow-scrolling:touch}.sp-dt td,.sp-ct td,.sp-ct th{white-space:nowrap}.sp-dt td:first-child{width:auto}
.sp-ct th{font-size:var(--fb,15px);text-align:left;color:var(--mute);padding:4px;border-bottom:1px solid var(--lk-l)}.sp-ct td:first-child{color:var(--ink);width:auto;white-space:normal;min-width:120px}
.sp-n{font-size:var(--fb,15px);line-height:1.4;margin:6px 0}.sp-n b{color:var(--lk-a);margin-right:4px}
.sp-v{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.sp-chip{border:1px solid var(--lk-a);background:none;color:var(--lk-a);border-radius:99px;padding:4px 9px;font:inherit;font-family:inherit;font-size:var(--fb,15px);font-weight:700;cursor:pointer}
.sp-chip.off{border-color:var(--lk-l);color:var(--mute);cursor:default}.sp-warn{font-size:var(--fb,15px);color:#f59e0b;margin:4px 0}
.sp-view{position:fixed;inset:0;z-index:2000;background:#2b2f36;display:flex;flex-direction:column}.sp-view[hidden]{display:none}
.sp-top{display:flex;gap:8px;align-items:center;padding:8px 10px;background:#171b21;color:#e9edf2;border-bottom:1px solid #2c343e}
.sp-tt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:var(--fb,15px)}
.sp-q{flex:0 1 230px;min-width:90px;height:32px;box-sizing:border-box;border:1px solid #3a434f;background:#0f1216;color:#e9edf2;border-radius:8px;padding:0 9px;font:inherit;font-size:var(--fb,15px)}
.sp-q:focus{outline:none;border-color:#e8b44a}
.sp-nav{display:flex;align-items:center;gap:4px}.sp-nav[hidden]{display:none}.sp-nav span{font-size:var(--fb,15px);min-width:58px;text-align:center;color:#aab4c0}
.sp-top button,.sp-dl{border:1px solid #3a434f;background:#242a33;color:#e9edf2;border-radius:8px;min-width:34px;height:32px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;font-size:13px}
.sp-body{flex:1;overflow:auto;padding:8px;-webkit-overflow-scrolling:touch}.sp-sheet{position:relative;background:#fff;margin:0 auto;box-shadow:0 2px 14px #0008;transform-origin:0 0}
.sp-bg{position:absolute;inset:0;width:100%;height:100%}.sp-hi{position:absolute}
.sp-marks{position:absolute;inset:0;pointer-events:none}.sp-marks i{position:absolute;box-sizing:content-box;margin:-4px -7px;padding:4px 7px;border:2.5px solid #ff2d55;background:rgba(255,214,10,.35);border-radius:4px;
  box-shadow:0 0 0 3px rgba(255,45,85,.25)}.sp-marks i.on{animation:spPulse 1.1s ease-out 4}
@keyframes spPulse{0%{box-shadow:0 0 0 0 rgba(255,45,85,.7)}100%{box-shadow:0 0 0 22px rgba(255,45,85,0)}}
.sp-body.drag{cursor:grabbing}.sp-fn{min-width:0 !important;padding:0 4px;white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis}
.sp-toast{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);background:#171b21;color:#e9edf2;border:1px solid #e8b44a;border-radius:10px;padding:8px 12px;font-size:var(--fb,15px);max-width:90vw}.sp-toast[hidden]{display:none}
.sp-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#ddd;font-size:var(--fb,15px)}.sp-msg[hidden]{display:none}
body.sp-on{overflow:hidden}
.sp-top button{font-size:18px;line-height:1}   /* the symbols 40% larger, the buttons the same size */
.sp-top button[hidden]{display:none}.sp-refs{position:absolute;inset:0;pointer-events:none}
.sp-ref{position:absolute;pointer-events:auto;cursor:pointer;background:rgba(232,180,74,.13);border-radius:2px;box-shadow:inset 0 0 0 1px rgba(214,158,46,.35)}
.sp-ref.d{background:rgba(232,180,74,.24);box-shadow:inset 0 0 0 1px rgba(214,158,46,.7)}
.sp-ref::after{content:"";position:absolute;inset:-5px}.sp-ref:hover,.sp-ref.hit{background:rgba(232,180,74,.45)}
.sp-pick{position:absolute;z-index:5;display:flex;flex-direction:column;gap:4px;padding:6px;background:#1d222a;border:1px solid #3a434f;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.4);max-height:50vh;overflow:auto}
.sp-pick button{border:1px solid #3a434f;background:#242a33;color:#e9edf2;border-radius:8px;padding:7px 12px;font:inherit;font-size:var(--fb,15px);font-weight:700;cursor:pointer;text-align:left}
.sp-pick button:hover{border-color:#e8b44a}
@media (min-width:901px) and (hover:hover){.sp-rot{display:none !important}}
@media (max-width:600px){.sp-dl,.sp-view [data-a=fit]{display:none}.sp-top{flex-wrap:wrap;gap:5px;padding:6px 8px}.sp-tt{flex-basis:100%;font-size:var(--fb,15px);order:-1}.sp-top button{min-width:30px;height:30px;padding:0 6px}.sp-nav span{min-width:0}.sp-x{margin-left:auto}}
/* phone: the sheet fills the screen; close and back float top left, the title beside them, and one floating bar at the
   bottom holds the sheets, zoom, find and turn (find opens a box just above it) */
.sp-fb{display:none !important}
:root.phone .sp-view .sp-top{position:absolute;top:auto;left:0;right:0;margin:0 auto;width:max-content;max-width:calc(100vw - 16px);bottom:calc(14px + env(safe-area-inset-bottom));
  flex-wrap:nowrap;gap:2px;padding:4px;border:1px solid #3a434f;border-radius:26px;background:#171b21f0;box-shadow:0 4px 16px #0008;z-index:3}
:root.phone .sp-view .sp-top button{min-width:40px;height:40px;border:0;background:none;border-radius:20px;font-size:21px;padding:0 6px}
:root.phone .sp-view .sp-top .sp-nav{gap:0}:root.phone .sp-view .sp-top .sp-nav+.sp-nav,:root.phone .sp-view .sp-top .sp-fb{border-left:1px solid #3a434f}
:root.phone .sp-view .sp-x,:root.phone .sp-view .sp-back{position:fixed;top:calc(10px + env(safe-area-inset-top));left:10px;width:42px;height:42px!important;border-radius:50%!important;
  background:#171b21f0!important;border:1px solid #3a434f!important;box-shadow:0 2px 10px #0008;margin:0!important;z-index:4}
:root.phone .sp-view .sp-back{left:60px}
:root.phone .sp-view .sp-tt{position:fixed;top:calc(15px + env(safe-area-inset-top));left:62px;max-width:calc(100vw - 74px);flex:none;order:0;font-size:var(--fl,13px);color:#e9edf2;background:#171b21e0;border:1px solid #3a434f;border-radius:16px;padding:6px 12px;pointer-events:none;z-index:4}
:root.phone .sp-view .sp-back:not([hidden])~.sp-tt{max-width:calc(100vw - 124px)}
:root.phone .sp-view .sp-back:not([hidden])~.sp-tt{left:112px}
:root.phone .sp-view .sp-fb{display:inline-flex!important}:root.phone .sp-view .sp-dl{display:none}:root.phone .sp-view [data-a=fit]{display:inline-flex}
:root.phone .sp-view .sp-q{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));width:auto;max-width:none;height:42px;display:none;z-index:4;font-size:16px;box-shadow:0 4px 16px #0008}
:root.phone .sp-view.find-on .sp-q{display:block}
:root.phone .sp-view .sp-pg{font-size:var(--fl,13px)}
:root.phone .sp-view .sp-body{padding:0}
.lk-dwg{display:inline-block;color:#2f7cf6 !important;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.lk-dwg:hover{color:#5b9bff !important}
.lk-dwgnote{font-size:var(--fb,15px);color:var(--mute);margin:-4px 0 8px;line-height:1.4}
.lk-dwgb{color:#2f7cf6;text-decoration:none;white-space:nowrap;font-size:var(--fb,15px);font-weight:700;margin-left:4px;cursor:pointer}
.lk-d summary{list-style:none}.lk-d summary::-webkit-details-marker{display:none}.lk-d summary::before{content:"▸";display:inline-block;width:14px;color:var(--lk-a);transition:transform .15s}
.lk-d[open]>summary::before{transform:rotate(90deg)}.sp-c{font-weight:600;color:var(--mute);font-size:var(--fb,15px);margin-left:4px}
.sp-head{margin:14px 0 2px;font-size:var(--fb,15px);line-height:1.35}.sp-head b{color:var(--lk-a)}.sp-sub{font-size:var(--fb,15px);color:var(--mute);margin-bottom:2px}
.lk-head{background:var(--lk-c);border:1px solid var(--lk-l);border-radius:14px;margin-bottom:10px;overflow:hidden}
.lk-hs{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:34px;padding:5px 6px 5px 14px;background:color-mix(in srgb,var(--lk-a) 28%,var(--lk-c))}
.lk-hs .lk-kind{color:color-mix(in srgb,var(--lk-a) 70%,var(--ink))}.lk-hb{padding:8px 14px 12px}.lk-hb .lk-key{margin-top:0}
.lk-head .lk-step{margin-left:0;height:30px}
:root.phone .lk-head .lk-name{margin:0}.lk-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
.lk-figs b{display:block;font-size:var(--fb,15px);font-weight:800;overflow-wrap:anywhere}.lk-figs span{display:block;font-size:var(--fl,13px);color:var(--mute)}
.lk-ocr{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);font-family:inherit;font-size:var(--fb,15px);padding:8px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  window.Lookup = L;
})();
