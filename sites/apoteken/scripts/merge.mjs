// Merges Läkemedelsverket (master list) + chain locators + OpenStreetMap (+ cached geocodes) into data/apotek.json.
// Also writes data/kommuner.json (one row per kommun) and data/rapport.json (coverage, duplicates, unmatched).
import fs from 'node:fs';
import path from 'node:path';
import { RAW, DATA, readJson, writeJson } from './lib.mjs';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const lv = readJson(path.join(RAW, 'lv.json'));
const osm = readJson(path.join(RAW, 'osm.json'), { elements: [] });
const chains = readJson(path.join(RAW, 'chains.json'), { chains: {} });
const scb = readJson(path.join(RAW, 'scb-kommuner.json'));
const geocache = readJson(path.join(RAW, 'geocode-cache.json'), {});
if (!lv || !scb) throw new Error('Run fetch-lv.mjs and fetch-scb.mjs first');

// ---------- normalisation ----------
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae');
const pcDigits = (s) => String(s ?? '').replace(/\D/g, '').slice(0, 5);
const pcFmt = (s) => { const d = pcDigits(s); return d.length === 5 ? `${d.slice(0, 3)} ${d.slice(3)}` : null; };
const CHAIN_WORDS = /\b(apoteket|apotek|kronans|hjartat|doz|lloydsapotek|lloyds|apoteksgruppen|ab|i|vid|pa|the)\b/g;
function addrParts(s) {
  let t = fold(s).replace(/\bg\.(?=\s|\d|$)/g, 'gatan ').replace(/\bv\.(?=\s|\d|$)/g, 'vagen ').replace(/[^a-z0-9 ]+/g, ' ');
  const num = (t.match(/\b(\d+)\s?[a-z]?\b/) || [])[1] || null;
  const street = t.replace(/\b\d+\s?[a-z]?\b/g, ' ').replace(/\s+/g, ' ').trim();
  return { street, num };
}
const nameKey = (s) => fold(s).replace(/[^a-z0-9 ]+/g, ' ').replace(CHAIN_WORDS, ' ').replace(/\s+/g, ' ').trim();
function bigrams(s) { const t = ` ${s} `; const m = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; }
function dice(a, b) {
  if (!a || !b) return 0; if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b); let inter = 0, na = 0, nb = 0;
  for (const v of A.values()) na += v; for (const v of B.values()) nb += v;
  for (const [g, v] of A) inter += Math.min(v, B.get(g) || 0);
  return (2 * inter) / (na + nb);
}
// containment helps "Allum 324, Nils Henrikssons väg 3" vs "Nils Henrikssons väg 3"
const streetSim = (a, b) => (a && b && (a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 5 ? 0.95 : dice(a, b));
function distM(a, b) {
  if (a?.lat == null || b?.lat == null) return null;
  const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---------- kommun / län ----------
// exact (case-insensitive) names: folding diacritics would merge Håbo (0305) and Habo (0643)
const kommunByName = new Map(scb.kommuner.map((k) => [k.namn.toLowerCase(), k]));
const lanByCode = new Map(scb.lan.map((l) => [l.kod, l.namn]));

// ---------- chain identity ----------
function chainOfActor(actor, name) {
  const a = fold(actor), n = fold(name);
  if (/^apoteket ab$/.test(a)) return 'Apoteket';
  if (/^kronans apotek ab$/.test(a) || /^apoteksgruppen/.test(a)) return 'Kronans Apotek';
  if (/^apotek hjartat\s+ab$/.test(a)) return 'Apotek Hjärtat';
  if (/^admenta sweden ab$/.test(a) || /^doz apotek/.test(n)) return 'DOZ Apotek';
  if (/^apotea/.test(a)) return 'Apotea';
  if (/^medovia/.test(a)) return 'Medovia';
  if (/^apohem/.test(a)) return 'Apohem';
  if (/^costco/.test(a)) return 'Costco';
  return null;
}
function chainOfOsm(t) {
  const s = fold([t.brand, t.name, t.operator].filter(Boolean).join(' '));
  if (/kronans|apoteksgruppen/.test(s)) return 'Kronans Apotek';
  if (/hjartat/.test(s)) return 'Apotek Hjärtat';
  if (/\bdoz\b|lloyds/.test(s)) return 'DOZ Apotek';
  if (/^apoteket\b|\bapoteket ab\b/.test(fold(t.brand || '')) || /^apoteket\b/.test(fold(t.name || ''))) return 'Apoteket';
  return null;
}
const ONLINE_RE = /e-?handel|e-apotek|distansapotek|dosapotek|\bdos\b/i;
const ONLINE_ACTORS = /^(apotea|apohem|apoex|medovia|meds|med24)/;
// units with a permit that do not serve walk-in customers
const NONPUBLIC_RE = /st[äa]ngt f[öo]r allm[äa]nheten|sjukhusapoteket|f[öo]rs[öo]rjningsenhet|nationella enheten|kundcentrum/i;

// ---------- master records from LV ----------
const recs = lv.documents.map((d) => {
  const k = kommunByName.get(String(d.municipality).trim().toLowerCase());
  if (!k) console.warn(`Unknown kommun "${d.municipality}" for ${d.name}`);
  return {
    lv: d, kedjaLv: chainOfActor(d.actorName, d.name), addr: addrParts(d.streetAddress), pc: pcDigits(d.postalcode),
    nk: nameKey(d.name), city: fold(d.city), kommun: k, chain: null, osm: [], lat: null, lon: null, coordSrc: null,
  };
});
const recByGln = new Map(recs.map((r) => [String(r.lv.glnCode), r]));

// Generic scorer between an LV record and a candidate {addr, pc, nk, city, lat, lon, kedja}
function score(r, c) {
  let s = 0;
  if (r.pc && c.pc) { if (r.pc === c.pc) s += 3; else if (r.pc.slice(0, 3) === c.pc.slice(0, 3)) s += 1; }
  const ss = streetSim(r.addr.street, c.addr.street);
  if (ss >= 0.8) s += 3; else if (ss >= 0.6) s += 1.5;
  if (r.addr.num && c.addr.num) s += r.addr.num === c.addr.num ? 2 : -1;
  // compare names without the place names (chains append ", Ort" inconsistently)
  const place = new Set([...r.city.split(' '), ...fold(r.kommun?.namn).split(' ')].filter((w) => w.length > 2));
  const strip = (n) => n.split(' ').filter((w) => !place.has(w)).join(' ');
  const na = strip(r.nk), nb = strip(c.nk);
  const ns = na && nb ? dice(na, nb) : 0;
  if (ns >= 0.9) s += 4; else if (ns >= 0.75) s += 2.5; else if (ns >= 0.55) s += 1;
  if (r.city && c.city && r.city === c.city) s += 0.5;
  const d = r.geoPrecision === 'postnummer' ? null : distM(r, c);
  if (d != null) { if (d <= 60) s += 4; else if (d <= 150) s += 3; else if (d <= 300) s += 1.5; else if (d <= 1000) s += 0.5; else if (d > 5000) s -= 6; }
  if (r.kedjaLv && c.kedja) s += r.kedjaLv === c.kedja ? 1 : -4;
  return s;
}
function candidateFilter(r, c) {
  if (r.pc && c.pc && r.pc.slice(0, 3) === c.pc.slice(0, 3)) return true;
  if (r.city && c.city && r.city === c.city) return true;
  const d = distM(r, c); return d != null && d < 3000;
}
/** Greedy one-to-one assignment by descending score. Returns { pairs, losers } */
function assign(rList, cList, minScore) {
  const cand = [];
  for (const c of cList) for (const r of rList) if (candidateFilter(r, c)) { const s = score(r, c); if (s >= minScore) cand.push({ r, c, s }); }
  cand.sort((a, b) => b.s - a.s);
  const usedR = new Set(), usedC = new Set(), pairs = [], losers = [];
  for (const x of cand) {
    if (usedC.has(x.c)) continue;
    if (usedR.has(x.r)) { if (x.s >= minScore + 2) losers.push(x); continue; }
    usedR.add(x.r); usedC.add(x.c); pairs.push(x);
  }
  return { pairs, losers: losers.filter((l) => !usedC.has(l.c) || pairs.find((p) => p.c === l.c)?.r !== l.r) };
}

const report = { genererad: new Date().toISOString(), matchning: {}, dubbletter: {}, omatchade: {} };

// ---------- 1. chain locators -> LV (GLN first, then address/name scoring within the same chain) ----------
const chainRecs = [];
for (const [kedja, v] of Object.entries(chains.chains || {})) for (const c of v.records) chainRecs.push({ ...c, kedja,
  addr: addrParts(c.gatuadress), pc: pcDigits(c.postnummer), nk: nameKey(c.namn), city: fold(c.ort) });
const chainLeft = [];
let byGln = 0;
for (const c of chainRecs) {
  const r = c.gln ? recByGln.get(String(c.gln)) : null;
  if (r && !r.chain) { r.chain = c; c.matched = 'gln'; byGln++; } else chainLeft.push(c);
}
const chainAssign = assign(recs.filter((r) => !r.chain && r.kedjaLv), chainLeft.filter((c) => !c.matched), 5);
for (const { r, c, s } of chainAssign.pairs) { r.chain = c; c.matched = `score ${s.toFixed(1)}`; }
// Pass 2: the only unmatched store of a chain in an ort, on both sides -> same pharmacy (moved/renumbered addresses)
let byUniqueOrt = 0;
{
  const leftC = chainRecs.filter((c) => !c.matched), leftR = recs.filter((r) => !r.chain && r.kedjaLv);
  const g = (k, x) => `${k}|${x}`;
  const cBy = {}, rBy = {};
  for (const c of leftC) (cBy[g(c.kedja, c.city)] ??= []).push(c);
  for (const r of leftR) (rBy[g(r.kedjaLv, r.city)] ??= []).push(r);
  for (const [k, cs] of Object.entries(cBy)) {
    const rs = rBy[k];
    if (cs.length === 1 && rs?.length === 1 && !/e-?handel|distans|dos/i.test(rs[0].lv.name)) {
      rs[0].chain = cs[0]; cs[0].matched = 'unik i orten'; byUniqueOrt++;
    }
  }
}
for (const r of recs) if (r.chain) { r.lat = r.chain.lat; r.lon = r.chain.lon; r.coordSrc = r.chain.kedja; }
report.matchning.kedjor = { per_gln: byGln, per_adress_namn: chainAssign.pairs.length, unik_i_orten: byUniqueOrt };
report.omatchade.kedjeposter_utan_lv = chainRecs.filter((c) => !c.matched).map((c) => ({ kedja: c.kedja, kedja_id: c.kedja_id, namn: c.namn, gatuadress: c.gatuadress, postnummer: c.postnummer, ort: c.ort }));

// ---------- 2a. geocode cache (written by geocode.mjs): provisional positions so OSM objects without address tags can match ----------
const geoKey = (d) => `${d.streetAddress || ''}|${pcDigits(d.postalcode)}|${d.city || ''}`;
// sanity check: a geocode must lie within 40 km of the median of chain-sourced points in the same kommun (when >= 3 exist)
const med = (a) => { const t = [...a].sort((p, q) => p - q); return t[Math.floor(t.length / 2)]; };
const chainPts = {};
for (const r of recs) if (r.lat != null && r.kommun) (chainPts[r.kommun.kod] ??= []).push(r);
const rejectedGeo = [];
for (const r of recs) if (r.lat == null) {
  const g = geocache[geoKey(r.lv)];
  if (g?.lat == null) continue;
  const pts = chainPts[r.kommun?.kod] || [];
  if (pts.length >= 3) {
    const mid = { lat: med(pts.map((x) => x.lat)), lon: med(pts.map((x) => x.lon)) };
    const dd = distM(g, mid);
    if (dd > 40000) { rejectedGeo.push({ id: r.lv.identifier, namn: r.lv.name, kommun: r.kommun.namn, km_fran_kommunmedian: Math.round(dd / 1000), precision: g.precision }); continue; }
  }
  r.lat = g.lat; r.lon = g.lon; r.coordSrc = `geokodning (${g.precision || 'adress'})`; r.geoPrecision = g.precision;
}
report.kvalitet_geokod_avvisad = rejectedGeo;

// ---------- 2. OSM -> LV ----------
const osmRecs = osm.elements.filter((e) => e.lat != null).map((e) => {
  const t = e.tags;
  return { e, kedja: chainOfOsm(t), addr: addrParts([t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')),
    pc: pcDigits(t['addr:postcode']), nk: nameKey(t.name || t.brand || ''), city: fold(t['addr:city']), lat: e.lat, lon: e.lon };
});
// threshold 4: an OSM object named just "Apoteket" with no address still matches at <=150 m with the same brand
const osmAssign = assign(recs, osmRecs, 4);
for (const { r, c, s } of osmAssign.pairs) { r.osm.push({ ...c, s }); c.matched = true; }
// Secondary OSM objects for an already matched pharmacy (node + building, duplicates) within 40 m and same chain
const osmDup = [];
for (const c of osmRecs) {
  if (c.matched) continue;
  for (const r of recs) {
    const o = r.osm[0]; if (!o) continue;
    const d = distM(o, c);
    if (d != null && d < 40 && (c.kedja === o.kedja || dice(c.nk, o.nk) > 0.7)) { osmDup.push({ lv_id: r.lv.identifier, namn: r.lv.name, osm_a: o.e.osm_id, osm_b: c.e.osm_id, avstand_m: Math.round(d) }); c.matched = 'dup'; break; }
  }
}
for (const r of recs) if ((r.lat == null || r.coordSrc?.startsWith('geokodning')) && r.osm[0]) { r.lat = r.osm[0].lat; r.lon = r.osm[0].lon; r.coordSrc = 'OpenStreetMap'; }
// unmatched OSM objects sitting on top of a pharmacy of another chain = outdated brand tag in OSM (e.g. ex-Apoteket now Kronans)
const osmStale = [];
for (const c of osmRecs) {
  if (c.matched) continue;
  for (const r of recs) { if (r.lat == null || r.coordSrc?.startsWith('geokodning')) continue; const dd = distM(r, c);
    if (dd != null && dd < 40) { osmStale.push({ osm_id: c.e.osm_id, osm_namn: c.e.tags.name || null, osm_brand: c.e.tags.brand || null, troligen: r.chain?.namn || r.lv.name, avstand_m: Math.round(dd) }); c.matched = 'stale'; break; } }
}
report.kvalitet_osm_foraldrad_kedja = osmStale;
report.matchning.osm = { matchade: osmAssign.pairs.length, osm_i_sverige: osmRecs.length };
report.dubbletter.osm_flera_objekt_samma_apotek = osmDup;
report.omatchade.osm_utan_lv = osmRecs.filter((c) => !c.matched).map((c) => ({ osm_id: c.e.osm_id, namn: c.e.tags.name || null, brand: c.e.tags.brand || null,
  adress: [c.e.tags['addr:street'], c.e.tags['addr:housenumber']].filter(Boolean).join(' ') || null, postnummer: c.e.tags['addr:postcode'] || null, lat: c.lat, lon: c.lon }));

// ---------- opening hours ----------
function parseOsmHours(oh) {
  if (!oh) return null;
  const s = oh.trim();
  if (/^24\/7$/.test(s)) return Object.fromEntries(DAYS.map((d) => [d, '00:00-24:00']));
  const DK = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };
  const week = Object.fromEntries(DAYS.map((d) => [d, null]));
  const rules = s.split(/\s*;\s*|\s*\|\|\s*|(?<=\d|off|closed),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/).filter(Boolean);
  let any = false;
  for (const rule of rules) {
    if (/^(PH|SH)\b/.test(rule) && !/^PH\s*,/.test(rule)) continue; // holiday-only rule
    if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|easter)\b|\[/.test(rule)) return null; // seasonal: too complex
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)?\s*(.*)$/);
    if (!m) return null;
    const daysPart = (m[1] || 'Mo-Su').replace(/\s/g, ''), timePart = m[2].trim();
    const idx = new Set();
    for (const tok of daysPart.split(',').filter(Boolean)) {
      if (tok === 'PH') continue;
      const [a, b] = tok.split('-');
      if (!(a in DK) || (b && !(b in DK))) return null;
      if (!b) idx.add(DK[a]); else for (let i = DK[a]; ; i = (i + 1) % 7) { idx.add(i); if (i === DK[b]) break; }
    }
    let val;
    if (/^(off|closed)$/i.test(timePart)) val = 'stängt';
    else {
      const spans = timePart.split(/\s*,\s*/);
      if (!spans.every((x) => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}\+?$/.test(x))) return null;
      val = spans.map((x) => x.replace(/\+$/, '').replace(/^(\d):/, '0$1:').replace(/-(\d):/, '-0$1:')).join(', ');
    }
    for (const i of idx) week[DAYS[i]] = val;
    any = true;
  }
  if (!any) return null;
  for (const d of DAYS) if (week[d] == null) week[d] = 'stängt'; // OSM: unspecified days are closed
  return week;
}
const hasHours = (w) => w && DAYS.some((d) => w[d] != null);

