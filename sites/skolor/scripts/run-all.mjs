// Runs the whole pipeline in order. Usage: node scripts/run-all.mjs [--full] [--cache] [--refresh-geo]
// Each step is a separate process so one failing source does not corrupt the others;
// outputs are written atomically, so a failed step leaves the previous file in place.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { SCRIPTS_DIR } from './lib.mjs';

const steps = ['01-kommuner.mjs', '02-geo.mjs', '03-kommunstatistik.mjs', '04-komvux.mjs', '05-forskolor.mjs', '06-validate.mjs'];
const args = process.argv.slice(2);
const failed = [];
for (const s of steps) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(SCRIPTS_DIR, s), ...args], { stdio: 'inherit' }); // node:sqlite (GeoPackage) is experimental in Node 24
  console.log(`== ${s}: ${r.status === 0 ? 'OK' : 'FEL (' + r.status + ')'} på ${Math.round((Date.now() - t0) / 1000)} s\n`);
  if (r.status !== 0) {
    failed.push(s);
    if (s === '01-kommuner.mjs' || s === '02-geo.mjs') break; // later steps depend on these
  }
}
if (failed.length) {
  console.error('Misslyckade steg:', failed.join(', '));
  process.exit(1);
}
