// PMU Second Hand - store list from the public WP REST endpoint /wp-json/wp/v2/stores (custom post type),
// then each store page /butik/<slug>/ for address, phone, e-mail, weekly hours and the Google Maps embed
// (coordinates = map centre of the embed, normally the store pin).
import { fetchAllowed, Blocked, decode, stripTags, htmlToLines, parseHoursText, splitAddress, mapsCoords, phoneFrom, emailFrom, sortimentFrom, store, writeOut, run } from '../lib/chain.mjs';

const BASE = 'https://pmu.se';
const META = {
  source: 'pmu', kedja: 'PMU Second Hand', url: BASE + '/hitta-butik/',
  terms_note: 'robots.txt: only /wp-admin/ disallowed. /landing/villkor/ covers only the gift shop (purchases/donations), not site content.',
};

function parseStore(html) {
  const hero = html.match(/<article class="store__hero">([\s\S]*?)<\/article>/)?.[1] || '';
  const name = stripTags(hero.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || '');
  const addrLines = htmlToLines(hero.match(/<div class="address-info">([\s\S]*?)<\/div>/)?.[1] || '');
  const hoursLines = htmlToLines(hero.match(/<div class="store-opening-hours-wrapper">([\s\S]*?)<\/div>/)?.[1] || '').filter(l => !/^butik$/i.test(l));
  const pi = addrLines.findIndex(l => /^\d{3}\s?\d{2}\s/.test(l));
  const addr = pi >= 0 ? splitAddress(addrLines.slice(0, pi + 1).join(', ')) : splitAddress(addrLines[0] || '');
  const contact = addrLines.slice(pi >= 0 ? pi + 1 : 1).join(' ');
  const iframe = html.match(/<iframe[^>]+src="([^"]*google\.[a-z.]+\/maps\/embed[^"]*)"/)?.[1];
  const more = stripTags(html.match(/<article class="fold-out-block">([\s\S]*?)<\/section>/)?.[1] || '');
  return {
    name, addr, telefon: phoneFrom(contact), epost: emailFrom(hero),
    hoursText: hoursLines.filter(l => !/helgdag|avvikande/i.test(l)).join(', '),
    coords: mapsCoords(iframe ? decode(iframe) : null), more,
  };
}

run(async () => {
  const errors = [];
  const list = [];
  for (let page = 1; page <= 5; page++) {
    let batch;
    try { batch = await fetchAllowed(`${BASE}/wp-json/wp/v2/stores?per_page=100&page=${page}&_fields=id,slug,link,title,modified`, { type: 'json' }); }
    catch (e) { if (page === 1) throw e; break; }
    if (!Array.isArray(batch) || !batch.length) break;
    list.push(...batch);
    if (batch.length < 100) break;
  }
  const stores = [];
  for (const s of list) {
    const url = s.link;
    let p = null;
    try { p = parseStore(await fetchAllowed(url)); }
    catch (e) { errors.push(`${url}: ${e.message}`); console.error('skip page', url, e.message); if (e instanceof Blocked) break; continue; }
    const title = decode(s.title?.rendered || p.name);
    stores.push(store({
      source_id: String(s.id), namn: `PMU Second Hand ${p.name || title}`, kedja: 'PMU Second Hand', typ: 'second hand',
      gatuadress: p.addr.gatuadress, postnummer: p.addr.postnummer, ort: p.addr.ort || title,
      lat: p.coords?.lat, lon: p.coords?.lon, telefon: p.telefon, epost: p.epost, webb: url,
      oppettider: parseHoursText(p.hoursText), oppettider_text: p.hoursText,
      sortiment: sortimentFrom(p.more),
      extra: { coords_source: p.coords ? 'google-maps-embed' : null, modified: s.modified },
    }));
  }
  writeOut(META, stores, { errors });
});
