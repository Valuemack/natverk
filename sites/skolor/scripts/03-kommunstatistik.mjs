// Kommun-level official statistics from Skolverkets statistikdatabas (PxWeb API).
// Förskola: units, children, children per group, staff density, share of trained preschool
// teachers (split kommunal/enskild regi). Komvux/SFI: students, distance share, results.
// Output: data/kommunstatistik.json  { "<kommunkod>|00": { forskola:{...}, komvux:{...}, sfi:{...} } }
// NOTE: Skolverket publishes these per kommun (and per huvudman), NOT per förskoleenhet.
import { fetchJson, writeJson, loadKommuner, TODAY } from './lib.mjs';

const PX = 'https://statistikdatabasen.skolverket.se/PxWeb/api/v1/sv/Skolverkets_statistikdatabas';

const TABLES = {
  forskola_barn: {
    path: 'Kommunala_jamforelsetal/Forskola/Barn_och_grupper/Forskola_barn_grupper.px',
    group: 'forskola',
    measures: {
      'Förskoleenheter, antal i kommunal regi': 'forskoleenheter_kommunal',
      'Förskoleenheter, antal i enskild regi': 'forskoleenheter_enskild',
      'Barn, totalt antal inskrivna': 'barn_inskrivna',
      'Barn, andel (%) i enskild regi': 'andel_barn_enskild_regi',
      'Barn 1-5 år, andel (%) av befolkningen': 'andel_barn_1_5_inskrivna',
      'Barngrupper, totalt antal': 'barngrupper',
      'Barngrupper, antal barn per grupp': 'barn_per_grupp',
      'Barngrupper, antal barn per grupp, kommunal regi': 'barn_per_grupp_kommunal',
      'Barngrupper, antal barn per grupp, enskild regi': 'barn_per_grupp_enskild',
      'Barngrupper med barn 1-3 år, antal barn per grupp': 'barn_per_grupp_1_3_ar',
      'Barngrupper med barn 4-5 år, antal barn per grupp': 'barn_per_grupp_4_5_ar',
    },
  },
  forskola_personal: {
    path: 'Kommunala_jamforelsetal/Forskola/Personal/Forskola_personal.px',
    group: 'forskola',
    measures: {
      'Personaltäthet, antal barn per heltidstjänst': 'barn_per_heltidstjanst',
      'Personaltäthet, antal barn per heltidstjänst, kommunal regi': 'barn_per_heltidstjanst_kommunal',
      'Personaltäthet, antal barn per heltidstjänst, enskild regi': 'barn_per_heltidstjanst_enskild',
      'Anställda, andel (%) heltidstjänster med förskollärarexamen': 'andel_forskollarexamen',
      'Anställda, andel (%) heltidstjänster med förskollärarexamen, kommunal regi': 'andel_forskollarexamen_kommunal',
      'Anställda, andel (%) heltidstjänster med förskollärarexamen, enskild regi': 'andel_forskollarexamen_enskild',
      'Anställda, andel (%) heltidstjänster med förskollärlegitimation': 'andel_forskollarlegitimation',
      'Anställda, andel (%) heltidstjänster med pedagogisk högskoleexamen': 'andel_pedagogisk_hogskoleexamen',
    },
  },
  komvux: {
    path: 'Kommunala_jamforelsetal/Komvux/Elever_och_kursdeltagare/Komvux_grundlaggande_och_gymnasial/Komvux_grund_gymnasial_elever_kursdeltagare.px',
    group: 'komvux',
    measures: {
      'Elever, antal i grundläggande nivå': 'elever_grundlaggande',
      'Elever, antal i gymnasial nivå': 'elever_gymnasial',
      'Elever, andel (%) kvinnor i gymnasial nivå': 'andel_kvinnor_gymnasial',
      'Elever, andel (%) från annan kommun i gymnasial nivå': 'andel_fran_annan_kommun_gymnasial',
      'Kursdeltagare, andel (%) hos annan anordnare i grundläggande nivå': 'andel_annan_anordnare_grundlaggande',
      'Deltagare, andel (%) hos annan anordnare i gymnasial nivå': 'andel_annan_anordnare_gymnasial',
      'Kursdeltagare, andel (%) som läst kursen på distans i grundläggande nivå': 'andel_distans_grundlaggande',
      'Deltagare, andel (%) som läst nivån/kursen på distans i gymnasial nivå': 'andel_distans_gymnasial',
    },
  },
  sfi: {
    path: 'Kommunala_jamforelsetal/Komvux/Elever_och_kursdeltagare/Komvux_svenska_for_invandrare/Komvux_SFI_elever_kursdeltagare.px',
    group: 'sfi',
    measures: {
      'Elever, antal': 'elever',
      'Elever, andel (%) kvinnor': 'andel_kvinnor',
      'Kursdeltagare, antal': 'kursdeltagare',
      'Kursdeltagare, andel (%) hos annan anordnare': 'andel_annan_anordnare',
      'Kursdeltagare, andel (%) som läst kursen på distans': 'andel_distans',
    },
  },
  sfi_resultat: {
    path: 'Kommunala_jamforelsetal/Komvux/Betyg_och_studieresultat/Komvux_svenska_for_invandrare/Komvux_SFI_betyg_studieresultat.px',
    group: 'sfi',
    measures: {
      'Kursdeltagare som avslutat eller avbrutit kurs i huvudmannens skolor, antal': '_avslutat_eller_avbrutit',
      'Kursdeltagare, antal som avslutat kurs med godkänt betyg': '_godkant',
      'Kursdeltagare, antal som avbrutit kurs': '_avbrutit',
    },
  },
};

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

