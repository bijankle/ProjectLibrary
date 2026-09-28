// Text size setting (Settings on the phone and in the Smart PFD). One value for the whole app, kept on the device:
// the reading areas (pages, record details, the info panel, the sidebar, flashcards) are scaled with CSS zoom; the tab
// strip and the map / diagram themselves are left alone so taps and positions stay exact. TextSize.mount(el) draws
// the slider; TextSize.z() is the current factor (for code that sizes things in pixels).
window.TextSize = (() => {
  const KEY = "kcgm_text_size", MIN = .8, MAX = 1.5;
  const get = () => { try { const v = parseFloat(localStorage.getItem(KEY)); return v >= MIN && v <= MAX ? v : 1; } catch (e) { return 1; } };
  const apply = v => { document.documentElement.style.setProperty("--fs", v); document.documentElement.classList.toggle("fs-on", v !== 1); dispatchEvent(new Event("resize")); };
  const css = `.fs-on .page,.fs-on #deck .side>*,.fs-on #info>*,.fs-on #side>*{zoom:var(--fs)}
.ts{display:flex;align-items:center;gap:10px;margin:6px 0 4px}
.ts input{flex:1;accent-color:var(--gold,var(--accent));height:28px}
.ts b{min-width:46px;text-align:right;font-variant-numeric:tabular-nums}
.ts span{font-size:13px;color:var(--mute)}.ts span.big{font-size:19px}
.ts-r{border:1px solid var(--line);background:none;color:var(--mute);border-radius:8px;padding:4px 9px;font:inherit;font-size:12px;cursor:pointer}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  apply(get());
  addEventListener("storage", e => { if (e.key === KEY) apply(get()); });   // changed in the other page
  function mount(el){
    const v = get();
    el.innerHTML = `<div class="ts"><span>A</span><input type="range" min="${MIN * 100}" max="${MAX * 100}" step="5" value="${Math.round(v * 100)}" aria-label="Text size"><span class="big">A</span><b>${Math.round(v * 100)}%</b><button class="ts-r" type="button">Reset</button></div>`;
    const r = el.querySelector("input"), b = el.querySelector("b");
    const set = p => { const x = p / 100; b.textContent = p + "%"; try { localStorage.setItem(KEY, String(x)); } catch (e) {} apply(x); };
    r.oninput = () => set(+r.value);
    el.querySelector(".ts-r").onclick = () => { r.value = 100; set(100); };
  }
  return { mount, z: () => get() };
})();
