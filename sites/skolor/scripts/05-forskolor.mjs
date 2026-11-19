// Builds data/forskolor.json and data/forskolor_tackning.json.
//
// Skolverket has NO open per-förskoleenhet register (förskolor are not in Skolenhetsregistret,
// and Skolverket's statistics are per kommun/huvudman only). Sources used instead:
//   1. PRIMARY: SCB "Öppna geodata – Förskolor" (Företagsregistret, arbetsställen with SNI 85100
//      Förskoleutbildning, yearly, geocoded to Lantmäteriet address points). Gives name
//      (firmabenämning), huvudman (företagsnamn), visiting address, kommun and coordinates.
//   2. ENRICHMENT: OpenStreetMap amenity=kindergarten (ODbL) matched by name and distance:
//      website, phone, e-mail, opening hours, capacity, age range, wheelchair access.
//   3. Kommun averages from Skolverket (data/kommunstatistik.json), labelled as kommun-level.
//   4. SCB DeSO / tätort polygons for a cross-check of kommun and a fallback ort.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RAW, fetchJson, fetchText, writeJson, readJson, loadKommuner, titleCase, cleanPhone, cleanUrl, officialEmail, GeoIndex, haversineKm, assignSlugs, slugify, sweref99tmToWgs84, unzip, gpkgPoint, TODAY, USE_CACHE, argv } from './lib.mjs';

console.log('05 förskolor (SCB + OSM + Skolverket)');
const { byKod: kommunByKod } = loadKommuner();
const stats = readJson('kommunstatistik.json').kommuner;

// ---------- 0. SCB förskolor (primary list) ----------
const SCB_PAGE = 'https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/forskolor/';
const SCB_DIR = path.join(RAW, 'scb_forskolor');
fs.mkdirSync(SCB_DIR, { recursive: true });

async function scbForskolor() {
  // Find the current zip link on SCB's page (file name contains the year), cache the zip.
  let zipName = null, zipUrl = null;
  const cached = fs.readdirSync(SCB_DIR).filter((f) => /\.zip$/i.test(f)).sort();
  const newest = cached.at(-1);
  const fresh = newest && (Date.now() - fs.statSync(path.join(SCB_DIR, newest)).mtimeMs) / 86400000 < 7;
  if (!USE_CACHE && !(fresh && !argv.has('--full'))) {
    try {
      const html = await fetchText(SCB_PAGE);
      const m = [...html.matchAll(/href="([^"]*forskolor_(\d{4})_sweref[^"]*\.zip)"/gi)].sort((a, b) => b[2] - a[2])[0];
      if (m) {
        zipUrl = new URL(m[1].replace(/&amp;/g, '&'), SCB_PAGE).toString();
        zipName = path.basename(new URL(zipUrl).pathname);
      }
    } catch (e) {
      console.warn('  ! SCB-sidan kunde inte läsas:', e.message);
    }
  }
  if (zipName && (!fs.existsSync(path.join(SCB_DIR, zipName)) || argv.has('--full'))) {
    const res = await fetch(zipUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; open-data-fetcher/1.0)' }, signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error(`SCB zip HTTP ${res.status}`);
    fs.writeFileSync(path.join(SCB_DIR, zipName), Buffer.from(await res.arrayBuffer()));
    console.log('  hämtade', zipName);
  } else if (zipName) {
    fs.utimesSync(path.join(SCB_DIR, zipName), new Date(), new Date()); // mark as checked
  }
  zipName ??= newest;
  if (!zipName) throw new Error('Ingen SCB-förskolefil tillgänglig');
  const entries = await unzip(fs.readFileSync(path.join(SCB_DIR, zipName)));
  const gpkg = entries.find((e) => /\.gpkg$/i.test(e.name));
  if (!gpkg) throw new Error('Ingen .gpkg i ' + zipName);
  const gpkgFile = path.join(SCB_DIR, 'forskolor.gpkg');
  fs.writeFileSync(gpkgFile, gpkg.data);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(gpkgFile, { readOnly: true });
  const meta = db.prepare("select table_name, srs_id from gpkg_contents where data_type = 'features'").get();
  if (meta.srs_id !== 3006) throw new Error('Oväntat koordinatsystem ' + meta.srs_id);
  const cols = db.prepare(`pragma table_info("${meta.table_name}")`).all().map((c) => c.name);
  const geomCol = db.prepare('select column_name from gpkg_geometry_columns where table_name = ?').get(meta.table_name).column_name;
  const rows = db.prepare(`select * from "${meta.table_name}"`).all();
  db.close();
  const col = (re) => cols.find((c) => re.test(c));
  const C = {
    besok: col(/^bes.ksadress$/i), besokort: col(/^bes.ksort$/i), firma: col(/^firmaben/i), foretag: col(/^f.retagsnamn$/i),
    kommun: col(/^kommun$/i), postadress: col(/^postadress$/i), postnr: col(/^postnummer$/i),
  };
  for (const [k, v] of Object.entries(C)) if (!v) throw new Error(`SCB-kolumn saknas: ${k} (${cols.join(', ')})`);
  const year = (zipName.match(/(\d{4})/) || [])[1] || null;
  return {
    year,
    file: zipName,
    rows: rows.map((r) => {
      const xy = gpkgPoint(r[geomCol]);
      const ll = xy ? sweref99tmToWgs84(xy[1], xy[0]) : null;
      return {
        besok: r[C.besok]?.trim() || null, besokort: r[C.besokort]?.trim() || null, firma: r[C.firma]?.trim() || null,
        foretag: r[C.foretag]?.trim() || null, kommun: r[C.kommun]?.trim() || null, postadress: r[C.postadress]?.trim() || null,
        postnr: r[C.postnr]?.trim() || null, lat: ll?.lat ?? null, lon: ll?.lon ?? null,
      };
    }),
  };
}
const scb = await scbForskolor();
console.log(`  SCB ${scb.file}: ${scb.rows.length} arbetsställen`);

