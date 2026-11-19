// Offline: data/raw/pages/*.json -> data/raw/facilities.json
// Groups crawled pages into facilities (one swimming hall = one URL prefix / host) and extracts facts.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { safeDecode, RAW_DIR, PAGES_DIR, OSM_FILE, readJson, writeJson, htmlToLines, slugify, nowIso, DAYS } from './lib.mjs';
import { strip, GENERIC_TOK, coreTokens, parseHoursBlocks, fullWeek, parsePrices, parsePools, parseFacilities, parseAddress, parsePhones, parseDeviations, CLOSED_RE, NAME_JUNK } from './parse.mjs';

const osm = readJson(OSM_FILE);
const osmSlugsByKommun = {};
for (const r of osm) (osmSlugsByKommun[r.extra?.kommunkod] ||= []).push(slugify(r.namn));

const SUB_TOK = /^(priser|pris|oppettider|allmant|om|tillganglighet|tillgangligt|i|pa|for|vid|kontakt|hitta|hit|fakta|aktuellt|info|bassangschema|schema|regler|infor|besoket|kop|entre|avgifter|simskola|relax|gym|bastu|kalas|cafe|kafe)$/;
const HALLISH = /(bad|sim|hall|hus|pool|arena|aqua|akva|hov|tropi|center|centrum|bassang)/;
const EXCL_PATH = /(\/aktuellt\/|\/nyheter|\/nyhetsarkiv|\/blogg?\/|\/dialog\/|medborgar|stadsutveckling|\/planer|detaljplan|\/projekt\/|\/projekt-|bygga-|byggprojekt|tillstand|halsoskydd|miljo-och-halsa|naringsliv|suomen|meankieli|english|lattlast|other-languages|sommarguide|badplats|press|politik|protokoll|upphandling|investering|forstudie|ombyggnad|nybyggnation|nytt-badhus|ny-simhall|nya-|medborgarforslag|e-tjanst|jobb|lediga)/;
const EXCL_HOST = /(folkhalsomyndigheten|naturkartan|upplandsstiftelsen|vaxer\.stockholm|wikipedia|visit|tripadvisor|facebook|instagram|goactivebooking|bokamera|gotevent\.se\/(?!arenor))/;

