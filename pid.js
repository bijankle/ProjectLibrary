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
  // references printed on the sheets (pid-refs.json, tools/build_pid_refs.py): tapping another drawing opens it with the
  // way back marked, tapping a tag opens it in the lookup (window.kcgmOpenTag, set by the page). Back steps through the
  // views (pdfview.js keeps them as browser history).
  let REFS = null;
  const refs = () => REFS || (REFS = fetch("pid-refs.json").then(r => r.ok ? r.json() : {}).catch(() => { REFS = null; return {}; }));
  function open(n, find, o = {}){
    const d = info(n); if (!d) return false;
    const r = o.restore;
    PdfView.open({ url: d.file, page: r ? r.page : o.page || 1, fit: d.doc && !d.layout ? "width" : "page", find: find || null, download: d.number + ".pdf", restore: r || null,
      title: d.number + (d.rev ? " Rev " + d.rev : "") + (d.title ? " · " + d.title : ""),
      refs: refs().then(R => R[d.number] || []),
      back: o.back,
      onRef: (t, k, back) => {
        // another drawing: opened with the ribbon back to this one marked (the way back from pid-refs.json), or, when
        // the refs don't know it, this drawing's number found on the sheet
        if (k === "dwg"){ if (!key(t)) return; open(t, back == null ? d.number : null, { keep: true, back }); return; }
        if (window.kcgmOpenTag){ PdfView.close(); setTimeout(() => kcgmOpenTag(t), 60); }
      } });
    return true;
  }
  const kind = n => /-PFD-/.test(n) ? "PFD" : "P&ID";
  return { load, ready: () => !!IX, has: n => !!(IX && key(n)), info, open, kind, refs, all: () => IX ? Object.keys(IX.pids).map(info) : [] };
})();
