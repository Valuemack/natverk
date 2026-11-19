// Point-in-polygon check: which kommun (OSM admin_level=7 boundary) contains each bibdb coordinate?
// Used by build.mjs to validate bibdb's municipality_code and to fill missing kommun.
// Data (c) OpenStreetMap contributors, ODbL 1.0.
// Input: data/raw/bibdb-se.json   Output: data/raw/osm-isin.json { results: { <sigel>: { kod, namn } } }
import path from 'node:path';
import { politeFetch, readJSON, writeJSON, RAW } from './lib.mjs';

const ENDPOINTS = (process.env.OVERPASS_URLS || [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
].join(',')).split(',');

const libs = readJSON(path.join(RAW, 'bibdb-se.json')).libraries
  .filter((l) => /^folk|skolbib/.test(l.library_type || '') && l.alive && l.latitude > 55 && l.longitude > 10);

const BATCH = 400;
const results = {};
for (let i = 0; i < libs.length; i += BATCH) {
  const chunk = libs.slice(i, i + BATCH);
  const body = '[out:json][timeout:600];\n' + chunk.map((l) =>
    `make m sigel="${l.sigel.replace(/"/g, '')}";out;is_in(${l.latitude},${l.longitude})->.a;area.a["admin_level"="7"]["boundary"="administrative"];out tags;`).join('\n');
  let json;
  for (const ep of ENDPOINTS) {
    try {
      const res = await politeFetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(body) }, { retries: 2, timeoutMs: 600000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
      break;
    } catch (e) { console.warn(`  ${ep}: ${e.message}`); }
  }
  if (!json) throw new Error('all Overpass endpoints failed');
  let cur = null;
  for (const el of json.elements) {
    if (el.type === 'm') { cur = el.tags.sigel; continue; }
    if (el.type === 'area' && cur && !results[cur]) {
      results[cur] = { kod: el.tags['ref:se:kommun:kod'] || el.tags['ref:scb'] || null, namn: el.tags.name || null };
    }
  }
  console.log(`is_in ${Math.min(i + BATCH, libs.length)}/${libs.length}`);
}
writeJSON(path.join(RAW, 'osm-isin.json'), { fetched: new Date().toISOString(), license: 'ODbL 1.0, (c) OpenStreetMap contributors', results }, false);
console.log(`wrote kommun polygon lookups for ${Object.keys(results).length} coordinates`);