// ---------- build output ----------
const today = new Date().toISOString().slice(0, 10);
const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Slugs are persisted (data/slugs.json: id -> slug) so URLs never change between nightly runs.
const slugFile = path.join(DATA, 'slugs.json');
const slugMap = readJson(slugFile, {});
const usedSlugs = new Set(Object.values(slugMap));
const out = [];
for (const r of recs) {
  const d = r.lv, c = r.chain, o = r.osm[0]?.e, ot = o?.tags || {};
  const kedja = c?.kedja || r.kedjaLv || chainOfOsm(ot) || (ot.brand && !/^apotek$/i.test(ot.brand) ? ot.brand : null) || 'Fristående';
  let oppettider = null, kalla = null, typ = null;
  if (c && hasHours(c.oppettider)) { oppettider = c.oppettider; kalla = `${c.kedja} (${c.oppettider_typ})`; typ = c.oppettider_typ; }
  else if (o && parseOsmHours(ot.opening_hours)) { oppettider = parseOsmHours(ot.opening_hours); kalla = 'OpenStreetMap'; typ = 'ordinarie'; }
  const kallor = ['Läkemedelsverket'];
  if (c) kallor.push(c.kedja);
  if (o) kallor.push('OpenStreetMap');
  if (r.coordSrc?.startsWith('geokodning')) kallor.push('Nominatim/OpenStreetMap (geokodning)');
  const online = ONLINE_RE.test(d.name) || ONLINE_ACTORS.test(fold(d.actorName));
  const namn = c?.namn || d.name;
  let slug = slugMap[d.identifier];
  if (!slug) {
    const base = slugify(namn).includes(slugify(d.city)) ? slugify(namn) : slugify(`${namn} ${d.city}`);
    slug = base; for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSlugs.add(slug); slugMap[d.identifier] = slug;
  }
  const osmPhone = ot.phone || ot['contact:phone'] || null;
  const telefon = c?.telefon || osmPhone;
  const normTel = (t) => String(t || '').replace(/[^\d+]/g, '').replace(/^\+46/, '0');
  const isCentral = (t) => /^(\+46\s?|0)771/.test(String(t || '').replace(/[\s-]/g, ''));
  out.push({
    id: d.identifier,
    slug,
    namn,
    namn_lv: d.name,
    kedja,
    tillstandshavare: d.actorName?.replace(/\s+/g, ' ').trim(),
    org_nr: d.actorOrganizationNumber || null,
    gln: d.glnCode || null,
    gatuadress: d.streetAddress?.replace(/\s+/g, ' ').trim() || c?.gatuadress || null,
    postnummer: pcFmt(d.postalcode),
    ort: d.city ? d.city.charAt(0).toUpperCase() + d.city.slice(1) : null,
    kommun: r.kommun?.namn || d.municipality,
    kommunkod: r.kommun?.kod || null,
    lan: r.kommun ? lanByCode.get(r.kommun.kod.slice(0, 2)) : d.county,
    lat: r.lat != null ? +(+r.lat).toFixed(6) : null,
    lon: r.lon != null ? +(+r.lon).toFixed(6) : null,
    koordinat_kalla: r.coordSrc,
    telefon,
    telefon_typ: telefon ? (isCentral(telefon) ? 'kundservice' : 'apotek') : null,
    telefon_osm: osmPhone && normTel(osmPhone) !== normTel(telefon) && !isCentral(osmPhone) ? osmPhone : undefined,
    epost: c?.epost || ot.email || ot['contact:email'] || null,
    webb: c?.url || ot.website || ot['contact:website'] || null,
    oppettider: oppettider || Object.fromEntries(DAYS.map((x) => [x, null])),
    oppettider_kalla: kalla,
    oppettider_typ: typ,
    oppettider_kontrollerad: kalla === 'OpenStreetMap' ? (ot['check_date:opening_hours'] || ot.check_date || null) : undefined,
    avvikande_oppettider: c?.avvikande?.length ? c.avvikande : undefined,
    osm_opening_hours: ot.opening_hours || undefined,
    typ: online ? 'e-handel/dos/distans' : NONPUBLIC_RE.test(d.name) ? 'ej öppet för allmänheten' : (c || o ? 'butik' : 'okänd'),
    tillstand_fran: d.approvalStart?.slice(0, 10) || null,
    tillstand_till: d.approvalEnd && !d.approvalEnd.startsWith('2099') ? d.approvalEnd.slice(0, 10) : null,
    osm_id: o?.osm_id || null,
    kedja_id: c?.kedja_id || null,
    kallor,
    uppdaterad: today,
  });
}

