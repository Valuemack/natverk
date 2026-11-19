// Merge Biblioteksdatabasen (master list) + OpenStreetMap (+ optional web JSON-LD hours) into data/bibliotek.json.
// Inputs (data/raw): bibdb-se.json, osm-libraries.json, scb-regioner.json, [web-hours.json]
// Outputs (data):    bibliotek.json, kommuner.json, rapport.json, osm-omatchade.json
import path from 'node:path';
import { ROOT, DATA, RAW, readJSON, writeJSON, exists, norm, haversine } from './lib.mjs';
import { parseOsmHours, parseSwedishHours, osmSeasons, isoWeek, DAYS } from './hours.mjs';

/** is `date` inside { fran, till } given as "MM-DD" or "vNN" (wrapping over new year allowed)? null if unknown */
function inPeriod(p, date) {
  if (!p || !p.fran || !p.till) return null;
  if (p.fran.startsWith('v')) {
    const w = isoWeek(date), a = +p.fran.slice(1), b = +p.till.slice(1);
    return a <= b ? w >= a && w <= b : w >= a || w <= b;
  }
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const [a, b] = [p.fran, p.till].map((x) => +x.replace('-', ''));
  return a <= b ? md >= a && md <= b : md >= a || md <= b;
}

const TODAY = new Date();
const bibdb = readJSON(path.join(RAW, 'bibdb-se.json'));
const osm = readJSON(path.join(RAW, 'osm-libraries.json'));
const scb = readJSON(path.join(RAW, 'scb-regioner.json'));
const web = exists(path.join(RAW, 'web-hours.json')) ? readJSON(path.join(RAW, 'web-hours.json')) : { results: {} };
const isin = exists(path.join(RAW, 'osm-isin.json')) ? readJSON(path.join(RAW, 'osm-isin.json')) : { results: {} };
const OVERRIDES = path.join(ROOT, 'scripts', 'overrides.json');
const overrides = exists(OVERRIDES) ? readJSON(OVERRIDES) : {};
const OV = overrides.libraries || {};

const report = { genererad: TODAY.toISOString(), kallor: {}, exkluderade: [], varningar: [], statistik: {} };
const warn = (sigel, msg) => report.varningar.push({ sigel, msg });

// ---------------------------------------------------------------- 1. select public libraries from bibdb
const EXCL_NAME = /\bstängt\b|dubblett|fjärrlån|\belib\b|e-bibliotek|depåbibliotek|lånecentral|länsbibliotek|regionbibliotek|ljudbibliotek|\btest\b|medieförsörjning|bokdepå|\binköp|katalogisering|tidskriftsdepå|sjukhem|sjukhus|lasarett|äldreboende|kriminalvård|anstalten|häktet/i;
const EXCL_EMEDIA = /e-medi|e-bök|e-böcker|e-film|e-ljud|cineasterna|e-resurs|digitala bibliotek/i;
const SUBUNIT = /avdelning|uppsökande|digital|referens|magasin|läsesällskap|tidningsrum/i; // departments that are not separate libraries
const FUNCTION_DEPT =/^(biblioteket|huvudbiblioteket|\(.*\)|\d.*)$/i; // generic or internal (cost-centre) department names
const CLOSED = /nedlag|lades (ned|ner)|lagts (ned|ner)|upphör|ihopslag|finns (ej|inte) (med )?på|inga lokaler|^\s*stängt\s*\d*\s*!?\s*$|stängt\s+(tills vidare|fr\.?\s?o\.?\s?m)|är stängt fr|har stängt|avvecklat/i;

function isPublic(l) {
  if (l.country_code !== 'se' || !l.alive) return false;
  if (l.library_type === 'folkbib' || l.library_type === 'folkskolbib') return true;
  // a few branch libraries are typed skolbib but subtype kommunbib (e.g. "Levene bibliotek")
  return l.library_type === 'skolbib' && l.library_subtype === 'kommunbib' && !/skol/i.test(l.name);
}

const selected = [];
for (const l of bibdb.libraries) {
  if (!isPublic(l)) continue;
  const ov = OV[l.sigel] || {};
  if (ov.exclude) { report.exkluderade.push({ sigel: l.sigel, namn: l.name, skal: `override: ${ov.exclude}` }); continue; }
  const label = `${l.name} ${l.dept || ''}`.trim();
  if (!ov.include) {
    if (EXCL_NAME.test(l.name) || EXCL_EMEDIA.test(l.name)) { report.exkluderade.push({ sigel: l.sigel, namn: label, skal: 'icke-publik enhet/e-medier (namn)' }); continue; }
    // a function in dept ("Fjärrlån", "Lånecentralen") excludes only records outside the official statistics;
    // some main libraries are registered as e.g. "Sölvesborgs bibliotek / Fjärrlån"
    if ((EXCL_NAME.test(l.dept || '') || SUBUNIT.test(l.dept || '')) && !l.statistics) { report.exkluderade.push({ sigel: l.sigel, namn: label, skal: 'icke-publik enhet (avdelning)' }); continue; }
    if (/^\d\d00$/.test(l.municipality_code || '')) { report.exkluderade.push({ sigel: l.sigel, namn: label, skal: 'regional/länsövergripande post' }); continue; }
    const hasStreet = (l.address || []).some((a) => a.street && !/^(box|pl|postbox|fack)\b/i.test(a.street) && /\d/.test(a.street));
    if (!hasStreet && !l.statistics && !(l.latitude > 0) && !/bokbuss|bokbil|biblioteksbuss/i.test(l.name)) { report.exkluderade.push({ sigel: l.sigel, namn: label, skal: 'administrativ post utan besöksadress/koordinater' }); continue; }
  }
  const notes = `${l.open_hours || ''}\n${l.description || ''}`;
  if (CLOSED.test(l.open_hours || '') || /nedlag|lades (ned|ner)|upphör|avvecklat/i.test(l.description || '')) {
    report.exkluderade.push({ sigel: l.sigel, namn: l.name, skal: `nedlagt/stängt enligt bibdb: ${notes.trim().slice(0, 80)}` });
    continue;
  }
  selected.push(l);
}