function isSpecificSeg(seg, names) {
  const s = strip(safeDecode(seg)).replace(/\.(html?|printable)$/, '').replace(/\.\d.*$/, '');
  if (names.some((n) => n.length > 4 && s.includes(n))) return true;
  if (!HALLISH.test(s)) return false;
  const toks = s.split(/[-_]+/).filter(Boolean);
  return toks.some((t) => !GENERIC_TOK.has(t) && t.length >= 3 && !/^\d+$/.test(t)) && !GENERIC_TOK.has(s);
}
function identity(seg) {
  const s = strip(safeDecode(seg)).replace(/\.(html?|printable)$/, '').replace(/\.\d.*$/, '');
  return s.split(/[-_]+/).filter((t) => t && !SUB_TOK.test(t)).join('-');
}
function groupKey(url, names) {
  const u = new URL(url); const host = u.host.replace(/^www\./, '');
  const segs = u.pathname.split('/').filter(Boolean);
  if (host === 'medley.se') return segs[0] ? `${host}/${segs[0]}` : null;
  if (host === 'actic.se') return segs.length >= 3 ? `${host}/${segs.slice(0, 3).join('/')}` : null;
  const sub = host.split('.')[0];
  if (host.split('.').length >= 3 && isSpecificSeg(sub, names) && !/^(www|start)$/.test(sub)) return host; // vaggabadet.karlshamn.se
  if (host.split('.').length === 2 && isSpecificSeg(sub, names) && !/kommun|stad/.test(sub)) return host; // fyrishov.se
  for (let i = 0; i < segs.length; i++) if (isSpecificSeg(segs[i], names)) return `${host}/${[...segs.slice(0, i).map((x) => x.toLowerCase()), identity(segs[i])].join('/')}`;
  return null;
}
const TITLE_JUNK = /^(startsida|start|hem|home|oppettider|öppettider|priser|pris|kontakt|hitta hit|om oss|bad|bada|simning|gym|relax|valkommen|välkommen|simhall|simhallen|badhus|badhuset|simhallar|bad och simhallar|simhallar och bad)$/i;
function cleanName(seg) {
  return seg.replace(/\s+/g, ' ').trim()
    .replace(/^(hitta till|aktuellt (på|i|från)|information (från|om)|nyheter (från|på)|välkommen till|valkommen till|om|allmänt om|öppettider( på| för| i)?|priser( på| för| i)?|hitta hit till|kontakta|kontakt|tillgänglighet (i|på))\s+/i, '')
    .replace(/^.*\b(på|hos)\s+(?=actic\b)/i, '').replace(/^actic\s+/i, '').replace(/\s+[-–|].*$/, '')
    .replace(/\s+(i|vid)\s+[A-ZÅÄÖ][\wåäö]+(\s[A-ZÅÄÖ][\wåäö]+)?$/u, '').replace(/\s*\((stängd|stängt)[^)]*\)/i, '').replace(/\s+fakta$/i, '').trim();
}
function pickName(pages) {
  const cnt = new Map();
  for (const p of pages) for (const t of [p.h1, ...(p.title || '').split(/\s+[-–|]\s+|\s+\|\s+/)]) {
    if (!t) continue; const c = cleanName(t);
    if (!c || c.length > 45 || c.length < 4 || TITLE_JUNK.test(c) || NAME_JUNK.test(c) || /(kommun|stad|region|medley)$/i.test(c)) continue;
    if (!HALLISH.test(strip(c))) continue;
    cnt.set(c, (cnt.get(c) || 0) + (p.h1 === t ? 2 : 1) + (/\/(oppettider|priser)/.test(p.url) ? 0 : 0.5));
  }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
// union of overlapping intervals; drops weeks that look like course schedules
function cleanWeek(week) {
  if (!week) return null;
  const out = {}; let open = 0, closed = 0, short = 0, veryShort = 0;
  for (const d of DAYS) {
    const v = week[d];
    if (!v || v === 'stängt') { out[d] = v || 'stängt'; closed++; continue; }
    const iv = v.split(',').map((s) => s.split('-').map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; })).map(([a, b]) => [a, b === 0 ? 1440 : b]).sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const [a, b] of iv) { const l = merged[merged.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else merged.push([a, b]); }
    const tot = merged.reduce((s, [a, b]) => s + b - a, 0);
    if (tot < 60) short++;
    if (tot < 90) veryShort++;
    if (merged.length > 3) short++;
    const f = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    out[d] = merged.map(([a, b]) => `${f(a)}-${b === 1440 ? '24:00' : f(b)}`).join(','); open++;
  }
  if (open < 3 || short > 1 || veryShort >= 3) return null;
  return out;
}

