// Build the four datasets from data/raw/*.json (written by fetch.mjs).
// Usage: node scripts/build.mjs
import path from 'node:path';
import {
  RAW, DATA, readJSON, writeJSON, log, Polygon, polygonOf, Grid, centerOf, distM, distToSegM,
  parseOpeningHours, normPostcode, normUrl, normPhone, yesNo, num,
} from './lib.mjs';

const t0 = Date.now();
const raw = (n) => {
  const j = readJSON(path.join(RAW, `${n}.json`));
  if (!j) throw new Error(`missing data/raw/${n}.json - run node scripts/fetch.mjs first`);
  return j;
};
const ADMIN = raw('admin');
const OSM_BASE = ADMIN.osm_base || ADMIN.fetched;
const UPPDATERAD = (raw('fuel').osm_base || new Date().toISOString()).slice(0, 10);
const idOf = (el) => `osm-${el.type}-${el.id}`;

// ------------------------------------------------------------ kommun / län
const LAN = ADMIN.elements.filter((e) => e.tags?.admin_level === '4').map((e) => ({
  kod: e.tags['ref:SE:scb'], namn: e.tags['name:sv'] || e.tags.name, poly: polygonOf(e),
}));
const lanByKod = Object.fromEntries(LAN.map((l) => [l.kod, l.namn]));
const KOMMUNER = ADMIN.elements.filter((e) => e.tags?.admin_level === '7').map((e) => ({
  kod: e.tags['ref:scb'] || e.tags.ref,
  namn: e.tags.short_name || (e.tags['name:sv'] || e.tags.name).replace(/ (kommun|stad)$/i, ''),
  poly: polygonOf(e),
}));
for (const k of KOMMUNER) k.lan = lanByKod[k.kod?.slice(0, 2)] || null;
log(`admin: ${KOMMUNER.length} kommuner, ${LAN.length} län`);
const locStats = { pip: 0, nearest: 0, none: 0 }; // none = dropped (outside Sweden)
function locate(lat, lon) {
  let hit = KOMMUNER.find((k) => k.poly && k.poly.contains(lat, lon));
  if (hit) locStats.pip++;
  else {
    // outside every polygon: snap to the nearest boundary within 500 m (digitising slop);
    // anything further away is outside Sweden (PBF extracts overlap the border) and is dropped
    let best = null, bd = Infinity;
    for (const k of KOMMUNER) if (k.poly?.inBBox(lat, lon, 0.1)) {
      const d = k.poly.distanceM(lat, lon); if (d < bd) { bd = d; best = k; }
    }
    if (best && bd < 500) { hit = best; locStats.nearest++; } else locStats.none++;
  }
  let lan = hit?.lan || null;
  if (!lan) lan = LAN.find((l) => l.poly?.contains(lat, lon))?.namn || null;
  return { kommun: hit?.namn || null, kommunkod: hit?.kod || null, lan };
}

// ------------------------------------------------------------ places (ort)
const PLACE_W = { city: 2, town: 1.5, village: 1, suburb: 1, hamlet: 0.6, quarter: 0.6, neighbourhood: 0.5 };
const placeGrid = new Grid(0.1);
for (const p of raw('places').elements) {
  if (!p.tags?.name || !PLACE_W[p.tags.place]) continue;
  placeGrid.add(p.lat, p.lon, { name: p.tags['name:sv'] || p.tags.name, place: p.tags.place, lat: p.lat, lon: p.lon });
}
const MAIN_PLACES = new Set(['city', 'town', 'village', 'suburb']);
function nearestPlace(lat, lon) {
  let best = null, bs = Infinity;
  for (const p of placeGrid.near(lat, lon, 1)) {
    const d = distM(lat, lon, p.lat, p.lon);
    // spec: nearest town/village/suburb (city included); hamlets only as a close fallback
    const score = MAIN_PLACES.has(p.place) ? d / PLACE_W[p.place] : d < 2000 ? d * 3 : Infinity;
    if (score < bs && d < 12000) { bs = score; best = p; }
  }
  return best;
}
// "BORLÄNGE" / "borlänge" -> "Borlänge" (mixed-case values are kept as mapped)
const fixCase = (s) => (s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s);
function ortOf(tags, lat, lon) {
  const c = tags['addr:city'] || tags['addr:postal_city'];
  if (c) return { ort: fixCase(c.trim()), ortKalla: 'addr:city' };
  const p = nearestPlace(lat, lon);
  return p ? { ort: p.name, ortKalla: `place=${p.place}` } : { ort: null, ortKalla: null };
}

