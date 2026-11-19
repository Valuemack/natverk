// Stadsmissionen second hand - the Stadsmissionen organisations are separate foundations with separate sites.
// One output file (kedja "Stadsmissionen") with an extra field `organisation`.
//  - Stockholms Stadsmission: store map GeoJSON in drupalSettings on /second-hand/hitta-butik (coords),
//    then each store page for JSON-LD Store (address, phone, weekly openingHoursSpecification).
//  - Göteborgs, Skåne, Uppsala, Kalmar, Västerås Stadsmission: one HTML page each with free-text store blocks.
import { fetchAllowed, Blocked, decode, clean, stripTags, htmlToLines, headingSections, jsonLd, ldHours, parseHoursText,
  emptyHours, svDay, normRange, hasHours, splitAddress, coord, mapsCoords, sortimentFrom, phoneFrom, emailFrom, store, writeOut, run } from '../lib/chain.mjs';

const META = {
  source: 'stadsmissionen', kedja: 'Stadsmissionen', url: 'https://www.stadsmissionen.se/second-hand/hitta-butik',
  terms_note: 'robots.txt checked per site: stadsmissionen.se (Drupal defaults, store pages allowed), stadsmissionen.org, skanestadsmission.se, uppsalastadsmission.se, kalmarstadsmission.se, vasterasstadsmission.se (WP/Yoast defaults, all allowed). Only köpvillkor (webshop purchase terms) found, no usage terms.',
  extra: {
    not_covered: [
      'Linköpings Stadsmission (linkopingsstadsmission.se: connection timeout)',
      'Göteborgs Stadsmission lives at stadsmissionen.org (goteborgsstadsmission.se does not resolve)',
      'Jönköping/Norrköping/Karlstad stadsmission domains not found',
    ],
  },
};

// ---------------------------------------------------------------- Stockholm

async function stockholm(errors) {
  const ORG = 'Stockholms Stadsmission', BASE = 'https://www.stadsmissionen.se';
  const html = await fetchAllowed(BASE + '/second-hand/hitta-butik');
  const settings = JSON.parse(html.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/)[1]);
  const feats = (settings.stores?.features || []).filter(f => f.properties?.type === 'Second hand');
  const out = [];
  for (const f of feats) {
    const href = f.properties.name.match(/href=([^\s>]+)/)?.[1]?.replace(/"/g, '');
    if (!href || /webbshop|tradera/i.test(href)) continue;
    const url = new URL(href, BASE).href;
    const title = stripTags(f.properties.name);
    const descLines = htmlToLines(f.properties.description || '');
    const listAddr = stripTags(f.properties.description.match(/<div class="address">([\s\S]*?)<\/div>/)?.[1] || '');
    const [lon, lat] = f.geometry?.coordinates || [];
    let ld = null, hours = null, page = '';
    try {
      page = await fetchAllowed(url);
      ld = jsonLd(page).find(x => x['@type'] === 'Store');
      hours = ldHours(ld?.openingHoursSpecification);
      if (!hours) {
        const h = emptyHours();
        for (const m of page.matchAll(/<div class="open-hours (mon|tue|wed|thu|fri|sat|sun)">\s*<span>[^<]*<\/span>([^<]*)<\/div>/g)) h[m[1]] = normRange(decode(m[2]));
        if (hasHours(h)) hours = h;
      }
    } catch (e) { errors.push(`${url}: ${e.message}`); console.error('skip page', url, e.message); if (e instanceof Blocked) throw e; }
    const a = ld?.address ? { gatuadress: ld.address.streetAddress, postnummer: ld.address.postalCode, ort: ld.address.addressLocality } : splitAddress(listAddr);
    const c = coord(lat, lon) || coord(ld?.geo?.latitude, ld?.geo?.longitude);
    const desc = page ? jsonLd(page).map(x => x.description || '').join(' ') + ' ' + (page.match(/<meta name="description" content="([^"]*)"/)?.[1] || '') : '';
    out.push(store({
      source_id: 'sthlm:' + new URL(url).pathname.split('/').pop(),
      namn: `${ORG} ${title.replace(/^Second hand\s*-\s*/i, 'Second hand ').replace(/\s+-\s+/g, ' ')}`,
      kedja: 'Stadsmissionen', organisation: ORG, typ: 'second hand',
      gatuadress: a.gatuadress, postnummer: a.postnummer, ort: a.ort, lat: c?.lat, lon: c?.lon,
      telefon: ld?.telephone, epost: emailFrom(page.match(/<div class="business_info">([\s\S]*?)<\/section>/)?.[1] || ''), webb: url,
      oppettider: hours,
      oppettider_text: [...page.matchAll(/<div class="open-hours (?:mon|tue|wed|thu|fri|sat|sun)">([\s\S]*?)<\/div>/g)].map(x => stripTags(x[1])).join(', ') || descLines.join(' '),
      sortiment: sortimentFrom((ld?.description || '') + ' ' + desc),
    }));
  }
  return out;
}

