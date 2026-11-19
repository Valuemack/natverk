// Shared helpers for the chain store-list scripts in scripts/chains/.
// Uses the polite HTTP helper (1 req/s, generic UA) and the hours helpers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, robots } from './http.mjs';
import { emptyHours, normRange, svDay, DAYS, hasHours } from './hours.mjs';

export { emptyHours, normRange, svDay, DAYS, hasHours };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW_DIR = path.join(ROOT, 'data', 'raw');

// ---------------------------------------------------------------- fetching

export class Blocked extends Error {}

const robotsCache = new Map();
/** Fetch a URL only if robots.txt (User-agent: *) allows it. Throws Blocked on robots disallow or bot challenge. */
export async function fetchAllowed(url, opts = {}) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) robotsCache.set(u.origin, await robots(u.origin));
  const allowed = robotsCache.get(u.origin);
  if (!allowed(u.pathname + u.search)) throw new Blocked(`robots.txt disallows ${u.pathname}${u.search}`);
  let body;
  try {
    body = await get(url, { ...opts, type: 'text' });
  } catch (e) {
    if (e.status === 401 || e.status === 403 || e.status === 429) throw new Blocked(`HTTP ${e.status} for ${url}`);
    throw e;
  }
  if (isChallenge(body)) throw new Blocked(`bot challenge page at ${url}`);
  if (opts.type === 'json') return parseJsonLoose(body);
  return body;
}

export function isChallenge(text) {
  const head = String(text).slice(0, 20000);
  return /<title>\s*(Just a moment|Attention Required!|Access denied)/i.test(head) || /cf_chl_opt|cf-browser-verification|challenge-platform\/h\//.test(head);
}

/** JSON.parse tolerating junk before the first [ or { (e.g. PHP warnings printed by a WP plugin). */
export function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const i = text.search(/[\[{]\s*["{\[]/);
  if (i < 0) throw new Error('no JSON found');
  return JSON.parse(text.slice(i));
}

// ---------------------------------------------------------------- html/text

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  auml: 'ä', ouml: 'ö', aring: 'å', Auml: 'Ä', Ouml: 'Ö', Aring: 'Å', eacute: 'é', Eacute: 'É', uuml: 'ü', Uuml: 'Ü',
  aelig: 'æ', oslash: 'ø', AElig: 'Æ', Oslash: 'Ø', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', shy: '',
};
export function decode(s) {
  if (s == null) return s;
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => (n in NAMED ? NAMED[n] : m));
}

export function stripTags(html) {
  return clean(decode(String(html).replace(/<[^>]+>/g, ' ')));
}

export function clean(s) {
  if (s == null) return null;
  const t = String(s).replace(/[ ​  ]/g, ' ').replace(/\s+/g, ' ').trim();
  return t || null;
}

/** Convert an HTML fragment to an array of trimmed, non-empty text lines (br/p/div/li/headings become line breaks). */
export function htmlToLines(html) {
  const t = String(html)
    .replace(/<(script|style|svg|noscript|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|table|dt|dd|dl|section|article|header|footer|details|summary)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decode(t).split('\n').map(clean).filter(Boolean);
}

/** Split HTML into sections at <h2>-<h4> headings: [{ heading, html }]. Empty headings (image-only) are dropped. */
export function headingSections(html, levels = '2-4') {
  const re = new RegExp(`<h[${levels}][^>]*>([\\s\\S]*?)<\\/h[${levels}]>`, 'gi');
  const out = [];
  let m, prev = null;
  while ((m = re.exec(html))) {
    if (prev) prev.html = html.slice(prev.end, m.index);
    const heading = stripTags(m[1]);
    prev = { heading, end: re.lastIndex, html: '' };
    out.push(prev);
  }
  if (prev) prev.html = html.slice(prev.end);
  return out.filter(s => s.heading).map(({ heading, html }) => ({ heading, html }));
}

/** All JSON-LD objects in a page, with @graph flattened. Invalid blocks are skipped. */
export function jsonLd(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { try { d = JSON.parse(m[1].replace(/,\s*([}\]])/g, '$1')); } catch { continue; } }
    const stack = Array.isArray(d) ? [...d] : [d];
    while (stack.length) {
      const x = stack.shift();
      if (!x || typeof x !== 'object') continue;
      out.push(x);
      if (Array.isArray(x['@graph'])) stack.push(...x['@graph']);
    }
  }
  return out;
}

// ---------------------------------------------------------------- hours