// ---------------------------------------------------------------- helpers
const BUSS_NAME = /bokbuss|bokbil|biblioteksbuss|bokbåt|mobila bibliotek|bibliotek på hjul/i;
const addr = (l) => Object.fromEntries((l.address || []).map((a) => [a.address_type, a]));
const isBox = (s) => /^(box|pl|postbox|fack)\b/i.test(s || '');
function titleCase(s) {
  if (!s) return s;
  if (s !== s.toUpperCase()) return s.trim();
  return s.toLowerCase().replace(/(^|[\s-])([a-zåäöé])/g, (m, a, b) => a + b.toUpperCase()).trim();
}
function postnr(z) {
  const d = String(z || '').replace(/\D/g, '');
  return d.length === 5 ? `${d.slice(0, 3)} ${d.slice(3)}` : null;
}
const validCoord = (lat, lon) => lat > 55 && lat < 69.2 && lon > 10.5 && lon < 24.3;
function slugify(s) {
  return norm(s).replace(/\s+/g, '-');
}
const STOP = new Set(['bibliotek', 'biblioteket', 'bibliotekets', 'library', 'och', 'i', 'pa', 'filial', 'filialbibliotek', 'folkbibliotek', 'folkbiblioteket', 'kommunbibliotek', 'kommunbiblioteket', 'stadsdelsbibliotek', 'stadsdelsbiblioteket', 'kommundelsbibliotek', 'bibliotekfilial', 'kommun', 'the', 'och', 'kulturhus', 'kulturhuset']);
const tokenCache = new Map();
function nameTokens(s) {
  const key = String(s || '');
  if (!tokenCache.has(key)) tokenCache.set(key, computeTokens(key));
  return tokenCache.get(key);
}
function computeTokens(s) {
  return new Set(norm(s).replace(/stadsbiblioteket?/g, 'stad').split(' ')
    .map((t) => t.replace(/(biblioteket|biblioteks|bibliotek)$/, '')) // "Tranströmerbiblioteket" -> "transtromer"
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t))
    .filter((t) => t && !STOP.has(t)));
}
function nameSim(a, b) {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}
const streetKey = (s) => norm(s).replace(/\s+/g, '');

// ---------------------------------------------------------------- 2. build base records
const kommunName = (code) => scb.kommuner[code] || null;
const records = selected.map((l) => {
  const a = addr(l);
  const ov = OV[l.sigel] || {};
  // visiting address: vis > stat > gen, never a box address
  const pick = ['vis', 'stat', 'gen'].map((t) => a[t]).find((x) => x && x.street && !isBox(x.street));
  const zipFrom = [pick, a.stat, a.gen, a.vis].find((x) => x && postnr(x.zip_code) && (x === pick || !pick || streetKey(x.street) === streetKey(pick.street)));
  const cityFrom = [pick, a.stat, a.gen, a.vis].find((x) => x && x.city);
  const tel = [a.vis, a.gen, a.stat].map((x) => x && x.tel_no).find((t) => t && /\d{5,}/.test(t.replace(/\D/g, '')));
  const email = [a.vis, a.gen, a.stat].map((x) => x && x.email).find((e) => e && /@/.test(e));
  // only publish function mailboxes, never personal addresses
  const functionalEmail = email && /bibl|library|info|kultur|lib|kundtjanst|kontakt/i.test(email.split('@')[0]) ? email.trim() : null;

  let namn = l.name.trim(), kedjaKandidat = null;
  const dept = (l.dept || '').trim();
  const orgLike = /^(bibliotek(en)?( i)? |folkbiblioteken i |biblioteken i )/i.test(namn) || / kommun$/i.test(namn);
  if (orgLike && dept && !FUNCTION_DEPT.test(dept) && !EXCL_NAME.test(dept)) { kedjaKandidat = namn; namn = dept; }
  else if (orgLike && / kommun$/i.test(namn)) { namn = namn.replace(/ kommun$/i, ' bibliotek'); }
  else if (/^bibliotek(en)? /i.test(namn)) kedjaKandidat = namn;
  if (ov.namn) namn = ov.namn;

  const lat = validCoord(l.latitude, l.longitude) ? l.latitude : null;
  const lon = lat !== null ? l.longitude : null;
  return {
    l, a, sigel: l.sigel, namn, kedjaKandidat, dept,
    gatuadress: pick ? pick.street.trim() : null,
    postnummer: zipFrom ? postnr(zipFrom.zip_code) : null,
    ort: cityFrom ? titleCase(cityFrom.city) : null,
    kommunkod: l.municipality_code && scb.kommuner[l.municipality_code] ? l.municipality_code : null,
    kommunKalla: l.municipality_code && scb.kommuner[l.municipality_code] ? 'bibdb_kommunkod' : null,
    lat, lon, koordKalla: lat !== null ? 'bibdb' : null,
    telefon: tel ? tel.trim() : null,
    epost: functionalEmail,
    webb: l.url ? l.url.trim() : null,
    ov,
  };
});

