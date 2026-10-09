// Resolved checks, shared by everyone: resolved.json in the app's GitHub repository holds { id: {by, at, note, auto?} }.
// Checks tab ticks write it (with the GitHub key, as uploads do); item pages read it to show an unresolved clash in red
// (Clash and Check types; the field each category is about). A tick shows at once here and is kept on this device
// until GitHub Pages serves the new file. Check ids: FNV-1a 32 bit of "cat|item|d1|d2" (tools/checks_auto.py too).
window.CK = (() => {
  const REPO = "bijankle/ProjectLibrary", RED = new Set(["Clash", "Check"]);
  const FIELD = { Valve: "P&ID", Line: "Line number", Stage: "Stage" };   // which value a category's clash is about
  const norm = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const id = r => { let h = 0x811c9dc5; const s = `${r.cat}|${r.item}|${r.d1 || ""}|${r.d2 || ""}`;
    for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
  const tagOf = r => { const m = String(r.item).match(/^\s*([A-Z]\d{2,3}[A-Z]{2,4}\d{3,4}[A-Z]?-[A-Z]{2,4}\d{0,2}|[A-Z]\d{2,3}-[A-Z]{2,4}-\d{2,4}[A-Z]?|[A-Z]+\s*\d+[A-Z]?)/); return m ? norm(m[1]) : ""; };
  let rows = [], RES = {}, ready = null, byTag = new Map();
  const LOCAL = "kcgm_resolved_local";   // ticks made here that Pages may not serve yet: { id: entry | null }
  const local = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || "{}"); } catch (e) { return {}; } };
  const merged = () => { const L = local(), out = Object.assign({}, RES); Object.entries(L).forEach(([k, v]) => { if (v) out[k] = v; else delete out[k]; }); return out; };
  function load(){ return ready || (ready = Promise.all([
      fetch("issues.json").then(r => r.json()).then(d => rows = d.rows || []).catch(() => rows = []),
      fetch("resolved.json?" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : {}).then(d => RES = d || {}).catch(() => RES = {})
    ]).then(() => { byTag = new Map(); rows.forEach(r => { const t = tagOf(r); if (t){ if (!byTag.has(t)) byTag.set(t, []); byTag.get(t).push(r); } });
      // a local tick Pages now agrees with is dropped
      const L = local(); let ch = 0; Object.keys(L).forEach(k => { if ((L[k] && RES[k] && RES[k].at === L[k].at) || (!L[k] && !RES[k])){ delete L[k]; ch = 1; } });
      if (ch) try { localStorage.setItem(LOCAL, JSON.stringify(L)); } catch (e) {}
      dispatchEvent(new Event("kcgm-checks")); })); }
  const isRes = k => !!merged()[k];
  const info = k => merged()[k] || null;
  // an item's open clashes: [{ field, row, id }]; and its resolved ones, for the record
  const open = key => (byTag.get(norm(key)) || []).filter(r => RED.has(r.sev) && !isRes(id(r))).map(r => ({ field: r.field || FIELD[r.cat] || null, row: r, id: id(r) }));
  const done = key => (byTag.get(norm(key)) || []).filter(r => isRes(id(r))).map(r => ({ row: r, id: id(r), res: info(id(r)) }));
  const ghKey = () => { try { return localStorage.getItem("kcgm_ghkey") || ""; } catch (e) { return ""; } };
  let who = null;
  async function me(){ if (who) return who; try { const r = await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + ghKey() } }); if (r.ok){ const j = await r.json(); who = j.name || j.login; } } catch (e) {} return who || "Someone"; }
  // tick (entry) or untick (null): read the file's current state from GitHub, change one entry, write it back
  async function set(k, on, note){
    if (!ghKey()) throw Object.assign(new Error("Resolving needs a GitHub key (Help → API keys)"), { key: true });
    const url = `https://api.github.com/repos/${REPO}/contents/resolved.json`, H = { Authorization: "Bearer " + ghKey(), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    const entry = on ? { by: await me(), at: new Date().toISOString(), note: (note || "").trim() } : null;
    for (let tries = 0; tries < 3; tries++){
      const g = await fetch(url + "?ref=main&t=" + Date.now(), { headers: H, cache: "no-store" });
      let cur = {}, sha;
      if (g.ok){ const j = await g.json(); sha = j.sha; try { cur = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\s/g, ""))))); } catch (e) { cur = {}; } }
      else if (g.status !== 404) throw new Error(g.status === 401 ? "The GitHub key was refused" : "GitHub answered " + g.status);
      if (entry) cur[k] = entry; else delete cur[k];
      const body = { message: `${on ? "Resolve" : "Reopen"} check ${k}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(cur, null, 1)))) }; if (sha) body.sha = sha;
      const p = await fetch(url, { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify(body) });
      if (p.ok){ RES = cur; const L = local(); L[k] = entry; try { localStorage.setItem(LOCAL, JSON.stringify(L)); } catch (e) {} dispatchEvent(new Event("kcgm-checks")); return entry; }
      if (p.status !== 409 && p.status !== 422) throw new Error(p.status === 403 ? "The key can't write to the repository" : "GitHub answered " + p.status);
    }
    throw new Error("Someone else saved at the same moment: try again");
  }
  return { load, id, isRes, info, open, done, set, ghKey, RED, FIELD };
})();