const EN_DAY = { monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun' };

/** schema.org openingHoursSpecification -> hours object (days not listed = "stängt"), or null. */
export function ldHours(specs) {
  if (!specs) return null;
  const list = (Array.isArray(specs) ? specs : [specs]).filter(s => s && !s.validFrom && !s.validThrough);
  const h = emptyHours();
  const mentioned = new Set();
  let any = false;
  for (const s of list) {
    const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek]).map(d => EN_DAY[String(d || '').split('/').pop().toLowerCase()]).filter(Boolean);
    days.forEach(d => mentioned.add(d));
    const ro = String(s.opens || '').trim(), rc = String(s.closes || '').trim();
    const o = ro.slice(0, 5), c = rc.slice(0, 5);
    let val;
    if (/st[äa]ngt|closed/i.test(ro + rc)) val = 'stängt';
    else if (/^\d{1,2}:\d{2}$/.test(o) && /^\d{1,2}:\d{2}$/.test(c)) val = (o === '00:00' && c === '00:00') ? 'stängt' : normRange(`${o}-${c}`);
    else val = normRange(rc ? `${ro}-${rc}` : ro); // sloppy data like opens: "10:00–18:00", closes: ""
    if (!val) continue;
    for (const d of days) { h[d] = h[d] && h[d] !== 'stängt' && val !== 'stängt' ? h[d] + ',' + val : val; any = true; }
  }
  if (!any) return null;
  // Days absent from the spec are closed; days present but unparsable stay null (unknown).
  for (const d of DAYS) if (h[d] == null && !mentioned.has(d)) h[d] = 'stängt';
  return h;
}

const W = '(?<![a-zåäöé])';
const E = '(?![a-zåäöé])';
const DAY_WORD = `(?:måndag(?:ar|en)?|mån|må|tisdag(?:ar|en)?|tis|ti|onsdag(?:ar|en)?|ons|on|torsdag(?:ar|en)?|tors|tor|to|fredag(?:ar|en)?|fre|fr|lördag(?:ar|en)?|lör|lö|söndag(?:ar|en)?|sön|sö)`;
const GROUP_WORD = `(?:vardagar|vardag|veckodagar|helger|helgen|helg|alla dagar|alla veckans dagar|dagligen)`;
const DAY_SPEC = `(?:${W}${GROUP_WORD}${E}|${W}${DAY_WORD}\\.?${E}(?:\\s*-\\s*${W}${DAY_WORD}\\.?${E})?)`;
const TIME = `\\d{1,2}(?:[.:]\\d{2})?\\s*-\\s*\\d{1,2}(?:[.:]\\d{2})?(?![\\d/])`;
const HOURS_RE = new RegExp(
  `(${DAY_SPEC}(?:\\s*(?:,|och|&|\\+)\\s*${DAY_SPEC})*)\\s*[:.]?\\s*(?:kl\\.?\\s*)?(${TIME}(?:\\s*(?:,|och|&|\\+)\\s*${TIME})*|\\(?\\s*stängt\\s*\\)?)`,
  'giu');

function expandDaySpec(spec) {
  const s = spec.toLowerCase().replace(/\./g, '').trim();
  if (/^(vardagar|vardag|veckodagar)$/.test(s)) return ['mon', 'tue', 'wed', 'thu', 'fri'];
  if (/^(helger|helgen|helg)$/.test(s)) return ['sat', 'sun'];
  if (/^(alla dagar|alla veckans dagar|dagligen)$/.test(s)) return [...DAYS];
  const [a, b] = s.split(/\s*-\s*/);
  const da = svDay(a), db = b ? svDay(b) : da;
  if (!da || !db) return [];
  const out = [];
  for (let i = DAYS.indexOf(da); ; i = (i + 1) % 7) { out.push(DAYS[i]); if (DAYS[i] === db || out.length > 7) break; }
  return out;
}

/**
 * Parse free-text Swedish opening hours ("Mån-fre 10-18, Lör 10-16, Sön stängt", "Tisdag-fredag kl 10-18",
 * "Vardagar 10.00 – 19.00", "helg 10-16", "Alla dagar 10-20") into an hours object.
 * Days that are not mentioned become "stängt" when at least one day was parsed (fillClosed), else null.
 */
export function parseHoursText(text, { fillClosed = true } = {}) {
  if (!text) return null;
  const t = decode(String(text)).toLowerCase()
    .replace(/[–—−‒]/g, '-')
    .replace(/(?<=[a-zåäö.])\s+till\s+(?=[a-zåäö])/g, ' - ')
    .replace(/\s+/g, ' ');
  const h = emptyHours();
  let any = false;
  for (const m of t.matchAll(HOURS_RE)) {
    const val = /stängt/.test(m[2]) ? 'stängt' : normRange(m[2]);
    if (!val) continue;
    const specs = m[1].split(/\s*(?:,|och|&|\+)\s*/);
    for (const sp of specs) for (const d of expandDaySpec(sp)) { h[d] = val; any = true; }
  }
  if (!any) return null;
  if (fillClosed) for (const d of DAYS) if (h[d] == null) h[d] = 'stängt';
  return h;
}

