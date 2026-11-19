// Fetches OpenStreetMap amenity=pharmacy (plus healthcare=pharmacy) for Sweden via Overpass.
// OSM data © OpenStreetMap contributors, ODbL 1.0 — attribution required, share-alike on the derived database.
// Sweden is split into latitude bands (one area query for all of Sweden is often rejected by busy servers);
// each band is intersected with the Sweden admin area (ISO3166-1=SE), so Norway/Denmark/Finland/Baltics are excluded.
import path from 'node:path';
import { RAW, politeFetch, writeJson, sleep } from './lib.mjs';

// overpass-api.de answers 406 to browser-like "Mozilla/5.0 ..." UAs, so Overpass gets a plain app UA (see OVERPASS_UA).
const OVERPASS_UA = 'apotek-dataset/1.0 (nightly open-data build)';
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
// [south, west, north, east] bands covering Sweden
const BANDS = [];
const lats = [55.0, 56.0, 57.0, 57.8, 58.6, 59.2, 59.6, 60.4, 62.0, 64.0, 66.0, 69.2];
for (let i = 0; i < lats.length - 1; i++) BANDS.push([lats[i], 10.5, lats[i + 1], 24.2]);

async function query(bbox) {
  const b = bbox.join(',');
  const q = `[out:json][timeout:180];area["ISO3166-1"="SE"][admin_level=2]->.se;` +
    `(nwr["amenity"="pharmacy"](${b})(area.se);nwr["healthcare"="pharmacy"](${b})(area.se););out center tags;`;
  let lastErr;
  for (const m of MIRRORS) {
    try {
      const res = await politeFetch(m, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': OVERPASS_UA },
        body: 'data=' + encodeURIComponent(q),
      }, { retries: 1, timeoutMs: 150000, minGapMs: 5000 });
      const txt = await res.text();
      if (!res.ok || !txt.startsWith('{')) throw new Error(`${res.status} ${txt.slice(0, 120)}`);
      const j = JSON.parse(txt);
      if (j.remark && /runtime error|timed out/i.test(j.remark)) throw new Error(j.remark);
      return { mirror: m, elements: j.elements, osm3s: j.osm3s };
    } catch (e) {
      lastErr = e;
      console.warn(`  ${m} failed for ${b}: ${e.message}`);
      await sleep(2000);
    }
  }
  throw lastErr;
}

const all = new Map();
let meta;
for (const band of BANDS) {
  const r = await query(band);
  meta = r.osm3s;
  for (const el of r.elements) all.set(`${el.type}/${el.id}`, el);
  console.log(`band ${band.join(',')}: ${r.elements.length} via ${new URL(r.mirror).host}`);
}
const elements = [...all.values()].map((el) => ({
  osm_id: `${el.type}/${el.id}`,
  lat: el.lat ?? el.center?.lat,
  lon: el.lon ?? el.center?.lon,
  tags: el.tags || {},
}));
if (elements.length < 800) throw new Error(`OSM returned only ${elements.length} — aborting`);
writeJson(path.join(RAW, 'osm.json'), {
  fetched: new Date().toISOString(),
  timestamp_osm_base: meta?.timestamp_osm_base,
  license: 'ODbL 1.0 — © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)',
  elements,
});
console.log(`OSM: ${elements.length} pharmacy elements`);
