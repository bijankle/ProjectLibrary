// Offline cache. Bump VERSION when questions change so phones pick up the new bank.
const VERSION = "kcgm-v472";
// Documents (spec PDF, drawings, source tables) live in their own cache that app updates keep. The spec and drawings
// are saved there the first time they're opened; Settings > Offline downloads (offline.js) can fetch any of them.
const DOCS = "kcgm-docs-5",   // never rename: renaming deletes every download. A rebuilt document is refetched by its
      // fingerprint in offline.json instead (Sources shows it as needing an update)
      // DOC_PDF: kept the first time they're fetched (drawings and their pictures, the traced lines, the process control
      // data, the camera's text reader, the map library and the site map: the offline core, offline.js); DOC_ANY: served from there first
      DOC_PDF = /\/(spec\/[^/]+\.pdf|(PIDs|PFDs|SLDs)\/.+\.pdf(\.p\d+\.png)?|lines\/[^/]+\.json|pct\/(?!idx\.json)[^/]+\.json|vendor\/(tesseract|leaflet)\/.+|map\/[^/]+\.webp)$/,
      DOC_ANY = /\/(spec|PIDs|PFDs|SLDs|sources|lines|vendor\/tesseract|vendor\/leaflet|map)\/(?!index\.json)|\/pct\/(?!idx\.json)/;
const FILES = ["./", "index.html", "cards.js", "facts.js", "ai.js", "glossary.js", "glossary-faq.js", "glossary-counts.js", "manifest.json", "pics.json", "icon.svg", "icon-v3-192.png", "icon-v3-512.png", "icon-v3-maskable-512.png", "apple-touch-icon.png", "pfd.html", "pfd-data.js", "pfd-streams.js", "pfd-equip.js", "pfd-bfd.js", "pfd-layout-data.js", "pfd-layout.js", "tools/tagutil.js", "lookup.js", "browse.js", "viz.js", "tabs.js", "textsize.js", "browse.json", "search-data.json", "app-update.js", "errlog.js", "xlsx-lite.js", "issues.html", "issues.json", "spec.js", "spec/index.json", "pdfview.js", "pid.js", "offline.js", "PIDs/index.json", "pid-refs.json", "pfd-tags.json", "doc-tags.json", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "sources-view.js", "sources-list.js", "sources/index.json", "followups.json", "checks-state.js", "sort.js", "refonly.json", "sp.js", "sp.json", "sp-held.json", "iom.json", "iso.json", "sld-tags.json", "contents.json", "sheet-bbox.json", "pct/idx.json", "sp-titles.json", "export.html", "export.js", "routes.json", "equip-flow.json", "vendor/pdf-lib/pdf-lib.min.js"];
// Install: keep every app file (a file the page already fetched into this version's cache is not fetched again)
// the documents are spread over 8 caches by their address (DOCS and DOCS-s1 … -s7; offline.js has the same split): a phone
// that drops one cache after a failed write (Chrome on Android can, on a store of a gigabyte) loses an eighth, not all of it.
// Copies saved before the split stay in DOCS and are still served from there.
const SH = 8, shardOf = p => { let h = 0; for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) | 0; return Math.abs(h) % SH; }, docName = i => i ? DOCS + "-s" + i : DOCS;
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f => c.match(f).then(h => h || c.add(f)))))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== DOCS && !k.startsWith(DOCS + "-s")).map(k => caches.delete(k)))));
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
    const nm = docName(shardOf(path));
    e.respondWith(caches.open(nm).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit || (nm !== DOCS ? caches.open(DOCS).then(c0 => c0.match(e.request, { ignoreSearch: true })) : null))
      .then(hit => hit || fetch(e.request).then(r => { if (DOC_PDF.test(path) && r.ok && r.status === 200) c.put(e.request, r.clone()).catch(() => {}); return r; }))));
    return;
  }
  if (/\/sw\.js$/.test(path)) return;   // (the update check reads the newest sw.js from the server)
  e.respondWith(caches.open(VERSION).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok && r.status === 200) c.put(e.request, r.clone()); return r; }))).catch(() => fetch(e.request)));
});

// ---------- downloads that carry on with the app shut or the phone locked (Background Fetch; offline.js starts them) ----------
// The page hands the whole list still to fetch (__bgq.json, in DOCS) to the phone's own download manager in one go (shown
// in the notifications; a service worker may not start one itself, so it can't be done a batch at a time). When it lands
// every file is filed here (into the 8 caches, versions noted), the list saved every 50 files, so a cut-off still keeps what
// was filed. A file that failed stays on the list (three tries in all, then named in its errors); the app starts a new
// download for what's left the next time it is opened.
const BGQ = () => self.registration.scope + "__bgq.json", BGV = () => self.registration.scope + "__docs_versions.json";
const jget = async u => { try { const r = await (await caches.open(DOCS)).match(u); return r ? await r.json() : null; } catch (e) { return null; } };
const jput = async (u, o) => (await caches.open(DOCS)).put(u, new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } }));
async function bgStore(reg){
  const q = await jget(BGQ()); if (!q) return; const held = (await jget(BGV())) || {}, base = new URL(self.registration.scope).pathname, done = new Set(), retry = new Set();
  q.tries = q.tries || {}; q.errs = q.errs || [];
  const save = async () => { q.files = [...q.files.filter(f => !done.has(f) && !retry.has(f)), ...q.files.filter(f => retry.has(f))]; await jput(BGV(), held); await jput(BGQ(), q); };
  let n = 0;
  for (const r of await reg.matchAll()){
    const u = new URL(r.request.url), key = u.origin + u.pathname, f = decodeURIComponent(u.pathname.slice(base.length));
    try { const res = await r.responseReady; if (!res || !res.ok) throw new Error("server said " + (res ? res.status : "nothing"));
      const nm = docName(shardOf(u.pathname)); if (nm !== DOCS) await (await caches.open(DOCS)).delete(key);
      await (await caches.open(nm)).put(key, res); if (q.ver && q.ver[f]) held[f] = q.ver[f]; done.add(f); }
    catch (e){ if (/quota/i.test((e && e.name) + " " + (e && e.message))){ q.errs.push("the phone has no more room for downloads (" + (e.message || e.name) + ")"); q.stopped = true; break; }
      q.tries[f] = (q.tries[f] || 0) + 1; if (q.tries[f] >= 3){ done.add(f); q.errs.push(f + ": " + ((e && e.message) || "failed")); } else retry.add(f); }
    if (++n % 50 === 0) await save();
  }
  await save(); return q;
}
const bgDone = e => e.waitUntil((async () => { const q = await bgStore(e.registration);
  try { await e.updateUI({ title: q && q.files && q.files.length && !q.stopped ? "Project Library: some files to finish, open the app to carry on" : "Project Library: downloads saved for offline" }); } catch (x) {} })());
self.addEventListener("backgroundfetchsuccess", bgDone);
self.addEventListener("backgroundfetchfail", bgDone);
self.addEventListener("backgroundfetchabort", e => e.waitUntil((async () => { const q = await jget(BGQ()); if (q){ q.stopped = true; await jput(BGQ(), q); } })()));
self.addEventListener("backgroundfetchclick", e => e.waitUntil(self.clients.openWindow(self.registration.scope + "issues.html#sources")));
