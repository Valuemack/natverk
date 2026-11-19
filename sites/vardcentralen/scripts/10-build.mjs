// Slår ihop rådata till data/enheter.json (gemensamt schema), data/kommuner.json,
// data/rapport.json och data/qa.json. Gör inga nätverksanrop.
import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_DIR, RAW_DIR, readJson, writeJson, parseCsv, normName, slugify, haversineM,
  wgs84ToSweref, swerefToWgs84, pointInRings, distToRings,
} from './lib.mjs';
import { isExcluded, typFor, chainFrom, operatorFromFinancingText } from './classify.mjs';

const today = new Date().toISOString().slice(0, 10);
const LAN = {
  '01': 'Stockholms län', '03': 'Uppsala län', '04': 'Södermanlands län', '05': 'Östergötlands län', '06': 'Jönköpings län',
  '07': 'Kronobergs län', '08': 'Kalmar län', '09': 'Gotlands län', '10': 'Blekinge län', '12': 'Skåne län', '13': 'Hallands län',
  '14': 'Västra Götalands län', '17': 'Värmlands län', '18': 'Örebro län', '19': 'Västmanlands län', '20': 'Dalarnas län',
  '21': 'Gävleborgs län', '22': 'Västernorrlands län', '23': 'Jämtlands län', '24': 'Västerbottens län', '25': 'Norrbottens län',
};
const REGION = {
  '01': 'Region Stockholm', '03': 'Region Uppsala', '04': 'Region Sörmland', '05': 'Region Östergötland', '06': 'Region Jönköpings län',
  '07': 'Region Kronoberg', '08': 'Region Kalmar län', '09': 'Region Gotland', '10': 'Region Blekinge', '12': 'Region Skåne', '13': 'Region Halland',
  '14': 'Västra Götalandsregionen', '17': 'Region Värmland', '18': 'Region Örebro län', '19': 'Region Västmanland', '20': 'Region Dalarna',
  '21': 'Region Gävleborg', '22': 'Region Västernorrland', '23': 'Region Jämtland Härjedalen', '24': 'Region Västerbotten', '25': 'Region Norrbotten',
};
const SRC = {
  '1177': '1177.se Hitta vård (Inera, uppgifter ur HSA-katalogen)',
  vardbetyg: 'Vårdbetyg öppna data (CC BY 4.0)',
  vgr: 'Västra Götalandsregionen öppna data (CC0)',
  osm: 'OpenStreetMap (ODbL 1.0)',
  scb: 'SCB kommungränser (CC0)',
};

// ---------- Indata ----------
const lista = readJson(path.join(RAW_DIR, '1177-lista.json'));
const narakut = new Map((readJson(path.join(RAW_DIR, '1177-narakut.json'), { enheter: [] }).enheter).map((h) => [h.HsaId, h]));
const jour = new Map((readJson(path.join(RAW_DIR, '1177-jour.json'), { enheter: [] }).enheter).map((h) => [h.HsaId, h]));
const kortDir = path.join(RAW_DIR, '1177-kort');
const readCard = (hsa) => readJson(path.join(kortDir, hsa.replace(/[^A-Za-z0-9_-]/g, '_') + '.json'), null);
const csv = (f) => (fs.existsSync(path.join(RAW_DIR, f)) ? parseCsv(fs.readFileSync(path.join(RAW_DIR, f), 'utf8')) : []);
const vb = csv('vardbetyg-vardcentraler.csv');
const vgr = csv('vgr-vardcentraler.csv');
const osm = readJson(path.join(RAW_DIR, 'osm-vardcentraler.json'), { element: [] }).element.filter((e) => e.lat && e.tags?.name);
const kommuner = readJson(path.join(RAW_DIR, 'scb-kommuner.json')).kommuner;
const kommunByKod = new Map(kommuner.map((k) => [k.kod, k]));
const kommunByNorm = new Map(kommuner.map((k) => [normKommun(k.namn), k]));
const idMapFile = path.join(DATA_DIR, 'id-map.json');
const idMap = readJson(idMapFile, {});

function normKommun(s) {
  // Behåll å/ä/ö: "Håbo" och "Habo" är olika kommuner.
  return (s || '').toLowerCase().replace(/s? kommun$/, '').replace(/[^a-zåäöéü]/g, '');
}
const vbByHsa = new Map(vb.map((r) => [r.hsa_id, r]));
const vgrByHsa = new Map(vgr.map((r) => [r.hsaid, r]));
const listHsa = new Set(lista.enheter.map((h) => h.HsaId));

