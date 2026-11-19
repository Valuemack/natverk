// Shared helpers for the simhallar.se data pipeline (no external dependencies, Node 18+).
// Geo helpers are copied from ../../vardcentralen/scripts/lib.mjs (Lantmäteriet Gauss-Krüger formulas).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SITE_DIR = path.resolve(SCRIPTS_DIR, '..');
export const DATA_DIR = path.join(SITE_DIR, 'data');
export const RAW_DIR = path.join(DATA_DIR, 'raw');
export const PAGES_DIR = path.join(RAW_DIR, 'pages');
export const OSM_FILE = path.resolve(SITE_DIR, '..', 'osm-data', 'data', 'simhallar.json');
export const OSM_KOMMUNER = path.resolve(SITE_DIR, '..', 'osm-data', 'data', 'kommuner.json');
export const SCB_POLY = path.resolve(SITE_DIR, '..', 'vardcentralen', 'data', 'raw', 'scb-kommuner.json');

// Generic UA, no browser impersonation. Our robots token is "dataset-builder".
export const UA = 'dataset-builder/1.0 (open data compilation)';
export const ROBOTS_TOKEN = 'dataset-builder';

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
export const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- robots.txt
const AI_AGENTS = /claude|anthropic|gptbot|chatgpt|oai-searchbot|ccbot|google-extended|perplexity|cohere|bytespider|ai2bot|diffbot|omgili|applebot-extended|meta-externalagent/i;
export function parseRobots(txt) {
  const groups = []; let cur = null, lastWasAgent = false; const sitemaps = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'sitemap') { sitemaps.push(v); continue; }
    if (k === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === 'disallow' || k === 'allow') cur.rules.push({ allow: k === 'allow', path: v });
    if (k === 'crawl-delay') cur.delay = Number(v);
  }
  return { groups, sitemaps };
}
export function robotsVerdict(robots, urlPath) {
  const groups = robots?.groups || [];
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && ROBOTS_TOKEN.startsWith(a)));
  const applicable = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  // A site that disallows "/" for named AI crawlers has expressed that it does not want automated AI collection:
  // we honour that for the whole host, even though our UA is generic.
  // AI block = the site disallows "/" for Anthropic's agents, or for at least two different AI crawlers.
  const aiAgents = new Set();
  for (const g of groups) if (g.rules.some((r) => !r.allow && (r.path === '/' || r.path === '/*'))) for (const a of g.agents) if (AI_AGENTS.test(a)) aiAgents.add(a.replace(/[^a-z-]/g, ''));
  const aiBlocked = [...aiAgents].some((a) => /claude|anthropic/.test(a)) || aiAgents.size >= 2;
  const allBlocked = applicable.some((g) => g.rules.some((r) => !r.allow && (r.path === '/' || r.path === '/*')) && !g.rules.some((r) => r.allow && r.path.length > 1));
  let best = null;
  for (const g of applicable) for (const r of g.rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(urlPath) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  const delay = Math.max(0, ...applicable.map((g) => g.delay || 0));
  return { allowed: !best || best.allow, delay, aiBlocked, allBlocked };
}

// ---------------------------------------------------------------- polite fetch
// Per host: robots.txt fetched once, >= 1.1 s between requests (or Crawl-delay if larger, max 10 s),
// hosts that block AI agents, disallow everything, or answer with bot protection are recorded in `blocked`.
const hostState = new Map();
export const blocked = new Map(); // host -> reason (also stored without www.)
const bare = (h) => h.replace(/^www./, '');
export const isBlocked = (h) => blocked.get(h) || blocked.get(bare(h)) || blocked.get('www.' + bare(h));
const BOT_WALL = /(captcha|cf-chl|challenge-platform|just a moment\.\.\.|attention required|access denied|bot protection|incapsula|perimeterx|ddos-guard|are you a robot|queue-it)/i;

async function rawFetch(url, timeoutMs, headers = {}) {
  return fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'sv-SE,sv;q=0.9', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
}
async function hostGate(host, proto) {
  let h = hostState.get(host);
  if (!h) {
    h = { last: 0, delay: 1100, robots: null, ready: null, queue: Promise.resolve() };
    hostState.set(host, h);
    h.ready = (async () => {
      try {
        h.last = Date.now();
        const r = await rawFetch(`${proto}//${host}/robots.txt`, 20000);
        const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
        const txt = (buf[0] === 0xff && buf[1] === 0xfe) || buf.includes(0) ? buf.toString('utf16le').replace(/^﻿/, '') : buf.toString('utf8').replace(/^﻿/, '');
        h.robots = /<html/i.test(txt.slice(0, 500)) ? parseRobots('') : parseRobots(txt);
      } catch { h.robots = parseRobots(''); }
      const v = robotsVerdict(h.robots, '/');
      if (v.aiBlocked) { blocked.set(host, 'robots.txt blockerar AI-agenter'); blocked.set(bare(host), 'robots.txt blockerar AI-agenter'); }
      else if (v.allBlocked) blocked.set(host, 'robots.txt Disallow: /');
      else if (v.delay > 10) blocked.set(host, `Crawl-delay ${v.delay} s`);
      h.delay = Math.max(1100, Math.min(10, v.delay || 0) * 1000);
    })();
  }
  await h.ready;
  return h;
}
export async function robotsFor(url) { const u = new URL(url); return (await hostGate(u.host, u.protocol)).robots; }

