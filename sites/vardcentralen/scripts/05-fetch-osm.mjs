// Hämtar vårdcentraler ur OpenStreetMap via Overpass API. Används bara som reserv för
// koordinater/webb när 1177 saknar uppgiften. Data © OpenStreetMap-bidragsgivare, ODbL 1.0.
// Speglar provas i tur och ordning. Obs: overpass-api.de svarar 406 på "Mozilla"-UA.
import path from 'node:path';
import { RAW_DIR, politeFetch, writeJson, nowIso } from './lib.mjs';

const NAME = '[Vv]årdcentral|[Hh]älsocentral|[Hh]usläkar|[Ff]amiljeläkar|[Vv]årdcentrum|[Ll]äkarhus|[Nn]ärhälsan|[Dd]istriktsläkar';
const q = `[out:json][timeout:300];
area["ISO3166-1"="SE"][admin_level=2]->.se;
(
  nwr["healthcare"="centre"](area.se);
  nwr["amenity"~"^(clinic|doctors)$"]["name"~"${NAME}"](area.se);
  nwr["healthcare"~"^(clinic|doctor)$"]["name"~"${NAME}"](area.se);
);
out center tags;`;
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
let data = null, used = null;
for (const ep of MIRRORS) {
  try {
    console.log('Provar', ep);
    const r = await politeFetch(ep, { method: 'POST', body: new URLSearchParams({ data: q }), timeoutMs: 330000, retries: 1, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data = await r.json(); used = ep; break;
  } catch (e) { console.warn(`  ! ${ep}: ${e.message}`); }
}
if (!data) throw new Error('Ingen Overpass-spegel svarade – behåller tidigare osm-fil');
const els = data.elements.map((e) => ({ osm: `${e.type}/${e.id}`, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, tags: e.tags }));
writeJson(path.join(RAW_DIR, 'osm-vardcentraler.json'), { hamtad: nowIso(), kalla: used, osm_base: data.osm3s?.timestamp_osm_base, licens: 'ODbL 1.0 – © OpenStreetMap-bidragsgivare', element: els });
console.log(`Klart: ${els.length} OSM-objekt från ${used}`);
