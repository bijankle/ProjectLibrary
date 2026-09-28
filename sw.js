// Offline cache. Bump VERSION when questions change so phones pick up the new bank.
const VERSION = "kcgm-v64";
// Documents (spec PDF, drawings, source tables) live in their own cache that app updates keep. The spec and drawings
// are saved there the first time they're opened; Settings > Offline downloads (offline.js) can fetch any of them.
const DOCS = "kcgm-docs-1",   // bump when a document is rebuilt so devices refetch it
      DOC_PDF = /\/(spec\/pvs|PIDs\/[^/]+|PFDs\/[^/]+)\.pdf$/, DOC_ANY = /\/(spec|PIDs|PFDs|sources)\/(?!index\.json)/;
const FILES = ["./", "index.html", "cards.js", "facts.js", "ai.js", "glossary.js", "manifest.json", "icon.svg", "icon-192.png", "icon-512.png", "pfd.html", "pfd-data.js", "pfd-streams.js", "pfd-equip.js", "pfd-layout-data.js", "pfd-layout.js", "tools/tagutil.js", "lookup.js", "browse.js", "tabs.js", "textsize.js", "browse.json", "search-data.json", "app-update.js", "xlsx-lite.js", "issues.html", "issues.json", "spec.js", "spec/index.json", "pdfview.js", "pid.js", "offline.js", "PIDs/index.json", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "sources-view.js", "sources/index.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== DOCS).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Network first so updates show when online, cache fallback underground or out of range.
self.addEventListener("fetch", e => {
  // Only cache this site's own files; never touch calls to Google (they carry the API key).
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  const path = new URL(e.request.url).pathname;
  if (DOC_ANY.test(path)){   // cache first; PDFs are kept on first open, other documents only when downloaded in Settings
    e.respondWith(caches.open(DOCS).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => { if (DOC_PDF.test(path) && r.ok && r.status === 200) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
