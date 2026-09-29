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
  function open(n, find){
    const d = info(n); if (!d) return false;
    PdfView.open({ url: d.file, page: 1, fit: "page", find: find || null, download: d.number + ".pdf",
      title: d.number + (d.rev ? " Rev " + d.rev : "") + (d.title ? " · " + d.title : ""), links: links(d.number),
      onLink: x => open(x.n, x.find) });
    return true;
  }
  // the P&IDs this drawing joins through the line list (lookup.js): each opens with its first joining line marked
  function links(n){
    const L = window.Lookup, pl = /-PID-/.test(n) && L && L.ready() && L.pidLinks(n); if (!pl) return null;
    const side = a => a.filter(p => key(p.n)).map(p => { const t = (info(p.n) || {}).title;
      return { n: p.n, find: p.lines[0].key, label: p.n + (t ? " (" + L.pidTitle(t) + ")" : "") + " (x" + p.lines.length + ")" }; });
    return { from: side(pl.from), to: side(pl.to) };
  }
  const kind = n => /-PFD-/.test(n) ? "PFD" : "P&ID";
  return { load, ready: () => !!IX, has: n => !!(IX && key(n)), info, open, kind, all: () => IX ? Object.keys(IX.pids).map(info) : [] };
})();