// ---------- Hjälpfunktioner ----------
const DAYS = { 'Måndag': 'mon', 'Tisdag': 'tue', 'Onsdag': 'wed', 'Torsdag': 'thu', 'Fredag': 'fri', 'Lördag': 'sat', 'Söndag': 'sun' };
const CLOSE_RE = /stängt|stängd|lunch|rast|paus/i;
const LAB_RE = /laborator|provtagning|\blab\b|vaccin/i;
const toMin = (s) => { const [h, m] = s.split(/[.:]/).map(Number); return h * 60 + (m || 0); };
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function parseSpan(sp) {
  const m = (sp.Period || '').match(/(\d{1,2}[.:]\d{2})\s*[–-]\s*(\d{1,2}[.:]\d{2})/);
  if (!m) return null;
  let a = toMin(m[1]), b = toMin(m[2]); if (b === 0) b = 1440;
  return b > a ? { a, b, c: sp.Comment || '' } : null;
}
function subtract(open, close) {
  let res = open.map((o) => [o.a, o.b]);
  for (const c of close) res = res.flatMap(([a, b]) => (c.b <= a || c.a >= b ? [[a, b]] : [[a, c.a], [c.b, b]].filter(([x, y]) => y - x >= 15)));
  res.sort((x, y) => x[0] - y[0]);
  const merged = []; for (const r of res) { const l = merged.at(-1); if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push([...r]); }
  return merged;
}
// Öppettider för en dag: tar bort korta stängningar (lunch) och, om det finns andra
// tider, spann som bara gäller lab/provtagning/vaccination.
function dayHours(spans) {
  if (!spans?.length) return null;
  const parsed = spans.map(parseSpan).filter(Boolean);
  if (!parsed.length) return spans.some((s) => /stängt|ingen/i.test(s.Period || '')) ? 'stängt' : null;
  const close = parsed.filter((p) => CLOSE_RE.test(p.c) && p.b - p.a <= 150);
  let open = parsed.filter((p) => !close.includes(p));
  const nonLab = open.filter((p) => !LAB_RE.test(p.c));
  if (nonLab.length) open = nonLab;
  const merged = subtract(open, close);
  return merged.length ? merged.map(([a, b]) => `${fmt(a)}-${fmt(b)}`).join(',') : 'stängt';
}
function schedule(sch) {
  const out = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
  for (const d of sch?.Schedule || []) if (DAYS[d.Day]) out[DAYS[d.Day]] = dayHours(d.Spans);
  return out;
}
function dropinInfo(bh, flags) {
  let structured = null;
  const sch = bh?.Dropin?.Schedule;
  if (sch?.length) {
    const spans = sch.flatMap((d) => d.Spans || []).map(parseSpan).filter(Boolean);
    if (!spans.length) structured = { dropin: false };
    else {
      const allLab = spans.every((s) => LAB_RE.test(s.c));
      structured = { dropin: !allLab, dropin_endast_provtagning: allLab || undefined, dropin_tider: schedule(bh.Dropin) };
    }
    if (structured.dropin) return structured;
  }
  // Drop-in angivet som kommentar i öppettiderna ("Drop in", "Öppen mottagning").
  // Väger tyngre än ett drop-in-schema som bara gäller provtagning.
  const DI = /drop[\s-]?in|öppen mottagning|lättakut/i;
  const openDays = bh?.Open?.Schedule || [];
  const diSpans = openDays.flatMap((d) => (d.Spans || []).filter((s) => DI.test(s.Comment || '') && !LAB_RE.test(s.Comment || '')));
  if (diSpans.length) {
    const tider = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
    for (const d of openDays) {
      const sp = (d.Spans || []).filter((s) => DI.test(s.Comment || '') && !LAB_RE.test(s.Comment || '')).map(parseSpan).filter(Boolean);
      if (DAYS[d.Day]) tider[DAYS[d.Day]] = sp.length ? sp.map((p) => `${fmt(p.a)}-${fmt(p.b)}`).join(',') : 'stängt';
    }
    return { dropin: true, dropin_tider: tider };
  }
  if (structured) return structured;
  const t = flags?.dropinText || '';
  if (/(ingen|inte (någon|några)?|ej|saknar)\s+(öppen\s+)?drop[\s-]?in/i.test(t)) return { dropin: false };
  return { dropin: null };
}
const POST_RE = /\b(\d{3})\s?(\d{2})\b/;
const titleCase = (s) => (s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).trim();
function parseAddress(card, listHit) {
  const visit = (card?.Address || listHit.Address || '').replace(/\s+/g, ' ').replace(/^besöksadress:?\s*/i, '').trim();
  const postal = (card?.PostalAddress || '').replace(/\s+/g, ' ').trim();
  // Första meningen räcker ("Alvesta. Ambulansentré: ..." -> "Alvesta").
  const segs = visit.split(/,|\.\s/).map((s) => s.trim()).filter(Boolean);
  let gata = segs.find((s) => /\d/.test(s) && !POST_RE.test(s) && !/^\d+$/.test(s)) || segs[0] || null;
  let postnr = null, ort = null, postnrKalla = null;
  // Rimligt ortsnamn: kort, inga siffror, inte en byggnad ("Avesta lasarett", "Läkarhuset i X").
  const ortLike = (s) => s && !/\d/.test(s) && s.split(' ').length <= 3 && !/lasarett|sjukhus|vårdcentral|hälsocentral|huset|plan|entré|våning|ingång|center|centrum$/i.test(s);
  const pm = visit.match(POST_RE);
  if (pm) {
    postnr = `${pm[1]} ${pm[2]}`; postnrKalla = 'besöksadress';
    const after = visit.slice(pm.index + pm[0].length).replace(/^[\s,]+/, '').split(/,|\.\s/)[0].trim();
    ort = ortLike(after) ? after : null;
  } else if (segs.length > 1 && ortLike(segs.at(-1))) ort = segs.at(-1);
  // Postadress: "Gatan 1, 123 45 ORT"
  const ps = postal.split(',').map((s) => s.trim());
  const ppm = postal.match(POST_RE);
  const postStreet = ps[0] || '';
  const postOrt = ppm ? postal.slice(ppm.index + ppm[0].length).replace(/^[\s,]+/, '').split(',')[0].trim() : null;
  if (!postnr && ppm && !/\b(box|postbox|pl|plan)\s*\d/i.test(postStreet)) { postnr = `${ppm[1]} ${ppm[2]}`; postnrKalla = 'postadress'; }
  if (!ort && postOrt) ort = postOrt;
  if (gata && segs.length === 1 && postOrt && gata.toLowerCase().endsWith(' ' + postOrt.toLowerCase())) gata = gata.slice(0, -postOrt.length).trim();
  if (gata && ort && segs.length === 1 && gata.toLowerCase().endsWith(' ' + ort.toLowerCase())) gata = gata.slice(0, -ort.length).trim();
  if (ort) ort = ort.replace(/\s+besöksadress.*$/i, '').trim();
  if (ort && ort === ort.toUpperCase()) ort = titleCase(ort);
  return { gata: gata || null, postnr, postnrKalla, ort: ort || null };
}
function tokenSim(a, b) {
  const A = new Set(normName(a).split(' ').filter((t) => t.length > 1)), B = new Set(normName(b).split(' ').filter((t) => t.length > 1));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return i / Math.min(A.size, B.size);
}
function kommunFor(lat, lon) {
  const { N, E } = wgs84ToSweref(lat, lon);
  for (const k of kommuner) {
    const [x0, y0, x1, y1] = k.bbox;
    if (E >= x0 && E <= x1 && N >= y0 && N <= y1 && pointInRings(E, N, k.rings)) return { k, dist: 0 };
  }
  let best = null; // utanför alla (förenklade) polygoner, t.ex. vid kusten: närmaste kommun
  for (const k of kommuner) { const d = distToRings(E, N, k.rings); if (!best || d < best.dist) best = { k, dist: d }; }
  return best;
}
const distToKommun = (lat, lon, k) => { const { N, E } = wgs84ToSweref(lat, lon); return pointInRings(E, N, k.rings) ? 0 : distToRings(E, N, k.rings); };

