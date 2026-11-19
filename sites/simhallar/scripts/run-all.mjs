// Nightly pipeline for simhallar.se. Usage:
//   node scripts/run-all.mjs              full run: kommun sites (weekly), crawl, extract, build
//   node scripts/run-all.mjs --offline    extract + build from cached pages only
//   node scripts/run-all.mjs --only=0180,1480   crawl only these kommuner (then rebuild everything)
// Exit code: 0 ok, 1 build failed or the result shrank a lot (previous files restored), 2 crawl step failed (build used cached pages).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SCRIPTS_DIR, DATA_DIR, RAW_DIR, readJson } from './lib.mjs';

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const only = args.find((a) => a.startsWith('--only='));
const node = process.execPath;
const run = (script, extra = [], { tries = 1 } = {}) => {
  for (let i = 1; i <= tries; i++) {
    console.log(`\n=== ${script} ${extra.join(' ')} (försök ${i})`);
    const r = spawnSync(node, ['--max-old-space-size=1536', path.join(SCRIPTS_DIR, script), ...extra], { stdio: 'inherit' });
    if (r.status === 0) return true;
  }
  return false;
};
let code = 0;
if (!offline) {
  const sites = path.join(RAW_DIR, 'kommun-sites.json');
  const age = fs.existsSync(sites) ? (Date.now() - fs.statSync(sites).mtimeMs) / 86400e3 : 99;
  if (age > 7 && !run('01-kommun-sites.mjs')) console.warn('kommun-sites misslyckades, använder befintlig fil');
  // the crawler skips page files younger than 20 h, so a crash + retry continues where it stopped
  if (!run('02-crawl.mjs', only ? [only, '--fresh'] : [], { tries: 4 })) code = 2;
}
const outFile = path.join(DATA_DIR, 'simhallar.json');
const backup = path.join(RAW_DIR, 'simhallar.prev.json');
const prev = readJson(outFile, null);
if (prev) fs.copyFileSync(outFile, backup);
if (!run('03-extract.mjs') || !run('10-build.mjs')) { if (prev) fs.copyFileSync(backup, outFile); console.error('Bygget misslyckades, föregående simhallar.json återställd'); process.exit(1); }
const now = readJson(outFile);
const hours = (a) => a.filter((r) => r.oppettider).length;
if (prev && (now.length < 0.85 * prev.length || hours(now) < 0.7 * hours(prev))) {
  fs.copyFileSync(backup, outFile);
  console.error(`Resultatet krympte för mycket (${prev.length} -> ${now.length} poster, ${hours(prev)} -> ${hours(now)} med öppettider). Föregående fil återställd.`);
  process.exit(1);
}
console.log(`\nKlart: ${now.length} simhallar, ${hours(now)} med öppettider.`);
process.exit(code);