// ---------- 1. OSM via Overpass (tiled, with mirror fallback; last good copy kept) ----------
// Order matters: maps.mail.ru was the most reliable from this machine (Nov 2026); overpass-api.de
// works with a non-browser UA but is often "at capacity". Others are fallbacks.
const MIRRORS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
// The public mirrors time out (HTTP 504 after ~60 s) on big boxes, so Sweden is queried as a
// 1°x1° grid (only cells that intersect a DeSO polygon), and a cell that fails is split into
// 4 sub-cells (up to 3 levels). Each cell result is cached in data/raw/osm_tiles/ for 6 days
// (OSM changes slowly; --full refetches), so an interrupted run resumes where it stopped.
const OSM_FILE = path.join(RAW, 'osm_kindergarten_se.json');
const TILE_DIR = path.join(RAW, 'osm_tiles');
fs.mkdirSync(TILE_DIR, { recursive: true });

const deso = JSON.parse(fs.readFileSync(path.join(RAW, 'geo', 'deso_2025.json'), 'utf8')).features;
const tatorter = JSON.parse(fs.readFileSync(path.join(RAW, 'geo', 'tatorter_2023.json'), 'utf8')).features;
const desoIdx = new GeoIndex(deso, 0.05); // also fills f._bbox

const intersectsSweden = (s, w, n, e) => deso.some((f) => !(f._bbox[0] > e || f._bbox[2] < w || f._bbox[1] > n || f._bbox[3] < s));

const deadMirrors = new Set(); // mirrors that failed to connect at all are skipped for the rest of the run
async function overpass(q) {
  let last;
  for (const m of MIRRORS) {
    if (deadMirrors.has(m)) continue;
    try {
      const j = await fetchJson(m, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        // overpass-api.de answers 406 to Mozilla-style UAs, so use a plain generic one here
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'open-data-fetcher/1.0' },
        timeoutMs: 80000,
        retries: 1,
      });
      if (j.remark && /error|timed out|runtime/i.test(j.remark)) throw new Error(j.remark);
      return { j, mirror: m };
    } catch (e) {
      last = e;
      if (!/HTTP (429|5\d\d)/.test(e.message)) deadMirrors.add(m);
      console.warn(`  ! ${new URL(m).host}: ${e.message.slice(0, 100)}`);
    }
  }
  throw last;
}

