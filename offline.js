// Settings > Offline downloads: keep documents on this device for use with no signal (underground, remote areas).
// offline.json (tools/build_offline.py) lists the groups and their files; everything goes into the "kcgm-docs" cache,
// which sw.js serves first and which app updates keep. The app itself is always offline and isn't listed here.
// Offline.mount(el) draws the section.
window.Offline = (() => {
  let CACHE = "kcgm-docs-2";   // the name sw.js uses; offline.json repeats it
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mb = b => b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " kB";
  let M = null, busy = false;
  const url = f => new URL(f, location.href).href;
  // which version of each file this device holds, kept beside the files: {file: fingerprint from offline.json}
  const VER = () => url("__docs_versions.json");
  let held = null;
  async function loadHeld(c){ if (held) return held; const r = await c.match(VER()); held = r ? await r.json() : {}; return held; }
  const saveHeld = c => c.put(VER(), new Response(JSON.stringify(held), { headers: { "Content-Type": "application/json" } }));
  // per file: "ok" (current), "old" (an older version is saved), "no" (not saved)
  async function check(files){
    const c = await caches.open(CACHE); await loadHeld(c); const out = {}; let changed = false;
    // every saved address in one call (a match per file took seconds on a phone, hundreds of files)
    const saved = new Set((await c.keys()).map(r => r.url.split("?")[0]));
    for (const f of files){
      if (!saved.has(url(f).split("?")[0])){ out[f] = "no"; continue; }
      if (!held[f]){ held[f] = M.ver[f]; changed = true; }   // saved on first open (sw.js): it came straight from the server
      out[f] = held[f] === M.ver[f] ? "ok" : "old";
    }
    if (changed) await saveHeld(c);
    return out;
  }
  async function get(files, prog, stop){
    const c = await caches.open(CACHE), st = await check(files), need = files.filter(f => st[f] !== "ok");
    const total = need.reduce((t, f) => t + (M.sz[f] || 0), 0) || 1; let done = 0;
    for (const f of need){
      if (stop.x) throw new Error("stopped");
      const r = await fetch(f, { cache: "no-store" }); if (!r.ok) throw new Error(f + " " + r.status);
      await c.put(url(f), r); held[f] = M.ver[f]; done += M.sz[f] || 0; prog(done / total);
      if (need.indexOf(f) % 10 === 9) await saveHeld(c);
    }
    await saveHeld(c);
  }
  async function drop(files){ const c = await caches.open(CACHE); await loadHeld(c); for (const f of files){ await c.delete(url(f)); delete held[f]; } await saveHeld(c); }

  // One row per source: its name, the document number (or drawing count) and "saved / total MB" in grey, and at the right
  // a round download button (■ stops it), or ✓ when it is all on the device (tap ✓ to remove it). While downloading the
  // grey text counts up; o.bar adds a thin progress line under the row (desktop).
  const SHORT = { "Mechanical Equipment List": "MEL", "Special Piping Items (SPI) List": "SPI List", "Process Design Criteria Stage 2": "PDC Stage 2",
    "Plant General Process Control Philosophy Stage 1": "Control Philosophy Stage 1", "Plant General Process Control Philosophy Stage 2": "Control Philosophy Stage 2",
    "Process Flow Diagrams Stage 1": "PFD tables Stage 1", "Plant Numbering Specification": "Numbering Spec", "Overall Plant Layout Plan": "Plant Layout Plan",
    "Growth Work Breakdown Structure": "WBS", "Pipe & valve spec": "Pipe & valve spec" };
  const num = g => { const m = String(g.note || "").match(/^(\d{4}-F\d+-[A-Z]+-[A-Z]+-\d+)/); return m ? m[1].replace(/^2000-F00-/, "") : /drawings/.test(g.note || "") ? g.note : ""; };
  const mbs = (a, t) => { const f = b => { const v = b / 1e6; return v === 0 ? "0" : v < 1 ? String(+v.toFixed(2)) : v < 10 ? String(+v.toFixed(1)) : String(Math.round(v)); }; return `${f(a)} / ${f(t)} MB`; };
  async function load(){ if (M) return M; M = await fetch("offline.json", { cache: "no-store" }).then(r => r.json()); if (M.cache) CACHE = M.cache; return M; }
  async function rows(el, o = {}){
    el.innerHTML = `<div class="off-note">Loading…</div>`;
    if (!("caches" in window)){ el.innerHTML = `<div class="off-note">This browser can't keep files offline.</div>`; return; }
    try { await load(); } catch (e){ el.innerHTML = `<div class="off-note">Couldn't load the download list. Check the connection.</div>`; return; }
    const G = M.groups, ico = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    el.innerHTML = `<div class="dl-l${o.bar ? " dl-bars" : ""}">${G.map((g, i) => `<div class="dl-r" data-i="${i}"><b class="dl-n">${esc(SHORT[g.name] || g.name)}</b><span class="dl-g"><span class="dl-d">${esc(num(g))}</span><span class="dl-s"></span></span><button type="button" class="dl-b"></button><i class="dl-bar"><i></i></i></div>`).join("")}</div>`;
    const stop = { x: false };
    const paint = async () => { const st = await check(G.flatMap(g => g.files));
      G.forEach((g, i) => { const r = el.querySelector(`.dl-r[data-i="${i}"]`), have = g.files.filter(f => st[f] === "ok"), sz = have.reduce((t, f) => t + (M.sz[f] || 0), 0), full = have.length === g.files.length;
        r.classList.toggle("have", full); if (!r.classList.contains("busy")) r.querySelector(".dl-s").textContent = mbs(sz, g.size);
        const b = r.querySelector(".dl-b"); b.innerHTML = full ? ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>') : ico('<path d="M12 4v12M6.5 11 12 16.5 17.5 11M5 20h14"/>');
        b.title = full ? "On this device. Tap to remove it" : "Download"; b.dataset.act = full ? "rm" : "get"; b.disabled = busy && !r.classList.contains("busy"); }); };
    el.querySelectorAll(".dl-b").forEach(b => b.onclick = async () => { const r = b.closest(".dl-r"), g = G[+r.dataset.i];
      if (busy){ stop.x = true; return; }
      if (b.dataset.act === "rm"){ if (!confirm(`Remove ${SHORT[g.name] || g.name} from this device?`)) return; await drop(g.files); return paint(); }
      busy = true; stop.x = false; r.classList.add("busy"); b.innerHTML = ico('<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>'); b.title = "Stop";
      el.querySelectorAll(".dl-b").forEach(x => x.disabled = x !== b);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      const st = await check(g.files), base = g.files.filter(f => st[f] === "ok").reduce((t, f) => t + (M.sz[f] || 0), 0), need = g.size - base;
      try { await get(g.files, f => { r.querySelector(".dl-s").textContent = mbs(base + f * need, g.size); r.querySelector(".dl-bar i").style.width = ((base + f * need) / g.size * 100).toFixed(1) + "%"; }, stop); }
      catch (e){ if (e.message !== "stopped") alert("Download stopped: " + e.message + ". What was saved is kept; tap again to finish."); }
      busy = false; r.classList.remove("busy"); r.querySelector(".dl-bar i").style.width = "0"; paint(); });
    paint();
  }
  // Settings (desktop) uses the same rows, with the progress line
  const mount = el => rows(el, { bar: true });
  const css = `.off-note{font-size:13px;color:var(--mute);line-height:1.45;margin:6px 0 10px}
.off-list{display:flex;flex-direction:column;gap:6px}
.off-row{position:relative;display:flex;gap:10px;align-items:center;border:1px solid var(--line);background:var(--card,var(--panel2));border-radius:12px;padding:9px 11px;overflow:hidden}
.off-row.all{border-color:var(--gold,var(--accent))}
.off-t{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:2px}.off-t b{font-size:var(--fb,15px)}.off-t span{font-size:var(--fb,15px);color:var(--mute);line-height:1.3}
.off-r{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}.off-sz{font-size:var(--fb,15px);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.off-st{font-size:var(--fb,15px);color:var(--mute);text-align:right}.off-row.have .off-st{color:#22c55e}.off-row.part .off-st{color:#f59e0b}
.off-row.have{border-color:#22c55e}.off-row.have.all{border-color:#22c55e}.off-row.have .off-bar i{background:#22c55e}
.off-b{border:1px solid var(--gold,var(--accent));background:none;color:var(--gold,var(--accent));border-radius:9px;padding:6px 10px;font:inherit;font-weight:700;font-size:var(--fb,15px);cursor:pointer;white-space:nowrap}
.off-b:disabled{opacity:.4;cursor:default}.off-row.have .off-b{border-color:var(--line);color:var(--mute)}
.off-bar{position:absolute;left:0;right:0;bottom:0;height:3px}.off-bar i{display:block;height:100%;width:0;background:var(--gold,var(--accent));transition:width .2s}
.dl-l{display:flex;flex-direction:column;background:var(--card,var(--panel));border:1px solid var(--line);border-radius:12px;overflow:hidden}
.dl-r{position:relative;display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line);min-height:44px;box-sizing:border-box}.dl-r:last-child{border-bottom:0}
.dl-n{flex:1 1 auto;min-width:0;font-size:var(--fb,15px);font-weight:800;color:var(--ink);line-height:1.25}
.dl-g{flex:none;display:flex;flex-direction:column;align-items:flex-end;white-space:nowrap;line-height:1.3;font-size:var(--fl,13px);color:var(--mute);text-align:right;font-variant-numeric:tabular-nums}
.dl-d:empty{display:none}.dl-s{white-space:nowrap}
.dl-b{flex:none;width:30px;height:30px;border-radius:50%;border:1.5px solid var(--gold,var(--accent));background:none;color:color-mix(in srgb,var(--gold,var(--accent)) 75%,var(--ink));display:grid;place-items:center;padding:0;cursor:pointer}
.dl-r.have .dl-b{border-color:transparent;color:#22a35a}.dl-b:disabled{opacity:.35;cursor:default}.dl-r.busy .dl-s{color:var(--ink);font-weight:700}
.dl-bar{display:none;position:absolute;left:0;right:0;bottom:-1px;height:3px}.dl-bars .dl-r.busy .dl-bar{display:block}.dl-bar i{display:block;height:100%;width:0;background:var(--gold,var(--accent));transition:width .2s}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, rows, load, check, get, drop, busy: () => busy, setBusy: v => busy = v };
})();
