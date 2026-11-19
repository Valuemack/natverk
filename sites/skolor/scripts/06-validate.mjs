// Validates the shared schema and writes data/rapport.json (counts + field coverage).
// Exits with code 1 on hard errors so a nightly job can alert.
import { readJson, writeJson, TODAY } from './lib.mjs';

const KEYS = ['id', 'namn', 'kedja', 'typ', 'gatuadress', 'postnummer', 'ort', 'kommun', 'kommunkod', 'lan', 'lat', 'lon', 'telefon', 'webb', 'epost', 'oppettider', 'extra', 'kallor', 'uppdaterad'];
const kommuner = readJson('kommuner.json');
const kk = new Map(kommuner.map((k) => [k.kommunkod, k]));
const errors = [];

if (kommuner.length !== 290) errors.push(`kommuner.json: ${kommuner.length} rader (ska vara 290)`);
for (const k of kommuner) {
  if (!/^\d{4}$/.test(k.kommunkod) || !k.namn || !k.lan || k.lanskod !== k.kommunkod.slice(0, 2) || !/^[a-z0-9-]+$/.test(k.slug)) errors.push(`kommun fel: ${JSON.stringify(k)}`);
}
if (new Set(kommuner.map((k) => k.slug)).size !== 290) errors.push('kommun-slugs ej unika');

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
function check(file) {
  const rows = readJson(file);
  const ids = new Set(), slugs = new Set();
  const cov = {};
  const extraCov = {};
  const typ = {};
  for (const r of rows) {
    const keys = Object.keys(r);
    if (keys.join() !== KEYS.join()) errors.push(`${file} ${r.id}: nycklar avviker: ${keys.join()}`);
    for (const f of ['id', 'namn', 'typ', 'ort', 'kommun', 'kommunkod', 'lan', 'uppdaterad']) if (!r[f]) errors.push(`${file} ${r.id}: saknar ${f}`);
    if (ids.has(r.id)) errors.push(`${file}: dubblett-id ${r.id}`);
    ids.add(r.id);
    if (slugs.has(r.extra?.slug)) errors.push(`${file}: dubblett-slug ${r.extra?.slug}`);
    slugs.add(r.extra?.slug);
    const k = kk.get(r.kommunkod);
    if (!k) errors.push(`${file} ${r.id}: okänd kommunkod ${r.kommunkod}`);
    else if (k.namn !== r.kommun || k.lan !== r.lan) errors.push(`${file} ${r.id}: kommun/län matchar inte kommunkod`);
    if (r.lat != null && (r.lat < 55 || r.lat > 69.2 || r.lon < 10.5 || r.lon > 24.3)) errors.push(`${file} ${r.id}: koordinat utanför Sverige`);
    if (!Array.isArray(r.kallor) || !r.kallor.length) errors.push(`${file} ${r.id}: saknar kallor`);
    for (const f of KEYS) if (r[f] != null && r[f] !== '') cov[f] = (cov[f] || 0) + 1;
    for (const [f, v] of Object.entries(r.extra || {})) if (v != null && !(Array.isArray(v) && !v.length)) extraCov[f] = (extraCov[f] || 0) + 1;
    typ[r.typ] = (typ[r.typ] || 0) + 1;
  }
  const kommunerMed = new Set(rows.map((r) => r.kommunkod)).size;
  return {
    antal: rows.length,
    typ,
    kommuner_med_minst_en: kommunerMed,
    andel_med_koordinater_pct: pct(rows.filter((r) => r.lat != null && r.lon != null).length, rows.length),
    falt_tackning_pct: Object.fromEntries(KEYS.map((f) => [f, pct(cov[f] || 0, rows.length)])),
    extra_tackning_pct: Object.fromEntries(Object.entries(extraCov).sort((a, b) => b[1] - a[1]).map(([f, n]) => [f, pct(n, rows.length)])),
  };
}

const rapport = { uppdaterad: TODAY, kommuner: kommuner.length, forskolor: check('forskolor.json'), komvux: check('komvux.json') };
try { rapport.forskolor_tackning_mot_skolverket = readJson('forskolor_tackning.json').totalt; } catch {}
rapport.fel = errors.slice(0, 200);
rapport.antal_fel = errors.length;
writeJson('rapport.json', rapport);
console.log(JSON.stringify({ ...rapport, fel: undefined }, null, 1));
if (errors.length) {
  console.error(`${errors.length} valideringsfel, t.ex.:`, errors.slice(0, 10));
  process.exit(1);
}
