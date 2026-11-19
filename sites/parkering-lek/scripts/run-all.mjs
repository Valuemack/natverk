// Kör hela kedjan i ordning. Varje steg är fristående och cachar sina hämtningar.
//   node scripts/run-all.mjs                 # hämta (med cache) + bygg
//   node scripts/run-all.mjs --discover      # kör även katalogsökningarna (dataportal.se + ArcGIS Hub, ~10 min)
//   node scripts/run-all.mjs --no-operators  # hoppa över operatörssidorna (Aimo ~65 min, övriga ~25 min vid tom cache)
//   node scripts/run-all.mjs --build-only    # bara bygg från befintlig rådata
// FORCE=1 tvingar ny hämtning trots cache.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const steps = [];
if (!args.has('--build-only')) {
  steps.push('00-kommungranser.mjs');
  if (args.has('--discover')) steps.push('01-discover-dataportal.mjs', '03-discover-arcgis.mjs');
  steps.push('02-fetch-kommun.mjs', '04-fetch-arcgis.mjs', '06-fetch-stockholm-ltf.mjs');
  if (!args.has('--no-operators')) steps.push('05-fetch-operatorer.mjs');
}
steps.push('10-build.mjs', '20-licens.mjs');

for (const s of steps) {
  const t0 = Date.now();
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, ['--max-old-space-size=4096', path.join(dir, s)], { stdio: 'inherit', env: process.env });
  console.log(`=== ${s}: ${r.status === 0 ? 'OK' : `FEL (kod ${r.status})`} på ${Math.round((Date.now() - t0) / 1000)} s`);
  if (r.status !== 0 && ['00-kommungranser.mjs', '10-build.mjs'].includes(s)) process.exit(r.status || 1);
}
