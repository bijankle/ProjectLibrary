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
  let cur = null, curIx = 0, gen = 0;
  const nk = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  function item(it){ cur = it; curIx = 0; lastSig = ""; draw(true); if (window.Pid && !Pid.ready()) Pid.load().then(() => { if (cur === it) draw(true); }).catch(() => {}); }
  function list(){ if (!cur) return; cur = null; lastSig = ""; draw(true); }
  function drawItem(){
    const g = ++gen, ds = window.Lookup && Lookup.drawingsOf ? Lookup.drawingsOf(cur) : [];
    if (!ds.length || !window.Pid || !window.PdfView){ el.innerHTML = ""; return; }
    if (curIx >= ds.length) curIx = 0;
    const n = ds[curIx], d = Pid.info(n) || {};
    el.innerHTML = `<div class="vz-pv">` + (ds.length > 1 ? `<div class="vz-tabs">${ds.map((x, i) => `<button type="button" class="vz-tab${i === curIx ? " on" : ""}" data-i="${i}">${esc(x.replace(/^2000-/, ""))}</button>`).join("")}</div>` : "") +
      `<div class="vz-pt"><b>${esc(n)}</b> ${esc(d.title || "")}</div><div class="vz-sheet" title="Open full screen"><canvas></canvas><div class="vz-mk"></div><p class="vz-note">Loading the drawing…</p></div></div>`;
    el.querySelectorAll(".vz-tab").forEach(b => b.onclick = () => { curIx = +b.dataset.i; drawItem(); });
    const box = el.querySelector(".vz-sheet"), key = cur.key;
    box.onclick = () => Pid.open(n, key);
    PdfView.getDoc(d.file).then(doc => doc.getPage(1)).then(async pg => {
      if (g !== gen) return;
      const v1 = pg.getViewport({ scale: 1 }), W = box.clientWidth, H = Math.max(200, innerHeight - box.getBoundingClientRect().top - 24);
      const sc = Math.min(W / v1.width, H / v1.height), vp = pg.getViewport({ scale: sc }), dpr = devicePixelRatio || 1;
      const cv = box.querySelector("canvas"); cv.width = Math.round(vp.width * dpr); cv.height = Math.round(vp.height * dpr); cv.style.width = vp.width + "px"; cv.style.height = vp.height + "px";
      await pg.render({ canvasContext: cv.getContext("2d"), viewport: pg.getViewport({ scale: sc * dpr }) }).promise;
      if (g !== gen) return; box.querySelector(".vz-note").remove();
      // mark the tag: a text piece holding it, or two neighbouring pieces that together do
      const want = nk(key); if (want.length < 3 || cur.t === "pid") return;
      const tc = await pg.getTextContent(), it = tc.items.filter(t => t.str && t.str.trim()), hits = [];
      const rect = t => { const [a, b, c, dd, e, f] = t.transform, h = Math.hypot(c, dd) || Math.hypot(a, b), w = t.width || h * t.str.length * .5, rot = Math.abs(b) > Math.abs(a);
        return rot ? [e - h, f, e, f + w] : [e, f - h * .2, e + w, f + h * .9]; };
      it.forEach((t, i) => { const s1 = nk(t.str); if (s1.includes(want)) hits.push(rect(t));
        else if (i + 1 < it.length && (s1 + nk(it[i + 1].str)).includes(want) && !nk(it[i + 1].str).includes(want)){ const r1 = rect(t), r2 = rect(it[i + 1]);
          if (Math.abs(r1[1] - r2[1]) < 20) hits.push([Math.min(r1[0], r2[0]), Math.min(r1[1], r2[1]), Math.max(r1[2], r2[2]), Math.max(r1[3], r2[3])]); } });
      const mk = box.querySelector(".vz-mk"); mk.style.width = vp.width + "px"; mk.style.height = vp.height + "px";
      mk.innerHTML = hits.slice(0, 20).map(b => { const [x1, y1, x2, y2] = vp.convertToViewportRectangle(b);
        return `<i style="left:${Math.min(x1, x2) - 3}px;top:${Math.min(y1, y2) - 3}px;width:${Math.abs(x2 - x1) + 6}px;height:${Math.abs(y2 - y1) + 6}px"></i>`; }).join("");
    }).catch(e => { if (g === gen){ const p = box.querySelector(".vz-note"); if (p) p.textContent = "Couldn't load the drawing (" + (e.message || e) + ")."; } });
  }

  // ---------- pieces ----------
  // the charts in four groups, each under a heading, in this order
  const GRP = [["General", [/^Asset mix/, /by area \[qty\]$/]], ["Equipment", [/^Equipment by type/, /^Stage/, /^Brownfield/, /^Status/]],
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
      `<ul>${parts.map((p, i) => `<li${f && p.k != null && p.k !== "" ? ` class="act" data-f="${f}" data-v="${esc(p.k)}"` : ""} data-tip="<b>${esc(p.label)}</b><br>${fmt(p.v)} ${unit}"><i style="background:var(--vz-${i + 1})"></i><span>${esc(p.label)}</span><b>${fmt(p.v)}</b><em>${Math.round(p.v / tot * 100)}%</em></li>`).join("")}</ul></div>`;
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
      h += card("Asset mix [qty]", pie(Object.entries(m).map(([k, v]) => ({ k, label: TN[k] || k, v })), "items", "t"));
    }
    // where the assets are (any type): by WBS area
    if (L.length){
      const m = count(L, r => r.a);
      h += card((ctx.type ? `${TN[ctx.type] || "Assets"} by area` : "Assets by area") + " [qty]", pie(Object.entries(m).map(([k, v]) => ({ k, label: k === "?" ? "No area" : `${k} ${areaName(k)}`, v })), "items", next === "a" ? "a" : null));
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
        h += card("Equipment by type [qty]", pie(Object.entries(m).map(([k, v]) => ({ k, label: `${k} ${ctx.codeName ? ctx.codeName(k) : ""}`.trim(), v })), "items", ctx.type === "mel" && next === "k" ? "k" : null));
      }
      // splits: ≤5 parts each
      h += card("Stage [qty]", donut(five(count(mel, r => get(r, "Stage"))), "items"));
      h += card("Brownfield / greenfield [qty]", donut(five(count(mel, r => /brown/i.test(get(r, "Brownfield / greenfield")) ? "Brownfield" : /green/i.test(get(r, "Brownfield / greenfield")) ? "Greenfield" : "")), "items"));
      h += card("Status [qty]", donut(five(count(mel, r => get(r, "Status"))), "items"));
      // drives
      const drv = live.filter(r => kw(r) > 0);
      if (drv.length){
        h += card("Starter type [qty]", donut(five(count(drv, r => ({ DOL: "DOL", VSD: "VSD", FE: "FE (field equipment)" })[get(r, "Starter type")] || (get(r, "Starter type") ? get(r, "Starter type").replace(/^.*DOL.*$/, "DOL (other)") : ""))), "drives"), "Items with a power rating.");
        h += card("Power by voltage [kW]", bars(Object.entries(count(drv, r => get(r, "Voltage") || "Not given", kw)).map(([k, v]) => ({ k: "", label: k, v })), "kW", null, 5));
      }
    }
    if (lines.length){
      h += card("Lines by service [qty]", pie(Object.entries(count(lines, r => r.k)).map(([k, v]) => ({ k, label: `${k} ${ctx.svcName ? ctx.svcName(k) : ""}`.trim(), v })), "lines", ctx.type === "line" && next === "k" ? "k" : null));
      // sizes: ranked bars like the others (most common first), tap one to filter when size is the next step
      h += card("Line sizes [qty]", pie(Object.entries(count(lines, r => r.sz)).filter(([k]) => k !== "?" && +k > 0).map(([k, v]) => ({ k, label: "DN" + k, v })), "lines", ctx.type === "line" && next === "sz" ? "sz" : null));
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
.vz-pt{font-size:var(--fb,15px);color:var(--mute)}.vz-pt b{color:var(--ink)}
.vz-sheet{position:relative;cursor:zoom-in;border:1px solid var(--line);border-radius:10px;background:#fff;padding:0;overflow:hidden;align-self:flex-start;max-width:100%;min-width:100%}
.vz-sheet canvas{display:block}.vz-sheet .vz-note{padding:14px;margin:0;color:#5d6875}
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
.vz-don li{display:grid;grid-template-columns:10px minmax(0,1fr) auto auto;gap:7px;align-items:center;font-size:var(--fb,15px)}
.vz-don li i{width:10px;height:10px;border-radius:3px}.vz-don li span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vz-don li b{font-variant-numeric:tabular-nums;font-weight:700}.vz-don li em{font-style:normal;color:var(--mute);min-width:32px;text-align:right}
.vz-tip{position:fixed;z-index:200;pointer-events:none;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:var(--fb,15px);line-height:1.35;box-shadow:0 6px 18px #0006;max-width:260px}
.vz-tip[hidden]{display:none}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, update, item, list };
})();
