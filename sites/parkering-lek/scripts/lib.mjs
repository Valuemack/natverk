// Gemensamma hjälpfunktioner för datainsamlingen (inga externa beroenden).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SITE_DIR = path.resolve(SCRIPTS_DIR, '..');
export const DATA_DIR = path.join(SITE_DIR, 'data');
export const RAW_DIR = path.join(DATA_DIR, 'raw');

// Generisk User-Agent. Obs: overpass-api.de svarar 406 på UA som innehåller "Mozilla" eller "crawler".
export const UA = 'dataset-builder/1.0 (open data compilation)';

export function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); return d; }
export function readJson(p, fallback = undefined) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}
export function writeJson(p, obj, pretty = true) {
  ensureDir(path.dirname(p));
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj));
  fs.renameSync(tmp, p);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nowIso = () => new Date().toISOString();

// Hämtning med timeout, retry och artig paus. minIntervalMs styr max-takten per värd.
const lastHit = new Map();
export async function politeFetch(url, { minIntervalMs = 1100, timeoutMs = 60000, retries = 3, method = 'GET', body, headers = {} } = {}) {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const wait = (lastHit.get(host) || 0) + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    try {
      const r = await fetch(url, { method, body, headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
      if (r.status === 429 || r.status >= 500) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
      return r;
    } catch (e) {
      if (attempt >= retries) throw e;
      const backoff = 5000 * (attempt + 1) * (e.status === 429 ? 3 : 1);
      console.warn(`  ! ${url} -> ${e.message}; försöker igen om ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
}

// Minimal CSV-parser (RFC 4180, citattecken, valfri separator).
export function parseCsv(text, sep = ',') {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f.length || row.length) { row.push(f.replace(/\r$/, '')); rows.push(row); }
  const [head, ...rest] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// Minimal zip-läsare (stored/deflate) via central directory.
export function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Inte en zip-fil');
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42); const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(lho + 26), lxlen = buf.readUInt16LE(lho + 28);
    const data = buf.slice(lho + 30 + lnlen + lxlen, lho + 30 + lnlen + lxlen + csize);
    files[name] = method === 0 ? data : zlib.inflateRawSync(data);
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

// Shapefile (polygon, typ 5) + DBF.
export function readShp(buf) {
  const shapes = []; let p = 100;
  while (p < buf.length) {
    const len = buf.readInt32BE(p + 4) * 2; const c = p + 8; const type = buf.readInt32LE(c);
    if (type === 5) {
      const bbox = [buf.readDoubleLE(c + 4), buf.readDoubleLE(c + 12), buf.readDoubleLE(c + 20), buf.readDoubleLE(c + 28)];
      const np = buf.readInt32LE(c + 36), npt = buf.readInt32LE(c + 40);
      const parts = []; for (let i = 0; i < np; i++) parts.push(buf.readInt32LE(c + 44 + i * 4));
      const pts0 = c + 44 + np * 4; const rings = [];
      for (let i = 0; i < np; i++) {
        const s = parts[i], e = i + 1 < np ? parts[i + 1] : npt; const ring = [];
        for (let k = s; k < e; k++) ring.push([buf.readDoubleLE(pts0 + k * 16), buf.readDoubleLE(pts0 + k * 16 + 8)]);
        rings.push(ring);
      }
      shapes.push({ bbox, rings });
    } else shapes.push(null);
    p = c + len;
  }
  return shapes;
}
export function readDbf(buf, encoding = 'latin1') {
  const n = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10);
  const fields = []; for (let p = 32; buf[p] !== 0x0d; p += 32) fields.push({ name: buf.slice(p, p + 11).toString('latin1').replace(/\0.*$/, ''), len: buf[p + 16] });
  const dec = new TextDecoder(encoding === 'utf8' ? 'utf-8' : 'windows-1252');
  const out = [];
  for (let i = 0; i < n; i++) {
    let p = hlen + i * rlen + 1; const rec = {};
    for (const f of fields) { rec[f.name] = dec.decode(buf.slice(p, p + f.len)).trim(); p += f.len; }
    out.push(rec);
  }
  return out;
}

// Punkt-i-polygon (even-odd över alla ringar, hanterar hål).
export function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
export function distToRings(x, y, rings) {
  let best = Infinity;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j], [x2, y2] = ring[i]; const dx = x2 - x1, dy = y2 - y1;
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}

// WGS84 <-> SWEREF 99 TM (Gauss-Krüger, Lantmäteriets formler).
const GK = (() => {
  const a = 6378137.0, f = 1 / 298.257222101, lon0 = 15.0, k0 = 0.9996, FN = 0.0, FE = 500000.0;
  const e2 = f * (2 - f), n = f / (2 - f), ah = (a / (1 + n)) * (1 + (n * n) / 4 + (n ** 4) / 64);
  return { a, f, lon0, k0, FN, FE, e2, n, ah };
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
export function swerefToWgs84(N, E) {
  const { lon0, k0, FN, FE, e2, n, ah } = GK; const rad = Math.PI / 180;
  const d1 = n / 2 - (2 * n * n) / 3 + (37 * n ** 3) / 96 - (n ** 4) / 360;
  const d2 = (n * n) / 48 + (n ** 3) / 15 - (437 * n ** 4) / 1440;
  const d3 = (17 * n ** 3) / 480 - (37 * n ** 4) / 840, d4 = (4397 * n ** 4) / 161280;
  const As = e2 + e2 ** 2 + e2 ** 3 + e2 ** 4, Bs = -(7 * e2 ** 2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6;
  const Cs = (224 * e2 ** 3 + 889 * e2 ** 4) / 120, Ds = -(4279 * e2 ** 4) / 1260;
  const xi = (N - FN) / (k0 * ah), eta = (E - FE) / (k0 * ah);
  const xip = xi - d1 * Math.sin(2 * xi) * Math.cosh(2 * eta) - d2 * Math.sin(4 * xi) * Math.cosh(4 * eta) - d3 * Math.sin(6 * xi) * Math.cosh(6 * eta) - d4 * Math.sin(8 * xi) * Math.cosh(8 * eta);
  const etap = eta - d1 * Math.cos(2 * xi) * Math.sinh(2 * eta) - d2 * Math.cos(4 * xi) * Math.sinh(4 * eta) - d3 * Math.cos(6 * xi) * Math.sinh(6 * eta) - d4 * Math.cos(8 * xi) * Math.sinh(8 * eta);
  const phis = Math.asin(Math.sin(xip) / Math.cosh(etap)); const dl = Math.atan(Math.sinh(etap) / Math.cos(xip));
  const s = Math.sin(phis);
  const phi = phis + s * Math.cos(phis) * (As + Bs * s * s + Cs * s ** 4 + Ds * s ** 6);
  return { lat: phi / rad, lon: lon0 + dl / rad };
}

export function haversineM(a, b) {
  const R = 6371000, rad = Math.PI / 180; const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Normalisering av namn för matchning mellan källor.
export function normName(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(vardcentral(en)?|halsocentral(en)?|huslakarmottagning(en)?|vc|hc|ab|och|bvc|mvc|filial)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
export function slugify(s) {
  return (s || '').toLowerCase().replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Tillägg för parkering-lek: robots.txt-kontroll + artig hämtning med cache.
// robots.txt respekteras för grupperna "*" och alla AI-/dataset-specifika user-agents nedan
// (unionen av deras Disallow gäller). Allow med längre matchning vinner som i RFC 9309.
const AI_AGENTS = ['*', 'dataset-builder', 'claudebot', 'claude-web', 'claude-user', 'claude-searchbot', 'anthropic-ai', 'gptbot', 'chatgpt-user', 'oai-searchbot', 'ccbot', 'google-extended', 'perplexitybot', 'bytespider', 'cohere-ai', 'ai2bot', 'applebot-extended', 'meta-externalagent', 'amazonbot', 'diffbot', 'omgilibot', 'youbot'];
const robotsCache = new Map();
function parseRobots(txt) {
  const groups = []; let cur = null; let lastWasUa = false;
  for (let line of txt.split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasUa) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasUa = true; continue; }
    lastWasUa = false;
    if (!cur) continue;
    if (k === 'disallow' || k === 'allow') cur.rules.push({ allow: k === 'allow', path: v });
    if (k === 'crawl-delay') cur.crawlDelay = Number(v);
  }
  return groups;
}
const ruleRe = (p) => {
  const end = p.endsWith('$'); const body = end ? p.slice(0, -1) : p;
  return new RegExp('^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (end ? '$' : ''));
};
export async function robotsFor(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let groups = [], status = 0;
  try {
    const r = await politeFetch(origin + '/robots.txt', { retries: 1, timeoutMs: 20000 });
    status = r.status;
    if (r.ok && /text\/plain/i.test(r.headers.get('content-type') || 'text/plain')) groups = parseRobots(await r.text());
  } catch { status = -1; }
  const applicable = groups.filter((g) => g.agents.some((a) => AI_AGENTS.includes(a)));
  const res = { status, groups: applicable, crawlDelay: Math.max(0, ...applicable.map((g) => g.crawlDelay || 0)) };
  robotsCache.set(origin, res);
  return res;
}
export async function robotsAllowed(url) {
  const u = new URL(url); const rb = await robotsFor(u.origin); const p = u.pathname + u.search;
  // Varje tillämplig grupp utvärderas för sig; blockerar någon grupp så är det blockerat.
  for (const g of rb.groups) {
    let best = null;
    for (const r of g.rules) { if (r.path === '') continue; if (ruleRe(r.path).test(p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r; }
    if (best && !best.allow) return { ok: false, rule: `${g.agents.join(',')}: Disallow ${best.path}`, crawlDelay: rb.crawlDelay };
  }
  return { ok: true, crawlDelay: rb.crawlDelay };
}
export class BlockedError extends Error {}
// Hämtar en URL om robots.txt tillåter det; max 1 anrop/s per värd (längre om Crawl-delay anges).
// Stoppar vid inloggning/CAPTCHA/botskydd (401/403/challenge-sidor) i stället för att försöka kringgå.
export async function fetchAllowed(url, opts = {}) {
  const rb = await robotsAllowed(url);
  if (!rb.ok) throw new BlockedError(`robots.txt blockerar ${url} (${rb.rule})`);
  const r = await politeFetch(url, { minIntervalMs: Math.max(1100, (rb.crawlDelay || 0) * 1000), ...opts });
  if (r.status === 401 || r.status === 403) throw new BlockedError(`HTTP ${r.status} (inloggning/botskydd) för ${url}`);
  return r;
}
export async function fetchText(url, opts) {
  const r = await fetchAllowed(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status} för ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  let t = buf.toString('utf8');
  // Vissa kommunala CSV/JSON-filer är Windows-1252 trots att de saknar teckenkodning i headern.
  if (t.includes('�')) { const alt = new TextDecoder('windows-1252').decode(buf); if (!alt.includes('�')) t = alt; }
  if (/cf-chl|captcha|challenge-platform|Just a moment\.\.\./i.test(t.slice(0, 5000)) && /<html/i.test(t.slice(0, 500))) throw new BlockedError(`CAPTCHA/botskydd på ${url}`);
  return { text: t, buf, contentType: r.headers.get('content-type') || '' };
}
