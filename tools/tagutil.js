// Shared tag expansion used by pfd.html and the build: "FCV13075A/B" -> FCV13075A, FCV13075B;
// "XV13094 to XV13108" -> XV13094..XV13108; "F16-BW-401 to 405" -> F16-BW-401..405. Strips " (d)" and notes in brackets.
function expandTag(t){
  t = String(t || "").replace(/\s*\(.*?\)\s*/g, "").trim();
  if (!t || /not specified/i.test(t)) return [];
  if (t.includes(",")){
    const parts = t.split(",").map(x => x.trim()).filter(Boolean), pre = (parts[0].match(/^(.*?)\d+[A-Z]?(\/|\s|$)/) || [, ""])[1];
    return parts.flatMap((p, i) => expandTag(i && /^\d/.test(p) ? pre + p : p));
  }
  const m = t.match(/^(.*?)(\d+)([A-Z]?)\s+to\s+(?:([A-Z][A-Z0-9\-]*?))?(\d+)([A-Z]?)$/);
  if (m){
    const pre = m[1], a = m[2], b = m[5];
    const aN = +a, bN = +(a.slice(0, a.length - b.length) + b);
    if (bN > aN && bN - aN <= 40) { const r = []; for (let i = aN; i <= bN; i++) r.push(pre + String(i).padStart(a.length, "0")); return r; }
  }
  if (t.includes("/")){
    const parts = t.split("/"), first = parts[0].trim(), r = [first];
    parts.slice(1).forEach(p => { p = p.trim(); if (!p) return; r.push(p.length >= first.length ? p : first.slice(0, first.length - p.length) + p); });
    return r;
  }
  return [t];
}
if (typeof module !== "undefined") module.exports = { expandTag };