export async function politeFetch(url, { timeoutMs = 30000, retries = 1, accept } = {}) {
  const u = new URL(url);
  const h = await hostGate(u.host, u.protocol);
  if (isBlocked(u.host)) return { ok: false, status: 0, blocked: isBlocked(u.host), url };
  if (!robotsVerdict(h.robots, u.pathname + u.search).allowed) return { ok: false, status: 0, disallowed: true, url };
  // serialise per host
  const run = h.queue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = h.last + h.delay - Date.now();
      if (wait > 0) await sleep(wait);
      h.last = Date.now();
      try {
        const r = await rawFetch(url, timeoutMs, accept ? { accept } : {});
        if ((r.status === 429 || r.status >= 500) && attempt < retries) { await sleep(5000 * (attempt + 1)); continue; }
        const ct = r.headers.get('content-type') || '';
        const text = /json|html|xml|text|javascript/i.test(ct) || !ct ? await r.text() : '';
        const finalHost = new URL(r.url).host;
        if ((r.status === 403 || r.status === 503 || r.status === 429) && BOT_WALL.test(text.slice(0, 5000))) {
          blocked.set(u.host, `botskydd (HTTP ${r.status})`);
          return { ok: false, status: r.status, blocked: blocked.get(u.host), url };
        }
        return { ok: r.ok, status: r.status, url: r.url, finalHost, ct, text };
      } catch (e) {
        if (attempt >= retries) return { ok: false, status: 0, error: e.message, url };
        await sleep(3000);
      }
    }
  });
  h.queue = run.catch(() => {});
  return run;
}

// Run async fn over items with limited concurrency.
export async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e.message }; } }
  }));
  return out;
}

// ---------------------------------------------------------------- geo
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
export function haversineM(a, b) {
  const R = 6371000, rad = Math.PI / 180; const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Kommun lookup via SCB polygons (CC0), copied read-only from vardcentralen/data/raw into data/raw.
let _kommuner = null;
export function loadKommunPolys() {
  if (_kommuner) return _kommuner;
  const local = path.join(RAW_DIR, 'scb-kommuner.json');
  if (!fs.existsSync(local) && fs.existsSync(SCB_POLY)) { ensureDir(RAW_DIR); fs.copyFileSync(SCB_POLY, local); }
  _kommuner = readJson(local).kommuner;
  return _kommuner;
}
export function kommunForPoint(lat, lon) {
  const ks = loadKommunPolys(); const { N, E } = wgs84ToSweref(lat, lon);
  for (const k of ks) { const [x0, y0, x1, y1] = k.bbox; if (E >= x0 && E <= x1 && N >= y0 && N <= y1 && pointInRings(E, N, k.rings)) return { kod: k.kod, namn: k.namn, dist: 0 }; }
  let best = null;
  for (const k of ks) { const d = distToRings(E, N, k.rings); if (!best || d < best.dist) best = { kod: k.kod, namn: k.namn, dist: d }; }
  return best && best.dist < 5000 ? best : null;
}

// ---------------------------------------------------------------- text
export function slugify(s) {
  return (s || '').toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function normName(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(simhall(en)?|badhus(et)?|aventyrsbad(et)?|bad(et)?|simhallsbad(et)?|sim-? och sporthall|ab|och|kommun|i|vid|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
export function decodeEntities(s) {
  return s.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/g, "'").replace(/&ndash;|&#8211;/g, '–').replace(/&mdash;|&#8212;/g, '—')
    .replace(/&aring;/g, 'å').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&Aring;/g, 'Å').replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö')
    .replace(/&eacute;/g, 'é').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
// HTML -> text lines, keeping block structure (one line per block/cell row).
export function htmlToLines(html) {
  let h = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ');
  // Table rows become one line: cells joined with " | ", line breaks inside a cell become " / ".
  h = h.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_, row) => {
    const cells = [...row.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]
      .replace(/<br\s*\/?>|<\/(p|div|li|span)>\s*<(p|div|li|span)\b[^>]*>/gi, ' / ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\/\s*|\s*\/$/g, ''));
    return '\n' + cells.join(' | ') + '\n';
  });
  // Definition lists / label-value pairs stay on one line too.
  h = h.replace(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi, (_, a, b) => `\n${a.replace(/<[^>]+>/g, ' ')} | ${b.replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, ' ')}\n`);
  h = h.replace(/<\/(td|th)>/gi, ' \t ').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|tr|h[1-6]|table|ul|ol|section|article|dt|dd|dl|tbody|thead|figure|caption|summary|details|button)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(h).split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean);
}
export function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const clean = (s) => s ? decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : null;
  return { title: clean(m?.[1]), h1: clean(h1?.[1]) };
}
export function extractLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(decodeEntities(m[1]), base);
      if (!/^https?:$/.test(u.protocol)) continue;
      u.hash = '';
      out.push({ url: u.href, text: decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() });
    } catch { /* bad url */ }
  }
  return out;
}
export function jsonLdNodes(html) {
  const nodes = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { nodes.push(x); Object.values(x).forEach(walk); } };
    walk(j);
  }
  return nodes;
}
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }
