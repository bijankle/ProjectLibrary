// Browse: the Assets tab on the phone. Left half: the filter steps; right half: the items that match, updated on every tap.
// Step 1 picks the type (equipment, instruments, valves, lines…); the next steps follow that type's own tag nomenclature,
// e.g. Equipment then equipment code (PP Pump) then area, or Lines then service, area, pipe spec, size. Each option shows
// how many items it leaves, e.g. "PP - Pump (22)". Chosen steps stack at the top left; × on one steps back to it.
// "Any" skips a step. The last pick is remembered. Names come from browse.json (tools/build_browse.py).
// Browse.mount(el, lk) where lk is the search box from Lookup.mount (used to open an item).
window.Browse = (() => {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const TYPES = [["mel", "Equipment"], ["ins", "Instruments"], ["cv", "Control valves"], ["mv", "Manual valves"], ["line", "Lines"],
    ["spi", "Pipe specials"], ["hose", "Hoses"], ["pid", "Drawings"]];
  const TN = Object.fromEntries(TYPES);
  const CV = { XV: "On / off valve", PRV: "Pressure relief valve", SV: "Safety / solenoid valve", FCV: "Flow control valve", HV: "Hand actuated valve",
    PCV: "Pressure control valve", LCV: "Level control valve", TCV: "Temperature control valve", DCV: "Density control valve", XCV: "Control valve", SVO: "Solenoid valve" };
  const SPI = { EB: "Blower header", FR: "Not used", FS: "Deluge system", HS: "Slurry hose", MC: "Service / flushing coupling", MS: "Filter, trap, breather",
    MV: "Gland water valve", OP: "Orifice plate", SC: "Straub coupling", SP: "Spray nozzle / bar", SS: "Special spool / injector", ST: "Strainer", VC: "Victaulic coupling" };
  const KEY = "kcgm_browse2";
  let B = null, rows = [], path = [], shownN = 60, names = {};

  const area = s => { const m = /\bF(\d{2})\b/.exec(s || ""); return m ? "F" + m[1] : ""; };
  // instrument letters, e.g. PIT = Pressure Indicating Transmitter (ISA style; later letters use their second meaning)
  const INS = { XV: "On / off valve", SV: "Solenoid valve", SVO: "Solenoid valve, open", SVC: "Solenoid valve, close", ZSO: "Position switch, open",
    ZSC: "Position switch, closed", HS: "Hand switch", PRV: "Pressure relief valve", VT: "Vibration transmitter", VE: "Vibration element" };
  const insName = p => { if (!p || p === "?") return "No letter code"; if (INS[p]) return INS[p]; const L = B.inst;
    const out = [L[p[0]] ? L[p[0]][0] : p[0]]; let rest = p.slice(1);
    if (rest[0] === "D" && rest.length > 1){ out.push("Differential"); rest = rest.slice(1); }
    return out.concat([...rest].map(c => L[c] ? L[c][1] : c)).filter(Boolean).join(" "); };
  function facet(it){
    const g = n => Lookup.get(it, n), k = it.key;
    switch (it.t){
      case "mel": { const m = /^F(\d\d)-([A-Z]+)/.exec(k); return m ? ["F" + m[1], m[2]] : [area(g("Area")), "?"]; }
      case "ins": { const m = /^([A-Z]*)\s*(\d{2})/.exec(k); return [m && m[2] !== "00" ? "F" + m[2] : m ? "F00" : "", m && m[1] ? m[1] : "?"]; }
      case "cv": { const m = /^([A-Z]+)\s*(\d{2})/.exec(k); return [m ? "F" + m[2] : "", g("Valve type") || (m && m[1]) || "?"]; }
      case "line": { const m = /^(\d{2,3})-[A-Z]?\d+-([A-Z0-9]+)-/.exec(k); return m ? ["F" + m[1], m[2]] : ["", g("Service") || "?"]; }
      case "mv": return [area(k), g("Valve type") || "?"];
      case "spi": return [area((/2000-F\d\d/.exec(g("P&IDs")) || [""])[0].slice(5)), g("Type") || "?"];
      case "hose": return [area(g("Location ref")), g("Service") || "?"];
      case "pid": { const m = /^2000-F(\d\d)-(PID|PFD)-/.exec(k); return m ? ["F" + m[1], m[2]] : null; }
    }
    return null;
  }
  // the steps after the type, per type: [field, label]
  const STEPS = {
    mel: [["k", "Equipment code"], ["a", "Area"]],
    ins: [["k", "Instrument letters"], ["a", "Area"]],
    cv: [["k", "Valve type"], ["a", "Area"], ["sz", "Size (mm)"]],
    mv: [["k", "Valve type"], ["a", "Area"], ["sz", "Size (DN)"]],
    line: [["k", "Service"], ["a", "Area"], ["sp", "Pipe spec"], ["sz", "Size (DN)"]],
    spi: [["k", "Type"], ["a", "Area"]],
    hose: [["k", "Service"], ["a", "Area"]],
    pid: [["k", "Drawing"], ["a", "Area"]] };
  const SIZE = { cv: "Valve size (mm)", mv: "Size (DN)", line: "Size (DN)" };
  function build(){
    rows = [];
    for (const it of Lookup.items()){
      if (!TN[it.t]) continue;
      const f = facet(it); if (!f) continue;
      rows.push({ it, t: it.t, a: f[0] || "?", k: f[1] || "?", sp: it.t === "line" ? Lookup.get(it, "Pipe spec") || "?" : "", sz: SIZE[it.t] ? String(Lookup.get(it, SIZE[it.t]) || "?") : "" });
    }
    rows.sort((x, y) => x.it.key.localeCompare(y.it.key, undefined, { numeric: true }));
    names = {
      a: v => B.areas[v] || "", sp: v => (B.spec || {})[v] || "", sz: () => "",
      k: { mel: v => B.equip[v] || "", ins: insName, cv: v => CV[v] || "", mv: () => "", line: v => B.svc[v] || "", hose: v => B.svc[v] || "",
        pid: v => v === "PID" ? "Piping & instrument diagrams" : "Process flow diagrams", spi: v => SPI[v] || "" } };
  }
  const nameOf = (f, t, v) => v === "?" ? (f === "a" ? "No area in the tag" : "Not given") : f === "k" ? names.k[t](v) : names[f](v);
  const t = () => path.length ? path[0].v : "";
  const steps = () => t() ? STEPS[t()] : [];
  const match = r => path.every(p => p.v == null || r[p.f] === p.v);
  const nextStep = () => t() ? steps()[path.length - 1] : ["t", "Asset type"];
  // alphabetical by what the chip shows ("?" reads "Other"); numbers in number order, so sizes run 15, 25, 50…
  // most items first (ties alphabetical, by what the chip shows: "?" reads "Other")
  const alpha = (x, y) => (x === "?" ? "Other" : x).localeCompare(y === "?" ? "Other" : y, undefined, { numeric: true, sensitivity: "base" });
  const order = (f, c) => Object.keys(c).sort((x, y) => c[y] - c[x] || alpha(x, y));

  let el = null, lk = null, resY = 0;
  // a short form of a name for the option chips: the first one or two words, about 14 characters ("Pump Process")
  const SKIP = /^(and|of|the|for|with|to|in|on|at)$/i;
  const shortName = n => { const w = String(n || "").replace(/\(.*?\)/g, " ").replace(/[·&/,;:]+|\s[-–]\s/g, " ").split(/\s+/).filter(x => x && !SKIP.test(x));
    if (!w.length) return ""; let s = w[0];
    if (w[1]) s += (s + " " + w[1]).length <= 14 ? " " + w[1] : " " + w[1].slice(0, Math.max(3, 12 - s.length)) + ".";   // "Analysis Elem."
    return s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s; };
  function draw(){
    const list = rows.filter(match), st = nextStep();
    const crumbs = path.map((p, i) => { const nm = p.f === "t" || p.v == null || p.v === "?" ? "" : nameOf(p.f, t(), p.v);
      const txt = p.f === "t" ? TN[p.v] : p.v == null ? "Any " + steps()[i - 1][1].toLowerCase() : (p.v === "?" ? "Other" : p.v) + (nm ? " - " + nm : "");
      return `<button class="bw-cr" data-i="${i}" title="Remove this and the steps after it"><span>${esc(txt)}${p.n ? ` <i>(${p.n.toLocaleString()})</i>` : ""}</span><b>×</b></button>`; }).join("");
    let opts = "", az = null, qw = 1;
    if (st){
      const c = {}; for (const r of list) c[r[st[0]]] = (c[r[st[0]]] || 0) + 1;
      const vals = st[0] === "t" ? TYPES.map(x => x[0]).filter(v => c[v]).sort((x, y) => c[y] - c[x] || TN[x].localeCompare(TN[y])) : order(st[0], c);
      opts = `<div class="bw-h">${esc(st[1])}${st[0] !== "t" ? `<button class="bw-any">Any</button>` : ""}</div>` +
        vals.map(v => { const n = st[0] === "t" || v === "?" ? "" : shortName(nameOf(st[0], t(), v)), label = st[0] === "t" ? TN[v] : v === "?" ? "Other" : v;
          // code (short name); the full name and the count show on the gold chip once picked
          // qty × code (short name): the quantities share one right aligned column, so the items line up
          return `<button class="bw-o" data-v="${esc(v)}" data-n="${c[v]}" data-l="${esc(azKey(label))}"><i class="q">(x${c[v].toLocaleString()})</i><em>${esc(label)}</em>${n ? ` <span>(${esc(n)})</span>` : ""}</button>`; }).join("");
      qw = Math.max(...vals.map(v => c[v].toLocaleString().length)) + 3;   // "(x" and ")"
      az = [...new Set(vals.map(v => azKey(st[0] === "t" ? TN[v] : v === "?" ? "Other" : v)))].sort((a, b) => a.localeCompare(b));   // shown only if the list runs off the screen
    } else opts = `<div class="bw-h">All steps set</div><div class="bw-note">Tap × on a step above to change it.</div>`;
    const hits = list.slice(0, shownN).map(r => r.it);
    el.innerHTML = `<div class="bw-lw">${az ? `<div class="bw-az" aria-hidden="true">${az.map(L => `<i data-l="${esc(L)}">${esc(L)}</i>`).join("")}</div><div class="bw-bub"></div>` : ""}<div class="bw-l">${crumbs ? `<div class="bw-crs">${crumbs}</div>` : ""}<div class="bw-opts stack" style="--qw:${qw}ch">${opts}</div></div></div>
      <div class="bw-r"><div class="bw-n"><b>${list.length.toLocaleString()}</b> ${list.length === 1 ? "item" : "items"}</div>
      ${hits.map((it, i) => `<button class="bw-it${it.t === "line" ? " ln" : ""}" data-i="${i}"><b>${t() ? "" : (Lookup.ICON[it.t] || "") + " "}${esc(it.key)}</b> <span>(${esc(resDesc(it))})</span></button>`).join("")}
      ${list.length > hits.length ? `<button class="bw-more">Show ${Math.min(200, list.length - hits.length)} more</button>` : ""}</div>`;
    el.querySelectorAll(".bw-o").forEach(b => b.onclick = () => { path.push({ f: st[0], v: b.dataset.v, n: +b.dataset.n }); after(); });
    const any = el.querySelector(".bw-any"); if (any) any.onclick = () => { path.push({ f: st[0], v: null }); after(); };
    el.querySelectorAll(".bw-cr").forEach(b => b.onclick = () => { path = path.slice(0, +b.dataset.i); after(); });
    el.querySelectorAll(".bw-it").forEach(b => b.onclick = () => { resY = el.querySelector(".bw-r").scrollTop; lk.openItem(hits[+b.dataset.i]); });
    const m = el.querySelector(".bw-more"); if (m) m.onclick = () => { const y = el.querySelector(".bw-r").scrollTop; shownN += 200; draw(); el.querySelector(".bw-r").scrollTop = y; };
    if (az) bindAZ();
    fit(); fitLayout();
  }
  // one row per result: code (description); a line reads code (from Name (tag), to Name (tag))
  const resDesc = it => { if (it.t === "line" && it.r){ const [a, b] = Lookup.lineEnds(it, true); return `from ${a}, to ${b}`; } return Lookup.listName(it); };
  // the bracket text shrinks until its row fits on one line (never below 8px; then it ends with …);
  // chips that still don't fit at 8px widen the filter column (up to half the screen)
  // (min: the smallest size allowed; lines' "from …, to …" may go as small as it takes)
  function fitRows(sel, max, min = 8){
    el.querySelectorAll(sel).forEach(b => { const s = b.querySelector("span"); if (!s) return; s.style.fontSize = max + "px";
      const lo = b.classList.contains("ln") ? 3 : min;
      for (let k = 0; k < 3 && b.scrollWidth > b.clientWidth + 1; k++){   // a couple of passes: padding and spacing don't scale
        const cur = parseFloat(s.style.fontSize), over = b.scrollWidth - b.clientWidth, w = s.getBoundingClientRect().width;
        s.style.fontSize = Math.max(lo, cur * Math.max(0, w - over - 2) / w).toFixed(2) + "px"; } });
  }
  function fitLayout(){
    if (!el || !el.offsetParent) return;
    el.style.gridTemplateColumns = "";
    // one option per row whenever they all fit without scrolling; flowing side by side only for longer lists
    const l = el.querySelector(".bw-l"), op = el.querySelector(".bw-opts");
    // (one option per row, always: the quantity column keeps the items aligned)
    azSel = null; const lwr = el.querySelector(".bw-lw");
    if (lwr){ lwr.classList.remove("az-on"); if (el.querySelector(".bw-az") && l.scrollHeight > l.clientHeight + 1) lwr.classList.add("az-on"); }
    fitRows(".bw-o", 11.5);
    const W = el.clientWidth, lw = el.querySelector(".bw-lw"); let need = 0;
    el.querySelectorAll(".bw-o").forEach(b => { need = Math.max(need, b.scrollWidth - b.clientWidth); });
    if (need > 1 && lw){ const w = Math.min(W * .5, lw.getBoundingClientRect().width + need + 2); el.style.gridTemplateColumns = `${Math.round(w)}px minmax(0,1fr)`; fitRows(".bw-o", 11.5); }
    fitRows(".bw-it", 11.5);
  }
  const azKey = s => { const c = String(s).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; };
  // Niagara style A–Z strip: slide a finger down it and the options jump to that letter, with a big letter bubble
  // Niagara style A–Z strip (only when the options run off the screen): slide along it and only that letter's options
  // show, with a big letter bubble; tap the same letter again for all of them
  let azSel = null;
  function bindAZ(){
    const strip = el.querySelector(".bw-az"), l = el.querySelector(".bw-l"), bub = el.querySelector(".bw-bub"), lw = el.querySelector(".bw-lw");
    let down = false, moved = false, start = null;
    const show = L => { azSel = L; [...strip.children].forEach(x => x.classList.toggle("on", x.dataset.l === L));
      el.querySelectorAll(".bw-o").forEach(o => o.hidden = !!L && o.dataset.l !== L); l.scrollTop = 0; };
    const letterAt = e => { const r = strip.getBoundingClientRect(), k = strip.children; return k[Math.max(0, Math.min(k.length - 1, Math.floor((e.clientY - r.top) / r.height * k.length)))].dataset.l; };
    const at = e => { const L = letterAt(e), lr = lw.getBoundingClientRect();
      bub.textContent = L; bub.style.top = Math.max(0, Math.min(lr.height - 56, e.clientY - lr.top - 28)) + "px"; bub.style.display = "grid";
      if (L !== start) moved = true;
      if (L !== azSel){ show(L); if (navigator.vibrate) try { navigator.vibrate(4); } catch (x) {} } };
    strip.addEventListener("pointerdown", e => { down = true; moved = false; start = letterAt(e); const was = azSel; try { strip.setPointerCapture(e.pointerId); } catch (x) {}
      if (was === start){ strip.dataset.clear = "1"; } else { strip.dataset.clear = ""; at(e); } e.preventDefault(); });
    strip.addEventListener("pointermove", e => { if (down && (letterAt(e) !== start || !strip.dataset.clear)) { strip.dataset.clear = ""; at(e); } });
    const end = () => { down = false; bub.style.display = ""; if (strip.dataset.clear && !moved) show(null); strip.dataset.clear = ""; };
    strip.addEventListener("pointerup", end); strip.addEventListener("pointercancel", end);
  }
  const after = () => { shownN = 60; save(); draw(); };
  // the two panes fill the screen below the search bar and scroll on their own
  function fit(){ if (!el || !el.offsetParent) return; const z = window.TextSize ? TextSize.z() : 1;   // inside a zoomed page, CSS pixels are scaled by the text size
    el.style.height = Math.max(260, (window.innerHeight - el.getBoundingClientRect().top - window.scrollY - 6) / z) + "px"; }
  window.addEventListener("resize", () => { fit(); fitLayout(); });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(path)); } catch (e) {} };
  function mount(root, box){
    el = root; lk = box; el.classList.add("bw");
    try { const p = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(p)) path = p; } catch (e) {}
    el.innerHTML = `<div class="bw-note">Loading the plant lists…</div>`;
    Promise.all([Lookup.load(), fetch("browse.json").then(r => { if (!r.ok) throw new Error("browse.json " + r.status); return r.json(); })])
      .then(([, b]) => { B = b; build(); if (path.length && (path[0].f !== "t" || !TN[path[0].v] || path.length > STEPS[path[0].v].length + 1)) path = []; draw(); })
      .catch(e => { el.innerHTML = `<div class="bw-note">Couldn't load the lists (${esc(e.message)}). Check the connection and reopen the app.</div>`; });
  }
  // back from an item: the list where it was
  const restore = () => { fit(); fitLayout(); const r = el && el.querySelector(".bw-r"); if (r) r.scrollTop = resY; };
  const css = `.bw{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px;min-height:260px}
.bw-l,.bw-r{overflow-y:auto;overscroll-behavior:contain;min-height:0;-webkit-overflow-scrolling:touch}
.bw-lw{position:relative;display:flex;min-height:0;min-width:0}
.bw-lw .bw-l{flex:1;min-width:0}
.bw-lw:not(.az-on) .bw-az{display:none}.bw-o[hidden]{display:none}
.bw-az{flex:none;width:30px;margin-left:-16px;padding-left:4px;margin-right:2px;display:flex;flex-direction:column;justify-content:space-evenly;align-items:center;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.bw-az i{font-style:normal;font-size:10.5px;font-weight:800;line-height:1;color:var(--mute);transition:transform .1s,color .1s}
.bw-az i.on{color:var(--gold);transform:scale(1.5)}
.bw-bub{position:absolute;left:18px;width:54px;height:54px;border-radius:50% 50% 50% 10px;background:var(--gold);color:#1a1307;font-size:28px;font-weight:900;display:none;place-items:center;z-index:5;pointer-events:none;box-shadow:0 6px 18px #0008}
.bw-l{display:flex;flex-direction:column;gap:6px}
.bw-crs{display:flex;flex-wrap:wrap;gap:4px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.bw-cr{display:flex;align-items:center;gap:5px;max-width:100%;border:1px solid var(--gold);background:var(--gold);color:#1a1307;border-radius:99px;padding:3px 5px 3px 9px;font:inherit;font-size:12px;font-weight:700}
.bw-cr{border-radius:10px !important;text-align:left}.bw-cr span{white-space:normal;line-height:1.25}.bw-cr i{font-style:normal;font-weight:600;opacity:.75}
.bw-cr b{display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:rgba(0,0,0,.18);font-size:12px;line-height:1}
.bw-opts{display:flex;flex-direction:row;flex-wrap:wrap;gap:4px;align-content:flex-start}
.bw-opts.stack{flex-direction:column;align-items:flex-start;flex-wrap:nowrap}
.bw-o .q{display:inline-block;width:var(--qw,1ch);text-align:right;font-style:normal;font-weight:600;color:var(--mute);font-variant-numeric:tabular-nums;font-size:11.5px}
.bw-o .q{margin-right:6px}.bw-o em{font-style:normal}
.bw-opts.stack .bw-h,.bw-opts.stack .bw-note{flex-basis:auto;align-self:stretch}.bw-o{flex:none}.bw-opts .bw-h,.bw-opts .bw-note{flex-basis:100%}
.bw-h{display:flex;align-items:center;justify-content:space-between;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:2px 0}
.bw-any{border:1px solid var(--line);background:none;color:var(--mute);border-radius:8px;padding:2px 8px;font:inherit;font-size:11px;letter-spacing:0;text-transform:none}
.bw-o{display:block;width:auto;text-align:left;border:1px solid var(--line);background:var(--card);color:var(--mute);border-radius:9px;padding:5px 8px;font:inherit;font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.2}
.bw-o{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.bw-o span{font-weight:500;color:var(--mute);font-size:11.5px}.bw-o b{color:var(--ink);font-size:12.5px}.bw-o i{font-style:normal;font-variant-numeric:tabular-nums;white-space:nowrap}
.bw-o:active{border-color:var(--gold)}
.bw-r{border-left:1px solid var(--line);padding-left:8px;padding-right:12px}
.bw-l{padding-right:10px}
/* slim scroll bars kept clear of the content */
.bw-l,.bw-r{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--mute) 45%,transparent) transparent}
.bw-l::-webkit-scrollbar,.bw-r::-webkit-scrollbar{width:6px}
.bw-l::-webkit-scrollbar-thumb,.bw-r::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--mute) 45%,transparent);border-radius:3px}
.bw-l::-webkit-scrollbar-track,.bw-r::-webkit-scrollbar-track{background:transparent}
.bw-n{font-size:11.5px;color:var(--mute);margin:2px 0 4px}.bw-n b{color:var(--ink)}
.bw-it{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;color:var(--ink);padding:7px 0;font:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bw-it.ln b{font-size:11px}.bw-it b{font-size:12px;color:var(--gold);font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700}
.bw-it span{font-size:11.5px;color:var(--mute)}
.bw-more{width:100%;margin:8px 0;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:7px;font:inherit;font-size:12px;font-weight:700}
.bw-note{font-size:12px;color:var(--mute);line-height:1.4}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, restore, fit: () => fit() };
})();
