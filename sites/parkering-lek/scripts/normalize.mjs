// Normalisering av kommunala/operatörsposter till gemensamma fält (lekplatser och parkering).
import { num } from './html.mjs';

export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function slugify(s) {
  return String(s ?? '').toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const STOP = new Set(['lekplats', 'lekplatsen', 'lekplatser', 'lekpark', 'parkering', 'parkeringen', 'p', 'plats', 'vid', 'i', 'pa', 'och', 'garage', 'p-hus', 'phus', 'parkeringshus', 'parkeringsgarage', 'the', 's']);
export const nameTokens = (s) => new Set(fold(s).replace(/s\b/g, '').split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t)));
export function nameSim(a, b) {
  if (!a || !b) return 0; const A = nameTokens(a), B = nameTokens(b); if (!A.size || !B.size) return 0;
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return i / Math.min(A.size, B.size);
}
export function titleCase(s) {
  if (!s) return s; s = String(s).replace(/\s+/g, ' ').trim();
  if (s !== s.toUpperCase() || !/[A-ZÅÄÖ]{3}/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(])([a-zåäöé])/g, (m, p, c) => p + c.toUpperCase());
}
export const pcFmt = (p) => { const d = String(p ?? '').replace(/\D/g, ''); return d.length === 5 ? `${d.slice(0, 3)} ${d.slice(3)}` : null; };
const truthy = (v) => v === true || v === 1 || /^(true|trie|ja|yes|1|y|limited|delvis)$/i.test(String(v ?? '').trim());
const falsy = (v) => v === false || v === 0 || /^(false|nej|no|0|n)$/i.test(String(v ?? '').trim());
const pick = (p, re) => { for (const [k, v] of Object.entries(p)) if (re.test(k) && v != null && String(v).trim() !== '' && String(v).trim() !== '.') return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v; return null; };
const isUrl = (s) => /^\s*https?:\/\//i.test(String(s ?? ''));

