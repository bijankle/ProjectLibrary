// The top of every screen. Desktop: a menu bar (File, Help) and under it the tab strip: Assets (Browse and search),
// PFD, Layout and Quiz. Phone: the tab strip with one ☰ menu holding the same items.
// Assets and Quiz live in index.html, PFD and Layout in pfd.html; a tab on the other page is a link, a tab on this page is
// handled in place by onTab(id) (return true when handled). The whole top's height is --tb, which both pages offset
// their fixed layout by. Tabs.mount({ active, onTab, onSettings }), Tabs.set(id) marks a tab, Tabs.help(topic) opens Help.
// File: Settings (theme, app size, offline downloads, AI key), Checks, Sources.
// Help: a search over everything app wide (settings, features, how-to notes), How to use, Update app, About.
window.Tabs = (() => {
  const TABS = [["assets", "Assets", "index.html?cards#assets"], ["pfd", "PFD", "pfd.html#pfd"],
    ["layout", "Layout", "pfd.html#layout"], ["quiz", "Quiz", "index.html?cards#quiz"]];
  // the app's mark (the yellow P tile, as the app icon) for the logo at the top left
  const mark = s => `<svg viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true"><rect width="64" height="64" rx="18" fill="#e8b44a"/><rect x="6" y="6" width="52" height="52" rx="13" fill="none" stroke="#111418" stroke-width="2.5"/><text x="32" y="44.5" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-weight="800" font-size="36" fill="#111418">P</text></svg>`;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const desk = () => matchMedia("(min-width: 901px) and (hover: hover)").matches;
  // phone (anything that isn't a desktop with a mouse): a slim top row (the P, the section's name, its search) and the
  // sections as a tab bar along the bottom, with More (settings, checks, sources, help) as a page of its own
  const phone = !desk(); document.documentElement.classList.toggle("phone", phone);
  let el = null, O = {}, openM = null, bn = null, mo = null;
  const NAME = { assets: "Assets", pfd: "PFD", layout: "Layout", quiz: "Quiz", more: "More" };
  const ICO = { assets: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    pfd: '<rect x="3" y="4" width="6" height="5" rx="1"/><rect x="15" y="4" width="6" height="5" rx="1"/><rect x="9" y="15" width="6" height="5" rx="1"/><path d="M9 6.5h6M18 9v3.5h-6V15"/>',
    layout: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
    quiz: '<rect x="6" y="3" width="13" height="16" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/><path d="M10.5 9.2a2 2 0 1 1 2.6 1.9c-.6.2-1.1.7-1.1 1.4v.5M12 15.8v.1"/>',
    more: '<path d="M4 7h16M4 12h16M4 17h16"/>' };
  const ico = id => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[id]}</svg>`;
  let active = "";
  const set = id => { if (!el) return; active = id;
    [...el.querySelectorAll(".tb-t"), ...(bn ? bn.querySelectorAll(".tb-t") : [])].forEach(a => { const on = a.dataset.t === (mo && !mo.hidden ? "more" : id); a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    const n = el.querySelector(".ph-n"); if (n){ n.textContent = mo && !mo.hidden ? "More" : O.title || NAME[id] || ""; fitText(n); } };
  const theme = v => { try { localStorage.setItem("kcgm_theme", v); } catch (e) {} if (window.kcgmTheme) kcgmTheme(v); drawMenus(); };
  const curTheme = () => { try { return localStorage.getItem("kcgm_theme") || "device"; } catch (e) { return "device"; } };
  const tab = id => () => { const a = el.querySelector(`.tb-t[data-t="${id}"]`); if (a) a.click(); };

  // ---------- everything the Help search can find: how-to notes and app wide features ----------
  const TOPICS = [
    { t: "Browse the assets", k: "assets filter browse type code area steps any", h: "Pick an asset type on the left, then narrow it by code, area, size and so on; each option shows how many items it leaves. Once every step is set the list shows just those items. Tap × on a step at the top to change it, or Any to skip a step. The filter starts empty each time you open Assets." },
    { t: "Search any tag", k: "search tag line valve instrument camera photo glossary", h: "Type any part of a tag, line number, valve or word in the search box; spaces, hyphens and slashes don't matter. On the phone the camera button reads a tag from a photo. Help → Glossary lists plant terms. Recent searches are kept." },
    { t: "Asset charts", k: "charts graphs power kw mw donut bars", h: "On a wide desktop screen the charts beside the list follow the Browse filter. Tap a bar to apply it as the next filter step (asset type, code or area) or to open an item (top power users). Installed power leaves decommissioned equipment out." },
    { t: "P&IDs and PFD sheets", k: "pid drawing ribbon continuation tap back pfd viewer marked find ctrl+f search text", h: "Open a drawing by clicking its number on any item. On the sheet, every tag and drawing number shaded gold can be tapped: a drawing opens that sheet with the way back marked in red, a tag opens its Assets page, a bubble shared by several tags offers a choice. ← goes back to the last sheet at the same zoom. Ctrl+F (⌘F on a Mac) or the find box in the viewer bar finds any text on the drawing, across all its sheets; Enter steps to the next match." },
    { t: "Fluid filters", k: "fluid filter pfd ore flotation water reagent ctrl select pills", h: "Tap a fluid pill to see where it runs; everything else fades. Ctrl+click (⌘+click on a Mac) adds more. On the Layout the same pills are in Flow filters." },
    { t: "Narrative mode", k: "narrative story flows steps prev next play", h: "Narrative mode swaps the fluid pills for the five process stories (ore main line, grinding recycle, flotation, concentrate & gold, carbon). Pick one and step through it with the cards at the top or ◀ ▶. Utilities show only where they join the story's equipment." },
    { t: "Select and zoom on the PFD", k: "pfd select zoom pan click esc clear loops interlocks services", h: "Scroll to zoom, drag to pan. Click anything (equipment, stream, loop, interlock, symbol) to select it: everything else fades and the view zooms to fit. Ctrl+click adds or removes items. Click empty space or press Esc to clear. Control loops shows ISA tag bubbles with dashed signal lines; Interlocks shows red cause → effect lines (I interlock, P permissive). Design values are from the Stage 2 PDC and control philosophies, not live plant data." },
    { t: "Layout zoom", k: "layout map zoom wbs areas stack callout boxes", h: "Zoomed out: WBS area zones. At the plant view: every name lined up in columns left and right with a leader to its dot. Zoomed in: name boxes on the equipment. Tap a zone to fly in." },
    { t: "Move a Layout box", k: "layout drag move position hold export moves", h: "Press and hold a box for half a second until it lifts, then drag it. A shorter tap only selects it. Moves are kept on this device; Map options → Moves downloads them to send in." },
    { t: "Layout menus", k: "wbs filters flow filters map options satellite dim minor equipment old new layout drawing", h: "Top left of the map: Plant, WBS filters (fly to an area), Flow filters (fluids and narrative), Map options (imagery, dim, flow lines, minor equipment, moves, the old and new layout drawings)." },
    { t: "Quiz", k: "quiz flashcards cards swipe revisit deck", h: "Tap or swipe left to see the answer, then again for the next card; swipe right goes back. ↻ Revisit keeps a card for later. Filters on the card sets the deck; ✕ ends the deck." },
    { t: "Offline use", k: "offline download cache no signal documents", h: "The app, lists and search always work offline. Documents are kept once opened; File → Settings → Offline downloads fetches them all ahead of time." }
  ];
  const FEATURES = () => [
    { t: "Settings", k: "settings preferences app size text zoom ai key full screen", run: () => O.onSettings && O.onSettings() },
    { t: "Theme: dark", k: "theme dark mode colours colors", run: () => theme("dark") },
    { t: "Theme: light", k: "theme light mode colours colors", run: () => theme("light") },
    { t: "Text size (View menu)", k: "text size font bigger smaller larger small large view", run: () => O.onSettings ? O.onSettings() : location.href = "index.html?cards#settings" },
    { t: "Theme: follow device", k: "theme device system auto", run: () => theme("device") },
    { t: "Offline downloads", k: "offline download documents pids spec", run: () => O.onSettings && O.onSettings() },
    { t: "Update app", k: "update version refresh latest", run: () => window.AppUpdate && AppUpdate.update() },
    { t: "Checks", k: "checks issues gaps clashes", run: () => location.href = "issues.html" },
    { t: "Sources", k: "sources documents tables excel revisions", run: () => location.href = "issues.html#sources" },
    { t: "Assets", k: "assets browse search", run: tab("assets") },
    { t: "PFD", k: "pfd process flow diagram smart", run: tab("pfd") },
    { t: "Layout", k: "layout map plant satellite", run: tab("layout") },
    { t: "Quiz", k: "quiz flashcards", run: tab("quiz") },
    { t: "How to use", k: "help how to tutorial notes", run: () => help() },
    { t: "Glossary", k: "glossary terms abbreviations words meaning", run: () => glossary() },
    { t: "About this app", k: "about version sources data", run: () => help("about") }
  ];
  const find = q => { const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!w.length) return [];
    const hit = x => w.every(t => (x.t + " " + x.k + " " + (x.h || "")).toLowerCase().includes(t));
    return [...FEATURES().filter(hit).map(x => ({ ...x, f: 1 })), ...TOPICS.filter(hit)].slice(0, 12); };

  // ---------- menus ----------
  const item = (id, label, sub) => `<button type="button" class="mn-i" data-a="${id}">${label}${sub ? `<small>${sub}</small>` : ""}</button>`;
  const fileItems = () => item("settings", "Settings…", "Theme, app size, offline downloads, AI key") +
    `<hr>` + item("checks", "Checks") + item("sources", "Sources");
  const helpItems = () => `<div class="mn-s"><input type="search" placeholder="Search the app: settings, features, how to…" aria-label="Search the app"><div class="mn-r"></div></div>` +
    item("howto", "How to use…") + item("gloss", "Glossary", "Plant terms and abbreviations") + `<hr><button type="button" class="mn-i" data-a="update">Update app<small class="mn-ver">Checking the version…</small></button>` + item("about", "About this app");
  // View: text size (the same five steps as Settings, kcgmText in each page's head) and theme
  const TXT = [["xs", "Extra small"], ["s", "Small"], ["n", "Normal"], ["l", "Large"], ["xl", "Extra large"]];
  const curText = () => { try { return localStorage.getItem("kcgm_text") || "n"; } catch (e) { return "n"; } };
  const textSize = v => { try { localStorage.setItem("kcgm_text", v); } catch (e) {} if (window.kcgmText) kcgmText(v); dispatchEvent(new Event("resize")); drawMenus(); };
  const viewItems = () => `<div class="mn-h">Text size</div>` + TXT.map(([k, t]) => `<button type="button" class="mn-i mn-ck${curText() === k ? " on" : ""}" data-tx="${k}">${t}</button>`).join("") +
    `<hr><div class="mn-h">Theme</div>` + [["dark", "Dark"], ["light", "Light"], ["device", "Follow device"]].map(([k, t]) => `<button type="button" class="mn-i mn-ck${curTheme() === k ? " on" : ""}" data-th="${k}">${t}</button>`).join("");
  function drawMenus(){
    if (!el) return;
    const v = el.querySelector(".mn-v .mn-d"); if (v) v.innerHTML = viewItems();
    const f = el.querySelector(".mn-f .mn-d"); if (f) f.innerHTML = fileItems();
    const h = el.querySelector(".mn-h2 .mn-d"); if (h) h.innerHTML = helpItems();
    const one = el.querySelector(".mn-one .mn-d"); if (one) one.innerHTML = `<div class="mn-h">File</div>` + fileItems() + `<hr><div class="mn-h">Help</div>` + helpItems();
    wire();
  }
  function wire(){
    el.querySelectorAll("[data-th]").forEach(b => b.onclick = () => theme(b.dataset.th));
    el.querySelectorAll("[data-tx]").forEach(b => b.onclick = () => textSize(b.dataset.tx));
    el.querySelectorAll(".mn-i[data-a]").forEach(b => b.onclick = () => { close(); ({
      settings: () => O.onSettings && O.onSettings(), checks: () => location.href = "issues.html", sources: () => location.href = "issues.html#sources",
      howto: () => help(), about: () => help("about"), gloss: glossary, update: () => { b.disabled = true; window.AppUpdate && AppUpdate.update(); } })[b.dataset.a](); });
    if (window.AppUpdate) Promise.all([AppUpdate.installed(), AppUpdate.latest()]).then(([a, l]) => el.querySelectorAll(".mn-ver").forEach(v => {
      v.textContent = l && a && a !== l ? `Installed ${a}, latest ${l}: update available` : l ? `${l}: up to date` : a ? `${a} (offline)` : ""; }));
    el.querySelectorAll(".mn-s input").forEach(inp => { const out = inp.nextElementSibling;
      inp.oninput = () => { const r = find(inp.value);
        out.innerHTML = r.map((x, i) => `<button type="button" class="mn-i" data-r="${i}">${x.f ? "→ " : "? "}${esc(x.t)}${x.h ? `<small>${esc(x.h.slice(0, 90))}…</small>` : ""}</button>`).join("") || (inp.value.trim() ? `<div class="mn-no">Nothing found.</div>` : "");
        out.querySelectorAll("[data-r]").forEach(b => b.onclick = () => { const x = r[+b.dataset.r]; close(); if (x.run) x.run(); else help(x.t); }); };
      inp.onkeydown = e => { if (e.key === "Enter"){ const f = out.querySelector("[data-r]"); if (f) f.click(); } }; });
  }
  // the glossary lives on the Assets page: open it there (from the PFD page, go there)
  const glossary = () => { close(); if (O.onGlossary) O.onGlossary(); else location.href = "index.html?cards#gloss"; };
  function open(m){ close(); openM = m; m.classList.add("open"); const i = m.querySelector(".mn-s input"); if (i && desk()) setTimeout(() => i.focus(), 0); }
  function close(){ if (openM) openM.classList.remove("open"); openM = null; }

  // ---------- Help window: every note, searchable, and About ----------
  function help(topic){
    close(); let w = document.getElementById("helpWin");
    if (!w){ w = document.createElement("div"); w.id = "helpWin"; w.className = "hw"; document.body.appendChild(w);
      w.addEventListener("click", e => { if (e.target === w) w.hidden = true; }); addEventListener("keydown", e => { if (e.key === "Escape") w.hidden = true; }); }
    w.innerHTML = `<div class="hw-b" role="dialog" aria-label="Help"><div class="hw-top"><b>Help</b><input type="search" placeholder="Search help…" aria-label="Search help"><button type="button" class="hw-x" aria-label="Close">✕</button></div>
      <div class="hw-l">${TOPICS.map(x => `<section data-k="${esc((x.t + " " + x.k + " " + x.h).toLowerCase())}"><h4>${esc(x.t)}</h4><p>${esc(x.h)}</p></section>`).join("")}
      <section id="hwAbout" data-k="about version data sources"><h4>About this app</h4><p>Project Library is a study companion for the project's processing plant: the plant lists (equipment, instruments, valves, lines, specials, hoses), the P&amp;IDs and PFD sheets, the pipe and valve spec and the Stage 2 PDC, with a smart PFD, the layout on the real plant, asset charts and a quiz. Everything is read from the project documents listed under File → Sources: design values, not live plant data. It works offline once opened.</p><p class="hw-ver"></p></section></div></div>`;
    w.hidden = false;
    w.querySelector(".hw-x").onclick = () => w.hidden = true;
    const inp = w.querySelector("input"), secs = [...w.querySelectorAll("section")];
    inp.oninput = () => { const t = inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean); secs.forEach(s => s.hidden = t.length > 0 && !t.every(x => s.dataset.k.includes(x))); };
    if (window.AppUpdate) AppUpdate.latest().then(v => { const p = w.querySelector(".hw-ver"); if (p && v) p.textContent = "Version " + v + "."; });
    const at = topic === "about" ? w.querySelector("#hwAbout") : topic ? secs.find(s => s.querySelector("h4").textContent === topic) : null;
    if (at){ at.scrollIntoView({ block: "start" }); at.classList.add("hl"); } else if (desk()) inp.focus();
  }

  // The bar is drawn as soon as tabs.js runs (it sits at the top of <body>, data-early), so nothing below it jumps while
  // the page's own scripts load; mount(o) then hands over the page's handlers and draws the menus.
  function mount(o = {}){
    O = o;
    if (!el) build();
    if (phone){ drawMore(); set(o.active); if (o.active === "more" && o.openMore !== false) more(true); }
    else { drawMenus(); set(o.active); }
  }
  function build(){
    el = document.createElement("div"); el.className = "tbw";
    if (phone) return buildPhone();
    const tabs = TABS.map(([id, n, href]) => `<a class="tb-t" data-t="${id}" href="${href}"><span>${n}</span></a>`).join("");
    el.innerHTML = `<nav class="mb" aria-label="Menu">${PJ}<span class="mb-sep"></span><div class="mn mn-f"><button type="button" class="mn-b">File</button><div class="mn-d"></div></div><div class="mn mn-v"><button type="button" class="mn-b">View</button><div class="mn-d"></div></div><div class="mn mn-h2"><button type="button" class="mn-b">Help</button><div class="mn-d mn-dh"></div></div></nav>` +
      `<nav class="tb" aria-label="App sections">${NAVB.replace(/(class="nv-b nv-home"[^>]*>)<svg.*?<\/svg>/, (m, b) => b.replace('nv-b nv-home', 'nv-b nv-home nv-logo') + mark(34))}<div class="tb-seg">${tabs}</div></nav>`;
    document.body.prepend(el); wirePj(); document.documentElement.classList.add("has-tb"); document.documentElement.classList.toggle("has-mb", true);
    el.querySelectorAll(".tb-t").forEach(a => a.onclick = e => { if (O.onTab && O.onTab(a.dataset.t)){ e.preventDefault(); set(a.dataset.t); } });
    el.querySelectorAll(".mn").forEach(m => { const b = m.querySelector(".mn-b");
      b.onclick = e => { e.stopPropagation(); openM === m ? close() : open(m); };
      b.onmouseenter = () => { if (openM && openM !== m) open(m); };   // menu bar: moving across opens the next one
      m.querySelector(".mn-d").addEventListener("click", e => e.stopPropagation()); });
    document.addEventListener("click", close); addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    wireNav();
  }
  // ---------- phone ----------
  // top: the P, the section's name and a slot for that section's search (Tabs.slot); bottom: the five sections
  function buildPhone(){
    el.classList.add("ph");
    el.innerHTML = `<nav class="ph-top">${NAVB}${PJ}<b class="ph-n"></b><div class="ph-slot"><input class="mo-q" type="search" placeholder="Search the app" aria-label="Search the app" autocomplete="off" hidden></div></nav>`;
    bn = document.createElement("nav"); bn.className = "bn"; bn.setAttribute("aria-label", "App sections");
    bn.innerHTML = [...TABS, ["more", "More", "#"]].map(([id, n, href]) => `<a class="tb-t bn-t" data-t="${id}" href="${href}"><i>${ico(id)}</i><span>${n}</span></a>`).join("");
    mo = document.createElement("div"); mo.className = "mo"; mo.hidden = true; mo.setAttribute("role", "dialog"); mo.setAttribute("aria-label", "More");
    document.body.prepend(el); document.body.append(bn, mo); document.documentElement.classList.add("has-tb", "has-bn");
    wireNav(); wirePj();
    bn.querySelectorAll(".tb-t").forEach(a => a.onclick = e => {
      if (a.dataset.t === "more"){ e.preventDefault(); mo.hidden ? more(true) : more(false); return; }
      const was = !mo.hidden; more(false);
      if (O.onTab && O.onTab(a.dataset.t)){ e.preventDefault(); set(a.dataset.t); } else if (was && a.dataset.t === active){ e.preventDefault(); } });
  }
  // one set of line icons (the same stroke as the bottom bar), so every row looks alike
  const IC = { settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    offline: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    update: '<path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    checks: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3"/>',
    sources: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    howto: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
    gloss: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    about: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>' };
  const svg = (d, w) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const row = (a, icon, label, sub) => `<button type="button" class="mo-i" data-a="${a}"><i>${svg(IC[a] || "", 21)}</i><span>${label}${sub ? `<small>${sub}</small>` : ""}</span><em>${svg('<path d="m9 18 6-6-6-6"/>', 18)}</em></button>`;
  function drawMore(){
    mo.innerHTML = `<div class="mo-r"></div><div class="mo-l">
      <div class="mo-g">App</div>${row("settings", "⚙", "Settings")}${row("offline", "⤓", "Offline downloads")}${row("update", "↻", "Update app", '<b class="mn-ver">Checking the version…</b>')}
      <div class="mo-g">Data</div>${row("checks", "✓", "Checks")}${row("sources", "▤", "Sources")}
      <div class="mo-g">Help</div>${row("howto", "?", "How to use")}${row("gloss", "Aa", "Glossary")}${row("about", "ⓘ", "About this app")}</div>`;
    mo.querySelectorAll(".mo-i[data-a]").forEach(b => b.onclick = () => { const a = b.dataset.a; if (a !== "update") more(false); ({
      settings: settings, offline: settings, checks: () => location.href = "issues.html", sources: () => location.href = "issues.html#sources",
      howto: () => help(), about: () => help("about"), gloss: glossary, update: () => { b.disabled = true; window.AppUpdate && AppUpdate.update(); } })[a](); });
    if (window.AppUpdate) Promise.all([AppUpdate.installed(), AppUpdate.latest()]).then(([a, l]) => mo.querySelectorAll(".mn-ver").forEach(v => {
      v.textContent = l && a && a !== l ? `Installed ${a}, latest ${l}: update available` : l ? `${l}: up to date` : a ? `${a} (offline)` : ""; }));
    const inp = el.querySelector(".mo-q"), out = mo.querySelector(".mo-r"), list = mo.querySelector(".mo-l");
    inp.oninput = () => { const r = find(inp.value); list.hidden = !!inp.value.trim();
      out.innerHTML = r.map((x, i) => `<button type="button" class="mo-i" data-r="${i}"><i>${x.f ? "→" : "?"}</i><span>${esc(x.t)}${x.h ? `<small>${esc(x.h.slice(0, 90))}…</small>` : ""}</span><em>›</em></button>`).join("") || (inp.value.trim() ? `<div class="mn-no">Nothing found.</div>` : "");
      out.querySelectorAll("[data-r]").forEach(b => b.onclick = () => { const x = r[+b.dataset.r]; more(false); if (x.run) x.run(); else help(x.t); }); };
    inp.onkeydown = e => { if (e.key === "Enter"){ const f = out.querySelector("[data-r]"); if (f) f.click(); } };
  }
  // settings: the Assets page has the settings screen; from another page, go there
  const settings = () => { if (O.onSettings && O.settingsPage !== false) O.onSettings(); else location.href = "index.html?cards#settings"; };
  // More as a page of its own between the top row and the tab bar; the top row's search becomes the app search
  // big text that must stay on one line (the page name, an item's tag): one step smaller at a time, never below body text
  function fitText(e, box){ if (!e) return; e.style.fontSize = ""; const min = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fb")) || 11;
    requestAnimationFrame(() => { let f = parseFloat(getComputedStyle(e).fontSize), w = () => (box || e).clientWidth;
      for (let k = 0; k < 30 && e.scrollWidth > w() + 1 && f > min; k++){ f = Math.max(min, f - .5); e.style.fontSize = f + "px"; } }); }
  // ---------- back and home (every page, every tab) ----------
  // Every view change is a browser history entry (Tabs.push / Tabs.replace, the page restores it in Tabs.onPop), so ←
  // and the phone's own back go to the previous view, across tabs and pages. ⌂ is the Assets front page.
  // ---------- project picker ----------
  // Plant and Tailings (the tailings storage facility) as tick boxes: both by default, at least one stays ticked, kept
  // between visits (localStorage kcgm_proj, read by lookup.js, which filters the lists, the search and the drawings).
  // A one line box that keeps one width: All, Plant or Tailings. Desktop: left of File; phone: right of the arrows (not on Settings).
  const PJN = { main: "Plant", tsf: "Tailings" };
  const pjGet = () => { try { const v = JSON.parse(localStorage.getItem("kcgm_proj") || "null"); if (v && (v.main || v.tsf)) return { main: !!v.main, tsf: !!v.tsf }; } catch (e) {} return { main: true, tsf: true }; };
  const pjLabel = v => v.main && v.tsf ? "All" : v.main ? PJN.main : PJN.tsf;
  const PJ = `<div class="pj"><button type="button" class="pj-b" aria-haspopup="true" aria-expanded="false" title="Which project to show"><b class="pj-v">${pjLabel(pjGet())}</b></button><div class="pj-m" hidden></div></div>`;
  function wirePj(){
    const box = el.querySelector(".pj"); if (!box) return; const b = box.querySelector(".pj-b"), m = box.querySelector(".pj-m");
    const count = k => { try { if (window.Lookup && Lookup.ready()) return (window.Browse && Browse.projCount ? Browse.projCount(k) : Lookup.projCount(k)).toLocaleString(); } catch (e) {} return ""; };
    const label = () => { box.querySelector(".pj-v").textContent = pjLabel(pjGet()); };
    const draw = () => { const v = pjGet();
      m.innerHTML = Object.entries(PJN).map(([k, n]) => `<button type="button" class="pj-o${v[k] ? " on" : ""}" data-k="${k}" role="menuitemcheckbox" aria-checked="${v[k]}"><i>${v[k] ? "✓" : ""}</i><span>${n}</span><em>${count(k)}</em></button>`).join("");
      m.querySelectorAll(".pj-o").forEach(o => o.onclick = e => { e.stopPropagation(); const w = pjGet(); w[o.dataset.k] = !w[o.dataset.k];
        if (!w.main && !w.tsf){ o.classList.remove("pj-no"); void o.offsetWidth; o.classList.add("pj-no"); return; }   // one stays ticked
        if (window.Lookup && Lookup.setProj) Lookup.setProj(w); else { try { localStorage.setItem("kcgm_proj", JSON.stringify(w)); } catch (x) {} }
        label(); draw(); }); };
    const shut = () => { m.hidden = true; b.setAttribute("aria-expanded", "false"); };
    b.onclick = e => { e.stopPropagation(); if (!m.hidden) return shut(); close(); draw(); m.hidden = false; b.setAttribute("aria-expanded", "true"); };
    document.addEventListener("click", e => { if (!m.hidden && !box.contains(e.target)) shut(); });
    addEventListener("keydown", e => { if (e.key === "Escape") shut(); });
    addEventListener("kcgm-proj", () => { label(); if (!m.hidden) draw(); });
    addEventListener("storage", e => { if (e.key === "kcgm_proj") label(); });
  }
  const NAVB = `<span class="nv-bh"><button type="button" class="nv-b nv-home" aria-label="Home" title="Assets front page, nothing filtered"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/></svg></button><button type="button" class="nv-b nv-back" aria-label="Back" title="Back to the previous view"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg></button><button type="button" class="nv-b nv-fwd" aria-label="Forward" title="Forward again (redo the view change)" disabled><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></button></span>`;
  let depth = 0;
  // ⟶ redoes a view change you went back from: on if the browser can go forward (its navigation API, else the furthest depth
  // this tab has reached, which a new view change cuts back to itself)
  const maxD = v => { try { if (v != null) sessionStorage.setItem("kcgm_maxd", v); return +sessionStorage.getItem("kcgm_maxd") || 0; } catch (e) { return 0; } };
  const curD = () => (history.state && history.state.d) || 0;
  function fwdState(){ const can = window.navigation && "canGoForward" in navigation ? navigation.canGoForward : curD() < maxD();
    if (el) el.querySelectorAll(".nv-fwd").forEach(b => b.disabled = !can); }
  const push = st => { st = Object.assign({}, st, { d: depth = curD() + 1 }); history.pushState(st, ""); maxD(depth); fwdState(); };
  const replace = st => history.replaceState(Object.assign({}, history.state || {}, st, { d: (history.state && history.state.d) || 0 }), "");
  const sameSite = () => { try { return document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) { return false; } };
  function goBack(){
    if (mo && !mo.hidden){ more(false); return; }
    const h = document.getElementById("helpWin"); if (h && !h.hidden){ h.hidden = true; return; }
    if ((history.state && history.state.d > 0) || sameSite()) history.back(); else goHome();
  }
  // ⌂ is always the Assets front page with nothing searched, filtered or open (this page does it when it holds Assets)
  function goHome(){ more(false); const h = document.getElementById("helpWin"); if (h) h.hidden = true;
    if (O.homeHere && O.onHome && O.onHome("assets") !== false) return; location.href = "index.html?cards#home"; }
  function goFwd(){ history.forward(); }
  addEventListener("pageshow", () => setTimeout(fwdState, 0));
  addEventListener("popstate", e => { fwdState(); if (mo && !mo.hidden) more(false); const h = document.getElementById("helpWin"); if (h) h.hidden = true; if (O.onPop) O.onPop(e.state || {}); });
  function wireNav(){ el.querySelectorAll(".nv-back").forEach(b => b.onclick = goBack); el.querySelectorAll(".nv-home").forEach(b => b.onclick = goHome); el.querySelectorAll(".nv-fwd").forEach(b => b.onclick = goFwd); fwdState(); }
  function more(on){
    if (!mo) return; mo.hidden = !on; const inp = el.querySelector(".mo-q");
    [...el.querySelector(".ph-slot").children].forEach(c => { if (c !== inp) c.classList.toggle("mo-off", on); });
    inp.hidden = !on; if (!on){ inp.value = ""; inp.oninput && inp.oninput(); }
    if (on){ const h = document.getElementById("helpWin"); if (h) h.hidden = true; }
    set(active);
  }
  // a section's own search box goes into the top row (phone only); false on a desktop
  const slot = node => { if (!phone || !el || !node) return false; const s = el.querySelector(".ph-slot"); s.insertBefore(node, s.firstChild); return true; };
  const css = `/* the camera / status strip at the top: half its height is enough to clear the camera hole */
:root{--sat:calc(env(safe-area-inset-top) * .5);--tb:calc(44px + var(--sat));--fh:22px;--fl:13px;--fb:15px;--ff:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
/* one font everywhere, only three sizes */
body,button,input,select,textarea,code,kbd,pre,svg,.leaflet-container{font-family:var(--ff)}   /* the three text sizes: titles, section labels, body */
@media (pointer:coarse){input,select,textarea{font-size:16px}}   /* (a phone zooms in on a smaller text box) */
:root.has-mb{--tb:calc(75px + var(--sat))}
.tbw{position:fixed;left:0;right:0;top:0;z-index:60;background:var(--panel,var(--card));border-bottom:1px solid var(--line);padding-top:var(--sat)}
.mb{height:30px;display:flex;align-items:stretch;gap:2px;padding:0 max(6px,env(safe-area-inset-right)) 0 max(6px,env(safe-area-inset-left));border-bottom:1px solid var(--line);font-size:var(--fb,15px)}
.tb{height:44px;padding:0 max(6px,env(safe-area-inset-right)) 0 max(6px,env(safe-area-inset-left));display:flex;align-items:stretch;gap:2px}
/* the sections as a segmented control: one grey track, the open one a raised chip */
.tb{align-items:center}
.tb-seg{display:flex;flex:0 1 auto;min-width:0;gap:2px;padding:3px;border-radius:10px;background:color-mix(in srgb,var(--ink) 8%,transparent)}
.tb-t{flex:0 1 auto;min-width:0;padding:5px 14px;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--mute);text-decoration:none;font-weight:700;font-size:var(--fb,15px);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tb-t:hover{color:var(--ink)}
.tb-t.on{color:var(--ink);background:color-mix(in srgb,var(--ink) 18%,var(--panel,var(--card)));box-shadow:0 1px 3px rgba(0,0,0,.25)}
html[data-theme="light"] .tb-t.on{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.16)}
.tb-i{font-size:var(--fb,15px)}
.mn{position:relative;display:flex}
.lg{display:flex;align-items:center;gap:6px;padding:0 12px 0 4px;margin-right:4px;border-right:1px solid var(--line);color:var(--ink)}
/* desktop: the app tile spans both rows (menu and sections), left of them */
.lg-big{position:absolute;left:max(8px,env(safe-area-inset-left));top:calc(var(--sat) + 7px);bottom:7px;width:60px;border:0!important;padding:0!important;margin:0!important;z-index:1}
.lg-big svg{width:60px;height:60px}
.lg-s{display:flex;align-items:center;padding:0 4px 0 2px}.lg-s svg{width:22px;height:22px}
.mb-sep{width:1px;margin:7px 4px;background:var(--line)}
/* project picker: a small labelled box (PROJECT over All / Plant / Tailings), one width whatever is picked */
.pj{position:relative;display:flex;align-items:center;flex:none}
.pj-b{position:relative;width:104px;height:22px;display:flex;align-items:center;border:1.5px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:0 20px 0 8px;font:inherit;cursor:pointer;margin:0 4px}
.pj-b b{font-size:13px;font-weight:800;line-height:1;white-space:nowrap}
.pj-b:after{content:"▾";position:absolute;right:7px;top:50%;transform:translateY(-50%);color:var(--mute);font-size:11px}
.pj-m{position:absolute;top:calc(100% + 5px);left:4px;min-width:220px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.28);overflow:hidden;z-index:80}.pj-m[hidden]{display:none}
.pj-o{display:flex;align-items:center;gap:12px;width:100%;border:0;border-bottom:1px solid var(--line);background:none;color:var(--ink);padding:10px 14px;font:inherit;font-size:var(--fb,15px);font-weight:700;text-align:left;cursor:pointer}
.pj-o:last-child{border-bottom:0}.pj-o span{flex:1}.pj-o em{font-style:normal;font-weight:600;color:var(--mute);font-size:var(--fl,13px)}
.pj-o i{flex:none;width:21px;height:21px;border-radius:6px;border:2px solid var(--line);display:grid;place-items:center;font-style:normal;font-weight:900;font-size:13px;color:#1a1307}.pj-o.on i{border-color:var(--gold,var(--accent));background:var(--gold,var(--accent))}
.pj-no{animation:pjno .3s}@keyframes pjno{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.lg b{font:900 var(--fl,13px)/1 var(--ff);letter-spacing:.08em;white-space:nowrap}.mb .lg{margin:6px 4px 6px 0}.lg-m{border:0;padding:0 4px 0 2px;margin:0}
.mb .mn-b{border:0;background:none;color:var(--ink);font:inherit;font-size:var(--fb,15px);padding:0 10px;border-radius:5px;margin:3px 0;cursor:pointer}
.mb .mn-b:hover,.mn.open>.mn-b{background:var(--panel2,var(--card2))}
.mn-one{margin-left:auto}.tb-s{flex:none;width:42px;border:0;background:none;color:var(--mute);font-size:21px;cursor:pointer}
.mn-d{display:none;position:absolute;left:0;top:100%;min-width:250px;max-width:min(360px,calc(100vw - 16px));background:var(--panel,var(--card));border:1px solid var(--line);border-radius:10px;
  box-shadow:0 10px 30px #0008;padding:5px;z-index:70;max-height:calc(100vh - 90px);overflow-y:auto}
.mn.open>.mn-d{display:block}.mn-dr{left:auto;right:0}.mn-dh{min-width:330px}
.mn-i{display:block;width:100%;text-align:left;border:0;background:none;color:var(--ink);font:inherit;font-size:var(--fb,15px);padding:7px 10px;border-radius:6px;cursor:pointer}
.mn-i:hover,.mn-i:focus-visible{background:var(--panel2,var(--card2))}.mn-i:disabled{opacity:.6}
.mn-i small{display:none}
.mn-ck{padding-left:28px;position:relative}.mn-ck.on::before{content:"✓";position:absolute;left:10px;color:var(--gold,var(--accent));font-weight:800}   /* no hover hints in the menus */
.mn-d hr{border:0;border-top:1px solid var(--line);margin:5px 4px}
.mn-h{font-size:var(--fl,13px);font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);padding:6px 10px 2px}
.mn-th{display:flex;align-items:center;padding:5px 10px}.mn-th span{flex:1;font-size:var(--fb,15px)}
.mn-th button{border:1px solid var(--line);background:none;color:var(--mute);font:inherit;font-size:var(--fb,15px);font-weight:700;padding:3px 9px;cursor:pointer}
.mn-th button:first-of-type{border-radius:7px 0 0 7px}.mn-th button:last-of-type{border-radius:0 7px 7px 0}.mn-th button+button{border-left:0}
.mn-th button.on{background:var(--card,var(--panel));color:color-mix(in srgb,var(--gold,var(--accent)) 70%,var(--ink));border-color:var(--gold,var(--accent))}
.mn-s{padding:5px 5px 3px}.mn-s input{width:100%;box-sizing:border-box;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:7px 9px;font:inherit;font-size:var(--fb,15px)}
.mn-r:not(:empty){margin-top:4px;border-bottom:1px solid var(--line);padding-bottom:4px}.mn-no{color:var(--mute);font-size:var(--fb,15px);padding:6px 10px}
.hw{position:fixed;inset:0;z-index:300;background:#0008;display:flex;align-items:flex-start;justify-content:center;padding:60px 12px 12px}.hw[hidden]{display:none}
.hw-b{background:var(--panel,var(--card));color:var(--ink);border:1px solid var(--line);border-radius:14px;width:min(640px,100%);max-height:calc(100vh - 80px);display:flex;flex-direction:column;box-shadow:0 20px 50px #000a}
.hw-top{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line)}.hw-top b{font-size:var(--fb,15px)}
.hw-top input{flex:1;min-width:0;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:7px 9px;font:inherit;font-size:var(--fb,15px)}
.hw-x{border:0;background:none;color:var(--mute);font-size:18px;cursor:pointer}
.hw-l{overflow-y:auto;padding:6px 16px 16px}.hw-l section{padding:8px 0;border-bottom:1px solid var(--line)}.hw-l section[hidden]{display:none}.hw-l section.hl h4{color:var(--gold,var(--accent))}
.hw-l h4{margin:4px 0;font-size:var(--fb,15px)}.hw-l p{margin:4px 0;font-size:var(--fb,15px);line-height:1.5;color:var(--ink)}.hw-ver{color:var(--mute) !important}
/* scroll bars across the app: barely there until you hover the area, clearer on the bar itself, gold while dragging */
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background-color:transparent;border:3px solid transparent;background-clip:padding-box;border-radius:6px;transition:background-color .2s}
:hover::-webkit-scrollbar-thumb{background-color:color-mix(in srgb,var(--mute) 30%,transparent)}
::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--mute) 75%,transparent);border-width:2px}
::-webkit-scrollbar-thumb:active{background-color:var(--gold,var(--accent));border-width:2px}
@supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:transparent transparent}*:hover{scrollbar-color:color-mix(in srgb,var(--mute) 45%,transparent) transparent}}
/* back and home: before the tabs (desktop) and at the start of the phone's top row */
.nv-bh{display:flex;gap:6px;flex:none;margin-right:8px}
.nv-b{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--card,var(--panel));color:var(--ink);display:grid;place-items:center;padding:0;cursor:pointer;flex:none}
.nv-b svg{width:18px;height:18px;display:block;flex:none;cursor:inherit}   /* (a page's own svg rules must not resize these) */
.nv-b:disabled{opacity:.35;cursor:default}.nv-b:disabled:hover{border-color:var(--line);color:var(--ink)}
.nv-b:hover{border-color:var(--gold,var(--accent));color:var(--gold,var(--accent))}
.nv-b.nv-logo,.nv-b.nv-logo:hover{border:0;background:none;border-radius:10px;width:34px;height:34px}.nv-b.nv-logo svg{width:34px!important;height:34px!important}.nv-b.nv-logo:hover{filter:brightness(1.06);box-shadow:0 0 0 2px color-mix(in srgb,var(--gold,var(--accent)) 35%,transparent)}   /* desktop: the P is the home button */
.ph-top .nv-bh{margin-right:2px;gap:4px}.ph-top .nv-b{width:29px;height:29px}.ph-top .nv-b svg{width:16px;height:16px}
:root.phone .nv-b{border-width:1.5px;border-color:color-mix(in srgb,var(--ink) 22%,var(--line))}:root.phone .nv-b svg{stroke-width:2.6}   /* phone: firmer buttons */
:root.phone :is(.btn,.pf-b,.lk-pill,.lk-btn,.lk-vw,.ts-r,.x,#qBtns button){border-width:1.5px;border-style:solid;border-color:color-mix(in srgb,var(--ink) 22%,var(--line))}
:root.phone :is(.btn,.pf-b,.lk-pill,.lk-btn,.ts-r,#qBtns button){font-weight:800}
:root.phone :is(.pf-b.on,.lk-pill.on){border-color:var(--lk-a,var(--gold))}
/* everything that can be clicked shows the hand, and list items light up under the mouse */
button:not(:disabled),a[href],summary,select,label[for],[role=button],[role=tab],input[type=range],input[type=checkbox],input[type=radio],[data-k],[data-dwg]{cursor:pointer}
button:disabled{cursor:default}
@media (hover:hover){.bw-o:hover,.bp-o:hover,.bp-c:hover{border-color:var(--gold,var(--accent))}.bw-it:hover,.bp-it:hover,.mo-i:hover,.lo-lr:hover,.lo-le button:hover{background:var(--card2,var(--panel2))}
  .bw-cr:hover,.bw-cr:hover{filter:brightness(1.08)}.bw-any:hover,.bp-any:hover{border-color:var(--gold,var(--accent));color:var(--ink)}}
/* ---------- phone: top row, bottom tab bar, More page ---------- */
:root{--bn:0px}
:root.phone{--tb:calc(52px + var(--sat));--bn:calc(58px + env(safe-area-inset-bottom))}
.tbw.ph{border-bottom:1px solid var(--line)}
.ph-top{height:52px;display:flex;align-items:center;gap:8px;padding:0 max(10px,env(safe-area-inset-right)) 0 max(10px,env(safe-area-inset-left))}
.ph-top .lg-m{flex:none;display:flex}.ph-top .lg-m svg{width:30px;height:30px}
:root.phone .pj-m{left:auto;right:-60px}:root.phone .pj{flex:0 1 112px;min-width:72px}:root.phone .pj-b{width:100%;max-width:112px;min-width:0;height:36px;border-radius:10px;padding:0 24px 0 10px;margin:0}:root.phone .pj-b b{font-size:var(--fb,15px);font-weight:700}   /* the same size as the rest of the text (it follows the text size setting) */
.ph-top .ph-n{display:none}:root.in-settings .ph-top .ph-n{display:block}:root.in-settings .ph-top .pj{display:none}   /* (the page name only on Settings) */
.ph-n{flex:0 1 auto;min-width:0;font-size:var(--fh,22px);font-weight:800;white-space:nowrap;overflow:hidden;line-height:1.1}   /* the page's name, like an item's tag (fitted to the row) */
.ph-slot{flex:1;min-width:0;display:flex;align-items:center;gap:6px}.ph-slot>*{min-width:0}.ph-slot>.mo-off{display:none!important}
/* the shared bar's icons keep their size whatever the page's own styles say (the PFD page sizes every svg to fill) */
.tb-t svg{width:24px!important;height:24px!important;flex:none;cursor:inherit!important;display:block}.mo-i i svg{width:21px!important;height:21px!important;cursor:inherit!important}.mo-i em svg{width:18px!important;height:18px!important;cursor:inherit!important}.nv-b svg,.pj svg{cursor:inherit!important}
/* phone top row: the right end is one round button on every page: the camera on Assets, a search elsewhere, which
   opens across the whole row when tapped (and stays open while it holds text) */
:root.phone .ph-top{position:relative}:root.phone .ph-slot{flex:none;justify-content:flex-end;margin-left:auto;padding-left:6px}
.bn-t,.bn-t span{line-height:1.2}   /* the same on every page (some set a line height on the body, some don't) */
:root.phone .ph-slot>input:not(#_){flex:none;width:34px!important;min-width:34px!important;max-width:none!important;height:34px!important;padding:0!important;border-radius:50%!important;border:1.5px solid color-mix(in srgb,var(--ink) 22%,var(--line))!important;background:var(--card,var(--panel)) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7480' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-4-4'/%3E%3C/svg%3E") center/17px no-repeat!important;color:transparent!important;caret-color:transparent;cursor:pointer;box-shadow:none!important;margin:0!important;font-size:16px!important}
:root.phone .ph-slot>input:not(#_)::placeholder{color:transparent}
:root.phone .ph-slot>input:not(#_)::-webkit-search-cancel-button{display:none}
:root.phone .ph-slot>input:not(#_):focus,:root.phone .ph-slot>input:not(#_):not(:placeholder-shown){position:absolute;left:10px;right:10px;top:50%;transform:translateY(-50%);width:auto!important;height:40px!important;border-radius:20px!important;padding:0 14px 0 40px!important;background-position:13px center!important;color:var(--ink)!important;caret-color:auto;z-index:6;box-shadow:0 2px 12px rgba(0,0,0,.18)!important;cursor:text}
:root.phone .ph-slot>input:not(#_):focus::placeholder{color:var(--mute)}
:root.phone .ph-slot>input:not(#_):focus::-webkit-search-cancel-button{display:initial}
:root.phone .ph-slot .lk-cam{flex:none;width:34px;height:34px;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--ink) 22%,var(--line));background:var(--card,var(--panel));color:var(--ink);display:grid;place-items:center;padding:0;margin:0}
:root.phone .ph-slot .lk-cam svg{width:18px!important;height:18px!important}
:root.in-settings .ph-slot>:not(.mo-q){display:none!important}   /* Settings: just its title */
.ph-slot input[type=search],.ph-slot .mo-q{flex:1;width:100%;height:36px;box-sizing:border-box;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:18px;padding:0 12px;font:inherit;font-size:16px}
.bn{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;background:var(--panel,var(--card));border-top:1px solid var(--line);
  padding:4px max(2px,env(safe-area-inset-right)) calc(4px + env(safe-area-inset-bottom)) max(2px,env(safe-area-inset-left));height:var(--bn);box-sizing:border-box}
.bn-t{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:var(--mute);text-decoration:none;font-size:var(--fl,13px);font-weight:600;-webkit-tap-highlight-color:transparent}
.bn-t i{display:grid;place-items:center;width:56px;height:28px;border-radius:14px;transition:background .15s}
/* the open tab: a short gold bar on its top edge, icon and label gold */
.bn-t{position:relative}.bn-t.on,html[data-theme="light"] .bn-t.on{color:var(--gold,var(--accent));font-weight:800;background:none;box-shadow:none}
.bn-t.on:before{content:"";position:absolute;top:-4px;left:22%;right:22%;height:3px;border-radius:0 0 3px 3px;background:var(--gold,var(--accent))}
.mo{position:fixed;left:0;right:0;top:var(--tb);bottom:var(--bn);z-index:55;background:var(--bg);overflow-y:auto;overscroll-behavior:contain;padding:4px 0 16px}.mo[hidden]{display:none}
.mo-g{font-size:var(--fl,13px);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);padding:14px 16px 6px}
.mo-i{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:var(--panel,var(--card));color:var(--ink);font:inherit;font-size:var(--fb,15px);padding:12px 16px;cursor:pointer}
.mo-i i{flex:none;width:26px;display:grid;place-items:center;font-style:normal;color:var(--mute)}.mo-i span{flex:1;min-width:0}.mo-i em{font-style:normal;color:var(--mute);display:grid;place-items:center}
.mo-i small{display:block;color:var(--mute);font-size:var(--fl,13px);margin-top:2px}.mo-i small b{font-weight:400}.mo-r .mn-no{padding:14px 16px}
.mo-l[hidden]{display:none}
/* phone: help opens as a page between the two bars */
:root.phone .hw{top:var(--tb);bottom:var(--bn);padding:0;background:var(--bg);z-index:58}
:root.phone .hw-b{border:0;border-radius:0;width:100%;max-height:none;height:100%;box-shadow:none}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const title = t => { O.title = t; set(active); };
  // early: draw the bar now, with the section the address names (the page's mount fills in the rest)
  const me = document.currentScript, early = me && me.dataset.early;
  if (early && document.body && (early === "all" || phone)){
    const h = location.hash, pg = location.pathname.split("/").pop();
    const guess = /issues/.test(pg) ? "more" : /pfd/.test(pg) ? (h === "#layout" ? "layout" : "pfd") : h === "#quiz" ? "quiz" : "assets";
    if (guess === "more") O.title = h === "#sources" ? "Sources" : "Checks";
    build(); set(guess); }
  return { mount, set, help, slot, more, phone, desk, title, push, replace, back: goBack, home: goHome, fit: fitText };
})();

// Property tables (label | value): the label column is set, per table, to the width that makes the whole table take
// the fewest lines, so as little text as possible wraps in either column. Worked out again when a table appears or
// its width changes. (A text's line count is estimated as its one line width over the column width, rounded up.)
(() => {
  const SEL = ".lk-t, #info table";
  const cv = document.createElement("canvas").getContext("2d");
  const pad = el => { const s = getComputedStyle(el); return parseFloat(s.paddingLeft) + parseFloat(s.paddingRight); };
  const textW = el => { cv.font = getComputedStyle(el).font; return el.textContent.split("\n").reduce((m, t) => Math.max(m, cv.measureText(t.trim()).width), 0); };
  function fit(t){
    const rows = [...t.rows].filter(r => r.cells.length === 2); if (!rows.length) return;
    const W = t.clientWidth; if (!W) return;
    const pl = pad(rows[0].cells[0]), pv = pad(rows[0].cells[1]);
    const R = rows.map(r => [textW(r.cells[0]), textW(r.cells[1])]);
    const lines = w => R.reduce((n, [a, b]) => n + Math.max(Math.ceil(a / Math.max(1, w - pl)) || 1, Math.ceil(b / Math.max(1, W - w - pv)) || 1), 0);
    const lo = Math.min(W * .25, 90), hi = W * .6;
    const cands = new Set([lo, hi]); R.forEach(([a]) => { const w = Math.ceil(a + pl + 1); if (w > lo && w < hi) cands.add(w); });
    let best = null, bn = 1e9; [...cands].sort((a, b) => a - b).forEach(w => { const n = lines(w); if (n < bn){ bn = n; best = w; } });   // ties: the narrower label, wider values
    t.style.setProperty("--lw", Math.round(best) + "px");
  }
  const st = document.createElement("style");
  st.textContent = `.lk-t td:first-child,#info table td:first-child{width:var(--lw,13.5em)!important}`;
  document.head.appendChild(st);
  const ro = new ResizeObserver(es => es.forEach(e => fit(e.target))), seen = new WeakSet();
  const scan = () => document.querySelectorAll(SEL).forEach(t => { if (!seen.has(t)){ seen.add(t); ro.observe(t); fit(t); } });   // (new tables; the observer refits on a width change)
  let q = 0; new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; scan(); }); }).observe(document.documentElement, { childList: true, subtree: true });
  scan(); addEventListener("resize", () => document.querySelectorAll(SEL).forEach(fit));   // (a text size change)
})();
