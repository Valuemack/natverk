// Slår ihop OSM-dataseten (../osm-data/data, läses) med kommunala öppna data och operatörsdata.
// Officiella uppgifter vinner över OSM. Matchning: avstånd + namnlikhet, en-till-en.
// Utdata: data/parkeringar.json, data/lekplatser.json, data/slugs.json, data/id-map.json,
//         data/kommuner-lekplatser.json, data/rapport.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, RAW_DIR, SITE_DIR, readJson, writeJson, haversineM } from './lib.mjs';
import { LEK, PARK, ARCGIS } from './sources.mjs';
import { kommunFor, kommuner } from './geo.mjs';
import { lekFromProps, parkFromProps, equipFromOsm, equipFromText, nameSim, slugify, titleCase, pcFmt, parkTyp, perTimme, cleanTaxa, avgiftOf } from './normalize.mjs';
import { pointInRings } from './lib.mjs';

const OSM_DIR = path.resolve(SITE_DIR, '..', 'osm-data', 'data');
const TODAY = new Date().toISOString().slice(0, 10);
const osmPark = readJson(path.join(OSM_DIR, 'parkeringar.json'));
const osmLek = readJson(path.join(OSM_DIR, 'lekplatser.json'));
const kommunNamn = new Map(kommuner().map((k) => [k.namn, k]));
const reuseOk = (lic) => /CC0|CC BY(?!-NC)|CC-BY(?!-NC)|fritt/i.test(lic || '') && !/NC|ND/.test(lic || ''); // fritext bara vid fri licens
const KOMMUN_ORG = (k) => (/^(Malmö|Göteborg|Stockholm|Borås|Västerås|Helsingborg|Lidingö)$/.test(k) ? `${/^(Göteborg|Stockholm|Helsingborg)$/.test(k) ? k + "s" : k} stad` : k === 'Gotland' ? 'Region Gotland' : `${k} kommun`);
const kallaText = (src) => `${KOMMUN_ORG(src.kommun)} – öppna data (${src.licens})`;

// ---------------- rumsligt index ----------------
class Grid {
  constructor(cell = 0.005) { this.cell = cell; this.m = new Map(); }
  key(lat, lon) { return `${Math.floor(lat / this.cell)}:${Math.floor(lon / (this.cell * 2))}`; }
  add(o) { const k = this.key(o.lat, o.lon); if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push(o); }
  near(lat, lon, r) {
    const out = []; const dy = Math.ceil(r / 111000 / this.cell) + 1, dx = Math.ceil(r / 111000 / (this.cell * 2) / Math.cos(lat * Math.PI / 180)) + 1;
    const cy = Math.floor(lat / this.cell), cx = Math.floor(lon / (this.cell * 2));
    for (let y = cy - dy; y <= cy + dy; y++) for (let x = cx - dx; x <= cx + dx; x++) for (const o of this.m.get(`${y}:${x}`) || []) { const d = haversineM({ lat, lon }, o); if (d <= r) out.push({ o, d }); }
    return out.sort((a, b) => a.d - b.d);
  }
}
const loadRaw = (tema, id) => readJson(path.join(RAW_DIR, 'kommun', `${tema}-${id}.json`), null);
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const idMap = readJson(path.join(DATA_DIR, 'id-map.json'), {});
const usedIds = new Set();
function officialId(prefix, src, rec) {
  const key = `${src.id}|${rec.kallid || `${(rec.namn || '').toLowerCase()}|${rec.lat.toFixed(4)},${rec.lon.toFixed(4)}`}`;
  return { key, id: idMap[key] || `${prefix}-${slugify(src.id)}-${rec.kallid ? slugify(String(rec.kallid)).slice(0, 40) : hash(key)}` };
}
const nameTokensOk = (n) => /[a-zåäö]{3}/i.test(String(n).replace(/(parkering|lekplats|p-hus|garage)/gi, ''));
const isOsmDefaultName = (n) => !n || /^(Lekplats|Parkering|Parkeringsgarage|Parkeringshus) vid /.test(n);