// one name used for several branches in a kommun ("Årebiblioteken" + dept "Duveds bibliotek") -> use dept as name
{
  const cnt = new Map();
  for (const r of records) { const k = `${r.kommunkod}|${norm(r.namn)}`; cnt.set(k, (cnt.get(k) || 0) + 1); }
  for (const r of records) {
    if (cnt.get(`${r.kommunkod}|${norm(r.namn)}`) > 1 && r.dept && /bibliotek/i.test(r.dept) && !FUNCTION_DEPT.test(r.dept) && !EXCL_NAME.test(r.dept) && !SUBUNIT.test(r.dept) && !r.ov.namn) {
      r.kedjaKandidat = r.kedjaKandidat || r.namn;
      r.namn = r.dept;
    }
  }
}

// ---------------------------------------------------------------- 3. dedupe
// bibdb often has several records for one physical library (org record + branch record, sub-collections,
// school part of an integrated library). Within a kommun:
//  a) same visiting address -> keep the best record, drop the other if names are similar, the other is not in the
//     official statistics, or one of them is an organisation-style name; otherwise keep both and warn
//  b) identical name tokens at different addresses -> keep the best (stale record)
//  c) no address at all and a name contained in another record's name -> drop
{
  const ORGISH = /^(bibliotek(en)?( i| på)? |folkbiblioteken i )| kommun\b|biblioteken$|^stadsbiblioteket$/i;
  const prio = (r) => (r.l.statistics ? 8 : 0) + (ORGISH.test(r.l.name) ? 0 : 2) + (r.l.open_hours ? 1 : 0) + (r.l.library_type === 'folkbib' ? 1 : 0)
    - (/,|stift|gymnas|skol|samling/i.test(r.namn) || SUBUNIT.test(r.dept || '') ? 3 : 0);
  const better = (a, b) => prio(a) - prio(b) || (a.l.date_modified || '').localeCompare(b.l.date_modified || '');
  const addrKey = (s) => streetKey(String(s).replace(/\bs:t\b/gi, 'sankt').replace(/,.*$/, ''));
  const drop = (r, keep, why) => {
    if (r.duplicateOf || keep.duplicateOf || r === keep) return;
    r.duplicateOf = keep.sigel;
    r.dupReason = why;
    for (const f of ['webb', 'telefon', 'epost', 'postnummer']) if (!keep[f] && r[f]) keep[f] = r[f];
    if (!keep.l.open_hours && r.l.open_hours) keep.extraHoursText = r.l.open_hours;
    if (keep.lat === null && r.lat !== null) { keep.lat = r.lat; keep.lon = r.lon; keep.koordKalla = 'bibdb'; }
  };
  // group records at the same place: same normalised street address, or coordinates within 25 m (union-find)
  const parent = new Map(records.map((r) => [r, r]));
  const find = (r) => (parent.get(r) === r ? r : find(parent.get(r)));
  const union = (a, b) => parent.set(find(a), find(b));
  const placed = records.filter((r) => !BUSS_NAME.test(r.namn));
  const byAddr = new Map();
  for (const r of placed) {
    if (!r.gatuadress) continue;
    const k = r.kommunkod + '|' + addrKey(r.gatuadress);
    if (byAddr.has(k)) union(r, byAddr.get(k)); else byAddr.set(k, r);
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    if (a.kommunkod === b.kommunkod && a.lat !== null && b.lat !== null && haversine(a.lat, a.lon, b.lat, b.lon) < 25) union(a, b);
  }
  const groups = new Map();
  for (const r of placed) {
    const k = find(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => -better(a, b));
    const keep = g[0];
    for (const r of g.slice(1)) {
      if (nameSim(keep.namn, r.namn) >= 0.5) drop(r, keep, 'samma adress, liknande namn');
      else if (!r.l.statistics) drop(r, keep, 'samma adress, ej i biblioteksstatistiken (delsamling/avdelning)');
      else if (ORGISH.test(r.l.name)) drop(r, keep, 'samma adress, organisationspost');
      else warn(r.sigel, 'samma adress som ' + keep.sigel + ' (' + keep.namn + ') – båda behållna');
    }
  }
  const byTokens = new Map();
  for (const r of records) {
    if (r.duplicateOf || BUSS_NAME.test(r.namn)) continue;
    const t = [...nameTokens(r.namn)].sort().join(' ');
    if (!t) continue;
    const k = r.kommunkod + '|' + t;
    if (!byTokens.has(k)) byTokens.set(k, []);
    byTokens.get(k).push(r);
  }
  for (const g of byTokens.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => -better(a, b));
    for (const r of g.slice(1)) {
      const d = g[0].lat !== null && r.lat !== null ? haversine(g[0].lat, g[0].lon, r.lat, r.lon) : null;
      if (d === null || d < 2000 || !r.l.statistics) drop(r, g[0], 'samma namn i samma kommun');
      else warn(r.sigel, 'samma namn som ' + g[0].sigel + ' men ' + Math.round(d) + ' m bort – båda behållna');
    }
  }
  for (const r of records) {
    if (r.duplicateOf || r.gatuadress || BUSS_NAME.test(r.namn)) continue;
    const other = records.find((q) => q !== r && !q.duplicateOf && q.kommunkod === r.kommunkod && q.gatuadress && nameSim(r.namn, q.namn) >= 1);
    if (other) drop(r, other, 'saknar adress, namnet finns i annan post');
  }
  for (const r of records.filter((x) => x.duplicateOf)) {
    report.exkluderade.push({ sigel: r.sigel, namn: r.namn, skal: 'dubblett av ' + r.duplicateOf + ': ' + r.dupReason });
  }
}
const libs = records.filter((r) => !r.duplicateOf);