async function fetchCell(s, w, n, e, depth, out, mirrors) {
  const key = [s, w, n, e].map((x) => x.toFixed(3)).join('_');
  const file = path.join(TILE_DIR, key + '.json');
  if (fs.existsSync(file) && (USE_CACHE || (!argv.has('--full') && (Date.now() - fs.statSync(file).mtimeMs) / 86400000 < 6))) {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    out.push(c);
    return;
  }
  const splitMarker = path.join(TILE_DIR, key + '.split');
  const recentlySplit = fs.existsSync(splitMarker) && (Date.now() - fs.statSync(splitMarker).mtimeMs) / 86400000 < 30;
  const q = `[out:json][timeout:90];nwr["amenity"="kindergarten"](${s},${w},${n},${e});out center tags;`;
  try {
    if (recentlySplit && depth < 3) throw new Error('known-too-big cell');
    const { j, mirror } = await overpass(q);
    mirrors.add(mirror);
    const c = { timestamp: j.osm3s?.timestamp_osm_base, elements: j.elements };
    fs.writeFileSync(file, JSON.stringify(c));
    out.push(c);
    if (j.elements.length) console.log(`  cell ${key}: ${j.elements.length}`);
  } catch (err) {
    if (depth >= 3) {
      // give up on this cell: reuse its last cached result, or the previous full OSM file's elements inside it
      if (fs.existsSync(file)) { out.push({ ...JSON.parse(fs.readFileSync(file, 'utf8')), stale: true }); return; }
      const prev = previousOsm();
      if (!prev) throw err;
      out.push({
        timestamp: prev.timestamp,
        stale: true,
        elements: prev.elements.filter((el) => {
          const la = el.lat ?? el.center?.lat, lo = el.lon ?? el.center?.lon;
          return la >= s && la < n && lo >= w && lo < e;
        }),
      });
      console.warn(`  ! cell ${key}: använder tidigare data`);
      return;
    }
    if (!recentlySplit) fs.writeFileSync(splitMarker, ''); // next runs go straight to sub-cells
    const ms = (s + n) / 2, mw = (w + e) / 2;
    for (const [a, b, c2, d] of [[s, w, ms, mw], [s, mw, ms, e], [ms, w, n, mw], [ms, mw, n, e]])
      if (intersectsSweden(a, b, c2, d)) await fetchCell(a, b, c2, d, depth + 1, out, mirrors);
  }
}

let _prev;
function previousOsm() {
  if (_prev === undefined) _prev = fs.existsSync(OSM_FILE) ? JSON.parse(fs.readFileSync(OSM_FILE, 'utf8')) : null;
  return _prev;
}
let osm;
if (USE_CACHE && fs.existsSync(OSM_FILE)) osm = previousOsm();
else try {
  const cells = [];
  const mirrors = new Set();
  for (let s = 55; s < 69.1; s += 1)
    for (let w = 10; w < 24.2; w += 1)
      if (intersectsSweden(s, w, s + 1, w + 1)) await fetchCell(s, w, s + 1, w + 1, 0, cells, mirrors);
  const byId = new Map();
  for (const c of cells) for (const el of c.elements) byId.set(`${el.type}/${el.id}`, el);
  const stamps = cells.map((c) => c.timestamp).filter(Boolean).sort();
  osm = { timestamp: stamps.at(-1) || null, oldest_cell: stamps[0] || null, stale_cells: cells.filter((c) => c.stale).length, mirrors: [...mirrors], elements: [...byId.values()] };
  fs.writeFileSync(OSM_FILE, JSON.stringify(osm));
} catch (e) {
  if (!fs.existsSync(OSM_FILE)) throw e;
  console.warn('  ! Overpass misslyckades, använder senast sparade OSM-data:', e.message);
  osm = JSON.parse(fs.readFileSync(OSM_FILE, 'utf8'));
  osm.stale = true;
}
console.log(`  OSM-objekt: ${osm.elements.length} (data från ${osm.timestamp})`);

// ---------- 2. helpers ----------
const tatortIdx = new GeoIndex(tatorter, 0.05);
const cleanTatort = (s) => (s ? s.replace(/\s*\(.*?\)\s*$/, '').trim() : s);
const stripStr = (s) => (typeof s === 'string' ? s.trim() || null : null);

