// Namnsdagar i andra länder ur Wikidata (CC0): egenskapen P1750 "namnsdag" på förnamnsobjekt, med kvalifikatorn
// P17 (land). Bara det Wikidata anger per namn – inga hela almanackor kopieras (de nordiska almanackorna skyddas av
// databasrätt). Påståenden med sluttid (P582) eller rangen "deprecated" tas inte med. De svenska påståendena
// används bara som kontroll mot vår egen namnlängd (skriptet skriver ut hur många som stämmer).
// Datum som stickprovskontrollerats och visat sig fel läggs i UTESLUT och visas aldrig.
// Två SPARQL-frågor (P1750 i hela Wikidata är ca 4 000 påståenden), generisk User-Agent, paus mellan anropen.
import { hamta, skrivJson, lasJson, namnurval } from "./lib.mjs";

const SPARQL = "https://query.wikidata.org/sparql";
const fraga = async (q) => (await hamta(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`, { json: true, paus: 1500 })).results.bindings;
const FORNAMN = ["Q12308941", "Q11879590", "Q3409032", "Q202444"];
const MANAD = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
// "Namn|land|mmdd" som stickprovet visat är fel (se data/LICENS-OCH-KALLOR.txt, 2i).
const UTESLUT = new Set(lasJson("wikidata-namnsdagar-uteslut.json", { uteslut: [] }).uteslut);
// Länder som inte visas (stickprov 2026-11-27): Frankrike och Luxemburg bygger på Nominis och anger ofta bara ett
// mindre helgon (Catherine 24 mars, men huvuddagen är 25 november) – ofullständigt och vilseledande. Tyskland saknar
// en gemensam namnsdagskalender och gick inte att verifiera.
const UTESLUT_LAND = new Set(["Frankrike", "Luxemburg", "Tyskland"]);
// Stickprov mot källa (2026-11-27). Alla tio stämde.
const STICKPROV = [
  ["Viggo", "Norge", "06-15", "https://snl.no/Viggo"], ["Ella", "Norge", "02-19", "https://snl.no/Ella"],
  ["Lars", "Norge", "08-10", "https://snl.no/Lars_-_mannsnamn"], ["Johan", "Norge", "08-29", "https://snl.no/Johan_-_mannsnamn"],
  ["Nova", "Finland", "09-12", "https://fi.wikipedia.org/wiki/Nova_(nimi) (finlandssvenska kalendern sedan 2020)"],
  ["Anna", "Tjeckien", "07-26", "https://cs.wikipedia.org/wiki/Anna"], ["Daniel", "Slovakien", "07-21", "https://sk.wikipedia.org/wiki/Daniel_(prvé_meno)"],
  ["Klara", "Polen", "08-12", "https://www.deon.pl/imieniny/imie,1653,klara.html"], ["Gabriel", "Spanien", "09-29", "https://es.wikipedia.org/wiki/29_de_septiembre"],
  ["Marek", "Estland", "04-25", "https://www.behindthename.com/namedays/country/estonia"],
].map(([namn, land, datum, kalla]) => ({ namn, land, datum, kalla }));

// 1. Alla P1750-påståenden (lätt fråga utan etiketter – den tunga varianten ger 504 hos Wikidata).
const pst = await fraga(`SELECT ?item ?st ?dag ?land ?rank ?slut ?ref WHERE {
  ?item p:P1750 ?st . ?st ps:P1750 ?dag ; wikibase:rank ?rank .
  OPTIONAL { ?st pq:P17 ?land } OPTIONAL { ?st pq:P582 ?slut } OPTIONAL { ?st prov:wasDerivedFrom/pr:P854 ?ref }
}`);
// 2. Vilka av objekten som är förnamn
const fornamn = new Set((await fraga(`SELECT DISTINCT ?item WHERE { ?item p:P1750 [] ; wdt:P31 ?t . VALUES ?t { ${FORNAMN.map((x) => `wd:${x}`).join(" ")} } }`)).map((b) => b.item.value));
// 3. Etiketter (sv/en) för namn, dagar och länder via wbgetentities, 50 åt gången
const id = (u) => u?.split("/").pop();
const behov = [...new Set(pst.filter((b) => fornamn.has(b.item.value)).flatMap((b) => [id(b.item.value), id(b.dag.value), id(b.land?.value)]).filter(Boolean))];
const lbl = {};
for (let i = 0; i < behov.length; i += 50) {
  const e = await hamta(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=sv|en&ids=${behov.slice(i, i + 50).join("|")}`, { json: true, paus: 800 });
  for (const [k, x] of Object.entries(e.entities ?? {})) lbl[k] = { sv: x.labels?.sv?.value, en: x.labels?.en?.value };
  process.stdout.write(".");
}
const rader = pst.filter((b) => fornamn.has(b.item.value)).map((b) => ({
  item: b.item, rank: b.rank, slut: b.slut, ref: b.ref,
  sv: lbl[id(b.item.value)]?.sv && { value: lbl[id(b.item.value)].sv }, en: lbl[id(b.item.value)]?.en && { value: lbl[id(b.item.value)].en },
  dagEn: { value: lbl[id(b.dag.value)]?.en ?? "" }, landSv: b.land && lbl[id(b.land.value)]?.sv && { value: lbl[id(b.land.value)].sv },
}));
console.log("");

