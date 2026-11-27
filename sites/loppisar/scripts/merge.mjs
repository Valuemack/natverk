// Merge chain sources + OSM into data/butiker.json.
//  - geocodes chain stores without coordinates offline (OSM address -> street -> postcode centroid -> ort place)
//  - assigns kommun by point-in-polygon on data/ref/kommuner.json (OSM admin_level=7 boundaries, codes = SCB kommunkod)
//  - deduplicates across sources (name/chain + address + distance)
//  - writes data/butiker.json, data/excluded.json, data/stats.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAYS, emptyHours, hasHours } from './lib/hours.mjs';
import { canonicalChain, detectChain, typFrom, osmKind } from './lib/classify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data'), RAW = path.join(DATA, 'raw'), REF = path.join(DATA, 'ref');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

// Chains whose official list we fetch completely: an OSM POI of these chains that matches no listed store is
// most likely closed or moved -> excluded (kept in excluded.json for review).
const COMPLETE_CHAINS = new Set(['Myrorna', 'Erikshjälpen Second Hand', 'Röda Korset', 'PMU Second Hand', 'Lindra Second Hand']);

// ---------------------------------------------------------------- reference data
const { kommuner: kommunPolys } = readJson(path.join(REF, 'kommuner.json'));
const kl = readJson(path.join(REF, 'kommunlista.json'));
const kommunNamn = Object.fromEntries(kl.kommuner.map(k => [k.kod, k]));
const geo = readJson(path.join(REF, 'geocode-index.json'));

