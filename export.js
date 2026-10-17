// Export tab (desktop): a work scope from one asset to another as a PDF. The plant's lines as one map (routes.json,
// tools/build_routes.py): the route between the two assets is the cheapest run of joined lines; the P&IDs it crosses are
// copied out of their own PDFs (vector, as issued) in the order the route reaches them, the route drawn on each in its
// fluid colour, after a cover page listing the assets, the lines and the sheets. Where two routes are nearly as good
// (rare), a drop-down picks between them.
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (window.Tabs) Tabs.mount({ active: "export" });
  let G = null, adj = null, EF = null, tags = [], pick = { A: null, B: null }, routes = [], cur = null;
  const LN = {}, lines = s => LN[s] || (LN[s] = fetch("lines/" + s + ".json").then(r => r.json()));
  const ready = fetch("routes.json").then(r => r.json()).then(g => { G = g; adj = G.n.map(() => []); EF = new Map();
    G.e.forEach(([a, fa, b, fb, w]) => { adj[a].push([b, w]); adj[b].push([a, w]); EF.set(a + "," + b, [fa, fb]); EF.set(b + "," + a, [fb, fa]); });
    tags = Object.keys(G.a).sort(); });

  // ---- picking the assets: type, a list of matches, pick one ----
  function suggest(which){ const inp = $("ex" + which), sg = $("sg" + which), q = inp.value.trim().toUpperCase().replace(/\s+/g, "");
    if (!G || q.length < 2){ sg.hidden = true; return; }
    const st = [], ct = []; for (const t of tags){ const u = t.toUpperCase(); if (u.startsWith(q)) st.push(t); else if (u.includes(q)) ct.push(t); if (st.length > 30) break; }
    const L = st.concat(ct).slice(0, 14);
    sg.innerHTML = L.length ? L.map((t, i) => { const sh = [...new Set(G.a[t].map(([n]) => G.n[n][0].replace(/^2000-/, "")))];
      return `<button type="button" data-t="${esc(t)}"${i === 0 ? ' class="hi"' : ""}><b>${esc(t)}</b><em>${esc(sh.slice(0, 2).join(", "))}${sh.length > 2 ? " …" : ""}</em></button>`; }).join("")
      : `<button type="button" disabled><em style="margin:0">Not on any traced line</em></button>`;
    sg.hidden = false; }
  function choose(which, t){ pick[which] = t; const inp = $("ex" + which); inp.value = t; inp.classList.add("ok"); $("sg" + which).hidden = true; route(); }
  ["A", "B"].forEach(w => { const inp = $("ex" + w), sg = $("sg" + w);
    inp.addEventListener("input", () => { pick[w] = null; inp.classList.remove("ok"); ready.then(() => suggest(w)); route(); });
    inp.addEventListener("focus", () => ready.then(() => suggest(w)));
    inp.addEventListener("blur", () => setTimeout(() => sg.hidden = true, 150));
    inp.addEventListener("keydown", e => { const bs = [...sg.querySelectorAll("button[data-t]")], i = bs.findIndex(b => b.classList.contains("hi"));
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); if (!bs.length) return; const j = (i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length; bs.forEach((b, k) => b.classList.toggle("hi", k === j)); bs[j].scrollIntoView({ block: "nearest" }); }
      if (e.key === "Enter"){ e.preventDefault(); const b = bs[Math.max(0, i)]; if (b) choose(w, b.dataset.t); else if (G && G.a[inp.value.trim()]) choose(w, inp.value.trim()); } });
    sg.addEventListener("mousedown", e => { const b = e.target.closest("button[data-t]"); if (b){ e.preventDefault(); choose(w, b.dataset.t); } }); });

  // ---- the route: cheapest run of joined lines from any line the start asset is on to any the end asset is on ----
  function dijkstra(S, T, pen){ const d = new Map(), prev = new Map(), done = new Set(), Q = [];
    const push = (c, u) => { Q.push([c, u]); let i = Q.length - 1; while (i > 0){ const p = (i - 1) >> 1; if (Q[p][0] <= Q[i][0]) break; [Q[p], Q[i]] = [Q[i], Q[p]]; i = p; } };
    const pop = () => { const top = Q[0], last = Q.pop(); if (Q.length){ Q[0] = last; let i = 0; for (;;){ const l = 2 * i + 1, r = l + 1; let m = i; if (l < Q.length && Q[l][0] < Q[m][0]) m = l; if (r < Q.length && Q[r][0] < Q[m][0]) m = r; if (m === i) break; [Q[m], Q[i]] = [Q[i], Q[m]]; i = m; } } return top; };
    S.forEach(s => { d.set(s, 0); push(0, s); });
    while (Q.length){ const [c, u] = pop(); if (done.has(u)) continue; done.add(u);
      if (T.has(u)){ const p = [u]; while (prev.has(p[p.length - 1])) p.push(prev.get(p[p.length - 1])); return { cost: c, path: p.reverse() }; }
      for (const [v, w] of adj[u]){ const c2 = c + w * (pen && pen.has(v) ? 4 : 1); if (c2 < (d.has(v) ? d.get(v) : 1e18)){ d.set(v, c2); prev.set(v, u); push(c2, v); } } }
    return null; }
  const realCost = p => p.slice(1).reduce((s, v, i) => s + Math.min(...adj[p[i]].filter(([x]) => x === v).map(([, w]) => w)), 0);
  function findRoutes(a, b){ const S = new Set(G.a[a].map(([n]) => n)), T = new Set(G.a[b].map(([n]) => n)), out = [];
    const r1 = dijkstra(S, T); if (!r1) return out; out.push(r1);
    // (another nearly as cheap, through at least one line the first does not use: offered in the drop-down)
    const pen = new Set(r1.path);
    for (let k = 0; k < 2; k++){ const r = dijkstra(S, T, pen); if (!r) break; const c = realCost(r.path);
      const sig = r.path.filter(x => !out.some(o => o.path.includes(x)));
      if (sig.length && c <= r1.cost * 1.6 + 2 && !out.some(o => o.path.join() === r.path.join())){ out.push({ cost: c, path: r.path }); r.path.forEach(x => pen.add(x)); } else break; }
    return out; }
  // each line on the route: from where the route comes onto it to where it leaves (fractions along it)
  function legs(path, a, b){ const fa = (G.a[a].find(([n]) => n === path[0]) || [, -1])[1], fb = (G.a[b].find(([n]) => n === path[path.length - 1]) || [, -1])[1];
    return path.map((n, i) => { let f0 = i ? EF.get(path[i - 1] + "," + n)[1] : fa, f1 = i < path.length - 1 ? EF.get(n + "," + path[i + 1])[0] : fb;
      if (f0 < 0 && f1 < 0){ f0 = 0; f1 = 1; } else if (f0 < 0) f0 = f1 < .5 ? 1 : 0; else if (f1 < 0) f1 = f0 < .5 ? 1 : 0;
      return { n, f0, f1 }; }); }
  const fluid = n => { const [s, k, lab] = G.n[n]; return /-MECH-/.test(lab) ? "MECH" : String(lab).split("-")[2] || ""; };
  const colour = n => fluid(n) === "MECH" ? G.mech : G.flc[fluid(n)] || "#e11d48";
  const sheets = L => { const o = []; L.forEach(l => { const s = G.n[l.n][0] + "|" + G.n[l.n][3]; if (!o.includes(s)) o.push(s); }); return o; };

  function route(){ routes = []; cur = null; $("exRw").hidden = true; $("exSum").hidden = true; $("exGo").disabled = true;
    if (!pick.A || !pick.B){ $("exPv").innerHTML = `<div class="ex-empty">The sheets on the route show here.</div>`; return; }
    if (pick.A === pick.B){ $("exMsg").textContent = "Pick two different assets."; return; }
    routes = findRoutes(pick.A, pick.B);
    if (!routes.length){ $("exMsg").textContent = `No traced connection between ${pick.A} and ${pick.B}. They may not be joined by pipe, or the join runs through a sheet the app has not traced.`; $("exPv").innerHTML = `<div class="ex-empty">No route found.</div>`; return; }
    if (routes.length > 1){ const base = new Set(routes[0].path);
      $("exR").innerHTML = routes.map((r, i) => { const L = legs(r.path, pick.A, pick.B), via = r.path.map(n => G.n[n][2]).find((l, j) => l && !base.has(r.path[j]));
        return `<option value="${i}">Route ${i + 1}${i ? " via " + esc(via || "another line") : " (shortest)"}: ${new Set(L.map(l => G.n[l.n][2])).size} lines, ${sheets(L).length} sheets</option>`; }).join("");
      $("exRw").hidden = false; }
    show(0); }
  $("exR").onchange = () => show(+$("exR").value);

  async function show(i){ const r = routes[i]; cur = legs(r.path, pick.A, pick.B); const L = cur;
    // the list: each line once, in order, with its sheet
    const seen = new Set(); $("exLs").innerHTML = L.filter(l => { const k = G.n[l.n][2] + G.n[l.n][0]; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(l => { const [s, k, lab] = G.n[l.n]; return `<li><i style="background:${colour(l.n)}"></i><b>${esc(lab || "(unnumbered)")}</b><span class="sh">${esc(s.replace(/^2000-/, ""))}</span></li>`; }).join("");
    $("exSum").hidden = false; $("exGo").disabled = false;
    const sh = sheets(L); $("exMsg").textContent = `${sh.length} sheet${sh.length > 1 ? "s" : ""} on the route. The PDF opens with a cover page, then each sheet in the order the route reaches it.`;
    // the sheets: each drawing's picture with the route drawn on it
    const pv = $("exPv"); pv.innerHTML = "";
    for (const key of sh){ const [s, pg] = key.split("|"), t = G.t[s], D = await lines(s); if (cur !== L) return;
      const segs = L.filter(l => G.n[l.n][0] === s && String(G.n[l.n][3]) === pg).map(l => ({ l, c: colour(l.n), P: part(D[G.n[l.n][1]], l.f0, l.f1, s, pg) }));
      const marks = [], g0 = segs.find(g => g.l === L[0]), g1 = segs.find(g => g.l === L[L.length - 1]);   // (start green, end red)
      if (g0) marks.push([g0.P[0], "#16a34a"]); if (g1) marks.push([g1.P[g1.P.length - 1], "#dc2626"]);
      const box = document.createElement("div"); box.className = "ex-sheet";
      box.innerHTML = `<h3>${esc(s)}<span>${esc(t[1])}${t[2] ? " · Rev " + esc(t[2]) : ""}</span></h3><div class="ex-pic"><img src="${esc(t[0])}.p${pg}.png" alt=""><svg viewBox="0 0 10000 10000" preserveAspectRatio="none">`
        + segs.map(g => `<polyline points="${g.P.map(q => q.join(",")).join(" ")}" style="stroke:${g.c}"/>`).join("")
        + marks.filter(m => m[0]).map(([q, c]) => `<circle cx="${q[0]}" cy="${q[1]}" r="45" style="fill:${c}"/>`).join("") + `</svg></div>`;
      pv.appendChild(box); } }
  // the stretch of a line between two fractions along it (path in 1/10000 of the sheet; lengths on the sheet's own shape)
  function part(P, a, b, s, pg){ const x = G.x[s][pg], W = Math.hypot(x[0], x[1]), H = Math.hypot(x[2], x[3]), L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot((P[i][0] - P[i - 1][0]) * W, (P[i][1] - P[i - 1][1]) * H));
    const tot = L[L.length - 1] || 1, at = f => { const d = f * tot; for (let i = 1; i < P.length; i++) if (L[i] >= d || i === P.length - 1){ const t = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1); return [P[i - 1][0] + t * (P[i][0] - P[i - 1][0]), P[i - 1][1] + t * (P[i][1] - P[i - 1][1])]; } };
    const lo = Math.min(a, b), hi = Math.max(a, b), out = [at(lo)].concat(P.filter((q, i) => L[i] / tot > lo && L[i] / tot < hi), [at(hi)]);
    return a <= b ? out : out.reverse(); }

  // ---- the PDF: a cover page, then each sheet copied from its own PDF with the route drawn over it ----
  $("exGo").onclick = async () => { if (!cur) return; const L = cur, go = $("exGo"), bar = $("exBar"), set = f => bar.firstChild.style.width = Math.round(f * 100) + "%";
    go.disabled = true; bar.hidden = false; set(0);
    try { const { PDFDocument, StandardFonts, rgb, LineCapStyle } = PDFLib, out = await PDFDocument.create(), F = await out.embedFont(StandardFonts.Helvetica), FB = await out.embedFont(StandardFonts.HelveticaBold);
      const hex = h => { const v = parseInt(h.slice(1), 16); return rgb((v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255); };
      const sh = sheets(L), seen = new Set(), rows = L.filter(l => { const k = G.n[l.n][2] + G.n[l.n][0]; if (seen.has(k)) return false; seen.add(k); return true; });
      // cover (A3 across), carried on to more pages if the lists run long
      let pg = out.addPage([1190.55, 841.89]), y = 780; const day = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      const line = (t, x, s, f, c) => pg.drawText(String(t), { x, y, size: s, font: f || F, color: c || rgb(.12, .15, .2) });
      const room = h => { if (y - h < 50){ pg = out.addPage([1190.55, 841.89]); y = 780; } };
      line("Work scope", 50, 30, FB); y -= 34; line(`${pick.A}  to  ${pick.B}`, 50, 18, FB, rgb(.2, .3, .45)); y -= 22; line(`Exported ${day} from Project Library. Route lines highlighted in their fluid colours.`, 50, 11, F, rgb(.4, .45, .5)); y -= 40;
      line("Lines on the route", 50, 14, FB); y -= 22;
      rows.forEach((l, i) => { room(18); const [s, k, lab] = G.n[l.n]; pg.drawRectangle({ x: 50, y: y - 1, width: 26, height: 7, color: hex(colour(l.n)) });
        line(`${i + 1}.`, 84, 11); line(lab || "(unnumbered)", 108, 11, FB); line(fluid(l.n), 400, 11); line(s, 480, 11, F, rgb(.35, .4, .45)); y -= 17; });
      y -= 22; room(40); line("Sheets", 50, 14, FB); y -= 22;
      sh.forEach((key, i) => { room(18); const [s] = key.split("|"), t = G.t[s]; line(`${i + 1}.`, 50, 11); line(s, 74, 11, FB); line(`Rev ${t[2] || "-"}`, 290, 11); line(t[1] || "", 350, 11, F, rgb(.35, .4, .45)); y -= 17; });
      // each sheet
      for (let si = 0; si < sh.length; si++){ const [s, p] = sh[si].split("|"), t = G.t[s], D = await lines(s);
        const src = await PDFDocument.load(await fetch(t[0]).then(r => r.arrayBuffer()), { ignoreEncryption: true }), [page] = await out.copyPages(src, [+p - 1]); out.addPage(page);
        const x = G.x[s][p], to = q => ({ x: x[0] * q[0] / 1e4 + x[2] * q[1] / 1e4 + x[4], y: x[1] * q[0] / 1e4 + x[3] * q[1] / 1e4 + x[5] }), th = Math.max(3, Math.hypot(x[0], x[1]) / 300);
        const mine = L.filter(l => G.n[l.n][0] === s && String(G.n[l.n][3]) === p);
        mine.forEach(l => { const P = part(D[G.n[l.n][1]], l.f0, l.f1, s, p).map(to), c = hex(colour(l.n));
          for (let i = 1; i < P.length; i++) page.drawLine({ start: P[i - 1], end: P[i], thickness: th, color: c, opacity: .55, lineCap: LineCapStyle.Round }); });
        // (start and end marked where they are on this sheet)
        const ends = [[L[0], "f0", "START", rgb(.09, .64, .29)], [L[L.length - 1], "f1", "END", rgb(.86, .15, .15)]];
        ends.forEach(([l, f, txt, c]) => { if (!mine.includes(l)) return; const q = to(part(D[G.n[l.n][1]], l[f], l[f], s, p)[0]);
          page.drawCircle({ x: q.x, y: q.y, size: th * 2.2, color: c, borderColor: rgb(1, 1, 1), borderWidth: 1 });
          page.drawText(txt, { x: q.x + th * 2.8, y: q.y + th * 1.5, size: Math.max(8, th * 3), font: FB, color: c, rotate: page.getRotation() }); });
        set((si + 1) / sh.length); }
      const blob = new Blob([await out.save()], { type: "application/pdf" }), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `Work scope ${pick.A} to ${pick.B}.pdf`.replace(/[\\/:*?"<>|]/g, "-"); document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      $("exMsg").textContent = `Saved: ${sh.length} sheet${sh.length > 1 ? "s" : ""} and the cover page.`; }
    catch (e){ $("exMsg").textContent = "The export did not finish: " + (e && e.message || e) + ". A drawing may not be downloaded on this device yet, so try again with signal."; }
    finally { go.disabled = false; setTimeout(() => bar.hidden = true, 1500); } };
})();