// ---------------------------------------------------------------- 4. match OSM elements
const NONPUBLIC_OSM = /skol|gymnas|universitet|högskol|university|campus|sjukhus|lasarett|arkiv|kyrk|församling|stiftelse|museum|forsknings|myndighet/i;
const osmLibs = osm.libraries.filter((o) => validCoord(o.lat, o.lon));
const candidates = [];
for (const r of libs) {
  const rStreet = r.gatuadress ? streetKey(r.gatuadress.replace(/\s*\d+.*$/, '')) : null;
  const rNum = r.gatuadress ? (r.gatuadress.match(/\d+/) || [null])[0] : null;
  for (const o of osmLibs) {
    const t = o.tags;
    const d = r.lat !== null ? haversine(r.lat, r.lon, o.lat, o.lon) : null;
    if (d !== null && d > 3000) continue;
    if (d === null && o.kommun_code !== r.kommunkod) continue;
    const oname = t.name || t.alt_name || t.official_name || '';
    // also compare with "<ort> bibliotek" ("Orusts kommunbibliotek" in Henån <-> OSM "Henåns bibliotek")
    const sim = Math.max(nameSim(r.namn, oname), r.dept ? nameSim(r.dept, oname) : 0, t.alt_name ? nameSim(r.namn, t.alt_name) : 0,
      r.ort ? 0.75 * nameSim(`${r.ort} bibliotek`, oname) : 0);
    const streetMatch = rStreet && t['addr:street'] && streetKey(t['addr:street']) === rStreet && (!rNum || !t['addr:housenumber'] || t['addr:housenumber'].startsWith(rNum));
    let score = sim * 2 + (streetMatch ? 1.5 : 0);
    if (d !== null) score += d < 75 ? 1.5 : d < 250 ? 1 : d < 800 ? 0.5 : d < 1500 ? 0 : -0.5;
    if (!oname) score -= 0.25;
    if (NONPUBLIC_OSM.test(oname) && !NONPUBLIC_OSM.test(r.namn)) score -= 1;
    const ok = (score >= 1.75 && (sim > 0 || streetMatch || (d !== null && d < 75))) || (sim >= 1 && score >= 1.5);
    if (ok) candidates.push({ r, o, score, d, sim, streetMatch });
  }
}
candidates.sort((a, b) => b.score - a.score);
const usedOsm = new Set();
for (const c of candidates) {
  if (c.r.osm || usedOsm.has(c.o.osm)) continue;
  c.r.osm = c.o; c.r.osmMatch = { score: +c.score.toFixed(2), avstand_m: c.d === null ? null : Math.round(c.d), namnlikhet: +c.sim.toFixed(2) };
  usedOsm.add(c.o.osm);
}