// Matchar officiella poster mot kandidater (OSM + tidigare tillagda). Returnerar Map(off -> target).
function match(offs, grid, { r1, r2, sim, nameOf = (o) => o.namn }) {
  const pairs = [];
  for (const off of offs) for (const { o, d } of grid.near(off.lat, off.lon, r2)) {
    const on = nameOf(o);
    const s = nameSim(off.namn, on) || (off.gatuadress && o.gatuadress && off.gatuadress.toLowerCase() === o.gatuadress.toLowerCase() ? 1 : 0);
    // två olika riktiga namn: kräv mycket kort avstånd
    const conflict = off.namn && on && !isOsmDefaultName(on) && s === 0 && nameTokensOk(off.namn) && nameTokensOk(on);
    if ((d <= (conflict ? 20 : r1)) || s >= sim) pairs.push({ off, o, score: d - s * r2 });
  }
  pairs.sort((a, b) => a.score - b.score);
  const used = new Set(), res = new Map();
  for (const p of pairs) if (!res.has(p.off) && !used.has(p.o)) { res.set(p.off, p.o); used.add(p.o); }
  return res;
}
function kommunOf(lat, lon, fallbackKommun) {
  const k = kommunFor(lat, lon) || kommunFor(lat, lon, 25000); // havsbandsöar utanför SCB:s generaliserade gränser
  if (k) return { kommun: k.namn, lan: k.lan, kommunkod: k.kod, metod: k.metod };
  const f = kommunNamn.get(fallbackKommun); return f ? { kommun: f.namn, lan: f.lan, kommunkod: f.kod, metod: 'källans kommun' } : { kommun: null, lan: null, kommunkod: null, metod: null };
}
const first = (...v) => v.find((x) => x != null && x !== '');
const rapport = { genererad: new Date().toISOString(), lekplatser: {}, parkeringar: {} };

// =====================================================================
// LEKPLATSER
// =====================================================================
const lekSources = [...LEK.map((s) => ({ ...s, tema: 'lek' })), ...ARCGIS.filter((s) => s.tema === 'lek')];
const lekOff = [], lekUtr = [], lekSrcStat = {};
for (const src of lekSources) {
  const raw = loadRaw('lek', src.id); if (!raw) { lekSrcStat[src.id] = { kommun: src.kommun, antal: 0, status: 'saknas (ej hämtad/blockerad)' }; continue; }
  if (src.licens && /NC/.test(src.licens)) { lekSrcStat[src.id] = { kommun: src.kommun, antal: 0, status: 'utesluten (NC-licens)' }; continue; }
  let n = 0;
  for (const f of raw.features) {
    if (src.roll === 'utrustning') { const t = [f.props.type, f.props.Typ, f.props.typ, f.props.UNDERKAT, f.props.BES_NAMN, f.props.UTRUSTNING, f.props.Utrustning, f.props.Benamning, f.props.BENAMNING].filter(Boolean).join(', '); if (t) lekUtr.push({ lat: f.lat, lon: f.lon, text: String(t), src }); n++; continue; }
    if (src.id === 'sater' && f.props.KATEGORI !== 'Lekplats') continue;
    const r = lekFromProps(f.props, src);
    lekOff.push({ ...r, lat: f.lat, lon: f.lon, src }); n++;
  }
  lekSrcStat[src.id] = { kommun: src.kommun, licens: src.licens, antal: n, url: raw.url };
}
// dubbletter mellan officiella källor (t.ex. Borås-post i Varas fil)
{
  const g = new Grid(); const keep = [];
  for (const o of lekOff) {
    const dup = g.near(o.lat, o.lon, 30).find(({ o: x }) => !o.namn || !x.namn || nameSim(o.namn, x.namn) >= 0.5);
    if (dup) { for (const k of ['utrustning']) dup.o[k] = [...new Set([...dup.o[k], ...o[k]])].sort(); continue; }
    g.add(o); keep.push(o);
  }
  rapport.lekplatser.officiella_dubbletter_borttagna = lekOff.length - keep.length;
  lekOff.length = 0; lekOff.push(...keep);
}
const lekGrid = new Grid(); for (const o of osmLek) lekGrid.add(o);
const lekMatch = match(lekOff, lekGrid, { r1: 60, r2: 150, sim: 0.6 });
const lekByOsm = new Map(); for (const [off, o] of lekMatch) lekByOsm.set(o.id, off);

