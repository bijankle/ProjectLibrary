// Table viewer for the Source documents tab (issues.html#sources). Shows every table of a source document as it is in
// the original, all rows and all columns, with Excel style row numbers and column letters. Data comes from sources/,
// built by tools/build_sources.py; big sheets are split into chunks and only loaded as they are scrolled to or filtered.
// SourceView.open(key, title) opens a document; SourceView.index() resolves to sources/index.json.
window.SourceView = (() => {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const letter = i => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const mb = b => b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " kB";
  let IX = null, box = null, cur = null, busy = 0;
  const cache = new Map();
  const index = () => IX ? Promise.resolve(IX) : fetch("sources/index.json").then(r => r.json()).then(d => (IX = d));
  const chunk = (k, si, c) => { const key = `${k}/${si}-${c}`;
    if (!cache.has(key)) cache.set(key, fetch(`sources/${key}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(e => { cache.delete(key); throw e; }));
    return cache.get(key); };

  function build(){
    box = document.createElement("div");
    box.className = "sv"; box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.innerHTML = `<div class="sv-top"><div class="sv-t"><b id="svTitle"></b><small id="svHow"></small></div>
        <a class="btn primary" id="svDl" download>⬇ Excel</a><button class="btn" id="svX" aria-label="Close">✕</button></div>
      <div class="sv-bar"><select id="svSheet" aria-label="Table"></select>
        <input id="svQ" type="search" placeholder="Filter rows (all words must match)" autocomplete="off" data-lpignore="true" data-1p-ignore="true">
        <span class="count" id="svN"></span></div>
      <div class="sv-wrap" id="svWrap"><table class="sv-tb"><thead id="svHead"></thead><tbody id="svBody"></tbody></table><div class="more" id="svMore"></div></div>`;
    document.body.appendChild(box);
    const g = id => box.querySelector("#" + id);
    g("svX").onclick = () => history.state && history.state.sv ? history.back() : close();
    g("svSheet").onchange = () => sheet(+g("svSheet").value);
    let t; g("svQ").oninput = () => { clearTimeout(t); t = setTimeout(() => { cur.q = g("svQ").value; cur.shown = 300; render(); }, 250); };
    g("svBody").onclick = e => { const td = e.target.closest("td"); if (td && !td.classList.contains("rn")) td.classList.toggle("open"); };
    addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) g("svX").click(); });
    addEventListener("popstate", () => { if (!box.hidden) close(); });
  }
  const $ = id => box.querySelector("#" + id);

  async function open(k, title){
    if (!box) build();
    const ix = await index(), d = ix[k];
    if (!d) return;
    cur = { k, d, si: 0, rows: [], q: "", shown: 300 };
    $("svTitle").textContent = title; $("svHow").textContent = d.how;
    $("svDl").href = d.xlsx; $("svDl").download = d.fname; $("svDl").title = `${d.fname} (${mb(d.size)})`;
    $("svDl").textContent = `⬇ Excel (${mb(d.size)})`;
    $("svSheet").innerHTML = d.sheets.map((s, i) => `<option value="${i}">${esc(s.name)}${s.caption ? " · " + esc(s.caption.slice(0, 40)) : ""} (${s.n.toLocaleString()} × ${s.c})${s.hidden ? " · hidden in original" : ""}</option>`).join("");
    $("svQ").value = "";
    box.hidden = false; document.body.style.overflow = "hidden";
    history.pushState({ sv: 1 }, "");
    sheet(0);
  }
  function close(){ box.hidden = true; document.body.style.overflow = ""; }

  async function sheet(si){
    cur.si = si; cur.rows = []; cur.shown = 300; $("svSheet").value = si; $("svWrap").scrollTo(0, 0);
    await need(1); render();
  }
  // make sure the first n chunks of the current sheet are loaded
  async function need(n){
    const s = cur.d.sheets[cur.si], my = cur;
    n = Math.min(n, s.chunks);
    if (cur.rows.length >= n) return;
    busy++; $("svN").textContent = `Loading ${cur.rows.length + 1} of ${s.chunks}…`;
    try { for (let c = cur.rows.length; c < n; c++){ const r = await chunk(cur.k, cur.si, c); if (my !== cur || my.si !== cur.si) return; cur.rows[c] = r; $("svN").textContent = `Loading ${c + 2 > s.chunks ? s.chunks : c + 2} of ${s.chunks}…`; } }
    catch (e) { $("svN").textContent = "Couldn't load this table (" + e.message + "). Check the connection."; throw e; }
    finally { busy--; }
  }
  async function render(){
    const s = cur.d.sheets[cur.si], words = cur.q.toLowerCase().split(/\s+/).filter(Boolean), hdr = s.hdr || 0;
    if (words.length) await need(s.chunks);   // filtering searches the whole sheet
    else await need(Math.ceil(cur.shown / cur.d.chunk));
    const all = cur.rows.flat(), head = all.slice(0, hdr + 1);
    let idx = [];
    if (words.length){ for (let i = hdr + 1; i < all.length; i++){ const t = all[i].join(" ").toLowerCase(); if (words.every(w => t.includes(w))) idx.push(i); } }
    else idx = Array.from({ length: Math.max(0, Math.min(all.length, cur.shown) - hdr - 1) }, (_, i) => i + hdr + 1);
    const total = words.length ? idx.length : s.n - hdr - 1, show = idx.slice(0, words.length ? cur.shown : idx.length);
    $("svN").textContent = words.length ? `${idx.length.toLocaleString()} matching rows of ${(s.n - hdr - 1).toLocaleString()}` : `${s.n.toLocaleString()} rows × ${s.c} columns`;
    $("svHead").innerHTML = `<tr><th class="rn"></th>${Array.from({ length: s.c }, (_, i) => `<th>${letter(i)}</th>`).join("")}</tr>`;
    const row = (r, i, cls) => `<tr${cls ? ` class="${cls}"` : ""}><td class="rn">${i + 1}</td>${Array.from({ length: s.c }, (_, c) => { const v = r[c]; return v === "" || v == null ? "<td></td>" : `<td${typeof v === "number" ? ' class="n"' : ""} title="${esc(v)}">${esc(v)}</td>`; }).join("")}</tr>`;
    $("svBody").innerHTML = head.map((r, i) => row(r, i, i === hdr ? "hd" : "pre")).join("") + show.map(i => row(all[i], i)).join("");
    const left = total - show.length;
    $("svMore").innerHTML = left > 0 ? `<button class="btn" id="svMoreB">Show ${Math.min(1000, left).toLocaleString()} more rows (${left.toLocaleString()} left)</button>` : "";
    if (left > 0) $("svMoreB").onclick = () => { cur.shown += 1000; render(); };
  }
  return { open, index };
})();
