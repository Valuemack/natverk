// Myrorna (Frälsningsarmén) - store list from https://www.myrorna.se/butiker/ + each store page.
// The WP REST API requires authentication (401), so we use the public HTML pages. No coordinates are
// published (map embeds use a text query), so lat/lon stay null; address has street + ort but no postnummer.
import { fetchAllowed, Blocked, decode, clean, stripTags, splitAddress, parseHoursText, emptyHours, svDay, normRange, hasHours, sortimentFrom, store, writeOut, run } from '../lib/chain.mjs';

const BASE = 'https://www.myrorna.se';
const LIST = BASE + '/butiker/';
const META = {
  source: 'myrorna', kedja: 'Myrorna', url: LIST,
  terms_note: 'robots.txt: only /wp/wp-admin/ disallowed; WP REST API requires login (not used). No användarvillkor page found.',
};

function parseList(html) {
  const out = [];
  for (const m of html.matchAll(/<div class="stores-list__item" data-city="([^"]*)">([\s\S]*?)<\/div>\s*(?=<div class="stores-list__item"|<\/div>)/g)) {
    const block = m[2];
    const url = block.match(/<a href="([^"]+)"/)?.[1];
    const title = stripTags(block.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] || '');
    const p = block.match(/<\/a>\s*<p>([\s\S]*?)<\/p>/)?.[1] || '';
    const lines = p.split(/<br\s*\/?>/i).map(stripTags).filter(Boolean);
    out.push({ url, title, city: m[1], address: lines[0] || null, hoursText: lines.find(l => /\d/.test(l) && /(mån|tis|ons|tors|fre|lör|sön|vardag|alla dagar)/i.test(l)) || null, furniture: /möbler/i.test(p) });
  }
  return out;
}

function parseStore(html) {
  const h = emptyHours();
  const ul = html.match(/store-content__opening-hours--regular">([\s\S]*?)<\/ul>/)?.[1] || '';
  for (const li of ul.matchAll(/<li><span>([^<]*)<\/span>([^<]*)<\/li>/g)) {
    const d = svDay(decode(li[1]).replace(':', '').trim());
    if (d) h[d] = normRange(decode(li[2]));
  }
  const name = stripTags(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || '');
  const mapsA = html.match(/<a href="https:\/\/www\.google\.[a-z.]+\/maps\/search\/[^"]*"[^>]*>([^<]*)<\/a>/);
  const tel = html.match(/href="tel:([^"]+)"/)?.[1];
  const mail = html.match(/href="mailto:([^"]+)"/)?.[1];
  const intro = html.match(/<div class="col-xs-12 col-md-10 col-md-push-1 col-lg-8 col-lg-push-2">\s*<hr>([\s\S]*?)<\/div>/)?.[1] || '';
  const inl = html.match(/<h2>Inlämning<\/h2>([\s\S]*?)<\/div>/)?.[1] || '';
  return { name, address: mapsA ? decode(mapsA[1]) : null, hours: hasHours(h) ? h : null, tel: tel ? decode(tel) : null, mail: mail ? decode(mail).toLowerCase() : null, text: stripTags(intro + ' ' + inl) || '' };
}

run(async () => {
  const listHtml = await fetchAllowed(LIST);
  const items = parseList(listHtml).filter(i => i.url);
  const stores = [], errors = [];
  for (const it of items) {
    let page = null;
    try { page = parseStore(await fetchAllowed(it.url)); }
    catch (e) { errors.push(`${it.url}: ${e.message}`); console.error('skip page', it.url, e.message); if (e instanceof Blocked) break; }
    const addr = splitAddress(page?.address || it.address);
    const slug = new URL(it.url).pathname.replace(/^\/butiker\/|\/$/g, '');
    const hours = page?.hours || parseHoursText(it.hoursText);
    const sortiment = sortimentFrom(page?.text || '');
    if (it.furniture && !sortiment.includes('möbler')) sortiment.push('möbler');
    stores.push(store({
      source_id: slug,
      namn: (page?.name || `Myrorna ${it.title}`).replace(/,\s*/g, ' '),
      kedja: 'Myrorna', typ: /outlet/i.test(slug) ? 'second hand outlet' : 'second hand',
      gatuadress: addr.gatuadress, postnummer: addr.postnummer, ort: addr.ort,
      telefon: page?.tel, epost: page?.mail, webb: it.url,
      oppettider: hours, oppettider_text: it.hoursText,
      sortiment,
      extra: { tar_emot_mobler: it.furniture },
    }));
  }
  writeOut(META, stores, { errors });
});
