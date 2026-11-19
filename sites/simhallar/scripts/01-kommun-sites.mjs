// Official website for each of the 290 kommuner, from Wikidata (CC0): P525 = SCB kommunkod, P856 = official website.
// Fallback: https://www.<slug>.se. Output: data/raw/kommun-sites.json
import path from 'node:path';
import { RAW_DIR, OSM_KOMMUNER, readJson, writeJson, slugify, UA, nowIso } from './lib.mjs';

const kommuner = readJson(OSM_KOMMUNER);
const q = `SELECT ?kod ?site WHERE { ?k wdt:P31 wd:Q127448; wdt:P525 ?kod. OPTIONAL { ?k wdt:P856 ?site } }`;
let wd = {};
try {
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { 'user-agent': UA, accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  for (const b of j.results.bindings) {
    const kod = b.kod.value.padStart(4, '0'); const s = b.site?.value;
    if (s && (!wd[kod] || s.length < wd[kod].length)) wd[kod] = s;
  }
  console.log('Wikidata:', Object.keys(wd).length, 'kommuner med webbplats');
} catch (e) { console.warn('Wikidata misslyckades:', e.message); }

const prev = readJson(path.join(RAW_DIR, 'kommun-sites.json'), { kommuner: [] });
const prevMap = Object.fromEntries(prev.kommuner.map((k) => [k.kommunkod, k]));
const out = kommuner.map((k) => {
  let site = wd[k.kommunkod] || prevMap[k.kommunkod]?.site || `https://www.${slugify(k.namn).replace(/-/g, '')}.se/`;
  site = new URL(site.replace(/^http:/, "https:")).origin + "/";
  return { kommunkod: k.kommunkod, namn: k.namn, lan: k.lan, site, kalla: wd[k.kommunkod] ? 'wikidata' : 'gissning' };
});
writeJson(path.join(RAW_DIR, 'kommun-sites.json'), { hamtad: nowIso(), kalla: 'Wikidata P856 (CC0)', kommuner: out });
console.log('Skrev', out.length, 'kommuner;', out.filter((k) => k.kalla !== 'wikidata').length, 'gissade');
