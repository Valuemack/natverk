// Hämtar namnlängden (alla namn i almanackan) från Institutet för språk och folkminnen (Isof)
// och kontrollerar den mot Wikipedias datumlista. Resultat: data/namnlangd.json.
// Namnlängden fastställs av Namnlängdskommittén (Svenska Akademien, Isof, Vetenskapsakademien,
// Vitterhetsakademien). Se data/LICENS-OCH-KALLOR.txt – publiceringsfrågan ska klarläggas.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { hamta, skrivJson, text, DATA, MANADER } from "./lib.mjs";

const ISOF_ALLA = "https://www.isof.se/utforska/kunskapsbanker/lar-dig-mer-om-arets-namn-och-handelser/alla-namn-i-almanackan";
const WIKI = "https://sv.wikipedia.org/w/index.php?title=Lista_%C3%B6ver_namnsdagar_i_Sverige_i_datumordning&action=raw";

const pad = (n) => String(n).padStart(2, "0");
const mmdd = (dag, manad) => `${pad(MANADER.indexOf(manad) + 1)}-${pad(dag)}`;

// 1. Isof: "Abel 30 december Abraham 18 december … Paul, Pål 25 januari …"
const html = await hamta(ISOF_ALLA);
writeFileSync(join(DATA, "raw", "isof-alla-namn.html"), html);
const t = text(html);
const start = t.indexOf("namnlängden.", t.indexOf("gemensam namnsdag"));
const slut = t.indexOf("Relaterat innehåll", start);
if (start < 0 || slut < 0) throw new Error("Hittade inte namnlistan hos Isof – har sidan ändrats?");
const seg = t.slice(start + "namnlängden.".length, slut);
// Ett namn kan ha två led ("Gustav Adolf") och en alternativ stavning i parentes ("Noa(h)").
const N = String.raw`[A-ZÅÄÖÉ][\p{L}\-]+(?:\(\p{L}+\))?(?: [A-ZÅÄÖÉ][\p{L}\-]+)?`;
const re = new RegExp(String.raw`(${N}(?:, ${N})*) (\d{1,2}) (${MANADER.join("|")})`, "gu");
const isof = new Map();
const varianter = new Map();
for (const m of seg.matchAll(re)) {
  for (const r of m[1].split(", ")) {
    const p = r.match(/^(.+?)\((\p{L}+)\)$/u); // Noa(h) → Noa, variant Noah
    const n = p ? p[1] : r;
    if (p) varianter.set(n, [n + p[2]]);
    isof.set(n, mmdd(Number(m[2]), m[3]));
  }
}
console.log(`Isof: ${isof.size} namn`);

// 2. Kontroll mot Wikipedia (datumordning). Avvikelser skrivs ut; Isof gäller.
const wiki = new Map();
try {
  const raw = await hamta(WIKI);
  writeFileSync(join(DATA, "raw", "wikipedia-datumordning.txt"), raw);
  for (const rad of raw.split("\n")) {
    const m = rad.match(/^\| \[\[(\d{1,2}) ([a-zåäö]+)\]\] \|\| (.*)$/);
    if (!m || rad.includes("ingen namnsdag")) continue;
    for (const l of m[3].matchAll(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g)) wiki.set(l[1].trim(), mmdd(Number(m[1]), m[2]));
  }
  const diff = [];
  for (const [n, d] of isof) if (wiki.get(n) !== d) diff.push(`${n}: Isof ${d}, Wikipedia ${wiki.get(n) ?? "saknas"}`);
  for (const [n, d] of wiki) if (!isof.has(n)) diff.push(`${n}: bara Wikipedia (${d})`);
  console.log(diff.length ? `Avvikelser mot Wikipedia (${diff.length}):\n  ${diff.join("\n  ")}` : "Ingen avvikelse mot Wikipedia.");
} catch (e) {
  console.log("Wikipedia-kontrollen hoppades över:", e.message);
}

// 3. Beslutade tillägg från 2027 (Isof, nyhet 2025-01-14).
const FRAN_2027 = [
  { namn: "Eira", datum: "01-24" }, { namn: "Mio", datum: "06-05" }, { namn: "Vilgot", datum: "07-30" },
  { namn: "Cassandra", datum: "10-20" }, { namn: "Flora", datum: "10-29" }, { namn: "Zackarias", datum: "12-19" },
];

// 4. Ändringar sedan 2001 (Isof: "Nya namn i almanackan" och Namnlängdskommitténs beslut).
const ANDRINGAR = [
  { ar: 2011, datum: "04-06", nytt: "William", bort: "Helmi" },
  { ar: 2011, datum: "08-28", nytt: "Fatima", bort: "Gurli" },
  { ar: 2011, datum: "09-01", nytt: "Sam" },
  { ar: 2011, datum: "09-07", nytt: "Kevin", bort: "Regina" },
  { ar: 2015, datum: "07-23", nytt: "Emmy" },
  { ar: 2015, datum: "07-26", nytt: "Jasmine" },
  { ar: 2018, datum: "03-08", nytt: "Saga" },
  { ar: 2018, datum: "09-14", nytt: "Ronja" },
  { ar: 2022, datum: "01-19", nytt: "Henry" },
  { ar: 2022, datum: "02-28", nytt: "Maja" },
  { ar: 2022, datum: "03-12", nytt: "Regina" },
  { ar: 2022, datum: "03-31", nytt: "Noa" },
  { ar: 2022, datum: "07-29", nytt: "Olle" },
  { ar: 2022, datum: "11-02", nytt: "Tim" },
  { ar: 2022, datum: "12-03", nytt: "Cornelia" },
  ...FRAN_2027.map((x) => ({ ar: 2027, datum: x.datum, nytt: x.namn })),
];

// Dagar utan namn i almanackan.
const UTAN_NAMN = {
  "01-01": "Nyårsdagen – gemensam namnsdag för alla namn som saknas i almanackan",
  "02-02": "Kyndelsmässodagen",
  "02-29": "Skottdagen",
  "03-25": "Marie bebådelsedag (Vårfrudagen)",
  "06-24": "Johannes Döparens dag",
  "11-01": "Allhelgonadagen",
  "12-25": "Juldagen",
};

const namn = [...isof].map(([n, d]) => ({ namn: n, datum: d, ...(varianter.has(n) && { varianter: varianter.get(n) }) }));
for (const x of FRAN_2027) if (!isof.has(x.namn)) namn.push({ ...x, fran: 2027 });
namn.sort((a, b) => a.namn.localeCompare(b.namn, "sv"));

skrivJson("namnlangd.json", {
  kalla: { url: ISOF_ALLA, utgivare: "Institutet för språk och folkminnen (Isof)", hamtad: new Date().toISOString().slice(0, 10) },
  antal: namn.length,
  namn,
  utanNamn: UTAN_NAMN,
  andringar: ANDRINGAR,
});
console.log(`Sparade ${namn.length} namn (varav ${FRAN_2027.length} från 2027).`);