// ---------------------------------------------------------------- 5. enrich from OSM: coords, kommun, address gaps, contact
// organisation-style names ("Biblioteken i Haninge") -> use the OSM name of the building when it is a library name
const ORG_NAME = /^(bibliotek(en)?( i)? |folkbiblioteken i )|^folkbiblioteket$/i;
for (const r of libs) {
  const on = r.osm?.tags.name;
  if (on && ORG_NAME.test(r.namn) && !r.ov.namn && /bibliotek/i.test(on) && !ORG_NAME.test(on)) {
    r.kedjaKandidat = r.kedjaKandidat || r.namn;
    r.namn = on.trim();
    r.namnKalla = 'osm';
  }
}
const distances = [];
for (const r of libs) {
  const o = r.osm;
  if (!o) continue;
  const t = o.tags;
  if (r.lat !== null) distances.push(haversine(r.lat, r.lon, o.lat, o.lon));
  // OSM building/entrance positions are usually more precise than bibdb's geocoded points
  r.lat = +o.lat.toFixed(6); r.lon = +o.lon.toFixed(6); r.koordKalla = 'osm';
  if (!r.kommunkod && o.kommun_code) { r.kommunkod = o.kommun_code; r.kommunKalla = 'osm_polygon'; }
  else if (o.kommun_code && o.kommun_code !== r.kommunkod) r.polygonKod = o.kommun_code;
  if (!r.gatuadress && t['addr:street']) r.gatuadress = `${t['addr:street']}${t['addr:housenumber'] ? ' ' + t['addr:housenumber'] : ''}`;
  if (!r.postnummer && t['addr:postcode']) r.postnummer = postnr(t['addr:postcode']);
  if (!r.ort && (t['addr:city'] || t['addr:place'])) r.ort = t['addr:city'] || t['addr:place'];
  if (!r.telefon && (t.phone || t['contact:phone'])) r.telefon = t.phone || t['contact:phone'];
  if (!r.webb && (t.website || t['contact:website'])) r.webb = t.website || t['contact:website'];
}
// coordinate-based kommun (OSM polygon of the matched element, else is_in on the bibdb coordinate)
for (const r of libs) if (!r.polygonKod && isin.results[r.sigel]?.kod && r.koordKalla === 'bibdb') r.polygonKod = isin.results[r.sigel].kod;
// postal prefix -> kommun votes (from records whose code agrees with their coordinates)
const prefixVotes = {};
for (const r of libs) if (r.kommunkod && r.postnummer && (!r.polygonKod || r.polygonKod === r.kommunkod)) {
  const p = r.postnummer.slice(0, 3);
  (prefixVotes[p] ||= {})[r.kommunkod] = (prefixVotes[p][r.kommunkod] || 0) + 1;
}
const prefixKommun = (pn) => { const v = prefixVotes[(pn || '').slice(0, 3)]; return v ? Object.entries(v).sort((a, b) => b[1] - a[1])[0][0] : null; };
for (const r of libs) {
  if (!r.polygonKod) continue;
  if (!r.kommunkod) { r.kommunkod = r.polygonKod; r.kommunKalla = 'koordinat_osm_polygon'; continue; }
  if (r.polygonKod === r.kommunkod) continue;
  // conflict: trust the coordinate if the postcode or ort agrees with it, otherwise keep bibdb and warn
  const ortAgrees = r.ort && norm(r.ort) === norm(kommunName(r.polygonKod));
  if (prefixKommun(r.postnummer) === r.polygonKod || ortAgrees) {
    warn(r.sigel, `kommunkod ändrad ${r.kommunkod} (${kommunName(r.kommunkod)}) -> ${r.polygonKod} (${kommunName(r.polygonKod)}) enligt koordinat + postnummer/ort`);
    r.kommunkod = r.polygonKod; r.kommunKalla = 'koordinat_osm_polygon';
  } else if (r.koordKalla === 'bibdb' && (prefixKommun(r.postnummer) === r.kommunkod || (r.ort && norm(r.ort) === norm(kommunName(r.kommunkod))))) {
    // address agrees with bibdb's kommun -> the bibdb coordinate is wrong; drop it rather than show a wrong map pin
    warn(r.sigel, `koordinat låg i ${kommunName(r.polygonKod)} men adressen i ${kommunName(r.kommunkod)} – koordinat borttagen`);
    r.lat = null; r.lon = null; r.koordKalla = null;
  } else warn(r.sigel, `bibdb-kommun ${kommunName(r.kommunkod)} men koordinaten ligger i ${kommunName(r.polygonKod)} – behållit bibdb`);
}
// records without coordinates: if both postcode prefix and ort point to another kommun, bibdb's code is wrong
const ortKommun = (ort) => {
  const v = {};
  for (const q of libs) if (q.kommunkod && q.ort && q.lat !== null && norm(q.ort) === norm(ort)) v[q.kommunkod] = (v[q.kommunkod] || 0) + 1;
  const b = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
  return b ? b[0] : null;
};
for (const r of libs) {
  if (r.lat !== null || !r.kommunkod || !r.ort || !r.postnummer) continue;
  const p = prefixKommun(r.postnummer), o = ortKommun(r.ort);
  if (p && p === o && p !== r.kommunkod) {
    warn(r.sigel, `kommunkod ändrad ${kommunName(r.kommunkod)} -> ${kommunName(p)} (postnummer och ort pekar dit, koordinat saknas)`);
    r.kommunkod = p; r.kommunKalla = 'postnummer_ort';
  }
}
// after kommun corrections: same name in same kommun -> keep the one in the statistics / with coordinates
for (let i = libs.length - 1; i >= 0; i--) {
  const r = libs[i];
  if (BUSS_NAME.test(r.namn)) continue;
  const t = [...nameTokens(r.namn)].sort().join(' ');
  const twin = t && libs.find((q) => q !== r && q.kommunkod === r.kommunkod && [...nameTokens(q.namn)].sort().join(' ') === t);
  if (twin && !r.l.statistics && (twin.l.statistics || (twin.lat !== null && r.lat === null))) {
    report.exkluderade.push({ sigel: r.sigel, namn: r.namn, skal: `dubblett av ${twin.sigel}: samma namn i samma kommun (efter kommunkorrigering)` });
    if (r.osm) usedOsm.delete(r.osm.osm);
    libs.splice(i, 1);
  }
}
// kommun fallback 1: same ort as other libraries / OSM elements with a known kommun, then postal-code prefix
for (const r of libs.filter((x) => !x.kommunkod && x.ort)) {
  const votes = {};
  for (const q of libs) if (q.kommunkod && q.ort && norm(q.ort) === norm(r.ort)) votes[q.kommunkod] = (votes[q.kommunkod] || 0) + 1;
  for (const o of osm.libraries) if (o.kommun_code && o.tags['addr:city'] && norm(o.tags['addr:city']) === norm(r.ort)) votes[o.kommun_code] = (votes[o.kommun_code] || 0) + 1;
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (best) { r.kommunkod = best[0]; r.kommunKalla = 'ort'; warn(r.sigel, `kommun härledd från ort "${r.ort}"`); continue; }
  const pre = (r.postnummer || '').slice(0, 3);
  const pv = {};
  if (pre) for (const q of libs) if (q.kommunkod && (q.postnummer || '').startsWith(pre)) pv[q.kommunkod] = (pv[q.kommunkod] || 0) + 1;
  const pb = Object.entries(pv).sort((a, b) => b[1] - a[1])[0];
  if (pb) { r.kommunkod = pb[0]; r.kommunKalla = 'postnummer'; warn(r.sigel, `kommun härledd från postnummerprefix ${pre}`); }
}
// kommun fallback 2: nearest library with a known kommun (only for the rare records without code)
for (const r of libs.filter((x) => !x.kommunkod && x.lat !== null)) {
  let best = null;
  for (const q of libs) if (q.kommunkod && q.lat !== null && q.kommunKalla !== 'narmaste_bibliotek') {
    const d = haversine(r.lat, r.lon, q.lat, q.lon);
    if (!best || d < best.d) best = { d, q };
  }
  if (best && best.d < 10000) { r.kommunkod = best.q.kommunkod; r.kommunKalla = 'narmaste_bibliotek'; warn(r.sigel, `kommun härledd från närmaste bibliotek (${Math.round(best.d)} m)`); }
}
for (const r of libs) {
  if (!r.ort && r.kommunkod) { r.ort = kommunName(r.kommunkod); r.ortKalla = 'kommunnamn'; warn(r.sigel, 'ort saknas i källorna, satt till kommunnamnet'); }
}

