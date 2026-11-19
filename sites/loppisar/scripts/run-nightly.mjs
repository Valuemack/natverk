// Full pipeline: kommun list -> chain store lists -> OSM extract -> merge.
// Usage (from the loppisar folder): node scripts/run-nightly.mjs [--skip-chains] [--skip-osm] [--no-download]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const steps = [
  ['kommunlista', ['fetch-kommunlista.mjs']],
  ...(args.includes('--skip-chains') ? [] : [['chains', ['chains/run-all.mjs']]]),
  ...(args.includes('--skip-osm') ? [] : [['osm', ['--max-old-space-size=6144', 'fetch-osm.mjs', ...args.filter(a => a === '--no-download' || a === '--rebuild-boundaries')]]]),
  ['merge', ['merge.mjs']],
];
let failed = 0;
for (const [name, a] of steps) {
  console.log(`\n### ${name}`);
  const t0 = Date.now();
  const argv = a.map(x => (x.endsWith('.mjs') ? path.join(DIR, x) : x));
  const r = spawnSync(process.execPath, argv, { stdio: 'inherit' });
  console.log(`### ${name}: exit ${r.status} (${Math.round((Date.now() - t0) / 1000)}s)`);
  if (r.status !== 0) {
    failed++;
    // merge still runs on the previous raw files if a fetch step fails; a failed merge keeps the old butiker.json
    if (name === 'merge') process.exitCode = 1;
  }
}
if (failed) console.log(`\n${failed} step(s) failed - see log above`);
