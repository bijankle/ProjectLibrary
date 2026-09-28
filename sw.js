// Offline cache. Bump VERSION when questions change so phones pick up the new bank.
const VERSION = "kcgm-v23";
// The spec PDF (about 10 MB) lives in its own cache that app updates keep, so phones fetch it once.
const SPEC_CACHE = "kcgm-spec-1", SPEC_PDF = /\/spec\/pvs\.pdf$/;
const FILES = ["./", "index.html", "cards.js", "facts.js", "ai.js", "glossary.js", "manifest.json", "icon.svg", "icon-192.png", "icon-512.png", "pfd.html", "pfd-data.js", "pfd-streams.js", "pfd-equip.js", "pfd-layout-data.js", "pfd-layout.js", "tools/tagutil.js", "lookup.js", "search-data.json", "app-update.js", "xlsx-lite.js", "issues.html", "issues.json", "spec.js", "spec/index.json", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "sources-view.js", "sources/index.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== SPEC_CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Network first so updates show when online, cache fallback underground or out of range.
self.addEventListener("fetch", e => {
  // Only cache this site's own files; never touch calls to Google (they carry the API key).
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  // Source document tables (tens of MB) are fetched live and not kept offline, except their index.
  if (/\/sources\/(?!index\.json)/.test(new URL(e.request.url).pathname)) return;
  if (SPEC_PDF.test(new URL(e.request.url).pathname)){   // cache first: the PDF only changes with a new spec revision
    e.respondWith(caches.open(SPEC_CACHE).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => { if (r.ok && r.status === 200) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
