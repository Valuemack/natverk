// Offline build: OSM start file + data/raw/facilities.json -> data/simhallar.json, data/kommuner.json, data/slugs.json, data/rapport.json
// Official (website) facts win over OSM. Matching: name tokens within the kommun, website URL, street address, coordinates (< 200 m).
import path from 'node:path';
import { DATA_DIR, RAW_DIR, OSM_FILE, OSM_KOMMUNER, readJson, writeJson, slugify, haversineM, kommunForPoint, today, nowIso, DAYS } from './lib.mjs';
import { strip, coreTokens, NAME_JUNK } from './parse.mjs';

const DATE = today();
const osmAll = readJson(OSM_FILE);
const kommuner = readJson(OSM_KOMMUNER);
const kByKod = Object.fromEntries(kommuner.map((k) => [k.kommunkod, k]));
const kByName = Object.fromEntries(kommuner.map((k) => [strip(k.namn), k]));
const fac = readJson(path.join(RAW_DIR, 'facilities.json')).facilities;
const crawl = readJson(path.join(RAW_DIR, 'crawl-summary.json'), { kommuner: [], blockerade_vardar: [] });
const rapport = { skapad: nowIso(), osm_exkluderade: [], osm_dubbletter: [], matchningar: 0, nya_fran_webb: [], omatchade_anlaggningar: [], varningar: [] };

// ---------------------------------------------------------------- 1. OSM base, cleaned
const NOT_HALL = /(parken$|park$|plaskdamm|lekplats|kallbad|badplats|strand|camping|hotell)/i;
let base = [];
for (const r of osmAll) {
  if (r.extra?.osm_taggar?.leisure === 'park' || NOT_HALL.test(r.namn || '')) { rapport.osm_exkluderade.push({ id: r.id, namn: r.namn, kommun: r.kommun }); continue; }
  base.push(structuredClone(r));
}
// OSM duplicates: same core name in the same kommun within 400 m (e.g. sports centre + water park polygon)
const dropped = new Set();
for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) {
  const a = base[i], b = base[j]; if (dropped.has(b.id) || dropped.has(a.id) || a.kommun !== b.kommun) continue;
  const ta = coreTokens(a.namn), tb = coreTokens(b.namn);
  if (!ta.length || ta.join(' ') !== tb.join(' ')) continue;
  if (haversineM(a, b) > 400) continue;
  if (b.typ === 'äventyrsbad') a.typ = 'äventyrsbad';
  for (const k of ['gatuadress', 'postnummer', 'ort', 'telefon', 'webb']) if (!a[k] && b[k]) a[k] = b[k];
  if (!a.oppettider && b.oppettider) a.oppettider = b.oppettider;
  a.extra.sammanslagna_osm_id = [...(a.extra.sammanslagna_osm_id || []), b.id];
  dropped.add(b.id); rapport.osm_dubbletter.push({ behallen: a.id, borttagen: b.id, namn: b.namn });
}
base = base.filter((r) => !dropped.has(r.id));

