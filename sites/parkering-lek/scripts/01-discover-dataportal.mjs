// Söker i dataportal.se (EntryScape-sök-API, robots.txt: Allow /) efter dataset om lekplatser och
// parkering och sparar en katalog med distributioner + licenser till data/raw/katalog-<tema>.json.
// Katalogen används för översikt/licenskontroll; vilka distributioner som faktiskt hämtas styrs av
// sources.mjs (manuellt granskade, med licens per källa).
import path from 'node:path';
import { RAW_DIR, politeFetch, writeJson, nowIso } from './lib.mjs';

const API = 'https://admin.dataportal.se/store/search?type=solr';
const QUERIES = {
  lek: ['title:lekplats*', 'description:lekplats*', 'title:playground*', 'title:temalekplats*', 'title:spielpl*', 'title:lekpark*', 'title:parklek*'],
  park: ['title:parkering*', 'description:parkeringsplats*', 'title:parking*', 'title:pendlarparkering*', 'title:infartsparkering*'],
};
const P = {
  type: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', title: 'http://purl.org/dc/terms/title', desc: 'http://purl.org/dc/terms/description',
  lic: 'http://purl.org/dc/terms/license', pub: 'http://purl.org/dc/terms/publisher', creator: 'http://purl.org/dc/terms/creator',
  land: 'http://www.w3.org/ns/dcat#landingPage', dist: 'http://www.w3.org/ns/dcat#distribution', fmt: 'http://purl.org/dc/terms/format',
  acc: 'http://www.w3.org/ns/dcat#accessURL', dl: 'http://www.w3.org/ns/dcat#downloadURL', mod: 'http://purl.org/dc/terms/modified',
};
const V = (o, p) => (o?.[p] || []).map((v) => v.value);

async function search(q) {
  const out = [];
  for (let off = 0; ; off += 100) {
    const r = await politeFetch(`${API}&query=${encodeURIComponent(q)}&limit=100&offset=${off}`);
    const j = await r.json();
    out.push(...j.resource.children);
    if (off + 100 >= j.results) break;
  }
  return out;
}
function collect(children, ds, dist) {
  for (const c of children) for (const [s, o] of Object.entries(c.metadata || {})) {
    const t = V(o, P.type)[0] || '';
    if (t.endsWith('#Dataset')) ds.set(s, { uri: s, titel: V(o, P.title)[0], beskrivning: (V(o, P.desc)[0] || '').slice(0, 300), licens: V(o, P.lic)[0] || null, utgivare: V(o, P.pub)[0] || V(o, P.creator)[0] || null, landningssida: V(o, P.land)[0] || null, andrad: V(o, P.mod)[0] || null, distributioner: V(o, P.dist) });
    if (t.endsWith('#Distribution')) dist.set(s, { uri: s, titel: V(o, P.title)[0] || null, licens: V(o, P.lic)[0] || null, format: V(o, P.fmt)[0] || null, url: V(o, P.dl)[0] || V(o, P.acc)[0] || null });
  }
}

for (const [tema, qs] of Object.entries(QUERIES)) {
  const ds = new Map(), dist = new Map();
  for (const q of qs) { console.log(`[${tema}] ${q}`); collect(await search(q), ds, dist); }
  const missing = [...new Set([...ds.values()].flatMap((d) => d.distributioner))].filter((u) => !dist.has(u));
  console.log(`[${tema}] ${ds.size} dataset, slår upp ${missing.length} distributioner`);
  for (const u of missing) { try { collect(await search(`resource:"${u}"`), ds, dist); } catch (e) { console.warn('  !', u, e.message); } }
  const katalog = [...ds.values()].map((d) => ({ ...d, distributioner: d.distributioner.map((u) => dist.get(u) || { uri: u }) }));
  writeJson(path.join(RAW_DIR, `katalog-${tema}.json`), { hamtad: nowIso(), kalla: 'https://www.dataportal.se (EntryScape search API)', dataset: katalog });
  console.log(`[${tema}] sparat ${katalog.length} dataset`);
}