// ------------------------------------------------------------ streets
function streetIndex(name) {
  const g = new Grid(0.005);
  for (const w of raw(name).elements) {
    if (!w.geometry || !w.tags?.name) continue;
    const pen = /^(footway|cycleway|path|track|service)$/.test(w.tags.highway) ? 1.6 : 1;
    for (let i = 1; i < w.geometry.length; i++) {
      const a = w.geometry[i - 1], b = w.geometry[i];
      if (!a || !b) continue;
      g.add((a.lat + b.lat) / 2, (a.lon + b.lon) / 2, { a, b, name: w.tags.name, pen });
    }
  }
  return g;
}
function nearestStreet(g, lat, lon, maxM = 120) {
  let best = null, bs = Infinity;
  for (const s of g.near(lat, lon, 1)) {
    const d = distToSegM(lat, lon, s.a, s.b);
    if (d <= maxM && d * s.pen < bs) { bs = d * s.pen; best = s.name; }
  }
  return best;
}

// ------------------------------------------------------------ common record
function addressOf(t) {
  const street = t['addr:street'] || t['addr:place'];
  const gatuadress = street ? [street, t['addr:housenumber']].filter(Boolean).join(' ') : null;
  return { gatuadress, postnummer: normPostcode(t['addr:postcode']) };
}
function record(el, { typ, namn, kedja, extra, ctx }) {
  const t = el.tags || {};
  return {
    id: idOf(el),
    namn: namn ?? null,
    kedja: kedja ?? null,
    typ,
    gatuadress: ctx.adr.gatuadress,
    postnummer: ctx.adr.postnummer,
    ort: ctx.ort,
    kommun: ctx.loc.kommun,
    lan: ctx.loc.lan,
    lat: +ctx.c.lat.toFixed(6),
    lon: +ctx.c.lon.toFixed(6),
    telefon: normPhone(t.phone || t['contact:phone'] || t['phone:mobile']),
    webb: normUrl(t.website || t['contact:website'] || t.url),
    oppettider: parseOpeningHours(t.opening_hours),
    extra: { kommunkod: ctx.loc.kommunkod, ort_kalla: ctx.ortKalla, ...extra, opening_hours_osm: t.opening_hours || null },
    kallor: ['OpenStreetMap'],
    uppdaterad: UPPDATERAD,
  };
}
function ctxOf(el) {
  const c = centerOf(el);
  if (!c) return null;
  const t = el.tags || {};
  const loc = locate(c.lat, c.lon);
  if (!loc.kommun) return null; // outside Sweden
  return { c, loc, adr: addressOf(t), ...ortOf(t, c.lat, c.lon) };
}
const lc = (s) => (s || '').toLowerCase().trim();

// ------------------------------------------------------------ fuel
function buildFuel() {
  const els = raw('fuel').elements.filter((e) => e.tags);
  const nameCount = {};
  for (const e of els) if (e.tags.name) nameCount[lc(e.tags.name)] = (nameCount[lc(e.tags.name)] || 0) + 1;
  const out = [];
  for (const el of els) {
    const t = el.tags;
    if (/^(no|private)$/.test(t.access)) continue;
    const ctx = ctxOf(el); if (!ctx) continue;
    const kedja = t.brand || t.operator || null;
    let namn = t.name || null;
    // chain-only names ("Circle K") are not unique: append ort for a usable page title
    if (namn && ctx.ort && (nameCount[lc(namn)] >= 3 || lc(namn) === lc(t.brand)) && !lc(namn).includes(lc(ctx.ort))) namn = `${namn} ${ctx.ort}`;
    if (!namn) namn = kedja ? `${kedja}${ctx.ort ? ' ' + ctx.ort : ''}` : ctx.ort ? `Bensinstation ${ctx.ort}` : null;
    const fuels = {};
    for (const [k, v] of Object.entries(t)) if (k.startsWith('fuel:') && v !== 'no') fuels[k.slice(5)] = v === 'yes' ? true : v;
    const automated = yesNo(t.automated);
    out.push(record(el, {
      typ: automated === true ? 'automatstation' : t.hgv === 'only' ? 'truckstation' : 'bensinstation',
      namn, kedja, ctx,
      extra: {
        osm_namn: t.name || null,
        brand: t.brand || null, operator: t.operator || null,
        drivmedel: Object.keys(fuels).length ? fuels : null,
        self_service: yesNo(t.self_service), automated,
        shop: t.shop || null, car_wash: yesNo(t.car_wash), compressed_air: yesNo(t.compressed_air),
        hgv: t.hgv || null, toilets: yesNo(t.toilets),
        payment: Object.keys(t).some((k) => k.startsWith('payment:')) ? Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('payment:')).map(([k, v]) => [k.slice(8), yesNo(v)])) : null,
      },
    }));
  }
  return out;
}

