// Prints every instrument/valve tag used by LOOPS and INTERLOCKS in pfd-data.js (expanded), one per line.
// node tools/loop_tags.js > tags.txt ; python3 tools/build_equip.py <json folder> tags.txt
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "pfd-data.js"), "utf8").replace(/^const /gm, "var ");
eval(src);
const { expandTag } = require("./tagutil.js");
const out = new Set();
LOOPS.forEach(L => [...(L.m || []), ...(L.f || []), L.c || ""].forEach(t => expandTag(t).forEach(x => out.add(x))));
INTERLOCKS.forEach(I => (I.tags || "").split(/[^A-Z0-9\-\/ ]|→|↔/).forEach(t => expandTag(t.trim()).forEach(x => out.add(x))));
console.log([...out].filter(t => /^[A-Z]{1,5}\d{4,}[A-Z]?$/.test(t)).join("\n"));
