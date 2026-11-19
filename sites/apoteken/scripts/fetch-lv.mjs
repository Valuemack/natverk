// Fetches Läkemedelsverket's register of pharmacies with a permit ("Sök apotek som har tillstånd").
// Source page: https://www.lakemedelsverket.se/sv/handel-med-lakemedel/apotek/sok-apotek-som-har-tillstand
// The page is an Angular app that calls the JSON endpoint below (not disallowed by robots.txt).
import path from 'node:path';
import { RAW, politeFetch, writeJson } from './lib.mjs';

const BASE = 'https://www.lakemedelsverket.se/api/pharmacy/search';
const PAGE = 500;

const docs = [];
let total = Infinity;
for (let skip = 0; skip < total; skip += PAGE) {
  const url = `${BASE}?take=${PAGE}&skip=${skip}&sort=name&ascending=true`;
  const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`LV ${res.status} ${url}`);
  const j = await res.json();
  total = j.totalMatching;
  docs.push(...j.documents);
  if (!j.documents.length) break;
}
const uniq = [...new Map(docs.map((d) => [d.identifier, d])).values()];
if (uniq.length < 1000) throw new Error(`LV returned only ${uniq.length} pharmacies — aborting so old data is kept`);
writeJson(path.join(RAW, 'lv.json'), { fetched: new Date().toISOString(), source: BASE, total, documents: uniq });
console.log(`LV: ${uniq.length} pharmacies (totalMatching ${total})`);
