// SharePoint links for documents the app mentions but doesn't hold (sp.json, tools/build_sp.py, from the project
// document register). SP.linkText(text) escapes text and turns those document numbers into links that open SharePoint
// in a new tab, blue and underlined with a ↗ (documents in the app keep opening in the app, also blue, no ↗).
window.SP = (() => {
  const nk = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // document numbers: 2000-… project and vendor numbers, legacy site drawings (15\E\1103), other dashed numbers
  const DOC = /(?<![A-Z0-9])(?:2000(?:-[A-Z0-9.]{2,10}){3,4}|\d{2,3}[\\/-][A-Z][\\/-]\d{4}(?:-\d{3})?|[A-Z0-9]{2,6}(?:-[A-Z0-9]{2,6}){2,5})(?![A-Z0-9])/g;
  let N = new Map(), p = null;
  const load = () => p || (p = fetch("sp.json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(d => {
    N = new Map(Object.entries(d).map(([k, v]) => [nk(k), v])); try { dispatchEvent(new Event("kcgm-sp")); } catch (e) {} return d; }));
  const url = n => N.get(nk(n)) || "";
  const enc = u => { try { return encodeURI(decodeURI(u)); } catch (e) { return encodeURI(u); } };
  const a = (n, text) => { const u = url(n); return u ? `<a class="sp-a" href="${esc(enc(u))}" target="_blank" rel="noopener" title="Open in SharePoint">${text == null ? esc(n) : text}</a>` : (text == null ? esc(n) : text); };
  const linkText = t => esc(t).replace(DOC, m => url(m) ? a(m) : m);
  const css = document.createElement("style");
  css.textContent = `:root{--doc-a:#0b63c5}html[data-theme="dark"]{--doc-a:#79b4ff}
a.sp-a,a.sp-a:visited,.lk a.lk-a[data-dwg],a.lk-doc{color:var(--doc-a)!important;text-decoration:underline!important;text-underline-offset:2px}
a.sp-a::after{content:"\\2197";display:inline-block;font-size:.8em;margin-left:2px;text-decoration:none;vertical-align:1px}`;
  document.head.append(css);
  load();
  return { load, url: n => { const u = url(n); return u ? enc(u) : ""; }, a, linkText, DOC };
})();
