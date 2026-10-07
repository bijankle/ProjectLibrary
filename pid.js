// P&IDs and PFD sheets in the app. PIDs/index.json (built by tools/build_pids.py) lists every drawing split out of
// the uploaded sets, one PDF per drawing number. Pid.open(number, find) opens it in the built in viewer (pdfview.js),
// fitted to the screen, with `find` (the tag you came from) marked on the sheet. A drawing is kept on the device the
// first time it is opened (sw.js); Settings can download them all.
window.Pid = (() => {
  let IX = null, loading = null;
  const norm = s => String(s || "").toUpperCase().replace(/[\s\-_/.]+/g, "");
  const byN = new Map();
  const load = () => loading || (loading = fetch("PIDs/index.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => { IX = d; Object.keys(d.pids).forEach(k => byN.set(norm(k), k)); return d; }).catch(e => { loading = null; throw e; }));
  const key = n => byN.get(norm(n));
  const info = n => { const k = key(n); return k ? Object.assign({ number: k }, IX.pids[k]) : null; };
  // the drawing's name with its revision, as on the Sources tab file names: 2000-F13-PID-PR-10002_Rev2
  const label = n => { const d = info(n); return d ? d.number + (d.rev ? "_Rev" + d.rev : "") : n; };
  // references printed on the sheets (pid-refs.json, tools/build_pid_refs.py): tapping another drawing opens it with the
  // way back marked, tapping a tag opens it in the lookup (window.kcgmOpenTag, set by the page). Back steps through the
  // views (pdfview.js keeps them as browser history).
  let REFS = null;
  const refs = () => REFS || (REFS = fetch("pid-refs.json").then(r => r.ok ? r.json() : {}).catch(() => { REFS = null; return {}; }));
  function open(n, find, o = {}){
    const d = info(n); if (!d) return false;
    const r = o.restore;
    PdfView.open({ url: d.file, page: r ? r.page : o.page || 1, fit: d.doc && !d.layout ? "width" : "page", find: find || null, download: label(d.number) + ".pdf", restore: r || null,
      number: d.number, label: label(d.number), title: label(d.number) + (d.title ? " · " + d.title : ""),
      refs: refs().then(R => R[d.number] || []),
      back: o.back,
      onRef: (t, k, back, box) => {
        // another drawing: opened with the ribbon back to this one marked (the way back from pid-refs.json), or, when
        // the refs don't know it, this drawing's number found on the sheet
        if (k === "dwg"){ if (!key(t)) return; open(t, back == null ? d.number : null, { keep: true, back }); return; }
        // a tag: its item opens, with this sheet kept beside it and the arrow on the tag tapped (not the item's first drawing)
        if (window.AssetViz && AssetViz.keep && box) AssetViz.keep({ n: d.number, tap: box, key: String(t).split("|")[0] });
        if (window.kcgmOpenTag){ PdfView.close(); setTimeout(() => kcgmOpenTag(t), 60); }
      } });
    // the drawings its continuations lead to, fetched quietly in the background (kept on the device), so one opens at once
    refs().then(R => { const seen = new Set(); (R[d.number] || []).forEach(r => { if (r[6] === "d" && seen.size < 8){ const t = info(r[5]); if (t && t.file && !seen.has(t.file)) seen.add(t.file); } });
      const go = () => seen.forEach(f => fetch(f).catch(() => {})); window.requestIdleCallback ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1500); });
    return true;
  }
  const kind = n => /-PFD-/.test(n) ? "PFD" : "P&ID";
  return { load, ready: () => !!IX, has: n => !!(IX && key(n)), info, label, open, kind, refs, all: () => IX ? Object.keys(IX.pids).map(info) : [] };
})();
