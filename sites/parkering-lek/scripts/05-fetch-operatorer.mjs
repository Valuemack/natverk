// Hämtar operatörernas publika anläggningssidor (via deras sitemaps) och extraherar fakta:
// namn, adress, koordinater, kapacitet, taxa, öppettider, höjdbegränsning, laddplatser, zonkod.
// Ingen fritext (beskrivningar) sparas - operatörernas texter är upphovsrättsskyddade.
//   node scripts/05-fetch-operatorer.mjs [stockholmparkering] [aimo] [apcoa]   (standard: alla)
// robots.txt kontrolleras för varje URL; 1 anrop/s per värd; operatörerna körs parallellt (olika värdar).
// Cache per sida i data/raw/operatorer/<op>/ (7 dagar, FORCE=1 tvingar), så avbrutna körningar kan återupptas.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RAW_DIR, fetchText, BlockedError, writeJson, readJson, nowIso, ensureDir } from './lib.mjs';
import { htmlToText, attr, jsonLd, decodeEntities, num, hoursFromSchema, hoursFromSwedish } from './html.mjs';

const TTL = 7 * 24 * 3600e3;
const LIMIT = Number(process.env.LIMIT || 0); // för test: max antal sidor per operatör

async function sitemapUrls(url) {
  const { text } = await fetchText(url, { timeoutMs: 90000 });
  const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]).trim());
  if (/<sitemapindex/i.test(text)) { const all = []; for (const u of locs) all.push(...await sitemapUrls(u)); return all; }
  return locs;
}
const yesNo = (s) => (s == null ? null : /^ja|yes|true/i.test(s) ? true : /^nej|no|false/i.test(s) ? false : null);
// Taxa per timme ur svensk taxatext när den är entydig ("25 kr/tim", "10 kr per påbörjad 30 min").
export function perTimme(t) {
  if (!t) return null; let s = t.toLowerCase().replace(/ /g, ' ').replace(/sek/g, 'kr');
  s = s.replace(/\bsek\b/g, 'kr');
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*kr\s*(?:\/|per)\s*(?:påbörjad(?:e)?\s*)?(?:tim(?:me|ma)?|h)\b/);
  if (m) return Number(m[1].replace(',', '.'));
  m = s.match(/(?:per\s*påbörjad(?:e)?\s*(\d+)\s*min(?:ut(?:er)?)?\s*[-–:]?\s*(\d+(?:[.,]\d+)?)\s*kr)|(?:(\d+(?:[.,]\d+)?)\s*kr\s*(?:\/|per)\s*(?:påbörjad(?:e)?\s*)?(\d+)\s*-?\s*min)/);
  if (m) { const min = Number(m[1] || m[4]); const kr = Number((m[2] || m[3]).replace(',', '.')); if (min > 0 && min <= 60) return Math.round((kr * 60 / min) * 100) / 100; }
  return null;
}