// ---------------------------------------------------------------- 2. facility clean-up and merge of same-hall groups
const useful = (f) => f.oppettider || f.priser || f.bassanger || f.adress || f.oppettider_per_del;
// kommun context of a facility: crawl files of kommuner whose own website hosts it; external hosts (a neighbour's bath linked
// from a kommun page) only count when no other kommun's own site describes a hall with the same name.
const siteHost = Object.fromEntries(readJson(path.join(RAW_DIR, 'kommun-sites.json')).kommuner.map((k) => [k.kommunkod, new URL(k.site).host.replace(/^www\./, '')]));
const ownSite = (f, kod) => { const h = f.host.replace(/^www\./, ''); const s = siteHost[kod]; return !!s && (h === s || h.endsWith('.' + s)); };
const sameTok = (a, b) => a.some((x) => b.some((y) => x === y || (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x)))));
const operatorOf = (host) => /medley\.se$/.test(host) ? 'Medley' : /actic\.se$/.test(host) ? 'Actic' : null;
// blocked hosts are never used, even if pages were cached before the block
const blockedHosts = new Set((crawl.blockerade_vardar || []).filter((b) => /AI-agenter|Disallow|botskydd/.test(b.orsak)).flatMap((b) => [b.host, b.host.replace(/^www\./, '')]));
const facs = fac.filter((f) => !blockedHosts.has(f.host) && !blockedHosts.has(f.host.replace(/^www\./, '')));
const ownSiteFacs = facs.filter((f) => f.filer.some((k) => !k.startsWith('op-') && ownSite(f, k)));
const kommunCache = new Map();
function kommunOf(f) {
  if (kommunCache.has(f)) return kommunCache.get(f);
  const raw = f.filer.filter((x) => !x.startsWith('op-'));
  let res = raw.filter((k) => ownSite(f, k));
  if (!res.length && raw.length) {
    // external host linked from kommun pages: coordinates decide; else if another kommun's own site has a hall with the same name, it belongs there
    const kp = f.koordinater ? kommunForPoint(f.koordinater.lat, f.koordinater.lon) : null;
    if (kp) res = [kp.kod];
    else {
      const other = ownSiteFacs.map((o) => ({ o, own: o.filer.filter((k) => !k.startsWith('op-') && ownSite(o, k)) }))
        .find(({ o, own }) => o !== f && f.tokens.length && sameTok(f.tokens, o.tokens) && own.length && !own.some((k) => raw.includes(k)));
      res = other ? other.own : raw;
    }
  }
  kommunCache.set(f, res);
  return res;
}

// ---------------------------------------------------------------- 3. matching facility -> OSM record
const byKommun = {};
for (const r of base) (byKommun[r.extra.kommunkod] ||= []).push(r);
const norm = (u) => (u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/(index\.html?)?$/, '');
function score(f, r) {
  let s = 0; const why = [];
  const rt = coreTokens(r.namn); const ft = f.tokens;
  if (rt.length && ft.length && sameTok(ft, rt)) { s += 5; why.push('namn'); }
  // place-name tokens: OSM "Simhallen" in Ort X vs facility "X simhall"
  const place = [r.ort, r.kommun].filter(Boolean).map((x) => coreTokens(x)).flat();
  if (!rt.length && place.length && sameTok(ft, place)) { s += 3; why.push('ort'); }
  if (r.webb) { const w = norm(r.webb); if (f.urls.some((u) => { const n = norm(u); return n === w || n.startsWith(w + '/') || w.startsWith(n + '/'); })) { s += 6; why.push('webb'); } }
  if (f.adress?.gatuadress && r.gatuadress) {
    const a = strip(f.adress.gatuadress).replace(/\s+/g, ' '), b = strip(r.gatuadress).replace(/\s+/g, ' ');
    if (a === b) { s += 5; why.push('adress'); } else if (a.split(' ')[0] === b.split(' ')[0] && a.split(' ')[0].length > 4) { s += 2; why.push('gata'); }
  }
  if (f.koordinater) { const d = haversineM(f.koordinater, r); if (d < 200) { s += 6; why.push('<200m'); } else if (d < 1000) { s += 2; why.push('<1km'); } else if (d > 5000) s -= 6; }
  return { s, why };
}
const matches = new Map(); // osm id -> [facility...]
const unmatched = [];
for (const f of facs) {
  const kk = kommunOf(f);
  const cands = kk.length ? kk.flatMap((k) => byKommun[k] || []) : base;
  let best = null;
  for (const r of cands) {
    const sc = score(f, r);
    // operator facilities (no kommun context) must also agree on place (ort/kommun token) unless URL/address/coords matched
    if (!kk.length && sc.why.length === 1 && sc.why[0] === 'namn') {
      const place = [r.ort, r.kommun].filter(Boolean).flatMap((x) => coreTokens(x));
      if (!sameTok(f.tokens, place) && !(f.adress?.ort && place.includes(coreTokens(f.adress.ort)[0]))) sc.s -= 2;
    }
    if (!best || sc.s > best.sc.s) best = { r, sc };
  }
  if (best && best.sc.s >= 5) { (matches.get(best.r.id) || matches.set(best.r.id, []).get(best.r.id)).push({ f, why: best.sc.why }); rapport.matchningar++; }
  else unmatched.push(f);
}
// single-pair rule: a kommun with exactly one unmatched OSM hall and exactly one unmatched useful facility
for (const k of Object.keys(byKommun)) {
  const freeOsm = byKommun[k].filter((r) => !matches.has(r.id));
  const freeFac = unmatched.filter((f) => kommunOf(f).length === 1 && kommunOf(f)[0] === k && useful(f) && f.namn && !f.typ_hint?.startsWith('utomhus') && !/(ute|utomhus|friluft|sommar)/i.test(f.namn) && ownSite(f, k));
  if (freeOsm.length === 1 && freeFac.length === 1 && byKommun[k].length === 1) {
    matches.set(freeOsm[0].id, [{ f: freeFac[0], why: ['enda-i-kommunen'] }]); unmatched.splice(unmatched.indexOf(freeFac[0]), 1);
  }
}