// ---------- data-quality checks ----------
// coordinates far from the kommun's median position, and chain vs OSM coordinate disagreements
const byKommun = {};
for (const x of out) if (x.lat != null) (byKommun[x.kommun] ??= []).push(x);
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const suspicious = [];
for (const [k, list] of Object.entries(byKommun)) {
  if (list.length < 3) continue;
  const mid = { lat: median(list.map((x) => x.lat)), lon: median(list.map((x) => x.lon)) };
  for (const x of list) { const dd = distM(x, mid); if (dd > 60000) suspicious.push({ id: x.id, namn: x.namn, kommun: k, km_fran_kommunmedian: Math.round(dd / 1000), koordinat_kalla: x.koordinat_kalla }); }
}
const coordConflicts = [];
for (const r of recs) if (r.chain && r.osm[0]) { const dd = distM(r.chain, r.osm[0]); if (dd > 300) coordConflicts.push({ id: r.lv.identifier, namn: r.lv.name, avstand_m: Math.round(dd), kedja_lat: r.chain.lat, kedja_lon: r.chain.lon, osm_id: r.osm[0].e.osm_id }); }
// LV records sharing the same address (e.g. store + dos/e-commerce unit, or two permits)
const addrGroups = {};
for (const x of out) (addrGroups[`${fold(x.gatuadress)}|${x.postnummer}`] ??= []).push(x);
report.dubbletter.lv_samma_adress = Object.values(addrGroups).filter((g) => g.length > 1).map((g) => g.map((x) => ({ id: x.id, namn: x.namn_lv, typ: x.typ, gatuadress: x.gatuadress, postnummer: x.postnummer })));
report.dubbletter.kedja_konkurrerande_match = chainAssign.losers.map((l) => ({ kedja: l.c.kedja, kedja_namn: l.c.namn, lv_namn: l.r.lv.name, score: l.s }));
report.kvalitet = { koordinat_langt_fran_kommun: suspicious, kedja_osm_koordinatkonflikt_over_300m: coordConflicts };
report.omatchade.lv_utan_kedja_eller_osm = out.filter((x) => !x.kedja_id && !x.osm_id).map((x) => ({ id: x.id, namn: x.namn_lv, kedja: x.kedja, gatuadress: x.gatuadress, postnummer: x.postnummer, ort: x.ort, typ: x.typ }));
report.omatchade.lv_kedjeapotek_ej_i_kedjans_lista = out.filter((x) => ['Apoteket', 'Kronans Apotek', 'Apotek Hjärtat'].includes(x.kedja) && !x.kedja_id).map((x) => ({ id: x.id, namn: x.namn_lv, kedja: x.kedja, typ: x.typ, osm: !!x.osm_id }));