// ---------------------------------------------------------------- generic text-block pages

const STOP = /^(adress|telefon|tel\b|tel:|gåvo|inlämning|närmaste|mail|e-?post|kontakt|avvikande|vi har stängt|hitta|skicka|ring|instagram)/i;
const POST_RE = /\b\d{3}\s?\d{2}\s+[A-ZÅÄÖ]/;

/** Parse one heading section (store block) into fields. Returns null if it is not a store with hours. */
function parseBlock(heading, html) {
  const lines = htmlToLines(html);
  const hi = lines.findIndex(l => /^öppe?t+ider/i.test(l));
  if (hi < 0) return null;
  const hoursLines = [];
  const first = lines[hi].replace(/^öppe?t+ider[^:]*:?/i, '').trim();
  if (first) hoursLines.push(first);
  for (let i = hi + 1; i < lines.length && !STOP.test(lines[i]) && !POST_RE.test(lines[i]); i++) hoursLines.push(lines[i]);
  const hoursText = hoursLines.join(' ').replace(/^:\s*/, '');
  let addr = null;
  const ai = lines.findIndex(l => /^adress/i.test(l));
  if (ai >= 0) {
    const rest = lines[ai].replace(/^adress\s*:?\s*/i, '').trim();
    const parts = rest ? [rest] : [];
    for (let i = ai + 1; i < lines.length && parts.length < 3 && !STOP.test(lines[i]); i++) {
      parts.push(lines[i]);
      if (POST_RE.test(lines[i])) break;
    }
    // "Farsta Centrum" + "Farstaplan 29, 123 47 Stockholm": keep the last part with a street number as street.
    addr = parts.join(', ');
  } else {
    // Only look near the store block (a trailing section may run into the page footer / office address).
    const near = lines.slice(0, hi + hoursLines.length + 4);
    const pi = near.findIndex(l => POST_RE.test(l));
    const si = lines.slice(0, hi).reverse().find(l => /^[A-ZÅÄÖ][a-zåäöé]+(?:\s[A-Za-zåäöé]+)*\s\d+\s?[A-Za-z]?$/.test(l));
    if (pi >= 0 && (pi < hi || !si)) addr = /^[^\d]+\s\d/.test(near[pi].split(POST_RE)[0] || '') ? near[pi] : [near[pi - 1], near[pi]].filter(Boolean).join(', ');
    else if (si) addr = si;
  }
  const ti = lines.findIndex(l => /^(tel|telefon)/i.test(l));
  const telLine = ti >= 0 ? lines[ti] + ' ' + (lines[ti + 1] || '') : '';
  const telHref = html.match(/href="tel:([^"]+)"/)?.[1];
  const links = [...html.matchAll(/href="([^"]*(?:google\.[a-z.]+\/maps|maps\.apple)[^"]*)"/g)].map(m => m[1]);
  const c = links.map(mapsCoords).find(Boolean) || null;
  return {
    heading, hoursText, hours: parseHoursText(hoursText), addr,
    telefon: phoneFrom(telLine) || (telHref ? decode(telHref) : null),
    epost: emailFrom(html), lat: c?.lat, lon: c?.lon,
    text: lines.join(' '),
  };
}

function cleanAddress(addr, ortDefault) {
  let a = splitAddress(addr || '');
  if (a.gatuadress && a.gatuadress.includes(',')) {
    // keep the most specific part with a house number ("Farsta Centrum, Farstaplan 29" -> "Farstaplan 29")
    const parts = a.gatuadress.split(/,|\.\s/).map(clean).filter(Boolean);
    const withNo = parts.filter(p => /[a-zåäöé]\s\d+\s?[A-Za-z]?$/i.test(p) && !/^plan\s/i.test(p));
    if (withNo.length) a.gatuadress = withNo[withNo.length - 1];
  } else if (a.gatuadress && /\.\s/.test(a.gatuadress)) {
    const withNo = a.gatuadress.split(/\.\s/).map(clean).filter(p => p && /[a-zåäöé]\s\d+\s?[A-Za-z]?$/i.test(p) && !/^plan\s/i.test(p));
    if (withNo.length) a.gatuadress = withNo[withNo.length - 1];
  }
  if (!a.ort && ortDefault) a.ort = ortDefault;
  return a;
}