// ------------------------------------------------------------ parking
const PARK_TYP = {
  surface: 'markparkering', 'multi-storey': 'parkeringshus', underground: 'parkeringsgarage', rooftop: 'takparkering',
  street_side: 'gatuparkering', lane: 'gatuparkering', on_kerb: 'gatuparkering', half_on_kerb: 'gatuparkering',
  layby: 'rastficka', carports: 'carport', garage_boxes: 'garage', sheds: 'garage',
};
const PARK_LABEL = { parkeringshus: 'Parkeringshus', parkeringsgarage: 'Parkeringsgarage', takparkering: 'Takparkering', gatuparkering: 'Gatuparkering' };
const PARK_MIN_CAP = +(process.env.PARK_MIN_CAP || 20);
const PARK_MIN_AREA = +(process.env.PARK_MIN_AREA_M2 || 0); // 0 = off (spec); e.g. 2500 adds big unnamed lots
function buildParking() {
  const els = raw('parking').elements.filter((e) => e.tags?.amenity === 'parking');
  const streets = streetIndex('parking_streets');
  const c = { osm_parkeringar: els.length, kept: 0, excl_access: 0, excl_not_useful: 0, excl_private_type: 0, excl_vehicle_only: 0, named: 0, cap_min: 0, multi_under: 0, area_min: 0,
    regler: { PARK_MIN_CAP, PARK_MIN_AREA_M2: PARK_MIN_AREA || null }, what_if_publika: {} };
  const PRIV = /^(private|customers|no|delivery|permit|employees|residents)$/;
  // "what if" counts over all publicly accessible lots, to help tune the filter
  const pub = els.filter((e) => !PRIV.test(e.tags.access));
  const wi = (f) => pub.filter((e) => f(e.tags, num(e.tags.capacity), e.area_m2 || 0)).length;
  const base = (t, cap) => !!t.name || (cap ?? 0) >= 20 || /^(multi-storey|underground)$/.test(t.parking);
  Object.assign(c.what_if_publika, {
    alla_publika: pub.length,
    spec_namn_cap20_hus: wi((t, cap) => base(t, cap)),
    cap10_istallet_for_20: wi((t, cap) => !!t.name || (cap ?? 0) >= 10 || /^(multi-storey|underground)$/.test(t.parking)),
    spec_plus_yta_500m2: wi((t, cap, a) => base(t, cap) || a >= 500),
    spec_plus_yta_1000m2: wi((t, cap, a) => base(t, cap) || a >= 1000),
    spec_plus_yta_2500m2: wi((t, cap, a) => base(t, cap) || a >= 2500),
    spec_plus_yta_5000m2: wi((t, cap, a) => base(t, cap) || a >= 5000),
    har_area_m2: pub.filter((e) => e.area_m2).length,
  });
  const out = [];
  for (const el of els) {
    const t = el.tags;
    const cap = num(t.capacity);
    const named = !!t.name, big = cap != null && cap >= PARK_MIN_CAP, structure = /^(multi-storey|underground)$/.test(t.parking);
    const large = PARK_MIN_AREA > 0 && (el.area_m2 || 0) >= PARK_MIN_AREA;
    if (!(named || big || structure || large)) { c.excl_not_useful++; continue; }
    if (PRIV.test(t.access)) { c.excl_access++; continue; }
    if (/^(garage_boxes|carports|sheds)$/.test(t.parking) && !/^(yes|public)$/.test(t.access)) { c.excl_private_type++; continue; }
    if (t.motorcar === 'no' && (t.motorcycle === 'designated' || t.hgv === 'designated' || t.bus === 'designated')) { c.excl_vehicle_only++; continue; }
    const ctx = ctxOf(el); if (!ctx) continue;
    const typ = PARK_TYP[t.parking] || 'parkering';
    const gata = t['addr:street'] || nearestStreet(streets, ctx.c.lat, ctx.c.lon);
    const namn = t.name || (gata ? `${PARK_LABEL[typ] || 'Parkering'} vid ${gata}` : null);
    if (named) c.named++; if (big) c.cap_min++; if (structure) c.multi_under++; if (large) c.area_min++;
    out.push(record(el, {
      typ, namn, kedja: t.operator || t.brand || null, ctx,
      extra: {
        namngiven: named,
        capacity: cap, area_m2: el.area_m2 || null, 'capacity:disabled': num(t['capacity:disabled']) ?? yesNo(t['capacity:disabled']),
        'capacity:charging': num(t['capacity:charging']) ?? yesNo(t['capacity:charging']),
        'capacity:parent': num(t['capacity:parent']),
        fee: yesNo(t.fee), charge: t.charge || null, maxstay: t.maxstay || null,
        parking: t.parking || null, access: t.access || null, park_ride: yesNo(t.park_ride),
        surface: t.surface || null, covered: yesNo(t.covered), supervised: yesNo(t.supervised),
        operator: t.operator || null,
      },
    }));
  }
  c.kept = out.length;
  return { out, stats: c };
}

