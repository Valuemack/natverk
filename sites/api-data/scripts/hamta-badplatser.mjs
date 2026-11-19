// Hämtar alla badplatser från Havs- och vattenmyndighetens öppna API "Badplatser och badvatten" (v2)
// och skriver data/badplatser.json i nätverkets gemensamma schema.
//
// Körning:  node scripts/hamta-badplatser.mjs [--limit N] [--spara-ra] [--utan-hav-sidor]
//   --limit N         hämta bara de N första (för test)
//   --spara-ra        spara även råsvaren i data/raw/havbad-raw.json
//   --utan-hav-sidor  hoppa över matchning mot HaV:s webbsidor (sitemap) för fältet webb
//   --cache-timmar H  återanvänd svar i data/raw/havbad-cache.ndjson som är yngre än H timmar (standard 12)
//   --ingen-cache     hämta allt på nytt och skriv ingen cache
//
// API-dokumentation: https://www.havochvatten.se/data-kartor-och-rapporter/data-och-statistik/data-och-apier/api-badplatser-och-badvatten.html
// Villkor: https://www.havochvatten.se/download/18.ad23bfe185cbe8fec8bafa6/1675243143056/avtal-anvandarvillkor-api-oppna-data-hav.pdf
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { DATA, LAN, getJson, getText, writeJson, localDate, today, slugify } from './lib.mjs';

const BASE = 'https://gw.havochvatten.se/external-public/bathing-waters/v2';
const SITEMAP = 'https://www.havochvatten.se/sitemap1.xml.gz';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const SAVE_RAW = args.includes('--spara-ra');
const SKIP_PAGES = args.includes('--utan-hav-sidor');

// HaV:s stavning avviker från SCB:s officiella kommunnamn för några kommuner.
const KOMMUN_RATTNING = { 114: 'Upplands Väsby', 2023: 'Malung-Sälen' };

