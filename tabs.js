// The top of every screen. Desktop: a menu bar (File, Help) and under it the tab strip: Assets (Browse and search),
// PFD, Layout and Quiz. Phone: the tab strip with one ☰ menu holding the same items.
// Assets and Quiz live in index.html, PFD and Layout in pfd.html; a tab on the other page is a link, a tab on this page is
// handled in place by onTab(id) (return true when handled). The whole top's height is --tb, which both pages offset
// their fixed layout by. Tabs.mount({ active, onTab, onSettings }), Tabs.set(id) marks a tab, Tabs.help(topic) opens Help.
// File: Settings (theme, app size, offline downloads, AI key), Checks, Sources.
// Help: a search over everything app wide (settings, features, how-to notes), How to use, Update app, About.
window.Tabs = (() => {
  const TABS = [["assets", "🔎", "Assets", "index.html?cards#assets"], ["pfd", "〰️", "PFD", "pfd.html#pfd"],
    ["layout", "🗺️", "Layout", "pfd.html#layout"], ["quiz", "🃏", "Quiz", "index.html?cards#quiz"]];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const desk = () => matchMedia("(min-width: 901px) and (hover: hover)").matches;
  let el = null, O = {}, openM = null;
  const set = id => el && el.querySelectorAll(".tb-t").forEach(a => { const on = a.dataset.t === id; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const theme = v => { try { localStorage.setItem("kcgm_theme", v); } catch (e) {} if (window.kcgmTheme) kcgmTheme(v); drawMenus(); };
  const curTheme = () => { try { return localStorage.getItem("kcgm_theme") || "device"; } catch (e) { return "device"; } };
  const tab = id => () => { const a = el.querySelector(`.tb-t[data-t="${id}"]`); if (a) a.click(); };

  // ---------- everything the Help search can find: how-to notes and app wide features ----------
  const TOPICS = [
    { t: "Browse the assets", k: "assets filter browse type code area steps any", h: "Pick an asset type on the left, then narrow it by code, area, size and so on; each option shows how many items it leaves. Once every step is set the list shows just those items. Tap × on a step at the top to change it, or Any to skip a step. The filter starts empty each time you open Assets." },
    { t: "Search any tag", k: "search tag line valve instrument camera photo glossary", h: "Type any part of a tag, line number, valve or word in the search box; spaces, hyphens and slashes don't matter. 📷 reads a tag from a photo. The book button opens the glossary. Recent searches are kept." },
    { t: "Asset charts", k: "charts graphs power kw mw donut bars", h: "On a wide desktop screen the charts beside the list follow the Browse filter. Tap a bar to apply it as the next filter step (asset type, code or area) or to open an item (top power users). Installed power leaves decommissioned equipment out." },
    { t: "P&IDs and PFD sheets", k: "pid drawing ribbon continuation tap back pfd viewer marked", h: "Open a drawing from any item (📐 open or the drawing number). On the sheet, every tag and drawing number shaded gold can be tapped: a drawing opens that sheet with the way back marked in red, a tag opens its Assets page, a bubble shared by several tags offers a choice. ← goes back to the last sheet at the same zoom." },
    { t: "Fluid filters", k: "fluid filter pfd ore flotation water reagent ctrl select pills", h: "Tap a fluid pill to see where it runs; everything else fades. Ctrl+click (⌘+click on a Mac) adds more. On the Layout the same pills are in Flow filters." },
    { t: "Narrative mode", k: "narrative story flows steps prev next play", h: "Narrative mode swaps the fluid pills for the five process stories (ore main line, grinding recycle, flotation, concentrate & gold, carbon). Pick one and step through it with the cards at the top or ◀ ▶. Utilities show only where they join the story's equipment." },
    { t: "Select and zoom on the PFD", k: "pfd select zoom pan click esc clear loops interlocks services", h: "Scroll to zoom, drag to pan. Click anything (equipment, stream, loop, interlock, symbol) to select it: everything else fades and the view zooms to fit. Ctrl+click adds or removes items. Click empty space or press Esc to clear. Control loops shows ISA tag bubbles with dashed signal lines; Interlocks shows red cause → effect lines (I interlock, P permissive). Design values are from the Stage 2 PDC and control philosophies, not live plant data." },
    { t: "Layout zoom", k: "layout map zoom wbs areas stack callout boxes", h: "Zoomed out: WBS area zones. At the plant view: every name lined up in columns left and right with a leader to its dot. Zoomed in: name boxes on the equipment. Tap a zone to fly in." },
    { t: "Move a Layout box", k: "layout drag move position hold export moves", h: "Press and hold a box for half a second until it lifts, then drag it. A shorter tap only selects it. Moves are kept on this device; Map options → ⬇ Moves downloads them to send in." },
    { t: "Layout menus", k: "wbs filters flow filters map options satellite dim minor equipment old new layout drawing", h: "Top left of the map: ⌂ Plant, WBS filters (fly to an area), Flow filters (fluids and narrative), Map options (imagery, dim, flow lines, minor equipment, moves, the old and new layout drawings)." },
    { t: "Quiz", k: "quiz flashcards cards swipe revisit deck", h: "Tap or swipe left to see the answer, then again for the next card; swipe right goes back. ↻ Revisit keeps a card for later. ⚙ on the card sets the filters; ✕ ends the deck." },
    { t: "Offline use", k: "offline download cache no signal documents", h: "The app, lists and search always work offline. Documents are kept once opened; File → Settings → Offline downloads fetches them all ahead of time." }
  ];
  const FEATURES = () => [
    { t: "Settings", k: "settings preferences app size text zoom ai key full screen", run: () => O.onSettings && O.onSettings() },
    { t: "Theme: dark", k: "theme dark mode colours colors", run: () => theme("dark") },
    { t: "Theme: light", k: "theme light mode colours colors", run: () => theme("light") },
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
    `<hr>` + item("checks", "🐞 Checks") + item("sources", "📄 Sources");
  const helpItems = () => `<div class="mn-s"><input type="search" placeholder="Search the app: settings, features, how to…" aria-label="Search the app"><div class="mn-r"></div></div>` +
    item("howto", "How to use…") + item("gloss", "📖 Glossary", "Plant terms and abbreviations") + `<hr><button type="button" class="mn-i" data-a="update">⟳ Update app<small class="mn-ver">Checking the version…</small></button>` + item("about", "About this app");
  function drawMenus(){
    if (!el) return;
    const f = el.querySelector(".mn-f .mn-d"); if (f) f.innerHTML = fileItems();
    const h = el.querySelector(".mn-h2 .mn-d"); if (h) h.innerHTML = helpItems();
    const one = el.querySelector(".mn-one .mn-d"); if (one) one.innerHTML = `<div class="mn-h">File</div>` + fileItems() + `<hr><div class="mn-h">Help</div>` + helpItems();
    wire();
  }
  function wire(){
    el.querySelectorAll("[data-th]").forEach(b => b.onclick = () => theme(b.dataset.th));
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
      <section id="hwAbout" data-k="about version data sources"><h4>About this app</h4><p>A study companion for the KCGM Fimiston plant: the plant lists (equipment, instruments, valves, lines, specials, hoses), the P&amp;IDs and PFD sheets, the pipe and valve spec and the Stage 2 PDC, with a smart PFD, the layout on the real plant, asset charts and a quiz. Everything is read from the project documents listed under File → Sources: design values, not live plant data. It works offline once opened.</p><p class="hw-ver"></p></section></div></div>`;
    w.hidden = false;
    w.querySelector(".hw-x").onclick = () => w.hidden = true;
    const inp = w.querySelector("input"), secs = [...w.querySelectorAll("section")];
    inp.oninput = () => { const t = inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean); secs.forEach(s => s.hidden = t.length > 0 && !t.every(x => s.dataset.k.includes(x))); };
    if (window.AppUpdate) AppUpdate.latest().then(v => { const p = w.querySelector(".hw-ver"); if (p && v) p.textContent = "Version " + v + "."; });
    const at = topic === "about" ? w.querySelector("#hwAbout") : topic ? secs.find(s => s.querySelector("h4").textContent === topic) : null;
    if (at){ at.scrollIntoView({ block: "start" }); at.classList.add("hl"); } else if (desk()) inp.focus();
  }

  function mount(o = {}){
    O = o;
    el = document.createElement("div"); el.className = "tbw";
    const tabs = TABS.map(([id, ic, n, href]) => `<a class="tb-t" data-t="${id}" href="${href}"><span class="tb-i">${ic}</span><span>${n}</span></a>`).join("");
    el.innerHTML = (desk() ? `<nav class="mb" aria-label="Menu"><div class="mn mn-f"><button type="button" class="mn-b">File</button><div class="mn-d"></div></div><div class="mn mn-h2"><button type="button" class="mn-b">Help</button><div class="mn-d mn-dh"></div></div></nav>` : "") +
      `<nav class="tb" aria-label="App sections">${tabs}${desk() ? "" : `<div class="mn mn-one"><button type="button" class="tb-s mn-b" aria-label="Menu" title="Menu">☰</button><div class="mn-d mn-dr"></div></div>`}</nav>`;
    document.body.prepend(el); document.documentElement.classList.add("has-tb"); document.documentElement.classList.toggle("has-mb", desk());
    el.querySelectorAll(".tb-t").forEach(a => a.onclick = e => { if (o.onTab && o.onTab(a.dataset.t)){ e.preventDefault(); set(a.dataset.t); } });
    el.querySelectorAll(".mn").forEach(m => { const b = m.querySelector(".mn-b");
      b.onclick = e => { e.stopPropagation(); openM === m ? close() : open(m); };
      b.onmouseenter = () => { if (openM && openM !== m && desk()) open(m); };   // menu bar: moving across opens the next one
      m.querySelector(".mn-d").addEventListener("click", e => e.stopPropagation()); });
    document.addEventListener("click", close); addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    drawMenus(); set(o.active);
  }
  const css = `:root{--tb:calc(44px + env(safe-area-inset-top))}:root.has-mb{--tb:calc(75px + env(safe-area-inset-top))}
.tbw{position:fixed;left:0;right:0;top:0;z-index:60;background:var(--panel,var(--card));border-bottom:1px solid var(--line);padding-top:env(safe-area-inset-top)}
.mb{height:30px;display:flex;align-items:stretch;gap:2px;padding:0 max(6px,env(safe-area-inset-right)) 0 max(6px,env(safe-area-inset-left));border-bottom:1px solid var(--line);font-size:13px}
.tb{height:44px;padding:0 max(6px,env(safe-area-inset-right)) 0 max(6px,env(safe-area-inset-left));display:flex;align-items:stretch;gap:2px}
.tb-t{flex:0 1 auto;min-width:0;padding:0 12px;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--mute);text-decoration:none;font-weight:700;font-size:14px;
  border-bottom:3px solid transparent;padding-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tb-t.on{color:var(--ink);border-bottom-color:var(--gold,var(--accent))}
.tb-i{font-size:15px}
.mn{position:relative;display:flex}
.mb .mn-b{border:0;background:none;color:var(--ink);font:inherit;font-size:13px;padding:0 10px;border-radius:5px;margin:3px 0;cursor:pointer}
.mb .mn-b:hover,.mn.open>.mn-b{background:var(--panel2,var(--card2))}
.mn-one{margin-left:auto}.tb-s{flex:none;width:42px;border:0;background:none;color:var(--mute);font-size:21px;cursor:pointer}
.mn-d{display:none;position:absolute;left:0;top:100%;min-width:250px;max-width:min(360px,calc(100vw - 16px));background:var(--panel,var(--card));border:1px solid var(--line);border-radius:10px;
  box-shadow:0 10px 30px #0008;padding:5px;z-index:70;max-height:calc(100vh - 90px);overflow-y:auto}
.mn.open>.mn-d{display:block}.mn-dr{left:auto;right:0}.mn-dh{min-width:330px}
.mn-i{display:block;width:100%;text-align:left;border:0;background:none;color:var(--ink);font:inherit;font-size:13.5px;padding:7px 10px;border-radius:6px;cursor:pointer}
.mn-i:hover,.mn-i:focus-visible{background:var(--panel2,var(--card2))}.mn-i:disabled{opacity:.6}
.mn-i small{display:block;color:var(--mute);font-size:11.5px;margin-top:1px}
.mn-d hr{border:0;border-top:1px solid var(--line);margin:5px 4px}
.mn-h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);padding:6px 10px 2px}
.mn-th{display:flex;align-items:center;padding:5px 10px}.mn-th span{flex:1;font-size:13.5px}
.mn-th button{border:1px solid var(--line);background:none;color:var(--mute);font:inherit;font-size:12px;font-weight:700;padding:3px 9px;cursor:pointer}
.mn-th button:first-of-type{border-radius:7px 0 0 7px}.mn-th button:last-of-type{border-radius:0 7px 7px 0}.mn-th button+button{border-left:0}
.mn-th button.on{background:var(--gold,var(--accent));color:#111;border-color:var(--gold,var(--accent))}
.mn-s{padding:5px 5px 3px}.mn-s input{width:100%;box-sizing:border-box;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:7px 9px;font:inherit;font-size:13px}
.mn-r:not(:empty){margin-top:4px;border-bottom:1px solid var(--line);padding-bottom:4px}.mn-no{color:var(--mute);font-size:12.5px;padding:6px 10px}
.hw{position:fixed;inset:0;z-index:300;background:#0008;display:flex;align-items:flex-start;justify-content:center;padding:60px 12px 12px}.hw[hidden]{display:none}
.hw-b{background:var(--panel,var(--card));color:var(--ink);border:1px solid var(--line);border-radius:14px;width:min(640px,100%);max-height:calc(100vh - 80px);display:flex;flex-direction:column;box-shadow:0 20px 50px #000a}
.hw-top{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line)}.hw-top b{font-size:16px}
.hw-top input{flex:1;min-width:0;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:7px 9px;font:inherit;font-size:13.5px}
.hw-x{border:0;background:none;color:var(--mute);font-size:18px;cursor:pointer}
.hw-l{overflow-y:auto;padding:6px 16px 16px}.hw-l section{padding:8px 0;border-bottom:1px solid var(--line)}.hw-l section[hidden]{display:none}.hw-l section.hl h4{color:var(--gold,var(--accent))}
.hw-l h4{margin:4px 0;font-size:14px}.hw-l p{margin:4px 0;font-size:13.5px;line-height:1.5;color:var(--ink)}.hw-ver{color:var(--mute) !important}
/* scroll bars across the app: barely there until you hover the area, clearer on the bar itself, gold while dragging */
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background-color:transparent;border:3px solid transparent;background-clip:padding-box;border-radius:6px;transition:background-color .2s}
:hover::-webkit-scrollbar-thumb{background-color:color-mix(in srgb,var(--mute) 30%,transparent)}
::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--mute) 75%,transparent);border-width:2px}
::-webkit-scrollbar-thumb:active{background-color:var(--gold,var(--accent));border-width:2px}
@supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:transparent transparent}*:hover{scrollbar-color:color-mix(in srgb,var(--mute) 45%,transparent) transparent}}
@media (max-width:380px){.tb-t{flex-direction:column;gap:0;font-size:11.5px;padding:4px 9px 0;line-height:1.1}.tb-i{font-size:14px}.tb-s{width:34px}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, set, help };
})();
