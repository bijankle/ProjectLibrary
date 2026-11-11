// Tables share their width by what keeps them shortest. The browser on its own gives each column a share by its longest
// cell, so narrowing the panel can squeeze one wordy column (Masking) into a tall thin strip while its neighbour
// (Operator response) keeps room to spare. Here every table is measured (each cell's text at its own font, and its
// longest word, which is as narrow as a column can go) and its width handed out a step at a time to the column that
// shortens the table most: the sum over the rows of its tallest cell. Redone when a table appears, its content changes
// or its box changes width. The widths go in a <colgroup data-fit>; a table that fits on one line per cell is left as the
// browser lays it out. A table marked .nofit is left alone. Big tables are measured on their first 300 rows.
(() => {
  if (window.TableFit) return;
  const CV = document.createElement("canvas").getContext("2d"), MAXR = 300;
  const M = new WeakMap();   // table -> {w: the width it was fitted to, sig: its content's size when measured, m: measurements}
  const tw = (s, font) => { if (CV.font !== font) CV.font = font; return CV.measureText(s).width; };
  const rowsOf = t => { const out = []; for (const sec of t.tHead ? [t.tHead, ...t.tBodies] : t.tBodies.length ? t.tBodies : [t]) for (const r of sec.rows || []) { if (out.length >= MAXR) return out; out.push(r); } return out; };
  function measure(t){
    const rows = rowsOf(t); let n = 0;
    for (const r of rows) { let c = 0; for (const td of r.cells) c += td.colSpan; if ([...r.cells].every(td => td.colSpan === 1)) n = Math.max(n, c); }
    if (n < 2) return null;
    const col = Array.from({ length: n }, () => ({ mn: 0, mx: 0, nw: false })), cells = [];   // cells: [row][col] = text lines widths
    const styled = new Map();   // (one style read per column and kind of cell: the font, padding and whether it wraps)
    const st = (td, i) => { const k = td.tagName + i; if (styled.has(k)) return styled.get(k);
      const cs = getComputedStyle(td), nw = /nowrap|pre$/.test(cs.whiteSpace) || td.classList.contains("lk-nw") || !!td.querySelector(".lk-nw");
      const s = { font: cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, pad: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2, nw }; styled.set(k, s); return s; };
    for (const r of rows) {
      if (r.cells.length !== n || [...r.cells].some(td => td.colSpan !== 1)) continue;
      const line = [];
      [...r.cells].forEach((td, i) => {
        const s = st(td, i), txt = (td.innerText || td.textContent || "").split("\n").map(x => x.trim()).filter(Boolean);
        const ws = txt.map(x => tw(x, s.font)); const full = Math.max(0, ...ws) + s.pad;
        let mn = s.nw ? full : 0;
        if (!s.nw) for (const x of txt) for (const w of x.split(/\s+/)) mn = Math.max(mn, tw(w, s.font) + s.pad);
        const c = col[i]; c.mn = Math.max(c.mn, mn); c.mx = Math.max(c.mx, full); c.pad = s.pad;
        line.push(s.nw ? [] : ws);
      });
      cells.push(line);
    }
    return { col, cells };
  }
  function fit(t){
    if (!t.isConnected || t.classList.contains("nofit")) return;
    const box = t.parentElement; if (!box) return;
    const W = Math.floor(box.clientWidth - (parseFloat(getComputedStyle(box).paddingLeft) || 0) - (parseFloat(getComputedStyle(box).paddingRight) || 0));
    if (W < 60) return;
    const sig = t.rows.length + ":" + (t.textContent || "").length; let st = M.get(t);
    if (!st || st.sig !== sig) { st = { sig, w: -1, m: measure(t) }; M.set(t, st); }
    if (st.w === W) return; st.w = W;
    const old = t.querySelector(":scope > colgroup[data-fit]");
    const m = st.m; if (!m) { if (old) old.remove(); return; }
    const { col, cells } = m, n = col.length;
    const sumMx = col.reduce((a, c) => a + c.mx, 0), sumMn = col.reduce((a, c) => a + c.mn, 0);
    if (sumMx <= W || sumMn >= W) { if (old) old.remove(); return; }   // (all on one line already; or as narrow as it goes: the browser's way)
    const w = col.map(c => c.mn); let left = W - sumMn; const step = Math.max(3, left / 80);
    const lines = (ws, wi, pad) => { let s = 0; for (const x of ws) s += Math.max(1, x / Math.max(1, wi - pad)); return s || 1; };
    const L = cells.map(r => r.map((ws, i) => lines(ws, w[i], col[i].pad)));
    const cost = () => { let s = 0; for (const r of L) { let mx = 0, tot = 0; for (const v of r) { mx = Math.max(mx, v); tot += v; } s += mx + tot * .02; } return s; };
    let base = cost();
    while (left > 0.5) {
      const d = Math.min(step, left); let best = -1, bestC = base;
      for (let i = 0; i < n; i++) {
        if (w[i] >= col[i].mx) continue;
        const wi = Math.min(col[i].mx, w[i] + d), keep = L.map(r => r[i]);
        L.forEach((r, k) => r[i] = lines(cells[k][i], wi, col[i].pad)); const c = cost();
        L.forEach((r, k) => r[i] = keep[k]);
        if (c < bestC - 1e-9 || best < 0 && c <= bestC) { best = i; bestC = c; }
      }
      if (best < 0) break;
      const wi = Math.min(col[best].mx, w[best] + d); left -= wi - w[best]; w[best] = wi;
      L.forEach((r, k) => r[best] = lines(cells[k][best], wi, col[best].pad)); base = bestC;
    }
    if (left > 0.5) { const free = w.map((x, i) => col[i].mx - x).map(x => Math.max(0, x)), tf = free.reduce((a, b) => a + b, 0);   // (room over: to the ones short of one line)
      if (tf > 0) w.forEach((x, i) => w[i] += left * free[i] / tf); }
    const cg = old || document.createElement("colgroup"); cg.setAttribute("data-fit", "");
    cg.innerHTML = w.map(x => `<col style="width:${Math.round(x)}px">`).join("");
    if (!old) t.insertBefore(cg, t.firstChild);
  }
  // ---- when: a table added or changed, or its box resized ----
  const RO = new ResizeObserver(es => { for (const e of es) e.target.querySelectorAll(":scope > table, :scope > * > table").forEach(fit); });
  const seen = new WeakSet(); let q = new Set(), raf = 0;
  const flush = () => { raf = 0; const s = q; q = new Set(); s.forEach(t => { if (t.parentElement && !seen.has(t.parentElement)) { seen.add(t.parentElement); RO.observe(t.parentElement); } fit(t); }); };
  const want = t => { q.add(t); if (!raf) raf = requestAnimationFrame(flush); };
  const scan = n => { if (n.nodeType !== 1) return; if (n.tagName === "TABLE") want(n); else if (n.firstElementChild) n.querySelectorAll("table").forEach(want); };
  new MutationObserver(ms => { for (const m of ms) { m.addedNodes.forEach(scan); const up = m.target.closest && m.target.closest("table"); if (up) want(up); } })
    .observe(document.documentElement, { childList: true, subtree: true });
  const start = () => document.querySelectorAll("table").forEach(want);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.TableFit = { fit: t => { M.delete(t); fit(t); } };
})();
