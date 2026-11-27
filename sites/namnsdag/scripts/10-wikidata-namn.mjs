// Fakta om själva förnamnen ur Wikidata (CC0): vilka namn i andra språk som räknas som samma namn
// (P460 "sägs vara detsamma som") och vilka språk namnet används i (P407). Används på namnsidorna för att
// visa släktnamn i almanackan (t.ex. Liam – William) och motsvarande namn i andra språk.
// Förnamnsobjekten hittas via namnartikeln på svenska Wikipedia (05) och via exakt etikett (sv/en) bland
// objekt som är förnamn. Bara billiga anrop: en SPARQL-fråga per 60 namn, sedan wbgetentities i omgångar om 50.
import { hamta, skrivJson, lasJson, namnurval } from "./lib.mjs";

const SPARQL = "https://query.wikidata.org/sparql";
const API = "https://www.wikidata.org/w/api.php";
const FORNAMN = { Q12308941: "man", Q11879590: "kvinna", Q3409032: "unisex", Q202444: null };
const wiki = lasJson("wikipedia-namn.json", { namn: {} }).namn;
const urval = namnurval();
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// 1. Förnamnsobjekt per namn
const objekt = new Map(urval.map((n) => [n, new Set(wiki[n]?.wikidata ? [wiki[n].wikidata] : [])]));
for (let i = 0; i < urval.length; i += 60) {
  const del = urval.slice(i, i + 60);
  const q = `SELECT ?l ?item WHERE { VALUES ?l { ${del.flatMap((n) => [`"${esc(n)}"@sv`, `"${esc(n)}"@en`]).join(" ")} }
    ?item rdfs:label ?l ; wdt:P31 ?typ . VALUES ?typ { ${Object.keys(FORNAMN).map((x) => `wd:${x}`).join(" ")} } }`;
  const r = await hamta(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`, { json: true, paus: 1500 });
  for (const b of r.results.bindings) objekt.get(b.l.value)?.add(b.item.value.split("/").pop());
  process.stdout.write(".");
}

// 2. Påståenden för alla objekt
const alla = [...new Set([...objekt.values()].flatMap((s) => [...s]))];
const claims = {};
for (let i = 0; i < alla.length; i += 50) {
  const e = await hamta(`${API}?action=wbgetentities&format=json&props=claims&ids=${alla.slice(i, i + 50).join("|")}`, { json: true, paus: 800 });
  Object.assign(claims, e.entities);
}
const varden = (id, p) => (claims[id]?.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);

// 3. Etiketter för språk och "samma namn"
const ref = [...new Set(alla.flatMap((id) => [...varden(id, "P460"), ...varden(id, "P407")]))];
const etikett = {};
for (let i = 0; i < ref.length; i += 50) {
  const e = await hamta(`${API}?action=wbgetentities&format=json&props=labels|claims&languages=sv|en&ids=${ref.slice(i, i + 50).join("|")}`, { json: true, paus: 800 });
  for (const [id, x] of Object.entries(e.entities ?? {})) {
    const p31 = (x.claims?.P31 ?? []).map((c) => c.mainsnak?.datavalue?.value?.id);
    etikett[id] = { sv: x.labels?.sv?.value, en: x.labels?.en?.value, fornamn: p31.some((t) => t in FORNAMN) };
  }
}

// 4. Sammanställ per namn
const ut = {};
for (const [namn, ids] of objekt) {
  const ii = [...ids].filter((id) => claims[id]);
  if (!ii.length) continue;
  const kon = [...new Set(ii.flatMap((id) => varden(id, "P31")).map((t) => FORNAMN[t]).filter(Boolean))];
  const samma = [...new Set(ii.flatMap((id) => varden(id, "P460")).filter((id) => etikett[id]?.fornamn).map((id) => etikett[id].sv ?? etikett[id].en).filter((x) => x && x !== namn && !/[()]/.test(x)))];
  const sprak = [...new Set(ii.flatMap((id) => varden(id, "P407")).map((id) => etikett[id]?.sv).filter((x) => x && x !== "flera språk"))];
  if (samma.length || sprak.length) ut[namn] = { wikidata: ii, kon, samma: samma.slice(0, 20), sprak: sprak.slice(0, 12) };
}
skrivJson("wikidata-namn.json", {
  kalla: "Wikidata (förnamnsobjekt: P460 sägs vara detsamma som, P407 språk)",
  licens: "CC0 1.0 (Wikidata)",
  hamtad: new Date().toISOString().slice(0, 10),
  namn: ut,
});
console.log(`\nSparade data/wikidata-namn.json (${Object.keys(ut).length} av ${urval.length} namn)`);