// 3b. facilities whose kommun is only known from coordinates/address (operator sites): name match inside that kommun
function kommunHint(f) {
  const kk = kommunOf(f); if (kk.length === 1) return kk[0];
  if (f.koordinater) { const k = kommunForPoint(f.koordinater.lat, f.koordinater.lon); if (k) return k.kod; }
  if (f.adress?.ort) { const k = kByName[strip(f.adress.ort)]?.kommunkod || base.find((r) => r.ort && strip(r.ort) === strip(f.adress.ort))?.extra.kommunkod; if (k) return k; }
  return null;
}
for (const f of [...unmatched]) {
  const kod = kommunHint(f); if (!kod) continue;
  const hit = (byKommun[kod] || []).filter((r) => sameTok(f.tokens, coreTokens(r.namn)));
  if (hit.length === 1) { (matches.get(hit[0].id) || matches.set(hit[0].id, []).get(hit[0].id)).push({ f, why: ['namn-i-kommun'] }); unmatched.splice(unmatched.indexOf(f), 1); }
}
// 3c. kommun with exactly one hall: generic-named pages from that kommun's own site belong to it
for (const f of [...unmatched]) {
  const kk = kommunOf(f); if (kk.length !== 1) continue;
  const rs = byKommun[kk[0]] || [];
  const generic = !f.namn || NAME_JUNK.test(f.namn) || !coreTokens(f.namn).length || sameTok(f.tokens, coreTokens(kByKod[kk[0]]?.namn || ''));
  if (rs.length === 1 && generic && useful(f)) { (matches.get(rs[0].id) || matches.set(rs[0].id, []).get(rs[0].id)).push({ f, why: ['enda-hallen-generisk-sida'] }); unmatched.splice(unmatched.indexOf(f), 1); }
}

// OSM objects that osm-data filtered out (raw candidates) are used only as a coordinate/address source for new halls
const rawCands = [];
for (const fn of ['swim_candidates', 'swim_pools']) {
  const p = path.resolve(DATA_DIR, '..', '..', 'osm-data', 'data', 'raw', `${fn}.json`);
  for (const e of readJson(p, { elements: [] }).elements) {
    const t = e.tags || {}; if (!t.name) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon; if (lat == null) continue;
    rawCands.push({ id: `osm-${e.type}-${e.id}`, namn: t.name, lat, lon, tok: coreTokens(t.name), street: t['addr:street'] ? `${t['addr:street']} ${t['addr:housenumber'] || ''}`.trim() : null, postnummer: t['addr:postcode'] || null, ort: t['addr:city'] || null, webb: t.website || null });
  }
}

