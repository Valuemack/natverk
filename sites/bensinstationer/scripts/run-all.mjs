// Nattlig körning för bensinstationer.nu.
//   node scripts/run-all.mjs              # kedjornas stationssök + listpriser + sammanslagning (~1-2 min med varm cache, ~20 min kall)
//   node scripts/run-all.mjs --priser     # bara listpriser -> data/listpriser.json (3 anrop; kan köras flera gånger/dygn)
//   node scripts/run-all.mjs --merge      # bara sammanslagning (t.ex. efter att osm-data byggts om)
//   node scripts/run-all.mjs circlek okq8 # bara valda kedjor + sammanslagning
// En källa som fallerar behåller föregående data/raw/<källa>.json, så resten av körningen fortsätter.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, log } from './lib.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const kedjor = args.filter((a) => !a.startsWith('--'));

function run(script, extra = []) {
  log(`== ${script} ${extra.join(' ')}`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...extra], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) log(`!! ${script} avslutades med kod ${r.status}`);
  return r.status === 0;
}

const t0 = Date.now();
if (flags.has('--priser')) {
  run('fetch-priser.mjs');
} else if (flags.has('--merge')) {
  run('merge.mjs');
} else {
  run('fetch-kedjor.mjs', kedjor);
  if (!kedjor.length) run('fetch-priser.mjs');
  if (!run('merge.mjs')) process.exitCode = 1;
}
log(`klart på ${Math.round((Date.now() - t0) / 1000)} s`);
