// Går igenom alla artiklar med bild och skriver om alt-texter som inte klarar reglerna i src/lib/bildtext.js
// (svenska, 80–125 tecken, beskriver vad bilden visar, inte rubriken, aldrig ordet "AI"). Claude Haiku tittar på bilden.
// Ändrar bara bild.alt.
//
//   node scripts/alttexter.mjs          # bara alt-texter som bryter mot reglerna
//   node scripts/alttexter.mjs --alla   # skriv om alla utifrån bilden
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { laddaEnv } from "./lib/env.mjs";
import { altFel } from "../src/lib/bildtext.js";

laddaEnv();
const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROT, "data", "artiklar");
const { sakraAlt } = await import("./lib/bilder.mjs");
const ALLA = process.argv.includes("--alla");
let kostnad = 0, andrade = 0;
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const a = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  if (!a.bild?.fil) continue;
  const fel = ALLA ? "skrivs om" : altFel(a.bild.alt, a.rubrik);
  if (!fel) continue;
  const svar = await sakraAlt(readFileSync(join(ROT, "public", a.bild.fil)), ALLA ? "" : a.bild.alt, { rubrik: a.rubrik, ingress: a.ingress });
  kostnad += svar.kostnad;
  if (!svar.alt) { console.warn(`EJ KLAR ${a.slug}: ${fel}`); continue; }
  a.bild.alt = svar.alt;
  writeFileSync(join(DIR, f), JSON.stringify(a, null, 2) + "\n");
  andrade++;
  console.log(`${svar.alt.length} ${svar.alt}`);
}
console.log(`${andrade} alt-texter omskrivna, cirka $${kostnad.toFixed(4)}.`);