// ---------------------------------------------------------------- 4. merge facts
const richness = (f) => (f.oppettider ? 4 : 0) + (f.priser ? 3 : 0) + (f.bassanger ? 2 : 0) + (f.adress ? 1 : 0) + (f.oppettider_per_del ? 1 : 0) + (f.filer.some((x) => !x.startsWith('op-')) ? 0.5 : 0);
function mergeFacts(rec, list) {
  const fs = list.map((x) => x.f).sort((a, b) => richness(b) - richness(a));
  const first = (fn) => { for (const f of fs) { const v = fn(f); if (v) return v; } return null; };
  const adr = first((f) => f.adress?.gatuadress ? f.adress : null);
  const opp = first((f) => f.oppettider ? f : null);
  const pr = first((f) => f.priser);
  const pools = new Map();
  for (const f of fs) for (const p of f.bassanger || []) { const c = pools.get(p.namn); if (!c) pools.set(p.namn, { ...p }); else for (const k of ['langd_m', 'banor', 'temp_c']) if (c[k] == null) c[k] = p[k]; }
  const facil = {};
  for (const f of fs) for (const [k, v] of Object.entries(f.faciliteter || {})) if (v) facil[k] = true;
  const perDel = {};
  for (const f of fs) for (const [k, v] of Object.entries(f.oppettider_per_del || {})) if (!perDel[k]) perDel[k] = v;
  const op = first((f) => operatorOf(f.host));
  const hint = first((f) => f.typ_hint);
  const officialName = first((f) => f.namn && f.namn.length <= 40 && coreTokens(f.namn).length ? f.namn : null);
  return { fs, adr, opp, pr, pools: [...pools.values()], facil, perDel, op, hint, officialName,
    tel: first((f) => f.telefon), avv: first((f) => f.avvikande_tider), stangd: fs.some((f) => f.tillfalligt_stangd), coords: first((f) => f.koordinater),
    webb: (fs.find((f) => f.filer.some((x) => !x.startsWith('op-')) && !operatorOf(f.host)) || fs[0]).url, urls: [...new Set(fs.flatMap((f) => [f.url, f.oppettider_url, f.priser?._url].filter(Boolean)))] };
}
function cleanPrices(pr) {
  if (!pr) return null;
  const o = {}; for (const k of ['vuxen', 'barn', 'pensionar', 'student', 'familj']) if (pr[k] !== undefined) o[k] = pr[k];
  return Object.keys(o).length ? o : null;
}
const FACKEYS = ['bastu', 'gym', 'rutschkana', 'hopptorn', 'babysim', 'varmbassang', 'aventyrsbad', 'barnbassang', 'relax', 'utomhusbassang', 'simskola', 'vattengympa', 'cafe', 'tillganglighet', 'motionssim'];
function buildRecord(rec, m, isNew) {
  const kallor = new Set(isNew ? [] : ['OpenStreetMap']);
  const extra = {
    kommunkod: rec.extra?.kommunkod || null,
    osm_id: isNew ? null : rec.id,
    oppettider_per_del: null, priser: null, bassanger: null, faciliteter: null, avvikande_tider: null, senast_kontrollerad: null,
    oppettider_kalla: rec.oppettider ? 'osm' : null, oppettider_etikett: null, tillfalligt_stangd: null, namn_osm: isNew ? null : rec.namn,
    kalla_urls: [], koordinat_kalla: isNew ? null : 'osm', matchning: null,
    osm_bassanger_antal: rec.extra?.bassanger ?? null, opening_hours_osm: rec.extra?.opening_hours_osm ?? null,
  };
  const out = { id: rec.id, namn: rec.namn, kedja: rec.kedja || null, typ: rec.typ || 'simhall', gatuadress: rec.gatuadress || null, postnummer: rec.postnummer || null, ort: rec.ort || null,
    kommun: rec.kommun || null, lan: rec.lan || null, lat: rec.lat ?? null, lon: rec.lon ?? null, telefon: rec.telefon || null, webb: rec.webb || null, oppettider: rec.oppettider || null, extra, kallor: [], uppdaterad: DATE };
  if (rec.extra?.sauna) extra.faciliteter = { bastu: true };
  if (m) {
    for (const f of m.fs) for (const h of new Set(f.urls.map((u) => new URL(u).host.replace(/^www\./, '')))) kallor.add(h);
    const strong = (m.why || []).some((w) => /^(namn|webb|adress|<200m|namn-i-kommun)$/.test(w));
    if (m.officialName && (isNew || (strong && (!coreTokens(out.namn).length || /^(simhall|badhus|simhallen|badhuset)$/i.test(out.namn))))) out.namn = m.officialName;
    if (m.adr) { out.gatuadress = m.adr.gatuadress; if (m.adr.postnummer) out.postnummer = m.adr.postnummer; if (m.adr.ort) out.ort = m.adr.ort; }
    if (m.tel) out.telefon = m.tel;
    out.webb = m.webb || out.webb;
    if (m.opp) { out.oppettider = m.opp.oppettider; extra.oppettider_kalla = 'webb'; extra.oppettider_etikett = m.opp.oppettider_etikett; }
    if (Object.keys(m.perDel).length) extra.oppettider_per_del = m.perDel;
    extra.priser = cleanPrices(m.pr);
    extra.bassanger = m.pools.length ? m.pools : null;
    const facil = { ...(extra.faciliteter || {}), ...m.facil };
    if (m.pools.some((p) => /varm|terapi|rehab/i.test(p.namn))) facil.varmbassang = true;
    if (m.pools.some((p) => /hopp/i.test(p.namn))) facil.hopptorn = true;
    extra.faciliteter = Object.fromEntries(FACKEYS.map((k) => [k, facil[k] ? true : null]));
    extra.avvikande_tider = m.avv;
    extra.tillfalligt_stangd = m.stangd || null;
    extra.senast_kontrollerad = DATE;
    extra.kalla_urls = m.urls.slice(0, 8);
    extra.matchning = m.why || null;
    if (m.op) out.kedja = m.op;
    else if (!out.kedja && m.fs.some((f) => f.filer.some((x) => !x.startsWith('op-')))) out.kedja = out.kommun ? `${out.kommun} kommun` : null;
    if (m.hint === 'utomhusbad') out.typ = 'utomhusbad';
    else if (m.hint === 'äventyrsbad' && (facil.rutschkana || facil.aventyrsbad)) out.typ = 'äventyrsbad';
    else if (m.hint === 'badhus' && out.typ === 'simhall') out.typ = 'badhus';
  }
  if (extra.faciliteter && !Object.values(extra.faciliteter).some(Boolean)) extra.faciliteter = null;
  out.kallor = [...kallor];
  return out;
}