// ---------------------------------------------------------------- 6. type, huvudbibliotek, kedja
const BUSS = BUSS_NAME;
const STATION = /utlåningsstation|utlåningsställe|utlåningspunkt|obemannad|depå\b/i;
const byKommun = new Map();
for (const r of libs) {
  if (!r.kommunkod) continue;
  if (!byKommun.has(r.kommunkod)) byKommun.set(r.kommunkod, []);
  byKommun.get(r.kommunkod).push(r);
}
const kommunKedja = {};
for (const [kod, list] of byKommun) {
  const kn = norm(kommunName(kod));
  const knStem = kn.replace(/s$/, '');
  for (const r of list) {
    const label = `${r.namn} ${r.dept} ${r.l.name}`;
    if (BUSS.test(label)) r.typ = 'bokbuss';
    else if (STATION.test(label)) r.typ = 'utlaningsstation';
  }
  const stationary = list.filter((r) => !r.typ);
  let best = null;
  for (const r of stationary) {
    const n = norm(r.namn), lbl = `${r.namn} ${r.dept} ${r.l.name}`;
    let s = 0;
    if (/stadsbibliotek|huvudbibliotek|centralbibliotek|kommunbibliotek/i.test(lbl)) s += 5;
    const first = kn.split(' ')[0];
    if ([kn, `${kn}s`, first, `${first}s`].some((p) => n.startsWith(`${p} `) || n === p) && /bibliotek/.test(n)) s += 3;
    if (/lansbib|lanecentral/.test(r.l.library_subtype || '')) s += 3;
    const pats = [`${kn} bibliotek`, `${kn}s bibliotek`, `${knStem} bibliotek`, `bibliotek ${kn}`, `biblioteket i ${kn}`, `${kn} kommunbibliotek`, `${kn}s kommunbibliotek`, `${kn} folkbibliotek`, `${kn}s folkbibliotek`, `${kn}s stadsbibliotek`, `${kn} stadsbibliotek`, `${kn}biblioteket`, `${kn} biblioteket`, `biblioteken i ${kn}`, `${kn}s sockenbibliotek`, `${kn} kommun biblioteket`];
    if (pats.includes(n)) s += 4;
    if (/^(folkbiblioteket|stadsbiblioteket|huvudbiblioteket)$/.test(n)) s += 4;
    if (r.ort && norm(r.ort) === kn) s += 1;
    if (r.l.statistics) s += 0.5;
    if (/kulturhus|kulturcentrum/i.test(lbl)) s += 0.5;
    if (!best || s > best.s) best = { r, s };
  }
  const forced = list.find((r) => r.ov.typ === 'huvudbibliotek');
  let huvud = forced || (best && best.s >= 4 ? best.r : null);
  if (!huvud && stationary.length === 1) huvud = stationary[0];
  for (const r of stationary) r.typ = r === huvud ? 'huvudbibliotek' : huvud ? 'filial' : 'bibliotek';
  for (const r of list) if (r.ov.typ) r.typ = r.ov.typ;
  // kedja: explicit override > org-level record name > "X stadsbibliotek"-style huvudbibliotek name > null
  // organisation-style record names that actually name this kommun ("Biblioteken i Göteborg", "Bibliotek Uppsala")
  const org = list.map((r) => r.kedjaKandidat).find((c) => c && /^(bibliotek(en)?( i| på)? |folkbiblioteken i )/i.test(c) && norm(c).includes(knStem));
  kommunKedja[kod] = (overrides.kedja || {})[kod]
    || org
    || (huvud && /stadsbibliotek|kommunbibliotek|folkbibliotek/i.test(huvud.namn) ? huvud.namn : null)
    || (huvud && norm(huvud.namn).includes(knStem) && /bibliotek/i.test(huvud.namn) ? huvud.namn : null);
}
for (const r of libs) if (!r.typ) r.typ = BUSS.test(r.namn) ? 'bokbuss' : 'bibliotek';

