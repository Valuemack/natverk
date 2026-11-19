// Focused, polite crawl of kommun and operator websites for swimming-hall pages.
// Per kommun: sitemap.xml (from robots.txt) -> score URLs; fallback = follow navigation links from the homepage.
// Relevant pages are stored as text lines + JSON-LD + links (no images, no full HTML) in data/raw/pages/<kod>.json.
// robots.txt is honoured (incl. AI-crawler blocks), >= 1.1 s between requests per host, bot walls are skipped.
// Usage: node scripts/02-crawl.mjs [--only=0180,1480] [--max=70] [--conc=30] [--fresh]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { safeDecode,
  RAW_DIR, PAGES_DIR, OSM_FILE, SCRIPTS_DIR, readJson, writeJson, politeFetch, robotsFor, pool, blocked, ensureDir,
  htmlToLines, extractTitle, extractLinks, jsonLdNodes, slugify, nowIso,
} from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const MAX = Number(args.max || 70);
const CONC = Number(args.conc || 30);
const only = args.only ? new Set(String(args.only).split(',')) : null;
const MAX_AGE_H = Number(args.maxage || 20); // reuse pages files younger than this unless --fresh
ensureDir(PAGES_DIR);

const sites = readJson(path.join(RAW_DIR, 'kommun-sites.json')).kommuner;
const osm = readJson(OSM_FILE);
const osmByKommun = {};
for (const r of osm) (osmByKommun[r.extra?.kommunkod] ||= []).push(r);
const manual = readJson(path.join(SCRIPTS_DIR, 'seeds.json'), {});

const strip = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const HALL_RE = /(simhall|badhus|aventyrsbad|simbad|badanlaggning|bad-?och-?(sim|friskvard|sport|motion)|simning|bassang|motionsbad|motionssim|[a-z]badet\b|badet\b|\bbad\b|\/bad\/|-bad\b|varmbad|tropi|aqua|akva|aq-va|fyrishov|simstadion|simarena|sim-och|lekbad|familjebad|upplevelsebad)/;
const isExcl = (u) => EXCL_RE.test(u.replace(/(simhall|badhus|simhallar)[a-z-]*badplats[a-z]*|badplats[a-z-]*(simhall|badhus)[a-z]*/g, 'simhall'));
const EXCL_RE = /(\/aktuellt\/|\/nyheter|\/blogg?\/|\/dialog\/|medborgar|stadsutveckling|\/planer|detaljplaner|\/projekt\/|tillstand|halsoskydd|naringsliv|suomen|meankieli|english|lattlast|sommarguide|badplats|badstr|strand|utomhusbad|friluftsbad|kallbad|vattenprov|badvatten|badvattenkval|nyhet|news|press|arkiv|protokoll|diarie|bygglov|detaljplan|\.pdf|\.docx?|\.xlsx?|\.jpe?g|\.png|jobb|lediga|upphandl|bastuflotte|vinterbad|isbad|\/kalender|evenemang\/|\/event|bad-?vatten|skolbad|badtunna|enkat|politik|nämnd|namnd|fullmakt|blankett|e-tjanst|\/sok\b|search|\?|tradgard|lekplats|hundbad|batbad|camping|vandrarhem|hotell)/;
const NAV_RE = /(idrott|fritid|motion|\bbad|sim|uppleva|gora|kultur|friskvard|traning|sport|aktivitet|halsa|anlaggning|lokaler|turism|besok)/;
const SUB_RE = /(oppettid|priser|pris\b|avgift|entre|bassang|om-?badet|hitta-?hit|kontakt|faciliteter|aventyr|motionssim|babysim|bastu|relax|varmbad|tider|stangning|helgdag|jul)/;
const LOW_RE = /(boka|forening|skolor|villkor|rabatt|friskvardsbidrag|hyra|kalas|kurs|gruppträning|grupptraning|gymtraning|gyminstruktion|instruktor|personlig|jubileum|kollektion|shop|butik|presentkort|tavling|klubb)/;
const BAD_HREF = /(\.url$|getHomePageUrl|[{}]|\/sidkarta$|\.(pdf|jpe?g|png|gif|svg|docx?|xlsx?|zip|mp4|ics)$|^mailto:|^tel:)/i;
// Operators with their own crawl task (all their pool facilities are taken from their sitemap)
const OPERATORS = [
  { kommunkod: 'op-medley', namn: 'Medley', operator: true, site: 'https://www.medley.se/', select: /^https:\/\/www\.medley\.se\/(?!aktuellt|om-medley|jobb|press|kontakt|vara-anlaggningar)[a-z0-9-]+\/(oppettider\/|priser\/|hitta-hit\/|bad\/|varmbassang\/)?$/ },
  { kommunkod: 'op-actic', namn: 'Actic', operator: true, site: 'https://www.actic.se/', select: /^https:\/\/www\.actic\.se\/hitta-gym\/[^/]+\/[^/]*(bad|sim|hall|pool|aqua|arena|hov|grosvad|friskvagen)[^/]*\/(bad\/|oppettider\/)?$/ },
];
const OPERATOR_HOSTS = /(^|\.)(medley\.se|actic\.se)$/;
const KNOWN_OPERATORS = /(medley\.se|fyrishov\.se|actic\.se|nordicwellness\.se|aqvakul|aq-va-kul|tropikariet|eriksdalsbadet|valhallabadet|kristinebergs|fysiken|holmenhallen|kokpunkten|aqua|bad\.se|badhus|simhall|aventyrsbad|sportcenter|idrottsforvaltning)/;

