// A quiet error log on this device: script crashes, failed promises, console errors and the reasons a download stopped
// are kept for 14 days (the last 200), so after a failure the details can be fished out later. Nothing shows in the app.
// To read it: open the app's address with ?errlog on the end (…/index.html?errlog): a panel lists the entries with Copy
// and Clear. ErrLog.add(kind, message, extra) records one from the app's own code (offline.js uses it).
window.ErrLog = (() => {
  const K = "kcgm_errlog", DAYS = 14, MAX = 200;
  const read = () => { try { const a = JSON.parse(localStorage.getItem(K) || "[]"); const lim = Date.now() - DAYS * 864e5; return Array.isArray(a) ? a.filter(e => e && e.t > lim) : []; } catch (e) { return []; } };
  const write = a => { try { localStorage.setItem(K, JSON.stringify(a.slice(-MAX))); } catch (e) {} };
  let ver = ""; try { caches.keys().then(ks => { ver = ks.filter(k => /^kcgm-v/.test(k)).sort().pop() || ""; }).catch(() => {}); } catch (e) {}
  let last = "", lastT = 0;
  const NOISE = /--scale-factor|ResizeObserver loop/;   // (harmless library warnings)
  function add(kind, msg, extra){
    msg = String(msg == null ? "" : msg).slice(0, 1200); const now = Date.now(); if (NOISE.test(msg)) return;
    if (msg === last && now - lastT < 3000) return; last = msg; lastT = now;   // (one fault repeating every frame: once)
    const a = read(); a.push({ t: now, k: kind, m: msg, x: extra ? String(extra).slice(0, 1500) : undefined, v: ver, p: location.pathname.split("/").pop() + location.hash, on: navigator.onLine }); write(a); }
  addEventListener("error", e => { if (e.target && e.target !== window && e.target.src) return add("load", "failed to load " + e.target.src);
    add("error", e.message || "error", (e.filename ? e.filename.split("/").pop() + ":" + e.lineno + ":" + e.colno + " " : "") + (e.error && e.error.stack || "")); }, true);
  addEventListener("unhandledrejection", e => { const r = e.reason; add("promise", r && r.message || String(r), r && r.stack); });
  const ce = console.error; console.error = function(...a){ try { add("console", a.map(x => x && x.message || (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" ")); } catch (e) {} return ce.apply(this, a); };
  // ?errlog: the hidden reader
  function show(){
    const a = read(), esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const txt = `Project Library error log · ${new Date().toISOString()} · ${navigator.userAgent}\n\n` + a.map(e => `${new Date(e.t).toISOString()} [${e.k}] ${e.v || ""} ${e.p || ""}${e.on === false ? " (offline)" : ""}\n  ${e.m}${e.x ? "\n  " + e.x.replace(/\n/g, "\n  ") : ""}`).join("\n\n");
    const d = document.createElement("div"); d.id = "errlogPanel";
    d.innerHTML = `<style>#errlogPanel{position:fixed;inset:0;z-index:99999;background:#111;color:#e6e6e6;display:flex;flex-direction:column;font:13px/1.4 ui-monospace,Menlo,monospace}#errlogPanel header{display:flex;gap:8px;align-items:center;padding:10px;background:#222}#errlogPanel b{flex:1;font:700 15px system-ui,sans-serif}#errlogPanel button{font:600 14px system-ui,sans-serif;padding:8px 12px;border-radius:8px;border:1px solid #555;background:#333;color:#fff}#errlogPanel pre{flex:1;overflow:auto;margin:0;padding:10px;white-space:pre-wrap;word-break:break-word}</style>
      <header><b>Error log · ${a.length} entr${a.length === 1 ? "y" : "ies"}</b><button data-a="copy">Copy</button><button data-a="clear">Clear</button><button data-a="close">Close</button></header><pre>${esc(a.length ? txt : "Nothing logged in the last " + DAYS + " days.")}</pre>`;
    d.addEventListener("click", async e => { const k = e.target.dataset && e.target.dataset.a; if (!k) return;
      if (k === "copy"){ try { await navigator.clipboard.writeText(txt); e.target.textContent = "Copied"; } catch (x) { const r = document.createRange(); r.selectNodeContents(d.querySelector("pre")); getSelection().removeAllRanges(); getSelection().addRange(r); e.target.textContent = "Selected: copy it"; } }
      if (k === "clear" && confirm("Clear the error log?")){ write([]); d.remove(); }
      if (k === "close") d.remove(); });
    document.body.appendChild(d);
  }
  if (/[?&]errlog\b/.test(location.search)){
    try { history.replaceState(history.state, "", location.pathname + location.hash); } catch (e) {}
    if (document.readyState === "loading") addEventListener("DOMContentLoaded", () => setTimeout(show, 300)); else setTimeout(show, 300); }
  return { add, read, show };
})();
