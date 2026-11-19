// Röda Korset Second hand (Kupan) - https://www.rodakorset.se/second-hand/butiker/
// List pages (server-rendered search, ?p=N&s=100) give name, address, weekly hours and category tags.
// Each store page has a JSON-LD Store (geo coordinates, postal code, phone, openingHoursSpecification).
import { fetchAllowed, Blocked, decode, stripTags, jsonLd, ldHours, parseHoursText, splitAddress, coord, sortimentFrom, store, writeOut, run } from '../lib/chain.mjs';

const BASE = 'https://www.rodakorset.se';
const LIST = BASE + '/second-hand/butiker/';
const PAGE_SIZE = 100;
const META = {
  source: 'rodakorset', kedja: 'Röda Korset', url: LIST,
  terms_note: 'robots.txt disallows /episerver/CMS/, /util/, /*?timeline=*, /test/*, /installningar/*, /checkout/* - list (?p=&s=) and /ort/... store pages allowed. No usage terms for site content found.',
};

const TAG_MAP = { 'försäljning av husgeråd': 'husgeråd', 'försäljning av möbler': 'möbler', 'kläder': 'kläder', 'barnkläder': 'barnartiklar', 'böcker': 'böcker', 'leksaker': 'leksaker', 'möbler': 'möbler' };

function parseListPage(html) {
  const items = [];
  for (const m of html.matchAll(/<div class="result__item[^"]*">([\s\S]*?)<\/details>/g)) {
    const b = m[1];
    const a = b.match(/<h3 class="result__heading">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const tags = stripTags(b.match(/<p class="pre-heading">([\s\S]*?)<\/p>/)?.[1] || '')?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const address = stripTags(b.match(/icon-map-marker[\s\S]*?<\/span>\s*<span>([\s\S]*?)<\/span>/)?.[1] || '');
    const pairs = [...b.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/g)].map(x => `${stripTags(x[1])} ${stripTags(x[2])}`);
    items.push({ url: new URL(decode(a[1]), BASE).href, name: stripTags(a[2]), tags, address, hoursText: pairs.join(', ') });
  }
  const total = +(html.match(/(\d+)\s*-\s*Sökresultat/)?.[1] || 0);
  return { items, total };
}

run(async () => {
  const errors = [];
  const items = new Map();
  let total = 0;
  for (let p = 1; p <= 20; p++) {
    const { items: pageItems, total: t } = parseListPage(await fetchAllowed(`${LIST}?p=${p}&s=${PAGE_SIZE}`));
    total = t || total;
    for (const it of pageItems) items.set(it.url, it);
    if (!pageItems.length || items.size >= total) break;
  }
  if (total && items.size < total) errors.push(`list returned ${items.size} of ${total} stores`);

  const stores = [];
  for (const it of items.values()) {
    let ld = null;
    try { ld = jsonLd(await fetchAllowed(it.url)).find(x => x['@type'] === 'Store' || x['@type']?.includes?.('Store')); }
    catch (e) { errors.push(`${it.url}: ${e.message}`); console.error('skip page', it.url, e.message); if (e instanceof Blocked) break; }
    const la = splitAddress(it.address);
    const c = coord(ld?.geo?.latitude, ld?.geo?.longitude);
    const listHours = parseHoursText(it.hoursText);
    const sortiment = [...it.tags.map(t => TAG_MAP[t.toLowerCase()]).filter(Boolean), ...sortimentFrom(it.tags.join(' '))];
    stores.push(store({
      source_id: new URL(it.url).pathname.split('/').filter(Boolean).pop(),
      namn: ld?.name || it.name, kedja: 'Röda Korset', typ: 'kupan',
      gatuadress: ld?.address?.streetAddress || la.gatuadress,
      postnummer: ld?.address?.postalCode || la.postnummer,
      ort: ld?.address?.addressLocality || la.ort,
      lat: c?.lat, lon: c?.lon,
      telefon: ld?.telephone, epost: ld?.email || null, webb: it.url,
      oppettider: ldHours(ld?.openingHoursSpecification) || listHours,
      oppettider_text: it.hoursText, sortiment,
      extra: { kategorier: it.tags, kommun_slug: new URL(it.url).pathname.split('/')[3] || null },
    }));
  }
  writeOut(META, stores, { errors });
});