function scoreUrl(url, names) {
  const u = strip(safeDecode(url));
  let path; try { path = new URL(u).pathname; } catch { return 0; }
  if (isExcl(u)) return 0;
  let s = 0;
  if (/simhall|badhus|aventyrsbad|simbad|motionsbad|badanlaggning|upplevelsebad/.test(path)) s += 6;
  else if (HALL_RE.test(path)) s += 3;
  for (const n of names) if (n.length > 4 && path.includes(n)) s += 8;
  if (s && SUB_RE.test(path)) s += 1;
  if (s && LOW_RE.test(path)) s -= 4;
  if (s) s -= Math.min(3, path.split('/').length / 4);
  return s;
}
function pageRelevance(title, h1, lines, names = []) {
  const head = strip(`${title} ${h1}`);
  const headSlug = head.replace(/[^a-z0-9]+/g, '-');
  const text = strip(lines.join(' ').slice(0, 60000));
  let s = 0;
  if (/(simhall|badhus|aventyrsbad|simbad|badet\b|\bbad\b|bassang|motionsbad|simning|upplevelsebad|varmbad)/.test(head)) s += 3;
  for (const w of ['oppettider', 'bassang', 'simhall', 'entre', 'bastu', 'motionssim', 'aventyrsbad', 'babysim', 'varmbassang', 'rutschkana', 'hopptorn', 'simskola', 'vuxen', 'pensionar', 'badet']) if (text.includes(w)) s += 1;
  if (names.some((n) => n.length > 4 && headSlug.includes(n))) s += 3;
  if (!/(simhall|badhus|aventyrsbad|simbad|badet|\bbad\b|bassang|motionsbad|simning|upplevelsebad|varmbad|oppettider|priser)/.test(head) && !names.some((n) => n.length > 4 && headSlug.includes(n))) s -= 3;
  if (/(badplats|badplatser|strand)/.test(head) && !/(simhall|badhus)/.test(head)) s -= 4;
  return s;
}

