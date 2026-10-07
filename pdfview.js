// In-app PDF viewer shared by the pipe and valve spec (spec.js) and the P&IDs (pid.js).
// PdfView.open({ url, page, title, number, fit: "width" | "page", find, download, name, refs, onRef, restore, back })
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
      <div class="sp-body"><div class="sp-sheet"><canvas class="sp-bg"></canvas><canvas class="sp-hi"></canvas><div class="sp-refs"></div><div class="sp-marks"></div><div class="sp-tap"></div><div class="sp-text textLayer"></div><div class="sp-dn"></div></div></div><div class="sp-msg"></div>
      <button class="sp-ze" data-a="fit" title="Zoom extents (whole sheet)"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>`;
    document.body.appendChild(el);
    V = { el, body: el.querySelector(".sp-body"), sheet: el.querySelector(".sp-sheet"), bg: el.querySelector(".sp-bg"), hi: el.querySelector(".sp-hi"), marks: el.querySelector(".sp-marks"),
      msg: el.querySelector(".sp-msg"), refsEl: el.querySelector(".sp-refs"), tapEl: el.querySelector(".sp-tap"), textEl: el.querySelector(".sp-text"), refs: [], page: 1, zoom: 1, pg: null, base: 1, hits: [], fi: 0 };
    el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({ prev: () => go(V.page - 1), next: () => go(V.page + 1), in: () => zoomTo(V.zoom * 1.5), out: () => zoomTo(V.zoom / 1.5), fit: () => zoomTo(1),
      fprev: () => V.fit ? fitStep(-1) : showHit(V.fi - 1, -1), fnext: () => V.fit ? fitStep(1) : showHit(V.fi + 1, 1), rot, close,
      find: () => { const on = !el.classList.contains("find-on"); el.classList.toggle("find-on", on); const q = el.querySelector(".sp-q"); if (on){ q.focus(); q.select(); } else q.blur(); }, back: () => history.back(), fwd: () => history.forward() })[b.dataset.a]());
    // find: Ctrl+F / ⌘F while a drawing is open searches its text (the page is a picture, so the browser's own find can't)
    const q = el.querySelector(".sp-q"); let qt;
    // phone: while typing (keyboard up) only the find box and its count show, so the drawing keeps the rest of the screen
    q.addEventListener("focus", () => el.classList.add("typing")); q.addEventListener("blur", () => el.classList.remove("typing"));
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
      if (v) restore(st.id); else if (!el.hidden) close(true); });
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
    const panFrom = e => { cancelAnimationFrame(glide); pan = { x: e.clientX, y: e.clientY, sl: V.body.scrollLeft, st: V.body.scrollTop, vx: 0, vy: 0, t: performance.now(), lx: e.clientX, ly: e.clientY }; };
    V.body.addEventListener("pointerdown", e => { if (e.pointerType === "touch" && pts.size === 0) panFrom(e); });
    V.body.addEventListener("pointerdown", e => { pts.set(e.pointerId, e); if (pts.size === 2){ pan = null; const [a, b] = [...pts.values()]; pin = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: V.zoom, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, f: 1 }; } });
    V.body.addEventListener("pointermove", e => { if (!pan || e.pointerType !== "touch" || pts.size !== 1 || !pts.has(e.pointerId)) return;
      V.body.scrollLeft = pan.sl - (e.clientX - pan.x); V.body.scrollTop = pan.st - (e.clientY - pan.y);
      const now = performance.now(), dt = Math.max(1, now - pan.t); pan.vx = .8 * (e.clientX - pan.lx) / dt + .2 * pan.vx; pan.vy = .8 * (e.clientY - pan.ly) / dt + .2 * pan.vy; pan.t = now; pan.lx = e.clientX; pan.ly = e.clientY; });
    V.body.addEventListener("pointermove", e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e); if (pin && pts.size === 2){ const [a, b] = [...pts.values()]; pin.f = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pin.d;
      if (!pin.o){ const q = V.sheet.getBoundingClientRect(); pin.o = `${pin.cx - q.left}px ${pin.cy - q.top}px`; } V.sheet.style.transformOrigin = pin.o; V.sheet.style.transform = `scale(${pin.f})`; } });
    const up = e => { pts.delete(e.pointerId); if (pin && pts.size < 2){ const p = pin; pin = null; V.sheet.style.transform = ""; zoomTo(p.z * p.f, p.cx, p.cy); }
      if (e.pointerType !== "touch") return;
      if (pts.size === 1){ panFrom([...pts.values()][0]); return; }   // a pinch ends with one finger still down: it carries on panning
      if (pts.size || !pan) return; const g = pan; pan = null;
      if (e.type === "pointercancel" || performance.now() - g.t > 80) return;   // a finger that stopped before lifting: no glide
      let vx = g.vx, vy = g.vy, t0 = performance.now();
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
    const md = document.createElement("div"); md.className = "sp-mode"; md.innerHTML = `<button type="button" data-m="hand" title="Pan: drag the drawing">${HAND}</button><button type="button" data-m="sel" title="Select text">${ARROW}</button>`;
    el.appendChild(md); const setMode = m => { el.classList.toggle("sp-hand", m !== "sel"); md.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.m === (m === "sel" ? "sel" : "hand"))); try { localStorage.setItem("kcgm_spm", m); } catch (x) {} };
    md.onclick = e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.m); }; setMode((() => { try { return localStorage.getItem("kcgm_spm") || "hand"; } catch (x) { return "hand"; } })());
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
      const sel = getSelection(); if (sel && !sel.isCollapsed && String(sel).trim()) return;   // (finishing a text selection, not a tap)
      const a = refAt(e.clientX, e.clientY);
      if (!a || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8)) return;
      const r = V.pageRefs[+a.dataset.i]; if (!r || !cur.onRef) return;
      a.classList.add("hit"); setTimeout(() => a.classList.remove("hit"), 400);
      // the red arrow on what was tapped, kept with this view (back here shows where you were)
      const bx = V.boxes[+a.dataset.i]; if (bx){ V.tap = { page: V.page, l: bx[0] / 1e4, t: bx[1] / 1e4, w: bx[2] / 1e4, h: bx[3] / 1e4 }; drawTap(); const me = REG.get(curId); if (me){ me.snap = state(); me.tap = V.tap; } }
      if (r[6] === "q") pick(r[5].split("|"), e.clientX, e.clientY); else cur.onRef(r[5], r[6] === "d" ? "dwg" : "tag", r[7], bx || null);
    });
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
    ui(); freeRotate(); const wasOpen = !V.el.hidden; cur = Object.assign({ page: 1, fit: "width" }, o);
    V.el.hidden = false; document.body.classList.add("sp-on"); dock(); V.el.querySelector(".sp-tt").textContent = cur.title || "";
    // the drawing number, snug in the page's top left corner (moves with the page; the phone's title chip then leaves it out)
    V.el.querySelector(".sp-dn").textContent = cur.number || "";
    if (cur.number && document.documentElement.classList.contains("phone")) V.el.querySelector(".sp-tt").textContent = (cur.title || "").replace(cur.number, "").replace(/^\s*·\s*/, "").trim() || cur.number;
    const dl = V.el.querySelector(".sp-dl"); dl.href = cur.url; dl.download = cur.download || cur.url.split("/").pop();
    // a new view entry, unless this open is a step back / forward through the history
    if (!o._pop){ const was = curId && REG.get(curId), st0 = state(); if (was && st0 && wasOpen) was.snap = st0; push({ o, snap: null }); }
    // refs: the references printed on the sheet ([page, left, top, width, height, target, kind] in 1/10000 of the sheet,
    // a promise), each a tappable box; onRef(target, kind) acts on a tap.
    V.sheet.classList.add("sp-wait"); V.refs = []; V.refsEl.innerHTML = ""; pickClose(); V.tap = o._pop && o._tap || null; V.tapEl.innerHTML = "";
    V.fit = false; V.fq = ""; V.fset = new Set(); V.fmatch = []; V.fstep = -2;
    // (the boxes are laid out once this document's page is in: until then V.pg is the last one's, or none)
    const me = cur; if (cur.refs) Promise.resolve(cur.refs).then(a => new Promise(ok => V.pgFor === me ? ok(a) : (V.afterPage = () => ok(a)))).then(a => { if (cur !== me) return; V.refs = a || [];
      V.fit = V.refs.some(r => typeof r[7] === "string");
      // opened for an item (cur.find): on a checked sheet that item's labels stay red with the arrow, the rest grey
      if (V.fit && cur.find){ V.marks.innerHTML = ""; V.hits = []; fitFilter(cur.find, true); const m = V.fmatch.find(r => r[0] === V.page) || V.fmatch[0];
        if (m && !o._pop && cur.back == null){ const [l, t, w, h] = boxOf(m); V.tap = { page: m[0], l: l / 1e4, t: t / 1e4, w: w / 1e4, h: h / 1e4 }; drawTap(); } }
      else drawRefs(); });
    V.marks.innerHTML = ""; V.hits = []; V.el.querySelector(".sp-finds").hidden = true;
    V.el.querySelector(".sp-q").value = cur.find || "";
    V.msg.textContent = "Loading…"; V.msg.hidden = false;
    // the sheet's picture straight away, sized to the window, while the PDF itself loads behind it
    picsP.then(() => { if (cur !== me || V.pgFor === me) return; const pn = cur.page || 1, key = cur.url.replace(/^\.\//, "").split("?")[0];
      if (!(PICS && PICS[key] >= pn)) return; const im = new Image(); im.decoding = "async";
      im.onload = () => { if (cur !== me || V.pgFor === me) return; const cs = getComputedStyle(V.body), W = V.body.clientWidth - 16, H = V.body.clientHeight - 16 - Math.max(0, (parseFloat(cs.paddingTop) || 0) - 8);
        const k = cur.fit === "page" ? Math.min(W / im.width, H / im.height) : W / im.width; V.sheet.style.width = Math.round(im.width * k) + "px"; V.sheet.style.height = Math.round(im.height * k) + "px";
        V.bg.width = im.width; V.bg.height = im.height; V.bg.getContext("2d").drawImage(im, 0, 0); V.hi.style.visibility = "hidden"; V.msg.hidden = true; V.ox = V.oy = 0; slide(); };
      im.src = `${cur.url.split("?")[0]}.p${pn}.png`; });
    let d; try { d = await getDoc(cur.url); } catch (e) { V.msg.textContent = "Couldn't load the PDF (" + e.message + "). Check the connection."; return; }
    V.msg.hidden = true; V.el.querySelector(".sp-pages").hidden = d.numPages < 2;
    V.zoom = 1; await go(cur.page);
    const r = cur.restore; if (r && cur === me){ quiet(); V.zoom = r.zoom; layout(false); V.body.scrollLeft = r.sl; V.body.scrollTop = r.st; sharp(); }
    if (cur === me && REG.get(curId) && !REG.get(curId).snap){ REG.get(curId).snap = state(); REG.get(curId).at = REG.get(curId).snap; }
    if (!o._pop && cur.back != null) arrive(me);
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
    const h = bs[0]; quiet();
    // phone: the sheet opens small, so zoom in until the ribbon is about a quarter of the screen wide
    if (document.documentElement.classList.contains("phone")){ const z = Math.min(6, V.zoom * V.body.clientWidth * .25 / (h.w * V.sheet.offsetWidth || 1));
      if (z > V.zoom){ V.zoom = z; layout(false); sharp(); } }
    V.body.scrollTo({ left: (h.l + h.w / 2) * V.sheet.offsetWidth - V.body.clientWidth / 2, top: (h.t + h.h / 2) * V.sheet.offsetHeight - V.body.clientHeight / 2 });
    const v = REG.get(curId); if (v){ v.tap = V.tap; v.snap = state(); v.at = v.snap; }
  }
  // the place tapped or found: a highlighted box on it (no arrow), grown a little round the tag like the search boxes
  function arrowAt(h, cls){ const vp = V.pg.getViewport({ rotation: V.rot || 0, scale: 1 }), [l, t, w, hh] = PdfView.grow(h.l * 1e4, h.t * 1e4, h.w * 1e4, h.h * 1e4, vp.width / vp.height);
    return `<i class="sp-hb sp-hbon ${cls || ""}" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${hh / 100}%"></i>`; }
  function drawTap(){ if (!V.tapEl) return; const on = V.tap && V.pg && V.tap.page === V.page ? [V.tap, ...(V.tap.more || [])] : [];
    // a place that has its own tag box (a checked sheet) is already shown by that box turning blue: no second box on it
    const own = h => V.refs.some(r => { if (r[0] !== V.page) return false; const [l, t, w, hh] = boxOf(r).map(x => x / 1e4);
      return h.l < l + w && h.l + h.w > l && h.t < t + hh && h.t + h.h > t; });
    V.tapEl.innerHTML = on.filter(h => !own(h)).map(h => arrowAt(h, "on")).join("");
 }
  // ---------- view history ----------
  const REG = new Map(); let curId = 0, seq = 0, hush = 0, st8 = null;
  const quiet = () => { hush = Date.now() + 500; };   // (moves made by a restore are not new views)
  function push(v){
    // a new step drops the views ahead of it, as the browser does
    const me = REG.get(curId); if (me) [...REG.keys()].forEach(k => { if (REG.get(k).seq > me.seq) REG.delete(k); });
    const id = ++seq; v.seq = id; v.depth = 1; REG.set(id, v); curId = id;
    // one browser history step for the whole visit: the phone's swipe back (or the browser's Back) leaves the viewer and
    // returns to the page as it was; drawings and views within the visit step back with the app's ← (PdfView.back)
    if (history.state && history.state.sp && !V.el.hidden) history.replaceState({ sp: 1, id }, ""); else history.pushState({ sp: 1, id }, ""); fwdBtn();
  }
  const fwdBtn = () => { const me = REG.get(curId), b = V && V.el.querySelector(".sp-fwd"); if (b) b.disabled = !me || ![...REG.values()].some(v => v.seq > me.seq); };
  function settleSoon(){ if (!V || V.el.hidden) return; clearTimeout(st8); st8 = setTimeout(settle, 500); }
  function settle(){
    if (Date.now() < hush || !V || V.el.hidden || !V.pg) return;
    const me = REG.get(curId), s = state(); if (!me || !s) return;
    // compared with where this view started (small moves add up), not with the last small move
    if (!me.snap){ me.snap = s; me.at = s; return; } const o = me.at || me.snap;
    const big = s.page !== o.page || Math.abs(Math.log(s.zoom / o.zoom)) > Math.log(1.1) ||
      Math.abs(s.sl - o.sl) > V.body.clientWidth * .2 || Math.abs(s.st - o.st) > V.body.clientHeight * .2;
    if (big) push({ o: me.o, snap: s, at: s }); else me.snap = s;
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
  function drawRefs(){
    if (!V.pg) return;
    V.pageRefs = V.refs.filter(r => r[0] === V.page && r[6] !== "x");
    V.boxes = V.pageRefs.map(boxOf);
    // a checked sheet (tools/refs_cv.py): every label red, the ones a find leaves out grey; bubbles round
    V.refsEl.innerHTML = V.pageRefs.map((r, i) => { const [l, t, w, h] = V.boxes[i];
      const cls = V.fit ? " fit" + (shape(r) === "o" ? " o" : "") + (V.fq && !V.fset.has(r) ? " off" : "") : r[6] === "d" ? " d" : "";
      return `<a class="sp-ref${cls}" data-i="${i}" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${h / 100}%" title="${esc(r[5].replace(/\|/g, ", "))}"></a>`; }).join("");
  }
  // how a ref was fitted to the print on a checked sheet: "o" bubble, "b" drawn box (both exact), "t" text (a margin added)
  const shape = r => typeof r[7] === "string" ? r[7] : V.fit && r[6] === "d" ? "t" : null;
  // a ref's box on the sheet as shown (turned with it), in 1/10000 of the sheet
  function boxOf(r){
    const vp = V.pg.getViewport({ scale: 1, rotation: V.rot || 0 }), A = vp.width / vp.height;
    let [, l, t, w, h] = r; if (V.rot) [l, t, w, h] = [1e4 - t - h, l, h, w];   // sheet turned a quarter
    return shape(r) === "o" || shape(r) === "b" ? [l, t, w, h] : PdfView.grow(l, t, w, h, A);
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
    const [l, t, w, h] = boxOf(r); quiet(); V.zoom = 4; layout(false);
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
  function close(fromPop){ if (!V || V.el.hidden) return; unrot(); V.el.hidden = true; document.body.classList.remove("sp-on"); document.documentElement.classList.remove("sp-open"); clearTimeout(st8);
    if (!fromPop && history.state && history.state.sp) history.back(); }
  // the app's ←: back one drawing within this visit (views of the same drawing are skipped); from the first, close
  function back(){ if (!V || V.el.hidden) return false; const me = REG.get(curId); if (!me) { close(); return true; }
    const prev = [...REG.values()].filter(v => v.seq < me.seq && v.o.url !== me.o.url).sort((a, b) => b.seq - a.seq)[0];
    if (!prev){ close(); return true; } const id = [...REG.entries()].find(([k, v]) => v === prev)[0];
    restore(id).then(() => history.replaceState({ sp: 1, id }, "")); return true; }
  async function go(n, fromPop){
    const d = await getDoc(cur.url); n = Math.max(1, Math.min(d.numPages, n));
    if (!fromPop && V.pg && n !== V.page){ const me = REG.get(curId); if (me) me.snap = state(); quiet(); V.page = n; push({ o: me ? me.o : cur, snap: null }); }
    V.page = n;
    V.el.querySelector(".sp-pg").textContent = `${n} / ${d.numPages}`;
    await picsP; V.pg = await d.getPage(n); V.pgFor = cur; V.body.scrollTo(0, 0); V.size(); layout(true);
    (window.requestIdleCallback || setTimeout)(() => textLayer(), { timeout: 1200 });   // (the selectable text after the picture is up)
    if (V.afterPage){ const f = V.afterPage; V.afterPage = null; f(); }
    if (cur.find) mark(cur.find); drawTap();
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
    if (V.sheet.style.width !== w || V.sheet.style.height !== h || bg){ V.hi.style.visibility = "hidden"; V.sheet.style.width = w; V.sheet.style.height = h; }
    slide(); if (bg){ V.sheet.classList.add("sp-wait"); drawBg(); drawRefs(); } sharp();   // (a new page's boxes wait for its picture)
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
  function sharp(){
    if (!V.pg) return;
    const dpr = devicePixelRatio || 1, s = V.base * V.zoom, sw = V.sheet.offsetWidth, sh = V.sheet.offsetHeight;
    if (V.picW && V.picW >= sw * dpr * .85){ hiGen++; if (hiTask) hiTask.cancel(); V.hi.style.visibility = "hidden"; return; }   // the picture is detailed enough at this zoom: no PDF drawing
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
      return `<i class="sp-hb" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${hh / 100}%"></i>`; }).join(""); drawTap();
    const f = V.el.querySelector(".sp-finds"); f.hidden = !V.hits.length;
    if (V.hits.length){ V.fi = -2; V.el.querySelector(".sp-fn").textContent = `${V.hits.length} result${V.hits.length === 1 ? "" : "s"}`; }
    else if (!quiet) toast(`${tag} isn't written as searchable text on this drawing.`);
  }
  function samePlace(o, b){ const h = Math.max(o[3] - o[1], b[3] - b[1]), ov = !(b[0] > o[2] || b[2] < o[0] || b[1] > o[3] || b[3] < o[1]);
    return ov || Math.hypot((o[0] + o[2] - b[0] - b[2]) / 2, (o[1] + o[3] - b[1] - b[3]) / 2) < h * 1.5; }
  function pulse(k){ [...V.marks.children].forEach((m, i) => m.classList.toggle("on", i === k)); }
  // scroll so a sheet point (fractions) sits in the middle of what can be seen: above the phone's find box and buttons
  function centreOn(fx, fy){
    let bottom = V.body.getBoundingClientRect().bottom; const r0 = V.body.getBoundingClientRect();
    if (document.documentElement.classList.contains("phone")) V.el.querySelectorAll(".sp-q, .sp-top").forEach(e => { const r = e.getBoundingClientRect(); if (r.height && getComputedStyle(e).display !== "none" && r.top > r0.top + r0.height / 3) bottom = Math.min(bottom, r.top); });
    V.body.scrollLeft = fx * V.sheet.offsetWidth - V.body.clientWidth / 2; V.body.scrollTop = fy * V.sheet.offsetHeight - (bottom - r0.top) / 2;
  }
  // step through the matches: the first Enter shows the whole sheet with all of them; each one after jumps straight
  // (no slide) to the next at four times the whole-sheet zoom with the arrow above it
  function showHit(k, dir){
    if (!V.hits.length) return; const n = V.hits.length;
    if (V.fi === -2){ V.fi = -1; quiet(); V.zoom = 1; layout(false); V.body.scrollTo(0, 0); sharp(); V.tap = null; drawTap(); return; }
    V.fi = V.fi < 0 ? (dir < 0 ? n - 1 : 0) : (k + n) % n; const h = V.hits[V.fi];
    V.el.querySelector(".sp-fn").textContent = `${V.fi + 1} of ${n}`; pulse(V.fi);
    quiet(); V.zoom = 4; layout(false);
    centreOn(h.l + h.w / 2, h.t + h.h / 2); sharp();
    V.tap = { page: V.page, l: h.l, t: h.t, w: h.w, h: h.h }; drawTap(); settleSoon();
  }
  let tt; function toast(m){ let t = V.el.querySelector(".sp-toast"); if (!t){ t = document.createElement("div"); t.className = "sp-toast"; V.el.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 3500); }

  // a reference's tap box, grown: 25% of the text height added on every side (height +50%), the same margin (in
  // screen terms) on the width. Boxes in 1/10000 of the sheet; A = sheet width / height.
  const grow = (l, t, w, h, A) => { const m = .25 * Math.min(h, w * A); return [l - m / A, t - m, w + 2 * m / A, h + 2 * m]; };
  // of the boxes holding a point, the one whose centre is nearest (-1: none)
  const nearest = (B, x, y) => { let k = -1, d = 1e18; B.forEach(([l, t, w, h], i) => { if (x < l || x > l + w || y < t || y > t + h) return;
      const e = (x - l - w / 2) ** 2 + (y - t - h / 2) ** 2; if (e < d){ d = e; k = i; } }); return k; };
  return { open, close, back, state, getDoc, grow, nearest, clearMark: () => { if (V){ V.marks.innerHTML = ""; V.hits = []; V.el.querySelector(".sp-finds").hidden = true; } if (cur) cur.find = null; } };
})();
