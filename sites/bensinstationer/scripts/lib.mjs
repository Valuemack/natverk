// Gemensamma hjälpfunktioner för bensinstationer.nu-datapipelinen (beroendefri, Node 18+).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');
export const RAW = path.join(DATA, 'raw');
export const CACHE = path.join(DATA, 'cache');
export const REF = path.join(DATA, 'ref');
// OSM-datasetet ägs av en annan pipeline (osm-data) – läses, skrivs aldrig.
export const OSM_FILE = process.env.OSM_FILE || path.resolve(ROOT, '..', 'osm-data', 'data', 'bensinstationer.json');

export const UA = 'Mozilla/5.0 (compatible; station-data-collector/1.0)';
const UA_TOKEN = 'station-data-collector';
// Om någon av dessa har Disallow för en sökväg avstår vi också (vi är ett AI-assisterat insamlingsverktyg).
const AI_AGENTS = ['claudebot', 'claude-web', 'claude-user', 'claude-searchbot', 'anthropic-ai', 'gptbot', 'chatgpt-user', 'ccbot', 'google-extended', 'cohere-ai', 'perplexitybot', 'bytespider', 'meta-externalagent', 'applebot-extended'];
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS || 1100); // max 1 anrop/s per domän

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
export const nowIso = () => new Date().toISOString();

export function readJSON(p, fallback = undefined) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
export function writeJSON(p, obj, pretty = true) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, pretty ? JSON.stringify(obj, null, 1) : JSON.stringify(obj));
  fs.renameSync(tmp, p);
}

// ------------------------------------------------------------------ robots.txt
const robotsCache = new Map();
function parseRobots(txt) {
  const groups = []; let cur = null; let lastWasUA = false;
  const signals = [];
  for (let line of txt.split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasUA = true; continue;
    }
    lastWasUA = false;
    if ((key === 'allow' || key === 'disallow') && cur) cur.rules.push({ allow: key === 'allow', path: val });
    if (key === 'content-usage' || key === 'content-signal') signals.push(`${m[1]}: ${val}`);
  }
  return { groups, signals };
}
function ruleMatches(rulePath, p) {
  if (!rulePath) return false;
  let rp = rulePath; const anchor = rp.endsWith('$'); if (anchor) rp = rp.slice(0, -1);
  const re = new RegExp('^' + rp.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + (anchor ? '$' : ''));
  return re.test(p);
}
function allowedBy(group, p) {
  let best = null;
  for (const r of group.rules) {
    if (r.path === '' && !r.allow) continue; // "Disallow:" (tomt) = allt tillåtet
    if (ruleMatches(r.path, p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best ? best.allow : true;
}
/** Hämtar och tolkar robots.txt för en origin. Returnerar { status, signals, check(path) }. */
export async function robotsFor(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let txt = '', status = 0;
  try {
    const r = await rawFetch(origin + '/robots.txt');
    status = r.status;
    const ct = r.headers.get('content-type') || '';
    txt = r.ok && !/html/i.test(ct) ? await r.text() : '';
  } catch (e) { status = -1; }
  const { groups, signals } = parseRobots(txt);
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && UA_TOKEN.includes(a)));
  const star = groups.filter((g) => g.agents.includes('*'));
  const ai = groups.filter((g) => g.agents.some((a) => AI_AGENTS.includes(a)));
  const res = {
    status, signals, hasFile: !!txt,
    aiBlocks: ai.filter((g) => !allowedBy(g, '/')).flatMap((g) => g.agents),
    check(p) {
      const main = own.length ? own : star;
      if (main.some((g) => !allowedBy(g, p))) return { ok: false, why: 'Disallow för * i robots.txt' };
      const aiHit = ai.find((g) => !allowedBy(g, p));
      if (aiHit) return { ok: false, why: `Disallow för AI-crawlers (${aiHit.agents.join(', ')}) i robots.txt` };
      return { ok: true };
    },
  };
  robotsCache.set(origin, res);
  return res;
}

/** Sammanfattning av robots.txt-kontrollerna i denna process (för data/raw/robots.json). */
export function robotsSummary() {
  return Object.fromEntries([...robotsCache].map(([o, r]) => [o, { http: r.status, har_robots_txt: r.hasFile, signaler: r.signals, ai_crawlers_blockerade: r.aiBlocks }]));
}

// ------------------------------------------------------------------ fetch
const lastHit = new Map();
async function throttle(host) {
  const wait = (lastHit.get(host) || 0) + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}
async function rawFetch(url, { timeoutMs = 45000, headers = {} } = {}) {
  await throttle(new URL(url).host);
  return fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'sv-SE,sv;q=0.9', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
}
export class BlockedError extends Error { constructor(m) { super(m); this.name = 'BlockedError'; } }
/** Artig GET: kollar robots.txt, max 1 anrop/s per domän, 2 omförsök. Kastar BlockedError om robots förbjuder. */
export async function politeGet(url, { as = 'text', timeoutMs, retries = 2, headers } = {}) {
  const u = new URL(url);
  const rob = await robotsFor(u.origin);
  const c = rob.check(u.pathname + u.search);
  if (!c.ok) throw new BlockedError(`${u.host}${u.pathname}: ${c.why}`);
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await rawFetch(url, { timeoutMs, headers });
      if (r.status === 403 || r.status === 429) throw new BlockedError(`${u.host}: HTTP ${r.status} (stoppar, ingen kringgång)`);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      const body = await r.text();
      if (/captcha|cf-challenge|challenge-platform/i.test(body.slice(0, 5000)) && /<html/i.test(body.slice(0, 500))) throw new BlockedError(`${u.host}: bot-skydd/CAPTCHA – hoppar över`);
      return as === 'json' ? JSON.parse(body) : body;
    } catch (e) {
      if (e instanceof BlockedError) throw e;
      lastErr = e; if (i < retries) await sleep(3000 * (i + 1));
    }
  }
  throw lastErr;
}

