// Fetch all Swedish libraries from KB:s Biblioteksdatabasen (https://bibdb.libris.kb.se/api/lib).
// API docs: https://libris.kb.se/api/docs/reference/bibdb/
// The API caps n at 200, so we paginate with start=. One request per second.
// Output: data/raw/bibdb-se.json (all Swedish libraries, all types; filtering happens in build.mjs)
import path from 'node:path';
import { politeFetch, writeJSON, RAW } from './lib.mjs';

const BASE = 'https://bibdb.libris.kb.se/api/lib';
const PAGE = 200;

async function fetchAll(extra = '') {
  const out = [];
  for (let start = 0; ; start += PAGE) {
    const url = `${BASE}?dump=true&country_code=se${extra}&n=${PAGE}&start=${start}`;
    const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`bibdb HTTP ${res.status} for ${url}`);
    const j = await res.json();
    const libs = j.libraries || [];
    out.push(...libs);
    process.stdout.write(`\rbibdb${extra}: ${out.length}`);
    if (libs.length < PAGE) break;
    if (start > 50000) throw new Error('runaway pagination');
  }
  process.stdout.write('\n');
  return out;
}

const libs = await fetchAll();
// sanity: a full Swedish dump has several thousand records; fail loudly instead of writing a truncated file
if (libs.length < 1500) throw new Error(`bibdb returned only ${libs.length} records, refusing to overwrite`);
const seen = new Set();
const uniq = libs.filter((l) => (seen.has(l.sigel) ? false : (seen.add(l.sigel), true)));
writeJSON(path.join(RAW, 'bibdb-se.json'), { fetched: new Date().toISOString(), source: BASE, libraries: uniq }, false);
console.log(`wrote ${uniq.length} libraries to data/raw/bibdb-se.json`);
