// Nightly pipeline: fetch all sources, then build. A failing fetch keeps the previous raw file
// (every fetch script validates before writing), so the build still runs on the last good data.
// Usage: node scripts/run-all.mjs [--skip-web] [--offline]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const steps = [
  ['fetch-scb.mjs', false],
  ['fetch-bibdb.mjs', false],
  ['fetch-osm.mjs', false],
  ['fetch-osm-isin.mjs', false],
  ['fetch-web.mjs', true], // optional
];
const failed = [];
if (!args.has('--offline')) {
  for (const [script, optional] of steps) {
    if (optional && args.has('--skip-web')) continue;
    console.log(`\n=== ${script}`);
    const r = spawnSync(process.execPath, [path.join(dir, script)], { stdio: 'inherit' });
    if (r.status !== 0) { failed.push(script); console.error(`!!! ${script} failed – using previous raw data`); }
  }
}
console.log('\n=== build.mjs');
const b = spawnSync(process.execPath, [path.join(dir, 'build.mjs')], { stdio: 'inherit' });
if (failed.length) console.error(`\nFailed fetch steps: ${failed.join(', ')}`);
process.exit(b.status !== 0 ? 1 : failed.filter((s) => s !== 'fetch-web.mjs').length ? 2 : 0);
