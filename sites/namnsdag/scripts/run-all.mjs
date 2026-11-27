// Hämtar all data för namnsdagssajten. Namnlängden ändras sällan (några namn vart 3–5 år) och
// SCB-tabellerna uppdateras inte längre, så skriptet behöver bara köras när källorna ändras –
// nattbygget kan bygga direkt från de sparade filerna i data/.
// Wikipedia/Wikidata/FN-hämtningarna (05–08, 10) är långsamma och snälla mot källorna: de körs bara när
// datafilen saknas eller är äldre än 30 dagar (fältet "hamtad"), eller med --allt.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const dir = dirname(fileURLToPath(import.meta.url));
const allt = process.argv.includes("--allt");
const MAX_DAGAR = 30;
const SKRIPT = [
  ["01-namnlangd.mjs"], ["02-scb.mjs"], ["03-scb-topplistor.mjs"], ["04-scb-nyfodda-alla.mjs"],
  ["05-wikipedia-namn.mjs", "wikipedia-namn.json"], ["06-wikidata-personer.mjs", "wikidata-personer.json"],
  ["07-wikipedia-datum.mjs", "wikipedia-datum.json"], ["08-fn-dagar.mjs", "fn-dagar.json"],
  ["10-wikidata-namn.mjs", "wikidata-namn.json"],
  ["12-wikidata-namnsdagar.mjs", "wikidata-namnsdagar.json"],
];
const alder = (fil) => {
  const p = join(dir, "..", "data", fil);
  if (!existsSync(p)) return Infinity;
  const hamtad = JSON.parse(readFileSync(p, "utf8")).hamtad;
  return hamtad ? (Date.now() - Date.parse(hamtad)) / 86400000 : Infinity;
};
for (const [s, fil] of SKRIPT) {
  if (fil && !allt && alder(fil) < MAX_DAGAR) { console.log(`\n== ${s}: hoppas över (${fil} är yngre än ${MAX_DAGAR} dagar)`); continue; }
  console.log(`\n== ${s}`);
  execFileSync(process.execPath, [join(dir, s)], { stdio: "inherit" });
}
