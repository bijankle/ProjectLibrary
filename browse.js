// Browse: the phone home screen. Three side by side pill columns narrow the plant lists down to one asset:
// Type (equipment, instrument, valve, line…), Area (WBS number, F13 Milling…) and Kind (pump, tank, TE, ball valve…,
// which depends on the type). Columns can be picked in any order and every pill shows how many items it leaves.
// Tap a pill again to clear it. The last pick is remembered. Names come from browse.json (tools/build_browse.py).
// Browse.mount(el, lk) where lk is the search box from Lookup.mount (used to open an item).
window.Browse = (() => {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const TYPES = [["mel", "Equipment"], ["ins", "Instruments"], ["cv", "Control valves"], ["mv", "Manual valves"], ["line", "Lines"],
    ["spi", "Pipe specials"], ["hose", "Hoses"], ["pid", "Drawings"]];
  const SHORT = { mel: "Equip", ins: "Instr", cv: "Ctrl valve", mv: "Man valve", line: "Lines", spi: "Specials", hose: "Hoses", pid: "Drawings" };
  const TN = Object.fromEntries(TYPES);
  const CV = { XV: "On / off valve", PRV: "Pressure relief valve", SV: "Safety / solenoid valve", FCV: "Flow control valve", HV: "Hand actuated valve",
    PCV: "Pressure control valve", LCV: "Level control valve", TCV: "Temperature control valve", DCV: "Density control valve", XCV: "Control valve", SVO: "Solenoid valve" };
  const SPI = { EB: "Blower header", FR: "Not used", FS: "Deluge system", HS: "Slurry hose", MC: "Service / flushing coupling", MS: "Filter, trap, breather",
    MV: "Gland water valve", OP: "Orifice plate", SC: "Straub coupling", SP: "Spray nozzle / bar", SS: "Special spool / injector", ST: "Strainer", VC: "Victaulic coupling" };
  const KEY = "kcgm_browse";
  let B = null, rows = [], pick = { t: "", a: "", s: "" }, shownN = 60, subName = {};

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
  function build(){
    rows = [];
    for (const it of Lookup.items()){
      if (!TN[it.t]) continue;
      const f = facet(it); if (!f) continue;
      rows.push({ it, t: it.t, a: f[0] || "?", s: f[1] || "?" });
    }
    rows.sort((x, y) => x.it.key.localeCompare(y.it.key, undefined, { numeric: true }));
    subName = {
      mel: s => B.equip[s] || "", ins: insName, cv: s => CV[s] || "", mv: () => "", line: s => B.svc[s] || "", hose: s => B.svc[s] || "",
      pid: s => s === "PID" ? "Piping & instrument diagrams" : "Process flow diagrams",
      spi: s => SPI[s] || "" };
  }
  const areaName = a => a === "?" ? "No area in the tag" : B.areas[a] || "";
  const match = (r, skip) => (skip === "t" || !pick.t || r.t === pick.t) && (skip === "a" || !pick.a || r.a === pick.a) && (skip === "s" || !pick.s || r.s === pick.s);
  const count = (skip, key) => { const c = {}; for (const r of rows) if (match(r, skip)) c[r[key]] = (c[r[key]] || 0) + 1; return c; };
  const pill = (col, v, label, sub, n) => `<button class="bw-p${pick[col] === v ? " on" : ""}${n ? "" : " zero"}" data-c="${col}" data-v="${esc(v)}"><span class="bw-r"><b>${esc(label)}</b>${col === "t" ? "" : `<i>${(n || 0).toLocaleString()}</i>`}</span>${col === "t" ? `<span class="bw-s">${(n || 0).toLocaleString()}</span>` : sub ? `<span class="bw-s">${esc(sub)}</span>` : ""}</button>`;

  let el = null, lk = null;
  function draw(){
    const ct = count("t", "t"), ca = count("a", "a"), cs = pick.t ? count("s", "s") : {};
    const colT = TYPES.map(([t, n]) => pill("t", t, SHORT[t], "", ct[t])).join("");
    const colA = Object.keys(ca).concat(pick.a && !ca[pick.a] ? [pick.a] : []).sort((x, y) => x === "?" ? 1 : y === "?" ? -1 : x.localeCompare(y))
      .map(a => pill("a", a, a === "?" ? "Other" : a, areaName(a), ca[a])).join("");
    const colS = pick.t ? Object.keys(cs).concat(pick.s && !cs[pick.s] ? [pick.s] : []).sort((x, y) => (cs[y] || 0) - (cs[x] || 0) || x.localeCompare(y))
      .map(s => pill("s", s, s === "?" ? "Other" : s, s === "?" ? "" : subName[pick.t](s), cs[s])).join("")
      : `<div class="bw-hint">Pick a type to see its kinds (pump, tank, TE, ball valve…)</div>`;
    const list = rows.filter(r => match(r)), any = pick.t || pick.a || pick.s;
    const hits = list.slice(0, shownN).map(r => r.it);
    const label = [pick.t && TN[pick.t], pick.a && (pick.a === "?" ? "no area" : pick.a), pick.s && (pick.s === "?" ? "other" : pick.s)].filter(Boolean).join(" · ");
    el.innerHTML = `<div class="bw-top"><span>${any ? `<b>${list.length.toLocaleString()}</b> ${esc(label)}` : `Browse <b>${rows.length.toLocaleString()}</b> items: tap any column`}</span>${any ? `<button class="bw-clr">Clear</button>` : ""}</div>
      <div class="bw-cols"><div class="bw-col bw-ct"><h3>Type</h3>${colT}</div><div class="bw-col"><h3>Area</h3>${colA}</div><div class="bw-col"><h3>Kind</h3>${colS}</div></div>
      ${any ? `<div class="lk bw-res">${Lookup.resultsHTML(hits, label)}${list.length > hits.length ? `<button class="lk-more">Show ${Math.min(200, list.length - hits.length)} more (${list.length - hits.length} left)</button>` : ""}</div>` : ""}`;
    el.querySelectorAll(".bw-p").forEach(b => b.onclick = () => { const c = b.dataset.c, v = b.dataset.v;
      pick[c] = pick[c] === v ? "" : v; if (c === "t") pick.s = ""; shownN = 60; save(); keepScroll(draw); });
    const c = el.querySelector(".bw-clr"); if (c) c.onclick = () => { pick = { t: "", a: "", s: "" }; save(); draw(); };
    el.querySelectorAll(".bw-res .lk-row1").forEach(b => b.onclick = () => { lastY = window.scrollY; lk.openItem(hits[+b.dataset.i]); });
    const m = el.querySelector(".lk-more"); if (m) m.onclick = () => { shownN += 200; keepScroll(draw); };
    // keep the chosen pill in view inside its column
    el.querySelectorAll(".bw-col").forEach(col => { const on = col.querySelector(".bw-p.on"); if (on && on.offsetTop + on.offsetHeight > col.scrollTop + col.clientHeight) col.scrollTop = on.offsetTop - col.clientHeight / 3; });
  }
  // redraw without the page or the columns jumping
  function keepScroll(f){ const y = window.scrollY, s = [...el.querySelectorAll(".bw-col")].map(c => c.scrollTop); f();
    el.querySelectorAll(".bw-col").forEach((c, i) => { if (!c.querySelector(".bw-p.on") || i === 0) c.scrollTop = s[i] || 0; }); window.scrollTo(0, y); }
  let lastY = 0;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pick)); } catch (e) {} };
  function mount(root, box){
    el = root; lk = box; el.classList.add("bw");
    try { const p = JSON.parse(localStorage.getItem(KEY) || "null"); if (p) pick = Object.assign(pick, p); } catch (e) {}
    el.innerHTML = `<div class="bw-top"><span>Loading the plant lists…</span></div>`;
    Promise.all([Lookup.load(), fetch("browse.json").then(r => { if (!r.ok) throw new Error("browse.json " + r.status); return r.json(); })])
      .then(([, b]) => { B = b; build(); if (pick.t && !TN[pick.t]) pick = { t: "", a: "", s: "" }; draw(); })
      .catch(e => { el.innerHTML = `<div class="bw-top"><span>Couldn't load the lists (${esc(e.message)}). Check the connection and reopen the app.</span></div>`; });
  }
  // back from an item: return to where the list was
  const restore = () => { if (lastY) window.scrollTo(0, lastY); lastY = 0; };
  const css = `.bw-top{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13.5px;color:var(--mute);margin:2px 0 8px;min-height:30px}
.bw-top b{color:var(--ink)}
.bw-clr{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:5px 12px;font:inherit;font-weight:700;font-size:13px}
.bw-cols{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.1fr) minmax(0,1.1fr);gap:6px}
.bw-col{display:flex;flex-direction:column;gap:5px;max-height:min(52vh,460px);overflow-y:auto;overscroll-behavior:contain;position:relative;padding-bottom:2px}
.bw-col h3{position:sticky;top:0;z-index:1;margin:0;padding:0 2px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);background:var(--bg)}
.bw-p{flex:none;display:flex;flex-direction:column;gap:1px;width:100%;text-align:left;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:6px 7px;font:inherit;min-height:36px;justify-content:center}
.bw-p.on{border-color:var(--gold);background:var(--gold);color:#1a1307}
.bw-p.zero{opacity:.45}
.bw-r{display:flex;align-items:baseline;gap:4px;width:100%}
.bw-r b{flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bw-r i{font-style:normal;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--mute);flex:none}
.bw-s{font-size:10.5px;line-height:1.2;color:var(--mute);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bw-p.on .bw-s,.bw-p.on i{color:#3a2b0c}
.bw-hint{font-size:12px;color:var(--mute);line-height:1.35;padding:6px 2px}
.bw-res{margin-top:10px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, restore };
})();
