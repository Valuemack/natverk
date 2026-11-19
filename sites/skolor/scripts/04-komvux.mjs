// Builds data/komvux.json (komvux + SFI school units) and data/komvux_per_kommun.json.
// Sources (all Skolverket, free open data):
//   - Skolenhetsregistret API v2: units with skolform VUX (status AKTIV), detail per unit,
//     komvux-på-entreprenad contracts (kommun -> utbildningsanordnare -> skolenhet).
//   - Planned Educations API v4: count of planned komvux courses per kommun (Utbildningsguiden).
// Incremental: unit/contract details are cached in data/raw/ser/ and only refetched when
// SER reports them modified since the last run (meta_modified_after). --full forces refetch.
import fs from 'node:fs';
import path from 'node:path';
import { RAW, DATA, fetchJson, cachedJson, writeJson, loadKommuner, titleCase, cleanPhone, cleanUrl, officialEmail, assignSlugs, haversineKm, TODAY, argv } from './lib.mjs';

const SER = 'https://api.skolverket.se/skolenhetsregistret/v2';
const PE = 'https://api.skolverket.se/planned-educations/v4';
const PE_HEADERS = { Accept: 'application/vnd.skolverket.plannededucations.api.v4.hal+json' };
const SERDIR = path.join(RAW, 'ser');
fs.mkdirSync(path.join(SERDIR, 'units'), { recursive: true });
fs.mkdirSync(path.join(SERDIR, 'contracts'), { recursive: true });
const STATE = path.join(SERDIR, 'state.json');
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const full = argv.has('--full') || !state.lastFull || (Date.now() - Date.parse(state.lastFull)) / 86400000 > 7;
const runStart = new Date().toISOString().slice(0, 10);

const { byKod: kommunByKod } = loadKommuner();
console.log(`04 komvux (${full ? 'full' : 'incremental since ' + state.lastRun})`);

// ---- 1. list units + contracts
const unitList = (await fetchJson(`${SER}/school-units?school_type=VUX&status=AKTIV`)).data.attributes;
let modifiedUnits = new Set();
let modifiedContracts = new Set();
if (!full && state.lastRun) {
  const mu = (await fetchJson(`${SER}/school-units?school_type=VUX&meta_modified_after=${state.lastRun}`)).data.attributes || [];
  modifiedUnits = new Set(mu.map((u) => u.schoolUnitCode));
  const mc = (await fetchJson(`${SER}/contracts?meta_modified_after=${state.lastRun}`)).data.attributes || [];
  modifiedContracts = new Set(mc.map((c) => `${c.organizerOrganizationNumber}_${c.educationProviderCode}`));
}
const contractList = (await fetchJson(`${SER}/contracts`)).data.attributes.filter((c) => c.status === 'Aktiv');
console.log(`  ${unitList.length} aktiva VUX-enheter, ${contractList.length} aktiva entreprenadavtal`);

