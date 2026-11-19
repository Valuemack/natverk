// Fetches the official list of Sweden's 290 kommuner and 21 län (codes + names) from SCB's open PxWeb API.
// License: SCB open data, CC0 (https://www.scb.se/vara-tjanster/oppna-data/).
import path from 'node:path';
import { RAW, politeFetch, writeJson } from './lib.mjs';

const URL = 'https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0101/BE0101A/BefolkningNy';
const res = await politeFetch(URL, { headers: { Accept: 'application/json' } });
if (!res.ok) throw new Error(`SCB HTTP ${res.status}`);
const meta = await res.json();
const v = meta.variables.find((x) => x.code === 'Region');
const kommuner = [], lan = [];
v.values.forEach((code, i) => {
  if (code.length === 4) kommuner.push({ kod: code, namn: v.valueTexts[i] });
  else if (code.length === 2 && code !== '00') lan.push({ kod: code, namn: v.valueTexts[i] });
});
if (kommuner.length !== 290) console.warn(`WARNING: SCB returned ${kommuner.length} kommuner (expected 290)`);
writeJson(path.join(RAW, 'scb-kommuner.json'), { fetched: new Date().toISOString(), source: URL, kommuner, lan });
console.log(`SCB: ${kommuner.length} kommuner, ${lan.length} län`);