function buildLek(osm, off) {
  const ox = osm?.extra || {};
  const utr = new Set([...(off?.utrustning || []), ...equipFromOsm(ox.utrustning)]);
  if (osm?.namn && !isOsmDefaultName(osm.namn)) for (const e of equipFromText(osm.namn)) if (['skatepark', 'utegym', 'vattenlek', 'trafiklekplats', 'parkour'].includes(e)) utr.add(e);
  const tema = first(off?.tema, ox.theme && ox.theme !== 'nature' ? ox.theme : null);
  const naturlek = off?.naturlek || ox.theme === 'nature' || /naturlek/i.test(osm?.namn || '');
  const typ = tema || off?.temaflagga || /temalek/i.test(osm?.namn || '') ? 'temalekplats' : naturlek ? 'naturlekplats' : 'lekplats';
  const offName = off?.namn && !(off.namn.length < 4) ? off.namn : null;
  const namn = first(offName && (isOsmDefaultName(osm?.namn) || !osm?.namn || nameSim(offName, osm.namn) < 1) ? offName : null, osm?.namn, offName);
  const lat = off ? off.lat : osm.lat, lon = off ? off.lon : osm.lon; // officiellt läge vinner
  const kom = osm ? { kommun: osm.kommun, lan: osm.lan, kommunkod: ox.kommunkod, metod: 'osm-data' } : kommunOf(lat, lon, off.src.kommun);
  const wc = ox.wheelchair; const osmTillg = wc === 'yes' ? 'tillgänglighetsanpassad' : wc === 'limited' ? 'delvis tillgänglighetsanpassad' : wc === 'no' ? 'ej tillgänglighetsanpassad' : null;
  const alder = first(off?.alder, ox.min_age || ox.max_age ? `${ox.min_age ?? 0}-${ox.max_age ?? ''} år`.replace(/-\s*år$/, '+ år') : null);
  const kallor = [...(osm?.kallor || []), ...(off ? [kallaText(off.src)] : [])];
  const extra = {
    ...(osm ? ox : { kommunkod: kom.kommunkod }),
    utrustning: [...utr].sort(), utrustning_antal: utr.size,
    tema: tema || null, alder: alder || null, tillganglighet: first(off?.tillganglighet, osmTillg) || null,
    toalett: first(off?.toalett) ?? null, inhagnad: ox.fenced === 'yes' ? true : ox.fenced === 'no' ? false : null,
    storlek: off?.storlek || null, belysning: first(off?.belysning, ox.lit === 'yes' ? true : ox.lit === 'no' ? false : null) ?? null,
    dricksvatten: off?.dricksvatten ?? null, underlag: first(off?.underlag, ox.surface) || null, senast_renoverad: off?.senast_renoverad || null,
    officiell_kalla: off ? off.src.id : null, officiell_licens: off ? off.src.licens : null,
    kommun_har_officiell_data: null, // fylls nedan
    matchning: osm && off ? `osm+officiell (${Math.round(haversineM(osm, off))} m)` : off ? 'endast officiell' : 'endast osm',
  };
  if (off?.beskrivning && reuseOk(off.src.licens)) extra.beskrivning = off.beskrivning;
  if (!osm) extra.kommun_metod = kom.metod;
  return {
    id: null, namn: namn || null, kedja: null, typ,
    gatuadress: first(off?.gatuadress, osm?.gatuadress) || null, postnummer: first(off?.postnummer, osm?.postnummer) || null,
    ort: first(off?.ort, osm?.ort) || null, kommun: kom.kommun, lan: kom.lan, lat, lon,
    telefon: osm?.telefon || null, webb: first(off?.webb, osm?.webb) || null, oppettider: osm?.oppettider || null,
    extra, kallor: [...new Set(kallor)], uppdaterad: off ? TODAY : osm.uppdaterad,
    _osmId: osm?.id, _off: off,
  };
}
const lekOut = [];
for (const o of osmLek) lekOut.push(buildLek(o, lekByOsm.get(o.id)));
for (const off of lekOff) if (!lekMatch.has(off)) lekOut.push(buildLek(null, off));
// utrustningspunkter (Lomma, Skellefteå) -> närmaste lekplats inom 40 m
{
  const g = new Grid(); for (const r of lekOut) g.add(r); let n = 0;
  for (const u of lekUtr) {
    const hit = g.near(u.lat, u.lon, 40)[0]; if (!hit) continue;
    const r = hit.o; const add = equipFromText(u.text); if (!add.size) continue;
    const s = new Set(r.extra.utrustning); for (const e of add) s.add(e); r.extra.utrustning = [...s].sort(); r.extra.utrustning_antal = s.size;
    const k = kallaText(u.src); if (!r.kallor.includes(k)) r.kallor.push(k); r.uppdaterad = TODAY; n++;
  }
  rapport.lekplatser.utrustningspunkter_kopplade = n;
}
// kommuner med officiell data
const lekKommunOff = new Map();
for (const src of lekSources) if ((lekSrcStat[src.id]?.antal || 0) > 0 && src.roll !== 'utrustning') {
  const e = lekKommunOff.get(src.kommun) || { kallor: [] }; e.kallor.push({ id: src.id, licens: src.licens, antal: lekSrcStat[src.id].antal }); lekKommunOff.set(src.kommun, e);
}
for (const r of lekOut) r.extra.kommun_har_officiell_data = lekKommunOff.has(r.kommun);

