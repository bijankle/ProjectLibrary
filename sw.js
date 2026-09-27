// Offline cache. Bump VERSION when questions change so phones pick up the new bank.
const VERSION = "kcgm-v14";
const FILES = ["./", "index.html", "cards.js", "facts.js", "ai.js", "glossary.js", "manifest.json", "icon.svg", "icon-192.png", "icon-512.png", "pfd.html", "pfd-data.js", "pfd-streams.js", "pfd-equip.js", "tools/tagutil.js", "lookup.js", "search-data.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Network first so updates show when online, cache fallback underground or out of range.
self.addEventListener("fetch", e => {
  // Only cache this site's own files; never touch calls to Google (they carry the API key).
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
