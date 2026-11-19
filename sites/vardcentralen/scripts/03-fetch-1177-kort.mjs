// Hämtar 1177.se-kontaktkortet för varje vårdcentral i 1177-lista.json (öppettider,
// postadress, webbplats, drop-in, ägarform m.m.). Cachas per HSA-id i data/raw/1177-kort/.
// Enheter som classify.mjs utesluter (fysioterapi, samtalsmottagning m.m.) hämtas inte.
// Takt: högst 1 anrop/s. Flaggor:
//   --max-age-h=20   hämta om kort äldre än så (standard 20 h => allt förnyas varje natt)
//   --limit=N        hämta högst N kort denna körning (för test)
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, politeFetch, readJson, writeJson, ensureDir, nowIso } from './lib.mjs';
import { preloadedState, cardUrl, compactCard, CARD_SCHEMA } from './lib1177.mjs';
import { isExcluded } from './classify.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
const maxAgeMs = arg('max-age-h', 20) * 3600e3;
const limit = arg('limit', Infinity);
const dir = ensureDir(path.join(RAW_DIR, '1177-kort'));
const lista = readJson(path.join(RAW_DIR, '1177-lista.json'));

let fetched = 0, skipped = 0, failed = 0;
for (const h of lista.enheter.filter((x) => !isExcluded(x.Heading))) {
  const f = path.join(dir, h.HsaId.replace(/[^A-Za-z0-9_-]/g, '_') + '.json');
  if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < maxAgeMs && readJson(f, {}).schema === CARD_SCHEMA) { skipped++; continue; }
  if (fetched >= limit) break;
  const url = cardUrl(h.HsaId);
  try {
    const r = await politeFetch(url, { minIntervalMs: 1100 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const st = preloadedState(await r.text());
    const card = st.Content?.Card;
    if (!card || card.HsaId !== h.HsaId) throw new Error('kortet saknas eller fel HSA-id');
    writeJson(f, { schema: CARD_SCHEMA, hamtad: nowIso(), url, kanonisk: h.Url ? 'https://www.1177.se' + h.Url : null, card: compactCard(card) });
    fetched++;
    if (fetched % 50 === 0) console.log(`${fetched} kort hämtade (${skipped} färska i cache)`);
  } catch (e) {
    failed++;
    console.warn(`  ! ${h.HsaId} ${h.Heading}: ${e.message}`);
  }
}
console.log(`Klart: ${fetched} hämtade, ${skipped} från cache, ${failed} misslyckades`);
