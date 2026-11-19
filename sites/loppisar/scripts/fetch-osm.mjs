// OpenStreetMap import from the Geofabrik Sweden extract (Overpass mirrors were unreliable from this machine).
// Produces:
//   data/raw/osm.json            second hand / charity / loppis POIs (normalized)
//   data/ref/kommuner.json       kommun boundaries (admin_level=7 relations with ref:scb kommunkod), simplified
//   data/ref/geocode-index.json  offline geocoding index: postcode centroids, place names, addresses on streets
//                                that chain-source stores without coordinates are on
// Data © OpenStreetMap contributors, ODbL 1.0 - attribution required, derived DB must stay ODbL.
//
// Usage: node --max-old-space-size=6144 scripts/fetch-osm.mjs [--no-download] [--rebuild-boundaries]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { blobs, decodeBlock } from './lib/pbf.mjs';
import { UA } from './lib/http.mjs';
import { parseOsmHours, emptyHours } from './lib/hours.mjs';
import { detectChain, typFrom, sortimentFromOsm, osmKind } from './lib/classify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'data', 'cache');
const RAW = path.join(ROOT, 'data', 'raw');
const REF = path.join(ROOT, 'data', 'ref');
const PBF = path.join(CACHE, 'sweden-latest.osm.pbf');
const PBF_URL = 'https://download.geofabrik.de/europe/sweden-latest.osm.pbf';
const args = new Set(process.argv.slice(2));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
for (const d of [CACHE, RAW, REF]) fs.mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------- 0. download (Geofabrik updates daily)
async function download() {
  if (args.has('--no-download') && fs.existsSync(PBF)) return;
  if (fs.existsSync(PBF) && Date.now() - fs.statSync(PBF).mtimeMs < 20 * 3600e3) { log('PBF is fresh, skipping download'); return; }
  log('downloading', PBF_URL);
  const res = await fetch(PBF_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
  const tmp = PBF + '.part';
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  fs.renameSync(tmp, PBF);
  log('downloaded', (fs.statSync(PBF).size / 1e6).toFixed(0), 'MB');
}

// POI filter: osmKind() in lib/classify.mjs (also re-applied by merge.mjs)
const poiKind = osmKind;

// ---------------------------------------------------------------- street index helpers
export const normStreet = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '').trim();
function neededStreets() {
  const set = new Set();
  for (const f of fs.readdirSync(RAW).filter(f => /^chain-.*\.json$/.test(f))) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')); } catch { continue; }
    for (const s of d.stores || []) {
      if (s.lat != null || !s.gatuadress) continue;
      const m = s.gatuadress.split(',')[0].match(/^(.*?)\s+\d+\s*[a-zA-Z]?(?:\s*[-–]\s*\d+)?\b/);
      if (m) set.add(normStreet(m[1])); else set.add(normStreet(s.gatuadress.split(',')[0]));
    }
  }
  return set;
}

const PLACE_TYPES = new Set(['city', 'town', 'village', 'suburb', 'hamlet', 'quarter', 'neighbourhood', 'isolated_dwelling', 'locality']);
const keepTags = (t) => {
  const o = {};
  for (const k of ['name', 'brand', 'operator', 'shop', 'amenity', 'second_hand', 'opening_hours', 'phone', 'contact:phone', 'website', 'contact:website',
    'email', 'contact:email', 'addr:street', 'addr:housenumber', 'addr:postcode', 'addr:city', 'addr:place', 'description', 'clothes', 'books', 'furniture',
    'charity', 'check_date', 'check_date:opening_hours', 'facebook', 'contact:facebook', 'wheelchair']) if (t[k] != null) o[k] = t[k];
  return o;
};

