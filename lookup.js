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
  const ICON = { mel: "⚙️", ins: "📟", cv: "🎚️", mv: "🔧", line: "〰️", spi: "🔩", hose: "🪢", pfd: "🗺️", gloss: "📖", pid: "📐", spec: "📘" };

  L.addExtra = list => { extras = extras.concat(list); if (DB) indexExtras(list); };
  function indexExtras(list){ list.forEach(x => { x.k = norm(x.key); x.txt = (x.key + " " + x.name + " " + (x.words || "")).toLowerCase(); items.push(x); addKey(x.k, x); }); }
  function addKey(k, it){ if (!k) return; const a = byKey.get(k); if (a) a.push(it); else byKey.set(k, [it]); }

  L.load = () => loading || (loading = fetch("search-data.json").then(r => { if (!r.ok) throw new Error("search data " + r.status); return r.json(); }).then(d => { DB = d; build();
    if (window.Spec) Spec.load().then(() => L.addExtra(Spec.extras())).catch(() => {});   // piping classes and valve datasheets become searchable
    // drawings in the app (small index, waited for so records can show their 📐 open buttons straight away);
    // drawings no list refers to (e.g. PFD sheets) become search results of their own
    return (window.Pid ? Pid.load().then(() => Pid.all().forEach(d => { const k = norm(d.number); if (byKey.has(k)) return;
      const it = { t: "pid", key: d.number, k, name: Pid.kind(d.number) + " drawing" + (d.title ? ": " + d.title : ""), r: null }; items.push(it); addKey(k, it); })).catch(() => {}) : Promise.resolve()).then(() => { done = true; return L; }); }));
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
    if (t === "mv") return [g("Size (DN)") && "DN" + g("Size (DN)"), g("Valve type"), "valve", g("Line number") && "on " + g("Line number")].filter(Boolean).join(" ");
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
  const linkify = v => esc(v).replace(TAG_RE, m => { const k = norm(m);
    const open = /-(PID|PFD)-/.test(m) && window.Pid && Pid.has(m) ? ` <a class="lk-dwgb" data-dwg="${m}" href="#" title="Open this drawing">📐 open</a>` : "";
    return (byKey.has(k) ? `<a class="lk-a" data-k="${k}">${m}</a>` : m) + open; });
  L.resultsHTML = (hits, q) => {
    if (!hits.length) return `<div class="lk-empty">No match for “${esc(q)}”. Try fewer characters, e.g. the number only.</div>`;
    return hits.map((it, i) => `<button class="lk-hit" data-i="${i}"><span class="lk-ic">${ICON[it.t] || "•"}</span><span class="lk-hb"><b>${esc(it.key)}</b><span>${esc(it.name)}</span><em>${esc(typeName(it.t))}</em></span></button>`).join("");
  };
  L.itemHTML = (it, opts = {}) => {
    const dwg = it.t === "pid" && window.Pid && Pid.has(it.key) ? Pid.info(it.key) : null;
    let h = `<div class="lk-kind">${ICON[it.t] || ""} ${esc(typeName(it.t))}</div>` +
      (dwg ? `<a class="lk-key lk-dwg" data-dwg="${esc(dwg.number)}" href="#" title="Open the drawing">${esc(it.key)}</a>` : `<div class="lk-key">${esc(it.key)}</div>`) + `<div class="lk-name">${esc(it.name)}</div>`;
    if (dwg) h += `<div class="lk-dwgnote">${esc([dwg.title, dwg.rev && "Rev " + dwg.rev, dwg.status, dwg.pages > 1 && dwg.pages + " sheets"].filter(Boolean).join(" · "))}${dwg.inferred ? " · number read from the sheet order" : ""}. Tap the number to open the drawing${opts.find ? `; ${esc(opts.find)} is marked on it` : ""}.</div>`;
    else if (it.t === "pid") h += `<div class="lk-ns">This drawing isn't loaded in the app yet.</div>`;
    const pfd = opts.pfd && opts.pfd(it);
    if (pfd) h += `<button class="lk-btn" data-pfd="1">🗺️ ${esc(pfd.label)}</button>`;
    if (it.t === "pfd" || it.t === "gloss"){ h += it.html || `<p>${esc(it.text || "")}</p>`; }
    else if (it.t === "spec"){ h += `<div class="lk-spec"></div>`; }
    else if (it.r){
      const f = DB.types[it.t].f;
      h += `<table class="lk-t">` + f.map((n, i) => it.r[i] ? `<tr><td>${esc(n)}</td><td>${linkify(it.r[i])}</td></tr>` : "").join("") + `</table>`;
      const empty = f.filter((n, i) => !it.r[i]);
      if (empty.length) h += `<div class="lk-ns">Not specified in the list: ${esc(empty.join(", "))}.</div>`;
      if (window.Spec && Spec.wanted(it)) h += `<div class="lk-spec"><div class="lk-ns">Loading the pipe and valve spec…</div></div>`;
    }
    const same = (byKey.get(it.k) || []).filter(x => x !== it);
    if (same.length) h += `<h4 class="lk-h">Same tag in other lists</h4>` + same.map(x => `<a class="lk-a lk-row" data-k="${x.k}" data-t="${x.t}">${ICON[x.t] || ""} ${esc(typeName(x.t))}: ${esc(x.name)}</a>`).join("");
    const rf = (refs.get(it.k) || []).filter(x => x !== it);
    if (rf.length){
      h += `<h4 class="lk-h">${it.t === "pid" ? "On this P&ID" : "Referenced by"} (${rf.length})</h4>`;
      const g = {}; rf.forEach(x => (g[x.t] = g[x.t] || []).push(x));
      TYPE_ORDER.filter(t => g[t]).forEach(t => {
        const a = g[t], show = a.slice(0, 40);
        h += `<details class="lk-d"${a.length <= 12 ? " open" : ""}><summary>${ICON[t] || ""} ${esc(typeName(t))} (${a.length})</summary>` +
          show.map(x => `<a class="lk-a lk-row" data-k="${x.k}" data-t="${x.t}"><b>${esc(x.key)}</b> ${esc(x.name)}</a>`).join("") +
          (a.length > show.length ? `<div class="lk-ns">and ${a.length - show.length} more; search the tag to see them all.</div>` : "") + `</details>`;
      });
    }
    if (DB.types[it.t]) h += `<div class="lk-src">Source: ${esc(DB.types[it.t].n)} list ${esc(DB.types[it.t].doc)} ${esc(DB.types[it.t].rev)}. Tap any underlined code to open it.</div>`;
    return h;
  };
  // spec section (pipe class for a line, datasheet for a valve), filled once spec/index.json is loaded
  L.fillSpec = (root, it) => { const el = root.querySelector(".lk-spec"); if (!el || !window.Spec) return;
    Spec.load().then(() => { if (!el.isConnected) return; el.innerHTML = Spec.html(it, it.r && DB.types[it.t] ? DB.types[it.t].f : []) + Spec.note(); Spec.bind(el); })
      .catch(e => { el.innerHTML = `<div class="lk-ns">Couldn't load the pipe and valve spec (${esc(e.message)}).</div>`; }); };
  L.find = (k, t) => { const a = byKey.get(k) || []; return (t && a.find(x => x.t === t)) || a[0] || null; };

  // A self contained search box: input, camera, results and item view with back history.
  L.mount = (root, opts = {}) => {
    root.classList.add("lk");
    root.innerHTML = `<form class="lk-bar" role="search" autocomplete="off" onsubmit="return false"><input class="lk-in" type="search" name="kcgm-tag-search" id="kcgm-tag-search-${Math.random().toString(36).slice(2, 7)}" inputmode="search" enterkeyhint="search" placeholder="${esc(opts.placeholder || "Any tag, line, valve or word")}" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" aria-label="Search tags, lines, valves" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other">
      <button class="lk-cam" type="button" title="Read a tag from a photo">📷</button><input type="file" accept="image/*" capture="environment" hidden></form>
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
      const r = recents(); status(""); showingRecent = true;
      body.innerHTML = `<div class="lk-rh"><span>Recent searches</span>${r.length ? '<button type="button" class="lk-clr">Clear</button>' : ""}</div>` +
        (r.length ? r.map((x, i) => x.q ? `<button type="button" class="lk-hit lk-rec" data-r="${i}"><span class="lk-ic">🔍</span><span class="lk-hb"><b>${esc(x.q)}</b><em>search</em></span></button>`
          : `<button type="button" class="lk-hit lk-rec" data-r="${i}"><span class="lk-ic">🕘</span><span class="lk-hb"><b>${esc(x.key)}</b><span>${esc(x.name)}</span><em>${esc(DB ? typeName(x.t) : "")}</em></span></button>`).join("")
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
    const showList = q => {
      showingRecent = false; if (!q.trim() && document.activeElement === inp){ showRecent(); return; }
      hits = L.search(q); const n = hits.length >= 60 ? L.count(q) : hits.length;
      status(q.trim().length < 2 ? "" : n ? `${n} match${n > 1 ? "es" : ""}${n > hits.length ? ", best " + hits.length + " shown" : ""}` : "");
      body.innerHTML = q.trim().length < 2 ? (opts.intro || "") : L.resultsHTML(hits, q);
      body.querySelectorAll(".lk-hit").forEach(b => b.onclick = () => open(hits[+b.dataset.i], true));
    };
    const open = (it, push) => {
      if (!it) return; remember(it); showingRecent = false; if (it.go){ it.go(); return; } if (push) stack.push({ q: inp.value, scroll: body.scrollTop, it: cur });
      cur = it;
      // the tag to mark on a drawing: the item itself, or on a drawing's own page the item you came from
      const from = it.t === "pid" ? (stack.length && stack[stack.length - 1].it ? stack[stack.length - 1].it.key : null) : it.key;
      body.innerHTML = `<button class="lk-back">← Back to ${stack.length && stack[stack.length - 1].it ? "previous" : "results"}</button>` + L.itemHTML(it, Object.assign({}, opts, { find: from }));
      body.querySelectorAll("[data-dwg]").forEach(a => a.onclick = e => { e.preventDefault(); Pid.open(a.dataset.dwg, from); });
      body.scrollTop = 0; if (root.scrollIntoView && opts.scrollTop) opts.scrollTop();
      body.querySelector(".lk-back").onclick = back;
      body.querySelectorAll("a[data-k]").forEach(a => a.onclick = e => { e.preventDefault(); open(L.find(a.dataset.k, a.dataset.t), true); });
      const pb = body.querySelector("[data-pfd]"); if (pb) pb.onclick = () => opts.pfd(it).go();
      L.fillSpec(body, it);
      if (opts.onOpen) opts.onOpen(it);
    };
    let cur = null;
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
    const scanHTML = res => `<div class="lk-kind">📷 Read from photo</div>` +
      (res.found.length ? `<h4 class="lk-h">Codes found in the lists</h4>` + res.found.map(c => `<button class="lk-hit" data-q="${esc(c.q)}"><span class="lk-ic">${ICON[c.it.t] || "•"}</span><span class="lk-hb"><b>${esc(c.it.key)}</b><span>${esc(c.it.name)}</span><em>read as “${esc(c.raw)}”</em></span></button>`).join("")
        : `<div class="lk-empty">No list code recognised. Edit the text below and search, or retake the photo closer and straight on.</div>`) +
      `<h4 class="lk-h">Text read</h4><textarea class="lk-ocr" rows="4">${esc(res.text)}</textarea><button class="lk-btn lk-ocrgo">Search this text</button>`;
    inp.value = opts.initial || ""; if (opts.initial) ensure().then(() => showList(inp.value)); else body.innerHTML = opts.intro || "";
    return { input: inp, search: q => { inp.value = q; ensure().then(() => showList(q)); }, openKey: k => ensure().then(() => open(L.find(norm(k)), true)) };
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
.lk-bar{display:flex;gap:8px}.lk-in{flex:1;min-width:0;padding:12px 13px;border-radius:12px;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);font-size:16px;font-family:ui-monospace,Consolas,monospace}
.lk-cam{flex:none;width:48px;border-radius:12px;border:1px solid var(--lk-l);background:var(--lk-c);font-size:21px;cursor:pointer}
.lk-status{font-size:13px;color:var(--mute);min-height:18px;margin:6px 2px}
.lk-hit{display:flex;gap:10px;width:100%;text-align:left;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);border-radius:12px;padding:10px 11px;margin-bottom:7px;cursor:pointer;font:inherit}
.lk-hit:hover{border-color:var(--lk-a)}.lk-ic{font-size:18px;line-height:1.2}.lk-hb{display:flex;flex-direction:column;gap:2px;min-width:0}
.lk-hb b{font-family:ui-monospace,Consolas,monospace;font-size:14.5px;color:var(--lk-a);word-break:break-all}.lk-hb span{font-size:13.5px;line-height:1.3}.lk-hb em{font-size:11.5px;color:var(--mute);font-style:normal}
.lk-rh{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--mute);margin:2px 2px 8px}
.lk-rh button{border:0;background:none;color:var(--lk-a);font:inherit;text-transform:none;letter-spacing:0;font-size:13px;cursor:pointer;padding:4px}
.lk-empty{color:var(--mute);font-size:14px;padding:10px 2px;line-height:1.45}
.lk-back{border:0;background:none;color:var(--lk-a);font:inherit;font-weight:700;padding:4px 0 10px;cursor:pointer}
.lk-kind{font-size:11.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--lk-a)}
.lk-key{font-family:ui-monospace,Consolas,monospace;font-size:20px;font-weight:800;margin:4px 0 2px;word-break:break-all}.lk-name{font-size:15px;line-height:1.35;margin-bottom:8px}
.lk-t{width:100%;border-collapse:collapse;font-size:13.5px;margin:6px 0}.lk-t td{padding:6px 4px;border-bottom:1px solid var(--lk-l);vertical-align:top;word-break:break-word}.lk-t td:first-child{color:var(--mute);width:42%}
.lk-a{color:var(--lk-a);text-decoration:underline;cursor:pointer}.lk-row{display:block;text-decoration:none;color:var(--ink);background:var(--lk-c);border-radius:8px;padding:6px 8px;margin:4px 0;font-size:13px}
.lk-row b{font-family:ui-monospace,Consolas,monospace;color:var(--lk-a);margin-right:4px}.lk-h{margin:14px 0 4px;font-size:11.5px;letter-spacing:1px;text-transform:uppercase;color:var(--mute)}
.lk-d{border:1px solid var(--lk-l);border-radius:10px;margin:6px 0;padding:0 8px}.lk-d summary{cursor:pointer;padding:8px 0;font-weight:700;font-size:13.5px}
.lk-ns{font-size:12px;color:var(--mute);margin:4px 0;line-height:1.4}.lk-src{font-size:12px;color:var(--mute);margin-top:12px;line-height:1.4}
.lk-btn{border:1px solid var(--lk-a);background:none;color:var(--lk-a);border-radius:10px;padding:8px 12px;font:inherit;font-weight:700;cursor:pointer;margin:6px 0}
.lk-spec .sp-t{font-size:13.5px;line-height:1.4;margin:2px 0 4px}.lk-spec .lk-btn span{font-weight:500;opacity:.75;font-size:12px;margin-left:4px}
.sp-sc{overflow-x:auto;-webkit-overflow-scrolling:touch}.sp-dt td,.sp-ct td,.sp-ct th{white-space:nowrap}.sp-dt td:first-child{width:auto}
.sp-ct th{font-size:11px;text-align:left;color:var(--mute);padding:4px;border-bottom:1px solid var(--lk-l)}.sp-ct td:first-child{color:var(--ink);width:auto;white-space:normal;min-width:120px}
.sp-n{font-size:12.5px;line-height:1.4;margin:6px 0}.sp-n b{color:var(--lk-a);margin-right:4px}
.sp-v{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.sp-chip{border:1px solid var(--lk-a);background:none;color:var(--lk-a);border-radius:99px;padding:4px 9px;font:inherit;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;font-weight:700;cursor:pointer}
.sp-chip.off{border-color:var(--lk-l);color:var(--mute);cursor:default}.sp-warn{font-size:12.5px;color:#f59e0b;margin:4px 0}
.sp-view{position:fixed;inset:0;z-index:2000;background:#2b2f36;display:flex;flex-direction:column}.sp-view[hidden]{display:none}
.sp-top{display:flex;gap:8px;align-items:center;padding:8px 10px;background:#171b21;color:#e9edf2;border-bottom:1px solid #2c343e}
.sp-tt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}
.sp-nav{display:flex;align-items:center;gap:4px}.sp-nav[hidden]{display:none}.sp-nav span{font-size:12.5px;min-width:58px;text-align:center;color:#aab4c0}
.sp-top button,.sp-dl{border:1px solid #3a434f;background:#242a33;color:#e9edf2;border-radius:8px;min-width:34px;height:32px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;font-size:13px}
.sp-body{flex:1;overflow:auto;padding:8px;-webkit-overflow-scrolling:touch}.sp-sheet{position:relative;background:#fff;margin:0 auto;box-shadow:0 2px 14px #0008;transform-origin:0 0}
.sp-bg{position:absolute;inset:0;width:100%;height:100%}.sp-hi{position:absolute}
.sp-marks{position:absolute;inset:0;pointer-events:none}.sp-marks i{position:absolute;box-sizing:content-box;margin:-4px -7px;padding:4px 7px;border:2.5px solid #ff2d55;background:rgba(255,214,10,.35);border-radius:4px;
  box-shadow:0 0 0 3px rgba(255,45,85,.25)}.sp-marks i.on{animation:spPulse 1.1s ease-out 4}
@keyframes spPulse{0%{box-shadow:0 0 0 0 rgba(255,45,85,.7)}100%{box-shadow:0 0 0 22px rgba(255,45,85,0)}}
.sp-body.drag{cursor:grabbing}.sp-fn{min-width:0 !important;padding:0 4px;white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis}
.sp-toast{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);background:#171b21;color:#e9edf2;border:1px solid #e8b44a;border-radius:10px;padding:8px 12px;font-size:13px;max-width:90vw}.sp-toast[hidden]{display:none}
.sp-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#ddd;font-size:14px}.sp-msg[hidden]{display:none}
body.sp-on{overflow:hidden}
@media (min-width:901px) and (hover:hover){.sp-rot{display:none !important}}
@media (max-width:600px){.sp-dl,.sp-view [data-a=fit]{display:none}.sp-top{flex-wrap:wrap;gap:5px;padding:6px 8px}.sp-tt{flex-basis:100%;font-size:12.5px}.sp-top button{min-width:30px;height:30px;padding:0 6px}.sp-nav span{min-width:0}.sp-x{margin-left:auto}}
.lk-dwg{display:inline-block;color:#2f7cf6 !important;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.lk-dwg:hover{color:#5b9bff !important}
.lk-dwgnote{font-size:12.5px;color:var(--mute);margin:-4px 0 8px;line-height:1.4}
.lk-dwgb{color:#2f7cf6;text-decoration:none;white-space:nowrap;font-size:12.5px;font-weight:700;margin-left:4px;cursor:pointer}
.lk-ocr{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);font-family:ui-monospace,monospace;font-size:14px;padding:8px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  window.Lookup = L;
})();
