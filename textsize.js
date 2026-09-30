// App size setting (Settings on the phone and in the Smart PFD): the whole app bigger or smaller, like Ctrl + scroll in
// a browser. One value, kept on the device. On a phone it sets the page's viewport width (the browser's own zoom, so
// taps, the map and the PFD stay exact). TextSize.mount(el) draws the
// slider. On a computer the browser's own zoom (Ctrl + scroll, Ctrl +/−) does this, so the setting points there.
// TextSize.z() is the CSS zoom factor in use (always 1: the page itself is never CSS zoomed).
window.TextSize = (() => {
  const KEY = "kcgm_text_size", MIN = .7, MAX = 1.6;
  const phone = matchMedia("(pointer: coarse)").matches;
  const get = () => { try { const v = parseFloat(localStorage.getItem(KEY)); return v >= MIN && v <= MAX ? v : 1; } catch (e) { return 1; } };
  // the page itself sets the size before it first draws (kcgmViewport in the page head); this re-applies on a change
  function apply(v){
    if (phone && window.kcgmViewport) kcgmViewport(v);
    setTimeout(() => dispatchEvent(new Event("resize")), 60);
  }
  const css = `.ts{display:flex;align-items:center;gap:10px;margin:6px 0 4px}
.ts input{flex:1;accent-color:var(--gold,var(--accent));height:28px}
.ts b{min-width:46px;text-align:right;font-variant-numeric:tabular-nums}
.ts span{font-size:13px;color:var(--mute)}.ts span.big{font-size:19px}
.ts-th{gap:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;width:max-content}.ts-th button{border:0;background:none;color:var(--mute);font:inherit;font-weight:700;font-size:var(--fb,15px);padding:7px 16px;cursor:pointer}
.ts-th button.on{background:var(--gold,var(--accent));color:#111}
.ts-r{border:1px solid var(--line);background:none;color:var(--mute);border-radius:8px;padding:4px 9px;font:inherit;font-size:var(--fb,15px);cursor:pointer}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  addEventListener("storage", e => { if (e.key === KEY) apply(get()); });   // changed in the other page
  if (screen.orientation) screen.orientation.addEventListener("change", () => apply(get()));
  function mount(el){
    if (!phone){ el.innerHTML = `<div class="ts"><span>On a computer use the browser's zoom: Ctrl + scroll, or Ctrl + and Ctrl − (⌘ on a Mac). The setting here is for the phone app.</span></div>`; return; }
    const v = get();
    el.innerHTML = `<div class="ts"><span>A</span><input type="range" min="${MIN * 100}" max="${MAX * 100}" step="5" value="${Math.round(v * 100)}" aria-label="App size"><span class="big">A</span><b>${Math.round(v * 100)}%</b><button class="ts-r" type="button">Reset</button></div>`;
    const r = el.querySelector("input"), b = el.querySelector("b");
    const set = p => { const x = p / 100; b.textContent = p + "%"; try { localStorage.setItem(KEY, String(x)); } catch (e) {} apply(x); };
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
  return { mount, theme, z: () => 1 };
})();