async function fetchSitemapUrls(origin, robots) {
  const roots = [...new Set([...(robots?.sitemaps || []).map((s) => s.replace(/^http:/, 'https:')), origin + 'sitemap.xml'])].slice(0, 3);
  const urls = new Set(); let fetched = 0; const queue = [...roots]; const seen = new Set();
  while (queue.length && fetched < 12 && urls.size < 200000) {
    const sm = queue.shift(); if (seen.has(sm)) continue; seen.add(sm);
    let r;
    if (/\.gz$/i.test(sm)) {
      // gzip sitemaps: fetch as binary through the same polite gate
      const res = await politeFetch(sm, { accept: 'application/xml' }); fetched++;
      if (!res.ok) continue; r = res; // politeFetch returns text only for text types; .gz usually is skipped
    } else { r = await politeFetch(sm, { accept: 'application/xml,text/xml' }); fetched++; }
    if (!r.ok || !r.text) continue;
    const locs = [...r.text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
    if (/<sitemapindex/i.test(r.text)) {
      // prefer page sitemaps; skip image/news/event ones
      locs.filter((l) => !/(image|bild|news|nyhet|event|kalender|media|video)/i.test(l)).sort((a, b) => (/page|sida|content/i.test(b) ? 1 : 0) - (/page|sida|content/i.test(a) ? 1 : 0)).forEach((l) => queue.push(l));
    } else locs.forEach((l) => urls.add(l));
  }
  return { urls: [...urls], fetched };
}

async function crawlKommun(k) {
  const outFile = path.join(PAGES_DIR, `${k.kommunkod}.json`);
  if (!args.fresh && fs.existsSync(outFile) && Date.now() - fs.statSync(outFile).mtimeMs < MAX_AGE_H * 3600e3) return readJson(outFile).summary;
  const halls = osmByKommun[k.kommunkod] || [];
  const names = [...new Set(halls.flatMap((h) => [slugify(h.namn)]).filter((n) => n && !/^(simhall|badhus|aventyrsbad|simhallen|badhuset)$/.test(n)))];
  const origin = k.site;
  const kHost = new URL(origin).host.replace(/^www\./, '');
  const pages = []; const seen = new Set(); let fetches = 0;
  const queue = []; // {url, score, via, scope}
  const key = (u) => { try { const x = new URL(u); x.hash = ''; return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/(index\.html?)?$/, '') + x.search).toLowerCase(); } catch { return u; } };
  const push = (url, score, via, scope = null) => {
    try { const u = new URL(url); u.hash = ''; url = u.href; } catch { return; }
    if (BAD_HREF.test(url)) return;
    const kk = key(url);
    if (seen.has(kk) || score <= 0) return; seen.add(kk); queue.push({ url, score, via, scope });
  };
  const summary = { kommunkod: k.kommunkod, namn: k.namn, site: origin, sitemap_urls: 0, kandidater: 0, hamtade: 0, relevanta: 0, blockerad: null, fel: [] };

  if (!k.operator) {
    await robotsFor(origin).catch(() => null);
    if (blocked.has(new URL(origin).host)) summary.blockerad = blocked.get(new URL(origin).host);
  }
  const robots = await robotsFor(origin).catch(() => null);

  // seeds: OSM webb, manual seeds
  for (const h of halls) if (h.webb && /^https?:/.test(h.webb)) push(h.webb, 20, 'osm', scopeFor(h.webb, kHost));
  for (const s of manual[k.kommunkod] || []) push(s, 25, 'seed', scopeFor(s, kHost));

  if (!summary.blockerad) {
    const sm = await fetchSitemapUrls(origin, robots); fetches += sm.fetched; summary.sitemap_urls = sm.urls.length;
    if (k.operator) {
      for (const u of sm.urls.filter((u) => k.select.test(u))) push(u, 10, 'operator', { host: new URL(u).host, prefix: '/__none__' });
    } else {
      const scored = sm.urls.map((u) => ({ u, s: scoreUrl(u, names) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.u.length - b.u.length);
      for (const x of scored.slice(0, 30)) push(x.u, x.s, 'sitemap');
      if (scored.length < 3) {
        push(origin, 1, 'start');
        // site search (Sitevision / generic / WordPress), only where robots.txt allows it
        for (const q of ['sok.html?query=simhall', 'sok?q=simhall', 'search?q=simhall', '?s=simhall']) push(origin + q, 2.8, 'search');
      }
    }
  }
  summary.kandidater = queue.length;
  const max = k.operator ? 2000 : Math.max(MAX, Math.min(300, 22 * halls.length));

  const navSeen = new Set();
  while (queue.length && fetches < max) {
    queue.sort((a, b) => b.score - a.score);
    const item = queue.shift();
    const r = await politeFetch(item.url); fetches++;
    if (r.blocked || r.disallowed) { pages.push({ url: item.url, status: 0, skip: r.blocked || 'robots disallow' }); continue; }
    if (!r.ok) { if (r.status !== 404 && r.status !== 410) summary.fel.push(`${r.status || r.error} ${item.url}`.slice(0, 200)); pages.push({ url: item.url, status: r.status }); continue; }
    if (!/html/i.test(r.ct || '')) continue;
    seen.add(key(r.url));
    const html = r.text; summary.hamtade++;
    const { title, h1 } = extractTitle(html);
    const lines = htmlToLines(html);
    const rel = pageRelevance(title, h1, lines, names);
    const links = extractLinks(html, r.url);
    const isNav = item.via === 'start' || item.via === 'nav' || item.via === 'search';
    const relevant = k.operator || rel >= 5 || (item.via === 'osm' || item.via === 'seed') && rel >= 2;
    if (relevant) {
      summary.relevanta++;
      const ld = jsonLdNodes(html).filter((n) => n.openingHoursSpecification || n.openingHours || n.address || n.telephone || n.geo).slice(0, 20);
      const keepLinks = links.filter((l) => HALL_RE.test(strip(l.url + ' ' + l.text)) || SUB_RE.test(strip(l.url + ' ' + l.text)) || /^(tel|mailto):/.test(l.url)).slice(0, 150);
      const slim = html.replace(/<iframe\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, (m0, src) => /map|karta|kartor/i.test(src) ? `<a href="${src}">karta</a>` : '').replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s(class|style|data-[\w-]+|aria-[\w-]+|role|srcset|sizes)="[^"]*"/gi, '');
      const ldRaw = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]).join('');
      pages.push({ url: r.url, via: item.via, status: r.status, title, h1, rel, lines: lines.slice(0, 2500), jsonld: ld, links: keepLinks, html_gz: zlib.gzipSync(ldRaw + slim).toString('base64') });
    } else pages.push({ url: r.url, via: item.via, status: r.status, title, h1, rel });
    if (k.operator) continue;

    // enqueue children
    const fromHost = new URL(r.url).host.replace(/^www\./, '');
    const basePath = new URL(r.url).pathname.replace(/\/[^/]*\.html?$/, '/').replace(/\/$/, '');
    for (const l of links) {
      let lu; try { lu = new URL(l.url); } catch { continue; }
      if (BAD_HREF.test(lu.href)) continue;
      const host = lu.host.replace(/^www\./, '');
      const t = strip(`${safeDecode(lu.pathname)} ${l.text}`);
      if (isExcl(strip(safeDecode(lu.href)))) continue;
      // inside an external scope: stay below its prefix
      if (item.scope && host === item.scope.host.replace(/^www\./, '')) {
        if (!lu.pathname.startsWith(item.scope.prefix)) continue;
        if (relevant && (HALL_RE.test(t) || SUB_RE.test(t))) push(lu.href, 5, 'child', item.scope);
        continue;
      }
      const sameSite = host === kHost || host.endsWith('.' + kHost);
      if (sameSite) {
        const sc = host !== kHost ? scopeFor(lu.href, kHost) : null;
        const hs = scoreUrl(lu.href, names) + (/(simhall|badhus|aventyrsbad|bad|sim)/.test(strip(l.text)) ? 3 : 0);
        if (hs > 0) push(lu.href, hs + (relevant ? 2 : 0), relevant ? 'child' : 'link', sc);
        else if (relevant && SUB_RE.test(t) && lu.pathname.startsWith(basePath) && host === fromHost) push(lu.href, 4, 'child', sc);
        else if (isNav && NAV_RE.test(t) && !/(fritidshem|fritidsgard|skola|psykisk|omsorg|elevhals|forening|bidrag|kulturskola|fiske|odling|bibliotek|museum|konst|toalett)/.test(t) && navSeen.size < 30 && !navSeen.has(lu.href)) {
          navSeen.add(lu.href);
          const tier = /(idrott|motion)/.test(t) ? 3 : /(fritid|uppleva|gora|friluft)/.test(t) ? 2.5 : 1.5;
          push(lu.href, tier + (item.via === 'nav' ? -0.2 : 0), 'nav');
        }
      } else if (relevant || isNav) {
        // external: operator / dedicated bath websites linked from the kommun
        if (/(facebook|instagram|twitter|youtube|linkedin|google|apple|microsoft|tiktok|x\.com|spotify|bokamera|bokadirekt|sverigesradio|wikipedia|visit|tripadvisor|eniro|hitta\.se)/.test(host)) continue;
        if (OPERATOR_HOSTS.test(host)) continue; // covered by the dedicated operator crawls
        const hs = (HALL_RE.test(t) ? 4 : 0) + (KNOWN_OPERATORS.test(host) ? 4 : 0);
        if (hs >= 4) push(lu.href, hs, 'extern', scopeFor(lu.href, kHost));
      }
    }
  }
  summary.hamtade = fetches;
  writeJson(outFile, { kommunkod: k.kommunkod, namn: k.namn, hamtad: nowIso(), summary, pages }, false);
  return summary;
}