// ---------------- lekplatser ----------------
// Utrustningsnycklar: lekplatsspecifikationen (dataportal.se) + OSM playground=*.
const EQUIP_KEYS = {
  swing: 'gungor', slide: 'rutschkana', sandpit: 'sandlåda', sand: 'sandlåda', roundabout: 'karusell', springy: 'fjädergunga', basketswing: 'kompisgunga',
  basketrotator: 'kompisgunga', zipwire: 'linbana', structure: 'lekställning', climbingframe: 'klätterställning', climbing_frame: 'klätterställning',
  climbingwall: 'klättervägg', climbing: 'klätterställning', seesaw: 'gungbräda', playhouse: 'lekhus', balancebeam: 'balansbana', balance_beam: 'balansbana',
  trampoline: 'studsmatta', water: 'vattenlek', splash_pad: 'vattenlek', pump: 'vattenlek', sledding: 'pulkabacke', tunnel_tube: 'tunnel',
  horizontal_bar: 'räck', aerialrotator: 'snurrgunga', rope_traverse: 'repbana', activitypanel: 'aktivitetspanel', music: 'ljudlek', table: 'lekbord',
  spinner: 'karusell', spinning_disc: 'karusell', rocker: 'fjädergunga', bridge: 'hängbro', cushion: 'hoppkudde', hopscotch: 'hoppruta', teenshelter: 'tonårsplats',
  rope_swing: 'repgunga', funnel_ball: 'bolltratt', drinking_water: null, toilet: null, lighting: null, wheelchair: null,
  // kommunala fältnamn (Uppsala, Västerås, Skellefteå m.fl.)
  gunglek: 'gungor', gungstallning: 'gungor', gunga: 'gungor', vagglek: 'fjädergunga', klatterlek: 'klätterställning', klatter: 'klätterställning',
  klatterstallning: 'klätterställning', rutschlek: 'rutschkana', rutsch: 'rutschkana', rutschbana: 'rutschkana', sandlek: 'sandlåda', sandlada: 'sandlåda',
  snurrlek: 'karusell', karusell: 'karusell', balanslek: 'balansbana', rollek: 'lekhus', hopplek: 'studsmatta', ljudle: 'ljudlek', ljudlek: 'ljudlek',
  vattenlek: 'vattenlek', dusch_vattenlek: 'vattenlek', fordonslek: 'fordonslek', pulkabacke: 'pulkabacke', bollek: 'bollplan', bollplank: 'bollplan',
  fotbollsmal: 'bollplan', basketstallning: 'basketkorg', beachvolley: 'beachvolleyplan', boule: 'boulebana', bmx_bana: 'bmx-bana', gym: 'utegym',
  gungbrada: 'gungbräda', komp_gunga: 'kompisgunga', kompisgunga: 'kompisgunga', lekdjur: 'fjädergunga', fjader: 'fjädergunga', lekhus: 'lekhus',
  linbana: 'linbana', multisport_arena: 'multisportarena', motorikbana: 'motorikbana', skate: 'skatepark', grill: 'grillplats', eldstad: 'grillplats',
  lekslinga: 'lekslinga', fartlek: 'fartlek', gomsle: 'kojbygge',
};
const EQUIP_WORDS = [
  [/fågelbo|kompisgung|basketgung/, 'kompisgunga'], [/gungbräd|vippgung|vipp\b/, 'gungbräda'], [/fjäder|gungdjur|gunghäst/, 'fjädergunga'],
  [/(?<!kompis|fågelbo|fjäder|vipp|bräd)gung(?!bräd)/, 'gungor'], [/rutsch|rutschkana|tubrutsch/, 'rutschkana'], [/sandlåd|sandyta|sandlek/, 'sandlåda'],
  [/karusell|snurr|rotationslek/, 'karusell'], [/linban/, 'linbana'], [/klätter/, 'klätterställning'], [/lekhus|lekstuga/, 'lekhus'],
  [/balans/, 'balansbana'], [/studsmatt|hoppkudd/, 'studsmatta'], [/vattenlek|vattenspel|plaskdamm|vattenkran.*lek/, 'vattenlek'], [/parkour/, 'parkour'],
  [/basket/, 'basketkorg'], [/fotbollsmål|fotbollsplan|bollplan|spontanidrott|multisport|konstgräs/, 'bollplan'], [/pingis|bordtennis/, 'pingisbord'],
  [/skate/, 'skatepark'], [/utegym/, 'utegym'], [/boule/, 'boulebana'], [/grill/, 'grillplats'], [/hinderban/, 'hinderbana'], [/lekskepp|båt\b|piratskepp/, 'lekskepp'],
  [/cykelban|trafiklek|trafikban/, 'trafiklekplats'], [/pulkabacke/, 'pulkabacke'], [/bakbord|lekbord|sandbord/, 'lekbord'], [/tunnel/, 'tunnel'],
  [/hängbro/, 'hängbro'], [/lekställning|lekborg|lektorn|torn\b/, 'lekställning'], [/sittplats|bänk|picknick/, 'sittplatser'],
];
export function equipFromText(s) {
  const t = fold(s).replace(/ä/g, 'ä'); const lt = String(s ?? '').toLowerCase(); const out = new Set();
  for (const [re, name] of EQUIP_WORDS) if (re.test(lt) || re.test(t)) out.add(name);
  return out;
}
export function equipFromOsm(obj) {
  const out = new Set(); if (!obj || typeof obj !== 'object') return out;
  for (const k of Object.keys(obj)) { const v = EQUIP_KEYS[k]; if (v) out.add(v); }
  return out;
}
const SIZE = { N: 'närlekplats', O: 'områdeslekplats', S: 'stadsdelslekplats' };
// Fält som inte ska genomsökas efter utrustningsord (id, url, bildlänkar, kontaktinfo, datum).
const SKIP_SCAN = /(^|_)(kommentar|anm|status.*|typ_och_status|skick.*|tillg_fram|inv_.*|creator|editor|ans_hman|innehavare|kategorise|mangd_leku|tillgang_1|foto|bild_filnamn|id|guid|url|visit_url|webb|webbsida|email|bild\d*|bild_\d+|objekt\d|source|alt_source|wikidata|updated|timestamp|datum|_lager|fid|objectid|globalid|geom.*|shape.*|json_.*|country|postcode|city|street|housenumber|ort|adress|namn|name|plats)$/i;

