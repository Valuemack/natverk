// Run every chain script in this folder sequentially (never in parallel: each keeps to ~1 req/s),
// each in its own child process so one failure does not stop the others. Prints a summary table.
// Usage: node scripts/chains/run-all.mjs [slug ...]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(DIR, '..', '..', 'data', 'raw');
const only = process.argv.slice(2);
const scripts = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.mjs') && f !== 'run-all.mjs' && !f.startsWith('_'))
  .map(f => f.replace(/\.mjs$/, ''))
  .filter(s => !only.length || only.includes(s))
  .sort();

function runOne(slug) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(DIR, slug + '.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; process.stdout.write('  ' + d); });
    child.stderr.on('data', d => { err += d; process.stderr.write('  ' + d); });
    child.on('close', (code) => resolve({ slug, code, secs: Math.round((Date.now() - t0) / 1000), out, err }));
  });
}

function stats(slug) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(RAW, `chain-${slug}.json`), 'utf8'));
    const n = d.stores.length;
    const h = d.stores.filter(s => s.oppettider && Object.values(s.oppettider).some(v => v != null)).length;
    const c = d.stores.filter(s => s.lat != null && s.lon != null).length;
    return { n, h, c, fetched: d.fetched, errors: (d.errors || []).length };
  } catch { return null; }
}

const results = [];
for (const slug of scripts) {
  console.log(`== ${slug}`);
  const t0 = Date.now();
  const r = await runOne(slug);
  r.stats = stats(r.slug);
  r.fresh = !!r.stats && Date.parse(r.stats.fetched) >= t0; // false = script kept the previous file
  results.push(r);
}

const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : '-');
const rows = results.map(r => {
  const s = r.stats, fresh = r.fresh;
  return [r.slug, r.code === 0 ? 'ok' : `FAIL(${r.code})`, s ? String(s.n) : '-', s ? pct(s.h, s.n) : '-', s ? pct(s.c, s.n) : '-', s ? String(s.errors) : '-', s ? (fresh ? 'new' : 'old') : '-', r.secs + 's'];
});
const head = ['chain', 'status', 'stores', 'hours', 'coords', 'errors', 'file', 'time'];
const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
const line = (r) => r.map((x, i) => x.padEnd(w[i])).join('  ');
console.log('\n' + line(head) + '\n' + w.map(n => '-'.repeat(n)).join('  ') + '\n' + rows.map(line).join('\n'));
const total = results.reduce((a, r) => a + (r.stats?.n || 0), 0);
console.log(`\n${results.filter(r => r.code === 0).length}/${results.length} chains ok, ${total} stores in total`);
process.exitCode = results.every(r => r.code !== 0) ? 1 : 0;
