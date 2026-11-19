// Hämtar öppna datamängder (filer, inga sidor):
//  1. Vårdbetyg: vardcentraler.csv – register över öppna vårdcentraler (HSA-id, kommunkod,
//     huvudman, kedja, vårdgivare). Licens CC BY 4.0. https://vardbetyg.se/data/dcat.rdf
//  2. Västra Götalandsregionen: Vårdcentraler i Vårdval vårdcentral (HSA-id, företag, adress,
//     SWEREF 99 TM-koordinater). Licens CC0. Hittad via dataportal.se.
// Blekinge (oppnadata.regionblekinge.se) har en datamängd "Vårdcentraler" men värden
// gick inte att slå upp (DNS) 2026-11-19, därför ingår den inte.
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, politeFetch, ensureDir, writeJson, nowIso, parseCsv } from './lib.mjs';

ensureDir(RAW_DIR);
const sources = [
  { id: 'vardbetyg', url: 'https://vardbetyg.se/data/vardcentraler.csv', file: 'vardbetyg-vardcentraler.csv', licens: 'CC BY 4.0', minRows: 1000 },
  // VGR:s EntryScape-katalog: dataset .../resource/46, CSV-fil .../resource/47
  { id: 'vgr', url: 'https://vgregion.entryscape.net/store/7/resource/47', file: 'vgr-vardcentraler.csv', licens: 'CC0 1.0', minRows: 150 },
];
const meta = {};
for (const s of sources) {
  try {
    const r = await politeFetch(s.url, { minIntervalMs: 1000 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const rows = parseCsv(text);
    if (rows.length < s.minRows) throw new Error(`bara ${rows.length} rader – behåller tidigare fil`);
    fs.writeFileSync(path.join(RAW_DIR, s.file), text);
    meta[s.id] = { url: s.url, licens: s.licens, rader: rows.length, hamtad: nowIso() };
    console.log(`${s.id}: ${rows.length} rader`);
  } catch (e) {
    console.warn(`! ${s.id}: ${e.message}`);
    meta[s.id] = { url: s.url, licens: s.licens, fel: e.message, hamtad: nowIso() };
  }
}
writeJson(path.join(RAW_DIR, 'oppna-data-meta.json'), meta);
