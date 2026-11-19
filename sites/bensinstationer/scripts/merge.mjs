// Slår ihop kedjedata (data/raw/*.json) med OSM-datasetet (osm-data/data/bensinstationer.json, läses bara)
// -> data/stationer.json, data/slugs.json, data/rapport.json.
//
// Matchning: samma kedjefamilj inom 150 m, ELLER samma familj + samma gatunamn inom 1 km,
// ELLER OSM-station utan varumärke inom 60 m (150 m om gatunamnet stämmer). Girig 1:1-tilldelning efter poäng.
// Kedjedata vinner för adress, öppettider och tjänster; OSM fyller luckor. Kommun/län: OSM:s för matchade,
// punkt-i-polygon (SCB) för nya. Id och slug hålls stabila via data/slugs.json.
import path from 'node:path';
import { DATA, RAW, OSM_FILE, readJSON, writeJSON, log, today, nowIso, Grid, distM, fold, streetKey, slug, kommunFor, isAlwaysOpen, DAYS, emptyDrivmedel, emptyTjanster, normPhone } from './lib.mjs';

const SOURCES = [
  ['circlek', 'Circle K/INGO stationssök (circlek.se)'],
  ['okq8', 'OKQ8 Hitta station (okq8.se)'],
  ['preem', 'Preem stationer (preem.se)'],
  ['st1', 'St1 Hitta station (st1.se)'],
  ['qstar', 'Qstar karta (qstar.se)'],
  ['gulf', 'Gulf Hitta station (gulfsverige.com)'],
  ['dinx', 'Din-X (din-x.se)'],
];
const MATCH_M = 150;
const LISTPRIS_KEDJOR = { ck: 'Circle K', okq8: 'OKQ8', preem: 'Preem' };

function family(...names) {
  const s = fold(names.filter(Boolean).join(' '));
  if (!s) return null;
  if (/\b(circle k|statoil|ingo|circlek)\b/.test(s)) return 'ck';
  if (/\b(okq8|ok q8|ok-q8|q8|tanka|ids)\b/.test(s)) return 'okq8';
  if (/\b(preem|saifa)\b/.test(s)) return 'preem';
  if (/\b(st1|shell)\b/.test(s)) return 'st1';
  if (/\b(qstar|q star|bilisten|pump)\b/.test(s)) return 'qstar';
  if (/\bgulf\b/.test(s)) return 'gulf';
  if (/\b(din x|dinx)\b/.test(s)) return 'dinx';
  return 'other:' + s.split(' ')[0];
}
const CANON = [ // OSM-varianter -> visningsnamn
  [/^(circle k( truck)?|statoil)$/i, 'Circle K'], [/^ingo$/i, 'Ingo'], [/^(okq8|ok-?q8|ok q8)$/i, 'OKQ8'], [/^tanka$/i, 'Tanka'],
  [/^preem$/i, 'Preem'], [/^s(å|a)ifa$/i, 'Såifa'], [/^st1$/i, 'St1'], [/^shell$/i, 'Shell'], [/^q-?\s?star$/i, 'Qstar'],
  [/^bilisten$/i, 'Bilisten'], [/^pump$/i, 'Pump'], [/^gulf$/i, 'Gulf'], [/^din-?\s?x$/i, 'Din-X'],
];
const canonKedja = (k) => { if (!k) return null; for (const [re, v] of CANON) if (re.test(k.trim())) return v; return k.trim(); };

