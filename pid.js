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
  // the drawing's own title, without the area (WBS) name in front: "Milling & classification - ball mill F13-SW-003 415V
  // MCC single line diagram sheet 3" is "Ball mill F13-SW-003 …". The first part before " - " goes, and the next ones
  // too while they name no plant tag and a later part does ("CIL4 - carbon treatment & elution - F22-SW-131 - …")
  const TAGX = /\b[A-Z]?\d{2,3}-[A-Z]{2,4}-\d/;
  const short = n => { const d = info(n), t = d && d.title || ""; const a = t.split(" - "); if (a.length < 2) return t;
    a.shift(); while (a.length > 1 && !TAGX.test(a[0]) && a.slice(1).some(x => TAGX.test(x))) a.shift();
    const r = a.join(" - "); return r.charAt(0).toUpperCase() + r.slice(1); };
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
  // the panel under a sheet on a phone (pdfview.js): the drawings this one joins, as pictures in a row to swipe through
  // (its continuations first, in the order printed, then the other drawings named on it); a tap opens one on the whole
  // sheet, with the way back to this sheet marked but not zoomed onto
  let CT = null; const ct = () => CT || (CT = fetch("contents.json").then(r => r.ok ? r.json() : {}).then(j => j.d || {}).catch(() => { CT = null; return {}; }));
  // the P&ID symbol legend: the general legend sheets (F00 P&IDs titled "General legend, sheet n"), in order
  const LEGEND = () => IX ? Object.keys(IX.pids).filter(k => /-PID-/.test(k) && /legend/i.test(IX.pids[k].title || "")).sort() : [];
  const LGI = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="9" cy="8.5" r="1.6"/><path d="M13 8.5h4M7.5 13.5h3M13 13.5h4M7.5 17.5h3M13 17.5h4"/></svg>';
  function panel(el, num, legendFrom){
    Promise.all([refs(), ct()]).then(([R, C]) => {
      // (the drawing itself heads it, number and title, as the tiles under it: the phone shows no title bar over the app's header)
      const me = info(num), h = t => String(t || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      const tl = `<div class="sp-cxn"><i>This drawing</i><b>${h(num.replace(/^2000-/, ""))}</b>${me && me.title ? `<span title="${h(me.title)}">${h(short(num))}</span>` : ""}</div>`;
      const seen = new Set([num]), list = [], leg = LEGEND().includes(num);
      // (the drawing you came from first, marked: blue outline and "↩ Back to")
      const was = window.PdfView && PdfView.came && key(PdfView.came() || "");
      const add = n => { const k = key(n); if (k && !seen.has(k) && PICS(k)){ seen.add(k); list.push(k); } };
      // (a legend sheet: the other legend sheets, in order, in place of its connected drawings)
      if (was && was !== num) add(was);
      if (leg) LEGEND().forEach(add);
      else { (R[num] || []).forEach(r => { if (r[6] === "d") String(r[5]).split("|").forEach(add); });
        ((C[num] || {}).r || []).filter(n => /-(PID|PFD|SLD|TLD|SCM|BLK)-/.test(n)).forEach(add); }
      if (!list.length){ el.innerHTML = tl + `<div class="sp-cxt">Connected drawings</div><div class="lk-ns">No other drawings are named on this sheet.</div>`; return; }
      el.innerHTML = tl + `<div class="sp-cxt">${leg ? `P&amp;ID legend · ${list.length + 1} sheets` : `Connected drawings · ${list.length}`}</div><div class="sp-cxs">` + list.map(n => { const d = info(n);
        return `<button type="button" class="sp-cxd${n === was ? " prev" : ""}" data-n="${n}" title="${(d.title || "").replace(/"/g, "&quot;")}"><img loading="lazy" decoding="async" alt="" src="${d.file}.p1.png"><b>${n === was ? '<i>↩ Back to</i> ' : ""}${n.replace(/^2000-/, "")}</b><span>${short(n) || kind(n)}</span></button>`; }).join("") + `</div>`;
      // (the ribbons on it leading back here are marked, as when a ribbon is tapped; with none, this drawing's number found)
      el.querySelectorAll(".sp-cxd").forEach(b => b.onclick = () => { const n = b.dataset.n, back = [];
        (R[n] || []).forEach((r, j) => { if (r[6] === "d" && String(r[5]).split("|").some(t => key(t) === num)) back.push(j); });
        open(n, back.length || leg ? null : num, { keep: true, extent: true, back: back.length ? back : undefined, legendFrom: leg ? legendFrom : undefined }); });
    });
  }
  // (only drawings with a ready-made picture: the row is pictures)
  const PICS = k => { const d = info(k); return d && d.file; };
  function open(n, find, o = {}){
    const d = info(n); if (!d) return false;
    const r = o.restore;
    PdfView.open({ url: d.file, page: r ? r.page : o.page || 1, fit: d.doc && !d.layout ? "width" : "page", find: find || null, download: label(d.number) + ".pdf", restore: r || null,
      number: d.number, label: label(d.number), sub: short(d.number), title: label(d.number) + (d.title ? " · " + d.title : ""),
      refs: refs().then(R => R[d.number] || []),
      back: o.back, extent: !!o.extent,
      panel: el => panel(el, d.number, o.legendFrom),
      // P&IDs: Drawing legend opens the first legend sheet (the others in the strip under it); on a legend sheet
      // opened that way, the button leads back to the P&ID
      corner: !/-PID-/.test(d.number) ? null : LEGEND().includes(d.number) ? (o.legendFrom && key(o.legendFrom) ? { html: "↩ " + o.legendFrom.replace(/^2000-/, ""), title: "Back to " + o.legendFrom, go: () => open(o.legendFrom, null, { extent: true }) } : null)
        : LEGEND().length ? { html: LGI + "Drawing legend", title: "The P&ID symbol legend", go: () => open(LEGEND()[0], null, { extent: true, legendFrom: d.number }) } : null,
      onRef: (t, k, back, box) => {
        // another drawing: opened with the ribbon back to this one marked (the way back from pid-refs.json), or, when
        // the refs don't know it, this drawing's number found on the sheet
        if (k === "sp"){ const u = window.SP && SP.url(t); if (u) window.open(u, "_blank", "noopener"); return; }
        if (k === "dwg"){ if (!key(t)) return; open(t, back == null ? d.number : null, { keep: true, back }); return; }
        // a tag: its item opens, with this sheet kept beside it and the arrow on the tag tapped (not the item's first drawing)
        if (window.AssetViz && AssetViz.keep && box) AssetViz.keep({ n: d.number, tap: box, key: String(t).split("|")[0] });
        if (window.kcgmOpenTag){ PdfView.hide(); setTimeout(() => kcgmOpenTag(t), 60); }
      } });
    // the drawings its continuations lead to, fetched quietly in the background (kept on the device), so one opens at once
    refs().then(R => { const seen = new Set(); (R[d.number] || []).forEach(r => { if (r[6] === "d" && seen.size < 8){ const t = info(r[5]); if (t && t.file && !seen.has(t.file)) seen.add(t.file); } });
      const go = () => seen.forEach(f => fetch(f).catch(() => {})); window.requestIdleCallback ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1500); });
    return true;
  }
  const kind = n => /-PFD-/.test(n) ? "PFD" : /-SLD-/.test(n) ? "SLD" : /-TLD-/.test(n) ? "TLD" : /-SCM-/.test(n) ? "Schematic" : /-BLK-/.test(n) ? "Block diagram" : "P&ID";
  return { load, short, printedOn, ready: () => !!IX, has: n => !!(IX && key(n)), info, label, open, kind, refs, all: () => IX ? Object.keys(IX.pids).map(info) : [] };
})();
