// Erikshjälpen Second Hand - all stores from the public WP REST endpoint
// /wp-json/wp/v2/stores-post-type (one request, ~50 stores). The rendered content contains
// address, phone, e-mail, 3 weeks of dated opening hours, product categories and data-lat/data-lng.
// Weekly hours = per weekday the most common value over the published weeks (filters out holiday deviations).
import { fetchAllowed, decode, stripTags, htmlToLines, normRange, svDay, emptyHours, DAYS, phoneFrom, emailFrom, sortimentFrom, coord, store, writeOut, run } from '../lib/chain.mjs';

const BASE = 'https://erikshjalpen.se';
const META = {
  source: 'erikshjalpen', kedja: 'Erikshjälpen Second Hand', url: BASE + '/butiker/',
  terms_note: 'robots.txt: only /wp/wp-admin/, /sok/, /search/ and ?s= disallowed; WP REST API is public. No terms of use for site content found.',
};

function weeklyHours(html) {
  const blocks = [...html.matchAll(/<div class="dates visit[\s\S]*?(?=<div class="dates |<div class="tab-pane|$)/g)].map(m => m[0]);
  const votes = Object.fromEntries(DAYS.map(d => [d, {}]));
  for (const b of blocks) {
    const seen = new Set();
    for (const m of b.matchAll(/<span class="day[^"]*">\s*([^<]+?)\s*<\/span>[\s\S]*?<span class="hours">\s*([^<]+?)\s*<\/span>/g)) {
      const d = svDay(m[1]); if (!d || seen.has(d)) continue; seen.add(d);
      const v = normRange(decode(m[2]));
      if (v) votes[d][v] = (votes[d][v] || 0) + 1;
    }
  }
  const h = emptyHours();
  for (const d of DAYS) {
    const best = Object.entries(votes[d]).sort((a, b) => b[1] - a[1])[0];
    if (best) h[d] = best[0];
  }
  return { h, text: DAYS.map(d => `${d} ${h[d] ?? '?'}`).join(', ') };
}

function parse(s) {
  const html = s.content?.rendered || '';
  const contact = html.match(/<h4[^>]*>Kontakt<\/h4>([\s\S]*?)<\/ul>/)?.[1] || '';
  const addrSpans = [...(contact.match(/fa-location-dot[\s\S]*?<div class="ps-4 col-7">([\s\S]*?)<\/div>/)?.[1] || '').matchAll(/<span class="d-block">([^<]*)<\/span>/g)].map(m => decode(m[1]).trim());
  const pl = addrSpans.findIndex(l => /^\d{3}\s?\d{2}\b/.test(l));
  const gatuadress = pl > 0 ? addrSpans.slice(0, pl).join(', ') : addrSpans[0] || null;
  const pm = pl >= 0 ? addrSpans[pl].match(/^(\d{3}\s?\d{2})\s+(.+)$/) : null;
  const cats = html.match(/kategorier av varor:<\/p>\s*<ul>([\s\S]*?)<\/ul>/)?.[1] || '';
  const catList = [...cats.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => decode(stripTags(m[1])));
  const lat = html.match(/data-lat="(-?[\d.]+)"/)?.[1], lng = html.match(/data-lng="(-?[\d.]+)"/)?.[1];
  const { h, text } = weeklyHours(html);
  const title = decode(stripTags(s.title?.rendered || ''));
  const telLine = contact.match(/href="tel:([^"]+)"/)?.[1];
  return {
    source_id: String(s.id), namn: `Erikshjälpen Second Hand ${title}`, kedja: 'Erikshjälpen Second Hand', typ: 'second hand',
    gatuadress, postnummer: pm?.[1] ?? null, ort: pm?.[2] ?? null,
    ...(coord(lat, lng) || {}),
    telefon: telLine ? decode(telLine) : phoneFrom(htmlToLines(contact).join(' ')), epost: emailFrom(contact), webb: s.link,
    oppettider: h, oppettider_text: text,
    sortiment: sortimentFrom(catList.join(', ')),
    extra: { kategorier: catList, coords_source: lat ? 'store-page-map' : null, modified: s.modified },
  };
}

run(async () => {
  const list = [];
  for (let page = 1; page <= 5; page++) {
    let batch;
    try { batch = await fetchAllowed(`${BASE}/wp-json/wp/v2/stores-post-type?per_page=100&page=${page}&_fields=id,link,title,content,modified,status`, { type: 'json' }); }
    catch (e) { if (page === 1) throw e; break; }
    if (!Array.isArray(batch) || !batch.length) break;
    list.push(...batch);
    if (batch.length < 100) break;
  }
  const errors = [], stores = [];
  for (const s of list) {
    if (s.status && s.status !== 'publish') continue;
    try { stores.push(store(parse(s))); } catch (e) { errors.push(`${s.link}: ${e.message}`); }
  }
  writeOut(META, stores, { errors });
});
