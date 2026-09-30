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

  // ---------- pieces ----------
  const card = (title, body, note, span) => `<section class="vz-card${span ? " span" : ""}"><h3>${esc(title)}</h3>${body}${note ? `<p class="vz-note">${note}</p>` : ""}</section>`;
  // ranked bars: [{ k, label, v, tip, f }] biggest first; the value is written at the bar end
  function bars(rows, unit, f, top = 10){
    rows = rows.filter(r => r.v > 0).sort((a, b) => b.v - a.v); const rest = rows.slice(top); rows = rows.slice(0, top);
    if (rest.length) rows.push({ k: "", label: `Other (${rest.length})`, v: rest.reduce((s, r) => s + r.v, 0), other: 1 });
    const max = Math.max(...rows.map(r => r.v), 1);
    return `<div class="vz-bars">` + rows.map(r => { const act = !r.other && f && r.k != null && r.k !== "" ? ` data-f="${f}" data-v="${esc(r.k)}"` : "";
      return `<div class="vz-row${act ? " act" : ""}${r.other ? " oth" : ""}"${act} data-tip="${esc(r.tip || `<b>${esc(r.label)}</b><br>${fmt(r.v)} ${unit}`)}">` +
        `<span class="vz-l" title="${esc(r.label)}">${esc(r.label)}</span><span class="vz-t"><i style="width:${(r.v / max * 100).toFixed(1)}%"></i></span><span class="vz-v">${fmt(r.v)}</span></div>`; }).join("") + `</div>`;
  }
  // donut for ≤5 parts, 2px gaps between segments, the legend carries the values
  function donut(parts, unit){
    parts = parts.filter(p => p.v > 0); const tot = parts.reduce((s, p) => s + p.v, 0); if (!tot) return `<p class="vz-note">Nothing to show.</p>`;
    const R = 38, C = 2 * Math.PI * R; let at = 0;
    const segs = parts.map((p, i) => { const len = p.v / tot * C, gap = parts.length > 1 ? Math.min(2, len / 2) : 0;
      const s = `<circle r="${R}" cx="50" cy="50" fill="none" stroke="var(--vz-${i + 1})" stroke-width="16" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(C - len + gap).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}" transform="rotate(-90 50 50)" data-tip="<b>${esc(p.label)}</b><br>${fmt(p.v)} ${unit} (${Math.round(p.v / tot * 100)}%)"/>`;
      at += len; return s; }).join("");
    return `<div class="vz-don"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(parts.map(p => p.label + " " + fmt(p.v)).join(", "))}">${segs}<text x="50" y="48" class="vz-dt">${fmt(tot)}</text><text x="50" y="60" class="vz-du">${esc(unit)}</text></svg>` +
      `<ul>${parts.map((p, i) => `<li data-tip="<b>${esc(p.label)}</b><br>${fmt(p.v)} ${unit}"><i style="background:var(--vz-${i + 1})"></i><span>${esc(p.label)}</span><b>${fmt(p.v)}</b><em>${Math.round(p.v / tot * 100)}%</em></li>`).join("")}</ul></div>`;
  }
  // fold a count map into ≤5 parts (the rest as Other)
  function five(m, names = {}){
    const e = Object.entries(m).sort((a, b) => b[1] - a[1]); const out = e.slice(0, e.length > 5 ? 4 : 5).map(([k, v]) => ({ label: names[k] || k || "Not given", v }));
    if (e.length > 5) out.push({ label: `Other (${e.length - 4})`, v: e.slice(4).reduce((s, x) => s + x[1], 0) }); return out;
  }
  const count = (arr, key, w = () => 1) => { const m = {}; arr.forEach(r => { const k = key(r); m[k] = (m[k] || 0) + w(r); }); return m; };

  // ---------- the charts ----------
  function draw(force){
    if (!el) return;
    if (!wide()){ el.hidden = true; return; } el.hidden = false;
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
    let h = `<div class="vz-tiles">${tiles.map(([a, b, c]) => `<div class="vz-tile"><span>${a}</span><b>${b}</b><em>${c}</em></div>`).join("")}</div><div class="vz-grid">`;

    // asset mix (before a type is picked): ranked bars, tap one to pick that type
    if (!ctx.type){
      const m = count(L, r => r.t);
      h += card("Asset mix", bars(Object.entries(m).map(([k, v]) => ({ k, label: TN[k] || k, v })), "items", "t", 9));
    }
    // where the assets are (any type): by WBS area
    if (L.length){
      const m = count(L, r => r.a);
      h += card(ctx.type ? `${TN[ctx.type] || "Assets"} by area` : "Assets by area", bars(Object.entries(m).map(([k, v]) => ({ k, label: k === "?" ? "No area" : `${k} ${areaName(k)}`, v })), "items", next === "a" ? "a" : null, 10),
        "");
    }
    if (mel.length){
      // top power users: the biggest single drives (tap to open the item)
      const top = live.filter(r => kw(r) > 0).sort((a, b) => kw(b) - kw(a)).slice(0, 10);
      if (top.length) h += card("Top power users", `<div class="vz-bars">` + (() => { const max = kw(top[0]);
        return top.map(r => `<div class="vz-row act" data-f="open" data-v="${esc(r.it.key)}" data-tip="<b>${esc(r.it.key)}</b><br>${esc(r.it.name)}<br>${fmt(kw(r))} kW · ${esc(get(r, "Duty / standby") || "duty not given")}">` +
          `<span class="vz-l" title="${esc(r.it.name)}">${esc(nice(r.it.name))}</span><span class="vz-t"><i style="width:${(kw(r) / max * 100).toFixed(1)}%"></i></span><span class="vz-v">${fmt(kw(r))}</span></div>`).join(""); })() + `</div>`,
        "kW per item, decommissioned left out.", false);
      if (totKw) h += card("Installed power by area", bars(Object.entries(count(live, r => r.a, kw)).map(([k, v]) => ({ k, label: k === "?" ? "No area" : `${k} ${areaName(k)}`, v, tip: `<b>${esc(k)} ${esc(areaName(k))}</b><br>${fmt(v)} kW (${Math.round(v / totKw * 100)}%)` })), "kW", next === "a" ? "a" : null, 10), "kW, decommissioned left out.");
      if (ctx.type === "mel" || !ctx.type){
        const m = count(mel, r => r.k);
        h += card("Equipment by type", bars(Object.entries(m).map(([k, v]) => ({ k, label: `${k} ${ctx.codeName ? ctx.codeName(k) : ""}`.trim(), v })), "items", ctx.type === "mel" && next === "k" ? "k" : null, 10),
          "");
      }
      // splits: ≤5 parts each
      h += card("Stage", donut(five(count(mel, r => get(r, "Stage"))), "items"));
      h += card("Brownfield / greenfield", donut(five(count(mel, r => /brown/i.test(get(r, "Brownfield / greenfield")) ? "Brownfield" : /green/i.test(get(r, "Brownfield / greenfield")) ? "Greenfield" : "")), "items"));
      h += card("Status", donut(five(count(mel, r => get(r, "Status"))), "items"));
      // drives
      const drv = live.filter(r => kw(r) > 0);
      if (drv.length){
        h += card("Starter type", donut(five(count(drv, r => ({ DOL: "DOL", VSD: "VSD", FE: "FE (field equipment)" })[get(r, "Starter type")] || (get(r, "Starter type") ? get(r, "Starter type").replace(/^.*DOL.*$/, "DOL (other)") : ""))), "drives"), "Items with a power rating.");
        h += card("Power by voltage", bars(Object.entries(count(drv, r => get(r, "Voltage") || "Not given", kw)).map(([k, v]) => ({ k: "", label: k, v })), "kW", null, 8), "kW per supply voltage.");
      }
    }
    if (lines.length){
      h += card("Lines by service", bars(Object.entries(count(lines, r => r.k)).map(([k, v]) => ({ k, label: `${k} ${ctx.svcName ? ctx.svcName(k) : ""}`.trim(), v })), "lines", ctx.type === "line" && next === "k" ? "k" : null, 10));
      // size spread: DN in size order (a column per size), the common sizes only
      const sz = count(lines, r => r.sz), keys = Object.keys(sz).filter(k => k !== "?" && +k > 0).sort((a, b) => a - b), mx = Math.max(...keys.map(k => sz[k]), 1);
      const shown = keys.filter(k => sz[k] >= Math.max(2, mx * .02));
      if (shown.length > 1) h += card("Line sizes", `<div class="vz-cols">${shown.map(k => `<div class="vz-col${ctx.type === "line" && next === "sz" ? " act" : ""}"${ctx.type === "line" && next === "sz" ? ` data-f="sz" data-v="${k}"` : ""} data-tip="<b>DN${k}</b><br>${fmt(sz[k])} lines"><i style="height:${(sz[k] / mx * 100).toFixed(1)}%"></i><span>${k}</span></div>`).join("")}</div>`, "Lines per nominal size (DN); rare sizes left out.", true);
      if (totLen) h += card("Pipe length by area", bars(Object.entries(count(lines, r => r.a, len)).map(([k, v]) => ({ k, label: k === "?" ? "No area" : `${k} ${areaName(k)}`, v })), "m", null, 10), "Metres of pipe.");
    }
    el.innerHTML = h + `</div>`;
  }
  // "SAG MILL MOTOR 1" → "Sag mill motor 1"
  const nice = s => { s = String(s || ""); return s === s.toUpperCase() ? s.toLowerCase().replace(/^./, c => c.toUpperCase()).replace(/\b(sag|ufg|cil\d?|vsd|hpu|ew)\b/gi, x => x.toUpperCase()) : s; };

  const css = `.vz{--vz-1:#3987e5;--vz-2:#d95926;--vz-3:#199e70;--vz-4:#c98500;--vz-5:#d55181;--vz-bar:var(--gold);min-width:0}
:root[data-theme="light"] .vz{--vz-1:#2a78d6;--vz-2:#eb6834;--vz-3:#1baf7a;--vz-4:#eda100;--vz-5:#e87ba4}
.vz[hidden]{display:none}
.vz-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
.vz-tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;gap:2px}
.vz-tile span{font-size:12px;color:var(--mute);text-transform:uppercase;letter-spacing:.05em;font-weight:700}.vz-tile b{font-size:26px;line-height:1.15;font-variant-numeric:tabular-nums}.vz-tile em{font-style:normal;font-size:12px;color:var(--mute)}
.vz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.vz-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-width:0}.vz-card.span{grid-column:1/-1}
.vz-card h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink)}
.vz-note{margin:8px 0 0;font-size:12px;color:var(--mute)}
.vz-bars{display:flex;flex-direction:column;gap:3px}
.vz-row{display:grid;grid-template-columns:minmax(0,42%) 1fr auto;align-items:center;gap:8px;font-size:12.5px;padding:2px 4px;border-radius:6px}
.vz-row.act{cursor:pointer}.vz-row.act:hover,.vz-row:hover{background:var(--card2)}
.vz-l{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink)}
.vz-t{height:12px;display:block}.vz-t i{display:block;height:100%;background:var(--vz-bar);border-radius:0 4px 4px 0;min-width:2px}
.vz-row.oth .vz-t i{background:color-mix(in srgb,var(--mute) 55%,transparent)}
.vz-v{font-variant-numeric:tabular-nums;color:var(--mute);font-weight:600;min-width:44px;text-align:right}
.vz-don{display:flex;align-items:center;gap:14px}.vz-don svg{width:120px;height:120px;flex:none}
.vz-don circle{cursor:default}.vz-don circle:hover{stroke-width:19}
.vz-dt{text-anchor:middle;font-size:14px;font-weight:800;fill:var(--ink)}.vz-du{text-anchor:middle;font-size:8px;fill:var(--mute)}
.vz-don ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.vz-don li{display:grid;grid-template-columns:10px minmax(0,1fr) auto auto;gap:7px;align-items:center;font-size:12.5px}
.vz-don li i{width:10px;height:10px;border-radius:3px}.vz-don li span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vz-don li b{font-variant-numeric:tabular-nums;font-weight:700}.vz-don li em{font-style:normal;color:var(--mute);min-width:32px;text-align:right}
.vz-cols{display:flex;align-items:flex-end;gap:3px;height:130px;padding-top:6px}
.vz-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0}.vz-col.act{cursor:pointer}
.vz-col i{display:block;width:100%;background:var(--vz-bar);border-radius:4px 4px 0 0;min-height:2px}.vz-col:hover i{filter:brightness(1.15)}
.vz-col span{font-size:10px;color:var(--mute);margin-top:3px;font-variant-numeric:tabular-nums}
.vz-tip{position:fixed;z-index:200;pointer-events:none;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:12.5px;line-height:1.35;box-shadow:0 6px 18px #0006;max-width:260px}
.vz-tip[hidden]{display:none}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, update };
})();
