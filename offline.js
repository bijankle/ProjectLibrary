// Settings > Offline downloads: keep documents on this device for use with no signal (underground, remote areas).
// offline.json (tools/build_offline.py) lists the groups and their files; everything goes into the "kcgm-docs" cache,
// which sw.js serves first and which app updates keep. The app itself is always offline and isn't listed here.
// Offline.mount(el) draws the section.
window.Offline = (() => {
  let CACHE = "kcgm-docs-1";   // the name sw.js uses; offline.json repeats it
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mb = b => b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " kB";
  let M = null, busy = false;
  const url = f => new URL(f, location.href).href;
  async function state(files){ const c = await caches.open(CACHE); let n = 0; for (const f of files) if (await c.match(url(f))) n++; return n; }
  async function get(files, prog, stop){
    const c = await caches.open(CACHE); let done = 0;
    for (const f of files){
      if (stop.x) throw new Error("stopped");
      if (!(await c.match(url(f)))){ const r = await fetch(f, { cache: "no-store" }); if (!r.ok) throw new Error(f + " " + r.status); await c.put(url(f), r); }
      prog(++done / files.length);
    }
  }
  async function drop(files){ const c = await caches.open(CACHE); for (const f of files) await c.delete(url(f)); }

  async function mount(el){
    el.innerHTML = `<div class="off-note">Loading…</div>`;
    if (!("caches" in window)){ el.innerHTML = `<div class="off-note">This browser can't keep files offline.</div>`; return; }
    try { M = M || await fetch("offline.json", { cache: "no-store" }).then(r => r.json()); } catch (e){ el.innerHTML = `<div class="off-note">Couldn't load the download list (${esc(e.message)}). Check the connection.</div>`; return; }
    if (M.cache) CACHE = M.cache;
    const all = { id: "all", name: "Everything", note: "All of the below", files: M.groups.flatMap(g => g.files), size: M.total };
    const rows = [all, ...M.groups];
    el.innerHTML = `<div class="off-note">The app, lists and search always work offline. Documents are fetched when first opened (P&IDs and the spec are then kept); download them here to have them with no signal.</div>
      <div class="off-list">${rows.map((g, i) => `<div class="off-row${i ? "" : " all"}" data-i="${i}"><div class="off-t"><b>${esc(g.name)}</b><span>${esc(g.note)}</span></div>
        <div class="off-r"><span class="off-sz">${mb(g.size)}</span><span class="off-st"></span><button class="off-b"></button></div><div class="off-bar"><i></i></div></div>`).join("")}</div>
      <div class="off-note" id="offUse"></div>`;
    const stop = { x: false };
    async function refresh(){
      for (const [i, g] of rows.entries()){
        const r = el.querySelector(`.off-row[data-i="${i}"]`), n = await state(g.files), full = n === g.files.length;
        r.classList.toggle("have", full); r.querySelector(".off-st").textContent = full ? "✓ on this device" : n ? `${n} of ${g.files.length} saved` : "";
        const b = r.querySelector(".off-b"); b.textContent = full ? "Remove" : "⬇ Download"; b.disabled = busy; b.dataset.act = full ? "rm" : "get";
      }
      if (navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); el.querySelector("#offUse").textContent = `Using ${mb(e.usage || 0)} of the ${mb(e.quota || 0)} this browser allows.`; }
    }
    el.querySelectorAll(".off-b").forEach(b => b.onclick = async () => {
      const r = b.closest(".off-row"), g = rows[+r.dataset.i];
      if (busy){ stop.x = true; return; }
      if (b.dataset.act === "rm"){ if (!confirm(`Remove ${g.name} (${mb(g.size)}) from this device?`)) return; await drop(g.files); return refresh(); }
      busy = true; stop.x = false; el.querySelectorAll(".off-b").forEach(x => x.disabled = x !== b); b.textContent = "Stop"; r.classList.add("busy");
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});   // ask the browser not to clear it when space is short
      try { await get(g.files, f => r.querySelector(".off-bar i").style.width = (f * 100).toFixed(1) + "%", stop); }
      catch (e){ if (e.message !== "stopped") alert("Download stopped: " + e.message + ". What was saved is kept; tap Download again to finish."); }
      busy = false; r.classList.remove("busy"); r.querySelector(".off-bar i").style.width = "0"; refresh();
    });
    refresh();
  }
  const css = `.off-note{font-size:13px;color:var(--mute);line-height:1.45;margin:6px 0 10px}
.off-list{display:flex;flex-direction:column;gap:6px}
.off-row{position:relative;display:flex;gap:10px;align-items:center;border:1px solid var(--line);background:var(--card,var(--panel2));border-radius:12px;padding:9px 11px;overflow:hidden}
.off-row.all{border-color:var(--gold,var(--accent))}
.off-t{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:2px}.off-t b{font-size:14px}.off-t span{font-size:12px;color:var(--mute);line-height:1.3}
.off-r{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}.off-sz{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.off-st{font-size:11.5px;color:var(--mute);white-space:nowrap}.off-row.have .off-st{color:#22c55e}
.off-b{border:1px solid var(--gold,var(--accent));background:none;color:var(--gold,var(--accent));border-radius:9px;padding:6px 10px;font:inherit;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap}
.off-b:disabled{opacity:.4;cursor:default}.off-row.have .off-b{border-color:var(--line);color:var(--mute)}
.off-bar{position:absolute;left:0;right:0;bottom:0;height:3px}.off-bar i{display:block;height:100%;width:0;background:var(--gold,var(--accent));transition:width .2s}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount };
})();
