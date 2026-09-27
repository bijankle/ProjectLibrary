// Tag lookup shared by the phone app (index.html) and the desktop PFD (pfd.html).
// Data: search-data.json, built from the project lists by tools/build_search.py.
// Search is forgiving: case, spaces, hyphens and slashes are ignored, partial tags match,
// and plain words search every description. Photo text recognition (Tesseract.js) is loaded only when used.
(function(){
  const L = {};
  let DB = null, loading = null, items = [], byKey = new Map(), refs = new Map(), extras = [];
  const norm = s => String(s || "").toUpperCase().replace(/[\s\-_/.]+/g, "");
  L.norm = norm;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Things that look like a plant code inside any text
  const TAG_RE = /\b(2000-[A-Z0-9]{3,6}-[A-Z]{3}-[A-Z]{2}-\d{4,5}|\d{2}-\d{4}-[A-Z0-9]{1,6}-[A-Z0-9]{2,6}-\d{2,4}(?:-[A-Z]{1,3})?|F\d{2}-[A-Z]{1,4}-\d{2,4}[A-Z]?|F\d{2}-\d{5}|SP-[A-Z]{2}-\d{3}|[A-Z]{1,5} ?\d{5}[A-Z]?)\b/g;
  const TYPE_ORDER = ["pfd", "mel", "ins", "cv", "mv", "line", "spi", "hose", "gloss", "pid"];
  const ICON = { mel: "⚙️", ins: "📟", cv: "🎚️", mv: "🔧", line: "〰️", spi: "🔩", hose: "🪢", pfd: "🗺️", gloss: "📖", pid: "📐" };

  L.addExtra = list => { extras = extras.concat(list); if (DB) indexExtras(list); };
  function indexExtras(list){ list.forEach(x => { x.k = norm(x.key); x.txt = (x.key + " " + x.name + " " + (x.words || "")).toLowerCase(); items.push(x); addKey(x.k, x); }); }
  function addKey(k, it){ if (!k) return; const a = byKey.get(k); if (a) a.push(it); else byKey.set(k, [it]); }

  L.load = () => loading || (loading = fetch("search-data.json").then(r => { if (!r.ok) throw new Error("search data " + r.status); return r.json(); }).then(d => { DB = d; build(); return L; }));
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
  const typeName = t => t === "pfd" ? "On the PFD" : t === "gloss" ? "Glossary" : t === "pid" ? "P&ID" : DB.types[t].n;
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
  const linkify = v => esc(v).replace(TAG_RE, m => { const k = norm(m); return byKey.has(k) ? `<a class="lk-a" data-k="${k}">${m}</a>` : m; });
  L.resultsHTML = (hits, q) => {
    if (!hits.length) return `<div class="lk-empty">No match for “${esc(q)}”. Try fewer characters, e.g. the number only.</div>`;
    return hits.map((it, i) => `<button class="lk-hit" data-i="${i}"><span class="lk-ic">${ICON[it.t] || "•"}</span><span class="lk-hb"><b>${esc(it.key)}</b><span>${esc(it.name)}</span><em>${esc(typeName(it.t))}</em></span></button>`).join("");
  };
  L.itemHTML = (it, opts = {}) => {
    let h = `<div class="lk-kind">${ICON[it.t] || ""} ${esc(typeName(it.t))}</div><div class="lk-key">${esc(it.key)}</div><div class="lk-name">${esc(it.name)}</div>`;
    const pfd = opts.pfd && opts.pfd(it);
    if (pfd) h += `<button class="lk-btn" data-pfd="1">🗺️ ${esc(pfd.label)}</button>`;
    if (it.t === "pfd" || it.t === "gloss"){ h += it.html || `<p>${esc(it.text || "")}</p>`; }
    else if (it.r){
      const f = DB.types[it.t].f;
      h += `<table class="lk-t">` + f.map((n, i) => it.r[i] ? `<tr><td>${esc(n)}</td><td>${linkify(it.r[i])}</td></tr>` : "").join("") + `</table>`;
      const empty = f.filter((n, i) => !it.r[i]);
      if (empty.length) h += `<div class="lk-ns">Not specified in the list: ${esc(empty.join(", "))}.</div>`;
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
  L.find = (k, t) => { const a = byKey.get(k) || []; return (t && a.find(x => x.t === t)) || a[0] || null; };

  // A self contained search box: input, camera, results and item view with back history.
  L.mount = (root, opts = {}) => {
    root.classList.add("lk");
    root.innerHTML = `<div class="lk-bar"><input class="lk-in" type="search" placeholder="${esc(opts.placeholder || "Any tag, line, valve or word")}" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <button class="lk-cam" title="Read a tag from a photo">📷</button><input type="file" accept="image/*" capture="environment" hidden></div>
      <div class="lk-status"></div><div class="lk-body"></div>`;
    const inp = root.querySelector(".lk-in"), cam = root.querySelector(".lk-cam"), file = root.querySelector("input[type=file]"), body = root.querySelector(".lk-body"), stat = root.querySelector(".lk-status");
    const stack = []; let hits = [];
    const status = m => { stat.innerHTML = m || ""; };
    const showList = q => {
      hits = L.search(q); const n = hits.length >= 60 ? L.count(q) : hits.length;
      status(q.trim().length < 2 ? "" : n ? `${n} match${n > 1 ? "es" : ""}${n > hits.length ? ", best " + hits.length + " shown" : ""}` : "");
      body.innerHTML = q.trim().length < 2 ? (opts.intro || "") : L.resultsHTML(hits, q);
      body.querySelectorAll(".lk-hit").forEach(b => b.onclick = () => open(hits[+b.dataset.i], true));
    };
    const open = (it, push) => {
      if (!it) return; if (it.go){ it.go(); return; } if (push) stack.push({ q: inp.value, scroll: body.scrollTop, it: cur });
      cur = it;
      body.innerHTML = `<button class="lk-back">← Back to ${stack.length && stack[stack.length - 1].it ? "previous" : "results"}</button>` + L.itemHTML(it, opts);
      body.scrollTop = 0; if (root.scrollIntoView && opts.scrollTop) opts.scrollTop();
      body.querySelector(".lk-back").onclick = back;
      body.querySelectorAll("a[data-k]").forEach(a => a.onclick = e => { e.preventDefault(); open(L.find(a.dataset.k, a.dataset.t), true); });
      const pb = body.querySelector("[data-pfd]"); if (pb) pb.onclick = () => opts.pfd(it).go();
      if (opts.onOpen) opts.onOpen(it);
    };
    let cur = null;
    const back = () => { const s = stack.pop(); if (s && s.it){ cur = null; open(s.it, false); } else { cur = null; showList(inp.value); if (s) body.scrollTop = s.scroll; } };
    let tmr; inp.addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(() => { stack.length = 0; cur = null; ensure().then(() => showList(inp.value)); }, 120); });
    inp.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); clearTimeout(tmr); stack.length = 0; ensure().then(() => { showList(inp.value); if (hits.length && (hits[0].k === norm(inp.value) || hits.length === 1)) open(hits[0], true); }); inp.blur(); } });
    const ensure = () => DB ? Promise.resolve() : (status("Loading plant lists…"), L.load().then(() => status("")).catch(e => { status("Couldn't load the lists (" + esc(e.message) + "). Check your connection and try again."); throw e; }));
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
.lk-ocr{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--lk-l);background:var(--lk-c);color:var(--ink);font-family:ui-monospace,monospace;font-size:14px;padding:8px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  window.Lookup = L;
})();
