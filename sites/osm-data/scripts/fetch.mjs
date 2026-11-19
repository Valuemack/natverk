// Download raw OSM data for Sweden from Overpass into data/raw/*.json.
// Usage: node scripts/fetch.mjs [--fresh] [--only=name1,name2]
//   Raw files younger than MAX_AGE_H (env, default 12) are reused, so an interrupted run resumes.
import fs from 'node:fs';
import path from 'node:path';
import { overpass, writeJSON, RAW, log, sleep } from './lib.mjs';

const args = process.argv.slice(2);
const FRESH = args.includes('--fresh');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const MAX_AGE_H = +(process.env.MAX_AGE_H || 12);

const SE = 'area["ISO3166-1"="SE"][admin_level=2]->.se;';
const HEAD = (t = 900) => `[out:json][timeout:${t}][maxsize:2000000000];`;
// named highways usable for "Lekplats vid <gata>" names
const STREET = '[highway~"^(primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|road|primary_link|secondary_link|tertiary_link|footway|cycleway|path|track)$"][name]';
const SWIM_NAME = '[name~"simhall|badhus|simhallsbad|äventyrsbad|inomhusbad|simarena|simstadion|kallbadhus|varmbadhus",i]';

const QUERIES = {
  admin: `${HEAD()}${SE}rel["boundary"="administrative"]["admin_level"~"^(4|7)$"](area.se);out geom;`,
  places: `${HEAD()}${SE}node[place~"^(city|town|village|suburb|hamlet|quarter|neighbourhood)$"][name](area.se);out;`,
  fuel: `${HEAD()}${SE}nwr[amenity=fuel](area.se);out tags center;`,
  parking: `${HEAD()}${SE}(
    nwr[amenity=parking][name](area.se);
    nwr[amenity=parking][capacity](area.se);
    nwr[amenity=parking][parking~"multi-storey|underground|rooftop"](area.se);
  );out tags center;`,
  parking_streets: `${HEAD()}${SE}(
    nwr[amenity=parking][!name][capacity](area.se);
    nwr[amenity=parking][!name][parking~"multi-storey|underground|rooftop"](area.se);
  )->.p;way(around.p:120)${STREET};out tags geom;`,
  playgrounds: `${HEAD()}${SE}nwr[leisure=playground](area.se);out geom;`,
  playground_equipment: `${HEAD()}${SE}nwr[playground](area.se);out tags center;`,
  playground_streets: `${HEAD()}${SE}nwr[leisure=playground][!name](area.se)->.p;way(around.p:120)${STREET};out tags geom;`,
  swim_candidates: `${HEAD()}${SE}(
    nwr[leisure=sports_centre][sport~"swimming"](area.se);
    nwr[leisure=sports_hall][sport~"swimming"](area.se);
    nwr[building][sport~"swimming"](area.se);
    nwr[leisure=water_park](area.se);
    nwr[amenity=public_bath](area.se);
    nwr[leisure=swimming_pool][indoor=yes](area.se);
    nwr[leisure=swimming_pool][building](area.se);
    nwr[leisure=swimming_pool][name](area.se);
    nwr[building=swimming_pool](area.se);
    nwr[building]${SWIM_NAME}(area.se);
    nwr[leisure]${SWIM_NAME}(area.se);
    nwr[amenity]${SWIM_NAME}(area.se);
  );out geom;`,
  swim_pools: `${HEAD()}${SE}nwr[leisure=swimming_pool](area.se);out tags center;`,
  hotels: `${HEAD()}${SE}(nwr[tourism~"^(hotel|motel|hostel|guest_house|apartment|camp_site|caravan_site)$"](area.se);nwr[leisure=resort](area.se););out geom;`,
};

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const t0 = Date.now();
  let first = true;
  for (const [name, q] of Object.entries(QUERIES)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const file = path.join(RAW, `${name}.json`);
    if (!FRESH && fs.existsSync(file) && (Date.now() - fs.statSync(file).mtimeMs) / 3.6e6 < MAX_AGE_H) {
      log(`${name}: cached (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
      continue;
    }
    if (!first) await sleep(10_000); // be polite: sequential queries with a pause
    first = false;
    log(`${name}: querying Overpass...`);
    const json = await overpass(q, { label: name });
    writeJSON(file, { fetched: new Date().toISOString(), osm_base: json.osm3s?.timestamp_osm_base, copyright: json.osm3s?.copyright, elements: json.elements });
  }
  log(`fetch done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}

main().catch((e) => { console.error(e); process.exit(1); });
