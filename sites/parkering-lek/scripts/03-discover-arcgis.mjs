// Söker i ArcGIS Hub (hub.arcgis.com, robots.txt: Crawl-delay 60 -> en fråga per minut) efter kommunala
// Feature Services om lekplatser och parkering inom Sveriges bbox. Sparar data/raw/katalog-arcgis.json.
// Vilka tjänster som används väljs automatiskt i 04-fetch-arcgis.mjs (officiell utgivare + titelfilter).
import path from 'node:path';
import { RAW_DIR, fetchText, writeJson, readJson, nowIso } from './lib.mjs';

const QUERIES = { lek: ['lekplatser', 'lekplats', 'temalekplats'], park: ['parkering', 'parkeringsplatser', 'pendlarparkering', 'infartsparkering', 'parkeringshus'] };
const out = readJson(path.join(RAW_DIR, 'katalog-arcgis.json'), { items: {} });
for (const [tema, qs] of Object.entries(QUERIES)) for (const q of qs) {
  for (let start = 1; start < 400; start += 100) {
    const url = `https://hub.arcgis.com/api/search/v1/collections/dataset/items?q=${encodeURIComponent(q)}&bbox=10.5,55,24.2,69.1&limit=100&startindex=${start}`;
    let j; try { j = JSON.parse((await fetchText(url, { timeoutMs: 90000 })).text); } catch (e) { console.warn(q, e.message); break; }
    for (const f of j.features || []) {
      const p = f.properties;
      if (!/Feature Service|Map Service|Feature Layer/i.test(p.type) || !p.url) continue;
      const id = p.id || f.id; out.items[id] = { tema, id, titel: p.title, utgivare: p.source || p.orgName || p.owner, agare: p.owner, url: p.url, typ: p.type,
        licens: (p.licenseInfo || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || null,
        beskrivning: (p.snippet || '').slice(0, 200), andrad: p.modified ? new Date(p.modified).toISOString().slice(0, 10) : null };
    }
    console.log(`[${tema}] ${q} @${start}: ${j.features?.length || 0} (totalt ${j.numberMatched})`);
    if (!j.features?.length || start + 100 > (j.numberMatched || 0)) break;
  }
}
out.hamtad = nowIso();
writeJson(path.join(RAW_DIR, 'katalog-arcgis.json'), out);
console.log('Klart:', Object.keys(out.items).length, 'tjänster');