const records = [];
for (const r of base) {
  const list = matches.get(r.id);
  const m = list ? { ...mergeFacts(r, list), why: [...new Set(list.flatMap((x) => x.why))] } : null;
  records.push(buildRecord(r, m, false));
}

// ---------------------------------------------------------------- 5. new halls found only on the web
const HALLNAME = /(simhall|badhus|bad\b|badet|äventyrsbad|simarena|aquarena|pool|hallen|bad &|bad och)/i;
const newGroups = new Map();
for (const f of unmatched) {
  const kk = kommunOf(f);
  const facts = f.oppettider || f.priser || (f.bassanger && f.adress);
  const goodName = f.namn && HALLNAME.test(f.namn) && !NAME_JUNK.test(f.namn) && coreTokens(f.namn).length;
  const kod = kommunHint(f);
  // kommun without any hall in the data, the kommun's own site describes one but only under generic page titles
  if (!goodName && facts && kod && !(byKommun[kod] || []).length && ownSite(f, kod) && f.typ_hint !== 'utomhusbad' && !/(ute|utomhus|sommar)/i.test(f.namn || '')) {
    const nm = `Simhallen i ${kByKod[kod].namn}`;
    f.namn = nm; f.tokens = coreTokens(kByKod[kod].namn);
    const gk = `${kod}|generisk`;
    (newGroups.get(gk) || newGroups.set(gk, { kod, list: [], generisk: true }).get(gk)).list.push({ f, why: ['ny-generisk'] });
    continue;
  }
  if (!goodName || !facts) { rapport.omatchade_anlaggningar.push({ key: f.key, namn: f.namn, filer: f.filer, skal: 'för lite fakta/namn' }); continue; }
  if (!kod) { rapport.omatchade_anlaggningar.push({ key: f.key, namn: f.namn, filer: f.filer, skal: 'okänd kommun' }); continue; }
  const gk = `${kod}|${f.tokens.join(' ') || slugify(f.namn)}`;
  (newGroups.get(gk) || newGroups.set(gk, { kod, list: [] }).get(gk)).list.push({ f, why: ['ny'] });
}
for (const [, g] of [...newGroups].sort((a, b) => (a[1].generisk ? 1 : 0) - (b[1].generisk ? 1 : 0))) {
  if (g.generisk) {
    g.list = g.list.filter(({ f }) => !/(ute|utomhus|sommar|friluft)/.test(strip(f.url)));
    if (!g.list.length || records.some((r) => r.extra.kommunkod === g.kod)) continue; // only when the kommun still has no hall at all
  }
  const m = mergeFacts(null, g.list);
  const k = kByKod[g.kod];
  // same name as an existing record in the kommun (matching failed on tokens) -> skip
  const nm = m.officialName || g.list[0].f.namn;
  if (records.some((r) => r.extra.kommunkod === g.kod && coreTokens(r.namn).join(' ') && coreTokens(r.namn).join(' ') === coreTokens(nm).join(' '))) { rapport.varningar.push(`ny dubblett hoppad: ${nm} (${k.namn})`); continue; }
  let lat = m.coords?.lat ?? null, lon = m.coords?.lon ?? null, kk = lat != null ? 'webbsida' : null;
  if (lat != null) { const kp = kommunForPoint(lat, lon); if (!kp || kp.kod !== g.kod) { lat = lon = null; kk = null; } }
  // coordinates from an OSM object with the same name in the same kommun (filtered out of the OSM start file)
  let rawHit = null;
  if (lat == null) {
    const tk = coreTokens(nm);
    rawHit = rawCands.find((c) => c.tok.length && sameTok(tk, c.tok) && kommunForPoint(c.lat, c.lon)?.kod === g.kod);
    if (rawHit) { lat = rawHit.lat; lon = rawHit.lon; kk = 'osm-kandidat'; }
  }
  if (lat != null && records.some((r) => r.extra.kommunkod === g.kod && r.lat != null && haversineM(r, { lat, lon }) < 150)) { rapport.varningar.push(`ny inom 150 m från befintlig, hoppad: ${nm} (${k.namn})`); continue; }
  const rec = { id: `web-${g.kod}-${slugify(nm)}`, namn: nm, kedja: null, typ: 'simhall', gatuadress: rawHit?.street || null, postnummer: rawHit?.postnummer || null, ort: rawHit?.ort || null, kommun: k.namn, lan: k.lan, lat, lon, telefon: null, webb: rawHit?.webb || null, oppettider: null, extra: { kommunkod: g.kod } };
  const out = buildRecord(rec, { ...m, officialName: nm }, true);
  out.extra.koordinat_kalla = kk;
  if (rawHit) { out.extra.osm_id = rawHit.id; out.kallor.push('OpenStreetMap'); }
  if (!out.ort && out.kommun) out.ort = null;
  records.push(out);
  rapport.nya_fran_webb.push({ id: out.id, namn: out.namn, kommun: out.kommun, koordinater: lat != null, url: out.webb });
}