// ---------------- Stockholm Parkering ----------------
const SP = {
  id: 'stockholmparkering', kedja: 'Stockholm Parkering', host: 'https://www.stockholmparkering.se',
  async urls() { return (await sitemapUrls('https://www.stockholmparkering.se/facilitysitemap.xml')).filter((u) => /\/anlaggningar\/\d+\//.test(u)); },
  parse(h, url) {
    const block = h.slice(h.indexOf('id="facilitypage-details"'));
    let feat = {}; try { feat = JSON.parse(decodeEntities(attr(block, 'data-features') || '{}')); } catch { /* */ }
    const lat = num(attr(h, 'data-facility-lat')), lon = num(attr(h, 'data-facility-long'));
    const zon = [...h.matchAll(/facilitypage__zone-code-first">\s*([^<]+?)\s*</g)].map((m) => decodeEntities(m[1]).trim());
    const hoursLines = [...h.matchAll(/facilitypage__open-hours-item">\s*<strong>([^<]+)<\/strong>/g)].map((m) => decodeEntities(m[1]).trim());
    const taxa = [];
    for (const g of h.split('facilitypage__taxes-group"').slice(1)) {
      const head = decodeEntities((g.match(/taxes-group-heading">([^<]+)</) || [])[1] || '').trim();
      const items = [...g.matchAll(/taxes-item-bold">([^<]+)</g)].map((m) => decodeEntities(m[1]).trim());
      if (items.length) taxa.push(`${head}: ${items.join('; ')}`);
    }
    const label = decodeEntities((h.match(/facilitypage__info-label">([^<]+)</) || [])[1] || '').trim();
    const hojd = num(feat.maxVehicleHeight); const besok = feat.totalVisitorSpace;
    const ladd = (feat.loadingSpacesVisitors || 0) + (feat.loadingSpacesCarVisitors || 0) + (feat.fastLoadingSpaces || 0);
    return {
      namn: attr(block, 'data-facility-name'), typ_kalla: attr(block, 'data-facility-type'), kategori: label || null,
      gatuadress: attr(block, 'data-facility-address'), postnummer: null, ort: attr(block, 'data-facility-area-code'),
      lat, lon, oppettider: hoursFromSwedish(hoursLines), oppettider_text: hoursLines.join('; ') || null,
      kapacitet: besok ?? null, kapacitet_uthyrning: feat.totalPreRentedSpace ?? null, hojdbegransning: hojd ? hojd : null,
      laddplatser: ladd || null, handikapplatser: feat.totalDisabledSpaces ?? null, zonkod: zon.join(', ') || null,
      taxa: taxa.join(' | ') || null, taxa_per_timme: perTimme(taxa.find((t) => /^Besöksparkering/i.test(t)) || taxa[0]),
      avgift: taxa.length ? true : null, uppvarmd: feat.heatedFacility ?? null, plan: feat.totalLevels ?? null,
      besoksparkering: (besok || 0) > 0 || taxa.length > 0, webb: url,
    };
  },
};

// ---------------- Aimo Park ----------------
const AIMO = {
  id: 'aimo', kedja: 'Aimo Park', host: 'https://www.aimopark.se',
  async urls() {
    const all = (await sitemapUrls('https://www.aimopark.se/sitemap.xml')).filter((u) => /^https:\/\/www\.aimopark\.se\/stader\/[^/]+\/[^/]+\/?$/.test(u));
    return [...new Set(all.map((u) => u.replace(/\/?$/, '/')))];
  },
  parse(h, url) {
    const ld = jsonLd(h).find((x) => /ParkingFacility/.test([x['@type']].flat().join(','))) || {};
    const t = htmlToText(h.slice(Math.max(0, h.indexOf('<main'))));
    const fakta = (t.match(/Fakta\s*\n?([\s\S]{0,600}?)(?:Öppettider|Betalsätt|Abonnemang|$)/) || [])[1] || '';
    const f = (re) => { const m = fakta.match(re); return m ? m[1].trim() : null; };
    const zon = t.match(/Zonkod\s*(\d+)/);
    let taxa = null; const tm = t.match(/Parkeringstaxa\s*\n?([\s\S]{0,800}?)(?:Serviceavgift kan tillkomma|Denna anläggning|Fakta|Betalsätt)/);
    if (tm) taxa = tm[1].replace(/Zonkod\s*\d+\s*/, '').replace(/\s*\n\s*/g, '; ').replace(/;\s*;/g, ';').trim().replace(/^;\s*|;\s*$/g, '');
    const kortHours = (t.match(/Öppettider för korttidsparkering\s*\n?([\s\S]{0,300}?)(?:Abonnemang|Betalsätt|Parkeringstaxa|$)/) || [])[1] || null;
    const adr = ld.address || {};
    const name = attr(h, 'data-name') || decodeEntities(ld.name || '').replace(/,\s*[^,]+$/, '');
    const ladd = f(/Laddplatser:?\s*(\d+)/i) || f(/Antal laddplatser:?\s*(\d+)/i);
    const hkp = f(/(?:Handikapplatser|Platser för rörelsehindrade|Antal handikapplatser):?\s*(\d+)/i);
    return {
      namn: name, typ_kalla: /garage|p-hus|parkeringshus/i.test(name) ? 'garage' : yesNo(f(/Inomhus:?\s*(\S+)/)) ? 'inomhus' : null,
      gatuadress: decodeEntities(adr.streetAddress || '') || null, postnummer: adr.postalCode || null, ort: decodeEntities(adr.addressLocality || '') || null,
      lat: ld.geo?.latitude ?? num(attr(h, 'data-lat')), lon: ld.geo?.longitude ?? num(attr(h, 'data-lng')),
      oppettider: hoursFromSchema(ld.openingHoursSpecification), oppettider_text: kortHours ? kortHours.replace(/\s*\n\s*/g, ' ').trim() : null,
      kapacitet: num(f(/Antal parkeringsplatser:?\s*([\d\s]+)/)), hojdbegransning: num(f(/Inkörningshöjd:?\s*([\d,.]+)/)),
      laddplatser: ladd ? Number(ladd) : null, handikapplatser: hkp ? Number(hkp) : null,
      zonkod: zon ? zon[1] : null, taxa, taxa_per_timme: perTimme(taxa), avgift: taxa ? !/gratis|avgiftsfri/i.test(taxa) || /kr/.test(taxa) : null,
      inomhus: yesNo(f(/Inomhus:?\s*(\S+)/)), uppvarmd: yesNo(f(/Uppvärmd:?\s*(\S+)/)),
      besoksparkering: !!taxa && !/Ingen korttidsparkering/i.test(t), endast_uthyrning: /Ingen korttidsparkering/i.test(t), webb: url,
    };
  },
};

// ---------------- APCOA ----------------
const APCOA = {
  id: 'apcoa', kedja: 'APCOA', host: 'https://www.apcoa.se',
  async urls() { return [...new Set((await sitemapUrls('https://www.apcoa.se/sitemap.xml')).filter((u) => /^https:\/\/www\.apcoa\.se\/hitta-parkering\/parkering\/[^/]+\/[^/?#]+$/.test(u)))]; },
  parse(h, url) {
    const ld = jsonLd(h).find((x) => /ParkingFacility/.test([x['@type']].flat().join(','))) || {};
    const t = htmlToText(h.slice(Math.max(0, h.indexOf('<main'))));
    const adr = ld.address || {};
    const name = decodeEntities(ld.name || '');
    const typLabel = (t.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n?\\s*(Parkeringshus|Parkeringskällare|Parkeringsgarage|Markparkering|Utomhusparkering|Parkeringsplats|Garage|Ytparkering|Gatuparkering|Infartsparkering|Pendlarparkering)', 'i')) || [])[1] || null;
    let taxa = (t.match(/Parkeringstaxor\s*\n?([\s\S]{0,700}?)(?:Enklare parkering|Så här hittar du|Hitta vägen|Var parkerar du|Vad kostar|$)/) || [])[1] || null;
    if (taxa) taxa = taxa.split(/\n\s*Betalningsalternativ/i)[0].replace(/\s*\n\s*/g, '; ').replace(/^;\s*|;\s*$/g, '').trim() || null;
    const cap = t.match(/Totalt antal platser\s*(\d[\d\s]*)/); const hojd = t.match(/Maxhöjd\s*([\d,.]+)\s*m/i);
    const ladd = t.match(/(?:Electric Car Charging Spaces|Laddplatser(?: för elbil)?|Elbilsladdplatser)\s*(\d+)/i);
    const hkp = t.match(/(?:Disabled Spaces|Handikapplatser|Platser för rörelsehindrade|Parkering för rörelsehindrade)\s*(\d+)/i);
    return {
      namn: name || null, typ_kalla: typLabel,
      gatuadress: decodeEntities(adr.streetAddress || '') || null, postnummer: adr.postalCode || null, ort: decodeEntities(adr.addressLocality || '') || null,
      lat: ld.geo?.latitude ?? null, lon: ld.geo?.longitude ?? null, oppettider: hoursFromSchema(ld.openingHoursSpecification),
      kapacitet: cap ? num(cap[1]) : null, hojdbegransning: hojd ? num(hojd[1]) : null, laddplatser: ladd ? Number(ladd[1]) : null, handikapplatser: hkp ? Number(hkp[1]) : null,
      zonkod: (t.match(/(?:Zonkod|Zon(?:nummer)?|Områdeskod)\s*:?\s*(\d{3,6})/i) || [])[1] || null,
      taxa, taxa_per_timme: perTimme(taxa), avgift: taxa ? /kr|sek/i.test(taxa) : null,
      besoksparkering: !!taxa || !!cap, webb: url,
    };
  },
};

const OPS = { stockholmparkering: SP, aimo: AIMO, apcoa: APCOA };
const wanted = process.argv.slice(2).filter((a) => OPS[a]); const run = wanted.length ? wanted : Object.keys(OPS);

async function runOp(op) {
  const dir = ensureDir(path.join(RAW_DIR, 'operatorer', op.id));
  const stat = { operator: op.kedja, start: nowIso(), sidor: 0, cache: 0, fel: 0, blockerade: 0, utan_koordinat: 0 };
  let urls;
  try { urls = await op.urls(); } catch (e) { stat.fel_sitemap = e.message; console.warn(`[${op.id}] sitemap: ${e.message}`); return { stat, recs: [] }; }
  if (LIMIT) urls = urls.slice(0, LIMIT);
  stat.urls = urls.length; console.log(`[${op.id}] ${urls.length} anläggningssidor`);
  const recs = [];
  for (const [i, url] of urls.entries()) {
    const f = path.join(dir, crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + '.json');
    let rec = null;
    if (!process.env.FORCE && fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < TTL) { rec = readJson(f, null); stat.cache++; }
    else {
      try {
        const { text } = await fetchText(url, { timeoutMs: 45000, retries: 2 });
        rec = { ...op.parse(text, url), hamtad: nowIso() };
        writeJson(f, rec, false); stat.sidor++;
      } catch (e) {
        if (e instanceof BlockedError) { stat.blockerade++; console.warn(`[${op.id}] BLOCKERAD ${e.message}`); if (stat.blockerade >= 5) { stat.avbrutet = 'för många blockeringar - avbryter (inget kringgås)'; break; } }
        else { stat.fel++; if (stat.fel <= 10) console.warn(`[${op.id}] ${url}: ${e.message}`); }
        continue;
      }
    }
    if (rec && (rec.lat == null || rec.lon == null)) stat.utan_koordinat++;
    if (rec) recs.push(rec);
    if ((i + 1) % 200 === 0) console.log(`[${op.id}] ${i + 1}/${urls.length}`);
  }
  stat.klar = nowIso(); stat.poster = recs.length;
  return { stat, recs };
}

const results = await Promise.all(run.map((k) => runOp(OPS[k])));
const status = readJson(path.join(RAW_DIR, 'operatorer-status.json'), {});
for (const [i, k] of run.entries()) {
  const { stat, recs } = results[i];
  writeJson(path.join(RAW_DIR, `operator-${k}.json`), { hamtad: nowIso(), kedja: OPS[k].kedja, kalla: OPS[k].host, poster: recs }, false);
  status[k] = stat; console.log(`[${k}] klart: ${recs.length} poster (${stat.sidor} hämtade, ${stat.cache} cache, ${stat.fel} fel)`);
}
writeJson(path.join(RAW_DIR, 'operatorer-status.json'), status);