const urval = new Set(namnurval());
const alm = lasJson("namnlangd.json").namn;
const svDag = new Map(); // svensk namnlängd: namn → mmdd
for (const n of alm) svDag.set(n.namn, n.datum);

const ut = {};
let sv = { stammer: 0, fel: [] };
const mmdd = (t) => { const m = t.match(/^([A-Z][a-z]+) (\d{1,2})$/); return m && MANAD[m[1]] ? `${String(MANAD[m[1]]).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null; };
const sett = new Set();
for (const b of rader) {
  if (b.rank.value.endsWith("Deprecated") || b.slut) continue;
  const dag = mmdd(b.dagEn.value);
  if (!dag || !b.landSv) continue;
  const namnet = [b.sv?.value, b.en?.value].find((x) => x && urval.has(x));
  if (!namnet) continue;
  const land = b.landSv.value;
  const nyckel = `${namnet}|${land}|${dag}`;
  if (sett.has(nyckel)) { if (b.ref) ut[namnet].find((x) => x.land === land && x.datum === dag).ref ??= b.ref.value; continue; }
  sett.add(nyckel);
  if (land === "Sverige") {
    if (svDag.get(namnet) === dag) sv.stammer++; else sv.fel.push(`${namnet} ${dag} (namnlängden: ${svDag.get(namnet) ?? "saknas"})`);
    continue;
  }
  if (UTESLUT.has(nyckel) || UTESLUT_LAND.has(land)) continue;
  (ut[namnet] ??= []).push({ land, datum: dag, wikidata: b.item.value.split("/").pop(), ref: b.ref?.value ?? null });
}
for (const v of Object.values(ut)) v.sort((a, b) => a.land.localeCompare(b.land, "sv") || a.datum.localeCompare(b.datum));

skrivJson("wikidata-namnsdagar.json", {
  kalla: "Wikidata, egenskapen P1750 (namnsdag) med kvalifikatorn P17 (land), förnamnsobjekt",
  licens: "CC0 1.0 (Wikidata)",
  hamtad: new Date().toISOString().slice(0, 10),
  kontrollSverige: { stammer: sv.stammer, avviker: sv.fel.length, not: "Wikidatas svenska datum jämförda med vår namnlängd; avvikelserna är nästan bara namn som inte står i namnlängden" },
  uteslutnaLander: [...UTESLUT_LAND],
  stickprov: STICKPROV,
  namn: ut,
});
const lander = {};
for (const v of Object.values(ut)) for (const x of v) lander[x.land] = (lander[x.land] ?? 0) + 1;
console.log(`P1750-rader: ${rader.length}. Namn med namnsdag i annat land: ${Object.keys(ut).length}.`);
console.log("Per land:", Object.entries(lander).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(", "));
console.log(`Kontroll Sverige: ${sv.stammer} stämmer med namnlängden, ${sv.fel.length} avviker:`, sv.fel.slice(0, 30).join("; "));
