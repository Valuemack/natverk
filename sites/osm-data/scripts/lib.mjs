// Shared helpers: Overpass client, geometry (point-in-polygon, nearest), opening_hours parser.
// Dependency-free, Node >= 18 (built-in fetch).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');
export const RAW = path.join(DATA, 'raw');

export const ENDPOINTS = (process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : []).concat([
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]);
const UA = 'osm-dataset-builder/1.0 (nightly POI export; ODbL attribution kept)';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let preferred = 0; // index of the endpoint that last worked
/** Run an Overpass QL query; tries endpoints in order with retries. Returns parsed JSON. */
export async function overpass(query, { label = 'query', timeoutMs = 900_000 } = {}) {
  const order = ENDPOINTS.map((_, i) => (i + preferred) % ENDPOINTS.length);
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    // the last-working endpoint gets every attempt; fallbacks only on odd attempts with a shorter timeout
    const tryList = attempt % 2 === 0 ? [order[0]] : order;
    for (const i of tryList) {
      const url = ENDPOINTS[i];
      const tmo = i === order[0] ? timeoutMs : Math.min(timeoutMs, 240_000);
      const t0 = Date.now();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(tmo),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        if (!text.trimStart().startsWith('{')) throw new Error('non-JSON response: ' + text.slice(0, 200));
        const json = JSON.parse(text);
        if (json.remark && /runtime error|timed out|timeout|out of memory|too busy/i.test(json.remark)) throw new Error('remark: ' + json.remark);
        preferred = i;
        log(`  ${label}: ${json.elements.length} elements, ${(text.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s via ${new URL(url).host}`);
        return json;
      } catch (e) {
        lastErr = e;
        log(`  ${label}: ${new URL(url).host} failed (${String(e.message || e).slice(0, 160)})`);
        await sleep(5000);
      }
    }
    await sleep(45_000 * (attempt + 1));
  }
  throw new Error(`${label}: all Overpass endpoints failed: ${lastErr}`);
}

export function readJSON(p, fallback = undefined) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
export function writeJSON(p, obj, pretty = false) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, pretty ? JSON.stringify(obj, null, 1) : JSON.stringify(obj));
  fs.renameSync(tmp, p);
}

// ---------------------------------------------------------------- geometry
const R = 6371000;
export function distM(lat1, lon1, lat2, lon2) {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  const y = lat2 - lat1;
  return Math.sqrt(x * x + y * y) * Math.PI / 180 * R;
}
/** distance (m) from point to segment, local equirectangular projection */
export function distToSegM(lat, lon, a, b) {
  const k = Math.cos(lat * Math.PI / 180);
  const ax = (a.lon - lon) * k, ay = a.lat - lat, bx = (b.lon - lon) * k, by = b.lat - lat;
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? -(ax * dx + ay * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx, py = ay + t * dy;
  return Math.sqrt(px * px + py * py) * Math.PI / 180 * R;
}

/**
 * Polygon index built from a list of rings/ways (arrays of {lat,lon}).
 * Uses the even-odd rule over ALL member segments, so multipolygon member ways
 * need not be stitched into rings (outer + inner ways together form closed rings).
 * Segments are bucketed into latitude bands for speed.
 */
export class Polygon {
  constructor(ways, bands = 64) {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    const segs = [];
    for (const w of ways) {
      for (let i = 1; i < w.length; i++) {
        const a = w[i - 1], b = w[i];
        if (!a || !b) continue;
        segs.push([a.lat, a.lon, b.lat, b.lon]);
      }
      for (const p of w) {
        if (!p) continue;
        if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon;
      }
    }
    Object.assign(this, { minLat, maxLat, minLon, maxLon, segs });
    this.nb = Math.max(1, Math.min(bands, Math.ceil(segs.length / 20)));
    this.bh = (maxLat - minLat) / this.nb || 1e-9;
    this.band = Array.from({ length: this.nb }, () => []);
    for (const s of segs) {
      const lo = Math.min(s[0], s[2]), hi = Math.max(s[0], s[2]);
      const b0 = this._b(lo), b1 = this._b(hi);
      for (let b = b0; b <= b1; b++) this.band[b].push(s);
    }
  }
  _b(lat) { return Math.max(0, Math.min(this.nb - 1, Math.floor((lat - this.minLat) / this.bh))); }
  inBBox(lat, lon, pad = 0) {
    return lat >= this.minLat - pad && lat <= this.maxLat + pad && lon >= this.minLon - pad && lon <= this.maxLon + pad;
  }
  contains(lat, lon) {
    if (!this.inBBox(lat, lon)) return false;
    let inside = false;
    for (const [y1, x1, y2, x2] of this.band[this._b(lat)]) {
      if ((y1 > lat) !== (y2 > lat)) {
        const x = x1 + (lat - y1) * (x2 - x1) / (y2 - y1);
        if (x > lon) inside = !inside;
      }
    }
    return inside;
  }
  distanceM(lat, lon) {
    let best = Infinity;
    for (const [y1, x1, y2, x2] of this.segs) {
      const d = distToSegM(lat, lon, { lat: y1, lon: x1 }, { lat: y2, lon: x2 });
      if (d < best) best = d;
    }
    return best;
  }
}

/** Polygon from an Overpass element returned with `out geom` (way or relation). */
export function polygonOf(el) {
  if (el.type === 'way' && el.geometry) return new Polygon([el.geometry]);
  if (el.type === 'relation' && el.members) {
    const ways = el.members.filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === 'inner' || m.role === '')).map((m) => m.geometry);
    return ways.length ? new Polygon(ways) : null;
  }
  return null;
}