function inRing(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function kommunAt(lat, lon) {
  for (const k of kommunPolys) {
    const [x0, y0, x1, y1] = k.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    let inside = false;
    for (const r of k.rings) if (inRing(lon, lat, r.pts)) inside = !inside; // even-odd over outer+inner rings
    if (inside) return { kod: k.kod, how: 'polygon' };
  }
  // fallback (coastline/simplification gaps): nearest boundary vertex within ~3 km
  let best = null;
  for (const k of kommunPolys) {
    const [x0, y0, x1, y1] = k.bbox;
    if (lon < x0 - 0.06 || lon > x1 + 0.06 || lat < y0 - 0.03 || lat > y1 + 0.03) continue;
    for (const r of k.rings) for (const [x, y] of r.pts) {
      const d = distM(lat, lon, y, x);
      if (d < 3000 && (!best || d < best.d)) best = { kod: k.kod, d };
    }
  }
  return best ? { kod: best.kod, how: 'närmaste-gräns' } : null;
}

function distM(a, b, c, d) {
  const x = (d - b) * Math.cos((a + c) / 2 * Math.PI / 180), y = c - a;
  return Math.sqrt(x * x + y * y) * 111195;
}

// ---------------------------------------------------------------- normalizers
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const normStreet = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '').trim();
const normNr = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
function splitStreet(g) {
  const first = String(g || '').split(',')[0].trim();
  const m = first.match(/^(.*?)\s+(\d+\s*[a-zA-Z]?)(?:\s*[-–]\s*\d+[a-zA-Z]?)?\b/);
  return m ? { street: normStreet(m[1]), nr: normNr(m[2]) } : { street: normStreet(first), nr: null };
}
const addrKey = (g) => { const { street, nr } = splitStreet(g); return street ? fold(street).replace(/\s/g, '') + '|' + (nr || '') : null; };
const GENERIC = new Set(['second', 'hand', 'secondhand', 'butik', 'butiken', 'shop', 'store', 'och', 'the', 'ab', 'i', 'loppis', 'kupan', 'stadsmission', 'stadsmissionen', 'stockholms', 'goteborgs', 'sverige']);
const tokens = (s) => new Set(fold(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !GENERIC.has(t)));
function nameSim(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return fold(a).replace(/\W/g, '') === fold(b).replace(/\W/g, '') ? 1 : 0;
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return i / Math.min(A.size, B.size);
}
const slug = (s) => fold(s).replace(/&/g, ' och ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------- offline geocoder
const addrByStreet = new Map();
for (const a of geo.addresses) {
  const k = fold(normStreet(a.s));
  if (!addrByStreet.has(k)) addrByStreet.set(k, []);
  addrByStreet.get(k).push(a);
}
const PLACE_RANK = { city: 0, town: 1, village: 2, suburb: 3, quarter: 4, hamlet: 5, neighbourhood: 6, locality: 7, isolated_dwelling: 8 };
const placesByName = new Map();
for (const p of geo.places) {
  const k = fold(p.n);
  if (!placesByName.has(k)) placesByName.set(k, []);
  placesByName.get(k).push(p);
}
const RADIUS = { city: 12000, town: 6000, village: 3000 };
function ortPlace(ort, near) { // best place node named like the ort (nearest to `near` if given, else biggest)
  const cands = placesByName.get(fold(ort)) || [];
  if (!cands.length) return null;
  const ranked = cands.slice().sort((a, b) => near
    ? distM(near.lat, near.lon, a.lat, a.lon) - distM(near.lat, near.lon, b.lat, b.lon)
    : (PLACE_RANK[a.p] ?? 9) - (PLACE_RANK[b.p] ?? 9));
  return ranked[0];
}
function anchorFor(s) {
  const pc = s.postnummer?.replace(/\s/g, '');
  let a = null;
  if (pc && geo.postcodes[pc]) { const [lat, lon, n] = geo.postcodes[pc]; a = { lat, lon, how: 'postnummer', radius: 5000, n }; }
  else if (pc) { // nearby postcode (same 4 first digits)
    const near = Object.entries(geo.postcodes).filter(([k]) => k.slice(0, 4) === pc.slice(0, 4));
    if (near.length) { const [lat, lon] = near.sort((x, y) => y[1][2] - x[1][2])[0][1]; a = { lat, lon, how: 'postnummer-område', radius: 6000 }; }
  }
  // OSM postcode tags are sometimes wrong in bulk; distrust a postcode centroid > 25 km from every place named like the ort
  if (a && s.ort) {
    const p = ortPlace(s.ort, a);
    if (p && distM(a.lat, a.lon, p.lat, p.lon) > 25000) a = null;
  }
  if (!a && s.ort) {
    const p = ortPlace(s.ort);
    if (p) a = { lat: p.lat, lon: p.lon, how: 'ort', radius: RADIUS[p.p] || 2500 };
  }
  return a;
}
function geocode(s) {
  const anchor = anchorFor(s);
  const { street, nr } = splitStreet(s.gatuadress);
  const list = street ? addrByStreet.get(fold(street)) || [] : [];
  const pc = s.postnummer?.replace(/\s/g, '');
  const near = (a) => (anchor ? distM(anchor.lat, anchor.lon, a.lat, a.lon) : 0);
  const sameTown = (a) => (pc && a.pc && a.pc.replace(/\s/g, '') === pc) || (s.ort && a.c && fold(a.c) === fold(s.ort));
  // a candidate must be in the same postcode/town, or within the anchor's radius
  const ok = (a) => (sameTown(a) && (!anchor || near(a) < 30000)) || (anchor && near(a) < anchor.radius);
  if (nr) {
    const exact = list.filter(a => normNr(a.h) === nr && ok(a)).sort((a, b) => (sameTown(b) - sameTown(a)) || (near(a) - near(b)));
    if (exact.length) return { lat: exact[0].lat, lon: exact[0].lon, how: 'osm-adress' };
    const nrNum = parseInt(nr, 10);
    const sameStreet = list.filter(ok);
    if (sameStreet.length) {
      const best = sameStreet.sort((a, b) => Math.abs(parseInt(a.h, 10) - nrNum) - Math.abs(parseInt(b.h, 10) - nrNum))[0];
      if (Math.abs(parseInt(best.h, 10) - nrNum) <= 10) return { lat: best.lat, lon: best.lon, how: 'osm-gata' };
    }
  }
  if (anchor) return { lat: anchor.lat, lon: anchor.lon, how: anchor.how };
  return null;
}

// ort/stadsdel from nearest place (for OSM POIs without addr:city)
const placeGrid = new Map();
const pk = (la, lo) => `${Math.floor(la * 10)}:${Math.floor(lo * 5)}`;
for (const p of geo.places) { const k = pk(p.lat, p.lon); if (!placeGrid.has(k)) placeGrid.set(k, []); placeGrid.get(k).push(p); }
function nearestPlace(lat, lon, types, maxM) {
  let best = null;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    for (const p of placeGrid.get(pk(lat + i * 0.1, lon + j * 0.2)) || []) {
      if (!types.has(p.p)) continue;
      // weight: towns/cities "pull" more than villages so a shop in a town's outskirts gets the town name
      const d = distM(lat, lon, p.lat, p.lon) * (p.p === 'city' ? 0.5 : p.p === 'town' ? 0.75 : 1);
      if (d < maxM && (!best || d < best.d)) best = { ...p, d };
    }
  }
  return best;
}
const ORT_TYPES = new Set(['city', 'town', 'village']);
const DEL_TYPES = new Set(['suburb', 'quarter', 'neighbourhood']);

