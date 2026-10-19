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
  // the drawing's name with its revision, as on the Sources tab file names: 2000-F13-PID-PR-10002_Rev2, or as
  // SharePoint writes a lettered issue: 2000-F13-PID-PR-10002_MS_1
  const revX = r => !r ? "" : /^\d+[A-Z]?$/i.test(r) ? "_Rev" + r : "_" + r;
  const label = n => { const d = info(n); return d ? d.number + revX(d.rev) : n; };
  // references printed on the sheets (pid-refs.json, tools/build_pid_refs.py): tapping another drawing opens it with the
  // way back marked, tapping a tag opens it in the lookup (window.kcgmOpenTag, set by the page). Back steps through the
  // views (pdfview.js keeps them as browser history).
  let REFS = null;
  // (a scanned sheet carries a tag twice, drawn and in the text layer under it: the second, mostly on top of the first
  // with the same text, is hidden so a match shows one box)
  const same = (a, b) => { if (a[0] !== b[0] || a[5] !== b[5]) return false; const x = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]), y = Math.min(a[2] + a[4], b[2] + b[4]) - Math.max(a[2], b[2]);
    return x > 0 && y > 0 && x * y > .4 * Math.min(a[3] * a[4], b[3] * b[4]); };
  // (two boxes over one bubble with different tags, one of them a tag already boxed elsewhere on the page: that one is a
  // stray reading, e.g. LSLL13216 laid over the LAL bubble beside the LALL one; the box naming the bubble's own tag stays)
  const over = (a, b) => { if (a[0] !== b[0]) return false; const x = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]), y = Math.min(a[2] + a[4], b[2] + b[4]) - Math.max(a[2], b[2]);
    return x > 0 && y > 0 && x * y > .5 * Math.min(a[3] * a[4], b[3] * b[4]); };
  const dedupe = R => { Object.values(R).forEach(a => { const keep = []; a.forEach(r => { if (r[6] !== "x" && keep.some(o => same(o, r))) r[6] = "x"; else keep.push(r); });
    const live = a.filter(r => r[6] !== "x" && r[6] !== "d"), cnt = new Map(); live.forEach(r => cnt.set(r[0] + "|" + r[5], (cnt.get(r[0] + "|" + r[5]) || 0) + 1));
    live.forEach(r => { if (r[6] === "x" || cnt.get(r[0] + "|" + r[5]) < 2) return;
      if (live.some(o => o !== r && o[6] !== "x" && o[5] !== r[5] && over(o, r) && cnt.get(o[0] + "|" + o[5]) < 2)){ r[6] = "x"; cnt.set(r[0] + "|" + r[5], cnt.get(r[0] + "|" + r[5]) - 1); } }); }); return R; };   // (marked, not removed: links name refs by their place in the list)
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
  let SW = null;
  // the drawings of one kind (P&IDs, PFDs, SLDs, TLDs, schematics, block diagrams, layouts) in number order; the one
  // after / before a drawing in that row (none past either end)
  const KINDX = /-(PID|PFD|SLD|TLD|SCM|BLK|DRG)-/, ROWS = {};
  const inRow = (n, dir) => { const k = (n.match(KINDX) || [])[1]; if (!k || !IX) return null;
    const row = ROWS[k] || (ROWS[k] = Object.keys(IX.pids).filter(x => (x.match(KINDX) || [])[1] === k && PICS(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    const i = row.indexOf(n); return i < 0 ? null : row[i + dir] || null; };
  function panel(el, num, legendFrom){
    Promise.all([refs(), ct()]).then(([R, C]) => {
      // (the drawing itself heads it, number and title, as the tiles under it: the phone shows no title bar over the app's header)
      const me = info(num), h = t => String(t || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      const tl = `<div class="sp-cxn"><i>This drawing</i><b>${h(num.replace(/^2000-/, ""))}</b>${me && me.title ? `<span title="${h(me.title)}">${h(short(num))}</span>` : ""}</div>`;
      const seen = new Set([num]), list = [], leg = LEGEND().includes(num);
      // (the drawing you came from first, marked: blue outline and a round blue back arrow in its top left corner)
      // (on a legend sheet: all the sheets in order, the one in view outlined (no label, so the numbers line up), no "Back to")
      const was = !leg && window.PdfView && PdfView.came && key(PdfView.came() || "");
      const add = n => { const k = key(n); if (k && !seen.has(k) && PICS(k)){ seen.add(k); list.push(k); } };
      // (a legend sheet: the other legend sheets, in order, in place of its connected drawings)
      if (was && was !== num) add(was);
      if (leg){ seen.delete(num); LEGEND().forEach(add); }
      else { (R[num] || []).forEach(r => { if (r[6] === "d") String(r[5]).split("|").forEach(add); });
        ((C[num] || {}).r || []).filter(n => /-(PID|PFD|SLD|TLD|SCM|BLK)-/.test(n)).forEach(add); }
      const go = n => { const back = []; if (!n || n === num) return;
        (R[n] || []).forEach((r, j) => { if (r[6] === "d" && String(r[5]).split("|").some(t => key(t) === num)) back.push(j); });
        open(n, back.length || leg ? null : num, { keep: true, extent: true, back: back.length ? back : undefined, legendFrom: leg ? legendFrom : undefined }); };
      // a swipe across the whole sheet, or its ‹ › arrows (pdfview.js): on the legend, the next / previous sheet in
      // order; elsewhere the next / previous drawing number of the same kind (2000-F00-PID-PR-10001, then …-10002)
      SW = { num, target: dir => leg ? list[list.indexOf(num) + dir] : inRow(num, dir), go };
      // (the drawings either side fetched at once, picture first, so a swipe either way slides straight onto the next one)
      [1, -1].forEach(dir => { const t = SW.target(dir), f = t && (info(t) || {}).file; if (!f) return; const im = new Image(); im.decoding = "async"; im.src = f + ".p1.png"; fetch(f).catch(() => {}); });
      if (window.PdfView && PdfView.arrows) PdfView.arrows();
      // under the sheet: what is on it, a pill per kind with its count (All first), then the tags, one line each; a tag
      // tapped zooms the sheet to it (tap it there to open its page)
      if (window.Lookup && Lookup.find){
        const nm = s => String(s || "").toUpperCase().replace(/[\s\-_/.]+/g, ""), PN = { mel: "Equipment", elec: "Electrical", cable: "Cables", ins: "Instruments", cv: "Control valves", mv: "Manual valves", line: "Lines", spi: "Specials", hose: "Hoses", ctl: "Control tags", otag: "Read on drawing" };
        const its = [...new Set(((C[num] || {}).k || []).map(t => { const f = Lookup.find(nm(t)); return f && f.dupOf ? f.dupOf : f; }).filter(x => x && x.t !== "pid"))];
        const ord = Object.keys(PN); its.sort((a, b) => ord.indexOf(a.t) - ord.indexOf(b.t) || String(a.key).localeCompare(String(b.key), undefined, { numeric: true }));
        const cnt = {}; its.forEach(it => [it.t, ...(it.also || [])].forEach(t => cnt[t] = (cnt[t] || 0) + 1));
        const types = ord.filter(t => cnt[t]); let only = "";
        const rows = () => its.filter(it => !only || it.t === only || (it.also || []).includes(only)).map(it => `<button type="button" class="sp-cxr" data-k="${h(it.key)}"><b>${h(it.key)}</b><span>${h(Lookup.listName ? Lookup.listName(it) : it.name)}</span></button>`).join("");
        const draw = () => { el.innerHTML = !its.length ? `<div class="lk-ns">No tags read on this sheet.</div>` : `<div class="sp-cxp"><button type="button" class="sp-cxpl${only ? "" : " on"}" data-t="">All <i>${its.length}</i></button>${types.map(t => `<button type="button" class="sp-cxpl${only === t ? " on" : ""}" data-t="${t}">${PN[t]} <i>${cnt[t]}</i></button>`).join("")}</div><div class="sp-cxl">${rows()}</div>`;
          el.querySelectorAll(".sp-cxpl").forEach(b => b.onclick = () => { only = b.dataset.t; draw(); });
          el.querySelectorAll(".sp-cxr").forEach(b => b.onclick = () => PdfView.find && PdfView.find(b.dataset.k)); };
        draw(); return;
      }
      if (!list.length){ el.innerHTML = tl + `<div class="sp-cxt">Connected drawings</div><div class="lk-ns">No other drawings are named on this sheet.</div>`; return; }
      el.innerHTML = tl + `<div class="sp-cxt">${leg ? `P&amp;ID legend · ${list.length} sheets` : `Connected drawings · ${list.length}`}</div><div class="sp-cxs">` + list.map(n => { const d = info(n);
        return `<button type="button" class="sp-cxd${n === was ? " prev" : ""}${n === num ? " cur" : ""}" data-n="${n}" title="${(d.title || "").replace(/"/g, "&quot;")}"><img loading="lazy" decoding="async" alt="" src="${d.file}.p1.png">${n === was ? '<i class="sp-cxb" title="Back to this drawing">↩</i>' : ""}<b>${n.replace(/^2000-/, "")}</b><span>${short(n) || kind(n)}</span></button>`; }).join("") + `</div>`;
      // (the ribbons on it leading back here are marked, as when a ribbon is tapped; with none, this drawing's number found)
      { const c = el.querySelector(".sp-cxd.cur"), sc = el.querySelector(".sp-cxs"); if (c && sc) sc.scrollLeft = Math.max(0, c.offsetLeft - sc.offsetLeft - (sc.clientWidth - c.offsetWidth) / 2); }
      el.querySelectorAll(".sp-cxd").forEach(b => b.onclick = () => go(b.dataset.n));
    });
  }
  // (only drawings with a ready-made picture: the row is pictures)
  const PICS = k => { const d = info(k); return d && d.file; };
  function open(n, find, o = {}){
    const d = info(n); if (!d) return false;
    const r = o.restore;
    PdfView.open({ url: d.file, page: r ? r.page : o.page || 1, fit: d.doc && !d.layout ? "width" : "page", find: find || null, download: label(d.number) + ".pdf", restore: r || null,
      number: d.number, label: label(d.number), sub: short(d.number), nodn: !!d.tb, title: label(d.number) + (d.title ? " · " + d.title : ""),
      refs: refs().then(R => R[d.number] || []),
      back: o.back, extent: !!o.extent, revive: o.revive || null,
      panel: el => panel(el, d.number, o.legendFrom),
      // (true when there is a drawing that way: the sheet then slides out)
      swipe: (dir, run) => { const t = SW && SW.num === d.number && SW.target(dir); if (t && run) SW.go(t); return !!t; },
      // P&IDs: Drawing legend opens the first legend sheet (the others in the strip under it); on a legend sheet
      // opened that way, the button leads back to the P&ID
      corner: !/-PID-/.test(d.number) ? null : LEGEND().includes(d.number) ? (o.legendFrom && key(o.legendFrom) ? { html: "↩ " + o.legendFrom.replace(/^2000-/, ""), title: "Back to " + o.legendFrom, go: () => open(o.legendFrom, null, { extent: true }) } : null)
        : LEGEND().length ? { html: document.documentElement.classList.contains("phone") ? "Legend" : LGI + "Drawing legend", title: "The P&ID symbol legend", go: () => open(LEGEND()[0], null, { extent: true, legendFrom: d.number }) } : null,
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
      const go = () => seen.forEach(f => { fetch(f).catch(() => {}); fetch(f + ".p1.png").catch(() => {}); }); window.requestIdleCallback ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1500); });
    return true;
  }
  const kind = n => /-PFD-/.test(n) ? "PFD" : /-SLD-/.test(n) ? "SLD" : /-TLD-/.test(n) ? "TLD" : /-SCM-/.test(n) ? "Schematic" : /-BLK-/.test(n) ? "Block diagram" : /-DSH-/.test(n) ? "Datasheet" : /-PHL-/.test(n) ? "Philosophy" : /-DCR-/.test(n) ? "PDC" : /-PID-/.test(n) ? "P&ID" : "Drawing";
  return { load, short, printedOn, ready: () => !!IX, has: n => !!(IX && key(n)), info, label, open, kind, refs, all: () => IX ? Object.keys(IX.pids).map(info) : [] };
})();