async function cachedDetail(file, url, mustRefresh) {
  if (!mustRefresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const j = await fetchJson(url);
  fs.writeFileSync(file, JSON.stringify(j));
  return j;
}

// ---- 2. unit details
const units = [];
let n = 0;
for (const u of unitList) {
  const code = u.schoolUnitCode;
  const file = path.join(SERDIR, 'units', `${code}.json`);
  units.push(await cachedDetail(file, `${SER}/school-units/${code}`, full || modifiedUnits.has(code)));
  if (++n % 50 === 0) process.stdout.write(`\r  enheter ${n}/${unitList.length}`);
}
process.stdout.write(`\r  enheter ${n}/${unitList.length}\n`);

// ---- 3. contract details (komvux på entreprenad)
const contracts = [];
n = 0;
for (const c of contractList) {
  const key = `${c.organizerOrganizationNumber}_${c.educationProviderCode}`;
  const file = path.join(SERDIR, 'contracts', `${key}.json`);
  try {
    contracts.push(await cachedDetail(file, `${SER}/contracts/${c.organizerOrganizationNumber}/${c.educationProviderCode}`, full || modifiedContracts.has(key)));
  } catch (e) {
    console.warn('  ! avtal', key, e.message);
  }
  if (++n % 50 === 0) process.stdout.write(`\r  avtal ${n}/${contractList.length}`);
}
process.stdout.write(`\r  avtal ${n}/${contractList.length}\n`);

// ---- 4. planned komvux courses per kommun (Utbildningsguiden), cached 6 days
const kurser = await (async () => {
  const file = path.join(RAW, 'pe_kurser_per_kommun.json');
  if (fs.existsSync(file) && !argv.has('--full') && (Date.now() - fs.statSync(file).mtimeMs) / 86400000 < 6)
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = {};
  let i = 0;
  for (const k of kommunByKod.values()) {
    const m = encodeURIComponent(k.namn);
    const cnt = async (q) => (await fetchJson(`${PE}/adult-education-events-count?municipality=${m}&${q}`, { headers: PE_HEADERS })).body;
    try {
      out[k.kommunkod] = {
        grundlaggande: await cnt('typeOfSchool=vuxgr'),
        gymnasial: await cnt('typeOfSchool=vuxgy'),
        distans: await cnt('typeOfSchool=vuxgr,vuxgy&distance=true'),
      };
    } catch (e) {
      console.warn('  ! kurser', k.namn, e.message);
    }
    if (++i % 20 === 0) process.stdout.write(`\r  kursräkning ${i}/290`);
  }
  process.stdout.write('\n');
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
})();

// ---- 5. transform
const PART = { VUXGR: 'grundläggande', VUXGY: 'gymnasial', VUXSFI: 'sfi', VUXGRAN: 'anpassad grundläggande', VUXGYAN: 'anpassad gymnasial' };
const isPersonnummerLike = (orgnr) => /^\d{10}$/.test(orgnr || '') && Number(orgnr[2]) < 2; // enskild firma = personnummer
const providerName = (c) => (isPersonnummerLike(c.educationProviderOrganizationNumber) ? null : titleCase(c.educationProviderName));

// ---- 4b. huvudman (organizer) details: which kommuner each huvudman serves (kommunalförbund!)
fs.mkdirSync(path.join(SERDIR, "organizers"), { recursive: true });
const orgNrs = new Set([...units.map((u) => u.included?.organizationNumber), ...contracts.map((c) => c.data.organizationNumber)].filter(Boolean));
const organizers = new Map();
n = 0;
for (const nr of orgNrs) {
  const file = path.join(SERDIR, "organizers", `${nr}.json`);
  try {
    const o = await cachedDetail(file, `${SER}/organizers/${nr}`, full);
    organizers.set(nr, o.data.attributes);
  } catch (e) { console.warn("  ! huvudman", nr, e.message); }
  if (++n % 50 === 0) process.stdout.write(`  huvudmän ${n}/${orgNrs.size}`);
}
process.stdout.write(`  huvudmän ${n}/${orgNrs.size}
`);
const orgKommuner = (nr) => (organizers.get(nr)?.municipalities || []).map((m) => m.municipalityCode).filter((k) => kommunByKod.has(k));

const contractsByUnit = new Map();
const contractsByOrg = new Map();
for (const c of contracts) {
  const a = c.data.attributes;
  const parts = (a.schoolTypeParts || []).map((p) => PART[p.schoolTypePart] || p.schoolTypePart);
  const unitCodes = (c.data.relationships?.schoolUnit?.data || []).map((s) => s.schoolUnitCode);
  const name = providerName({ educationProviderName: a.educationProviderName, educationProviderOrganizationNumber: a.educationProviderOrganizationNumber });
  const rec = { anordnare: name ?? "Enskild näringsidkare", anordnarkod: c.data.educationProviderCode, nivaer: parts };
  for (const uc of unitCodes) contractsByUnit.set(uc, [...(contractsByUnit.get(uc) || []), rec]);
  contractsByOrg.set(c.data.organizationNumber, [...(contractsByOrg.get(c.data.organizationNumber) || []), { ...rec, enheter: unitCodes.map((x) => "skv-" + x) }]);
}

const rows = [];
const skipped = [];
for (const u of units) {
  const a = u.data.attributes;
  const code = u.data.schoolUnitCode;
  const kk = a.municipalityCode;
  const kommun = kommunByKod.get(kk);
  if (!kommun) { skipped.push(`${code} ${a.displayName}: okänd kommunkod ${kk}`); continue; }
  if (a.schoolUnitType && a.schoolUnitType !== 'SKOLENHET') { skipped.push(`${code} ${a.displayName}: ${a.schoolUnitType}`); continue; }
  const addrs = a.addresses || [];
  const besok = addrs.find((x) => x.type === 'BESOKSADRESS') || addrs.find((x) => x.type === 'LEVERANSADRESS') || addrs.find((x) => x.type === 'POSTADRESS') || {};
  const geo = addrs.map((x) => x.geoCoordinates).find((g) => g && g.latitude);
  const parts = (a.schoolTypeProperties?.vux?.schoolTypeParts || []).map((p) => PART[p] || p);
  const org = u.included?.attributes || {};
  const huvudmanstyp = { KOMMUN: 'kommunal', KOMMFORB: 'kommunalförbund', REGION: 'region', STAT: 'statlig', ENSKILD: 'enskild' }[org.organizerType] || (org.organizerType ? org.organizerType.toLowerCase() : null);
  const sfiOnly = parts.length > 0 && parts.every((p) => p === 'sfi');
  const ec = contractsByUnit.get(code) || [];
  const street = besok.streetAddress && !/^box\s/i.test(besok.streetAddress) ? besok.streetAddress.trim() : null;
  rows.push({
    id: `skv-${code}`,
    namn: a.displayName.trim(),
    kedja: org.displayName ? titleCase(org.displayName) : null,
    typ: sfiOnly ? 'sfi' : 'komvux',
    gatuadress: street,
    postnummer: besok.postalCode ? besok.postalCode.replace(/\s/g, '').replace(/^(\d{3})(\d{2})$/, '$1 $2') : null,
    ort: titleCase(besok.locality) || kommun.namn,
    kommun: kommun.namn,
    kommunkod: kk,
    lan: kommun.lan,
    lat: geo ? Number(geo.latitude) : null,
    lon: geo ? Number(geo.longitude) : null,
    telefon: cleanPhone(a.phoneNumber),
    webb: cleanUrl(a.url),
    epost: officialEmail(a.email, [a.headMaster]),
    oppettider: null,
    extra: {
      skolenhetskod: code,
      huvudmanstyp,
      huvudman_orgnr: u.included?.organizationNumber && !isPersonnummerLike(u.included.organizationNumber) ? u.included.organizationNumber : null,
      skolnamn: a.schoolName && a.schoolName !== a.displayName ? a.schoolName : null,
      nivaer: parts,
      sfi: parts.includes('sfi'),
      grundlaggande: parts.includes('grundläggande'),
      gymnasial: parts.includes('gymnasial'),
      anpassad: parts.some((p) => p.startsWith('anpassad')),
      egen_regi: typeof a.municipalAdultEducationProvidedInternally === 'boolean' ? a.municipalAdultEducationProvidedInternally : null,
      entreprenad_anordnare: ec.length ? ec : null,
      ovriga_skolformer: (a.schoolTypes || []).filter((t) => t !== 'VUX'),
      startdatum: a.startdate || null,
      huvudman_kommuner: (() => { const ks = orgKommuner(u.included?.organizationNumber); return ks.length > 1 || (ks.length === 1 && ks[0] !== kk) ? ks.map((x) => kommunByKod.get(x).namn) : null; })(),
      kalla_andrad: u.meta?.modified || null,
    },
    kallor: [
      { namn: 'Skolverket – Skolenhetsregistret', url: `${SER}/school-units/${code}`, licens: 'Öppna data, fri användning (Skolverket)' },
      ...(ec.length ? [{ namn: 'Skolverket – Skolenhetsregistret (entreprenadavtal)', url: `${SER}/contracts`, licens: 'Öppna data, fri användning (Skolverket)' }] : []),
    ],
    uppdaterad: TODAY,
  });
}
if (skipped.length) console.warn('  överhoppade:', skipped);
rows.sort((x, y) => x.kommunkod.localeCompare(y.kommunkod) || x.namn.localeCompare(y.namn, 'sv'));
assignSlugs(rows);
writeJson('komvux.json', rows);

// ---- 6. per kommun: which units serve the kommun (located there, run by its huvudman incl.
// kommunalförbund, or contracted providers) + planned courses in Utbildningsguiden.
const perKommun = {};
for (const k of kommunByKod.values()) perKommun[k.kommunkod] = { kommun: k.namn, slug: k.slug, enheter_i_kommunen: [], enheter_via_huvudman: [], huvudman: [], entreprenad_anordnare: [], planerade_kurser_utbildningsguiden: null };
for (const r of rows) perKommun[r.kommunkod].enheter_i_kommunen.push(r.id);
for (const [nr, o] of organizers) {
  for (const kk of orgKommuner(nr)) {
    const pk = perKommun[kk];
    const typ = { KOMMUN: "kommunal", KOMMFORB: "kommunalförbund", REGION: "region" }[o.organizerType] || (o.organizerType || "").toLowerCase();
    if (!["kommunal", "kommunalförbund", "region"].includes(typ)) continue;
    const egna = rows.filter((r) => r.extra.huvudman_orgnr === nr).map((r) => r.id);
    if (!egna.length && !contractsByOrg.has(nr)) continue;
    pk.huvudman.push({ namn: titleCase(o.displayName), orgnr: nr, typ });
    for (const id of egna) if (!pk.enheter_i_kommunen.includes(id) && !pk.enheter_via_huvudman.includes(id)) pk.enheter_via_huvudman.push(id);
    for (const c of contractsByOrg.get(nr) || []) if (!pk.entreprenad_anordnare.find((x) => x.anordnarkod === c.anordnarkod)) pk.entreprenad_anordnare.push(c);
  }
}
for (const [kk, x] of Object.entries(kurser)) {
  if (perKommun[kk] && (x.grundlaggande || x.gymnasial)) perKommun[kk].planerade_kurser_utbildningsguiden = x;
}
// nearest units from the kommun's largest tätort (SCB 2023) – fallback for kommuner that buy
// komvux through samverkansavtal, which Skolenhetsregistret does not record.
const tat = JSON.parse(fs.readFileSync(path.join(RAW, "geo", "tatorter_2023.json"), "utf8")).features;
const centrum = {};
for (const f of tat) {
  const k = f.properties.kommun;
  if (!centrum[k] || f.properties.bef > centrum[k].bef) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let sx = 0, sy = 0, cnt = 0;
    for (const p of polys) for (const [x, y] of p[0]) { sx += x; sy += y; cnt++; }
    centrum[k] = { namn: f.properties.tatort, bef: f.properties.bef, lat: sy / cnt, lon: sx / cnt };
  }
}
for (const [kk, pk] of Object.entries(perKommun)) {
  pk.entreprenad_anordnare.sort((a, b) => a.anordnare.localeCompare(b.anordnare, "sv"));
  pk.status = pk.enheter_i_kommunen.length ? "enhet i kommunen" : pk.enheter_via_huvudman.length ? "via kommunalförbund/huvudman" : pk.entreprenad_anordnare.length ? "entreprenad" : "ingen registrerad enhet (troligen samverkansavtal med annan kommun)";
  const c = centrum[kk];
  pk.centralort = c ? c.namn : null;
  pk.narmaste_enheter = c ? rows.map((r) => ({ id: r.id, km: Math.round(haversineKm(c.lat, c.lon, r.lat, r.lon) * 10) / 10, sfi: r.extra.sfi })).sort((a, b) => a.km - b.km).slice(0, 5) : [];
}
const utan = Object.values(perKommun).filter((p) => !p.enheter_i_kommunen.length && !p.enheter_via_huvudman.length && !p.entreprenad_anordnare.length).map((p) => p.kommun);
if (utan.length) console.warn("  kommuner utan känd komvux-koppling:", utan.join(", "));
writeJson("komvux_per_kommun.json", {
  uppdaterad: TODAY,
  kallor: [`${SER}/school-units`, `${SER}/organizers`, `${SER}/contracts`, `${PE}/adult-education-events-count`],
  not: "planerade_kurser_utbildningsguiden = antal kurstillfällen kommunen publicerat i Utbildningsguiden (municipality-filter). Många kommuner publicerar inget (då null); i Stockholmsregionen ingår regionalt samverkansutbud, så siffran är inte jämförbar mellan kommuner.",
  kommuner: perKommun,
});
const stale = path.join(DATA, "komvux_entreprenad.json");
if (fs.existsSync(stale)) fs.unlinkSync(stale);

state.lastRun = runStart;
if (full) state.lastFull = runStart;
fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