export function lekFromProps(p, src) {
  const namn0 = pick(p, /^(name|namn|plats|lekplatsnamn|lekplats|benamning|benämning|platsnamn|objektnamn)$/i);
  const street = pick(p, /^(street|gata|gatunamn)$/i), hn = pick(p, /^(housenumber|husnummer|nr)$/i);
  const adress = pick(p, /^(adress|gatuadress|address)$/i) || (street ? [titleCase(street), hn].filter(Boolean).join(' ') : null);
  const desc = pick(p, /^(description|beskrivning|beskr)$/i);
  const temaRaw0 = pick(p, /^(theme|tema|lekplatstema)$/i); const temaFlag = truthy(pick(p, /^temalekplats$/i)); const temaRaw = temaRaw0;
  const typRaw = pick(p, /^(type|typ|klassificering|lekplatstyp|storlek|klass|underkat)$/i);
  const utr = new Set();
  for (const [k, v] of Object.entries(p)) { const e = EQUIP_KEYS[k.toLowerCase().replace(/[^a-z_]/g, '')]; if (e && truthy(v) && !/^limited$/i.test(String(v))) utr.add(e); }
  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== 'string' || SKIP_SCAN.test(k) || isUrl(v) || /\.(jpe?g|png)$/i.test(v)) continue;
    if (/^(theme|tema)$/i.test(k)) continue;
    for (const e of equipFromText(v)) utr.add(e);
  }
  if (namn0) for (const e of equipFromText(namn0)) if (['skatepark', 'utegym', 'vattenlek', 'trafiklekplats', 'parkour'].includes(e)) utr.add(e);
  let tema = null;
  if (temaRaw && !/saknas|^nej$|^ingen$/i.test(temaRaw)) tema = String(temaRaw).trim();
  else if (desc && /^[\wåäö ]*tema$/i.test(desc) && !/saknas/i.test(desc)) tema = desc.replace(/tema$/i, '').trim() || null;
  const wc0 = pick(p, /^(wheelchair|accessibility|tillganglighetsanpassad|tillgänglighetsanpassad|anpassad|tillganglig|tillgänglig|t_rullstol|tillg_lek)$/i); const wc = /^ok(ä|a)nd?t?$/i.test(String(wc0 ?? '')) ? null : wc0;
  let tillganglighet = null;
  if (wc != null) tillganglighet = /limited|delvis/i.test(wc) ? 'delvis tillgänglighetsanpassad' : truthy(wc) ? 'tillgänglighetsanpassad' : falsy(wc) ? 'ej tillgänglighetsanpassad' : null;
  if (!tillganglighet && desc && /tillgänglighetsanpassad/i.test(desc)) tillganglighet = 'tillgänglighetsanpassad';
  const toa0 = pick(p, /^(toilet|toalett|wc|t_toalett)$/i); const toa = /^ok(ä|a)nd?t?$/i.test(String(toa0 ?? '')) ? null : toa0;
  const lit0 = pick(p, /^(lighting|belysning|lit|belysning_kvall)$/i); const lit = /^ok(ä|a)nd?t?$/i.test(String(lit0 ?? '')) ? null : lit0;
  const vatten0 = pick(p, /^(drinking_water|dricksvatten|dricksvat)$/i); const vatten = /^ok(ä|a)nd?t?$/i.test(String(vatten0 ?? '')) ? null : vatten0;
  const storlek = typRaw && SIZE[String(typRaw).trim().toUpperCase()] ? SIZE[String(typRaw).trim().toUpperCase()] : (typRaw && /lek/i.test(typRaw) && !/^lekplats(er)?$/i.test(typRaw) ? String(typRaw).replace(/\s*\(.*\)$/, '').toLowerCase() : null);
  const webb = [pick(p, /^(visit_url|webb|webbsida|url|info|lank|länk|hemsida)$/i)].find(isUrl) || null;
  const ort0 = pick(p, /^(city|ort|postort|kommundel|tatort|tätort)$/i) || (adress && /,s*[A-ZÅÄÖ][a-zåäö]+/.test(adress) ? adress.split(',').pop().trim() : null) || (pick(p, /^(område|omrade)$/i) || '').split(',').pop().trim() || null;
  const reno0 = pick(p, /^(last_renovated|senast ombyggd|senast_ombyggd|byggar|byggår|anlagd|renoverad|ombygg_ar|upprustnin)$/i); const reno = reno0 && Number(reno0) > 1900 ? reno0 : null;
  const minAge = pick(p, /^(min_age|minalder|ålder_från|alder_fran)$/i), maxAge = pick(p, /^(max_age|maxalder|ålder_till|alder_till)$/i);
  let namn = titleCase(namn0);
  if (namn && /^(lekplats(er)?|lekplats\/skatepark|lekpark)$/i.test(namn)) namn = null; // generiska namn
  return {
    kallid: pick(p, /^(id|guid|lekplats_id|lekplatsid)$/i),
    namn, gatuadress: adress ? titleCase(adress.split(',')[0].trim()) : null, postnummer: pcFmt(pick(p, /^(postcode|postnummer|postnr)$/i)), ort: titleCase(ort0),
    webb, utrustning: [...utr].sort(), tema, storlek,
    naturlek: /naturlek|natur ?tema|^natur$/i.test([temaRaw, desc, namn0, typRaw].filter(Boolean).join(' ')),
    temaflagga: temaFlag || /temalek/i.test([namn0, typRaw, desc].filter(Boolean).join(' ')),
    tillganglighet, toalett: toa == null ? null : truthy(toa), belysning: lit == null ? null : truthy(lit), dricksvatten: vatten == null ? null : truthy(vatten),
    alder: minAge || maxAge ? `${minAge ?? 0}-${maxAge ?? ''} år`.replace(/-\s*år$/, '+ år') : null,
    senast_renoverad: reno ? String(reno).trim() : null,
    underlag: pick(p, /^(markmaterial|underlag|surface|fallskydd)$/i),
    beskrivning: desc && desc.length > 15 && !/^[\wåäö ]*tema$/i.test(desc) ? desc : null,
  };
}