// ---------------------------------------------------------------- 7. opening hours + meröppet
const SELF_NAME = /mer[öo]ppet|meröppen/i;
let hoursStats = { osm: 0, bibdb: 0, webb: 0, ingen: 0 };
for (const r of libs) {
  const t = r.osm?.tags || {};
  const osmP = t.opening_hours ? parseOsmHours(t.opening_hours, TODAY) : null;
  const bibText = r.l.open_hours || r.extraHoursText || null;
  const bibP = bibText ? parseSwedishHours(bibText) : null;
  const webP = web.results[r.sigel]?.week ? web.results[r.sigel] : null;
  const osmSelf = t['opening_hours:self_service'] ? parseOsmHours(t['opening_hours:self_service'], TODAY) : null;
  let week = null, kalla = null;
  const order = [
    [osmP && osmP.ok && osmP.week, () => osmP.week, 'osm'],
    [webP, () => webP.week, 'webb'],
    [bibP && bibP.ok && bibP.week, () => bibP.week, 'bibdb'],
    [osmP && osmP.week, () => osmP.week, 'osm'],
    [bibP && bibP.week, () => bibP.week, 'bibdb'],
  ];
  for (const [cond, get, k] of order) if (cond) { week = get(); kalla = k; break; }
  // summer/winter split (OSM: evaluated day by day for the build year; bibdb: a "Sommartider ..." section)
  r.sommar = null; r.vinter = null;
  if (kalla === 'osm') {
    const s = osmSeasons(t.opening_hours, TODAY.getFullYear());
    if (s) { r.sommar = s.sommar; r.vinter = s.vinter; }
  } else if (kalla === 'bibdb' && bibP.sommar) {
    r.sommar = bibP.sommar;
    r.vinter = { fran: null, till: null, tider: bibP.week };
    if (inPeriod(bibP.sommar, TODAY)) week = bibP.sommar.tider; // build date falls inside the stated summer period
  }
  if (r.sommar) { const ip = inPeriod(r.sommar, TODAY); r.sasong = ip === null ? null : ip ? 'sommar' : 'vinter'; }
  hoursStats[kalla || 'ingen']++;
  r.oppettider = week ? Object.fromEntries(DAYS.map((d) => [d, week[d] ?? null])) : Object.fromEntries(DAYS.map((d) => [d, null]));
  r.oppettiderKalla = kalla;
  r.oppettiderText = kalla === 'osm' ? t.opening_hours : kalla === 'bibdb' ? bibText.trim() : kalla === 'webb' ? webP.raw : null;
  r.oppettiderKomplett = !!week && DAYS.every((d) => week[d]);
  const meroppetWeek = (osmSelf && (osmSelf.week || osmSelf.meroppetWeek)) || osmP?.meroppetWeek || bibP?.meroppetWeek || null;
  const evidence = !!(meroppetWeek || t.self_service === 'yes' || t['opening_hours:self_service'] || (bibP && bibP.meroppet) || SELF_NAME.test(`${r.namn} ${t.description || ''}`) || /mer[öo]ppet/i.test(t.opening_hours || ''));
  r.meroppet = evidence ? true : null;
  r.meroppetTider = meroppetWeek ? Object.fromEntries(DAYS.map((d) => [d, meroppetWeek[d] ?? null])) : null;
}

// ---------------------------------------------------------------- 8. output records
const lanName = (kod) => (kod ? scb.lan[kod.slice(0, 2)] || null : null);
const slugCount = new Map();
const sorted = libs.slice().sort((a, b) => (a.kommunkod || '').localeCompare(b.kommunkod || '') || a.namn.localeCompare(b.namn, 'sv') || a.sigel.localeCompare(b.sigel));
const out = sorted.map((r) => {
  let slug = slugify(r.namn);
  if (slugCount.has(slug)) slug = `${slug}-${slugify(r.ort || kommunName(r.kommunkod) || r.sigel)}`;
  while (slugCount.has(slug)) slug = `${slug}-${r.sigel.toLowerCase()}`;
  slugCount.set(slug, true);
  const kallor = [`https://bibdb.libris.kb.se/library/${encodeURIComponent(r.sigel)}`];
  if (r.osm) kallor.push(`https://www.openstreetmap.org/${r.osm.osm}`);
  if (r.oppettiderKalla === 'webb') kallor.push(web.results[r.sigel].url);
  return {
    id: `bibdb-${r.sigel}`,
    namn: r.namn,
    kedja: r.kommunkod ? kommunKedja[r.kommunkod] || null : null,
    typ: r.typ,
    gatuadress: r.gatuadress,
    postnummer: r.postnummer,
    ort: r.ort,
    kommun: kommunName(r.kommunkod),
    lan: lanName(r.kommunkod),
    lat: r.lat,
    lon: r.lon,
    telefon: r.telefon,
    webb: r.webb,
    oppettider: r.oppettider,
    extra: {
      meroppet: r.meroppet,
      meroppet_tider: r.meroppetTider,
      // { fran: "MM-DD" | "vNN" | null, till, tider: {mon..sun} } – only when a clear summer/winter split exists
      oppettider_sommar: r.sommar,
      oppettider_vinter: r.vinter,
      oppettider_sasong: r.sasong || null,
      oppettider_kalla: r.oppettiderKalla,
      oppettider_text: r.oppettiderText,
      oppettider_komplett: r.oppettiderKomplett,
      slug,
      sigel: r.sigel,
      kommunkod: r.kommunkod,
      kommun_kalla: r.kommunKalla,
      ort_kalla: r.ortKalla || 'adress',
      koordinat_kalla: r.koordKalla,
      epost: r.epost,
      integrerat_skolbibliotek: r.l.library_type === 'folkskolbib' || undefined,
      i_biblioteksstatistiken: r.l.statistics,
      bibdb_namn: r.l.name !== r.namn ? r.l.name : undefined,
      bibdb_andrad: r.l.date_modified ? r.l.date_modified.slice(0, 10) : null,
      osm_id: r.osm ? r.osm.osm : null,
      osm_wikidata: r.osm?.tags.wikidata || null,
      rullstol: r.osm?.tags.wheelchair || null,
    },
    kallor,
    uppdaterad: TODAY.toISOString().slice(0, 10),
  };
});
// drop undefined keys inside extra for cleanliness
for (const o of out) for (const k of Object.keys(o.extra)) if (o.extra[k] === undefined) delete o.extra[k];

