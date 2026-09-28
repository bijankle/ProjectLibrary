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
  const order = (f, c) => Object.keys(c).sort(f === "sz" ? (x, y) => (x === "?") - (y === "?") || parseFloat(x) - parseFloat(y) || x.localeCompare(y)
    : f === "a" ? (x, y) => (x === "?") - (y === "?") || x.localeCompare(y) : (x, y) => (x === "?") - (y === "?") || c[y] - c[x] || x.localeCompare(y));

  let el = null, lk = null, resY = 0;
  function draw(){
    const list = rows.filter(match), st = nextStep();
    const crumbs = path.map((p, i) => `<button class="bw-cr" data-i="${i}" title="Remove this and the steps after it"><span>${esc(p.f === "t" ? TN[p.v] : p.v == null ? "Any " + steps()[i - 1][1].toLowerCase() : p.v === "?" ? "Other" : p.v)}</span><b>×</b></button>`).join("");
    let opts = "";
    if (st){
      const c = {}; for (const r of list) c[r[st[0]]] = (c[r[st[0]]] || 0) + 1;
      const vals = st[0] === "t" ? TYPES.map(x => x[0]).filter(v => c[v]) : order(st[0], c);
      opts = `<div class="bw-h">${esc(st[1])}${st[0] !== "t" ? `<button class="bw-any">Any</button>` : ""}</div>` +
        vals.map(v => { const n = st[0] === "t" ? "" : nameOf(st[0], t(), v), label = st[0] === "t" ? TN[v] : v === "?" ? "Other" : v;
          return `<button class="bw-o" data-v="${esc(v)}"><b>${esc(label)}</b>${n ? ` - ${esc(n)}` : ""} <i>(${c[v].toLocaleString()})</i></button>`; }).join("");
    } else opts = `<div class="bw-h">All steps set</div><div class="bw-note">Tap × on a step above to change it.</div>`;
    const hits = list.slice(0, shownN).map(r => r.it);
    el.innerHTML = `<div class="bw-l">${crumbs ? `<div class="bw-crs">${crumbs}</div>` : ""}<div class="bw-opts">${opts}</div></div>
      <div class="bw-r"><div class="bw-n"><b>${list.length.toLocaleString()}</b> ${list.length === 1 ? "item" : "items"}</div>
      ${hits.map((it, i) => `<button class="bw-it" data-i="${i}"><b>${Lookup.ICON[it.t] || ""} ${esc(it.key)}</b><span>${esc(it.name)}</span></button>`).join("")}
      ${list.length > hits.length ? `<button class="bw-more">Show ${Math.min(200, list.length - hits.length)} more</button>` : ""}</div>`;
    el.querySelectorAll(".bw-o").forEach(b => b.onclick = () => { path.push({ f: st[0], v: b.dataset.v }); after(); });
    const any = el.querySelector(".bw-any"); if (any) any.onclick = () => { path.push({ f: st[0], v: null }); after(); };
    el.querySelectorAll(".bw-cr").forEach(b => b.onclick = () => { path = path.slice(0, +b.dataset.i); after(); });
    el.querySelectorAll(".bw-it").forEach(b => b.onclick = () => { resY = el.querySelector(".bw-r").scrollTop; lk.openItem(hits[+b.dataset.i]); });
    const m = el.querySelector(".bw-more"); if (m) m.onclick = () => { const y = el.querySelector(".bw-r").scrollTop; shownN += 200; draw(); el.querySelector(".bw-r").scrollTop = y; };
    fit();
  }
  const after = () => { shownN = 60; save(); draw(); };
  // the two panes fill the screen below the search bar and scroll on their own
  function fit(){ if (!el || !el.offsetParent) return; el.style.height = Math.max(260, window.innerHeight - el.getBoundingClientRect().top - window.scrollY - 6) + "px"; }
  window.addEventListener("resize", fit);
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
  const restore = () => { fit(); const r = el && el.querySelector(".bw-r"); if (r) r.scrollTop = resY; };
  const css = `.bw{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;min-height:260px}
.bw-l,.bw-r{overflow-y:auto;overscroll-behavior:contain;min-height:0;-webkit-overflow-scrolling:touch}
.bw-l{display:flex;flex-direction:column;gap:6px;padding-right:2px}
.bw-crs{display:flex;flex-wrap:wrap;gap:4px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.bw-cr{display:flex;align-items:center;gap:5px;max-width:100%;border:1px solid var(--gold);background:var(--gold);color:#1a1307;border-radius:99px;padding:3px 5px 3px 9px;font:inherit;font-size:12px;font-weight:700}
.bw-cr span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bw-cr b{display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:rgba(0,0,0,.18);font-size:12px;line-height:1}
.bw-opts{display:flex;flex-direction:column;gap:4px}
.bw-h{display:flex;align-items:center;justify-content:space-between;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:2px 0}
.bw-any{border:1px solid var(--line);background:none;color:var(--mute);border-radius:8px;padding:2px 8px;font:inherit;font-size:11px;letter-spacing:0;text-transform:none}
.bw-o{display:block;width:100%;text-align:left;border:1px solid var(--line);background:var(--card);color:var(--mute);border-radius:9px;padding:6px 8px;font:inherit;font-size:12px;line-height:1.3}
.bw-o b{color:var(--ink);font-size:12.5px}.bw-o i{font-style:normal;font-variant-numeric:tabular-nums;white-space:nowrap}
.bw-o:active{border-color:var(--gold)}
.bw-r{border-left:1px solid var(--line);padding-left:8px}
.bw-n{font-size:11.5px;color:var(--mute);margin:2px 0 4px}.bw-n b{color:var(--ink)}
.bw-it{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;color:var(--ink);padding:6px 0;font:inherit}
.bw-it b{display:block;font-size:12.5px;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700}
.bw-it span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11.5px;line-height:1.3;color:var(--mute)}
.bw-more{width:100%;margin:8px 0;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:7px;font:inherit;font-size:12px;font-weight:700}
.bw-note{font-size:12px;color:var(--mute);line-height:1.4}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, restore };
})();