// ---------- Bygg ----------
const qa = { utesluten: [], saknar_kort: [], kommun_konflikt: [], koordinat_avvikelse: [], vardbetyg_utan_1177: [], dubblett_koordinat: [] };
const enheter = [];
const usedVb = new Set();
const vbByKommun = new Map(); for (const r of vb) { const a = vbByKommun.get(r.kommun_kod) || []; a.push(r); vbByKommun.set(r.kommun_kod, a); }

// Förpass: koordinat, HSA-kommun och SCB-kommun per enhet, för matchning mot Vårdbetyg.
const units = [];
for (const h of lista.enheter) {
  if (isExcluded(h.Heading)) { qa.utesluten.push(h.Heading); continue; }
  const kort = readCard(h.HsaId); const card = kort?.card || null;
  if (!card) qa.saknar_kort.push(`${h.HsaId} ${h.Heading}`);
  const namn = (card?.DisplayName || h.Heading).replace(/\s+/g, ' ').trim();
  let lat = card?.Location?.latitude ?? h.Latitude ?? null, lon = card?.Location?.longitude ?? h.Longitude ?? null;
  if (!lat || !lon || Math.abs(lat) < 1) { lat = null; lon = null; }
  const hsaKommun = kommunByNorm.get(normKommun(card?.Municipality)) || null;
  const pip = lat ? kommunFor(lat, lon) : null;
  units.push({ h, kort, card, namn, lat, lon, hsaKommun, pip });
}
// Vårdbetyg: först exakt HSA-id, sedan namnlikhet inom samma kommun (Vårdbetyg använder
// ibland HSA-id för en underenhet, t.ex. "Allmänmedicinska mottagningen vårdcentralen Kil").
const GENERIC = /\b(allmanmedicinska?|mottagning(en)?|lakarmottagning(en)?|din|hc)\b/g;
const simTokens = (s) => new Set(normName(s).replace(GENERIC, ' ').split(' ').filter((t) => t.length > 1));
const vbFor = new Map();
for (const u of units) { const r = vbByHsa.get(u.h.HsaId); if (r) { vbFor.set(u, r); usedVb.add(r.hsa_id); } }
const pairs = [];
for (const u of units) {
  if (vbFor.has(u)) continue;
  const kods = new Set([u.hsaKommun?.kod, u.pip?.k.kod].filter(Boolean));
  const A = simTokens(u.namn);
  for (const kod of kods) for (const r of vbByKommun.get(kod) || []) {
    if (usedVb.has(r.hsa_id) || listHsa.has(r.hsa_id)) continue;
    const B = simTokens(r.name); let i = 0;
    // Samma ord eller samma stam ("samaritens" ~ "samariten").
    for (const t of A) if (B.has(t) || [...B].some((b) => Math.min(b.length, t.length) >= 5 && (b.startsWith(t) || t.startsWith(b)))) i++;
    const score = i / new Set([...A, ...B]).size; // Jaccard
    if (i && score >= 0.5) pairs.push({ u, r, score });
  }
}
pairs.sort((a, b) => b.score - a.score);
for (const { u, r } of pairs) if (!vbFor.has(u) && !usedVb.has(r.hsa_id)) { vbFor.set(u, r); usedVb.add(r.hsa_id); }

