// Geometri: SWEREF 99 (TM + lokala zoner) -> WGS84, kommun-PIP, normalisering av olika källformat till punkter.
import path from 'node:path';
import { RAW_DIR, readJson, wgs84ToSweref, pointInRings, distToRings } from './lib.mjs';

// Gauss-Krüger invers, parametriserad (GRS80). Lantmäteriets formler.
function gkInverse(N, E, lon0, k0, FE) {
  const a = 6378137.0, f = 1 / 298.257222101, e2 = f * (2 - f), n = f / (2 - f);
  const ah = (a / (1 + n)) * (1 + (n * n) / 4 + (n ** 4) / 64); const rad = Math.PI / 180;
  const d1 = n / 2 - (2 * n * n) / 3 + (37 * n ** 3) / 96 - (n ** 4) / 360, d2 = (n * n) / 48 + (n ** 3) / 15 - (437 * n ** 4) / 1440;
  const d3 = (17 * n ** 3) / 480 - (37 * n ** 4) / 840, d4 = (4397 * n ** 4) / 161280;
  const As = e2 + e2 ** 2 + e2 ** 3 + e2 ** 4, Bs = -(7 * e2 ** 2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6;
  const Cs = (224 * e2 ** 3 + 889 * e2 ** 4) / 120, Ds = -(4279 * e2 ** 4) / 1260;
  const xi = N / (k0 * ah), eta = (E - FE) / (k0 * ah);
  const xip = xi - d1 * Math.sin(2 * xi) * Math.cosh(2 * eta) - d2 * Math.sin(4 * xi) * Math.cosh(4 * eta) - d3 * Math.sin(6 * xi) * Math.cosh(6 * eta) - d4 * Math.sin(8 * xi) * Math.cosh(8 * eta);
  const etap = eta - d1 * Math.cos(2 * xi) * Math.sinh(2 * eta) - d2 * Math.cos(4 * xi) * Math.sinh(4 * eta) - d3 * Math.cos(6 * xi) * Math.sinh(6 * eta) - d4 * Math.cos(8 * xi) * Math.sinh(8 * eta);
  const phis = Math.asin(Math.sin(xip) / Math.cosh(etap)); const dl = Math.atan(Math.sinh(etap) / Math.cos(xip)); const s = Math.sin(phis);
  const phi = phis + s * Math.cos(phis) * (As + Bs * s * s + Cs * s ** 4 + Ds * s ** 6);
  return { lat: phi / rad, lon: lon0 + dl / rad };
}
const ZONES = { 3006: [15, 0.9996, 500000], 3007: [12, 1, 150000], 3008: [13.5, 1, 150000], 3009: [15, 1, 150000], 3010: [16.5, 1, 150000], 3011: [18, 1, 150000], 3012: [14.25, 1, 150000], 3013: [15.75, 1, 150000], 3014: [17.25, 1, 150000], 3015: [18.75, 1, 150000], 3016: [20.25, 1, 150000], 3017: [21.75, 1, 150000], 3018: [23.25, 1, 150000] };
export function projToWgs(x, y, epsg) {
  if (epsg === 4326) return { lat: y, lon: x };
  const z = ZONES[epsg]; if (!z) throw new Error('okänd CRS ' + epsg);
  return gkInverse(y, x, z[0], z[1], z[2]);
}
export function epsgOf(crs) {
  const s = typeof crs === 'string' ? crs : crs?.properties?.name || '';
  const m = String(s).match(/(?:EPSG::?|epsg:)(\d{4,5})/i); if (m) return Number(m[1]);
  if (/CRS84/i.test(s)) return 4326; return null;
}

// --- kommuner ---
let KOM = null;
export function kommuner() {
  if (KOM) return KOM;
  const scb = readJson(path.join(RAW_DIR, 'scb-kommuner.json'));
  const lan = new Map(readJson(path.join(RAW_DIR, 'kommun-lan.json'), []).map((k) => [k.kommunkod, k]));
  KOM = scb.kommuner.map((k) => ({ ...k, lan: lan.get(k.kod)?.lan || null, namn: lan.get(k.kod)?.namn || k.namn }));
  return KOM;
}
export function kommunFor(lat, lon, maxDist = 3000) {
  const { N, E } = wgs84ToSweref(lat, lon); let best = null;
  for (const k of kommuner()) {
    const [x0, y0, x1, y1] = k.bbox;
    if (E >= x0 && E <= x1 && N >= y0 && N <= y1 && pointInRings(E, N, k.rings)) return { kod: k.kod, namn: k.namn, lan: k.lan, metod: 'punkt-i-polygon' };
  }
  for (const k of kommuner()) {
    const [x0, y0, x1, y1] = k.bbox; if (E < x0 - maxDist || E > x1 + maxDist || N < y0 - maxDist || N > y1 + maxDist) continue;
    const d = distToRings(E, N, k.rings); if (d <= maxDist && (!best || d < best.d)) best = { kod: k.kod, namn: k.namn, lan: k.lan, d };
  }
  return best ? { kod: best.kod, namn: best.namn, lan: best.lan, metod: `närmaste kommun (${Math.round(best.d)} m)` } : null;
}

// --- normalisering till punkter ---
function flatCoords(g) {
  if (!g) return [];
  if (g.type === 'Point') return [g.coordinates];
  if (g.type === 'MultiPoint' || g.type === 'LineString') return g.coordinates;
  if (g.type === 'Polygon' || g.type === 'MultiLineString') return g.coordinates[0] ? g.coordinates.flat() : [];
  if (g.type === 'MultiPolygon') return g.coordinates.flat(2);
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(flatCoords);
  return [];
}
function centroid(pts) {
  if (!pts.length) return null;
  let x = 0, y = 0; for (const p of pts) { x += Number(p[0]); y += Number(p[1]); }
  return [x / pts.length, y / pts.length];
}
function parseWkt(s) {
  const nums = String(s).match(/-?\d+(?:\.\d+)?/g); if (!nums) return null;
  const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push([Number(nums[i]), Number(nums[i + 1])]);
  const type = /^\s*POINT/i.test(s) ? 'Point' : /POLYGON/i.test(s) ? 'Polygon' : 'LineString';
  return { type, pts };
}
const LATK = /^(lat|latitud|latitude|wgs84_lat|y_wgs84|lat_wgs84|wgs84[_ ]?n|n_wgs84)$/i;
const LONK = /^(lon|lng|long|longitud|longitude|wgs84_lon|x_wgs84|lon_wgs84|wgs84[_ ]?e|e_wgs84)$/i;
const NK = /^(n|y|northing|nord|koordinat_n|y_koordinat|ykoord|sweref99tm_n|sweref_n|n_sweref|y_sweref)$/i;
const EK = /^(e|x|easting|ost|öst|koordinat_e|x_koordinat|xkoord|sweref99tm_e|sweref_e|e_sweref|x_sweref)$/i;
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };

