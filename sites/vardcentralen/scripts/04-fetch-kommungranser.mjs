// Hämtar SCB:s digitala kommungränser (SWEREF 99 TM, licens CC0) och sparar dem som
// kompakt JSON för punkt-i-polygon. Källa:
// https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, politeFetch, unzip, readShp, readDbf, writeJson, nowIso } from './lib.mjs';

const PAGE = 'https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/';
const html = await (await politeFetch(PAGE)).text();
const m = html.match(/href="([^"]*shape_svenska[^"]*\.zip)"/i);
if (!m) throw new Error('Hittade ingen shape-zip på SCB-sidan');
const zipUrl = new URL(m[1], PAGE).href;
console.log('Hämtar', zipUrl);
const outer = unzip(Buffer.from(await (await politeFetch(zipUrl, { timeoutMs: 120000 })).arrayBuffer()));
const kName = Object.keys(outer).find((n) => /^Kommun.*\.zip$/i.test(n));
const inner = unzip(outer[kName]);
const get = (ext) => inner[Object.keys(inner).find((n) => n.toLowerCase().endsWith(ext))];
const cpg = get('.cpg')?.toString().trim().toLowerCase() || '';
const shapes = readShp(get('.shp'));
const recs = readDbf(get('.dbf'), cpg.includes('utf') ? 'utf8' : 'latin1');
console.log('DBF-fält:', Object.keys(recs[0]).join(', '), '| cpg:', cpg || '(saknas)');
const kodF = Object.keys(recs[0]).find((k) => /kod|code/i.test(k));
const namnF = Object.keys(recs[0]).find((k) => /namn|name/i.test(k));
const kommuner = recs.map((r, i) => ({ kod: r[kodF].padStart(4, '0'), namn: r[namnF], bbox: shapes[i].bbox, rings: shapes[i].rings.map((ring) => ring.map(([x, y]) => [Math.round(x), Math.round(y)])) }));
if (kommuner.length !== 290) console.warn(`Varning: ${kommuner.length} kommuner (förväntat 290)`);
writeJson(path.join(RAW_DIR, 'scb-kommuner.json'), { hamtad: nowIso(), kalla: zipUrl, licens: 'CC0 (SCB)', crs: 'EPSG:3006 SWEREF 99 TM (x=E, y=N)', kommuner }, false);
console.log(`Klart: ${kommuner.length} kommuner`);