// ------------------------------------------------------------ playgrounds
function buildPlaygrounds() {
  const els = raw('playgrounds').elements.filter((e) => e.tags?.leisure === 'playground');
  const streets = streetIndex('playground_streets');
  // equipment counts: playground=* features inside the polygon (or within 30 m of a node playground)
  const pg = new Grid(0.01);
  const polys = new Map();
  for (const el of els) {
    const c = centerOf(el); if (!c) continue;
    const p = el.type !== 'node' ? polygonOf(el) : null;
    if (p) polys.set(el, p);
    pg.add(c.lat, c.lon, { el, c });
  }
  const equip = new Map();
  for (const q of raw('playground_equipment').elements) {
    const v = q.tags?.playground; if (!v || q.tags.leisure === 'playground') continue;
    const c = centerOf(q); if (!c) continue;
    let host = null;
    for (const { el, c: pc } of pg.near(c.lat, c.lon, 1)) {
      const p = polys.get(el);
      if (p ? p.contains(c.lat, c.lon) : distM(c.lat, c.lon, pc.lat, pc.lon) < 30) { host = el; break; }
    }
    if (!host) continue;
    let m = equip.get(host); if (!m) equip.set(host, (m = {}));
    for (const x of v.split(';')) m[x.trim()] = (m[x.trim()] || 0) + 1;
  }
  const out = [];
  for (const el of els) {
    const t = el.tags;
    if (/^(private|no|customers)$/.test(t.access)) continue;
    const ctx = ctxOf(el); if (!ctx) continue;
    const gata = t['addr:street'] || nearestStreet(streets, ctx.c.lat, ctx.c.lon);
    const namn = t.name || (gata ? `Lekplats vid ${gata}` : null);
    const e = equip.get(el) || null;
    out.push(record(el, {
      typ: 'lekplats', namn, kedja: t.operator || null, ctx,
      extra: {
        namngiven: !!t.name,
        namn_kalla: t.name ? 'osm' : gata ? (t['addr:street'] ? 'addr:street' : 'närmaste gata') : null,
        utrustning: e, utrustning_antal: e ? Object.values(e).reduce((a, b) => a + b, 0) : 0,
        surface: t.surface || null, wheelchair: t.wheelchair || null,
        min_age: num(t.min_age), max_age: num(t.max_age), operator: t.operator || null,
        theme: t.playground_theme || t.theme || null, lit: yesNo(t.lit), fenced: yesNo(t.fenced || (t.barrier ? 'yes' : null)),
        indoor: yesNo(t.indoor),
      },
    }));
  }
  return out;
}

