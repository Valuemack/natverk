// Nightly pipeline. Each fetch step keeps the previous raw file if it fails, so a single flaky source
// never empties the dataset. Exit code is non-zero only if the LV master list or the merge fails.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const run = (script, required) => {
  console.log(`\n=== ${script}`);
  const r = spawnSync(process.execPath, [path.join(dir, script)], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${script} failed (exit ${r.status})${required ? '' : ' — continuing with previous data'}`);
    if (required) process.exit(1);
  }
};
run('fetch-lv.mjs', true);
run('fetch-scb.mjs', false);
run('fetch-chains.mjs', false);
run('fetch-osm.mjs', false);
run('merge.mjs', true);
run('geocode.mjs', false);   // only new addresses (cached)
run('merge.mjs', true);      // re-merge with new geocodes
