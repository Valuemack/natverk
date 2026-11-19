// Official list of Sweden's 290 kommuner + 21 län (codes and names) from SCB's open PxWeb API (CC0).
// Writes data/ref/kommunlista.json. One request; re-fetches at most once per 30 days.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from './lib/http.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'ref', 'kommunlista.json');
const URL_ = 'https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0101/BE0101A/BefolkningNy';

if (fs.existsSync(OUT) && Date.now() - fs.statSync(OUT).mtimeMs < 30 * 86400e3 && !process.argv.includes('--force')) {
  console.log('kommunlista.json is fresh');
} else {
  const d = await get(URL_, { type: 'json' });
  const v = d.variables.find(x => x.code === 'Region');
  const lan = {}, kommuner = [];
  v.values.forEach((code, i) => {
    if (code.length === 2 && code !== '00') lan[code] = v.valueTexts[i];
    if (code.length === 4) kommuner.push({ kod: code, namn: v.valueTexts[i] });
  });
  for (const k of kommuner) k.lan = lan[k.kod.slice(0, 2)] ?? null;
  if (kommuner.length < 280) throw new Error(`unexpected kommun count ${kommuner.length}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ source: URL_, license: 'SCB open data (CC0)', fetched: new Date().toISOString(), lan, kommuner }, null, 1));
  console.log(`kommunlista.json: ${kommuner.length} kommuner, ${Object.keys(lan).length} län`);
}
