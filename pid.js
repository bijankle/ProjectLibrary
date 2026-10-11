// P&IDs and PFD sheets in the app. PIDs/index.json (built by tools/build_pids.py) lists every drawing split out of
// the uploaded sets, one PDF per drawing number. Pid.open(number, find) opens it in the built in viewer (pdfview.js),
// fitted to the screen, with `find` (the tag you came from) marked on the sheet. A drawing is kept on the device the
// first time it is opened (sw.js); Settings can download them all.
window.Pid = (() => {
  let IX = null, loading = null;
  const norm = s => String(s || "").toUpperCase().replace(/[\s\-_/.]+/g, "");
  const byN = new Map();
  const load = () => loading || (loading = fetch("PIDs/index.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => { IX = d; Object.keys(d.pids).forEach(k => byN.set(norm(k), k)); setTimeout(() => refs(), 1500); return d; }).catch(e => { loading = null; throw e; }));
  const key = n => byN.get(norm(n));
  const info = n => { const k = key(n); return k ? Object.assign({ number: k }, IX.pids[k]) : null; };
  // the drawing's name with its revision, as on the Sources tab file names: 2000-F13-PID-PR-10002_Rev2
  const label = n => { const d = info(n); return d ? d.number + (d.rev ? "_Rev" + d.rev : "") : n; };
  // references printed on the sheets (pid-refs.json, tools/build_pid_refs.py): tapping another drawing opens it with the
  // way back marked, tapping a tag opens it in the lookup (window.kcgmOpenTag, set by the page). Back steps through the
  // views (pdfview.js keeps them as browser history).
  let REFS = null;
  // (a scanned sheet carries a tag twice, drawn and in the text layer under it: the second, mostly on top of the first
  // with the same text, is hidden so a match shows one box)
  const same = (a, b) => { if (a[0] !== b[0] || a[5] !== b[5]) return false; const x = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]), y = Math.min(a[2] + a[4], b[2] + b[4]) - Math.max(a[2], b[2]);
    return x > 0 && y > 0 && x * y > .4 * Math.min(a[3] * a[4], b[3] * b[4]); };
  const dedupe = R => { Object.values(R).forEach(a => { const keep = []; a.forEach(r => { if (r[6] !== "x" && keep.some(o => same(o, r))) r[6] = "x"; else keep.push(r); }); }); return R; };   // (marked, not removed: links name refs by their place in the list)
  const refs = () => REFS || (REFS = fetch("pid-refs.json").then(r => r.ok ? r.json() : {}).then(dedupe).then(index).catch(() => { REFS = null; return {}; }));
  // which P&IDs print each tag (for an item whose own P&ID field names a vendor drawing the library doesn't hold)
  let BYTAG = null;
  const index = R => { BYTAG = new Map(); Object.entries(R).forEach(([n, a]) => a.forEach(r => { if (r[6] === "d" || r[6] === "x" || r[6] === "q") return;
    String(r[5]).split("|").forEach(t => { const k = norm(t), m = BYTAG.get(k) || new Map(); m.set(n, (m.get(n) || 0) + 1); BYTAG.set(k, m); }); })); return R; };
  const printedOn = (t, rx = /-PID-/) => { const m = BYTAG && BYTAG.get(norm(t)); return m ? [...m.entries()].filter(([n]) => rx.test(n) && key(n)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(x => x[0]) : []; };
  // the panel under a sheet on a phone (pdfview.js): what is on the drawing as pills (the drawing's own page in the
  // lookup), a row tapped is found on the sheet; a tag tapped on the sheet shows its record card, with the way back to
  // the contents and on to the item's full page
  let cx = null;
  function panel(el, api, num){
    const lk = window.Lookup, nk = s => lk.norm ? lk.norm(s) : norm(s); let home = "";
    const strip = () => el.querySelectorAll(".pf-sec").forEach(sec => { if (!sec.querySelector(".lk-spec")) return;   // (the spec loads on the item page only)
      const b = sec.closest(".pf") && sec.closest(".pf").querySelector(`.pf-b[data-p="${sec.dataset.p}"]`); if (b) b.remove(); sec.remove(); });
    const contents = () => { el.innerHTML = home; el.scrollTop = 0; };
    const card = t => { const it = lk && lk.find(nk(t)); if (!it || it.t === "pid") return false;
      el.innerHTML = `<div class="sp-cxh"><button type="button" data-cx="home">‹ Contents</button><button type="button" data-cx="open">Full page ›</button></div><div class="lk sp-cxc">${lk.itemHTML(it)}</div>`;
      el.dataset.tag = t; strip(); el.scrollTop = 0; return true; };
    el.onclick = e => { const b = e.target.closest("[data-cx]"), a = e.target.closest("a[data-k],a[data-dwg]");
      if (b){ if (b.dataset.cx === "home") contents(); else if (window.kcgmOpenTag){ const t = el.dataset.tag; PdfView.hide(); setTimeout(() => kcgmOpenTag(t), 60); } return; }
      if (!a) return; e.preventDefault();
      if (a.dataset.dwg){ open(a.dataset.dwg, a.dataset.find || num); return; }
      const t = (a.querySelector("b") || a).textContent.trim();
      if (a.dataset.t === "pid"){ open(t, num); return; }
      if (el.querySelector(".sp-cxc")) card(t); else api.find(t); };
    el.innerHTML = `<div class="lk-ns">Reading the drawing…</div>`;
    if (lk) lk.load().then(() => { const it = lk.find(nk(num), "pid"); if (!it) { el.innerHTML = ""; return; }
      const box = document.createElement("div"); box.innerHTML = lk.itemHTML(it); box.querySelectorAll(".lk-head").forEach(x => x.remove());
      // (the pills only: the drawing's own fields are on its page)
      const pf = box.querySelector(".pf"); home = `<div class="sp-cxt">On this drawing · tap one to find it</div><div class="lk sp-cxc0">${pf ? pf.outerHTML : box.innerHTML}</div>`;
      if (!el.querySelector(".sp-cxc")){ contents(); strip(); } });
    return { card: t => lk && lk.find(nk(t)) ? card(t) : false };
  }
  function open(n, find, o = {}){
    const d = info(n); if (!d) return false;
    const r = o.restore;
    PdfView.open({ url: d.file, page: r ? r.page : o.page || 1, fit: d.doc && !d.layout ? "width" : "page", find: find || null, download: label(d.number) + ".pdf", restore: r || null,
      number: d.number, label: label(d.number), title: label(d.number) + (d.title ? " · " + d.title : ""),
      refs: refs().then(R => R[d.number] || []),
      back: o.back,
      panel: (el, api) => { cx = panel(el, api, d.number); },
      onRef: (t, k, back, box) => {
        // another drawing: opened with the ribbon back to this one marked (the way back from pid-refs.json), or, when
        // the refs don't know it, this drawing's number found on the sheet
        if (k === "sp"){ const u = window.SP && SP.url(t); if (u) window.open(u, "_blank", "noopener"); return; }
        if (k === "dwg"){ if (!key(t)) return; open(t, back == null ? d.number : null, { keep: true, back }); return; }
        // a tag: its item opens, with this sheet kept beside it and the arrow on the tag tapped (not the item's first drawing)
        // (phone, whole sheet in view: the tag's record shows in the panel under the sheet instead)
        if (PdfView.panelOn() && cx && cx.card(String(t).split("|")[0])) return;
        if (window.AssetViz && AssetViz.keep && box) AssetViz.keep({ n: d.number, tap: box, key: String(t).split("|")[0] });
        if (window.kcgmOpenTag){ PdfView.hide(); setTimeout(() => kcgmOpenTag(t), 60); }
      } });
    // the drawings its continuations lead to, fetched quietly in the background (kept on the device), so one opens at once
    refs().then(R => { const seen = new Set(); (R[d.number] || []).forEach(r => { if (r[6] === "d" && seen.size < 8){ const t = info(r[5]); if (t && t.file && !seen.has(t.file)) seen.add(t.file); } });
      const go = () => seen.forEach(f => fetch(f).catch(() => {})); window.requestIdleCallback ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1500); });
    return true;
  }
  const kind = n => /-PFD-/.test(n) ? "PFD" : /-SLD-/.test(n) ? "SLD" : /-TLD-/.test(n) ? "TLD" : /-SCM-/.test(n) ? "Schematic" : /-BLK-/.test(n) ? "Block diagram" : "P&ID";
  return { load, printedOn, ready: () => !!IX, has: n => !!(IX && key(n)), info, label, open, kind, refs, all: () => IX ? Object.keys(IX.pids).map(info) : [] };
})();
