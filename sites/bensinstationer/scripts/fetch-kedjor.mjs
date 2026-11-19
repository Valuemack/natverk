// Hämtar stationsfakta från kedjornas publika stationssök. Skriver data/raw/<kalla>.json.
//   node scripts/fetch-kedjor.mjs                 # alla kedjor
//   node scripts/fetch-kedjor.mjs circlek okq8    # urval
// Regler: robots.txt kollas (inkl. AI-crawler-block), max 1 anrop/s per domän, generisk User-Agent,
// bara fakta (inga texter/bilder), ingen kringgång av inloggning/CAPTCHA/bot-skydd.
import path from 'node:path';
import { politeGet, cachedGet, runFetcher, robotsSummary, writeJSON, readJSON, RAW, nowIso, CACHE, titleCase, normPostnr, normPhone, toNum, weekShape, span, allDay, isAlwaysOpen, DAYS, emptyDrivmedel, emptyTjanster, log } from './lib.mjs';

const DETAIL_MAX_AGE_H = Number(process.env.DETAIL_MAX_AGE_H || 144); // detaljsidor återanvänds i 6 dygn

const base = (kalla, id) => ({ kalla, kalla_id: String(id), drivmedel: emptyDrivmedel(), tjanster: emptyTjanster(), priser: null, kalla_extra: {} });
const setTrue = (obj, keys) => { for (const k of keys) obj[k] = true; };