// ---------------------------------------------------------------- 6. ids, slugs
const slugFile = path.join(DATA_DIR, 'slugs.json');
const slugs = readJson(slugFile, {});
const used = new Set(Object.values(slugs));
// purely generic names (OSM "Simhall", "Badhus", "Sporthallen", "Gata") become "<Simhallen|Badhuset> i <ort>"
for (const r of records) {
  if (/^(simhall(en)?|badhus(et)?|sporthall(en)?|idrottshall(en)?|gata|swimming pool)$/i.test((r.namn || '').trim())) {
    const base = /^badhus/i.test(r.namn) ? 'Badhuset' : 'Simhallen';
    r.extra.namn_generiskt = r.namn; r.namn = `${base} i ${r.ort || r.kommun}`;
  }
}
records.sort((a, b) => (a.kommun || '').localeCompare(b.kommun || '', 'sv') || a.namn.localeCompare(b.namn, 'sv'));
for (const r of records) {
  if (!slugs[r.id]) {
    let s = slugify(r.namn) || 'simhall';
    if (used.has(s)) s = `${s}-${slugify(r.ort || r.kommun || '')}`;
    let n = 2; const b0 = s; while (used.has(s)) s = `${b0}-${n++}`;
    slugs[r.id] = s; used.add(s);
  }
  r.extra.slug = slugs[r.id];
}
writeJson(slugFile, slugs);

