// Geocodes pharmacies that got no coordinates from a chain locator or OSM, using OSM Nominatim.
// Nominatim usage policy: max 1 request/second, identify the application, cache results — all done here.
// Results are cached in data/raw/geocode-cache.json and never re-queried, so nightly runs only look up new addresses.
// Geocoded data is derived from OSM (ODbL).
import path from 'node:path';
import { RAW, DATA, politeFetch, readJson, writeJson } from './lib.mjs';

const UA = 'apotek-dataset/1.0 (nightly open-data build)';
const cacheFile = path.join(RAW, 'geocode-cache.json');
const cache = readJson(cacheFile, {});
const lv = readJson(path.join(RAW, 'lv.json')).documents;
const merged = readJson(path.join(DATA, 'apotek.json'), []);
const missing = new Set(merged.filter((x) => x.lat == null).map((x) => x.id));
const pc = (s) => String(s ?? '').replace(/\D/g, '');
const key = (d) => `${d.streetAddress || ''}|${pc(d.postalcode)}|${d.city || ''}`;
const MAX = Number(process.env.GEOCODE_MAX || 400);

async function nominatim(params) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ format: 'jsonv2', countrycodes: 'se', limit: '1', addressdetails: '0', ...params });
  const res = await politeFetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, { minGapMs: 1100 });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const j = await res.json();
  return j[0] ? { lat: +j[0].lat, lon: +j[0].lon, display: j[0].display_name, osm_type: j[0].osm_type, category: j[0].category, type: j[0].type } : null;
}
// "Allum 324, Nils Henrikssons väg 3" -> try each comma part that contains a house number
function streetVariants(s) {
  const parts = String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const withNum = parts.filter((p) => /\d/.test(p) && /[a-zåäö]{3}/i.test(p));
  return [...new Set([...withNum, ...parts])].slice(0, 2);
}

let done = 0, hit = 0;
for (const d of lv) {
  if (!missing.has(d.identifier)) continue;
  const k = key(d);
  if (cache[k]) continue;
  if (done >= MAX) break;
  let r = null, precision = null;
  try {
    for (const st of streetVariants(d.streetAddress)) {
      r = await nominatim({ street: st, postalcode: pc(d.postalcode), city: d.city }); done++;
      if (!r) { r = await nominatim({ street: st, city: d.city }); done++; }
      if (r) { precision = 'adress'; break; }
    }
    if (!r) { r = await nominatim({ postalcode: pc(d.postalcode), city: d.city }); done++; if (r) precision = 'postnummer'; }
  } catch (e) { console.warn(`geocode failed for ${d.name}: ${e.message}`); break; }
  cache[k] = r ? { ...r, precision, at: new Date().toISOString().slice(0, 10) } : { lat: null, at: new Date().toISOString().slice(0, 10) };
  if (r) hit++;
  if (done % 20 === 0) writeJson(cacheFile, cache);
}
writeJson(cacheFile, cache);
console.log(`geocode: ${missing.size} without coordinates, ${done} requests, ${hit} new hits`);
