// Namnens ursprung och betydelse ur svenska Wikipedia (CC BY-SA 4.0). Hämtar inledningen av artikeln om namnet
// ("X (namn)", "X (förnamn)", … eller "X") och sparar BARA meningar som handlar om ursprung eller betydelse.
// Inget skrivs om: texten citeras ordagrant med källa och licens. Saknas en namnartikel sparas inget.
// Sparar också artikelns Wikidata-objekt (används av 06-wikidata-personer.mjs).
import { hamta, skrivJson, namnurval } from "./lib.mjs";

const API = "https://sv.wikipedia.org/w/api.php";
const urval = namnurval();
const SUFFIX = [" (namn)", " (förnamn)", " (mansnamn)", " (kvinnonamn)", ""];
const sidor = {};
const titlar = urval.flatMap((n) => SUFFIX.map((s) => n + s));
for (let i = 0; i < titlar.length; i += 20) {
  const del = titlar.slice(i, i + 20);
  const q = new URLSearchParams({ action: "query", format: "json", formatversion: "2", redirects: "1", prop: "extracts|pageprops|info",
    exintro: "1", explaintext: "1", exlimit: "20", ppprop: "wikibase_item|disambiguation", inprop: "url", titles: del.join("|") });
  const d = await hamta(`${API}?${q}&maxlag=5`, { json: true, paus: 2000 });
  const omdirigering = Object.fromEntries([...(d.query.normalized ?? []), ...(d.query.redirects ?? [])].map((r) => [r.from, r.to]));
  const per = Object.fromEntries((d.query.pages ?? []).filter((p) => !p.missing).map((p) => [p.title, p]));
  for (const t of del) {
    let m = t; for (let k = 0; k < 3 && omdirigering[m]; k++) m = omdirigering[m];
    if (per[m]) sidor[t] = per[m];
  }
  if (i % 400 === 0) process.stdout.write(`${i} `);
}

const NAMNORD = /(förnamn|mansnamn|kvinnonamn|flicknamn|pojknamn|\bnamn\b|namnet)/i;
const URSPRUNG = /(betyd|ursprung|härstam|härled|bildat|bildad|sammansatt|kortform|smeknamnsform|form av|variant av|kommer från|av (forn|grek|latin|hebr|tysk|fransk|engelsk|keltisk|arame|nordisk|isländ|slavisk|ryska|arabisk|persisk|germansk|urnordisk|fornsvensk)|grekiska|latinska|hebreiska|fornnordiska|tyska|franska|engelska|keltiska|arameiska|arabiska|germanska)/i;
const STATISTIK = /(\d{4}|personer|bärare|namnsdag|SCB|statistik|vanligaste|procent|%)/i;

const ut = {};
for (const n of urval) {
  const t = SUFFIX.map((s) => n + s).find((t) => sidor[t] && !sidor[t].pageprops?.disambiguation && NAMNORD.test(sidor[t].extract ?? ""));
  if (!t) continue;
  const p = sidor[t];
  const meningar = (p.extract ?? "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ])/).map((s) => s.trim()).filter(Boolean);
  const valda = meningar.filter((s) => URSPRUNG.test(s) && !STATISTIK.test(s)).slice(0, 3);
  ut[n] = { titel: p.title, url: p.fullurl, wikidata: p.pageprops?.wikibase_item ?? null, ursprung: valda.join(" ") || null };
}
skrivJson("wikipedia-namn.json", {
  kalla: "Svenska Wikipedia, artiklar om respektive förnamn",
  licens: "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.sv)",
  hamtad: new Date().toISOString().slice(0, 10),
  namn: ut,
});
const med = Object.values(ut).filter((x) => x.ursprung).length;
console.log(`\nSparade data/wikipedia-namn.json: ${Object.keys(ut).length} artiklar, ${med} med ursprung/betydelse (av ${urval.length} namn)`);