// Workplaces that are not a förskola (always excluded) and ones that are only excluded when the
// name does not mention förskola (combined "X-skolan, förskola och fritidshem" units are kept).
const EXCLUDE_NAME = /(öppen förskola|öppna förskola|öppna förskolan|familjecentral|dagbarnvård|dagmamma|dagbarnvårdare|pedagogisk omsorg|förvaltning|kontor|administration|förskolechef|rektorsområde|central(förråd|kök)|kök|vikariepool|resursteam|resursenhet|specialpedagog)/i;
const EXCLUDE_UNLESS_FORSKOLA = /(fritidshem|fritids|skola|skolan|F-d)/i;
const notForskola = (n) => EXCLUDE_NAME.test(n) || (EXCLUDE_UNLESS_FORSKOLA.test(n) && !/förskol|dagis|barnstuga|daghem/i.test(n));
const KOMMUNAL = /\b(kommun|kommuns|stad|stads|region gotland|kommunalförbund)\b/i;
const LEGAL = /\b(ab|aktiebolag|ek\.?\s*för\.?|ekonomisk[a]? förening(en)?|ideell[a]? förening(en)?|stiftelse[n]?|hb|kb|handelsbolag|kommanditbolag|\(publ\))\b/i;
// Sole traders (enskild firma) are registered under the owner's name as "Efternamn, Förnamn":
// never publish that name. Organisations also use commas ("HEMGÅRDAR I MALMÖ, FÖRENINGEN"), so
// exclude anything with an organisation word.
const ORG_WORD = /(förening|föreningen|förs?amling|kyrka|kyrkan|pastorat|byaråd|gille|skola|skolor|friskola|daghem|förskol|barn|dagis|kooperativ|montessori|waldorf|stiftelse|region|kommun|förbund|hemgård|aktiebolag|\bab\b|\bek\b|\bf\b|sth|stockholm|göteborg|malmö)/i;
const looksPersonal = (s) => !!s && !ORG_WORD.test(s) && !LEGAL.test(s) && /^[^\d,]+,\s*[^\d,]+$/.test(s);
// a sole trader's business name is only shown when it clearly names a preschool
const firmaOkForPerson = (f) => !!f && /förskol|dagis|barnstuga|daghem|montessori|waldorf|ur och skur|kooperativ/i.test(f);
const stripLegal = (s) => {
  let x = s;
  for (let i = 0; i < 3; i++) x = x.replace(/[,\s]+(ek\.?\s*för\.?|ekonomisk[a]? förening(en)?|ideell[a]? förening(en)?|aktiebolag|ab|hb|kb|\(publ\)|i likvidation)\.?\s*$/i, '').trim();
  return x;
};
// Swedish casing for names that SCB delivers in CAPITALS: common nouns after the first word are
// lower case ("Förskola Solrosen", "Lugnets förskola", "Meitens väg 4").
const LOWER_WORDS = new Set(['förskola', 'förskolan', 'förskolor', 'förskolorna', 'skola', 'skolan', 'fritidshem', 'och', 'i', 'på', 'vid', 'väg', 'vägen', 'gata', 'gatan', 'gränd', 'allé', 'backe', 'stig', 'plan', 'torg', 'kommun', 'församling', 'pastorat', 'förening', 'föreningen', 'ekonomisk', 'ideell', 'förskoleklass', 'daghem', 'montessoriförskola']);
const pretty = (s) => {
  const raw = s.replace(/\s+/g, ' ').trim();
  let x = titleCase(raw);
  if (raw === raw.toUpperCase()) x = x.split(' ').map((w, i) => (i > 0 && LOWER_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w)).join(' ');
  x = x.replace(/\b(Ab|Hb|Kb)\b/g, (m) => m.toUpperCase()).replace(/\bF-Koop\b/gi, 'F-koop');
  return x;
};
const normName = (s) => slugify(s || '').replace(/\b(forskolan|forskola|forskolor|foraldrakooperativet|foraldrakooperativ|personalkooperativet|ekonomisk|forening|ab|ek|for)\b/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const PEDAGOGIK = [
  ['Montessori', /montessori/i], ['Waldorf', /waldorf|steiner/i], ['Reggio Emilia', /reggio/i], ['I Ur och Skur', /i ur och skur|ur & skur|\buoc\b/i],
  ['Naturförskola', /naturförskol|uteförskol|skogsförskol|skogsmulle|friluftsförskol/i], ['Föräldrakooperativ', /föräldrakoop|f-koop|fkoop|föräldraförening/i],
  ['Personalkooperativ', /personalkoop/i], ['Musikprofil', /musikförskol/i], ['Språkprofil', /\binternational\b|english|bilingual|tvåspråkig|sverigefinsk|finska förskol|deutsch|französisch|french|spansk/i],
  ['Kristen', /kristen|kyrk|församling|katolsk|adventist|pingst/i], ['Islamisk', /islamisk|muslimsk/i], ['Judisk', /judisk|hillel/i], ['Ridprofil', /ridförskol/i],
];

// ---------- 3. OSM index (named kindergartens inside Sweden) ----------
const osmPts = [];
for (const el of osm.elements) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) continue;
  if (t['disused:amenity'] || t['abandoned:amenity'] || t.end_date) continue;
  if (!desoIdx.find(lon, lat)) continue;
  const name = stripStr(t.name) || stripStr(t['name:sv']) || stripStr(t.official_name);
  osmPts.push({ el, t, lat, lon, name, norm: normName(name), used: false });
}
const osmGrid = new Map();
const gk = (lat, lon) => `${Math.floor(lat * 100)}:${Math.floor(lon * 50)}`; // ~1.1 km x ~1.1 km cells
for (const p of osmPts) { const k = gk(p.lat, p.lon); if (!osmGrid.has(k)) osmGrid.set(k, []); osmGrid.get(k).push(p); }
function osmNear(lat, lon, km) {
  const out = [];
  const a = Math.floor(lat * 100), b = Math.floor(lon * 50);
  for (let i = a - 1; i <= a + 1; i++) for (let j = b - 1; j <= b + 1; j++) for (const p of osmGrid.get(`${i}:${j}`) || []) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d <= km) out.push({ p, d });
  }
  return out;
}