// Returnerar [{ x, y, typ, props, rings? }] i källans koordinatsystem + epsg om känt.
function wkbPoint(hex) {
  const b = Buffer.from(hex, 'hex'); const le = b[0] === 1; const u32 = (o) => le ? b.readUInt32LE(o) : b.readUInt32BE(o); const f64 = (o) => le ? b.readDoubleLE(o) : b.readDoubleBE(o);
  const t = u32(1); let o = 5; let srid = null; if (t & 0x20000000) { srid = u32(5); o = 9; }
  if ((t & 0xffff) % 1000 !== 1) return null; return { x: f64(o), y: f64(o + 8), srid };
}
function rawPoints(data) {
  if (data?.RecordSet) data = data.RecordSet;
  if (Array.isArray(data?.features) && data.features[0]?.attributes) {
    const epsg = data.spatialReference?.latestWkid || data.spatialReference?.wkid || null;
    return { epsg, pts: data.features.map((f) => { const g = f.geometry || {}; const c = g.x != null ? [g.x, g.y] : centroid((g.rings || g.paths || []).flat()); return c && { x: Number(c[0]), y: Number(c[1]), typ: g.x != null ? 'Point' : g.rings ? 'Polygon' : 'LineString', props: f.attributes, geom: g.rings ? { type: 'Polygon', coordinates: g.rings } : null }; }).filter(Boolean) };
  }
  if (data?.type === 'FeatureCollection' || Array.isArray(data?.features)) {
    const epsg = epsgOf(data.crs);
    return { epsg, pts: data.features.map((f) => { const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : centroid(flatCoords(f.geometry)); return c && { x: Number(c[0]), y: Number(c[1]), typ: f.geometry.type, props: f.properties || {}, geom: /Polygon/.test(f.geometry?.type) ? f.geometry : null }; }).filter(Boolean) };
  }
  const rows = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : Array.isArray(data?.data) ? data.data : null;
  if (!rows) throw new Error('okänt format: ' + Object.keys(data || {}).join(','));
  const pts = [];
  // Välj ett N/E-kolumnpar för hela filen (vissa filer har både SWEREF- och grad-kolumner): föredra grader.
  let pair = null;
  {
    const sample = rows.slice(0, 30); const keys0 = [...new Set(sample.flatMap((r) => Object.keys(r)))];
    const nks = keys0.filter((x) => NK.test(x.trim()) || /^norr$/i.test(x.trim())), eks = keys0.filter((x) => EK.test(x.trim()));
    let best = null;
    for (const a of nks) for (const b of eks) {
      let deg = 0, proj = 0;
      for (const r of sample) { const n = num(r[a]), e = num(r[b]); if (n == null || e == null) continue;
        if ((Math.abs(n) <= 90 && Math.abs(e) <= 180)) deg++; else if (n > 6.0e6 && n < 7.8e6 && e > 5e4 && e < 1.0e6) proj++; }
      const score = deg * 2 + proj; if (score && (!best || score > best.score)) best = { score, a, b };
    }
    if (best) pair = [best.a, best.b];
  }
  for (const r of rows) {
    for (const key of Object.keys(r)) if (/^﻿/.test(key)) { r[key.replace(/^﻿/, '')] = r[key]; delete r[key]; }
    const keys = Object.keys(r);
    const hk = keys.find((x) => /^(geom|the_geom|geometry|shape)$/i.test(x) && /^0101[0-9a-f]{20,}$/i.test(String(r[x])));
    if (hk) { const p = wkbPoint(r[hk]); if (p) { pts.push({ x: p.x, y: p.y, typ: 'Point', props: r, epsg: p.srid }); continue; } }
    const k = (re) => keys.find((x) => re.test(x.trim()));
    const la = k(LATK), lo = k(LONK);
    const [nk, ek] = pair || [null, null];
    const wk = keys.find((x) => /^(wkt|geometri|geometry|geom|the_geom|shape)$/i.test(x) && /POINT|POLYGON|LINESTRING/i.test(String(r[x])));
    if (la && lo && num(r[la]) != null && num(r[lo]) != null) pts.push({ x: num(r[lo]), y: num(r[la]), wgs: true, typ: 'Point', props: r });
    else if (nk && ek && num(r[nk]) != null && num(r[ek]) != null) pts.push({ x: num(r[ek]), y: num(r[nk]), typ: 'Point', props: r });
    else if (wk) { const w = parseWkt(r[wk]); const c = centroid(w.pts); if (c) pts.push({ x: c[0], y: c[1], typ: w.type, props: r }); }
    else if (r.geometry?.coordinates) { const c = r.geometry.type === 'Point' ? r.geometry.coordinates : centroid(flatCoords(r.geometry)); pts.push({ x: c[0], y: c[1], typ: r.geometry.type, props: r }); }
  }
  return { epsg: pts.find((p) => p.epsg)?.epsg || null, pts };
}
// Gissar CRS: WGS84 om värdena ser ut som grader, annars den SWEREF-zon som lägger flest punkter i Sverige
// (och, om kommunkod ges, i rätt kommun).
function guessEpsg(pts, kommunNamn) {
  const s = pts.slice(0, 40);
  if (s.every((p) => Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90)) {
    // ibland är lat/lon omkastade
    const swapped = s.filter((p) => p.x > 54 && p.y < 25).length > s.length / 2;
    return swapped ? 'swap' : 4326;
  }
  let best = null;
  for (const epsg of Object.keys(ZONES).map(Number)) {
    let score = 0;
    for (const p of s) {
      const w = projToWgs(p.x, p.y, epsg); if (!(w.lat > 55 && w.lat < 69.1 && w.lon > 10.5 && w.lon < 24.2)) continue;
      const k = kommunFor(w.lat, w.lon, 500); score += k ? (kommunNamn && k.namn === kommunNamn ? 2 : 1) : 0;
    }
    if (!best || score > best.score) best = { epsg, score };
  }
  return best?.epsg ?? 3006;
}
export function toFeatures(data, kommunNamn) {
  const { epsg: given, pts } = rawPoints(data);
  if (!pts.length) return [];
  const anyWgs = pts.some((p) => p.wgs);
  const epsg = anyWgs ? 4326 : given && given !== 4326 ? given : given === 4326 && pts.every((p) => Math.abs(p.x) <= 180) ? 4326 : guessEpsg(pts, kommunNamn);
  const conv = (x, y) => epsg === 'swap' ? { lat: x, lon: y } : projToWgs(x, y, epsg);
  const convGeom = (g) => {
    if (!g) return null;
    const ring = (r) => r.map(([x, y]) => { const w = conv(x, y); return [Math.round(w.lon * 1e6) / 1e6, Math.round(w.lat * 1e6) / 1e6]; });
    return g.type === 'Polygon' ? g.coordinates.map(ring) : g.coordinates.flatMap((poly) => poly.map(ring));
  };
  return pts.map((p) => {
    const w = conv(p.x, p.y);
    const props = { ...p.props }; delete props.geometry; delete props.the_geom;
    return { lat: Math.round(w.lat * 1e6) / 1e6, lon: Math.round(w.lon * 1e6) / 1e6, geom_typ: p.typ, props, ...(p.geom ? { rings: convGeom(p.geom) } : {}) };
  }).filter((f) => f.lat > 55 && f.lat < 69.1 && f.lon > 10.5 && f.lon < 24.2);
}