// ---------------------------------------------------------------- geometry
function joinRings(ways) { // ways: arrays of node ids -> closed rings (arrays of node ids)
  const rings = [];
  const pool = ways.filter(w => w.length > 1).map(w => w.slice());
  while (pool.length) {
    let ring = pool.pop();
    let guard = 0;
    while (ring[0] !== ring[ring.length - 1] && guard++ < 100000) {
      const end = ring[ring.length - 1];
      let idx = pool.findIndex(w => w[0] === end || w[w.length - 1] === end);
      if (idx < 0) break;
      let w = pool.splice(idx, 1)[0];
      if (w[0] !== end) w = w.reverse();
      ring = ring.concat(w.slice(1));
    }
    if (ring[0] === ring[ring.length - 1] && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function simplify(pts, tol) { // Douglas-Peucker on [lon,lat] arrays
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (L === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)); d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2; }
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol * tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// ---------------------------------------------------------------- main
await download();
const rebuildBoundaries = args.has('--rebuild-boundaries') || !fs.existsSync(path.join(REF, 'kommuner.json'));
const streets = neededStreets();
log(`needed streets for geocoding: ${streets.size}; rebuild boundaries: ${rebuildBoundaries}`);

const poiNodes = [], poiWays = [], poiRels = [], places = [], addrHits = [], addrWays = [];
const postcodes = new Map(); // "41705" -> [sumLat, sumLon, n]
const kommunRels = [];
let firstWayOffset = null, seenAdmin7 = 0;
const t0 = Date.now();

// Pass A: everything
log('pass A: nodes + ways + relations');
let blocks = 0;
for (const b of blobs(PBF)) {
  if (b.type !== 'OSMData') continue;
  const kinds = decodeBlock(b.data, {
    node(id, lat, lon, t) {
      if (!t) return;
      const k = poiKind(t);
      if (k) poiNodes.push({ type: 'node', id, lat, lon, tags: keepTags(t), kind: k });
      if (t.place && t.name && PLACE_TYPES.has(t.place)) places.push({ n: t.name, p: t.place, lat: +lat.toFixed(5), lon: +lon.toFixed(5) });
      const pc = t['addr:postcode'];
      if (pc && t['addr:housenumber']) {
        const key = pc.replace(/\s/g, '');
        if (/^\d{5}$/.test(key)) { const a = postcodes.get(key) || [0, 0, 0]; a[0] += lat; a[1] += lon; a[2]++; postcodes.set(key, a); }
      }
      if (t['addr:street'] && t['addr:housenumber'] && streets.has(normStreet(t['addr:street'])))
        addrHits.push({ s: t['addr:street'], h: t['addr:housenumber'], pc: pc || null, c: t['addr:city'] || null, lat: +lat.toFixed(6), lon: +lon.toFixed(6) });
    },
    way(id, t, refs) {
      const k = poiKind(t);
      if (k) poiWays.push({ type: 'way', id, refs: refs(), tags: keepTags(t), kind: k });
      if (t['addr:street'] && t['addr:housenumber'] && streets.has(normStreet(t['addr:street']))) {
        const r = refs(); addrWays.push({ s: t['addr:street'], h: t['addr:housenumber'], pc: t['addr:postcode'] || null, c: t['addr:city'] || null, refs: r.slice(0, Math.min(r.length, 8)) });
      }
    },
    relation(id, t, members) {
      if (t.boundary === 'administrative' && t.admin_level === '7' && rebuildBoundaries) {
        const kod = t['ref:se:kommun:kod'] || t['ref:scb'] || (/^SE-/.test(t['ISO3166-2'] || '') ? null : undefined);
        if (!seenAdmin7++) log('  first admin_level=7 relation tags:', JSON.stringify(t));
        if (kod && /^\d{4}$/.test(kod)) kommunRels.push({ id, kod, namn: t.name, members: members().filter(m => m.type === 'way') });
      }
      const k = poiKind(t);
      if (k && t.type === 'multipolygon') poiRels.push({ type: 'relation', id, members: members().filter(m => m.type === 'way' && m.role !== 'inner'), tags: keepTags(t), kind: k });
    },
  }, { nodes: true, nodeTags: true, ways: true, relations: true });
  if (firstWayOffset == null && (kinds.has('w') || kinds.has('r'))) firstWayOffset = b.offset;
  if (++blocks % 3000 === 0) log(`  ${blocks} blocks, ${poiNodes.length} poi nodes, ${poiWays.length} poi ways`);
}
log(`pass A done in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${poiNodes.length} poi nodes, ${poiWays.length} poi ways, ${poiRels.length} poi relations, ${kommunRels.length} kommun relations, ${places.length} places, ${postcodes.size} postcodes, ${addrHits.length}+${addrWays.length} address hits`);

// Pass B: member ways of kommun relations and POI multipolygons
const wantWays = new Map();
for (const r of kommunRels) for (const m of r.members) wantWays.set(m.ref, null);
for (const r of poiRels) for (const m of r.members) wantWays.set(m.ref, null);
if (wantWays.size) {
  log(`pass B: ${wantWays.size} member ways`);
  for (const b of blobs(PBF, { startOffset: firstWayOffset })) {
    if (b.type !== 'OSMData') continue;
    const kinds = decodeBlock(b.data, { way(id, t, refs) { if (wantWays.has(id)) wantWays.set(id, refs()); } }, { ways: true });
    if (kinds.has('r') && !kinds.has('w')) break; // relations follow ways in sorted files
  }
}

// Pass C: node coordinates
const wantNodes = new Map();
const need = (id) => { if (!wantNodes.has(id)) wantNodes.set(id, wantNodes.size); };
for (const w of poiWays) w.refs.forEach(need);
for (const w of addrWays) w.refs.forEach(need);
for (const refs of wantWays.values()) if (refs) refs.forEach(need);
log(`pass C: coordinates for ${wantNodes.size} nodes`);
const LAT = new Float64Array(wantNodes.size).fill(NaN), LON = new Float64Array(wantNodes.size).fill(NaN);
for (const b of blobs(PBF)) {
  if (b.type !== 'OSMData') continue;
  if (b.offset >= firstWayOffset) break;
  decodeBlock(b.data, { node(id, lat, lon) { const i = wantNodes.get(id); if (i !== undefined) { LAT[i] = lat; LON[i] = lon; } } }, { nodes: true });
}
const ll = (id) => { const i = wantNodes.get(id); return i === undefined || Number.isNaN(LAT[i]) ? null : [LAT[i], LON[i]]; };
const centroid = (refs) => {
  let a = 0, b = 0, n = 0;
  const uniq = refs.length > 1 && refs[0] === refs[refs.length - 1] ? refs.slice(1) : refs;
  for (const r of uniq) { const p = ll(r); if (p) { a += p[0]; b += p[1]; n++; } }
  return n ? [a / n, b / n] : null;
};

// ---------------------------------------------------------------- kommun boundaries
if (rebuildBoundaries) {
  const kommuner = [];
  for (const r of kommunRels) {
    const outerWays = [], innerWays = [];
    for (const m of r.members) { const refs = wantWays.get(m.ref); if (refs) (m.role === 'inner' ? innerWays : outerWays).push(refs); }
    const toCoords = (ring) => ring.map(ll).filter(Boolean).map(([la, lo]) => [+lo.toFixed(5), +la.toFixed(5)]);
    const rings = [];
    for (const ring of joinRings(outerWays)) rings.push({ outer: true, pts: simplify(toCoords(ring), 0.0003) });
    for (const ring of joinRings(innerWays)) rings.push({ outer: false, pts: simplify(toCoords(ring), 0.0003) });
    const all = rings.flatMap(x => x.pts);
    if (!all.length) { log('WARN no geometry for kommun', r.kod, r.namn); continue; }
    const bbox = [Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1]))];
    kommuner.push({ kod: r.kod, namn: r.namn, osm_relation: r.id, bbox, rings: rings.map(x => ({ outer: x.outer, pts: x.pts })) });
  }
  kommuner.sort((a, b) => a.kod.localeCompare(b.kod));
  fs.writeFileSync(path.join(REF, 'kommuner.json'), JSON.stringify({ source: 'OpenStreetMap admin_level=7 (ref:scb kommunkod), simplified 0.0003°', license: 'ODbL 1.0, © OpenStreetMap contributors', built: new Date().toISOString(), kommuner }));
  log(`kommuner.json: ${kommuner.length} kommuner`);
}