// ---------------------------------------------------------------- load sources
const records = [];
const excluded = [];
const chainFiles = fs.readdirSync(RAW).filter(f => /^chain-.*\.json$/.test(f)).sort();
const sourceMeta = [];
for (const f of chainFiles) {
  const d = readJson(path.join(RAW, f));
  sourceMeta.push({ source: d.source, kedja: d.kedja, url: d.url, fetched: d.fetched, stores: d.stores.length, terms_note: d.terms_note });
  for (const s of d.stores) {
    const kedja = canonicalChain(s.kedja);
    const namn = kedja && !detectChain(s.namn) ? `${s.kedja} ${s.namn}` : s.namn; // e.g. Myrorna "Stockholm Bromma"
    records.push({
      ...s, namn, kedja, origin: 'chain',
      koordinat_kalla: s.lat != null ? (s.coords_source || 'källa') : null,
      kallor: [{ kalla: d.source, id: s.source_id, url: s.webb, hamtad: d.fetched?.slice(0, 10) }],
    });
  }
}
const osm = readJson(path.join(RAW, 'osm.json'));
sourceMeta.push({ source: 'osm', url: osm.url, fetched: osm.fetched, stores: osm.stores.length, license: osm.license });

// sanity-check chain coordinates against the postcode centroid; a pin > 15 km away (or outside every kommun)
// is a copy-paste/map error (e.g. a Helsingborg store pinned in Helsingør) -> drop it and geocode instead
for (const r of records) {
  if (r.lat == null) continue;
  const pc = r.postnummer?.replace(/\s/g, '');
  const c = pc && geo.postcodes[pc];
  const op = r.ort && ortPlace(r.ort, r);
  const far = c && distM(r.lat, r.lon, c[0], c[1]) > 15000 && !(op && distM(r.lat, r.lon, op.lat, op.lon) < 15000);
  if (far || !kommunAt(r.lat, r.lon)) { r.coords_rejected = { lat: r.lat, lon: r.lon, why: far ? 'långt från postnummer' : 'utanför kommungränser' }; r.lat = r.lon = null; r.koordinat_kalla = null; }
}
// geocode chain stores without coordinates
for (const r of records) {
  if (r.lat != null) continue;
  const g = geocode(r);
  if (g) { r.lat = +g.lat.toFixed(6); r.lon = +g.lon.toFixed(6); r.koordinat_kalla = g.how; }
}

// ---------------------------------------------------------------- dedupe OSM against chain records, then OSM vs OSM
const PRECISE = (r) => r.koordinat_kalla && !/^(postnummer|postnummer-område|ort)$/.test(r.koordinat_kalla);
function sameStore(a, b) {
  if (a.lat == null || b.lat == null) return false;
  const d = distM(a.lat, a.lon, b.lat, b.lon);
  const ca = a.kedja, cb = b.kedja;
  const sameAddr = a.gatuadress && b.gatuadress && addrKey(a.gatuadress) === addrKey(b.gatuadress) && splitStreet(a.gatuadress).nr;
  const precise = PRECISE(a) && PRECISE(b);
  if (ca && cb && ca !== cb) return false;
  if (ca && cb && ca === cb) {
    if (sameAddr && d < 3000) return true;
    if (d < (precise ? 350 : 1500) && (nameSim(a.namn, b.namn) >= 0.5 || d < 120)) return true;
    // a chain with a single store in this area
    return d < (precise ? 250 : 1200);
  }
  const sim = nameSim(a.namn || '', b.namn || '');
  const other = ca ? b : a; // the record without a chain (if exactly one has one)
  if (sameAddr && d < 400 && (sim >= 0.5 || (!!ca !== !!cb && (!tokens(other.namn || '').size || detectChain(other.namn))))) return true;
  if (d < 80 && sim >= 0.5) return true;
  if (d < 40 && (!tokens(a.namn || '').size || !tokens(b.namn || '').size)) return true; // "Loppis", "Second Hand" next to a named shop
  if (d < 25 && (ca || cb)) return true;
  return false;
}

