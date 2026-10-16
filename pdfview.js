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
      <button class="sp-fb" data-a="find" title="Find in this drawing">⌕</button><button class="sp-rot" data-a="rot" title="Turn to landscape / back">⟲</button><a class="sp-dl" title="Download this PDF">Download</a><button class="sp-x" data-a="close" title="Close">✕</button></div>
      <div class="sp-body"><div class="sp-sheet"><canvas class="sp-bg"></canvas><canvas class="sp-hi"></canvas><svg class="sp-trl"></svg><div class="sp-refs"></div><div class="sp-marks"></div><div class="sp-tap"></div><div class="sp-text textLayer"></div><div class="sp-dn"></div></div></div><div class="sp-msg"></div>
      <button class="sp-ze" data-a="fit" title="Zoom extents (whole sheet)"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>`;
    // phone, sheet at fit: the room left under the sheet holds a panel (cur.panel fills it: the connected drawings, pid.js)
    const cx = document.createElement("div"); cx.className = "sp-cx"; cx.hidden = true; el.appendChild(cx);
    // phone, the whole sheet in view: ‹ › on its left and right edges, the drawing before / after (as a swipe)
    ["l", "r"].forEach(sd => { const a = document.createElement("button"); a.type = "button"; a.className = "sp-arw " + sd; a.hidden = true; a.textContent = sd === "l" ? "‹" : "›";
      a.title = sd === "l" ? "The drawing before" : "The drawing after"; a.onclick = e => { e.stopPropagation(); if (cur && cur.swipe) cur.swipe(sd === "l" ? -1 : 1, true); }; el.appendChild(a); });
    // a button in the top right corner over the sheet, set by the opener (cur.corner: { html, title, go }): P&IDs' Drawing legend
    // phone, a line traced (trace below): its number, how far along, open its page, ✕; the zoom and along the line sliders
    const tb = document.createElement("div"); tb.className = "sp-trb"; tb.hidden = true;
    tb.innerHTML = `<div class="sp-trh"><b class="sp-trn"></b><button type="button" class="sp-tro">Go to asset</button><button type="button" class="sp-trx" title="Stop tracing">✕</button></div>
      <div class="sp-trtk"><input type="range" class="sp-tra sp-rg" min="0" max="1000" step="1" aria-label="Along the line"><div class="sp-trc"></div></div><div class="sp-tre"><span class="s"></span><span class="sp-trp"></span><span class="e"></span></div>`;
    // (the zoom: an upright slider on the right of the sheet, + at the top, − at the foot)
    const tz = document.createElement("div"); tz.className = "sp-trv"; tz.hidden = true;
    tz.innerHTML = `<button type="button" data-z="10" aria-label="Closer">+</button><span class="sp-trzb"><input type="range" class="sp-trz sp-rg" min="0" max="100" step="1" aria-label="Zoom"></span><button type="button" data-z="-10" aria-label="Further">−</button>`;
    tz.addEventListener("click", e => e.stopPropagation()); el.appendChild(tz);
    tb.addEventListener("click", e => e.stopPropagation()); el.appendChild(tb);
    const cb = document.createElement("button"); cb.type = "button"; cb.className = "sp-lg"; cb.hidden = true; el.appendChild(cb);
    cb.onclick = () => cur && cur.corner && cur.corner.go();
    document.body.appendChild(el);
    V = { tb, tz, trl: el.querySelector(".sp-trl"), cx, el, body: el.querySelector(".sp-body"), sheet: el.querySelector(".sp-sheet"), bg: el.querySelector(".sp-bg"), hi: el.querySelector(".sp-hi"), marks: el.querySelector(".sp-marks"),
      msg: el.querySelector(".sp-msg"), refsEl: el.querySelector(".sp-refs"), tapEl: el.querySelector(".sp-tap"), textEl: el.querySelector(".sp-text"), refs: [], page: 1, zoom: 1, pg: null, base: 1, hits: [], fi: 0 };
    el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({ prev: () => go(V.page - 1), next: () => go(V.page + 1), in: () => zoomTo(V.zoom * 1.5), out: () => zoomTo(V.zoom / 1.5), fit: () => zoomTo(1),
      fprev: () => V.fit ? fitStep(-1) : showHit(V.fi - 1, -1), fnext: () => V.fit ? fitStep(1) : showHit(V.fi + 1, 1), rot, close,
      find: () => { const on = !el.classList.contains("find-on"); el.classList.toggle("find-on", on); const q = el.querySelector(".sp-q"); if (on){ q.focus(); q.select(); } else q.blur(); }, back: () => history.back(), fwd: () => history.forward() })[b.dataset.a]());
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
      pin.mx = (a.clientX + b.clientX) / 2 - pin.cx; pin.my = (a.clientY + b.clientY) / 2 - pin.cy;
      if (!pin.o){ const q = V.sheet.getBoundingClientRect(); pin.o = `${pin.cx - q.left}px ${pin.cy - q.top}px`; pin.fx = (pin.cx - q.left) / q.width; pin.fy = (pin.cy - q.top) / q.height; }
      V.sheet.style.transformOrigin = pin.o; V.sheet.style.transform = `translate(${pin.mx}px,${pin.my}px) scale(${pin.f})`; } });
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
        V.sheet.style.transition = "transform .18s"; V.sheet.style.transform = sw ? `translateX(${dx < 0 ? -V.body.clientWidth : V.body.clientWidth}px)` : "";
        const was = cur; setTimeout(() => { V.sheet.style.transition = ""; V.sheet.style.transform = ""; if (sw && cur === was) V.sheet.style.opacity = 0; }, 200);   // (hidden until the next drawing is in, unless it is in already)
        if (sw){ pan = null; lastTap = null; setTimeout(() => cur.swipe(dx < 0 ? 1 : -1, true), 120); return; } }
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
    let down = null; V.body.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; }, true);
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
      const i = PdfView.nearest(V.boxes, (x - q.left) / q.width * 1e4, (y - q.top) / q.height * 1e4); return i >= 0 ? V.refsEl.children[i] : null; };
    let hv = null; V.body.addEventListener("mousemove", e => { const a = refAt(e.clientX, e.clientY); if (a === hv) return;
      if (hv) hv.classList.remove("hv"); hv = a; if (a) a.classList.add("hv"); V.body.classList.toggle("on-ref", !!a); });
    V.body.addEventListener("click", e => {
      if (!e.target.closest || !e.target.closest(".sp-pick")) pickClose(); else return;
      const sel = getSelection(); if (sel && !sel.isCollapsed && String(sel).trim() && V.body.contains(sel.anchorNode)) return;   // (finishing a text selection on the sheet, not a tap; one elsewhere doesn't count)
      const a = refAt(e.clientX, e.clientY);
      if (!a && TR && !desk() && (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 8) && trNear(e.clientX, e.clientY)){ trOpen(); return; }
      if (!a || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8)) return;
      const r = V.pageRefs[+a.dataset.i]; if (!r || !cur.onRef) return;
      a.classList.add("hit"); setTimeout(() => a.classList.remove("hit"), 400);
      // the red arrow on what was tapped, kept with this view (back here shows where you were)
      const bx = V.boxes[+a.dataset.i]; if (bx){ V.tap = { page: V.page, l: bx[0] / 1e4, t: bx[1] / 1e4, w: bx[2] / 1e4, h: bx[3] / 1e4 }; drawTap(); const me = REG.get(curId); if (me){ me.snap = state(); me.tap = V.tap; } }
      if (!desk() && r[6] === "line" && /-PID-/.test(cur.number || "")){ const me = cur, gi = V.refs.indexOf(r);
        if (TR && TR.k === gi && TR.n === cur.number){ trOpen(); return; }
        linesFor(cur.number).then(D => { if (cur !== me) return; if (D[gi]) trace(gi, null, bx); else cur.onRef(r[5], "tag", r[7], bx || null); }); return; }
      if (!desk() && r[6] === "d") trPend = { at: Date.now() };
      if (r[6] === "q") pick(r[5].split("|"), e.clientX, e.clientY); else cur.onRef(r[5], r[6] === "d" ? "dwg" : r[6] === "s" ? "sp" : "tag", r[7], bx || null);
    });
    tb.querySelector(".sp-trx").onclick = () => trEnd();
    const zs = tz.querySelector(".sp-trz"), zSave = () => { try { localStorage.setItem("kcgm_trz", zs.value); } catch (x) {} trView(); };
    zs.oninput = zSave; tz.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { zs.value = Math.max(0, Math.min(100, +zs.value + +b.dataset.z)); zSave(); });
    tb.querySelector(".sp-tro").onclick = () => trOpen();
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
    V.el.hidden = false; document.body.classList.add("sp-on"); dock();
    { const cb = V.el.querySelector(".sp-lg"), c = cur.corner; cb.hidden = !c; if (c){ cb.innerHTML = c.html; cb.title = c.title || ""; cb.style.top = (V.body.offsetTop + 10) + "px"; } } V.el.querySelector(".sp-tt").textContent = cur.title || "";
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
        V.bg.width = im.width; V.bg.height = im.height; V.bg.getContext("2d").drawImage(im, 0, 0); V.hi.style.visibility = "hidden"; V.msg.hidden = true; V.ox = V.oy = 0; slide(); cxFit(); V.sheet.style.opacity = ""; };
      im.src = `${cur.url.split("?")[0]}.p${pn}.png`; });
    let d; try { d = await getDoc(cur.url); } catch (e) { V.msg.textContent = "Couldn't load the PDF (" + e.message + "). Check the connection."; return; }
    V.msg.hidden = true; V.el.querySelector(".sp-pages").hidden = d.numPages < 2;
    V.zoom = 1; await go(cur.page);
    const r = cur.restore; if (r && cur === me){ quiet(); V.zoom = r.zoom; layout(false); V.body.scrollLeft = r.sl; V.body.scrollTop = r.st; sharp(); }
    if (cur === me && REG.get(curId) && !REG.get(curId).snap){ REG.get(curId).snap = state(); REG.get(curId).at = REG.get(curId).snap; }
    if (!o._pop && cur.back != null) arrive(me); else trPend = null;
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
    const v = REG.get(curId); if (v){ v.tap = V.tap; v.snap = state(); v.at = v.snap; }
    trArrive(me, me.back);
  }
  // the place tapped or found: a highlighted box on it (no arrow), grown a little round the tag like the search boxes
  function arrowAt(h, cls){ const vp = V.pg.getViewport({ rotation: V.rot || 0, scale: 1 }), [l, t, w, hh] = PdfView.grow(h.l * 1e4, h.t * 1e4, h.w * 1e4, h.h * 1e4, vp.width / vp.height);
    return `<i class="sp-hb sp-hbon ${cls || ""}" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${hh / 100}%"></i>`; }
  function drawTap(){ if (!V.tapEl) return; const on = V.tap && V.pg && V.tap.page === V.page ? [V.tap, ...(V.tap.more || [])] : [];
    // a place that has its own tag box (a checked sheet) is already shown by that box turning blue: no second box on it
    const own = h => V.refs.some(r => { if (r[0] !== V.page) return false; const [l, t, w, hh] = boxOf(r).map(x => x / 1e4);
      return h.l < l + w && h.l + h.w > l && h.t < t + hh && h.t + h.h > t; });
    V.tapEl.innerHTML = on.filter(h => !own(h)).map(h => arrowAt(h, "on")).join("");
    // (and those own boxes are marked instead, ribbon shaped where the ribbon is known)
    if (V.refsEl && V.boxes) [...V.refsEl.children].forEach((a, i) => { const b = V.boxes[i]; if (!b) return; const [l, t, w, hh] = b.map(x => x / 1e4);
      a.classList.toggle("tp", on.some(h => h.l < l + w && h.l + h.w > l && h.t < t + hh && h.t + h.h > t)); });
 }
  // ---------- line trace (phone) ----------
  // A tapped line number traces its line (lines/<number>.json, tools/build_line_paths.py), in the app's theme colour. A panel comes up under the sheet with the line slider, which runs the view along the line from one end
  // to the other (a dot where you are, a stronger trail left behind like a pen's), the milestones along it (tees, valves,
  // equipment, ribbons) and Go to asset; the zoom (remembered) is an upright slider on the right. Tapping the line or its
  // number again also opens the line's page. A ribbon tapped takes the
  // trace on to the next sheet: the line that ribbon carries on lights up, the slider at the ribbon's end.
  const LN = {}; let TR = null, trPend = null;
  const linesFor = n => LN[n] || (LN[n] = fetch("lines/" + n + ".json").then(r => r.ok ? r.json() : {}).catch(() => { delete LN[n]; return {}; }));
  const trZ = () => { let v = 55; try { const x = localStorage.getItem("kcgm_trz"); if (x != null) v = +x; } catch (e) {} return v; };
  const zOf = v => Math.pow(10, v / 100);   // (slider 0 to 100: the whole sheet to ten times)
  const trPt = (x, y) => V.rot ? [1e4 - y, x] : [x, y];
  const trF = () => V.tb.querySelector(".sp-tra").value / 1000;
  function trace(k, end, box){
    Promise.resolve(LN[cur.number]).then(D => {
      const P = D && D[k]; if (!P || P.length < 2) return; const vp = V.pg.getViewport({ scale: 1 }), A = vp.width / vp.height, r = V.refs[k];
      const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot((P[i][0] - P[i - 1][0]) * A, P[i][1] - P[i - 1][1]));
      TR = { n: cur.number, k, P, L, page: r[0], label: String(r[5]).split("|")[0], r, box, m: (D.m && D.m[k]) || [] };
      // where the slider starts: the end by the ribbon arrived through, else the point of the line beside its number
      let f = 0;
      if (end){ const d = q => Math.hypot((q[0] - end[0]) * A, q[1] - end[1]); f = d(P[P.length - 1]) < d(P[0]) ? 1 : 0; }
      else { const cx = r[1] + r[3] / 2, cy = r[2] + r[4] / 2; let best = 1e18;
        for (let i = 1; i < P.length; i++){ const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = (x1 - x0) * A, dy = y1 - y0, ll = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((cx - x0) * A * dx + (cy - y0) * dy) / ll)), e = ((x0 + t * (x1 - x0) - cx) * A) ** 2 + (y0 + t * (y1 - y0) - cy) ** 2;
          if (e < best){ best = e; f = (L[i - 1] + t * (L[i] - L[i - 1])) / (L[L.length - 1] || 1); } } }
      TR.f0 = f;
      const tb = V.tb; tb.querySelector(".sp-trn").textContent = TR.label; V.tz.querySelector(".sp-trz").value = trZ(); tb.querySelector(".sp-tra").value = Math.round(f * 1000);
      // (the panel kept above the phone's gesture strip, the swipe along the bottom that switches apps: 64 of the screen's
      // own points up, however large the app's text size makes a CSS pixel; 40 px at the default size)
      { const z = Math.min(screen.width, screen.height) / Math.min(innerWidth, innerHeight) || 1.6; tb.style.setProperty("--gb", Math.max(40, Math.round(64 / z)) + "px"); }
      tb.hidden = false; V.tz.hidden = false; V.el.classList.add("tracing"); cxFit(); trMarks(); trView();
    });
  }
  // the milestones along the Line slider: a tick across the track for everything the line passes, named under it where
  // there is room (two rows); what is at each end named under the ends
  const TK = { t: "tee", v: "valve", i: "instrument", e: "equipment", r: "continues", l: "next line", s: "end" };
  const short = t => String(t || "").replace(/^\d+-(?=\d{4}-)/, "");
  function trName(m, end){ const t = m[2] || "";
    if (m[1] === "t") return t ? "tee " + short(t) : "tee";
    if (m[1] === "r") return (end ? (m[0] < .5 ? "from " : "to ") : "") + t.replace(/^2000-/, "").replace(/-PID-PR-/, " ");
    if (m[1] === "l") return (end ? "spec break " : "→ ") + short(t);
    if (m[1] === "s") return "end";
    return t.replace(/\s+/g, ""); }
  function trMarks(){ const c = V.tb.querySelector(".sp-trc"), W = c.offsetWidth || 180, rows = [[], []], cw = 5.3;
    const pr = m => ({ r: 0, l: 1, e: 2, t: 3, v: 4, i: 5, s: 6 })[m[1]] ?? 7;
    const endOf = lo => { const E = TR.m.filter(m => lo ? m[0] <= .02 : m[0] >= .98).sort((a, b) => pr(a) - pr(b)); return E[0] ? trName(E[0], true) : "end"; };
    V.tb.querySelector(".sp-tre .s").textContent = endOf(true); V.tb.querySelector(".sp-tre .e").textContent = endOf(false);
    const mid = TR.m.filter(m => m[0] > .02 && m[0] < .98), named = [];
    [...mid].sort((a, b) => pr(a) - pr(b)).forEach(m => { const nm = trName(m), w = nm.length * cw + 4, x = m[0] * W, rr = [x - w / 2, x + w / 2];
      if (rr[0] < 0 || rr[1] > W) return; const row = rows.findIndex(R => !R.some(q => q[0] < rr[1] + 4 && rr[0] < q[1] + 4)); if (row < 0) return; rows[row].push(rr); named.push([m, row, nm]); });
    c.innerHTML = mid.map(m => `<i class="k-${m[1]}" style="left:${(m[0] * 100).toFixed(1)}%" title="${esc(TK[m[1]] + (m[2] ? " " + m[2] : ""))}"></i>`).join("")
      + named.map(([m, row, nm]) => `<b class="k-${m[1]} r${row}" style="left:${(m[0] * 100).toFixed(1)}%">${esc(nm)}</b>`).join("");
    V.tb.classList.toggle("two", rows[1].length > 0); }
  function trFill(){ [V.tb.querySelector(".sp-tra"), V.tz.querySelector(".sp-trz")].forEach(i => i.style.setProperty("--p", (i.value - i.min) / (i.max - i.min) * 100 + "%")); }
  function trAt(f){ const { P, L } = TR, s = f * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < s) i++;
    const t = L[i] > L[i - 1] ? (s - L[i - 1]) / (L[i] - L[i - 1]) : 0; return [P[i - 1][0] + t * (P[i][0] - P[i - 1][0]), P[i - 1][1] + t * (P[i][1] - P[i - 1][1]), i]; }
  // the part of the path between two fractions along it
  function trSub(a, b){ const [xa, ya, ia] = trAt(a), [xb, yb, ib] = trAt(b); return [[xa, ya], ...TR.P.slice(ia, ib), [xb, yb]]; }
  function trView(){ if (!TR) return; const tb = V.tb, f = trF();
    tb.querySelector(".sp-trp").textContent = Math.round(f * 100) + "%"; trFill();
    V.zoom = Math.max(1, Math.min(10, zOf(+V.tz.querySelector(".sp-trz").value))); V.ox = V.oy = 0; V.sheet.style.left = V.sheet.style.top = ""; layout(false);
    const [x, y] = trPt(...trAt(f)); centreOn(x / 1e4, y / 1e4); sharp(); drawTrace(); settleSoon(); }
  // the trail: only the part of the line between where the trace started (the line number, or the ribbon arrived
  // through) and where you are now, like a pen's; the dot where you are (twice the trail's width across). In the sheet's own
  // points, so the dot stays round; the line widths are screen pixels, thin when the whole sheet shows, a little more close up
  function drawTrace(){ if (!V || !V.trl) return; const on = TR && cur && TR.n === cur.number && TR.page === V.page && V.pg;
    if (!on){ V.trl.innerHTML = ""; return; }
    const vp = V.pg.getViewport({ scale: 1, rotation: V.rot || 0 }), W = vp.width, H = vp.height, s = V.base * V.zoom, w = Math.max(4, Math.min(9, 3.2 * s)), tw = w * 1.35;
    const pts = P => P.map(q => { const [x, y] = trPt(q[0], q[1]); return (x / 1e4 * W).toFixed(1) + "," + (y / 1e4 * H).toFixed(1); }).join(" ");
    const f = trF(), [dx, dy] = trPt(...trAt(f)).map((v, i) => v / 1e4 * (i ? H : W));
    V.trl.setAttribute("viewBox", `0 0 ${W} ${H}`); V.trl.style.setProperty("--trw", w + "px");
    V.trl.innerHTML = `${Math.abs(f - TR.f0) > 1e-4 ? `<polyline class="tr" points="${pts(trSub(Math.min(f, TR.f0), Math.max(f, TR.f0)))}"/>` : ""}<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${(tw / s).toFixed(2)}"/>`; }
  // a tap on the traced line itself (within 12 px of it)
  function trNear(x, y){ if (!TR || TR.page !== V.page) return false; const q = V.sheet.getBoundingClientRect(); if (!q.width) return false;
    const P = TR.P.map(p => { const [a, b] = trPt(p[0], p[1]); return [q.left + a / 1e4 * q.width, q.top + b / 1e4 * q.height]; });
    for (let i = 1; i < P.length; i++){ const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = x1 - x0, dy = y1 - y0, ll = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / ll));
      if (Math.hypot(x0 + t * dx - x, y0 + t * dy - y) < 12) return true; } return false; }
  function trOpen(){ if (!TR || !cur.onRef) return; const r = TR.r, b = TR.box; trEnd(); cur.onRef(r[5], "tag", r[7], b || null); }
  function trEnd(){ if (!TR && V.tb.hidden) return; TR = null; V.tb.hidden = true; V.tz.hidden = true; V.el.classList.remove("tracing"); drawTrace(); cxFit(); }
  // arrived through a ribbon tapped on the phone: the line that ribbon carries on, traced from the ribbon's end
  function trArrive(me, back){ if (!trPend || Date.now() - trPend.at > 15000 || desk()) return; trPend = null;
    linesFor(me.number).then(D => { if (cur !== me || !D.rb) return; const j = [].concat(back).find(j => D.rb[j] != null); if (j == null) return;
      const rb = V.refs[j], k = +D.rb[j]; if (!rb || !D[k]) return;
      const b = boxOf(V.refs[k]); V.tap = Object.assign({}, V.tap || {}, { more: [].concat((V.tap && V.tap.more) || [], [{ page: V.page, l: b[0] / 1e4, t: b[1] / 1e4, w: b[2] / 1e4, h: b[3] / 1e4 }]) }); drawTap();
      trace(k, [rb[1] + rb[3] / 2, rb[2] + rb[4] / 2], [b[0] / 1e4, b[1] / 1e4, b[2] / 1e4, b[3] / 1e4]); }); }
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
    hideOwnHits(); drawTap(); drawTrace();
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
    await picsP; V.pg = await d.getPage(n); V.pgFor = cur; V.body.scrollTo(0, 0); V.size(); layout(true); V.sheet.style.opacity = "";
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
  function cxFit(){
    if (!V || !V.cx) return; const c = V.cx; V.el.classList.toggle("cx-on", false); V.el.querySelectorAll(".sp-arw").forEach(a => a.hidden = true);
    if (!cur || !cur.panel || desk() || V.el.hidden || V.zoom > 1.001 || V.rot || TR || V.el.classList.contains("typing")){ c.hidden = true; return; }
    const e = V.el.getBoundingClientRect(), sb = V.sheet.getBoundingClientRect().bottom; let lim = V.body.getBoundingClientRect().bottom;
    V.el.querySelectorAll(".sp-top").forEach(t => { const r = t.getBoundingClientRect(); if (r.height && r.top > e.top + e.height / 2) lim = Math.min(lim, r.top); });
    const room = lim - sb - 14; if (room < 120){ c.hidden = true; return; }
    c.style.top = Math.round(sb - e.top + 6) + "px"; c.style.height = Math.round(room) + "px";
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
    z = Math.max(1, Math.min(cur.fit === "page" ? 24 : 10, z)); if (!V.pg || Math.abs(z - V.zoom) < .001) return;
    const r = V.body.getBoundingClientRect(); cx = cx == null ? r.left + r.width / 2 : cx; cy = cy == null ? r.top + r.height / 2 : cy;
    // the point under (cx, cy) as a fraction of the page stays under it (measured from the page itself, so the body's padding doesn't matter)
    const q = V.sheet.getBoundingClientRect(), fx = fx0 != null ? fx0 : (cx - q.left) / q.width, fy = fy0 != null ? fy0 : (cy - q.top) / q.height;
    V.zoom = z; layout(false);
    const q2 = V.sheet.getBoundingClientRect(); V.body.scrollLeft += q2.left + fx * q2.width - cx; V.body.scrollTop += q2.top + fy * q2.height - cy;
    // while the sheet is still smaller than the window one way it can't scroll that way: it slides instead (inside the
    // window), so the point under the cursor stays under it from the first step of zoom, not only once the sheet overflows
    const q3 = V.sheet.getBoundingClientRect(); V.ox = (V.ox || 0) + cx - (q3.left + fx * q3.width); V.oy = (V.oy || 0) + cy - (q3.top + fy * q3.height); slide();
    sharp(); settleSoon();
  }
  // the sheet's slide (V.ox, V.oy): lets the page sit off centre (or past the window's edge) so a zoom keeps the point
  // under the cursor where it is; the page always covers the middle of the window, and at fit it is centred again
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
  return { open, close, hide, back, fwd, canFwd, came, state, getDoc, grow, ribbon, nearest, arrows,
    saved: () => { try { return JSON.parse(sessionStorage.getItem(SSK) || "null"); } catch (e) { return null; } },
    // a tag picked from the list under the sheet: zoomed to and marked by its box (pid-refs.json), else found in the text
    find: t => { if (!V || !cur) return; fitFilter(t, true); if (V.fmatch.length){ V.fstep = -1; fitStep(1); return; } fitFilter(""); findText(t, true); }, panelOn: () => !!(V && V.cx && !V.cx.hidden && !V.el.hidden), clearMark: () => { if (V){ V.marks.innerHTML = ""; V.hits = []; V.el.querySelector(".sp-finds").hidden = true; } if (cur) cur.find = null; } };
})();
