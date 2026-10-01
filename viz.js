// Asset charts: the desktop Assets tab's empty right side. Drawn from the same rows the Browse filter on the left
// shows (Browse calls AssetViz.update on every change), so picking Equipment → PP → F13 redraws them for just those.
// Tapping a bar applies it as the next filter step where it can (asset type, equipment code, area) or opens the item.
// Forms: headline tiles, ranked bars (one hue: the app's gold), donuts only for splits of 5 parts or fewer, each with
// its values written in the legend. Hover any mark for its figure. Desktop only (wide screen with a mouse).
window.AssetViz = (() => {
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
  function update(list, c){ ctx = Object.assign({ list }, c); draw(); }

  // ---------- an open item: its P&ID (or PFD sheet) instead of the charts ----------
  // the whole sheet fits the space with the item marked; drawing number tabs above when there are several; a click on
  // the sheet opens it full screen in the drawing viewer
  let cur = null, shown = null, hist = [], gen = 0;
  const ORD = new Intl.Collator(undefined, { numeric: true });
  const nk = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  function item(it){ cur = it; shown = null; hist = []; lastSig = ""; draw(true); if (window.Pid && !Pid.ready()) Pid.load().then(() => { if (cur === it) draw(true); }).catch(() => {}); }
  function list(){ if (!cur) return; cur = null; lastSig = ""; draw(true); }
  // a drawing's series: the sheets whose title differs only by the sheet number ("Plant air, sheet 3" → "Plant air"),
  // P&IDs with P&IDs, PFDs with PFDs, in sheet order
  const SH = /,?\s*sheet\s+(\d+)(\s+of\s+\d+)?/i;
  const series = n => { const d = Pid.info(n); if (!d || !SH.test(d.title || "")) return [n];
    const base = t => String(t || "").replace(SH, "").trim().toLowerCase(), b = base(d.title), k = /-PFD-/.test(n);
    return Pid.all().filter(x => x && SH.test(x.title || "") && base(x.title) === b && /-PFD-/.test(x.number) === k)
      .map(x => [x.number, +SH.exec(x.title)[1]]).sort((a, c) => a[1] - c[1] || a[0].localeCompare(c[0])).map(x => x[0]); };
  const sheetOf = n => { const m = SH.exec((Pid.info(n) || {}).title || ""); return m ? +m[1] : null; };
  function drawItem(){
    const g = ++gen, own = window.Lookup && Lookup.drawingsOf ? Lookup.drawingsOf(cur) : [];
    if ((!own.length && !shown) || !window.Pid || !window.PdfView){ el.innerHTML = ""; return; }
    if (!shown) shown = own[0];
    const n = shown, d = Pid.info(n) || {}, ser = series(n), go = x => { if (x === shown) return; hist.push(shown); shown = x; drawItem(); };
    // one row over the sheet: the series' sheet tabs on the left; in the middle the drawing with its description, ‹ › either
    // side and the drawings before and after it (P&IDs or PFD sheets, in number order) beyond them
    const kind = /-PFD-/.test(n) ? "-PFD-" : "-PID-", list = Pid.all().map(x => x.number).filter(x => x && x.includes(kind)).sort(ORD.compare),
      at = list.indexOf(n), prv = at > 0 ? list[at - 1] : null, nxt = at >= 0 && at < list.length - 1 ? list[at + 1] : null;
    const nb = (x, side) => x ? `<button type="button" class="vz-nb vz-${side}" data-n="${esc(x)}" title="${esc(x + " " + ((Pid.info(x) || {}).title || ""))}"><b>${esc(x)}</b><i>${esc((Pid.info(x) || {}).title || "")}</i></button>` : `<span class="vz-nb vz-${side}"></span>`;
    el.innerHTML = `<div class="vz-pv"><div class="vz-hd">` + (ser.length > 1 ? `<div class="vz-tabs">` +
      ser.map(x => `<button type="button" class="vz-tab${x === n ? " on" : ""}" data-n="${esc(x)}" title="${esc(x)}">Sheet ${sheetOf(x)}</button>`).join("") + `</div>` : "") +
      `<div class="vz-nav"><button type="button" class="vz-ar" data-n="${esc(prv || "")}"${prv ? ` title="${esc(prv)}"` : " disabled"} aria-label="Previous drawing">‹</button>` +
      `<div class="vz-cur"><b>${esc(n)}${at >= 0 ? ` <small>${at + 1} of ${list.length}</small>` : ""}</b><i>${esc(d.title || "")}</i></div>` +
      `<button type="button" class="vz-ar" data-n="${esc(nxt || "")}"${nxt ? ` title="${esc(nxt)}"` : " disabled"} aria-label="Next drawing">›</button></div></div>` +
      `<div class="vz-sheet"><div class="vz-stage"><canvas></canvas><div class="vz-mk"></div><div class="vz-rf"></div></div>` +
      `<div class="vz-zb"><button type="button" data-z="out" title="Zoom out">−</button><button type="button" data-z="fit" title="Fit">⤢</button><button type="button" data-z="in" title="Zoom in">+</button><button type="button" data-z="full" title="Full screen">⛶</button></div>` +
      `<p class="vz-note">Loading the drawing…</p></div></div>`;
    el.querySelectorAll(".vz-tab[data-n], .vz-nb[data-n], .vz-ar[data-n]").forEach(b => b.onclick = () => { if (b.dataset.n) go(b.dataset.n); });
    const box = el.querySelector(".vz-sheet"), stage = box.querySelector(".vz-stage"), cv = box.querySelector("canvas"), key = cur.key;
    let z = 1, tx = 0, ty = 0, W = 0, H = 0, page = null, sc = 1, rz = 0, rt = null;
    const apply = () => { z = Math.max(1, Math.min(10, z)); tx = Math.min(0, Math.max(W - W * z, tx)); ty = Math.min(0, Math.max(H - H * z, ty));
      stage.style.transform = `translate(${tx}px,${ty}px) scale(${z})`; clearTimeout(rt); rt = setTimeout(sharp, 180); };
    const zoomAt = (f, x, y) => { const z0 = z; z = Math.max(1, Math.min(10, z * f)); tx = x - (x - tx) * z / z0; ty = y - (y - ty) * z / z0; apply(); };
    async function sharp(){ if (!page) return; const q = Math.min(4, Math.ceil(z)), dpr = devicePixelRatio || 1; if (q === rz) return; rz = q;
      const vp = page.getViewport({ scale: sc * q * dpr }), off = document.createElement("canvas"); off.width = Math.round(vp.width); off.height = Math.round(vp.height);
      await page.render({ canvasContext: off.getContext("2d"), viewport: vp }).promise; if (g !== gen || rz !== q) return;
      cv.width = off.width; cv.height = off.height; cv.getContext("2d").drawImage(off, 0, 0); }
    box.querySelector(".vz-zb").onclick = e => { const b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      if (b.dataset.z === "full") return Pid.open(n, cur.t === "pid" ? null : key);
      if (b.dataset.z === "fit"){ z = 1; tx = ty = 0; apply(); return; }
      zoomAt(b.dataset.z === "in" ? 1.6 : 1 / 1.6, W / 2, H / 2); };
    box.addEventListener("wheel", e => { e.preventDefault(); const r = box.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * .001), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    box.addEventListener("dblclick", e => { const r = box.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top); });
    // drag to pan (a press that doesn't move is a tap: references still work); two fingers pinch
    const pts = new Map(); let moved = 0, pinch = null;
    box.addEventListener("pointerdown", e => { if (e.target.closest(".vz-zb")) return; pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
      if (pts.size === 2){ const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; } });
    box.addEventListener("pointermove", e => { const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 2 && pinch){ pts.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...pts.values()], r = box.getBoundingClientRect();
        zoomAt(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d / z, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); moved = 9; return; }
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; moved += Math.abs(dx) + Math.abs(dy); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (moved > 4){ box.classList.add("drag"); try { box.setPointerCapture(e.pointerId); } catch (x) {} tx += dx; ty += dy; apply(); } });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; setTimeout(() => box.classList.remove("drag"), 0); };
    box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
    // references printed on the sheet (other drawings, tags): tap to follow
    let boxes = [];
    box.querySelector(".vz-rf").addEventListener("click", e => { let a = e.target.closest("[data-t]"); if (!a || moved > 4) return; e.stopPropagation();
      const q = e.currentTarget.getBoundingClientRect(), i = PdfView.nearest(boxes, (e.clientX - q.left) / q.width * 1e4, (e.clientY - q.top) / q.height * 1e4);
      if (i >= 0) a = e.currentTarget.children[i] || a;   // overlapping boxes: the nearest centre wins
      const t = a.dataset.t, k = a.dataset.k;
      if (k === "d"){ if (Pid.has(t)){ if (window.kcgmOpenTag) kcgmOpenTag(t); else go(t); } return; }   // a continuation: that drawing becomes the item on the left
      const tag = t.split("|")[0]; if (window.kcgmOpenTag) kcgmOpenTag(tag); });
    PdfView.getDoc(d.file).then(doc => doc.getPage(1)).then(async pg => {
      if (g !== gen) return; page = pg;
      const v1 = pg.getViewport({ scale: 1 }), bw = box.clientWidth, bh = Math.max(200, innerHeight - box.getBoundingClientRect().top - 24);
      sc = Math.min(bw / v1.width, bh / v1.height); const vp = pg.getViewport({ scale: sc }); W = vp.width; H = vp.height;
      box.style.height = H + "px"; stage.style.width = W + "px"; stage.style.height = H + "px"; cv.style.width = W + "px"; cv.style.height = H + "px";
      rz = 0; await sharp(); if (g !== gen) return; const nt = box.querySelector(".vz-note"); if (nt) nt.remove();
      Pid.refs().then(R => { if (g !== gen) return; const rf = box.querySelector(".vz-rf");
        const A = W / H; boxes = [];
        rf.innerHTML = (R[d.number] || []).filter(r => r[0] === 1).map(r => { const [l, t, w, h] = PdfView.grow(r[1], r[2], r[3], r[4], A); boxes.push([l, t, w, h]);
          return `<i data-t="${esc(r[5])}" data-k="${esc(r[6])}" title="${esc(String(r[5]).split("|").join(", "))}" style="left:${l / 100}%;top:${t / 100}%;width:${w / 100}%;height:${h / 100}%"></i>`; }).join(""); });
      // mark the tag: a text piece holding it, or two neighbouring pieces that together do
      const want = nk(key); if (want.length < 3 || cur.t === "pid" || !own.includes(n)) return;
      const tc = await pg.getTextContent(), it = tc.items.filter(t => t.str && t.str.trim()), hits = [];
      const rect = t => { const [a, b, c, dd, e, f] = t.transform, h = Math.hypot(c, dd) || Math.hypot(a, b), w = t.width || h * t.str.length * .5, rot = Math.abs(b) > Math.abs(a);
        return rot ? [e - h, f, e, f + w] : [e, f - h * .2, e + w, f + h * .9]; };
      it.forEach((t, i) => { const s1 = nk(t.str); if (s1.includes(want)) hits.push(rect(t));
        else if (i + 1 < it.length && (s1 + nk(it[i + 1].str)).includes(want) && !nk(it[i + 1].str).includes(want)){ const r1 = rect(t), r2 = rect(it[i + 1]);
          if (Math.abs(r1[1] - r2[1]) < 20) hits.push([Math.min(r1[0], r2[0]), Math.min(r1[1], r2[1]), Math.max(r1[2], r2[2]), Math.max(r1[3], r2[3])]); } });
      box.querySelector(".vz-mk").innerHTML = hits.slice(0, 20).map(b => { const [x1, y1, x2, y2] = vp.convertToViewportRectangle(b);
        return `<i style="left:${Math.min(x1, x2) - 3}px;top:${Math.min(y1, y2) - 3}px;width:${Math.abs(x2 - x1) + 6}px;height:${Math.abs(y2 - y1) + 6}px"></i>`; }).join("");
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
      mel.length && ["Equipment", fmt(mel.length), fmt(live.length) + " not decommissioned"],
      totKw && ["Installed power", (totKw / 1000).toFixed(1) + " MW", fmt(totKw) + " kW, excl. decommissioned"],
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
      if (!c.length && g) return ""; return `<h2 class="vz-gh">${name}</h2>` + (g ? "" : tilesH) + `<div class="vz-grid">${c.map(x => x.s).join("")}</div>`; }).join("");
  }
  // "SAG MILL MOTOR 1" → "Sag mill motor 1"
  const nice = s => { s = String(s || ""); return s === s.toUpperCase() ? s.toLowerCase().replace(/^./, c => c.toUpperCase()).replace(/\b(sag|ufg|cil\d?|vsd|hpu|ew)\b/gi, x => x.toUpperCase()) : s; };

  const css = `.vz{--vz-1:#3987e5;--vz-2:#d95926;--vz-3:#199e70;--vz-4:#c98500;--vz-5:#d55181;--vz-bar:var(--gold);min-width:0}
:root[data-theme="light"] .vz{--vz-1:#2a78d6;--vz-2:#eb6834;--vz-3:#1baf7a;--vz-4:#eda100;--vz-5:#e87ba4}
.vz[hidden]{display:none}
.vz-pv{display:flex;flex-direction:column;gap:8px;padding-top:4px}
.vz-tabs{display:flex;flex-wrap:wrap;gap:6px}
.vz-tab{border:1px solid var(--line);background:var(--card,var(--panel));color:var(--mute);border-radius:8px;padding:5px 10px;font:inherit;font-size:var(--fb,15px);cursor:pointer}
.vz-tab.on{border-color:var(--gold);color:var(--ink);font-weight:700}
.vz-hd{display:flex;align-items:center;gap:12px;min-width:0}.vz-hd .vz-tabs{flex:none;flex-wrap:nowrap}
.vz-nav{flex:1;min-width:0;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:10px}
.vz-cur{flex:0 0 auto;max-width:60%;text-align:center;line-height:1.25}.vz-cur b{display:block;font-size:var(--fb,15px);white-space:nowrap}.vz-cur i{display:block;font-style:normal;color:var(--mute);font-size:var(--fl,13px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vz-ar{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:color-mix(in srgb,var(--mute) 16%,var(--card,var(--panel)));color:var(--mute);font:inherit;font-size:20px;font-weight:700;line-height:1;cursor:pointer}
.vz-ar:hover:not(:disabled){border-color:var(--gold);color:var(--gold)}.vz-ar:disabled{opacity:.35;cursor:default}
.vz-nb{flex:0 1 220px;min-width:0;display:flex;flex-direction:column;border:0;background:none;padding:2px 4px;font:inherit;color:var(--ink);cursor:pointer;line-height:1.25;border-radius:6px}
.vz-nb.vz-p{text-align:right;align-items:flex-end}.vz-nb.vz-n{text-align:left;align-items:flex-start}
.vz-nb b{font-size:var(--fl,13px);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.vz-nb i{font-style:normal;color:var(--mute);font-size:var(--fl,13px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.vz-nb:hover b{color:var(--gold)}span.vz-nb{cursor:default}
.vz-cur small{font-weight:500;color:var(--mute);font-size:var(--fl,13px);margin-left:4px}
.vz-pv{container-type:inline-size}@container (max-width:820px){.vz-nb{display:none}}   /* (narrow: the arrows alone; their numbers show on hover) */
.vz-sheet{position:relative;border:1px solid var(--line);border-radius:10px;background:#fff;overflow:hidden;touch-action:none;cursor:default;user-select:none}
.vz-sheet.drag{cursor:default}.vz-stage{position:absolute;left:0;top:0;transform-origin:0 0}
.vz-sheet canvas{display:block}.vz-sheet .vz-note{padding:14px;margin:0;color:#5d6875}
.vz-rf{position:absolute;inset:0}.vz-rf i{position:absolute;cursor:pointer;border-radius:2px;background:rgba(232,180,74,.13);box-shadow:inset 0 0 0 1px rgba(214,158,46,.35)}   /* as in the full screen viewer */
.vz-rf i[data-k="d"]{background:rgba(232,180,74,.24);box-shadow:inset 0 0 0 1px rgba(214,158,46,.7)}.vz-rf i:hover{background:rgba(232,180,74,.45)}
.vz-zb{position:absolute;right:8px;bottom:8px;display:flex;gap:4px;z-index:2}.vz-zb button{width:32px;height:32px;border-radius:8px;border:1px solid #d9dee5;background:#fff;color:#1d2430;font-size:18px;line-height:1;cursor:pointer;display:grid;place-items:center;padding:0}
.vz-zb button:hover{border-color:#b67d12}
.vz-mk{position:absolute;left:0;top:0;pointer-events:none}.vz-mk i{position:absolute;border:2px solid #e8b44a;background:rgba(232,180,74,.35);border-radius:3px}
.vz-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
.vz-tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;gap:2px}
.vz-tile span{font-size:var(--fl,13px);color:var(--mute);text-transform:uppercase;letter-spacing:.05em;font-weight:700}.vz-tile b{font-size:var(--fh,22px);line-height:1.15;font-variant-numeric:tabular-nums}.vz-tile em{font-style:normal;font-size:var(--fb,15px);color:var(--mute)}
.vz-gh{font-size:var(--fl,13px);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin:18px 0 10px;padding-bottom:5px;border-bottom:1px solid var(--line)}.vz-gh:first-child{margin-top:0}
.vz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.vz-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-width:0}.vz-card.span{grid-column:1/-1}
.vz-card h3{margin:0 0 8px;font-size:var(--fl,13px);text-transform:uppercase;letter-spacing:.05em;color:var(--ink)}.vz-card h3 .vz-u{text-transform:none;letter-spacing:0}
.vz-note{margin:8px 0 0;font-size:var(--fb,15px);color:var(--mute)}
.vz-bars{display:flex;flex-direction:column;gap:3px}
.vz-row{display:grid;grid-template-columns:minmax(0,42%) 1fr auto;align-items:center;gap:8px;font-size:var(--fb,15px);padding:2px 4px;border-radius:6px}
.vz-row.act{cursor:pointer}.vz-row.act:hover,.vz-row:hover{background:var(--card2)}
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
  return { mount, update, item, list };
})();