const merged = records.slice();
const osmRecs = osm.stores.map(s => ({
  ...s, origin: 'osm', koordinat_kalla: 'osm',
  kallor: [{ kalla: 'osm', id: s.source_id, url: s.osm_url, hamtad: osm.fetched.slice(0, 10) }],
}));
for (const o of osmRecs) {
  if (!osmKind(o.osm_tags)) { excluded.push({ reason: 'osm: uppfyller inte urvalsreglerna', ...pick(o) }); continue; }
  if (!o.namn) { excluded.push({ reason: 'osm: saknar namn', ...pick(o) }); continue; }
  // best candidate
  let best = null;
  for (const r of merged) {
    if (r === o || r.lat == null) continue;
    if (Math.abs(r.lat - o.lat) > 0.05) continue;
    if (!sameStore(r, o)) continue;
    const d = distM(r.lat, r.lon, o.lat, o.lon);
    if (!best || d < best.d) best = { r, d };
  }
  if (best) { absorb(best.r, o); continue; }
  if (o.kedja && COMPLETE_CHAINS.has(o.kedja)) { excluded.push({ reason: `osm: ${o.kedja} finns inte i kedjans butikslista (troligen stängd/flyttad)`, ...pick(o) }); continue; }
  merged.push(o);
}

function pick(o) { return { namn: o.namn, kedja: o.kedja, gatuadress: o.gatuadress, ort: o.ort, lat: o.lat, lon: o.lon, kallor: o.kallor }; }

function absorb(base, o) {
  for (const k of ['gatuadress', 'postnummer', 'ort', 'telefon', 'epost', 'webb']) if (!base[k] && o[k]) base[k] = o[k];
  if (base.origin === 'osm' && !tokens(base.namn || '').size && tokens(o.namn || '').size) base.namn = o.namn;
  if (!PRECISE(base) && o.lat != null) { base.lat = o.lat; base.lon = o.lon; base.koordinat_kalla = o.koordinat_kalla; }
  if (!hasHours(base.oppettider) && hasHours(o.oppettider)) { base.oppettider = o.oppettider; base.oppettider_text = o.oppettider_text; base.oppettider_kalla = o.kallor[0].kalla; }
  base.sortiment = [...new Set([...(base.sortiment || []), ...(o.sortiment || [])])];
  if (!base.kedja && o.kedja) base.kedja = o.kedja;
  if (o.valgorenhet) base.valgorenhet = true;
  if (o.osm_url && !base.osm_url) base.osm_url = o.osm_url;
  base.kallor.push(...o.kallor);
}

