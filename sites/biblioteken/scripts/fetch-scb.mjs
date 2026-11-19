// Fetch official kommun and län codes/names from SCB:s PxWeb API (open data, CC0).
// Output: data/raw/scb-regioner.json { kommuner: {"0180": "Stockholm", ...}, lan: {"01": "Stockholms län", ...} }
import path from 'node:path';
import { politeFetch, writeJSON, RAW } from './lib.mjs';

const URL = 'https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0101/BE0101A/BefolkningNy';
const res = await politeFetch(URL);
if (!res.ok) throw new Error(`SCB HTTP ${res.status}`);
const meta = await res.json();
const region = meta.variables.find((v) => v.code === 'Region');
const kommuner = {}, lan = {};
region.values.forEach((code, i) => {
  const name = region.valueTexts[i];
  if (/^\d{4}$/.test(code)) kommuner[code] = name;
  else if (/^\d{2}$/.test(code)) lan[code] = name;
});
if (Object.keys(kommuner).length < 290 || Object.keys(lan).length < 21) throw new Error('SCB region list incomplete');
writeJSON(path.join(RAW, 'scb-regioner.json'), { fetched: new Date().toISOString(), source: URL, license: 'CC0 (SCB öppna data)', kommuner, lan });
console.log(`wrote ${Object.keys(kommuner).length} kommuner, ${Object.keys(lan).length} län`);
