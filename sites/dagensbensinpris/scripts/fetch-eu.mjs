// Hämtar EU-kommissionens Weekly Oil Bulletin (prishistorik sedan 2005, alla EU-länder) -> data/eu.json.
// Källa: European Commission, Weekly Oil Bulletin (fri vidareanvändning med källangivelse, CC BY 4.0).
// Priserna är veckogenomsnitt vid pump (måndagar). Med och utan skatt, så skatteandelen kan räknas fram.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lasXlsx, excelDatum } from "./xlsx.mjs";

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROT, "data", "raw");
fs.mkdirSync(RAW, { recursive: true });
const SIDA = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en";
const UA = { "user-agent": "Mozilla/5.0 (compatible; open-data-fetcher/1.0)" };
const FIL = path.join(RAW, "eu-historik.xlsx");

const NAMN = {
  AT: "Österrike", BE: "Belgien", BG: "Bulgarien", CY: "Cypern", CZ: "Tjeckien", DE: "Tyskland", DK: "Danmark", EE: "Estland",
  ES: "Spanien", FI: "Finland", FR: "Frankrike", GR: "Grekland", HR: "Kroatien", HU: "Ungern", IE: "Irland", IT: "Italien",
  LT: "Litauen", LU: "Luxemburg", LV: "Lettland", MT: "Malta", NL: "Nederländerna", PL: "Polen", PT: "Portugal", RO: "Rumänien",
  SE: "Sverige", SI: "Slovenien", SK: "Slovakien",
};

const alder = fs.existsSync(FIL) ? (Date.now() - fs.statSync(FIL).mtimeMs) / 86400000 : Infinity;
if (alder > 2) {
  const html = await (await fetch(SIDA, { headers: UA })).text();
  const lank = /href="([^"]*Prices_History[^"]*\.xlsx)"/i.exec(html)?.[1];
  if (!lank) throw new Error("Hittade ingen historikfil på EU-sidan");
  const url = new URL(lank.replace(/&amp;/g, "&"), SIDA).toString();
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`EU-filen gav HTTP ${r.status}`);
  fs.writeFileSync(FIL, Buffer.from(await r.arrayBuffer()));
  console.log("  hämtade EU-historiken");
} else console.log("  EU-historiken är färsk nog, använder sparad fil");

const blad = lasXlsx(fs.readFileSync(FIL));
const med = blad["Prices with taxes"], utan = blad["Prices wo taxes"];
const rubrik = med[0];
const kol = (rad, namn) => rad.indexOf(namn);

// Rader med datum i kolumn A. Utan-skatt-bladet har samma radordning; matcha ändå på datum.
const utanPerDatum = new Map(utan.filter((r) => typeof r?.[0] === "number").map((r) => [r[0], r]));
const lander = {};
for (const [kod, namn] of Object.entries(NAMN)) {
  const iKurs = kol(rubrik, `${kod}_exchange_rate`);
  const i95 = kol(rubrik, `${kod}_price_with_tax_euro95`), iD = kol(rubrik, `${kod}_price_with_tax_diesel`);
  const u95 = kol(utan[0], `${kod}_price_wo_tax_euro95`), uD = kol(utan[0], `${kod}_price_wo_tax_diesel`);
  if (i95 < 0) { console.warn("  saknar kolumner för", kod); continue; }
  const serie = [];
  for (const r of med) {
    if (typeof r?.[0] !== "number") continue;
    const u = utanPerDatum.get(r[0]) ?? [];
    const l = (v) => (typeof v === "number" && v > 0 ? Math.round(v) / 1000 : null); // EUR per 1000 l -> EUR per liter (3 decimaler)
    serie.push([excelDatum(r[0]), l(r[i95]), l(r[iD]), l(u[u95]), l(u[uD]), iKurs >= 0 && typeof r[iKurs] === "number" ? Number(r[iKurs].toFixed(6)) : 1]);
  }
  serie.sort((a, b) => a[0].localeCompare(b[0]));
  lander[kod] = { namn, valuta: iKurs >= 0 ? null : "EUR", serie };
}

// SEK per EUR samma vecka (från Sveriges kolumn: EUR per SEK).
const sekPerEur = Object.fromEntries(lander.SE.serie.map((r) => [r[0], r[5] ? 1 / r[5] : null]));
const ut = {
  kalla: "European Commission, Weekly Oil Bulletin",
  kalla_url: SIDA,
  licens: "CC BY 4.0",
  not: "Veckogenomsnitt av pumppriser (måndagar), i EUR per liter. Kolumner: datum, 95 med skatt, diesel med skatt, 95 utan skatt, diesel utan skatt, växelkurs (EUR per nationell valuta).",
  senaste: lander.SE.serie.at(-1)[0],
  sek_per_eur: sekPerEur,
  lander,
};
fs.writeFileSync(path.join(ROT, "data", "eu.json"), JSON.stringify(ut));
const se = lander.SE.serie.at(-1);
console.log(`  -> data/eu.json: ${Object.keys(lander).length} länder, ${lander.SE.serie.length} veckor, senaste ${se[0]}: 95 = ${(se[1] / se[5]).toFixed(2)} kr/l`);
