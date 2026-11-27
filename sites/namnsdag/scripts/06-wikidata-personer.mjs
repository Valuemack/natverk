// Kända personer per förnamn ur Wikidata (CC0). Bara personer som har en artikel på svenska
// Wikipedia (dvs. offentliga personer med egen uppslagsartikel) och vars artikeltitel börjar
// med förnamnet. Ordnade efter antal Wikipedia-språkversioner (ett mått på hur kända de är).
// Förnamnsobjektet tas från namnartikeln på svenska Wikipedia (05-wikipedia-namn.mjs) eller,
// om sådan saknas, via Wikidatas sök-API (objekt som är förnamn med exakt samma etikett).
// Frågorna mot Wikidata Query Service görs bara på objekt-id (billiga) med paus emellan, och
// resultatet sparas löpande så att en avbruten körning kan fortsätta (--om hämtar allt på nytt).
import { hamta, skrivJson, lasJson, namnurval } from "./lib.mjs";

const SPARQL = "https://query.wikidata.org/sparql";
const API = "https://www.wikidata.org/w/api.php";
const FIL = "wikidata-personer.json";
const wiki = lasJson("wikipedia-namn.json", { namn: {} }).namn;
const urval = namnurval();
const FORNAMN = new Set(["Q12308941", "Q11879590", "Q3409032", "Q202444"]); // mansnamn, kvinnonamn, könsneutralt namn, förnamn
const tidigare = process.argv.includes("--om") ? {} : (lasJson(FIL, { namn: {}, klara: [] }));
const ut = tidigare.namn ?? {};
const klara = new Set(tidigare.klara ?? []);

/** Förnamnsobjekt med exakt etikett via wbsearchentities + wbgetentities (P31). */
async function fornamnsobjekt(namn) {
  const s = await hamta(`${API}?action=wbsearchentities&format=json&language=sv&uselang=sv&type=item&limit=15&search=${encodeURIComponent(namn)}`, { json: true, paus: 800 });
  const kand = (s.search ?? []).filter((x) => x.label === namn || x.match?.text === namn).map((x) => x.id);
  if (!kand.length) return [];
  const e = await hamta(`${API}?action=wbgetentities&format=json&props=claims&ids=${kand.join("|")}`, { json: true, paus: 800 });
  return Object.values(e.entities ?? {}).filter((x) => (x.claims?.P31 ?? []).some((c) => FORNAMN.has(c.mainsnak?.datavalue?.value?.id))).map((x) => x.id);
}

function spara() {
  skrivJson(FIL, {
    kalla: "Wikidata (förnamn P735, personer med artikel på svenska Wikipedia)",
    licens: "CC0 1.0 (Wikidata)",
    hamtad: new Date().toISOString().slice(0, 10),
    namn: ut,
    klara: [...klara],
  });
}

let i = 0;
for (const namn of urval) {
  i++;
  if (klara.has(namn)) continue;
  try {
    const objekt = wiki[namn]?.wikidata ? [wiki[namn].wikidata] : await fornamnsobjekt(namn);
    if (objekt.length) {
      const q = `SELECT DISTINCT ?p ?titel ?beskr ?fodd ?dod ?sl WHERE {
        VALUES ?fn { ${objekt.map((o) => `wd:${o}`).join(" ")} }
        ?p wdt:P735 ?fn; wdt:P31 wd:Q5; wikibase:sitelinks ?sl.
        ?art schema:about ?p; schema:isPartOf <https://sv.wikipedia.org/>; schema:name ?titel.
        OPTIONAL { ?p schema:description ?beskr. FILTER(LANG(?beskr) = "sv") }
        OPTIONAL { ?p wdt:P569 ?fodd } OPTIONAL { ?p wdt:P570 ?dod }
      } ORDER BY DESC(?sl) LIMIT 60`;
      const rader = (await hamta(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`, { json: true, paus: 2500 })).results.bindings;
      const sett = new Set();
      const valda = [];
      const ar = (b) => (b ? Number(b.value.slice(0, b.value.startsWith("-") ? 5 : 4)) : null);
      for (const r of rader) {
        const titel = r.titel.value;
        if (!titel.startsWith(`${namn} `) || sett.has(r.p.value)) continue;
        sett.add(r.p.value);
        valda.push({
          titel,
          url: `https://sv.wikipedia.org/wiki/${encodeURIComponent(titel.replace(/ /g, "_"))}`,
          wikidata: r.p.value.split("/").pop(),
          beskr: r.beskr?.value ?? null,
          fodd: ar(r.fodd), dod: ar(r.dod), sprak: Number(r.sl.value),
        });
        if (valda.length === 20) break;
      }
      if (valda.length) ut[namn] = valda;
    }
    klara.add(namn);
  } catch (e) {
    console.log(`\nfel: ${namn} (${e.message.slice(0, 80)})`);
  }
  if (i % 50 === 0) { spara(); process.stdout.write(`${i} `); }
}
spara();
console.log(`\nSparade data/${FIL}: ${Object.keys(ut).length} namn med kända personer (${klara.size} av ${urval.length} klara)`);
