// Offline cache. Bump VERSION when questions change so phones pick up the new bank.
const VERSION = "kcgm-v245";
// Documents (spec PDF, drawings, source tables) live in their own cache that app updates keep. The spec and drawings
// are saved there the first time they're opened; Settings > Offline downloads (offline.js) can fetch any of them.
const DOCS = "kcgm-docs-5",   // never rename: renaming deletes every download. A rebuilt document is refetched by its
      // fingerprint in offline.json instead (Sources shows it as needing an update)
      DOC_PDF = /\/(spec\/[^/]+\.pdf|(PIDs|PFDs)\/[^/]+\.pdf(\.p\d+\.png)?)$/, DOC_ANY = /\/(spec|PIDs|PFDs|sources)\/(?!index\.json)/;
const FILES = ["./", "index.html", "cards.js", "facts.js", "ai.js", "glossary.js", "manifest.json", "pics.json", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "pfd.html", "pfd-data.js", "pfd-streams.js", "pfd-equip.js", "pfd-bfd.js", "pfd-layout-data.js", "pfd-layout.js", "tools/tagutil.js", "lookup.js", "browse.js", "viz.js", "tabs.js", "textsize.js", "browse.json", "search-data.json", "app-update.js", "xlsx-lite.js", "issues.html", "issues.json", "spec.js", "spec/index.json", "pdfview.js", "pid.js", "offline.js", "PIDs/index.json", "pid-refs.json", "pfd-tags.json", "doc-tags.json", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "sources-view.js", "sources-list.js", "sources/index.json", "followups.json"];
// Install: keep every app file (a file the page already fetched into this version's cache is not fetched again)
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f => c.match(f).then(h => h || c.add(f)))))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== DOCS).map(k => caches.delete(k)))));
  self.clients.claim();
});
// the page asks which version is serving it (app-update.js)
self.addEventListener("message", e => { if (e.data === "ver" && e.ports[0]) e.ports[0].postMessage(VERSION); });
// The app opens straight from this device: every app file comes from the cache first, so it opens instantly with or
// without signal. app-update.js checks for a newer version in the background (the thin gold line under the top bar),
// fetches it with ?fresh (straight from the network, past this cache) and the page reloads onto it when you pause.
self.addEventListener("fetch", e => {
  // Only cache this site's own files; never touch calls to Google (they carry the API key).
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  const u = new URL(e.request.url), path = u.pathname;
  if (u.searchParams.has("fresh")) return;   // (the background update: network only)
  if (DOC_ANY.test(path)){   // cache first; PDFs are kept on first open, other documents only when kept in Sources
    e.respondWith(caches.open(DOCS).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => { if (DOC_PDF.test(path) && r.ok && r.status === 200) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (/\/sw\.js$/.test(path)) return;   // (the update check reads the newest sw.js from the server)
  e.respondWith(caches.open(VERSION).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok && r.status === 200) c.put(e.request, r.clone()); return r; }))).catch(() => fetch(e.request)));
});
