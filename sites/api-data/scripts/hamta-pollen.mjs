// Hämtar pollendata från Naturhistoriska riksmuseets öppna API (Pollenrapporten, "PLUPP Open Pollen API").
// Skriver data/pollen-regioner.json, pollen-typer.json, pollen-prognoser.json och pollen-matningar.json.
//
// Körning:  node scripts/hamta-pollen.mjs [--dagar N] [--sasongsexempel YYYY-MM-DD]
//   --dagar N                  antal dagar bakåt för uppmätta halter (pollen-count), standard 7
//   --sasongsexempel DATUM     hämta i stället ett arkivexempel (prognoser + mätningar för DATUM)
//                              till data/pollen-exempel-sasong.json, för att se hur data ser ut i säsong
//
// Docs: https://api.pollenrapporten.se/docs  (OpenAPI: https://api.pollenrapporten.se/openapi.json)
// Villkor: https://www.nrm.se/natur--och-miljoovervakning/pollenovervakning/pollenrapporten/anvanda-vara-oppna-data
//   Prognoser (text och värden) = CC BY-ND 4.0: får inte ändras, källa ska anges.
//   Övriga öppna data (t.ex. uppmätta halter) = CC BY-SA 4.0.
import { join } from 'node:path';
import { DATA, getJson, writeJson, today } from './lib.mjs';

const API = 'https://api.pollenrapporten.se/v1';
const KALLA = 'Palynologiska laboratoriet, Naturhistoriska riksmuseet';

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DAGAR = Number(argVal('--dagar') ?? 7);
const EXEMPEL = argVal('--sasongsexempel');

// Hämtar alla sidor av ett listendpoint (svar: { _meta, _links, items }).
async function getAll(path, params = {}) {
  const items = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const qs = new URLSearchParams({ ...params, offset: String(offset), limit: String(limit) });
    const d = await getJson(`${API}${path}?${qs}`);
    items.push(...(d.items ?? []));
    const total = d._meta?.totalRecords ?? items.length;
    offset += d._meta?.count ?? (d.items ?? []).length;
    if (!d.items?.length || offset >= total) break;
  }
  return items;
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const slug = (s) =>
  s.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --- Stabila referensdata ---------------------------------------------------------------
const [regionerRaw, typerRaw, nivaerRaw] = [
  await getAll('/regions'),
  await getAll('/pollen-types'),
  await getAll('/pollen-level-definitions'),
];

const nivaer = nivaerRaw.map((n) => ({ niva: n.level, namn: n.name })).sort((a, b) => a.niva - b.niva);
const nivaNamn = Object.fromEntries(nivaer.map((n) => [n.niva, n.namn]));

const regioner = regionerRaw
  .map((r) => ({
    id: r.id,
    namn: r.name,
    slug: slug(r.name),
    // "Sverige" är riksprognosen (riskprognos för hela landet), inte en mätstation.
    hela_landet: r.name === 'Sverige',
    lat: r.latitude != null ? Number(r.latitude) : null,
    lon: r.longitude != null ? Number(r.longitude) : null,
  }))
  .sort((a, b) => Number(a.hela_landet) - Number(b.hela_landet) || a.namn.localeCompare(b.namn, 'sv'));
const regionNamn = Object.fromEntries(regioner.map((r) => [r.id, r.namn]));

const typer = typerRaw.map((t) => ({
  id: t.id,
  namn: t.name,
  slug: slug(t.name),
  har_prognoser: t.hasForecasts,
  har_matningar: t.hasPollenCounts,
  // Övre gränsvärden (inklusive) för dygnsmedel pollenkorn/m³: <= lag = låga halter osv.
  gransvarden: { lag: t.thresholdLow, mattlig: t.thresholdMedium, hog: t.thresholdHigh, mycket_hog: t.thresholdVeryHigh },
}));
const typNamn = Object.fromEntries(typer.map((t) => [t.id, t.namn]));