// ---------------------------------------------------------------- OSM-normalisering
const OSM_FUEL = {
  octane_95: 'bensin95', e10: 'bensin95', gasoline: 'bensin95', gasoline_95: 'bensin95', octane_96: 'bensin95', octane_91: 'bensin95', '91UL': 'bensin95',
  octane_98: 'bensin98', octane_98_e5: 'bensin98', e5: 'bensin98', octane_100: 'bensin98', octane_102: 'bensin98', vpower: 'bensin98',
  diesel: 'diesel', HGV_diesel: 'diesel', diesel_b7: 'diesel', diesel_b0: 'diesel', GTL_diesel: 'diesel', diesel_plus: 'diesel',
  hvo100: 'hvo100', HVO100: 'hvo100', e85: 'e85', ethanol: 'e85', ethanol_85: 'e85', ed95: 'ed95',
  cng: 'biogas', CNG: 'biogas', biogas: 'biogas', cbg: 'biogas', compressed_biogas: 'biogas', lbg: 'biogas', liquid_biogas: 'biogas', lng: 'biogas',
  electricity: 'el', electric: 'el', adblue: 'adblue', lpg: 'lpg', propane: 'lpg', h35: 'vatgas', h70: 'vatgas', LH2: 'vatgas', biodiesel: 'biodiesel', Akylatbensin: 'alkylat',
};
function osmDrivmedel(o) {
  const d = {};
  for (const [k, v] of Object.entries(o.extra?.drivmedel || {})) { const m = OSM_FUEL[k]; if (m && v != null) d[m] = d[m] === true ? true : !!v; }
  return d;
}
function osmTjanster(o) {
  const e = o.extra || {}; const t = {};
  if (e.shop != null) t.butik = !(e.shop === 'no' || e.shop === false);
  if (e.car_wash != null) t.biltvatt = !!e.car_wash;
  if (e.toilets != null) t.toalett = !!e.toilets;
  if (e.hgv === 'yes' || e.hgv === true || e.extra?.drivmedel?.HGV_diesel || o.extra?.drivmedel?.HGV_diesel) t.truckdiesel = true;
  if (e.compressed_air != null) t.luft_vatten = !!e.compressed_air;
  if (o.extra?.drivmedel?.adblue) t.adblue = true;
  if (o.extra?.drivmedel?.electricity) t.laddning = true;
  return t;
}
function osmTyp(o, kedja) {
  const e = o.extra || {};
  if (/truck/i.test(o.namn || '') || /truck/i.test(e.osm_namn || '')) return 'truckstation';
  if (e.automated === true || o.typ === 'automatstation' || e.shop === 'no' || e.self_service === 'only') return 'obemannad';
  if (['Ingo', 'Tanka', 'Qstar', 'Bilisten', 'Pump'].includes(kedja)) return 'obemannad';
  if (e.shop && e.shop !== 'no') return 'bemannad';
  return null;
}