// ======================================================================= Circle K + INGO + Circle K Truck
// Stationssöket (www.circlek.se/station-search) bäddar in alla stationer i Drupal-inställningarna.
const CK_FUEL = {
  EU_MILES_95: 'bensin95', EU_BENZIN_95: 'bensin95', EU_MILESPLUS_98: 'bensin98', EU_BENZIN_98: 'bensin98', EU_MILES_98: 'bensin98',
  EU_MILES_DIESEL: 'diesel', EU_MILESPLUS_DIESEL: 'diesel', EU_DIESEL: 'diesel', EU_HVO100: 'hvo100', EU_E85: 'e85',
  EU_CNG: 'biogas', EU_EV_CHARGER: 'el', EU_ADBLUE: 'adblue', EU_B100: 'b100',
};
const CK_SVC = {
  EU_CARWASH: 'biltvatt', EU_CARWASH_JETWASH: 'biltvatt', EU_TOILETS_BOTH: 'toalett', EU_HIGH_SPEED_CHARGER: 'laddning', EU_EV_TRUCK_CHARGER: 'laddning_lastbil',
  EU_TRUCKDIESEL_NETWORK: 'truckdiesel', EU_ADBLUE_SERVICE: 'adblue', EU_PIZZA_HUT: 'mat', EU_GAS: 'gasol', EU_TRAILER_RENTAL: 'slaputhyrning',
  EU_CAR_RENTAL: 'biluthyrning', EU_SHOWER: 'dusch', EU_TRUCK_PARKING: 'lastbilsparkering', EU_POSTAL_SERVICE: 'postombud', EU_ATM: 'bankomat',
  EU_VACUUM_CLEANER: 'dammsugare', EU_SERVICE_ZONE: 'luft_vatten', EU_BABY_CHANGING: 'skotbord', EU_LOUNGE: 'sittplatser', EU_KFREEZE: 'kaffe_dryck',
};
const ckWeek = (o) => o && (o.weekdays || o.saturday || o.sunday) ? weekShape(o.weekdays, o.saturday, o.sunday) : null;
async function circlek() {
  const html = await politeGet('https://www.circlek.se/station-search', { timeoutMs: 90000 });
  const m = html.match(/data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/) || html.match(/drupal-settings-json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Hittade inte drupal-settings-json');
  const res = JSON.parse(m[1]).ck_sim_search?.station_results;
  if (!res) throw new Error('ck_sim_search.station_results saknas');
  const out = []; let skipped = 0;
  for (const r of Object.values(res)) {
    const site = r['/sites/{siteId}'] || {}, bi = r['/sites/{siteId}/business-info'] || {};
    const adr = r['/sites/{siteId}/addresses']?.PHYSICAL || {}, loc = r['/sites/{siteId}/location'] || {};
    const oi = r['/sites/{siteId}/opening-info'] || {}, ph = r['/sites/{siteId}/contact-details']?.phones || {};
    if (site.status && site.status !== 'Active') { skipped++; continue; }
    if (site.siteType !== 'ST' || /carwash \(only\)/i.test(bi.stationFormat || '')) { skipped++; continue; } // laddplatser/tvätt-only
    const s = base('circlek', site.id);
    s.kedja = site.brand === 'INGO' ? 'Ingo' : 'Circle K';
    s.namn_kalla = titleCase(site.name);
    s.typ = site.brand === 'TRUCK' ? 'truckstation' : /automat/i.test(bi.stationFormat || '') ? 'obemannad' : 'bemannad';
    s.gatuadress = adr.street || null; s.postnummer = normPostnr(adr.postalCode); s.ort = titleCase(adr.city) || null; s.lan_kalla = adr.county || null;
    s.lat = toNum(loc.lat); s.lon = toNum(loc.lng);
    s.telefon = normPhone(ph.WOR || ph.OFF);
    s.webb = null;
    const station = oi.alwaysOpen ? allDay() : ckWeek(oi.openingTimes);
    s.oppettider_butik = ckWeek(oi.openingTimesStore);
    s.oppettider_pumpar = oi.alwaysOpen ? allDay() : ckWeek(oi.openingTimesFuel) || (s.typ !== 'bemannad' ? station : null);
    s.oppettider = s.typ === 'bemannad' ? (s.oppettider_butik || station) : (s.oppettider_pumpar || station);
    for (const f of r['/sites/{siteId}/fuels'] || []) { const k = CK_FUEL[f.name]; if (k) s.drivmedel[k] = true; }
    for (const f of r['/sites/{siteId}/services'] || []) { if (f.state && f.state !== 'ENABLED') continue; const k = CK_SVC[f.name]; if (k) s.tjanster[k] = true; }
    if (s.drivmedel.el) s.tjanster.laddning = true;
    if (s.drivmedel.adblue) s.tjanster.adblue = true;
    if (site.brand === 'TRUCK') s.tjanster.truckdiesel = true;
    s.tjanster.butik = s.typ === 'bemannad';
    s.kalla_extra = { format: bi.stationFormat || null, varumarke: site.brand, tillfalligt_stangd: (oi.temporarilyClosed || []).length > 0 || undefined };
    if (s.lat == null || s.lon == null) { skipped++; continue; }
    out.push(s);
  }
  return { url: 'https://www.circlek.se/station-search', stationer: out, overhoppade: skipped };
}

// ======================================================================= OKQ8 + Tanka + IDS
// /hitta-station/ bäddar in alla stationer i window.__APP_INIT_DATA__.currentPage.stations.
const OK_FUEL = {
  FUEL_GO_EASY_95: 'bensin95', FUEL_GO_EASY_98_EXTRA: 'bensin98', FUEL_GO_EASY_DIESEL: 'diesel', FUEL_GO_EASY_DIESEL_EXTRA: 'diesel', FUEL_GO_EASY_DIESEL_HIGH_SPEED: 'diesel',
  FUEL_DIESEL_BIO_HVO_100: 'hvo100', FUEL_ETANOL_E_85: 'e85', FUEL_VEHICLE_GAS: 'biogas', FUEL_AD_BLUE_CAR: 'adblue', FUEL_AD_BLUE_TRUCK: 'adblue', FUEL_AD_BLUE_DUNK: 'adblue',
  FUEL_ALKYLATE_2_T: 'alkylat', FUEL_ALKYLATE_4_T: 'alkylat',
};
const OK_SVC = {
  CAR_WASH: 'biltvatt', CAR_WASH_24H: 'biltvatt', CAR_WASH_DIY: 'biltvatt', CAR_WASH_QUICK_WASH: 'biltvatt',
  FOOD_BAKERY: 'mat', FOOD_HAMBURGER: 'mat', FOOD_SANDWITCH_AND_SALADS: 'mat', FOOD_SAUSAGE: 'mat', FOOD_STARBUCKS: 'kaffe_dryck', FOOD_COFFE: 'kaffe_dryck',
  SERVICE_LPG: 'gasol', TRAILER_GENERAL_RENTAL: 'slaputhyrning', TRAILER_TOWING_CAR_RENTAL: 'slaputhyrning', TRAILER_BOAT_RENTAL: 'slaputhyrning',
  CAR_RENTAL: 'biluthyrning', CAR_RIDECELL_RENTAL: 'biluthyrning', TRUCK_RENTAL: 'biluthyrning', MINIBUS_RENTAL: 'biluthyrning',
  SERVICE_AUTO_REPAIR: 'verkstad', SERVICE_CAR_LIFT: 'verkstad', SERVICE_MEDICINE: 'receptfria_lakemedel', SERVICE_DHL: 'postombud',
  SERVICE_TRUCKCENTER: 'truckdiesel', FUEL_AD_BLUE_TRUCK: 'truckdiesel', FUEL_GO_EASY_DIESEL_HIGH_SPEED: 'truckdiesel', STATION_FUEL_BOAT: 'batmack',
};
async function okq8() {
  const html = await politeGet('https://www.okq8.se/hitta-station/', { timeoutMs: 90000 });
  const i = html.indexOf('window.__APP_INIT_DATA__ = ');
  if (i < 0) throw new Error('__APP_INIT_DATA__ saknas');
  const j = html.indexOf('</script>', i);
  const d = JSON.parse(html.slice(i + 27, j).trim().replace(/;\s*$/, ''));
  const st = d.currentPage?.stations;
  if (!Array.isArray(st) || st.length < 100) throw new Error('för få stationer i OKQ8-data');
  const NET = { OKQ8: 'OKQ8', TANKA: 'Tanka', IDS: 'IDS', EON: 'E.ON' };
  const out = [];
  for (const x of st) {
    const s = base('okq8', x.id);
    s.kedja = NET[x.network] || titleCase(x.network) || 'OKQ8';
    s.namn_kalla = x.name;
    const tags = new Set((x.allServices || []).map((t) => t.specificTag));
    s.typ = x.network === 'IDS' ? 'truckstation' : x.stationType === 'MANNED' ? 'bemannad' : 'obemannad';
    s.gatuadress = x.street || null; s.postnummer = normPostnr(x.postalCode); s.ort = titleCase(x.city) || null; s.lan_kalla = x.region || null;
    s.lat = toNum(x.latitude); s.lon = toNum(x.longitude);
    s.telefon = normPhone((x.phoneNumbers || []).map((p) => (typeof p === 'string' ? p : p.number || p.phoneNumber)).find(Boolean));
    s.webb = x.stationPageUrl ? 'https://www.okq8.se' + x.stationPageUrl.replace(/\/?$/, '/') : null;
    let oh = weekShape(x.openHoursWeekday, x.openHoursSaturday, x.openHoursSunday);
    if (tags.has('STATION_ALWAYS_OPEN')) oh = allDay();
    s.oppettider = oh;
    if (s.typ === 'bemannad') s.oppettider_butik = oh; else s.oppettider_pumpar = oh;
    for (const t of tags) { const k = OK_FUEL[t]; if (k) s.drivmedel[k] = true; const v = OK_SVC[t]; if (v) s.tjanster[v] = true; if (/^CHARGE_/.test(t) && t !== 'CHARGE_WITH_APP') { s.drivmedel.el = true; s.tjanster.laddning = true; } }
    if (s.drivmedel.adblue) s.tjanster.adblue = true;
    if (x.network === 'IDS') s.tjanster.truckdiesel = true;
    s.tjanster.butik = x.stationType === 'MANNED';
    s.kalla_extra = { minipris: tags.has('STATION_MINIPRIS') || undefined, tillfalliga_tider: (x.temporaryHours || []).length > 0 || undefined };
    if (s.lat == null) continue;
    out.push(s);
  }
  return { url: 'https://www.okq8.se/hitta-station/', stationer: out };
}

// ======================================================================= Preem + Såifa
// Gatsby: /page-data/stationer/page-data.json (lista) + /page-data/stationer/<slug>/page-data.json (detalj, cache 6 dygn).
function preemHours(o) {
  if (!o) return null;
  return weekShape(
    o.openingHourWeekday || o.closeHourWeekday ? { open: o.openingHourWeekday, close: o.closeHourWeekday } : null,
    o.openingHourSaturday || o.closeHourSaturday ? { open: o.openingHourSaturday, close: o.closeHourSaturday } : null,
    o.openingHourSunday || o.closeHourSunday ? { open: o.openingHourSunday, close: o.closeHourSunday } : null,
  );
}
function preemFuel(name, s) {
  const n = name.toLowerCase();
  if (/95/.test(n)) s.drivmedel.bensin95 = true;
  else if (/98/.test(n)) s.drivmedel.bensin98 = true;
  else if (/hvo/.test(n)) s.drivmedel.hvo100 = true;
  else if (/diesel/.test(n)) s.drivmedel.diesel = true;
  else if (/e85|etanol/.test(n)) s.drivmedel.e85 = true;
  else if (/lng|naturgas/.test(n) && !/biogas|cng/.test(n)) s.drivmedel.lng = true;
  else if (/gas|cbg|lbg|biogas|cng/.test(n)) s.drivmedel.biogas = true;
  else if (/adblue/.test(n)) { s.drivmedel.adblue = true; s.tjanster.adblue = true; }
  else if (/alkylat|aspen/.test(n)) s.drivmedel.alkylat = true;
  else if (/bensin/.test(n)) s.drivmedel.bensin95 = true;
}
function preemService(name, s) {
  const n = name.toLowerCase();
  if (/tv(ä|a)tt|wash/.test(n)) s.tjanster.biltvatt = true;
  if (/toalett|wc|toilet/.test(n)) s.tjanster.toalett = true;
  if (/mat|food|korv|lunch|kafe|café|kaffe|bakverk|burger/.test(n)) s.tjanster.mat = true;
  if (/butik|shop|store/.test(n)) s.tjanster.butik = true;
  if (/carrental|biluthyr/.test(n)) s.tjanster.biluthyrning = true;
  if (/24m/.test(n)) { s.kalla_extra.max_fordonslangd_m = 24; if (s.drivmedel.diesel) s.tjanster.truckdiesel = true; }
  if (/sl(ä|a)p/.test(n)) s.tjanster.slaputhyrning = true;
  if (/gasol/.test(n)) s.tjanster.gasol = true;
  if (/ladd|charg/.test(n)) s.tjanster.laddning = true;
  if (/adblue/.test(n)) s.tjanster.adblue = true;
  if (/truck|lastbil|tung/.test(n)) s.tjanster.truckdiesel = true;
  if (/dusch|shower/.test(n)) s.tjanster.dusch = true;
}
async function preem() {
  const list = await politeGet('https://www.preem.se/page-data/stationer/page-data.json', { as: 'json' });
  const nodes = list.result?.data?.allDatoCmsStationPage?.nodes || [];
  if (nodes.length < 100) throw new Error('för få Preem-stationer i listan');
  const out = []; const fuelNames = {}, svcNames = {}, typeNames = {}; let fel = 0;
  for (const n of nodes) {
    const sl = n.page?.slug; if (!sl) continue;
    let d;
    try {
      d = await cachedGet(`https://www.preem.se/page-data${sl.replace(/\/$/, '')}/page-data.json`, path.join(CACHE, 'preem', sl.split('/').pop() + '.json'), { maxAgeH: DETAIL_MAX_AGE_H, as: 'json' });
    } catch (e) { if (e.name === 'BlockedError') throw e; fel++; continue; }
    const x = d.result?.data?.datoCmsStationPage; if (!x) { fel++; continue; }
    const s = base('preem', x.stationCode || x.id);
    if (/kundanl/i.test(x.chain || '')) continue; // kundanläggningar = ej publika
    const isSaifa = x.icon === 'SÅIFA' || /^1[4-7]\s*Såifa/i.test(x.stationConcept || '');
    s.kedja = x.chain && x.chain !== 'Preem' ? x.chain : isSaifa ? 'Såifa' : 'Preem';
    s.namn_kalla = x.stationName;
    const typ = String(x.stationType || '').toLowerCase();
    typeNames[x.stationType] = (typeNames[x.stationType] || 0) + 1;
    s.typ = /truck/.test(typ) ? 'truckstation' : /automat|obemann|unmanned/.test(typ) ? 'obemannad' : /bemann|manned|service|full/.test(typ) ? 'bemannad' : null;
    s.gatuadress = x.streetAddress || null; s.postnummer = normPostnr(x.postalCode); s.ort = titleCase(x.city) || null;
    s.kommun_kalla = x.municipality || null; s.lan_kalla = x.county || null;
    s.lat = toNum(x.latitude); s.lon = toNum(x.longitude);
    s.telefon = normPhone(x.phoneNumber);
    s.webb = 'https://www.preem.se' + sl.replace(/\/?$/, '/');
    s.oppettider = preemHours(x.openingHours);
    for (const f of x.fuelTypes || []) { const nm = f.name || f.title || ''; fuelNames[nm] = (fuelNames[nm] || 0) + 1; preemFuel(nm, s); }
    for (const f of x.services || []) { const nm = typeof f === 'string' ? f : f.name || f.title || ''; svcNames[nm] = (svcNames[nm] || 0) + 1; preemService(nm, s); }
    if ((x.electricConnectors || []).length) { s.drivmedel.el = true; s.tjanster.laddning = true; }
    if (s.typ === 'truckstation') s.tjanster.truckdiesel = true;
    if (s.typ == null) s.typ = s.tjanster.butik ? 'bemannad' : 'obemannad';
    if (s.typ === 'bemannad') s.tjanster.butik = true; else if (s.tjanster.butik == null) s.tjanster.butik = false;
    if (s.typ === 'bemannad') s.oppettider_butik = s.oppettider; else s.oppettider_pumpar = s.oppettider;
    Object.assign(s.kalla_extra, { koncept: x.stationConcept || null, stationstyp: x.stationType || null, hyrslap: !!x.trailerRentalLocationId || undefined });
    if (s.lat == null) continue;
    out.push(s);
  }
  log(`preem: drivmedelsnamn ${JSON.stringify(fuelNames)}`);
  log(`preem: tjänster ${JSON.stringify(svcNames)} | typer ${JSON.stringify(typeNames)} | fel ${fel}`);
  return { url: 'https://www.preem.se/stationer/', stationer: out, detaljfel: fel };
}

// ======================================================================= St1 (+ f.d. Shell, St1 biogas)
// Nuxt: __NUXT_DATA__ på /hitta-station (alla stationer) + /station/<slug> (detalj: ort, kommun, telefon, veckoschema).
function nuxtData(html) {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NUXT_DATA__ saknas');
  const A = JSON.parse(m[1]); const memo = new Map();
  const WR = new Set(['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef', 'NuxtError']);
  const r = (i) => {
    if (typeof i !== 'number') return i; if (i < 0) return undefined; if (memo.has(i)) return memo.get(i);
    const v = A[i]; let out;
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string' && WR.has(v[0])) out = r(v[1]);
      else if (v[0] === 'Set' || v[0] === 'Map' || v[0] === 'Date') out = null;
      else { out = []; memo.set(i, out); for (const x of v) out.push(r(x)); }
    } else if (v && typeof v === 'object') { out = {}; memo.set(i, out); for (const k in v) out[k] = r(v[k]); } else out = v;
    memo.set(i, out); return out;
  };
  return r(0);
}
const DAYIDX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
function st1Table(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const o = Object.fromEntries(DAYS.map((d) => [d, null]));
  for (const r of rows) {
    const a = DAYIDX[r.from], b = DAYIDX[r.to ?? r.from]; if (a == null || b == null) continue;
    const v = (r.hours || []).map((h) => span(h.startTime, h.endTime)).filter(Boolean).join(',') || 'stängt';
    for (let k = a; k <= b; k++) o[DAYS[k]] = v;
  }
  return DAYS.some((d) => o[d]) ? o : null;
}
function st1Dated(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const o = Object.fromEntries(DAYS.map((d) => [d, null]));
  for (const x of list) {
    const wd = (new Date(x.date + 'T12:00:00Z').getUTCDay() + 6) % 7;
    if (o[DAYS[wd]] != null) continue;
    o[DAYS[wd]] = (x.openHours || []).map((h) => span(h.startTime, h.endTime)).filter(Boolean).join(',') || 'stängt';
  }
  return DAYS.every((d) => o[d]) ? o : null;
}
const ST1_FUEL = { '95blyfri': 'bensin95', '98blyfri': 'bensin98', diesel: 'diesel', hvo: 'hvo100', e85: 'e85', cng: 'biogas', lbg: 'biogas', adblue: 'adblue', elbilsladdning150: 'el', elbilsladdning400: 'el' };
const ST1_SVC = { carwash: 'biltvatt', dirtcarwash: 'biltvatt', selfservicecarwash: 'biltvatt', boutique: 'butik', toilet: 'toalett', food: 'mat', fastfood: 'mat', coffee: 'kaffe_dryck', bottledgas: 'gasol', trailerrent: 'slaputhyrning', laddstation: 'laddning', carwashsubscription: 'tvattabonnemang' };
async function st1() {
  const html = await politeGet('https://st1.se/hitta-station', { timeoutMs: 90000 });
  const d = nuxtData(html);
  const page = Object.entries(d.data || {}).find(([k]) => /hitta-station/.test(k))?.[1];
  const src = page?.content?.body?.find((b) => b.type === 'stationlocator')?.data;
  if (!Array.isArray(src) || src.length < 100) throw new Error('för få St1-stationer');
  const out = []; let fel = 0;
  for (const { path: p, station: x } of src) {
    let det = null;
    try {
      const h = await cachedGet(`https://st1.se/${p}`, path.join(CACHE, 'st1', p.replace(/\W+/g, '_') + '.html'), { maxAgeH: DETAIL_MAX_AGE_H });
      const dd = nuxtData(h);
      det = Object.values(dd.data || {}).find((v) => v?.content?.station)?.content?.station || null;
    } catch (e) { if (e.name === 'BlockedError') throw e; fel++; }
    const y = det || x;
    const s = base('st1', x.id);
    s.kedja = 'St1';
    s.namn_kalla = x.name;
    const types = new Set([...(y.stationTypes || [])].map((t) => t.replace(/^sweden\//, '')));
    const svc = new Set([...(y.services || [])].map((t) => t.replace(/^sweden\//, '')));
    const trucks = new Set([...(y.trucks || [])].map((t) => t.replace(/^sweden\//, '')));
    s.typ = types.has('manned') || svc.has('boutique') ? 'bemannad' : types.has('truckstation') ? 'truckstation' : 'obemannad';
    s.gatuadress = y.street || null; s.postnummer = normPostnr(y.postcode); s.ort = titleCase(det?.city) || null;
    s.kommun_kalla = titleCase(det?.municipality) || null;
    s.lat = toNum(x.location?.lat); s.lon = toNum(x.location?.lon);
    s.telefon = normPhone(det?.telephone);
    s.webb = `https://st1.se/${p}`;
    const oh = st1Table(det?.openingHoursTable?.station) || st1Dated(y.storeOpeningHours);
    s.oppettider = oh;
    if (s.typ === 'bemannad') s.oppettider_butik = oh; else s.oppettider_pumpar = oh;
    if (types.has('service24hours')) { s.kalla_extra.tankning_dygnet_runt = true; if (s.typ !== 'bemannad') s.oppettider = s.oppettider_pumpar = s.oppettider || allDay(); }
    for (const f of y.fuels || []) { const k = ST1_FUEL[f.replace(/^sweden\//, '')]; if (k) s.drivmedel[k] = true; }
    for (const t of svc) { const k = ST1_SVC[t]; if (k) s.tjanster[k] = true; }
    if (s.drivmedel.el || svc.has('laddstation') || (y.chargings || []).length) { s.drivmedel.el = true; s.tjanster.laddning = true; }
    if (s.drivmedel.adblue || trucks.has('adbluepump')) s.tjanster.adblue = true;
    if (trucks.has('truckstation') || types.has('truckstation')) s.tjanster.truckdiesel = true;
    if (trucks.has('biogas')) s.drivmedel.biogas = true;
    if (s.tjanster.butik == null) s.tjanster.butik = s.typ === 'bemannad';
    s.kalla_extra.varumarke = x.brand; if (types.has('shell')) s.kalla_extra.f_d_shell = true;
    s.kalla_extra.butik_ploq = svc.has('butik-ploq') || undefined;
    if (x.isClosed) s.kalla_extra.stangd = true;
    if (s.lat == null) continue;
    out.push(s);
  }
  return { url: 'https://st1.se/hitta-station', stationer: out, detaljfel: fel };
}

// ======================================================================= Qstar + Bilisten + Pump
// Kartan på qstar.se/hitta/ läser https://qstar-backend-prod.herokuapp.com/api/v2/stations/qstar (publik JSON).
async function qstar() {
  const arr = await politeGet('https://qstar-backend-prod.herokuapp.com/api/v2/stations/qstar', { as: 'json' });
  if (!Array.isArray(arr) || arr.length < 50) throw new Error('för få Qstar-stationer');
  const out = [];
  for (const x of arr) {
    if (x.published === false) continue;
    if (/^biltv/i.test(x.brand || '')) continue; // fristående biltvättar
    const s = base('qstar', x.id);
    s.kedja = /bilisten/i.test(x.brand) ? 'Bilisten' : /^pump/i.test(x.brand) ? 'Pump' : 'Qstar';
    s.namn_kalla = x.name;
    s.typ = x.manned ? 'bemannad' : 'obemannad';
    let street = x.address || '', city = x.city || '';
    const parts = street.split(',').map((t) => t.trim()).filter(Boolean);
    const last = parts[parts.length - 1] || '';
    if (parts.length > 1 && /^(\d{3}\s?\d{2}\s+)?\p{L}[\p{L}\s.-]*$/u.test(last)) {
      street = parts.slice(0, -1).join(', ');
      if (!city) city = last;
    }
    if (/^\d{3}\s?\d{2}\s/.test(city)) { s.postnummer = normPostnr(city.slice(0, 6)); city = city.replace(/^\d{3}\s?\d{2}\s+/, ''); }
    // Ort saknas ofta: "Qstar Surte" -> "Surte" (bara om namnet är ett enda ortsnamn).
    if (!city) { const nm = String(x.name || '').replace(/^(qstar|bilisten|pump)\s+/i, '').trim(); if (/^\p{Lu}[\p{L}-]+$/u.test(nm)) city = nm; s.kalla_extra.ort_fran_namn = !!city || undefined; }
    s.gatuadress = street || null; s.ort = titleCase(city) || null;
    s.postnummer = s.postnummer || (typeof x.zip === 'string' ? normPostnr(x.zip) : null);
    s.lat = toNum(x.latitude); s.lon = toNum(x.longitude);
    s.telefon = normPhone(x.phone);
    s.webb = null;
    s.oppettider = null;
    for (const p of String(x.products || '').split(/\s*,\s*/)) {
      const n = p.toLowerCase();
      if (n === 'bensin 95') s.drivmedel.bensin95 = true; else if (n === 'bensin 98') s.drivmedel.bensin98 = true; else if (n === 'diesel') s.drivmedel.diesel = true;
      else if (n === 'e85') s.drivmedel.e85 = true; else if (n === 'adblue') { s.drivmedel.adblue = true; s.tjanster.adblue = true; } else if (n === 'hvo100') s.drivmedel.hvo100 = true;
      else if (n === 'cbg') s.drivmedel.biogas = true; else if (n === 'el') { s.drivmedel.el = true; s.tjanster.laddning = true; } else if (n === 'alkylat') s.drivmedel.alkylat = true;
    }
    s.tjanster.butik = !!x.manned;
    if (x.carWash || x.carTypes) s.tjanster.biltvatt = true;
    if (toNum(x.vehicle_max_length) >= 18) s.tjanster.truckdiesel = !!s.drivmedel.diesel || null;
    Object.assign(s.kalla_extra, { max_fordonslangd_m: toNum(x.vehicle_max_length), batmack: x.boatStation || undefined });
    if (s.lat == null) continue;
    out.push(s);
  }
  return { url: 'https://qstar.se/hitta/', stationer: out };
}

// ======================================================================= Gulf
// gulfsverige.com/hitta-station/ (WordPress, MapBox-plugin): markörerna ligger inbäddade i sidan.
const decodeEnt = (s) => String(s || '').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/<[^>]+>/g, '').trim();
async function gulf() {
  const html = await politeGet('https://gulfsverige.com/hitta-station/');
  const re = /w2mb_map_markers_attrs\('[^']*',\s*eval\((\[\[[\s\S]*?\]\])\)/g;
  let m; const out = []; const seen = new Set();
  while ((m = re.exec(html))) {
    let arr; try { arr = JSON.parse(m[1]); } catch { continue; }
    for (const x of arr) {
      const id = x[1]; if (seen.has(id)) continue; seen.add(id);
      const name = decodeEnt(x[7]); const info = String(x[9] || '');
      const adr = decodeEnt(info.match(/itemprop="streetAddress">([\s\S]*?)<\/span>/)?.[1]);
      const tel = info.match(/href="tel:([^"]+)"/)?.[1];
      const s = base('gulf', id);
      s.kedja = 'Gulf';
      s.namn_kalla = titleCase(name.replace(/\s*[–-]\s*(automat|bemannad)\s*$/i, ''));
      s.typ = /bemannad/i.test(name) ? 'bemannad' : 'obemannad';
      const am = adr.match(/^(.*?),\s*(\d{3}\s?\d{2})\s+(.+)$/);
      s.gatuadress = am ? am[1] : adr || null; s.postnummer = am ? normPostnr(am[2]) : null; s.ort = am ? titleCase(am[3]) : null;
      s.lat = toNum(x[2]); s.lon = toNum(x[3]);
      s.telefon = normPhone(tel);
      s.webb = null; s.oppettider = null;
      s.tjanster.butik = s.typ === 'bemannad';
      if (s.lat == null) continue;
      out.push(s);
    }
  }
  if (out.length < 10) throw new Error('för få Gulf-stationer (sidformatet ändrat?)');
  return { url: 'https://gulfsverige.com/hitta-station/', stationer: out };
}

// ======================================================================= Din-X
// din-x.se svarade inte (anslutnings-timeout) vid utvecklingen 2026-11-19. Försöker igen varje körning;
// lyckas sidan svara loggas att en parser behöver skrivas.
async function dinx() {
  let h;
  try { h = await politeGet('https://www.din-x.se/', { timeoutMs: 20000, retries: 0 }); }
  catch (e) { throw new Error(`din-x.se svarar inte (${e.cause?.code || e.name}: ${e.message}) – hoppar över`); }
  throw new Error(`din-x.se svarar (${h.length} byte) men parser saknas – skriv en i fetch-kedjor.mjs`);
}

const ALL = { circlek, okq8, preem, st1, qstar, gulf, dinx };
const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
for (const name of want.length ? want : Object.keys(ALL)) {
  if (!ALL[name]) { log(`okänd källa: ${name}`); continue; }
  await runFetcher(name, ALL[name]);
}
const rb = path.join(RAW, 'robots.json');
writeJSON(rb, { ...(readJSON(rb, {})), ...robotsSummary(), _uppdaterad: nowIso() });
