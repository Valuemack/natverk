// Hämtar namnstatistik från SCB:s statistikdatabas (öppna data, CC0):
//  - Tilltalsnamn med minst 10 bärare (BE0001TNamn10), alla namn, åren 2000, 2010 och 2020
//  - Förnamn med minst 10 bärare (BE0001FNamn10), år 2020
//  - Nyfödda per tilltalsnamn och år (BE0001Nyfodda), 1998–2022, för almanackans namn
// SCB uppdaterar inte längre dessa tabeller (senaste år 2020 resp. 2022); årtalet visas alltid på sajten.
// Resultat: data/scb.json (bara det sajten använder).
import { hamta, skrivJson, lasJson } from "./lib.mjs";

const BAS = "https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0001";
const ALMANACKA = lasJson("namnlangd.json").namn;
const VARA = new Set(ALMANACKA.flatMap((n) => [n.namn, ...(n.varianter ?? [])]));

async function fraga(tabell, query) {
  const d = await hamta(`${BAS}/${tabell}`, { metod: "POST", json: true, kropp: { query, response: { format: "json" } } });
  return d.data.map((r) => ({ nycklar: r.key, varde: r.values[0] === ".." ? null : Number(r.values[0]) }));
}

// Kodning i Namn10-tabellerna: namn + kön (K/M), t.ex. "TureM".
const delaKod = (kod) => ({ namn: kod.slice(0, -1), kon: kod.slice(-1) });

async function namn10(tabell, variabel, innehall, ar) {
  const rader = await fraga(tabell, [
    { code: variabel, selection: { filter: "all", values: ["*"] } },
    { code: "ContentsCode", selection: { filter: "item", values: [innehall] } },
    { code: "Tid", selection: { filter: "item", values: [String(ar)] } },
  ]);
  const ut = {};
  for (const r of rader) {
    if (!r.varde) continue;
    const { namn, kon } = delaKod(r.nycklar[0]);
    (ut[namn] ??= {})[kon] = r.varde;
  }
  console.log(`${tabell} ${ar}: ${Object.keys(ut).length} namn`);
  return ut;
}

const tilltal = {};
for (const ar of [2000, 2010, 2020]) tilltal[ar] = await namn10("BE0001G/BE0001TNamn10", "Tilltalsnamn", "00000001", ar);
const fornamn2020 = await namn10("BE0001G/BE0001FNamn10", "Fornamn", "00000002", 2020);

// Nyfödda: bara almanackans namn (finns namnet inte i tabellen hoppar SCB över det → hämta metadata först).
const meta = await hamta(`${BAS}/BE0001D/BE0001Nyfodda`, { json: true });
const finns = new Set(meta.variables.find((v) => v.code === "Tilltalsnamn").values);
const urval = [...VARA].filter((n) => finns.has(n));
const nyfodda = {};
for (let i = 0; i < urval.length; i += 200) {
  const rader = await fraga("BE0001D/BE0001Nyfodda", [
    { code: "Tilltalsnamn", selection: { filter: "item", values: urval.slice(i, i + 200) } },
    { code: "Kon", selection: { filter: "item", values: ["1", "2"] } },
    { code: "ContentsCode", selection: { filter: "item", values: ["000004F5"] } },
  ]);
  for (const r of rader) {
    if (!r.varde) continue;
    const [namn, kon, ar] = r.nycklar;
    const p = ((nyfodda[namn] ??= {})[ar] ??= 0);
    nyfodda[namn][ar] = p + r.varde;
    void kon;
  }
}
console.log(`Nyfödda: ${Object.keys(nyfodda).length} av ${urval.length} namn har data`);

const summa = (x) => (x ? (x.K ?? 0) + (x.M ?? 0) : 0);
const per = (namn) => ({
  tilltal2020: tilltal[2020][namn] ?? null,
  tilltal2010: summa(tilltal[2010][namn]) || null,
  tilltal2000: summa(tilltal[2000][namn]) || null,
  fornamn2020: fornamn2020[namn] ?? null,
  nyfodda: nyfodda[namn] ?? null,
});

// Vanligaste tilltalsnamnen 2020 som saknar namnsdag (unik lista för sajten).
const utan = Object.entries(tilltal[2020])
  .map(([namn, x]) => ({ namn, antal: summa(x), kvinnor: x.K ?? 0, man: x.M ?? 0 }))
  .filter((x) => !VARA.has(x.namn))
  .sort((a, b) => b.antal - a.antal)
  .slice(0, 300);

// Rangordning bland alla tilltalsnamn 2020.
const rang = Object.entries(tilltal[2020]).map(([n, x]) => [n, summa(x)]).sort((a, b) => b[1] - a[1]);
const placering = Object.fromEntries(rang.map(([n], i) => [n, i + 1]));
const totalt = rang.reduce((s, [, v]) => s + v, 0);

skrivJson("scb.json", {
  kalla: "SCB, Statistikdatabasen: BE0001TNamn10, BE0001FNamn10, BE0001Nyfodda (CC0)",
  hamtad: new Date().toISOString().slice(0, 10),
  antalTilltalsnamn2020: rang.length,
  personerMedTilltalsnamn2020: totalt,
  namn: Object.fromEntries([...VARA].map((n) => [n, { ...per(n), placering2020: placering[n] ?? null }])),
  vanligasteUtanNamnsdag: utan,
});
console.log("Sparade data/scb.json");
