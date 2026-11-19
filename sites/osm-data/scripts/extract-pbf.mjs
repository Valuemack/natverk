// Fallback source: build the same data/raw/*.json files as fetch.mjs, but from a Geofabrik PBF extract.
// Usage:
//   node --max-old-space-size=6144 scripts/extract-pbf.mjs --pbf="C:/path/sweden-latest.osm.pbf"
//   node --max-old-space-size=6144 scripts/extract-pbf.mjs --download   (fetches Geofabrik into data/cache/ if older than 20 h)
// Three sequential passes over the file: relations, ways, nodes (Geofabrik files are sorted that way).
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { blobs, decodeBlock } from './pbf.mjs';
import { RAW, DATA, writeJSON, log, distToSegM, Grid } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const GEOFABRIK = 'https://download.geofabrik.de/europe/sweden-latest.osm.pbf';

async function getPbf() {
  if (args.pbf && args.pbf !== true) return args.pbf;
  const file = path.join(DATA, 'cache', 'sweden-latest.osm.pbf');
  if (fs.existsSync(file) && (Date.now() - fs.statSync(file).mtimeMs) / 3.6e6 < 20) return file;
  if (!args.download) throw new Error('no PBF: pass --pbf=<file> or --download');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  log(`downloading ${GEOFABRIK} ...`);
  const res = await fetch(GEOFABRIK, { headers: { 'User-Agent': 'osm-dataset-builder/1.0' } });
  if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file + '.part'));
  fs.renameSync(file + '.part', file);
  return file;
}

// ---------------------------------------------------------------- predicates (mirror fetch.mjs queries)
const SWIM_NAME = /simhall|badhus|simhallsbad|äventyrsbad|inomhusbad|simarena|simstadion|kallbadhus|varmbadhus/i;
const STREET_HW = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian', 'service', 'road', 'primary_link', 'secondary_link', 'tertiary_link', 'footway', 'cycleway', 'path', 'track']);
const PLACES = new Set(['city', 'town', 'village', 'suburb', 'hamlet', 'quarter', 'neighbourhood']);
const HOTEL = /^(hotel|motel|hostel|guest_house|apartment|camp_site|caravan_site)$/;
const P = {
  fuel: (t) => t.amenity === 'fuel',
  // all parking (build.mjs filters; area_m2 is computed here so the filter can be tuned on lot size)
  parking: (t) => t.amenity === 'parking',
  parkingTarget: (t) => t.amenity === 'parking' && !t.name,
  playgrounds: (t) => t.leisure === 'playground',
  playgroundTarget: (t) => t.leisure === 'playground' && !t.name,
  playground_equipment: (t) => t.playground != null,
  swim_candidates: (t) =>
    ((t.leisure === 'sports_centre' || t.leisure === 'sports_hall') && /swimming/.test(t.sport || '')) ||
    (t.building && /swimming/.test(t.sport || '')) || t.leisure === 'water_park' || t.amenity === 'public_bath' ||
    (t.leisure === 'swimming_pool' && (t.indoor === 'yes' || t.building || t.name)) || t.building === 'swimming_pool' ||
    ((t.building || t.leisure || t.amenity) && SWIM_NAME.test(t.name || '')),
  swim_pools: (t) => t.leisure === 'swimming_pool',
  hotels: (t) => HOTEL.test(t.tourism || '') || t.leisure === 'resort',
};
const GEOM_SETS = ['playgrounds', 'swim_candidates', 'hotels']; // out geom; the rest: out center
const interesting = (t) => !!t && Object.entries(P).some(([k, f]) => !k.endsWith('Target') && f(t));
const isAdmin = (t) => t?.boundary === 'administrative' && ((t.admin_level === '7' && t['ref:scb']) || (t.admin_level === '4' && (t['ref:SE:scb'] || /^SE-/.test(t['ISO3166-2'] || ''))));

