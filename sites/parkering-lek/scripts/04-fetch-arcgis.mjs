// Hämtar kurerade kommunala ArcGIS REST-lager (sources.mjs: ARCGIS) som esri-JSON i WGS84 (outSR=4326),
// paginerat, och sparar normaliserade punkter i data/raw/kommun/<tema>-<id>.json (samma format som 02).
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, fetchText, BlockedError, writeJson, readJson, nowIso } from './lib.mjs';
import { ARCGIS } from './sources.mjs';
import { toFeatures } from './geo.mjs';

const OUT = path.join(RAW_DIR, 'kommun');
const status = readJson(path.join(RAW_DIR, 'kommun-status.json'), {});
const getJson = async (u) => { const j = JSON.parse((await fetchText(u, { timeoutMs: 90000 })).text); if (j.error) throw new Error(`ArcGIS-fel ${j.error.code}: ${j.error.message}`); return j; };

async function layersOf(src) {
  if (/\/(MapServer|FeatureServer)\/\d+$/.test(src.url)) return [src.url];
  const j = await getJson(`${src.url}?f=json`);
  return (j.layers || []).filter((l) => src.lager.test(l.name) && !l.subLayerIds).map((l) => `${src.url}/${l.id}`);
}
async function queryLayer(lu) {
  const meta = await getJson(`${lu}?f=json`);
  const page = Math.min(meta.maxRecordCount || 1000, 2000);
  const features = []; let geometryType = meta.geometryType;
  if (meta.advancedQueryCapabilities?.supportsPagination !== false) {
    for (let off = 0; off < 200000; off += page) {
      const j = await getJson(`${lu}/query?where=1%3D1&outFields=*&outSR=4326&returnGeometry=true&f=json&resultOffset=${off}&resultRecordCount=${page}`);
      features.push(...(j.features || [])); geometryType = j.geometryType || geometryType;
      if (!(j.features?.length) || (!j.exceededTransferLimit && j.features.length < page)) break;
    }
  } else {
    const ids = (await getJson(`${lu}/query?where=1%3D1&returnIdsOnly=true&f=json`)).objectIds || [];
    for (let i = 0; i < ids.length; i += page) {
      const j = await getJson(`${lu}/query?objectIds=${ids.slice(i, i + page).join(',')}&outFields=*&outSR=4326&f=json`);
      features.push(...(j.features || []));
    }
  }
  return { name: meta.name, features, geometryType };
}

for (const src of ARCGIS) {
  const file = path.join(OUT, `${src.tema}-${src.id}.json`);
  if (!process.env.FORCE && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 20 * 3600e3) { console.log(`[${src.tema}] ${src.id}: cache`); continue; }
  try {
    const layers = await layersOf(src);
    if (!layers.length) throw new Error('inget matchande lager');
    let all = [];
    for (const lu of layers) {
      const { name, features } = await queryLayer(lu);
      const pts = toFeatures({ spatialReference: { wkid: 4326 }, features }, src.kommun).map((f) => ({ ...f, props: { ...f.props, _lager: name } }));
      all = all.concat(pts);
    }
    writeJson(file, { hamtad: nowIso(), url: src.url, lager: layers, licens: src.licens, antal: all.length, features: all }, false);
    status[`${src.tema}-${src.id}`] = { ok: true, antal: all.length, hamtad: nowIso() };
    console.log(`[${src.tema}] ${src.id}: ${all.length} objekt (${layers.length} lager)`);
  } catch (e) {
    status[`${src.tema}-${src.id}`] = { ok: false, blockerad: e instanceof BlockedError, fel: e.message, hamtad: nowIso() };
    console.warn(`[${src.tema}] ${src.id}: ${e instanceof BlockedError ? 'BLOCKERAD' : 'FEL'} ${e.message}`);
  }
}
writeJson(path.join(RAW_DIR, 'kommun-status.json'), status);