// ---------- stats ----------
const pct = (n, t) => `${((100 * n) / t).toFixed(1)}%`;
const N = out.length, stores = out.filter((x) => x.typ === 'butik' || x.typ === 'okänd');
const stat = (list) => ({ antal: list.length, med_koordinater: pct(list.filter((x) => x.lat != null).length, list.length),
  med_oppettider: pct(list.filter((x) => hasHours(x.oppettider)).length, list.length), med_telefon: pct(list.filter((x) => x.telefon).length, list.length) });
report.sammanfattning = { totalt: stat(out), publika_butik_eller_okand: stat(stores), kommuner_med_apotek: new Set(out.map((x) => x.kommun)).size };
report.per_kedja = {};
for (const k of [...new Set(out.map((x) => x.kedja))].sort()) report.per_kedja[k] = stat(out.filter((x) => x.kedja === k));
report.oppettider_kalla = {}; for (const x of out) report.oppettider_kalla[x.oppettider_kalla || 'saknas'] = (report.oppettider_kalla[x.oppettider_kalla || 'saknas'] || 0) + 1;
report.koordinat_kalla = {}; for (const x of out) report.koordinat_kalla[x.koordinat_kalla || 'saknas'] = (report.koordinat_kalla[x.koordinat_kalla || 'saknas'] || 0) + 1;
report.typ = {}; for (const x of out) report.typ[x.typ] = (report.typ[x.typ] || 0) + 1;
report.kallor = {
  'Läkemedelsverket': { url: 'https://www.lakemedelsverket.se/sv/handel-med-lakemedel/apotek/sok-apotek-som-har-tillstand', hamtad: lv.fetched, licens: 'Listad som öppna data på lakemedelsverket.se/sv/om-webbplatsen/oppna-data (CC0 eller CC BY 4.0) — ange "Källa: Läkemedelsverket".' },
  OpenStreetMap: { hamtad: osm.fetched, osm_base: osm.timestamp_osm_base, licens: 'ODbL 1.0 — attribution "© OpenStreetMap contributors" krävs; härledd databas ska delas under ODbL.' },
  SCB: { hamtad: scb.fetched, licens: 'CC0' },
  kedjor: Object.fromEntries(Object.entries(chains.chains || {}).map(([k, v]) => [k, { hamtad: v.fetched, antal: v.count, inaktuell: !!v.stale }])),
  hoppade_over: chains.skipped,
};

