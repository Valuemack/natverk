// Human Bridge second hand = Lindra Second Hand (humanbridge.se/second-hand-2/ points to lindra.se/vara-butiker).
// One HTML page lists all stores (accordion blocks): name, address, hours, phone, e-mail, maps short link.
// Coordinates are not published (maps.app.goo.gl short links only; not resolved, to avoid extra Google requests).
import { fetchAllowed, decode, clean, stripTags, htmlToLines, parseHoursText, splitAddress, mapsCoords, phoneFrom, store, writeOut, run } from '../lib/chain.mjs';

const URL_LIST = 'https://lindra.se/vara-butiker/';
const META = {
  source: 'humanbridge', kedja: 'Lindra Second Hand', url: URL_LIST,
  terms_note: 'robots.txt (lindra.se, humanbridge.se): only /wp-admin/ disallowed. No användarvillkor page found.',
  extra: { organisation: 'Human Bridge (Lindra Second Hand)', note: 'Läkarmissionen has no own second hand shops listed on lakarmissionen.se; its textile collection goes via Human Bridge/Lindra.' },
};

function parseList(html) {
  const titles = new Map([...html.matchAll(/<li data-index="(\d+)" class="accordion-item[^"]*">([\s\S]*?)<\/li>/g)].map(m => [m[1], stripTags(m[2])]));
  const out = [];
  for (const m of html.matchAll(/<div data-index="(\d+)" class="accorion-content-mob">([\s\S]*?)(?=<li data-index=|<div data-index="\d+" class="accorion-content|<\/ul>)/g)) {
    const [, idx, b] = m;
    const name = stripTags(b.match(/<strong>([\s\S]*?)<\/strong>/)?.[1] || '');
    const ps = [...b.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(x => x[1]);
    const texts = ps.map(stripTags);
    const ki = texts.findIndex(t => /visa karta/i.test(t || ''));
    const address = texts.find(t => t && /\d{3}\s?\d{2}\s/.test(t) && !/^(tel|epost|instagram)/i.test(t)) || (ki > 0 ? texts[ki - 1] : null);
    const hoursHtml = b.match(/<div class="force-f">([\s\S]*?)<\/div>/)?.[1] || '';
    const hoursText = htmlToLines(hoursHtml).join(' ');
    const tel = b.match(/href="tel:([^"]+)"/)?.[1];
    const mail = b.match(/href="mailto:\s*([^"]+)"/)?.[1];
    const maps = b.match(/href="([^"]*(?:maps\.app\.goo\.gl|google\.[a-z.]+\/maps)[^"]*)"/)?.[1];
    out.push({ idx, title: titles.get(idx) || name, name, address, hoursText, tel: tel ? decode(tel) : null, mail: mail ? decode(mail).trim() : null, maps });
  }
  return out;
}

run(async () => {
  const html = await fetchAllowed(URL_LIST);
  const stores = parseList(html).map(it => {
    const a = splitAddress(it.address);
    const c = mapsCoords(it.maps);
    return store({
      source_id: it.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      namn: /lindra/i.test(it.name || '') ? it.name : `Lindra Second Hand ${clean(it.title.replace(/,\s*/g, ' '))}`, kedja: 'Lindra Second Hand', typ: 'second hand',
      gatuadress: a.gatuadress, postnummer: a.postnummer, ort: a.ort || clean(it.title.split(',').pop()), lat: c?.lat, lon: c?.lon,
      telefon: phoneFrom(it.tel) || it.tel, epost: it.mail, webb: URL_LIST,
      oppettider: parseHoursText(it.hoursText), oppettider_text: it.hoursText,
      sortiment: ['kläder', 'textil', 'husgeråd', 'inredning', 'leksaker', 'elektronik'], // chain-wide sortiment stated on the list page
      extra: { omrade: clean(it.title), organisation: 'Human Bridge' },
    });
  });
  writeOut(META, stores);
});