// ------------------------------------------------------------ swimming halls
const SWIM_RE = /simhall|badhus|simhallsbad|äventyrsbad|inomhusbad|simarena|simstadion|varmbadhus/i;
const HOTEL_RE = /\bhotel|\bhotell|resort|camping|vandrarhem|stugby|gästhem|\bspa\b|\bspa hotel/i;
function buildSwim() {
  const cand = raw('swim_candidates').elements.filter((e) => e.tags);
  const hotels = raw('hotels').elements.map((h) => ({ h, p: polygonOf(h), c: centerOf(h) })).filter((x) => x.c);
  const hotelGrid = new Grid(0.01); for (const x of hotels) hotelGrid.add(x.c.lat, x.c.lon, x);
  const inHotel = (lat, lon) => hotelGrid.near(lat, lon, 1).some((x) => (x.p ? x.p.contains(lat, lon) : distM(lat, lon, x.c.lat, x.c.lon) < 40));
  const st = { candidates: cand.length, excl_access: 0, excl_hotel: 0, excl_outdoor_or_unnamed_pool: 0, excl_other: 0, merged: 0 };

  const NOT_BATH_LEISURE = /^(park|garden|playground|pitch|sauna|marina|nature_reserve|beach_resort|bathing_place|picnic_site|common|slipway|fitness_station)$/;
  const NOT_BATH_AMENITY = /^(dressing_room|toilets|shower|parking|bench|restaurant|cafe|fast_food|bus_station|kiosk|bicycle_parking|waste_basket|shelter)$/;
  const prio = (t) => {
    if (!/swimming/.test(t.sport || '') && (NOT_BATH_LEISURE.test(t.leisure || '') || NOT_BATH_AMENITY.test(t.amenity || ''))) return 0;
    if (/^(sports_centre|sports_hall|water_park)$/.test(t.leisure) && (/swimming/.test(t.sport || '') || t.leisure === 'water_park' || SWIM_RE.test(t.name || ''))) return 3;
    if (t.amenity === 'public_bath' || (t.building && (/swimming/.test(t.sport || '') || t.building === 'swimming_pool' || SWIM_RE.test(t.name || '')))) return 2;
    if (t.leisure === 'swimming_pool') return 1;
    if (SWIM_RE.test(t.name || '')) return 2;
    return 0;
  };
  const list = [];
  for (const el of cand) {
    const t = el.tags, c = centerOf(el); if (!c) continue;
    const p = prio(t);
    if (!p) { st.excl_other++; continue; }
    if (/^(highway|railway|public_transport)$/.test(Object.keys(t).find((k) => /^(highway|railway|public_transport)$/.test(k)) || '') || t.amenity === 'parking' || t.shop) { st.excl_other++; continue; }
    if (/^(private|no|customers)$/.test(t.access)) { st.excl_access++; continue; }
    if (t.tourism || HOTEL_RE.test(t.name || '') || HOTEL_RE.test(t.operator || '') || inHotel(c.lat, c.lon)) { st.excl_hotel++; continue; }
    if (/kallbad|utomhusbad|friluftsbad|badplats|bastu|wake ?park|kabelpark/i.test(t.name || '') || (/utomhusbad|friluftsbad|havsbad/i.test(t.name || '') && !/simhall/i.test(t.name || ''))) { st.excl_other++; continue; }
    const indoor = t.indoor === 'yes' || t.covered === 'yes' || !!t.building || (t.location || '') === 'indoor';
    if (p === 1 && !(t.name && (indoor || SWIM_RE.test(t.name)))) { st.excl_outdoor_or_unnamed_pool++; continue; }
    if (p >= 2 && !t.name && !(/swimming/.test(t.sport || ''))) { st.excl_other++; continue; }
    if (t.amenity === 'public_bath' && !SWIM_RE.test(t.name || '') && !/swimming/.test(t.sport || '') && !/^(swimming|hot_spring)$/.test(t.bath_type || '')) { st.excl_other++; continue; }
    list.push({ el, t, c, p, poly: el.type !== 'node' ? polygonOf(el) : null, pools: [], indoor });
  }
  // merge: lower-priority / duplicate candidates inside (or next to, same name) an accepted hall
  list.sort((a, b) => b.p - a.p || (b.t.name ? 1 : 0) - (a.t.name ? 1 : 0) || (b.el.type === 'node' ? -1 : 1));
  const tok = (s) => new Set(lc(s).split(/[^a-zåäö0-9]+/).filter((w) => w.length > 2));
  const similar = (a, b) => { if (!a || !b) return true; const A = tok(a), B = tok(b); for (const w of A) if (B.has(w)) return true; return false; };
  const accepted = [];
  for (const x of list) {
    const host = accepted.find((h) => (h.poly && h.poly.contains(x.c.lat, x.c.lon)) || (x.poly && x.poly.contains(h.c.lat, h.c.lon) && similar(h.t.name, x.t.name)) || (distM(h.c.lat, h.c.lon, x.c.lat, x.c.lon) < 200 && similar(h.t.name, x.t.name)));
    if (host) { st.merged++; host.merged = (host.merged || []).concat(idOf(x.el)); for (const k of ['opening_hours', 'website', 'phone', 'addr:street', 'addr:housenumber', 'addr:postcode', 'addr:city', 'operator', 'wheelchair', 'sauna']) if (!host.t[k] && x.t[k]) host.t = { ...host.t, [k]: x.t[k] }; continue; }
    accepted.push(x);
  }
  // pools inside each hall (any leisure=swimming_pool, incl. those without name)
  const hallGrid = new Grid(0.01); for (const h of accepted) hallGrid.add(h.c.lat, h.c.lon, h);
  for (const q of raw('swim_pools').elements) {
    const c = centerOf(q); if (!c || !q.tags) continue;
    const h = hallGrid.near(c.lat, c.lon, 1).find((h) => (h.poly ? h.poly.contains(c.lat, c.lon) : h.el.id === q.id && h.el.type === q.type));
    if (h) h.pools.push(q.tags);
  }
  const out = [];
  for (const h of accepted) {
    const t = h.t, el = { ...h.el, tags: t };
    const ctx = ctxOf(el); if (!ctx) continue;
    const pools = h.pools.length ? h.pools : t.leisure === 'swimming_pool' ? [t] : [];
    const langder = pools.map((p) => num(p.length)).filter((x) => x != null).sort((a, b) => b - a);
    const typ = t.leisure === 'water_park' ? 'äventyrsbad' : t.amenity === 'public_bath' ? 'badhus' : 'simhall';
    out.push(record(el, {
      typ, namn: t.name || (ctx.ort ? `Simhall ${ctx.ort}` : null), kedja: t.operator || t.brand || null, ctx,
      extra: {
        namngiven: !!t.name,
        bassanger: pools.length || null, bassanglangder: langder.length ? langder : null,
        bassangtyper: pools.map((p) => p.swimming_pool).filter(Boolean),
        sauna: yesNo(t.sauna) ?? (/sauna/.test(t.sport || '') ? true : null),
        wheelchair: t.wheelchair || null, fee: yesNo(t.fee), access: t.access || null,
        inomhus: t.indoor === 'no' || t.covered === 'no' ? false : h.indoor || /simhall|badhus|hallen|hall|arena|inomhus/i.test(t.name || '') || h.pools.some((p) => p.indoor === 'yes') ? true : null,
        operator: t.operator || null, sport: t.sport || null, osm_taggar: { leisure: t.leisure || null, amenity: t.amenity || null, building: t.building || null },
        sammanslagna_osm_id: h.merged || null,
      },
    }));
  }
  return { out, stats: st };
}

