// "Update app": shows the installed version (offline cache) against the latest on the server, and on tap
// clears the offline copy, updates the service worker and reloads the page fresh.
(function(){
  const U = {};
  U.installed = async () => { try { const ks = await caches.keys(); return ks.filter(k => /^kcgm-v/.test(k)).sort().pop() || null; } catch (e) { return null; } };
  U.latest = async () => { try { const t = await (await fetch("sw.js?" + Date.now(), { cache: "no-store" })).text(); return (t.match(/VERSION = "([^"]+)"/) || [])[1] || null; } catch (e) { return null; } };
  U.update = async () => {
    try { const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : []; await Promise.all(regs.map(r => r.update().catch(() => {}))); } catch (e) {}
    try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
    const q = new URLSearchParams(location.search); q.set("u", Date.now()); location.replace(location.pathname + "?" + q.toString() + location.hash);
  };
  U.mount = (btn, info) => {
    const show = async () => { const [a, b] = await Promise.all([U.installed(), U.latest()]);
      if (info) info.textContent = b && a && a !== b ? `Installed ${a}, latest ${b}: update available` : b ? `Version ${b}${a ? "" : " (not cached offline yet)"}: up to date` : a ? `Version ${a} (offline, can't check for updates)` : "";
      btn.classList.toggle("upd-new", !!(a && b && a !== b)); };
    btn.addEventListener("click", () => { btn.disabled = true; btn.textContent = "Updating…"; U.update(); });
    show();
  };
  window.AppUpdate = U;
})();
