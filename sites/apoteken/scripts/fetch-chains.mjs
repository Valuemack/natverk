// Fetches the public store-locator data that the chains' own "hitta apotek" pages load.
// One request per chain (no per-store crawling), >= 1.1 s between requests, generic UA.
//   Apoteket AB      GET https://www.apoteket.se/bff/v1/pharmacies/all             (JSON, used by /apotek/)
//   Kronans Apotek   GET https://www.kronansapotek.se/api/bizniz/public/pharmacy/search (JSON, used by /hitta-apotek/)
//                    (Apoteksgruppen has been rebranded into Kronans; apoteksgruppen.se 301-redirects there)
//   Apotek Hjärtat   GET https://www.apotekhjartat.se/hitta-apotek-hjartat           (store list embedded as window.INITIAL_DATA)
//   DOZ Apotek (ex LloydsApotek, Admenta) SKIPPED — dozapotek.se/lloydsapotek.se robots.txt: ClaudeBot/anthropic-ai/GPTBot Disallow: /
// Apoteket and Hjärtat only publish date-specific hours for the coming 7-8 days. Days that are Swedish holidays/aftnar
// are moved to `avvikande` and the weekday falls back to the previous run's regular value (see datedWeek()).
// Output: data/raw/chains.json  — normalised records { kedja, kedja_id, gln, namn, gatuadress, postnummer, ort, lat, lon,
//                                  telefon, epost, url, oppettider{mon..sun}, avvikande[] }
import path from 'node:path';
import { RAW, politeFetch, writeJson, readJson, svHolidays } from './lib.mjs';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const EN = { monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun' };
const SV = { måndag: 'mon', tisdag: 'tue', onsdag: 'wed', torsdag: 'thu', fredag: 'fri', lördag: 'sat', söndag: 'sun' };
const hm = (t) => (t ? String(t).slice(0, 5) : null);
function span(open, close, brStart, brEnd) {
  if (!open || !close) return 'stängt';
  if (brStart && brEnd) return `${hm(open)}-${hm(brStart)}, ${hm(brEnd)}-${hm(close)}`;
  return `${hm(open)}-${hm(close)}`;
}
const emptyWeek = () => Object.fromEntries(DAYS.map((d) => [d, null]));
const HOL = { ...svHolidays(new Date().getFullYear()), ...svHolidays(new Date().getFullYear() + 1) };
const KEY_BY_DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
let PREV = {}; // kedja -> kedja_id -> previous record
/** entries: [{ date:'YYYY-MM-DD', value:'09:00-19:00'|'stängt' }] in chronological order */
function datedWeek(kedja, id, entries) {
  const week = emptyWeek(), avvikande = [];
  const prevWeek = PREV[kedja]?.[id]?.oppettider || {};
  for (const e of entries) {
    const k = KEY_BY_DOW[new Date(e.date + 'T12:00:00Z').getUTCDay()];
    if (HOL[e.date]) { avvikande.push({ datum: e.date, tid: e.value, orsak: HOL[e.date] }); continue; }
    week[k] = e.value; // later (next-week) entries overwrite earlier ones
  }
  for (const d of DAYS) if (week[d] == null && prevWeek[d] != null) week[d] = prevWeek[d];
  return { week, avvikande };
}
const isoPlus = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const pc = (s) => (s ? String(s).replace(/\D/g, '').replace(/^(\d{3})(\d{2})$/, '$1 $2') : null);

async function apoteket() {
  const res = await politeFetch('https://www.apoteket.se/bff/v1/pharmacies/all', { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Apoteket HTTP ${res.status}`);
  const list = await res.json();
  return list.filter((p) => !p.isAgency).map((p) => {
    // Date-specific list for the coming 7 days.
    const { week, avvikande } = datedWeek('Apoteket', p.id, (p.openingHours || []).filter((o) => o.date)
      .map((o) => ({ date: o.date, value: span(o.openTime, o.closeTime, o.breakStart, o.breakEnd) })));
    return {
      kedja: 'Apoteket', kedja_id: p.id, gln: p.gln ? String(p.gln) : null, namn: p.name,
      gatuadress: p.address, postnummer: pc(p.postalCode), ort: p.region,
      lat: p.location?.latitude ?? p.locationLat, lon: p.location?.longitude ?? p.locationLon,
      // Apoteket publishes no per-store phone; this is the central number from apoteket.se/kundservice
      telefon: '0771-450 450', epost: null, url: p.url ? 'https://www.apoteket.se' + p.url : null,
      oppettider: week, oppettider_typ: 'kommande 7 dagar', avvikande,
    };
  });
}

async function kronans() {
  const url = 'https://www.kronansapotek.se/api/bizniz/public/pharmacy/search?page=0&pageSize=2000&originLatitude=62&originLongitude=16';
  const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Kronans HTTP ${res.status}`);
  const j = await res.json();
  return j.pharmacies.map(({ pharmacy: p }) => {
    const week = emptyWeek();
    const sched = p.regularSchedule || [];
    if (sched.length) for (const d of DAYS) week[d] = 'stängt'; // days missing from a regular schedule are closed
    for (const s of sched) {
      const k = EN[String(s.weekday).toLowerCase()];
      if (k) week[k] = span(s.openTime, s.closeTime, s.lunchStart, s.lunchStop);
    }
    const avvikande = (p.exceptionSchedule || []).map((e) => ({
      datum: e.startDate, till: e.endDate !== e.startDate ? e.endDate : undefined,
      tid: e.closed ? 'stängt' : span(e.openTime, e.closeTime, e.lunchStart, e.lunchStop), orsak: e.reason || null,
    }));
    const slug = (p.marketingName || p.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return {
      kedja: 'Kronans Apotek', kedja_id: p.id, gln: p.gln || null, namn: p.marketingName || `Kronans Apotek ${p.name}`,
      gatuadress: p.visitingAddress, postnummer: pc(p.postalCode), ort: p.city,
      lat: p.latitude, lon: p.longitude, telefon: p.phoneNumber || null, epost: p.email || null,
      url: `https://www.kronansapotek.se/hitta-apotek/${slug}-${String(p.id).padStart(4, '0')}/`,
      oppettider: week, oppettider_typ: 'ordinarie', avvikande, pharmacyType: p.pharmacyType,
    };
  });
}

// Unescape the body of a single-quoted JS string literal (the argument of JSON.parse('...')).
function unescapeJs(s) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/gs, (_, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16));
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }[e] ?? e;
  });
}

