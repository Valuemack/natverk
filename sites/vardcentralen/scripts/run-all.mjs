// Kör hela kedjan i ordning. Ett steg som misslyckas stoppar inte de andra hämtningarna
// (då används senast lyckade rådata), men bygget körs bara om 1177-listan finns.
//   node scripts/run-all.mjs            # allt (ca 25–30 min, styrs av 1 anrop/s mot 1177.se)
//   node scripts/run-all.mjs --offline  # bara bygget från befintlig rådata
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { SCRIPTS_DIR, RAW_DIR } from './lib.mjs';

const offline = process.argv.includes('--offline');
const steps = offline ? [] : [
  ['01-fetch-oppna-data.mjs'],
  ['02-fetch-1177-lista.mjs'],
  ['03-fetch-1177-kort.mjs'],
  ['04-fetch-kommungranser.mjs', { onlyIfMissing: 'scb-kommuner.json', maxAgeDays: 30 }],
  ['05-fetch-osm.mjs', { maxAgeDays: 7, file: 'osm-vardcentraler.json' }],
];
const failed = [];
for (const [script, opt = {}] of steps) {
  const f = opt.onlyIfMissing || opt.file;
  if (f && opt.maxAgeDays && fs.existsSync(path.join(RAW_DIR, f)) && Date.now() - fs.statSync(path.join(RAW_DIR, f)).mtimeMs < opt.maxAgeDays * 864e5) {
    console.log(`== ${script}: hoppar över (${f} är färskare än ${opt.maxAgeDays} dagar)`); continue;
  }
  console.log(`== ${script}`);
  const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, script)], { stdio: 'inherit' });
  if (r.status !== 0) { failed.push(script); console.error(`!! ${script} misslyckades (kod ${r.status}) – fortsätter med tidigare rådata`); }
}
if (!fs.existsSync(path.join(RAW_DIR, '1177-lista.json'))) { console.error('Ingen 1177-lista – kan inte bygga'); process.exit(1); }
console.log('== 10-build.mjs');
const b = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, '10-build.mjs')], { stdio: 'inherit' });
if (b.status !== 0) process.exit(b.status);
if (failed.length) { console.error(`Klart med fel i: ${failed.join(', ')}`); process.exit(2); }
console.log('Klart.');