// ---------------------------------------------------------------- 9. kommuner.json
const kommuner = Object.entries(scb.kommuner).sort().map(([kod, namn]) => {
  const list = out.filter((o) => o.extra.kommunkod === kod);
  return {
    kommunkod: kod, namn, lan: lanName(kod), slug: slugify(namn),
    kedja: kommunKedja[kod] || null,
    antal_bibliotek: list.length,
    huvudbibliotek: list.find((o) => o.typ === 'huvudbibliotek')?.id || null,
    bibliotek: list.map((o) => o.id),
  };
});

// ---------------------------------------------------------------- 10. report
const pct = (n) => `${((100 * n) / out.length).toFixed(1)}%`;
const withHours = out.filter((o) => o.extra.oppettider_kalla).length;
const fullHours = out.filter((o) => o.extra.oppettider_komplett).length;
const typer = {};
for (const o of out) typer[o.typ] = (typer[o.typ] || 0) + 1;
distances.sort((a, b) => a - b);
report.kallor = {
  bibdb: { url: bibdb.source, hamtad: bibdb.fetched, poster_totalt: bibdb.libraries.length, valda: selected.length },
  osm: { endpoint: osm.endpoint, osm_base: osm.osm_base, element: osm.libraries.length, matchade: usedOsm.size, licens: osm.license },
  scb: { url: scb.source, hamtad: scb.fetched, licens: scb.license },
  webb: web.summary || null,
};
report.statistik = {
  bibliotek: out.length,
  typer,
  kommuner_med_bibliotek: kommuner.filter((k) => k.antal_bibliotek > 0).length,
  kommuner_utan_bibliotek: kommuner.filter((k) => !k.antal_bibliotek).map((k) => k.namn),
  med_koordinater: pct(out.filter((o) => o.lat !== null).length),
  med_oppettider: `${withHours} (${pct(withHours)})`,
  med_kompletta_oppettider: `${fullHours} (${pct(fullHours)})`,
  oppettider_per_kalla: hoursStats,
  meroppet_true: out.filter((o) => o.extra.meroppet).length,
  med_adress: pct(out.filter((o) => o.gatuadress).length),
  med_postnummer: pct(out.filter((o) => o.postnummer).length),
  med_telefon: pct(out.filter((o) => o.telefon).length),
  med_webb: pct(out.filter((o) => o.webb).length),
  osm_matchade: usedOsm.size,
  koordinatavvikelse_bibdb_osm_m: distances.length ? { median: Math.round(distances[distances.length >> 1]), p90: Math.round(distances[Math.floor(distances.length * 0.9)]), max: Math.round(distances[distances.length - 1]) } : null,
  kommun_kalla: out.reduce((acc, o) => ((acc[o.extra.kommun_kalla] = (acc[o.extra.kommun_kalla] || 0) + 1), acc), {}),
  exkluderade: report.exkluderade.length,
};
for (const o of out) {
  if (!o.kommun) warn(o.extra.sigel, 'saknar kommun');
  if (!o.gatuadress) warn(o.extra.sigel, 'saknar gatuadress');
  if (o.lat === null) warn(o.extra.sigel, 'saknar koordinater');
}
const unmatched = osm.libraries.filter((o) => !usedOsm.has(o.osm)).map((o) => ({ osm: o.osm, namn: o.tags.name || null, operator: o.tags.operator || null, kommun: o.kommun_name, lat: o.lat, lon: o.lon, opening_hours: o.tags.opening_hours || null }));

if (out.length < 800) throw new Error(`only ${out.length} libraries – refusing to overwrite outputs`);
writeJSON(path.join(DATA, 'bibliotek.json'), out);
writeJSON(path.join(DATA, 'kommuner.json'), kommuner);
writeJSON(path.join(DATA, 'rapport.json'), report);
writeJSON(path.join(DATA, 'osm-omatchade.json'), unmatched);
console.log(JSON.stringify(report.statistik, null, 1));