// =====================================================================
// PARKERING
// =====================================================================
const parkSources = [...PARK.map((s) => ({ ...s, tema: 'park' })), ...ARCGIS.filter((s) => s.tema === 'park')];
const parkOff = [], zoner = [], linjer = [], punktBerik = [], parkSrcStat = {};
for (const src of parkSources) {
  const raw = loadRaw('park', src.id); if (!raw) { parkSrcStat[src.id] = { kommun: src.kommun, antal: 0, status: 'saknas (ej hämtad/blockerad)' }; continue; }
  let n = 0;
  for (const f of raw.features) {
    const p = f.props; n++;
    if (src.roll === 'avgiftszoner') {
      if (!f.rings) continue;
      const taxa = [p.TAXA, p.Avgift, p.taxa, p.TAXA_TEXT, p.Taxa, p.ZONKOD, p.AVGIFT != null ? `avgift ${p.AVGIFT}` : null].find((x) => x != null && String(x).trim()) || null;
      const namn = [p.Zon, p.ZONTYP ? `Zon ${p.ZONTYP}` : null, p.UNDERKAT && p.NAMN ? `${p.UNDERKAT} (${p.NAMN})` : null, p.ZON, p.zon, p.TAXAZON ? `Taxezon ${p.TAXAZON}` : null, p.TAXEOMRADE, p.Namn, p.namn].find((x) => x != null && String(x).trim()) || null;
      if (/förbud/i.test(p.TYP || '')) continue;
      const xs = f.rings.flat(); const bbox = [Math.min(...xs.map((c) => c[0])), Math.min(...xs.map((c) => c[1])), Math.max(...xs.map((c) => c[0])), Math.max(...xs.map((c) => c[1]))];
      zoner.push({ rings: f.rings, bbox, taxa: taxa ? String(taxa) : null, namn: namn ? String(namn) : null, src }); continue;
    }
    if (src.roll === 'avgiftslinjer') { if (p.taxa) linjer.push({ lat: f.lat, lon: f.lon, taxa: p.taxa, namn: p.omrade || p.gata || null, src }); continue; }
    if (src.roll === 'laddplatser' || src.roll === 'handikapplatser') { if (p.LADDPLATS != null && p.LADDPLATS !== 'Ja') continue; punktBerik.push({ lat: f.lat, lon: f.lon, roll: src.roll, antal: Number(p.Antal_plats ?? p.antal ?? p.ANTAL ?? 1) || 1, src }); continue; }
    const r = parkFromProps(p, src);
    if (!r) continue;
    parkOff.push({ ...r, lat: f.lat, lon: f.lon, src, kalla: kallaText(src), kedja: r.kedja || null });
  }
  parkSrcStat[src.id] = { kommun: src.kommun, licens: src.licens, roll: src.roll || 'anläggningar', antal: n, url: raw.url };
}
// operatörer
const OPMETA = {
  stockholmparkering: { kedja: 'Stockholm Parkering', kalla: 'Stockholm Parkering (stockholmparkering.se, anläggningssida)' },
  aimo: { kedja: 'Aimo Park', kalla: 'Aimo Park (aimopark.se, anläggningssida)' },
  apcoa: { kedja: 'APCOA', kalla: 'APCOA (apcoa.se, anläggningssida)' },
};
const opStat = {};
for (const [k, meta] of Object.entries(OPMETA)) {
  if (process.env.UTAN_OPERATORER) { opStat[k] = { antal: 0, status: 'avstängt (UTAN_OPERATORER=1)' }; continue; }
  const raw = readJson(path.join(RAW_DIR, `operator-${k}.json`), null); if (!raw) { opStat[k] = { antal: 0, status: 'ej hämtad' }; continue; }
  let ut = 0, ok = 0;
  for (const r of raw.poster) {
    if (r.lat == null || r.lon == null || !(r.lat > 55 && r.lat < 69.1)) continue;
    if (!r.besoksparkering) { ut++; continue; }
    const typ = parkTyp(r.typ_kalla, r.namn) || 'markparkering';
    parkOff.push({
      kallid: r.webb, namn: titleCase(r.namn), gatuadress: r.gatuadress, postnummer: pcFmt(r.postnummer), ort: r.ort,
      kapacitet: r.kapacitet || null, avgift: r.avgift ?? (r.taxa ? avgiftOf(r.taxa) : null), taxa: cleanTaxa(r.taxa), taxa_per_timme: r.taxa_per_timme ?? perTimme(cleanTaxa(r.taxa)),
      max_tid: null, laddplatser: r.laddplatser, handikapplatser: r.handikapplatser, hojdbegransning: r.hojdbegransning, zonkod: r.zonkod,
      oppettider: r.oppettider, typ, webb: r.webb, lat: r.lat, lon: r.lon, kedja: meta.kedja, kalla: meta.kalla,
      src: { id: k, kommun: null, licens: 'operatörens publika webbsida (endast fakta)' }, operator: true,
    });
    ok++;
  }
  opStat[k] = { anlaggningar_med_besoksparkering: ok, endast_uthyrning_uteslutna: ut, totalt_sidor: raw.poster.length };
}
// matcha: officiella/operatörer mot OSM och mot varandra (kommun först, sedan operatörer)
const parkGrid = new Grid(); for (const o of osmPark) parkGrid.add(o);
const targets = new Map(); // osm-id eller ny post -> lista av officiella poster
const newPark = [];
const ordered = [...parkOff.filter((o) => !o.operator), ...parkOff.filter((o) => o.operator)];
for (const group of [ordered.filter((o) => !o.operator), ordered.filter((o) => o.operator)]) {
  const m = match(group, parkGrid, { r1: 60, r2: 200, sim: 0.6 });
  for (const off of group) {
    const t = m.get(off);
    if (t) { if (!targets.has(t)) targets.set(t, []); targets.get(t).push(off); }
    else { const n = { _new: true, lat: off.lat, lon: off.lon, namn: off.namn, gatuadress: off.gatuadress, offs: [off] }; newPark.push(n); parkGrid.add(n); targets.set(n, n.offs); }
  }
}
const CHAIN = [[/q-?park/i, 'Q-Park'], [/aimo/i, 'Aimo Park'], [/apcoa/i, 'APCOA'], [/easypark/i, 'EasyPark'], [/stockholm parkering|stockholms stads parkering/i, 'Stockholm Parkering'], [/parkering göteborg|göteborgs stads parkering|p-bolaget göteborg/i, 'Parkering Göteborg'], [/swedavia/i, 'Swedavia'], [/riksbyggen/i, 'Riksbyggen'], [/securitas/i, 'Securitas'], [/parkster/i, 'Parkster'], [/europark|europarc/i, 'Europark']];
const chainOf = (s) => { if (!s) return null; for (const [re, n] of CHAIN) if (re.test(s)) return n; return null; };
const AIRPORTS = [
  ['Stockholm Arlanda Airport', 59.6498, 17.9238, 'arlanda'], ['Göteborg Landvetter Airport', 57.6628, 12.2798, 'landvetter'], ['Bromma Stockholm Airport', 59.3544, 17.9417, 'bromma'],
  ['Malmö Airport', 55.5363, 13.3762, 'malmo'], ['Luleå Airport', 65.5438, 22.122, 'lulea'], ['Umeå Airport', 63.7918, 20.2828, 'umea'], ['Åre Östersund Airport', 63.1944, 14.5003, 'ostersund'],
  ['Visby Airport', 57.6628, 18.3462, 'visby'], ['Ronneby Airport', 56.2667, 15.265, 'ronneby'], ['Kiruna Airport', 67.822, 20.3368, 'kiruna'],
  ['Stockholm Skavsta Airport', 58.7886, 16.9122], ['Stockholm Västerås Airport', 59.5894, 16.6336], ['Norrköping Airport', 58.5863, 16.2506], ['Jönköping Airport', 57.7576, 14.0687],
  ['Halmstad Airport', 56.6911, 12.8202], ['Kalmar Öland Airport', 56.6855, 16.2876], ['Växjö Småland Airport', 56.9291, 14.728], ['Ängelholm Helsingborg Airport', 56.2961, 12.8471],
  ['Karlstad Airport', 59.4447, 13.3374], ['Örebro Airport', 59.2237, 15.038], ['Sundsvall Timrå Airport', 62.5281, 17.4439], ['Skellefteå Airport', 64.6248, 21.0769], ['Kristianstad Österlen Airport', 55.9217, 14.0855],
];
const AIRPORT_RE = /swedavia|airport|flygplats|terminal|långtid|korttid|express|premium|^p\s?\d|\bp\d+\b|arlanda|landvetter|bromma|skavsta|sky ?city|parkera.?flyg|flyg/i;
function airportOf(lat, lon, text) {
  if (/drop.?off|taxi|hyrbil|rental|personal|staff|anställd|avlämning|kiss.?(and|&).?ride|buss/i.test(text || '')) return null;
  for (const [namn, a, b, slug] of AIRPORTS) { const d = haversineM({ lat, lon }, { lat: a, lon: b }); if (d < 3000 && (AIRPORT_RE.test(text || '') || d < 900)) return { namn, slug, d }; }
  return null;
}
function inZone(lat, lon) {
  for (const z of zoner) { const [x0, y0, x1, y1] = z.bbox; if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue; if (pointInRings(lon, lat, z.rings)) return z; }
  return null;
}
const linGrid = new Grid(0.002); for (const l of linjer) linGrid.add(l);
const punktGrid = new Grid(0.002); for (const p of punktBerik) punktGrid.add(p);