// ---------------- parkering ----------------
export function parkTyp(...hints) {
  const s = hints.filter(Boolean).join(' ').toLowerCase();
  if (/flygplats|airport/.test(s)) return 'flygplatsparkering';
  if (/pendel|pendlar|infart|park ?& ?ride|park and ride/.test(s)) return 'pendlarparkering';
  if (/husbil/.test(s)) return 'husbilsparkering';
  if (/p-hus|parkeringshus|ph\b|p-däck|parkeringsdäck/.test(s)) return 'parkeringshus';
  if (/garage|källare|kallare|underjord|inomhus/.test(s)) return 'parkeringsgarage';
  if (/gatuparkering|längsgående|gata\b/.test(s)) return 'gatuparkering';
  if (/naturreservat|friluft|motionsspår|reservat|utsiktsplats|badplats/.test(s)) return 'friluftsparkering';
  if (/yt|mark|utomhus|större p-plats|p-plats|parkering|parkeringsplats/.test(s)) return 'markparkering';
  return null;
}
export function avgiftOf(text) {
  if (text == null) return null; const s = String(text).toLowerCase().trim();
  if (/^(0|0 ?kr|nej|ingen|gratis|avgiftsfri(tt)?|kostnadsfri|fri)$/.test(s) || /gratis|avgiftsfri|kostnadsfri/.test(s)) return false;
  if (/\d\s*(kr|kronor|sek)|^ja$|betal|avgift/.test(s)) return true;
  return null;
}
// Operatörssidornas taxatext: ta bort UI-text ("Stäng; Parkeringstaxa;") och inledande rubriker
// (anläggningsnamn/fastighetsägare) före första segmentet som faktiskt beskriver tid eller pris.
export function cleanTaxa(t) {
  if (!t) return t;
  const seg = String(t).split(/\s*;\s*/).map((x) => x.trim()).filter((x) => x && !/^(stäng|parkeringstaxa)$/i.test(x));
  const i = seg.findIndex((x) => /(alla dagar|vardag|helg|^(mån|tis|ons|tor|fre|lör|sön)|övrig tid|\bkr\b|fri parkering|gratis|påbörjad|^\d+\s*(h|tim|min|dygn)\b)/i.test(x));
  return (i > 0 ? seg.slice(i) : seg).join('; ') || null;
}
export function perTimme(t) {
  if (!t) return null; let s = String(t).toLowerCase().replace(/ /g, ' ').replace(/\bsek\b/g, 'kr').replace(/kronor/g, 'kr');
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*kr\s*(?:\/|per)\s*(?:påbörjad(?:e)?\s*)?(?:tim(?:me|ma)?|h|t)\b/);
  if (m) return Number(m[1].replace(',', '.'));
  m = s.match(/(?:^|[;:|]\s*|\s)(?:per\s*påbörjad(?:e)?\s*)?1\s*(?:h|tim(?:me)?)\s*[-–:]\s*(\d+(?:[.,]\d+)?)\s*kr/);
  if (m) return Number(m[1].replace(',', '.'));
  m = s.match(/(?:per\s*påbörjad(?:e)?\s*(\d+)\s*min(?:ut(?:er)?)?\s*[-–:]?\s*(\d+(?:[.,]\d+)?)\s*kr)|(?:(\d+(?:[.,]\d+)?)\s*kr\s*(?:\/|per)\s*(?:påbörjad(?:e)?\s*)?(\d+)\s*-?\s*min)/);
  if (m) { const min = Number(m[1] || m[4]); const kr = Number((m[2] || m[3]).replace(',', '.')); if (min > 0 && min <= 60) return Math.round((kr * 60 / min) * 100) / 100; }
  return null;
}
const maxTid = (v) => { if (v == null || v === '') return null; const s = String(v).trim(); if (/^\d+$/.test(s)) return `${s} tim`; return s.replace(/(\d)\s*tim\b/, '$1 tim').replace(/(\d)(tim|h|dygn)/, '$1 $2'); };
export function parkFromProps(p, src) {
  const namn = titleCase(pick(p, /^(name|namn|benamning|benämning|parkeringsnamn|objektnamn|anlaggning|anläggning)$/i));
  const kap = pick(p, /^(antal|antal_platser|antal platser|antalplatser|car_spaces|number_of_parking_spaces|kapacitet|capacity|platser|antal_pplatser|antal_bilplatser)$/i);
  const avg = pick(p, /^(avgift|taxa|pris|kostnad|parkeringsavgift)$/i);
  const avgTid = pick(p, /^(avgift_tid|avgiftstid|avgiftstider|betaltid)$/i);
  const desc = pick(p, /^(description|beskrivning|information|informatiom|anm|anmarkning|anmärkning|info|kommentar)$/i);
  const tidsregel = pick(p, /^(tidsregel|tidsregl|max_tid|max_tid_timmar|max_time|maxtid|tid|tidsbegransning|tidsbegränsning)$/i);
  const typRaw = pick(p, /^(typ|type|parkeringstyp|kategori|_lager)$/i);
  const taxa = avg && avgiftOf(avg) !== false ? [avg, avgTid ? `(avgiftstid ${avgTid})` : null].filter(Boolean).join(' ') : null;
  let avgift = avgiftOf(avg); if (avgift == null && desc) avgift = avgiftOf(/gratis|avgiftsfri|betalparkering/i.test(desc) ? desc : null);
  if (avgift == null && taxa && /kr/i.test(taxa)) avgift = true;
  const ladd = pick(p, /^(laddplats|laddplatser|laddpl|antal_laddplatser|elbilsplatser)$/i), hkp = pick(p, /^(handikapp|rorelsehindrad|rörelsehindrad|rh_platser|handikapplatser|antal_rh)$/i);
  const webb = [pick(p, /^(webadress|webbsida|webb|visit_url|url|hemsida|lank|länk)$/i)].find(isUrl) || null;
  const mt = tidsregel || (desc && /max\s*\d+\s*(tim|h|dygn)/i.test(desc) ? desc.match(/max\s*(\d+\s*(?:eller\s*\d+\s*)?(?:timmar|tim|h|dygn))/i)?.[1] : null);
  const sp = parkSpecial(src.id, p); if (sp.skip) return null;
  const base = {
    kallid: pick(p, /^(id|guid|parkering_id|parkeringsid)$/i),
    namn: namn && !/^parkering(splats)?$/i.test(namn) ? namn : null,
    gatuadress: titleCase(pick(p, /^(adress|gatuadress|address|street)$/i)), ort: titleCase(pick(p, /^(city|ort|postort)$/i)), postnummer: pcFmt(pick(p, /^(postcode|postnummer)$/i)),
    kapacitet: kap != null ? num(kap) : null, avgift, taxa, taxa_per_timme: perTimme(taxa),
    max_tid: maxTid(mt), laddplatser: ladd != null && num(ladd) ? num(ladd) : null, handikapplatser: hkp != null && num(hkp) != null ? num(hkp) : null,
    typ: src.typ || parkTyp(typRaw, namn, desc), anmarkning: desc && desc.length > 3 ? desc : null, webb, kedja: null, zonkod: null, taxezon: null,
  };
  for (const [k, v] of Object.entries(sp)) if (v !== undefined) base[k] = v;
  if (base.taxa && base.taxa_per_timme == null) base.taxa_per_timme = perTimme(base.taxa);
  if (base.avgift == null && base.taxa) base.avgift = avgiftOf(base.taxa);
  if (base.typ == null) base.typ = src.typ || 'markparkering';
  if (NOT_CAR.test(String(p.Typ || p.typ || p.TYP || ''))) return null;
  return base;
}