// ---------------------------------------------------------------- address / coords / misc

/** Normalize "44130" / "441 30" -> "441 30". */
export function normPostnr(p) {
  const m = String(p || '').replace(/\s/g, '').match(/^(\d{3})(\d{2})$/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * Split "Masugnsvägen 44, 168 67 Bromma" | "Järntorgsgatan 10, Göteborg" | "Lärjeågatan 12 415 02 Göteborg"
 * into { gatuadress, postnummer, ort }.
 */
export function splitAddress(s) {
  const t = clean(decode(s || ''))?.replace(/,?\s*(Sverige|Sweden)$/i, '');
  if (!t) return { gatuadress: null, postnummer: null, ort: null };
  const m = t.match(/^(.*?)[,\s]*\b(\d{3})\s?(\d{2})\b[,\s]*([A-Za-zÅÄÖåäöÉéÜü][^\d,]*)?$/);
  if (m) return { gatuadress: clean(m[1].replace(/[,\s]+$/, '')), postnummer: `${m[2]} ${m[3]}`, ort: clean(m[4]) };
  const parts = t.split(',').map(clean).filter(Boolean);
  if (parts.length >= 2 && !/\d/.test(parts[parts.length - 1])) return { gatuadress: parts.slice(0, -1).join(', '), postnummer: null, ort: parts[parts.length - 1] };
  return { gatuadress: t, postnummer: null, ort: null };
}

export function inSweden(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat > 55 && lat < 69.2 && lon > 10.5 && lon < 24.3;
}

// Rough latitude band per 2-digit postnummer prefix [from, to, latMin, latMax] - a coarse sanity check that catches
// copy-pasted map embeds pointing at another town (e.g. a store in 633 xx Eskilstuna with a pin near Hjo).
const POST_LAT = [
  [10, 19, 58.7, 60.3], [20, 29, 55.3, 56.6], [30, 31, 56.3, 57.8], [33, 36, 56.0, 57.9], [37, 37, 55.9, 56.6],
  [38, 39, 56.2, 57.9], [40, 44, 57.4, 58.5], [45, 46, 57.9, 59.3], [50, 51, 57.3, 58.0], [52, 54, 57.9, 58.9],
  [55, 57, 57.0, 58.2], [58, 61, 57.5, 59.1], [62, 62, 56.9, 58.0], [63, 63, 59.2, 59.6], [64, 64, 58.8, 59.4], [65, 71, 58.7, 60.6],
  [72, 73, 59.2, 60.2], [74, 76, 59.5, 60.7], [77, 79, 59.8, 62.3], [80, 82, 60.3, 62.4], [83, 84, 62.0, 64.5],
  [85, 86, 61.9, 63.2], [87, 89, 62.4, 64.0], [90, 91, 63.4, 65.5], [92, 93, 64.0, 66.8], [94, 98, 65.0, 69.2],
];
/** false if lat is clearly outside the region of the postnummer (±0.4° margin); true if plausible or unknown. */
export function plausibleLat(postnummer, lat) {
  const p = parseInt(String(postnummer || '').replace(/\s/g, '').slice(0, 2), 10);
  if (!Number.isFinite(p) || !Number.isFinite(lat)) return true;
  const band = POST_LAT.find(([a, b]) => p >= a && p <= b);
  return !band || (lat >= band[2] - 0.4 && lat <= band[3] + 0.4);
}

export function coord(lat, lon) {
  const a = parseFloat(lat), b = parseFloat(lon);
  return inSweden(a, b) ? { lat: +a.toFixed(6), lon: +b.toFixed(6) } : null;
}

/** Extract coordinates from a Google/Apple Maps URL (place !3d!4d, embed !2d!3d, dir !1d!2d, @lat,lon, query/ll/q=lat,lon). */
export function mapsCoords(url) {
  if (!url) return null;
  const u = decode(String(url));
  let m;
  if ((m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/))) return coord(m[1], m[2]);
  if ((m = u.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/))) return coord(m[2], m[1]);
  if ((m = u.match(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)(?!!3d)/)) && /\/dir\//.test(u)) return coord(m[2], m[1]);
  if ((m = u.match(/[?&](?:query|ll|q|center|daddr|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/))) return coord(m[1], m[2]);
  if ((m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/))) return coord(m[1], m[2]);
  return null;
}