function buildPark(osm, offs) {
  const ox = osm?.extra || {};
  const ops = offs.filter((o) => o.operator), kom = offs.filter((o) => !o.operator);
  const order = [...ops, ...kom];
  const f = (k) => first(...order.map((o) => o[k]));
  const anchor = order[0];
  const lat = anchor ? anchor.lat : osm.lat, lon = anchor ? anchor.lon : osm.lon;
  const kedja = first(...ops.map((o) => o.kedja), chainOf(ox.operator), osm?.kedja, ...kom.map((o) => o.kedja), ox.operator && /kommun|stad\b|region/i.test(ox.operator) ? ox.operator : null);
  const namnOff = f('namn');
  const namn = first(namnOff && (isOsmDefaultName(osm?.namn) || !osm?.namn) ? namnOff : null, osm?.namn, namnOff);
  let typ = first(...ops.map((o) => o.typ), ...kom.map((o) => o.typ), osm?.typ) || 'parkering';
  if (ox.park_ride && ox.park_ride !== 'no') typ = 'pendlarparkering';
  if (typ === 'garage') typ = 'parkeringsgarage';
  const ap = airportOf(lat, lon, [namn, ox.operator, kedja].filter(Boolean).join(' '));
  if (ap) typ = 'flygplatsparkering';
  const osmFee = ox.fee === true || ox.fee === 'yes' ? true : ox.fee === false || ox.fee === 'no' ? false : null;
  const taxa = first(f('taxa'), ox.charge ? `${ox.charge}` : null);
  let avgift = first(f('avgift'), osmFee); if (avgift == null && taxa) avgift = avgiftOf(taxa);
  const kom2 = osm ? { kommun: osm.kommun, lan: osm.lan, kommunkod: ox.kommunkod, metod: 'osm-data' } : kommunOf(lat, lon, kom[0]?.src.kommun);
  let ladd = first(f('laddplatser'), ox['capacity:charging'] != null ? Number(ox['capacity:charging']) || null : null);
  let hkp = first(f('handikapplatser'), ox['capacity:disabled'] != null ? Number(ox['capacity:disabled']) : null);
  const kallor = [...(osm?.kallor || []), ...order.map((o) => o.kalla)];
  // punktberikning (kommunala laddplatser / platser för rörelsehindrade inom 60 m)
  const near = punktGrid.near(lat, lon, 60);
  if (ladd == null) { const s = near.filter((x) => x.o.roll === 'laddplatser').reduce((a, x) => a + x.o.antal, 0); if (s) { ladd = s; kallor.push(kallaText(near.find((x) => x.o.roll === 'laddplatser').o.src)); } }
  if (hkp == null) { const s = near.filter((x) => x.o.roll === 'handikapplatser').reduce((a, x) => a + x.o.antal, 0); if (s) { hkp = s; kallor.push(kallaText(near.find((x) => x.o.roll === 'handikapplatser').o.src)); } }
  // kommunal taxezon (information om gatumarkens taxa i området, inte anläggningens egen taxa)
  let taxezon = null;
  const z = inZone(lat, lon); if (z && (z.taxa || z.namn)) taxezon = { namn: z.namn, taxa: z.taxa, kalla: kallaText(z.src) };
  else { const l = linGrid.near(lat, lon, 35)[0]; if (l) taxezon = { namn: l.o.namn || null, taxa: l.o.taxa, kalla: kallaText(l.o.src) }; }
  if (!taxezon) { const k = kom.find((o) => o.taxezon); if (k) taxezon = { namn: k.taxezon, taxa: null, kalla: k.kalla }; }
  if (taxezon) kallor.push(taxezon.kalla);
  const oppettider = first(f('oppettider'), osm?.oppettider) || null;
  const extra = {
    ...(osm ? ox : { kommunkod: kom2.kommunkod }),
    kapacitet: first(f('kapacitet'), ox.capacity != null ? Number(ox.capacity) || null : null) ?? null,
    avgift: avgift ?? null, taxa: taxa || null, taxa_per_timme: first(f('taxa_per_timme'), perTimme(taxa)) ?? null,
    max_tid: first(f('max_tid'), ox.maxstay) || null, hojdbegransning: f('hojdbegransning') ?? null,
    laddplatser: ladd ?? null, handikapplatser: hkp ?? null, zonkod: f('zonkod') || null,
    taxezon_kommun: taxezon, flygplats: ap ? ap.namn : null,
    officiella_kallor: order.map((o) => o.src.id), matchning: osm && order.length ? `osm+${order.length} officiell(a)` : order.length ? 'endast officiell/operatör' : 'endast osm',
  };
  const anm = kom.find((o) => o.anmarkning && reuseOk(o.src.licens)); if (anm) extra.anmarkning = anm.anmarkning;
  if (!osm) extra.kommun_metod = kom2.metod;
  let webb = first(...ops.map((o) => o.webb), osm?.webb, ...kom.map((o) => o.webb));
  if (!webb && ap?.slug) webb = `https://www.swedavia.se/${ap.slug}/parkering/`;
  return {
    id: null, namn: namn || null, kedja: kedja || null, typ,
    gatuadress: first(f('gatuadress'), osm?.gatuadress) || null, postnummer: first(f('postnummer'), osm?.postnummer) || null,
    ort: first(osm?.ort, f('ort')) || null, kommun: kom2.kommun, lan: kom2.lan, lat, lon,
    telefon: osm?.telefon || null, webb: webb || null, oppettider,
    extra, kallor: [...new Set(kallor)], uppdaterad: order.length || taxezon || ladd || hkp ? TODAY : osm.uppdaterad,
    _osmId: osm?.id, _offs: order,
  };
}
const parkOut = [];
for (const o of osmPark) parkOut.push(buildPark(o, targets.get(o) || []));
for (const n of newPark) parkOut.push(buildPark(null, n.offs));

