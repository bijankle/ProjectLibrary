// "Update app": shows the installed version (offline cache) against the latest on the server, and on tap
// clears the offline copy, updates the service worker and reloads the page fresh.
(function(){
  const U = {};
  U.installed = async () => { try { const ks = await caches.keys(); return ks.filter(k => /^kcgm-v/.test(k)).sort().pop() || null; } catch (e) { return null; } };
  U.latest = async () => { try { const t = await (await fetch("sw.js?" + Date.now(), { cache: "no-store" })).text(); return (t.match(/VERSION = "([^"]+)"/) || [])[1] || null; } catch (e) { return null; } };
  U.update = async () => {
    try { const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : []; await Promise.all(regs.map(r => r.update().catch(() => {}))); } catch (e) {}
    // only the app's own copy (kcgm-v…); downloaded documents (kcgm-docs…) are kept
    try { const ks = await caches.keys(); await Promise.all(ks.filter(k => /^kcgm-v/.test(k)).map(k => caches.delete(k))); } catch (e) {}
    const q = new URLSearchParams(location.search); q.set("u", Date.now()); location.replace(location.pathname + "?" + q.toString() + location.hash);
  };
  U.mount = (btn, info) => {
    const show = async () => { const [a, b] = await Promise.all([U.installed(), U.latest()]);
      if (info) info.textContent = b && a && a !== b ? `Installed ${a}, latest ${b}: update available` : b ? `Version ${b}${a ? "" : " (not cached offline yet)"}: up to date` : a ? `Version ${a} (offline, can't check for updates)` : "";
      btn.classList.toggle("upd-new", !!(a && b && a !== b)); };
    btn.addEventListener("click", () => { btn.disabled = true; btn.textContent = "Updating…"; U.update(); });
    show();
  };
  // ---------- background update (the app opens from this device; this brings the newest version in behind it) ----------
  // Reads the newest sw.js from the server; if its version isn't the one serving this page, fetches the files that
  // version needs straight from the network into its cache (a thin gold line under the top bar fills as they come in),
  // installs it, and reloads onto it the next time you pause (nothing typed or touched for 4 s) or come back to the app.
  const served = () => new Promise(ok => { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (!c) return ok(null);
    const ch = new MessageChannel(); ch.port1.onmessage = e => ok(e.data); c.postMessage("ver", [ch.port2]); setTimeout(() => ok(null), 1500); });
  let barEl = null;
  const bar = f => { if (!barEl){ barEl = document.createElement("div"); barEl.className = "upd-line"; barEl.innerHTML = "<i></i>"; document.body.appendChild(barEl);
      const st = document.createElement("style"); st.textContent = `.upd-line{position:fixed;left:0;right:0;top:var(--tb,0px);height:3px;z-index:90;pointer-events:none}.upd-line i{display:block;height:100%;width:0;background:var(--gold,var(--accent,var(--th)));transition:width .25s,opacity .4s}.upd-line.done i{opacity:0}`; document.head.appendChild(st); }
    barEl.firstChild.style.width = Math.max(2, f * 100).toFixed(1) + "%"; barEl.classList.toggle("done", f >= 1); };
  let pending = false;
  function applyWhenIdle(){ pending = true; let t;
    const go = () => { if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return arm(); location.reload(); };
    const arm = () => { clearTimeout(t); t = setTimeout(go, 4000); };
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(ev => addEventListener(ev, arm, { passive: true })); arm();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") location.reload(); }); }
  U.bg = async () => {
    if (pending || !("serviceWorker" in navigator) || !navigator.serviceWorker.controller || !navigator.onLine) return;
    let t; try { t = await (await fetch("sw.js?fresh=" + Date.now(), { cache: "no-store" })).text(); } catch (e) { return; }
    const V = (t.match(/VERSION = "([^"]+)"/) || [])[1], F = JSON.parse((t.match(/const FILES = (\[[^\]]*\])/) || [, "[]"])[1]);
    if (!V || V === await served()) return;
    bar(0);
    try {
      const c = await caches.open(V), have = new Set((await c.keys()).map(r => new URL(r.url).pathname)), need = F.filter(f => !have.has(new URL(f, location.href).pathname));
      let i = 0;
      for (const f of need){ const r = await fetch(new URL(f, location.href).pathname + "?fresh=" + Date.now(), { cache: "no-store" }); if (r.ok) await c.put(new URL(f, location.href).href, r); bar(++i / need.length * .92); }
      const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update();
      await new Promise(ok => { navigator.serviceWorker.addEventListener("controllerchange", ok, { once: true }); setTimeout(ok, 15000); });
      bar(1); try { localStorage.setItem("kcgm_updated", Date.now()); } catch (e) {}
      applyWhenIdle();
    } catch (e) { bar(1); }
  };
  addEventListener("load", () => setTimeout(() => U.bg(), 1200));
  // ask the browser to protect this site's storage (downloaded documents) from automatic clean-up, every time the app opens
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {}); } catch (e) {}
  window.AppUpdate = U;
})();