async function textOrg(cfg, errors) {
  let html;
  try { html = await fetchAllowed(cfg.url); }
  catch (e) { errors.push(`${cfg.org}: ${e.message}`); console.error('skip org', cfg.org, e.message); return []; }
  const main = cfg.cut ? cfg.cut(html) : html;
  const out = [];
  for (const sec of headingSections(main, cfg.levels || '2-4')) {
    if (/tradera|webbshop|remake|kontakt|ge stöd|digitala/i.test(sec.heading)) continue;
    const b = parseBlock(sec.heading, sec.html);
    if (!b) continue;
    const a = cleanAddress(b.addr, cfg.ortDefault);
    const name = clean(sec.heading.replace(/,\s*/g, ' '));
    out.push(store({
      source_id: `${cfg.id}:${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      namn: cfg.name(name), kedja: 'Stadsmissionen', organisation: cfg.org,
      typ: /outlet/i.test(name) ? 'second hand outlet' : 'second hand',
      gatuadress: a.gatuadress, postnummer: a.postnummer, ort: a.ort, lat: b.lat, lon: b.lon,
      telefon: b.telefon, epost: b.epost || cfg.epost || null, webb: cfg.url,
      oppettider: b.hours, oppettider_text: b.hoursText, sortiment: sortimentFrom(b.text),
    }));
  }
  if (!out.length) errors.push(`${cfg.org}: no store blocks parsed from ${cfg.url}`);
  return out;
}

const TEXT_ORGS = [
  { id: 'gbg', org: 'Göteborgs Stadsmission', url: 'https://www.stadsmissionen.org/second-hand/butiker/', levels: '2', ortDefault: 'Göteborg', name: n => `Stadsmissionens Second Hand ${n}`,
    cut: h => h.slice(0, h.indexOf('Kontakta oss') > 0 ? h.indexOf('Kontakta oss') : h.length) },
  { id: 'skane', org: 'Skåne Stadsmission', url: 'https://www.skanestadsmission.se/second-hand/', levels: '2', ortDefault: 'Malmö', name: n => `Skåne Stadsmission Second Hand ${n}`,
    cut: h => { const i = h.indexOf('<main'); return h.slice(i > 0 ? i : 0, h.indexOf('Fler butiker') > 0 ? h.indexOf('Fler butiker') : h.length); } },
  { id: 'uppsala', org: 'Uppsala Stadsmission', url: 'https://uppsalastadsmission.se/secondhand/', levels: '4', ortDefault: 'Uppsala', name: n => `Uppsala Stadsmission ${n.replace(/^Butik\s+/i, 'Second Hand ')}` },
  { id: 'kalmar', org: 'Kalmar Stadsmission', url: 'https://kalmarstadsmission.se/second-hand/', levels: '3', ortDefault: 'Kalmar', name: n => `Kalmar ${n}` },
];

async function vasteras(errors) {
  const ORG = 'Västerås Stadsmission', url = 'https://vasterasstadsmission.se/second-hand/';
  let html;
  try { html = await fetchAllowed(url); } catch (e) { errors.push(`${ORG}: ${e.message}`); return []; }
  const text = htmlToLines(html).join(' ');
  const m = text.match(/hittar oss på\s+(.+?)\s+i\s+([A-ZÅÄÖ][a-zåäö]+)\s*\./);
  const hm = text.match(/Öppe?t+ider\s+(.+?)\s+Avvikande/);
  if (!m && !hm) { errors.push(`${ORG}: store block not found`); return []; }
  const c = [...html.matchAll(/href="([^"]*google\.[a-z.]+\/maps[^"]*)"/g)].map(x => mapsCoords(x[1])).find(Boolean);
  return [store({
    source_id: 'vasteras:butiken', namn: `Västerås Stadsmission Second Hand ${m ? m[2] : ''}`.trim(), kedja: 'Stadsmissionen', organisation: ORG, typ: 'secondhand-varuhus',
    gatuadress: m?.[1] || null, ort: 'Västerås', lat: c?.lat, lon: c?.lon, webb: url,
    oppettider: parseHoursText(hm?.[1]), oppettider_text: hm?.[1], sortiment: sortimentFrom(text.slice(0, 2000)),
    extra: { omrade: m?.[2] || null },
  })];
}

run(async () => {
  const errors = [];
  let stores = [];
  try { stores.push(...await stockholm(errors)); }
  catch (e) { errors.push(`Stockholms Stadsmission: ${e.message}`); console.error('Stockholm failed:', e.message); }
  for (const cfg of TEXT_ORGS) stores.push(...await textOrg(cfg, errors));
  stores.push(...await vasteras(errors));
  writeOut(META, stores, { errors });
});