// ------------------------------------------------------------ stats + write
function stats(arr, osmNamed) {
  const n = arr.length, pct = (f) => (n ? +(100 * arr.filter(f).length / n).toFixed(1) : 0);
  const per = {}; for (const x of arr) if (x.kommun) per[x.kommun] = (per[x.kommun] || 0) + 1;
  const dupNames = {}; for (const x of arr) if (x.namn) { const k = `${x.kommun}|${x.namn}`; dupNames[k] = (dupNames[k] || 0) + 1; }
  return {
    antal: n,
    pct_namn_osm: pct(osmNamed), pct_namn_satt: pct((x) => x.namn), pct_oppettider: pct((x) => x.oppettider),
    pct_opening_hours_tag: pct((x) => x.extra.opening_hours_osm), pct_kommun: pct((x) => x.kommun), pct_lan: pct((x) => x.lan),
    pct_ort: pct((x) => x.ort), pct_gatuadress: pct((x) => x.gatuadress), pct_postnummer: pct((x) => x.postnummer),
    pct_telefon: pct((x) => x.telefon), pct_webb: pct((x) => x.webb),
    kommuner_med_objekt: Object.keys(per).length,
    kommuner_utan_objekt: KOMMUNER.map((k) => k.namn).filter((k) => !per[k]).sort(),
    dubblettnamn_inom_kommun: Object.values(dupNames).filter((v) => v > 1).reduce((a, b) => a + b, 0),
  };
}

