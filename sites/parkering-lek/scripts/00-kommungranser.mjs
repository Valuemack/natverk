// Kommungränser för punkt-i-polygon (SCB digitala gränser, SWEREF 99 TM, CC0).
// Kopierar ../vardcentralen/data/raw/scb-kommuner.json (läses, ändras aldrig) om den finns,
// annars hämtas SCB:s shape-zip direkt (samma logik som vardcentralen/scripts/04-fetch-kommungranser.mjs).
// Län per kommunkod tas från ../osm-data/data/kommuner.json (läses).
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, SITE_DIR, fetchText, unzip, readShp, readDbf, writeJson, readJson, nowIso } from './lib.mjs';

const OUT = path.join(RAW_DIR, 'scb-kommuner.json');
const SIBLING = path.resolve(SITE_DIR, '..', 'vardcentralen', 'data', 'raw', 'scb-kommuner.json');
const OSM_KOMMUNER = path.resolve(SITE_DIR, '..', 'osm-data', 'data', 'kommuner.json');

if (fs.existsSync(OUT) && !process.env.FORCE) console.log('scb-kommuner.json finns redan');
else if (fs.existsSync(SIBLING)) { fs.copyFileSync(SIBLING, OUT); console.log('Kopierade kommungränser från vardcentralen (läsning)'); }
else {
  const PAGE = 'https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/';
  const { text: html } = await fetchText(PAGE);
  const m = html.match(/href="([^"]*shape_svenska[^"]*\.zip)"/i);
  if (!m) throw new Error('Hittade ingen shape-zip på SCB-sidan');
  const zipUrl = new URL(m[1], PAGE).href;
  const { buf } = await fetchText(zipUrl, { timeoutMs: 180000 });
  const outer = unzip(buf);
  const inner = unzip(outer[Object.keys(outer).find((n) => /^Kommun.*\.zip$/i.test(n))]);
  const get = (ext) => inner[Object.keys(inner).find((n) => n.toLowerCase().endsWith(ext))];
  const cpg = get('.cpg')?.toString().trim().toLowerCase() || '';
  const shapes = readShp(get('.shp')); const recs = readDbf(get('.dbf'), cpg.includes('utf') ? 'utf8' : 'latin1');
  const kodF = Object.keys(recs[0]).find((k) => /kod|code/i.test(k)); const namnF = Object.keys(recs[0]).find((k) => /namn|name/i.test(k));
  const kommuner = recs.map((r, i) => ({ kod: r[kodF].padStart(4, '0'), namn: r[namnF], bbox: shapes[i].bbox, rings: shapes[i].rings.map((ring) => ring.map(([x, y]) => [Math.round(x), Math.round(y)])) }));
  writeJson(OUT, { hamtad: nowIso(), kalla: zipUrl, licens: 'CC0 (SCB)', crs: 'EPSG:3006', kommuner }, false);
  console.log(`Hämtade ${kommuner.length} kommuner från SCB`);
}
const lan = readJson(OSM_KOMMUNER, []).map(({ kommunkod, namn, lan }) => ({ kommunkod, namn, lan }));
if (lan.length) writeJson(path.join(RAW_DIR, 'kommun-lan.json'), lan);
console.log(`kommun-lan.json: ${lan.length} kommuner`);
