// Hämtar kommunala öppna data (sources.mjs) till data/raw/kommun/<tema>-<id>.json som normaliserade
// punkter: { hamtad, url, licens, features: [{ lat, lon, props }] }. Respekterar robots.txt, 1 anrop/s/värd.
// Cache: filer < 20 h återanvänds (FORCE=1 tvingar ny hämtning).
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, fetchText, BlockedError, writeJson, readJson, nowIso, parseCsv, unzip } from './lib.mjs';
import { LEK, PARK } from './sources.mjs';
import { toFeatures } from './geo.mjs';

const OUT = path.join(RAW_DIR, 'kommun');
const status = readJson(path.join(RAW_DIR, 'kommun-status.json'), {});

async function load(src) {
  if (src.format === 'rowstore') {
    const rows = [];
    for (let off = 0; ; off += 500) {
      const { text } = await fetchText(`${src.url}?_limit=500&_offset=${off}`);
      const j = JSON.parse(text); rows.push(...(j.results || []));
      if (!j.results?.length || rows.length >= (j.resultCount ?? 0)) break;
    }
    return rows;
  }
  const { text, buf } = await fetchText(src.url, { timeoutMs: 120000 });
  if (src.format === 'zip-geojson') {
    const files = unzip(buf); const name = Object.keys(files).find((n) => /\.(geo)?json$/i.test(n));
    if (!name) throw new Error('ingen json i zip: ' + Object.keys(files).join(','));
    return JSON.parse(files[name].toString('utf8').replace(/^﻿/, ''));
  }
  if (src.format === 'csv') {
    const t = text.replace(/^﻿/, ''); const head = t.split('\n')[0];
    const sep = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',';
    return parseCsv(t, sep);
  }
  return JSON.parse(text.replace(/^﻿/, ''));
}

for (const [tema, list] of [['lek', LEK], ['park', PARK]]) {
  for (const src of list) {
    if (src.skript) continue; // hämtas av eget skript
    const file = path.join(OUT, `${tema}-${src.id}.json`);
    if (!process.env.FORCE && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 20 * 3600e3) { console.log(`[${tema}] ${src.id}: cache`); continue; }
    try {
      const data = await load(src);
      const features = toFeatures(data, src.kommun);
      writeJson(file, { hamtad: nowIso(), url: src.url, licens: src.licens, antal: features.length, features }, false);
      status[`${tema}-${src.id}`] = { ok: true, antal: features.length, hamtad: nowIso() };
      console.log(`[${tema}] ${src.id}: ${features.length} objekt`);
    } catch (e) {
      status[`${tema}-${src.id}`] = { ok: false, blockerad: e instanceof BlockedError, fel: e.message, hamtad: nowIso() };
      console.warn(`[${tema}] ${src.id}: ${e instanceof BlockedError ? 'BLOCKERAD' : 'FEL'} ${e.message}`);
    }
  }
}
writeJson(path.join(RAW_DIR, 'kommun-status.json'), status);
