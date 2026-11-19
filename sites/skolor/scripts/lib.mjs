// Shared helpers for the skolor data pipeline. Node 24, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPTS_DIR, '..');
export const DATA = path.join(ROOT, 'data');
export const RAW = path.join(DATA, 'raw');
export const UA = 'Mozilla/5.0 (compatible; open-data-fetcher/1.0)';
export const TODAY = new Date().toISOString().slice(0, 10);

fs.mkdirSync(RAW, { recursive: true });

export const argv = new Set(process.argv.slice(2));
/** --cache: reuse raw responses from data/raw instead of refetching (for development). */
export const USE_CACHE = argv.has('--cache');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Global rate limit: at most 2 requests/second per host (we use >= 550 ms spacing).
const lastByHost = new Map();
async function throttle(url) {
  const host = new URL(url).host;
  const min = 550;
  const now = Date.now();
  const next = Math.max(now, (lastByHost.get(host) ?? 0) + min);
  lastByHost.set(host, next);
  if (next > now) await sleep(next - now);
}

/**
 * fetch with throttle + retries. Returns text.
 * opts: { method, body, headers, timeoutMs, retries }
 */
export async function fetchText(url, opts = {}) {
  const { method = 'GET', body, headers = {}, timeoutMs = 120000, retries = 4 } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(url);
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { 'User-Agent': UA, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (res.status === 404) {
        const e = new Error(`404 ${url}`);
        e.status = 404;
        throw e;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 200)}`);
      return text;
    } catch (e) {
      lastErr = e;
      if (e.status === 404) throw e;
      const wait = 2000 * 2 ** attempt;
      console.warn(`  ! ${e.message.slice(0, 160)} (retry ${attempt + 1}/${retries} in ${wait} ms)`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts = {}) {
  return JSON.parse(await fetchText(url, opts));
}

/** Fetch JSON with an on-disk raw cache in data/raw/<name>. maxAgeDays: reuse cache if newer. */
export async function cachedJson(name, url, opts = {}, maxAgeDays = 0) {
  const file = path.join(RAW, name);
  if (fs.existsSync(file)) {
    const ageDays = (Date.now() - fs.statSync(file).mtimeMs) / 86400000;
    if (USE_CACHE || ageDays < maxAgeDays) return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const text = await fetchText(url, opts);
  const json = JSON.parse(text);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return json;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(path.isAbsolute(file) ? file : path.join(DATA, file), 'utf8'));
}

export function writeJson(file, data) {
  const p = path.isAbsolute(file) ? file : path.join(DATA, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n');
  fs.renameSync(tmp, p);
  console.log(`  -> wrote ${path.relative(ROOT, p)} (${Array.isArray(data) ? data.length + ' rows' : 'object'})`);
}

/** lowercase ascii slug: å→a ä→a ö→o, other diacritics stripped, spaces→- */
export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' och ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "NYKÖPING" -> "Nyköping", "UPPLANDS VÄSBY" -> "Upplands Väsby". Leaves mixed case alone. */
export function titleCase(s) {
  if (!s) return s;
  s = String(s).trim().replace(/\s+/g, ' ');
  if (s !== s.toUpperCase()) return s;
  const small = new Set(['i', 'och', 'på', 'av', 'för', 'vid', 'under', 'över', 'ab', 'hb', 'kb', 'kommun', 'stad', 'kommunalförbund', 'förbund', 'län', 'församling', 'kommuns']);
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      if (['ab', 'hb', 'kb'].includes(w)) return w.toUpperCase();
      if (i > 0 && small.has(w)) return w;
      return w.replace(/(^|[-(/])([a-zåäöéü])/g, (m, a, b) => a + b.toUpperCase());
    })
    .join(' ');
}

export function cleanPhone(p) {
  if (!p) return null;
  const s = String(p).trim();
  if (!/\d{5,}/.test(s.replace(/[\s-]/g, ''))) return null;
  return s;
}

export function cleanUrl(u) {
  if (!u) return null;
  let s = String(u).trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try {
    const url = new URL(s);
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const GENERIC_MAIL = /(info|kontakt|expedition|exp|reception|kansli|admin|vux|komvux|sfi|vuxen|larcentrum|lärcentrum|studie|skola|skolan|forskola|förskola|utbildning|registrator|kundtjanst|kundtjänst|kommun|post|office|mail|elev|antagning|syv|vagledning|vägledning|center|centrum|campus|gymnasi|service|bildning|barn|kompetens)/i;

/**
 * Keep only addresses that look like official unit/function mailboxes.
 * Drops addresses containing a person's name (e.g. headmaster) and firstname.lastname patterns.
 */
export function officialEmail(e, personNames = []) {
  if (!e) return null;
  const s = String(e).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s)) return null;
  const local = s.split('@')[0];
  const norm = (x) => slugify(x).replace(/-/g, '');
  const localN = norm(local);
  for (const n of personNames) {
    for (const part of String(n || '').split(/[\s,.-]+/)) {
      const p = norm(part);
      if (p.length >= 3 && localN.includes(p)) return null;
    }
  }
  // firstname.lastname / f.lastname style -> personal unless clearly generic
  if (/^[a-zåäöéü]+[._-][a-zåäöéü]+([._-][a-zåäöéü]+)?\d*$/.test(local) && !GENERIC_MAIL.test(local)) return null;
  if (/^[a-z]{1,2}\d*$/.test(local)) return null; // initials
  return s;
}

/** point-in-polygon for GeoJSON Polygon/MultiPolygon in lon/lat */
export function pointInGeometry(lon, lat, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const poly of polys) {
    if (!ringContains(poly[0], lon, lat)) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (ringContains(poly[h], lon, lat)) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}
function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function bbox(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Simple grid index over features with bbox for fast lookup. */
export class GeoIndex {
  constructor(features, cell = 0.1) {
    this.cell = cell;
    this.grid = new Map();
    for (const f of features) {
      f._bbox = bbox(f.geometry);
      const [x0, y0, x1, y1] = f._bbox;
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
        for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
          const k = gx + ':' + gy;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(f);
        }
    }
  }
  find(lon, lat) {
    const k = Math.floor(lon / this.cell) + ':' + Math.floor(lat / this.cell);
    for (const f of this.grid.get(k) || []) {
      const [x0, y0, x1, y1] = f._bbox;
      if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      if (pointInGeometry(lon, lat, f.geometry)) return f;
    }
    return null;
  }
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Give every row a unique extra.slug based on namn + ort (dedupe with kommun, then id). */
export function assignSlugs(rows) {
  const seen = new Map();
  const base = (r) => slugify(`${r.namn} ${r.ort && !slugify(r.namn).includes(slugify(r.ort)) ? r.ort : ''}`);
  for (const r of rows) seen.set(base(r), (seen.get(base(r)) || 0) + 1);
  const used = new Set();
  for (const r of rows) {
    let s = base(r);
    if (seen.get(s) > 1 && r.kommun && !s.includes(slugify(r.kommun))) s = `${s}-${slugify(r.kommun)}`;
    if (used.has(s)) s = `${s}-${slugify(r.id)}`;
    used.add(s);
    r.extra.slug = s;
  }
}

export function loadKommuner() {
  const list = readJson('kommuner.json');
  const byKod = new Map(list.map((k) => [k.kommunkod, k]));
  return { list, byKod };
}

/** SWEREF 99 TM (EPSG:3006) -> WGS84. Gauss–Krüger inverse per Lantmäteriet's formulas. */
export function sweref99tmToWgs84(northing, easting) {
  const a = 6378137, f = 1 / 298.257222101, lon0 = 15 * Math.PI / 180, k0 = 0.9996, FN = 0, FE = 500000;
  const e2 = f * (2 - f), n = f / (2 - f);
  const aRoof = (a / (1 + n)) * (1 + n * n / 4 + n ** 4 / 64);
  const d1 = n / 2 - (2 * n * n) / 3 + (37 * n ** 3) / 96 - n ** 4 / 360;
  const d2 = (n * n) / 48 + n ** 3 / 15 - (437 * n ** 4) / 1440;
  const d3 = (17 * n ** 3) / 480 - (37 * n ** 4) / 840;
  const d4 = (4397 * n ** 4) / 161280;
  const As = e2 + e2 ** 2 + e2 ** 3 + e2 ** 4;
  const Bs = -(7 * e2 ** 2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6;
  const Cs = (224 * e2 ** 3 + 889 * e2 ** 4) / 120;
  const Ds = -(4279 * e2 ** 4) / 1260;
  const xi = (northing - FN) / (k0 * aRoof), eta = (easting - FE) / (k0 * aRoof);
  const xiP = xi - d1 * Math.sin(2 * xi) * Math.cosh(2 * eta) - d2 * Math.sin(4 * xi) * Math.cosh(4 * eta) - d3 * Math.sin(6 * xi) * Math.cosh(6 * eta) - d4 * Math.sin(8 * xi) * Math.cosh(8 * eta);
  const etaP = eta - d1 * Math.cos(2 * xi) * Math.sinh(2 * eta) - d2 * Math.cos(4 * xi) * Math.sinh(4 * eta) - d3 * Math.cos(6 * xi) * Math.sinh(6 * eta) - d4 * Math.cos(8 * xi) * Math.sinh(8 * eta);
  const phiS = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  const dLon = Math.atan(Math.sinh(etaP) / Math.cos(xiP));
  const s2 = Math.sin(phiS) ** 2;
  const lat = phiS + Math.sin(phiS) * Math.cos(phiS) * (As + Bs * s2 + Cs * s2 * s2 + Ds * s2 ** 3);
  return { lat: (lat * 180) / Math.PI, lon: ((lon0 + dLon) * 180) / Math.PI };
}

/** Minimal ZIP reader (stored/deflate) using the central directory. Returns [{name, data:Buffer}]. */
export async function unzip(buf) {
  const zlib = await import('node:zlib');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip: no end of central directory');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central header');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const flags = buf.readUInt16LE(p + 8);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString(flags & 0x800 ? 'utf8' : 'latin1');
    const lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
    out.push({ name, data: method === 0 ? Buffer.from(raw) : method === 8 ? zlib.inflateRawSync(raw) : null });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

/** GeoPackage point blob -> [x, y] */
export function gpkgPoint(blob) {
  const b = Buffer.from(blob);
  if (b[0] !== 0x47 || b[1] !== 0x50) return null;
  const flags = b[3];
  const envBytes = [0, 32, 48, 48, 64][(flags >> 1) & 7] ?? 0;
  const w = 8 + envBytes;
  const le = b[w] === 1;
  const type = le ? b.readUInt32LE(w + 1) : b.readUInt32BE(w + 1);
  if ((type & 0xff) !== 1) return null;
  return le ? [b.readDoubleLE(w + 5), b.readDoubleLE(w + 13)] : [b.readDoubleBE(w + 5), b.readDoubleBE(w + 13)];
}