// ---------- 4. build rows from SCB ----------
const counters = { scb_arbetsstallen: scb.rows.length, exkluderade_ej_forskola: 0, utan_publicerbart_namn: 0, okand_kommun: 0, dubbletter: 0, utan_koordinat: 0, kommun_avviker_fran_koordinat: 0, osm_matchade: 0 };
const seen = new Map();
let rows = [];
for (const s of scb.rows) {
  const kommun = kommunByKod.get(s.kommun);
  if (!kommun) { counters.okand_kommun++; continue; }
  const personal = looksPersonal(s.foretag);
  let rawName = personal ? (firmaOkForPerson(s.firma) ? s.firma : null) : s.firma || s.foretag;
  if (!rawName) { counters.utan_publicerbart_namn++; continue; }
  if (EXCLUDE_NAME.test(rawName) && !/förskola\s+\S/i.test(rawName.replace(EXCLUDE_NAME, ''))) { counters.exkluderade_ej_forskola++; continue; }
  let namn = pretty(stripLegal(rawName));
  const gatuadress = s.besok ? pretty(s.besok).replace(/(\d+)\s*-\s*(\d+)/, '$1–$2') : null;
  if (/^(förskola|förskolan|förskolor)$/i.test(namn)) namn = gatuadress ? `Förskolan på ${gatuadress.replace(/\s+\d.*$/, '')}` : namn;
  const huvudmanstyp = s.foretag && KOMMUNAL.test(s.foretag) && !LEGAL.test(s.foretag) ? 'kommunal' : 'enskild';
  const dupKey = `${s.kommun}|${normName(namn)}|${slugify(gatuadress)}`;
  if (seen.has(dupKey)) { counters.dubbletter++; continue; }
  seen.set(dupKey, true);
  if (s.lat == null) counters.utan_koordinat++;

  // kommun cross-check against coordinate (DeSO); the register's kommun field wins
  const d = s.lat != null ? desoIdx.find(s.lon, s.lat) : null;
  if (d && d.properties.kommunkod !== s.kommun) counters.kommun_avviker_fran_koordinat++;

  const ort = s.besokort ? pretty(s.besokort) : (() => { const t = s.lat != null ? tatortIdx.find(s.lon, s.lat) : null; return t ? cleanTatort(t.properties.tatort) : kommun.namn; })();
  const tat = s.lat != null ? tatortIdx.find(s.lon, s.lat) : null;
  const postnummer = s.postnr && /^\d{5}$/.test(s.postnr.replace(/\s/g, '')) && s.postadress && slugify(s.postadress) === slugify(s.besok) ? s.postnr.replace(/\s/g, '').replace(/^(\d{3})(\d{2})$/, '$1 $2') : null;

  // OSM enrichment: best named candidate within 250 m with matching core name, else unnamed/any within 40 m
  let osmHit = null;
  if (s.lat != null) {
    const nn = normName(namn);
    let best = null;
    for (const { p, d: dist } of osmNear(s.lat, s.lon, 0.25)) {
      if (p.used) continue;
      const nameOk = nn && p.norm && (p.norm === nn || (p.norm.length >= 4 && nn.includes(p.norm)) || (nn.length >= 4 && p.norm.includes(nn)));
      const score = nameOk ? 10 - dist : dist <= 0.04 && !p.name ? 1 - dist : -1;
      if (score > 0 && (!best || score > best.score)) best = { p, score, dist };
    }
    if (best) { best.p.used = true; osmHit = best.p; counters.osm_matchade++; }
  }
  const t = osmHit?.t || {};
  const inriktning = [...new Set(PEDAGOGIK.filter(([, re]) => re.test(namn) || re.test(s.foretag || '') || re.test(t.pedagogy || '') || re.test(t.name || '')).map(([k]) => k))];
  const cap = Number(String(t.capacity || '').replace(/[^\d]/g, ''));

  const ks = stats[s.kommun]?.forskola;
  const pick = (base) => (ks ? ks[`${base}_${huvudmanstyp}`] ?? ks[base] ?? null : null);
  const kommunsnitt = ks ? {
    niva: `kommunen, ${huvudmanstyp} regi`,
    ar: ks.ar,
    barn_per_grupp: pick('barn_per_grupp'),
    barn_per_heltidstjanst: pick('barn_per_heltidstjanst'),
    andel_forskollarexamen: pick('andel_forskollarexamen'),
    forskoleenheter_i_kommunen: (ks.forskoleenheter_kommunal ?? 0) + (ks.forskoleenheter_enskild ?? 0) || null,
  } : null;

  const id = 'scb-' + crypto.createHash('sha1').update(`${s.kommun}|${normName(namn) || slugify(namn)}|${slugify(gatuadress)}`).digest('hex').slice(0, 10);
  rows.push({
    id,
    namn,
    kedja: personal || !s.foretag ? null : pretty(s.foretag),
    typ: huvudmanstyp === 'kommunal' ? 'kommunal förskola' : 'fristående förskola',
    gatuadress,
    postnummer,
    ort,
    kommun: kommun.namn,
    kommunkod: s.kommun,
    lan: kommun.lan,
    lat: s.lat != null ? Math.round(s.lat * 1e6) / 1e6 : null,
    lon: s.lon != null ? Math.round(s.lon * 1e6) / 1e6 : null,
    telefon: cleanPhone(t.phone || t['contact:phone']),
    webb: cleanUrl(t.website || t['contact:website'] || t.url),
    epost: officialEmail(t.email || t['contact:email']),
    oppettider: stripStr(t.opening_hours),
    extra: {
      huvudmanstyp,
      antal_barn: null, // Skolverket publicerar inte uppgifter per förskoleenhet
      barn_per_grupp: null,
      andel_forskollarare: null,
      kommunsnitt,
      inriktning: inriktning.length ? inriktning : null,
      osm_kapacitet: cap > 0 && cap < 500 ? cap : null,
      alder: t.min_age || t.max_age ? { min: t.min_age ?? null, max: t.max_age ?? null } : null,
      rullstolsanpassad: t.wheelchair || null,
      osm: osmHit ? `${osmHit.el.type}/${osmHit.el.id}` : null,
      osm_namn: osmHit?.name && osmHit.name !== namn ? osmHit.name : null,
      tatort: tat ? cleanTatort(tat.properties.tatort) : null,
      deso: d?.properties.desokod ?? null,
      scb_ar: scb.year,
    },
    kallor: [
      { namn: `SCB – Öppna geodata Förskolor ${scb.year ?? ''} (Företagsregistret, SNI 85100)`.trim(), url: SCB_PAGE, licens: 'CC0 (SCB öppna data)' },
      ...(osmHit ? [{ namn: 'OpenStreetMap', url: `https://www.openstreetmap.org/${osmHit.el.type}/${osmHit.el.id}`, licens: 'ODbL 1.0 – © OpenStreetMap-bidragsgivare' }] : []),
      ...(ks ? [{ namn: 'Skolverket – Kommunala jämförelsetal förskola', url: 'https://statistikdatabasen.skolverket.se/PxWeb/pxweb/sv/Skolverkets_statistikdatabas/', licens: 'Öppna data, fri användning (Skolverket)' }] : []),
    ],
    uppdaterad: TODAY,
  });
}