// =====================================================================
// id + slug (stabila mellan körningar)
// =====================================================================
const slugs = readJson(path.join(DATA_DIR, 'slugs.json'), {});
function assign(list, tema, prefix) {
  const map = slugs[tema] || (slugs[tema] = {});
  const usedSlugs = new Set(Object.values(map));
  for (const r of list) {
    if (r._osmId) r.id = r._osmId;
    else {
      const off = r._off || r._offs[0];
      const { key, id } = officialId(prefix, off.src, off);
      let fid = id; for (let n = 2; usedIds.has(fid); n++) fid = `${id}-${n}`;
      r.id = fid; idMap[key] = fid;
    }
    usedIds.add(r.id);
    if (!map[r.id]) {
      const base0 = r.namn ? (r.ort && !slugify(r.namn).includes(slugify(r.ort)) ? `${r.namn} ${r.ort}` : r.namn) : `${tema === 'lek' ? 'lekplats' : 'parkering'} ${r.ort || r.kommun || ''}`;
      const base = slugify(base0) || `${tema}-${slugify(r.id)}`; let s = base; for (let n = 2; usedSlugs.has(s); n++) s = `${base}-${n}`;
      usedSlugs.add(s); map[r.id] = s;
    }
    r.slug = map[r.id];
  }
}
assign(lekOut, 'lekplatser', 'lek');
assign(parkOut, 'parkeringar', 'park');
const clean = (r) => { const { _osmId, _off, _offs, ...o } = r; return { id: o.id, slug: o.slug, ...o }; };