// ---------------------------------------------------------------- 7. outputs
writeJson(path.join(DATA_DIR, 'simhallar.json'), records);
const covered = new Map();
for (const r of records) { const k = r.extra.kommunkod; if (!covered.has(k)) covered.set(k, []); covered.get(k).push(r); }
const crawlByKod = Object.fromEntries(crawl.kommuner.map((k) => [k.kommunkod, k]));
const kOut = kommuner.map((k) => {
  const rs = covered.get(k.kommunkod) || [];
  const c = crawlByKod[k.kommunkod];
  return { kommunkod: k.kommunkod, namn: k.namn, lan: k.lan, slug: slugify(k.namn), antal: rs.length,
    antal_med_officiella_uppgifter: rs.filter((r) => r.extra.senast_kontrollerad).length,
    webbplats: readJson(path.join(RAW_DIR, 'kommun-sites.json')).kommuner.find((x) => x.kommunkod === k.kommunkod)?.site || null,
    webb_status: c?.blockerad ? `blockerad: ${c.blockerad}` : c ? (c.relevanta ? 'hämtad' : 'inga simhallssidor hittade') : 'ej hämtad',
    simhallar: rs.map((r) => ({ id: r.id, namn: r.namn, slug: r.extra.slug, typ: r.typ })) };
});
writeJson(path.join(DATA_DIR, 'kommuner.json'), kOut);

const n = records.length; const pct = (fn) => `${Math.round((100 * records.filter(fn).length) / n)}%`;
rapport.statistik = {
  antal: n, fran_osm: records.filter((r) => !r.id.startsWith('web-')).length, nya_fran_webb: records.filter((r) => r.id.startsWith('web-')).length,
  med_officiella_uppgifter: records.filter((r) => r.extra.senast_kontrollerad).length,
  adress: pct((r) => r.gatuadress), oppettider: pct((r) => r.oppettider), oppettider_webb: pct((r) => r.extra.oppettider_kalla === 'webb'),
  priser: pct((r) => r.extra.priser), bassanger: pct((r) => r.extra.bassanger), bassanger_med_langd: pct((r) => r.extra.bassanger?.some((p) => p.langd_m)),
  telefon: pct((r) => r.telefon), webb: pct((r) => r.webb), faciliteter: pct((r) => r.extra.faciliteter), koordinater: pct((r) => r.lat != null),
  kommuner_med_simhall: kOut.filter((k) => k.antal).length, kommuner_utan_simhall_i_data: kOut.filter((k) => !k.antal).map((k) => k.namn),
  kommuner_med_officiella_uppgifter: kOut.filter((k) => k.antal_med_officiella_uppgifter).length,
  typ: records.reduce((m, r) => ((m[r.typ] = (m[r.typ] || 0) + 1), m), {}),
};
rapport.blockerade_vardar = crawl.blockerade_vardar;
writeJson(path.join(DATA_DIR, 'rapport.json'), rapport);
console.log(JSON.stringify(rapport.statistik, (k, v) => (k === 'kommuner_utan_simhall_i_data' ? `${v.length} st` : v), 1));