const fuel = buildFuel(); log(`fuel: ${fuel.length}`);
const parking = buildParking(); log(`parking: ${parking.out.length}`, parking.stats);
const play = buildPlaygrounds(); log(`playgrounds: ${play.length}`);
const swim = buildSwim(); log(`swim: ${swim.out.length}`, swim.stats);

// generated names ("Lekplats vid Storgatan") that repeat within a kommun get ", <ort>" appended when that separates them
function disambiguate(arr) {
  const groups = {};
  for (const x of arr) if (x.namn && x.extra.namngiven === false) (groups[`${x.kommun}|${x.namn}`] ||= []).push(x);
  let n = 0;
  for (const g of Object.values(groups)) {
    if (g.length < 2 || new Set(g.map((x) => x.ort)).size < 2) continue;
    for (const x of g) if (x.ort && !x.namn.includes(x.ort)) { x.namn = `${x.namn}, ${x.ort}`; n++; }
  }
  return n;
}
log(`disambiguated names: lekplatser ${disambiguate(play)}, parkeringar ${disambiguate(parking.out)}`);

// chain names: unify case variants ("din-X"/"Din-X", "aimo park"/"Aimo Park") to the most common spelling
function normChains(arr) {
  const cnt = {};
  for (const x of arr) if (x.kedja) { const k = lc(x.kedja); (cnt[k] ||= {})[x.kedja] = (cnt[k][x.kedja] || 0) + 1; }
  const best = Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, Object.entries(v).sort((a, b) => b[1] - a[1] || (/[A-Z]/.test(b[0]) ? 1 : -1))[0][0]]));
  for (const x of arr) if (x.kedja) x.kedja = best[lc(x.kedja)];
}
for (const a of [fuel, parking.out, play, swim.out]) normChains(a);

const sortFn = (a, b) => (a.lan || '~').localeCompare(b.lan || '~', 'sv') || (a.kommun || '~').localeCompare(b.kommun || '~', 'sv') || (a.namn || '~').localeCompare(b.namn || '~', 'sv') || a.id.localeCompare(b.id);
const sets = { bensinstationer: fuel, parkeringar: parking.out, lekplatser: play, simhallar: swim.out };
for (const [k, v] of Object.entries(sets)) { v.sort(sortFn); writeJSON(path.join(DATA, `${k}.json`), v, true); }

// kommun list with counts (one page per kommun)
const kommunOut = KOMMUNER.map((k) => ({
  kommunkod: k.kod, namn: k.namn, lan: k.lan,
  antal: Object.fromEntries(Object.entries(sets).map(([n, arr]) => [n, arr.filter((x) => x.extra.kommunkod === k.kod).length])),
})).sort((a, b) => a.kommunkod.localeCompare(b.kommunkod));
writeJSON(path.join(DATA, 'kommuner.json'), kommunOut, true);

const meta = {
  genererad: new Date().toISOString(),
  osm_data_tidsstampel: OSM_BASE,
  kalla: 'OpenStreetMap via Overpass API',
  licens: 'Open Database License (ODbL) 1.0',
  attribution: '© OpenStreetMap-bidragsgivare. Data tillgänglig under Open Database License (ODbL), https://www.openstreetmap.org/copyright',
  attribution_html: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsgivare (ODbL)',
  krav: 'Visa attributionen på varje sida som visar datat. Härledda databaser måste delas under ODbL om de distribueras.',
  lokalisering: locStats,
  filter: { parkeringar: parking.stats, simhallar: swim.stats },
  statistik: {
    bensinstationer: stats(fuel, (x) => x.extra.osm_namn),
    parkeringar: stats(parking.out, (x) => x.extra.namngiven),
    lekplatser: stats(play, (x) => x.extra.namngiven),
    simhallar: stats(swim.out, (x) => x.extra.namngiven),
  },
  build_sekunder: +((Date.now() - t0) / 1000).toFixed(1),
};
writeJSON(path.join(DATA, 'meta.json'), meta, true);
for (const [k, s] of Object.entries(meta.statistik)) {
  const { kommuner_utan_objekt, ...rest } = s;
  log(k, JSON.stringify(rest), `utan objekt: ${kommuner_utan_objekt.length}`);
}
log('lokalisering', JSON.stringify(locStats), `build ${meta.build_sekunder} s`);
