// In-app PDF viewer shared by the pipe and valve spec (spec.js) and the P&IDs (pid.js).
// PdfView.open({ url, page, title, number, fit: "width" | "page", find, download, name, refs, onRef, restore, back, extent })
//   extent: open on the whole sheet, the find marked but not zoomed onto
//   The visible part of the page is redrawn from the PDF's own vectors at every zoom, so it stays sharp.
//   find: a tag to mark on the page (a line number, valve, instrument…). The mark stays until another document or
//   another search is opened; spaces, hyphens and slashes are ignored and a tag split over several text pieces is found.
// PDF.js is bundled in vendor/pdfjs and loaded on first use.
// View history: every view (document, page, zoom, where on the sheet) is a browser history entry, so the app's back /
// forward, the mouse's back / forward buttons and the phone's back gesture step through them; back past the first
// view of a run returns to the app page it was opened from. Zooming and panning make a new view only once they settle
// and moved a little way (zoom by a tenth, or a fifth of the screen); smaller moves update the view you're on.
window.PdfView = (() => {
  const HAND = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13M17 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L3.6 14.6a1.5 1.5 0 0 1 2.2-2L8 14.5"/></svg>',
    ARROW = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l14 8.5-6.2 1.3L16.5 20l-2.8 1.3-3.7-7.2L5 18.5z"/></svg>';
  // OCR'd sheets: , ; : read for - or ., $ for S, O for 0 in numbers, so both sides are folded the same way
  const norm = s => String(s || "").toUpperCase().replace(/\$/g, "S").replace(/[\s\-_/.,;:|]+/g, "").replace(/(?<=\d)O|O(?=\d)/g, "0");
  let V = null, lib = null, cur = null;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const docs = new Map();
  const loadLib = () => lib || (lib = new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "vendor/pdfjs/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js"; ok(window.pdfjsLib); }; s.onerror = () => { lib = null; bad(new Error("viewer not reachable")); }; document.head.appendChild(s); }));
  const getDoc = url => { if (!docs.has(url)) docs.set(url, loadLib().then(L => L.getDocument({ url, disableRange: true, disableStream: true }).promise).catch(e => { docs.delete(url); throw e; })); return docs.get(url); };

  function ui(){
    if (V) return V;
    const el = document.createElement("div"); el.className = "sp-view"; el.hidden = true;
    el.innerHTML = `<div class="sp-top"><button class="sp-back" data-a="back" title="Back to the previous view (or the page before)">←</button><button class="sp-fwd" data-a="fwd" title="Forward" disabled>→</button><b class="sp-tt"></b><div class="sp-nav sp-pages"><button data-a="prev" title="Previous page">◀</button><span class="sp-pg"></span><button data-a="next" title="Next page">▶</button></div>
      <input class="sp-q" type="search" placeholder="Find in this drawing (Ctrl+F)" aria-label="Find in this drawing" autocomplete="off" spellcheck="false">
      <div class="sp-nav sp-finds" hidden><button data-a="fprev" title="Previous match">‹</button><span class="sp-fn"></span><button data-a="fnext" title="Next match">›</button></div>
      <div class="sp-nav"><button data-a="out" title="Zoom out">−</button><button data-a="in" title="Zoom in">+</button></div>
      <button class="sp-fb" data-a="find" title="Find in this drawing"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg></button><button class="sp-rot" data-a="rot" title="Turn to landscape / back">⟲</button><a class="sp-dl" title="Download this PDF">Download</a><button class="sp-x" data-a="close" title="Close">✕</button></div>
      <div class="sp-body"><div class="sp-sheet"><canvas class="sp-bg"></canvas><canvas class="sp-hi"></canvas><svg class="sp-fl"></svg><svg class="sp-trl"></svg><div class="sp-refs"></div><div class="sp-marks"></div><div class="sp-tap"></div><div class="sp-text textLayer"></div><div class="sp-dn"></div></div></div><div class="sp-msg"></div>
      <button class="sp-ze" data-a="fit" title="Zoom extents (whole sheet)"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>`;
    // phone, sheet at fit: the room left under the sheet holds a panel (cur.panel fills it: the connected drawings, pid.js)
    // (the zoom extents button sits beside find in the bottom bar: on a phone the bar is all there is, on a computer it floats)
    { const fb = el.querySelector(".sp-fb"); fb.after(el.querySelector(".sp-ze")); }
    const cx = document.createElement("div"); cx.className = "sp-cx"; cx.hidden = true; el.appendChild(cx);
    // phone, the whole sheet in view: ‹ › on its left and right edges, the drawing before / after (as a swipe)
    ["l", "r"].forEach(sd => { const a = document.createElement("button"); a.type = "button"; a.className = "sp-arw " + sd; a.hidden = true; a.textContent = sd === "l" ? "‹" : "›";
      a.title = sd === "l" ? "The drawing before" : "The drawing after"; a.onclick = e => { e.stopPropagation(); if (cur && cur.swipe) cur.swipe(sd === "l" ? -1 : 1, true); }; el.appendChild(a); });
    // a button in the top right corner over the sheet, set by the opener (cur.corner: { html, title, go }): P&IDs' Drawing legend
    // phone, a line traced (trace below): its number, how far along, open its page, ✕; the zoom and along the line sliders
    const tb = document.createElement("div"); tb.className = "sp-trb"; tb.hidden = true;
    tb.innerHTML = `<div class="sp-trh"><b class="sp-trn"></b><span class="sp-trzh" title="Zoom (Ctrl + wheel)"><button type="button" data-zh="-10" aria-label="Further">−</button><span class="sp-trzhb"><input type="range" class="sp-rg sp-trz2" min="0" max="100" step="any" aria-label="Zoom"></span><button type="button" data-zh="10" aria-label="Closer">+</button><b>Zoom</b></span><button type="button" class="sp-tro" title="Open this line's asset page">Asset</button><button type="button" class="sp-trx" title="Stop tracing">✕</button></div>
      <div class="sp-trrow"><div class="sp-trnx l"></div><div class="sp-trtk"><input type="range" class="sp-tra sp-rg" min="0" max="1000" step="any" aria-label="Along the line"><div class="sp-trln"><span></span><span></span></div><div class="sp-trc"></div></div><div class="sp-trnx r"></div></div><div class="sp-tre"><span class="s"></span><span class="sp-trp"></span><span class="e"></span></div>`;
    // (the zoom: an upright slider on the right of the sheet, + at the top, − at the foot)
    const tz = document.createElement("div"); tz.className = "sp-trv"; tz.hidden = true;
    tz.innerHTML = `<button type="button" data-z="10" aria-label="Closer">+</button><span class="sp-trzb"><input type="range" class="sp-trz sp-rg" min="0" max="100" step="any" aria-label="Zoom"></span><button type="button" data-z="-10" aria-label="Further">−</button>`;
    tz.addEventListener("click", e => e.stopPropagation()); el.appendChild(tz);
    tb.addEventListener("click", e => { e.stopPropagation(); const g = e.target.closest("b.go"); if (!g || !TR) return;
      // (an instrument, valve, equipment named on the strip: out of the fly through, the asset opened, its box on the sheet marked)
      if (g.classList.contains("as")){ const tag = g.dataset.t, i = V.pageRefs.findIndex(r => String(r[5]).split("|").includes(tag)), bx = i >= 0 ? V.boxes[i] : null;
        if (bx){ V.tap = { page: V.page, l: bx[0] / 1e4, t: bx[1] / 1e4, w: bx[2] / 1e4, h: bx[3] / 1e4 }; drawTap(); }
        trEnd(); if (cur && cur.onRef) cur.onRef(tag, "tag", null, bx || null); return; }
      const m = TR.m.find(q => q[1] === "t" && String(q[0]) === g.dataset.f && q[2] === g.dataset.t), k = m && teeK(m); if (k != null) trGo({ k, pt: trAt(m[0]) }); }); el.appendChild(tb);
    const cb = document.createElement("button"); cb.type = "button"; cb.className = "sp-lg"; cb.hidden = true; el.appendChild(cb);
    // (phone: on the left, the Colours / Flow animation tick boxes always showing and the Legend under them; find and
    // zoom extents on the right)
    if (document.documentElement.classList.contains("phone")) requestAnimationFrame(() => { if (!V.ftk) return; const pl = document.createElement("div"); pl.className = "sp-pl"; el.appendChild(pl); pl.append(V.ftk, cb); });
    cb.onclick = () => cur && cur.corner && cur.corner.go();
    // (the P&ID lines chip, top left of the sheet on a phone: colour by fluid, flow animation; and the fluid legend)
    const lc = document.createElement("button"); lc.type = "button"; lc.className = "sp-lc"; lc.hidden = true;
    lc.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h12" stroke="#1565ff"/><path d="M3 12h15" stroke="#00a651"/><path d="M3 18h12" stroke="#ff9500"/><path d="M18 3l3 3-3 3M18 15l3 3-3 3" stroke="currentColor"/></svg><span>Lines</span>`; el.appendChild(lc);
    const lp = document.createElement("div"); lp.className = "sp-lcp"; lp.hidden = true;
    lp.innerHTML = `<h6>P&amp;ID lines, all drawings</h6><label><span>Colours</span><input type="checkbox" class="ap-sw" data-f="c"></label><label><span>Animation</span><input type="checkbox" class="ap-sw" data-f="w"></label>`; el.appendChild(lp);
    const flg = document.createElement("div"); flg.className = "sp-flg lkC"; flg.hidden = true; el.appendChild(flg);
    // (desktop: the two as tick boxes, always there, under the hand / pointer / whole sheet buttons)
    const ftk = document.createElement("div"); ftk.className = "sp-fltk"; ftk.hidden = true;
    ftk.innerHTML = `<label><input type="checkbox" data-f="c"><span>Colours</span></label><label><input type="checkbox" data-f="w"><span>Animation</span></label>`; el.appendChild(ftk);
    ftk.addEventListener("click", e => e.stopPropagation());
    ftk.addEventListener("change", e => { const f = e.target.dataset.f; if (!f) return; FL[f] = e.target.checked; try { localStorage.setItem(f === "c" ? "kcgm_flc" : "kcgm_flw", FL[f] ? "1" : "0"); } catch (x) {} if (!FL.c) pickEnd(); drawFl(); });
    lc.onclick = e => { e.stopPropagation(); lp.hidden = !lp.hidden; if (!lp.hidden){ lp.querySelector('[data-f="c"]').checked = FL.c; lp.querySelector('[data-f="w"]').checked = FL.w; const r = lc.getBoundingClientRect(), q = el.getBoundingClientRect(); lp.style.left = (r.left - q.left) + "px"; lp.style.top = (r.bottom - q.top + 5) + "px"; } };
    lp.addEventListener("click", e => e.stopPropagation());
    lp.addEventListener("change", e => { const f = e.target.dataset.f; if (!f) return; FL[f] = e.target.checked; try { localStorage.setItem(f === "c" ? "kcgm_flc" : "kcgm_flw", FL[f] ? "1" : "0"); } catch (x) {} drawFl(); });
    flg.addEventListener("click", e => { e.stopPropagation(); const row = e.target.closest("[data-fc]");
      if (row){ const c = row.dataset.fc; if (FL.pick === c) pickEnd("x"); else pick1(c); return; }
      if (!e.target.closest(".hd")) return; FL.leg = !FL.leg; try { localStorage.setItem("kcgm_flleg", FL.leg ? "1" : "0"); } catch (x) {} flLeg(FL.cnt || {}); });
    el.addEventListener("click", e => { if (!lp.hidden && !e.target.closest(".sp-lcp,.sp-lc")) lp.hidden = true; }, true);
    document.body.appendChild(el);
    V = { tb, tz, lc, lp, flg, ftk, fl: el.querySelector(".sp-fl"), trl: el.querySelector(".sp-trl"), cx, el, body: el.querySelector(".sp-body"), sheet: el.querySelector(".sp-sheet"), bg: el.querySelector(".sp-bg"), hi: el.querySelector(".sp-hi"), marks: el.querySelector(".sp-marks"),
      msg: el.querySelector(".sp-msg"), refsEl: el.querySelector(".sp-refs"), tapEl: el.querySelector(".sp-tap"), textEl: el.querySelector(".sp-text"), refs: [], page: 1, zoom: 1, pg: null, base: 1, hits: [], fi: 0 };
    el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({ prev: () => go(V.page - 1), next: () => go(V.page + 1), in: () => zoomTo(V.zoom * 1.5), out: () => zoomTo(V.zoom / 1.5), fit: () => zoomTo(1),
      fprev: () => V.fit ? fitStep(-1) : showHit(V.fi - 1, -1), fnext: () => V.fit ? fitStep(1) : showHit(V.fi + 1, 1), rot, close,
      find: () => { const on = !el.classList.contains("find-on"); el.classList.toggle("find-on", on); const q = el.querySelector(".sp-q"); if (on){ q.focus(); q.select(); } else q.blur();
        // (one browser history step while the find box is open: the phone's swipe back closes it, the keyboard having gone on the first)
        if (on && history.state && history.state.sp && !history.state.fd) history.pushState(Object.assign({}, history.state, { fd: 1 }), "");
        else if (!on && history.state && history.state.fd){ fdPop = true; history.back(); } }, back: () => history.back(), fwd: () => history.forward() })[b.dataset.a]());
    // find: Ctrl+F / ⌘F while a drawing is open searches its text (the page is a picture, so the browser's own find can't)
    const q = el.querySelector(".sp-q"); let qt;
    // phone: while typing (keyboard up) only the find box and its count show, so the drawing keeps the rest of the screen
    q.addEventListener("focus", () => { el.classList.add("typing"); cxFit(); }); q.addEventListener("blur", () => { el.classList.remove("typing"); setTimeout(cxFit, 300); });
    q.addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { if (!V.fit) return findText(q.value); fitFilter(q.value); if (!V.fmatch.length && q.value.trim()) findText(q.value); }, V.fit ? 150 : 350); });
    q.addEventListener("keydown", e => { e.stopPropagation();
      if (e.key === "Enter"){ e.preventDefault(); clearTimeout(qt);
        if (V.fit){ if (String(q.value).trim() !== V.fq) fitFilter(q.value);
          if (V.fmatch.length || !String(q.value).trim()){ fitStep(e.shiftKey ? -1 : 1); return; } }
        // (a checked sheet with no label matching: the printed words, as on any other sheet)
        if (V.fit && V.fmatch.length) return;
        if (V.hits.length && norm(q.value) === norm(cur.find || "")) showHit(V.fi + (e.shiftKey ? -1 : 1), e.shiftKey ? -1 : 1); else findText(q.value, true); }
      if (e.key === "Escape"){ q.value = ""; q.blur(); if (V.fit) fitFilter(""); } });
    addEventListener("keydown", e => { if (el.hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f"){ e.preventDefault(); q.focus(); q.select(); return; }
      if (e.key === "Escape") close(); if (e.key === "ArrowRight" && V.zoom === 1) go(V.page + 1); if (e.key === "ArrowLeft" && V.zoom === 1) go(V.page - 1); });
    addEventListener("popstate", e => { const st = e.state, v = st && st.sp && REG.get(st.id);
      // the phone's swipe back (or the browser's Back) while zoomed in: out to the whole sheet, the viewer stays open
      if (zIgnore){ zIgnore = false; return; }
      // (only onto the visit's own step: landing on a page step is → past the drawing, or Back past it, and closes)
      if (zIn && !el.hidden && st && st.sp && !st.z){ zIn = false; if (V.zoom > 1.001){ quiet(); zoomTo(1); } return; }
      // (→ onto the zoom step of the view already showing: nothing to see there, on to the step after it)
      if (!el.hidden && st && st.sp && st.z && st.id === curId){ zIn = true; history.forward(); return; }
      if (v){ zIn = !!st.z; restore(st.id); } else if (!el.hidden) close(true); });
    // rotating the phone: refit the sheet once the new size has settled (keeps the zoom level)
    // (only a real size change: the browser bar sliding in and out while panning must not redraw everything)
    let rt, lastW = 0, lastH = 0; const refit = () => { clearTimeout(rt); rt = setTimeout(() => { if (el.hidden) return; const w = V.body.clientWidth, h = V.body.clientHeight;
      // (a phone keyboard opening or closing changes only the height: the sheet stays as it is, zoom and place)
      if (Math.abs(w - lastW) < 2 && (Math.abs(h - lastH) < 120 || document.documentElement.classList.contains("phone"))) return; lastW = w; lastH = h; layout(true); }, 250); };
    V.size = () => { lastW = V.body.clientWidth; lastH = V.body.clientHeight; };
    addEventListener("resize", refit); if (screen.orientation) screen.orientation.addEventListener("change", refit);
    let t; V.body.addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(sharp, 70); settleSoon(); });
    // wheel zoom: the sheet is scaled smoothly while the wheel turns (about the cursor) and redrawn sharp once it stops
    let wz = null;
    V.body.addEventListener("wheel", e => { if (!e.ctrlKey && cur.fit !== "page") return; e.preventDefault(); if (!V.pg) return;
      if (!wz){ const q = V.sheet.getBoundingClientRect(); wz = { z: V.zoom, q, t: 0 }; }
      const max = cur.fit === "page" ? 24 : 10, z = Math.max(1, Math.min(max, wz.z * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0025))));
      const v = V.sheet.getBoundingClientRect(), fx = (e.clientX - v.left) / v.width, fy = (e.clientY - v.top) / v.height, k = z / V.zoom;
      wz.z = z; wz.cx = e.clientX; wz.cy = e.clientY;
      V.sheet.style.transformOrigin = "0 0";
      V.sheet.style.transform = `translate(${e.clientX - wz.q.left - fx * wz.q.width * k}px,${e.clientY - wz.q.top - fy * wz.q.height * k}px) scale(${k})`;
      V.sheet.style.setProperty("--trk", 1 / k);   // (and the lines and the arrow held at their size while the wheel zooms)
      clearTimeout(wz.t); wz.t = setTimeout(() => { const w = wz; wz = null; const q = V.sheet.getBoundingClientRect(), fx = (w.cx - q.left) / q.width, fy = (w.cy - q.top) / q.height;
        V.sheet.style.transform = ""; zoomTo(w.z, w.cx, w.cy, fx, fy); }, 140);
    }, { passive: false });
    // touch pinch: scale the sheet while pinching, redraw sharp when the fingers lift
    const pts = new Map(); let pin = null;
    // one finger pans here, not by the browser's scrolling: phones lock that to one axis when a drag starts mostly
    // across or mostly down, so the sheet would only move in x or in y. Free in every direction, then a short glide.
    let pan = null, glide = 0;
    // (held: the finger left down when a pinch ends. Spreading fingers are still moving apart as they lift, so that
    // finger's first moments are not a pan and its lift is never a flick: it waits a moment, then pans with no glide.)
    const panFrom = (e, held) => { cancelAnimationFrame(glide); const now = performance.now(); pan = { x: e.clientX, y: e.clientY, sl: V.body.scrollLeft, st: V.body.scrollTop, s: [[now, e.clientX, e.clientY]], held: held ? now + 160 : 0, np: !!held }; };
    const zmax = () => cur.fit === "page" ? 24 : 10, gap = (a, b) => Math.max(30, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));   // (fingers almost touching: a few px of jitter must not read as a big zoom)
    V.body.addEventListener("pointerdown", e => { if (e.pointerType === "touch" && pts.size === 0) panFrom(e); });
    // (two fingers down: the panel under the sheet goes at once, not when the pinch ends)
    V.body.addEventListener("pointerdown", e => { pts.set(e.pointerId, e); if (pts.size === 2){ pan = null; V.cx.hidden = true; V.el.classList.remove("cx-on"); const [a, b] = [...pts.values()]; pin = { d: gap(a, b), z: V.zoom, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, f: 1, mx: 0, my: 0 }; } });
    // a finger whose lift never arrived (it went down on a tag box or text that was redrawn under it, so its events were
    // lost) would pair with the next finger as a pinch and throw the sheet: the screen's own count of fingers puts it right
    V.body.addEventListener("touchstart", e => { if (pts.size <= e.touches.length) return;
      while (pts.size > e.touches.length) pts.delete(pts.keys().next().value);
      if (pts.size < 2 && pin){ pin = null; V.sheet.style.transform = ""; }
      if (pts.size === 1 && !pan) panFrom([...pts.values()][0]); }, { passive: true });
    V.body.addEventListener("pointermove", e => { if (!pan || e.pointerType !== "touch" || pts.size !== 1 || !pts.has(e.pointerId)) return;
      const now = performance.now();
      if (pan.held){ if (now < pan.held) return; Object.assign(pan, { x: e.clientX, y: e.clientY, sl: V.body.scrollLeft, st: V.body.scrollTop, s: [[now, e.clientX, e.clientY]], held: 0 }); return; }   // (the pan starts from where the finger is now: no jump)
      V.body.scrollLeft = pan.sl - (e.clientX - pan.x); V.body.scrollTop = pan.st - (e.clientY - pan.y);
      // (the whole sheet in view with the strip under it: the sheet follows a sideways drag, for a swipe to the next drawing)
      if (cur.swipe && !V.cx.hidden){ const dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (Math.abs(dx) > Math.abs(dy)) V.sheet.style.transform = `translateX(${dx * .6}px)`; }
      pan.s.push([now, e.clientX, e.clientY]); while (pan.s.length > 2 && now - pan.s[0][0] > 120) pan.s.shift(); });   // (the last 120 ms of the drag, for the glide's speed)
    V.body.addEventListener("pointermove", e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e); if (pin && pts.size === 2){ const [a, b] = [...pts.values()];
      pin.f = Math.max(1, Math.min(zmax(), pin.z * gap(a, b) / pin.d)) / pin.z;   // (never past the zoom limits, so nothing snaps back on lifting)
      // pinch and move at once (as in a photo app): the sheet scales about where the fingers started and follows their midpoint
      // (the lines and the arrow counter-scaled as the fingers move, so they hold their size throughout, not only once they lift)
      pin.mx = (a.clientX + b.clientX) / 2 - pin.cx; pin.my = (a.clientY + b.clientY) / 2 - pin.cy;
      if (!pin.o){ const q = V.sheet.getBoundingClientRect(); pin.o = `${pin.cx - q.left}px ${pin.cy - q.top}px`; pin.fx = (pin.cx - q.left) / q.width; pin.fy = (pin.cy - q.top) / q.height; }
      V.sheet.style.transformOrigin = pin.o; V.sheet.style.transform = `translate(${pin.mx}px,${pin.my}px) scale(${pin.f})`; V.sheet.style.setProperty("--trk", 1 / pin.f); } });
    let lastTap = null;
    const up = e => { pts.delete(e.pointerId);
      // the pinch ends: the point of the sheet the fingers started on lands where their midpoint finished (one step, so
      // it holds whether the sheet scrolls or still sits inside the window)
      if (pin && pts.size < 2){ const p = pin, z0 = V.zoom; pin = null; V.sheet.style.transform = ""; zoomTo(p.z * p.f, p.cx + p.mx, p.cy + p.my, p.fx, p.fy); cxFit();
        if (V.zoom === z0){ V.body.scrollLeft -= p.mx; V.body.scrollTop -= p.my; } slide(); sharp(); lastTap = null;
        if (e.pointerType === "touch" && pts.size === 1) panFrom([...pts.values()][0], true); else pan = null; return; }
      // double-tap: in twice as close where tapped; again (zoomed in) back out to the whole sheet
      if (e.pointerType === "touch" && e.type === "pointerup" && !pts.size && pan && !pan.np && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 10){
        const now = performance.now(); if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30){ lastTap = null; pan = null; zoomTo(V.zoom > 1.05 ? 1 : 2, e.clientX, e.clientY); return; }
        lastTap = { t: now, x: e.clientX, y: e.clientY }; }
      if (e.pointerType !== "touch") return;
      // a swipe across the whole sheet (strip showing): the next drawing (cur.swipe, pid.js); short of one, the sheet slides back
      if (cur.swipe && !V.cx.hidden && pan && !pan.np && !pts.size && e.type === "pointerup"){ const dx = e.clientX - pan.x, dy = e.clientY - pan.y, sw = Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && cur.swipe(dx < 0 ? 1 : -1);
        // (out far enough to clear the window whatever the sheet's size: its far edge past the window's near one)
        const sr = V.sheet.getBoundingClientRect(), br = V.body.getBoundingClientRect(), cur0 = new DOMMatrix(getComputedStyle(V.sheet).transform).m41 || 0;
        const out = dx < 0 ? cur0 - (sr.right - br.left) - 8 : cur0 + (br.right - sr.left) + 8;
        V.sheet.style.transition = "transform .18s ease-in"; V.sheet.style.transform = sw ? `translateX(${out}px)` : "";
        // (swiped: the sheet stays off screen until the next drawing's picture is in, which then slides in from the other
        // side; the old drawing never shows again in between)
        if (sw){ const dir = dx < 0 ? 1 : -1; V.swIn = { dir, out: false }; clearTimeout(V.swT); V.swT = setTimeout(swEnter, 2000); pan = null; lastTap = null;
          // (the next drawing opened once the sheet has left the screen: when its slide ends, or after 450 ms at most)
          let gone = false; const go = () => { if (gone) return; gone = true; V.sheet.removeEventListener("transitionend", go); if (V.swIn) { V.swIn.out = true; V.sheet.style.opacity = 0; } cur.swipe(dir, true); };
          V.sheet.addEventListener("transitionend", go); setTimeout(go, 450); return; }
        setTimeout(() => { if (!V.swIn) V.sheet.style.transition = ""; }, 200); }
      if (pts.size === 1){ panFrom([...pts.values()][0], true); return; }   // more fingers than a pinch, one still down: it carries on panning
      if (pts.size || !pan) return; const g = pan; pan = null;
      const s = g.s, a = s[0], b = s[s.length - 1], dt = b[0] - a[0];
      if (g.np || e.type === "pointercancel" || performance.now() - b[0] > 80 || dt < 24) return;   // after a pinch, or a finger that stopped before lifting: no glide
      let vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt, t0 = performance.now();
      const sp = Math.hypot(vx, vy), cap = 3; if (sp > cap){ vx *= cap / sp; vy *= cap / sp; }   // (px per ms: one odd sample can't throw the sheet across the screen)
      const step = now => { const dt = Math.min(32, now - t0); t0 = now; V.body.scrollLeft -= vx * dt; V.body.scrollTop -= vy * dt; const k = Math.pow(.995, dt); vx *= k; vy *= k;
        if (Math.hypot(vx, vy) > .02) glide = requestAnimationFrame(step); };
      if (Math.hypot(vx, vy) > .15) glide = requestAnimationFrame(step); };
    V.body.addEventListener("pointerup", up); V.body.addEventListener("pointercancel", up);
    // mouse: middle button drag pans a drawing
    let dr = null;
    // (the left button selects text like any PDF; holding the middle button pans)
    // desktop: the hand (default) drags the sheet with the left button, the pointer selects text; the middle button always pans
    V.body.addEventListener("mousedown", e => { const hand = V.el.classList.contains("sp-hand");
      if (e.button === 1 || (e.button === 0 && hand && !e.target.closest("input,button,a"))){ if (e.button === 1) e.preventDefault(); dr = { x: e.clientX, y: e.clientY, l: V.body.scrollLeft, t: V.body.scrollTop, b: e.button }; V.body.classList.add("drag"); } }, true);
    V.body.addEventListener("click", e => { if (V.dragged){ V.dragged = false; e.stopPropagation(); e.preventDefault(); } }, true);   // (a drag is not a tap)
    V.body.addEventListener("auxclick", e => { if (e.button === 1) e.preventDefault(); });
    // left drag over the text selects it (done here, from the press point to the pointer, as the browser's own drag
    // selection drops out over the layer's pieces); a plain click still taps whatever tag is under it
    let selA = null;
    const caret = (x, y) => { const c = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : document.caretPositionFromPoint && (p => p && { startContainer: p.offsetNode, startOffset: p.offset })(document.caretPositionFromPoint(x, y)); return c && V.textEl.contains(c.startContainer) ? c : null; };
    V.textEl.addEventListener("mousedown", e => { if (e.button === 2 && String(getSelection()).trim()){ e.preventDefault(); return; }   // (a right click keeps the selection for Copy)
      if (e.button !== 0) return; const c = caret(e.clientX, e.clientY); e.preventDefault(); getSelection().removeAllRanges();
      selA = c ? { n: c.startContainer, o: c.startOffset, x: e.clientX, y: e.clientY } : { x: e.clientX, y: e.clientY }; });
    addEventListener("mousemove", e => { if (!selA || !(e.buttons & 1)) return; if (!selA.n){ const c = caret(e.clientX, e.clientY); if (c){ selA.n = c.startContainer; selA.o = c.startOffset; } return; }
      const c = caret(e.clientX, e.clientY); if (c) try { getSelection().setBaseAndExtent(selA.n, selA.o, c.startContainer, c.startOffset); } catch (x) {} });
    addEventListener("mouseup", () => { selA = null; });
    addEventListener("mousemove", e => { if (!dr) return; if (Math.hypot(e.clientX - dr.x, e.clientY - dr.y) > 4) dr.m = true; if (!dr.m) return; V.body.scrollLeft = dr.l - (e.clientX - dr.x); V.body.scrollTop = dr.t - (e.clientY - dr.y); });
    addEventListener("mouseup", () => { if (dr && dr.m) V.dragged = true; setTimeout(() => { V.dragged = false; }, 0); dr = null; V.body.classList.remove("drag"); });
    // the hand / pointer switch, top centre of the sheet (desktop); the choice is remembered
    const md = document.createElement("div"); md.className = "sp-mode"; md.innerHTML = `<button type="button" data-m="hand" title="Pan: drag the drawing">${HAND}</button><button type="button" data-m="sel" title="Select text">${ARROW}</button><i></i><button type="button" data-a="fit" title="Zoom to fit the whole sheet"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>`;
    el.appendChild(md); const setMode = m => { el.classList.toggle("sp-hand", m !== "sel"); md.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.m === (m === "sel" ? "sel" : "hand"))); try { localStorage.setItem("kcgm_spm", m); } catch (x) {} };
    md.onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.m) setMode(b.dataset.m); else if (b.dataset.a === "fit") el.querySelector(".sp-ze").click(); }; setMode((() => { try { return localStorage.getItem("kcgm_spm") || "hand"; } catch (x) { return "hand"; } })());
    V.body.style.touchAction = "none";   // (fingers pan and pinch through the handlers above, free in every direction; "pan-x pan-y" left the browser to scroll, locked to one axis)
    let down = null, downAt = 0; V.body.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; downAt = performance.now(); }, true);
    // right click (long press on a phone) anywhere on the sheet: Save as PDF, and on a highlighted tag, copy its text
    V.body.addEventListener("contextmenu", e => {
      if (!cur || !V.pg) return; e.preventDefault();
      const a = refAt(e.clientX, e.clientY), r = a && V.pageRefs[+a.dataset.i], sel = String(getSelection() || "").replace(/\s+/g, " ").trim();
      const tags = (sel ? [sel] : []).concat(r ? String(r[5]).split("|").filter(t => t !== sel) : []);
      pickClose(); const p = document.createElement("div"); p.className = "sp-pick sp-copy";
      p.innerHTML = tags.map(t => `<button type="button" data-t="${esc(t)}">⧉ Copy ${esc(t.length > 40 ? t.slice(0, 38) + "…" : t)}</button>`).join("") + `<button type="button" data-save="1">⤓ Save as PDF…</button>`;
      V.el.appendChild(p); const q = V.el.getBoundingClientRect();
      p.style.left = Math.max(6, Math.min(q.width - p.offsetWidth - 6, e.clientX - q.left)) + "px"; p.style.top = Math.max(50, Math.min(q.height - p.offsetHeight - 6, e.clientY - q.top + 8)) + "px";
      p.querySelectorAll("button[data-t]").forEach(b => b.onclick = ev => { ev.stopPropagation(); const t = b.dataset.t;
        const done = () => { pickClose(); toast("Copied " + t); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => { fallbackCopy(t); done(); }); else { fallbackCopy(t); done(); } });
      p.querySelector("[data-save]").onclick = ev => { ev.stopPropagation(); pickClose(); savePdf(); };
    });
    // Save as: the browser's own Save As window where it has one (desktop Chrome / Edge), else a normal download
    async function savePdf(){
      const name = cur.download || cur.url.split("/").pop();
      if (window.showSaveFilePicker){
        try {
          const h = await showSaveFilePicker({ suggestedName: name, types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] });
          const blob = await (await fetch(cur.url)).blob(), w = await h.createWritable(); await w.write(blob); await w.close(); toast("Saved " + h.name); return;
        } catch (err){ if (err && err.name === "AbortError") return; }
      }
      const l = document.createElement("a"); l.href = cur.url; l.download = name; document.body.appendChild(l); l.click(); l.remove();
    }
    const fallbackCopy = t => { const x = document.createElement("textarea"); x.value = t; x.style.position = "fixed"; x.style.opacity = "0"; document.body.appendChild(x); x.select(); try { document.execCommand("copy"); } catch (e) {} x.remove(); };
    // the tag under a point on the screen (the boxes sit under the text layer, so found by position)
    const refAt = (x, y) => { if (!V.boxes || !V.boxes.length) return null; const q = V.refsEl.getBoundingClientRect(); if (!q.width) return null;
      const fx = (x - q.left) / q.width * 1e4, fy = (y - q.top) / q.height * 1e4, i = PdfView.nearest(V.boxes, fx, fy); if (i >= 0) return V.refsEl.children[i];
      // (phone, the whole sheet in view: a continuation ribbon answers a finger anywhere near it, half its size again all round)
      if (!desk() && V.zoom <= 1.001) for (let j = 0; j < V.pageRefs.length; j++){ const r = V.pageRefs[j], b = V.boxes[j]; if (!b || r[6] !== "d") continue; const gx = Math.max(b[2], 120) * .5, gy = Math.max(b[3], 120) * .5;
        if (fx > b[0] - gx && fx < b[0] + b[2] + gx && fy > b[1] - gy && fy < b[1] + b[3] + gy) return V.refsEl.children[j]; }
      return null; };
    let hv = null; V.body.addEventListener("mousemove", e => { const a = refAt(e.clientX, e.clientY); if (a === hv) return;
      if (hv) hv.classList.remove("hv"); hv = a; if (a) a.classList.add("hv"); V.body.classList.toggle("on-ref", !!a); });
    V.body.addEventListener("click", e => {
      if (!e.target.closest || !e.target.closest(".sp-pick")) pickClose(); else return;
      const sel = getSelection(); if (sel && !sel.isCollapsed && String(sel).trim() && V.body.contains(sel.anchorNode)) return;   // (finishing a text selection on the sheet, not a tap; one elsewhere doesn't count)
      const a = refAt(e.clientX, e.clientY);
      if (!a && TR && (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 8) && trNear(e.clientX, e.clientY)){ trOpen(); return; }
      // (the pipe itself, as its number: the fly through along that line, from the spot tapped)
      if (!a && (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 8) && /-(PID|SLD)-/.test(cur.number || "")){ const hit = lineAt(e.clientX, e.clientY);
        if (hit){ if (FL.pick) pickEnd(); const r = V.refs[hit.k], b = boxOf(r), bx = { page: V.page, l: b[0] / 1e4, t: b[1] / 1e4, w: b[2] / 1e4, h: b[3] / 1e4 }; V.tap = bx; drawTap();
          trace(hit.k, hit.at, [bx.l, bx.t, bx.w, bx.h]); return; } }
      if (!a && FL.pick && !TR && (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 8)){ const t0 = performance.now();
        setTimeout(() => { if (FL.pick && downAt <= t0) pickEnd("x"); }, desk() ? 0 : 330); return; }
      // (a tap on the bare sheet leaves the fly through, back to the drawing as it is; not the first tap of a double tap)
      if (!a && TR && (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 8)){ const t0 = performance.now();
        setTimeout(() => { if (TR && downAt <= t0) trEnd("x"); }, desk() ? 0 : 330); return; }
      if (!a && hiOn() && (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 8)){ V.hiB = null; drawFl(); return; }
      if (!a || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8)) return;
      const r = V.pageRefs[+a.dataset.i]; if (!r || !cur.onRef) return;
      a.classList.add("hit"); setTimeout(() => a.classList.remove("hit"), 400);
      // the red arrow on what was tapped, kept with this view (back here shows where you were)
      const bx = V.boxes[+a.dataset.i]; if (bx){ V.tap = { page: V.page, l: bx[0] / 1e4, t: bx[1] / 1e4, w: bx[2] / 1e4, h: bx[3] / 1e4 }; drawTap(); const me = REG.get(curId); if (me){ me.snap = state(); me.tap = V.tap; } }
      if (FL.pick && (r[6] === "line" || r[6] === "mel" || r[6] === "elec")) pickEnd();
      if (TR && r[6] !== "line" && r[6] !== "d") trEnd();   // (an instrument, equipment, a valve picked while flying: out of the fly through)   // (a fluid picked in the legend is let go: the tap works as on the plain drawing)
      if (r[6] === "line" && /-PID-/.test(cur.number || "")){ const me = cur, gi = V.refs.indexOf(r);
        if (TR && TR.k === gi && TR.n === cur.number){ trOpen(); return; }
        linesFor(cur.number).then(D => { if (cur !== me) return; if (D[gi]) trace(gi, null, bx); else cur.onRef(r[5], "tag", r[7], bx || null); }); return; }
      // (on a single line diagram the same for a motor, heater or feeder: its supply traced, tools/build_sld_paths.py)
      if ((r[6] === "mel" || r[6] === "elec") && /-SLD-/.test(cur.number || "")){ const me = cur, gi = V.refs.indexOf(r);
        if (TR && TR.k === gi && TR.n === cur.number){ trOpen(); return; }
        linesFor(cur.number).then(D => { if (cur !== me) return; if (D[gi]) trace(gi, null, bx); else cur.onRef(r[5], "tag", r[7], bx || null); }); return; }
      // (a continuation: zoomed in, the next sheet opens zoomed onto the way back and the line flown on; at the whole
      // sheet it opens whole too, for hopping sheet to sheet)
      if (r[6] === "d"){ if (TR || V.zoom > 1.001) trPend = { at: Date.now(), label: TR && TR.label, dir: 1, from: cur.number }; else V.goExt = Date.now(); }
      if (r[6] === "q") pick(r[5].split("|"), e.clientX, e.clientY); else cur.onRef(r[5], r[6] === "d" ? "dwg" : r[6] === "s" ? "sp" : "tag", r[7], bx || null);
    });
    tb.querySelector(".sp-trx").onclick = () => trEnd("x");
    const zs = tz.querySelector(".sp-trz"), zSave = () => { try { localStorage.setItem("kcgm_trz", zs.value); } catch (x) {} trView(); };
    zs.oninput = zSave; tz.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { zs.value = Math.max(0, Math.min(100, +zs.value + +b.dataset.z)); zSave(); });
    // (desktop: the zoom as a slider across the panel's top row, the same setting)
    const z2 = tb.querySelector(".sp-trz2"); z2.oninput = () => { zs.value = z2.value; zSave(); };
    tb.querySelectorAll("[data-zh]").forEach(b => b.onclick = () => { zs.value = Math.max(0, Math.min(100, +zs.value + +b.dataset.zh)); zSave(); });
    tb.querySelector(".sp-tro").onclick = () => trOpen();
    tb.querySelectorAll(".sp-trnx").forEach(x => x.onclick = e => { const b = e.target.closest("button"); if (b) trGo(TR && TR.nb[+b.dataset.i]); });
    tb.querySelector(".sp-tra").oninput = () => trView();
    return V;
  }

  // Let the phone turn with the viewer open, whatever the installed app was set to (older installs are locked to
  // portrait until the phone refreshes the app's settings). "any" follows the phone's sensor; closing puts it back.
  let freed = false;
  function freeRotate(){ const so = screen.orientation; if (!so || !so.lock || freed) return; so.lock("any").then(() => freed = true).catch(() => {}); }
  // Desktop: no full screen. The viewer docks on the right of the page under the two top bars (on Assets exactly where
  // the drawing beside an asset sits), with a divider on its left edge to drag; the width is remembered.
  const desk = () => !document.documentElement.classList.contains("phone");
  function dock(){
    const on = desk(); V.el.classList.toggle("sp-dock", on);
    if (!on){   // phone: under the app's two top rows (logo row, search row), down to the bottom; the ✕ sits where the camera was
      const sr = document.querySelector(".ph-sr"), tp = document.querySelector(".ph-top"), r = (sr && sr.offsetHeight ? sr : tp);
      const top = r ? Math.round(r.getBoundingClientRect().bottom) : 0; V.el.classList.toggle("sp-phdock", top > 0); V.el.style.setProperty("--sp-top", top + "px");
      const slot = document.querySelector(".ph-sr .ph-slot"); if (slot && !slot.querySelector(".ph-spx")){ const x = document.createElement("button"); x.type = "button"; x.className = "ph-spx"; x.setAttribute("aria-label", "Close the drawing"); x.textContent = "✕"; x.onclick = () => close(); slot.appendChild(x); }
      document.documentElement.classList.add("sp-open"); return; }
    const tb = document.querySelector(".tb"), top = tb ? Math.round(tb.getBoundingClientRect().bottom) : 0;
    const sp = document.getElementById("split"), sr = sp && sp.offsetParent ? sp.getBoundingClientRect() : null;
    let left = sr ? Math.round(sr.right) : innerWidth - (+localStorage.getItem("kcgm_spw") || Math.round(innerWidth * .58));
    left = Math.max(260, Math.min(innerWidth - 360, left));
    V.el.style.setProperty("--sp-top", top + "px"); V.el.style.setProperty("--sp-left", left + "px");
    if (!V.el.querySelector(".sp-dsplit")){ const h = document.createElement("div"); h.className = "sp-dsplit"; h.title = "Drag to resize"; V.el.appendChild(h);
      let x0 = null; h.onpointerdown = e => { x0 = e.clientX; h.setPointerCapture(e.pointerId); document.body.classList.add("splitting"); };
      h.onpointermove = e => { if (x0 == null) return; const l = Math.max(260, Math.min(innerWidth - 360, e.clientX)); V.el.style.setProperty("--sp-left", l + "px"); };
      h.onpointerup = h.onpointercancel = () => { if (x0 == null) return; x0 = null; document.body.classList.remove("splitting");
        try { localStorage.setItem("kcgm_spw", innerWidth - parseInt(V.el.style.getPropertyValue("--sp-left"))); } catch (e) {} V.size && V.size(); layout(false); }; }
  }
  addEventListener("resize", () => { if (V && !V.el.hidden && desk()) dock(); });
  async function open(o){
    ui(); freeRotate(); const wasOpen = !V.el.hidden; lastNum = wasOpen && cur && cur.number !== o.number ? cur.number : wasOpen ? lastNum : null;
    if (TR) trEnd(); cur = Object.assign({ page: 1, fit: "width" }, o);
    if (V.goExt && Date.now() - V.goExt < 4000) cur.extent = true; V.goExt = 0;
    V.el.hidden = false; document.body.classList.add("sp-on"); dock();
    { const cb = V.el.querySelector(".sp-lg"), c = cur.corner; cb.hidden = !c; if (c){ cb.innerHTML = c.html; cb.title = c.title || ""; cb.style.top = (V.body.offsetTop + 10) + "px"; } }
    V.lc.hidden = true; V.lc.style.top = (V.body.offsetTop + 10) + "px";
    // (phone: the find / zoom extents row, top centre, level with Lines and the legend; the last drawing's lines gone at once)
    if (!desk()) V.el.style.setProperty("--sp-tbar", (V.body.offsetTop + 10) + "px"); V.lp.hidden = true; V.fl.innerHTML = ""; V.flg.hidden = true; FL.cnt = {}; if (FL.pick) pickEnd();
    V.ftk.hidden = !/-PID-/.test(o.number || ""); V.ftk.querySelector('[data-f="c"]').checked = FL.c; V.ftk.querySelector('[data-f="w"]').checked = FL.w;
    V.el.querySelector(".sp-tt").textContent = cur.title || "";
    // the drawing number, snug in the page's top left corner (moves with the page; the phone's title chip then leaves it out)
    // (in the sheet's bottom right corner, the drawing's short title under it: cur.sub)
    // (cur.nodn: a cleared title block has the number and title printed in its corner box, so no label of the app's own)
    V.el.querySelector(".sp-dn").innerHTML = !cur.nodn && (cur.label || cur.number) ? esc(cur.label || cur.number) + (cur.sub ? `<small>${esc(cur.sub)}</small>` : "") : "";
    if (cur.number && document.documentElement.classList.contains("phone")) V.el.querySelector(".sp-tt").textContent = (cur.title || "").replace(cur.label || cur.number, "").replace(/^\s*·\s*/, "").trim() || cur.number;
    const dl = V.el.querySelector(".sp-dl"); dl.href = cur.url; dl.download = cur.download || cur.url.split("/").pop();
    // a new view entry, unless this open is a step back / forward through the history
    if (!o._pop){ const was = curId && REG.get(curId), st0 = state(); if (was && st0 && wasOpen) was.snap = st0; push({ o, snap: null }); }
    // refs: the references printed on the sheet ([page, left, top, width, height, target, kind] in 1/10000 of the sheet,
    // a promise), each a tappable box; onRef(target, kind) acts on a tap.
    V.sheet.classList.add("sp-wait"); V.refs = []; V.refsEl.innerHTML = ""; V.trl.innerHTML = ""; pickClose(); V.tap = o._pop && o._tap || null; V.tapEl.innerHTML = "";
    V.fit = false; V.fq = ""; V.fset = new Set(); V.fmatch = []; V.fstep = -2;
    // (the boxes are laid out once this document's page is in: until then V.pg is the last one's, or none)
    const me = cur; if (cur.refs) Promise.resolve(cur.refs).then(a => new Promise(ok => V.pgFor === me ? ok(a) : (V.afterPage = () => ok(a)))).then(a => { if (cur !== me) return; V.refs = a || [];
      V.fit = V.refs.some(r => typeof r[7] === "string");
      // opened for an item (cur.find): on a checked sheet that item's labels stay red with the arrow, the rest grey
      if (V.fit && cur.find){ V.marks.innerHTML = ""; V.hits = []; fitFilter(cur.find, true); const m = V.fmatch.find(r => r[0] === V.page) || V.fmatch[0];
        if (m && !o._pop && cur.back == null){ const [l, t, w, h] = boxOf(m); V.tap = { page: m[0], l: l / 1e4, t: t / 1e4, w: w / 1e4, h: h / 1e4 }; drawTap();
          if (!cur.restore && !cur.extent) requestAnimationFrame(() => focusHits(V.fmatch.filter(r => r[0] === V.page).map(r => { const [a, b2, c, d] = boxOf(r); return { l: a / 1e4, t: b2 / 1e4, w: c / 1e4, h: d / 1e4 }; }))); } }
      else drawRefs(); });
    V.marks.innerHTML = ""; V.hits = []; V.el.querySelector(".sp-finds").hidden = true;
    V.el.querySelector(".sp-q").value = cur.find || "";
    V.msg.textContent = "Loading…"; V.msg.hidden = false;
    // the sheet's picture straight away, sized to the window, while the PDF itself loads behind it
    picsP.then(() => { if (cur !== me || V.pgFor === me) return; const pn = cur.page || 1, key = cur.url.replace(/^\.\//, "").split("?")[0];
      if (!(PICS && PICS[key] >= pn)) return; const im = new Image(); im.decoding = "async";
      im.onload = () => { if (cur !== me || V.pgFor === me) return; const cs = getComputedStyle(V.body), W = V.body.clientWidth - 16, H = V.body.clientHeight - 16 - Math.max(0, (parseFloat(cs.paddingTop) || 0) - 8);
        const k = cur.fit === "page" ? Math.min(W / im.width, H / im.height) : W / im.width; V.sheet.style.width = Math.round(im.width * k) + "px"; V.sheet.style.height = Math.round(im.height * k) + "px";
        V.bg.width = im.width; V.bg.height = im.height; V.bg.getContext("2d").drawImage(im, 0, 0); V.hi.style.visibility = "hidden"; V.msg.hidden = true; V.ox = V.oy = 0; slide(); cxFit(); V.sheet.style.opacity = ""; swEnter(); };
      im.src = `${cur.url.split("?")[0]}.p${pn}.png`; });
    let d; try { d = await getDoc(cur.url); } catch (e) { V.msg.textContent = "Couldn't load the PDF (" + e.message + "). Check the connection."; return; }
    V.msg.hidden = true; V.el.querySelector(".sp-pages").hidden = d.numPages < 2;
    V.zoom = 1; await go(cur.page);
    const r = cur.restore; if (r && cur === me){ quiet(); V.zoom = r.zoom; layout(false); V.body.scrollLeft = r.sl; V.body.scrollTop = r.st; sharp(); }
    if (cur === me && REG.get(curId) && !REG.get(curId).snap){ REG.get(curId).snap = state(); REG.get(curId).at = REG.get(curId).snap; }
    if (!o._pop && cur.back != null) arrive(me);
    if (!o._pop && trPend) trArrive(me, cur.back); else trPend = null;
    if (o._pop || o.restore) trResume(me);   // (back to a drawing left for a traced line's page: the trace as it was)
  }
  // arrived through a continuation: the red arrow on the ribbon pointing back to the drawing you came from (cur.back,
  // indexes into this drawing's refs; several when the sheets can't tell them apart), on its page and in view
  async function arrive(me){
    const all = await Promise.resolve(me.refs); if (cur !== me || !all) return;
    const rs = [].concat(me.back).map(j => all[j]).filter(r => r && r[0] === (all[[].concat(me.back)[0]] || [])[0]); if (!rs.length) return;
    if (V.page !== rs[0][0]) await go(rs[0][0], true);
    if (cur !== me) return; V.refs = all; drawRefs();
    const bs = rs.map(r => V.boxes[V.pageRefs.indexOf(r)]).filter(Boolean).map(b => ({ page: V.page, l: b[0] / 1e4, t: b[1] / 1e4, w: b[2] / 1e4, h: b[3] / 1e4 }));
    if (!bs.length) return;
    V.tap = Object.assign({}, bs[0], { more: bs.slice(1) }); drawTap();
    quiet(); if (!me.extent) focusHits(bs, true);   // zoomed onto the ribbon(s) back to where you came from: all in view, never closer than 4x
    else { V.hiB = { n: me.number, b: [].concat(me.back).filter(j => typeof j === "number") }; drawFl(); }   // (at the whole sheet: the line come in on shown, the rest faint)
    const v = REG.get(curId); if (v){ v.tap = V.tap; v.snap = state(); v.at = v.snap; }
  }
  // the place tapped or found: a highlighted box on it (no arrow), grown a little round the tag like the search boxes
  function arrowAt(h, cls){ const vp = V.pg.getViewport({ rotation: V.rot || 0, scale: 1 }), [l, t, w, hh] = PdfView.grow(h.l * 1e4, h.t * 1e4, h.w * 1e4, h.h * 1e4, vp.width / vp.height);
    return `<i class="sp-hb sp-hbon ${cls || ""}" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${hh / 100}%"></i>`; }
  // (two boxes are the same place when they overlap by half the smaller or more: a neighbour touching an edge is not)
  const same = (h, l, t, w, hh) => { const ox = Math.min(h.l + h.w, l + w) - Math.max(h.l, l), oy = Math.min(h.t + h.h, t + hh) - Math.max(h.t, t); return ox > 0 && oy > 0 && ox * oy >= .5 * Math.min(h.w * h.h, w * hh); };
  function drawTap(){ if (!V.tapEl) return; const on = V.tap && V.pg && V.tap.page === V.page ? [V.tap, ...(V.tap.more || [])] : [];
    // a place that has its own tag box (a checked sheet) is already shown by that box turning blue: no second box on it
    const own = h => V.refs.some(r => { if (r[0] !== V.page) return false; const [l, t, w, hh] = boxOf(r).map(x => x / 1e4);
      return same(h, l, t, w, hh); });
    V.tapEl.innerHTML = on.filter(h => !own(h)).map(h => arrowAt(h, "on")).join("");
    // (and those own boxes are marked instead, ribbon shaped where the ribbon is known)
    if (V.refsEl && V.boxes) [...V.refsEl.children].forEach((a, i) => { const b = V.boxes[i]; if (!b) return; const [l, t, w, hh] = b.map(x => x / 1e4);
      a.classList.toggle("tp", on.some(h => same(h, l, t, w, hh))); });
 }
  var fdPop = false;
  // ---------- line trace (phone) ----------
  // A tapped line number traces its line (lines/<number>.json, tools/build_line_paths.py), in the app's theme colour. A panel comes up under the sheet with the line slider, which runs the view along the line from one end
  // to the other (a dot where you are, a stronger trail left behind like a pen's), the milestones along it (tees, valves,
  // equipment, ribbons) and Go to asset; the zoom (remembered) is an upright slider on the right. Tapping the line or its
  // number again also opens the line's page. A ribbon tapped takes the
  // trace on to the next sheet: the line that ribbon carries on lights up, the slider at the ribbon's end.
  const LN = {}; let TR = null, trPend = null;
  const LNR = {}, linesFor = n => LN[n] || (LN[n] = fetch("lines/" + n + ".json").then(r => r.ok ? r.json() : {}).then(d => LNR[n] = d).catch(() => { delete LN[n]; return {}; }));
  // a process pipe with no line number ("u<n>", tools/link_pipes.py: 1200-MECH-CERAMIC from a hopper to its pump) stands
  // in for a line: a ref made from its label and where that sits ([page, x, y, w, h, label, "line", , "u"])
  const isU = k => /^u\d+$/.test(k);
  const refK = (k, D) => { if (isU(k)){ D = D || (cur && LNR[cur.number]) || {}; const b = D.ub && D.ub[k]; return b ? [b[0], b[1], b[2], b[3], b[4], D.lb[k], "line", null, D.uk && D.uk[k] ? "uk" : "u"] : null; } return V.refs[+k]; };   // ("uk": a line number in the line list, its page can open)
  // the traced line under a tap on the sheet (within 10 px of its path), and the spot on the sheet tapped
  function lineAt(x, y){ const D = cur && LNR[cur.number]; if (!D || !V.refs || !V.refs.length) return null; const q = V.sheet.getBoundingClientRect(); if (!q.width) return null;
    let best = null;
    for (const k of Object.keys(D)){ if (!/^\d+$/.test(k) && !isU(k)) continue; const r = refK(k, D); if (!r || r[0] !== V.page) continue;
      const P = D[k].map(p => { const [a, b] = trPt(p[0], p[1]); return [q.left + a / 1e4 * q.width, q.top + b / 1e4 * q.height]; });
      for (let i = 1; i < P.length; i++){ const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = x1 - x0, dy = y1 - y0, ll = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / ll)), d = Math.hypot(x0 + t * dx - x, y0 + t * dy - y);
        if (d < 10 && (!best || d < best.d)) best = { k: isU(k) ? k : +k, d }; } }
    return best && Object.assign(best, { at: V.rot ? null : [(x - q.left) / q.width * 1e4, (y - q.top) / q.height * 1e4] }); }
  const trZ = () => { let v = 55; try { const x = localStorage.getItem("kcgm_trz"); if (x != null) v = +x; } catch (e) {} return v; };
  const zOf = v => Math.pow(10, v / 100);   // (slider 0 to 100: the whole sheet to ten times)
  const trPt = (x, y) => V.rot ? [1e4 - y, x] : [x, y];
  const trF = () => V.tb.querySelector(".sp-tra").value / 1000;
  function trace(k, end, box, as){
    Promise.resolve(LN[cur.number]).then(D => {
      const P = D && D[k]; if (!P || P.length < 2) return; const vp = V.pg.getViewport({ scale: 1 }), A = vp.width / vp.height;
      // (an unnumbered continuation, "r<ribbon>": traced under the number it came with, as if that were printed on its ribbon)
      const r = /^r\d+$/.test(k) ? (q => [q[0], q[1], q[2], q[3], q[4], as || "", "line"])(V.refs[+k.slice(1)]) : refK(k, D);
      const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot((P[i][0] - P[i - 1][0]) * A, P[i][1] - P[i - 1][1]));
      TR = { t0: Date.now(), D, n: cur.number, k, P, L, page: r[0], label: (D.lb && D.lb[k]) || String(r[5]).split("|")[0], r, box, m: (D.m && D.m[k]) || [], fl: !!(D.fl && D.fl[k]) };
      TR.tn = new Map(TR.m.filter(m => m[1] === "t").sort((a, b) => a[0] - b[0]).map((m, n) => [m, n + 1]));   // (tees numbered from upstream: T1, T2 …)
      { const ab = V.tb.querySelector(".sp-tro"); if (ab) ab.hidden = r[8] === "u"; }   // (no page to open)
      // the slider runs from the line's upstream end (0, where the flow arrows show it, tools/build_line_paths.py); it
      // starts there, or at the end by the ribbon arrived through
      let f = 0;
      if (end){ let best = 1e18;   // (the point of the line nearest: one end, or where it was joined part way along)
        for (let i = 1; i < P.length; i++){ const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = (x1 - x0) * A, dy = y1 - y0, ll = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((end[0] - x0) * A * dx + (end[1] - y0) * dy) / ll)), e = ((x0 + t * (x1 - x0) - end[0]) * A) ** 2 + (y0 + t * (y1 - y0) - end[1]) ** 2;
          if (e < best){ best = e; f = (L[i - 1] + t * (L[i] - L[i - 1])) / (L[L.length - 1] || 1); } } }
      TR.f0 = 0;
      const tb = V.tb; tb.querySelector(".sp-trn").textContent = TR.label; tb.querySelectorAll(".sp-trln span").forEach(e => e.textContent = TR.label); V.tz.querySelector(".sp-trz").value = trZ(); tb.querySelector(".sp-tra").value = Math.round(f * 1000);
      // (the panel kept above the phone's gesture strip, the swipe along the bottom that switches apps: 64 of the screen's
      // own points up, however large the app's text size makes a CSS pixel; 40 px at the default size)
      { const z = Math.min(screen.width, screen.height) / Math.min(innerWidth, innerHeight) || 1.6; tb.style.setProperty("--gb", Math.max(40, Math.round(64 / z)) + "px"); }
      trNx();
      drawFl(); tb.classList.toggle("dk", desk()); tb.hidden = false; V.tz.hidden = desk(); trWheelOn(); V.el.classList.add("tracing"); cxFit(); trMarks(); trView();
      // (one browser history step for the trace, after the zoom's own: the phone's back swipe leaves the trace, the drawing
      // staying as it is)
      setTimeout(() => { if (TR && history.state && history.state.sp && !history.state.tr) history.pushState(Object.assign({}, history.state, { tr: 1 }), ""); }, 0);
    });
  }
  // the milestones along the Line slider: a tick across the track for everything the line passes, named under it where
  // there is room (two rows); what is at each end named under the ends
  const TK = { t: "tee", v: "valve", p: "special item", i: "instrument", e: "equipment", r: "continues", l: "next line", s: "end",
    b: "board", x: "transformer", d: "device", a: "rating", f: "feeder" };   // (b to f: the single line diagrams)
  const short = t => String(t || "").replace(/^\d+-(?=\d{4}-)/, "");
  // milestone names kept short (a long line has many): a tee by the sequence number of the line leaving it, a valve or instrument by its number, equipment without
  // its area (PW-417), a ribbon by the sheet it goes to (F75-10002), the next line by the spec change (PE8|SS1)
  function trName(m){ const t = String(m[2] || "").replace(/\s+/g, "");
    if (m[1] === "t") return (String(m[2] || "").split("-")[1]) || "T" + (TR.tn.get(m) || "");   // (the branch line's sequence number, 0967; T1, T2 … where it isn't known)
    if (m[1] === "r") return t.replace(/^2000-/, "").replace(/-PID-PR-|-SLD-EL-/, "-");
    if (m[1] === "l"){ const sp = n => (String(n || "").split("-")[3] || "?"), me = sp(TR.label), nx = sp(t); return m[0] < .5 ? nx + "|" + me : me + "|" + nx; }
    if (m[1] === "s") return "end";
    if (m[1] === "p") return t.replace(/^SP-/, "");   // (a special item: SP-MC-002 shown as MC-002 under SP)
    return t.replace(/^F\d\d-(?=\d)/, "").replace(/^F\d\d-(?=[A-Z])/, ""); }
  // (each milestone a mark through the bar; its type stands upright above and its name below in the same column, each on
  // a 45° callout from the mark, read bottom to top: TEE / 0588, VALVE / 11318; callouts lean a little further where names would touch, and
  // where they are packed too tight only the mark shows)
  const ASK = ["v", "p", "i", "e", "b", "x", "d", "f"];   // (the marks naming an asset: a button on the strip that opens it)
  const TT = { t: "TEE", v: "VALVE", p: "SP", i: "INSTR", e: "EQUIP", r: "SHEET", l: "SPEC", s: "END", b: "BOARD", x: "TX", d: "DEVICE", a: "RATING", f: "FEEDER" };
  // desktop (wide): the names read across, "VALVE 11318", snug under the bar on rows of their own. Each goes where it costs
  // least: the row nearest the bar, its callout straight down from its mark; failing that a callout that dog-legs (down,
  // sideways in the gap under the bar, down again) to a place further along. Never a callout through a name, never a
  // name over a callout, never two callouts crossing; the most important names placed first
  function trMarksDesk(){ const c = V.tb.querySelector(".sp-trc"), W = c.offsetWidth || 400, sl = V.tb.querySelector(".sp-tra"), BB = Math.round(sl.offsetTop + sl.offsetHeight / 2 + 4) || 20,
      J = BB + 9, RH = 16, R0 = BB + 14, NR = 6, G = 6;
    const pr = m => ({ r: 0, l: 1, e: 2, b: 2, x: 3, t: 3, i: 4, f: 4, d: 5, p: 5, v: 5, a: 6, s: 6 })[m[1]] ?? 7, rows = [...Array(NR)].map(() => []), legs = [], put = [];
    const wid = m => (TT[m[1]] || "").length * 5.4 + trName(m).length * 6.9 + 8;
    const ok = (x, xv, r, a, b) => {
      if (a < 0 || b > W) return false;
      if (rows[r].some(q => q[0] < b + G && a < q[1] + G)) return false;                                  // (a name on its row)
      if (rows.slice(0, r).some(R => R.some(q => q[0] - 2 < xv && xv < q[1] + 2))) return false;          // (its callout through a name)
      if (legs.some(l => l.r > r && a - 2 < l.xv && l.xv < b + 2)) return false;                           // (it over a callout)
      const lo = Math.min(x, xv), hi = Math.max(x, xv);
      for (const l of legs){ const lo2 = Math.min(l.x, l.xv), hi2 = Math.max(l.x, l.xv);
        if (hi - lo > .5 && (lo - 2 < l.x && l.x < hi + 2 || lo - 2 < l.xv && l.xv < hi + 2)) return false;  // (its dog-leg across a callout)
        if (hi2 - lo2 > .5 && (lo2 - 2 < x && x < hi2 + 2 || lo2 - 2 < xv && xv < hi2 + 2)) return false; }   // (a callout across another's dog-leg)
      return true; };
    [...TR.m].sort((a, b) => pr(a) - pr(b) || a[0] - b[0]).forEach(m => { const x = m[0] * W, w = wid(m); let best = null;
      for (let d = 0; d <= 150; d += 6) for (const sg of d ? [1, -1] : [1]){ const xv = x + sg * d;
        for (let r = 0; r < NR; r++) for (const [a, b] of [[xv + 3, xv + 3 + w], [xv - 3 - w, xv - 3]]){
          const cost = r * 22 + d + (a < xv ? 4 : 0); if (best && cost >= best.cost) continue;
          if (ok(x, xv, r, a, b)) best = { cost, xv, r, a, b }; } }
      if (!best) return;
      rows[best.r].push([best.a, best.b]); legs.push({ x, xv: best.xv, r: best.r }); put.push([m, x, best.a, best.r, best.xv]); });
    const used = put.reduce((n, p) => Math.max(n, p[3] + 1), 0);
    V.tb.querySelector(".sp-trtk").style.paddingBottom = (used * RH + 16) + "px";
    c.innerHTML = TR.m.filter(m => m[0] > .005 && m[0] < .995).map(m => `<i class="k-${m[1]}" style="left:${(m[0] * 100).toFixed(1)}%;top:${BB + 1}px" title="${esc(TK[m[1]] + (m[2] ? " " + m[2] : ""))}"></i>`).join("")
      + `<svg class="sp-trco" width="${W}" height="${R0 + NR * RH}">${put.map(([m, x, a, r, xv]) => { const y = R0 + r * RH + 7, e = a > xv ? a - 1 : a + wid(m) + 1;
          return `<polyline points="${x.toFixed(1)},${BB + 6} ${x.toFixed(1)},${J} ${xv.toFixed(1)},${J} ${xv.toFixed(1)},${y} ${e.toFixed(1)},${y}"/>`; }).join("")}</svg>`
      + put.map(([m, x, a, r]) => `<b class="h k-${m[1]}" style="left:${a.toFixed(1)}px;top:${R0 + r * RH}px"><em>${TT[m[1]] || ""}</em> ${esc(trName(m))}</b>`).join(""); }
  function trMarks(){ if (desk()) return trMarksDesk(); V.tb.querySelector(".sp-trtk").style.paddingBottom = ""; const c = V.tb.querySelector(".sp-trc"), W = c.offsetWidth || 180, LW = 13, OT = 66, BT = OT + 9, BB = OT + 45, D0 = 8, DM = 22, placed = [];
    const pr = m => ({ r: 0, l: 1, e: 2, b: 2, x: 3, t: 3, i: 4, f: 4, d: 5, p: 5, v: 5, a: 6, s: 6 })[m[1]] ?? 7, named = [];
    // names kept in the same order as their marks (so no two callouts cross), each as near its mark as the ones beside it
    // allow: pushed right past the one before, then pulled back from the right edge; a name that can't get within reach
    // of its mark is left off, the least important first (ribbons, spec changes and equipment before tees, valves …)
    const lay = S => { const X = S.map(m => m[0] * W), P = X.map(x => Math.max(LW / 2, Math.min(W - LW / 2, x + (x + D0 + LW / 2 > W ? -D0 : D0))));
      for (let k = 1; k < P.length; k++) P[k] = Math.max(P[k], P[k - 1] + LW);
      for (let k = P.length - 1; k >= 0; k--) P[k] = Math.min(P[k], k < P.length - 1 ? P[k + 1] - LW : W - LW / 2);
      return P.every((q, k) => q >= LW / 2 - .01 && Math.abs(q - X[k]) <= DM) ? P : null; };
    let keep = [];
    [...TR.m].sort((a, b) => pr(a) - pr(b) || a[0] - b[0]).forEach(m => { const t = [...keep, m].sort((a, b) => a[0] - b[0]); if (lay(t)) keep = t; });
    const PL = lay(keep) || []; keep.forEach((m, k) => named.push([m, m[0] * W, PL[k]]));
    // (a callout: out from the mark at 45°, then straight to the row all the names share, so each type sits directly over
    // its name and the rows read straight across)
    const ln = (x, lx, y0, up) => { const d = Math.abs(lx - x), e = DM + 2; return `<polyline points="${x.toFixed(1)},${y0} ${lx.toFixed(1)},${(up ? y0 - d : y0 + d).toFixed(1)} ${lx.toFixed(1)},${(up ? y0 - e : y0 + e).toFixed(1)}"/>`; };
    c.innerHTML = TR.m.filter(m => m[0] > .005 && m[0] < .995).map(m => `<i class="k-${m[1]}" style="left:${(m[0] * 100).toFixed(1)}%" title="${esc(TK[m[1]] + (m[2] ? " " + m[2] : ""))}"></i>`).join("")
      + `<svg class="sp-trco" width="${W}" height="${BB + 40}">${named.map(([m, x, lx]) => ln(x, lx, BT, true) + ln(x, lx, BB, false)).join("")}</svg>`
      + named.map(([m, x, lx]) => `<b class="ty k-${m[1]}" style="left:${lx.toFixed(1)}px;bottom:calc(100% - ${BT - DM - 5}px)">${TT[m[1]] || ""}</b><b class="k-${m[1]}${m[1] === "t" && teeK(m) != null ? " go" : ASK.includes(m[1]) && m[2] ? " go as" : ""}" data-f="${m[0]}" data-t="${esc(m[2] || "")}" style="left:${lx.toFixed(1)}px;top:${BB + DM + 5}px">${esc(trName(m))}</b>`).join(""); }
  // the branch line at a tee (a tap on its name flies onto it): the traced line on this sheet with that number, nearest the tee
  function teeK(m){ const D = TR && TR.D; if (!D || !m[2]) return null; const at = trAt(m[0]); let best = null;
    for (const k of Object.keys(D)){ if (String(k) === String(TR.k) || !Array.isArray(D[k]) || !/^(\d+|u\d+|r\d+)$/.test(k)) continue; const r = refK(k, D), lab = /^\d+$/.test(k) ? (r && r[0] === TR.page ? String(r[5]).split("|")[0] : null) : D.lb && D.lb[k];
      if (lab !== m[2]) continue; const Q = D[k], d0 = Math.min(Math.hypot(Q[0][0] - at[0], Q[0][1] - at[1]), Math.hypot(Q[Q.length - 1][0] - at[0], Q[Q.length - 1][1] - at[1]));
      if (!best || d0 < best[1]) best = [/^\d+$/.test(k) ? +k : k, d0]; }
    return best && best[0]; }
  function trFill(){ const z2 = V.tb.querySelector(".sp-trz2"); z2.value = V.tz.querySelector(".sp-trz").value;
    [V.tb.querySelector(".sp-tra"), V.tz.querySelector(".sp-trz"), z2].forEach(i => i.parentNode.style.setProperty("--p", (i.value - i.min) / (i.max - i.min) * 100 + "%")); }
  function trAt(f){ const { P, L } = TR, s = f * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < s) i++;
    const t = L[i] > L[i - 1] ? (s - L[i - 1]) / (L[i] - L[i - 1]) : 0; return [P[i - 1][0] + t * (P[i][0] - P[i - 1][0]), P[i - 1][1] + t * (P[i][1] - P[i - 1][1]), i]; }
  // the part of the path between two fractions along it
  function trSub(a, b){ const [xa, ya, ia] = trAt(a), [xb, yb, ib] = trAt(b); return [[xa, ya], ...TR.P.slice(ia, ib), [xb, yb]]; }
  function trView(){ if (!TR) return; const tb = V.tb, f = trF();
    trFill();
    V.zoom = Math.max(1, Math.min(10, zOf(+V.tz.querySelector(".sp-trz").value))); V.ox = V.oy = 0; V.sheet.style.left = V.sheet.style.top = ""; layout(false);
    const [x, y] = trPt(...trAt(f)); centreOn(x / 1e4, y / 1e4); sharp(); drawTrace(); settleSoon(); }
  // the trail: the part of the line from its upstream end to where you are now, like a pen's, with dashes drifting down
  // (redrawn as the slider moves: the drift's delay set from the clock, so it carries on without a restart)
  // it the way the line flows; where you are, an arrow pointing downstream (where the drawing doesn't show the flow,
  // the way the line was traced). In the sheet's own points; the line widths are screen pixels, thicker close up
  function drawTrace(){ if (!V || !V.trl) return; flDim(); V.sheet.style.removeProperty("--trk"); const on = TR && cur && TR.n === cur.number && TR.page === V.page && V.pg;
    if (!on){ V.trl.innerHTML = ""; return; }
    const vp = V.pg.getViewport({ scale: 1, rotation: V.rot || 0 }), W = vp.width, H = vp.height, s = V.base * V.zoom, w = Math.max(4, Math.min(9, 3.2 * s)), tw = w * 1.35;
    const sc = q => { const [x, y] = trPt(q[0], q[1]); return [x / 1e4 * W, y / 1e4 * H]; };
    const pts = P => P.map(q => sc(q).map(v => v.toFixed(1)).join(",")).join(" ");
    const f = trF(), at = trAt(f), [dx, dy] = sc(at), i = at[2];
    V.trl.setAttribute("viewBox", `0 0 ${W} ${H}`); V.trl.style.setProperty("--trw", w + "px");
    { const c = /-MECH-/.test(TR.label) ? MECHC : FLC[fluid(TR.label)] || OTHC; if (c) V.trl.style.setProperty("--hl", c); else V.trl.style.removeProperty("--hl"); }   // (the line in its fluid's colour, whether or not all lines are coloured)
    const tr = f > 1e-4 ? pts(trSub(0, f)) : "";
    let mk;
    { const [ax, ay] = sc(TR.P[i - 1]), [bx, by] = sc(TR.P[i]), d = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / d, uy = (by - ay) / d;
      const L = 2.6 * tw / s, B = 1.1 * tw / s, tx = dx + ux * L * .6, ty = dy + uy * L * .6, bx0 = dx - ux * L * .4, by0 = dy - uy * L * .4;
      mk = `<polygon points="${[[tx, ty], [bx0 - uy * B, by0 + ux * B], [bx0 + uy * B, by0 - ux * B]].map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}"/>`; }
    // (39A: just after the line is first opened, two rings pulse out from the arrow, three times, so the eye finds it;
    // gone once the arrow is moved)
    if (TR.fs === undefined) TR.fs = f;
    { const el = (Date.now() - TR.t0) / 1000; if (el < 4.5 && Math.abs(f - TR.fs) < 1e-4){ const R = 3.2 * tw / s;
      mk = [0, .75].map(o => `<circle class="rg" cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${R.toFixed(1)}" style="animation-delay:${(o - el).toFixed(3)}s"/>`).join("") + mk; } }
    V.trl.innerHTML = (tr ? `<polyline class="tr" points="${tr}"/>` + (true ? `<polyline class="fw" points="${tr}" style="animation-delay:-${(performance.now() / 1000 % 1.1).toFixed(3)}s"/>` : "") : "") + mk; }
  // a tap on the traced line itself (within 12 px of it)
  function trNear(x, y){ if (!TR || TR.page !== V.page) return false; const q = V.sheet.getBoundingClientRect(); if (!q.width) return false;
    const P = TR.P.map(p => { const [a, b] = trPt(p[0], p[1]); return [q.left + a / 1e4 * q.width, q.top + b / 1e4 * q.height]; });
    for (let i = 1; i < P.length; i++){ const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = x1 - x0, dy = y1 - y0, ll = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / ll));
      if (Math.hypot(x0 + t * dx - x, y0 + t * dy - y) < 12) return true; } return false; }
  // (the trace kept when its line's page is opened, so Back to the drawing puts it back as it was: the line, where on it,
  // the zoom; in this tab's session storage too, should the page reload in between)
  const TRK = "kcgm_trres";
  function trOpen(){ if (!TR || !cur.onRef || TR.r[8] === "u") return;   // (an unnumbered pipe has no page of its own) const r = TR.r, b = TR.box, TR0 = TR;
    const keep = { n: TR.n, k: TR.k, f: trF(), as: typeof TR.k === "string" ? TR.label : null, box: b || null, at: Date.now() };
    try { sessionStorage.setItem(TRK, JSON.stringify(keep)); } catch (e) {}
    trEnd(); if (r[6] === "d"){ const lb = TR0.D.lb && TR0.D.lb[TR0.k]; if (lb) cur.onRef(lb, "tag", null, null); else cur.onRef(r[5], "dwg", r[7], null); return; }
    cur.onRef(r[5], "tag", r[7], b || null); }
  async function trResume(me){ let t = null; try { t = JSON.parse(sessionStorage.getItem(TRK) || "null"); } catch (e) {}
    if (!t || t.n !== me.number || Date.now() - t.at > 12 * 3600e3) return;
    try { sessionStorage.removeItem(TRK); } catch (e) {}
    const D = await linesFor(me.number); if (!D[t.k]) return;
    for (let n = 0; n < 60 && cur === me && !(V.pgFor === me && V.refs && V.refs.length); n++) await new Promise(ok => setTimeout(ok, 150));
    if (cur !== me) return;
    const rk = typeof t.k === "string" ? V.refs[+t.k.slice(1)] : V.refs[t.k]; if (!rk) return;
    if (V.page !== rk[0]){ await go(rk[0], true); if (cur !== me) return; }
    trace(t.k, null, t.box, t.as);
    // (then the slider back where it was, once the trace is up)
    for (let n = 0; n < 40 && cur === me && !(TR && TR.k === t.k); n++) await new Promise(ok => setTimeout(ok, 50));
    if (!TR || TR.k !== t.k) return; V.tb.querySelector(".sp-tra").value = Math.round(t.f * 1000); trView(); }
  let trPop = false;
  addEventListener("popstate", e => {
    if (trPop){ trPop = false; e.stopImmediatePropagation(); return; }   // (the step taken off by ✕)
    // (not the viewer's own steps as a trace is put back, Back to the drawing: the moment after it starts)
    if (TR && Date.now() - (TR.t0 || 0) > 1500 && !(history.state && history.state.tr)){ e.stopImmediatePropagation(); trEnd(true); } }, true);
  function trEnd(fromPop){ if (!TR && V.tb.hidden) return; TR = null;
    // (✕ takes the trace's history step off again; the other ways out, opening something, leave it as a plain step)
    if (history.state && history.state.tr){ if (fromPop === "x"){ trPop = true; history.back(); } else if (!fromPop){ const st = Object.assign({}, history.state); delete st.tr; history.replaceState(st, ""); } } V.tb.hidden = true; V.tz.hidden = true; V.el.classList.remove("tracing"); drawTrace(); drawFl(); cxFit(); }
  // desktop: the wheel runs the view along the line (down: downstream) and Ctrl + wheel zooms. Free-spinning wheels (MX
  // Master) and trackpads send a stream of small deltas: each counts in proportion, no steps, gathered and applied once a
  // frame, a wheel pixel moving the view one screen pixel along the pipe at the zoom shown
  let wAcc = 0, zAcc = 0, wRaf = 0;
  function trWheel(){ wRaf = 0; if (!TR){ wAcc = zAcc = 0; return; }
    if (zAcc){ const z = V.tz.querySelector(".sp-trz"); z.value = Math.max(0, Math.min(100, +z.value - zAcc * .05)); zAcc = 0; try { localStorage.setItem("kcgm_trz", z.value); } catch (e) {} }
    if (wAcc){ const a = V.tb.querySelector(".sp-tra"), H = V.pg.getViewport({ scale: 1 }).height, len = TR.L[TR.L.length - 1] * H / 1e4 || 1, s = V.base * V.zoom;
      a.value = Math.max(0, Math.min(1000, +a.value + wAcc / s / len * 1000)); wAcc = 0; }
    trView(); }
  // desktop keys while tracing: ← → a tenth of the line each press, held down a smooth run at a fifth of the line a second;
  // ↑ the line downstream, ↓ the line upstream (the first of two at a tee); Esc leaves the trace
  let kHold = null;
  function trKeysOn(){ if (V.trKeys) return; V.trKeys = true;
    addEventListener("keydown", e => { if (!TR || V.el.hidden || e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target; if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) && t.type !== "range" || t.isContentEditable)) return;
      const k = e.key, dir = k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0;
      if (dir){ e.preventDefault(); e.stopPropagation(); if (e.repeat || kHold) return; const a = V.tb.querySelector(".sp-tra");
        a.value = Math.max(0, Math.min(1000, +a.value + dir * 100)); trView();
        kHold = { dir, t0: performance.now() + 300, last: 0, raf: 0 };
        const run = now => { if (!kHold || !TR) return; if (now > kHold.t0){ const dt = kHold.last ? now - kHold.last : 0; kHold.last = now;
            if (dt){ a.value = Math.max(0, Math.min(1000, +a.value + kHold.dir * .2 * dt)); trView(); } }   // (20% a second: 0.2 of 1000 per ms)
          kHold.raf = requestAnimationFrame(run); };
        kHold.raf = requestAnimationFrame(run); return; }
      if (k === "ArrowUp" || k === "ArrowDown"){ e.preventDefault(); e.stopPropagation();
        const pick = k === "ArrowUp" ? TR.nbR : TR.nbL; if (pick && pick[0]) trGo(pick[0]); return; }
      if (k === "Escape"){ e.preventDefault(); e.stopPropagation(); trEnd("x"); } }, true);
    addEventListener("keyup", e => { if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && kHold){ cancelAnimationFrame(kHold.raf); kHold = null; } });
    addEventListener("blur", () => { if (kHold){ cancelAnimationFrame(kHold.raf); kHold = null; } }); }
  function trWheelOn(){ trKeysOn(); if (V.trWheel) return; V.trWheel = true;
    V.el.addEventListener("wheel", e => { if (!TR || !desk() || !e.target.closest(".sp-body, .sp-trb")) return; e.preventDefault(); e.stopPropagation();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1, d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * k;
      if (e.ctrlKey) zAcc += d; else wAcc -= d;   // (up: on downstream)
      if (!wRaf) wRaf = requestAnimationFrame(trWheel); }, { passive: false, capture: true }); }
  // the arrows at the ends of the line slider: the line(s) this one runs on into at that end, each with its sequence
  // number (two where it ends at a tee into two lines): on this sheet the traced lines whose end meets this one's end (a
  // spec change, a split) or whose run it joins part way along (a header), else the ribbon there, to the next sheet
  function trNbs(dir){ const D = TR.D, vp = V.pg.getViewport({ scale: 1 }), A = vp.width / vp.height;
    const e = dir > 0 ? TR.P[TR.P.length - 1] : TR.P[0], dist = (a, b) => Math.hypot((a[0] - b[0]) * A, a[1] - b[1]);
    const segd = (Q, q) => { let m = 1e18; for (let i = 1; i < Q.length; i++){ const [x0, y0] = Q[i - 1], [x1, y1] = Q[i], dx = (x1 - x0) * A, dy = y1 - y0, ll = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((q[0] - x0) * A * dx + (q[1] - y0) * dy) / ll)); m = Math.min(m, Math.hypot((x0 + t * (x1 - x0) - q[0]) * A, y0 + t * (y1 - y0) - q[1])); } return m; };
    const out = [], seq = k2 => isU(k2) && /-MECH-/.test(D.lb[k2]) ? String(D.lb[k2]).split("-").slice(0, 2).join("\n") : isU(k2) ? String(D.lb[k2]).split("-")[1] || "?" : String(V.refs[k2][5]).split("|")[0].split("-")[1] || "?";
    if (D.up || D.dn){ const j = (dir < 0 ? D.up : D.dn || {})[TR.k]; if (j == null || !V.refs[j]) return [];
      return [{ rb: j, d: 0, dir, seq: String(V.refs[j][5]).split("|")[0].replace(/^2000-/, "").replace(/-SLD-EL-/, "\n") }]; }
    Object.keys(D).forEach(k2 => { if ((!/^\d+$/.test(k2) && !isU(k2)) || k2 === String(TR.k) || !refK(k2, D) || refK(k2, D)[0] !== TR.page) return; const Q = D[k2]; const kk = isU(k2) ? k2 : +k2;
      const dE = Math.min(dist(Q[0], e), dist(Q[Q.length - 1], e));
      if (dE < 45) out.push({ k: kk, pt: dist(Q[0], e) < dist(Q[Q.length - 1], e) ? Q[0] : Q[Q.length - 1], d: dE, seq: seq(kk) });
      else { const dI = segd(Q, e); if (dI < 25) out.push({ k: kk, pt: e, d: dI + 1, seq: seq(kk) }); } });
    // (joined across a pump, a strainer, a gap: tools/link_lines.py)
    (D.lk || []).forEach(([k1, e1, k2, e2]) => { const me = dir > 0 ? 1 : 0;
      for (const [a, ea, b, eb] of [[k1, e1, k2, e2], [k2, e2, k1, e1]]) if (String(a) === String(TR.k) && ea === me && D[b] && refK(b, D) && !out.some(o => o.k === b)){ const Q = D[b];
        out.push({ k: b, pt: eb ? Q[Q.length - 1] : Q[0], d: 50, seq: seq(b) }); } });
    if (!out.length){ const em = TR.m.find(m => (dir > 0 ? m[0] >= .98 : m[0] <= .02) && (m[1] === "l" || m[1] === "t") && m[2]);
      if (em){ const k2 = V.refs.findIndex((r, i) => r[0] === TR.page && r[6] === "line" && String(r[5]).split("|")[0] === em[2] && D[i]); if (k2 >= 0) out.push({ k: k2, pt: e, d: 0, seq: seq(k2) }); } }
    if (!out.length) Object.keys(D.rb || {}).forEach(j => { if (String(D.rb[j]) !== String(TR.k) || !V.refs[+j]) return; const r = V.refs[+j], d = Math.hypot(Math.max(r[1] - e[0], 0, e[0] - r[1] - r[3]), Math.max(r[2] - e[1], 0, e[1] - r[2] - r[4]));
      if (d < 300) out.push({ rb: +j, d, dir, seq: String(r[5]).split("|")[0].replace(/^2000-/, "").replace(/-PID-PR-/, "-") }); });
    return out.sort((a, b) => a.d - b.d).filter((o, i, a) => a.findIndex(x => x.k === o.k && x.rb === o.rb) === i).slice(0, 2); }
  function trNx(){ TR.nb = []; [["l", -1], ["r", 1]].forEach(([side, dir]) => { const c = V.tb.querySelector(".sp-trnx." + side), L = trNbs(dir); TR[dir < 0 ? "nbL" : "nbR"] = L;
    c.classList.toggle("two", L.length > 1);
    c.innerHTML = L.map(o => { TR.nb.push(o); return `<button type="button" data-i="${TR.nb.length - 1}" class="${o.rb != null ? "sh" : ""}${/\n/.test(o.seq) ? " sl" : ""}" title="${dir < 0 ? "Upstream" : "Downstream"}: ${esc(o.rb != null ? "sheet " + o.seq : String(refK(o.k)[5]).split("|")[0])}">${esc(o.seq)}</button>`; }).join(""); }); }
  function trGo(nb){ if (!nb) return;
    if (nb.rb != null){ const r = V.refs[nb.rb]; trPend = { at: Date.now(), label: TR.label, dir: nb.dir || 1, from: cur.number }; cur.onRef && cur.onRef(r[5], "dwg", r[7], null); return; }
    const b = boxOf(refK(nb.k)), bx = { page: V.page, l: b[0] / 1e4, t: b[1] / 1e4, w: b[2] / 1e4, h: b[3] / 1e4 }; V.tap = bx; drawTap();
    trace(nb.k, nb.pt, [bx.l, bx.t, bx.w, bx.h]); }
  // arrived through a ribbon tapped on the phone: the line that ribbon carries on, traced from the ribbon's end
  // arrived through a ribbon (tapped, or the arrow at the end of the line slider) on the phone: the line carried on
  // traced on the new sheet: the one that ribbon leads to, else the line with the same number there; from the ribbon's
  // end, else from the end the way you were going (upstream end when going downstream, so 100% here is 0% there)
  async function trArrive(me, back){ const tp = trPend; if (!tp || Date.now() - tp.at > 15000) return; trPend = null;
    const D = await linesFor(me.number);
    for (let n = 0; n < 60 && cur === me && !(V.pgFor === me && V.refs && V.refs.length); n++) await new Promise(ok => setTimeout(ok, 150));
    if (cur !== me || !V.refs.length) return;
    let k = null, rbr = null; const bk = [].concat(back == null ? [] : back).filter(j => typeof j === "number");
    // (a single line diagram's ribbons carry no way back: the ones on this sheet naming the sheet just left)
    if (!bk.length && tp.from) V.refs.forEach((r, j) => { if (r[6] === "d" && String(r[5]).split("|").includes(tp.from)) bk.push(j); });
    const j = bk.find(j => D.rb && D.rb[j] != null); if (j != null && D[D.rb[j]]){ k = /^\d+$/.test(D.rb[j]) ? +D.rb[j] : D.rb[j]; rbr = V.refs[j]; }
    if (k == null && tp.label){ const C = V.refs.map((r, i) => i).filter(i => V.refs[i][6] === "line" && String(V.refs[i][5]).split("|")[0] === tp.label && D[i]);
      const at = bk.map(j => V.refs[j]).find(Boolean); rbr = at || null;
      const dd = i => { if (!at) return 0; const P = D[i]; return Math.min(...[P[0], P[P.length - 1]].map(q => Math.hypot(q[0] - at[1] - at[3] / 2, q[1] - at[2] - at[4] / 2))); };
      k = C.sort((a, b) => dd(a) - dd(b))[0]; if (k == null) return; }
    if (k == null) return;
    const rk = typeof k === "string" ? V.refs[+k.slice(1)] : V.refs[k];
    if (V.page !== rk[0]){ await go(rk[0], true); if (cur !== me) return; }
    const P = D[k], end = rbr && rbr[0] === rk[0] ? [rbr[1] + rbr[3] / 2, rbr[2] + rbr[4] / 2] : (tp.dir < 0 ? P[P.length - 1] : P[0]);
    const b = boxOf(rk); V.tap = Object.assign({}, V.tap && V.tap.page === V.page ? V.tap : {}, { more: [].concat((V.tap && V.tap.more) || [], [{ page: V.page, l: b[0] / 1e4, t: b[1] / 1e4, w: b[2] / 1e4, h: b[3] / 1e4 }]) }); drawTap();
    trace(k, end, [b[0] / 1e4, b[1] / 1e4, b[2] / 1e4, b[3] / 1e4], tp.label); }
  // ---------- view history ----------
  const REG = new Map(); let curId = 0, seq = 0, hush = 0, st8 = null;
  const quiet = () => { hush = Date.now() + 500; };   // (moves made by a restore are not new views)
  // visits: one per time the viewer comes up over the page (a browser history step each). The views of a visit are
  // stepped with the app's ← / →; before its first view, and after its last, come the page's own steps (searches,
  // filters, items), so drawings and pages make one timeline. VST[visit] is the page state the visit opened over.
  let visit = 0; const VST = {};
  // the drawing on screen, kept for this tab (sessionStorage): a reload (the app updating itself, or the phone dropping
  // the app in the background) opens it again where it was, over the page it was opened from (index.html, PdfView.saved)
  const SSK = "kcgm_spv";
  const keep = () => { try { if (!V || V.el.hidden || !cur || !cur.number){ sessionStorage.removeItem(SSK); return; } const me = REG.get(curId);
    sessionStorage.setItem(SSK, JSON.stringify({ id: history.state && history.state.sp ? history.state.id : curId, n: cur.number, snap: state() || (me && me.snap) || null, base: me ? VST[me.visit] || null : null })); } catch (e) {} };
  function push(v){
    const rv = v.o && v.o.revive;   // (reopened after a reload: this history step is the drawing's already)
    const nv = rv || !(history.state && history.state.sp && !V.el.hidden && REG.get(curId));
    if (nv){ visit++; VST[visit] = rv || history.state; }
    // a new step drops this visit's views ahead of it, as the browser does (other visits keep theirs: they are
    // still steps in the browser's history)
    const me = REG.get(curId); if (me && !nv) [...REG.keys()].forEach(k => { const x = REG.get(k); if (x.seq > me.seq && x.visit === me.visit) REG.delete(k); });
    const id = ++seq; v.seq = id; v.depth = 1; v.visit = nv ? visit : me ? me.visit : visit; REG.set(id, v); curId = id;
    // one browser history step for the whole visit: the phone's swipe back (or the browser's Back) leaves the viewer and
    // returns to the page as it was; drawings and views within the visit step back with the app's ← (PdfView.back)
    if (rv || (history.state && history.state.sp && !V.el.hidden)) history.replaceState(Object.assign({ sp: 1, id }, zIn && history.state.z ? { z: 1 } : {}), ""); else history.pushState({ sp: 1, id }, ""); if (rv) v.o.revive = null; fwdBtn(); keep();
  }
  const fwdBtn = () => { const me = REG.get(curId), b = V && V.el.querySelector(".sp-fwd"), no = !me || ![...REG.values()].some(v => v.seq > me.seq && v.visit === me.visit); if (b) b.disabled = no;
    if (V && !V.el.hidden){ const nf = no && !(window.navigation && navigation.canGoForward); document.querySelectorAll(".nv-fwd").forEach(x => x.disabled = nf); } };   // (past the visit's last view, → carries on through the browser's steps)   // (the app's → too, while a drawing is open)
  function settleSoon(){ if (!V || V.el.hidden) return; clearTimeout(st8); st8 = setTimeout(settle, 500); }
  function settle(){
    if (Date.now() < hush || !V || V.el.hidden || !V.pg) return;
    const me = REG.get(curId), s = state(); if (!me || !s) return;
    // compared with where this view started (small moves add up), not with the last small move
    if (!me.snap){ me.snap = s; me.at = s; return; } const o = me.at || me.snap;
    // (a step: any move past 2% of the screen's width, or a zoom past 2%; finger wobble below that is not)
    const big = s.page !== o.page || Math.abs(Math.log(s.zoom / o.zoom)) > Math.log(1.02) ||
      Math.abs(s.sl - o.sl) > V.body.clientWidth * .02 || Math.abs(s.st - o.st) > V.body.clientWidth * .02;
    if (big) push({ o: me.o, snap: s, at: s }); else me.snap = s;
    keep();
  }
  async function restore(id){
    const v = REG.get(id); if (!v) return; curId = id; fwdBtn(); quiet();
    if (V.el.hidden || !cur || cur.url !== v.o.url){ await open(Object.assign({}, v.o, { _pop: true, _tap: v.tap, restore: v.snap, page: v.snap ? v.snap.page : v.o.page })); drawTap(); return; }
    const s = v.snap; if (!s) return;
    if (s.page !== V.page) await go(s.page, true);
    quiet(); V.zoom = s.zoom; layout(false); V.body.scrollLeft = s.sl; V.body.scrollTop = s.st; sharp(); V.tap = v.tap || null; drawTap();
  }
  // where the reader is on the sheet, to come back to it (Back)
  const state = () => V && V.pg ? { page: V.page, zoom: V.zoom, sl: V.body.scrollLeft, st: V.body.scrollTop } : null;
  // a ribbon's outline as an svg filling its box: [, , , , shape, depth] with shape R / L (point right / left) and
  // l / r (a notched tail on that side), depth the point's length as a part of the width
  function ribbon(rb){ const k = rb[4] || "", d = Math.max(.02, Math.min(.4, +rb[5] || .08)) * 100, L = /L/.test(k), Rt = /R/.test(k), nl = /l/.test(k), nr = /r/.test(k);
    const pts = [[L ? d : 0, 0], [Rt ? 100 - d : 100, 0], ...(Rt ? [[100, 50]] : nr ? [[100 - d, 50]] : []), [Rt ? 100 - d : 100, 100], [L ? d : 0, 100], ...(L ? [[0, 50]] : nl ? [[d, 50]] : [])];
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="${pts.map(p => p.join(",")).join(" ")}" vector-effect="non-scaling-stroke"/></svg>`; }
  function drawRefs(){
    if (!V.pg) return;
    V.pageRefs = V.refs.filter(r => r[0] === V.page && r[6] !== "x");
    V.boxes = V.pageRefs.map(boxOf);
    // a checked sheet (tools/refs_cv.py): every label red, the ones a find leaves out grey; bubbles round
    V.refsEl.innerHTML = V.pageRefs.map((r, i) => { const [l, t, w, h] = V.boxes[i];
      const cls = V.fit ? " fit" + (shape(r) === "o" ? " o" : "") + (V.fq && !V.fset.has(r) ? " off" : "") : r[6] === "d" ? " d" : "";
      const rb = r[6] === "d" && Array.isArray(r[8]) && !V.rot;
      return `<a class="sp-ref${cls}${rb ? " rb" : ""}" data-i="${i}" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${h / 100}%" title="${esc(r[5].replace(/\|/g, ", "))}">${rb ? ribbon(r[8]) : ""}</a>`; }).join("");
    hideOwnHits(); drawTap(); drawTrace(); drawFl(); if (/-(PID|SLD)-/.test(cur.number || "")) linesFor(cur.number);   // (the paths ready for a tap on a pipe)
  }
  // how a ref was fitted to the print on a checked sheet: "o" bubble, "b" drawn box (both exact), "t" text (a margin added)
  const shape = r => typeof r[7] === "string" ? r[7] : V.fit && r[6] === "d" ? "t" : null;
  // a ref's box on the sheet as shown (turned with it), in 1/10000 of the sheet
  function boxOf(r){
    const vp = V.pg.getViewport({ scale: 1, rotation: V.rot || 0 }), A = vp.width / vp.height;
    const rb = r[6] === "d" && Array.isArray(r[8]);   // a continuation with its ribbon's outline (tools/refs_cv.py --ribbons): its box is the ribbon
    let [l, t, w, h] = rb ? r[8] : r.slice(1, 5); if (V.rot) [l, t, w, h] = [1e4 - t - h, l, h, w];   // sheet turned a quarter
    return rb || shape(r) === "o" || shape(r) === "b" ? [l, t, w, h] : PdfView.grow(l, t, w, h, A);
  }
  // ---------- find on a checked sheet ----------
  // Typing narrows the red to the labels whose tag or name holds what is typed (the rest go grey). The first Enter
  // shows the whole sheet with all of them; each Enter after jumps straight (no slide) to the next one at four times the
  // whole-sheet zoom with the arrow above it; Shift+Enter goes back. The find bar says how many, then which one.
  function fitFilter(q, exact){
    V.fq = String(q || "").trim(); V.fstep = -2; const w = V.fq.toLowerCase(), wn = norm(V.fq);
    V.sheet.classList.toggle("sp-finding", !!V.fq);   // (the labels a find keeps get the stronger blue)
    // literal: what is printed on the sheet, the tag's own text (no names or other details from the lists)
    const hit = r => r[6] !== "x" && r[5].split("|").some(t => exact ? norm(t) === wn : wn && norm(t).includes(wn));
    V.fmatch = V.fq ? V.refs.filter(hit).sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]) : [];
    V.fset = new Set(V.fmatch); drawRefs(); V.marks.innerHTML = ""; V.hits = []; V.tap = null; drawTap();
    const f = V.el.querySelector(".sp-finds"); f.hidden = !V.fq;
    V.el.querySelector(".sp-fn").textContent = !V.fq ? "" : V.fmatch.length ? `${V.fmatch.length} result${V.fmatch.length === 1 ? "" : "s"}` : "No matches";
  }
  async function fitStep(dir){
    if (!V.fmatch || !V.fmatch.length) return;
    if (V.fstep === -2){ V.fstep = -1; quiet(); if (V.page !== V.fmatch[0][0]) await go(V.fmatch[0][0]); V.zoom = 1; layout(false); V.body.scrollTo(0, 0); sharp(); V.tap = null; drawTap(); return; }
    const n = V.fmatch.length; V.fstep = V.fstep < 0 ? (dir > 0 ? 0 : n - 1) : (V.fstep + dir + n) % n; const r = V.fmatch[V.fstep];
    if (V.page !== r[0]) await go(r[0]);
    const [l, t, w, h] = boxOf(r); quiet(); V.zoom = hitZ(); layout(false);
    centreOn((l + w / 2) / 1e4, (t + h / 2) / 1e4); sharp();
    V.tap = { page: r[0], l: l / 1e4, t: t / 1e4, w: w / 1e4, h: h / 1e4 }; drawTap(); settleSoon();
    V.el.querySelector(".sp-fn").textContent = `${V.fstep + 1} of ${n}`;
  }
  // a bubble that stands for several tags (YI12000A and B): a small list to pick from
  function pickClose(){ const p = V && V.el.querySelector(".sp-pick"); if (p) p.remove(); }
  function pick(tags, x, y){
    pickClose(); const p = document.createElement("div"); p.className = "sp-pick";
    p.innerHTML = tags.map(t => `<button type="button">${esc(t)}</button>`).join("");
    V.el.appendChild(p); const r = V.el.getBoundingClientRect();
    p.style.left = Math.max(6, Math.min(r.width - p.offsetWidth - 6, x - r.left - p.offsetWidth / 2)) + "px";
    p.style.top = Math.max(50, Math.min(r.height - p.offsetHeight - 6, y - r.top + 14)) + "px";
    p.querySelectorAll("button").forEach((b, i) => b.onclick = () => { pickClose(); cur.onRef && cur.onRef(tags[i], "tag"); });
  }
  // Rotate: phones can only switch orientation by script in full screen. Landscape is forced (whatever the installed
  // app's own setting says); tapping again returns to portrait. Closing the viewer puts everything back.
  let rotated = false;
  async function rot(){
    const so = screen.orientation;
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      rotated = !rotated; await so.lock(rotated ? "landscape" : "any"); freed = !rotated;
    } catch (e){   // the phone won't turn the screen for us (iPhone, some Androids): turn the drawing instead
      rotated = false; V.rot = V.rot ? 0 : 90; V.zoom = 1; layout(true); textLayer(); V.body.scrollTo(0, 0);
      if (cur.find) mark(cur.find);
      if (V.rot) toast("Drawing turned: hold the phone sideways. Tap ⟲ again to turn it back.");
    }
  }
  async function unrot(){ if (V) V.rot = 0; if (freed){ freed = false; try { screen.orientation.unlock(); } catch (e) {} } if (!rotated) return; rotated = false; try { screen.orientation.unlock(); } catch (e) {} try { if (document.fullscreenElement && !matchMedia("(display-mode: fullscreen)").matches) await document.exitFullscreen(); } catch (e) {} }
  function close(fromPop, stepBack){ if (!V || V.el.hidden) return; unrot(); if (TR) trEnd(); V.el.hidden = true; V.cx.hidden = true; try { sessionStorage.removeItem(SSK); } catch (e) {} document.body.classList.remove("sp-on"); document.documentElement.classList.remove("sp-open"); clearTimeout(st8);
    if (!fromPop && history.state && history.state.sp){
      if (stepBack){ if (zIn && history.state.z){ zIn = false; history.go(-2); } else history.back(); }
      // (✕: the drawing stays a step in the history, Back from the page returns to it; the page as it was under the viewer is the new step)
      else { const me = REG.get(curId), pg = me && VST[me.visit]; zIn = false; if (me){ me.snap = state() || me.snap; }
        history.pushState(Object.assign({}, pg || {}, { d: ((pg && pg.d) || 0) + 1 }), ""); } }
    else if (!fromPop) zIn = false; }
  // out of the way for a tag tapped on the sheet, its history step kept: Back from the tag's item reopens this view
  const hide = () => close(true);
  // opened for a searched item: one place on this page, four times closer centred on it; several, zoomed to fit them all
  // (boxes in fractions of the sheet). Not when the drawing itself was what you searched (no find).
  // how close a find result is shown: four times the whole sheet, seven on a phone (narrower, so the tag reads)
  const hitZ = () => desk() ? 4 : 7;
  function focusHits(hs, ext){ if (!V || !hs || !hs.length) return; const r = V.body.getBoundingClientRect(), z0 = V.zoom, sw = V.sheet.offsetWidth / z0, sh = V.sheet.offsetHeight / z0;
    const l = Math.min(...hs.map(h => h.l)), t = Math.min(...hs.map(h => h.t)), rr = Math.max(...hs.map(h => h.l + h.w)), b = Math.max(...hs.map(h => h.t + h.h));
    const z = hs.length === 1 && !ext ? hitZ() : Math.max(1, Math.min(ext ? 2 : hitZ(), .8 * Math.min(r.width / ((rr - l) * sw || 1), r.height / ((b - t) * sh || 1))));
    zoomTo(z, r.left + r.width / 2, r.top + r.height / 2, (l + rr) / 2, (t + b) / 2); }
  // the app's ← and →: one view back or forward (a small pan or zoom is a step, as undo / redo in CAD), across
  // drawings too; ← from the first view of the visit closes the viewer, back to the page it was opened from
  function stepTo(prev){ const id = [...REG.entries()].find(([k, v]) => v === prev)[0];
    restore(id).then(() => history.replaceState(Object.assign({}, history.state, { sp: 1, id }), "")); }
  function back(){ if (!V || V.el.hidden) return false; const me = REG.get(curId); if (!me) { close(); return true; }
    const s0 = state(); if (s0) me.snap = s0;   // (where you are now, for → to come back to)
    const prev = [...REG.values()].filter(v => v.seq < me.seq && v.visit === me.visit).sort((a, b) => b.seq - a.seq)[0];
    if (!prev){ close(false, true); return true; } stepTo(prev); return true; }   // (before the visit's first view: the page it opened over)
  function fwd(){ if (!V || V.el.hidden) return false; const me = REG.get(curId); if (!me) return false;
    const next = [...REG.values()].filter(v => v.seq > me.seq && v.visit === me.visit).sort((a, b) => a.seq - b.seq)[0];
    if (!next) return false; stepTo(next); return true; }   // (past the visit's last view: the browser's forward, the page after it)
  const canFwd = () => { const me = V && !V.el.hidden && REG.get(curId); return !!me && [...REG.values()].some(v => v.seq > me.seq && v.visit === me.visit) || !!(window.navigation && navigation.canGoForward); };
  async function go(n, fromPop){
    const d = await getDoc(cur.url); n = Math.max(1, Math.min(d.numPages, n));
    if (!fromPop && V.pg && n !== V.page){ const me = REG.get(curId); if (me) me.snap = state(); quiet(); V.page = n; push({ o: me ? me.o : cur, snap: null }); }
    V.page = n; if (TR && TR.page !== n) trEnd();
    V.el.querySelector(".sp-pg").textContent = `${n} / ${d.numPages}`;
    await picsP; V.pg = await d.getPage(n); V.pgFor = cur; V.body.scrollTo(0, 0); V.size(); layout(true); V.sheet.style.opacity = ""; swEnter();
    (window.requestIdleCallback || setTimeout)(() => textLayer(), { timeout: 1200 });   // (the selectable text after the picture is up)
    if (V.afterPage){ const f = V.afterPage; V.afterPage = null; f(); }
    if (cur.find){ const me2 = cur; Promise.resolve(mark(cur.find)).then(() => { if (cur === me2 && !V.fit && !cur.restore && !cur.extent && !fromPop && V.hits && V.hits.length) focusHits(V.hits); }); } drawTap();
    const me = REG.get(curId); if (me && !me.snap && !fromPop){ me.snap = state(); me.at = me.snap; }
  }
  // the page's text as an invisible, selectable layer over the picture (PDF.js text layer; OCR'd sheets included),
  // laid out once per page at scale 1 and sized by --scale-factor at every zoom
  let tlGen = 0;
  async function textLayer(){
    const g = ++tlGen, el = V.textEl; el.innerHTML = ""; if (!V.pg || !window.pdfjsLib || !pdfjsLib.renderTextLayer) return;
    try { const tc = await V.pg.getTextContent(); if (g !== tlGen) return;
      await pdfjsLib.renderTextLayer({ textContentSource: tc, container: el, viewport: V.pg.getViewport({ scale: 1, rotation: V.rot || 0 }), textDivs: [] }).promise;
    } catch (e) {}
  }
  // zoom 1 fits the page width (spec) or the whole sheet (drawings)
  function layout(bg){
    if (!V.pg) return;
    const vp1 = V.pg.getViewport({ rotation: V.rot || 0, scale: 1 }), cs = getComputedStyle(V.body), W = V.body.clientWidth - 16, H = V.body.clientHeight - 16 - Math.max(0, (parseFloat(cs.paddingTop) || 0) - 8);
    V.base = Math.max(.05, cur.fit === "page" ? Math.min(W / vp1.width, H / vp1.height) : W / vp1.width); const s = V.base * V.zoom;
    const w = Math.round(vp1.width * s) + "px", h = Math.round(vp1.height * s) + "px";
    // the sharp layer no longer matches a new size: hide it (the background layer stretches) until its redraw is ready
    V.textEl.style.setProperty("--scale-factor", s);
    V.sheet.style.setProperty("--flw", Math.max(2.2, Math.min(8, 6 * s)).toFixed(2) + "px");
    V.sheet.style.setProperty("--rbw", Math.max(1, Math.min(2.5, vp1.width * s * .0006)).toFixed(2) + "px");   // the red outline thins as the sheet shrinks
    // (the drawing number printed on the sheet never runs wider than the sheet: past its edge it gave the window room to scroll sideways into nothing)
    V.sheet.style.setProperty("--dnf", (vp1.width * s / Math.max(8, String(cur.label || cur.number || "").length * .68)).toFixed(1) + "px");
    if (V.sheet.style.width !== w || V.sheet.style.height !== h || bg){ hideHi(); V.sheet.style.width = w; V.sheet.style.height = h; }
    slide(); if (bg){ V.sheet.classList.add("sp-wait"); drawBg(); drawRefs(); } sharp();   // (a new page's boxes wait for its picture)
    cxFit(); zoomStep();
  }
  // zoomed in: one more browser history step, so a swipe back goes to the whole sheet first (popstate above); back at
  // the whole sheet another way (zoom extents, double tap), that step is taken off again
  let zIn = false, zIgnore = false;
  function zoomStep(){
    if (!V || V.el.hidden || !history.state || !history.state.sp) return;
    if (Date.now() < hush && V.zoom > 1.001) return;   // (a view put back by ← / → or Back is not a new zoom: no step, or the steps ahead would be lost)
    if (V.zoom > 1.001 && !zIn){ zIn = true; history.pushState(Object.assign({}, history.state, { z: 1 }), ""); }
    else if (V.zoom <= 1.001 && zIn){ zIn = false; if (history.state.z){ const st = Object.assign({}, history.state); delete st.z; zIgnore = true; history.back(); setTimeout(() => { if (history.state && history.state.sp) history.replaceState(Object.assign({}, st), ""); }, 60); } }
  }
  // the panel under the sheet: shown on a phone while the whole sheet is in view and leaves room under it (upright, not
  // typing in the find box), from the sheet's foot down to the buttons; zooming in gives the screen back to the sheet
  // the ‹ › arrows: halfway down the sheet's sides, each only when there is a drawing that way (set again once the
  // panel has worked out the row, pid.js)
  function arrows(){ if (!V) return; const on = V.el.classList.contains("cx-on") && cur && cur.swipe, e = V.el.getBoundingClientRect(), s = V.sheet.getBoundingClientRect();
    V.el.querySelectorAll(".sp-arw").forEach(a => { const dir = a.classList.contains("l") ? -1 : 1, ok = !!(on && cur.swipe(dir)); a.hidden = !ok; if (!ok) return;
      a.style.top = Math.round(s.top - e.top + s.height / 2 - a.offsetHeight / 2) + "px"; a.style.left = Math.round((dir < 0 ? s.left + 6 : s.right - 6 - a.offsetWidth) - e.left) + "px"; }); }
  // ---------- P&ID lines coloured by fluid (phone) ----------
  // Every traced line on the sheet (lines/<number>.json) drawn over the print in its fluid's colour, the fluid code the
  // third part of the line number (12-1646-COW-SS1-80). The commonest codes (process water, instrument air, bore water,
  // drains, concentrate, fire water, flotation slurry …) each a colour clearly apart from the others; the obvious ones
  // kept (water blue, fire water red, lube oil black). With the flow animation on, white dashes run downstream on the
  // lines whose flow is known. While a line is traced the rest go grey. Both switches (the Lines chip) and the legend's
  // shown / hidden hold for every drawing until changed.
  const MECHC = "#8d6e63", OTHC = "#64748b";   // (OTHC: a line with no fluid code, ducting or a continuation printed without a number)   // (an unnumbered process pipe, slurry and the like: tools/link_pipes.py)
  const FLC = {"PW":"#1565ff","IA":"#00a651","BW":"#4a148c","FD":"#8d6e63","CON":"#ff9500","FW":"#e00000","FS":"#ffe100","POT":"#8ec5f5","PSW":"#ff3d9a","COW":"#00695c","LO":"#222222","GW":"#8db600","CN":"#d500f9","PE":"#00bfa5","SC":"#616161","OXY":"#80deea","NS":"#ce93d8","LS":"#bdbdbd","MS":"#654522","HCL":"#b3446c","FL":"#69f0ae","XA":"#556b2f","FT":"#9e9e9e","FR":"#ffab91","CW":"#9c27b0","CO":"#0097a7","HP":"#dcd300","LN":"#f99379","BE":"#604e97","HPE":"#e25822","AE":"#ff1744","HO":"#827717","BA":"#b2dfdb","WM":"#5c6bc0","AS":"#cfd8dc","CS":"#ff8a80","TO":"#d7ccc8","CA":"#90a4ae","LPG":"#ff6e40","WW":"#90caf9"};
  const FLN = {"AE":"Acid Effluent","AS":"Antiscalant","BA":"Blower Air","BE":"Barren Eluate","BW":"Bore Water (Raw Water)","CN":"Cyanide Solution","CO":"Copper Sulphate","CON":"Concentrate Slurry","COW":"Cooling Water","CS":"Cyanide Slurry","CW":"Cyanide Water","FD":"Floor Drainage","FL":"Flocculant","FR":"Frother","FS":"Flotation Slurry","FT":"Final Tailings","FW":"Fire Water","GW":"Gland Water (High Pressure)","HCL":"Hydrochloric Acid","HO":"Hydraulic Oil","HP":"Hydrogen Peroxide","HPE":"Hydrochloric Acid / Pregnant Eluate","IA":"Instrument Air","LN":"Lead Nitrate","LO":"Lubricating Oil (High Pressure)","LPG":"Fuel Gas","LS":"Lime Slurry","MS":"Mill Slurry","NS":"Caustic Soda","OXY":"Oxygen","PE":"Pregnant Eluate (Elution)","POT":"Potable Water","PSW":"Process Scheme Water (Normal)","PW":"Process Water (High)","SC":"Carbon Slurry","WM":"UFG Media and Process Water","WW":"Washdown Water","XA":"Xanthate","CA":"Compressed air","TO":"Transformer oil"};
  const lsg = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === "1"; } catch (e) { return d; } };
  const FL = { c: lsg("kcgm_flc", false), w: lsg("kcgm_flw", true), leg: lsg("kcgm_flleg", true), cnt: {} };
  const fluid = l => String(l || "").split("|")[0].split("-")[2] || "";
  // (arrived at the whole sheet through a ribbon: the line it carries here, V.hiB)
  const hiKeys = () => { const D = cur && LNR[cur.number], h = V && V.hiB; if (!D || !h || h.n !== cur.number || (TR && TR.n === cur.number) || FL.pick) return []; return h.b.map(j => D.rb && D.rb[j]).filter(x => x != null && D[x]).map(String); };
  const hiOn = () => hiKeys().length > 0;
  const flOn = () => (FL.c || (TR && TR.n === cur.number) || hiOn()) && cur && /-PID-/.test(cur.number || "") && V.pg;   // (a line flown through: it in its colour and the rest grey, whether or not all lines are coloured)
  async function drawFl(){ if (!V || !V.fl) return;
    if (!flOn()){ V.fl.innerHTML = ""; flLeg({}); return; }
    const me = cur, pn = V.page, D = await linesFor(cur.number); if (cur !== me || V.page !== pn || !V.pg || V.pgFor !== me) return;   // (not on the last drawing's page while this one loads)
    const vp = V.pg.getViewport({ scale: 1, rotation: V.rot || 0 }), W = vp.width, H = vp.height, cnt = {}; let h = "", fw = "";
    Object.keys(D).forEach(k => { const rk = /^r\d+$/.test(k) && D.lb && D.lb[k];   // (a ribbon's continuation, under the number it carries)
      const rr = /^r\d+$/.test(k); if (!/^\d+$/.test(k) && !isU(k) && !rr) return; const r = rr ? V.refs[+k.slice(1)] : refK(k, D); if (!r || r[0] !== pn) return; const mech = isU(k) && /-MECH-/.test(D.lb[k]), c = mech ? "MECH" : rr && !rk ? "" : fluid(rk || (isU(k) ? D.lb[k] : r[5])), col = mech ? MECHC : FLC[c] || OTHC; if (!mech && !rr && FLC[c]) cnt[c] = (cnt[c] || 0) + 1;
      const pts = D[k].map(q => { const [x, y] = trPt(q[0], q[1]); return (x / 1e4 * W).toFixed(1) + "," + (y / 1e4 * H).toFixed(1); }).join(" ");
      h += `<polyline data-k="${k}" data-fc="${c}" points="${pts}" style="--c:${col}"/>`;
      if (FL.w && D.fl && D.fl[k]) fw += `<polyline class="fw" data-k="${k}" data-fc="${c}" points="${pts}" style="animation-delay:-${((performance.now() / 1000 + (parseInt(String(k).replace(/\D/g, "")) || 0) * .37) % 1.1).toFixed(3)}s"/>`; });
    const was = V.fl.childElementCount; V.fl.setAttribute("viewBox", `0 0 ${W} ${H}`); V.fl.innerHTML = h + fw; if (!was && h && V.fl.animate) V.fl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "ease-out" });   // (a new drawing's lines fade in)
    V.fl.classList.toggle("c", !!FL.c); flDim(); flLeg(cnt); }   // (Colours ticked: the lines not picked fainter in their own colour, never grey)
  // the lines a line runs on into downstream on this sheet: what the next line arrows offer (an end on an end or on its
  // side, a join through a pump or vessel), followed on to the sheet's edge. A line feeding in at the same place is not
  // where the flow goes: left out. D the sheet's lines, refOf a key's ref, A the sheet's width over its height
  function chain(D, k0, refOf, A, pg){ const out = new Set(), fl = D.fl || {}, isK = k => /^(\d+|u\d+)$/.test(k);
    const dist = (a, b) => Math.hypot((a[0] - b[0]) * A, a[1] - b[1]);
    const segd = (Q, q) => { let m = 1e18; for (let i = 1; i < Q.length; i++){ const [x0, y0] = Q[i - 1], [x1, y1] = Q[i], dx = (x1 - x0) * A, dy = y1 - y0, ll = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((q[0] - x0) * A * dx + (q[1] - y0) * dy) / ll)); m = Math.min(m, Math.hypot((x0 + t * (x1 - x0) - q[0]) * A, y0 + t * (y1 - y0) - q[1])); } return m; };
    const keys = Object.keys(D).filter(k => isK(k) && refOf(k) && refOf(k)[0] === pg), q = [[String(k0), 1]], seen = new Set([String(k0)]);
    while (q.length && out.size < 60){ const [k, ei] = q.shift(), P = D[k]; if (!P) continue; const e = ei ? P[P.length - 1] : P[0];
      const add = (k2, ni) => { if (seen.has(k2)) return; seen.add(k2); out.add(k2); if (ni != null) q.push([k2, ni]); };
      keys.forEach(k2 => { if (seen.has(k2)) return; const Q = D[k2], dS = dist(Q[0], e), dE = dist(Q[Q.length - 1], e);
        if (Math.min(dS, dE) < 45){ if (fl[k2] && dE < dS) return; add(k2, dS < dE ? 1 : 0); }   // (end to end: on from its far end; one ending here feeds in)
        else if (segd(Q, e) < 25) add(k2, fl[k2] ? 1 : null); });   // (into its side: on from its downstream end, when known)
      (D.lk || []).forEach(([a, ea, b, eb]) => { for (const [x, ex, y, ey] of [[a, ea, b, eb], [b, eb, a, ea]]) if (String(x) === k && ex === ei && D[y]) add(String(y), 1 - ey); }); }
    return out; }
  // (a line traced: the rest grey, that one in its colour, the lines it runs on into lighter)
  function flDim(){ if (!V || !V.fl) return; const tr = !!(TR && cur && TR.n === cur.number), on = tr || !!FL.pick; V.fl.classList.toggle("dim", on); V.fl.classList.toggle("pk", !tr && !!FL.pick);
    V.fl.querySelectorAll(".sel, .nx").forEach(p => p.classList.remove("sel", "nx")); if (on) V.fl.querySelectorAll(tr ? `[data-k="${TR.k}"]` : `[data-fc="${FL.pick}"]`).forEach(p => p.classList.add("sel"));
    const hk = !on ? hiKeys() : []; if (hk.length){ V.fl.classList.add("dim"); hk.forEach(k => V.fl.querySelectorAll(`[data-k="${k}"]`).forEach(p => p.classList.add("sel")));
      const vp = V.pg.getViewport({ scale: 1 }); hk.forEach(k0 => chain(LNR[cur.number], k0, k => refK(k), vp.width / vp.height, V.page).forEach(k => V.fl.querySelectorAll(`[data-k="${k}"]:not(.fw)`).forEach(p => p.classList.add("nx")))); }
    if (tr && V.pg){ if (!TR.ch){ const vp = V.pg.getViewport({ scale: 1 }); TR.ch = chain(TR.D, TR.k, k => refK(k, TR.D), vp.width / vp.height, TR.page); }
      TR.ch.forEach(k => V.fl.querySelectorAll(`[data-k="${k}"]:not(.fw)`).forEach(p => p.classList.add("nx"))); }
    V.flg.querySelectorAll("[data-fc]").forEach(r => r.classList.toggle("on", r.dataset.fc === FL.pick)); V.flg.classList.toggle("pk", !!FL.pick); }
  // a fluid picked in the legend: its lines alone in colour, the rest grey. One browser history step, so Back (the
  // phone's swipe back), Esc or a click on the bare sheet go back to every fluid in colour
  let pkPop = false;
  // the find box (phone): Back closes it, the viewer stays
  addEventListener("popstate", e => { if (fdPop){ fdPop = false; e.stopImmediatePropagation(); return; }
    if (V && V.el.classList.contains("find-on") && !(history.state && history.state.fd)){ e.stopImmediatePropagation(); V.el.classList.remove("find-on", "typing"); const q = V.el.querySelector(".sp-q"); if (q) q.blur(); } }, true);
  function pick1(c){ if (TR) return; const had = !!FL.pick; FL.pick = c; flDim();
    if (!had && history.state && history.state.sp && !history.state.fp) history.pushState(Object.assign({}, history.state, { fp: 1 }), ""); }
  function pickEnd(how){ if (!FL.pick) return; FL.pick = null; flDim();
    if (history.state && history.state.fp){ if (how === "x"){ pkPop = true; history.back(); } else if (!how){ const st = Object.assign({}, history.state); delete st.fp; history.replaceState(st, ""); } } }
  addEventListener("popstate", e => { if (pkPop){ pkPop = false; e.stopImmediatePropagation(); return; }
    if (FL.pick && !(history.state && history.state.fp)){ e.stopImmediatePropagation(); pickEnd(true); } }, true);
  addEventListener("keydown", e => { if (FL.pick && e.key === "Escape" && V && !V.el.hidden){ e.preventDefault(); e.stopImmediatePropagation(); pickEnd("x"); } }, true);
  // the legend: the fluids on this drawing, commonest first; "Hide" leaves one line of dots
  function flLeg(cnt){ const g = V.flg, cs = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b)); FL.cnt = cnt; g.dataset.n = cs.length; g.classList.toggle("open", FL.leg);
    g.innerHTML = `<button type="button" class="hd"><b>${FL.leg ? "Fluids on this drawing" : "Fluids"}</b>${FL.leg ? "" : `<span class="fl-dots">${cs.map(c => `<i style="background:${FLC[c]}"></i>`).join("")}</span>`}<em>${FL.leg ? "Hide ▴" : "Show ▾"}</em></button>`
      + (FL.leg ? `<div class="grid">${cs.map(c => `<button type="button" class="row${c === FL.pick ? " on" : ""}" data-fc="${c}" style="--c:${FLC[c]}" title="Only ${esc(FLN[c] || c)} in colour"><i class="sw" style="background:${FLC[c]}"></i><span class="cd" style="--c:${FLC[c]}">${c}</span><span class="nm">${esc(FLN[c] || "")}</span>${desk() ? `<span class="ct">${cnt[c]}</span>` : ""}</button>`).join("")}</div>` : "");
    cxFit(); }
  // (under the sheet while the tag list shows; zoomed in, at the foot over the buttons; not while a line is traced)
  function legAt(under, sb, lim){ const g = V.flg, show = +g.dataset.n > 0 && FL.c && !TR && !V.el.hidden && !V.el.classList.contains("typing"); g.hidden = !show; tkAt(); if (!show) return 0;
    const e = V.el.getBoundingClientRect(), s = V.sheet.getBoundingClientRect(); g.classList.toggle("fl", !under); g.classList.toggle("dk", desk());
    if (desk()){ const lg = V.el.querySelector(".sp-lg"), r = lg && !lg.hidden ? lg.getBoundingClientRect() : null, b = V.body.getBoundingClientRect();
      g.style.left = ""; g.style.width = ""; g.style.bottom = ""; g.style.right = Math.round(e.right - (r ? r.right : b.right - 12)) + "px"; g.style.top = Math.round((r ? r.bottom + 6 : b.top + 10) - e.top) + "px";
      g.style.maxHeight = Math.max(80, Math.round(b.bottom - (r ? r.bottom + 6 : b.top + 10) - 12)) + "px"; return 0; }
    if (under){ g.style.left = Math.round(Math.max(s.left, e.left + 6) - e.left) + "px"; g.style.width = Math.round(Math.min(s.width, e.width - 12)) + "px"; g.style.top = Math.round(sb - e.top + 6) + "px"; g.style.bottom = ""; return g.offsetHeight + 6; }
    g.style.left = "8px"; g.style.width = ""; g.style.top = ""; g.style.bottom = Math.round(e.bottom - lim + 8) + "px"; return 0; }
  // (the desktop tick boxes under the hand / pointer / whole sheet buttons)
  function tkAt(){ const t = V.ftk; if (!t || t.hidden || !desk()) return; const m = V.el.querySelector(".sp-mode"); if (!m) return; const r = m.getBoundingClientRect(), e = V.el.getBoundingClientRect();
    if (!r.height){ t.style.visibility = "hidden"; return; } t.style.visibility = ""; t.style.left = Math.round(r.left - e.left) + "px"; t.style.top = Math.round(r.bottom - e.top + 6) + "px"; }
  function cxFit(){
    if (!V || !V.cx) return; const c = V.cx; V.el.classList.toggle("cx-on", false); V.el.querySelectorAll(".sp-arw").forEach(a => a.hidden = true);
    const e = V.el.getBoundingClientRect(), sb = V.sheet.getBoundingClientRect().bottom; let lim = V.body.getBoundingClientRect().bottom;
    V.el.querySelectorAll(".sp-top").forEach(t => { const r = t.getBoundingClientRect(); if (r.height && r.top > e.top + e.height / 2) lim = Math.min(lim, r.top); });
    if (!cur || !cur.panel || desk() || V.el.hidden || V.zoom > 1.001 || V.rot || TR || V.el.classList.contains("typing")){ c.hidden = true; legAt(false, sb, lim); return; }
    const lg = legAt(true, sb, lim), room = lim - sb - 14 - lg; if (room < (lg ? 70 : 120)){ c.hidden = true; legAt(false, sb, lim); return; }
    c.style.top = Math.round(sb - e.top + 6 + lg) + "px"; c.style.height = Math.round(room) + "px";
    if (V.cxFor !== cur){ V.cxFor = cur; c.innerHTML = ""; cur.panel(c); }
    c.hidden = false; V.el.classList.add("cx-on"); arrows();
  }
  // Both layers draw off screen and are swapped in whole when finished, so nothing blanks or jumps while panning.
  let bgTask = null, hiTask = null, bgGen = 0, hiGen = 0;
  // the sheet's ready-made picture (tools/build_pics.py: PIDs/X.pdf.p1.png, 2400 px on the long side), shown at once;
  // the PDF itself is only drawn where you zoom past the picture's detail (sharp). Without a picture, the PDF draws it.
  let PICS = null; const picsP = fetch("pics.json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => PICS = j);
  const picOf = () => PICS && PICS[cur.url.replace(/^\.\//, "").split("?")[0]] >= V.page ? `${cur.url.split("?")[0]}.p${V.page}.png` : null;
  function drawBg(){
    const g = ++bgGen, src = picOf();
    if (src){ const im = new Image(); im.decoding = "async"; im.onload = () => { if (g !== bgGen) return;
        const rot = V.rot || 0, c = V.bg; c.width = rot ? im.height : im.width; c.height = rot ? im.width : im.height; const x = c.getContext("2d");
        if (rot){ x.translate(c.width, 0); x.rotate(Math.PI / 2); } x.drawImage(im, 0, 0); V.picW = c.width; V.sheet.classList.remove("sp-wait"); sharp(); };
      im.onerror = () => { if (g === bgGen){ PICS[cur.url] = 0; drawBg(); } }; im.src = src; return; }
    V.picW = 0;
    const dpr = Math.min(2, devicePixelRatio || 1), vp = V.pg.getViewport({ rotation: V.rot || 0, scale: V.base * dpr * (cur.fit === "page" ? 1.5 : 1) });
    const off = document.createElement("canvas"); off.width = vp.width; off.height = vp.height;
    if (bgTask) bgTask.cancel(); bgTask = V.pg.render({ canvasContext: off.getContext("2d"), viewport: vp });
    bgTask.promise.then(() => { if (g !== bgGen) return; V.bg.width = off.width; V.bg.height = off.height; V.bg.getContext("2d").drawImage(off, 0, 0); V.sheet.classList.remove("sp-wait"); })
      .catch(() => { if (g === bgGen) V.sheet.classList.remove("sp-wait"); });
  }
  // the sharp layer hidden: its box goes too. Left at the size and place of a closer zoom it kept the window scrollable
  // far past a sheet since zoomed out, so a drag could carry the sheet off into empty space.
  function hideHi(){ const c = V.hi.style; c.visibility = "hidden"; c.left = c.top = "0px"; c.width = c.height = "0px"; }
  function sharp(){
    if (!V.pg) return;
    const dpr = devicePixelRatio || 1, s = V.base * V.zoom, sw = V.sheet.offsetWidth, sh = V.sheet.offsetHeight;
    if (V.picW && V.picW >= sw * dpr * .85){ hiGen++; if (hiTask) hiTask.cancel(); hideHi(); return; }   // the picture is detailed enough at this zoom: no PDF drawing
    const x0 = Math.max(0, V.body.scrollLeft - 8), y0 = Math.max(0, V.body.scrollTop - 8);
    const w = Math.min(sw - x0, V.body.clientWidth + 16), h = Math.min(sh - y0, V.body.clientHeight + 16);
    if (w <= 0 || h <= 0) return;
    const off = document.createElement("canvas"), g = ++hiGen; off.width = Math.round(w * dpr); off.height = Math.round(h * dpr);
    const vp = V.pg.getViewport({ rotation: V.rot || 0, scale: s * dpr, offsetX: -x0 * dpr, offsetY: -y0 * dpr });
    if (hiTask) hiTask.cancel(); hiTask = V.pg.render({ canvasContext: off.getContext("2d"), viewport: vp });
    hiTask.promise.then(() => { if (g !== hiGen) return; const c = V.hi;
      c.width = off.width; c.height = off.height; c.getContext("2d").drawImage(off, 0, 0);
      c.style.left = x0 + "px"; c.style.top = y0 + "px"; c.style.width = w + "px"; c.style.height = h + "px"; c.style.visibility = ""; }).catch(() => {});
  }
  function zoomTo(z, cx, cy, fx0, fy0){
    if (V && V.sheet) V.sheet.style.removeProperty("--trk");   // (the pinch's counter-scale off: the sheet is redrawn at the new zoom)
    z = Math.max(1, Math.min(cur.fit === "page" ? 24 : 10, z)); if (!V.pg || Math.abs(z - V.zoom) < .001) return;
    // (flying a line: the zoom you pinch or tap to is the fly through's zoom, kept for the next line clicked)
    if (TR && V.tz){ const zs = V.tz.querySelector(".sp-trz"); zs.value = Math.max(0, Math.min(100, Math.log10(z) * 100)); try { localStorage.setItem("kcgm_trz", zs.value); } catch (e) {} }
    const r = V.body.getBoundingClientRect(); cx = cx == null ? r.left + r.width / 2 : cx; cy = cy == null ? r.top + r.height / 2 : cy;
    // the point under (cx, cy) as a fraction of the page stays under it (measured from the page itself, so the body's padding doesn't matter)
    const q = V.sheet.getBoundingClientRect(), fx = fx0 != null ? fx0 : (cx - q.left) / q.width, fy = fy0 != null ? fy0 : (cy - q.top) / q.height;
    V.zoom = z; layout(false);
    const q2 = V.sheet.getBoundingClientRect(); V.body.scrollLeft += q2.left + fx * q2.width - cx; V.body.scrollTop += q2.top + fy * q2.height - cy;
    // while the sheet is still smaller than the window one way it can't scroll that way: it slides instead (inside the
    // window), so the point under the cursor stays under it from the first step of zoom, not only once the sheet overflows
    const q3 = V.sheet.getBoundingClientRect(); V.ox = (V.ox || 0) + cx - (q3.left + fx * q3.width); V.oy = (V.oy || 0) + cy - (q3.top + fy * q3.height); slide();
    sharp(); settleSoon();
    if (TR) drawTrace();   // (the trail and its arrow redrawn for the new zoom: a set size on screen, not blown up with the sheet)
  }
  // the sheet's slide (V.ox, V.oy): lets the page sit off centre (or past the window's edge) so a zoom keeps the point
  // under the cursor where it is; the page always covers the middle of the window, and at fit it is centred again
  // the next drawing after a swipe slides in from the side the finger came from (V.swIn, set by the swipe)
  function swEnter(){ if (!V || !V.swIn) return;
    if (!V.swIn.out){ V.sheet.style.opacity = 0; clearTimeout(V.swW); V.swW = setTimeout(swEnter, 40); return; }   // (the old one still on its way out: wait, the new one unseen)
    const d = V.swIn.dir, st = V.sheet.style; V.swIn = null; clearTimeout(V.swT);
    st.transition = "none"; st.transform = ""; const sr = V.sheet.getBoundingClientRect(), br = V.body.getBoundingClientRect();
    st.transform = `translateX(${d > 0 ? br.right - sr.left + 8 : br.left - sr.right - 8}px)`; st.opacity = ""; void V.sheet.offsetWidth;
    st.transition = "transform .22s ease-out"; st.transform = ""; setTimeout(() => { if (!V.swIn) st.transition = ""; }, 260); }
  function slide(){
    if (V.zoom <= 1.001){ V.ox = V.oy = 0; }
    else { V.sheet.style.left = V.ox ? V.ox + "px" : ""; V.sheet.style.top = V.oy ? V.oy + "px" : "";
      const q = V.sheet.getBoundingClientRect(), r = V.body.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2;
      if (q.left > mx) V.ox -= q.left - mx; if (q.right < mx) V.ox += mx - q.right; if (q.top > my) V.oy -= q.top - my; if (q.bottom < my) V.oy += my - q.bottom; }
    // once the sheet overflows the window a slide is traded for scroll (same view), or the part slid off the top or left
    // edge could never be scrolled back to
    if (V.zoom > 1.001 && (V.ox || V.oy)){ const b = V.body; V.sheet.style.left = V.sheet.style.top = "";
      const mx = b.scrollWidth - b.clientWidth, my = b.scrollHeight - b.clientHeight;
      const trade = (o, pos, max) => o < 0 ? Math.min(-o, Math.max(0, max - pos)) : -Math.min(o, pos);   // the scroll change
      const dx = trade(V.ox, b.scrollLeft, mx), dy = trade(V.oy, b.scrollTop, my);
      b.scrollLeft += dx; b.scrollTop += dy; V.ox += dx; V.oy += dy;
      // (what's left would hold the sheet past its own end: dropped, as a scroll stops at the end)
      if (V.sheet.offsetWidth > b.clientWidth) V.ox = 0; if (V.sheet.offsetHeight > b.clientHeight) V.oy = 0; }
    V.sheet.style.left = V.ox ? V.ox + "px" : ""; V.sheet.style.top = V.oy ? V.oy + "px" : ""; }

  // ---------- mark a tag on the page ----------
  // find typed text: this page first, then the other sheets of the document (the first sheet with it opens)
  let fgen = 0;
  async function findText(t, enter){
    const g = ++fgen; t = String(t || "").trim();
    if (norm(t).length < (enter ? 1 : 2)){ cur.find = null; V.marks.innerHTML = ""; V.hits = []; V.el.querySelector(".sp-finds").hidden = true; return; }
    cur.find = t; await mark(t, true); if (g !== fgen) return;
    if (V.hits.length){ if (enter) showHit(0, 1); return; }
    const d = await getDoc(cur.url), want = norm(t);
    for (let p = 1; p <= d.numPages; p++){ if (p === V.page) continue;
      const tc = await (await d.getPage(p)).getTextContent(); if (g !== fgen) return;
      if (norm(tc.items.map(i => i.str).join("")).includes(want)){ await go(p); return; } }
    toast(`“${t}” isn't in the searchable text of this drawing.`);
  }
  async function mark(tag, quiet){
    const want = norm(tag); if (!want.length || (V.fit && V.fmatch && V.fmatch.length) || (V.fit && !quiet)) return;
    const tc = await V.pg.getTextContent(), vp = V.pg.getViewport({ rotation: V.rot || 0, scale: 1 }), W = vp.width, H = vp.height;
    const items = tc.items.filter(t => t.str && t.str.trim()).map(t => { const [a, b, c, d, e, f] = t.transform, h = Math.hypot(c, d) || Math.hypot(a, b);
      const x = e, y = f, w = t.width || h * t.str.length * .5, rot = Math.abs(b) > Math.abs(a);
      // box in PDF units (origin bottom left), vertical text included
      const box = rot ? [x - h, y, x, y + w] : [x, y - h * .2, x + w, y + h * .9];
      return { s: norm(t.str), box, rot, h }; });
    // two text pieces join only when they sit next to each other on the sheet (a gap under about 1.5 letter heights),
    // so a tag split over two pieces doesn't pull in text from across the drawing
    const near = (p, q) => { const h = Math.min(p.h, q.h) || 1, gx = Math.max(0, q.box[0] - p.box[2], p.box[0] - q.box[2]), gy = Math.max(0, q.box[1] - p.box[3], p.box[1] - q.box[3]); return gx + gy < h * 1.5; };
    // a piece holding more than the tag: its box is cut down to the tag's share of the characters
    const part = (it, k, n) => { const b = it.box, L = it.s.length || 1, a = k / L, z = Math.min(1, (k + n) / L);
      return it.rot ? [b[0], b[1] + (b[3] - b[1]) * a, b[2], b[1] + (b[3] - b[1]) * z] : [b[0] + (b[2] - b[0]) * a, b[1], b[0] + (b[2] - b[0]) * z, b[3]]; };
    const hits = [];
    for (let i = 0; i < items.length; i++){
      let acc = "", boxes = [];
      for (let j = i; j < Math.min(items.length, i + 8); j++){
        if (j > i && !near(items[j - 1], items[j])) break;
        acc += items[j].s; boxes.push(j === i ? items[j].box : items[j].box);
        if (acc.includes(want)){ const k = acc.indexOf(want);
          if (j === i) boxes = [part(items[i], k, want.length)];
          else { boxes[0] = part(items[i], Math.min(k, items[i].s.length - 1), items[i].s.length); const e = k + want.length - (acc.length - items[j].s.length); boxes[boxes.length - 1] = part(items[j], 0, Math.max(1, e)); }
          hits.push(boxes.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])])); break; }
        // keep joining only while the end of what we have could still be the start of the tag
        let go = false; for (let k = 0; k < acc.length && !go; k++) go = want.startsWith(acc.slice(k));
        if (!go) break;
      }
    }
    // drop duplicates: the same place found from overlapping starts, or twice on a scanned sheet (the drawn text and
    // the OCR layer under it): boxes that overlap, or whose centres sit within a letter height, are one place
    const uniq = hits.filter((b, k) => !hits.slice(0, k).some(o => samePlace(o, b)));
    V.hits = uniq.map(b => { const [x1, y1, x2, y2] = vp.convertToViewportRectangle(b); return { l: Math.min(x1, x2) / W, t: Math.min(y1, y2) / H, w: Math.abs(x2 - x1) / W, h: Math.abs(y2 - y1) / H }; });
    // a red see-through arrow pointing down at each place, sized to the sheet (1.8% of its width), so it grows and
    // shrinks with the drawing; it doesn't move
    // a red box on each place (as the labels on a checked sheet); stepping through them adds the arrow (showHit)
    const vpA = W / H;
    V.marks.innerHTML = V.hits.map(h => { const [l, t, w, hh] = PdfView.grow(h.l * 1e4, h.t * 1e4, h.w * 1e4, h.h * 1e4, vpA);
      return `<i class="sp-hb" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${hh / 100}%"></i>`; }).join(""); hideOwnHits(); drawTap();
    const f = V.el.querySelector(".sp-finds"); f.hidden = !V.hits.length;
    if (V.hits.length){ V.fi = -2; V.el.querySelector(".sp-fn").textContent = `${V.hits.length} result${V.hits.length === 1 ? "" : "s"}`; }
    else if (!quiet) toast(`${tag} isn't written as searchable text on this drawing.`);
  }
  // a found place that has its own tag box on the sheet: that box shows it, so its find box is hidden (run when the
  // finds are drawn and again when the tag boxes arrive, whichever comes last)
  function hideOwnHits(){ if (!V.marks || !V.hits || !V.boxes) return; const kids = V.marks.children;
    V.hits.forEach((h, i) => { const el = kids[i]; if (!el) return; const own = V.boxes.some(([l, t, w, hh]) => { l /= 1e4; t /= 1e4; w /= 1e4; hh /= 1e4;
      return h.l < l + w && h.l + h.w > l && h.t < t + hh && h.t + h.h > t; }); el.style.display = own ? "none" : ""; }); }
  function samePlace(o, b){ const h = Math.max(o[3] - o[1], b[3] - b[1]), ov = !(b[0] > o[2] || b[2] < o[0] || b[1] > o[3] || b[3] < o[1]);
    return ov || Math.hypot((o[0] + o[2] - b[0] - b[2]) / 2, (o[1] + o[3] - b[1] - b[3]) / 2) < h * 1.5; }
  function pulse(k){ [...V.marks.children].forEach((m, i) => m.classList.toggle("on", i === k)); }
  // scroll so a sheet point (fractions) sits in the middle of what can be seen: above the phone's find box and buttons
  function centreOn(fx, fy){
    let bottom = V.body.getBoundingClientRect().bottom; const r0 = V.body.getBoundingClientRect();
    { const tb = V.tb; if (tb && !tb.hidden && desk()){ const r = tb.getBoundingClientRect(); if (r.height) bottom = Math.min(bottom, r.top); } }   // (desktop: above the trace strip)
    if (document.documentElement.classList.contains("phone")) V.el.querySelectorAll(".sp-q, .sp-top, .sp-trb").forEach(e => { const r = e.getBoundingClientRect(); if (r.height && getComputedStyle(e).display !== "none" && r.top > r0.top + r0.height / 3) bottom = Math.min(bottom, r.top); });
    V.body.scrollLeft = fx * V.sheet.offsetWidth - V.body.clientWidth / 2; V.body.scrollTop = fy * V.sheet.offsetHeight - (bottom - r0.top) / 2;
  }
  // step through the matches: the first Enter shows the whole sheet with all of them; each one after jumps straight
  // (no slide) to the next at four times the whole-sheet zoom with the arrow above it
  function showHit(k, dir){
    if (!V.hits.length) return; const n = V.hits.length;
    if (V.fi === -2){ V.fi = -1; quiet(); V.zoom = 1; layout(false); V.body.scrollTo(0, 0); sharp(); V.tap = null; drawTap(); return; }
    V.fi = V.fi < 0 ? (dir < 0 ? n - 1 : 0) : (k + n) % n; const h = V.hits[V.fi];
    V.el.querySelector(".sp-fn").textContent = `${V.fi + 1} of ${n}`; pulse(V.fi);
    quiet(); V.zoom = hitZ(); layout(false);
    centreOn(h.l + h.w / 2, h.t + h.h / 2); sharp();
    V.tap = { page: V.page, l: h.l, t: h.t, w: h.w, h: h.h }; drawTap(); settleSoon();
  }
  let tt; function toast(m){ let t = V.el.querySelector(".sp-toast"); if (!t){ t = document.createElement("div"); t.className = "sp-toast"; V.el.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 3500); }

  // a reference's tap box, grown: 45% of the text height added on every side (height +90%), the same margin (in
  // screen terms) on the width. Boxes in 1/10000 of the sheet; A = sheet width / height.
  const grow = (l, t, w, h, A) => { const m = .45 * Math.min(h, w * A); return [l - m / A, t - m, w + 2 * m / A, h + 2 * m]; };
  // of the boxes holding a point, the one whose centre is nearest (-1: none)
  const nearest = (B, x, y) => { let k = -1, d = 1e18; B.forEach(([l, t, w, h], i) => { if (x < l || x > l + w || y < t || y > t + h) return;
      const e = (x - l - w / 2) ** 2 + (y - t - h / 2) ** 2; if (e < d){ d = e; k = i; } }); return k; };
  // the drawing viewed before this one in the visit (the strip under the sheet marks it)
  // (whichever way you left it: the strip, a ribbon, ← or →; the visit's first drawing has none)
  let lastNum = null;
  const came = () => lastNum && cur && lastNum !== cur.number ? lastNum : null;
  // a line picked on the drawing beside an item's page (viz.js): its fly through here once this sheet is up
  async function want(n, label, at){ const t0 = Date.now();
    while (Date.now() - t0 < 12000){ if (cur && cur.number === n && V.pgFor === cur && V.refs && V.refs.length) break; await new Promise(ok => setTimeout(ok, 150)); }
    if (!cur || cur.number !== n) return; const D = await linesFor(n); if (!cur || cur.number !== n) return;
    const gi = V.refs.findIndex(r => (r[6] === "line" || r[6] === "mel" || r[6] === "elec") && String(r[5]).split("|")[0] === label && D[V.refs.indexOf(r)]); if (gi < 0) return;
    if (V.page !== V.refs[gi][0]) await go(V.refs[gi][0], true);
    const b = boxOf(V.refs[gi]), bx = { page: V.page, l: b[0] / 1e4, t: b[1] / 1e4, w: b[2] / 1e4, h: b[3] / 1e4 }; V.tap = bx; drawTap(); trace(gi, at || null, [bx.l, bx.t, bx.w, bx.h]); }
  // the coloured lines' settings and palette, shared with that drawing
  const flApi = { MECHC, OTHC, FLC, FLN, fluid, get: () => ({ c: FL.c, w: FL.w, leg: FL.leg }), set(f, v){ FL[f] = v; try { localStorage.setItem({ c: "kcgm_flc", w: "kcgm_flw", leg: "kcgm_flleg" }[f], v ? "1" : "0"); } catch (x) {} if (V && !V.el.hidden){ if (V.ftk){ V.ftk.querySelector('[data-f="c"]').checked = FL.c; V.ftk.querySelector('[data-f="w"]').checked = FL.w; } drawFl(); } } };
  return { open, close, hide, back, fwd, canFwd, came, state, getDoc, grow, ribbon, nearest, arrows, want, fl: flApi, chain,
    saved: () => { try { return JSON.parse(sessionStorage.getItem(SSK) || "null"); } catch (e) { return null; } },
    // a tag picked from the list under the sheet: zoomed to and marked by its box (pid-refs.json), else found in the text
    find: t => { if (!V || !cur) return; fitFilter(t, true); if (V.fmatch.length){ V.fstep = -1; fitStep(1); return; } fitFilter(""); findText(t, true); }, panelOn: () => !!(V && V.cx && !V.cx.hidden && !V.el.hidden), clearMark: () => { if (V){ V.marks.innerHTML = ""; V.hits = []; V.el.querySelector(".sp-finds").hidden = true; } if (cur) cur.find = null; } };
})();
