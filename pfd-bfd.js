// Smart PFD, zoomed right out: the plant as a block flow diagram, after the overall block flowsheets
// 2000-F00-BLK-PR-20001 (Stage 1) and -20002 (Stage 2). Blocks sit in their WBS areas (grey bands), the coloured
// edge on each block is its stage (existing, Stage 1, Stage 2, repurposed), the lines are coloured by fluid and the
// plant taken out of service sits faint down the left. It opens by itself when the PFD is zoomed out past the whole
// sheet (or from the ▦ button by the zoom buttons); clicking a block flies to its boxes on the PFD.
// PFDBlocks.mount(host, { go(ids, area) }) → { open(stage), close(), toggle(), isOpen() }
window.PFDBlocks = (() => {
  const ST = { ex: ["Existing", "#1f2937"], s1: ["Stage 1", "#16a34a"], r1: ["Stage 1, repurposed", "#2563eb"], s2: ["Stage 2", "#dc2626"], r2: ["Stage 2, repurposed", "#0ea5e9"], nu: ["Available, not used", "#9ca3af"] };
  const FL = { ore: ["Ore", "#a0522d"], flot: ["Flotation slurry", "#f28c28"], conc: ["Concentrate", "#d4a800"], tails: ["Tails", "#8a929c"], leach: ["Leach", "#ff5fa2"], carbon: ["Carbon", "#111827"], gold: ["Gold", "#b8960b"] };
  // [column, row, stage, name, WBS area, PFD boxes]
  const COMMON = {
    pco: [0, 0, "ex", "Primary crushing", "F12", ["pc1"]], fcos: [0, 1, "ex", "FIM crushed ore stockpile", "F12", ["cos1"]], fsag: [0, 2, "ex", "FIM SAG mill", "F13", ["fimsag", "fimpeb"]],
    pc: [1, 0, "s1", "Primary crushing", "F12", ["pc2"]], cos: [1, 1, "s1", "Crushed ore stockpile", "F12", ["cos2"]], sag: [1, 2, "s1", "SAG mill", "F13", ["sag", "dscr", "peb"]], bm: [1, 3, "s1", "Ball mill", "F13", ["bm", "cfh", "cyc", "trash"]],
    rsf: [2, 3, "s1", "Rougher / scavenger flotation", "F16", ["ffb", "r1", "r2", "r3", "s1", "s2", "s3", "s4"]], ftt: [3, 3, "s1", "Flotation tail thickener", "F17", ["ftt"]],
    cf: [1, 4, "s1", "Cleaner flotation (Jameson)", "F18", ["jc"]], ct: [1, 5, "r1", "Concentrate thickening", "F30", ["ct"]], csf: [2, 5, "s1", "Cleaner-scavenger flotation (Jameson)", "F18", ["jcs"]],
    cs: [1, 6, "ex", "Concentrate storage", "F30", ["fch", "fft"]], gr: [6, 6, "ex", "Goldroom", "F66", ["gold"]] };
  const STAGES = {
    1: { title: "Stage 1 block flowsheet", blocks: Object.assign({}, COMMON, {
        ftl: [4, 3, "ex", "Flotation tails leaching (CIL2/3)", "F30", ["cil2"]], ftc: [5, 3, "ex", "Flotation tails CIL (CIL2/3)", "F30", ["cil3"]], tsf: [7, 3, "ex", "Tailings storage facilities", "F23", ["ftk", "tsf"]],
        ufg: [2, 6, "s1", "Ultrafine grinding", "F28", ["ufg1", "ufg2"]], cplt: [3, 6, "ex", "Concentrate pre-leach thickening", "F30", ["plt"]], ccil: [4, 6, "ex", "Concentrate CIL (CIL1)", "F30", ["cil1"]],
        elu: [5, 6, "ex", "Elution circuits & e-winning", "F65", ["lcs3", "el3", "ew3", "kiln3", "sz3"]],
        cdes: [1, 7, "ex", "Concentrate deslime", "F30", []], slf: [2, 7, "ex", "Slimes flotation", "F30", []], cfl: [3, 8, "ex", "Concentrate filtration", "F28", ["filt"]], gid: [4, 8, "ex", "Offsite roaster", "", ["gidji"]] }),
      dec: ["Contract crushing", "MTC crushed ore stockpile", "MTC SAG mill", "FIM ball mill No.1 / No.2", "FIM rougher columns", "FIM scavenger flotation", "MTC rougher / scav flotation", "Existing cleaner flotation", "Existing cleaner scav flotation", "Pre-leach thickener (30-TH-31)"] },
    2: { title: "Stage 2 block flowsheet", blocks: Object.assign({}, COMMON, {
        ftl: [4, 3, "s2", "Flotation tails leaching", "F21", ["c4fb", "t411", "t412"]], ftc: [5, 3, "s2", "Flotation tails CIL", "F21", ["t413", "t414", "t415", "t416", "t417", "t418"]], tsf: [7, 3, "ex", "Tailings storage facilities", "F23", ["ftk", "tsf"]],
        e2: [6, 4, "s2", "Elution circuit & e-winning", "F22", ["lcs4", "tv4", "el4", "eu4", "ew4", "kiln4", "sz4"]], ccil: [4, 5, "r2", "Concentrate CIL", "F30", ["cil3"]],
        ufg: [2, 6, "s2", "Ultrafine grinding", "F28", ["ufg1", "ufg2", "ufg3"]], cplt: [3, 6, "r2", "Concentrate pre-leach thickening", "F30", ["plt"]], cl: [4, 6, "r2", "Concentrate leaching", "F30", ["cil2"]],
        elu: [5, 6, "ex", "Elution circuits & e-winning", "F65", ["lcs3", "el3", "ew3", "kiln3", "sz3"]],
        cfl: [3, 8, "nu", "Concentrate filtration", "F28", ["filt"]], gid: [4, 8, "nu", "Offsite roaster", "", ["gidji"]] }),
      dec: ["Contract crushing", "MTC crushed ore stockpile", "MTC SAG mill", "FIM ball mill No.1 / No.2", "FIM rougher columns", "FIM scavenger flotation", "MTC rougher / scav flotation", "Existing cleaner flotation", "Existing cleaner scav flotation", "Concentrate leaching (CIL1)", "Slimes flotation", "Mt Charlotte ball mill", "Mt Charlotte thickener", "Concentrate deslime"] } };
  // the lines: [fluid, label, dashed, points…] in screen pixels, from the laid out blocks (A: a block side's middle,
  // with an offset along it; X / Y: a column's or row's centre, halves for the gaps between)
  const LINES = {
    common: (A, X, Y, R, bw) => [
      ["ore", 0, 0, A("pco", "b"), A("fcos", "t")], ["ore", 0, 0, A("fcos", "b"), A("fsag", "t")], ["ore", 0, 0, A("fsag", "b"), [X(0), Y(2.55)], [X(1) - bw / 4, Y(2.55)], A("bm", "t", -bw / 4)],
      ["ore", 0, 0, A("pc", "b"), A("cos", "t")], ["ore", 0, 0, A("cos", "b"), A("sag", "t")], ["ore", 0, 0, A("sag", "b"), A("bm", "t")], ["flot", 0, 0, A("bm", "r"), A("rsf", "l")],
      ["tails", "Tail", 0, A("rsf", "r"), A("ftt", "l", -6)], ["conc", "Conc", 0, A("rsf", "b"), [X(2), Y(3.5)], [X(1), Y(3.5)], A("cf", "t")],
      ["flot", "Tail", 0, A("cf", "r"), [X(2) + bw / 4, R.cf.cy], A("csf", "t", bw / 4)], ["conc", "Conc", 0, A("cf", "b"), A("ct", "t")],
      ["tails", "Tail", 0, A("csf", "r"), [X(2.5), R.csf.cy], [X(2.5), R.ftt.cy + 8], A("ftt", "l", 8)], ["conc", "Conc", 0, A("csf", "b"), [X(2), Y(5.5)], [X(1.5), Y(5.5)], [X(1.5), Y(3.5) + 3]],
      ["conc", 0, 0, A("ct", "b"), A("cs", "t")], ["tails", 0, 0, A("ftt", "r"), A("ftl", "l")], ["leach", 0, 0, A("ftl", "r"), A("ftc", "l")],
      ["conc", 0, 0, A("cs", "r"), A("ufg", "l")], ["conc", 0, 0, A("ufg", "r"), A("cplt", "l")], ["gold", 0, 0, A("elu", "r"), A("gr", "l")]],
    1: (A, X, Y, R, bw) => [
      ["tails", 0, 0, A("ftc", "r"), A("tsf", "l")], ["tails", 0, 0, A("ftt", "t"), [X(3), Y(2.5)], [X(7), Y(2.5)], A("tsf", "t")],
      ["carbon", "Carbon", 0, A("ftc", "b"), A("elu", "t")], ["conc", 0, 0, A("cplt", "r"), A("ccil", "l")], ["tails", "Tail", 0, A("ccil", "t"), A("ftl", "b")],
      ["carbon", "Carbon", 0, A("ccil", "r"), A("elu", "l")], ["conc", 0, 0, A("cs", "b"), A("cdes", "t")], ["conc", "O/F", 0, A("cdes", "r"), A("slf", "l")],
      ["tails", "Tail", 0, A("slf", "r"), [X(2.5), R.slf.cy], [X(2.5), R.cplt.cy + 3]], ["conc", "U/F", 0, A("cdes", "b"), [X(1), R.cfl.cy], A("cfl", "l")],
      ["conc", "Conc", 0, A("slf", "b"), [X(2), R.cfl.cy - 3]], ["conc", 0, 0, A("cfl", "r"), A("gid", "l")], ["carbon", "Carbon", 0, A("gid", "r"), [X(5), R.gid.cy], A("elu", "b")]],
    2: (A, X, Y, R, bw) => [
      ["tails", 0, 0, A("ftc", "r", -7), [R.tsf.x, R.ftc.cy - 7]], ["carbon", "Carbon", 0, A("ftc", "r", 8), [X(6), R.ftc.cy + 8], A("e2", "t")], ["gold", 0, 0, A("e2", "b"), A("gr", "t")],
      ["conc", 0, 0, A("cplt", "r"), A("cl", "l")], ["leach", 0, 0, A("cl", "t"), A("ccil", "b")], ["tails", "Tail", 0, A("ccil", "t"), A("ftl", "b")],
      ["carbon", "Carbon", 0, A("ccil", "r"), [X(5), R.ccil.cy], A("elu", "t")],
      ["conc", 0, 1, A("cs", "b"), [X(1), R.cfl.cy], A("cfl", "l")], ["conc", 0, 1, A("cfl", "r"), A("gid", "l")], ["carbon", "Carbon", 1, A("gid", "r"), [X(5), R.gid.cy], A("elu", "b")]] };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // an area's name from the PFD titles, "F12 - PRIMARY CRUSHING (F10 - EXISTING)" gives F12 and F10 their names
  const NAMES = {}; (typeof FRAMES != "undefined" ? FRAMES : []).forEach(f => String(f.label).split(/[()]/).forEach(p => { const m = p.match(/(F\d+)\s*-\s*(.+)/); if (m && !NAMES[m[1]]) NAMES[m[1]] = m[2].trim(); }));
  const areaName = c => (NAMES[c] || "").replace(/^CIL\d\s+/i, "").toLowerCase().replace(/(^|[\s/&,])([a-z])/g, (x, a, b) => a + b.toUpperCase()).replace(/\bEw\b/g, "EW").replace(/\bUfg\b/g, "UFG").replace(/\bCil(\d?)\b/g, "CIL$1");
  function mount(host, o){
    const el = document.createElement("div"); el.className = "bf"; el.hidden = true; el.lang = "en"; host.appendChild(el);
    let stage = 2;
    function draw(){
      if (el.hidden) return;
      const S = STAGES[stage], W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
      // (dark mode: the near black of carbon and of existing plant would vanish on the dark page)
      const dark = document.documentElement.dataset.theme === "dark", col = c => dark && (c === "#111827" || c === "#1f2937") ? "#d1d5db" : c;
      // squarish blocks (the name wraps) on a close grid, the whole diagram centred
      const bw = Math.max(64, Math.min(96, (W - 20) / 8 - 30)), cw = Math.min((W - 20) / 8, bw + 46), rh = Math.min((H - 36) / 9, 98);
      const L0 = (W - 8 * cw) / 2, T0 = Math.max(28, (H - 9 * rh) / 2);
      const X = c => L0 + c * cw + cw / 2, Y = r => T0 + r * rh + rh / 2;
      // on a short screen the blocks get flatter and the area names keep to one line, so the bands never overlap
      const two = rh >= 90, BH = Math.max(30, Math.min(50, rh - (two ? 44 : 32))); el.style.setProperty("--bh", BH + "px"); el.classList.toggle("bf-1l", !two);
      el.innerHTML = ""; const R = {};
      Object.entries(S.blocks).forEach(([k, [c, r, s, n, code, ids]]) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "bf-b" + (s === "nu" ? " nu" : ""); b.style.cssText = `width:${bw}px;--sc:${col(ST[s][1])}`;
        b.innerHTML = `<span>${esc(n)}</span>`; b.title = `${n}${code ? " (" + code + ")" : ""}, ${ST[s][0].toLowerCase()}. Click to see it on the PFD`;
        b.onclick = () => { close(); o.go(ids, code); };
        el.appendChild(b); const h = b.offsetHeight; b.style.left = (X(c) - bw / 2) + "px"; b.style.top = (Y(r) - h / 2) + "px";
        R[k] = { x: X(c) - bw / 2, y: Y(r) - h / 2, w: bw, h, cx: X(c), cy: Y(r) }; });
      // the WBS bands: one round each touching group of blocks in the same area
      const seen = new Set(), bands = [];
      Object.entries(S.blocks).forEach(([k, v]) => { if (v[2] === "nu" || !v[4] || seen.has(k)) return;
        const grp = [k], q = [k]; seen.add(k);
        while (q.length){ const a = S.blocks[q.pop()]; Object.entries(S.blocks).forEach(([k2, v2]) => { if (!seen.has(k2) && v2[4] === v[4] && v2[2] !== "nu" && Math.abs(v2[0] - a[0]) + Math.abs(v2[1] - a[1]) === 1){ seen.add(k2); grp.push(k2); q.push(k2); } }); }
        bands.push([v[4], grp.map(x => R[x])]); });
      bands.forEach(([code, rs]) => { const x1 = Math.min(...rs.map(r => r.x)) - 8, y1 = Math.min(...rs.map(r => r.y)) - (two ? 30 : 18), x2 = Math.max(...rs.map(r => r.x + r.w)) + 8, y2 = Math.max(...rs.map(r => r.y + r.h)) + 8;
        el.insertAdjacentHTML("afterbegin", `<div class="bf-band" style="left:${x1}px;top:${y1}px;width:${x2 - x1}px;height:${y2 - y1}px"><i>${code}<em> ${esc(areaName(code))}</em></i></div>`); });
      // the plant taken out of service, faint down the left
      // the lines, under the blocks
      const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("class", "bf-ln");
      el.insertBefore(svg, el.querySelector(".bf-b"));
      const defs = document.createElementNS(NS, "defs"); svg.appendChild(defs);
      Object.entries(FL).forEach(([k, [, c]]) => defs.insertAdjacentHTML("beforeend", `<marker id="bfm_${k}" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0L10 5L0 10z" fill="${col(c)}"/></marker>`));
      const A = (k, s, d = 0) => { const r = R[k]; return s === "r" ? [r.x + r.w, r.cy + d] : s === "l" ? [r.x, r.cy + d] : s === "t" ? [r.cx + d, r.y] : [r.cx + d, r.y + r.h]; };
      LINES.common(A, X, Y, R, bw).concat(LINES[stage](A, X, Y, R, bw)).forEach(([fl, lab, dash, ...pts]) => {
        const c = col(FL[fl][1]), p = document.createElementNS(NS, "path");
        p.setAttribute("d", "M" + pts.map(q => q.join(" ")).join("L")); p.setAttribute("stroke", c); p.setAttribute("marker-end", `url(#bfm_${fl})`); if (dash) p.setAttribute("stroke-dasharray", "6 4"); svg.appendChild(p);
        if (!lab) return;   // a label beside the longest straight run, left off a line too short to carry one
        let i0 = 0, best = 0; for (let i = 0; i < pts.length - 1; i++){ const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (l > best){ best = l; i0 = i; } }
        if (best < 44) return;
        const [x1, y1] = pts[i0], [x2, y2] = pts[i0 + 1], hz = Math.abs(y2 - y1) < 1, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        el.insertAdjacentHTML("beforeend", `<span class="bf-el${hz ? " hz" : ""}" style="left:${hz ? mx : mx + 5}px;top:${hz ? my - 13 : my}px;color:${c}">${lab}</span>`); });
      el.insertAdjacentHTML("beforeend", `<div class="bf-lg"><div class="bf-top"><b>${S.title}</b><span class="bf-seg">${[1, 2].map(s => `<button type="button" data-s="${s}"${s === stage ? ' class="on"' : ""}>Stage ${s}</button>`).join("")}</span><button type="button" class="bf-x" title="Back to the PFD">✕</button></div>` +
        `<div>${Object.values(FL).map(([t, c]) => `<span><i style="background:${col(c)}"></i>${t}</span>`).join("")}</div>` +
        `<div>${Object.values(ST).map(([t, c]) => `<span><i class="e" style="background:${col(c)}"></i>${t}</span>`).join("")}</div></div>`);
      el.querySelectorAll(".bf-seg button").forEach(b => b.onclick = () => { stage = +b.dataset.s; draw(); });
      el.querySelector(".bf-x").onclick = () => { close(); o.back && o.back(); };
    }
    // zooming in over the blocks goes back to the whole PFD
    el.addEventListener("wheel", e => { e.preventDefault(); if (e.deltaY < 0){ close(); o.back && o.back(); } }, { passive: false });
    addEventListener("resize", () => draw());
    function open(s){ if (s) stage = s; el.hidden = false; host.classList.add("bf-on"); draw(); o.state && o.state(true); }
    function close(){ if (el.hidden) return; el.hidden = true; host.classList.remove("bf-on"); o.state && o.state(false); }
    return { open, close, toggle: () => el.hidden ? open() : close(), isOpen: () => !el.hidden };
  }

  const css = `.bf{position:absolute;inset:0;z-index:6;background:var(--bg);font-family:system-ui,sans-serif;overflow:hidden;overscroll-behavior:contain}.bf[hidden]{display:none}
.bf-ln{position:absolute;left:0;top:0;pointer-events:none}.bf-ln path{fill:none;stroke-width:2.4;stroke-linejoin:round}
.bf-b{position:absolute;box-sizing:border-box;background:var(--card,var(--panel));border:1.5px solid color-mix(in srgb,var(--ink) 30%,transparent);border-radius:9px;padding:6px;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;box-shadow:inset 4px 0 0 var(--sc);font:inherit;color:var(--ink)}
.bf-b:hover,.bf-b:focus-visible{border-color:var(--th,var(--accent));box-shadow:inset 4px 0 0 var(--sc),0 0 0 3px var(--th-t,#eef1f5);outline:none}
.bf-b{min-height:var(--bh,50px)}.bf-1l .bf-band i{-webkit-line-clamp:1;max-height:12px}.bf-b span{font-size:10.5px;font-weight:700;line-height:1.2;hyphens:auto}
.bf-b.nu{border-style:dashed;background:transparent}.bf-b.nu span{color:var(--mute)}
.bf-band{position:absolute;border-radius:12px;background:color-mix(in srgb,var(--ink) 4%,transparent)}
.bf-band i{position:absolute;left:7px;right:7px;top:2px;font-style:normal;font-size:10px;font-weight:900;color:var(--mute);line-height:12px;max-height:24px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.bf-band em{font-style:normal;font-weight:700}
.bf-dh{position:absolute;font-size:9px;font-weight:800;letter-spacing:-.01em;color:color-mix(in srgb,var(--mute) 70%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bf-dec{position:absolute;box-sizing:border-box;border:1.5px dotted color-mix(in srgb,var(--ink) 18%,transparent);border-radius:7px;display:flex;align-items:center;justify-content:center;text-align:center;padding:3px;overflow:hidden}
.bf-dec span{font-size:9px;line-height:1.1;color:color-mix(in srgb,var(--mute) 75%,transparent)}
.bf-el{position:absolute;font-size:10px;font-weight:800;white-space:nowrap;letter-spacing:.02em;transform:translateY(-50%);pointer-events:none}.bf-el.hz{transform:translateX(-50%)}
.bf-lg{position:absolute;right:10px;top:8px;max-width:400px;display:flex;flex-direction:column;align-items:flex-end;gap:5px;font-size:10.5px;color:var(--ink)}
.bf-lg>div{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px 10px}.bf-lg span{display:inline-flex;align-items:center;gap:4px}.bf-lg i{width:14px;height:3px;border-radius:2px}.bf-lg i.e{width:4px;height:12px}
.bf-top{align-items:center}.bf-top b{font-size:12.5px;font-weight:800}
.bf-seg{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:color-mix(in srgb,var(--ink) 8%,transparent)}
.bf-seg button{border:0;background:none;border-radius:6px;padding:3px 8px;font:inherit;font-size:11.5px;font-weight:700;color:var(--mute);cursor:pointer}.bf-seg button.on{background:var(--th-t,#eef1f5);color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--th,#475569)}
.bf-x{border:1px solid var(--line);background:var(--card,var(--panel));border-radius:7px;width:26px;height:24px;cursor:pointer;color:var(--ink);font-size:13px;padding:0}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount };
})();