/** Simple grid index for points (or any items with lat/lon). */
export class Grid {
  constructor(cell = 0.05) { this.cell = cell; this.m = new Map(); }
  key(i, j) { return i * 100000 + j; }
  add(lat, lon, item) {
    const k = this.key(Math.floor(lat / this.cell), Math.floor(lon / this.cell));
    let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(item);
  }
  /** items in cells within r cells of the point */
  near(lat, lon, r = 1) {
    const i0 = Math.floor(lat / this.cell), j0 = Math.floor(lon / this.cell), out = [];
    for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
      const a = this.m.get(this.key(i, j)); if (a) for (const x of a) out.push(x);
    }
    return out;
  }
}

/** center of an Overpass element (node lat/lon, `center`, or bounds/geometry) */
export function centerOf(el) {
  if (el.lat != null) return { lat: el.lat, lon: el.lon };
  if (el.center) return el.center;
  if (el.bounds) return { lat: (el.bounds.minlat + el.bounds.maxlat) / 2, lon: (el.bounds.minlon + el.bounds.maxlon) / 2 };
  if (el.geometry?.length) {
    let la = 0, lo = 0, n = 0; for (const p of el.geometry) if (p) { la += p.lat; lo += p.lon; n++; }
    return n ? { lat: la / n, lon: lo / n } : null;
  }
  return null;
}

// ---------------------------------------------------------------- opening_hours
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_RE = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
const DAYSEL_RE = new RegExp(`^(${DAY_RE}(?:\\s*-\\s*${DAY_RE})?(?:\\s*,\\s*(?:${DAY_RE}(?:\\s*-\\s*${DAY_RE})?|PH))*)(?:\\s*:)?\\s+(.+)$`);
const SPAN_RE = /^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/;

function normTimes(t) {
  t = t.trim();
  if (/^(off|closed)$/i.test(t)) return 'stängt';
  if (t === '24/7' || t === '00:00-24:00' || t === '0:00-24:00') return '00:00-24:00';
  const parts = t.split(/\s*,\s*/);
  const out = [];
  for (const p of parts) {
    const m = p.match(SPAN_RE);
    if (!m) return undefined;
    const mm1 = m[2] ?? '00', mm2 = m[4] ?? '00';
    const [h1, m1, h2, m2] = [+m[1], +mm1, +m[3], +mm2];
    if (h1 > 24 || h2 > 48 || m1 > 59 || m2 > 59) return undefined;
    out.push(`${String(h1).padStart(2, '0')}:${mm1}-${String(h2).padStart(2, '0')}:${mm2}`);
  }
  return out.join(', ');
}
function expandDays(sel) {
  const set = new Set();
  for (const part of sel.split(/\s*,\s*/)) {
    if (part === 'PH') continue;
    const [a, b] = part.split(/\s*-\s*/);
    const i = DAYS.indexOf(a), j = b ? DAYS.indexOf(b) : i;
    if (i < 0 || j < 0) return null;
    for (let k = i; ; k = (k + 1) % 7) { set.add(k); if (k === j) break; }
  }
  return set;
}
/**
 * Parse the common simple opening_hours forms into {mon..sun}.
 * Returns null when the value is absent or too complex (months, weeks, sunrise, comments, ...).
 */
export function parseOpeningHours(s) {
  if (!s || typeof s !== 'string') return null;
  s = s.trim().replace(/\s+/g, ' ').replace(/;\s*$/, '');
  if (!s) return null;
  if (/^24\/7$/.test(s)) return Object.fromEntries(KEYS.map((k) => [k, '00:00-24:00']));
  // split into rules: ';' and also ', ' when followed by a weekday (Mo-Fr 08-17, Sa 10-14)
  const rules = s.split(/\s*;\s*|(?<=\d|off|closed)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/).filter(Boolean);
  const res = new Array(7).fill(undefined);
  let any = false;
  for (let r of rules) {
    r = r.trim();
    if (/^(PH|SH)\b/.test(r)) continue; // holiday rules: ignore
    let days, times;
    const m = r.match(DAYSEL_RE);
    if (m) { days = expandDays(m[1]); times = m[2]; if (!days) return null; }
    else { days = new Set([0, 1, 2, 3, 4, 5, 6]); times = r; }
    const t = normTimes(times);
    if (t === undefined) return null;
    for (const d of days) res[d] = t;
    any = true;
  }
  if (!any) return null;
  return Object.fromEntries(KEYS.map((k, i) => [k, res[i] ?? 'stängt']));
}

// ---------------------------------------------------------------- misc formatting
export function normPostcode(p) {
  if (!p) return null;
  const d = String(p).replace(/\D/g, '');
  return d.length === 5 ? `${d.slice(0, 3)} ${d.slice(3)}` : null;
}
export function normUrl(u) {
  if (!u) return null;
  u = String(u).split(';')[0].trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/\//, '');
  return u;
}
export function normPhone(p) {
  if (!p) return null;
  return String(p).split(';')[0].trim() || null;
}
export const yesNo = (v) => (v == null ? null : v === 'yes' ? true : v === 'no' ? false : v);
export const num = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