// ---------------------------------------------------------------- POIs
const pois = [];
for (const p of poiNodes) pois.push({ ...p, center: [p.lat, p.lon] });
for (const w of poiWays) pois.push({ type: 'way', id: w.id, tags: w.tags, kind: w.kind, center: centroid(w.refs) });
for (const r of poiRels) {
  const refs = r.members.flatMap(m => wantWays.get(m.ref) || []);
  pois.push({ type: 'relation', id: r.id, tags: r.tags, kind: r.kind, center: centroid(refs) });
}

// Pass D: nearest address node (≤ 60 m) for POIs without addr:street - nodes only, grid of ~110 m cells
const CELL = 0.001;
const grid = new Map();
const cellKey = (la, lo) => Math.floor(la / CELL) * 100000 + Math.floor(lo / (CELL * 2));
for (const p of pois) {
  if (!p.center || p.tags['addr:street']) continue;
  const [la, lo] = p.center;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const k = cellKey(la + i * CELL, lo + j * CELL * 2);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
}
const dist = (a, b, c, d) => { const x = (d - b) * Math.cos((a + c) / 2 * Math.PI / 180), y = c - a; return Math.sqrt(x * x + y * y) * 111195; };
if (grid.size) {
  log(`pass D: nearest address for ${pois.filter(p => p.center && !p.tags['addr:street']).length} POIs`);
  for (const b of blobs(PBF)) {
    if (b.type !== 'OSMData') continue;
    if (b.offset >= firstWayOffset) break;
    decodeBlock(b.data, {
      node(id, lat, lon, t) {
        if (!t || !t['addr:street'] || !t['addr:housenumber']) return;
        const list = grid.get(cellKey(lat, lon)); if (!list) return;
        for (const p of list) {
          const d = dist(p.center[0], p.center[1], lat, lon);
          if (d <= 60 && (!p.near || d < p.near.d)) p.near = { d: Math.round(d), s: t['addr:street'], h: t['addr:housenumber'], pc: t['addr:postcode'] || null, c: t['addr:city'] || null };
        }
      },
    }, { nodes: true, nodeTags: true });
  }
}

