// Follow up Q&A using the Google Gemini API (free tier key from aistudio.google.com).
// The key lives only in this browser's localStorage. Every question is grounded in PLANT_FACTS,
// the glossary and the cards from the same topic.
const AI = (() => {
  const BASE = "https://generativelanguage.googleapis.com/v1beta";
  const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

  const key = () => get("kcgm_gkey", "");
  const model = () => get("kcgm_gmodel", "");
  const ready = () => !!key();

  // Pick the newest stable "gemini-X.Y-flash" model this key can use; fall back to any flash model.
  async function detectModels(k) {
    const r = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(k)}`);
    if (!r.ok) throw new Error(await errText(r));
    const j = await r.json();
    const names = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace(/^models\//, ""))
      .filter(n => /flash|pro/.test(n) && !/image|tts|audio|live|embedding|vision|learnlm/.test(n));
    const ver = n => { const m = n.match(/^gemini-(\d+(?:\.\d+)?)-/); return m ? parseFloat(m[1]) : 0; };
    const stableFlash = names.filter(n => /^gemini-\d+(\.\d+)?-flash$/.test(n)).sort((a, b) => ver(b) - ver(a));
    const anyFlash = names.filter(n => /flash/.test(n) && !/lite/.test(n)).sort((a, b) => ver(b) - ver(a));
    const best = stableFlash[0] || (names.includes("gemini-flash-latest") ? "gemini-flash-latest" : anyFlash[0]) || names[0];
    return { best, names };
  }

  async function errText(r) {
    let msg = "";
    try { const j = await r.json(); msg = (j.error && j.error.message) || ""; } catch (e) {}
    if (r.status === 429) return "Free limit reached for now. Wait a minute and try again.";
    if (r.status === 400 && /API key/i.test(msg)) return "That key was rejected. Check it in Settings.";
    if (r.status === 403) return "This key isn't allowed to use Gemini. Recreate it at aistudio.google.com.";
    return `Google returned an error (${r.status}). ${msg}`.trim();
  }

  function context(card) {
    const topicCards = CARDS.filter(c => c.t === card.t && c !== card)
      .map(c => `Q: ${c.q}\nA: ${c.a}\n${c.e}`).join("\n\n");
    const gl = GLOSSARY.map(([k, v]) => `${k}: ${v}`).join("\n");
    return `PLANT REFERENCE (from KCGM project documents; design values, not live plant data)\n${PLANT_FACTS}\n\n` +
      `GLOSSARY\n${gl}\n\nOTHER CARDS IN THIS TOPIC (${TOPICS[card.t].name})\n${topicCards}`;
  }

  const SYSTEM = `You are a patient plant tutor inside a flashcard app for a mechanical engineer who is new to the KCGM Fimiston gold processing plant in Kalgoorlie. They want to understand the process deeply enough to follow shift handovers and technical conversations.

Rules:
1. Answer from the PLANT REFERENCE, GLOSSARY and CARDS first. They come from the site's design documents and control philosophies.
2. You may add general mineral processing or engineering knowledge to explain mechanisms, but never invent KCGM specific numbers, tag numbers, setpoints or procedures that are not in the reference.
3. Set "source" honestly: "plant docs" if the answer comes from the reference, "docs + general" if you combined them, "general knowledge" if the reference does not cover it, "not covered" if you cannot answer reliably. For "not covered", say so plainly and suggest who on site would know (for example the metallurgist, the control room operator or the area maintenance planner).
4. Design values are not live operating values. Say so when it matters.
5. Write in plain, direct English, 60 to 180 words, short paragraphs, no markdown symbols. Use mechanical engineering analogies (pumps, heat exchangers, gearboxes, control loops) where they genuinely help.
6. Never give instructions that would bypass safety systems, isolations or interlocks.
7. "followups": exactly 3 new questions the learner might ask next, each under 80 characters, not repeating anything already asked in this conversation.`;

  const SCHEMA = {
    type: "OBJECT",
    properties: {
      answer: { type: "STRING" },
      source: { type: "STRING", enum: ["plant docs", "docs + general", "general knowledge", "not covered"] },
      followups: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: ["answer", "source", "followups"]
  };

  // thread = [{q, a}] earlier turns on this card; returns {answer, source, followups}
  async function ask(card, thread, question) {
    if (!ready()) throw new Error("NO_KEY");
    let m = model();
    if (!m) { m = (await detectModels(key())).best; set("kcgm_gmodel", m); }
    const contents = [
      { role: "user", parts: [{ text: context(card) + `\n\nFLASHCARD THE LEARNER JUST SAW\nQ: ${card.q}\nA: ${card.a}\n${card.e}\n\nFirst question: ${thread.length ? thread[0].q : question}` }] }
    ];
    thread.forEach((t, i) => {
      if (i > 0) contents.push({ role: "user", parts: [{ text: t.q }] });
      contents.push({ role: "model", parts: [{ text: JSON.stringify({ answer: t.a, source: t.s, followups: t.f }) }] });
    });
    if (thread.length) contents.push({ role: "user", parts: [{ text: question }] });

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: SCHEMA }
    };
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 45000);
    let r;
    try {
      r = await fetch(`${BASE}/models/${m}:generateContent?key=${encodeURIComponent(key())}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal
      });
    } catch (e) {
      throw new Error(e.name === "AbortError" ? "No reply in time. Check your signal and try again." : "Can't reach Google. Check your signal.");
    } finally { clearTimeout(timer); }
    if (r.status === 404) { set("kcgm_gmodel", null); throw new Error("That AI model was retired. Tap Test in Settings to pick the current one, then ask again."); }
    if (!r.ok) throw new Error(await errText(r));
    const j = await r.json();
    const cand = (j.candidates || [])[0];
    const text = ((cand && cand.content && cand.content.parts) || []).filter(p => !p.thought).map(p => p.text || "").join("");
    if (!text) throw new Error(cand && cand.finishReason === "SAFETY" ? "Google blocked that answer. Try rewording." : "Empty reply. Try again.");
    let out;
    try { out = JSON.parse(text); } catch (e) { out = { answer: text, source: "general knowledge", followups: [] }; }
    out.followups = (out.followups || []).filter(Boolean).slice(0, 3);
    return out;
  }

  async function test(k) {
    const { best, names } = await detectModels(k);
    if (!best) throw new Error("No usable Gemini model found for this key.");
    set("kcgm_gkey", k); set("kcgm_gmodel", best);
    return { best, names };
  }

  return { ready, ask, test, key, model, setModel: m => set("kcgm_gmodel", m), clear: () => { set("kcgm_gkey", null); set("kcgm_gmodel", null); } };
})();
