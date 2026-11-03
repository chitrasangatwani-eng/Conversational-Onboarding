// Checks every src/i18n/<lang>.json against en.json:
// same length, no empty entries, trailing spaces kept (they join fragments),
// and codes, product terms and numbers carried over unchanged.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/i18n");
const en = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8"));
const KEEP = /ID-\d+|VK-\d+|\d+/g;
let bad = 0;

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json").sort()) {
  const tr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const errs = [];
  if (!Array.isArray(tr) || tr.length !== en.length) errs.push(`has ${tr.length} entries, expected ${en.length}`);
  else {
    en.forEach((e, i) => {
      const t = tr[i];
      if (typeof t !== "string" || !t.trim()) { errs.push(`#${i} empty`); return; }
      if (/\s$/.test(e) && !/\s$/.test(t)) errs.push(`#${i} lost trailing space`);
      for (const tok of e.match(KEEP) ?? []) if (!t.includes(tok)) errs.push(`#${i} missing "${tok}"`);
    });
  }
  console.log((errs.length ? "FAIL " : "ok   ") + f + (errs.length ? "\n  " + errs.join("\n  ") : ""));
  bad += errs.length;
}
process.exit(bad ? 1 : 0);