const SORTIMENT = [
  ['kläder', /kläder|klädes|plagg|garderob/],
  ['skor', /(?<![a-zåäö])skor(?![a-zåäö])/],
  ['accessoarer', /accessoar|väskor|smycken/],
  ['barnartiklar', /barnkläder|barnavdelning|barnartiklar|barnsaker/],
  ['möbler', /möbler|möbel|småmöbler/],
  ['böcker', /böcker|bokavdelning|bokhörna|(?<![a-zåäö])bok(?![a-zåäö])/],
  ['leksaker', /leksak/],
  ['husgeråd', /husgeråd|porslin|köksredskap|glas och porslin|kökssaker|köksartiklar/],
  ['inredning', /inredning|kuriosa|prydnad|heminredning|belysning|lampor/],
  ['textil', /textil/],
  ['elektronik', /elektronik|elprodukter|elartiklar/],
  ['konst', /(?<![a-zåäö])konst(?![a-zåäö])|tavlor/],
  ['media', /vinyl|dvd|(?<![a-zåäö])skivor|(?<![a-zåäö])media(?![a-zåäö])/],
  ['vintage', /vintage|retro/],
  ['cyklar', /cyklar|(?<![a-zåäö])cykel/],
  ['sport', /sportartiklar|sportutrustning/],
];
/** Keyword-based sortiment list from store-specific text. */
export function sortimentFrom(text) {
  const t = String(text || '').toLowerCase();
  return SORTIMENT.filter(([, re]) => re.test(t)).map(([k]) => k);
}

export function phoneFrom(text) {
  const m = String(text || '').match(/(\+46[\d\s-]{7,14}\d|0\d{1,3}[\s-]?\d[\d\s-]{4,10}\d)/);
  return m ? clean(m[1]) : null;
}

export function emailFrom(html) {
  const m = String(html || '').match(/mailto:\s*([^"'?\s>]+@[^"'?\s>]+)/i) || String(html || '').match(/([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1].trim().toLowerCase() : null;
}

export function short(s, n = 300) {
  const t = clean(s);
  return t && t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// ---------------------------------------------------------------- output

const titleIfCaps = (s) => (s && s === s.toUpperCase() && /[A-ZÅÄÖ]{3}/.test(s) ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, m => m.toUpperCase()) : s);

/** Build a store record with all fields in canonical order. */
export function store(o) {
  const h = o.oppettider && hasHours(o.oppettider) ? o.oppettider : emptyHours();
  const postnummer = o.postnummer ? normPostnr(o.postnummer) : null;
  let rejected = null;
  if (o.lat != null && !plausibleLat(postnummer, o.lat)) { rejected = { lat: o.lat, lon: o.lon }; o.lat = o.lon = null; }
  return {
    source_id: o.source_id ?? null,
    namn: clean(o.namn),
    kedja: o.kedja ?? null,
    ...(o.organisation !== undefined ? { organisation: o.organisation } : {}),
    typ: o.typ ?? 'second hand',
    gatuadress: clean(o.gatuadress),
    postnummer,
    ort: titleIfCaps(clean(o.ort)),
    lat: o.lat ?? null,
    lon: o.lon ?? null,
    telefon: clean(o.telefon),
    epost: clean(o.epost)?.toLowerCase() ?? null,
    webb: o.webb ?? null,
    oppettider: h,
    oppettider_text: short(o.oppettider_text),
    sortiment: o.sortiment?.length ? [...new Set(o.sortiment)] : [],
    ...(o.extra || {}),
    ...(rejected ? { coords_rejected: rejected } : {}),
  };
}

/**
 * Write data/raw/chain-<slug>.json and print a one-line summary.
 * If there are zero stores, the previous file is kept and the process exits with code 1.
 */
export function writeOut(meta, stores, { errors = [] } = {}) {
  const withHours = stores.filter(s => hasHours(s.oppettider)).length;
  const withCoords = stores.filter(s => s.lat != null && s.lon != null).length;
  const pct = (n) => stores.length ? Math.round(100 * n / stores.length) : 0;
  const summary = `[${meta.source}] ${stores.length} stores, ${withHours} with hours (${pct(withHours)}%), ${withCoords} with coords (${pct(withCoords)}%)` + (errors.length ? `, ${errors.length} errors` : '');
  if (!stores.length) {
    console.error(summary + ' - total failure, previous file kept');
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const out = { source: meta.source, kedja: meta.kedja, url: meta.url, fetched: new Date().toISOString(), terms_note: meta.terms_note ?? null, ...(meta.extra || {}), ...(errors.length ? { errors } : {}), stores };
  const file = path.join(RAW_DIR, `chain-${meta.source}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(summary);
}

/** Run main(), turning an uncaught error into exit code 1. */
export function run(main) {
  main().catch((e) => { console.error(`FATAL: ${e.stack || e.message}`); process.exitCode = 1; });
}
