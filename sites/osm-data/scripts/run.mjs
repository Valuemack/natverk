// Nightly entry point: get raw data (Overpass, or Geofabrik PBF as fallback) and build the datasets.
// Usage: node scripts/run.mjs [--source=auto|overpass|pbf] [--pbf=<file>]
//   auto (default): quick Overpass health check; if it answers, run fetch.mjs --fresh, else (or if that
//   fails) download/parse the Geofabrik extract with extract-pbf.mjs. Then build.mjs.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, ENDPOINTS, log } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const source = args.source || 'auto';
const node = (script, extra = [], heap = false) => {
  const r = spawnSync(process.execPath, [...(heap ? ['--max-old-space-size=6144'] : []), path.join(ROOT, 'scripts', script), ...extra], { stdio: 'inherit', cwd: ROOT });
  return r.status === 0;
};
async function overpassAlive() {
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent('[out:json][timeout:20];node(1);out;'), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'osm-dataset-builder/1.0' }, signal: AbortSignal.timeout(40_000) });
      const t = await r.text();
      if (r.ok && t.trimStart().startsWith('{')) { log(`Overpass OK: ${new URL(url).host}`); process.env.OVERPASS_URL = url; return true; }
    } catch {}
  }
  return false;
}

const t0 = Date.now();
let ok = false;
if (source === 'overpass' || (source === 'auto' && (await overpassAlive()))) ok = node('fetch.mjs', ['--fresh']);
if (!ok && source !== 'overpass') {
  log('using Geofabrik PBF');
  ok = node('extract-pbf.mjs', args.pbf ? [`--pbf=${args.pbf}`] : ['--download'], true);
}
if (!ok) { log('no raw data source succeeded'); process.exit(1); }
if (!node('build.mjs')) process.exit(1);
log(`run done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
