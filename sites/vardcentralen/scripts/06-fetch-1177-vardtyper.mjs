// Hämtar fler vårdtyper ur 1177.se Hitta vård (samma sökning som 02-fetch-1177-lista.mjs) och
// räknar antal mottagningar per län och kommun. Används av de långa guidesidorna (MVC, BVC,
// provtagning, distriktssköterska, ungdomsmottagning, akutmottagning).
//   data/raw/1177-vardtyper.json  – alla träffar (HsaId, namn, adress, koordinat)
//   data/vardtyper.json           – sammanställning per vårdtyp, län och kommun
// Kommun bestäms med SCB:s kommungränser (punkt i polygon). Takt: högst 1 anrop/1,2 s.
import path from 'node:path';
import { RAW_DIR, DATA_DIR, politeFetch, writeJson, readJson, nowIso, wgs84ToSweref, pointInRings, distToRings } from './lib.mjs';
import { preloadedState, searchUrl } from './lib1177.mjs';

const TYPER = ['Akutmottagning', 'Barnmorskemottagning', 'Barnavårdscentral', 'Ungdomsmottagning', 'Provtagning', 'Distriktssköterskemottagning'];
const kommuner = readJson(path.join(RAW_DIR, 'scb-kommuner.json')).kommuner;
const kommunLan = Object.fromEntries(readJson(path.join(DATA_DIR, 'kommuner.json')).map((k) => [k.kommunkod, k.lan]));
const LAN_KOD = { '01': 'Stockholms län', '03': 'Uppsala län', '04': 'Södermanlands län', '05': 'Östergötlands län', '06': 'Jönköpings län', '07': 'Kronobergs län', '08': 'Kalmar län', '09': 'Gotlands län', '10': 'Blekinge län', '12': 'Skåne län', '13': 'Hallands län', '14': 'Västra Götalands län', '17': 'Värmlands län', '18': 'Örebro län', '19': 'Västmanlands län', '20': 'Dalarnas län', '21': 'Gävleborgs län', '22': 'Västernorrlands län', '23': 'Jämtlands län', '24': 'Västerbottens län', '25': 'Norrbottens län' };
const lanFor = (kod) => kommunLan[kod] ?? LAN_KOD[kod.slice(0, 2)];

function kommunFor(lat, lon) {
  if (lat == null || lon == null || (!lat && !lon)) return null;
  const { N, E } = wgs84ToSweref(lat, lon);
  for (const k of kommuner) { const [x0, y0, x1, y1] = k.bbox; if (E >= x0 && E <= x1 && N >= y0 && N <= y1 && pointInRings(E, N, k.rings)) return k; }
  let best = null, bd = Infinity; // kustnära punkter utanför polygonen: närmaste kommun inom 5 km
  for (const k of kommuner) { const d = distToRings(E, N, k.rings); if (d < bd) { bd = d; best = k; } }
  return bd < 5000 ? best : null;
}

const raw = { hamtad: nowIso(), kalla: 'https://www.1177.se/hitta-vard/', typer: {} };
const sammanst = { hamtad: raw.hamtad, kalla: '1177.se Hitta vård (Inera AB), sökning per vårdtyp i hela landet', typer: {} };
for (const typ of TYPER) {
  const hits = new Map(); let total = null;
  for (let page = 1; page < 60; page++) {
    const url = searchUrl(page, 100, typ);
    const r = await politeFetch(url, { minIntervalMs: 1200 });
    if (!r.ok) throw new Error(`HTTP ${r.status} för ${url}`);
    const res = preloadedState(await r.text()).Content.SearchResult;
    total = res.TotalHits;
    for (const h of res.SearchHits) hits.set(h.HsaId, h);
    if (!res.SearchHits.length || hits.size >= total || !res.NextPage) break;
  }
  if (hits.size < total * 0.98) throw new Error(`${typ}: bara ${hits.size} av ${total}`);
  const lista = [...hits.values()].map((h) => {
    const k = kommunFor(h.Latitude, h.Longitude);
    return { hsa: h.HsaId, namn: h.Heading, adress: h.Address, tel: h.PhoneNumber || null, lat: h.Latitude, lon: h.Longitude, url: h.Url, kommunkod: k?.kod ?? null, kommun: k?.namn ?? null, lan: k ? lanFor(k.kod) : null };
  });
  raw.typer[typ] = { totalHits: total, kalla: searchUrl(1, 100, typ), enheter: lista };
  const perLan = {}, perKommun = {};
  for (const e of lista) { if (!e.lan) continue; perLan[e.lan] = (perLan[e.lan] || 0) + 1; perKommun[e.kommunkod] = (perKommun[e.kommunkod] || 0) + 1; }
  sammanst.typer[typ] = { antal: lista.length, utanKommun: lista.filter((e) => !e.lan).length, perLan, perKommun };
  console.log(`${typ}: ${lista.length} (utan kommun: ${sammanst.typer[typ].utanKommun})`);
}
writeJson(path.join(RAW_DIR, '1177-vardtyper.json'), raw);
writeJson(path.join(DATA_DIR, 'vardtyper.json'), sammanst);
console.log('Klart');