out.sort((a, b) => a.kommun.localeCompare(b.kommun, 'sv') || a.namn.localeCompare(b.namn, 'sv'));
writeJson(path.join(DATA, 'apotek.json'), out);
writeJson(slugFile, slugMap);
// per-kommun summary for kommun pages
const kSlug = (k) => slugify(k.namn);
const kSlugCount = {}; for (const k of scb.kommuner) kSlugCount[kSlug(k)] = (kSlugCount[kSlug(k)] || 0) + 1;
const kom = scb.kommuner.map((k) => {
  const list = out.filter((x) => x.kommunkod === k.kod);
  return { kommunkod: k.kod, kommun: k.namn, slug: kSlugCount[kSlug(k)] > 1 ? `${kSlug(k)}-${slugify(lanByCode.get(k.kod.slice(0, 2)))}` : kSlug(k), lan: lanByCode.get(k.kod.slice(0, 2)), antal_apotek: list.length,
    antal_butiker: list.filter((x) => x.typ === 'butik' || x.typ === 'okänd').length, orter: [...new Set(list.map((x) => x.ort))].sort((a, b) => a.localeCompare(b, 'sv')) };
});
writeJson(path.join(DATA, 'kommuner.json'), kom);
writeJson(path.join(DATA, 'rapport.json'), report);
fs.writeFileSync(path.join(DATA, 'LICENS-OCH-KALLOR.txt'), [
  'Källor för apotek.json',
  '- Läkemedelsverket, "Sök apotek som har tillstånd" (masterlista: namn, adress, kommun, län, tillståndshavare, GLN).',
  '  Öppna data (CC0 / CC BY 4.0 enligt lakemedelsverket.se/sv/om-webbplatsen/oppna-data) — ange "Källa: Läkemedelsverket".',
  '- Kedjornas egna apotekssök (Apoteket, Kronans Apotek, Apotek Hjärtat): koordinater, öppettider, telefon.',
  '- OpenStreetMap: © OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright',
  '  Sidor som visar OSM-härledda data (koordinater/öppettider med källa OpenStreetMap) måste visa attribution.',
  '- SCB: kommun- och länskoder (CC0).', '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ sammanfattning: report.sammanfattning, per_kedja: report.per_kedja, matchning: report.matchning,
  oppettider_kalla: report.oppettider_kalla, koordinat_kalla: report.koordinat_kalla, typ: report.typ,
  omatchade: Object.fromEntries(Object.entries(report.omatchade).map(([k, v]) => [k, v.length])),
  dubbletter: Object.fromEntries(Object.entries(report.dubbletter).map(([k, v]) => [k, v.length])),
  kvalitet: Object.fromEntries(Object.entries(report.kvalitet).map(([k, v]) => [k, v.length])) }, null, 1));
