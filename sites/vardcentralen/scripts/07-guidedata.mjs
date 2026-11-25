// Sammanställer data per län för de långa guidesidorna (ingen nätverkstrafik – bara redan hämtade råfiler).
//   in:  data/raw/1177-narakut.json, 1177-jour.json, 1177-vardtyper.json, 1177-kort/*.json, vardbetyg-vardcentraler.csv
//   ut:  data/guidedata.json
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, DATA_DIR, writeJson, readJson, parseCsv, wgs84ToSweref, pointInRings, distToRings } from './lib.mjs';

const kommuner = readJson(path.join(RAW_DIR, 'scb-kommuner.json')).kommuner;
const kommunLan = Object.fromEntries(readJson(path.join(DATA_DIR, 'kommuner.json')).map((k) => [k.kommunkod, k.lan]));
const LAN_KOD = { '01': 'Stockholms län', '03': 'Uppsala län', '04': 'Södermanlands län', '05': 'Östergötlands län', '06': 'Jönköpings län', '07': 'Kronobergs län', '08': 'Kalmar län', '09': 'Gotlands län', '10': 'Blekinge län', '12': 'Skåne län', '13': 'Hallands län', '14': 'Västra Götalands län', '17': 'Värmlands län', '18': 'Örebro län', '19': 'Västmanlands län', '20': 'Dalarnas län', '21': 'Gävleborgs län', '22': 'Västernorrlands län', '23': 'Jämtlands län', '24': 'Västerbottens län', '25': 'Norrbottens län' };
function kommunFor(lat, lon) {
  if (!lat || !lon) return null;
  const { N, E } = wgs84ToSweref(lat, lon);
  for (const k of kommuner) { const [x0, y0, x1, y1] = k.bbox; if (E >= x0 && E <= x1 && N >= y0 && N <= y1 && pointInRings(E, N, k.rings)) return k; }
  let best = null, bd = Infinity;
  for (const k of kommuner) { const d = distToRings(E, N, k.rings); if (d < bd) { bd = d; best = k; } }
  return bd < 5000 ? best : null;
}
const lanFor = (k) => (k ? kommunLan[k.kod] ?? LAN_KOD[k.kod.slice(0, 2)] : null);
const raknaLan = (lista) => { const o = {}; for (const e of lista) if (e.lan) o[e.lan] = (o[e.lan] || 0) + 1; return o; };
// Reserv för enheter utan koordinater: ort eller kommunnamn i namnet/adressen (via katalogens orter).
const ortKommun = new Map();
for (const e of readJson(path.join(DATA_DIR, 'enheter.json'))) { if (e.ort) ortKommun.set(e.ort.toLowerCase(), e.extra?.kommunkod); ortKommun.set(e.kommun.toLowerCase(), e.extra?.kommunkod); }
function kommunFranText(...t) {
  const ord = t.join(' ').toLowerCase().split(/[^a-zåäöé]+/);
  for (const w of ord) { const kod = ortKommun.get(w); if (kod) return kommuner.find((k) => k.kod === kod) ?? null; }
  return null;
}
const placera = (h) => { const k = kommunFor(h.Latitude ?? h.lat, h.Longitude ?? h.lon) ?? kommunFranText(h.Heading ?? h.namn ?? '', h.Address ?? h.adress ?? ''); return { namn: h.Heading ?? h.namn, kommun: k?.namn ?? null, lan: lanFor(k), hsa: h.HsaId ?? h.hsa }; };

// Närakut och jourmottagning (1177-vårdtyper), sammanslaget utan dubbletter.
const nar = readJson(path.join(RAW_DIR, '1177-narakut.json'));
const jour = readJson(path.join(RAW_DIR, '1177-jour.json'));
const narP = nar.enheter.map(placera), jourP = jour.enheter.map(placera);
const narHsa = new Set(narP.map((e) => e.hsa));
const akutUnion = [...narP, ...jourP.filter((e) => !narHsa.has(e.hsa))];
// Sjukhusens akutmottagningar: vårdtypen "Akutmottagning" innehåller även vårdavdelningar, så vi tar bara
// enheter som heter akutmottagning/akuten (inte avdelningar, ögon-, barn- eller gravidakuter).
const vt = readJson(path.join(RAW_DIR, '1177-vardtyper.json'));
const akutSjh = vt.typer.Akutmottagning.enheter
  .filter((e) => /^(akutmottagning|akuten)/i.test(e.namn) && !/gravid|barn|ögon/i.test(e.namn) && e.lan)
  .map((e) => ({ namn: e.namn, kommun: e.kommun, lan: e.lan }));