// waterTypeId i HaV: 1 = Hav, 2 = Vattendrag, 3 = Sjö, 4 = Delta (texten används i första hand).
const TYP = { 1: 'havsbad', 2: 'älvbad', 3: 'sjöbad', 4: 'deltabad' };
const TYP_TEXT = { Hav: 'havsbad', 'Sjö': 'sjöbad', Vattendrag: 'älvbad', Delta: 'deltabad' };

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const clean = (s) => {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t === '' ? null : t;
};
const contact = (c) => {
  if (!c) return null;
  const o = {
    namn: clean(c.name),
    adress: clean(c.address),
    besoksadress: clean(c.visitAddress),
    telefon: clean(c.phone),
    epost: clean(c.email),
  };
  return Object.values(o).some(Boolean) ? o : null;
};
const url = (u) => {
  const t = clean(u);
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

function mapSample(r) {
  const sample = {
    datum: localDate(r.takenAt),
    ecoli: num(r.escherichiaColiCount),
    enterokocker: num(r.intestinalEnterococciCount),
    bedomning: clean(r.sampleAssessIdText),
    ecoli_bedomning: clean(r.escherichiaColiAssessIdText),
    enterokocker_bedomning: clean(r.intestinalEnterococciAssessIdText),
    vattentemp: num(r.waterTemp),
    algblomning: clean(r.algalIdText),
    vader: clean(r.weatherIdText),
    komplett: r.sampleComplete ?? null,
  };
  // Prefix "<" / ">" betyder under/över mätområdet, t.ex. "<10".
  if (r.escherichiaColiPrefix && r.escherichiaColiPrefix !== '=') sample.ecoli_operator = r.escherichiaColiPrefix;
  if (r.intestinalEnterococciPrefix && r.intestinalEnterococciPrefix !== '=') sample.enterokocker_operator = r.intestinalEnterococciPrefix;
  return sample;
}

// --- HaV:s webbsidor per badplats (för fältet webb) via sitemap --------------------------
async function loadHavPages() {
  const res = await getText(SITEMAP);
  const xml = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8');
  const folders = new Map(); // folderSlug -> Set(pageSlug)
  for (const m of xml.matchAll(/<loc>https:\/\/www\.havochvatten\.se\/badplatser-och-badvatten\/kommuner\/badplatser-i-([^/<]+?)(?:\/([^/<]+)\.html|\.html)<\/loc>/g)) {
    const [, folder, page] = m;
    if (!folders.has(folder)) folders.set(folder, new Set());
    if (page) folders.get(folder).add(page);
  }
  return folders;
}

function findKommunFolder(folders, name) {
  const s = slugify(name);
  for (const cand of [`${s}s-kommun`, `${s}-kommun`, `${s}s-stad`, `${s}-stad`]) if (folders.has(cand)) return cand;
  // t.ex. "habo-kommun-jonkopings-lan" / "habo-kommun-uppsala-lan" (Habo resp. Håbo)
  return null;
}

const FULLNAMN_UNDANTAG = { Falun: 'Falu kommun', Gotland: 'Region Gotland' };
function kommunFullnamn(name, folder) {
  if (FULLNAMN_UNDANTAG[name]) return FULLNAMN_UNDANTAG[name];
  if (folder) {
    const s = slugify(name);
    const gen = folder.startsWith(`${s}s-`) ? `${name}s` : name;
    return folder.endsWith('-stad') ? `${gen} stad` : `${gen} kommun`;
  }
  if (name === 'Gotland') return 'Region Gotland';
  return /[sxz]$/i.test(name) ? `${name} kommun` : `${name}s kommun`;
}

// --- Huvudflöde ---------------------------------------------------------------------------
const list = await getJson(`${BASE}/bathing-waters`);
const all = list.watersAndAdvisories ?? [];
console.log(`HaV: ${all.length} badplatser i listan`);

let folders = null;
if (!SKIP_PAGES) {
  try {
    folders = await loadHavPages();
    console.log(`HaV-sitemap: ${folders.size} kommunmappar`);
  } catch (e) {
    console.warn('Kunde inte läsa HaV:s sitemap, webb lämnas tomt:', e.message);
  }
}

// Kommunmapp per kommunkod: välj den mapp där flest av kommunens badplatsnamn finns (hanterar Habo/Håbo m.fl.).
const folderByKommun = new Map();
if (folders) {
  const byKommun = new Map();
  for (const w of all) {
    const m = w.bathingWater.municipality;
    if (!byKommun.has(m.id)) byKommun.set(m.id, { name: KOMMUN_RATTNING[m.id] ?? m.name, slugs: [] });
    byKommun.get(m.id).slugs.push(slugify(w.bathingWater.name));
  }
  for (const [id, { name, slugs }] of byKommun) {
    let best = findKommunFolder(folders, name);
    if (!best) {
      let bestScore = 0;
      for (const [folder, pages] of folders) {
        if (!folder.startsWith(slugify(name).slice(0, 3))) continue;
        const score = slugs.filter((s) => pages.has(s)).length;
        if (score > bestScore) [best, bestScore] = [folder, score];
      }
    }
    folderByKommun.set(id, best);
  }
}

// Återupptagningscache: varje svar läggs till i data/raw/havbad-cache.ndjson. Svar yngre än CACHE_H timmar
// återanvänds, så en avbruten körning kan startas om utan att börja från noll.
const CACHE_FILE = join(DATA, 'raw', 'havbad-cache.ndjson');
const CACHE_H = args.includes('--cache-timmar') ? Number(args[args.indexOf('--cache-timmar') + 1]) || 12 : 12;
const cache = new Map();
if (!args.includes('--ingen-cache')) {
  try {
    for (const line of (await readFile(CACHE_FILE, 'utf8')).split('\n')) {
      if (!line) continue;
      try {
        const { t, id, d } = JSON.parse(line);
        if (Date.now() - t < CACHE_H * 3600e3) cache.set(id, d);
      } catch {}
    }
  } catch {}
  // Skriv om cachen med bara färska poster.
  await mkdir(dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, [...cache].map(([id, d]) => JSON.stringify({ t: Date.now(), id, d })).join('\n') + (cache.size ? '\n' : ''), 'utf8');
  if (cache.size) console.log(`Återanvänder ${cache.size} cachade svar (< ${CACHE_H} h)`);
}

const out = [];
const raw = [];
let n = 0;
let webbMatch = 0;
const fel = [];
for (const item of all) {
  if (n >= LIMIT) break;
  n++;
  const id = item.bathingWater.id;
  let d = cache.get(id) ?? null;
  if (!d) {
    try {
      d = await getJson(`${BASE}/bathing-waters/${encodeURIComponent(id)}`, { allow404: true });
      if (d && !args.includes('--ingen-cache')) await appendFile(CACHE_FILE, JSON.stringify({ t: Date.now(), id, d }) + '\n', 'utf8');
    } catch (e) {
      fel.push({ id, fel: e.message });
      d = null;
    }
  }
  if (!d) d = { ...item, profile: null, results: [], waterTemperature: [] };
  if (SAVE_RAW) raw.push(d);
  if (n % 100 === 0) console.log(`  ${n}/${Math.min(all.length, LIMIT)}`);

  const bw = d.bathingWater ?? item.bathingWater;
  const p = d.profile ?? {};
  const m = bw.municipality ?? {};
  const kommunkod = m.id != null ? String(m.id).padStart(4, '0') : null;
  const kommun = KOMMUN_RATTNING[m.id] ?? clean(m.name);
  const folder = folderByKommun.get(m.id) ?? null;

  // HaV-sida: exakt namnmatchning inom kommunens mapp. Vid dubbletter (t.ex. apelviken-1/-2) lämnas null.
  let webb = null;
  if (folder && folders) {
    const pages = folders.get(folder);
    const s = slugify(bw.name);
    const cands = [...pages].filter((pg) => pg === s || new RegExp(`^${s}-\\d+$`).test(pg));
    if (cands.length === 1) webb = `https://www.havochvatten.se/badplatser-och-badvatten/kommuner/badplatser-i-${folder}/${cands[0]}.html`;
  }
  if (webb) webbMatch++;

  const prov = (d.results ?? [])
    .map(mapSample)
    .filter((s) => s.datum)
    .sort((a, b) => b.datum.localeCompare(a.datum));

  const klassificeringar = (p.lastFourClassifications ?? [])
    .map((c) => ({ ar: c.year, klass: clean(c.qualityClassIdText), klass_id: c.qualityClassId }))
    .sort((a, b) => b.ar - a.ar);
  // Senaste fastställda klassning (hoppar över "Klassificering pågår", id 7).
  const klassificering = klassificeringar.find((c) => c.klass_id !== 7) ?? null;

  const senasteTemp = prov.find((s) => s.vattentemp !== null);
  const prognos = (d.waterTemperature ?? []).map((t) => ({ timme: num(t.measHour), grader: num(t.waterTemp) })).filter((t) => t.grader !== null);

  const lat = num(bw.samplingPointPosition?.latitude);
  const lon = num(bw.samplingPointPosition?.longitude);
  const omkrets = (bw.perimeterCoordinates ?? [])
    .map((c) => [num(c.latitude), num(c.longitude)])
    .filter(([a, b]) => a !== null && b !== null)
    .map(([a, b]) => [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6]);

  out.push({
    id,
    namn: clean(bw.name),
    kedja: null,
    typ: TYP_TEXT[bw.waterTypeIdText] ?? TYP[bw.waterTypeId] ?? 'badplats',
    gatuadress: null,
    postnummer: null,
    ort: null,
    kommun,
    kommunkod,
    lan: kommunkod ? LAN[kommunkod.slice(0, 2)] ?? null : null,
    lat: lat !== null ? Math.round(lat * 1e6) / 1e6 : null,
    lon: lon !== null ? Math.round(lon * 1e6) / 1e6 : null,
    telefon: null,
    webb,
    oppettider: null,
    extra: {
      eu_badplats: bw.euType === true,
      eu_motiv: clean(bw.euMotive),
      ej_eu_motiv: clean(bw.notEuMotive),
      vattentyp: clean(bw.waterTypeIdText),
      beskrivning: clean(bw.description),
      sammanfattning: clean(p.summary),
      klassificering,
      klassificeringar,
      senaste_prov: prov,
      antal_prov: prov.length,
      senaste_provdatum: prov[0]?.datum ?? null,
      badsasong: p.bathingSeason
        ? { start: localDate(p.bathingSeason.startsAt), slut: localDate(p.bathingSeason.endsAt) }
        : null,
      vattentemp: {
        senast_uppmatt: senasteTemp ? { datum: senasteTemp.datum, grader: senasteTemp.vattentemp } : null,
        prognos: prognos.length ? { hamtad: today(), kalla: 'Copernicus via HaV (kustbad)', varden: prognos } : null,
      },
      avradan: (d.adviceAgainstBathing ?? []).map((a) => ({
        orsak: clean(a.typeIdText),
        beskrivning: clean(a.description),
        fran: localDate(a.startsAt),
        till: localDate(a.endsAt),
      })),
      onormala_situationer: (d.abnormalSituations ?? []).map((a) => ({
        typ: clean(a.typeIdText ?? a.type),
        beskrivning: clean(a.description),
        fran: localDate(a.startsAt),
        till: localDate(a.endsAt),
      })),
      blomningsrisk: p.bloomRisk ? { alger: p.bloomRisk.algae ?? null, cyanobakterier: p.bloomRisk.cyano ?? null } : null,
      fororeningskallor: (p.pollutionSources ?? []).map((s) => (typeof s === 'string' ? s : clean(s.description ?? s.typeIdText ?? JSON.stringify(s)))),
      huvudman: contact(p.localAuthorities?.administrative?.contactInfo),
      tillsynsmyndighet: contact(p.localAuthorities?.supervisory?.contactInfo),
      kommun_fullnamn: kommun ? kommunFullnamn(kommun, folder) : null,
      kommun_kontakt: m.contactInfo
        ? { telefon: clean(m.contactInfo.phone), epost: clean(m.contactInfo.email), webb: url(m.contactInfo.url) }
        : null,
      profil_uppdaterad: localDate(p.updateDetail?.latestAt),
      profil_uppdateringsfrekvens: clean(p.updateDetail?.frequency),
      omkrets: omkrets.length ? omkrets : null,
    },
    kallor: ['Havs- och vattenmyndigheten (HaV), API Badplatser och badvatten v2'],
    uppdaterad: today(),
  });
}

out.sort((a, b) => (a.lan ?? '').localeCompare(b.lan ?? '', 'sv') || (a.kommun ?? '').localeCompare(b.kommun ?? '', 'sv') || a.namn.localeCompare(b.namn, 'sv'));
await writeJson(join(DATA, 'badplatser.json'), out, { enPerRad: true });
if (SAVE_RAW) await writeJson(join(DATA, 'raw', 'havbad-raw.json'), raw);

const stat = {
  totalt: out.length,
  eu_bad: out.filter((x) => x.extra.eu_badplats).length,
  typ: Object.fromEntries(Object.entries(out.reduce((a, x) => ((a[x.typ] = (a[x.typ] ?? 0) + 1), a), {}))),
  kommuner: new Set(out.map((x) => x.kommunkod)).size,
  med_prov: out.filter((x) => x.extra.antal_prov > 0).length,
  med_prov_i_ar: out.filter((x) => x.extra.senaste_provdatum?.startsWith(today().slice(0, 4))).length,
  med_klassificering: out.filter((x) => x.extra.klassificering).length,
  med_tempprognos: out.filter((x) => x.extra.vattentemp.prognos).length,
  med_avradan: out.filter((x) => x.extra.avradan.length).length,
  med_hav_sida: webbMatch,
  fel,
};
await writeJson(join(DATA, 'badplatser-rapport.json'), { uppdaterad: today(), ...stat });
console.log(JSON.stringify(stat, null, 2));
