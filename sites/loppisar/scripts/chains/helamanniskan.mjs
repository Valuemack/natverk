// Hela Människan Secondhand - store list from the public WP REST endpoint /wp-json/wp/v2/secondhand-butik
// (custom post type; the response is prefixed by PHP warnings, parsed loosely), then each store page for
// address, phone, weekly hours. No coordinates are published (only maps.app.goo.gl short links).
// Note: some local Hela Människan units run shops listed only on their own sites; those are not covered.
import { fetchAllowed, Blocked, decode, htmlToLines, parseHoursText, splitAddress, phoneFrom, emailFrom, mapsCoords, sortimentFrom, store, writeOut, run } from '../lib/chain.mjs';

const BASE = 'https://helamanniskan.se';
const META = {
  source: 'helamanniskan', kedja: 'Hela Människan', url: BASE + '/second-hand/',
  terms_note: 'robots.txt: only /wp-admin/ disallowed. No användarvillkor page found.',
};

function parseStore(html) {
  const lines = htmlToLines(html.replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, ' '));
  const after = (label) => { const i = lines.findIndex(l => l.toUpperCase() === label); return i >= 0 ? lines[i + 1] : null; };
  const hi = lines.findIndex(l => /^öppettider\.?$/i.test(l));
  const hoursLines = [];
  if (hi >= 0) for (let i = hi + 1; i < lines.length && !/avvikande|välkommen/i.test(lines[i]) && hoursLines.length < 14; i++) hoursLines.push(lines[i]);
  const wi = lines.findIndex(l => /^välkommen in$/i.test(l));
  const desc = wi >= 0 ? lines.slice(wi, wi + 12).join(' ') : '';
  const maps = html.match(/href="([^"]*(?:google\.[a-z.]+\/maps|maps\.apple)[^"]*)"/)?.[1];
  return { address: after('ADRESS'), phone: after('TELEFON'), hoursText: hoursLines.join(' '), epost: emailFrom(html.match(/<main[\s\S]*?<\/main>/)?.[0] || ''), desc, coords: mapsCoords(maps) };
}

run(async () => {
  const errors = [];
  const list = await fetchAllowed(`${BASE}/wp-json/wp/v2/secondhand-butik?per_page=100&_fields=id,slug,link,title`, { type: 'json' });
  const stores = [];
  for (const s of list) {
    let p;
    try { p = parseStore(await fetchAllowed(s.link)); }
    catch (e) { errors.push(`${s.link}: ${e.message}`); console.error('skip page', s.link, e.message); if (e instanceof Blocked) break; continue; }
    const title = decode(s.title?.rendered || s.slug);
    const a = splitAddress(p.address);
    stores.push(store({
      source_id: String(s.id), namn: `Hela Människan Secondhand ${title}`, kedja: 'Hela Människan', typ: 'second hand',
      gatuadress: a.gatuadress, postnummer: a.postnummer, ort: a.ort || title, lat: p.coords?.lat, lon: p.coords?.lon,
      telefon: phoneFrom(p.phone) || p.phone, epost: p.epost, webb: s.link,
      oppettider: parseHoursText(p.hoursText), oppettider_text: p.hoursText, sortiment: sortimentFrom(p.desc),
    }));
  }
  writeOut(META, stores, { errors });
});
