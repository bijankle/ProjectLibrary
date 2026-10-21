// Asset charts: the desktop Assets tab's empty right side. Drawn from the same rows the Browse filter on the left
// shows (Browse calls AssetViz.update on every change), so picking Equipment → PP → F13 redraws them for just those.
// Tapping a bar applies it as the next filter step where it can (asset type, equipment code, area) or opens the item.
// Forms: headline tiles, ranked bars (one hue: the app's gold), donuts only for splits of 5 parts or fewer, each with
// its values written in the legend. Hover any mark for its figure. Desktop only (wide screen with a mouse).
window.AssetViz = (() => {
  const HAND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13M17 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L3.6 14.6a1.5 1.5 0 0 1 2.2-2L8 14.5"/></svg>',
    ARROW = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l14 8.5-6.2 1.3L16.5 20l-2.8 1.3-3.7-7.2L5 18.5z"/></svg>';
  const FIT = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = n => Math.round(n).toLocaleString();
  const kwOf = s => { const v = parseFloat(String(s || "").replace(/[^0-9.]/g, "")); return isFinite(v) ? v : 0; };
  const GONE = /decommission|removed/i;   // not counted in installed power
  const TN = { mel: "Equipment", ins: "Instruments", cv: "Control valves", mv: "Manual valves", line: "Lines", spi: "Pipe specials", hose: "Hoses", pid: "P&IDs", pfdd: "PFDs" };
  let el = null, ctx = null, tip = null, lastSig = "";
  const wide = () => matchMedia("(min-width: 1100px) and (hover: hover)").matches;

  function mount(root){
    el = root;
    tip = document.createElement("div"); tip.className = "vz-tip"; tip.hidden = true; document.body.appendChild(tip);
    el.addEventListener("mousemove", e => { const m = e.target.closest("[data-tip]"); if (!m){ tip.hidden = true; return; }
      tip.innerHTML = m.dataset.tip; tip.hidden = false;
      const x = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14), y = Math.max(8, e.clientY - tip.offsetHeight - 10);
      tip.style.left = x + "px"; tip.style.top = y + "px"; });
    el.addEventListener("mouseleave", () => tip.hidden = true);
    el.addEventListener("click", e => { const m = e.target.closest("[data-f]"); if (!m || !ctx) return;
      if (m.dataset.f === "open") ctx.open(m.dataset.v); else ctx.choose(m.dataset.f, m.dataset.v); });
    addEventListener("resize", () => { if (ctx) draw(true); });
  }
  function update(list, c){ ctx = Object.assign({ list }, c); if (!cur) draw(); }   // (a drawing on show isn't redrawn by the list)

  // ---------- an open item: its P&ID (or PFD sheet) instead of the charts ----------
  // the whole sheet fits the space with the item marked; drawing number tabs above when there are several; a click on
  // the sheet opens it full screen in the drawing viewer
  let cur = null, shown = null, hist = [], gen = 0, arrival = null, keepView = null, held = null;
  // a line being flown through on the drawing (kept while the item on the left changes, the sheet staying), and one
  // asked for on the next sheet (an arrow at the end of the line strip, into a continuation)
  let TRV = null, TRP = null;
  const bboxP = fetch("sheet-bbox.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const ORD = new Intl.Collator(undefined, { numeric: true });
  const nk = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // A drawing on show stays while you search (you may be reading tags off it): it changes only when an item with a
  // drawing of its own opens, and goes back to the charts on Home.
  function item(it){
    const own = window.Lookup && Lookup.drawingsOf ? Lookup.drawingsOf(it) : [];
    const tapped = keepView && (keepView.tap || keepView.force) && nk(keepView.key) === nk(it.key);   // (opened by a tap on its label: that sheet, the label blue)
    if (!own.length && !tapped && cur && shown && (!window.Pid || Pid.ready())) return;   // (an item with no drawing: keep the one on show)
    // (a kept view waits for the item it was kept for: closing the full screen viewer steps back through the one before)
    if (keepView && keepView.key && nk(keepView.key) !== nk(it.key)){ cur = it; return; }
    const kv = keepView && (own.includes(keepView.n) || keepView.tap || keepView.force) ? keepView : null; keepView = null;
    if (!kv) TRV = null;   // (an item picked on the left, not from the drawing: its drawing afresh, no fly through)
    cur = it; shown = kv ? kv.n : null; hist = []; lastSig = ""; held = kv; draw(true); if (window.Pid && !Pid.ready()) Pid.load().then(() => { if (cur === it) draw(true); }).catch(() => {}); }
  function list(){}
  // Back to an item: its drawing as it was left (index.html keeps it with the history step)
  const restoreView = v => { if (!v || !v.n || (window.Pid && Pid.ready() && !Pid.has(v.n))) return; keepView = { n: v.n, z: v.z, tx: v.tx, ty: v.ty, tap: v.tap || null, key: v.key, force: true }; setTimeout(() => { if (keepView && keepView.force) keepView = null; }, 2500); };
  const keep = o => { keepView = { n: o.n, tap: o.tap || null, key: o.key || null }; setTimeout(() => { keepView = null; }, 2500); };
  // the Assets search box finds on the drawing on show, literally, as the full screen viewer does: the labels it holds
  // (references whose printed tag has the typed text) in blue, else the sheet's own words that do
  let finder = null, refsNow = [], findQ = "";
  const fnorm = s => String(s || "").toUpperCase().replace(/[\s\-_/.]+/g, "");
  function find(q){ findQ = q || ""; findNow(); }
  function findNow(){
    if (!finder || finder.g !== gen) return; const { box, stage } = finder, fd = box.querySelector(".vz-fd"), rf = box.querySelector(".vz-rf"); if (!fd || !rf) return;
    const w = fnorm(findQ); [...rf.children].forEach(i => i.classList.remove("hit")); fd.innerHTML = ""; if (w.length < 2) return;
    let n = 0; refsNow.forEach((r, i) => { if (String(r[5]).split("|").some(t => fnorm(t).includes(w)) && rf.children[i]){ rf.children[i].classList.add("hit"); n++; } });
    if (n) return;
    const sr = stage.getBoundingClientRect(), z = finder.z || 1;
    // (a word the sheet carries twice in one place, its own text and the OCR reading, gets one box)
    const qs = [], same = (a, b) => { const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return x > 0 && y > 0 && x * y > .4 * Math.min(a.width * a.height, b.width * b.height); };
    [...box.querySelectorAll(".vz-tx span")].filter(sp => fnorm(sp.textContent).includes(w)).forEach(sp => { const q = sp.getBoundingClientRect(); if (qs.length < 300 && !qs.some(o => same(o, q))) qs.push(q); });
    fd.innerHTML = qs.map(q => `<i style="left:${(q.left - sr.left) / z - 2}px;top:${(q.top - sr.top) / z - 2}px;width:${q.width / z + 4}px;height:${q.height / z + 4}px"></i>`).join("");
  }
  function home(){ if (!cur) return; cur = null; shown = null; lastSig = ""; draw(true); }
  // a drawing's series: the sheets whose title differs only by the sheet number ("Plant air, sheet 3" → "Plant air"),
  // P&IDs with P&IDs, PFDs with PFDs, in sheet order
  const SH = /,?\s*sheet\s+(\d+)(\s+of\s+\d+)?/i;
  const series = n => { const d = Pid.info(n); if (!d || !SH.test(d.title || "")) return [n];
    const base = t => String(t || "").replace(SH, "").trim().toLowerCase(), b = base(d.title), k = /-PFD-/.test(n);
    return Pid.all().filter(x => x && SH.test(x.title || "") && base(x.title) === b && /-PFD-/.test(x.number) === k)
      .map(x => [x.number, +SH.exec(x.title)[1]]).sort((a, c) => a[1] - c[1] || a[0].localeCompare(c[0])).map(x => x[0]); };
  const sheetOf = n => { const m = SH.exec((Pid.info(n) || {}).title || ""); return m ? +m[1] : null; };
  let HELDV = null;
  async function titleBlock(tb, n, d){
    const held = await (HELDV || (HELDV = fetch("sp-held.json").then(r => r.ok ? r.json() : {}).catch(() => ({})))); if (!tb.isConnected) return;
    const num = d.number || n, raw = held[num] || (window.SP ? (SP.url(num) || "") : ""), url = raw ? (window.SP ? SP.view(raw) : raw) : "";
    const m = String(raw).match(/_((?:MS_)?[0-9A-Z]{1,3})(?:_(?:APP|RNC|RWC|IFC|IFR|AFC|IFA))?\.pdf$/i), sr = m ? m[1] : "", rev = String(d.rev || "");
    const st = !sr ? `<span class="q">Not in the document register's SharePoint links: check the register for the latest revision.</span>`
      : !rev ? `<span class="warn">The app has no revision recorded for this copy. SharePoint's latest file is ${esc(sr)}: check it there.</span>`
      : sr.toUpperCase() === rev.toUpperCase() ? `<span class="ok">✓ Same revision as the latest file in SharePoint (${esc(sr)})</span>`
      : `<span class="warn">SharePoint's latest file is ${esc(sr)}: this copy is ${esc(rev || "unknown")}. Check SharePoint.</span>`;
    // (one strip, as a drawing's header reads: number_rev, then the title; the number opens SharePoint's latest file, its
    // tint and the mark after it say whether that is the revision shown here, the words in its tooltip)
    const k = !sr ? "q" : sr.toUpperCase() === rev.toUpperCase() ? "ok" : "warn", why = st.replace(/<[^>]+>/g, ""), nr = esc(num + (rev ? "_" + rev : ""));
    const no = url ? `<a class="${k}" href="${esc(url)}" target="_blank" rel="noopener" title="Open the latest file in SharePoint. ${esc(why)}">${nr}</a>` : `<b class="${k}" title="${esc(why)}">${nr}</b>`;
    const mk = `<span class="m ${k}" title="${esc(why)}">${k === "ok" ? '<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.3 2.3 4.7-5"/></svg>' : k === "warn" ? "!" : "?"}</span>`, v = tb.dataset.v || "c";
    tb.innerHTML = v === "b" ? `<div class="c n">${no}${mk}</div><div class="c t"><b>${esc(d.title || "")}</b></div>`
      : `<div class="c n"><i>DRAWING No._REV</i><span>${no}${v === "a" ? mk : ""}</span></div><div class="c t"><i>TITLE</i><b>${esc(d.title || "")}</b></div>`
        + (v === "c" ? `<div class="c s"><i>SHAREPOINT</i><span class="${k}">${k === "ok" ? "✓ LATEST" : k === "warn" ? "! " + esc(sr) + " IS LATEST" : "? NOT LINKED"}</span></div>` : ""); }
  function drawItem(){
    const g = ++gen, own = window.Lookup && Lookup.drawingsOf ? Lookup.drawingsOf(cur) : [];
    if ((!own.length && !shown) || !window.Pid || !window.PdfView){ el.innerHTML = ""; return; }
    if (!shown) shown = own[0];
    const n = shown, d = Pid.info(n) || {}, ser = series(n), go = x => { if (x === shown) return; hist.push(shown); shown = x; drawItem(); };
    // over the sheet, the drawing tools (desktop): the hand (drag), the pointer (select text) and zoom to fit; the other
    // sheets of a series are reached through their continuation boxes on the drawing
    el.style.paddingTop = "";   // (the charts' extra top room, to line up with the Results band, is not for a drawing: it sits snug at the top)
    el.innerHTML = `<div class="vz-pv">${document.documentElement.classList.contains("phone") ? `<div class="vz-hd vz-tools"><b class="vz-ttl">${esc(Pid.label(n))}</b></div>` : ""}` +
      `<div class="vz-sheet"><div class="vz-tg"><button type="button" data-z="hand" class="vz-md" title="Pan: drag the drawing">${HAND}</button><button type="button" data-z="sel" class="vz-md" title="Select text">${ARROW}</button><i></i><button type="button" data-z="fit" title="Zoom to fit the whole sheet">${FIT}</button></div><div class="sp-fltk vz-fltk" hidden><label><input type="checkbox" data-f="c"><span>Colours</span></label><label><input type="checkbox" data-f="w"><span>Animation</span></label></div><div class="sp-flg lkC dk vz-flg" hidden></div><div class="vz-stage"><canvas></canvas><svg class="sp-fl"></svg><div class="vz-rf"></div><div class="vz-fd"></div><div class="vz-tx sp-text"></div><div class="vz-mk"></div></div>` +
      `<div class="vz-zb"><button type="button" data-z="out" title="Zoom out">−</button><button type="button" data-z="in" title="Zoom in">+</button><button type="button" data-z="full" title="Open full screen"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button><button type="button" data-z="fit" class="vz-ze" title="Zoom extents (whole sheet)"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button></div>` +
      `<p class="vz-note">Loading the drawing…</p></div></div>`;
    el.querySelectorAll(".vz-tab[data-n]").forEach(b => b.onclick = () => { if (b.dataset.n) go(b.dataset.n); });
    // the drawing's title block under the sheet, laid out as on the drawing (the drawing's own was cleared from the app's
    // copy: it names companies and people): its number, tinted as a link, opens SharePoint's latest file; a line under it
    // says whether that file is the revision shown here
    // (desktop, 41B2: the drawing tools, the line tick boxes and the fluid codes in a bar above the drawing, off the sheet;
    // the drawing's header strip, number_rev and title, in that bar after the tools: no page heading, no title block under it)
    if (!document.documentElement.classList.contains("phone")){ const cb = document.createElement("div"); cb.className = "vz-cb";
      const hb = document.createElement("div"), v = document.documentElement.dataset.hb || "c"; hb.className = "vz-hb " + v; hb.dataset.v = v;
      cb.append(el.querySelector(".vz-tg")); if (v === "c") el.querySelector(".vz-sheet").before(hb); else cb.append(hb);
      cb.append(el.querySelector(".vz-fltk"), el.querySelector(".vz-flg")); el.querySelector(".vz-sheet").before(cb); titleBlock(hb, n, d); }
    const box = el.querySelector(".vz-sheet"), stage = box.querySelector(".vz-stage"), cv = box.querySelector("canvas"), key = cur.key;
    let z = 1, tx = 0, ty = 0, W = 0, H = 0, page = null, sc = 1, rz = 0, rt = null;
    // the drawing's own box on the page (sheet-bbox.json, fractions): the view fits that, not the page's empty margin
    let bb = [0, 0, 1, 1], vw0 = 0, vh0 = 0;
    // the place tapped or found: a highlighted box on it (no arrow), in 1/10000 of the sheet, grown a little as in the full screen viewer
    // turn the click boxes passing test(i, ref) blue; how many
    const pick = test => { const rf = box.querySelector(".vz-rf"); let n = 0; [...rf.children].forEach((e, i) => { const on = !!(refsNow[i] && test(i, refsNow[i])); e.classList.toggle("pick", on); n += on; }); report(); return n; };
    // this view (sheet, zoom, place, the box picked) into the page's history step, for Back (index.html kcgmDv)
    let dvT = 0; const report = () => { clearTimeout(dvT); dvT = setTimeout(() => { if (g !== gen || !cur || !window.kcgmDv) return; const rf = box.querySelector(".vz-rf"), pi = rf ? [...rf.children].findIndex(e => e.classList.contains("pick")) : -1;
      kcgmDv({ key: cur.key, n, z, tx, ty, tap: pi >= 0 && boxes[pi] ? boxes[pi] : (tapNow || null) }); }, 350); lastView = { n, z, tx, ty, tap: null }; };
    let tapNow = null;
    const hbox = (l, t, w, h) => { const [a, b, c, d] = PdfView.grow(l, t, w, h, W / H); return `<i class="sp-hb sp-hbon" style="left:${a / 1e4 * W}px;top:${b / 1e4 * H}px;width:${c / 1e4 * W}px;height:${d / 1e4 * H}px"></i>`; };
    // (the drawing kept in the window: centred while smaller than it, else no further than its edges)
    const fitAx = (t, a, b, page, view) => { const lo = a * page * z, hi = b * page * z; return hi - lo <= view ? (view - (hi - lo)) / 2 - lo : Math.min(-lo, Math.max(view - hi, t)); };
    // (kf: the pane widened or narrowed since the sheet was laid out, the divider being dragged: the whole view scaled
    // with it at once, redrawn sharp at the new size when the drag ends)
    let kf = 1;
    // (and the lines' widths in screen pixels at every step of a zoom, as on the phone: the stage's scale taken back off)
    const apply = () => { z = Math.max(1, Math.min(10, z)); tx = fitAx(tx, bb[0], bb[2], W, vw0 || W); ty = fitAx(ty, bb[1], bb[3], H, vh0 || H);
      stage.style.transform = `translate(${tx * kf}px,${ty * kf}px) scale(${z * kf})`; stage.style.setProperty("--iz", (1 / z).toFixed(4)); stage.style.setProperty("--rbw", (1.5 / z).toFixed(3) + "px"); { const k = z * kf; stage.style.setProperty("--swk", (1 / k).toFixed(4)); stage.style.setProperty("--flw", Math.max(2.2, Math.min(8, 2.4 * k)).toFixed(2) + "px"); } clearTimeout(rt); rt = setTimeout(sharp, 180); report(); };
    // zoom onto boxes ([l, t, w, h] in 1/10000 of the sheet): all of them in view, but never closer than 4x
    const focus = bs => { if (!bs.length) return; const l = Math.min(...bs.map(b => b[0])) / 1e4 * W, t = Math.min(...bs.map(b => b[1])) / 1e4 * H,
      r = Math.max(...bs.map(b => b[0] + b[2])) / 1e4 * W, b = Math.max(...bs.map(q => q[1] + q[3])) / 1e4 * H, vw = box.clientWidth || W, vh = box.clientHeight || H;
      z = Math.max(1, Math.min(2, .8 * Math.min(vw / Math.max(1, r - l), vh / Math.max(1, b - t)))); tx = vw / 2 - (l + r) / 2 * z; ty = vh / 2 - (t + b) / 2 * z; apply(); };
    const zoomAt = (f, x, y) => { x /= kf; y /= kf; const z0 = z; z = Math.max(1, Math.min(10, z * f)); tx = x - (x - tx) * z / z0; ty = y - (y - ty) * z / z0; apply(); };
    // drawn at twice the size it shows at least (a scanned sheet drawn at its own size comes out soft; drawn larger and
    // shown smaller it is crisp), after a first quick pass at its size so the sheet is up at once (sharp(1))
    async function sharp(first){ if (!page) return; const q = first || Math.min(4, Math.max(2, Math.ceil(z))), dpr = devicePixelRatio || 1; if (q === rz) return; rz = q;
      const vp = page.getViewport({ scale: sc * q * dpr }), off = document.createElement("canvas"); off.width = Math.round(vp.width); off.height = Math.round(vp.height);
      await page.render({ canvasContext: off.getContext("2d"), viewport: vp }).promise; if (g !== gen || rz !== q) return;
      cv.width = off.width; cv.height = off.height; cv.getContext("2d").drawImage(off, 0, 0); }
    const zbClick = e => { const b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      if (b.dataset.z === "full") return Pid.open(n, cur.t === "pid" ? null : key);
      if (b.dataset.z === "hand" || b.dataset.z === "sel"){ try { localStorage.setItem("kcgm_spm", b.dataset.z); } catch (x) {} mode(); return; }
      if (b.dataset.z === "fit"){ z = 1; tx = -1e9; ty = -1e9; apply(); return; }
      zoomAt(b.dataset.z === "in" ? 1.6 : 1 / 1.6, W / 2 * kf, H / 2 * kf); };
    box.querySelector(".vz-zb").onclick = zbClick; el.querySelector(".vz-tg").onclick = zbClick;
    box.addEventListener("wheel", e => { e.preventDefault(); const r = box.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * .001), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    box.addEventListener("dblclick", e => { if (e.target.closest(".vz-trb,.vz-fltk,.vz-flg")) return; const r = box.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top); });
    // drag to pan (a press that doesn't move is a tap: references still work); two fingers pinch
    const pts = new Map(); let moved = 0, pinch = null;
    box.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });   // (no browser auto-scroll: that moved the whole page)
    box.addEventListener("auxclick", e => { if (e.button === 1) e.preventDefault(); });
    box.addEventListener("pointerdown", e => { if (e.target.closest(".vz-zb,.vz-tg,.vz-fltk,.vz-flg,.vz-trb")) return; moved = 0;
      if (e.pointerType === "mouse" && e.button !== 1 && !(e.button === 0 && box.classList.contains("vz-hand"))) return;   // (mouse: the hand drags with the left button, the pointer selects text; the middle one always pans)
      if (e.pointerType === "mouse") e.preventDefault(); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2){ const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; } });
    box.addEventListener("pointermove", e => { const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 2 && pinch){ pts.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...pts.values()], r = box.getBoundingClientRect();
        zoomAt(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d / z, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); moved = 9; return; }
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; moved += Math.abs(dx) + Math.abs(dy); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (moved > 4){ box.classList.add("drag"); try { box.setPointerCapture(e.pointerId); } catch (x) {} tx += dx / kf; ty += dy / kf; apply(); } });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; setTimeout(() => box.classList.remove("drag"), 0); };
    box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
    // the hand / pointer switch (shared with the docked viewer): the hand drags, the pointer selects text
    const mode = () => { let m = "hand"; try { m = localStorage.getItem("kcgm_spm") || "hand"; } catch (x) {} box.classList.toggle("vz-hand", m !== "sel");
      el.querySelectorAll(".vz-md").forEach(x => x.classList.toggle("on", x.dataset.z === (m === "sel" ? "sel" : "hand"))); }; mode();
    box.addEventListener("click", e => { if (box.classList.contains("vz-hand") && moved > 4 && !e.target.closest(".vz-zb,.vz-tg")){ e.stopPropagation(); e.preventDefault(); } }, true);
    // references printed on the sheet (other drawings, tags): tap to follow
    let boxes = [];
    const rfEl = box.querySelector(".vz-rf"), refAt = (x, y) => { if (!boxes.length) return null; const q = rfEl.getBoundingClientRect(); if (!q.width) return null;
      const i = PdfView.nearest(boxes, (x - q.left) / q.width * 1e4, (y - q.top) / q.height * 1e4); return i >= 0 ? rfEl.children[i] : null; };
    let hv = null; box.addEventListener("mousemove", e => { const a = pts.size ? null : refAt(e.clientX, e.clientY); if (a === hv) return; if (hv) hv.classList.remove("hv"); hv = a; if (a) a.classList.add("hv"); box.classList.toggle("on-ref", !!a); });
    // (a text selection made on the sheet means that click was the end of selecting; one elsewhere on the page, e.g. the
    // item's heading, doesn't stop a tap on the sheet)
    box.addEventListener("click", e => { if (e.target.closest(".vz-zb,.vz-fltk,.vz-flg,.vz-trb") || moved > 4) return; const sl = getSelection(); if (sl && !sl.isCollapsed && String(sl).trim() && box.contains(sl.anchorNode)) return;
      const a = refAt(e.clientX, e.clientY), dk = !document.documentElement.classList.contains("phone");
      // a line number, or the pipe itself: the fly through along it, here on this sheet, and its asset page on the left
      if (dk && isPid && a && a.dataset.k === "line"){ const lab = a.dataset.t.split("|")[0], k = flRefs.findIndex((r, i) => r[6] === "line" && r[0] === 1 && String(r[5]).split("|")[0] === lab && flD && flD[i]);
        if (k >= 0){ if (!(T && T.k === k)){ flPick = null; trStart(k, null, 0); }
          // (its page on the left, the fly through kept: not the tag branch below, which leaves the fly through)
          e.stopPropagation(); keepView = { n, z, tx, ty, tap: boxes[[...rfEl.children].indexOf(a)] || null }; if (window.kcgmOpenTag) kcgmOpenTag(lab); setTimeout(() => { keepView = null; }, 2000); return; } }
      if (dk && isPid && !a && !e.target.closest(".vz-tg")){ const hit = pipeAt(e.clientX, e.clientY);
        if (hit){ e.stopPropagation(); if (!(T && T.k === hit.k)){ flPick = null; trStart(hit.k, hit.at, 0, hit.label); }
          if (hit.u) return;   // (an unnumbered pipe: no item to show)
          // (force: a line traced from the sheet text alone, no label box to mark: the sheet kept as it is)
          keepView = { n, z, tx, ty, tap: boxes[refsNow.indexOf(flRefs[hit.k])] || null, force: typeof hit.k === "string" }; if (window.kcgmOpenTag) kcgmOpenTag(hit.label); setTimeout(() => { keepView = null; }, 2000); return; } }
      // (the bare sheet: out of the fly through, or back to every fluid in colour, the drawing as it is)
      if (!a && T){ e.stopPropagation(); trEnd(); return; }
      if (!a && flPick){ e.stopPropagation(); flPickSet(null); return; }
      if (!a && hiB){ e.stopPropagation(); hiB = null; flDraw(); return; }
      // (an empty part of the sheet, an asset's page showing: the drawing's own page, the sheet left as it is)
      if (!a){ if (cur && cur.t !== "pid" && !document.documentElement.classList.contains("phone") && window.kcgmOpenTag && !e.target.closest(".vz-tg")){ keepView = { n, z, tx, ty, tap: null, force: true }; setTimeout(() => { if (keepView && keepView.force) keepView = null; }, 2500); kcgmOpenTag(n); } return; }
      e.stopPropagation();
      const t = a.dataset.t, k = a.dataset.k;
      // a continuation: that drawing becomes the item on the left, with the ribbon back to this one marked (pid-refs way back)
      // (zoomed in, or flying along a line: the next sheet zoomed onto the way back and the line flown on; at the whole
      // sheet the next one opens whole too, for hopping sheet to sheet)
      if (k === "d"){ if (Pid.has(t)){ const zin = !!T || z > 1.001; arrival = { to: t, back: a.dataset.b ? JSON.parse(a.dataset.b) : null, ext: !zin };
        if (zin && isPid) TRP = { at: Date.now(), label: T ? T.label : null, dir: 1, from: d.number }; TRV = null;
        if (window.kcgmOpenTag) kcgmOpenTag(t); else go(t); } return; }
      // a tag on this sheet: its item opens on the left and the sheet stays as you have it (same zoom and place), only the arrow moves
      if (T) trEnd();   // (an instrument, equipment, a valve picked while flying along a line: out of the fly through, the sheet kept)
      const tag = t.split("|")[0], bi = [...rfEl.children].indexOf(a); keepView = { n, z, tx, ty, tap: boxes[bi] || null }; if (window.kcgmOpenTag) kcgmOpenTag(tag); setTimeout(() => { keepView = null; }, 2000); });
    // ---- coloured lines (as in the full viewer, pdfview.js: the same tick boxes, palette, legend and settings) ----
    const isPid = /-PID-/.test(d.number || ""), FLX = PdfView.fl, flTk = el.querySelector(".vz-fltk"), flLg = el.querySelector(".vz-flg"), flSvg = box.querySelector(".sp-fl");
    let flD = null, flRefs = [], flPick = null, hiB = null;   // (hiB: arrived at the whole sheet through these ribbons back: the line they carry shown)
    // (a process pipe with no line number, "u<n>": a ref made from its label and where that sits, as in pdfview.js)
    const isU = k => /^u\d+$/.test(k), refV = k => { if (isU(k)){ const b = flD && flD.ub && flD.ub[k]; return b ? [b[0], b[1], b[2], b[3], b[4], flD.lb[k], "line", null, flD.uk && flD.uk[k] ? "uk" : "u"] : null; } return flRefs[+k]; };
    const noPage = k => (isU(k) && !(flD && flD.uk && flD.uk[k])) || (/^r\d+$/.test(k) && !(flD && flD.lb && flD.lb[k]));   // (an unnumbered pipe, or a line not in the line list: no page to open)
    const pipeAt = (x, y) => { if (!flD) return null; const q = stage.getBoundingClientRect(); if (!q.width) return null; let best = null;
      for (const k of Object.keys(flD)){ const rr = /^r\d+$/.test(k), rf = rr ? flRefs[+k.slice(1)] : refV(k);   // (r: a ribbon's continuation, a number or none)
        if ((!/^\d+$/.test(k) && !isU(k) && !rr) || !rf || rf[0] !== 1) continue;
        const P = flD[k].map(p => [q.left + p[0] / 1e4 * q.width, q.top + p[1] / 1e4 * q.height]);
        for (let i = 1; i < P.length; i++){ const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = x1 - x0, dy = y1 - y0, ll = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / ll)), dd = Math.hypot(x0 + t * dx - x, y0 + t * dy - y);
          if (dd < 10 && (!best || dd < best.d)) best = { d: dd, k: isU(k) || rr ? k : +k, u: rr ? !(flD.lb && flD.lb[k]) : noPage(k), label: rr ? (flD.lb && flD.lb[k]) || "" : String(rf[5]).split("|")[0], at: [(x - q.left) / q.width * 1e4, (y - q.top) / q.height * 1e4] }; } }
      return best; };
    // (the mouse over a pipe: the pointing hand, as over a label or a ribbon, since a click there flies along it)
    let pipeRaf = 0, pipeEv = null;
    box.addEventListener("pointermove", e => { if (e.pointerType !== "mouse" || !isPid || e.buttons) return; pipeEv = e; if (pipeRaf) return;
      pipeRaf = requestAnimationFrame(() => { pipeRaf = 0; const q = pipeEv; if (!q || !box.isConnected) return;
        const over = !q.target.closest(".vz-rf i, .vz-trb, .vz-zb, .vz-tg") && !!pipeAt(q.clientX, q.clientY); box.classList.toggle("vz-onpipe", over); }); });
    box.addEventListener("pointerleave", () => box.classList.remove("vz-onpipe"));
    // (a line flown through: the rest grey, that one in its colour; the legend out of the way)
    // (the item's own line on this sheet, when the item is a line: shown as when flown through, with no fly through)
    const itemKeys = () => { if (hiB && flD){ const ks = hiB.map(j => flD.rb && flD.rb[j]).filter(x => x != null && flD[x]).map(String); if (ks.length) return ks; }
      const t = String((cur && cur.key) || ""); return flD ? Object.keys(flD).filter(k => /^\d+$/.test(k) && flRefs[+k] && flRefs[+k][0] === 1 && flRefs[+k][6] === "line" && String(flRefs[+k][5]).split("|")[0] === t) : []; };
    // a line flown through, or the item's line: it in colour, the lines it runs on into lighter (PdfView.chain), the rest grey
    const flDimT = () => { const ik = T ? [String(T.k)] : flPick ? [] : itemKeys();
      if (!ik.length){ flLg.style.display = ""; flSvg.querySelectorAll(".nx").forEach(p => p.classList.remove("nx")); return; }
      if (T) flLg.style.display = "none"; flSvg.classList.add("dim"); flSvg.classList.remove("pk");
      const ch = new Set(); if (PdfView.chain && W) ik.forEach(k => PdfView.chain(flD, k, refV, W / H, 1).forEach(x => ch.add(x)));
      flSvg.querySelectorAll("polyline").forEach(p => { const on = ik.includes(p.dataset.k); p.classList.toggle("sel", on); p.classList.toggle("nx", !on && ch.has(p.dataset.k) && !p.classList.contains("fw")); }); };
    const flPickSet = c => { if (T) return flDimT(); flPick = c; flSvg.classList.toggle("dim", !!c); flSvg.classList.toggle("pk", !!c);
      flSvg.querySelectorAll("polyline").forEach(p => p.classList.toggle("sel", !!c && p.dataset.fc === c)); flLg.classList.toggle("pk", !!c);
      flLg.querySelectorAll("[data-fc]").forEach(r => r.classList.toggle("on", r.dataset.fc === c)); };
    async function flDraw(){ if (!FLX || !isPid || g !== gen) return; const S = FLX.get(); flTk.hidden = document.documentElement.classList.contains("phone");
      flTk.querySelector('[data-f="c"]').checked = S.c; flTk.querySelector('[data-f="w"]').checked = S.w;
      if (!flD) flD = await fetch("lines/" + d.number + ".json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
      if (g !== gen) return;
      // (an asset picked, an instrument, equipment, a valve: no line colours to draw the eye away from it)
      const asset = !T && !flPick && !hiB && cur && cur.t !== "pid" && cur.t !== "line" && !itemKeys().length;
      if ((!S.c && !T && !itemKeys().length) || asset || !W){ flSvg.innerHTML = ""; flLg.hidden = true; flPick = null; return; }   // (a line flown through: drawn, it in colour and the rest grey, even with Colours off)
      const cnt = {}; let h = "", fw = ""; flSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      Object.keys(flD).forEach(k => { const rk = /^r\d+$/.test(k) && flD.lb && flD.lb[k];   // (a ribbon's continuation, under the number it carries)
        const rr = /^r\d+$/.test(k); if (!/^\d+$/.test(k) && !isU(k) && !rr) return; const r = rr ? flRefs[+k.slice(1)] : refV(k); if (!r || r[0] !== 1) return; const mech = isU(k) && /-MECH-/.test(flD.lb[k]), c = mech ? "MECH" : rr && !rk ? "" : FLX.fluid(rk || (isU(k) ? flD.lb[k] : r[5])), col = mech ? FLX.MECHC : FLX.FLC[c] || FLX.OTHC; if (!mech && !rr && FLX.FLC[c]) cnt[c] = (cnt[c] || 0) + 1;
        const pts = flD[k].map(p => (p[0] / 1e4 * W).toFixed(1) + "," + (p[1] / 1e4 * H).toFixed(1)).join(" ");
        h += `<polyline data-k="${k}" data-fc="${c}" points="${pts}" style="--c:${col}"/>`;
        if (S.w && flD.fl && flD.fl[k]) fw += `<polyline class="fw" data-k="${k}" data-fc="${c}" points="${pts}" style="animation-delay:-${((performance.now() / 1000 + (parseInt(String(k).replace(/\D/g, "")) || 0) * .37) % 1.1).toFixed(3)}s"/>`; });
      flSvg.innerHTML = h + fw; flSvg.classList.toggle("c", !!S.c); const cs = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b));
      flLg.hidden = !cs.length || !S.c; flLg.classList.toggle("open", S.leg);
      if (flLg.parentNode.classList.contains("vz-cb")){   // (in the bar: the codes alone; the one picked shows its name above it)
        flLg.innerHTML = `<b class="lbl">Fluids</b>` + cs.map(c => `<button type="button" class="chip" data-fc="${c}" style="--c:${FLX.FLC[c]}" title="${esc(FLX.FLN[c] || c)}: only these in colour">${c}<i class="nm">${esc(FLX.FLN[c] || c)}</i></button>`).join("");
        flPickSet(flPick && cnt[flPick] ? flPick : null); flDimT(); return; }
      flLg.innerHTML = `<button type="button" class="hd"><b>${S.leg ? "Fluids on this drawing" : "Fluids"}</b>${S.leg ? "" : `<span class="fl-dots">${cs.map(c => `<i style="background:${FLX.FLC[c]}"></i>`).join("")}</span>`}<em>${S.leg ? "Hide ▴" : "Show ▾"}</em></button>`
        + (S.leg ? `<div class="grid">${cs.map(c => `<button type="button" class="row" data-fc="${c}" style="--c:${FLX.FLC[c]}" title="Only ${esc(FLX.FLN[c] || c)} in colour"><i class="sw" style="background:${FLX.FLC[c]}"></i><span class="cd" style="--c:${FLX.FLC[c]}">${c}</span><span class="nm">${esc(FLX.FLN[c] || "")}</span><span class="ct">${cnt[c]}</span></button>`).join("")}</div>` : "");
      flPickSet(flPick && cnt[flPick] ? flPick : null); flDimT(); }
    flTk.addEventListener("change", e => { const f = e.target.dataset.f; if (f && FLX){ FLX.set(f, e.target.checked); flDraw(); } });
    flLg.addEventListener("click", e => { e.stopPropagation(); const row = e.target.closest("[data-fc]");
      if (row){ flPickSet(flPick === row.dataset.fc ? null : row.dataset.fc); return; }
      if (e.target.closest(".hd") && FLX){ FLX.set("leg", !FLX.get().leg); flDraw(); } });
    const flEsc = e => { if (!box.isConnected){ removeEventListener("keydown", flEsc, true); return; } if (e.key === "Escape" && flPick && !T && !document.querySelector(".sp-view:not([hidden])")){ e.stopImmediatePropagation(); flPickSet(null); } };
    addEventListener("keydown", flEsc, true);
    // ---- the fly through (desktop), as in pdfview.js: the strip at the foot of the sheet (line number, zoom, Asset, ✕;
    // the slider along the line with its milestones and the next line arrows at its ends), the trail drawn on the sheet
    // like a pen's with an arrow where you are; the wheel runs along the line (Ctrl + wheel zooms), ← → a tenth (held a
    // smooth run), ↑ ↓ the next line downstream / upstream; Esc, ✕ or a click on the bare sheet leave it ----
    let T = null;
    const tb = document.createElement("div"); tb.className = "sp-trb dk vz-trb"; tb.hidden = true;
    tb.innerHTML = `<div class="sp-trh"><b class="sp-trn"></b><span class="sp-trzh" title="Zoom (Ctrl + wheel)"><button type="button" data-zh="-10" aria-label="Further">−</button><span class="sp-trzhb"><input type="range" class="sp-rg sp-trz2" min="0" max="100" step="any" aria-label="Zoom"></span><button type="button" data-zh="10" aria-label="Closer">+</button><b>Zoom</b></span><button type="button" class="sp-tro" title="This line's asset page">Asset</button><button type="button" class="sp-trx" title="Stop flying through">✕</button></div>
      <div class="sp-trrow"><div class="sp-trnx l"></div><div class="sp-trtk"><input type="range" class="sp-tra sp-rg" min="0" max="1000" step="any" aria-label="Along the line"><div class="sp-trln"><span></span><span></span></div><div class="sp-trc"></div></div><div class="sp-trnx r"></div></div>`;
    box.after(tb);   // (under the sheet, not over it)
    const trl = document.createElementNS("http://www.w3.org/2000/svg", "svg"); trl.setAttribute("class", "sp-trl"); flSvg.after(trl);
    const sl = tb.querySelector(".sp-tra"), zs = tb.querySelector(".sp-trz2");
    const zOf = v => Math.pow(10, v / 100), trZ = () => { let v = 55; try { const x = localStorage.getItem("kcgm_trz"); if (x != null) v = +x; } catch (e) {} return v; };
    const TT = { t: "TEE", v: "VALVE", p: "SP", i: "INSTR", e: "EQUIP", r: "SHEET", l: "SPEC", s: "END", b: "BOARD", x: "TX", d: "DEVICE", a: "RATING", f: "FEEDER" };
    const TK = { t: "tee", v: "valve", p: "special item", i: "instrument", e: "equipment", r: "continues", l: "next line", s: "end", b: "board", x: "transformer", d: "device", a: "rating", f: "feeder" };
    const trName = m => { const t = String(m[2] || "").replace(/\s+/g, "");
      if (m[1] === "t") return (String(m[2] || "").split("-")[1]) || "T" + (T.tn.get(m) || "");
      if (m[1] === "r") return t.replace(/^2000-/, "").replace(/-PID-PR-|-SLD-EL-/, "-");
      if (m[1] === "l"){ const sp = q => (String(q || "").split("-")[3] || "?"), me = sp(T.label), nx = sp(t); return m[0] < .5 ? nx + "|" + me : me + "|" + nx; }
      if (m[1] === "s") return "end"; if (m[1] === "p") return t.replace(/^SP-/, "");
      return t.replace(/^F\d\d-(?=\d)/, "").replace(/^F\d\d-(?=[A-Z])/, ""); };
    const trAt = f => { const { P, L } = T, q = f * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < q) i++;
      const t = L[i] > L[i - 1] ? (q - L[i - 1]) / (L[i] - L[i - 1]) : 0; return [P[i - 1][0] + t * (P[i][0] - P[i - 1][0]), P[i - 1][1] + t * (P[i][1] - P[i - 1][1]), i]; };
    const trSub = (a, b) => { const [xa, ya, ia] = trAt(a), [xb, yb, ib] = trAt(b); return [[xa, ya], ...T.P.slice(ia, ib), [xb, yb]]; };
    function trStart(k, at, f0, as){ const P = flD && flD[k]; if (!P || P.length < 2 || !W) return false; const A = W / H, L = [0];
      for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot((P[i][0] - P[i - 1][0]) * A, P[i][1] - P[i - 1][1]));
      const r = /^r\d+$/.test(k) ? flRefs[+String(k).slice(1)] : refV(k);
      T = { t0: Date.now(), k, P, L, label: (flD.lb && flD.lb[k]) || (/^r\d+$/.test(k) ? as || "" : String(r[5]).split("|")[0]), m: (flD.m && flD.m[k]) || [] };
      T.tn = new Map(T.m.filter(m => m[1] === "t").sort((a, b) => a[0] - b[0]).map((m, i) => [m, i + 1]));
      let f = f0 || 0;
      if (at){ let best = 1e18; for (let i = 1; i < P.length; i++){ const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = (x1 - x0) * A, dy = y1 - y0, ll = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((at[0] - x0) * A * dx + (at[1] - y0) * dy) / ll)), e2 = ((x0 + t * (x1 - x0) - at[0]) * A) ** 2 + (y0 + t * (y1 - y0) - at[1]) ** 2;
        if (e2 < best){ best = e2; f = (L[i - 1] + t * (L[i] - L[i - 1])) / (L[L.length - 1] || 1); } } }
      TRV = { n: d.number, k, f, as: T.label };
      tb.querySelector(".sp-trn").textContent = T.label; sl.value = Math.round(f * 1000); zs.value = trZ();
      { const ab = tb.querySelector(".sp-tro"); if (ab) ab.hidden = noPage(k); } tb.hidden = false; box.classList.add("vz-tracing"); trNx(); flDraw(); trMarks(); view(); return true; }
    function trEnd(){ if (!T) return; T = null; TRV = null; tb.hidden = true; trl.innerHTML = ""; box.classList.remove("vz-tracing"); flSvg.classList.remove("dim"); flSvg.querySelectorAll(".sel").forEach(q => q.classList.remove("sel")); flDimT(); flDraw(); }
    function view(){ if (!T) return; const f = sl.value / 1000; TRV.f = f;
      [sl, zs].forEach(i => i.parentNode.style.setProperty("--p", (i.value - i.min) / (i.max - i.min) * 100 + "%"));
      z = Math.max(1, Math.min(10, zOf(+zs.value))); const [x, y] = trAt(f), vw = box.clientWidth / kf, vh = box.clientHeight / kf;
      tx = vw / 2 - x / 1e4 * W * z; ty = vh / 2 - y / 1e4 * H * z; apply(); drawTrail(); }
    function drawTrail(){ if (!T) return; const s = z * kf, w = Math.max(4, Math.min(9, 3.2 * s)), tw = w * 1.35, sc = q => [q[0] / 1e4 * W, q[1] / 1e4 * H];
      const pts = P => P.map(q => sc(q).map(v => v.toFixed(1)).join(",")).join(" "), f = sl.value / 1000, at = trAt(f), [dx, dy] = sc(at), i = at[2];
      trl.setAttribute("viewBox", `0 0 ${W} ${H}`); trl.style.setProperty("--trw", w + "px");
      { const c = FLX && (/-MECH-/.test(T.label) ? FLX.MECHC : FLX.FLC[FLX.fluid(T.label)] || FLX.OTHC); if (c) trl.style.setProperty("--hl", c); else trl.style.removeProperty("--hl"); }   // (the line in its fluid's colour, whether or not all lines are coloured)
      const tr = f > 1e-4 ? pts(trSub(0, f)) : "", [ax, ay] = sc(T.P[i - 1]), [bx, by] = sc(T.P[i]), dd = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / dd, uy = (by - ay) / dd;
      const L = 2.6 * tw / s, B = 1.1 * tw / s, ex = dx + ux * L * .6, ey = dy + uy * L * .6, bx0 = dx - ux * L * .4, by0 = dy - uy * L * .4;
      // (39A: just after the line is first opened, two rings pulse out from the arrow, three times, so the eye finds it;
      // gone once the arrow is moved)
      if (T.fs === undefined) T.fs = f;
      const el = (Date.now() - T.t0) / 1000, rg = el < 4.5 && Math.abs(f - T.fs) < 1e-4 ? [0, .75].map(o => `<circle class="rg" cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${(3.2 * tw / s).toFixed(1)}" style="animation-delay:${(o - el).toFixed(3)}s"/>`).join("") : "";
      trl.innerHTML = rg + (tr ? `<polyline class="tr" points="${tr}"/><polyline class="fw" points="${tr}" style="animation-delay:-${(performance.now() / 1000 % 1.1).toFixed(3)}s"/>` : "")
        + `<polygon points="${[[ex, ey], [bx0 - uy * B, by0 + ux * B], [bx0 + uy * B, by0 - ux * B]].map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}"/>`; }
    // (the milestones: names read across under the bar, each where it costs least, no callout crossing a name or another)
    function trMarks(){ const c = tb.querySelector(".sp-trc"), Wd = c.offsetWidth || 400, BB = Math.round(sl.offsetTop + sl.offsetHeight / 2 + 4) || 20, J = BB + 9, RH = 20, R0 = BB + 14, NR = 6, G = 6;
      const pr = m => ({ r: 0, l: 1, e: 2, b: 2, x: 3, t: 3, i: 4, f: 4, d: 5, p: 5, v: 5, a: 6, s: 6 })[m[1]] ?? 7, rows = [...Array(NR)].map(() => []), legs = [], put = [];
      const wid = m => (TT[m[1]] || "").length * 5.4 + trName(m).length * 6.9 + 8 + (m[2] && ASK.includes(m[1]) ? 12 : 0);
      const ok = (x, xv, r, a, b) => { if (a < 0 || b > Wd) return false;
        if (rows[r].some(q => q[0] < b + G && a < q[1] + G)) return false;
        if (rows.slice(0, r).some(Rw => Rw.some(q => q[0] - 2 < xv && xv < q[1] + 2))) return false;
        if (legs.some(l => l.r > r && a - 2 < l.xv && l.xv < b + 2)) return false;
        const lo = Math.min(x, xv), hi = Math.max(x, xv);
        for (const l of legs){ const lo2 = Math.min(l.x, l.xv), hi2 = Math.max(l.x, l.xv);
          if (hi - lo > .5 && (lo - 2 < l.x && l.x < hi + 2 || lo - 2 < l.xv && l.xv < hi + 2)) return false;
          if (hi2 - lo2 > .5 && (lo2 - 2 < x && x < hi2 + 2 || lo2 - 2 < xv && xv < hi2 + 2)) return false; }
        return true; };
      // (an end the arrow there already names, a sheet, the next line or the equipment: no label under it as well)
      const covered = m => ["r", "l", "e", "t"].includes(m[1]) && ((m[0] <= .02 && (T.nbL || []).length) || (m[0] >= .98 && (T.nbR || []).length));
      [...T.m].filter(m => !covered(m)).sort((a, b) => pr(a) - pr(b) || a[0] - b[0]).forEach(m => { const x = m[0] * Wd, w = wid(m); let best = null;
        for (let dd = 0; dd <= 150; dd += 6) for (const sg of dd ? [1, -1] : [1]){ const xv = x + sg * dd;
          for (let r = 0; r < NR; r++) for (const [a, b] of [[xv + 3, xv + 3 + w], [xv - 3 - w, xv - 3]]){ const cost = r * 22 + dd + (a < xv ? 4 : 0); if (best && cost >= best.cost) continue; if (ok(x, xv, r, a, b)) best = { cost, xv, r, a, b }; } }
        if (!best) return; rows[best.r].push([best.a, best.b]); legs.push({ x, xv: best.xv, r: best.r }); put.push([m, x, best.a, best.r, best.xv]); });
      const used = put.reduce((q, p) => Math.max(q, p[3] + 1), 0); tb.querySelector(".sp-trtk").style.paddingBottom = (used * RH + 16) + "px";
      c.innerHTML = T.m.filter(m => m[0] > .005 && m[0] < .995).map(m => `<i class="k-${m[1]}" style="left:${(m[0] * 100).toFixed(1)}%;top:${BB + 1}px" title="${esc(TK[m[1]] + (m[2] ? " " + m[2] : ""))}"></i>`).join("")
        + `<svg class="sp-trco" width="${Wd}" height="${R0 + NR * RH}">${put.map(([m, x, a, r, xv]) => { const y = R0 + r * RH + 7, e2 = a > xv ? a - 1 : a + wid(m) + 1;
            return `<polyline points="${x.toFixed(1)},${BB + 6} ${x.toFixed(1)},${J} ${xv.toFixed(1)},${J} ${xv.toFixed(1)},${y} ${e2.toFixed(1)},${y}"/>`; }).join("")}</svg>`
        + put.map(([m, x, a, r]) => { const go = m[1] === "t" && teeKey(m) != null, as = !go && ASK.includes(m[1]) && !!m[2];   // (a tee whose branch is traced here: a tab that flies onto it; an instrument, valve, equipment: a button that opens it)
          return `<b class="h k-${m[1]}${go ? " go" : as ? " go as" : ""}"${go ? ` data-f="${m[0]}" data-t="${esc(m[2])}" title="Fly along ${esc(m[2])}"` : as ? ` data-g="${esc(m[2])}" title="Open ${esc(m[2])}"` : ""} style="left:${a.toFixed(1)}px;top:${R0 + r * RH - (go || as ? 2 : 0)}px"><em>${TT[m[1]] || ""}</em> ${esc(trName(m))}</b>`; }).join(""); }
    const ASK = ["v", "p", "i", "e", "b", "x", "d", "f"];
    // the branch line at a tee: the traced line on this sheet with that number, its end nearest the tee
    function teeKey(m){ if (!flD || !m[2]) return null; const at = trAt(m[0]); let best = null;
      for (const k of Object.keys(flD)){ if (String(k) === String(T.k)) continue; const lab = /^\d+$/.test(k) ? (flRefs[+k] && flRefs[+k][0] === 1 ? String(flRefs[+k][5]).split("|")[0] : null) : flD.lb && flD.lb[k];
        if (lab !== m[2] || !Array.isArray(flD[k])) continue; const Q = flD[k], d0 = Math.min(Math.hypot(Q[0][0] - at[0], Q[0][1] - at[1]), Math.hypot(Q[Q.length - 1][0] - at[0], Q[Q.length - 1][1] - at[1]));
        if (!best || d0 < best[1]) best = [/^\d+$/.test(k) ? +k : k, d0]; }
      return best && best[0]; }
    // (the next lines at each end: on this sheet the lines meeting its end, the ones joined across a pump or vessel
    // (tools/link_lines.py), else the ribbon there, on to the next sheet)
    function trNbs(dir){ const D = flD, A = W / H, e = dir > 0 ? T.P[T.P.length - 1] : T.P[0], dist = (a, b) => Math.hypot((a[0] - b[0]) * A, a[1] - b[1]);
      const segd = (Q, q) => { let m = 1e18; for (let i = 1; i < Q.length; i++){ const [x0, y0] = Q[i - 1], [x1, y1] = Q[i], dx = (x1 - x0) * A, dy = y1 - y0, ll = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((q[0] - x0) * A * dx + (q[1] - y0) * dy) / ll)); m = Math.min(m, Math.hypot((x0 + t * (x1 - x0) - q[0]) * A, y0 + t * (y1 - y0) - q[1])); } return m; };
      // (desktop: the whole line number, or the whole drawing number, on a ribbon as the P&IDs draw them)
      const out = [], seq = k2 => isU(k2) ? String(D.lb[k2]) : /^r\d+$/.test(k2) ? String((D.lb && D.lb[k2]) || "continuation") : String(flRefs[k2][5]).split("|")[0];
      if (D.up || D.dn){ const j = (dir < 0 ? D.up : D.dn || {})[T.k]; if (j == null || !flRefs[j]) return [];
        return [{ rb: j, d: 0, dir, seq: String(flRefs[j][5]).split("|")[0] }]; }
      Object.keys(D).forEach(k2 => { if ((!/^\d+$/.test(k2) && !isU(k2)) || String(k2) === String(T.k) || !refV(k2) || refV(k2)[0] !== 1) return; const Q = D[k2], dE = Math.min(dist(Q[0], e), dist(Q[Q.length - 1], e)), kk = isU(k2) ? k2 : +k2;
        if (dE < 45) out.push({ k: kk, pt: dist(Q[0], e) < dist(Q[Q.length - 1], e) ? Q[0] : Q[Q.length - 1], d: dE, seq: seq(kk) });
        else { const dI = segd(Q, e); if (dI < 25) out.push({ k: kk, pt: e, d: dI + 1, seq: seq(kk) }); } });
      (D.lk || []).forEach(([k1, e1, k2, e2]) => { const me = dir > 0 ? 1 : 0;
        for (const [a, ea, b, eb] of [[k1, e1, k2, e2], [k2, e2, k1, e1]]) if (String(a) === String(T.k) && ea === me && D[b] && refV(b) && !out.some(o => o.k === b)){ const Q = D[b]; out.push({ k: b, pt: eb ? Q[Q.length - 1] : Q[0], d: 50, seq: seq(b) }); } });
      if (!out.length){ const em = T.m.find(m => (dir > 0 ? m[0] >= .98 : m[0] <= .02) && (m[1] === "l" || m[1] === "t") && m[2]);
        if (em){ const k2 = flRefs.findIndex((r, i) => r[0] === 1 && r[6] === "line" && String(r[5]).split("|")[0] === em[2] && D[i]); if (k2 >= 0) out.push({ k: k2, pt: e, d: 0, seq: seq(k2) }); } }
      if (!out.length) Object.keys(D.rb || {}).forEach(j => { if (String(D.rb[j]) !== String(T.k) || !flRefs[+j]) return; const r = flRefs[+j], dd = Math.hypot(Math.max(r[1] - e[0], 0, e[0] - r[1] - r[3]), Math.max(r[2] - e[1], 0, e[1] - r[2] - r[4]));
        if (dd < 300) out.push({ rb: +j, d: dd, dir, seq: String(r[5]).split("|")[0] }); });
      // (nothing on: the line ends at a piece of equipment, an arrow to its page)
      if (!out.length){ const em = T.m.find(m => (dir > 0 ? m[0] >= .97 : m[0] <= .03) && m[1] === "e" && m[2]); if (em) out.push({ eq: em[2], d: 0, seq: em[2] }); }
      return out.sort((a, b) => a.d - b.d).filter((o, i, a) => a.findIndex(x => x.k === o.k && x.rb === o.rb && x.eq === o.eq) === i).slice(0, 2); }
    function trNx(){ T.nb = []; [["l", -1], ["r", 1]].forEach(([side, dir]) => { const c = tb.querySelector(".sp-trnx." + side), Lb = trNbs(dir); T[dir < 0 ? "nbL" : "nbR"] = Lb; c.classList.toggle("two", Lb.length > 1);
      c.innerHTML = Lb.map(o => { T.nb.push(o); return `<button type="button" data-i="${T.nb.length - 1}" class="${o.rb != null ? "sh" : ""}${/\n/.test(o.seq) ? " sl" : ""}" title="${dir < 0 ? "Upstream" : "Downstream"}: ${esc(o.eq ? "equipment " + o.eq + " (opens its page)" : o.rb != null ? "sheet " + o.seq : String(refV(o.k)[5]).split("|")[0])}">${esc(o.seq)}</button>`; }).join(""); }); }
    function trGo(nb){ if (!nb || !T) return;
      if (nb.eq){ if (window.kcgmOpenTag){ keepView = { n, z, tx, ty, tap: null, force: true }; kcgmOpenTag(nb.eq); setTimeout(() => { keepView = null; }, 2000); } return; }
      if (nb.rb != null){ const t = String(flRefs[nb.rb][5]).split("|")[0]; if (!Pid.has(t)) return; TRP = { at: Date.now(), label: T.label, dir: nb.dir || 1, from: d.number }; TRV = null;
        arrival = { to: t, back: null }; if (window.kcgmOpenTag) kcgmOpenTag(t); else go(t); return; }
      trStart(nb.k, nb.pt); }
    // arrived on the next sheet: the line the ribbon back carries on, else the one with the same number, from that end
    function trArrive(){ const tp = TRP; TRP = null; if (!tp || Date.now() - tp.at > 20000 || !flD) return false;
      const bk = []; flRefs.forEach((r, j) => { if (r[0] === 1 && r[6] === "d" && String(r[5]).split("|").includes(tp.from)) bk.push(j); });
      let k = null, rbr = null; const j = bk.find(j => flD.rb && flD.rb[j] != null); if (j != null && flD[flD.rb[j]]){ k = /^\d+$/.test(flD.rb[j]) ? +flD.rb[j] : flD.rb[j]; rbr = flRefs[j]; }
      if (k == null && tp.label){ const C = flRefs.map((r, i) => i).filter(i => flRefs[i][0] === 1 && flRefs[i][6] === "line" && String(flRefs[i][5]).split("|")[0] === tp.label && flD[i]); k = C[0]; rbr = flRefs[bk[0]]; }
      if (k == null) return false; const P = flD[k], end = rbr ? [rbr[1] + rbr[3] / 2, rbr[2] + rbr[4] / 2] : (tp.dir < 0 ? P[P.length - 1] : P[0]);
      return trStart(k, end, 0, tp.label); }
    tb.addEventListener("click", e => { const g = e.target.closest("b.go"); if (g && T){ e.stopPropagation();
      // (an asset named on the strip: out of the fly through, the asset opened with its box on this sheet marked)
      if (g.dataset.g){ const tag = g.dataset.g, bi = refsNow.findIndex(r => r[0] === 1 && String(r[5]).split("|").includes(tag)); trEnd();
        if (window.kcgmOpenTag){ keepView = { n, z, tx, ty, tap: boxes[bi] || null }; kcgmOpenTag(tag); setTimeout(() => { keepView = null; }, 2000); } return; }
      const m = T.m.find(q => q[1] === "t" && String(q[0]) === g.dataset.f && q[2] === g.dataset.t); const k = m && teeKey(m); if (k != null) trGo({ k, pt: trAt(m[0]) }); return; } }, true);
    tb.addEventListener("click", e => { e.stopPropagation(); const b = e.target.closest("button"); if (!b) return;
      if (b.classList.contains("sp-trx")) return trEnd();
      if (b.classList.contains("sp-tro")){ if (T && !noPage(T.k) && window.kcgmOpenTag){ keepView = { n, z, tx, ty, tap: null, force: true }; kcgmOpenTag(T.label); setTimeout(() => { keepView = null; }, 2000); } return; }
      if (b.dataset.zh){ zs.value = Math.max(0, Math.min(100, +zs.value + +b.dataset.zh)); try { localStorage.setItem("kcgm_trz", zs.value); } catch (x) {} view(); return; }
      if (b.dataset.i != null && T) trGo(T.nb[+b.dataset.i]); });
    sl.addEventListener("input", () => view()); zs.addEventListener("input", () => { try { localStorage.setItem("kcgm_trz", zs.value); } catch (x) {} view(); });
    // the wheel along the line (a free-spinning wheel's stream of small steps each counted), Ctrl + wheel the zoom
    let wAcc = 0, zAcc = 0, wRaf = 0;
    box.addEventListener("wheel", e => { if (!T) return; e.preventDefault(); e.stopImmediatePropagation();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1, dl = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * k; if (e.ctrlKey) zAcc += dl; else wAcc -= dl;   // (up: on downstream)
      if (!wRaf) wRaf = requestAnimationFrame(() => { wRaf = 0; if (!T) return;
        if (zAcc){ zs.value = Math.max(0, Math.min(100, +zs.value - zAcc * .05)); zAcc = 0; try { localStorage.setItem("kcgm_trz", zs.value); } catch (x) {} }
        if (wAcc){ const len = T.L[T.L.length - 1] * H / 1e4 || 1; sl.value = Math.max(0, Math.min(1000, +sl.value + wAcc / (z * kf) / len * 1000)); wAcc = 0; }
        view(); }); }, { passive: false, capture: true });
    // keys: ← → a tenth (held, a fifth of the line a second), ↑ ↓ the next line, Esc out
    let kHold = null;
    const trKey = e => { if (!box.isConnected){ removeEventListener("keydown", trKey, true); return; } if (!T || e.ctrlKey || e.altKey || e.metaKey || document.querySelector(".sp-view:not([hidden])")) return;
      const t = e.target; if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) && t.type !== "range" || t.isContentEditable)) return;
      const kk = e.key, dir = kk === "ArrowRight" ? 1 : kk === "ArrowLeft" ? -1 : 0;
      if (dir){ e.preventDefault(); e.stopPropagation(); if (e.repeat || kHold) return; sl.value = Math.max(0, Math.min(1000, +sl.value + dir * 100)); view();
        kHold = { dir, t0: performance.now() + 300, last: 0, raf: 0 };
        const run = now => { if (!kHold || !T) return; if (now > kHold.t0){ const dt = kHold.last ? now - kHold.last : 0; kHold.last = now; if (dt){ sl.value = Math.max(0, Math.min(1000, +sl.value + kHold.dir * .2 * dt)); view(); } } kHold.raf = requestAnimationFrame(run); };
        kHold.raf = requestAnimationFrame(run); return; }
      if (kk === "ArrowUp" || kk === "ArrowDown"){ e.preventDefault(); e.stopPropagation(); const pk = kk === "ArrowUp" ? T.nbR : T.nbL; if (pk && pk[0]) trGo(pk[0]); return; }
      if (kk === "Escape"){ e.preventDefault(); e.stopImmediatePropagation(); trEnd(); } };
    addEventListener("keydown", trKey, true);
    // (the mouse's side buttons while flying through: forward to the next line, as ↑; back to the one before, as ↓; the
    // browser's own back and forward held off so the page stays)
    const trMouse = e => { if (!box.isConnected){ ["mousedown", "mouseup", "auxclick"].forEach(t => removeEventListener(t, trMouse, true)); return; }
      if (!T || (e.button !== 3 && e.button !== 4)) return; e.preventDefault(); e.stopPropagation();
      if (e.type === "mouseup"){ const pk = e.button === 4 ? T.nbR : T.nbL; if (pk && pk[0]) trGo(pk[0]); } };
    ["mousedown", "mouseup", "auxclick"].forEach(t => addEventListener(t, trMouse, true));
    addEventListener("keyup", e => { if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && kHold){ cancelAnimationFrame(kHold.raf); kHold = null; } });
    PdfView.getDoc(d.file).then(doc => doc.getPage(1)).then(async pg => {
      if (g !== gen) return; page = pg;
      const v1 = pg.getViewport({ scale: 1 }), bw = box.clientWidth, bh = Math.max(200, innerHeight - box.getBoundingClientRect().top - 24);
      bb = (await bboxP)[d.file] || [0, 0, 1, 1]; if (g !== gen) return;
      const cw = (bb[2] - bb[0]) * v1.width, ch = (bb[3] - bb[1]) * v1.height;
      sc = Math.min(bw / cw, bh / ch); const vp = pg.getViewport({ scale: sc }); W = vp.width; H = vp.height;
      vw0 = bw; vh0 = Math.round(ch * sc); box.style.height = vh0 + "px"; kf = 1;
      let kb = null;   // (a size that flips straight back, the pane's scrollbar showing and hiding as the sheet grows and shrinks: left as it is, or the sheet shakes)
      new ResizeObserver(() => { if (g !== gen || !vw0) return; const k2 = box.clientWidth / vw0, now = performance.now(); if (Math.abs(k2 - kf) < .002) return;
        if (kb && Math.abs(k2 - kb[0]) < .002 && now - kb[1] < 900 && Math.abs(k2 - kf) < .04) return; kb = [kf, now]; kf = k2; box.style.height = Math.round(vh0 * kf) + "px"; apply(); if (T) view(); }).observe(box); stage.style.width = W + "px"; stage.style.height = H + "px"; cv.style.width = W + "px"; cv.style.height = H + "px";
      const tap = held && held.n === n ? held.tap : null; tapNow = tap; if (held && held.n === n && held.z){ z = held.z; tx = held.tx; ty = held.ty; } else { tx = ty = -1e9; } apply(); held = null;
      rz = 0; await sharp(1); if (g !== gen) return; setTimeout(() => { if (g === gen) sharp(); }, 250);   // (then sharpened in the background)
      { const nt = box.querySelector(".vz-note"); if (nt) nt.remove(); }
      const txl = box.querySelector(".vz-tx"); txl.style.setProperty("--scale-factor", sc);
      pg.getTextContent().then(tc => { if (g !== gen || !window.pdfjsLib || !pdfjsLib.renderTextLayer) return;
        return pdfjsLib.renderTextLayer({ textContentSource: tc, container: txl, viewport: pg.getViewport({ scale: 1 }), textDivs: [] }).promise; }).then(() => { if (g === gen) findNow(); }).catch(() => {});
      finder = { box, stage, get z(){ return z; }, n: d.number, g };
      const refsP = Pid.refs().then(R => { if (g !== gen) return; const rf = box.querySelector(".vz-rf");
        const A = W / H; boxes = [];
        refsNow = (R[d.number] || []).filter(r => r[0] === 1 && r[6] !== "x"); flRefs = R[d.number] || [];
        flDraw().then(() => { if (g !== gen) return;
          // (the fly through carried on: the same sheet with another item on the left, or the next sheet reached)
          if (TRV && TRV.n === d.number){ const v = TRV; if (!trStart(v.k, v.at || null, v.at ? 0 : v.f, v.as)) TRV = null; }
          else if (TRP){ TRV = null; trArrive(); }
          // (a line's own page, opened from a list or a link: flying along it straight away, as on the phone)
          else { TRV = null; if (cur && cur.t === "line" && isPid){ const k = flRefs.findIndex((r, i) => r[6] === "line" && r[0] === 1 && String(r[5]).split("|")[0] === cur.key && flD && flD[i]); if (k >= 0) trStart(k, null, 0); } } });
        rf.innerHTML = refsNow.map(r => { const fit = r[7] === "o" || r[7] === "b";   // (fitted to the printed bubble or box: used as is, as in the full screen viewer)
          const rb = r[6] === "d" && Array.isArray(r[8]);   // (a continuation: its ribbon's outline)
          const [l, t, w, h] = rb ? r[8] : fit ? [r[1], r[2], r[3], r[4]] : PdfView.grow(r[1], r[2], r[3], r[4], A); boxes.push([l, t, w, h]);
          return `<i${r[7] === "o" ? ' class="o"' : rb ? ' class="rb"' : ""} data-t="${esc(r[5])}" data-k="${esc(r[6])}"${r[7] != null ? ` data-b="${esc(JSON.stringify(r[7]))}"` : ""} title="${esc(String(r[5]).split("|").join(", "))}" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${h / 100}%">${rb ? PdfView.ribbon(r[8]) : ""}</i>`; }).join("");
        // arrived through a continuation: the red arrow on the ribbon back to the drawing you came from
        const arr = arrival && arrival.to === d.number && arrival.back != null ? arrival : null; arrival = null;
        if (arr){ const aw = W * .018, ah = aw * 1.7;
          const back = [].concat(arr.back).map(j => (R[d.number] || [])[j]).filter(r => r && r[0] === 1);
          pick((i, r) => back.includes(r));   // (its own ribbon turns blue)
          if (!arr.ext) focus(back.map(r => boxes[refsNow.indexOf(r)]).filter(Boolean));
          else { hiB = [].concat(arr.back).filter(j => typeof j === "number"); flDraw(); } } });   // (at the whole sheet: the line come in on shown, the rest faint)   // (zoomed onto the ribbon back to where you came from)
      // the tag tapped (here or in the full screen viewer): the arrow on that very spot
      // (decided once the tag boxes are in: before that every tag looked boxless and got a second box on top of its own)
      if (tap){ refsP.then(() => { if (g !== gen) return; const hitT = ([l, t, w, h]) => { const ox = Math.min(tap[0] + tap[2], l + w) - Math.max(tap[0], l), oy = Math.min(tap[1] + tap[3], t + h) - Math.max(tap[1], t);
            return ox > 0 && oy > 0 && ox * oy >= .5 * Math.min(tap[2] * tap[3], w * h); }, own = boxes.some(hitT);   // (the same place: overlapping by half or more, not a neighbour touching its edge)   // its own tag box shows it: no second box
          box.querySelector(".vz-mk").innerHTML = own ? "" : hbox(tap[0], tap[1], tap[2], tap[3]);
          if (own) pick(i => hitT(boxes[i])); });
        return; }
      // mark the tag: a text piece holding it, or two neighbouring pieces that together do
      const want = nk(key); if (want.length < 3 || cur.t === "pid" || !own.includes(n)) return;
      // its own click box on the sheet turns blue; only a tag with no click box gets a box drawn on its text
      await refsP; if (g !== gen) return;
      if (pick((i, r) => String(r[5]).split("|").some(t => nk(t) === want))) return;
      const tc = await pg.getTextContent(), it = tc.items.filter(t => t.str && t.str.trim()), hits = [];
      const rect = t => { const [a, b, c, dd, e, f] = t.transform, h = Math.hypot(c, dd) || Math.hypot(a, b), w = t.width || h * t.str.length * .5, rot = Math.abs(b) > Math.abs(a);
        return rot ? [e - h, f, e, f + w] : [e, f - h * .2, e + w, f + h * .9]; };
      it.forEach((t, i) => { const s1 = nk(t.str); if (s1.includes(want)) hits.push(rect(t));
        else if (i + 1 < it.length && (s1 + nk(it[i + 1].str)).includes(want) && !nk(it[i + 1].str).includes(want)){ const r1 = rect(t), r2 = rect(it[i + 1]);
          if (Math.abs(r1[1] - r2[1]) < 20) hits.push([Math.min(r1[0], r2[0]), Math.min(r1[1], r2[1]), Math.max(r1[2], r2[2]), Math.max(r1[3], r2[3])]); } });
      // the red see-through arrow, as in the full screen viewer: 1.8% of the sheet width, pointing down at the tag
      const aw = vp.width * .018, ah = aw * 1.7;
      // (one arrow per place: a scanned sheet carries the tag twice, drawn and in the OCR layer under it)
      const same = (o, b) => { const h = Math.max(o[3] - o[1], b[3] - b[1]); return !(b[0] > o[2] || b[2] < o[0] || b[1] > o[3] || b[3] < o[1]) || Math.hypot((o[0] + o[2] - b[0] - b[2]) / 2, (o[1] + o[3] - b[1] - b[3]) / 2) < h * 1.5; };
      box.querySelector(".vz-mk").innerHTML = hits.filter((b, k) => !hits.slice(0, k).some(o => same(o, b))).slice(0, 20).map(b => { const [x1, y1, x2, y2] = vp.convertToViewportRectangle(b), cx = (x1 + x2) / 2, top = Math.min(y1, y2);
        return hbox(Math.min(x1, x2) / W * 1e4, top / H * 1e4, Math.abs(x2 - x1) / W * 1e4, Math.abs(y2 - y1) / H * 1e4); }).join("");
    }).catch(e => { if (g === gen){ const p = box.querySelector(".vz-note"); if (p) p.textContent = "Couldn't load the drawing (" + (e.message || e) + ")."; } });
  }


  // ---------- pieces ----------
  // the charts in four groups, each under a heading, in this order
  const GRP = [["General", [/^Asset mix/, /by area$/]], ["Equipment", [/^Equipment by type/, /^Stage/, /^Brownfield/, /^Status/]],
    ["Electrical", [/^Installed power by area/, /^Top power users/, /^Power by voltage/, /^Starter type/]], ["Piping", [/^Lines by service/, /^Line sizes/, /^Pipe length by area/]]];
  const place = t => { for (let g = 0; g < GRP.length; g++){ const i = GRP[g][1].findIndex(r => r.test(t)); if (i >= 0) return [g, i]; } return [0, 99]; };
  const card = (title, body, note, span) => `<section class="vz-card${span ? " span" : ""}" data-g="${place(title)[0]}" data-o="${place(title)[1]}"><h3>${esc(title).replace(/ (\[[^\]]+\])$/, ' <span class="vz-u">$1</span>')}</h3>${body}</section>`;   // (a unit keeps its case: kW, m)   // (no notes under the charts)
  // ranked bars: [{ k, label, v, tip, f }] biggest first; the value is written at the bar end
  function bars(rows, unit, f, top = 5){
    rows = rows.filter(r => r.v > 0).sort((a, b) => b.v - a.v); const rest = rows.slice(top); rows = rows.slice(0, top);
    // (no "Other" bar: the rest would dwarf the ones shown)
    const max = Math.max(...rows.map(r => r.v), 1);
    return `<div class="vz-bars">` + rows.map(r => { const act = !r.other && f && r.k != null && r.k !== "" ? ` data-f="${f}" data-v="${esc(r.k)}"` : "";
      return `<div class="vz-row${act ? " act" : ""}${r.other ? " oth" : ""}"${act} data-tip="${esc(r.tip || `<b>${esc(r.label)}</b><br>${fmt(r.v)} ${unit}`)}">` +
        `<span class="vz-l" title="${esc(r.label)}">${esc(r.label)}</span><span class="vz-t"><i style="width:${(r.v / max * 100).toFixed(1)}%"></i></span><span class="vz-v">${fmt(r.v)}</span></div>`; }).join("") + `</div>`;
  }
  // donut for ≤5 parts, 2px gaps between segments, the legend carries the values
  // a count as a pie: the top 5 of ranked rows ({ k, label, v }), the total still counts everything; with f, a legend
  // entry picks that value as a filter, like the bars did
  function pie(rows, unit, f){
    rows = rows.filter(r => r.v > 0).sort((a, b) => b.v - a.v); const out = rows.slice(0, 5);
    out.total = rows.reduce((t, r) => t + r.v, 0); out.f = f; return donut(out, unit); }
  function donut(parts, unit){
    const all = parts.total, f = parts.f; parts = parts.filter(p => p.v > 0); const tot = all || parts.reduce((s, p) => s + p.v, 0); if (!tot) return `<p class="vz-note">Nothing to show.</p>`;
    const R = 38, C = 2 * Math.PI * R; let at = 0;
    const segs = parts.map((p, i) => { const len = p.v / tot * C, gap = parts.length > 1 ? Math.min(2, len / 2) : 0;
      const s = `<circle r="${R}" cx="50" cy="50" fill="none" stroke="var(--vz-${i + 1})" stroke-width="16" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(C - len + gap).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}" transform="rotate(-90 50 50)" data-tip="<b>${esc(p.label)}</b><br>${fmt(p.v)} ${unit} (${Math.round(p.v / tot * 100)}%)"/>`;
      at += len; return s; }).join("") +
      (C - at > 1 ? `<circle r="${R}" cx="50" cy="50" fill="none" stroke="var(--line)" stroke-width="16" stroke-dasharray="${(C - at).toFixed(2)} ${at.toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}" transform="rotate(-90 50 50)"/>` : "");   // the rest (not in the top 5) as a faint grey arc
    return `<div class="vz-don"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(parts.map(p => p.label + " " + fmt(p.v)).join(", "))}">${segs}<text x="50" y="48" class="vz-dt">${fmt(tot)}</text><text x="50" y="60" class="vz-du">${esc(unit)}</text></svg>` +
      `<ul>${parts.map((p, i) => `<li${f && p.k != null && p.k !== "" ? ` class="act" data-f="${f}" data-v="${esc(p.k)}"` : ""} data-tip="<b>${esc(p.label)}</b><br>${fmt(p.v)} ${unit}"><i style="background:var(--vz-${i + 1})"></i><span>${esc(p.label)}</span><b>${fmt(p.v)}</b></li>`).join("")}</ul></div>`;
  }
  // fold a count map into ≤5 parts (the rest as Other)
  function five(m, names = {}){
    // the top 5 only (no "Other"); the total and the percentages still count everything
    const e = Object.entries(m).sort((a, b) => b[1] - a[1]); const out = e.slice(0, 5).map(([k, v]) => ({ label: names[k] || k || "Not given", v }));
    out.total = e.reduce((s, x) => s + x[1], 0); return out;
  }
  const count = (arr, key, w = () => 1) => { const m = {}; arr.forEach(r => { const k = key(r); m[k] = (m[k] || 0) + w(r); }); return m; };

  // ---------- the charts ----------
  function draw(force){
    if (!el) return;
    if (!wide()){ el.hidden = true; return; } el.hidden = false;
    if (cur) return drawItem();
    if (!ctx) return;
    const L = ctx.list, sig = L.length + "|" + (L[0] && L[0].it.key) + "|" + ctx.type + "|" + ctx.step + "|" + innerWidth;
    if (!force && sig === lastSig) return; lastSig = sig;
    const get = (r, n) => Lookup.get(r.it, n), areaName = ctx.areaName || (a => a), next = ctx.step;
    const mel = L.filter(r => r.t === "mel"), live = mel.filter(r => !GONE.test(get(r, "Status")));
    const kw = r => kwOf(get(r, "Installed power (kW)"));
    const lines = L.filter(r => r.t === "line"), len = r => kwOf(get(r, "Pipe length (m)"));
    const totKw = live.reduce((s, r) => s + kw(r), 0), totLen = lines.reduce((s, r) => s + len(r), 0);
    const tiles = [["Assets", fmt(L.length), ctx.filtered ? "in this filter" : "across all lists"],
      mel.length && ["Equipment", fmt(mel.length), fmt(live.length) + " in use"],
      totKw && ["Installed power", (totKw / 1000).toFixed(1) + " MW", fmt(totKw) + " kW in use"],
      lines.length && ["Pipe length", (totLen / 1000).toFixed(1) + " km", fmt(lines.length) + " lines"]].filter(Boolean);
    const tilesH = `<div class="vz-tiles">${tiles.map(([a, b, c]) => `<div class="vz-tile"><span>${a}</span><b>${b}</b><em>${c}</em></div>`).join("")}</div>`;
    let h = "";

    // asset mix (before a type is picked): ranked bars, tap one to pick that type
    if (!ctx.type){
      const m = count(L, r => r.t);
      h += card("Asset mix", pie(Object.entries(m).map(([k, v]) => ({ k, label: TN[k] || k, v })), "items", "t"));
    }
    // where the assets are (any type): by WBS area
    if (L.length){
      const m = count(L, r => r.a);
      h += card((ctx.type ? `${TN[ctx.type] || "Assets"} by area` : "Assets by area") + "", pie(Object.entries(m).map(([k, v]) => ({ k, label: k === "?" ? "No area" : `${k} ${areaName(k)}`, v })), "items", next === "a" ? "a" : null));
    }
    if (mel.length){
      // top power users: the biggest single drives (tap to open the item)
      const top = live.filter(r => kw(r) > 0).sort((a, b) => kw(b) - kw(a)).slice(0, 5);
      if (top.length) h += card("Top power users [kW]", `<div class="vz-bars">` + (() => { const max = kw(top[0]);
        return top.map(r => `<div class="vz-row act" data-f="open" data-v="${esc(r.it.key)}" data-tip="<b>${esc(r.it.key)}</b><br>${esc(r.it.name)}<br>${fmt(kw(r))} kW · ${esc(get(r, "Duty / standby") || "duty not given")}">` +
          `<span class="vz-l" title="${esc(r.it.name)}">${esc(nice(r.it.name))}</span><span class="vz-t"><i style="width:${(kw(r) / max * 100).toFixed(1)}%"></i></span><span class="vz-v">${fmt(kw(r))}</span></div>`).join(""); })() + `</div>`,
        "kW per item, decommissioned left out.", false);
      if (totKw) h += card("Installed power by area [kW]", bars(Object.entries(count(live, r => r.a, kw)).map(([k, v]) => ({ k, label: k === "?" ? "No area" : `${k} ${areaName(k)}`, v, tip: `<b>${esc(k)} ${esc(areaName(k))}</b><br>${fmt(v)} kW (${Math.round(v / totKw * 100)}%)` })), "kW", next === "a" ? "a" : null, 5), "kW, decommissioned left out.");
      if (ctx.type === "mel" || !ctx.type){
        const m = count(mel, r => r.k);
        h += card("Equipment by type", pie(Object.entries(m).map(([k, v]) => ({ k, label: `${k} ${ctx.codeName ? ctx.codeName(k) : ""}`.trim(), v })), "items", ctx.type === "mel" && next === "k" ? "k" : null));
      }
      // splits: ≤5 parts each
      h += card("Stage", donut(five(count(mel, r => get(r, "Stage"))), "items"));
      h += card("Brownfield / greenfield", donut(five(count(mel, r => /brown/i.test(get(r, "Brownfield / greenfield")) ? "Brownfield" : /green/i.test(get(r, "Brownfield / greenfield")) ? "Greenfield" : "")), "items"));
      h += card("Status", donut(five(count(mel, r => get(r, "Status"))), "items"));
      // drives
      const drv = live.filter(r => kw(r) > 0);
      if (drv.length){
        h += card("Starter type", donut(five(count(drv, r => ({ DOL: "DOL", VSD: "VSD", FE: "FE (field equipment)" })[get(r, "Starter type")] || (get(r, "Starter type") ? get(r, "Starter type").replace(/^.*DOL.*$/, "DOL (other)") : ""))), "drives"), "Items with a power rating.");
        h += card("Power by voltage [kW]", bars(Object.entries(count(drv, r => get(r, "Voltage") || "Not given", kw)).map(([k, v]) => ({ k: "", label: k, v })), "kW", null, 5));
      }
    }
    if (lines.length){
      h += card("Lines by service", pie(Object.entries(count(lines, r => r.k)).map(([k, v]) => ({ k, label: `${k} ${ctx.svcName ? ctx.svcName(k) : ""}`.trim(), v })), "lines", ctx.type === "line" && next === "k" ? "k" : null));
      // sizes: ranked bars like the others (most common first), tap one to filter when size is the next step
      h += card("Line sizes", pie(Object.entries(count(lines, r => r.sz)).filter(([k]) => k !== "?" && +k > 0).map(([k, v]) => ({ k, label: "DN" + k, v })), "lines", ctx.type === "line" && next === "sz" ? "sz" : null));
      if (totLen) h += card("Pipe length by area [m]", bars(Object.entries(count(lines, r => r.a, len)).map(([k, v]) => ({ k, label: k === "?" ? "No area" : `${k} ${areaName(k)}`, v })), "m", null, 5), "Metres of pipe.");
    }
    // sort the cards into their groups
    const secs = [...h.matchAll(/<section class="vz-card[^"]*" data-g="(\d+)" data-o="(\d+)">[\s\S]*?<\/section>/g)].map(m => ({ g: +m[1], o: +m[2], s: m[0] }));
    el.innerHTML = GRP.map(([name], g) => { const c = secs.filter(x => x.g === g).sort((a, b) => a.o - b.o);
      if (!c.length && g) return ""; return `<h2 class="vz-gh">${name}</h2>` + `<div class="vz-grid">${g ? "" : tilesH}${c.map(x => x.s).join("")}</div>`; }).join("");   // the figures: a 2 by 2 block, the first cell of General
    alignTop();
  }
  // the charts' first header (General) level with the Results band (it stays at the top of the list, whatever filters
  // are picked)
  function alignTop(){ if (!el) return; watchAlign(); el.style.paddingTop = "";
    const band = document.querySelector(".bw-r > .bw-n") || document.querySelector(".bw .bw-band"), gh = el.querySelector(".vz-gh"); if (!band || !gh || cur) return;
    const d = band.getBoundingClientRect().top - gh.getBoundingClientRect().top; if (d > 0 && d < 300) el.style.paddingTop = (parseFloat(getComputedStyle(el).paddingTop) || 0) + d + "px"; }
  addEventListener("resize", () => { if (el && !cur) alignTop(); });
  // (the list draws after the charts and its top moves with Recent: watch it)
  let alignRO = null; const watchAlign = () => { const bw = document.querySelector(".bw"); if (!bw || alignRO || !window.ResizeObserver) return; alignRO = new ResizeObserver(() => { if (el && !cur) alignTop(); }); alignRO.observe(bw); let p = bw.parentElement; while (p && p !== document.body){ alignRO.observe(p); [...p.children].forEach(c => c !== el && !c.contains(el) && alignRO.observe(c)); p = p.parentElement; } };
  // "SAG MILL MOTOR 1" → "Sag mill motor 1"
  const nice = s => { s = String(s || ""); return s === s.toUpperCase() ? s.toLowerCase().replace(/^./, c => c.toUpperCase()).replace(/\b(sag|ufg|cil\d?|vsd|hpu|ew)\b/gi, x => x.toUpperCase()) : s; };

  const css = `.vz{--vz-1:#3987e5;--vz-2:#d95926;--vz-3:#199e70;--vz-4:#c98500;--vz-5:#d55181;--vz-bar:var(--gold);min-width:0}
:root[data-theme="light"] .vz{--vz-1:#2a78d6;--vz-2:#eb6834;--vz-3:#1baf7a;--vz-4:#eda100;--vz-5:#e87ba4}
.vz[hidden]{display:none}
.vz-pv{display:flex;flex-direction:column;gap:8px;padding-top:4px}
.vz-hb{display:flex;align-items:stretch;min-width:0;max-width:100%;background:#fff;color:#111;border:1.5px solid #111;font-family:"ISOCPEUR","Isonorm","Arial Narrow","Liberation Sans Narrow","Roboto Condensed",sans-serif;letter-spacing:.04em;text-transform:uppercase;line-height:1.15}
.vz-hb .c{padding:2px 8px 3px;border-right:1.2px solid #111;min-width:0;display:flex;flex-direction:column;justify-content:center}
.vz-hb .c:last-child{border-right:0}
.vz-hb i{display:block;font-style:normal;font-size:8px;color:#444;line-height:1}
.vz-hb b,.vz-hb a{font-weight:400;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vz-hb .n span{display:flex;align-items:center;gap:5px}.vz-hb.b .n{flex-direction:row;align-items:center;gap:5px}
.vz-hb .n a{text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px;text-decoration-skip-ink:none;padding-bottom:2px}
.vz-hb .t{flex:1 1 auto}
.vz-hb .m{font:800 10px system-ui,sans-serif;width:15px;height:15px;border-radius:50%;display:inline-grid;place-items:center;color:#fff;flex:none;letter-spacing:0;cursor:help}
.vz-hb .m.ok{background:#15803d}.vz-hb .m.warn{background:#b45309}.vz-hb .m.q{background:#64748b}
.vz-hb a.ok,.vz-hb b.ok,.vz-hb span.ok{color:#15803d}.vz-hb a.warn,.vz-hb b.warn,.vz-hb span.warn{color:#b45309}.vz-hb a.q,.vz-hb b.q,.vz-hb span.q{color:#0b63c5}
.vz-hb .s span{font-size:12px;white-space:nowrap}
.vz-hb.c{align-self:flex-start;margin:6px 0 0}
.vz-cb .vz-hb{flex:0 1 auto}
.vz-tabs{display:flex;flex-wrap:wrap;gap:6px}
.vz-tab{border:1px solid var(--line);background:var(--card,var(--panel));color:var(--mute);border-radius:8px;padding:5px 10px;font:inherit;font-size:var(--fb,15px);cursor:pointer}
.vz-tab.on{border-color:var(--gold);color:var(--ink);font-weight:700}
.vz-hd{display:flex;align-items:center;gap:12px;min-width:0}.vz-hd .vz-tabs{flex:none;flex-wrap:nowrap}
.vz-dn{position:absolute;left:5px;top:4px;z-index:3;font:700 22px/1.2 system-ui,sans-serif;letter-spacing:.02em;color:#3b4552;pointer-events:none}   /* the drawing number, snug in the page corner */
.vz-sheet{position:relative;border:1px solid var(--line);border-radius:10px;background:#fff;overflow:hidden;touch-action:none;cursor:default;user-select:none}
.vz-sheet.drag{cursor:default}.vz-stage{position:absolute;left:0;top:0;transform-origin:0 0}
.vz-sheet canvas{display:block}.vz-sheet .vz-note{padding:14px;margin:0;color:#5d6875}
.vz-sheet.vz-onpipe,.vz-sheet.vz-onpipe .vz-stage,.vz-sheet.vz-onpipe .vz-tx{cursor:pointer!important}.vz-rf{position:absolute;inset:0}.vz-rf i{position:absolute;cursor:pointer;border-radius:calc(2px * var(--iz,1));background:rgba(90,100,115,.15)}   /* as in the full screen viewer: a 15% grey wash */
.vz-rf i[data-k="d"]{background:rgba(90,100,115,.15)}.vz-rf i.hv{background:rgba(90,100,115,.28)}.vz-rf i.o{border-radius:50%}
.vz-rf i.rb{background:none!important;box-shadow:none!important}.vz-rf i.rb svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}.vz-rf i.rb polygon{fill:rgba(90,100,115,.15);stroke:none}
.vz-rf i.rb.hv polygon{fill:rgba(90,100,115,.28)}.vz-rf i.rb.hit polygon{fill:rgba(30,110,230,.28);stroke:rgba(30,110,230,.85);stroke-width:1.5px}.vz-rf i.rb.pick polygon{fill:rgba(30,110,230,.32);stroke:#1e6ee6;stroke-width:2.5px}.vz-sheet.on-ref,.vz-sheet.on-ref *{cursor:pointer!important}
.vz-rf i.pick{box-shadow:inset 0 0 0 calc(2.5px * var(--iz,1)) #1e6ee6,0 0 0 calc(2px * var(--iz,1)) rgba(255,255,255,.7);background:rgba(30,110,230,.32)}.vz-rf i.hit{box-shadow:inset 0 0 0 calc(1.5px * var(--iz,1)) rgba(30,110,230,.85);background:rgba(30,110,230,.28)}
.vz-fd{position:absolute;left:0;top:0;pointer-events:none}.vz-fd i{position:absolute;box-sizing:border-box;border:1.5px solid rgba(30,110,230,.85);background:rgba(30,110,230,.28);border-radius:2px}
.vz-sheet .vz-tx{z-index:2}.vz-mk{z-index:3}
.vz-zb{position:absolute;right:8px;bottom:8px;display:flex;gap:4px;z-index:2}.vz-zb button{width:32px;height:32px;border-radius:8px;border:1px solid #d9dee5;background:#fff;color:#1d2430;font-size:18px;line-height:1;cursor:pointer;display:grid;place-items:center;padding:0}.vz-zb .vz-ze{border-radius:50%;border:1.5px solid var(--gold);color:color-mix(in srgb,var(--gold) 75%,var(--ink))}   /* zoom extents, in the corner as in the full screen viewer */
.vz-zb button:hover{border-color:var(--gold)}
.vz-mk{position:absolute;left:0;top:0;pointer-events:none}:root:not(.phone) .vz-zb [data-z="out"],:root:not(.phone) .vz-zb [data-z="in"],:root:not(.phone) .vz-zb [data-z="full"]{display:none}:root.phone .vz-zb .vz-md{display:none}.vz-ttl{font:800 22px/1.2 system-ui,sans-serif;color:var(--ink);letter-spacing:.01em}.vz-sheet>.vz-tg{position:absolute;left:8px;top:8px;z-index:5;box-shadow:0 2px 8px #0002}.vz-cb{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:6px 8px;margin:6px 0 6px;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--ink) 3%,var(--card,#fff));position:relative;z-index:6}.vz-cb .vz-tg{position:static;box-shadow:none}.vz-cb .vz-fltk{position:static;flex-direction:row;gap:16px;box-shadow:none;background:none;padding:0;color:var(--ink)}.vz-cb .vz-flg{position:static;display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-left:auto;background:none;box-shadow:none;overflow:visible;max-height:none;font:inherit}.vz-cb .vz-flg[hidden]{display:none!important}.vz-cb .vz-flg .lbl{font:800 11px system-ui,sans-serif;letter-spacing:.4px;color:var(--mute);margin-right:2px;text-transform:uppercase}.vz-cb .chip{position:relative;padding:3px 9px;border:1px solid #cbd5e1;border-left:5px solid var(--c);border-radius:6px;background:var(--card,#fff);font:700 12px system-ui,sans-serif;color:#1d4ed8;text-decoration:underline;text-underline-offset:2px;cursor:pointer}.vz-cb .chip:hover{border-color:#94a3b8;border-left-color:var(--c)}.vz-cb .vz-flg.pk .chip:not(.on){opacity:.5}.vz-cb .chip.on{background:#eef2f7;outline:2px solid #64748b;outline-offset:1px}.vz-cb .chip .nm{display:none;position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);white-space:nowrap;font:700 12px system-ui,sans-serif;font-style:normal;text-decoration:none;color:#fff;background:#1f2937;padding:4px 9px;border-radius:6px;box-shadow:0 2px 8px #0004;pointer-events:none}.vz-cb .chip .nm::after{content:"";position:absolute;top:100%;left:50%;margin-left:-5px;border:5px solid transparent;border-top-color:#1f2937}.vz-cb .chip.on .nm{display:block}.vz-fltk{left:8px;top:52px;z-index:5}.vz-flg{right:8px;top:8px;max-height:calc(100% - 16px);z-index:5}.vz-tg{display:inline-flex;gap:2px;padding:2px;background:var(--card,#fff);border:1.5px solid var(--line);border-radius:9px}.vz-tg button{width:30px;height:30px;border:0;border-radius:7px;background:none;color:var(--ink);display:grid;place-items:center;cursor:pointer;padding:0}.vz-tg i{width:1px;background:var(--line);margin:4px 2px}:root.phone .vz-sheet>.vz-tg{display:none}:root:not(.phone) .vz-zb{display:none}.vz-tg .vz-md.on,.vz-zb .vz-md.on{background:var(--th-t,#eef1f5);box-shadow:inset 0 0 0 2px var(--th,#475569)}.vz-hand .vz-sheet{cursor:grab}.vz-hand.drag .vz-sheet{cursor:grabbing}.vz-hand .vz-tx{pointer-events:none;user-select:none;-webkit-user-select:none}:root:not(.phone) .vz-zb [data-z="full"]{display:none}
.vz-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start}
.vz-tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 12px;display:flex;flex-direction:column;gap:1px;min-width:0}.vz-tile em{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vz-tile span{font-size:var(--fl,13px);color:var(--mute);text-transform:uppercase;letter-spacing:.05em;font-weight:700}.vz-tile b{font-size:var(--fh,22px);line-height:1.15;font-variant-numeric:tabular-nums}.vz-tile em{font-style:normal;font-size:var(--fb,15px);color:var(--mute)}
.vz-gh{display:flex;align-items:center;margin:18px 0 10px;padding:5px 8px;background:var(--hd);font-size:var(--fl,13px);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--hd2);border:0}   /* the same grey band as Asset type and Results */.vz-gh:first-child{margin-top:0}
.vz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.vz-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-width:0}.vz-card.span{grid-column:1/-1}
.vz-card h3{margin:0 0 8px;font-size:var(--fl,13px);text-transform:uppercase;letter-spacing:.05em;color:var(--ink)}.vz-card h3 .vz-u{text-transform:none;letter-spacing:0}
.vz-note{margin:8px 0 0;font-size:var(--fb,15px);color:var(--mute)}
.vz-bars{display:flex;flex-direction:column;gap:3px}
.vz-row{display:grid;grid-template-columns:minmax(0,42%) 1fr auto;align-items:center;gap:8px;font-size:var(--fb,15px);padding:2px 4px;border-radius:6px}
.vz-row.act{cursor:pointer}.vz-row.act:hover,.vz-row:hover{background:var(--rh,var(--card2))}
.vz-l{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink)}
.vz-t{height:12px;display:block}.vz-t i{display:block;height:100%;background:var(--vz-bar);border-radius:0 4px 4px 0;min-width:2px}
.vz-row.oth .vz-t i{background:color-mix(in srgb,var(--mute) 55%,transparent)}
.vz-v{font-variant-numeric:tabular-nums;color:var(--mute);font-weight:600;min-width:44px;text-align:right}
.vz-don{display:flex;align-items:center;gap:14px}.vz-don svg{width:120px;height:120px;flex:none}
.vz-don circle{cursor:default}.vz-don circle:hover{stroke-width:19}
.vz-dt{text-anchor:middle;font-size:14px;font-weight:800;fill:var(--ink)}.vz-du{text-anchor:middle;font-size:8px;fill:var(--mute)}
.vz-don ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.vz-don li.act{cursor:pointer}.vz-don li.act:hover span{color:var(--gold)}
.vz-don li{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:7px;align-items:center;font-size:var(--fb,15px)}
.vz-don li i{width:10px;height:10px;border-radius:3px}.vz-don li span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vz-don li b{font-variant-numeric:tabular-nums;font-weight:700}.vz-don li em{font-style:normal;color:var(--mute);min-width:32px;text-align:right}
.vz-tip{position:fixed;z-index:200;pointer-events:none;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:var(--fb,15px);line-height:1.35;box-shadow:0 6px 18px #0006;max-width:260px}
.vz-tip[hidden]{display:none}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  // (the drawing showing beside the item; keepAll: the next item keeps the sheet exactly as it is)
  const shownDrawing = () => cur ? shown : null;
  let lastView = null; const keepAll = () => { if (lastView) keepView = Object.assign({}, lastView, { force: true }); setTimeout(() => { if (keepView && keepView.force) keepView = null; }, 2500); };
  return { mount, update, item, list, home, find, keep, restoreView, shownDrawing, keepAll, setLast: v => { lastView = v; } };
})();
