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
  const TAG_RE = /\b(2000-[A-Z0-9]{3,6}-[A-Z]{3}-[A-Z]{2}-\d{4,5}|\d{2}-\d{4}-[A-Z0-9]{1,6}-[A-Z0-9]{2,6}-\d{2,4}(?:-[A-Z]{1,3})?|F\d{2,3}[A-Z]{2,4}\d{2,4}[A-Z]{0,4}(?:-[A-Z]{1,4}\d{0,2})?-[A-Z]{1,3}\d{1,2}(?:-[A-Z]{1,2})?|F\d{2,3}[A-Z]{2,4}\d{3,4}[A-Z]?-[A-Z]{2,4}\d{0,2}|F\d{2,3}-[A-Z]{1,4}-\d{2,4}[A-Z]?|F\d{2}-\d{5}|SP-[A-Z]{2}-\d{3}|[A-Z]{1,5} ?\d{5}[A-Z]?)\b/g;
  const TYPE_ORDER = ["pfd", "mel", "elec", "cable", "ins", "cv", "mv", "line", "spec", "spi", "hose", "ctl", "gloss", "pid", "otag"];
  const ICON = {};   // no pictures: each list is named in words (the type line, the pills)

  L.addExtra = list => { extras = extras.concat(list); if (DB) indexExtras(list); };
  function indexExtras(list){ list.forEach(x => { x.k = norm(x.key); x.txt = (x.key + " " + x.name + " " + (x.words || "")).toLowerCase(); items.push(x); addKey(x.k, x); }); }
  function addKey(k, it){ if (!k) return; const a = byKey.get(k); if (a) a.push(it); else byKey.set(k, [it]); }

  let dtLoad = null, sideLoad = null, DOCN = new Set();   // the lists held in the app (Sources), by number
  fetch("issues.json").then(r => r.ok ? r.json() : {}).then(d => { Object.values((d.meta && d.meta.docs) || {}).forEach(x => x.number && DOCN.add(norm(x.number))); }).catch(() => {});
  // (the sheet tags and the IOMs are waited for with the search data: a page opened before they arrived had no pills or IOM row)
  L.load = () => loading || (sideLoad = Promise.all([fetch("sld-tags.json").then(r => r.ok ? r.json() : null).catch(() => null).then(d => { SLDT = d; SCMBY = null; OTBY = null; }), fetch("iom.json").then(r => r.ok ? r.json() : null).catch(() => null).then(d => { IOM = d; }), fetch("pct/idx.json").then(r => r.ok ? r.json() : null).catch(() => null).then(d => { PCTI = d; }), fetch("contents.json").then(r => r.ok ? r.json() : null).catch(() => null).then(d => { CT = d && d.d; CTBY = null; OTBY = null; })]), dtLoad = fetch("doc-tags.json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(d => { DT = d; }), loading = fetch("search-data.json").then(r => { if (!r.ok) throw new Error("search data " + r.status); return r.json(); }).then(d => sideLoad.then(() => d)).then(d => { DB = d; build(); otagExtras();
    if (window.Spec) Spec.load().then(() => L.addExtra(Spec.extras())).catch(() => {});   // piping classes and valve datasheets become searchable
    // drawings in the app (small index, waited for so a drawing number in a record links to the drawing straight away);
    // drawings no list refers to (e.g. PFD sheets) become search results of their own
    return (window.Pid ? Pid.load().then(() => Pid.all().forEach(d => { const k = norm(d.number); if (byKey.has(k)) return;
      const it = { t: "pid", key: d.number, k, name: Pid.kind(d.number) + " drawing" + (d.title ? ": " + d.title : ""), r: null, p: dwgProj(k) }; items.push(it); addKey(k, it); })).catch(() => {}) : Promise.resolve()).then(() => dtLoad).then(() => window.SP ? SP.load() : null).then(() => { done = true; return L; }); }));
  L.ready = () => !!DB;
  // Projects: Main plant and the tailings storage facility (TSF). Each list item and P&ID belongs to one (search-data.json:
  // the "Project" field, and tsf_dwg for the drawings; tools/build_tsf.py); the picker shows either or both (kept between
  // visits). Items without a project (PFD streams, glossary, pipe spec) always show.
  let TSFD = new Set(), PJ = { main: true, tsf: true }; const pjFns = [];
  // (one project now, KCGM: plant and TSF always show together; a choice kept from the old picker is cleared. Items keep
  // their p, which the layout uses to leave the TSF out)
  try { localStorage.removeItem("kcgm_proj"); } catch (e) {}
  const dwgProj = k => TSFD.has(k) ? "tsf" : "main";
  L.proj = () => ({ ...PJ });
  L.both = () => PJ.main && PJ.tsf;
  L.inProj = it => !it.p || PJ[it.p];
  L.setProj = v => { if (!v.main && !v.tsf) return; PJ = { main: !!v.main, tsf: !!v.tsf }; try { localStorage.setItem("kcgm_proj", JSON.stringify(PJ)); } catch (e) {} pjFns.forEach(f => f()); try { dispatchEvent(new Event("kcgm-proj")); } catch (e) {} };
  L.onProj = f => pjFns.push(f);
  L.projCount = p => items.filter(it => it.p === p).length;
  // the small green TSF tag after a code, while both projects show
  L.tsfTag = () => "";   // (no TSF tag: one project)
  function build(){
    TSFD = new Set((DB.tsf_dwg || []).map(norm));
    Object.entries(DB.data).forEach(([t, rows]) => { const pj = DB.types[t].f.indexOf("Project");
      const hid = DB.types[t].hidden;
      rows.forEach(r => { const it = { t, r, key: r[0], k: norm(r[0]), name: nameOf(t, r), p: r[pj] === "TSF" ? "tsf" : "main" }; if (pj > 0) r.splice(pj, 1); if (!hid) items.push(it); addKey(it.k, it); });
      if (pj > 0) DB.types[t].f.splice(pj, 1); });   // (the Project field read, then dropped: no Project row or column)
    // cross references: any field that mentions a known code (or a P&ID) links back to this item
    const pids = new Map();
    items.forEach(it => { if (!it.r) return;
      it.r.forEach((v, i) => { if (!v || i === 0) return; String(v).replace(TAG_RE, m => {
        const k = norm(m); if (k === it.k) return m;
        if (/^2000/.test(m) && /PID/.test(m)) { if (!pids.has(k)) pids.set(k, m); }
        else if (!byKey.has(k)) return m;
        let a = refs.get(k); if (!a) refs.set(k, a = []); if (a[a.length - 1] !== it) a.push(it); return m; }); }); });
    pids.forEach((m, k) => { const it = { t: "pid", key: m, k, name: "P&ID drawing: everything shown on it", r: null, p: dwgProj(k) }; items.push(it); addKey(k, it); });
    // one tag in two lists is one asset (XV12551 in the instrument list and the control valve list; a hose special in the
    // SPI list and the hose list): the second list's entry opens the first's page and leaves the search results, and the
    // asset is counted and filtered under both lists ("also")
    items.forEach(it => { const p = PAIR[it.t] && (byKey.get(it.k) || []).find(x => x.t === PAIR[it.t]); if (p){ it.dupOf = p; (p.also = p.also || []).includes(it.t) || p.also.push(it.t); } });
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
    if (t === "elec" || t === "elx") return g("Equipment name") || g("Type") || g("Description");
    if (t === "cable") return [g("From") && "from " + g("From"), g("To") && "to " + g("To")].filter(Boolean).join(" ");
    return r[1] || "";
  }
  const PAIR = { cv: "ins", hose: "spi" };   // (a second list's entry: the list whose entry is the asset)
  L.kindOf = it => [it.t, ...(it.also || [])].map(t => typeName(t)).join(" · ");
  L.isType = (it, t) => it.t === t || !!(it.also && it.also.includes(t));
  const typeName = t => t === "pfd" ? "On the PFD" : t === "gloss" ? "Glossary" : t === "pid" ? "Drawing" : t === "spec" ? "Pipe & valve spec" : t === "otag" ? "Read on drawings" : DB.types[t].n;
  const textOf = it => it.txt || (it.txt = (it.r ? it.r.join(" ") : it.key + " " + it.name).toLowerCase());

  L.search = (q, limit = 60) => {
    if (!DB) return [];
    const nq = norm(q); if (nq.length < 2) return [];
    const words = String(q).toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const out = [];
    for (const it of items){
      if (it.p && !PJ[it.p]) continue;
      if (it.dupOf) continue;   // (one result per asset: the second list's entry is on the first's page)
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
  // a document the app doesn't hold opens SharePoint (sp.js); a list held in the app opens in Sources
  // ⓘ beside a document link: a tap shows the document's title and revision in a small callout under it (so the right
  // one of several, say ten IOMs on one pump, is picked before anything opens). Titles: the drawing index, the IOM list,
  // the documents held in Sources, else the project register (sp-titles.json, loaded on the first tap)
  const DI = n => `<button type="button" class="lk-di" data-n="${esc(n)}" aria-label="Title of ${esc(n)}" title="Title">i</button>`;
  let SPT = null, DOCT = null;
  const docInfo = async n => {
    if (window.Pid && Pid.has(n)){ const d = Pid.info(n) || {}; return { t: d.title || "", r: d.rev || "" }; }
    if (IOM && IOM.d[n]) return { t: IOM.d[n][0], r: IOM.d[n][1] };
    if (!DOCT) DOCT = fetch("issues.json").then(r => r.json()).then(d => { const m = new Map(); Object.values((d.meta && d.meta.docs) || {}).forEach(x => x.number && m.set(norm(x.number), { t: x.full || x.title, r: x.rev })); return m; }).catch(() => new Map());
    const h = (await DOCT).get(norm(n)); if (h) return h;
    if (!SPT) SPT = fetch("sp-titles.json").then(r => r.json()).then(d => new Map(Object.entries(d).map(([k, v]) => [norm(k), { t: v[0], r: v[1] }]))).catch(() => new Map());
    return (await SPT).get(norm(n)) || { t: "", r: "" }; };
  let popEl = null;
  const popClose = () => { if (popEl){ popEl.remove(); popEl = null; } };
  document.addEventListener("click", async e => { const b = e.target.closest && e.target.closest(".lk-di");
    if (!b){ if (popEl && !e.target.closest(".lk-dip")) popClose(); return; }
    e.preventDefault(); e.stopPropagation(); const n = b.dataset.n; if (popEl && popEl.dataset.n === n){ popClose(); return; } popClose();
    const el = popEl = document.createElement("div"); el.className = "lk-dip"; el.dataset.n = n; el.innerHTML = `<b>${esc(n)}</b><span>Loading…</span>`; document.body.appendChild(el);
    const place = () => { const r = b.getBoundingClientRect(), w = el.offsetWidth, vw = document.documentElement.clientWidth;
      el.style.left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2)) + scrollX + "px"; el.style.top = r.bottom + 6 + scrollY + "px";
      el.style.setProperty("--ax", Math.round(r.left + r.width / 2 - (parseFloat(el.style.left) - scrollX)) + "px"); };
    place(); const d = await docInfo(n); if (popEl !== el) return;
    el.innerHTML = `<b>${esc(n)}${d.r ? ` <i>Rev ${esc(d.r)}</i>` : ""}</b><span>${d.t ? esc(d.t) : "No title on record."}</span>`; place(); }, true);
  addEventListener("resize", popClose);   // (it scrolls with the page)
  let LINKRE = null;
  const linkify = v => esc(v).replace(LINKRE || (LINKRE = new RegExp(TAG_RE.source + (window.SP ? "|" + SP.DOC.source : ""), "g")), m => { const k = norm(m);
    if (/-(PID|PFD|SLD|TLD|SCM|BLK)-/.test(m) && window.Pid && Pid.has(m)) return `<a class="lk-a" data-dwg="${m}" href="#" title="Open the drawing">${esc(Pid.label(m))}</a>` + DI(m);
    if (byKey.has(k)) return `<a class="lk-a" data-k="${k}">${m}</a>`;
    if (window.SP && SP.url(m)) return SP.a(m) + DI(m);
    if (/^2000-/.test(m) && DOCN.has(k)) return `<a class="lk-a lk-doc" href="issues.html#sources" title="Open in Sources">${m}</a>` + DI(m);
    return m; });
  L.resultsHTML = (hits, q) => {
    if (!hits.length) return `<div class="lk-empty">No match for “${esc(q)}”. Try fewer characters, e.g. the number only.</div>`;
    // one line per result: icon, code, description (the pill shows the list it comes from)
    const codey = k => !/\s\S+\s/.test(k) || k.length < 16;   // a tag or number, not a sentence (PFD stream names)
    return hits.map((it, i) => `<button class="lk-row1 lk-1l${codey(it.key) ? "" : " txt"}" data-i="${i}" title="${esc(L.kindOf(it))}">${L.row1(it.key, L.listName(it), L.tsfTag(it))}</button>`).join("");
  };
  const PILLN = { otag: "Read on drawings", ctl: "Control tags", mel: "Equipment", elec: "Electrical equipment", cable: "Cables", ins: "Instruments", cv: "Control valves", mv: "Manual valves", line: "Lines", spi: "Specials", hose: "Hoses", pid: "Drawings", spec: "Spec", pfd: "PFD", gloss: "Glossary" };
  const KEYF = {
    mel: ["Equipment name", "Size / description", "Installed power (kW)", "Status", "Stage", "P&ID"],
    ins: ["Description", "Instrument type", "Equipment number", "Range / units", "Loop number", "P&ID"],
    cv: ["Location", "Valve type", "Valve code", "Valve size (mm)", "Line number", "Fail position", "P&ID"],
    line: ["Service description", "Size (DN)", "Pipe spec", "From", "To", "P&ID"],
    mv: ["Valve type", "Spec", "Size (DN)", "Line number", "Model", "P&ID"],
    spi: ["Description", "Size (DN)", "Pipe spec", "Make / model", "P&IDs"],
    hose: ["Description", "Size (DN)", "Length (m)", "Service", "Stage"],
    elec: ["Equipment name", "Type", "Belongs to", "Fed from", "Rating (kW)", "Voltage", "Description"],
    cable: ["From", "From name", "To", "To name", "Cable", "Length (m)", "Equipment"] };
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
  // ---------- one line rows ----------
  // ID then description on one row (row class .lk-1l, inner HTML from L.row1): the ID bold, full size, never cut; the
  // description grey, no brackets, shrinking to fit (phone: words shortened first, L.abbr), down to 11px, then cut with …
  // (full text in its tooltip). mid: e.g. the TSF tag; end: a badge kept at the right (the description shrinks first)
  L.row1 = (id, desc, mid = "", end = "") => `<b>${esc(id)}</b>${mid}<span class="d1" title="${esc(desc)}">${esc(desc)}</span>${end}`;
  L.line1 = x => `<a class="lk-a lk-row lk-1l" data-k="${x.k}" data-t="${x.t}">${L.row1(x.key, L.lineText(x))}</a>`;
  const AB = [["primary","Pri"],["secondary","Sec"],["tertiary","Tert"],["conveyor","Conv"],["flotation","Flot"],["concentrate","Conc"],["tailings","Tails"],
    ["thickener","Thkr"],["discharge","Disch"],["transmitter","Tx"],["indicator","Ind"],["indicating","Ind"],["pressure","Press"],["temperature","Temp"],["level","Lvl"],
    ["valve","Vlv"],["control","Ctrl"],["cyclone","Cyc"],["cyclones","Cycs"],["water","Wtr"],["process","Proc"],["distribution","Dist"],["hopper","Hppr"],["feeder","Fdr"],
    ["overflow","O/F"],["underflow","U/F"],["recovery","Rec"],["regrind","Regr"],["sampler","Smplr"],["sample","Smpl"],["agitator","Agit"],["compressor","Comp"],
    ["electrical","Elec"],["instrument","Inst"],["isolation","Iso"],["solenoid","Sol"],["switch","Sw"],["position","Pos"],["differential","Diff"],["density","Dens"],
    ["analyser","Anlsr"],["analyzer","Anlsr"],["emergency","Emerg"],["maintenance","Maint"],["launder","Ldr"],["reagent","Rgt"],["cyanide","CN"],["electrowinning","EW"],
    ["transfer","Trans"],["storage","Stor"],["motor","Mtr"],["crusher","Crshr"],["gyratory","Gyr"],["bearing","Brg"],["lubrication","Lube"],["hydraulic","Hyd"],
    ["station","Stn"],["assembly","Assy"],["stockpile","Stkpl"],["reclaim","Recl"],["scavenger","Scav"],["cleaner","Clnr"],["rougher","Rghr"],["vibrating","Vib"],
    ["vibration","Vib"],["north","N"],["south","S"],["east","E"],["west","W"],["number","No."],["and","&"],["with","w/"],["building","Bldg"],["platform","Pltfm"],
    ["compartment","Cpt"],["circuit","Ccts"],["dewatering","Dewat"],["filtration","Filt"],["transport","Trans"],["measurement","Meas"],["pneumatic","Pneu"],
    ["automatic","Auto"],["manual","Man"],["intermediate","Int"],["classification","Class"],["grinding","Grind"],["leaching","Leach"],["adsorption","Ads"],
    ["regeneration","Regen"],["elution","Elut"],["acid","Acid"],["caustic","Caus"],["collector","Coll"],["frother","Froth"],["flocculant","Floc"],["lime","Lime"],
    ["oxygen","O₂"],["nitrogen","N₂"],["air","Air"],["return","Rtn"],["supply","Sup"],["header","Hdr"],["drain","Drn"],["bypass","Byp"],["isolating","Iso"]];
  const ABM = new Map(AB);
  L.abbr = t => String(t).replace(/[A-Za-z]+/g, w => { const a = ABM.get(w.toLowerCase()); return a && a !== w ? a : w; });
  // one rAF batched pass over the rows on screen (hidden ones measure 0 and wait): reads and writes kept apart so a long
  // list costs a few layouts, not one per row; a row is redone only when its width (or the text size) changed.
  // Text width scales with font size, so one measured ratio gives the size (the last fraction of a px goes to the …)
  let fitQ = 0, fitG = 0;
  const over = s => s.scrollWidth > s.clientWidth + 1;
  const fit1 = () => { fitQ = 0; const todo = [];
    document.querySelectorAll(".lk-1l").forEach(a => { const w = a.clientWidth, k = fitG + "/" + w; if (!w || a.dataset.fw === k) return; a.dataset.fw = k; const s = a.querySelector(".d1"); if (s && s.firstChild) todo.push(s); });
    if (!todo.length) return;
    todo.forEach(s => { s.style.fontSize = s.style.display = ""; if (s.dataset.ab) { s.firstChild.data = s.title; delete s.dataset.ab; } });   // (text node edits: the observer below ignores them)
    let big = todo.filter(over);
    if (PHONE() && big.length){ big.forEach(s => { const t = L.abbr(s.title); if (t !== s.title){ s.firstChild.data = t; s.dataset.ab = 1; } }); big = big.filter(over); }
    big.map(s => [s, s.clientWidth, parseFloat(getComputedStyle(s).fontSize) * (s.clientWidth - 1) / s.scrollWidth])   // (a sliver too narrow for "x…" is left out)
      .forEach(([s, w, f]) => { if (w < 24) s.style.display = "none"; else s.style.fontSize = Math.max(11, Math.floor(f * 4) / 4) + "px"; }); };
  const fitSoon = L.fitRows = () => { if (!fitQ) fitQ = requestAnimationFrame(fit1); };
  new MutationObserver(fitSoon).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  addEventListener("resize", () => { fitG++; fitSoon(); });   // (the text size setting fires resize too)
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest(".pf-b"); if (!b) return; const pf = b.closest(".pf"); pfLast[pf.dataset.g] = b.dataset.p;
    [...pf.children].forEach(c => { if (c.classList.contains("pf-bar")) c.querySelectorAll(".pf-b").forEach(x => x.classList.toggle("on", x === b)); else if (c.classList.contains("pf-sec")) c.hidden = c.dataset.p !== b.dataset.p; }); });
  // a long list drawn only where it is looked at: every row can be scrolled to, but only the rows on screen plus about a
  // screen above and two below exist, so 24,000 results open at once and scroll smoothly (no "Show more"). The rows are
  // one line each, so one measured row height places them all; the next batch is drawn as the view nears the edge of the
  // drawn ones. box: the list's own element inside its scrolling parent sc; html(i): row i; click(i, e): a row picked.
  // The fast scroll index (tabs.js) reads sc.fsList for the whole list and jumps with go(i).
  L.vlist = (sc, box, n, html, click, keys) => {
    let h = 0, a = -1, b = -1;
    const doc = sc === document.scrollingElement, tgt = doc ? window : sc;
    box.innerHTML = `<div class="vl-in"></div>`; box.style.position = "relative"; const inn = box.firstChild;
    // (the part of the list's box that can be seen: its scrolling parent cut to the window)
    const vTop = () => doc ? 0 : Math.max(0, sc.getBoundingClientRect().top), vH = () => doc ? innerHeight : Math.min(sc.clientHeight, innerHeight);
    const draw = (a1, b1) => { a = a1; b = b1; let s = ""; for (let i = a; i < b; i++) s += html(i); inn.innerHTML = s; inn.style.transform = `translateY(${a * h}px)`; fitSoon(); };
    const paint = force => {
      if (!h){ draw(0, Math.min(n, 30)); const r = inn.firstElementChild; h = r ? r.getBoundingClientRect().height || 34 : 34; box.style.height = n * h + "px"; }
      const v = vTop() - box.getBoundingClientRect().top, scr = Math.max(8, Math.ceil(vH() / h)), f = Math.floor(v / h);
      if (!force && a >= 0 && f - scr / 2 >= a - 1 && f + scr * 1.5 <= b) return;   // (still inside the drawn rows)
      draw(Math.max(0, f - scr), Math.min(n, Math.max(f, 0) + scr * 3));
    };
    let q = 0; const on = () => { if (!q) q = requestAnimationFrame(() => { q = 0; if (box.isConnected) paint(); else tgt.removeEventListener("scroll", on); }); };
    if (sc._vl) (doc ? window : sc).removeEventListener("scroll", sc._vl); sc._vl = on; tgt.addEventListener("scroll", on, { passive: true });
    inn.onclick = e => { const r = e.target.closest("[data-i]"); if (r) click(+r.dataset.i, e); };
    if (keys) sc.fsList = { keys, uniform: true, box, go: (i, top) => { sc.scrollTop += box.getBoundingClientRect().top + i * h - (top != null ? top : vTop()); paint(); } }; else delete sc.fsList;
    paint(true);
  };
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
  // open clashes (Checks, checks-state.js) turn the value they are about red until resolved; resolved ones go on record
  const flagRows = (rows, keys) => { if (!window.CK) return; const seen = new Set();
    keys.forEach(k => CK.open(k).forEach(f => { if (seen.has(f.id)) return; seen.add(f.id);
      const R0 = f.row, nw = R0.win || (R0.date1 && R0.date2 ? (R0.date2 > R0.date1 ? 2 : 1) : 1), keep = String(nw === 2 ? R0.v2 : R0.v1), drop = String(nw === 2 ? R0.v1 : R0.v2);
      const DW = /2000-[A-Z0-9]+-P[IF]D-[A-Z]+-\d+/, kd = (keep.match(DW) || [])[0], dd = (drop.match(DW) || [])[0];
      const isF = x => x.l === f.field || (f.field === "P&ID" && /^P&IDs?$/.test(x.l));
      // a drawing clash: the row of the drawing taken as true stays, the other's row goes (the check has both)
      if (kd && dd) for (let i = rows.length - 1; i >= 0; i--) if (isF(rows[i]) && String(rows[i].v).includes(dd) && !String(rows[i].v).includes(kd)) rows.splice(i, 1);
      const r = f.field && (rows.find(x => isF(x) && (!kd || String(x.v).includes(kd))) || rows.find(isF));
      const tag = `<div class="lk-clash">**data clash to be resolved <a href="issues.html#c=${f.id}">see Checks</a></div>`;
      if (r && !r.clash){ r.clash = 1; r.h = `<span class="lk-red">${R0.win ? esc(keep) : r.h != null ? r.h : esc(r.v)}</span>${tag}`; }
      else if (!r) rows.push({ l: f.field || R0.cat, h: `<span class="lk-red">${esc(keep)}</span>${tag}` }); }));
    keys.forEach(k => CK.done(k).forEach(d => { if (seen.has(d.id) || !d.res) return; seen.add(d.id);
      // settled by the drawings: only the drawing(s) that show it stay
      if (d.res.keep && CK.FIELD[d.row.cat] === "P&ID"){ const ks = String(d.res.keep).split(/,\s*/);
        for (let i = rows.length - 1; i >= 0; i--) if (/^P&IDs?$/.test(rows[i].l) && /PID-/.test(rows[i].v) && !ks.some(x => String(rows[i].v).includes(x))) rows.splice(i, 1); }
      const w = [d.res.by, d.res.at && String(d.res.at).slice(0, 10)].filter(Boolean).join(", ");
      rows.push({ l: "Resolved check", h: `${esc(d.row.cat)}: ${esc(d.res.note || "resolved")}${w ? `<div class="lk-rsw">${esc(w)}</div>` : ""}` }); })); };
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
    let h = `<div class="lk-head"><div class="lk-hs"><div class="lk-kind">${esc(L.kindOf(it))}</div><span class="lk-slot"></span></div><div class="lk-hb">` +
      `<div class="lk-kr">` + (dwg ? `<a class="lk-key lk-dwg" data-dwg="${esc(dwg.number)}" href="#" title="Open the drawing">${esc(it.key)}</a>` : `<div class="lk-key">${esc(it.key)}</div>`) + `<span class="lk-vslot"></span></div>` + (it.t === "pid" ? (PHONE() && dwg && dwg.title ? `<div class="lk-name">${esc(dwg.title)}</div>` : "") : it.r && !PHONE() || it.t === "spec" || it.t === "line" ? "" : `<div class="lk-name">${linkify(headName(it))}</div>`) +   // records: the table says it (no summary line; the phone's header card names it)
      `</div></div>`;
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
      const rows = [...top, ...rest].map(i => ({ l: f[i], v: it.r[i], h: linkify(it.r[i]), s: it.t }));
      // the manual valve list puts words like "Commissioning" in its line number column: that is a note, not a line
      rows.forEach(r => { if (/^line number$/i.test(r.l) && !/\d{2,3}-[A-Z]?\d{3,4}-/.test(r.v)) r.l = "Note"; });
      twins.forEach(x => { const g = DB.types[x.t].f; g.forEach((n, i) => { if (i > 0 && x.r[i]) rows.push({ l: n, v: x.r[i], h: linkify(x.r[i]), s: x.t }); }); });
      const NAMEF = { mel: "Equipment name", ins: "Description", cv: "Location", spi: "Description", hose: "Description" };   // the phone's header card names it
      const kept = L.dedupe(rows.filter(r => !inTag(it, r.l) && !(PHONE() && r.l === NAMEF[it.t])), { heads: [it.key, ...twins.map(x => x.key)] });
      docRows(it, kept);
      // the item's drawings head the Details table, P&ID first then PFD, numbers only
      const DW = /^(P&IDs?|PFD)$/, dws = kept.filter(r => DW.test(r.l)).sort((a, b) => (a.l === "PFD") - (b.l === "PFD"));
      if (dws.length){ for (let i = kept.length - 1; i >= 0; i--) if (DW.test(kept[i].l)) kept.splice(i, 1);
        kept.unshift(...dws.map(r => { const ns = [...new Set(String(r.v).match(/2000-[A-Z0-9]{2,6}-P[FI]D-[A-Z]{2}-\d{4,5}/g) || [])];
          return ns.length ? { l: r.l, v: ns.join(", "), h: ns.map(n => dwgA(n)).join("<br>") } : r; })); }
      iomRow(it, kept); drawRows(it, kept);
      flagRows(kept, [it.key, ...twins.map(x => x.key)]);
      // MEL equipment with electrical data: two bands, Mechanical (the MEL and the other lists) and Electrical
      const el = kept.filter(r => r.s === "elx");
      if (el.length && it.t === "mel"){ const me = kept.filter(r => r.s !== "elx"), ex = twins.find(x => x.t === "elx"), sv = ex ? L.get(ex, "Source") : "";
        const docs = [...new Set((sv.match(/2000-[A-Z0-9]+-LST-EL-\d+ Rev \w+/g) || []))].join(" · ");
        const band = (t, d) => `<tr class="lk-bandr"><td colspan="2"><div class="lk-band"><span>${t}</span><small>${linkify(d)}</small></div></td></tr>`;
        secs.push({ id: "det", label: "Details", html: `<table class="lk-t">${band("Mechanical", "MEL " + (DB.types.mel.doc || ""))}${L.rowsHTML(me)}${band("Electrical", docs)}${L.rowsHTML(el.filter(r => r.l !== "Source"))}</table>` }); }
      else secs.push({ id: "det", label: "Details", html: `<table class="lk-t">${L.rowsHTML(kept)}</table>` });
      // Control: the process control tables' rows for the tag (pct/, tools/build_pct.py), filled once its shard is loaded
      const ck = PCTI && [it, ...twins].map(x => x.k).find(k => PCTI.k[k]);
      if (ck){ const [a, b] = PCTI.k[ck]; secs.push({ id: "ctl", label: "Control", n: a + b, html: `<div class="lk-ctl" data-k="${esc(ck)}"><div class="lk-ns">Loading the process control tables…</div></div>` }); }
      const sp = window.Spec && [it, ...twins].find(x => Spec.wanted(x));
      if (sp) secs.push({ id: "spec", label: ["line", "spi", "hose"].includes(sp.t) ? "Pipe spec" : "Valve spec", html: `<div class="lk-spec" data-k="${sp.k}" data-t="${sp.t}"><div class="lk-ns">Loading the pipe and valve spec…</div></div>` });
    }
    if (others.length) secs.push({ id: "also", label: "Also in", n: others.length, html: others.map(x => `<a class="lk-a lk-row lk-1l" data-k="${x.k}" data-t="${x.t}">${L.row1(typeName(x.t), headName(x) || x.name)}</a>`).join("") });
    // related items: one pill per list that refers to this tag (or its twin entries)
    // (an SLD, TLD or block diagram: the lists don't name it, so its pills are the tags read on the sheet)
    // (any drawing: everything read on the sheet, contents.json; the electrical sheet tags as before when that is missing)
    const cs = it.t === "pid" && CT ? CT[it.key] : null;
    const onSheet = it.t === "pid" ? [...new Set((cs ? cs.k || [] : (SLDT && SLDT[it.key]) || []).flatMap(k => byKey.get(norm(k)) || []))].filter(x => x.t !== "pid" && x.t !== "otag") : [];
    const rf = [...new Set([...[it, ...twins].flatMap(y => refs.get(y.k) || []), ...onSheet])].filter(x => x !== it && !twins.includes(x));
    if (rf.length){
      const g = {}; rf.forEach(x => (g[x.t] = g[x.t] || []).push(x));
      TYPE_ORDER.filter(t => g[t]).forEach(t => { const a = g[t], show = a.slice(0, 60);
        secs.push({ id: "r-" + t, label: (PILLN[t] || typeName(t)), n: a.length, html: 
          show.map(L.line1).join("") +
          (a.length > show.length ? `<div class="lk-ns">and ${a.length - show.length} more; search the tag to see them all.</div>` : "") }); });
    }
    // an electrical drawing: the tags read on the sheet that no list has (a switchboard the equipment lists leave out),
    // each with the other drawings that name it
    const ot = it.t === "pid" && (cs ? cs.o : SLDT && SLDT._other && SLDT._other[it.key]);
    if (ot && ot.length){
      if (!OTBY){ OTBY = new Map(); Object.entries(CT || {}).forEach(([d, e]) => (e.o || []).forEach(k => OTBY.set(k, [...(OTBY.get(k) || []), d]))); }
      secs.push({ id: "r-other", label: "Other tags", n: ot.length, html: `<div class="lk-ns">Other tags read on this sheet. No list has them, so there is no record to open.</div>` +
        ot.map(t => { const a = (OTBY.get(t) || []).filter(d => d !== it.key && window.Pid && Pid.has(d));
          // (one row each; tapping it opens the other drawings it is on, each opening on that spot)
          return a.length ? `<details class="lk-otd"><summary><b>${esc(t)}</b><span class="lk-otn">${a.length} other drawing${a.length > 1 ? "s" : ""}</span></summary><div class="lk-otl">${a.map(d => `<a class="lk-a" data-dwg="${esc(d)}" data-find="${esc(t)}" href="#">${esc(Pid.label(d))}</a>`).join("")}</div></details>`
            : `<div class="lk-row lk-ot"><b>${esc(t)}</b><span class="lk-otn">only on this drawing</span></div>`; }).join("") });
    }
    // the other drawings and documents named on the sheet (a P&ID's joining drawings have their own pill below)
    const rr = cs && cs.r && !/-PID-/.test(it.key) ? cs.r : null;
    if (rr && rr.length){
      const one = d => `<div class="lk-row lk-ot">${window.Pid && Pid.has(d) ? dwgA(d) : window.SP && SP.url(d) ? SP.a(d) : esc(d)}</div>`;
      // an electrical drawing: sorted by where each sits on the sheet (tools/build_contents.py)
      // Continuations: the drawings the sheet carries on to (supply, feeders, the feeders' schematics, linked sheets);
      // Reference drawings: the title block's reference table, notes, standards and lists
      const rc = cs.rc, cont = rc ? [...new Set([...(rc.f || []), ...(rc.t || []), ...(rc.l || []), ...(rc.s || [])])] : [], refd = rc ? rc.x || [] : [];
      const html = rc ? L.pills([{ id: "rc-c", label: "Continuations", n: cont.length, html: cont.map(one).join("") }, { id: "rc-x", label: "Reference drawings", n: refd.length, html: refd.map(one).join("") }].filter(g => g.n), "rc") : rr.map(one).join("");
      secs.push({ id: "r-refs", label: "References", n: rr.length, html }); }
    // read on drawings, no list has it: the drawings it is on, each opening on that spot
    if (it.t === "otag") secs.push({ id: "det", label: "Drawings", n: it.dws.length, html: `<div class="lk-ns">Read on these drawings. No list has it, so there is no record to open.</div>` +
      it.dws.map(d => `<div class="lk-row lk-ot"><a class="lk-a" data-dwg="${esc(d)}" data-find="${esc(it.key)}" href="#">${esc(Pid.label(d))}</a></div>`).join("") });
    // a P&ID: the drawings it joins (P&IDs pill first) and the lines that cross, each split From / To one row below
    const pl = it.t === "pid" && /-PID-/.test(it.key) && L.pidLinks(it.key);
    if (pl){
      const lineRow = L.line1;
      const pidRow = p => { const d = window.Pid && Pid.info(p.n), r = L.row1(p.n, d && d.title ? L.pidTitle(d.title) : "", "", `<i class="lk-n1">${p.lines.length} line${p.lines.length > 1 ? "s" : ""}</i>`);
        return L.find(p.k, "pid") ? `<a class="lk-a lk-row lk-1l" data-k="${p.k}" data-t="pid">${r}</a>` : `<div class="lk-row lk-1l">${r}</div>`; };
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
  // spec section (pipe class for a line, datasheet for a valve), filled once spec/index.json is loaded
  L.fillSpec = (root, it) => { const el = root.querySelector(".lk-spec"); if (!el || !window.Spec) return;
    if (el.dataset.k) it = L.find(el.dataset.k, el.dataset.t) || it;   // the spec may come from the same tag in another list
    Spec.load().then(() => { if (!el.isConnected) return; el.innerHTML = Spec.html(it, it.r && DB.types[it.t] ? DB.types[it.t].f : []); Spec.bind(el); })
      .catch(e => { el.innerHTML = `<div class="lk-ns">Couldn't load the pipe and valve spec (${esc(e.message)}).</div>`; }); };
  // the Control section: each row the process control tables hold for the tag (its alarms in one table), the interlock,
  // permissive and condition lines under it, then the other tags whose logic names it
  let PCTI = null; const PCTS = {};
  const DESCF = /^(description|valve description|controller description|name)$/i;
  const ctlTxt = v => linkify(String(v)).replace(/\n/g, "<br>");
  const ctlHTML = (b, key) => {
    const R = b.r || [], al = R.filter(r => r.s === "Alarm"), rest = R.filter(r => r.s !== "Alarm");
    const docA = r => linkify(r.d) + " Rev " + esc(r.rev || "");
    const band = (t, sm) => `<div class="lk-band"><span>${esc(t)}</span><small>${sm}</small></div>`;
    let h = rest.map(r => {
      const f = (r.f || []).filter(([l]) => !DESCF.test(l));
      const sub = r.h && r.x && r.x.length ? `<div class="lk-ctw"><table class="lk-ct"><tr>${r.h.map(x => `<th>${esc(x)}</th>`).join("")}</tr>${r.x.map(x => `<tr>${x.map(v => `<td>${ctlTxt(v)}</td>`).join("")}</tr>`).join("")}</table></div>` : "";
      return band(r.s + (norm(r.t) !== key ? " · " + r.t : ""), docA(r)) + (f.length ? `<table class="lk-t">${f.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${ctlTxt(v)}</td></tr>`).join("")}</table>` : "") + sub; }).join("");
    if (al.length){ const C = [["Tag", r => r.t], ["State", r => g(r, "Alarm State")], ["Value", r => [g(r, "Alarm Value"), g(r, "Alarm Units")].filter(Boolean).join(" ")], ["Delay (s)", r => g(r, "On Delay (s)")], ["Priority", r => g(r, "Priority")], ["Masking", r => g(r, "Alarm masking") || g(r, "Alarm Masking Condition")], ["Operator response", r => g(r, "Operator Response")]];
      const g = (r, l) => ((r.f || []).find(x => x[0] === l) || [])[1] || "";
      const use = C.filter(([, fn]) => al.some(r => fn(r)));
      h += band("Alarms", [...new Set(al.map(docA))].join(" · ")) + `<div class="lk-ctw"><table class="lk-ct"><tr>${use.map(([t]) => `<th>${t}</th>`).join("")}</tr>${al.map(r => `<tr>${use.map(([, fn]) => `<td>${ctlTxt(fn(r))}</td>`).join("")}</tr>`).join("")}</table></div>`; }
    if (b.u && b.u.length) h += band("Named in the logic of", b.u.length + (b.u.length === 1 ? " row" : " rows")) + b.u.map(([k, t, sec, hits]) => `<div class="lk-cu"><div>${k ? `<a class="lk-a" data-k="${esc(k)}">${esc(t)}</a>` : esc(t)} <em>${esc(sec)}</em></div>${hits.map(([l, v]) => `<div class="lk-cuv">${l ? `<b>${esc(l)}</b> ` : ""}${ctlTxt(v)}</div>`).join("")}</div>`).join("");
    return h || `<div class="lk-ns">No control data.</div>`; };
  L.fillCtl = root => { const el = root.querySelector(".lk-ctl"); if (!el || !PCTI) return; const k = el.dataset.k;
    const n = [...k].reduce((a, c) => a + c.charCodeAt(0), 0) % PCTI.n;
    (PCTS[n] = PCTS[n] || fetch(`pct/${n}.json`).then(r => { if (!r.ok) throw new Error("control tables " + r.status); return r.json(); }))
      .then(d => { if (el.isConnected) el.innerHTML = ctlHTML(d[k] || {}, k); })
      .catch(e => { delete PCTS[n]; el.innerHTML = `<div class="lk-ns">Couldn't load the process control tables (${esc(e.message)}).</div>`; }); };
  // for the Browse pickers (browse.js): every item, a field by name, the list icons and names
  L.items = () => items;
  L.get = (it, n) => { if (!it.r || !DB.types[it.t]) return ""; const i = DB.types[it.t].f.indexOf(n); return i < 0 ? "" : it.r[i] || ""; };
  L.ICON = ICON; L.typeName = t => typeName(t);
  // PFD sheets and documents a tag is written on (doc-tags.json, tools/build_pid_refs.py): equipment gets a PFD row
  // just above its P&ID (the list's own PFD plus any sheet it is read on), anything in the PDC a PDC row below it.
  // Each drawing is a link that opens the sheet (at the page) with the tag marked.
  let DT = null;
  // IOM manuals (iom.json, tools/build_iom.py): every manual of the item's package, and any manual naming its tag in the
  // title; those that name the tag (or the valve code, make or model) first. A row under the drawings, SharePoint links.
  let IOM = null, SLDT = null;   // (SLDT: the tags read on each SLD / TLD / block diagram, sld-tags.json)
  // the schematics a tag is read on (sld-tags.json inverted), a row under the drawings: number and title, opens the sheet
  let SCMBY = null, OTBY = null, CT = null, CTBY = null;   // (CT: what is read on each drawing, contents.json, tools/build_contents.py)
  // every drawing the item is read on (contents.json inverted), merged into its drawing rows by kind: P&ID, PFD, SLD,
  // schematic, block diagram; numbers only, each opens the drawing
  const DKIND = [["P&ID", /-PID-/], ["PFD", /-PFD-/], ["SLD", /-SLD-/], ["TLD", /-TLD-/], ["Schematic", /-SCM-/], ["Block diagram", /-BLK-/], ["Drawing", /./]];
  const dkind = d => DKIND.find(([, re]) => re.test(d))[0];
  function ctBy(){ if (!CTBY && CT){ CTBY = new Map(); Object.entries(CT).forEach(([d, e]) => [...(e.k || []), ...(e.o || [])].forEach(k => { const n = norm(k); CTBY.set(n, [...(CTBY.get(n) || []), d]); })); } return CTBY; }
  function drawRows(it, rows){
    const by = ctBy(); if (!by) return;
    const found = [...new Set([it, ...(byKey.get(it.k) || [])].flatMap(x => by.get(x.k) || []))].filter(d => d !== it.key && window.Pid && Pid.has(d));
    if (!found.length) return;
    const DRE2 = /2000-[A-Z0-9]{2,6}-[A-Z]{3}-[A-Z]{2}-\d{4,5}/g, lab = r => r.l.replace(/s$/, "");
    DKIND.forEach(([kind]) => {
      const add = found.filter(d => dkind(d) === kind); if (!add.length) return;
      const ri = rows.findIndex(r => lab(r) === kind), had = ri >= 0 ? [...new Set(String(rows[ri].v).match(DRE2) || [])] : [];
      const all = [...had, ...add.filter(d => !had.includes(d))]; if (all.length === had.length) return;
      const row = { l: all.length > 1 ? kind + "s" : kind, v: all.join(", "), h: all.map(d => dwgA(d)).join("<br>") };
      if (ri >= 0){ rows[ri] = Object.assign({}, rows[ri], row); return; }
      let k = -1; rows.forEach((r, x) => { if (DKIND.some(([n]) => n === lab(r))) k = x; });
      rows.splice(k + 1, 0, row);
    });
  }
  // what is read on drawings that no list has (a board, a line the line list leaves out): searchable on its own; its page
  // lists the drawings it is on, each opening on that spot
  function otagExtras(){
    if (!CT) return; const m = new Map();
    Object.entries(CT).forEach(([d, e]) => (e.o || []).forEach(o => { if (!byKey.has(norm(o))) m.set(o, [...(m.get(o) || []), d]); }));
    L.addExtra([...m].map(([o, ds]) => ({ t: "otag", key: o, code: o, name: `Read on ${ds.length} drawing${ds.length > 1 ? "s" : ""}, no list has it`, words: "drawing", dws: ds })));
  }
  function iomRow(it, rows){
    if (!IOM || !/^(mel|ins|cv)$/.test(it.t)) return;
    const pk = String(L.get(it, "Package") || "").split(/[\s,/;&]+/).filter(Boolean), ns = new Set(IOM.t[it.key] || []);
    pk.forEach(p => (IOM.p[p] || IOM.p[p.replace(/[A-Z]$/, "")] || []).forEach(n => ns.add(n)));
    if (!ns.size) return;
    const words = [it.key, L.get(it, "Valve code"), L.get(it, "Make / model"), L.get(it, "Model")].map(v => String(v || "").toUpperCase().trim()).filter(v => v.length > 3);
    const score = n => (IOM.t[it.key] || []).includes(n) ? 2 : words.some(w => IOM.d[n][0].toUpperCase().includes(w)) ? 1 : 0;
    const a = [...ns].filter(n => IOM.d[n]).sort((x, y) => score(y) - score(x) || x.localeCompare(y));
    // (the number only, linked to SharePoint: the manual's title is one tap away)
    const one = n => { const u = IOM.d[n][3]; return (u ? `<a class="sp-a" href="${esc(encodeURI(decodeURI(u)))}" target="_blank" rel="noopener" title="Open in SharePoint">${esc(n)}</a>` : esc(n)) + DI(n); };
    const SHOW = 4, h = a.slice(0, SHOW).map(one).join("<br>") + (a.length > SHOW ? `<details class="lk-iomm"><summary>${a.length - SHOW} more in package ${esc(pk.join(", "))}</summary>${a.slice(SHOW).map(one).join("<br>")}</details>` : "");
    const i = rows.findIndex(r => /^(P&IDs?|PFD)$/.test(r.l)); let j = i; if (i >= 0) while (j + 1 < rows.length && /^(P&IDs?|PFD)$/.test(rows[j + 1].l)) j++;
    rows.splice(j + 1, 0, { l: a.length > 1 ? "IOMs" : "IOM", v: a.join(", "), h });
  }
  const dwgA = (n, pg) => window.Pid && Pid.has(n) ? `<a class="lk-a" data-dwg="${esc(n)}" data-page="${pg || 1}" href="#">${esc(Pid.label(n))}</a>` + DI(n) : esc(n);
  function docRows(it, rows){
    const seen = (DT && DT[it.key]) || [];
    const at = () => { const i = rows.findIndex(r => /^P&IDs?$/.test(r.l)); return i < 0 ? rows.length : i; };
    if (it.t === "mel"){
      const own = String(L.get(it, "PFD")).match(/2000-[A-Z0-9]{3,6}-PFD-[A-Z]{2}-\d{4,5}/g) || [];
      const pfds = [...new Set([...own, ...seen.filter(x => /-PFD-/.test(x[0])).map(x => x[0])])];
      for (let i = rows.length - 1; i >= 0; i--) if (/^PFD$/.test(rows[i].l)) rows.splice(i, 1);
      if (pfds.length) rows.splice(at(), 0, { l: "PFD", v: pfds.join(", "), h: pfds.map(n => dwgA(n)).join("<br>") });
    }
    const docs = seen.filter(x => !/-P[FI]D-/.test(x[0]));
    if (docs.length){ const i = at(); rows.splice(i < rows.length ? i + 1 : i, 0, { l: docs.every(x => /-DCR-/.test(x[0])) ? "PDC" : "Documents", v: docs.map(x => x[0]).join(", "),
      h: docs.map(x => dwgA(x[0], x[1]) + ` (page ${x[1]})`).join("<br>") }); }
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
    const pr = window.Pid && Pid.printedOn ? Pid.printedOn(it.key) : []; if (pr.length) return pr;   // (the P&IDs its label is printed on)
    // electrical items: the SLDs named in their row, else the SLDs their tag (or a cable's ends) is printed on
    const SRE = /2000-[A-Z0-9]{3,6}-[ST]LD-EL-\d{4,5}/g, sl = [...new Set((it.r || []).join(" ").match(SRE) || [])].filter(has);
    if (sl.length) return sl;
    if (/^(elec|cable|mel)$/.test(it.t) && window.Pid && Pid.printedOn){ const ks = it.t === "cable" ? [L.get(it, "To"), L.get(it, "From")] : [it.key];
      for (const k of ks){ const p = k ? Pid.printedOn(k, /-[ST]LD-/) : []; if (p.length) return p.slice(0, 3); } }
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
    // recent searches: only text that was searched (Enter, or a result opened from it), never the items opened
    const recents = () => { try { return JSON.parse(localStorage.getItem(RK) || "[]").filter(x => x && x.q); } catch (e) { return []; } };
    const rememberQ = q => { q = q.trim(); if (q.length < 2) return; try { const r = recents().filter(x => x.q !== q && !(x.k && x.k === norm(q))); r.unshift({ q }); localStorage.setItem(RK, JSON.stringify(r.slice(0, 12))); } catch (e) {} };
    const remember = () => rememberQ(inp.value);   // (opening a result keeps the text it was found with)
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
    const PILL = { ctl: "Control tags", pfd: "PFD", mel: "Equipment", ins: "Instruments", cv: "Control valves", mv: "Manual valves", line: "Lines", spec: "Spec", pid: "Drawings", spi: "SPI", hose: "Hoses", gloss: "Glossary" };
    const showList = (q, keepN) => {
      if (opts.onList) opts.onList();
      // opts.within(q): a page can take the typing for itself (Assets: with Browse filters set, the search narrows that list)
      if (opts.within && opts.within(q)){ status(""); body.innerHTML = ""; return; }
      showingRecent = false; if (!q.trim() && document.activeElement === inp){ showRecent(); return; }
      if (q.trim().length < 2){ status(""); body.innerHTML = opts.intro || ""; return; }
      if (!keepN) shownN = 80;
      const all = L.search(q, 100000), counts = {};
      all.forEach(it => [it.t, ...(it.also || [])].forEach(t => counts[t] = (counts[t] || 0) + 1));
      if (only && !counts[only]) only = "";
      const list = only ? all.filter(it => L.isType(it, only)) : all;
      hits = list; lastList = list;
      status(all.length ? `Results <b>${(only ? list.length : all.length).toLocaleString()}</b>` : "");
      const types = TYPE_ORDER.filter(t => counts[t]);
      // desktop: as the Assets front page, the asset types down the left (a band over each column) and the results on the right
      if (!PHONE() && types.length){ status("");
        body.innerHTML = `<div class="lk-sr"><div class="lk-fc"><div class="bw-band">Asset type</div><div class="lk-fo"><button class="bw-o lk-pill${only ? "" : " on"}" data-t=""><em>All</em> <span>(${all.length.toLocaleString()})</span></button>${types.map(t => `<button class="bw-o lk-pill${only === t ? " on" : ""}" data-t="${t}"><em>${esc(PILL[t] || typeName(t))}</em> <span>(${counts[t].toLocaleString()})</span></button>`).join("")}</div></div>` +
          `<div class="lk-rc"><div class="bw-band"><span>Results</span><b>${list.length.toLocaleString()}</b></div><div class="lk-vl"></div></div></div>`; }
      else body.innerHTML = (types.length ? `<div class="lk-pills"><button class="lk-pill${only ? "" : " on"}" data-t="">All <i>${all.length}</i></button>${types.map(t => `<button class="lk-pill${only === t ? " on" : ""}" data-t="${t}">${ICON[t] || ""} ${esc(PILL[t] || typeName(t))} <i>${counts[t]}</i></button>`).join("")}</div>` : "") +
        (list.length ? `<div class="lk-vl"></div>` : L.resultsHTML([], q));
      // every result, drawn only near the view (L.vlist); the page scrolls
      if (list.length) L.vlist(document.scrollingElement, body.querySelector(".lk-vl"), list.length, i => L.resultsHTML([list[i]], q).replace('data-i="0"', `data-i="${i}"`).replace('class="lk-row1', `class="lk-row1${i % 2 ? " zb" : ""}`),
        i => { ctx = lastList; open(list[i], true); }, list.map(it => it.key));
      body.querySelectorAll(".lk-pill").forEach(b => b.onclick = () => { only = b.dataset.t; showList(inp.value); });
    };
    // the list an item was opened from (Browse's filtered list, search results); stepping walks it. With no list (a link,
    // a drawing, a recent) it is every item of the same kind in tag order
    let ctx = null, lastList = [];
    const ORD = new Intl.Collator(undefined, { numeric: true });
    const stepList = it => { if (ctx && ctx.includes(it)) return ctx;
      const all = items.filter(x => x.t === it.t && x.r !== undefined).sort((a, b) => ORD.compare(a.key, b.key)); ctx = all; return all; };
    const open = (it, push, how) => {
      if (it && it.dupOf) it = it.dupOf;   // (the asset's page, whichever list it was picked from)
      if (!it) return; remember(it); showingRecent = false; if (it.go){ it.go(); return; }
      // phone: a drawing opens straight on the sheet (its properties page is for the desktop), the item you came from marked
      if (PHONE() && it.t === "pid" && window.Pid && Pid.has(it.key)){ Pid.open(it.key, cur && cur.t !== "pid" ? cur.key : null); return; }
      if (push) stack.push({ q: inp.value, scroll: body.scrollTop, it: cur });
      cur = it;
      // the tag to mark on a drawing: the item itself, or on a drawing's own page the item you came from
      const from = it.t === "pid" ? (stack.length && stack[stack.length - 1].it ? stack[stack.length - 1].it.key : null) : it.key;
      const hv = (d, t) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
      body.innerHTML = `<div class="lk-nav">` + (opts.noNav ? "" : `<button class="lk-home" title="Home" aria-label="Home">${hv('<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>')}</button>` +
        `<button class="lk-back" title="Back to ${stack.length && stack[stack.length - 1].it ? "previous" : "results"}" aria-label="Back">${hv('<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>')}</button>`) + `</div>` + L.itemHTML(it, Object.assign({}, opts, { find: from }));
      const slot = body.querySelector(".lk-slot"); if (slot) slot.outerHTML = stepHTML(it);   // the stepper sits in the card's gold header
      const vs = body.querySelector(".lk-vslot"); if (vs) vs.outerHTML = viewsHTML(it);   // PFD / Layout on the tag's line, right
      const nv = body.querySelector(".lk-nav"); if (nv && !nv.children.length) nv.remove();
      if (PHONE() && window.Tabs && Tabs.fit){ const k = body.querySelector(".lk-hb .lk-key"); if (k) Tabs.fit(k, k.closest(".lk-kr")); }   // a long tag shrinks to fit the width
      // (desktop: the drawing number at the head of its page opens SharePoint's latest file, named with that file's
      // revision; the other drawing links go to the drawing's page in the app)
      const hk = !PHONE() && body.querySelector("a.lk-key.lk-dwg");
      const head = H => { const n0 = hk.dataset.dwg || hk.dataset.n, u0 = H && H[n0], spu = hk && hk.isConnected && (u0 ? (window.SP && SP.view ? SP.view(u0) : u0) : window.SP && SP.url(n0)); if (!spu) return;
        const n = hk.dataset.dwg || hk.dataset.n, f = decodeURIComponent((u0 || spu).split("?")[0].split("/").pop()).replace(/\.pdf$/i, ""), x = f.slice(n.length + 1), m = x.match(/^(\d+[A-Z]?)(?:_[A-Z]{2,4})?$/i);
        hk.textContent = n + (x ? (m ? "_Rev" + m[1] : "_" + x) : ""); hk.href = spu; hk.target = "_blank"; hk.rel = "noopener"; hk.title = "Open the latest in SharePoint"; hk.dataset.n = n; hk.removeAttribute("data-dwg"); hk.classList.add("sp-a"); hk.onclick = null; };
      if (hk){ hk.dataset.n = hk.dataset.dwg; hk.removeAttribute("data-dwg"); hk.onclick = e => { if (!hk.target) e.preventDefault(); };   // (until SharePoint's list is in: a click does nothing rather than open the old full screen view)
        heldP().then(head); }
      body.querySelectorAll("[data-dwg]").forEach(a => a.onclick = e => { e.preventDefault();
        if (!PHONE() && window.kcgmOpenTag && !a.dataset.find){ kcgmOpenTag(a.dataset.dwg); return; }
        Pid.open(a.dataset.dwg, a.dataset.find || from, { page: +a.dataset.page || 1 }); });
      body.scrollTop = 0; if (root.scrollIntoView && opts.scrollTop) opts.scrollTop();
      if (!opts.noNav){ body.querySelector(".lk-back").onclick = back; body.querySelector(".lk-home").onclick = home; }
      body.querySelectorAll(".lk-st[data-s]").forEach(b => b.onclick = () => { const a = stepList(cur), i = a.indexOf(cur), x = a[i + +b.dataset.s]; if (x) open(x, false, "step"); });
      scope();

      const pb = body.querySelector("[data-pfd]"); if (pb) pb.onclick = () => opts.pfd(it).go();
      L.fillSpec(body, it); L.fillCtl(body);
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
    // desktop, a drawing's own page: the search box searches in that drawing (its pills narrow to what matches, the sheet
    // outlines it); "✕ This drawing", the P or the Assets tab goes back to the front page and the whole library
    // (the SharePoint addresses of the documents the app holds, tools/build_sp.py: a drawing's latest file)
    let HELD = null; const heldP = () => HELD || (HELD = Promise.all([fetch("sp-held.json").then(r => r.ok ? r.json() : {}).catch(() => ({})), window.SP && SP.load ? SP.load() : null]).then(a => a[0]));
    const inDwg = () => !PHONE() && cur && cur.t === "pid";
    let ph0 = null, chip = null, scoped = null;
    function scope(){
      if (ph0 == null) ph0 = inp.placeholder;
      if (!chip){ chip = document.createElement("button"); chip.type = "button"; chip.className = "lk-scope"; chip.hidden = true; chip.innerHTML = "✕ This drawing"; chip.title = "Search all assets instead";
        chip.onclick = () => home(); inp.insertAdjacentElement("afterend", chip); }
      const on = inDwg();
      if (on && scoped !== cur){ inp.value = ""; if (window.AssetViz && AssetViz.find) AssetViz.find(""); }   // (a fresh drawing page starts unfiltered)
      scoped = on ? cur : null; chip.hidden = !on; root.classList.toggle("lk-scoped", !!on);
      inp.placeholder = on ? "Search in " + cur.key.replace(/^2000-/, "") + "…" : ph0;
      if (on) filterIn(inp.value);
    }
    // the drawing page's rows that match, the rest hidden; each pill counts its matches, empty ones go; one left opens
    function filterIn(q){
      // (shown / hidden inline: the rows' own display rules outrank a hidden attribute)
      const hide = (e, h) => { e.hidden = h; if (h) e.style.setProperty("display", "none", "important"); else e.style.removeProperty("display"); };
      const w = norm(q), rows = el => [...el.querySelectorAll("a.lk-row, .lk-otd, .lk-ot, .lk-row")].filter((r, i, a) => !a.some(o => o !== r && o.contains(r)));
      body.querySelectorAll(".pf").forEach(pf => { if (pf.parentElement.closest(".pf")) return;
        let vis = [];
        pf.querySelectorAll(":scope > .pf-sec").forEach(sec => { let n = 0;
          rows(sec).forEach(r => { const m = !w || norm(r.textContent).includes(w); hide(r, !m); n += m; });
          sec.querySelectorAll(".pf-b").forEach(b => { const s2 = sec.querySelector(`.pf-sec[data-p="${b.dataset.p}"]`); if (!s2) return; const k = rows(s2).filter(r => !r.hidden).length; hide(b, !!w && !k); const i = b.querySelector("i"); if (i){ if (i.dataset.n == null) i.dataset.n = i.textContent; i.textContent = w ? k : i.dataset.n; } });
          const b = pf.querySelector(`:scope > .pf-bar > .pf-b[data-p="${sec.dataset.p}"]`); if (!b) return;
          const i = b.querySelector("i"); if (i){ if (i.dataset.n == null) i.dataset.n = i.textContent; i.textContent = w ? n : i.dataset.n; }
          hide(b, !!w && !n); if (!b.hidden) vis.push(b); });
        if (w && vis.length && !vis.some(b => b.classList.contains("on"))) vis[0].click();   // (the pill showing has no matches: the first that has)
        else if (w && vis.length === 1 && !vis[0].classList.contains("on")) vis[0].click(); });
    }
    // Escape (desktop): an asset's page goes to the page of the drawing beside it; on a drawing page, the search in it
    // is cleared first, then the front page
    addEventListener("keydown", e => { if (e.key !== "Escape" || PHONE() || e.defaultPrevented || document.documentElement.classList.contains("sp-open") || document.body.classList.contains("sp-on")) return;
      if (document.querySelector('[role="dialog"]:not([hidden]), .mo:not([hidden])')) return;
      if (inDwg()){ if (inp.value){ inp.value = ""; filterIn(""); if (window.AssetViz && AssetViz.find) AssetViz.find(""); } else home(); return; }
      const n = cur && window.AssetViz && AssetViz.shownDrawing && AssetViz.shownDrawing(); if (n){ const x = L.find(norm(n), "pid"); if (x){ AssetViz.keepAll && AssetViz.keepAll(); open(x, true); } } });
    // home: back to the start (the Assets page's own reset when it has one, else an empty search)
    const home = () => { stack.length = 0; cur = null; inp.value = ""; showList(""); scope(); if (opts.home) opts.home(); };
    const back = () => { const s = stack.pop(); if (s && s.it){ cur = null; open(s.it, false); } else { cur = null; showList(inp.value); if (s) body.scrollTop = s.scroll; } };
    let tmr; inp.addEventListener("input", () => { clearTimeout(tmr); if (inDwg()){ filterIn(inp.value); return; } tmr = setTimeout(() => { stack.length = 0; cur = null; ensure().then(() => { showList(inp.value); scope(); }); }, 120); });
    inp.addEventListener("keydown", e => { if (e.key === "Enter" && inDwg()){ e.preventDefault(); return; } if (e.key === "Enter"){ e.preventDefault(); clearTimeout(tmr); stack.length = 0; rememberQ(inp.value); ensure().then(() => { showList(inp.value); if (hits.length && (hits[0].k === norm(inp.value) || hits.length === 1)) open(hits[0], true); }); inp.blur(); } });
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
      redraw: () => { if (cur) open(cur, false, "step"); },
      openItem: (it, list, how) => { stack.length = 0; cur = null; ctx = list || null; open(it, true, how); },
      close: () => { stack.length = 0; cur = null; showList(inp.value); }, current: () => cur };
  };

  // ---------- photo text recognition ----------
  let worker = null;
  const loadScript = src => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("couldn't load the text reader (needs internet the first time)")); document.head.appendChild(s); });
  async function getWorker(progress){
    if (worker) return worker;
    // (the reader, its engine and the English text data are the app's own files, vendor/tesseract: kept on the device with
    // the app's offline core, offline.js, so the camera reads tags with no signal)
    const V = f => new URL("vendor/tesseract/" + f, location.href).href;
    if (!window.Tesseract) { progress("Loading the text reader…"); await loadScript(V("tesseract.min.js")); }
    worker = await Tesseract.createWorker("eng", 1, { workerPath: V("worker.min.js"), corePath: V("core"), langPath: V("lang"), gzip: true, logger: m => { if (m.status === "recognizing text") progress(`Reading text… ${Math.round(m.progress * 100)}%`); else if (m.status) progress(m.status.replace(/^\w/, c => c.toUpperCase()) + "…"); } });
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
.lk-status{font-size:var(--fb,15px);color:var(--mute);min-height:18px;margin:6px 2px}.lk-status:not(:empty){display:flex;align-items:center;gap:6px;padding:5px 8px;margin:6px 0;background:var(--hd);font-size:var(--fl,13px);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--hd2)}.lk-status b{color:var(--ink);letter-spacing:.02em;margin-left:auto;order:2;font-variant-numeric:tabular-nums}
.lk-hit{display:flex;gap:10px;width:100%;text-align:left;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);border-radius:12px;padding:10px 11px;margin-bottom:7px;cursor:pointer;font:inherit}
.lk-hit:hover{border-color:var(--lk-a)}
.lk-pills{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;margin-bottom:2px;scrollbar-width:none;-webkit-overflow-scrolling:touch}.lk-pills::-webkit-scrollbar{display:none}:root:not(.phone) .lk-pills{flex-wrap:wrap;overflow:visible}.lk-scoped .lk-row[hidden],.lk-scoped .lk-otd[hidden],.lk-scoped .lk-ot[hidden],.lk-scoped .pf-b[hidden]{display:none!important}.lk-scope{display:none}:root:not(.phone) .lk-scoped .lk-scope:not([hidden]){display:inline-flex;align-items:center;flex:none;margin-left:6px;border:1px solid var(--gold,var(--accent));background:var(--card);color:var(--ink);font:inherit;font-size:var(--fl,13px);font-weight:700;border-radius:var(--sqr,8px);padding:4px 9px;cursor:pointer;white-space:nowrap}.lk-sr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);column-gap:12px;align-items:start}.lk-fc{position:sticky;top:calc(var(--tb,0px) + 8px)}.lk-fo{display:flex;flex-direction:column;gap:4px;margin-top:4px}.lk-fo .bw-o{max-width:none}.lk-fo .bw-o.on{border-color:var(--gold,var(--accent));box-shadow:inset 0 0 0 1px var(--gold,var(--accent));color:var(--ink)}.lk-fo .bw-o em{font-style:normal;font-weight:700;color:var(--ink)}.lk-rc .bw-band b{font-variant-numeric:tabular-nums}
.lk-pill{flex:none;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);border-radius:99px;padding:5px 10px;font:inherit;font-size:var(--fb,15px);font-weight:700;cursor:pointer;white-space:nowrap}
.lk-pill i{font-style:normal;font-weight:600;color:var(--mute);margin-left:2px}.lk-pill.on{background:var(--lk-c);box-shadow:inset 0 0 0 1px var(--lk-a);border-color:var(--lk-a);color:color-mix(in srgb,var(--lk-a) 70%,var(--ink))}.lk-pill.on i{color:var(--mute)}
.lk-row1{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--lk-l);background:none;color:var(--ink);padding:7px 4px;cursor:pointer;font:inherit;font-size:var(--fb,15px);line-height:1.3}
.lk-row1:hover,.lk-row1:focus{background:var(--rh,var(--lk-c))}.lk-ic1{flex:none;font-size:13px;width:18px;text-align:center}
.lk-row1 b{font-family:inherit;font-size:var(--fb,15px);color:var(--lk-a)}
.lk-row1.txt b{flex:0 1 auto;max-width:62%;overflow:hidden;text-overflow:ellipsis}   /* a sentence for a key (PFD stream names): not an ID, so it may be cut */
.pj-tsf{flex:none;align-self:center;font-style:normal;font-size:max(9px,calc(var(--fl,13px) * .8));font-weight:800;letter-spacing:.04em;line-height:1.35;color:#fff;background:#2f7d6b;border-radius:5px;padding:0 5px;margin:0 2px;vertical-align:1px}
.lk-more{width:100%;margin:8px 0;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);border-radius:10px;padding:8px;font:inherit;font-weight:700;cursor:pointer}.lk-ic{font-size:18px;line-height:1.2}.lk-hb{display:flex;flex-direction:column;gap:2px;min-width:0}
.lk-hb b{font-family:inherit;font-size:var(--fb,15px);color:var(--lk-a);word-break:break-all}.lk-hb span{font-size:var(--fb,15px);line-height:1.3}.lk-hb em{font-size:var(--fb,15px);color:var(--mute);font-style:normal}
.lk-rh{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 8px;background:var(--hd);font-size:var(--fl,13px);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--hd2);margin:2px 0 8px}
.lk-rh button{border:0;background:none;color:var(--lk-a);font:inherit;text-transform:none;letter-spacing:0;font-size:var(--fb,15px);cursor:pointer;padding:4px}
.lk-empty{color:var(--mute);font-size:var(--fb,15px);padding:10px 2px;line-height:1.45}
.lk-nav{display:flex;gap:8px;margin:2px 0 12px}
.lk-home,.lk-back{width:34px;height:34px;border-radius:50%;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);display:grid;place-items:center;padding:0;cursor:pointer}
.lk-nav{align-items:center}.lk-kr{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}.lk-kr .lk-key{margin:0;min-width:0}.lk-vw{margin-left:auto;display:inline-flex;border:1.5px solid var(--lk-a);border-radius:9px;overflow:hidden;background:var(--lk-c)}
.lk-vw a{display:flex;align-items:center;padding:0 11px;height:31px;color:var(--ink);text-decoration:none;font-weight:800;font-size:var(--fb,15px);white-space:nowrap}.lk-vw a+a{border-left:1.5px solid var(--lk-a)}
.lk-vw a:hover{background:color-mix(in srgb,var(--lk-a) 22%,var(--lk-c))}.lk-vw sup{font-size:.6em;font-weight:700;font-style:italic;margin-left:2px;opacity:.75}.lk-step{display:inline-flex;align-items:stretch;height:34px;border-radius:9px;overflow:hidden;background:var(--lk-c);box-shadow:inset 0 0 0 1.5px var(--lk-a);margin-left:6px}
.lk-st{border:0;background:transparent;color:var(--lk-a);font:inherit;font-size:20px;font-weight:800;padding:0 11px;cursor:pointer;line-height:1}.lk-st:hover:not(:disabled){filter:brightness(1.1)}.lk-st:disabled{opacity:.4;cursor:default}
.lk-sn{display:flex;align-items:center;padding:0 8px;background:transparent;color:var(--ink);border-left:1px solid var(--lk-l);border-right:1px solid var(--lk-l);font-size:var(--fl,13px);white-space:nowrap}.lk-sn b{margin-right:3px}
.lk-home:hover,.lk-back:hover{border-color:var(--lk-a);color:var(--lk-a)}
.lk-kind{font-size:var(--fl,13px);font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--lk-a)}
.lk-key{font-family:inherit;font-size:var(--fh,22px);font-weight:800;margin:4px 0 2px;word-break:break-all}.lk-name{font-size:var(--fb,15px);line-height:1.35;margin-bottom:8px}
.lk-t{width:100%;border-collapse:collapse;font-size:var(--fb,15px);margin:6px 0}.lk-t td{padding:5px 4px;border-bottom:1px solid var(--lk-l);vertical-align:top;word-break:break-word}.lk-t td:first-child{color:var(--mute);width:13.5em;padding-right:10px;font-size:var(--fb,15px);word-break:normal;overflow-wrap:normal;hyphens:manual}
.lk-a{color:var(--lk-a);text-decoration:underline;cursor:pointer}.lk-row{display:block;text-decoration:none;color:var(--ink);background:var(--lk-c);border-radius:8px;padding:6px 8px;margin:4px 0;font-size:var(--fb,15px)}
.lk-row b{font-family:inherit;color:var(--lk-a);margin-right:4px}.lk-1l{display:flex;align-items:baseline;gap:0 7px;white-space:nowrap;overflow:hidden;text-decoration:none}.lk-1l>*{flex:none;margin:0}.lk-1l>b{font-weight:700;margin:0}
.lk-1l>.d1{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--mute);font-weight:400;font-size:var(--fb,15px)}.lk-1l>.d1:empty{display:none}
.lk-n1{margin-left:auto!important;font-style:normal;font-size:var(--fl,13px);color:var(--mute)}.lk-h{margin:14px 0 4px;font-size:var(--fl,13px);letter-spacing:1px;text-transform:uppercase;color:var(--mute)}
.pf-bar{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0 8px}
.pf-b{border:1px solid var(--lk-l,var(--line));background:var(--lk-c,var(--panel2));color:var(--ink);border-radius:99px;padding:4px 10px;font:inherit;font-size:var(--fb,15px);font-weight:700;cursor:pointer;white-space:nowrap}
.pf-b i{font-style:normal;color:var(--mute);font-weight:600;font-size:var(--fb,15px)}
.pf-b.on{background:var(--lk-c);box-shadow:inset 0 0 0 1px var(--lk-a,var(--accent));border-color:var(--lk-a,var(--accent));color:color-mix(in srgb,var(--lk-a) 70%,var(--ink))}.pf-b.on i{color:var(--mute)}
.pf-sec[hidden]{display:none}
.pf .pf .pf-bar,.pf-sec>.lk-spec>.pf>.pf-bar{margin:-2px 0 8px;padding-left:10px;border-left:2px solid var(--lk-a,var(--accent))}
.pf .pf .pf-b{font-size:var(--fb,15px);padding:3px 9px;background:transparent}
.pf .pf .pf-b.on{background:transparent;box-shadow:inset 0 0 0 1px var(--lk-a,var(--accent));color:color-mix(in srgb,var(--lk-a) 70%,var(--ink));border-color:var(--lk-a,var(--accent))}
.pf .pf .pf-b.on i{color:var(--ink)}
.lk-d{border:1px solid var(--lk-l);border-radius:10px;margin:6px 0;padding:0 8px}.lk-d summary{cursor:pointer;padding:8px 0;font-weight:700;font-size:var(--fb,15px)}
.lk-ns{font-size:var(--fb,15px);color:var(--mute);margin:4px 0;line-height:1.4}.lk-src{font-size:var(--fb,15px);color:var(--mute);margin-top:12px;line-height:1.4}
.lk-btn{border:1px solid var(--lk-a);background:none;color:var(--lk-a);border-radius:10px;padding:8px 12px;font:inherit;font-weight:700;cursor:pointer;margin:6px 0}
.lk-spec .lk-btn{font-size:var(--fb,15px);padding:6px 10px;margin:6px 0 4px}
.lk-spec .sp-t{font-size:var(--fb,15px);line-height:1.4;margin:2px 0 4px}.lk-spec .lk-btn span{font-weight:500;opacity:.75;font-size:var(--fb,15px);margin-left:4px}
.lk-t td:last-child{overflow-wrap:anywhere}
.lk-iomt{color:var(--mute)}.lk-otd{border-bottom:1px solid var(--lk-l,rgba(0,0,0,.08))}.lk-otd>summary{list-style:none;cursor:pointer;display:flex;align-items:baseline;gap:8px;padding:7px 4px}.lk-otd>summary::-webkit-details-marker{display:none}.lk-otn{color:var(--mute);font-size:.9em;margin-left:auto;background:var(--card2,rgba(120,130,145,.14));border-radius:10px;padding:1px 8px;white-space:nowrap}.lk-otd>summary::after{content:"▾";color:var(--mute);transition:transform .15s}.lk-otd[open]>summary::after{transform:rotate(180deg)}.lk-otl{display:flex;flex-wrap:wrap;gap:4px 12px;padding:0 4px 8px 22px}.lk-iomm summary{cursor:pointer;color:var(--doc-a,#0b63c5);margin-top:3px}.lk-iomm[open] summary{margin-bottom:3px}
.lk-ctw{overflow-x:auto;margin:2px 0 6px}.lk-ct{border-collapse:collapse;font-size:var(--fl,13px);min-width:100%}.lk-ct th{text-align:left;font-weight:700;color:var(--mute);border-bottom:1px solid var(--line,#ddd);padding:3px 6px;white-space:nowrap}.lk-ct td{border-bottom:1px solid var(--line,#eee);padding:3px 6px;vertical-align:top}.lk-ctl .lk-band:first-child{margin-top:2px}.lk-cu{padding:5px 2px;border-bottom:1px solid var(--line,#eee)}.lk-cu em{font-style:normal;color:var(--mute);font-size:var(--fl,13px);margin-left:4px}.lk-cuv{font-size:var(--fl,13px);margin-top:2px;color:var(--ink)}.lk-cuv b{color:var(--mute);font-weight:600}.lk-di{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;margin:0 0 0 5px;padding:0;border-radius:50%;border:1.5px solid var(--doc-a,#0b63c5);background:transparent;color:var(--doc-a,#0b63c5);font:italic 800 11px/1 Georgia,serif;vertical-align:1px;cursor:pointer}.lk-dip{position:absolute;z-index:3000;max-width:min(340px,calc(100vw - 16px));background:var(--card,#fff);color:var(--ink,#111);border:1px solid var(--line,#ccd);border-radius:10px;box-shadow:0 6px 20px #0003;padding:8px 11px;font-size:var(--fl,13px);line-height:1.35}.lk-dip:before{content:"";position:absolute;top:-6px;left:calc(var(--ax,50%) - 6px);width:10px;height:10px;background:inherit;border-left:1px solid var(--line,#ccd);border-top:1px solid var(--line,#ccd);transform:rotate(45deg)}.lk-dip b{display:block;margin-bottom:2px}.lk-dip b i{font-style:normal;font-weight:600;color:var(--mute,#667)}.lk-dip span{display:block}.lk-bandr td{padding:0!important;border:0!important}.lk-band{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:5px 8px;background:var(--hd);font-size:var(--fl,13px);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--hd2);margin:10px 0 2px}.lk-band small{font-weight:600;letter-spacing:0;text-transform:none;font-size:12px;color:var(--mute);text-align:right}.lk-band span{white-space:nowrap}:root.phone .lk-band small{display:none}
.lk-red,.lk-red a{color:#d11!important}.lk-clash{color:#d11;font-size:12px;font-weight:800;margin-top:2px}.lk-clash a{color:#d11;text-decoration:underline;font-weight:600;margin-left:4px}.lk-rsw{font-size:12px;color:var(--mute)}
.lk-t td.lk-sub{color:var(--lk-a);font-size:var(--fl,13px);font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding-top:10px;width:auto}
.sp-self .sp-head{display:none}
.sp-cl{display:flex;flex-direction:column}.sp-p{padding:6px 2px;border-bottom:1px solid var(--lk-l);font-size:var(--fb,15px);line-height:1.4;color:var(--mute)}.sp-p b{color:var(--ink);font-weight:600}
.sp-all{background:color-mix(in srgb,var(--lk-a) 14%,var(--lk-c));border:1px solid var(--lk-a);border-radius:10px;padding:7px 10px;margin:8px 0 4px;font-size:var(--fb,15px)}.sp-all b{color:var(--lk-a)}
.sp-ff{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}.sp-f{display:block;border:1.5px solid var(--lk-l);background:var(--lk-c);border-radius:10px;padding:4px 9px}.sp-f.w{grid-column:1/-1}
.sp-f span{display:block;font-size:var(--fl,13px);font-weight:700;color:var(--mute)}.sp-f select{width:100%;border:0;background:none;color:var(--ink);font:inherit;font-size:var(--fb,15px);font-weight:700;padding:2px 0;outline:none}
.sp-fo{border:1.5px solid var(--lk-a);background:color-mix(in srgb,var(--lk-a) 10%,var(--lk-c));border-radius:12px;padding:8px 11px;margin:6px 0}.sp-fo h4{margin:0 0 4px;font-size:var(--fb,15px)}
.sp-fc{display:inline-block;background:var(--lk-c);box-shadow:inset 0 0 0 1.5px var(--lk-a);color:color-mix(in srgb,var(--lk-a) 70%,var(--ink));border-radius:5px;padding:0 5px;margin-right:6px;font-size:var(--fl,13px);font-weight:800}
.sp-kv{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-top:1px solid var(--lk-l);font-size:var(--fb,15px)}.sp-kv:first-of-type{border-top:0}.sp-kv span{color:var(--mute)}.sp-kv b{text-align:right;font-weight:700}
.sp-fv{margin:8px 0 2px;font-size:var(--fl,13px);font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--lk-a)}
.sp-fn{font-size:var(--fl,13px);color:var(--mute);margin-top:4px}.sp-std{display:block;width:100%;text-align:left;margin:6px 0}.sp-std span{display:block;font-weight:500;color:var(--mute);font-size:var(--fl,13px)}
.sp-gh{margin:12px 2px 2px;font-size:var(--fb,15px);font-weight:700;color:var(--mute)}
.sp-gl{padding:0 2px 8px;border-bottom:1px solid var(--lk-l);font-size:var(--fb,15px);line-height:1.5}
.sp-sc{overflow-x:auto;-webkit-overflow-scrolling:touch}.sp-dt td,.sp-ct td,.sp-ct th{white-space:nowrap}.sp-dt td:first-child{width:auto}
.sp-ct th{font-size:var(--fb,15px);text-align:left;color:var(--mute);padding:4px;border-bottom:1px solid var(--lk-l)}.sp-ct td:first-child{color:var(--ink);width:auto;white-space:normal;min-width:120px}
.sp-n{font-size:var(--fb,15px);line-height:1.4;margin:6px 0;padding-left:1.4em;text-indent:-1.4em}.sp-n>sup{color:var(--lk-a);font-weight:800;display:inline-block;min-width:1.2em;text-indent:0}
.sp-cl sup,.sp-all sup,.sp-gh sup{color:var(--lk-a);font-weight:800;margin-left:1px}
.sp-nh{margin:14px 2px 2px;font-size:var(--fl,13px);font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.sp-v{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.sp-chip{border:1px solid var(--lk-a);background:none;color:var(--lk-a);border-radius:99px;padding:4px 9px;font:inherit;font-family:inherit;font-size:var(--fb,15px);font-weight:700;cursor:pointer}
.sp-chip.off{border-color:var(--lk-l);color:var(--mute);cursor:default}.sp-warn{font-size:var(--fb,15px);color:#f59e0b;margin:4px 0}
.sp-view{position:fixed;inset:0;z-index:2000;background:#2b2f36;display:flex;flex-direction:column}.sp-view[hidden]{display:none}
:root{--hl:#1e6ee6}.sp-arw{position:absolute;z-index:7;width:30px;height:36px;border-radius:18px;border:0;background:rgba(20,30,45,.72);color:#fff;font:700 24px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:0 0 3px;cursor:pointer}.sp-arw[hidden]{display:none}:root.phone .sp-view .sp-top>:not(.sp-fb):not(.sp-q):not(.sp-finds):not(.sp-ze){display:none!important}:root.phone .sp-view .sp-top .sp-fb{border-left:0!important}.sp-cxp{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0 8px;flex:none}.sp-cxp::-webkit-scrollbar{display:none}.sp-cxpl{flex:none;border:1px solid #4a5a73;background:transparent;color:#e8eef7;border-radius:14px;padding:4px 10px;font:600 var(--fl,13px) system-ui,sans-serif;white-space:nowrap}.sp-cxpl i{font-style:normal;opacity:.7;margin-left:3px}.sp-cxpl.on{border-color:#6ea8ff;background:#21385c}.sp-cxl{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}.sp-cxr{display:flex;gap:8px;align-items:baseline;width:100%;text-align:left;border:0;border-bottom:1px solid #334055;background:none;color:#c9d3e0;padding:7px 2px;font:var(--fl,13px) system-ui,sans-serif;white-space:nowrap;overflow:hidden}.sp-cxr b{color:#9cc3ff;flex:none}.sp-cxr span{overflow:hidden;text-overflow:ellipsis}.sp-cx{position:absolute;left:0;right:0;z-index:5;overflow:hidden;color:#fff;padding:2px 8px 4px;box-sizing:border-box;display:flex;flex-direction:column}.sp-cx[hidden]{display:none}
.sp-fl{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}.sp-fl polyline{fill:none;stroke:var(--c);stroke-width:var(--flw,2.4px);vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round;opacity:.7}.sp-fl polyline.fw{stroke:#fff;opacity:.95;stroke-width:calc(var(--flw,2.4px) * .5);stroke-dasharray:1.5 9;animation:sp-flow 1.1s linear infinite}.sp-fl.dim polyline:not(.sel){stroke:#9aa3ad;opacity:.4}.sp-fl.dim polyline.fw{display:none}@media (prefers-reduced-motion:reduce){.sp-fl polyline.fw{animation:none}}.sp-fl.pk polyline.fw:not(.sel){display:none}.sp-fl.pk polyline.fw.sel{display:inline}.sp-fltk{position:absolute;z-index:6;display:flex;flex-direction:column;gap:5px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.96);box-shadow:0 2px 10px rgba(0,0,0,.22);font:600 12.5px system-ui,sans-serif;color:#1f2937}.sp-fltk[hidden]{display:none!important}.sp-fltk label{display:flex;align-items:center;gap:7px;cursor:pointer;white-space:nowrap}.sp-fltk input{width:15px;height:15px;margin:0;accent-color:var(--th,#475569);cursor:pointer}.sp-flg .row{all:unset;box-sizing:border-box;display:flex;align-items:center;cursor:pointer;min-width:0}.sp-flg.dk{font-size:12px;min-width:240px;overflow:auto}.sp-flg.dk .hd{font-size:12px;padding:8px 12px}.sp-flg.dk .grid{grid-template-columns:1fr;padding:0 6px 6px}.sp-flg.dk .row{gap:8px;padding:4px 8px;font-size:12px}.sp-flg.dk .sw{width:20px;height:5px}.sp-flg.dk .cd{width:38px}.sp-flg .ct{margin-left:auto;color:#94a3b8;padding-left:10px}.sp-flg.pk .row:not(.on){opacity:.45}.sp-flg.lkA .row{border-radius:6px;margin:1px 0}.sp-flg.lkA .row:hover{background:#eef2f7}.sp-flg.lkA .row.on{background:#e2e8f0;box-shadow:inset 0 0 0 1.5px #64748b}.sp-flg.lkA .sw{display:none}.sp-flg.lkA .cd{width:auto;min-width:3.2em;text-align:center;padding:2px 6px;border-radius:999px;background:var(--c);color:#fff;text-shadow:0 0 2px rgba(0,0,0,.45);box-shadow:0 1px 2px rgba(0,0,0,.25)}.sp-flg.lkB .row{border-radius:6px}.sp-flg.lkB .row:hover{background:#eef2f7}.sp-flg.lkB .cd{color:#1d4ed8;text-decoration:underline;text-underline-offset:2px}.sp-flg.lkB .row::after{content:'›';margin-left:6px;color:#64748b;font-weight:800}.sp-flg.lkB .row.on{background:#e2e8f0}.sp-flg.lkC .grid{gap:4px}.sp-flg.lkC .row{border:1px solid #cbd5e1;border-left:6px solid var(--c);border-radius:6px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.12);margin:1px 0}.sp-flg.lkC .sw{display:none}.sp-flg.lkC .row:hover{background:#f8fafc;border-color:#94a3b8;border-left-color:var(--c)}.sp-flg.lkC .row.on{background:#eef2f7;box-shadow:inset 0 0 0 1.5px #64748b}.sp-lc{position:absolute;left:12px;z-index:6;display:flex;align-items:center;gap:4px;font:700 10px system-ui,sans-serif;padding:4px 8px;border-radius:999px;border:1.5px solid var(--th,#3b4a5c);background:#fff;color:var(--th2,#2b3a4c);box-shadow:0 2px 6px #0003;cursor:pointer}.sp-lc[hidden],.sp-lcp[hidden],.sp-flg[hidden],.sp-view.typing .sp-lc,.sp-view.tracing .sp-lc{display:none!important}.sp-lcp{position:absolute;z-index:30;background:#fff;color:#1f2937;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.28);padding:3px 10px;min-width:150px;font:700 9.5px system-ui,sans-serif}.sp-lcp h6{margin:5px 0 1px;font:800 6.5px system-ui,sans-serif;letter-spacing:.4px;color:#64748b;text-transform:uppercase}.sp-lcp label{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #e5e7eb;cursor:pointer}.sp-lcp label:first-of-type{border-top:0}.sp-lcp .ap-sw{width:30px;height:18px;border-radius:9px}.sp-lcp .ap-sw::after{width:13px;height:13px;left:2.5px;top:2.5px}.sp-lcp .ap-sw:checked{background:var(--th,#475569)}.sp-lcp .ap-sw:checked::after{left:14.5px}.sp-flg{position:absolute;z-index:6;background:color-mix(in srgb,#fff 95%,transparent);color:#1f2937;border-radius:9px;box-shadow:0 2px 10px rgba(0,0,0,.22);font:600 7px/1.15 system-ui,sans-serif;overflow:hidden}.sp-flg.fl{max-width:72%}.sp-flg .hd{all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:5px;padding:5px 7px;font:800 7.5px system-ui,sans-serif;cursor:pointer}.sp-flg .hd b{flex:1;white-space:nowrap}.sp-flg .hd em{font-style:normal;color:#64748b;white-space:nowrap}.sp-flg .fl-dots{display:flex;gap:2px;flex-wrap:wrap;justify-content:flex-end}.sp-flg .fl-dots i{width:5px;height:5px;border-radius:50%}.sp-flg .grid{display:grid;grid-template-columns:1fr 1fr;column-gap:4px;padding:0 0 5px}.sp-flg.fl .grid{grid-template-columns:1fr}.sp-flg .row{display:flex;align-items:center;gap:3px;padding:1.5px 7px;min-width:0}.sp-flg .sw{width:11px;height:3.5px;border-radius:2px;flex:none}.sp-flg .cd{font-weight:800;width:19px;flex:none}.sp-flg .nm{color:#475569;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-trl{--hl:var(--thm,#1e6ee6);position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}.sp-trl polyline{fill:none;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;stroke:color-mix(in srgb,var(--hl) 50%,transparent);stroke-width:calc(var(--trw,1px) * 1.35)}.sp-trl circle,.sp-trl polygon{fill:var(--hl);stroke:#fff;stroke-width:1px;stroke-linejoin:round;vector-effect:non-scaling-stroke}.sp-trl polyline.fw{stroke:rgba(255,255,255,.75);stroke-width:calc(var(--trw,1px) * .45);stroke-dasharray:2 14;animation:sp-flow 1.1s linear infinite;mix-blend-mode:normal}@keyframes sp-flow{to{stroke-dashoffset:-16}}@media (prefers-reduced-motion:reduce){.sp-trl polyline.fw{animation:none}}
.sp-trb{position:absolute;z-index:8;left:16px;right:16px;bottom:0;padding:8px 8px calc(max(4px, var(--gb,40px) - 38px) + env(safe-area-inset-bottom));background:var(--th-t,#eef1f5);color:var(--th,#475569);border:1.5px solid var(--th-b,#64748b);border-bottom:0;border-radius:14px 14px 0 0;font:11px/1.2 system-ui,sans-serif;box-shadow:0 -3px 14px rgba(0,0,0,.2)}.sp-trb[hidden]{display:none}.sp-view.tracing .sp-ze,.sp-view.tracing .sp-finds{display:none!important}
.sp-trh{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:0}.sp-trzh{display:none}
.sp-trb.dk{left:0;right:0;border-radius:0;border-left:0;border-right:0;padding:4px 14px 6px}.sp-trb.dk .sp-trh{margin-bottom:2px;gap:6px}
.sp-trb.dk .sp-trzh{display:flex;align-items:center;gap:4px;margin-right:6px;font:600 11px system-ui,sans-serif;color:var(--th,#475569)}.sp-trb.dk .sp-trzh button{border:0;background:none;color:inherit;font:700 15px/1 system-ui,sans-serif;padding:0 3px;cursor:pointer}.sp-trb.dk .sp-trzhb{width:170px;display:flex}.sp-trb.dk .sp-trzh b{margin-left:2px}
.sp-trb.dk .sp-trh .sp-trn{display:block;flex:1;font-size:15px;letter-spacing:.2px}.sp-trb.dk .sp-trtk{padding-top:4px}.sp-trb.dk .sp-trln{display:none}
.sp-trb.dk .sp-trtk .sp-rg{height:22px}.sp-trb.dk .sp-trtk .sp-rg::-webkit-slider-runnable-track{height:8px;border-radius:4px}.sp-trb.dk .sp-trtk .sp-rg::-webkit-slider-thumb{width:18px;height:18px;margin-top:-5px;border-radius:50%;background:var(--rc);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.sp-trb.dk .sp-trtk .sp-rg::-moz-range-track,.sp-trb.dk .sp-trtk .sp-rg::-moz-range-progress{height:8px;border-radius:4px}.sp-trb.dk .sp-trtk .sp-rg::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--rc);border:3px solid #fff}
.sp-trb.dk .sp-trc i,.sp-trb.dk .sp-trc i.k-v,.sp-trb.dk .sp-trc i.k-i,.sp-trb.dk .sp-trc i.k-p{height:5px!important;width:2px;background:var(--th,#475569)!important;box-shadow:none!important;opacity:.85}
.sp-trb.dk .sp-trnx{height:26px;margin-top:2px}.sp-trb.dk .sp-trnx.two{height:50px;margin-top:-10px}
.sp-trb.dk .sp-trc b.h{writing-mode:horizontal-tb;transform:none;top:auto;white-space:nowrap;font-size:11px;line-height:14px;font-weight:700;max-height:none}.sp-trb.dk .sp-trc b.h em{font-style:normal;font-weight:500;font-size:8.5px;letter-spacing:.3px;opacity:.7}
.sp-trrow{display:flex;align-items:flex-start;gap:3px}.sp-trrow .sp-trtk{flex:1;min-width:0}.sp-trnx{flex:none;width:38px;display:flex;flex-direction:column;justify-content:center;gap:3px;height:36px;margin-top:75px}.sp-trnx:empty{width:0}.sp-trnx.two{height:58px;margin-top:64px}.sp-trnx button{flex:1;border:0;background:var(--th,#475569);color:var(--on-th,#fff);font:700 10px/1 system-ui,sans-serif;letter-spacing:-.2px;padding:0;cursor:pointer;min-height:0}.sp-trnx.l button{clip-path:polygon(28% 0,100% 0,100% 100%,28% 100%,0 50%);padding-left:9px}.sp-trnx.r button{clip-path:polygon(0 0,72% 0,100% 50%,72% 100%,0 100%);padding-right:9px}.sp-trnx button.sh{font-size:7.5px;line-height:1.05;white-space:normal;word-break:break-all}.sp-trh .sp-trn{display:none}.sp-trln{position:absolute;z-index:1;left:0;right:0;top:75px;height:36px;pointer-events:none;font:700 9.5px/36px system-ui,sans-serif;letter-spacing:-.2px;text-align:center;white-space:nowrap;overflow:hidden}.sp-trln span{position:absolute;inset:0;padding:0 10px;overflow:hidden;text-overflow:ellipsis}.sp-trln span:first-child{color:#fff;clip-path:inset(0 calc(100% - var(--p,0%)) 0 0)}.sp-trln span+span{color:var(--th,#475569);clip-path:inset(0 0 0 var(--p,0%))}.sp-trn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;letter-spacing:-.3px}
.sp-tro{border:0;background:var(--th,#475569);color:var(--on-th,#fff);border-radius:3px;font:600 10.5px system-ui,sans-serif;padding:5px 10px;box-shadow:0 1px 2px rgba(0,0,0,.25);cursor:pointer;white-space:nowrap;flex:none}.sp-trx{border:0;background:none;color:inherit;font:600 15px system-ui,sans-serif;padding:0 2px;cursor:pointer}
.sp-trtk{position:relative;padding:66px 0 112px}.sp-tre{display:none!important}
.sp-rg{-webkit-appearance:none;appearance:none;display:block;width:100%;height:24px;margin:0;background:transparent;--rc:var(--th,#475569)}
.sp-rg{--p:inherit}.sp-rg::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(to right,var(--rc) var(--p,0%),color-mix(in srgb,var(--rc) 22%,transparent) var(--p,0%))}
.sp-rg::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;margin-top:-6px;border-radius:50%;background:var(--rc);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.sp-rg::-moz-range-track{height:6px;border-radius:3px;background:color-mix(in srgb,var(--rc) 22%,transparent)}.sp-rg::-moz-range-progress{height:6px;border-radius:3px;background:var(--rc)}.sp-rg::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--rc);border:3px solid #fff}
.sp-trtk .sp-rg{height:54px}.sp-trtk .sp-rg::-webkit-slider-runnable-track{height:36px;border-radius:18px}.sp-trtk .sp-rg::-webkit-slider-thumb{width:20px;height:50px;margin-top:-7px;border-radius:10px;background:transparent;border:3px solid var(--rc);box-shadow:0 0 0 2px #fff,0 1px 6px rgba(0,0,0,.35)}
.sp-trtk .sp-rg::-moz-range-track,.sp-trtk .sp-rg::-moz-range-progress{height:36px;border-radius:18px}.sp-trtk .sp-rg::-moz-range-thumb{width:14px;height:42px;border-radius:10px;background:transparent;border:3px solid var(--rc)}
.sp-trc{position:absolute;left:8px;right:8px;top:0;height:100%;font-size:11px;line-height:1;pointer-events:none}.sp-trnx button.sh.sl{white-space:pre-line;word-break:keep-all;font-size:7.5px}.sp-trc i{position:absolute;top:75px;width:2px;height:36px;background:#fff!important;box-shadow:0 0 0 .5px color-mix(in srgb,var(--th,#475569) 80%,transparent)!important;opacity:.9;margin-left:-1px;background:#fff;box-shadow:0 0 0 .5px color-mix(in srgb,var(--th,#475569) 70%,transparent);border-radius:1px}.sp-trc i.k-v,.sp-trc i.k-i,.sp-trc i.k-p{height:36px;top:75px;opacity:.75}
.sp-trc b{position:absolute;writing-mode:vertical-rl;transform:translateX(-50%) rotate(180deg);white-space:nowrap;font-weight:600;font-size:11px;line-height:13px;max-height:80px;overflow:hidden;text-overflow:ellipsis}.sp-trc b.ty{top:auto;font-size:8.5px;font-weight:500;letter-spacing:.3px;opacity:.7;max-height:38px}.sp-trco{position:absolute;left:0;top:0;overflow:visible}.sp-trco polyline{fill:none;stroke:currentColor;stroke-width:1;opacity:.45}
.sp-tre{display:flex;gap:6px;font-size:10.5px;pointer-events:none;padding-top:2px}.sp-tre span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-tre .sp-trp{flex:none;opacity:.7}.sp-tre .e{text-align:right}
.sp-trv{box-sizing:border-box;position:absolute;z-index:8;right:22px;top:64px;height:255px;max-height:calc(100% - 64px - 275px);width:44px;border-radius:22px;background:var(--th-t,#eef1f5);border:1.5px solid var(--th-b,#64748b);color:var(--th,#475569);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:2px 0;box-shadow:0 2px 10px rgba(0,0,0,.2)}.sp-trv[hidden]{display:none}
.sp-trv button{border:0;background:none;color:inherit;font:700 22px/1 system-ui,sans-serif;width:40px;height:34px;cursor:pointer;padding:0;flex:none}.sp-trzb{position:relative;flex:1;width:100%;container-type:size}.sp-trzb .sp-rg{position:absolute;left:50%;top:50%;width:170px;width:calc(100cqh - 8px);transform:translate(-50%,-50%) rotate(-90deg)}
.sp-view.cx-on .sp-ze{display:none!important}.sp-lg{position:absolute;right:12px;z-index:6;display:flex;align-items:center;gap:5px;font:700 13px system-ui,sans-serif;padding:6px 10px;border-radius:var(--sqr,8px);border:1.5px solid var(--th,#3b4a5c);background:#fff;color:var(--th2,#2b3a4c);box-shadow:0 2px 6px #0003;cursor:pointer}.sp-lg[hidden],.sp-view.typing .sp-lg{display:none!important}.sp-lg svg{flex:none}:root.phone .sp-lg{font-size:10px;padding:4px 7px;right:12px}:root.phone .sp-view.sp-phdock .sp-tt{display:none!important}.sp-cxn{flex:none;border-left:3px solid var(--hl,#1e6ee6);padding-left:8px;margin:0 0 8px;min-width:0}.sp-cxn i{display:block;font-style:normal;text-transform:uppercase;font-size:.7em;font-weight:700;letter-spacing:.06em;color:#6aa6ff}.sp-cxn b{display:block;font-size:.85em;color:#fff}.sp-cxn span{display:block;font-size:.75em;color:#aeb6c0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-cxt{flex:none;font-size:.8em;font-weight:700;color:#cfd6df;letter-spacing:.06em;text-transform:uppercase;margin:0 0 6px}.sp-cx .lk-ns{color:#cfd6df}.sp-cxs{flex:1;min-height:0;display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior:contain;scroll-snap-type:x proximity}.sp-cxs::-webkit-scrollbar{display:none}.sp-cxd{flex:none;width:46%;display:flex;flex-direction:column;align-items:stretch;gap:2px;padding:0;border:0;background:none;color:#fff;font:inherit;text-align:left;cursor:pointer;scroll-snap-align:start;min-height:0}.sp-cxd img{flex:0 1 auto;min-height:0;width:100%;height:auto;object-fit:contain;object-position:left top;display:block}.sp-cxd.prev img,.sp-cxd.cur img{outline:3px solid var(--hl,#1e6ee6);outline-offset:-1px;border-radius:2px}.sp-cxd.cur{cursor:default}.sp-cxd{position:relative}.sp-cxb{position:absolute;left:5px;top:5px;width:22px;height:22px;border-radius:50%;background:var(--hl,#1e6ee6);color:#fff;font:700 13px/22px system-ui,sans-serif;font-style:normal;text-align:center;box-shadow:0 1px 4px #0006;pointer-events:none}.sp-cxd b{font-size:.78em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-cxd span{font-size:.7em;color:#aeb6c0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-top{display:flex;gap:8px;align-items:center;padding:8px 10px;background:#171b21;color:#e9edf2;border-bottom:1px solid #2c343e}
.sp-tt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:var(--fb,15px)}
.sp-q{flex:0 1 230px;min-width:90px;height:32px;box-sizing:border-box;border:1px solid #3a434f;background:#0f1216;color:#e9edf2;border-radius:8px;padding:0 9px;font:inherit;font-size:var(--fb,15px)}
.sp-q:focus{outline:none;border-color:var(--th)}
.sp-nav{display:flex;align-items:center;gap:4px}.sp-nav[hidden]{display:none}.sp-nav span{font-size:var(--fb,15px);min-width:58px;text-align:center;color:#aab4c0}
.sp-top button,.sp-dl{border:1px solid #3a434f;background:#242a33;color:#e9edf2;border-radius:8px;min-width:34px;height:32px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;font-size:13px}
.sp-body{flex:1;overflow:auto;padding:8px;-webkit-overflow-scrolling:touch;touch-action:none;overscroll-behavior:contain}   /* (touch pans and pinches are handled in pdfview.js, free in every direction) */.sp-wait :is(.sp-refs,.sp-marks,.sp-tap,.sp-hi){visibility:hidden!important}.sp-sheet{position:relative;background:#fff;margin:0 auto;box-shadow:0 2px 14px #0008;transform-origin:0 0}
.sp-bg{position:absolute;inset:0;width:100%;height:100%}.sp-hi{position:absolute;left:0;top:0;width:0;height:0}
.sp-marks,.sp-tap{position:absolute;inset:0;pointer-events:none}.sp-arrow{position:absolute;fill:var(--hl,#1e6ee6);opacity:.6;overflow:visible}
.sp-marks .sp-arrow:not(.on){opacity:.3}.sp-tap .sp-arrow{opacity:.6}.sp-marks .sp-arrow:only-child{opacity:.6}   /* (with several places, the one stepped to is the stronger) */
@keyframes spPulse{0%{box-shadow:0 0 0 0 rgba(255,45,85,.7)}100%{box-shadow:0 0 0 22px rgba(255,45,85,0)}}
.sp-body.drag{cursor:grabbing}.sp-fn{min-width:0 !important;padding:0 4px;white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis}
.sp-toast{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);background:#171b21;color:#e9edf2;border:1px solid var(--th);border-radius:10px;padding:8px 12px;font-size:var(--fb,15px);max-width:90vw}.sp-toast[hidden]{display:none}
.sp-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#ddd;font-size:var(--fb,15px)}.sp-msg[hidden]{display:none}
:root.phone body.sp-on{overflow:hidden}
.sp-mode{position:absolute;left:14px;top:62px;z-index:6;display:flex;gap:3px;padding:3px;background:#fff;border:1.5px solid #dde1e6;border-radius:10px;box-shadow:0 2px 8px #0003}
.sp-mode button{width:34px;height:34px;border:0;border-radius:8px;background:none;color:#1d2430;display:grid;place-items:center;cursor:pointer;padding:0}.sp-mode button.on{background:var(--th-t,#eef1f5);box-shadow:inset 0 0 0 2px var(--th,#475569)}
:root.phone .sp-mode{display:none}.sp-mode i{width:1px;background:#dde1e6;margin:4px 2px}:root:not(.phone) .sp-dock .sp-ze{display:none!important}.sp-dock .sp-dn{display:none}.sp-dock .sp-tt{font-size:20px!important}:root:not(.phone) .sp-view .sp-nav:not(.sp-finds){display:none}
.sp-view.sp-hand .sp-body{cursor:grab}.sp-view.sp-hand .sp-body.drag{cursor:grabbing}.sp-view.sp-hand .sp-text{pointer-events:none;user-select:none;-webkit-user-select:none}
.sp-view.sp-phdock{top:var(--sp-top,0)}.sp-view.sp-phdock .sp-x{display:none!important}.sp-view.sp-phdock .sp-body{padding-top:8px!important}
.ph-spx{display:none;width:42px;height:42px;flex:none;border-radius:50%;border:1.5px solid var(--line);background:var(--card,#fff);color:var(--ink);font-size:18px;font-weight:800;align-items:center;justify-content:center}
:root.sp-open .ph-spx{display:flex}:root.sp-open .ph-sr .ph-cam,:root.sp-open .ph-sr .ph-upd{display:none!important}
.sp-back,.sp-fwd{display:none!important}   /* (no arrows in the viewer: back is the app's own) */
.sp-view.sp-dock{top:var(--sp-top,0);left:var(--sp-left,45vw);z-index:900;border-left:1px solid var(--line,#2c343e);box-shadow:-6px 0 18px #0003}
.sp-dsplit{position:absolute;left:-6px;top:0;bottom:0;width:12px;cursor:col-resize;z-index:5;touch-action:none}.sp-dsplit:hover,.splitting .sp-dsplit{background:linear-gradient(90deg,transparent 5px,var(--th,#475569) 5px,var(--th,#475569) 7px,transparent 7px)}
.sp-top button{font-size:18px;line-height:1}   /* the symbols 40% larger, the buttons the same size */
.sp-top button[hidden]{display:none}.sp-top .sp-fwd:disabled{opacity:.4;cursor:default}.sp-refs{position:absolute;inset:0;pointer-events:none}
/* tappable tags: a very light grey wash (links to other drawings a little darker), darker grey when hovered or tapped */
.sp-ref{position:absolute;pointer-events:auto;cursor:pointer;background:rgba(90,100,115,.15);border-radius:2px}
.sp-ref.d{background:rgba(90,100,115,.15)}
.sp-ref.hv,.sp-ref.hit{background:rgba(90,100,115,.28)}
.sp-hb{position:absolute;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--hl,#1e6ee6) 85%,transparent);background:color-mix(in srgb,var(--hl,#1e6ee6) 12%,transparent);border-radius:calc(var(--rbw,1.5px) * 1.3);pointer-events:none}.sp-hb.sp-hbon{border-width:1.5px;border-color:var(--hl,#1e6ee6);background:color-mix(in srgb,var(--hl,#1e6ee6) 14%,transparent);box-shadow:0 0 0 1px rgba(255,255,255,.7)}   /* the place tapped or stepped to: a stronger box, never an arrow */   /* a find result on any sheet */
.sp-ref.fit{box-sizing:border-box;border:0;background:rgba(90,100,115,.15)}.sp-finding .sp-ref.fit:not(.off){background:color-mix(in srgb,var(--hl,#1e6ee6) 12%,transparent);border:1px solid color-mix(in srgb,var(--hl,#1e6ee6) 85%,transparent)}.sp-ref.fit.o{border-radius:50%}
/* the tapped / arrived at label's own box, marked blue; a continuation drawn as its ribbon (an svg outline) */
.sp-ref.tp{background:color-mix(in srgb,var(--hl,#1e6ee6) 14%,transparent);box-shadow:inset 0 0 0 1.5px var(--hl,#1e6ee6)}
.sp-ref.rb{background:none!important;border:0!important;box-shadow:none!important}.sp-ref.rb svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.sp-ref.rb polygon{fill:rgba(90,100,115,.15);stroke:none}.sp-ref.fit.rb polygon{fill:rgba(90,100,115,.15);stroke:none}
.sp-finding .sp-ref.fit.rb:not(.off) polygon{fill:color-mix(in srgb,var(--hl,#1e6ee6) 32%,transparent);stroke:color-mix(in srgb,var(--hl,#1e6ee6) 85%,transparent);stroke-width:var(--rbw,1.5px)}.sp-ref.rb.hv polygon{fill:rgba(90,100,115,.28)}.sp-ref.fit.off.rb polygon{stroke:none;fill:rgba(90,100,115,.06)}
.sp-ref.rb.tp polygon{fill:color-mix(in srgb,var(--hl,#1e6ee6) 32%,transparent);stroke:var(--hl,#1e6ee6);stroke-width:calc(var(--rbw,1.5px) + 1px)}
.sp-ref.fit.off{border:0;background:rgba(90,100,115,.06)}.sp-ref.fit.hv{background:rgba(90,100,115,.28)}.sp-ref.fit.off.hv{background:rgba(90,100,115,.22)}   /* a checked sheet: red labels, grey when a find leaves them out */.sp-refs .sp-ref{pointer-events:none}
/* the page's text, invisible but selectable (left drag), on top of everything; a tag under it still opens on a click */
.sp-text{position:absolute;inset:0;overflow:hidden;line-height:1;text-size-adjust:none;-webkit-text-size-adjust:none;z-index:2;user-select:text;-webkit-user-select:text}
.sp-text span,.sp-text br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0 0}
.sp-text ::selection{background:color-mix(in srgb,var(--hl,#1e6ee6) 30%,transparent)}.sp-body.on-ref,.sp-body.on-ref *{cursor:pointer!important}.sp-body.drag .sp-text{cursor:grabbing}
:root.phone .sp-text{pointer-events:none;user-select:none;-webkit-user-select:none}
.sp-pick{position:absolute;z-index:5;display:flex;flex-direction:column;gap:4px;padding:6px;background:#1d222a;border:1px solid #3a434f;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.4);max-height:50vh;overflow:auto}
.sp-pick button{border:1px solid #3a434f;background:#242a33;color:#e9edf2;border-radius:8px;padding:7px 12px;font:inherit;font-size:var(--fb,15px);font-weight:700;cursor:pointer;text-align:left}
.sp-pick button:hover{border-color:var(--th)}
@media (min-width:901px) and (hover:hover){.sp-rot{display:none !important}}
@media (max-width:600px){.sp-dl,.sp-view [data-a=fit]{display:none}.sp-top{flex-wrap:wrap;gap:5px;padding:6px 8px}.sp-tt{flex-basis:100%;font-size:var(--fb,15px);order:-1}.sp-top button{min-width:30px;height:30px;padding:0 6px}.sp-nav span{min-width:0}.sp-x{margin-left:auto}}
/* phone: the sheet fills the screen; close and back float top left, the title beside them, and one floating bar at the
   bottom holds the sheets, zoom, find and turn (find opens a box just above it) */
.sp-fb{display:none !important}
:root.phone .sp-view .sp-top{position:absolute;top:auto;left:0;right:0;margin:0 auto;width:max-content;max-width:calc(100vw - 16px);bottom:calc(14px + env(safe-area-inset-bottom));
  flex-wrap:nowrap;gap:2px;padding:4px;border:1px solid #3a434f;border-radius:26px;background:#171b21f0;box-shadow:0 4px 16px #0008;z-index:3}
:root.phone .sp-view .sp-top button{min-width:40px;height:40px;border:0;background:none;border-radius:20px;font-size:21px;padding:0 6px}
:root.phone .sp-view .sp-top .sp-nav{gap:0}:root.phone .sp-view .sp-top .sp-nav+.sp-nav,:root.phone .sp-view .sp-top .sp-fb{border-left:1px solid #3a434f}
:root.phone .sp-view .sp-x,:root.phone .sp-view .sp-back,:root.phone .sp-view .sp-fwd{position:fixed;top:calc(10px + var(--sat, env(safe-area-inset-top)));left:10px;width:42px;height:42px!important;border-radius:50%!important;
  background:#171b21f0!important;border:1px solid #3a434f!important;box-shadow:0 2px 10px #0008;margin:0!important;z-index:4}
:root.phone .sp-view .sp-back{left:60px}:root.phone .sp-view .sp-fwd{left:110px}:root.phone .sp-view .sp-fwd:disabled{opacity:.45}
:root.phone .sp-view .sp-tt{position:fixed;top:calc(15px + var(--sat, env(safe-area-inset-top)));left:62px;max-width:calc(100vw - 74px);flex:none;order:0;font-size:var(--fl,13px);color:#e9edf2;background:#171b21e0;border:1px solid #3a434f;border-radius:16px;padding:6px 12px;pointer-events:none;z-index:4}
:root.phone .sp-view .sp-tt{left:162px;max-width:calc(100vw - 174px)}
:root.phone .sp-view .sp-fb{display:inline-flex!important}:root.phone .sp-view .sp-dl{display:none}
:root.phone .sp-view .sp-q{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));width:auto;max-width:none;height:42px;display:none;z-index:4;font-size:16px;box-shadow:0 4px 16px #0008}
:root.phone .sp-view.find-on .sp-q{display:block}
:root.phone .sp-view.typing .sp-ze,:root.phone .sp-view.typing .sp-top>:not(.sp-finds):not(.sp-q){display:none!important}:root.phone .sp-view.typing .sp-body{padding-top:0}   /* keyboard up: just the find box and ‹ 1 of 9 › */
.sp-view .sp-ze{position:fixed;right:22px;bottom:22px;z-index:4;width:52px;height:52px;padding:0;border-radius:50%;background:#fff;color:var(--th2);border:1.5px solid var(--th);box-shadow:0 3px 12px #0005;display:grid;place-items:center;cursor:pointer}
.sp-view .sp-ze:hover{background:var(--th-t)}   /* zoom extents: the whole sheet in one tap */
:root.phone .sp-view .sp-ze{position:static;width:40px;height:40px;border:0;border-left:1px solid #3a434f;border-radius:0 20px 20px 0;background:none;color:inherit;box-shadow:none;display:inline-grid}:root.phone .sp-view .sp-ze svg{width:20px;height:20px}
:root.phone .sp-view .sp-pg{font-size:var(--fl,13px)}
:root.phone .sp-view .sp-body{padding:calc(60px + var(--sat, env(safe-area-inset-top))) 0 0}   /* the page starts under the round buttons */
.sp-dn{position:absolute;right:3px;bottom:3px;text-align:right;line-height:1.15;max-width:calc(100% - 8px);box-sizing:border-box;z-index:2;font:700 min(24px,var(--dnf,24px))/1.2 system-ui,sans-serif;letter-spacing:.02em;color:#3b4552;background:#ffffffe6;padding:0 3px;border-radius:3px;white-space:nowrap;pointer-events:none}.sp-dn small{display:block;font-size:.8em;font-weight:600;color:#55606d;overflow:hidden;text-overflow:ellipsis}.sp-dn:empty{display:none}:root.phone .sp-dn{font-size:calc(min(20px,var(--dnf,20px)) * .5);right:1px;bottom:1px}
:root.phone .lk-st{font-size:calc(var(--fb,15px) * 1.35)}:root.phone .lk-vw sup{font-size:max(.6em, calc(var(--fl,13px) * .8))}   /* phone: these follow the text size */
:root.phone .lk-hb .lk-key.lk-dwg::after{content:"";display:inline-block;width:.8em;height:.8em;margin-left:.3em;vertical-align:-.05em;background:var(--lk-a,var(--th));-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 4h6v6'/%3E%3Cpath d='M20 4l-9 9'/%3E%3Cpath d='M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 4h6v6'/%3E%3Cpath d='M20 4l-9 9'/%3E%3Cpath d='M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'/%3E%3C/svg%3E") center/contain no-repeat}   /* a drawing's number opens it: a small open icon after it */
:root.phone .lk-hb .lk-key{white-space:nowrap;word-break:normal;overflow:hidden;color:var(--ink)!important;text-decoration:none}   /* phone: every tag the same, one line */
.lk-dwg{display:inline-block;color:#2f7cf6 !important;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.lk-dwg:hover{color:#5b9bff !important}
.lk-dwgnote{font-size:var(--fb,15px);color:var(--mute);margin:-4px 0 8px;line-height:1.4}
.lk-dwgb{color:#2f7cf6;text-decoration:none;white-space:nowrap;font-size:var(--fb,15px);font-weight:700;margin-left:4px;cursor:pointer}
.lk-d summary{list-style:none}.lk-d summary::-webkit-details-marker{display:none}.lk-d summary::before{content:"▸";display:inline-block;width:14px;color:var(--lk-a);transition:transform .15s}
.lk-d[open]>summary::before{transform:rotate(90deg)}.sp-c{font-weight:600;color:var(--mute);font-size:var(--fb,15px);margin-left:4px}
.sp-head{margin:14px 0 2px;font-size:var(--fb,15px);line-height:1.35}.sp-head b{color:var(--lk-a)}.sp-sub{font-size:var(--fb,15px);color:var(--mute);margin-bottom:2px}
.lk-head{background:var(--lk-c);border:1px solid var(--lk-l);border-radius:14px;margin-bottom:10px;overflow:hidden}
.lk-hs{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:34px;padding:5px 6px 5px 14px;background:var(--lk-c);border-bottom:1px solid var(--lk-l)}
.lk-hs .lk-kind{color:var(--lk-a)}.lk-hb{padding:8px 14px 12px}.lk-hb .lk-key{margin-top:0}
.lk-head .lk-step{margin-left:0;height:30px;flex:none}.lk-hs .lk-kind{min-width:0;overflow-wrap:anywhere}:root.phone .lk-hs .lk-kind{letter-spacing:.03em}:root.phone .lk-head .lk-st{padding:0 8px}:root.phone .lk-head .lk-sn{padding:0 6px}   /* the stepper keeps its full width; the kind wraps */
:root.phone .lk-head .lk-name{margin:0}
.lk-ocr{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);font-family:inherit;font-size:var(--fb,15px);padding:8px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  window.Lookup = L;
})();