// collapse ids that still collide (same name + address written differently is rare)
const idSeen = new Map();
for (const r of rows) {
  const n = (idSeen.get(r.id) || 0) + 1;
  idSeen.set(r.id, n);
  if (n > 1) r.id = `${r.id}-${n}`;
}
rows.sort((a, b) => a.kommunkod.localeCompare(b.kommunkod) || a.namn.localeCompare(b.namn, 'sv'));
assignSlugs(rows);
writeJson('forskolor.json', rows);

// OSM kindergartens that matched no SCB workplace: kept for manual review only (may be closed,
// pedagogisk omsorg, or missing in SCB's register). Not published.
const omatchade = osmPts.filter((p) => !p.used && p.name && !notForskola(p.name)).map((p) => ({ osm: `${p.el.type}/${p.el.id}`, namn: p.name, lat: p.lat, lon: p.lon, kommunkod: desoIdx.find(p.lon, p.lat)?.properties.kommunkod }));
fs.writeFileSync(path.join(RAW, 'osm_omatchade_forskolor.json'), JSON.stringify(omatchade, null, 1));

// ---------- 5. coverage vs Skolverket official counts ----------
const tack = {};
for (const k of kommunByKod.values()) {
  const ks = stats[k.kommunkod]?.forskola;
  const off = ks ? (ks.forskoleenheter_kommunal ?? 0) + (ks.forskoleenheter_enskild ?? 0) : null;
  const mine = rows.filter((r) => r.kommunkod === k.kommunkod);
  tack[k.kommunkod] = {
    kommun: k.namn,
    antal: mine.length,
    kommunala: mine.filter((r) => r.extra.huvudmanstyp === 'kommunal').length,
    fristaende: mine.filter((r) => r.extra.huvudmanstyp === 'enskild').length,
    skolverket_forskoleenheter: off,
    skolverket_kommunal: ks?.forskoleenheter_kommunal ?? null,
    skolverket_enskild: ks?.forskoleenheter_enskild ?? null,
    ar: ks?.ar ?? null,
    kvot_pct: off ? Math.round((1000 * mine.length) / off) / 10 : null,
    med_osm_berikning: mine.filter((r) => r.extra.osm).length,
  };
}
const totOff = Object.values(tack).reduce((s2, x) => s2 + (x.skolverket_forskoleenheter || 0), 0);
writeJson('forskolor_tackning.json', {
  uppdaterad: TODAY,
  scb_fil: scb.file,
  osm_timestamp: osm.timestamp,
  osm_stale: !!osm.stale,
  totalt: { antal: rows.length, skolverket_forskoleenheter: totOff, kvot_pct: Math.round((1000 * rows.length) / totOff) / 10, osm_omatchade_namngivna: omatchade.length },
  filtrering: counters,
  not: 'SCB räknar arbetsställen (adresser), Skolverket förskoleenheter (organisatoriska enheter, 15 okt). En förskoleenhet kan ha flera arbetsställen, därför kvot > 100 % i vissa kommuner.',
  kommuner: tack,
});
console.log('  filtrering:', counters, ' osm omatchade:', omatchade.length);