function mapForecast(f) {
  // levelSeries -> per dag: { datum, nivaer: [{ pollen_id, pollen, niva, niva_text }] }
  const perDag = new Map();
  for (const s of f.levelSeries ?? []) {
    const datum = String(s.time).slice(0, 10);
    if (!perDag.has(datum)) perDag.set(datum, []);
    perDag.get(datum).push({ pollen_id: s.pollenId, pollen: typNamn[s.pollenId] ?? null, niva: s.level, niva_text: nivaNamn[s.level] ?? null });
  }
  return {
    id: f.id,
    region_id: f.regionId,
    region: regionNamn[f.regionId] ?? null,
    start: f.startDate,
    slut: f.endDate,
    sasongsslut: f.isEndOfSeason === true,
    // Prognostexten återges oförändrad (CC BY-ND 4.0 – får inte bearbetas).
    text: f.text ?? null,
    bilder: f.images ?? [],
    dagar: [...perDag.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([datum, n]) => ({ datum, nivaer: n })),
  };
}

function mapCount(c) {
  return {
    datum: String(c.date).slice(0, 10),
    region_id: c.regionId,
    region: regionNamn[c.regionId] ?? null,
    pollen_id: c.pollenId,
    pollen: typNamn[c.pollenId] ?? null,
    dygnsvarde: c.dailyCount ?? null,
    beskrivning: c.countDescription ?? null,
    tekniskt_fel: c.technicalError === true,
  };
}

const meta = (extra = {}) => ({
  hamtad: new Date().toISOString(),
  kalla: KALLA,
  api: API,
  ...extra,
});

if (EXEMPEL) {
  // Arkivexempel: senaste prognos som täcker EXEMPEL samt mätningar samma dag.
  const prognoser = (await getAll('/forecasts', { start_date: EXEMPEL, end_date: addDays(EXEMPEL, 1), current: 'true' })).map(mapForecast);
  const matningar = (await getAll('/pollen-count', { start_date: EXEMPEL, end_date: EXEMPEL })).map(mapCount);
  await writeJson(join(DATA, 'pollen-exempel-sasong.json'), {
    _meta: meta({ datum: EXEMPEL, licens_prognoser: 'CC BY-ND 4.0', licens_matningar: 'CC BY-SA 4.0' }),
    prognoser,
    matningar,
  });
  console.log(`Säsongsexempel ${EXEMPEL}: ${prognoser.length} prognoser, ${matningar.length} mätvärden`);
  process.exit(0);
}

const forecasts = (await getAll('/forecasts', { current: 'true' })).map(mapForecast);
const idag = today();
const fran = addDays(idag, -DAGAR);
const counts = (await getAll('/pollen-count', { start_date: fran, end_date: idag })).map(mapCount);

await writeJson(join(DATA, 'pollen-regioner.json'), regioner);
await writeJson(join(DATA, 'pollen-typer.json'), { typer, nivaer });
await writeJson(join(DATA, 'pollen-prognoser.json'), {
  _meta: meta({
    licens: 'CC BY-ND 4.0 (prognostext och nivåvärden får inte ändras)',
    aktiva_idag: forecasts.filter((f) => f.slut >= idag && !f.sasongsslut).length,
  }),
  prognoser: forecasts.sort((a, b) => (a.region ?? '').localeCompare(b.region ?? '', 'sv')),
});
await writeJson(join(DATA, 'pollen-matningar.json'), {
  _meta: meta({ licens: 'CC BY-SA 4.0', fran, till: idag }),
  matningar: counts.sort((a, b) => a.datum.localeCompare(b.datum) || (a.region ?? '').localeCompare(b.region ?? '', 'sv')),
});

console.log(
  JSON.stringify(
    {
      regioner: regioner.length,
      pollentyper: typer.length,
      nivaer: nivaer.length,
      prognoser: forecasts.length,
      prognoser_med_nivaer: forecasts.filter((f) => f.dagar.length).length,
      senaste_prognosslut: forecasts.map((f) => f.slut).sort().at(-1),
      matvarden: counts.length,
      matvarden_utan_tekniskt_fel: counts.filter((c) => !c.tekniskt_fel).length,
    },
    null,
    2,
  ),
);