async function fetchTable(def) {
  const meta = await fetchJson(`${PX}/${def.path}`);
  const vVar = meta.variables.find((v) => v.code === 'variable');
  const tVar = meta.variables.find((v) => v.code === 'time');
  const lVar = meta.variables.find((v) => v.code === 'level');
  const codeToKey = {};
  for (const [text, key] of Object.entries(def.measures)) {
    const i = vVar.valueTexts.findIndex((t) => norm(t) === norm(text));
    if (i < 0) { console.warn(`  ! mått saknas: "${text}" i ${def.path}`); continue; }
    codeToKey[vVar.values[i]] = key;
  }
  const levels = lVar.values.filter((c) => /^\d{4}$/.test(c) || c === '00');
  const years = tVar.values.slice(-3); // latest 3 years, pick newest non-missing per measure
  const body = {
    query: [
      { code: 'variable', selection: { filter: 'item', values: Object.keys(codeToKey) } },
      { code: 'level', selection: { filter: 'item', values: levels } },
      { code: 'time', selection: { filter: 'item', values: years } },
    ],
    response: { format: 'json' },
  };
  const res = await fetchJson(`${PX}/${def.path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 180000,
  });
  // res.columns: variable, level, time, value(s); res.data: [{key:[v,l,t], values:[x]}]
  const out = {};
  for (const row of res.data) {
    const [v, l, t] = row.key;
    const raw = row.values[0];
    const num = raw == null || /^[.\-–]+$/.test(String(raw).trim()) ? null : Number(String(raw).replace(',', '.'));
    if (num == null || Number.isNaN(num)) continue;
    const key = codeToKey[v];
    out[l] ??= {};
    const prev = out[l][key];
    if (!prev || Number(t) > prev.ar) out[l][key] = { varde: num, ar: Number(t) };
  }
  return out;
}

console.log('03 kommunstatistik (Skolverket PxWeb)');
const { list: kommuner } = loadKommuner();
const result = {};
for (const k of [{ kommunkod: '00', namn: 'Riket' }, ...kommuner]) result[k.kommunkod] = { namn: k.namn, forskola: {}, komvux: {}, sfi: {} };

for (const [name, def] of Object.entries(TABLES)) {
  console.log('  tabell', name);
  const t = await fetchTable(def);
  for (const [kod, vals] of Object.entries(t)) {
    if (!result[kod]) continue;
    const g = result[kod][def.group];
    for (const [key, { varde, ar }] of Object.entries(vals)) {
      g[key] = varde;
      g._ar = Math.max(g._ar || 0, ar);
    }
  }
}

// derived SFI result shares, drop helper fields
for (const r of Object.values(result)) {
  const s = r.sfi;
  if (s._avslutat_eller_avbrutit > 0) {
    if (s._godkant != null) s.andel_godkanda_av_avslutade_eller_avbrutna = Math.round((1000 * s._godkant) / s._avslutat_eller_avbrutit) / 10;
    if (s._avbrutit != null) s.andel_avbrutna = Math.round((1000 * s._avbrutit) / s._avslutat_eller_avbrutit) / 10;
  }
  for (const k of Object.keys(s)) if (k.startsWith('_') && k !== '_ar') delete s[k];
  for (const g of ['forskola', 'komvux', 'sfi']) {
    if (r[g]._ar) { r[g].ar = r[g]._ar; delete r[g]._ar; }
    if (!Object.keys(r[g]).length) r[g] = null;
  }
}

writeJson('kommunstatistik.json', {
  kalla: {
    namn: 'Skolverkets statistikdatabas – Kommunala jämförelsetal',
    url: 'https://statistikdatabasen.skolverket.se/PxWeb/pxweb/sv/Skolverkets_statistikdatabas/',
    licens: 'Fri att använda (Skolverket öppna data); ange källa',
  },
  not: 'Värden avser hela kommunen (alla huvudmän eller kommunal/enskild regi enligt nyckelnamn), inte enskilda förskolor. Mätdatum 15 oktober respektive kalenderår.',
  uppdaterad: TODAY,
  kommuner: result,
});