const today = new Date();
const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.json'));
const stats = { filer: files.length, sidor: 0, grupper: 0, generiska_sidor: 0, exkluderade_sidor: 0 };
const groups = new Map(); // key -> {pages, kommuner:Set}
const phoneGroups = new Map(); // `${file}|${phone}` -> count of groups
for (const f of files) {
  const d = readJson(path.join(PAGES_DIR, f));
  const names = osmSlugsByKommun[d.kommunkod] || [];
  const local = new Map();
  for (const p of d.pages) {
    if (!p.html_gz) continue;
    stats.sidor++;
    if (EXCL_PATH.test(strip(safeDecode(p.url))) || EXCL_HOST.test(p.url)) { stats.exkluderade_sidor++; continue; }
    const html = zlib.gunzipSync(Buffer.from(p.html_gz, 'base64')).toString();
    p.lines = htmlToLines(html);
    p.coords = extractCoords(html);
    p.file = d.kommunkod;
    const key = groupKey(p.url, names);
    if (!key) { stats.generiska_sidor++; continue; }
    if (!local.has(key)) local.set(key, []);
    local.get(key).push(p);
  }
  for (const [key, pages] of local) {
    for (const ph of new Set(pages.flatMap((p) => parsePhones(p.lines, p.links)))) phoneGroups.set(`${d.kommunkod}|${ph}`, (phoneGroups.get(`${d.kommunkod}|${ph}`) || 0) + 1);
    if (!groups.has(key)) groups.set(key, { pages: [], files: new Set() });
    const g = groups.get(key); g.pages.push(...pages); g.files.add(d.kommunkod);
  }
}
function extractCoords(html) {
  const pats = [/[?&](?:q|ll|query|center|destination|daddr|sll)=(-?\d{2}\.\d{3,})(?:,|%2C)\s*(-?\d{1,2}\.\d{3,})/i, /@(\d{2}\.\d{4,}),(\d{1,2}\.\d{4,})/, /mlat=(\d{2}\.\d{3,})&(?:amp;)?mlon=(\d{1,2}\.\d{3,})/, /"latitude"\s*:\s*"?(\d{2}\.\d{3,})"?\s*,\s*"longitude"\s*:\s*"?(\d{1,2}\.\d{3,})/, /!3d(\d{2}\.\d{4,})!4d(\d{1,2}\.\d{4,})/];
  for (const re of pats) { const m = html.match(re); if (m) { const lat = Number(m[1]), lon = Number(m[2]); if (lat > 55 && lat < 69.2 && lon > 10.5 && lon < 24.2) return { lat, lon }; } }
  return null;
}

const facilities = [];
for (const [key, g] of groups) {
  const seenU = new Set(); const pages = g.pages.filter((p) => !seenU.has(p.url) && seenU.add(p.url));
  const headText = strip(pages.map((p) => `${p.title} ${p.h1}`).join(' '));
  if (!/(simhall|badhus|aventyrsbad|simbad|bad|bassang|sim|pool|aqua|hov)/.test(headText)) continue;
  stats.grupper++;
  const root = [...pages].sort((a, b) => a.url.length - b.url.length)[0];
  const by = (re) => [...pages].sort((a, b) => (re.test(strip(b.url)) ? 1 : 0) - (re.test(strip(a.url)) ? 1 : 0));

  // hours
  const blocks = [];
  for (const p of by(/oppettid|tider/)) for (const b of parseHoursBlocks(p.lines, today)) blocks.push({ ...b, url: p.url, clean: cleanWeek(fullWeek(b.week) || null) });
  const regular = blocks.filter((b) => !b.exceptional);
  const pick = (parts, min = 5) => regular.find((b) => parts.includes(b.part) && b.ndays >= min && (min < 5 || b.clean));
  const mins = (w) => Object.values(w || {}).reduce((s, v) => s + (v && v !== 'stängt' ? v.split(',').reduce((t, iv) => { const [a, b] = iv.split('-').map((x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; }); return t + Math.max(0, (b || 1440) - a); }, 0) : 0), 0);
  const okand = regular.find((b) => b.part === 'okand' && b.ndays >= 5 && b.clean && /(oppet|tider)/.test(strip(b.context + ' ' + b.label)) && !/(konferens|lokal|kontor|telefon|sporthall|idrottshall|camping|bowling)/.test(strip(b.context + ' ' + b.label)));
  const cands = [pick(['motionsbad']), pick(['reception']), okand, pick(['aventyrsbad'])].filter(Boolean);
  const maxMin = Math.max(0, ...cands.map((b) => mins(b.clean)));
  // the swim (motionsbad) block wins unless it is only a small slice of the opening hours (e.g. "motionssim 6.30-8.15")
  let main = cands.find((b) => mins(b.clean) >= 0.5 * maxMin) || cands[0] || null;
  const perDel = {};
  for (const part of ['aventyrsbad', 'varmbassang', 'relax', 'gym', 'utomhus', 'hopp', 'undervisning']) {
    const b = pick([part], 3); if (!b) continue;
    const w = b.ndays >= 5 ? cleanWeek(fullWeek(b.week)) : b.week; if (!w) continue;
    perDel[part === 'utomhus' ? 'utomhusbad' : part] = w;
  }
  if (!main) { const av = pick(['aventyrsbad']); if (av) main = av; }

  // prices
  let priser = null;
  for (const p of by(/pris|avgift|entre|taxa/)) {
    const pr = parsePrices(p.lines);
    if (!pr) continue;
    if (!priser) priser = { ...pr, _raw: { ...pr._raw }, _url: p.url };
    else for (const [k, v] of Object.entries(pr)) if (!k.startsWith('_') && priser[k] === undefined) { priser[k] = v; priser._raw[k] = pr._raw[k]; }
  }
  if (priser && !priser.vuxen && !priser.pensionar && !priser.familj) priser = null; // child price alone is too weak
  if (priser && !priser.vuxen && ((priser.barn || 0) > 150 || (priser.pensionar || 0) > 200)) priser = null; // card prices, not single entry
  if (priser?.vuxen) for (const k of ['barn', 'pensionar', 'student']) if (priser[k] > priser.vuxen) delete priser[k];
  if (priser?.familj && priser.vuxen && priser.familj < priser.vuxen) delete priser.familj;

  // pools
  const poolMap = new Map();
  for (const p of by(/bassang|om-?badet|anlaggning|fakta/)) for (const pl of parsePools(p.lines) || []) {
    const cur = poolMap.get(pl.namn); if (!cur) poolMap.set(pl.namn, { ...pl }); else for (const k of ['langd_m', 'banor', 'temp_c']) if (cur[k] == null) cur[k] = pl[k];
  }
  const bassanger = [...poolMap.values()].slice(0, 12);

  const allText = pages.map((p) => p.lines.join(' ')).join(' ');
  const fac = parseFacilities(allText);
  let adress = null;
  for (const p of by(/hitta|kontakt|besok|adress|om-/)) { adress = parseAddress(p.lines, p.jsonld || []); if (adress) break; }
  const phones = pages.flatMap((p) => parsePhones(p.lines, p.links).filter((ph) => (phoneGroups.get(`${p.file}|${ph}`) || 0) <= 1));
  const phone = phones.sort((a, b) => phones.filter((x) => x === b).length - phones.filter((x) => x === a).length)[0] || null;
  let avvikande = null;
  for (const p of by(/oppettid|avvik|helg|jul|tider/)) { avvikande = parseDeviations(p.lines, today); if (avvikande) break; }
  const stangd = [root, ...pages.slice(0, 3)].some((p) => CLOSED_RE.test(strip(`${p.title} ${p.h1} ${p.lines.slice(0, 40).join(' ')}`)));
  const typHint = /utomhusbassang|utomhusbad|friluftsbad|sommarbad/.test(strip(root.url + ' ' + root.title)) ? 'utomhusbad'
    : /aventyrsbad|upplevelsebad|aventyr/.test(headText) ? 'äventyrsbad' : /badhus/.test(headText) ? 'badhus' : null;
  const coords = pages.map((p) => p.coords).find(Boolean) || null;

  facilities.push({
    key, filer: [...g.files], namn: pickName(pages), url: root.url, urls: pages.map((p) => p.url).slice(0, 40),
    oppettider: main ? cleanWeek(fullWeek(main.week)) : null, oppettider_etikett: main ? `${main.label}`.slice(0, 80) : null, oppettider_url: main?.url || null,
    oppettider_per_del: Object.keys(perDel).length ? perDel : null,
    priser, bassanger: bassanger.length ? bassanger : null, faciliteter: fac, adress, telefon: phone, koordinater: coords,
    avvikande_tider: avvikande, tillfalligt_stangd: stangd || null, typ_hint: typHint,
    tokens: [...new Set([...coreTokens(pickName(pages) || ''), ...coreTokens(key.split('/').slice(-1)[0].replace(/-/g, ' '))])],
    host: new URL(root.url).host,
  });
}
writeJson(path.join(RAW_DIR, 'facilities.json'), { skapad: nowIso(), stats, facilities });
const c = (fn) => facilities.filter(fn).length;
console.log(`${facilities.length} anläggningar ur ${stats.sidor} sidor (${files.length} filer). Öppettider ${c((x) => x.oppettider)}, priser ${c((x) => x.priser)}, bassänger ${c((x) => x.bassanger)}, adress ${c((x) => x.adress)}, telefon ${c((x) => x.telefon)}, koordinater ${c((x) => x.koordinater)}`);