// =====================================================================
// statistik + utdata
// =====================================================================
const pct = (n, d) => Math.round((1000 * n) / Math.max(1, d)) / 10;
const L = lekOut.map(clean), P = parkOut.map(clean);
const lekStat = {
  antal: L.length, fran_osm: osmLek.length, nya_officiella: L.filter((r) => r.extra.matchning === 'endast officiell').length,
  matchade_osm_officiell: L.filter((r) => r.extra.matchning.startsWith('osm+officiell')).length,
  med_namn: L.filter((r) => r.namn).length, med_adress: L.filter((r) => r.gatuadress).length,
  med_utrustning: L.filter((r) => r.extra.utrustning_antal > 0).length, med_tema: L.filter((r) => r.extra.tema).length,
  typ: L.reduce((a, r) => ((a[r.typ] = (a[r.typ] || 0) + 1), a), {}), med_tillganglighet: L.filter((r) => r.extra.tillganglighet).length,
  med_beskrivning: L.filter((r) => r.extra.beskrivning).length, med_webb: L.filter((r) => r.webb).length,
  i_kommuner_med_officiell_data: L.filter((r) => r.extra.kommun_har_officiell_data).length, kallor: lekSrcStat,
};
const fore = { lek_namn: osmLek.filter((r) => r.namn && !isOsmDefaultName(r.namn)).length, lek_utr: osmLek.filter((r) => r.extra.utrustning).length, park_adr: osmPark.filter((r) => r.gatuadress).length, park_kap: osmPark.filter((r) => r.extra.capacity != null).length, park_tim: osmPark.filter((r) => r.oppettider).length };
const parkStat = {
  antal: P.length, fran_osm: osmPark.length, nya_officiella: P.filter((r) => r.extra.matchning === 'endast officiell/operatör').length,
  osm_berikade_med_officiell: P.filter((r) => r.extra.matchning.startsWith('osm+')).length,
  med_adress: P.filter((r) => r.gatuadress).length, med_kapacitet: P.filter((r) => r.extra.kapacitet != null).length,
  med_taxa: P.filter((r) => r.extra.taxa).length, med_taxa_per_timme: P.filter((r) => r.extra.taxa_per_timme != null).length,
  med_avgift_kand: P.filter((r) => r.extra.avgift != null).length, gratis: P.filter((r) => r.extra.avgift === false).length,
  med_oppettider: P.filter((r) => r.oppettider).length, med_hojdbegransning: P.filter((r) => r.extra.hojdbegransning).length,
  med_laddplatser: P.filter((r) => r.extra.laddplatser).length, med_handikapplatser: P.filter((r) => r.extra.handikapplatser != null).length,
  med_zonkod: P.filter((r) => r.extra.zonkod).length, med_kommunal_taxezon: P.filter((r) => r.extra.taxezon_kommun).length,
  flygplatsparkeringar: P.filter((r) => r.typ === 'flygplatsparkering').length,
  kedjor: P.reduce((a, r) => (r.kedja ? ((a[r.kedja] = (a[r.kedja] || 0) + 1), a) : a), {}),
  typ: P.reduce((a, r) => ((a[r.typ] = (a[r.typ] || 0) + 1), a), {}), kallor: parkSrcStat, operatorer: opStat,
};
rapport.fore_berikning = { lekplatser_med_riktigt_namn: fore.lek_namn, lekplatser_med_utrustning: fore.lek_utr, parkeringar_med_adress: fore.park_adr, parkeringar_med_kapacitet: fore.park_kap, parkeringar_med_oppettider: fore.park_tim };
rapport.lekplatser = { ...rapport.lekplatser, ...lekStat, pct: { namn: pct(lekStat.med_namn, L.length), adress: pct(lekStat.med_adress, L.length), utrustning: pct(lekStat.med_utrustning, L.length), tema: pct(lekStat.med_tema, L.length) } };
rapport.parkeringar = { ...parkStat, pct: { adress: pct(parkStat.med_adress, P.length), kapacitet: pct(parkStat.med_kapacitet, P.length), taxa: pct(parkStat.med_taxa, P.length), oppettider: pct(parkStat.med_oppettider, P.length) } };

const kommunLek = kommuner().map((k) => ({
  kommunkod: k.kod, kommun: k.namn, lan: k.lan, officiell_data: lekKommunOff.has(k.namn), kallor: lekKommunOff.get(k.namn)?.kallor || [],
  antal_lekplatser: L.filter((r) => r.kommun === k.namn).length, antal_fran_officiell_kalla: L.filter((r) => r.kommun === k.namn && r.extra.officiell_kalla).length,
})).sort((a, b) => a.kommunkod.localeCompare(b.kommunkod));

writeJson(path.join(DATA_DIR, 'lekplatser.json'), L);
writeJson(path.join(DATA_DIR, 'parkeringar.json'), P);
writeJson(path.join(DATA_DIR, 'slugs.json'), slugs);
writeJson(path.join(DATA_DIR, 'id-map.json'), idMap);
writeJson(path.join(DATA_DIR, 'kommuner-lekplatser.json'), kommunLek);
writeJson(path.join(DATA_DIR, 'rapport.json'), rapport);
console.log(JSON.stringify({ fore: rapport.fore_berikning, lek: { ...lekStat, kallor: undefined }, park: { ...parkStat, kallor: undefined, operatorer: opStat } }, null, 1));
