// Sources: every document the app is built from, one row each (every P&ID and PFD sheet on its own), filtered by a
// search and by type pills (P&IDs, PFDs, Lists, Reports, Specs, Drawings), with area pills under the drawing types.
// Each row has two kinds of button: Save puts the redacted file (PDF, or the cleaned Excel copy) in the Downloads
// folder; Cache stores it on this device (offline.js, the kcgm-docs cache) so it opens with no signal. "Cache all" does
// the same for everything the filters show, and "Save all" (desktop) puts all of it in Downloads as one zip.
// Desktop (issues.html#sources): sections on the left (one per type, each with its cached MB and a Cache all), a divider
// to drag, and on the right a selection tree as in Navisworks: section → area (P&IDs, PFDs) → document → its revision.
// Phone: pills over a list (Settings → Sources, the Settings search box filters it). SourcesList.mount(el, {phone, input}).
// Desktop upload: Upload (toolbar) or the ↑ on a document / area / section picks PDFs; a box matches each file to a
// document number and revision from its name (design 12a), then PUTs it with a small JSON note into uploads/ of REPO
// through the GitHub API with the GitHub key (Help → API keys). The ingest Action (.github/workflows/ingest.yml,
// tools/ingest_uploads.py) files it into PIDs/ or PFDs/ a few minutes later and keeps the replaced file as a
// superseded revision (the index's "revs"), which the tree lists under the latest one (view and download only).
window.SourcesList = (() => {
  const REPO = "bijankle/ProjectLibrary";   // the GitHub repository the app is served from and uploads to (one home: Help → API keys shows it)
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mb = b => { const v = (b || 0) / 1e6; return v === 0 ? "0" : v < 1 ? String(+v.toFixed(2)) : v < 10 ? String(+v.toFixed(1)) : String(Math.round(v)); };
  const TYPES = [["pid", "P&IDs"], ["pfd", "PFDs"], ["bfd", "BFDs"], ["list", "Lists"], ["report", "Reports"], ["spec", "Specs"], ["dwg", "Drawings"], ["other", "Other"]];
  const TN = Object.fromEntries(TYPES);
  // area names for the area pills: the glossary's F codes, first part only ("F13 Milling & Classification")
  const AREA = { F00: "General site", F10: "Primary crushing 1", F12: "Primary crushing", F13: "Milling", F14: "Gravity & ILR", F15: "Mt Charlotte reclaim", F16: "Rougher flotation",
    F17: "Pre-leach thickening", F18: "Cleaner flotation", F19: "Milling, existing A", F20: "Milling, area B", F21: "CIL4", F22: "CIL4 elution", F23: "Final tails", F24: "Air & water",
    F25: "Cleaners, existing", F26: "Cleaner scav., existing", F28: "UFG 2/3", F30: "CIL2/3", F34: "UFG 1", F35: "Concentrate", F65: "Conc. elution", F66: "Goldroom",
    F70: "Lime & floc", F71: "Reagents, existing", F72: "Reagents", F75: "Water, existing", F78: "Carbon regen", F81: "Air, existing", F175: "TSF" };
  const ICO = {
    xdl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/></svg><b>XLSX</b>',
    save: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v10M7.5 9.5 12 14l4.5-4.5M5 19h14"/></svg>',
    dev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M12 7v7M9.5 11.5 12 14l2.5-2.5"/></svg>',
    devOk: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M9.3 12l2 2 3.6-4"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14"/></svg>',
    // the tree's small pictures (Windows Explorer colours: they read the same in light and dark)
    fc: '<svg class="sl-ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 4.5v8h13v-6.5h-6.5l-1.5-1.5z" fill="#e8c56a" stroke="#b8902c"/></svg>',
    fo: '<svg class="sl-ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 4.5v8h11l2-5.5h-11l-2 5.5" fill="#f2d98c" stroke="#b8902c"/><path d="M1.5 12.5v-8h5l1.5 1.5h4.5v1" fill="none" stroke="#b8902c"/></svg>',
    pdf: '<svg class="sl-ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="#6b7280"/><path d="M9.5 1.5v3h3" fill="none" stroke="#6b7280"/><rect x="4.5" y="9" width="7" height="3.5" rx=".5" fill="#d64545"/></svg>',
    xls: '<svg class="sl-ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="#6b7280"/><path d="M9.5 1.5v3h3" fill="none" stroke="#6b7280"/><rect x="4.5" y="9" width="7" height="3.5" rx=".5" fill="#1f8a4c"/></svg>',
    lock: '<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true"><rect x="1.5" y="5" width="9" height="6.5" rx="1.2" fill="currentColor"/><path d="M3.6 5V3.6a2.4 2.4 0 0 1 4.8 0V5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    rev: '<svg class="sl-ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="#fff" stroke="#6b7280"/><path d="M8 5v3.2l2 1.3" fill="none" stroke="#6b7280" stroke-width="1.3"/></svg>' };
  const MEM = { open: null, sel: "" };   // the desktop tree's open nodes and selected document, kept while the page is open

  // ---------- the documents ----------
  let DOCS = null, IDX = {};   // IDX: the drawing index (PIDs/index.json "pids"), what an upload can go to
  async function load(){
    if (DOCS) return DOCS;
    const j = u => fetch(u).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const [P, six, iss] = await Promise.all([j("PIDs/index.json"), j("sources/index.json"), j("issues.json")]); IDX = P.pids || {};
    if (window.Offline) await Offline.load().catch(() => {});
    const off = (window.Offline && Offline.load && await Offline.load().catch(() => null)) || { groups: [], sz: {} };
    const grp = id => (off.groups || []).find(g => g.id === id);
    const out = [], meta = (iss.meta && iss.meta.docs) || {};
    // a drawing that is also a source document (the PDC, the plant layout) joins that document's row
    const JOIN = { "2000-F00-DCR-PR-10002": "pdc", "2000-F00-DRG-GE-20001": "layout" };
    Object.entries(P.pids || {}).forEach(([k, d]) => { if (JOIN[k]) return;
      const t = /-PID-/.test(k) ? "pid" : /-PFD-/.test(k) ? "pfd" : /-BLK-/.test(k) ? "bfd" : "dwg", area = k.split("-")[1];
      out.push({ k, t, number: k, title: d.title || "", rev: d.rev || "", date: d.date || "", area, pdf: d.file, size: d.size, keep: [d.file].concat(Object.keys(off.sz || {}).filter(f => f.startsWith(d.file + ".p"))), tsf: !!d.proj_src, ik: k, revs: d.revs || [] }); });   // (with its sheet pictures)
    const KIND = { List: "list", Report: "report", Specification: "spec", Drawing: "dwg", Reference: "other" };
    Object.entries(meta).forEach(([k, v]) => {
      const s = six[k], g = grp("src-" + k), pdfK = Object.keys(JOIN).find(n => JOIN[n] === k), pd = pdfK && P.pids && P.pids[pdfK];
      const keep = (g ? g.files : []).concat(pd ? [pd.file] : []);
      out.push({ k, t: k === "pfd" ? "pfd" : KIND[v.kind] || "other", number: v.number, title: v.full || v.title, rev: v.rev || "", date: v.date || "", info: v,
        xlsx: s && s.xlsx, xname: s && s.fname, tables: !!s, pdf: pd && pd.file, size: keep.reduce((t, f) => t + (off.sz[f] || 0), 0) || (s && s.size), keep, ik: pd ? pdfK : "", revs: (pd && pd.revs) || [] }); });
    const sp = grp("spec");
    out.push({ k: "spec", t: "spec", number: "2000-F00-STS-PP-10001", title: "Piping and Valve Specification", rev: "3", pdf: "spec/pvs.pdf", size: sp ? sp.size : 0, keep: ["spec/pvs.pdf"] });
    const ORD = new Intl.Collator(undefined, { numeric: true });
    out.sort((a, b) => TYPES.findIndex(x => x[0] === a.t) - TYPES.findIndex(x => x[0] === b.t) || ORD.compare(a.number, b.number));
    out.forEach(d => d.hay = [d.number, d.number.replace(/^2000-/, ""), d.title, TN[d.t], d.area, AREA[d.area] || "", d.rev ? "rev " + d.rev : ""].join(" ").toLowerCase());
    return (DOCS = out);
  }

  // a zip with the files stored as they are (PDFs are already packed): [[name, bytes]] → Blob
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = u => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files){
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    const hd = (n, f) => { const b = new DataView(new ArrayBuffer(n)); f(b); return new Uint8Array(b.buffer); };
    files.forEach(([name, data]) => { const nm = enc.encode(name), c = crc(data), L = data.length;
      const loc = hd(30, v => { v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint32(14, c, true); v.setUint32(18, L, true); v.setUint32(22, L, true); v.setUint16(26, nm.length, true); });
      cen.push(hd(46, v => { v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x800, true); v.setUint32(16, c, true); v.setUint32(20, L, true); v.setUint32(24, L, true); v.setUint16(28, nm.length, true); v.setUint32(42, off, true); }), nm);
      parts.push(loc, nm, data); off += 30 + nm.length + L; });
    const cs = cen.reduce((t, u) => t + u.length, 0);
    const end = hd(22, v => { v.setUint32(0, 0x06054b50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true); v.setUint32(12, cs, true); v.setUint32(16, off, true); });
    return new Blob([...parts, ...cen, end], { type: "application/zip" }); }

  // ---------- one list on the page ----------
  function mount(el, o = {}){
    const phone = !!o.phone;
    let type = "", area = "", q = "", st = {}, busyRow = null, stop = { x: false };
    try { const v = JSON.parse(localStorage.getItem("kcgm_srcf") || "{}"); type = v.t || ""; area = v.a || ""; } catch (e) {}
    const keepF = () => { try { localStorage.setItem("kcgm_srcf", JSON.stringify({ t: type, a: area })); } catch (e) {} };
    el.classList.add("sl", phone ? "sl-ph" : "sl-dt");
    el.innerHTML = phone ? `<div class="sl-types sl-pills"></div><div class="sl-areas sl-pills"></div><div class="sl-bar"></div><div class="sl-list"></div>`
      : `<aside class="sl-side"><input type="search" class="sl-q" placeholder="Search sources" aria-label="Search sources" autocomplete="off">
           <div class="sl-h">Everything</div><div class="sl-ev"></div><div class="sl-h">Sections</div><div class="sl-secs"></div></aside>
         <div class="sl-dv" role="separator" aria-orientation="vertical" title="Drag to resize, double click to reset"><i><b></b><b></b><b></b></i></div>
         <div class="sl-main"><div class="sl-tbar"><b>Selection tree</b><span class="sl-tabs" role="tablist"><button type="button" class="on" data-tab="att">Attached</button><button type="button" data-tab="ref">Ref Only</button></span><span class="sl-sp"></span><button type="button" class="sl-tbb sl-roc" hidden title="Download every document, in the app and Ref Only, as one Excel table" aria-label="Download Excel">${ICO.xdl}</button><button type="button" class="sl-tbb sl-upb" data-up="">${ICO.up}Upload</button><input type="file" class="sl-file" accept="application/pdf,.pdf" multiple hidden></div>
           <div class="sl-tree"><div class="sl-gh"><span><button type="button" class="sl-xa" data-x="1" title="Expand all" aria-label="Expand all"></button>Name</span><span>Title</span><span>Rev</span><span>Size</span><span>Cached</span><span></span></div><div class="sl-rows"></div></div><div class="sl-ro" hidden><div class="sl-rop"></div><div class="sl-rot"></div></div></div>`;
    const $ = s => el.querySelector(s);
    const input = o.input || $(".sl-q");
    if (input){ input.addEventListener("input", () => { q = input.value.trim().toLowerCase(); shut.clear(); draw(); }); }
    $(phone ? ".sl-list" : ".sl-rows").innerHTML = `<div class="sl-none">Loading…</div>`;
    // desktop: the section shown (a type, "" for all; it reuses the phone's type filter), the tree's open nodes
    // ("r:pid" a section, "a:pid:F13" an area, "d:<key>" a document), and the groups closed by hand while searching
    // (a search opens every group with a match)
    const open = MEM.open || (MEM.open = new Set()), shut = new Set();
    if (!phone){ area = ""; type = "";   // (desktop opens on All sources, in the Attached tab)
      if (!MEM.open.size && type) open.add("r:" + type); }
    const words = () => q.split(/\s+/).filter(Boolean);
    const match = d => { const w = words(); return w.every(x => d.hay.includes(x)); };
    const subOf = t => t === "pid" || t === "pfd";
    function shown(){ return DOCS.filter(d => match(d) && (!type || d.t === type) && (!area || d.area === area)); }
    const stOf = d => { const s = d.keep.map(f => st[f]); return !s.length ? "none" : s.every(x => x === "ok") ? "ok" : s.some(x => x === "old") ? "old" : s.some(x => x === "ok") ? "part" : "no"; };
    const fname = d => (d.number + (d.rev ? " Rev " + d.rev : "") + (d.title && d.t !== "list" ? " " + d.title : "")).replace(/[\\/:*?"<>|]+/g, " ").trim();
    // Save: a plain link with the file's tidy name (kind "x" the Excel copy, else the PDF); cls/inner make the tree's small one
    const saveBtn = (d, kind, cls = "sl-b", inner) => { const href = kind === "x" ? d.xlsx : d.pdf; if (!href) return phone ? "" : `<span class="sl-b sl-b0"></span>`;
      const name = kind === "x" ? d.xname || fname(d) + ".xlsx" : fname(d) + ".pdf", lab = kind === "x" ? "Excel" : "PDF";
      return `<a class="${cls} sl-sv${kind === "x" ? " sl-x" : ""}" href="${esc(href)}" download="${esc(name)}" title="Save the ${lab} to Downloads">${ICO.save}${inner != null ? inner : `<span>${lab}</span>`}</a>`; };
    const keepBtn = d => { const s = stOf(d);
      if (!d.keep.length) return `<span class="sl-b sl-b0"></span>`;
      const lab = s === "ok" ? "Cached" : s === "old" ? "Update" : "Cache";
      return `<button type="button" class="sl-b sl-kp ${s}" data-k="${esc(d.k)}" title="${s === "ok" ? "Cached on this device. Tap to remove" : "Cache on this device to open with no signal"}">${s === "ok" ? ICO.devOk : ICO.dev}<span>${lab}</span></button>`; };
    function pills(){
      const base = DOCS.filter(match), cnt = {}; base.forEach(d => cnt[d.t] = (cnt[d.t] || 0) + 1);
      const tp = [["", "All", base.length], ...TYPES.filter(([k]) => cnt[k]).map(([k, n]) => [k, n, cnt[k]])];
      $(".sl-types").innerHTML = tp.map(([k, n, c]) => phone ? `<button type="button" class="sl-p${type === k ? " on" : ""}" data-t="${k}">${esc(n)}<i>${c}</i></button>`
        : `<button type="button" class="sl-p${type === k ? " on" : ""}" data-t="${k}">${esc(n)}<i>${c}</i></button>`).join("");
      const ab = base.filter(d => d.t === type), ac = {}; ab.forEach(d => ac[d.area] = (ac[d.area] || 0) + 1);
      const areas = subOf(type) ? Object.keys(ac).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))) : [];
      if (area && !ac[area]) area = "";
      const ae = $(".sl-areas"); ae.hidden = !areas.length; if (!phone) $(".sl-ah").hidden = !areas.length;
      ae.innerHTML = areas.length ? (phone ? `<button type="button" class="sl-p sl-ps${area ? "" : " on"}" data-a="">All areas</button>` : "") +
        areas.map(a => phone ? `<button type="button" class="sl-p sl-ps${area === a ? " on" : ""}" data-a="${a}">${a} ${esc(AREA[a] || "")}<i>${ac[a]}</i></button>`
          : `<button type="button" class="sl-p${area === a ? " on" : ""}" data-a="${a}">${a} ${esc(AREA[a] || "")}<i>${ac[a]}</i></button>`).join("") : "";
      el.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { type = type === b.dataset.t ? "" : b.dataset.t; area = ""; keepF(); draw(); });
      el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => { area = area === b.dataset.a ? "" : b.dataset.a; keepF(); draw(); });
    }
    let list = [];
    let redraw = false;   // (a redraw asked for while a download runs waits for it: it would wipe the running row)
    function draw(){ if (busyRow){ redraw = true; return; } redraw = false;
      if (!DOCS) return; if (!phone){ if (tab === "ref") roDraw(); return drawDt(); } pills(); list = shown();
      const need = list.filter(d => stOf(d) !== "ok" && stOf(d) !== "none");
      $(".sl-bar").innerHTML = `<span class="sl-n">Results <b>${list.length}</b></span>` +
        (list.length ? need.length ? `<button type="button" class="sl-all">Cache all ${need.length}</button>` : `<span class="sl-allok">${ICO.devOk} All cached</span>` : "") + `<i class="sl-pg"><i></i></i>`;
      const rows = list.slice(0, 400);
      $(".sl-list").innerHTML = rows.map(d => `<div class="sl-r" data-r="${esc(d.k)}"><div class="sl-t"><b>${esc(d.number.replace(/^2000-/, ""))}</b><span>${esc([d.title, d.rev ? "Rev " + d.rev : "", d.size ? mb(d.size) + " MB" : ""].filter(Boolean).join(" · "))}</span></div>${saveBtn(d, d.t === "list" || !d.pdf ? "x" : "p")}${keepBtn(d)}<i class="sl-rb"><i></i></i></div>`).join("") +
        (list.length > rows.length ? `<div class="sl-none">${list.length - rows.length} more: search to narrow</div>` : !list.length ? `<div class="sl-none">Nothing matches.</div>` : "");
      wire();
    }
    let OFF = null;
    function wire(){   // (phone; the desktop listens once on el, below)
      el.querySelectorAll(".sl-kp").forEach(b => b.onclick = e => { e.stopPropagation(); const d = DOCS.find(x => x.k === b.dataset.k); if (!d) return;
        if (busyRow && busyRow === b.closest("[data-r]")){ stop.x = true; return; }
        if (!busyRow && stOf(d) === "ok"){ if (confirm(`Remove ${d.number} from this device?`)) Offline.drop(d.keep).then(refresh); return; }
        if (busyRow && stOf(d) === "ok") return;
        run([d], b.closest("[data-r]"), d.k); });
      const all = $(".sl-all"); if (all) all.onclick = () => { if (busyRow === el){ stop.x = true; return; } run(list.filter(d => stOf(d) !== "ok"), null, "all"); };
      paintQ();
      el.querySelectorAll(".sl-sv").forEach(a => a.addEventListener("click", e => e.stopPropagation()));
      el.querySelectorAll(".sl-r").forEach(x => x.onclick = () => openDoc(DOCS.find(d => d.k === x.dataset.r)));
    }

    // ---------- desktop: sections on the left, the selection tree on the right ----------
    // a download runs under an id ("s:pid" a section, "a:pid:F13" an area, "d:<key>" a document, "v:<key>" its revision
    // row) rather than a row: the tree redraws freely while it runs (open, close, select) and paintBusy puts the progress
    // back on the redrawn row, so a redraw never wipes it
    let busy = null;
    const sz = f => (OFF && OFF.sz[f]) || 0;
    const mbOf = ds => { const f = [...new Set(ds.flatMap(d => d.keep))]; return [f.filter(x => st[x] === "ok").reduce((t, x) => t + sz(x), 0), f.reduce((t, x) => t + sz(x), 0)]; };
    const allOk = ds => ds.every(d => !d.keep.length || stOf(d) === "ok");
    const ofT = (ds, t) => t ? ds.filter(d => d.t === t) : ds;
    const aKey = d => d.area || "–";
    const byArea = ds => { const m = {}; ds.forEach(d => (m[aKey(d)] = m[aKey(d)] || []).push(d));
      return Object.keys(m).sort((a, b) => (a === "–" ? 1e9 : parseInt(a.slice(1))) - (b === "–" ? 1e9 : parseInt(b.slice(1)))).map(a => [a, m[a]]); };
    // a group's documents: a section's every one (its MB line counts them all), a tree group's those the search shows
    function grpDocs(id){ const [w, t, a] = id.split(":"), ds = ofT(w === "s" ? DOCS : DOCS.filter(match), t); return w === "a" ? ds.filter(d => aKey(d) === a) : ds; }
    const isOpen = id => q && id[0] !== "d" ? !shut.has(id) : open.has(id);
    function toggle(id){ const s = q && id[0] !== "d" ? shut : open; s.has(id) ? s.delete(id) : s.add(id); draw(); }
    // the groups the tree shows now (for Expand all / Collapse all)
    const groups = () => { const hit = DOCS.filter(match); return TYPES.map(x => x[0]).flatMap(t => { const ds = ofT(hit, t); if (!ds.length) return [];
      return ["r:" + t].concat(subOf(t) ? byArea(ds).map(([a]) => `a:${t}:${a}`) : []); }); };
    // Cache all for a group: the section's square button, or the tree's small one; green once all of it is cached
    const caBtn = (id, ds, big) => { if (!ds.some(d => d.keep.length)) return big ? `<span class="sl-b sl-b0"></span>` : "";
      const ok = allOk(ds); return `<button type="button" class="${big ? "sl-b" : "sl-ib"} sl-kp${ok ? " ok" : ""}" data-ca="${esc(id)}" title="${ok ? "All cached on this device" : "Cache all of these on this device"}">${ok ? ICO.devOk : ICO.dev}${big ? `<span>${ok ? "Cached" : id === "s:" ? "Cache all" : "Cache"}</span>` : ""}</button>`; };
    function secRow(id, name, ds, n){ const [h, t] = mbOf(ds);
      return `<div class="sl-sec${id === "s:" + type ? " on" : ""}${q && !n ? " sl-z" : ""}" data-id="${esc(id)}" role="button" tabindex="0"><div class="sl-st"><b>${esc(name)}</b><small>${q ? `${n} of ${ds.length} match` : `${ds.length} document${ds.length === 1 ? "" : "s"}`} · <span class="sl-pt">${mb(h)} of ${mb(t)} MB</span></small><i class="sl-pb"><i style="width:${t ? (h / t * 100).toFixed(1) : 0}%"></i></i></div>${caBtn(id, ds, true)}</div>`; }
    function drawDt(){
      const hit = DOCS.filter(match); list = ofT(hit, type);
      $(".sl-secs").innerHTML = TYPES.filter(([k]) => DOCS.some(d => d.t === k)).map(([k, n]) => secRow("s:" + k, n, ofT(DOCS, k), ofT(hit, k).length)).join("");
      $(".sl-ev").innerHTML = secRow("s:", "All sources", DOCS, hit.length);
      const what = type ? TN[type] : "documents";
      // the tree, Explorer style: dotted guides (one per level, a line on when that level's branch goes on), +/− boxes;
      // only open nodes are drawn, so a few hundred rows at most
      const H = [], tail = `<i class="sl-rb"><i></i></i>`;
      const gd = (pre, lv, last) => pre.map(c => `<span class="sl-g${c ? " sl-gv" : ""}"></span>`).join("") + (lv ? `<span class="sl-g sl-gt${last ? " sl-gl" : ""}"></span>` : "");
      const tg = o => `<span class="sl-tg">${o ? "−" : "+"}</span>`;
      // ↑ upload into a document / area / section (only what the drawing index holds); a lock while there's no GitHub key
      const upB = (id, ds) => ds.some(d => d.ik) ? upBtn(id, "sl-ib") : "";
      const okIco = s => s === "ok" ? `<span class="sl-ok" title="Cached on this device">${ICO.devOk}</span>` : s === "old" ? `<span class="sl-ok old" title="An older copy is cached: cache it again to update">${ICO.devOk}</span>`
        : s === "part" ? `<span class="sl-ok part" title="Partly cached">${ICO.dev}</span>` : "";
      const kp = (d, s) => d.keep.length ? `<button type="button" class="sl-ib sl-kp ${s}" title="${s === "ok" ? "Cached on this device. Click to remove" : s === "old" ? "Update the cached copy" : "Cache on this device to open with no signal"}">${s === "ok" ? ICO.devOk : ICO.dev}</button>` : "";
      const acts = (d, s, up) => (up ? upB("d:" + d.k, [d]) : "") + `<span class="sl-dl">${(d.pdf ? saveBtn(d, "p", "sl-ib", "") : "") + (d.xlsx ? saveBtn(d, "x", "sl-ib", "") : "")}</span>` + kp(d, s);
      // ↓ a folder's files in Downloads as one zip
      const zpBtn = (id, ds, label) => ds.some(d => d.pdf || d.xlsx) ? `<button type="button" class="sl-ib sl-zp" data-zp="${esc(id)}" data-zn="${esc(label)}" title="Download these ${ds.length} as one zip">${ICO.save}</button>` : "";
      const grp = (id, lv, pre, last, label, ds, kids) => { const o = isOpen(id);
        H.push(`<div class="sl-tr sl-grp" data-id="${esc(id)}"><span class="sl-nm">${gd(pre, lv, last)}${tg(o)}${o ? ICO.fo : ICO.fc}<span class="sl-l">${esc(label)}<em>(${ds.length})</em></span></span><span></span><span></span><span></span>` +
          `<span class="sl-c sl-pt">${ds.filter(d => stOf(d) === "ok").length} of ${ds.length}</span><span class="sl-acts">${upB(id, ds)}${zpBtn(id, ds, label)}${caBtn(id, ds)}</span>${tail}</div>`);
        if (o) kids(lv ? pre.concat(!last) : pre); };
      const doc = (d, lv, pre, last) => { const id = "d:" + d.k, o = isOpen(id), s = stOf(d), v = d.info || {}, sel = x => MEM.sel === x ? " sel" : "";
        const tip = [v.kind, v.status, v.used && "Used for " + v.used, v.note].filter(Boolean).concat("Click to open").join("\n");
        H.push(`<div class="sl-tr sl-doc${sel(id)}" data-id="${esc(id)}" data-r="${esc(d.k)}"><span class="sl-nm">${gd(pre, lv, last)}${tg(o)}${d.pdf ? ICO.pdf : ICO.xls}<span class="sl-l">${esc(d.number + (d.rev ? "_Rev" + d.rev : ""))}</span></span>` +
          `<span class="sl-c"><button type="button" class="sl-op" title="${esc(tip)}">${esc(d.title)}</button></span><span class="sl-c">${d.rev ? "Rev " + esc(d.rev) : ""}</span><span class="sl-c">${d.size ? mb(d.size) + " MB" : ""}</span>` +
          `<span class="sl-c sl-pt">${okIco(s)}</span><span class="sl-acts">${acts(d, s, 1)}</span>${tail}</div>`);
        // its revisions: the latest, then the ones it superseded (uploads keep them: the index's "revs", oldest first),
        // newest first; an old one can be viewed and saved, not cached (the app works from the latest)
        if (!o) return; const old = d.revs.slice().reverse(), p2 = pre.concat(!last);
        H.push(`<div class="sl-tr sl-rv${sel("v:" + d.k)}" data-id="v:${esc(d.k)}" data-r="${esc(d.k)}"><span class="sl-nm">${gd(p2, lv + 1, !old.length)}<span class="sl-tg0"></span>${ICO.rev}<span class="sl-l">Rev ${esc(d.rev || "–")}${d.date ? " · " + esc(d.date) : ""}<u>latest</u></span></span>` +
          `<span class="sl-c">${esc(v.status || "")}</span><span></span><span class="sl-c">${d.size ? mb(d.size) + " MB" : ""}</span><span class="sl-c sl-pt">${okIco(s)}</span><span class="sl-acts">${acts(d, s)}</span>${tail}</div>`);
        old.forEach((r, i) => { const id = `o:${d.k}:${r.rev}`, nm = (d.number + " Rev " + r.rev + (d.title ? " " + d.title : "")).replace(/[\\/:*?"<>|]+/g, " ").trim() + ".pdf";
          H.push(`<div class="sl-tr sl-rv sl-old${sel(id)}" data-id="${esc(id)}" data-r="${esc(d.k)}" data-pdf="${esc(r.file)}"><span class="sl-nm">${gd(p2, lv + 1, i === old.length - 1)}<span class="sl-tg0"></span>${ICO.rev}<span class="sl-l">Rev ${esc(r.rev || "–")}${r.date ? " · " + esc(r.date) : ""}<u class="sl-sup">superseded</u></span></span>` +
            `<span></span><span></span><span class="sl-c">${r.size ? mb(r.size) + " MB" : ""}</span><span></span><span class="sl-acts"><button type="button" class="sl-ib sl-vw" title="View Rev ${esc(r.rev)}">${ICO.eye}</button><a class="sl-ib sl-sv" href="${esc(r.file)}" download="${esc(nm)}" title="Save Rev ${esc(r.rev)} to Downloads">${ICO.save}</a></span>${tail}</div>`); }); };
      TYPES.map(x => x[0]).forEach(t => { const ds = ofT(hit, t); if (!ds.length) return;
        grp("r:" + t, 0, [], true, TN[t], ds, pre => subOf(t)
          ? byArea(ds).forEach(([a, as], i, A) => grp(`a:${t}:${a}`, 1, pre, i === A.length - 1, a === "–" ? "Other" : `${a} ${AREA[a] || ""}`.trim(), as, p2 => as.forEach((d, j) => doc(d, 2, p2, j === as.length - 1))))
          : ds.forEach((d, j) => doc(d, 1, pre, j === ds.length - 1))); });
      $(".sl-rows").innerHTML = H.join("") || `<div class="sl-none">${q ? `Nothing matches${type && hit.length ? ` in ${esc(TN[type])}; ${hit.length} in All sources` : ""}.` : "Nothing here."}</div>`;
      paintBusy(); paintQ();
      const xa = $(".sl-xa"), any = groups().some(isOpen), tt = any ? "Collapse all" : "Expand all";
      xa.dataset.x = any ? "0" : "1"; xa.title = tt; xa.setAttribute("aria-label", tt);
      xa.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3.5" width="12" height="12" rx="1.5"/><path d="M5 7.5v12h12"/><path d="${any ? "M11 9.5h6" : "M11 9.5h6M14 6.5v6"}"/></svg>`;
    }
    function paintBusy(){ const r = busy && el.querySelector(`[data-id="${CSS.escape(busy.id)}"]`); if (!r) return;
      const v = busy.have + busy.f * (busy.total - busy.have), kb = r.querySelector(".sl-kp"), l = r.querySelector(".sl-pt"), bar = r.querySelector(".sl-rb i,.sl-pb i");
      r.classList.add("sl-on"); if (kb && !kb.dataset.stop){ kb.dataset.stop = 1; kb.title = "Stop"; kb.innerHTML = ICO.stop + (kb.classList.contains("sl-b") ? "<span>Stop</span>" : ""); }
      if (l) l.textContent = `${mb(v)} ${r.classList.contains("sl-sec") ? "of" : "/"} ${mb(busy.total)} MB`;
      if (bar) bar.style.width = (v / (busy.total || 1) * 100).toFixed(1) + "%"; }
    if (!phone){
      el.addEventListener("click", e => { const t = e.target; if (!DOCS || t.closest(".sl-sv")) return;   // (a Save link downloads by itself)
        const x = t.closest("[data-x]");
        if (x){ const g = groups(); if (x.dataset.x === "1"){ g.forEach(id => open.add(id)); shut.clear(); }
          else { open.clear(); if (q) g.forEach(id => id[0] === "a" && shut.add(id)); } return draw(); }
        const tb = t.closest("[data-tab]"); if (tb) return setTab(tb.dataset.tab);
        const rp = t.closest("[data-rg]"); if (rp){ roG = rp.dataset.rg; return roDraw(); }
        if (t.closest(".sl-roc")) return roXlsx();
        const om = t.closest("[data-om]"); if (om) return openDoc(DOCS.find(d => d.number === om.dataset.om || d.ik === om.dataset.om));
        const ub = t.closest(".sl-upb"); if (ub) return pickUp(ub.dataset.up);
        const zb = t.closest("[data-zp]"); if (zb) return saveAll(grpDocs(zb.dataset.zp), zb, zb.dataset.zn);
        const r = t.closest("[data-id]"); if (!r) return;
        if (t.closest(".sl-vw")) return window.open(r.dataset.pdf, "_blank", "noopener");
        const kb = t.closest(".sl-kp");
        if (kb){ if (busy && busy.id === r.dataset.id){ stop.x = true; return; }
          if (kb.dataset.ca){ const ds = grpDocs(kb.dataset.ca); if (!allOk(ds)) run(ds, r, r.dataset.id); return; }   // (all of it: the ones cached are skipped, the MB count on from them)
          const d = DOCS.find(x => x.k === r.dataset.r); if (!d) return;
          if (stOf(d) === "ok"){ if (!busy && confirm(`Remove ${d.number} from this device?`)) Offline.drop(d.keep).then(refresh); return; }
          return run([d], r, r.dataset.id); }
        if (r.classList.contains("sl-sec")){ type = r.dataset.id.slice(2);   // (every section stays in the tree, folded but for the one picked)
          [...open].forEach(id => id.startsWith("r:") && open.delete(id)); if (type) open.add("r:" + type);
          $(".sl-tree").scrollTop = 0; return draw(); }
        if (t.closest(".sl-op")) return openDoc(DOCS.find(x => x.k === r.dataset.r));
        if (t.closest(".sl-tg") || r.classList.contains("sl-grp")) return toggle(r.dataset.id);
        if (r.dataset.r){ MEM.sel = r.dataset.id; el.querySelectorAll(".sl-tr.sel").forEach(x => x.classList.remove("sel")); r.classList.add("sel"); } });
      el.addEventListener("dblclick", e => { const r = e.target.closest(".sl-tr[data-r]"); if (r && !e.target.closest(".sl-acts,.sl-tg,.sl-op")) r.dataset.pdf ? window.open(r.dataset.pdf, "_blank", "noopener") : openDoc(DOCS.find(x => x.k === r.dataset.r)); });
      // upload: the picker remembers where it was opened from (a document, area or section) for the box's guesses
      let upAt = ""; const fi = $(".sl-file");
      const pickUp = at => { if (!ghKey()) return needKey(); upAt = at; fi.value = ""; fi.click(); };
      fi.onchange = () => { const fs = [...fi.files].filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf"); fi.value = "";
        if (fs.length) upload(fs, upAt, DOCS); else if (fi.files.length) alert("Only PDF files can be uploaded."); };
      const relock = () => { const lk = !ghKey(); el.querySelectorAll(".sl-tbar .sl-upb").forEach(b => setLock(b, lk)); draw(); };
      addEventListener("kcgm-keys", relock); addEventListener("storage", e => { if (e.key === "kcgm_ghkey") relock(); }); relock();
      el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.classList.contains("sl-sec")) e.target.click(); });
      // the divider: drag to share the width (the side 260px to half), double click for the default
      const dv = $(".sl-dv"), side = $(".sl-side"), DEF = 330;
      const setW = (w, lim) => { if (lim) w = Math.max(260, Math.min(Math.max(260, el.clientWidth * .5), w)); el.style.setProperty("--slw", Math.round(w) + "px"); };
      try { const w = +localStorage.getItem("kcgm_srcw"); if (w) setW(w); } catch (e) {}   // (CSS keeps it in bounds: the pane may still be hidden)
      let x0 = 0, w0 = 0, on = false;
      dv.addEventListener("pointerdown", e => { on = true; x0 = e.clientX; w0 = side.getBoundingClientRect().width; dv.setPointerCapture(e.pointerId); dv.classList.add("drag"); document.body.classList.add("splitting"); e.preventDefault(); });
      dv.addEventListener("pointermove", e => { if (on) setW(w0 + e.clientX - x0, true); });
      const end = () => { if (!on) return; on = false; dv.classList.remove("drag"); document.body.classList.remove("splitting");
        try { localStorage.setItem("kcgm_srcw", Math.round(side.getBoundingClientRect().width)); } catch (e) {} };
      dv.addEventListener("pointerup", end); dv.addEventListener("pointercancel", end);
      dv.addEventListener("dblclick", () => { setW(DEF); try { localStorage.removeItem("kcgm_srcw"); } catch (e) {} });
    }
    // ---------- Ref Only (desktop): documents the drawings and lists mention that aren't in the library (refonly.json,
    // tools/build_refonly.py), grouped by family; titles from the project document register, else as printed ----------
    let tab = "att", RO = null, HELD = {}, roG = "";
    const ROG = [["", "All"], ["project", "Project 2000"], ["vendor", "Vendor"], ["legacy", "Legacy KCGM"], ["other", "Other"]];
    async function setTab(v){ tab = v; el.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === v));
      $(".sl-tree").hidden = v === "ref"; $(".sl-ro").hidden = v !== "ref"; $(".sl-roc").hidden = v !== "ref";
      el.querySelectorAll(".sl-tbar .sl-upb").forEach(b => b.hidden = v === "ref");
      if (v === "ref" && !RO){ $(".sl-rot").innerHTML = `<div class="sl-none">Loading…</div>`; const j = await fetch("refonly.json").then(r => r.ok ? r.json() : {}).catch(() => ({})); RO = j.ref || []; HELD = j.held || {}; }
      if (v === "ref") roDraw(); }
    const roList = () => RO.filter(o => (!roG || o.g === roG) && (!q || (o.n + " " + o.n.replace(/^2000-/, "") + " " + o.t + " " + Object.keys(o.in).join(" ")).toLowerCase().includes(q)));
    function roDraw(){ if (!RO) return; const L = roList(), lk = !ghKey();
      $(".sl-rop").innerHTML = ROG.map(([g, n]) => { const c = g ? RO.filter(o => o.g === g).length : RO.length; return c ? `<button type="button" class="sl-p${roG === g ? " on" : ""}" data-rg="${g}">${n}<i>${c}</i></button>` : ""; }).join("");
      const ins = o => { const k = Object.entries(o.in).sort((a, b) => b[1] - a[1]), sh = n => esc(n.replace(/^2000-/, ""));
        return k.slice(0, 2).map(([n]) => `<a href="#" data-om="${esc(n)}" title="Open ${esc(n)}">${sh(n)}</a>`).join(", ") + (k.length > 2 ? ` <span class="sl-mu" title="${esc(k.slice(2).map(x => x[0]).join(", "))}">+${k.length - 2} more</span>` : ""); };
      $(".sl-rot").innerHTML = `<table class="sl-rtb"><thead><tr><th>Doc number</th><th>Title</th><th>Mentioned in</th><th class="sl-rn">Times mentioned</th><th class="nosort"></th></tr></thead><tbody>` +
        L.map(o => `<tr><td class="sl-rk">${o.url ? `<a class="sl-spn" href="${esc(o.url)}" target="_blank" rel="noopener" title="Open in SharePoint">${esc(o.n)}</a>` : esc(o.n)}</td><td>${o.t ? esc(o.t) + (o.ts === "drw" ? ` <span class="sl-mu">(as printed)</span>` : "") : `<span class="sl-mu">Not in register</span>`}</td><td>${ins(o)}</td><td class="sl-rn" title="${o.xr} mentions in all">${o.x}</td>` +
          `<td class="sl-ra"><button type="button" class="sl-ib sl-upb" data-up="n:${esc(o.n)}" title="Upload ${esc(o.n)}">${ICO.up}</button></td></tr>`).join("") + `</tbody></table>` +
        (L.length ? "" : `<div class="sl-none">Nothing matches.</div>`);
      el.querySelectorAll(".sl-rot .sl-upb").forEach(b => setLock(b, lk)); const tb = $(".sl-rtb"); if (tb && window.TSort) TSort.keep(tb, "refonly"); }
    // the Excel download: the rows as shown (pill, search and sort), one tidy table with columns to sort and filter by,
    // the doc number a link to its SharePoint copy; a second sheet counts them by family and type
    const DT = { DRG: "Drawing", SCM: "Schematic", SLD: "Single line diagram", TER: "Termination diagram", TLD: "Three line diagram", STD: "Standard drawing", LST: "List", PID: "P&ID", STS: "Specification", DSH: "Datasheet", REP: "Report", BLK: "Block diagram", TQY: "Technical query", PFD: "PFD", SKT: "Sketch", SOW: "Scope of work", PHL: "Philosophy", DCR: "Design criteria", CAL: "Calculation", GAD: "General arrangement", LAY: "Layout" };
    const DI = { EL: "Electrical", PP: "Piping", IC: "Instrumentation & control", ME: "Mechanical", PR: "Process", GE: "General", CV: "Civil", ST: "Structural", CC: "Concrete", PM: "Project management" };
    const FAM = Object.fromEntries(ROG);
    function roXlsx(){ if (!RO || !window.XLSX) return;
      const part = (n, g) => { const s = n.split("-"); return g === "project" ? { area: s[1], code: s[2], disc: s[3], pkg: "" } : g === "vendor" ? { area: "", code: s[2] || "", disc: "", pkg: s[1] || "" } : { area: "", code: "", disc: "", pkg: "" }; };
      const fold = u => { try { const m = decodeURIComponent(u || "").match(/KCGM Controlled Library\/(.*)\/[^/]*$/); return m ? m[1] : ""; } catch (e){ return ""; } };
      const ins = o => Object.entries(o.in || {}).sort((a, b) => b[1] - a[1]).map(x => x[0]).join(", ");
      const row = (inApp, n, g, title, from, rev, o) => { const p = part(n, g);
        return [inApp, o.url ? { v: n, link: o.url } : n, title, from, FAM[g] || g, p.area, AREA[p.area] || "", DT[p.code] || "", p.code, DI[p.disc] || p.disc, p.pkg, rev, o.st || "", fold(o.url), o.x || 0, o.xr || 0, ins(o)]; };
      const rows = [["In app", "Doc number", "Title", "Title from", "Family", "Area", "Area name", "Doc type", "Type code", "Discipline", "Vendor package", "Rev", "Register status", "SharePoint folder", "Mentioned in (docs)", "Times mentioned", "Mentioned in"]];
      const seen = new Set(), ORD = new Intl.Collator(undefined, { numeric: true });
      DOCS.filter(d => d.number && !seen.has(d.number) && seen.add(d.number)).sort((a, b) => ORD.compare(a.number, b.number)).forEach(d => { const h = HELD[d.number] || {};
        rows.push(row("Attached", d.number, h.g || (/^2000-[A-Z]\d{2,3}-[A-Z]{3}-[A-Z]{2}-\d{5}$/.test(d.number) ? "project" : "other"), d.title || h.rt || "", d.title ? "App" : h.rt ? "Register" : "", d.rev || h.rev || "", h)); });
      [...RO].sort((a, b) => ORD.compare(a.n, b.n)).forEach(o => rows.push(row("Ref only", o.n, o.g, o.t, o.ts === "reg" ? "Register" : o.ts === "drw" ? "As printed" : "", o.rev || "", o)));
      const d = new Date(), ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      XLSX.download(`Project Library documents ${ds}.xlsx`, [{ name: "Documents", rows, widths: [10, 26, 60, 11, 13, 7, 22, 20, 9, 22, 14, 6, 9, 40, 12, 10, 60] }]); }
    // open a document: a drawing in the app's viewer (or the browser's), a list as its tables
    function openDoc(d){ if (!d) return;
      if (d.tables && !d.pdf && window.SourceView) return SourceView.open(d.k, `${d.number} ${d.title}${d.rev ? " Rev " + d.rev : ""}`);
      if (window.Pid && Pid.has && Pid.has(d.number)) return Pid.open(d.number);
      if (d.pdf) return window.open(d.pdf, "_blank", "noopener");
      if (window.SourceView && d.tables) SourceView.open(d.k, d.number + " " + d.title); }
    // save all: every listed document's file (its PDF, or the Excel copy of a list) in one zip, named as Save names it
    async function saveAll(ds, b, name){ if (b.disabled) return;
      const items = ds.map(d => d.pdf ? [d.pdf, fname(d) + ".pdf"] : d.xlsx ? [d.xlsx, d.xname || fname(d) + ".xlsx"] : null).filter(Boolean); if (!items.length) return;
      const was = b.title; b.disabled = true; b.classList.add("sl-on"); const got = [];
      try { for (let i = 0; i < items.length; i++){ b.title = `Fetching ${i + 1} / ${items.length}`;
          const r = await fetch(items[i][0]); if (!r.ok) throw new Error(items[i][1] + " (" + r.status + ")"); got.push([items[i][1], new Uint8Array(await r.arrayBuffer())]); }
        const a = document.createElement("a"); a.href = URL.createObjectURL(zip(got)); a.download = `Project Library ${String(name || "sources").replace(/&amp;/g, "&").replace(/[\\/:*?"<>|]/g, "-")}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4e4);
      } catch (e){ alert("Couldn't save all: " + e.message); }
      b.disabled = false; b.classList.remove("sl-on"); b.title = was; }
    // keep on the device: one row, or every row the filters show (phone), a section or tree group (desktop); the row's (or
    // the bar's) text counts up the MB
    // a queue: while one download runs, a tap on another Cache button lines it up (tap it again to take it off); each
    // starts when the one before ends
    const Q = [];
    const rowOf = id => phone ? (id === "all" ? null : el.querySelector(`.sl-r[data-r="${CSS.escape(id)}"]`)) : el.querySelector(`[data-id="${CSS.escape(id)}"]`);
    function paintQ(){ el.querySelectorAll(".sl-qd").forEach(b => { b.classList.remove("sl-qd"); if (b.dataset.lab != null){ const sp = b.querySelector("span"); if (sp) sp.textContent = b.dataset.lab; else b.textContent = b.dataset.lab; delete b.dataset.lab; } });
      Q.forEach(j => { const r = rowOf(j.id), b = j.id === "all" ? $(".sl-all") : r && r.querySelector(".sl-kp"); if (!b) return;
        b.classList.add("sl-qd"); b.title = "Queued: tap to take it off the queue"; const sp = b.querySelector("span") || (j.id === "all" ? b : null);
        if (sp){ b.dataset.lab = sp.textContent; sp.textContent = "Queued"; } }); }
    async function run(ds, row, id){
      if (busy || busyRow){ const i = Q.findIndex(j => j.id === id); if (i >= 0) Q.splice(i, 1); else Q.push({ ds, id }); paintQ(); return; }
      const files = [...new Set(ds.flatMap(d => d.keep))]; if (!files.length) return next();
      const total = files.reduce((t, f) => t + (OFF.sz[f] || 0), 0), have = files.filter(f => st[f] === "ok").reduce((t, f) => t + (OFF.sz[f] || 0), 0);
      stop.x = false; el.classList.add("sl-busy"); let say;
      if (phone){ busyRow = row || el; busyRow.classList.add("sl-on");
        const bar = row ? row.querySelector(".sl-rb i") : $(".sl-pg i");
        const kb = row && row.querySelector(".sl-kp"); if (kb) kb.innerHTML = ICO.stop + `<span></span>`;
        say = f => { const t = `${mb(have + f * (total - have))} / ${mb(total)} MB`; const l = row ? row.querySelector(".sl-kp span") : $(".sl-all"); if (l) l.textContent = t; if (bar) bar.style.width = ((have + f * (total - have)) / total * 100).toFixed(1) + "%"; }; }
      else { busy = { id, have, total, f: 0 }; say = f => { busy.f = f; paintBusy(); }; }
      say(0);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      try { await Offline.get(files, say, stop); } catch (e){ if (e.message !== "stopped") alert("Stopped: " + e.message + ". What was saved is kept; tap Cache again to finish."); }
      if (busyRow){ busyRow.classList.remove("sl-on"); busyRow = null; } busy = null; el.classList.remove("sl-busy"); await refresh();   // (refresh redraws, so a waiting redraw is done too)
      next();
    }
    function next(){ const nx = Q.shift(); if (nx){ paintQ(); run(nx.ds.filter(d => stOf(d) !== "ok"), rowOf(nx.id), nx.id); } }
    async function refresh(){ if (!DOCS || !window.Offline) return draw(); st = await Offline.check([...new Set(DOCS.flatMap(d => d.keep))]).catch(() => ({})); draw(); }
    load().then(async () => { OFF = await Offline.load().catch(() => ({ sz: {} })); draw(); refresh(); });
    return { refresh, filter: v => { q = String(v || "").trim().toLowerCase(); draw(); } };
  }

  // ---------- upload (desktop) ----------
  const ghKey = () => { try { return localStorage.getItem("kcgm_ghkey") || ""; } catch (e) { return ""; } };
  const LOCKT = "Uploading needs a GitHub key: Help → API keys";
  const upBtn = (id, cls) => { const lk = !ghKey();
    return `<button type="button" class="${cls} sl-upb${lk ? " sl-lkd" : ""}" data-up="${esc(id)}" title="${lk ? LOCKT : id ? "Upload new revisions or documents into here" : "Upload PDFs"}">${ICO.up}${lk ? `<i class="sl-lk">${ICO.lock}</i>` : ""}</button>`; };
  const setLock = (b, lk) => { b.classList.toggle("sl-lkd", lk); b.title = lk ? LOCKT : "Upload PDFs"; const i = b.querySelector(".sl-lk"); if (lk && !i) b.insertAdjacentHTML("beforeend", `<i class="sl-lk">${ICO.lock}</i>`); if (!lk && i) i.remove(); };
  // a centred box over the page (the upload check, the key note): returns its card; Esc or a click outside closes it
  // unless it's busy
  function box(cls){ const w = document.createElement("div"); w.className = "up-w"; w.innerHTML = `<div class="up-b ${cls || ""}" role="dialog" aria-modal="true"></div>`; document.body.appendChild(w);
    const shut = () => { if (w.dataset.busy) return; w.remove(); removeEventListener("keydown", k); }, k = e => { if (e.key === "Escape") shut(); };
    w.addEventListener("click", e => { if (e.target === w) shut(); }); addEventListener("keydown", k); const b = w.firstChild; b.shut = shut; b.wrap = w; return b; }
  function needKey(){ const b = box("up-sm");
    b.innerHTML = `<h3>Uploading needs a GitHub key</h3><p>Uploads go straight into the app's GitHub repository (${esc(REPO)}), so they need a GitHub key: a fine-grained personal access token with Contents read and write on that repository. Add it in Help → API keys; it stays in this browser only.</p>
      <div class="up-ft"><span class="sl-sp"></span><button type="button" class="up-c">Close</button>${window.Tabs && Tabs.keys ? `<button type="button" class="up-go">Open API keys…</button>` : ""}</div>`;
    b.querySelector(".up-c").onclick = b.shut; const g = b.querySelector(".up-go"); if (g) g.onclick = () => { b.shut(); Tabs.keys(); }; }

  // revisions: numbers after letters (A, B, C are the issues before Rev 0), 1A after 1; true when a is later than b
  const rk = r => { r = String(r || "").toUpperCase(); const m = r.match(/^(\d+)([A-Z]?)$/); return m ? [1, +m[1], m[2]] : /^[A-Z]{1,2}$/.test(r) ? [0, r.length, r] : [0, 0, r]; };
  const later = (a, b) => { const x = rk(a), y = rk(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
  const nextRev = r => { r = String(r || "").toUpperCase(); return /^\d+$/.test(r) ? String(+r + 1) : /^[A-Y]$/.test(r) ? String.fromCharCode(r.charCodeAt(0) + 1) : /^(\d+)[A-Z]$/.test(r) ? String(parseInt(r) + 1) : r ? "" : "0"; };
  const REVOK = /^[A-Z0-9]{1,4}$/, NUMOK = /^[A-Z0-9][A-Z0-9-]{4,60}$/;
  // a file name → {num (an index key), fresh (a number not in the index), rev}: "F13-PID-10002 rev 3.pdf" →
  // 2000-F13-PID-PR-10002 rev 3; "2000-F16-PID-PR-10007_C" → rev C; the parts left out (2000-, PR) are filled in
  function guess(name){
    const U = name.replace(/\.pdf$/i, "").toUpperCase(), out = { num: "", fresh: "", rev: "", alts: [] };
    const m = U.match(/(?:(\d{4})[-_ ]?)?F(\d{2,3})[-_ ]?(PID|PFD|BLK|DRG|DCR|LAY|GA)[-_ ]?(?:([A-Z]{2})[-_ ]?)?(\d{4,5})/);
    let rest = U;
    if (m){ rest = U.replace(m[0], " ");
      const hit = Object.keys(IDX).filter(k => { const p = k.split("-"); return p[1] === "F" + m[2] && p[2] === m[3] && p[4] === m[5] && (!m[1] || p[0] === m[1]) && (!m[4] || p[3] === m[4]); });
      if (hit.length === 1) out.num = hit[0]; else if (hit.length) out.alts = hit;
      else out.fresh = `${m[1] || "2000"}-F${m[2]}-${m[3]}-${m[4] || "PR"}-${m[5]}`; }
    const r = rest.match(/REV(?:ISION)?[\s_.-]*(\d{1,2}[A-Z]?|[A-Z]{1,2})(?![A-Z0-9])/) || rest.trim().match(/(?:^|[-_ ])(\d{1,2}|[A-Z])$/);
    if (r) out.rev = r[1];
    return out; }

  // the check box (design 12a): FILE | GOES TO | REV | status, then Upload N
  function upload(files, at, DOCS){
    const nums = Object.keys(IDX).sort(new Intl.Collator(undefined, { numeric: true }).compare);
    // where it was opened from: a document is the default target; an area or section puts its documents first and
    // starts a new document's number with its area
    const [w, t, a] = at.split(":"), atDoc = w === "d" ? (DOCS.find(d => d.k === at.slice(2)) || {}).ik || "" : "";
    const scope = w === "a" || w === "r" ? DOCS.filter(d => d.ik && d.t === t && (w === "r" || (d.area || "–") === a)).map(d => d.ik) : [];
    const pre = w === "n" ? at.slice(2) : w === "a" && a !== "–" ? `2000-${a}-${{ pid: "PID", pfd: "PFD", bfd: "BLK" }[t] || "DRG"}-PR-` : "";
    const scName = w === "a" ? `${a} ${AREA[a] || ""}`.trim() : w === "r" ? (TN[t] || "").replace("&amp;", "&") : "";
    const rows = files.map(f => { const g = guess(f.name), num = g.num || (!g.fresh && atDoc) || "";
      const x = { f, num, mode: num ? "doc" : g.fresh || w === "n" ? "new" : "", fresh: g.fresh || pre, title: "", rev: g.rev, guessed: false, st: "", msg: "", alts: g.alts };
      if (!x.rev){ x.rev = num ? nextRev(IDX[num].rev) : g.fresh ? "0" : ""; x.guessed = !!num; }
      return x; });
    const b = box("up-big"), mbs = n => (n / 1e6 < 0.1 ? "<0.1" : (n / 1e6).toFixed(1)) + " MB";
    const target = x => x.mode === "doc" ? x.num : x.mode === "new" ? x.fresh.trim().toUpperCase() : "";
    // status: ✓ Matched, ! Check rev (not later than the current one, or guessed), ? Pick one, + New; ready = can go up
    const stat = x => { const r = x.rev.trim().toUpperCase();
      if (x.st === "ok") return ["ok", "✓ Uploaded", ""]; if (x.st === "busy") return ["bz", x.msg, ""]; if (x.st === "err") return ["no", "✕ " + x.msg, ""];
      if (!x.mode) return ["no", "? Pick one", x.alts.length ? "The name fits more than one document" : "No document number found in the name"];
      if (x.mode === "new"){ const n = target(x); if (!NUMOK.test(n)) return ["no", "? Number", "Type the new document's number"]; if (!REVOK.test(r)) return ["ck", "! Rev", "Type its revision"]; return ["nw", "+ New", "A new document: " + n]; }
      const cur = IDX[x.num].rev || "", old = (IDX[x.num].revs || []).map(v => v.rev);
      if (!REVOK.test(r)) return ["ck", "! Rev", "Type the revision (letters and numbers)"];
      if (cur && !later(r, cur) || old.includes(r)) return ["ck", "! Check rev", `Rev ${r} isn't later than the current Rev ${cur}`];
      if (x.guessed) return ["ck", "! Check rev", "No revision in the name: Rev " + r + " is a guess"];
      return ["ok", "✓ Matched", cur ? `Replaces Rev ${cur}` : "Replaces the current file"]; };
    const ready = x => x.st !== "ok" && x.st !== "busy" && !!target(x) && REVOK.test(x.rev.trim().toUpperCase()) && (x.mode === "doc" || NUMOK.test(target(x)));
    const opts = x => { const o = n => `<option value="${esc(n)}"${x.mode === "doc" && x.num === n ? " selected" : ""}>${esc(n)}</option>`;
      const first = x.alts.length ? x.alts : scope;
      return `<option value=""${x.mode ? "" : " selected"} disabled>Pick a document</option><option value="+"${x.mode === "new" ? " selected" : ""}>+ New document</option>` +
        (first.length ? `<optgroup label="${x.alts.length ? "Fits the name" : "In " + esc(scName)}">${first.map(o).join("")}</optgroup><optgroup label="All documents">` : "") +
        nums.map(o).join("") + (first.length ? "</optgroup>" : ""); };
    const rowH = (x, i) => { const [c, l, tip] = stat(x), off = x.st === "ok" || x.st === "busy" ? " disabled" : "", sug = [...new Set([x.mode === "doc" ? nextRev(IDX[x.num].rev) : "0", x.rev, "A", "0", "1"].filter(Boolean))];
      return `<tr data-i="${i}"><td class="up-fn" title="${esc(x.f.name)}">${esc(x.f.name)}<small>${mbs(x.f.size)}</small></td>
        <td><select class="up-to"${off}>${opts(x)}</select>${x.mode === "new" ? `<input class="up-nn" value="${esc(x.fresh)}" placeholder="Number, e.g. 2000-F13-PID-PR-10020" spellcheck="false"${off}><input class="up-ti" value="${esc(x.title)}" placeholder="Title"${off}>` : ""}</td>
        <td><input class="up-rv" value="${esc(x.rev)}" list="up-rl${i}" maxlength="4" spellcheck="false" aria-label="Revision"${off}><datalist id="up-rl${i}">${sug.map(v => `<option value="${esc(v)}">`).join("")}</datalist></td>
        <td><span class="up-ch up-${c}" title="${esc(tip)}">${esc(l)}</span>${tip && c !== "bz" ? `<small>${esc(tip)}</small>` : ""}</td></tr>`; };
    let done = false;
    const foot = () => { const n = rows.filter(ready).length, wait = rows.filter(x => x.st !== "ok" && x.st !== "busy" && !ready(x)), nd = wait.filter(x => !target(x)).length, nr = wait.length - nd, go = b.querySelector(".up-go");
      const why = [nd && `${nd} need${nd === 1 ? "s" : ""} a document`, nr && `${nr} need${nr === 1 ? "s" : ""} a number or rev`].filter(Boolean).join(", ");
      go.disabled = !n || !!b.wrap.dataset.busy; go.textContent = done ? "Close" : `Upload ${n}${why ? ` (${why})` : ""}`; if (done) go.disabled = false; };
    const paint = i => { const tr = b.querySelector(`tr[data-i="${i}"]`); tr.outerHTML = rowH(rows[i], i); foot(); };
    const paintChip = i => { const tr = b.querySelector(`tr[data-i="${i}"]`), [c, l, tip] = stat(rows[i]); tr.lastElementChild.innerHTML = `<span class="up-ch up-${c}" title="${esc(tip)}">${esc(l)}</span>${tip && c !== "bz" ? `<small>${esc(tip)}</small>` : ""}`; foot(); };
    b.innerHTML = `<h3>Upload ${files.length} file${files.length === 1 ? "" : "s"}</h3><p class="up-sub">Check where each file goes and its revision. They go to ${esc(REPO)} on GitHub; no redaction is done.</p>
      <div class="up-tw"><table class="up-t nosort"><thead><tr><th>File</th><th>Goes to</th><th>Rev</th><th></th></tr></thead><tbody>${rows.map(rowH).join("")}</tbody></table></div>
      <div class="up-msg" role="status"></div><div class="up-ft"><span class="sl-sp"></span><button type="button" class="up-c">Cancel</button><button type="button" class="up-go"></button></div>`;
    foot();
    const tb = b.querySelector("tbody"), msg = b.querySelector(".up-msg");
    tb.addEventListener("change", e => { const i = +e.target.closest("tr").dataset.i, x = rows[i];
      if (e.target.classList.contains("up-to")){ const v = e.target.value; x.st = "";
        if (v === "+"){ x.mode = "new"; if (!x.rev || x.guessed){ x.rev = "0"; x.guessed = false; } } else { x.mode = "doc"; x.num = v; if (x.guessed || !x.rev) { x.rev = nextRev(IDX[v].rev); x.guessed = true; } }
        paint(i); } });
    tb.addEventListener("input", e => { const tr = e.target.closest("tr"), i = +tr.dataset.i, x = rows[i]; x.st = "";
      if (e.target.classList.contains("up-rv")){ x.rev = e.target.value; x.guessed = false; }
      if (e.target.classList.contains("up-ti")) x.title = e.target.value;
      if (e.target.classList.contains("up-nn")){ x.fresh = e.target.value; const n = target(x); if (IDX[n]){ x.mode = "doc"; x.num = n; return paint(i); } }   // (a number that's already there: that document)
      paintChip(i); });
    b.querySelector(".up-c").onclick = () => { if (b.wrap.dataset.busy){ stopUp = true; return; } b.shut(); };
    let stopUp = false;
    b.querySelector(".up-go").onclick = async () => { if (done) return b.shut();
      const todo = rows.map((x, i) => [x, i]).filter(([x]) => ready(x)); if (!todo.length) return;
      b.wrap.dataset.busy = 1; stopUp = false; b.querySelector(".up-c").textContent = "Stop"; msg.className = "up-msg"; msg.textContent = ""; foot();
      let ok = 0, bad = 0, fatal = "";
      for (const [x, i] of todo){
        if (stopUp || fatal){ break; }
        const num = target(x), rev = x.rev.trim().toUpperCase(), path = `uploads/${num}_Rev${rev}`;
        const step = m => { x.st = "busy"; x.msg = m; paint(i); };
        try {
          step("Reading…"); const pdf = await b64(x.f);
          const note = { number: num, rev, uploaded: new Date().toISOString(), file: x.f.name }; if (x.mode === "new") note.title = x.title.trim() || ""; 
          step("Uploading " + mbs(x.f.size) + "…");
          // the note first: the Action files a PDF only once its note is there, so the PDF's push is the one that does it
          await put(path + ".json", b64s(JSON.stringify(note, null, 1)), `Upload ${num} Rev ${rev} (note)`);
          await put(path + ".pdf", pdf, `Upload ${num} Rev ${rev}`);
          x.st = "ok"; ok++;
        } catch (e){ x.st = "err"; x.msg = e.message; bad++; if (e.fatal) fatal = e.message; }
        paint(i); }
      delete b.wrap.dataset.busy; b.querySelector(".up-c").textContent = "Cancel";
      if (!bad && !stopUp && rows.every(x => x.st === "ok")){ done = true; b.querySelector(".up-c").hidden = true; msg.className = "up-msg up-good"; msg.textContent = "Uploaded. It will appear in Sources in a few minutes, once GitHub has processed it."; }
      else { msg.className = "up-msg" + (bad ? " up-bad" : ""); msg.textContent = (ok ? `${ok} uploaded; they will appear in Sources in a few minutes. ` : "") + (fatal ? fatal + ". Check it in Help → API keys." : bad ? `${bad} failed: see the red lines, then try again.` : stopUp ? "Stopped." : ""); }
      foot(); };
  }
  // a file as base64 in pieces (a 50 MB drawing would overflow one String.fromCharCode); 3 × 32 KB keeps the pieces whole
  async function b64(f){ const u = new Uint8Array(await f.arrayBuffer()), C = 3 * 32768, out = [];
    for (let i = 0; i < u.length; i += C){ let s = ""; const p = u.subarray(i, i + C); for (let j = 0; j < p.length; j += 8192) s += String.fromCharCode.apply(null, p.subarray(j, j + 8192)); out.push(btoa(s)); }
    return out.join(""); }
  const b64s = t => { const u = new TextEncoder().encode(t); let s = ""; u.forEach(c => s += String.fromCharCode(c)); return btoa(s); };
  // one file into the repository (the GitHub contents API: a commit per file); errors in plain words
  async function put(path, content, message){
    let r; try { r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "PUT",
      headers: { Authorization: "Bearer " + ghKey(), Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" }, body: JSON.stringify({ message, content }) }); }
    catch (e){ throw Object.assign(new Error("Couldn't reach GitHub"), { fatal: true }); }
    if (r.ok) return r.json().catch(() => ({}));
    const j = await r.json().catch(() => ({})), why = j.message || "";
    if (r.status === 401) throw Object.assign(new Error("The GitHub key was refused"), { fatal: true });
    if (r.status === 404) throw Object.assign(new Error("The key can't see the repository"), { fatal: true });
    if (r.status === 422) throw new Error("That revision is already uploaded");
    if (r.status === 403) throw Object.assign(new Error(/rate limit/i.test(why) ? "GitHub's limit for now is used up: try again later" : "The key can't write to the repository"), { fatal: true });
    if (r.status === 413) throw new Error("Too big for GitHub");
    throw new Error(`GitHub answered ${r.status}${why ? ": " + why : ""}`); }

  const css = `.sl-q{width:100%;box-sizing:border-box;height:36px;border:1.5px solid var(--line);border-radius:18px;background:var(--bg);color:var(--ink);padding:0 12px;font:inherit;font-size:var(--fb,15px)}
.sl-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;background:var(--th-t);font-size:var(--fl,13px);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--th2);margin:14px 0 6px}
.sl-bar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 2px 8px;font-size:var(--fb,15px);color:var(--mute);min-height:32px}.sl-bar b{color:var(--ink)}
.sl-all{border:1.5px solid var(--gold);background:var(--card,var(--panel));color:color-mix(in srgb,var(--gold) 72%,var(--ink));border-radius:16px;padding:5px 12px;font:inherit;font-size:var(--fl,13px);font-weight:800;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums}
.sl-allok{display:inline-flex;align-items:center;gap:5px;color:#1f9a55;font-weight:800;font-size:var(--fl,13px)}
.sl-pg{position:absolute;left:0;right:0;bottom:-4px;height:3px;display:none}.sl-busy:not(:has(.sl-r.sl-on,tr.sl-on)) .sl-pg{display:block}.sl-pg i,.sl-rb i{display:block;height:100%;width:0;background:var(--gold);transition:width .2s}
.sl-b{display:inline-flex;align-items:center;justify-content:center;gap:5px;box-sizing:border-box;height:30px;border:1.5px solid var(--gold);background:var(--card,var(--panel));color:color-mix(in srgb,var(--gold) 72%,var(--ink));border-radius:9px;padding:0 10px;font:inherit;font-size:var(--fl,13px);font-weight:800;text-decoration:none;white-space:nowrap;cursor:pointer;font-variant-numeric:tabular-nums}
.sl-b0{border:0!important;background:none!important}.sl-b:disabled{opacity:.6;cursor:progress}
.sl-kp.ok{border-color:#2aa765;color:#1f9a55}.sl-b,.sl-p,.sl-all,.sl-r{touch-action:manipulation;-webkit-tap-highlight-color:transparent}.sl-b:active,.sl-p:active,.sl-all:active{transform:scale(.93);background:var(--th-t,#eef1f5)!important;transition:transform .05s}.sl-r:active{background:var(--rs,#e1e4e8)}.sl-kp.old,.sl-kp.part{border-style:dashed}
.sl-qd{border-style:dashed!important;opacity:.75}
.sl-rb{display:none;position:absolute;left:3px;right:10px;bottom:3px;height:2px}
.sl-none{color:var(--mute);padding:14px 10px;font-size:var(--fb,15px)}
/* desktop: the side panel, the divider and the tree's card fill the window below the bar; each scrolls on its own */
.sl-dt{display:flex;align-items:stretch;height:calc(100vh - var(--tb,0px) - 40px);min-height:420px}
.sl-side{flex:0 0 var(--slw,330px);min-width:260px;max-width:50%;background:var(--card,var(--panel));border:1px solid var(--line);border-radius:12px;padding:12px;overflow-y:auto;box-sizing:border-box}
.sl-dt .sl-b{flex-direction:column;gap:1px;width:46px;height:34px;padding:0;border-radius:9px;font-size:10.5px;line-height:1}.sl-dt .sl-b svg{width:14px;height:14px}
.sl-hb{display:flex;align-items:center;gap:8px;margin:10px 0 0}.sl-hb .sl-b{width:auto;min-width:54px;padding:0 8px}.sl-svn{font-size:12px;color:var(--mute);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sl-sec{display:flex;align-items:center;gap:8px;padding:4px 8px;margin-bottom:2px;border-radius:9px;cursor:pointer;border:1.5px solid transparent;outline:0}.sl-sec.on{background:var(--th-t);border-color:var(--th)}.sl-sec:hover:not(.on),.sl-sec:focus-visible:not(.on){background:var(--card2,var(--panel2))}
.sl-st{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px}.sl-st b{display:block;flex:none;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sl-st small{display:block;flex:1;min-width:0;text-align:right;color:var(--mute);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.sl-pb{display:block;height:3px;border-radius:2px;background:var(--line);margin-top:5px;overflow:hidden}.sl-pb i{display:block;height:100%;background:#2aa765;transition:width .2s}
.sl-sec.sl-z .sl-st{opacity:.5}.sl-sec .sl-pb{display:none}.sl-sec .sl-b{flex:none;width:28px;min-width:0;height:26px;padding:0}.sl-sec .sl-b span{display:none}
/* the divider, as the app's others: a 2px line with a dotted grip, gold while dragged */
.sl-dv{flex:0 0 24px;position:relative;cursor:col-resize;touch-action:none}.sl-dv::before{content:"";position:absolute;left:11px;top:14px;bottom:14px;width:2px;border-radius:1px;background:var(--line)}
.sl-dv i{position:absolute;left:7px;top:50%;margin-top:-22px;width:10px;height:44px;box-sizing:border-box;border-radius:5px;background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px}.sl-dv i b{width:3px;height:3px;border-radius:50%;background:var(--mute)}
.sl-dv:hover::before,.sl-dv.drag::before{background:var(--gold)}.sl-dv:hover i,.sl-dv.drag i{border-color:var(--gold)}.sl-dv:hover i b,.sl-dv.drag i b{background:var(--gold)}body.splitting{cursor:col-resize;user-select:none}
.sl-main{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--card,var(--panel));border:1px solid var(--line);border-radius:12px;overflow:hidden}
.sl-tbar{display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--line);background:var(--card2,var(--panel2))}.sl-tbar b{font-size:13px;letter-spacing:.04em}.sl-sp{flex:1}
.sl-tbb{display:inline-flex;align-items:center;gap:5px;height:26px;border:1px solid var(--line);background:var(--card,var(--panel));border-radius:6px;font:inherit;font-size:12px;font-weight:700;padding:0 9px;cursor:pointer;color:var(--ink)}.sl-tbb:hover:not(:disabled){border-color:var(--th)}.sl-tbb:disabled{opacity:.45;cursor:default}
/* the selection tree: a property grid's grey header, 22px rows, Navisworks' blue hover and selection */
.sl-tabs{display:inline-flex;margin-left:10px;border:1px solid var(--line);border-radius:7px;overflow:hidden;background:var(--card,var(--panel))}.sl-tabs button{border:0;background:none;font:inherit;font-size:12px;font-weight:700;padding:4px 12px;cursor:pointer;color:var(--mute)}.sl-tabs button+button{border-left:1px solid var(--line)}.sl-tabs button.on{background:var(--th);color:#fff}
.sl-roc{width:38px;height:34px!important;padding:0!important;flex-direction:column;justify-content:center;gap:0!important;margin:-4px 0}.sl-roc svg{width:14px;height:14px}.sl-roc b{font:800 9px/1 Arial,sans-serif;color:#1d6f42;letter-spacing:.3px;margin-top:1px}:root[data-theme="dark"] .sl-roc b{color:#3fb37a}
.sl-ro{flex:1;display:flex;flex-direction:column;min-height:0}.sl-ro[hidden],.sl-tree[hidden]{display:none}.sl-rop{display:flex;gap:6px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid var(--line)}.sl-rot{flex:1;overflow:auto;font-size:13px}
.sl-rtb{width:100%;border-collapse:collapse}.sl-rtb th{position:sticky;top:0;z-index:1;background:var(--card2,var(--panel2));border-bottom:1px solid var(--line);border-right:1px solid var(--line);font-size:12px;font-weight:700;color:var(--mute);text-align:left;padding:4px 8px;white-space:nowrap}.sl-rtb th:last-child{border-right:0;width:40px}
.sl-rtb td{padding:3px 8px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent);vertical-align:top}.sl-rtb tr:hover td{background:var(--rh,#eef0f3)}.sl-rk{white-space:nowrap;font-weight:700}.sl-rn{text-align:right;font-variant-numeric:tabular-nums;width:1%;white-space:nowrap}.sl-rtb a{color:var(--th);text-decoration:none;white-space:nowrap}.sl-rtb a:hover{text-decoration:underline}.sl-mu{color:var(--mute);font-size:12px}.sl-ra{white-space:nowrap;text-align:right;min-width:62px}.sl-mu{white-space:nowrap}.sl-ra .sl-ib{display:inline-flex;vertical-align:middle}.sl-ra .sl-ib+.sl-ib{margin-left:4px}.sl-rtb a.sl-spn{color:var(--ink);text-decoration:underline dotted color-mix(in srgb,var(--th) 60%,transparent);text-underline-offset:3px}.sl-rtb a.sl-spn:hover{color:var(--th)}
.sl-rtb th:last-child{width:auto}
.sl-tree{flex:1;overflow:auto;font-size:13px;--cols:minmax(250px,2.4fr) minmax(110px,2fr) 58px 78px 92px 84px}
.sl-xa{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;margin:0 6px 0 2px;border:1px solid var(--line);border-radius:4px;background:var(--card,var(--panel));color:#4a525c;cursor:pointer;vertical-align:middle;flex:none}.sl-xa:hover{border-color:var(--th);color:var(--ink)}.sl-xa svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.sl-gh>span:first-child{display:flex;align-items:center}
.sl-gh,.sl-tr{display:grid;grid-template-columns:var(--cols);min-width:706px}
.sl-gh{position:sticky;top:0;z-index:1;background:var(--card2,var(--panel2));border-bottom:1px solid var(--line);font-size:12px;font-weight:700;color:var(--mute)}.sl-gh span{padding:4px 8px;border-right:1px solid var(--line)}.sl-gh span:last-child{border-right:0}
.sl-tr{position:relative;height:22px;line-height:22px;white-space:nowrap;cursor:default}.sl-tr>span{padding:0 8px;min-width:0;overflow:hidden;text-overflow:ellipsis;border-right:1px solid color-mix(in srgb,var(--line) 55%,transparent)}.sl-tr>span:nth-child(6){border-right:0}
.sl-tr:hover{background:var(--rh,#eef0f3)}.sl-tr.sel{background:var(--rs,#e1e4e8);box-shadow:inset 0 0 0 1px var(--rsb,#8b939d)}

.sl-nm{display:flex;align-items:center;gap:4px}.sl-c{color:var(--mute);font-variant-numeric:tabular-nums}.sl-grp[data-id^="r:"] .sl-l{font-weight:700}.sl-grp .sl-c{color:var(--ink)}
.sl-g{flex:none;width:16px;height:22px;position:relative;margin-right:-4px}.sl-gv::before,.sl-gt::before{content:"";position:absolute;left:7px;top:0;bottom:0;border-left:1px dotted #8a929c}.sl-gl::before{bottom:11px}.sl-gt::after{content:"";position:absolute;left:8px;width:8px;top:11px;border-top:1px dotted #8a929c}
.sl-tg{flex:none;box-sizing:border-box;width:11px;height:11px;margin:0 1px 0 2px;border:1px solid #8a929c;background:var(--card,var(--panel));font-size:11px;line-height:8px;text-align:center;color:var(--ink);font-weight:700;cursor:pointer;user-select:none}.sl-tg0{flex:none;width:14px}
.sl-ic{flex:none;margin-right:2px}.sl-l{min-width:0;overflow:hidden;text-overflow:ellipsis}.sl-l em{font-style:normal;color:var(--mute);font-weight:400;margin-left:6px}
.sl-l u{text-decoration:none;font-size:10.5px;font-weight:800;color:#1f9a55;border:1px solid #2aa765;border-radius:4px;padding:0 4px;margin-left:8px;line-height:14px;display:inline-block}
.sl-op{border:0;background:none;color:inherit;font:inherit;padding:0;text-align:left;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sl-op:hover{color:var(--ink);text-decoration:underline}
.sl-ok{display:inline-flex;vertical-align:-3px;color:#1f9a55}.sl-ok svg{width:14px;height:14px}.sl-ok.old{color:#c47f0a}.sl-ok.part{color:var(--mute)}
.sl-acts{display:grid;grid-template-columns:22px auto 22px;align-items:center;justify-content:start;gap:3px;padding:0 6px!important}.sl-acts>.sl-upb{grid-column:1}.sl-acts>.sl-zp,.sl-acts>.sl-dl{grid-column:2;display:flex;gap:3px}.sl-acts>.sl-kp{grid-column:3}.sl-zp.sl-on{opacity:.5;cursor:progress}
.sl-ib{flex:none;box-sizing:border-box;width:22px;height:20px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--ink) 22%,var(--line));border-radius:5px;background:var(--card,var(--panel));color:var(--ink);padding:0;cursor:pointer;text-decoration:none}
.sl-ib svg{width:13px;height:13px}.sl-ib:hover{border-color:var(--th);color:var(--th)}.sl-ib.sl-x{color:#1f8a4c}.sl-ib.ok{color:#1f9a55;border-color:#2aa765}.sl-ib.old,.sl-ib.part{border-style:dashed}
/* upload: the ↑ with a small lock at its corner while there's no GitHub key; superseded revisions in grey */
.sl-upb{position:relative}.sl-lk{position:absolute;right:-4px;bottom:-4px;width:12px;height:12px;border-radius:3px;background:var(--card,var(--panel));color:var(--mute);display:grid;place-items:center;box-shadow:0 0 0 1px var(--line);line-height:0}
.sl-tbb .sl-lk{right:-5px;bottom:-5px}.sl-ib .sl-lk{right:-3px;bottom:-1px;width:10px;height:10px}.sl-ib .sl-lk svg{width:8px;height:8px}.sl-ib.sl-lkd{color:var(--mute)}
.sl-l u.sl-sup{color:var(--mute);border-color:color-mix(in srgb,var(--mute) 60%,transparent);font-weight:700}.sl-old .sl-l{color:var(--mute)}
/* the upload check (design 12a) and the key note: a centred card over a dimmed page */
.up-w{position:fixed;inset:0;z-index:320;background:#0008;display:flex;align-items:center;justify-content:center;padding:20px}
.up-b{background:var(--card,var(--panel));color:var(--ink);border:1px solid var(--line);border-radius:14px;box-shadow:0 20px 50px #000a;width:min(900px,100%);max-height:calc(100vh - 40px);display:flex;flex-direction:column;padding:16px 18px 14px;box-sizing:border-box;font-size:13px}
.up-sm{width:min(460px,100%)}.up-b h3{margin:0 0 4px;font-size:17px}.up-b p{margin:4px 0 10px;color:var(--mute);line-height:1.45}.up-sm p{color:var(--ink)}
.up-tw{overflow:auto;min-height:0;border-top:1px solid var(--line)}
.up-t{width:100%;border-collapse:collapse}.up-t th{position:sticky;top:0;background:var(--card,var(--panel));text-align:left;font-size:11.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mute);padding:8px 8px;border-bottom:1px solid var(--line)}
.up-t td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}.up-t tr:last-child td{border-bottom:0}
.up-fn{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-top:11px!important}.up-t td small{display:block;color:var(--mute);font-size:11.5px;margin-top:3px;white-space:normal}
.up-to,.up-nn,.up-ti,.up-rv{box-sizing:border-box;height:28px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:6px;padding:0 6px;font:inherit;font-size:13px}
.up-to{width:230px;font-weight:700}.up-nn,.up-ti{display:block;width:230px;margin-top:5px}.up-nn{font-weight:700}.up-rv{width:58px;font-weight:700;text-transform:uppercase}
.up-to:focus,.up-nn:focus,.up-ti:focus,.up-rv:focus{outline:0;border-color:var(--th)}.up-t :disabled{opacity:.7}
.up-ch{display:inline-block;margin-top:4px;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:800;white-space:nowrap}
.up-ok{background:color-mix(in srgb,#1f9a55 16%,transparent);color:#1a8a4b}.up-ck{background:color-mix(in srgb,#d08a0e 20%,transparent);color:#a86a00}.up-no{background:color-mix(in srgb,#d64545 16%,transparent);color:#c2412f}
.up-nw{background:color-mix(in srgb,#2f6fdb 16%,transparent);color:#2a62c4}.up-bz{background:var(--th-t);color:var(--ink)}
html[data-theme=dark] .up-ok{color:#4cc28a}html[data-theme=dark] .up-ck{color:#e8b04a}html[data-theme=dark] .up-no{color:#ef7d6d}html[data-theme=dark] .up-nw{color:#7fa8f0}
.up-msg{font-weight:700;padding:8px 2px 0;line-height:1.4}.up-msg:empty{display:none}.up-good{color:#1a8a4b}.up-bad{color:#c2412f}html[data-theme=dark] .up-good{color:#4cc28a}html[data-theme=dark] .up-bad{color:#ef7d6d}
.up-ft{display:flex;align-items:center;gap:8px;padding-top:12px}
.up-c,.up-go{height:32px;border:1px solid var(--line);background:var(--card,var(--panel));color:var(--ink);border-radius:8px;padding:0 14px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}.up-c:hover{border-color:var(--th)}
.up-go{background:var(--th);border-color:var(--th);color:var(--on-th,#fff)}.up-go:disabled{opacity:.45;cursor:default}
.sl-tr .sl-rb{left:0;right:0;bottom:0}.sl-tr.sl-on .sl-rb{display:block}.sl-tr.sl-on .sl-pt{color:var(--ink)}
.sl-dt .sl-none{font-size:13px}
/* phone */
.sl-ph .sl-pills{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -10px 7px;padding:0 10px}.sl-ph .sl-pills::-webkit-scrollbar{display:none}.sl-ph .sl-pills[hidden]{display:none}
.sl-p{flex:none;border:1.5px solid color-mix(in srgb,var(--ink) 16%,var(--line));background:var(--card,var(--panel));color:var(--ink);border-radius:16px;padding:5px 11px;font:inherit;font-size:var(--fl,13px);font-weight:800;white-space:nowrap;cursor:pointer}
.sl-p i{font-style:normal;color:var(--mute);font-weight:600;margin-left:4px}.sl-p.on{border-color:var(--gold);box-shadow:inset 0 0 0 1px var(--gold);color:color-mix(in srgb,var(--gold) 72%,var(--ink))}.sl-ps{font-weight:700}
.sl-ph .sl-bar{font-size:var(--fl,13px);margin:0 2px 7px}.sl-n{font-weight:800;letter-spacing:.08em;text-transform:uppercase}.sl-n b{color:var(--ink);letter-spacing:.02em;margin-left:4px}
.sl-ph .sl-list{background:var(--card,var(--panel));border:1px solid var(--line);border-radius:12px;overflow:hidden}
.sl-r{position:relative;display:flex;align-items:center;gap:5px;padding:7px 7px 7px 9px;border-bottom:1px solid var(--line);cursor:pointer}.sl-r:last-child{border-bottom:0}
.sl-t{flex:1;min-width:0}.sl-t b{display:block;font-size:calc(var(--fb,15px) * .9);font-weight:800;white-space:nowrap;letter-spacing:-.01em}.sl-t span{display:block;font-size:var(--fl,13px);color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sl-ph .sl-b{flex:none;flex-direction:column;gap:1px;width:40px;height:38px;padding:0;border-radius:10px;font-size:calc(var(--fl,13px) * .82)}
.sl-ph .sl-kp.sl-on,.sl-r.sl-on .sl-kp{width:auto;min-width:44px;padding:0 6px}
.sl-ph .sl-pg{display:none!important}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, load, REPO };
})();