// Scope for an external site: a hall-specific host (e.g. vaggabadet.karlshamn.se, fyrishov.se) may be crawled from "/";
// a shared host (operator, other kommun) only below the hall's own path segment.
function scopeFor(url, kHost) {
  const u = new URL(url); const host = u.host.replace(/^www\./, '');
  if (host === kHost) return null;
  const sub = host.split('.')[0];
  if (HALL_RE.test(sub) || /(bad|sim|hall|hov|arena|aqua|tropi)/.test(sub)) return { host: u.host, prefix: '/' };
  const segs = u.pathname.split('/').filter(Boolean); let cut = segs.length;
  for (let i = 0; i < segs.length; i++) if (HALL_RE.test(strip(segs[i]))) { cut = i + 1; break; }
  return { host: u.host, prefix: '/' + segs.slice(0, Math.max(1, cut)).join('/') };
}

const todo = [...OPERATORS, ...sites].filter((k) => !only || only.has(k.kommunkod));
// Largest kommuner first: proxy = number of OSM objects (osm-data kommuner.json has no population).
todo.sort((a, b) => (b.operator ? 1e9 : osmByKommun[b.kommunkod]?.length || 0) - (a.operator ? 1e9 : osmByKommun[a.kommunkod]?.length || 0));
let done = 0;
const t0 = Date.now();
const results = await pool(todo, CONC, async (k) => {
  let s;
  try { s = await crawlKommun(k); } catch (e) { console.error(`FEL ${k.kommunkod} ${k.namn}: ${e.stack || e.message}`); s = { kommunkod: k.kommunkod, namn: k.namn, fel: [e.message], relevanta: 0, hamtade: 0 }; }
  done++; if (done % 10 === 0 || todo.length < 15) console.log(`${done}/${todo.length} ${k.namn}: ${s.relevanta} relevanta / ${s.hamtade} hämtade ${s.blockerad || ''} (${Math.round((Date.now() - t0) / 1000)} s)`);
  return s;
});
const prev = readJson(path.join(RAW_DIR, 'crawl-summary.json'), { kommuner: [] });
const merged = Object.fromEntries(prev.kommuner.map((s) => [s.kommunkod, s]));
for (const s of results) if (s?.kommunkod) merged[s.kommunkod] = s;
const prevBlocked = Object.fromEntries((prev.blockerade_vardar || []).map((b) => [b.host, b.orsak]));
// a kommun site crawled without block in this run clears its stale entry from earlier runs
for (const s of results) if (s?.kommunkod && !s.blockerad && s.hamtade > 0) {
  const site = todo.find((k) => k.kommunkod === s.kommunkod)?.site;
  if (site) { const h = new URL(site).hostname.replace(/^www\./, ''); delete prevBlocked[h]; delete prevBlocked[`www.${h}`]; }
}
for (const [h, why] of blocked) prevBlocked[h] = why;
writeJson(path.join(RAW_DIR, 'crawl-summary.json'), { hamtad: nowIso(), kommuner: Object.values(merged), blockerade_vardar: Object.entries(prevBlocked).map(([host, orsak]) => ({ host, orsak })) });
console.log('Blockerade värdar:', [...blocked].map(([h, w]) => `${h} (${w})`).join(', ') || 'inga');
