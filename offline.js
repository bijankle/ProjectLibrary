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
  const fresh = f => f + (f.includes("?") ? "&" : "?") + "fresh=1";   // (straight from the server: sw.js would answer from the saved copy)
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
      const r = await fetch(fresh(f), { cache: "no-store" }); if (!r.ok) throw new Error(f + " " + r.status);
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
  const mount = el => { const c = document.createElement("div"); el.before(c); card(c); return rows(el, { bar: true }); };

  // ---------- the whole app offline, in one tap ----------
  // Two sets (offline.json "set"): Essentials, every drawing but the schematics, the spec and the tables; Everything, the
  // schematics too. The app core (line tracing, process control data, the camera's text reader, the map library) comes
  // by itself (core() below). The phone is asked to keep it all (never cleared to make room), and on mobile data a big
  // download is checked first. What's held and the room left on the device are shown under the buttons.
  const SETS = [["ess", "Essentials", "Every drawing except the electrical schematics, the pipe spec and the lists"], ["all", "Everything", "Essentials and all the electrical schematics"]];
  const inSet = (g, k) => g.set === "core" || g.set === "ess" || (k === "all" && g.set === "all");
  // (not on Wi-Fi: the phone says it's on something else, mobile data mostly; a phone that doesn't say isn't asked)
  const cellular = () => { const c = navigator.connection; return !!(c && ((c.type && !/wifi|ethernet|unknown/.test(c.type)) || c.saveData)); };
  async function card(el){
    if (!("caches" in window)) return;
    try { await load(); } catch (e){ return; }
    el.className = "oc";
    const files = k => [...new Set(M.groups.filter(g => inSet(g, k)).flatMap(g => g.files))], tot = fs => fs.reduce((t, f) => t + (M.sz[f] || 0), 0);
    el.innerHTML = `<b class="oc-t">Use the app with no signal</b><span class="oc-n">Drawings open and their tags work, every asset's details, line tracing and the camera reader, all from this device. SharePoint links and Ref Only downloads still need signal.</span>
      <div class="oc-bs">${SETS.map(([k, n, h]) => `<button type="button" class="oc-b" data-k="${k}"><b>${n}</b><span class="oc-s"></span><small>${h}</small><i class="oc-bar"><i></i></i></button>`).join("")}</div><span class="oc-room"></span>`;
    const stop = { x: false };
    const paint = async () => { if (!el.isConnected){ PAINT.delete(paint); return; } const st = await check(files("all"));
      el.querySelectorAll(".oc-b").forEach(b => { if (b.classList.contains("busy")) return; const fs = files(b.dataset.k), have = tot(fs.filter(f => st[f] === "ok")), all = tot(fs), full = have >= all;
        b.classList.toggle("have", full); b.querySelector(".oc-s").textContent = full ? `On this device ✓ (${mb(all)})` : have ? `${mb(have)} of ${mb(all)}, tap to finish` : mb(all);
        b.disabled = busy && !b.classList.contains("busy"); if (coreBusy && !b.classList.contains("busy")) b.querySelector(".oc-s").textContent = "Getting the app core first…"; });
      if (navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate().catch(() => null), kept = navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
        if (e) el.querySelector(".oc-room").textContent = `This app uses ${mb(e.usage || 0)} of this device; ${mb(Math.max(0, (e.quota || 0) - (e.usage || 0)))} free for it.${kept ? " Kept: the phone won't clear it to make room." : ""}`; } };
    el.querySelectorAll(".oc-b").forEach(b => b.onclick = async () => {
      if (b.classList.contains("busy")){ stop.x = true; return; }
      if (busy) return;
      const fs = files(b.dataset.k), st = await check(fs), need = fs.filter(f => st[f] !== "ok"), size = tot(need);
      if (!need.length) return paint();
      if (cellular() && !confirm(`You're not on Wi-Fi. Download ${mb(size)} over mobile data now?`)) return;
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist().catch(() => {});
      busy = true; stop.x = false; b.classList.add("busy"); el.querySelectorAll(".oc-b").forEach(x => x.disabled = x !== b);
      const s0 = tot(fs) - size, all = tot(fs), bar = b.querySelector(".oc-bar i");
      try { await get(fs, f => { const d = s0 + f * size; b.querySelector(".oc-s").textContent = `${mb(d)} of ${mb(all)}… tap to stop`; bar.style.width = (d / all * 100).toFixed(1) + "%"; }, stop); }
      catch (e){ if (e.message !== "stopped") alert("Download stopped: " + e.message + ". What was saved is kept; tap again to finish."); }
      busy = false; b.classList.remove("busy"); bar.style.width = "0"; paint(); });
    PAINT.add(paint); paint();
  }
  const PAINT = new Set(); let coreBusy = false;   // (the cards on screen, redrawn when the core download ends)
  // the app core on this device, always: fetched in the background (a few seconds after the app opens, with signal) and
  // brought up to date with every update; never removed
  async function core(){
    if (!("caches" in window) || !navigator.onLine || busy) return;
    try { await load(); } catch (e){ return; }
    const fs = M.groups.filter(g => g.set === "core").flatMap(g => g.files); if (!fs.length) return;
    const st = await check(fs); if (fs.every(f => st[f] === "ok")) return;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    busy = coreBusy = true; PAINT.forEach(f => f()); try { await get(fs, () => {}, { x: false }); } catch (e) {} busy = coreBusy = false; PAINT.forEach(f => f());
  }
  // a small "Offline" note at the top of the screen while there's no signal
  const badge = () => { let b = document.getElementById("offBadge");
    if (!b){ b = document.createElement("div"); b.id = "offBadge"; b.textContent = "Offline"; b.title = "No signal: working from what's on this device"; document.body.appendChild(b); }
    b.hidden = navigator.onLine; };
  addEventListener("online", () => { badge(); setTimeout(core, 3000); }); addEventListener("offline", badge);
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", badge); else badge();
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
  const css2 = `.oc{display:flex;flex-direction:column;gap:8px;margin:0 0 14px;padding:12px;border:1.5px solid var(--th,var(--accent));border-radius:12px;background:var(--card,var(--panel))}
.oc-t{font-size:var(--fb,15px);font-weight:800;color:var(--ink)}.oc-n,.oc-room{font-size:var(--fl,13px);color:var(--mute);line-height:1.4}
.oc-bs{display:flex;gap:8px;flex-wrap:wrap}.oc-b{position:relative;flex:1 1 140px;display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;border:0;border-radius:4px;background:var(--th,var(--accent));color:var(--on-th,#fff);padding:9px 11px 11px;cursor:pointer;overflow:hidden;font:inherit;box-shadow:0 1px 2px rgba(0,0,0,.25)}
.oc-b b{font-size:var(--fb,15px)}.oc-b .oc-s{font-size:var(--fl,13px);font-weight:700;font-variant-numeric:tabular-nums}.oc-b small{font-size:11px;opacity:.85;line-height:1.3}
.oc-b.have{background:#1f7a46}.oc-b:disabled{opacity:.45;cursor:default}.oc-bar{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.25)}.oc-bar i{display:block;height:100%;width:0;background:#fff;transition:width .2s}
#offBadge{position:fixed;z-index:9999;top:calc(6px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:#b45309;color:#fff;font:700 12px/1 system-ui,sans-serif;padding:5px 10px;border-radius:4px;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.3)}#offBadge[hidden]{display:none}`;
  const st = document.createElement("style"); st.textContent = css + css2; document.head.appendChild(st);
  // keep the documents on this device current (run once a session, in the background): a drawing or table rebuilt on the
  // server under the same name (a newer revision swapped in, the title block cleared) replaces the copy saved here, so its
  // picture always matches the tag boxes drawn over it. A copy whose version this device recorded is checked against
  // offline.json; one saved on first open (sw.js) and not yet recorded is checked once by its ETag (or, saved after
  // offline.json was built, taken as current).
  async function sync(){
    if (!("caches" in window) || busy) return 0;
    await load(); const c = await caches.open(CACHE); await loadHeld(c);
    const built = M.built ? Date.parse(M.built) : 0, base = url("./"), stale = [];
    for (const req of await c.keys()){
      const u = req.url.split("?")[0]; if (!u.startsWith(base) || u === VER()) continue;
      const f = decodeURIComponent(u.slice(base.length)); if (!M.ver[f]) continue;
      if (held[f]){ if (held[f] !== M.ver[f]) stale.push([f, req]); continue; }
      const r = await c.match(req), d = r && Date.parse(r.headers.get("date") || "");
      if (d && built && d > built + 20 * 60e3){   // (20 minutes after the build: the site was live by then)
        held[f] = M.ver[f]; continue; }
      try { const h = await fetch(fresh(f), { method: "HEAD", cache: "no-store" }), tag = x => x && (x.headers.get("etag") || x.headers.get("last-modified")), et = tag(h), was = tag(r);
        if (h.ok && et && was && et === was) held[f] = M.ver[f]; else if (h.ok) stale.push([f, req]); } catch (e){ return 0; }   // (offline: try next time)
    }
    let n = 0;
    for (const [f, req] of stale){
      try { const r = await fetch(fresh(f), { cache: "no-store" }); if (!r.ok) continue; await c.put(req, r); held[f] = M.ver[f]; n++; } catch (e){ break; }
    }
    await saveHeld(c); return n;
  }
  return { mount, rows, card, core, load, check, get, drop, sync, busy: () => busy, setBusy: v => busy = v };
})();
