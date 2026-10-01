// App size setting (Settings on the phone and in the Smart PFD): the whole app bigger or smaller, like Ctrl + scroll in
// a browser. One value, kept on the device. On a phone it sets the page's viewport width (the browser's own zoom, so
// taps, the map and the PFD stay exact). TextSize.mount(el) draws the
// slider. On a computer the browser's own zoom (Ctrl + scroll, Ctrl +/−) does this, so the setting points there.
// TextSize.z() is the CSS zoom factor in use (always 1: the page itself is never CSS zoomed).
window.TextSize = (() => {
  // the slider shows the size against BASE (1.6 of the phone's own width = 100%), from 60 to 140%
  const KEY = "kcgm_text_size", BASE = 1.6, MIN = 60, MAX = 140;
  const phone = matchMedia("(pointer: coarse)").matches;
  const get = () => { try { const v = parseFloat(localStorage.getItem(KEY)); return v >= .7 && v <= 2.4 ? v : BASE; } catch (e) { return BASE; } };
  // the page itself sets the size before it first draws (kcgmViewport in the page head); this re-applies on a change
  function apply(v){
    if (phone && window.kcgmViewport) kcgmViewport(v);
    setTimeout(() => dispatchEvent(new Event("resize")), 60);
  }
  const css = `.ts{display:flex;align-items:center;gap:10px;margin:6px 0 4px}
.ts input{flex:1;min-width:0;accent-color:var(--gold,var(--accent));height:28px}
.ts b{min-width:46px;text-align:right;font-variant-numeric:tabular-nums}
.ts span{font-size:13px;color:var(--mute)}.ts span.big{font-size:19px}
.ts-th{gap:0;border:1.5px solid var(--line);border-radius:10px;overflow:hidden;width:max-content;max-width:100%}.ts-th button{border:0;background:none;color:var(--mute);font:inherit;font-weight:700;font-size:var(--fb,15px);padding:7px 16px;cursor:pointer;min-width:0}
.ts-th button+button{border-left:1.5px solid var(--line)}
:root.phone .ts-th{width:100%}:root.phone .ts-th button{flex:1 1 auto;padding:11px 6px;font-weight:800}
:root.phone #tsRoot .ts{flex-wrap:wrap;row-gap:8px}:root.phone #tsRoot .ts input{flex:1 1 calc(100% - 64px)}:root.phone #tsRoot .ts b{margin-left:auto}   /* the slider on its own line */
.ts-th button.on{background:var(--gold,var(--accent));color:#111}
.ts-tx{width:100%}.ts-tx button{flex:1;padding:7px 4px}.ts-p{font-size:var(--fb,15px);color:var(--mute);margin-top:6px}
.ts-r{border:1.5px solid var(--line);background:none;color:var(--ink);font-weight:700;border-radius:10px;padding:6px 12px;flex:none;font:inherit;font-size:var(--fb,15px);cursor:pointer}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  addEventListener("storage", e => { if (e.key === KEY) apply(get()); });   // changed in the other page
  if (screen.orientation) screen.orientation.addEventListener("change", () => apply(get()));
  function mount(el){
    if (!phone){ el.innerHTML = `<div class="ts"><span>On a computer use the browser's zoom: Ctrl + scroll, or Ctrl + and Ctrl − (⌘ on a Mac). The setting here is for the phone app.</span></div>`; return; }
    const v = Math.round(get() / BASE * 20) * 5;
    el.innerHTML = `<div class="ts"><span>A</span><input type="range" min="${MIN}" max="${MAX}" step="5" value="${v}" aria-label="App size"><span class="big">A</span><b>${v}%</b><button class="ts-r" type="button">Reset</button></div>`;
    const r = el.querySelector("input"), b = el.querySelector("b");
    const set = p => { const x = p / 100 * BASE; b.textContent = p + "%"; try { localStorage.setItem(KEY, String(x)); } catch (e) {} apply(x); };
    r.onchange = () => set(+r.value);   // applied when the finger lifts (the slider itself resizes as the app does)
    r.oninput = () => { b.textContent = r.value + "%"; };
    el.querySelector(".ts-r").onclick = () => { r.value = 100; set(100); };
  }
  // Theme: one choice for every page (kept as kcgm_theme, applied by kcgmTheme in each page's head)
  function theme(el){
    const cur = () => { try { return localStorage.getItem("kcgm_theme") || "device"; } catch (e) { return "device"; } };
    const draw = () => { el.innerHTML = `<div class="ts ts-th">${[["dark", "Dark"], ["light", "Light"], ["device", "Device"]].map(([k, t]) => `<button type="button" data-t="${k}" class="${cur() === k ? "on" : ""}">${t}</button>`).join("")}</div>`;
      el.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { try { localStorage.setItem("kcgm_theme", b.dataset.t); } catch (e) {} if (window.kcgmTheme) kcgmTheme(b.dataset.t); draw(); }); };
    draw();
  }
  // Text size: five steps of the app's text (kept as kcgm_text, applied by kcgmText in each page's head)
  function text(el){
    const L = [["xs", "XS", "Extra small"], ["s", "S", "Small"], ["n", "Normal", "Normal"], ["l", "L", "Large"], ["xl", "XL", "Extra large"]];
    const cur = () => { try { return localStorage.getItem("kcgm_text") || "n"; } catch (e) { return "n"; } };
    const draw = () => { const c = cur();
      el.innerHTML = `<div class="ts ts-th ts-tx">${L.map(([k, t, n]) => `<button type="button" data-x="${k}" class="${c === k ? "on" : ""}" title="${n}">${t}</button>`).join("")}</div><div class="ts-p">${(L.find(x => x[0] === c) || L[2])[2]}: this is how text reads.</div>`;
      el.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { try { localStorage.setItem("kcgm_text", b.dataset.x); } catch (e) {} if (window.kcgmText) kcgmText(b.dataset.x);
        dispatchEvent(new Event("resize")); draw(); }); };
    draw();
  }
  return { mount, theme, text, z: () => 1 };
})();
