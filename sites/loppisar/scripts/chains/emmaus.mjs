// Emmaus second hand in Sweden - the Emmaus groups are independent organisations, so one file with `organisation`:
//  - Artikel2 (formerly Emmaus Stockholm): list page /second-hand-butiker-stockholm/ -> one page per store.
//  - Björkåfrihet (formerly Emmaus Björkå): one page /oppettider-bjorkafrihet-second-hand-butiker/ with all stores
//    (Google Maps place links give coordinates for some stores).
import { fetchAllowed, Blocked, decode, clean, stripTags, htmlToLines, parseHoursText, splitAddress, mapsCoords, phoneFrom, emailFrom, sortimentFrom, store, writeOut, run } from '../lib/chain.mjs';

const META = {
  source: 'emmaus', kedja: 'Emmaus', url: 'https://artikel2.se/second-hand-butiker-stockholm/',
  terms_note: 'robots.txt: artikel2.se (WooCommerce/Yoast defaults) and bjorkafrihet.se (/wp-admin/, /?page_id=8917/) - store pages allowed. No användarvillkor found.',
  extra: { not_covered: ['emmausstockholm.se (TLS cert mismatch; content moved to artikel2.se)', 'emmausbjorka.se (connection timeout; content moved to bjorkafrihet.se)', 'small independent Emmaus groups (e.g. Emmaus Lund, Emmaus Åkvarn) without a common store list'] },
};

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function artikel2(errors) {
  const ORG = 'Artikel2 (f.d. Emmaus Stockholm)';
  const list = await fetchAllowed(META.url);
  const links = [...new Map([...list.matchAll(/href="(https:\/\/artikel2\.se\/second-hand-([a-z-]+)\/)"[^>]*>([^<]*)</g)]
    .filter(m => !/tradera|butiker-stockholm/.test(m[2])).map(m => [m[1], { url: m[1], slug: m[2], text: clean(decode(m[3])) }])).values()];
  const out = [];
  for (const l of links) {
    let html;
    try { html = await fetchAllowed(l.url); } catch (e) { errors.push(`${l.url}: ${e.message}`); console.error('skip page', l.url, e.message); if (e instanceof Blocked) break; continue; }
    const lines = htmlToLines(html.replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, ' '));
    const hi = lines.findIndex(x => /^öppettider/i.test(x));
    const hours = [];
    if (hi >= 0) for (let i = hi + 1; i < lines.length && !/^(avvikande|kontakt)/i.test(lines[i]) && hours.length < 10; i++) hours.push(lines[i]);
    const ai = lines.findIndex(x => /^adress\s*:/i.test(x));
    const addrParts = [];
    if (ai >= 0) {
      const rest = lines[ai].replace(/^adress\s*:\s*/i, '');
      if (rest) addrParts.push(rest);
      for (let i = ai + 1; i < lines.length && addrParts.length < 3 && !addrParts.some(p => /\d{3}\s?\d{2}\s/.test(p)); i++) addrParts.push(lines[i]);
    }
    const addrStr = addrParts.join(', ');
    let a = splitAddress(addrStr);
    if (a.gatuadress?.includes(',')) a.gatuadress = a.gatuadress.split(',').map(clean).filter(p => /\d/.test(p)).pop() || a.gatuadress;
    // "Farsta Centrum Farstaplan 29" (one line) -> keep from the street name on
    const ti = lines.findIndex(x => /^telefonnummer/i.test(x));
    const tel = ti >= 0 ? phoneFrom(lines[ti] + ' ' + (lines[ti + 1] || '')) : null;
    const descStart = lines.findIndex(x => /^vår second hand-butik/i.test(x));
    const area = l.text?.replace(/^Artikel2\s*/i, '') || l.slug;
    const maps = html.match(/href="([^"]*google\.[a-z.]+\/maps[^"]*)"/)?.[1];
    const c = mapsCoords(maps);
    out.push(store({
      source_id: 'artikel2:' + l.slug, namn: `Artikel2 Second hand ${area}`, kedja: 'Emmaus', organisation: ORG, typ: 'second hand',
      gatuadress: a.gatuadress, postnummer: a.postnummer, ort: a.ort, lat: c?.lat, lon: c?.lon,
      telefon: tel, epost: null, webb: l.url,
      oppettider: parseHoursText(hours.join(' ')), oppettider_text: hours.join(' '),
      sortiment: sortimentFrom(descStart >= 0 ? lines.slice(descStart, descStart + 6).join(' ') : ''),
      extra: { adress_text: addrStr || null },
    }));
  }
  return out;
}

async function bjorkafrihet(errors) {
  const ORG = 'Björkåfrihet (f.d. Emmaus Björkå)';
  const url = 'https://bjorkafrihet.se/oppettider-bjorkafrihet-second-hand-butiker/';
  let html;
  try { html = await fetchAllowed(url); } catch (e) { errors.push(`${ORG}: ${e.message}`); return []; }
  const main = html.match(/<main[\s\S]*?<\/main>/)?.[0] || html;
  const out = [];
  for (const block of main.split(/<div class="wp-block-columns/).slice(1)) {
    const lines = htmlToLines(block);
    const hi = lines.findIndex(x => /^öppettider/i.test(x));
    if (hi < 1) continue;
    const name = lines[hi - 1];
    const hours = [];
    for (let i = hi + 1; i < lines.length && !/^(telefon|mail|tel)/i.test(lines[i]); i++) hours.push(lines[i]);
    const mailLine = lines.find(x => /@/.test(x)) || '';
    const epost = emailFrom(block);
    const street = clean(mailLine.replace(/^.*@\S+/, '')) || null;
    const links = [...block.matchAll(/href="([^"]*(?:google\.[a-z.]+\/maps|goo\.gl\/maps)[^"]*)"/g)].map(m => decode(m[1]));
    const c = links.map(mapsCoords).find(Boolean);
    let linkText = links.join(' ').replace(/\+/g, ' ');
    try { linkText = decodeURIComponent(linkText); } catch { /* keep raw */ }
    const pn = linkText.match(/(?<![\d.])(\d{3})\s(\d{2})\s+([A-ZÅÄÖ][a-zåäö]+)/);
    out.push(store({
      source_id: 'bjorkafrihet:' + slugify(name), namn: `Björkåfrihet Second Hand ${name}`, kedja: 'Emmaus', organisation: ORG, typ: 'second hand',
      gatuadress: street, postnummer: pn ? pn[1] + pn[2] : null, ort: name.split(/\s+/)[0], lat: c?.lat, lon: c?.lon,
      telefon: phoneFrom(lines.find(x => /^telefon/i.test(x))), epost, webb: url,
      oppettider: parseHoursText(hours.join(' ')), oppettider_text: hours.join(' '), sortiment: [],
    }));
  }
  if (!out.length) errors.push(`${ORG}: no store blocks parsed`);
  return out;
}

run(async () => {
  const errors = [];
  const stores = [];
  try { stores.push(...await artikel2(errors)); } catch (e) { errors.push(`Artikel2: ${e.message}`); console.error('Artikel2 failed:', e.message); }
  stores.push(...await bjorkafrihet(errors));
  writeOut(META, stores, { errors });
});