// E-tjänster och texter i vårdcentralernas kontaktkort på 1177.
const KORT = path.join(RAW_DIR, '1177-kort');
const enheter = readJson(path.join(DATA_DIR, 'enheter.json'));
const hsaLan = Object.fromEntries(enheter.map((e) => [e.extra?.hsa_id, e.lan]).filter(([h]) => h));
const T = {
  recept: /förnya.*recept|recept.*förny/i,
  intyg: /intyg/i,
  sjukskrivning: /sjukskrivning|sjukintyg/i,
  klagomal: /synpunkt|klagomål/i,
  provBoka: /provtagning|blodprov/i,
  vaccinBoka: /vaccin/i,
  cellprov: /cellprov/i,
  preventivmedel: /preventiv/i,
};
const kortLan = {};
// Vilka slags förnyelser som erbjuds som e-tjänst (antal vårdcentraler i hela landet).
const RECEPT_TYP = { hjalpmedel: /förnya.*hjälpmedel/i, preventivmedel: /förnya.*preventiv/i, glutenfritt: /förnya.*gluten/i, nutrition: /förnya.*nutrition/i };
const receptTyper = Object.fromEntries(Object.keys(RECEPT_TYP).map((k) => [k, 0]));
for (const f of fs.readdirSync(KORT)) {
  const c = readJson(path.join(KORT, f)).card;
  const lan = hsaLan[c.HsaId] ?? (c.County ? (c.County.endsWith('län') ? c.County : `${c.County} län`) : null);
  if (!lan || !Object.values(LAN_KOD).includes(lan)) continue;
  const es = (c._flags?.eServiceNames ?? []).join(' | ');
  const text = JSON.stringify([c.TemporaryInformation, c.PatientInformation, c.PracticalInformation]);
  const r = (kortLan[lan] ??= { kort: 0, eTjanst: 0, listningsko: 0, influensaText: 0, tbeText: 0, ...Object.fromEntries(Object.keys(T).map((k) => [k, 0])) });
  r.kort++;
  if (es) r.eTjanst++;
  for (const [k, re] of Object.entries(T)) if (re.test(es)) r[k]++;
  for (const [k, re] of Object.entries(RECEPT_TYP)) if (re.test(es)) receptTyper[k]++;
  if (c.UnitListingRelation?.HasListingQueue) r.listningsko++;
  if (/influensa/i.test(text) || /influensa/i.test(es)) r.influensaText++;
  if (/\btbe\b/i.test(text) || /\btbe\b/i.test(es)) r.tbeText++;
}

// Nationell patientenkät via Vårdbetyg (CC BY 4.0): snitt per region för dimensionen Tillgänglighet.
const vb = parseCsv(fs.readFileSync(path.join(RAW_DIR, 'vardbetyg-vardcentraler.csv'), 'utf8'));
const vbLan = {};
for (const r of vb) {
  const lan = LAN_KOD[String(r.lan_kod).padStart(2, '0')];
  const t = parseFloat(r['dim:Tillgänglighet']);
  if (!lan || !Number.isFinite(t)) continue;
  const o = (vbLan[lan] ??= { n: 0, summa: 0, svar: 0, period: r.measurement_period });
  o.n++; o.summa += t; o.svar += parseInt(r.answered, 10) || 0;
}
for (const o of Object.values(vbLan)) { o.tillganglighet = Math.round((o.summa / o.n) * 10) / 10; delete o.summa; }

const ut = {
  skapad: new Date().toISOString().slice(0, 10),
  hamtat: { narakut: nar.hamtad.slice(0, 10), jour: jour.hamtad.slice(0, 10), vardtyper: vt.hamtad.slice(0, 10) },
  narakut: { antal: narP.length, perLan: raknaLan(narP) },
  jour: { antal: jourP.length, perLan: raknaLan(jourP) },
  narakutEllerJour: { antal: akutUnion.length, perLan: raknaLan(akutUnion), lista: akutUnion.map((e) => ({ namn: e.namn, kommun: e.kommun, lan: e.lan, narakut: narHsa.has(e.hsa) })) },
  akutSjukhus: { antal: akutSjh.length, perLan: raknaLan(akutSjh), lista: akutSjh },
  kort: kortLan,
  receptTyper,
  vardbetyg: vbLan,
};
writeJson(path.join(DATA_DIR, 'guidedata.json'), ut);
console.log(JSON.stringify({ narakut: ut.narakut.antal, jour: ut.jour.antal, union: ut.narakutEllerJour.antal, akut: ut.akutSjukhus.antal, kortLan: Object.keys(kortLan).length, vb: Object.keys(vbLan).length }));
console.log(JSON.stringify(kortLan['Stockholms län']), JSON.stringify(vbLan['Stockholms län']));