const out = [];
for (const p of pois) {
  if (!p.center) continue;
  const t = p.tags;
  const name = t.name || null;
  const chain = detectChain(t.name, t.brand, t.operator);
  const own = !!t['addr:street'];
  const street = own ? t['addr:street'] : p.near?.s;
  const nr = own ? t['addr:housenumber'] : p.near?.h;
  const pc = (own ? t['addr:postcode'] : p.near?.pc) || t['addr:postcode'];
  const hours = parseOsmHours(t.opening_hours);
  out.push({
    source_id: `${p.type}/${p.id}`,
    namn: name,
    kedja: chain?.kedja ?? null,
    typ: typFrom({ name: name || '', shop: t.shop === 'second_hand' || t.shop === 'charity' ? null : t.shop, amenity: t.amenity, kedja: chain?.kedja }),
    valgorenhet: t.shop === 'charity' || !!chain?.valgorenhet,
    gatuadress: street ? [street, nr].filter(Boolean).join(' ') : null,
    adress_kalla: own ? 'osm' : p.near ? `osm-närmaste-adress-${p.near.d}m` : null,
    postnummer: pc && /^\d{3}\s?\d{2}$/.test(pc.trim()) ? pc.replace(/\s/g, '').replace(/^(\d{3})(\d{2})$/, '$1 $2') : null,
    ort: t['addr:city'] || (own ? null : p.near?.c) || t['addr:place'] || null,
    lat: +p.center[0].toFixed(6), lon: +p.center[1].toFixed(6),
    telefon: t.phone || t['contact:phone'] || null,
    epost: t.email || t['contact:email'] || null,
    webb: t.website || t['contact:website'] || t['contact:facebook'] || t.facebook || null,
    oppettider: hours || emptyHours(),
    oppettider_text: t.opening_hours || null,
    sortiment: sortimentFromOsm(t),
    osm_tags: t,
    osm_url: `https://www.openstreetmap.org/${p.type}/${p.id}`,
  });
}

// geocode index (only what merge.mjs needs)
const addresses = addrHits.concat(addrWays.map(w => { const c = centroid(w.refs); return c ? { s: w.s, h: w.h, pc: w.pc, c: w.c, lat: +c[0].toFixed(6), lon: +c[1].toFixed(6) } : null; }).filter(Boolean));
const pcOut = {};
for (const [k, [a, b, n]] of postcodes) pcOut[k] = [+(a / n).toFixed(5), +(b / n).toFixed(5), n];
fs.writeFileSync(path.join(REF, 'geocode-index.json'), JSON.stringify({ source: 'OpenStreetMap (Geofabrik Sweden extract)', license: 'ODbL 1.0', built: new Date().toISOString(), postcodes: pcOut, places, addresses }));
fs.writeFileSync(path.join(RAW, 'osm.json'), JSON.stringify({
  source: 'osm', url: PBF_URL, fetched: new Date().toISOString(), pbf_modified: fs.statSync(PBF).mtime.toISOString(),
  license: 'ODbL 1.0 - © OpenStreetMap contributors. Attribution required ("© OpenStreetMap contributors" with link to https://www.openstreetmap.org/copyright); a published derived database must be offered under ODbL.',
  stores: out,
}, null, 1));
log(`osm.json: ${out.length} POIs (${out.filter(s => s.oppettider_text).length} with opening_hours) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
