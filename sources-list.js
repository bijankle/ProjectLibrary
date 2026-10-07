// Sources: every document the app is built from, one row each (every P&ID and PFD sheet on its own), filtered by a
// search and by type pills (P&IDs, PFDs, Lists, Reports, Specs, Drawings), with area pills under the drawing types.
// Each row has two kinds of button: Save puts the redacted file (PDF, or the cleaned Excel copy) in the Downloads
// folder; Cache stores it on this device (offline.js, the kcgm-docs cache) so it opens with no signal. "Cache all" does
// the same for everything the filters show, and "Save all" (desktop) puts all of it in Downloads as one zip. Desktop: a filter panel on the left and a table (issues.html#sources).
// Phone: pills over a list (Settings → Sources, the Settings search box filters it). SourcesList.mount(el, {phone, input}).
window.SourcesList = (() => {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mb = b => { const v = (b || 0) / 1e6; return v === 0 ? "0" : v < 1 ? String(+v.toFixed(2)) : v < 10 ? String(+v.toFixed(1)) : String(Math.round(v)); };
  const TYPES = [["pid", "P&IDs"], ["pfd", "PFDs"], ["list", "Lists"], ["report", "Reports"], ["spec", "Specs"], ["dwg", "Drawings"], ["other", "Other"]];
  const TN = Object.fromEntries(TYPES);
  // area names for the area pills: the glossary's F codes, first part only ("F13 Milling & Classification")
  const AREA = { F00: "General site", F10: "Primary crushing 1", F12: "Primary crushing", F13: "Milling", F14: "Gravity & ILR", F15: "Mt Charlotte reclaim", F16: "Rougher flotation",
    F17: "Pre-leach thickening", F18: "Cleaner flotation", F19: "Milling, existing A", F20: "Milling, area B", F21: "CIL4", F22: "CIL4 elution", F23: "Final tails", F24: "Air & water",
    F25: "Cleaners, existing", F26: "Cleaner scav., existing", F28: "UFG 2/3", F30: "CIL2/3", F34: "UFG 1", F35: "Concentrate", F65: "Conc. elution", F66: "Goldroom",
    F70: "Lime & floc", F71: "Reagents, existing", F72: "Reagents", F75: "Water, existing", F78: "Carbon regen", F81: "Air, existing", F175: "TSF" };
  const ICO = {
    save: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v10M7.5 9.5 12 14l4.5-4.5M5 19h14"/></svg>',
    dev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M12 7v7M9.5 11.5 12 14l2.5-2.5"/></svg>',
    devOk: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M9.3 12l2 2 3.6-4"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>' };

  // ---------- the documents ----------
  let DOCS = null;
  async function load(){
    if (DOCS) return DOCS;
    const j = u => fetch(u).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const [P, six, iss] = await Promise.all([j("PIDs/index.json"), j("sources/index.json"), j("issues.json")]);
    if (window.Offline) await Offline.load().catch(() => {});
    const off = (window.Offline && Offline.load && await Offline.load().catch(() => null)) || { groups: [], sz: {} };
    const grp = id => (off.groups || []).find(g => g.id === id);
    const out = [], meta = (iss.meta && iss.meta.docs) || {};
    // a drawing that is also a source document (the PDC, the plant layout) joins that document's row
    const JOIN = { "2000-F00-DCR-PR-10002": "pdc", "2000-F00-DRG-GE-20001": "layout" };
    Object.entries(P.pids || {}).forEach(([k, d]) => { if (JOIN[k]) return;
      const t = /-PID-/.test(k) ? "pid" : /-PFD-/.test(k) ? "pfd" : "dwg", area = k.split("-")[1];
      out.push({ k, t, number: k, title: d.title || "", rev: d.rev || "", date: d.date || "", area, pdf: d.file, size: d.size, keep: [d.file].concat(Object.keys(off.sz || {}).filter(f => f.startsWith(d.file + ".p"))), tsf: !!d.proj_src }); });   // (with its sheet pictures)
    const KIND = { List: "list", Report: "report", Specification: "spec", Drawing: "dwg", Reference: "other" };
    Object.entries(meta).forEach(([k, v]) => {
      const s = six[k], g = grp("src-" + k), pdfK = Object.keys(JOIN).find(n => JOIN[n] === k), pd = pdfK && P.pids && P.pids[pdfK];
      const keep = (g ? g.files : []).concat(pd ? [pd.file] : []);
      out.push({ k, t: k === "pfd" ? "pfd" : KIND[v.kind] || "other", number: v.number, title: v.full || v.title, rev: v.rev || "", date: v.date || "", info: v,
        xlsx: s && s.xlsx, xname: s && s.fname, tables: !!s, pdf: pd && pd.file, size: keep.reduce((t, f) => t + (off.sz[f] || 0), 0) || (s && s.size), keep }); });
    const sp = grp("spec");
    out.push({ k: "spec", t: "spec", number: "2000-F00-STS-PP-10001", title: "Piping and Valve Specification", rev: "3", pdf: "spec/pvs.pdf", size: sp ? sp.size : 0, keep: ["spec/pvs.pdf"] });
    const ORD = new Intl.Collator(undefined, { numeric: true });
    out.sort((a, b) => TYPES.findIndex(x => x[0] === a.t) - TYPES.findIndex(x => x[0] === b.t) || ORD.compare(a.number, b.number));
    out.forEach(d => d.hay = [d.number, d.number.replace(/^2000-/, ""), d.title, TN[d.t], d.area, AREA[d.area] || "", d.rev ? "rev " + d.rev : ""].join(" ").toLowerCase());
    return (DOCS = out);
  }

  // a zip with the files stored as they are (PDFs are already packed): [[name, bytes]] → Blob
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = u => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files){
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    const hd = (n, f) => { const b = new DataView(new ArrayBuffer(n)); f(b); return new Uint8Array(b.buffer); };
    files.forEach(([name, data]) => { const nm = enc.encode(name), c = crc(data), L = data.length;
      const loc = hd(30, v => { v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint32(14, c, true); v.setUint32(18, L, true); v.setUint32(22, L, true); v.setUint16(26, nm.length, true); });
      cen.push(hd(46, v => { v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x800, true); v.setUint32(16, c, true); v.setUint32(20, L, true); v.setUint32(24, L, true); v.setUint16(28, nm.length, true); v.setUint32(42, off, true); }), nm);
      parts.push(loc, nm, data); off += 30 + nm.length + L; });
    const cs = cen.reduce((t, u) => t + u.length, 0);
    const end = hd(22, v => { v.setUint32(0, 0x06054b50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true); v.setUint32(12, cs, true); v.setUint32(16, off, true); });
    return new Blob([...parts, ...cen, end], { type: "application/zip" }); }

  // ---------- one list on the page ----------
  function mount(el, o = {}){
    const phone = !!o.phone;
    let type = "", area = "", q = "", st = {}, busyRow = null, stop = { x: false };
    try { const v = JSON.parse(localStorage.getItem("kcgm_srcf") || "{}"); type = v.t || ""; area = v.a || ""; } catch (e) {}
    const keepF = () => { try { localStorage.setItem("kcgm_srcf", JSON.stringify({ t: type, a: area })); } catch (e) {} };
    el.classList.add("sl", phone ? "sl-ph" : "sl-dt");
    el.innerHTML = phone ? `<div class="sl-types sl-pills"></div><div class="sl-areas sl-pills"></div><div class="sl-bar"></div><div class="sl-list"></div>`
      : `<aside class="sl-side"><input type="search" class="sl-q" placeholder="Search sources" aria-label="Search sources" autocomplete="off"><div class="sl-hb"><button type="button" class="sl-b sl-sva" title="Save every document listed to Downloads, as one zip">${ICO.save}<span>Save all</span></button></div><div class="sl-h">Type</div><div class="sl-types"></div><div class="sl-ah"><div class="sl-h">Area</div><div class="sl-areas"></div></div></aside>
         <div class="sl-main"><div class="sl-bar"></div><table class="sl-tb"><thead><tr><th>Document number</th><th>Title</th><th>Rev</th><th>Size</th><th class="sl-bh" colspan="3"></th></tr></thead><tbody class="sl-list"></tbody></table></div>`;
    const $ = s => el.querySelector(s);
    const input = o.input || $(".sl-q");
    if (input){ input.addEventListener("input", () => { q = input.value.trim().toLowerCase(); draw(); }); }
    el.innerHTML.length && ($(".sl-list").innerHTML = `<div class="sl-none">Loading…</div>`);
    const words = () => q.split(/\s+/).filter(Boolean);
    const match = d => { const w = words(); return w.every(x => d.hay.includes(x)); };
    const subOf = t => t === "pid" || t === "pfd";
    function shown(){ return DOCS.filter(d => match(d) && (!type || d.t === type) && (!area || d.area === area)); }
    const stOf = d => { const s = d.keep.map(f => st[f]); return !s.length ? "none" : s.every(x => x === "ok") ? "ok" : s.some(x => x === "old") ? "old" : s.some(x => x === "ok") ? "part" : "no"; };
    const fname = d => (d.number + (d.rev ? " Rev " + d.rev : "") + (d.title && d.t !== "list" ? " " + d.title : "")).replace(/[\\/:*?"<>|]+/g, " ").trim();
    const saveBtn = (d, kind) => { const href = kind === "x" ? d.xlsx : d.pdf; if (!href) return phone ? "" : `<span class="sl-b sl-b0"></span>`;
      const name = kind === "x" ? d.xname || fname(d) + ".xlsx" : fname(d) + ".pdf", lab = kind === "x" ? "Excel" : "PDF";
      return `<a class="sl-b sl-sv" href="${esc(href)}" download="${esc(name)}" title="Save the ${lab} to Downloads">${ICO.save}<span>${lab}</span></a>`; };
    const keepBtn = d => { const s = stOf(d);
      if (!d.keep.length) return `<span class="sl-b sl-b0"></span>`;
      const lab = s === "ok" ? "Cached" : s === "old" ? "Update" : "Cache";
      return `<button type="button" class="sl-b sl-kp ${s}" data-k="${esc(d.k)}" title="${s === "ok" ? "Cached on this device. Tap to remove" : "Cache on this device to open with no signal"}">${s === "ok" ? ICO.devOk : ICO.dev}<span>${lab}</span></button>`; };
    function pills(){
      const base = DOCS.filter(match), cnt = {}; base.forEach(d => cnt[d.t] = (cnt[d.t] || 0) + 1);
      const tp = [["", "All", base.length], ...TYPES.filter(([k]) => cnt[k]).map(([k, n]) => [k, n, cnt[k]])];
      $(".sl-types").innerHTML = tp.map(([k, n, c]) => phone ? `<button type="button" class="sl-p${type === k ? " on" : ""}" data-t="${k}">${esc(n)}<i>${c}</i></button>`
        : `<button type="button" class="sl-p${type === k ? " on" : ""}" data-t="${k}">${esc(n)}<i>${c}</i></button>`).join("");
      const ab = base.filter(d => d.t === type), ac = {}; ab.forEach(d => ac[d.area] = (ac[d.area] || 0) + 1);
      const areas = subOf(type) ? Object.keys(ac).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))) : [];
      if (area && !ac[area]) area = "";
      const ae = $(".sl-areas"); ae.hidden = !areas.length; if (!phone) $(".sl-ah").hidden = !areas.length;
      ae.innerHTML = areas.length ? (phone ? `<button type="button" class="sl-p sl-ps${area ? "" : " on"}" data-a="">All areas</button>` : "") +
        areas.map(a => phone ? `<button type="button" class="sl-p sl-ps${area === a ? " on" : ""}" data-a="${a}">${a} ${esc(AREA[a] || "")}<i>${ac[a]}</i></button>`
          : `<button type="button" class="sl-p${area === a ? " on" : ""}" data-a="${a}">${a} ${esc(AREA[a] || "")}<i>${ac[a]}</i></button>`).join("") : "";
      el.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { type = type === b.dataset.t ? "" : b.dataset.t; area = ""; keepF(); draw(); });
      el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => { area = area === b.dataset.a ? "" : b.dataset.a; keepF(); draw(); });
    }
    let list = [];
    let redraw = false;   // (a redraw asked for while a download runs waits for it: it would wipe the running row)
    function draw(){ if (busyRow){ redraw = true; return; } redraw = false;
      if (!DOCS) return; pills(); list = shown();
      const need = list.filter(d => stOf(d) !== "ok" && stOf(d) !== "none"), files = [...new Set(need.flatMap(d => d.keep.filter(f => st[f] !== "ok")))];
      const left = files.reduce((t, f) => t + ((Offline.load && OFF && OFF.sz[f]) || 0), 0), allF = [...new Set(list.flatMap(d => d.keep))],
        have = allF.filter(f => st[f] === "ok").reduce((t, f) => t + ((OFF && OFF.sz[f]) || 0), 0), what = type ? TN[type].replace("&amp;", "&") : "documents";
      const noun = list.length === 1 ? "document" : subOf(type) ? "drawings" : "documents";
      $(".sl-bar").innerHTML = `<span class="sl-n"><b>${list.length}</b> ${noun}${!phone && type ? ` · ${esc(TN[type])}` : ""}${!phone && area ? ` · ${area} ${esc(AREA[area] || "")}` : ""}</span>` +
        (list.length ? need.length ? (phone ? `<button type="button" class="sl-all">Cache all ${need.length}</button>`
          : `<span class="sl-alln">${mb(have)} of ${mb(have + left)} MB</span>`)
          : phone ? `<span class="sl-allok">${ICO.devOk} All cached</span>` : `<span class="sl-alln">${mb(have)} of ${mb(have)} MB</span>` : "") + `<i class="sl-pg"><i></i></i>`;
      // desktop: Cache all heads the button columns, its "x of y MB" just above it
      if (!phone){ $(".sl-bh").innerHTML = !list.length ? "" : need.length ? `<button type="button" class="sl-b sl-all" title="Cache every document listed on this device">${ICO.dev}<span>Cache all</span></button>`
          : `<span class="sl-b sl-kp ok sl-allc" title="Everything listed is cached on this device">${ICO.devOk}<span>All cached</span></span>`;
        requestAnimationFrame(() => { const n = $(".sl-alln"), th = $(".sl-bh"); if (n && th) n.style.left = (th.getBoundingClientRect().left - $(".sl-bar").getBoundingClientRect().left + 2) + "px"; }); }
      const rows = list.slice(0, 400);
      // desktop: a Save column shows only when something listed has that file (the columns stay lined up)
      // desktop: each row's buttons packed from the left (Cache, PDF, Excel), as many button columns as the fullest row
      const btns = d => [d.keep.length ? keepBtn(d) : "", d.pdf ? saveBtn(d, "p") : "", d.xlsx ? saveBtn(d, "x") : ""].filter(Boolean);
      const nb = phone ? 0 : Math.max(1, ...rows.map(d => btns(d).length));
      const cells = d => { const b = btns(d); while (b.length < nb) b.push(`<span class="sl-b sl-b0"></span>`); return b.map((x, i) => `<td class="sl-c">${x}${i === 0 ? `<i class="sl-rb"><i></i></i>` : ""}</td>`).join(""); };
      if (!phone) $(".sl-bh").colSpan = nb;
      $(".sl-list").innerHTML = rows.map(d => phone
        ? `<div class="sl-r" data-r="${esc(d.k)}"><div class="sl-t"><b>${esc(d.number.replace(/^2000-/, ""))}</b><span>${esc([d.title, d.rev ? "Rev " + d.rev : "", d.size ? mb(d.size) + " MB" : ""].filter(Boolean).join(" · "))}</span></div>${saveBtn(d, d.t === "list" || !d.pdf ? "x" : "p")}${keepBtn(d)}<i class="sl-rb"><i></i></i></div>`
        : `<tr data-r="${esc(d.k)}"><td class="sl-num">${esc(d.number)}</td><td class="sl-ti"><button type="button" class="sl-op">${esc(d.title)}</button>${d.info ? `<button type="button" class="sl-ib" title="Details">ⓘ</button>` : ""}</td><td class="sl-rev">${d.rev ? "Rev " + esc(d.rev) : "–"}</td><td class="sl-sz">${d.size ? mb(d.size) + " MB" : ""}</td>${cells(d)}</tr>`).join("") +
        (list.length > rows.length ? (phone ? `<div class="sl-none">${list.length - rows.length} more: search to narrow</div>` : `<tr><td colspan="7" class="sl-none">${list.length - rows.length} more: search to narrow</td></tr>`)
          : !list.length ? (phone ? `<div class="sl-none">Nothing matches.</div>` : `<tr><td colspan="7" class="sl-none">Nothing matches.</td></tr>`) : "");
      wire();
    }
    let OFF = null;
    function wire(){
      el.querySelectorAll(".sl-kp").forEach(b => b.onclick = e => { e.stopPropagation(); const d = DOCS.find(x => x.k === b.dataset.k); if (!d) return;
        if (busyRow){ stop.x = true; return; }
        if (stOf(d) === "ok"){ if (confirm(`Remove ${d.number} from this device?`)) Offline.drop(d.keep).then(refresh); return; }
        run([d], b.closest("[data-r]")); });
      const all = $(".sl-all"); if (all) all.onclick = () => { if (busyRow){ stop.x = true; return; } run(list.filter(d => stOf(d) !== "ok"), null); };
      const sva = $(".sl-sva"); if (sva) sva.onclick = () => saveAll(list, sva);
      el.querySelectorAll(".sl-sv").forEach(a => a.addEventListener("click", e => e.stopPropagation()));
      el.querySelectorAll(".sl-ib").forEach(b => b.onclick = e => { e.stopPropagation(); const tr = b.closest("tr"), nx = tr.nextElementSibling;
        if (nx && nx.classList.contains("sl-info")){ nx.remove(); b.classList.remove("on"); return; }
        const d = DOCS.find(x => x.k === tr.dataset.r), v = d.info || {}, kv = (l, x) => x ? `<div><span>${l}</span>${esc(x)}</div>` : "";
        tr.insertAdjacentHTML("afterend", `<tr class="sl-info"><td colspan="7"><div class="sl-kv">${kv("Type", v.kind)}${kv("Revision date", v.date)}${kv("Status", v.status)}${kv("Used in the app for", v.used)}${kv("Note", v.note)}</div></td></tr>`); b.classList.add("on"); });
      el.querySelectorAll(phone ? ".sl-r" : ".sl-op").forEach(x => x.onclick = () => openDoc(DOCS.find(d => d.k === x.closest("[data-r]").dataset.r)));
    }
    // open a document: a drawing in the app's viewer (or the browser's), a list as its tables
    function openDoc(d){ if (!d) return;
      if (d.tables && !d.pdf && window.SourceView) return SourceView.open(d.k, `${d.number} ${d.title}${d.rev ? " Rev " + d.rev : ""}`);
      if (window.Pid && Pid.has && Pid.has(d.number)) return Pid.open(d.number);
      if (d.pdf) return window.open(d.pdf, "_blank", "noopener");
      if (window.SourceView && d.tables) SourceView.open(d.k, d.number + " " + d.title); }
    // save all: every listed document's file (its PDF, or the Excel copy of a list) in one zip, named as Save names it
    async function saveAll(ds, b){ if (b.disabled) return;
      const items = ds.map(d => d.pdf ? [d.pdf, fname(d) + ".pdf"] : d.xlsx ? [d.xlsx, d.xname || fname(d) + ".xlsx"] : null).filter(Boolean); if (!items.length) return;
      const lab = b.querySelector("span"), was = lab.textContent; b.disabled = true; const got = [];
      try { for (let i = 0; i < items.length; i++){ lab.textContent = `${i + 1} / ${items.length}`;
          const r = await fetch(items[i][0]); if (!r.ok) throw new Error(items[i][1] + " (" + r.status + ")"); got.push([items[i][1], new Uint8Array(await r.arrayBuffer())]); }
        const a = document.createElement("a"); a.href = URL.createObjectURL(zip(got)); a.download = `Project Library ${type ? TN[type].replace("&amp;", "&") : "sources"}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4e4);
      } catch (e){ alert("Couldn't save all: " + e.message); }
      b.disabled = false; lab.textContent = was; }
    // keep on the device: one row, or every row the filters show; the row's (or the bar's) text counts up the MB
    async function run(ds, row){
      const files = [...new Set(ds.flatMap(d => d.keep))]; if (!files.length) return;
      const total = files.reduce((t, f) => t + (OFF.sz[f] || 0), 0), have = files.filter(f => st[f] === "ok").reduce((t, f) => t + (OFF.sz[f] || 0), 0);
      busyRow = row || el; stop.x = false; el.classList.add("sl-busy"); busyRow.classList.add("sl-on");
      const bar = row ? row.querySelector(".sl-rb i") : $(".sl-pg i");
      const kb = row ? row.querySelector(".sl-kp") : !phone && $(".sl-all"); if (kb) kb.innerHTML = ICO.stop + `<span>${row ? "" : "Stop"}</span>`;
      const say = f => { const t = `${mb(have + f * (total - have))} / ${mb(total)} MB`; const l = row ? row.querySelector(".sl-kp span") : phone ? $(".sl-all") : $(".sl-alln"); if (l) l.textContent = row || phone ? t : t.replace(" / ", " of "); if (bar) bar.style.width = ((have + f * (total - have)) / total * 100).toFixed(1) + "%"; };
      say(0);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      try { await Offline.get(files, say, stop); } catch (e){ if (e.message !== "stopped") alert("Stopped: " + e.message + ". What was saved is kept; tap Cache again to finish."); }
      busyRow.classList.remove("sl-on"); busyRow = null; el.classList.remove("sl-busy"); refresh();   // (refresh redraws, so a waiting redraw is done too)
    }
    async function refresh(){ if (!DOCS || !window.Offline) return draw(); st = await Offline.check([...new Set(DOCS.flatMap(d => d.keep))]).catch(() => ({})); draw(); }
    load().then(async () => { OFF = await Offline.load().catch(() => ({ sz: {} })); draw(); refresh(); });
    return { refresh, filter: v => { q = String(v || "").trim().toLowerCase(); draw(); } };
  }

  const css = `.sl-dt{display:flex;gap:18px;align-items:flex-start}
.sl-side{flex:0 0 280px;position:sticky;top:calc(var(--tb,0px) + 12px);background:var(--card,var(--panel));border:1px solid var(--line);border-radius:12px;padding:12px;max-height:calc(100vh - var(--tb,0px) - 30px);overflow-y:auto;box-sizing:border-box}
.sl-q{width:100%;box-sizing:border-box;height:36px;border:1.5px solid var(--line);border-radius:18px;background:var(--bg);color:var(--ink);padding:0 12px;font:inherit;font-size:var(--fb,15px)}
.sl-h{font-size:var(--fl,13px);font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mute);margin:14px 2px 6px}
.sl-ck{display:flex;align-items:center;gap:9px;width:100%;border:0;background:none;color:var(--ink);font:inherit;font-size:var(--fb,15px);font-weight:700;padding:5px 2px;text-align:left;cursor:pointer;border-radius:6px}
.sl-ck b{flex:none;width:16px;height:16px;border-radius:4px;border:2px solid color-mix(in srgb,var(--ink) 25%,var(--line));box-sizing:border-box}.sl-ck.on b{background:var(--gold);border-color:var(--gold)}
.sl-ck span{flex:1;min-width:0}.sl-ck i{font-style:normal;color:var(--mute);font-weight:600;font-size:var(--fl,13px)}.sl-ck:hover{background:var(--card2,var(--panel2))}
.sl-ah[hidden]{display:none}
.sl-main{flex:1;min-width:0}
.sl-bar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 2px 8px;font-size:var(--fb,15px);color:var(--mute);min-height:32px}.sl-bar b{color:var(--ink)}
.sl-all{border:1.5px solid var(--gold);background:var(--card,var(--panel));color:color-mix(in srgb,var(--gold) 72%,var(--ink));border-radius:16px;padding:5px 12px;font:inherit;font-size:var(--fl,13px);font-weight:800;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums}
.sl-allok{display:inline-flex;align-items:center;gap:5px;color:#1f9a55;font-weight:800;font-size:var(--fl,13px)}
.sl-pg{position:absolute;left:0;right:0;bottom:-4px;height:3px;display:none}.sl-busy:not(:has(.sl-r.sl-on,tr.sl-on)) .sl-pg{display:block}.sl-pg i,.sl-rb i{display:block;height:100%;width:0;background:var(--gold);transition:width .2s}
.sl-tb{width:100%;border-collapse:collapse;background:var(--card,var(--panel));border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:var(--fb,15px)}
.sl-tb th{text-align:left;font-size:var(--fl,13px);letter-spacing:.06em;text-transform:uppercase;color:var(--mute);padding:9px 10px;background:var(--card2,var(--panel2));font-weight:800}
.sl-tb td{padding:6px 10px;border-top:1px solid var(--line);vertical-align:middle}.sl-num{font-weight:800;white-space:nowrap}.sl-rev,.sl-sz{white-space:nowrap;color:var(--mute)}
.sl-op{border:0;background:none;color:var(--ink);font:inherit;padding:0;text-align:left;cursor:pointer}.sl-op:hover{color:var(--gold);text-decoration:underline}
.sl-ib{border:0;background:none;color:var(--mute);cursor:pointer;font-size:var(--fb,15px);margin-left:6px;padding:0}.sl-ib.on{color:var(--gold)}
.sl-info td{background:var(--card2,var(--panel2))}.sl-kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:var(--fb,15px)}.sl-kv span{color:var(--mute)}
/* the buttons: each kind in its own column, every one the same width, so they line up down the table */
td.sl-c{width:1%;padding-left:3px;padding-right:3px;position:relative}td.sl-c:last-child{padding-right:10px}
.sl-b{display:inline-flex;align-items:center;justify-content:center;gap:5px;box-sizing:border-box;height:30px;border:1.5px solid var(--gold);background:var(--card,var(--panel));color:color-mix(in srgb,var(--gold) 72%,var(--ink));border-radius:9px;padding:0 10px;font:inherit;font-size:var(--fl,13px);font-weight:800;text-decoration:none;white-space:nowrap;cursor:pointer;font-variant-numeric:tabular-nums}
.sl-b0{border:0!important;background:none!important}
/* desktop: square buttons as on the phone, short rows, pill filters */
.sl-dt .sl-b{flex-direction:column;gap:1px;width:46px;height:34px;padding:0;border-radius:9px;font-size:10.5px;line-height:1}.sl-dt .sl-b svg{width:14px;height:14px}
.sl-dt tr.sl-on .sl-kp{width:auto;min-width:46px;padding:0 6px}.sl-dt .sl-tb td{padding-top:3px;padding-bottom:3px}.sl-dt .sl-tb th{padding-top:7px;padding-bottom:7px}
.sl-dt .sl-tb td.sl-ti{width:100%}.sl-dt td.sl-c{padding-left:2px;padding-right:2px}
.sl-hb{display:flex;gap:6px;margin:10px 0 0}.sl-hb .sl-b,.sl-bh .sl-b{width:auto;min-width:54px;padding:0 8px}.sl-dt .sl-tb th.sl-bh{padding:4px 2px;text-transform:none;letter-spacing:0}.sl-allc{cursor:default}.sl-b:disabled{opacity:.6;cursor:progress}
.sl-dt .sl-alln{position:absolute;bottom:2px;white-space:nowrap}.sl-alln{font-size:var(--fl,13px);color:var(--mute);font-variant-numeric:tabular-nums}
.sl-dt .sl-types,.sl-dt .sl-areas{display:flex;flex-wrap:wrap;gap:6px}.sl-dt .sl-p{border-radius:9px;font-size:14px;padding:4px 10px}
.sl-kp.ok{border-color:#2aa765;color:#1f9a55}.sl-b,.sl-p,.sl-all,.sl-r{touch-action:manipulation;-webkit-tap-highlight-color:transparent}.sl-b:active,.sl-p:active,.sl-all:active{transform:scale(.93);background:var(--th-t,#eef1f5)!important;transition:transform .05s}.sl-r:active{background:var(--th-t,#eef1f5)}.sl-kp.old,.sl-kp.part{border-style:dashed}
.sl-busy .sl-kp:not(.sl-on .sl-kp),.sl-busy .sl-all:not(.sl-dt.sl-on .sl-all,.sl-ph.sl-on .sl-all){opacity:.4;pointer-events:none}
.sl-rb{display:none;position:absolute;left:3px;right:10px;bottom:3px;height:2px}tr.sl-on .sl-rb{display:block}
.sl-none{color:var(--mute);padding:14px 10px;font-size:var(--fb,15px)}
/* phone */
.sl-ph .sl-pills{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -10px 7px;padding:0 10px}.sl-ph .sl-pills::-webkit-scrollbar{display:none}.sl-ph .sl-pills[hidden]{display:none}
.sl-p{flex:none;border:1.5px solid color-mix(in srgb,var(--ink) 16%,var(--line));background:var(--card,var(--panel));color:var(--ink);border-radius:16px;padding:5px 11px;font:inherit;font-size:var(--fl,13px);font-weight:800;white-space:nowrap;cursor:pointer}
.sl-p i{font-style:normal;color:var(--mute);font-weight:600;margin-left:4px}.sl-p.on{border-color:var(--gold);box-shadow:inset 0 0 0 1px var(--gold);color:color-mix(in srgb,var(--gold) 72%,var(--ink))}.sl-ps{font-weight:700}
.sl-ph .sl-bar{font-size:var(--fl,13px);margin:0 2px 7px}
.sl-ph .sl-list{background:var(--card,var(--panel));border:1px solid var(--line);border-radius:12px;overflow:hidden}
.sl-r{position:relative;display:flex;align-items:center;gap:5px;padding:7px 7px 7px 9px;border-bottom:1px solid var(--line);cursor:pointer}.sl-r:last-child{border-bottom:0}
.sl-t{flex:1;min-width:0}.sl-t b{display:block;font-size:calc(var(--fb,15px) * .9);font-weight:800;white-space:nowrap;letter-spacing:-.01em}.sl-t span{display:block;font-size:var(--fl,13px);color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sl-ph .sl-b{flex:none;flex-direction:column;gap:1px;width:40px;height:38px;padding:0;border-radius:10px;font-size:calc(var(--fl,13px) * .82)}
.sl-ph .sl-kp.sl-on,.sl-r.sl-on .sl-kp{width:auto;min-width:44px;padding:0 6px}
.sl-ph .sl-pg{display:none!important}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, load };
})();
