// Downloads SCB geodata used for reverse lookup (point -> kommun, point -> tätort):
//   - DeSO 2025 polygons (each carries kommunkod)  -> data/raw/geo/deso_2025.json
//   - Tätorter 2023 polygons (name + kommun)       -> data/raw/geo/tatorter_2023.json
// Source: SCB GeoServer WFS (https://geodata.scb.se/geoserver/stat/wfs), open data.
// Cached for 30 days (boundaries change at most yearly). Force with --refresh-geo.
import fs from 'node:fs';
import path from 'node:path';
import { RAW, fetchJson, argv } from './lib.mjs';

const GEO = path.join(RAW, 'geo');
fs.mkdirSync(GEO, { recursive: true });
const WFS = 'https://geodata.scb.se/geoserver/stat/wfs';

const r5 = (n) => Math.round(n * 1e5) / 1e5;
function roundGeom(g) {
  const rr = (ring) => ring.map(([x, y]) => [r5(x), r5(y)]);
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map(rr) };
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(rr)) };
  return g;
}

async function layer(typeName, props, outFile) {
  const file = path.join(GEO, outFile);
  if (fs.existsSync(file) && !argv.has('--refresh-geo')) {
    const age = (Date.now() - fs.statSync(file).mtimeMs) / 86400000;
    if (age < 30) {
      console.log(`  ${outFile}: cached (${age.toFixed(1)} d)`);
      return;
    }
  }
  const features = [];
  const page = 500;
  for (let start = 0; ; start += page) {
    const url = `${WFS}?service=WFS&version=1.0.0&request=GetFeature&typeName=${typeName}` +
      `&maxFeatures=${page}&startIndex=${start}&propertyName=${props.join(',')},sp_geometry` +
      `&outputFormat=application/json&srsName=EPSG:4326&sortBy=objectid`;
    const j = await fetchJson(url, { timeoutMs: 300000 });
    for (const f of j.features) {
      const p = {};
      for (const k of props) p[k] = f.properties[k];
      features.push({ type: 'Feature', properties: p, geometry: roundGeom(f.geometry) });
    }
    process.stdout.write(`\r  ${typeName}: ${features.length}/${j.totalFeatures}`);
    if (j.features.length < page) break;
  }
  process.stdout.write('\n');
  fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', fetched: new Date().toISOString(), features }));
}

console.log('02 geo (SCB)');
await layer('stat:DeSO_2025', ['kommunkod', 'desokod'], 'deso_2025.json');
await layer('stat:Tatorter_2023', ['tatortskod', 'tatort', 'kommun', 'kommunnamn', 'bef'], 'tatorter_2023.json');