// ---------------------------------------------------------------- hjälp
const houseNo = (s) => (String(s || '').match(/\s(\d+)\s*[a-z]?\b/i) || [])[1] || null;
const plats = (gata) => {
  if (!gata) return null;
  const g = String(gata).split(',')[0].trim();
  const m = g.match(/^(.*?\p{L}[\p{L}.\-' ]*?)\s+\d/u);
  return (m ? m[1] : g).trim() || null;
};
function mergeBools(a, b) { // a vinner, b fyller luckor
  const out = { ...b };
  for (const [k, v] of Object.entries(a)) if (v != null) out[k] = v;
  return out;
}
const cleanStreet = (g) => {
  if (!g) return null;
  const parts = String(g).split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !/^(attn|c\/o|att:)/i.test(x));
  return parts.join(', ') || null;
};
const phoneKey = (p) => String(p || '').replace(/\D/g, '');
function pick(...v) { for (const x of v) if (x != null && x !== '') return x; return null; }

// ---------------------------------------------------------------- ladda
const osm = readJSON(OSM_FILE);
if (!Array.isArray(osm)) throw new Error(`kunde inte läsa OSM-filen ${OSM_FILE}`);
const kallStatus = {}; const chain = [];
const phoneCount = new Map();
for (const [k, label] of SOURCES) {
  const f = readJSON(path.join(RAW, `${k}.json`));
  kallStatus[k] = f ? { status: f.status, hamtad: f.hamtad || null, antal: f.stationer?.length || 0, fel: f.fel || null } : { status: 'saknas', antal: 0 };
  for (const s of f?.stationer || []) { if (s.kalla_extra?.stangd) continue; s.gatuadress = cleanStreet(s.gatuadress); chain.push({ ...s, _label: label }); if (s.telefon) phoneCount.set(phoneKey(s.telefon), (phoneCount.get(phoneKey(s.telefon)) || 0) + 1); }
}
log(`OSM: ${osm.length}, kedjeposter: ${chain.length}`);
// OSM-telefon: normalisera; nummer som förekommer på > 5 OSM-stationer är centrala kundtjänstnummer.
const osmPhoneCount = new Map(); for (const o of osm) if (o.telefon) osmPhoneCount.set(phoneKey(o.telefon), (osmPhoneCount.get(phoneKey(o.telefon)) || 0) + 1);
for (const o of osm) o._tel = o.telefon && osmPhoneCount.get(phoneKey(o.telefon)) <= 5 ? normPhone(o.telefon) : null;

// ---------------------------------------------------------------- matchning
const grid = new Grid(0.01);
osm.forEach((o, i) => { o._i = i; o._fam = family(o.kedja, o.extra?.brand, o.extra?.operator, o.extra?.osm_namn); o._street = streetKey(o.gatuadress); grid.add(o.lat, o.lon, o); });
const FAM_OF_SOURCE = { circlek: 'ck', okq8: 'okq8', preem: 'preem', st1: 'st1', qstar: 'qstar', gulf: 'gulf', dinx: 'dinx' };
const coveredFam = new Set(Object.entries(kallStatus).filter(([, v]) => v.antal > 50 || (v.antal > 10 && v.status === 'ok')).map(([k]) => FAM_OF_SOURCE[k]));
const famGrid = new Grid(0.01); chain.forEach((c) => famGrid.add(c.lat, c.lon, c));
const staleBrand = (o) => coveredFam.has(o._fam) && !famGrid.near(o.lat, o.lon, 1).some((c) => family(c.kedja) === o._fam && distM(c.lat, c.lon, o.lat, o.lon) < 300);
const pairs = [];
chain.forEach((c, ci) => {
  c._fam = family(c.kedja); c._street = streetKey(c.gatuadress);
  for (const o of grid.near(c.lat, c.lon, 1)) {
    const d = distM(c.lat, c.lon, o.lat, o.lon); if (d > 1000) continue;
    const sameStreet = c._street && o._street && c._street === o._street;
    const sameNo = sameStreet && houseNo(c.gatuadress) && houseNo(c.gatuadress) === houseNo(o.gatuadress);
    let score = null, metod = null;
    if (o._fam === c._fam) {
      if (d <= MATCH_M) { score = d - (sameStreet ? 30 : 0); metod = sameStreet ? 'kedja+avstand+gata' : 'kedja+avstand'; }
      else if (sameStreet && (sameNo || d <= 600)) { score = 100 + d * 0.3; metod = 'kedja+adress'; }
    } else if (o._fam == null) {
      if (d <= 80 || (sameStreet && d <= MATCH_M)) { score = 200 + d; metod = 'utan_varumarke+avstand'; }
    } else if (o._fam.startsWith('other:')) {
      // Okänt/gammalt varumärke i OSM (t.ex. JET, Bensin) precis på samma plats.
      if (d <= 40 || (sameNo && d <= 100)) { score = 300 + d; metod = 'annat_varumarke_osm+avstand'; }
    } else if (staleBrand(o)) {
      // OSM har en kedja vi har fullständig stationslista för, men kedjan har ingen station där -> varumärkesbyte.
      if (d <= 120 || (sameStreet && d <= 300)) { score = 400 + d; metod = 'varumarkesbyte'; }
    }
    if (score != null) pairs.push({ ci, oi: o._i, d, score, metod });
  }
});
pairs.sort((a, b) => a.score - b.score);
const chainMatch = new Map(), osmUsed = new Set();
for (const p of pairs) { if (chainMatch.has(p.ci) || osmUsed.has(p.oi)) continue; chainMatch.set(p.ci, p); osmUsed.add(p.oi); }

// ---------------------------------------------------------------- id/slug-register
const slugFile = path.join(DATA, 'slugs.json');
const reg = readJSON(slugFile, { nycklar: {}, slugs: {} });
const usedSlugs = new Map(); // kommun -> Set
const idsThisRun = new Set();
// Kedjeposters egna nycklar reserveras först, så att en OSM-nyckel aldrig "stjäl" ett id som en kedjepost redan har.
const reserved = new Map();
for (const c of chain) { const k = `${c.kalla}:${c.kalla_id}`; const v = reg.nycklar[k]; if (v && !idsThisRun.has(v)) { reserved.set(k, v); idsThisRun.add(v); } }
function assignId(keys, fallback) {
  if (reserved.has(keys[0])) { const id = reserved.get(keys[0]); for (const k of keys) reg.nycklar[k] = id; return id; }
  let id = keys.map((k) => reg.nycklar[k]).find((v) => v && !idsThisRun.has(v));
  if (!id) { id = fallback; let n = 2; while (idsThisRun.has(id)) id = `${fallback}-${n++}`; }
  idsThisRun.add(id);
  for (const k of keys) reg.nycklar[k] = id;
  return id;
}

// ---------------------------------------------------------------- bygg poster
const out = []; const dagsdatum = today();
const lanFromKommun = new Map(osm.filter((o) => o.kommun).map((o) => [o.kommun, o.lan]));
function finish(r) {
  const k = r.kommun || '_';
  if (!usedSlugs.has(k)) usedSlugs.set(k, new Set());
  const used = usedSlugs.get(k);
  let s = reg.slugs[r.id];
  if (!s || used.has(s)) {
    s = slug(r.namn) || 'station';
    const hn = houseNo(r.gatuadress);
    if (used.has(s) && hn) s = `${s}-${hn}`;
    let n = 2; const b = s; while (used.has(s)) s = `${b}-${n++}`;
  }
  used.add(s); reg.slugs[r.id] = s; r.slug = s;
  out.push(r);
}

chain.forEach((c, ci) => {
  const m = chainMatch.get(ci); const o = m ? osm[m.oi] : null;
  const keys = [`${c.kalla}:${c.kalla_id}`, ...(o ? [`osm:${o.id}`] : [])];
  const id = assignId(keys, `${c.kalla}-${slug(c.kalla_id)}`);
  let kommun = o?.kommun, lan = o?.lan, kommunkod = o?.extra?.kommunkod, kommunMetod = o ? 'osm' : null;
  if (!kommun) {
    const k = kommunFor(c.lat, c.lon);
    if (k) { kommun = k.kommun; lan = k.lan; kommunkod = k.kommunkod; kommunMetod = k.metod; }
    else if (c.kommun_kalla) { kommun = c.kommun_kalla; lan = lanFromKommun.get(kommun) || c.lan_kalla || null; kommunMetod = 'kalla'; }
  }
  const ort = pick(c.ort, o?.ort);
  // Nummer som delas av > 10 stationer är kedjans kundtjänst, inte stationens telefon.
  const central = c.telefon && phoneCount.get(phoneKey(c.telefon)) > 10;
  const telefon = central ? o?._tel || null : c.telefon || o?._tel || null;
  const gatuadress = pick(c.gatuadress, o?.gatuadress);
  const pl = plats(gatuadress) || (c.namn_kalla || '').replace(new RegExp(`^${c.kedja}\\s*`, 'i'), '').split(',')[0].trim() || null;
  const ortN = ort || kommun;
  const namn = [c.kedja, pl && fold(pl) !== fold(ortN) ? pl : null].filter(Boolean).join(' ') + (ortN ? `, ${ortN}` : '');
  const drivmedel = mergeBools(c.drivmedel || {}, o ? osmDrivmedel(o) : {});
  const tjanster = mergeBools(c.tjanster || {}, o ? osmTjanster(o) : {});
  if (drivmedel.el) tjanster.laddning = true; if (drivmedel.adblue) tjanster.adblue = true;
  const oppettider = c.oppettider || o?.oppettider || null;
  const pumpar = c.oppettider_pumpar || (c.typ !== 'bemannad' ? oppettider : null);
  const fam = family(c.kedja);
  finish({
    id, namn, kedja: c.kedja, typ: c.typ || (o ? osmTyp(o, c.kedja) : null),
    gatuadress, postnummer: pick(c.postnummer, o?.postnummer), ort,
    kommun: kommun || null, lan: lan || null,
    lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6),
    telefon, webb: pick(c.webb, o?.webb),
    oppettider,
    extra: {
      drivmedel: { ...emptyDrivmedel(), ...drivmedel }, tjanster: { ...emptyTjanster(), ...tjanster },
      priser: c.priser || null,
      listpris_kedja: LISTPRIS_KEDJOR[fam] && ['Circle K', 'OKQ8', 'Preem'].includes(c.kedja) ? LISTPRIS_KEDJOR[fam] : null,
      obemannad_dygnet_runt: c.typ !== 'bemannad' && isAlwaysOpen(pumpar) ? true : (c.typ === 'bemannad' ? false : null),
      oppettider_butik: c.oppettider_butik || null, oppettider_pumpar: pumpar || null,
      oppettider_kalla: c.oppettider ? c.kalla : o?.oppettider ? 'osm' : null,
      kommunkod: kommunkod || null, kommun_metod: kommunMetod, kundtjanst_telefon: central ? c.telefon : undefined,
      kalla_id: `${c.kalla}:${c.kalla_id}`, osm_id: o?.id || null,
      matchning: o ? { metod: m.metod, avstand_m: Math.round(m.d) } : null,
      endast_kedja: !o || undefined,
      ...Object.fromEntries(Object.entries(c.kalla_extra || {}).filter(([, v]) => v !== undefined)),
    },
    kallor: [c._label, ...(o ? ['OpenStreetMap'] : [])],
    uppdaterad: dagsdatum,
  });
});

// OSM-stationer utan kedjematchning. Dubbletter (samma familj < 40 m från en kedjestation) tas bort.
const chainGrid = new Grid(0.01); out.forEach((r) => chainGrid.add(r.lat, r.lon, r));
let osmDup = 0;
for (const o of osm) {
  if (osmUsed.has(o._i)) continue;
  if (o._fam && chainGrid.near(o.lat, o.lon, 1).some((r) => family(r.kedja) === o._fam && distM(r.lat, r.lon, o.lat, o.lon) < 40)) { osmDup++; continue; }
  const kedja = canonKedja(o.kedja);
  const id = assignId([`osm:${o.id}`], o.id);
  const t = osmTjanster(o); const d = osmDrivmedel(o);
  const typ = osmTyp(o, kedja);
  finish({
    id, namn: o.namn, kedja, typ,
    gatuadress: o.gatuadress, postnummer: o.postnummer, ort: o.ort, kommun: o.kommun, lan: o.lan, lat: o.lat, lon: o.lon,
    telefon: o._tel, webb: o.webb, oppettider: o.oppettider,
    extra: {
      drivmedel: { ...emptyDrivmedel(), ...d }, tjanster: { ...emptyTjanster(), ...t }, priser: null,
      listpris_kedja: null,
      obemannad_dygnet_runt: typ && typ !== 'bemannad' && isAlwaysOpen(o.oppettider) ? true : null,
      oppettider_butik: null, oppettider_pumpar: null, oppettider_kalla: o.oppettider ? 'osm' : null,
      kommunkod: o.extra?.kommunkod || null, kommun_metod: 'osm', kalla_id: null, osm_id: o.id, matchning: null,
      endast_osm: true, osm_namn: o.extra?.osm_namn || null, opening_hours_osm: o.extra?.opening_hours_osm || null,
      ej_i_kedjans_stationslista: coveredFam.has(o._fam) || undefined,
    },
    kallor: ['OpenStreetMap'],
    uppdaterad: o.uppdaterad || dagsdatum,
  });
}

out.sort((a, b) => (a.kommun || '~').localeCompare(b.kommun || '~', 'sv') || a.namn.localeCompare(b.namn, 'sv'));
reg.uppdaterad = nowIso();
writeJSON(slugFile, reg, false);
writeJSON(path.join(DATA, 'stationer.json'), out, false);

// ---------------------------------------------------------------- rapport
const pct = (n, t) => (t ? Math.round((1000 * n) / t) / 10 : 0);
const stat = (arr) => ({
  antal: arr.length,
  adress_pct: pct(arr.filter((r) => r.gatuadress).length, arr.length),
  oppettider_pct: pct(arr.filter((r) => r.oppettider && DAYS.some((d) => r.oppettider[d])).length, arr.length),
  priser_pct: pct(arr.filter((r) => r.extra.priser).length, arr.length),
  telefon_pct: pct(arr.filter((r) => r.telefon).length, arr.length),
  kommun_pct: pct(arr.filter((r) => r.kommun).length, arr.length),
});
const perKedja = {};
for (const r of out) (perKedja[r.kedja || '(okänd)'] ||= []).push(r);
const kedjaStat = Object.fromEntries(Object.entries(perKedja).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, { ...stat(v), fran_kedja: v.filter((r) => !r.extra.endast_osm).length, endast_osm: v.filter((r) => r.extra.endast_osm).length }]));
const matchMetod = {}; for (const p of chainMatch.values()) matchMetod[p.metod] = (matchMetod[p.metod] || 0) + 1;
const rapport = {
  genererad: nowIso(), osm_fil: path.relative(path.resolve(DATA, '..'), OSM_FILE).split(path.sep).join('/'), osm_antal: osm.length, kedjeposter: chain.length,
  matchade: chainMatch.size, kedja_utan_osm: chain.length - chainMatch.size, endast_osm: out.filter((r) => r.extra.endast_osm).length, osm_dubbletter_borttagna: osmDup,
  matchmetoder: matchMetod, totalt: stat(out), kallor: kallStatus, per_kedja: kedjaStat,
};
writeJSON(path.join(DATA, 'rapport.json'), rapport);
log(`stationer.json: ${out.length} (matchade ${chainMatch.size}, nya från kedjor ${chain.length - chainMatch.size}, endast OSM ${rapport.endast_osm}, OSM-dubbletter bort ${osmDup})`);
log(`täckning: adress ${rapport.totalt.adress_pct} %, öppettider ${rapport.totalt.oppettider_pct} %, priser ${rapport.totalt.priser_pct} %`);