// growable Float64 buffer
class F64 {
  constructor(n = 1 << 20) { this.a = new Float64Array(n); this.n = 0; }
  push(x) { if (this.n === this.a.length) { const b = new Float64Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; }
  view() { return this.a.subarray(0, this.n); }
}

async function main() {
  const t0 = Date.now();
  const file = await getPbf();
  log(`PBF: ${file} (${(fs.statSync(file).size / 1e6).toFixed(0)} MB)`);

  // ---- pass 1: block index + relations
  let osmBase = null;
  const offs = { node: [], way: [], relation: [] };
  const adminRels = [], objRels = [];
  const memberWays = new Set();
  for (const b of blobs(file)) {
    if (b.type === 'OSMHeader') {
      // HeaderBlock field 32 = osmosis_replication_timestamp (seconds)
      const r = b.raw; let p = 0;
      const vi = () => { let x = 0, s = 1, c; do { c = r[p++]; x += (c & 0x7f) * s; s *= 128; } while (c & 0x80); return x; };
      while (p < r.length) { const tg = vi(), f = Math.floor(tg / 8), wt = tg & 7; if (wt === 0) { const v = vi(); if (f === 32) osmBase = new Date(v * 1000).toISOString(); } else if (wt === 2) { const l = vi(); p += l; } else if (wt === 1) p += 8; else if (wt === 5) p += 4; else break; }
      continue;
    }
    const kinds = decodeBlock(b.raw, { relation: true }, {
      relation(id, tags, members) {
        if (isAdmin(tags)) { adminRels.push({ id, tags, members }); for (const m of members) if (m.type === 'way') memberWays.add(m.ref); }
        else if (interesting(tags) && (tags.type === 'multipolygon' || tags.type === 'site' || !tags.type)) {
          objRels.push({ id, tags, members }); for (const m of members) if (m.type === 'way' && m.role !== 'label') memberWays.add(m.ref);
        }
      },
    });
    for (const k of kinds) offs[k].push(b.fileOffset);
  }
  osmBase ||= fs.statSync(file).mtime.toISOString();
  log(`pass 1: blocks n/w/r ${offs.node.length}/${offs.way.length}/${offs.relation.length}, admin rels ${adminRels.length}, object rels ${objRels.length}, member ways ${memberWays.size}, osm_base ${osmBase}`);

  // ---- pass 2: ways
  const need = new F64(1 << 24);
  const objWays = [], memWays = new Map();
  const st = { names: [], hw: [], start: [], refs: new F64(1 << 24) };
  for (const b of blobs(file, { offsets: [...new Set(offs.way)] })) {
    decodeBlock(b.raw, { way: true }, {
      way(id, tags, refs) {
        let keep = false;
        if (interesting(tags)) { objWays.push({ id, tags, refs }); keep = true; }
        if (memberWays.has(id)) { memWays.set(id, refs); keep = true; }
        if (tags?.name && STREET_HW.has(tags.highway)) {
          st.names.push(tags.name); st.hw.push(tags.highway); st.start.push(st.refs.n);
          for (const r of refs) st.refs.push(r);
          keep = true;
        }
        if (keep) for (const r of refs) need.push(r);
      },
    });
  }
  st.start.push(st.refs.n);
  const needSorted = need.view().sort();
  let u = 0; for (let i = 0; i < needSorted.length; i++) if (i === 0 || needSorted[i] !== needSorted[i - 1]) needSorted[u++] = needSorted[i];
  const ids = needSorted.slice(0, u);
  log(`pass 2: object ways ${objWays.length}, member ways ${memWays.size}/${memberWays.size}, named streets ${st.names.length}, needed nodes ${ids.length}`);

  // ---- pass 3: nodes
  const lat = new Float64Array(ids.length).fill(NaN), lon = new Float64Array(ids.length).fill(NaN);
  const objNodes = [];
  let j = 0, sortedOk = true, lastId = -Infinity;
  const bsearch = (id) => { let lo = 0, hi = ids.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (ids[m] < id) lo = m + 1; else if (ids[m] > id) hi = m - 1; else return m; } return -1; };
  for (const b of blobs(file, { offsets: [...new Set(offs.node)] })) {
    decodeBlock(b.raw, { node: true }, {
      node(id, la, lo, tags) {
        if (tags && (interesting(tags) || (PLACES.has(tags.place) && tags.name))) objNodes.push({ type: 'node', id, lat: +la.toFixed(7), lon: +lo.toFixed(7), tags });
        if (id < lastId) sortedOk = false; lastId = id;
        let k;
        if (sortedOk) { while (j < ids.length && ids[j] < id) j++; k = j < ids.length && ids[j] === id ? j : -1; }
        else k = bsearch(id);
        if (k >= 0) { lat[k] = la; lon[k] = lo; }
      },
    });
  }
  const pt = (id) => { const k = bsearch(id); return k >= 0 && !Number.isNaN(lat[k]) ? { lat: +lat[k].toFixed(7), lon: +lon[k].toFixed(7) } : null; };
  log(`pass 3: object nodes ${objNodes.length}`);

