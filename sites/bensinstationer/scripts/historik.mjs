// Bygger upp en daglig prishistorik från kedjornas listpriser -> data/dagspriser.json.
// Historiken lagras i den publicerade sajten (/data/dagspriser.json): förra versionen hämtas från sajten,
// dagens priser läggs till och filen publiceras igen. Faller tillbaka på den lokala filen om sajten inte svarar.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIL = path.join(ROT, "data", "dagspriser.json");
// Historiken publicerades på dagensbensinpris.se fram till sammanslagningen 2026-11-27; den adressen 301-omdirigeras nu hit.
const LIVE = "https://bensinstationer.nu/data/dagspriser.json";
const SORTER = ["bensin95", "bensin98", "diesel", "e85", "hvo100", "biogas"];

const las = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
// Övergång: läs båda adresserna och behåll den längsta historiken (den gamla följer 301 hit när omdirigeringen är aktiv).
let hist = null;
for (const url of [LIVE, "https://dagensbensinpris.se/data/dagspriser.json"]) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const j = r.ok ? await r.json() : null;
    if (j?.dagar && (!hist || j.dagar.length > hist.dagar.length)) hist = j;
  } catch { /* adressen nås inte, prova nästa eller använd lokal fil */ }
}
const lokal = las(FIL);
if (!hist || (lokal && lokal.dagar?.length > hist.dagar?.length)) hist = lokal;
hist ??= { not: "Kedjornas publicerade listpriser inkl. moms, en rad per dag.", dagar: [] };

const lp = las(path.join(ROT, "data", "listpriser.json"));
if (lp?.datum) {
  const rad = {
    datum: lp.datum,
    snitt: Object.fromEntries(SORTER.filter((k) => lp.snitt?.[k]).map((k) => [k, lp.snitt[k].pris])),
    kedjor: Object.fromEntries(lp.kedjor.map((c) => [c.kedja, Object.fromEntries(SORTER.filter((k) => c.priser?.[k]).map((k) => [k, c.priser[k].pris]))])),
  };
  hist.dagar = hist.dagar.filter((d) => d.datum !== rad.datum);
  hist.dagar.push(rad);
  hist.dagar.sort((a, b) => a.datum.localeCompare(b.datum));
}
fs.writeFileSync(FIL, JSON.stringify(hist));
console.log(`  -> data/dagspriser.json: ${hist.dagar.length} dagar (${hist.dagar[0]?.datum} – ${hist.dagar.at(-1)?.datum})`);
