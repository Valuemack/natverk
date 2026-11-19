// Hämtar listor ur 1177.se Hitta vård per vårdtyp (caretype):
//   "Vårdcentral"     -> data/raw/1177-lista.json   (huvudlistan)
//   "Närakut"         -> data/raw/1177-narakut.json (för extra.narakut)
//   "Jourmottagning"  -> data/raw/1177-jour.json    (för extra.jourmottagning)
// Sökresultatet är serverrenderat (öppet API finns bara för regioner). robots.txt för
// 1177.se tillåter /hitta-vard/. Takt: högst 1 anrop/s.
import path from 'node:path';
import { RAW_DIR, politeFetch, writeJson, nowIso } from './lib.mjs';
import { preloadedState, searchUrl } from './lib1177.mjs';

const BATCH = 100;
const LISTS = [
  { caretype: 'Vårdcentral', file: '1177-lista.json', min: 1000 },
  { caretype: 'Närakut', file: '1177-narakut.json', min: 50 },
  { caretype: 'Jourmottagning', file: '1177-jour.json', min: 50 },
];

for (const { caretype, file, min } of LISTS) {
  const hits = new Map();
  let total = null;
  for (let page = 1; page < 100; page++) {
    const url = searchUrl(page, BATCH, caretype);
    const r = await politeFetch(url, { minIntervalMs: 1200 });
    if (!r.ok) throw new Error(`HTTP ${r.status} för ${url}`);
    const res = preloadedState(await r.text()).Content.SearchResult;
    total = res.TotalHits;
    for (const h of res.SearchHits) hits.set(h.HsaId, h);
    console.log(`${caretype} sida ${page}: ${res.SearchHits.length} träffar (totalt ${hits.size}/${total})`);
    if (!res.SearchHits.length || hits.size >= total || !res.NextPage) break;
  }
  if (hits.size < Math.max(min, total * 0.98)) throw new Error(`${caretype}: fick bara ${hits.size} av ${total} – avbryter så att gammal lista inte skrivs över`);
  writeJson(path.join(RAW_DIR, file), { hamtad: nowIso(), caretype, kalla: searchUrl(1, BATCH, caretype), totalHits: total, enheter: [...hits.values()] });
  console.log(`Klart: ${hits.size} enheter med vårdtyp ${caretype}`);
}