  // ---- assemble Overpass-like elements
  const bboxOf = (pts) => { let a = 90, b = 180, c = -90, d = -180; for (const p of pts) if (p) { a = Math.min(a, p.lat); c = Math.max(c, p.lat); b = Math.min(b, p.lon); d = Math.max(d, p.lon); } return a <= c ? { minlat: a, minlon: b, maxlat: c, maxlon: d } : null; };
  const centerOfB = (bb) => (bb ? { lat: +((bb.minlat + bb.maxlat) / 2).toFixed(7), lon: +((bb.minlon + bb.maxlon) / 2).toFixed(7) } : null);
  const ways = objWays.map((w) => { const g = w.refs.map(pt); const bounds = bboxOf(g); return { type: 'way', id: w.id, tags: w.tags, bounds, center: centerOfB(bounds), geometry: g }; }).filter((w) => w.bounds);
  const relEl = (r) => {
    const members = r.members.filter((m) => m.type === 'way' && memWays.has(m.ref)).map((m) => ({ type: 'way', ref: m.ref, role: m.role, geometry: memWays.get(m.ref).map(pt) }));
    const bounds = bboxOf(members.flatMap((m) => m.geometry));
    return { type: 'relation', id: r.id, tags: r.tags, bounds, center: centerOfB(bounds), members };
  };
  const rels = objRels.map(relEl).filter((r) => r.bounds);
  const all = [...objNodes, ...ways, ...rels];
  // polygon area (m2) from closed rings, equirectangular projection; relations: outer minus inner
  const ringArea = (g) => {
    if (!g || g.length < 4 || g.some((p) => !p)) return 0;
    const k = Math.cos((g[0].lat * Math.PI) / 180), M = 111320;
    let s = 0; for (let i = 1; i < g.length; i++) s += (g[i - 1].lon * k * M) * (g[i].lat * M) - (g[i].lon * k * M) * (g[i - 1].lat * M);
    return Math.abs(s / 2);
  };
  const areaOf = (e) => {
    if (e.type === 'way') return e.geometry[0] === e.geometry[e.geometry.length - 1] || (e.geometry[0] && e.geometry.at(-1) && e.geometry[0].lat === e.geometry.at(-1).lat && e.geometry[0].lon === e.geometry.at(-1).lon) ? ringArea(e.geometry) : 0;
    if (e.type === 'relation') return e.members.reduce((a, m) => a + (m.role === 'inner' ? -1 : 1) * ringArea(m.geometry), 0);
    return 0;
  };
  const strip = (e, geom) => {
    if (e.type === 'node' || geom) return e;
    const { geometry, members, bounds, ...rest } = e;
    if (e.tags?.amenity === 'parking') rest.area_m2 = Math.round(areaOf(e)) || null;
    return rest;
  };
  const meta = { fetched: new Date().toISOString(), osm_base: osmBase, source: `pbf:${path.basename(file)}`, copyright: 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.' };
  const write = (name, elements) => { writeJSON(path.join(RAW, `${name}.json`), { ...meta, elements }); log(`  ${name}: ${elements.length}`); };

  const adminEls = adminRels.map(relEl).filter((r) => r.bounds);
  write('admin', adminEls);
  write('places', objNodes.filter((n) => PLACES.has(n.tags.place) && n.tags.name));
  for (const name of ['fuel', 'parking', 'playgrounds', 'playground_equipment', 'swim_candidates', 'swim_pools', 'hotels']) {
    write(name, all.filter((e) => P[name](e.tags)).map((e) => strip(e, GEOM_SETS.includes(name))));
  }

  // streets within 120 m of unnamed parking / unnamed playgrounds
  const grids = {};
  for (const [name, pred] of [['parking_streets', P.parkingTarget], ['playground_streets', P.playgroundTarget]]) {
    const g = new Grid(0.003);
    for (const t of all) if (pred(t.tags)) { const c = t.lat != null ? t : t.center; if (c) g.add(c.lat, c.lon, c); }
    grids[name] = { g, out: [] };
  }
  const MAXM = 120;
  for (let i = 0; i < st.names.length; i++) {
    const geom = [];
    for (let k = st.start[i]; k < st.start[i + 1]; k++) geom.push(pt(st.refs.a[k]));
    for (const G of Object.values(grids)) {
      let hit = false;
      for (let k = 1; k < geom.length && !hit; k++) {
        const a = geom[k - 1], b = geom[k]; if (!a || !b) continue;
        const r = Math.ceil((Math.max(Math.abs(a.lat - b.lat), Math.abs(a.lon - b.lon)) / 2 + 0.0025) / 0.003);
        for (const c of G.g.near((a.lat + b.lat) / 2, (a.lon + b.lon) / 2, r)) if (distToSegM(c.lat, c.lon, a, b) <= MAXM) { hit = true; break; }
      }
      if (hit) G.out.push({ type: 'way', id: -1, tags: { name: st.names[i], highway: st.hw[i] }, geometry: geom });
    }
  }
  for (const [name, G] of Object.entries(grids)) write(name, G.out);
  log(`extract done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
main().catch((e) => { console.error(e); process.exit(1); });
