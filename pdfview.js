// In-app PDF viewer shared by the pipe and valve spec (spec.js) and the P&IDs (pid.js).
// PdfView.open({ url, page, title, fit: "width" | "page", find, download, name, refs, onRef, back, onBack, restore })
//   The visible part of the page is redrawn from the PDF's own vectors at every zoom, so it stays sharp.
//   find: a tag to mark on the page (a line number, valve, instrument…). The mark stays until another document or
//   another search is opened; spaces, hyphens and slashes are ignored and a tag split over several text pieces is found.
// PDF.js is bundled in vendor/pdfjs and loaded on first use.
window.PdfView = (() => {
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
    el.innerHTML = `<div class="sp-top"><button class="sp-back" data-a="back" title="Back to the last drawing" hidden>←</button><b class="sp-tt"></b><div class="sp-nav sp-pages"><button data-a="prev" title="Previous page">◀</button><span class="sp-pg"></span><button data-a="next" title="Next page">▶</button></div>
      <input class="sp-q" type="search" placeholder="Find in this drawing (Ctrl+F)" aria-label="Find in this drawing" autocomplete="off" spellcheck="false">
      <div class="sp-nav sp-finds" hidden><button data-a="fprev" title="Previous match">‹</button><span class="sp-fn"></span><button data-a="fnext" title="Next match">›</button></div>
      <div class="sp-nav"><button data-a="out" title="Zoom out">−</button><button data-a="fit" title="Fit">⤢</button><button data-a="in" title="Zoom in">+</button></div>
      <button class="sp-rot" data-a="rot" title="Turn to landscape / back">⟲</button><a class="sp-dl" title="Download this PDF">Download</a><button class="sp-x" data-a="close" title="Close">✕</button></div>
      <div class="sp-body"><div class="sp-sheet"><canvas class="sp-bg"></canvas><canvas class="sp-hi"></canvas><div class="sp-marks"></div><div class="sp-refs"></div></div></div><div class="sp-msg"></div>`;
    document.body.appendChild(el);
    V = { el, body: el.querySelector(".sp-body"), sheet: el.querySelector(".sp-sheet"), bg: el.querySelector(".sp-bg"), hi: el.querySelector(".sp-hi"), marks: el.querySelector(".sp-marks"),
      msg: el.querySelector(".sp-msg"), refsEl: el.querySelector(".sp-refs"), refs: [], page: 1, zoom: 1, pg: null, base: 1, hits: [], fi: 0 };
    el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({ prev: () => go(V.page - 1), next: () => go(V.page + 1), in: () => zoomTo(V.zoom * 1.5), out: () => zoomTo(V.zoom / 1.5), fit: () => zoomTo(1),
      fprev: () => showHit(V.fi - 1), fnext: () => showHit(V.fi + 1), rot, close, back: () => cur.onBack && cur.onBack() })[b.dataset.a]());
    // find: Ctrl+F / ⌘F while a drawing is open searches its text (the page is a picture, so the browser's own find can't)
    const q = el.querySelector(".sp-q"); let qt;
    q.addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => findText(q.value), 350); });
    q.addEventListener("keydown", e => { e.stopPropagation();
      if (e.key === "Enter"){ e.preventDefault(); clearTimeout(qt); if (V.hits.length && norm(q.value) === norm(cur.find || "")) showHit(V.fi + (e.shiftKey ? -1 : 1)); else findText(q.value); }
      if (e.key === "Escape"){ q.value = ""; q.blur(); } });
    addEventListener("keydown", e => { if (el.hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f"){ e.preventDefault(); q.focus(); q.select(); return; }
      if (e.key === "Escape") close(); if (e.key === "ArrowRight" && V.zoom === 1) go(V.page + 1); if (e.key === "ArrowLeft" && V.zoom === 1) go(V.page - 1); });
    addEventListener("popstate", () => { if (!el.hidden) close(true); });
    // rotating the phone: refit the sheet once the new size has settled (keeps the zoom level)
    // (only a real size change: the browser bar sliding in and out while panning must not redraw everything)
    let rt, lastW = 0, lastH = 0; const refit = () => { clearTimeout(rt); rt = setTimeout(() => { if (el.hidden) return; const w = V.body.clientWidth, h = V.body.clientHeight;
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 120) return; lastW = w; lastH = h; layout(true); }, 250); };
    V.size = () => { lastW = V.body.clientWidth; lastH = V.body.clientHeight; };
    addEventListener("resize", refit); if (screen.orientation) screen.orientation.addEventListener("change", refit);
    let t; V.body.addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(sharp, 70); });
    V.body.addEventListener("wheel", e => { if (!e.ctrlKey && cur.fit !== "page") return; e.preventDefault(); zoomTo(V.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0025)), e.clientX, e.clientY); }, { passive: false });
    // touch pinch: scale the sheet while pinching, redraw sharp when the fingers lift
    const pts = new Map(); let pin = null;
    V.body.addEventListener("pointerdown", e => { pts.set(e.pointerId, e); if (pts.size === 2){ const [a, b] = [...pts.values()]; pin = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: V.zoom, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, f: 1 }; } });
    V.body.addEventListener("pointermove", e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e); if (pin && pts.size === 2){ const [a, b] = [...pts.values()]; pin.f = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pin.d;
      const r = V.body.getBoundingClientRect(); V.sheet.style.transformOrigin = `${pin.cx - r.left + V.body.scrollLeft}px ${pin.cy - r.top + V.body.scrollTop}px`; V.sheet.style.transform = `scale(${pin.f})`; } });
    const up = e => { pts.delete(e.pointerId); if (pin && pts.size < 2){ const p = pin; pin = null; V.sheet.style.transform = ""; zoomTo(p.z * p.f, p.cx, p.cy); } };
    V.body.addEventListener("pointerup", up); V.body.addEventListener("pointercancel", up);
    // mouse drag pans a drawing
    let dr = null;
    V.body.addEventListener("mousedown", e => { if (e.button) return; dr = { x: e.clientX, y: e.clientY, l: V.body.scrollLeft, t: V.body.scrollTop }; V.body.classList.add("drag"); });
    addEventListener("mousemove", e => { if (!dr) return; V.body.scrollLeft = dr.l - (e.clientX - dr.x); V.body.scrollTop = dr.t - (e.clientY - dr.y); });
    addEventListener("mouseup", () => { dr = null; V.body.classList.remove("drag"); });
    V.body.style.touchAction = "pan-x pan-y";
    let down = null; V.body.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; }, true);
    V.body.addEventListener("click", e => {
      let a = e.target.closest && e.target.closest(".sp-ref"); if (!e.target.closest || !e.target.closest(".sp-pick")) pickClose();
      if (a && V.boxes){ const q = V.refsEl.getBoundingClientRect(), i = PdfView.nearest(V.boxes, (e.clientX - q.left) / q.width * 1e4, (e.clientY - q.top) / q.height * 1e4);
        if (i >= 0) a = V.refsEl.children[i] || a; }
      if (!a || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8)) return;
      const r = V.pageRefs[+a.dataset.i]; if (!r || !cur.onRef) return;
      a.classList.add("hit"); setTimeout(() => a.classList.remove("hit"), 400);
      if (r[6] === "q") pick(r[5].split("|"), e.clientX, e.clientY); else cur.onRef(r[5], r[6] === "d" ? "dwg" : "tag");
    });
    return V;
  }

  // Let the phone turn with the viewer open, whatever the installed app was set to (older installs are locked to
  // portrait until the phone refreshes the app's settings). "any" follows the phone's sensor; closing puts it back.
  let freed = false;
  function freeRotate(){ const so = screen.orientation; if (!so || !so.lock || freed) return; so.lock("any").then(() => freed = true).catch(() => {}); }
  async function open(o){
    ui(); freeRotate(); cur = Object.assign({ page: 1, fit: "width" }, o);
    V.el.hidden = false; document.body.classList.add("sp-on"); V.el.querySelector(".sp-tt").textContent = cur.title || "";
    const dl = V.el.querySelector(".sp-dl"); dl.href = cur.url; dl.download = cur.download || cur.url.split("/").pop();
    if (!(history.state && history.state.sp)) history.pushState({ sp: 1 }, "");
    // refs: the references printed on the sheet ([page, left, top, width, height, target, kind] in 1/10000 of the sheet,
    // a promise), each a tappable box; onRef(target, kind) acts on a tap. back: show ← (onBack returns to the last sheet).
    V.el.querySelector(".sp-back").hidden = !cur.back; V.refs = []; V.refsEl.innerHTML = ""; pickClose();
    const me = cur; if (cur.refs) Promise.resolve(cur.refs).then(a => { if (cur !== me) return; V.refs = a || []; drawRefs(); });
    V.marks.innerHTML = ""; V.hits = []; V.el.querySelector(".sp-finds").hidden = true;
    V.el.querySelector(".sp-q").value = cur.find || "";
    V.msg.textContent = "Loading…"; V.msg.hidden = false;
    let d; try { d = await getDoc(cur.url); } catch (e) { V.msg.textContent = "Couldn't load the PDF (" + e.message + "). Check the connection."; return; }
    V.msg.hidden = true; V.el.querySelector(".sp-pages").hidden = d.numPages < 2;
    V.zoom = 1; await go(cur.page);
    const r = cur.restore; if (r && cur === me){ V.zoom = r.zoom; layout(false); V.body.scrollLeft = r.sl; V.body.scrollTop = r.st; sharp(); }
  }
  // where the reader is on the sheet, to come back to it (Back)
  const state = () => V && V.pg ? { page: V.page, zoom: V.zoom, sl: V.body.scrollLeft, st: V.body.scrollTop } : null;
  function drawRefs(){
    if (!V.pg) return;
    V.pageRefs = V.refs.filter(r => r[0] === V.page);
    const vp = V.pg.getViewport({ scale: 1, rotation: V.rot || 0 }), A = vp.width / vp.height;
    V.boxes = [];
    V.refsEl.innerHTML = V.pageRefs.map((r, i) => { let [, l, t, w, h] = r; if (V.rot) [l, t, w, h] = [1e4 - t - h, l, h, w];   // sheet turned a quarter
      [l, t, w, h] = PdfView.grow(l, t, w, h, A); V.boxes.push([l, t, w, h]);
      return `<a class="sp-ref${r[6] === "d" ? " d" : ""}" data-i="${i}" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${h / 100}%" title="${esc(r[5].replace(/\|/g, ", "))}"></a>`; }).join("");
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
      rotated = false; V.rot = V.rot ? 0 : 90; V.zoom = 1; layout(true); V.body.scrollTo(0, 0);
      if (cur.find) mark(cur.find);
      if (V.rot) toast("Drawing turned: hold the phone sideways. Tap ⟲ again to turn it back.");
    }
  }
  async function unrot(){ if (V) V.rot = 0; if (freed){ freed = false; try { screen.orientation.unlock(); } catch (e) {} } if (!rotated) return; rotated = false; try { screen.orientation.unlock(); } catch (e) {} try { if (document.fullscreenElement && !matchMedia("(display-mode: fullscreen)").matches) await document.exitFullscreen(); } catch (e) {} }
  function close(fromPop){ if (!V || V.el.hidden) return; unrot(); V.el.hidden = true; document.body.classList.remove("sp-on"); if (!fromPop && history.state && history.state.sp) history.back(); }
  async function go(n){
    const d = await getDoc(cur.url); n = Math.max(1, Math.min(d.numPages, n)); V.page = n;
    V.el.querySelector(".sp-pg").textContent = `${n} / ${d.numPages}`;
    V.pg = await d.getPage(n); V.body.scrollTo(0, 0); V.size(); layout(true);
    if (cur.find) mark(cur.find);
  }
  // zoom 1 fits the page width (spec) or the whole sheet (drawings)
  function layout(bg){
    if (!V.pg) return;
    const vp1 = V.pg.getViewport({ rotation: V.rot || 0, scale: 1 }), W = V.body.clientWidth - 16, H = V.body.clientHeight - 16;
    V.base = Math.max(.05, cur.fit === "page" ? Math.min(W / vp1.width, H / vp1.height) : W / vp1.width); const s = V.base * V.zoom;
    const w = Math.round(vp1.width * s) + "px", h = Math.round(vp1.height * s) + "px";
    // the sharp layer no longer matches a new size: hide it (the background layer stretches) until its redraw is ready
    if (V.sheet.style.width !== w || V.sheet.style.height !== h || bg){ V.hi.style.visibility = "hidden"; V.sheet.style.width = w; V.sheet.style.height = h; }
    if (bg){ drawBg(); drawRefs(); } sharp();
  }
  // Both layers draw off screen and are swapped in whole when finished, so nothing blanks or jumps while panning.
  let bgTask = null, hiTask = null, bgGen = 0, hiGen = 0;
  function drawBg(){
    const dpr = Math.min(2, devicePixelRatio || 1), vp = V.pg.getViewport({ rotation: V.rot || 0, scale: V.base * dpr * (cur.fit === "page" ? 1.5 : 1) });
    const off = document.createElement("canvas"), g = ++bgGen; off.width = vp.width; off.height = vp.height;
    if (bgTask) bgTask.cancel(); bgTask = V.pg.render({ canvasContext: off.getContext("2d"), viewport: vp });
    bgTask.promise.then(() => { if (g !== bgGen) return; V.bg.width = off.width; V.bg.height = off.height; V.bg.getContext("2d").drawImage(off, 0, 0); }).catch(() => {});
  }
  function sharp(){
    if (!V.pg) return;
    const dpr = devicePixelRatio || 1, s = V.base * V.zoom, sw = V.sheet.offsetWidth, sh = V.sheet.offsetHeight;
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
  function zoomTo(z, cx, cy){
    z = Math.max(1, Math.min(cur.fit === "page" ? 24 : 10, z)); if (!V.pg || Math.abs(z - V.zoom) < .001) return;
    const r = V.body.getBoundingClientRect(); cx = cx == null ? r.left + r.width / 2 : cx; cy = cy == null ? r.top + r.height / 2 : cy;
    const fx = (V.body.scrollLeft + cx - r.left - 8) / V.sheet.offsetWidth, fy = (V.body.scrollTop + cy - r.top - 8) / V.sheet.offsetHeight;
    V.zoom = z; layout(false);
    V.body.scrollLeft = fx * V.sheet.offsetWidth - (cx - r.left - 8); V.body.scrollTop = fy * V.sheet.offsetHeight - (cy - r.top - 8); sharp();
  }

  // ---------- mark a tag on the page ----------
  // find typed text: this page first, then the other sheets of the document (the first sheet with it opens)
  let fgen = 0;
  async function findText(t){
    const g = ++fgen; t = String(t || "").trim();
    if (norm(t).length < 3){ cur.find = null; V.marks.innerHTML = ""; V.hits = []; V.el.querySelector(".sp-finds").hidden = true; return; }
    cur.find = t; await mark(t, true); if (g !== fgen || V.hits.length) return;
    const d = await getDoc(cur.url), want = norm(t);
    for (let p = 1; p <= d.numPages; p++){ if (p === V.page) continue;
      const tc = await (await d.getPage(p)).getTextContent(); if (g !== fgen) return;
      if (norm(tc.items.map(i => i.str).join("")).includes(want)){ await go(p); return; } }
    toast(`“${t}” isn't in the searchable text of this drawing.`);
  }
  async function mark(tag, quiet){
    const want = norm(tag); if (want.length < 3) return;
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
    // drop duplicates (the same place found from overlapping starts)
    const uniq = hits.filter((b, k) => !hits.slice(0, k).some(o => Math.abs(o[0] - b[0]) < 2 && Math.abs(o[1] - b[1]) < 2));
    V.hits = uniq.map(b => { const [x1, y1, x2, y2] = vp.convertToViewportRectangle(b); return { l: Math.min(x1, x2) / W, t: Math.min(y1, y2) / H, w: Math.abs(x2 - x1) / W, h: Math.abs(y2 - y1) / H }; });
    V.marks.innerHTML = V.hits.map(h => `<i style="left:${h.l * 100}%;top:${h.t * 100}%;width:${h.w * 100}%;height:${h.h * 100}%"></i>`).join("");
    const f = V.el.querySelector(".sp-finds"); f.hidden = !V.hits.length;
    if (V.hits.length){ V.fi = 0; V.el.querySelector(".sp-fn").textContent = `${tag}: 1 / ${V.hits.length}`; pulse(0); }
    else if (!quiet) toast(`${tag} isn't written as searchable text on this drawing.`);
  }
  function pulse(k){ [...V.marks.children].forEach((m, i) => m.classList.toggle("on", i === k)); }
  function showHit(k){   // step through the matches, bringing each into view without changing the zoom
    if (!V.hits.length) return; V.fi = (k + V.hits.length) % V.hits.length; const h = V.hits[V.fi];
    V.el.querySelector(".sp-fn").textContent = `${cur.find}: ${V.fi + 1} / ${V.hits.length}`; pulse(V.fi);
    V.body.scrollTo({ left: (h.l + h.w / 2) * V.sheet.offsetWidth - V.body.clientWidth / 2, top: (h.t + h.h / 2) * V.sheet.offsetHeight - V.body.clientHeight / 2, behavior: "smooth" });
  }
  let tt; function toast(m){ let t = V.el.querySelector(".sp-toast"); if (!t){ t = document.createElement("div"); t.className = "sp-toast"; V.el.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 3500); }

  // a reference's tap box, grown: 25% of the text height added on every side (height +50%), the same margin (in
  // screen terms) on the width. Boxes in 1/10000 of the sheet; A = sheet width / height.
  const grow = (l, t, w, h, A) => { const m = .25 * Math.min(h, w * A); return [l - m / A, t - m, w + 2 * m / A, h + 2 * m]; };
  // of the boxes holding a point, the one whose centre is nearest (-1: none)
  const nearest = (B, x, y) => { let k = -1, d = 1e18; B.forEach(([l, t, w, h], i) => { if (x < l || x > l + w || y < t || y > t + h) return;
      const e = (x - l - w / 2) ** 2 + (y - t - h / 2) ** 2; if (e < d){ d = e; k = i; } }); return k; };
  return { open, close, state, getDoc, grow, nearest, clearMark: () => { if (V){ V.marks.innerHTML = ""; V.hits = []; V.el.querySelector(".sp-finds").hidden = true; } if (cur) cur.find = null; } };
})();
