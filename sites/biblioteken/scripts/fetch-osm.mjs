// Fetch Swedish amenity=library from OpenStreetMap via Overpass, grouped by kommun polygon.
// Data (c) OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
// overpass-api.de fails TLS from some networks, so several public mirrors are tried in order.
// Output: data/raw/osm-libraries.json  { fetched, endpoint, osm_base, kommuner: [{code,name,...}], libraries: [{..., kommun_code}] }
import path from 'node:path';
import { politeFetch, writeJSON, RAW } from './lib.mjs';

const ENDPOINTS = (process.env.OVERPASS_URLS || [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
].join(',')).split(',');

// For each kommun (admin_level=7) area: print the area's tags, then every library inside it.
// The output is sequential, so each library belongs to the most recently printed area.
const QUERY = `[out:json][timeout:900];
area["ISO3166-1"="SE"][admin_level=2]->.se;
rel(area.se)["boundary"="administrative"]["admin_level"="7"];
map_to_area->.kommuner;
foreach.kommuner->.k(
  .k out tags;
  nwr(area.k)["amenity"="library"];
  out center tags;
);`;

let json, used;
for (const ep of ENDPOINTS) {
  try {
    console.log(`trying ${ep}`);
    const res = await politeFetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(QUERY),
    }, { retries: 2, timeoutMs: 900000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
    if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(json.remark);
    used = ep;
    break;
  } catch (e) {
    console.warn(`  failed: ${e.message}`);
  }
}
if (!json) throw new Error('all Overpass endpoints failed');

const kommuner = [];
const libraries = [];
let cur = null;
for (const el of json.elements) {
  if (el.type === 'area') {
    const t = el.tags || {};
    cur = {
      code: t['ref:se:kommun:kod'] || t['ref:scb'] || null,
      name: (t.name || '').replace(/ kommun$/, ''),
      osm_name: t.name || null,
      area_id: el.id,
    };
    kommuner.push(cur);
    continue;
  }
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  libraries.push({ osm: `${el.type}/${el.id}`, lat, lon, tags: el.tags || {}, kommun_code: cur?.code ?? null, kommun_name: cur?.name ?? null });
}
if (kommuner.length < 280 || libraries.length < 500) throw new Error(`suspicious result: ${kommuner.length} kommuner, ${libraries.length} libraries`);
writeJSON(path.join(RAW, 'osm-libraries.json'), {
  fetched: new Date().toISOString(), endpoint: used, osm_base: json.osm3s?.timestamp_osm_base,
  license: 'ODbL 1.0, (c) OpenStreetMap contributors', kommuner, libraries,
}, false);
console.log(`wrote ${libraries.length} OSM library elements in ${kommuner.length} kommuner (via ${used})`);