async function hjartat() {
  const res = await politeFetch('https://www.apotekhjartat.se/hitta-apotek-hjartat', { headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`Hjärtat HTTP ${res.status}`);
  const html = await res.text();
  const start = html.indexOf("window.INITIAL_DATA = JSON.parse('");
  if (start < 0) throw new Error('Hjärtat: INITIAL_DATA not found (page layout changed)');
  // The argument is one or more concatenated single-quoted literals: '...' + '...'
  let i = start + "window.INITIAL_DATA = JSON.parse('".length, raw = '';
  for (;;) {
    let j = i;
    while (j < html.length && html[j] !== "'") j += html[j] === '\\' ? 2 : 1;
    raw += html.slice(i, j);
    const m = /^'\s*\+\s*'/.exec(html.slice(j, j + 20));
    if (!m) break;
    i = j + m[0].length;
  }
  const data = JSON.parse(unescapeJs(raw));
  const stores = data.page?.stores || [];
  return stores.map((p) => {
    // List starts with today (Stockholm time) and runs 8 days; the n-th entry is today + n days.
    const oh = p.openingHours || [];
    const todayKey = KEY_BY_DOW[new Date(isoPlus(0) + 'T12:00:00Z').getUTCDay()];
    if (oh.length && EN[String(oh[0].day).toLowerCase()] !== todayKey) console.warn(`Hjärtat ${p.pharmacyId}: first day ${oh[0].day} != today`);
    const { week, avvikande } = datedWeek('Apotek Hjärtat', p.pharmacyId,
      oh.map((o, n) => ({ date: isoPlus(n), value: o.isOpen ? span(o.openTime, o.closeTime) : 'stängt' })));
    return {
      kedja: 'Apotek Hjärtat', kedja_id: p.pharmacyId, gln: null, namn: p.name,
      gatuadress: p.address?.street, postnummer: pc(p.address?.zipCode), ort: p.address?.city,
      lat: p.coordinates?.latitude, lon: p.coordinates?.longitude, telefon: '0771-405 405', epost: null,
      url: p.url ? 'https://www.apotekhjartat.se' + p.url : null,
      oppettider: week, oppettider_typ: 'kommande 7 dagar', avvikande,
    };
  });
}

const prev = readJson(path.join(RAW, 'chains.json'), { chains: {} });
for (const [k, v] of Object.entries(prev.chains || {})) PREV[k] = Object.fromEntries((v.records || []).map((r) => [r.kedja_id, r]));
const out = { fetched: new Date().toISOString(), chains: {} };
for (const [name, fn] of [['Apoteket', apoteket], ['Kronans Apotek', kronans], ['Apotek Hjärtat', hjartat]]) {
  try {
    const recs = await fn();
    if (recs.length < 50) throw new Error(`only ${recs.length} records`);
    out.chains[name] = { fetched: new Date().toISOString(), count: recs.length, records: recs };
    console.log(`${name}: ${recs.length}`);
  } catch (e) {
    console.warn(`${name} FAILED: ${e.message} — keeping previous data`);
    if (prev.chains?.[name]) out.chains[name] = { ...prev.chains[name], stale: true };
  }
}
out.skipped = { 'DOZ Apotek (ex LloydsApotek)': 'dozapotek.se robots.txt disallows ClaudeBot/anthropic-ai/GPTBot (Disallow: /) — not fetched' };
writeJson(path.join(RAW, 'chains.json'), out);