/** Disk-cache för detaljsidor: återanvänd om filen är yngre än maxAgeH. */
export async function cachedGet(url, file, { maxAgeH = 144, as = 'text' } = {}) {
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < maxAgeH * 3600e3) { const t = fs.readFileSync(file, 'utf8'); return as === 'json' ? JSON.parse(t) : t; }
  } catch {}
  const body = await politeGet(url, { as: 'text' });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return as === 'json' ? JSON.parse(body) : body;
}

/** Kör en hämtare och skriv data/raw/<namn>.json. Vid fel behålls föregående fil och felet loggas. */
export async function runFetcher(name, fn) {
  const out = path.join(RAW, `${name}.json`);
  const t0 = Date.now();
  try {
    const res = await fn();
    writeJSON(out, { kalla: name, hamtad: nowIso(), status: 'ok', ...res }, false);
    log(`${name}: ${res.stationer?.length ?? res.priser?.length ?? 0} poster (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    const prev = readJSON(out);
    const status = e instanceof BlockedError ? 'blockerad' : 'fel';
    log(`${name}: ${status.toUpperCase()} – ${e.message}${prev ? ' (behåller föregående data)' : ''}`);
    writeJSON(out, { ...(prev || { kalla: name, stationer: [] }), status, fel: e.message, senaste_forsok: nowIso() }, false);
    process.exitCode = 0;
  }
}

// ------------------------------------------------------------------ text/normalisering
export function titleCase(s) {
  if (!s) return s;
  s = String(s).trim().replace(/\s+/g, ' ');
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
export function normPostnr(p) {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length === 5 ? `${d.slice(0, 3)} ${d.slice(3)}` : null;
}
export function normPhone(p) {
  if (!p) return null;
  let s = String(p).trim();
  if (/^\+46/.test(s)) s = '0' + s.replace(/^\+46\s*/, '');
  s = s.replace(/[^\d\s-]/g, '').trim();
  return s.replace(/\D/g, '').length >= 7 ? s : null;
}
export function slug(text) {
  return String(text ?? '').toLowerCase()
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/ü/g, 'u')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' och ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** "Kungsgatan 12 B" -> "kungsgatan" (för matchning). */
export const streetKey = (s) => fold(String(s ?? '').split(/[,;]/)[0].replace(/\s+\d.*$/, ''));
export const toNum = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

// ------------------------------------------------------------------ öppettider
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const hm = (t) => {
  if (t == null || t === '') return null;
  const m = String(t).match(/^(\d{1,2})[:.]?(\d{2})?/); if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
};
/** Ett intervall "HH:MM-HH:MM"; open==close (00:00-00:00) tolkas som dygnet runt, close 00:00 -> 24:00. */
export function span(open, close) {
  const a = hm(open), b0 = hm(close);
  if (!a || !b0) return null;
  if (a === b0) return '00:00-24:00';
  const b = b0 === '00:00' || b0 === '23:59' ? '24:00' : b0;
  return `${a}-${b}`;
}
/** {weekday, saturday, sunday} med {open, close} -> {mon..sun} eller null. */
export function weekShape(wk, sat, sun) {
  const w = wk && span(wk.open, wk.close), s = sat && span(sat.open, sat.close), u = sun && span(sun.open, sun.close);
  if (!w && !s && !u) return null;
  return { mon: w, tue: w, wed: w, thu: w, fri: w, sat: s, sun: u };
}
export const isAlwaysOpen = (o) => !!o && DAYS.every((d) => o[d] === '00:00-24:00');
export const allDay = () => Object.fromEntries(DAYS.map((d) => [d, '00:00-24:00']));

// ------------------------------------------------------------------ geometri
export function distM(lat1, lon1, lat2, lon2) {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180), y = lat2 - lat1;
  return Math.sqrt(x * x + y * y) * Math.PI / 180 * 6371000;
}
export class Grid {
  constructor(cell = 0.02) { this.cell = cell; this.m = new Map(); }
  key(i, j) { return i * 100000 + j; }
  add(lat, lon, item) { const k = this.key(Math.floor(lat / this.cell), Math.floor(lon / this.cell)); let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(item); }
  near(lat, lon, r = 1) {
    const i0 = Math.floor(lat / this.cell), j0 = Math.floor(lon / this.cell), out = [];
    for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) { const a = this.m.get(this.key(i, j)); if (a) out.push(...a); }
    return out;
  }
}

// Kommun via punkt-i-polygon mot SCB:s kommungränser (CC0, SWEREF 99 TM).
// wgs84ToSweref/pointInRings/distToRings kopierade från vardcentralen/scripts/lib.mjs.
const GK = (() => {
  const a = 6378137.0, f = 1 / 298.257222101, lon0 = 15.0, k0 = 0.9996, FN = 0.0, FE = 500000.0;
  const e2 = f * (2 - f), n = f / (2 - f), ah = (a / (1 + n)) * (1 + (n * n) / 4 + (n ** 4) / 64);
  return { lon0, k0, FN, FE, e2, n, ah };
})();
export function wgs84ToSweref(lat, lon) {
  const { lon0, k0, FN, FE, e2, n, ah } = GK; const rad = Math.PI / 180;
  const A = e2, B = (5 * e2 * e2 - e2 ** 3) / 6, C = (104 * e2 ** 3 - 45 * e2 ** 4) / 120, D = (1237 * e2 ** 4) / 1260;
  const b1 = n / 2 - (2 * n * n) / 3 + (5 * n ** 3) / 16 + (41 * n ** 4) / 180;
  const b2 = (13 * n * n) / 48 - (3 * n ** 3) / 5 + (557 * n ** 4) / 1440;
  const b3 = (61 * n ** 3) / 240 - (103 * n ** 4) / 140, b4 = (49561 * n ** 4) / 161280;
  const phi = lat * rad, lam = lon * rad, lam0 = lon0 * rad; const s = Math.sin(phi);
  const phis = phi - s * Math.cos(phi) * (A + B * s * s + C * s ** 4 + D * s ** 6);
  const dl = lam - lam0; const xi = Math.atan(Math.tan(phis) / Math.cos(dl)); const eta = Math.atanh(Math.cos(phis) * Math.sin(dl));
  const N = k0 * ah * (xi + b1 * Math.sin(2 * xi) * Math.cosh(2 * eta) + b2 * Math.sin(4 * xi) * Math.cosh(4 * eta) + b3 * Math.sin(6 * xi) * Math.cosh(6 * eta) + b4 * Math.sin(8 * xi) * Math.cosh(8 * eta)) + FN;
  const E = k0 * ah * (eta + b1 * Math.cos(2 * xi) * Math.sinh(2 * eta) + b2 * Math.cos(4 * xi) * Math.sinh(4 * eta) + b3 * Math.cos(6 * xi) * Math.sinh(6 * eta) + b4 * Math.cos(8 * xi) * Math.sinh(8 * eta)) + FE;
  return { N, E };
}
function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToRings(x, y, rings) {
  let best = Infinity;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j], [x2, y2] = ring[i]; const dx = x2 - x1, dy = y2 - y1;
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}
let KOMMUNER = null;
export function kommunFor(lat, lon) {
  if (!KOMMUNER) {
    const scb = readJSON(path.join(REF, 'scb-kommuner.json'));
    const meta = new Map(readJSON(path.join(REF, 'kommuner.json')).map((k) => [k.kommunkod, k]));
    KOMMUNER = scb.kommuner.map((k) => ({ ...k, namn: meta.get(k.kod)?.namn || k.namn, lan: meta.get(k.kod)?.lan || null }));
  }
  const { N, E } = wgs84ToSweref(lat, lon);
  for (const k of KOMMUNER) {
    const [x0, y0, x1, y1] = k.bbox;
    if (E < x0 || E > x1 || N < y0 || N > y1) continue;
    if (pointInRings(E, N, k.rings)) return { kommun: k.namn, lan: k.lan, kommunkod: k.kod, metod: 'polygon' };
  }
  let best = null, bd = Infinity;
  for (const k of KOMMUNER) {
    const [x0, y0, x1, y1] = k.bbox;
    if (E < x0 - 5000 || E > x1 + 5000 || N < y0 - 5000 || N > y1 + 5000) continue;
    const d = distToRings(E, N, k.rings); if (d < bd) { bd = d; best = k; }
  }
  return best && bd < 3000 ? { kommun: best.namn, lan: best.lan, kommunkod: best.kod, metod: `narmast_${Math.round(bd)}m` } : null;
}

// ------------------------------------------------------------------ gemensamt postformat för kedjedata
/**
 * Normaliserad kedjepost (data/raw/<kalla>.json -> stationer[]):
 * { kalla, kalla_id, kedja, namn_kalla, typ, gatuadress, postnummer, ort, kommun_kalla, lat, lon, telefon, webb,
 *   oppettider, oppettider_butik, oppettider_pumpar, drivmedel{}, tjanster{}, priser|null, kalla_extra{} }
 */
export function emptyDrivmedel() {
  return { bensin95: null, bensin98: null, diesel: null, hvo100: null, e85: null, biogas: null, el: null, adblue: null };
}
export function emptyTjanster() {
  return { butik: null, biltvatt: null, truckdiesel: null, laddning: null, adblue: null, toalett: null, mat: null };
}