for (const u of units) {
  const { h, kort, card, namn, hsaKommun, pip } = u;
  const kallor = new Set([SRC['1177']]);
  // Koordinater: 1177 (HSA) i första hand, annars VGR, annars OSM.
  let { lat, lon } = u; let koordKalla = lat ? '1177' : null;
  const vg = vgrByHsa.get(h.HsaId);
  if (vg) kallor.add(SRC.vgr);
  if (!lat && vg?.x) { const w = swerefToWgs84(Number(vg.x), Number(vg.y)); lat = w.lat; lon = w.lon; koordKalla = 'vgr'; }
  if (vg?.x && lat) { const w = swerefToWgs84(Number(vg.x), Number(vg.y)); const d = haversineM({ lat, lon }, w); if (d > 500) qa.koordinat_avvikelse.push({ namn, hsa: h.HsaId, mot: 'vgr', meter: Math.round(d) }); }

  // Kommun: punkt-i-polygon (SCB) jämförs med HSA-kommunen (1177) och Vårdbetygs kommunkod.
  const v = vbFor.get(u);
  if (v) { usedVb.add(v.hsa_id); kallor.add(SRC.vardbetyg); }
  let kommun = null, kommunMetod = null;
  if (lat && pip) {
    const votes = [pip.k.kod, hsaKommun?.kod, v?.kommun_kod].filter(Boolean);
    const agree = (kod) => votes.filter((x) => x === kod).length;
    kommun = pip.k; kommunMetod = pip.dist === 0 ? 'punkt-i-polygon' : `närmaste kommunpolygon (${Math.round(pip.dist)} m)`;
    const alt = [hsaKommun, v ? kommunByKod.get(v.kommun_kod) : null].filter((k) => k && k.kod !== pip.k.kod);
    for (const k of alt) {
      if (agree(k.kod) > agree(pip.k.kod) || distToKommun(lat, lon, k) < 3000) { kommun = k; kommunMetod = 'HSA-kommun (punkten ligger nära förenklad SCB-gräns)'; break; }
    }
    if (hsaKommun && hsaKommun.kod !== kommun.kod) qa.kommun_konflikt.push({ namn, hsa: h.HsaId, scb_pip: pip.k.namn, hsa_kommun: card?.Municipality, vardbetyg: v?.kommun, vald: kommun.namn });
    kallor.add(SRC.scb);
  } else if (lat) {
    const p2 = kommunFor(lat, lon); kommun = p2.k; kommunMetod = 'punkt-i-polygon (koordinat från ' + koordKalla + ')'; kallor.add(SRC.scb);
  } else if (hsaKommun || v) { kommun = hsaKommun || kommunByKod.get(v.kommun_kod); kommunMetod = hsaKommun ? 'HSA-kommun (saknar koordinat)' : 'Vårdbetyg kommunkod (saknar koordinat)'; }
  const lanKod = kommun?.kod.slice(0, 2) || null;

  // OSM: reserv för koordinat och webbplats. Matchning: namnlikhet + avstånd.
  let o = null;
  if (osm.length) {
    let best = null;
    for (const e of osm) {
      const d = lat ? haversineM({ lat, lon }, e) : null; if (lat && d > 400) continue;
      const s = tokenSim(namn, e.tags.name); if (s < (lat ? 0.5 : 0.8)) continue;
      const score = s - (d || 0) / 2000; if (!best || score > best.score) best = { e, score };
    }
    o = best?.e || null;
  }
  if (!lat && o) { lat = o.lat; lon = o.lon; koordKalla = 'osm'; }

  const adr = parseAddress(card, h);
  if (!adr.postnr && vg?.postnummer) { adr.postnr = vg.postnummer.replace(/^(\d{3})(\d{2})$/, '$1 $2'); adr.postnrKalla = 'vgr'; }
  if (!adr.postnr && o?.tags['addr:postcode']) { adr.postnr = o.tags['addr:postcode'].replace(/^(\d{3})\s?(\d{2})$/, '$1 $2'); adr.postnrKalla = 'osm'; kallor.add(SRC.osm); }
  const phones = card?.Phone || [];
  const main = phones.find((p) => p.Title === 'Telefonnummer') || phones.find((p) => /växel/i.test(p.Title)) || phones[0];
  const telefon = main?.Numbers?.[0]?.National || h.PhoneNumber || null;
  const vaxel = phones.find((p) => /växel/i.test(p.Title))?.Numbers?.[0]?.National;
  let webb = card?.WebsiteUrl || null;
  if (webb && !/^https?:\/\//i.test(webb)) webb = 'https://' + webb.replace(/^\/+/, '');
  if (!webb && o?.tags.website) { webb = o.tags.website; }
  if (o && (koordKalla === 'osm' || (!card?.WebsiteUrl && o.tags.website))) kallor.add(SRC.osm);

  const of = card?.OwnerAndFinancing || {};
  const operator = operatorFromFinancingText(of.FinancingText);
  let huvudman = null;
  if (/region|landsting|offentlig/i.test(of.OwnerType || '')) huvudman = 'region';
  else if (/privat/i.test(of.OwnerType || '')) huvudman = 'privat';
  else if (v?.huvudman === 'region' || v?.huvudman === 'privat') huvudman = v.huvudman;
  else if (vg) huvudman = /närhälsan/i.test(vg.foretag) ? 'region' : 'privat';
  const vardgivare = (operator && !/^region|regionen$|landsting/i.test(operator) ? operator : null) || (vg && !/närhälsan/i.test(vg.foretag) ? vg.foretag : null) || v?.vardgivare || null;
  let kedja = chainFrom(namn, v?.kedja, vg?.foretag, operator, v?.vardgivare, o?.tags.brand);
  if (!kedja && huvudman === 'region') kedja = (operator && /^region|regionen$/i.test(operator) ? operator : null) || (lanKod ? REGION[lanKod] : null);
  if (!kedja && vardgivare) kedja = vardgivare;

  const d = dropinInfo(card?.BusinessHours, card?._flags);
  const oppettider = schedule(card?.BusinessHours?.Open);
  const typ = typFor(namn, lanKod);

  // Stabilt id: återanvänd tidigare tilldelat id för HSA-id:t.
  let id = idMap[h.HsaId];
  if (!id) {
    const taken = new Set(Object.values(idMap));
    let base = slugify(namn);
    const ortSlug = slugify(adr.ort || kommun?.namn || '');
    if (taken.has(base) && ortSlug && !base.includes(ortSlug)) base = `${base}-${ortSlug}`;
    id = base; for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
    idMap[h.HsaId] = id;
  }

  const nk = narakut.get(h.HsaId), jm = jour.get(h.HsaId);
  enheter.push({
    id, namn, kedja: kedja || null, typ,
    gatuadress: adr.gata, postnummer: adr.postnr, ort: adr.ort || kommun?.namn || null,
    kommun: kommun?.namn || null, lan: lanKod ? LAN[lanKod] : null,
    lat: lat != null ? Math.round(lat * 1e6) / 1e6 : null, lon: lon != null ? Math.round(lon * 1e6) / 1e6 : null,
    telefon, webb,
    oppettider,
    extra: {
      dropin: d.dropin,
      ...(d.dropin_endast_provtagning ? { dropin_endast_provtagning: true } : {}),
      ...(d.dropin_tider ? { dropin_tider: d.dropin_tider } : {}),
      narakut: nk ? true : null,
      jourmottagning: jm ? true : null,
      filial: typ === 'filial' || typ === 'närmottagning' || typ === 'distriktssköterskemottagning' ? true : false,
      huvudman, vardgivare,
      hsa_id: h.HsaId,
      url_1177: kort?.kanonisk || (h.Url ? 'https://www.1177.se' + h.Url : null),
      listning: h.HasListing ?? null,
      telefon_vaxel: vaxel && vaxel !== telefon ? vaxel : undefined,
      kommunkod: kommun?.kod || null, lan_kod: lanKod,
      kommun_metod: kommunMetod, koordinat_kalla: koordKalla,
      postnummer_kalla: adr.postnrKalla, osm_id: o?.osm || null,
      i_vardbetyg_register: v ? true : false,
    },
    kallor: [...kallor],
    uppdaterad: (kort?.hamtad || lista.hamtad).slice(0, 10),
  });
}
for (const r of vb) if (!usedVb.has(r.hsa_id)) qa.vardbetyg_utan_1177.push(`${r.name} | ${r.kommun} | ${r.hsa_id}`);
// Flera enheter på exakt samma punkt (t.ex. filial som delar lokal) – bara info.
const byPt = new Map(); for (const e of enheter) if (e.lat) { const k = `${e.lat},${e.lon}`; byPt.set(k, [...(byPt.get(k) || []), e.namn]); }
for (const [k, v] of byPt) if (v.length > 1) qa.dubblett_koordinat.push({ punkt: k, enheter: v });

enheter.sort((a, b) => (a.kommun || '').localeCompare(b.kommun || '', 'sv') || a.namn.localeCompare(b.namn, 'sv'));
for (const e of enheter) for (const k of Object.keys(e.extra)) if (e.extra[k] === undefined) delete e.extra[k];

// ---------- Utdata ----------
if (enheter.length < 1000) throw new Error(`Bara ${enheter.length} enheter – skriver inte över enheter.json`);
writeJson(path.join(DATA_DIR, 'enheter.json'), enheter);
writeJson(idMapFile, idMap);
const kom = new Map();
for (const e of enheter) {
  if (!e.kommun) continue;
  const k = kom.get(e.kommun) || { kommunkod: e.extra.kommunkod, kommun: e.kommun, slug: slugify(e.kommun), lan: e.lan, antal: 0, orter: new Set() };
  k.antal++; if (e.ort) k.orter.add(e.ort); kom.set(e.kommun, k);
}
writeJson(path.join(DATA_DIR, 'kommuner.json'), [...kom.values()].map((k) => ({ ...k, orter: [...k.orter].sort((a, b) => a.localeCompare(b, 'sv')) })).sort((a, b) => a.kommunkod.localeCompare(b.kommunkod)));

const pct = (n) => Math.round((1000 * n) / enheter.length) / 10;
const count = (f) => enheter.filter(f).length;
const perLan = {};
for (const e of enheter) {
  const l = perLan[e.lan || 'okänt'] ||= { antal: 0, koordinater: 0, oppettider: 0, telefon: 0, dropin_kand: 0 };
  l.antal++; if (e.lat) l.koordinater++; if (Object.values(e.oppettider).some((x) => x)) l.oppettider++; if (e.telefon) l.telefon++; if (e.extra.dropin !== null) l.dropin_kand++;
}
const vbPerRegion = {}; for (const r of vb) vbPerRegion[r.lan_kod] = (vbPerRegion[r.lan_kod] || 0) + 1;
for (const [kod, namn] of Object.entries(LAN)) if (perLan[namn]) perLan[namn].vardbetyg_register = vbPerRegion[kod] || 0;
const kedjor = {}; for (const e of enheter) kedjor[e.kedja || '(okänd)'] = (kedjor[e.kedja || '(okänd)'] || 0) + 1;
const typer = {}; for (const e of enheter) typer[e.typ] = (typer[e.typ] || 0) + 1;
const rapport = {
  byggd: new Date().toISOString(),
  antal: enheter.length,
  andel_procent: {
    koordinater: pct(count((e) => e.lat)), oppettider: pct(count((e) => Object.values(e.oppettider).some((x) => x))),
    oppettider_alla_7_dagar: pct(count((e) => Object.values(e.oppettider).every((x) => x))),
    telefon: pct(count((e) => e.telefon)), webb: pct(count((e) => e.webb)), postnummer: pct(count((e) => e.postnummer)),
    kedja: pct(count((e) => e.kedja)), huvudman: pct(count((e) => e.extra.huvudman)), dropin_kand: pct(count((e) => e.extra.dropin !== null)),
  },
  dropin: { ja: count((e) => e.extra.dropin === true), nej: count((e) => e.extra.dropin === false), okant: count((e) => e.extra.dropin === null) },
  narakut: count((e) => e.extra.narakut), jourmottagning: count((e) => e.extra.jourmottagning),
  huvudman: { region: count((e) => e.extra.huvudman === 'region'), privat: count((e) => e.extra.huvudman === 'privat'), okand: count((e) => !e.extra.huvudman) },
  typ: typer,
  kedjor: Object.fromEntries(Object.entries(kedjor).sort((a, b) => b[1] - a[1])),
  per_lan: Object.fromEntries(Object.entries(perLan).sort()),
  qa_antal: Object.fromEntries(Object.entries(qa).map(([k, v]) => [k, v.length])),
};
writeJson(path.join(DATA_DIR, 'rapport.json'), rapport);
writeJson(path.join(DATA_DIR, 'qa.json'), qa);
fs.writeFileSync(path.join(DATA_DIR, 'LICENS-OCH-KALLOR.txt'), [
  'Källor för enheter.json (byggd ' + today + ')',
  '- 1177.se Hitta vård (Inera AB), uppgifter ur HSA-katalogen. Ange 1177 som källa och länka till kontaktkortet (extra.url_1177).',
  '- Vårdbetyg (vardbetyg.se), CC BY 4.0 – attribution krävs.',
  '- Västra Götalandsregionen, Vårdcentraler i Vårdval vårdcentral, CC0.',
  '- SCB, digitala kommungränser, CC0.',
  '- © OpenStreetMap-bidragsgivare, ODbL 1.0 (endast reservkoordinater/webb för enheter med "OpenStreetMap" i kallor) – attribution krävs.',
  '',
].join('\n'));
console.log(JSON.stringify({ antal: rapport.antal, andel: rapport.andel_procent, dropin: rapport.dropin, qa: rapport.qa_antal }, null, 1));
