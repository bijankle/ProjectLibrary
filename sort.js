// Click a table's column header to sort it: once A to Z (smallest first), twice Z to A, a third time back to the order
// it came in. Works on any <table> with a <thead>; a header marked .nosort (or a table marked .nosort) is left alone.
// A table that redraws can keep its sort: TSort.keep(table, key) puts the last sort for that key back on.
window.TSort = (() => {
  const ORD = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }), MEM = {};
  const val = td => { const t = (td ? td.textContent : "").trim(), n = t.replace(/,/g, ""); return t === "" ? null : /^-?\d+(\.\d+)?$/.test(n) ? +n : t; };
  const cmp = (a, b) => a === null ? (b === null ? 0 : 1) : b === null ? -1 : typeof a === "number" && typeof b === "number" ? a - b : ORD.compare(String(a), String(b));
  function apply(tb, col, dir){
    const body = tb.tBodies[0]; if (!body) return; const rows = [...body.rows];
    rows.forEach((r, i) => { if (r.dataset.o == null) r.dataset.o = i; });
    rows.sort(dir ? (x, y) => { const c = cmp(val(x.cells[col]), val(y.cells[col])); return (dir > 0 ? c : -c) || x.dataset.o - y.dataset.o; } : (x, y) => x.dataset.o - y.dataset.o);
    body.append(...rows);
    tb.tHead.querySelectorAll("th").forEach((th, i) => { th.classList.toggle("ts-up", i === col && dir > 0); th.classList.toggle("ts-dn", i === col && dir < 0); });
    tb.dataset.tsc = col; tb.dataset.tsd = dir; if (tb.dataset.tsk) MEM[tb.dataset.tsk] = [col, dir]; }
  document.addEventListener("click", e => { const th = e.target.closest("thead th"); if (!th || th.classList.contains("nosort") || e.target.closest("a,button,input,select")) return;
    const tb = th.closest("table"); if (!tb || tb.classList.contains("nosort") || tb.dataset.tsOwn) return;
    const col = th.cellIndex, was = +tb.dataset.tsc === col ? +tb.dataset.tsd || 0 : 0;
    apply(tb, col, was === 0 ? 1 : was > 0 ? -1 : 0); });
  const css = document.createElement("style");
  css.textContent = `thead th:not(.nosort){cursor:pointer;user-select:none}table.nosort thead th{cursor:auto}thead th.ts-up::after,thead th.ts-dn::after{content:"";display:inline-block;margin-left:5px;border:4px solid transparent;vertical-align:1px}thead th.ts-up::after{border-bottom:5px solid currentColor;border-top:0}thead th.ts-dn::after{border-top:5px solid currentColor;border-bottom:0}`;
  document.head.append(css);
  return { apply, keep(tb, key){ tb.dataset.tsk = key; const m = MEM[key]; if (m && m[1]) apply(tb, m[0], m[1]); } };
})();