// Källspecifika fält för parkering (kolumnnamn skiljer sig mellan kommuner). Returnerar överskrivningar eller
// { skip: true } för poster som inte är bilparkering för allmänheten.
const sum = (...v) => { const n = v.map(Number).filter((x) => Number.isFinite(x)); return n.length ? n.reduce((a, b) => a + b, 0) : null; };
const NOT_CAR = /rörelsehindrad|buss|lastbil|\bmc\b|moped|cykel|biljettautomat|översikt|automat|taxi|lastplats|förbud/i;
export function parkSpecial(id, p) {
  if (/^skelleftea/.test(id)) {
    if (p.UNDERKAT && p.UNDERKAT !== 'Bil') return { skip: true };
    return { namn: titleCase(p.NAMN || p.ID || p.OMRADE) || null, kapacitet: p.ANT_PLATS ?? null, laddplatser: p.ANT_LADD || null, handikapplatser: p.ANT_RORELS ?? null,
      zonkod: null, taxezon: p.AVG_ZON || null, typ: p.PHUS === 'Ja' ? 'parkeringshus' : p.PENDLING === 'Ja' ? 'pendlarparkering' : undefined };
  }
  if (id === 'jonkoping-ytor') {
    const kap = sum(p.Ant_5m, p.Ant_10min, p.Ant_15m, p.Ant_30m, p.Ant_1h, p.Ant_2h, p.Ant_4h, p.Ant_12h, p.Ant_24h, p.Ant_RH, p.Ant_Ovr, p.Ant_Laddplats);
    const taxa = [p.Avg_Tim ? `${p.Avg_Tim} kr/tim` : null, p.Avg_Dag ? `${p.Avg_Dag} kr/dag` : null, p.Avg_Dygn ? `${p.Avg_Dygn} kr/dygn` : null].filter(Boolean).join(', ');
    const tid = [p.Tid_MF && `mån-fre ${p.Tid_MF}`, p.Tid_L && `lör ${p.Tid_L}`, p.Tid_S && `sön ${p.Tid_S}`].filter(Boolean).join(', ');
    const maxt = [['Ant_24h', '24 tim'], ['Ant_12h', '12 tim'], ['Ant_4h', '4 tim'], ['Ant_2h', '2 tim'], ['Ant_1h', '1 tim'], ['Ant_30m', '30 min'], ['Ant_15m', '15 min']].filter(([k]) => Number(p[k]) > 0).map(([, v]) => v);
    const ez = String(p.EasyPark || '').trim();
    return { namn: titleCase([p.Plats, p.Del && p.Del !== p.Plats ? p.Del : null].filter(Boolean).join(', ')), kapacitet: kap || null, handikapplatser: p.Ant_RH ?? null, laddplatser: p.Ant_Laddplats || null,
      taxa: taxa ? `${taxa}${tid ? ` (avgiftstid ${tid})` : ''}` : null, avgift: taxa ? true : p.Avg_Tim === 0 ? false : null, taxa_per_timme: p.Avg_Tim || null,
      max_tid: maxt.length === 1 ? maxt[0] : maxt.length ? `${maxt[maxt.length - 1]}–${maxt[0]} (olika platser)` : null, zonkod: ez ? `EasyPark ${ez}` : null, taxezon: p.Zonnamn || null, typ: 'markparkering' };
  }
  if (id === 'jonkoping-kff') { const n = String(p.name || '').replace(/\*/g, '').replace(/:\s*parkering$/i, '').trim(); return { namn: n ? `Parkering ${n}` : null, typ: 'friluftsparkering' }; }
  if (id === 'lulea-phus') {
    const t = String(p.INFOTEXT || '').replace(/<br\s*\/?>/gi, '\n'); const g = (re) => (t.match(re) || [])[1] || null;
    return { namn: p.P_HUSNAMN || null, taxa: g(/Taxa:\s*([^\n]+)/i), kapacitet: num(g(/Antal platser:\s*(\d+)/i)), handikapplatser: num(g(/rörelsehindrade:\s*(\d+)/i)), laddplatser: num(g(/Laddplatser:\s*(\d+)/i)), typ: 'parkeringshus', kedja: /privat/i.test(p.AGARE || '') ? null : 'Luleå kommun' };
  }
  if (id === 'vaxjo') {
    const taxa = [p.Timtaxa ? `${p.Timtaxa} kr/tim` : null, p.Dygnstaxa && /^\d+$/.test(String(p.Dygnstaxa).trim()) ? `${p.Dygnstaxa} kr/dygn` : null].filter(Boolean).join(', ');
    const tid = [p.Tider_vardagar && `vardagar ${String(p.Tider_vardagar).replace(/\.00(?=\s|$)/g, '').trim()}`, p.Tider_helger && `helger ${String(p.Tider_helger).trim()}`].filter(Boolean).join(', ');
    return { namn: p.Plats || null, kapacitet: p.Antal_parkeringsplatser ?? null, handikapplatser: p.HKP ?? null, laddplatser: p.El || null, taxa: taxa ? `${taxa}${tid ? ` (avgiftstid ${tid})` : ''}` : null,
      taxa_per_timme: p.Timtaxa || null, avgift: p.Timtaxa ? true : null, max_tid: (p.Maximal_parkering || '').trim() || null, taxezon: p.Zon || null, typ: 'markparkering' };
  }
  if (id === 'simrishamn') {
    if (NOT_CAR.test(p.Typ || '')) return { skip: true };
    return { namn: p.plats && p.plats.trim() ? `Parkering ${p.plats.trim()}` : null, kapacitet: p.Platser ?? null, max_tid: p.Tid ? String(p.Tid).replace(/h$/, ' tim') : null,
      avgift: /tallyweb|betal/i.test(p.Krav || '') ? true : /p-skiva/i.test(p.Krav || '') ? false : null, kedja: /simrishamns kommun/i.test(p['Ägare'] || '') ? 'Simrishamns kommun' : null,
      typ: /ja/i.test(p.Badplatsparkering || '') ? 'friluftsparkering' : 'markparkering' };
  }
  if (id === 'orust') {
    if (NOT_CAR.test(p.Typ || '') || !/^Parkering$/i.test(p._lager || '')) return { skip: true };
    return { namn: p.Adress && p.Adress.trim() ? `Parkering ${p.Adress.trim()}` : null, gatuadress: null, kapacitet: Number(p.Antal_plat) || null };
  }
  if (id === 'tjorn') { if (/utsiktsplats/i.test(p.Typ || '')) return { typ: 'friluftsparkering' }; return { typ: /pendel/i.test(p.Typ || '') ? 'pendlarparkering' : 'markparkering' }; }
  if (id === 'haninge-infart') return { gatuadress: /\uFFFD|ï¿½/.test(p.Adress || '') ? null : undefined, max_tid: undefined, avgift: /ja/i.test(p.P_bevis || '') ? null : false };
  if (id === 'lidingo-infart') return { max_tid: p.max_tid_timmar ? `${p.max_tid_timmar} tim` : null, avgift: /nej/i.test(p.P_bevis || '') ? false : null };
  if (id === 'harryda') return { typ: /pendel/i.test(p.name || '') ? 'pendlarparkering' : 'markparkering' };
  if (/^(mariestad|toreboda|gullspang)$/.test(id)) return { avgift: p.avgift == null ? false : avgiftOf(p.avgift) };
  if (id === 'skovde' && /ej kommunal/i.test(p.anm || '') && /kontakta/i.test(p.avgift || '')) return { taxa: null, avgift: null };
  return {};
}