// ---------------------------------------------------------------- kommun, ort, final shape
const out = [];
const usedIds = new Map();
for (const r of merged) {
  if (r.lat == null) { excluded.push({ reason: 'saknar koordinater/geokodning', ...pick(r) }); continue; }
  const k = kommunAt(r.lat, r.lon);
  if (!k) { excluded.push({ reason: 'utanför Sverige (ingen kommun)', ...pick(r) }); continue; }
  const km = kommunNamn[k.kod];
  let ort = r.ort, ortKalla = r.ort ? 'källa' : null;
  if (!ort) { const p = nearestPlace(r.lat, r.lon, ORT_TYPES, 12000); if (p) { ort = p.n; ortKalla = 'osm-närmaste-ort'; } }
  if (!ort) { ort = km.namn; ortKalla = 'kommun'; }
  const del = nearestPlace(r.lat, r.lon, DEL_TYPES, 1500);
  const chain = r.kedja ? { kedja: r.kedja } : detectChain(r.namn);
  const rec = {
    id: null,
    namn: r.namn,
    kedja: chain?.kedja ?? null,
    organisation: r.organisation ?? null,
    typ: r.origin === 'chain' ? (r.typ || 'second hand') : r.typ || typFrom({ name: r.namn }),
    valgorenhet: r.valgorenhet ?? (r.origin === 'chain' ? true : false),
    gatuadress: r.gatuadress ?? null,
    postnummer: r.postnummer ?? null,
    ort,
    stadsdel: del && fold(del.n) !== fold(ort) ? del.n : null,
    kommun: km.namn,
    kommunkod: k.kod,
    lan: km.lan,
    lat: r.lat, lon: r.lon,
    telefon: r.telefon ?? null,
    epost: r.epost ?? null,
    webb: r.webb ?? null,
    oppettider: Object.fromEntries(DAYS.map(d => [d, r.oppettider?.[d] ?? null])),
    oppettider_text: r.oppettider_text ?? null,
    sortiment: r.sortiment || [],
    kallor: r.kallor,
    kvalitet: {
      koordinat: r.koordinat_kalla,
      kommun: k.how,
      ort: ortKalla,
      oppettider: hasHours(r.oppettider) ? (r.oppettider_kalla || r.kallor[0].kalla) : null,
    },
    osm_url: r.osm_url ?? null,
    uppdaterad: today,
  };
  let id = slug(`${rec.namn}${fold(rec.namn).includes(fold(ort)) ? '' : ' ' + ort}`) || slug(`butik ${ort}`);
  const n = (usedIds.get(id) || 0) + 1; usedIds.set(id, n);
  rec.id = n > 1 ? `${id}-${n}` : id;
  out.push(rec);
}
out.sort((a, b) => a.kommun.localeCompare(b.kommun, 'sv') || a.ort.localeCompare(b.ort, 'sv') || a.namn.localeCompare(b.namn, 'sv'));

// ---------------------------------------------------------------- stats
const count = (f) => { const m = {}; for (const r of out) { const k = f(r) ?? '(oberoende)'; m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
const stats = {
  generated: new Date().toISOString(),
  total: out.length,
  with_hours: out.filter(r => hasHours(r.oppettider)).length,
  kommuner_covered: new Set(out.map(r => r.kommunkod)).size,
  per_kedja: count(r => r.kedja),
  per_typ: count(r => r.typ),
  per_kommun_top: Object.fromEntries(Object.entries(count(r => r.kommun)).slice(0, 25)),
  coord_quality: count(r => r.kvalitet.koordinat),
  multi_source: out.filter(r => new Set(r.kallor.map(k => k.kalla)).size > 1).length,
  excluded: excluded.reduce((m, e) => { const k = e.reason.replace(/:.*finns inte.*/, ': kedjebutik saknas i kedjans lista'); m[k] = (m[k] || 0) + 1; return m; }, {}),
  sources: sourceMeta,
};
// E-postadresser sparas aldrig i repot. Repot är publikt, och många adresser tillhör privatpersoner.
const utanEpost = (k, v) => (k === 'epost' ? undefined : v);
fs.writeFileSync(path.join(DATA, 'butiker.json'), JSON.stringify(out, utanEpost, 1) + '\n');
fs.writeFileSync(path.join(DATA, 'excluded.json'), JSON.stringify(excluded, utanEpost, 1) + '\n');
fs.writeFileSync(path.join(DATA, 'stats.json'), JSON.stringify(stats, null, 1) + '\n');
console.log(`butiker.json: ${stats.total} stores, ${stats.with_hours} with hours (${Math.round(100 * stats.with_hours / stats.total)}%), ${stats.kommuner_covered}/290 kommuner, ${excluded.length} excluded`);
console.log('per kedja:', stats.per_kedja);
console.log('top kommuner:', stats.per_kommun_top);
console.log('coords:', stats.coord_quality, 'excluded:', stats.excluded);
