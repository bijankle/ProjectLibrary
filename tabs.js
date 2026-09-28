// The tab strip across the top of every screen: Assets (Browse and search), Quiz (flashcards), PFD and Layout, plus ⚙ Settings.
// Assets and Quiz live in index.html, PFD and Layout in pfd.html; a tab on the other page is a link, a tab on this page is
// handled in place by onTab(id) (return true when handled). The strip's height is --tb, which both pages offset their
// fixed layout by. Tabs.mount({ active, onTab, onSettings }), Tabs.set(id) marks a tab.
window.Tabs = (() => {
  const TABS = [["assets", "🔎", "Assets", "index.html?cards#assets"], ["quiz", "🃏", "Quiz", "index.html?cards#quiz"],
    ["pfd", "〰️", "PFD", "pfd.html#pfd"], ["layout", "🗺️", "Layout", "pfd.html#layout"]];
  let el = null;
  const set = id => el && el.querySelectorAll(".tb-t").forEach(a => { const on = a.dataset.t === id; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  function mount(o = {}){
    el = document.createElement("nav"); el.className = "tb"; el.setAttribute("aria-label", "App sections");
    el.innerHTML = TABS.map(([id, ic, n, href]) => `<a class="tb-t" data-t="${id}" href="${href}"><span class="tb-i">${ic}</span><span>${n}</span></a>`).join("") +
      `<button class="tb-s" type="button" aria-label="Settings" title="Settings">⚙</button>`;
    document.body.prepend(el); document.documentElement.classList.add("has-tb");
    el.querySelectorAll(".tb-t").forEach(a => a.onclick = e => { if (o.onTab && o.onTab(a.dataset.t)){ e.preventDefault(); set(a.dataset.t); } });
    el.querySelector(".tb-s").onclick = () => o.onSettings && o.onSettings();
    set(o.active);
  }
  const css = `:root{--tb:calc(44px + env(safe-area-inset-top))}
.tb{position:fixed;left:0;right:0;top:0;height:var(--tb);padding:env(safe-area-inset-top) max(6px,env(safe-area-inset-right)) 0 max(6px,env(safe-area-inset-left));
  display:flex;align-items:stretch;gap:2px;background:var(--panel,var(--card));border-bottom:1px solid var(--line);z-index:60}
.tb-t{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--mute);text-decoration:none;font-weight:700;font-size:14px;
  border-bottom:3px solid transparent;padding-top:3px;white-space:nowrap}
.tb-t.on{color:var(--ink);border-bottom-color:var(--gold,var(--accent))}
.tb-i{font-size:15px}
.tb-s{flex:none;width:42px;border:0;background:none;color:var(--mute);font-size:19px;cursor:pointer}
.tb-t{overflow:hidden;text-overflow:ellipsis}
/* scroll bars across the app: barely there until you hover the area, clearer on the bar itself, gold while dragging */
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background-color:transparent;border:3px solid transparent;background-clip:padding-box;border-radius:6px;transition:background-color .2s}
:hover::-webkit-scrollbar-thumb{background-color:color-mix(in srgb,var(--mute) 30%,transparent)}
::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--mute) 75%,transparent);border-width:2px}
::-webkit-scrollbar-thumb:active{background-color:var(--gold,var(--accent));border-width:2px}
@supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:transparent transparent}*:hover{scrollbar-color:color-mix(in srgb,var(--mute) 45%,transparent) transparent}}
@media (max-width:380px){.tb-t{flex-direction:column;gap:0;font-size:11.5px;padding-top:4px;line-height:1.1}.tb-i{font-size:14px}.tb-s{width:34px}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  return { mount, set };
})();
